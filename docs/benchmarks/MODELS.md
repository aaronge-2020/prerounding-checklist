# Models tested in the benchmark program

Every model scored in the September 2026 benchmark rounds. Binaries are not vendored in this repo — download from the HuggingFace links. Revisions were not pinned at download time (2026-09-29/30); re-resolve the IDs below.

| Model | HuggingFace ID | Quantization | Size | Rounds used in |
|---|---|---|---|---|
| Stanford clinical deidentifier | [onnx-community/stanford-deidentifier-base-ONNX](https://huggingface.co/onnx-community/stanford-deidentifier-base-ONNX) | int8 (`model_quantized.onnx`) | ~110 MB weights; 105.5 MiB served dir | R1, R2, R3, MedDeID, Track D |
| ClinicalE5 Small 33M | [OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android](https://huggingface.co/OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android) | int8 | ~67 MiB | R2, R3, MedDeID |
| OpenMed Small | [Wismut/openmed-onnx/small](https://huggingface.co/Wismut/openmed-onnx/small) | int8 | ~172 MB weights | R2, R3, MedDeID |
| RoBERTa i2b2 (quantized) | [thinkingface/deid_roberta_i2b2_q](https://huggingface.co/thinkingface/deid_roberta_i2b2_q) | int8 (`model_quantized.onnx`) | ~356 MB weights | R2, MedDeID, ensemble |
| OBI i2b2 ClinicalBERT | [onnx-community/deid_bert_i2b2-ONNX](https://huggingface.co/onnx-community/deid_bert_i2b2-ONNX) | int8 (`model_quantized.onnx`) | 104.3 MiB served dir | R1 (incl. BILOU-fix rerun) |
| BERT small PII | [rtrigoso/bert-small-pii-detection-ONNX](https://huggingface.co/rtrigoso/bert-small-pii-detection-ONNX) | quantized | 28.4 MiB served dir | R1 |
| Multilingual PII NER | [onnx-community/multilang-pii-ner-ONNX](https://huggingface.co/onnx-community/multilang-pii-ner-ONNX) | int8 (`model_quantized.onnx`) | 282.1 MiB served dir | R1 (model-only) |
| PIIRANHA v1 | [onnx-community/piiranha-v1-detect-personal-information-ONNX](https://huggingface.co/onnx-community/piiranha-v1-detect-personal-information-ONNX) | int8 (`model_uint8.onnx`) | 318.1 MiB served dir | R1 (broken ONNX artifacts — could not score) |
| GLiNER multi-PII | [onnx-community/gliner_multi_pii-v1](https://huggingface.co/onnx-community/gliner_multi_pii-v1) | — | — | App option; non-browser SOTA comparison |
| Stanford ∪ RoBERTa ensemble | union of the two models' spans, not a model | — | — | R2 |

Not benchmarked in this program (present as app options only): `openai/privacy-filter`, `kalyan-ks/ettin-68m-nemotron-pii`. The R1 WebLLM probe (`microsoft/Phi-3.5-mini-instruct`, ~2.3GB) could not run — no WebGPU adapter in the benchmark environment.

## Size notes

"Served dir" sizes come from Round 1's measurement (`du -sb` of weights + tokenizer as served to onnxruntime-web). Raw weight-file sizes differ slightly. All inference ran in headless Chromium via onnxruntime-web (WASM, threaded) except where a report notes otherwise.
