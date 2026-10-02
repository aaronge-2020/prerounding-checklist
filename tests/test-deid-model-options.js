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
assert.deepEqual(keys.sort(), ["gliner-multi-pii", "openmed-superclinical-small", "stanford-clinical"].sort(), "the clinician picker must exclude unsupported large local packs");
assert.equal(DEFAULT_DEID_MODEL_KEY, "stanford-clinical", "the bundled clinical model is the safe default");
assert.ok(keys.includes(DEFAULT_DEID_MODEL_KEY));
assert.ok(keys.includes("openmed-superclinical-small"));
assert.ok(keys.includes("gliner-multi-pii"));
assert.equal(keys.includes("openmed-superclinical"), false, "large OpenMed must not be presented after repeated local allocation failures");

const stanford = deidModelOptionByKey(DEFAULT_DEID_MODEL_KEY);
assert.equal(stanford.assetMode, "bundled");
assert.equal(stanford.browserRunnable, true);

const openmedSmall = deidModelOptionByKey("openmed-superclinical-small");
assert.equal(openmedSmall.modelId, "Wismut/openmed-onnx/small");
assert.ok(openmedSmall.requiredFiles.includes("onnx/model_int8.onnx"));
assert.deepEqual(deidModelCandidates(openmedSmall).map((candidate) => ({ device: candidate.options.device, dtype: candidate.options.dtype })), [{ device: "wasm", dtype: "int8" }]);
assert.equal(openmedSmall.wasmRuntime, "standard");

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
