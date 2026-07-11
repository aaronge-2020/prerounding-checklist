// Installs optional ONNX de-identification asset packs for a local self-hosted copy.
// Run: node scripts/download-deid-models.js --model=openai/privacy-filter
//
// Places files under ./models/ so the browser loads them locally
// with no CDN, no CORS — works on any device on the local network.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MODELS_DIR = join(ROOT, "models");

const MODELS = [
  {
    // Primary: Stanford clinical de-ID (q8 quantized, ~110MB)
    // Best accuracy for clinical text
    id: "onnx-community/stanford-deidentifier-base-ONNX",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.txt",
      "onnx/model_quantized.onnx"
    ]
  },
  {
    // I2B2 ClinicalBERT: ClinicalBERT fine-tuned on i2b2 2014 de-id (q8 quantized, ~109MB)
    // 11 HIPAA-safe-harbor entity types, BILOU tagging
    // From OBI / Alsentzer et al., trained on MIMIC-III clinical notes
    id: "onnx-community/deid_bert_i2b2-ONNX",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.txt",
      "special_tokens_map.json",
      "onnx/model_quantized.onnx"
    ]
  },
  {
    // Enhanced PII: multi-language PII NER (q8 quantized, ~279MB)
    // 25 entity types — broader PHI coverage than Stanford
    // GIVENNAME, SURNAME, DATE, AGE, PHONE, EMAIL, ORGANIZATION, ADDRESS, etc.
    id: "onnx-community/multilang-pii-ner-ONNX",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/model_quantized.onnx"
    ]
  },
  {
    // OpenAI Privacy Filter: larger context-aware open-weight model (q4, ~945MB with tokenizer)
    // Browser-compatible via Transformers.js token-classification.
    id: "openai/privacy-filter",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "viterbi_calibration.json",
      "onnx/model_q4.onnx",
      "onnx/model_q4.onnx_data"
    ]
  },
  {
    // Ettin 68M Nemotron PII: source repo ships safetensors only.
    // Run the ONNX export step after download to create onnx/model.onnx for browser use.
    id: "kalyan-ks/ettin-68m-nemotron-pii",
    files: [
      "config.json",
      "model.safetensors",
      "tokenizer.json",
      "tokenizer_config.json"
    ]
  },
  {
    // Knowledgator GLiNER PII Base: GLiNER.js adapter consumes the local quantized ONNX model.
    id: "knowledgator/gliner-pii-base-v1.0",
    files: [
      "added_tokens.json",
      "gliner_config.json",
      "special_tokens_map.json",
      "spm.model",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model_quint8.onnx"
    ]
  },
  {
    // Fallback: small PII detection model (q8 quantized, ~29MB)
    // Mobile-feasible, works on constrained devices
    id: "rtrigoso/bert-small-pii-detection-ONNX",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.txt",
      "onnx/model_quantized.onnx"
    ]
  }
];

const BASE_URL = "https://huggingface.co";

async function downloadFile(url, dest) {
  if (existsSync(dest)) {
    console.log(`  SKIP (exists): ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buffer);
  const mb = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`  OK (${mb} MB): ${dest}`);
}

async function downloadModel(model) {
  console.log(`\nModel: ${model.id}`);
  for (const file of model.files) {
    const url = `${BASE_URL}/${model.id}/resolve/main/${file}`;
    const dest = join(MODELS_DIR, model.id, file);
    try {
      await downloadFile(url, dest);
    } catch (error) {
      console.error(`  FAIL: ${file} — ${error.message}`);
    }
  }
}

async function main() {
  console.log("Installing local de-identification model assets...");
  mkdirSync(MODELS_DIR, { recursive: true });

  const requestedModel = process.argv.find((arg) => arg.startsWith("--model="))?.slice("--model=".length);
  if (!requestedModel) {
    throw new Error(`Choose one model with --model=<id>. Available: ${MODELS.map((model) => model.id).join(", ")}`);
  }
  const selectedModels = MODELS.filter((model) => model.id === requestedModel);
  if (!selectedModels.length) {
    throw new Error(`Unknown model '${requestedModel}'. Known models: ${MODELS.map((model) => model.id).join(", ")}`);
  }

  for (const model of selectedModels) {
    await downloadModel(model);
  }

  console.log(`\nDone. Models are in ${MODELS_DIR}/`);
  console.log("The app will load them locally when deployed next to index.html.");
  console.log("Serve the repository statically to load the installed local assets.");
}

main().catch((error) => {
  console.error("Download failed:", error.message);
  process.exit(1);
});
