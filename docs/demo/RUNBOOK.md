# Demo storefront runbook

Stand up the public nopCommerce storefront with sample products, a known admin login, and no install wizard. Baseline uses the published image. A feature git ref is built with the repository `Dockerfile` and served on its own port.

The repo already ships `Dockerfile`, `docker-compose.yml` (SQL Server), `postgresql-docker-compose.yml`, and `mysql-docker-compose.yml`. Those files build from source and stop at the install wizard. This harness keeps the same shape (web + database), builds a ref when you pass one, and finishes the wizard.

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
# Build the golden feature image before the talk. Reuses the image if that commit is already built.
demo/prebuild.sh
demo/prebuild.sh demo/golden-free-shipping-bar
demo/prebuild.sh f2s/run-123

# Two tabs, already running: baseline on 8080, golden feature on 8081
demo/compare.sh

# Same thing for a different ref
demo/compare.sh f2s/run-123

# One port at a time
demo/up.sh baseline 8080
demo/up.sh feature 8081 demo/golden-free-shipping-bar

# Put one store back into the starting state without reinstalling
demo/prime.sh 8080
demo/prime.sh 8081

# Fresh sample data, same image, same port, then prime again
demo/reset.sh 8080

# Stop, keep the database volume
demo/down.sh 8080
```

`demo/up.sh 8080` is the same as `demo/up.sh baseline 8080`.

`demo/compare.sh` with no arguments uses branch `demo/golden-free-shipping-bar` on port 8081 and the published image on port 8080. Pass another ref when the feature is a different branch. `demo/prebuild.sh` fetches that branch from origin, including when the clone was made before the branch existed, builds it, and stops. macOS git records that fetch as `* branch <name> -> FETCH_HEAD` and does not create a local branch. The script uses that `FETCH_HEAD` commit, then `origin/<ref>`, then the name or a sha already in the clone. A later `compare.sh` or `up.sh` for the same commit only starts containers.

Both servers stay up. Do not stop them between the two tabs. Each port has its own database, both seeded with the sample catalog and then primed the same way.

## Two browser tabs

Open these before the audience is looking, after `demo/prebuild.sh` and `demo/compare.sh`:

| Tab | URL | What it is |
| --- | --- | --- |
| 1 | http://127.0.0.1:8080 | Baseline. No free-shipping bar. |
| 2 | http://127.0.0.1:8081 | Feature already shipped. Free shipping over $75 is on, and the progress bar is visible once the cart has a normal product in it. |

Swap tabs. Do not wait on a live coding run. Tab 2 is the pre-built golden version with the bar already switched on. A parallel bot run can still be going; it is not what the audience is watching.

`DEMO_IMAGE=...` skips the build and runs the image you name. The feature image tag is `nopdemo:sha-<commit>` and is reused until that commit changes.

Every `up.sh` ends in `prime.sh`. Both ports get free shipping over **$75** and **empty carts**. The bar reads only `shippingsettings.freeshippingoverxenabled`. Port 8080 leaves that **off**. Port 8081 turns it **on**, so the bar is already on the feature store once a normal product is in the cart. `demo/prime.sh 8080` and `demo/prime.sh 8081` do the same thing again.

The first run of a ref checks out a worktree under `.demo-worktrees/` and runs `docker build -f Dockerfile`. Later runs of the same commit reuse the image. `reset.sh` deletes the database volume, installs again, and primes.

When it is ready:

- Storefront: `http://127.0.0.1:8080`
- A product: open Computers → Desktops, or search from the header. Sample products include Apple iPhone 16 128GB and Nike Floral Roshe Customized Running Shoes.
- Cart: `/cart`

## What the presenter clicks for the hero feature

The hero feature is the free-shipping progress bar (`docs/demo/FEATURE_SHORTLIST.md`). It is not in this baseline.

1. `demo/prebuild.sh` then `demo/compare.sh`, so tab 1 is port 8080 and tab 2 is port 8081. Tab 2 already has free shipping over $75 and the progress bar switched on.
2. Add Nike Floral Roshe Customized Running Shoes (price 40, not marked free shipping) on both tabs. The feature cart shows a partial bar. The baseline cart does not.
3. Raise the quantity on the feature tab. The bar completes.
4. Open the header cart on the feature tab. The same bar is in the mini-cart.

Do not demo the bar with Build your own computer or Apple MacBook Pro. Those sample products are already marked free shipping, so the bar would look finished on the first add.

## Layout

| Path | Role |
| --- | --- |
| `demo/up.sh` | Start one instance. Builds a git ref when you pass one |
| `demo/compare.sh` | Baseline on 8080, golden feature (or a ref you pass) on 8081. Leaves both running |
| `demo/prebuild.sh` | Build a ref's image ahead of time. Default ref is `demo/golden-free-shipping-bar` |
| `demo/build-image.sh` | `docker build -f Dockerfile` for one ref. Cached by commit |
| `demo/prime.sh` | Threshold $75 and empty carts. Port 8081 turns free shipping over X on. Other ports leave it off |
| `demo/reset.sh` | Delete volumes, install again, prime |
| `demo/down.sh` | Stop containers, keep data |
| `demo/docker-compose.yml` | Web + Postgres |
| `demo/demo.env` | Published image name and demo passwords |
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

**Building a branch image.** `demo/up.sh feature 8081 <git-ref>` checks out that commit and runs the repository `Dockerfile` (`mcr.microsoft.com/dotnet/sdk:10.0-alpine` and `mcr.microsoft.com/dotnet/aspnet:10.0-alpine`). The first build of a commit is the slow one. The image is reused after that. If those base images cannot be pulled, the script builds local stand-ins (`demo/prepare-offline-bases.sh`) and runs the same Dockerfile against them. Test projects are omitted from that image copy; the storefront projects are not. After the build, the script copies `/app/refs` and the published `Nop.Web.deps.json` from `nopcommerceteam/nopcommerce:latest` into the new image. nopCommerce compiles views at runtime, and the repository publish does not include those reference assemblies. The published image has to be present locally for that copy.

**Image build failed.** `docker build` output is on the terminal. A cached image for the same commit is `nopdemo:sha-<12-char-sha>`. Delete it with `docker image rm nopdemo:sha-...` to force a rebuild.
