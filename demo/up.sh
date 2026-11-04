#!/usr/bin/env bash
# Bring up a nopCommerce demo storefront with sample data.
#
#   demo/up.sh <label> <port>
#
# <label> names the instance (baseline, feature, a branch name). It does not
# compile that branch. The web container runs the published nopCommerce image
# so the demo does not need NuGet. To show a feature build, set DEMO_IMAGE to
# an image you already have and use a second port.
#
#   demo/up.sh baseline 8080
#   DEMO_IMAGE=nopdemo:my-feature demo/up.sh feature 8081
#
# One numeric argument is the port and the label defaults to baseline:
#   demo/up.sh 8080
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
demo_load_defaults

demo_print_footer() {
  local base="$1"
  cat <<EOF

  Storefront   ${base}
  Admin        ${base}/admin
  Email        ${DEMO_ADMIN_EMAIL}
  Password     ${DEMO_ADMIN_PASSWORD}
  Database     postgres, db ${DEMO_SQL_DATABASE}, user ${DEMO_SQL_USER} (hostname database)
  Free shipping over \$${DEMO_FREE_SHIPPING_OVER_X:-75} (seeded on install and reset)
  Reset        demo/reset.sh ${PORT}
EOF
}

LABEL="${1:-baseline}"
PORT="${2:-$DEMO_DEFAULT_PORT}"
if [[ "$LABEL" =~ ^[0-9]+$ && -z "${2:-}" ]]; then
  PORT="$LABEL"
  LABEL="baseline"
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "Port must be a number. Usage: demo/up.sh <label> <port>" >&2
  exit 1
fi

IMAGE="${DEMO_IMAGE:-nopcommerceteam/nopcommerce:latest}"
STATE="$(demo_write_state "$PORT" "$LABEL" "$IMAGE")"
BASE="http://127.0.0.1:${PORT}"

echo "Starting ${LABEL} on ${BASE}"
echo "Image: ${IMAGE}"
demo_compose "$STATE" up -d

echo "Waiting for the web container..."
demo_wait_http "${BASE}/install" 90 || demo_wait_http "$BASE" 30

if ! demo_storefront_ready "$BASE"; then
  echo "Installing sample catalog..."
  # shellcheck disable=SC1090
  set -a
  source "$STATE"
  set +a
  python3 "$DEMO_DIR/install_store.py" "$BASE"

  echo "Waiting for the storefront after install..."
  ready=0
  for _ in $(seq 1 90); do
    if demo_storefront_ready "$BASE"; then
      ready=1
      break
    fi
    sleep 2
  done

  if [[ "$ready" -ne 1 ]]; then
    echo "Install finished but ${BASE} is not serving the storefront yet." >&2
    echo "Recent web logs:" >&2
    demo_compose "$STATE" logs --tail 40 web >&2 || true
    exit 1
  fi
fi

echo "Applying the free-shipping demo seed..."
"$DEMO_DIR/seed_free_shipping.sh" "$STATE"

echo "Storefront is up: ${BASE}"
demo_print_footer "$BASE"
