#!/usr/bin/env bash
# Build a feature image ahead of the demo so compare.sh only has to start it.
# Defaults to the golden free-shipping bar branch.
#
#   demo/prebuild.sh
#   demo/prebuild.sh demo/golden-free-shipping-bar
#   demo/prebuild.sh f2s/run-123
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${1:-demo/golden-free-shipping-bar}"
# build-image.sh fetches REF and resolves FETCH_HEAD, origin/<ref>, or a sha.
IMAGE="$("$DEMO_DIR/build-image.sh" "$REF")"
echo "Prebuilt ${REF} as ${IMAGE}"
