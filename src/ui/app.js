import {
  createDailyRecord,
  latestDay,
  localCalendarDate,
  removeDay,
  sortDays,
  upsertDay
} from "../daily-updates/days.js?v=20260921-medication-card-v4";
import {
  activePatient,
  archivePatient,
  createEmptyVaultState,
  createPatientRecord,
  setActivePatient,
  updateActivePatient
} from "../app/state/vault.js?v=20260921-medication-card-v4";
import {
  deleteEncryptedVaultRecord,
  downloadJson, downloadText,
  loadOrCreateVault,
  readEncryptedVaultRecord,
  saveEncryptedVault,
  writeEncryptedVaultRecord
} from "../app/state/persistence.js?v=20260921-medication-card-v4";
import {
  removeSection,
  reorderSections,
  reorderSectionsById,
  replaceSectionsFromFormAsync
} from "../patient-context/sections.js?v=20260921-medication-card-v4";
import { clinicalParseWarning, parseClinicalExport } from "../patient-context/clinical-export-parser.js?v=20260929-rxnorm-official-v3";
import {
  createEphemeralRedactionReview,
  refreshEphemeralRedactionReview,
  sanitizeResidualWarningMetadata,
  inspectedRedactionIndex,
  nextPendingRedactionIndex,
  nextPendingReviewTarget,
  pendingReviewTargets,
  quickRedactionIndex,
  quickSelectedRedactionIndex,
  quickWarningIndex,
  reviewKey,
  synchronizeReviewPlaceholders
} from "../patient-context/review.js?v=20260929-deid-clinicale5";
import {
  crossOriginIsolationBlocker,
  deidentifyText,
  getAdvancedDeidStatus,
  getSelectedDeidModelStatus,
  preloadAdvancedDeidModel,
  resetAdvancedDeidWorker,
  verifyAdvancedDeidModel
} from "../patient-context/deid-client.js?v=20260929-deid-clinicale5";
import {
  DEFAULT_DEID_MODEL_KEY,
  DEID_MODEL_OPTIONS,
  STRUCTURED_DEID_MODE,
  deidModelOptionByKey
} from "../patient-context/deid-model-options.js?v=20260930-deid-trackd";
import {
  canAutomaticallyInstallModel,
  ensureModelPackServiceWorker,
  getModelPackState,
  importModelPack,
  installModelPack,
  markModelPackVerified,
  modelFilesFromDirectoryHandle,
  modelFilesFromInput,
  removeModelPack,
  requestPersistentModelStorage
} from "../patient-context/model-pack-storage.js?v=20260925-sw-auth-fix";
import {
  formatBytes,
  hasAutomaticModelDownload,
  isInstallableModel,
  modelDownloadBytes
} from "../patient-context/model-packs.js?v=20260921-medication-card-v4";
import {
  ADMISSION_PSEUDO_DAY_ID,
  buildPromptPreviewSegments,
  buildPromptVariableMap,
  loadPromptTemplateOverrides,
  loadTokenColorOverrides,
  promptTemplateForTask,
  promptVariablesForPatient,
  savePromptTemplateOverrides,
  saveTokenColorOverrides, studentNoteForPrompt
} from "../prompts/custom-templates.js?v=20260921-medication-card-v4";
import { defaultPacketRole, packetRoleOptions } from "../patient-context/packet-roles.js";
import {
  DEFAULT_DAILY_SOURCE_KIND,
  admissionSourceKindOptions
} from "../patient-context/source-captures.js?v=20260921-medication-card-v4";
import { availableOpenEvidenceTasks } from "../prompts/open-evidence.js?v=20260921-medication-card-v4";
import { guidelinePromptTasks, loadCustomPromptTasks } from "../prompts/custom-tasks.js?v=20260910-pre-op-prep";
import { ensureCanonicalDefaultGuidelineSets, ensureTaskGuidelineSets, ensureTeachingGuidelineSet, loadOrMigrateGuidelineSets } from "../prompts/guideline-sets.js?v=20260910-pre-op-prep";
import {
  OPENAI_WORKUP_MODEL_OPTIONS,
  normalizeUserPreferences
} from "../app/preferences.js?v=20260929-gpt6-models";
import { icon } from "./icons.js?v=20260711-functional-remediation-15&icon=book-v1&icon=search-v1";
import { createDailyPresentation } from "./daily/presentation.js?v=20260921-medication-card-v4&primary-note=section-scroll-v3&parser=table-v6&local-llm-v1&clear-btn-v1";
import { createDailySourceController } from "./daily/source-controller.js?v=20260923-plan-problems-v1&scroll=preserve-section-scroll-v3&parser=table-v7&local-llm-v3&clear-btn-v1";
import { navigateClinicalLabCollections, updateClinicalMedicationPage } from "./daily/clinical-display-controller.js?v=20260921-medication-card-v4";
import { createReviewPresentation } from "./review/presentation.js?v=20260928-ap-suggestions-v1&trend=concise-v3";
import { createReviewController } from "./review/controller.js?v=20260928-ap-suggestions-v1&labs=analyte-selection-v3&rxnorm=v2&draft=sections-v1&pull=stay-fallback-v1";
import { createPromptsPresentation, renderHighlightedSegments } from "./prompts/presentation.js?v=20260921-medication-card-v4";
import {
  createPromptTaskController,
  filterSmartVariableMenu,
  positionSmartVariableMenu,
  promptVariableTokenAtCaret,
  scrollPromptOutputToVariable
} from "./prompts/controller.js?v=20260921-medication-card-v4";
import { createGuidelineSetsController } from "./settings/guidelines-controller.js?v=20260910-guideline-pagination&focus=prevent-scroll-v2";
import { createAdmissionDateGate } from "./admission-date-gate.js?v=20260714-admission-day-redaction";
import { createAdmissionDateAnchor } from "./admission-date-anchor.js?v=20260921-medication-card-v4";
import { createTokenColorPickerController } from "./token-color-picker.js?v=20260921-medication-card-v4";
import { preserveViewScroll, replaceViewContent } from "./view-scroll.js?v=20260925-preserve-view-scroll-v2";
import { createSettingsPresentation } from "./settings/presentation.js?v=20260921-medication-card-v4&local-ai=guidelines-editable-v1";
import { installGlobalFetchGuard, isOfflineMode, onOfflineModeChange, setOfflineMode } from "../lib/network-gate.js?v=20260929-offline-mode-v1";
import { createVaultPresentation, disambiguatedPatientLabels } from "./vault/presentation.js?v=20260718-vault-safety";
import { createVaultSessionGuards } from "./vault/session-guards.js?v=20260922-vault-guards";
import { createClipboard } from "./clipboard.js?v=20260922-clipboard";
import { createVaultPassphraseController } from "./vault/passphrase-controller.js?v=20260921-landing-onboarding";
import {
  createRedactionPresentation,
  redactionPosition,
  warningDescription,
  warningSnippet
} from "./redaction/presentation.js?v=20260921-medication-card-v4";
import { createQuickDeidPresentation } from "./quick-deid/presentation.js?v=20260717-transfer-actions";
import { createDeidSessionCoordinator } from "./deid/session-coordinator.js?v=20260929-deid-clinicale5";
import { runQuickDeidLlmVerification, selectedLlmVerifierModel } from "./deid/llm-verifier-session.js?v=20261001-llm-verifier-v1";
import { createDemoController } from "./demo/controller.js?v=20261001-demo-v4";
import { createDemoPatient, DEMO_DAILY_TEXTS } from "./demo/session.js?v=20261001-demo-v4";
import { createDemoSessionController } from "./demo/session-controller.js?v=20261001-demo-v4";
import { createAiChatController } from "./ai-chat/controller.js?v=20261001-ai-chat-drawer-sync";
import { createDrugChecksPresentation } from "./drug-checks/presentation.js?v=20261001-drug-checks-v2";
import { createDrugChecksController } from "./drug-checks/controller.js?v=20261001-drug-checks-v2";
import { clearAllRagIndexes } from "../rag/rag-service.js?v=20260929-rag-v3";
import { createDrugLookupController } from "./drug-lookup/controller.js?v=20260929-ddinter-v2";
import { createDrugLookupPresentation } from "./drug-lookup/presentation.js?v=20260929-ddinter-v2";
import { createScoresController } from "./scores/controller.js?v=20260927-models-v2";
import { createCheatSheetsController } from "./cheat-sheets/controller.js?v=20261001-cheatsheets-fix-v1";
import { createSampleNotesController } from "./sample-notes/controller.js?v=20261001-sample-notes-v2";
import { localLlmModelByKey, readLocalLlmSettings, writeLocalLlmSettings } from "../local-llm/client.js?v=20260928-local-llm-v1";
import { DEFAULT_SYSTEM_GUIDELINES } from "../local-llm/system-prompt.js?v=20260928-local-llm-v10";
import Fuse from "../../vendor/fuse-7.0.0.mjs?v=20260711-functional-remediation-16";
const app = {
  vault: null,
  passphrase: "",
  view: "vault",
  selectedDayId: "",
  selectedStayPacketId: "admission", selectedPromptTask: "presentation_quality_editor", promptDayId: "",
  promptDayFollowsSelectedDay: true,
  customPromptTasks: loadCustomPromptTasks(),
  pendingRemovePromptTaskId: "",
  guidelineSets: [],
  guidelineSearchQuery: "",
  guidelineSelectedIds: new Set(),
  guidelineOpenId: "",
  guidelineCreateDraft: null,
  pendingRemoveGuidelineSetId: "",
  pendingRemoveGuidelineSetIds: [],
  status: "",
  vaultUnlockError: "",
  deidMode: DEFAULT_DEID_MODEL_KEY,
  deidStatus: getAdvancedDeidStatus(),
  loadingDeidModelKey: "",
  deidOperation: { active: false, message: "Choose a verified local model before saving raw text." },
  modelPacks: {},
  modelPackBusyKey: "",
  modelPackProgress: {},
  modelPackErrors: {},
  modelPackAbortController: null,
  pendingModelPackKey: "",
  modelPackService: { ready: false, message: "Preparing local model installer..." },
  webGpuAvailable: typeof navigator !== "undefined" && Boolean(navigator.gpu),
  promptTemplates: loadPromptTemplateOverrides(),
  promptDrafts: {},
  presentationToEdit: "", presentationToEditPacketId: "", presentationToEditEdited: false,
  presentationSpecialty: "",
  tokenColorOverrides: loadTokenColorOverrides(),
  smartMenuOpen: false,
  quickDeid: { input: "", output: "", warnings: [], status: "", review: null, admissionDate: "", verifyWithLlm: false },
  drugChecks: { medInput: "", status: "", dataState: "idle", dataError: "", result: null },
  quickDeidBusy: false,
  phiReviews: new Map(),
  // Session-only edits remain outside the encrypted vault until the user
  // explicitly saves the containing packet.
  sectionDrafts: new Map(),
  sectionEditingKeys: new Set(),
  pendingSectionReviewFocus: null,
  structuredNoteDrafts: new Map(), structuredNoteComposers: new Map(), noteDraftSessions: new Map(),
  reviewPacketId: "admission", reviewSearchQuery: "", reviewCategory: "all", reviewPage: 0, reviewDifferenceSelectionId: "",
  dailySourceKind: DEFAULT_DAILY_SOURCE_KIND,
  dailySourceDraft: "",
  dailySourceParse: null,
  dailyResultMetadata: { label: "", category: "imaging", date: "", context: "" },
  admissionSourceKind: DEFAULT_DAILY_SOURCE_KIND,
  admissionSourceDraft: "",
  admissionSourceParse: null,
  admissionResultMetadata: { label: "", category: "imaging", date: "", context: "" },
  pendingArchivePatientId: "",
  pendingRemoveDayId: "",
  demoSession: null,
  demoPreviewMode: false,
  admissionDate: "" // in-memory copy of the encrypted patient's admission-date anchor
};
const viewIds = ["vault", "daily", "cheatSheets", "review", "sampleNotes", "prompts", "quickDeid", "aiChat", "drugLookup", "drugChecks", "scores", "scribePro", "settings"];
const viewTitles = {
  vault: "Vault / Roster", daily: "Hospital Stay", review: "Review Data / Draft Note",
  cheatSheets: "Cheat Sheets", prompts: "Prompts",
  quickDeid: "Quick De-ID Tool", sampleNotes: "Sample Notes", aiChat: "AI Chat", drugLookup: "Drug Lookup", drugChecks: "Drug checks", scores: "Models", settings: "Settings"
};
let draggedSectionRow = null;
let sectionDragSaved = false;
let vaultInactivityTimer = null;
const VAULT_INACTIVITY_MS = 15 * 60 * 1000;

function byId(id) {
  return document.getElementById(id);
}
function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Local-AI note-parsing availability, shared by the Daily paste panel and the
// source controller. Read at render time (never cached) so the paste panel
// reflects model readiness as soon as it changes.
const localAiParseBusyByScope = new Map();
function setLocalAiParseBusy(scope, busy) {
  if (busy) localAiParseBusyByScope.set(scope, true);
  else localAiParseBusyByScope.delete(scope);
}
function localAiParseInfo(scope) {
  let enabled = false;
  let ready = false;
  let modelLabel = "";
  try {
    enabled = readLocalLlmSettings().parsingEnabled === true;
    const status = aiChatController.getClient().getStatus();
    ready = status.status === "ready" && status.verified === true;
    modelLabel = status.activeModelKey ? localLlmModelByKey(status.activeModelKey)?.label || "" : "";
  } catch {
    // Client unavailable (e.g. during early boot): report not ready.
  }
  return { scope, enabled, ready, modelLabel, busy: localAiParseBusyByScope.get(scope) === true };
}
const dailyPresentation = createDailyPresentation({ escapeHtml, icon, localAiParseInfo });
const reviewPresentation = createReviewPresentation({ escapeHtml, icon });
const redactionPresentation = createRedactionPresentation({ escapeHtml, icon });
const quickDeidPresentation = createQuickDeidPresentation({ escapeHtml, icon });
const drugLookupPresentation = createDrugLookupPresentation({ escapeHtml, icon });
const promptsPresentation = createPromptsPresentation({ escapeHtml });
const settingsPresentation = createSettingsPresentation({ escapeHtml });
const vaultPresentation = createVaultPresentation({ escapeHtml, icon });
const {
  showVaultUnlockError,
  clearVaultUnlockError,
  toggleVaultPassphraseVisibility,
  updateVaultPassphraseStrength,
  updateVaultPrimaryActionEnabled
} = createVaultPassphraseController({ app });
const vaultSessionGuards = createVaultSessionGuards({ readEncryptedVaultRecord });
const clipboard = createClipboard({ setStatus });
const demoController = createDemoController({
  app,
  byId,
  escapeHtml,
  getSession: () => app.demoSession,
  getView: () => app.view,
  render,
  selectDemoPacket: () => {
    dailySourceController.selectPacket("demo_day_guided_case");
    app.dailySourceKind = "other_chart_text"; app.dailySourceDraft = DEMO_DAILY_TEXTS.join("\n\n");
  },
  // Lazy arrows: invoked only after full module evaluation, so referencing
  // controllers declared below is safe.
  getCheatSheetOpenId: () => cheatSheetsController.getOpenSheetId(),
  seedAiChatDemo: (samples) => aiChatController.seedDemoMessages(samples),
  clearAiChatDemo: () => aiChatController.clearDemoMessages(),
  setAiChatDemoReply: (answer, onReply) => aiChatController.setDemoReply(answer, onReply),
  clearAiChatDemoReply: () => aiChatController.clearDemoReply()
});
const reviewController = createReviewController({ app, active, byId, presentation: reviewPresentation, patientRequiredMessage, persistVault, render, setStatus, showToast, copyText: clipboard.copyText, downloadText, isEphemeralDemo: () => Boolean(app.demoSession), onDraftSaved: () => demoController.observeDraftSaved(), currentPreferences });
const demoSessionController = createDemoSessionController({
  app,
  createDemoPatient,
  structuredDeidMode: STRUCTURED_DEID_MODE,
  clearPhiReviews,
  clearQuickDeidSession,
  render,
  setStatus
});
// Section-citation navigation: clicking a "per [Section]" chip in AI Chat
// opens the matching saved chart source. The target ({ scope, dayId,
// sectionId }) comes from the reviewed chart pieces, so it always points at
// a real saved source — never a vector chunk. Admission sections and
// hospital-day captures both live in the Hospital Stay view under
// #contextSections / #dailySources.
function navigateToChartSection(target) {
  if (!target || !active()) return;
  if (target.scope === "context") {
    app.selectedStayPacketId = "admission";
  } else if (target.scope === "daily" && target.dayId) {
    app.selectedDayId = target.dayId;
    app.selectedStayPacketId = target.dayId;
  } else {
    return;
  }
  app.view = "daily";
  render();
  // The daily view renders synchronously inside render(); scroll and flash
  // the matching saved source on the next frame.
  requestAnimationFrame(() => {
    const listId = target.scope === "daily" ? "dailySources" : "contextSections";
    let el = null;
    if (target.sectionId) {
      el = document.querySelector(
        `#${listId} .section-editor[data-section-id="${CSS.escape(String(target.sectionId))}"]`
      );
    }
    // Day-level pieces (e.g. quick notes) anchor the packet's section list.
    if (!el) el = document.getElementById(listId);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("aic-flash-section");
    void el.offsetWidth;
    el.classList.add("aic-flash-section");
    setTimeout(() => el.classList.remove("aic-flash-section"), 1700);
  });
}

const aiChatController = createAiChatController({
  app,
  byId,
  escapeHtml,
  icon,
  setStatus,
  render: renderAiChat,
  getDraftNoteText: () => reviewController.getDraftNoteText(),
  getDraftNoteSections: () => reviewController.getDraftNoteSections(),
  currentPreferences,
  onChatServiceChange: (value) => {
    setVaultPreferences({ ...currentPreferences(), chatService: value });
    persistVault("Chat service updated.").then(() => render());
  },
  onOpenAiModelChange: (value) => {
    setVaultPreferences({ ...currentPreferences(), openAiModel: value });
    persistVault("ChatGPT model updated.").then(() => render());
  },
  onNavigateToChartSection: navigateToChartSection
});
// Medication names for the active patient, pulled from parsed medication
// captures on this device. Only names are returned; the caller sends just
// those names to NLM for RxCUI matching, never patient context.
function getPatientMedicationNames() {
  const patient = active();
  if (!patient) return [];
  const names = [];
  const seen = new Set();
  for (const day of patient.days || []) {
    for (const capture of day.sourceCaptures || []) {
      if (capture?.sourceKind !== "medication_activity") continue;
      const text = capture.deidentifiedText || "";
      if (!text.trim()) continue;
      try {
        const parsed = parseClinicalExport(text, { sourceKind: "medication_activity" });
        for (const group of parsed?.displayModel?.groups || []) {
          for (const row of group.rows || []) {
            const name = String(row?.name || "").trim();
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              names.push(name);
            }
          }
        }
      } catch {
        // Skip captures that do not parse; never break the view.
      }
    }
  }
  return names;
}
const drugLookupController = createDrugLookupController({
  presentation: drugLookupPresentation,
  render: renderDrugLookup,
  setStatus,
  getPatientMedicationNames
});
const drugChecksPresentation = createDrugChecksPresentation({ escapeHtml });
const drugChecksController = createDrugChecksController({
  app,
  byId,
  escapeHtml,
  render: renderDrugChecks,
  vaultIsUnlocked,
  onCheckComplete: (ok) => {
    if (ok) demoController.observeAction("drug-checks-check");
  }
});
const scoresController = createScoresController({
  app,
  active,
  byId,
  escapeHtml,
  replaceViewContent,
  patientRequiredMessage,
  selectedDayId: selectedDay,
  persistVault,
  updateActivePatient
});
const cheatSheetsController = createCheatSheetsController({ app, byId, escapeHtml, replaceViewContent });
const admissionDateAnchor = createAdmissionDateAnchor({ state: app, active, sortDays });
const promptTaskController = createPromptTaskController({ state: app, setStatus, renderPrompts, refreshPromptPreview, byId });
const guidelineSetsController = createGuidelineSetsController({ state: app, setStatus, renderSettings, renderPrompts, byId });
const admissionDateGate = createAdmissionDateGate({ app, byId });
const deidSession = createDeidSessionCoordinator({ state: app, admissionDateAnchor, admissionDateGate, deidentifyText, updateDeidStatus, updateDeidOperation, setStatus, getPatientIdentity: () => {
  // B1: the active patient's known identity, passed as explicit data the
  // de-identifier matches locally. displayLabel is INTENTIONALLY
  // de-identified (the UI instructs room labels, never real names), so it
  // must not feed the identity lexicon. Only explicit identity metadata
  // opts in; without it B1 stays dormant and returns null.
  const patient = active();
  if (!patient) return null;
  const metadata = patient.metadata && typeof patient.metadata === "object" ? patient.metadata : {};
  const name = metadata.patientName || metadata.name ||
    [metadata.firstName, metadata.middleName, metadata.lastName].filter(Boolean).join(" ");
  const dob = metadata.dob || metadata.dateOfBirth || "";
  if (!String(name || "").trim() && !String(dob || "").trim()) return null;
  return { name: String(name || ""), dob: String(dob || "") };
} });
const sampleNotesController = createSampleNotesController({
  app,
  byId,
  escapeHtml,
  icon,
  replaceViewContent,
  render,
  setStatus,
  copyText: clipboard.copyText,
  vaultIsUnlocked,
  ensureSelectedDeidReady,
  deidentify: deidSession.deidentify,
  updateDeidOperation,
  persistVault,
  setSectionDraftText,
  beginSectionReview,
  clearPatientScopedSession
});
const dailySourceController = createDailySourceController({
  app,
  active,
  selectedDay,
  byId,
  localCalendarDate,
  patientRequiredMessage,
  renderDeidStrip,
  renderSectionEditor,
  renderWarnings,
  dailyPresentation,
  redactionPresentation,
  isSectionTextEditing,
  sectionReviewFor,
  sectionDraftText,
  reviewSectionsForScope,
  ensureSelectedDeidReady,
  deidentify: deidSession.deidentify,
  updateDeidOperation,
  setStatus,
  localAiParseInfo,
  setLocalAiParseBusy,
  setSectionDraftText,
  admissionDateAnchor,
  beginSectionReview,
  persistVault,
  render,
  applyApprovedRedactions
});
const tokenColorPicker = createTokenColorPickerController({
  byId,
  getOverrides: () => app.tokenColorOverrides,
  saveOverrides: (overrides) => {
    app.tokenColorOverrides = overrides;
    saveTokenColorOverrides(overrides);
  },
  // Not a renderPrompts(): commit() already repaints its own swatch, and a
  // full re-render here would lose the menu's docked position/filter/focus.
  onApplied: () => {
    if (app.view === "prompts") refreshPromptPreview();
  }
});
function selectedDeidOption() {
  return app.deidMode === STRUCTURED_DEID_MODE ? null : deidModelOptionByKey(app.deidMode);
}
function selectedDeidStatus() {
  return app.deidMode === STRUCTURED_DEID_MODE
    ? {
        message: "Structured-only de-identification selected.",
        ready: true,
        modelId: "",
        label: "Structured only"
      }
    : getSelectedDeidModelStatus(app.deidMode);
}
function modelPackStateFor(option) {
  if (!option) return { state: "unavailable", ready: false, message: "Unknown model." };
  if (!option.browserRunnable) {
    return { state: "unavailable", ready: false, message: option.disabledReason || "This model is not available in the browser." };
  }
  return (
    app.modelPacks[option.key] ||
    (isInstallableModel(option)
      ? { state: "checking", ready: false, message: "Checking local model-pack storage..." }
      : { state: "bundled", ready: true, message: "Bundled with this static app." })
  );
}
function deidModelDisabledReason(option) {
  if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
  if (option.requiresWebGpu && !app.webGpuAvailable) return "This model needs graphics acceleration that isn't available in this browser.";
  const pack = modelPackStateFor(option);
  if (isInstallableModel(option) && !pack.ready) return pack.message;
  return "";
}
function deidModelSelectOptions() {
  const modelOptions = DEID_MODEL_OPTIONS.map((option) => {
    const unavailable = !option.browserRunnable || (option.requiresWebGpu && !app.webGpuAvailable);
    const disabled = unavailable ? "disabled" : "";
    const state = modelPackStateFor(option);
    const installState =
      isInstallableModel(option) && !state.ready
        ? state.state === "installed"
          ? " - downloaded; verify to use"
          : " - download required"
        : "";
    const suffix = unavailable ? ` - ${deidModelDisabledReason(option)}` : installState;
    return `<option value="${escapeHtml(option.key)}" ${app.deidMode === option.key ? "selected" : ""} ${disabled}>${escapeHtml(option.label)}${escapeHtml(suffix)}</option>`;
  }).join("");
  return `
    <option value="${STRUCTURED_DEID_MODE}" ${app.deidMode === STRUCTURED_DEID_MODE ? "selected" : ""}>Structured only</option>
    ${modelOptions}
  `;
}

function deidModelLabel(key) {
  if (key === STRUCTURED_DEID_MODE) return "Structured only";
  const option = deidModelOptionByKey(key);
  return option.shortLabel || option.label || key;
}

function selectDeidModel(modelKey) {
  const option = deidModelOptionByKey(modelKey);
  if (!option.browserRunnable) throw new Error(option.disabledReason || `${option.label} is not available in this browser.`);
  app.deidMode = option.key;
  app.quickDeid.status = `${option.label} selected. Download and verify it locally before use.`;
  renderStatusBar();
  if (app.view === "quickDeid") renderQuickDeid();
  if (app.view === "daily") refreshDeidControlsInActiveView();
}

function selectedDeidStateText() {
  if (app.loadingDeidModelKey === app.deidMode) {
    return `Loading ${deidModelLabel(app.deidMode)}...`;
  }
  const status = selectedDeidStatus();
  if (app.deidMode === STRUCTURED_DEID_MODE) return status.message;
  return status.ready ? `Ready: ${status.modelId || status.label || deidModelLabel(app.deidMode)}` : status.message;
}

function selectedDeidReadiness() {
  if (app.deidMode === STRUCTURED_DEID_MODE) return { ready: true, message: "Structured-only local redaction is ready." };
  const status = selectedDeidStatus();
  return status.ready
    ? { ready: true, message: `${deidModelLabel(app.deidMode)} is verified and ready locally.` }
    : {
        ready: false,
        message: `${deidModelLabel(app.deidMode)} hasn't loaded yet - it loads and verifies automatically the first time you use it (may take a moment).`
      };
}

function selectedDeidReadinessAsPanelProps() {
  const readiness = selectedDeidReadiness();
  return { deidReady: readiness.ready, deidReadyMessage: readiness.message };
}

function renderDeidOperation() {
  const operation = app.deidOperation || {};
  return `
    <div class="deid-operation ${operation.active ? "is-active" : ""}" data-deid-operation aria-live="polite">
      <progress data-deid-operation-progress ${Number.isFinite(operation.value) ? `value="${Math.max(0, operation.value)}" max="${Math.max(1, operation.total || 1)}"` : ""}></progress>
      <span data-deid-operation-message>${escapeHtml(operation.message || "")}</span>
    </div>`;
}

function updateDeidOperation({ active = false, message = "", value, total } = {}) {
  app.deidOperation = { active, message, value, total };
  const operation = document.querySelector("[data-deid-operation]");
  if (!operation) return;
  operation.classList.toggle("is-active", active);
  operation.querySelector("[data-deid-operation-message]")?.replaceChildren(document.createTextNode(message));
  const progress = operation.querySelector("[data-deid-operation-progress]");
  if (progress && Number.isFinite(value)) {
    progress.value = Math.max(0, value);
    progress.max = Math.max(1, total || 1);
  }
  if (app.view === "daily") {
    document.querySelectorAll('[data-action="save-context"], [data-action="save-day"]').forEach((button) => {
      button.disabled = active;
      button.textContent = active ? "De-identifying…" : "Save changes";
    });
    const dailyAddButton = document.querySelector('[data-action="add-daily-source"]');
    if (dailyAddButton) {
      dailyAddButton.disabled = active || !app.dailySourceDraft.trim();
      dailyAddButton.textContent = active ? "De-identifying…" : "De-identify and add source";
    }
    const admissionAddButton = document.querySelector('[data-action="add-admission-source"]');
    if (admissionAddButton) {
      admissionAddButton.disabled = active || !app.admissionSourceDraft.trim();
      admissionAddButton.textContent = active ? "De-identifying…" : "De-identify and add source";
    }
  }
}

// Loads/downloads/verifies the selected model automatically instead of
// requiring a separate manual trip to Settings first - once a model has
// loaded in this session, selectedDeidReadiness().ready is already true and
// this resolves immediately without reloading anything.
async function ensureSelectedDeidReady() {
  const readiness = selectedDeidReadiness();
  if (readiness.ready) return readiness;
  const option = selectedDeidOption();
  if (crossOriginIsolationBlocker()) throw new Error(crossOriginIsolationBlocker());
  let caughtMessage = "";
  try {
    if (option && isInstallableModel(option) && hasAutomaticModelDownload(option)) {
      const pack = await getModelPackState(option);
      app.modelPacks = { ...app.modelPacks, [option.key]: pack };
      if (pack.state === "installed") await verifyInstalledModelPack(option.key);
      else await downloadSelectedModelPack(option.key);
    } else {
      await loadAdvancedModel();
    }
  } catch (error) {
    caughtMessage = error instanceof Error ? error.message : "";
  }
  const finalReadiness = selectedDeidReadiness();
  if (finalReadiness.ready) return finalReadiness;
  throw new Error((option && app.modelPackErrors?.[option.key]) || caughtMessage || finalReadiness.message);
}
function deidLoadButtonDisabled() {
  if (app.deidMode === STRUCTURED_DEID_MODE) return true;
  if (app.loadingDeidModelKey === app.deidMode) return true;
  const option = selectedDeidOption();
  return option ? Boolean(deidModelDisabledReason(option)) : true;
}
function deidLoadButtonLabel() {
  return app.loadingDeidModelKey === app.deidMode
    ? '<span class="spinner" aria-hidden="true"></span> Loading model...'
    : `${icon("shield")} Load selected model`;
}
function renderDeidLoadButton() {
  const option = selectedDeidOption();
  if (!option) return `<span class="model-selection-message model-selection-message--ready">${icon("shield")} Ready locally</span>`;
  const pack = option ? modelPackStateFor(option) : null;
  if (pack?.state === "installed") {
    const verifying = app.modelPackBusyKey === option.key;
    return `<button type="button" data-action="verify-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${verifying ? '<span class="spinner" aria-hidden="true"></span> Verifying...' : `${icon("shield")} Verify ${escapeHtml(option.shortLabel || option.label)}`}</button>`;
  }
  const canInstallSelected = Boolean(
    option &&
    isInstallableModel(option) &&
    !pack?.ready &&
    hasAutomaticModelDownload(option) &&
    canAutomaticallyInstallModel(option) &&
    (!option.requiresWebGpu || app.webGpuAvailable)
  );
  if (canInstallSelected) {
    const downloading = app.modelPackBusyKey === option.key;
    return `<button type="button" data-action="download-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${downloading ? '<span class="spinner" aria-hidden="true"></span> Downloading locally...' : `${icon("download")} Download ${escapeHtml(option.shortLabel || option.label)} locally`}</button>`;
  }
  return `<button type="button" data-action="load-advanced-deid" ${deidLoadButtonDisabled() ? "disabled" : ""}>${deidLoadButtonLabel()}</button>`;
}
async function selectedModelLoadBlocker(option) {
  if (!option) return "Structured-only de-identification selected.";
  if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
  if (isInstallableModel(option)) {
    const pack = await getModelPackState(option);
    app.modelPacks = { ...app.modelPacks, [option.key]: pack };
    if (!pack.ready) return pack.message;
  }
  return crossOriginIsolationBlocker() || webGpuRuntimeBlocker(option);
}

async function webGpuRuntimeBlocker(option) {
  if (!option?.requiresWebGpu) return "";
  const available = await refreshWebGpuAvailability({ renderAfter: false });
  if (available) return "";
  return `${option.label} needs graphics acceleration this browser doesn't support. The model stays downloaded on this device — try a different browser, or use a device with a compatible graphics card.`;
}

function modelPackFailureMessage(option, error) {
  const detail = error instanceof Error && error.message ? error.message : `${option.label} could not be verified.`;
  if (option?.key === DEFAULT_DEID_MODEL_KEY && /bad_alloc|can't create a session/i.test(detail)) {
    return `${option.label} is already downloaded, but this device doesn't have enough graphics memory free to run it right now. No re-download is needed — close other heavy apps (video calls, other browser tabs), refresh, and verify again. If it still fails, use the Base or Small OpenMed option instead.`;
  }
  if (option?.key === "openmed-superclinical-small" && /unaligned accesses/i.test(detail)) {
    return `${option.label} hit a compatibility issue with this browser. Its downloaded files are unaffected — refresh the page, then choose "Verify model" to try again. No re-download is needed.`;
  }
  return detail;
}

function modelPackActionLabel(option) {
  const state = modelPackStateFor(option);
  if (app.modelPackBusyKey === option.key) return app.modelPackProgress[option.key] ? "Downloading..." : "Preparing...";
  if (state.state === "ready") return "Download again";
  if (state.state === "installed") return "Verify model";
  if (state.state === "partial") return "Resume download";
  return "Download and install";
}

function modelPackStateLabel(state) {
  if (state.state === "bundled") return "Bundled";
  if (state.state === "self-hosted") return "Available locally";
  if (state.state === "ready") return "Verified";
  if (state.state === "installed") return "Needs verification";
  if (state.state === "partial") return "Download paused";
  return state.state.replaceAll("-", " ");
}

function modelPackProgressText(option) {
  const progress = app.modelPackProgress[option.key];
  if (!progress) return "";
  const totalBytes = progress.totalBytes || modelDownloadBytes(option);
  const percent = totalBytes ? Math.min(100, Math.floor((progress.completedBytes / totalBytes) * 100)) : 0;
  return `${percent}% - ${formatBytes(progress.completedBytes)} of ${formatBytes(totalBytes)} (${progress.file})`;
}

function renderOpenMedSmallFallback(option) {
  if (!option?.openMedTier || option.openMedTier === "small") return "";
  return `<button class="button--quiet" type="button" data-action="select-deid-model" data-model-key="openmed-superclinical-small">${icon("chevron")} Use OpenMed Small for this device</button>`;
}

function _renderQuickInstallerFeedback() {
  const option = selectedDeidOption();
  if (!option || !isInstallableModel(option)) return "";
  const progress = app.modelPackProgress[option.key];
  const error = app.modelPackErrors[option.key];
  const busy = app.modelPackBusyKey === option.key;
  const state = modelPackStateFor(option);
  const totalBytes = progress?.totalBytes || modelDownloadBytes(option);
  const completedBytes = progress?.completedBytes || 0;
  const progressText = progress ? modelPackProgressText(option) : `${formatBytes(totalBytes)} local download required before first use.`;
  if (option.requiresWebGpu && !app.webGpuAvailable) {
    return `<div class="quick-installer-feedback quick-installer-feedback--error" role="alert"><div><strong>Graphics acceleration needed for ${escapeHtml(option.shortLabel || option.label)}</strong><span>The Large model stays downloaded on this device, but this browser can't run it without graphics acceleration. Try a different browser, or a device with more graphics memory.</span></div>${renderOpenMedSmallFallback(option)}</div>`;
  }
  if (error) {
    const verificationOnly = state.state === "installed";
    return `
      <div class="quick-installer-feedback quick-installer-feedback--error" role="alert">
        <div><strong>${escapeHtml(option.shortLabel || option.label)} ${verificationOnly ? "verification" : "install"} did not complete</strong><span>${escapeHtml(error)}</span></div>
        <div class="button-row"><button type="button" data-action="${verificationOnly ? "verify-model-pack" : "download-model-pack"}" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${icon(verificationOnly ? "shield" : "download")} ${verificationOnly ? "Retry GPU verification" : "Retry download"}</button>${renderOpenMedSmallFallback(option)}</div>
      </div>
    `;
  }
  if (state.ready) {
    return `<div class="quick-installer-feedback quick-installer-feedback--ready"><strong>${escapeHtml(option.shortLabel || option.label)} is installed locally</strong><span>Local inference self-test passed. The app will use only this browser-local package for this model.</span></div>`;
  }
  if (!busy && state.state === "partial") {
    return `
      <div class="quick-installer-feedback">
        <div><strong>Download paused</strong><span>${escapeHtml(progressText)}. Resume when this device has a stable connection and enough free storage.</span></div>
        <button type="button" data-action="download-model-pack" data-model-key="${escapeHtml(option.key)}">${icon("download")} Resume download</button>
        <progress data-active-model-progress value="${Math.max(0, completedBytes)}" max="${Math.max(1, totalBytes)}"></progress>
      </div>
    `;
  }
  if (!busy && state.state === "installed") {
    return `<div class="quick-installer-feedback"><div><strong>${escapeHtml(option.shortLabel || option.label)} is downloaded locally</strong><span>Run a quick check to confirm this device can run the model before using it. The model will not be downloaded again.</span></div><div class="button-row"><button type="button" data-action="verify-model-pack" data-model-key="${escapeHtml(option.key)}">${icon("shield")} Verify model</button>${renderOpenMedSmallFallback(option)}</div></div>`;
  }
  if (!busy && !progress) {
    return `<div class="quick-installer-feedback"><strong>Local install required</strong><span>${escapeHtml(progressText)} The first run downloads only the pinned model package; patient text never leaves this browser.</span></div>`;
  }
  return `
    <div class="quick-installer-feedback" aria-live="polite">
      <div><strong>${busy ? `Installing ${escapeHtml(option.shortLabel || option.label)} locally` : "Preparing local model verification"}</strong><span data-active-model-progress-text>${escapeHtml(progressText)}</span></div>
      <progress data-active-model-progress value="${Math.max(0, completedBytes)}" max="${Math.max(1, totalBytes)}"></progress>
      ${busy ? `<button class="button--quiet" type="button" data-action="cancel-model-download" data-model-key="${escapeHtml(option.key)}">Cancel</button>` : ""}
    </div>
  `;
}

function renderModelPackCard(option) {
  const state = modelPackStateFor(option);
  const installable = isInstallableModel(option);
  const automaticDownload = hasAutomaticModelDownload(option);
  const canAutomaticallyDownload =
    automaticDownload && canAutomaticallyInstallModel(option) && (!option.requiresWebGpu || app.webGpuAvailable);
  const hardware = !option.browserRunnable
    ? option.disabledReason || "This model is not available in the browser."
    : option.requiresWebGpu && !app.webGpuAvailable
      ? "Graphics acceleration is unavailable in this browser."
      : "Runs entirely on this device — nothing is uploaded.";
  const actionDisabled = app.modelPackBusyKey ? "disabled" : "";
  const primaryAction = state.state === "installed" ? "verify-model-pack" : "download-model-pack";
  const canRemove = ["handles", "imported", "opfs"].includes(state.source);
  const progressText = modelPackProgressText(option);
  const progress = app.modelPackProgress[option.key];
  return `
    <article class="model-pack-card" data-model-key="${escapeHtml(option.key)}">
      <div class="model-pack-card-header">
        <div>
          <strong>${escapeHtml(option.label)}</strong>
          <span class="model-pack-state state-${escapeHtml(state.state)}">${escapeHtml(modelPackStateLabel(state))}</span>
        </div>
        <span class="section-meta">${escapeHtml(option.sizeLabel || "Local model")}</span>
      </div>
      <p>${escapeHtml(option.description || "Local de-identification model.")}</p>
      <p class="muted">${escapeHtml(state.message || hardware)}</p>
      <p class="muted">${escapeHtml(hardware)}</p>
      ${automaticDownload ? `<p class="muted">Pinned download source: ${escapeHtml(option.download.provider)} (${escapeHtml(option.download.repository)} @ ${escapeHtml(option.download.revision.slice(0, 12))}). Only model weights are downloaded.</p>` : ""}
      ${progress ? `<div class="model-pack-progress" aria-live="polite"><progress value="${Math.max(0, progress.completedBytes)}" max="${Math.max(1, progress.totalBytes)}"></progress><span data-model-pack-progress="${escapeHtml(option.key)}">${escapeHtml(progressText)}</span></div>` : ""}
      ${
        installable
          ? `<div class="button-row">
              <button type="button" data-action="${primaryAction}" data-model-key="${escapeHtml(option.key)}" ${canAutomaticallyDownload ? actionDisabled : "disabled"}>${icon("download")} ${escapeHtml(modelPackActionLabel(option))}</button>
              ${app.modelPackBusyKey === option.key ? `<button type="button" data-action="cancel-model-download" data-model-key="${escapeHtml(option.key)}">Cancel</button>` : ""}
              <button class="button--transfer" type="button" data-action="import-model-pack" data-model-key="${escapeHtml(option.key)}" ${actionDisabled}>${icon("upload")} Import folder</button>
              ${canRemove ? `<button type="button" data-action="remove-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${icon("trash")} Remove local pack</button>` : ""}
            </div>`
          : option.browserRunnable
            ? `<div class="model-pack-bundled">Bundled with this static app.</div>`
            : `<div class="model-pack-bundled">Offline validation reference; not a live browser option.</div>`
      }
    </article>
  `;
}

function _renderModelLibrary() {
  return `
    <details class="model-library" aria-labelledby="model-library-title">
      <summary>
        <span>
          <strong id="model-library-title">Local model library</strong>
          <span class="muted">Optional local packs and model-storage controls.</span>
        </span>
        <span class="section-meta">${escapeHtml(app.modelPackService.message)}</span>
      </summary>
      <div class="model-library-body">
        <p class="muted">Download once into this browser, then run inference locally. Automatic packages use pinned revisions; the OpenMed package also checks its published artifact identity before it is saved. Patient text is never sent with the model download or model inference.</p>
        <div class="model-pack-grid">${DEID_MODEL_OPTIONS.map(renderModelPackCard).join("")}</div>
      </div>
    </details>
  `;
}

function active() {
  return activePatient(app.vault);
}

// Archiving a patient permanently removes them (see archivePatient in
// app/state/vault.js), so archivedAt is only ever non-empty on data saved by
// an older build. Filter those out everywhere patients are listed instead of
// showing a permanently-disabled "Archived" row that can never be dismissed.
function visiblePatients(vault) {
  return (vault?.patients || []).filter((patient) => !patient.archivedAt);
}

let lastToastedStatus = "";
function setStatus(message, { icon: iconName } = {}) {
  app.status = message;
  const status = byId("statusLine");
  if (!status) return;
  if (iconName) status.innerHTML = `${icon(iconName)}${escapeHtml(message)}`;
  else status.textContent = message;
  // Every action outcome also gets an auto-dismissing toast so feedback is
  // impossible to miss. Skip in-progress ("...") messages, the idle default,
  // and repeats caused by re-renders restoring the same status.
  const text = String(message || "").trim();
  const idleDefault = "All data is encrypted and stays on this device. Nothing leaves without your explicit action.";
  if (text && !text.endsWith("...") && text !== idleDefault && text !== lastToastedStatus) {
    lastToastedStatus = text;
    const lower = text.toLowerCase();
    let type = "success";
    if (/fail|error|could not|unable|invalid|not saved|not found/.test(lower)) type = "error";
    else if (/select|choose|please|required|first|confirm|warning|missing|no .* found/.test(lower)) type = "warning";
    showToast(text, { type });
  }
}

// Brief auto-dismissing toast warning/success. Used for pull-from-primary
// feedback and other transient notices the student must not miss — the
// status line is persistent but easy to overlook.
let toastTimer = null;
function showToast(message, { type = "warning", durationMs = 3500 } = {}) {
  let container = byId("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  container.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "toast-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "✕";
  dismiss.addEventListener("click", () => container.innerHTML = "");
  toast.appendChild(dismiss);
  container.appendChild(toast);
  // Trigger the entrance animation on the next frame.
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => { if (toast.parentNode === container) container.innerHTML = ""; }, 300);
  }, durationMs);
}

function actionFeedback(target, action) {
  const label = String(target.getAttribute("aria-label") || target.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = String(action || "Action")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  setStatus(`${label || fallback}...`);
}

async function persistVault(message = "Saved.") {
  if (!app.vault || !app.passphrase) return;
  if (app.demoSession) {
    setStatus(`${message} Demo only — nothing is written to your vault.`);
    return;
  }
  await saveEncryptedVault(app.vault, app.passphrase);
  setStatus(message);
}

function patientRequiredMessage() {
  const heading = vaultIsUnlocked() ? "Next step: add a patient." : "Next step: unlock the vault and add a patient.";
  return `
    <div class="empty-state next-step">
      <strong>${heading}</strong>
      <span>Use a de-identified room label to begin a new hospital stay.</span>
    </div>
  `;
}

function decorateNavigation() {
  document.querySelectorAll(".primary-nav [data-icon]").forEach((button) => {
    if (button.dataset.decorated) return;
    const label = button.textContent.trim();
    const note = (button.dataset.note || "").trim();
    const noteHtml = note ? `<small class="nav-note">${escapeHtml(note)}</small>` : "";
    button.innerHTML = `${icon(button.dataset.icon)}<span>${escapeHtml(label)}${noteHtml}</span>`;
    const accessible = note ? `${label} — ${note}` : label;
    button.setAttribute("aria-label", accessible);
    button.title = accessible;
    button.dataset.decorated = "true";
  });
}

function vaultIsUnlocked() {
  return Boolean(app.vault && app.passphrase);
}

function resetVaultInactivityTimer() {
  if (vaultInactivityTimer) clearTimeout(vaultInactivityTimer);
  if (!vaultIsUnlocked()) {
    vaultInactivityTimer = null;
    return;
  }
  vaultInactivityTimer = setTimeout(() => {
    if (vaultIsUnlocked()) lockVault("Vault locked after 15 minutes of inactivity.");
  }, VAULT_INACTIVITY_MS);
}

function recordVaultActivity() {
  if (vaultIsUnlocked()) resetVaultInactivityTimer();
}

function clearProtectedViewContent() {
  ["dailyContent", "reviewContent", "promptsContent", "quickDeidContent", "settingsContent"].forEach((id) => {
    const container = byId(id);
    if (container) container.replaceChildren();
  });
  byId("archiveConfirmDialog")?.close();
  byId("removeDayConfirmDialog")?.close();
}

function clearPatientScopedSession() {
  // These values are drafts/review state for the currently active patient.
  // They must never survive a patient switch: in particular, the OpenEvidence
  // paste panel can contain de-identified clinical text that has not yet been
  // explicitly saved to that patient's hospital day.
  app.selectedDayId = "";
  app.selectedStayPacketId = "admission";
  app.promptDayId = "";
  app.promptDayFollowsSelectedDay = true;
  app.promptDrafts = {}; app.selectedPromptTask = "presentation_quality_editor";
  app.presentationToEdit = ""; app.presentationToEditPacketId = ""; app.presentationToEditEdited = false;
  app.presentationSpecialty = "";
  app.sectionDrafts.clear();
  app.sectionEditingKeys.clear();
  app.pendingSectionReviewFocus = null;
  app.structuredNoteDrafts.clear(); app.structuredNoteComposers.clear(); app.noteDraftSessions.clear();
  Object.assign(app, { reviewPacketId: "admission", reviewSearchQuery: "", reviewCategory: "all", reviewPage: 0, reviewDifferenceSelectionId: "" });
  app.dailySourceKind = DEFAULT_DAILY_SOURCE_KIND;
  app.dailySourceDraft = "";
  app.dailySourceParse = null;
  app.dailyResultMetadata = { label: "", category: "imaging", date: "", context: "" };
  app.admissionSourceKind = DEFAULT_DAILY_SOURCE_KIND;
  app.admissionSourceDraft = "";
  app.admissionSourceParse = null;
  app.admissionResultMetadata = { label: "", category: "imaging", date: "", context: "" };
  clearPhiReviews();
  app.admissionDate = "";
}

function clearSensitiveSession() {
  // Chart-grounded RAG: drop the in-memory embedding vectors and the cached
  // per-patient chart indexes BEFORE protected state is discarded.
  // Fire-and-forget — lock must not wait on it.
  void clearAllRagIndexes().catch(() => {});
  if (vaultInactivityTimer) {
    clearTimeout(vaultInactivityTimer);
    vaultInactivityTimer = null;
  }
  if (app.demoSession) demoSessionController.exit({ renderAfter: false });
  app.vault = null;
  app.passphrase = "";
  app.demoPreviewMode = false;
  app.vaultUnlockError = "";
  clearPatientScopedSession();
  clearQuickDeidSession();
}

function render() {
  // Preserve scroll positions across re-renders. Buttons like
  // "De-identify & save" or "Save to draft" trigger full re-renders;
  // without this the view jumps back to the top.
  // Only restore if the view didn't change — a real navigation should
  // start at the top, not inherit the previous view's scroll position.
  // NOTE: the scroll container is not always .view.active itself. In the
  // review view the note editor (#noteEditor) is a nested scroller that
  // holds the real scroll offset, so capture every scrolled container
  // inside the active view, keyed by a stable selector, and restore them
  // all. Capturing only .view.active used to yank the exam picker back
  // to the top on every click.
  const activeView = document.querySelector(".view.active");
  const activeViewId = activeView?.id || "";
  const scrollerSelector = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node !== activeView && node !== document.body) {
      const parent = node.parentElement;
      const tag = node.tagName.toLowerCase();
      let nth = "";
      if (parent) {
        const siblings = Array.from(parent.children).filter((s) => s.tagName === node.tagName);
        if (siblings.length > 1) nth = `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(`${tag}${nth}`);
      node = parent;
    }
    return `#${CSS.escape(activeViewId)}${parts.length ? " > " + parts.join(" > ") : ""}`;
  };
  const scrollers = [];
  if (activeView) {
    // Read scrollTop first (cheap when layout is clean); only confirm
    // scrollability for elements that are actually scrolled.
    const candidates = [activeView, ...activeView.querySelectorAll("*")];
    for (const el of candidates) {
      const top = el.scrollTop || 0;
      const left = el.scrollLeft || 0;
      if (top > 0 || left > 0) {
        if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4) {
          scrollers.push({ selector: scrollerSelector(el), top, left });
        }
      }
    }
  }
  const restoreScroll = () => {
    const view = document.querySelector(".view.active");
    // Only restore if we're still on the same view that we captured from.
    if (!view || view.id !== activeViewId) return;
    let needsReassert = false;
    for (const { selector, top, left } of scrollers) {
      const target = document.querySelector(selector);
      if (!target) continue;
      target.scrollTop = top;
      target.scrollLeft = left;
      if (Math.abs(target.scrollTop - top) > 2 || Math.abs(target.scrollLeft - left) > 2) {
        needsReassert = true;
      }
    }
    // If layout hasn't settled yet (async content, fonts, images), the
    // synchronous restore may be clamped. Re-assert on the next frame.
    if (needsReassert) {
      requestAnimationFrame(() => {
        const v = document.querySelector(".view.active");
        if (!v || v.id !== activeViewId) return;
        for (const { selector, top, left } of scrollers) {
          const el = document.querySelector(selector);
          if (!el) continue;
          el.scrollTop = top;
          el.scrollLeft = left;
        }
      });
    }
  };

  const unlocked = vaultIsUnlocked();
  document.body.classList.toggle("vault-locked", !unlocked);
  if (!unlocked) {
    app.view = "vault";
    clearPhiReviews();
    clearQuickDeidSession();
    clearProtectedViewContent();
    for (const id of viewIds) {
      byId(`${id}View`)?.classList.toggle("active", id === "vault");
      document.querySelector(`[data-view-target="${id}"]`)?.classList.toggle("active", id === "vault");
    }
    renderVault();
    renderStatusBar();
    restoreScroll();
    return;
  }
  if (app.view !== "daily" && app.phiReviews.size) clearPhiReviews();
  if (app.view !== "quickDeid" && (app.quickDeid.input || app.quickDeid.review)) clearQuickDeidSession();
  for (const id of viewIds) {
    byId(`${id}View`)?.classList.toggle("active", app.view === id);
    document.querySelector(`[data-view-target="${id}"]`)?.classList.toggle("active", app.view === id);
  }
  // Each view-renderer runs independently: one throwing (e.g. on bad locally
  // cached data) must never prevent renderStatusBar() below from running -
  // that's what reflects patient selection, so a single broken view previously
  // made the whole app look like patient selection had stopped working.
  for (const renderView of [renderVault, renderDaily, renderReview, renderCheatSheets, renderPrompts, renderQuickDeid, renderSampleNotes, renderAiChat, renderDrugLookup, renderDrugChecks, renderScores, renderScribePro, renderSettings]) {
    try {
      renderView();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Unable to render this view.");
    }
  }
  demoController.render();
  renderStatusBar();
  restoreScroll();
  if (app.view === "daily" && app.pendingSectionReviewFocus) requestAnimationFrame(focusPendingSectionReview);
}

function renderStatusBar() {
  const patient = active();
  const record = readEncryptedVaultRecord();
  byId("currentPageTitle").textContent = viewTitles[app.view] || "Preround";
  byId("vaultStateLabel").textContent = vaultIsUnlocked() ? "Vault unlocked" : record ? "Vault locked" : "No vault on this device";
  const deidStatus = selectedDeidStatus();
  byId("deidStateLabel").textContent = `Redaction model: ${deidModelLabel(app.deidMode)} — ${deidStatus.ready ? "ready" : "not loaded"}`;
  byId("statusLine").textContent =
    app.status || "All data is encrypted and stays on this device. Nothing leaves without your explicit action.";
  const switcher = byId("patientSwitcher");
  if (!switcher) return;
  const patients = visiblePatients(app.vault);
  switcher.disabled = !app.vault || !patients.length;
  const switcherLabels = disambiguatedPatientLabels(patients);
  switcher.innerHTML = patients.length
    ? patients
        .map(
          (entry) =>
            `<option value="${escapeHtml(entry.id)}" ${entry.id === patient?.id ? "selected" : ""}>${escapeHtml(switcherLabels.get(entry.id) || entry.displayLabel)}</option>`
        )
        .join("")
    : `<option>No patient selected</option>`;
}

function renderVault() {
  const record = readEncryptedVaultRecord();
  replaceViewContent(byId("vaultContent"), vaultPresentation.renderVault({
    record,
    unlocked: vaultIsUnlocked(),
    vault: app.vault,
    patients: visiblePatients(app.vault),
    vaultUnlockError: app.vaultUnlockError
  }));
}

function renderDeidStrip() {
  const readiness = selectedDeidReadiness();
  const option = selectedDeidOption();
  const progress = option ? app.modelPackProgress[option.key] : null;
  return `
    <div class="deid-strip deid-strip-compact">
      <div class="button-row">
        <select id="deidModeSelect" aria-label="De-identification mode">
          ${deidModelSelectOptions()}
        </select>
        ${renderDeidLoadButton()}
      </div>
      <span class="muted deid-inline-status" data-deid-selected-state>Selected: ${escapeHtml(deidModelLabel(app.deidMode))} | ${escapeHtml(selectedDeidStateText())}</span>
      <label class="deid-admission-date-inline">Admission date
        <input type="date" id="dailyAdmissionDateInput" value="${escapeHtml(app.admissionDate || "")}">
      </label>
      ${renderDeidOperation()}
      ${progress ? `<div class="deid-download-progress" aria-live="polite"><progress data-shared-model-progress value="${Math.max(0, progress.completedBytes)}" max="${Math.max(1, progress.totalBytes)}"></progress><span data-shared-model-progress-text>${escapeHtml(modelPackProgressText(option))}</span></div>` : ""}
      ${readiness.ready ? "" : `<span class="deid-readiness-note">${escapeHtml(readiness.message)}</span>`}
    </div>
  `;
}

function sectionReviewFor(scope, sectionId) {
  return app.phiReviews.get(reviewKey(scope, sectionId)) || null;
}

function sectionDraftText(scope, sectionId, fallback = "") {
  const key = reviewKey(scope, sectionId);
  return app.sectionDrafts.has(key) ? String(app.sectionDrafts.get(key) || "") : String(fallback || "");
}

function setSectionDraftText(scope, sectionId, value) {
  app.sectionDrafts.set(reviewKey(scope, sectionId), String(value || ""));
}

function sectionListId(scope) {
  return scope === "daily" ? "dailySources" : "contextSections";
}

function isSectionTextEditing(scope, sectionId) {
  return app.sectionEditingKeys.has(reviewKey(scope, sectionId));
}

function reviewSectionsForScope(scope) {
  const patient = active();
  if (!patient) return [];
  return scope === "daily" ? selectedDay(patient)?.sourceCaptures || [] : patient.contextSections || [];
}

function pendingSectionReviewTargets(scope) {
  return pendingReviewTargets(
    reviewSectionsForScope(scope).map((section) => ({
      scope,
      sectionId: section.id,
      review: sectionReviewFor(scope, section.id)
    }))
  );
}

function activateSectionReviewTarget(scope, target, { queueFocus = false } = {}) {
  if (!target?.sectionId || !Number.isInteger(target.redactionIndex) || target.redactionIndex < -1) return null;
  const review = sectionReviewFor(scope, target.sectionId);
  if (!review || (target.redactionIndex >= 0 && !review.redactions?.[target.redactionIndex])) return null;
  review.inspectedRedactionIndex = target.redactionIndex;
  app.sectionEditingKeys.delete(reviewKey(scope, target.sectionId));
  const activeTarget = { ...target, scope };
  if (queueFocus) app.pendingSectionReviewFocus = activeTarget;
  return activeTarget;
}

function beginSectionReview(scope) {
  const target = nextPendingReviewTarget(pendingSectionReviewTargets(scope));
  return activateSectionReviewTarget(scope, target, { queueFocus: true });
}

function clearPhiReviews(scope = "") {
  if (!scope) {
    app.phiReviews.clear();
    app.sectionDrafts.clear();
    app.sectionEditingKeys.clear();
    app.pendingSectionReviewFocus = null;
    return;
  }
  for (const key of app.phiReviews.keys()) {
    if (key.startsWith(`${scope}:`)) app.phiReviews.delete(key);
  }
  for (const key of app.sectionDrafts.keys()) {
    if (key.startsWith(`${scope}:`)) app.sectionDrafts.delete(key);
  }
  for (const key of [...app.sectionEditingKeys]) {
    if (key.startsWith(`${scope}:`)) app.sectionEditingKeys.delete(key);
  }
  if (app.pendingSectionReviewFocus?.scope === scope) app.pendingSectionReviewFocus = null;
}

function clearQuickDeidSession() {
  app.quickDeid = { input: "", output: "", warnings: [], status: "", review: null, admissionDate: "", verifyWithLlm: Boolean(app.quickDeid.verifyWithLlm) };
}

// The same annotated document is used by Quick De-ID and Hospital Stay. It is
// deliberately a read-only review field: it shows the active-tab original
// crossed out beside the safe replacement, while the canonical copy/save text
// remains the de-identified string in state.
function renderRedactionDocument(
  text,
  review,
  { id = "", scope = "", sectionId = "", action = "inspect-redaction", label = "De-identified text review" } = {}
) {
  synchronizeReviewPlaceholders(review, text);
  return redactionPresentation.renderRedactionDocument(text, review, { id, scope, sectionId, action, label });
}

function renderSectionSurface(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  const editing = review && isSectionTextEditing(scope, section.id);
  const draftText = sectionDraftText(scope, section.id, section.deidentifiedText);
  synchronizeReviewPlaceholders(review, draftText);
  return redactionPresentation.renderSectionSurface({
    section,
    scope,
    review,
    editing,
    draftText,
    sections: reviewSectionsForScope(scope),
    reviewFor: (id) => sectionReviewFor(scope, id)
  });
}

function renderSectionEditor(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  const editing = isSectionTextEditing(scope, section.id);
  const draftText = sectionDraftText(scope, section.id, section.deidentifiedText);
  synchronizeReviewPlaceholders(review, draftText);
  if (scope === "context")
    return redactionPresentation.renderSourceCaptureEditor({
      capture: section,
      scope,
      sourceOptions: admissionSourceKindOptions(),
      editing,
      pendingFocus: app.pendingSectionReviewFocus,
      review,
      draftText,
      structuredDisplay: "",
      parseWarning: clinicalParseWarning(section.sourceKind, draftText),
      captures: reviewSectionsForScope(scope),
      reviewFor: (id) => sectionReviewFor(scope, id)
    });
  return redactionPresentation.renderSectionEditor({
    section,
    scope,
    roleOptions: packetRoleOptions(scope),
    editing,
    pendingFocus: app.pendingSectionReviewFocus,
    review,
    draftText,
    sections: reviewSectionsForScope(scope),
    reviewFor: (id) => sectionReviewFor(scope, id)
  });
}

function renderWarnings(sections, scope) {
  return redactionPresentation.renderWarnings({ sections, scope, reviewFor: sectionReviewFor });
}
function renderDaily() {
  preserveViewScroll(byId("dailyContent"), () => dailySourceController.renderDaily());
  bindSectionReordering();
}

function renderReview() { preserveViewScroll(byId("reviewContent"), () => reviewController.render()); }

function selectedDay(patient) {
  const days = sortDays(patient?.days || []);
  return days.find((day) => day.id === app.selectedDayId) || days.at(-1) || null;
}

function renderPrompts() {
  const patient = active();
  if (!patient) {
    replaceViewContent(byId("promptsContent"), patientRequiredMessage());
    return;
  }
  const tasks = [...availableOpenEvidenceTasks(app.guidelineSets), ...guidelinePromptTasks(app.guidelineSets)]; const task = tasks.find((entry) => entry.id === app.selectedPromptTask) || tasks[0];
  if (!task) { replaceViewContent(byId("promptsContent"), "Built-in prompts are unavailable. Reload to retry.", { text: true }); return; }
  app.selectedPromptTask = task.id;
  const promptDays = sortDays(patient.days || []);
  // Follow the selected day until manually overridden here, so a
  // note saved on a newly-added day doesn't look lost behind a stale pick.
  if (app.promptDayFollowsSelectedDay && app.promptDayId !== app.selectedDayId) app.promptDayId = app.selectedDayId;
  const isAdmissionSelected = app.promptDayId === ADMISSION_PSEUDO_DAY_ID;
  if (!isAdmissionSelected) {
    const selectedPromptDay =
      promptDays.find((day) => day.id === app.promptDayId) ||
      promptDays.find((day) => day.id === app.selectedDayId) ||
      promptDays.at(-1) ||
      null;
    app.promptDayId = selectedPromptDay ? selectedPromptDay.id : ADMISSION_PSEUDO_DAY_ID;
  }
  const studentNote = studentNoteForPrompt(patient, app.promptDayId);
  if (["presentation_quality_editor", "attending_presentation_critique"].includes(task.id) && (app.presentationToEditPacketId !== studentNote.packetId || !app.presentationToEditEdited)) { app.presentationToEdit = studentNote.text; app.presentationToEditPacketId = studentNote.packetId; app.presentationToEditEdited = false; }
  const template = app.promptDrafts[task.id] ?? promptTemplateForTask(task.id, app.promptTemplates, app.guidelineSets);
  let promptError = "";
  let previewSegments = [{ type: "text", value: "" }];
  try {
    const variableMap = buildPromptVariableMap({
      patient,
      selectedDayId: app.promptDayId,
      guidelineSets: app.guidelineSets,
      teamPreferences: app.vault.preferences,
      presentationToEdit: app.presentationToEdit,
      presentationSpecialty: app.presentationSpecialty
    });
    previewSegments = buildPromptPreviewSegments(template, variableMap, { ensurePersona: true, taskId: task.id });
  } catch (error) {
    promptError = error instanceof Error ? error.message : "Unable to build prompt.";
  }
  const variables = promptVariablesForPatient(patient, { selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets });
  const templateHighlightSegments = buildPromptPreviewSegments(
    template,
    Object.fromEntries(variables.map((entry) => [entry.token, entry.token]))
  );
  replaceViewContent(byId("promptsContent"), promptsPresentation.renderPrompts({
    patient,
    patientRequiredMessage: patientRequiredMessage(),
    task,
    tasks,
    promptDays,
    selectedPromptDayId: app.promptDayId,
    template,
    previewSegments,
    templateHighlightSegments,
    promptError,
    presentationToEdit: app.presentationToEdit, presentationAutoPopulated: Boolean(studentNote.text) && !app.presentationToEditEdited,
    presentationSpecialty: app.presentationSpecialty,
    requiresPresentationToEdit: task.id === "presentation_quality_editor" || task.id === "attending_presentation_critique",
    requiresPresentationSpecialty: task.id === "attending_presentation_critique",
    variables,
    smartMenuOpen: app.smartMenuOpen,
    colorOverrides: app.tokenColorOverrides
  }));
  const templateEditor = byId("promptPreview");
  const templateBackdrop = byId("promptTemplateHighlight");
  if (templateEditor && templateBackdrop) {
    templateEditor.addEventListener("scroll", () => {
      templateBackdrop.scrollTop = templateEditor.scrollTop;
      templateBackdrop.scrollLeft = templateEditor.scrollLeft;
    });
  }
}

function currentPreferences() {
  return normalizeUserPreferences(app.vault?.preferences);
}

function renderSettings() {
  const container = byId("settingsContent");
  if (!container || !vaultIsUnlocked()) return;
  const preferences = currentPreferences();
  replaceViewContent(container, settingsPresentation.renderSettings({
    preferences,
    apiKeySaved: Boolean(preferences.openAiApiKey),
    guidelineSets: app.guidelineSets,
    guidelineSearchQuery: app.guidelineSearchQuery,
    guidelinePage: app.guidelinePage,
    guidelineSelectedIds: app.guidelineSelectedIds,
    guidelineOpenId: app.guidelineOpenId,
    guidelineCreateDraft: app.guidelineCreateDraft,
    OPENAI_WORKUP_MODEL_OPTIONS,
    colorOverrides: app.tokenColorOverrides,
    localAiGuidelines: readLocalLlmSettings().systemGuidelines || DEFAULT_SYSTEM_GUIDELINES,
    offlineMode: isOfflineMode()
  }));
}

function setVaultPreferences(nextPreferences) {
  app.vault = {
    ...app.vault,
    preferences: normalizeUserPreferences(nextPreferences),
    updatedAt: new Date().toISOString()
  };
}

async function saveOpenAiByok() {
  const preferences = currentPreferences();
  const replacementKey = String(byId("openAiApiKeyInput")?.value || "").trim();
  const apiKey = replacementKey || preferences.openAiApiKey;
  if (!apiKey) throw new Error("Enter an OpenAI API key before saving.");
  setVaultPreferences({
    ...preferences,
    openAiApiKey: apiKey,
    openAiModel: byId("openAiModelInput")?.value
  });
  await persistVault("OpenAI key saved inside the encrypted local vault.");
  render();
}

async function clearOpenAiByok() {
  const preferences = currentPreferences();
  setVaultPreferences({ ...preferences, openAiApiKey: "" });
  await persistVault("Saved OpenAI key removed from the encrypted local vault.");
  render();
}

// App-wide offline mode: one boolean in localStorage that the network gate
// enforces on every remote request. The AI Chat controller subscribes to the
// same event and degrades ChatGPT chat to the on-device model; here we just
// reflect the toggle in the header pill and re-render the Settings panel.
function toggleOfflineMode() {
  const next = !isOfflineMode();
  setOfflineMode(next);
  renderOfflineModePill();
  renderSettings();
  setStatus(next
    ? "Offline mode is on. OpenAI calls, ChatGPT chat, and model downloads are blocked; everything on-device keeps working."
    : "Offline mode is off. Cloud features are available again.");
}

function renderOfflineModePill() {
  const pill = byId("offlineModePill");
  if (!pill) return;
  const offline = isOfflineMode();
  pill.textContent = offline ? "Offline mode" : "Online";
  pill.classList.toggle("is-offline", offline);
  pill.title = offline
    ? "Offline mode is on — no network requests will be sent. Change it in Settings."
    : "Online — cloud features are available. Change it in Settings.";
}

function saveLocalAiGuidelines() {
  const value = String(byId("localAiGuidelinesInput")?.value ?? "");
  writeLocalLlmSettings({ systemGuidelines: value });
  render();
}

function resetLocalAiGuidelines() {
  writeLocalLlmSettings({ systemGuidelines: "" });
  render();
}

function refreshPromptPreview() {
  const patient = active();
  const highlighted = byId("promptOutputHighlighted");
  if (!patient || !highlighted) return;
  const template = app.promptDrafts[app.selectedPromptTask] ?? promptTemplateForTask(app.selectedPromptTask, app.promptTemplates, app.guidelineSets);
  try {
    const variableMap = buildPromptVariableMap({
      patient,
      selectedDayId: app.promptDayId,
      guidelineSets: app.guidelineSets,
      teamPreferences: app.vault.preferences,
      presentationToEdit: app.presentationToEdit,
      presentationSpecialty: app.presentationSpecialty
    });
    highlighted.innerHTML = renderHighlightedSegments(
      buildPromptPreviewSegments(template, variableMap, { ensurePersona: true, taskId: app.selectedPromptTask }),
      escapeHtml,
      app.tokenColorOverrides
    );
    const templateBackdrop = byId("promptTemplateHighlight");
    if (templateBackdrop) {
      const variables = promptVariablesForPatient(patient, { selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets });
      const identityMap = Object.fromEntries(variables.map((entry) => [entry.token, entry.token]));
      const templateSegments = buildPromptPreviewSegments(template, identityMap);
      templateBackdrop.innerHTML = renderHighlightedSegments(templateSegments, escapeHtml, app.tokenColorOverrides, { interactive: false });
    }
  } catch (error) {
    highlighted.textContent = error instanceof Error ? error.message : "Unable to build prompt.";
  }
}

function currentPromptText() {
  const patient = active();
  if (!patient) return "";
  // Read the editor first so the clipboard always reflects its current text,
  // including an edit made immediately before Copy is clicked. The output
  // preview uses these same resolved segments.
  const template = byId("promptPreview")?.value
    ?? app.promptDrafts[app.selectedPromptTask]
    ?? promptTemplateForTask(app.selectedPromptTask, app.promptTemplates, app.guidelineSets);
  try {
    const variableMap = buildPromptVariableMap({
      patient,
      selectedDayId: app.promptDayId,
      guidelineSets: app.guidelineSets,
      teamPreferences: app.vault.preferences,
      presentationToEdit: app.presentationToEdit,
      presentationSpecialty: app.presentationSpecialty
    });
    return buildPromptPreviewSegments(template, variableMap, { ensurePersona: true, taskId: app.selectedPromptTask })
      .map((segment) => segment.value)
      .join("");
  } catch {
    return "";
  }
}

function renderQuickDeidReview() {
  const review = app.quickDeid.review;
  const warnings = review?.warnings || app.quickDeid.warnings || [];
  const activeWarnings = warnings
    .map((warning, index) => ({ warning, index }))
    .filter(({ index }) => !review?.dismissedWarningIndexes?.has(index));
  if (!review) return quickDeidPresentation.renderQuickDeidReview({ review: null, activeWarnings, pendingRedactions: [] });
  const pendingRedactions = review.redactions.filter((redaction) => redaction.state === "pending");
  const activeRedactionIndex = quickSelectedRedactionIndex(review);
  const activeRedaction = review.redactions[activeRedactionIndex] || null;
  const activeRedactionIsConfirmed = activeRedaction?.state === "confirmed";
  const activeWarningIndex = quickWarningIndex(review, activeWarnings);
  const activeWarning = activeWarnings.find(({ index }) => index === activeWarningIndex)?.warning || null;
  const queueStatus = activeRedactionIsConfirmed
    ? "Accepted redaction"
    : activeRedaction
      ? `Redaction ${review.redactions.filter((redaction) => redaction.state !== "restored").findIndex((redaction) => redaction === activeRedaction) + 1} of ${review.redactions.filter((redaction) => redaction.state !== "restored").length}`
      : activeWarning
        ? `Flag ${activeWarnings.findIndex(({ index }) => index === activeWarningIndex) + 1} of ${activeWarnings.length}`
        : "Review complete";
  return quickDeidPresentation.renderQuickDeidReview({
    review,
    activeWarnings,
    pendingRedactions,
    activeRedactionIndex,
    activeRedaction,
    activeRedactionIsConfirmed,
    activeWarningIndex,
    activeWarning,
    queueStatus,
    renderRedactionDocumentHtml: renderRedactionDocument(app.quickDeid.output, review, {
      id: "quickDeidReviewDocument",
      action: "inspect-quick-redaction",
      label: "Annotated de-identified text"
    }),
    warningDescriptionText: activeWarning ? warningDescription(activeWarning) : ""
  });
}

function renderQuickModelControl() {
  const option = selectedDeidOption();
  const state = option ? modelPackStateFor(option) : null;
  const busy = Boolean(option && app.modelPackBusyKey === option.key);
  const progress = option ? app.modelPackProgress[option.key] : null;
  const error = option ? app.modelPackErrors[option.key] : "";
  return quickDeidPresentation.renderQuickModelControl({
    option,
    state,
    busy,
    progress,
    error,
    webGpuAvailable: app.webGpuAvailable,
    isInstallable: Boolean(option && isInstallableModel(option)),
    modelPackBusyKey: app.modelPackBusyKey,
    deidModelSelectOptionsHtml: deidModelSelectOptions(),
    quickDeidStatus: app.quickDeid.status,
    modelPackProgressText: option ? modelPackProgressText(option) : ""
  });
}

function renderQuickDeid() {
  const hasReview = Boolean(app.quickDeid.review);
  const verifierModel = selectedLlmVerifierModel();
  replaceViewContent(byId("quickDeidContent"), quickDeidPresentation.renderQuickDeid({
    hasReview,
    disabled: Boolean(app.modelPackBusyKey || app.quickDeidBusy),
    busy: app.quickDeidBusy,
    admissionDate: app.quickDeid.admissionDate,
    quickDeidInput: app.quickDeid.input,
    verifyWithLlm: Boolean(app.quickDeid.verifyWithLlm),
    verifierModelLabel: verifierModel?.label || "",
    verifierAvailable: Boolean(verifierModel),
    renderQuickModelControlHtml: renderQuickModelControl(),
    renderQuickDeidReviewHtml: hasReview ? renderQuickDeidReview() : ""
  }));
  scheduleQuickReviewFocus();
}

function renderScores() {
  scoresController.render();
}

function renderCheatSheets() {
  cheatSheetsController.render();
}

function renderSampleNotes() {
  sampleNotesController.render();
}

function renderAiChat() {
  aiChatController.render();
}

// Scribe Pro (src/scribe-parakeet/) is a first-class in-app view. Its DOM lives
// in index.html (#scribeProView); the module wires itself up on first import,
// so it loads lazily the first time the view is shown. Like the other
// workspace views it requires the vault to be unlocked.
let scribeProBoot = null;
function ensureScribePro() {
  if (!scribeProBoot) {
    scribeProBoot = import("../scribe-parakeet/app.js").catch((error) => {
      scribeProBoot = null;
      throw error;
    });
  }
  return scribeProBoot;
}

function renderScribePro() {
  if (app.view === "scribePro") {
    ensureScribePro().catch((error) => {
      console.error(error);
      setStatus(`Scribe Pro failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }
}

function renderDrugLookup() {
  drugLookupController.ensureAutoLoaded();
  replaceViewContent(byId("drugLookupContent"), drugLookupController.renderView());
}
function renderDrugChecks() {
  replaceViewContent(byId("drugChecksContent"), drugChecksPresentation.renderDrugChecks({ state: app.drugChecks }));
}

function collectSectionRows(containerId) {
  return [...document.querySelectorAll(`#${containerId} .section-editor`)].map((row) => ({
    id: row.dataset.sectionId,
    createdAt: row.dataset.createdAt,
    label: row.querySelector("[data-saved-result-label]")?.value || row.querySelector(".section-label")?.value || "",
    role: row.querySelector(".section-role")?.value || "",
    sourceKind: row.querySelector(".source-kind")?.value || "other_chart_text",
    resultCategory: row.querySelector("[data-saved-result-category]")?.value || "",
    resultDate: row.querySelector("[data-saved-result-date]")?.value || "",
    resultContext: row.querySelector("[data-saved-result-context]")?.value || "",
    text: row.querySelector(".section-text")?.value || ""
  }));
}

function updateDeidStatus(status) {
  app.deidStatus = { ...getSelectedDeidModelStatus(status?.modelKey || app.deidMode), ...status };
  renderStatusBar();
  const statusLine = document.querySelector("[data-deid-selected-state]");
  if (statusLine) statusLine.textContent = `Selected: ${deidModelLabel(app.deidMode)} | ${selectedDeidStateText()}`;
}

function refreshDeidControlsInActiveView() {
  if (app.view === "daily") {
    const strip = document.querySelector("#dailyContent .deid-strip");
    if (strip) strip.outerHTML = renderDeidStrip();
    const busy = app.deidOperation.active;
    const saveContextButton = document.querySelector('[data-action="save-context"]');
    if (saveContextButton) {
      saveContextButton.disabled = busy;
      saveContextButton.textContent = busy ? "De-identifying…" : "Save admission sources";
    }
    const saveDayButton = document.querySelector('[data-action="save-day"]');
    if (saveDayButton) {
      saveDayButton.disabled = busy || !selectedDay(active())?.sourceCaptures?.length;
      saveDayButton.textContent = busy ? "De-identifying…" : "Save source edits";
    }
    const addSourceButton = document.querySelector('[data-action="add-daily-source"]');
    if (addSourceButton) {
      addSourceButton.disabled = busy || !app.dailySourceDraft.trim();
      addSourceButton.textContent = busy ? "De-identifying…" : "De-identify and add source";
    }
    const addAdmissionSourceButton = document.querySelector('[data-action="add-admission-source"]');
    if (addAdmissionSourceButton) {
      addAdmissionSourceButton.disabled = busy || !app.admissionSourceDraft.trim();
      addAdmissionSourceButton.textContent = busy ? "De-identifying…" : "De-identify and add source";
    }
  }
  if (app.view === "quickDeid") renderQuickDeid();
  renderStatusBar();
}

async function handleClick(event) {
  if (event.target.id === "promptPreview") {
    const token = promptVariableTokenAtCaret(event.target.value, event.target.selectionStart);
    if (token) requestAnimationFrame(() => scrollPromptOutputToVariable(byId("promptOutputHighlighted"), token));
    return;
  }
  // The review controller handles pull-from-primary buttons, which carry
  // data-pull-section but no data-action. Check before the data-action
  // early return below, otherwise these clicks are silently dropped.
  if (app.view === "review" && reviewController.click(event.target)) return;
  if (app.view === "aiChat" && aiChatController.click(event.target)) {
    const demoActionTarget = event.target.closest("[data-action]");
    if (demoActionTarget) demoController.observeAction(demoActionTarget.dataset.action);
    return;
  }
  if (app.view === "drugLookup" && drugLookupController.click(event.target)) return;
  if (app.view === "drugChecks" && drugChecksController.click(event.target)) return;
  if (app.view === "scores" && scoresController.click(event.target)) return;
  if (app.view === "cheatSheets" && cheatSheetsController.click(event.target)) {
    const opened = event.target.closest?.("[data-cheat-sheets-open]");
    if (opened) demoController.observeSheetOpened(opened.getAttribute("data-cheat-sheets-open"));
    return;
  }
  if (app.view === "sampleNotes" && sampleNotesController.click(event.target)) return;
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  actionFeedback(target, action);
  try {
    if (
      !vaultIsUnlocked() &&
      !["unlock-vault", "toggle-vault-passphrase", "restore-vault", "request-delete-vault", "confirm-delete-vault", "start-guided-demo"].includes(action)
    ) {
      throw new Error("Unlock the local vault before using workspace tools.");
    }
    if (action === "unlock-vault") await unlockVault();
    if (action === "start-guided-demo" || action === "restart-guided-demo") {
      if (!vaultIsUnlocked() && !app.demoSession) {
        app.demoPreviewMode = true;
        app.vault = createEmptyVaultState();
        app.passphrase = "demo-preview-session";
      }
      demoSessionController.start();
    }
    if (action === "exit-guided-demo") {
      if (app.demoPreviewMode) {
        demoSessionController.exit({ renderAfter: false });
        app.demoPreviewMode = false;
        app.vault = null;
        app.passphrase = "";
        setStatus("Guided demo closed. No vault was created — nothing was saved.");
        render();
      } else {
        demoSessionController.exit();
      }
    }
    if (action === "toggle-vault-passphrase") toggleVaultPassphraseVisibility();
    if (action === "lock-vault") lockVault();
    if (action === "request-delete-vault") requestVaultDeletion();
    if (action === "confirm-delete-vault") deleteVaultAndStartOver();
    if (action === "admit-patient") await admitPatient();
    if (action === "select-patient") selectPatient(target.dataset.patientId);
    if (action === "archive-patient") requestArchivePatient(target.dataset.patientId);
    if (action === "confirm-archive-patient") await archiveSelectedPatient(app.pendingArchivePatientId);
    if (action === "remove-day") requestRemoveDay(app.selectedDayId);
    if (action === "confirm-remove-day") await removeSelectedDay(app.pendingRemoveDayId);
    if (action === "export-vault") exportVault();
    if (action === "restore-vault") byId("restoreVaultInput").click();
    if (action === "toggle-section-editor") {
      const editor = target.closest(".section-editor");
      if (editor) {
        const isExpanded = editor.classList.toggle("is-expanded");
        target.setAttribute("aria-expanded", String(isExpanded));
        target.setAttribute("title", isExpanded ? "Collapse section" : "Edit section");
        target.setAttribute("aria-label", isExpanded ? "Collapse section" : "Edit section");
        if (isExpanded)
          requestAnimationFrame(() =>
            (editor.querySelector("[data-redaction-document]") || editor.querySelector(".section-text"))?.focus({ preventScroll: true })
          );
      }
    }
    if (action === "clinical-lab-page") navigateClinicalLabCollections(target);
    if (action === "clinical-medication-page") updateClinicalMedicationPage(target.closest('[data-clinical-view="medications"]'), { direction: Number(target.dataset.direction || 0) });
    if (action === "select-daily-source-kind") {
      dailySourceController.selectSourceKind("daily", target.dataset.sourceKind || DEFAULT_DAILY_SOURCE_KIND);
      // Surgical: selectSourceKind already updates the data model, toggles
      // button states, and refreshes the preview panel. No full re-render
      // needed — renderDaily() would destroy scroll position.
    }
    if (action === "select-admission-source-kind") {
      dailySourceController.selectSourceKind("admission", target.dataset.sourceKind || DEFAULT_DAILY_SOURCE_KIND);
      // Surgical: see above.
    }
    if (dailySourceController.handleStructuredNoteAction(target)) {
      demoController.observeAction(action);
      return;
    }
    if (action === "move-section-up")
      await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "up"));
    if (action === "move-section-down")
      await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "down"));
    if (action === "remove-section")
      await mutateSections(target.dataset.scope, (sections) => removeSection(sections, target.dataset.sectionId));
    if (action === "review-section-warning") reviewSectionWarning(target.dataset);
    if (action === "redact-section-warning")
      redactSectionWarning(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.warningIndex));
    if (action === "dismiss-section-warning")
      await dismissSectionWarning(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.warningIndex));
    if (action === "dismiss-all-section-warnings") await dismissAllSectionWarnings(target.dataset.scope, target.dataset.sectionId);
    if (action === "manual-redact-selection") redactSelectedSectionText(target.dataset.scope, target.dataset.sectionId);
    if (action === "edit-section-text") editSectionText(target.dataset.scope, target.dataset.sectionId);
    if (action === "resume-section-review") await resumeSectionReview(target.dataset.scope, target.dataset.sectionId);
    if (action === "inspect-redaction")
      inspectRedaction(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.redactionIndex));
    if (action === "keep-reviewed-redaction") keepReviewedRedaction(target.dataset.scope, target.dataset.sectionId);
    if (action === "confirm-all-section-redactions") confirmAllSectionRedactions(target.dataset.scope, target.dataset.sectionId);
    if (action === "continue-section-review") advanceSectionReview(target.dataset.scope, target.dataset.sectionId, -1);
    if (action === "reject-all-section-redactions") rejectAllSectionRedactions(target.dataset.scope, target.dataset.sectionId);
    if (action === "allow-reviewed-non-phi")
      allowReviewedNonPhi(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.redactionIndex));
    if (action === "save-context") await saveContext();
    if (action === "save-structured-primary-note") await dailySourceController.saveStructuredPrimaryNote(target.dataset.noteScope || "daily");
    if (action === "save-structured-note-to-draft") await dailySourceController.saveStructuredNoteToDraft(target.dataset.noteScope || "daily");
    if (action === "add-day") await addDay();
    if (action === "add-daily-source") await dailySourceController.addSource();
    if (action === "add-daily-source-raw") await dailySourceController.addSource({ deidentify: false });
    if (action === "add-admission-source") await dailySourceController.addAdmissionSource();
    if (action === "add-admission-source-raw") await dailySourceController.addAdmissionSource({ deidentify: false });
    if (action === "select-day" || action === "select-admission")
      dailySourceController.selectPacket(action === "select-admission" ? "admission" : target.dataset.dayId);
    if (action === "save-day") await dailySourceController.saveSources();
    if (action === "open-progress-note") reviewController.open(app.selectedDayId);
    if (action === "open-admission-note") reviewController.open("admission");
    if (action === "load-advanced-deid") await loadAdvancedModel();
    if (action === "select-deid-model") selectDeidModel(target.dataset.modelKey);
    if (action === "download-model-pack") await downloadSelectedModelPack(target.dataset.modelKey);
    if (action === "import-model-pack") await chooseModelPack(target.dataset.modelKey);
    if (action === "verify-model-pack") await verifyInstalledModelPack(target.dataset.modelKey);
    if (action === "cancel-model-download") cancelModelPackDownload(target.dataset.modelKey);
    if (action === "remove-model-pack") await removeSelectedModelPack(target.dataset.modelKey);
    if (action === "save-prompt-template") savePromptTemplate();
    if (action === "reset-prompt-template") resetPromptTemplate();
    if (action === "create-prompt-task") promptTaskController.createTaskFromInput();
    if (action === "request-remove-prompt-task") promptTaskController.requestRemove(target.dataset.taskId);
    if (action === "confirm-remove-prompt-task") promptTaskController.confirmRemovePending();
    if (action.includes("guideline")) await guidelineSetsController.handleAction(action, target);
    if (action === "insert-prompt-variable") insertPromptVariable(target.dataset.token);
    if (action === "jump-to-prompt-variable") {
      event.preventDefault();
      scrollPromptOutputToVariable(byId("promptOutputHighlighted"), target.dataset.token);
    }
    if (action === "copy-prompt") {
      await clipboard.copyText(currentPromptText());
    }
    if (action === "open-open-evidence") window.open(target.dataset.destination === "doximity" ? "https://www.doximity.com/" : "https://www.openevidence.com/", "_blank", "noopener,noreferrer");
    if (action === "reset-variable-colors") {
      app.tokenColorOverrides = {};
      saveTokenColorOverrides(app.tokenColorOverrides);
      renderPrompts();
    }
    if (action === "open-token-color-picker") tokenColorPicker.open(target.dataset.token, target, event);
    if (action === "save-openai-byok") await saveOpenAiByok();
    if (action === "clear-openai-byok") await clearOpenAiByok();
    if (action === "toggle-offline-mode") toggleOfflineMode();
    if (action === "save-local-ai-guidelines") saveLocalAiGuidelines();
    if (action === "reset-local-ai-guidelines") resetLocalAiGuidelines();
    if (action === "run-quick-deid") await runQuickDeid();
    if (action === "start-new-quick-deid") {
      clearQuickDeidSession();
      renderQuickDeid();
    }
    if (action === "copy-quick-deid-output") await clipboard.copyText(app.quickDeid.output || byId("quickDeidOutput")?.value || "");
    if (action === "review-quick-warning") reviewQuickWarning(Number(target.dataset.warningIndex));
    if (action === "inspect-quick-redaction") inspectQuickRedaction(Number(target.dataset.redactionIndex));
    if (action === "confirm-quick-redaction") confirmQuickRedaction();
    if (action === "confirm-all-quick-redactions") confirmAllQuickRedactions();
    if (action === "reject-all-quick-redactions") rejectAllQuickRedactions();
    if (action === "restore-quick-non-phi") restoreQuickNonPhi(Number(target.dataset.redactionIndex));
    if (action === "manual-redact-quick-selection") redactSelectedQuickText();
    if (action === "redact-quick-warning") redactQuickWarning(Number(target.dataset.warningIndex));
    if (action === "dismiss-quick-warning") dismissQuickWarning(Number(target.dataset.warningIndex));
    demoController.observeAction(action);
  } catch (error) {
    setStatus(
      app.demoSession && action === "copy-prompt"
        ? "Prompt ready. Clipboard access may be blocked in this preview; the de-identified prompt remains visible."
        : error instanceof Error
          ? error.message
          : "Something went wrong. Try again."
    );
    render();
  }
}

async function unlockVault() {
  const passphrase = byId("vaultPassphrase").value;
  if (!passphrase) {
    showVaultUnlockError("Enter the vault passphrase to continue.");
    return;
  }
  const isCreatingVault = !readEncryptedVaultRecord();
  if (isCreatingVault && passphrase.length < 12) {
    showVaultUnlockError("Use a passphrase with at least 12 characters to create this vault.");
    return;
  }
  let vault;
  try {
    vault = await loadOrCreateVault(passphrase);
  } catch {
    if (isCreatingVault) {
      showVaultUnlockError("Could not create this vault. Try a different passphrase.");
    } else {
      showVaultUnlockError("Could not unlock this vault. Check the passphrase and try again.");
    }
    return;
  }
  // Decryption succeeded, so the vault is unlocked as of here. The guideline
  // refresh and admission-date restore below are best-effort setup, not part
  // of authenticating the passphrase - if either throws (e.g. a transient
  // fetch of a guideline seed file), it must never be reported as "wrong
  // passphrase" and must never leave app.vault/app.passphrase set while the
  // UI is stuck showing the locked screen with an error (vaultIsUnlocked()
  // would already be true internally at that point).
  app.vault = vault;
  app.passphrase = passphrase;
  app.vaultUnlockError = "";
  try {
    await refreshGuidelines();
    admissionDateAnchor.restore();
  } catch (error) {
    console.error("Vault unlocked, but refreshing guidelines or the admission date failed:", error);
  }
  app.view = active() ? "daily" : "vault";
  resetVaultInactivityTimer();
  setStatus("Vault unlocked.");
  render();
}

function lockVault(message = "Vault locked.") {
  vaultSessionGuards.guardLockVault();
  clearSensitiveSession();
  app.view = "vault";
  setStatus(message);
  render();
}

function requestVaultDeletion() {
  if (!readEncryptedVaultRecord()) return;
  const confirmation = byId("deleteVaultConfirmation");
  if (confirmation) confirmation.value = "";
  const confirmButton = byId("confirmDeleteVaultButton");
  if (confirmButton) confirmButton.disabled = true;
  byId("deleteVaultConfirmDialog")?.showModal();
}

function deleteVaultAndStartOver() {
  if (byId("deleteVaultConfirmation")?.value.trim() !== "DELETE") {
    throw new Error("Type DELETE to permanently remove this local vault.");
  }
  deleteEncryptedVaultRecord();
  clearSensitiveSession();
  app.view = "vault";
  byId("deleteVaultConfirmDialog")?.close();
  setStatus("Vault deleted from this browser. Create a new passphrase to start again.");
  render();
}

async function admitPatient() {
  const label = byId("newPatientLabel").value.trim();
  if (!label) throw new Error("Enter a local display label.");
  // Patient boundary: in-memory draft sessions are keyed by packet, not
  // patient. Without this clear the new patient's draft note renders the
  // previous patient's content.
  clearPatientScopedSession();
  app.vault = updateOrInitializeVault(createPatientRecord(label));
  admissionDateAnchor.restore();
  await persistVault("Patient admitted locally.");
  app.view = "daily";
  render();
}

function updateOrInitializeVault(patient) {
  const vault = app.vault;
  if (!vault) throw new Error("Unlock the vault first.");
  return {
    ...vault,
    activePatientId: patient.id,
    patients: [...vault.patients, patient],
    updatedAt: new Date().toISOString()
  };
}

function selectPatient(patientId) {
  if (patientId === active()?.id) return;
  clearPatientScopedSession();
  app.vault = setActivePatient(app.vault, patientId);
  app.view = "daily";
  admissionDateAnchor.restore();
  app.selectedDayId = selectedDay(active())?.id || "";
  render();
  void persistVault("Patient selected.");
}

async function archiveSelectedPatient(patientId) {
  if (!patientId) return;
  app.vault = archivePatient(app.vault, patientId);
  app.pendingArchivePatientId = "";
  clearPatientScopedSession();
  clearQuickDeidSession();
  byId("archiveConfirmDialog")?.close();
  await persistVault("Patient archived.");
  if (!active()) app.view = "vault";
  render();
}

function requestArchivePatient(patientId) {
  const patient = app.vault?.patients?.find((entry) => entry.id === patientId);
  if (!patient) return;
  app.pendingArchivePatientId = patientId;
  byId("archiveConfirmText").textContent =
    `This permanently removes ${patient.displayLabel} and their saved data from this device. This can't be undone.`;
  byId("archiveConfirmDialog")?.showModal();
}

function requestRemoveDay(dayId) {
  const day = active()?.days?.find((entry) => entry.id === dayId);
  if (!day) return;
  app.pendingRemoveDayId = dayId;
  byId("removeDayConfirmText").textContent =
    `This permanently removes ${day.label} (${day.date}) and its saved answers from this patient.`;
  byId("removeDayConfirmDialog")?.showModal();
}

async function removeSelectedDay(dayId) {
  const patient = active();
  if (!patient || !dayId) return;
  const remainingDays = removeDay(patient.days, dayId);
  app.selectedDayId = latestDay(remainingDays)?.id || "";
  app.selectedStayPacketId = app.selectedDayId || "admission";
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: remainingDays }));
  app.pendingRemoveDayId = "";
  byId("removeDayConfirmDialog")?.close();
  await persistVault("Hospital day removed.");
  render();
}

function focusWarningText(textarea, warning) {
  if (!textarea) return false;
  const snippet = warningSnippet(warning);
  const source = textarea.value || textarea.textContent || "";
  const candidates = [snippet, snippet.replace(/\.\.\.$/, "")].filter(Boolean);
  const match = candidates.map((candidate) => source.indexOf(candidate)).find((index) => index >= 0);
  textarea.focus();
  if (match === undefined) {
    textarea.scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }
  const matched = candidates.find((candidate) => source.indexOf(candidate) === match) || "";
  textarea.setSelectionRange(match, match + matched.length);
  textarea.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function expandSectionEditor(scope, sectionId) {
  const editor = document.querySelector(`#${sectionListId(scope)} .section-editor[data-section-id="${CSS.escape(sectionId || "")}"]`);
  if (!editor) return null;
  editor.classList.add("is-expanded");
  const button = editor.querySelector('[data-action="toggle-section-editor"]');
  if (button) {
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("title", "Collapse section");
    button.setAttribute("aria-label", "Collapse section");
  }
  return editor;
}

function scrollableAncestors(node) {
  const owners = [];
  for (let current = node?.parentElement; current; current = current.parentElement) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight) owners.push(current);
  }
  const documentOwner = document.scrollingElement;
  if (documentOwner && documentOwner.scrollHeight > documentOwner.clientHeight && !owners.includes(documentOwner))
    owners.push(documentOwner);
  return owners;
}

function captureScrollChain(node) {
  return scrollableAncestors(node).map((owner) => ({ owner, top: owner.scrollTop, left: owner.scrollLeft }));
}

function restoreScrollChain(snapshot = []) {
  snapshot.forEach(({ owner, top, left }) => {
    if (!owner?.isConnected) return;
    owner.scrollTop = top;
    owner.scrollLeft = left;
  });
}

function centerElementInNearestScrollOwner(element) {
  const owner = scrollableAncestors(element)[0];
  if (!element || !owner) return;
  const ownerRect = owner.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  owner.scrollTop = Math.max(
    0,
    owner.scrollTop + elementRect.top - ownerRect.top - owner.clientHeight / 2 + Math.min(elementRect.height, owner.clientHeight) / 2
  );
}

function refreshSectionReviewInEditor(editor, scope, sectionId, { text: replacementText } = {}) {
  if (!editor) return;
  const field = editor.querySelector(".section-text");
  const text = replacementText === undefined ? (field ? field.value : sectionDraftText(scope, sectionId)) : String(replacementText || "");
  setSectionDraftText(scope, sectionId, text);
  const label = editor.querySelector(".section-label")?.value || "Section";
  const surface = editor.querySelector("[data-section-review-surface]");
  const replacement = renderSectionSurface({ id: sectionId, label, deidentifiedText: text }, scope);
  if (surface) surface.outerHTML = replacement;
  else editor.insertAdjacentHTML("beforeend", replacement);
}

function refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, focusRedactionIndex = -1, replacementText) {
  const scrollSnapshot = captureScrollChain(editor);
  const priorDocument = editor?.querySelector("[data-redaction-document]");
  const documentTop = priorDocument?.scrollTop ?? 0;
  refreshSectionReviewInEditor(editor, scope, sectionId, { text: replacementText });
  restoreScrollChain(scrollSnapshot);
  const nextDocument = editor?.querySelector("[data-redaction-document]");
  const finish = () => {
    restoreScrollChain(scrollSnapshot);
  };
  if (focusRedactionIndex >= 0) centerRedactionDocument(nextDocument, focusRedactionIndex, finish);
  else {
    if (nextDocument) nextDocument.scrollTop = documentTop;
    requestAnimationFrame(finish);
  }
}

function reviewTargetAt(scope, sectionId, redactionIndex) {
  const sectionIndex = reviewSectionsForScope(scope).findIndex((section) => section.id === sectionId);
  return sectionIndex < 0 ? null : { scope, sectionId, sectionIndex, redactionIndex };
}

function moveToSectionReviewTarget(scope, originSectionId, target) {
  const origin = document.querySelector(`#${sectionListId(scope)} .section-editor[data-section-id="${CSS.escape(originSectionId || "")}"]`);
  const originSnapshot = captureScrollChain(origin);
  const activeTarget = activateSectionReviewTarget(scope, target);

  if (!activeTarget) {
    if (origin) refreshSectionReviewAtCurrentPosition(origin, scope, originSectionId);
    return null;
  }

  const destination = expandSectionEditor(scope, activeTarget.sectionId);
  if (origin) refreshSectionReviewInEditor(origin, scope, originSectionId);
  if (destination && destination !== origin) {
    refreshSectionReviewInEditor(destination, scope, activeTarget.sectionId);
    origin?.classList.remove("is-expanded");
    origin?.querySelector('[data-action="toggle-section-editor"]')?.setAttribute("aria-expanded", "false");
  }

  requestAnimationFrame(() => {
    const destinationDocument = destination?.querySelector("[data-redaction-document]");
    if (destination !== origin) centerElementInNearestScrollOwner(destination);
    else restoreScrollChain(originSnapshot);
    centerRedactionDocument(destinationDocument, activeTarget.redactionIndex, () => {
      if (destination === origin) restoreScrollChain(originSnapshot);
    });
  });
  return activeTarget;
}

function advanceSectionReview(scope, sectionId, redactionIndex) {
  const current = reviewTargetAt(scope, sectionId, redactionIndex);
  if (!current) return null;
  const pending = pendingSectionReviewTargets(scope);
  const nextPendingInCurrent = pending.find(
    (target) => target.sectionIndex === current.sectionIndex && target.redactionIndex > current.redactionIndex
  );
  if (nextPendingInCurrent) return moveToSectionReviewTarget(scope, sectionId, nextPendingInCurrent);

  // When the final change in one field is accepted/rejected, move into the
  // next saved textbox even when it has no model detections. This keeps the
  // review flow field-by-field instead of jumping over quiet fields to a
  // later pending warning.
  const sections = reviewSectionsForScope(scope);
  const nextSectionIndex = current.sectionIndex + 1;
  const nextSection = sections.slice(nextSectionIndex).find((section) => sectionReviewFor(scope, section.id));
  if (!nextSection) return moveToSectionReviewTarget(scope, sectionId, null);
  const nextReview = sectionReviewFor(scope, nextSection.id);
  const nextRedactionIndex = nextPendingRedactionIndex(nextReview);
  return moveToSectionReviewTarget(scope, sectionId, {
    scope,
    sectionId: nextSection.id,
    sectionIndex: nextSectionIndex + sections.slice(nextSectionIndex).findIndex((section) => section.id === nextSection.id),
    redactionIndex: nextRedactionIndex
  });
}

function focusPendingSectionReview() {
  const target = app.pendingSectionReviewFocus;
  app.pendingSectionReviewFocus = null;
  if (!target || app.view !== "daily") return;
  const activeTarget = activateSectionReviewTarget(target.scope, target);
  if (!activeTarget) return;
  const editor = expandSectionEditor(activeTarget.scope, activeTarget.sectionId);
  if (!editor) return;
  refreshSectionReviewInEditor(editor, activeTarget.scope, activeTarget.sectionId);
  requestAnimationFrame(() => {
    centerElementInNearestScrollOwner(editor);
    centerRedactionDocument(editor.querySelector("[data-redaction-document]"), activeTarget.redactionIndex);
  });
}

function editSectionText(scope, sectionId) {
  const editor = expandSectionEditor(scope, sectionId);
  if (!editor || !sectionReviewFor(scope, sectionId)) return;
  const scrollSnapshot = captureScrollChain(editor);
  app.sectionEditingKeys.add(reviewKey(scope, sectionId));
  refreshSectionReviewInEditor(editor, scope, sectionId);
  restoreScrollChain(scrollSnapshot);
  const field = editor.querySelector(".section-text");
  requestAnimationFrame(() => {
    restoreScrollChain(scrollSnapshot);
    field?.focus({ preventScroll: true });
  });
}

async function persistReprocessedSection(scope, sectionId, deidentifiedText, warnings = []) {
  const safeText = String(deidentifiedText || "");
  const residualWarnings = sanitizeResidualWarningMetadata(warnings);
  app.vault = updateActivePatient(app.vault, (current) => {
    if (scope === "daily") {
      const day = selectedDay(current);
      if (!day) return current;
      const nextDay = {
        ...day,
        sourceCaptures: day.sourceCaptures.map((section) =>
          section.id === sectionId
            ? { ...section, deidentifiedText: safeText, residualWarnings, updatedAt: new Date().toISOString() }
            : section
        ),
        updatedAt: new Date().toISOString()
      };
      return { ...current, days: upsertDay(current.days, nextDay) };
    }
    return {
      ...current,
      contextSections: current.contextSections.map((section) =>
        section.id === sectionId
          ? { ...section, deidentifiedText: safeText, residualWarnings, updatedAt: new Date().toISOString() }
          : section
      )
    };
  });
  await persistVault("De-identified source edits saved locally.");
}

async function resumeSectionReview(scope, sectionId) {
  const editor = expandSectionEditor(scope, sectionId);
  const field = editor?.querySelector(".section-text");
  if (!editor || !field) return;
  const rawText = field.value;
  const referenceDate = scope === "daily" ? selectedDay(active())?.date : app.admissionDate;
  updateDeidOperation({ active: true, message: "Re-running local de-identification review…", value: 0, total: 1 });
  try {
    await ensureSelectedDeidReady();
    const result = await deidSession.deidentify(rawText, { referenceDate });
    const review = refreshEphemeralRedactionReview(sectionReviewFor(scope, sectionId), rawText, result);
    app.phiReviews.set(reviewKey(scope, sectionId), review);
    setSectionDraftText(scope, sectionId, result.text || "");
    app.sectionEditingKeys.delete(reviewKey(scope, sectionId));
    review.inspectedRedactionIndex = nextPendingRedactionIndex(review);
    await persistReprocessedSection(scope, sectionId, result.text || "", result.residualWarnings || result.flags || []);
    updateDeidOperation({ active: false, message: "Local redaction review refreshed." });
    const pendingCount = review.redactions.filter((redaction) => redaction.state === "pending").length;
    // Keep this source expanded so the clinician can decide the fresh queue.
    refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, review.inspectedRedactionIndex, result.text || "");
    setStatus(
      pendingCount
        ? `${pendingCount} newly detected redaction${pendingCount === 1 ? "" : "s"} ready for review.`
        : "Local redaction review completed; no newly detected identifiers."
    );
  } catch (error) {
    updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
    throw error;
  }
}

function redactSelectedSectionText(scope, sectionId) {
  const editor = expandSectionEditor(scope, sectionId);
  const textarea = editor?.querySelector(".section-text");
  const review = sectionReviewFor(scope, sectionId);
  const documentElement = editor?.querySelector("[data-redaction-document]");
  if (textarea && review && documentElement) {
    const { start, end } = selectedOutputRangeFromDocument(documentElement, textarea.value);
    textarea.value = insertManualRedaction(textarea.value, review, start, end);
    refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, review.redactions.length - 1);
    setStatus("Selected text marked for manual redaction. Save changes to keep it.");
    return;
  }
  const start = textarea?.selectionStart;
  const end = textarea?.selectionEnd;
  if (!textarea || !Number.isFinite(start) || !Number.isFinite(end) || start === end) {
    throw new Error("Select text in the de-identified field before manually redacting it.");
  }
  textarea.setRangeText("[MANUAL REDACTION]", start, end, "select");
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId);
  setStatus("Selected text marked for manual redaction. Save changes to keep it.");
}

function inspectRedaction(scope, sectionId, redactionIndex) {
  const review = sectionReviewFor(scope, sectionId);
  if (!review?.redactions[redactionIndex]) return;
  moveToSectionReviewTarget(scope, sectionId, reviewTargetAt(scope, sectionId, redactionIndex));
}

function keepReviewedRedaction(scope, sectionId) {
  const review = sectionReviewFor(scope, sectionId);
  const reviewedIndex = inspectedRedactionIndex(review);
  if (!review || reviewedIndex < 0 || !review.redactions[reviewedIndex]) return;
  review.redactions[reviewedIndex].state = "confirmed";
  const next = advanceSectionReview(scope, sectionId, reviewedIndex);
  setStatus(
    next
      ? `Redaction accepted. Reviewing the next change in ${reviewSectionsForScope(scope).find((section) => section.id === next.sectionId)?.label || "the next field"}.`
      : "All redactions accepted. You can click any highlighted replacement to undo it."
  );
}

function confirmAllSectionRedactions(scope, sectionId) {
  const review = sectionReviewFor(scope, sectionId);
  if (!review) return;
  const pending = review.redactions.filter((redaction) => redaction.state === "pending");
  pending.forEach((redaction) => {
    redaction.state = "confirmed";
  });
  review.inspectedRedactionIndex = -1;
  const next = pending.length ? advanceSectionReview(scope, sectionId, review.redactions.indexOf(pending[pending.length - 1])) : null;
  setStatus(
    next
      ? "Redactions accepted. Reviewing the next field."
      : pending.length
        ? `${pending.length} redaction${pending.length === 1 ? "" : "s"} accepted. Click any highlighted replacement to undo it.`
        : "All redactions were already accepted."
  );
}

function allowReviewedNonPhi(scope, sectionId, redactionIndex) {
  const review = sectionReviewFor(scope, sectionId);
  const redaction = review?.redactions[redactionIndex];
  const editor = expandSectionEditor(scope, sectionId);
  const field = editor?.querySelector(".section-text");
  if (!review || !redaction || !field) return;
  const currentText = sectionDraftText(scope, sectionId, field.value);
  const position = redactionPosition(currentText, redaction);
  if (position < 0) {
    throw new Error("This redaction cannot be restored inline. Keep it redacted or edit the de-identified field manually.");
  }
  const nextText = `${currentText.slice(0, position)}${redaction.original}${currentText.slice(position + redaction.placeholder.length)}`;
  field.value = nextText;
  setSectionDraftText(scope, sectionId, nextText);
  review.approvedRedactionIndexes.add(redactionIndex);
  redaction.state = "restored";
  review.redactions.forEach((entry, index) => {
    if (index !== redactionIndex && entry.placeholder === redaction.placeholder && entry.occurrence > redaction.occurrence)
      entry.occurrence -= 1;
  });
  review.inspectedRedactionIndex = -1;
  const next = advanceSectionReview(scope, sectionId, redactionIndex);
  setStatus(
    next
      ? "Marked as non-PHI. Reviewing the next remaining change."
      : "Marked as non-PHI for the next save. Confirm it is not identifying before saving."
  );
}

// Repeatedly applies the single-item restore so every pending redaction gets
// the exact same text-splice and occurrence-renumbering treatment as a
// manual reject, rather than duplicating that logic for a bulk action.
// Order matters: restoring one redaction decrements the occurrence counter
// of any later same-placeholder entry, so processing highest-index (highest
// occurrence) first means every not-yet-processed entry's own occurrence
// number is never invalidated out from under it.
function rejectAllSectionRedactions(scope, sectionId) {
  const review = sectionReviewFor(scope, sectionId);
  if (!review) return;
  const pendingIndexes = review.redactions
    .map((redaction, index) => (redaction.state === "pending" ? index : -1))
    .filter((index) => index >= 0)
    .reverse();
  pendingIndexes.forEach((index) => allowReviewedNonPhi(scope, sectionId, index));
  setStatus(
    pendingIndexes.length
      ? `${pendingIndexes.length} redaction${pendingIndexes.length === 1 ? "" : "s"} marked as non-PHI. Confirm this before saving.`
      : "All redactions are already decided."
  );
}

function refreshResidualWarningSummary(scope) {
  const current = byId(`residualWarnings-${scope}`);
  if (!current) return;
  current.outerHTML = renderWarnings(reviewSectionsForScope(scope), scope);
}

async function dismissSectionWarning(scope, sectionId, warningIndex) {
  const review = sectionReviewFor(scope, sectionId);
  if (review?.warnings[warningIndex]) {
    review.dismissedWarningIndexes.add(warningIndex);
    setStatus("Warning dismissed for this review only. The decision is not stored.");
  } else {
    const patient = active();
    const sections = scope === "daily" ? selectedDay(patient)?.sourceCaptures : patient?.contextSections;
    const section = (sections || []).find((entry) => entry.id === sectionId);
    if (!section?.residualWarnings?.[warningIndex]) return;
    app.vault = updateActivePatient(app.vault, (current) => {
      if (scope === "daily") {
        const day = selectedDay(current);
        if (!day) return current;
        const nextDay = {
          ...day,
          sourceCaptures: day.sourceCaptures.map((entry) =>
            entry.id === sectionId
              ? {
                  ...entry,
                  residualWarnings: entry.residualWarnings.filter((_, index) => index !== warningIndex),
                  updatedAt: new Date().toISOString()
                }
              : entry
          )
        };
        return { ...current, days: upsertDay(current.days, nextDay) };
      }
      return {
        ...current,
        contextSections: current.contextSections.map((entry) =>
          entry.id === sectionId
            ? {
                ...entry,
                residualWarnings: entry.residualWarnings.filter((_, index) => index !== warningIndex),
                updatedAt: new Date().toISOString()
              }
            : entry
        )
      };
    });
    await persistVault("Dismissed the residual warning as not PHI.");
    setStatus("Warning dismissed and saved as not PHI.");
  }
  const editor = expandSectionEditor(scope, sectionId);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId);
  refreshResidualWarningSummary(scope);
}

async function dismissAllSectionWarnings(scope, sectionId) {
  const patient = active();
  const sections = scope === "daily" ? selectedDay(patient)?.sourceCaptures : patient?.contextSections;
  if (!(sections || []).some((section) => section.id === sectionId && section.residualWarnings?.length)) return;
  const review = sectionReviewFor(scope, sectionId);
  if (review) {
    review.warnings.forEach((_, index) => review.dismissedWarningIndexes.add(index));
  } else {
    app.vault = updateActivePatient(app.vault, (current) => {
      if (scope === "daily") {
        const day = selectedDay(current);
        if (!day) return current;
        const nextDay = {
          ...day,
          sourceCaptures: day.sourceCaptures.map((entry) =>
            entry.id === sectionId ? { ...entry, residualWarnings: [], updatedAt: new Date().toISOString() } : entry
          )
        };
        return { ...current, days: upsertDay(current.days, nextDay) };
      }
      return {
        ...current,
        contextSections: current.contextSections.map((entry) =>
          entry.id === sectionId ? { ...entry, residualWarnings: [], updatedAt: new Date().toISOString() } : entry
        )
      };
    });
    await persistVault("Dismissed all residual warnings for this field as not PHI.");
  }
  const editor = expandSectionEditor(scope, sectionId);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId);
  refreshResidualWarningSummary(scope);
  setStatus("All warnings for this field were dismissed as not PHI.");
}

function redactSectionWarning(scope, sectionId, warningIndex) {
  const review = sectionReviewFor(scope, sectionId);
  const warning = review?.warnings[warningIndex];
  const editor = expandSectionEditor(scope, sectionId);
  if (!warning || !editor) return;
  const field = editor.querySelector(".section-text");
  const snippet = warningSnippet(warning);
  const position = field?.value?.indexOf(snippet);
  if (!field || !snippet || position < 0)
    throw new Error("The flagged text is no longer present. Highlight the remaining identifier in the document and redact it manually.");
  const nextText = insertManualRedaction(field.value, review, position, position + snippet.length, "residual PHI review");
  field.value = nextText;
  setSectionDraftText(scope, sectionId, nextText);
  review.dismissedWarningIndexes.add(warningIndex);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, review.redactions.length - 1);
  refreshResidualWarningSummary(scope);
}

function reviewSectionWarning({ scope, sectionId, warningIndex }) {
  const patient = active();
  const sections = scope === "daily" ? selectedDay(patient)?.sourceCaptures : patient?.contextSections;
  const section = (sections || []).find((entry) => entry.id === sectionId);
  const review = sectionReviewFor(scope, sectionId);
  const warning = review?.warnings?.[Number(warningIndex)] || section?.residualWarnings?.[Number(warningIndex)];
  const editor = expandSectionEditor(scope, sectionId);
  if (!section || !editor) return;
  const snippet = warningSnippet(warning);
  const matchingRedactionIndex = (review?.redactions || []).findIndex(
    (redaction) => redaction.state !== "restored" && snippet && String(redaction.original || "").includes(snippet)
  );
  if (matchingRedactionIndex >= 0) {
    moveToSectionReviewTarget(scope, sectionId, reviewTargetAt(scope, sectionId, matchingRedactionIndex));
    setStatus("Opened the flagged redaction in context.");
    return;
  }
  app.sectionEditingKeys.delete(reviewKey(scope, sectionId));
  refreshSectionReviewInEditor(editor, scope, sectionId);
  const documentElement = editor.querySelector("[data-redaction-document]");
  if (documentElement && centerTextSnippetInDocument(documentElement, snippet)) {
    centerElementInNearestScrollOwner(editor);
    setStatus("Flagged text centered for manual review.");
    return;
  }
  if (review) editSectionText(scope, sectionId);
  const didSelect = focusWarningText(editor.querySelector(".section-text"), warning);
  centerElementInNearestScrollOwner(editor);
  setStatus(
    didSelect
      ? "Flagged text selected for manual review."
      : "Opened the flagged field. The detailed flag is no longer available in this review session."
  );
}

function reviewQuickWarning(warningIndex) {
  const warning = app.quickDeid.review?.warnings?.[warningIndex] || app.quickDeid.warnings?.[warningIndex];
  if (app.quickDeid.review?.warnings?.[warningIndex]) app.quickDeid.review.activeWarningIndex = warningIndex;
  const snippet = warningSnippet(warning);
  const documentElement = byId("quickDeidReviewDocument");
  const centered = centerTextSnippetInDocument(documentElement, snippet);
  setStatus(
    centered
      ? "Flagged text centered for manual review."
      : "The flagged text is not currently visible. Highlight any remaining identifier in the document to redact it."
  );
}

function centerRedactionDocument(documentElement, redactionIndex, afterCenter) {
  const finish = () => {
    if (typeof afterCenter === "function") afterCenter();
  };
  if (!documentElement || !Number.isFinite(redactionIndex) || redactionIndex < 0) {
    finish();
    return;
  }
  requestAnimationFrame(() => {
    const change = documentElement.querySelector(`[data-redaction-index="${redactionIndex}"]`);
    if (!change) {
      finish();
      return;
    }
    const documentRect = documentElement.getBoundingClientRect();
    const changeRect = change.getBoundingClientRect();
    const target =
      documentElement.scrollTop + (changeRect.top - documentRect.top) - documentElement.clientHeight / 2 + changeRect.height / 2;
    documentElement.scrollTop = Math.max(0, target);
    finish();
  });
}

function centerTextSnippetInDocument(documentElement, snippet) {
  const needle = String(snippet || "");
  if (!documentElement || !needle) return false;
  const walker = document.createTreeWalker(documentElement, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement?.closest(".redaction-change")) {
      const index = String(node.nodeValue || "").indexOf(needle);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        const rect = range.getBoundingClientRect();
        const documentRect = documentElement.getBoundingClientRect();
        documentElement.scrollTop = Math.max(
          0,
          documentElement.scrollTop + rect.top - documentRect.top - documentElement.clientHeight / 2 + rect.height / 2
        );
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      }
    }
    node = walker.nextNode();
  }
  return false;
}

function renderQuickReviewAtCurrentPosition(focusRedactionIndex = inspectedRedactionIndex(app.quickDeid.review)) {
  // `.view` owns route scrolling in this app. `window.scrollY` stays zero,
  // which is why replacing this panel can jump a clinician to the top of the
  // actual Quick De-ID scroll container. The annotated document is a second
  // scroll owner, so capture both layers before replacing its DOM node.
  const scrollOwner = byId("quickDeidView");
  const priorDocument = byId("quickDeidReviewDocument");
  const scrollSnapshot = captureScrollChain(priorDocument || scrollOwner);
  const documentTop = priorDocument?.scrollTop ?? 0;
  renderQuickDeid();
  // Rendering replaces the document node. Restore the route and inner
  // document scroll owners before centering the next decision.
  restoreScrollChain(scrollSnapshot);
  const documentElement = byId("quickDeidReviewDocument");
  if (documentElement) documentElement.scrollTop = documentTop;
  // An explicit -1 means "preserve the current position". This is used by
  // manual redaction because the user's selection—not the next pending model
  // change—is the location they need to keep in view.
  const focusIndex = Number.isFinite(focusRedactionIndex) ? focusRedactionIndex : quickSelectedRedactionIndex(app.quickDeid.review);
  centerRedactionDocument(documentElement, focusIndex, () => {
    // Replacing the review panel must never move the clinician away from the
    // current position. Restore both owners after the focused span is laid
    // out, especially for manual redaction where no focus target is centered.
    restoreScrollChain(scrollSnapshot);
    if (documentElement && focusIndex < 0) documentElement.scrollTop = documentTop;
  });
}

function selectedOutputRangeFromDocument(documentElement, output) {
  const selection = window.getSelection();
  if (
    !documentElement ||
    !selection ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    !documentElement.contains(selection.anchorNode) ||
    !documentElement.contains(selection.focusNode)
  ) {
    throw new Error("Highlight a remaining identifier in the annotated document before redacting it.");
  }
  const range = selection.getRangeAt(0);
  if ([...documentElement.querySelectorAll(".redaction-change")].some((change) => range.intersectsNode(change))) {
    throw new Error("Click a marked change to review it. Highlight only an unmarked identifier to add a manual redaction.");
  }
  const selected = selection.toString();
  if (!selected) throw new Error("Highlight a remaining identifier in the annotated document before redacting it.");
  const anchor = selection.anchorNode?.parentElement?.closest?.("[data-output-start]");
  const startAt = Number(anchor?.dataset.outputStart || 0);
  const start = String(output || "").indexOf(selected, Math.max(0, startAt));
  if (start < 0) throw new Error("The highlighted text no longer matches the de-identified result. Try selecting it again.");
  return { start, end: start + selected.length };
}

function insertManualRedaction(output, review, start, end, source = "manual review") {
  const original = String(output || "").slice(start, end);
  if (!original) throw new Error("Highlight a remaining identifier before redacting it.");
  const placeholder = "[MANUAL REDACTION]";
  const nextOutput = `${String(output || "").slice(0, start)}${placeholder}${String(output || "").slice(end)}`;
  const occurrence = [...nextOutput.matchAll(/\[MANUAL REDACTION\]/g)].findIndex((match) => match.index === start);
  review.redactions.push({
    id: `manual_${Date.now()}_${review.redactions.length}`,
    label: "MANUAL REDACTION",
    placeholder,
    occurrence: Math.max(occurrence, 0),
    source,
    original,
    state: "confirmed",
    start: -1,
    end: -1
  });
  return nextOutput;
}

function scheduleQuickReviewFocus() {
  const review = app.quickDeid.review;
  const redactionIndex = quickSelectedRedactionIndex(review);
  if (!review?.redactions?.[redactionIndex]) return;
  centerRedactionDocument(byId("quickDeidReviewDocument"), redactionIndex);
}

function inspectQuickRedaction(redactionIndex) {
  const review = app.quickDeid.review;
  if (!review?.redactions?.[redactionIndex] || review.redactions[redactionIndex].state === "restored") return;
  review.inspectedRedactionIndex = redactionIndex;
  renderQuickReviewAtCurrentPosition(redactionIndex);
}

function confirmQuickRedaction() {
  const review = app.quickDeid.review;
  if (!review) return;
  const reviewedIndex = quickRedactionIndex(review);
  if (reviewedIndex < 0) return;
  const redaction = review.redactions[reviewedIndex];
  if (redaction) redaction.state = "confirmed";
  review.inspectedRedactionIndex = quickRedactionIndex(review, reviewedIndex);
  setStatus(
    review.inspectedRedactionIndex >= 0
      ? "Redaction confirmed. Moved to the next unconfirmed item."
      : "All redactions confirmed. Review any remaining residual flags."
  );
  renderQuickReviewAtCurrentPosition();
}

function confirmAllQuickRedactions() {
  const review = app.quickDeid.review;
  if (!review) return;
  const confirmed = review.redactions.filter((redaction) => redaction.state === "pending");
  confirmed.forEach((redaction) => {
    redaction.state = "confirmed";
  });
  review.inspectedRedactionIndex = -1;
  setStatus(
    confirmed.length
      ? `${confirmed.length} redaction${confirmed.length === 1 ? "" : "s"} confirmed. Review any remaining residual flags.`
      : "All redactions are already confirmed."
  );
  renderQuickReviewAtCurrentPosition();
}

function restoreQuickNonPhi(redactionIndex) {
  const review = app.quickDeid.review;
  const redaction = review?.redactions?.[redactionIndex];
  if (!review || !redaction) return;
  const position = redactionPosition(app.quickDeid.output, redaction);
  if (position < 0) throw new Error("This redaction is no longer present in the current output.");
  app.quickDeid.output = `${app.quickDeid.output.slice(0, position)}${redaction.original}${app.quickDeid.output.slice(position + redaction.placeholder.length)}`;
  redaction.state = "restored";
  review.redactions.forEach((entry, index) => {
    if (index !== redactionIndex && entry.placeholder === redaction.placeholder && entry.occurrence > redaction.occurrence)
      entry.occurrence -= 1;
  });
  review.inspectedRedactionIndex = quickRedactionIndex(review, redactionIndex);
  setStatus(
    review.inspectedRedactionIndex >= 0
      ? "Restored as non-PHI. Moved to the next unconfirmed item."
      : "Restored as non-PHI. Review any remaining residual flags."
  );
  renderQuickReviewAtCurrentPosition();
}

// Repeatedly applies the single-item restore so every pending redaction gets
// the exact same text-splice and occurrence-renumbering treatment as a
// manual reject, rather than duplicating that logic for a bulk action.
// Order matters: restoring one redaction decrements the occurrence counter
// of any later same-placeholder entry, so processing highest-index (highest
// occurrence) first means every not-yet-processed entry's own occurrence
// number is never invalidated out from under it.
function rejectAllQuickRedactions() {
  const review = app.quickDeid.review;
  if (!review) return;
  const pendingIndexes = review.redactions
    .map((redaction, index) => (redaction.state === "pending" ? index : -1))
    .filter((index) => index >= 0)
    .reverse();
  pendingIndexes.forEach((index) => restoreQuickNonPhi(index));
  setStatus(
    pendingIndexes.length
      ? `${pendingIndexes.length} redaction${pendingIndexes.length === 1 ? "" : "s"} marked as non-PHI. Confirm this before saving.`
      : "All redactions are already decided."
  );
}

function redactSelectedQuickText({ renderAfter = true } = {}) {
  const review = app.quickDeid.review;
  if (!review) throw new Error("Run de-identification before manually redacting text.");
  const { start, end } = selectedOutputRangeFromDocument(byId("quickDeidReviewDocument"), app.quickDeid.output);
  app.quickDeid.output = insertManualRedaction(app.quickDeid.output, review, start, end);
  setStatus("Selected text manually redacted for this Quick De-ID session.");
  if (renderAfter) renderQuickReviewAtCurrentPosition(-1);
}

function dismissQuickWarning(warningIndex) {
  const review = app.quickDeid.review;
  if (!review?.warnings?.[warningIndex]) return;
  review.dismissedWarningIndexes.add(warningIndex);
  const activeWarnings = review.warnings
    .map((warning, index) => ({ warning, index }))
    .filter(({ index }) => !review.dismissedWarningIndexes.has(index));
  review.activeWarningIndex = quickWarningIndex(review, activeWarnings, warningIndex);
  setStatus(
    review.activeWarningIndex >= 0
      ? "Flag marked not PHI. Moved to the next remaining flag."
      : "Residual PHI review complete for this Quick De-ID session."
  );
  renderQuickReviewAtCurrentPosition();
}

function redactQuickWarning(warningIndex) {
  const review = app.quickDeid.review;
  const warning = review?.warnings?.[warningIndex];
  if (!review || !warning) return;
  const snippet = warningSnippet(warning);
  const position = app.quickDeid.output.indexOf(snippet);
  if (position < 0 || !snippet)
    throw new Error("The flagged text is no longer present. Highlight the remaining identifier in the document and redact it manually.");
  app.quickDeid.output = insertManualRedaction(app.quickDeid.output, review, position, position + snippet.length, "residual PHI review");
  review.dismissedWarningIndexes.add(warningIndex);
  const activeWarnings = review.warnings
    .map((entry, index) => ({ warning: entry, index }))
    .filter(({ index }) => !review.dismissedWarningIndexes.has(index));
  review.activeWarningIndex = quickWarningIndex(review, activeWarnings, warningIndex);
  setStatus(
    review.activeWarningIndex >= 0 ? "Flag redacted. Moved to the next remaining flag." : "Flag redacted. Residual PHI review is complete."
  );
  renderQuickReviewAtCurrentPosition();
}

function exportVault() {
  const record = readEncryptedVaultRecord();
  if (!record) throw new Error("No encrypted vault exists on this device. Create a vault passphrase first — without one, your data lives only in this browser session and there is nothing encrypted to export.");
  downloadJson(`prerounding-vault-${new Date().toISOString().slice(0, 10)}.json`, record);
}

async function restoreVault(file) {
  const record = JSON.parse(await file.text());
  if (record?.schema !== "prerounding_encrypted_vault_v1") throw new Error("This file is not an encrypted prerounding vault export.");
  writeEncryptedVaultRecord(record);
  clearSensitiveSession();
  app.view = "vault";
  setStatus("Encrypted vault restored. Unlock it with its passphrase.");
  render();
}

async function mutateSections(scope, updater) {
  const patient = active();
  if (!patient) throw new Error("Select a patient first.");
  if (scope === "context") {
    app.vault = updateActivePatient(app.vault, (current) => ({ ...current, contextSections: updater(current.contextSections) }));
  } else {
    const day = selectedDay(patient);
    if (!day) throw new Error("Add a hospital day first.");
    const nextDay = { ...day, sourceCaptures: updater(day.sourceCaptures), updatedAt: new Date().toISOString() };
    app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  }
  await persistVault(scope === "daily" ? "Source updated." : "Section updated.");
  render();
}

function applyApprovedRedactions(scope, sections) {
  return (sections || []).map((section) => {
    const key = reviewKey(scope, section.id);
    const review = app.phiReviews.get(key);
    if (!review?.approvedRedactionIndexes?.size) {
      // A completed save establishes a new canonical de-identified value;
      // discard the pre-save textarea draft while retaining the new review.
      setSectionDraftText(scope, section.id, section.deidentifiedText);
      return section;
    }
    let nextSection = section;
    let text = section.deidentifiedText;
    for (const redactionIndex of review.approvedRedactionIndexes) {
      const redaction = review.redactions[redactionIndex];
      const position = redaction ? redactionPosition(text, redaction) : -1;
      if (position >= 0) {
        text = `${text.slice(0, position)}${redaction.original}${text.slice(position + redaction.placeholder.length)}`;
      }
    }
    nextSection = { ...section, deidentifiedText: text };
    // The user has explicitly classified these values as non-PHI. Remove the
    // in-memory source text once the approved de-identified text is committed.
    app.phiReviews.delete(key);
    app.sectionDrafts.delete(key);
    return nextSection;
  });
}

async function deidentifySectionRows(scope, containerId, priorSections = [], referenceDate = app.admissionDate) {
  const rows = collectSectionRows(containerId);
  const retainedIds = new Set(rows.map((row) => row.id));
  for (const key of [...app.phiReviews.keys()]) {
    if (key.startsWith(`${scope}:`) && !retainedIds.has(key.slice(scope.length + 1))) app.phiReviews.delete(key);
  }
  const sections = await replaceSectionsFromFormAsync(rows, (text) => deidSession.deidentify(text, { referenceDate }), {
    priorSections,
    reprocessEditedText: true,
    scope,
    onResult: ({ row, result, prior, plan }) => {
      const key = reviewKey(scope, row.id);
      const existing = app.phiReviews.get(key);
      if (existing?.approvedRedactionIndexes?.size) return;
      // Unchanged fields weren't reprocessed - leave whatever review (or lack
      // of one) already existed for them alone rather than resetting it.
      if (plan.mode === "unchanged") return;
      if (plan.mode === "append") {
        app.phiReviews.set(
          key,
          createEphemeralRedactionReview(plan.suffix, result.suffixResult || {}, { priorOutputText: prior?.deidentifiedText || "" })
        );
      } else {
        app.phiReviews.set(key, createEphemeralRedactionReview(row.text, result));
      }
    },
    onProgress: ({ completed, total }) =>
      updateDeidOperation({
        active: true,
        value: completed,
        total,
        message: completed
          ? `De-identified ${completed} of ${total} fields locally.`
          : `Preparing ${total} field${total === 1 ? "" : "s"} for local de-identification…`
      })
  });
  return applyApprovedRedactions(scope, sections);
}

async function saveContext() {
  updateDeidOperation({ active: true, message: "Preparing admission fields for local de-identification…", value: 0, total: 1 });
  try {
    await ensureSelectedDeidReady();
    const sections = await deidentifySectionRows("context", "contextSections", active()?.contextSections || [], app.admissionDate);
    admissionDateAnchor.remember();
    app.vault = updateActivePatient(app.vault, (patient) => ({ ...patient, contextSections: sections }));
    beginSectionReview("context");
    await persistVault("Context saved as de-identified local text.");
    updateDeidOperation({ active: false, message: "Admission packet de-identified and saved locally." });
    render();
  } catch (error) {
    updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
    throw error;
  }
}

async function addDay() {
  const patient = active();
  if (!patient) throw new Error("Select a patient first.");
  const date = byId("newDayDate").value || localCalendarDate();
  const label = byId("newDayLabel").value || `HD${patient.days.length + 1}`;
  const day = createDailyRecord({ date, label });
  app.selectedDayId = day.id;
  app.selectedStayPacketId = day.id;
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, day) }));
  await persistVault("Hospital day added.");
  render();
}

async function loadAdvancedModel() {
  if (app.deidMode === STRUCTURED_DEID_MODE) {
    setStatus("Structured-only de-identification selected.");
    return;
  }
  const requestedKey = app.deidMode;
  const option = deidModelOptionByKey(requestedKey);
  const blocker = await selectedModelLoadBlocker(option);
  if (blocker) {
    setStatus(blocker);
    render();
    return;
  }
  app.loadingDeidModelKey = requestedKey;
  updateDeidOperation({ active: true, message: `Loading ${option.label} locally…` });
  setStatus(`Loading ${option.label}...`);
  renderStatusBar();
  refreshDeidControlsInActiveView();
  try {
    const loadedStatus = await preloadAdvancedDeidModel({
      modelKey: requestedKey,
      onStatus: updateDeidStatus,
      onProgress: (progress) => {
        if (progress?.message) {
          setStatus(progress.message);
          updateDeidOperation({ active: true, message: progress.message });
        }
      }
    });
    app.deidStatus = loadedStatus;
    setStatus(`${option.label} loaded locally.`);
    updateDeidOperation({ active: false, message: `${option.label} is verified and ready locally.` });
  } catch (error) {
    updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "The selected model did not load." });
    throw error;
  } finally {
    if (app.loadingDeidModelKey === requestedKey) app.loadingDeidModelKey = "";
  }
  refreshDeidControlsInActiveView();
}

async function refreshModelPackStates({ renderAfter = true } = {}) {
  const entries = await Promise.all(DEID_MODEL_OPTIONS.map(async (option) => [option.key, await getModelPackState(option)]));
  app.modelPacks = Object.fromEntries(entries);
  if (renderAfter) {
    refreshDeidControlsInActiveView();
  }
}

async function importSelectedModelPack(modelKey, entries) {
  const option = deidModelOptionByKey(modelKey);
  if (!isInstallableModel(option)) return;
  app.modelPackBusyKey = option.key;
  setStatus(`Preparing ${option.label} for local import...`);
  refreshDeidControlsInActiveView();
  try {
    const service = await ensureModelPackServiceWorker();
    app.modelPackService = service;
    await requestPersistentModelStorage();
    const imported = await importModelPack(option, entries, {
      onProgress: ({ completedBytes, totalBytes, file }) =>
        setStatus(`Importing ${option.label}: ${file} (${formatBytes(completedBytes)} of ${formatBytes(totalBytes)})...`)
    });
    if (imported.source === "imported" && !service.ready) throw new Error(service.message);
    resetAdvancedDeidWorker();
    await verifyAdvancedDeidModel({
      modelKey: option.key,
      assetSource: imported.source,
      onStatus: updateDeidStatus,
      onProgress: (progress) => progress?.message && setStatus(progress.message)
    });
    await markModelPackVerified(option);
    app.deidMode = option.key;
    app.quickDeid.status = `${option.label} installed and verified locally.`;
    await refreshModelPackStates({ renderAfter: false });
    setStatus(`${option.label} is ready for local de-identification.`);
  } finally {
    app.modelPackBusyKey = "";
    app.pendingModelPackKey = "";
    refreshDeidControlsInActiveView();
  }
}

function updateModelPackDownloadProgress(option, progress) {
  app.modelPackProgress = { ...app.modelPackProgress, [option.key]: progress };
  const card = document.querySelector(`.model-pack-card[data-model-key="${option.key}"]`);
  const progressElement = card?.querySelector("progress");
  const text = card?.querySelector("[data-model-pack-progress]");
  if (progressElement) {
    progressElement.value = progress.completedBytes;
    progressElement.max = Math.max(1, progress.totalBytes);
  }
  if (text) text.textContent = modelPackProgressText(option);
  const activeProgress = document.querySelector("[data-active-model-progress]");
  const activeText = document.querySelector("[data-active-model-progress-text]");
  const sharedProgress = document.querySelector("[data-shared-model-progress]");
  const sharedText = document.querySelector("[data-shared-model-progress-text]");
  if (app.deidMode === option.key && activeProgress) {
    activeProgress.value = progress.completedBytes;
    activeProgress.max = Math.max(1, progress.totalBytes);
  }
  if (app.deidMode === option.key && activeText) activeText.textContent = modelPackProgressText(option);
  if (app.deidMode === option.key && sharedProgress) {
    sharedProgress.value = progress.completedBytes;
    sharedProgress.max = Math.max(1, progress.totalBytes);
  }
  if (app.deidMode === option.key && sharedText) sharedText.textContent = modelPackProgressText(option);
  const message = `Downloading ${option.label}: ${modelPackProgressText(option)}...`;
  app.quickDeid.status = message;
  setStatus(message);
}

async function downloadSelectedModelPack(modelKey) {
  const option = deidModelOptionByKey(modelKey);
  if (!isInstallableModel(option) || !hasAutomaticModelDownload(option)) return;
  const blocker = crossOriginIsolationBlocker() || (await webGpuRuntimeBlocker(option));
  if (blocker) {
    app.quickDeid.status = blocker;
    setStatus(blocker);
    refreshDeidControlsInActiveView();
    return;
  }
  app.modelPackBusyKey = option.key;
  app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
  app.modelPackAbortController = new AbortController();
  app.modelPackProgress = {
    ...app.modelPackProgress,
    [option.key]: { completedBytes: 0, totalBytes: modelDownloadBytes(option), file: "Preparing local storage" }
  };
  setStatus(`Preparing ${option.label} for a local browser download...`);
  refreshDeidControlsInActiveView();
  try {
    if (option.download?.storage === "cache") {
      const service = await ensureModelPackServiceWorker();
      app.modelPackService = service;
      if (!service.ready) throw new Error(service.message);
    }
    const persistent = await requestPersistentModelStorage();
    if (!persistent)
      setStatus("The browser did not grant persistent storage. The model remains local, but the browser may evict it when space is low.");
    const installed = await installModelPack(option, {
      signal: app.modelPackAbortController.signal,
      onProgress: (progress) => updateModelPackDownloadProgress(option, progress)
    });
    resetAdvancedDeidWorker();
    app.modelPackProgress = {
      ...app.modelPackProgress,
      [option.key]: { completedBytes: installed.totalBytes, totalBytes: installed.totalBytes, file: "Verifying local inference" }
    };
    refreshDeidControlsInActiveView();
    await verifyAdvancedDeidModel({
      modelKey: option.key,
      assetSource: installed.source,
      onStatus: updateDeidStatus,
      onProgress: (progress) => progress?.message && setStatus(progress.message)
    });
    await markModelPackVerified(option);
    app.deidMode = option.key;
    app.quickDeid.status = `${option.label} downloaded and verified locally.`;
    app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
    setStatus(`${option.label} is ready for local de-identification.`);
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const message = cancelled ? `${option.label} download paused. Resume whenever you are ready.` : modelPackFailureMessage(option, error);
    app.quickDeid.status = message;
    app.modelPackErrors = {
      ...app.modelPackErrors,
      [option.key]: cancelled ? "" : message
    };
    setStatus(message);
  } finally {
    app.modelPackBusyKey = "";
    app.modelPackAbortController = null;
    await refreshModelPackStates({ renderAfter: false });
    refreshDeidControlsInActiveView();
  }
}

function cancelModelPackDownload(modelKey) {
  if (app.modelPackBusyKey !== modelKey) return;
  app.modelPackAbortController?.abort();
  setStatus("Pausing model download...");
}

async function chooseModelPack(modelKey) {
  const option = deidModelOptionByKey(modelKey);
  if (!isInstallableModel(option)) return;
  if (typeof window.showDirectoryPicker === "function") {
    const directory = await window.showDirectoryPicker({ mode: "read" });
    await importSelectedModelPack(option.key, await modelFilesFromDirectoryHandle(directory));
    return;
  }
  app.pendingModelPackKey = option.key;
  byId("modelPackFolderInput")?.click();
}

async function verifyInstalledModelPack(modelKey) {
  const option = deidModelOptionByKey(modelKey);
  if (!isInstallableModel(option)) return;
  const blocker = crossOriginIsolationBlocker() || (await webGpuRuntimeBlocker(option));
  if (blocker) {
    app.quickDeid.status = blocker;
    setStatus(blocker);
    refreshDeidControlsInActiveView();
    return;
  }
  app.modelPackBusyKey = option.key;
  app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
  app.quickDeid.status = `Verifying ${option.label} on this device...`;
  refreshDeidControlsInActiveView();
  try {
    const state = await getModelPackState(option);
    if (!state.source || state.source === "bundled") throw new Error("Import this model folder before verifying it.");
    if (state.source === "imported") {
      const service = await ensureModelPackServiceWorker();
      app.modelPackService = service;
      if (!service.ready) throw new Error(service.message);
    }
    resetAdvancedDeidWorker();
    await verifyAdvancedDeidModel({
      modelKey: option.key,
      assetSource: state.source,
      onStatus: updateDeidStatus,
      onProgress: (progress) => progress?.message && setStatus(progress.message)
    });
    await markModelPackVerified(option);
    app.deidMode = option.key;
    app.quickDeid.status = `${option.label} verified locally.`;
    app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
    await refreshModelPackStates({ renderAfter: false });
    setStatus(`${option.label} is ready for local de-identification.`);
  } catch (error) {
    const message = modelPackFailureMessage(option, error);
    app.quickDeid.status = message;
    app.modelPackErrors = { ...app.modelPackErrors, [option.key]: message };
    setStatus(message);
  } finally {
    app.modelPackBusyKey = "";
    await refreshModelPackStates({ renderAfter: false });
    refreshDeidControlsInActiveView();
  }
}

async function removeSelectedModelPack(modelKey) {
  const option = deidModelOptionByKey(modelKey);
  if (!isInstallableModel(option)) return;
  app.modelPackBusyKey = option.key;
  try {
    await removeModelPack(option);
    resetAdvancedDeidWorker();
    if (app.deidMode === option.key) app.deidMode = DEFAULT_DEID_MODEL_KEY;
    app.quickDeid.status = `${option.label} removed from this browser.`;
    await refreshModelPackStates({ renderAfter: false });
    setStatus(`${option.label} local files removed.`);
  } finally {
    app.modelPackBusyKey = "";
    refreshDeidControlsInActiveView();
  }
}



function sectionDropTarget(list, pointerY) {
  const rows = [...list.querySelectorAll(".section-editor:not(.is-dragging)")];
  return rows.reduce(
    (closest, row) => {
      const rect = row.getBoundingClientRect();
      const offset = pointerY - rect.top - rect.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, row } : closest;
    },
    { offset: Number.NEGATIVE_INFINITY, row: null }
  ).row;
}

function reorderSectionRowAtPointer(row, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const list = target?.closest("#contextSections");
  const sourceList = row.closest("#contextSections");
  if (!list || list !== sourceList) return false;
  const dropTarget = sectionDropTarget(list, clientY);
  if (dropTarget) list.insertBefore(row, dropTarget);
  else list.append(row);
  return true;
}

async function saveSectionOrderFromDocument(scope) {
  const containerId = "contextSections";
  const orderedIds = [...document.querySelectorAll(`#${containerId} .section-editor`)].map((row) => row.dataset.sectionId).filter(Boolean);
  await mutateSections(scope, (sections) => reorderSectionsById(sections, orderedIds));
}

function startPointerSectionReorder(event, handle, lists) {
  if (event.button !== 0) return;
  const row = handle.closest(".section-editor");
  if (!row) return;
  event.preventDefault();
  draggedSectionRow = row;
  sectionDragSaved = false;
  let moved = false;
  row.classList.add("is-dragging");
  const onMove = (moveEvent) => {
    moved = reorderSectionRowAtPointer(row, moveEvent.clientX, moveEvent.clientY) || moved;
  };
  const onEnd = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onEnd);
    if (moved && !sectionDragSaved) {
      sectionDragSaved = true;
      void saveSectionOrderFromDocument(row.dataset.sectionScope || "context").catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to save section order.");
        renderDaily();
      });
    }
    row.classList.remove("is-dragging");
    if (draggedSectionRow === row) draggedSectionRow = null;
    lists.forEach((list) => list.classList.remove("is-drop-target"));
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd, { once: true });
}

function bindSectionReordering() {
  const lists = [...document.querySelectorAll("#contextSections")];
  document.querySelectorAll(".section-drag-handle").forEach((handle) => {
    handle.addEventListener("mousedown", (event) => startPointerSectionReorder(event, handle, lists));
    handle.addEventListener("dragstart", (event) => {
      draggedSectionRow = handle.closest(".section-editor");
      if (!draggedSectionRow) return;
      sectionDragSaved = false;
      draggedSectionRow.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedSectionRow.dataset.sectionScope || "");
    });
    handle.addEventListener("dragend", () => {
      if (draggedSectionRow && !sectionDragSaved) {
        sectionDragSaved = true;
        void saveSectionOrderFromDocument(draggedSectionRow.dataset.sectionScope || "context").catch((error) => {
          setStatus(error instanceof Error ? error.message : "Unable to save section order.");
          renderDaily();
        });
      }
      draggedSectionRow?.classList.remove("is-dragging");
      draggedSectionRow = null;
      lists.forEach((list) => list.classList.remove("is-drop-target"));
    });
  });
  lists.forEach((list) => {
    list.addEventListener("dragover", (event) => {
      if (!draggedSectionRow || list !== draggedSectionRow.closest("#contextSections")) return;
      event.preventDefault();
      list.classList.add("is-drop-target");
      reorderSectionRowAtPointer(draggedSectionRow, event.clientX, event.clientY);
    });
    list.addEventListener("drop", (event) => {
      if (!draggedSectionRow) return;
      event.preventDefault();
      sectionDragSaved = true;
      void saveSectionOrderFromDocument(draggedSectionRow.dataset.sectionScope || "context").catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to save section order.");
        renderDaily();
      });
    });
  });
}


function savePromptTemplate() {
  const value = byId("promptPreview")?.value || "";
  app.promptTemplates = { ...app.promptTemplates, [app.selectedPromptTask]: value };
  delete app.promptDrafts[app.selectedPromptTask];
  savePromptTemplateOverrides(app.promptTemplates);
  app.smartMenuOpen = false;
  setStatus("Prompt template saved locally.");
  renderPrompts();
}

function resetPromptTemplate() {
  const next = { ...app.promptTemplates };
  delete next[app.selectedPromptTask];
  app.promptTemplates = next;
  delete app.promptDrafts[app.selectedPromptTask];
  savePromptTemplateOverrides(app.promptTemplates);
  app.smartMenuOpen = false;
  setStatus("Prompt template reset.");
  renderPrompts();
}

function insertPromptVariable(token) {
  const editor = byId("promptPreview");
  if (!editor) return;
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? start;
  const prefix = editor.value.slice(0, start).replace(/@[^@\s]*$/, "");
  const suffix = editor.value.slice(end);
  editor.value = `${prefix}${token}${suffix}`;
  app.promptDrafts[app.selectedPromptTask] = editor.value;
  app.smartMenuOpen = false;
  // Close the existing overlay before replacing the prompt DOM. This keeps a
  // stale open menu from intercepting the next control click during the
  // re-render, especially when the inserted token is at the start of the
  // textarea.
  byId("smartVariableMenu")?.classList.remove("open");
  editor.focus({ preventScroll: true });
  renderPrompts();
  requestAnimationFrame(() => scrollPromptOutputToVariable(byId("promptOutputHighlighted"), token));
}

async function runQuickDeid() {
  app.quickDeid.input = byId("quickDeidInput")?.value || "";
  app.quickDeid.verifyWithLlm = byId("quickDeidVerifyLlm")?.checked ?? app.quickDeid.verifyWithLlm;
  if (!app.quickDeid.input.trim()) {
    setStatus("Paste or type some text to de-identify first.");
    return;
  }
  const quickAdmissionDate = String(app.quickDeid.admissionDate || byId("quickDeidAdmissionDateInput")?.value || "").trim();
  app.quickDeid.admissionDate = quickAdmissionDate;
  app.deidMode = byId("quickDeidMode")?.value || app.deidMode;
  app.quickDeid.status = "Running de-identification...";
  app.quickDeidBusy = true;
  renderQuickDeid();
  try {
    await ensureSelectedDeidReady();
    const result = await deidSession.deidentify(app.quickDeid.input, { admissionDate: quickAdmissionDate, skipAdmissionGate: true });
    let verifierStatus = "";
    if (app.quickDeid.verifyWithLlm) {
      verifierStatus = await runQuickDeidLlmVerification({
        sourceText: app.quickDeid.input,
        result,
        currentDate: quickAdmissionDate || null,
        onStatus: setStatus
      });
    }
    app.quickDeid = {
      input: app.quickDeid.input,
      verifyWithLlm: app.quickDeid.verifyWithLlm,
      output: result.text || "",
      warnings: result.residualWarnings || result.flags || [],
      status: result.modelId ? `Model used: ${result.modelId}` : result.modelStatus || "Structured redaction complete.",
      review: createEphemeralRedactionReview(app.quickDeid.input, result)
    };
    setStatus(verifierStatus || "Quick de-identification complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "De-identification failed.";
    app.quickDeid = {
      input: app.quickDeid.input,
      verifyWithLlm: app.quickDeid.verifyWithLlm,
      output: "",
      warnings: [message],
      status: message,
      review: null
    };
    if (app.deidMode !== STRUCTURED_DEID_MODE) {
      await refreshModelPackStates({ renderAfter: false });
    }
    setStatus(message);
  }
  app.quickDeidBusy = false;
  renderQuickDeid();
  renderStatusBar();
}

// Form submits are routed here because the CSP blocks inline onsubmit
// handlers: chat sends go to the active chat controller, and every other
// form just has its navigation cancelled (form-action 'none' would block
// it anyway). The controllers' submit handlers already preventDefault,
// so this also keeps the Send-button click path working without the
// browser attempting a form navigation.
function handleSubmit(event) {
  const form = event.target?.closest?.("form");
  if (form && form.matches("[data-ai-chat-form]") && app.view === "aiChat" && aiChatController.submit(event)) return;
  // Native <dialog> forms (method="dialog") close their dialog on submit;
  // cancelling the event here would leave the dialog stuck open with no
  // feedback (e.g. the admission-date gate's Continue button).
  if (form?.closest?.("dialog") && form.method === "dialog") return;
  event.preventDefault();
}

function handleChange(event) {
  if (event.target.id === "vaultPassphrase") {
    clearVaultUnlockError();
    updateVaultPassphraseStrength(event.target.value);
    updateVaultPrimaryActionEnabled(event.target.value);
    return;
  }
  if (app.view === "review" && reviewController.change(event.target)) { demoController.observeChange(event.target); return; }
  if (app.view === "aiChat" && aiChatController.change(event.target)) return;
  if (app.view === "scores" && scoresController.change(event.target)) return;
  if (event.target.matches("[data-result-metadata]")) return dailySourceController.updateResultMetadata(event.target.dataset.resultScope || "daily", event.target.dataset.resultMetadata, event.target.value);
  if (event.target.matches?.(".guideline-select")) {
    guidelineSetsController.toggleSelection(event.target.dataset.guidelineId, event.target.checked);
    return;
  }
  if (event.target.matches?.('[data-action="select-all-guidelines"]')) {
    if (event.target.checked) guidelineSetsController.selectAllVisible();
    else guidelineSetsController.deselectVisible();
    return;
  }
  if (event.target.id === "patientSwitcher" && app.vault) {
    selectPatient(event.target.value);
  }
  if (event.target.id === "promptTaskSelect") {
    app.selectedPromptTask = event.target.value;
    app.smartMenuOpen = false;
    renderPrompts();
  }
  if (event.target.id === "promptDaySelect") {
    app.promptDayId = event.target.value;
    app.promptDayFollowsSelectedDay = event.target.value === app.selectedDayId;
    app.smartMenuOpen = false;
    renderPrompts();
  }
  if (event.target.id === "deidModeSelect" || event.target.id === "quickDeidMode") {
    app.deidMode = event.target.value;
    app.quickDeid.status = "";
    renderStatusBar();
    if (app.view === "daily") refreshDeidControlsInActiveView();
    if (app.view === "quickDeid") renderQuickDeid();
  }
  if (event.target.id === "quickDeidAdmissionDateInput") {
    app.quickDeid.admissionDate = event.target.value;
    if (app.view === "quickDeid") renderQuickDeid();
    return;
  }
  if (event.target.id === "dailyAdmissionDateInput") {
    app.admissionDate = event.target.value;
    if (app.view === "daily") refreshDeidControlsInActiveView();
    if (app.view === "quickDeid") renderQuickDeid();
  }
  if (event.target.id === "restoreVaultInput" && event.target.files?.[0]) {
    void restoreVault(event.target.files[0]);
  }
  if (event.target.id === "modelPackFolderInput" && event.target.files?.length && app.pendingModelPackKey) {
    void importSelectedModelPack(app.pendingModelPackKey, modelFilesFromInput(event.target.files));
    event.target.value = "";
  }
  demoController.observeChange(event.target);
}


function handleInput(event) {
  if (app.view === "review" && reviewController.input(event.target)) { demoController.observeInput(event.target); return; }
  if (dailySourceController.handleInput(event.target)) return;
  if (app.view === "scores" && scoresController.input(event.target)) return;
  if (app.view === "cheatSheets" && cheatSheetsController.input(event.target)) return;
  if (app.view === "drugChecks" && drugChecksController.input(event.target)) return;
  if (event.target.matches("[data-clinical-medication-search]")) return updateClinicalMedicationPage(event.target.closest('[data-clinical-view="medications"]'), { reset: true });
  if (event.target.id === "dailySourceDraft") {
    dailySourceController.updateDraft("daily", event.target.value);
    return;
  }
  if (event.target.id === "admissionSourceDraft") {
    dailySourceController.updateDraft("admission", event.target.value);
    return;
  }
  if (event.target.matches("[data-source-parsed-draft]")) {
    dailySourceController.updateParsedDraft(event.target.dataset.sourceScope, event.target.value, event.target.dataset.sourceSectionIndex || "");
    return;
  }
  if (event.target.id === "guidelineSearchInput") {
    guidelineSetsController.setSearchQuery(event.target.value);
    return;
  }
  if (event.target.id === "vaultPassphrase") {
    clearVaultUnlockError();
    updateVaultPassphraseStrength(event.target.value);
    updateVaultPrimaryActionEnabled(event.target.value);
    return;
  }
  if (event.target.id === "quickDeidAdmissionDateInput") {
    // Update state live but re-render only on change (committed value):
    // re-rendering here would replace the focused input on every keystroke,
    // swallowing typed digits and throwing when the node is already detached.
    app.quickDeid.admissionDate = event.target.value;
    return;
  }
  if (event.target.id === "dailyAdmissionDateInput") {
    // Same as above: the change handler re-renders once the date is committed.
    app.admissionDate = event.target.value;
    return;
  }
  if (event.target.id === "deleteVaultConfirmation") {
    const confirmButton = byId("confirmDeleteVaultButton");
    if (confirmButton) confirmButton.disabled = event.target.value.trim() !== "DELETE";
    return;
  }
  if (event.target.matches(".section-editor .section-text")) {
    const editor = event.target.closest(".section-editor");
    const scope = editor?.dataset.sectionScope || "context";
    const sectionId = editor?.dataset.sectionId || "";
    if (sectionId) setSectionDraftText(scope, sectionId, event.target.value);
    return;
  }
  if (event.target.id === "promptPreview") {
    const cursor = event.target.selectionStart ?? event.target.value.length;
    const beforeCursor = event.target.value.slice(0, cursor);
    const tokenMatch = beforeCursor.match(/(^|\s)@([\w-]*)$/);
    app.smartMenuOpen = Boolean(tokenMatch);
    app.promptDrafts[app.selectedPromptTask] = event.target.value;
    const menu = byId("smartVariableMenu");
    menu?.classList.toggle("open", app.smartMenuOpen);
    filterSmartVariableMenu(menu, tokenMatch ? tokenMatch[2] : "");
    if (app.smartMenuOpen) positionSmartVariableMenu(menu, event.target);
    refreshPromptPreview();
    return;
  }
  if (event.target.id === "presentationToEdit") {
    promptTaskController.updatePresentationToEdit(event.target.value);
    return;
  }
  if (event.target.id === "presentationSpecialty") {
    promptTaskController.updatePresentationSpecialty(event.target.value);
    return;
  }
  if (event.target.id === "quickDeidInput") {
    app.quickDeid.input = event.target.value;
    return;
  }
  if (event.target.id === "quickDeidOutput") {
    app.quickDeid.output = event.target.value;
    return;
  }
}

function handleToggle(event) {
  // Exam-findings picker: preserve expanded systems across re-renders.
  if (app.view === "review" && reviewController.toggle(event)) return;
}

function positionHelpTooltip(event) {
  const button = event.target?.closest?.(".note-help-button");
  if (!button) return;
  const container = button.closest(".note-editor") || document.documentElement;
  const box = container.getBoundingClientRect();
  const btn = button.getBoundingClientRect();
  const roomRight = box.right - btn.left - 8;
  const roomLeft = btn.right - box.left - 8;
  const maxAllowed = Math.max(160, Math.min(300, box.width - 32));
  let width = Math.min(maxAllowed, roomRight);
  let flip = false;
  if (width < 200 && roomLeft > roomRight) {
    flip = true;
    width = Math.min(maxAllowed, roomLeft);
  }
  width = Math.max(160, width);
  button.style.setProperty("--help-tip-width", `${Math.round(width)}px`);
  button.classList.toggle("note-help-flip", flip);
  // Rough height estimate (12px font, ~1.4 line-height, ~6px per char) so the
  // popup drops below the button when there is no room above it.
  const charsPerLine = Math.max(20, width / 6.2);
  const estHeight = Math.ceil((button.dataset.tooltip || "").length / charsPerLine) * 17 + 18;
  const roomAbove = btn.top - box.top - 8;
  const roomBelow = box.bottom - btn.bottom - 8;
  button.classList.toggle("note-help-below", roomAbove < estHeight && roomBelow > roomAbove);
}

function bindEvents() {
  decorateNavigation();
  tokenColorPicker.init();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", handleSubmit);
  // Prevent action buttons from stealing focus on mousedown. When a button
  // receives focus, the browser scrolls it into view — clicking a button at
  // the top while scrolled down yanks the view to the top. Preventing the
  // default mousedown behavior stops the focus (and the scroll) without
  // affecting the click event itself.
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest("button[data-action], button[data-pull-section]")) {
      event.preventDefault();
    }
  });
  document.addEventListener("toggle", handleToggle, true);
  // Question-mark hint tooltips are CSS ::after popups anchored to their
  // button. Measure the room inside the scrolling note editor on hover/focus
  // and flip/shrink the popup so its text always renders fully inside the box.
  document.addEventListener("mouseover", positionHelpTooltip);
  document.addEventListener("focusin", positionHelpTooltip);
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, recordVaultActivity, { passive: true });
  });
  document.addEventListener("keydown", (event) => {
    // Structured exam-findings custom input: Enter commits, Escape cancels.
    if (app.view === "review" && reviewController.keydown(event)) return;
    // Local AI chat composer: Enter sends, Shift+Enter adds a newline.
    if (app.view === "aiChat" && aiChatController.keydown(event)) return;
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!vaultIsUnlocked() && button.dataset.viewTarget !== "vault") {
        app.view = "vault";
        setStatus("Unlock the local vault before opening workspace tools.");
        render();
        return;
      }
      if (app.demoSession && !["daily", "cheatSheets", "review", "prompts", "drugChecks", "aiChat", "scribePro"].includes(button.dataset.viewTarget))
        demoSessionController.exit({ renderAfter: false });
      if (button.dataset.viewTarget === "review") reviewController.prepare(app.selectedStayPacketId || app.selectedDayId || "admission");
      app.view = button.dataset.viewTarget;
      app.smartMenuOpen = false; render();
      demoController.observeNavigation(app.view);
      if (button.dataset.viewTarget === "aiChat" && !isOfflineMode() && aiChatController.isRemoteMode?.()) {
        // Warm the best de-identification system in the background so the
        // first ChatGPT send doesn't wait on its one-time download. A
        // failure only surfaces as status text; the send path retries.
        void aiChatController.ensureDeidReady().catch(() => {});
      }
    });
  });
}

// The isolation headers service-worker.js stamps on only apply to a
// navigation the service worker is already controlling - never retroactively
// to the page that just registered it. Historically that meant the very
// first visit (or the first visit after any deploy that changes the worker)
// needed a *manual* reload before any AI model would load, with only a
// small status-line message explaining why - easy to miss, and easy to read
// as "de-identification is just broken". Doing that one reload automatically
// removes the manual step entirely. This only ever runs once per tab
// (sessionStorage guard, since a reload that still isn't isolated - e.g. a
// browser/extension stripping the headers - must not loop forever), and only
// from this boot-time call site, never from the mid-session model-load
// paths below: those run while the user may have unsaved text in a field,
// where an automatic reload would silently discard it.
async function ensureCrossOriginIsolationOnce() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker || globalThis.crossOriginIsolated) {
    return;
  }
  const reloadKey = "prerounding-coi-reload-attempted";
  if (typeof sessionStorage === "undefined" || sessionStorage.getItem(reloadKey)) {
    return;
  }
  const service = await ensureModelPackServiceWorker().catch(() => null);
  if (service?.ready && !globalThis.crossOriginIsolated) {
    sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  }
}

async function init() {
  // Enforce offline mode at the fetch layer before anything else runs, and
  // reflect the persisted toggle in the header pill.
  installGlobalFetchGuard();
  renderOfflineModePill();
  onOfflineModeChange(() => {
    renderOfflineModePill();
    if (app.view === "settings") renderSettings();
  });
  await ensureCrossOriginIsolationOnce();
  bindEvents();
  render();
  void refreshWebGpuAvailability();
  void refreshGuidelines().catch((error) => setStatus(error instanceof Error ? error.message : "Built-in prompts are unavailable. Reload to retry."));
  void ensureModelPackServiceWorker()
    .then((service) => {
      app.modelPackService = service;
      if (app.view === "quickDeid") renderQuickDeid();
    })
    .catch((error) => {
      app.modelPackService = { ready: false, message: error instanceof Error ? error.message : "Local model installer unavailable." };
    });
  void refreshModelPackStates();
}

void init();

async function refreshWebGpuAvailability({ renderAfter = true } = {}) {
  if (typeof navigator === "undefined" || !navigator.gpu?.requestAdapter) {
    app.webGpuAvailable = false;
    if (renderAfter) {
      renderStatusBar();
      if (app.view === "quickDeid") renderQuickDeid();
    }
    return app.webGpuAvailable;
  }
  try {
    const adapter = await Promise.race([navigator.gpu.requestAdapter(), new Promise((resolve) => setTimeout(() => resolve(null), 2500))]);
    app.webGpuAvailable = Boolean(adapter);
  } catch {
    app.webGpuAvailable = false;
  }
  if (renderAfter) {
    renderStatusBar();
    if (app.view === "quickDeid") renderQuickDeid();
  }
  return app.webGpuAvailable;
}
async function refreshGuidelines() {
  app.guidelineSets = await loadOrMigrateGuidelineSets();
  const legacyTeamPreferences = app.vault?.preferences?.teamInstructions || "";
  app.guidelineSets = await ensureCanonicalDefaultGuidelineSets(app.guidelineSets, { legacyTeamPreferences });
  app.guidelineSets = await ensureTeachingGuidelineSet(app.guidelineSets);
  app.guidelineSets = await ensureTaskGuidelineSets(app.guidelineSets);
  promptTaskController.migrateLegacyTasks();
  if (legacyTeamPreferences.trim() && app.vault?.preferences) {
    app.vault = {
      ...app.vault,
      preferences: normalizeUserPreferences({ ...app.vault.preferences, teamInstructions: "" })
    };
    await saveEncryptedVault(app.vault, app.passphrase);
  }
  renderPrompts();
}
