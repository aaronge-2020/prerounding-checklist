import {
  createDeidentifier,
  deidentifyTextStructuredOnly
} from "../vault/deid.js?v=20260716-admission-anchor-fixes";
import {
  DEFAULT_DEID_MODEL_KEY,
  STRUCTURED_DEID_MODE,
  deidModelCandidates,
  deidModelOptionByKey
} from "./deid-model-options.js?v=20260711-functional-remediation-15";
import { getModelPackState, invalidateModelPackVerification, readModelPackFileResponse } from "./model-pack-storage.js?v=20260711-functional-remediation-15";
import { importedModelBaseUrl } from "./model-packs.js?v=20260711-functional-remediation-15";

const deidentifierPromises = new Map();
let activeModelKey = DEFAULT_DEID_MODEL_KEY;
const modelStatuses = new Map();
const GLINER_PII_LABELS = [
  "person",
  "first_name",
  "last_name",
  "patient",
  "provider",
  "email",
  "phone_number",
  "fax_number",
  "date",
  "date_of_birth",
  "date_time",
  "time",
  "medical_record_number",
  "health_plan_beneficiary_number",
  "account_number",
  "customer_id",
  "unique_id",
  "national_id",
  "ssn",
  "tax_id",
  "certificate_license_number",
  "street_address",
  "city",
  "state",
  "county",
  "country",
  "postcode",
  "company_name",
  "organization",
  "url",
  "ipv4",
  "ipv6",
  "mac_address",
  "device_identifier",
  "license_plate",
  "vehicle_identifier",
  "api_key",
  "password",
  "pin",
  "credit_debit_card",
  "cvv",
  "bank_routing_number"
];

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
  return modelStatuses.get(modelKey) || defaultStatus(modelKey);
}

function setStatus(update, onStatus) {
  const modelKey = update.modelKey || activeModelKey || DEFAULT_DEID_MODEL_KEY;
  const nextStatus = { ...statusFor(modelKey), ...update, modelKey };
  modelStatuses.set(modelKey, nextStatus);
  if (typeof onStatus === "function") onStatus(nextStatus);
}

async function ensureWebGpuRuntime(option) {
  if (!option?.requiresWebGpu) return;
  if (!globalThis.navigator?.gpu?.requestAdapter) {
    throw new Error(`${option.label} needs graphics acceleration this browser doesn't support.`);
  }
  const adapter = await globalThis.navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error(`${option.label} couldn't access this device's graphics hardware.`);
}

function bundledModelBaseUrl() {
  return new URL("../../models/", import.meta.url).href;
}

function modelBaseUrl(assetSource) {
  return assetSource === "imported" || assetSource === "handles" || assetSource === "opfs" ? importedModelBaseUrl() : bundledModelBaseUrl();
}

export function wasmRuntimePaths(option = {}) {
  const runtimeName = option.wasmRuntime === "standard"
    ? "ort-wasm-simd-threaded"
    : "ort-wasm-simd-threaded.asyncify";
  return {
    mjs: new URL(`../../vendor/onnxruntime-web/${runtimeName}.mjs`, import.meta.url).href,
    wasm: new URL(`../../vendor/onnxruntime-web/${runtimeName}.wasm`, import.meta.url).href
  };
}

async function invalidateRuntimeVerification(option, error) {
  if (option?.assetMode !== "installable") return;
  try {
    await invalidateModelPackVerification(option, error);
  } catch (storageError) {
    console.warn("Could not clear a failed local model verification state.", storageError);
  }
}

function localOnlyModelFetch(modelRoot, assetSource, modelId) {
  const nativeFetch = fetch.bind(globalThis);
  const root = new URL(modelRoot);
  const fetchLocalFile = async (url, init) => {
    if ((assetSource === "handles" || assetSource === "opfs") && url.origin === root.origin && url.href.startsWith(root.href)) {
      const relative = decodeURIComponent(url.pathname.slice(root.pathname.length));
      const prefix = `${modelId}/`;
      if (relative.startsWith(prefix)) {
        const response = await readModelPackFileResponse(modelId, relative.slice(prefix.length));
        if (response) return response;
      }
    }
    return nativeFetch(url, init);
  };
  return async (input, init) => {
    const requested = new URL(typeof input === "string" ? input : input.url, root);
    const marker = "/resolve/main/";
    if (requested.hostname === "huggingface.co" && requested.pathname.includes(marker)) {
      const [modelId, fileName] = requested.pathname.slice(1).split(marker);
      return fetchLocalFile(new URL(`${modelId}/${fileName}`, root), init);
    }
    if (requested.origin === root.origin) {
      return fetchLocalFile(requested, init);
    }
    return new Response("External model requests are disabled.", { status: 403, statusText: "Forbidden" });
  };
}

async function resolveAssetSource(option, requestedSource = "auto") {
  if (["imported", "handles", "opfs", "bundled"].includes(requestedSource)) return requestedSource;
  if (option.assetMode !== "installable") return "bundled";
  const pack = await getModelPackState(option);
  return pack.ready && ["imported", "handles", "opfs"].includes(pack.source) ? pack.source : "bundled";
}

async function loadTransformersRuntime(option, assetSource) {
  const runtime = await import("../../vendor/transformers/transformers.web.js");
  runtime.env.allowLocalModels = true;
  // Transformers.js uses its remote metadata path to discover tokenizer files.
  // Every Hugging Face request is remapped to the selected same-origin pack.
  runtime.env.allowRemoteModels = true;
  runtime.env.localModelPath = modelBaseUrl(assetSource);
  runtime.env.fetch = localOnlyModelFetch(runtime.env.localModelPath, assetSource, option.modelId);
  runtime.env.useBrowserCache = true;
  if (runtime.env.backends?.onnx?.wasm) {
    runtime.env.backends.onnx.wasm.wasmPaths = wasmRuntimePaths(option);
    runtime.env.backends.onnx.wasm.proxy = false;
    if (option.wasmRuntime === "standard") runtime.env.backends.onnx.wasm.numThreads = 1;
  }
  return runtime;
}

async function loadGlinerRuntime(option, assetSource) {
  const [{ Gliner }, xenovaRuntime] = await Promise.all([
    import("../../vendor/gliner/index.mjs"),
    import("../../vendor/xenova-transformers/transformers.min.js")
  ]);
  xenovaRuntime.env.allowLocalModels = true;
  xenovaRuntime.env.allowRemoteModels = false;
  xenovaRuntime.env.localModelPath = modelBaseUrl(assetSource);
  xenovaRuntime.env.fetch = localOnlyModelFetch(xenovaRuntime.env.localModelPath, assetSource, option.modelId);
  xenovaRuntime.env.useBrowserCache = true;
  return { Gliner };
}

function normalizeGlinerSpan(span = {}) {
  return {
    entity_group: span.label || "PII",
    word: span.spanText || "",
    start: span.start,
    end: span.end,
    score: span.score || 0
  };
}

async function glinerModelPath(option, assetSource) {
  const modelPath = option.onnxModelPath || "onnx/model_quint8.onnx";
  if (assetSource === "handles" || assetSource === "opfs") {
    const response = await readModelPackFileResponse(option.modelId, modelPath);
    if (!response) throw new Error("The selected model folder is missing files it needs — try reimporting it.");
    return URL.createObjectURL(await response.blob());
  }
  return new URL(`${option.modelId}/${modelPath}`, modelBaseUrl(assetSource)).href;
}

async function createGlinerPipelineFactory(option, assetSource) {
  const { Gliner } = await loadGlinerRuntime(option, assetSource);
  const candidate = deidModelCandidates(option)[0];
  const executionProvider = candidate?.options?.device || "wasm";
  const gliner = new Gliner({
    tokenizerPath: option.modelId,
    onnxSettings: {
      modelPath: await glinerModelPath(option, assetSource),
      executionProvider,
      wasmPaths: new URL("../../vendor/gliner/onnxruntime-web/", import.meta.url).href,
      fetchBinary: executionProvider === "wasm",
      multiThread: false
    },
    transformersSettings: {
      allowLocalModels: true,
      useBrowserCache: true
    },
    maxWidth: 12,
    modelType: "span-level"
  });
  await gliner.initialize();
  return async function glinerPipeline(text) {
    const result = await gliner.inference_with_chunking({
      texts: [text],
      entities: GLINER_PII_LABELS,
      flatNer: true,
      threshold: 0.35
    });
    const spans = Array.isArray(result?.[0]) ? result[0] : result;
    return (spans || []).map(normalizeGlinerSpan);
  };
}

export function getAdvancedDeidStatus() {
  return { ...statusFor(activeModelKey) };
}

export function getSelectedDeidModelStatus(modelKey = activeModelKey) {
  return { ...statusFor(modelKey) };
}

export function getLoadedDeidModelStatuses() {
  return [...modelStatuses.values()]
    .filter((status) => status?.ready)
    .map((status) => ({ ...status }));
}

export async function getAdvancedDeidentifier({ modelKey = DEFAULT_DEID_MODEL_KEY, assetSource = "auto", onStatus } = {}) {
  const option = deidModelOptionByKey(modelKey);
  activeModelKey = option.key;
  if (!option.browserRunnable) {
    setStatus({
      message: option.disabledReason || `${option.label} is not available in the browser.`,
      ready: false,
      modelId: option.modelId,
      modelStatus: "unavailable",
      modelKey: option.key,
      label: option.label
    }, onStatus);
    throw new Error(option.disabledReason || `${option.label} cannot run in this browser build.`);
  }
  await ensureWebGpuRuntime(option);
  const resolvedSource = await resolveAssetSource(option, assetSource);
  const deidentifierKey = `${option.key}:${resolvedSource}`;
  if (!deidentifierPromises.has(deidentifierKey)) {
    setStatus({
      message: `Loading ${option.shortLabel || option.label} runtime...`,
      ready: false,
      modelStatus: "loading runtime",
      modelId: option.modelId,
      modelKey: option.key,
      label: option.label
    }, onStatus);
    const runtimePromise = option.engine === "gliner"
      ? createGlinerPipelineFactory(option, resolvedSource).then((glinerPipeline) => ({ pipeline: async () => glinerPipeline }))
      : loadTransformersRuntime(option, resolvedSource);
    const deidentifierPromise = runtimePromise.then((runtime) =>
      createDeidentifier({
        pipelineFactory: runtime.pipeline,
        mode: "hybrid",
        modelCandidates: deidModelCandidates(option),
        onModelStatus: (status) => setStatus({
          ...status,
          modelKey: option.key,
          label: option.label,
          modelStatus: status.modelStatus === "primary model" ? option.label : status.modelStatus
        }, onStatus)
      })
    ).catch((error) => {
      deidentifierPromises.delete(deidentifierKey);
      setStatus({
        message: `${option.shortLabel || option.label} couldn't start on this device${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
        ready: false,
        modelId: option.modelId,
        modelStatus: "runtime failed",
        modelKey: option.key,
        label: option.label
      }, onStatus);
      throw error;
    });
    deidentifierPromises.set(deidentifierKey, deidentifierPromise);
  }
  return deidentifierPromises.get(deidentifierKey);
}

export async function preloadAdvancedDeidModel({ modelKey = DEFAULT_DEID_MODEL_KEY, assetSource = "auto", onStatus, onProgress } = {}) {
  const option = deidModelOptionByKey(modelKey);
  try {
    const deidentifier = await getAdvancedDeidentifier({ modelKey: option.key, assetSource, onStatus });
    await deidentifier.loadModel({ onProgress });
    return getSelectedDeidModelStatus(option.key);
  } catch (error) {
    await invalidateRuntimeVerification(option, error);
    setStatus({
      message: `${option.shortLabel || option.label} couldn't load on this device${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
      ready: false,
      modelId: option.modelId,
      modelStatus: "load failed",
      modelKey: option.key,
      label: option.label
    }, onStatus);
    throw error;
  }
}

export async function verifyAdvancedDeidModel({ modelKey = DEFAULT_DEID_MODEL_KEY, assetSource = "auto", onStatus, onProgress } = {}) {
  const option = deidModelOptionByKey(modelKey);
  try {
    const deidentifier = await getAdvancedDeidentifier({ modelKey: option.key, assetSource, onStatus });
    await deidentifier.loadModel({ onProgress });
    const result = await deidentifier.detectModelEntities("Synthetic Patient Jane Smith MRN 123456.", { onProgress });
    if (!result.modelId || result.modelChunkFailures) {
      throw new Error(`${option.label} loaded but failed a quick check — try verifying it again.`);
    }
    return getSelectedDeidModelStatus(option.key);
  } catch (error) {
    await invalidateRuntimeVerification(option, error);
    throw error;
  }
}

export async function deidentifyText(rawText, { mode = "advanced", allowStructuredFallback = false, assetSource = "auto", admissionDate = null, onStatus, onProgress } = {}) {
  const anchor = admissionDate ? new Date(admissionDate) : null;
  if (mode === STRUCTURED_DEID_MODE) {
    return deidentifyTextStructuredOnly(rawText, anchor);
  }
  const option = deidModelOptionByKey(mode === "advanced" ? DEFAULT_DEID_MODEL_KEY : mode);
  try {
    const deidentifier = await getAdvancedDeidentifier({ modelKey: option.key, assetSource, onStatus });
    // Selected-model runs are fail-closed: do not substitute the legacy
    // structured fallback or an incomplete model pass for the chosen model.
    await deidentifier.loadModel({ onProgress });
    const result = await deidentifier.deidentifyText(rawText, {
      mode: "hybrid",
      admissionDate: anchor,
      onProgress
    });
    if (!result.modelId || result.modelChunkFailures) {
      const message = `${option.shortLabel || option.label} unavailable. Select Structured only if you want to run the fallback redactor.`;
      setStatus({
        message,
        ready: false,
        modelId: option.modelId,
        modelStatus: "model unavailable",
        modelKey: option.key,
        label: option.label
      }, onStatus);
      if (!allowStructuredFallback) {
        throw new Error(message);
      }
    }
    return result;
  } catch (error) {
    await invalidateRuntimeVerification(option, error);
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    const message = `${option.shortLabel || option.label} unavailable${detail}. Select Structured only if you want to run the fallback redactor.`;
    setStatus({
      message,
      ready: false,
      modelId: option.modelId,
      modelStatus: "model unavailable",
      modelKey: option.key,
      label: option.label
    }, onStatus);
    if (!allowStructuredFallback) {
      throw new Error(message);
    }
    return deidentifyTextStructuredOnly(rawText, anchor);
  }
}
