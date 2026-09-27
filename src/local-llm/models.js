// Registry of browser-local LLM options plus hardware detection used to
// recommend which models a device can actually run. Pure module: no DOM,
// no network. The navigator-dependent parts take an injected navigator-like
// object so the recommendation rules stay unit-testable in node.

export const WEBLLM_VERSION = "0.2.85";

// Vendored WebLLM runtime (vendor/web-llm/index.js). The model weights,
// tokenizer, and compiled WebGPU model libraries download from Hugging Face
// and the MLC binary host on first use and are cached by the browser.
export const LOCAL_LLM_MODELS = Object.freeze([
  Object.freeze({
    key: "qwen3-1.7b",
    webllmId: "Qwen3-1.7B-q4f16_1-MLC",
    label: "Qwen3 1.7B",
    params: "1.7B parameters",
    // From WebLLM's prebuilt app config (vram_required_MB).
    vramMB: 2037,
    approxDownloadMB: 1100,
    contextWindow: 4096,
    // Minimum navigator.deviceMemory (GB) for this model to be offered.
    minDeviceMemoryGB: 2,
    blurb: "Fastest option. Good for note parsing and chat on most laptops."
  }),
  Object.freeze({
    key: "qwen3-4b",
    webllmId: "Qwen3-4B-q4f16_1-MLC",
    label: "Qwen3 4B",
    params: "4B parameters",
    vramMB: 3432,
    approxDownloadMB: 2500,
    contextWindow: 4096,
    minDeviceMemoryGB: 8,
    blurb: "Smarter and slower. Best on machines with 16GB+ RAM like Apple Silicon Macs."
  })
]);

export function localLlmModelByKey(key) {
  return LOCAL_LLM_MODELS.find((m) => m.key === key) || null;
}

// Synchronous hardware facts. `nav` defaults to the real navigator; tests
// inject fakes. WebGPU support itself is async and handled separately.
export function readHardwareFacts(nav) {
  const source = nav || (typeof navigator !== "undefined" ? navigator : {});
  const deviceMemory = typeof source.deviceMemory === "number" ? source.deviceMemory : null;
  const hardwareConcurrency =
    typeof source.hardwareConcurrency === "number" ? source.hardwareConcurrency : null;
  const platform = String(source.platform || source.userAgentData?.platform || "");
  const userAgent = String(source.userAgent || "");
  return Object.freeze({ deviceMemoryGB: deviceMemory, hardwareConcurrency, platform, userAgent });
}

// Async WebGPU check. Resolves true only when an adapter can actually be
// requested; false when the API is missing or the request fails.
export async function detectWebGpu(nav) {
  try {
    const source = nav || (typeof navigator !== "undefined" ? navigator : {});
    if (!source.gpu || typeof source.gpu.requestAdapter !== "function") return false;
    const adapter = await source.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Decide which models to offer and which to recommend, from hardware facts.
// Never throws; unknown facts degrade to conservative recommendations.
export function recommendLocalLlmModels(facts, webgpuAvailable) {
  const memory = facts?.deviceMemoryGB;
  const perModel = LOCAL_LLM_MODELS.map((model) => {
    let available = true;
    let note = "";
    if (!webgpuAvailable) {
      available = false;
      note = "Requires WebGPU, which this browser does not provide.";
    } else if (typeof memory === "number" && memory < model.minDeviceMemoryGB) {
      available = false;
      note = `Needs about ${model.minDeviceMemoryGB}GB+ device memory; this device reports ${memory}GB.`;
    } else if (typeof memory !== "number") {
      note = "This browser does not report device memory, so fit cannot be confirmed.";
    }
    return { model, available, note };
  });
  const available = perModel.filter((entry) => entry.available).map((entry) => entry.model);
  // Recommend the largest model that is comfortably within known memory, or
  // the smallest available model when memory is unknown.
  let recommendedKey = null;
  if (available.length) {
    if (typeof memory === "number") {
      recommendedKey = available[available.length - 1].key;
    } else {
      recommendedKey = available[0].key;
    }
  }
  return Object.freeze({
    webgpuAvailable: !!webgpuAvailable,
    deviceMemoryGB: typeof memory === "number" ? memory : null,
    hardwareConcurrency: facts?.hardwareConcurrency ?? null,
    models: perModel,
    availableKeys: available.map((m) => m.key),
    recommendedKey
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
