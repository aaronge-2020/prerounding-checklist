/**
 * Prototype transcription worker: Moonshine ASR via Transformers.js, WASM-only.
 *
 * Phone-first choices (mirrors the app's de-id runtime pattern):
 * - device 'wasm' (iOS Safari has no WebGPU), single thread, proxy off.
 *   The page is NOT cross-origin isolated (GitHub Pages serves no COOP/COEP
 *   on first load), so SharedArrayBuffer / multi-threaded WASM is unavailable.
 * - dtype defaults to q8 on wasm -> picks up *_quantized.onnx automatically.
 * - Models download once from Hugging Face, then live in the browser cache.
 *
 * Protocol:
 *   -> { id, action: 'load', payload: { modelId, remoteHost?, dtype? } }
 *   -> { id, action: 'transcribe', payload: { audio: Float32Array (16 kHz mono) } }
 *   -> { id, action: 'loadSpeaker', payload: { url? } }
 *   -> { id, action: 'embed', payload: { audio: Float32Array (16 kHz mono) } }
 *   <- { type: 'status'|'progress'|'loaded'|'result'|'error', id, value }
 */
import { pipeline, env } from "../../vendor/transformers/transformers.web.js";
// Full onnxruntime-web API bundle (InferenceSession/Tensor/env) for the
// speaker-embedding session. The ort-wasm-simd-threaded.mjs files are only
// Emscripten glue without the JS API.
import * as ort from "../../vendor/onnxruntime-web/ort.webgpu.bundle.min.mjs";
import { computeFbank, subtractGlobalMean, NUM_MEL_BINS } from "./speaker-fbank.js";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Vendored ort wasm: same files the app's de-id runtime uses. Set on both
// ort instances (the copy bundled inside Transformers.js and the direct
// import below for the speaker model) so neither falls back to the jsdelivr
// CDN default, which the page CSP forbids.
const ORT_MJS_URL = new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs", import.meta.url).href;
const ORT_WASM_URL = new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm", import.meta.url).href;

function configureOrtWasm(wasm) {
  if (!wasm) return false;
  wasm.wasmPaths = { mjs: ORT_MJS_URL, wasm: ORT_WASM_URL };
  wasm.proxy = false;
  // Single thread: no cross-origin isolation on first load, and kinder to a phone battery.
  wasm.numThreads = 1;
  return true;
}

// The speaker-embedding session uses its own ort instance (separate from the
// one bundled inside Transformers.js); guard in case env.wasm is not yet
// populated in this runtime — the wrapper then loads the .wasm sibling of
// the .mjs, which is equally vendored and CSP-clean.
configureOrtWasm(ort.env ? ort.env.wasm : undefined);

/** Point the Transformers.js-bundled ort at the vendored wasm (mirrors deid-service.js). */
function configureTransformersOrt() {
  const backends = env.backends;
  return configureOrtWasm(backends && backends.onnx ? backends.onnx.wasm : undefined);
}

if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs", import.meta.url).href,
    wasm: new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm", import.meta.url).href,
  };
  env.backends.onnx.wasm.proxy = false;
  // Single thread: no cross-origin isolation on first load, and kinder to a phone battery.
  env.backends.onnx.wasm.numThreads = 1;
}

let transcriber = null;
let loadedModelId = null;

// Speaker memory: a small CAM++ embedding model (ONNX, ~28 MB) that turns a
// few seconds of 16 kHz speech into a fixed-size voice embedding. Aaron
// enrolls his voice once; every later utterance is cosine-matched against the
// enrolled embedding and labeled "You" vs "Patient" — no per-encounter
// clustering, no pyannote segmentation model.
let speakerSession = null;
let speakerInputName = null;
let speakerOutputName = null;
let speakerDim = 0;

const CAMPPLUS_URL =
  "https://huggingface.co/bitsydarel/campplus-onnx/resolve/main/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx";

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (onProgress && total) onProgress(got / total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function embedAudio(audio) {
  if (!speakerSession) throw new Error("Speaker model is not loaded yet.");
  const { frames, data } = computeFbank(audio);
  if (frames < 10) throw new Error("Audio too short to embed.");
  subtractGlobalMean(data, frames);
  const feats = new ort.Tensor("float32", data, [1, frames, NUM_MEL_BINS]);
  const out = await speakerSession.run({ [speakerInputName]: feats });
  const emb = out[speakerOutputName].data;
  // L2-normalize so page-side cosine similarity is a dot product.
  let norm = 0;
  for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm) || 1;
  const v = new Float32Array(emb.length);
  for (let i = 0; i < emb.length; i++) v[i] = emb[i] / norm;
  return v;
}

self.onmessage = async (event) => {
  const { id, action, payload } = event.data || {};
  const post = (type, value) => self.postMessage({ type, id, value });
  try {
    if (action === "load") {
      const t0 = performance.now();
      if (payload.remoteHost) env.remoteHost = payload.remoteHost; // harness: local model mirror
      const ortOk = configureTransformersOrt();
      post("status", `Loading ${payload.modelId} …${ortOk ? "" : " (default ort wasm)"}`);
      transcriber = await pipeline("automatic-speech-recognition", payload.modelId, {
        device: "wasm",
        dtype: payload.dtype || "q8",
        progress_callback: (p) => post("progress", p),
      });
      loadedModelId = payload.modelId;
      post("loaded", { modelId: loadedModelId, ms: Math.round(performance.now() - t0) });
    } else if (action === "transcribe") {
      if (!transcriber) throw new Error("Transcription model is not loaded yet.");
      const t0 = performance.now();
      const audio = payload.audio;
      const out = await transcriber(audio, { sampling_rate: 16000 });
      post("result", {
        text: String((out && out.text) || "").trim(),
        ms: Math.round(performance.now() - t0),
        seconds: Math.round((audio.length / 16000) * 10) / 10,
      });
    } else if (action === "loadSpeaker") {
      const t0 = performance.now();
      const url = (payload && payload.url) || CAMPPLUS_URL;
      post("status", "Loading speaker-embedding model …");
      const bytes = await fetchBytes(url, (p) => post("progress", { progress: p, file: "campplus.onnx" }));
      speakerSession = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
      });
      speakerInputName = speakerSession.inputNames[0];
      speakerOutputName = speakerSession.outputNames[0];
      // Probe the embedding dimension with a tiny dummy run.
      const probe = await embedAudio(new Float32Array(16000));
      speakerDim = probe.length;
      post("loaded", { kind: "speaker", dim: speakerDim, ms: Math.round(performance.now() - t0) });
    } else if (action === "embed") {
      const t0 = performance.now();
      const emb = await embedAudio(payload.audio);
      post("result", {
        kind: "embedding",
        embedding: Array.from(emb),
        ms: Math.round(performance.now() - t0),
        seconds: Math.round((payload.audio.length / 16000) * 10) / 10,
      });
    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    post("error", err && err.message ? err.message : String(err));
  }
};
