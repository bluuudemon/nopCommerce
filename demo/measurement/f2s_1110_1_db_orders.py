#!/usr/bin/env python3
"""Read placed orders from the demo Postgres for a port since a Unix timestamp."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def fetch_orders(port: int, since_utc: str) -> list[dict]:
    sql = f"""
SELECT o."Id", o."OrderTotal", o."OrderSubtotalInclTax", o."OrderSubtotalExclTax",
       o."CreatedOnUtc"
FROM "Order" o
WHERE o."CreatedOnUtc" >= '{since_utc}'::timestamp
ORDER BY o."Id";
"""
    cmd = [
        "docker",
        "compose",
        "--project-name",
        f"nopdemo-{port}",
        "--env-file",
        str(Path(__file__).resolve().parents[1] / f".state/{port}.env"),
        "-f",
        str(Path(__file__).resolve().parents[1] / "docker-compose.yml"),
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
    out = subprocess.check_output(cmd, text=True)
    rows = []
    for line in out.strip().splitlines():
        if not line:
            continue
        parts = line.split(",")
        if len(parts) < 5:
            continue
        oid, total, sub_incl, sub_excl, created = parts[:5]
        rows.append(
            {
                "order_id": int(oid),
                "order_total": float(total),
                "order_subtotal_incl_tax": float(sub_incl),
                "order_subtotal_excl_tax": float(sub_excl),
                "created_on_utc": created,
            }
        )
    return rows


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--since-utc", required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    rows = fetch_orders(args.port, args.since_utc)
    args.out.write_text(json.dumps(rows, indent=2))
    print(f"Wrote {len(rows)} orders to {args.out}")


if __name__ == "__main__":
    main()
