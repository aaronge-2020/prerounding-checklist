// Tests for app-wide offline mode (src/lib/network-gate.js):
//   - URL classification: same-origin/local requests are never gated
//   - gatedFetch: remote requests never reach fetch while offline, and flow
//     normally when offline mode is off
//   - the persisted toggle is honored across a fresh module load ("reload")
//   - the OpenAI client surfaces OfflineBlockedError (clear + calm), never a
//     generic connectivity error, and the normal path still works
//   - one distinct ?v= for network-gate.js across all importers (otherwise
//     ES-module URL keying silently splits the gate's singleton state)
//   - Settings shows the toggle and the "Where does my data go?" disclosure
//   - AI Chat disables the ChatGPT tab while offline
//   - the local-LLM client fails fast with a download-first message when the
//     model isn't cached, instead of hanging on a blocked download
//   - the worker installs its network guard before the vendored WebLLM
//     runtime evaluates, refuses remote fetch/XHR while offline, and stays
//     in sync with the toggle via worker messages
//   - no bare fetch() remains at the remote call sites
//
// All fixtures are synthetic and PHI-free.

import "./helpers/offline-test-shim.js";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fetchCalls, resetFetchCalls, storedOfflineMode } from "./helpers/offline-test-shim.js";
import {
  OfflineBlockedError,
  assertRemoteAllowed,
  gatedFetch,
  installGlobalFetchGuard,
  isOfflineMode,
  isRemoteUrl,
  onOfflineModeChange,
  setOfflineMode
} from "../src/lib/network-gate.js?v=20260929-offline-mode-v1";
import { requestOpenAiChat, requestOpenAiStructuredJson } from "../src/ui/openai-client.js";
import { createLocalLlmClient } from "../src/local-llm/client.js";
import { createSettingsPresentation } from "../src/ui/settings/presentation.js";
import { createAiChatPresentation } from "../src/ui/ai-chat/presentation.js";

const NETWORK_GATE_TAG = "20260929-offline-mode-v1";

// ---------------------------------------------------------------------------
// URL classification
// ---------------------------------------------------------------------------

assert.equal(isRemoteUrl("https://api.openai.com/v1/responses"), true, "OpenAI API is remote");
assert.equal(isRemoteUrl("https://huggingface.co/obi/deid_bert_i2b2/resolve/main/config.json"), true, "Hugging Face is remote");
assert.equal(isRemoteUrl("https://cdn.jsdelivr.net/npm/@mlc-ai/web-runtime"), true, "CDN is remote");
assert.equal(isRemoteUrl("/src/ui/app.js"), false, "relative app asset is local");
assert.equal(isRemoteUrl("models/obi/config.json"), false, "relative model asset is local");
assert.equal(isRemoteUrl("data:text/plain,hello"), false, "data: URLs are local");
assert.equal(isRemoteUrl("blob:https://example.com/123"), false, "blob: URLs are local");
assert.equal(isRemoteUrl("not a url at all"), false, "unparseable input is not treated as remote");

console.log("url classification tests passed");

// ---------------------------------------------------------------------------
// Toggle state + persistence
// ---------------------------------------------------------------------------

assert.equal(isOfflineMode(), false, "offline mode defaults to off");
setOfflineMode(true);
assert.equal(isOfflineMode(), true, "toggle turns on");
assert.equal(storedOfflineMode(), "1", "toggle persists as '1' in localStorage");
setOfflineMode(false);
assert.equal(isOfflineMode(), false, "toggle turns off");
assert.equal(storedOfflineMode(), "0", "toggle persists as '0' in localStorage");

// A fresh module load (simulating a page reload) must honor the persisted
// toggle. A new query string forces a distinct module instance.
setOfflineMode(true);
const reloaded = await import(`../src/lib/network-gate.js?v=${NETWORK_GATE_TAG}&reload=1`);
assert.equal(reloaded.isOfflineMode(), true, "reloaded module honors persisted offline mode");
setOfflineMode(false);
const reloadedOnline = await import(`../src/lib/network-gate.js?v=${NETWORK_GATE_TAG}&reload=2`);
assert.equal(reloadedOnline.isOfflineMode(), false, "reloaded module honors persisted online mode");

console.log("toggle persistence tests passed");

// ---------------------------------------------------------------------------
// assertRemoteAllowed + gatedFetch
// ---------------------------------------------------------------------------

setOfflineMode(true);
assert.throws(
  () => assertRemoteAllowed("https://api.openai.com/v1/responses"),
  (err) => err instanceof OfflineBlockedError && err.name === "OfflineBlockedError",
  "remote request throws OfflineBlockedError while offline"
);
assert.doesNotThrow(() => assertRemoteAllowed("/src/ui/app.js"), "same-origin request is never gated");

resetFetchCalls();
await assert.rejects(
  gatedFetch("https://api.openai.com/v1/responses", { method: "POST" }),
  (err) => err.name === "OfflineBlockedError" && /Offline mode is on/.test(err.message),
  "gatedFetch refuses remote requests while offline with a calm explanation"
);
assert.equal(fetchCalls.length, 0, "blocked request never reaches the underlying fetch");

await gatedFetch("/src/ui/app.js");
assert.equal(fetchCalls.length, 1, "same-origin request flows while offline");

setOfflineMode(false);
await gatedFetch("https://api.openai.com/v1/responses", { method: "POST" });
assert.equal(fetchCalls.length, 2, "remote request flows normally when offline mode is off");
assert.equal(fetchCalls[1].input, "https://api.openai.com/v1/responses", "remote URL passed through untouched");

console.log("gatedFetch tests passed");

// ---------------------------------------------------------------------------
// Change subscriptions
// ---------------------------------------------------------------------------

{
  const seen = [];
  const unsubscribe = onOfflineModeChange((next) => seen.push(next));
  setOfflineMode(true);
  setOfflineMode(false);
  setOfflineMode(false); // no-op: no duplicate notification
  assert.deepEqual(seen, [true, false], "subscribers see each real change exactly once");
  unsubscribe();
  setOfflineMode(true);
  assert.deepEqual(seen, [true, false], "unsubscribed listener is not called");
  setOfflineMode(false);
}

console.log("subscription tests passed");

// ---------------------------------------------------------------------------
// Global fetch guard backstop
// ---------------------------------------------------------------------------

{
  const windowCalls = [];
  const originalFetch = globalThis.fetch;
  const windowSpy = async (...args) => {
    windowCalls.push(args);
    return { ok: true };
  };
  globalThis.window = { fetch: windowSpy };
  try {
    const uninstall = installGlobalFetchGuard();
    setOfflineMode(true);
    assert.throws(
      () => globalThis.window.fetch("https://api.openai.com/v1/responses"),
      (err) => err.name === "OfflineBlockedError",
      "window.fetch refuses remote requests while offline"
    );
    assert.equal(windowCalls.length, 0, "blocked window.fetch never reaches native fetch");
    await globalThis.window.fetch("/src/ui/app.js");
    assert.equal(windowCalls.length, 1, "same-origin window.fetch flows while offline");
    setOfflineMode(false);
    await globalThis.window.fetch("https://api.openai.com/v1/responses");
    assert.equal(windowCalls.length, 2, "window.fetch flows when offline mode is off");
    uninstall();
    const callsAfter = windowCalls.length;
    await globalThis.window.fetch("https://api.openai.com/v1/responses");
    assert.equal(windowCalls.length, callsAfter + 1, "uninstall restores the original fetch behavior");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
}

console.log("global fetch guard tests passed");

// ---------------------------------------------------------------------------
// OpenAI client: clear offline error, intact normal path
// ---------------------------------------------------------------------------

setOfflineMode(true);
await assert.rejects(
  () => requestOpenAiChat({ apiKey: "sk-test", model: "gpt-5", input: "hi" }),
  (err) => err.name === "OfflineBlockedError" && /Offline mode is on/.test(err.message),
  "chat call surfaces OfflineBlockedError, not a generic connectivity error"
);
await assert.rejects(
  () =>
    requestOpenAiStructuredJson({
      apiKey: "sk-test",
      model: "gpt-5",
      input: "hi",
      schemaName: "s",
      schema: { type: "object" }
    }),
  (err) => err.name === "OfflineBlockedError",
  "structured call surfaces OfflineBlockedError too"
);
setOfflineMode(false);

// Positive control: the catch-path edit must not break the normal call.
{
  const reply = await requestOpenAiChat({
    apiKey: "sk-test",
    model: "gpt-5",
    input: "hi",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ output_text: "hello" })
    })
  });
  assert.equal(reply, "hello", "normal chat path still works when offline mode is off");
}

console.log("openai client tests passed");

// ---------------------------------------------------------------------------
// Local-LLM client: download-first failure instead of a hang
// ---------------------------------------------------------------------------

{
  setOfflineMode(true);
  const client = createLocalLlmClient();
  // Nothing is cached in the shimmed storage, so this must fail fast with
  // the download-first message — before any worker or network activity.
  await assert.rejects(
    () => client.ensureReady("qwen3-1.7b"),
    (err) => /hasn't been downloaded in this browser yet/.test(err.message) && /Turn offline mode off/.test(err.message),
    "uncached model fails fast with a download-first explanation"
  );
  setOfflineMode(false);
}

// Ground truth beats the registry hint: when the worker reports the
// weights ARE in Cache Storage, ensureReady must not refuse — it gets
// past the offline check (and fails later only on the missing WebGPU in
// this Node environment, which proves the refusal was skipped).
{
  setOfflineMode(true);
  const seenWorkerUrls = [];
  globalThis.Worker = class {
    constructor(url) {
      seenWorkerUrls.push(String(url));
    }
    postMessage(message) {
      if (message.type === "cached") {
        queueMicrotask(() =>
          this.onmessage({
            data: {
              id: message.id,
              type: "cached",
              results: { "Qwen3-1.7B-q4f16_1-MLC": true }
            }
          })
        );
      }
    }
    terminate() {}
  };
  try {
    const client = createLocalLlmClient();
    await assert.rejects(
      () => client.ensureReady("qwen3-1.7b"),
      (err) => /WebGPU is required/.test(err.message),
      "actually-cached model passes the offline refusal (fails later on WebGPU, as expected in Node)"
    );
    assert.ok(
      seenWorkerUrls.some((u) => u.includes("worker.js")),
      "the ground-truth check consulted the worker"
    );
  } finally {
    delete globalThis.Worker;
    setOfflineMode(false);
  }
}

console.log("local-llm offline pre-check tests passed");

// ---------------------------------------------------------------------------
// Worker-side network guard (src/local-llm/worker-net-guard.js)
// ---------------------------------------------------------------------------

{
  // The guard wraps fetch/XHR at import time, so the fake XHR must exist
  // before the dynamic import evaluates the module.
  const xhrOpenCalls = [];
  globalThis.XMLHttpRequest = class FakeXMLHttpRequest {
    open(method, url) {
      xhrOpenCalls.push(String(url));
    }
  };
  const workerGuard = await import("../src/local-llm/worker-net-guard.js?v=20260929-offline-mode-v1");

  resetFetchCalls();
  await globalThis.fetch("https://huggingface.co/obi/model.bin");
  assert.equal(fetchCalls.length, 1, "worker guard lets remote fetch flow while online");

  workerGuard.setWorkerOfflineMode(true);
  await assert.rejects(
    globalThis.fetch("https://huggingface.co/obi/model.bin"),
    (err) => err.name === "OfflineBlockedError",
    "worker guard refuses remote fetch while offline"
  );
  assert.equal(fetchCalls.length, 1, "blocked worker fetch never reaches the native fetch");
  await globalThis.fetch("/models/obi/config.json");
  assert.equal(fetchCalls.length, 2, "worker guard lets same-origin fetch flow while offline");

  const GatedXHR = globalThis.XMLHttpRequest;
  assert.notEqual(GatedXHR.name, "FakeXMLHttpRequest", "worker guard subclasses XMLHttpRequest");
  assert.throws(
    () => new GatedXHR().open("GET", "https://huggingface.co/obi/model.bin"),
    (err) => err.name === "OfflineBlockedError",
    "worker guard refuses remote XHR while offline"
  );
  assert.equal(xhrOpenCalls.length, 0, "blocked worker XHR never opens");
  new GatedXHR().open("GET", "/models/obi/config.json");
  assert.equal(xhrOpenCalls.length, 1, "worker guard lets same-origin XHR through while offline");

  workerGuard.setWorkerOfflineMode(false);
  await globalThis.fetch("https://huggingface.co/obi/model.bin");
  assert.equal(fetchCalls.length, 3, "worker guard flows again when back online");
  delete globalThis.XMLHttpRequest;
}

console.log("worker net guard tests passed");

// ---------------------------------------------------------------------------
// Worker + client wiring (source-level: the vendor runtime is too heavy to
// import in node, so assert the protocol contract instead)
// ---------------------------------------------------------------------------

{
  const workerSrc = readFileSync(new URL("../src/local-llm/worker.js", import.meta.url), "utf8");
  const guardImport = workerSrc.indexOf("worker-net-guard.js");
  const runtimeImport = workerSrc.indexOf("vendor/web-llm");
  assert.ok(guardImport !== -1 && guardImport < runtimeImport, "worker installs the net guard before the vendored runtime evaluates");
  assert.ok(workerSrc.includes('type === "offlineMode"'), "worker applies mid-session offlineMode messages");
  assert.ok(workerSrc.includes("setWorkerOfflineMode(message.offlineMode === true)"), "worker takes the toggle state from the init message");

  const clientSrc = readFileSync(new URL("../src/local-llm/client.js", import.meta.url), "utf8");
  assert.ok(clientSrc.includes('offlineMode: isOfflineMode()'), "client passes the toggle state with the worker init message");
  assert.ok(clientSrc.includes('type: "offlineMode"'), "client notifies a live worker when the toggle changes");
}

console.log("worker/client wiring tests passed");

// ---------------------------------------------------------------------------
// Cache-buster alignment: one distinct ?v= for the gate across importers
// ---------------------------------------------------------------------------

{
  const importers = [
    "../src/ui/app.js",
    "../src/ui/openai-client.js",
    "../src/patient-context/model-pack-storage.js",
    "../src/local-llm/client.js",
    "../src/ui/ai-chat/controller.js",
    "../src/ui/drug-lookup/controller.js",
    "../src/ui/review/drug-autocomplete.js",
    "../src/local-llm/worker-net-guard.js"
  ];
  const versions = new Set();
  for (const rel of importers) {
    const source = readFileSync(new URL(rel, import.meta.url), "utf8");
    const match = source.match(/lib\/network-gate\.js\?v=([^"'\s]+)/);
    assert.ok(match, `${rel} imports network-gate.js with a ?v= tag`);
    versions.add(match[1]);
  }
  assert.equal(versions.size, 1, `one distinct ?v= for network-gate.js (found: ${[...versions].join(", ")})`);
  assert.ok(versions.has(NETWORK_GATE_TAG), "the shared tag is the offline-mode tag");

  // worker-net-guard.js is imported only by worker.js: same one-tag rule.
  {
    const workerSource = readFileSync(new URL("../src/local-llm/worker.js", import.meta.url), "utf8");
    const match = workerSource.match(/worker-net-guard\.js\?v=([^"'\s]+)/);
    assert.ok(match, "worker.js imports worker-net-guard.js with a ?v= tag");
    assert.equal(match[1], NETWORK_GATE_TAG, "worker guard shares the offline-mode tag");
  }
}

console.log("cache-buster alignment tests passed");

// ---------------------------------------------------------------------------
// No bare fetch() at the remote call sites
// ---------------------------------------------------------------------------

{
  for (const rel of ["../src/ui/openai-client.js", "../src/patient-context/model-pack-storage.js", "../src/ui/drug-lookup/controller.js", "../src/ui/review/drug-autocomplete.js"]) {
    const source = readFileSync(new URL(rel, import.meta.url), "utf8");
    const withoutGated = source.replaceAll("gatedFetch(", "");
    assert.ok(
      !/(?<![\w.])fetch\(/.test(withoutGated),
      `${rel} must route every remote fetch through gatedFetch`
    );
  }
}

console.log("remote call-site tests passed");

// ---------------------------------------------------------------------------
// Drug lookups (openFDA) are gated too
// ---------------------------------------------------------------------------

{
  // The controller defaults to gatedFetch when no fetchImpl is injected:
  // while offline, an openFDA lookup must fail fast with OfflineBlockedError.
  const controllerSrc = readFileSync(new URL("../src/ui/drug-lookup/controller.js", import.meta.url), "utf8");
  assert.ok(controllerSrc.includes("gatedFetch"), "drug-lookup controller routes through gatedFetch");
  const { resolveDrug } = await import("../src/ui/drug-lookup/api.js?v=20260929-ddinter-v2");
  setOfflineMode(true);
  try {
    await assert.rejects(
      resolveDrug(gatedFetch, "atorvastatin"),
      (err) => err && err.name === "OfflineBlockedError",
      "openFDA lookup is refused while offline mode is on"
    );
  } finally {
    setOfflineMode(false);
  }
  // The @-autocomplete swallows the refusal quietly (empty dropdown, no console noise).
  const acSrc = readFileSync(new URL("../src/ui/review/drug-autocomplete.js", import.meta.url), "utf8");
  assert.ok(acSrc.includes("gatedFetch"), "drug autocomplete routes through gatedFetch");
  assert.ok(acSrc.includes('err.name === "OfflineBlockedError"'), "drug autocomplete handles the offline refusal quietly");
}

console.log("drug lookup tests passed");

// ---------------------------------------------------------------------------
// Settings: toggle + disclosure
// ---------------------------------------------------------------------------

{
  const presentation = createSettingsPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  });
  const base = {
    preferences: {},
    apiKeySaved: false,
    guidelineSets: [],
    OPENAI_WORKUP_MODEL_OPTIONS: [],
    localAiGuidelines: "guidelines"
  };
  const onHtml = presentation.renderSettings({ ...base, offlineMode: true });
  assert.ok(onHtml.includes("Offline mode is on"), "toggle reflects the on state");
  assert.ok(onHtml.includes('data-action="toggle-offline-mode"'), "toggle action present");
  assert.ok(onHtml.includes("Turn offline mode off"), "toggle offers to turn off");
  assert.ok(onHtml.includes("Where does my data go?"), "data-flow disclosure rendered");
  assert.ok(onHtml.includes("api.openai.com"), "disclosure names the OpenAI endpoint");
  const offHtml = presentation.renderSettings({ ...base, offlineMode: false });
  assert.ok(offHtml.includes("Offline mode is off"), "toggle reflects the off state");
  assert.ok(offHtml.includes("Turn offline mode on"), "toggle offers to turn on");
  const defaultHtml = presentation.renderSettings(base);
  assert.ok(defaultHtml.includes("Offline mode is off"), "offlineMode defaults to off");
}

console.log("settings presentation tests passed");

// ---------------------------------------------------------------------------
// AI Chat: ChatGPT tab disabled while offline
// ---------------------------------------------------------------------------

{
  const presentation = createAiChatPresentation({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    icon: () => ""
  });
  const base = {
    hardware: { recommendation: { models: [], recommendedKey: null } },
    settings: { selectedModelKey: "", parsingEnabled: false, patientContextEnabled: true },
    llmStatus: { status: "ready", verified: true, activeModelKey: "qwen3-1.7b" },
    downloaded: {},
    remote: {},
    patientContext: { enabled: false, available: false, label: "", hasPatient: false }
  };
  const chat = { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false };
  const offlineHtml = presentation.render({ ...base, mode: "local", offlineMode: true, chat });
  assert.ok(offlineHtml.includes("ChatGPT (offline)"), "ChatGPT tab is marked offline");
  assert.ok(/data-mode="remote"[^>]*disabled/.test(offlineHtml), "ChatGPT tab is disabled while offline");
  const onlineHtml = presentation.render({ ...base, mode: "local", offlineMode: false, chat });
  assert.ok(!onlineHtml.includes("(offline)"), "no offline marking when online");
  assert.ok(!/data-mode="remote"[^>]*disabled/.test(onlineHtml), "ChatGPT tab enabled when online");
}

console.log("ai-chat presentation tests passed");

console.log("all offline-mode tests passed");
