#!/usr/bin/env python3
"""WS4 final analysis: per-type comparison table + per-category F1 matrix.

Reads scoring/<type>/results/results.json (verbatim score.py output) and
prints the comparison used in REPORT.md. Also computes a simple
cross-type spread diagnostic (max-min F1 across types, overall and per
category) to answer the degradation question quantitatively.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TYPES = ["discharge", "nursing", "progress"]
CATS = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB",
        "LOCATION", "ADDRESS", "ID"]


def main():
    res = {}
    for t in TYPES:
        res[t] = json.load(open(ROOT / "scoring" / t / "results" / "results.json"))
    print("PER-TYPE BINARY EXACT-SPAN (hybrid primary)")
    print(f"{'type':10s} {'P':>7s} {'R':>7s} {'F1':>7s} {'tp':>4s} {'fp':>4s} {'fn':>4s}")
    f1s = {}
    for t in TYPES:
        m = res[t]["modes"]["hybrid"]["binary_exact_span"]
        f1s[t] = m["f1"]
        print(f"{t:10s} {m['precision']:7.4f} {m['recall']:7.4f} {m['f1']:7.4f} "
              f"{m['tp']:4d} {m['fp']:4d} {m['fn']:4d}")
    print(f"\ncross-type F1 spread (max-min): {max(f1s.values())-min(f1s.values()):.4f}")
    for mode in ("hybrid", "model-only"):
        print(f"\nPER-CATEGORY EXACT-SPAN F1 ({mode})")
        print(f"{'category':9s} {'discharge':>9s} {'nursing':>9s} {'progress':>9s} {'spread':>7s}")
        for c in CATS:
            vals = [res[t]["modes"][mode]["per_category_exact_span"][c]["f1"]
                    for t in TYPES]
            print(f"{c:9s} {vals[0]:9.4f} {vals[1]:9.4f} {vals[2]:9.4f} "
                  f"{max(vals)-min(vals):7.4f}")
    print("\nSECONDARY (hybrid): overlap F1 / char-level F1")
    for t in TYPES:
        m = res[t]["modes"]["hybrid"]
        print(f"  {t:10s} overlap={m['secondary_binary_overlap']['f1']:.4f} "
              f"char={m['secondary_char_level_binary']['f1']:.4f} "
              f"med_lat={m['latency_ms']['median']}ms p95={m['latency_ms']['p95']}ms")
    print("\nMODEL LOAD (per results dir):")
    for t in TYPES:
        li = json.load(open(ROOT / "scoring" / t / "results" / "load_info.json"))
        print(f"  {t:10s} {li['ms']:.0f}ms {li.get('modelId')}")


if __name__ == "__main__":
    main()
