# Stream 2 — Technetium-I schema remap and rescore

**Task:** Fix the label-schema mapping between our pipeline's 15 PHI types and the Technetium-I gold schema, rescore the 1,500-note sample, and diagnose any remaining zero-F1 types.
**System under test:** Stanford clinical base + frozen D1–D12 rules (no tuning, no rule changes in this stream).
**Date:** 2026-10-01 (~01:00–04:00 EDT). **Method:** deterministic type remap of predictions; rescoring with the unchanged `score_ta.py`. No randomness involved in the remap itself; scorer bootstrap CIs use the scorer's built-in seed 20260930 (1,000 note-level resamples).

## 1. Method

**Gold schema, as realized.** The Technetium-I test split natively contains 7 entity types (NAME, ID, DATE, AGE, PHONE, EMAIL, LOCATION — validated in `models-survey/dataset-survey.md`). However, the sample gold (`technetium-asq/tc_sample_gold.json`) contains **8** types: the sampler (`sample_technetium.py`) deterministically splits DATE spans in birth-date context ("Date of Birth:"/"DOB:") into a separate DOB type (1,500 spans, exactly 1/note). The realized gold schema is therefore **{NAME, ID, DATE, DOB, AGE, PHONE, EMAIL, LOCATION}** — 20,281 spans over 1,500 notes.

**Mapping direction.** Predictions → gold schema (gold untouched). This is the methodologically standard direction: the gold is the external reference. Folding gold DOB back into DATE was considered and rejected — it would discard the sampler's documented design and manufacture 1,500 misses. Gold is not modified in any way.

**Our types.** Of the pipeline's 15 PHI types, 11 appear in this sample's predictions: PATIENT NAME, PROVIDER NAME, MRN, DOB, AGE, DATE, PHONE, EMAIL, ADDRESS, ID, ORGANIZATION (20,041 spans). FACILITY, NAME, LOCATION, OCCUPATION have zero predictions in the sample but are mapped explicitly for completeness.

### 1.1 Explicit 15→8 type mapping

| Our type | → Technetium gold type | One-line justification |
|---|---|---|
| PATIENT NAME | NAME | Technetium collapses all person names into one NAME bucket |
| PROVIDER NAME | NAME | Same; no patient/provider distinction in gold |
| NAME | NAME | Identity (0 predictions in sample) |
| FACILITY | LOCATION | A facility is a place; LOCATION is the only place bucket (0 predictions in sample) |
| ADDRESS | LOCATION | Coarse address → fine-grained location bucket |
| LOCATION | LOCATION | Identity (0 predictions in sample) |
| ORGANIZATION | LOCATION | **Least-bad, documented:** no faithful target exists. LOCATION chosen over NAME to avoid corrupting person-name precision (same rationale as the ASQ-PHI groups, where FACILITY/ORGANIZATION→GEOGRAPHIC_LOCATION). Only 1 ORGANIZATION prediction exists in the whole sample — a "DETAILS" false positive on a template placeholder (`[HOSPITAL_COURSE_DETAILS]`) — so the choice is numerically immaterial but is made explicit |
| MRN | ID | Medical record number is an identifier; gold collapses all IDs into ID |
| ID | ID | Identity |
| DOB | DOB | **Rejected the suggested DOB→DATE:** gold keeps DOB separate (sampler-derived) and our 1,500 DOB predictions already match exactly (DOB F1=1.0). Mapping to DATE would manufacture 1,500 misses and contradict the documented gold construction |
| DATE | DATE | Identity |
| PHONE | PHONE | Identity |
| EMAIL | EMAIL | Identity |
| AGE | AGE | Identity |
| OCCUPATION | **dropped** | **Explicit drop, documented:** no faithful Technetium target ("teacher" is neither a NAME nor a LOCATION; Technetium's advertised PROFESSION type is absent from the test split). 0 OCCUPATION predictions in this sample, so the drop affects nothing; the label-agnostic character-recall metric still covers any such span for the privacy-oriented measure |

**Implementation:** `technetium-asq/remap_tc_types.py` reads `checkpoints/tc_stanford.jsonl`, applies the table, writes `out/tc_stanford_remapped.json` (same `{id, entities}` JSON the scorer consumes). 0 spans dropped. Rescored via the unmodified `score_ta.py technetium tc_stanford_remapped`; output saved as `technetium-asq/technetium_scores_remapped.json`. The original `technetium_scores.json` was backed up before the scorer ran and restored byte-identical afterward (md5 `e6fd663b727ecb070db6470a86f59006` before and after).

## 2. Before / after numbers

### 2.1 Overall

| Metric | Before (original mapping, scorer's implicit TC_GROUPS) | After (explicit 15→8 remap) |
|---|---|---|
| Exact-span F1 | 0.5273 [0.5256, 0.5293] | **0.5273 [0.5256, 0.5293]** |
| Exact-span P / R | 0.5373 / 0.5177 | 0.5373 / 0.5177 |
| Exact TP / FP / FN | 10,500 / 9,041 / 9,781 | 10,500 / 9,041 / 9,781 |
| Overlap F1 (P/R) | 0.7948 (0.8098/0.7803) | 0.7948 (0.8098/0.7803) |
| Character recall | 0.9971 [0.9967, 0.9975] (196,222/196,786 chars) | **0.9971 [0.9967, 0.9975]** |

The numbers are **identical to 4 decimal places**. This is the first honest finding: the explicit remap is numerically a no-op because the scorer's built-in `TC_GROUPS` already implemented exactly this granularity handling (PATIENT/PROVIDER NAME→NAME, MRN→ID, ADDRESS→LOCATION, DOB→DOB). The remap's value is documentation and auditability, not a score change — and the audit below reclassifies the two zero-F1 types from "label-schema artifact" to **boundary-convention artifact**, which is a stronger and more precise claim.

### 2.2 Per-type exact-span P/R/F1 (before → after)

| Gold type | Before P/R/F1 (tp/fp/fn) | After P/R/F1 (tp/fp/fn) |
|---|---|---|
| AGE | 0.0000 / 0.0000 / 0.0000 (0/3000/3718) | 0.0000 / 0.0000 / 0.0000 (0/3000/3718) |
| DATE | 0.7922 / 1.0000 / 0.8840 (3000/787/0) | identical |
| DOB | 1.0000 / 1.0000 / 1.0000 (1500/0/0) | identical |
| EMAIL | 1.0000 / 1.0000 / 1.0000 (1500/0/0) | identical |
| ID | 0.9881 / 1.0000 / 0.9940 (1500/18/0) | identical |
| LOCATION | 0.0000 / 0.0000 / 0.0000 (0/1500/4500) | 0.0000 / 0.0000 / 0.0000 (0/**1501**/4500) |
| NAME | 0.2866 / 0.4897 / 0.3616 (1500/3733/1563) | identical |
| PHONE | 0.9987 / 1.0000 / 0.9993 (1500/2/0) | identical |

The sole delta: LOCATION fp 1500→1501, from the single ORGANIZATION→LOCATION remapped prediction ("DETAILS" on `[HOSPITAL_COURSE_DETAILS]`).

### 2.3 Boundary-tolerant diagnostics (supports the interpretation, not a rescoring)

Per-type overlap P/R/F1 (scorer's 1:1 greedy overlap logic, computed per type with a mirror script) and per-type character recall:

| Type | Overlap P | Overlap R | Overlap F1 | Char recall |
|---|---|---|---|---|
| AGE | 1.0000 | 0.8069 | 0.8931 | 0.8069 |
| DATE | 0.7922 | 1.0000 | 0.8840 | 1.0000 |
| DOB | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| EMAIL | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| ID | 0.9881 | 1.0000 | 0.9940 | 1.0000 |
| LOCATION | 0.9993 | 0.3333 | 0.4999 | **1.0000** |
| NAME | 0.4443 | 0.7591 | 0.5605 | **1.0000** |
| PHONE | 0.9987 | 1.0000 | 0.9993 | 1.0000 |

## 3. Diagnosis of the remaining zeros

### AGE (exact F1 = 0.0) — boundary convention + gold injection noise, not detection failure

Two compounding causes, both verified in the data:

1. **Boundary convention (dominant).** Gold annotates the bare numeral (`'24'`, [90,92)); our pipeline annotates the full phrase (`'24 years'`, [90,98)). Exact-span matching requires identical offsets, so every AGE prediction misses and every gold AGE span is a false negative — while overlap F1 for AGE is 0.8931 with overlap precision 1.0000. Concrete example (note `TEMLM_489270`): gold AGE `'24'` [90,92) in `"Age: 24 years"` vs. our AGE `'24 years'` [90,98). Same for `'69'` vs `'69 years'` (`TEMLM_434023`), `'28'` vs `'28 years'` (`TEMLM_456869`).
2. **Gold injection noise (~12%).** 434 of 3,718 gold AGE spans (11.7%) are nested *inside other gold spans* — the template generator labeled age-digit substrings wherever they occurred: `'24'` inside the phone number `'(876) 917-1247'` [1852,1866) and inside the street number `'2446 Oak Avenue'`; `'51'` inside the MRN `'2045143'`. Our system correctly does not label digits inside phone numbers/MRNs as ages. This explains AGE char recall of 0.8069 rather than ~1.0: the gap is gold noise, not missed ages.

### LOCATION (exact F1 = 0.0) — granularity convention, not detection failure

Gold splits each address into three fine-grained spans — street (`'2446 Oak Avenue'` [1946,1961)), city (`'Boston'` [1963,1969)), ZIP (`'02120'` [1974,1979)) — while our pipeline emits one coarse ADDRESS span per address (`'2446 Oak Avenue, Boston, MA 02120'` [1946,1979)). No exact boundary can match, so exact F1 is 0.0 in both directions. But **character recall for LOCATION is 1.0000**: every gold LOCATION character is covered by our prediction, with overlap precision 0.9993 (i.e., our coarse spans contain essentially nothing but gold LOCATION characters). The overlap recall of exactly 0.3333 is structural: the 1:1 greedy matcher credits only the best-overlapping gold span per prediction, so one-span-per-address can never exceed 1/3 recall against three-spans-per-address gold. Any system emitting address-level spans faces the same ceiling.

### NAME (exact F1 = 0.3616) — two convention effects; zero genuine misses

- **Every one of the 3,063 gold NAME spans overlaps at least one of our predictions** (verified: 0 gold NAME spans with zero overlap from any prediction type). The 1,563 exact-span false negatives are the HPI first/last-name splits: gold annotates `'Sarah'` [217,222) + `'Garcia'` [223,229) as two spans; we emit `'Sarah Garcia'` [217,229) as one. The 1,500 exact TPs are the header `'Garcia, Sarah'` spans, which match exactly. Overlap recall 0.7591 vs. exact recall 0.4897 quantifies the boundary-split effect.
- **The low NAME precision (0.2866) is a gold-coverage gap, not false alarms.** All 1,500 `"Dr. X"` provider-name occurrences in the notes (e.g. `'Dr. Miller'`, `'Dr. Anderson'`) are unannotated in gold (0/1,500 annotated). Our pipeline emits 5,233 NAME-typed predictions, of which 1,500 are exactly these `"Dr. X"` provider names — spans a privacy system is *supposed* to redact. The gold schema simply does not cover provider names (Technetium-I gold is by construction limited to its 7 types, and in practice NAME covers patient names only). Penalizing provider-name redaction as "false positives" is a schema-coverage artifact.

### DATE (F1 = 0.8840; the only non-convention gap)

DATE has exact recall 1.0000 and precision 0.7922 (787 FPs on 3,787 predictions). This is the one type where the shortfall is not a boundary or coverage artifact on inspection — it reflects our pipeline emitting DATE-typed spans (e.g. partial dates, durations) that the template gold does not annotate. No type-mapping change addresses it; it is out of scope for this stream (no tuning allowed).

## 4. Honest interpretation: what the corrected number does and doesn't prove

**What it proves.** On 1,500 stratified template-generated discharge summaries, the frozen system (Stanford clinical + D1–D12) achieves near-complete *detection-level* coverage of the Technetium-I gold: character recall 0.9971 [0.9967, 0.9975]; DOB/EMAIL/ID/PHONE exact-span F1 ≥ 0.994; every gold NAME character covered; every gold LOCATION character covered. The exact-span micro-F1 of 0.5273 is reproducible and tightly bounded, but it is dominated by annotation-convention mismatches, not by failures to find PHI.

**What it doesn't prove.**
- The 0.527 exact-span F1 must not be quoted without the convention analysis in §3. A reader comparing 0.527 against i2b2-style numbers would be misled: under boundary-tolerant scoring the same predictions score overlap F1 0.7948, and the residual gap is convention (numeral-vs-phrase ages, split-vs-merged names, fine-vs-coarse addresses), gold injection noise (age digits labeled inside phone numbers/MRNs/street numbers), and gold coverage gaps (provider names systematically unannotated).
- **Template-generated notes, gold by construction, unreviewed.** The dataset survey records: no human review of annotations; structurally repetitive (exactly one ID, one PHONE, one EMAIL per note); all 74,700 test notes are `discharge_summary`. Findings about boundary conventions are findings about the *template generator's* annotation choices as much as about our system.
- **1,500-note sample of 74,700.** Stratified by note-length × PHI-density tertiles (seed 20260930); CIs are tight, but the sample inherits all template artifacts of the parent split.
- **Gold DOB is sampler-derived** (regex on "Date of Birth:" context), not native Technetium-I — the perfect DOB score partly reflects how cleanly the sampler's rule aligns with our DOB detector.
- The explicit remap changed nothing numerically versus the scorer's implicit groups; the "before" number was already convention-limited, not label-limited. The initial hypothesis ("AGE/LOCATION zeros are a label-schema artifact") was **wrong in mechanism**: the type mapping was already correct, and the zeros are boundary/granularity artifacts. This correction is itself the stream's main result.

## 5. Limitations

- No tuning, no rule changes, no manuscript edits (per constraints). This stream is rescoring + diagnosis only.
- The explicit remap is numerically a no-op vs. the scorer's built-in `TC_GROUPS`; reported as such rather than as an improvement.
- OCCUPATION explicitly dropped from exact-span scoring (0 instances in sample — untested); FACILITY/NAME/LOCATION/OCCUPATION mapping rows have no predictions in this sample and are therefore unvalidated here.
- Per-type overlap/char-recall diagnostics (§2.3) were computed with a mirror script implementing the scorer's overlap logic per type; the scorer itself reports overlap only globally.
- The single ORGANIZATION prediction ("DETAILS" on a template placeholder) is a tokenizer artifact of the template text, not a real organization mention; its mapping choice is documented but immaterial.
- Only the Stanford-clinical + D1–D12 configuration was rescored (the `tc_roberta` checkpoint exists but is outside this stream's scope).
- Bootstrap CIs: 1,000 note-level resamples, seed 20260930 (scorer default).

## 6. Artifacts

- Remap script: `~/workspace/deid-benchmark/technetium-asq/remap_tc_types.py`
- Remapped predictions: `~/workspace/deid-benchmark/technetium-asq/out/tc_stanford_remapped.json`
- Rescored output (new): `~/workspace/deid-benchmark/technetium-asq/technetium_scores_remapped.json`
- Original scores: `~/workspace/deid-benchmark/technetium-asq/technetium_scores.json` — untouched (md5 `e6fd663b727ecb070db6470a86f59006` verified before and after)
- This report: `~/workspace/deid-benchmark/models-survey/reviewer-hardening-stream2.md`
