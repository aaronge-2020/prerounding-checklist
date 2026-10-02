#!/usr/bin/env python3
"""Stratified sample of ~1000 rows from ai4privacy/pii-masking-300k EN validation split.

Stratification: guarantee minimum coverage of every label that maps cleanly to
the pipeline's label set, include a slice of PII-free rows (precision on
negatives), then fill randomly. Deterministic via seed. Writes:
  - data/sample.jsonl          (id, source_text, privacy_mask for sampled rows)
  - data/sample_manifest.json  (sampling params + per-label coverage + id list)
"""
import json
import random

SEED = 42
TARGET_N = 1000
N_NO_PII = 60
MIN_PER_MAPPABLE_LABEL = 40

# Labels with a clean mapping to the pipeline's normalized label set
MAPPABLE = [
    "GIVENNAME1", "GIVENNAME2", "LASTNAME1", "LASTNAME2", "LASTNAME3",  # NAME
    "TEL",                                                             # PHONE
    "EMAIL",                                                           # EMAIL
    "DATE", "TIME",                                                    # DATE/TIME
    "BOD",                                                             # DOB
    "CITY", "STATE", "COUNTRY", "POSTCODE",                             # LOCATION
    "STREET", "BUILDING", "SECADDRESS",                                # ADDRESS
    "IDCARD", "SOCIALNUMBER", "PASSPORT", "DRIVERLICENSE",              # ID
    "IP",                                                              # IP
]

def main():
    rows = []
    with open("data/val_en.jsonl") as f:
        for line in f:
            rows.append(json.loads(line))
    rng = random.Random(SEED)

    by_id = {r["id"]: r for r in rows}
    label_to_ids = {}
    no_pii_ids = []
    for r in rows:
        masks = r.get("privacy_mask") or []
        if not masks:
            no_pii_ids.append(r["id"])
            continue
        for m in masks:
            label_to_ids.setdefault(m["label"], set()).add(r["id"])

    chosen = set()
    # 1. PII-free rows for negative precision measurement
    chosen.update(rng.sample(no_pii_ids, min(N_NO_PII, len(no_pii_ids))))
    # 2. Minimum coverage per mappable label
    for label in MAPPABLE:
        have = sum(1 for i in chosen if i in label_to_ids.get(label, ()))
        need = MIN_PER_MAPPABLE_LABEL - have
        if need > 0:
            pool = [i for i in label_to_ids.get(label, ()) if i not in chosen]
            chosen.update(rng.sample(pool, min(need, len(pool))))
    # 3. Random fill to target
    remaining = [r["id"] for r in rows if r["id"] not in chosen]
    rng.shuffle(remaining)
    for i in remaining:
        if len(chosen) >= TARGET_N:
            break
        chosen.add(i)

    sampled = [by_id[i] for i in sorted(chosen)]
    with open("data/sample.jsonl", "w") as f:
        for r in sampled:
            f.write(json.dumps({
                "id": r["id"],
                "source_text": r["source_text"],
                "privacy_mask": r.get("privacy_mask") or [],
            }) + "\n")

    coverage = {}
    for label in sorted(label_to_ids):
        coverage[label] = sum(1 for i in chosen if i in label_to_ids[label])
    manifest = {
        "dataset": "ai4privacy/pii-masking-300k",
        "dataset_doi": "10.57967/hf/1995",
        "split_file": "data/validation/1english_openpii_8k.jsonl",
        "split_rows_total": len(rows),
        "seed": SEED,
        "target_n": TARGET_N,
        "sampled_n": len(sampled),
        "n_no_pii_rows": sum(1 for r in sampled if not r.get("privacy_mask")),
        "mappable_labels": MAPPABLE,
        "min_per_mappable_label": MIN_PER_MAPPABLE_LABEL,
        "label_row_coverage": coverage,
        "ids": sorted(chosen),
        "license": "other (ai4privacy custom license; non-commercial research benchmarking use)",
    }
    with open("data/sample_manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"sampled {len(sampled)} rows; no-PII rows: {manifest['n_no_pii_rows']}")
    print("mappable label coverage:")
    for lab in MAPPABLE:
        print(f"  {lab}: {coverage.get(lab, 0)}")

if __name__ == "__main__":
    main()
