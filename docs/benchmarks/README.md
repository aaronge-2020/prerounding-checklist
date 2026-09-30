# Benchmarks

On-device de-identification benchmarks for the pre-rounding app, run September 2026. Everything here scores the app's actual de-identification pipeline — model plus rule layers — on synthetic or openly licensed data, so the numbers describe the system that ships, not a model in isolation.

## Datasets

- **ai4privacy/pii-masking-300k** — 300k synthetic PII documents. We use the English validation split (`data/validation/1english_openpii_8k.jsonl`, 7,946 rows). DOI: 10.57967/hf/1995.
- **MedDeID English synthetic benchmark** — 300 human-validated synthetic English clinical notes, 1,717 annotated spans. HuggingFace: `stighellemans/meddeid-english-synthetic-benchmark`. Zenodo DOI: 10.5281/zenodo.22689857 (v3). Paper: Hellemans et al., arXiv:2609.10049. License: CC BY 4.0.

No real patient data is used anywhere in this program.

## Rounds

| When | What | Headline |
|---|---|---|
| 2026-09-29 | Round 1 — model survey, 1,000-row sample | Stanford hybrid 0.537 F1 led; PIIRANHA's ONNX artifacts were broken; Phi-3.5 couldn't run (no WebGPU). Report: `workspace/models-survey/comparison.md`. |
| 2026-09-29 | Round 2 — ClinicalE5, OpenMed Small, Stanford, RoBERTa i2b2, Stanford∪RoBERTa ensemble, 1,000 rows | ClinicalE5 0.672 @ 390ms; OpenMed 0.670 @ 623ms; ensemble 0.665 @ 3.4s; Stanford 0.663 @ 825ms; RoBERTa 0.656 @ 5.2s. Report: `workspace/models-survey/round2.md`. |
| 2026-09-29 | Track B — patient lexicon, age detector, clinical stoplist, boundary repair, confidence-ordered review | Shipped in the app. On the general-domain split the gain was within noise; the rules target clinical-text failure modes. |
| 2026-09-29 | Track C — error mining on the 1,000-row sample | Candidate stack 0.6744 → 0.7583, driven by NAME (0.06 → 0.53 F1). Report: `workspace/track-c-report.md`. |
| 2026-09-30 | Round 3 — full 7,946-row split, 8 configurations | OpenMed 0.7655 ≈ ClinicalE5 0.7594 (statistical tie) > Stanford 0.7497, all with bootstrap 95% CIs. Track C's unbiased gain is +0.0535 (the 1,000-row +0.0839 was stratification-inflated). ClinicalE5 ~3× faster than Stanford (184 vs 552ms). Report: `de-identification/round3-full.md`. |
| 2026-09-30 | MedDeID clinical benchmark, 300 notes | Ranking flips on clinical text: Stanford 0.5337 > RoBERTa 0.5229 > OpenMed 0.4849 > ClinicalE5 0.4607 (exact-span F1). Report: `workspace/models-survey/meddeid-clinical.md`. |
| 2026-09-30 | Track D — clinical-text rules on MedDeID (200 dev / 100 held-out) | Stanford + rule stack: 0.829 dev, **0.802 held-out** F1. Rules: clinical ages, role-anchored provider names, labeled clinical IDs, care facilities, relatives' names, label corrections. Report: `workspace/models-survey/track-d-report.md`. |

Metric everywhere is strict exact-span precision/recall/F1 unless a report says otherwise; MedDeID rounds also report the paper's character-level recall.

## Layout

- `de-identification/` — the published round reports (also rendered in the repo docs).
- `workspace/` — the full working tree, mirrored from the benchmark machine: scorers, drivers, splits, manifests, raw outputs, and the pipeline source variants each round ran against. Paths in the reports refer to this tree.
- `MODELS.md` — every model tested: exact HuggingFace ID, quantization, size, download source, and which rounds used it. Model binaries are not vendored; download them from the linked sources.

## Reproducing a round

1. Download the models in `MODELS.md` and the dataset for the round (links above).
2. Serve the matching harness site under `workspace/<round>/site/` (or `meddeid/site-trackbc/`).
3. Run the driver (`driver.mjs`, `meddeid-driver.mjs`, `run.sh`) and score with the round's `score.py`.

The 1,000-row sample is `workspace/data/sample.jsonl` (seed 42; manifest in `sample_manifest.json`). The raw 27MB English validation file is not vendored — pull it from the dataset above. The 7MB clinical-guard vocabulary export is generated, not vendored; see `scripts/apply-clinical-guard-vocabulary.js` in the app repo.

## Validation workstreams

`de-identification/validation/` holds the separate human-review gate protocol (ws1-review-gate) and the zero-egress packet-capture evidence (ws2-zero-egress). Those measure the review experience and network behavior, not model accuracy.
