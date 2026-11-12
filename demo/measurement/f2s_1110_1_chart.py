#!/usr/bin/env python3
"""Build before/after bar chart from measurement JSON files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--feature", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    b = json.loads(args.baseline.read_text())["metrics"]
    f = json.loads(args.feature.read_text())["metrics"]

    labels = [
        "AOV ($)",
        "Orders ≥ $75 (share)",
        "Orders > $75 (share)",
        "Cart→checkout\n($50–$75 carts)",
    ]

    def pct(v):
        return (v * 100) if v is not None else 0.0

    baseline_vals = [
        b.get("aov") or 0,
        pct(b.get("share_orders_subtotal_ge_75")),
        pct(b.get("share_orders_subtotal_gt_75")),
        pct(b.get("cart_to_checkout_conv_near_threshold_50_75")),
    ]
    feature_vals = [
        f.get("aov") or 0,
        pct(f.get("share_orders_subtotal_ge_75")),
        pct(f.get("share_orders_subtotal_gt_75")),
        pct(f.get("cart_to_checkout_conv_near_threshold_50_75")),
    ]

    x = range(len(labels))
    w = 0.35
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.bar([i - w / 2 for i in x], baseline_vals, width=w, label="Baseline", color="#6b7280")
    ax.bar([i + w / 2 for i in x], feature_vals, width=w, label="Feature", color="#2563eb")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_title("F2S-1110-1 simulated shoppers — before/after")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=150)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
