// Web Worker host for the browser-local LLM (WebLLM). All model loading and
// inference runs here, off the main thread. Speaks a small postMessage
// protocol with src/local-llm/client.js:
//
//   main -> worker: { id, type: "init", modelId }
//                   { id, type: "chat", messages, maxTokens, temperature }
//                   { id, type: "reset" }
//                   { id, type: "unload" }
//   worker -> main: { id, type: "progress", progress, text }
//                   { id, type: "ready", modelId }
//                   { id, type: "token", token }        (streaming chat)
//                   { id, type: "done", text }
//                   { id, type: "error", message }
//
// Model weights, tokenizer, and compiled WebGPU libraries download from
// Hugging Face / the MLC binary host on first init and are cached by the
// browser afterwards. Nothing is sent anywhere: inference is fully local.

import { CreateMLCEngine } from "../../vendor/web-llm/index.js";

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

async function handleChat(id, { messages, maxTokens, temperature }) {
  if (!engine) {
    post({ id, type: "error", message: "Model is not loaded." });
    return;
  }
  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature
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
    if (type === "init") await handleInit(id, message.modelId);
    else if (type === "chat") await handleChat(id, message);
    else if (type === "reset") {
      if (engine) await engine.resetChat();
      post({ id, type: "done", text: "" });
    } else if (type === "unload") {
      if (engine) await engine.unload();
      engine = null;
      engineModelId = "";
      post({ id, type: "done", text: "" });
    } else {
      post({ id, type: "error", message: `Unknown worker message: ${type}` });
    }
  } catch (error) {
    post({ id, type: "error", message: error?.message || "Worker error." });
  }
};
