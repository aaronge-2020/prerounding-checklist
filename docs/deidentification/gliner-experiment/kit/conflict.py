"""Arm 3 conflict-resolution rule (preregistered, frozen).

Combine Stanford+Track D predictions with GLiNER predictions:
1. Start with all Track D predictions (deterministic, high-precision).
2. Add GLiNER predictions that do not overlap any Track D span.
3. For overlapping spans: keep Track D's span (deterministic wins ties).

This gives Track D priority on structured PHI (phones, IDs, dates) and
lets GLiNER fill gaps on names, facilities, and contextual PHI.
"""


def _overlaps(a, b):
    return a["begin"] < b["end"] and b["begin"] < a["end"]


def dedup_by_confidence(preds):
    """Arm 2 helper: resolve overlapping spans, keep highest confidence."""
    ranked = sorted(preds, key=lambda e: e.get("score", 0), reverse=True)
    kept = []
    for e in ranked:
        if not any(_overlaps(e, k) for k in kept):
            kept.append(e)
    return kept


def combine_trackd_gliner(trackd_preds, gliner_preds):
    """Arm 3: Track D spans win; GLiNER fills non-overlapping gaps."""
    combined = list(trackd_preds)
    for e in gliner_preds:
        if not any(_overlaps(e, t) for t in trackd_preds):
            combined.append(e)
    return combined
