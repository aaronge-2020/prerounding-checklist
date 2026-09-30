#!/usr/bin/env python3
"""Test-scoped exact-span scorer for Track D. Scores out/<tag>.json
against gold.json restricted to track-d test_ids. Usage: score_test.py <tag>"""
import json
import sys
from pathlib import Path
from collections import Counter

ROOT = Path("/home/hatch/workspace/deid-benchmark/meddeid")
tag = sys.argv[1]
test_ids = set(json.load(open(ROOT / "track-d" / "split.json"))["test_ids"])
gold = {g["id"]: g["spans"] for g in json.load(open(ROOT / "gold.json")) if g["id"] in test_ids}
preds = {r["id"]: r["entities"] for r in json.load(open(ROOT / "out" / f"{tag}.json"))}

def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f

tot = Counter()
per_type = {}
for gid, gspans in gold.items():
    gset = {(s["begin"], s["end"], s["type"]) for s in gspans}
    pset = {(e["begin"], e["end"], e["type"]) for e in preds.get(gid, [])}
    for s in gset | pset:
        t = s[2]
        per_type.setdefault(t, Counter())[("tp" if s in gset & pset else "fp" if s in pset else "fn")] += 1
    tot["tp"] += len(gset & pset)
    tot["fp"] += len(pset - gset)
    tot["fn"] += len(gset - pset)

p, r, f = prf(tot["tp"], tot["fp"], tot["fn"])
print(f"{tag} test (n={len(test_ids)} notes): P={p:.4f} R={r:.4f} F1={f:.4f}  (tp={tot['tp']} fp={tot['fp']} fn={tot['fn']})")
print(f"{'type':<15} {'P':>6} {'R':>6} {'F1':>6}  tp/fp/fn")
for t in sorted(per_type):
    c = per_type[t]
    pp, rr, ff = prf(c["tp"], c["fp"], c["fn"])
    print(f"{t:<15} {pp:.3f} {rr:.3f} {ff:.3f}  {c['tp']}/{c['fp']}/{c['fn']}")
