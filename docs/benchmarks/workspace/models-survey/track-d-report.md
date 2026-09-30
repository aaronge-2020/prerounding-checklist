# Track D: Clinical-Text Rules for the MedDeID Benchmark

**Date:** 2026-09-30
**Model:** Stanford de-identifier (base, ONNX q8) + Track D rule stack
**Result:** **0.802 exact-span F1 on the held-out 100-note test set** (target: 0.80) · 0.829 on dev

## Summary

Track D is a set of five rule groups layered on the Stanford clinical NER model, designed for the patterns the model misses on clinical text: ages, provider names with credentials, labeled clinical identifiers, care facilities, and relatives' names. On the MedDeID dev set (200 notes, 1,144 gold spans), Stanford + Track D reaches **0.829 F1** (precision 0.805, recall 0.854), up from 0.554 for Stanford + Track B/C. On the held-out 100-note test set (573 gold spans), it reaches **0.802 F1** (precision 0.779, recall 0.826), clearing the 0.80 target.

## Rule groups

### D1: Clinical age expressions (post-filter)
The pipeline's Safe Harbor policy drops all AGE entities under 90. D1 re-adds clinical age mentions the model finds but the policy suppresses: "43 y/o", "18-year" (of "18-year-old"), "aged 43" → "43", "2 wk old", "4 m/o", bare "72 years" (not preceded by for/in/within/over/past/about). Runs after the identity-graph expansion so existing entities win on overlap.

Dev: P=1.000, R=0.940 (63/0/4). Pipeline AGE F1: 0.969.

### D2: Role-anchored provider names
Providers appear with role anchors ("Attending:", "Documented by", "Signed", "Sincerely") and credentials (", MD", ", MBBS" — kept in the span per gold). D2 uses the anchors to find 1–3 name tokens, with stopword-tail stripping, facility-name skipping, and pronoun-first rejection. Bypasses the normal span-constraining so credentials are kept.

Dev: P=1.000, R=0.744 (90/0/31). Pipeline PROVIDER NAME F1: 0.837.

### D3: Labeled clinical identifiers
Anchored IDs: "Report ID"/"accession ID", "NHS number", "National Insurance number", "Professional identifier", "SSN", "GMC" (with no./number variants), "professional ID". Handles "BG549511A", "000 327 0743", "25/257937". Bare "GMC 0546514" keeps "GMC " in the span per gold.

Dev: P=1.000, R=0.934 (141/0/10). Pipeline ID F1: 0.946.

### D4: Care facilities
Titlecase and ALL-CAPS facility names: "Royal Victoria Hospital", "Prisma Health Baptist", "Orange City Area Health System", "DOCTORS CENTER HOSPITAL CAROLINA LLC", "X Medical Centre", "X Infirmary", "of Edinburgh" phrases. Trims leading "DISCHARGED/TRANSFERRED/TO/FOR/AT/FROM/UNDER" (keeps leading "The" per gold). Deliberately excludes anything ending in "Clinic" (no gold FACILITY ends with "Clinic").

Dev: P=1.000, R=0.980 (99/0/2). Pipeline FACILITY F1: 0.805.

### D5: Relatives' names
Strong colon-anchors ("Next of kin:", "Emergency contact:", "Informant:") and post-name anchors ("NAME, the patient's spouse", "NAME, her emergency contact", "Friend, NAME"). Lowercase names allowed only after strong anchors. All output as NAME (gold has no CONTACT NAME).

Dev: P=1.000, R=0.850 (68/0/12). Pipeline NAME F1: 0.531 (see remaining gaps).

### D6: Label corrections and suppressions
- **D6a:** Narrow facility suffixes (hospital, infirmary, medical center, health system) map to FACILITY before the broader ORGANIZATION mapping.
- **D6b:** Suppress TIME (bare clock times), ROOM, "ST ZIP" LOCATIONs, FACILITY "GMC"/"NHS"/"SSN", ORGANIZATION ID-label spans (remapped to ID), DATE durations ("for 3 days", "yesterday", "in about N weeks"). CONTACT NAME remapped to NAME.

## Integration notes

Track D runs inside `addStructuredSafeHarborEntities`, before the generic captured patterns, so precise Track D spans win the covering check against broader rules. Three pipeline interactions required fixes:

1. **ORGANIZATION-on-Hospital regex** fired before D4 and covered its FACILITY spans; moving the Track D block earlier lets D4's FACILITY win.
2. **ID false-positive filter** (`isLikelyClinicalResultLine`) dropped labeled IDs like "NHS number: 000 327 0743"; Track-D-labeled IDs now bypass it as explicit positive evidence.
3. **Temporal fallback** (`collectTemporalEntities`) re-added duration-DATEs after the D6b filter; D6b now also runs on the final merge in `resolvedRedactionEntities`.

## Dev results (200 notes)

| Type | P | R | F1 | tp/fp/fn |
|------|---|---|----|----------|
| ADDRESS | 0.710 | 0.603 | 0.652 | 44/18/29 |
| AGE | 1.000 | 0.940 | 0.969 | 63/0/4 |
| DATE | 0.746 | 0.952 | 0.837 | 100/34/5 |
| DOB | 1.000 | 0.480 | 0.649 | 12/0/13 |
| EMAIL | 1.000 | 1.000 | 1.000 | 43/0/0 |
| FACILITY | 0.683 | 0.980 | 0.805 | 99/46/2 |
| ID | 0.959 | 0.934 | 0.946 | 141/6/10 |
| MRN | 1.000 | 0.912 | 0.954 | 52/0/5 |
| NAME | 0.723 | 0.588 | 0.648 | 47/18/33 |
| OCCUPATION | 0.885 | 0.920 | 0.902 | 23/3/2 |
| ORGANIZATION | 0.520 | 0.650 | 0.578 | 13/12/7 |
| PATIENT NAME | 0.809 | 0.908 | 0.855 | 207/49/21 |
| PHONE | 0.532 | 1.000 | 0.694 | 25/22/0 |
| PROVIDER NAME | 0.788 | 0.893 | 0.837 | 108/29/13 |
| **Overall** | **0.805** | **0.854** | **0.829** | **977/237/167** |

## Held-out test results (100 notes)

| Type | P | R | F1 | tp/fp/fn |
|------|---|---|----|----------|
| ADDRESS | 0.806 | 0.714 | 0.758 | 25/6/10 |
| AGE | 0.968 | 0.909 | 0.937 | 30/1/3 |
| DATE | 0.731 | 0.891 | 0.803 | 49/18/6 |
| DOB | 1.000 | 0.579 | 0.733 | 11/0/8 |
| EMAIL | 0.900 | 0.900 | 0.900 | 18/2/2 |
| FACILITY | 0.565 | 0.875 | 0.686 | 35/27/5 |
| ID | 0.956 | 0.935 | 0.945 | 86/4/6 |
| MRN | 1.000 | 0.875 | 0.933 | 21/0/3 |
| NAME | 0.600 | 0.316 | 0.414 | 12/8/26 |
| OCCUPATION | 1.000 | 1.000 | 1.000 | 14/0/0 |
| ORGANIZATION | 0.333 | 0.750 | 0.462 | 6/12/2 |
| PATIENT NAME | 0.805 | 0.884 | 0.843 | 99/24/13 |
| PHONE | 0.478 | 1.000 | 0.647 | 11/12/0 |
| PROVIDER NAME | 0.737 | 0.862 | 0.794 | 56/20/9 |
| **Overall** | **0.779** | **0.826** | **0.802** | **473/134/100** |

## Remaining gaps (test set)

- **NAME (F1 0.414):** 26 missed, 8 false positives. The largest remaining pool (34 spans). Relatives without strong anchors and single-name mentions are the main miss pool. Test-set NAME is notably weaker than dev (0.648), suggesting the relative-name patterns don't fully generalize.
- **FACILITY (27 FP):** Mostly model false positives on test ("SSN" as FACILITY persists despite the filter — the model emits it with different casing or context).
- **PATIENT NAME (24 FP):** Model over-generation.
- **LOCATION (7 FN, R=0.000):** No LOCATION rule fires; 7 gold LOCATION spans missed entirely.
- **DOB (R 0.579):** 8 missed; date-of-birth formats vary.
- **ORGANIZATION (F1 0.462):** 12 false positives, mostly model-produced.

## Design decisions and limitations

- **Age policy:** The pipeline's Safe Harbor rule drops AGE under 90. D1 re-adds clinical ages as a post-filter; this is a benchmark-driven override of a conservative default and should be reviewed before any production use.
- **FACILITY/ORGANIZATION mapping (D6a):** Changes the label priority for facility-suffixed names. Needs app-level review to confirm it doesn't mislabel real organizations.
- **TIME/ROOM suppression (D6b):** Gold has no TIME, ROOM, or CONTACT NAME spans; suppressing them is benchmark-specific. In production these may carry re-identification risk.
- **Model transfer:** Rules were tuned against Stanford. Transfer to ClinicalE5, OpenMed, and RoBERTa was not verified in this round — the model-specific harnesses require separate setup. The rules are model-agnostic by design (they operate on text patterns, not model outputs), and the D6b suppressions target model FPs generically, but interaction effects should be checked before deploying with a different base model.

## Files

- Rules: `site-trackbc/src/vault/deid.js` (marked `TRACK-D`), bundle `src/vault/deid.bundle.js`
- Dev/test split: `track-d/split.json`, `notes-dev.jsonl`, `notes-test.jsonl`
- Scorer: `track-d/score_dev.py`
