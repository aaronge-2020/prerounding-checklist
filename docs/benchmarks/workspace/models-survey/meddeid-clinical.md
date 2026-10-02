# MedDeID Clinical Benchmark — Results

**Dataset:** `stighellemans/meddeid-english-synthetic-benchmark` (300 human-validated synthetic English clinical notes)
**License:** CC BY 4.0 (verified from dataset card — permits benchmarking with attribution)
**Paper:** Hellemans et al., arXiv:2609.10049 (Sept 2026)
**Zenodo:** DOI 10.5281/zenodo.22689857 (v3)
**Date run:** 2026-09-30
**Gold:** 1,717 spans across 300 notes (150 en-GB / 150 en-US)

## Label mapping

Their 14 canonical labels mapped to our 22-type PHI schema. Full table with justifications in [LABEL_MAPPING.md](../meddeid/LABEL_MAPPING.md). Key splits:
- `Age_Birthdate` → DOB (birth_date slots) / AGE (age expressions like "43 y/o")
- `Contactdetails` → EMAIL / PHONE (by source_slot)
- `ID:Patient` → MRN (mrn slots) / ID (accession + national IDs)
- `Name:Caregiver` → PROVIDER NAME | `Name:Other` → NAME
- `Organization:Healthcare` → FACILITY | `Organization:Other` → ORGANIZATION

## Metric 1: Exact-span P/R/F1 (our primary scorer)

Strict (begin, end, type) match. Bootstrap 95% CIs (10k resamples, note-level).

| Model | Layer | P | R | F1 | F1 95% CI | Latency (mean) |
|---|---|---|---|---|---|---|
| ClinicalE5-33M | base | 0.4184 | 0.5125 | 0.4607 | [0.4377, 0.4844] | 1010ms |
| ClinicalE5-33M | +Track B | 0.4184 | 0.5125 | 0.4607 | [0.4377, 0.4844] | 1015ms |
| ClinicalE5-33M | +Track B+C | 0.4198 | 0.5154 | **0.4627** | [0.4397, 0.4862] | 997ms |
| Stanford | base | 0.4985 | 0.5743 | **0.5337** | [0.5113, 0.5560] | 2475ms |
| Stanford | +Track B | 0.4954 | 0.5708 | 0.5304 | [0.5079, 0.5532] | 2298ms |
| Stanford | +Track B+C | 0.4955 | 0.5719 | 0.5310 | [0.5084, 0.5537] | 1891ms |
| OpenMed Small | base | 0.4668 | 0.5044 | 0.4849 | [0.4606, 0.5096] | 1752ms |
| OpenMed Small | +Track B+C | 0.4724 | 0.5137 | **0.4922** | [0.4681, 0.5165] | 1277ms |
| RoBERTa i2b2 | base | 0.4858 | 0.5661 | 0.5229 | [0.5001, 0.5459] | 7450ms |
| RoBERTa i2b2 | +Track B+C | 0.4946 | 0.5614 | **0.5259** | [0.5031, 0.5489] | 7403ms |

## Metric 2: Character-level label-agnostic recall (their metric)

Fraction of gold-annotated characters covered by any predicted span (label ignored). Directly comparable to their published table.

| Model | Layer | Char recall | 95% CI |
|---|---|---|---|
| ClinicalE5-33M | +Track B+C | 0.8494 | [0.8320, 0.8658] |
| Stanford | +Track B+C | **0.8864** | [0.8720, 0.8998] |
| OpenMed Small | +Track B+C | 0.8261 | [0.8073, 0.8436] |
| RoBERTa i2b2 | base | **0.8830** | [0.8689, 0.8966] |
| RoBERTa i2b2 | +Track B+C | 0.8616 | [0.8457, 0.8769] |

### Against their published comparators

| System | Char recall | Source |
|---|---|---|
| meddeid-english-synth (their model) | **99.96%** | Hellemans et al. |
| GLiNER | 90.27% | Hellemans et al. |
| **Stanford + Track B+C (ours)** | **88.64%** | this run |
| **RoBERTa i2b2 base (ours)** | **88.30%** | this run |
| OBI RoBERTa i2b2 | 86.64% | Hellemans et al. |
| ClinicalE5 + Track B+C (ours) | 84.94% | this run |
| OpenMed Small + Track B+C (ours) | 82.61% | this run |

We beat their reported OBI RoBERTa number (88.30% vs 86.64%) but trail GLiNER (90.27%) and are far from their in-domain model (99.96%, expected — it was trained on this distribution).

## Where the ranking flips

On our synthetic general-domain benchmark, the order was:
**ClinicalE5 (0.7583) > Stanford > OpenMed > RoBERTa**

On MedDeID clinical text, the order is:
**Stanford (0.5337) > RoBERTa (0.5229) > OpenMed (0.4849) > ClinicalE5 (0.4607)**

ClinicalE5 goes from first to last. This is the most important finding.

### Why ClinicalE5 collapses on clinical text

Per-type F1 (ClinicalE5 +Track B+C vs Stanford +Track B+C):

| Type | Gold n | ClinicalE5 F1 | Stanford F1 |
|---|---|---|---|
| PROVIDER NAME | 186 | **0.074** (9 TP, 177 FN) | 0.436 |
| OCCUPATION | 39 | **0.279** (189 FP) | **0.937** (3 FP) |
| PATIENT NAME | 340 | 0.820 | 0.835 |
| FACILITY | 141 | 0.135 | 0.347 |
| ID | 243 | 0.380 | 0.409 |

Two catastrophic failures:
1. **Provider names:** ClinicalE5 finds 9 of 186 caregiver names. Clinical notes are dense with clinician names ("Dr. Smith", "seen by Nurse Jones") — missing these is fatal.
2. **Occupation over-prediction:** 189 false positives (vs 3 for Stanford). ClinicalE5 fires on every job-like word in clinical prose.

Stanford is not brilliant at clinical text either (0.53 F1), but it is balanced — no single type collapses.

### Track B/C layers add almost nothing on clinical text

| Model | base → +B+C ΔF1 |
|---|---|
| ClinicalE5 | +0.0020 |
| Stanford | −0.0027 |
| OpenMed Small | +0.0073 |
| RoBERTa | +0.0030 |

The Track B/C rules were tuned on synthetic general-domain patterns (labeled names, JSON blocks, numbered labels). Clinical notes don't contain those patterns, so the rules fire rarely. This is expected, not a failure — but it means our +0.08 F1 gain on synthetic data does **not** transfer to clinical text.

## Regressions (flagged explicitly)

1. **RoBERTa +Track B+C character recall: 0.8830 → 0.8616 (−0.021).** The 95% CIs ([0.8689, 0.8966] vs [0.8457, 0.8769]) barely overlap — this is a real regression, not noise. Likely cause: the Track B clinical stoplist (B4) suppressing valid predicted spans. The exact-span F1 does not regress (+0.003), so the stoplist is removing characters from partially-correct spans rather than eliminating true positives outright.

2. **Stanford +Track B F1: 0.5337 → 0.5304 (−0.003).** CIs overlap substantially — this is noise, not a real regression.

## Systematic gaps (all models, all layers)

These are pipeline gaps, not model-specific:

| Gap | Impact |
|---|---|
| **AGE: 0/100 detected by any model** | The B3 age detector never fires on clinical age expressions ("43 y/o", "18-year-old", "aged 43"). Complete blind spot. |
| **ID: ~179/243 missed** | UK-style identifiers (NHS numbers "000 327 0743", MRNs with slashes "018703/98") are not caught by any layer. |
| **PHONE: ~168 FP, 0 FN** | All models over-predict phone numbers (fax numbers, extensions, numeric fragments). |
| **FACILITY vs ORGANIZATION** | Models emit ORGANIZATION where gold says FACILITY — a type-mapping gap in our pipeline. |

The AGE gap is the most actionable: 100 gold spans, zero detections, and we shipped a "B3 age detector" that does nothing on this data.

## Honest discussion

**What holds:** Our pipeline is competitive with published clinical de-id systems on character recall (88.6% vs 86.6% for their RoBERTa baseline). The exact-span metric is harsh — it penalizes type mismatches (FACILITY/ORGANIZATION) and boundary differences that character recall forgives.

**What flips:** ClinicalE5, our shipping default, is the worst of the four on clinical text. The 0.76 F1 on synthetic general-domain data does not predict clinical performance. If clinical notes are the deployment target, Stanford is currently the better default — or ClinicalE5 needs targeted work on provider names and occupation precision.

**What this doesn't prove:** This is still synthetic data (human-validated, but synthetic). The n2c2/i2b2 clinical corpus remains the fair trial for RoBERTa and for any clinical-performance claim. These results are supplementary, not a clinical validation.

**Defensible wording:** Best among the tested browser-runnable configurations on this fixed synthetic clinical benchmark. Do not claim clinical SOTA. Do not claim the pipeline is validated for real clinical text.

## Reproducibility

- Notes: `~/workspace/deid-benchmark/meddeid/notes.jsonl`
- Gold: `~/workspace/deid-benchmark/meddeid/gold.json`
- Raw outputs: `~/workspace/deid-benchmark/meddeid/out/<model>_<layer>.json`
- Scorer: `~/workspace/deid-benchmark/meddeid/score.py`
- Scores: `~/workspace/deid-benchmark/meddeid/scores.json`
- Label mapping: `~/workspace/deid-benchmark/meddeid/LABEL_MAPPING.md`
- Dataset provenance: `~/workspace/deid-benchmark/meddeid/DATASET.md`
