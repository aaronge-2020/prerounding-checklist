#!/usr/bin/env python3
"""Score one raw hybrid output file (jsonl checkpoints or json array) against
the benchmark gold: strict exact-span binary P/R/F1 (primary) + per-category.
Usage: score_r2.py <raw_file> [max_docs]"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "harness"))
from score import GOLD_MAP, EXCLUDED_GOLD, PRED_MAP, CATEGORIES, prf  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sample.jsonl"


def load_gold():
    gold_docs = {}
    for line in open(DATA):
        r = json.loads(line)
        gold_spans, excluded = [], set()
        for s in r["privacy_mask"]:
            lab = s["label"]
            if lab in GOLD_MAP:
                gold_spans.append((s["start"], s["end"], GOLD_MAP[lab]))
            elif lab in EXCLUDED_GOLD:
                excluded.add((s["start"], s["end"]))
            else:
                raise ValueError(f"unmapped gold label: {lab}")
        gold_docs[r["id"]] = {"gold": gold_spans, "excluded": excluded}
    return gold_docs


def load_raw(path):
    path = Path(path)
    docs = []
    if path.suffix == ".jsonl":
        for line in open(path):
            line = line.strip()
            if line:
                docs.append(json.loads(line))
    else:
        docs = json.load(open(path))
    return docs


def score_docs(gold_docs, docs, max_docs=None):
    docs = docs[:max_docs] if max_docs else docs
    tp = fp = fn = 0
    cat = {c: [0, 0, 0] for c in CATEGORIES}
    for d in docs:
        g = gold_docs[d["id"]]
        gold_spans = [(s, e, c) for s, e, c in g["gold"]]
        gold_set = {(s, e) for s, e, _ in gold_spans}
        gold_cat = {(s, e): c for s, e, c in gold_spans}
        pred_list = []
        for e in d["entities"]:
            key = (e["start"], e["end"])
            if key in g["excluded"]:
                continue
            pred_list.append((key, PRED_MAP.get(e["label"])))
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
    return {"binary": prf(tp, fp, fn),
            "per_category": {c: prf(*v) for c, v in cat.items()},
            "n_docs": len(docs)}


def main():
    raw_path = sys.argv[1]
    max_docs = int(sys.argv[2]) if len(sys.argv) > 2 else None
    gold_docs = load_gold()
    docs = load_raw(raw_path)
    result = score_docs(gold_docs, docs, max_docs)
    b = result["binary"]
    print(f"docs={result['n_docs']}  P={b['precision']} R={b['recall']} F1={b['f1']} "
          f"(tp={b['tp']} fp={b['fp']} fn={b['fn']})")
    for c, m in result["per_category"].items():
        print(f"  {c:9s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} "
              f"(tp={m['tp']} fp={m['fp']} fn={m['fn']})")
    return result


if __name__ == "__main__":
    main()
