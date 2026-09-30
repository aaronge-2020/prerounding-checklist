#!/usr/bin/env python3
"""Score one round-2 survey model's HYBRID run with the stock score.py logic.

Round 2 benchmarks hybrid mode only (per the round-2 tasking), so this scores
just the hybrid file rather than score.py's hardcoded hybrid+model-only pair.
The exact-span counting is the stock harness/score.py code path verbatim:
this module imports score.py and reuses its GOLD_MAP / PRED_MAP /
CATEGORIES / EXCLUDED_GOLD / prf / greedy_overlap_match, and the per-mode
scoring block below is copied from score.py's main() unchanged apart from
being driven for a single mode.

Usage: python3 score_round2.py --slug <slug>
Reads models-survey/results-round2/{load_info_<slug>.json, raw_<slug>_hybrid.json}
Writes models-survey/results-round2/results_<slug>.json
"""
import argparse
import collections
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # models-survey/
R2 = os.path.join(ROOT, "results-round2")
DATA = os.path.join(os.path.dirname(ROOT), "data", "sample.jsonl")
MANIFEST = os.path.join(os.path.dirname(ROOT), "data", "sample_manifest.json")

spec = importlib.util.spec_from_file_location(
    "bench_score", os.path.join(os.path.dirname(ROOT), "harness", "score.py"))
bench_score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench_score)

# Round-2 label remaps (normalized pipeline label -> canonical category).
# All four round-2 candidates emit labels the app's phiLabelMap already
# normalizes to canonical categories (PATIENT NAME, PHONE, EMAIL, DATE, ...)
# or to binary-only labels (ORGANIZATION, FACILITY, ...), exactly like
# deid-bert-i2b2 in round 1 — so no extra remap is needed for any of them.
ROUND2_REMAP = {
    "deid-roberta-i2b2": {},
    "openmed-small": {},
    "openmed-clinicale5-small": {},
    "openmed-small": {},
    "openmed-clinicale5-small": {},
    "openmed-clinicale5-small": {},
    "ensemble-stanford-roberta": {},
    "resync2": {},
    "deid-roberta-i2b2": {},
    "openmed-small": {},
    "openmed-clinicale5-small": {},
}


def score_hybrid(preds, gold_docs, manifest):
    tp = fp = fn = 0
    cat = {c: [0, 0, 0] for c in bench_score.CATEGORIES}
    otp = ofp = ofn = 0
    ocat = {c: [0, 0, 0] for c in bench_score.CATEGORIES}
    ctp = cfp = cfn = 0
    unmapped_pred_labels = collections.Counter()
    lat = []
    n_gold_docs = 0
    for doc_id, g in gold_docs.items():
        d = preds[doc_id]
        lat.append(d["ms"])
        gold_spans = [(s, e, c) for s, e, c in g["gold"]]
        gold_set = {(s, e) for s, e, _ in gold_spans}
        gold_cat = {(s, e): c for s, e, c in gold_spans}
        if gold_set:
            n_gold_docs += 1
        pred_list = []
        for e in d["entities"]:
            key = (e["start"], e["end"])
            if key in g["excluded"]:
                continue
            pred_list.append((key, bench_score.PRED_MAP.get(e["label"])))
            if e["label"] not in bench_score.PRED_MAP:
                unmapped_pred_labels[e["label"]] += 1
        pred_set = {k for k, _ in pred_list}
        pred_cat = dict(pred_list)

        tp += len(gold_set & pred_set)
        fp += len(pred_set - gold_set)
        fn += len(gold_set - pred_set)

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

        p_spans = [(s, e, c) for (s, e), c in pred_list]
        t2, f2, n2, pairs = bench_score.greedy_overlap_match(gold_spans, p_spans)
        otp += t2
        ofp += f2
        ofn += n2
        for (gs, ge, gc), (ps, pe, pc) in pairs:
            if gc == pc:
                ocat[gc][0] += 1
            else:
                ocat[gc][2] += 1
                if pc in ocat:
                    ocat[pc][1] += 1
        matched_gold = {(gs, ge) for (gs, ge, _), _ in pairs}
        matched_pred = {(ps, pe) for _, (ps, pe, _) in pairs}
        for s, e, gc in gold_spans:
            if (s, e) not in matched_gold:
                ocat[gc][2] += 1
        for (s, e), pc in pred_list:
            if (s, e) not in matched_pred and pc in ocat:
                ocat[pc][1] += 1

        text_len = len(g["text"])
        gold_chars = bytearray(text_len)
        for s, e, _ in gold_spans:
            for i in range(s, min(e, text_len)):
                gold_chars[i] = 1
        pred_chars = bytearray(text_len)
        for (s, e), _ in pred_list:
            for i in range(s, min(e, text_len)):
                pred_chars[i] = 1
        for i in range(text_len):
            if gold_chars[i] and pred_chars[i]:
                ctp += 1
            elif pred_chars[i]:
                cfp += 1
            elif gold_chars[i]:
                cfn += 1

    lat_sorted = sorted(lat)
    n = len(lat_sorted)
    return {
        "n_docs": n,
        "n_docs_with_gold": n_gold_docs,
        "binary_exact_span": bench_score.prf(tp, fp, fn),
        "per_category_exact_span": {c: bench_score.prf(*cat[c]) for c in bench_score.CATEGORIES},
        "secondary_binary_overlap": bench_score.prf(otp, ofp, ofn),
        "secondary_per_category_overlap": {c: bench_score.prf(*ocat[c]) for c in bench_score.CATEGORIES},
        "secondary_char_level_binary": bench_score.prf(ctp, cfp, cfn),
        "unmapped_predicted_labels": dict(unmapped_pred_labels),
        "latency_ms": {
            "mean": round(sum(lat) / n, 1),
            "median": round(lat_sorted[n // 2], 1),
            "p95": round(lat_sorted[int(n * 0.95)], 1),
            "max": round(lat_sorted[-1], 1),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    args = ap.parse_args()
    slug = args.slug
    mapping = ROUND2_REMAP.get(slug)
    if mapping is None:
        raise SystemExit(f"no round-2 remap defined for slug {slug!r}")

    manifest = json.load(open(MANIFEST))
    gold_docs = {}
    for line in open(DATA):
        r = json.loads(line)
        gold_spans = []
        excluded_spans = set()
        for s in r["privacy_mask"]:
            lab = s["label"]
            if lab in bench_score.GOLD_MAP:
                gold_spans.append((s["start"], s["end"], bench_score.GOLD_MAP[lab]))
            elif lab in bench_score.EXCLUDED_GOLD:
                excluded_spans.add((s["start"], s["end"]))
            else:
                raise ValueError(f"unmapped gold label: {lab}")
        gold_docs[r["id"]] = {"gold": gold_spans, "excluded": excluded_spans,
                             "text": r["source_text"]}

    docs = json.load(open(os.path.join(R2, f"raw_{slug}_hybrid.json")))
    for doc in docs:  # apply (empty) label remap, same contract as remap_labels.py
        for e in doc["entities"]:
            if e["label"] in mapping:
                e["label"] = mapping[e["label"]]
    preds = {d["id"]: d for d in docs}
    assert set(preds) == set(gold_docs), "id mismatch"

    out = {"slug": slug,
           "gold_label_mapping": bench_score.GOLD_MAP,
           "excluded_gold_labels": sorted(bench_score.EXCLUDED_GOLD),
           "dataset": manifest["dataset"],
           "dataset_doi": manifest["dataset_doi"],
           "dataset_split_file": manifest["split_file"],
           "sample_seed": manifest["seed"],
           "n_sampled": manifest["sampled_n"],
           "manifest": "data/sample_manifest.json",
           "scorer": "harness/score.py logic (hybrid mode only)",
           "modes": {"hybrid": score_hybrid(preds, gold_docs, manifest)}}

    load_info = json.load(open(os.path.join(R2, f"load_info_{slug}.json")))
    out["model_load_ms"] = round(load_info["ms"], 1)
    out["model_id"] = load_info.get("modelId")
    out["load_info_extra"] = {k: v for k, v in load_info.items()
                              if k not in ("ms", "modelId")}

    dst = os.path.join(R2, f"results_{slug}.json")
    json.dump(out, open(dst, "w"), indent=2)
    b = out["modes"]["hybrid"]["binary_exact_span"]
    lat = out["modes"]["hybrid"]["latency_ms"]
    print(f"{slug} hybrid: P={b['precision']} R={b['recall']} F1={b['f1']} "
          f"(tp={b['tp']} fp={b['fp']} fn={b['fn']})")
    print(f"  latency median={lat['median']}ms p95={lat['p95']}ms max={lat['max']}ms")
    print("wrote", dst)


if __name__ == "__main__":
    main()
