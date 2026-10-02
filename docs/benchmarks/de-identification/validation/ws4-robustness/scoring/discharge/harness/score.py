#!/usr/bin/env python3
"""Score the de-id benchmark: strict exact-span binary P/R/F1 (primary) plus
per-category P/R/F1 for cleanly mappable gold labels, for hybrid and
model-only runs.

Gold label mapping (ai4privacy/pii-masking-300k -> benchmark categories):
  GIVENNAME1/GIVENNAME2, LASTNAME1/2/3 -> NAME
  TEL -> PHONE | EMAIL -> EMAIL | DATE -> DATE | TIME -> TIME | BOD -> DOB
  CITY/STATE/COUNTRY/POSTCODE -> LOCATION
  STREET/BUILDING/SECADDRESS -> ADDRESS
  IDCARD/SOCIALNUMBER/PASSPORT/DRIVERLICENSE -> ID
  IP -> IP
Excluded (no defensible alignment; spans removed from gold, predictions
exactly matching them are ignored rather than scored): USERNAME, SEX, TITLE,
PASS, GEOCOORD.

App-side predicted labels are grouped the same way; the app's fine-grained
clinical labels fold in as: PATIENT NAME/PROVIDER NAME/CONTACT NAME -> NAME,
MRN/ENCOUNTER ID -> ID. Predicted labels with no mapped category
(ORGANIZATION, FACILITY, OCCUPATION, URL, ROOM, AGE, PHI) count toward binary
scoring but are reported separately, not in per-category tables.
"""
import json
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sample.jsonl"
RES = ROOT / "results"

GOLD_MAP = {
    "GIVENNAME1": "NAME", "GIVENNAME2": "NAME",
    "LASTNAME1": "NAME", "LASTNAME2": "NAME", "LASTNAME3": "NAME",
    "TEL": "PHONE",
    "EMAIL": "EMAIL",
    "DATE": "DATE",
    "TIME": "TIME",
    "BOD": "DOB",
    "CITY": "LOCATION", "STATE": "LOCATION", "COUNTRY": "LOCATION",
    "POSTCODE": "LOCATION",
    "STREET": "ADDRESS", "BUILDING": "ADDRESS", "SECADDRESS": "ADDRESS",
    "IDCARD": "ID", "SOCIALNUMBER": "ID", "PASSPORT": "ID",
    "DRIVERLICENSE": "ID",
    "IP": "IP",
}
EXCLUDED_GOLD = {"USERNAME", "SEX", "TITLE", "PASS", "GEOCOORD", "CARDISSUER"}

PRED_MAP = {
    "NAME": "NAME", "PATIENT NAME": "NAME", "PROVIDER NAME": "NAME",
    "CONTACT NAME": "NAME",
    "PHONE": "PHONE",
    "EMAIL": "EMAIL",
    "DATE": "DATE",
    "TIME": "TIME",
    "DOB": "DOB",
    "LOCATION": "LOCATION",
    "ADDRESS": "ADDRESS",
    "ID": "ID", "MRN": "ID", "ENCOUNTER ID": "ID",
    "IP": "IP",
}

CATEGORIES = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB",
              "LOCATION", "ADDRESS", "ID", "IP"]


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
            "tp": tp, "fp": fp, "fn": fn}


def overlap_len(a, b):
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def greedy_overlap_match(gold_spans, pred_spans):
    """Match predicted spans to gold spans (any character overlap). Each gold
    span matches at most one prediction (greedy by largest overlap). Returns
    (tp, fp, fn) counts and matched pairs with categories."""
    gold = list(gold_spans)   # (start, end, cat)
    pred = list(pred_spans)   # (start, end, cat)
    used = [False] * len(gold)
    tp = fp = 0
    pairs = []
    for p in pred:
        best, best_ov = -1, 0
        for i, g in enumerate(gold):
            if used[i]:
                continue
            ov = overlap_len(p, g)
            if ov > best_ov:
                best, best_ov = i, ov
        if best >= 0:
            used[best] = True
            tp += 1
            pairs.append((gold[best], p))
        else:
            fp += 1
    fn = sum(1 for u in used if not u)
    return tp, fp, fn, pairs


def main():
    manifest = json.load(open(DATA.parent / "sample_manifest.json"))
    gold_docs = {}
    for line in open(DATA):
        r = json.loads(line)
        gold_spans = []      # (start, end, category)
        excluded_spans = set()
        for s in r["privacy_mask"]:
            lab = s["label"]
            if lab in GOLD_MAP:
                gold_spans.append((s["start"], s["end"], GOLD_MAP[lab]))
            elif lab in EXCLUDED_GOLD:
                excluded_spans.add((s["start"], s["end"]))
            else:
                raise ValueError(f"unmapped gold label: {lab}")
        gold_docs[r["id"]] = {"gold": gold_spans, "excluded": excluded_spans,
                              "text": r["source_text"]}

    out = {"modes": {}, "gold_label_mapping": GOLD_MAP,
           "excluded_gold_labels": sorted(EXCLUDED_GOLD),
           "dataset": manifest["dataset"],
           "dataset_doi": manifest["dataset_doi"],
           "dataset_split_file": manifest["split_file"],
           "sample_seed": manifest["seed"],
           "n_sampled": manifest["sampled_n"],
           "manifest": "data/sample_manifest.json"}
    for mode, fname in (("hybrid", "raw_hybrid.json"),
                        ("model-only", "raw_modelonly.json")):
        preds = {d["id"]: d for d in json.load(open(RES / fname))}
        assert set(preds) == set(gold_docs), f"id mismatch in {fname}"

        tp = fp = fn = 0
        cat = {c: [0, 0, 0] for c in CATEGORIES}  # tp, fp, fn
        # Secondary (clearly labeled): overlap-based and character-level.
        otp = ofp = ofn = 0
        ocat = {c: [0, 0, 0] for c in CATEGORIES}
        ctp = cfp = cfn = 0
        ccat = {c: [0, 0, 0] for c in CATEGORIES}
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
                    continue  # excluded gold span: ignore, don't score
                pred_list.append((key, PRED_MAP.get(e["label"])))
                if e["label"] not in PRED_MAP:
                    unmapped_pred_labels[e["label"]] += 1
            pred_set = {k for k, _ in pred_list}
            pred_cat = dict(pred_list)

            # Binary exact-span (PRIMARY).
            tp += len(gold_set & pred_set)
            fp += len(pred_set - gold_set)
            fn += len(gold_set - pred_set)

            # Per-category exact-span + label agreement (PRIMARY).
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
                # predicted label with no mapped category: binary only

            # SECONDARY: entity-level, any character overlap counts as a match.
            p_spans = [(s, e, c) for (s, e), c in pred_list]
            t2, f2, n2, pairs = greedy_overlap_match(gold_spans, p_spans)
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
            # Unmatched gold/pred spans for overlap per-category accounting:
            matched_gold = {(gs, ge) for (gs, ge, _), _ in pairs}
            matched_pred = {(ps, pe) for _, (ps, pe, _) in pairs}
            for s, e, gc in gold_spans:
                if (s, e) not in matched_gold:
                    ocat[gc][2] += 1
            for (s, e), pc in pred_list:
                if (s, e) not in matched_pred and pc in ocat:
                    ocat[pc][1] += 1

            # SECONDARY: character-level binary (any coverage counts).
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
        out["modes"][mode] = {
            "n_docs": n,
            "n_docs_with_gold": n_gold_docs,
            "binary_exact_span": prf(tp, fp, fn),
            "per_category_exact_span": {c: prf(*cat[c]) for c in CATEGORIES},
            "secondary_binary_overlap": prf(otp, ofp, ofn),
            "secondary_per_category_overlap": {c: prf(*ocat[c]) for c in CATEGORIES},
            "secondary_char_level_binary": prf(ctp, cfp, cfn),
            "unmapped_predicted_labels": dict(unmapped_pred_labels),
            "latency_ms": {
                "mean": round(sum(lat) / n, 1),
                "median": round(lat_sorted[n // 2], 1),
                "p95": round(lat_sorted[int(n * 0.95)], 1),
                "max": round(lat_sorted[-1], 1),
            },
        }

    load_info = json.load(open(RES / "load_info.json"))
    out["model_load_ms"] = round(load_info["ms"], 1)
    out["model_id"] = load_info.get("modelId")

    json.dump(out, open(RES / "results.json", "w"), indent=2)
    m = out["modes"]
    for mode in ("hybrid", "model-only"):
        b = m[mode]["binary_exact_span"]
        print(f"{mode}: binary P={b['precision']} R={b['recall']} F1={b['f1']} "
              f"(tp={b['tp']} fp={b['fp']} fn={b['fn']})")
        print(f"  latency median={m[mode]['latency_ms']['median']}ms "
              f"p95={m[mode]['latency_ms']['p95']}ms")
    print("wrote", RES / "results.json")


if __name__ == "__main__":
    main()
