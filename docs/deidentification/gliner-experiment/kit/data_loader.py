"""Load the frozen MedDeID test-100 split. Paths are relative to this kit,
so the experiment runs from a plain clone with no machine-specific setup.
"""

import json
import os

_KIT_DIR = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(os.path.dirname(_KIT_DIR), "data")


def _load_json(name):
    with open(os.path.join(_DATA_DIR, name)) as f:
        return json.load(f)


def _load_jsonl(name):
    recs = []
    with open(os.path.join(_DATA_DIR, name)) as f:
        for line in f:
            line = line.strip()
            if line:
                recs.append(json.loads(line))
    return recs


def load_test100():
    """Return (gold_by_id, notes_by_id, trackd_preds_by_id) for the frozen
    test-100 split.

    - gold_by_id: note_id -> list of gold spans
      ({begin, end, text, type, meddeid_label})
    - notes_by_id: note_id -> note text
    - trackd_preds_by_id: note_id -> Stanford+Track D prediction entities
      (the frozen 0.8718 F1 baseline; do not recompute or modify)
    """
    gold = {r["id"]: r["spans"] for r in _load_json("gold_test100.json")}
    notes = {r["id"]: r["text"] for r in _load_jsonl("notes_test100.jsonl")}
    preds = {r["id"]: r["entities"]
             for r in _load_json("stanford_trackd_test100.json")}
    assert set(gold) == set(notes) == set(preds), \
        "test-100 data files disagree on note ids"
    return gold, notes, preds


def test100_ids():
    return sorted(_load_json("gold_test100.json") and
                  [r["id"] for r in _load_json("gold_test100.json")])
