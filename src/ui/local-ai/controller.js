// Controller for the Local AI view: model download/select lifecycle, chat,
// and the note-parsing preference. Owns the shared worker client and
// re-renders the view on status changes. Pure markup comes from
// src/ui/local-ai/presentation.js.

import {
  localLlmModelByKey,
  readLocalLlmSettings,
  sharedLocalLlmClient,
  writeLocalLlmSettings
} from "../../local-llm/client.js?v=20260927-local-llm-v3";
import { createLocalAiPresentation } from "./presentation.js?v=20260927-local-llm-v3";

export function createLocalAiController({ app, byId, escapeHtml, icon, setStatus, render }) {
  const presentation = createLocalAiPresentation({ escapeHtml, icon });
  const client = sharedLocalLlmClient();
  const state = {
    hardware: null,
    hardwarePromise: null,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false },
    downloadInFlight: false
  };

  function settings() {
    return readLocalLlmSettings();
  }

  function ensureHardware() {
    if (state.hardware || state.hardwarePromise) return state.hardwarePromise;
    state.hardwarePromise = client
      .getLocalLlmHardwareReport()
      .then((report) => {
        state.hardware = report;
        const current = settings();
        if (!current.selectedModelKey && report.recommendation.recommendedKey) {
          writeLocalLlmSettings({ selectedModelKey: report.recommendation.recommendedKey });
        }
        if (!state.chat.modelKey) {
          const key = settings().selectedModelKey || report.recommendation.recommendedKey || "";
          state.chat.modelKey = key;
          state.chat.modelLabel = localLlmModelByKey(key)?.label || "";
        }
        render();
      })
      .catch(() => {
        state.hardware = { facts: {}, recommendation: { webgpuAvailable: false, models: [], availableKeys: [], recommendedKey: null } };
        render();
      });
    return state.hardwarePromise;
  }

  function viewRoot() {
    return byId("localAiContent");
  }

  function renderView() {
    const root = viewRoot();
    if (!root) return;
    ensureHardware();
    root.innerHTML = presentation.render({
      hardware: state.hardware,
      settings: settings(),
      llmStatus: client.getStatus(),
      chat: state.chat
    });
    const messages = root.querySelector("[data-local-ai-messages]");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  // Keep the view live while models download or chat streams.
  client.onStatusChange(() => {
    if (app.view === "localAi") renderView();
  });

  async function downloadModel(modelKey) {
    if (state.downloadInFlight) return;
    const model = localLlmModelByKey(modelKey);
    if (!model) return;
    state.downloadInFlight = true;
    setStatus(`Downloading ${model.label} — about ${model.approxDownloadMB.toLocaleString()} MB on first use.`);
    try {
      await client.ensureReady(modelKey);
      writeLocalLlmSettings({ selectedModelKey: modelKey });
      state.chat.modelKey = modelKey;
      state.chat.modelLabel = model.label;
      setStatus(`${model.label} downloaded, self-tested, and verified.`);
    } catch (error) {
      setStatus(`Local AI failed: ${error?.message || "unknown error"}`);
    } finally {
      state.downloadInFlight = false;
      render();
    }
  }

  async function sendChat(text) {
    const message = String(text || "").trim();
    if (!message || state.chat.streaming) return;
    const status = client.getStatus();
    if (status.status !== "ready" || !status.verified) {
      setStatus("Download and verify a model before chatting.");
      return;
    }
    // Switch models if the chat picker chose a different downloaded one.
    if (state.chat.modelKey && state.chat.modelKey !== status.activeModelKey) {
      await downloadModel(state.chat.modelKey);
    }
    state.chat.messages.push({ role: "user", text: message });
    state.chat.streaming = true;
    state.chat.streamingText = "";
    renderView();
    const history = [
      {
        role: "system",
        content:
          "You are a helpful assistant running entirely in the user's browser. Be concise. " +
          "You are not a medical professional; do not provide diagnosis or treatment recommendations."
      },
      ...state.chat.messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))
    ];
    try {
      const full = await client.chat(history, {
        maxTokens: 1024,
        temperature: 0.7,
        onToken: (token) => {
          state.chat.streamingText += token;
          const box = viewRoot()?.querySelector("[data-local-ai-messages]");
          if (box) {
            // Stream without a full re-render: update the in-progress bubble.
            const last = box.querySelector(".local-ai-message--assistant:last-child p");
            if (last) {
              last.innerHTML = `${escapeHtml(state.chat.streamingText)}<span class="local-ai-caret" aria-hidden="true">▍</span>`;
              box.scrollTop = box.scrollHeight;
            }
          }
        }
      });
      state.chat.messages.push({ role: "assistant", text: full });
    } catch (error) {
      state.chat.messages.push({ role: "assistant", text: `Error: ${error?.message || "generation failed"}` });
    } finally {
      state.chat.streaming = false;
      state.chat.streamingText = "";
      renderView();
    }
  }

  function click(target) {
    const actionTarget = target.closest?.("[data-action]");
    if (!actionTarget) return false;
    const action = actionTarget.dataset.action;
    if (action === "local-ai-download") {
      void downloadModel(actionTarget.dataset.modelKey);
      return true;
    }
    if (action === "local-ai-select") {
      const key = actionTarget.dataset.modelKey;
      writeLocalLlmSettings({ selectedModelKey: key });
      state.chat.modelKey = key;
      state.chat.modelLabel = localLlmModelByKey(key)?.label || "";
      setStatus(`Selected ${localLlmModelByKey(key)?.label || key}. Download it to use.`);
      render();
      return true;
    }
    if (action === "local-ai-unload") {
      void client.unload().then(() => {
        setStatus("Local model unloaded. Downloads are cached by the browser.");
        render();
      });
      return true;
    }
    if (action === "local-ai-new-chat") {
      state.chat.messages = [];
      state.chat.streamingText = "";
      void client.resetChat();
      renderView();
      return true;
    }
    if (action === "local-ai-send") {
      const form = actionTarget.closest?.("[data-local-ai-chat-form]");
      const input = form?.querySelector("[data-local-ai-chat-input]");
      const text = input?.value || "";
      if (input) input.value = "";
      void sendChat(text);
      return true;
    }
    return false;
  }

  function change(target) {
    if (target.matches?.("[data-local-ai-parsing-toggle]")) {
      writeLocalLlmSettings({ parsingEnabled: target.checked });
      setStatus(target.checked ? "Local AI note parsing enabled." : "Local AI note parsing disabled.");
      return true;
    }
    if (target.matches?.("[data-local-ai-chat-model]")) {
      state.chat.modelKey = target.value;
      state.chat.modelLabel = localLlmModelByKey(target.value)?.label || "";
      return true;
    }
    return false;
  }

  function submit(event) {
    const form = event.target.closest?.("[data-local-ai-chat-form]");
    if (!form) return false;
    event.preventDefault();
    const input = form.querySelector("[data-local-ai-chat-input]");
    const text = input?.value || "";
    if (input) input.value = "";
    void sendChat(text);
    return true;
  }

  // Enter sends, Shift+Enter adds a newline (chat composer convention).
  function keydown(event) {
    if (event.key !== "Enter" || event.shiftKey) return false;
    const input = event.target.closest?.("[data-local-ai-chat-input]");
    if (!input) return false;
    event.preventDefault();
    const text = input.value || "";
    input.value = "";
    void sendChat(text);
    return true;
  }

  return {
    render: renderView,
    click,
    change,
    submit,
    keydown,
    // Exposed for the note-import wiring in the Daily view.
    getClient: () => client,
    getSettings: settings
  };
}
