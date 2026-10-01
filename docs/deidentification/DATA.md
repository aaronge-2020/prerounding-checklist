# DATA.md — dataset manifest

All paths below are relative to `docs/deidentification/` in this repository. Items marked **excluded** are documented here rather than committed, per this repo's `.gitignore` discipline (model weights, `node_modules`, venvs, raw third-party dumps).

Every dataset used in this project's experiments. Synthetic or de-identified
data only; no real patient data appears anywhere in this repo.

## 1. MedDeID English synthetic benchmark (primary)

- **What:** 300 human validated synthetic English clinical notes with PHI
  annotations (15 entity types).
- **Source:** Hugging Face `stighellemans/meddeid-english-synthetic-benchmark`;
  archived at Zenodo DOI `10.5281/zenodo.22689857` (v3).
- **Paper:** Hellemans et al., arXiv:2609.10049.
- **Used as:** the primary benchmark. Split into dev 200 / frozen held out 100,
  stratified by (document_type, locale) into 12 strata of 25 notes; split seed
  `20260930`; note IDs in `eval/split.json` (`dev_ids`, `test_ids`). **Excluded:** local note text (`notes.jsonl`, `notes-dev.jsonl`, `notes-test.jsonl`); refetch from the Hugging Face source above and apply `eval/split.json`.
- **Held out discipline:** the 100 note test set was scored exactly twice
  during development. It has not been touched by any later variant.
- **Same distribution status:** our system's rule layer (D1-D12) was developed
  against MedDeID dev notes, so MedDeID results are same distribution for our
  system and out of distribution for the published comparator models.

## 2. Technetium-I (external validation)

- **What:** 74,700 synthetic discharge summaries, 1,161,437 PHI annotations,
  7 coarse entity types. Open benchmark.
- **Used as:** a 1,500 note sample (workspace sampling script, excluded),
  scored with explicit schema remapping from our 15 types to Technetium's 7 (`external/remap_tc_types.py`). **Excluded:** the 1,500-note sample gold (`tc_sample_gold.json`, 1.4 MB); summary scores are committed at `external/technetium_scores.json` and `external/technetium_scores_remapped.json`.
- **Result for our system (Stanford base + D1-D12):** exact span micro F1
  0.5273, character recall 0.9971, before and after remapping. The low exact
  score reflects boundary conventions and annotation noise, not missed
  coverage; see `reports/reviewer-hardening-stream2.md`. Never quote the
  0.5273 without the 0.9971 character recall and the convention analysis.
- **Raw dump excluded from git:** `datasets/technetium-i/` (245 MB). Refetch per the Technetium-I publication.

## 3. ASQ-PHI (external validation, different genre)

- **What:** 1,051 synthetic adversarial clinical queries, including 219 hard
  negatives. Peer reviewed (Data in Brief 65:112586).
- **Used as:** all 1,051 queries, treated as a different clinical query genre, not a replacement for note evaluation. **Excluded:** query gold (`asqphi_gold.json`); summary scores committed at `external/asqphi_scores.json`.
- **Result for our system (Stanford base + D1-D12):** exact span micro F1
  0.6239, character recall 0.9272.
- **Local copy excluded from git:** `datasets/asq-phi/` (6.4 MB).

## 4. ai4privacy pii-masking-300k (exploratory only)

- **What:** large synthetic PII masking dataset (Hugging Face
  `ai4privacy/pii-masking-300k`, DOI `10.57967/hf/1995`).
- **Used as:** exploratory samples only (1,000 rows, seed 42). Not part of any reported result.
- **Excluded from git:** `data/val_en.jsonl` (27 MB). Redownload from the Hugging Face dataset.

## Datasets considered and NOT used

- **MIMIC-IV-Note:** a no gold stability study was designed (`reports/reviewer-hardening-stream3.md`) but **dropped 2026-10-01**:
  MIMIC-IV notes are already de-identified, so no accuracy validation is
  possible without surrogate PHI reinjection, and the no gold stability design
  measures agreement on already redacted text. The reinjection alternative was
  declined. No MIMIC data was downloaded. No DUA signature is needed.
- **i2b2 2014:** access request submitted via the DBMI portal (registration
  confirmed closed); no data obtained. Intended as a future real text
  evaluation if access is granted.
- **MedDeID held out 100:** used exactly twice, then frozen. New variants
  (rules alone ablations, wllama verifier) were never scored on it.
