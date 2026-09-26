import { CLOSING_SECTION_FIELDS, fieldsForNoteType, NOTE_TYPES, objectiveEditorGroups, SECTION_VISIBILITY_KEYS } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import {
  abnormalTone,
  compactLabTrendLine,
  compactVitalTrendLine,
  displayVitalName,
  joinValueUnit
} from "../../review-data/compact-summary.js?v=20260924-optional-sections-v1";
import { sanitizeProblemTitle } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import { baselineDisplayText, baselinePriorityFor } from "../../patient-context/lab-baselines.js?v=20260925-lab-baselines-v2";
import {
  EXAM_SYSTEMS,
  getExamSystem,
  getExamVar,
  normalizeSmartExam,
  SMART_EXAM_EMPTY,
  templateToSegments,
} from "../../clinical/exam-templates.js?v=20260925-exam-templates-v1";

function valueText(value) {
  if (value && typeof value === "object") return String(value.deidentifiedText || "");
  return String(value ?? "");
}

export function createReviewPresentation({ escapeHtml, icon }) {
  // Collapse state for draft sections, set by renderDraft before rendering.
  // editorSection reads it so every call site gets collapsibility for free.
  let activeCollapsedSections = null;
  const helpButton = (key, label, guidance) => `<button type="button" class="note-help-button" data-help-key="${escapeHtml(key)}" data-tooltip="${escapeHtml(guidance || "No additional guidance.")}" aria-label="Help for ${escapeHtml(label)}">?</button>`;
  // Pull button: copies the corresponding section text from the primary team
  // note (for the current hospital day) into this draft section as a starting point.
  const pullButton = (fieldId, label) => `<button type="button" class="note-pull-button" data-pull-section="${escapeHtml(fieldId)}" data-tooltip="Pull from primary team note" aria-label="Pull ${escapeHtml(label)} from primary note">⤓</button>`;

  // Compact clinical-data sheet: vitals strip, pending + report-only rows, and
  // laboratory rows regrouped by source panel family. No pagination: every
  // section renders its matching rows so the sheet is reviewable on one page.
  const normalizedQuery = (query) => String(query || "").trim().toLowerCase();
  const matchesQuery = (text, query) => !query || String(text || "").toLowerCase().includes(query);

  function flagPill(tone) {
    if (tone === "high") return `<span class="flag-pill flag-high" title="High">H</span>`;
    if (tone === "low") return `<span class="flag-pill flag-low" title="Low">L</span>`;
    if (tone === "abnormal" || tone === "critical") return `<span class="flag-pill flag-abnormal" title="Abnormal">!</span>`;
    return "";
  }

  function vitalStatus(candidate) {
    return String(candidate.status || candidate.latest?.status || "unknown").toLowerCase();
  }

  // Vitals render as dense lab-style rows (checkbox, name, value, meta) —
  // the same compact treatment as the laboratory rows below them.
  function renderVitalChip(candidate, selected, query) {
    if (!matchesQuery(candidate.searchText, query)) return "";
    const displayName = displayVitalName(candidate.name);
    // U16: no space before % or ° ("97%", "37.3°C").
    const value = joinValueUnit(candidate.latest?.value, candidate.latest?.unit) || "—";
    const tone = vitalStatus(candidate) === "unknown" ? "" : vitalStatus(candidate);
    // U2: a single observation has no range — never render "122–122".
    const stats24h = candidate.statistics24h;
    const hasRange = stats24h
      && Number.isFinite(stats24h.minimum)
      && Number.isFinite(stats24h.maximum)
      && stats24h.minimum !== stats24h.maximum;
    const stats = candidate.statisticsText
      || (hasRange
        ? `${stats24h.minimum}–${stats24h.maximum}${candidate.unit ? ` ${candidate.unit}` : ""} (24h)`
        : "");
    const trend = compactVitalTrendLine(candidate.displayTrend);
    const when = [candidate.latest?.dayLabel, candidate.latest?.timestamp].filter(Boolean).join(" · ");
    const meta = [trend, stats, when].filter(Boolean).join(" · ");
    // A temperature whose source never stated a unit has no checkbox: the
    // only way into the note is explicit °F/°C confirmation in the banner.
    const selectionControl = candidate.unitUnmarked
      ? `<span class="vital-chip-confirm-hint" title="Confirm the unit before adding this temperature to the note">confirm unit ↓</span>`
      : `<label class="lab-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>`;
    return `<div class="lab-row vital-row ${selected ? "is-selected" : ""} ${candidate.unitUnmarked ? "is-unit-unmarked" : ""}" data-review-candidate="${escapeHtml(candidate.id)}" data-clinical-emphasis="${escapeHtml(tone || "unknown")}">
      ${selectionControl}
      <span class="lab-row-name">${escapeHtml(displayName)}${flagPill(tone)}</span>
      <span class="lab-row-value"><strong>${escapeHtml(value)}</strong>${candidate.unitUnmarked ? ` <span class="unit-unmarked-flag" title="The source never stated this unit">unit not stated</span>` : ""}</span>
      ${meta ? `<span class="lab-row-meta">${escapeHtml(meta)}</span>` : ""}
    </div>`;
  }

  function renderTemperatureUnitBanner(vitals) {
    const unmarked = (vitals || []).filter((candidate) => candidate.unitUnmarked);
    if (!unmarked.length) return "";
    return `<div class="unit-confirm-banner" role="alert">
      <div><strong>Unit not stated in the source.</strong> ${unmarked.length === 1 ? "This temperature" : "These temperatures"} will stay out of the note until you confirm the unit — the app never guesses °F or °C.</div>
      ${unmarked.map((candidate) => {
        const reading = [candidate.latest?.value, candidate.latest?.unit].filter(Boolean).join(" ") || candidate.name;
        return `<div class="unit-confirm-row">
          <span>${escapeHtml(displayVitalName(candidate.name))} ${escapeHtml(reading)}</span>
          <span class="button-row">
            <button type="button" class="button--primary" data-action="confirm-temperature-unit" data-candidate-id="${escapeHtml(candidate.id)}" data-unit="°F">°F</button>
            <button type="button" class="button--primary" data-action="confirm-temperature-unit" data-candidate-id="${escapeHtml(candidate.id)}" data-unit="°C">°C</button>
          </span>
        </div>`;
      }).join("")}
    </div>`;
  }

  // A saved source the parsers could not structure stays visible as an
  // explicit opt-in card: the original de-identified text can be inspected
  // and checked into the note, never silently dropped.
  function renderNarrativeCard(candidate, selected, query) {
    if (!matchesQuery(candidate.searchText, query)) return "";
    return `<div class="narrative-card ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
      <div class="narrative-card-body">
        <div class="narrative-card-title"><strong>${escapeHtml(candidate.name)}</strong>${candidate.noteDetail ? `<span class="compact-row-meta">${escapeHtml(candidate.noteDetail)}</span>` : ""}</div>
        <p class="narrative-card-note">The parser could not structure this source — the original text is kept below for your review.</p>
        <details class="narrative-card-details"><summary>View original text</summary><pre>${escapeHtml(candidate.narrativeText || "")}</pre></details>
      </div>
    </div>`;
  }

  function renderNarrativeCards(candidates, selectedIds, query) {
    return (candidates || [])
      .filter((candidate) => candidate.kind === "narrative")
      .map((candidate) => renderNarrativeCard(candidate, selectedIds.has(candidate.id), query))
      .filter(Boolean)
      .join("");
  }

  function renderVitalsSection(vitals, selectedIds, query) {
    const structured = (vitals || []).filter((candidate) => candidate.kind !== "narrative");
    const chips = structured.map((candidate) => renderVitalChip(candidate, selectedIds.has(candidate.id), query)).filter(Boolean);
    const narratives = renderNarrativeCards(vitals, selectedIds, query);
    if (!chips.length && !narratives) return "";
    return `<section class="compact-section compact-vitals" data-compact-section="vitals" aria-label="Vital signs">
      <div class="compact-section-heading"><h3>Vital signs</h3><span class="compact-section-meta">${chips.length} saved · included automatically</span></div>
      ${renderTemperatureUnitBanner(structured)}
      <p class="compact-section-note">All vitals flow into the note by default. Uncheck any row to leave it out.</p>
      ${chips.length ? `<div class="lab-rows vital-rows">${chips.join("")}</div>` : ""}
      ${narratives}
    </section>`;
  }

  function renderFlaggedRow(item, selected, query, kind) {
    const candidate = item.selectionCandidate;
    if (!matchesQuery(candidate.searchText, query)) return "";
    const statusLabel = kind === "report" ? "Report" : (item.pendingLabel || "Pending");
    const statusClass = kind === "report" ? "status-report" : "status-pending";
    return `<li class="compact-row ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" data-lab-result-selection="${escapeHtml(item.panelId)}" aria-label="Include ${escapeHtml(item.result.name)}${kind === "report" ? " report placeholder" : " (pending)"} in the note" ${selected ? "checked" : ""}></label>
      <span class="compact-row-name"><strong>${escapeHtml(item.result.name)}</strong>${item.contextLabel ? `<small>${escapeHtml(item.contextLabel)}</small>` : ""}</span>
      <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
      ${kind === "report" && item.pendingLabel ? `<span class="status-pill status-pending">${escapeHtml(item.pendingLabel)}</span>` : ""}
    </li>`;
  }

  function collapsibleHeading({ key, label, meta, collapsed, query }) {
    return `<div class="compact-section-heading">
      <button type="button" class="lab-family-toggle" data-action="toggle-lab-family" data-family="${escapeHtml(key)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "Expand" : "Collapse"} ${escapeHtml(label)}">
        <span class="lab-family-caret" aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
        <h3>${escapeHtml(label)}</h3>
      </button>
      ${meta ? `<span class="compact-section-meta">${meta}</span>` : ""}
    </div>`;
  }

  function renderPendingSection(items, selectedIds, query, options = {}) {
    const rows = (items || []).map((item) => renderFlaggedRow(item, selectedIds.has(item.selectionCandidate.id), query, "pending")).filter(Boolean);
    if (!rows.length) return "";
    const collapsed = options.collapsedFamilies?.has("pending") && !query;
    return `<section class="compact-section compact-pending" data-compact-section="pending" aria-label="Pending results">
      ${collapsibleHeading({ key: "pending", label: "Pending results", meta: `${rows.length} awaiting`, collapsed, query })}
      ${collapsed ? "" : `<p class="compact-section-note">Auto-detected from saved sources. No result to copy yet.</p><ul class="compact-rows">${rows.join("")}</ul>`}
    </section>`;
  }

  function renderReportSection(items, selectedIds, query, options = {}) {
    const rows = (items || []).map((item) => renderFlaggedRow(item, selectedIds.has(item.selectionCandidate.id), query, "report")).filter(Boolean);
    if (!rows.length) return "";
    const collapsed = options.collapsedFamilies?.has("reports") && !query;
    return `<section class="compact-section compact-reports" data-compact-section="reports" aria-label="Reports to review">
      ${collapsibleHeading({ key: "reports", label: "Reports to review", meta: `${rows.length} report${rows.length === 1 ? "" : "s"}`, collapsed, query })}
      ${collapsed ? "" : `<p class="compact-section-note">Report-only placeholders. Open each full report in Results Review — the placeholder text is not the report.</p><ul class="compact-rows">${rows.join("")}</ul>`}
    </section>`;
  }

  // One dense single-line row per lab: checkbox, name + flag, value + ref,
  // trend/baseline metadata, baseline action. A lab must never consume a
  // large card.
  function renderLabRow({ result, panel }, selectedIds, query, options = {}) {
    const selection = result.selectionCandidate;
    if (!selection || !matchesQuery(selection.searchText, query)) return "";
    const selected = selectedIds.has(selection.id);
    const tone = abnormalTone(result);
    const value = [result.value, result.unit].filter(Boolean).join(" ") || "—";
    const trendPoints = result.displayTrend || [];
    const trend = trendPoints.length >= 2 ? compactLabTrendLine(result) : "";
    const baseline = result.baseline?.value ? baselineDisplayText(result.baseline) : "";
    const meta = [trend, result.referenceRange ? `Ref ${result.referenceRange}` : "", baseline ? `base ${baseline}` : ""].filter(Boolean).join(" · ");
    const editing = options.baselineEditorId === selection.id;
    // Baseline-priority analytes (creatinine, troponin, hemoglobin, ...):
    // when no baseline exists, show a prominent warning that prompts the
    // student to enter one. Interpretation of these labs depends on change
    // from the patient's own baseline, not just the reference range.
    const priority = !result.baseline?.value ? baselinePriorityFor(result.name) : null;
    const baselineButton = baseline
      ? `<button type="button" class="lab-baseline-toggle" data-action="baseline-edit" data-baseline-result-id="${escapeHtml(selection.id)}" title="${escapeHtml(result.baseline?.note || "Edit the patient baseline for this analyte")}">Edit base</button>`
      : priority
        ? `<button type="button" class="lab-baseline-toggle lab-baseline-warning" data-action="baseline-edit" data-baseline-result-id="${escapeHtml(selection.id)}" title="${escapeHtml(`Baseline recommended — ${priority.rationale} (${priority.source})`)}"><span class="lab-baseline-warning-icon" aria-hidden="true">⚠️</span>Set baseline</button>`
        : `<button type="button" class="lab-baseline-toggle" data-action="baseline-edit" data-baseline-result-id="${escapeHtml(selection.id)}" title="Set a patient baseline for this analyte">Set base</button>`;
    return `<div class="lab-row ${selected ? "is-selected" : ""}${priority ? " lab-row-needs-baseline" : ""}" data-review-candidate="${escapeHtml(selection.id)}" data-clinical-emphasis="${escapeHtml(tone || "unknown")}">
      <label class="lab-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(selection.id)}" data-lab-result-selection="${escapeHtml(panel.id)}" aria-label="Include only ${escapeHtml(result.name)} from ${escapeHtml(panel.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="lab-row-name">${escapeHtml(result.name)}${flagPill(tone)}${result.flag ? `<span class="lab-row-flag">${escapeHtml(result.flag)}</span>` : ""}${priority ? `<span class="lab-baseline-needed" title="${escapeHtml(`Baseline recommended — ${priority.rationale}`)}">!</span>` : ""}</span>
      <span class="lab-row-value"><strong>${escapeHtml(value)}</strong></span>
      ${meta ? `<span class="lab-row-meta">${escapeHtml(meta)}</span>` : ""}
      ${baselineButton}
      ${editing ? renderBaselineEditor(result, selection) : ""}
    </div>`;
  }

  function renderBaselineEditor(result, selection) {
    const baseline = result.baseline || {};
    const field = (name, label, value, placeholder) => `<label class="lab-baseline-field"><span>${escapeHtml(label)}</span><input data-baseline-field="${name}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder || "")}" autocomplete="off"></label>`;
    return `<div class="lab-baseline-editor" data-baseline-editor="${escapeHtml(selection.id)}" data-baseline-analyte="${escapeHtml(result.name)}">
      <div class="lab-baseline-grid">
        ${field("value", "Baseline value", baseline.value, "e.g. 0.9")}
        ${field("unit", "Unit", baseline.unit || result.unit, result.unit || "e.g. mg/dL")}
        ${field("dateLabel", "When", baseline.dateLabel, "e.g. Sep 2024")}
        ${field("note", "Note (optional)", baseline.note, "e.g. outpatient lab")}
      </div>
      <div class="button-row lab-baseline-actions">
        <button type="button" class="button--primary" data-action="baseline-save">Save baseline</button>
        ${baseline.value ? `<button type="button" data-action="baseline-clear">Clear</button>` : ""}
        <button type="button" data-action="baseline-cancel">Cancel</button>
      </div>
    </div>`;
  }

  function renderLabFamily(section, selectedIds, query, options = {}) {
    const labelMatches = matchesQuery(section.label, query);
    const rows = section.rows
      .map((entry) => renderLabRow(entry, selectedIds, labelMatches ? "" : query, options))
      .filter(Boolean);
    if (!rows.length) return "";
    const collapsed = options.collapsedFamilies?.has(`lab:${section.key}`) && !query;
    const when = [section.dayLabel, section.timestamp].filter(Boolean).join(" · ");
    const panelSelects = (section.panels || []).map((panel) => {
      const selected = selectedIds.has(panel.id);
      const panelWhen = [panel.dayLabel, panel.timestamp].filter(Boolean).join(" · ");
      return `<label class="compact-panel-select"><input type="checkbox" data-objective-selection-id="${escapeHtml(panel.id)}" data-lab-panel-selection="${escapeHtml(panel.id)}" aria-label="Include all results from ${escapeHtml(panel.name)}${panelWhen ? ` (${panelWhen})` : ""} in the note" ${selected ? "checked" : ""}><span class="compact-panel-select-box" aria-hidden="true"><svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5.4 4 7.8 8.5 2.4"/></svg></span><span>Select all${panelWhen ? ` · ${escapeHtml(panelWhen)}` : ""}</span></label>`;
    }).join("");
    return `<section class="compact-section compact-lab-family" data-compact-section="labs" aria-label="${escapeHtml(section.label)}">
      <div class="compact-section-heading lab-family-heading">
        <button type="button" class="lab-family-toggle" data-action="toggle-lab-family" data-family="lab:${escapeHtml(section.key)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "Expand" : "Collapse"} ${escapeHtml(section.label)}">
          <span class="lab-family-caret" aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
          <h3>${escapeHtml(section.label)}</h3>
        </button>
        <span class="compact-section-meta">${when ? `${escapeHtml(when)} · ` : ""}${rows.length} test${rows.length === 1 ? "" : "s"}${section.abnormalCount ? ` · <strong>${section.abnormalCount} abnormal</strong>` : ""}</span>
        ${panelSelects ? `<span class="compact-panel-selects">${panelSelects}</span>` : ""}
      </div>
      ${collapsed ? "" : `<div class="lab-rows">${rows.join("")}</div>`}
    </section>`;
  }

  function renderLabFamilies(families, selectedIds, query, options = {}) {
    return (families || []).map((section) => renderLabFamily(section, selectedIds, query, options)).join("");
  }

  function renderMedicationRow(candidate, selected, query) {
    if (!matchesQuery(candidate.searchText, query)) return "";
    const regimen = [candidate.dose, candidate.route, candidate.frequency].filter(Boolean).join(" · ");
    const meta = [candidate.scheduleLabel, candidate.latestAdministration ? `latest ${candidate.latestAdministration}` : ""].filter(Boolean).join(" · ");
    return `<li class="compact-row ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="compact-row-name"><strong>${escapeHtml(candidate.name)}</strong>${regimen ? `<small>${escapeHtml(regimen)}</small>` : ""}</span>
      ${meta ? `<span class="compact-row-meta">${escapeHtml(meta)}</span>` : ""}
    </li>`;
  }

  function renderNarrativeLabSection(labs, selectedIds, query) {
    const narratives = renderNarrativeCards(labs, selectedIds, query);
    if (!narratives) return "";
    return `<section class="compact-section compact-narrative-labs" data-compact-section="narrative-labs" aria-label="Unparsed laboratory sources">
      <div class="compact-section-heading"><h3>Unparsed lab sources</h3></div>
      ${narratives}
    </section>`;
  }

  function renderMedicationsSection(medications, selectedIds, query) {
    const structured = (medications || []).filter((candidate) => candidate.kind !== "narrative");
    const rows = structured.map((candidate) => renderMedicationRow(candidate, selectedIds.has(candidate.id), query)).filter(Boolean);
    const narratives = renderNarrativeCards(medications, selectedIds, query);
    if (!rows.length && !narratives) return "";
    return `<section class="compact-section compact-medications" data-compact-section="medications" aria-label="Medications">
      <div class="compact-section-heading"><h3>Medications</h3><span class="compact-section-meta">${rows.length} saved · included automatically</span></div>
      <p class="compact-section-note">All medications flow into the Medications section at the end of the note. Uncheck any row to leave it out.</p>
      ${rows.length ? `<ul class="compact-rows">${rows.join("")}</ul>` : ""}
      ${narratives}
    </section>`;
  }

  function renderDiagnosticRow(candidate, selected, query) {
    if (!matchesQuery(candidate.searchText, query)) return "";
    const meta = [candidate.resultCategory, candidate.resultDate, candidate.source?.dayLabel, candidate.context].filter(Boolean).join(" · ");
    const excerpt = String(candidate.text || "").replace(/\s+/g, " ").trim().slice(0, 140);
    const needsFlag = candidate.needsFreeText
      ? `<span class="compact-flag" title="Only a status was pasted — open this source in the admissions tab and paste the full report text.">⚠️ needs report text</span>`
      : "";
    return `<li class="compact-row ${selected ? "is-selected" : ""} ${candidate.needsFreeText ? "needs-free-text" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="compact-row-name"><strong>${escapeHtml(candidate.name)}</strong>${needsFlag}${meta ? `<small>${escapeHtml(meta)}</small>` : ""}${excerpt ? `<small class="compact-row-excerpt">${escapeHtml(excerpt)}${candidate.text.length > 140 ? "…" : ""}</small>` : ""}</span>
    </li>`;
  }

  function renderDiagnosticsSection(diagnostics, selectedIds, query, group) {
    const rows = (diagnostics || [])
      .filter((candidate) => !group || group === "all" || candidate.group === group)
      .map((candidate) => renderDiagnosticRow(candidate, selectedIds.has(candidate.id), query))
      .filter(Boolean);
    if (!rows.length) return "";
    return `<section class="compact-section compact-diagnostics" data-compact-section="diagnostics" aria-label="Diagnostic results">
      <div class="compact-section-heading"><h3>Diagnostic results</h3><span class="compact-section-meta">${rows.length} saved</span></div>
      <ul class="compact-rows">${rows.join("")}</ul>
    </section>`;
  }

  function groupCount(index, groupId) {
    if (groupId === "vitals") return (index.vitals || []).length;
    if (groupId === "labs") {
      const familyRows = (index.labFamilies || []).reduce((total, section) => total + section.rows.length, 0);
      const narrativeLabs = (index.labs || []).filter((candidate) => candidate.kind === "narrative").length;
      return (index.reportItems || []).length + (index.pendingItems || []).length + familyRows + narrativeLabs;
    }
    if (groupId === "medications") return (index.medications || []).length;
    return (index.diagnosticResults || []).filter((candidate) => candidate.group === groupId).length;
  }

  function renderDataExplorer({ index, selectedIds, query, category, baselineEditorId, collapsedFamilies, clinicalDataCollapsed }) {
    const q = normalizedQuery(query);
    const showVitals = category === "all" || category === "vitals";
    const showLabs = category === "all" || category === "labs";
    const showMeds = category === "all" || category === "medications";
    const showDiagnostics = category === "all" || ["imaging", "microbiology", "pathology", "other_results"].includes(category);
    const familyOptions = { baselineEditorId, collapsedFamilies };
    const sections = [
      showVitals ? renderVitalsSection(index.vitals, selectedIds, q) : "",
      showLabs ? renderPendingSection(index.pendingItems, selectedIds, q, familyOptions) : "",
      showLabs ? renderReportSection(index.reportItems, selectedIds, q, familyOptions) : "",
      showLabs ? renderLabFamilies(index.labFamilies, selectedIds, q, familyOptions) : "",
      showLabs ? renderNarrativeLabSection(index.labs, selectedIds, q) : "",
      showMeds ? renderMedicationsSection(index.medications, selectedIds, q) : "",
      showDiagnostics ? renderDiagnosticsSection(index.diagnosticResults, selectedIds, q, category) : ""
    ].filter(Boolean);
    const matchCount = (index.vitals && showVitals ? index.vitals.filter((candidate) => matchesQuery(candidate.searchText, q)).length : 0)
      + (showLabs ? (index.pendingItems || []).filter((item) => matchesQuery(item.selectionCandidate.searchText, q)).length : 0)
      + (showLabs ? (index.reportItems || []).filter((item) => matchesQuery(item.selectionCandidate.searchText, q)).length : 0)
      + (showLabs ? (index.labFamilies || []).reduce((total, section) => total + section.rows.filter(({ result }) => matchesQuery(result.selectionCandidate?.searchText, q) || matchesQuery(section.label, q)).length, 0) : 0)
      + (showLabs ? (index.labs || []).filter((candidate) => candidate.kind === "narrative" && matchesQuery(candidate.searchText, q)).length : 0)
      + (showMeds ? (index.medications || []).filter((candidate) => matchesQuery(candidate.searchText, q)).length : 0)
      + (showDiagnostics ? (index.diagnosticResults || []).filter((candidate) => (!category || category === "all" || candidate.group === category) && matchesQuery(candidate.searchText, q)).length : 0);
    const toggleLabel = clinicalDataCollapsed ? "Show clinical data" : "Hide clinical data";
    const toggleIcon = clinicalDataCollapsed ? "▶" : "◀";
    // U4: when pasted text produced zero structured rows, say exactly what the
    // parser accepts so the student can re-paste in a supported format —
    // never claim parsing succeeded.
    const zeroYieldHint = (() => {
      const hints = [];
      const labNarratives = (index.labs || []).filter((candidate) => candidate.kind === "narrative").length;
      const labRows = (index.pendingItems || []).length
        + (index.reportItems || []).length
        + (index.labFamilies || []).reduce((total, section) => total + (section.rows || []).length, 0);
      if (labNarratives > 0 && labRows === 0) {
        hints.push(`<p class="review-zero-yield-hint"><strong>No structured labs parsed.</strong> The lab parser reads result <em>tables</em> — Epic-style laboratory tables, CPRS tables, or tab/CSV clipboard tables with test, value, units, and reference-range columns. Plain result lines (e.g. <code>K 4.1</code>) are not parsed. The pasted text is kept under “Unparsed lab sources” below.</p>`);
      }
      const medStructured = (index.medications || []).filter((candidate) => candidate.kind !== "narrative").length;
      const medNarratives = (index.medications || []).filter((candidate) => candidate.kind === "narrative").length;
      if (medNarratives > 0 && medStructured === 0) {
        hints.push(`<p class="review-zero-yield-hint"><strong>No structured medications parsed.</strong> The medication parser reads inpatient medication <em>table</em> rows (starting with “INPATIENT | …”). Plain medication lines are not parsed; the pasted text is kept below.</p>`);
      }
      return hints.join("");
    })();
    // Built unconditionally: the collapsed rail and the full content are
    // both rendered so the collapse toggle never needs a re-render.
    const bodyHtml = `
      <div class="review-filter-row">
        <label>Search patient data<input type="search" id="reviewDataSearch" value="${escapeHtml(query)}" placeholder="${category === "labs" ? "WBC, CBC, metabolic panel…" : "WBC, ceftriaxone, CT Head…"}" autocomplete="off"></label>
        <label>Show<select id="reviewDataCategory"><option value="all">All clinical data</option>${index.groups.map((group) => `<option value="${escapeHtml(group.id)}" ${category === group.id ? "selected" : ""}>${escapeHtml(group.label)} (${groupCount(index, group.id)})</option>`).join("")}</select></label>
      </div>
      <p class="review-filter-summary" aria-live="polite">${matchCount} matching item${matchCount === 1 ? "" : "s"}</p>
      ${zeroYieldHint}
      <div class="review-data-list">${sections.length ? sections.join("") : `<div class="empty-state">No saved clinical data match this search.</div>`}</div>`;
    // Both the collapsed rail and the full content are always rendered;
    // the controller toggles `hidden` between them. Collapsing never
    // re-renders, so scroll position and focus survive the toggle.
    // (bodyHtml is built unconditionally above for this reason.)
    const railHtml = `
      <div class="clinical-data-rail" data-clinical-data-rail${clinicalDataCollapsed ? "" : " hidden"}>
        <button type="button" class="clinical-data-rail-toggle" data-action="toggle-clinical-data" title="Show clinical data" aria-label="Show clinical data" aria-expanded="false">▶</button>
        <span class="clinical-data-rail-label" aria-hidden="true">Clinical data</span>
      </div>`;
    const fullHtml = `
      <div class="clinical-data-full" data-clinical-data-full${clinicalDataCollapsed ? " hidden" : ""}>
      <div class="section-heading"><div><h2 id="reviewDataHeading">Clinical data</h2><p class="muted">Vitals and medications are in the note automatically — uncheck to remove. Check labs or results to add them.</p></div><button type="button" class="ed-mini" data-action="toggle-clinical-data" title="${toggleLabel}" aria-label="${toggleLabel}" aria-expanded="${!clinicalDataCollapsed}">${toggleIcon}</button></div>
      ${bodyHtml}
      </div>`;
    return `<section class="review-data-panel panel${clinicalDataCollapsed ? " is-collapsed" : ""}" aria-labelledby="reviewDataHeading" data-clinical-data-collapsed="${clinicalDataCollapsed ? "true" : "false"}">
      ${railHtml}${fullHtml}
    </section>`;
  }

  // ---- Single smart note editor ----
  // The right column is ONE text editor: a single document with section
  // labels in final-note order. Editable regions are inline contenteditable
  // areas with no per-section boxes, so the whole note fits on roughly one
  // page. Structured pieces (objective blocks, problems, medications,
  // checklist findings) render compactly inside the same document flow.

  // Plain-text model value -> editor HTML. Newlines become <br> so the text
  // the student sees round-trips through innerText when the controller reads
  // an edit back into the draft model.
  function editorHtml(value) {
    return escapeHtml(valueText(value)).replace(/\r?\n/g, "<br>");
  }

  function editorRegion(attr, value, placeholder) {
    return `<div class="ed-body" contenteditable="true" ${attr} data-placeholder="${escapeHtml(placeholder || "Optional — click to write")}" spellcheck="true">${editorHtml(value)}</div>`;
  }

  function editorLabel(labelText, extra = "") {
    return `<div class="ed-label"><span class="ed-label-text">${escapeHtml(labelText)}</span>${extra}</div>`;
  }

  function editorSection(labelText, bodyHtml, { labelExtra = "", sectionAttr = "", sectionId = "" } = {}) {
    // Every draft section is collapsible (I1): keeps the note scannable on
    // rounds. Collapse state is tracked by the controller so re-renders
    // preserve which sections the student opened/closed.
    const id = sectionId || String(labelText).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const isCollapsed = activeCollapsedSections instanceof Set ? activeCollapsedSections.has(id) : false;
    return `<details class="ed-section"${isCollapsed ? "" : " open"}${sectionAttr} data-draft-section-id="${escapeHtml(id)}"><summary class="ed-section-summary">${editorLabel(labelText, labelExtra)}</summary><div class="ed-section-body">${bodyHtml}</div></details>`;
  }

  function editorSubRegion(fieldAttr, subLabel, value, placeholder) {
    return `<div class="ed-sub"><span class="ed-sub-label">${escapeHtml(subLabel)}</span>${editorRegion(fieldAttr, value, placeholder)}</div>`;
  }

  function checklistFindingsEditor(draft, kind, emptyHint) {
    const blocks = (draft.checklistFindings?.selectedBlocks || []).filter((block) => block.kind === kind);
    if (!blocks.length) return `<p class="ed-empty">${escapeHtml(emptyHint)}</p>`;
    return `<ul class="ed-checklist">${blocks.map((block) => `<li>${escapeHtml(String(block.editedText || "").trim())}</li>`).join("")}</ul>`;
  }

  // Only the optional sections get an on/off toggle, rendered next to the
  // section label. Core sections are always in the final note.
  function optionalSectionToggle(fieldId, visibility) {
    const meta = SECTION_VISIBILITY_KEYS.find((entry) => entry.id === fieldId) || { label: fieldId };
    const included = visibility?.[fieldId] !== false;
    return `<label class="ed-toggle" title="${included ? "Remove" : "Include"} ${escapeHtml(meta.label)} ${included ? "from" : "in"} the final note"><input type="checkbox" data-section-visibility="${escapeHtml(fieldId)}" ${included ? "checked" : ""}><span>${included ? "In note" : "Excluded"}</span></label>`;
  }

  function renderObjectiveBlocksEditor(draft, collapsedObjectiveGroups = new Set()) {
    // Medication blocks are managed in the Medications section, never here.
    // Vitals render as a clean scannable list (one vital per line, short labels,
    // no "latest"/timestamp clutter). Labs group by panel family. Everything is
    // inline-editable, Epic smart-phrase style — not chunky cards.
    const groups = objectiveEditorGroups(draft);
    return groups.map((group) => {
      const hasStale = group.blocks.some((block) => block.state === "stale");
      const isVitals = group.key === "vitals";
      let bodyHtml;
      {
        // One clean line per item: "BP 92/48", "WBC 9" — easy to scan.
        // Vitals also get subtle 24h range and mean as secondary text.
        // Edited blocks show their edited text; otherwise use clean label+detail.
        // A group-level text override replaces the generated lines entirely;
        // the member blocks underneath keep their identities.
        const groupOverride = String(draft.objective?.groupEdits?.[group.key] || "").trim();
        const lines = groupOverride
          ? groupOverride.split("\n").map((line) =>
              line.trim() ? `<div class="ed-vital-line">${editorHtml(line.trim())}</div>` : ""
            ).filter(Boolean).join("")
          : group.blocks
          .map((block) => {
            if (block.state === "edited" && block.editedText) {
              // Multi-line edited text: split into per-line divs.
              return String(block.editedText).split("\n").map((line) =>
                line.trim() ? `<div class="ed-vital-line">${editorHtml(line.trim())}</div>` : ""
              ).join("");
            }
            const label = String(block.noteLabel || "").trim();
            const detail = String(block.noteDetail || "").trim();
            const text = label && detail ? `${label} ${detail}` : (label || detail || String(block.generatedText || "").trim());
            // Flagged free-text results show a paste prompt until the report
            // text is added; vitals show 24h range and mean as secondary info.
            let secondaryHtml = "";
            if (block.needsFreeText && block.state !== "edited") {
              secondaryHtml = ` <span class="ed-flag-inline" title="Only a status was pasted — open this source in the admissions tab and paste the full report text.">⚠️ paste report text</span>`;
            } else if (isVitals) {
              const range = String(block.noteRange || "").trim();
              const mean = String(block.noteMean || "").trim();
              const secondary = [];
              if (range) secondary.push(`24h ${range}`);
              if (mean) secondary.push(`mean ${mean}`);
              secondaryHtml = secondary.length
                ? ` <span class="ed-vital-secondary">${escapeHtml(secondary.join(" · "))}</span>`
                : "";
            }
            return text ? `<div class="ed-vital-line" data-vital-line="${escapeHtml(block.selectionId)}">${editorHtml(text)}${secondaryHtml}</div>` : "";
          })
          .filter(Boolean)
          .join("");
        bodyHtml = `<div class="ed-vitals-list" contenteditable="true" data-objective-group-text="${escapeHtml(group.key)}" data-placeholder="Optional" spellcheck="true">${lines}</div>`;
      }
      const isCollapsed = collapsedObjectiveGroups.has(group.key);
      const toggleIcon = isCollapsed ? "▶" : "▼";
      const toggleLabel = isCollapsed ? `Expand ${group.label || "group"}` : `Collapse ${group.label || "group"}`;
      const label = group.label
        ? `<button type="button" class="ed-group-toggle" data-action="toggle-objective-group" data-group="${escapeHtml(group.key)}" title="${toggleLabel}" aria-label="${toggleLabel}" aria-expanded="${!isCollapsed}">${toggleIcon}</button><span class="ed-group-label">${escapeHtml(group.label)}:</span>`
        : "";
      const staleButton = hasStale
        ? `<button type="button" class="ed-mini" data-action="refresh-objective-group" data-group="${escapeHtml(group.key)}" title="Source updated — refresh this line">↻</button>`
        : "";
      const bodyStyle = isCollapsed ? ' style="display:none"' : "";
      return `<div class="ed-group" data-objective-group="${escapeHtml(group.key)}">${label}<div${bodyStyle}>${bodyHtml}</div><span class="ed-mini-row">${staleButton}<button type="button" class="ed-mini ed-mini--danger" data-action="remove-objective-group" data-group="${escapeHtml(group.key)}" title="Remove ${escapeHtml(group.label || "item")}" aria-label="Remove ${escapeHtml(group.label || "item")}">×</button></span></div>`;
    }).join("");
  }

  function renderMedicationsEditor(draft) {
    const meds = (draft.objective?.selectedBlocks || []).filter((block) => block.noteGroupKey === "medications");
    if (!meds.length) return `<p class="ed-empty">No medications in the note. Check medications under Clinical data to add them.</p>`;
    return `<ul class="scaffold-med-list ed-med-list">${meds.map((block) => {
      const label = String(block.noteLabel || block.editedText || "Medication").trim();
      const detail = String(block.noteDetail || "").trim();
      return `<li><span><strong>${escapeHtml(label)}</strong>${detail ? ` <span class="muted">${escapeHtml(detail)}</span>` : ""}</span><button type="button" class="ed-mini ed-mini--danger" data-action="remove-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Remove</button></li>`;
    }).join("")}</ul><p class="ed-note">These render in their own Medications section at the end of the final note.</p>`;
  }

  function renderDifferentialEditor(differential, index, problemId) {
    return `<div class="differential-card" data-differential-id="${escapeHtml(differential.id)}">
      <div class="ed-diff-bar"><strong>#${index + 1}</strong><span class="ed-mini-row"><button type="button" class="ed-mini" data-action="move-differential" data-direction="-1" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}" aria-label="Move differential up">↑</button><button type="button" class="ed-mini" data-action="move-differential" data-direction="1" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}" aria-label="Move differential down">↓</button><button type="button" class="ed-mini ed-mini--danger" data-action="remove-differential" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}">Remove</button></span></div>
      <div class="ed-sub"><span class="ed-sub-label">Diagnosis</span><div class="ed-body" contenteditable="true" data-differential-field="diagnosis" data-placeholder="Diagnosis" spellcheck="true">${editorHtml(differential.diagnosis)}</div></div>
      <div class="ed-two"><div class="ed-sub"><span class="ed-sub-label">Clues for</span><div class="ed-body" contenteditable="true" data-differential-field="cluesFor" data-placeholder="Optional" spellcheck="true">${editorHtml(differential.cluesFor)}</div></div><div class="ed-sub"><span class="ed-sub-label">Clues against</span><div class="ed-body" contenteditable="true" data-differential-field="cluesAgainst" data-placeholder="Optional" spellcheck="true">${editorHtml(differential.cluesAgainst)}</div></div></div>
    </div>`;
  }

  // Confirmation modal shown before any patient context leaves the browser.
  // apConfirm = { problemId, problemName, contextText }. The student reviews
  // the exact de-identified text that will be sent to the AI provider.
  function renderApConfirmModal(apConfirm) {
    return `<div class="ap-confirm-overlay" data-ap-confirm-overlay>
      <div class="ap-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm AI plan generation">
        <h3>Generate assessment &amp; plan with AI?</h3>
        <p class="muted">The text below — and only this text — will be sent to OpenAI using your saved API key. Confirm it contains <strong>no protected health information</strong> (no names, dates, MRNs, locations).</p>
        <div class="ap-confirm-context" tabindex="0">${escapeHtml(apConfirm.contextText) || "<span class=\"muted\">(no context)</span>"}</div>
        <p class="muted ap-confirm-note">The AI drafts a ranked differential, diagnostic plan, and order-level therapeutic plan with citations. You review and edit everything before it enters your note.</p>
        <div class="button-row">
          <button type="button" class="button--primary button--small" data-action="ap-confirm-generate" data-problem-id="${escapeHtml(apConfirm.problemId)}">Confirm — generate plan</button>
          <button type="button" class="button--secondary button--small" data-action="ap-confirm-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
  }

  function renderProblemEditor(problem, index, guidanceFor, options = {}) {
    const known = problem.etiologyStatus === "known";
    const generating = options.generatingApProblemId === problem.id;
    return `<article class="plan-problem-card" data-problem-id="${escapeHtml(problem.id)}">
      <div class="ed-problem-bar"><strong>Problem ${index + 1}</strong><span class="ed-mini-row"><button type="button" class="ed-mini" data-action="generate-ap" data-problem-id="${escapeHtml(problem.id)}" ${generating ? "disabled" : ""} title="${escapeHtml(generating ? "Generating assessment and plan…" : "Generate differential, diagnostic plan, and therapeutic plan with citations (uses your saved OpenAI key; only de-identified context is sent)")}">${icon("wand")} ${generating ? "Generating…" : "Generate"}</button><button type="button" class="ed-mini" data-action="move-plan-problem" data-direction="-1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem up">↑</button><button type="button" class="ed-mini" data-action="move-plan-problem" data-direction="1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem down">↓</button><button type="button" class="ed-mini ed-mini--danger" data-action="remove-plan-problem" data-problem-id="${escapeHtml(problem.id)}">Remove</button></span></div>
      <div class="ed-sub"><span class="ed-sub-label">Clinical problem</span><div class="ed-body ed-body--strong" contenteditable="true" data-problem-field="problem" data-placeholder="Name the clinical problem, not a test or treatment" spellcheck="true">${editorHtml(sanitizeProblemTitle(valueText(problem.problem)))}</div></div>
      <div class="ed-sub"><span class="ed-sub-label">Key context</span><div class="ed-body" contenteditable="true" data-problem-field="keyContext" data-placeholder="Optional concise context" spellcheck="true">${editorHtml(problem.keyContext)}</div></div>
      <div class="ed-etiology"><span class="ed-sub-label">Etiology</span>${helpButton(known ? "etiology_known" : "etiology_unknown", "Etiology status", guidanceFor(known ? "etiology_known" : "etiology_unknown"))}<div class="segmented-options"><label><input type="radio" name="etiology_${escapeHtml(problem.id)}" data-problem-etiology value="known" ${known ? "checked" : ""}> <span>Known</span></label><label><input type="radio" name="etiology_${escapeHtml(problem.id)}" data-problem-etiology value="unknown" ${known ? "" : "checked"}> <span>Unknown</span></label></div></div>
      ${known
        ? `<div class="ed-sub"><span class="ed-sub-label">Known etiology</span><div class="ed-body" contenteditable="true" data-problem-field="knownEtiology" data-placeholder="Documented cause or mechanism" spellcheck="true">${editorHtml(problem.knownEtiology)}</div></div>`
        : `<div class="ed-differentials"><div class="ed-diff-head"><span class="ed-sub-label">Ranked differential</span><button type="button" class="ed-mini" data-action="add-differential" data-problem-id="${escapeHtml(problem.id)}">${icon("plus")} Add</button></div>${problem.differentials.map((entry, differentialIndex) => renderDifferentialEditor(entry, differentialIndex, problem.id)).join("") || `<p class="ed-empty">No differential diagnoses added.</p>`}</div>`}
      <div class="ed-two"><div class="ed-sub"><span class="ed-sub-label">Diagnostic plan</span><div class="ed-body" contenteditable="true" data-problem-field="diagnosticPlan" data-placeholder="Optional" spellcheck="true">${editorHtml(problem.diagnosticPlan)}</div></div><div class="ed-sub"><span class="ed-sub-label">Therapeutic plan</span><div class="ed-body" contenteditable="true" data-problem-field="therapeuticPlan" data-placeholder="Optional" spellcheck="true">${editorHtml(problem.therapeuticPlan)}</div></div></div>
    </article>`;
  }

  const RELEVANT_HISTORY_SUBFIELDS = Object.freeze([
    ["past_medical_history", "Past medical history"],
    ["past_surgical_history", "Past surgical history"],
    ["medications", "Medications"],
    ["allergies", "Allergies"],
    ["family_history", "Family history"],
    ["social_history", "Social history"],
    ["other", "Other relevant history"]
  ]);

  function renderDraft({ draft, guidanceFor, differenceSelectionId, collapsedObjectiveGroups, smartExamUi, collapsedDraftSections, generatingApProblemId, apConfirm }) {
    // Make the collapse set visible to editorSection for this render.
    activeCollapsedSections = collapsedDraftSections instanceof Set ? collapsedDraftSections : new Set();
    const visibility = draft.sectionVisibility || {};
    const isHP = draft.noteType === NOTE_TYPES.H_AND_P;
    const fields = draft.sections || {};
    const helpFor = (key, label) => `${helpButton(key, label, guidanceFor(key))}${pullButton(key, label)}`;
    // Medications for progress notes are checkbox-selected from Clinical Data,
    // not free text — no pull button (there's no text field to pull into).
    const helpOnly = (key, label) => helpButton(key, label, guidanceFor(key));

    // Smart physical-exam editor. The student picks an exam system
    // (General, HEENT, Neurological, ...) and presses Insert; the system
    // renders inline in the note area as prose with SMART VARIABLE pills.
    // Clicking a pill opens an inline multi-select dropdown right in the
    // text — no separate picker section. "All normal" fills everything in
    // one click; custom text covers anything not in the lists. Selections
    // compile straight into the Physical Exam note text.
    const smartExamBlock = (draft, uiState = {}) => {
      const state = normalizeSmartExam(draft?.smartExam);
      // Lazy migration: legacy free text already in the section shows up as
      // notes so nothing the student wrote is lost.
      let freeText = state.freeText;
      if (!draft?.smartExam && !freeText) {
        const legacy = String(draft?.sections?.physical_exam?.deidentifiedText || "").trim();
        if (legacy) freeText = legacy;
      }
      const openVar = uiState.openVar || null;

      const renderVarPill = (systemId, varDef) => {
        const selected = state.selections?.[systemId]?.[varDef.var] || [];
        const isOpen = openVar === `${systemId}:${varDef.var}`;
        const pillText = selected.length ? selected.join(", ") : varDef.label;
        const pillClass = selected.length ? "se-pill is-filled" : "se-pill is-empty";
        const title = selected.length
          ? `${varDef.label}: ${selected.join(", ")} — click to change`
          : `${varDef.label} — click to select`;
        // Pills are atomic inline placeholders inside the free-text editor
        // (Epic smart-phrase style): contenteditable="false" so the caret
        // can't land inside one, focusable/clickable to open the dropdown.
        let html = `<span class="se-var-wrap" data-smart-var-wrap><span class="${pillClass}" contenteditable="false" tabindex="0" role="button" data-action="smart-var-open" data-system="${escapeHtml(systemId)}" data-var="${escapeHtml(varDef.var)}" title="${escapeHtml(title)}" aria-haspopup="listbox" aria-expanded="${isOpen}">${escapeHtml(pillText)} ▾</span>`;
        if (isOpen) html += renderVarDropdown(systemId, varDef, selected);
        return html + `</span>`;
      };

      const renderVarDropdown = (systemId, varDef, selected) => {
        const selectedSet = new Set(selected);
        const normalSet = new Set(varDef.normal);
        const listed = varDef.options;
        // Custom entries are selections that aren't listed options.
        const customs = selected.filter((x) => !listed.includes(x));
        const normalOpts = listed.filter((o) => normalSet.has(o));
        const abnormalOpts = listed.filter((o) => !normalSet.has(o));
        const optHtml = (opt, isNormal) =>
          `<label class="se-opt${isNormal ? " is-normal" : ""}"><input type="checkbox" data-smart-var-option data-system="${escapeHtml(systemId)}" data-var="${escapeHtml(varDef.var)}" data-option="${escapeHtml(opt)}"${selectedSet.has(opt) ? " checked" : ""}><span>${isNormal ? "✓ " : ""}${escapeHtml(opt)}</span></label>`;
        return `<span class="se-dropdown" role="listbox" aria-label="${escapeHtml(varDef.label)} options">`
          + `<span class="se-dropdown-scroll">`
          + (normalOpts.length ? `<span class="se-opt-group">Normal</span>${normalOpts.map((o) => optHtml(o, true)).join("")}` : "")
          + (abnormalOpts.length ? `<span class="se-opt-group">Abnormal</span>${abnormalOpts.map((o) => optHtml(o, false)).join("")}` : "")
          + (customs.length ? `<span class="se-opt-group">Custom</span>${customs.map((c) =>
              `<span class="se-custom-pick"><span>${escapeHtml(c)}</span><button type="button" class="se-custom-x" data-action="smart-var-remove-custom" data-system="${escapeHtml(systemId)}" data-var="${escapeHtml(varDef.var)}" data-option="${escapeHtml(c)}" title="Remove custom entry" aria-label="Remove ${escapeHtml(c)}">×</button></span>`).join("")}` : "")
          + `</span>`
          + `<span class="se-custom-row"><input type="text" class="se-custom-input" data-smart-var-custom data-system="${escapeHtml(systemId)}" data-var="${escapeHtml(varDef.var)}" placeholder="Type custom finding, Enter to add" aria-label="Custom finding for ${escapeHtml(varDef.label)}"><button type="button" class="ed-mini" data-action="smart-var-add-custom" data-system="${escapeHtml(systemId)}" data-var="${escapeHtml(varDef.var)}">Add</button></span>`
          + `</span>`;
      };

      const renderSystem = (systemId) => {
        const system = getExamSystem(systemId);
        if (!system) return "";
        // Epic-style free-text editor: the student types anywhere; smart
        // variables are atomic inline placeholders (click to fill).
        const segments = state.segments?.[systemId] || templateToSegments(system);
        const editorHtml = segments.map((seg) => {
          if (seg.t === "text") return escapeHtml(seg.s).replace(/\n/g, "<br>");
          const varDef = getExamVar(systemId, seg.var);
          return varDef ? renderVarPill(systemId, varDef) : "";
        }).join("");
        return `<div class="se-system" data-smart-system="${escapeHtml(systemId)}">
          <div class="se-system-head"><strong>${escapeHtml(system.name)}</strong>
            <span class="se-system-actions"><button type="button" class="ed-mini" data-action="smart-exam-system-normal" data-system="${escapeHtml(systemId)}" title="Fill this system with normal findings">✓ Normal</button><button type="button" class="ed-mini ed-mini--danger" data-action="smart-exam-system-remove" data-system="${escapeHtml(systemId)}" title="Remove this system" aria-label="Remove ${escapeHtml(system.name)}">×</button></span>
          </div>
          <div class="se-editor" contenteditable="true" spellcheck="true" data-smart-exam-editor data-system="${escapeHtml(systemId)}" data-placeholder="Type exam findings — click a placeholder to fill it">${editorHtml || "<br>"}</div>
        </div>`;
      };

      const systemOptions = EXAM_SYSTEMS.map((sys) =>
        `<option value="${escapeHtml(sys.id)}"${state.systems.includes(sys.id) ? " disabled" : ""}>${escapeHtml(sys.name)}${state.systems.includes(sys.id) ? " (inserted)" : ""}</option>`
      ).join("");

      return `<div class="smart-exam" data-smart-exam>
        <div class="se-toolbar">
          <label class="se-template-picker">Template: <select data-smart-exam-select><option value="">Select exam…</option>${systemOptions}</select></label>
          <button type="button" class="ed-mini" data-action="smart-exam-insert" title="Insert the selected exam system below">Insert</button>
          <button type="button" class="ed-mini" data-action="smart-exam-all-normal" title="Fill every inserted system with normal findings">✓ All normal</button>
          <button type="button" class="ed-mini ed-mini--danger" data-action="smart-exam-clear" title="Remove all systems and notes">Clear</button>
        </div>
        <div class="se-systems">${state.systems.map(renderSystem).join("") || `<p class="ed-empty">Select an exam system above and press Insert — it appears here with inline dropdowns.</p>`}</div>
        <label class="se-notes-label">Additional exam notes <span class="muted">(free text)</span><textarea class="se-notes" data-smart-exam-notes rows="2" placeholder="Anything not covered by the templates">${escapeHtml(freeText)}</textarea></label>
      </div>`;
    };
    const checklistTag = `<span class="ed-tag">from Checklist</span>`;

    const frontSections = isHP ? [
      editorSection("One-Liner", editorRegion(`data-draft-section="one_liner"`, fields.one_liner, "One-sentence summary"), { labelExtra: helpFor("one_liner", "One-Liner") }),
      editorSection("Chief Complaint", editorRegion(`data-draft-section="chief_complaint"`, fields.chief_complaint), { labelExtra: helpFor("chief_complaint", "Chief Complaint") }),
      editorSection("History of Present Illness", editorRegion(`data-draft-section="history_of_present_illness"`, fields.history_of_present_illness), { labelExtra: helpFor("history_of_present_illness", "HPI") }),
      editorSection("Review of Systems", checklistFindingsEditor(draft, "history", "Complete the history checklist to populate this section."), { labelExtra: checklistTag, sectionAttr: ` data-checklist-finding-kind="history"` }),
      editorSection("Relevant History", RELEVANT_HISTORY_SUBFIELDS.map(([fieldId, subLabel]) => editorSubRegion(`data-draft-section="${fieldId}"`, subLabel, fields[fieldId])).join(""), { labelExtra: helpFor("past_medical_history", "Relevant History") }),
      editorSection("Diet and Exercise", editorRegion(`data-draft-section="diet_and_exercise"`, fields.diet_and_exercise), { labelExtra: `${helpFor("diet_and_exercise", "Diet and Exercise")}${optionalSectionToggle("diet_and_exercise", visibility)}` })
    ] : [
      editorSection("One-Liner", editorRegion(`data-draft-section="one_liner"`, fields.one_liner, "One-sentence summary"), { labelExtra: helpFor("one_liner", "One-Liner") }),
      editorSection("Subjective", [
        `<div class="ed-sub"><span class="ed-sub-label">Events ${draft.noteType === NOTE_TYPES.PROGRESS ? `<button type="button" class="ed-insert-chip" data-action="insert-no-acute-events" title="Insert the text “No acute events overnight.” into Events">${icon("plus")} Insert: No acute events overnight</button>` : ""}</span>${editorRegion(`data-draft-section="interval_events"`, fields.interval_events)}</div>`,
        editorSubRegion(`data-draft-section="patient_report"`, "Patient report", fields.patient_report),
        editorSubRegion(`data-draft-section="nursing_report"`, "Nursing report", fields.nursing_report),
        editorSubRegion(`data-draft-section="pertinent_symptoms"`, "Pertinent symptoms", fields.pertinent_symptoms),
        editorSubRegion(`data-draft-section="other"`, "Other subjective information", fields.other),
        `<div class="ed-sub"><span class="ed-sub-label">Bedside history ${checklistTag}</span><div class="ed-readonly" data-checklist-finding-kind="history">${checklistFindingsEditor(draft, "history", "Complete the history checklist to populate this section.")}</div></div>`
      ].join(""), { labelExtra: helpFor("interval_events", "Subjective") }),
    ];

    const objectiveBlocks = renderObjectiveBlocksEditor(draft, collapsedObjectiveGroups);
    const objectiveBody = `<p class="ed-hint">Vitals are in the note automatically. Check labs or diagnostic results under Clinical data to add them here.</p>`
      + (objectiveBlocks || `<p class="ed-empty">Choose items from Clinical data to add Objective content.</p>`)
      + `<div class="ed-sub"><span class="ed-sub-label">Student-authored Objective text</span>${editorRegion("data-draft-objective-manual", draft.objective?.manual, "Optional exam findings, intake/output, or other directly observed data")}</div>`;

    const planBody = `<p class="ed-hint">Order problems by decisional importance. Add only reasoning and actions you support.</p><div class="plan-problem-list" data-plan-problem-list>${draft.problems.map((problem, index) => renderProblemEditor(problem, index, guidanceFor, { generatingApProblemId })).join("") || `<p class="ed-empty">No problems added yet.</p><p class="ed-hint">If you pulled from the primary note and expected problems here, the Assessment &amp; Plan may not have parsed — use the ⤓ pull button on the Plan section header or add a problem manually.</p>`}</div>${apConfirm ? renderApConfirmModal(apConfirm) : ""}`;

    return `<section class="note-draft-panel panel" aria-labelledby="draftNoteHeading">
      <div class="note-editor-toolbar">
        <div class="note-editor-title"><h2 id="draftNoteHeading">Draft note</h2><label class="note-type-control"><span>Format</span><select id="reviewNoteType"><option value="${NOTE_TYPES.PROGRESS}" ${draft.noteType === NOTE_TYPES.PROGRESS ? "selected" : ""}>Progress note</option><option value="${NOTE_TYPES.H_AND_P}" ${draft.noteType === NOTE_TYPES.H_AND_P ? "selected" : ""}>H&amp;P</option></select></label></div>
        <div class="note-editor-actions"><button type="button" class="button--primary button--small" data-action="save-note-draft">Save draft</button><button type="button" class="button--secondary button--small" data-action="copy-final-note">Copy for Epic</button><button type="button" class="button--secondary button--small" data-action="copy-rich-note">Copy rich text</button><button type="button" class="button--secondary button--small" data-action="download-final-note">${icon("download")} Download .txt</button></div>
      </div>
      <p class="ed-toolbar-note">One editor for the whole note — section labels included. Type <kbd>$</kbd> to pull a lab or vital into the note. Saving encrypts the draft without running de-identification.</p>
      <div class="note-editor" id="noteEditor" role="group" aria-label="Note editor">
        ${frontSections.join("")}
        ${editorSection("Physical Exam", `${smartExamBlock(draft, smartExamUi)}<div class="ed-sub"><span class="ed-sub-label">From checklist ${checklistTag}</span><div class="ed-readonly" data-checklist-finding-kind="exam">${checklistFindingsEditor(draft, "exam", "Complete the physical-exam checklist to populate this section.")}</div></div>`, { labelExtra: helpFor("physical_exam", "Physical Exam"), sectionAttr: ` data-checklist-finding-kind="exam"` })}
        ${editorSection("Objective", objectiveBody, { labelExtra: helpFor("objective", "Objective") })}
        ${editorSection("Assessment", editorRegion("data-draft-assessment", draft.assessment, "Your concise synthesis"), { labelExtra: helpFor("assessment", "Assessment") })}
        ${editorSection("Plan", planBody, { labelExtra: `${helpFor("plan", "Plan")}<button type="button" class="ed-mini" data-action="add-plan-problem">${icon("plus")} Add problem</button>` })}
        ${CLOSING_SECTION_FIELDS.map((field) => editorSection(field.label, editorRegion(`data-draft-closing="${field.id}"`, draft.closing?.[field.id]), { labelExtra: `${helpFor(field.id, field.label)}${optionalSectionToggle(field.id, visibility)}` })).join("")}
        ${editorSection("Medications", renderMedicationsEditor(draft), { labelExtra: helpOnly("medications", "Medications") })}
      </div>
    </section>`;
  }

  function renderReview({ patientLabel, oneLiner, packets, selectedPacketId, index, query, category, draft, guidanceFor, differenceSelectionId, baselineEditorId, collapsedFamilies, clinicalDataCollapsed, collapsedObjectiveGroups, smartExamUi, collapsedDraftSections, patientRequiredMessage, generatingApProblemId, apConfirm }) {
    if (!draft) return patientRequiredMessage;
    const selectedIds = new Set((draft.objective?.selectedBlocks || []).map((block) => block.selectionId));
    // Banner calling out free-text results that pasted as a status only —
    // the student needs to paste the actual report text for these.
    const flaggedResults = (index.diagnosticResults || []).filter((candidate) => candidate.needsFreeText);
    const flaggedBanner = flaggedResults.length
      ? `<div class="review-flag-banner" role="alert"><strong>⚠️ ${flaggedResults.length} result${flaggedResults.length === 1 ? "" : "s"} need${flaggedResults.length === 1 ? "s" : ""} report text:</strong> ${flaggedResults.map((candidate) => escapeHtml(candidate.name)).join(", ")}. <span class="muted">Open each in the admissions tab and paste the full report.</span></div>`
      : "";
    return `<div class="review-workspace">
      <div class="patient-identity-bar" role="status" aria-label="Active patient"><span class="patient-identity-bar-label">Patient</span><strong>${escapeHtml(patientLabel)}</strong></div>
      <header class="review-hero panel">
        <div><span class="eyebrow">${escapeHtml(patientLabel)}</span><h1 id="review-heading">Review Data / Draft Note</h1><p class="review-one-liner ${oneLiner ? "" : "is-empty"}">${escapeHtml(oneLiner || "One-liner not entered yet. You can continue and add it in the draft.")}</p></div>
        <label class="review-packet-label">Note packet<select id="reviewPacketSelect">${packets.map((packet) => `<option value="${escapeHtml(packet.id)}" ${packet.id === selectedPacketId ? "selected" : ""}>${escapeHtml(packet.label)}</option>`).join("")}</select></label>
      </header>
      ${flaggedBanner}
      <div class="review-columns">${renderDataExplorer({ index, selectedIds, query, category, baselineEditorId, collapsedFamilies, clinicalDataCollapsed })}${renderDraft({ draft, guidanceFor, differenceSelectionId, collapsedObjectiveGroups, smartExamUi, collapsedDraftSections, generatingApProblemId, apConfirm })}</div>
    </div>`;
  }

  return Object.freeze({ renderReview, renderDraft });
}
