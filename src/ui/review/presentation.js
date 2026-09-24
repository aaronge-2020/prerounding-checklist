import { CLOSING_SECTION_FIELDS, fieldsForNoteType, NOTE_TYPES, objectiveEditorGroups, SECTION_VISIBILITY_KEYS } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import {
  abnormalTone,
  compactLabTrendLine,
  compactVitalTrendLine,
  displayVitalName
} from "../../review-data/compact-summary.js?v=20260924-optional-sections-v1";
import { baselineDisplayText } from "../../patient-context/lab-baselines.js?v=20260924-lab-baselines-v1";

function valueText(value) {
  if (value && typeof value === "object") return String(value.deidentifiedText || "");
  return String(value ?? "");
}

export function createReviewPresentation({ escapeHtml, icon }) {
  const helpButton = (key, label, guidance) => `<button type="button" class="note-help-button" data-help-key="${escapeHtml(key)}" data-tooltip="${escapeHtml(guidance || "No additional guidance.")}" aria-label="Help for ${escapeHtml(label)}">?</button>`;

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

  function renderVitalChip(candidate, selected, query) {
    if (!matchesQuery(candidate.searchText, query)) return "";
    const displayName = displayVitalName(candidate.name);
    const value = [candidate.latest?.value, candidate.latest?.unit].filter(Boolean).join(" ") || "—";
    const tone = vitalStatus(candidate) === "unknown" ? "" : vitalStatus(candidate);
    const stats = candidate.statisticsText
      || (candidate.statistics24h && Number.isFinite(candidate.statistics24h.minimum)
        ? `${candidate.statistics24h.minimum}–${candidate.statistics24h.maximum}${candidate.unit ? ` ${candidate.unit}` : ""} (24h)`
        : "");
    const trend = compactVitalTrendLine(candidate.displayTrend);
    const when = [candidate.latest?.dayLabel, candidate.latest?.timestamp].filter(Boolean).join(" · ");
    // A temperature whose source never stated a unit has no checkbox: the
    // only way into the note is explicit °F/°C confirmation in the banner.
    const selectionControl = candidate.unitUnmarked
      ? `<span class="vital-chip-confirm-hint" title="Confirm the unit before adding this temperature to the note">confirm unit ↓</span>`
      : `<input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}>`;
    return `<label class="vital-chip ${selected ? "is-selected" : ""} ${candidate.unitUnmarked ? "is-unit-unmarked" : ""}" data-review-candidate="${escapeHtml(candidate.id)}" data-clinical-emphasis="${escapeHtml(tone || "unknown")}">
      ${selectionControl}
      <span class="vital-chip-name">${escapeHtml(displayName)}${flagPill(tone)}</span>
      <span class="vital-chip-value"><strong>${escapeHtml(value)}</strong>${candidate.unitUnmarked ? ` <span class="unit-unmarked-flag" title="The source never stated this unit">unit not stated</span>` : ""}</span>
      ${when ? `<span class="vital-chip-when">${escapeHtml(when)}</span>` : ""}
      ${trend ? `<span class="vital-chip-trend">${escapeHtml(trend)}</span>` : ""}
      ${stats ? `<span class="vital-chip-stats">${escapeHtml(stats)}</span>` : ""}
    </label>`;
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
      ${chips.length ? `<div class="vital-strip">${chips.join("")}</div>` : ""}
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
    return `<div class="lab-row ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(selection.id)}" data-clinical-emphasis="${escapeHtml(tone || "unknown")}">
      <label class="lab-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(selection.id)}" data-lab-result-selection="${escapeHtml(panel.id)}" aria-label="Include only ${escapeHtml(result.name)} from ${escapeHtml(panel.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="lab-row-name">${escapeHtml(result.name)}${flagPill(tone)}${result.flag ? `<span class="lab-row-flag">${escapeHtml(result.flag)}</span>` : ""}</span>
      <span class="lab-row-value"><strong>${escapeHtml(value)}</strong></span>
      ${meta ? `<span class="lab-row-meta">${escapeHtml(meta)}</span>` : ""}
      <button type="button" class="lab-baseline-toggle" data-action="baseline-edit" data-baseline-result-id="${escapeHtml(selection.id)}" title="${escapeHtml(result.baseline?.note || "Set a patient baseline for this analyte")}">${baseline ? "Edit base" : "Set base"}</button>
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
    return `<li class="compact-row ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="compact-row-name"><strong>${escapeHtml(candidate.name)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}${excerpt ? `<small class="compact-row-excerpt">${escapeHtml(excerpt)}${candidate.text.length > 140 ? "…" : ""}</small>` : ""}</span>
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

  function renderDataExplorer({ index, selectedIds, query, category, baselineEditorId, collapsedFamilies }) {
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
    return `<section class="review-data-panel panel" aria-labelledby="reviewDataHeading">
      <div class="section-heading"><div><h2 id="reviewDataHeading">Clinical data</h2><p class="muted">Vitals and medications are in the note automatically — uncheck to remove. Check labs or results to add them.</p></div></div>
      <div class="review-filter-row">
        <label>Search patient data<input type="search" id="reviewDataSearch" value="${escapeHtml(query)}" placeholder="${category === "labs" ? "WBC, CBC, metabolic panel…" : "WBC, ceftriaxone, CT Head…"}" autocomplete="off"></label>
        <label>Show<select id="reviewDataCategory"><option value="all">All clinical data</option>${index.groups.map((group) => `<option value="${escapeHtml(group.id)}" ${category === group.id ? "selected" : ""}>${escapeHtml(group.label)} (${groupCount(index, group.id)})</option>`).join("")}</select></label>
      </div>
      <p class="review-filter-summary" aria-live="polite">${matchCount} matching item${matchCount === 1 ? "" : "s"}</p>
      <div class="review-data-list">${sections.length ? sections.join("") : `<div class="empty-state">No saved clinical data match this search.</div>`}</div>
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

  function editorSection(labelText, bodyHtml, { labelExtra = "", sectionAttr = "" } = {}) {
    return `<div class="ed-section"${sectionAttr}>${editorLabel(labelText, labelExtra)}<div class="ed-section-body">${bodyHtml}</div></div>`;
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

  function renderObjectiveBlocksEditor(draft) {
    // Medication blocks are managed in the Medications section, never here.
    // Blocks group by category (all vitals under one "Vital signs" line, labs
    // by panel family) and render as compact inline text — Epic smart-phrase
    // style — not as one chunky card per finding.
    const groups = objectiveEditorGroups(draft);
    return groups.map((group) => {
      const hasStale = group.blocks.some((block) => block.state === "stale");
      const combinedText = group.blocks
        .map((block) => String(block.editedText || block.generatedText || "").trim())
        .filter(Boolean)
        .join("; ");
      const label = group.label
        ? `<span class="ed-group-label">${escapeHtml(group.label)}:</span>`
        : "";
      const staleButton = hasStale
        ? `<button type="button" class="ed-mini" data-action="refresh-objective-group" data-group="${escapeHtml(group.key)}" title="Source updated — refresh this line">↻</button>`
        : "";
      return `<div class="ed-group" data-objective-group="${escapeHtml(group.key)}">${label}<div class="ed-body ed-body--inline" contenteditable="true" data-objective-group-text="${escapeHtml(group.key)}" data-placeholder="Optional" spellcheck="true">${editorHtml(combinedText)}</div><span class="ed-mini-row">${staleButton}<button type="button" class="ed-mini ed-mini--danger" data-action="remove-objective-group" data-group="${escapeHtml(group.key)}" title="Remove ${escapeHtml(group.label || "item")}" aria-label="Remove ${escapeHtml(group.label || "item")}">×</button></span></div>`;
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

  function renderProblemEditor(problem, index, guidanceFor) {
    const known = problem.etiologyStatus === "known";
    return `<article class="plan-problem-card" data-problem-id="${escapeHtml(problem.id)}">
      <div class="ed-problem-bar"><strong>Problem ${index + 1}</strong><span class="ed-mini-row"><button type="button" class="ed-mini" data-action="move-plan-problem" data-direction="-1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem up">↑</button><button type="button" class="ed-mini" data-action="move-plan-problem" data-direction="1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem down">↓</button><button type="button" class="ed-mini ed-mini--danger" data-action="remove-plan-problem" data-problem-id="${escapeHtml(problem.id)}">Remove</button></span></div>
      <div class="ed-sub"><span class="ed-sub-label">Clinical problem</span><div class="ed-body ed-body--strong" contenteditable="true" data-problem-field="problem" data-placeholder="Name the clinical problem, not a test or treatment" spellcheck="true">${editorHtml(problem.problem)}</div></div>
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

  function renderDraft({ draft, guidanceFor, differenceSelectionId }) {
    const visibility = draft.sectionVisibility || {};
    const isHP = draft.noteType === NOTE_TYPES.H_AND_P;
    const fields = draft.sections || {};
    const helpFor = (key, label) => helpButton(key, label, guidanceFor(key));
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
        `<div class="ed-sub"><span class="ed-sub-label">Events ${draft.noteType === NOTE_TYPES.PROGRESS ? `<button type="button" class="ed-mini" data-action="insert-no-acute-events">No acute events overnight</button>` : ""}</span>${editorRegion(`data-draft-section="interval_events"`, fields.interval_events)}</div>`,
        editorSubRegion(`data-draft-section="patient_report"`, "Patient report", fields.patient_report),
        editorSubRegion(`data-draft-section="nursing_report"`, "Nursing report", fields.nursing_report),
        editorSubRegion(`data-draft-section="pertinent_symptoms"`, "Pertinent symptoms", fields.pertinent_symptoms),
        editorSubRegion(`data-draft-section="other"`, "Other subjective information", fields.other),
        `<div class="ed-sub"><span class="ed-sub-label">Bedside history ${checklistTag}</span><div class="ed-readonly" data-checklist-finding-kind="history">${checklistFindingsEditor(draft, "history", "Complete the history checklist to populate this section.")}</div></div>`
      ].join(""), { labelExtra: helpFor("interval_events", "Subjective") }),
    ];

    const objectiveBlocks = renderObjectiveBlocksEditor(draft);
    const objectiveBody = `<p class="ed-hint">Vitals are in the note automatically. Check labs or diagnostic results under Clinical data to add them here.</p>`
      + (objectiveBlocks || `<p class="ed-empty">Choose items from Clinical data to add Objective content.</p>`)
      + `<div class="ed-sub"><span class="ed-sub-label">Student-authored Objective text</span>${editorRegion("data-draft-objective-manual", draft.objective?.manual, "Optional exam findings, intake/output, or other directly observed data")}</div>`;

    const planBody = `<p class="ed-hint">Order problems by decisional importance. Add only reasoning and actions you support.</p><div class="plan-problem-list">${draft.problems.map((problem, index) => renderProblemEditor(problem, index, guidanceFor)).join("") || `<p class="ed-empty">No problems added yet.</p>`}</div>`;

    return `<section class="note-draft-panel panel" aria-labelledby="draftNoteHeading">
      <div class="note-editor-toolbar">
        <div class="note-editor-title"><h2 id="draftNoteHeading">Draft note</h2><label class="note-type-control"><span>Format</span><select id="reviewNoteType"><option value="${NOTE_TYPES.PROGRESS}" ${draft.noteType === NOTE_TYPES.PROGRESS ? "selected" : ""}>Progress note</option><option value="${NOTE_TYPES.H_AND_P}" ${draft.noteType === NOTE_TYPES.H_AND_P ? "selected" : ""}>H&amp;P</option></select></label></div>
        <div class="note-editor-actions"><button type="button" class="button--primary button--small" data-action="save-note-draft">Save draft</button><button type="button" class="button--secondary button--small" data-action="copy-final-note">Copy for Epic</button><button type="button" class="button--secondary button--small" data-action="copy-rich-note">Copy rich text</button><button type="button" class="button--secondary button--small" data-action="download-final-note">${icon("download")} .txt</button></div>
      </div>
      <p class="ed-toolbar-note">One editor for the whole note — section labels included. Saving encrypts the draft without running de-identification.</p>
      <div class="note-editor" id="noteEditor" role="group" aria-label="Note editor">
        ${frontSections.join("")}
        ${editorSection("Physical Exam", checklistFindingsEditor(draft, "exam", "Complete the physical-exam checklist to populate this section."), { labelExtra: checklistTag, sectionAttr: ` data-checklist-finding-kind="exam"` })}
        ${editorSection("Objective", objectiveBody, { labelExtra: helpFor("objective", "Objective") })}
        ${editorSection("Assessment", editorRegion("data-draft-assessment", draft.assessment, "Your concise synthesis"), { labelExtra: helpFor("assessment", "Assessment") })}
        ${editorSection("Plan", planBody, { labelExtra: `${helpFor("plan", "Plan")}<button type="button" class="ed-mini" data-action="add-plan-problem">${icon("plus")} Add problem</button>` })}
        ${CLOSING_SECTION_FIELDS.map((field) => editorSection(field.label, editorRegion(`data-draft-closing="${field.id}"`, draft.closing?.[field.id]), { labelExtra: `${helpFor(field.id, field.label)}${optionalSectionToggle(field.id, visibility)}` })).join("")}
        ${editorSection("Medications", renderMedicationsEditor(draft), { labelExtra: helpFor("medications", "Medications") })}
      </div>
    </section>`;
  }

  function renderReview({ patientLabel, oneLiner, packets, selectedPacketId, index, query, category, draft, guidanceFor, differenceSelectionId, baselineEditorId, collapsedFamilies, patientRequiredMessage }) {
    if (!draft) return patientRequiredMessage;
    const selectedIds = new Set((draft.objective?.selectedBlocks || []).map((block) => block.selectionId));
    return `<div class="review-workspace">
      <header class="review-hero panel">
        <div><span class="eyebrow">${escapeHtml(patientLabel)}</span><h1 id="review-heading">Review Data / Draft Note</h1><p class="review-one-liner ${oneLiner ? "" : "is-empty"}">${escapeHtml(oneLiner || "One-liner not entered yet. You can continue and add it in the draft.")}</p></div>
        <label>Note packet<select id="reviewPacketSelect">${packets.map((packet) => `<option value="${escapeHtml(packet.id)}" ${packet.id === selectedPacketId ? "selected" : ""}>${escapeHtml(packet.label)}</option>`).join("")}</select></label>
      </header>
      <div class="review-columns">${renderDataExplorer({ index, selectedIds, query, category, baselineEditorId, collapsedFamilies })}${renderDraft({ draft, guidanceFor, differenceSelectionId })}</div>
    </div>`;
  }

  return Object.freeze({ renderReview });
}
