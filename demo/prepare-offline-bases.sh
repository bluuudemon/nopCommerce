#!/usr/bin/env bash
# Create local stand-ins for the two images named in the repository Dockerfile.
# build-image.sh runs this only when DEMO_OFFLINE_BASE=1. A presenter Mac
# does not: it docker-pulls the real base images and docker-builds the ref.
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="$DEMO_DIR/.cache"
APP="$CACHE/published-app"
STAGE="$CACHE/offline-base"
SDK_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0-alpine"
ASPNET_IMAGE="mcr.microsoft.com/dotnet/aspnet:10.0-alpine"

if docker image inspect "$SDK_IMAGE" >/dev/null 2>&1 \
  && docker image inspect "$ASPNET_IMAGE" >/dev/null 2>&1; then
  echo "Offline base images are already present." >&2
  exit 0
fi

if [[ ! -d /usr/share/dotnet ]]; then
  echo "DEMO_OFFLINE_BASE=1 needs a host .NET SDK at /usr/share/dotnet." >&2
  exit 1
fi

echo "Preparing offline .NET base images for the repository Dockerfile." >&2
mkdir -p "$CACHE"
if [[ ! -f "$APP/Nop.Web.dll" ]]; then
  echo "Copying a published nopCommerce app to recover package files." >&2
  cid="$(docker create nopcommerceteam/nopcommerce:latest)"
  rm -rf "$APP"
  docker cp "$cid:/app" "$APP"
  docker rm "$cid" >/dev/null
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/nuget-feed"
python3 "$DEMO_DIR/make_nuget_feed.py" "$APP" "$STAGE/nuget-feed"
cp "$DEMO_DIR/NuGet.offline.config" "$STAGE/NuGet.Config"
cp "$DEMO_DIR/offline-base.Dockerfile" "$STAGE/Dockerfile"

if [[ ! -f /tmp/dotnet-debs/libicu74.deb ]]; then
  curl -fL --retry 3 --max-time 120 \
    -o /tmp/libicu74.deb \
    http://mirrors.kernel.org/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3.1_amd64.deb
  mkdir -p /tmp/dotnet-debs
  cp /tmp/libicu74.deb /tmp/dotnet-debs/libicu74.deb
fi
cp /tmp/dotnet-debs/libicu74.deb "$STAGE/libicu74.deb"

echo "Copying the local .NET SDK into the base image context." >&2
rm -rf "$STAGE/dotnet"
mkdir -p "$STAGE/dotnet"
# BSD cp has no -a, and "dir/." fails when dir is missing. Copy the tree
# from inside the SDK directory so the files land in $STAGE/dotnet.
(
  cd /usr/share/dotnet
  cp -R . "$STAGE/dotnet/"
)

echo "Building offline base image." >&2
docker build -t nopdemo-offline-base:local "$STAGE"
docker tag nopdemo-offline-base:local "$SDK_IMAGE"
docker tag nopdemo-offline-base:local "$ASPNET_IMAGE"
docker run --rm nopdemo-offline-base:local dotnet --info >/dev/null
echo "Offline base images are ready." >&2
