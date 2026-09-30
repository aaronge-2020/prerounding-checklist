#!/usr/bin/env python3
"""B2 offline threshold sweep (one-factor-at-a-time) on dev rows 0-699.

Approximates the modelPredictionsToEntities per-type score filter by dropping
model-source entities below a threshold from the final raw output, then
re-scoring. This is optimistic (pre-merge scores <= post-merge max; alias
seeding effects ignored), so chosen thresholds stay conservative and are
verified with a real dev run afterward.
Usage: sweep_b2.py <baseline_jsonl> [n_dev=700]
"""
import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_r2 import load_gold, load_raw, score_docs  # noqa: E402

NAME_LABELS = {"NAME", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME"}
ID_LABELS = {"ID", "MRN", "ENCOUNTER ID"}
DATE_LABELS = {"DATE", "DOB", "TIME", "AGE"}
OTHER_LABELS = {"PHONE", "EMAIL", "LOCATION", "ADDRESS", "IP"}

GROUPS = {
    "NAME": (NAME_LABELS, [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99]),
    "ID": (ID_LABELS, [0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99]),
    "DATE": (DATE_LABELS, [0, 0.9, 0.95, 0.99, 0.995]),
    "OTHER": (OTHER_LABELS, [0, 0.7, 0.9, 0.95, 0.99]),
}


def apply_threshold(docs, labels, threshold):
    out = []
    for d in docs:
        ents = []
        for e in d["entities"]:
            if ("model" in str(e.get("source", "")) and
                    e.get("label") in labels and
                    (e.get("score") or 0) < threshold):
                continue
            ents.append(e)
        nd = dict(d)
        nd["entities"] = ents
        out.append(nd)
    return out


def main():
    baseline = sys.argv[1]
    n_dev = int(sys.argv[2]) if len(sys.argv) > 2 else 700
    gold_docs = load_gold()
    docs = load_raw(baseline)[:n_dev]
    print(f"dev docs: {len(docs)}")

    base = score_docs(gold_docs, docs)
    b = base["binary"]
    print(f"BASELINE dev: P={b['precision']} R={b['recall']} F1={b['f1']} "
          f"(tp={b['tp']} fp={b['fp']} fn={b['fn']})")

    for group, (labels, thresholds) in GROUPS.items():
        print(f"\n== {group} {sorted(labels)} ==")
        print(f"{'thr':>6} {'P':>7} {'R':>7} {'F1':>7} {'tp':>6} {'fp':>6} {'fn':>6}")
        for t in thresholds:
            r = score_docs(gold_docs, apply_threshold(docs, labels, t))
            m = r["binary"]
            flag = ""
            if m["precision"] < 0.60:
                flag = "  <-- BELOW PRECISION FLOOR"
            print(f"{t:>6} {m['precision']:>7.4f} {m['recall']:>7.4f} "
                  f"{m['f1']:>7.4f} {m['tp']:>6} {m['fp']:>6} {m['fn']:>6}{flag}")


if __name__ == "__main__":
    main()
