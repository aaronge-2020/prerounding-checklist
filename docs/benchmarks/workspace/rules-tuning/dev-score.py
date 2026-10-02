#!/usr/bin/env python3
"""Dev-set scorer: same exact-span logic as harness/score.py, but scores one
raw output file against the 700-text dev set (rows[0:700] of
data/sample.jsonl, manifest order). Usage:
  python3 dev-score.py <raw_json> [label]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "harness"))
# Reuse the pristine scorer's mappings/logic by importing its module pieces
# is awkward (it runs main on import), so the maps are duplicated here.
GOLD_MAP = {
    "GIVENNAME1": "NAME", "GIVENNAME2": "NAME",
    "LASTNAME1": "NAME", "LASTNAME2": "NAME", "LASTNAME3": "NAME",
    "TEL": "PHONE", "EMAIL": "EMAIL", "DATE": "DATE", "TIME": "TIME",
    "BOD": "DOB", "CITY": "LOCATION", "STATE": "LOCATION",
    "COUNTRY": "LOCATION", "POSTCODE": "LOCATION",
    "STREET": "ADDRESS", "BUILDING": "ADDRESS", "SECADDRESS": "ADDRESS",
    "IDCARD": "ID", "SOCIALNUMBER": "ID", "PASSPORT": "ID",
    "DRIVERLICENSE": "ID", "IP": "IP",
}
EXCLUDED_GOLD = {"USERNAME", "SEX", "TITLE", "PASS", "GEOCOORD", "CARDISSUER"}
PRED_MAP = {
    "NAME": "NAME", "PATIENT NAME": "NAME", "PROVIDER NAME": "NAME",
    "CONTACT NAME": "NAME", "PHONE": "PHONE", "EMAIL": "EMAIL",
    "DATE": "DATE", "TIME": "TIME", "DOB": "DOB", "LOCATION": "LOCATION",
    "ADDRESS": "ADDRESS", "ID": "ID", "MRN": "ID", "ENCOUNTER ID": "ID",
    "IP": "IP",
}
CATEGORIES = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB",
              "LOCATION", "ADDRESS", "ID", "IP"]


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return (round(p, 4), round(r, 4), round(f, 4), tp, fp, fn)


def main():
    raw_path = Path(sys.argv[1])
    label = sys.argv[2] if len(sys.argv) > 2 else raw_path.stem
    dev_rows = [json.loads(l) for l in open(ROOT / "data" / "sample.jsonl")][:700]
    gold_docs = {}
    for r in dev_rows:
        gold_spans, excluded = [], set()
        for s in r["privacy_mask"]:
            if s["label"] in GOLD_MAP:
                gold_spans.append((s["start"], s["end"], GOLD_MAP[s["label"]]))
            elif s["label"] in EXCLUDED_GOLD:
                excluded.add((s["start"], s["end"]))
        gold_docs[r["id"]] = (gold_spans, excluded)

    preds = {d["id"]: d for d in json.load(open(raw_path))}
    assert set(preds) == set(gold_docs), "id mismatch"

    tp = fp = fn = 0
    cat = {c: [0, 0, 0] for c in CATEGORIES}
    lat = []
    for doc_id, (gold_spans, excluded) in gold_docs.items():
        d = preds[doc_id]
        lat.append(d["ms"])
        gold_set = {(s, e) for s, e, _ in gold_spans}
        gold_cat = {(s, e): c for s, e, c in gold_spans}
        pred_list = [((e["start"], e["end"]), PRED_MAP.get(e["label"]))
                     for e in d["entities"]
                     if (e["start"], e["end"]) not in excluded]
        pred_set = {k for k, _ in pred_list}
        pred_cat = dict(pred_list)
        tp += len(gold_set & pred_set)
        fp += len(pred_set - gold_set)
        fn += len(gold_set - pred_set)
        for key in gold_set | pred_set:
            gc, pc = gold_cat.get(key), pred_cat.get(key)
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

    b = prf(tp, fp, fn)
    print(f"[{label}] dev binary exact-span: P={b[0]} R={b[1]} F1={b[2]} "
          f"(tp={b[3]} fp={b[4]} fn={b[5]})")
    for c in CATEGORIES:
        p, r, f, t2, f2, n2 = prf(*cat[c])
        print(f"  {c:9s} P={p:.3f} R={r:.3f} F1={f:.3f} (tp={t2} fp={f2} fn={n2})")
    lat_sorted = sorted(lat)
    print(f"  latency median={lat_sorted[len(lat_sorted)//2]:.0f}ms "
          f"p95={lat_sorted[int(len(lat_sorted)*0.95)]:.0f}ms")
    # machine-readable summary to stdout-adjacent file
    out = {"label": label, "binary": {"p": b[0], "r": b[1], "f1": b[2],
           "tp": b[3], "fp": b[4], "fn": b[5]},
           "per_category": {c: dict(zip(("p", "r", "f1", "tp", "fp", "fn"),
                                       prf(*cat[c]))) for c in CATEGORIES}}
    json.dump(out, open(raw_path.with_suffix(".score.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
