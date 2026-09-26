import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ORIGIN = "https://aaronge-2020.github.io";

// Minimal service-worker global surface: capture the fetch handler so we
// can dispatch synthetic fetch events against it.
function loadWorker() {
  const handlers = {};
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => ({ match: async () => null }) },
    fetch: async () => { throw new Error("should not be called in these tests"); },
    Headers,
    Response,
    URL,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const code = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  vm.runInContext(code, sandbox, { filename: "service-worker.js" });
  assert.ok(handlers.fetch, "service worker registers a fetch handler");
  return handlers.fetch;
}

function fakeEvent(url) {
  let responded = false;
  return {
    request: { url, cache: "default", mode: "cors" },
    respondWith: () => { responded = true; },
    get responded() { return responded; },
  };
}

const onFetch = loadWorker();

// Cross-origin API traffic (e.g. OpenAI) must pass through untouched —
// re-issuing it via fetch(event.request) drops the Authorization header.
const apiEvent = fakeEvent("https://api.openai.com/v1/responses");
onFetch(apiEvent);
assert.equal(apiEvent.responded, false, "cross-origin API request is not intercepted");

// Hugging Face model downloads are cross-origin too.
const hfEvent = fakeEvent("https://huggingface.co/models/x/resolve/main/model.onnx");
onFetch(hfEvent);
assert.equal(hfEvent.responded, false, "cross-origin model download is not intercepted");

// Same-origin model-pack route still serves from cache.
const packEvent = fakeEvent(`${ORIGIN}/__prerounding-models/pack.json`);
onFetch(packEvent);
assert.equal(packEvent.responded, true, "same-origin model-pack route is intercepted");

// Same-origin app traffic still gets the COOP/COEP stamping path.
const sameEvent = fakeEvent(`${ORIGIN}/index.html`);
onFetch(sameEvent);
assert.equal(sameEvent.responded, true, "same-origin requests still go through the worker");

console.log("service worker tests passed");
