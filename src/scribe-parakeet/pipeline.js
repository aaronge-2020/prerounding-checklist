/**
 * pipeline.js — main-thread pipeline for the Parakeet 0.6B on-device scribe
 * (scribe-parakeet.html).
 *
 * Owns the browser side of the inference contract implemented by
 * parakeet-worker.js (classic worker, message API):
 *   {type:'init', files, preferWebGPU:true} -> {type:'initProgress', stage, done, total, label}*
 *                                             {type:'ready', info}
 *   {type:'vad', id, pcm}                   -> {type:'vadResult', id, segments:[{start,end}]}
 *   {type:'transcribe', id, pcm}            -> {type:'transcribeProgress', id, framesDone, framesTotal}*
 *                                             {type:'transcribeResult', id, text, tokens:[{id,start,end}], audioSec}
 *   {type:'embed', id, pcm}                 -> {type:'embedResult', id, embedding} (Float32, L2-normed)
 *   {type:'ping', id?}                      -> {type:'pong', id, hasSessions}
 *   failures                                -> {type:'error', id?, fatal, message}
 *
 * Recording is always 16 kHz mono: `new AudioContext({sampleRate:16000})` is
 * mandatory so the worker's models (nemo128 frontend, Silero VAD, WeSpeaker)
 * receive the sample rate they were built for. Capture runs through an
 * inline AudioWorklet (Blob URL, no separate worklet file).
 *
 * Privacy: the ONLY localStorage write in this module is the enrollment
 * voiceprint under ENROLL_KEY. Audio and transcripts stay in memory.
 *
 * The pure math / chunking helpers at the bottom are exported for unit tests
 * and make no browser calls. This module has no top-level browser-only
 * references, so it imports cleanly under node for contract tests.
 */

import {
  getModelStatus,
  downloadModels,
  loadModelFiles,
} from './model-manager.js';

export const SAMPLE_RATE = 16000;
export const MAX_REC_SECONDS = 10 * 60; // 10-minute recording cap
export const ENROLL_SECONDS = 12; // enrollment sample length
export const SPEAKER_SIM_THRESHOLD = 0.45; // cosine >= threshold -> 'you'
export const ENROLL_KEY = 'scribeParakeet.enrolledEmbedding.v1';
export const VAD_PAD_SEC = 0.25; // pipeline-side padding around VAD segments
export const CHUNK_GAP_SEC = 1; // split transcription chunks at gaps >= 1s
export const MAX_CHUNK_SEC = 90; // worker 'transcribe' hard limit
export const MIN_ENROLL_SPEECH_SEC = 1.0; // VAD gate for enrollment
export const MAX_ENROLL_SEGMENTS = 6; // embed at most this many VAD segments

// ---------------------------------------------------------------------------
// worker client
// ---------------------------------------------------------------------------

let nextMsgId = 1;

/**
 * Promise-based wrapper around a parakeet-worker.js message port.
 * `worker` is any object with postMessage(msg, transfer?) and an assignable
 * onmessage handler (a real Worker, or a stub in tests).
 */
export function createWorkerClient(worker) {
  const pending = new Map(); // id -> {resolve, reject}
  const progressHandlers = new Map(); // id -> fn
  let fatalError = null;

  worker.onmessage = (ev) => {
    const msg = (ev && ev.data) || {};
    if (msg.type === 'transcribeProgress' || msg.type === 'initProgress') {
      const h = progressHandlers.get(msg.id);
      if (h) {
        try { h(msg); } catch { /* listener errors must not break dispatch */ }
      }
      return;
    }
    if (msg.type === 'error') {
      const entry = msg.id != null ? pending.get(msg.id) : null;
      const err = new Error(String(msg.message || 'worker error'));
      err.code = 'worker-error';
      err.fatal = !!msg.fatal;
      if (entry) {
        pending.delete(msg.id);
        progressHandlers.delete(msg.id);
        entry.reject(err);
      } else if (msg.fatal) {
        fatalError = err;
        for (const [, e] of pending) e.reject(err);
        pending.clear();
        progressHandlers.clear();
      }
      return;
    }
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      if (msg.type !== 'transcribeResult') progressHandlers.delete(msg.id);
      entry.resolve(msg);
    }
  };

  // A worker that dies during importScripts, throws outside a handler, or is
  // OOM-killed never posts a message; without this, init() would hang forever
  // with no error surfaced to the page.
  const onWorkerError = (ev) => {
    const detail = ev && (ev.message || (ev.error && ev.error.message)) || 'unknown worker error';
    const err = new Error(`Transcription engine worker failed: ${detail}`);
    err.code = 'worker-error';
    err.fatal = true;
    fatalError = fatalError || err;
    for (const [, e] of pending) e.reject(err);
    pending.clear();
    progressHandlers.clear();
  };
  try {
    worker.onerror = onWorkerError;
    worker.onmessageerror = onWorkerError;
  } catch {
    // ignore: stub workers in tests may not accept handler assignment
  }

  function call(type, payload, { transfer, onProgress } = {}) {
    if (fatalError) return Promise.reject(fatalError);
    const id = nextMsgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      if (onProgress) progressHandlers.set(id, onProgress);
      try {
        worker.postMessage({ type, id, ...payload }, transfer || []);
      } catch (e) {
        pending.delete(id);
        progressHandlers.delete(id);
        reject(e);
      }
    });
  }

  return {
    /**
     * files: {frontend, encoder, joint, vad, wespeaker} ArrayBuffers + {vocab} string.
     * The model ArrayBuffers are TRANSFERRED (zero-copy): after init() returns,
     * the caller's copies are neutered. onProgress receives the worker's
     * {type:'initProgress'} messages while sessions are being created.
     */
    init(files, preferWebGPU = true, onProgress) {
      // files[k] are already ArrayBuffers (from Blob.arrayBuffer()): transfer
      // the buffers themselves. (A previous revision mapped files[k].buffer,
      // which is undefined on an ArrayBuffer, silently producing an empty
      // transfer list — so the ~689MB of models were structured-cloned
      // instead of transferred, spiking memory ~3x and stalling boot.)
      const transfer = ['frontend', 'encoder', 'joint', 'vad', 'wespeaker']
        .map((k) => files[k])
        .filter((b) => b instanceof ArrayBuffer);
      return call('init', { files, preferWebGPU }, { transfer, onProgress });
    },
    /** pcm: Float32Array @16kHz. Resolves {type:'vadResult', id, segments:[{start,end}]}. */
    vad(pcm) {
      const buf = pcm.buffer.slice(0);
      return call('vad', { pcm: buf }, { transfer: [buf] });
    },
    /**
     * pcm: Float32Array @16kHz, <= 90s. onProgress receives
     * {type:'transcribeProgress', id, framesDone, framesTotal}.
     * Resolves {type:'transcribeResult', id, text, tokens, audioSec, frameShiftMs}.
     */
    transcribe(pcm, onProgress) {
      const buf = pcm.buffer.slice(0);
      return call('transcribe', { pcm: buf }, { transfer: [buf], onProgress });
    },
    /** pcm: Float32Array @16kHz. Resolves {type:'embedResult', id, embedding:ArrayBuffer}. */
    embed(pcm) {
      const buf = pcm.buffer.slice(0);
      return call('embed', { pcm: buf }, { transfer: [buf] });
    },
    ping() {
      return call('ping', {});
    },
    dispose() {
      for (const [, e] of pending) e.reject(new Error('worker disposed'));
      pending.clear();
      progressHandlers.clear();
      try { worker.terminate(); } catch { /* stub workers may not terminate */ }
    },
  };
}

// ---------------------------------------------------------------------------
// pipeline lifecycle
// ---------------------------------------------------------------------------

/** Browser capability check. Returns a list of missing capabilities (empty = OK). */
export function checkBrowserSupport() {
  const missing = [];
  try {
    if (typeof Worker === 'undefined') missing.push('Web Worker');
    const AC = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) missing.push('Web Audio (AudioContext)');
    else if (!('audioWorklet' in AC.prototype)) missing.push('AudioWorklet');
    if (typeof indexedDB === 'undefined') missing.push('IndexedDB');
    if (typeof WebAssembly === 'undefined') missing.push('WebAssembly');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      missing.push('getUserMedia');
    }
  } catch {
    missing.push('feature detection');
  }
  return missing;
}

function pipelineError(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

/** Race a promise against a timeout; rejects with {code:'worker-init-timeout'}. */
function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(pipelineError('worker-init-timeout', message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Boot the pipeline: capability check -> model cache status -> load files ->
 * transfer to worker -> session creation -> ready.
 *
 * Reports stages via onProgress: 'support', 'status', 'load' (per file:
 * {name, bytes, filesDone, fileCount}), 'transfer', 'sessions'
 * ({done, total, label} as each network finishes loading), 'ready'.
 *
 * Throws {code:'unsupported-browser'}, {code:'models-not-cached', status},
 * {code:'worker-init-failed'}, or {code:'worker-init-timeout'} (no response
 * from the worker within opts.bootTimeoutMs, default 12 minutes).
 *
 * opts: {workerFactory, checkBrowserSupport, getModelStatus, loadModelFiles,
 *        bootTimeoutMs} — injectable for tests.
 */
export async function initPipeline(onProgress, opts = {}) {
  const report = (stage, detail) => {
    try { onProgress?.({ stage, ...detail }); } catch { /* ignore */ }
  };
  const checkSupport = opts.checkBrowserSupport || checkBrowserSupport;
  const getStatus = opts.getModelStatus || getModelStatus;
  const loadFiles = opts.loadModelFiles || loadModelFiles;
  const bootTimeoutMs = opts.bootTimeoutMs ?? 12 * 60 * 1000;
  report('support');
  const missing = checkSupport();
  if (missing.length) {
    throw pipelineError(
      'unsupported-browser',
      `This browser is missing: ${missing.join(', ')}.`,
      { missing }
    );
  }
  report('status');
  const status = await getStatus();
  const allCached = status.length > 0 && status.every((s) => s.cached);
  if (!allCached) {
    throw pipelineError('models-not-cached', 'Model files are not downloaded yet.', { status });
  }
  report('load');
  const files = await loadFiles((f) => report('load', {
    name: f.name, bytes: f.bytes, filesDone: f.filesDone, fileCount: f.fileCount,
  }));
  report('transfer');
  const worker = opts.workerFactory
    ? opts.workerFactory()
    : new Worker(new URL('./parakeet-worker.js', import.meta.url));
  const client = createWorkerClient(worker);
  report('sessions');
  let ready;
  try {
    ready = await withTimeout(
      client.init(files, true, (p) => {
        if (p && p.type === 'initProgress') {
          report('sessions', { done: p.done, total: p.total, label: p.label });
        }
      }),
      bootTimeoutMs,
      `Transcription engine start timed out after ` +
      `${Math.max(1, Math.round(bootTimeoutMs / 60000))} minute(s) with no response ` +
      `from the engine worker. The 652 MB model may be too large for this browser ` +
      `tab — close other tabs and retry, or use Chrome/Edge with hardware ` +
      `acceleration enabled.`
    );
  } catch (e) {
    try { client.dispose(); } catch { /* ignore */ }
    if (e && e.code === 'worker-init-timeout') throw e;
    throw pipelineError('worker-init-failed', `Transcription engine failed to start: ${e.message}`, { cause: e });
  }
  if (!ready || ready.type !== 'ready') {
    try { client.dispose(); } catch { /* ignore */ }
    throw pipelineError('worker-init-failed', 'Transcription engine did not report ready.');
  }
  report('ready', { info: ready.info });
  return { client, info: ready.info, status };
}

/** Thin re-export so the page downloads through one module. */
export { downloadModels, getModelStatus };

// ---------------------------------------------------------------------------
// capture (AudioWorklet, inline via Blob URL)
// ---------------------------------------------------------------------------

const WORKLET_SRC = `
class SpCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs && inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('sp-capture', SpCaptureProcessor);
`;

let activeCapture = null;

export function isRecording() {
  return !!activeCapture;
}

async function startCapture({ onLevel, maxSeconds, onCap }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    throw pipelineError(
      denied ? 'mic-denied' : 'mic-error',
      denied
        ? 'Microphone access was denied. Allow microphone access and retry.'
        : `Microphone error: ${e?.message || e}`
    );
  }
  // Mandatory 16 kHz context: the models expect 16 kHz input.
  const AC = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
  const ctx = new AC({ sampleRate: SAMPLE_RATE });
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'sp-capture');
  // Keep the graph alive without feedback: zero-gain node to destination.
  const keepAlive = ctx.createGain();
  keepAlive.gain.value = 0;
  src.connect(node);
  node.connect(keepAlive);
  keepAlive.connect(ctx.destination);

  const chunks = [];
  let total = 0;
  let capped = false;
  const maxSamples = Math.round(maxSeconds * SAMPLE_RATE);
  node.port.onmessage = (ev) => {
    if (capped) return;
    const d = ev.data;
    if (!(d instanceof Float32Array) || !d.length) return;
    chunks.push(d);
    total += d.length;
    if (onLevel) {
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      try { onLevel(Math.sqrt(s / d.length)); } catch { /* ignore */ }
    }
    if (total >= maxSamples) {
      capped = true;
      try { onCap?.(); } catch { /* ignore */ }
    }
  };

  let finished = false;
  const teardown = () => {
    try { node.disconnect(); } catch { /* ignore */ }
    try { src.disconnect(); } catch { /* ignore */ }
    try { keepAlive.disconnect(); } catch { /* ignore */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { ctx.close(); } catch { /* ignore */ }
  };

  return {
    finish() {
      if (finished) throw pipelineError('not-recording', 'No active recording.');
      finished = true;
      teardown();
      const n = Math.min(total, maxSamples);
      const out = new Float32Array(n);
      let off = 0;
      for (const c of chunks) {
        if (off >= n) break;
        const take = Math.min(c.length, n - off);
        out.set(c.subarray(0, take), off);
        off += take;
      }
      return out;
    },
    abort() {
      if (finished) return;
      finished = true;
      teardown();
    },
  };
}

/**
 * Start a bounded recording. hooks: {onLevel(rms01), onCap()}.
 * onCap fires when the 10-minute cap is reached; the app should then call
 * stopRecording() to process what was captured.
 */
export async function startRecording(hooks = {}) {
  if (activeCapture) throw pipelineError('already-recording', 'A recording is already in progress.');
  const handle = await startCapture({
    onLevel: hooks.onLevel,
    maxSeconds: MAX_REC_SECONDS,
    onCap: hooks.onCap,
  });
  activeCapture = handle;
  return { startedAt: Date.now() };
}

/** Discard the active recording without processing. */
export function cancelRecording() {
  if (activeCapture) {
    activeCapture.abort();
    activeCapture = null;
  }
}

/**
 * Record a fixed-length sample (default 12 s) for voice enrollment.
 * Returns Float32Array @16kHz.
 */
export async function captureSample(seconds = ENROLL_SECONDS, hooks = {}) {
  const handle = await startCapture({ onLevel: hooks.onLevel, maxSeconds: seconds });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return handle.finish();
}

// ---------------------------------------------------------------------------
// enrollment (the only localStorage write in this module)
// ---------------------------------------------------------------------------

/**
 * VAD-gate the sample, embed the speech segments, mean-pool, L2-normalize,
 * and persist the voiceprint. Returns {dim, segments, speechSec}.
 * Throws {code:'insufficient-speech'} when the sample has no usable speech.
 */
export async function enrollVoice(pcm, client, onProgress) {
  const report = (detail) => { try { onProgress?.(detail); } catch { /* ignore */ } };
  report({ stage: 'vad' });
  const vadRes = await client.vad(pcm);
  const segs = (vadRes.segments || []).filter((s) => s.end > s.start);
  const speechSec = segs.reduce((a, s) => a + (s.end - s.start), 0);
  if (speechSec < MIN_ENROLL_SPEECH_SEC) {
    throw pipelineError(
      'insufficient-speech',
      'No speech detected in the sample. Record in a quieter spot, closer to the microphone, and try again.'
    );
  }
  const vecs = [];
  const todo = segs.slice(0, MAX_ENROLL_SEGMENTS);
  for (let i = 0; i < todo.length; i++) {
    const slice = extractSlice(pcm, todo[i].start, todo[i].end);
    if (slice.length < 0.25 * SAMPLE_RATE) continue;
    const r = await client.embed(slice);
    vecs.push(new Float32Array(r.embedding));
    report({ stage: 'embed', done: i + 1, total: todo.length });
  }
  if (!vecs.length) {
    throw pipelineError('insufficient-speech', 'No speech segment was long enough to enroll.');
  }
  const voiceprint = l2Normalize(meanPool(vecs));
  const payload = JSON.stringify({
    v: 1,
    dim: voiceprint.length,
    embedding: embeddingToBase64(voiceprint),
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(ENROLL_KEY, payload);
  return { dim: voiceprint.length, segments: vecs.length, speechSec };
}

/** Returns {embedding: Float32Array, dim, createdAt} or null. */
export function getEnrolled() {
  try {
    const raw = localStorage.getItem(ENROLL_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.embedding !== 'string' || !obj.dim) return null;
    return {
      embedding: base64ToEmbedding(obj.embedding, obj.dim),
      dim: obj.dim,
      createdAt: obj.createdAt || null,
    };
  } catch {
    return null;
  }
}

export function clearEnrolled() {
  try { localStorage.removeItem(ENROLL_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// stop -> VAD -> chunk -> transcribe -> diarize
// ---------------------------------------------------------------------------

/**
 * Finish the active recording and run the full pipeline.
 * Returns {segments:[{speaker, score, text, start, end, tokens}], audioSec}.
 * speaker is 'you' | 'patient' | 'speaker' ('speaker' when not enrolled).
 */
export async function stopRecording(client, onProgress) {
  if (!activeCapture) throw pipelineError('not-recording', 'No active recording.');
  const pcm = activeCapture.finish();
  activeCapture = null;
  const report = (detail) => { try { onProgress?.(detail); } catch { /* ignore */ } };
  const audioSec = pcm.length / SAMPLE_RATE;
  if (audioSec < 0.5) return { segments: [], audioSec };

  report({ stage: 'vad' });
  const vadRes = await client.vad(pcm);
  const segs = (vadRes.segments || []).filter((s) => s.end > s.start);
  if (!segs.length) return { segments: [], audioSec };

  const chunks = planChunks(segs, audioSec);
  const enrolled = getEnrolled();
  const segments = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    report({ stage: 'transcribe', chunkIndex: ci, chunkCount: chunks.length });
    const pcmT = extractSlice(pcm, chunk.start, chunk.end);
    const res = await client.transcribe(pcmT, (p) => report({
      stage: 'transcribe',
      chunkIndex: ci,
      chunkCount: chunks.length,
      framesDone: p.framesDone,
      framesTotal: p.framesTotal,
    }));
    // Token timestamps are chunk-relative; shift to recording-relative.
    const tokens = (res.tokens || []).map((t) => ({
      id: t.id,
      start: t.start + chunk.start,
      end: t.end + chunk.start,
    }));
    let speaker = 'speaker';
    let score = null;
    if (enrolled) {
      const pcmE = extractSlice(pcm, chunk.start, chunk.end);
      const emb = await client.embed(pcmE);
      score = cosineSimilarity(new Float32Array(emb.embedding), enrolled.embedding);
      speaker = score >= SPEAKER_SIM_THRESHOLD ? 'you' : 'patient';
    }
    segments.push({
      speaker,
      score,
      text: res.text || '',
      start: chunk.start,
      end: chunk.end,
      tokens,
    });
  }
  return { segments, audioSec };
}

// ---------------------------------------------------------------------------
// pure helpers (unit-testable, no browser calls)
// ---------------------------------------------------------------------------

/** Copy pcm[startSec, endSec) into a new Float32Array (clamped). */
export function extractSlice(pcm, startSec, endSec) {
  const s = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const e = Math.min(pcm.length, Math.ceil(endSec * SAMPLE_RATE));
  return pcm.slice(s, Math.max(s, e));
}

/** Cosine similarity of two equal-length vectors. */
export function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Return a new L2-normalized copy. */
export function l2Normalize(vec) {
  const out = Float32Array.from(vec);
  let n = 0;
  for (let i = 0; i < out.length; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

/** Element-wise mean of equal-length vectors. */
export function meanPool(vecs) {
  if (!vecs.length) throw new Error('meanPool: empty');
  const dim = vecs[0].length;
  const out = new Float32Array(dim);
  for (const v of vecs) {
    if (v.length !== dim) throw new Error('meanPool: dimension mismatch');
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vecs.length;
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
      (i + 2 < bytes.length ? B64[b2 & 63] : '=');
  }
  return s;
}

function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c = (ch) => (ch === '=' ? 0 : B64.indexOf(ch));
    const v0 = c(clean[i]), v1 = c(clean[i + 1]), v2 = c(clean[i + 2]), v3 = c(clean[i + 3]);
    out.push((v0 << 2) | (v1 >> 4));
    if (clean[i + 2] !== '=') out.push(((v1 & 15) << 4) | (v2 >> 2));
    if (clean[i + 3] !== '=') out.push(((v2 & 3) << 6) | v3);
  }
  return new Uint8Array(out);
}

/** Float32Array -> base64 of its raw bytes (works in browser and node). */
export function embeddingToBase64(vec) {
  const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  return bytesToBase64(bytes);
}

/** base64 -> Float32Array of length dim. */
export function base64ToEmbedding(b64, dim) {
  const bytes = base64ToBytes(b64);
  const expected = dim * 4;
  if (bytes.length < expected) throw new Error('base64ToEmbedding: truncated');
  const out = new Float32Array(dim);
  const view = new DataView(bytes.buffer, bytes.byteOffset, expected);
  for (let i = 0; i < dim; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/**
 * Speaker label for a chunk embedding. hasEnrollment=false -> 'speaker'.
 * Otherwise cosine >= SPEAKER_SIM_THRESHOLD -> 'you', else 'patient'.
 */
export function assignSpeaker(score, hasEnrollment) {
  if (!hasEnrollment) return { label: 'speaker', score: null };
  return { label: score >= SPEAKER_SIM_THRESHOLD ? 'you' : 'patient', score };
}

/** Pad a {start,end} segment by padSec each side, clamped to [0, totalSec]. */
export function padSegment(seg, padSec, totalSec) {
  return {
    start: Math.max(0, seg.start - padSec),
    end: Math.min(totalSec, seg.end + padSec),
  };
}

/**
 * Group VAD segments (seconds) into transcription chunks: consecutive
 * segments separated by gaps < CHUNK_GAP_SEC merge; chunks never exceed
 * MAX_CHUNK_SEC (a long run is windowed). Each chunk is
 * {start, end, segs:[{start,end}]} with chunk-relative tokens shifted by
 * `start` when transcribing.
 */
export function planChunks(segments, totalSec, opts = {}) {
  const padSec = opts.padSec ?? VAD_PAD_SEC;
  const gapSec = opts.gapSec ?? CHUNK_GAP_SEC;
  const maxSec = opts.maxSec ?? MAX_CHUNK_SEC;
  const padded = segments
    .filter((s) => s.end > s.start)
    .map((s) => padSegment(s, padSec, totalSec))
    .sort((a, b) => a.start - b.start);
  // merge overlaps created by padding
  const merged = [];
  for (const s of padded) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const chunks = [];
  let cur = null;
  const push = () => { if (cur) { chunks.push(cur); cur = null; } };
  for (const s of merged) {
    const gap = cur ? s.start - cur.end : Infinity;
    if (!cur || gap >= gapSec || s.end - cur.start > maxSec) {
      push();
      cur = { start: s.start, end: s.end, segs: [s] };
    } else {
      cur.end = Math.max(cur.end, s.end);
      cur.segs.push(s);
    }
  }
  push();
  // window any chunk still longer than maxSec (a single >90s speech run)
  const out = [];
  for (const c of chunks) {
    if (c.end - c.start <= maxSec) { out.push(c); continue; }
    let wStart = c.start;
    while (wStart < c.end) {
      const wEnd = Math.min(c.end, wStart + maxSec);
      out.push({
        start: wStart,
        end: wEnd,
        segs: c.segs.filter((s) => s.start < wEnd && s.end > wStart),
      });
      wStart = wEnd;
    }
  }
  return out;
}

/** Seconds -> "m:ss". */
export function formatTimestamp(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
