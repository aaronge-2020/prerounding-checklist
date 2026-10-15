import assert from "node:assert/strict";
import { createLocalLlmClient } from "../src/local-llm/client.js?v=20261015-stable-draft-runtime";

// Exercise the actual client lifecycle, with only GPU/worker transport faked.
Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
  deviceMemory: 8, gpu: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) }
} });
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const workers = [];
let failSelfTest = false;
let failInference = false;
let failTokenizer = false;
globalThis.Worker = class {
  constructor() { workers.push(this); }
  terminate() { this.terminated = true; }
  reply(data) { this.onmessage?.({ data }); }
  postMessage(message) {
    if (message.type === "init") { this.init = message; return; }
    queueMicrotask(() => this.reply({ id: message.id, type: failInference && message.type === "chat" ? "error" : "done", counts: failTokenizer ? [] : message.texts?.map(text => Math.ceil(text.length / 2)), message: "Synthetic inference failure", text: message.type === "chat" ? failSelfTest ? "wrong marker" : "LOCAL-LLM-SELFTEST-OK" : "" }));
  }
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const client = createLocalLlmClient();
const first = client.ensureReady("qwen3.5-2b");
assert.equal(client.ensureReady("qwen3.5-2b"), first, "same load shares one promise/engine");
await assert.rejects(client.ensureReady("qwen3.5-9b"), /Finish or cancel/);
await tick();
const stale = workers.at(-1);
assert.equal(client.getStatus().status, "loading");
await client.unload();
await assert.rejects(first, /cancelled/);
assert.equal(stale.terminated, true);
stale.reply({ id: stale.init.id, type: "progress", progress: 1, text: "stale progress" });
stale.onerror?.({ message: "Late stale worker failure" });
assert.equal(client.getStatus().status, "idle", "late worker messages cannot resurrect a cancelled load");
assert.equal(client.getStatus().verified, false);

const second = client.ensureReady("qwen3.5-2b");
await tick();
const live = workers.at(-1);
live.reply({ id: live.init.id, type: "ready" });
await second;
assert.equal(client.getStatus().verified, true);
assert.equal(client.getStatus().activeModelKey, "qwen3.5-2b");
assert.match(storage.get("prerounding.localLlm.downloaded.v1"), /qwen3.5-2b/);
failInference = true;
await assert.rejects(client.chat([{ role: "user", content: "synthetic" }]), /Synthetic inference failure/);
assert.equal(client.getStatus().verified, false, "inference failure revokes verification and enables retry");
failInference = false;
await client.unload();
assert.match(storage.get("prerounding.localLlm.downloaded.v1"), /qwen3.5-2b/, "cancel/unload retains downloads");

failTokenizer = true;
const brokenTokenizer = client.ensureReady("qwen3.5-2b");
await tick();
workers.at(-1).reply({ id: workers.at(-1).init.id, type: "ready" });
await assert.rejects(brokenTokenizer, /tokenizer self-test failed/);
assert.equal(client.getStatus().verified, false);
await client.unload();
failTokenizer = false;
failSelfTest = true;
const failed = client.ensureReady("qwen3.5-2b");
await tick();
workers.at(-1).reply({ id: workers.at(-1).init.id, type: "ready" });
await assert.rejects(failed, /Self-test failed/);
assert.equal(client.getStatus().verified, false);
await client.unload();
console.log("Local model client: single engine, cancellation, late replies, reload and mandatory self-test passed.");
