import { CLOSING_SECTION_FIELDS, fieldsForNoteType, NOTE_TYPES, SECTION_VISIBILITY_KEYS } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import {
  abnormalTone,
  compactLabTrendLine,
  compactVitalTrendLine,
  displayVitalName
} from "../../review-data/compact-summary.js?v=20260924-optional-sections-v1";
import { baselineDisplayText } from "../../patient-context/lab-baselines.js?v=20260924-lab-baselines-v1";

function valueText(value) {
  return String(value?.deidentifiedText || "");
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
    return `<label class="vital-chip ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}" data-clinical-emphasis="${escapeHtml(tone || "unknown")}">
      <input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}>
      <span class="vital-chip-name">${escapeHtml(displayName)}${flagPill(tone)}</span>
      <span class="vital-chip-value"><strong>${escapeHtml(value)}</strong></span>
      ${when ? `<span class="vital-chip-when">${escapeHtml(when)}</span>` : ""}
      ${trend ? `<span class="vital-chip-trend">${escapeHtml(trend)}</span>` : ""}
      ${stats ? `<span class="vital-chip-stats">${escapeHtml(stats)}</span>` : ""}
    </label>`;
  }

  function renderVitalsSection(vitals, selectedIds, query) {
    const chips = (vitals || []).map((candidate) => renderVitalChip(candidate, selectedIds.has(candidate.id), query)).filter(Boolean);
    if (!chips.length) return "";
    return `<section class="compact-section compact-vitals" data-compact-section="vitals" aria-label="Vital signs">
      <div class="compact-section-heading"><h3>Vital signs</h3><span class="compact-section-meta">${chips.length} saved · included automatically</span></div>
      <p class="compact-section-note">All vitals flow into the note by default. Uncheck any row to leave it out.</p>
      <div class="vital-strip">${chips.join("")}</div>
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
      return `<label class="compact-panel-select"><input type="checkbox" data-objective-selection-id="${escapeHtml(panel.id)}" data-lab-panel-selection="${escapeHtml(panel.id)}" aria-label="Include all results from ${escapeHtml(panel.name)}${panelWhen ? ` (${panelWhen})` : ""} in the note" ${selected ? "checked" : ""}><span>Select all${panelWhen ? ` · ${escapeHtml(panelWhen)}` : ""}</span></label>`;
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
    return `<li class="compact-row ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="compact-row-check"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
      <span class="compact-row-name"><strong>${escapeHtml(candidate.name)}</strong>${regimen ? `<small>${escapeHtml(regimen)}</small>` : ""}</span>
      <span class="compact-row-meta">${escapeHtml(candidate.scheduleLabel || "")}${candidate.latestAdministration ? ` · latest ${escapeHtml(candidate.latestAdministration)}` : ""}</span>
    </li>`;
  }

  function renderMedicationsSection(medications, selectedIds, query) {
    const rows = (medications || []).map((candidate) => renderMedicationRow(candidate, selectedIds.has(candidate.id), query)).filter(Boolean);
    if (!rows.length) return "";
    return `<section class="compact-section compact-medications" data-compact-section="medications" aria-label="Medications">
      <div class="compact-section-heading"><h3>Medications</h3><span class="compact-section-meta">${rows.length} saved · included automatically</span></div>
      <p class="compact-section-note">All medications flow into the Medications section at the end of the note. Uncheck any row to leave it out.</p>
      <ul class="compact-rows">${rows.join("")}</ul>
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
      return (index.reportItems || []).length + (index.pendingItems || []).length + familyRows;
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
      showMeds ? renderMedicationsSection(index.medications, selectedIds, q) : "",
      showDiagnostics ? renderDiagnosticsSection(index.diagnosticResults, selectedIds, q, category) : ""
    ].filter(Boolean);
    const matchCount = (index.vitals && showVitals ? index.vitals.filter((candidate) => matchesQuery(candidate.searchText, q)).length : 0)
      + (showLabs ? (index.pendingItems || []).filter((item) => matchesQuery(item.selectionCandidate.searchText, q)).length : 0)
      + (showLabs ? (index.reportItems || []).filter((item) => matchesQuery(item.selectionCandidate.searchText, q)).length : 0)
      + (showLabs ? (index.labFamilies || []).reduce((total, section) => total + section.rows.filter(({ result }) => matchesQuery(result.selectionCandidate?.searchText, q) || matchesQuery(section.label, q)).length, 0) : 0)
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

  function renderDraftSection(field, draft, noteType, guidanceFor) {
    const value = valueText(draft.sections?.[field.id]);
    const rows = field.id === "one_liner" || field.id === "chief_complaint" ? 2 : 4;
    const quickAction = noteType === NOTE_TYPES.PROGRESS && field.id === "interval_events"
      ? `<button type="button" class="button--quiet" data-action="insert-no-acute-events">No acute events overnight</button>`
      : "";
    // Diet and exercise is the one H&P field that is not a core section: not
    // every note covers it, so it gets the same optional on/off toggle as the
    // closing sections. It only exists on the H&P, so this never renders for
    // progress notes.
    const visibilityToggle = field.id === "diet_and_exercise"
      ? optionalSectionToggle(field.id, draft.sectionVisibility)
      : "";
    return `<section class="note-field-card ${field.id === "one_liner" ? "note-field-card--primary" : ""}">
      <div class="note-field-heading"><label for="draftSection_${escapeHtml(field.id)}">${escapeHtml(field.label)}${field.id === "one_liner" ? " · primary summary" : ""}</label>${helpButton(field.id, field.label, guidanceFor(field.id))}${visibilityToggle}</div>
      <textarea id="draftSection_${escapeHtml(field.id)}" rows="${rows}" data-draft-section="${escapeHtml(field.id)}" placeholder="Optional">${escapeHtml(value)}</textarea>
      ${quickAction}
    </section>`;
  }

  function renderChecklistFindings(draft, kind, label) {
    const blocks = (draft.checklistFindings?.selectedBlocks || []).filter((block) => block.kind === kind);
    return `<section class="auto-checklist-findings" data-checklist-finding-kind="${escapeHtml(kind)}">
      <div class="auto-checklist-heading"><strong>${escapeHtml(label)}</strong><span>${blocks.length} from Checklist</span></div>
      ${blocks.length ? `<ul>${blocks.map((block) => `<li>${escapeHtml(block.editedText)}</li>`).join("")}</ul>` : `<p class="muted">Complete the ${kind === "exam" ? "physical-exam" : "history"} checklist to populate this section.</p>`}
    </section>`;
  }

  // Core note sections are always in the final note. Only the optional
  // sections (Diet and exercise for the H&P; FEN, Ins/Outs, VTE prophylaxis,
  // code status, disposition, medication regimens as closing sections) get an
  // on/off toggle, rendered next to each field.
  function optionalSectionToggle(fieldId, visibility) {
    const meta = SECTION_VISIBILITY_KEYS.find((entry) => entry.id === fieldId) || { label: fieldId };
    const included = visibility?.[fieldId] !== false;
    return `<label class="scaffold-toggle" title="${included ? "Remove" : "Include"} ${escapeHtml(meta.label)} ${included ? "from" : "in"} the final note"><input type="checkbox" data-section-visibility="${escapeHtml(fieldId)}" ${included ? "checked" : ""}><span>In note</span></label>`;
  }

  function scaffold(key, title, body, extraHead = "") {
    return `<section class="note-scaffold" data-scaffold="${escapeHtml(key)}">
      <div class="note-scaffold-head"><h3>${escapeHtml(title)}</h3><div class="note-scaffold-actions">${extraHead}</div></div>
      <div class="note-scaffold-body">${body}</div>
    </section>`;
  }

  function renderMedicationsScaffold(draft) {
    const meds = (draft.objective?.selectedBlocks || []).filter((block) => block.noteGroupKey === "medications");
    if (!meds.length) return `<p class="muted">No medications in the note. Check medications under Clinical data to add them.</p>`;
    return `<ul class="scaffold-med-list">${meds.map((block) => {
      const label = String(block.noteLabel || block.editedText || "Medication").trim();
      const detail = String(block.noteDetail || "").trim();
      return `<li><span><strong>${escapeHtml(label)}</strong>${detail ? ` <span class="muted">${escapeHtml(detail)}</span>` : ""}</span><button type="button" class="button--quiet danger-subtle" data-action="remove-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Remove</button></li>`;
    }).join("")}</ul><p class="muted">These render in their own Medications section at the very end of the final note.</p>`;
  }

  function renderObjective(draft, guidanceFor, differenceSelectionId) {
    // Medication blocks are managed in the Medications scaffold, never here.
    const blocks = (draft.objective?.selectedBlocks || []).filter((block) => block.noteGroupKey !== "medications");
    return `<p class="muted">Vitals are in the note automatically. Check labs or diagnostic results under Clinical data to add them here.</p>
      <div class="objective-linked-blocks">
        ${blocks.map((block) => `<article class="objective-linked-block" data-objective-block="${escapeHtml(block.selectionId)}" data-objective-state="${escapeHtml(block.state)}">
          <div class="objective-linked-heading"><strong>${block.state === "stale" ? "Source changed — your edit was kept" : block.state === "edited" ? "Edited source-linked block" : "Source-linked block"}</strong><button type="button" class="button--quiet" data-action="remove-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Remove</button></div>
          <textarea rows="4" data-objective-block-text="${escapeHtml(block.selectionId)}">${escapeHtml(block.editedText)}</textarea>
          ${block.state === "stale" ? `<div class="button-row"><button type="button" data-action="refresh-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Refresh from source</button><button type="button" data-action="keep-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Keep my edit</button><button type="button" class="button--quiet" data-action="review-objective-difference" data-selection-id="${escapeHtml(block.selectionId)}">Review differences</button></div>${differenceSelectionId === block.selectionId ? `<div class="objective-diff"><div><strong>Your text</strong><pre>${escapeHtml(block.editedText)}</pre></div><div><strong>Updated source preview</strong><pre>${escapeHtml(block.pendingGeneratedText || "")}</pre></div></div>` : ""}` : ""}
        </article>`).join("") || `<div class="empty-state compact">Choose items from Clinical data to add source-linked Objective content.</div>`}
      </div>
      <label>Student-authored Objective text<textarea rows="5" data-draft-objective-manual placeholder="Optional exam findings, intake/output, or other directly observed data">${escapeHtml(valueText(draft.objective?.manual))}</textarea></label>`;
  }

  function renderDifferential(differential, problemId, index) {
    return `<article class="differential-card" data-differential-id="${escapeHtml(differential.id)}">
      <div class="note-field-heading"><strong>#${index + 1} differential</strong><div class="button-row"><button type="button" class="icon-button" data-action="move-differential" data-direction="-1" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}" aria-label="Move differential up">↑</button><button type="button" class="icon-button" data-action="move-differential" data-direction="1" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}" aria-label="Move differential down">↓</button><button type="button" class="button--quiet danger-subtle" data-action="remove-differential" data-problem-id="${escapeHtml(problemId)}" data-differential-id="${escapeHtml(differential.id)}">Remove</button></div></div>
      <label>Diagnosis<input data-differential-field="diagnosis" value="${escapeHtml(valueText(differential.diagnosis))}"></label>
      <div class="two-column-form"><label>Clues for<textarea rows="2" data-differential-field="cluesFor" placeholder="Optional">${escapeHtml(valueText(differential.cluesFor))}</textarea></label><label>Clues against<textarea rows="2" data-differential-field="cluesAgainst" placeholder="Optional">${escapeHtml(valueText(differential.cluesAgainst))}</textarea></label></div>
    </article>`;
  }

  function renderProblem(problem, index, guidanceFor) {
    const known = problem.etiologyStatus === "known";
    return `<article class="plan-problem-card" data-problem-id="${escapeHtml(problem.id)}">
      <div class="plan-problem-heading"><strong>Problem ${index + 1}</strong><div class="button-row"><button type="button" class="icon-button" data-action="move-plan-problem" data-direction="-1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem up">↑</button><button type="button" class="icon-button" data-action="move-plan-problem" data-direction="1" data-problem-id="${escapeHtml(problem.id)}" aria-label="Move problem down">↓</button><button type="button" class="button--quiet danger-subtle" data-action="remove-plan-problem" data-problem-id="${escapeHtml(problem.id)}">Remove</button></div></div>
      <label>Clinical problem<input data-problem-field="problem" value="${escapeHtml(valueText(problem.problem))}" placeholder="Name the clinical problem, not a test or treatment"></label>
      <label>Key context<textarea rows="2" data-problem-field="keyContext" placeholder="Optional concise context">${escapeHtml(valueText(problem.keyContext))}</textarea></label>
      <fieldset class="etiology-control"><legend><span>Etiology</span>${helpButton(known ? "etiology_known" : "etiology_unknown", "Etiology status", guidanceFor(known ? "etiology_known" : "etiology_unknown"))}</legend><div class="segmented-options"><label><input type="radio" name="etiology_${escapeHtml(problem.id)}" data-problem-etiology value="known" ${known ? "checked" : ""}> <span>Known</span></label><label><input type="radio" name="etiology_${escapeHtml(problem.id)}" data-problem-etiology value="unknown" ${known ? "" : "checked"}> <span>Unknown</span></label></div></fieldset>
      ${known ? `<label>Known etiology<input data-problem-field="knownEtiology" value="${escapeHtml(valueText(problem.knownEtiology))}" placeholder="Documented cause or mechanism"></label>` : `<section class="differential-builder"><div class="note-field-heading"><strong>Ranked differential</strong><button type="button" data-action="add-differential" data-problem-id="${escapeHtml(problem.id)}">${icon("plus")} Add differential</button></div>${problem.differentials.map((entry, differentialIndex) => renderDifferential(entry, problem.id, differentialIndex)).join("") || `<div class="empty-state compact">No differential diagnoses added.</div>`}</section>`}
      <div class="two-column-form"><label>Diagnostic plan<textarea rows="3" data-problem-field="diagnosticPlan">${escapeHtml(valueText(problem.diagnosticPlan))}</textarea></label><label>Therapeutic / management plan<textarea rows="3" data-problem-field="therapeuticPlan">${escapeHtml(valueText(problem.therapeuticPlan))}</textarea></label></div>
    </article>`;
  }

  function renderDraft({ draft, guidanceFor, differenceSelectionId, finalNoteHtml }) {
    const visibility = draft.sectionVisibility || {};
    const subjectiveBody = `<div class="note-section-stack">${fieldsForNoteType(draft.noteType).map((field) => renderDraftSection(field, draft, draft.noteType, guidanceFor)).join("")}</div>${renderChecklistFindings(draft, "history", draft.noteType === NOTE_TYPES.H_AND_P ? "Review of systems" : "Bedside history")}`;
    const assessmentBody = `<textarea rows="4" data-draft-assessment placeholder="Your concise synthesis">${escapeHtml(valueText(draft.assessment))}</textarea>`;
    const planBody = `<p class="muted">Order problems by decisional importance. Add only reasoning and actions you support.</p><div class="plan-problem-list">${draft.problems.map((problem, index) => renderProblem(problem, index, guidanceFor)).join("") || `<div class="empty-state compact">No problems added yet.</div>`}</div>`;
    const closingBody = `<p class="muted">Optional sections only appear in the final note when they have text and are switched on. Every note always includes the core sections above.</p><div class="closing-section-grid">${CLOSING_SECTION_FIELDS.map((field) => `<div class="closing-field"><div class="note-label-row"><label for="draftClosing_${escapeHtml(field.id)}">${escapeHtml(field.label)}</label><div class="closing-field-actions">${helpButton(field.id, field.label, guidanceFor(field.id))}${optionalSectionToggle(field.id, visibility)}</div></div><textarea id="draftClosing_${escapeHtml(field.id)}" rows="2" data-draft-closing="${escapeHtml(field.id)}">${escapeHtml(valueText(draft.closing?.[field.id]))}</textarea></div>`).join("")}</div>`;
    return `<section class="note-draft-panel panel" aria-labelledby="draftNoteHeading">
      <div class="section-heading note-draft-header"><div><div class="note-title-row"><h2 id="draftNoteHeading">Draft note</h2><label class="note-type-control"><span>Format</span><select id="reviewNoteType"><option value="${NOTE_TYPES.PROGRESS}" ${draft.noteType === NOTE_TYPES.PROGRESS ? "selected" : ""}>Progress note</option><option value="${NOTE_TYPES.H_AND_P}" ${draft.noteType === NOTE_TYPES.H_AND_P ? "selected" : ""}>H&amp;P</option></select></label></div><p class="muted">Optional closing sections can be toggled on or off for the final note. Saving encrypts the draft without running de-identification.</p></div><button type="button" class="button--primary" data-action="save-note-draft">Save encrypted draft</button></div>
      <section class="note-scaffold note-preview-scaffold">
        <div class="note-scaffold-head"><h3>Full note</h3><div class="button-row note-export-actions"><button type="button" class="button--primary" data-action="copy-final-note">Copy plain text for Epic</button><button type="button" class="button--secondary" data-action="copy-rich-note">Copy rich text</button><button type="button" class="button--secondary" data-action="download-final-note">${icon("download")} Download .txt</button></div></div>
        <p class="muted">Plain text suits Epic and other EHRs; rich text keeps headings, tables, and bolding when pasted into a document editor.</p>
        <div class="rich-note-preview note-preview-body" data-final-note-preview>${finalNoteHtml || `<p class="muted">Start writing to build the note preview.</p>`}</div>
      </section>
      ${scaffold("subjective_history", draft.noteType === NOTE_TYPES.H_AND_P ? "History" : "Subjective", subjectiveBody)}
      ${scaffold("physical_exam", "Physical exam", renderChecklistFindings(draft, "exam", "Physical exam"))}
      ${scaffold("objective", "Objective", renderObjective(draft, guidanceFor, differenceSelectionId))}
      ${scaffold("assessment", "Assessment", assessmentBody, helpButton("assessment", "Assessment", guidanceFor("assessment")))}
      ${scaffold("plan", "Problem-oriented Plan", planBody, `${helpButton("plan", "Plan", guidanceFor("plan"))}<button type="button" data-action="add-plan-problem">${icon("plus")} Add problem</button>`)}
      ${scaffold("medications", "Medications", renderMedicationsScaffold(draft))}
      ${scaffold("closing", "Optional closing sections", closingBody)}
    </section>`;
  }

  function renderReview({ patientLabel, oneLiner, packets, selectedPacketId, index, query, category, draft, guidanceFor, differenceSelectionId, finalNoteHtml, baselineEditorId, collapsedFamilies, patientRequiredMessage }) {
    if (!draft) return patientRequiredMessage;
    const selectedIds = new Set((draft.objective?.selectedBlocks || []).map((block) => block.selectionId));
    return `<div class="review-workspace">
      <header class="review-hero panel">
        <div><span class="eyebrow">${escapeHtml(patientLabel)}</span><h1 id="review-heading">Review Data / Draft Note</h1><p class="review-one-liner ${oneLiner ? "" : "is-empty"}">${escapeHtml(oneLiner || "One-liner not entered yet. You can continue and add it in the draft.")}</p></div>
        <label>Note packet<select id="reviewPacketSelect">${packets.map((packet) => `<option value="${escapeHtml(packet.id)}" ${packet.id === selectedPacketId ? "selected" : ""}>${escapeHtml(packet.label)}</option>`).join("")}</select></label>
      </header>
      <div class="review-columns">${renderDataExplorer({ index, selectedIds, query, category, baselineEditorId, collapsedFamilies })}${renderDraft({ draft, guidanceFor, differenceSelectionId, finalNoteHtml })}</div>
    </div>`;
  }

  return Object.freeze({ renderReview });
}
