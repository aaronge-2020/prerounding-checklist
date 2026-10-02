/**
 * Contract tests for the laptop on-device scribe (scribe-parakeet.html +
 * src/scribe-parakeet/). SCRIBE_TEST_ROOT overrides the repo root under test
 * (defaults to the repo root, i.e. ".." from this file).
 *
 * Coverage:
 *  1. All new files exist; page is standalone (no app styles.css), references
 *     the Parakeet worker/modules, never the phone prototype.
 *  2. The sibling's REAL model-manager.js (imported, no network): manifest
 *     URLs are Hugging Face (+ ?modelBase= hook), license strings, ~690 MB
 *     total, and the getModelStatus/downloadModels/loadModelFiles API shape.
 *  3. pipeline.js driven against a stub worker implementing the ACTUAL
 *     message shapes from parakeet-worker.js (init/ready, vad/vadResult,
 *     transcribe/progress/result, embed/embedResult, ping/pong, error),
 *     plus the pure math/chunking helpers and the enrollment round-trip.
 *  4. Privacy/network gates: no remote AI keys, no exfiltration channels,
 *     localStorage holds only the enrollment voiceprint.
 *  5. Desktop wiring: index.html gains the Scribe Pro (Laptop-only) entry,
 *     mobile.html stays clean, service-worker precache is additive,
 *     package.json wires the new test at the end of test:core.
 *  6. The in-app view matches the app theme (scoped styles use the app's
 *     tokens, no dark palette) and is state-driven: a setup hero while the
 *     models are missing, recording as the hero once ready, voice enrollment
 *     as a collapsed disclosure, and mic-denied guidance with recovery steps.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.SCRIBE_TEST_ROOT ||
  fileURLToPath(new URL("..", import.meta.url));
const siblingRoot = process.env.SCRIBE_SIBLING_ROOT ||
  join(homedir(), "workspace/scribe-parakeet-build/sp-a");

const repoFile = (p) => join(root, p);
const read = (p) => readFileSync(repoFile(p), "utf8");

const page = read("scribe-parakeet.html");
const app = read("src/scribe-parakeet/app.js");
const pipelineSrc = read("src/scribe-parakeet/pipeline.js");
const worker = read("src/scribe-parakeet/parakeet-worker.js");
const modelManagerSrc = read("src/scribe-parakeet/model-manager.js");
const index = read("index.html");
const mobile = read("mobile.html");
const sw = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));

// ---------------------------------------------------------------- 1. files

for (const f of [
  "scribe-parakeet.html",
  "src/scribe-parakeet/app.js",
  "src/scribe-parakeet/pipeline.js",
  "src/scribe-parakeet/model-manager.js",
  "src/scribe-parakeet/parakeet-worker.js",
  "vendor/ort-1.22.0/ort.all.min.js",
  "tests/test-scribe-parakeet.js",
]) {
  assert.ok(existsSync(repoFile(f)), `${f} exists`);
}

// Standalone page: no app stylesheet, references the Parakeet modules.
assert.ok(!page.includes('href="styles.css"') && !page.includes("href='styles.css'"),
  "page must not pull in the app stylesheet");
assert.ok(page.includes("./src/scribe-parakeet/app.js"), "page loads app.js");
assert.ok(pipelineSrc.includes("parakeet-worker.js"), "pipeline spawns parakeet-worker.js");
assert.ok(pipelineSrc.includes("./model-manager.js"), "pipeline imports model-manager.js");
assert.ok(!/scribe-prototype|prototype-worker/i.test(page + app + pipelineSrc),
  "nothing references the phone prototype");

// Required page surfaces.
assert.ok(/Scribe Pro — Parakeet/.test(page), "header title");
assert.ok(/Laptop only/.test(page), "Laptop only badge");
assert.ok(page.includes('href="index.html"'), "back-to-app link");
assert.ok(page.includes("Download models (~690 MB, once)"), "download button label");
assert.ok(/Audio never leaves this device\. Models download once from Hugging Face, then everything runs locally\./.test(page),
  "privacy disclosure verbatim");
for (const id of ["bannerUnsupported", "bannerMic", "bannerDownload", "bannerWorker",
  "btnEnrollRec", "btnEnrollSave", "btnEnrollClear", "btnRecord", "btnStop",
  "btnCopy", "btnShare"]) {
  assert.ok(page.includes(id), `page has #${id}`);
}
assert.ok(page.includes("Processing…"), "processing indicator");

// Attribution matches THIRD-PARTY-NOTICES.md.
for (const s of ["CC-BY-4.0", "MIT", "Silero", "NVIDIA", "WeSpeaker",
  "ONNX Runtime Web", "1.22.0", "onnx-asr", "xiuxiu"]) {
  assert.ok(page.includes(s), `attribution mentions ${s}`);
}

// ------------------------------------------------- 2. sibling model-manager

const mm = await import(pathToFileURL(join(
  siblingRoot, "src/scribe-parakeet/model-manager.js")).href);
for (const fn of ["getModelStatus", "downloadModels", "loadModelFiles", "resolveUrl"]) {
  assert.equal(typeof mm[fn], "function", `model-manager exports ${fn}`);
}
assert.ok(Array.isArray(mm.MODEL_MANIFEST) && mm.MODEL_MANIFEST.length === 6,
  "manifest has 6 entries");
for (const e of mm.MODEL_MANIFEST) {
  assert.ok(e.url.startsWith("https://huggingface.co/"), `${e.name}: huggingface.co URL`);
}
const lic = Object.fromEntries(mm.MODEL_MANIFEST.map((e) => [e.name, e.license]));
assert.equal(lic.encoder, "CC-BY-4.0", "Parakeet encoder CC-BY-4.0");
assert.equal(lic.wespeaker, "CC-BY-4.0", "WeSpeaker CC-BY-4.0");
assert.equal(lic.vad, "MIT (Silero)", "Silero VAD MIT");
assert.ok(mm.TOTAL_BYTES > 600e6 && mm.TOTAL_BYTES < 800e6,
  `TOTAL_BYTES ~690MB, got ${mm.TOTAL_BYTES}`);
assert.ok(modelManagerSrc.includes("modelBase"), "?modelBase= override hook present");
assert.ok(modelManagerSrc.includes("same-origin") || /same-origin/.test(modelManagerSrc),
  "same-origin noted in network policy");

// ------------------------------------------- 3. pipeline vs stub worker

const pipe = await import(pathToFileURL(repoFile("src/scribe-parakeet/pipeline.js")).href);
for (const fn of ["initPipeline", "createWorkerClient", "startRecording", "stopRecording",
  "captureSample", "enrollVoice", "getEnrolled", "clearEnrolled",
  "cosineSimilarity", "l2Normalize", "meanPool", "embeddingToBase64",
  "base64ToEmbedding", "assignSpeaker", "padSegment", "planChunks",
  "formatTimestamp", "extractSlice", "checkBrowserSupport"]) {
  assert.equal(typeof pipe[fn], "function", `pipeline exports ${fn}`);
}
assert.equal(pipe.ENROLL_KEY, "scribeParakeet.enrolledEmbedding.v1", "enrollment key");
assert.equal(pipe.SPEAKER_SIM_THRESHOLD, 0.45, "speaker threshold 0.45");

/** Stub implementing the ACTUAL parakeet-worker.js message shapes. */
function makeStubWorker() {
  const w = {
    onmessage: null,
    terminated: false,
    postMessage(msg) {
      const { type, id } = msg;
      queueMicrotask(() => {
        if (w.terminated) return;
        const reply = (data) => w.onmessage && w.onmessage({ data });
        if (type === "init") {
          reply({
            type: "ready", id,
            info: {
              eps: { frontend: "wasm", encoder: "webgpu", joint: "wasm", vad: "wasm", wespeaker: "wasm" },
              ortVersion: "1.22.0", threads: 4,
            },
          });
        } else if (type === "vad") {
          reply({ type: "vadResult", id, segments: [{ start: 0.5, end: 2.0 }, { start: 3.5, end: 5.0 }] });
        } else if (type === "transcribe") {
          const pcm = new Float32Array(msg.pcm || []);
          if (!pcm.length) {
            reply({ type: "error", id, fatal: false, message: "transcribe: empty audio" });
            return;
          }
          reply({ type: "transcribeProgress", id, framesDone: 10, framesTotal: 40 });
          reply({ type: "transcribeProgress", id, framesDone: 40, framesTotal: 40 });
          reply({
            type: "transcribeResult", id, text: "hello world",
            tokens: [{ id: 5, start: 0.6, end: 1.2 }], audioSec: 4.5, frameShiftMs: 80,
          });
        } else if (type === "embed") {
          const vec = new Float32Array([0.6, 0.8, 0, 0]); // already L2-normed
          reply({ type: "embedResult", id, embedding: vec.buffer });
        } else if (type === "ping") {
          reply({ type: "pong", id, hasSessions: true });
        } else {
          reply({ type: "error", id, fatal: false, message: `unknown message type "${type}"` });
        }
      });
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

{
  const client = pipe.createWorkerClient(makeStubWorker());
  const ready = await client.init({ frontend: new ArrayBuffer(8) }, true);
  assert.equal(ready.type, "ready", "init -> ready");
  assert.equal(ready.info.ortVersion, "1.22.0", "ready carries ortVersion");
  assert.equal(ready.info.threads, 4, "ready carries threads");

  const pong = await client.ping();
  assert.equal(pong.type, "pong", "ping -> pong");
  assert.equal(pong.hasSessions, true, "pong hasSessions");

  const vad = await client.vad(new Float32Array(16000));
  assert.equal(vad.type, "vadResult", "vad -> vadResult");
  assert.deepEqual(vad.segments, [{ start: 0.5, end: 2.0 }, { start: 3.5, end: 5.0 }]);

  const progress = [];
  const tr = await client.transcribe(new Float32Array(16000), (p) => progress.push(p));
  assert.equal(tr.type, "transcribeResult", "transcribe -> transcribeResult");
  assert.equal(tr.text, "hello world", "transcript text");
  assert.deepEqual(tr.tokens, [{ id: 5, start: 0.6, end: 1.2 }], "token offsets");
  assert.equal(progress.length, 2, "two transcribeProgress events");
  assert.deepEqual(
    progress.map((p) => [p.framesDone, p.framesTotal]),
    [[10, 40], [40, 40]],
    "progress carries framesDone/framesTotal (NOT stage/pct)"
  );

  const emb = await client.embed(new Float32Array(16000));
  assert.equal(emb.type, "embedResult", "embed -> embedResult");
  assert.ok(emb.embedding instanceof ArrayBuffer, "embedding is an ArrayBuffer");
  const embArr = Array.from(new Float32Array(emb.embedding));
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(embArr[i] - [0.6, 0.8, 0, 0][i]) < 1e-6, `embedding[${i}]`);
  }

  await assert.rejects(
    client.transcribe(new Float32Array(0)),
    /empty audio/,
    "worker error replies reject the pending call"
  );
  client.dispose();
}

// Enrollment round-trip: VAD-gate -> embed -> mean-pool -> L2 -> base64 -> localStorage.
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const client = pipe.createWorkerClient(makeStubWorker());
  const pcm = new Float32Array(6 * 16000); // 6s
  const r = await pipe.enrollVoice(pcm, client);
  assert.equal(r.dim, 4, "enrolled dim");
  assert.equal(r.segments, 2, "two VAD segments embedded");
  assert.ok(r.speechSec >= 1, "speech gate passed");
  const raw = store.get("scribeParakeet.enrolledEmbedding.v1");
  assert.ok(raw, "voiceprint persisted under the enrollment key");
  const saved = JSON.parse(raw);
  assert.equal(saved.dim, 4, "saved dim");
  assert.ok(typeof saved.embedding === "string" && saved.embedding.length > 0, "base64 embedding");
  const enrolled = pipe.getEnrolled();
  assert.ok(enrolled && enrolled.embedding instanceof Float32Array, "getEnrolled decodes");
  const norm = Math.hypot(...enrolled.embedding);
  assert.ok(Math.abs(norm - 1) < 1e-6, "voiceprint is L2-normalized");
  // self-similarity must label 'you'
  const self = pipe.cosineSimilarity(enrolled.embedding, enrolled.embedding);
  assert.ok(Math.abs(self - 1) < 1e-9, "self cosine = 1");
  assert.equal(pipe.assignSpeaker(self, true).label, "you", "self -> you");
  assert.equal(pipe.assignSpeaker(0.1, true).label, "patient", "low score -> patient");
  assert.equal(pipe.assignSpeaker(0.45, true).label, "you", "threshold is inclusive");
  assert.deepEqual(pipe.assignSpeaker(0.99, false), { label: "speaker", score: null },
    "no enrollment -> speaker");
  pipe.clearEnrolled();
  assert.equal(pipe.getEnrolled(), null, "clearEnrolled removes the voiceprint");
  assert.equal(store.size, 0, "no other localStorage writes");
  client.dispose();
  delete globalThis.localStorage;
}

// Pure math / chunking helpers.
{
  assert.equal(pipe.cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1])), 0);
  assert.ok(Math.abs(pipe.cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2])) - 1) < 1e-9,
    "identical vectors -> cosine 1");
  const n = pipe.l2Normalize(new Float32Array([3, 4]));
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6, "l2Normalize");
  assert.deepEqual(Array.from(pipe.meanPool([new Float32Array([1, 2]), new Float32Array([3, 4])])), [2, 3]);
  const v = new Float32Array([0.1, -2.5, 3.25]);
  const rt = pipe.base64ToEmbedding(pipe.embeddingToBase64(v), 3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(rt[i] - v[i]) < 1e-6, "base64 round-trip");

  assert.deepEqual(pipe.padSegment({ start: 0.1, end: 1 }, 0.25, 10), { start: 0, end: 1.25 });
  // gap < 1s merges (with 0.25s padding), gap >= 1s splits
  let chunks = pipe.planChunks(
    [{ start: 0, end: 2 }, { start: 2.4, end: 4 }, { start: 8, end: 9 }], 10);
  assert.equal(chunks.length, 2, "split at >=1s gap");
  assert.ok(chunks[0].start === 0 && chunks[0].end > 4, "first chunk padded+merged");
  assert.ok(chunks[1].start === 7.75 && chunks[1].end === 9.25, "second chunk padded");
  // >90s run is windowed
  chunks = pipe.planChunks([{ start: 0, end: 200 }], 200);
  assert.ok(chunks.length === 3 && chunks.every((c) => c.end - c.start <= 90),
    "long run windowed to <=90s chunks");
  assert.equal(pipe.formatTimestamp(75), "1:15", "timestamp format");
  const pcm = new Float32Array([1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Array.from(pipe.extractSlice(pcm, -1, 100)), [1, 2, 3, 4, 5, 6],
    "extractSlice clamps");

  // node has no browser APIs: support check must report missing capabilities
  assert.ok(pipe.checkBrowserSupport().length > 0, "node is (correctly) unsupported");
}

// ------------------------------------------------------- 4. privacy/network

for (const [name, src] of [["page", page], ["app", app], ["pipeline", pipelineSrc], ["worker", worker]]) {
  assert.ok(!/openai|anthropic/i.test(src), `${name}: no remote AI API references`);
  assert.ok(!/WebSocket|EventSource|navigator\.sendBeacon|XMLHttpRequest/.test(src),
    `${name}: no exfiltration channels`);
  assert.ok(!/sk-[A-Za-z0-9]|api[_-]?key/i.test(src), `${name}: no API keys`);
}
assert.ok(!/fetch\(["']https?:\/\/(?!huggingface\.co)/.test(worker),
  "worker fetches only from Hugging Face (model downloads)");
// Regression 2026-09-29: the worker loaded the vendored ORT build from a
// domain-root path (importScripts('/vendor/ort-1.22.0/ort.all.min.js')), which
// 404s under the /prerounding-checklist/ Pages base path and killed engine
// startup. Same-origin vendor URLs must resolve from the worker's own URL.
assert.ok(!/importScripts\(\s*["']\//.test(worker),
  "worker importScripts never uses a domain-root path");
assert.ok(!/wasmPaths\s*=\s*["']\//.test(worker),
  "worker wasmPaths never uses a domain-root path");
assert.match(worker, /new URL\(["']\.\.\/\.\.\/vendor\/ort-1\.22\.0\/["'],\s*self\.location\.href\)/,
  "worker derives the ORT dir from its own location");
assert.equal(
  new URL('../../vendor/ort-1.22.0/',
    'https://aaronge-2020.github.io/prerounding-checklist/src/scribe-parakeet/parakeet-worker.js').href,
  'https://aaronge-2020.github.io/prerounding-checklist/vendor/ort-1.22.0/',
  "ORT dir resolves under the Pages base path");
const setItems = [...(page + app + pipelineSrc).matchAll(/localStorage\.setItem\(\s*([^,)\s]+)/g)]
  .map((m) => m[1].trim());
assert.deepEqual(setItems, ["ENROLL_KEY"], "exactly one localStorage write (enrollment)");
assert.ok(pipelineSrc.includes("scribeParakeet.enrolledEmbedding.v1"),
  "enrollment key literal present");
assert.match(pipelineSrc, /new AudioContext\(\{sampleRate:\s*16000\}\)/,
  "mandatory 16kHz AudioContext");
assert.ok(pipelineSrc.includes("registerProcessor") && pipelineSrc.includes("new Blob("),
  "inline AudioWorklet via Blob URL");
assert.match(pipelineSrc, /MAX_REC_SECONDS\s*=\s*10\s*\*\s*60/, "10-minute recording cap");

// ---------------------------------------------------------- 5. repo wiring

// Scribe Pro is a first-class in-app view (2026-09-29): the sidebar targets
// the view, nothing opens a detached new-tab page.
assert.ok(index.includes('data-view-target="scribePro"'), "index: Scribe Pro sidebar entry targets the in-app view");
assert.ok(index.includes(">Scribe Pro<"), "index: Scribe Pro label");
assert.ok(index.includes('data-note="Laptop-only"'), "index: Laptop-only note");
assert.ok(!index.includes('data-action="open-scribe-parakeet"'), "index: no detached Scribe Pro action");
assert.ok(!index.includes('data-action="open-scribe"'), "index: phone scribe is not in the sidebar");
assert.ok(!mobile.includes("scribe-parakeet"), "mobile.html stays clean of scribe-parakeet");

const uiApp = read("src/ui/app.js");
assert.match(uiApp, /const viewIds = \[[^\]]*"scribePro"[^\]]*\]/, "viewIds includes scribePro");
assert.ok(uiApp.includes('import("../scribe-parakeet/app.js")'), "app.js lazily loads the scribe module in-app");
assert.ok(!uiApp.includes('window.open("scribe-parakeet.html"'), "app.js never opens the detached scribe page");
assert.ok(!uiApp.includes('"open-scribe-parakeet"'), "app.js: detached Scribe Pro action gone");
assert.ok(!uiApp.includes('"open-scribe"'), "app.js: detached phone-scribe action gone");

// The in-app view carries the full scribe DOM (the same ids the module wires).
assert.ok(index.includes('id="scribeProView"'), "index: scribeProView section");
assert.ok(index.includes('aria-labelledby="scribe-pro-heading"'), "view is labelled by its heading");
for (const id of ["scribe-pro-heading", "bannerUnsupported", "fileList", "overallBar",
  "btnDownload", "btnEnrollRec", "btnRecord", "btnStop", "timer",
  "transcriptList", "btnCopy", "btnShare"]) {
  assert.ok(index.includes(`id="${id}"`), `in-app view has #${id}`);
}
// Scribe styles are scoped under #scribeProView: no global button/body rules
// leak into the app shell.
assert.ok(index.includes("#scribeProView button{"), "scribe button styles are scoped");
assert.ok(index.includes("#scribeProView .card{"), "scribe card styles are scoped");
assert.ok(!index.includes("\nbody{"), "no unscoped body rule in index.html");

// The in-app Scribe Pro view matches the app theme: its scoped styles use the
// app's theme tokens and never smuggle in a private dark palette.
const scribeStyle = index.slice(index.indexOf("<style>"), index.indexOf("</style>"));
for (const hex of ["#0f141b", "#182029", "#4da3ff", "#3ecf8e", "#ff6b6b", "#1d4ed8", "#2a3542", "#223041"]) {
  assert.ok(!scribeStyle.includes(hex), `scribe view: no dark-theme hex ${hex}`);
}
for (const rule of ["#scribeProView .card{", "#scribeProView .banner.err{",
  "#scribeProView .seg .who.you{", "#scribeProView .timer{"]) {
  assert.ok(index.includes(rule), `scribe view styles ${rule}`);
}
assert.ok(/var\(--(surface|border|ink|muted|accent|success|danger|primary)\)/.test(scribeStyle),
  "scribe view styles use app theme tokens");
assert.ok(!/--bg:\s*#/.test(scribeStyle), "scribe view does not redefine --bg");

// State-driven ease-of-use structure: one primary action per state.
assert.ok(app.includes("dataset.modelsReady"), "scribe module sets the setup/ready state hook");
assert.ok(index.includes('<details class="card" id="enrollCard"'),
  "voice enrollment is a collapsed disclosure");
assert.ok(index.includes('data-models-ready="false"'),
  "CSS keys the setup hero off the state hook");
assert.ok(index.includes("Site settings"), "mic-denied banner explains how to grant permission");
assert.ok(index.includes("Recording unlocks once the models finish downloading"),
  "record card explains why recording is unavailable before setup");

for (const f of ["./scribe-parakeet.html", "./src/scribe-parakeet/app.js",
  "./src/scribe-parakeet/pipeline.js", "./src/scribe-parakeet/model-manager.js",
  "./src/scribe-parakeet/parakeet-worker.js", "./vendor/ort-1.22.0/ort.all.min.js"]) {
  assert.ok(sw.includes(`"${f}"`), `service worker precaches ${f}`);
}
assert.ok(sw.includes("scribe-parakeet-v1"), "dedicated cache name");
assert.ok(sw.includes("skipWaiting"), "install still skipWaits");
assert.ok(sw.includes("prerounding-local-model-packs-v1"), "existing model-pack cache untouched");

assert.equal(pkg.scripts["test:scribe-parakeet"], "node tests/test-scribe-parakeet.js",
  "package.json wires the new test");
assert.ok(pkg.scripts["test:core"].includes("npm run test:scribe-parakeet"),
  "test:core chain still runs the scribe-parakeet contract test");

// ------------------------------------------- 6. boot status & engine startup

// The 689MB of models must be TRANSFERRED to the worker (zero-copy), not
// structured-cloned: files[k] are already ArrayBuffers, so files[k].buffer is
// undefined and an empty transfer list used to stall boot for many minutes.
{
  const w = makeStubWorker();
  let initTransfer = null;
  const basePost = w.postMessage.bind(w);
  w.postMessage = (msg, transfer) => {
    if (msg.type === "init") initTransfer = transfer;
    basePost(msg, transfer);
  };
  const client = pipe.createWorkerClient(w);
  const files = {
    frontend: new ArrayBuffer(8), encoder: new ArrayBuffer(16),
    joint: new ArrayBuffer(8), vad: new ArrayBuffer(8),
    wespeaker: new ArrayBuffer(8), vocab: "a 0",
  };
  await client.init(files, true);
  assert.ok(Array.isArray(initTransfer), "init passes a transfer list");
  assert.equal(initTransfer.length, 5, "all five model buffers are transferred");
  for (const k of ["frontend", "encoder", "joint", "vad", "wespeaker"]) {
    assert.ok(initTransfer.includes(files[k]), `${k} buffer is transferred, not copied`);
  }
  client.dispose();
}

// Worker-side init progress must reach the page: the stub emits one
// initProgress before ready, exactly like the real worker per session.
{
  const w = makeStubWorker();
  const basePost = w.postMessage.bind(w);
  w.postMessage = (msg, transfer) => {
    if (msg.type === "init") {
      queueMicrotask(() => {
        if (w.onmessage) w.onmessage({ data: { type: "initProgress", id: msg.id, stage: "session", label: "encoder", done: 2, total: 5 } });
      });
    }
    basePost(msg, transfer);
  };
  const client = pipe.createWorkerClient(w);
  const seen = [];
  await client.init({ frontend: new ArrayBuffer(8) }, true, (p) => seen.push(p));
  assert.equal(seen.length, 1, "initProgress delivered to onProgress");
  assert.equal(seen[0].type, "initProgress");
  assert.equal(seen[0].label, "encoder");
  client.dispose();
}

// A worker that dies (importScripts failure, OOM kill) must reject init with
// the real error, never hang silently.
{
  const w = makeStubWorker();
  w.postMessage = () => {}; // never replies
  const client = pipe.createWorkerClient(w);
  assert.equal(typeof w.onerror, "function", "client installs worker.onerror");
  assert.equal(typeof w.onmessageerror, "function", "client installs worker.onmessageerror");
  const p = client.init({ frontend: new ArrayBuffer(8) }, true);
  w.onerror(new Error("importScripts failed"));
  await assert.rejects(p, /importScripts failed/);
  client.dispose();
}

// A fatal worker error message rejects init with its message.
{
  const w = makeStubWorker();
  w.postMessage = (msg) => {
    queueMicrotask(() => {
      if (w.onmessage) w.onmessage({ data: { type: "error", id: msg.id, fatal: true, message: "session create failed" } });
    });
  };
  const client = pipe.createWorkerClient(w);
  await assert.rejects(client.init({ frontend: new ArrayBuffer(8) }, true), /session create failed/);
  client.dispose();
}

// initPipeline: stage ordering with injected deps; per-session progress propagates.
{
  const stages = [];
  const w = makeStubWorker();
  const basePost = w.postMessage.bind(w);
  w.postMessage = (msg, transfer) => {
    if (msg.type === "init") {
      queueMicrotask(() => {
        if (w.onmessage) w.onmessage({ data: { type: "initProgress", id: msg.id, stage: "session", label: "encoder", done: 2, total: 5 } });
      });
    }
    basePost(msg, transfer);
  };
  const files = {
    frontend: new ArrayBuffer(8), encoder: new ArrayBuffer(8),
    joint: new ArrayBuffer(8), vad: new ArrayBuffer(8),
    wespeaker: new ArrayBuffer(8), vocab: "x 0",
  };
  const engine = await pipe.initPipeline(
    (p) => stages.push(p.stage + (p.done != null ? `:${p.done}/${p.total}` : "") + (p.name ? `:${p.name}` : "")),
    {
      checkBrowserSupport: () => [],
      getModelStatus: async () => ["frontend", "encoder", "joint", "vad", "wespeaker", "vocab"]
        .map((n) => ({ name: n, cached: true })),
      loadModelFiles: async (onFile) => {
        const names = ["frontend", "encoder", "joint", "vad", "wespeaker", "vocab"];
        names.forEach((n, i) => onFile?.({ name: n, bytes: 8, filesDone: i + 1, fileCount: names.length }));
        return files;
      },
      workerFactory: () => w,
      bootTimeoutMs: 5000,
    }
  );
  assert.ok(engine && engine.client, "initPipeline resolves with a client");
  const first = (s) => stages.findIndex((x) => x === s || x.startsWith(s + ":"));
  for (const s of ["support", "status", "load", "transfer", "sessions", "ready"]) {
    assert.ok(first(s) >= 0, `stage '${s}' is reported`);
  }
  assert.ok(first("support") < first("status"), "support before status");
  assert.ok(first("status") < first("load"), "status before load");
  assert.ok(first("load") < first("transfer"), "load before transfer");
  assert.ok(first("transfer") < first("sessions"), "transfer before sessions");
  assert.ok(first("sessions") < first("ready"), "sessions before ready");
  assert.ok(stages.some((x) => x === "sessions:2/5"), "per-session progress reaches the page");
  assert.equal(stages.filter((x) => x.startsWith("load:")).length, 6, "per-file load progress reported");
  engine.client.dispose();
}

// initPipeline: a worker that never responds rejects with a timeout error.
{
  const w = makeStubWorker();
  w.postMessage = () => {}; // never replies
  await assert.rejects(
    pipe.initPipeline(() => {}, {
      checkBrowserSupport: () => [],
      getModelStatus: async () => [{ name: "frontend", cached: true }],
      loadModelFiles: async () => ({ frontend: new ArrayBuffer(8) }),
      workerFactory: () => w,
      bootTimeoutMs: 60,
    }),
    /timed out after/,
    "silent boot is impossible: the timeout guard rejects"
  );
}

// Page + app surface: a visible boot status line and an honest record button.
assert.ok(page.includes('id="engineProc"'), "page has a visible #engineProc boot status");
assert.ok(page.includes('id="engineProcText"'), "page has #engineProcText");
assert.ok(app.includes("engineProcText"), "app.js writes boot stages to the status line");
assert.ok(app.includes("Loading neural networks into memory"), "app.js narrates the slow session-load stage");
assert.ok(app.includes("Starting engine"), "record button shows boot state");
assert.ok(app.includes("Engine ready"), "app.js confirms engine-ready visibly");
assert.ok(pipelineSrc.includes("initProgress"), "pipeline routes worker init progress");
assert.ok(pipelineSrc.includes("bootTimeoutMs"), "pipeline has a boot timeout");
assert.ok(pipelineSrc.includes("worker.onerror"), "pipeline installs worker.onerror");
assert.ok(worker.includes("type: 'initProgress'"), "worker posts per-session init progress");
assert.ok(/initProgress', id/.test(worker),
  "worker tags initProgress with the request id (without it the page can never route progress)");
assert.ok(/type: 'ready',\s+id,/.test(worker),
  "worker tags ready with the request id (without it init() can never resolve)");
assert.ok(modelManagerSrc.includes("onProgress"), "loadModelFiles reports per-file progress");

console.log("scribe-parakeet contract tests passed");
