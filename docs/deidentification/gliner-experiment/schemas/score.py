#!/usr/bin/env python3
"""Unified fair scorer: identical metrics for every system on every schema.

Usage:
  score.py --schema technetium-7 --system local \
      --gold ../technetium-asq/tc_sample_gold.json \
      --preds ../technetium-asq/out/tc_stanford.json [--tag tc_stanford] [--over-redaction]

Scoring semantics (identical to the banked score_ta.py, 2026-09-30/10-01):
  - exact span: TP iff (begin,end) matches a gold span AND the adapter accepts
    the predicted label for that gold type and system; each gold span matched once.
  - FP attribution: an FP is attributed to every gold type whose accept set
    contains the predicted label (per-type precision denominators).
  - character recall: label-agnostic, |gold chars covered by any prediction| / |gold chars|.
  - overlap F1: greedy 1:1, predicted span TP iff it overlaps an unmatched gold
    span with an acceptable label.
  - CIs: note-level bootstrap, 1000 resamples, seed 20260930, percentile 95%.
  - over-redaction (opt-in): fraction of gold-empty notes with any prediction,
    plus the rate excluding notes flagged only by the age label.

The only schema-dependent input is the adapter config. Both systems are
scored through the same schema file with their own accept sets.
"""
import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from adapter import load_schema, acceptable, gold_types_for_pred

SEED = 20260930
N_REPS = 1000


def prf(tp, fp, fn):
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f


def score_notes(gold_notes, pred_map, schema, system):
    per_note = []
    for g in gold_notes:
        gid = g["id"]
        gspans = g["spans"]
        gmap = {(s["begin"], s["end"]): s["type"] for s in gspans}
        pspans = pred_map.get(gid, [])
        matched_gold = set()
        tp = fp = 0
        tcounts = Counter()
        for e in pspans:
            key = (e["begin"], e["end"])
            gt = gmap.get(key)
            if (gt is not None and acceptable(schema, gt, e["type"], system)
                    and key not in matched_gold):
                tp += 1
                matched_gold.add(key)
                tcounts[(gt, "tp")] += 1
            else:
                fp += 1
                for gtype in gold_types_for_pred(schema, e["type"], system):
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
                         "tc": tcounts, "id": gid,
                         "n_pred": len(pspans),
                         "gspans": gspans, "pspans": pspans})
    return per_note


def summarize(per_note, schema, system, age_label="AGE"):
    TP = sum(n["tp"] for n in per_note)
    FP = sum(n["fp"] for n in per_note)
    FN = sum(n["fn"] for n in per_note)
    p, r, f = prf(TP, FP, FN)
    gc = sum(n["gc"] for n in per_note)
    cc = sum(n["cc"] for n in per_note)
    char_r = cc / gc if gc else 0.0

    otp = ofp = ofn = 0
    for n in per_note:
        used = set()
        for gs in n["gspans"]:
            best, bestov = -1, 0
            for pi, pe in enumerate(n["pspans"]):
                if pi in used or not acceptable(schema, gs["type"], pe["type"], system):
                    continue
                ov = min(gs["end"], pe["end"]) - max(gs["begin"], pe["begin"])
                if ov > bestov:
                    best, bestov = pi, ov
            if best >= 0:
                otp += 1
                used.add(best)
            else:
                ofn += 1
        ofp += len(n["pspans"]) - len(used)
    op, orr, of1 = prf(otp, ofp, ofn)

    rng = random.Random(SEED)
    ids = list(range(len(per_note)))
    f1s, crs = [], []
    for _ in range(N_REPS):
        s = [per_note[ids[rng.randrange(len(ids))]] for _ in ids]
        tp2 = sum(x["tp"] for x in s)
        fp2 = sum(x["fp"] for x in s)
        fn2 = sum(x["fn"] for x in s)
        f1s.append(prf(tp2, fp2, fn2)[2])
        gc2 = sum(x["gc"] for x in s)
        cc2 = sum(x["cc"] for x in s)
        crs.append(cc2 / gc2 if gc2 else 0.0)
    f1s.sort()
    crs.sort()
    f1_ci = (f1s[int(0.025 * N_REPS)], f1s[int(0.975 * N_REPS)])
    cr_ci = (crs[int(0.025 * N_REPS)], crs[int(0.975 * N_REPS)])

    per_type = {}
    for gtype in schema["gold_types"]:
        tp = sum(n["tc"][(gtype, "tp")] for n in per_note)
        fp = sum(n["tc"][(gtype, "fp")] for n in per_note)
        fn = sum(n["tc"][(gtype, "fn")] for n in per_note)
        pp, rr, ff = prf(tp, fp, fn)
        per_type[gtype] = {"p": pp, "r": rr, "f1": ff,
                           "tp": tp, "fp": fp, "fn": fn}
    return {
        "n_notes": len(per_note),
        "schema": schema["schema"],
        "system": system,
        "exact_span": {"p": p, "r": r, "f1": f, "tp": TP, "fp": FP, "fn": FN,
                       "f1_ci95": [round(f1_ci[0], 4), round(f1_ci[1], 4)]},
        "overlap": {"p": round(op, 4), "r": round(orr, 4), "f1": round(of1, 4),
                    "tp": otp, "fp": ofp, "fn": ofn},
        "char_recall": {"r": char_r, "ci95": [round(cr_ci[0], 4), round(cr_ci[1], 4)],
                        "gold_chars": gc, "covered": cc},
        "per_type": per_type,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True)
    ap.add_argument("--system", required=True, choices=["local", "google"])
    ap.add_argument("--gold", required=True)
    ap.add_argument("--preds", required=True)
    ap.add_argument("--tag", default=None)
    ap.add_argument("--over-redaction", action="store_true",
                    help="report flag rate on gold-empty notes (ASQ-PHI hard negatives)")
    ap.add_argument("--age-label", default="AGE")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    schema = load_schema(args.schema)
    gold = json.load(open(args.gold))
    preds_raw = json.load(open(args.preds))
    pred_map = {r["id"]: r["entities"] for r in preds_raw}

    per_note = score_notes(gold, pred_map, schema, args.system)
    s = summarize(per_note, schema, args.system, args.age_label)

    if args.over_redaction:
        neg_notes = [n for n in per_note if not n["gspans"]]
        flagged = sum(1 for n in neg_notes if n["n_pred"] > 0)
        flagged_nonage = sum(
            1 for n in neg_notes
            if any(e["type"] != args.age_label for e in n["pspans"]))
        s["over_redaction"] = {
            "n_neg": len(neg_notes), "flagged": flagged,
            "rate": flagged / len(neg_notes) if neg_notes else 0.0,
            "flagged_nonage": flagged_nonage,
            "rate_nonage": flagged_nonage / len(neg_notes) if neg_notes else 0.0}

    e, c = s["exact_span"], s["char_recall"]
    tag = args.tag or Path(args.preds).stem
    line = (f"{tag}: F1={e['f1']:.4f} [{e['f1_ci95'][0]:.4f},{e['f1_ci95'][1]:.4f}] "
            f"P={e['p']:.4f} R={e['r']:.4f} "
            f"overlapF1={s['overlap']['f1']:.4f} "
            f"charR={c['r']:.4f} [{c['ci95'][0]:.4f},{c['ci95'][1]:.4f}] n={s['n_notes']}")
    if "over_redaction" in s:
        o = s["over_redaction"]
        line += (f" overRedact={o['rate']:.4f} ({o['flagged']}/{o['n_neg']})"
                 f" nonAge={o['rate_nonage']:.4f}")
    print(line)
    print("  per-type:")
    for gt, t in sorted(s["per_type"].items()):
        print(f"    {gt:32s} P={t['p']:.4f} R={t['r']:.4f} F1={t['f1']:.4f} "
              f"({t['tp']}/{t['fp']}/{t['fn']})")
    if args.out:
        json.dump({tag: s}, open(args.out, "w"), indent=2)
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
