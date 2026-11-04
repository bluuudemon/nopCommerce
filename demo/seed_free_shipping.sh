#!/usr/bin/env bash
# Turn on nopCommerce "Free shipping over X" for a demo instance.
#
#   demo/seed_free_shipping.sh demo/.state/<port>.env
#
# Called from demo/up.sh after the sample catalog is installed, and therefore
# from demo/reset.sh as well. The threshold comes from the state file
# (DEMO_FREE_SHIPPING_OVER_X, default 75). One Nike Floral Roshe is $40, so
# 75 leaves the progress bar partial until the quantity goes to 2.
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
demo_load_defaults

STATE="${1:-}"
if [[ -z "$STATE" || ! -f "$STATE" ]]; then
  echo "Usage: demo/seed_free_shipping.sh <state-file>" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$STATE"
set +a

THRESHOLD="${DEMO_FREE_SHIPPING_OVER_X:-75}"
if ! [[ "$THRESHOLD" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "DEMO_FREE_SHIPPING_OVER_X must be a positive number (got '${THRESHOLD}')." >&2
  exit 1
fi

DB_CID="$(demo_compose "$STATE" ps -q database)"
if [[ -z "$DB_CID" ]]; then
  echo "Database container is not running for ${STATE}." >&2
  exit 1
fi

echo "Setting free shipping over ${THRESHOLD}..."
set +e
# psql writes RAISE NOTICE to stderr. Keep it in $output so the restart
# decision below can see FREE_SHIPPING_SEED_CHANGED.
output="$(
  docker exec -i -e PGPASSWORD="$DEMO_SQL_PASSWORD" "$DB_CID" \
    psql -U "$DEMO_SQL_USER" -d "$DEMO_SQL_DATABASE" -v ON_ERROR_STOP=1 -v threshold="$THRESHOLD" \
    2>&1 <<'SQL'
SELECT set_config('demo.free_shipping_threshold', :'threshold', false);
DO $$
DECLARE
  tbl text;
  name_col text;
  value_col text;
  store_col text;
  threshold text := current_setting('demo.free_shipping_threshold');
  old_enabled text;
  old_value text;
  updated int;
  changed boolean := false;
BEGIN
  SELECT c.table_name INTO tbl
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND lower(c.table_name) = 'setting'
    AND lower(c.column_name) = 'name'
  LIMIT 1;

  IF tbl IS NULL THEN
    RAISE EXCEPTION 'Setting table not found';
  END IF;

  SELECT column_name INTO name_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = tbl AND lower(column_name) = 'name';
  SELECT column_name INTO value_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = tbl AND lower(column_name) = 'value';
  SELECT column_name INTO store_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = tbl AND lower(column_name) = 'storeid';

  EXECUTE format(
    'SELECT %I FROM %I WHERE lower(%I::text) = %L AND %I = 0',
    value_col, tbl, name_col, 'shippingsettings.freeshippingoverxenabled', store_col)
    INTO old_enabled;
  EXECUTE format(
    'SELECT %I FROM %I WHERE lower(%I::text) = %L AND %I = 0',
    value_col, tbl, name_col, 'shippingsettings.freeshippingoverxvalue', store_col)
    INTO old_value;

  IF old_enabled IS NULL OR lower(old_enabled) IS DISTINCT FROM 'true' THEN
    changed := true;
  END IF;
  BEGIN
    IF old_value IS NULL OR old_value::numeric IS DISTINCT FROM threshold::numeric THEN
      changed := true;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    changed := true;
  END;

  EXECUTE format(
    'UPDATE %I SET %I = %L WHERE lower(%I::text) = %L AND %I = 0',
    tbl, value_col, 'True', name_col, 'shippingsettings.freeshippingoverxenabled', store_col);
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 1 THEN
    RAISE EXCEPTION 'Expected to update shippingsettings.freeshippingoverxenabled, updated %', updated;
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = %L WHERE lower(%I::text) = %L AND %I = 0',
    tbl, value_col, threshold, name_col, 'shippingsettings.freeshippingoverxvalue', store_col);
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 1 THEN
    RAISE EXCEPTION 'Expected to update shippingsettings.freeshippingoverxvalue, updated %', updated;
  END IF;

  IF changed THEN
    RAISE NOTICE 'FREE_SHIPPING_SEED_CHANGED';
  ELSE
    RAISE NOTICE 'FREE_SHIPPING_SEED_UNCHANGED';
  END IF;
END $$;
SQL
)"
status=$?
set -e
printf '%s\n' "$output"
if [[ "$status" -ne 0 ]]; then
  exit "$status"
fi

if [[ "$output" != *"FREE_SHIPPING_SEED_CHANGED"* ]]; then
  echo "Free shipping over ${THRESHOLD} is already set."
  exit 0
fi

echo "Restarting the web container so the new shipping setting is loaded..."
demo_compose "$STATE" restart web

BASE="http://127.0.0.1:${DEMO_PORT}"
echo "Waiting for the storefront after restart..."
ready=0
for _ in $(seq 1 90); do
  if demo_storefront_ready "$BASE"; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "Web restarted but ${BASE} is not serving the storefront yet." >&2
  demo_compose "$STATE" logs --tail 40 web >&2 || true
  exit 1
fi

echo "Free shipping over ${THRESHOLD} is on."
