#!/usr/bin/env python3
"""Dual scorer for the MedDeID clinical benchmark.

Metric 1 (primary): strict exact-span binary P/R/F1.
  A predicted span is a TP iff (begin, end, type) exactly matches a gold span.
  Type = our PHI schema type (gold.json already uses mapped types).

Metric 2 (their metric): character-level label-agnostic recall.
  For each note: fraction of gold-annotated characters covered by ANY
  predicted span (label ignored). Micro-averaged over all notes.
  This places us against their published comparator table:
    OBI RoBERTa i2b2: 86.64% | GLiNER: 90.27% | meddeid-english-synth: 99.96%

Also reports bootstrap 95% CIs (10k resamples, note-level) for F1 and char-recall.
"""
import json
import random
from pathlib import Path

ROOT = Path("/home/hatch/workspace/deid-benchmark/meddeid")
GOLD = json.load(open(ROOT / "gold.json"))
OUT = ROOT / "out"

CONFIGS = [
    "clinicale5_base", "clinicale5_trackb", "clinicale5_trackbc",
    "stanford_base", "stanford_trackb", "stanford_trackbc",
    "openmed_base", "openmed_trackbc",
    "roberta_base", "roberta_trackbc",
]

gold_by_id = {g["id"]: g["spans"] for g in GOLD}


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f


def score_config(name):
    preds = {r["id"]: r["entities"] for r in json.load(open(OUT / f"{name}.json"))}
    per_note = []  # (tp, fp, fn, gold_chars, covered_chars)
    for gid, gspans in gold_by_id.items():
        gold_set = {(s["begin"], s["end"], s["type"]) for s in gspans}
        pspans = preds.get(gid, [])
        pred_set = {(e["begin"], e["end"], e["type"]) for e in pspans}
        tp = len(gold_set & pred_set)
        fp = len(pred_set - gold_set)
        fn = len(gold_set - pred_set)
        # character-level label-agnostic recall
        gold_chars = set()
        for s in gspans:
            gold_chars.update(range(s["begin"], s["end"]))
        covered = set()
        for e in pspans:
            covered.update(range(e["begin"], e["end"]))
        covered_chars = len(gold_chars & covered)
        per_note.append((tp, fp, fn, len(gold_chars), covered_chars))

    # micro-averaged exact-span
    TP = sum(t[0] for t in per_note); FP = sum(t[1] for t in per_note); FN = sum(t[2] for t in per_note)
    p, r, f = prf(TP, FP, FN)
    # micro-averaged char recall
    gc = sum(t[3] for t in per_note); cc = sum(t[4] for t in per_note)
    char_r = cc / gc if gc else 0.0

    # bootstrap CIs (note-level, 10k resamples)
    rng = random.Random(42)
    n = len(per_note)
    f1s, crs = [], []
    for _ in range(10000):
        s = [per_note[rng.randrange(n)] for _ in range(n)]
        tp2 = sum(t[0] for t in s); fp2 = sum(t[1] for t in s); fn2 = sum(t[2] for t in s)
        _, _, f2 = prf(tp2, fp2, fn2)
        f1s.append(f2)
        gc2 = sum(t[3] for t in s); cc2 = sum(t[4] for t in s)
        crs.append(cc2 / gc2 if gc2 else 0.0)
    f1s.sort(); crs.sort()
    return {
        "config": name,
        "exact_span": {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
                       "tp": TP, "fp": FP, "fn": FN,
                       "f1_ci95": [round(f1s[250], 4), round(f1s[9750], 4)]},
        "char_recall": {"recall": round(char_r, 4),
                        "ci95": [round(crs[250], 4), round(crs[9750], 4)],
                        "gold_chars": gc, "covered_chars": cc},
    }


results = [score_config(c) for c in CONFIGS]
json.dump(results, open(ROOT / "scores.json", "w"), indent=2)

print(f"{'config':22s} {'P':>7s} {'R':>7s} {'F1':>7s} {'F1 CI':>17s} {'charR':>7s} {'charR CI':>17s}")
for s in results:
    e = s["exact_span"]; c = s["char_recall"]
    print(f"{s['config']:22s} {e['precision']:7.4f} {e['recall']:7.4f} {e['f1']:7.4f} "
          f"[{e['f1_ci95'][0]:.4f},{e['f1_ci95'][1]:.4f}] {c['recall']:7.4f} "
          f"[{c['ci95'][0]:.4f},{c['ci95'][1]:.4f}]")
