# De-identification pipeline benchmark — public PII dataset

A benchmark of the app's automated de-identification pipeline on a public, publishable PII dataset, run entirely in a local browser with no data leaving the machine.

## What was tested

**Pipeline.** The app's actual de-identification code, run headless in Chromium against 1,000 sampled texts in two modes:

- **Hybrid (full automated pipeline):** the clinical NER model plus structured safe-harbor rules, temporal handling, and identity/alias expansion. This is what the app runs automatically.
- **Model-only:** the clinical NER model plus the app's output normalization and filtering, without the structured rules.

The human review gate, manual redaction, and warning resolution were excluded from both modes. This measures only what the automation catches on its own.

**Model.** `onnx-community/stanford-deidentifier-base-ONNX` (quantized), the app's current default de-identification model.

**Dataset.** `ai4privacy/pii-masking-300k` (DOI 10.57967/hf/1995), English validation split. A fixed sample of 1,000 texts was drawn with seed 42; the exact sampled IDs are recorded in `data/sample_manifest.json`, and the texts in `data/sample.jsonl`. Of the 1,000 texts, 855 contain at least one annotated PII span. The dataset is published under Ai4Privacy's custom license, which grants use for academic research and non-commercial purposes with acknowledgment of Ai4Privacy; the dataset itself is not redistributed here — anyone reproducing this work downloads it directly from Hugging Face.

**Metric.** The primary metric is strict exact-span matching: a prediction counts as correct only if its start offset, end offset, and category all match the gold annotation. Two secondary metrics are reported separately: entity-level matching on any character overlap, and character-level coverage.

## Headline results

| Mode | Precision | Recall | F1 |
|---|---|---|---|
| Hybrid, exact-span | 0.670 | 0.448 | 0.537 |
| Model-only, exact-span | 0.500 | 0.247 | 0.330 |
| Hybrid, overlap (secondary) | 0.804 | 0.537 | 0.644 |
| Model-only, overlap (secondary) | 0.767 | 0.378 | 0.507 |
| Hybrid, character-level (secondary) | 0.806 | 0.680 | 0.738 |
| Model-only, character-level (secondary) | 0.865 | 0.385 | 0.533 |

The structured rules are the difference between the two modes: email addresses, IP addresses, phone numbers, street addresses, and most dates are caught by patterns, not by the model.

## Per-category results (exact-span)

| Category | Gold spans | Hybrid P / R / F1 | Model-only P / R / F1 |
|---|---|---|---|
| EMAIL | 320 | 0.900 / 0.928 / 0.914 | — (no predictions) |
| IP | 252 | 0.932 / 0.972 / 0.952 | — (no predictions) |
| PHONE | 263 | 0.350 / 0.532 / 0.422 | 0.027 / 0.015 / 0.019 |
| ID | 1,217 | 0.523 / 0.518 / 0.520 | 0.462 / 0.516 / 0.487 |
| DATE | 231 | 0.334 / 0.606 / 0.431 | 0.321 / 0.299 / 0.309 |
| ADDRESS | 578 | 0.728 / 0.218 / 0.336 | — (no predictions) |
| NAME | 1,117 | 0.102 / 0.038 / 0.056 | 0.155 / 0.025 / 0.043 |
| DOB | 273 | 0.360 / 0.033 / 0.060 | — (no predictions) |
| TIME | 443 | — (no predictions) | — (no predictions) |
| LOCATION | 934 | — (3 predictions) | — (no predictions) |

Patterns (EMAIL, IP) score above 0.9 F1. IDs and dates land in the 0.3–0.5 range. Names, locations, times, and birth dates are the weak points: the pipeline emits no time spans and almost no location spans on this data, and the clinical NER model — trained on hospital notes — rarely recognizes the synthetic names here.

## Performance

Measured in headless Chromium on this machine, all local:

- Model load: ~4.9 seconds (one-time).
- Hybrid: median 647 ms per document, p95 1,266 ms; 1,000 documents in 721 s.
- Model-only: median 697 ms per document, p95 1,281 ms; 1,000 documents in 752 s.

## Label mappings

The dataset's labels and the pipeline's labels do not line up one-to-one, so dataset labels were folded into ten scored categories:

- Names (given/family name variants) → NAME
- TEL → PHONE; EMAIL → EMAIL; DATE → DATE; TIME → TIME; BOD → DOB
- CITY, STATE, COUNTRY, POSTCODE → LOCATION
- STREET, BUILDING, SECADDRESS → ADDRESS
- IDCARD, SOCIALNUMBER, PASSPORT, DRIVERLICENSE → ID
- IP → IP

Dataset labels with no defensible counterpart (USERNAME, SEX, TITLE, PASS, GEOCOORD) were excluded from scoring; predictions landing exactly on those spans were ignored rather than counted as errors. Pipeline labels PATIENT NAME, PROVIDER NAME, and CONTACT NAME were scored as NAME; MRN and ENCOUNTER ID as ID. Model labels with no counterpart (FACILITY, ORGANIZATION, ROOM) contributed to the binary score but not to any per-category score.

## Caveats

- The dataset is synthetic, general-domain PII — not clinical notes. The Stanford model was trained on hospital text, so name and location results here say more about the domain gap than about clinical performance.
- The label sets do not align one-to-one; mappings and exclusions are listed above and shape every number in this report.
- Only the automated pipeline was measured. The app's clinician review step, manual redaction, and warning resolution are designed to catch what the automation misses and are not reflected here.
- The strict exact-span metric penalizes boundary differences (e.g. "Contact Jane Smith" predicted vs "Jane Smith" annotated); the overlap and character-level figures give the more forgiving view.
- The planned clinical benchmark on the 2014 i2b2/UTHealth corpus is still pending data access and will supersede these figures for clinical claims.

## Reproducibility

- Sample manifest: `data/sample_manifest.json` (seed 42, exact IDs)
- Sampled texts: `data/sample.jsonl`
- Raw outputs: `results/raw_hybrid.json`, `results/raw_modelonly.json`
- Scored metrics: `results/results.json`
- Scoring script: `harness/score.py`
