// Offline-mode network guard for the local-LLM worker.
//
// This module is imported FIRST by src/local-llm/worker.js, before the
// vendored WebLLM runtime evaluates, so the runtime's model downloads (fetch
// and the XHR binary readers Emscripten-style loaders use) flow through the
// gate. Workers cannot read localStorage, so the page client passes the
// toggle state with the "init" message and on later "offlineMode" messages;
// setWorkerOfflineMode applies it. The flag is read at request time, so a
// mid-download toggle still stops subsequent requests.
//
// URL classification is shared with the page gate (src/lib/network-gate.js):
// same-origin requests always pass; only cross-origin traffic is refused.
import { OfflineBlockedError, isRemoteUrl } from "../lib/network-gate.js?v=20260929-offline-mode-v1";

let workerOfflineMode = false;

export function setWorkerOfflineMode(offline) {
  workerOfflineMode = offline === true;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = function workerGatedFetch(input, init) {
  if (workerOfflineMode && isRemoteUrl(input)) {
    return Promise.reject(new OfflineBlockedError(input));
  }
  return nativeFetch(input, init);
};

// The vendored runtime also reads some binaries through XMLHttpRequest.
const NativeXMLHttpRequest = globalThis.XMLHttpRequest;
if (typeof NativeXMLHttpRequest === "function") {
  globalThis.XMLHttpRequest = class WorkerGatedXMLHttpRequest extends NativeXMLHttpRequest {
    open(method, url, ...rest) {
      if (workerOfflineMode && isRemoteUrl(url)) {
        throw new OfflineBlockedError(url);
      }
      return super.open(method, url, ...rest);
    }
  };
}
