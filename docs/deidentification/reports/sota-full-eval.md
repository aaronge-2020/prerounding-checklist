# SOTA Full Evaluation — Complete Results

**Date:** 2026-09-30 / 2026-10-01 (runs completed ~01:00 EDT Oct 1)
**Protocol:** `~/workspace/deid-benchmark/evaluation-framework.md` (with 2026-09-30 amendment: primary head-to-head on the 100-note frozen held-out set)
**Status:** All pre-registered evaluations complete. Our-system held-out numbers NOT re-run (frozen: 0.802 / 0.872).

---

## 1. Headline

On the **frozen 100-note held-out set** (unseen by both sides), our full system (Stanford clinical + D1–D12 rules) achieves **exact-span F1 0.872** [0.844, 0.898]. All three real-SOTA models score dramatically lower, and all paired differences are significant after Holm–Bonferroni (k=3):

| Model | Held-out exact F1 | 95% CI | Char recall | Paired ΔF1 vs ours | 95% CI | p (Holm) |
|---|---|---|---|---|---|---|
| **Ours (Stanford+D1–D12)** | **0.8718** | [0.8442, 0.8977] | 0.9532 | — | — | — |
| StanfordAIMI (JAMIA 2022, 98.9 i2b2) | 0.5065 | [0.4609, 0.5514] | 0.8764 | **+0.3653** | [0.3156, 0.4156] | <0.0001 * |
| Longformer-NemPII | 0.3723 | [0.3408, 0.4038] | 0.7247 | **+0.4995** | [0.4616, 0.5382] | <0.0001 * |
| OBI-BERT i2b2 | 0.1119 | [0.0902, 0.1345] | 0.7049 | **+0.7598** | [0.7286, 0.7901] | <0.0001 * |

*Paired bootstrap, 10k resamples, seed 20260930, identical resamples for both sides. Holm–Bonferroni across k=3.*

**In-distribution reference (descriptive only, outside confirmatory correction):** MedDeID authors' model scores 0.8911 [0.8695, 0.9120] on held-out — slightly above ours, as expected for a model trained on this synthetic distribution. It is the in-distribution upper bound, not a fair comparator.

---

## 2. Model inventory + distribution disclosure

| Model | Checkpoint | Params / size on disk | Training distribution | Test distribution here |
|---|---|---|---|---|
| StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2 | HF, pytorch_model.bin | ~110M / 418 MB | i2b2 2014 + radiology reports (US) | MedDeID synthetic (UK/US) — **OOD** |
| riggsmed/deid-LONGFORMER-NemPII | HF, model.safetensors | ~148M / 570 MB | n2c2/i2b2-style (US) | MedDeID synthetic — **OOD** |
| obi/deid_bert_i2b2 | HF, pytorch_model.bin | ~110M / 412 MB | i2b2 2014 (US) | MedDeID synthetic — **OOD** |
| Ours: Stanford clinical + D1–D12 | browser ONNX int8 + rules | ~110M / ~110 MB (q) | rules written against 200-note dev split | 100-note held-out — **unseen** |
| MedDeID authors' model | HF stighellemans | — | MedDeID synthetic train | MedDeID synthetic — **in-distribution** |

All three SOTA models' published 0.96–0.99 i2b2 scores are in-distribution; this evaluation is an **out-of-distribution generalization test** for them, exactly as pre-registered in the framework.

**Label mappings** (pre-registered 2026-09-30, `models-survey/label-mappings/`, unchanged):
- StanfordAIMI: 7 native labels → PATIENT NAME, PROVIDER NAME, FACILITY, ORGANIZATION, DATE, ID, PHONE. Unmappable gold types (MRN, DOB, AGE, EMAIL, ADDRESS, LOCATION, OCCUPATION, NAME): 8 types, model cannot score on them.
- OBI-BERT: 10 native labels → PATIENT NAME, PROVIDER NAME, FACILITY, ORGANIZATION, LOCATION, AGE, DATE, EMAIL, ID, PHONE. OTHERPHI dropped (pre-registered as conservative toward SOTA).
- Longformer-NemPII: 25 native labels; FIRST_NAME/LAST_NAME → PATIENT NAME (no patient/provider distinction — largest exact-span handicap, documented); MEDICAL_RECORD_NUMBER→MRN; DATE_OF_BIRTH→DOB; DATE_TIME→DATE; TIME dropped; STREET_ADDRESS/POSTCODE→ADDRESS; CITY/STATE/COUNTRY→LOCATION. Unmappable: PROVIDER NAME, FACILITY, ORGANIZATION, OCCUPATION, NAME.

---

## 3. With/without rule layer (§3) — browser base models, identical 300 notes

| Base | Without rules (base only) | With D1–D7 | With D1–D12 | D12 − base Δ |
|---|---|---|---|---|
| Stanford clinical | 0.598 | 0.842 | — (0.872 on held-out) | — |
| ClinicalE5 | 0.530 | 0.783 | **0.8249** [0.8065, 0.8424] | **+0.295** |
| OpenMed Small | 0.558 | 0.823 | **0.8707** [0.8533, 0.8873] | **+0.313** |
| RoBERTa i2b2 (q8) | 0.5229 | — | **not completed** (see §8) | — |

(Base-only and D1–D7 numbers are the previously recorded 300-note evaluations; D1–D12 runs completed 2026-09-30. OpenMed+D1–D12 at 0.871 essentially matches our Stanford-based system on the 300-note set. ClinicalE5+D1–D12 gained +0.042 over its D1–D7 version; OpenMed+D1–D12 gained +0.048.)

Held-out 100 with/without context: ClinicalE5+D1–D12 0.7993 [0.7670, 0.8308]; OpenMed+D1–D12 0.8491 [0.8197, 0.8772].

---

## 4. Full 300-note results (secondary per amendment)

| Model | Exact F1 | 95% CI | P | R | Char recall |
|---|---|---|---|---|---|
| ClinicalE5 + D1–D12 | 0.8249 | [0.8065, 0.8424] | 0.7758 | 0.8806 | 0.9580 |
| OpenMed + D1–D12 | 0.8707 | [0.8533, 0.8873] | 0.8628 | 0.8789 | 0.9447 |
| StanfordAIMI | 0.5032 | [0.4766, 0.5303] | 0.4500 | 0.5708 | 0.8871 |
| Longformer-NemPII | 0.3891 | [0.3708, 0.4077] | 0.3717 | 0.4083 | 0.7148 |
| OBI-BERT | 0.1232 | [0.1097, 0.1375] | 0.0953 | 0.1741 | 0.7096 |

---

## 5. Per-type breakdown (held-out 100)

**StanfordAIMI** — strong where its label set covers the gold: DATE 0.824, ID 0.654, PATIENT NAME 0.669, PROVIDER NAME 0.619. Zero on all 8 unmappable types (ADDRESS, AGE, DOB, EMAIL, LOCATION, MRN, NAME, OCCUPATION). Weak: PHONE 0.286, FACILITY 0.343 (high FPs: 25 and 124).

**Longformer-NemPII** — perfect EMAIL 1.000 and near-perfect PHONE 0.952; good DATE 0.785, MRN 0.478. Zero on unmappable FACILITY/NAME/OCCUPATION/ORGANIZATION/PROVIDER NAME. Weak: ID 0.302, PATIENT NAME 0.521 (149 FPs — first/last-name merging over-fires).

**OBI-BERT** — weak everywhere: best PATIENT NAME 0.251, FACILITY 0.214, DATE 0.207. Massive false positives (ID: 172 FP; PATIENT NAME: 160 FP; PROVIDER NAME: 183 FP). Subword-level BILOU predictions fragment and mislabel on this distribution (e.g. "M. GALLAGHER" → 'M' [PATIENT], '.' [STAFF], 'GALLAGH' [PATIENT], 'ER' [O]).

**Ours** — balanced across all 15 types (see track-d-report.md); no unmappable types by construction.

---

## 6. Latency + size (same hardware: 2-core x86_64 CPU)

| Model | Size on disk | Mean/note | Median | p95 |
|---|---|---|---|---|
| StanfordAIMI (Python/torch CPU) | 418 MB | 4243 ms | 3427 ms | 9119 ms |
| Longformer-NemPII (Python/torch CPU) | 570 MB | 7431 ms | 6798 ms | 11782 ms |
| OBI-BERT (Python/torch CPU) | 412 MB | 5127 ms | 4859 ms | 8652 ms |
| ClinicalE5 + D1–D12 (browser) | — | 1511 ms | 1143 ms | 3627 ms |
| OpenMed + D1–D12 (browser) | — | 2327 ms | 2054 ms | 4382 ms |

Our browser pipeline is 2–5× faster per note than the SOTA models on CPU, at comparable or better accuracy.

---

## 7. Key findings

1. **Our system beats all three real-SOTA models on the frozen held-out set by large, significant margins** (+0.37 to +0.76 F1, all p<0.0001 Holm). This is the pre-registered primary comparison.
2. **The SOTA models' published 0.96–0.99 i2b2 scores do not transfer** to the MedDeID synthetic distribution (UK/US synthetic notes). This is an OOD generalization failure, not a measurement artifact: character recall (mapping-immune) is also well below ours for all three (0.70–0.88 vs 0.95).
3. **The rule layer is the difference-maker, and it transfers across base models.** OpenMed + D1–D12 reaches 0.871 on 300 notes — essentially our system's level — and ClinicalE5 + D1–D12 reaches 0.825. The D8–D12 rules added +0.04–0.05 over D1–D7 for both.
4. **MedDeID's own model (in-distribution) scores 0.891 on held-out**, confirming the benchmark is solvable near 0.89 and that our 0.872 is close to the in-distribution ceiling.
5. **Exact-span is much stricter than character recall for these models.** OBI-BERT: 0.11 exact F1 vs 0.70 char recall. The gap reflects boundary fragmentation and type errors under distribution shift.

---

## 8. Deviations, bugs, and failed models (documented, not fixed-and-rerun)

1. **StanfordAIMI decoder bug (found, fixed, re-run — measurement instrument, not model tuning).** The first run scored F1 0.104 because the model emits one label per token (no BIO prefixes) and the decoder only merged exactly-adjacent spans: "M. GALLAGHER" was split into "M." + "GALLAGHER" across the space. Fixed the decoder to merge same-type spans separated only by whitespace (standard interpretation of single-label-per-token output); pre-registered label mapping unchanged. Buggy run preserved as `out/sota3_stanzaimi_v1_fragmented.json`. Valid run: F1 0.503.
2. **RoBERTa i2b2 browser (q8) with D1–D12: INCOMPLETE.** The harness loaded the model but processed notes at ~30–60s/note with repeated browser crashes ("Target page, context or browser has been closed", auto-relaunch). Reached 50/300 notes before the run was stopped to free CPU for the pre-registered SOTA models (per instruction not to burn hours on it). Partial checkpoint: `meddeid/out/checkpoints/roberta_d12.jsonl` (50 notes). Not scored.
3. **Network workaround.** Sandbox egress proxy breaks huggingface_hub URL parsing; models were downloaded via curl to `~/sota_models/` and loaded with `local_files_only=True`. No model code or weights modified.
4. **No our-system held-out re-runs.** Our 0.872 comes from the archived `meddeid/out/stanford_trackd_test2.json` (verified to reproduce F1 0.8718 / P 0.8657 / R 0.8778 / CI [0.8442, 0.8977]).

---

## 9. Framework §9 checklist

- [x] All metrics, mappings, configs, tests pre-registered before any SOTA inference (label-mappings/ dated 2026-09-30; evaluation-framework.md amended same day).
- [x] Primary metric: exact-span micro-F1; companion: character-level label-agnostic recall.
- [x] Bootstrap 95% CIs: 10k note-level resamples, seed 42 (score_eval.py).
- [x] Paired ΔF1 with paired-bootstrap CIs; Holm–Bonferroni across k=3 SOTA comparisons (paired_delta.py, seed 20260930).
- [x] Per-PHI-type P/R/F1 (§5).
- [x] With/without rule layer for every browser base on identical 300 notes (§3; RoBERTa incomplete — documented).
- [x] Training-distribution disclosure per model (§2); MedDeID labeled in-distribution upper bound everywhere.
- [x] Latency + model size on same hardware (§6).
- [x] Held-out frozen: our-system predictions reused from archive; no new held-out evaluations of our system.
- [x] MedDeID model reported descriptively as in-distribution reference, outside confirmatory correction.
- [x] Checkpoint IDs, library versions (torch 2.14.1+cpu, transformers 5.18.0), seeds, dates, hardware recorded; per-note predictions + latency logs in `models-survey/out/`.

## Artifacts

- Predictions: `models-survey/out/sota3_{stanzaimi,longformer,obibert}.json` (+ `.latency.json`, `.meta.json`)
- Scores: `models-survey/out/eval_*.json` (300-note and heldout100 variants)
- Paired analysis: `models-survey/out/paired_sota_heldout100.json`
- Held-out IDs: `models-survey/heldout100.json`
- Runner/scorer: `models-survey/run_sota3.py`, `models-survey/score_eval.py`, `models-survey/paired_delta.py`
- Browser D1–D12: `meddeid/out/clinice5_d12.json`, `meddeid/out/openmed_d12.json`
- Cached models: `~/sota_models/`; venv: `~/sota-venv`

---

## 10. StanfordAIMI SOTA converted to browser ONNX (dev-200 only)

**Scope (2026-10-01):** Separate development-only evaluation — convert the JAMIA-2022 StanfordAIMI deidentifier (`stanford-deidentifier-with-radiology-reports-and-i2b2`) to a browser-ready quantized ONNX model and measure it through the *actual browser pipeline* (deid.js + ONNX Runtime Web, headless Chromium) on the **200-note dev set only**. No held-out notes touched. No tuning, no rule changes, frozen D1–D12. Nothing deployed. For context, §1 already reports this model's PyTorch-side held-out F1 (0.5065).

### 10.1 Conversion (reproducibility record)

- **Source checkpoint:** `StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2` (HuggingFace; local copy `~/sota_models/StanfordAIMI--stanford-deidentifier-with-radiology-reports-and-i2b2/`). `pytorch_model.bin` sha256: `51ab573bd08fc636021353559c4b26f9cc4af56846fe18445772e195b29bbb22`. MIT license.
- **Environment:** `~/sota-venv` — torch 2.14.1+cpu, transformers 5.18.0, tokenizers 0.23.2, onnx 1.23.1, onnxruntime 1.30.0, onnxscript 0.7.2, numpy 2.5.3. Seed 20260930. Date 2026-10-01.
- **Export:** `torch.onnx.export`, opset **18** (matches shipped `stanford-deidentifier-base-ONNX`: opset 18 / IR 8), dynamic batch+seq axes, inputs `input_ids`/`attention_mask`/`token_type_ids`, output `logits`. Note: torch 2.x dynamo exporter writes weights as external data (`model.onnx` 1.5 MB + `model.onnx.data` 435 MB); consolidated to single-file fp32 (416 MB) before quantization. Quantizer temp files redirected to `/home/hatch/tmp` (`/tmp` tmpfs too small — first attempt failed ENOSPC).
- **Quantization:** `onnxruntime.quantization.quantize_dynamic`, `QuantType.QInt8` — same producer as shipped q8 models (`onnx.quantize 0.1.0`). Single-file `model_quantized.onnx`, **105 MB** (shipped base: 106 MB).
- **Tokenizer:** `tokenizer.json` built from `vocab.txt` via `tokenizers` (WordPiece, BertPreTokenizer, `##` decoder, `[CLS] $A [SEP]` template) — mirrors shipped layout.
- **Harness location:** `meddeid/site-trackbc/models/StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2/` (`onnx/model_quantized.onnx`, `config.json`, `tokenizer.json`, `tokenizer_config.json`, `vocab.txt`, `special_tokens_map.json`). Selected via `?model=StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2&dtype=q8`; no registry changes (harness resolves model ID → `models/<id>/` directly). The app's `phiLabelMap` maps native labels → PATIENT NAME, PROVIDER NAME, FACILITY, ORGANIZATION, DATE, PHONE; bare `ID` falls through to type `"ID"` (matches gold ID type) — consistent with the pre-registered Python-side mapping.

### 10.2 Parity check: PyTorch vs quantized ONNX (20 dev notes)

| Check | Result |
|---|---|
| Token-level label agreement | **99.68%** |
| Span-level Jaccard (exact span + type) | 0.76 |
| Scored exact-span micro-F1 vs gold (20 notes) | PyTorch **0.5588** → ONNX-q8 **0.5673** (Δ = +0.0085) |

**Verdict: PASS with documented caveat.** The 0.76 span Jaccard is single-token boundary flips from quantization noise (e.g. `"A. SUTHERLAND"` → `"A"` + `". SUTHERLAND"`; `"peliah.burt"` → `"peliah.bur"`) — symmetric, canceling in scoring. The material test (F1 vs gold) differs by 0.0085, i.e. noise. Static quantization not pursued: token agreement is 99.68% and shipped q8 models use the same dynamic approach. (Methodology note: an early parity script mixed 3- and 4-tuples in span sets, artificially deflating agreement; fixed before scoring.)

### 10.3 Dev-200 results (browser pipeline, exact-span micro-F1)

| Config (dev-200, n=200) | F1 | 95% CI | P | R | Char recall | Latency mean |
|---|---|---|---|---|---|---|
| SOTA base alone (model + Track B/C) | 0.5626 | [0.5321, 0.5915] | 0.5597 | 0.5656 | 0.7897 | 4984 ms |
| SOTA base + D1–D12 | 0.8922 | [0.8713, 0.9119] | 0.8946 | 0.8899 | 0.9507 | 5003 ms |
| Current browser Stanford base alone | 0.5978 | [0.5680, 0.6261] | 0.5650 | 0.6346 | 0.9191 | 3005 ms |
| Current browser Stanford + D1–D12 | 0.9023 | [0.8805, 0.9223] | 0.8923 | 0.9126 | 0.9771 | 3088 ms |

Runs: `meddeid/out/stanzaimi_sota_base_dev.json` (`?trackd=off`), `meddeid/out/stanzaimi_sota_trackd_dev.json`; current-Stanford dev-200 runs `meddeid/out/stanford_base_dev200.json`, `meddeid/out/stanford_trackd_dev200.json` (fresh same-sample runs; 0.9023 reproduces the report's 0.902). CIs: bootstrap 1000 resamples, seed 20260930.

**Paired comparisons, same 200 notes (SOTA − current Stanford):**
- Base alone: ΔF1 = **−0.0352** [−0.0506, −0.0195], p < 0.0001
- +D1–D12: ΔF1 = **−0.0101** [−0.0198, −0.0005], p = 0.040

Per-type F1, SOTA base alone: PATIENT NAME 0.868, MRN 0.954, EMAIL 1.000, AGE 0.969, OCCUPATION 0.902, ADDRESS 0.633, DATE 0.530, DOB 0.649, ID 0.442, PHONE 0.312, ORGANIZATION 0.271, NAME 0.197, FACILITY 0.144, PROVIDER NAME 0.141, LOCATION 0.000, CONTACT NAME 0.000. With D1–D12: ADDRESS 0.958, AGE 0.969, DATE 0.804, DOB 1.000, EMAIL 1.000, FACILITY 0.957, ID 0.953, LOCATION 0.850, MRN 0.954, NAME 0.720, OCCUPATION 0.902, ORGANIZATION 0.788, PATIENT NAME 0.889, PHONE 0.769, PROVIDER NAME 0.850.

### 10.4 Verdict

**Do not swap.** On dev-200 the SOTA sibling underperforms the current browser Stanford both as a base (−0.036 F1, significant) and with the full rule stack (−0.010 F1, marginal). The 98.9 i2b2 number does not transfer to this distribution — consistent with §1's held-out result (0.5065). The converted model is also slower in-browser (5.0s vs 3.1s/note) at an identical footprint (105 vs 106 MB). The quantized model remains wired into the harness (`?model=StanfordAIMI/stanford-deidentifier-with-radiology-reports-and-i2b2`) if ever revisited; no production changes made.
