import { CLOSING_SECTION_FIELDS, fieldsForNoteType, NOTE_TYPES } from "../../note-drafts/index.js?v=20260921-medication-card-v4";

function valueText(value) {
  return String(value?.deidentifiedText || "");
}

export function createReviewPresentation({ escapeHtml, icon }) {
  const helpButton = (key, label, guidance) => `<button type="button" class="note-help-button" data-help-key="${escapeHtml(key)}" data-tooltip="${escapeHtml(guidance || "No additional guidance.")}" aria-label="Help for ${escapeHtml(label)}">?</button>`;

  function renderTrend(candidate) {
    const observations = candidate.observations || [];
    const numeric = observations.filter((entry) => Number.isFinite(entry.numericValue ?? Number(entry.value)));
    let chart = "";
    if (numeric.length > 1) {
      const values = numeric.map((entry) => Number(entry.numericValue ?? entry.value));
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const spread = maximum - minimum;
      const points = values.map((value, index) => {
        const x = 5 + (index * 150) / Math.max(1, values.length - 1);
        const y = spread ? 35 - ((value - minimum) / spread) * 28 : 21;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      chart = `<svg class="review-mini-chart" viewBox="0 0 160 42" role="img" aria-label="${escapeHtml(candidate.name)} chronological trend"><polyline points="${points}"></polyline></svg>`;
    }
    const observationList = observations.length
      ? `<ol class="review-observation-list">${observations.map((entry) => `<li data-clinical-emphasis="${escapeHtml(entry.status || "unknown")}"><span>${escapeHtml([entry.value, entry.unit].filter(Boolean).join(" ") || "No value")}</span><small>${escapeHtml([entry.dayLabel, entry.timestamp].filter(Boolean).join(" · "))}${entry.status && !["normal", "unknown"].includes(entry.status) ? ` · ${escapeHtml(entry.status)}` : ""}</small></li>`).join("")}</ol>`
      : "";
    return `${chart}${observationList}`;
  }

  function renderLaboratoryTrend(result) {
    const observations = result.trend || [];
    const numeric = observations.filter((entry) => Number.isFinite(entry.numericValue));
    const units = new Set(numeric.map((entry) => entry.unit).filter(Boolean));
    let chart = "";
    if (numeric.length > 1 && units.size <= 1) {
      const values = numeric.map((entry) => entry.numericValue);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const spread = maximum - minimum;
      const coordinates = values.map((value, index) => ({
        x: 24 + (index * 312) / Math.max(1, values.length - 1),
        y: spread ? 88 - ((value - minimum) / spread) * 64 : 56
      }));
      const points = coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      chart = `<svg class="review-lab-trend-chart" viewBox="0 0 360 112" role="img" aria-label="${escapeHtml(result.name)} trend across ${numeric.length} results">
        <line x1="24" y1="24" x2="336" y2="24"></line><line x1="24" y1="56" x2="336" y2="56"></line><line x1="24" y1="88" x2="336" y2="88"></line>
        <polyline points="${points}"></polyline>
        ${coordinates.map(({ x, y }, index) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${escapeHtml([numeric[index].value, numeric[index].unit, numeric[index].dayLabel, numeric[index].timestamp].filter(Boolean).join(" · "))}</title></circle>`).join("")}
      </svg>`;
    }
    const message = observations.length <= 1
      ? `<p class="muted review-lab-trend-message"><strong>No trend available.</strong> Only one saved result exists for this lab.</p>`
      : numeric.length > 1 && units.size > 1
        ? `<p class="muted review-lab-trend-message">Values use different units, so they are listed without connecting them on a graph.</p>`
        : "";
    return `<section class="review-lab-trend-drawer" aria-label="${escapeHtml(result.name)} trend">
      <div class="review-lab-trend-heading"><div><span class="eyebrow">Trend</span><h4>${escapeHtml(result.name)}</h4></div><span>${observations.length} saved result${observations.length === 1 ? "" : "s"}</span></div>
      ${chart}${message}
      <ol class="review-lab-trend-values">${observations.map((entry) => `<li data-clinical-emphasis="${escapeHtml(entry.status || "unknown")}"><strong>${escapeHtml([entry.value, entry.unit].filter(Boolean).join(" ") || "—")}</strong><span>${escapeHtml([entry.dayLabel, entry.timestamp].filter(Boolean).join(" · ") || "Saved result")}</span></li>`).join("")}</ol>
    </section>`;
  }

  function renderLaboratoryPanel(candidate, selected, labNavigation) {
    const abnormalCount = candidate.results.filter((result) => ["high", "low", "abnormal", "critical"].includes(result.status)).length;
    const navigation = labNavigation
      ? `<nav class="review-lab-panel-navigation" aria-label="Laboratory panel sets"><button type="button" class="icon-button" data-action="review-data-page" data-direction="-1" aria-label="Previous laboratory panel" ${labNavigation.page <= 0 ? "disabled" : ""}>←</button><output>Set ${labNavigation.page + 1} of ${labNavigation.pageCount}</output><button type="button" class="icon-button" data-action="review-data-page" data-direction="1" aria-label="Next laboratory panel" ${labNavigation.page >= labNavigation.pageCount - 1 ? "disabled" : ""}>→</button></nav>`
      : "";
    return `<article class="review-data-item review-data-item--lab ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <header class="review-lab-panel-header">
        <div class="review-lab-panel-heading"><label class="review-lab-selection"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include this ${escapeHtml(candidate.name)} panel in the note" ${selected ? "checked" : ""}></label><div class="review-lab-panel-identity"><div class="review-lab-title-line"><h3>${escapeHtml(candidate.name)}</h3>${abnormalCount ? `<span class="review-lab-abnormal-count">${abnormalCount} abnormal</span>` : ""}</div><p>${escapeHtml([candidate.dayLabel, candidate.timestamp].filter(Boolean).join(" · ") || "Saved laboratory panel")}</p></div></div>
        ${navigation}
      </header>
      <div class="review-lab-results"><div class="review-lab-results-header" aria-hidden="true"><span>Test</span><span>Result</span><span>Reference range</span></div>${candidate.results.map((result) => {
        const trendCount = result.trend?.length || 0;
        return `<details class="review-lab-result" data-has-trend="${trendCount > 1}" data-clinical-emphasis="${escapeHtml(result.status || "unknown")}"><summary><span class="review-lab-result-name"><span class="review-lab-chevron" aria-hidden="true">›</span><strong>${escapeHtml(result.name)}</strong><small>${trendCount > 1 ? `${trendCount} results` : "No trend"}</small></span><span class="review-lab-result-value">${escapeHtml([result.value, result.unit].filter(Boolean).join(" ") || "—")}${result.flag ? ` <small class="review-lab-flag">${escapeHtml(result.flag)}</small>` : ""}</span><span class="review-lab-reference">${escapeHtml(result.referenceRange || "—")}</span></summary>${renderLaboratoryTrend(result)}</details>`;
      }).join("")}</div>
      <details class="review-lab-note-preview"><summary>Preview note insertion</summary><pre>${escapeHtml(candidate.insertionText)}</pre></details>
    </article>`;
  }

  function renderMedication(candidate, selected) {
    const regimen = [candidate.dose, candidate.route, candidate.frequency].filter(Boolean).join(" · ");
    const prnDetails = [candidate.prnReason, candidate.prnComment].filter(Boolean).join(" — ");
    const administrations = candidate.administrations || [];
    const escapedDose = candidate.dose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repeatedDose = escapedDose ? new RegExp(`\\s*\\(\\s*${escapedDose}\\s*\\)$`, "i") : null;
    const formatAdministration = (value) => {
      const withClock = String(value || "").replace(/^(\d{2})(\d{2})(?=\s|$)/, "$1:$2");
      return repeatedDose ? withClock.replace(repeatedDose, "") : withClock;
    };
    const recentAdministrations = administrations.slice(-6);
    const earlierAdministrations = administrations.slice(0, -6);
    const administrationList = (items) => `<ol class="review-medication-administration-grid">${items.map((administration) => {
      const cancelled = /\s*\[C\]\s*$/i.test(administration);
      const value = formatAdministration(administration.replace(/\s*\[C\]\s*$/i, ""));
      return `<li ${cancelled ? `data-administration-status="cancelled"` : ""}><strong>${escapeHtml(value)}</strong>${cancelled ? `<small>Cancelled</small>` : ""}</li>`;
    }).join("")}</ol>`;
    return `<article class="review-data-item review-data-item--medication ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <header class="review-medication-header">
        <label class="review-medication-selection"><input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" aria-label="Include ${escapeHtml(candidate.name)} in the note" ${selected ? "checked" : ""}></label>
        <div class="review-medication-identity"><div class="review-medication-title-line"><h3>${escapeHtml(candidate.name)}</h3><span class="review-medication-type" data-medication-type="${escapeHtml(candidate.scheduleLabel.toLowerCase())}">${escapeHtml(candidate.scheduleLabel)}</span></div><p class="review-medication-regimen">${escapeHtml(regimen || "Regimen not documented")}</p>${candidate.rate ? `<p class="review-medication-rate">Infusion rate ${escapeHtml(candidate.rate)}</p>` : ""}</div>
        <div class="review-medication-latest"><span>Latest listed</span><strong>${escapeHtml(formatAdministration(candidate.latestAdministration) || "None")}</strong></div>
      </header>
      <details class="review-medication-details"><summary><span class="review-medication-activity-label"><span class="review-medication-list-icon" aria-hidden="true">☷</span><strong>${administrations.length} administration${administrations.length === 1 ? "" : "s"} recorded</strong>${prnDetails ? `<small>PRN details included</small>` : ""}</span><span class="review-medication-disclosure">${administrations.length ? "View administration history" : "View order details"}<span class="review-medication-chevron" aria-hidden="true">${icon("chevron")}</span></span></summary>
        <div class="review-medication-history">
          ${recentAdministrations.length ? `<section><header><strong>Most recent listed</strong><small>${recentAdministrations.length} entr${recentAdministrations.length === 1 ? "y" : "ies"}</small></header>${administrationList(recentAdministrations)}</section>` : `<p class="muted">No administration was documented in this saved MAR entry.</p>`}
          ${earlierAdministrations.length ? `<section><header><strong>Earlier listed</strong><small>${earlierAdministrations.length} entr${earlierAdministrations.length === 1 ? "y" : "ies"}</small></header>${administrationList(earlierAdministrations)}</section>` : ""}
          ${prnDetails ? `<div class="review-medication-prn"><span>Documented PRN use</span><p>${escapeHtml(prnDetails)}</p></div>` : ""}
        </div>
      </details>
      <details class="review-medication-note-preview"><summary>Preview note insertion</summary><pre>${escapeHtml(candidate.insertionText)}</pre></details>
    </article>`;
  }

  function renderCandidate(candidate, selectedIds, { labNavigation = null } = {}) {
    const selected = selectedIds.has(candidate.id);
    if (candidate.kind === "laboratory_panel") return renderLaboratoryPanel(candidate, selected, labNavigation);
    if (candidate.kind === "medication") return renderMedication(candidate, selected);
    const stats = candidate.statistics24h
      ? `<dl class="review-vital-stats"><div><dt>24-hour range</dt><dd>${escapeHtml(`${candidate.statistics24h.minimum}–${candidate.statistics24h.maximum} ${candidate.unit || ""}`.trim())}</dd></div><div><dt>Mean</dt><dd>${escapeHtml(`${candidate.statistics24h.mean} ${candidate.unit || ""}`.trim())}</dd></div><div><dt>Median</dt><dd>${escapeHtml(`${candidate.statistics24h.median} ${candidate.unit || ""}`.trim())}</dd></div></dl>`
      : "";
    const diagnostic = candidate.kind === "diagnostic_result"
      ? `<p class="review-result-text">${escapeHtml(candidate.text)}</p><small>${escapeHtml([candidate.resultDate, candidate.source?.dayLabel, candidate.context].filter(Boolean).join(" · "))}</small>`
      : "";
    return `<article class="review-data-item ${selected ? "is-selected" : ""}" data-review-candidate="${escapeHtml(candidate.id)}">
      <label class="objective-choice">
        <input type="checkbox" data-objective-selection-id="${escapeHtml(candidate.id)}" ${selected ? "checked" : ""}>
        <span><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(candidate.source?.dayLabel || candidate.group)}</small></span>
      </label>
      ${stats}${diagnostic}${candidate.observations?.length ? renderTrend(candidate) : ""}
      <details><summary>Preview note insertion</summary><pre>${escapeHtml(candidate.insertionText)}</pre></details>
    </article>`;
  }

  function renderDataExplorer({ index, filteredCandidates, filteredCandidateCount, page, pageCount, selectedIds, query, category }) {
    const labOnly = category === "labs";
    const pagination = pageCount > 1 && !labOnly
      ? `<nav class="review-data-pagination" aria-label="Clinical data pages"><button type="button" class="icon-button" data-action="review-data-page" data-direction="-1" aria-label="Previous clinical data page" ${page <= 0 ? "disabled" : ""}>←</button><output>Page ${page + 1} of ${pageCount}</output><button type="button" class="icon-button" data-action="review-data-page" data-direction="1" aria-label="Next clinical data page" ${page >= pageCount - 1 ? "disabled" : ""}>→</button></nav>`
      : "";
    return `<section class="review-data-panel panel" aria-labelledby="reviewDataHeading">
      <div class="section-heading"><div><h2 id="reviewDataHeading">Clinical data</h2><p class="muted">Saved source data and calculated summaries stay distinct. Check only what belongs in this note.</p></div></div>
      <div class="review-filter-row">
        <label>Search patient data<input type="search" id="reviewDataSearch" value="${escapeHtml(query)}" placeholder="${labOnly ? "WBC, CBC, metabolic panel…" : "WBC, ceftriaxone, CT Head…"}" autocomplete="off"></label>
        <label>Show<select id="reviewDataCategory"><option value="all">All clinical data</option>${index.groups.map((group) => `<option value="${escapeHtml(group.id)}" ${category === group.id ? "selected" : ""}>${escapeHtml(group.label)} (${group.candidates.length})</option>`).join("")}</select></label>
      </div>
      ${labOnly ? "" : `<p class="review-filter-summary" aria-live="polite">${filteredCandidateCount} matching item${filteredCandidateCount === 1 ? "" : "s"}</p>`}
      <div class="review-pagination-slot">${pagination}</div>
      <div class="review-data-list">${filteredCandidates.length ? filteredCandidates.map((candidate) => renderCandidate(candidate, selectedIds, { labNavigation: labOnly ? { page, pageCount } : null })).join("") : `<div class="empty-state">No saved clinical data match this search.</div>`}</div>
    </section>`;
  }

  function renderDraftSection(field, draft, noteType, guidanceFor) {
    const value = valueText(draft.sections?.[field.id]);
    const rows = field.id === "one_liner" || field.id === "chief_complaint" ? 2 : 4;
    const quickAction = noteType === NOTE_TYPES.PROGRESS && field.id === "interval_events"
      ? `<button type="button" class="button--quiet" data-action="insert-no-acute-events">No acute events overnight</button>`
      : "";
    return `<section class="note-field-card ${field.id === "one_liner" ? "note-field-card--primary" : ""}">
      <div class="note-field-heading"><label for="draftSection_${escapeHtml(field.id)}">${escapeHtml(field.label)}${field.id === "one_liner" ? " · primary summary" : ""}</label>${helpButton(field.id, field.label, guidanceFor(field.id))}</div>
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

  function renderObjective(draft, guidanceFor, differenceSelectionId) {
    return `<section class="note-builder-section" aria-labelledby="objectiveHeading">
      <div class="note-field-heading"><h3 id="objectiveHeading">Objective</h3>${helpButton("objective", "Objective", guidanceFor("objective"))}</div>
      ${renderChecklistFindings(draft, "exam", "Physical exam")}
      <p class="muted">Select labs, vital signs, medications, or diagnostic results from Clinical data when they belong in this note.</p>
      <div class="objective-linked-blocks">
        ${(draft.objective?.selectedBlocks || []).map((block) => `<article class="objective-linked-block" data-objective-block="${escapeHtml(block.selectionId)}" data-objective-state="${escapeHtml(block.state)}">
          <div class="objective-linked-heading"><strong>${block.state === "stale" ? "Source changed — your edit was kept" : block.state === "edited" ? "Edited source-linked block" : "Source-linked block"}</strong><button type="button" class="button--quiet" data-action="remove-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Remove</button></div>
          <textarea rows="4" data-objective-block-text="${escapeHtml(block.selectionId)}">${escapeHtml(block.editedText)}</textarea>
          ${block.state === "stale" ? `<div class="button-row"><button type="button" data-action="refresh-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Refresh from source</button><button type="button" data-action="keep-objective-selection" data-selection-id="${escapeHtml(block.selectionId)}">Keep my edit</button><button type="button" class="button--quiet" data-action="review-objective-difference" data-selection-id="${escapeHtml(block.selectionId)}">Review differences</button></div>${differenceSelectionId === block.selectionId ? `<div class="objective-diff"><div><strong>Your text</strong><pre>${escapeHtml(block.editedText)}</pre></div><div><strong>Updated source preview</strong><pre>${escapeHtml(block.pendingGeneratedText || "")}</pre></div></div>` : ""}` : ""}
        </article>`).join("") || `<div class="empty-state compact">Choose items from Clinical data to add source-linked Objective content.</div>`}
      </div>
      <label>Student-authored Objective text<textarea rows="5" data-draft-objective-manual placeholder="Optional exam findings, intake/output, or other directly observed data">${escapeHtml(valueText(draft.objective?.manual))}</textarea></label>
    </section>`;
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

  function renderDraft({ draft, guidanceFor, differenceSelectionId, finalNote }) {
    return `<section class="note-draft-panel panel" aria-labelledby="draftNoteHeading">
      <div class="section-heading note-draft-header"><div><div class="note-title-row"><h2 id="draftNoteHeading">Draft note</h2><label class="note-type-control"><span>Format</span><select id="reviewNoteType"><option value="${NOTE_TYPES.PROGRESS}" ${draft.noteType === NOTE_TYPES.PROGRESS ? "selected" : ""}>Progress note</option><option value="${NOTE_TYPES.H_AND_P}" ${draft.noteType === NOTE_TYPES.H_AND_P ? "selected" : ""}>H&amp;P</option></select></label></div><p class="muted">Checklist answers populate automatically. Saving encrypts the draft without running de-identification.</p></div><button type="button" class="button--primary" data-action="save-note-draft">Save encrypted draft</button></div>
      <section class="note-builder-section subjective-section"><h3>${draft.noteType === NOTE_TYPES.H_AND_P ? "History" : "Subjective"}</h3><div class="note-section-stack">${fieldsForNoteType(draft.noteType).map((field) => renderDraftSection(field, draft, draft.noteType, guidanceFor)).join("")}</div>${renderChecklistFindings(draft, "history", draft.noteType === NOTE_TYPES.H_AND_P ? "Review of systems" : "Bedside history")}</section>
      ${renderObjective(draft, guidanceFor, differenceSelectionId)}
      <section class="note-builder-section"><div class="note-field-heading"><h3>Assessment</h3>${helpButton("assessment", "Assessment", guidanceFor("assessment"))}</div><textarea rows="4" data-draft-assessment placeholder="Your concise synthesis">${escapeHtml(valueText(draft.assessment))}</textarea></section>
      <section class="note-builder-section" aria-labelledby="planBuilderHeading"><div class="section-heading tight"><div><h3 id="planBuilderHeading">Problem-oriented Plan</h3><p class="muted">Order problems by decisional importance. Add only reasoning and actions you support.</p></div><div class="button-row">${helpButton("plan", "Plan", guidanceFor("plan"))}<button type="button" data-action="add-plan-problem">${icon("plus")} Add problem</button></div></div><div class="plan-problem-list">${draft.problems.map((problem, index) => renderProblem(problem, index, guidanceFor)).join("") || `<div class="empty-state compact">No problems added yet.</div>`}</div></section>
      <section class="note-builder-section"><h3>Closing sections</h3><div class="closing-section-grid">${CLOSING_SECTION_FIELDS.map((field) => `<div class="closing-field"><div class="note-label-row"><label for="draftClosing_${escapeHtml(field.id)}">${escapeHtml(field.label)}</label>${helpButton(field.id, field.label, guidanceFor(field.id))}</div><textarea id="draftClosing_${escapeHtml(field.id)}" rows="2" data-draft-closing="${escapeHtml(field.id)}">${escapeHtml(valueText(draft.closing?.[field.id]))}</textarea></div>`).join("")}</div></section>
      <details class="final-note-preview" open><summary>Final note preview</summary><div class="button-row note-export-actions"><button type="button" class="button--primary" data-action="copy-final-note">Copy plain text for Epic</button><button type="button" class="button--secondary" data-action="download-final-note">${icon("download")} Download .txt</button></div><p class="muted">The exported version is plain text for Epic, another EHR, email, or a document editor.</p><pre data-final-note-preview>${escapeHtml(finalNote || "Start writing to build the note preview.")}</pre></details>
    </section>`;
  }

  function renderReview({ patientLabel, oneLiner, packets, selectedPacketId, index, filteredCandidates, filteredCandidateCount, page, pageCount, query, category, draft, guidanceFor, differenceSelectionId, finalNote, patientRequiredMessage }) {
    if (!draft) return patientRequiredMessage;
    const selectedIds = new Set((draft.objective?.selectedBlocks || []).map((block) => block.selectionId));
    return `<div class="review-workspace">
      <header class="review-hero panel">
        <div><span class="eyebrow">${escapeHtml(patientLabel)}</span><h1 id="review-heading">Review Data / Draft Note</h1><p class="review-one-liner ${oneLiner ? "" : "is-empty"}">${escapeHtml(oneLiner || "One-liner not entered yet. You can continue and add it in the draft.")}</p></div>
        <label>Note packet<select id="reviewPacketSelect">${packets.map((packet) => `<option value="${escapeHtml(packet.id)}" ${packet.id === selectedPacketId ? "selected" : ""}>${escapeHtml(packet.label)}</option>`).join("")}</select></label>
      </header>
      <div class="review-columns">${renderDataExplorer({ index, filteredCandidates, filteredCandidateCount, page, pageCount, selectedIds, query, category })}${renderDraft({ draft, guidanceFor, differenceSelectionId, finalNote })}</div>
    </div>`;
  }

  return Object.freeze({ renderReview });
}
