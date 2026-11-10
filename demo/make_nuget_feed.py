#!/usr/bin/env python3
"""Build a local NuGet folder from a published nopCommerce /app directory.

The feed is only used when the demo image has to be compiled without
reaching api.nuget.org. Package versions and files come from the deps.json
graphs shipped in the published app and its plugins.
"""

import json
import os
import sys
import zipfile
from xml.sax.saxutils import escape


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: make_nuget_feed.py <published-app-dir> <feed-dir>", file=sys.stderr)
        return 2
    app_dir = os.path.abspath(sys.argv[1])
    feed_dir = os.path.abspath(sys.argv[2])
    os.makedirs(feed_dir, exist_ok=True)

    graphs = []
    for dirpath, _, filenames in os.walk(app_dir):
        for name in filenames:
            if name.endswith(".deps.json"):
                graphs.append(os.path.join(dirpath, name))
    if not graphs:
        print(f"No deps.json under {app_dir}", file=sys.stderr)
        return 1

    by_basename = {}
    by_suffix = {}
    for dirpath, _, filenames in os.walk(app_dir):
        for name in filenames:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, app_dir).replace(os.sep, "/")
            by_basename.setdefault(name, []).append((rel, full))
            by_suffix[rel] = full

    packages = {}
    for path in graphs:
        try:
            data = json.load(open(path, encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        targets = data.get("targets") or {}
        if not targets:
            continue
        tf = next(iter(targets))
        libraries = data.get("libraries") or {}
        for key, info in targets[tf].items():
            if "/" not in key:
                continue
            lib = libraries.get(key) or {}
            if lib.get("type", "package") not in ("package", None):
                continue
            pkg = packages.setdefault(key, {"deps": {}, "files": set(), "compile_only": False})
            if info.get("compileOnly"):
                pkg["compile_only"] = True
            for dep_id, dep_ver in (info.get("dependencies") or {}).items():
                pkg["deps"][dep_id] = dep_ver
            for section in ("runtime", "compile", "native", "runtimeTargets", "resource"):
                for rel in (info.get(section) or {}):
                    pkg["files"].add(rel.replace("\\", "/"))

    written = 0
    missing = []
    for key, pkg in sorted(packages.items()):
        pkg_id, version = key.rsplit("/", 1)
        blob = {}
        for rel in sorted(pkg["files"]):
            # compileOnly entries are already in the shared framework.
            # Shipping them again duplicates types such as ColorTranslator.
            if pkg["compile_only"] and not rel.startswith("runtimes/"):
                continue
            if pkg_id == "System.Drawing.Common" and (rel.startswith("ref/") or rel.startswith("lib/")):
                continue
            found = _resolve(rel, by_suffix, by_basename)
            if found:
                blob[rel] = found
                continue
            if _optional(rel) or pkg["compile_only"]:
                continue
            missing.append(f"{key} {rel}")

        native_props = _native_props(pkg_id, blob)
        nupkg_path = os.path.join(feed_dir, f"{pkg_id.lower()}.{version}.nupkg")
        _write_nupkg(nupkg_path, pkg_id, version, pkg["deps"], blob, native_props)
        written += 1

    print(f"Wrote {written} packages to {feed_dir}", file=sys.stderr)
    if missing:
        print(f"{len(missing)} non-optional files were not in the published app:", file=sys.stderr)
        for line in missing[:40]:
            print("  " + line, file=sys.stderr)
    return 0


def _resolve(rel, by_suffix, by_basename):
    """Pick the published file for a package path.

    Prefer an exact relative path. For ref assemblies, prefer the flat
    refs/ folder the published app uses. Do not substitute a runtime
    implementation assembly for a ref assembly: that is how
    System.Drawing.Common 4.x collided with System.Drawing.Primitives.
    """
    if rel in by_suffix:
        return by_suffix[rel]
    base = os.path.basename(rel)
    candidates = by_basename.get(base) or []
    if rel.startswith("ref/"):
        for cand_rel, full in candidates:
            if cand_rel == f"refs/{base}" or cand_rel.endswith(f"/refs/{base}"):
                return full
        return None
    if rel.startswith("lib/") or rel.startswith("runtimes/"):
        for cand_rel, full in candidates:
            if cand_rel.endswith("/" + rel) or cand_rel == rel:
                return full
        for cand_rel, full in candidates:
            if "/refs/" in f"/{cand_rel}":
                continue
            if "netcoreapp3.0" in cand_rel and "netcoreapp3.0" not in rel:
                continue
            return full
        return None
    for _, full in candidates:
        return full
    return None


def _optional(rel: str) -> bool:
    lowered = rel.lower()
    if lowered.endswith(".pdb"):
        return True
    markers = (
        "runtimes/win",
        "runtimes/osx",
        "runtimes/browser",
        "runtimes/android",
        "runtimes/ios",
        "runtimes/maccatalyst",
        "/win-x",
        "/win-arm",
        "/osx",
    )
    return any(marker in lowered for marker in markers)


def _native_props(pkg_id: str, blob: dict) -> str:
    linux = [
        rel for rel in blob
        if "/linux-x64/native/" in rel or rel.endswith(".so") and "runtimes/linux" in rel
    ]
    # Keep only linux-x64 .so files. Other architectures are unnecessary here.
    linux = [rel for rel in linux if "linux-x64/native/" in rel and rel.endswith(".so")]
    if not linux:
        return ""
    items = []
    for rel in linux:
        name = os.path.basename(rel)
        items.append(
            "    <Content Include=\"$(MSBuildThisFileDirectory)../"
            + rel
            + "\">\n"
            + f"      <Link>runtimes/linux-x64/native/{name}</Link>\n"
            + "      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>\n"
            + "      <CopyToPublishDirectory>PreserveNewest</CopyToPublishDirectory>\n"
            + "    </Content>"
        )
    body = "\n".join(items)
    return (
        "<Project>\n  <ItemGroup>\n"
        + body
        + "\n  </ItemGroup>\n</Project>\n"
    )


def _write_nupkg(path, pkg_id, version, deps, blob, native_props) -> None:
    dep_xml = ""
    if deps:
        lines = [
            f'      <dependency id="{escape(dep_id)}" version="{escape(dep_ver)}" />'
            for dep_id, dep_ver in sorted(deps.items())
        ]
        dep_xml = (
            "    <dependencies>\n"
            "      <group targetFramework=\"net10.0\">\n"
            + "\n".join(lines)
            + "\n      </group>\n"
            "    </dependencies>\n"
        )
    nuspec = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<package>\n  <metadata>\n"
        f"    <id>{escape(pkg_id)}</id>\n"
        f"    <version>{escape(version)}</version>\n"
        "    <authors>nopCommerce demo offline feed</authors>\n"
        "    <description>Reassembled from a published nopCommerce app for offline demo builds.</description>\n"
        + dep_xml
        + "  </metadata>\n</package>\n"
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{pkg_id}.nuspec", nuspec)
        for rel, source in blob.items():
            zf.write(source, rel)
        if native_props:
            zf.writestr(f"buildTransitive/{pkg_id}.props", native_props)


if __name__ == "__main__":
    sys.exit(main())
