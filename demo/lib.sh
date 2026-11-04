#!/usr/bin/env bash
# Shared helpers for the demo scripts. Sourced, not executed.
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEMO_DIR/.." && pwd)"
STATE_DIR="$DEMO_DIR/.state"

demo_load_defaults() {
  # Keep an explicit DEMO_IMAGE from the caller. demo.env only fills it in
  # when the caller did not set one.
  local preset_image="${DEMO_IMAGE-}"
  local image_was_set=0
  if [[ -n "${DEMO_IMAGE+x}" ]]; then
    image_was_set=1
  fi
  local preset_threshold="${DEMO_FREE_SHIPPING_OVER_X-}"
  local threshold_was_set=0
  if [[ -n "${DEMO_FREE_SHIPPING_OVER_X+x}" ]]; then
    threshold_was_set=1
  fi
  # shellcheck disable=SC1091
  set -a
  source "$DEMO_DIR/demo.env"
  set +a
  if [[ "$image_was_set" -eq 1 ]]; then
    DEMO_IMAGE="$preset_image"
  fi
  if [[ "$threshold_was_set" -eq 1 ]]; then
    DEMO_FREE_SHIPPING_OVER_X="$preset_threshold"
  fi
}

demo_state_file() {
  echo "$STATE_DIR/$1.env"
}

demo_compose() {
  local state="$1"
  shift
  docker compose \
    --project-name "$(demo_project_from_state "$state")" \
    --env-file "$state" \
    -f "$DEMO_DIR/docker-compose.yml" \
    "$@"
}

demo_project_from_state() {
  # COMPOSE project name is the state file's DEMO_PROJECT.
  # shellcheck disable=SC1090
  ( set -a; source "$1"; set +a; printf '%s' "$DEMO_PROJECT" )
}

demo_write_state() {
  local port="$1"
  local label="$2"
  local image="$3"
  local file
  file="$(demo_state_file "$port")"
  mkdir -p "$STATE_DIR"
  cat >"$file" <<EOF
DEMO_PORT=$port
DEMO_LABEL=$label
DEMO_IMAGE=$image
DEMO_PROJECT=nopdemo-$port
DEMO_SQL_PASSWORD=$DEMO_SQL_PASSWORD
DEMO_SQL_USER=$DEMO_SQL_USER
DEMO_SQL_DATABASE=$DEMO_SQL_DATABASE
DEMO_SQL_HOST=$DEMO_SQL_HOST
DEMO_ADMIN_EMAIL=$DEMO_ADMIN_EMAIL
DEMO_ADMIN_PASSWORD=$DEMO_ADMIN_PASSWORD
DEMO_FREE_SHIPPING_OVER_X=${DEMO_FREE_SHIPPING_OVER_X:-75}
EOF
  echo "$file"
}

demo_wait_http() {
  local url="$1"
  local tries="${2:-60}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS --max-time 5 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

demo_storefront_ready() {
  local url="$1"
  local body
  body="$(curl -fsS --max-time 20 -L "$url" 2>/dev/null || true)"
  [[ "$body" == *"html-home-page"* || "$body" == *"home-page"* ]] && [[ "$body" != *'id="installation-form"'* ]]
}
