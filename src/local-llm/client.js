// Main-thread client for the browser-local LLM worker (src/local-llm/worker.js).
// Owns the model lifecycle: hardware-gated selection, visible download/load
// progress, a mandatory self-test before the model is marked verified, and
// chat/parse calls. No DOM here; the UI controller in src/ui/local-ai/
// renders state. Verification follows the same rule as the de-id model packs:
// a model is usable only after it is loaded AND self-tested in this session.

import {
  WEBLLM_VERSION,
  detectWebGpu,
  localLlmModelByKey,
  readHardwareFacts,
  recommendLocalLlmModels
} from "./models.js?v=20260927-local-llm-v1";

// Re-exported for UI modules that resolve the active model label from the
// shared client entry point.
export { localLlmModelByKey };

export const LOCAL_LLM_RUNTIME_VERSION = `webllm@${WEBLLM_VERSION}`;

const SETTINGS_KEY = "prerounding.localLlm.settings.v1";
const VERIFIED_KEY = "prerounding.localLlm.verified.v1";
const SELFTEST_MARKER = "LOCAL-LLM-SELFTEST-OK";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); the session still works,
    // it just won't remember verification across reloads.
  }
}

export function readLocalLlmSettings() {
  const stored = readJson(SETTINGS_KEY) || {};
  return {
    selectedModelKey: typeof stored.selectedModelKey === "string" ? stored.selectedModelKey : "",
    parsingEnabled: stored.parsingEnabled === true
  };
}

export function writeLocalLlmSettings(patch) {
  writeJson(SETTINGS_KEY, { ...readLocalLlmSettings(), ...patch });
}

export function readLocalLlmVerification() {
  return readJson(VERIFIED_KEY);
}

export async function getLocalLlmHardwareReport(nav) {
  const facts = readHardwareFacts(nav);
  const webgpu = await detectWebGpu(nav);
  return { facts, recommendation: recommendLocalLlmModels(facts, webgpu) };
}

export function createLocalLlmClient() {
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  let status = "idle"; // idle | loading | ready | error
  let statusDetail = "";
  let progress = 0;
  let progressText = "";
  let activeModelKey = "";
  let verifiedModelKey = "";
  const listeners = new Set();

  function emit() {
    const snapshot = getStatus();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // Listener errors must not break the client.
      }
    }
  }

  function onStatusChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getStatus() {
    return Object.freeze({
      status,
      statusDetail,
      progress,
      progressText,
      activeModelKey,
      verified: verifiedModelKey !== "" && verifiedModelKey === activeModelKey && status === "ready"
    });
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./worker.js?v=20260927-local-llm-v1", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event) => {
      const message = event.data || {};
      const entry = pending.get(message.id);
      if (message.type === "progress") {
        progress = message.progress;
        progressText = message.text;
        emit();
        return;
      }
      if (message.type === "token") {
        entry?.onToken?.(message.token);
        return;
      }
      if (!entry) return;
      pending.delete(message.id);
      if (message.type === "error") entry.reject(new Error(message.message));
      else entry.resolve(message);
    };
    worker.onerror = (event) => {
      const message = event?.message || "Local model worker failed to start.";
      for (const entry of pending.values()) entry.reject(new Error(message));
      pending.clear();
      status = "error";
      statusDetail = message;
      emit();
    };
    return worker;
  }

  function send(message, { onToken } = {}) {
    const w = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onToken });
      w.postMessage({ ...message, id });
    });
  }

  async function runSelfTest() {
    // Deterministic round-trip: the model must echo a fixed marker. A model
    // that cannot follow this instruction is not trusted for parsing either.
    const reply = await send({
      type: "chat",
      messages: [{ role: "user", content: `Reply with exactly this and nothing else: ${SELFTEST_MARKER}` }],
      maxTokens: 32,
      temperature: 0
    });
    if (!String(reply.text || "").includes(SELFTEST_MARKER)) {
      throw new Error("Self-test failed: the model did not echo the expected marker.");
    }
  }

  // Load (downloading weights on first use) and verify the selected model.
  // Progress is reported through onProgress({ progress, text }); the promise
  // resolves only after the self-test passes.
  async function ensureReady(modelKey, { onProgress } = {}) {
    const model = localLlmModelByKey(modelKey);
    if (!model) throw new Error(`Unknown local model: ${modelKey}`);
    if (status === "ready" && activeModelKey === modelKey && verifiedModelKey === modelKey) {
      return getStatus();
    }
    const report = await getLocalLlmHardwareReport();
    const allowed = report.recommendation.availableKeys.includes(modelKey);
    if (!allowed) {
      throw new Error(
        report.recommendation.webgpuAvailable
          ? `${model.label} is not recommended for this device's hardware.`
          : "WebGPU is required for the local LLM and is not available in this browser."
      );
    }
    status = "loading";
    statusDetail = `Loading ${model.label}…`;
    progress = 0;
    progressText = "";
    activeModelKey = modelKey;
    emit();
    const stopForwarding = onStatusChange((snapshot) => {
      if (snapshot.status === "loading") onProgress?.({ progress: snapshot.progress, text: snapshot.progressText });
    });
    try {
      await send({ type: "init", modelId: model.webllmId });
      statusDetail = "Running self-test…";
      emit();
      await send({ type: "reset" });
      await runSelfTest();
      await send({ type: "reset" });
      verifiedModelKey = modelKey;
      writeJson(VERIFIED_KEY, {
        modelKey,
        webllmId: model.webllmId,
        runtimeVersion: LOCAL_LLM_RUNTIME_VERSION,
        verifiedAt: new Date().toISOString()
      });
      status = "ready";
      statusDetail = `${model.label} ready and verified.`;
      emit();
      return getStatus();
    } catch (error) {
      status = "error";
      statusDetail = error?.message || "Model failed to load.";
      verifiedModelKey = "";
      emit();
      throw error;
    } finally {
      stopForwarding();
    }
  }

  async function chat(messages, { onToken, maxTokens = 1024, temperature = 0.7 } = {}) {
    if (status !== "ready") throw new Error("Load a local model before chatting.");
    const reply = await send({ type: "chat", messages, maxTokens, temperature }, { onToken });
    return reply.text;
  }

  async function resetChat() {
    if (worker) await send({ type: "reset" });
  }

  async function unload() {
    if (worker) {
      try {
        await send({ type: "unload" });
      } catch {
        // Unload is best-effort.
      }
      worker.terminate();
      worker = null;
    }
    pending.clear();
    status = "idle";
    statusDetail = "";
    progress = 0;
    progressText = "";
    activeModelKey = "";
    verifiedModelKey = "";
    emit();
  }

  return {
    onStatusChange,
    getStatus,
    ensureReady,
    chat,
    resetChat,
    unload,
    getLocalLlmHardwareReport
  };
}

let sharedClient = null;

// One client per page: the worker, loaded weights, and verification state are
// shared between the Local AI view, note parsing, and any other consumer.
export function sharedLocalLlmClient() {
  if (!sharedClient) sharedClient = createLocalLlmClient();
  return sharedClient;
}
