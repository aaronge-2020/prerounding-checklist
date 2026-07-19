import { createDailyRecord, latestDay, localCalendarDate, removeDay, sortDays, upsertDay } from "../daily-updates/days.js?v=20260711-functional-remediation-15";
import { activePatient, archivePatient, createPatientRecord, removeWorkupOverride, setActivePatient, setSelectedWorkups, setWorkupOverride, setWorkupOverrides, updateActivePatient } from "../app/state/vault.js?v=20260715-workup-delete";
import { deleteEncryptedVaultRecord, downloadJson, loadOrCreateVault, readEncryptedVaultRecord, saveEncryptedVault, writeEncryptedVaultRecord } from "../app/state/persistence.js?v=20260711-functional-remediation-15";
import { authorizeWorkupWorkspaceMirror, disconnectWorkupWorkspaceMirror, getWorkupWorkspaceMirrorState, mirrorWorkupOverridesToWorkspace } from "../app/state/workspace-mirror.js?v=20260711-functional-remediation-15";
import { addSection, removeSection, reorderSections, reorderSectionsById, replaceSectionsFromFormAsync } from "../patient-context/sections.js?v=20260711-functional-remediation-15";
import { createEphemeralRedactionReview, inspectedRedactionIndex, nextPendingRedactionIndex, nextPendingReviewTarget, pendingReviewTargets, quickRedactionIndex, quickSelectedRedactionIndex, quickWarningIndex, reviewKey, synchronizeReviewPlaceholders } from "../patient-context/review.js?v=20260715-reject-rest";
import { crossOriginIsolationBlocker, deidentifyText, getAdvancedDeidStatus, getSelectedDeidModelStatus, preloadAdvancedDeidModel, resetAdvancedDeidWorker, verifyAdvancedDeidModel } from "../patient-context/deid-client.js?v=20260717-guided-demo-ux";
import { DEFAULT_DEID_MODEL_KEY, DEID_MODEL_OPTIONS, STRUCTURED_DEID_MODE, deidModelOptionByKey } from "../patient-context/deid-model-options.js?v=20260711-functional-remediation-15";
import { canAutomaticallyInstallModel, ensureModelPackServiceWorker, getModelPackState, importModelPack, installModelPack, markModelPackVerified, modelFilesFromDirectoryHandle, modelFilesFromInput, removeModelPack, requestPersistentModelStorage } from "../patient-context/model-pack-storage.js?v=20260711-functional-remediation-15";
import { formatBytes, hasAutomaticModelDownload, isInstallableModel, modelDownloadBytes } from "../patient-context/model-packs.js?v=20260711-functional-remediation-15";
import { ADMISSION_PSEUDO_DAY_ID, buildCustomOpenEvidencePrompt, buildPromptPreviewSegments, buildPromptVariableMap, loadPromptTemplateOverrides, loadTokenColorOverrides, promptTemplateForTask, promptVariablesForPatient, savePromptTemplateOverrides, saveTokenColorOverrides } from "../prompts/custom-templates.js?v=20260719-configurable-prompt-instructions";
import { OPEN_EVIDENCE_TASKS } from "../prompts/open-evidence.js?v=20260719-teaching-demo";
import { allPromptTasks, loadCustomPromptTasks } from "../prompts/custom-tasks.js?v=20260713-exam-note-prompts";
import { ensureAdditionalGuidelineSets, ensureBuiltInPromptInstructionSets, ensureConsultingGuidelineSet, loadOrMigrateGuidelineSets } from "../prompts/guideline-sets.js?v=20260719-configurable-prompt-instructions";
import { MEDICAL_SERVICE_OPTIONS, OPENAI_WORKUP_MODEL_OPTIONS, PRESENTATION_DETAIL_OPTIONS, normalizeUserPreferences, openAiWorkupModelOption } from "../app/preferences.js?v=20260719-first-visit-demo";
import { bundledWorkupById, effectiveWorkupCatalog, findWorkupsById, normalizeWorkup, parseWorkupJson } from "../workups/schema.js?v=20260715-workup-delete";
import { mergeWorkupLibraryIntoOverrides, parseWorkupLibraryJson, workupLibraryFromOverrides } from "../workups/library.js?v=20260711-functional-remediation-15";
import { createBlankWorkup, createBlankWorkupItem, collectWorkupDraftFromDocument, workupFromEditorDraft, workupThoroughnessOption } from "../workups/editor.js?v=20260711-functional-remediation-15";
import { createWorkupOpenAiImportController } from "./workups/openai-import-controller.js?v=20260714-deid-ux-polish";
import { createWorkupDeleteController } from "./workups/delete-controller.js?v=20260715-workup-delete";
import { formatChecklistAnswersWithOpenAi } from "./openai-checklist-api.js?v=20260712-openevidence-import";
import { createChecklistSnapshot } from "../workups/checklist-conversion.js?v=20260711-functional-remediation-15";
import {
  createChecklistReturnBundle,
  createPhoneChecklistBundle,
  decodeChecklistReturnInput,
  decodeChecklistReturnTransferFile,
  decodePhoneChecklistBundle,
  decodePhoneChecklistTransferFile,
  emptyChecklistAnswers,
  emptyQuickNotes,
  fillNegativeChecklistAnswers,
  mergeQuickNotes,
  mergeReturnedAnswers,
  setChecklistChoice,
  setChecklistNote
} from "../checklist/state.js?v=20260711-functional-remediation-19";
import { groupChecklistItemsBySystem } from "../checklist/grouping.js?v=20260711-functional-remediation-19";
import { icon } from "./icons.js?v=20260711-functional-remediation-15";
import { createChecklistPresentation } from "./checklist/presentation.js?v=20260717-checklist-surface-readable";
import { createPhoneTransferController } from "./checklist/transfer.js?v=20260711-functional-remediation-19";
import { createChecklistSearchController, toggleItemNote } from "./checklist/search.js?v=20260711-functional-remediation-19";
import { createPhoneAutosave } from "./checklist/phone-autosave.js?v=20260711-functional-remediation-19";
import { createPhoneSessionController } from "./checklist/phone-session.js?v=20260711-functional-remediation-19";
import { createOpenEvidenceImportController } from "./checklist/openevidence-import-controller.js?v=20260714-deid-ux-polish";
import { createPromptsPresentation, renderHighlightedSegments } from "./prompts/presentation.js?v=20260714-token-color-fixed-popover";
import { createPromptTaskController, filterSmartVariableMenu, positionSmartVariableMenu } from "./prompts/controller.js?v=20260714-color-menu-reposition";
import { createGuidelineSetsController } from "./settings/guidelines-controller.js?v=20260713-guideline-sets";
import { createAdmissionDateGate } from "./admission-date-gate.js?v=20260714-admission-day-redaction";
import { createTokenColorPickerController } from "./token-color-picker.js?v=20260714-hue-picker";
import { createSettingsPresentation } from "./settings/presentation.js?v=20260719-configurable-prompt-instructions";
import { createVaultPresentation } from "./vault/presentation.js?v=20260719-first-visit-demo-fix";
import { createRedactionPresentation, redactionPosition, warningDescription, warningSnippet } from "./redaction/presentation.js?v=20260717-guided-demo-ux";
import { createQuickDeidPresentation } from "./quick-deid/presentation.js?v=20260717-transfer-actions";
import { createWorkupPresentation, normalizeWorkupCatalogQuery } from "./workups/presentation.js?v=20260717-workup-import-readable";
import { createDemoController } from "./demo/controller.js?v=20260719-first-visit-demo";
import { createDemoChecklistAnswers, createDemoPatient } from "./demo/session.js?v=20260719-first-visit-demo";
import { createDemoSessionController } from "./demo/session-controller.js?v=20260719-first-visit-demo";
import { shouldStartGuidedDemo } from "./demo/onboarding.js?v=20260719-first-visit-demo";
import Fuse from "../../vendor/fuse-7.0.0.mjs?v=20260711-functional-remediation-16";
const app = {
  vault: null,
  passphrase: "",
  view: "vault",
  selectedDayId: "",
  selectedPromptTask: "initial_admission_rounds",
  promptDayId: "",
  promptDayFollowsChecklist: true,
  customPromptTasks: loadCustomPromptTasks(),
  pendingRemovePromptTaskId: "",
  selectedWorkupEditorId: "general-admission",
  draftWorkup: null,
  guidelineSets: [],
  pendingRemoveGuidelineSetId: "",
  phoneBundle: null,
  phoneAnswers: {},
  phoneQuickNotes: [],
  phoneResumeOffer: null,
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
  tokenColorOverrides: loadTokenColorOverrides(),
  smartMenuOpen: false,
  quickDeid: { input: "", output: "", warnings: [], status: "", review: null },
  quickDeidBusy: false,
  phiReviews: new Map(),
  // Session-only edits remain outside the encrypted vault until the user
  // explicitly saves the containing packet.
  sectionDrafts: new Map(),
  sectionEditingKeys: new Set(),
  pendingSectionReviewFocus: null,
  workupThoroughness: "standard",
  workupImportDraft: "",
  workupApiBusy: false,
  workupApiDeidConfirmed: false,
  workupImportPanelOpen: false,
  phoneReturnReady: false,
  checklistSearchQuery: "",
  checklistOpenNoteIds: new Set(),
  openEvidenceImport: { input: "", busy: false, deidBusy: false, error: "", deidConfirmed: false, deidStatus: "", deidResidualWarnings: [] },
  workupImportError: "",
  workupCatalogOpen: false,
  workupCatalogQuery: "",
  workupCatalogSearch: null,
  workupWorkspace: { status: "unconfigured", message: "Choose a workspace folder to mirror local workups." },
  workupWorkspaceBusy: false,
  pendingArchivePatientId: "",
  pendingRemoveDayId: "",
  pendingDeleteWorkupId: "",
  demoSession: null,
  admissionDate: "" // session-only Hospital Day anchor; never persisted
};
const viewIds = ["vault", "daily", "workups", "checklist", "prompts", "quickDeid", "settings"];
const viewTitles = {
  vault: "Vault / Roster",
  daily: "Hospital Stay",
  workups: "Workups",
  checklist: "Checklist",
  prompts: "OpenEvidence Prompts",
  quickDeid: "Quick De-ID Tool",
  settings: "Settings"
};
let draggedWorkupRow = null;
let workupDragSaved = false;
let draggedSectionRow = null;
let sectionDragSaved = false;
let workupAutosaveTimer = null;
let workupAutosaveChain = Promise.resolve();
let vaultInactivityTimer = null;
const VAULT_INACTIVITY_MS = 15 * 60 * 1000;

function byId(id) {
  return document.getElementById(id);
}
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const checklistPresentation = createChecklistPresentation({ escapeHtml, icon });
const redactionPresentation = createRedactionPresentation({ escapeHtml, icon });
const quickDeidPresentation = createQuickDeidPresentation({ escapeHtml, icon });
const workupPresentation = createWorkupPresentation({ escapeHtml, icon });
const promptsPresentation = createPromptsPresentation({ escapeHtml });
const settingsPresentation = createSettingsPresentation({ escapeHtml });
const vaultPresentation = createVaultPresentation({ escapeHtml, icon });
const demoController = createDemoController({ byId, escapeHtml, getSession: () => app.demoSession, getView: () => app.view });
const demoSessionController = createDemoSessionController({ app, createDemoPatient, structuredDeidMode: STRUCTURED_DEID_MODE, clearPhiReviews, clearQuickDeidSession, render, setStatus });
const checklistSearch = createChecklistSearchController({ Fuse, normalizeQuery: normalizeWorkupCatalogQuery, byId });
const phoneAutosave = createPhoneAutosave(localStorage);
const phoneSession = createPhoneSessionController({ phoneAutosave, state: app, active, selectedChecklistDay, persistVault, renderPhoneChecklist, renderChecklist });
const openEvidenceImport = createOpenEvidenceImportController({ state: app, active, selectedChecklistDay, persistVault, renderChecklist, byId, copyText, setStatus, currentPreferences, deidentify, ensureDeidReady: ensureSelectedDeidReady, formatChecklistAnswersWithOpenAi });
const workupOpenAiImport = createWorkupOpenAiImportController({ state: app, active, byId, copyText, setStatus, currentPreferences, renderWorkups, parseAndSaveWorkupJson });
const workupDeleteController = createWorkupDeleteController({ state: app, renderWorkups, persistWorkupChanges, byId });
const promptTaskController = createPromptTaskController({ state: app, setStatus, renderPrompts, byId });
const guidelineSetsController = createGuidelineSetsController({ state: app, setStatus, renderSettings, byId });
const admissionDateGate = createAdmissionDateGate({ app, byId });
const tokenColorPicker = createTokenColorPickerController({
  byId, getOverrides: () => app.tokenColorOverrides,
  saveOverrides: (overrides) => { app.tokenColorOverrides = overrides; saveTokenColorOverrides(overrides); },
  // Not a renderPrompts(): commit() already repaints its own swatch, and a
  // full re-render here would lose the menu's docked position/filter/focus.
  onApplied: () => { if (app.view === "prompts") refreshPromptPreview(); }
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
  return app.modelPacks[option.key] || (isInstallableModel(option)
    ? { state: "checking", ready: false, message: "Checking local model-pack storage..." }
    : { state: "bundled", ready: true, message: "Bundled with this static app." });
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
    const installState = isInstallableModel(option) && !state.ready
      ? state.state === "installed" ? " - downloaded; verify to use" : " - download required"
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
    : { ready: false, message: `${deidModelLabel(app.deidMode)} hasn't loaded yet - it loads and verifies automatically the first time you use it (may take a moment).` };
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
  return app.loadingDeidModelKey === app.deidMode ? '<span class="spinner" aria-hidden="true"></span> Loading model...' : `${icon("shield")} Load selected model`;
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
    option
    && isInstallableModel(option)
    && !pack?.ready
    && hasAutomaticModelDownload(option)
    && canAutomaticallyInstallModel(option)
    && (!option.requiresWebGpu || app.webGpuAvailable)
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
  const canAutomaticallyDownload = automaticDownload && canAutomaticallyInstallModel(option) && (!option.requiresWebGpu || app.webGpuAvailable);
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

function setStatus(message, { icon: iconName } = {}) {
  app.status = message;
  const status = byId("statusLine");
  if (!status) return;
  if (iconName) status.innerHTML = `${icon(iconName)}${escapeHtml(message)}`;
  else status.textContent = message;
}

const phoneTransfer = createPhoneTransferController({
  FileConstructor: typeof File === "undefined" ? null : File,
  getChecklistBundle: currentPhoneChecklistBundle,
  getReturnBundle: currentPhoneReturnBundle,
  location: window.location,
  navigatorObject: navigator,
  downloadJson,
  setStatus
});

async function persistVault(message = "Saved.") {
  if (!app.vault || !app.passphrase) return;
  if (app.demoSession) {
    setStatus(`${message} Demo only — nothing is written to your vault.`);
    return;
  }
  await saveEncryptedVault(app.vault, app.passphrase);
  setStatus(message);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  setStatus("Copied.");
}

function patientRequiredMessage({ allowPhoneBundleImport = false } = {}) {
  return `
    <div class="empty-state next-step">
      <strong>Next step: unlock the vault and add a patient.</strong>
      <span>Use a de-identified room label to begin a new hospital stay.</span>
      ${allowPhoneBundleImport ? `<div class="transfer-actions"><button class="button--secondary button--transfer" type="button" data-action="choose-phone-bundle-file">${icon("upload")} Open shared checklist file</button><input id="phoneBundleFileInput" type="file" accept="application/json,.json,text/plain,.txt" hidden></div>` : ""}
    </div>
  `;
}

function decorateNavigation() {
  document.querySelectorAll(".primary-nav [data-icon]").forEach((button) => {
    if (button.dataset.decorated) return;
    const label = button.textContent.trim();
    button.innerHTML = `${icon(button.dataset.icon)}<span>${escapeHtml(label)}</span>`;
    button.setAttribute("aria-label", label);
    button.title = label;
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
  ["dailyContent", "workupsContent", "checklistContent", "promptsContent", "quickDeidContent", "settingsContent"].forEach((id) => {
    const container = byId(id);
    if (container) container.replaceChildren();
  });
  byId("archiveConfirmDialog")?.close();
  byId("removeDayConfirmDialog")?.close();
  byId("deleteWorkupConfirmDialog")?.close();
}

function clearSensitiveSession() {
  if (vaultInactivityTimer) {
    clearTimeout(vaultInactivityTimer);
    vaultInactivityTimer = null;
  }
  if (app.demoSession) demoSessionController.exit({ renderAfter: false });
  app.vault = null;
  app.passphrase = "";
  app.vaultUnlockError = "";
  app.selectedDayId = "";
  app.sectionDrafts.clear();
  app.sectionEditingKeys.clear();
  app.pendingSectionReviewFocus = null;
  app.draftWorkup = null;
  app.phoneBundle = null;
  app.phoneAnswers = {};
  app.phoneQuickNotes = [];
  app.phoneResumeOffer = null;
  app.phoneReturnReady = false;
  app.checklistSearchQuery = "";
  app.checklistOpenNoteIds = new Set();
  app.workupImportError = "";
  app.workupImportDraft = "";
  app.workupApiBusy = false;
  app.workupApiDeidConfirmed = false;
  app.workupImportPanelOpen = false;
  app.promptDrafts = {};
  app.promptDayId = "";
  clearPhiReviews();
  clearQuickDeidSession();
}

function render() {
  if (app.phoneBundle) {
    document.body.classList.remove("vault-locked");
    document.body.classList.add("phone-mode");
    renderPhoneChecklist();
    return;
  }
  const unlocked = vaultIsUnlocked();
  document.body.classList.toggle("vault-locked", !unlocked);
  if (!unlocked) {
    app.view = "vault";
    app.phoneBundle = null;
    app.phoneAnswers = {};
    app.phoneQuickNotes = [];
    app.phoneResumeOffer = null;
    app.phoneReturnReady = false;
    clearPhiReviews();
    clearQuickDeidSession();
    clearProtectedViewContent();
    for (const id of viewIds) {
      byId(`${id}View`)?.classList.toggle("active", id === "vault");
      document.querySelector(`[data-view-target="${id}"]`)?.classList.toggle("active", id === "vault");
    }
    renderVault();
    renderStatusBar();
    return;
  }
  if (!app.phoneBundle && app.view !== "daily" && app.phiReviews.size) clearPhiReviews();
  if (!app.phoneBundle && app.view !== "quickDeid" && (app.quickDeid.input || app.quickDeid.review)) clearQuickDeidSession();
  document.body.classList.remove("phone-mode");
  for (const id of viewIds) {
    byId(`${id}View`)?.classList.toggle("active", app.view === id);
    document.querySelector(`[data-view-target="${id}"]`)?.classList.toggle("active", app.view === id);
  }
  // Each view-renderer runs independently: one throwing (e.g. on bad locally
  // cached data) must never prevent renderStatusBar() below from running -
  // that's what reflects patient selection, so a single broken view previously
  // made the whole app look like patient selection had stopped working.
  for (const renderView of [renderVault, renderDaily, renderWorkups, renderChecklist, renderPrompts, renderQuickDeid, renderSettings]) {
    try {
      renderView();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Unable to render this view.");
    }
  }
  demoController.render();
  renderStatusBar();
  if (app.view === "daily" && app.pendingSectionReviewFocus) requestAnimationFrame(focusPendingSectionReview);
}

function renderStatusBar() {
  const patient = active();
  const record = readEncryptedVaultRecord();
  byId("currentPageTitle").textContent = viewTitles[app.view] || "Preround";
  byId("vaultStateLabel").textContent = app.vault ? "Vault unlocked" : record ? "Vault locked" : "No vault on this device";
  const deidStatus = selectedDeidStatus();
  byId("deidStateLabel").textContent = `Redaction model: ${deidModelLabel(app.deidMode)} — ${deidStatus.ready ? "ready" : "not loaded"}`;
  byId("statusLine").textContent = app.status || "All data is encrypted and stays on this device. Nothing leaves without your explicit action.";
  const switcher = byId("patientSwitcher");
  if (!switcher) return;
  const patients = visiblePatients(app.vault);
  switcher.disabled = !app.vault || !patients.length;
  switcher.innerHTML = patients.length
    ? patients
        .map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === patient?.id ? "selected" : ""}>${escapeHtml(entry.displayLabel)}</option>`)
        .join("")
    : `<option>No patient selected</option>`;
}

function showVaultUnlockError(message) {
  app.vaultUnlockError = message;
  const input = byId("vaultPassphrase");
  const error = byId("vaultPassphraseError");
  if (input) {
    input.setAttribute("aria-describedby", "vaultPassphraseError");
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearVaultUnlockError() {
  if (!app.vaultUnlockError) return;
  app.vaultUnlockError = "";
  byId("vaultPassphrase")?.removeAttribute("aria-describedby");
  byId("vaultPassphrase")?.removeAttribute("aria-invalid");
  const error = byId("vaultPassphraseError");
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function toggleVaultPassphraseVisibility() {
  const input = byId("vaultPassphrase");
  const button = byId("vaultPassphraseVisibility");
  if (!input || !button) return;
  const isMasked = input.type === "password";
  input.type = isMasked ? "text" : "password";
  button.setAttribute("aria-label", isMasked ? "Hide passphrase" : "Show passphrase");
  button.title = isMasked ? "Hide passphrase" : "Show passphrase";
  button.setAttribute("aria-pressed", String(isMasked));
}

function updateVaultPassphraseStrength(value) {
  const strength = byId("vaultPassphraseStrength");
  if (!strength) return;
  const length = value.length;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  let state = "is-empty";
  let label = "Use at least 12 characters and two or more words.";
  if (length > 0 && length < 12) {
    state = "is-weak";
    label = `${length}/12 characters — add more words, not a short code.`;
  } else if (length >= 12 && words < 2) {
    state = "is-fair";
    label = "Long enough, but use two or more words for a stronger passphrase.";
  } else if (length >= 12) {
    state = "is-strong";
    label = "Strong passphrase — multiple words make it easier to remember.";
  }
  strength.className = `vault-passphrase-strength ${state}`;
  strength.querySelector(".vault-passphrase-strength-label").textContent = label;
}

function renderVault() {
  const record = readEncryptedVaultRecord();
  byId("vaultContent").innerHTML = vaultPresentation.renderVault({
    record,
    unlocked: vaultIsUnlocked(),
    vault: app.vault,
    patients: visiblePatients(app.vault),
    vaultUnlockError: app.vaultUnlockError,
    demoPatientLabel: app.demoSession?.stage === "add-patient" ? "Room 301 - Synthetic demo" : "",
    demoPatientMode: app.demoSession?.stage === "add-patient"
  });
}

function renderDeidStrip() {
  const readiness = selectedDeidReadiness();
  const option = selectedDeidOption();
  const progress = option ? app.modelPackProgress[option.key] : null;
  return `
    <div class="deid-strip deid-strip-compact">
      <div class="deid-inline-status">
        <strong>Advanced De-identification</strong>
        <span class="muted" data-deid-selected-state>Selected: ${escapeHtml(deidModelLabel(app.deidMode))} | ${escapeHtml(selectedDeidStateText())}</span>
      </div>
      <div class="button-row">
        <select id="deidModeSelect" aria-label="De-identification mode">
          ${deidModelSelectOptions()}
        </select>
        ${renderDeidLoadButton()}
      </div>
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
  return scope === "daily" ? "dailySections" : "contextSections";
}

function isSectionTextEditing(scope, sectionId) {
  return app.sectionEditingKeys.has(reviewKey(scope, sectionId));
}

function reviewSectionsForScope(scope) {
  const patient = active();
  if (!patient) return [];
  return scope === "daily"
    ? selectedChecklistDay(patient)?.sections || []
    : patient.contextSections || [];
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
  app.quickDeid = { input: "", output: "", warnings: [], status: "", review: null };
}

// The same annotated document is used by Quick De-ID and Hospital Stay. It is
// deliberately a read-only review field: it shows the active-tab original
// crossed out beside the safe replacement, while the canonical copy/save text
// remains the de-identified string in state.
function renderRedactionDocument(text, review, { id = "", scope = "", sectionId = "", action = "inspect-redaction", label = "De-identified text review" } = {}) {
  synchronizeReviewPlaceholders(review, text);
  return redactionPresentation.renderRedactionDocument(text, review, { id, scope, sectionId, action, label });
}

function renderSectionSurface(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  const editing = review && isSectionTextEditing(scope, section.id);
  const draftText = sectionDraftText(scope, section.id, section.deidentifiedText);
  synchronizeReviewPlaceholders(review, draftText);
  return redactionPresentation.renderSectionSurface({ section, scope, review, editing, draftText, sections: reviewSectionsForScope(scope), reviewFor: (id) => sectionReviewFor(scope, id) });
}

function renderSectionEditor(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  const editing = isSectionTextEditing(scope, section.id);
  const draftText = sectionDraftText(scope, section.id, section.deidentifiedText);
  synchronizeReviewPlaceholders(review, draftText);
  return redactionPresentation.renderSectionEditor({ section, scope, editing, pendingFocus: app.pendingSectionReviewFocus, review, draftText, sections: reviewSectionsForScope(scope), reviewFor: (id) => sectionReviewFor(scope, id) });
}

function renderWarnings(sections, scope) {
  return redactionPresentation.renderWarnings({ sections, scope, reviewFor: sectionReviewFor });
}

function renderDaily() {
  const patient = active();
  if (!patient) {
    byId("dailyContent").innerHTML = patientRequiredMessage();
    return;
  }
  const days = sortDays(patient.days);
  const selected = days.find((day) => day.id === app.selectedDayId) || days.at(-1) || null;
  const deidBusy = app.deidOperation.active;
  if (selected && selected.id !== app.selectedDayId) app.selectedDayId = selected.id;
  byId("dailyContent").innerHTML = `
    <div class="stay-layout">
      <aside class="panel stay-rail">
        <div class="section-heading tight">
          <div>
            <h2>Hospital day</h2>
            <p class="muted">You choose the label for each day.</p>
          </div>
        </div>
        <div class="next-step compact-next-step">
          <strong>${days.length ? "Next: keep this stay current." : "Next: add the first hospital day."}</strong>
          <span>${days.length ? "Select a day, add de-identified updates, then save changes." : "Add a hospital day before building a workup."}</span>
        </div>
        <div class="timeline-rail">
          ${days.length ? days.map((day, index) => renderDayRow(day, selected?.id, index)).join("") : `<div class="empty-state">No hospital days saved.</div>`}
        </div>
        <details class="new-day-control" ${days.length ? "" : "open"}>
          <summary>${icon("plus")} Add hospital day</summary>
          <div class="form-grid compact">
            <label>Date
              <input id="newDayDate" type="date" value="${localCalendarDate()}">
            </label>
            <label>Label
              <input id="newDayLabel" placeholder="HD2 - Today">
            </label>
            <button class="button--secondary" type="button" data-action="add-day">Add day</button>
          </div>
        </details>
      </aside>
      <div class="stay-content">
        <section class="panel admission-packet packet-surface">
          <details class="admission-packet-details" open>
            <summary>
              <span><strong>Admission packet</strong><span class="muted">De-identified background for this stay</span></span>
              <span class="muted">${patient.contextSections.length} fields</span>
            </summary>
            <div class="admission-packet-body">
              <div class="section-heading">
                <div>
                  <h2>Admission packet</h2>
                  <p class="muted">De-identified background information used throughout this hospital stay.</p>
                </div>
                <div class="button-row">
                  <button class="button--secondary" type="button" data-action="add-context-section">${icon("plus")} Add field</button>
                </div>
              </div>
              ${renderDeidStrip()}
              <div id="contextSections" class="section-list">
                ${patient.contextSections.map((section) => renderSectionEditor(section, "context")).join("")}
              </div>
              ${renderWarnings(patient.contextSections, "context")}
              <div class="packet-action-footer">
                <button class="button--primary" type="button" data-action="save-context" ${deidBusy ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "Save admission packet"}</button>
              </div>
            </div>
          </details>
        </section>
        <section class="panel hospital-day-packet packet-surface">
          ${
            selected
              ? `
                <div class="section-heading">
                  <div>
                    <h2>${escapeHtml(selected.label)}</h2>
                    <p class="muted">${escapeHtml(selected.date)} · No automatic trend detection — you write and label each day's findings yourself.</p>
                  </div>
                  <div class="button-row">
                    <button class="button--secondary" type="button" data-action="add-daily-section">${icon("plus")} Add field</button>
                    <button class="button--primary" type="button" data-action="save-day" ${deidBusy ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "Save hospital day"}</button>
                    <button type="button" class="button--quiet danger-subtle" data-action="remove-day">${icon("trash")} Remove</button>
                  </div>
                </div>
                <div id="dailySections" class="section-list">
                  ${selected.sections.map((section) => renderSectionEditor(section, "daily")).join("")}
                </div>
                ${renderWarnings(selected.sections, "daily")}
              `
              : `<div class="empty-state">Add a hospital day to start tracking updates.</div>`
          }
        </section>
      </div>
    </div>
  `;
  bindSectionReordering();
}

function workupCatalogQueryValue(query) {
  return normalizeWorkupCatalogQuery(query);
}

function workupCatalogMatchIds(query) {
  const normalizedQuery = workupCatalogQueryValue(query);
  if (!normalizedQuery) return null;
  return new Set((app.workupCatalogSearch?.search(normalizedQuery) || []).map((result) => result.item.id));
}

function updateWorkupCatalogFilter() {
  const list = document.querySelector("[data-workup-catalog-list]");
  if (!list) return;
  const matchingIds = workupCatalogMatchIds(app.workupCatalogQuery);
  const rows = [...list.querySelectorAll(".workup-catalog-row")];
  const visible = rows.filter((row) => {
    const matches = !matchingIds || matchingIds.has(row.dataset.workupId);
    row.hidden = !matches;
    row.style.display = matches ? "" : "none";
    return matches;
  });
  const count = document.querySelector("[data-workup-catalog-count]");
  if (count) count.textContent = matchingIds ? `${visible.length} of ${rows.length} workups` : `${rows.length} workups`;
  const empty = document.querySelector("[data-workup-catalog-empty]");
  if (empty) empty.hidden = visible.length > 0;
  const clear = document.querySelector('[data-action="clear-workup-search"]');
  if (clear) clear.hidden = !matchingIds;
}

function renderDayRow(day, selectedDayId, index) {
  const userLabel = String(day.label || "").replace(/^\s*hd\s*\d+\s*[-:|]?\s*/i, "").trim() || `Hospital day ${index + 1}`;
  return `
    <button type="button" class="day-row ${day.id === selectedDayId ? "selected" : ""}" data-action="select-day" data-day-id="${escapeHtml(day.id)}">
      <span>
        <strong>HD${index + 1}</strong>
        <span class="muted">${escapeHtml(userLabel)} - ${escapeHtml(day.date)}</span>
      </span>
      <span class="muted">${day.sections.length} sections</span>
    </button>
  `;
}

function renderWorkups() {
  const patient = active();
  if (!patient || !app.vault) {
    byId("workupsContent").innerHTML = patientRequiredMessage();
    return;
  }
  const catalog = effectiveWorkupCatalog(app.vault.workupOverrides, app.vault.hiddenWorkupIds);
  const hiddenWorkups = app.vault.hiddenWorkupIds.map(bundledWorkupById).filter(Boolean);
  const selectedIds = new Set(app.vault.selectedWorkupIds);
  app.workupCatalogSearch = new Fuse(catalog, {
    keys: [
      { name: "title", weight: 0.55 },
      { name: "aliases", weight: 0.3 },
      { name: "id", weight: 0.15 }
    ],
    ignoreLocation: true,
    minMatchCharLength: 1,
    threshold: 0.35
  });
  const matchingWorkupIds = workupCatalogMatchIds(app.workupCatalogQuery);
  const editorWorkup = app.draftWorkup || catalog.find((workup) => workup.id === app.selectedWorkupEditorId) || catalog[0] || createBlankWorkup();
  app.selectedWorkupEditorId = editorWorkup.id;
  const preferences = currentPreferences();
  byId("workupsContent").innerHTML = workupPresentation.renderWorkups({
    catalog,
    selectedIds,
    matchingWorkupIds,
    editorWorkup,
    hasDraftWorkup: Boolean(app.draftWorkup),
    catalogQuery: app.workupCatalogQuery,
    thoroughness: app.workupThoroughness,
    hasSavedOpenAiKey: Boolean(preferences.openAiApiKey),
    openAiModelLabel: openAiWorkupModelOption(preferences.openAiModel).label,
    workspace: app.workupWorkspace || { status: "unconfigured" },
    workspaceBusy: app.workupWorkspaceBusy,
    workupOverrides: app.vault.workupOverrides,
    workupImportError: app.workupImportError,
    workupApiBusy: app.workupApiBusy,
    workupApiDeidConfirmed: app.workupApiDeidConfirmed,
    workupImportPanelOpen: app.workupImportPanelOpen,
    workupImportDraft: app.workupImportDraft,
    hiddenWorkups
  });
  bindWorkupReordering();
}

function selectedChecklistDay(patient) {
  const days = sortDays(patient?.days || []);
  return days.find((day) => day.id === app.selectedDayId) || [...days].reverse().find((day) => day.checklistSnapshot) || days.at(-1) || null;
}

function renderChecklist() {
  const patient = active();
  if (!patient) {
    byId("checklistContent").innerHTML = patientRequiredMessage({ allowPhoneBundleImport: true });
    return;
  }
  const day = selectedChecklistDay(patient);
  const snapshot = day?.checklistSnapshot || null;
  const answers = day?.answers || {};
  const preferences = currentPreferences();
  checklistSearch.buildIndex(snapshot);
  byId("checklistContent").innerHTML = checklistPresentation.renderDesktopChecklist({
    day,
    snapshot,
    answers,
    quickNotes: day?.quickNotes || [],
    openNoteIds: app.checklistOpenNoteIds,
    searchQuery: app.checklistSearchQuery,
    phoneLink: snapshot ? phoneTransfer.currentChecklistUrl() : "",
    openEvidenceImport: {
      ...app.openEvidenceImport,
      ...selectedDeidReadinessAsPanelProps(),
      hasSavedOpenAiKey: Boolean(preferences.openAiApiKey),
      openAiModelLabel: openAiWorkupModelOption(preferences.openAiModel).label,
      canSaveExamNote: Boolean(day && app.openEvidenceImport.input.trim() && app.openEvidenceImport.deidConfirmed),
      savedExamNote: day?.openEvidenceExamNote || null
    }
  });
  checklistSearch.updateFilter(app.checklistSearchQuery);
}

function currentPhoneChecklistBundle() {
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day?.checklistSnapshot) throw new Error("Build a checklist first.");
  return createPhoneChecklistBundle(patient, day.checklistSnapshot, day.answers || {}, day.quickNotes || []);
}

function currentPhoneReturnBundle() {
  const snapshot = app.phoneBundle?.checklist;
  if (!snapshot) throw new Error("Open a phone checklist first.");
  return createChecklistReturnBundle(snapshot, app.phoneAnswers, app.phoneQuickNotes);
}

function renderPrompts() {
  const patient = active();
  if (!patient) {
    byId("promptsContent").innerHTML = patientRequiredMessage();
    return;
  }
  const tasks = allPromptTasks(OPEN_EVIDENCE_TASKS, app.customPromptTasks);
  const task = tasks.find((entry) => entry.id === app.selectedPromptTask) || tasks[0];
  const promptDays = sortDays(patient.days || []);
  // Follow the Checklist/Daily day until manually overridden here, so a
  // note saved on a newly-added day doesn't look lost behind a stale pick.
  if (app.promptDayFollowsChecklist && app.promptDayId !== app.selectedDayId) app.promptDayId = app.selectedDayId;
  const isAdmissionSelected = app.promptDayId === ADMISSION_PSEUDO_DAY_ID;
  if (!isAdmissionSelected) {
    const selectedPromptDay = promptDays.find((day) => day.id === app.promptDayId)
      || promptDays.find((day) => day.id === app.selectedDayId)
      || promptDays.at(-1)
      || null;
    app.promptDayId = selectedPromptDay ? selectedPromptDay.id : ADMISSION_PSEUDO_DAY_ID;
  }
  const template = app.promptDrafts[task.id] ?? promptTemplateForTask(task.id, app.promptTemplates);
  let promptError = "";
  let previewSegments = [{ type: "text", value: "" }];
  try {
    const variableMap = buildPromptVariableMap({ patient, selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets, teamPreferences: app.vault.preferences });
    previewSegments = buildPromptPreviewSegments(template, variableMap);
  } catch (error) {
    promptError = error instanceof Error ? error.message : "Unable to build prompt.";
  }
  const variables = promptVariablesForPatient(patient, { selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets });
  const templateHighlightSegments = buildPromptPreviewSegments(template, Object.fromEntries(variables.map((entry) => [entry.token, entry.token])));
  byId("promptsContent").innerHTML = promptsPresentation.renderPrompts({
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
    variables,
    smartMenuOpen: app.smartMenuOpen,
    colorOverrides: app.tokenColorOverrides
  });
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
  container.innerHTML = settingsPresentation.renderSettings({
    preferences,
    apiKeySaved: Boolean(preferences.openAiApiKey),
    guidelineSets: app.guidelineSets,
    MEDICAL_SERVICE_OPTIONS,
    PRESENTATION_DETAIL_OPTIONS,
    OPENAI_WORKUP_MODEL_OPTIONS,
    colorOverrides: app.tokenColorOverrides
  });
}

function setVaultPreferences(nextPreferences) {
  app.vault = {
    ...app.vault,
    preferences: normalizeUserPreferences(nextPreferences),
    updatedAt: new Date().toISOString()
  };
}

async function saveTeamPreferences() {
  const preferences = currentPreferences();
  setVaultPreferences({
    ...preferences,
    medicalService: byId("settingsMedicalService")?.value,
    customServiceName: byId("settingsCustomServiceName")?.value,
    serviceFocus: byId("settingsServiceFocus")?.value,
    presentationDetail: byId("settingsPresentationDetail")?.value,
    attendingPreferences: byId("settingsAttendingPreferences")?.value
  });
  await persistVault("Team preferences saved in the encrypted vault.");
  render();
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

function refreshPromptPreview() {
  const patient = active();
  const highlighted = byId("promptOutputHighlighted");
  if (!patient || !highlighted) return;
  const template = app.promptDrafts[app.selectedPromptTask] ?? promptTemplateForTask(app.selectedPromptTask, app.promptTemplates);
  try {
    const variableMap = buildPromptVariableMap({ patient, selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets, teamPreferences: app.vault.preferences });
    highlighted.innerHTML = renderHighlightedSegments(buildPromptPreviewSegments(template, variableMap), escapeHtml, app.tokenColorOverrides);
    const templateBackdrop = byId("promptTemplateHighlight");
    if (templateBackdrop) {
      const variables = promptVariablesForPatient(patient, { selectedDayId: app.promptDayId, guidelineSets: app.guidelineSets });
      const identityMap = Object.fromEntries(variables.map((entry) => [entry.token, entry.token]));
      templateBackdrop.innerHTML = renderHighlightedSegments(buildPromptPreviewSegments(template, identityMap), escapeHtml, app.tokenColorOverrides);
    }
  } catch (error) {
    highlighted.textContent = error instanceof Error ? error.message : "Unable to build prompt.";
  }
}

function currentPromptText() {
  const patient = active();
  if (!patient) return "";
  const template = app.promptDrafts[app.selectedPromptTask] ?? promptTemplateForTask(app.selectedPromptTask, app.promptTemplates);
  try {
    return buildCustomOpenEvidencePrompt({
      taskId: app.selectedPromptTask,
      template,
      patient,
      selectedDayId: app.promptDayId,
      guidelineSets: app.guidelineSets,
      teamPreferences: app.vault.preferences
    });
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
    renderRedactionDocumentHtml: renderRedactionDocument(app.quickDeid.output, review, { id: "quickDeidReviewDocument", action: "inspect-quick-redaction", label: "Annotated de-identified text" }),
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
  byId("quickDeidContent").innerHTML = quickDeidPresentation.renderQuickDeid({
    hasReview,
    disabled: Boolean(app.modelPackBusyKey || app.quickDeidBusy),
    busy: app.quickDeidBusy,
    admissionDate: app.admissionDate,
    quickDeidInput: app.quickDeid.input,
    renderQuickModelControlHtml: renderQuickModelControl(),
    renderQuickDeidReviewHtml: hasReview ? renderQuickDeidReview() : ""
  });
  scheduleQuickReviewFocus();
}

function renderPhoneChecklist() {
  const snapshot = app.phoneBundle.checklist;
  const returnBundle = phoneTransfer.currentReturnCode();
  checklistSearch.buildIndex(snapshot);
  const phoneView = checklistPresentation.buildPhoneChecklistView({
    patientLabel: app.phoneBundle.patientLabel,
    snapshot,
    answers: app.phoneAnswers,
    quickNotes: app.phoneQuickNotes,
    openNoteIds: app.checklistOpenNoteIds,
    searchQuery: app.checklistSearchQuery,
    phoneReturnReady: app.phoneReturnReady,
    resumeOffer: app.phoneResumeOffer,
    returnBundle
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  byId("checklistView").classList.add("active");
  byId("checklistContent").innerHTML = phoneView.markup;
  checklistSearch.updateFilter(app.checklistSearchQuery);
  renderStatusBar();
}

function collectSectionRows(containerId) {
  return [...document.querySelectorAll(`#${containerId} .section-editor`)].map((row) => ({
    id: row.dataset.sectionId,
    createdAt: row.dataset.createdAt,
    label: row.querySelector(".section-label")?.value || "",
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
    document.querySelectorAll('[data-action="save-context"], [data-action="save-day"]').forEach((button) => {
      button.disabled = busy;
      button.textContent = busy ? "De-identifying…" : "Save changes";
    });
  }
  if (app.view === "quickDeid") renderQuickDeid();
  renderStatusBar();
}

async function deidentify(rawText) {
  if (!app.admissionDate) {
    await admissionDateGate.requestAdmissionDateFromUser();
  }
  return deidentifyText(rawText, {
    mode: app.deidMode,
    admissionDate: app.admissionDate,
    onStatus: updateDeidStatus,
    onProgress: (progress) => {
      if (progress?.message) {
        setStatus(progress.message);
        if (app.deidOperation.active) updateDeidOperation({ ...app.deidOperation, message: progress.message });
      }
    }
  });
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (target && target.dataset.action === "import-phone-return") console.log("TEXTAREA VALUE IN HANDLER:", document.getElementById("phoneReturnText")?.value.length, document.getElementById("phoneReturnText")?.value.substring(0, 50));
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (!app.phoneBundle && !vaultIsUnlocked() && !["unlock-vault", "toggle-vault-passphrase", "restore-vault", "request-delete-vault", "confirm-delete-vault"].includes(action)) {
      throw new Error("Unlock the local vault before using workspace tools.");
    }
    if (action === "unlock-vault") await unlockVault();
    if (action === "start-guided-demo" || action === "restart-guided-demo") demoSessionController.start();
    if (action === "exit-guided-demo") demoSessionController.exit();
    if (action === "toggle-vault-passphrase") toggleVaultPassphraseVisibility();
    if (action === "lock-vault") lockVault();
    if (action === "request-delete-vault") requestVaultDeletion();
    if (action === "confirm-delete-vault") deleteVaultAndStartOver();
    if (action === "admit-patient") await admitPatient();
    if (action === "add-demo-patient") {
      const label = byId("newPatientLabel")?.value.trim() || "";
      if (!demoSessionController.addPatient(label)) {
        throw new Error("The guided demo is no longer active. Start it again from the sidebar.");
      }
      // The demo swaps its temporary roster for the synthetic patient. Render
      // the destination immediately; otherwise the first click changes only
      // in-memory state and leaves the old roster on screen until a second
      // interaction happens to re-render it.
      demoController.observeAction(action);
      render();
      return;
    }
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
        if (isExpanded) requestAnimationFrame(() => (editor.querySelector("[data-redaction-document]") || editor.querySelector(".section-text"))?.focus());
      }
    }
    if (action === "add-context-section") await mutateSections("context", (sections) => addSection(sections, "Other"));
    if (action === "add-daily-section") await mutateSections("daily", (sections) => addSection(sections, "Other"));
    if (action === "move-section-up") await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "up"));
    if (action === "move-section-down") await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "down"));
    if (action === "remove-section") await mutateSections(target.dataset.scope, (sections) => removeSection(sections, target.dataset.sectionId));
    if (action === "review-section-warning") reviewSectionWarning(target.dataset);
    if (action === "redact-section-warning") redactSectionWarning(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.warningIndex));
    if (action === "dismiss-section-warning") dismissSectionWarning(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.warningIndex));
    if (action === "manual-redact-selection") redactSelectedSectionText(target.dataset.scope, target.dataset.sectionId);
    if (action === "edit-section-text") editSectionText(target.dataset.scope, target.dataset.sectionId);
    if (action === "resume-section-review") resumeSectionReview(target.dataset.scope, target.dataset.sectionId);
    if (action === "inspect-redaction") inspectRedaction(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.redactionIndex));
    if (action === "keep-reviewed-redaction") keepReviewedRedaction(target.dataset.scope, target.dataset.sectionId);
    if (action === "confirm-all-section-redactions") confirmAllSectionRedactions(target.dataset.scope, target.dataset.sectionId);
    if (action === "continue-section-review") advanceSectionReview(target.dataset.scope, target.dataset.sectionId, -1);
    if (action === "reject-all-section-redactions") rejectAllSectionRedactions(target.dataset.scope, target.dataset.sectionId);
    if (action === "allow-reviewed-non-phi") allowReviewedNonPhi(target.dataset.scope, target.dataset.sectionId, Number(target.dataset.redactionIndex));
    if (action === "save-context") await saveContext();
    if (action === "add-day") await addDay();
    if (action === "select-day") {
      app.selectedDayId = target.dataset.dayId;
      render();
    }
    if (action === "save-day") await saveDay();
    if (action === "load-advanced-deid") await loadAdvancedModel();
    if (action === "select-deid-model") selectDeidModel(target.dataset.modelKey);
    if (action === "download-model-pack") await downloadSelectedModelPack(target.dataset.modelKey);
    if (action === "import-model-pack") await chooseModelPack(target.dataset.modelKey);
    if (action === "verify-model-pack") await verifyInstalledModelPack(target.dataset.modelKey);
    if (action === "cancel-model-download") cancelModelPackDownload(target.dataset.modelKey);
    if (action === "remove-model-pack") await removeSelectedModelPack(target.dataset.modelKey);
    if (action === "new-workup") await newWorkup();
    if (action === "edit-workup") editWorkup(target.dataset.workupId);
    if (action === "delete-workup") workupDeleteController.requestDelete(target.dataset.workupId);
    if (action === "confirm-delete-workup") await workupDeleteController.confirmDeletePending();
    if (action === "restore-hidden-workup") await workupDeleteController.restoreHidden(target.dataset.workupId);
    if (action === "add-workup-item") addWorkupItemRow(target.dataset.kind);
    if (action === "remove-workup-item") removeWorkupItemRow(target);
    if (action === "duplicate-workup-item") duplicateWorkupItemRow(target);
    if (action === "move-workup-item") await moveWorkupItemRow(target, target.dataset.direction);
    if (action === "save-workup-ui") await saveWorkupUi();
    if (action === "reset-workup-json") await resetWorkupJson();
    if (action === "export-workup-json") exportWorkupJson();
    if (action === "export-workup-library") exportWorkupLibrary();
    if (action === "parse-workup-json") await parseAndSaveWorkupJson(byId("workupJsonImport")?.value || "");
    if (action === "format-workup-json-api") await workupOpenAiImport.formatWorkupJsonWithSavedKey();
    if (action === "choose-workup-file") byId("workupJsonFileInput").click();
    if (action === "choose-workup-library-file") byId("workupLibraryFileInput").click();
    if (action === "choose-workup-workspace") await chooseWorkupWorkspace();
    if (action === "sync-workup-workspace") await syncWorkupWorkspace({ explicit: true });
    if (action === "disconnect-workup-workspace") await disconnectWorkupWorkspace();
    if (action === "clear-workup-search") {
      app.workupCatalogQuery = "";
      const search = byId("workupCatalogSearch");
      if (search) {
        search.value = "";
        search.focus();
      }
      updateWorkupCatalogFilter();
    }
    if (action === "copy-open-evidence-workup-prompt") await workupOpenAiImport.copyOpenEvidenceWorkupPrompt();
    if (action === "copy-json-formatter-prompt") await workupOpenAiImport.copyJsonFormatterPrompt();
    if (action === "build-checklist") await buildChecklist();
    if (action === "run-openevidence-note-deid") await openEvidenceImport.runLocalDeid();
    if (action === "format-checklist-answers-api") await openEvidenceImport.formatWithSavedKey();
    if (action === "parse-checklist-answers-json") await openEvidenceImport.parseAndApply(byId("openEvidenceImportInput")?.value || "");
    if (action === "copy-checklist-answers-formatter-prompt") await openEvidenceImport.copyFormatterPrompt();
    if (action === "save-openevidence-exam-note") await openEvidenceImport.saveExamNote();
    if (action === "clear-openevidence-exam-note") await openEvidenceImport.clearExamNote();
    if (action === "go-workups") {
      app.view = "workups";
      render();
    }
    if (action === "go-settings") {
      app.view = "settings";
      render();
    }
    if (action === "choose-phone-bundle-file") byId("phoneBundleFileInput")?.click();
    if (action === "share-phone-bundle") await phoneTransfer.shareChecklist();
    if (action === "copy-phone-bundle") await copyText(target.dataset.bundle || byId("phoneBundleText")?.value || "");
    if (action === "download-phone-bundle") phoneTransfer.downloadChecklist();
    if (action === "choose-phone-return-file") byId("phoneReturnFileInput")?.click();
    if (action === "import-phone-return") await importPhoneReturn();
    if (action === "share-phone-return") await phoneTransfer.shareReturn();
    if (action === "download-phone-return") phoneTransfer.downloadReturn();
    if (action === "copy-phone-return") await copyText(byId("phoneReturnBundle")?.value || "");
    if (action === "show-phone-return") showPhoneReturn();
    if (action === "fill-all-negatives") await fillChecklistNegatives();
    if (action === "fill-section-negatives") await fillChecklistNegatives({ kind: target.dataset.kind });
    if (action === "fill-system-negatives") await fillChecklistNegatives({ kind: target.dataset.kind, system: target.dataset.system });
    if (action === "toggle-item-note") toggleItemNote(target, app.checklistOpenNoteIds);
    if (action === "clear-checklist-search") clearChecklistSearch();
    if (action === "add-quick-note") await phoneSession.addQuickNoteText(byId("quickNoteInput")?.value);
    if (action === "delete-quick-note") await phoneSession.deleteQuickNoteById(target.dataset.noteId);
    if (action === "resume-phone-autosave") phoneSession.resumeAutosave();
    if (action === "discard-phone-autosave") phoneSession.discardAutosave();
    if (action === "save-prompt-template") savePromptTemplate();
    if (action === "reset-prompt-template") resetPromptTemplate();
    if (action === "create-prompt-task") promptTaskController.createTaskFromInput();
    if (action === "request-remove-prompt-task") promptTaskController.requestRemove(target.dataset.taskId);
    if (action === "confirm-remove-prompt-task") promptTaskController.confirmRemovePending();
    if (action === "create-guideline-set") guidelineSetsController.createFromInput();
    if (action === "save-guideline-set") guidelineSetsController.saveEdit(target.dataset.guidelineSetId);
    if (action === "request-remove-guideline-set") guidelineSetsController.requestRemove(target.dataset.guidelineSetId);
    if (action === "confirm-remove-guideline-set") guidelineSetsController.confirmRemovePending();
    if (action === "insert-prompt-variable") insertPromptVariable(target.dataset.token);
    if (action === "copy-prompt") { if (app.demoSession) demoController.observeAction(action); await copyText(currentPromptText()); }
    if (action === "open-open-evidence") window.open("https://www.openevidence.com/", "_blank", "noopener,noreferrer");
    if (action === "reset-variable-colors") { app.tokenColorOverrides = {}; saveTokenColorOverrides(app.tokenColorOverrides); renderPrompts(); }
    if (action === "open-token-color-picker") tokenColorPicker.open(target.dataset.token, target, event);
    if (action === "save-team-preferences") await saveTeamPreferences();
    if (action === "save-openai-byok") await saveOpenAiByok();
    if (action === "clear-openai-byok") await clearOpenAiByok();
    if (action === "run-quick-deid") await runQuickDeid();
    if (action === "start-new-quick-deid") {
      clearQuickDeidSession();
      renderQuickDeid();
    }
    if (action === "copy-quick-deid-output") await copyText(app.quickDeid.output || byId("quickDeidOutput")?.value || "");
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
    app.workupImportError = action.includes("workup") ? error.message : app.workupImportError;
    setStatus(app.demoSession && action === "copy-prompt" ? "Prompt ready. Clipboard access may be blocked in this preview; the de-identified prompt remains visible." : error instanceof Error ? error.message : "Something went wrong. Try again.");
    render();
  }
}

async function unlockVault() {
  const passphrase = byId("vaultPassphrase").value;
  if (!passphrase) {
    showVaultUnlockError("Enter the vault passphrase to continue.");
    return;
  }
  if (!readEncryptedVaultRecord() && passphrase.length < 12) {
    showVaultUnlockError("Use a passphrase with at least 12 characters to create this vault.");
    return;
  }
  try {
    const isNewVault = !readEncryptedVaultRecord();
    const vault = await loadOrCreateVault(passphrase);
    app.vault = vault;
    app.passphrase = passphrase;
    app.vaultUnlockError = "";
    app.view = active() ? "daily" : "vault";
    resetVaultInactivityTimer();
    if (shouldStartGuidedDemo({ isNewVault, hasStartedGuidedDemo: currentPreferences().hasStartedGuidedDemo })) {
      setVaultPreferences({ ...currentPreferences(), hasStartedGuidedDemo: true });
      await persistVault();
      demoSessionController.start();
      return;
    }
    setStatus("Vault unlocked.");
    render();
  } catch {
    showVaultUnlockError("Could not unlock this vault. Check the passphrase and try again.");
  }
}

function lockVault(message = "Vault locked.") {
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
    throw new Error('Type DELETE to permanently remove this local vault.');
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
  app.vault = updateOrInitializeVault(createPatientRecord(label));
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
  app.vault = setActivePatient(app.vault, patientId);
  app.view = "daily";
  app.selectedDayId = selectedChecklistDay(active())?.id || "";
  render();
  void persistVault("Patient selected.");
}

async function archiveSelectedPatient(patientId) {
  if (!patientId) return;
  app.vault = archivePatient(app.vault, patientId);
  app.pendingArchivePatientId = "";
  app.selectedDayId = "";
  app.sectionDrafts.clear();
  app.sectionEditingKeys.clear();
  app.pendingSectionReviewFocus = null;
  clearPhiReviews();
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
  byId("archiveConfirmText").textContent = `This permanently removes ${patient.displayLabel} and their saved data from this device. This can't be undone.`;
  byId("archiveConfirmDialog")?.showModal();
}

function requestRemoveDay(dayId) {
  const day = active()?.days?.find((entry) => entry.id === dayId);
  if (!day) return;
  app.pendingRemoveDayId = dayId;
  byId("removeDayConfirmText").textContent = `This permanently removes ${day.label} (${day.date}) and its saved checklist answers from this patient.`;
  byId("removeDayConfirmDialog")?.showModal();
}

async function removeSelectedDay(dayId) {
  const patient = active();
  if (!patient || !dayId) return;
  const remainingDays = removeDay(patient.days, dayId);
  app.selectedDayId = latestDay(remainingDays)?.id || "";
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
  if (documentOwner && documentOwner.scrollHeight > documentOwner.clientHeight && !owners.includes(documentOwner)) owners.push(documentOwner);
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
  owner.scrollTop = Math.max(0, owner.scrollTop + elementRect.top - ownerRect.top - (owner.clientHeight / 2) + (Math.min(elementRect.height, owner.clientHeight) / 2));
}

function refreshSectionReviewInEditor(editor, scope, sectionId) {
  if (!editor) return;
  const field = editor.querySelector(".section-text");
  const text = field ? field.value : sectionDraftText(scope, sectionId);
  setSectionDraftText(scope, sectionId, text);
  const label = editor.querySelector(".section-label")?.value || "Section";
  const surface = editor.querySelector("[data-section-review-surface]");
  const replacement = renderSectionSurface({ id: sectionId, label, deidentifiedText: text }, scope);
  if (surface) surface.outerHTML = replacement;
  else editor.insertAdjacentHTML("beforeend", replacement);
}

function refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, focusRedactionIndex = -1) {
  const scrollSnapshot = captureScrollChain(editor);
  const priorDocument = editor?.querySelector("[data-redaction-document]");
  const documentTop = priorDocument?.scrollTop ?? 0;
  refreshSectionReviewInEditor(editor, scope, sectionId);
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
  const nextPendingInCurrent = pending.find((target) => (
    target.sectionIndex === current.sectionIndex && target.redactionIndex > current.redactionIndex
  ));
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
    field?.focus();
  });
}

function resumeSectionReview(scope, sectionId) {
  const editor = expandSectionEditor(scope, sectionId);
  if (!editor || !sectionReviewFor(scope, sectionId)) return;
  app.sectionEditingKeys.delete(reviewKey(scope, sectionId));
  const review = sectionReviewFor(scope, sectionId);
  if (inspectedRedactionIndex(review) < 0) review.inspectedRedactionIndex = nextPendingRedactionIndex(review);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, review.inspectedRedactionIndex);
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
  setStatus(next ? `Redaction accepted. Reviewing the next change in ${reviewSectionsForScope(scope).find((section) => section.id === next.sectionId)?.label || "the next field"}.` : "All redactions accepted. You can click any highlighted replacement to undo it.");
}

function confirmAllSectionRedactions(scope, sectionId) {
  const review = sectionReviewFor(scope, sectionId);
  if (!review) return;
  const pending = review.redactions.filter((redaction) => redaction.state === "pending");
  pending.forEach((redaction) => { redaction.state = "confirmed"; });
  review.inspectedRedactionIndex = -1;
  const next = pending.length ? advanceSectionReview(scope, sectionId, review.redactions.indexOf(pending[pending.length - 1])) : null;
  setStatus(next ? "Redactions accepted. Reviewing the next field." : pending.length ? `${pending.length} redaction${pending.length === 1 ? "" : "s"} accepted. Click any highlighted replacement to undo it.` : "All redactions were already accepted.");
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
    if (index !== redactionIndex && entry.placeholder === redaction.placeholder && entry.occurrence > redaction.occurrence) entry.occurrence -= 1;
  });
  review.inspectedRedactionIndex = -1;
  const next = advanceSectionReview(scope, sectionId, redactionIndex);
  setStatus(next ? "Marked as non-PHI. Reviewing the next remaining change." : "Marked as non-PHI for the next save. Confirm it is not identifying before saving.");
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
  setStatus(pendingIndexes.length
    ? `${pendingIndexes.length} redaction${pendingIndexes.length === 1 ? "" : "s"} marked as non-PHI. Confirm this before saving.`
    : "All redactions are already decided.");
}

function refreshResidualWarningSummary(scope) {
  const current = byId(`residualWarnings-${scope}`);
  if (!current) return;
  current.outerHTML = renderWarnings(reviewSectionsForScope(scope), scope);
}

function dismissSectionWarning(scope, sectionId, warningIndex) {
  const review = sectionReviewFor(scope, sectionId);
  if (!review?.warnings[warningIndex]) return;
  review.dismissedWarningIndexes.add(warningIndex);
  setStatus("Warning dismissed for this review only. The decision is not stored.");
  const editor = expandSectionEditor(scope, sectionId);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId);
  refreshResidualWarningSummary(scope);
}

function redactSectionWarning(scope, sectionId, warningIndex) {
  const review = sectionReviewFor(scope, sectionId);
  const warning = review?.warnings[warningIndex];
  const editor = expandSectionEditor(scope, sectionId);
  if (!warning || !editor) return;
  const field = editor.querySelector(".section-text");
  const snippet = warningSnippet(warning);
  const position = field?.value?.indexOf(snippet);
  if (!field || !snippet || position < 0) throw new Error("The flagged text is no longer present. Highlight the remaining identifier in the document and redact it manually.");
  const nextText = insertManualRedaction(field.value, review, position, position + snippet.length, "residual PHI review");
  field.value = nextText;
  setSectionDraftText(scope, sectionId, nextText);
  review.dismissedWarningIndexes.add(warningIndex);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId, review.redactions.length - 1);
  refreshResidualWarningSummary(scope);
}

function reviewSectionWarning({ scope, sectionId, warningIndex }) {
  const patient = active();
  const sections = scope === "daily" ? selectedChecklistDay(patient)?.sections : patient?.contextSections;
  const section = (sections || []).find((entry) => entry.id === sectionId);
  const review = sectionReviewFor(scope, sectionId);
  const warning = review?.warnings?.[Number(warningIndex)] || section?.residualWarnings?.[Number(warningIndex)];
  const editor = expandSectionEditor(scope, sectionId);
  if (!section || !editor) return;
  const snippet = warningSnippet(warning);
  const matchingRedactionIndex = (review?.redactions || []).findIndex((redaction) => (
    redaction.state !== "restored" && snippet && String(redaction.original || "").includes(snippet)
  ));
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
  setStatus(didSelect ? "Flagged text selected for manual review." : "Opened the flagged field. The detailed flag is no longer available in this review session.");
}

function reviewQuickWarning(warningIndex) {
  const warning = app.quickDeid.review?.warnings?.[warningIndex] || app.quickDeid.warnings?.[warningIndex];
  if (app.quickDeid.review?.warnings?.[warningIndex]) app.quickDeid.review.activeWarningIndex = warningIndex;
  const snippet = warningSnippet(warning);
  const documentElement = byId("quickDeidReviewDocument");
  const centered = centerTextSnippetInDocument(documentElement, snippet);
  setStatus(centered ? "Flagged text centered for manual review." : "The flagged text is not currently visible. Highlight any remaining identifier in the document to redact it.");
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
    const target = documentElement.scrollTop + (changeRect.top - documentRect.top) - (documentElement.clientHeight / 2) + (changeRect.height / 2);
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
        documentElement.scrollTop = Math.max(0, documentElement.scrollTop + rect.top - documentRect.top - (documentElement.clientHeight / 2) + (rect.height / 2));
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
  const focusIndex = Number.isFinite(focusRedactionIndex)
    ? focusRedactionIndex
    : quickSelectedRedactionIndex(app.quickDeid.review);
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
  if (!documentElement || !selection || selection.rangeCount === 0 || selection.isCollapsed || !documentElement.contains(selection.anchorNode) || !documentElement.contains(selection.focusNode)) {
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
  setStatus(review.inspectedRedactionIndex >= 0
    ? "Redaction confirmed. Moved to the next unconfirmed item."
    : "All redactions confirmed. Review any remaining residual flags.");
  renderQuickReviewAtCurrentPosition();
}

function confirmAllQuickRedactions() {
  const review = app.quickDeid.review;
  if (!review) return;
  const confirmed = review.redactions.filter((redaction) => redaction.state === "pending");
  confirmed.forEach((redaction) => { redaction.state = "confirmed"; });
  review.inspectedRedactionIndex = -1;
  setStatus(confirmed.length
    ? `${confirmed.length} redaction${confirmed.length === 1 ? "" : "s"} confirmed. Review any remaining residual flags.`
    : "All redactions are already confirmed.");
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
    if (index !== redactionIndex && entry.placeholder === redaction.placeholder && entry.occurrence > redaction.occurrence) entry.occurrence -= 1;
  });
  review.inspectedRedactionIndex = quickRedactionIndex(review, redactionIndex);
  setStatus(review.inspectedRedactionIndex >= 0
    ? "Restored as non-PHI. Moved to the next unconfirmed item."
    : "Restored as non-PHI. Review any remaining residual flags.");
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
  setStatus(pendingIndexes.length
    ? `${pendingIndexes.length} redaction${pendingIndexes.length === 1 ? "" : "s"} marked as non-PHI. Confirm this before saving.`
    : "All redactions are already decided.");
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
  setStatus(review.activeWarningIndex >= 0
    ? "Flag marked not PHI. Moved to the next remaining flag."
    : "Residual PHI review complete for this Quick De-ID session.");
  renderQuickReviewAtCurrentPosition();
}

function redactQuickWarning(warningIndex) {
  const review = app.quickDeid.review;
  const warning = review?.warnings?.[warningIndex];
  if (!review || !warning) return;
  const snippet = warningSnippet(warning);
  const position = app.quickDeid.output.indexOf(snippet);
  if (position < 0 || !snippet) throw new Error("The flagged text is no longer present. Highlight the remaining identifier in the document and redact it manually.");
  app.quickDeid.output = insertManualRedaction(app.quickDeid.output, review, position, position + snippet.length, "residual PHI review");
  review.dismissedWarningIndexes.add(warningIndex);
  const activeWarnings = review.warnings
    .map((entry, index) => ({ warning: entry, index }))
    .filter(({ index }) => !review.dismissedWarningIndexes.has(index));
  review.activeWarningIndex = quickWarningIndex(review, activeWarnings, warningIndex);
  setStatus(review.activeWarningIndex >= 0
    ? "Flag redacted. Moved to the next remaining flag."
    : "Flag redacted. Residual PHI review is complete.");
  renderQuickReviewAtCurrentPosition();
}

function exportVault() {
  const record = readEncryptedVaultRecord();
  if (!record) throw new Error("No encrypted vault exists on this device.");
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
    const day = selectedChecklistDay(patient);
    if (!day) throw new Error("Add a hospital day first.");
    const nextDay = { ...day, sections: updater(day.sections), updatedAt: new Date().toISOString() };
    app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  }
  await persistVault("Section updated.");
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

async function deidentifySectionRows(scope, containerId, priorSections = []) {
  const rows = collectSectionRows(containerId);
  const retainedIds = new Set(rows.map((row) => row.id));
  for (const key of [...app.phiReviews.keys()]) {
    if (key.startsWith(`${scope}:`) && !retainedIds.has(key.slice(scope.length + 1))) app.phiReviews.delete(key);
  }
  const sections = await replaceSectionsFromFormAsync(rows, deidentify, {
    priorSections,
    onResult: ({ row, result, prior, plan }) => {
      const key = reviewKey(scope, row.id);
      const existing = app.phiReviews.get(key);
      if (existing?.approvedRedactionIndexes?.size) return;
      // Unchanged fields weren't reprocessed - leave whatever review (or lack
      // of one) already existed for them alone rather than resetting it.
      if (plan.mode === "unchanged") return;
      if (plan.mode === "append") {
        app.phiReviews.set(key, createEphemeralRedactionReview(plan.suffix, result.suffixResult || {}, { priorOutputText: prior?.deidentifiedText || "" }));
      } else {
        app.phiReviews.set(key, createEphemeralRedactionReview(row.text, result));
      }
    },
    onProgress: ({ completed, total }) => updateDeidOperation({
      active: true,
      value: completed,
      total,
      message: completed ? `De-identified ${completed} of ${total} fields locally.` : `Preparing ${total} field${total === 1 ? "" : "s"} for local de-identification…`
    })
  });
  return applyApprovedRedactions(scope, sections);
}

async function saveContext() {
  updateDeidOperation({ active: true, message: "Preparing admission fields for local de-identification…", value: 0, total: 1 });
  try {
    await ensureSelectedDeidReady();
    const sections = await deidentifySectionRows("context", "contextSections", active()?.contextSections || []);
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
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, day) }));
  await persistVault("Hospital day added.");
  render();
}

async function saveDay() {
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day) throw new Error("Add a hospital day first.");
  updateDeidOperation({ active: true, message: "Preparing daily fields for local de-identification…", value: 0, total: 1 });
  try {
    await ensureSelectedDeidReady();
    const sections = await deidentifySectionRows("daily", "dailySections", day.sections || []);
    const nextDay = { ...day, sections, updatedAt: new Date().toISOString() };
    app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
    beginSectionReview("daily");
    await persistVault("Daily update saved as de-identified local text.");
    updateDeidOperation({ active: false, message: "Hospital day de-identified and saved locally." });
    render();
  } catch (error) {
    updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
    throw error;
  }
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
      onProgress: ({ completedBytes, totalBytes, file }) => setStatus(`Importing ${option.label}: ${file} (${formatBytes(completedBytes)} of ${formatBytes(totalBytes)})...`)
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
  const blocker = crossOriginIsolationBlocker() || await webGpuRuntimeBlocker(option);
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
    if (!persistent) setStatus("The browser did not grant persistent storage. The model remains local, but the browser may evict it when space is low.");
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
    const message = cancelled
      ? `${option.label} download paused. Resume whenever you are ready.`
      : modelPackFailureMessage(option, error);
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
  const blocker = crossOriginIsolationBlocker() || await webGpuRuntimeBlocker(option);
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

async function refreshWorkupWorkspace({ renderAfter = false } = {}) {
  app.workupWorkspace = await getWorkupWorkspaceMirrorState();
  if (renderAfter && app.view === "workups") renderWorkups();
  return app.workupWorkspace;
}

async function syncWorkupWorkspace({ explicit = false } = {}) {
  if (!app.vault) return null;
  app.workupWorkspaceBusy = true;
  if (explicit && app.view === "workups") renderWorkups();
  try {
    const result = await mirrorWorkupOverridesToWorkspace(app.vault.workupOverrides, { requestPermission: false });
    app.workupWorkspace = result;
    if (explicit) setStatus(result.status === "ready" ? `${result.message} Files are in ${result.path}/.` : result.message);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to mirror local workups.";
    app.workupWorkspace = { status: "error", message };
    if (explicit) setStatus(message);
    return app.workupWorkspace;
  } finally {
    app.workupWorkspaceBusy = false;
    if (explicit && app.view === "workups") renderWorkups();
  }
}

async function chooseWorkupWorkspace() {
  app.workupWorkspaceBusy = true;
  renderWorkups();
  try {
    app.workupWorkspace = await authorizeWorkupWorkspaceMirror();
    const result = await syncWorkupWorkspace();
    setStatus(result?.status === "ready" ? `${result.message} Files are in ${result.path}/.` : app.workupWorkspace.message);
  } finally {
    app.workupWorkspaceBusy = false;
    renderWorkups();
  }
}

async function disconnectWorkupWorkspace() {
  app.workupWorkspace = await disconnectWorkupWorkspaceMirror();
  setStatus(app.workupWorkspace.message);
  renderWorkups();
}

async function persistWorkupChanges(message) {
  await persistVault(message);
  if (app.demoSession) return;
  const result = await syncWorkupWorkspace();
  if (result?.status === "ready") setStatus(`${message} ${result.message}`);
}

async function commitWorkupOverride(workup, message) {
  app.vault = setWorkupOverride(app.vault, workup);
  await persistWorkupChanges(message);
}

function isWorkupEditorControl(target) {
  return Boolean(target?.closest?.("#workupsContent") && target.matches?.("#workupTitleInput, #workupAliasesInput, [data-workup-item-row] input, [data-workup-item-row] textarea, [data-workup-item-row] select"));
}

function queueWorkupAutosave() {
  clearTimeout(workupAutosaveTimer);
  workupAutosaveTimer = setTimeout(() => {
    workupAutosaveChain = workupAutosaveChain
      .then(async () => {
        const workup = workupFromEditorDraft(collectWorkupDraftFromDocument(document));
        await commitWorkupOverride(workup, "Workup changes saved locally.");
        app.selectedWorkupEditorId = workup.id;
        app.draftWorkup = null;
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to automatically save this workup."));
  }, 700);
}

async function newWorkup() {
  const usedIds = new Set(effectiveWorkupCatalog(app.vault.workupOverrides).map((entry) => entry.id));
  let ordinal = 1;
  let id = "new-workup";
  while (usedIds.has(id)) {
    ordinal += 1;
    id = `new-workup-${ordinal}`;
  }
  const workup = createBlankWorkup({ id, title: ordinal === 1 ? "New Workup" : `New Workup ${ordinal}` });
  await commitWorkupOverride(workup, "New workup saved locally.");
  app.selectedWorkupEditorId = workup.id;
  app.draftWorkup = null;
  app.workupImportError = "";
  renderWorkups();
}

function editWorkup(workupId) {
  app.draftWorkup = null;
  app.selectedWorkupEditorId = workupId;
  app.workupImportError = "";
  renderWorkups();
}

function addWorkupItemRow(kind) {
  const column = document.querySelector(`[data-workup-kind="${kind}"] .list-stack`);
  if (!column) return;
  column.insertAdjacentHTML("beforeend", renderWorkupItemEditor(createBlankWorkupItem(kind), kind, column.children.length));
  updateWorkupRowNumbers(column);
}

function removeWorkupItemRow(target) {
  target.closest("[data-workup-item-row]")?.remove();
}

function duplicateWorkupItemRow(target) {
  const row = target.closest("[data-workup-item-row]");
  if (!row) return;
  row.insertAdjacentHTML("afterend", row.outerHTML);
  updateWorkupRowNumbers(row.parentElement);
}

async function moveWorkupItemRow(target, direction) {
  const row = target.closest("[data-workup-item-row]");
  const list = row?.parentElement;
  if (!row || !list) return;
  const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
  if (sibling?.matches("[data-workup-item-row]")) {
    if (direction === "up") list.insertBefore(row, sibling);
    else list.insertBefore(sibling, row);
  } else {
    const group = row.closest(".workup-system-group");
    const scroll = group?.parentElement;
    const adjacent = direction === "up" ? group?.previousElementSibling : group?.nextElementSibling;
    if (!group || !scroll || !adjacent?.matches(".workup-system-group")) return;
    if (direction === "up") scroll.insertBefore(group, adjacent);
    else scroll.insertBefore(adjacent, group);
  }
  updateWorkupRowNumbers(list);
  await saveWorkupUi("Workup item order saved.");
}

function updateWorkupRowNumbers(list) {
  const column = list?.closest("[data-workup-kind]");
  [...(column?.querySelectorAll("[data-workup-item-row]") || [])].forEach((row, index) => {
    const number = row.querySelector(".workup-row-number");
    if (number) number.textContent = String(index + 1);
  });
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
  const list = target?.closest("#contextSections, #dailySections");
  const sourceList = row.closest("#contextSections, #dailySections");
  if (!list || list !== sourceList) return false;
  const dropTarget = sectionDropTarget(list, clientY);
  if (dropTarget) list.insertBefore(row, dropTarget);
  else list.append(row);
  return true;
}

async function saveSectionOrderFromDocument(scope) {
  const containerId = scope === "daily" ? "dailySections" : "contextSections";
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
  const lists = [...document.querySelectorAll("#contextSections, #dailySections")];
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
      if (!draggedSectionRow || list !== draggedSectionRow.closest("#contextSections, #dailySections")) return;
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

function workupDropTarget(list, pointerY) {
  const rows = [...list.querySelectorAll("[data-workup-item-row]:not(.is-dragging)")];
  return rows.reduce(
    (closest, row) => {
      const rect = row.getBoundingClientRect();
      const offset = pointerY - rect.top - rect.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, row } : closest;
    },
    { offset: Number.NEGATIVE_INFINITY, row: null }
  ).row;
}

function reorderWorkupRowAtPointer(row, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const list = target?.closest("[data-workup-kind] .list-stack");
  const sourceList = row.parentElement;
  if (!list || row.dataset.kind !== list.closest("[data-workup-kind]")?.dataset.workupKind) return false;
  if (sourceList !== list) {
    const sourceGroup = row.closest(".workup-system-group");
    const targetGroup = list.closest(".workup-system-group");
    if (!sourceGroup || !targetGroup) return false;
    const dropTarget = workupDropTarget(list, clientY);
    if (dropTarget) list.insertBefore(row, dropTarget);
    else list.append(row);
    const targetSystem = targetGroup.dataset.workupSystem || "general";
    const systemField = row.querySelector('[data-field="item-system"]');
    if (systemField) systemField.value = targetSystem;
    if (!sourceList.querySelector("[data-workup-item-row]")) sourceGroup.remove();
    updateWorkupRowNumbers(list);
    updateWorkupRowNumbers(sourceList);
    return true;
  }
  const dropTarget = workupDropTarget(list, clientY);
  if (dropTarget) list.insertBefore(row, dropTarget);
  else list.append(row);
  updateWorkupRowNumbers(list);
  return true;
}

function startPointerWorkupReorder(event, handle, lists) {
  if (event.button !== 0) return;
  const row = handle.closest("[data-workup-item-row]");
  if (!row) return;
  event.preventDefault();
  draggedWorkupRow = row;
  workupDragSaved = false;
  let moved = false;
  row.classList.add("is-dragging");
  const onMove = (moveEvent) => {
    moved = reorderWorkupRowAtPointer(row, moveEvent.clientX, moveEvent.clientY) || moved;
  };
  const onEnd = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onEnd);
    if (moved && !workupDragSaved) {
      workupDragSaved = true;
      void saveWorkupUi("Workup item order saved.").catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to save workup order.");
        renderWorkups();
      });
    }
    row.classList.remove("is-dragging");
    if (draggedWorkupRow === row) draggedWorkupRow = null;
    lists.forEach((list) => list.classList.remove("is-drop-target"));
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd, { once: true });
}

function bindWorkupReordering() {
  const lists = [...document.querySelectorAll("[data-workup-kind] .list-stack")];
  document.querySelectorAll(".workup-drag-handle").forEach((handle) => {
    handle.addEventListener("mousedown", (event) => startPointerWorkupReorder(event, handle, lists));
    handle.addEventListener("dragstart", (event) => {
      draggedWorkupRow = handle.closest("[data-workup-item-row]");
      if (!draggedWorkupRow) return;
      workupDragSaved = false;
      draggedWorkupRow.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedWorkupRow.dataset.kind || "");
    });
    handle.addEventListener("dragend", () => {
      if (draggedWorkupRow && !workupDragSaved) {
        workupDragSaved = true;
        void saveWorkupUi("Workup item order saved.").catch((error) => {
          setStatus(error instanceof Error ? error.message : "Unable to save workup order.");
          renderWorkups();
        });
      }
      draggedWorkupRow?.classList.remove("is-dragging");
      draggedWorkupRow = null;
      lists.forEach((list) => list.classList.remove("is-drop-target"));
    });
  });
  lists.forEach((list) => {
    list.addEventListener("dragover", (event) => {
      if (!draggedWorkupRow || draggedWorkupRow.dataset.kind !== list.closest("[data-workup-kind]")?.dataset.workupKind) return;
      event.preventDefault();
      list.classList.add("is-drop-target");
      reorderWorkupRowAtPointer(draggedWorkupRow, event.clientX, event.clientY);
    });
    list.addEventListener("drop", (event) => {
      if (!draggedWorkupRow) return;
      event.preventDefault();
      workupDragSaved = true;
      void saveWorkupUi("Workup item order saved.").catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to save workup order.");
        renderWorkups();
      });
    });
  });
}

async function saveWorkupUi(message = "Local workup saved.") {
  const workup = workupFromEditorDraft(collectWorkupDraftFromDocument(document));
  clearTimeout(workupAutosaveTimer);
  await commitWorkupOverride(workup, message);
  app.selectedWorkupEditorId = workup.id;
  app.draftWorkup = null;
  app.workupImportError = "";
  render();
}

async function resetWorkupJson() {
  app.vault = removeWorkupOverride(app.vault, app.selectedWorkupEditorId);
  app.draftWorkup = null;
  await persistWorkupChanges("Local workup override removed. Existing workspace-mirror files are intentionally left untouched.");
  render();
}

function currentEditorWorkup() {
  return workupFromEditorDraft(collectWorkupDraftFromDocument(document));
}

function exportWorkupJson() {
  const workup = currentEditorWorkup();
  downloadJson(`${workup.id}.workup.json`, workup);
}

function exportWorkupLibrary() {
  const library = workupLibraryFromOverrides(app.vault.workupOverrides, {
    id: "local-workups",
    title: "Local workup library",
    description: "Local workups exported from Preround. This bundle contains no patient data."
  });
  downloadJson(`${library.id}.workup-library.json`, library);
}

async function parseAndSaveWorkupJson(text) {
  const imported = parseWorkupJson(text);
  const current = app.draftWorkup || effectiveWorkupCatalog(app.vault.workupOverrides).find((workup) => workup.id === app.selectedWorkupEditorId);
  // Importing from an open editor means "replace this workup". Incoming IDs
  // are useful for a new workup, but must not create a duplicate copy of the
  // catalog entry the user is actively editing.
  const workup = normalizeWorkup({
    ...imported,
    id: current?.id || imported.id
  });
  await commitWorkupOverride(workup, `Imported JSON replaced ${current?.title || workup.title}.`);
  app.selectedWorkupEditorId = workup.id;
  app.draftWorkup = null;
  app.workupImportError = "";
  app.workupImportDraft = "";
  app.workupApiDeidConfirmed = false;
  app.workupImportPanelOpen = false;
  render();
}

async function importWorkupFile(file) {
  await parseAndSaveWorkupJson(await file.text());
}

async function importWorkupLibraryFile(file) {
  const library = parseWorkupLibraryJson(await file.text());
  app.vault = setWorkupOverrides(app.vault, mergeWorkupLibraryIntoOverrides(app.vault.workupOverrides, library));
  app.selectedWorkupEditorId = library.workups[0].id;
  app.draftWorkup = null;
  app.workupImportError = "";
  await persistWorkupChanges(`Imported ${library.workups.length} workups from ${library.title}.`);
  render();
}

async function buildChecklist() {
  const patient = active();
  if (!patient || !app.vault) throw new Error("Select a patient first.");
  const catalog = effectiveWorkupCatalog(app.vault.workupOverrides, app.vault.hiddenWorkupIds);
  const workups = findWorkupsById(catalog, app.vault.selectedWorkupIds);
  if (!workups.length) throw new Error("Select at least one workup.");
  const day = latestDay(patient.days) || createDailyRecord();
  const snapshot = createChecklistSnapshot(workups);
  const nextDay = {
    ...day,
    checklistSnapshot: snapshot,
    answers: app.demoSession ? createDemoChecklistAnswers(snapshot) : emptyChecklistAnswers(snapshot),
    quickNotes: day.quickNotes || emptyQuickNotes(),
    updatedAt: new Date().toISOString()
  };
  app.selectedDayId = nextDay.id;
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  app.view = "checklist";
  await persistVault("Checklist built.");
  render();
}

async function importPhoneReturnBundle(bundle) {
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day?.checklistSnapshot) throw new Error("Build a checklist first.");
  const answers = mergeReturnedAnswers(day.answers || {}, bundle, day.checklistSnapshot);
  const quickNotes = mergeQuickNotes(day.quickNotes || [], bundle.quickNotes || []);
  const nextDay = { ...day, answers, quickNotes, updatedAt: new Date().toISOString() };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault("Returned phone answers imported.");
  render();
}

async function importPhoneReturn() {
  try {
    await importPhoneReturnBundle(decodeChecklistReturnInput(byId("phoneReturnText").value));
  } catch (error) {
    console.error("IMPORT ERROR:", error);
    throw error;
  }
}

async function importPhoneReturnFile(file) {
  await importPhoneReturnBundle(decodeChecklistReturnTransferFile(await file.text()));
}

async function importPhoneBundleFile(file) {
  phoneSession.enterPhoneMode(decodePhoneChecklistTransferFile(await file.text()));
  render();
}

function savePromptTemplate() {
  const value = byId("promptPreview")?.value || "";
  app.promptTemplates = { ...app.promptTemplates, [app.selectedPromptTask]: value };
  delete app.promptDrafts[app.selectedPromptTask];
  savePromptTemplateOverrides(app.promptTemplates);
  app.smartMenuOpen = false;
  setStatus("Prompt saved locally.");
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
  const start = editor.selectionStart || editor.value.length;
  const end = editor.selectionEnd || start;
  const prefix = editor.value.slice(0, start).replace(/@[^@\s]*$/, "");
  const suffix = editor.value.slice(end);
  editor.value = `${prefix}${token}${suffix}`;
  app.promptDrafts[app.selectedPromptTask] = editor.value;
  app.smartMenuOpen = false;
  editor.focus();
  renderPrompts();
}

async function runQuickDeid() {
  app.quickDeid.input = byId("quickDeidInput")?.value || "";
  app.deidMode = byId("quickDeidMode")?.value || app.deidMode;
  app.quickDeid.status = "Running de-identification...";
  app.quickDeidBusy = true;
  renderQuickDeid();
  try {
    await ensureSelectedDeidReady();
    const result = await deidentify(app.quickDeid.input);
    app.quickDeid = {
      input: app.quickDeid.input,
      output: result.text || "",
      warnings: result.residualWarnings || result.flags || [],
      status: result.modelId ? `Model used: ${result.modelId}` : result.modelStatus || "Structured redaction complete.",
      review: createEphemeralRedactionReview(app.quickDeid.input, result)
    };
    setStatus("Quick de-identification complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "De-identification failed.";
    app.quickDeid = {
      input: app.quickDeid.input,
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

function handleChange(event) {
  if (event.target.matches(".workup-checkbox")) {
    const checkedIds = [...document.querySelectorAll(".workup-checkbox:checked")].map((input) => input.value);
    app.vault = setSelectedWorkups(app.vault, checkedIds);
    app.workupCatalogOpen = true;
    void persistVault("Selected workups updated.").then(renderWorkups);
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
    app.promptDayFollowsChecklist = event.target.value === app.selectedDayId;
    app.smartMenuOpen = false;
    renderPrompts();
  }
  if (event.target.id === "workupEditorSelect") {
    app.draftWorkup = null;
    app.selectedWorkupEditorId = event.target.value;
    app.workupCatalogOpen = true;
    renderWorkups();
  }
  if (event.target.id === "workupThoroughness") {
    app.workupThoroughness = workupThoroughnessOption(event.target.value);
    renderWorkups();
  }
  if (event.target.id === "workupApiDeidConfirmed") {
    app.workupApiDeidConfirmed = event.target.checked;
    app.workupImportPanelOpen = true;
    renderWorkups();
  }
  if (event.target.id === "openEvidenceDeidConfirmed") {
    app.openEvidenceImport.deidConfirmed = event.target.checked;
    renderChecklist();
  }
  if (isWorkupEditorControl(event.target)) queueWorkupAutosave();
  if (event.target.id === "settingsMedicalService") {
    const customServiceWrap = byId("settingsCustomServiceWrap");
    if (customServiceWrap) customServiceWrap.hidden = event.target.value !== "other";
  }
  if (event.target.id === "deidModeSelect" || event.target.id === "quickDeidMode") {
    app.deidMode = event.target.value;
    app.quickDeid.status = "";
    renderStatusBar();
    if (app.view === "daily") refreshDeidControlsInActiveView();
    if (app.view === "quickDeid") renderQuickDeid();
  }
  if (event.target.id === "quickDeidAdmissionDateInput" || event.target.id === "dailyAdmissionDateInput") {
    app.admissionDate = event.target.value;
    if (app.view === "daily") refreshDeidControlsInActiveView();
    if (app.view === "quickDeid") renderQuickDeid();
  }
  if (event.target.classList.contains("checklist-answer")) {
    void updateChecklistAnswer(event.target);
  }
  if (event.target.id === "restoreVaultInput" && event.target.files?.[0]) {
    void restoreVault(event.target.files[0]);
  }
  if (event.target.id === "workupJsonFileInput" && event.target.files?.[0]) {
    void importWorkupFile(event.target.files[0]);
  }
  if (event.target.id === "workupLibraryFileInput" && event.target.files?.[0]) {
    void importWorkupLibraryFile(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.id === "phoneBundleFileInput" && event.target.files?.[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    void importPhoneBundleFile(file).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Unable to open the phone checklist file.");
      render();
    });
  }
  if (event.target.id === "phoneReturnFileInput" && event.target.files?.[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    void importPhoneReturnFile(file).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Unable to import the returned checklist file.");
      render();
    });
  }
  if (event.target.id === "modelPackFolderInput" && event.target.files?.length && app.pendingModelPackKey) {
    void importSelectedModelPack(app.pendingModelPackKey, modelFilesFromInput(event.target.files));
    event.target.value = "";
  }
  demoController.observeChange(event.target);
}

async function updateChecklistAnswer(input) {
  if (app.phoneBundle) {
    const item = app.phoneBundle.checklist.items.find((entry) => entry.id === input.name);
    app.phoneAnswers = setChecklistChoice(app.phoneAnswers, item, input.value, input.tagName === "SELECT" ? Boolean(input.value) : input.checked);
    phoneSession.saveAutosave();
    renderPhoneChecklist();
    return;
  }
  const patient = active();
  const day = selectedChecklistDay(patient);
  const item = day?.checklistSnapshot?.items.find((entry) => entry.id === input.name);
  if (!item) return;
  const answers = setChecklistChoice(day.answers || {}, item, input.value, input.tagName === "SELECT" ? Boolean(input.value) : input.checked);
  const nextDay = { ...day, answers, updatedAt: new Date().toISOString() };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault("Checklist answer saved.");
  renderChecklist();
}

async function fillChecklistNegatives({ kind = "", system = "" } = {}) {
  const snapshot = app.phoneBundle ? app.phoneBundle.checklist : selectedChecklistDay(active())?.checklistSnapshot;
  const allItems = snapshot?.items || [];
  const scopedItems = allItems.filter((item) => (!kind || item.kind === kind) && (!system || groupChecklistItemsBySystem([item])[0]?.system === system));
  const currentAnswers = app.phoneBundle ? app.phoneAnswers : selectedChecklistDay(active())?.answers || {};
  const result = fillNegativeChecklistAnswers(currentAnswers, scopedItems);
  if (!result.changed) {
    setStatus("No unanswered selectable items were available to fill.");
    return;
  }
  if (app.phoneBundle) {
    app.phoneAnswers = result.answers;
    phoneSession.saveAutosave();
    renderPhoneChecklist();
    return;
  }
  const patient = active();
  const day = selectedChecklistDay(patient);
  const nextDay = { ...day, answers: result.answers, updatedAt: new Date().toISOString() };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault(`${result.changed} checklist item${result.changed === 1 ? "" : "s"} filled.`);
  renderChecklist();
}

function showPhoneReturn() {
  const snapshot = app.phoneBundle?.checklist;
  const total = snapshot?.items?.length || 0;
  if (!total || checklistPresentation.completedCount(snapshot.items, app.phoneAnswers) !== total) {
    throw new Error("Finish every history and physical exam item before generating the return code.");
  }
  app.phoneReturnReady = true;
  renderPhoneChecklist();
}

function clearChecklistSearch() {
  app.checklistSearchQuery = "";
  checklistSearch.clear();
}

function handleInput(event) {
  if (event.target.id === "vaultPassphrase") {
    clearVaultUnlockError();
    updateVaultPassphraseStrength(event.target.value);
    return;
  }
  if (event.target.id === "deleteVaultConfirmation") {
    const confirmButton = byId("confirmDeleteVaultButton");
    if (confirmButton) confirmButton.disabled = event.target.value.trim() !== "DELETE";
    return;
  }
  if (event.target.id === "workupJsonImport") {
    app.workupImportDraft = event.target.value;
    return;
  }
  if (event.target.id === "workupCatalogSearch") {
    app.workupCatalogQuery = event.target.value;
    updateWorkupCatalogFilter();
    return;
  }
  if (event.target.matches(".section-editor .section-text")) {
    const editor = event.target.closest(".section-editor");
    const scope = editor?.dataset.sectionScope || "context";
    const sectionId = editor?.dataset.sectionId || "";
    if (sectionId) setSectionDraftText(scope, sectionId, event.target.value);
    return;
  }
  if (isWorkupEditorControl(event.target)) {
    queueWorkupAutosave();
    return;
  }
  if (event.target.id === "promptPreview") {
    const beforeCursor = event.target.value.slice(0, event.target.selectionStart || event.target.value.length);
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
  if (event.target.id === "quickDeidInput") {
    app.quickDeid.input = event.target.value;
    return;
  }
  if (event.target.id === "quickDeidOutput") {
    app.quickDeid.output = event.target.value;
    return;
  }
  if (event.target.id === "checklistSearchInput") {
    app.checklistSearchQuery = event.target.value;
    checklistSearch.updateFilter(app.checklistSearchQuery);
    return;
  }
  if (!event.target.classList.contains("item-note-input")) return;
  const itemId = event.target.closest(".checklist-item")?.dataset.itemId;
  if (!itemId) return;
  if (app.phoneBundle) {
    app.phoneAnswers = setChecklistNote(app.phoneAnswers, itemId, event.target.value);
    phoneSession.saveAutosave();
    const returnBundle = byId("phoneReturnBundle");
    if (returnBundle) returnBundle.value = phoneTransfer.currentReturnCode();
    return;
  }
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day) return;
  const nextDay = {
    ...day,
    answers: setChecklistNote(day.answers || {}, itemId, event.target.value),
    updatedAt: new Date().toISOString()
  };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  void persistVault("Checklist note saved.");
}

function handleToggle(event) {
  if (event.target.matches?.(".workup-catalog-menu")) {
    // The catalog is a persistent desktop rail in the concept; keep the
    // existing details/summary contract for keyboard and test compatibility.
    event.target.open = true;
    app.workupCatalogOpen = true;
  }
  if (event.target.matches?.(".workup-import")) {
    app.workupImportPanelOpen = event.target.open;
  }
}

function bindEvents() {
  decorateNavigation();
  tokenColorPicker.init();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("toggle", handleToggle, true);
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, recordVaultActivity, { passive: true });
  });
  // Enter submits a quick note without needing the on-screen keyboard's
  // return key to double as a form submit.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "quickNoteInput") {
      event.preventDefault();
      void phoneSession.addQuickNoteText(event.target.value);
    }
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!vaultIsUnlocked() && button.dataset.viewTarget !== "vault") {
        app.view = "vault";
        setStatus("Unlock the local vault before opening workspace tools.");
        render();
        return;
      }
      if (app.demoSession && !["daily", "workups", "checklist", "prompts"].includes(button.dataset.viewTarget)) demoSessionController.exit({ renderAfter: false });
      app.view = button.dataset.viewTarget;
      app.smartMenuOpen = false;
      render();
      demoController.observeNavigation(app.view);
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
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.has("phone")) {
    phoneSession.enterPhoneMode(decodePhoneChecklistBundle(params.get("phone")));
  }
  await ensureCrossOriginIsolationOnce();
  bindEvents();
  render();
  void refreshWebGpuAvailability();
  void refreshGuidelines();
  void ensureModelPackServiceWorker().then((service) => {
    app.modelPackService = service;
    if (app.view === "quickDeid") renderQuickDeid();
  }).catch((error) => {
    app.modelPackService = { ready: false, message: error instanceof Error ? error.message : "Local model installer unavailable." };
  });
  void refreshModelPackStates();
  void refreshWorkupWorkspace({ renderAfter: true });
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
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter(),
      new Promise((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
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
  app.guidelineSets = await ensureAdditionalGuidelineSets(app.guidelineSets);
  app.guidelineSets = await ensureConsultingGuidelineSet(app.guidelineSets);
  app.guidelineSets = ensureBuiltInPromptInstructionSets(app.guidelineSets);
  renderPrompts();
}
