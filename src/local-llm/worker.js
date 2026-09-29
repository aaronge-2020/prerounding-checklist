// Web Worker host for the browser-local LLM (WebLLM). All model loading and
// inference runs here, off the main thread. Speaks a small postMessage
// protocol with src/local-llm/client.js:
//
//   main -> worker: { id, type: "init", modelId }
//                   { id, type: "chat", messages, maxTokens, temperature, chatOpts }
//                     chatOpts is passed through to the engine request (e.g.
//                     { extraBody: { enable_thinking: false } }).
//                   { id, type: "reset" }
//                   { id, type: "unload" }
//                   { id, type: "cached", modelIds }   (no engine needed)
//   worker -> main: { id, type: "progress", progress, text }
//                   { id, type: "ready", modelId }
//                   { id, type: "token", token }        (streaming chat)
//                   { id, type: "done", text }
//                   { id, type: "cached", results }     ({ [modelId]: boolean })
//                   { id, type: "error", message }
//
// Model weights, tokenizer, and compiled WebGPU libraries download from
// Hugging Face / the MLC binary host on first init and are cached by the
// browser afterwards. Nothing is sent anywhere: inference is fully local.
//
// The offline-mode guard (worker-net-guard.js) MUST stay the first import:
// it wraps fetch/XHR before the vendored runtime evaluates, and the client
// passes the toggle state via the "init" and "offlineMode" messages.
import { setWorkerOfflineMode } from "./worker-net-guard.js?v=20260929-offline-mode-v1";
import { CreateMLCEngine, hasModelInCache } from "../../vendor/web-llm/index.js";

let engine = null;
let engineModelId = "";

function post(message) {
  self.postMessage(message);
}

async function handleInit(id, modelId) {
  if (engine && engineModelId === modelId) {
    post({ id, type: "ready", modelId });
    return;
  }
  if (engine) {
    try {
      await engine.unload();
    } catch {
      // Best effort; a fresh engine replaces it below.
    }
    engine = null;
    engineModelId = "";
  }
  try {
    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        post({
          id,
          type: "progress",
          progress: typeof report.progress === "number" ? report.progress : 0,
          text: String(report.text || "")
        });
      },
      logLevel: "SILENT"
    });
    engineModelId = modelId;
    post({ id, type: "ready", modelId });
  } catch (error) {
    engine = null;
    engineModelId = "";
    post({ id, type: "error", message: error?.message || "Model failed to load." });
  }
}

async function handleChat(id, { messages, maxTokens, temperature, chatOpts }) {
  if (!engine) {
    post({ id, type: "error", message: "Model is not loaded." });
    return;
  }
  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
      // Pass-through for engine request extras (e.g. extra_body to disable
      // chain-of-thought for deterministic extraction tasks).
      ...(chatOpts && chatOpts.extraBody ? { extra_body: chatOpts.extraBody } : {})
    });
    let text = "";
    for await (const chunk of chunks) {
      const token = chunk?.choices?.[0]?.delta?.content || "";
      if (token) {
        text += token;
        post({ id, type: "token", token });
      }
    }
    post({ id, type: "done", text });
  } catch (error) {
    post({ id, type: "error", message: error?.message || "Generation failed." });
  }
}

self.onmessage = async (event) => {
  const message = event.data || {};
  const { id, type } = message;
  try {
    if (type === "init") {
      // The worker cannot read the toggle itself; the client passes it.
      setWorkerOfflineMode(message.offlineMode === true);
      await handleInit(id, message.modelId);
    } else if (type === "offlineMode") {
      // Mid-session toggle: in-flight requests finish, new ones are refused.
      setWorkerOfflineMode(message.offline === true);
    } else if (type === "chat") await handleChat(id, message);
    else if (type === "reset") {
      if (engine) await engine.resetChat();
      post({ id, type: "done", text: "" });
    } else if (type === "unload") {
      if (engine) await engine.unload();
      engine = null;
      engineModelId = "";
      post({ id, type: "done", text: "" });
    } else if (type === "cached") {
      // Ground-truth download check: asks the vendored runtime whether each
      // model's weights are in this browser's cache. Needs no loaded engine.
      const results = {};
      for (const modelId of message.modelIds || []) {
        try {
          results[modelId] = await hasModelInCache(modelId);
        } catch {
          results[modelId] = false;
        }
      }
      post({ id, type: "cached", results });
    } else {
      post({ id, type: "error", message: `Unknown worker message: ${type}` });
    }
  } catch (error) {
    post({ id, type: "error", message: error?.message || "Worker error." });
  }
};
