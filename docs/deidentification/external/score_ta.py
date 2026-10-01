#!/usr/bin/env python3
"""Scorer for Technetium-I sample and ASQ-PHI benchmarks.

Metrics:
  1. Exact-span F1 (primary): predicted span is TP iff (begin, end) exactly
     matches a gold span AND predicted type is in the gold type's accepted
     group (type groups handle pipeline-vs-gold label granularity differences;
     see LABEL_GROUPS below). Micro-averaged.
  2. Per-gold-type P/R/F1 (diagnostic; FP may be attributed to multiple types
     when a predicted type sits in several groups — documented, not summed).
  3. Character-level label-agnostic recall: fraction of gold-annotated
     characters covered by ANY predicted span, micro-averaged.
  4. Bootstrap 95% CIs (1,000 note-level resamples, seed 20260930) for F1
     and char recall.
  5. ASQ-PHI only: over-redaction rate = fraction of hard-negative
     (zero-PHI) queries where the pipeline emits any span.

Usage:
  score_ta.py technetium <tag> [<tag> ...]
  score_ta.py asqphi <tag> [<tag> ...]
"""
import json
import random
import sys
from pathlib import Path
from collections import Counter

ROOT = Path("/home/hatch/workspace/deid-benchmark/technetium-asq")
SEED = 20260930
N_REPS = 1000

# gold type -> set of acceptable pipeline types
TC_GROUPS = {
    "NAME": {"PATIENT NAME", "NAME", "PROVIDER NAME"},
    "ID": {"MRN", "ID"},
    "DATE": {"DATE"},
    "DOB": {"DOB"},
    "AGE": {"AGE"},
    "PHONE": {"PHONE"},
    "EMAIL": {"EMAIL"},
    "LOCATION": {"LOCATION", "ADDRESS"},
}
ASQ_GROUPS = {
    "NAME": {"NAME", "PATIENT NAME", "PROVIDER NAME"},
    "GEOGRAPHIC_LOCATION": {"LOCATION", "FACILITY", "ORGANIZATION"},
    "DATE": {"DATE"},
    "MEDICAL_RECORD_NUMBER": {"MRN", "ID"},
    "HEALTH_PLAN_BENEFICIARY_NUMBER": {"ID"},
    "PHONE_NUMBER": {"PHONE"},
    "SOCIAL_SECURITY_NUMBER": {"ID"},
    "EMAIL_ADDRESS": {"EMAIL"},
    "UNIQUE_IDENTIFIER": {"ID"},
    "ACCOUNT_NUMBER": {"ID"},
    "FAX_NUMBER": {"PHONE", "ID"},
    "CERTIFICATE_LICENSE_NUMBER": {"ID"},
    "IP_ADDRESS": {"IP", "ID"},
}


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f


def load_data(dataset):
    if dataset == "technetium":
        gold = {g["id"]: g["spans"] for g in json.load(open(ROOT / "tc_sample_gold.json"))}
        groups = TC_GROUPS
    else:
        gold = {g["id"]: g["spans"] for g in json.load(open(ROOT / "asqphi_gold.json"))}
        groups = ASQ_GROUPS
    return gold, groups


def score_tag(dataset, tag):
    gold, groups = load_data(dataset)
    preds = {r["id"]: r["entities"] for r in json.load(open(ROOT / "out" / f"{tag}.json"))}
    per_note = []  # (tp, fp, fn, gold_chars, covered_chars, type_counts)
    for gid, gspans in gold.items():
        gmap = {(s["begin"], s["end"]): s["type"] for s in gspans}
        pspans = preds.get(gid, [])
        matched_gold = set()
        tp = fp = 0
        tcounts = Counter()
        for e in pspans:
            key = (e["begin"], e["end"])
            gt = gmap.get(key)
            if gt is not None and e["type"] in groups.get(gt, set()) and key not in matched_gold:
                tp += 1
                matched_gold.add(key)
                tcounts[(gt, "tp")] += 1
            else:
                fp += 1
                # attribute FP to gold types whose group contains this pred type
                for gtype, gset in groups.items():
                    if e["type"] in gset:
                        tcounts[(gtype, "fp")] += 1
        fn = 0
        for s in gspans:
            if (s["begin"], s["end"]) not in matched_gold:
                fn += 1
                tcounts[(s["type"], "fn")] += 1
        gold_chars = set()
        for s in gspans:
            gold_chars.update(range(s["begin"], s["end"]))
        covered = set()
        for e in pspans:
            covered.update(range(e["begin"], e["end"]))
        per_note.append({"tp": tp, "fp": fp, "fn": fn,
                         "gc": len(gold_chars),
                         "cc": len(gold_chars & covered),
                         "tc": tcounts,
                         "id": gid,
                         "n_pred": len(pspans),
                         "gspans": gspans,
                         "pspans": pspans})
    return per_note, groups


def summarize(per_note, groups):
    TP = sum(n["tp"] for n in per_note)
    FP = sum(n["fp"] for n in per_note)
    FN = sum(n["fn"] for n in per_note)
    p, r, f = prf(TP, FP, FN)
    gc = sum(n["gc"] for n in per_note)
    cc = sum(n["cc"] for n in per_note)
    char_r = cc / gc if gc else 0.0

    # overlap F1: 1:1 greedy, predicted span TP iff it overlaps a gold span
    # with type in the gold type's group (handles trailing-period/title
    # boundary noise between gold and pipeline conventions)
    otp = ofp = ofn = 0
    for n in per_note:
        gspans = n["gspans"]
        psp = n["pspans"]
        used = set()
        for gi, gs in enumerate(gspans):
            best, bestov = -1, 0
            for pi, pe in enumerate(psp):
                if pi in used or pe["type"] not in groups.get(gs["type"], set()):
                    continue
                ov = min(gs["end"], pe["end"]) - max(gs["begin"], pe["begin"])
                if ov > bestov:
                    best, bestov = pi, ov
            if best >= 0:
                otp += 1
                used.add(best)
            else:
                ofn += 1
        ofp += len(psp) - len(used)
    op, orr, of1 = prf(otp, ofp, ofn)

    rng = random.Random(SEED)
    ids = list(range(len(per_note)))
    f1s, crs = [], []
    for _ in range(N_REPS):
        s = [per_note[ids[rng.randrange(len(ids))]] for _ in ids]
        tp2 = sum(x["tp"] for x in s); fp2 = sum(x["fp"] for x in s); fn2 = sum(x["fn"] for x in s)
        f1s.append(prf(tp2, fp2, fn2)[2])
        gc2 = sum(x["gc"] for x in s); cc2 = sum(x["cc"] for x in s)
        crs.append(cc2 / gc2 if gc2 else 0.0)
    f1s.sort(); crs.sort()
    f1_ci = (f1s[int(0.025 * N_REPS)], f1s[int(0.975 * N_REPS)])
    cr_ci = (crs[int(0.025 * N_REPS)], crs[int(0.975 * N_REPS)])

    per_type = {}
    for gtype in groups:
        tp = sum(n["tc"][(gtype, "tp")] for n in per_note)
        fp = sum(n["tc"][(gtype, "fp")] for n in per_note)
        fn = sum(n["tc"][(gtype, "fn")] for n in per_note)
        pp, rr, ff = prf(tp, fp, fn)
        per_type[gtype] = {"p": pp, "r": rr, "f1": ff, "tp": tp, "fp": fp, "fn": fn}
    return {
        "n_notes": len(per_note),
        "exact_span": {"p": p, "r": r, "f1": f, "tp": TP, "fp": FP, "fn": FN,
                       "f1_ci95": [round(f1_ci[0], 4), round(f1_ci[1], 4)]},
        "overlap": {"p": round(op, 4), "r": round(orr, 4), "f1": round(of1, 4),
                    "tp": otp, "fp": ofp, "fn": ofn},
        "char_recall": {"r": char_r, "ci95": [round(cr_ci[0], 4), round(cr_ci[1], 4)],
                        "gold_chars": gc, "covered": cc},
        "per_type": per_type,
    }


def main():
    dataset = sys.argv[1]
    tags = sys.argv[2:]
    assert dataset in ("technetium", "asqphi"), "dataset must be technetium|asqphi"
    gold, _ = load_data(dataset)
    results = {}
    for tag in tags:
        per_note, groups = score_tag(dataset, tag)
        s = summarize(per_note, groups)
        # ASQ-PHI over-redaction on hard negatives
        if dataset == "asqphi":
            neg_ids = {gid for gid, gs in gold.items() if not gs}
            neg_notes = [n for n in per_note if n["id"] in neg_ids]
            flagged = sum(1 for n in neg_notes if n["n_pred"] > 0)
            # non-age over-redaction: AGE-only flags reflect the pipeline's
            # age-redaction policy vs a dataset that does not annotate ages
            preds_all = {r["id"]: r["entities"] for r in json.load(open(ROOT / "out" / f"{tag}.json"))}
            flagged_nonage = sum(1 for n in neg_notes
                                 if any(e["type"] != "AGE" for e in preds_all[n["id"]]))
            s["over_redaction"] = {"n_neg": len(neg_notes), "flagged": flagged,
                                   "rate": flagged / len(neg_notes) if neg_notes else 0.0,
                                   "flagged_nonage": flagged_nonage,
                                   "rate_nonage": flagged_nonage / len(neg_notes) if neg_notes else 0.0}
        results[tag] = s
        e = s["exact_span"]; c = s["char_recall"]
        line = (f"{tag}: F1={e['f1']:.4f} [{e['f1_ci95'][0]:.4f},{e['f1_ci95'][1]:.4f}] "
                f"P={e['p']:.4f} R={e['r']:.4f} "
                f"overlapF1={s['overlap']['f1']:.4f} (P={s['overlap']['p']:.4f} R={s['overlap']['r']:.4f}) "
                f"charR={c['r']:.4f} "
                f"[{c['ci95'][0]:.4f},{c['ci95'][1]:.4f}] n={s['n_notes']}")
        if "over_redaction" in s:
            o = s["over_redaction"]
            line += (f" overRedact={o['rate']:.4f} ({o['flagged']}/{o['n_neg']})"
                     f" nonAge={o['rate_nonage']:.4f} ({o['flagged_nonage']}/{o['n_neg']})")
        print(line)
        print("  per-type:")
        for gt, t in sorted(s["per_type"].items()):
            print(f"    {gt:32s} P={t['p']:.4f} R={t['r']:.4f} F1={t['f1']:.4f} "
                  f"({t['tp']}/{t['fp']}/{t['fn']})")
    json.dump(results, open(ROOT / f"{dataset}_scores.json", "w"), indent=2)
    print(f"wrote {dataset}_scores.json")


if __name__ == "__main__":
    main()
