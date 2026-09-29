// Controller for the AI Chat view: two chat modes behind one streamlined
// interface. "On-device" is the existing local-LLM chat (model
// download/select lifecycle, note parsing) — nothing leaves the browser.
// "ChatGPT" is a remote chat over the student's saved OpenAI key, behind a
// HIPAA review gate: the student's message is de-identified fresh on every
// send, each context piece is de-identified and fingerprinted so only
// changed pieces re-run, and the modal shows EXACTLY what will be sent.
// Nothing leaves the browser until the student acknowledges and confirms.
// The transformed (de-identified) message — never the raw text — is what
// gets transmitted and stored.

import {
  localLlmModelByKey,
  readLocalLlmDownloaded,
  readLocalLlmSettings,
  sharedLocalLlmClient,
  writeLocalLlmSettings
} from "../../local-llm/client.js?v=20260928-local-llm-v1";
import { createAiChatPresentation } from "./presentation.js?v=20260929-ai-chat-v7";
import { requestOpenAiChat, requestOpenAiChatWithUsage } from "../openai-client.js?v=20260929-ai-chat-v2";
import { isOfflineMode, onOfflineModeChange } from "../../lib/network-gate.js?v=20260929-offline-mode-v1";
import * as remoteChatV4 from "../../ai/remote-chat.js?v=20260929-ai-chat-v6";
import {
  costForUsage,
  formatTokens,
  formatUsd,
  pricingForModel,
  PRICING_AS_OF
} from "../../ai/openai-pricing.js?v=20260929-pricing-v2";
import {
  deidentifyText,
  getSelectedDeidModelStatus,
  getAdvancedDeidStatus,
  preloadAdvancedDeidModel
} from "../../patient-context/deid-service.js?v=20260929-obi-default";
import { STRUCTURED_DEID_MODE } from "../../patient-context/deid-model-options.js?v=20260929-obi-default";
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
import { medicalServiceOption, OPENAI_WORKUP_MODEL_OPTIONS } from "../../app/preferences.js?v=20260929-gpt6-models";
import {
  hashPiece,
  splitBuiltContext,
  verifySplitEquivalence,
  entitiesToRedactionRecords,
  applyRedactions,
  locateManualSpan,
  buildTransmitPayload,
  locateTruncation,
  effectiveGuidelinesText
} from "./delta-review.js?v=20260929-ai-chat-v5";

// Fresh per-conversation OpenAI usage accumulator. All token counts come
// from the Responses API's own usage blocks; costUsd is computed from the
// published per-model pricing in ../../ai/openai-pricing.js.
function freshRemoteUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    webSearchCalls: 0,
    costUsd: 0,
    calls: 0,
    unknownPricing: false
  };
}

export function createAiChatController({
  app,
  byId,
  escapeHtml,
  icon,
  setStatus,
  render,
  getDraftNoteText,
  currentPreferences,
  onChatServiceChange,
  onOpenAiModelChange,
  // Optional test seams, last in the destructured args. Defaults below fill
  // any gaps so partial overrides still work.
  deidDeps,
  chatDeps
} = {}) {
  const presentation = createAiChatPresentation({ escapeHtml, icon });
  const deid = {
    deidentifyText,
    getSelectedDeidModelStatus,
    getAdvancedDeidStatus,
    preloadAdvancedDeidModel,
    STRUCTURED_DEID_MODE,
    ...(deidDeps || {})
  };
  const chat = { requestOpenAiChat, requestOpenAiChatWithUsage, ...(chatDeps || {}) };
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
      inspectorOpen: false,
      // Two-step confirm for the compress action: first click arms it.
      compressArmed: false
    },
    // Chat mode: "local" (on-device) or "remote" (ChatGPT). Persisted in
    // the local-LLM settings so the choice survives reloads.
    mode: readLocalLlmSettings().chatMode === "remote" ? "remote" : "local",
    sidebarOpen: false,
    remote: {
      messages: [],
      sending: false,
      webSearch: true,
      patientId: "",
      // Accumulated OpenAI usage for THIS conversation (resets on new chat
      // and patient switch): billed tokens and dollars, from the API's own
      // usage blocks — never estimated.
      usage: freshRemoteUsage(),
      // Two-step confirm for the compress action: first click arms it.
      compressArmed: false,
      // Estimated prompt tokens of the last request vs the model's real
      // context window (per-model, not a shared guess).
      contextStats: null,
      // Session-scoped store: piece id -> the student's last reviewed
      // de-identification of that piece. Unchanged pieces are reused
      // verbatim so the student only re-reviews what changed. Cleared on
      // patient change and new remote chat.
      reviewStore: new Map(),
      // HIPAA review gate state: set while the student reviews exactly what
      // will be sent to OpenAI. Nothing is sent on modal open.
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
      state.remote.reviewStore.clear();
      state.remote.usage = freshRemoteUsage();
      state.remote.compressArmed = false;
      state.remote.compressing = false;
      state.remote.contextStats = null;
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
      offlineMode: isOfflineMode(),
      remote: {
        messages: state.remote.messages,
        sending: state.remote.sending,
        webSearch: state.remote.webSearch,
        patientId: state.remote.patientId,
        review: reviewViewModel(state.remote.review),
        deid: remoteDeidInfo(),
        usage: state.remote.usage,
        contextStats: state.remote.contextStats,
        compressArmed: state.remote.compressArmed,
        compressing: !!state.remote.compressing,
        model: prefs.openAiModel,
        modelLabel: (pricingForModel(prefs.openAiModel) || {}).label || String(prefs.openAiModel || ""),
        modelOptions: remoteModelPickerItems(),
        pricingAsOf: PRICING_AS_OF,
        cost: remoteCostViewModel()
      },
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
      },
      sidebarOpen: state.sidebarOpen,
      clinicalService: clinicalServiceInfo(),
      sidebarGuidelinesText: String(settings().systemGuidelines || "")
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
    state.chat.compressArmed = false;
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
    // Offline mode degrades ChatGPT chat to the on-device model: switching
    // to remote while offline would only produce a blocked request.
    if (next === "remote" && isOfflineMode()) {
      setStatus("Offline mode is on — ChatGPT chat needs a connection. Staying on on-device mode.");
      render();
      return;
    }
    state.mode = next;
    writeLocalLlmSettings({ chatMode: next });
    // Switching patients starts a fresh remote chat too: the attached
    // context belongs to one patient, and mixing histories is a hazard.
    setStatus(next === "remote" ? "ChatGPT mode — patient context needs your review before sending." : "On-device mode — nothing leaves this browser.");
    render();
  }

  // Turning offline mode on mid-session degrades an active ChatGPT chat to
  // the on-device model rather than letting the next send fail.
  onOfflineModeChange((offline) => {
    if (offline && state.mode === "remote") {
      state.mode = "local";
      writeLocalLlmSettings({ chatMode: "local" });
      setStatus("Offline mode is on — switched AI Chat to on-device mode. Nothing will be sent to OpenAI.");
      render();
    }
  });

  // ----- HIPAA review gate -------------------------------------------
  // Every ChatGPT send passes through this gate:
  //   1. The student's message is de-identified FRESH on every send —
  //      never reused, never stored.
  //   2. The custom instructions (system guidelines), the patient header,
  //      and each selected chart piece are de-identified into reviewable
  //      redaction records. Pieces whose content hash matches the
  //      session-scoped review store are reused verbatim (badge
  //      "reviewed"); changed pieces are de-identified again ("changed"),
  //      unseen pieces are de-identified ("new").
  //   3. splitBuiltContext + verifySplitEquivalence prove the per-piece
  //      review operates on EXACTLY the text the trusted builder would
  //      assemble — any drift fails closed.
  //   4. The modal shows EXACTLY what will be sent. Send requires phase
  //      "ready", the acknowledgement checkbox, and zero pending records.
  // Any de-identification error fails closed: phase "failed" with no
  // message/context content, no acknowledgement, no Send.

  function reviewAdmissionDate(patient) {
    return textOf(patient?.metadata?.admissionDate) || null;
  }

  function deidModelLabel(deidKey) {
    const selected = deid.getSelectedDeidModelStatus(deidKey) || {};
    const advanced = deid.getAdvancedDeidStatus() || {};
    return selected.label || advanced.label || "";
  }

  function failedReview(detail, modelLabel) {
    return {
      phase: "failed",
      failed: true, // legacy flag for the pre-v4 modal; phase is authoritative
      progress: null,
      failedDetail: detail,
      deidModelLabel: modelLabel || "",
      messageTransformed: "",
      messageCounts: {},
      messageFlags: [],
      pieces: [],
      guidelines: null,
      history: [],
      transmitText: "",
      systemPromptText: "",
      redactionTotal: 0,
      redactionCounts: {},
      residualWarnings: [],
      flags: [],
      truncationNote: "",
      expanded: [],
      reviewedOpen: [],
      ack: false,
      canSend: false
    };
  }

  function advanceProgress(review, label) {
    if (review?.progress) {
      review.progress = { ...review.progress, done: Math.min(review.progress.total, review.progress.done + 1), label };
    }
    render();
  }

  // De-identify one text through the selected model, fail-closed: a result
  // we can't trust (missing text, no model id, chunk failures) is a
  // failure, never a partial send. Structured-only mode is blocked by the
  // send gate before this is ever called.
  async function deidentifyForReview(rawText, deidKey, admissionDate, what) {
    const result = await deid.deidentifyText(rawText, {
      mode: deidKey,
      allowStructuredFallback: false,
      admissionDate,
      relativeDate: admissionDate
    });
    if (!result || typeof result.text !== "string" || !result.modelId || result.modelChunkFailures) {
      throw new Error(`the de-identification model didn't return a usable result for ${what}`);
    }
    return result;
  }

  // De-identify one review piece (custom instructions, patient header, or a
  // chart piece), reusing the stored review verbatim when the content hash
  // matches.
  async function prepareReviewPiece(review, { id, title, group, rawText }, deidKey) {
    const contentHash = hashPiece(rawText);
    const stored = state.remote.reviewStore.get(id);
    if (stored && stored.contentHash === contentHash && typeof stored.approvedRedactedText === "string") {
      return {
        id, title, group, badge: "reviewed", rawText,
        approvedText: stored.approvedRedactedText,
        redactionTotal: stored.redactionTotal || 0,
        counts: { ...(stored.counts || {}) },
        warnings: [...(stored.residualWarnings || [])],
        flags: [...(stored.flags || [])],
        modelRecords: (stored.modelRedactions || []).map((record) => ({ ...record })),
        manualRecords: (stored.manualRedactions || []).map((record) => ({ ...record })),
        truncated: false
      };
    }
    const result = await deidentifyForReview(rawText, deidKey, review.admissionDate, `"${title}"`);
    const piece = {
      id, title, group,
      badge: stored ? "changed" : "new",
      rawText,
      approvedText: "",
      redactionTotal: 0,
      counts: {},
      warnings: (result.residualWarnings || []).slice(0, 4).map((w) => w?.snippet || String(w || "")),
      flags: (result.flags || []).slice(0, 4),
      modelRecords: entitiesToRedactionRecords(rawText, result.entities || []),
      manualRecords: [],
      truncated: false
    };
    refreshPieceApproval(piece, review.admissionDate);
    return piece;
  }

  // Recompute a piece's approved text from its accepted/pending records
  // (rejected records are dropped), plus its counts.
  function refreshPieceApproval(piece, admissionDate) {
    const applied = [...piece.modelRecords, ...piece.manualRecords].filter((record) => record.status !== "rejected");
    piece.approvedText = applyRedactions(piece.rawText, applied, admissionDate);
    const counts = {};
    for (const record of applied) counts[record.label] = (counts[record.label] || 0) + 1;
    piece.counts = counts;
    piece.redactionTotal = applied.length;
  }

  function writePieceToStore(piece) {
    if (!piece) return;
    state.remote.reviewStore.set(piece.id, {
      contentHash: hashPiece(piece.rawText),
      rawText: piece.rawText,
      approvedRedactedText: piece.approvedText,
      modelRedactions: piece.modelRecords.map((record) => ({ ...record })),
      manualRedactions: piece.manualRecords.map((record) => ({ ...record })),
      counts: { ...piece.counts },
      redactionTotal: piece.redactionTotal,
      residualWarnings: [...piece.warnings],
      flags: [...piece.flags],
      title: piece.title,
      group: piece.group
    });
  }

  function findReviewPiece(review, pieceId) {
    if (!review || !pieceId) return null;
    if (review.guidelines?.id === pieceId) return review.guidelines;
    return (review.pieces || []).find((piece) => piece.id === pieceId) || null;
  }

  function findReviewRecord(piece, recordId) {
    if (!piece || !recordId) return null;
    return [...piece.modelRecords, ...piece.manualRecords].find((record) => record.id === recordId) || null;
  }

  function pendingRecordCount(review) {
    let count = 0;
    for (const piece of [review?.guidelines, ...(review?.pieces || [])]) {
      if (!piece) continue;
      for (const record of [...piece.modelRecords, ...piece.manualRecords]) {
        if (record.status === "pending") count++;
      }
    }
    return count;
  }

  // System prompt built from the student's clinical preferences — never
  // the legacy per-model "chatService" setting — with the REVIEWED custom
  // instructions appended underneath.
  function buildRemoteSystemPromptText(prefs, reviewedGuidelinesText) {
    const clinical = {
      medicalService: prefs?.medicalService || "",
      customServiceName: prefs?.customServiceName || "",
      serviceFocus: prefs?.serviceFocus || "",
      presentationDetail: prefs?.presentationDetail || "",
      attendingPreferences: prefs?.attendingPreferences || "",
      teamInstructions: prefs?.teamInstructions || ""
    };
    const fromClinical = remoteChatV4.buildRemoteChatSystemPromptFromClinicalPreferences;
    const base = typeof fromClinical === "function"
      ? fromClinical(clinical)
      : remoteChatV4.buildRemoteChatSystemPrompt({ serviceValue: clinical.medicalService });
    const guidelines = String(reviewedGuidelinesText || "").trim();
    return guidelines ? `${base}\n\nSTUDENT'S CUSTOM INSTRUCTIONS:\n${guidelines}` : base;
  }

  // Rebuild the transmit payload and review aggregates after any change.
  // canSend requires: phase "ready", the ack checkbox, zero pending records.
  function rebuildTransmit(review) {
    const pieceOrder = (review.pieces || []).map((piece) => piece.id);
    const approvedById = {};
    for (const piece of review.pieces || []) approvedById[piece.id] = piece.approvedText;
    const systemPrompt = buildRemoteSystemPromptText(review.prefs, review.guidelines?.approvedText || "");
    const transmit = buildTransmitPayload({
      approvedById,
      pieceOrder,
      transformedMessage: review.messageTransformed,
      systemPrompt,
      history: review.history || [],
      maxChars: MAX_SELECTED_PIECES_CHARS
    });
    review.transmit = transmit;
    review.transmitText = transmit.contextText;
    review.systemPromptText = systemPrompt;
    const truncation = locateTruncation(pieceOrder, approvedById, MAX_SELECTED_PIECES_CHARS);
    const cutPiece = (review.pieces || []).find((piece) => piece.id === truncation.cutPieceId);
    review.truncationNote = truncation.truncated
      ? `Context exceeded the size budget — the tail was cut inside "${cutPiece?.title || truncation.cutPieceId}". What you see above is exactly what will be sent.`
      : "";
    for (const piece of review.pieces || []) piece.truncated = truncation.truncated && piece.id === truncation.cutPieceId;
    const redactionCounts = {};
    let redactionTotal = 0;
    const residualWarnings = [];
    const flags = [];
    for (const piece of [review.guidelines, ...(review.pieces || [])]) {
      if (!piece) continue;
      redactionTotal += piece.redactionTotal || 0;
      for (const [label, n] of Object.entries(piece.counts || {})) redactionCounts[label] = (redactionCounts[label] || 0) + n;
      for (const warning of piece.warnings || []) if (residualWarnings.length < 8) residualWarnings.push(warning);
      for (const flag of piece.flags || []) if (flags.length < 6) flags.push(flag);
    }
    review.redactionTotal = redactionTotal;
    review.redactionCounts = redactionCounts;
    review.residualWarnings = residualWarnings;
    review.flags = flags;
    review.canSend = review.phase === "ready" && review.ack && pendingRecordCount(review) === 0;
  }

  async function sendRemoteChat(text) {
    const message = String(text || "").trim();
    if (!message || state.remote.sending || state.remote.review) return;
    const prefs = remotePrefs();
    if (!String(prefs.openAiApiKey || "").trim()) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
    const deidKey = app.deidMode;
    if (deidKey === deid.STRUCTURED_DEID_MODE || !deid.getSelectedDeidModelStatus(deidKey)?.ready) {
      setStatus("Download a de-identification model to enable sending.");
      render();
      return;
    }
    const draft = currentDraftNoteText();
    const { patient, selectedIds } = contextPieces(draft);
    const split = splitBuiltContext(patient, selectedIds, { draftNoteText: draft });
    if (!verifySplitEquivalence(patient, selectedIds, split, { draftNoteText: draft })) {
      state.remote.review = failedReview(
        "The patient context didn't rebuild exactly — sending is blocked. Nothing was sent.",
        deidModelLabel(deidKey)
      );
      render();
      return;
    }
    const admissionDate = reviewAdmissionDate(patient);
    const includeContext = settings().patientContextEnabled && split.pieces.length > 0;
    const contextTargets = includeContext
      ? [
          { id: "header", title: "Patient header", group: "", rawText: split.header },
          ...split.pieces.map((piece) => ({ id: piece.id, title: piece.label, group: piece.group, rawText: piece.rawText }))
        ]
      : [];
    const review = {
      phase: "preparing",
      progress: { done: 0, total: 2 + contextTargets.length, label: "De-identifying your message…" },
      failedDetail: "",
      deidModelLabel: deidModelLabel(deidKey),
      message, // raw — internal only; restored to the composer on cancel, never rendered
      messageTransformed: "",
      messageCounts: {},
      messageFlags: [],
      pieces: [],
      guidelines: null,
      prefs,
      admissionDate,
      transmit: null,
      transmitText: "",
      systemPromptText: "",
      redactionTotal: 0,
      redactionCounts: {},
      residualWarnings: [],
      flags: [],
      truncationNote: "",
      expanded: [],
      reviewedOpen: [],
      ack: false,
      canSend: false
    };
    state.remote.review = review;
    render();
    try {
      // (a) The message is ALWAYS de-identified fresh — never reused, never stored.
      const messageResult = await deidentifyForReview(review.message, deidKey, admissionDate, "your message");
      review.messageTransformed = messageResult.text;
      review.messageCounts = messageResult.counts || {};
      review.messageFlags = (messageResult.flags || []).slice(0, 6);
      advanceProgress(review, "De-identifying your custom instructions…");
      // (b) Custom instructions (system guidelines) — reviewed like any piece.
      review.guidelines = await prepareReviewPiece(review, {
        id: "guidelines",
        title: "Custom instructions",
        group: "Settings",
        rawText: effectiveGuidelinesText(settings())
      }, deidKey);
      // (c) Patient header + each selected chart piece, sequentially.
      for (const target of contextTargets) {
        advanceProgress(review, `De-identifying ${target.title}…`);
        review.pieces.push(await prepareReviewPiece(review, target, deidKey));
      }
      advanceProgress(review, "Assembling what will be sent…");
      review.history = state.remote.messages.map((m) => ({ role: m.role, text: m.text }));
      review.phase = "ready";
      for (const piece of [review.guidelines, ...review.pieces]) writePieceToStore(piece);
      const candidates = [review.guidelines, ...review.pieces];
      // Auto-expand every piece that needs eyes on it (redactions, warnings,
      // or flags), plus the first piece so the body never opens empty.
      review.expanded = candidates
        .filter((piece, index) => index === 0 || piece.redactionTotal > 0 || piece.warnings.length > 0 || piece.flags.length > 0)
        .map((piece) => piece.id);
      rebuildTransmit(review);
      render();
    } catch (error) {
      // Fail closed: no message/context content, no acknowledgement, no Send.
      state.remote.review = failedReview(
        `De-identification failed (${error?.message || "unknown error"}) — nothing was sent.`,
        deidModelLabel(deidKey)
      );
      render();
    }
  }

  function afterReviewDecision(pieceId) {
    const review = state.remote.review;
    if (!review || review.phase !== "ready") return;
    const piece = findReviewPiece(review, pieceId);
    if (piece) {
      refreshPieceApproval(piece, review.admissionDate);
      writePieceToStore(piece);
    }
    rebuildTransmit(review);
    render();
  }

  async function confirmHipaaReview() {
    const review = state.remote.review;
    if (!review || review.phase !== "ready" || state.remote.sending) return;
    rebuildTransmit(review);
    if (!review.ack || pendingRecordCount(review) > 0) {
      setStatus("Review every redaction and tick the acknowledgement before sending.");
      render();
      return;
    }
    const transmit = review.transmit;
    if (!transmit) return;
    // The already-reviewed input goes to the wire unchanged — rebuilt here
    // from the same pieces the modal showed.
    state.remote.review = null;
    await doRemoteSend({ input: transmit.input, transformedMessage: review.messageTransformed });
    render();
  }

  // Add one API call's usage to the conversation totals. Token counts come
  // from the API's own usage block; dollars come from the published
  // per-model pricing table. Unknown models accumulate tokens but leave
  // cost at zero and flag pricing as unknown.
  function recordRemoteUsage(usage, modelId) {
    if (!usage) return null;
    const cost = costForUsage({ model: modelId, ...usage });
    const totals = state.remote.usage;
    totals.inputTokens += usage.inputTokens || 0;
    totals.outputTokens += usage.outputTokens || 0;
    totals.cachedInputTokens += usage.cachedInputTokens || 0;
    totals.webSearchCalls += usage.webSearchCalls || 0;
    totals.costUsd += cost.totalCost;
    totals.calls += 1;
    if (cost.unknownPricing) totals.unknownPricing = true;
    return cost;
  }

  // Estimated prompt tokens of a Responses-API input array vs the model's
  // real context window — the remote tab's context meter. OpenAI's window is
  // per-model (1.05M for GPT-5.6, 400K for GPT-5.4), nothing like the
  // on-device 4K window, so each mode meters against its own limit.
  function updateRemoteContextStats(input, modelId) {
    const pricing = pricingForModel(modelId);
    const text = (Array.isArray(input) ? input : [])
      .map((entry) => String(entry?.content || ""))
      .join("\n");
    state.remote.contextStats = {
      promptTokens: estimateTokens(text),
      contextWindow: pricing ? pricing.contextWindow : 0,
      windowLabel: pricing ? pricing.label : String(modelId || ""),
      model: modelId
    };
  }

  async function doRemoteSend({ input, transformedMessage }) {
    const prefs = remotePrefs();
    const apiKey = String(prefs.openAiApiKey || "").trim();
    if (!apiKey) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
    // Race safety: the gate itself also refuses, but surfacing it here keeps
    // the message in the conversation instead of a bare status flash.
    if (isOfflineMode()) {
      state.remote.messages.push({
        role: "assistant",
        text: "Offline mode is on, so this ChatGPT request was not sent. Turn offline mode off in Settings, or switch to on-device mode to keep chatting — your message is unchanged."
      });
      render();
      return;
    }
    state.remote.sending = true;
    state.remote.compressArmed = false;
    // The history stores the TRANSFORMED message — the raw text never
    // persists past the review gate.
    state.remote.messages.push({ role: "user", text: transformedMessage, deidentified: true });
    render();
    const sentAt = Date.now();
    try {
      // Prefer the usage-returning call when the active chat backend
      // provides it; test stubs may only provide the plain-text variant,
      // in which case usage stays untracked.
      const sendFn = typeof chatDeps?.requestOpenAiChatWithUsage === "function"
        ? chat.requestOpenAiChatWithUsage
        : chat.requestOpenAiChat;
      const result = await sendFn({
        apiKey,
        model: prefs.openAiModel,
        input,
        tools: state.remote.webSearch ? [{ type: "web_search" }] : []
      });
      const reply = typeof result === "string" ? result : result?.text;
      const usage = result && typeof result === "object" ? result.usage || null : null;
      const cost = recordRemoteUsage(usage, prefs.openAiModel);
      updateRemoteContextStats(input, prefs.openAiModel);
      state.remote.messages.push({
        role: "assistant",
        text: reply,
        webSearch: state.remote.webSearch,
        model: prefs.openAiModel,
        usage: usage ? { ...usage } : null,
        costUsd: cost ? cost.totalCost : null
      });
    } catch (error) {
      state.remote.messages.push({ role: "assistant", text: `Error: ${error?.message || "the ChatGPT request failed"}` });
    } finally {
      state.remote.sending = false;
      const secs = Math.max(1, Math.round((Date.now() - sentAt) / 1000));
      const spent = state.remote.usage.costUsd > 0 ? ` · ${formatUsd(state.remote.usage.costUsd)} this conversation` : "";
      setStatus(`ChatGPT replied in ${secs}s.${spent}`);
      render();
    }
  }

  // ----- conversation compression ---------------------------------------
  // Both chat modes get a manual "compress" that replaces older exchanges
  // with one dense summary, freeing context and (for ChatGPT) cutting the
  // tokens billed on every future reply. The newest exchange is always kept
  // verbatim so the conversation continues naturally.

  const LOCAL_COMPRESSION_SYSTEM_PROMPT = [
    "You are compressing a clinical tutoring conversation into a dense summary.",
    "Write a compact structured summary for a clinician continuing the conversation:",
    "the student's clinical questions and the key facts established in each exchange,",
    "any differential diagnoses, workup plans, or management decisions discussed,",
    "and open questions plus what the student asked to do next.",
    "Keep it under 400 words. Plain paragraphs and short bullet lists only — no",
    "preamble, no meta-commentary about the summarization task."
  ].join("\n");

  function compressibleLocalCount() {
    // Prior summaries count: recompressing folds the earlier summary into
    // the new one instead of dropping the history it captured.
    return state.chat.messages.filter(
      (m) => String(m.text || "").trim().length > 0
    ).length;
  }

  function compressibleRemoteCount() {
    return state.remote.messages.filter(
      (m) => String(m.text || "").trim().length > 0 && !String(m.text || "").startsWith("Error:")
    ).length;
  }

  async function compressLocalChat() {
    try {
      const status = client.getStatus();
      if (status.status !== "ready" || !status.verified) {
        setStatus("Load the local model before compressing.");
        return;
      }
      // Prior summaries are included — never filtered out — so recompressing
      // folds the earlier summary into the new one instead of silently
      // dropping the history it captured.
      const entries = state.chat.messages.filter(
        (m) => String(m.text || "").trim().length > 0
      );
      if (entries.length < 5) {
        setStatus("Not enough conversation to compress yet — keep chatting first.");
        return;
      }
      // Context safety: the compression prompt itself must fit the small
      // on-device window. ~4 chars per token, same heuristic as the send path.
      const modelRecord = localLlmModelByKey(state.chat.modelKey);
      const contextWindow = Number(modelRecord?.contextWindow) || 4096;
      const approxTokens = (s) => Math.max(1, Math.ceil(String(s || "").length / 4));
      const tail = entries.slice(-2);
      const tailText = tail
        .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`)
        .join("\n\n");
      // Fixed cost: system prompt + newest exchange (kept verbatim in the
      // prompt) + the summary we ask for + margin. If even that exceeds the
      // window, refuse instead of silently sending an oversized request.
      const fixedCost = approxTokens(LOCAL_COMPRESSION_SYSTEM_PROMPT) + approxTokens(tailText) + 512 + 256;
      if (fixedCost >= contextWindow) {
        setStatus("The newest messages alone exceed this model's context — revert to an earlier message or start a new chat.");
        return;
      }
      const budget = contextWindow - fixedCost;
      const labelOf = (m) => (m.summary
        ? "Summary of the earlier conversation"
        : (m.role === "user" ? "Student" : "Assistant"));
      // Items oldest-first. If the head doesn't fit, fold the oldest raw
      // messages into an interim summary first (repeated halving), so every
      // message passes through a summary and none are silently dropped.
      let items = entries.slice(0, -2).map((m) => ({ label: labelOf(m), text: m.text, summary: !!m.summary }));
      const transcriptOf = (list) => list.map((it) => `${it.label}: ${it.text}`).join("\n\n");
      let guard = 0;
      while (approxTokens(transcriptOf(items)) > budget && guard++ < 8) {
        const rawIdx = items.findIndex((it) => !it.summary);
        if (rawIdx === -1) break;
        let cut = rawIdx;
        let used = 0;
        while (cut < items.length && !items[cut].summary && used < budget / 2) {
          used += approxTokens(`${items[cut].label}: ${items[cut].text}`);
          cut++;
        }
        if (cut === rawIdx) cut = rawIdx + 1;
        const interim = await client.chat(
          [
            { role: "system", content: LOCAL_COMPRESSION_SYSTEM_PROMPT },
            { role: "user", content: `Summarize this tutoring conversation so it can continue from the summary:\n\n${transcriptOf(items.slice(rawIdx, cut))}` }
          ],
          { maxTokens: 512, temperature: 0.3 }
        );
        const interimText = String(interim || "").trim();
        if (!interimText) throw new Error("the local model returned an empty summary");
        items = [
          ...items.slice(0, rawIdx),
          { label: "Summary of the earlier conversation", text: interimText, summary: true },
          ...items.slice(cut)
        ];
      }
      if (approxTokens(transcriptOf(items)) > budget) {
        setStatus("Conversation too long to compress with this model — revert to an earlier message or start a new chat.");
        return;
      }
      const summary = await client.chat(
        [
          { role: "system", content: LOCAL_COMPRESSION_SYSTEM_PROMPT },
          { role: "user", content: `Summarize this tutoring conversation so it can continue from the summary:\n\n${transcriptOf(items)}\n\nThe conversation continues from these newest messages (already kept verbatim — no need to repeat them in full):\n\n${tailText}` }
        ],
        { maxTokens: 512, temperature: 0.3 }
      );
      const text = String(summary || "").trim();
      if (!text) throw new Error("the local model returned an empty summary");
      const headCount = entries.length - tail.length;
      state.chat.messages = [
        { role: "assistant", text, summary: true, compressedCount: headCount },
        ...tail
      ];
      state.chat.contextStats = null;
      setStatus(`Compressed ${headCount} messages into an on-device summary.`);
    } catch (error) {
      setStatus(`Compression failed: ${error?.message || "the local model didn't return a summary"}.`);
    } finally {
      state.chat.compressing = false;
      state.chat.compressArmed = false;
      renderView();
    }
  }

  async function compressRemoteChat() {
    try {
      const prefs = remotePrefs();
      const apiKey = String(prefs.openAiApiKey || "").trim();
      if (!apiKey) {
        setStatus("Save an OpenAI API key in Settings before compressing.");
        return;
      }
      const entries = state.remote.messages.filter(
        (m) => String(m.text || "").trim().length > 0 && !String(m.text || "").startsWith("Error:")
      );
      if (entries.length < 5) {
        setStatus("Not enough conversation to compress yet — keep chatting first.");
        return;
      }
      // The stored history holds only the already de-identified text — raw
      // PHI never persists past the review gate — so summarizing it with one
      // API call introduces no new disclosure.
      const { input, compressibleCount, keptTail } = remoteChatV4.buildCompressionInput({ history: entries, keepTail: 2 });
      if (compressibleCount < 3) {
        setStatus("Not enough conversation to compress yet — keep chatting first.");
        return;
      }
      const sendFn = typeof chat.requestOpenAiChatWithUsage === "function"
        ? chat.requestOpenAiChatWithUsage
        : chat.requestOpenAiChat;
      const result = await sendFn({ apiKey, model: prefs.openAiModel, input, tools: [] });
      const summaryText = typeof result === "string" ? result : result?.text;
      const usage = result && typeof result === "object" ? result.usage || null : null;
      const cost = recordRemoteUsage(usage, prefs.openAiModel);
      const text = String(summaryText || "").trim();
      if (!text) throw new Error("the API returned an empty summary");
      state.remote.messages = [
        {
          role: "assistant",
          text,
          summary: true,
          compressedCount: compressibleCount,
          model: prefs.openAiModel,
          usage: usage ? { ...usage } : null,
          costUsd: cost ? cost.totalCost : null
        },
        ...keptTail.map((m) => ({ role: m.role, text: m.text, ...(m.summary ? { summary: true } : {}) }))
      ];
      const price = cost && !cost.unknownPricing ? ` (${formatUsd(cost.totalCost)})` : "";
      setStatus(`Compressed ${compressibleCount} messages into a summary${price}.`);
    } catch (error) {
      setStatus(`Compression failed: ${error?.message || "the API didn't return a summary"}.`);
    } finally {
      state.remote.compressing = false;
      state.remote.compressArmed = false;
      render();
    }
  }

  // ----- review view-model (targets the frozen v4 presentation contract) --

  function recordViewModel(record) {
    const base = {
      id: record.id,
      originalSnippet: String(record.originalText || "").slice(0, 160),
      replacement: record.replacement,
      label: record.label
    };
    return record.status === "pending" ? base : { ...base, status: record.status };
  }

  function pieceViewModel(piece) {
    const pending = [];
    const reviewed = [];
    for (const record of [...piece.modelRecords, ...piece.manualRecords]) {
      if (record.status === "pending") pending.push(recordViewModel(record));
      else reviewed.push(recordViewModel(record));
    }
    return {
      id: piece.id,
      title: piece.title,
      group: piece.group,
      badge: piece.badge,
      approvedText: piece.approvedText,
      redactionTotal: piece.redactionTotal,
      counts: { ...piece.counts },
      warnings: [...piece.warnings],
      flags: [...piece.flags],
      pending,
      reviewed,
      truncated: !!piece.truncated,
      // Legacy extras for the pre-v4 modal; the v4 presentation ignores them.
      text: piece.approvedText,
      chars: piece.approvedText.length
    };
  }

  function reviewViewModel(review) {
    if (!review) return null;
    return {
      phase: review.phase,
      progress: review.progress,
      failed: review.phase === "failed", // legacy flag for the pre-v4 modal
      failedDetail: review.failedDetail || "",
      deidModelLabel: review.deidModelLabel || "",
      messageTransformed: review.messageTransformed || "",
      messageCounts: { ...(review.messageCounts || {}) },
      messageFlags: [...(review.messageFlags || [])],
      pieces: (review.pieces || []).map(pieceViewModel),
      guidelines: review.guidelines ? pieceViewModel(review.guidelines) : null,
      history: (review.history || []).map((m) => ({ role: m.role, text: m.text })),
      transmitText: review.transmitText || "",
      systemPromptText: review.systemPromptText || "",
      redactionTotal: review.redactionTotal || 0,
      redactionCounts: { ...(review.redactionCounts || {}) },
      residualWarnings: [...(review.residualWarnings || [])],
      flags: [...(review.flags || [])],
      truncationNote: review.truncationNote || "",
      expanded: [...(review.expanded || [])],
      reviewedOpen: [...(review.reviewedOpen || [])],
      ack: !!review.ack,
      canSend: !!review.canSend
    };
  }

  function remoteDeidInfo() {
    const deidKey = app.deidMode;
    const blocked = deidKey === deid.STRUCTURED_DEID_MODE;
    const status = deid.getSelectedDeidModelStatus(deidKey) || {};
    const advanced = deid.getAdvancedDeidStatus() || {};
    const ready = !blocked && !!status.ready;
    return {
      modelKey: String(deidKey || ""),
      modelLabel: String(status.label || advanced.label || ""),
      ready,
      blockedReason: blocked ? "structured" : (ready ? "" : "not-ready")
    };
  }

  // Cost readout for the ChatGPT tab: billed tokens and dollars for THIS
  // conversation, from the API's own usage blocks. Rendered as a quiet line
  // under the chatbar with a tooltip breaking down the math.
  function remoteCostViewModel() {
    const totals = state.remote.usage;
    if (!totals || totals.calls === 0) return null;
    const modelId = remotePrefs().openAiModel;
    const pricing = pricingForModel(modelId);
    const line = totals.unknownPricing
      ? `${formatTokens(totals.inputTokens)} in · ${formatTokens(totals.outputTokens)} out · model pricing unavailable`
      : `${formatUsd(totals.costUsd)} · ${formatTokens(totals.inputTokens)} in / ${formatTokens(totals.outputTokens)} out`;
    const parts = [
      `${formatTokens(totals.inputTokens)} input tokens`,
      `${formatTokens(totals.outputTokens)} output tokens`
    ];
    if (totals.cachedInputTokens > 0) parts.push(`${formatTokens(totals.cachedInputTokens)} cached input`);
    if (totals.webSearchCalls > 0) {
      parts.push(`${totals.webSearchCalls} web search${totals.webSearchCalls === 1 ? "" : "es"} (${formatUsd(totals.webSearchCalls * 0.01)})`);
    }
    parts.push(`${totals.calls} API call${totals.calls === 1 ? "" : "s"}`);
    if (pricing) {
      parts.push(`Rates: ${pricing.label} $${pricing.inputPerMillion}/$${pricing.outputPerMillion} per 1M input/output tokens (OpenAI pricing, ${PRICING_AS_OF})`);
    }
    return { line, title: parts.join(" · ") };
  }

  // ChatGPT-style model picker items for the remote chat header: every
  // curated OpenAI model with its price hint so the choice is informed.
  function remoteModelPickerItems() {
    const current = remotePrefs().openAiModel;
    return OPENAI_WORKUP_MODEL_OPTIONS.map((option) => {
      const pricing = pricingForModel(option.value);
      const price = pricing
        ? `$${pricing.inputPerMillion} in / $${pricing.outputPerMillion} out per 1M`
        : "pricing unavailable";
      return {
        value: option.value,
        label: option.label,
        description: option.description,
        price,
        selected: option.value === current
      };
    });
  }

  function clinicalServiceInfo() {
    const prefs = remotePrefs();
    let label = "";
    try { label = medicalServiceOption(prefs.medicalService)?.label || ""; }
    catch { label = ""; }
    return {
      label,
      customName: String(prefs.customServiceName || ""),
      focus: String(prefs.serviceFocus || ""),
      detail: String(prefs.presentationDetail || ""),
      attending: String(prefs.attendingPreferences || ""),
      team: String(prefs.teamInstructions || "")
    };
  }

  // ── event wiring ───────────────────────────────────────────────────

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
      state.remote.reviewStore.clear();
      state.remote.usage = freshRemoteUsage();
      state.remote.compressArmed = false;
      state.remote.compressing = false;
      state.remote.contextStats = null;
      setStatus("New ChatGPT chat started — conversation cleared. Your patient context selections are unchanged.");
      render();
      return true;
    }
    if (action === "ai-chat-compress-remote") {
      // ChatGPT-side compression: summarize the older (already de-identified)
      // history with one API call — billed like a normal reply — and keep
      // the newest exchange verbatim. Two-step: first click arms, second
      // confirms.
      if (state.remote.sending || state.remote.compressing) return true;
      if (!state.remote.compressArmed) {
        if (compressibleRemoteCount() < 5) {
          setStatus("Not enough conversation to compress yet — keep chatting first.");
          render();
          return true;
        }
        state.remote.compressArmed = true;
        setStatus("Compress will summarize older messages with one ChatGPT call (billed like a reply) over the already de-identified history. Click Compress again to confirm.");
        render();
        return true;
      }
      state.remote.compressArmed = false;
      state.remote.compressing = true;
      render();
      void compressRemoteChat();
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
      // (The v4 modal's own cancel button targets the action directly, so
      // it still cancels.)
      if (target !== actionTarget) return true;
      const draft = state.remote.review?.message ?? "";
      state.remote.review = null;
      setStatus("Review cancelled — nothing was sent to OpenAI.");
      render();
      // Restore the raw message AFTER render: render recreates the composer,
      // so restoring before it would wipe the draft.
      if (draft) {
        const input = viewRoot()?.querySelector("[data-ai-chat-input]");
        if (input) {
          if (typeof input.value === "string") input.value = draft;
          else input.textContent = draft;
        }
      }
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
    if (action === "ai-chat-hipaa-toggle-reviewed") {
      const review = state.remote.review;
      const pieceId = actionTarget.dataset.piece || "";
      if (review && pieceId) {
        const set = new Set(review.reviewedOpen || []);
        if (set.has(pieceId)) set.delete(pieceId);
        else set.add(pieceId);
        review.reviewedOpen = [...set];
        render();
      }
      return true;
    }
    if (action === "ai-chat-hipaa-accept" || action === "ai-chat-hipaa-reject") {
      const review = state.remote.review;
      const piece = review?.phase === "ready" ? findReviewPiece(review, actionTarget.dataset.piece || "") : null;
      const record = piece ? findReviewRecord(piece, actionTarget.dataset.redaction || "") : null;
      if (record) {
        record.status = action === "ai-chat-hipaa-accept" ? "accepted" : "rejected";
        afterReviewDecision(piece.id);
      }
      return true;
    }
    if (action === "ai-chat-hipaa-accept-all" || action === "ai-chat-hipaa-reject-all") {
      const review = state.remote.review;
      const piece = review?.phase === "ready" ? findReviewPiece(review, actionTarget.dataset.piece || "") : null;
      if (piece) {
        const next = action === "ai-chat-hipaa-accept-all" ? "accepted" : "rejected";
        for (const record of [...piece.modelRecords, ...piece.manualRecords]) {
          if (record.status === "pending") record.status = next;
        }
        afterReviewDecision(piece.id);
      }
      return true;
    }
    if (action === "ai-chat-hipaa-undo" || action === "ai-chat-hipaa-restore") {
      const review = state.remote.review;
      const piece = review?.phase === "ready" ? findReviewPiece(review, actionTarget.dataset.piece || "") : null;
      const record = piece ? findReviewRecord(piece, actionTarget.dataset.redaction || "") : null;
      if (record) {
        // undo: accepted -> pending; restore: rejected -> accepted
        record.status = action === "ai-chat-hipaa-undo" ? "pending" : "accepted";
        afterReviewDecision(piece.id);
      }
      return true;
    }
    if (action === "ai-chat-hipaa-redact-selection") {
      const review = state.remote.review;
      const piece = review?.phase === "ready" ? findReviewPiece(review, actionTarget.dataset.piece || "") : null;
      if (!piece) return true;
      const selection = window.getSelection?.()?.toString?.() ?? "";
      const preview = actionTarget.closest?.("[data-hipaa-piece-preview]");
      if (preview && !preview.contains(window.getSelection?.()?.anchorNode)) return true;
      const occupied = [...piece.modelRecords, ...piece.manualRecords]
        .filter((record) => record.status !== "rejected")
        .map((record) => ({ start: record.start, end: record.end }));
      const located = locateManualSpan(piece.rawText, selection, occupied);
      if (!located.ok) {
        setStatus(
          located.reason === "ambiguous" ? "That text appears more than once — select a single unique span." :
          located.reason === "overlapping" ? "That span is already redacted." :
          located.reason === "not-found" ? "That text wasn't found in this piece." :
          "Select some text in the piece first."
        );
        return true;
      }
      piece.manualRecords.push({
        id: `manual:${located.start}:${located.end}`,
        start: located.start,
        end: located.end,
        originalText: piece.rawText.slice(located.start, located.end),
        replacement: "[REDACTED]",
        label: "MANUAL",
        source: "manual",
        status: "accepted"
      });
      afterReviewDecision(piece.id);
      setStatus("Manual redaction added.");
      return true;
    }
    if (action === "ai-chat-deid-download") {
      const deidKey = app.deidMode;
      if (deidKey === deid.STRUCTURED_DEID_MODE) {
        setStatus("Structured de-identification can't be used for ChatGPT sends — pick a downloaded de-identification model.");
        render();
        return true;
      }
      setStatus("Downloading the de-identification model — this can take a minute on first use.");
      void deid.preloadAdvancedDeidModel({ modelKey: deidKey, onStatus: () => render() }).then(
        () => { setStatus("De-identification model ready — you can now send to ChatGPT."); render(); },
        (error) => { setStatus(`De-identification model download failed: ${error?.message || "unknown error"}`); render(); }
      );
      render();
      return true;
    }
    if (action === "ai-chat-sidebar-open") {
      state.sidebarOpen = true;
      render();
      return true;
    }
    if (action === "ai-chat-sidebar-close") {
      state.sidebarOpen = false;
      render();
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
    if (action === "ai-chat-remote-model") {
      const value = actionTarget.dataset.modelValue;
      if (!value || !OPENAI_WORKUP_MODEL_OPTIONS.some((o) => o.value === value)) return true;
      if (typeof onOpenAiModelChange === "function") onOpenAiModelChange(value);
      const pricing = pricingForModel(value);
      setStatus(`ChatGPT model set to ${pricing ? pricing.label : value}.`);
      // Refresh the context meter against the new model's window.
      state.remote.contextStats = null;
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
      state.chat.compressArmed = false;
      void client.resetChat();
      setStatus("New chat started — conversation cleared. Your patient context selections are unchanged.");
      renderView();
      return true;
    }
    if (action === "ai-chat-compress") {
      // On-device conversation compression: summarize older exchanges with
      // the local model (free, nothing leaves the browser) and keep the
      // newest exchange verbatim. Two-step: first click arms, second confirms.
      if (state.chat.streaming || state.chat.compressing) return true;
      if (!state.chat.compressArmed) {
        if (compressibleLocalCount() < 5) {
          setStatus("Not enough conversation to compress yet — keep chatting first.");
          renderView();
          return true;
        }
        state.chat.compressArmed = true;
        setStatus("Compress will replace older messages with an on-device summary. Click Compress again to confirm.");
        renderView();
        return true;
      }
      state.chat.compressArmed = false;
      state.chat.compressing = true;
      renderView();
      void compressLocalChat();
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
      // The presentation opens the sidebar drawer from sidebarOpen, so keep
      // it in sync — otherwise the mobile Context button does nothing.
      state.sidebarOpen = state.chat.inspectorOpen;
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
    if (target.matches?.("[data-ai-chat-context-toggle]")) {
      writeLocalLlmSettings({ patientContextEnabled: target.checked });
      setStatus(target.checked ? "Patient context attached to AI Chat chat." : "Patient context detached from AI Chat chat.");
      render();
      return true;
    }
    if (target.matches?.("[data-ai-chat-guidelines]")) {
      writeLocalLlmSettings({ systemGuidelines: String(target.value ?? "") });
      return true;
    }
    if (target.matches?.("[data-ai-chat-hipaa-ack]")) {
      if (state.remote.review) {
        state.remote.review.ack = !!target.checked;
        rebuildTransmit(state.remote.review);
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
    getSettings: settings,
    // Thin test seam: the live remote review object (or null). Lets tests
    // drive the review gate without a DOM.
    getRemoteReview: () => state.remote.review,
    // Thin test seam: the live remote chat state (messages, usage, cost).
    // Lets tests assert usage accumulation and compression without a DOM.
    getRemoteState: () => state.remote
  };
}
