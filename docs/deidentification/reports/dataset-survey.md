# Synthetic Clinical De-identification Benchmarks — Dataset Survey

**Date:** 2026-09-30
**Purpose:** Expand the de-identification benchmark suite beyond the single 300-note MedDeID English set with additional peer-reviewed, openly downloadable synthetic clinical benchmarks carrying gold PHI annotations.
**Scope:** Dataset discovery, download, and format validation only. No model benchmarking.

## Inclusion criteria

- Peer-reviewed publication or citable preprint with real citations
- Openly downloadable (no DUA, no request-gated access)
- Gold PHI annotations on English clinical text (or generatable gold via known-PHI injection, noted explicitly)
- Excluded: real-patient DUA corpora (2014 i2b2/UTHealth), general-domain PII sets (ai4privacy/pii-masking-300k), unannotated note dumps, code-only releases

## Ranked overview

| Rank | Dataset | Notes / records | PHI annotations | Review | Citation | License | Local path |
|---|---|---|---|---|---|---|---|
| 1 | MedDeID English synthetic benchmark | 300 notes | ~4,300 spans, char offsets + sub-annotations | 1 reviewer, adjudicated guideline | Hellemans et al., arXiv:2609.10049 (2026) | Open (CC-BY per Zenodo) | `datasets/` (already held) |
| 2 | Technetium-I (test split) | 74,700 notes | 1,161,437 spans, char offsets | Unreviewed (template-generated) | TeMLM Foundation, HF dataset (2026); cited in Hellemans et al. 2026 and arXiv:2601.19191 | EUPL-1.2 | `datasets/technetium-i/` |
| 3 | ASQ-PHI | 1,051 queries (832 PHI-positive + 219 hard negatives) | 2,973 elements, 13 HIPAA Safe Harbor types | 3 clinicians audited 300/1,051 | Weatherhead, Golovko & McCaffrey, *Data in Brief* 65:112586 (2026) | MIT | `datasets/asq-phi/` |

## 1. MedDeID English synthetic benchmark (already held)

- **Source:** HuggingFace `stighellemans/meddeid-english-synthetic-benchmark`; Zenodo DOI 10.5281/zenodo.22689857 (v3); dataset record in the paper cites 10.5281/zenodo.22129255.
- **Paper:** Hellemans et al., "MedDeID enables locally governed clinical-text de-identification from real or synthetic training data", arXiv:2609.10049 (announced 2026-09-10).
- **Content:** 300 human-validated synthetic English clinical notes (plus a 6,700-note synthetic training corpus released alongside). Character-offset annotations with a sub-annotation layer; patient/caregiver name metadata available.
- **Why it ranks first:** the only candidate with human-validated clinical-note text, character-level gold spans, and an adjudicated annotation guideline — the closest thing to a clinical gold standard among fully open synthetic sets. Already integrated into the benchmark harness.

## 2. Technetium-I

- **Source:** HuggingFace `temlm-foundation/Technetium-I` (DOI 10.57967/hf/8177); companion repo `temlm-foundation/temlm-transparency-first-clinical-nlp-provenance`.
- **Citation:** TeMLM Foundation, "Technetium-I: A large-scale synthetic clinical NLP dataset", Hugging Face dataset (2026). Cited as an evaluation benchmark in Hellemans et al. (arXiv:2609.10049, ref 28) and used as the worked example in "Transparency-First Medical Language Models" (arXiv:2601.19191). No dedicated peer-reviewed paper found — the dataset is the citable artifact.
- **Content:** 498,000 fully synthetic English clinical notes (discharge summaries and other multi-section note types) with 7.74M PHI annotations. Production splits: train 348,600 / val 74,700 / test 74,700. Generation: template-based with UMLS/SNOMED-CT/ICD-9 grounding and controlled PHI injection — i.e., gold annotations are known by construction (generatable gold).
- **Annotation schema (per note):** `note_id`, `source`, `note_type`, `admission_date`, `discharge_date`, `text`, `phi_annotations` (list of `{entity_type, text, start, end}` character offsets), `icd_codes`, `quality_score`.
- **Entity types present in the data:** NAME, ID, DATE, AGE, PHONE, EMAIL, LOCATION (7 types; distribution in `statistics.json`). The dataset card advertises 10 types (adding PROFESSION, CONTACT, HOSPITAL, DEVICE); validation below checks what the test split actually contains.
- **License:** EUPL-1.2.
- **Local:** `datasets/technetium-i/` — test split downloaded (`test.jsonl`); `statistics.json`, `README.md`, `DATASET_CARD.md` captured. Train/val splits available from the same repo if needed.

### Format validation (test split)

Validated `test.jsonl` (256MB) with a full parse:

| Check | Result |
|---|---|
| Records parsed | 74,700 / 74,700 (0 JSON errors) |
| Total PHI annotations | 1,161,437 (exactly matches the count reported in Hellemans et al.) |
| Schema keys | `note_id`, `source`, `note_type`, `admission_date`, `discharge_date`, `text`, `phi_annotations`, `icd_codes`, `quality_score` (matches documented schema) |
| Annotation format | `{entity_type, text, start, end}` character offsets |
| Offset accuracy | 7,808 annotations sampled across 500 random notes: **0 mismatches** (`text[start:end] == text` for all) |
| Entity types present | NAME (304,276), ID (74,700), DATE (224,100), AGE (184,861), PHONE (74,700), EMAIL (74,700), LOCATION (224,100) — **7 types**, not the 10 the dataset card advertises (PROFESSION, CONTACT, HOSPITAL, DEVICE absent from the test split) |
| Note types in test split | all 74,700 are `discharge_summary` |
| Note IDs | `TEMLM_423301`–`TEMLM_498000` (test = tail of the corpus) |

**Caveats:** template-generated text is structurally repetitive (every note carries exactly one ID, one PHONE, one EMAIL); no human review of annotations (gold is by construction). The train/val splits were not downloaded (same format; available from the same repo).

## 3. ASQ-PHI — Adversarial Synthetic Queries for PHI

- **Source:** GitHub `JamesWeatherhead/asq-phi` (public, MIT); raw data also on Mendeley Data, DOI 10.17632/csz5dzp7nx.1.
- **Paper (peer-reviewed):** Weatherhead, Golovko & McCaffrey, "ASQ-PHI: An adversarial synthetic data benchmark for clinical de-identification and search utility", *Data in Brief* 65:112586 (2026), doi:10.1016/j.dib.2026.112586. Also used as an external benchmark in Hellemans et al. (arXiv:2609.10049, ref 29).
- **Content:** 1,051 fully synthetic clinical *search queries* (not notes) generated with Azure OpenAI GPT-4o — 832 PHI-positive + 219 hard negatives (zero PHI, adversarial structure mimicking PHI). Designed for the "safe handoff" boundary: stripping PHI from clinician queries before they leave a HIPAA-BAA LLM environment.
- **Annotation schema:** delimiter-based text file (`data/synthetic_clinical_queries.txt`): `===QUERY===` blocks followed by `===PHI_TAGS===` blocks of JSON lines `{"identifier_type": ..., "value": ...}`. **Annotations are value-based, not character offsets** — offsets must be reconstructed by locating each value in the query text.
- **Identifier types (13):** NAME (814), GEOGRAPHIC_LOCATION (826), DATE (806), MEDICAL_RECORD_NUMBER (305), HEALTH_PLAN_BENEFICIARY_NUMBER (91), PHONE_NUMBER (45), SOCIAL_SECURITY_NUMBER (33), EMAIL_ADDRESS (31), UNIQUE_IDENTIFIER (14), ACCOUNT_NUMBER (4), FAX_NUMBER (2), CERTIFICATE_LICENSE_NUMBER (1), IP_ADDRESS (1).
- **Human review:** three clinicians/domain experts each audited 100 records (300 of 1,051).
- **License:** MIT.

### Format validation

Parsed `data/synthetic_clinical_queries.txt` with a delimiter parser:

| Check | Result |
|---|---|
| Total queries parsed | 1,051 |
| PHI-positive / hard negatives | 832 / 219 |
| Total PHI elements | 2,973 |
| Identifier types present | 13 (matches paper) |
| Annotation values found verbatim in query text | 2,972 / 2,973 (99.97%) |
| Values with >1 occurrence (ambiguous offset) | 3 |
| Mean query length | 151 chars |

All paper-reported counts reproduce exactly. Character offsets are reconstructable for all but 1 of 2,973 annotations. **Caveat:** this is a query benchmark, not a clinical-note benchmark — it complements but does not replace note-level evaluation. It is the only candidate that measures over-redaction via hard negatives.

## Watchlist — excluded with reasons

| Candidate | Citation | Why excluded |
|---|---|---|
| ICDSg (ICDS-G(g) / ICDS-G(l)) | Singh et al., BioNLP @ ACL 2024 (peer-reviewed); arXiv:2407.05887 | 1,596 + 1,043 synthetic Indian discharge summaries with PHI annotations, but the datasets are **not released** — GitHub `exploration-lab/llm-for-clinical-report-generation-deidentification` contains code/notebooks only (verified by clone; no data files, no download links). The 99-note real ICDSR set is IRB-governed. |
| SHIELD | Posada et al., arXiv:2605.03301 (2026) | 1,381 notes / 10,229 gold PHI spans / 9 categories with dual human adjudication, but **hosted on Stanford Medicine Redivis** (account/request-gated, not openly downloadable) and notes are sampled from real STARR-OMOP EHR with synthetic identifier replacement — not fully synthetic. |
| GraSCCo_PHI | Lohr et al., Zenodo 10.5281/zenodo.11502329 (2024) | Synthetic clinical corpus with PHI annotations, openly downloadable — but **German**, failing the English-text bar. Noted for non-English coverage. |
| nedap/mdpi2021-textgen | Libbi et al., *Future Internet* 13(5):136 (2021) | Peer-reviewed, but releases **generation code only** (LSTM/GPT-2), no downloadable annotated dataset. |
| 2014 i2b2/UTHealth | Stubbs et al. | Real-patient surrogate corpus, DUA-gated — out of scope by definition. |

## Top-3 recommendation

1. **MedDeID English (300 notes)** — primary clinical-text benchmark. Human-validated, character offsets, adjudicated guideline. Already in the harness; keep as the headline clinical metric.
2. **Technetium-I test split (74,700 notes)** — scale and robustness benchmark. Two orders of magnitude larger than anything else open; template-generated text is less realistic, but it is the only open set that can measure recall stability across tens of thousands of notes and it is already established as an external benchmark in the MedDeID paper. Download the train split too if synthetic-only training experiments are ever wanted.
3. **ASQ-PHI (1,051 queries)** — adversarial/utility benchmark. Short-query genre the note benchmarks miss; the 219 hard negatives give the only open measurement of over-redaction on clinical text. Treat as a complementary suite, not a replacement for note-level scoring.

**Rationale:** the three cover complementary axes — validated clinical realism (MedDeID), scale (Technetium-I), and adversarial/utility edge cases (ASQ-PHI). Together they span 76k+ annotated records with zero DUA friction. No single open synthetic set combines human-validated notes at scale, so the suite should be reported as a battery rather than collapsed into one number.

## Search methodology

- arXiv/HF/GitHub/web searches (2026-09-30) for synthetic clinical de-identification benchmarks, 2021–2026.
- Forward/backward citation tracing from the MedDeID paper (arXiv:2609.10049): its reference list directly identified Technetium-I (ref 28), ASQ-PHI (ref 29), SHIELD (ref 27), ICDSg (ref 23), GraSCCo_PHI (ref 39), and Libbi et al. (ref 25) as the complete set of synthetic clinical de-id datasets cited in current literature.
- HF dataset API search returned no additional candidates beyond Technetium-I and the already-held MedDeID set.
