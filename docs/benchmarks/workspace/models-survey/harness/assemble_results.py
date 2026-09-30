#!/usr/bin/env python3
"""Assemble models-survey/results.json: the combined head-to-head table.
Usage: python3 assemble_results.py
Reads results/results_<slug>.json for each surveyed model, the baseline
../results/results.json (Aaron's Stanford numbers, not re-run), and the
recorded model sizes; writes results/results.json.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "results")

BASELINE = json.load(open(os.path.join(ROOT, "..", "results", "results.json")))

MODELS = {
    # slug: (display name, hf id, size MiB of served model dir incl. tokenizer)
    "bert-small-pii": (
        "rtrigoso/bert-small-pii-detection-ONNX",
        "rtrigoso/bert-small-pii-detection-ONNX",
        28.4,
    ),
    "deid-bert-i2b2": (
        "onnx-community/deid_bert_i2b2-ONNX",
        "onnx-community/deid_bert_i2b2-ONNX",
        104.3,
    ),
    "piiranha": (
        "onnx-community/piiranha-v1-detect-personal-information-ONNX",
        "onnx-community/piiranha-v1-detect-personal-information-ONNX",
        318.1,
    ),
    "multilang-pii-ner": (
        "onnx-community/multilang-pii-ner-ONNX",
        "onnx-community/multilang-pii-ner-ONNX",
        282.1,
    ),
}

CATEGORIES = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB",
              "LOCATION", "ADDRESS", "ID", "IP"]


def summarize(results_obj, slug, name, hf_id, size_mb):
    out = {"name": name, "hf_id": hf_id, "size_mb": size_mb,
           "model_id": results_obj.get("model_id"),
           "model_load_ms": results_obj.get("model_load_ms"), "modes": {}}
    if results_obj.get("note"):
        out["note"] = results_obj["note"]
    for mode in ("model-only", "hybrid"):
        m = results_obj["modes"][mode]
        if m is None:
            out["modes"][mode] = None
            continue
        b = m["binary_exact_span"]
        out["modes"][mode] = {
            "precision": b["precision"], "recall": b["recall"], "f1": b["f1"],
            "tp": b["tp"], "fp": b["fp"], "fn": b["fn"],
            "latency_ms": m["latency_ms"],
            "per_category_f1": {c: m["per_category_exact_span"][c]["f1"]
                                for c in CATEGORIES},
            "unmapped_predicted_labels": m["unmapped_predicted_labels"],
        }
    return out


def baseline_modes():
    out = {}
    for mode in ("model-only", "hybrid"):
        m = BASELINE["modes"][mode]
        b = m["binary_exact_span"]
        out[mode] = {
            "precision": b["precision"], "recall": b["recall"], "f1": b["f1"],
            "latency_ms": m["latency_ms"],
            "per_category_f1": {c: m["per_category_exact_span"][c]["f1"]
                                for c in CATEGORIES},
        }
    return out


def main():
    combined = {
        "dataset": "ai4privacy/pii-masking-300k (English validation), 1000 texts, seed 42",
        "scorer": "harness/score.py unchanged (strict exact-span P/R/F1)",
        "baseline": {
            "name": "onnx-community/stanford-deidentifier-base-ONNX (app default)",
            "note": "Aaron's baseline from ../results/results.json (2026-09-29); not re-run",
            "size_mb": 105.5, "model_load_ms": 4900,
            "modes": baseline_modes(),
        },
        "models": {},
        "could_not_run": {
            "microsoft/Phi-3.5-mini-instruct via WebLLM (MLC)": (
                "No WebGPU adapter can be created in this environment "
                "(navigator.gpu.requestAdapter() resolves null in all tested "
                "configurations incl. --enable-unsafe-swiftshader; web-llm "
                "0.2.85 detectGPUDevice() throws 'Unable to find a compatible "
                "GPU...'). See comparison.md. No server-side substitute run."
            ),
            "onnx-community/piiranha-v1-detect-personal-information-ONNX": (
                "ONNX artifacts unusable: q8 (model_quantized.onnx) and uint8 "
                "(model_uint8.onnx) both return zero entities on the model's "
                "own README example 'My name is Sarah and I live in London' "
                "(all tokens argmax to O); raw-logit probe confirms the "
                "breakage is in the conversion, not the pipeline. The "
                "original PyTorch model (iiiorg/piiranha-v1, cc-by-nc-nd-4.0) "
                "claims 98%+ PII recall, so this is a damaged artifact, not "
                "a model verdict. Full benchmark not run on broken weights. "
                "See comparison.md."
            ),
        },
    }
    for slug, (name, hf_id, size_mb) in MODELS.items():
        p = os.path.join(RES, f"results_{slug}.json")
        if not os.path.exists(p):
            print(f"skip {slug}: {p} missing")
            continue
        combined["models"][slug] = summarize(json.load(open(p)), slug, name,
                                             hf_id, size_mb)
        f1s = {m: (combined["models"][slug]["modes"][m] or {}).get("f1")
               for m in ("model-only", "hybrid")}
        print(f"{slug}: model-only F1={f1s['model-only']} hybrid F1={f1s['hybrid']}")
    json.dump(combined, open(os.path.join(RES, "results.json"), "w"), indent=2)
    print("wrote", os.path.join(RES, "results.json"))


if __name__ == "__main__":
    main()
