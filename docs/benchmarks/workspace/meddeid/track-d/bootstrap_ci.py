#!/usr/bin/env python3
"""Bootstrap 95% CIs for Track D F1 scores (resample notes, 1000 reps).
Usage: bootstrap_ci.py <tag1> [tag2 ...] [--paired tagA tagB]
- For each tag: loads out/<tag>.json, computes dev F1, bootstraps 1000
  resamples of notes (with replacement), reports 95% CI.
- --paired: bootstrap paired difference (F1_A - F1_B) on same resamples.
Uses the same exact-span machinery as score_dev.py.
"""
import json
import sys
import random
from pathlib import Path
from collections import Counter

ROOT = Path("/home/hatch/workspace/deid-benchmark/meddeid")
SEED = 20260930
N_REPS = 1000

def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f

def load_counts(tag):
    """Per-note (tp, fp, fn) for dev notes."""
    dev_ids = set(json.load(open(ROOT / "track-d" / "split.json"))["dev_ids"])
    gold = {g["id"]: g["spans"] for g in json.load(open(ROOT / "gold.json")) if g["id"] in dev_ids}
    preds = {r["id"]: r["entities"] for r in json.load(open(ROOT / "out" / f"{tag}.json"))}
    per_note = {}
    for gid, gspans in gold.items():
        gset = {(s["begin"], s["end"], s["type"]) for s in gspans}
        pset = {(e["begin"], e["end"], e["type"]) for e in preds.get(gid, [])}
        tp = len(gset & pset)
        fp = len(pset - gset)
        fn = len(gset - pset)
        per_note[gid] = (tp, fp, fn)
    return per_note

def f1_of(counts):
    tp = sum(c[0] for c in counts)
    fp = sum(c[1] for c in counts)
    fn = sum(c[2] for c in counts)
    return prf(tp, fp, fn)[2]

def bootstrap_ci(per_note, seed=SEED, n_reps=N_REPS):
    rng = random.Random(seed)
    ids = list(per_note.keys())
    n = len(ids)
    f1s = []
    for _ in range(n_reps):
        sample = [per_note[rng.choice(ids)] for _ in range(n)]
        f1s.append(f1_of(sample))
    f1s.sort()
    lo = f1s[int(0.025 * n_reps)]
    hi = f1s[int(0.975 * n_reps)]
    return lo, hi

def main():
    args = sys.argv[1:]
    tags = []
    paired = None
    i = 0
    while i < len(args):
        if args[i] == "--paired":
            paired = (args[i+1], args[i+2])
            i += 3
        else:
            tags.append(args[i])
            i += 1

    results = {}
    for tag in tags:
        per_note = load_counts(tag)
        f1 = f1_of(list(per_note.values()))
        lo, hi = bootstrap_ci(per_note)
        results[tag] = (f1, lo, hi)
        print(f"{tag}: F1={f1:.4f}  95% CI [{lo:.4f}, {hi:.4f}]  (n={len(per_note)} notes, {N_REPS} reps, seed={SEED})")

    if paired:
        tagA, tagB = paired
        pa = load_counts(tagA)
        pb = load_counts(tagB)
        # Paired: same note resamples for both
        rng = random.Random(SEED)
        ids = list(pa.keys())
        n = len(ids)
        diffs = []
        for _ in range(N_REPS):
            samp_ids = [rng.choice(ids) for _ in range(n)]
            fa = f1_of([pa[i] for i in samp_ids])
            fb = f1_of([pb[i] for i in samp_ids])
            diffs.append(fa - fb)
        diffs.sort()
        lo = diffs[int(0.025 * N_REPS)]
        hi = diffs[int(0.975 * N_REPS)]
        mean_diff = sum(diffs) / len(diffs)
        # Two-sided p-value: proportion of diffs on the opposite side of 0 from the mean
        if mean_diff >= 0:
            p_val = 2 * sum(1 for d in diffs if d <= 0) / N_REPS
        else:
            p_val = 2 * sum(1 for d in diffs if d >= 0) / N_REPS
        p_val = min(p_val, 1.0)
        print(f"\nPaired {tagA} - {tagB}: mean diff={mean_diff:+.4f}  95% CI [{lo:+.4f}, {hi:+.4f}]  p={p_val:.4f}")

if __name__ == "__main__":
    main()
