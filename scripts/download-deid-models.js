// Downloads ONNX de-identification models for self-hosted deployment.
// Run: node scripts/download-deid-models.js
//
// Places files under ./models/ so the browser loads them locally
// with no CDN, no CORS — works on any device on the local network.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
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
  console.log("Downloading de-identification ONNX models for self-hosted deployment...");
  mkdirSync(MODELS_DIR, { recursive: true });

  for (const model of MODELS) {
    await downloadModel(model);
  }

  console.log(`\nDone. Models are in ${MODELS_DIR}/`);
  console.log("The app will load them locally when deployed next to index.html.");
  console.log("Set <html data-model-path=\"./models/\"> to point to this directory (already default).");
}

main().catch((error) => {
  console.error("Download failed:", error.message);
  process.exit(1);
});
