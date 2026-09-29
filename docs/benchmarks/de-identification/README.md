# De-identification benchmark

How the app's on-device automatic de-identification performs on public synthetic PII — what was tested, the numbers, and what they do and don't mean.

## What was tested

Before anything in the app is sent to an outside service, an automatic step scans the note for identifiers on the device. This benchmark measured what that automatic step catches on its own, in a browser, on public synthetic PII text.

Two modes:

- **Hybrid (the app's default):** a neural NER model plus deterministic rules that catch emails, IPs, phones, addresses, dates, times, and identifiers.
- **Model-only:** the neural model alone, without the rules.

The human review step — where a person checks the redactions before anything is sent — was excluded. These numbers describe the automation by itself, not the full app. The clinician review gate was not measured.

**Dataset.** 1,000 synthetic general-domain PII texts (emails, names, phone numbers, addresses, IDs) from the ai4privacy/pii-masking-300k English validation split (DOI 10.57967/hf/1995), drawn with seed 42. 816 of the 1,000 contained at least one annotated span, 5,628 spans in total. This is general PII — not clinical notes. The dataset's custom license covers academic and non-commercial use; its texts are not included here. Anyone reproducing this work downloads the dataset from Hugging Face and uses the seed to draw the same sample.

**Metric.** A prediction counted as correct only when its start offset, end offset, and category all matched the gold annotation (strict exact-span). See methodology.md for the full label mapping and secondary metrics.

**Model.** `onnx-community/stanford-deidentifier-base-ONNX` (quantized, 105.5 MiB) — the app's default. Every candidate ran on-device in headless Chromium via onnxruntime-web; nothing left the test machine. Model load: ~4.9 s one-time.

## Headline results

| Mode | Precision | Recall | F1 |
|---|---|---|---|
| Hybrid | 0.670 | 0.448 | 0.537 |
| Model-only | 0.500 | 0.247 | 0.330 |

The rules are doing real work: email, IP, phone, address, and most date detections come from patterns, not the model.

Per-category exact-span results (hybrid vs model-only):

| Category | Gold spans | Hybrid P / R / F1 | Model-only P / R / F1 |
|---|---|---|---|
| EMAIL | 320 | 0.900 / 0.928 / 0.914 | no predictions |
| IP | 252 | 0.932 / 0.972 / 0.952 | no predictions |
| PHONE | 263 | 0.350 / 0.532 / 0.422 | 0.027 / 0.015 / 0.019 |
| ID | 1,217 | 0.523 / 0.518 / 0.520 | 0.462 / 0.516 / 0.487 |
| DATE | 231 | 0.334 / 0.606 / 0.431 | 0.321 / 0.299 / 0.309 |
| ADDRESS | 578 | 0.728 / 0.218 / 0.336 | no predictions |
| NAME | 1,117 | 0.102 / 0.038 / 0.056 | 0.155 / 0.025 / 0.043 |
| DOB | 273 | 0.360 / 0.033 / 0.060 | no predictions |
| TIME | 443 | no predictions | no predictions |
| LOCATION | 934 | no exact matches (3 predictions) | no predictions |

Pattern categories (email, IP) score above 0.9. IDs and dates land in the 0.4–0.5 range. Names, locations, times, and birth dates are the weak points — the pipeline emitted no time spans and almost no location spans, and the clinical NER model, trained on hospital notes, rarely recognizes the synthetic names in this dataset.

## How fast it runs

All local, in headless Chromium:

- Model load: ~4.9 s (one-time)
- Hybrid: median 647 ms per document, p95 1,266 ms — 1,000 documents in about 12 minutes
- Model-only: median 697 ms per document, p95 1,281 ms

## Trying other on-device models

Every candidate below ran in headless Chromium through the app's real pipeline code, on the same 1,000 texts, scored the same way. Exact-span F1:

| Model | Model-only F1 | Hybrid F1 | Size | Median ms/doc (hybrid) | Notes |
|---|---|---|---|---|---|
| Stanford deidentifier (default) | 0.330 | **0.537** | 105.5 MiB | 647 | wins both modes |
| rtrigoso/bert-small-pii-detection-ONNX (app fallback) | 0.247 | 0.487 | 28.4 MiB | 242 | fastest; 3.7× smaller |
| onnx-community/deid_bert_i2b2-ONNX, as shipped | 0.014 | 0.405 | 104.3 MiB | 1,653 | effectively broken in the shipped pipeline — see the BILOU finding below |
| deid_bert_i2b2 with a one-line BILOU fix | 0.226 | 0.493 | 104.3 MiB | 1,037 | secondary analysis with fixed label handling |
| onnx-community/multilang-pii-ner | 0.218 | — | 282.1 MiB | 1,006 | hybrid not run (below the 0.40 model-only threshold) |
| microsoft/Phi-3.5-mini-instruct via WebLLM | — | — | ~2.3 GB | — | could not run — no WebGPU adapter in the test environment |
| piiranha ONNX | — | — | 318.1 MiB | — | broken weights (zero entities even on the model's own example); also CC-BY-NC-ND licensed |

**The BILOU finding.** deid_bert_i2b2 uses BILOU label encoding, but the pipeline strips only `B-` and `I-` prefixes, so predictions starting with `L-` or `U-` — roughly 85% of its detections — are silently discarded. A one-line fix (strip `B-`/`I-`/`U-`/`L-`) lifts its model-only F1 from 0.014 to 0.226 and its hybrid F1 from 0.405 to 0.493, ahead of the fallback model but still behind the default. If deid_bert_i2b2 stays as the clinical-BERT option, the pipeline's label handling should be fixed first; as shipped, the option is effectively broken.

**No local-LLM result.** Phi-3.5 via WebLLM strictly needs WebGPU, and no WebGPU adapter could be created in the test environment — an environment limitation, not a verdict on the model. Testing it needs a machine with working WebGPU.

**piiranha excluded.** Both downloaded ONNX artifacts returned zero entities on the model's own README example — the breakage is in the weight conversion, not the model itself — and its CC-BY-NC-ND license (non-commercial, no derivatives) rules it out regardless.

## The tuned pipeline

Ten rule changes were developed on a 700-text development set and confirmed on a frozen 300-text holdout. Precision was held at or above 0.60 throughout (0.75 at the end — not traded away for recall). The full diff is in winning-rules.diff:

1. Free-text clock-time detector ("3:45 PM", "14:30", "3 o'clock") → TIME
2. Generalized "+" international phone rule → PHONE
3. "00"-prefixed international phone rule → PHONE
4. Trunk-"0" national phone rule with a date-shape guard → PHONE
5. A 10-digit number explicitly labeled as a non-phone identifier counts as an ID, not a phone
6. ISO-8601 timestamps without timezone offsets, plus month/year dates ("June/62") → DATE
7. Tolerant birth-date labels (`date_of_birth": "…"`) → DOB
8. Secondary address units ("Suite 800", "Apartment 5", "Pod 300") → ADDRESS
9. Explicit numeric dates with 4-digit years → DATE
10. Extended secondary units plus labeled building numbers (`"Building": "174"`) → ADDRESS

Tuned hybrid on the full 1,000-text sample (exact-span):

| Precision | Recall | F1 |
|---|---|---|
| 0.747 | 0.603 | **0.667** |

That's +7.7 points of precision, +15.5 points of recall, and +13.0 points of F1 over the untuned baseline (0.670 / 0.448 / 0.537). The tuned pipeline is the best hybrid result of any model or configuration tested here. It also runs a little faster: median 614 ms per document.

Per-category F1 after tuning (untuned in parentheses): TIME 0.801 (0.000), PHONE 0.638 (0.422), DATE 0.577 (0.431), ADDRESS 0.642 (0.336), DOB 0.339 (0.060), ID 0.642 (0.520), EMAIL 0.914 (0.914), IP 0.957 (0.952). NAME 0.056 and LOCATION 0.000 barely moved — the rules don't generate names or locations, and the model still doesn't see them in this synthetic data.

## What "state of the art" means here

**Best on this benchmark is not best at clinical de-identification.** This test measured browser-runnable models on general-domain synthetic PII. On this data, models trained on general PII have a home-field advantage, and a clinical model like the Stanford deidentifier is at a domain disadvantage — its training is hospital notes, not synthetic masking data. It still won both modes here, but that says as much about the benchmark as about the models.

The standard clinical benchmark is the 2014 i2b2/UTHealth de-identification corpus, scored at strict entity-level micro-F1. The published field there is far above anything measured here:

| System | Year | Strict entity micro-F1 |
|---|---|---|
| nference ensemble | 2020 | 0.985 |
| Dernoncourt et al. | 2017 | 0.9788 |
| Published field generally | — | clustered 0.97–0.99 |

A 2025 head-to-head (ECIR) reported a GPT-4-based PHI approach at 79% versus 96% for a fine-tuned system on a related task. Looser metrics — e.g. binary token-level F1 — are not comparable to these strict entity-level numbers, and neither are ours.

**This benchmark does not measure clinical performance.** The decisive comparison is the i2b2 2014 corpus, which requires a data-use agreement; that evaluation will supersede everything in this report for clinical claims. Until then, treat these numbers as a general-PII stress test of the app's on-device automation — not as evidence of how it performs on real notes.

## Limitations

- The data is synthetic and general-domain. The name and location scores mostly reflect the gap between hospital-note training and synthetic text, not performance on real notes.
- The dataset's labels and the pipeline's labels don't line up one-to-one; the full mapping is in methodology.md, and every number here depends on it.
- Only the automatic step was measured. The clinician review step, manual redaction, and warning resolution are designed to catch what the automation misses — they are not in these numbers.

## Reproducing

- **Dataset:** ai4privacy/pii-masking-300k, English validation file `data/validation/1english_openpii_8k.jsonl`, DOI 10.57967/hf/1995. Download it from Hugging Face; seed 42 draws the same 1,000 texts. The dataset's custom license covers academic and non-commercial use with acknowledgment of Ai4Privacy.
- **Sample:** the sampled-text IDs (not the texts) are recorded in the benchmark manifest. results.json in this directory carries every number in machine-readable form.
- **Winning rules:** the exact rule changes are in winning-rules.diff.
