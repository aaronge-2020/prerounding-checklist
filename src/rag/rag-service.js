// Chart-grounded RAG service (main thread): owns the embedding worker
// lifecycle and the per-patient IndexedDB vector cache.
//
// Usage:
//   const chunks = chunkChartPieces(piecesWithRawText);
//   await ensureChartIndex({ patientId, pieces });   // chunk -> embed -> cache
//   const hits = await retrieveChartChunks({ patientId, pieces, query, k });
//   // hits: [{ id, pieceId, label, group, text, score, n }]
//
// The index rebuilds lazily: the chunk set is hashed, and the cached
// vectors are reused when the hash (and embedding model) match — so chart
// edits rebuild the index on the next retrieval, never redundantly.
//
// PHI note: chunk texts and vectors live in memory and in the
// browser-local IndexedDB cache only. Nothing leaves the device; the
// retrieved chunks are handed to the caller's de-identification review
// gate before any network send. The vectors are derived from raw chart
// text, so the vault-lock boundary should clear them: wire
// clearPatientIndex(patientId) into the same lock path that clears
// in-memory patient state (the store is keyed per patient ID).

import { chunkChartPieces, hashChunkSet } from "./chart-chunks.js";
import { DEFAULT_RAG_MODEL_KEY, RAG_EMBEDDING_MODELS, RAG_WORKER_VERSION } from "./rag-models.js";

export const RAG_INDEX_DB_NAME = "preround-rag-index";
export const RAG_INDEX_STORE = "chart-indexes";
export const RAG_MODEL_KEY = DEFAULT_RAG_MODEL_KEY;

const WORKER_URL = new URL("./rag-worker.js", import.meta.url);

let worker = null;
let nextCallId = 1;
const pendingCalls = new Map();
// Patient ids whose chart vectors are (or were, this session) indexed.
// The worker holds one patient's vectors at a time; the IndexedDB cache is
// keyed per patient so one patient's vectors are never read back under
// another patient's id.
const indexedPatientIds = new Set();
// Serialize multi-step service operations (index, query, clear) through one
// queue. The worker serializes its own messages, but service operations span
// multiple worker calls plus IndexedDB writes — without this, a patient
// switch or vault lock could interleave with an in-flight ensure+query and
// leave one patient's vectors readable under another patient's id.
let serviceQueue = Promise.resolve();
function enqueueServiceOperation(operation) {
  const run = serviceQueue.then(operation, operation);
  // The queue itself never rejects; callers get their own promise.
  serviceQueue = run.catch(() => {});
  return run;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(`${WORKER_URL.href}?v=${RAG_WORKER_VERSION}`, { type: "module" });
    worker.onmessage = (event) => {
      const { id, ok, value, error, stack } = event.data || {};
      const pending = pendingCalls.get(id);
      if (!pending) return;
      pendingCalls.delete(id);
      if (ok) pending.resolve(value);
      else {
        const err = new Error(String(error || "RAG worker failed."));
        if (stack) err.stack = `${err.stack}\nworker stack: ${stack}`;
        pending.reject(err);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(`RAG embedding worker error: ${event?.message || "unknown"}`);
      for (const pending of pendingCalls.values()) pending.reject(error);
      pendingCalls.clear();
    };
  }
  return worker;
}

export function callRagWorker(type, payload) {
  const w = getWorker();
  const id = nextCallId++;
  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

export async function getRagStatus() {
  try {
    const status = await callRagWorker("status", {});
    return { ...status, workerAlive: true };
  } catch (error) {
    return { ready: false, workerAlive: false, error: error?.message || String(error) };
  }
}

// --- IndexedDB vector cache -------------------------------------------

function openIndexDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RAG_INDEX_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(RAG_INDEX_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the RAG index database."));
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RAG_INDEX_STORE, "readonly");
    const request = tx.objectStore(RAG_INDEX_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("RAG index read failed."));
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RAG_INDEX_STORE, "readwrite");
    tx.objectStore(RAG_INDEX_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("RAG index write failed."));
  });
}

async function _clearPatientIndex(patientId) {
  const db = await openIndexDb();
  indexedPatientIds.delete(String(patientId || "unknown"));
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RAG_INDEX_STORE, "readwrite");
    tx.objectStore(RAG_INDEX_STORE).delete(`patient:${patientId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("RAG index delete failed."));
  });
}

// Drop the in-memory worker index without touching the IndexedDB cache.
// Used on patient switch: the next retrieval re-indexes for the new
// patient, so stale vectors can never leak across patients. Never creates
// the worker just to clear it.
async function _clearRagWorkerMemory() {
  if (!worker) return;
  await callRagWorker("clear", {});
}

// Vault-lock cleanup: drop the in-memory worker vectors AND every cached
// chart index in IndexedDB, then forget which patients were indexed.
// Called from clearSensitiveSession (vault lock / vault deletion). Never
// throws — lock must not fail because cleanup did.
async function _clearAllRagIndexes() {
  try {
    if (worker) await callRagWorker("clear", {});
  } catch {
    // Worker teardown is best-effort during lock.
  }
  try {
    const db = await openIndexDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RAG_INDEX_STORE, "readwrite");
      tx.objectStore(RAG_INDEX_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("RAG index clear failed."));
    });
  } catch {
    // IndexedDB cleanup is best-effort during lock.
  }
  indexedPatientIds.clear();
}

// --- Index lifecycle ---------------------------------------------------

function chunkIndexKey(patientId) {
  return `patient:${String(patientId || "unknown")}`;
}

// Build (or reuse) the embedding index for this patient's chart pieces.
// pieces: [{ id, label, group, rawText }]. Returns { chunkCount, dims,
// modelId, reused }.
//
// allowDownload: the embedding model downloads ONLY on the explicit user
// tap (the one-tap "Download chart-search model" affordance). Every other
// caller — ordinary chat, status probes, index warming — passes false and
// fails closed with { modelNotReady: true } when the model isn't already
// loaded, instead of triggering a download.
//
// testRemoteHost is a test/dev override: redirect the model file host
// (e.g. a local server in offline compat runs). Production callers omit it.
async function _ensureChartIndex({ patientId, pieces, testRemoteHost = null, allowDownload = false }) {
  const chunks = chunkChartPieces(pieces || []);
  if (!chunks.length) {
    await callRagWorker("clear", {});
    return { chunkCount: 0, dims: 0, modelId: null, reused: false, chunks: [] };
  }
  if (!allowDownload) {
    // Probe only — creating the worker is free, but ensure-model (the
    // download) is off-limits on this path.
    const status = await callRagWorker("status", {}).catch(() => ({ ready: false }));
    if (!status || status.ready !== true) {
      return { chunkCount: 0, dims: 0, modelId: null, reused: false, chunks: [], modelNotReady: true };
    }
  }
  const contentHash = hashChunkSet(chunks);
  const modelKey = RAG_MODEL_KEY;
  const modelId = RAG_EMBEDDING_MODELS[modelKey].modelId;
  const key = chunkIndexKey(patientId);

  const db = await openIndexDb();
  const cached = await idbGet(db, key).catch(() => null);
  if (
    cached &&
    cached.contentHash === contentHash &&
    cached.modelKey === modelKey &&
    Array.isArray(cached.ids) &&
    Array.isArray(cached.buffers) &&
    cached.ids.length === chunks.length
  ) {
    // Cache hit: restore vectors into the worker without re-embedding.
    await callRagWorker("set-vectors", {
      modelKey,
      ids: cached.ids,
      buffers: cached.buffers.map((buf) => buf.slice(0))
    });
    indexedPatientIds.add(String(patientId || "unknown"));
    return { chunkCount: chunks.length, dims: RAG_EMBEDDING_MODELS[modelKey].dims, modelId, reused: true, chunks };
  }

  // Cache miss: embed in the worker, then persist the vectors.
  await callRagWorker("ensure-model", {
    modelKey,
    ...(testRemoteHost ? { testRemoteHost } : {})
  });
  const indexed = await callRagWorker("index", {
    chunks: chunks.map((c) => ({ id: c.id, text: c.text }))
  });
  const exported = await callRagWorker("get-vectors", {});
  await idbPut(db, key, {
    version: 1,
    contentHash,
    modelKey,
    ids: exported.ids,
    buffers: exported.buffers
  }).catch(() => {
    // A failed cache write must not fail the retrieval; the in-memory
    // worker index is still valid for this session.
  });
  indexedPatientIds.add(String(patientId || "unknown"));
  return { chunkCount: indexed.count, dims: indexed.dims, modelId, reused: false, chunks };
}

// Retrieve the top-k chart chunks for a query. Ensures the index first
// (rebuilding only when the chart changed). Returns chunks numbered [C1..]
// in score order: [{ n, id, pieceId, label, group, text, score }].
// Never downloads the embedding model: with allowDownload false (the only
// value ordinary chat uses), a cold worker yields [] and the caller falls
// back to the selected chart pieces.
async function _retrieveChartChunks({ patientId, pieces, query, k = 6, testRemoteHost = null, allowDownload = false }) {
  const question = String(query || "").trim();
  if (!question) return [];
  const { chunks, modelNotReady } = await _ensureChartIndex({ patientId, pieces, testRemoteHost, allowDownload });
  if (modelNotReady || !chunks.length) return [];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const hits = await callRagWorker("query", { text: question, k });
  return hits
    .map((hit, rank) => {
      const chunk = byId.get(hit.id);
      if (!chunk) return null;
      return {
        n: rank + 1,
        id: chunk.id,
        pieceId: chunk.pieceId,
        label: chunk.label,
        group: chunk.group,
        text: chunk.text,
        score: hit.score
      };
    })
    .filter(Boolean);
}

// --- Queued public API ---------------------------------------------------
// Every public operation runs through the service queue so index, query,
// and clear operations are atomic relative to each other. Internal helpers
// (prefixed _) do the real work without re-entering the queue.
//
// Explicit-download-only rule, enforced here (not left to callers):
// ensureChartIndex is the ONE route that may download the embedding model
// (it runs only from the explicit one-tap download affordance).
// retrieveChartChunks never downloads — a cold worker returns [].

export function ensureChartIndex(args) {
  return enqueueServiceOperation(() => _ensureChartIndex({ ...(args || {}), allowDownload: true }));
}

export function retrieveChartChunks(args) {
  return enqueueServiceOperation(() => _retrieveChartChunks({ ...(args || {}), allowDownload: false }));
}

export function warmChartIndex(args) {
  // Best-effort pre-build of the current patient's embedding index so the
  // first chat doesn't wait. Never downloads: on a cold worker the status
  // probe fails closed and the warm is skipped.
  return enqueueServiceOperation(() => _ensureChartIndex({ ...(args || {}), allowDownload: false }));
}

export function clearPatientIndex(patientId) {
  // Queued like every other index mutation: a per-patient cache delete
  // must not interleave with an in-flight index/query for that patient.
  return enqueueServiceOperation(() => _clearPatientIndex(patientId));
}

export function clearRagWorkerMemory() {
  return enqueueServiceOperation(() => _clearRagWorkerMemory());
}

export function clearAllRagIndexes() {
  return enqueueServiceOperation(() => _clearAllRagIndexes());
}
