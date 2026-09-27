// Controller for the Local AI view: model download/select lifecycle, chat,
// and the note-parsing preference. Owns the shared worker client and
// re-renders the view on status changes. Pure markup comes from
// src/ui/local-ai/presentation.js.

import {
  localLlmModelByKey,
  readLocalLlmDownloaded,
  readLocalLlmSettings,
  sharedLocalLlmClient,
  writeLocalLlmSettings
} from "../../local-llm/client.js?v=20260927-local-llm-v6";
import { createLocalAiPresentation } from "./presentation.js?v=20260927-local-llm-v8";
import { buildPrimaryTeamNoteText } from "../../local-llm/patient-context.js?v=20260927-local-llm-v6";
import { buildChatMessages } from "../../local-llm/context-budget.js?v=20260927-local-llm-v1";
import { buildSystemPrompt } from "../../local-llm/system-prompt.js?v=20260927-local-llm-v9";
import { activePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";

export function createLocalAiController({ app, byId, escapeHtml, icon, setStatus, render }) {
  const presentation = createLocalAiPresentation({ escapeHtml, icon });
  const client = sharedLocalLlmClient();
  const state = {
    hardware: null,
    hardwarePromise: null,
    chat: { messages: [], streamingText: "", modelKey: "", modelLabel: "", streaming: false },
    downloadInFlight: false,
    // Per-model download state. The localStorage registry paints instantly;
    // the worker probe (ground truth from the vendored runtime's cache)
    // reconciles it once per page load.
    downloaded: readLocalLlmDownloaded(),
    downloadProbe: null
  };

  function settings() {
    return readLocalLlmSettings();
  }

  // The active patient's primary team note (latest primary_note source
  // capture, falling back to the admission H&P), rebuilt from the vault on
  // every call and never persisted. Empty when the toggle is off or there
  // is no primary note. The full admission context is deliberately NOT
  // sent: with a 4096-token window the model cannot hold it alongside a
  // growing conversation (see context-budget.js).
  function patientContextInfo() {
    const patient = activePatient(app.vault);
    const enabled = settings().patientContextEnabled;
    const text = enabled ? buildPrimaryTeamNoteText(patient) : "";
    return {
      patient,
      enabled,
      text,
      available: text.length > 0,
      patientId: patient?.id || "",
      label: patient ? String(patient.displayLabel || "Active patient") : ""
    };
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
        refreshDownloadedFromCache();
      })
      .catch(() => {
        state.hardware = { facts: {}, recommendation: { webgpuAvailable: false, models: [], availableKeys: [], recommendedKey: null } };
        render();
      });
    return state.hardwarePromise;
  }

  // Ask the vendored runtime which model weights are actually in this
  // browser's cache, and reconcile the instant registry with the answer.
  function refreshDownloadedFromCache() {
    if (state.downloadProbe) return state.downloadProbe;
    state.downloadProbe = client
      .cachedModels()
      .then((result) => {
        state.downloaded = result;
        render();
      })
      .catch(() => {
        // Keep the registry hint; a failed probe must not blank the UI.
      });
    return state.downloadProbe;
  }

  function viewRoot() {
    return byId("localAiContent");
  }

  function renderView() {
    const root = viewRoot();
    if (!root) return;
    ensureHardware();
    // Switching patients starts a fresh chat: the attached context belongs
    // to one patient, and mixing histories across patients is a hazard.
    const pctx = patientContextInfo();
    if (state.chat.patientId && pctx.patientId !== state.chat.patientId) {
      state.chat.messages = [];
      state.chat.streamingText = "";
      state.chat.contextStats = null;
      void client.resetChat();
    }
    state.chat.patientId = pctx.patientId;
    root.innerHTML = presentation.render({
      hardware: state.hardware,
      settings: settings(),
      llmStatus: client.getStatus(),
      chat: state.chat,
      downloaded: state.downloaded,
      patientContext: {
        enabled: pctx.enabled,
        available: pctx.available,
        label: pctx.label,
        hasPatient: !!pctx.patient
      }
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
    const wasCached = !!state.downloaded[modelKey];
    setStatus(
      wasCached
        ? `Loading ${model.label} from this browser's cache…`
        : `Downloading ${model.label} — about ${model.approxDownloadMB.toLocaleString()} MB on first use.`
    );
    try {
      await client.ensureReady(modelKey);
      writeLocalLlmSettings({ selectedModelKey: modelKey });
      state.chat.modelKey = modelKey;
      state.chat.modelLabel = model.label;
      state.downloaded = { ...state.downloaded, [modelKey]: true };
      setStatus(
        wasCached
          ? `${model.label} loaded from cache, self-tested, and verified.`
          : `${model.label} downloaded, self-tested, and verified.`
      );
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
    // Attach the active patient's primary team note as a system message,
    // rebuilt fresh on every send. In-memory only. The system prompt also
    // grounds the model in its real environment: it runs on-device in this
    // browser, inside Aaron Ge's Preround app.
    const pctx = patientContextInfo();
    state.chat.patientId = pctx.patientId;
    const systemContent = buildSystemPrompt({
      contextText: pctx.available ? pctx.text : "",
      guidelines: settings().systemGuidelines
    });
    // Measure the prompt against the loaded model's real context window
    // BEFORE sending: the window is small (4096 tokens), so oldest history
    // messages are dropped first to fit. Usage stats feed the UI's
    // context meter.
    const modelRecord = localLlmModelByKey(state.chat.modelKey);
    const assembled = buildChatMessages({
      systemContent,
      messages: state.chat.messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text
      })),
      contextWindow: modelRecord?.contextWindow || 4096,
      maxTokens: 1024
    });
    state.chat.contextStats = {
      promptTokens: assembled.promptTokens,
      contextWindow: assembled.contextWindow,
      droppedMessages: assembled.droppedMessages
    };
    try {
      const full = await client.chat(assembled.messages, {
        maxTokens: 1024,
        temperature: 0.7,
        onToken: (token) => {
          state.chat.streamingText += token;
          const bubble = viewRoot()?.querySelector("[data-local-ai-streaming]");
          if (bubble) {
            // Stream without a full re-render: repaint the in-progress
            // bubble, splitting <think> reasoning into the collapsed
            // dropdown as it arrives.
            const thinkOpen = bubble.querySelector("details.lai-think")?.open === true;
            bubble.innerHTML =
              `<span class="lai-m-label">${escapeHtml(state.chat.modelLabel)}</span>` +
              presentation.renderStreamingMessage(state.chat.streamingText);
            if (thinkOpen) {
              const details = bubble.querySelector("details.lai-think");
              if (details) details.open = true;
            }
            const box = viewRoot()?.querySelector("[data-local-ai-messages]");
            if (box) box.scrollTop = box.scrollHeight;
          }
        }
      });
      state.chat.messages.push({ role: "assistant", text: full });
    } catch (error) {
      const raw = error?.message || "generation failed";
      // The engine's overflow error ("Prompt tokens exceed context window
      // size…") is confusing — it reports only the new message's tokens.
      // Say what actually happened and what to do, in plain language.
      const overflow = /context window|prompt tokens|sliding_window/i.test(raw);
      state.chat.messages.push({
        role: "assistant",
        text: overflow
          ? "That didn't fit in the on-device model's memory — its context window is small and this conversation grew too long. I've trimmed the oldest messages, so send again, or start a new chat for a clean slate."
          : `Error: ${raw}`
      });
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
      state.chat.contextStats = null;
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
    if (target.matches?.("[data-local-ai-context-toggle]")) {
      writeLocalLlmSettings({ patientContextEnabled: target.checked });
      setStatus(target.checked ? "Patient context attached to Local AI chat." : "Patient context detached from Local AI chat.");
      render();
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
