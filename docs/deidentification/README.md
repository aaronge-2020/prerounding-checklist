# deidentification — evaluation record

Evaluation record for the browser-local clinical text de-identification
system shipped in this repository (`src/vault/deid.js`, Track D rule layer
D1 through D12). The system under test is a hybrid: a browser-run clinical
NER base model plus a frozen deterministic rule layer. Everything documented
here is the evidence behind the manuscript's numbers
("Browser-Local De-identification of Clinical Text").

Start with `EXPERIMENTS.md` for the experiment map and `DATA.md` for the
dataset manifest.

## What lives here

| Path | What it is |
|---|---|
| `EXPERIMENTS.md` | Experiment map: every experiment, protocol, and result |
| `DATA.md` | Dataset manifest: every dataset used, sources, and exclusions |
| `evaluation-framework.md` | The pre-registered evaluation protocol (fixed before any comparator ran) |
| `DATASET.md`, `LABEL_MAPPING.md` | MedDeID label schema and the mapping to our 15 PHI types |
| `reports/` | Full writeups: the five-stream reviewer hardening batch, the SOTA head-to-head, Technetium/ASQ analyses, model surveys |
| `eval/` | Frozen split IDs (`split.json`), scorers (`score_dev.py`, `score_test.py`, `bootstrap_ci.py`), ablation scripts, residual error examples, and committed result summaries (per-experiment F1, CIs, paired tests) |
| `external/` | Technetium-I / ASQ-PHI summary scores and the schema remap scorer |
| `wllama-verifier/` | Prototype browser-local LLM second-pass verifier (design implemented, evaluation pending; no numbers reported) |

## The system under test

The shipped system lives in this repo, not here: `src/vault/deid.js` plus
`src/vault/deid/` (rule layer D1 through D12), wired through
`src/patient-context/` (worker, model packs) and reviewed in
`src/ui/deid/` and `src/ui/quick-deid/`. The evaluation harnesses replayed
that exact pipeline headlessly.

## Reproducing without the excluded binaries

Large binaries are excluded from git by this repo's `.gitignore`:
ONNX model weights, `node_modules`, Python venvs, and raw third-party
dataset dumps. To reproduce an experiment:

1. Model weights: download from the Hugging Face paths recorded in
   `reports/real-sota-survey.md` into the `models/` directory each harness
   expects (or reuse this repo's `models/` packs where they overlap).
2. Datasets: fetch from the sources in `DATA.md` (MedDeID via Hugging Face,
   Technetium-I and ASQ-PHI per their publications).
3. Result summaries in `eval/` and `external/` are committed, so published
   numbers can be checked without rerunning inference: see
   `EXPERIMENTS.md` for the scorer commands.

## Frozen evaluation discipline

The 100-note held-out set (`eval/split.json`, `test_ids`) was evaluated
exactly twice during development, then frozen. No new variant, ablation, or
prototype documented here has been scored on it since. Anything developed
after the freeze was evaluated on dev 200 or on external datasets only. See
`evaluation-framework.md` and `EXPERIMENTS.md`.
