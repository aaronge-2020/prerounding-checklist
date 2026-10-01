# Fair Evaluation Framework: Browser-Local vs. Non-Browser SOTA Clinical De-identification

**Status:** Protocol — pre-registered before any SOTA model is run.
**Date:** 2026-09-30
**Purpose:** Define, in advance, how browser-deployable de-identification systems will be compared against non-browser state-of-the-art models so that every comparison is defensible to reviewers and no result can be shaped by post-hoc choices.

> **Governing rule:** All metrics, label mappings, model configurations, and statistical tests below are fixed *before* any SOTA model is executed. Running a model and then choosing the analysis that flatters our system is prohibited by this protocol.

---

## 1. Evaluation datasets

| Dataset | Notes | Role |
|---|---|---|
| MedDeID 300-note synthetic benchmark (Hellemans et al., arXiv:2609.10049) | 300 | **Primary evaluation corpus.** Every model — browser and non-browser — is scored on all 300 notes with the identical scorer. |
| MedDeID 200-note development subset | 200 | Our rule layer (D1–D12) was developed here. Scores on these notes are *development-contaminated* for our system. |
| MedDeID 100-note frozen held-out subset | 100 | **Primary head-to-head comparison set.** Unseen by both sides: our rules were frozen before their single evaluations here, and no SOTA model was developed on any of it. Our system's numbers here are already recorded and frozen (D1–D6: 0.802; D1–D12: 0.872 — see §8). Every SOTA model MUST be scored on these same 100 notes; the paired comparison on this set is the primary result. |
| i2b2/UTHealth 2014 corpus | — | **Future work.** Access request submitted 2026-09-29 via DBMI portal (registration currently closed). Not part of this protocol until access is obtained. |

**Why MedDeID-300 as primary:** it is the only corpus where (a) we hold gold annotations, (b) no browser-system component was trained on the test notes beyond the disclosed dev-200 tuning, and (c) i2b2-trained SOTA models face a genuine out-of-distribution generalization test.

---

## 2. Model inventory and training-distribution disclosure

Every evaluated model gets a disclosure row. A comparison without this table is not publishable under this protocol.

| Model | Class | Training distribution | Overlap with MedDeID-300 | Interpretation of its score |
|---|---|---|---|---|
| Stanford NER + general rules (browser base) | Browser base | General-domain NER (CoNLL) | None | Clean baseline |
| ClinicalE5 / OpenMed Small / RoBERTa i2b2 (browser bases) | Browser base | Various (general / clinical) | None for E5 & OpenMed; RoBERTa trained on i2b2 2014 | Baselines; RoBERTa partially distribution-shifted |
| Stanford + D1–D12 rules (browser full system) | Browser full system | Base as above **+ rules tuned on MedDeID dev-200** | **Partial — dev-200 of 300** | 300-note score is optimistic; **100-note held-out (0.872) is the unbiased estimate** |
| StanfordAIMI deidentifier (Chambon et al., JAMIA 2022) | Non-browser SOTA | i2b2 2014 (+ radiology reports) | None | Out-of-distribution generalization test; published 98.9 F1 will *not* replicate — that is expected and must be stated, not hidden |
| riggsmed deid-LONGFORMER-NemPII | Non-browser SOTA | Vendor's synthetic Nemotron data | None | OOD test; vendor's 97.7% claim is in-distribution only |
| obi/deid_bert_i2b2 | Non-browser SOTA | i2b2 2014 | None | OOD test |
| MedDeID authors' model | Benchmark authors' model | MedDeID distribution | **Full — in-distribution** | Upper bound, not generalizable SOTA. Must be labeled as such in every table and figure. |
| OBI RoBERTa i2b2, GLiNER multi-PII | Prior comparators | i2b2 2014 / general PII | None | Already run; retained for continuity, not presented as SOTA |

**Key principle:** distribution overlap is *disclosed per model*, never averaged away. A reader must be able to see, for each number, whether the model had seen the distribution before.

---

## 3. System configurations under test

For each **browser base model**, two configurations on the identical 300 notes (isolates the rule layer's contribution — the paper's core claim):

1. **Base alone** (neural model + general-domain rules only)
2. **Base + D1–D12 rule layer** (the deployed system)

For each **non-browser SOTA model**, one configuration:

3. **Model alone, as published** (no added rules)

**Excluded from the primary comparison:** applying our D1–D12 rules on top of SOTA models. That measures a hybrid that exists nowhere in deployment and confounds the "browser system vs. SOTA system" question. It may appear *only* as a clearly labeled secondary analysis if a reviewer requests it.

**Already have:** Stanford 0.598 → 0.842, ClinicalE5 0.530 → 0.783, OpenMed 0.558 → 0.823 (all D1–D7, 300-note, same-sample). **Still needed:** D1–D12 versions for ClinicalE5/OpenMed on 300 notes; RoBERTa i2b2 with/without (harness fix pending).

---

## 4. Metrics (pre-registered)

**Primary metric:** exact-span micro-F1 — a true positive requires identical character offsets **and** identical PHI type. This is the strict, reviewer-expected metric.

**Secondary metrics:**
- Character-level label-agnostic recall: what fraction of gold PHI *characters* are covered by any prediction, regardless of type. Measures coverage; immunizes against label-mapping artifacts.
- Precision / recall decomposition of the primary F1.
- Per-PHI-type P/R/F1 for all 15 types (diagnostic; reveals *where* each system wins/loses).

**Deployment-relevant metrics** (reported alongside, not ranked):
- Model size on disk (browser models are quantized; SOTA are full-precision — disclose the asymmetry).
- Inference latency per note: browser (on-device, this machine) vs. non-browser (local CPU, same machine). Same hardware, or the latency comparison is void.

**Not permitted as primary:** any metric chosen after seeing scores; token-level F1 presented without the exact-span number beside it.

---

## 5. Label-mapping protocol

No public SOTA checkpoint covers our 15-type PHI schema (PATIENT NAME, PROVIDER NAME, FACILITY, ID, MRN, DATE, DOB, AGE, PHONE, EMAIL, ADDRESS, LOCATION, ORGANIZATION, OCCUPATION, NAME). Mappings are therefore unavoidable — and therefore pre-registered:

1. **Before any run**, write the native-label → PHI-schema mapping for each model to `models-survey/label-mappings/<model>.json`, with a one-line justification per mapping.
2. **Unmappable gold types** (e.g., a model with no ADDRESS label): count as misses. This is a real capability gap against the task definition, not a mapping artifact — but the per-type table must make the *cause* visible (type missing from model vs. model failed to detect).
3. **Unmappable predictions** (model emits a type with no PHI counterpart): count as false positives, and list them in an appendix table so reviewers can audit.
4. **Dual reporting:** every model gets both the mapped exact-span F1 *and* the mapping-immune character recall. If the two disagree sharply, the text must explain why (as was done for GLiNER/MedDeID in `sota-nonbrowser.md`).

---

## 6. Statistical protocol

- **Uncertainty:** bootstrap 95% CIs for every reported metric — 10,000 note-level resamples, fixed seed, documented in Methods.
- **Head-to-head tests:** models are scored on the *same* notes, so comparisons are **paired**. Report ΔF1 (ours − SOTA) with a paired-bootstrap CI, not just two overlapping intervals.
- **Multiple comparisons:** when testing our system against *k* SOTA models, apply Holm–Bonferroni correction to the paired tests. Pre-register *k*.
- **Pre-registered primary comparison:** full browser system (Stanford + D1–D12, frozen held-out F1 0.872) vs. each non-browser SOTA model scored on the **same 100-note held-out set**, paired ΔF1 with bootstrap CIs, Holm–Bonferroni corrected across the SOTA comparisons. The 300-note corpus provides secondary context (with/without matrix, per-type breakdowns) but is *not* the primary head-to-head, because our rule layer was tuned on 200 of those notes.
- **No peeking:** the 100-note held-out stays frozen. SOTA models may be scored on it, but those numbers are descriptive (n=100, wide CIs), never used for model selection.

---

## 7. Fairness asymmetries — disclosed, not hidden

These are stated in the manuscript's Methods/Discussion, not buried:

1. **Our 300-note scores are optimistic.** Rules were tuned on dev-200. The unbiased estimate is the frozen held-out 0.872. Both numbers appear; the held-out is the headline.
2. **SOTA's published 0.96–0.99 F1s will not replicate on MedDeID-300.** Those are in-distribution i2b2 numbers. Our test is an out-of-distribution generalization test for them — legitimate and interesting, but it must be framed as such, never as "SOTA only gets 0.X."
3. **MedDeID's 0.890 is in-distribution.** It is an upper bound from the benchmark authors on their own data. Label it in every table/figure.
4. **Compute asymmetry.** Browser models are ~100–500 MB quantized ONNX; SOTA models are 1+ GB full precision. Our claim is "browser-local approaches SOTA accuracy at a fraction of the footprint" — the footprint half must be measured, not asserted.
5. **Sample-size honesty.** Never place our 100-note held-out number beside a SOTA 300-note number without labeling the samples.

---

## 8. Reproducibility requirements

For every model run, archive: exact checkpoint ID (HF repo + revision hash), library versions (`transformers`, `torch`, scorer), random seeds, run date, hardware, per-note predictions JSON, and latency logs. Predictions live under `models-survey/out/`; the scorer is pinned. A reviewer must be able to reproduce every table from archived artifacts.

---

## 9. Reporting checklist (for the manuscript)

- [ ] Table: model inventory with training-distribution disclosure (§2)
- [ ] Table: with/without rule layer for every browser base, same 300 notes (§3)
- [ ] Table: primary comparison — exact-span F1 with paired ΔF1 CIs, Holm-corrected (§4, §6)
- [ ] Figure/table: per-type breakdown showing *where* each system wins (§4)
- [ ] Character-recall column beside every exact-span F1 (§4, §5)
- [ ] Latency + model-size comparison (§4)
- [ ] Explicit statements of asymmetries §7 in Methods or Discussion
- [ ] No AI-use statement (per author instruction)
- [ ] No "only"/"first" claims; no clinical-validity inference from synthetic data

---

## 10. Explicit prohibitions

1. No additional held-out evaluations **of our system for development purposes** — the two recorded evaluations (0.802, 0.872) stand, and no tuning or model selection may be driven by held-out scores. (Scoring SOTA models or frozen pre-registered ablations on the held-out set is *required* — see §1, §6 — not prohibited.)
2. No metric, mapping, or comparison chosen after observing SOTA scores.
3. No presenting in-distribution numbers (MedDeID's 0.890, SOTA's published i2b2 scores) as if they were measured on our corpus.
4. No exact-span F1 reported without its character-recall companion when label mappings were lossy.
5. No claim that a SOTA model "fails" on clinical text when the failure is a label-schema mismatch — the per-type table must distinguish the two.

---

*This protocol governs all future SOTA runs for the JAMIA Open manuscript. Amendments require a dated entry below with rationale — never silent edits after results are known.*

## Amendments
- 2026-09-30: Initial protocol. No SOTA models run under it yet.
- 2026-09-30 (user correction): PRIMARY head-to-head comparison moved from the 300-note corpus to the 100-note frozen held-out set. Rationale: without a held-out evaluation the comparison is not scientifically defensible — the held-out 100 is unseen by both sides (our rules were frozen before their single evaluations there; no SOTA model was developed on any of it), so it is the only sample where neither side holds a distribution advantage. Consequences: (a) each SOTA model is scored on the identical 100 held-out note IDs; primary table = our full system (Stanford + D1–D12, held-out F1 0.872, already recorded — NOT re-run) vs. each SOTA model on those 100 notes, paired ΔF1 bootstrap CIs, Holm–Bonferroni corrected; (b) 300-note scores become secondary/context; (c) pairing uses archived our-system predictions (meddeid/out/stanford_trackd_test2.json), never new held-out predictions from our system; (d) "no more held-out evaluations" applies ONLY to our system's development (no tuning/selecting on held-out scores) — scoring SOTA models and the pre-registered frozen ClinicalE5/OpenMed ablations on held-out data is required, not prohibited.
- 2026-09-30 (user correction): Primary head-to-head moved from the 300-note corpus to the 100-note frozen held-out set. Rationale: without a held-out evaluation the comparison is not scientifically defensible — the held-out 100 is the only sample unseen by both our frozen system and every SOTA model. "No more held-out evaluations" clarified to mean no further held-out-driven development of our system; scoring SOTA models there is required. Our system's held-out numbers (0.802, 0.872) remain frozen; per-note predictions reused from archive for pairing, never regenerated.
- 2026-10-01 (run completion): All three SOTA models scored on the identical 100 held-out IDs. Results: ours 0.8718 [0.8442, 0.8977] vs StanfordAIMI 0.5065 (Δ+0.3653 [0.3156, 0.4156]), Longformer-NemPII 0.3723 (Δ+0.4995 [0.4616, 0.5382]), OBI-BERT 0.1119 (Δ+0.7598 [0.7286, 0.7901]); all p<0.0001 Holm–Bonferroni (k=3). ClinicalE5+D1–D12 and OpenMed+D1–D12 ablations completed on 300 notes and held-out 100. RoBERTa i2b2 browser D1–D12 incomplete (50/300, harness instability — documented in sota-full-eval.md §8). Full report: models-survey/sota-full-eval.md.
