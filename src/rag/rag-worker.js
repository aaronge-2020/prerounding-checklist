// Chart-grounded RAG embedding worker: on-device text embeddings for chart
// chunk retrieval. Runs as a module worker (new Worker(url, { type:
// "module" })); embeddings come from a pinned transformers.js
// feature-extraction model downloaded from Hugging Face on first use and
// cached by the browser — the same model-download pattern as the
// de-identification models. No patient text ever leaves the worker.
//
// Protocol (postMessage): { id, type, payload } -> { id, ok, value|error }
//   "status"        -> { ready, modelId, dims, indexedChunks }
//   "ensure-model"  { modelKey, testRemoteHost? } -> { modelId, dims }
//                     (downloads on first use; testRemoteHost redirects the
//                     model file host for offline compat runs)
//   "index"         { chunks: [{ id, text }] } -> { count, dims }
//                     embeds every chunk and holds the vectors in memory
//   "set-vectors"   { ids, buffers } -> { count } (restore cached vectors;
//                     buffers are transferred ArrayBuffers of float32)
//   "get-vectors"   {} -> { ids, buffers } (transfer out for IndexedDB)
//   "query"         { text, k } -> [{ id, score }] top-k cosine
//   "clear"         {} -> { cleared: true }

import { cosineSimilarity } from "./similarity.js";
import { DEFAULT_RAG_MODEL_KEY, RAG_EMBEDDING_MODELS } from "./rag-models.js";

const EMBED_BATCH_SIZE = 8;

let transformersRuntime = null;
let extractor = null;
let activeModelKey = null;
let activeTestRemoteHost = null;
let chunkIds = [];
let chunkVectors = []; // Float32Array, normalized

function vendoredWasmPaths() {
  const base = new URL("../../vendor/onnxruntime-web/", import.meta.url).href;
  return {
    mjs: `${base}ort-wasm-simd-threaded.mjs`,
    wasm: `${base}ort-wasm-simd-threaded.wasm`
  };
}

async function ensureModel(modelKey, { testRemoteHost = null } = {}) {
  const key = String(modelKey || DEFAULT_RAG_MODEL_KEY);
  const spec = RAG_EMBEDDING_MODELS[key];
  if (!spec) throw new Error(`Unknown RAG embedding model: ${key}`);
  if (extractor && activeModelKey === key && activeTestRemoteHost === testRemoteHost) {
    return { modelId: spec.modelId, dims: spec.dims };
  }
  if (!transformersRuntime) {
    transformersRuntime = await import("../../vendor/transformers/transformers.web.js");
    // Model weights come from Hugging Face (allowed by the CSP for pinned
    // model downloads); the WASM runtime is vendored — the CSP has no
    // jsdelivr/unpkg allowance, so the default CDN wasm path would fail.
    transformersRuntime.env.allowLocalModels = false;
    transformersRuntime.env.allowRemoteModels = true;
    transformersRuntime.env.useBrowserCache = true;
    if (transformersRuntime.env.backends?.onnx?.wasm) {
      transformersRuntime.env.backends.onnx.wasm.wasmPaths = vendoredWasmPaths();
      transformersRuntime.env.backends.onnx.wasm.proxy = false;
      transformersRuntime.env.backends.onnx.wasm.numThreads = 1;
    }
  }
  // Test/dev override: redirect the model file host (e.g. to a local
  // server in offline compat runs). The download code path is unchanged —
  // only the host differs. Production never passes this.
  if (testRemoteHost) {
    const base = String(testRemoteHost).replace(/\/?$/, "/");
    transformersRuntime.env.remoteHost = base;
    transformersRuntime.env.remotePathTemplate = "{model}/";
  }
  extractor = await transformersRuntime.pipeline("feature-extraction", spec.modelId, {
    device: "wasm",
    dtype: "fp32"
  });
  if (activeModelKey !== key || activeTestRemoteHost !== testRemoteHost) {
    // Never mix vectors across models: a model switch invalidates the
    // in-memory index. The service re-indexes (or restores the matching
    // cached vectors) after ensure-model.
    chunkIds = [];
    chunkVectors = [];
  }
  activeModelKey = key;
  activeTestRemoteHost = testRemoteHost;
  return { modelId: spec.modelId, dims: spec.dims };
}

async function embedTexts(texts) {
  if (!extractor) throw new Error("Embedding model not loaded — call ensure-model first.");
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    // Mean pooling + normalization: ready for cosine similarity.
    const result = await extractor(batch, { pooling: "mean", normalize: true });
    const list = result.tolist();
    for (const row of list) out.push(Float32Array.from(row));
  }
  return out;
}

async function indexChunks(chunks) {
  await ensureModel(activeModelKey || DEFAULT_RAG_MODEL_KEY, { testRemoteHost: activeTestRemoteHost });
  const list = Array.isArray(chunks) ? chunks : [];
  const vectors = await embedTexts(list.map((c) => String(c?.text || "")));
  chunkIds = list.map((c) => String(c?.id || ""));
  chunkVectors = vectors;
  return { count: chunkIds.length, dims: vectors.length ? vectors[0].length : 0 };
}

async function queryTopK(text, k) {
  await ensureModel(activeModelKey || DEFAULT_RAG_MODEL_KEY, { testRemoteHost: activeTestRemoteHost });
  const spec = RAG_EMBEDDING_MODELS[activeModelKey];
  const queryText = `${spec.queryPrefix || ""}${String(text || "")}`;
  const [queryVector] = await embedTexts([queryText]);
  const limit = Math.max(1, Math.min(Number(k) || 5, chunkIds.length));
  const scored = chunkIds.map((id, i) => ({ id, score: cosineSimilarity(queryVector, chunkVectors[i]) }));
  scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
  return scored.slice(0, limit);
}

function status() {
  const spec = activeModelKey ? RAG_EMBEDDING_MODELS[activeModelKey] : null;
  return {
    ready: !!extractor,
    modelId: spec ? spec.modelId : null,
    modelKey: activeModelKey,
    dims: spec ? spec.dims : 0,
    indexedChunks: chunkIds.length
  };
}

// Serialize message handling: an async onmessage does NOT block the next
// message — without this, a "clear" (patient switch / vault lock) could run
// while an "index" is still embedding, and the late-finishing index would
// repopulate the worker with the previous patient's vectors after the clear.
// Chaining every message through one promise keeps index/clear/query atomic
// relative to each other.
let messageChain = Promise.resolve();
self.onmessage = (event) => {
  const { id, type, payload = {} } = event.data || {};
  if (id == null || !type) return;
  messageChain = messageChain.then(() => handleMessage(id, type, payload)).catch(() => {});
};

async function handleMessage(id, type, payload) {
  try {
    let value;
    if (type === "status") {
      value = status();
    } else if (type === "ensure-model") {
      value = await ensureModel(payload.modelKey, { testRemoteHost: payload.testRemoteHost || null });
    } else if (type === "index") {
      value = await indexChunks(payload.chunks);
    } else if (type === "set-vectors") {
      await ensureModel(payload.modelKey || activeModelKey || DEFAULT_RAG_MODEL_KEY);
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const buffers = Array.isArray(payload.buffers) ? payload.buffers : [];
      chunkIds = ids.map(String);
      chunkVectors = buffers.map((buf) => new Float32Array(buf));
      value = { count: chunkIds.length };
    } else if (type === "get-vectors") {
      const buffers = chunkVectors.map((v) => v.buffer.slice(0));
      value = { ids: [...chunkIds], modelKey: activeModelKey, buffers };
    } else if (type === "query") {
      value = await queryTopK(payload.text, payload.k);
    } else if (type === "clear") {
      chunkIds = [];
      chunkVectors = [];
      value = { cleared: true };
    } else {
      throw new Error(`Unknown RAG worker action: ${type}`);
    }
    self.postMessage({ id, ok: true, value });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? String(error.stack || "") : ""
    });
  }
}
