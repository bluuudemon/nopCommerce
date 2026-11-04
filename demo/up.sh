#!/usr/bin/env bash
# Bring up a nopCommerce demo storefront with sample data, then prime it.
#
#   demo/up.sh <name> <port> [git-ref]
#
# No git ref: use the published nopCommerce image (the baseline path).
# A git ref, and no DEMO_IMAGE in the environment: build that ref with the
# repository Dockerfile and run the image. An explicit DEMO_IMAGE skips
# the build.
#
#   demo/up.sh baseline 8080
#   demo/up.sh feature 8081 f2s/run-123
#   demo/up.sh 8080
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

CALLER_IMAGE=""
CALLER_IMAGE_SET=0
if [[ -n "${DEMO_IMAGE:-}" ]]; then
  CALLER_IMAGE="$DEMO_IMAGE"
  CALLER_IMAGE_SET=1
fi
demo_load_defaults

demo_print_footer() {
  local base="$1"
  cat <<EOF

  Storefront   ${base}
  Admin        ${base}/admin
  Email        ${DEMO_ADMIN_EMAIL}
  Password     ${DEMO_ADMIN_PASSWORD}
  Database     postgres, db ${DEMO_SQL_DATABASE}, user ${DEMO_SQL_USER} (hostname database)
  Image        ${IMAGE}
  Reset        demo/reset.sh ${PORT}
  Prime        demo/prime.sh ${PORT}
EOF
}

LABEL="${1:-baseline}"
PORT="${2:-$DEMO_DEFAULT_PORT}"
REF="${3:-}"
if [[ "$LABEL" =~ ^[0-9]+$ && -z "${2:-}" ]]; then
  PORT="$LABEL"
  LABEL="baseline"
  REF=""
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "Port must be a number. Usage: demo/up.sh <name> <port> [git-ref]" >&2
  exit 1
fi

if [[ "$CALLER_IMAGE_SET" -eq 1 ]]; then
  IMAGE="$CALLER_IMAGE"
elif [[ -n "$REF" ]]; then
  IMAGE="$("$DEMO_DIR/build-image.sh" "$REF")"
else
  IMAGE="${DEMO_IMAGE:-nopcommerceteam/nopcommerce:latest}"
fi

STATE="$(demo_write_state "$PORT" "$LABEL" "$IMAGE")"
# demo.env exports DEMO_IMAGE into this shell, and Compose lets the shell
# override --env-file. Export the image we actually chose or the feature
# port keeps running the published baseline image.
export DEMO_IMAGE="$IMAGE"
export DEMO_PORT="$PORT"
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

if [[ "$LABEL" == "feature" || "$PORT" == "8081" ]]; then
  "$DEMO_DIR/prime.sh" "$PORT" feature
else
  "$DEMO_DIR/prime.sh" "$PORT" baseline
fi
echo "Storefront is up: ${BASE}"
demo_print_footer "$BASE"
