#!/usr/bin/env python3
"""Score WS1: automated pipeline vs simulated reviewer bounds.

Conditions:
  (a) accept-all (lower bound): reviewer accepts every suggestion, adds nothing.
      Post-review redaction set = all suggested spans.
      => residual PHI = gold characters not covered by any suggestion.
  (b) oracle (upper bound): accepts every suggestion overlapping real PHI,
      rejects the rest, and manually redacts every gold character left
      uncovered. Post-review P/R/F1 = 1.0 by construction; the finding is
      WHAT had to be added manually, per category.

Primary metric: exact-span (start+end+category). Secondaries: span-only
exact (category-insensitive), any-overlap entity match, character-level.
"""
import json
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent

PRED_MAP = {
    "PATIENT NAME": "PATIENT", "NAME": "PATIENT", "CONTACT NAME": "PATIENT",
    "PROVIDER NAME": "PROVIDER",
    "PHONE": "PHONE",
    "DATE": "DATE",
    "ADDRESS": "ADDRESS",
    "MRN": "ID", "ID": "ID", "ENCOUNTER ID": "ID",
    "AGE": "AGE",
    "DOB": "DATE",  # pipeline's birth-date label; gold folds DOBs into DATE
    "FACILITY": "FACILITY", "LOCATION": "FACILITY", "ORGANIZATION": "FACILITY",
}
# gold labels folded to scored categories (pipeline emits MRN/ID/ENCOUNTER ID;
# note generator uses MRN and HOSPITAL)
GOLD_FOLD = {"MRN": "ID", "HOSPITAL": "FACILITY"}
CATEGORIES = ["PATIENT", "PROVIDER", "DATE", "PHONE", "ADDRESS", "ID", "AGE", "FACILITY"]


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
            "tp": tp, "fp": fp, "fn": fn}


def overlap(a, b):
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def main():
    notes = [json.loads(l) for l in open(ROOT / "notes.jsonl")]
    pred_data = json.load(open(ROOT / "pipeline_suggestions.json"))
    preds = {d["id"]: d for d in pred_data["suggestions"]}
    assert set(preds) == {n["id"] for n in notes}

    def gold_spans(n):
        return [(a["start"], a["end"], GOLD_FOLD.get(a["label"], a["label"]))
                for a in n["entities"]]

    def pred_spans(d):
        out = []
        for e in d["entities"]:
            out.append((e["start"], e["end"], PRED_MAP.get(e["label"]), e["label"]))
        return out

    # ---- accumulators -----------------------------------------------------
    ex = [0, 0, 0]                       # binary exact-span tp/fp/fn
    ex_cat = {c: [0, 0, 0] for c in CATEGORIES}
    so = [0, 0, 0]                       # span-only exact (label-insensitive)
    ov = [0, 0, 0]                       # any-overlap greedy
    ctp = cfp = cfn = 0                  # char-level
    unmapped = collections.Counter()
    lat = []
    per_type = collections.defaultdict(lambda: [0, 0, 0])  # exact-span by note type

    accepted_total = rejected_total = 0
    manual_add = collections.Counter()    # gold spans not fully covered -> oracle adds
    manual_add_chars = collections.Counter()
    fully_missed = collections.Counter()
    residual_accept_all = collections.Counter()  # gold spans w/ zero suggestion overlap
    residual_chars = collections.Counter()
    overredact_chars = 0                 # non-gold chars inside accepted suggestions
    per_note = []

    for n in notes:
        d = preds[n["id"]]
        lat.append(d["ms"])
        gs = gold_spans(n)               # (s,e,cat)
        ps = pred_spans(d)               # (s,e,cat|None,raw)
        text_len = len(n["text"])
        for _, _, _, raw in ps:
            if raw not in PRED_MAP:
                unmapped[raw] += 1

        gold_set = {(s, e) for s, e, _ in gs}
        gold_cat = {(s, e): c for s, e, c in gs}
        pred_set = {(s, e) for s, e, _, _ in ps}
        pred_cat = {(s, e): c for s, e, c, _ in ps}

        # binary exact-span
        tp = len(gold_set & pred_set); fp = len(pred_set - gold_set); fn = len(gold_set - pred_set)
        ex[0] += tp; ex[1] += fp; ex[2] += fn
        per_type[n["note_type"]][0] += tp
        per_type[n["note_type"]][1] += fp
        per_type[n["note_type"]][2] += fn
        for key in gold_set | pred_set:
            gc, pc = gold_cat.get(key), pred_cat.get(key)
            if gc and pc:
                if gc == pc:
                    ex_cat[gc][0] += 1
                else:
                    ex_cat[gc][2] += 1
                    if pc in ex_cat:
                        ex_cat[pc][1] += 1
            elif gc:
                ex_cat[gc][2] += 1
            elif pc in ex_cat:
                ex_cat[pc][1] += 1

        # span-only exact
        stp = len(gold_set & pred_set)
        so[0] += stp; so[1] += len(pred_set - gold_set); so[2] += len(gold_set - pred_set)

        # char-level
        gch = bytearray(text_len); pch = bytearray(text_len)
        for s, e, _ in gs:
            for i in range(s, min(e, text_len)):
                gch[i] = 1
        for s, e, _, _ in ps:
            for i in range(s, min(e, text_len)):
                pch[i] = 1
        for i in range(text_len):
            if gch[i] and pch[i]:
                ctp += 1
            elif pch[i]:
                cfp += 1
            elif gch[i]:
                cfn += 1

        # any-overlap greedy (entity level, label-insensitive for binary)
        used = [False] * len(gs)
        otp = ofp = 0
        for (ps_, pe_, _, _) in ps:
            best, best_ov = -1, 0
            for i, (gss, gee, _) in enumerate(gs):
                if used[i]:
                    continue
                o = overlap((ps_, pe_), (gss, gee))
                if o > best_ov:
                    best, best_ov = i, o
            if best >= 0:
                used[best] = True; otp += 1
            else:
                ofp += 1
        ov[0] += otp; ov[1] += ofp; ov[2] += sum(1 for u in used if not u)

        # ---- reviewer simulation -----------------------------------------
        # accept a suggestion iff it overlaps any gold span (it flags real PHI)
        sug_cov = bytearray(text_len)
        for s, e, _, _ in ps:
            for i in range(s, min(e, text_len)):
                sug_cov[i] = 1
        for (s, e, _, _) in ps:
            if any(overlap((s, e), (gss, gee)) > 0 for gss, gee, _ in gs):
                accepted_total += 1
                for i in range(s, min(e, text_len)):
                    if not gch[i]:
                        overredact_chars += 1
            else:
                rejected_total += 1
        # gold spans: residual under accept-all (no overlap at all) vs oracle
        for (gss, gee, gc) in gs:
            ov_any = any(overlap((gss, gee), (s, e)) > 0 for s, e, _, _ in ps)
            uncovered = [i for i in range(gss, gee) if not sug_cov[i]]
            if not ov_any:
                residual_accept_all[gc] += 1
                residual_chars[gc] += gee - gss
                fully_missed[gc] += 1
            if uncovered:
                manual_add[gc] += 1
                manual_add_chars[gc] += len(uncovered)

        per_note.append({
            "id": n["id"], "note_type": n["note_type"],
            "n_gold": len(gs), "n_suggested": len(ps),
            "n_residual_spans": sum(1 for (gss, gee, _) in gs
                                    if not any(overlap((gss, gee), (s, e)) > 0
                                               for s, e, _, _ in ps)),
        })

    lat_sorted = sorted(lat)
    m = len(lat_sorted)
    out = {
        "model": pred_data["model"].get("modelId"),
        "n_notes": len(notes),
        "accept_all_lower_bound": {
            "binary_exact_span": prf(*ex),
            "span_only_exact": prf(*so),
            "overlap_entity": prf(*ov),
            "char_level": prf(ctp, cfp, cfn),
            "per_category_exact_span": {c: prf(*ex_cat[c]) for c in CATEGORIES},
            "per_note_type_exact_span": {t: prf(*v) for t, v in per_type.items()},
            "residual_phi_spans": dict(residual_accept_all),
            "residual_phi_chars": dict(residual_chars),
        },
        "oracle_upper_bound": {
            "note": ("By construction post-review precision=recall=F1=1.0: the oracle "
                     "rejects every non-overlapping suggestion and manually redacts "
                     "every uncovered gold character. The empirical finding is what "
                     "had to be added manually."),
            "post_review": {"precision": 1.0, "recall": 1.0, "f1": 1.0},
            "suggestions_accepted": accepted_total,
            "suggestions_rejected": rejected_total,
            "manual_additions_by_category": {c: {"spans_not_fully_covered": manual_add.get(c, 0),
                                                "uncovered_chars": manual_add_chars.get(c, 0)}
                                             for c in CATEGORIES},
            "fully_missed_by_category": dict(fully_missed),
            "overredacted_non_phi_chars": overredact_chars,
        },
        "unmapped_predicted_labels": dict(unmapped),
        "latency_ms": {"mean": round(sum(lat) / m, 1),
                       "median": round(lat_sorted[m // 2], 1),
                       "p95": round(lat_sorted[int(m * 0.95)], 1),
                       "max": round(lat_sorted[-1], 1)},
        "per_note": per_note,
    }
    json.dump(out, open(ROOT / "results.json", "w"), indent=2)

    a = out["accept_all_lower_bound"]
    b = a["binary_exact_span"]
    print(f"accept-all: exact P={b['precision']} R={b['recall']} F1={b['f1']} "
          f"(tp={b['tp']} fp={b['fp']} fn={b['fn']})")
    s = a["span_only_exact"]
    print(f"accept-all: span-only P={s['precision']} R={s['recall']} F1={s['f1']}")
    o = a["overlap_entity"]
    print(f"accept-all: overlap P={o['precision']} R={o['recall']} F1={o['f1']}")
    c = a["char_level"]
    print(f"accept-all: char P={c['precision']} R={c['recall']} F1={c['f1']}")
    print("oracle: accepted", accepted_total, "rejected", rejected_total,
          "manual-add spans", sum(manual_add.values()))
    print("manual additions by category:", dict(manual_add))
    print("unmapped predicted labels:", dict(unmapped))
    print("wrote", ROOT / "results.json")


if __name__ == "__main__":
    main()
