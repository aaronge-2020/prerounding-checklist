# Real SOTA Clinical De-identification Models — Survey

**Date:** 2026-09-30
**Purpose:** Identify the actual state-of-the-art (non-browser, full-size) clinical text
de-identification models with public checkpoints, for head-to-head evaluation on the
MedDeID 300-note benchmark. Research only — no models were run.

**Our PHI schema (target):** PATIENT NAME, PROVIDER NAME, FACILITY, ID, MRN, DATE, DOB,
AGE, PHONE, EMAIL, ADDRESS, LOCATION, ORGANIZATION, OCCUPATION, NAME.

---

## 1. Published SOTA landscape (i2b2 2014 / n2c2, entity-level micro F1)

| System | Reported F1 (i2b2 2014) | Venue | Public checkpoint? |
|---|---|---|---|
| StanfordAIMI transformer + rules (Chambon et al.) | **98.9** | JAMIA 2022 | ✅ Yes (HF) |
| John Snow Labs De-ID | 98–99 (vendor claim) | vendor docs / ECIR 2025 workshop (96% in head-to-head) | ❌ Commercial |
| "Beyond Accuracy" NER (13-label granular) | 97.8 micro | arXiv 2312.08495 (2023) | ❌ None found |
| DEFT (interactive learning) | 96.3 | Interact J Med Res 2023 | ❌ None found |
| Dernoncourt et al. (Bi-LSTM ANN) | 97.9 | JAMIA 2017 | ❌ None found |
| deid-LONGFORMER-NemPII (Riggs) | 97.7 (own Nemotron held-out, NOT i2b2) | GitHub 2024/25 | ✅ Yes (HF) |
| Transformer-DeID (KindLab: BERT/DistilBERT/RoBERTa) | 90.4–92.4 | PhysioNet 2023 | ⚠️ PhysioNet credentialed |
| Kuo et al. 2025 benchmark winner | Azure Health De-ID (commercial API) | iScience 2025 | ❌ API only |
| OBI RoBERTa i2b2 | 86.6 char-recall (MedDeID paper) | — | ✅ Already tested (F1 0.338 on our 300) |

Notes:
- The i2b2-2014 leaderboard SOTA cluster is ~0.96–0.99; anything ≥0.95 is
  legitimately "SOTA-class" on that benchmark.
- Commercial/API systems (Azure, AWS Comprehend Medical, GPT-4, John Snow Labs)
  cannot be run locally and are out of scope for a reproducible comparison.
- DEFT, "Beyond Accuracy", and Dernoncourt have no public checkpoints → cannot run.

---

## 2. Candidate models with public HuggingFace checkpoints

### A. StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2 ⭐

- **Paper:** Chambon et al., "Automated deidentification of radiology reports combining
  transformer and 'hide in plain sight' rule-based methods," JAMIA 2022 (ocac219).
- **Published:** F1 **98.9 on i2b2 2014**, 99.5 on i2b2 2006, 97.9–99.6 on radiology
  reports; outperformed human labelers on i2b2 2014.
- **Architecture:** BERT-based token classification (`model_type: bert`,
  `pytorch_model.bin`). Trained on 6,193 radiology + biomedical documents.
- **Access:** Public, non-gated. ~3.7k downloads. Repo:
  https://github.com/MIDRC/Stanford_Penn_Deidentifier (Apache-2.0).
- **Labels (7 entity types):** `PATIENT, HCW, HOSPITAL, DATE, ID, PHONE, VENDOR`
- **Label mapping to our schema:**
  | HF label | Our schema | Notes |
  |---|---|---|
  | PATIENT | PATIENT NAME | direct |
  | HCW | PROVIDER NAME | direct (healthcare worker) |
  | HOSPITAL | FACILITY | partial — hospitals only |
  | VENDOR | ORGANIZATION | partial |
  | DATE | DATE | direct |
  | ID | ID | direct (no MRN/SSN split) |
  | PHONE | PHONE | direct |
  | — | MRN, DOB, AGE, EMAIL, ADDRESS, LOCATION, OCCUPATION, NAME | **not predicted** |
- **Caveats:** Coarse label set (no MRN/DOB/AGE/EMAIL/ADDRESS); radiology-heavy
  training may underperform on longitudinal notes; 512-token BERT windowing needs
  chunking for long notes (repo provides chunking code). Note: the sibling
  `StanfordAIMI/stanford-deidentifier-base` (1.39M downloads) has the identical
  7-label head — the `-with-radiology-reports-and-i2b2` variant is the
  paper-matching one to cite.
- **Verdict:** #1 candidate. Highest published i2b2-2014 F1 with a public checkpoint.

### B. obi/deid_bert_i2b2

- **Paper:** Kailas, Homilius, Goto, "Robust De-ID" (OBI team), 2022.
  Repo: https://github.com/obi-ml-public/ehr_deidentification
- **Architecture:** ClinicalBERT (`emilyalsentzer/Bio_ClinicalBERT`) fine-tuned on
  i2b2 2014, BILOU tagging, 45 labels (11 PHI types).
- **Access:** Public, non-gated. ~900 downloads.
- **Labels (11 types):** `PATIENT, STAFF, HOSP, PATORG, LOC, AGE, DATE, EMAIL, ID,
  PHONE, OTHERPHI`
- **Label mapping to our schema:**
  | HF label | Our schema | Notes |
  |---|---|---|
  | PATIENT | PATIENT NAME | direct |
  | STAFF | PROVIDER NAME | direct |
  | HOSP | FACILITY | direct |
  | PATORG | ORGANIZATION | direct |
  | LOC | LOCATION | direct |
  | AGE | AGE | direct |
  | DATE | DATE | direct |
  | EMAIL | EMAIL | direct |
  | ID | ID | direct (no MRN split) |
  | PHONE | PHONE | direct |
  | OTHERPHI | — | dropped (unmappable) |
  | — | MRN, DOB, ADDRESS, OCCUPATION, NAME | **not predicted** |
- **Caveats:** This is the BERT sibling of `obi/deid_roberta_i2b2` (already tested:
  F1 0.338 on our 300 notes — poor transfer, BILOU fragmentation, type confusion).
  The BERT variant may behave differently (ClinicalBERT base vs RoBERTa-large) and
  is worth one run, but expect similar transfer loss. An independent 2026 paper
  ("Towards Fair and Efficient De-identification") reported obi-deid-bert at
  P/R ≈ 0.91–0.94 on MIMIC-derived data — decent but not SOTA-class.
- **Verdict:** #3 candidate. Same label schema as already-tested RoBERTa sibling;
  run to check whether the ClinicalBERT variant transfers better.

### C. riggsmed/deid-LONGFORMER-NemPII

- **Source:** Riggs (Gary Riggs, MD), GitHub `Hrygt/deid-longformer-nempii`, 2024/25.
  Apache-2.0. (Note: an older `hrygt/deid-longformer-nempii` HF path now 401s;
  the live weights are at `riggsmed/deid-LONGFORMER-NemPII`.)
- **Published:** F1 **97.74% on own 20% held-out** of the NVIDIA Nemotron-PII
  healthcare subset (3,630 synthetic records) — **not** a standard benchmark.
- **Architecture:** Clinical-Longformer (`yikuan8/Clinical-Longformer`), 148M params,
  4,096-token context, `model.safetensors`. BILOU-ish (B/I/L/U) tagging.
- **Access:** Public, non-gated. ~128 downloads.
- **Labels (25 types):** `FIRST_NAME, LAST_NAME, DATE, DATE_OF_BIRTH, DATE_TIME, TIME,
  AGE, SSN, MEDICAL_RECORD_NUMBER, HEALTH_PLAN_BENEFICIARY_NUMBER, ACCOUNT_NUMBER,
  CERTIFICATE_LICENSE_NUMBER, PHONE_NUMBER, FAX_NUMBER, EMAIL, STREET_ADDRESS, CITY,
  STATE, POSTCODE, COUNTRY, BIOMETRIC_IDENTIFIER, UNIQUE_ID, CUSTOMER_ID, EMPLOYEE_ID`
- **Label mapping to our schema:**
  | HF label | Our schema | Notes |
  |---|---|---|
  | FIRST_NAME/LAST_NAME | PATIENT NAME | **no patient/provider distinction** |
  | MEDICAL_RECORD_NUMBER | MRN | direct |
  | DATE_OF_BIRTH | DOB | direct |
  | DATE | DATE | direct |
  | AGE | AGE | direct |
  | PHONE_NUMBER/FAX_NUMBER | PHONE | direct |
  | EMAIL | EMAIL | direct |
  | STREET_ADDRESS/CITY/STATE/POSTCODE/COUNTRY | ADDRESS / LOCATION | direct |
  | SSN, ACCOUNT_NUMBER, UNIQUE_ID, … | ID | direct |
  | — | PROVIDER NAME, FACILITY, ORGANIZATION, OCCUPATION, NAME | **not predicted** |
- **Caveats:** (1) Self-reported metric on own synthetic training distribution —
  not comparable to i2b2 numbers; expect a drop on real-style notes. (2) No
  patient/provider/facility distinction hurts exact-span F1 on our schema.
  (3) Trained on synthetic Nemotron data; generalization to MedDeID synthetic
  notes is untested. (4) 4096-token Longformer is the heaviest of the three
  on CPU. Strengths: MRN/DOB/ADDRESS granularity is the best of the candidates,
  and long-context handling suits clinical notes.
- **Verdict:** #2 candidate. Best label coverage for our schema; run it, but treat
  the 97.74% claim as in-distribution only.

---

## 3. Ranked shortlist (worth running on the 300 MedDeID notes)

| Rank | Model (HF ID) | Published score | Size/arch | Why run it |
|---|---|---|---|---|
| 1 | `StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2` | **98.9 F1, i2b2 2014** (JAMIA 2022) | BERT-base, `pytorch_model.bin` | Highest published i2b2-2014 F1 with a public checkpoint; the true SOTA reference |
| 2 | `riggsmed/deid-LONGFORMER-NemPII` | 97.7 F1 (own Nemotron held-out) | Longformer 148M, safetensors, 4k ctx | Best label granularity for our schema (MRN, DOB, ADDRESS); long-context clinical model |
| 3 | `obi/deid_bert_i2b2` | ~0.91–0.94 P/R (MIMIC-derived, 2026) | ClinicalBERT-base, `pytorch_model.bin` | Clinical-domain BERT; check if it transfers better than its RoBERTa sibling (0.338) |

Optional 4th: `StanfordAIMI/stanford-deidentifier-base` — identical 7-label head to #1
(1.39M downloads, likely an earlier training mix); run only if #1 shows issues.

All three are public, non-gated, CPU-runnable via `transformers`
(`AutoModelForTokenClassification` / token-classification pipeline; Longformer
needs the `longformer` model type, supported natively).

---

## 4. Models considered and excluded

| Model | Why excluded |
|---|---|
| `obi/deid_roberta_i2b2` | Already tested — F1 0.338 on our 300 notes |
| `urchade/gliner_multi_pii-v1` | Already tested; general PII, not clinical SOTA |
| `stighellemans/meddeid-english-synth` | Already tested; in-distribution benchmark authors' model |
| John Snow Labs De-ID | Commercial, no public checkpoint |
| Microsoft Azure Health De-ID / AWS Comprehend Medical | Commercial APIs; Kuo 2025 winner but not locally runnable |
| GPT-4 / DeID-GPT | API-only, non-reproducible, DUA-problematic |
| DEFT (0.963 i2b2) | No public checkpoint found |
| "Beyond Accuracy" NER (0.978 micro) | No public checkpoint found |
| Dernoncourt Bi-LSTM (0.979) | No public checkpoint found |
| Transformer-DeID / KindLab (0.904–0.924) | Lower scores; PhysioNet credentialed access required |
| UCSF Philter | Rule-based, no neural checkpoint |
| AnonCAT | UK/NHS-focused; wrong PHI schema |
| OpenMed PII models (Small/Base/Large) | General PII, small; OpenMed Small already our browser base |

---

## 5. Expected label-mapping loss (all candidates)

No public SOTA checkpoint covers our full 15-type schema. Expected gaps:

- **MRN**: only Longformer-NemPII predicts it natively. StanfordAIMI and OBI fold
  it into generic ID → MRN recall will read as 0 for those two (mapping artifact,
  same as the MedDeID model in the earlier SOTA run).
- **DOB**: only Longformer-NemPII (`DATE_OF_BIRTH`). Others → DATE or missed.
- **ADDRESS**: only Longformer-NemPII (street/city/state/postcode). OBI has LOC
  (→LOCATION); StanfordAIMI has nothing geographic.
- **OCCUPATION / NAME(other)**: no candidate predicts these.
- **PROVIDER NAME**: StanfordAIMI (`HCW`) and OBI (`STAFF`) distinguish it;
  Longformer-NemPII does not (all names → patient bucket).
- **FACILITY**: OBI (`HOSP`) and StanfordAIMI (`HOSPITAL`) cover hospitals;
  Longformer-NemPII has no facility label.

Recommendation for the runner: report **both** exact-span F1 on our schema (primary,
with documented mapping) **and** character-level label-agnostic recall (the MedDeID
paper's metric), exactly as in `sota-nonbrowser.md`, so mapping artifacts don't
masquerade as model failures.

---

## 6. Key references

- Chambon et al., JAMIA 2022 (ocac219) — StanfordAIMI, 98.9 i2b2-2014.
  https://doi.org/10.1093/jamia/ocac219
- Kailas et al., OBI Robust De-ID, 2022 — https://github.com/obi-ml-public/ehr_deidentification
- Riggs, deid-LONGFORMER-NemPII, 2024/25 — https://github.com/hrygt/clinical-deid
- Kuo et al., iScience 2025 (DOI 10.1016/j.isci.2025.113732) — transformer de-ID
  benchmark; Azure best, GPT-4 strong (both API-only).
- Liu et al., arXiv 2312.08495 (2023) — 0.978 micro F1, no checkpoint.
- Tan et al., Interact J Med Res 2023 (DEFT) — 0.963 F1, no checkpoint.
- Dernoncourt et al., JAMIA 2017 — 0.979 F1 Bi-LSTM, no checkpoint.
- Chen et al., arXiv 2602.15869 (2026) — multilingual de-ID efficiency study;
  obi-deid-bert P/R ≈ 0.91–0.94.
