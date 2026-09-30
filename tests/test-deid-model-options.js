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
const repoFile = (path) => join(root, path);
const deidServiceSource = readFileSync(repoFile("src/patient-context/deid-service.js"), "utf8");
const deidClientSource = readFileSync(repoFile("src/patient-context/deid-client.js"), "utf8");
const deidWorkerSource = readFileSync(repoFile("src/patient-context/deid-worker.js"), "utf8");

assert.match(deidServiceSource, /await deidentifier\.loadModel\(\{ onProgress \}\);/);
assert.match(deidServiceSource, /External model requests are disabled/);
assert.match(deidServiceSource, /verifyAdvancedDeidModel/);
assert.match(deidClientSource, /deid-worker\.js\?v=/);
assert.match(deidWorkerSource, /deid-service\.js\?v=/);

const keys = DEID_MODEL_OPTIONS.map((option) => option.key);
assert.deepEqual(keys.sort(), ["gliner-multi-pii", "obi-deid-bert-i2b2", "openmed-clinicale5-small", "openmed-superclinical-small", "stanford-clinical"].sort(), "the clinician picker must exclude unsupported large local packs");
assert.equal(DEFAULT_DEID_MODEL_KEY, "openmed-clinicale5-small", "the round-2 benchmark winner is the default");
assert.ok(keys.includes(DEFAULT_DEID_MODEL_KEY));
assert.ok(keys.includes("stanford-clinical"));
assert.ok(keys.includes("openmed-superclinical-small"));
assert.ok(keys.includes("gliner-multi-pii"));
assert.ok(keys.includes("openmed-clinicale5-small"));
assert.equal(keys.includes("openmed-superclinical"), false, "large OpenMed must not be presented after repeated local allocation failures");

const obi = deidModelOptionByKey("obi-deid-bert-i2b2");
assert.equal(obi.assetMode, "bundled");
assert.equal(obi.browserRunnable, true);
assert.equal(obi.modelId, "onnx-community/deid_bert_i2b2-ONNX");
assert.deepEqual(obi.bundledChunks["onnx/model_quantized.onnx"], {
  directory: "onnx/model_quantized.chunks",
  count: 13,
  bytes: 108507617
});

const stanford = deidModelOptionByKey("stanford-clinical");
assert.equal(stanford.assetMode, "bundled");
assert.equal(stanford.browserRunnable, true);

const openmedSmall = deidModelOptionByKey("openmed-superclinical-small");
assert.equal(openmedSmall.modelId, "Wismut/openmed-onnx/small");
assert.ok(openmedSmall.requiredFiles.includes("onnx/model_int8.onnx"));
assert.deepEqual(deidModelCandidates(openmedSmall).map((candidate) => ({ device: candidate.options.device, dtype: candidate.options.dtype })), [{ device: "wasm", dtype: "int8" }]);
assert.equal(openmedSmall.wasmRuntime, "standard");

const clinicalE5 = deidModelOptionByKey("openmed-clinicale5-small");
assert.equal(clinicalE5.modelId, "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android");
assert.equal(clinicalE5.browserRunnable, true);
assert.equal(clinicalE5.assetMode, "installable");
assert.equal(clinicalE5.dtype, "int8");
assert.equal(clinicalE5.device, "wasm");
assert.equal(clinicalE5.wasmRuntime, "standard");
assert.equal(clinicalE5.localOnly, true);
assert.ok(clinicalE5.requiredFiles.includes("onnx/model_int8.onnx"));
assert.deepEqual(
  deidModelCandidates(clinicalE5).map((candidate) => ({
    device: candidate.options.device,
    dtype: candidate.options.dtype,
    aggregation: candidate.inferenceOptions.aggregation_strategy
  })),
  [{ device: "wasm", dtype: "int8", aggregation: "simple" }]
);
assert.equal(clinicalE5.download.repository, "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android");
assert.equal(clinicalE5.download.revision, "79f7db205869b1be4be23ac4f42aa95bdedc5aee");
assert.deepEqual(
  clinicalE5.download.assets.map((asset) => [asset.path, asset.sourcePath, asset.bytes]),
  [
    ["config.json", "config.json", 6440],
    ["tokenizer.json", "tokenizer.json", 711661],
    ["tokenizer_config.json", "tokenizer_config.json", 499],
    ["onnx/model_int8.onnx", "model_int8.onnx", 69638018]
  ]
);

const gliner = deidModelOptionByKey("gliner-multi-pii");
assert.equal(gliner.engine, "gliner");
assert.ok(gliner.requiredFiles.includes("onnx/model_int8.onnx"));
assert.ok(existsSync(repoFile("vendor/gliner/index.mjs")));
assert.deepEqual(deidModelCandidates(gliner).map((candidate) => candidate.options.device), ["wasm"]);

assert.deepEqual(runnableDeidModelOptions().map((option) => option.key).sort(), keys.sort());
assert.equal(normalizePhiLabel("private_person"), "NAME");
assert.equal(normalizePhiLabel("private_email"), "EMAIL");
assert.equal(normalizePhiLabel("private_phone"), "PHONE");
assert.equal(normalizePhiLabel("private_address"), "ADDRESS");
assert.equal(normalizePhiLabel("private_date"), "DATE");

console.log("de-id model option tests passed");
