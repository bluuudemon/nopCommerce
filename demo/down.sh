#!/usr/bin/env bash
# Stop a demo instance. Data volumes are kept. demo/reset.sh drops them.
#
#   demo/down.sh <port>
#   demo/down.sh            # stop every tracked instance
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

stop_one() {
  local port="$1"
  local state
  state="$(demo_state_file "$port")"
  if [[ ! -f "$state" ]]; then
    echo "No demo state for port ${port}." >&2
    return 1
  fi
  demo_compose "$state" down
  echo "Stopped port ${port}."
}

if [[ $# -eq 0 ]]; then
  shopt -s nullglob
  files=("$STATE_DIR"/*.env)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No tracked instances."
    exit 0
  fi
  for file in "${files[@]}"; do
    stop_one "$(basename "$file" .env)"
  done
else
  stop_one "$1"
fi
