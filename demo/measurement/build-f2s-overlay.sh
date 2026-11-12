#!/usr/bin/env bash
# Build feature overlay on nopcommerceteam/nopcommerce:latest (QA-style: minimal DLL swap).
# Requires nopdemo:sha-e3ba85b324bb (demo/build-image.sh f2s/F2S-1110-1 @ e3ba85b).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAG="${1:-nopdemo:f2s-1110-1-overlay-publish}"
cd "$ROOT"
docker build -f demo/measurement/Dockerfile.f2s-feature-publish -t "$TAG" .
echo "$TAG"
