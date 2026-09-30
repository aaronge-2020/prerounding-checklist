#!/usr/bin/env python3
"""Round 3 scorer: full 7,946-row ai4privacy benchmark.

Replicates harness/score.py's PRIMARY metric exactly:
- Binary exact-span P/R/F1: gold_set={(start,end)} of mapped gold spans;
  pred_set={(start,end)} of predictions (predictions exactly matching an
  excluded gold span are ignored, not scored). Type is IGNORED for binary.
- Per-category: exact-span + label agreement via PRED_MAP/GOLD_MAP categories.
Adds: bootstrap 95% CIs (note-level, 10k resamples, seed 42) for F1, and
latency (mean/median/p95) from per-doc ms in the driver output.

Usage: python3 round3/score.py <tag>   (reads round3/out/<tag>.json)
       prints one result line + appends to round3/results.jsonl
"""
import json
import random
import statistics
import sys
from pathlib import Path

ROOT = Path("/home/hatch/workspace/deid-benchmark/round3")
GOLD = json.load(open(ROOT / "gold_full.json"))

PRED_MAP = {
    "NAME": "NAME", "PATIENT NAME": "NAME", "PROVIDER NAME": "NAME",
    "CONTACT NAME": "NAME",
    "PHONE": "PHONE", "EMAIL": "EMAIL", "DATE": "DATE", "TIME": "TIME",
    "DOB": "DOB", "LOCATION": "LOCATION", "ADDRESS": "ADDRESS",
    "ID": "ID", "MRN": "ID", "ENCOUNTER ID": "ID", "IP": "IP",
}
CATEGORIES = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB",
              "LOCATION", "ADDRESS", "ID", "IP"]


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f


def score_config(tag):
    preds = {d["id"]: d for d in json.load(open(ROOT / "out" / f"{tag}.json"))}
    assert set(preds) == set(GOLD), f"id mismatch in {tag}"

    per_note = []          # (tp, fp, fn) binary per note, for bootstrap
    cat = {c: [0, 0, 0] for c in CATEGORIES}
    ms_all = []
    unmapped = {}
    for doc_id, gspans in GOLD.items():
        d = preds[doc_id]
        if isinstance(d.get("ms"), (int, float)):
            ms_all.append(d["ms"])
        gold_spans = [(s["begin"], s["end"], s["type"]) for s in gspans if s["type"] != "__EXCLUDED__"]
        excluded = {(s["begin"], s["end"]) for s in gspans if s["type"] == "__EXCLUDED__"}
        gold_set = {(s, e) for s, e, _ in gold_spans}
        gold_cat = {(s, e): c for s, e, c in gold_spans}
        pred_list = []
        for e in d["entities"]:
            key = (e["start"], e["end"])
            if key in excluded:
                continue
            pred_list.append((key, PRED_MAP.get(e["label"])))
            if e["label"] not in PRED_MAP:
                unmapped[e["label"]] = unmapped.get(e["label"], 0) + 1
        pred_set = {k for k, _ in pred_list}
        pred_cat = dict(pred_list)

        tp = len(gold_set & pred_set)
        fp = len(pred_set - gold_set)
        fn = len(gold_set - pred_set)
        per_note.append((tp, fp, fn))

        for key in gold_set | pred_set:
            gc = gold_cat.get(key)
            pc = pred_cat.get(key)
            if gc and pc:
                if gc == pc:
                    cat[gc][0] += 1
                else:
                    cat[gc][2] += 1
                    if pc in cat:
                        cat[pc][1] += 1
            elif gc:
                cat[gc][2] += 1
            elif pc in cat:
                cat[pc][1] += 1

    TP = sum(t[0] for t in per_note)
    FP = sum(t[1] for t in per_note)
    FN = sum(t[2] for t in per_note)
    p, r, f = prf(TP, FP, FN)

    rng = random.Random(42)
    n = len(per_note)
    f1s = []
    for _ in range(10000):
        s = [per_note[rng.randrange(n)] for _ in range(n)]
        _, _, f2 = prf(sum(t[0] for t in s), sum(t[1] for t in s), sum(t[2] for t in s))
        f1s.append(f2)
    f1s.sort()

    ms_all.sort()
    lat = {}
    if ms_all:
        lat = {"mean_ms": round(statistics.mean(ms_all), 1),
               "median_ms": round(statistics.median(ms_all), 1),
               "p95_ms": round(ms_all[min(len(ms_all) - 1, int(0.95 * len(ms_all)))], 1),
               "n": len(ms_all)}

    cat_out = {}
    for c in CATEGORIES:
        cp, cr, cf = prf(*cat[c])
        cat_out[c] = {"precision": round(cp, 4), "recall": round(cr, 4),
                      "f1": round(cf, 4), "tp": cat[c][0], "fp": cat[c][1], "fn": cat[c][2]}

    return {
        "config": tag,
        "binary": {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
                   "tp": TP, "fp": FP, "fn": FN,
                   "f1_ci95": [round(f1s[250], 4), round(f1s[9750], 4)]},
        "per_category": cat_out,
        "latency": lat,
        "unmapped_pred_labels": unmapped,
    }


if __name__ == "__main__":
    tag = sys.argv[1]
    res = score_config(tag)
    b = res["binary"]
    line = (f"{tag}: P={b['precision']:.4f} R={b['recall']:.4f} F1={b['f1']:.4f} "
            f"CI=[{b['f1_ci95'][0]:.4f},{b['f1_ci95'][1]:.4f}] "
            f"tp={b['tp']} fp={b['fp']} fn={b['fn']} "
            f"lat_med={res['latency'].get('median_ms')}ms p95={res['latency'].get('p95_ms')}ms")
    print(line, flush=True)
    json.dump(res, open(ROOT / "out" / f"{tag}.score.json", "w"), indent=2)
