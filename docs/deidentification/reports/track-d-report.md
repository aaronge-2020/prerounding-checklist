# Track D: Clinical-Text Rules for the MedDeID Benchmark

**Date:** 2026-09-30
**Model:** Stanford de-identifier (base, ONNX q8) + Track D rule stack (D1–D12)
**Result:** **0.872 exact-span F1 on the held-out 100-note test set** [0.845, 0.898] · **0.902 on dev** [0.881, 0.922]

## Summary

Track D is twelve rule groups layered on clinical NER models, designed for the patterns models miss on clinical text: ages, provider names with credentials, labeled clinical identifiers, care facilities, relatives' names, locations, DOB relabels, relative-name relabels, home addresses, and three precision filters. The rules are text-pattern-based and model-agnostic.

On the MedDeID dev set (200 notes, 1,144 gold spans), Stanford + Track D reaches **0.902 F1** (precision 0.892, recall 0.913). On the held-out 100-note test set (573 gold spans), it reaches **0.872 F1** (precision 0.866, recall 0.878). Two held-out evaluations were performed (#1: 2026-09-30, D1–D6: 0.802; #2: 2026-09-30, D1–D12: 0.872). No further held-out evaluation will be performed.

## Fairness: rules help every model

Each base model was run with and without Track D (identical D1–D7 rule set; Track D disabled via `?trackd=off` for the base runs). Bootstrap 95% CIs (1000 resamples of notes, seed 20260930).

| Model | Base (model + Track B/C) | + Track D (D1–D7) | Δ F1 |
|-------|--------------------------|-------------------|------|
| Stanford (onnx-community/stanford-deidentifier-base-ONNX, q8) | 0.598 [0.568, 0.626] | 0.842 [0.817, 0.865] | +0.244 |
| ClinicalE5 (OpenMed-PII-ClinicalE5-Small-33M, int8) | 0.530 [0.500, 0.559] | 0.783 [0.758, 0.806] | +0.252 |
| OpenMed Small (Wismut/openmed-onnx/small, int8) | 0.558 [0.526, 0.589] | 0.823 [0.797, 0.845] | +0.265 |

RoBERTa i2b2 (thinkingface/deid_roberta_i2b2_q, q8) was excluded: the model hangs in the browser harness (0 notes processed in 13 minutes after successful load) and could not be scored.

The CIs for base vs +rules do not overlap for any model. Track D improves every model by +0.24 to +0.27 F1. The contribution is the rules, not the base-model choice: Stanford is the best base (0.598) and the best with rules (0.842), but ClinicalE5 and OpenMed gain just as much from the same rule stack.

Paired bootstrap test (Stanford + Track D vs Stanford base, identical resamples): mean difference **+0.244** [0.218, 0.271], p < 0.0001.

## Rule groups

### D1: Clinical age expressions
The pipeline's Safe Harbor policy drops all AGE entities under 90. D1 re-adds clinical age mentions the model finds but the policy suppresses: "43 y/o", "18-year" (of "18-year-old"), "aged 43" → "43", "2 wk old", "4 m/o", bare "72 years" (not preceded by for/in/within/over/past/about). Runs after the identity-graph expansion so existing entities win on overlap.

Dev: P=1.000, R=0.940 (63/0/4). Pipeline AGE F1: 0.969.

### D2: Role-anchored provider names
Providers appear with role anchors ("Attending:", "Documented by", "Signed", "Sincerely") and credentials (", MD", ", MBBS" — kept in the span per gold). D2 uses the anchors to find 1–3 name tokens, with stopword-tail stripping, facility-name skipping, and pronoun-first rejection. Bypasses the normal span-constraining so credentials are kept.

Dev: P=1.000, R=0.744 (90/0/31). Pipeline PROVIDER NAME F1: 0.850.

### D3: Labeled clinical identifiers
Anchored IDs: "Report ID"/"accession ID", "NHS number", "National Insurance number", "Professional identifier", "SSN", "GMC" (with no./number variants), "professional ID". Handles "BG549511A", "000 327 0743", "25/257937". Bare "GMC 0546514" keeps "GMC " in the span per gold.

Dev: P=1.000, R=0.934 (141/0/10). Pipeline ID F1: 0.953.

### D4: Care facilities
Titlecase and ALL-CAPS facility names: "Royal Victoria Hospital", "Prisma Health Baptist", "Orange City Area Health System", "DOCTORS CENTER HOSPITAL CAROLINA LLC", "X Medical Centre", "X Infirmary", "of Edinburgh" phrases. Trims leading "DISCHARGED/TRANSFERRED/TO/FOR/AT/FROM/UNDER" (keeps leading "The" per gold). Excludes anything ending in "Clinic" (no gold FACILITY ends with "Clinic").

Dev: P=0.846, R=0.980 (99/18/2). Pipeline FACILITY F1: 0.908.

### D5: Relatives' names
Names appearing with relative anchors ("father", "mother", "spouse", "partner") or possessive phrases ("his wife", "her husband"). Labels as NAME per gold.

Dev: contributes to NAME F1: 0.769.

### D6: Label corrections
Post-filter remapping of model labels to gold types: CONTACT NAME → NAME (for relatives); ORGANIZATION with ID-like value → ID (shrinks span to the ID); TIME/ROOM/DATE-duration phrases → suppressed (benchmark-specific: gold has no TIME, ROOM, or DATE-duration entities); bare STATE+ZIP ("WI 53023") → LOCATION (gold convention); NAME hallucinations ("the", "the GP") → suppressed.

### D7: Locations (D7)
LOCATION entities from four patterns: "from X", "via X" (with stoplist for acronyms: NHS, MDT, GP), "An t-Ollach"-style Gaelic names, and "Royal Infirmary" via from-pattern. Dev: P=1.000, R=0.739 (17/0/6). Pipeline LOCATION F1: 0.850.

### D8: DOB relabel
DATE entities preceded by "DOB:" or "Date of birth:" are relabeled to DOB. Fixes 13 DOB false negatives (all were DATE-labeled). Dev DOB F1: 1.000 (25/0/0).

### D9: Relative-name relabel
PATIENT NAME or PROVIDER NAME entities in relative context ("father, N. Ellis", "patient's spouse") are relabeled to NAME. Fixes 27 of 33 NAME false negatives. Dev NAME F1: 0.769 (60/16/20).

### D10: Home addresses
Full address spans following "Home address:": street + city + state + ZIP (US) or street + city + postcode (UK). Dev: P=1.000, R=0.616 (45/0/28). Pipeline ADDRESS F1: 0.958 (68/1/5).

### D11: Organization filter
Suppresses ORGANIZATION entities containing "Clinic", "Laboratory", or "Department". Gold ORGANIZATIONs are community entities (schools, clubs, councils); clinical departments are not labeled. Dev ORGANIZATION F1: 0.765 (13/1/7), up from 0.578.

### D12: Name hallucination filter
Suppresses NAME entities that are "the", "the GP", "Arrange FBC", or other non-name phrases the model hallucinates. Dev PATIENT NAME F1: 0.906 (207/22/21), up from 0.855.

## Per-type results (dev, Stanford + D1–D12)

| Type | P | R | F1 | tp/fp/fn |
|------|---|---|----|----------|
| ADDRESS | 0.986 | 0.932 | 0.958 | 68/1/5 |
| AGE | 1.000 | 0.940 | 0.969 | 63/0/4 |
| DATE | 0.833 | 0.952 | 0.889 | 100/20/5 |
| DOB | 1.000 | 1.000 | 1.000 | 25/0/0 |
| EMAIL | 1.000 | 1.000 | 1.000 | 43/0/0 |
| FACILITY | 0.846 | 0.980 | 0.908 | 99/18/2 |
| ID | 0.972 | 0.934 | 0.953 | 141/4/10 |
| LOCATION | 1.000 | 0.739 | 0.850 | 17/0/6 |
| MRN | 1.000 | 0.912 | 0.954 | 52/0/5 |
| NAME | 0.789 | 0.750 | 0.769 | 60/16/20 |
| OCCUPATION | 0.885 | 0.920 | 0.902 | 23/3/2 |
| ORGANIZATION | 0.929 | 0.650 | 0.765 | 13/1/7 |
| PATIENT NAME | 0.904 | 0.908 | 0.906 | 207/22/21 |
| PHONE | 0.610 | 1.000 | 0.758 | 25/16/0 |
| PROVIDER NAME | 0.812 | 0.893 | 0.850 | 108/25/13 |
| **Micro** | **0.892** | **0.913** | **0.902** | **1044/126/100** |

Weakest types: LOCATION recall (6 missed, mostly without "from"/"via" anchors), ORGANIZATION recall (7 missed community entities), NAME precision (16 FPs, mostly borderline person mentions).

## Methods

### Data
The MedDeID English Synthetic Benchmark (Hellemans et al., arXiv:2609.10049): 300 human-validated synthetic English clinical notes (v3, HuggingFace `stighellemans/meddeid-english-synthetic-benchmark`, Zenodo DOI 10.5281/zenodo.22689857). Split into 200 dev / 100 held-out test, stratified by (document_type, locale): 12 strata of 25 notes; first 8 strata 17 dev / 8 test, remaining 16 dev / 9 test. RNG seed 20260930. Note IDs in `track-d/split.json`. The split is fixed; all rule development used dev notes only.

Gold spans use 15 types across the 300 notes: PATIENT NAME (340), ID (243), PROVIDER NAME (186), DATE (160), FACILITY (141), NAME (118), ADDRESS (108), AGE (100), MRN (81), EMAIL (63), DOB (44), OCCUPATION (39), PHONE (36), LOCATION (30), ORGANIZATION (28).

### Systems
Four base models, all quantized ONNX run locally in the browser via the application's deidentification pipeline (ONNX Runtime Web, WASM, headless Chromium):
- Stanford: `onnx-community/stanford-deidentifier-base-ONNX` (q8)
- RoBERTa i2b2: `thinkingface/deid_roberta_i2b2_q` (q8) — excluded (hangs in harness)
- ClinicalE5: `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android` (int8)
- OpenMed Small: `Wismut/openmed-onnx/small` (int8)

Rule layers: the application's Track B/C rules, plus Track D (D1–D12, text-pattern-based, model-agnostic). Fairness runs used `?trackd=off` to disable Track D for the base condition.

### Metrics
Primary: exact-span micro-F1. A predicted span is correct iff (begin, end, type) exactly matches a gold span. Precision, recall, F1 micro-averaged over notes.

Uncertainty: bootstrap 95% CIs (1000 resamples of notes with replacement, seed 20260930). Paired difference uses identical resamples, two-sided p-value.

### Held-out evaluations
Exactly two:
- #1 (2026-09-30): Stanford + Track D (D1–D6): **0.802** F1
- #2 (2026-09-30): Stanford + Track D (D1–D12): **0.872** F1 [0.845, 0.898]

No other test-set measurements. Dev tuning never accessed test notes. No further held-out evaluation will be performed.

### Hardware
x86_64 Linux VM, 2 cores, 7GB RAM. Per-note latency (dev, Stanford): mean 2.5s, median 2.4s, p95 4.0s (n=200). ClinicalE5: mean 2.1s. OpenMed: mean 4.5s.

### Label mapping
Pipeline labels map to gold types directly, except Track D remaps: CONTACT NAME → NAME (D6b, relatives); ORGANIZATION with ID value → ID (D6b, shrinks to ID); DATE → DOB (D8, after "DOB:"/"Date of birth:"); PATIENT/PROVIDER NAME → NAME (D9, in relative context).

## Limitations

- **Synthetic notes.** All results are on synthetic clinical text, not real patient records. Synthetic notes follow templates; real documentation has different phrasing, typos, and structure. These numbers support development and comparison, not a clinical safety claim.
- **Benchmark-specific rules.** D6b's TIME/ROOM/DATE-duration filters and parts of D7 (LOCATION patterns) and D10 ("Home address:") are tuned to this benchmark's note templates and may not transfer to other corpora.
- **Single split.** One dev/test split was used. Bootstrap CIs quantify note-level variability within this split, not split-to-split variability.
- **RoBERTa not evaluated.** The i2b2-tuned RoBERTa hangs in this browser runtime and could not be scored.
- **i2b2-2014 pending.** Evaluation on the i2b2-2014 corpus is future work (data access requested 2026-09-29, awaiting reply).

## Files
- Rules: `site-trackbc/src/vault/deid.js` (TRACK-D markers), bundle `site-trackbc/src/vault/deid.bundle.js`
- Driver: `meddeid_driver.mjs` (`--trackd off|on`), harness `site-trackbc/harness-param.html` (`?trackd=off`)
- Split/gold: `track-d/split.json`, `gold.json`; dev notes `track-d/notes-dev.jsonl`, test `track-d/notes-test.jsonl`
- Scorer: `track-d/score_dev.py`; bootstrap: `track-d/bootstrap_ci.py`
