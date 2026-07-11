import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhiLabel } from "../src/vault/deid.js";
import {
  DEID_MODEL_OPTIONS,
  DEFAULT_DEID_MODEL_KEY,
  deidModelCandidates,
  deidModelOptionByKey,
  runnableDeidModelOptions
} from "../src/patient-context/deid-model-options.js";

const root = fileURLToPath(new URL("..", import.meta.url));
function repoFile(path) {
  return join(root, path);
}

const deidServiceSource = readFileSync(repoFile("src/patient-context/deid-service.js"), "utf8");
const gitignore = readFileSync(repoFile(".gitignore"), "utf8");
assert.match(
  deidServiceSource,
  /await deidentifier\.loadModel\(\{ onProgress \}\);/,
  "advanced de-identification must load the selected model before producing an advanced result"
);

const keys = DEID_MODEL_OPTIONS.map((option) => option.key);
assert.ok(keys.includes(DEFAULT_DEID_MODEL_KEY), "default model should be registered");
assert.ok(keys.includes("openai-privacy-filter"), "OpenAI Privacy Filter should be registered");
assert.ok(keys.includes("ettin-68m-nemotron-pii"), "Ettin 68M Nemotron PII should be visible in the model list");
assert.ok(keys.includes("knowledgator-gliner-pii-base"), "Knowledgator GLiNER PII should be visible in the model list");

const openai = deidModelOptionByKey("openai-privacy-filter");
assert.equal(openai.browserRunnable, true, "OpenAI Privacy Filter should be enabled for local browser loading");
assert.equal(openai.modelId, "openai/privacy-filter");
assert.deepEqual(
  deidModelCandidates(openai).map((candidate) => candidate.options.dtype),
  ["q4"],
  "OpenAI Privacy Filter should use q4 browser assets"
);
assert.deepEqual(
  deidModelCandidates(openai).map((candidate) => candidate.options.device || "auto"),
  ["webgpu"],
  "OpenAI Privacy Filter should run through the local WebGPU backend"
);
assert.equal(openai.requiresWebGpu, true, "OpenAI Privacy Filter should declare its WebGPU requirement");
assert.ok(openai.requiredFiles.includes("onnx/model_q4.onnx_data"), "OpenAI local asset list should include external ONNX data");
assert.match(gitignore, /models\/openai\//, "the large OpenAI asset pack must stay local and out of the GitHub Pages artifact");

const ettin = deidModelOptionByKey("ettin-68m-nemotron-pii");
assert.equal(ettin.browserRunnable, true, "Ettin should be enabled once the local ONNX export is installed");
assert.equal(ettin.engine, "transformers-token-classification");
assert.ok(ettin.requiredFiles.includes("onnx/model.onnx"));
assert.match(gitignore, /models\/kalyan-ks\//, "the optional Ettin asset pack must not be committed as a regular Git blob");
assert.deepEqual(
  deidModelCandidates(ettin).map((candidate) => candidate.options.local_files_only),
  [true],
  "Ettin should load only local browser assets"
);

const gliner = deidModelOptionByKey("knowledgator-gliner-pii-base");
assert.equal(gliner.browserRunnable, true, "GLiNER should be enabled through the browser GLiNER adapter");
assert.equal(gliner.engine, "gliner");
assert.ok(gliner.requiredFiles.includes("onnx/model_quint8.onnx"));
assert.match(gitignore, /models\/knowledgator\//, "the optional GLiNER asset pack must not be committed as a regular Git blob");
assert.ok(existsSync(repoFile("vendor/gliner/index.mjs")), "GLiNER browser adapter should be vendored");
assert.deepEqual(
  deidModelCandidates(gliner).map((candidate) => candidate.options.device),
  ["wasm"],
  "GLiNER should use the local wasm runtime by default"
);

assert.ok(runnableDeidModelOptions().some((option) => option.key === "openai-privacy-filter"));
assert.ok(runnableDeidModelOptions().some((option) => option.key === "ettin-68m-nemotron-pii"));
assert.ok(runnableDeidModelOptions().some((option) => option.key === "knowledgator-gliner-pii-base"));
assert.equal(normalizePhiLabel("private_person"), "NAME");
assert.equal(normalizePhiLabel("private_email"), "EMAIL");
assert.equal(normalizePhiLabel("private_phone"), "PHONE");
assert.equal(normalizePhiLabel("private_address"), "ADDRESS");
assert.equal(normalizePhiLabel("private_date"), "DATE");
assert.equal(normalizePhiLabel("secret"), "ID");

console.log("de-id model option tests passed");
