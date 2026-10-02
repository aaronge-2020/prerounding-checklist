"""Scoring for the GLiNER experiment. Same scorer and schema as the frozen
baseline (schemas/score.py + meddeid-15.json, system "local"), so numbers
are directly comparable to the 0.8718 F1 / 0.9532 character-recall baseline.
"""

import os
import random
import sys

_KIT_DIR = os.path.dirname(os.path.abspath(__file__))
_SCHEMAS_DIR = os.path.join(os.path.dirname(_KIT_DIR), "schemas")
sys.path.insert(0, _SCHEMAS_DIR)

from score import score_notes, summarize  # noqa: E402
from adapter import load_schema  # noqa: E402

SCHEMA = load_schema("meddeid-15")
SYSTEM = "local"


def exact_scores(gold_by_id, preds_by_id):
    """Score predictions against gold. Returns the summarize() dict with
    exact_span (p, r, f1, f1_ci95, tp, fp, fn), char_recall (r, ci95),
    per_type, and overlap sections.
    """
    gold_notes = [{"id": nid, "spans": spans}
                  for nid, spans in gold_by_id.items()]
    per_note = score_notes(gold_notes, preds_by_id, SCHEMA, SYSTEM)
    return summarize(per_note, SCHEMA, SYSTEM)


def paired_f1_diff(gold_by_id, preds_a, preds_b, n_reps=1000, seed=20261001):
    """Paired bootstrap 95% CI for (F1_a - F1_b) on the same note resamples.

    Resamples notes with replacement (fixed seed), recomputing exact-span F1
    for both systems on each resample. Returns
    {"f1_a":..., "f1_b":..., "diff":..., "ci95":(lo, hi)}.
    """
    gold_notes = [{"id": nid, "spans": spans}
                  for nid, spans in gold_by_id.items()]
    pa = {n["id"]: n for n in score_notes(gold_notes, preds_a, SCHEMA, SYSTEM)}
    pb = {n["id"]: n for n in score_notes(gold_notes, preds_b, SCHEMA, SYSTEM)}
    ids = sorted(set(pa) & set(pb))

    def f1(counts):
        tp = sum(c["tp"] for c in counts)
        fp = sum(c["fp"] for c in counts)
        fn = sum(c["fn"] for c in counts)
        p = tp / (tp + fp) if (tp + fp) else 0.0
        r = tp / (tp + fn) if (tp + fn) else 0.0
        return 2 * p * r / (p + r) if (p + r) else 0.0

    f1_a = f1([pa[i] for i in ids])
    f1_b = f1([pb[i] for i in ids])
    rng = random.Random(seed)
    diffs = []
    for _ in range(n_reps):
        s = [rng.choice(ids) for _ in range(len(ids))]
        diffs.append(f1([pa[i] for i in s]) - f1([pb[i] for i in s]))
    diffs.sort()
    lo = diffs[int(0.025 * n_reps)]
    hi = diffs[int(0.975 * n_reps)]
    return {"f1_a": f1_a, "f1_b": f1_b, "diff": f1_a - f1_b,
            "ci95": (lo, hi)}
