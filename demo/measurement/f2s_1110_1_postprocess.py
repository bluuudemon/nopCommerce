#!/usr/bin/env python3
"""Recompute aggregate metrics after DB enrichment."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SessionLog:
    ordered: bool
    order_id: int | None
    order_total: float | None
    order_subtotal: float | None
    cart_subtotal_at_view: float | None
    near_threshold_50_75_at_cart: bool
    saw_freeship_prompt: bool


def enrich_from_db(path: Path, port: int) -> None:
    data = json.loads(path.read_text())
    demo_dir = Path(__file__).resolve().parents[1]
    ids = [s["order_id"] for s in data["sessions"] if s.get("order_id")]
    if not ids:
        return
    id_list = ",".join(str(i) for i in ids)
    sql = (
        f'SELECT "Id", "OrderTotal", "OrderSubtotalExclTax" FROM "Order" '
        f'WHERE "Id" IN ({id_list});'
    )
    sql_safe = sql.replace("'", "''")
    cmd = (
        f"docker compose --project-name nopdemo-{port} "
        f"--env-file {demo_dir}/.state/{port}.env "
        f"-f {demo_dir}/docker-compose.yml exec -T database "
        f"psql -U postgres -d nopcommerce -t -A -F ',' -c '{sql_safe}'"
    )
    raw = subprocess.check_output(["sg", "docker", "-c", cmd], text=True)
    by_id = {}
    for line in raw.strip().splitlines():
        oid, total, sub = line.split(",")[:3]
        by_id[int(oid)] = (float(total), float(sub))
    for s in data["sessions"]:
        oid = s.get("order_id")
        if oid in by_id:
            s["order_total"], sub_db = by_id[oid]
            if s.get("order_subtotal") is None:
                s["order_subtotal"] = sub_db
    data["sessions"] = data["sessions"]
    path.write_text(json.dumps(data, indent=2))


def aggregate(sessions: list[dict]) -> dict:
    logs = [
        SessionLog(
            ordered=bool(s.get("ordered")),
            order_id=s.get("order_id"),
            order_total=s.get("order_total"),
            order_subtotal=s.get("order_subtotal"),
            cart_subtotal_at_view=s.get("cart_subtotal_at_view"),
            near_threshold_50_75_at_cart=bool(s.get("near_threshold_50_75_at_cart")),
            saw_freeship_prompt=bool(s.get("saw_freeship_prompt")),
        )
        for s in sessions
    ]
    orders = [l for l in logs if l.ordered and l.order_id is not None]
    subtotals = [l.order_subtotal for l in orders if l.order_subtotal is not None]
    totals = [l.order_total for l in orders if l.order_total is not None]
    near = [l for l in logs if l.near_threshold_50_75_at_cart]
    near_checkout = [l for l in near if l.ordered]
    aov = sum(totals) / len(totals) if totals else None
    if subtotals:
        share_ge = sum(1 for s in subtotals if s >= 75.0) / len(subtotals)
        share_gt = sum(1 for s in subtotals if s > 75.0) / len(subtotals)
    else:
        share_ge = share_gt = None
    conv_near = len(near_checkout) / len(near) if near else None
    return {
        "session_count": len(logs),
        "order_count": len(orders),
        "aov": aov,
        "share_orders_subtotal_ge_75": share_ge,
        "share_orders_subtotal_gt_75": share_gt,
        "cart_to_checkout_conv_near_threshold_50_75": conv_near,
        "near_threshold_cart_views": len(near),
        "near_threshold_checkouts": len(near_checkout),
        "orders_with_prompt_seen": sum(1 for l in logs if l.saw_freeship_prompt),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--json", type=Path, required=True)
    p.add_argument("--port", type=int, required=True)
    args = p.parse_args()
    enrich_from_db(args.json, args.port)
    data = json.loads(args.json.read_text())
    data["metrics"] = aggregate(data["sessions"])
    args.json.write_text(json.dumps(data, indent=2))
    print(json.dumps(data["metrics"], indent=2))


if __name__ == "__main__":
    main()
