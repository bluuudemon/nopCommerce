#!/usr/bin/env python3
"""
Seeded shopper simulation for F2S-1110-1 free-shipping progress bar measurement.
Policy constants are fixed before any run; do not tune from results.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

# --- Behavior policy (chosen before measurement) ---
POLICY: dict[str, Any] = {
    "seed": 11_101_110,
    "sessions_per_store": 50,
    "p_start_on_home_then_category": 0.6,
    "p_initial_product_index": [0.35, 0.35, 0.2, 0.1],  # weights for catalog index
    "p_initial_qty_2": 0.15,
    "p_add_second_product_before_cart": 0.25,
    "p_add_when_freeship_prompt_visible": 0.45,
    "p_qty_bump_when_prompt_visible": 0.35,
    "p_checkout_when_near_threshold_50_75": 0.40,
    "p_checkout_otherwise_at_cart": 0.30,
    "p_abandon_after_cart": 0.25,
}

# Sample-catalog products (non-free-ship, stable prices). Paths resolved at install.
CATALOG: list[dict[str, Any]] = [
    {
        "sku": "NK_FRC_RS",
        "path": "/nike-floral-roshe-customized-running-shoes",
        "nominal_price": 40.0,
        "needs_attrs": True,
    },
    {
        "sku": "SPEAKER",
        "path": "/portable-sound-speakers",
        "nominal_price": 37.0,
        "needs_attrs": False,
    },
    {
        "sku": "ADIDAS",
        "path": "/adidas-consortium-campus-80s-running-shoes",
        "nominal_price": 27.56,
        "needs_attrs": True,
    },
    {
        "sku": "NIKE_SB",
        "path": "/nike-sb-zoom-stefan-janoski-medium-mint",
        "nominal_price": 0.0,
        "needs_attrs": False,
    },
]

USD_RE = re.compile(r"\$?\s*([\d,]+\.\d{2})")


@dataclass
class SessionLog:
    store: str
    session_id: int
    ordered: bool = False
    order_id: int | None = None
    order_total: float | None = None
    order_subtotal: float | None = None
    cart_subtotal_at_view: float | None = None
    near_threshold_50_75_at_cart: bool = False
    saw_freeship_prompt: bool = False
    actions: list[str] = field(default_factory=list)
    error: str | None = None


def parse_money(text: str) -> float | None:
    if not text:
        return None
    m = USD_RE.search(text.replace("\xa0", " "))
    if not m:
        return None
    return float(m.group(1).replace(",", ""))


def load_rng(seed: int, store: str, session_id: int):
    import random

    r = random.Random()
    r.seed(seed ^ hash(store) ^ session_id)
    return r


def catalog_paths() -> dict[str, str]:
    return {item["sku"]: item["path"] for item in CATALOG}


def new_guest_context(browser, base: str):
    context = browser.new_context(
        base_url=base,
        ignore_https_errors=True,
        user_agent="f2s-1110-1-measurement/1.0",
    )
    context.clear_cookies()
    return context


def add_product(page, path: str, qty: int = 1, needs_attrs: bool = False) -> None:
    page.goto(path, wait_until="domcontentloaded")
    page.wait_for_timeout(400)
    if needs_attrs:
        for sel in page.locator("#product-details-form select:visible").all():
            if sel.locator("option").count() > 1:
                sel.select_option(index=1)
    if qty > 1:
        qty_input = page.locator(
            "#product_enteredQuantity, input.qty-input, input[name*='EnteredQuantity']"
        )
        if qty_input.count():
            qty_input.first.fill(str(qty))
    page.locator(".add-to-cart-button").first.click(timeout=15000)
    page.wait_for_timeout(1200)


def read_cart_state(page) -> tuple[float | None, bool, bool]:
    page.goto("/cart", wait_until="domcontentloaded")
    page.wait_for_timeout(500)
    sub_el = page.locator("tr.order-subtotal .value-summary")
    subtotal = None
    if sub_el.count():
        subtotal = parse_money(sub_el.first.inner_text())
    prompt = False
    prog = page.locator("[data-free-shipping-progress]")
    if prog.count():
        msg = page.locator(".free-shipping-progress__message").first
        if msg.count():
            text = msg.inner_text().lower()
            prompt = "add" in text and "more" in text and "free shipping" in text
    near = subtotal is not None and 50.0 <= subtotal <= 75.0
    return subtotal, prompt, near


def guest_checkout(page, session_id: int) -> tuple[int | None, float | None]:
    page.goto("/cart", wait_until="domcontentloaded")
    subtotal_at_checkout = None
    sub_el = page.locator("tr.order-subtotal .value-summary")
    if sub_el.count():
        subtotal_at_checkout = parse_money(sub_el.first.inner_text())
    if not page.locator("#checkout").count():
        return None, subtotal_at_checkout
    if page.locator("#termsofservice").count():
        page.locator("#termsofservice").check()
    page.locator("#checkout").click()
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(800)
    if "checkoutasguest" in page.url.lower():
        guest_btn = page.locator(".checkout-as-guest-button")
        if guest_btn.count():
            guest_btn.click()
        else:
            page.goto("/checkout")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(800)

    def fill_if(sel: str, value: str):
        loc = page.locator(sel)
        if loc.count():
            loc.fill(value)

    email = f"sim{session_id}@measure.local"
    fill_if("#BillingNewAddress_FirstName", "Sim")
    fill_if("#BillingNewAddress_LastName", f"Shopper{session_id}")
    fill_if("#BillingNewAddress_Email", email)
    fill_if("#BillingNewAddress_City", "New York")
    fill_if("#BillingNewAddress_Address1", "123 Demo St")
    fill_if("#BillingNewAddress_ZipPostalCode", "10001")
    fill_if("#BillingNewAddress_PhoneNumber", "2125550100")

    country = page.locator("#BillingNewAddress_CountryId")
    if country.count():
        country.select_option(index=1)
        page.wait_for_timeout(500)
    state = page.locator("#BillingNewAddress_StateProvinceId")
    if state.count() and state.locator("option").count() > 1:
        state.select_option(index=1)

    bill_next = page.locator(
        "#billingaddress-next-button, .new-address-next-step-button, "
        ".billing-address-next-step-button"
    )
    if bill_next.count():
        bill_next.first.click()
    page.wait_for_timeout(2500)

    for _ in range(10):
        url = page.url.lower()
        if "checkout/completed" in url or "checkoutcompleted" in url:
            break
        if "shippingaddress" in url:
            same = page.locator("#ship-to-same-address")
            if same.count():
                same.check()
            ship_next = page.locator("#shippingaddress-next-button")
            if ship_next.count():
                ship_next.click()
        elif "shippingmethod" in url:
            if page.locator('input[name="shippingoption"]').count():
                page.locator('input[name="shippingoption"]').first.check()
            page.locator(".shipping-method-next-step-button").click()
        elif "paymentmethod" in url:
            if page.locator('input[name="paymentmethod"]').count():
                page.locator('input[name="paymentmethod"]').first.check()
            page.locator(".payment-method-next-step-button").click()
        elif "paymentinfo" in url:
            page.locator(".payment-info-next-step-button").click()
        elif "confirm" in url:
            page.locator(".confirm-order-next-step-button").click()
            break
        page.wait_for_timeout(2500)

    page.wait_for_timeout(2000)
    body = page.content()
    lower = body.lower()
    if (
        "order number" in lower
        or "checkout/completed" in page.url.lower()
        or "checkoutcompleted" in page.url.lower()
    ):
        url_m = re.search(r"/checkout/completed/(\d+)", page.url, re.I)
        if url_m:
            return int(url_m.group(1)), subtotal_at_checkout
        m = re.search(r"order\s+number:\s*(\d+)", body, re.I)
        if m:
            return int(m.group(1)), subtotal_at_checkout
    return None, subtotal_at_checkout


def run_session(
    browser,
    base: str,
    store: str,
    session_id: int,
    product_paths: dict[str, str],
) -> SessionLog:
    log = SessionLog(store=store, session_id=session_id)
    rng = load_rng(POLICY["seed"], store, session_id)
    ctx = new_guest_context(browser, base)
    page = ctx.new_page()
    try:
        if rng.random() < POLICY["p_start_on_home_then_category"]:
            page.goto("/", wait_until="domcontentloaded")
            page.wait_for_timeout(300)
            page.goto("/shoes", wait_until="domcontentloaded")
            log.actions.append("browse_category")
        else:
            page.goto("/", wait_until="domcontentloaded")
            log.actions.append("browse_home")

        weights = POLICY["p_initial_product_index"]
        idx = rng.choices(range(len(CATALOG)), weights=weights[: len(CATALOG)])[0]
        item = CATALOG[idx]
        sku = item["sku"]
        path = product_paths.get(sku) or product_paths["NK_FRC_RS"]
        qty = 2 if rng.random() < POLICY["p_initial_qty_2"] else 1
        add_product(page, path, qty, needs_attrs=item.get("needs_attrs", False))
        log.actions.append(f"add_{sku}_qty{qty}")

        if rng.random() < POLICY["p_add_second_product_before_cart"]:
            alt = CATALOG[(idx + 1) % len(CATALOG)]["sku"]
            if alt in product_paths and alt != sku:
                alt_item = next(x for x in CATALOG if x["sku"] == alt)
                add_product(
                    page,
                    product_paths[alt],
                    1,
                    needs_attrs=alt_item.get("needs_attrs", False),
                )
                log.actions.append(f"add_{alt}")

        subtotal, prompt, near = read_cart_state(page)
        log.cart_subtotal_at_view = subtotal
        log.near_threshold_50_75_at_cart = near
        log.saw_freeship_prompt = prompt

        if prompt:
            if rng.random() < POLICY["p_add_when_freeship_prompt_visible"]:
                bump_sku = product_paths.get("ADIDAS") or product_paths.get("NK_FRC_RS")
                bump_item = next(
                    (x for x in CATALOG if x["sku"] == "ADIDAS"),
                    CATALOG[0],
                )
                add_product(
                    page,
                    bump_sku,
                    1,
                    needs_attrs=bump_item.get("needs_attrs", False),
                )
                log.actions.append("react_prompt_add_item")
            elif rng.random() < POLICY["p_qty_bump_when_prompt_visible"]:
                page.goto("/cart")
                row_qty = page.locator(".qty-input").first
                if row_qty.count():
                    row_qty.fill("2")
                    page.locator("#updatecart").click()
                    page.wait_for_timeout(800)
                    log.actions.append("react_prompt_qty_bump")
            subtotal, prompt, near = read_cart_state(page)
            log.cart_subtotal_at_view = subtotal
            log.near_threshold_50_75_at_cart = near

        checkout_p = (
            POLICY["p_checkout_when_near_threshold_50_75"]
            if near
            else POLICY["p_checkout_otherwise_at_cart"]
        )
        if rng.random() < checkout_p:
            order_id, sub_at_co = guest_checkout(page, session_id)
            log.order_subtotal = sub_at_co
            if order_id is not None:
                log.ordered = True
                log.order_id = order_id
                log.actions.append("checkout_placed")
            else:
                log.actions.append("checkout_failed")
        elif rng.random() < POLICY["p_abandon_after_cart"]:
            log.actions.append("abandon")

    except Exception as exc:  # noqa: BLE001
        log.error = str(exc)
    finally:
        ctx.close()
    return log


def aggregate(logs: list[SessionLog]) -> dict[str, Any]:
    orders = [l for l in logs if l.ordered and l.order_total is not None]
    subtotals = [l.order_subtotal for l in orders if l.order_subtotal is not None]
    near = [l for l in logs if l.near_threshold_50_75_at_cart]
    near_checkout = [l for l in near if l.ordered]

    aov = sum(l.order_total for l in orders) / len(orders) if orders else None
    if subtotals:
        share_ge_75 = sum(1 for s in subtotals if s >= 75.0) / len(subtotals)
        share_gt_75 = sum(1 for s in subtotals if s > 75.0) / len(subtotals)
    else:
        share_ge_75 = share_gt_75 = None
    conv_near = len(near_checkout) / len(near) if near else None

    return {
        "session_count": len(logs),
        "order_count": len(orders),
        "aov": aov,
        "share_orders_subtotal_ge_75": share_ge_75,
        "share_orders_subtotal_gt_75": share_gt_75,
        "cart_to_checkout_conv_near_threshold_50_75": conv_near,
        "near_threshold_cart_views": len(near),
        "near_threshold_checkouts": len(near_checkout),
        "orders_with_prompt_seen": sum(1 for l in logs if l.saw_freeship_prompt),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--store-label", required=True)
    parser.add_argument("--sessions", type=int, default=POLICY["sessions_per_store"])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=None, help="Demo host port for DB order lookup")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    logs: list[SessionLog] = []
    started = datetime.now(timezone.utc).isoformat()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        paths = catalog_paths()

        for sid in range(1, args.sessions + 1):
            logs.append(run_session(browser, base, args.store_label, sid, paths))
            if sid % 10 == 0:
                print(f"{args.store_label}: {sid}/{args.sessions}", flush=True)
        browser.close()

    if args.port:
        ids = [s.order_id for s in logs if s.order_id]
        if ids:
            import shlex
            import subprocess

            demo_dir = Path(__file__).resolve().parents[1]
            id_list = ",".join(str(i) for i in ids)
            sql = (
                f'SELECT "Id", "OrderTotal", "OrderSubtotalExclTax" FROM "Order" '
                f'WHERE "Id" IN ({id_list});'
            )
            cmd = [
                "docker",
                "compose",
                "--project-name",
                f"nopdemo-{args.port}",
                "--env-file",
                str(demo_dir / f".state/{args.port}.env"),
                "-f",
                str(demo_dir / "docker-compose.yml"),
                "exec",
                "-T",
                "database",
                "psql",
                "-U",
                "postgres",
                "-d",
                "nopcommerce",
                "-t",
                "-A",
                "-F",
                ",",
                "-c",
                sql,
            ]
            try:
                # psql -c SQL must stay one shell word; shlex.join leaves IN (...) unquoted.
                shell_cmd = shlex.join(cmd[:-1] + [cmd[-1]])
                raw = subprocess.check_output(
                    ["sg", "docker", "-c", shell_cmd],
                    text=True,
                )
                by_id = {}
                for line in raw.strip().splitlines():
                    oid, total, sub = line.split(",")[:3]
                    by_id[int(oid)] = (float(total), float(sub))
                for s in logs:
                    if s.order_id in by_id:
                        s.order_total, sub_db = by_id[s.order_id]
                        if s.order_subtotal is None:
                            s.order_subtotal = sub_db
            except Exception as exc:  # noqa: BLE001
                print(f"DB enrich warning: {exc}", file=sys.stderr)

    payload = {
        "policy": POLICY,
        "store": args.store_label,
        "base_url": base,
        "product_paths": paths,
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "sessions": [asdict(l) for l in logs],
        "metrics": aggregate(logs),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
