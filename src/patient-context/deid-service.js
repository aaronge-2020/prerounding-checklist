import {
  createDeidentifier,
  deidentifyTextStructuredOnly
} from "../vault/deid.js";
import {
  DEFAULT_DEID_MODEL_KEY,
  STRUCTURED_DEID_MODE,
  deidModelCandidates,
  deidModelOptionByKey
} from "./deid-model-options.js";

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

async function loadTransformersRuntime() {
  const runtime = await import("../../vendor/transformers/transformers.web.js");
  runtime.env.allowLocalModels = true;
  runtime.env.allowRemoteModels = false;
  runtime.env.localModelPath = new URL("../../models/", import.meta.url).href;
  runtime.env.useBrowserCache = true;
  if (runtime.env.backends?.onnx?.wasm) {
    runtime.env.backends.onnx.wasm.wasmPaths = {
      mjs: new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs", import.meta.url).href,
      wasm: new URL("../../vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href
    };
    runtime.env.backends.onnx.wasm.proxy = false;
  }
  return runtime;
}

async function loadGlinerRuntime() {
  const [{ Gliner }, xenovaRuntime] = await Promise.all([
    import("../../vendor/gliner/index.mjs"),
    import("../../vendor/xenova-transformers/transformers.min.js")
  ]);
  xenovaRuntime.env.allowLocalModels = true;
  xenovaRuntime.env.allowRemoteModels = false;
  xenovaRuntime.env.localModelPath = new URL("../../models/", import.meta.url).href;
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

function glinerModelPath(modelId) {
  return new URL(`../../models/${modelId}/onnx/model_quint8.onnx`, import.meta.url).href;
}

async function createGlinerPipelineFactory(option) {
  const { Gliner } = await loadGlinerRuntime();
  const candidate = deidModelCandidates(option)[0];
  const executionProvider = candidate?.options?.device || "wasm";
  const gliner = new Gliner({
    tokenizerPath: option.modelId,
    onnxSettings: {
      modelPath: glinerModelPath(option.modelId),
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

export async function getAdvancedDeidentifier({ modelKey = DEFAULT_DEID_MODEL_KEY, onStatus } = {}) {
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
  if (!deidentifierPromises.has(option.key)) {
    setStatus({
      message: `Loading ${option.shortLabel || option.label} runtime...`,
      ready: false,
      modelStatus: "loading runtime",
      modelId: option.modelId,
      modelKey: option.key,
      label: option.label
    }, onStatus);
    const runtimePromise = option.engine === "gliner"
      ? createGlinerPipelineFactory(option).then((glinerPipeline) => ({ pipeline: async () => glinerPipeline }))
      : loadTransformersRuntime();
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
      deidentifierPromises.delete(option.key);
      setStatus({
        message: `${option.shortLabel || option.label} failed to initialize: ${error instanceof Error ? error.message : "unknown error"}`,
        ready: false,
        modelId: option.modelId,
        modelStatus: "runtime failed",
        modelKey: option.key,
        label: option.label
      }, onStatus);
      throw error;
    });
    deidentifierPromises.set(option.key, deidentifierPromise);
  }
  return deidentifierPromises.get(option.key);
}

export async function preloadAdvancedDeidModel({ modelKey = DEFAULT_DEID_MODEL_KEY, onStatus, onProgress } = {}) {
  const option = deidModelOptionByKey(modelKey);
  try {
    const deidentifier = await getAdvancedDeidentifier({ modelKey: option.key, onStatus });
    await deidentifier.loadModel({ onProgress });
    return getSelectedDeidModelStatus(option.key);
  } catch (error) {
    setStatus({
      message: `${option.shortLabel || option.label} failed to load: ${error instanceof Error ? error.message : "unknown error"}`,
      ready: false,
      modelId: option.modelId,
      modelStatus: "load failed",
      modelKey: option.key,
      label: option.label
    }, onStatus);
    throw error;
  }
}

export async function deidentifyText(rawText, { mode = "advanced", allowStructuredFallback = false, onStatus, onProgress } = {}) {
  if (mode === STRUCTURED_DEID_MODE) {
    return deidentifyTextStructuredOnly(rawText, new Date());
  }
  const option = deidModelOptionByKey(mode === "advanced" ? DEFAULT_DEID_MODEL_KEY : mode);
  try {
    const deidentifier = await getAdvancedDeidentifier({ modelKey: option.key, onStatus });
    // Advanced mode is fail-closed: do not let the lower-level hybrid helper
    // return structured-only output as though the selected model ran.
    await deidentifier.loadModel({ onProgress });
    const result = await deidentifier.deidentifyText(rawText, { onProgress });
    if (!result.modelId && /Model unavailable/i.test(result.modelStatus || "")) {
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
    return deidentifyTextStructuredOnly(rawText, new Date());
  }
}
