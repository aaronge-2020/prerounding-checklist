# On-device de-identification model comparison

Same 1,000-text sample (`data/sample.jsonl`, seed 42, ai4privacy/pii-masking-300k
English validation), same scorer (`harness/score.py`, strict exact-span P/R/F1),
all inference inside headless Chromium via onnxruntime-web (wasm, threaded).
Each candidate was dropped into the app's actual de-id pipeline
(`site/src/vault/deid.bundle.js`, byte-identical to the shipped code) with the
same dtype-q8 / local-first / aggregation-simple configuration as the default
model. Model-only = model + the app's standard output filtering, no structured
rules. Hybrid = full automated pipeline (model + structured safe-harbor rules,
temporal handling, identity expansion), review gate excluded.

Sizes are MiB of the served model directory (weights + tokenizer), measured
with `du -sb`.

## Head-to-head (exact-span P/R/F1; latency in headless Chromium on this machine)

| Model | Mode | P | R | F1 | Median ms/doc | p95 ms/doc | Load s | Size MiB | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Stanford deidentifier (app default) | hybrid | 0.670 | 0.448 | **0.537** | 647 | 1266 | 4.9 | 105.5 | Aaron's baseline, from `../results/results.json` (2026-09-29) |
| Stanford deidentifier (app default) | model-only | 0.500 | 0.247 | 0.330 | 697 | 1281 | 4.9 | 105.5 | baseline |
| rtrigoso/bert-small-pii-detection-ONNX | hybrid | 0.658 | 0.387 | 0.487 | 242 | 799 | 7.6 | 28.4 | app's fallback model; fastest of the set |
| rtrigoso/bert-small-pii-detection-ONNX | model-only | 0.552 | 0.159 | 0.247 | 259 | 740 | 7.6 | 28.4 | |
| onnx-community/deid_bert_i2b2-ONNX | hybrid | 0.652 | 0.294 | 0.405 | 1653 | 3960 | 10.9 | 104.3 | clinical-BERT option; crippled by BILOU bug (see below) |
| onnx-community/deid_bert_i2b2-ONNX | model-only | 0.059 | 0.008 | 0.014 | 2293 | 5815 | 10.9 | 104.3 | BILOU bug drops ~85% of detections |
| onnx-community/deid_bert_i2b2-ONNX + BILOU fix | hybrid | 0.634 | 0.403 | 0.493 | 1037 | 2743 | 10.9 | 104.3 | secondary analysis, fixed pipeline |
| onnx-community/multilang-pii-ner-ONNX | model-only | 0.303 | 0.170 | 0.218 | 1006 | 3378 | 28.3 | 282.1 | hybrid not run (model-only F1 < 0.40) |
| microsoft/Phi-3.5-mini-instruct (WebLLM) | — | — | — | — | — | — | — | ~2300 | **Could not run** — no WebGPU adapter in this environment |
| onnx-community/piiranha-v1-detect-personal-information-ONNX | — | — | — | — | — | — | ~103 | 318.1 | **Broken ONNX artifacts** — fail the model's own README example |

**Winners.** Model-only: Stanford deidentifier, F1 0.330 — ahead of
bert-small-pii by 0.083, multilang-pii-ner by 0.112, and deid_bert_i2b2 by
0.316. Hybrid: Stanford deidentifier, F1 **0.537** — ahead of bert-small-pii
(0.487) by **0.050**, deid_bert_i2b2 (0.405) by **0.132**, and deid_bert_i2b2
with the BILOU fix (0.493) by **0.044**. No candidate beats the baseline in
either mode. The rules layers roughly double every model's F1 on this
out-of-domain synthetic data, which is why the hybrid ranking mostly mirrors
the model-only ranking.

## Per-category exact-span F1

| Category | Gold spans | Stanford hyb / mo | bert-small hyb / mo | deid_bert_i2b2 hyb / mo | multilang mo |
|---|---|---|---|---|---|
| EMAIL | 320 | 0.914 / — | 0.891 / 0.000 | 0.914 / 0.000 | 0.262 |
| IP | 252 | 0.952 / — | 0.904 / 0.000 | 0.952 / 0.000 | 0.000 |
| PHONE | 263 | 0.422 / 0.019 | 0.420 / 0.031 | 0.429 / 0.000 | 0.136 |
| ID | 1217 | 0.520 / 0.487 | 0.416 / 0.333 | 0.275 / 0.031 | 0.000 |
| DATE | 231 | 0.431 / 0.309 | 0.401 / 0.278 | 0.434 / 0.000 | 0.236 |
| ADDRESS | 578 | 0.336 / — | 0.336 / 0.000 | 0.336 / 0.000 | 0.257 |
| NAME | 1117 | 0.056 / 0.043 | 0.045 / 0.026 | 0.038 / 0.016 | 0.038 |
| DOB | 273 | 0.060 / — | 0.060 / 0.000 | 0.060 / 0.000 | 0.000 |
| TIME | 443 | — / — | 0.000 / 0.000 | 0.000 / 0.000 | 0.144 |
| LOCATION | 934 | — / — | 0.275 / 0.266 | 0.000 / 0.000 | 0.359 |

("—" = model emitted no spans in that category; 0.000 = emitted but none
matched exactly. The rules dominate EMAIL/IP in hybrid for every model, as
designed. NAME is the weakest category for every model — the hospital-trained
and general PII models all struggle with the synthetic name distribution here.)

## The deid_bert_i2b2 BILOU finding

`obi/deid_bert_i2b2` uses **BILOU** label encoding (B-/I-/L-/U- prefixes), but
the app's pipeline was built for BIO models: `normalizePhiLabel` in
`site/src/vault/deid.js` strips only `^[BI]-`, and `modelPredictionsToEntities`
drops any entity whose normalized label is not in `SUPPORTED_PHI_LABELS`. Every
`L-`/`U-` prediction therefore normalizes to a label like "L PATIENT" or
"U DATE" and is silently discarded. On a spot check, the raw pipeline produced
20 entities for one document while the app pipeline kept 3 — roughly 85% of
the model's detections never reach scoring.

This is a pipeline bug, not a model defect: run directly, the model detects
names, dates, phones, staff, hospitals and IDs correctly on clinical-style
text. A one-line fix (strip `^[BIUL]-` instead of `^[BI]-`) recovers the
dropped detections:

| deid_bert_i2b2 | P | R | F1 |
|---|---|---|---|
| model-only, through shipped pipeline | 0.059 | 0.008 | **0.014** |
| model-only, with BILOU fix (secondary analysis) | 0.306 | 0.179 | **0.226** |
| hybrid, through shipped pipeline | 0.652 | 0.294 | **0.405** |
| hybrid, with BILOU fix (secondary analysis) | 0.634 | 0.403 | **0.493** |

The fix lifts model-only F1 15.7x (0.014 → 0.226) and hybrid F1 to 0.493 —
above bert-small-pii's hybrid (0.487) though still 0.044 below the Stanford
baseline (0.537). With the fix, obi's ID per-category F1 reaches 0.52, matching
Stanford. The remaining gap is the domain gap (clinical model on synthetic
general-domain text), not the pipeline. If the app keeps obi/deid_bert_i2b2 as
its clinical-BERT option, the BILOU normalization should be fixed; as shipped,
the option is effectively broken in the browser pipeline.

## Label mapping notes

`score.py` is used byte-identical to the baseline. It scores per-category only
for canonical labels, so each candidate's extra normalized labels were remapped
to the same 10 categories before scoring (`harness/remap_labels.py`; binary
exact-span scoring is offset-based and unaffected by relabeling):

- `deid_bert_i2b2`: no remap needed — the pipeline's `phiLabelMap` already
  normalizes its surviving labels (PATIENT→PATIENT NAME, STAFF→PROVIDER NAME,
  HOSP→FACILITY, PATORG→ORGANIZATION). FACILITY/ORGANIZATION/AGE have no gold
  counterpart and stay binary-only.
- `bert-small-pii`: FINANCIAL / IBAN CODE / US BANK NUMBER / US ITIN /
  CREDIT CARD / US LICENSE PLATE → ID. (None of these labels were actually
  emitted on this sample; COORDINATE, PASSWORD, NRP stayed binary-only.)
- `multilang-pii-ner`: BUILDINGNUM→ADDRESS, IDCARDNUM / SOCIALNUM /
  DRIVERLICENSENUM / TAXNUM / CREDITCARDNUMBER / PASSPORTNUM → ID.
  (GENDER, SEX, AGE stay binary-only.)
- `piiranha` (not benchmarked): BUILDINGNUM→ADDRESS, DATEOFBIRTH→DOB,
  IDCARDNUM / DRIVERLICENSENUM / SOCIALNUM / TAXNUM / CREDITCARDNUMBER /
  ACCOUNTNUM → ID would have applied.

## Candidates that could not run

### microsoft/Phi-3.5-mini-instruct via WebLLM — could not run

No WebGPU adapter can be created in this environment, and WebLLM strictly
requires WebGPU. No server-side substitute was run. Headless-shell Chromium:
`navigator.gpu` absent. Full Chromium 140 (`--headless=new`, SwiftShader):
`navigator.gpu` exists with `--enable-unsafe-swiftshader`, but
`navigator.gpu.requestAdapter()` resolves `null` in every configuration tried
(SwiftShader ANGLE variants, Vulkan/SwiftShader combos, explicit
`VK_ICD_FILENAMES`, `--in-process-gpu`, `--disable-gpu-sandbox`, headed under
Xvfb). Console shows `Failed to create WebGPU Context Provider`. WebLLM 0.2.85
`detectGPUDevice()` throws `Unable to find a compatible GPU...` before any
inference — verified in-browser with a verbatim replica
(`site/webllm_probe.html`). The ~2.3 GB q4f16 weights were never downloaded.
Environment limitation, not a model defect; testing needs a machine with
working WebGPU.

### onnx-community/piiranha-v1-detect-personal-information-ONNX — broken artifacts

Both downloaded ONNX artifacts — q8 `model_quantized.onnx` and
`model_uint8.onnx` (317,144,829 bytes each) — return **zero entities** on the
model's own README example, `My name is Sarah and I live in London`. A
raw-logit probe shows every token's argmax is class 17 (`O`); the breakage is
in the conversion, not the pipeline. The original PyTorch model
(`iiiorg/piiranha-v1-detect-personal-information`, trained on
ai4privacy/pii-masking-400k — the same data family as this benchmark) claims
98%+ PII recall, so this is a damaged artifact, not a model verdict. The full
benchmark was not run on broken weights. Note the license: **CC-BY-NC-ND
4.0** — non-commercial, no derivatives — which rules it out for the app
regardless.

## Practical takeaways

- **Keep the Stanford deidentifier as default.** It wins both modes, loads
  fastest (4.9 s), and is the only candidate above 0.30 model-only / 0.50
  hybrid on this data.
- **bert-small-pii stays a reasonable fallback**: 28.4 MiB (3.7x smaller),
  fastest per-doc inference (242 ms hybrid median), hybrid F1 0.487 — 0.050
  below baseline.
- **deid_bert_i2b2 is not a drop-in upgrade**: 104.3 MiB, 2.3 s/doc median,
  and its BILOU encoding is silently dropped by the shipped pipeline
  (model-only F1 0.014 as measured). With a one-line pipeline fix it reaches
  0.226 model-only — still behind Stanford. Fix the BILOU handling before
  offering it as the clinical-BERT option, or remove the option.
- **multilang-pii-ner**: 282.1 MiB, 28 s load, model-only F1 0.218 — no
  advantage over the smaller candidates; hybrid not run.
- **piiranha**: cannot be evaluated from the onnx-community artifacts (broken
  conversion); also CC-BY-NC-ND licensed.
- **Phi-3.5/WebLLM**: untestable here (no WebGPU); the "small local LLM"
  hypothesis remains open and needs a GPU machine.

## Reproducibility

- Survey harness: `models-survey/harness/` (survey_driver.mjs with
  checkpoint resume + browser-relaunch resilience, score_survey.py,
  remap_labels.py, assemble_results.py, smoke.mjs), `models-survey/site/`
  (survey.html, survey_biloufix.html for the secondary analysis)
- Per-model raw outputs: `models-survey/results/raw_<slug>_<mode>.json`
  (1000 docs each, byte-complete)
- Per-model scored results: `models-survey/results/results_<slug>.json`
- `models-survey/results.json`: combined head-to-head numbers
- Static server for the survey ran on port 8903 (the original benchmark's
  server already occupied 8902)
