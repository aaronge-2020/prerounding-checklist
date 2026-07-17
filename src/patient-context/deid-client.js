import {
  DEFAULT_DEID_MODEL_KEY,
  deidModelOptionByKey
} from "./deid-model-options.js?v=20260711-functional-remediation-15";

const statuses = new Map();
const requests = new Map();
let worker = null;
let activeModelKey = DEFAULT_DEID_MODEL_KEY;
let nextRequestId = 1;

function defaultStatus(modelKey = DEFAULT_DEID_MODEL_KEY) {
  const option = deidModelOptionByKey(modelKey);
  return {
    message: `${option.shortLabel || option.label} not loaded.`,
    ready: false,
    modelId: option.modelId || "",
    modelStatus: "not loaded",
    modelKey: option.key,
    label: option.label
  };
}

function statusFor(modelKey = activeModelKey) {
  return statuses.get(modelKey) || defaultStatus(modelKey);
}

function updateStatus(status, callback) {
  const modelKey = status?.modelKey || activeModelKey;
  const next = { ...statusFor(modelKey), ...status, modelKey };
  statuses.set(modelKey, next);
  callback?.(next);
}

function rejectAll(error) {
  for (const request of requests.values()) request.reject(error);
  requests.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./deid-worker.js?v=20260716-auto-coi-reload", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event) => {
    const { type, id, value } = event.data || {};
    const request = requests.get(id);
    if (!request) return;
    if (type === "status") {
      updateStatus(value, request.onStatus);
      return;
    }
    if (type === "progress") {
      request.onProgress?.(value);
      return;
    }
    requests.delete(id);
    if (type === "result") {
      if (value?.modelKey) updateStatus(value, request.onStatus);
      request.resolve(value);
      return;
    }
    request.reject(new Error(String(value || "Redaction failed. Try again.")));
  });
  worker.addEventListener("error", (event) => {
    rejectAll(new Error(event.message || "The local redaction process stopped unexpectedly. Try again."));
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function request(action, payload, { onStatus, onProgress } = {}) {
  const id = `deid_${nextRequestId++}`;
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject, onStatus, onProgress });
    getWorker().postMessage({ id, action, payload });
  });
}

export function getAdvancedDeidStatus() {
  return { ...statusFor(activeModelKey) };
}

export function getSelectedDeidModelStatus(modelKey = activeModelKey) {
  return { ...statusFor(modelKey) };
}

export function getLoadedDeidModelStatuses() {
  return [...statuses.values()].filter((status) => status.ready).map((status) => ({ ...status }));
}

export async function preloadAdvancedDeidModel({ modelKey = DEFAULT_DEID_MODEL_KEY, assetSource = "auto", onStatus, onProgress } = {}) {
  activeModelKey = deidModelOptionByKey(modelKey).key;
  return request("preload", { modelKey: activeModelKey, assetSource }, { onStatus, onProgress });
}

export async function verifyAdvancedDeidModel({ modelKey = DEFAULT_DEID_MODEL_KEY, assetSource = "auto", onStatus, onProgress } = {}) {
  activeModelKey = deidModelOptionByKey(modelKey).key;
  return request("verify", { modelKey: activeModelKey, assetSource }, { onStatus, onProgress });
}

// Every local model runs through onnxruntime-web's threaded WASM build,
// which needs this page cross-origin isolated - without it, instantiating
// the runtime crashes outright (an uncaught worker error) rather than
// throwing a catchable one. This is what "the local redaction process
// stopped unexpectedly" actually is. service-worker.js stamps on the
// COOP/COEP headers this static site can't set itself, but that only takes
// effect after one reload since the worker was installed.
export function crossOriginIsolationBlocker() {
  if (globalThis.crossOriginIsolated) return "";
  return "Local redaction models need one browser refresh to finish a one-time setup step. Reload this page, then try again.";
}

export function resetAdvancedDeidWorker() {
  worker?.terminate();
  worker = null;
  rejectAll(new Error("The local redaction process was restarted. Try again."));
  statuses.clear();
}

export async function deidentifyText(rawText, { mode = "advanced", allowStructuredFallback = false, admissionDate = null, onStatus, onProgress } = {}) {
  const modelKey = mode === "advanced" ? DEFAULT_DEID_MODEL_KEY : mode;
  if (mode !== "structured") activeModelKey = deidModelOptionByKey(modelKey).key;
  return request(
    "deidentify",
    { rawText: String(rawText || ""), options: { mode, allowStructuredFallback, admissionDate } },
    { onStatus, onProgress }
  );
}
