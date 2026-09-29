// Controller for the AI Chat view: two chat modes behind one streamlined
// interface. "On-device" is the existing local-LLM chat (model
// download/select lifecycle, note parsing) — nothing leaves the browser.
// "ChatGPT" is a remote chat over the student's saved OpenAI key, with a
// rigorous citation system prompt, service tailoring, and a HIPAA review
// gate (second-pass de-identification + human review) before any patient
// context leaves the browser. Pure markup comes from
// src/ui/ai-chat/presentation.js.

import {
  localLlmModelByKey,
  readLocalLlmDownloaded,
  readLocalLlmSettings,
  sharedLocalLlmClient,
  writeLocalLlmSettings
} from "../../local-llm/client.js?v=20260928-local-llm-v1";
import { createAiChatPresentation } from "./presentation.js?v=20260929-ai-chat-v2";
import { requestOpenAiChat } from "../openai-client.js?v=20260928-ai-chat-v1";
import {
  buildRemoteChatInput,
  buildRemoteChatSystemPrompt,
  CHAT_SERVICE_OPTIONS
} from "../../ai/remote-chat.js?v=20260928-ai-chat-v1";
import { deidentifyTextStructuredOnly } from "../../vault/deid.js?v=20260928-ai-chat-v1";
import {
  buildPatientContextFromPieces,
  defaultSelectedPieceIds,
  listPatientContextPieces,
  pieceText,
  textOf,
  MAX_SELECTED_PIECES_CHARS
} from "../../local-llm/patient-context.js?v=20260928-local-llm-v9";
import { CHARS_PER_TOKEN, buildChatMessages, estimateTokens } from "../../local-llm/context-budget.js?v=20260927-local-llm-v1";
import { DEFAULT_SYSTEM_GUIDELINES, buildSystemPrompt } from "../../local-llm/system-prompt.js?v=20260928-local-llm-v10";
import { activePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";

export function createAiChatController({ app, byId, escapeHtml, icon, setStatus, render, getDraftNoteText, currentPreferences, onChatServiceChange }) {
  const presentation = createAiChatPresentation({ escapeHtml, icon });
  const client = sharedLocalLlmClient();
  const state = {
    hardware: null,
    hardwarePromise: null,
    chat: {
      messages: [],
      streamingText: "",
      modelKey: "",
      modelLabel: "",
      streaming: false,
      // In-memory selection of patient-context piece ids for the "Context"
      // inspector. null means "use the defaults" (primary team note when it
      // exists, else the admission sections). Reset on new chat and patient
      // switch; never persisted.
      contextSelection: null,
      inspectorOpen: false
    },
    // Chat mode: "local" (on-device) or "remote" (ChatGPT). Persisted in
    // the local-LLM settings so the choice survives reloads.
    mode: readLocalLlmSettings().chatMode === "remote" ? "remote" : "local",
    remote: {
      messages: [],
      sending: false,
      webSearch: true,
      patientId: "",
      // HIPAA review gate state: set while the student reviews exactly what
      // will be sent to OpenAI (message + second-pass de-identified context).
      review: null
    },
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

  // The student's current draft note, rendered as plain text by the Review
  // controller. Offered as one opt-in piece in the Context inspector; "" when
  // there is no draft yet. Building it is the same work the Review view does
  // on render, so callers compute it once and thread it through.
  function currentDraftNoteText() {
    try {
      return String(getDraftNoteText?.() || "");
    } catch {
      return "";
    }
  }

  // The active patient's selectable context pieces and the current
  // in-memory selection. Selection defaults are computed once per patient;
  // the user can then freely include/exclude pieces in the inspector.
  // Pass a cached draft string to avoid rebuilding the draft twice per render.
  function contextPieces(cachedDraft) {
    const patient = activePatient(app.vault);
    const draft = typeof cachedDraft === "string" ? cachedDraft : currentDraftNoteText();
    const pieces = listPatientContextPieces(patient, { draftNoteText: draft });
    const valid = new Set(pieces.map((piece) => piece.id));
    let selectedIds = state.chat.contextSelection;
    if (!Array.isArray(selectedIds)) {
      selectedIds = defaultSelectedPieceIds(patient);
      state.chat.contextSelection = selectedIds;
    } else {
      // Drop stale ids (chart edits can remove pieces).
      selectedIds = selectedIds.filter((id) => valid.has(id));
    }
    return { patient, pieces, selectedIds };
  }

  // The patient context attached to chat: exactly the pieces the user
  // selected in the inspector, rebuilt from the vault on every call and
  // never persisted. Empty when the toggle is off or nothing is selected.
  function patientContextInfo(cachedDraft) {
    const draft = typeof cachedDraft === "string" ? cachedDraft : currentDraftNoteText();
    const { patient, selectedIds } = contextPieces(draft);
    const enabled = settings().patientContextEnabled;
    const text = enabled ? buildPatientContextFromPieces(patient, selectedIds, { draftNoteText: draft }) : "";
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
    return byId("aiChatContent");
  }

  // The chat composer is a contenteditable rich-text box (so formatted
  // pastes keep their line breaks and structure). Text is extracted as
  // plain text on send — the model receives text, not HTML.
  function composerText(input) {
    if (!input) return "";
    if (typeof input.value === "string") return input.value;
    return input.innerText ?? input.textContent ?? "";
  }

  function clearComposer(input) {
    if (!input) return;
    if (typeof input.value === "string") input.value = "";
    else input.textContent = "";
  }

  function focusComposer() {
    const input = viewRoot()?.querySelector("[data-ai-chat-input]");
    if (input && input.getAttribute("contenteditable") === "true") input.focus();
  }

  function renderView() {
    const root = viewRoot();
    if (!root) return;
    ensureHardware();
    // Switching patients starts a fresh chat: the attached context belongs
    // to one patient, and mixing histories across patients is a hazard.
    // The draft note is built once here and shared by the inspector and the
    // context meter below.
    const draft = currentDraftNoteText();
    const pctx = patientContextInfo(draft);
    if (state.chat.patientId && pctx.patientId !== state.chat.patientId) {
      state.chat.messages = [];
      state.chat.streamingText = "";
      state.chat.contextStats = null;
      state.chat.contextSelection = null;
      void client.resetChat();
      state.remote.messages = [];
      state.remote.review = null;
    }
    state.chat.patientId = pctx.patientId;
    state.remote.patientId = pctx.patientId;
    const { pieces, selectedIds } = contextPieces(draft);
    const selectedSet = new Set(selectedIds);
    const modelRecord = localLlmModelByKey(state.chat.modelKey);
    const contextWindow = modelRecord?.contextWindow || 4096;
    const guidelines = String(settings().systemGuidelines || "").trim() || DEFAULT_SYSTEM_GUIDELINES;
    const guidelinesTokens = estimateTokens(guidelines);
    const historyTokens = estimateTokens(
      state.chat.messages.map((m) => m.text).join("\n")
    );
    const pieceTokens = pieces.reduce(
      (sum, piece) => sum + (selectedSet.has(piece.id) ? Math.ceil(piece.chars / CHARS_PER_TOKEN) : 0),
      0
    );
    const prefs = remotePrefs();
    root.innerHTML = presentation.render({
      hardware: state.hardware,
      settings: settings(),
      llmStatus: client.getStatus(),
      chat: state.chat,
      downloaded: state.downloaded,
      mode: state.mode,
      remote: state.remote,
      chatService: String(prefs.chatService || ""),
      chatServiceOptions: CHAT_SERVICE_OPTIONS,
      hasApiKey: String(prefs.openAiApiKey || "").trim().length > 0,
      patientContext: {
        enabled: pctx.enabled,
        available: pctx.available,
        label: pctx.label,
        hasPatient: !!pctx.patient,
        selectedCount: selectedIds.length,
        pieceCount: pieces.length
      },
      contextInspector: {
        open: state.chat.inspectorOpen,
        enabled: pctx.enabled,
        hasPatient: !!pctx.patient,
        patientLabel: pctx.label,
        pieces: pieces.map((piece) => ({
          id: piece.id,
          group: piece.group,
          label: piece.label,
          primary: piece.primary,
          tokens: Math.ceil(piece.chars / CHARS_PER_TOKEN),
          selected: selectedSet.has(piece.id)
        })),
        guidelinesTokens,
        historyTokens,
        historyCount: state.chat.messages.length,
        selectedTokens: pieceTokens,
        contextWindow
      }
    });
    const messages = root.querySelector("[data-ai-chat-messages]");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  // Keep the view live while models download or chat streams.
  client.onStatusChange(() => {
    if (app.view === "aiChat") renderView();
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
      setStatus(`AI Chat failed: ${error?.message || "unknown error"}`);
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
    // Attach exactly the patient-context pieces the user selected in the
    // "Context" inspector (defaults: primary team note, else admission
    // sections; the current draft note is available as an opt-in piece),
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
    // context meter. Measuring first also lets the prefill indicator say
    // how many tokens the model is chewing through.
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
      droppedMessages: assembled.droppedMessages,
      firstTokenMs: null
    };
    state.chat.streaming = true;
    state.chat.streamingText = "";
    state.chat.firstTokenAt = null;
    renderView();
    // The composer was re-created by the render — put focus back so the
    // user can keep typing.
    focusComposer();
    // Prefill (prompt processing before the first token) can take tens of
    // seconds on-device with a large context attached. Tick a live
    // elapsed-time readout into the "Reading context…" label so the wait
    // visibly progresses instead of looking frozen. Stops at the first
    // token; the finally block stops it on error too.
    const streamStartedAt = Date.now();
    const tickPrefill = () => {
      const label = viewRoot()?.querySelector("[data-ai-chat-thinking-label]");
      if (label && !state.chat.streamingText) {
        const secs = Math.max(1, Math.round((Date.now() - streamStartedAt) / 1000));
        const tokens = state.chat.contextStats?.promptTokens;
        label.textContent = tokens > 0
          ? `Reading ~${tokens.toLocaleString()} tokens of context… ${secs}s`
          : `Thinking… ${secs}s`;
      }
    };
    const prefillTimer = setInterval(tickPrefill, 500);
    try {
      const full = await client.chat(assembled.messages, {
        maxTokens: 1024,
        temperature: 0.7,
        onToken: (token) => {
          if (!state.chat.streamingText) {
            // First token: prefill is over. Stop the elapsed timer and
            // record time-to-first-token for the context meter.
            clearInterval(prefillTimer);
            state.chat.firstTokenAt = Date.now();
            if (state.chat.contextStats) {
              state.chat.contextStats.firstTokenMs = state.chat.firstTokenAt - streamStartedAt;
            }
          }
          state.chat.streamingText += token;
          const bubble = viewRoot()?.querySelector("[data-ai-chat-streaming]");
          if (bubble) {
            // Stream without a full re-render: repaint the in-progress
            // bubble, splitting <think> reasoning into the collapsed
            // dropdown as it arrives.
            const thinkOpen = bubble.querySelector("details.aic-think")?.open === true;
            bubble.innerHTML =
              `<span class="aic-m-label">${escapeHtml(state.chat.modelLabel)}</span>` +
              presentation.renderStreamingMessage(state.chat.streamingText);
            if (thinkOpen) {
              const details = bubble.querySelector("details.aic-think");
              if (details) details.open = true;
            }
            const box = viewRoot()?.querySelector("[data-ai-chat-messages]");
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
      clearInterval(prefillTimer);
      state.chat.streaming = false;
      state.chat.streamingText = "";
      state.chat.firstTokenAt = null;
      renderView();
    }
  }

  // ── Remote (ChatGPT) chat ──────────────────────────────

  function remotePrefs() {
    return currentPreferences ? currentPreferences() : {};
  }

  function setMode(mode) {
    const next = mode === "remote" ? "remote" : "local";
    if (state.mode === next) return;
    state.mode = next;
    writeLocalLlmSettings({ chatMode: next });
    // Switching patients starts a fresh remote chat too: the attached
    // context belongs to one patient, and mixing histories is a hazard.
    setStatus(next === "remote" ? "ChatGPT mode — patient context needs your review before sending." : "On-device mode — nothing leaves this browser.");
    render();
  }

  // HIPAA review gate: runs BEFORE anything is sent to OpenAI when patient
  // context (chart pieces and/or the student's own draft note) is attached.
  // 1. A second deterministic de-identification pass over the assembled
  //    context (the vault already stores de-identified text; this is
  //    defense-in-depth against anything that slipped through).
  // 2. A scan of the student's own message for identifier-like patterns.
  // 3. A human-review modal showing EXACTLY what will be sent — the student
  //    must explicitly confirm. Nothing is sent on modal open.
  // Build the raw (pre-redaction) review pieces: a patient header plus one
  // entry per selected chart document / draft note. Titles shown in the
  // review modal are derived from the REDACTED text so unredacted metadata
  // (e.g. real dates in day-group labels) never renders in the modal.
  function buildHipaaReviewPieces(cachedDraft) {
    const draft = typeof cachedDraft === "string" ? cachedDraft : currentDraftNoteText();
    const { patient, pieces, selectedIds } = contextPieces(draft);
    const wanted = new Set(selectedIds);
    const out = [];
    const headerBits = [`PATIENT: ${textOf(patient?.displayLabel) || "Active patient"}`];
    const admissionDate = textOf(patient?.metadata?.admissionDate);
    if (admissionDate) headerBits.push(`Admitted: ${admissionDate}`);
    out.push({ id: "header", kind: "header", text: headerBits.join("\n") });
    const pieceOpts = { draftNoteText: draft };
    for (const piece of pieces) {
      if (!wanted.has(piece.id)) continue;
      const text = pieceText(patient, piece, pieceOpts);
      if (text) out.push({ id: piece.id, kind: "piece", text });
    }
    return out;
  }

  function openHipaaReview(message, rawPieces) {
    let messageResult;
    try {
      messageResult = deidentifyTextStructuredOnly(message);
    } catch {
      messageResult = { text: message, redactionTotal: 0, flags: [] };
    }
    // Apply the context budget to the raw pieces (same cap the blob
    // assembly used), cutting from the tail, so the reviewed text is
    // exactly the text that will be sent on confirm.
    const budget = Math.max(500, Number(MAX_SELECTED_PIECES_CHARS) || 6000);
    let remaining = budget;
    const capped = [];
    for (const raw of rawPieces) {
      if (remaining <= 0) break;
      let text = raw.text;
      let cut = false;
      if (text.length > remaining) {
        text = `${text.slice(0, Math.max(0, remaining - 3)).trimEnd()}...`;
        cut = true;
      }
      remaining -= text.length + 2; // +2 for the "\n\n" join below
      capped.push({ ...raw, text, cut });
    }
    const pieces = [];
    const redactionCounts = {};
    let redactionTotal = 0;
    let truncated = false;
    for (const raw of capped) {
      if (raw.cut) truncated = true;
      let r;
      try {
        r = deidentifyTextStructuredOnly(raw.text);
      } catch {
        r = null;
      }
      if (!r) {
        r = { text: raw.text, redactionTotal: 0, counts: {}, residualWarnings: [], flags: ["Second de-identification pass failed — review carefully."] };
      }
      const text = String(r.text || "");
      const lines = text.split("\n");
      const firstLine = (lines[0] || "").replace(/^#{1,3}\s*/, "").trim();
      pieces.push({
        id: raw.id,
        title: raw.kind === "header" ? "Patient header" : (firstLine || "Context"),
        text,
        chars: text.length,
        redactionTotal: r.redactionTotal || 0,
        counts: r.counts || {},
        warnings: (r.residualWarnings || []).slice(0, 4).map((w) => w?.snippet || String(w || "")),
        flags: (r.flags || []).slice(0, 4)
      });
      redactionTotal += r.redactionTotal || 0;
      for (const [kind, n] of Object.entries(r.counts || {})) {
        redactionCounts[kind] = (redactionCounts[kind] || 0) + n;
      }
    }
    // The exact string sent on confirm — joined from the reviewed pieces.
    const redactedContext = pieces.map((piece) => piece.text).join("\n\n");
    const residualWarnings = [];
    const flags = [];
    for (const piece of pieces) {
      for (const w of piece.warnings) {
        if (residualWarnings.length < 8) residualWarnings.push(w);
      }
      for (const f of piece.flags) {
        if (flags.length < 6) flags.push(f);
      }
    }
    state.remote.review = {
      message,
      messageRedactionTotal: messageResult.redactionTotal || 0,
      messageFlags: (messageResult.flags || []).slice(0, 6),
      pieces,
      redactedContext,
      redactionTotal,
      redactionCounts,
      residualWarnings,
      flags,
      truncated,
      ack: false,
      expanded: pieces.length ? [pieces[0].id] : []
    };
    render();
  }

  function closeHipaaReview() {
    state.remote.review = null;
    render();
  }

  async function confirmHipaaReview() {
    const review = state.remote.review;
    if (!review || !review.ack) return;
    state.remote.review = null;
    await doRemoteSend(review.message, review.redactedContext);
  }

  async function sendRemoteChat(text) {
    const message = String(text || "").trim();
    if (!message || state.remote.sending) return;
    const prefs = remotePrefs();
    if (!String(prefs.openAiApiKey || "").trim()) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
    // Attach exactly the patient-context pieces the user selected in the
    // "Context" inspector — the same selection the on-device chat uses.
    const pctx = patientContextInfo();
    state.remote.patientId = pctx.patientId;
    if (pctx.enabled && pctx.text) {
      // Patient context (chart and/or the student's own note) is attached:
      // run the HIPAA review gate instead of sending immediately.
      openHipaaReview(message, buildHipaaReviewPieces());
      return;
    }
    await doRemoteSend(message, "");
  }

  async function doRemoteSend(message, contextText) {
    const prefs = remotePrefs();
    const apiKey = String(prefs.openAiApiKey || "").trim();
    if (!apiKey) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
    state.remote.sending = true;
    state.remote.messages.push({ role: "user", text: message });
    render();
    const sentAt = Date.now();
    try {
      const systemPrompt = buildRemoteChatSystemPrompt({ serviceValue: prefs.chatService });
      // History excludes the just-added user message; it is appended last
      // with the (reviewed, de-identified) context attached.
      const history = state.remote.messages.slice(0, -1);
      const input = buildRemoteChatInput({ systemPrompt, history, userMessage: message, contextText });
      const reply = await requestOpenAiChat({
        apiKey,
        model: prefs.openAiModel,
        input,
        tools: state.remote.webSearch ? [{ type: "web_search" }] : []
      });
      state.remote.messages.push({ role: "assistant", text: reply, webSearch: state.remote.webSearch });
    } catch (error) {
      state.remote.messages.push({ role: "assistant", text: `Error: ${error?.message || "the ChatGPT request failed"}` });
    } finally {
      state.remote.sending = false;
      const secs = Math.max(1, Math.round((Date.now() - sentAt) / 1000));
      setStatus(`ChatGPT replied in ${secs}s.`);
      render();
    }
  }

  function click(target) {
    const actionTarget = target.closest?.("[data-action]");
    if (!actionTarget) return false;
    const action = actionTarget.dataset.action;
    if (action === "ai-chat-mode") {
      setMode(actionTarget.dataset.mode);
      return true;
    }
    if (action === "ai-chat-new-chat-remote") {
      state.remote.messages = [];
      state.remote.review = null;
      setStatus("New ChatGPT chat started — conversation cleared. Your patient context selections are unchanged.");
      render();
      return true;
    }
    if (action === "ai-chat-revert-remote") {
      const index = Number.parseInt(actionTarget.dataset.messageIndex || "", 10);
      if (Number.isInteger(index) && index >= 0 && index < state.remote.messages.length) {
        const dropped = state.remote.messages.length - index;
        state.remote.messages = state.remote.messages.slice(0, index);
        setStatus(dropped === 1 ? "Message removed from context." : `${dropped} messages removed from context.`);
      }
      render();
      return true;
    }
    if (action === "ai-chat-send-remote") {
      const form = actionTarget.closest?.("[data-ai-chat-form]");
      const input = form?.querySelector("[data-ai-chat-input]");
      const text = composerText(input);
      clearComposer(input);
      void sendRemoteChat(text);
      return true;
    }
    if (action === "ai-chat-hipaa-confirm") {
      void confirmHipaaReview();
      return true;
    }
    if (action === "ai-chat-hipaa-cancel") {
      // The backdrop carries this action; clicks inside the dialog bubble
      // up to it but must not cancel — only a direct backdrop click does.
      if (target !== actionTarget) return true;
      closeHipaaReview();
      setStatus("Review cancelled — nothing was sent to OpenAI.");
      return true;
    }
    if (action === "ai-chat-hipaa-piece") {
      const review = state.remote.review;
      const pieceId = actionTarget.dataset.piece || "";
      if (review && pieceId) {
        const expanded = new Set(review.expanded || []);
        if (expanded.has(pieceId)) expanded.delete(pieceId);
        else expanded.add(pieceId);
        review.expanded = [...expanded];
        render();
      }
      return true;
    }
    if (action === "ai-chat-download") {
      void downloadModel(actionTarget.dataset.modelKey);
      return true;
    }
    if (action === "ai-chat-select") {
      const key = actionTarget.dataset.modelKey;
      writeLocalLlmSettings({ selectedModelKey: key });
      state.chat.modelKey = key;
      state.chat.modelLabel = localLlmModelByKey(key)?.label || "";
      setStatus(`Selected ${localLlmModelByKey(key)?.label || key}. Download it to use.`);
      render();
      return true;
    }
    if (action === "ai-chat-unload") {
      void client.unload().then(() => {
        setStatus("Local model unloaded. Downloads are cached by the browser.");
        render();
      });
      return true;
    }
    if (action === "ai-chat-new-chat") {
      // New chat clears the conversation only — the user's chosen patient
      // context documents stay as they are, so they don't have to re-pick
      // them for every fresh conversation.
      state.chat.messages = [];
      state.chat.streamingText = "";
      state.chat.contextStats = null;
      void client.resetChat();
      setStatus("New chat started — conversation cleared. Your patient context selections are unchanged.");
      renderView();
      return true;
    }
    if (action === "ai-chat-revert-message") {
      // Revert the conversation to just before this message: drop it and
      // everything after it. Chat history is in-memory only, so this is
      // exactly "removing it from the model's context".
      const index = Number.parseInt(actionTarget.dataset.messageIndex || "", 10);
      if (Number.isInteger(index) && index >= 0 && index < state.chat.messages.length) {
        const dropped = state.chat.messages.length - index;
        state.chat.messages = state.chat.messages.slice(0, index);
        state.chat.contextStats = null;
        setStatus(dropped === 1 ? "Message removed from context." : `${dropped} messages removed from context.`);
      }
      renderView();
      return true;
    }
    if (action === "ai-chat-context-inspector") {
      state.chat.inspectorOpen = !state.chat.inspectorOpen;
      renderView();
      return true;
    }
    if (action === "ai-chat-send") {
      const form = actionTarget.closest?.("[data-ai-chat-form]");
      const input = form?.querySelector("[data-ai-chat-input]");
      const text = composerText(input);
      clearComposer(input);
      void sendChat(text);
      return true;
    }
    return false;
  }

  function change(target) {
    if (target.matches?.("[data-ai-chat-websearch-toggle]")) {
      state.remote.webSearch = target.checked;
      setStatus(target.checked ? "Web search on — ChatGPT will ground citations in real sources." : "Web search off — faster replies, citations from model knowledge.");
      render();
      return true;
    }
    if (target.matches?.("[data-ai-chat-service]")) {
      const value = String(target.value || "");
      if (onChatServiceChange) onChatServiceChange(value);
      return true;
    }
    if (target.matches?.("[data-ai-chat-parsing-toggle]")) {
      writeLocalLlmSettings({ parsingEnabled: target.checked });
      setStatus(target.checked ? "AI Chat note parsing enabled." : "AI Chat note parsing disabled.");
      return true;
    }
    if (target.matches?.("[data-ai-chat-context-toggle]")) {
      writeLocalLlmSettings({ patientContextEnabled: target.checked });
      setStatus(target.checked ? "Patient context attached to AI Chat chat." : "Patient context detached from AI Chat chat.");
      render();
      return true;
    }
    if (target.matches?.("[data-ai-chat-hipaa-ack]")) {
      if (state.remote.review) {
        state.remote.review.ack = !!target.checked;
        render();
      }
      return true;
    }
    if (target.matches?.("[data-ai-chat-context-piece]")) {
      // Include/exclude one chart document from the model's context.
      const pieceId = target.dataset.aiChatContextPiece || "";
      const { selectedIds } = contextPieces();
      const next = new Set(selectedIds);
      if (target.checked) next.add(pieceId);
      else next.delete(pieceId);
      state.chat.contextSelection = [...next];
      state.chat.contextStats = null;
      render();
      return true;
    }
    return false;
  }

  // Both modes share the composer hooks ([data-ai-chat-form] /
  // [data-ai-chat-input]); the active mode decides where the message goes.
  function submit(event) {
    const form = event.target.closest?.("[data-ai-chat-form]");
    if (!form) return false;
    event.preventDefault();
    const input = form.querySelector("[data-ai-chat-input]");
    const text = composerText(input);
    clearComposer(input);
    if (state.mode === "remote") void sendRemoteChat(text);
    else void sendChat(text);
    return true;
  }

  // Enter sends, Shift+Enter adds a newline (chat composer convention).
  // isComposing guard: don't send while an IME is composing text.
  function keydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return false;
    const input = event.target.closest?.("[data-ai-chat-input]");
    if (!input) return false;
    event.preventDefault();
    const text = composerText(input);
    clearComposer(input);
    if (state.mode === "remote") void sendRemoteChat(text);
    else void sendChat(text);
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
