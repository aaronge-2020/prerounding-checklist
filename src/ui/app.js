import { saveOpenEvidenceOutput, createDailyRecord, latestDay, localCalendarDate, removeDay, sortDays, upsertDay, buildTrajectoryBlock } from "../daily-updates/days.js";
import { activePatient, archivePatient, createPatientRecord, removeWorkupOverride, setActivePatient, setSelectedWorkups, setWorkupOverride, updateActivePatient } from "../app/state/vault.js";
import { downloadJson, loadOrCreateVault, readEncryptedVaultRecord, saveEncryptedVault, writeEncryptedVaultRecord } from "../app/state/persistence.js";
import { addSection, removeSection, reorderSections, replaceSectionsFromFormAsync, sectionWarningSummary, sectionsToPromptBlock } from "../patient-context/sections.js";
import { deidentifyText, getAdvancedDeidStatus, getLoadedDeidModelStatuses, getSelectedDeidModelStatus, preloadAdvancedDeidModel } from "../patient-context/deid-client.js";
import { DEFAULT_DEID_MODEL_KEY, DEID_MODEL_OPTIONS, STRUCTURED_DEID_MODE, deidModelOptionByKey } from "../patient-context/deid-model-options.js";
import { buildCustomOpenEvidencePrompt, loadPromptTemplateOverrides, promptTemplateForTask, promptVariablesForPatient, savePromptTemplateOverrides } from "../prompts/custom-templates.js";
import { OPEN_EVIDENCE_TASKS } from "../prompts/open-evidence.js";
import { effectiveWorkupCatalog, findWorkupsById, parseWorkupJson } from "../workups/schema.js";
import { createBlankWorkup, createBlankWorkupItem, buildJsonFormatterPrompt, buildOpenEvidenceWorkupDraftPrompt, choicesToText, collectWorkupDraftFromDocument, groupWorkupItems, workupFromEditorDraft } from "../workups/editor.js";
import { createChecklistSnapshot } from "../workups/checklist-conversion.js";
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
} from "../checklist/state.js";
import { groupChecklistItemsBySystem } from "../checklist/grouping.js";
import { icon } from "./icons.js";

const app = {
  vault: null,
  passphrase: "",
  view: "vault",
  selectedDayId: "",
  selectedPromptTask: "initial_admission_rounds",
  selectedWorkupEditorId: "general-admission",
  draftWorkup: null,
  guidelines: "",
  phoneBundle: null,
  phoneAnswers: {},
  status: "",
  deidMode: DEFAULT_DEID_MODEL_KEY,
  deidStatus: getAdvancedDeidStatus(),
  loadingDeidModelKey: "",
  webGpuAvailable: typeof navigator !== "undefined" && Boolean(navigator.gpu),
  promptTemplates: loadPromptTemplateOverrides(),
  promptDrafts: {},
  smartMenuOpen: false,
  quickDeid: { input: "", output: "", warnings: [], status: "" },
  workupImportError: "",
  workupCatalogOpen: false,
  pendingArchivePatientId: "",
  pendingRemoveDayId: ""
};

const viewIds = ["vault", "daily", "workups", "checklist", "prompts", "quickDeid"];
const viewTitles = {
  vault: "Vault / Roster",
  daily: "Hospital Stay",
  workups: "Workups",
  checklist: "Checklist",
  prompts: "OpenEvidence Prompts",
  quickDeid: "Quick De-ID Tool"
};

let draggedWorkupRow = null;

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

function deidModelDisabledReason(option) {
  if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
  if (option.requiresWebGpu && !app.webGpuAvailable) return "Requires browser WebGPU support for local inference.";
  return "";
}

function deidModelSelectOptions() {
  const modelOptions = DEID_MODEL_OPTIONS.map((option) => {
    const reason = deidModelDisabledReason(option);
    const disabled = reason ? "disabled" : "";
    const suffix = reason ? ` - ${reason}` : "";
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

function loadedDeidModelSummary() {
  const loaded = getLoadedDeidModelStatuses();
  return loaded.length
    ? loaded.map((status) => status.label || status.modelId || status.modelKey).join(", ")
    : "None loaded";
}

function selectedDeidStateText() {
  if (app.loadingDeidModelKey === app.deidMode) {
    return `Loading ${deidModelLabel(app.deidMode)}...`;
  }
  const status = selectedDeidStatus();
  if (app.deidMode === STRUCTURED_DEID_MODE) return status.message;
  return status.ready ? `Ready: ${status.modelId || status.label || deidModelLabel(app.deidMode)}` : status.message;
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
  return `<button type="button" data-action="load-advanced-deid" ${deidLoadButtonDisabled() ? "disabled" : ""}>${icon("shield")} ${escapeHtml(deidLoadButtonLabel())}</button>`;
}

async function selectedModelLoadBlocker(option) {
  if (!option) return "Structured-only de-identification selected.";
  if (!option.browserRunnable) return option.disabledReason || "This model is not available in this browser build.";
  if (option.requiresWebGpu) {
    const available = await refreshWebGpuAvailability({ renderAfter: false });
    if (!available) return `${option.label} requires a browser with working WebGPU support. Select Ettin, GLiNER, Stanford clinical, or Structured only in this browser.`;
  }
  return "";
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
  const response = await fetch("./Guidelines.md", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load Guidelines.md (${response.status})`);
  return response.text();
}

function patientRequiredMessage() {
  return `<div class="empty-state">Unlock the vault and select or admit a patient.</div>`;
}

function decorateNavigation() {
  document.querySelectorAll(".primary-nav [data-icon]").forEach((button) => {
    if (button.dataset.decorated) return;
    const label = button.textContent.trim();
    button.innerHTML = `${icon(button.dataset.icon)}<span>${escapeHtml(label)}</span>`;
    button.dataset.decorated = "true";
  });
}

function render() {
  document.body.classList.toggle("phone-mode", Boolean(app.phoneBundle));
  if (app.phoneBundle) {
    renderPhoneChecklist();
    return;
  }
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
  renderStatusBar();
}

function renderStatusBar() {
  const patient = active();
  const record = readEncryptedVaultRecord();
  byId("currentPageTitle").textContent = viewTitles[app.view] || "Preround";
  byId("vaultStateLabel").textContent = app.vault ? "Vault unlocked" : record ? "Vault locked" : "No vault on this device";
  const deidStatus = selectedDeidStatus();
  byId("deidStateLabel").textContent = `De-ID: ${deidModelLabel(app.deidMode)} - ${deidStatus.ready ? "ready locally" : "not loaded"}`;
  byId("statusLine").textContent = app.status || "All data encrypted locally. No cloud sync. No PHI leaves this device.";
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

function renderVault() {
  const record = readEncryptedVaultRecord();
  const patients = app.vault?.patients || [];
  byId("vaultContent").innerHTML = `
    <div class="page-grid">
      <section class="panel">
        <div class="section-heading tight">
          <div>
            <h2>Encrypted local vault</h2>
            <p class="muted">Patient list, local admit/archive, encrypted export and restore.</p>
          </div>
          <div class="button-row">
            <button type="button" data-action="export-vault" ${record ? "" : "disabled"}>${icon("download")} Export vault</button>
            <button type="button" data-action="restore-vault">${icon("upload")} Restore vault</button>
            <input id="restoreVaultInput" type="file" accept="application/json" hidden>
          </div>
        </div>
        <div class="form-grid">
          <label>Vault passphrase
            <input id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="${record ? "Unlock existing vault" : "Create local vault"}">
          </label>
          <button type="button" data-action="unlock-vault">${record ? "Unlock vault" : "Create vault"}</button>
          <button type="button" data-action="lock-vault" ${app.vault ? "" : "disabled"}>Lock</button>
        </div>
      </section>

      <section class="table-panel">
        <div class="section-heading tight">
          <div>
            <h2>Patients (${patients.length})</h2>
            <p class="muted">Use local display labels only.</p>
          </div>
          <div class="form-grid">
            <label>Local display label
              <input id="newPatientLabel" placeholder="Room A - General Admission">
            </label>
            <button type="button" data-action="admit-patient" ${app.vault ? "" : "disabled"}>${icon("plus")} Admit patient</button>
          </div>
        </div>
        <div class="patient-list">
          ${patients.length ? patients.map(renderPatientRow).join("") : `<div class="empty-state">No patients in this local vault.</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderPatientRow(patient) {
  const selected = patient.id === app.vault?.activePatientId;
  const archived = Boolean(patient.archivedAt);
  const dayCount = patient.days?.length || 0;
  return `
    <div class="list-row ${selected ? "selected" : ""}">
      <div>
        <strong>${escapeHtml(patient.displayLabel)}</strong>
        <span class="muted">${archived ? `Archived ${escapeHtml(patient.archivedAt.slice(0, 10))}` : "Active"} · HD${Math.max(dayCount, 1)}</span>
      </div>
      <div class="button-row">
        <button type="button" data-action="select-patient" data-patient-id="${escapeHtml(patient.id)}">Select</button>
        <button type="button" data-action="archive-patient" data-patient-id="${escapeHtml(patient.id)}" ${archived ? "disabled" : ""}>${icon("archive")} Archive / Discharge</button>
      </div>
    </div>
  `;
}

function renderDeidStrip() {
  return `
    <div class="deid-strip deid-strip-compact">
      <div class="deid-inline-status">
        <strong>Advanced De-identification</strong>
        <span class="muted">Selected: ${escapeHtml(deidModelLabel(app.deidMode))} | ${escapeHtml(selectedDeidStateText())} | Loaded: ${escapeHtml(loadedDeidModelSummary())}</span>
      </div>
      <div class="button-row">
        <select id="deidModeSelect" aria-label="De-identification mode">
          ${deidModelSelectOptions()}
        </select>
        ${renderDeidLoadButton()}
      </div>
    </div>
  `;
}

function renderSectionEditor(section, scope) {
  const characterCount = section.deidentifiedText?.length || 0;
  return `
    <article class="section-editor" data-section-id="${escapeHtml(section.id)}" data-created-at="${escapeHtml(section.createdAt)}">
      <div class="section-toolbar">
        <span class="section-grip" title="Section order">${icon("grip")}</span>
        <input class="section-label" value="${escapeHtml(section.label)}" aria-label="Section label">
        <span class="section-meta">${characterCount ? `${characterCount} chars` : "Empty"}</span>
        <div class="button-row">
          <button class="icon-button" type="button" data-action="toggle-section-editor" title="Edit section" aria-label="Edit section" aria-expanded="false">${icon("edit")}</button>
          <button class="icon-button" type="button" data-action="move-section-up" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move up">↑</button>
          <button class="icon-button" type="button" data-action="move-section-down" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move down">↓</button>
          <button class="icon-button" type="button" data-action="remove-section" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Remove">${icon("trash")}</button>
        </div>
      </div>
      <textarea class="section-text" rows="5" spellcheck="false">${escapeHtml(section.deidentifiedText)}</textarea>
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
  const warnings = sectionWarningSummary(sections);
  if (!warnings.length) return `<div class="notice">No residual PHI warnings from the last save.</div>`;
  return `
    <div class="warning-box residual-review">
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
  if (selected && selected.id !== app.selectedDayId) app.selectedDayId = selected.id;
  byId("dailyContent").innerHTML = `
    <div class="stay-layout">
      <aside class="panel">
        <div class="section-heading tight">
          <div>
            <h2>Hospital day</h2>
            <p class="muted">User-labeled packets only.</p>
          </div>
        </div>
        <div class="timeline-rail">
          ${days.length ? days.map((day, index) => renderDayRow(day, selected?.id, index)).join("") : `<div class="empty-state">No hospital days saved.</div>`}
        </div>
        <details class="new-day-control" ${days.length ? "" : "open"}>
          <summary>${icon("plus")} Add day</summary>
          <div class="form-grid compact">
            <label>Date
              <input id="newDayDate" type="date" value="${localCalendarDate()}">
            </label>
            <label>Label
              <input id="newDayLabel" placeholder="HD2 - Today">
            </label>
            <button type="button" data-action="add-day">Add hospital day</button>
          </div>
        </details>
      </aside>
      <div class="stay-content">
        <section class="panel admission-packet">
          <details class="admission-packet-details" ${days.length ? "" : "open"}>
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
                  <button type="button" data-action="add-context-section">${icon("plus")} Add field</button>
                  <button type="button" data-action="save-context">Save admission packet</button>
                </div>
              </div>
              ${renderDeidStrip()}
              <div id="contextSections" class="section-list">
                ${patient.contextSections.map((section) => renderSectionEditor(section, "context")).join("")}
              </div>
              ${renderWarnings(patient.contextSections, "context")}
            </div>
          </details>
        </section>
        <section class="panel hospital-day-packet">
          ${
            selected
              ? `
                <div class="section-heading">
                  <div>
                    <h2>${escapeHtml(selected.label)}</h2>
                    <p class="muted">${escapeHtml(selected.date)} · User-labeled packets only. No automatic trend detection.</p>
                  </div>
                  <div class="button-row">
                    <button type="button" data-action="add-daily-section">${icon("plus")} Add field</button>
                    <button type="button" data-action="save-day">Save hospital day</button>
                    <button type="button" class="danger-subtle" data-action="remove-day">${icon("trash")} Remove day</button>
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
  const editorWorkup = app.draftWorkup || catalog.find((workup) => workup.id === app.selectedWorkupEditorId) || catalog[0] || createBlankWorkup();
  app.selectedWorkupEditorId = editorWorkup.id;
  const grouped = groupWorkupItems(editorWorkup);
  byId("workupsContent").innerHTML = `
    <section class="panel workup-editor-surface">
      <div class="workup-topline">
        <input id="workupTitleInput" class="workup-title-input" value="${escapeHtml(editorWorkup.title)}" aria-label="Workup title">
        <button class="icon-button" type="button" title="Current workup">${icon("workup")}</button>
        <label class="workup-alias-control">Aliases
          <input id="workupAliasesInput" value="${escapeHtml((editorWorkup.aliases || []).join(", "))}" placeholder="Gen Admit, Adult Admit">
        </label>
        <details class="workup-catalog-menu" ${app.workupCatalogOpen ? "open" : ""}>
          <summary title="Open workup catalog">${icon("settings")}</summary>
          <div class="workup-catalog-popover">
            <div class="section-heading tight">
              <div>
                <h3>Workup catalog</h3>
                <p class="muted">Select workups before building a checklist.</p>
              </div>
              <button type="button" data-action="new-workup">${icon("plus")} New</button>
            </div>
            <select id="workupEditorSelect" data-action="select-workup-editor" aria-label="Edit workup">
              ${catalog.map((workup) => `<option value="${escapeHtml(workup.id)}" ${workup.id === editorWorkup.id && !app.draftWorkup ? "selected" : ""}>Edit: ${escapeHtml(workup.title)}</option>`).join("")}
            </select>
            <div class="workup-list">
              ${catalog.map((workup) => renderWorkupRow(workup, selectedIds)).join("")}
            </div>
            <button type="button" data-action="build-checklist" ${selectedIds.size ? "" : "disabled"}>Build checklist</button>
          </div>
        </details>
      </div>
      <div class="workup-subtitle">The first choice in each row is the normal or negative baseline. Drag rows or use arrow controls to reorder.</div>

        <div class="workflow-strip">
          <div class="workflow-step"><strong>1 OpenEvidence draft</strong><span class="muted">Create H&P item set</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>2 GPT formats JSON</strong><span class="muted">Valid schema only</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>Parse & review</strong><span class="muted">Editable rows saved locally</span></div>
        </div>

        <input id="workupIdInput" value="${escapeHtml(editorWorkup.id)}" hidden>

        <div class="workup-columns">
          ${renderWorkupColumn("history", "History questions", grouped.history)}
          ${renderWorkupColumn("exam", "Physical exam items", grouped.exam)}
        </div>

        <div class="workup-footer-actions">
          <button type="button" data-action="copy-open-evidence-workup-prompt">OpenEvidence draft</button>
          <button type="button" data-action="copy-json-formatter-prompt">GPT formats JSON</button>
          <button type="button" data-action="export-workup-json">${icon("download")} Download workup</button>
          <button type="button" data-action="save-workup-ui">Save to catalog</button>
        </div>

        <details class="utility-panel workup-import" ${app.workupImportError ? "open" : ""}>
          <summary>
            <strong>Import completed JSON</strong>
            <span class="muted">Paste or import only when moving a workup into editable rows.</span>
          </summary>
          <div class="workup-import-body">
          <div class="section-heading tight">
            <div>
              <h3>Import JSON into editable rows</h3>
              <p class="muted">Paste or import JSON; parsed workups are automatically saved locally.</p>
            </div>
            <div class="button-row">
              <button type="button" data-action="parse-workup-json">Parse & save</button>
              <button type="button" data-action="choose-workup-file">${icon("upload")} Import file</button>
              <input id="workupJsonFileInput" type="file" accept="application/json" hidden>
            </div>
          </div>
          <textarea id="workupJsonImport" class="json-import" spellcheck="false" placeholder="Paste prerounding_workup_v1 JSON here. The parsed result becomes editable rows."></textarea>
          ${app.workupImportError ? `<div class="warning-box">${escapeHtml(app.workupImportError)}</div>` : `<div class="notice">JSON import is parsed into editable rows. No raw JSON editing in the main flow.</div>`}
          <textarea id="workupPromptOutput" rows="7" readonly placeholder="Copied AI workflow prompt appears here."></textarea>
          </div>
        </details>
        <button type="button" class="text-button" data-action="reset-workup-json">Remove local override</button>
      </section>
  `;
  bindWorkupReordering();
}

function renderWorkupRow(workup, selectedIds) {
  return `
    <label class="check-row">
      <input type="checkbox" class="workup-checkbox" value="${escapeHtml(workup.id)}" ${selectedIds.has(workup.id) ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(workup.title)}</strong>
        <span class="muted">${workup.items.filter((item) => item.kind === "history").length} history · ${workup.items.filter((item) => item.kind === "exam").length} exam</span>
      </span>
      <button type="button" data-action="edit-workup" data-workup-id="${escapeHtml(workup.id)}">${icon("edit")} Edit</button>
    </label>
  `;
}

function renderWorkupColumn(kind, title, items) {
  return `
    <div class="workup-column" data-workup-kind="${kind}">
      <div class="section-heading tight">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" data-action="add-workup-item" data-kind="${kind}">${icon("plus")} Add</button>
      </div>
      <div class="list-stack">
        ${items.map((item, index) => renderWorkupItemEditor(item, kind, index)).join("")}
      </div>
    </div>
  `;
}

function renderWorkupItemEditor(item, kind, index = 0) {
  return `
    <article class="workup-editor-card" data-workup-item-row data-kind="${kind}">
      <button class="icon-button workup-drag-handle" type="button" draggable="true" title="Drag to reorder ${kind} items" aria-label="Drag to reorder ${kind} item">${icon("grip")}</button>
      <span class="workup-row-number" aria-hidden="true">${index + 1}</span>
      <input data-field="item-text" value="${escapeHtml(item.text)}" aria-label="${kind} item text">
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
          <label>System<input data-field="item-system" value="${escapeHtml(item.system || "")}" placeholder="General"></label>
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
  byId("checklistContent").innerHTML = `
    <div class="checklist-shell">
      <section class="panel checklist-panel">
        <div class="section-heading">
          <div>
            <h2>Checklist${snapshot ? `: ${escapeHtml(snapshot.workupTitles.join(", "))}` : ""}</h2>
            <p class="muted">${snapshot ? `${snapshot.items.length} history/exam items for ${escapeHtml(day.label)}` : "Build a checklist from the Workups page."}</p>
          </div>
          <button type="button" data-action="go-workups">Build from workups</button>
        </div>
        ${
          snapshot
            ? `<div id="checklistSections" class="checklist-scroll">
                ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers)}
                ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers)}
              </div>`
            : `<div class="empty-state">No checklist has been built for this patient.</div>`
        }
      </section>
      ${snapshot ? renderPhoneTransfer(day) : `<section class="panel"><h3>Send to phone</h3><p class="muted">Build a checklist first.</p></section>`}
    </div>
  `;
  if (snapshot) renderChecklistQr(day);
}

function renderChecklistSection(title, items, answers) {
  const kind = items[0]?.kind || (title === "Physical Exam" ? "exam" : "history");
  const fillLabel = kind === "exam" ? "Fill remaining normal" : "Fill remaining negative";
  return `
    <section class="checklist-section">
      <div class="checklist-section-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="button-row">
          <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
          <button type="button" data-action="fill-section-negatives" data-kind="${escapeHtml(kind)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>
        </div>
      </div>
      ${
        items.length
          ? `
              <div class="checklist-column-head" aria-hidden="true">
                <span>${escapeHtml(title)}</span><span>Answer</span><span>Notes</span><span>Status</span>
              </div>
              ${groupChecklistItemsBySystem(items).map(({ system, items: groupedItems }) => renderChecklistSystem(system, groupedItems, answers, kind)).join("")}
            `
          : `<div class="empty-state">No ${escapeHtml(title.toLowerCase())} items in this checklist.</div>`
      }
    </section>
  `;
}

function renderChecklistSystem(system, items, answers, kind) {
  const fillLabel = kind === "exam" ? "Mark remaining normal" : "Mark remaining negative";
  return `
    <section class="checklist-system">
      <div class="checklist-system-header">
        <h4>${escapeHtml(system)}</h4>
        <div class="button-row">
          <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
          <button type="button" data-action="fill-system-negatives" data-kind="${escapeHtml(kind)}" data-system="${escapeHtml(system)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>
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
        <button type="button" data-action="copy-phone-bundle" data-bundle="${escapeHtml(phoneLink)}">${icon("copy")} Copy bundle</button>
        <button type="button" data-action="download-phone-bundle" data-bundle="${escapeHtml(bundle)}">${icon("download")} Download</button>
      </div>
      <label>Returned phone answers
        <textarea id="phoneReturnText" rows="5" placeholder="Paste return bundle"></textarea>
      </label>
      <button type="button" data-action="import-phone-return">Import from phone</button>
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
  const template = app.promptDrafts[task.id] ?? promptTemplateForTask(task.id, app.promptTemplates);
  let prompt = "";
  let promptError = "";
  try {
    prompt = buildCustomOpenEvidencePrompt({
      taskId: task.id,
      template,
      patient,
      selectedDayId: app.selectedDayId,
      guidelines: app.guidelines
    });
  } catch (error) {
    promptError = error instanceof Error ? error.message : "Unable to build prompt.";
  }
  const variables = promptVariablesForPatient(patient);
  byId("promptsContent").innerHTML = `
    <div class="prompt-layout">
      <section class="prompt-panel prompt-template-panel">
        <div class="prompt-panel-header">
          <div>
            <h2>Prompt template (editable)</h2>
            <p class="muted">Type @ to insert an admission field, checklist data, or @guidelines.</p>
          </div>
          <select id="promptTaskSelect" aria-label="Prompt type">
            ${OPEN_EVIDENCE_TASKS.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === task.id ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
          </select>
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
            <button type="button" data-action="save-prompt-template">Save prompt</button>
            <button type="button" data-action="reset-prompt-template">Reset</button>
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
          <button type="button" data-action="copy-prompt">Copy prompt</button>
          <button type="button" data-action="open-open-evidence">Open OpenEvidence</button>
        </div>
        <label>Store OpenEvidence output
          <textarea id="openEvidenceOutput" rows="7" placeholder="Paste OpenEvidence output for local reference"></textarea>
        </label>
        <button type="button" data-action="save-open-evidence-output">Save output to selected day</button>
      </section>
    </div>
  `;
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
      selectedDayId: app.selectedDayId,
      guidelines: app.guidelines
    });
  } catch (error) {
    output.value = error instanceof Error ? error.message : "Unable to build prompt.";
  }
}

function renderQuickDeid() {
  const option = selectedDeidOption();
  const status = selectedDeidStatus();
  byId("quickDeidContent").innerHTML = `
    <section class="panel quick-deid-panel">
      <div class="section-heading quick-deid-heading">
        <div>
          <h2>Quick De-ID Tool</h2>
          <p class="muted">Fast one-off de-identification. Output is not saved unless you copy it elsewhere.</p>
        </div>
        ${renderDeidLoadButton()}
      </div>
      <div class="quick-deid-grid">
        <label>1. Paste raw text
          <textarea id="quickDeidInput" spellcheck="false" placeholder="Paste text from any source">${escapeHtml(app.quickDeid.input)}</textarea>
        </label>
        <div class="stack">
          <label>2. Choose model
            <select id="quickDeidMode">
              ${deidModelSelectOptions()}
            </select>
          </label>
          <button type="button" data-action="run-quick-deid">Run de-identification</button>
          <div class="quick-model-status">${escapeHtml(app.quickDeid.status || status.message)}</div>
          ${option?.description ? `<div class="notice">${escapeHtml(option.description)}</div>` : ""}
        </div>
        <div class="${app.quickDeid.warnings.length ? "warning-box" : "notice"}">
          <strong>3. Review residual PHI</strong>
          ${
            app.quickDeid.warnings.length
              ? `<div class="residual-warning-list">${app.quickDeid.warnings
                  .map(
                    (warning, warningIndex) => `
                      <button type="button" class="residual-warning" data-action="review-quick-warning" data-warning-index="${warningIndex}" title="Select this text in the editable output for manual review">
                        <span>Review</span>
                        <strong>${escapeHtml(warningDescription(warning))}</strong>
                      </button>
                    `
                  )
                  .join("")}</div>`
              : `<p>No residual warnings from the last run.</p>`
          }
        </div>
        <label>4. De-identified output
          <textarea id="quickDeidOutput" spellcheck="false">${escapeHtml(app.quickDeid.output)}</textarea>
          <button type="button" data-action="copy-quick-deid-output">${icon("copy")} Copy output</button>
        </label>
      </div>
    </section>
  `;
}

function renderPhoneChecklist() {
  const snapshot = app.phoneBundle.checklist;
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
          <button type="button" data-action="copy-phone-return">Copy return bundle</button>
        </div>
        <div id="checklistSections" class="checklist-scroll">
          ${renderChecklistSection("History", groupChecklistItems(snapshot).history, app.phoneAnswers)}
          ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, app.phoneAnswers)}
        </div>
      </section>
      <section class="panel phone-transfer">
        <h3>Return answers</h3>
        <div id="returnQr" class="qr-box"></div>
        <textarea id="phoneReturnBundle" rows="6" readonly>${escapeHtml(encodeChecklistReturnBundle(createChecklistReturnBundle(snapshot, app.phoneAnswers)))}</textarea>
      </section>
    </div>
  `;
  renderQr(byId("returnQr"), `#return=${encodeChecklistReturnBundle(createChecklistReturnBundle(snapshot, app.phoneAnswers))}`);
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
}

async function deidentify(rawText) {
  return deidentifyText(rawText, {
    mode: app.deidMode,
    onStatus: updateDeidStatus,
    onProgress: (progress) => {
      if (progress?.message) setStatus(progress.message);
    }
  });
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === "unlock-vault") await unlockVault();
    if (action === "lock-vault") lockVault();
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
        if (isExpanded) requestAnimationFrame(() => editor.querySelector(".section-text")?.focus());
      }
    }
    if (action === "add-context-section") await mutateSections("context", (sections) => addSection(sections, "Other"));
    if (action === "add-daily-section") await mutateSections("daily", (sections) => addSection(sections, "Other"));
    if (action === "move-section-up") await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "up"));
    if (action === "move-section-down") await mutateSections(target.dataset.scope, (sections) => reorderSections(sections, target.dataset.sectionId, "down"));
    if (action === "remove-section") await mutateSections(target.dataset.scope, (sections) => removeSection(sections, target.dataset.sectionId));
    if (action === "review-section-warning") reviewSectionWarning(target.dataset);
    if (action === "save-context") await saveContext();
    if (action === "add-day") await addDay();
    if (action === "select-day") {
      app.selectedDayId = target.dataset.dayId;
      render();
    }
    if (action === "save-day") await saveDay();
    if (action === "load-advanced-deid") await loadAdvancedModel();
    if (action === "new-workup") newWorkup();
    if (action === "edit-workup") editWorkup(target.dataset.workupId);
    if (action === "add-workup-item") addWorkupItemRow(target.dataset.kind);
    if (action === "remove-workup-item") removeWorkupItemRow(target);
    if (action === "duplicate-workup-item") duplicateWorkupItemRow(target);
    if (action === "move-workup-item") await moveWorkupItemRow(target, target.dataset.direction);
    if (action === "save-workup-ui") await saveWorkupUi();
    if (action === "reset-workup-json") await resetWorkupJson();
    if (action === "export-workup-json") exportWorkupJson();
    if (action === "parse-workup-json") await parseAndSaveWorkupJson(byId("workupJsonImport")?.value || "");
    if (action === "choose-workup-file") byId("workupJsonFileInput").click();
    if (action === "copy-open-evidence-workup-prompt") await copyOpenEvidenceWorkupPrompt();
    if (action === "copy-json-formatter-prompt") await copyJsonFormatterPrompt();
    if (action === "build-checklist") await buildChecklist();
    if (action === "go-workups") {
      app.view = "workups";
      render();
    }
    if (action === "copy-phone-bundle") await copyText(target.dataset.bundle || byId("phoneBundleText")?.value || "");
    if (action === "download-phone-bundle") downloadJson("phone-checklist-bundle.json", { bundle: target.dataset.bundle || "" });
    if (action === "import-phone-return") await importPhoneReturn();
    if (action === "copy-phone-return") await copyText(byId("phoneReturnBundle")?.value || "");
    if (action === "fill-section-negatives") await fillChecklistNegatives({ kind: target.dataset.kind });
    if (action === "fill-system-negatives") await fillChecklistNegatives({ kind: target.dataset.kind, system: target.dataset.system });
    if (action === "save-prompt-template") savePromptTemplate();
    if (action === "reset-prompt-template") resetPromptTemplate();
    if (action === "insert-prompt-variable") insertPromptVariable(target.dataset.token);
    if (action === "copy-prompt") await copyText(byId("promptOutput")?.value || "");
    if (action === "open-open-evidence") window.open("https://www.openevidence.com/", "_blank", "noopener,noreferrer");
    if (action === "save-open-evidence-output") await saveEvidenceOutput();
    if (action === "run-quick-deid") await runQuickDeid();
    if (action === "copy-quick-deid-output") await copyText(app.quickDeid.output || byId("quickDeidOutput")?.value || "");
    if (action === "review-quick-warning") reviewQuickWarning(Number(target.dataset.warningIndex));
  } catch (error) {
    app.workupImportError = action.includes("workup") ? error.message : app.workupImportError;
    setStatus(error instanceof Error ? error.message : "Action failed.");
    render();
  }
}

async function unlockVault() {
  const passphrase = byId("vaultPassphrase").value;
  app.vault = await loadOrCreateVault(passphrase);
  app.passphrase = passphrase;
  app.view = active() ? "daily" : "vault";
  setStatus("Vault unlocked.");
  render();
}

function lockVault() {
  app.vault = null;
  app.passphrase = "";
  app.view = "vault";
  setStatus("Vault locked.");
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

function reviewSectionWarning({ scope, sectionId, warningIndex }) {
  const patient = active();
  const sections = scope === "daily" ? selectedChecklistDay(patient)?.sections : patient?.contextSections;
  const section = (sections || []).find((entry) => entry.id === sectionId);
  const warning = section?.residualWarnings?.[Number(warningIndex)];
  const editor = document.querySelector(`.section-editor[data-section-id="${CSS.escape(sectionId || "")}"]`);
  if (!section || !editor) return;
  editor.classList.add("is-expanded");
  const didSelect = focusWarningText(editor.querySelector(".section-text"), warning);
  setStatus(didSelect ? "Flagged text selected for manual review." : "Opened the flagged field for manual review.");
}

function reviewQuickWarning(warningIndex) {
  const warning = app.quickDeid.warnings?.[warningIndex];
  const didSelect = focusWarningText(byId("quickDeidOutput"), warning);
  setStatus(didSelect ? "Flagged text selected for manual review." : "Opened the de-identified output for manual review.");
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
  app.vault = null;
  app.passphrase = "";
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

async function saveContext() {
  setStatus("Running de-identification before saving context...");
  const sections = await replaceSectionsFromFormAsync(collectSectionRows("contextSections"), deidentify);
  app.vault = updateActivePatient(app.vault, (patient) => ({ ...patient, contextSections: sections }));
  await persistVault("Context saved as de-identified local text.");
  render();
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
  setStatus("Running de-identification before saving day...");
  const sections = await replaceSectionsFromFormAsync(collectSectionRows("dailySections"), deidentify);
  const nextDay = { ...day, sections, updatedAt: new Date().toISOString() };
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault("Daily update saved as de-identified local text.");
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
  setStatus(`Loading ${option.label}...`);
  renderStatusBar();
  if (app.view === "quickDeid") renderQuickDeid();
  if (app.view === "daily") renderDaily();
  try {
    const loadedStatus = await preloadAdvancedDeidModel({
      modelKey: requestedKey,
      onStatus: updateDeidStatus,
      onProgress: (progress) => {
        if (progress?.message) setStatus(progress.message);
      }
    });
    app.deidStatus = loadedStatus;
    setStatus(`${option.label} loaded locally.`);
  } finally {
    if (app.loadingDeidModelKey === requestedKey) app.loadingDeidModelKey = "";
  }
  render();
}

function newWorkup() {
  app.draftWorkup = createBlankWorkup({ title: "New Workup" });
  app.selectedWorkupEditorId = app.draftWorkup.id;
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
  if (!sibling?.matches("[data-workup-item-row]")) return;
  if (direction === "up") list.insertBefore(row, sibling);
  else list.insertBefore(sibling, row);
  updateWorkupRowNumbers(list);
  await saveWorkupUi("Workup item order saved.");
}

function updateWorkupRowNumbers(list) {
  [...(list?.querySelectorAll("[data-workup-item-row]") || [])].forEach((row, index) => {
    const number = row.querySelector(".workup-row-number");
    if (number) number.textContent = String(index + 1);
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

function bindWorkupReordering() {
  const lists = [...document.querySelectorAll("[data-workup-kind] .list-stack")];
  document.querySelectorAll(".workup-drag-handle").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      draggedWorkupRow = handle.closest("[data-workup-item-row]");
      if (!draggedWorkupRow) return;
      draggedWorkupRow.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedWorkupRow.dataset.kind || "");
    });
    handle.addEventListener("dragend", () => {
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
      const target = workupDropTarget(list, event.clientY);
      if (target) list.insertBefore(draggedWorkupRow, target);
      else list.append(draggedWorkupRow);
      updateWorkupRowNumbers(list);
    });
    list.addEventListener("drop", (event) => {
      if (!draggedWorkupRow) return;
      event.preventDefault();
      void saveWorkupUi("Workup item order saved.").catch((error) => {
        setStatus(error instanceof Error ? error.message : "Unable to save workup order.");
        renderWorkups();
      });
    });
  });
}

async function saveWorkupUi(message = "Local workup saved.") {
  const workup = workupFromEditorDraft(collectWorkupDraftFromDocument(document));
  app.vault = setWorkupOverride(app.vault, workup);
  app.selectedWorkupEditorId = workup.id;
  app.draftWorkup = null;
  app.workupImportError = "";
  await persistVault(message);
  render();
}

async function resetWorkupJson() {
  app.vault = removeWorkupOverride(app.vault, app.selectedWorkupEditorId);
  app.draftWorkup = null;
  await persistVault("Local workup override removed.");
  render();
}

function currentEditorWorkup() {
  return workupFromEditorDraft(collectWorkupDraftFromDocument(document));
}

function exportWorkupJson() {
  const workup = currentEditorWorkup();
  downloadJson(`${workup.id}.workup.json`, workup);
}

async function parseAndSaveWorkupJson(text) {
  const workup = parseWorkupJson(text);
  app.vault = setWorkupOverride(app.vault, workup);
  app.selectedWorkupEditorId = workup.id;
  app.draftWorkup = null;
  app.workupImportError = "";
  await persistVault("Imported workup JSON parsed into editable rows.");
  render();
}

async function importWorkupFile(file) {
  await parseAndSaveWorkupJson(await file.text());
}

async function copyOpenEvidenceWorkupPrompt() {
  const patient = active();
  const prompt = buildOpenEvidenceWorkupDraftPrompt({
    patientContext: sectionsToPromptBlock(patient?.contextSections || [], "Saved patient context"),
    dailyTrajectory: buildTrajectoryBlock(patient, { selectedDayId: app.selectedDayId, includeAllDays: true }),
    workupTitle: byId("workupTitleInput")?.value || ""
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

async function saveEvidenceOutput() {
  const patient = active();
  const day = selectedChecklistDay(patient);
  if (!day) throw new Error("Select or create a hospital day first.");
  const output = byId("openEvidenceOutput").value;
  const nextDay = saveOpenEvidenceOutput(day, app.selectedPromptTask, output);
  app.vault = updateActivePatient(app.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
  await persistVault("OpenEvidence output saved locally.");
  render();
}

async function runQuickDeid() {
  app.quickDeid.input = byId("quickDeidInput")?.value || "";
  app.deidMode = byId("quickDeidMode")?.value || app.deidMode;
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
      status: result.modelId ? `Model used: ${result.modelId}` : result.modelStatus || "Structured redaction complete."
    };
    setStatus("Quick de-identification complete.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "De-identification failed.";
    app.quickDeid = {
      input: app.quickDeid.input,
      output: "",
      warnings: [message],
      status: message
    };
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
  if (event.target.id === "workupEditorSelect") {
    app.draftWorkup = null;
    app.selectedWorkupEditorId = event.target.value;
    app.workupCatalogOpen = true;
    renderWorkups();
  }
  if (event.target.id === "deidModeSelect" || event.target.id === "quickDeidMode") {
    app.deidMode = event.target.value;
    app.quickDeid.status = "";
    renderStatusBar();
    if (app.view === "daily") renderDaily();
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
  const scopedItems = allItems.filter((item) => item.kind === kind && (!system || groupChecklistItemsBySystem([item])[0]?.system === system));
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

function handleInput(event) {
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
    byId("phoneReturnBundle").value = encodeChecklistReturnBundle(createChecklistReturnBundle(app.phoneBundle.checklist, app.phoneAnswers));
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
    app.workupCatalogOpen = event.target.open;
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
    app.guidelines = "";
    setStatus(error instanceof Error ? error.message : "Unable to load Guidelines.md.");
  }
}
