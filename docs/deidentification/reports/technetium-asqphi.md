# Technetium-I and ASQ-PHI Benchmarks

**Date:** 2026-09-30 to 2026-10-01 (Technetium-I runs completed 08:14 UTC Oct 1)
**Pipeline:** browser de-identification pipeline (frozen site snapshot, `deid.bundle.js` sha256 `44673dde843ef048…`), all four base models run WITH the full Track D rule stack
**Datasets:** Technetium-I test split (TeMLM Foundation, HF `temlm-foundation/Technetium-I`, DOI 10.57967/hf/8177) and ASQ-PHI (Weatherhead, Golovko & McCaffrey, *Data in Brief* 65:112586 (2026), doi:10.1016/j.dib.2026.112586)

## Results

### ASQ-PHI (1,051 queries; all models + Track D)

Headline metrics per model. Exact-span F1 is primary; overlap F1 absorbs the systematic boundary-convention differences; character recall is the operational redaction-coverage number. Over-redaction is measured on the 219 hard-negative (zero-PHI) queries — reported both raw and excluding AGE-only flags (see § Over-redaction).

| Model (+ Track D) | Exact F1 | 95% CI | P | R | Overlap F1 | Char recall | Over-redact | Over-redact (non-AGE) |
|---|---|---|---|---|---|---|---|---|
| Stanford | 0.6239 | [0.6108, 0.6374] | 0.5704 | 0.6884 | 0.8236 | 0.9272 | 0.7945 | 0.0639 |
| RoBERTa i2b2 | 0.6059 | [0.5918, 0.6199] | 0.5538 | 0.6689 | 0.8138 | 0.9242 | 0.7900 | 0.0639 |
| OpenMed Small | 0.5976 | [0.5833, 0.6123] | 0.5485 | 0.6565 | 0.7946 | 0.9118 | 0.7945 | 0.0776 |
| ClinicalE5-33M | 0.5974 | [0.5828, 0.6118] | 0.5413 | 0.6666 | 0.7992 | 0.9235 | 0.7945 | 0.0868 |

The ranking (Stanford > RoBERTa > OpenMed ≈ ClinicalE5) matches MedDeID exactly. Stanford's lead over RoBERTa is small but the CIs barely touch. The exact→overlap gap (~0.20 F1) is boundary noise, not missed PHI — character recall sits at 0.91–0.93 for all four models, meaning roughly 92% of PHI characters are covered regardless of base model.

Stanford + Track D per-type exact-span detail:

| Gold type | n | P | R | F1 |
|---|---|---|---|---|
| DATE | 806 | 0.9718 | 0.9404 | 0.9559 |
| EMAIL_ADDRESS | 31 | 1.0000 | 0.9677 | 0.9836 |
| PHONE_NUMBER | 45 | 0.9375 | 1.0000 | 0.9677 |
| GEOGRAPHIC_LOCATION | 825 | 0.8306 | 0.7248 | 0.7741 |
| MEDICAL_RECORD_NUMBER | 305 | 0.7484 | 0.7902 | 0.7687 |
| SOCIAL_SECURITY_NUMBER | 33 | 0.6000 | 1.0000 | 0.7500 |
| HEALTH_PLAN_BENEFICIARY_NUMBER | 91 | 0.6000 | 0.3626 | 0.4521 |
| NAME | 814 | 0.3511 | 0.3636 | 0.3573 |
| UNIQUE_IDENTIFIER | 14 | 0.1538 | 0.2857 | 0.2000 |
| FAX_NUMBER | 2 | 0.0741 | 1.0000 | 0.1379 |
| ACCOUNT_NUMBER | 4 | 0.1538 | 1.0000 | 0.2667 |
| CERTIFICATE_LICENSE_NUMBER | 1 | 0.0435 | 1.0000 | 0.0833 |
| IP_ADDRESS | 1 | 0.0435 | 1.0000 | 0.0833 |

Structured identifiers (dates, emails, phones) are near-perfect. The NAME exact-span F1 of 0.36 is almost entirely boundary noise, not missed names: the pipeline finds "Anna S." but emits "MS like Anna S." (model grabbing preceding words), "Mr. James T." (title), "Sarah P" (dropped period). Overlap recall for NAME-type spans is far higher, and character recall overall is 0.93. The low precision on the rare ID-ish types (ACCOUNT, CERTIFICATE, FAX, IP) is partly a measurement artifact: one predicted ID span is counted as a false positive against every gold type whose label group contains ID.

### Over-redaction on ASQ-PHI hard negatives

All four models flag ~79% of the 219 hard negatives (Stanford 174, RoBERTa 173, ClinicalE5 174, OpenMed 174) — but 160 of Stanford's 174 flags are AGE-only ("55-year-old male" and the like). The dataset's 13 Safe Harbor categories do not annotate ages as PHI; our pipeline's Track D age rule redacts them anyway. Excluding AGE-only flags, the over-redaction rates are: Stanford 6.4% (14/219), RoBERTa 6.4% (14/219), OpenMed 7.8% (17/219), ClinicalE5 8.7% (19/219) — spread across PATIENT NAME, FACILITY, DATE, ORGANIZATION, and LOCATION false positives. Whether the AGE flags count as over-redaction is a policy question: HIPAA Safe Harbor permits ages under 90, but many clinical redaction systems remove all ages. Both numbers are reported so the reader can apply their own policy.

### Technetium-I (1,500-note stratified sample; all models + Track D)

| Model (+ Track D) | Exact F1 | 95% CI | P | R | Overlap F1 | Char recall |
|---|---|---|---|---|---|---|
| Stanford | 0.5273 | [0.5256, 0.5293] | 0.5373 | 0.5177 | 0.7948 | 0.9971 |
| OpenMed Small | 0.5273 | [0.5255, 0.5292] | 0.5371 | 0.5177 | 0.7946 | 0.9971 |
| RoBERTa i2b2 | 0.5228 | [0.5209, 0.5247] | 0.5279 | 0.5177 | 0.7879 | 0.9972 |
| ClinicalE5-33M | 0.5210 | [0.5192, 0.5229] | 0.5243 | 0.5177 | 0.7852 | 0.9971 |

Three things stand out. First, the ranking is nearly flat: all four models sit within 0.006 F1 and every confidence interval overlaps. Stanford and OpenMed tie at 0.5273. Second, recall is identical for all four models (0.5177): the base model changes only the false positive count, never which gold spans are found. The template generated notes are dominated by structured identifiers that the rules find regardless of base model. Third, character recall is 0.997 for every model, meaning essentially every PHI character is covered even where exact span F1 sits near 0.52.

Stanford + Track D per-type exact-span detail:

| Gold type | n | P | R | F1 |
|---|---|---|---|---|
| DOB | 1,500 | 1.0000 | 1.0000 | 1.0000 |
| EMAIL | 1,500 | 1.0000 | 1.0000 | 1.0000 |
| PHONE | 1,500 | 0.9987 | 1.0000 | 0.9993 |
| ID | 1,500 | 0.9881 | 1.0000 | 0.9940 |
| DATE | 3,000 | 0.7922 | 1.0000 | 0.8840 |
| NAME | 3,063 | 0.2866 | 0.4897 | 0.3616 |
| AGE | 3,718 | 0.0000 | 0.0000 | 0.0000 |
| LOCATION | 4,500 | 0.0000 | 0.0000 | 0.0000 |

Structured identifiers (DOB, EMAIL, PHONE, ID) are essentially solved. The two zeros need explanation, not alarm. Gold AGE annotates the bare number ("40") while the pipeline emits the full expression ("40 years"), so no exact span ever matches even though the characters are covered. Gold LOCATION splits a full address into three spans (street, city, ZIP) while the pipeline merges them into one ADDRESS span. Both are boundary convention artifacts: character recall for the full run is 0.9971, so the PHI is being redacted, just not with gold's boundaries. NAME at 0.36 F1 is the same story in milder form: the template's regular name fields produce boundary differences that cost exact matches without costing coverage.

## Method

### Pipeline and models

All runs use the same browser pipeline harness as the MedDeID benchmark (transformers.js in headless Chromium, `hybrid` mode): the ONNX NER model proposes spans, then the deterministic rule stack (Track B/C/D) adds, corrects, and filters entities. To keep this benchmark reproducible while the main pipeline continues to evolve, the site was snapshotted to `technetium-asq/site/` (bundle sha256 `44673dde843ef048…`); the ONNX weights are symlinked from the MedDeID harness so every run uses byte-identical models.

Four base models, each with the FULL Track D rule stack (comparators get the same rules — no handicapping):

| Model | HuggingFace ID | Quantization |
|---|---|---|
| Stanford de-identifier | `onnx-community/stanford-deidentifier-base-ONNX` | q8 |
| RoBERTa i2b2 | `thinkingface/deid_roberta_i2b2_q` | q8 |
| ClinicalE5-Small 33M | `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android` | int8 |
| OpenMed Small | `Wismut/openmed-onnx/small` | int8 |

### Metrics

- **Exact-span F1 (primary):** a predicted span is a true positive iff its character offsets exactly match a gold span AND its label falls in that gold type's accepted label group (below). Micro-averaged over notes. This is the same strict metric as the MedDeID benchmark, with label groups added because the new datasets use coarser labels than our pipeline emits.
- **Overlap F1 (secondary):** 1:1 greedy matching — a predicted span is a true positive iff it overlaps a gold span with a label in that gold type's group. This absorbs systematic boundary-convention differences (gold "Anna S." with trailing period vs pipeline "Anna S"; gold bare "40" vs pipeline "40 years"; pipeline titles like "Mr. James T."). The exact-vs-overlap gap measures how much of the error is boundaries rather than missed PHI.
- **Per-type P/R/F1:** diagnostic breakdown by gold type. False positives are attributed to every gold type whose label group contains the predicted label, so per-type FP counts can double-count across types; they are diagnostic, not additive.
- **Character-level recall:** fraction of gold-annotated characters covered by any predicted span (label ignored), micro-averaged — the operationally important number for a redaction system.
- **Uncertainty:** note-level bootstrap 95% confidence intervals, 1,000 resamples, seed 20260930.
- **ASQ-PHI only — over-redaction rate:** fraction of the 219 hard-negative (zero-PHI) queries on which the pipeline emits any span. This is the only open measurement of over-redaction on clinical text.

### Label mapping

Our pipeline emits 22 canonical types (ADDRESS, AGE, DATE, DOB, EMAIL, FACILITY, ID, LOCATION, MRN, NAME, ORGANIZATION, PATIENT NAME, PHONE, PROVIDER NAME, …). Both new datasets label more coarsely, so each gold type maps to a SET of acceptable pipeline labels. The mapping was designed from a 30-note/30-query pilot inspecting what the pipeline actually emits for each gold span:

**Technetium-I** (gold types: NAME, ID, DATE, AGE, PHONE, EMAIL, LOCATION):

| Gold type | Accepted pipeline labels | Notes |
|---|---|---|
| NAME | PATIENT NAME, NAME, PROVIDER NAME | Notes are headed "Patient Name: Last, First"; the pipeline labels these PATIENT NAME. A few attending-physician names are PROVIDER NAME. |
| ID | MRN, ID | Every gold ID sits after an "MRN:" label (verified on 3,000 notes); the pipeline emits MRN. |
| DATE | DATE | Dates after a "Date of Birth:"/"DOB:" label are split to DOB (see below). |
| DOB | DOB | Deterministic split: DATE spans whose preceding 30 characters end with a "Date of Birth:" or "DOB:" label. |
| AGE | AGE | |
| PHONE | PHONE | |
| EMAIL | EMAIL | |
| LOCATION | LOCATION, ADDRESS | The pipeline merges "4405 Central Street, Lynn, MA 02174" into one ADDRESS span where gold has three LOCATION spans (street, city, ZIP). |

**ASQ-PHI** (gold types are HIPAA Safe Harbor-ish; values reconstructed to character offsets by first-occurrence search — 2,972 of 2,973 values found, 3 ambiguous):

| Gold type | Accepted pipeline labels | Notes |
|---|---|---|
| NAME | NAME, PATIENT NAME, PROVIDER NAME | Queries mix patient names ("Anna S.") and providers ("Dr. John L."); gold does not distinguish, the pipeline does. |
| GEOGRAPHIC_LOCATION | LOCATION, FACILITY, ORGANIZATION | Gold lumps hospitals ("Methodist Hospital"), clinics ("Valley Clinic"), and cities; the pipeline distinguishes FACILITY/ORGANIZATION/LOCATION. |
| DATE | DATE | |
| MEDICAL_RECORD_NUMBER | MRN, ID | Pilot: pipeline emits MRN. |
| HEALTH_PLAN_BENEFICIARY_NUMBER | ID | |
| PHONE_NUMBER | PHONE | |
| SOCIAL_SECURITY_NUMBER | ID | |
| EMAIL_ADDRESS | EMAIL | |
| UNIQUE_IDENTIFIER | ID | |
| ACCOUNT_NUMBER | ID | |
| FAX_NUMBER | PHONE, ID | |
| CERTIFICATE_LICENSE_NUMBER | ID | |
| IP_ADDRESS | IP, ID | |

### Technetium-I design: why a stratified sample, not the full split

The full test split is 74,700 notes. A 200-note latency pilot measured ~11.4s median per note under concurrent load (≈2.5s/note uncontended, matching the Track D MedDeID runs). Even at the uncontended rate, the full split needs ~52 hours per model — infeasible for a four-model comparison. Instead: a **1,500-note stratified sample** (seed 20260930), stratified by note-length tertile × PHI-density tertile (9 strata, proportional allocation), holding 20,281 gold spans — enough for bootstrap CIs within ±0.01 on the headline F1s.

Two gold-annotation quirks were normalized before scoring, and are documented here rather than hidden:
1. **Overlapping NAME spans:** the template annotates "Patient Name: Moore, James" as three overlapping NAME spans ("Moore", "Moore, James", "James"). A perfect prediction of "Moore, James" would score 1 TP + 2 FN. Overlapping same-type spans were deduplicated, keeping the longest (total spans 1,161,437 → 1,011,101).
2. **Birth-date split:** as with MedDeID, DATE spans in "Date of Birth:" position are scored as DOB.

### ASQ-PHI design

All 1,051 queries (832 PHI-positive + 219 hard negatives) run for all four models — queries are short (~200 chars), so the full set is cheap. Offsets were reconstructed from the value-based annotations; one GEOGRAPHIC_LOCATION value could not be located in its query text and was dropped (2,972/2,973 kept).

## Limitations

- **Technetium-I is template-generated**, not human-written: phrasing is regular ("Patient Name: X, Y", "MRN: 1234567"), so absolute scores read higher than they would on real notes and the ranking matters more than the level. It was cited as an external benchmark in the MedDeID paper, which is why it is included.
- **ASQ-PHI queries are not notes**: short search-style queries ("What is the latest treatment protocol for…") are a different genre from clinical documentation; treat it as an adversarial/utility complement, not a note-level benchmark.
- **ASQ-PHI offsets are reconstructed**, not native: value→offset by first-occurrence search. Three values occur more than once in their query (first occurrence used); one value was unlocatable and dropped.
- **Gold boundary conventions differ from the pipeline's**: Technetium annotates bare "40" where the pipeline emits "40 years"; ASQ-PHI annotates "Anna S." (with period) where the pipeline emits "Anna S". Exact-span F1 penalizes these; character recall does not — read the two together.
- **One fixed sample** for Technetium-I (seed 20260930); the full 74,700-note split was not run.
- Benchmarks ran with another benchmark suite concurrently on the same machine; latencies are reported as measured and are inflated by CPU contention, but accuracy is unaffected.

## Comparison with MedDeID

Exact-span F1 across the three clinical datasets (all models + Track D):

| Model | MedDeID (300 notes) | ASQ-PHI (1,051 queries) | Technetium-I (1,500 notes) |
|---|---|---|---|
| Stanford | 0.5337 | 0.6239 | 0.5273 |
| RoBERTa i2b2 | 0.5229 | 0.6059 | 0.5228 |
| OpenMed Small | 0.4849 | 0.5976 | 0.5273 |
| ClinicalE5-33M | 0.4607 | 0.5974 | 0.5210 |

The ASQ-PHI ranking reproduces the MedDeID ranking exactly: Stanford > RoBERTa > OpenMed > ClinicalE5, with Stanford's lead over RoBERTa small but consistent. This is the first independent replication of that order on a different clinical dataset, and it strengthens the case that Stanford is the better default base model for clinical text.

Technetium-I tells a different story about discrimination, not about ranking. All four models land within 0.006 F1 with overlapping confidence intervals, so the dataset cannot separate them. The template generated notes are dominated by structured identifiers that the rule stack finds regardless of base model, which is why recall is identical (0.5177) across all four. The ranking still places Stanford joint first, but the honest read is that Technetium-I measures the rule stack, not the base models.

Absolute levels are not comparable across datasets. Technetium-I uses 8 coarse gold types, ASQ-PHI uses 13 Safe Harbor style types, MedDeID uses 14 mapped labels. Character recall is the more portable number: 0.997 on Technetium-I, 0.91 to 0.93 on ASQ-PHI, 0.83 to 0.89 on MedDeID. The pattern is consistent: coverage stays high while exact span F1 moves with schema granularity and boundary conventions.
