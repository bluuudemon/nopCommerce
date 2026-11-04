#!/usr/bin/env bash
# Build a storefront image for a git ref with the repository Dockerfile.
# Logs go to stderr. The image tag is the only stdout line.
#
#   demo/build-image.sh <git-ref>
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
REF="${1:?usage: demo/build-image.sh <git-ref>}"

cd "$ROOT"
# compare.sh and prebuild.sh both come through here. The branch may not
# exist locally; demo_resolve_ref reads FETCH_HEAD after the fetch.
SHA="$(demo_resolve_ref "$REF")"
SHORT="$(git rev-parse --short=12 "$SHA")"
IMAGE="nopdemo:sha-${SHORT}"
SAFE_REF="$(printf '%s' "$REF" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_.-' '-')"
REF_TAG="nopdemo:ref-${SAFE_REF}"

# Nop.Web turns on Razor runtime compilation. A publish from this Dockerfile
# does not include the reference assemblies the compiler needs, so the
# storefront returns 500. Copy them from the published nopCommerce image,
# which already ships a working /app/refs and a deps.json with compile
# entries. The app assemblies stay the ones this commit built.
demo_publish_razor_refs() {
  local image="$1"
  if docker run --rm --entrypoint sh "$image" -c 'test -f /app/.demo-razor-refs'; then
    docker tag "$image" "$REF_TAG"
    return 0
  fi
  local published="nopcommerceteam/nopcommerce:latest"
  if ! docker image inspect "$published" >/dev/null 2>&1; then
    echo "Published image ${published} is required so Razor can compile views." >&2
    exit 1
  fi
  echo "Copying reference assemblies into ${image} so views can compile." >&2
  local tmp src dst list path
  tmp="$(mktemp -d)"
  src="$(docker create "$published")"
  docker cp "$src:/app/refs" "$tmp/refs"
  docker cp "$src:/app/Nop.Web.deps.json" "$tmp/Nop.Web.deps.json"
  docker rm "$src" >/dev/null
  printf 'ok\n' >"$tmp/.demo-razor-refs"

  list="$(docker run --rm --entrypoint sh "$image" -c 'find /app/Plugins -name Nop.Web.deps.json')"
  dst="$(docker create "$image")"
  docker cp "$tmp/refs" "$dst:/app/refs"
  docker cp "$tmp/Nop.Web.deps.json" "$dst:/app/Nop.Web.deps.json"
  local asm
  for asm in Nop.Web.dll Nop.Web.Framework.dll Nop.Core.dll Nop.Services.dll Nop.Data.dll; do
    docker cp "$dst:/app/$asm" "$tmp/$asm"
    docker cp "$tmp/$asm" "$dst:/app/refs/$asm"
  done
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    docker cp "$tmp/Nop.Web.deps.json" "$dst:$path"
  done <<<"$list"
  docker cp "$tmp/.demo-razor-refs" "$dst:/app/.demo-razor-refs"
  docker commit "$dst" "$image" >/dev/null
  docker rm "$dst" >/dev/null

  # docker cp lands files as root. Hand them to the app user, then put the
  # original entrypoint back. Commit would otherwise keep this shell.
  dst="$(docker create --user root --entrypoint sh "$image" -c 'chown -R app:app /app/refs /app/Nop.Web.deps.json /app/.demo-razor-refs && find /app/Plugins -name Nop.Web.deps.json -exec chown app:app {} \;')"
  docker start -a "$dst" >/dev/null
  docker commit \
    --change 'USER app' \
    --change 'WORKDIR /app' \
    --change 'ENTRYPOINT ["dotnet", "Nop.Web.dll"]' \
    "$dst" "$image" >/dev/null
  docker rm "$dst" >/dev/null
  rm -rf "$tmp"
  docker tag "$image" "$REF_TAG"
}

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Reusing cached image ${IMAGE} (${REF} @ ${SHORT})." >&2
  demo_publish_razor_refs "$IMAGE"
  echo "$IMAGE"
  exit 0
fi

SDK_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0-alpine"
ASPNET_IMAGE="mcr.microsoft.com/dotnet/aspnet:10.0-alpine"
if ! docker image inspect "$SDK_IMAGE" >/dev/null 2>&1 \
  || ! docker image inspect "$ASPNET_IMAGE" >/dev/null 2>&1; then
  echo "Pulling .NET base images named by the repository Dockerfile." >&2
  if ! timeout 60 docker pull "$SDK_IMAGE" >&2 || ! timeout 60 docker pull "$ASPNET_IMAGE" >&2; then
    echo "Base image pull failed. Building local stand-ins so the repository Dockerfile can still run." >&2
    "$DEMO_DIR/prepare-offline-bases.sh" >&2
  fi
fi

WORK_ROOT="$ROOT/.demo-worktrees"
WORK="$WORK_ROOT/$SHORT"
mkdir -p "$WORK_ROOT"
if [[ ! -d "$WORK/.git" && ! -f "$WORK/.git" ]]; then
  echo "Checking out ${REF} (${SHORT}) for the image build." >&2
  git worktree add --detach "$WORK" "$SHA" >&2
else
  git -C "$WORK" checkout --detach "$SHA" >&2
fi

# The solution includes Nop.Tests. Those packages are not part of the
# storefront. Drop them from this build copy so an offline feed of the
# published app is enough. A machine that can reach NuGet still builds
# the same storefront projects.
cat >"$WORK/src/Directory.Build.targets" <<'EOF'
<Project>
  <!-- Class libraries use Microsoft.NET.Sdk. The ASP.NET reference assemblies
       still have to be on the compile. The shared framework provides them. -->
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
  <!-- Nop.Web ships views for runtime compilation. Precompile them in the
       demo image so the storefront does not need the targeting packs at runtime. -->
  <PropertyGroup>
    <RazorCompileOnPublish>true</RazorCompileOnPublish>
  </PropertyGroup>
  <ItemGroup Condition="$(MSBuildProjectDirectory.Contains('Tests'))">
    <PackageReference Remove="@(PackageReference)" />
    <Compile Remove="@(Compile)" />
    <EmbeddedResource Remove="@(EmbeddedResource)" />
    <None Remove="@(None)" />
    <Content Remove="@(Content)" />
  </ItemGroup>
</Project>
EOF

echo "Building ${IMAGE} from ${REF} with the repository Dockerfile." >&2
DOCKER_BUILDKIT=1 docker build \
  -f "$WORK/Dockerfile" \
  -t "$IMAGE" \
  -t "$REF_TAG" \
  "$WORK" >&2

demo_publish_razor_refs "$IMAGE"
echo "$IMAGE"
