#!/usr/bin/env bash
# Baseline published image on 8080, feature git ref built on 8081.
# Both stores get the same sample catalog and the same primed starting state.
#
#   demo/compare.sh
#   demo/compare.sh demo/golden-free-shipping-bar
#   demo/compare.sh f2s/run-123
#
# With no argument the feature port is the golden free-shipping bar branch.
# Run demo/prebuild.sh first so this only starts containers.
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="${1:-demo/golden-free-shipping-bar}"

# Do not inherit a DEMO_IMAGE from the shell; baseline is the published
# image and the feature port is built from the ref.
unset DEMO_IMAGE || true

echo "Baseline on 8080 (published image)."
"$DEMO_DIR/up.sh" baseline 8080

echo "Feature on 8081 (${REF})."
"$DEMO_DIR/up.sh" feature 8081 "$REF"

cat <<EOF

Side by side:
  Baseline  http://127.0.0.1:8080
  Feature   http://127.0.0.1:8081   (${REF})
  Admin     admin@yourStore.com / Demo123!
  Baseline  free shipping over \$75, bar off
  Feature   free shipping over \$75, bar on
  Carts     empty until you add something
EOF
