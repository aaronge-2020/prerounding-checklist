/**
 * Contract tests for the standalone on-device scribe prototype.
 *
 * The prototype (scribe-prototype.html + src/scribe/) is the automatic phone
 * experience (mobile.html forwards straight to it); it is NOT a desktop
 * sidebar entry. It must keep all inference local (WASM, single thread),
 * never call a remote transcription API, and never persist patient audio or
 * transcripts.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoFile = (p) => join(root, p);
const read = (p) => readFileSync(repoFile(p), "utf8");

const page = read("scribe-prototype.html");
const worker = read("src/scribe/prototype-worker.js");
const worklet = read("src/scribe/capture-worklet.js");
const fbank = read("src/scribe/speaker-fbank.js");
const index = read("index.html");

// 1. The prototype is a standalone root page and the automatic phone
// experience - never a desktop sidebar entry or detached window.
assert.ok(existsSync(repoFile("scribe-prototype.html")), "scribe-prototype.html exists at repo root");
assert.ok(!index.includes('data-action="open-scribe"'), "desktop nav no longer exposes the prototype");
assert.ok(!index.includes("Phone-first"), "phone-first sidebar entry removed");
const app = read("src/ui/app.js");
assert.ok(!app.includes('window.open("scribe-prototype.html"'), "app never opens the prototype in a detached window");
assert.ok(!app.includes('"open-scribe"'), "open-scribe action removed from app.js");
assert.ok(!index.includes("src/scribe/"), "index.html must not reference prototype modules");
assert.ok(!page.includes('href="styles.css"') && !page.includes("href='styles.css'"), "prototype must not pull in the app stylesheet");

// 2. Phone path: WASM-only, single thread, proxy off.
assert.match(worker, /device:\s*["']wasm["']/, "transcription runs on the wasm device (no WebGPU)");
assert.match(worker, /numThreads\s*=\s*1/, "single-threaded WASM (no cross-origin isolation on Pages)");
assert.match(worker, /proxy\s*=\s*false/, "no proxy threads");
assert.ok(!/device:\s*["']webgpu["']/.test(worker), "WebGPU must not be selected anywhere in the prototype worker");
assert.match(worker, /dtype:\s*payload\.dtype\s*\|\|\s*["']fp32["']/, "fp32 is the default: the Jan-2025 *_quantized.onnx QDQ layout is rejected by the vendored ORT at session creation");

// 3. No remote transcription endpoint: the only network use is one-time model download.
for (const [name, src] of [["page", page], ["worker", worker], ["worklet", worklet], ["fbank", fbank]]) {
  assert.ok(!/openai|api\.openai|doximity|anthropic/i.test(src), `${name}: no remote AI API references`);
}
assert.ok(!/fetch\(["']https?:\/\/(?!huggingface\.co)/.test(worker), "worker fetches only from Hugging Face (model downloads)");
assert.ok(!/XMLHttpRequest|navigator\.sendBeacon|EventSource|WebSocket/.test(worker + worklet), "no exfiltration channels in worker/worklet");
assert.ok(!/fetch\(/.test(worklet), "capture worklet performs no network I/O");

// 4. Audio and transcripts are never persisted by the prototype.
assert.ok(!/indexedDB|CacheStorage|caches\.open/.test(page + worker), "no IndexedDB/Cache Storage writes in the prototype");
const storageWrites = [...page.matchAll(/localStorage\.setItem\(([^)]+)\)/g)].map((m) => m[1]);
assert.ok(storageWrites.length > 0, "expected at least the enrollment write to assert on");
for (const w of storageWrites) {
  assert.ok(w.includes("ENROL_KEY"), `localStorage may only hold the voice embedding, found: ${w}`);
}
assert.ok(!/transcript|audio/.test(storageWrites.join(" ")), "enrollment key must not reference audio/transcript payloads");

// 5. The page is clearly labeled experimental and states the offline story.
assert.match(page, /PROTOTYPE/i, "prototype banner present");
assert.ok(/never leaves this device|Audio never leaves/i.test(page), "on-device privacy statement present");
assert.ok(/first model installation requires connectivity|downloads once/i.test(page), "offline-after-install story stated");
assert.ok(/Not validated for clinical documentation/i.test(page), "explicit not-validated-for-clinical-documentation warning");
assert.ok(/clinician review/i.test(page), "clinician-review requirement stated");

// 5b. Phone defaults: tiny model pre-selected, fp32 explicit (quantized artifacts
// incompatible with the vendored ORT), recording bounded, worklet graph alive.
assert.match(page, /moonshine-tiny-ONNX" selected/, "tiny is the default model");
assert.ok(page.includes('dtype: "fp32"'), "fp32 dtype passed explicitly on install");
assert.match(page, /MAX_REC_SECONDS\s*=\s*10\s*\*\s*60/, "10-minute recording cap defined");
assert.ok(/gain\.value\s*=\s*0/.test(page) && /connect\(ctx\.destination\)/.test(page),
  "capture graph kept alive via zero-gain node to destination (no feedback)");

// 6. Worker protocol surface is exactly what the page implements.
for (const action of ['"load"', '"transcribe"', '"loadSpeaker"', '"embed"']) {
  assert.ok(worker.includes(`action === ${action}`), `worker handles ${action}`);
}
assert.ok(page.includes("loadSpeaker") && page.includes("embedAudio"), "page exposes speaker-memory test API");

// 7. Speaker memory: enrollment embedding only (192-ish floats), cosine match, threshold documented.
assert.match(page, /SIM_THRESHOLD\s*=\s*0\.45/, "speaker-match threshold pinned and visible");
assert.ok(page.includes("cosine"), "matching described as cosine similarity");
assert.ok(fbank.includes("meetscribe") && fbank.includes("MIT"), "fbank port carries its MIT attribution");

console.log("scribe prototype contract tests passed");
