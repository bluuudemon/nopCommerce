#!/usr/bin/env bash
# Build a storefront image for a git ref with the repository Dockerfile.
# Logs go to stderr. The image tag is the only stdout line.
#
#   demo/build-image.sh <git-ref>
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEMO_DIR/.." && pwd)"
REF="${1:?usage: demo/build-image.sh <git-ref>}"

cd "$ROOT"
# A clone made before this branch was pushed has no local ref. Fetch it
# into the origin remote-tracking ref, then resolve that. A plain SHA or
# HEAD still resolves locally when the fetch does not apply.
echo "Fetching ${REF} from origin." >&2
git fetch origin "refs/heads/${REF}:refs/remotes/origin/${REF}" >&2 || true
if git rev-parse --verify --quiet "refs/remotes/origin/${REF}^{commit}" >/dev/null; then
  SHA="$(git rev-parse "refs/remotes/origin/${REF}^{commit}")"
elif git rev-parse --verify --quiet "${REF}^{commit}" >/dev/null; then
  SHA="$(git rev-parse "${REF}^{commit}")"
else
  echo "Could not resolve ${REF}. It is not on origin and not in this clone." >&2
  exit 1
fi
SHORT="$(git rev-parse --short=12 "$SHA")"
IMAGE="nopdemo:sha-${SHORT}"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Reusing cached image ${IMAGE} (${REF} @ ${SHORT})." >&2
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

SAFE_REF="$(printf '%s' "$REF" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_.-' '-')"
REF_TAG="nopdemo:ref-${SAFE_REF}"

echo "Building ${IMAGE} from ${REF} with the repository Dockerfile." >&2
DOCKER_BUILDKIT=1 docker build \
  -f "$WORK/Dockerfile" \
  -t "$IMAGE" \
  -t "$REF_TAG" \
  "$WORK" >&2

echo "$IMAGE"
