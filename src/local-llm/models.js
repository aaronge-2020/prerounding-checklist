// Curated browser model catalog. Never hydrate it from a public catalog at runtime.
// Sources and evaluation gates: docs/local-model-review.md. Estimates are not
// measured fit or clinical validation; every load requires a local self-test.
export const WEBLLM_VERSION = "0.2.85";
export const LOCAL_MODEL_CATALOG_REVISION = "20261015-hardware-models";
export const LOCAL_LLM_MODELS = Object.freeze([
  {
    "key": "qwen3.5-0.8b",
    "webllmId": "Qwen3.5-0.8B-q4f16_1-MLC",
    "label": "Qwen3.5 0.8B",
    "params": "0.8B parameters",
    "vramMB": 1757.49,
    "approxDownloadMB": 426,
    "contextWindow": 8192,
    "minDeviceMemoryGB": 2,
    "rank": 20,
    "blurb": "Smallest download; suitable for short draft experiments.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC/resolve/0ec138972555613c1d7812a821778ad0398c8790/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3.5-0.8B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 8192,
      "max_history_size": 1
    }
  },
  {
    "key": "qwen3-1.7b",
    "webllmId": "Qwen3-1.7B-q4f16_1-MLC",
    "label": "Qwen3 1.7B",
    "params": "1.7B parameters",
    "vramMB": 2036.66,
    "approxDownloadMB": 939,
    "contextWindow": 4096,
    "minDeviceMemoryGB": 2,
    "rank": 10,
    "blurb": "Previous-generation lightweight option.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 4096
    }
  },
  {
    "key": "qwen3.5-2b",
    "webllmId": "Qwen3.5-2B-q4f16_1-MLC",
    "label": "Qwen3.5 2B",
    "params": "2B parameters",
    "vramMB": 2501.44,
    "approxDownloadMB": 1032,
    "contextWindow": 16384,
    "minDeviceMemoryGB": 2,
    "rank": 40,
    "blurb": "Balanced starting point when GPU memory is unknown.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/dd74e9c8a20c4546df85c844103bff87b6dcacad/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3.5-2B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 16384,
      "max_history_size": 1
    }
  },
  {
    "key": "qwen3-4b",
    "webllmId": "Qwen3-4B-q4f16_1-MLC",
    "label": "Qwen3 4B",
    "params": "4B parameters",
    "vramMB": 3431.59,
    "approxDownloadMB": 2174,
    "contextWindow": 4096,
    "minDeviceMemoryGB": 8,
    "rank": 30,
    "blurb": "Previous-generation larger option.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/resolve/a5c9fab855e3ccbdfed2e7e69683d75f30332161/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 4096
    }
  },
  {
    "key": "qwen3.5-4b",
    "webllmId": "Qwen3.5-4B-q4f16_1-MLC",
    "label": "Qwen3.5 4B",
    "params": "4B parameters",
    "vramMB": 4379.82,
    "approxDownloadMB": 2280,
    "contextWindow": 16384,
    "minDeviceMemoryGB": 8,
    "rank": 50,
    "blurb": "Larger draft model for devices with more memory.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC/resolve/44b42469f9e192814bfd90440e3b377d89ba7a13/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 16384,
      "max_history_size": 1
    }
  },
  {
    "key": "qwen3.5-9b",
    "webllmId": "Qwen3.5-9B-q4f16_1-MLC",
    "label": "Qwen3.5 9B",
    "params": "9B parameters",
    "vramMB": 7201.01,
    "approxDownloadMB": 4827,
    "contextWindow": 16384,
    "minDeviceMemoryGB": 8,
    "rank": 60,
    "blurb": "Largest option; confirm available GPU or unified memory first.",
    "requiredFeatures": [
      "shader-f16"
    ],
    "modelUrl": "https://huggingface.co/mlc-ai/Qwen3.5-9B-q4f16_1-MLC/resolve/c7c5d3f5a81e37b8facbb72970940a1b131314a8/",
    "modelLibUrl": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0/web-llm-models/v0_2_84/base/Qwen3.5-9B-q4f16_1_cs1k-webgpu.wasm",
    "overrides": {
      "context_window_size": 16384,
      "max_history_size": 1
    }
  }
].map(model => Object.freeze(model)));

export function localLlmModelByKey(key) {
  return LOCAL_LLM_MODELS.find(model => model.key === key) || null;
}

export function readHardwareFacts(nav) {
  const source = nav || (typeof navigator !== "undefined" ? navigator : {});
  return Object.freeze({
    deviceMemoryGB: typeof source.deviceMemory === "number" ? source.deviceMemory : null,
    hardwareConcurrency: typeof source.hardwareConcurrency === "number" ? source.hardwareConcurrency : null,
    platform: String(source.platform || source.userAgentData?.platform || ""),
    userAgent: String(source.userAgent || "")
  });
}

export async function inspectWebGpu(nav) {
  try {
    const source = nav || (typeof navigator !== "undefined" ? navigator : {});
    const adapter = await source.gpu?.requestAdapter?.({ powerPreference: "high-performance" });
    if (!adapter) return { available: false };
    const info = adapter.info || {};
    return {
      available: true,
      shaderF16: adapter.features ? adapter.features.has("shader-f16") : null,
      maxBufferSize: adapter.limits?.maxBufferSize ?? null,
      maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize ?? null,
      adapterDescription: [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" ")
    };
  } catch { return { available: false }; }
}

export async function detectWebGpu(nav) {
  return (await inspectWebGpu(nav)).available;
}

// deviceMemory is a rounded, privacy-capped system RAM hint, never GPU VRAM.
// Explicit capacity is optional, session-only, and labeled as user supplied.
export function recommendLocalLlmModels(facts, gpu, capacity = {}) {
  const capabilities = typeof gpu === "boolean" ? { available: gpu } : gpu || {};
  const memory = facts?.deviceMemoryGB;
  const knownCapacity = Number.isFinite(capacity.memoryGB) && capacity.memoryGB >= 1 && capacity.memoryGB <= 256 && ["dedicated", "unified"].includes(capacity.memoryKind);
  const budgetMB = knownCapacity ? capacity.memoryGB * 1024 * (capacity.memoryKind === "dedicated" ? 0.8 : 0.55) : null;
  const models = LOCAL_LLM_MODELS.map(model => {
    let available = true;
    let note = "GPU memory is not reported by the browser. Load and self-test to check compatibility.";
    if (!capabilities.available) { available = false; note = "Requires WebGPU. Enable a supported browser and GPU."; }
    else if (capabilities.shaderF16 === false) { available = false; note = "Requires the shader-f16 WebGPU feature; this adapter does not expose it."; }
    else if (typeof memory === "number" && memory < model.minDeviceMemoryGB) { available = false; note = `Needs about ${model.minDeviceMemoryGB}GB+ system memory; this browser reports ${memory}GB.`; }
    else if (budgetMB !== null && model.vramMB > budgetMB) { available = false; note = "Exceeds the estimated memory budget after reserving headroom. Choose a smaller model."; }
    else if (budgetMB !== null) note = `Estimated fit using your ${capacity.memoryGB}GB capacity; actual load and self-test are still required.`;
    else if (typeof memory !== "number") note = "This browser does not report device memory or GPU VRAM; fit cannot be confirmed.";
    return { model, available, note };
  });
  const available = models.filter(entry => entry.available).map(entry => entry.model);
  let candidates = available;
  if (budgetMB === null) {
    const preferred = typeof memory === "number" && memory >= 8 ? "qwen3.5-4b" : "qwen3.5-2b";
    candidates = available.filter(model => model.key === preferred);
    if (!candidates.length) candidates = available.filter(model => model.key === "qwen3.5-0.8b");
  }
  const recommendedKey = candidates.slice().sort((a, b) => b.rank - a.rank)[0]?.key || available[0]?.key || null;
  return Object.freeze({
    webgpuAvailable: !!capabilities.available, gpu: capabilities,
    deviceMemoryGB: typeof memory === "number" ? memory : null,
    hardwareConcurrency: facts?.hardwareConcurrency ?? null,
    models, availableKeys: available.map(model => model.key), recommendedKey,
    capacity: knownCapacity ? { memoryGB: capacity.memoryGB, memoryKind: capacity.memoryKind } : null
  });
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)} ${units[unit]}`;
}
