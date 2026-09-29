// Main-thread client for the browser-local LLM worker (src/local-llm/worker.js).
// Owns the model lifecycle: hardware-gated selection, visible download/load
// progress, a mandatory self-test before the model is marked verified, and
// chat/parse calls. No DOM here; the UI controller in src/ui/ai-chat/
// renders state. Verification follows the same rule as the de-id model packs:
// a model is usable only after it is loaded AND self-tested in this session.

import {
  WEBLLM_VERSION,
  detectWebGpu,
  LOCAL_LLM_MODELS,
  localLlmModelByKey,
  readHardwareFacts,
  recommendLocalLlmModels
} from "./models.js?v=20260927-local-llm-v4";

// Re-exported for UI modules that resolve the active model label from the
// shared client entry point.
export { localLlmModelByKey };

export const LOCAL_LLM_RUNTIME_VERSION = `webllm@${WEBLLM_VERSION}`;

// A worker round-trip that never answers must fail closed instead of hanging
// the UI forever. Generation of a long chunk on weak hardware can take
// minutes, so the chat default is generous; the timer is cleared the moment
// the worker answers (progress/token messages do not extend it, they only
// prove the worker is alive — a stall with no messages at all still times
// out). Init (model download) has no timeout: its progress is visible in the
// Local AI view and downloads can legitimately take a long time.
export const CHAT_TIMEOUT_MS = 10 * 60 * 1000;

const SETTINGS_KEY = "prerounding.localLlm.settings.v1";
const VERIFIED_KEY = "prerounding.localLlm.verified.v1";
// Per-model download registry: { [modelKey]: { webllmId, downloadedAt } }.
// This is only a fast-path hint for instant UI paint; the worker's "cached"
// probe against the vendored runtime is the ground truth and reconciles
// this registry whenever it runs.
const DOWNLOADED_KEY = "prerounding.localLlm.downloaded.v1";
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
    parsingEnabled: stored.parsingEnabled === true,
    patientContextEnabled: stored.patientContextEnabled !== false,
    // Editable system guidelines (Settings > Local AI guidelines). Empty
    // means "use the built-in default" — see DEFAULT_SYSTEM_GUIDELINES.
    systemGuidelines: typeof stored.systemGuidelines === "string" ? stored.systemGuidelines : "",
    // AI Chat mode: "local" (on-device) or "remote" (ChatGPT). Persisted so
    // the student's choice survives reloads.
    chatMode: stored.chatMode === "remote" ? "remote" : "local"
  };
}

export function writeLocalLlmSettings(patch) {
  writeJson(SETTINGS_KEY, { ...readLocalLlmSettings(), ...patch });
}

export function readLocalLlmVerification() {
  return readJson(VERIFIED_KEY);
}

// Synchronous, best-effort view of which models this browser has downloaded.
// Reconciled against the real cache by cachedModels() below.
export function readLocalLlmDownloaded() {
  const stored = readJson(DOWNLOADED_KEY) || {};
  const out = {};
  for (const model of LOCAL_LLM_MODELS) {
    out[model.key] = !!(stored && stored[model.key]);
  }
  return out;
}

function markModelDownloaded(modelKey, model) {
  const stored = readJson(DOWNLOADED_KEY) || {};
  stored[modelKey] = {
    webllmId: model.webllmId,
    downloadedAt: new Date().toISOString()
  };
  writeJson(DOWNLOADED_KEY, stored);
}

function pruneDownloadedRegistry(keepKeys) {
  const stored = readJson(DOWNLOADED_KEY) || {};
  let changed = false;
  for (const key of Object.keys(stored)) {
    if (!keepKeys.has(key)) {
      delete stored[key];
      changed = true;
    }
  }
  if (changed) writeJson(DOWNLOADED_KEY, stored);
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
  // Restore verification across page loads so a cached model doesn't
  // require re-download. The model files themselves live in the
  // browser's Cache Storage (managed by WebLLM).
  let verifiedModelKey = (() => {
    try {
      const stored = readJson(VERIFIED_KEY);
      return typeof stored?.modelKey === "string" ? stored.modelKey : "";
    } catch {
      return "";
    }
  })();
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
    const w = new Worker(new URL("./worker.js?v=20260928-local-llm-v1", import.meta.url), {
      type: "module"
    });
    worker = w;
    w.onmessage = (event) => {
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
    w.onerror = (event) => {
      const message = event?.message || "Local model worker failed to start.";
      for (const entry of pending.values()) entry.reject(new Error(message));
      pending.clear();
      status = "error";
      statusDetail = message;
      // Drop the dead worker so the next send() spawns a fresh one. Posting
      // into a crashed worker silently drops the message, which used to hang
      // the awaiting promise forever.
      try {
        w.terminate();
      } catch {
        // Already dead.
      }
      if (worker === w) worker = null;
      emit();
    };
    return w;
  }

  function send(message, { onToken, timeoutMs = 0, timeoutMessage = "Local model timed out." } = {}) {
    const w = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let timer = null;
      const done = (fn) => (value) => {
        if (timer) clearTimeout(timer);
        timer = null;
        pending.delete(id);
        fn(value);
      };
      const entry = { resolve: done(resolve), reject: done(reject), onToken };
      pending.set(id, entry);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = null;
          if (pending.get(id) === entry) {
            pending.delete(id);
            entry.reject(new Error(timeoutMessage));
          }
        }, timeoutMs);
        // Don't keep a Node test process alive for the timeout.
        if (timer && typeof timer.unref === "function") timer.unref();
      }
      try {
        w.postMessage({ ...message, id });
      } catch (error) {
        if (timer) clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
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
      // Weights are confirmed in this browser's cache (they just loaded),
      // so record the download per model. This survives model switches and
      // page reloads; only the loaded/verified state is session-scoped.
      markModelDownloaded(modelKey, model);
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

  async function chat(
    messages,
    { onToken, maxTokens = 1024, temperature = 0.7, chatOpts, timeoutMs = CHAT_TIMEOUT_MS } = {}
  ) {
    if (status !== "ready") throw new Error("Load a local model before chatting.");
    const timeoutMessage =
      `Local AI generation timed out after ${Math.max(1, Math.round(timeoutMs / 60000))} minute(s) ` +
      `waiting for the on-device model. It may be stalled or very slow on this hardware.`;
    const reply = await send(
      { type: "chat", messages, maxTokens, temperature, chatOpts },
      { onToken, timeoutMs, timeoutMessage }
    );
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
    // Downloads stay cached by the browser: the downloaded registry is
    // deliberately NOT cleared here, so other models keep their
    // "Downloaded" status when one model is unloaded or switched.
    emit();
  }

  // Ground-truth per-model download state, from the vendored runtime's own
  // cache check (no engine or WebGPU needed). Returns { [modelKey]: bool }
  // and reconciles the fast-path registry against what is actually cached.
  async function cachedModels() {
    const reply = await send({
      type: "cached",
      modelIds: LOCAL_LLM_MODELS.map((model) => model.webllmId)
    });
    const results = reply?.results || {};
    const out = {};
    const keep = new Set();
    for (const model of LOCAL_LLM_MODELS) {
      const cached = results[model.webllmId] === true;
      out[model.key] = cached;
      if (cached) keep.add(model.key);
    }
    pruneDownloadedRegistry(keep);
    return out;
  }

  return {
    onStatusChange,
    getStatus,
    ensureReady,
    cachedModels,
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
