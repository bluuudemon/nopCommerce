# Demo storefront runbook

Stand up the public nopCommerce storefront with sample products, a known admin login, and no install wizard. Use one port for the baseline and a second port when a feature image is ready.

The web container is the published `nopcommerceteam/nopcommerce` image (the current Docker Hub `latest`, nopCommerce 5.00). It is the same DefaultClean storefront the feature shortlist is written against. `up.sh` does not compile a branch and does not need NuGet. When a feature branch has an image, point `DEMO_IMAGE` at it.

The repo already ships `Dockerfile`, `docker-compose.yml` (SQL Server), `postgresql-docker-compose.yml`, and `mysql-docker-compose.yml`. Those files build from source and stop at the install wizard. This harness keeps the same shape (web + database) and finishes the wizard.

## Prerequisites

- Docker Engine and the Docker Compose plugin (`docker compose version`).
- Ports 8080 and 8081 free if you run baseline and feature together.
- About 2 GB of disk for the images. Postgres is the database, not SQL Server, so two instances fit on a laptop. The root `docker-compose.yml` SQL Server image is optional and is not what these scripts start.
- `curl` and `python3` on the host (used to submit the install form).

## Credentials

| | |
| --- | --- |
| Storefront admin email | `admin@yourStore.com` |
| Storefront admin password | `Demo123!` |
| Admin URL | `http://127.0.0.1:<port>/admin` |
| Postgres user | `postgres` |
| Postgres password | `nopCommerce_db_password` |
| Database name | `nopcommerce` (created by the installer) |

Postgres is not published to the host. The web container reaches it at the hostname `database` on the default Docker bridge. Compose prints a warning that links on the default bridge are deprecated. That warning is expected. The password matches the sample password in the repo's existing compose files.

Customer accounts from the sample catalog (not admins) use password `123456`, for example `steve_gates@nopCommerce.com`.

## Commands

From the repo root:

```bash
# Baseline storefront
demo/up.sh baseline 8080

# Second instance for a side-by-side "after"
# (same published image until you have a feature image)
demo/up.sh feature 8081

# Feature image. Build it once from this branch, then point up.sh at it.
docker build -t nopdemo:golden-free-shipping-bar .
DEMO_IMAGE=nopdemo:golden-free-shipping-bar demo/up.sh feature 8081

# Fresh sample data, same image, same port
demo/reset.sh 8080

# Fresh sample data for every instance this checkout started
demo/reset.sh

# Stop, keep the database volume
demo/down.sh 8080
```

`demo/up.sh 8080` is the same as `demo/up.sh baseline 8080`.

The first run pulls images if they are missing, waits for Postgres, posts the install form with sample data, and restarts the app. Later runs see an installed storefront and return immediately. `reset.sh` deletes the database volume and installs again, so the catalog is the same every time.

After the storefront is up, `up.sh` (and therefore `reset.sh`) sets **Free shipping over X** to `$75` (`DEMO_FREE_SHIPPING_OVER_X` in `demo/demo.env`) and restarts the site when that value changed. One Nike Floral Roshe Customized Running Shoes ($40) then shows a partial free-shipping bar on a feature image. Set `DEMO_FREE_SHIPPING_OVER_X` before `up.sh` to use a different threshold. A fresh install is required for the progress-bar copy; an older database does not contain the new locale strings.

When it is ready:

- Storefront: `http://127.0.0.1:8080`
- A product: open Computers → Desktops, or search from the header. Sample products include Apple iPhone 16 128GB and Nike Floral Roshe Customized Running Shoes.
- Cart: `/cart`

## What the presenter clicks for the hero feature

The hero feature is the free-shipping progress bar (`docs/demo/FEATURE_SHORTLIST.md`). It is not in this baseline.

1. Baseline on port 8080 (published image), feature build on port 8081 (`DEMO_IMAGE=nopdemo:golden-free-shipping-bar`).
2. The feature seed already enables Free shipping over X at $75. Admin → Configuration → Settings → Shipping shows the same switch if you want to turn it off.
3. Add Nike Floral Roshe Customized Running Shoes (price 40, not marked free shipping). Pick any size. The bar should read "Add $35.00 more for free shipping".
4. Raise the quantity to 2. The bar switches to "You've unlocked free shipping!".
5. Hover the header cart. The same bar is in the mini-cart. On a narrow screen the cart page bar is the one to show; the default theme opens the mini-cart on hover at desktop widths.
6. Repeat the add on baseline. Totals only, no bar. Baseline scripts from this branch also seed the $75 threshold, so shipping can drop off there too; the bar itself is only in the feature image.

Do not demo the bar with Build your own computer or Apple MacBook Pro. Those sample products are already marked free shipping, so the bar would look finished on the first add.

## Layout

| Path | Role |
| --- | --- |
| `demo/up.sh` | Create the instance, install sample data if needed, seed free shipping over $75 |
| `demo/seed_free_shipping.sh` | Set free shipping over X on an installed demo database |
| `demo/reset.sh` | Delete volumes and install again (re-seeds free shipping) |
| `demo/down.sh` | Stop containers, keep data |
| `demo/docker-compose.yml` | Web + Postgres |
| `demo/demo.env` | Image name and demo passwords |
| `demo/install_store.py` | Posts `/install` with the antiforgery cookie |
| `demo/.state/<port>.env` | Created locally, not committed. Reset and down read it |

Each port is its own compose project (`nopdemo-<port>`), so 8080 and 8081 do not share a database.

## Troubleshooting

**Port already in use.** `demo/down.sh <port>` or pick another port. State files remember the label and image.

**Install page comes back after a restart.** The container was recreated without its writable layer and the database volume is still there, or the opposite. Run `demo/reset.sh <port>` so both are recreated together.

**`/install` sits for several minutes.** Sample data plus plugin setup runs inside the POST. Leave it. The script allows 15 minutes. Web logs: `docker compose --project-name nopdemo-8080 --env-file demo/.state/8080.env -f demo/docker-compose.yml logs -f web`.

**Storefront is up but pictures are empty.** Thumbnails generate on first view. Reload the product page once.

**Feature image and baseline must not share a project name.** Always pass a different port. `DEMO_IMAGE` is read when `up.sh` writes state. Changing it later requires `demo/down.sh <port>` and `up.sh` again. `reset.sh` reuses the image stored in `demo/.state`.

**Need SQL Server instead.** The repo's `docker-compose.yml` is that path (image `mcr.microsoft.com/mssql/server:2019-latest`, sa password `nopCommerce_db_password`). It does not auto-install. These scripts use Postgres because nopCommerce supports it (`postgresql-docker-compose.yml`) and two instances stay small.

**Building a branch image.** The repo `Dockerfile` publishes `Nop.Web` with the .NET 10 SDK (`mcr.microsoft.com/dotnet/sdk:10.0-alpine`) and needs NuGet. That build is intentionally not part of `up.sh`. Produce the image in an environment that can restore packages, then `DEMO_IMAGE=... demo/up.sh feature 8081`.
