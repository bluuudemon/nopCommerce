#!/usr/bin/env bash
# Put one running demo store into the Feature-to-Ship starting state:
# free-shipping threshold $75, the free-shipping toggle off, any progress-bar
# toggle off, and no carts. Restarts the site so nopCommerce reloads settings.
#
#   demo/prime.sh <port>
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PORT="${1:?usage: demo/prime.sh <port>}"
STATE="$(demo_state_file "$PORT")"
if [[ ! -f "$STATE" ]]; then
  echo "No demo state for port ${PORT}. Start it with demo/up.sh first." >&2
  exit 1
fi

echo "Priming port ${PORT}: free shipping over \$75, toggle off, carts empty."
demo_compose "$STATE" exec -T database \
  psql -U postgres -d nopcommerce -v ON_ERROR_STOP=1 <<'SQL'
UPDATE "Setting"
   SET "Value" = '75'
 WHERE "Name" = 'shippingsettings.freeshippingoverxvalue';

UPDATE "Setting"
   SET "Value" = 'False'
 WHERE "Name" = 'shippingsettings.freeshippingoverxenabled';

UPDATE "Setting"
   SET "Value" = 'False'
 WHERE "Name" LIKE '%progressbar%'
    OR "Name" LIKE '%freeshippingprogress%';

INSERT INTO "Setting" ("Name", "Value", "StoreId")
SELECT 'shippingsettings.freeshippingoverxvalue', '75', 0
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting"
   WHERE "Name" = 'shippingsettings.freeshippingoverxvalue' AND "StoreId" = 0
);

INSERT INTO "Setting" ("Name", "Value", "StoreId")
SELECT 'shippingsettings.freeshippingoverxenabled', 'False', 0
WHERE NOT EXISTS (
  SELECT 1 FROM "Setting"
   WHERE "Name" = 'shippingsettings.freeshippingoverxenabled' AND "StoreId" = 0
);

DELETE FROM "ShoppingCartItem";
SQL

demo_compose "$STATE" restart web >/dev/null
BASE="http://127.0.0.1:${PORT}"
if ! demo_wait_http "$BASE" 40; then
  echo "Store on port ${PORT} did not come back after restart." >&2
  exit 1
fi
echo "Port ${PORT} is in the demo starting state."
