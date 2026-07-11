import { createDailyRecord, latestDay, localCalendarDate, removeDay, sortDays, upsertDay, buildTrajectoryBlock } from "../daily-updates/days.js?v=20260711-functional-remediation-15";
import { activePatient, archivePatient, createPatientRecord, removeWorkupOverride, setActivePatient, setSelectedWorkups, setWorkupOverride, setWorkupOverrides, updateActivePatient } from "../app/state/vault.js?v=20260711-functional-remediation-15";
import { deleteEncryptedVaultRecord, downloadJson, loadOrCreateVault, readEncryptedVaultRecord, saveEncryptedVault, writeEncryptedVaultRecord } from "../app/state/persistence.js?v=20260711-functional-remediation-15";
import { authorizeWorkupWorkspaceMirror, disconnectWorkupWorkspaceMirror, getWorkupWorkspaceMirrorState, mirrorWorkupOverridesToWorkspace } from "../app/state/workspace-mirror.js?v=20260711-functional-remediation-15";
import { addSection, removeSection, reorderSections, reorderSectionsById, replaceSectionsFromFormAsync, sectionWarningSummary, sectionsToPromptBlock } from "../patient-context/sections.js?v=20260711-functional-remediation-15";
import { createEphemeralRedactionReview, nextPendingReviewTarget, pendingReviewTargets, reviewKey, synchronizeReviewPlaceholders } from "../patient-context/review.js?v=20260711-functional-remediation-15";
import { deidentifyText, getAdvancedDeidStatus, getSelectedDeidModelStatus, preloadAdvancedDeidModel, resetAdvancedDeidWorker, verifyAdvancedDeidModel } from "../patient-context/deid-client.js?v=20260711-functional-remediation-15";
import { DEFAULT_DEID_MODEL_KEY, DEID_MODEL_OPTIONS, STRUCTURED_DEID_MODE, deidModelOptionByKey } from "../patient-context/deid-model-options.js?v=20260711-functional-remediation-15";
import { canAutomaticallyInstallModel, ensureModelPackServiceWorker, getModelPackState, importModelPack, installModelPack, markModelPackVerified, modelFilesFromDirectoryHandle, modelFilesFromInput, removeModelPack, requestPersistentModelStorage } from "../patient-context/model-pack-storage.js?v=20260711-functional-remediation-15";
import { formatBytes, hasAutomaticModelDownload, isInstallableModel, modelDownloadBytes } from "../patient-context/model-packs.js?v=20260711-functional-remediation-15";
import { buildCustomOpenEvidencePrompt, loadPromptTemplateOverrides, promptTemplateForTask, promptVariablesForPatient, savePromptTemplateOverrides } from "../prompts/custom-templates.js?v=20260711-functional-remediation-15";
import { OPEN_EVIDENCE_TASKS } from "../prompts/open-evidence.js?v=20260711-functional-remediation-15";
import { MEDICAL_SERVICE_OPTIONS, OPENAI_WORKUP_MODEL_OPTIONS, PRESENTATION_DETAIL_OPTIONS, normalizeUserPreferences, openAiWorkupModelOption } from "../app/preferences.js?v=20260711-functional-remediation-15";
import { effectiveWorkupCatalog, findWorkupsById, normalizeWorkup, parseWorkupJson } from "../workups/schema.js?v=20260711-functional-remediation-15";
import { mergeWorkupLibraryIntoOverrides, parseWorkupLibraryJson, workupLibraryFromOverrides } from "../workups/library.js?v=20260711-functional-remediation-15";
import { WORKUP_SYSTEMS, workupSystemLabel } from "../workups/systems.js?v=20260711-functional-remediation-15";
import { createBlankWorkup, createBlankWorkupItem, buildJsonFormatterPrompt, buildOpenEvidenceWorkupDraftPrompt, choicesToText, collectWorkupDraftFromDocument, groupWorkupItems, WORKUP_THOROUGHNESS, workupFromEditorDraft, workupThoroughnessOption } from "../workups/editor.js?v=20260711-functional-remediation-15";
import { formatWorkupDraftWithOpenAi } from "./openai-workup-api.js?v=20260711-functional-remediation-15";
import { createChecklistSnapshot } from "../workups/checklist-conversion.js?v=20260711-functional-remediation-15";
import {
  createChecklistReturnBundle,
  createPhoneChecklistBundle,
  decodeChecklistReturnBundle,
  decodePhoneChecklistBundle,
  emptyChecklistAnswers,
  encodeChecklistReturnBundle,
  encodePhoneChecklistBundle,
  fillNegativeChecklistAnswers,
  mergeReturnedAnswers,
  setChecklistChoice,
  setChecklistNote
} from "../checklist/state.js?v=20260711-functional-remediation-15";
import { groupChecklistItemsBySystem } from "../checklist/grouping.js?v=20260711-functional-remediation-15";
import { icon } from "./icons.js?v=20260711-functional-remediation-15";
import Fuse from "../../vendor/fuse-7.0.0.mjs?v=20260711-functional-remediation-16";

const app = {
  vault: null,
  passphrase: "",
  view: "vault",
  selectedDayId: "",
  selectedPromptTask: "initial_admission_rounds",
  promptDayId: "",
  selectedWorkupEditorId: "general-admission",
  draftWorkup: null,
  guidelines: { admission: "", progress: "" },
  phoneBundle: null,
  phoneAnswers: {},
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
  smartMenuOpen: false,
  quickDeid: { input: "", output: "", warnings: [], status: "", review: null },
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
  phoneReturnReady: false,
  workupImportError: "",
  workupCatalogOpen: false,
  workupCatalogQuery: "",
  workupCatalogSearch: null,
  workupWorkspace: { status: "unconfigured", message: "Choose a workspace folder to mirror local workups." },
  workupWorkspaceBusy: false,
  pendingArchivePatientId: "",
  pendingRemoveDayId: ""
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
  if (option.requiresWebGpu && !app.webGpuAvailable) return "Requires browser WebGPU support for local inference.";
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
    : { ready: false, message: `Load and verify ${deidModelLabel(app.deidMode)} before de-identifying or saving text.` };
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
    const ready = selectedDeidReadiness().ready && !active;
    document.querySelectorAll('[data-action="save-context"], [data-action="save-day"]').forEach((button) => {
      button.disabled = !ready;
      button.textContent = active ? "De-identifying…" : "Save changes";
    });
  }
}

function assertSelectedDeidReady() {
  const readiness = selectedDeidReadiness();
  if (!readiness.ready) throw new Error(readiness.message);
  return readiness;
}

function deidLoadButtonDisabled() {
  if (app.deidMode === STRUCTURED_DEID_MODE) return true;
  if (app.loadingDeidModelKey === app.deidMode) return true;
  const option = selectedDeidOption();
  return option ? Boolean(deidModelDisabledReason(option)) : true;
}

function deidLoadButtonLabel() {
  return app.loadingDeidModelKey === app.deidMode ? "Loading model..." : "Load selected model";
}

function renderDeidLoadButton() {
  const option = selectedDeidOption();
  if (!option) return `<span class="model-selection-message model-selection-message--ready">${icon("shield")} Ready locally</span>`;
  const pack = option ? modelPackStateFor(option) : null;
  if (pack?.state === "installed") {
    return `<button type="button" data-action="verify-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${icon("shield")} Verify ${escapeHtml(option.shortLabel || option.label)}</button>`;
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
    return `<button type="button" data-action="download-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${icon("download")} ${downloading ? "Downloading locally..." : `Download ${escapeHtml(option.shortLabel || option.label)} locally`}</button>`;
  }
  return `<button type="button" data-action="load-advanced-deid" ${deidLoadButtonDisabled() ? "disabled" : ""}>${icon("shield")} ${escapeHtml(deidLoadButtonLabel())}</button>`;
}

async function selectedModelLoadBlocker(option) {
  if (!option) return "Structured-only de-identification selected.";
  if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
  if (isInstallableModel(option)) {
    const pack = await getModelPackState(option);
    app.modelPacks = { ...app.modelPacks, [option.key]: pack };
    if (!pack.ready) return pack.message;
  }
  return webGpuRuntimeBlocker(option);
}

async function webGpuRuntimeBlocker(option) {
  if (!option?.requiresWebGpu) return "";
  const available = await refreshWebGpuAvailability({ renderAfter: false });
  if (available) return "";
  return `${option.label} requires working WebGPU because its FP32 weights cannot safely run through the browser CPU/WASM backend. The downloaded model remains on this device; open this app in a WebGPU-enabled browser or use a device with compatible GPU support.`;
}

function modelPackFailureMessage(option, error) {
  const detail = error instanceof Error && error.message ? error.message : `${option.label} could not be verified.`;
  if (option?.key === DEFAULT_DEID_MODEL_KEY && /bad_alloc|can't create a session/i.test(detail)) {
    return `${option.label} is already downloaded locally, but its WebGPU session could not allocate the published 1.63 GB FP32 weights. No re-download is needed. Close GPU-heavy apps, refresh, and verify again; if the allocation still fails, choose the explicit Base or Small OpenMed tier for this device.`;
  }
  if (option?.key === "openmed-superclinical-small" && /unaligned accesses/i.test(detail)) {
    return `${option.label} encountered a browser WASM compatibility failure. Its local files remain intact. Refresh once, then choose Verify model to test the standard single-threaded WASM runtime; no re-download is needed.`;
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
    return `<div class="quick-installer-feedback quick-installer-feedback--error" role="alert"><div><strong>WebGPU is required for ${escapeHtml(option.shortLabel || option.label)}</strong><span>The Large model remains downloaded locally, but this browser cannot run its FP32 weights without WebGPU. Open the app in a WebGPU-enabled browser on a device with sufficient GPU memory.</span></div>${renderOpenMedSmallFallback(option)}</div>`;
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
    const runtimeLabel = option.requiresWebGpu ? "WebGPU" : "CPU/WASM";
    return `<div class="quick-installer-feedback"><div><strong>${escapeHtml(option.shortLabel || option.label)} is downloaded locally</strong><span>Run the required local ${runtimeLabel} inference check before using it. The model will not be downloaded again.</span></div><div class="button-row"><button type="button" data-action="verify-model-pack" data-model-key="${escapeHtml(option.key)}">${icon("shield")} Verify ${runtimeLabel}</button>${renderOpenMedSmallFallback(option)}</div></div>`;
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
      ? "WebGPU is unavailable in this browser."
      : "Runs entirely in the local de-identification worker.";
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
              <button type="button" data-action="import-model-pack" data-model-key="${escapeHtml(option.key)}" ${actionDisabled}>${icon("upload")} Import folder</button>
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

function setStatus(message) {
  app.status = message;
  const status = byId("statusLine");
  if (status) status.textContent = message;
}

async function persistVault(message = "Saved.") {
  if (!app.vault || !app.passphrase) return;
  await saveEncryptedVault(app.vault, app.passphrase);
  setStatus(message);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  setStatus("Copied.");
}

async function loadGuidelines() {
  const [admission, progress] = await Promise.all([
    fetch("./Guidelines-admission.md", { cache: "no-store" }),
    fetch("./Guidelines-progress.md", { cache: "no-store" })
  ]);
  if (!admission.ok || !progress.ok) throw new Error("Unable to load the task-specific documentation standards.");
  return { admission: await admission.text(), progress: await progress.text() };
}

function patientRequiredMessage() {
  return `
    <div class="empty-state next-step">
      <strong>Next step: unlock the vault and add a patient.</strong>
      <span>Use a de-identified room label to begin a new hospital stay.</span>
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

function clearProtectedViewContent() {
  ["dailyContent", "workupsContent", "checklistContent", "promptsContent", "quickDeidContent", "settingsContent"].forEach((id) => {
    const container = byId(id);
    if (container) container.replaceChildren();
  });
  byId("archiveConfirmDialog")?.close();
  byId("removeDayConfirmDialog")?.close();
}

function clearSensitiveSession() {
  app.vault = null;
  app.passphrase = "";
  app.vaultUnlockError = "";
  app.selectedDayId = "";
  app.draftWorkup = null;
  app.phoneBundle = null;
  app.phoneAnswers = {};
  app.phoneReturnReady = false;
  app.workupImportError = "";
  app.workupImportDraft = "";
  app.workupApiBusy = false;
  app.workupApiDeidConfirmed = false;
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
  renderVault();
  renderDaily();
  renderWorkups();
  renderChecklist();
  renderPrompts();
  renderQuickDeid();
  renderSettings();
  renderStatusBar();
  if (app.view === "daily" && app.pendingSectionReviewFocus) requestAnimationFrame(focusPendingSectionReview);
}

function renderStatusBar() {
  const patient = active();
  const record = readEncryptedVaultRecord();
  byId("currentPageTitle").textContent = viewTitles[app.view] || "Preround";
  byId("vaultStateLabel").textContent = app.vault ? "Vault unlocked" : record ? "Vault locked" : "No vault on this device";
  const deidStatus = selectedDeidStatus();
  byId("deidStateLabel").textContent = `De-ID: ${deidModelLabel(app.deidMode)} - ${deidStatus.ready ? "ready locally" : "not loaded"}`;
  byId("statusLine").textContent = app.status || "All data encrypted locally. No cloud sync. External transmission requires an explicit user action.";
  const switcher = byId("patientSwitcher");
  if (!switcher) return;
  const patients = app.vault?.patients || [];
  switcher.disabled = !app.vault || !patients.length;
  switcher.innerHTML = patients.length
    ? patients
        .map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === patient?.id ? "selected" : ""}>${escapeHtml(entry.displayLabel)}${entry.archivedAt ? " (archived)" : ""}</option>`)
        .join("")
    : `<option>No patient selected</option>`;
}

function vaultPassphraseField(record) {
  const hasUnlockError = Boolean(app.vaultUnlockError);
  return `
    <div class="vault-passphrase-field">
      <label for="vaultPassphrase">Vault passphrase</label>
      <div class="vault-passphrase-input">
        <input id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="${record ? "Unlock existing vault" : "Create local vault"}"${hasUnlockError ? ' aria-describedby="vaultPassphraseError" aria-invalid="true"' : ""}>
        <button id="vaultPassphraseVisibility" class="button--quiet vault-passphrase-visibility" type="button" data-action="toggle-vault-passphrase" aria-controls="vaultPassphrase" aria-pressed="false">Show passphrase</button>
      </div>
      <p id="vaultPassphraseError" class="vault-unlock-error" role="alert"${hasUnlockError ? "" : " hidden"}>${escapeHtml(app.vaultUnlockError)}</p>
    </div>
  `;
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
  button.textContent = isMasked ? "Hide passphrase" : "Show passphrase";
  button.setAttribute("aria-pressed", String(isMasked));
}

function renderVault() {
  const record = readEncryptedVaultRecord();
  if (!vaultIsUnlocked()) {
    byId("vaultContent").innerHTML = `
      <div class="locked-vault-shell">
        <section class="vault-access surface-panel">
          <div class="section-heading vault-access-heading">
            <div>
              <h2 id="vault-heading">Unlock local vault</h2>
              <p class="muted">No patient, roster, workup, checklist, or prompt data is loaded until this passphrase decrypts the vault on this device.</p>
            </div>
            <div class="button-row">
              <button class="button--secondary" type="button" data-action="restore-vault">${icon("upload")} Restore encrypted vault</button>
              <input id="restoreVaultInput" type="file" accept="application/json" hidden>
            </div>
          </div>
          <div class="vault-access-controls">
            ${vaultPassphraseField(record)}
            <button class="button--primary" type="button" data-action="unlock-vault">${record ? "Unlock vault" : "Create vault"}</button>
          </div>
          ${
            record
              ? `<div class="vault-recovery">
                  <strong>Forgot the passphrase?</strong>
                  <span>It cannot be recovered. Permanently remove this encrypted vault to start over.</span>
                  <button class="button--quiet" type="button" data-action="request-delete-vault">Delete vault and start over</button>
                </div>`
              : `<div class="next-step compact-next-step"><strong>Next step: create a passphrase.</strong><span>This creates an encrypted local vault on this device.</span></div>`
          }
        </section>
      </div>
    `;
    return;
  }
  const patients = app.vault?.patients || [];
  byId("vaultContent").innerHTML = `
    <div class="vault-screen">
      <section class="vault-access surface-panel">
        <div class="section-heading vault-access-heading">
          <div>
            <h2>Patient vault</h2>
            <p class="muted">Encrypted on this device. No automatic network requests or cloud storage.</p>
          </div>
          <div class="button-row">
            <button class="button--secondary" type="button" data-action="export-vault" ${record ? "" : "disabled"}>${icon("download")} Export</button>
            <button class="button--secondary" type="button" data-action="restore-vault">${icon("upload")} Restore</button>
            <input id="restoreVaultInput" type="file" accept="application/json" hidden>
          </div>
        </div>
        <div class="vault-session-state" role="status">
          <div>
            <strong>Vault unlocked</strong>
            <span>Patient data is available only in this browser session.</span>
          </div>
          <button class="button--quiet" type="button" data-action="lock-vault">Lock vault</button>
        </div>
        ${
          record && !app.vault
            ? `<div class="vault-recovery">
                <strong>Forgot the passphrase?</strong>
                <span>It cannot be recovered. You can permanently remove this encrypted vault and create a new one.</span>
                <button class="button--quiet" type="button" data-action="request-delete-vault">Delete vault and start over</button>
              </div>`
            : !record
              ? `<div class="next-step compact-next-step"><strong>Next step: create a passphrase.</strong><span>Then add your first de-identified room label to begin.</span></div>`
              : ""
        }
      </section>

      <section class="roster-surface surface-panel">
        <div class="section-heading roster-heading">
          <div>
            <h2>Roster</h2>
            <p class="muted">Use de-identified room labels only.</p>
          </div>
          <div class="roster-add-patient">
            <label>Local display label
              <input id="newPatientLabel" placeholder="Room A - General Admission">
            </label>
            <button class="button--primary" type="button" data-action="admit-patient" ${app.vault ? "" : "disabled"}>${icon("plus")} Add patient</button>
          </div>
        </div>
        <div class="roster-column-head" aria-hidden="true"><span>Patient</span><span>Status</span><span>Hospital days</span><span></span></div>
        <div class="patient-list">
          ${patients.length ? patients.map(renderPatientRow).join("") : `<div class="empty-state">No patients in this local vault.</div>`}
        </div>
        <div class="local-vault-note"><strong>Local encryption</strong><span>All vault data stays encrypted and stored only on this device.</span></div>
      </section>
    </div>
  `;
}

function renderPatientRow(patient) {
  const selected = patient.id === app.vault?.activePatientId;
  const archived = Boolean(patient.archivedAt);
  const dayCount = patient.days?.length || 0;
  return `
    <div class="list-row roster-row ${selected ? "selected" : ""}">
      <div class="roster-patient-name">
        <strong>${escapeHtml(patient.displayLabel)}</strong>
        <span class="muted">${archived ? `Archived ${escapeHtml(patient.archivedAt.slice(0, 10))}` : "Active"} · HD${Math.max(dayCount, 1)}</span>
      </div>
      <span class="roster-status ${archived ? "is-archived" : ""}">${archived ? `Archived ${escapeHtml(patient.archivedAt.slice(0, 10))}` : "Active stay"}</span>
      <span class="muted roster-day-count">HD${Math.max(dayCount, 1)}</span>
      <div class="button-row roster-actions">
        <button class="button--secondary" type="button" data-action="select-patient" data-patient-id="${escapeHtml(patient.id)}">Select</button>
        <button class="button--quiet" type="button" data-action="archive-patient" data-patient-id="${escapeHtml(patient.id)}" ${archived ? "disabled" : ""}>${icon("archive")} Archive</button>
      </div>
    </div>
  `;
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

function redactionPosition(text, redaction) {
  const source = String(text || "");
  const placeholder = String(redaction?.placeholder || "");
  if (!placeholder) return -1;
  let cursor = 0;
  for (let occurrence = 0; occurrence <= Number(redaction?.occurrence || 0); occurrence += 1) {
    const position = source.indexOf(placeholder, cursor);
    if (position < 0) return -1;
    if (occurrence === Number(redaction?.occurrence || 0)) return position;
    cursor = position + placeholder.length;
  }
  return -1;
}

function _renderRedactionPreview(text, review, { action = "inspect-redaction", attributes = "" } = {}) {
  const source = String(text || "");
  const usedRedactions = new Set();
  const tokenPattern = /\[(?:[A-Z][A-Z _-]*|MANUAL REDACTION)\]/g;
  let cursor = 0;
  let match;
  let output = "";
  while ((match = tokenPattern.exec(source)) !== null) {
    output += escapeHtml(source.slice(cursor, match.index));
    const token = match[0];
    const index = (review?.redactions || []).findIndex((redaction, redactionIndex) =>
      redaction.state !== "restored" && !usedRedactions.has(redactionIndex) && redaction.placeholder.toUpperCase() === token.toUpperCase()
    );
    if (index >= 0) {
      usedRedactions.add(index);
      const redaction = review.redactions[index];
      output += `<button type="button" class="redacted-token" data-action="${escapeHtml(action)}" ${attributes} data-redaction-index="${index}" data-original="${escapeHtml(redaction.original)}" title="Original in this tab: ${escapeHtml(redaction.original)}" aria-label="Inspect ${escapeHtml(token)}; original is available only in this tab">${escapeHtml(token)}</button>`;
    } else {
      output += `<mark class="redacted-token redacted-token--static">${escapeHtml(token)}</mark>`;
    }
    cursor = match.index + token.length;
  }
  output += escapeHtml(source.slice(cursor));
  return output || `<span class="muted">No de-identified text yet.</span>`;
}

// The same annotated document is used by Quick De-ID and Hospital Stay. It is
// deliberately a read-only review field: it shows the active-tab original
// crossed out beside the safe replacement, while the canonical copy/save text
// remains the de-identified string in state.
function renderRedactionDocument(text, review, { id = "", scope = "", sectionId = "", action = "inspect-redaction", label = "De-identified text review" } = {}) {
  const output = String(text || "");
  synchronizeReviewPlaceholders(review, output);
  const attributes = [
    scope ? `data-scope="${escapeHtml(scope)}"` : "",
    sectionId ? `data-section-id="${escapeHtml(sectionId)}"` : ""
  ].filter(Boolean).join(" ");
  const resolved = (review?.redactions || [])
    .map((redaction, index) => ({ redaction, index, position: redactionPosition(output, redaction) }))
    .filter(({ redaction, position }) => redaction.state !== "restored" && position >= 0)
    .sort((left, right) => left.position - right.position || left.index - right.index);

  let cursor = 0;
  let markup = "";
  for (const { redaction, index, position } of resolved) {
    if (position < cursor) continue;
    const before = output.slice(cursor, position);
    if (before) {
      markup += `<span class="redaction-document-text" data-output-start="${cursor}" data-output-end="${position}">${escapeHtml(before)}</span>`;
    }
    const replacementEnd = position + String(redaction.placeholder || "").length;
    const inspected = review?.inspectedRedactionIndex === index ? "is-inspected" : "";
    if (redaction.state === "confirmed") {
      // Once accepted, avoid repeatedly revealing the memory-only source. The
      // safe replacement remains clickable so the user can explicitly undo it.
      markup += `
        <button type="button" class="redaction-change redaction-change--confirmed ${inspected}" data-action="${escapeHtml(action)}" ${attributes} data-redaction-index="${index}" title="Accepted redaction. Click to review or undo it." aria-label="Review accepted redaction ${escapeHtml(redaction.placeholder)}">
          <mark>${escapeHtml(redaction.placeholder)}</mark>
        </button>`;
    } else {
      markup += `
      <button type="button" class="redaction-change ${review?.inspectedRedactionIndex === index ? "is-inspected" : ""}" data-action="${escapeHtml(action)}" ${attributes} data-redaction-index="${index}" data-original="${escapeHtml(redaction.original)}" title="Original in this active tab: ${escapeHtml(redaction.original)}" aria-label="Review replacement ${escapeHtml(redaction.placeholder)}">
        <del>${escapeHtml(redaction.original)}</del><span class="redaction-change-arrow" aria-hidden="true">→</span><ins>${escapeHtml(redaction.placeholder)}</ins>
      </button>`;
    }
    cursor = replacementEnd;
  }
  const remainder = output.slice(cursor);
  if (remainder) {
    markup += `<span class="redaction-document-text" data-output-start="${cursor}" data-output-end="${output.length}">${escapeHtml(remainder)}</span>`;
  }
  if (!markup) markup = `<span class="redaction-document-text" data-output-start="0" data-output-end="${output.length}">${escapeHtml(output || "No de-identified text yet.")}</span>`;
  return `<div${id ? ` id="${escapeHtml(id)}"` : ""} class="redaction-document" data-redaction-document role="textbox" aria-readonly="true" aria-multiline="true" tabindex="0" aria-label="${escapeHtml(label)}">${markup}</div>`;
}

function renderSectionReview(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  if (!review) return "";
  const inspected = review.redactions[review.inspectedRedactionIndex] || null;
  const inspectedIsConfirmed = inspected?.state === "confirmed";
  const pending = review.redactions.filter((redaction) => redaction.state === "pending").length;
  return `
    <div class="redaction-review" data-redaction-review data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">
      <div class="redaction-review-heading">
        <div>
          <strong>${pending ? `${pending} change${pending === 1 ? "" : "s"} to review` : "Review complete"}</strong>
          <span class="muted">Click a crossed-out value in the document. Original values remain only in this active tab.</span>
        </div>
        ${pending ? `<button class="button--quiet" type="button" data-action="confirm-all-section-redactions" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Confirm all (${pending})</button>` : ""}
      </div>
      ${inspected ? `
        <div class="redaction-inspector redaction-inline-actions">
          <div>
            <strong>${inspectedIsConfirmed ? "Accepted redaction" : `Review ${escapeHtml(inspected.placeholder)}`}</strong>
            <span>${inspectedIsConfirmed ? "The document shows only the safe replacement. Undo restores the source in this active tab." : "Choose whether to keep the replacement or restore the source in this active tab."}</span>
          </div>
          <div class="button-row">
            ${inspectedIsConfirmed ? "" : `<button class="button--secondary" type="button" data-action="keep-reviewed-redaction" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Accept redaction</button>`}
            <button class="button--quiet" type="button" data-action="allow-reviewed-non-phi" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-redaction-index="${review.inspectedRedactionIndex}">${inspectedIsConfirmed ? "Undo redaction" : "Reject — restore source"}</button>
          </div>
          <small>${inspectedIsConfirmed ? "Undo only if this value is not identifying. It will be restored in the de-identified text for the next save." : "Reject only if this value is not identifying. The source will be restored in the de-identified text for the next save."}</small>
        </div>` : ""}
    </div>
  `;
}

function renderSectionSurface(section, scope) {
  const review = sectionReviewFor(scope, section.id);
  const editing = review && isSectionTextEditing(scope, section.id);
  const draftText = sectionDraftText(scope, section.id, section.deidentifiedText);
  const documentId = `sectionRedactionDocument-${section.id}`;
  return `
    <div class="section-review-surface" data-section-review-surface>
      ${review && !editing
        ? `<input class="section-text" type="hidden" value="${escapeHtml(draftText)}">${renderRedactionDocument(draftText, review, { id: documentId, scope, sectionId: section.id, label: `${section.label} redaction review` })}`
        : `<textarea class="section-text" rows="5" spellcheck="false">${escapeHtml(draftText)}</textarea>`}
      <div class="section-review-tools">
        ${review ? `<button class="button--quiet" type="button" data-action="${editing ? "resume-section-review" : "edit-section-text"}" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">${editing ? "Return to redaction review" : "Edit field text"}</button>` : ""}
        <button class="button--quiet" type="button" data-action="manual-redact-selection" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">${icon("wand")} Redact selected text</button>
        <span class="muted">${review && !editing ? "Review changes here, or edit this field text without leaving Hospital Stay." : "Edit this de-identified field, then save changes to re-run the local review."}</span>
      </div>
      ${review && !editing ? renderSectionReview({ ...section, deidentifiedText: draftText }, scope) : ""}
    </div>
  `;
}

function renderSectionEditor(section, scope) {
  const characterCount = section.deidentifiedText?.length || 0;
  const pendingFocus = app.pendingSectionReviewFocus;
  const isInitialReviewTarget = pendingFocus?.scope === scope && pendingFocus.sectionId === section.id;
  const isExpanded = isSectionTextEditing(scope, section.id) || isInitialReviewTarget;
  return `
    <article class="section-editor ${isExpanded ? "is-expanded" : ""}" data-section-id="${escapeHtml(section.id)}" data-section-scope="${escapeHtml(scope)}" data-created-at="${escapeHtml(section.createdAt)}">
      <div class="section-toolbar">
        <span class="section-grip section-drag-handle" draggable="true" title="Drag to reorder sections" aria-label="Drag to reorder sections" role="img">${icon("grip")}</span>
        <input class="section-label" value="${escapeHtml(section.label)}" aria-label="Section label">
        <span class="section-meta">${characterCount ? `${characterCount} chars` : "Empty"}</span>
        <div class="button-row">
          <button class="icon-button" type="button" data-action="toggle-section-editor" title="Edit section" aria-label="Edit section" aria-expanded="false">${icon("edit")}</button>
          <button class="icon-button" type="button" data-action="move-section-up" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move up">↑</button>
          <button class="icon-button" type="button" data-action="move-section-down" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move down">↓</button>
          <button class="icon-button" type="button" data-action="remove-section" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Remove">${icon("trash")}</button>
        </div>
      </div>
      ${renderSectionSurface(section, scope)}
    </article>
  `;
}

function warningDescription(warning) {
  if (typeof warning === "string") return warning;
  if (!warning || typeof warning !== "object") return "Potential residual PHI";
  const type = String(warning.type || "Potential residual PHI");
  const snippet = String(warning.snippet || "").trim();
  return snippet ? `${type}: ${snippet}` : type;
}

function warningSnippet(warning) {
  if (!warning || typeof warning !== "object") return "";
  return String(warning.snippet || "").trim();
}

function renderWarnings(sections, scope) {
  const sessionWarnings = (sections || []).flatMap((section) => {
    const review = sectionReviewFor(scope, section.id);
    if (!review) return [];
    return review.warnings
      .map((warning, warningIndex) => ({ section, warning, warningIndex, review }))
      .filter(({ warningIndex, review: currentReview }) => !currentReview.dismissedWarningIndexes.has(warningIndex));
  });
  if (sessionWarnings.length) {
    return `
      <div id="residualWarnings-${escapeHtml(scope)}" class="warning-box residual-review">
        <strong>Residual PHI review needed</strong>
        <span class="muted">These details are available only for this active review; decide whether to redact or dismiss each item before leaving Hospital Stay.</span>
        <div class="residual-warning-list">
          ${sessionWarnings.map(({ section, warning, warningIndex }) => `
            <div class="residual-warning-entry">
              <button type="button" class="residual-warning" data-action="review-section-warning" data-session-warning="true" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}" title="Open and select this flagged text">
                <span>${escapeHtml(section.label)}</span>
                <strong>${escapeHtml(warningDescription(warning))}</strong>
              </button>
              <div class="button-row">
                <button class="button--quiet" type="button" data-action="redact-section-warning" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}">Redact</button>
                <button class="button--quiet" type="button" data-action="dismiss-section-warning" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}">Not PHI</button>
              </div>
            </div>`).join("")}
        </div>
      </div>
    `;
  }
  const warnings = sectionWarningSummary(sections);
  if (!warnings.length) return `<div id="residualWarnings-${escapeHtml(scope)}" class="notice">No residual PHI warnings from the last save.</div>`;
  return `
    <div id="residualWarnings-${escapeHtml(scope)}" class="warning-box residual-review">
      <strong>Residual PHI review needed</strong>
      <div class="residual-warning-list">
        ${warnings
          .map(
            (warning) => `
              <button
                type="button"
                class="residual-warning"
                data-action="review-section-warning"
                data-scope="${escapeHtml(scope)}"
                data-section-id="${escapeHtml(warning.sectionId)}"
                data-warning-index="${warning.warningIndex}"
                title="Open this field and select the flagged text"
              >
                <span>${escapeHtml(warning.sectionLabel)}</span>
                <strong>${escapeHtml(warningDescription(warning.warning))}</strong>
              </button>
            `
          )
          .join("")}
      </div>
      <span class="muted">Detailed warning text is not retained after this tab’s review session.</span>
    </div>
  `;
}

function renderDaily() {
  const patient = active();
  if (!patient) {
    byId("dailyContent").innerHTML = patientRequiredMessage();
    return;
  }
  const days = sortDays(patient.days);
  const selected = days.find((day) => day.id === app.selectedDayId) || days.at(-1) || null;
  const deidReady = selectedDeidReadiness().ready && !app.deidOperation.active;
  if (selected && selected.id !== app.selectedDayId) app.selectedDayId = selected.id;
  byId("dailyContent").innerHTML = `
    <div class="stay-layout">
      <aside class="panel stay-rail">
        <div class="section-heading tight">
          <div>
            <h2>Hospital day</h2>
            <p class="muted">User-labeled packets only.</p>
          </div>
        </div>
        <div class="next-step compact-next-step">
          <strong>${days.length ? "Next: keep this stay current." : "Next: add the first hospital day."}</strong>
          <span>${days.length ? "Select a day, add de-identified updates, then save changes." : "Add a user-labeled packet before building a workup."}</span>
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
              <span><strong>Admission packet</strong><span class="muted">Patient-level de-identified context</span></span>
              <span class="muted">${patient.contextSections.length} fields</span>
            </summary>
            <div class="admission-packet-body">
              <div class="section-heading">
                <div>
                  <h2>Admission packet</h2>
                  <p class="muted">Patient-level de-identified context used throughout this stay.</p>
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
                <button class="button--primary" type="button" data-action="save-context" ${deidReady ? "" : "disabled"}>${app.deidOperation.active ? "De-identifying…" : "Save changes"}</button>
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
                    <p class="muted">${escapeHtml(selected.date)} · User-labeled packets only. No automatic trend detection.</p>
                  </div>
                  <div class="button-row">
                    <button class="button--secondary" type="button" data-action="add-daily-section">${icon("plus")} Add field</button>
                    <button class="button--primary" type="button" data-action="save-day" ${deidReady ? "" : "disabled"}>${app.deidOperation.active ? "De-identifying…" : "Save changes"}</button>
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
  return String(query || "").trim().toLocaleLowerCase();
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
  const catalog = effectiveWorkupCatalog(app.vault.workupOverrides);
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
  const grouped = groupWorkupItems(editorWorkup);
  const hasSavedOpenAiKey = Boolean(currentPreferences().openAiApiKey);
  const workspace = app.workupWorkspace || { status: "unconfigured" };
  const workspaceReady = workspace.status === "ready";
  byId("workupsContent").innerHTML = `
    <section class="panel workup-editor-surface">
      <div class="workup-topline">
        <div class="workup-editor-heading">
          <input id="workupTitleInput" class="workup-title-input" value="${escapeHtml(editorWorkup.title)}" aria-label="Workup title">
          <label class="workup-editor-select">Editing
            <select id="workupEditorSelect" data-action="select-workup-editor" aria-label="Edit workup">
              ${catalog.map((workup) => `<option value="${escapeHtml(workup.id)}" ${workup.id === editorWorkup.id && !app.draftWorkup ? "selected" : ""}>${escapeHtml(workup.title)}</option>`).join("")}
            </select>
          </label>
          <div class="workup-editor-header-actions">
            <button class="button--primary" type="button" data-action="build-checklist" ${selectedIds.size ? "" : "disabled"}>Build checklist${selectedIds.size ? ` (${selectedIds.size})` : ""}</button>
          </div>
        </div>
        <label class="workup-alias-control">Aliases
          <input id="workupAliasesInput" value="${escapeHtml((editorWorkup.aliases || []).join(", "))}" placeholder="Gen Admit, Adult Admit">
        </label>
        <details class="workup-catalog-menu" open>
          <summary title="Open workup catalog"><span><strong>Workup catalog</strong><span class="muted">Choose workups for the checklist.</span></span>${icon("settings")}</summary>
          <div class="workup-catalog-popover">
            <div class="section-heading tight">
              <div>
                <h3>Workup catalog</h3>
                <p class="muted">Next: select one or more workups, then build the checklist.</p>
              </div>
              <button class="button--secondary" type="button" data-action="new-workup">${icon("plus")} New</button>
            </div>
            <div class="workup-catalog-actions">
              <button class="button--primary" type="button" data-action="build-checklist" ${selectedIds.size ? "" : "disabled"}>Build checklist</button>
              <span class="muted">${selectedIds.size ? `${selectedIds.size} selected` : "Select one or more workups"}</span>
            </div>
            <div class="workup-catalog-search">
              <label for="workupCatalogSearch">Find a workup
                <span class="workup-search-control">
                  <input id="workupCatalogSearch" type="search" value="${escapeHtml(app.workupCatalogQuery)}" placeholder="Search title, alias, or ID" autocomplete="off">
                  <button class="button--quiet" type="button" data-action="clear-workup-search" ${app.workupCatalogQuery ? "" : "hidden"}>Clear</button>
                </span>
              </label>
              <span class="muted" data-workup-catalog-count>${matchingWorkupIds ? `${matchingWorkupIds.size} of ${catalog.length} workups` : `${catalog.length} workups`}</span>
            </div>
            <div class="workup-list" data-workup-catalog-list>
              ${catalog.map((workup) => renderWorkupRow(workup, selectedIds, matchingWorkupIds)).join("")}
              <div class="empty-state" data-workup-catalog-empty ${matchingWorkupIds && matchingWorkupIds.size === 0 ? "" : "hidden"}>No workups match this search.</div>
            </div>
          </div>
        </details>
      </div>
      <div class="workup-subtitle">The first choice in each row is the normal or negative baseline. Drag rows or use arrow controls to reorder.</div>
      <div class="workup-scope-control">
        <label>OpenEvidence detail
          <select id="workupThoroughness" aria-label="OpenEvidence workup detail">
            ${Object.entries(WORKUP_THOROUGHNESS).map(([value, option]) => `<option value="${value}" ${workupThoroughnessOption(app.workupThoroughness) === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <span class="muted">${escapeHtml(WORKUP_THOROUGHNESS[workupThoroughnessOption(app.workupThoroughness)].helper)}</span>
      </div>

        <div class="workflow-strip">
          <div class="workflow-step"><strong>1 OpenEvidence draft</strong><span class="muted">Create H&P item set</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>2 Format as JSON</strong><span class="muted">Saved key or ChatGPT fallback</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>Parse & review</strong><span class="muted">Editable rows saved locally</span></div>
        </div>

        <input id="workupIdInput" value="${escapeHtml(editorWorkup.id)}" hidden>

        <div class="workup-columns">
          ${renderWorkupColumn("history", "History questions", grouped.history)}
          ${renderWorkupColumn("exam", "Physical exam items", grouped.exam)}
        </div>

        <div class="workup-footer-actions">
          <button class="button--secondary" type="button" data-action="copy-open-evidence-workup-prompt">OpenEvidence draft</button>
          <button class="button--secondary" type="button" data-action="copy-json-formatter-prompt">Copy ChatGPT formatter prompt</button>
          <button class="button--secondary" type="button" data-action="export-workup-json">${icon("download")} Download workup</button>
          <button class="button--secondary" type="button" data-action="export-workup-library">${icon("download")} Download local library</button>
          <button class="button--secondary" type="button" data-action="choose-workup-library-file">${icon("upload")} Import library</button>
          <input id="workupLibraryFileInput" type="file" accept="application/json" hidden>
          <button class="button--secondary" type="button" data-action="save-workup-ui">Save to catalog</button>
        </div>
        <p class="muted">Library files contain workups only. They do not include patient data and never build a checklist automatically.</p>
        <section class="workup-workspace-mirror" aria-live="polite">
          <div>
            <strong>Workspace mirror</strong>
            <p class="muted">${workspaceReady ? `Mirrors ${Object.keys(app.vault.workupOverrides || {}).length} local workup${Object.keys(app.vault.workupOverrides || {}).length === 1 ? "" : "s"} to <code>workups/local/</code>. Browser saves remain encrypted and canonical.` : escapeHtml(workspace.message || "Choose a workspace folder to mirror local workups.")}</p>
          </div>
          <div class="button-row">
            ${workspaceReady ? `<button class="button--secondary" type="button" data-action="sync-workup-workspace" ${app.workupWorkspaceBusy ? "disabled" : ""}>${app.workupWorkspaceBusy ? "Syncing…" : "Sync now"}</button><button class="button--quiet" type="button" data-action="choose-workup-workspace" ${app.workupWorkspaceBusy ? "disabled" : ""}>Change folder</button><button class="button--quiet" type="button" data-action="disconnect-workup-workspace" ${app.workupWorkspaceBusy ? "disabled" : ""}>Disconnect</button>` : `<button class="button--secondary" type="button" data-action="choose-workup-workspace" ${app.workupWorkspaceBusy || workspace.status === "unsupported" ? "disabled" : ""}>Choose workspace folder</button>`}
          </div>
          <small>Writes only workup JSON and a mirror manifest. It never writes patient data, stages files, commits, or deletes workspace files.</small>
        </section>

        <details class="utility-panel workup-import" ${app.workupImportError || app.workupApiBusy ? "open" : ""}>
          <summary>
            <strong>Format or import a workup</strong>
            <span class="muted">Paste a de-identified OpenEvidence draft for automatic formatting, or paste completed JSON to import directly.</span>
          </summary>
          <div class="workup-import-body">
          <div class="section-heading tight">
            <div>
              <h3>Format into editable workup rows</h3>
              <p class="muted">Automatic formatting uses only the pasted draft. Completed JSON can still be parsed directly.</p>
            </div>
            <div class="button-row">
              <button type="button" data-action="parse-workup-json">Parse & save</button>
              <button type="button" data-action="choose-workup-file">${icon("upload")} Import file</button>
              <input id="workupJsonFileInput" type="file" accept="application/json" hidden>
            </div>
          </div>
          <textarea id="workupJsonImport" class="json-import" spellcheck="false" placeholder="Paste a reviewed, de-identified OpenEvidence workup draft or prerounding_workup_v1 JSON here.">${escapeHtml(app.workupImportDraft)}</textarea>
          ${hasSavedOpenAiKey ? `<div class="workup-api-formatting">
            <label class="check-row">
              <input id="workupApiDeidConfirmed" type="checkbox" ${app.workupApiDeidConfirmed ? "checked" : ""}>
              <span>I confirm this draft is de-identified and may be sent to OpenAI using my saved API key.</span>
            </label>
            <div class="button-row">
              <button type="button" data-action="format-workup-json-api" ${app.workupApiDeidConfirmed && !app.workupApiBusy ? "" : "disabled"}>${app.workupApiBusy ? "Formatting with saved key..." : "Format & load with saved API key"}</button>
              <span class="muted">Ready to use ${escapeHtml(openAiWorkupModelOption(currentPreferences().openAiModel).label)} after you confirm the draft is de-identified.</span>
            </div>
          </div>` : `<div class="notice workup-api-guidance"><span>To format a de-identified draft automatically, save an OpenAI API key in Settings.</span><button class="button--quiet" type="button" data-action="go-settings">Open Settings</button></div>`}
          ${app.workupImportError ? `<div class="warning-box">${escapeHtml(app.workupImportError)}</div>` : `<div class="notice">JSON import is parsed into editable rows. No raw JSON editing in the main flow.</div>`}
          <textarea id="workupPromptOutput" rows="7" readonly placeholder="Copied AI workflow prompt appears here."></textarea>
          </div>
        </details>
        <button type="button" class="text-button" data-action="reset-workup-json">Remove local override</button>
      </section>
  `;
  bindWorkupReordering();
}

function renderWorkupRow(workup, selectedIds, matchingWorkupIds = null) {
  const matches = !matchingWorkupIds || matchingWorkupIds.has(workup.id);
  return `
    <div class="workup-catalog-row ${selectedIds.has(workup.id) ? "is-selected" : ""}" data-workup-id="${escapeHtml(workup.id)}" ${matches ? "" : "hidden"}>
      <label class="check-row">
      <input type="checkbox" class="workup-checkbox" value="${escapeHtml(workup.id)}" ${selectedIds.has(workup.id) ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(workup.title)}</strong>
        <span class="muted">${workup.items.filter((item) => item.kind === "history").length} history · ${workup.items.filter((item) => item.kind === "exam").length} exam</span>
      </span>
      </label>
      <button class="button--quiet" type="button" data-action="edit-workup" data-workup-id="${escapeHtml(workup.id)}">${icon("edit")} Edit</button>
    </div>
  `;
}

function renderWorkupColumn(kind, title, items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const system = String(item.system || "").trim() || "general";
    groups.set(system, [...(groups.get(system) || []), { item, index }]);
  });
  return `
    <div class="workup-column" data-workup-kind="${kind}">
      <div class="section-heading tight">
        <h3>${escapeHtml(title)}</h3>
        <button class="button--quiet" type="button" data-action="add-workup-item" data-kind="${kind}">${icon("plus")} Add</button>
      </div>
      <div class="workup-item-scroll">
        ${[...groups.entries()].map(([system, entries]) => `
          <section class="workup-system-group" data-workup-system="${escapeHtml(system)}">
            <div class="workup-system-group-header"><h4>${escapeHtml(workupSystemLabel(system))}</h4><span class="muted">${entries.length} item${entries.length === 1 ? "" : "s"}</span></div>
            <div class="list-stack" data-workup-system-list="${escapeHtml(system)}">
              ${entries.map(({ item, index }) => renderWorkupItemEditor(item, kind, index)).join("")}
            </div>
          </section>`).join("")}
      </div>
    </div>
  `;
}

function renderWorkupItemEditor(item, kind, index = 0) {
  return `
    <article class="workup-editor-card" data-workup-item-row data-kind="${kind}">
      <span class="icon-button workup-drag-handle" draggable="true" title="Drag to reorder ${kind} items" aria-label="Drag to reorder ${kind} item" role="img">${icon("grip")}</span>
      <span class="workup-row-number" aria-hidden="true">${index + 1}</span>
      <textarea data-field="item-text" rows="2" aria-label="${kind} item text">${escapeHtml(item.text)}</textarea>
      <input data-field="item-choices" value="${escapeHtml(choicesToText(item.choices))}" placeholder="Baseline answer, then positive or abnormal" aria-label="${kind} answer choices, baseline first">
      <select data-field="item-select" aria-label="${kind} select mode">
        <option value="one" ${item.select !== "many" ? "selected" : ""}>One</option>
        <option value="many" ${item.select === "many" ? "selected" : ""}>Many</option>
      </select>
      <div class="button-row">
        <button class="icon-button" type="button" data-action="move-workup-item" data-direction="up" title="Move up" aria-label="Move ${kind} item up">${icon("moveUp")}</button>
        <button class="icon-button" type="button" data-action="move-workup-item" data-direction="down" title="Move down" aria-label="Move ${kind} item down">${icon("moveDown")}</button>
        <button class="icon-button" type="button" data-action="duplicate-workup-item" title="Duplicate">${icon("copy")}</button>
        <button class="icon-button" type="button" data-action="remove-workup-item" title="Remove">${icon("trash")}</button>
      </div>
      <details class="workup-item-details">
        <summary>Item details</summary>
        <div class="workup-item-detail-grid">
          <label>System<select data-field="item-system">${WORKUP_SYSTEMS.map((system) => `<option value="${escapeHtml(system.id)}" ${item.system === system.id ? "selected" : ""}>${escapeHtml(system.label)}</option>`).join("")}</select></label>
          <label>Item ID<input data-field="item-id" value="${escapeHtml(item.id)}"></label>
        </div>
      </details>
    </article>
  `;
}

function selectedChecklistDay(patient) {
  const days = sortDays(patient?.days || []);
  return days.find((day) => day.id === app.selectedDayId) || [...days].reverse().find((day) => day.checklistSnapshot) || days.at(-1) || null;
}

function groupChecklistItems(snapshot) {
  const items = snapshot?.items || [];
  return {
    history: items.filter((item) => item.kind === "history"),
    exam: items.filter((item) => item.kind === "exam")
  };
}

function completedCount(items, answers) {
  return items.filter((item) => answers?.[item.id]?.selected?.length || answers?.[item.id]?.note).length;
}

function renderChecklist() {
  const patient = active();
  if (!patient) {
    byId("checklistContent").innerHTML = patientRequiredMessage();
    return;
  }
  const day = selectedChecklistDay(patient);
  const snapshot = day?.checklistSnapshot || null;
  const answers = day?.answers || {};
  const totalItems = snapshot?.items.length || 0;
  const completedItems = completedCount(snapshot?.items || [], answers);
  byId("checklistContent").innerHTML = `
    <div class="checklist-shell">
      <section class="panel checklist-panel">
        <div class="section-heading">
          <div>
            <h2>Checklist</h2>
            <p class="muted">${snapshot ? `${escapeHtml(day.label)} · ${completedItems} / ${totalItems} completed · ${escapeHtml(snapshot.workupTitles.join(", "))}` : "Build a checklist from the Workups page."}</p>
          </div>
          <button class="button--secondary" type="button" data-action="go-workups">Build from workups</button>
        </div>
        ${
          snapshot
            ? `<div id="checklistSections" class="checklist-scroll">
                ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers)}
                ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers)}
              </div>`
            : `<div class="empty-state next-step"><strong>Next step: build a checklist.</strong><span>Select one or more workups, then return here to record history and exam findings.</span></div>`
        }
      </section>
      ${snapshot ? renderPhoneTransfer(day) : `<section class="panel"><h3>Send to phone</h3><p class="muted">Build a checklist first.</p></section>`}
    </div>
  `;
  if (snapshot) renderChecklistQr(day);
}

function renderChecklistSection(title, items, answers, { showBulkControls = true } = {}) {
  const kind = items[0]?.kind || (title === "Physical Exam" ? "exam" : "history");
  const fillLabel = kind === "exam" ? "Fill remaining normal" : "Fill remaining negative";
  return `
    <section class="checklist-section">
      <div class="checklist-section-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="button-row">
          <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
          ${showBulkControls ? `<button class="button--quiet" type="button" data-action="fill-section-negatives" data-kind="${escapeHtml(kind)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>` : ""}
        </div>
      </div>
      ${
        items.length
          ? `
              <div class="checklist-column-head" aria-hidden="true">
                <span>${escapeHtml(title)}</span><span>Answer</span><span>Notes</span><span>Status</span>
              </div>
              ${groupChecklistItemsBySystem(items).map(({ system, items: groupedItems }) => renderChecklistSystem(system, groupedItems, answers, kind, { showBulkControls })).join("")}
            `
          : `<div class="empty-state">No ${escapeHtml(title.toLowerCase())} items in this checklist.</div>`
      }
    </section>
  `;
}

function renderChecklistSystem(system, items, answers, kind, { showBulkControls = true } = {}) {
  const fillLabel = kind === "exam" ? "Mark remaining normal" : "Mark remaining negative";
  return `
    <section class="checklist-system">
      <div class="checklist-system-header">
        <h4>${escapeHtml(system)}</h4>
        <div class="button-row">
          <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
          ${showBulkControls ? `<button class="button--quiet" type="button" data-action="fill-system-negatives" data-kind="${escapeHtml(kind)}" data-system="${escapeHtml(system)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>` : ""}
        </div>
      </div>
      <div class="checklist-table">
        ${items.map((item) => renderChecklistItem(item, answers)).join("")}
      </div>
    </section>
  `;
}

function renderChecklistItem(item, answers) {
  const answer = answers[item.id] || { selected: [], note: "" };
  const multiple = item.select === "many";
  return `
    <article class="checklist-item" data-item-id="${escapeHtml(item.id)}">
      <div>
        <strong>${escapeHtml(item.text)}</strong>
        <div class="muted">${escapeHtml(item.workupTitle)}</div>
      </div>
      <div class="choice-row">
        ${
          multiple
            ? item.choices
                .map(
                  (choice, index) => `
                    <label class="${index === 0 ? "baseline-choice" : ""}">
                      <input type="checkbox" class="checklist-answer" name="${escapeHtml(item.id)}" value="${escapeHtml(choice)}" ${answer.selected?.includes(choice) ? "checked" : ""}>
                      ${escapeHtml(choice)}
                    </label>
                  `
                )
                .join("")
            : `
                <select class="checklist-answer checklist-answer-select" name="${escapeHtml(item.id)}" aria-label="Answer for ${escapeHtml(item.text)}">
                  <option value="">--</option>
                  ${item.choices.map((choice) => `<option value="${escapeHtml(choice)}" ${answer.selected?.includes(choice) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
                </select>
              `
        }
      </div>
      <textarea class="item-note-input" rows="2" placeholder="Optional note">${escapeHtml(answer.note || "")}</textarea>
      <span class="status-dot">${answer.selected?.length || answer.note ? "✓" : "○"}</span>
    </article>
  `;
}

function renderPhoneTransfer(day) {
  const patient = active();
  const bundle = encodePhoneChecklistBundle(createPhoneChecklistBundle(patient, day.checklistSnapshot, day.answers || {}));
  const phoneLink = `${window.location.origin}${window.location.pathname}#phone=${bundle}`;
  return `
    <aside class="panel phone-transfer">
      <div>
        <h3>Send to phone</h3>
        <p class="muted">Scan, copy bundle, download fallback, then import returned answers.</p>
      </div>
      <div id="phoneQr" class="qr-box"></div>
      <label>Bundle link
        <textarea id="phoneBundleText" readonly rows="4">${escapeHtml(phoneLink)}</textarea>
      </label>
      <div class="button-row">
        <button class="button--secondary" type="button" data-action="copy-phone-bundle" data-bundle="${escapeHtml(phoneLink)}">${icon("copy")} Copy bundle</button>
        <button class="button--secondary" type="button" data-action="download-phone-bundle" data-bundle="${escapeHtml(bundle)}">${icon("download")} Download</button>
      </div>
      <label>Returned phone answers
        <textarea id="phoneReturnText" rows="5" placeholder="Paste return bundle"></textarea>
      </label>
      <button class="button--secondary" type="button" data-action="import-phone-return">Import from phone</button>
    </aside>
  `;
}

function renderChecklistQr(day) {
  const patient = active();
  const bundle = encodePhoneChecklistBundle(createPhoneChecklistBundle(patient, day.checklistSnapshot, day.answers || {}));
  const phoneLink = `${window.location.origin}${window.location.pathname}#phone=${bundle}`;
  renderQr(byId("phoneQr"), phoneLink);
}

function renderPrompts() {
  const patient = active();
  if (!patient) {
    byId("promptsContent").innerHTML = patientRequiredMessage();
    return;
  }
  const task = OPEN_EVIDENCE_TASKS.find((entry) => entry.id === app.selectedPromptTask) || OPEN_EVIDENCE_TASKS[0];
  const promptDays = sortDays(patient.days || []);
  const selectedPromptDay = promptDays.find((day) => day.id === app.promptDayId) || promptDays.at(-1) || null;
  if (selectedPromptDay && selectedPromptDay.id !== app.promptDayId) app.promptDayId = selectedPromptDay.id;
  const template = app.promptDrafts[task.id] ?? promptTemplateForTask(task.id, app.promptTemplates);
  let prompt = "";
  let promptError = "";
  try {
    prompt = buildCustomOpenEvidencePrompt({
      taskId: task.id,
      template,
      patient,
      selectedDayId: app.promptDayId,
      guidelines: app.guidelines,
      teamPreferences: app.vault.preferences
    });
  } catch (error) {
    promptError = error instanceof Error ? error.message : "Unable to build prompt.";
  }
  const variables = promptVariablesForPatient(patient, { selectedDayId: app.promptDayId });
  byId("promptsContent").innerHTML = `
    <div class="prompt-layout">
      <section class="prompt-panel prompt-template-panel">
        <div class="prompt-panel-header">
          <div>
            <h2>Prompt template (editable)</h2>
            <p class="muted">Next: choose a task, adjust the template, then copy the de-identified prompt.</p>
          </div>
          <select id="promptTaskSelect" aria-label="Prompt type">
            ${OPEN_EVIDENCE_TASKS.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === task.id ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
          </select>
          ${promptDays.length ? `<label class="prompt-day-select">Hospital day <select id="promptDaySelect" aria-label="Hospital day for prompt">${promptDays.map((day, index) => `<option value="${escapeHtml(day.id)}" ${day.id === app.promptDayId ? "selected" : ""}>HD${index + 1} · ${escapeHtml(day.label)} · ${escapeHtml(day.date)}</option>`).join("")}</select></label>` : ""}
        </div>
        <div class="prompt-template-wrap">
          <textarea id="promptPreview" class="prompt-preview" rows="22" spellcheck="false">${escapeHtml(template)}</textarea>
          <div id="smartVariableMenu" class="smart-variable-menu ${app.smartMenuOpen ? "open" : ""}">
            ${variables.map((variable) => `<button type="button" data-action="insert-prompt-variable" data-token="${escapeHtml(variable.token)}"><strong>${escapeHtml(variable.token)}</strong><span>${escapeHtml(variable.description)}</span></button>`).join("")}
          </div>
        </div>
        <div class="prompt-template-footer">
          <div class="notice">${task.requiresGuidelines ? "@guidelines is included by default and required for this prompt type." : "Insert only the saved context you want included."}</div>
          <div class="button-row">
            <button class="button--secondary" type="button" data-action="save-prompt-template">Save prompt</button>
            <button class="button--quiet" type="button" data-action="reset-prompt-template">Reset</button>
          </div>
        </div>
        ${promptError ? `<div class="warning-box">${escapeHtml(promptError)}</div>` : ""}
      </section>

      <section class="prompt-panel prompt-output-panel">
        <div class="section-heading tight">
          <div>
            <h2>Generated prompt preview</h2>
            <p class="muted">De-identified context only.</p>
          </div>
        </div>
        <textarea id="promptOutput" rows="22" readonly spellcheck="false">${escapeHtml(prompt)}</textarea>
        <div class="button-row">
          <button class="button--primary" type="button" data-action="copy-prompt">Copy prompt</button>
          <button class="button--secondary" type="button" data-action="open-open-evidence">Open OpenEvidence</button>
        </div>
      </section>
    </div>
  `;
}

function currentPreferences() {
  return normalizeUserPreferences(app.vault?.preferences);
}

function renderSettings() {
  const container = byId("settingsContent");
  if (!container || !vaultIsUnlocked()) return;
  const preferences = currentPreferences();
  const apiKeySaved = Boolean(preferences.openAiApiKey);
  container.innerHTML = `
    <div class="settings-layout">
      <section class="panel settings-panel">
        <div class="section-heading">
          <div>
            <h2 id="settings-heading">Team and presentation preferences</h2>
            <p class="muted">These preferences are appended to every OpenEvidence prompt and workup-draft request.</p>
          </div>
        </div>
        <div class="settings-fields">
          <label>Medical service
            <select id="settingsMedicalService">
              ${MEDICAL_SERVICE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.medicalService === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
          <label id="settingsCustomServiceWrap" ${preferences.medicalService === "other" ? "" : "hidden"}>Service name
            <input id="settingsCustomServiceName" value="${escapeHtml(preferences.customServiceName)}" placeholder="e.g., Cardiology consults">
          </label>
          <label class="settings-field-wide">Service focus
            <textarea id="settingsServiceFocus" rows="3" placeholder="e.g., Evaluate new atrial fibrillation and rate-control strategy; omit unrelated chronic issues unless they affect this question.">${escapeHtml(preferences.serviceFocus)}</textarea>
          </label>
          <label>Presentation detail
            <select id="settingsPresentationDetail">
              ${PRESENTATION_DETAIL_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.presentationDetail === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
          <label class="settings-field-wide">Attending preferences
            <textarea id="settingsAttendingPreferences" rows="4" placeholder="e.g., Start with a one-liner, then problem-based assessment and plan. Include overnight events and pertinent negatives.">${escapeHtml(preferences.attendingPreferences)}</textarea>
          </label>
        </div>
        <div class="button-row">
          <button class="button--primary" type="button" data-action="save-team-preferences">Save team preferences</button>
        </div>
      </section>

      <section class="panel settings-panel">
        <div class="section-heading">
          <div>
            <h2>Bring your own OpenAI key</h2>
            <p class="muted">Use your key to turn a reviewed, de-identified OpenEvidence workup draft into editable workup JSON.</p>
          </div>
        </div>
        <div class="notice settings-security-note">
          <strong>${apiKeySaved ? "An API key is saved in the encrypted vault." : "No API key is saved."}</strong>
          <span>The key is never displayed again, is encrypted at rest inside this browser's vault record, and is used only after you explicitly start a conversion. While the vault is unlocked, the browser must hold it in memory to make that request.</span>
        </div>
        <div class="settings-fields">
          <label class="settings-field-wide">OpenAI API key
            <input id="openAiApiKeyInput" type="password" autocomplete="new-password" spellcheck="false" placeholder="${apiKeySaved ? "Saved in encrypted vault; enter a new key to replace it" : "Paste an API key to enable automatic formatting"}">
          </label>
          <label>Model
            <select id="openAiModelInput">
              ${OPENAI_WORKUP_MODEL_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${preferences.openAiModel === option.value ? "selected" : ""}>${escapeHtml(`${option.label} — ${option.description}`)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="button-row">
          <button class="button--primary" type="button" data-action="save-openai-byok">Save encrypted key</button>
          <button class="button--quiet" type="button" data-action="clear-openai-byok" ${apiKeySaved ? "" : "disabled"}>Remove saved key</button>
        </div>
        <p class="muted settings-helper">Without a saved key, the Workups screen keeps the existing copy-and-paste ChatGPT formatter prompt as the fallback.</p>
      </section>
    </div>
  `;
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
  if (!apiKey) throw new Error("Enter an OpenAI API key before saving BYOK settings.");
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
  const output = byId("promptOutput");
  if (!patient || !output) return;
  try {
    output.value = buildCustomOpenEvidencePrompt({
      taskId: app.selectedPromptTask,
      template: app.promptDrafts[app.selectedPromptTask] ?? promptTemplateForTask(app.selectedPromptTask, app.promptTemplates),
      patient,
      selectedDayId: app.promptDayId,
      guidelines: app.guidelines,
      teamPreferences: app.vault.preferences
    });
  } catch (error) {
    output.value = error instanceof Error ? error.message : "Unable to build prompt.";
  }
}

function renderQuickDeidReview() {
  const review = app.quickDeid.review;
  const warnings = review?.warnings || app.quickDeid.warnings || [];
  const activeWarnings = warnings
    .map((warning, index) => ({ warning, index }))
    .filter(({ index }) => !review?.dismissedWarningIndexes?.has(index));
  if (!review) {
    return `
      <div class="quick-review-empty notice">
        <strong>No review session yet</strong>
        <p class="quick-deid-step-helper">Run de-identification to inspect individual redactions and residual PHI flags.</p>
      </div>
    `;
  }
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
  return `
    <div class="redaction-review quick-redaction-review" data-redaction-review>
      <div class="redaction-review-heading">
        <div>
          <strong>${queueStatus}</strong>
          <span class="muted">${pendingRedactions.length} unconfirmed redaction${pendingRedactions.length === 1 ? "" : "s"}; ${activeWarnings.length} remaining flag${activeWarnings.length === 1 ? "" : "s"}. Originals clear when this tab closes or you leave this tool.</span>
        </div>
        <div class="button-row">
          ${pendingRedactions.length ? `<button class="button--quiet" type="button" data-action="confirm-all-quick-redactions">Confirm all (${pendingRedactions.length})</button>` : ""}
          <button class="button--quiet" type="button" data-action="manual-redact-quick-selection">${icon("wand")} Redact highlighted text</button>
        </div>
      </div>
      ${renderRedactionDocument(app.quickDeid.output, review, { id: "quickDeidReviewDocument", action: "inspect-quick-redaction", label: "Annotated de-identified text" })}
      <p class="muted quick-review-instruction">The crossed-out value is the memory-only original; its replacement is safe to copy. Highlight any unmarked identifier in this one document, then choose Redact highlighted text.</p>
      ${activeRedaction ? `
        <div class="redaction-inspector quick-review-current redaction-inline-actions">
          <div>
            <strong>${activeRedactionIsConfirmed ? "Accepted redaction" : `Review ${escapeHtml(activeRedaction.placeholder)}`}</strong>
            <span>${activeRedactionIsConfirmed ? "Only the safe replacement is shown. Undo restores the source in this active tab." : "Accept keeps the replacement. Reject restores the source, then the next pending redaction opens in the center of this document."}</span>
          </div>
          <div class="button-row">
            ${activeRedactionIsConfirmed ? "" : `<button class="button--secondary" type="button" data-action="confirm-quick-redaction">Accept redaction</button>`}
            <button class="button--quiet" type="button" data-action="restore-quick-non-phi" data-redaction-index="${activeRedactionIndex}">${activeRedactionIsConfirmed ? "Undo redaction" : "Reject — restore source"}</button>
          </div>
        </div>
      ` : ""}
      ${!activeRedaction && activeWarning ? `
        <div class="quick-residual-review quick-review-current">
          <div>
            <strong>Residual PHI flag</strong>
            <span class="muted">Choose once; the next remaining flag opens automatically.</span>
          </div>
          <strong>${escapeHtml(warningDescription(activeWarning))}</strong>
          <div class="button-row">
            <button class="button--quiet" type="button" data-action="redact-quick-warning" data-warning-index="${activeWarningIndex}">Redact</button>
            <button class="button--quiet" type="button" data-action="dismiss-quick-warning" data-warning-index="${activeWarningIndex}">Not PHI</button>
          </div>
        </div>
      ` : ""}
      ${!activeRedaction && !activeWarning ? `<div class="quick-review-complete notice"><strong>Ready to copy</strong><p class="quick-deid-step-helper">You can still highlight any missed identifier in the document and redact it before copying.</p></div>` : ""}
    </div>
  `;
}

function renderQuickModelControl() {
  const option = selectedDeidOption();
  const state = option ? modelPackStateFor(option) : null;
  const busy = option && app.modelPackBusyKey === option.key;
  const progress = option ? app.modelPackProgress[option.key] : null;
  const error = option ? app.modelPackErrors[option.key] : "";
  let action = "";
  if (option?.requiresWebGpu && !app.webGpuAvailable) {
    action = `<span class="model-selection-message model-selection-message--error">This model requires WebGPU in this browser.</span>`;
  } else if (option && isInstallableModel(option) && !state.ready) {
    const actionName = state.state === "installed" ? "verify-model-pack" : "download-model-pack";
    const label = state.state === "installed" ? "Verify model" : "Download and verify";
    action = `<div class="button-row"><button type="button" data-action="${actionName}" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>${icon(state.state === "installed" ? "shield" : "download")} ${label}</button><button class="button--quiet" type="button" data-action="import-model-pack" data-model-key="${escapeHtml(option.key)}" ${app.modelPackBusyKey ? "disabled" : ""}>Import folder</button>${busy ? `<button class="button--quiet" type="button" data-action="cancel-model-download" data-model-key="${escapeHtml(option.key)}">Cancel</button>` : ""}</div>`;
  } else if (option) {
    action = `<span class="model-selection-message model-selection-message--ready">${icon("shield")} Verified and ready locally.</span>`;
  } else {
    action = `<span class="model-selection-message">Structured rules run locally without a model download.</span>`;
  }
  return `
    <section class="quick-model-control" aria-label="Local PII model">
      <label for="quickDeidMode">Local PII model</label>
      <div class="quick-model-control-row">
        <select id="quickDeidMode" aria-label="Local model">${deidModelSelectOptions()}</select>
        ${action}
      </div>
      <p class="muted">${escapeHtml(option?.description || "Use structured local redaction without a downloaded model.")}</p>
      ${app.quickDeid.status ? `<span class="model-selection-message" aria-live="polite">${escapeHtml(app.quickDeid.status)}</span>` : ""}
      ${progress ? `<div class="model-selection-progress" aria-live="polite"><progress data-active-model-progress value="${Math.max(0, progress.completedBytes)}" max="${Math.max(1, progress.totalBytes)}"></progress><span data-active-model-progress-text>${escapeHtml(modelPackProgressText(option))}</span></div>` : ""}
      ${error ? `<div class="model-selection-message model-selection-message--error" role="alert">${escapeHtml(error)}</div>${renderOpenMedSmallFallback(option)}` : ""}
    </section>
  `;
}

function renderQuickDeid() {
  const hasReview = Boolean(app.quickDeid.review);
  const deidReady = selectedDeidReadiness().ready;
  byId("quickDeidContent").innerHTML = `
    <section class="panel quick-deid-panel">
      <div class="section-heading quick-deid-heading">
        <div>
          <h2>Quick De-ID Tool</h2>
          <p class="muted">Review stays in this tab only. Copy the de-identified result when you are done.</p>
        </div>
        ${hasReview ? `<button class="button--quiet" type="button" data-action="start-new-quick-deid">${icon("plus")} New text</button>` : ""}
      </div>
      ${renderQuickModelControl()}
      ${hasReview ? `
        <section class="quick-review-workspace">
          ${renderQuickDeidReview()}
          <div class="quick-copy-footer">
            <span class="muted">Copy after you have corrected or accepted the marked changes.</span>
            <button class="button--primary" type="button" data-action="copy-quick-deid-output">${icon("copy")} Copy result</button>
          </div>
        </section>
      ` : `
        <section class="quick-deid-start">
          <label for="quickDeidInput">Source text</label>
          <textarea id="quickDeidInput" aria-label="Source text" spellcheck="false" placeholder="Paste text from any source">${escapeHtml(app.quickDeid.input)}</textarea>
          <div class="quick-deid-start-footer">
            <span class="muted">The selected model runs locally. Your text is not saved by this tool.</span>
            <button class="button--primary" type="button" data-action="run-quick-deid" ${deidReady ? "" : "disabled"}>${icon("shield")} Run de-identification</button>
          </div>
        </section>
      `}
    </section>
  `;
  scheduleQuickReviewFocus();
}

function renderPhoneChecklist() {
  const snapshot = app.phoneBundle.checklist;
  const allItems = snapshot?.items || [];
  const completed = completedCount(allItems, app.phoneAnswers);
  const remaining = Math.max(0, allItems.length - completed);
  const readyToReturn = allItems.length > 0 && remaining === 0;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  byId("checklistView").classList.add("active");
  byId("checklistContent").innerHTML = `
    <div class="checklist-shell">
      <section class="panel checklist-panel">
        <div class="section-heading">
          <div>
            <h2>${escapeHtml(app.phoneBundle.patientLabel || "Patient")}</h2>
            <p class="muted">Phone checklist · answers stay on this phone until returned.</p>
          </div>
          <div class="button-row">
            <button class="button--secondary" type="button" data-action="fill-all-negatives" ${remaining ? "" : "disabled"}>Fill all remaining baseline</button>
            ${app.phoneReturnReady && readyToReturn ? `<button type="button" data-action="copy-phone-return">Copy return bundle</button>` : ""}
          </div>
        </div>
        <div class="phone-completion-bar ${readyToReturn ? "ready" : ""}">
          <div>
            <strong>${readyToReturn ? "Checklist complete." : `${remaining} item${remaining === 1 ? "" : "s"} remain.`}</strong>
            <span>${readyToReturn ? "Confirm when you are ready to generate the return code." : "The return code stays hidden until every history and exam item has an answer."}</span>
          </div>
          ${readyToReturn && !app.phoneReturnReady ? `<button class="button--primary" type="button" data-action="show-phone-return">Finish & show return code</button>` : ""}
        </div>
        <div id="checklistSections" class="checklist-scroll">
          ${renderChecklistSection("History", groupChecklistItems(snapshot).history, app.phoneAnswers, { showBulkControls: false })}
          ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, app.phoneAnswers, { showBulkControls: false })}
        </div>
      </section>
      ${app.phoneReturnReady && readyToReturn ? `
        <section class="panel phone-transfer phone-return-ready">
          <h3>Return answers</h3>
          <p class="muted">Scan or copy this code only after finishing the bedside checklist.</p>
          <div id="returnQr" class="qr-box"></div>
          <textarea id="phoneReturnBundle" rows="6" readonly>${escapeHtml(encodeChecklistReturnBundle(createChecklistReturnBundle(snapshot, app.phoneAnswers)))}</textarea>
        </section>` : ""}
    </div>
  `;
  if (app.phoneReturnReady && readyToReturn) {
    renderQr(byId("returnQr"), `#return=${encodeChecklistReturnBundle(createChecklistReturnBundle(snapshot, app.phoneAnswers))}`);
  }
  renderStatusBar();
}

function renderQr(container, text) {
  if (!container) return;
  try {
    if (!window.qrcode) throw new Error("QR generator unavailable.");
    const qr = window.qrcode(0, "L");
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag(4, 2);
  } catch (error) {
    container.innerHTML = `<div class="qr-fallback">${escapeHtml(error instanceof Error ? error.message : "QR unavailable. Use copy/download.")}</div>`;
  }
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
    const ready = selectedDeidReadiness().ready && !app.deidOperation.active;
    document.querySelectorAll('[data-action="save-context"], [data-action="save-day"]').forEach((button) => {
      button.disabled = !ready;
      button.textContent = app.deidOperation.active ? "De-identifying…" : "Save changes";
    });
  }
  if (app.view === "quickDeid") renderQuickDeid();
  renderStatusBar();
}

async function deidentify(rawText) {
  return deidentifyText(rawText, {
    mode: app.deidMode,
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
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (!app.phoneBundle && !vaultIsUnlocked() && !["unlock-vault", "toggle-vault-passphrase", "restore-vault", "request-delete-vault", "confirm-delete-vault"].includes(action)) {
      throw new Error("Unlock the local vault before using workspace tools.");
    }
    if (action === "unlock-vault") await unlockVault();
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
    if (action === "add-workup-item") addWorkupItemRow(target.dataset.kind);
    if (action === "remove-workup-item") removeWorkupItemRow(target);
    if (action === "duplicate-workup-item") duplicateWorkupItemRow(target);
    if (action === "move-workup-item") await moveWorkupItemRow(target, target.dataset.direction);
    if (action === "save-workup-ui") await saveWorkupUi();
    if (action === "reset-workup-json") await resetWorkupJson();
    if (action === "export-workup-json") exportWorkupJson();
    if (action === "export-workup-library") exportWorkupLibrary();
    if (action === "parse-workup-json") await parseAndSaveWorkupJson(byId("workupJsonImport")?.value || "");
    if (action === "format-workup-json-api") await formatWorkupJsonWithSavedKey();
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
    if (action === "copy-open-evidence-workup-prompt") await copyOpenEvidenceWorkupPrompt();
    if (action === "copy-json-formatter-prompt") await copyJsonFormatterPrompt();
    if (action === "build-checklist") await buildChecklist();
    if (action === "go-workups") {
      app.view = "workups";
      render();
    }
    if (action === "go-settings") {
      app.view = "settings";
      render();
    }
    if (action === "copy-phone-bundle") await copyText(target.dataset.bundle || byId("phoneBundleText")?.value || "");
    if (action === "download-phone-bundle") downloadJson("phone-checklist-bundle.json", { bundle: target.dataset.bundle || "" });
    if (action === "import-phone-return") await importPhoneReturn();
    if (action === "copy-phone-return") await copyText(byId("phoneReturnBundle")?.value || "");
    if (action === "show-phone-return") showPhoneReturn();
    if (action === "fill-all-negatives") await fillChecklistNegatives();
    if (action === "fill-section-negatives") await fillChecklistNegatives({ kind: target.dataset.kind });
    if (action === "fill-system-negatives") await fillChecklistNegatives({ kind: target.dataset.kind, system: target.dataset.system });
    if (action === "save-prompt-template") savePromptTemplate();
    if (action === "reset-prompt-template") resetPromptTemplate();
    if (action === "insert-prompt-variable") insertPromptVariable(target.dataset.token);
    if (action === "copy-prompt") await copyText(byId("promptOutput")?.value || "");
    if (action === "open-open-evidence") window.open("https://www.openevidence.com/", "_blank", "noopener,noreferrer");
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
    if (action === "restore-quick-non-phi") restoreQuickNonPhi(Number(target.dataset.redactionIndex));
    if (action === "manual-redact-quick-selection") redactSelectedQuickText();
    if (action === "redact-quick-warning") redactQuickWarning(Number(target.dataset.warningIndex));
    if (action === "dismiss-quick-warning") dismissQuickWarning(Number(target.dataset.warningIndex));
  } catch (error) {
    app.workupImportError = action.includes("workup") ? error.message : app.workupImportError;
    setStatus(error instanceof Error ? error.message : "Action failed.");
    render();
  }
}

async function unlockVault() {
  const passphrase = byId("vaultPassphrase").value;
  if (!passphrase) {
    showVaultUnlockError("Enter the vault passphrase to continue.");
    return;
  }
  try {
    const vault = await loadOrCreateVault(passphrase);
    app.vault = vault;
    app.passphrase = passphrase;
    app.vaultUnlockError = "";
    app.view = active() ? "daily" : "vault";
    setStatus("Vault unlocked.");
    render();
  } catch {
    showVaultUnlockError("Could not unlock this vault. Check the passphrase and try again.");
  }
}

function lockVault() {
  clearSensitiveSession();
  app.view = "vault";
  setStatus("Vault locked.");
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
  byId("archiveConfirmDialog")?.close();
  await persistVault("Patient removed from the local roster.");
  render();
}

function requestArchivePatient(patientId) {
  const patient = app.vault?.patients?.find((entry) => entry.id === patientId);
  if (!patient) return;
  app.pendingArchivePatientId = patientId;
  byId("archiveConfirmText").textContent = `${patient.displayLabel} will be removed from this local roster.`;
  byId("archiveConfirmDialog")?.showModal();
}

function requestRemoveDay(dayId) {
  const day = active()?.days?.find((entry) => entry.id === dayId);
  if (!day) return;
  app.pendingRemoveDayId = dayId;
  byId("removeDayConfirmText").textContent = `${day.label} (${day.date}) and its saved checklist answers will be removed from this patient.`;
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
  if (destination && destination !== origin) refreshSectionReviewInEditor(destination, scope, activeTarget.sectionId);

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
  const nextPending = pending.find((target) => (
    target.sectionIndex > current.sectionIndex
    || (target.sectionIndex === current.sectionIndex && target.redactionIndex > current.redactionIndex)
  ));
  if (nextPending) return moveToSectionReviewTarget(scope, sectionId, nextPending);

  // When the final change in one field is accepted/rejected, move into the
  // next saved textbox even when it has no model detections. This keeps the
  // review flow field-by-field instead of closing the active editor.
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
  const editor = expandSectionEditor(scope, sectionId);
  refreshSectionReviewAtCurrentPosition(editor, scope, sectionId);
  setStatus(pending.length ? `${pending.length} redaction${pending.length === 1 ? "" : "s"} accepted. Click any highlighted replacement to undo it.` : "All redactions were already accepted.");
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

function nextPendingRedactionIndex(review, afterIndex = -1) {
  const pending = (review?.redactions || [])
    .map((redaction, index) => ({ redaction, index }))
    .filter(({ redaction }) => redaction.state === "pending");
  if (!pending.length) return -1;
  return pending.find(({ index }) => index > afterIndex)?.index ?? pending[0].index;
}

function inspectedRedactionIndex(review) {
  const index = review?.inspectedRedactionIndex;
  return Number.isInteger(index) && index >= 0 && review?.redactions?.[index] ? index : -1;
}

function quickRedactionIndex(review, afterIndex = -1) {
  const pending = (review?.redactions || [])
    .map((redaction, index) => ({ redaction, index }))
    .filter(({ redaction }) => redaction.state === "pending");
  if (!pending.length) return -1;
  const selected = inspectedRedactionIndex(review);
  if (selected >= 0 && review.redactions[selected]?.state === "pending") return selected;
  return nextPendingRedactionIndex(review, afterIndex);
}

function quickSelectedRedactionIndex(review) {
  const selected = inspectedRedactionIndex(review);
  if (selected >= 0 && review?.redactions?.[selected]?.state !== "restored") return selected;
  return quickRedactionIndex(review);
}

function quickWarningIndex(review, activeWarnings, afterIndex = -1) {
  if (!activeWarnings.length) return -1;
  const selected = Number(review?.activeWarningIndex);
  if (activeWarnings.some(({ index }) => index === selected)) return selected;
  return activeWarnings.find(({ index }) => index > afterIndex)?.index ?? activeWarnings[0].index;
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
  // which is why replacing this panel previously jumped a clinician to the
  // top of the actual Quick De-ID scroll container.
  const scrollOwner = byId("quickDeidView");
  const pageTop = scrollOwner?.scrollTop ?? window.scrollY;
  renderQuickDeid();
  // Rendering replaces the document node. Restore the route's scroll owner
  // before centering the inner document so a click never teleports the user
  // to the top of the Quick De-ID view.
  if (scrollOwner) scrollOwner.scrollTop = pageTop;
  const documentElement = byId("quickDeidReviewDocument");
  const focusIndex = Number.isFinite(focusRedactionIndex) && focusRedactionIndex >= 0
    ? focusRedactionIndex
    : quickSelectedRedactionIndex(app.quickDeid.review);
  centerRedactionDocument(documentElement, focusIndex, () => {
    // Replacing the review panel must never move the clinician to the top of
    // the page. Restore the outer position after the focused span is laid out.
    if (scrollOwner) scrollOwner.scrollTop = pageTop;
    else window.scrollTo({ top: pageTop, behavior: "auto" });
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

function redactSelectedQuickText({ renderAfter = true } = {}) {
  const review = app.quickDeid.review;
  if (!review) throw new Error("Run de-identification before manually redacting text.");
  const { start, end } = selectedOutputRangeFromDocument(byId("quickDeidReviewDocument"), app.quickDeid.output);
  app.quickDeid.output = insertManualRedaction(app.quickDeid.output, review, start, end);
  setStatus("Selected text manually redacted for this Quick De-ID session.");
  if (renderAfter) renderQuickReviewAtCurrentPosition();
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
      const position = redaction ? text.indexOf(redaction.placeholder) : -1;
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

async function deidentifySectionRows(scope, containerId) {
  const rows = collectSectionRows(containerId);
  const retainedIds = new Set(rows.map((row) => row.id));
  for (const key of [...app.phiReviews.keys()]) {
    if (key.startsWith(`${scope}:`) && !retainedIds.has(key.slice(scope.length + 1))) app.phiReviews.delete(key);
  }
  const sections = await replaceSectionsFromFormAsync(rows, deidentify, {
    onResult: ({ row, result }) => {
      const key = reviewKey(scope, row.id);
      const existing = app.phiReviews.get(key);
      if (existing?.approvedRedactionIndexes?.size) return;
      app.phiReviews.set(key, createEphemeralRedactionReview(row.text, result));
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
  assertSelectedDeidReady();
  updateDeidOperation({ active: true, message: "Preparing admission fields for local de-identification…", value: 0, total: 1 });
  try {
    const sections = await deidentifySectionRows("context", "contextSections");
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
  assertSelectedDeidReady();
  updateDeidOperation({ active: true, message: "Preparing daily fields for local de-identification…", value: 0, total: 1 });
  try {
    const sections = await deidentifySectionRows("daily", "dailySections");
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
  const hardwareBlocker = await webGpuRuntimeBlocker(option);
  if (hardwareBlocker) {
    app.quickDeid.status = hardwareBlocker;
    setStatus(hardwareBlocker);
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
  const hardwareBlocker = await webGpuRuntimeBlocker(option);
  if (hardwareBlocker) {
    app.quickDeid.status = hardwareBlocker;
    setStatus(hardwareBlocker);
    refreshDeidControlsInActiveView();
    return;
  }
  app.modelPackBusyKey = option.key;
  app.modelPackErrors = { ...app.modelPackErrors, [option.key]: "" };
  app.quickDeid.status = `Verifying ${option.label} with local ${option.requiresWebGpu ? "WebGPU" : "CPU/WASM"} inference...`;
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

async function copyOpenEvidenceWorkupPrompt() {
  const patient = active();
  const prompt = buildOpenEvidenceWorkupDraftPrompt({
    patientContext: sectionsToPromptBlock(patient?.contextSections || [], "Saved patient context"),
    dailyTrajectory: buildTrajectoryBlock(patient, { selectedDayId: latestDay(patient?.days || [])?.id, includeAllDays: false }),
    workupTitle: byId("workupTitleInput")?.value || "",
    thoroughness: app.workupThoroughness,
    teamPreferences: app.vault.preferences
  });
  byId("workupPromptOutput").value = prompt;
  await copyText(prompt);
}

async function copyJsonFormatterPrompt() {
  const prompt = buildJsonFormatterPrompt({
    sourceText: byId("workupJsonImport")?.value || "",
    workupTitle: byId("workupTitleInput")?.value || ""
  });
  byId("workupPromptOutput").value = prompt;
  await copyText(prompt);
}

async function formatWorkupJsonWithSavedKey() {
  const preferences = currentPreferences();
  const sourceText = byId("workupJsonImport")?.value || app.workupImportDraft;
  const workupTitle = byId("workupTitleInput")?.value || "";
  if (!app.workupApiDeidConfirmed) throw new Error("Confirm that the pasted workup draft is de-identified before sending it to OpenAI.");
  app.workupImportDraft = sourceText;
  app.workupApiBusy = true;
  app.workupImportError = "";
  setStatus("Formatting the de-identified workup draft with the saved API key...");
  renderWorkups();
  try {
    const result = await formatWorkupDraftWithOpenAi({
      apiKey: preferences.openAiApiKey,
      model: preferences.openAiModel,
      sourceText,
      workupTitle
    });
    app.workupApiBusy = false;
    await parseAndSaveWorkupJson(JSON.stringify(result));
    setStatus("OpenAI formatted and loaded the workup JSON.");
  } catch (error) {
    app.workupApiBusy = false;
    app.workupImportError = error instanceof Error ? error.message : "Unable to format the workup draft with OpenAI.";
    setStatus(app.workupImportError);
    renderWorkups();
  }
}

async function buildChecklist() {
  const patient = active();
  const catalog = effectiveWorkupCatalog(app.vault.workupOverrides);
  const workups = findWorkupsById(catalog, app.vault.selectedWorkupIds);
  if (!workups.length) throw new Error("Select at least one workup.");
  const day = latestDay(patient.days) || createDailyRecord();
  const snapshot = createChecklistSnapshot(workups);
  const nextDay = {
    ...day,
    checklistSnapshot: snapshot,
    answers: emptyChecklistAnswers(snapshot),
    updatedAt: new Date().toISOString()
  };
  app.selectedDayId = nextDay.id;
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  app.view = "checklist";
  await persistVault("Checklist built.");
  render();
}

async function importPhoneReturn() {
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day?.checklistSnapshot) throw new Error("Build a checklist first.");
  const bundle = decodeChecklistReturnBundle(byId("phoneReturnText").value);
  const answers = mergeReturnedAnswers(day.answers || {}, bundle, day.checklistSnapshot);
  const nextDay = { ...day, answers, updatedAt: new Date().toISOString() };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault("Returned phone answers imported.");
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
  assertSelectedDeidReady();
  app.quickDeid.status = "Running de-identification...";
  renderQuickDeid();
  try {
    if (app.deidMode !== STRUCTURED_DEID_MODE) {
      const blocker = await selectedModelLoadBlocker(selectedDeidOption());
      if (blocker) throw new Error(blocker);
    }
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
    renderWorkups();
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
  if (event.target.id === "modelPackFolderInput" && event.target.files?.length && app.pendingModelPackKey) {
    void importSelectedModelPack(app.pendingModelPackKey, modelFilesFromInput(event.target.files));
    event.target.value = "";
  }
}

async function updateChecklistAnswer(input) {
  if (app.phoneBundle) {
    const item = app.phoneBundle.checklist.items.find((entry) => entry.id === input.name);
    app.phoneAnswers = setChecklistChoice(app.phoneAnswers, item, input.value, input.tagName === "SELECT" ? Boolean(input.value) : input.checked);
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
  if (!total || completedCount(snapshot.items, app.phoneAnswers) !== total) {
    throw new Error("Finish every history and physical exam item before generating the return code.");
  }
  app.phoneReturnReady = true;
  renderPhoneChecklist();
}

function handleInput(event) {
  if (event.target.id === "vaultPassphrase") {
    clearVaultUnlockError();
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
    app.smartMenuOpen = /(^|\s)@[\w-]*$/.test(beforeCursor);
    app.promptDrafts[app.selectedPromptTask] = event.target.value;
    byId("smartVariableMenu")?.classList.toggle("open", app.smartMenuOpen);
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
  if (!event.target.classList.contains("item-note-input")) return;
  const itemId = event.target.closest(".checklist-item")?.dataset.itemId;
  if (!itemId) return;
  if (app.phoneBundle) {
    app.phoneAnswers = setChecklistNote(app.phoneAnswers, itemId, event.target.value);
    const returnBundle = byId("phoneReturnBundle");
    if (returnBundle) returnBundle.value = encodeChecklistReturnBundle(createChecklistReturnBundle(app.phoneBundle.checklist, app.phoneAnswers));
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
}

function bindEvents() {
  decorateNavigation();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("toggle", handleToggle, true);
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!vaultIsUnlocked() && button.dataset.viewTarget !== "vault") {
        app.view = "vault";
        setStatus("Unlock the local vault before opening workspace tools.");
        render();
        return;
      }
      app.view = button.dataset.viewTarget;
      app.smartMenuOpen = false;
      render();
    });
  });
}

async function init() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.has("phone")) {
    app.phoneBundle = decodePhoneChecklistBundle(params.get("phone"));
    app.phoneAnswers = app.phoneBundle.answers || emptyChecklistAnswers(app.phoneBundle.checklist);
  }
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
  try {
    app.guidelines = await loadGuidelines();
    renderPrompts();
  } catch (error) {
    app.guidelines = { admission: "", progress: "" };
    setStatus(error instanceof Error ? error.message : "Unable to load the task-specific documentation standards.");
  }
}
