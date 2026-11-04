#!/usr/bin/env bash
# Wipe a demo instance and install the sample catalog again.
#
#   demo/reset.sh            # every instance this checkout has started
#   demo/reset.sh <port>     # one port
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
demo_load_defaults

reset_one() {
  local port="$1"
  local state
  state="$(demo_state_file "$port")"
  if [[ ! -f "$state" ]]; then
    echo "No demo state for port ${port}. Start it once with demo/up.sh <label> ${port}." >&2
    return 1
  fi
  echo "Resetting port ${port} (drop database volume and reinstall sample data)..."
  demo_compose "$state" down -v --remove-orphans
  # shellcheck disable=SC1090
  set -a
  source "$state"
  set +a
  "$DEMO_DIR/up.sh" "${DEMO_LABEL:-baseline}" "$port"
}

if [[ $# -eq 0 ]]; then
  shopt -s nullglob
  files=("$STATE_DIR"/*.env)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "Nothing to reset. No files in demo/.state." >&2
    exit 1
  fi
  for file in "${files[@]}"; do
    port="$(basename "$file" .env)"
    reset_one "$port"
  done
else
  reset_one "$1"
fi
