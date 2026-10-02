#!/usr/bin/env python3
"""Utility-preservation measurement for ws5.

(a) NON-PHI TOKEN PRESERVATION: fraction of non-PHI tokens in the original
    note (exact, case-sensitive string match, multiset) still present in the
    redacted note after placeholder removal. Non-preserved tokens are
    classified into failure modes:
      - inside-pipeline-entity: PHI-expected label (false positive on clinical
        text), app-bucket label (FACILITY/ORGANIZATION/ROOM/OCCUPATION — by
        design), or other (TIME/AGE/...)
      - timeline-header normalization: the app renames "Admission Date:"-style
        field labels to "Timeline:" once the date is converted (by design)
      - other: manual review
(b) CLINICAL-ENTITY RETENTION:
      - ground-truth retention: % of authored clinical concepts whose exact
        string survives in the redacted note
      - extractor agreement: deterministic phrase-list extractor (lower-bound
        proxy) run on original vs redacted; Jaccard + directional agreement

Writes results/measurements.json and results/pairs/{id}_{original,redacted}.txt
"""
import json, os, re, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clinical_extractor import extract

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(BASE, "data", "notes.jsonl")
RAW = os.path.join(BASE, "results", "raw_run.json")
OUT = os.path.join(BASE, "results", "measurements.json")
PAIRS = os.path.join(BASE, "results", "pairs")

TOKEN_RX = re.compile(r"[A-Za-z0-9]+")
PLACEHOLDER_RX = re.compile(r"\[[^\[\]]*\]")

PHI_EXPECTED = {"PATIENT NAME", "PROVIDER NAME", "CONTACT NAME", "NAME", "DATE", "DOB",
                "PHONE", "EMAIL", "ADDRESS", "LOCATION", "MRN", "ENCOUNTER ID", "ID",
                "URL", "IP", "PHI"}
APP_BUCKET = {"FACILITY", "ORGANIZATION", "ROOM", "OCCUPATION"}

def tokenize(text):
    return [(m.group(0), m.start(), m.end()) for m in TOKEN_RX.finditer(text)]

def strip_placeholders(text):
    return PLACEHOLDER_RX.sub(" ", text).replace("**", " ")

def overlaps(a0, a1, b0, b1):
    return a0 < b1 and a1 > b0

def main():
    notes = [json.loads(l) for l in open(NOTES)]
    runs = {r["id"]: r for r in json.load(open(RAW))}
    assert set(runs) == {n["id"] for n in notes}, "note/run id mismatch"

    os.makedirs(PAIRS, exist_ok=True)

    tot_tokens = tot_pres = 0
    fail_modes = Counter()
    fail_detail = defaultdict(list)   # mode -> list of (note_id, token, context)
    gt_tot = gt_ret = 0
    gt_by_cat = defaultdict(lambda: [0, 0])
    jac_sum = dir_sum = dir_den = 0
    ext_o_tot = ext_r_tot = 0
    phi_covered = phi_total = 0
    per_note = []

    for n in notes:
        nid = n["id"]
        orig, red = n["text"], runs[nid]["redacted"]
        entities = runs[nid]["entities"]
        with open(os.path.join(PAIRS, f"{nid}_original.txt"), "w") as f: f.write(orig)
        with open(os.path.join(PAIRS, f"{nid}_redacted.txt"), "w") as f: f.write(red)

        # ---- (a) token preservation ----
        phi_intervals = [(s["start"], s["end"]) for s in n["phi_spans"] if s["category"] != "APP_BUCKET"]
        otoks = tokenize(orig)
        non_phi = [(t, a, b) for t, a, b in otoks
                   if not any(overlaps(a, b, s, e) for s, e in phi_intervals)]
        red_stripped = strip_placeholders(red)
        rcounter = Counter(t for t, _, _ in tokenize(red_stripped))
        o_lines = orig.split("\n"); r_lines = red_stripped.split("\n")
        line_of = {}
        # map char offset -> line index for original
        off = 0
        for li, ln in enumerate(o_lines):
            for p in range(off, off + len(ln) + 1):
                line_of[p] = li
            off += len(ln) + 1

        note_pres = 0
        for t, a, b in non_phi:
            tot_tokens += 1
            if rcounter[t] > 0:
                rcounter[t] -= 1; tot_pres += 1; note_pres += 1
                continue
            # failure classification
            hit = [e for e in entities if overlaps(a, b, e["start"], e["end"])]
            li = line_of.get(a)
            rline = r_lines[li].strip() if li is not None and li < len(r_lines) else ""
            ctx = o_lines[li].strip()[:110] if li is not None else ""
            if hit:
                lab = hit[0]["label"]
                if lab in PHI_EXPECTED: mode = f"entity:PHI-expected({lab})"
                elif lab in APP_BUCKET: mode = f"entity:app-bucket({lab})"
                else: mode = f"entity:other({lab})"
            elif rline.startswith("Timeline") or rline.startswith("Elapsed Time"):
                mode = "timeline-header-normalization"
            else:
                mode = "other-unexplained"
            fail_modes[mode] += 1
            fail_detail[mode].append((nid, t, ctx))

        # ---- (b) ground-truth retention ----
        seen = set()
        for c in n["clinical_concepts"]:
            key = (c["text"].lower(), c["category"])
            if key in seen: continue
            seen.add(key)
            gt_tot += 1
            gt_by_cat[c["category"]][1] += 1
            if c["text"].lower() in red_stripped.lower():
                gt_ret += 1; gt_by_cat[c["category"]][0] += 1

        # ---- (b) extractor agreement ----
        eo, er = extract(orig), extract(red_stripped)
        ext_o_tot += len(eo); ext_r_tot += len(er)
        inter = len(eo & er); union = len(eo | er)
        if union: jac_sum += inter / union
        if eo: dir_sum += inter / len(eo); dir_den += 1

        # ---- context: PHI coverage by the automated pass ----
        for s in n["phi_spans"]:
            if s["category"] == "APP_BUCKET": continue
            phi_total += 1
            if any(overlaps(s["start"], s["end"], e["start"], e["end"]) for e in entities):
                phi_covered += 1

        per_note.append({"id": nid, "non_phi_tokens": len(non_phi),
                         "preserved": note_pres,
                         "pct": round(100 * note_pres / len(non_phi), 2) if non_phi else None})

    summary = {
        "token_preservation": {
            "non_phi_tokens": tot_tokens,
            "preserved": tot_pres,
            "pct": round(100 * tot_pres / tot_tokens, 2),
        },
        "failure_modes": dict(fail_modes),
        "gt_concept_retention": {
            "concepts": gt_tot, "retained": gt_ret,
            "pct": round(100 * gt_ret / gt_tot, 2),
            "by_category": {k: {"retained": v[0], "total": v[1],
                                "pct": round(100 * v[0] / v[1], 2)} for k, v in gt_by_cat.items()},
        },
        "extractor_agreement": {
            "jaccard_macro_pct": round(100 * jac_sum / len(notes), 2),
            "directional_retained_pct": round(100 * dir_sum / dir_den, 2) if dir_den else None,
            "entities_original": ext_o_tot, "entities_redacted": ext_r_tot,
        },
        "context_phi_coverage_automated_pass": {
            "phi_spans": phi_total, "covered": phi_covered,
            "pct": round(100 * phi_covered / phi_total, 2),
        },
        "per_note": per_note,
    }
    with open(OUT, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"token preservation: {tot_pres}/{tot_tokens} = {100*tot_pres/tot_tokens:.2f}%")
    print("failure modes:")
    for k, v in fail_modes.most_common():
        print(f"  {v:5d}  {k}")
    print(f"GT concept retention: {gt_ret}/{gt_tot} = {100*gt_ret/gt_tot:.2f}%")
    for k, v in gt_by_cat.items():
        print(f"  {k:12s} {v[0]}/{v[1]} = {100*v[0]/v[1]:.2f}%")
    print(f"extractor jaccard: {100*jac_sum/len(notes):.2f}%  directional: {100*dir_sum/dir_den:.2f}%")
    print(f"context PHI coverage (automated pass): {phi_covered}/{phi_total} = {100*phi_covered/phi_total:.2f}%")
    print(f"wrote {OUT}")

    # dump unexplained failures for manual review
    unexpl = fail_detail.get("other-unexplained", [])
    if unexpl:
        print(f"\nUNEXPLAINED ({len(unexpl)}):")
        for nid, t, ctx in unexpl[:60]:
            print(f"  {nid} [{t}] :: {ctx}")

if __name__ == "__main__":
    main()
