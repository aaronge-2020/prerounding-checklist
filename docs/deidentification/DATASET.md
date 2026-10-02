# MedDeID English synthetic clinical benchmark — dataset notes

## Provenance

- **Hugging Face repo:** `stighellemans/meddeid-english-synthetic-benchmark` (split: `test`, 300 rows)
- **License:** CC BY 4.0 — exact strings from the dataset card: front matter
  `license: cc-by-4.0`; Licence section: "The benchmark and included guideline
  are licensed under CC BY 4.0." The bundled LICENSE file confirms
  "Creative Commons Attribution 4.0 International License (CC BY 4.0)".
  CC BY 4.0 permits benchmarking use with attribution (share/adapt, including
  commercially, with credit, licence link, and indication of changes).
- **Zenodo DOI:** 10.5281/zenodo.22689857 (dataset citation: Hellemans et al. 2026,
  *MedDeID English synthetic clinical corpus, benchmark and annotation guideline* (v3))
- **Paper:** Hellemans, S., Stroobants, T., Scheurwegs, E., Meysman, P.,
  Jorens, P. G., and Laukens, K. (2026). *MedDeID enables locally governed
  clinical-text de-identification from real or synthetic training data*.
  arXiv:2609.10049.
- **Release:** `meddeid-english-synthetic-human-validated-v1`, human-validated
  2026-08-26. The card asks that the test split be used only for final
  evaluation — not for training, threshold/prompt/rule development, or model
  selection.
- **Download date:** 2026-09-30. Raw snapshot (11 files) in `raw/`.
- **Content:** 300 synthetic English clinical documents (150 en-GB, 150 en-US),
  1,717 primary PII spans, 7,358 confirmed subannotation segments.
  No real patient data. 6 document types × 50: laboratory_report,
  referral_letter, nursing_note, clinic_note, emergency_note, discharge_summary.
  Text length 878–3,132 chars (median 1,638).

## Files in this directory

| File | Description |
|---|---|
| `raw/` | Untouched HF snapshot: `data/test.jsonl`, `README.md`, `LICENSE`, `CHECKSUMS.sha256`, `guidelines/`, `provenance/`, `source/` |
| `notes.jsonl` | Runner input: one JSON per line — `{id, text, source_text, locale, document_type}`. `text` and `source_text` are identical (`source_text` is an alias so the existing Playwright driver pattern works unchanged). |
| `gold.json` | Gold standard: JSON array of `{id, spans: [{begin, end, text, type, meddeid_label}]}`. `type` is our PHI schema type after mapping (see LABEL_MAPPING.md); `meddeid_label` preserves the original label for per-label analysis. |
| `LABEL_MAPPING.md` | Explicit MedDeID → our-schema mapping table with justifications. |
| `convert.py` | Reproducible conversion script (raw → notes.jsonl + gold.json). |
| `.venv/` | Python venv used for download/conversion (kept for follow-up work). |

## Row structure (raw `data/test.jsonl`)

Each row: `document_id` (str, unique, e.g. `en-gb-synthetic-00029`), `text`
(str, full clinical note), `spans` (list), `annotated` (bool, always true),
`metadata_json` (str — JSON with generation metadata: `lang`, `document_type`,
patient/caregiver names, `synthetic: true`, etc.).

Each span: `begin`, `end` (int, Python/JS-compatible — see quirks), `text`
(str, exact slice of `text`), `label` (one of 14 canonical labels), `category`
(label prefix before `:`), `subtype` (suffix after `:`, or null), `confirmed`
(bool, always true), `source_slot` (generation slot, e.g. `patient.mrn` —
used for the AGE/DOB, EMAIL/PHONE, MRN/ID splits), `span_id`, `subannotations`
(fine-grained sub-segments; every character of each span is accounted for).

## Label distribution (all 14 canonical labels present)

| MedDeID label | Count |
|---|---|
| Name:Patient | 340 |
| ID:Patient | 266 |
| Name:Caregiver | 186 |
| Date | 160 |
| Age_Birthdate | 144 |
| Organization:Healthcare | 141 |
| Name:Other | 118 |
| Address_Location:Patient | 108 |
| Contactdetails | 99 |
| ID:Caregiver | 58 |
| Profession | 39 |
| Organization:Other | 28 |
| Address_Location:Other | 18 |
| Address_Location:Caregiver | 12 |
| **Total** | **1,717** |

## Data quirks (scoring-relevant)

1. **Offsets are exact.** All 1,717 spans satisfy `text[begin:end] == span.text`
   (verified programmatically, 0 mismatches); the release manifest also records
   `offset_errors: 0`.
2. **No overlapping spans** within any note; no empty texts; all 300
   `document_id`s unique.
3. **Unicode:** 195/300 notes contain non-ASCII characters, but all are in the
   Basic Multilingual Plane (en/em dashes, bullets, smart quotes, µ, °, ×,
   sub/superscript digits, å, ñ) — no astral-plane characters, so Python
   code-point offsets and JavaScript UTF-16 offsets are identical. Safe to
   score in either language.
4. **Ambiguous labels need the documented splits:** Age_Birthdate mixes birth
   dates and ages; Contactdetails mixes emails and phones; ID:Patient mixes
   MRNs, accession IDs, and national IDs. The conversion splits these on
   `source_slot` (see LABEL_MAPPING.md) — do not map these labels 1:1.
5. **Subannotations exist but are not used** in `gold.json`; only the 1,717
   primary spans are scored. The subannotation layer (7,358 segments) is
   available in `raw/` for finer-grained analysis later.
6. **Card-level usage note:** the benchmark is for final evaluation only —
   do not tune thresholds, prompts, or rules against it.
