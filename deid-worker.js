import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
import {
  createDeidentifier,
  DEFAULT_DTYPE,
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_PRIMARY_MODEL_ID
} from "./deid.js?v=20260606-security2";

env.allowLocalModels = false;
env.allowRemoteModels = true;
const browserCacheAvailable = typeof caches !== "undefined";
env.useBrowserCache = browserCacheAvailable;
env.useWasmCache = browserCacheAvailable;

if (env.backends?.onnx?.wasm) {
  const onnxRuntimeWebVersion = "1.26.0-dev.20260416-b7804b056c";
  const onnxRuntimeBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${onnxRuntimeWebVersion}/dist/`;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${onnxRuntimeBase}ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${onnxRuntimeBase}ort-wasm-simd-threaded.asyncify.wasm`
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

const deidentifier = createDeidentifier({
  pipelineFactory: pipeline,
  primaryModelId: DEFAULT_PRIMARY_MODEL_ID,
  fallbackModelId: DEFAULT_FALLBACK_MODEL_ID,
  dtype: DEFAULT_DTYPE,
  device: "wasm",
  onModelStatus(update) {
    self.postMessage({ type: "status", update });
  }
});

function postProgress(requestId, update) {
  self.postMessage({ type: "progress", requestId, update });
}

function serializeError(error) {
  return {
    message: error?.message || String(error || "Unknown error"),
    name: error?.name || "Error"
  };
}

self.addEventListener("message", async (event) => {
  const { requestId, type, text, mode } = event.data || {};

  try {
    if (type === "prepare") {
      await deidentifier.loadModel({
        onProgress: (update) => postProgress(requestId, update)
      });
      self.postMessage({ type: "result", requestId, result: { ready: true } });
      return;
    }

    if (type === "deidentify") {
      const result = await deidentifier.deidentifyText(String(text || ""), {
        mode,
        onProgress: (update) => postProgress(requestId, update)
      });
      self.postMessage({ type: "result", requestId, result });
      return;
    }

    throw new Error(`Unknown worker request: ${type}`);
  } catch (error) {
    self.postMessage({ type: "error", requestId, error: serializeError(error) });
  }
});
