# Methodology

How the de-identification benchmark was run: the environment, the sample, the metrics, the label mapping, and the rules-tuning protocol.

## Test environment

- **Browser:** headless Chromium. All inference through onnxruntime-web (WASM, threaded).
- **Pipeline code:** each model candidate ran inside the app's actual de-identification pipeline — the same bundle that ships — configured exactly as the default model. Model-only mode kept the app's standard output filtering and dropped the structured rules.
- **Local throughout:** every run happened on the test machine; no text left it.

## Sample

- **Dataset:** ai4privacy/pii-masking-300k, DOI 10.57967/hf/1995, English validation split (`data/validation/1english_openpii_8k.jsonl`).
- **Sample:** 1,000 texts, drawn with seed 42. The exact sampled IDs are recorded in the benchmark manifest; the texts themselves are not redistributed (the dataset's custom license covers academic and non-commercial use with acknowledgment of Ai4Privacy).
- **Annotated coverage:** 816 of the 1,000 texts contained at least one annotated span; 5,628 gold spans in total across the ten scored categories.

## Metrics

- **Primary: strict exact-span P/R/F1.** A prediction counts as correct only when its start offset, end offset, and category all match a gold annotation. Boundary differences — e.g. predicting "Contact Jane Smith" when "Jane Smith" is annotated — count as misses.
- **Secondary: entity overlap.** A prediction counts when it overlaps any gold span by at least one character.
- **Secondary: character-level coverage.** Precision and recall over individual characters, measuring how much PII text is covered regardless of boundaries.

Secondary results:

| Mode | Overlap P / R / F1 | Character-level P / R / F1 |
|---|---|---|
| Hybrid (baseline) | 0.804 / 0.537 / 0.644 | 0.806 / 0.680 / 0.738 |
| Model-only (baseline) | 0.767 / 0.378 / 0.507 | 0.865 / 0.385 / 0.533 |
| Hybrid (tuned) | 0.832 / 0.672 / 0.743 | 0.826 / 0.797 / 0.811 |

## Label mapping

The dataset's labels don't line up one-to-one with the pipeline's labels, so dataset labels were folded into ten scored categories:

| Dataset labels | Scored category |
|---|---|
| GIVENNAME1, GIVENNAME2, LASTNAME1, LASTNAME2, LASTNAME3 | NAME |
| TEL | PHONE |
| EMAIL | EMAIL |
| DATE | DATE |
| TIME | TIME |
| BOD | DOB |
| CITY, STATE, COUNTRY, POSTCODE | LOCATION |
| STREET, BUILDING, SECADDRESS | ADDRESS |
| IDCARD, SOCIALNUMBER, PASSPORT, DRIVERLICENSE | ID |
| IP | IP |

Dataset labels with no defensible counterpart — CARDISSUER, GEOCOORD, PASS, SEX, TITLE, USERNAME — were excluded from scoring; predictions landing exactly on those spans were ignored rather than counted as errors.

On the pipeline side, PATIENT NAME, PROVIDER NAME, and CONTACT NAME were scored as NAME; MRN and ENCOUNTER ID as ID. Model labels with no gold counterpart (FACILITY, ORGANIZATION, ROOM) contributed to the binary score but to no per-category score.

**Model-survey remaps.** Each candidate's extra normalized labels were remapped to the same ten categories before scoring (binary scoring is offset-based and unaffected by relabeling):

- bert-small-pii: FINANCIAL, IBAN CODE, US BANK NUMBER, US ITIN, CREDIT CARD, US LICENSE PLATE → ID
- multilang-pii-ner: BUILDINGNUM → ADDRESS; IDCARDNUM, SOCIALNUM, DRIVERLICENSENUM, TAXNUM, CREDITCARDNUMBER, PASSPORTNUM → ID
- deid_bert_i2b2: no remap needed — the pipeline's label map already normalizes its labels (PATIENT → PATIENT NAME, STAFF → PROVIDER NAME, HOSP → FACILITY, PATORG → ORGANIZATION)

## Rules-tuning protocol

- **Dev/holdout split:** the 1,000 texts in manifest order — the first 700 were the development set for all tuning and keep/reject decisions; the last 300 were a frozen holdout, untouched until the final reporting run. Only aggregate category counts on the holdout were seen before tuning — no examples, no scores.
- **Keep criterion:** a rule change was kept when development-set exact-span F1 improved and development-set binary precision stayed at 0.60 or above (baseline precision was 0.67 — it was not traded away).
- **Final run:** the winning rules ran on all 1,000 texts with the unchanged scorer; the pipeline code was restored to pristine afterwards so the baseline comparison stayed clean.

**Rejected as unsafe or no-gain:** PO Box patterns (no development gain); bare hour numbers ("17", "1") and the literal "Unknown" as TIME (not defensible time patterns); a UK-postcode rule (it conflicted with the driver-license ID pattern); birth-date values with no birth cue (indistinguishable from DATE without context); unanchored multi-group digit runs (collided with date shapes).
