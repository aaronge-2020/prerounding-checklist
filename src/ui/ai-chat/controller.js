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
import { createAiChatPresentation } from "./presentation.js?v=20261001-ai-chat-fix-v1";
import { requestOpenAiChat, requestOpenAiChatWithUsage } from "../openai-client.js?v=20260929-ai-chat-v2";
import { gatedFetch, isOfflineMode, onOfflineModeChange } from "../../lib/network-gate.js?v=20260929-offline-mode-v1";
import {
  buildChatToolsSystemPrompt,
  CHAT_MAX_STEPS,
  CHAT_TOOL_NAMES,
  createChatTools
} from "./chat-tools.js?v=20260929-chat-tools-v1";
import { runAgent as defaultRunAgent } from "../../ai/agent-runner.js?v=20260929-agent-runner-v3";
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
  preloadAdvancedDeidModel,
  verifyAdvancedDeidModel
} from "../../patient-context/deid-service.js?v=20260930-deid-refactor";
import { DEFAULT_DEID_MODEL_KEY, STRUCTURED_DEID_MODE, deidModelOptionByKey } from "../../patient-context/deid-model-options.js?v=20260930-deid-trackd";
import { crossOriginIsolationBlocker } from "../../patient-context/deid-client.js?v=20260929-deid-clinicale5";
import {
  buildPatientContextFromPieces,
  defaultSelectedPieceIds,
  listPatientContextPieces,
  pieceText,
  textOf,
  MAX_SELECTED_PIECES_CHARS
} from "../../local-llm/patient-context.js?v=20260929-local-llm-v12";
import { CHARS_PER_TOKEN, buildChatMessages, estimateTokens } from "../../local-llm/context-budget.js?v=20260927-local-llm-v1";
import { buildSystemPrompt } from "../../local-llm/system-prompt.js?v=20260928-local-llm-v10";
import { activePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";
import { medicalServiceOption, OPENAI_WORKUP_MODEL_OPTIONS } from "../../app/preferences.js?v=20260929-gpt6-models";
import {
  hashPiece,
  splitBuiltContext,
  verifySplitEquivalence,
  buildSectionCitationIndex,
  entitiesToRedactionRecords,
  applyRedactions,
  locateManualSpan,
  buildTransmitPayload,
  locateTruncation,
  fullChartBudgetChars,
  effectiveGuidelinesText,
  effectiveRemoteGuidelinesText,
  applyGuidelineDecisions,
  pieceHasNoPendingRecords,
  persistGuidelineDecisions
} from "./delta-review.js?v=20260929-ai-chat-v16";
import {
  parseSectionCitations
} from "./section-citations.js?v=20260929-ai-chat-v14";

// Chart-grounded retrieval (local path only): the on-device model's 4K
// window cannot hold the full chart, so top-k embedding retrieval selects
// the context. The embedding model downloads ONLY on explicit user action;
// the service enforces that (retrieveChartChunks never downloads).
import {
  getRagStatus,
  ensureChartIndex,
  retrieveChartChunks,
  warmChartIndex,
  clearRagWorkerMemory
} from "../../rag/rag-service.js?v=20260929-rag-v3";
import { DEFAULT_RAG_MODEL_KEY } from "../../rag/rag-models.js?v=20260929-rag-v2";
import { piecesWithRawText } from "../../rag/chart-chunks.js?v=20260929-rag-v3";

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
  getDraftNoteSections,
  currentPreferences,
  onChatServiceChange,
  onOpenAiModelChange,
  // App-level chart navigation: called with { scope, dayId, sectionId }
  // when a section citation chip is clicked. Optional — citation clicks
  // degrade to a status message without it.
  onNavigateToChartSection,
  // Optional test seams, last in the destructured args. Defaults below fill
  // any gaps so partial overrides still work.
  deidDeps,
  chatDeps,
  agentDeps,
  ragDeps,
  // Optional override for the on-device chat client (tests stub it; the
  // real singleton is used otherwise).
  clientDeps
} = {}) {
  const presentation = createAiChatPresentation({ escapeHtml, icon });
  const deid = {
    deidentifyText,
    getSelectedDeidModelStatus,
    getAdvancedDeidStatus,
    preloadAdvancedDeidModel,
    verifyAdvancedDeidModel,
    crossOriginIsolationBlocker,
    STRUCTURED_DEID_MODE,
    ...(deidDeps || {})
  };
  const chat = { requestOpenAiChat, requestOpenAiChatWithUsage, ...(chatDeps || {}) };
  // RAG seam: tests stub retrieval/cleanup so the controller lifecycle is
  // deterministic; production uses the real embedding worker service.
  const ragService = {
    getRagStatus,
    ensureChartIndex,
    retrieveChartChunks,
    warmChartIndex,
    clearRagWorkerMemory,
    ...(ragDeps || {})
  };
  // Tool-loop runner seam: tests stub runAgent so the tool path never hits
  // the network; production always uses the real Vercel AI SDK runner.
  const agent = { runAgent: defaultRunAgent, ...(agentDeps || {}) };
  const client = clientDeps?.client || sharedLocalLlmClient();
  const state = {
    hardware: null,
    hardwarePromise: null,
    chat: {
      messages: [],
      streamingText: "",
      modelKey: "",
      modelLabel: "",
      streaming: false,
      // Local-path retrieval (bge-small): the 4K on-device window cannot
      // hold the full chart, so top-k chunks are the context. The embedding
      // model downloads only on explicit user action.
      rag: {
        status: null,
        retrievalError: "",
        modelKey: DEFAULT_RAG_MODEL_KEY,
        // Debounced warm bookkeeping: the pending timer, the fingerprint
        // it was armed for, and the (patient, fingerprint) of the last
        // completed warm. All in-memory, never persisted.
        warmTimer: null,
        warmFingerprint: null,
        warmedPatientId: null,
        warmedFingerprint: null
      },
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
    // Desktop-only collapse state for the "Context & options" sidebar
    // column (narrow screens use sidebarOpen for the drawer instead).
    // Session-scoped, never persisted.
    sidebarCollapsed: false,
    remote: {
      messages: [],
      sending: false,
      // In-flight remote-send token: bumped on patient switch / vault lock
      // (see renderView's invalidation) so a late network reply can never
      // land in the wrong patient's thread.
      sendToken: 0,
      // Which send token owns the `sending` flag: only that send's finally
      // may clear it, so a stale send can't unblock a newer one mid-flight.
      sendingToken: 0,
      webSearch: true,
      // Clinical tools: when on, ChatGPT-mode sends run through the Vercel
      // AI SDK tool loop, letting the model call the 25 local calculators
      // and 7 on-device AI models. All computation stays in this browser;
      // only the de-identified messages go to OpenAI.
      toolsEnabled: true,
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

  // The draft note as individually selectable sections (one-liner, each
  // plan problem, ...). [] when there is no draft. Entries are
  // { key, heading, label, text }; see renderNoteSectionEntries.
  function currentDraftNoteSections() {
    try {
      const entries = getDraftNoteSections?.();
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  // The active patient's selectable context pieces and the current
  // in-memory selection. Selection defaults are computed once per patient;
  // the user can then freely include/exclude pieces in the inspector.
  // Pass a cached draft string to avoid rebuilding the draft twice per render.
  function contextPieces(cachedDraft, cachedSections) {
    const patient = activePatient(app.vault);
    const draft = typeof cachedDraft === "string" ? cachedDraft : currentDraftNoteText();
    const sections = Array.isArray(cachedSections) ? cachedSections : currentDraftNoteSections();
    const pieces = listPatientContextPieces(patient, { draftNoteText: draft, draftNoteSections: sections });
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
  function patientContextInfo(cachedDraft, cachedSections) {
    const draft = typeof cachedDraft === "string" ? cachedDraft : currentDraftNoteText();
    const sections = Array.isArray(cachedSections) ? cachedSections : currentDraftNoteSections();
    const { patient, selectedIds } = contextPieces(draft, sections);
    const enabled = settings().patientContextEnabled;
    const text = enabled
      ? buildPatientContextFromPieces(patient, selectedIds, { draftNoteText: draft, draftNoteSections: sections })
      : "";
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

  // Matches the CSS breakpoint where the sidebar becomes a drawer
  // (styles.css: max-width 1023px). Guarded for non-DOM (test) environments.
  function isNarrowViewport() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 1023px)").matches;
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

  // --- Chart-grounded RAG helpers (Phase 2) -------------------------------
  // The embedding model is NEVER fetched by rendering, status checks,
  // warming, or retrieval fallbacks. The only path to ensure-model is the
  // explicit user tap handled by downloadRagModel().
  async function refreshRagStatus() {
    const rag = state.chat.rag;
    if (!rag) return;
    if (rag.status === "downloading") return;
    try {
      const status = await ragService.getRagStatus();
      rag.status = status.ready ? "ready" : "not-downloaded";
      rag.retrievalError = status.ready ? "" : rag.retrievalError;
    } catch {
      rag.status = "unavailable";
    }
  }

  async function downloadRagModel() {
    const rag = state.chat.rag;
    if (!rag || rag.status === "downloading") return;
    rag.status = "downloading";
    rag.retrievalError = "";
    renderView();
    try {
      await ragService.ensureChartIndex({
        patientId: activePatient(app.vault)?.id,
        pieces: piecesWithRawText(
          activePatient(app.vault),
          listPatientContextPieces(activePatient(app.vault), {
            draftNoteText: currentDraftNoteText()
          })
        )
      });
      await refreshRagStatus();
    } catch (error) {
      rag.status = "not-downloaded";
      rag.retrievalError = error instanceof Error ? error.message : String(error);
    }
    renderView();
  }

  // Warm the per-patient index when the model is already on the device.
  // Ordinary sends probe readiness but never download: retrieval is skipped
  // when the model isn't ready, and the user sees the one-tap notice.
  // Chart-content fingerprint: hash over the piece ids and their raw text,
  // so a new/edited section, capture, or quick note invalidates a warmed
  // index. The debounced warm rebuilds when the chart CHANGES, not just
  // when the patient changes.
  function chartContentFingerprint(pieces) {
    return hashPiece((pieces || []).map((p) => `${p.id || ""}\n${p.rawText || ""}`).join("\n"));
  }

  // Debounced index warm: 15s after the chat view renders with a READY
  // chart-search model, pre-build the current patient's embedding index so
  // the first question doesn't wait. Warming runs through warmChartIndex —
  // it NEVER downloads the model: on a cold worker the status probe fails
  // closed and the warm is skipped.
  //
  // Debounce rules:
  // - Rapid chart edits collapse into ONE rebuild: an edit while a warm is
  //   pending restarts the 15s clock for the latest chart.
  // - A later same-patient content change triggers another rebuild: the
  //   warmed fingerprint is compared, not just the patient id.
  // - Switching patients cancels the pending warm and clears the warmed
  //   record (done in renderView's patient-switch block).
  function maybeWarmRagIndex() {
    const rag = state.chat.rag;
    if (!rag || rag.status !== "ready") return;
    const patient = activePatient(app.vault);
    const patientId = patient?.id || null;
    if (!patientId) return;
    const pieces = piecesWithRawText(
      patient,
      listPatientContextPieces(patient, { draftNoteText: currentDraftNoteText() })
    );
    const fingerprint = chartContentFingerprint(pieces);
    if (rag.warmTimer) {
      if (rag.warmFingerprint === fingerprint) return;
      // Chart edited mid-debounce: restart the clock for the latest chart.
      clearTimeout(rag.warmTimer);
      rag.warmTimer = null;
    } else if (rag.warmedPatientId === patientId && rag.warmedFingerprint === fingerprint) {
      return; // Already warmed for this exact chart.
    }
    rag.warmFingerprint = fingerprint;
    rag.warmTimer = setTimeout(async () => {
      rag.warmTimer = null;
      try {
        const nowPatient = activePatient(app.vault);
        if (!nowPatient || state.chat.rag?.status !== "ready") return;
        // Recompute at fire time: warm the CURRENT chart. If it changed
        // again since arming, re-arm instead of indexing stale content.
        const nowPieces = piecesWithRawText(
          nowPatient,
          listPatientContextPieces(nowPatient, { draftNoteText: currentDraftNoteText() })
        );
        const nowFingerprint = chartContentFingerprint(nowPieces);
        if (nowFingerprint !== state.chat.rag?.warmFingerprint || nowPatient.id !== patientId) {
          state.chat.rag.warmFingerprint = nowFingerprint;
          maybeWarmRagIndex();
          return;
        }
        await ragService.warmChartIndex({ patientId: nowPatient.id, pieces: nowPieces });
        if (state.chat.rag) {
          state.chat.rag.warmedPatientId = nowPatient.id;
          state.chat.rag.warmedFingerprint = nowFingerprint;
        }
      } catch {
        // Warming is best-effort; a failed warm never surfaces.
      }
    }, 15000);
  }

  function renderView() {
    const root = viewRoot();
    // Switching patients starts a fresh chat: the attached context belongs
    // to one patient, and mixing histories across patients is a hazard.
    // This invalidation runs even when the chat view isn't mounted — an
    // in-flight send's generation/token must die on patient switch or vault
    // lock no matter which tab is visible. The draft note is built once
    // here and shared by the inspector and the context meter below.
    const draft = currentDraftNoteText();
    const draftSections = currentDraftNoteSections();
    const pctx = patientContextInfo(draft, draftSections);
    if (state.chat.patientId && pctx.patientId !== state.chat.patientId) {
      // Invalidate any in-flight local send: its generation token dies here
      // so a late retrieval callback can't continue into the new patient.
      state.chat.generation = (state.chat.generation || 0) + 1;
      // Invalidate any in-flight remote (ChatGPT) send: its token dies here
      // so a late network reply can't land in the new patient's thread.
      state.remote.sendToken = (state.remote.sendToken || 0) + 1;
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
      // Chart-grounded RAG: the previous patient's embedding vectors must
      // not survive the switch. Clear worker memory and cancel any pending
      // index warm so it can't re-index the old patient.
      if (state.chat.rag?.warmTimer) {
        clearTimeout(state.chat.rag.warmTimer);
        state.chat.rag.warmTimer = null;
      }
      if (state.chat.rag) {
        state.chat.rag.active = false;
        state.chat.rag.retrievedChunks = [];
        state.chat.rag.warmedPatientId = null;
        state.chat.rag.warmedFingerprint = null;
        state.chat.rag.warmFingerprint = null;
      }
      void ragService.clearRagWorkerMemory().catch(() => {});
    }
    state.chat.patientId = pctx.patientId;
    state.remote.patientId = pctx.patientId;
    if (!root) return;
    ensureHardware();
    const { pieces, selectedIds } = contextPieces(draft, draftSections);
    const selectedSet = new Set(selectedIds);
    const modelRecord = localLlmModelByKey(state.chat.modelKey);
    // The sidebar budget meters the ACTIVE mode: ChatGPT mode counts the
    // remote conversation against the selected OpenAI model's context
    // window; on-device mode counts the local conversation against the
    // local model's window. (The per-message meter under the chat shows
    // the last request's measured usage; this is the planning budget.)
    const remotePrefsForBudget = remotePrefs();
    const isRemoteBudget = state.mode === "remote";
    const remotePricing = isRemoteBudget ? pricingForModel(remotePrefsForBudget.openAiModel) : null;
    const contextWindow = isRemoteBudget
      ? remotePricing?.contextWindow || 0
      : modelRecord?.contextWindow || 4096;
    const budgetWindowLabel = isRemoteBudget
      ? remotePricing?.label || String(remotePrefsForBudget.openAiModel || "")
      : modelRecord?.label || "";
    const budgetMessages = isRemoteBudget ? state.remote.messages : state.chat.messages;
    // The meter counts the guidelines actually sent in the active mode:
    // the on-device guidelines locally, the ChatGPT guidelines remotely.
    const guidelines = isRemoteBudget
      ? effectiveRemoteGuidelinesText(settings())
      : effectiveGuidelinesText(settings());
    const guidelinesTokens = estimateTokens(guidelines);
    const historyTokens = estimateTokens(
      budgetMessages.map((m) => m.text).join("\n")
    );
    // Both modes send exactly the inspector-selected pieces — the meter
    // counts the selection and nothing more.
    const pieceTokens = pieces.reduce(
      (sum, piece) => sum + (selectedSet.has(piece.id) ? Math.ceil(piece.chars / CHARS_PER_TOKEN) : 0),
      0
    );
    const prefs = remotePrefs();
    // Local-path retrieval: lazy status probe. Ordinary rendering never
    // downloads the embedding model; the probe only asks whether it is
    // already on the device. The API path does not use the embedding model.
    if (state.mode === "local") {
      void refreshRagStatus().then(() => {
        if (state.chat.rag && !state.chat.rag.statusNoticed) {
          state.chat.rag.statusNoticed = true;
          renderView();
        }
        // Debounced index warm: armed only after the status probe, and only
        // when the model is already on the device (never a download).
        maybeWarmRagIndex();
      });
    }
    root.innerHTML = presentation.render({
      hardware: state.hardware,
      settings: settings(),
      llmStatus: client.getStatus(),
      chat: state.chat,
      downloaded: state.downloaded,
      mode: state.mode,
      offlineMode: isOfflineMode(),
      demoArmed: isDemoReplyArmed(),
      remote: {
        messages: state.remote.messages,
        sending: state.remote.sending,
        webSearch: state.remote.webSearch,
        toolsEnabled: state.remote.toolsEnabled,
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
        cost: remoteCostViewModel(),
        // Chart-grounded RAG status for the inline notice / download affordance.
        rag: state.chat.rag ? {
          status: state.chat.rag.status,
          active: state.chat.rag.active,
          retrievalError: state.chat.rag.retrievalError,
          preparing: state.chat.rag.preparing
        } : null
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
        // Both modes send exactly the inspector-selected pieces; ChatGPT
        // mode additionally runs them through the de-identification review
        // gate before anything is sent.
        isRemote: state.mode === "remote",
        hasPatient: !!pctx.patient,
        patientLabel: pctx.label,
        pieces: pieces.map((piece) => ({
          id: piece.id,
          group: piece.group,
          label: piece.label,
          kind: piece.kind,
          primary: piece.primary,
          tokens: Math.ceil(piece.chars / CHARS_PER_TOKEN),
          selected: selectedSet.has(piece.id)
        })),
        // Ordered group names, matching the piece order above — drives the
        // per-group Select all / Deselect all controls.
        groups: (() => {
          const names = [];
          for (const piece of pieces) {
            const name = piece.group || "Other";
            if (!names.includes(name)) names.push(name);
          }
          return names;
        })(),
        guidelinesTokens,
        historyTokens,
        historyCount: budgetMessages.length,
        selectedTokens: pieceTokens,
        contextWindow,
        windowLabel: budgetWindowLabel
      },
      sidebarOpen: state.sidebarOpen,
      // Desktop collapse flag for the sidebar column. sidebarToggleOn
      // drives the topbar Context button's pressed state: the drawer state
      // on narrow viewports, the column state on desktop.
      sidebarCollapsed: state.sidebarCollapsed,
      sidebarToggleOn: isNarrowViewport() ? state.sidebarOpen : !state.sidebarCollapsed,
      clinicalService: clinicalServiceInfo(),
      sidebarGuidelinesText: String(settings().systemGuidelines || ""),
      sidebarGuidelinesRemoteText: String(settings().systemGuidelinesRemote || "")
    });
    const messages = root.querySelector("[data-ai-chat-messages]");
    if (messages) messages.scrollTop = messages.scrollHeight;
    // An aborted send's unsent draft survives in state: restore it to the
    // composer whenever that patient's composer is eligible again (after a
    // patient switch back or a vault unlock). Never touches another
    // patient's composer and never clobbers typed text.
    restorePendingSendToComposer();
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

  // Hard-abort a local send whose patient changed or vault locked mid-
  // retrieval: drop the queued user message, restore its text to the
  // composer, and bump the generation token so late callbacks die.
  // Restore an aborted send's unsent text into the composer. The draft is
  // keyed to the patient it was written for: it is restored only when the
  // vault is unlocked and that same patient is active, so one patient's
  // unsent text can never land in another patient's composer. Never
  // clobbers text the user typed after the restore.
  function restorePendingSendToComposer() {
    const pending = state.chat.pendingSend;
    if (!pending || !pending.message || !pending.aborted) return;
    if (!app.vault) return;
    if (pending.patientId !== activePatient(app.vault)?.id) return;
    const input = viewRoot()?.querySelector("[data-ai-chat-input]");
    if (!input) return;
    const current = typeof input.value === "string" ? input.value : input.textContent;
    if (current && String(current).trim()) return;
    if (typeof input.value === "string") input.value = pending.message;
    else input.textContent = pending.message;
  }

  // True while a remote (ChatGPT) send's initiating patient is still the
  // active patient and the vault is unlocked. A patient switch or vault
  // lock clears the remote thread (renderView's invalidation bumps the
  // send token), so a late network reply must be discarded instead of
  // appended to the wrong patient's conversation.
  function remoteSendStillCurrent(sendToken, sendPatientId) {
    if (sendToken !== state.remote.sendToken) return false;
    if (!app.vault) return false;
    return (activePatient(app.vault)?.id ?? null) === sendPatientId;
  }

  // Classify why a local send died: vault locked, patient changed, or a
  // newer send superseded it (same patient, vault fine — the new send owns
  // the thread now, so the old one exits quietly).
  function localAbortReason(sendPatientId) {
    if (!app.vault) return "vault";
    if (sendPatientId !== activePatient(app.vault)?.id) return "patient";
    return "superseded";
  }

  function abortLocalSend(message, generation, reason) {
    if (reason === "superseded") return;
    if (generation === state.chat.generation) state.chat.generation = (state.chat.generation || 0) + 1;
    const last = state.chat.messages[state.chat.messages.length - 1];
    if (last && last.role === "user" && last.text === message) state.chat.messages.pop();
    // The unsent text stays in state.chat.pendingSend — marked aborted so
    // renderView restores it to the composer. The draft survives render
    // and vault-lock transitions and is restored when its patient's
    // composer is eligible again.
    if (state.chat.pendingSend?.generation === generation) {
      state.chat.pendingSend.aborted = true;
    }
    setStatus(reason === "vault"
      ? "Vault locked — your message was not sent."
      : "Patient changed — your message was not sent.");
    // render() re-runs renderView, which restores the pending draft to the
    // composer when its patient's composer is eligible.
    render();
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
    // Capture the pending send BEFORE the first await: the initiating
    // patient id, this generation's token, and the raw unsent message. If
    // the patient changes or the vault locks mid-send, the send
    // hard-aborts and the message is preserved as an unsent draft keyed to
    // this patient — never generated against another patient.
    const pctx = patientContextInfo();
    const sendPatientId = pctx.patientId;
    const generation = (state.chat.generation = (state.chat.generation || 0) + 1);
    state.chat.patientId = sendPatientId;
    state.chat.pendingSend = { patientId: sendPatientId, generation, message };
    // Switch models if the chat picker chose a different downloaded one.
    if (state.chat.modelKey && state.chat.modelKey !== status.activeModelKey) {
      await downloadModel(state.chat.modelKey);
      if (generation !== state.chat.generation) {
        abortLocalSend(message, generation, localAbortReason(sendPatientId));
        return;
      }
    }
    state.chat.messages.push({ role: "user", text: message });
    // Local path context: the on-device model's 4K window cannot hold the
    // full chart, so when the chart-search (embedding) model is ready we
    // retrieve the top-k chunks for this question and use those as the
    // context. Otherwise fall back to the selected pieces from the
    // "Context" inspector. All on-device; nothing leaves the browser.
    // retrieveChartChunks never downloads the embedding model: on a cold
    // worker it returns [] and chat falls back to the selected pieces.
    let localContextText = pctx.available ? pctx.text : "";
    try {
      const ragStatus = await ragService.getRagStatus();
      if (generation !== state.chat.generation) {
        // Patient switched, vault locked, or a newer send superseded this
        // one: abort. The unsent message stays in pendingSend, never
        // generated against the wrong patient.
        abortLocalSend(message, generation, localAbortReason(sendPatientId));
        return;
      }
      if (ragStatus?.ready && pctx.patient && sendPatientId === activePatient(app.vault)?.id && app.vault) {
        const patient = pctx.patient;
        const draftForRag = currentDraftNoteText();
        const pieces = piecesWithRawText(
          patient,
          listPatientContextPieces(patient, { draftNoteText: draftForRag })
        );
        const hits = await ragService.retrieveChartChunks({
          patientId: patient.id,
          pieces,
          query: message,
          k: 6
        });
        // Abort check, again, after the await: patient switch or vault
        // lock during retrieval must not continue into generation.
        if (generation !== state.chat.generation) {
          abortLocalSend(message, generation, localAbortReason(sendPatientId));
          return;
        }
        if (sendPatientId !== activePatient(app.vault)?.id || !app.vault) {
          abortLocalSend(message, generation, !app.vault ? "vault" : "patient");
          return;
        }
        if (hits.length > 0) {
          // Retrieved chunks carry their section labels for citations.
          localContextText = hits
            .map((hit) => `[${hit.label || "Chart excerpt"}${hit.group ? ` — ${hit.group}` : ""}]\n${hit.text}`)
            .join("\n\n");
        }
      }
    } catch {
      // Retrieval failure falls back to the selected pieces; the send
      // continues — a missing index never blocks local chat.
    }
    if (generation !== state.chat.generation) {
      abortLocalSend(message, generation, localAbortReason(sendPatientId));
      return;
    }
    // A retrieval failure racing a patient switch or vault lock must never
    // fall through to local generation: the generation token may not have
    // been invalidated yet, so recheck the initiating patient and the vault
    // explicitly before the model runs.
    if (!app.vault || sendPatientId !== activePatient(app.vault)?.id) {
      abortLocalSend(message, generation, !app.vault ? "vault" : "patient");
      return;
    }
    const systemContent = buildSystemPrompt({
      contextText: localContextText,
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
      // The send was attempted against the right patient: the draft is
      // delivered (or the failure is recorded in the thread), so the
      // pending send is done. Aborts return before this block, keeping it.
      if (state.chat.pendingSend?.generation === generation) state.chat.pendingSend = null;
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
  //      and EVERY selected context piece are de-identified into
  //      reviewable redaction records. Pieces whose content hash matches the
  //      session-scoped review store are reused verbatim (badge
  //      "reviewed"); changed pieces are de-identified again ("changed"),
  //      unseen pieces are de-identified ("new"). Only the
  //      inspector-selected pieces go through the gate — never the chart
  //      the student didn't select.
  //   3. splitBuiltContext + verifySplitEquivalence prove the per-piece
  //      review operates on EXACTLY the text the trusted selection-based
  //      builder would assemble — any drift fails closed.
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
      messageManualRedactions: [],
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

  // B1: the active patient's known identity for the de-identifier's local
  // patient lexicon (same sanitization and guards as the main app path).
  // displayLabel is INTENTIONALLY de-identified (room labels, never real
  // names), so only explicit identity metadata opts in; otherwise null.
  function patientIdentity() {
    const patient = activePatient(app.vault);
    if (!patient) return null;
    const metadata = patient.metadata && typeof patient.metadata === "object" ? patient.metadata : {};
    const name = String(
      metadata.patientName || metadata.name ||
      [metadata.firstName, metadata.middleName, metadata.lastName].filter(Boolean).join(" ") || ""
    ).trim();
    const dob = String(metadata.dob || metadata.dateOfBirth || "").trim();
    if (!name && !dob) return null;
    return { name, dob };
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
      relativeDate: admissionDate,
      patientIdentity: patientIdentity()
    });
    if (!result || typeof result.text !== "string" || !result.modelId || result.modelChunkFailures) {
      throw new Error(`the de-identification model didn't return a usable result for ${what}`);
    }
    return result;
  }

  // De-identify one review piece (custom instructions, patient header, or a
  // chart piece), reusing the stored review verbatim when the content hash
  // matches.
  //
  // Custom instructions are settings text, not clinical notes: the clinical
  // NER over-flags instructional prose (names, organizations, places that
  // are not PHI). For the guidelines piece only, keep high-precision PHI
  // patterns (dates, phones, emails, IDs) and drop the fuzzy entity types
  // that are overwhelmingly false positives here. The student can still
  // redact anything manually via the highlight-to-redact flow.
  const GUIDELINE_KEEP_LABELS = new Set([
    "DATE", "TIME", "PHONE", "EMAIL", "SSN", "MRN", "ID", "ZIP", "ADDRESS", "URL", "IP"
  ]);
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
    // Guidelines filter: drop fuzzy entity types before building records.
    const guidelineEntities = id === "guidelines"
      ? (result.entities || []).filter((e) => GUIDELINE_KEEP_LABELS.has(String(e?.label || "").toUpperCase()))
      : (result.entities || []);
    const piece = {
      id, title, group,
      badge: stored ? "changed" : "new",
      rawText,
      approvedText: "",
      redactionTotal: 0,
      counts: {},
      warnings: (result.residualWarnings || []).slice(0, 4).map((w) => w?.snippet || String(w || "")),
      flags: (result.flags || []).slice(0, 4),
      modelRecords: entitiesToRedactionRecords(rawText, guidelineEntities),
      manualRecords: [],
      truncated: false
    };
    // The ChatGPT custom instructions are settings text, not patient data:
    // re-apply the student's stored accept/reject decisions so unchanged
    // instructions don't demand a fresh review every send. Decisions apply
    // to the current model run — new spans still surface as pending.
    if (id === "guidelines") {
      applyGuidelineDecisions(piece, contentHash);
      if (pieceHasNoPendingRecords(piece)) piece.badge = "reviewed";
    }
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
    // Remember the student's custom-instruction decisions across sessions,
    // but only once every suggestion has an explicit decision — a partial
    // review is never treated as done.
    if (piece.id === "guidelines") persistGuidelineDecisions(hashPiece(piece.rawText), piece);
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

  // Informational de-id flags describe the model run, not PHI in the text —
  // they never need human eyes on their own.
  const DEID_INFORMATIONAL_FLAG_RE = /^(Model:|Structured-only de-identification\.|No PHI spans detected)/;

  // True when the de-identified message itself needs human eyes: the model
  // found redactable spans (counts) or raised a non-informational flag.
  function messageHasDeidFindings(messageResult) {
    const counts = messageResult?.counts || {};
    if (Object.keys(counts).length > 0) return true;
    const flags = messageResult?.flags || [];
    return flags.some((flag) => !DEID_INFORMATIONAL_FLAG_RE.test(String(flag || "")));
  }

  // True when the review modal must open: any piece (custom instructions or
  // context) is new/changed, any redaction decision is still pending, or
  // the message itself has actionable findings. Unchanged context + a clean
  // message sends directly without reopening the modal.
  function reviewNeedsHumanEyes(review) {
    for (const piece of [review?.guidelines, ...(review?.pieces || [])]) {
      if (!piece) continue;
      if (piece.badge !== "reviewed") return true;
    }
    if (pendingRecordCount(review) > 0) return true;
    return messageHasDeidFindings({ counts: review?.messageCounts, flags: review?.messageFlags });
  }

  // The student's current text selection, for the highlight-to-redact flow.
  // The app's global mousedown handler already preventDefaults button
  // mousedowns, so the selection survives clicking the floating Redact pill.
  function currentSelectionText() {
    try {
      if (typeof document !== "undefined") {
        const text = document.getSelection?.()?.toString?.();
        if (text) return text;
      }
    } catch { /* fall through to window */ }
    try {
      return window.getSelection?.()?.toString?.() ?? "";
    } catch { return ""; }
  }

  // Shared manual-redaction core for one review piece: locate the selected
  // span in the piece's raw text (exactly one free occurrence) and record an
  // accepted MANUAL redaction. Used by the per-piece button and the floating
  // highlight-to-redact pill.
  function applyPieceManualRedaction(piece, selectionText) {
    const review = state.remote.review;
    if (!review || review.phase !== "ready" || !piece) return false;
    const occupied = [...piece.modelRecords, ...piece.manualRecords]
      .filter((record) => record.status !== "rejected")
      .map((record) => ({ start: record.start, end: record.end }));
    const located = locateManualSpan(piece.rawText, selectionText, occupied);
    if (!located.ok) {
      setStatus(
        located.reason === "ambiguous" ? "That text appears more than once — select a single unique span." :
        located.reason === "overlapping" ? "That span is already redacted." :
        located.reason === "not-found" ? "That text wasn't found in this piece." :
        "Select some text in the piece first."
      );
      return false;
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
    setStatus("Redacted — it now shows as [REDACTED] in what will be sent.");
    return true;
  }

  // Manual redaction for the student's own message. The message is displayed
  // post-de-identification, so the selected text is matched against the
  // transformed message and EVERY occurrence is replaced — a name or number
  // the model missed should be gone everywhere, not just once.
  function applyMessageManualRedaction(selectionText) {
    const review = state.remote.review;
    if (!review || review.phase !== "ready") return false;
    const needle = String(selectionText || "");
    if (!needle.trim()) {
      setStatus("Highlight some text in your message first, then click Redact.");
      return false;
    }
    if (/^\[.*\]$/.test(needle.trim())) {
      setStatus("That's already redacted.");
      return false;
    }
    const text = String(review.messageTransformed || "");
    const occurrences = text.split(needle).length - 1;
    if (!occurrences) {
      setStatus("That text wasn't found in your message.");
      return false;
    }
    review.messageTransformed = text.split(needle).join("[REDACTED]");
    review.messageManualRedactions = [
      ...(review.messageManualRedactions || []),
      { needle, replacement: "[REDACTED]", occurrences }
    ];
    review.messageCounts = {
      ...(review.messageCounts || {}),
      MANUAL: (review.messageCounts?.MANUAL || 0) + occurrences
    };
    rebuildTransmit(review);
    render();
    setStatus(occurrences === 1 ? "Redacted from your message." : `Redacted ${occurrences} occurrences from your message.`);
    return true;
  }

  // Highlight-to-redact: while the review modal is open, any text selection
  // inside the message or a piece preview summons the floating Redact pill
  // next to the selection — one click redacts, no scrolling to find a button.
  function updateHipaaRedactFloat() {
    let float = null;
    try { float = document.querySelector?.(".aic-hipaa-modal [data-hipaa-redact-float]"); } catch { float = null; }
    const hide = () => { if (float) { float.hidden = true; float.dataset.target = ""; } };
    if (!float) return;
    const review = state.remote.review;
    if (!review || review.phase !== "ready") { hide(); return; }
    let sel = null;
    try { sel = document.getSelection?.(); } catch { sel = null; }
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hide(); return; }
    const anchor = sel.anchorNode;
    const anchorEl = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const redactable = anchorEl?.closest?.("[data-hipaa-piece-preview], [data-hipaa-message]");
    const modal = float.closest?.(".aic-hipaa-modal");
    if (!redactable || !modal || !modal.contains(redactable)) { hide(); return; }
    const text = sel.toString();
    // Empty, or an already-redacted pill like [PHONE] — nothing to do.
    if (!text.trim() || /^\[.*\]$/.test(text.trim())) { hide(); return; }
    let target = "";
    if (redactable.hasAttribute("data-hipaa-message")) target = "message";
    else target = redactable.getAttribute("data-piece") || "";
    if (!target) { hide(); return; }
    let rect = null;
    try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch { rect = null; }
    if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return; }
    float.dataset.target = target;
    float.hidden = false;
    const top = Math.max(8, rect.top - 48);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 140));
    float.style.top = `${Math.round(top)}px`;
    float.style.left = `${Math.round(left)}px`;
  }

  // System prompt built from the student's clinical preferences — never
  // the legacy per-model "chatService" setting — with the REVIEWED custom
  // instructions appended underneath.
  // The ChatGPT system prompt. Citation rules are conditional on what is
  // actually attached: with patient context, the model must cite the
  // section label + a short quote for every patient-fact claim so the
  // student can verify against the source. With no context attached (a
  // bare question), the model answers from general medical knowledge and
  // must not invent patient details or section citations.
  function buildRemoteSystemPromptText(prefs, reviewedGuidelinesText, { hasContext = true } = {}) {
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
    // Section-grounded citations: the model must cite the context SECTION
    // label + a short quote for every patient-fact claim, so the student
    // can verify against the source. Format: per [Section Label]: 'quote'.
    const citationRules = hasContext
      ? `CITATION RULES:
- For every claim about this patient, cite the context section and a short verbatim quote: per [Section Label]: 'exact words from the context'.
- Use the section labels as they appear in the context (e.g. per [Hospital Stay]: '...', per [Labs]: '...').
- If the context does not contain the answer, say so explicitly — do not answer from general knowledge as if it were patient fact.`
      : `CONTEXT RULES:
- No patient context was attached to this question. Answer from general medical knowledge.
- Do not invent patient details, chart findings, or section citations.`;
    const withCitations = `${base}\n\n${citationRules}`;
    return guidelines ? `${withCitations}\n\nSTUDENT'S CUSTOM INSTRUCTIONS:\n${guidelines}` : withCitations;
  }

  // Rebuild the transmit payload and review aggregates after any change.
  // canSend requires: phase "ready", the ack checkbox, zero pending records.
  function rebuildTransmit(review) {
    const pieceOrder = (review.pieces || []).map((piece) => piece.id);
    const approvedById = {};
    for (const piece of review.pieces || []) approvedById[piece.id] = piece.approvedText;
    const systemPrompt = buildRemoteSystemPromptText(review.prefs, review.guidelines?.approvedText || "", {
      hasContext: review.hasContext === true
    });
    const chartBudget = Number(review.chartBudget) > 0
      ? Number(review.chartBudget)
      : fullChartBudgetChars(pricingForModel(review.prefs?.openAiModel)?.contextWindow);
    const transmit = buildTransmitPayload({
      approvedById,
      pieceOrder,
      transformedMessage: review.messageTransformed,
      systemPrompt,
      history: review.history || [],
      maxChars: chartBudget
    });
    review.transmit = transmit;
    review.transmitText = transmit.contextText;
    review.systemPromptText = systemPrompt;
    const truncation = locateTruncation(pieceOrder, approvedById, chartBudget);
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

  // AI Chat always runs the best de-identification system: the default
  // clinical model is downloaded, loaded, and verified automatically the
  // first time it is needed - no manual model setup before sending.
  async function ensureBestDeidModelReady({ onProgress } = {}) {
    const ready = deid.getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY);
    if (ready?.ready) return ready;
    const blocker = deid.crossOriginIsolationBlocker();
    if (blocker) throw new Error(blocker);
    const option = deidModelOptionByKey(DEFAULT_DEID_MODEL_KEY);
    const label = option.shortLabel || option.label || "clinical deidentifier";
    const size = option.sizeLabel ? ` (${option.sizeLabel})` : "";
    setStatus(`Loading the ${label} - first run downloads it once${size}, then it stays on this device…`);
    render();
    await deid.verifyAdvancedDeidModel({
      modelKey: DEFAULT_DEID_MODEL_KEY,
      onStatus: (status) => { if (status?.message) setStatus(status.message); },
      onProgress: (progress) => {
        if (progress?.message) {
          setStatus(progress.message);
          render();
        }
        onProgress?.(progress);
      }
    });
    render();
    const final = deid.getSelectedDeidModelStatus(DEFAULT_DEID_MODEL_KEY);
    if (final?.ready) return final;
    throw new Error(final?.message || "The de-identification model did not finish loading.");
  }

  async function sendRemoteChat(text) {
    const message = String(text || "").trim();
    if (!message || state.remote.sending || state.remote.review) return;
    const prefs = remotePrefs();
    if (!String(prefs.openAiApiKey || "").trim()) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
    // AI Chat always de-identifies with the best system - the default
    // clinical model - which is downloaded, loaded, and verified
    // automatically here on first use. Nothing to set up by hand.
    const deidKey = DEFAULT_DEID_MODEL_KEY;
    if (!deid.getSelectedDeidModelStatus(deidKey)?.ready) {
      try {
        await ensureBestDeidModelReady();
      } catch (error) {
        setStatus(`Couldn't load the de-identification model (${error?.message || "unknown error"}) - nothing was sent.`);
        render();
        return;
      }
    }
    // API path: exactly the inspector-selected pieces go through the de-id
    // review gate — no embedding model, no retrieval. The student can send
    // the full chart (Select all), a subset, or just the question. Split,
    // verify, and transmit share the model's real context window (minus
    // headroom) so the review sees exactly what the wire will carry.
    const draft = currentDraftNoteText();
    const sections = currentDraftNoteSections();
    const patient = activePatient(app.vault);
    const { selectedIds } = contextPieces(draft, sections);
    // The attach toggle gates both modes: off means the question goes
    // alone, with no patient context at all.
    const effectiveSelectedIds = settings().patientContextEnabled ? selectedIds : [];
    // The budget is the selected model's real context window minus
    // headroom — not an arbitrary cap. Split, verify, and transmit all
    // share it so the review sees exactly what the wire will carry.
    const chartBudget = fullChartBudgetChars(pricingForModel(prefs.openAiModel)?.contextWindow);
    const splitOpts = { draftNoteText: draft, draftNoteSections: sections, maxChars: chartBudget };
    const split = splitBuiltContext(patient, effectiveSelectedIds, splitOpts);
    if (!verifySplitEquivalence(patient, effectiveSelectedIds, split, splitOpts)) {
      state.remote.review = failedReview(
        "The patient context didn't rebuild exactly — sending is blocked. Nothing was sent.",
        deidModelLabel(deidKey)
      );
      render();
      return;
    }
    const admissionDate = reviewAdmissionDate(patient);
    // API mode: the review gate IS the consent — the student sees and
    // approves the full chart before anything is sent. The local-mode
    // context toggle never silently drops the chart here.
    const includeContext = split.pieces.length > 0;
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
      messageManualRedactions: [],
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
      canSend: false,
      // Snapshot of the tools toggle at review time, so the modal can
      // disclose that this send may invoke local clinical tools.
      toolsEnabled: state.remote.toolsEnabled,
      // The model-grounded chart budget: split, verify, and transmit share
      // it so the review sees exactly what the wire will carry. hasContext
      // records whether any context pieces were attached, so the system
      // prompt can demand section citations only when there is context to
      // cite — a bare question gets a general-knowledge answer instead.
      chartBudget,
      hasContext: split.pieces.length > 0
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
      // (b) Custom instructions for the ChatGPT path — reviewed like any piece.
      // These are stored separately from the on-device guidelines so the
      // local-execution identity claims are never sent to OpenAI.
      review.guidelines = await prepareReviewPiece(review, {
        id: "guidelines",
        title: "Custom instructions (ChatGPT)",
        group: "Settings",
        rawText: effectiveRemoteGuidelinesText(settings())
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
      // Reviewed, unchanged context + a clean message: skip the modal and
      // send the exact payload the earlier review approved. Every send
      // still de-identifies the message fresh; only the manual re-review
      // is skipped, and only when nothing needs human eyes.
      if (!reviewNeedsHumanEyes(review)) {
        const transmit = review.transmit;
        const transformedMessage = review.messageTransformed;
        state.remote.review = null;
        render();
        await doRemoteSend({ input: transmit.input, transformedMessage });
        return;
      }
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
    // from the same pieces the modal showed. Capture the pieces before the
    // review is cleared: they back the reply's section-citation metadata.
    const pieces = Array.isArray(review.pieces) ? review.pieces : [];
    state.remote.review = null;
    await doRemoteSend({ input: transmit.input, transformedMessage: review.messageTransformed, pieces });
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

  // Parse the model's section citations and match them against the reviewed
  // chart pieces, in order. Each entry: { section, quote, pieceId, label,
  // group, target } — pieceId/target null when the label matched no reviewed
  // section (renders as inert text, never clickable). The presentation zips
  // these with its own parse by match order.
  function matchSectionCitations(replyText, piecesForCitations) {
    const index = buildSectionCitationIndex(piecesForCitations || []);
    return parseSectionCitations(replyText).map((cite) => {
      const meta = index.get(cite.section.toLowerCase()) || null;
      return {
        section: cite.section,
        quote: cite.quote,
        pieceId: meta ? meta.pieceId : null,
        label: meta ? meta.label : cite.section,
        group: meta ? meta.group : "",
        target: meta ? meta.target : null
      };
    });
  }

  async function doRemoteSend({ input, transformedMessage, pieces = [] }) {
    // Clinical-tools mode: the reviewed payload goes through the Vercel AI
    // SDK tool loop instead of the single-shot chat call, so ChatGPT can
    // run the 25 local calculators and 7 on-device AI models mid-reply.
    if (state.remote.toolsEnabled) {
      await doRemoteToolSend({ input, transformedMessage, pieces });
      return;
    }
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
    // Patient-switch / vault-lock race: capture the initiating patient and
    // a send token before the network await. The invalidation in renderView
    // bumps the token and clears the thread on switch or lock; a late
    // reply must never be appended to the new patient's conversation.
    const sendToken = (state.remote.sendToken = (state.remote.sendToken || 0) + 1);
    state.remote.sendingToken = sendToken;
    const sendPatientId = app.vault ? activePatient(app.vault)?.id ?? null : null;
    // The history stores the TRANSFORMED message — the raw text never
    // persists past the review gate.
    state.remote.messages.push({ role: "user", text: transformedMessage, deidentified: true });
    render();
    const sentAt = Date.now();
    // Set false when the patient changed or the vault locked mid-reply:
    // the orphaned reply is discarded and the "replied" status must not
    // pretend it landed in the conversation.
    let delivered = true;
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
      if (!remoteSendStillCurrent(sendToken, sendPatientId)) {
        // The patient changed or the vault locked mid-reply: the thread was
        // already cleared, so drop the orphaned reply (and its usage) rather
        // than misattributing them to the new patient's conversation.
        delivered = false;
      } else {
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
          costUsd: cost ? cost.totalCost : null,
          sectionCitations: matchSectionCitations(reply, pieces)
        });
      }
    } catch (error) {
      if (!remoteSendStillCurrent(sendToken, sendPatientId)) {
        delivered = false;
      } else {
        state.remote.messages.push({ role: "assistant", text: `Error: ${error?.message || "the ChatGPT request failed"}` });
      }
    } finally {
      // Only the send that owns the flag clears it: a stale send finishing
      // after a newer one started must not unblock that newer send.
      if (state.remote.sendingToken === sendToken) {
        state.remote.sending = false;
        state.remote.sendingToken = 0;
      }
      const secs = Math.max(1, Math.round((Date.now() - sentAt) / 1000));
      const spent = state.remote.usage.costUsd > 0 ? ` · ${formatUsd(state.remote.usage.costUsd)} this conversation` : "";
      setStatus(
        delivered
          ? `ChatGPT replied in ${secs}s.${spent}`
          : app.vault
            ? "Patient changed while ChatGPT was replying — that reply was discarded."
            : "Vault locked while ChatGPT was replying — the reply was discarded."
      );
      render();
    }
  }

  // Tool-mode send: the reviewed input goes through the Vercel AI SDK tool
  // loop (runAgent) with the four clinical-computation tools, so the model
  // can run the 25 local calculators and 7 on-device AI models mid-reply.
  //
  // SAFETY: `input` is the exact payload the HIPAA review gate approved —
  // the tool loop never sees raw text. Tool executions are local (same
  // process, no network); tool arguments are derived from the de-identified
  // input, and tool results stay in this browser. Only the model's messages
  // go to OpenAI, through the gated fetch so offline mode fails closed.
  async function doRemoteToolSend({ input, transformedMessage, pieces = [] }) {
    const prefs = remotePrefs();
    const apiKey = String(prefs.openAiApiKey || "").trim();
    if (!apiKey) {
      setStatus("Save an OpenAI API key in Settings before using ChatGPT chat.");
      return;
    }
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
    // Same patient-switch / vault-lock race as the single-shot path: capture
    // the initiating patient and a send token before the tool loop runs.
    const sendToken = (state.remote.sendToken = (state.remote.sendToken || 0) + 1);
    state.remote.sendingToken = sendToken;
    const sendPatientId = app.vault ? activePatient(app.vault)?.id ?? null : null;
    // The history stores the TRANSFORMED message — the raw text never
    // persists past the review gate.
    state.remote.messages.push({ role: "user", text: transformedMessage, deidentified: true });
    render();
    const sentAt = Date.now();
    // Set false when the patient changed or the vault locked mid-reply.
    let delivered = true;
    try {
      const entries = Array.isArray(input) ? input : [];
      const systemEntry = entries.find((e) => e && e.role === "system");
      const messages = entries
        .filter((e) => e && e.role && e.role !== "system")
        .map((e) => ({
          role: e.role === "assistant" ? "assistant" : "user",
          content: String(e.content || "")
        }));
      const result = await agent.runAgent({
        apiKey,
        model: prefs.openAiModel,
        messages,
        tools: createChatTools(),
        fetchImpl: gatedFetch,
        systemPrompt: buildChatToolsSystemPrompt(systemEntry ? systemEntry.content : ""),
        webSearch: state.remote.webSearch,
        onStep: ({ stepNumber, toolCalls }) => {
          const names = (toolCalls || []).map((t) => t.toolName).filter(Boolean);
          setStatus(
            names.length
              ? `ChatGPT is running ${names.join(", ")} locally… (step ${stepNumber}/${CHAT_MAX_STEPS})`
              : `ChatGPT is thinking… (step ${stepNumber}/${CHAT_MAX_STEPS})`
          );
          render();
        }
      });
      if (!remoteSendStillCurrent(sendToken, sendPatientId)) {
        // The patient changed or the vault locked during the tool loop: the
        // thread was already cleared, so drop the orphaned reply (and its
        // usage) rather than misattributing them to the new patient.
        delivered = false;
      } else {
        const usage = result.usage || null;
        const cost = recordRemoteUsage(usage, prefs.openAiModel);
        updateRemoteContextStats(input, prefs.openAiModel);
        // Auditable tool records ride on the assistant message: which tool
        // ran, with what inputs, and the deterministic result it returned.
        // The model's prose stays advisory; the tool numbers are the facts.
        const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
        const toolResults = Array.isArray(result.toolResults) ? result.toolResults : [];
        const toolRecords = toolResults.map((tr, index) => ({
          toolName: String(tr.toolName || toolCalls[index]?.toolName || ""),
          input: tr.input ?? toolCalls[index]?.input ?? null,
          text: typeof tr.text === "string" ? tr.text : "",
          deterministic: tr.deterministic && typeof tr.deterministic === "object" ? tr.deterministic : null
        }));
        state.remote.messages.push({
          role: "assistant",
          text: result.text || "(no response text)",
          toolsUsed: true,
          webSearch: state.remote.webSearch,
          toolRecords,
          model: prefs.openAiModel,
          usage: usage ? { ...usage } : null,
          costUsd: cost ? cost.totalCost : null,
          sectionCitations: matchSectionCitations(result.text || "", pieces)
        });
      }
    } catch (error) {
      if (!remoteSendStillCurrent(sendToken, sendPatientId)) {
        delivered = false;
      } else {
        state.remote.messages.push({ role: "assistant", text: `Error: ${error?.message || "the ChatGPT request failed"}` });
      }
    } finally {
      // Only the send that owns the flag clears it: a stale send finishing
      // after a newer one started must not unblock that newer send.
      if (state.remote.sendingToken === sendToken) {
        state.remote.sending = false;
        state.remote.sendingToken = 0;
      }
      const secs = Math.max(1, Math.round((Date.now() - sentAt) / 1000));
      const spent = state.remote.usage.costUsd > 0 ? ` · ${formatUsd(state.remote.usage.costUsd)} this conversation` : "";
      setStatus(
        delivered
          ? `ChatGPT replied in ${secs}s.${spent}`
          : app.vault
            ? "Patient changed while ChatGPT was replying — that reply was discarded."
            : "Vault locked while ChatGPT was replying — the reply was discarded."
      );
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
      canSend: !!review.canSend,
      toolsEnabled: !!review.toolsEnabled
    };
  }

  function remoteDeidInfo() {
    // AI Chat always reports the best (default) de-identification system,
    // which it loads automatically - the manual model choice no longer
    // gates ChatGPT sends.
    const deidKey = DEFAULT_DEID_MODEL_KEY;
    const status = deid.getSelectedDeidModelStatus(deidKey) || {};
    const advanced = deid.getAdvancedDeidStatus() || {};
    const ready = !!status.ready;
    return {
      modelKey: String(deidKey || ""),
      modelLabel: String(status.label || advanced.label || ""),
      ready,
      blockedReason: ready ? "" : "not-ready"
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
    // Section citations: clicking a "per [Section]" chip navigates to the
    // matching saved chart source. The chip carries the piece id; the
    // message's sectionCitations (matched at send time against the reviewed
    // pieces) resolve it to a navigation target. Unmatched citations are
    // inert text and never reach this branch.
    const sectionChip = target.closest?.("[data-section-cite]");
    if (sectionChip) {
      const pieceId = sectionChip.dataset.sectionCite || "";
      const messageIndex = Number(sectionChip.dataset.messageIndex || "0");
      const cite = state.remote.messages[messageIndex]?.sectionCitations?.find(
        (entry) => entry?.pieceId === pieceId
      );
      if (cite?.target && typeof onNavigateToChartSection === "function") {
        onNavigateToChartSection(cite.target);
      } else {
        setStatus(
          cite?.section
            ? `Chart section: ${cite.section} — no matching saved source.`
            : "Chart section: this citation matches no reviewed chart section."
        );
        render();
      }
      return true;
    }
    const actionTarget = target.closest?.("[data-action]");
    if (!actionTarget) return false;
    const action = actionTarget.dataset.action;
    // One-tap chart-search model download: the ONLY user path that may
    // download the embedding model. Everything else (render, status probe,
    // ordinary chat) never touches ensure-model on a cold worker.
    if (action === "ai-chat-download-rag-model") {
      void downloadRagModel();
      return true;
    }
    if (action === "ai-chat-mode") {      setMode(actionTarget.dataset.mode);
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
      applyPieceManualRedaction(piece, selection);
      return true;
    }
    if (action === "ai-chat-hipaa-redact-float") {
      // Highlight-to-redact: the floating pill next to a text selection.
      // Its data-target was resolved when it was positioned ("message" or a
      // piece id). The app's global mousedown handler already preventDefaults
      // button mousedowns, so the selection survives the click.
      const review = state.remote.review;
      if (!review || review.phase !== "ready") return true;
      const target = actionTarget.dataset.target || "";
      const selection = currentSelectionText();
      if (target === "message") applyMessageManualRedaction(selection);
      else {
        const piece = findReviewPiece(review, target);
        if (piece) applyPieceManualRedaction(piece, selection);
      }
      try { document.getSelection?.()?.removeAllRanges?.(); } catch { /* noop */ }
      return true;
    }
    if (action === "ai-chat-hipaa-accept-all-pending" || action === "ai-chat-hipaa-reject-all-pending") {
      // One-click review: decide every pending suggestion across the message
      // guidelines and all context pieces at once. Fail-closed gating is
      // untouched — Send still requires the acknowledgment plus zero pending.
      const review = state.remote.review;
      if (!review || review.phase !== "ready") return true;
      const next = action === "ai-chat-hipaa-accept-all-pending" ? "accepted" : "rejected";
      let count = 0;
      for (const piece of [review.guidelines, ...(review.pieces || [])]) {
        if (!piece) continue;
        let touched = false;
        for (const record of [...piece.modelRecords, ...piece.manualRecords]) {
          if (record.status === "pending") { record.status = next; count++; touched = true; }
        }
        if (touched) {
          refreshPieceApproval(piece, review.admissionDate);
          writePieceToStore(piece);
        }
      }
      rebuildTransmit(review);
      render();
      setStatus(count === 0 ? "Nothing left to review." : next === "accepted" ? `Accepted ${count} suggestion${count === 1 ? "" : "s"}.` : `Rejected ${count} suggestion${count === 1 ? "" : "s"}.`);
      return true;
    }
    if (action === "ai-chat-deid-download") {
      setStatus("Loading the de-identification model — this can take a minute on first use.");
      render();
      void ensureBestDeidModelReady().then(
        () => { setStatus("De-identification model ready — you can now send to ChatGPT."); render(); },
        (error) => { setStatus(`De-identification model download failed: ${error?.message || "unknown error"}`); render(); }
      );
      return true;
    }
    if (action === "ai-chat-sidebar-open") {
      // Keep the two drawer flags in sync: the narrow Context toggle reads
      // inspectorOpen, so opening the drawer through any path must set it.
      state.sidebarOpen = true;
      state.chat.inspectorOpen = true;
      render();
      return true;
    }
    if (action === "ai-chat-sidebar-close") {
      // Reset both flags: leaving inspectorOpen=true would make the next
      // narrow Context click toggle it true->false and keep the drawer shut.
      state.sidebarOpen = false;
      state.chat.inspectorOpen = false;
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
      // The topbar Context button is the sidebar toggle on every viewport.
      // Narrow screens (<1024px): the sidebar is a drawer — toggle it.
      // Desktop: the sidebar is a persistent column — collapse/expand it.
      if (isNarrowViewport()) {
        state.chat.inspectorOpen = !state.chat.inspectorOpen;
        // The presentation opens the sidebar drawer from sidebarOpen, so
        // keep it in sync — otherwise the mobile Context button does nothing.
        state.sidebarOpen = state.chat.inspectorOpen;
      } else {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }
      renderView();
      return true;
    }
    if (action === "ai-chat-context-group") {
      // Select all / Deselect all for one Admission / hospital-day group.
      // Both modes share the inspector selection: only selected pieces go
      // to the model (ChatGPT mode runs them through the review gate).
      const groupIndex = Number.parseInt(actionTarget.dataset.groupIndex || "", 10);
      const select = actionTarget.dataset.select === "1";
      const { pieces, selectedIds } = contextPieces();
      const groupNames = [];
      for (const piece of pieces) {
        const name = piece.group || "Other";
        if (!groupNames.includes(name)) groupNames.push(name);
      }
      const groupName = groupNames[groupIndex];
      if (groupName === undefined) return true;
      const next = new Set(selectedIds);
      for (const piece of pieces) {
        if ((piece.group || "Other") === groupName) {
          if (select) next.add(piece.id);
          else next.delete(piece.id);
        }
      }
      state.chat.contextSelection = [...next];
      // Invalidate the cached budget so the meter recomputes on the next
      // render with the new selection.
      state.chat.contextStats = null;
      render();
      return true;
    }
    if (action === "ai-chat-send") {
      const form = actionTarget.closest?.("[data-ai-chat-form]");
      const input = form?.querySelector("[data-ai-chat-input]");
      const text = composerText(input);
      clearComposer(input);
      if (maybeDemoReply(text)) return true;
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
    if (target.matches?.("[data-ai-chat-tools-toggle]")) {
      state.remote.toolsEnabled = target.checked;
      setStatus(target.checked
        ? "Clinical tools on — ChatGPT can run the 25 calculators and 7 AI models locally, in-chat."
        : "Clinical tools off — ChatGPT replies without running calculators or AI models.");
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
    if (target.matches?.("[data-ai-chat-guidelines-remote]")) {
      writeLocalLlmSettings({ systemGuidelinesRemote: String(target.value ?? "") });
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
      // Include/exclude one context piece from the model's context. Both
      // modes share this selection.
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
    if (maybeDemoReply(text)) return true;
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
    if (maybeDemoReply(text)) return true;
    if (state.mode === "remote") void sendRemoteChat(text);
    else void sendChat(text);
    return true;
  }

  // Highlight-to-redact wiring: document-level so it works no matter where
  // the modal rendered. Guarded for Node test harnesses (no document there).
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("selectionchange", updateHipaaRedactFloat);
    // A stale pill must not linger after the modal scrolls beneath it.
    document.addEventListener("scroll", () => {
      try {
        const stale = document.querySelector?.(".aic-hipaa-modal [data-hipaa-redact-float]");
        if (stale) { stale.hidden = true; stale.dataset.target = ""; }
      } catch { /* noop */ }
    }, true);
  }


  // Guided-demo seam: stage pre-built exchanges (flagged demo:true so they
  // render with a Sample badge) without running a live model. Messages live
  // only in this in-memory state — never the vault — and the demo clears them
  // on exit. Idempotent: seeding twice does not duplicate. Accepts a single
  // {question, answer} pair or an array of them.
  //
  // Hands-on demo reply: setDemoReply(answer) arms a one-shot staged reply.
  // The next user message sent while armed gets the staged answer instead of
  // a live model call. The demo uses this so the user can send a real
  // question and see a grounded, cited answer without needing a model.
  let demoReplyAnswer = null;
  let demoReplyCallback = null;
  function setDemoReply(answer, onReply) {
    demoReplyAnswer = answer || null;
    demoReplyCallback = typeof onReply === "function" ? onReply : null;
  }
  function clearDemoReply() {
    demoReplyAnswer = null;
    demoReplyCallback = null;
  }
  function isDemoReplyArmed() {
    return !!demoReplyAnswer;
  }
  function maybeDemoReply(text) {
    if (!demoReplyAnswer) return false;
    const answer = demoReplyAnswer;
    const cb = demoReplyCallback;
    demoReplyAnswer = null;
    demoReplyCallback = null;
    state.chat.messages.push({ role: "user", text });
    state.chat.messages.push({ role: "assistant", text: answer, demo: true });
    renderView();
    if (cb) {
      try { cb(text); } catch { /* noop */ }
    }
    return true;
  }
  function seedDemoMessages(samples) {
    if (!samples) return;
    const pairs = Array.isArray(samples) ? samples : [samples];
    if (!pairs.length || !pairs[0].question || !pairs[0].answer) return;
    if (state.chat.messages.some((m) => m.demo)) return;
    for (const { question, answer } of pairs) {
      if (!question || !answer) continue;
      state.chat.messages.push({ role: "user", text: question, demo: true });
      state.chat.messages.push({ role: "assistant", text: answer, demo: true });
    }
  }

  function clearDemoMessages() {
    if (!state.chat.messages.some((m) => m.demo)) return;
    state.chat.messages = state.chat.messages.filter((m) => !m.demo);
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
    // Best-effort warm-up hook: the app calls this when the AI Chat view
    // opens in ChatGPT mode so the de-identification model is already
    // loading before the first send. Test seam for the auto-load path.
    ensureDeidReady: (...args) => ensureBestDeidModelReady(...args),
    isRemoteMode: () => state.mode === "remote",
    // Thin test seam: the live remote chat state (messages, usage, cost).
    // Lets tests assert usage accumulation and compression without a DOM.
    getRemoteState: () => state.remote,
    // Thin test seam: the live on-device chat state. Lets tests assert
    // retrieval context, hard aborts, and fallback without a DOM.
    getChatState: () => state.chat,
    seedDemoMessages,
    clearDemoMessages,
    setDemoReply,
    clearDemoReply,
    isDemoReplyArmed,
    // Test seam for the highlight-to-redact pill: recompute its visibility
    // and position from the current text selection.
    updateHipaaRedactFloat
  };
}
