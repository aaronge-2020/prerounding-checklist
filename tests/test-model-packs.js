import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { deidModelOptionByKey } from "../src/patient-context/deid-model-options.js";
import {
  LOCAL_MODEL_RUNTIME_VERSION,
  formatBytes,
  hasAutomaticModelDownload,
  importedModelFileUrl,
  importedModelManifestUrl,
  isInstallableModel,
  modelDownloadBytes,
  modelDownloadPlan,
  modelDownloadUrl,
  modelPackEntryPath,
  modelPackManifestIsValid,
  modelPackVerifiedForCurrentRuntime,
  requiredModelPackFiles,
  validateModelPackEntries
} from "../src/patient-context/model-packs.js";

const openmedSmall = deidModelOptionByKey("openmed-superclinical-small");
const gliner = deidModelOptionByKey("gliner-multi-pii");
const stanford = deidModelOptionByKey("stanford-clinical");

assert.equal(isInstallableModel(openmedSmall), true);
assert.equal(isInstallableModel(gliner), true);
assert.equal(isInstallableModel(stanford), false);
assert.deepEqual(stanford.bundledChunks["onnx/model_quantized.onnx"], {
  directory: "onnx/model_quantized.chunks",
  count: 14,
  bytes: 109651017
});
assert.equal(hasAutomaticModelDownload(openmedSmall), true);
assert.equal(openmedSmall.allowSelfHosted, true, "OpenMed Small must prefer packaged same-origin files on managed devices");
assert.equal(hasAutomaticModelDownload(gliner), true);
assert.deepEqual(requiredModelPackFiles(openmedSmall), ["config.json", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_int8.onnx"]);
assert.equal(modelDownloadPlan(openmedSmall).at(-1).sourcePath, "small/model_int8.onnx");
assert.equal(modelDownloadPlan(openmedSmall).at(-1).etag, "cf6756eacfd73377130e1203b7e14ddd357a5b1f7f88c54d6428cdb677e7a5a0");
assert.equal(modelDownloadBytes(openmedSmall), 180408473);
for (const asset of modelDownloadPlan(openmedSmall)) {
  assert.equal(
    statSync(`models/${openmedSmall.modelId}/${asset.path}`).size,
    asset.bytes,
    `${asset.path} must be packaged at the exact pinned size`
  );
}
assert.match(modelDownloadUrl(openmedSmall, modelDownloadPlan(openmedSmall).at(-1)), /Wismut\/openmed-onnx\/resolve\/763dff8d32cc23ff045dd396221f8be62cb1ca03\/small\/model_int8\.onnx$/);
assert.equal(modelDownloadBytes(gliner), 369760835);

const complete = validateModelPackEntries(openmedSmall, requiredModelPackFiles(openmedSmall).map((path, index) => ({ path: `small/${path}`, size: 100 + index })));
assert.equal(complete.valid, true);
assert.equal(complete.files.length, 5);

const incomplete = validateModelPackEntries(gliner, [{ path: "gliner_multi_pii-v1/tokenizer.json", size: 10 }]);
assert.equal(incomplete.valid, false);
assert.ok(incomplete.missing.includes("onnx/model_int8.onnx"));

const manifest = { modelId: openmedSmall.modelId, files: complete.files.map(({ path, size }) => ({ path, size })) };
assert.equal(modelPackManifestIsValid(openmedSmall, manifest), true);
assert.equal(modelPackManifestIsValid(gliner, manifest), false);
assert.equal(modelPackVerifiedForCurrentRuntime(manifest), false);
assert.equal(modelPackVerifiedForCurrentRuntime({ ...manifest, verifiedAt: "2026-07-11T00:00:00.000Z", runtimeVersion: LOCAL_MODEL_RUNTIME_VERSION }), true);
assert.equal(importedModelFileUrl(openmedSmall.modelId, "onnx/model_int8.onnx", "https://example.test/app/").endsWith("/__prerounding-models/Wismut/openmed-onnx/small/onnx/model_int8.onnx"), true);
assert.equal(importedModelManifestUrl(openmedSmall.modelId, "https://example.test/app/").endsWith("/.manifest.json"), true);
assert.equal(modelPackEntryPath("small/onnx/model_int8.onnx", openmedSmall), "onnx/model_int8.onnx");
assert.equal(formatBytes(1024 * 1024), "1 MB");

console.log("model-pack registry tests passed");
