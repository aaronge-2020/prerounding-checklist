/**
 * model-manager.js — IndexedDB model cache + chunked downloader for the
 * Parakeet 0.6B on-device scribe (scribe-parakeet).
 *
 * ES module for the page (main thread). The worker (parakeet-worker.js) does
 * NOT use this module; the page hands it decoded files via the 'init' message.
 *
 * Network policy: fetches go only to Hugging Face (the manifest URLs) or to
 * the ?modelBase=<url> override (local testing), plus same-origin. No
 * analytics, no other hosts.
 *
 * Storage notes: large ONNX files are stored as 64MB chunks (one IDB record
 * per chunk plus a manifest record), which also suits mobile browsers with
 * small per-value limits. The chunk layout is internal — the exported API
 * is unchanged.
 */

export const DB_NAME = 'scribe-parakeet';
export const DB_STORE = 'models';
export const DB_VERSION = 1;

/** Max bytes per IDB chunk record. */
export const CHUNK_BYTES = 64 * 1024 * 1024;

// Verified 2026-09-29 via the Hugging Face API (siblings listing + x-linked-size).
// istupakov/parakeet-tdt-0.6b-v2-onnx            CC-BY-4.0
// onnx-community/wespeaker-voxceleb-resnet34-LM  CC-BY-4.0  (fp32 ONLY —
//   the int8/model_quantized variants fail in ORT Web: ConvInteger(10) has no
//   implementation on WASM or WebGPU EPs)
// christopherthompson81/sortformer_parakeet_onnx  silero_vad.onnx, MIT (Silero)
const HF = 'https://huggingface.co';
export const MODEL_MANIFEST = [
  {
    name: 'frontend',
    url: `${HF}/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/nemo128.onnx`,
    bytes: 139764,
    kind: 'onnx',
    license: 'CC-BY-4.0',
    label: 'NeMo mel frontend (nemo128)',
  },
  {
    name: 'encoder',
    url: `${HF}/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.int8.onnx`,
    bytes: 652184014,
    kind: 'onnx',
    license: 'CC-BY-4.0',
    label: 'Parakeet TDT 0.6B encoder (int8)',
  },
  {
    name: 'joint',
    url: `${HF}/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/decoder_joint-model.int8.onnx`,
    bytes: 8998286,
    kind: 'onnx',
    license: 'CC-BY-4.0',
    label: 'Parakeet TDT decoder+joint (int8)',
  },
  {
    name: 'vad',
    url: `${HF}/christopherthompson81/sortformer_parakeet_onnx/resolve/main/silero_vad.onnx`,
    bytes: 1280185,
    kind: 'onnx',
    license: 'MIT (Silero)',
    label: 'Silero VAD',
  },
  {
    name: 'wespeaker',
    url: `${HF}/onnx-community/wespeaker-voxceleb-resnet34-LM/resolve/main/onnx/model.onnx`,
    bytes: 26535549,
    kind: 'onnx',
    license: 'CC-BY-4.0',
    label: 'WeSpeaker ResNet34-LM speaker embedding (fp32)',
  },
  {
    name: 'vocab',
    url: `${HF}/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/vocab.txt`,
    bytes: 9384,
    kind: 'text',
    license: 'CC-BY-4.0',
    label: 'Parakeet subword vocab (1025 entries)',
  },
];

export const TOTAL_BYTES = MODEL_MANIFEST.reduce((s, m) => s + m.bytes, 0);

/**
 * Resolve a manifest entry's download URL. When the page URL carries
 * ?modelBase=<url> (local testing), every URL is rebased to
 * <url>/<basename-of-manifest-url>.
 */
export function resolveUrl(entry) {
  const base = new URLSearchParams(location.search).get('modelBase');
  if (!base) return entry.url;
  const clean = base.replace(/\/+$/, '');
  const baseName = entry.url.split('?')[0].split('/').pop();
  return `${clean}/${baseName}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('IndexedDB open failed: ' + req.error?.message));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('IndexedDB transaction failed: ' + tx.error?.message));
  });
}

function reqAsPromise(req, what) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error(`IndexedDB ${what} failed: ` + req.error?.message));
  });
}

async function idbGetRecord(db, name) {
  return reqAsPromise(
    db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(name), 'read');
}

async function idbPutRecord(db, record) {
  const tx = db.transaction(DB_STORE, 'readwrite');
  tx.objectStore(DB_STORE).put(record);
  await txDone(tx);
}

/** Chunk key for chunk i of model `name` (internal; ':' never appears in manifest names). */
const chunkKey = (name, i) => `${name}::chunk:${i}`;

/**
 * Store a Blob as chunk records + manifest. Chunks are written first, the
 * manifest last, so a crash can never leave a manifest pointing at missing
 * chunks (a missing manifest simply reads as "not cached").
 */
async function idbPutBlob(name, blob) {
  const n = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
  const db = await openDb();
  try {
    for (let i = 0; i < n; i++) {
      const slice = blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES,
        'application/octet-stream');
      await idbPutRecord(db, { name: chunkKey(name, i), chunk: slice });
    }
    await idbPutRecord(db, { name, chunks: n, bytes: blob.size });
  } finally {
    db.close();
  }
}

/**
 * Read a chunked blob. Returns {bytes, blob} or null when the manifest or
 * any chunk is missing/invalid.
 */
async function idbGetBlob(name) {
  const db = await openDb();
  try {
    const man = await idbGetRecord(db, name);
    if (!man || typeof man.chunks !== 'number' || man.chunks < 1) return null;
    const parts = [];
    for (let i = 0; i < man.chunks; i++) {
      const rec = await idbGetRecord(db, chunkKey(name, i));
      if (!rec || !(rec.chunk instanceof Blob)) return null;
      parts.push(rec.chunk);
    }
    return { bytes: man.bytes, blob: new Blob(parts, { type: 'application/octet-stream' }) };
  } finally {
    db.close();
  }
}

async function idbPutText(name, text, bytes) {
  const db = await openDb();
  try {
    // Store the downloaded byte count, NOT text.length: vocab.txt contains
    // non-ASCII tokens (▁ U+2581), so UTF-16 length !== byte size.
    await idbPutRecord(db, { name, text, bytes });
  } finally {
    db.close();
  }
}

async function idbGetText(name) {
  const db = await openDb();
  try {
    const rec = await idbGetRecord(db, name);
    return rec && typeof rec.text === 'string' ? rec : null;
  } finally {
    db.close();
  }
}

function recordIsComplete(entry, record) {
  if (!record) return false;
  if (entry.kind === 'text') {
    return typeof record.text === 'string' && record.bytes === entry.bytes;
  }
  return record.blob instanceof Blob && record.bytes === entry.bytes;
}

async function idbGetModel(entry) {
  return entry.kind === 'text'
    ? idbGetText(entry.name)
    : idbGetBlob(entry.name);
}

/**
 * Per-model cache status: [{name, label, cached, bytes, expectedBytes}].
 * A model counts as cached only when the stored byte size matches the manifest.
 */
export async function getModelStatus() {
  const out = [];
  for (const entry of MODEL_MANIFEST) {
    const record = await idbGetModel(entry);
    const ok = recordIsComplete(entry, record);
    out.push({
      name: entry.name,
      label: entry.label,
      cached: ok,
      bytes: ok ? entry.bytes : 0,
      expectedBytes: entry.bytes,
      license: entry.license,
    });
  }
  return out;
}

/**
 * Download every manifest model not already cached, with chunked streaming
 * progress. onProgress receives
 *   {name, label, loaded, total, fileIndex, fileCount,
 *    overallLoaded, overallTotal, done}
 * Retries each file up to 2 additional times, then throws naming the model.
 */
export async function downloadModels(onProgress) {
  const report = (name, label, loaded, total, i, overallLoaded, done) =>
    onProgress?.({
      name, label, loaded, total,
      fileIndex: i, fileCount: MODEL_MANIFEST.length,
      overallLoaded, overallTotal: TOTAL_BYTES, done,
    });

  let overallLoaded = 0;
  const alreadyCached = await getModelStatus();
  for (const s of alreadyCached) if (s.cached) overallLoaded += s.expectedBytes;

  for (let i = 0; i < MODEL_MANIFEST.length; i++) {
    const entry = MODEL_MANIFEST[i];
    if (recordIsComplete(entry, await idbGetModel(entry))) {
      report(entry.name, entry.label, entry.bytes, entry.bytes, i, overallLoaded, false);
      continue;
    }
    const url = resolveUrl(entry);
    let lastErr = null;
    let stored = false;
    for (let attempt = 0; attempt < 3 && !stored; attempt++) {
      try {
        const resp = await fetch(url);
        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status} ${resp.statusText || ''}`.trim());
        }
        const reader = resp.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          report(entry.name, entry.label, loaded, entry.bytes, i, overallLoaded + loaded, false);
        }
        if (entry.kind === 'text') {
          const text = new TextDecoder().decode(
            chunks.length === 1 ? chunks[0] : concatChunks(chunks));
          await idbPutText(entry.name, text, loaded);
        } else {
          const blob = new Blob(chunks, { type: 'application/octet-stream' });
          if (blob.size !== entry.bytes) {
            throw new Error(`size mismatch: got ${blob.size} bytes, expected ${entry.bytes}`);
          }
          await idbPutBlob(entry.name, blob);
        }
        stored = true;
      } catch (err) {
        lastErr = err;
        // brief backoff before retrying
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!stored) {
      throw new Error(
        `Download failed for "${entry.label}" (${entry.name}) after 3 attempts: ` +
        `${lastErr?.message || lastErr}. Check the network connection and retry.`
      );
    }
    overallLoaded += entry.bytes;
    report(entry.name, entry.label, entry.bytes, entry.bytes, i, overallLoaded, false);
  }
  report('', '', TOTAL_BYTES, TOTAL_BYTES, MODEL_MANIFEST.length, TOTAL_BYTES, true);
}

function concatChunks(chunks) {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/**
 * Load all cached models from IndexedDB.
 * Returns {frontend, encoder, joint, vad, wespeaker} as ArrayBuffers plus
 * {vocab} as a string. Throws naming any missing model.
 * onProgress (optional) receives {name, bytes, filesDone, fileCount} as each
 * file's bytes are read — the 652MB encoder read is the slow step of boot.
 */
export async function loadModelFiles(onProgress) {
  const out = {};
  const missing = [];
  const total = MODEL_MANIFEST.length;
  let done = 0;
  for (const entry of MODEL_MANIFEST) {
    const record = await idbGetModel(entry);
    if (!recordIsComplete(entry, record)) { missing.push(entry.name); continue; }
    out[entry.name] =
      entry.kind === 'text' ? record.text : await record.blob.arrayBuffer();
    done += 1;
    try {
      onProgress?.({ name: entry.name, bytes: entry.bytes, filesDone: done, fileCount: total });
    } catch { /* progress listeners must not break loading */ }
  }
  if (missing.length) {
    throw new Error(
      `Model files not cached: ${missing.join(', ')}. Call downloadModels() first.`
    );
  }
  return out;
}

/** Remove every cached model file (frees ~690MB). */
export async function clearModelCache() {
  const db = await openDb();
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    await txDone(tx);
  } finally {
    db.close();
  }
}
