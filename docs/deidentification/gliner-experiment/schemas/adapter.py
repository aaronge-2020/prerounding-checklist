#!/usr/bin/env python3
"""Schema adapter: the only schema-dependent component in the evaluation.

Every dataset's gold schema is declared as a JSON config mapping each gold
type to the set of prediction labels each system may use for it. Scoring
code never branches on a schema name; it only asks this adapter whether a
(gold type, predicted label, system) triple is acceptable.

A predicted span therefore counts as a true positive only when:
  1. its (begin, end) offsets exactly match a gold span, and
  2. the adapter accepts its label for that gold span's type and system.

Everything else (character recall, overlap, bootstrap CIs) is label-agnostic.
"""
import json
from pathlib import Path

SCHEMA_DIR = Path(__file__).resolve().parent


def load_schema(name):
    """Load a schema config, e.g. 'technetium-7' -> technetium-7.json."""
    path = SCHEMA_DIR / f"{name}.json"
    with open(path) as f:
        return json.load(f)


def acceptable(schema, gold_type, pred_label, system):
    """True if pred_label is an acceptable prediction for gold_type."""
    entry = schema["accept"].get(gold_type)
    if entry is None:
        return False
    return pred_label in entry.get(system, [])


def gold_types_for_pred(schema, pred_label, system):
    """Gold types whose accept set contains pred_label (FP attribution)."""
    return [gt for gt, entry in schema["accept"].items()
            if pred_label in entry.get(system, [])]
