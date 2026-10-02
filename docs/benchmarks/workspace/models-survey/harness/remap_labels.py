#!/usr/bin/env python3
"""Remap a candidate model's normalized pipeline labels to the benchmark's
canonical scoring categories so score.py's PRED_MAP applies equally to every
model. Entities the app's phiLabelMap already normalizes to canonical labels
(PATIENT NAME, PHONE, EMAIL, DATE, ...) need no remap; this covers only the
extra labels each candidate's checkpoint emits. Binary exact-span scoring is
offset-based and is unaffected by relabeling; this changes only the
per-category tables. Rule-emitted labels (hybrid mode) are canonical already
and pass through untouched.
Usage: python3 remap_labels.py <slug> <in_raw.json> <out_raw.json>
"""
import json
import sys

# Additional per-model mappings: normalized label -> canonical category.
# See comparison.md for the rationale of each row.
REMAP = {
    "deid-bert-i2b2": {},
    "bert-small-pii": {
        "FINANCIAL": "ID",
        "IBAN CODE": "ID",
        "US BANK NUMBER": "ID",
        "US ITIN": "ID",
        "CREDIT CARD": "ID",
        "US LICENSE PLATE": "ID",
    },
    "piiranha": {
        "BUILDINGNUM": "ADDRESS",
        "DATEOFBIRTH": "DOB",
        "IDCARDNUM": "ID",
        "DRIVERLICENSENUM": "ID",
        "SOCIALNUM": "ID",
        "TAXNUM": "ID",
        "CREDITCARDNUMBER": "ID",
        "ACCOUNTNUM": "ID",
    },
    "multilang-pii-ner": {
        "BUILDINGNUM": "ADDRESS",
        "IDCARDNUM": "ID",
        "SOCIALNUM": "ID",
        "DRIVERLICENSENUM": "ID",
        "TAXNUM": "ID",
        "CREDITCARDNUMBER": "ID",
        "PASSPORTNUM": "ID",
    },
}

# Labels with no gold counterpart at all: leave them so score.py counts them
# binary-only (COORDINATE, PASSWORD, NRP, GENDER, SEX, AGE, FACILITY, ...).
CANONICAL = {"NAME", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME", "PHONE",
             "EMAIL", "DATE", "TIME", "DOB", "LOCATION", "ADDRESS", "ID",
             "MRN", "ENCOUNTER ID", "IP"}

def main():
    slug, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    mapping = REMAP.get(slug)
    if mapping is None:
        raise SystemExit(f"no remap defined for slug {slug!r}")
    docs = json.load(open(src))
    n = 0
    for doc in docs:
        for e in doc["entities"]:
            lab = e["label"]
            if lab in mapping:
                e["label"] = mapping[lab]
                n += 1
            elif lab not in CANONICAL:
                # leave as-is: score.py counts binary-only, same as the
                # baseline's ORGANIZATION/FACILITY/AGE/PHI labels
                pass
    json.dump(docs, open(dst, "w"))
    print(f"{slug}: remapped {n} entity labels -> {dst}")

if __name__ == "__main__":
    main()
