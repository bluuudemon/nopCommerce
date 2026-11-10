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
  # shellcheck disable=SC1091
  set -a
  source "$DEMO_DIR/demo.env"
  set +a
  if [[ "$image_was_set" -eq 1 ]]; then
    DEMO_IMAGE="$preset_image"
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

# Run a command, waiting at most 60 seconds when timeout or gtimeout exists.
# macOS has neither. A missing timeout must not look like a failed docker pull.
# `|| return` keeps bash 3.2 with set -e from exiting the whole script.
demo_run_bounded() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 60 "$@" || return 1
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 60 "$@" || return 1
  else
    "$@" || return 1
  fi
}

# The repository Dockerfile names two Microsoft base images. Pull them.
# DEMO_OFFLINE_BASE=1 builds local stand-ins instead. A failed pull on a
# presenter machine stops here. It does not switch to those stand-ins.
demo_ensure_build_bases() {
  local sdk="$1"
  local aspnet="$2"
  if docker image inspect "$sdk" >/dev/null 2>&1 \
    && docker image inspect "$aspnet" >/dev/null 2>&1; then
    return 0
  fi
  if [[ "${DEMO_OFFLINE_BASE:-}" == "1" ]]; then
    echo "DEMO_OFFLINE_BASE=1: building local stand-ins for the Dockerfile base images." >&2
    "$DEMO_DIR/prepare-offline-bases.sh" >&2 || return 1
    return 0
  fi
  echo "Pulling .NET base images named by the repository Dockerfile." >&2
  if ! demo_run_bounded docker pull "$sdk" >&2 || ! demo_run_bounded docker pull "$aspnet" >&2; then
    echo "docker pull failed for the Dockerfile base images." >&2
    echo "Leave DEMO_OFFLINE_BASE unset. Fix the pull, then run demo/prebuild.sh again." >&2
    return 1
  fi
}

# Print the commit for a rev, or return 1. Stderr is discarded so a missing
# name cannot surface as "fatal: Needed a single revision". The `|| return`
# matters on macOS bash 3.2: with `set -e`, a failing command inside a
# function exits the whole script even when the caller is an `if`.
demo_print_commit() {
  git rev-parse --verify --quiet "${1}^{commit}" 2>/dev/null || return 1
}

# Resolve a branch, tag, or sha to a commit.
#
# A clone made before the feature branch existed has no local ref for it.
# `git fetch origin <branch>` still downloads the tip, and macOS git reports
# "* branch <name> -> FETCH_HEAD" without creating <name>. Resolving <name>
# then dies. Use the commit this fetch just stored, then origin/<ref>, then
# the name or a sha that is already in the clone.
demo_resolve_ref() {
  local ref="$1"
  local sha=""
  local fetched_sha=""

  echo "Fetching ${ref} from origin." >&2
  if git fetch origin "$ref" >&2; then
    sha="$(demo_print_commit FETCH_HEAD)" || sha=""
    fetched_sha="$sha"
  fi
  # Some git versions only keep a one-off fetch in FETCH_HEAD. Asking for
  # the remote-tracking ref explicitly still helps when that destination
  # is how this git stores the branch.
  if [[ -z "$fetched_sha" ]]; then
    if git fetch origin "+refs/heads/${ref}:refs/remotes/origin/${ref}" >&2; then
      sha="$(demo_print_commit "refs/remotes/origin/${ref}")" || sha=""
      if [[ -z "$sha" ]]; then
        sha="$(demo_print_commit FETCH_HEAD)" || sha=""
      fi
      fetched_sha="$sha"
    fi
  fi

  if [[ -n "$fetched_sha" ]]; then
    printf '%s\n' "$fetched_sha"
    return 0
  fi
  if sha="$(demo_print_commit "$ref")"; then
    printf '%s\n' "$sha"
    return 0
  fi
  if sha="$(demo_print_commit "origin/${ref}")"; then
    printf '%s\n' "$sha"
    return 0
  fi
  echo "Could not resolve ${ref} to a commit. It is not on origin and not in this clone." >&2
  return 1
}
