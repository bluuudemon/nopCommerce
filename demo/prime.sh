#!/usr/bin/env bash
# Put a running demo store into a known state and clear carts.
#
#   demo/prime.sh 8080            # baseline: threshold $75, feature off
#   demo/prime.sh 8081            # feature: threshold $75, bar enabled
#   demo/prime.sh <port> baseline
#   demo/prime.sh <port> feature
#
# Port 8081 defaults to feature. Every other port defaults to baseline.
# The golden branch shows the bar when shippingsettings.freeshippingoverxenabled
# is true and the threshold is positive. There is no separate progress-bar setting.
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PORT="${1:?usage: demo/prime.sh <port> [baseline|feature]}"
MODE="${2:-}"
if [[ -z "$MODE" ]]; then
  if [[ "$PORT" == "8081" ]]; then
    MODE="feature"
  else
    MODE="baseline"
  fi
fi
case "$MODE" in
  baseline|feature) ;;
  *)
    echo "Mode must be baseline or feature." >&2
    exit 1
    ;;
esac

STATE="$(demo_state_file "$PORT")"
if [[ ! -f "$STATE" ]]; then
  echo "No demo state for port ${PORT}. Start it with demo/up.sh first." >&2
  exit 1
fi

if [[ "$MODE" == "feature" ]]; then
  ENABLED="True"
  echo "Priming port ${PORT}: free shipping over \$75, progress bar on, carts empty."
else
  ENABLED="False"
  echo "Priming port ${PORT}: free shipping over \$75, progress bar off, carts empty."
fi

demo_compose "$STATE" exec -T database \
  psql -U postgres -d nopcommerce -v ON_ERROR_STOP=1 -v enabled="$ENABLED" <<SQL
UPDATE "Setting"
   SET "Value" = '75'
 WHERE "Name" = 'shippingsettings.freeshippingoverxvalue';

INSERT INTO "Setting" ("Name", "Value", "StoreId")
SELECT 'shippingsettings.freeshippingoverxvalue', '75', 0
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting"
   WHERE "Name" = 'shippingsettings.freeshippingoverxvalue' AND "StoreId" = 0
);

UPDATE "Setting"
   SET "Value" = :'enabled'
 WHERE "Name" = 'shippingsettings.freeshippingoverxenabled';

INSERT INTO "Setting" ("Name", "Value", "StoreId")
SELECT 'shippingsettings.freeshippingoverxenabled', :'enabled', 0
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting"
   WHERE "Name" = 'shippingsettings.freeshippingoverxenabled' AND "StoreId" = 0
);

-- Drop names guessed before the golden branch landed. The bar does not read them.
DELETE FROM "Setting"
 WHERE "Name" IN (
   'shippingsettings.freeshippingprogressbarenabled',
   'shippingsettings.showfreeshippingprogressbar',
   'shippingsettings.displayfreeshippingprogressbar',
   'shippingsettings.freeshippingprogressenabled'
 );

DELETE FROM "ShoppingCartItem";
SQL

demo_compose "$STATE" restart web >/dev/null
BASE="http://127.0.0.1:${PORT}"
if ! demo_wait_http "$BASE" 40; then
  echo "Store on port ${PORT} did not come back after restart." >&2
  exit 1
fi
echo "Port ${PORT} is primed (${MODE})."
