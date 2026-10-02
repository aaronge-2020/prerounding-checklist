#!/usr/bin/env python3
"""Per-category detail for candidate B2 threshold configs on dev rows."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_r2 import load_gold, load_raw, score_docs  # noqa: E402
from sweep_b2 import apply_threshold, ID_LABELS, NAME_LABELS, DATE_LABELS, OTHER_LABELS  # noqa: E402

baseline = sys.argv[1]
n_dev = int(sys.argv[2]) if len(sys.argv) > 2 else 700
gold_docs = load_gold()
docs = load_raw(baseline)[:n_dev]

configs = {
    "base": {},
    "ID@0.9": (ID_LABELS, 0.9),
    "ID@0.5": (ID_LABELS, 0.5),
    "NAME@0.9": (NAME_LABELS, 0.9),
    "DATE@0.9": (DATE_LABELS, 0.9),
}
for name, cfg in configs.items():
    d = apply_threshold(docs, *cfg) if cfg else docs
    r = score_docs(gold_docs, d)
    b = r["binary"]
    print(f"{name}: P={b['precision']:.4f} R={b['recall']:.4f} F1={b['f1']:.4f}")
    for c in ["NAME", "ID", "DATE", "PHONE"]:
        m = r["per_category"][c]
        print(f"    {c:6s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} tp={m['tp']} fp={m['fp']} fn={m['fn']}")
