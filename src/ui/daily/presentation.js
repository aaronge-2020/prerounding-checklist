import { evaluatePacketCompleteness, packetReviewRequirement } from "../../daily-updates/packet-completeness.js?v=20260921-lab-panel-ui";
import { parseClinicalExport } from "../../patient-context/clinical-export-parser.js?v=20260921-lab-panel-ui";
import { clinicalDisplayModelFromPromptText } from "../../patient-context/structured-clinical-data.js?v=20260921-lab-panel-ui";
import { fieldsForNoteType, NOTE_TYPES } from "../../note-drafts/index.js?v=20260921-lab-panel-ui";
import { DIAGNOSTIC_RESULT_CATEGORIES } from "../../patient-context/source-captures.js?v=20260921-lab-panel-ui";

export function createDailyPresentation({ escapeHtml, icon }) {
  function renderRowReviewStatus(completeness) {
    const missingCount = completeness.missingRequired.length;
    if (missingCount) {
      return `<span class="day-row-review day-row-review--attention" data-required-missing="${missingCount}" aria-label="${missingCount} required source ${missingCount === 1 ? "is" : "are"} not reviewed"><span aria-hidden="true">!</span> ${missingCount} required</span>`;
    }
    return `<span class="day-row-review day-row-review--complete" data-required-missing="0">Required reviewed</span>`;
  }

  function renderDayRow(day, selectedDayId, index) {
    const userLabel =
      String(day.label || "")
        .replace(/^\s*hd\s*\d+\s*[-:|]?\s*/i, "")
        .trim() || `Hospital day ${index + 1}`;
    return `
      <button type="button" class="day-row ${day.id === selectedDayId ? "selected" : ""}" data-action="select-day" data-day-id="${escapeHtml(day.id)}">
        <span>
          <strong>HD${index + 1}</strong>
          <span class="muted">${escapeHtml(userLabel)} - ${escapeHtml(day.date)}</span>
        </span>
        <span class="day-row-meta">
          <span class="muted">${day.sourceCaptures.length} source${day.sourceCaptures.length === 1 ? "" : "s"}</span>
          ${renderRowReviewStatus(evaluatePacketCompleteness(day.sourceCaptures, { scope: "daily" }))}
        </span>
      </button>
    `;
  }

  function renderSourcePicker(sourceOptions, selectedSourceKind, scope = "daily") {
    return `
      <div class="source-kind-picker" role="group" aria-label="Chart source for the next paste">
        ${sourceOptions
          .map(
            (option) => `
          <button type="button" class="source-kind-button ${option.id === selectedSourceKind ? "selected" : ""}" data-action="select-${escapeHtml(scope)}-source-kind" data-source-kind="${escapeHtml(option.id)}" data-review-requirement="${packetReviewRequirement(option.id)}" aria-pressed="${String(option.id === selectedSourceKind)}">
            <span class="source-kind-label">${escapeHtml(option.label)}</span>
            <span class="source-kind-requirement">${packetReviewRequirement(option.id) === "required" ? "Required" : "Optional"}</span>
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderClinicalTrend(series) {
    const points = Array.isArray(series?.points) ? series.points.filter((point) => Number.isFinite(point?.value)) : [];
    if (points.length < 2) return "";
    const values = points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = maximum - minimum;
    const coordinates = points.map((point, index) => {
      const x = 4 + (index * 152) / (points.length - 1);
      const y = spread ? 34 - ((point.value - minimum) / spread) * 28 : 20;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), ...point };
    });
    return `
      <div class="clinical-trend" aria-label="${escapeHtml(series.name)} trend from ${values[0]} to ${values.at(-1)}">
        <span class="clinical-trend__label">${escapeHtml(series.name)}</span>
        <svg viewBox="0 0 160 40" role="img" aria-hidden="true" focusable="false">
          <polyline points="${coordinates.map((point) => `${point.x},${point.y}`).join(" ")}"></polyline>
          ${coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.5"></circle>`).join("")}
        </svg>
        <span class="clinical-trend__range">${escapeHtml(String(minimum))}–${escapeHtml(String(maximum))}${series.points[0]?.unit ? ` ${escapeHtml(series.points[0].unit)}` : ""}</span>
      </div>
    `;
  }

  function renderVitalStatistics(statistics = []) {
    if (!statistics.length) return "";
    return `
      <section class="clinical-vital-summary" aria-label="24-hour vital-sign summary">
        <div class="clinical-vital-summary__heading"><strong>24-hour summary</strong><span>Range, mean, and median through the latest recorded time</span></div>
        <div class="clinical-vital-summary__grid">
          ${statistics.map((statistic) => `
            <article class="clinical-vital-stat">
              <strong>${escapeHtml(statistic.name)}</strong>
              <span><b>${escapeHtml(String(statistic.minimum))}–${escapeHtml(String(statistic.maximum))}</b> ${escapeHtml(statistic.unit || "")}</span>
              <small>Mean ${escapeHtml(String(statistic.mean))} · Median ${escapeHtml(String(statistic.median))} · n=${statistic.count}</small>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderClinicalDisplay(displayModel, idBase = "clinical") {
    if (!displayModel?.groups?.length) return "";
    const safeIdBase = String(idBase || "clinical").replace(/[^a-z0-9_-]/gi, "") || "clinical";
    const allowedEmphasis = new Set(["high", "low", "abnormal", "normal", "unknown"]);
    const groups = displayModel.type === "vitals" ? displayModel.groups.slice(0, 1) : displayModel.groups;
    const tables = groups.map((group, groupIndex) => `
      <section class="clinical-data-group" aria-labelledby="${safeIdBase}ClinicalDataGroup${groupIndex}"${displayModel.type === "labs" ? ` data-clinical-lab-panel="${groupIndex}"${groupIndex ? " hidden" : ""}` : ""}>
        <div class="clinical-data-group__heading" id="${safeIdBase}ClinicalDataGroup${groupIndex}">
          <strong>${escapeHtml(group.label || displayModel.title)}</strong>
          ${group.timestamp ? `<span>${escapeHtml(group.timestamp)}</span>` : ""}
        </div>
        <div class="clinical-data-table-wrap">
          <table class="clinical-data-table">
            <thead><tr>${displayModel.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>
              ${group.rows.map((row) => {
                const emphasis = allowedEmphasis.has(row.emphasis) ? row.emphasis : "unknown";
                return `<tr data-clinical-emphasis="${emphasis}">${row.cells.map((cell, cellIndex) => `<${cellIndex ? "td" : "th"}${cellIndex ? "" : ' scope="row"'}>${escapeHtml(cell || "—")}</${cellIndex ? "td" : "th"}>`).join("")}</tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `).join("");
    const labNavigation = displayModel.type === "labs" && groups.length > 1 ? `
      <nav class="clinical-lab-navigation" aria-label="Laboratory collection navigation">
        <button type="button" class="button--quiet" data-action="clinical-lab-page" data-direction="-1" disabled aria-label="Previous laboratory collection">←</button>
        <span data-clinical-lab-position>1 of ${groups.length}</span>
        <button type="button" class="button--quiet" data-action="clinical-lab-page" data-direction="1" aria-label="Next laboratory collection">→</button>
      </nav>
    ` : "";
    const medicationRowCount = displayModel.type === "medications" ? groups.reduce((total, group) => total + group.rows.length, 0) : 0;
    const medicationPageCount = Math.max(1, Math.ceil(medicationRowCount / 10));
    const medicationControls = displayModel.type === "medications" ? `
      <div class="clinical-medication-controls">
        <label>Find medication <input type="search" data-clinical-medication-search placeholder="Name, dose, route, or regimen" autocomplete="off"></label>
        <nav aria-label="Medication pages">
          <button type="button" class="button--quiet" data-action="clinical-medication-page" data-direction="-1" disabled aria-label="Previous medication page">←</button>
          <span data-clinical-medication-position>1 of ${medicationPageCount} · ${medicationRowCount} medications</span>
          <button type="button" class="button--quiet" data-action="clinical-medication-page" data-direction="1" ${medicationPageCount === 1 ? "disabled" : ""} aria-label="Next medication page">→</button>
        </nav>
      </div>
    ` : "";
    let medicationRowIndex = 0;
    const medicationTables = displayModel.type === "medications" ? groups.map((group, groupIndex) => `
      <section class="clinical-data-group" aria-labelledby="${safeIdBase}ClinicalDataGroup${groupIndex}">
        <div class="clinical-data-group__heading" id="${safeIdBase}ClinicalDataGroup${groupIndex}"><strong>${escapeHtml(group.label || displayModel.title)}</strong></div>
        <div class="clinical-data-table-wrap">
          <table class="clinical-data-table">
            <thead><tr>${displayModel.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>${group.rows.map((row) => `<tr data-medication-row${medicationRowIndex++ >= 10 ? " hidden" : ""}>${row.cells.map((cell, cellIndex) => `<${cellIndex ? "td" : "th"}${cellIndex ? "" : ' scope="row"'}>${escapeHtml(cell || "—")}</${cellIndex ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
    `).join("") : tables;
    const trends = (displayModel.series || []).filter((series) => series.points?.length > 1).slice(0, 8);
    const sourceSystem = displayModel.provenance?.sourceSystem || "the copied chart";
    return `
      <div class="clinical-data-view" data-clinical-view="${escapeHtml(displayModel.type)}">
        <div class="clinical-data-view__heading">
          <strong>${escapeHtml(displayModel.title)}</strong>
          <span>Parsed locally from ${escapeHtml(sourceSystem)} standard-format data</span>
        </div>
        ${labNavigation}
        ${medicationControls}
        ${medicationTables}
        ${displayModel.type === "vitals" ? renderVitalStatistics(displayModel.statistics24h || []) : ""}
        ${trends.length ? `<section class="clinical-trends" aria-label="Available numeric trends"><strong>Trends in this paste</strong><div>${trends.map(renderClinicalTrend).join("")}</div></section>` : ""}
      </div>
    `;
  }

  function renderSavedClinicalDisplay(sourceKind, text, idBase) {
    const canonicalDisplay = clinicalDisplayModelFromPromptText(sourceKind, text);
    const parsedDisplay = canonicalDisplay || parseClinicalExport(text, { sourceKind }).displayModel;
    return renderClinicalDisplay(parsedDisplay, idBase);
  }

  function renderPromptTextEditor({ prefix, outputText, sectionIndex = "" }) {
    const suffix = sectionIndex === "" ? "" : sectionIndex;
    const indexAttribute = sectionIndex === "" ? "" : ` data-source-section-index="${sectionIndex}"`;
    return `
      <details class="clinical-prompt-details">
        <summary>AI-ready text <span>editable before de-identification</span></summary>
        <label class="source-draft-label" for="${prefix}ParsedSourceDraft${suffix}">Text sent through local de-identification and then included in prompts
          <textarea id="${prefix}ParsedSourceDraft${suffix}" rows="7" data-source-parsed-draft data-source-scope="${prefix}"${indexAttribute}>${escapeHtml(outputText)}</textarea>
        </label>
        <span class="muted" data-source-parsed-count${sectionIndex === "" ? "" : `="${sectionIndex}"`}>${outputText.length.toLocaleString()} characters after parsing</span>
      </details>
    `;
  }

  function renderSourceParsePreview({ scope, parseResult }) {
    const prefix = scope === "admission" ? "admission" : "daily";
    if (!parseResult?.rawCharacterCount) return "";
    if (!parseResult.recognized) {
      return `
        <div class="source-parse-status" data-source-parse-state="plain">
          <strong>${escapeHtml(parseResult.formatLabel)}</strong>
          <span class="muted">${escapeHtml(parseResult.summary)}</span>
        </div>
      `;
    }
    const parsedSections = Array.isArray(parseResult.sections) ? parseResult.sections : [];
    if (parsedSections.length > 1) {
      return `
        <section class="source-parse-review" data-source-parse-state="recognized" aria-labelledby="${prefix}ParseTitle">
          <div class="source-parse-heading">
            <div>
              <strong id="${prefix}ParseTitle">${escapeHtml(parseResult.formatLabel)} recognized as ${parsedSections.length} sources</strong>
              <p class="muted">${escapeHtml(parseResult.summary)}</p>
            </div>
            <span class="source-parse-local">Session only</span>
          </div>
          <p class="source-parse-help">Each section below will be de-identified and saved as its own typed source. Review or edit any section before continuing.</p>
          <div class="source-parse-sections">
            ${parsedSections.map((section, index) => {
              const sourceLabel = {
                vital_signs: "Vital signs",
                laboratory_results: "Laboratory results",
                medication_activity: "Medication activity",
                results: "Other results"
              }[section.sourceKind] || "Other chart text";
              return `
                <section class="source-parse-section" aria-labelledby="${prefix}ParsedSourceTitle${index}">
                  <div class="source-parse-section-heading">
                    <strong id="${prefix}ParsedSourceTitle${index}">${escapeHtml(sourceLabel)}</strong>
                    <span class="muted">${escapeHtml(section.formatLabel)} · ${escapeHtml(section.summary)}</span>
                  </div>
                  ${renderPromptTextEditor({ prefix, outputText: section.canonicalPromptText || section.outputText, sectionIndex: String(index) })}
                </section>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }
    return `
      <section class="source-parse-review" data-source-parse-state="recognized" aria-labelledby="${prefix}ParseTitle">
        <div class="source-parse-heading">
          <div>
            <strong id="${prefix}ParseTitle">${escapeHtml(parseResult.formatLabel)} recognized</strong>
            <p class="muted">${escapeHtml(parseResult.summary)}</p>
          </div>
          <span class="source-parse-local">Session only</span>
        </div>
        <p class="source-parse-help">The compact AI-ready text below is editable and is the only parsed representation sent through local de-identification and into prompts. Clinical summaries and trends appear after saving on Review Data / Draft Note.</p>
        ${renderPromptTextEditor({ prefix, outputText: parseResult.canonicalPromptText || parseResult.outputText })}
      </section>
    `;
  }

  function renderStructuredPrimaryNote({ noteType, note, draftValues = {}, scope, deidBusy }) {
    const typeLabel = noteType === NOTE_TYPES.H_AND_P ? "H&P source sections" : "Progress-note source sections";
    const saved = Boolean(note);
    return `<section class="structured-primary-note" aria-labelledby="${scope}StructuredNoteHeading">
      <div class="section-heading tight"><div><h3 id="${scope}StructuredNoteHeading">${typeLabel}</h3><p class="muted">Enter only the sections that are available. The one-liner is encouraged but never required.</p></div><span class="source-parse-local">${saved ? "Saved locally" : "Optional"}</span></div>
      <div class="structured-note-grid">
        ${fieldsForNoteType(noteType).map((field) => {
          const value = Object.hasOwn(draftValues, field.id)
            ? draftValues[field.id]
            : note?.sections?.[field.id]?.deidentifiedText || "";
          const rows = field.id === "one_liner" || field.id === "chief_complaint" ? 2 : 4;
          return `<label class="${field.id === "one_liner" ? "structured-note-one-liner" : ""}">${escapeHtml(field.label)}${field.id === "one_liner" ? " · primary summary" : ""}<textarea rows="${rows}" data-structured-note-field="${escapeHtml(field.id)}" data-structured-note-scope="${escapeHtml(scope)}" placeholder="Optional">${escapeHtml(value)}</textarea></label>`;
        }).join("")}
      </div>
      <div class="source-draft-footer"><span class="muted">Saved fields are locally de-identified before entering the encrypted vault.</span><button type="button" class="button--primary" data-action="save-structured-primary-note" data-note-scope="${escapeHtml(scope)}" ${deidBusy ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "Save structured note"}</button></div>
    </section>`;
  }

  function renderSourceWorkspace({
    scope,
    sources,
    sourceOptions,
    selectedSourceKind,
    sourceDraft,
    sourceParse,
    renderSourceCaptureEditor,
    renderWarnings,
    packetCheck,
    deidBusy,
    renderDeidStrip,
    generateAction,
    generateLabel,
    primaryTeamNote,
    structuredNoteDraft,
    noteType,
    resultMetadata = { label: "", category: "imaging", date: "", context: "" }
  }) {
    const selectedSource = sourceOptions.find((option) => option.id === selectedSourceKind) || sourceOptions[0];
    const prefix = scope === "admission" ? "admission" : "daily";
    const addAction = scope === "admission" ? "add-admission-source" : "add-daily-source";
    const parsedSourceCount = Array.isArray(sourceParse?.sections) && sourceParse.sections.length > 1 ? sourceParse.sections.length : 1;
    const addLabel = parsedSourceCount > 1 ? `De-identify and add ${parsedSourceCount} sources` : "De-identify and add source";
    const draftId = `${prefix}SourceDraft`;
    const sourceTitle = scope === "admission" ? "Admission sources" : "Saved sources";
    return `
      ${renderDeidStrip}
      ${renderSourcePicker(sourceOptions, selectedSourceKind, scope)}
      ${selectedSourceKind === "primary_note" ? renderStructuredPrimaryNote({ noteType, note: primaryTeamNote, draftValues: structuredNoteDraft, scope, deidBusy }) : `<section class="source-capture-composer" aria-labelledby="addChartSourceTitle">
        <div class="section-heading tight"><div><h3 id="addChartSourceTitle">Add chart source</h3><p class="muted">Paste a full Epic or CPRS block. Medication, laboratory, and vital-sign tables are organized automatically; narrative text stays as written.</p></div></div>
        ${selectedSourceKind === "results" ? `<div class="structured-result-fields">
          <label>Result label<input data-result-metadata="label" data-result-scope="${escapeHtml(scope)}" value="${escapeHtml(resultMetadata.label || "")}" placeholder="CT Head/Neck Without Contrast"></label>
          <label>Result type<select data-result-metadata="category" data-result-scope="${escapeHtml(scope)}">${DIAGNOSTIC_RESULT_CATEGORIES.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === resultMetadata.category ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}</select></label>
          <label>Result date<input type="date" data-result-metadata="date" data-result-scope="${escapeHtml(scope)}" value="${escapeHtml(resultMetadata.date || "")}"></label>
          <label>Context<input data-result-metadata="context" data-result-scope="${escapeHtml(scope)}" value="${escapeHtml(resultMetadata.context || "")}" placeholder="Final read, blood culture source, specimen…"></label>
        </div>` : ""}
        <label class="source-draft-label" for="${draftId}">Paste the full copied block
          <textarea id="${draftId}" rows="8" placeholder="Paste the full copied text from ${escapeHtml(selectedSource.label)} here">${escapeHtml(sourceDraft)}</textarea>
        </label>
        <div class="source-draft-footer">
          <span class="muted" data-${prefix}-source-draft-count>${sourceDraft.length.toLocaleString()} characters · ${escapeHtml(selectedSource.description)}</span>
          <button class="button--primary" type="button" data-action="${addAction}" ${deidBusy || !sourceDraft.trim() ? "disabled" : ""}>${deidBusy ? "De-identifying…" : addLabel}</button>
        </div>
        <div data-source-parse-preview="${prefix}">${renderSourceParsePreview({ scope, parseResult: sourceParse })}</div>
      </section>`}
      <section class="saved-source-list" aria-labelledby="savedSourcesTitle">
        <div class="section-heading tight"><div><h3 id="savedSourcesTitle">${sourceTitle}</h3><p class="muted">${sources.length} source${sources.length === 1 ? "" : "s"} · summaries are reviewed on the separate note workspace</p></div><button class="button--primary" type="button" data-action="${generateAction}" ${sources.length || primaryTeamNote ? "" : "disabled"}>${generateLabel}</button></div>
        <div id="${scope === "admission" ? "contextSections" : "dailySources"}" class="source-capture-list">
          ${sources.length ? sources.map(renderSourceCaptureEditor).join("") : `<div class="empty-state">No sources saved yet. Start with the primary team note, Results, or Medication Activity.</div>`}
        </div>
        ${renderWarnings(sources, scope === "admission" ? "context" : "daily")}
      </section>
      ${renderPacketCheck(packetCheck, sources, scope)}
    `;
  }

  function renderPacketCheck(packetCheck, sources, scope) {
    const completeness = packetCheck.completeness || evaluatePacketCompleteness(sources, { scope });
    const included = packetCheck.included.length ? packetCheck.included.join(", ") : "No selected-day sources saved yet.";
    const needsConfirmation = packetCheck.needsConfirmation.length
      ? packetCheck.needsConfirmation.join(", ")
      : "No residual de-identification warnings.";
    const missingCount = completeness.missingRequired.length;
    return `
      <section class="packet-check" aria-labelledby="packetCheckTitle">
        <div class="section-heading tight">
          <div>
            <h3 id="packetCheckTitle">Review completeness</h3>
            <p class="muted">Required items are visible reminders, not blockers. You can continue with missing sources; the app will not infer their contents from another source.</p>
          </div>
        </div>
        <div class="packet-review-summary" data-packet-review-state="${missingCount ? "attention" : "complete"}">
          <span class="packet-review-summary__indicator" aria-hidden="true">${missingCount ? "!" : "✓"}</span>
          <span class="packet-review-summary__copy">${missingCount ? `${missingCount} required item${missingCount === 1 ? " has" : "s have"} not been reviewed` : "All required items have been reviewed"}</span>
        </div>
        <ul class="packet-review-list" aria-label="Required and optional packet items">
          ${completeness.items.map((item) => `
            <li class="packet-review-item packet-review-item--${item.reviewed ? "reviewed" : "missing"}" data-review-item="${escapeHtml(item.id)}" data-review-requirement="${item.requirement}" data-review-status="${item.status}">
              <span class="packet-review-item__indicator" aria-hidden="true">${item.reviewed ? "✓" : item.requirement === "required" ? "!" : "—"}</span>
              <strong class="packet-review-item__label">${escapeHtml(item.label)}</strong>
              <span class="packet-review-item__requirement">${item.requirement === "required" ? "Required" : "Optional"}</span>
              <span class="packet-review-item__status">${item.reviewed ? "Reviewed" : "Not reviewed"}</span>
            </li>
          `).join("")}
        </ul>
        <dl class="packet-check-list">
          <div><dt>Included</dt><dd>${escapeHtml(included)}</dd></div>
          <div class="packet-check-review"><dt>Needs confirmation</dt><dd>${escapeHtml(needsConfirmation)}</dd></div>
        </dl>
      </section>
    `;
  }

  function renderDaily({
    patient,
    days,
    selectedDayId,
    selectedPacketId,
    localCalendarDate,
    patientRequiredMessage,
    renderDeidStrip,
    renderSectionEditor,
    renderSourceCaptureEditor,
    renderWarnings,
    sourceOptions,
    admissionSourceOptions = sourceOptions,
    selectedSourceKind,
    sourceDraft = "",
    sourceParse = null,
    admissionSourceKind = "primary_note",
    admissionSourceDraft = "",
    admissionSourceParse = null,
    structuredNoteDrafts = {},
    dailyResultMetadata = { label: "", category: "imaging", date: "", context: "" },
    admissionResultMetadata = { label: "", category: "imaging", date: "", context: "" },
    packetCheck,
    admissionPacketCheck = { included: [], notSupplied: [], needsConfirmation: [] },
    deidBusy
  }) {
    if (!patient) return patientRequiredMessage;
    const selected = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
    const admissionSelected = selectedPacketId === "admission";
    const visibleContextSections = patient.contextSections.filter(
      (section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length
    );
    const admissionSections = patient.contextSections.filter(
      (section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length
    );
    const admissionCompleteness = evaluatePacketCompleteness(admissionSections, { scope: "admission" });

    return `
      <div class="stay-layout source-first-stay">
        <aside class="panel stay-rail">
          <div class="section-heading tight"><div><h2>Hospital stay</h2><p class="muted">Admission and each hospital day use one chronological workspace.</p></div></div>
          <div class="timeline-rail">
            <button type="button" class="day-row admission-day-row ${admissionSelected ? "selected" : ""}" data-action="select-admission" aria-current="${admissionSelected ? "page" : "false"}">
              <span><strong>Admission</strong><span class="muted">Initial presentation and admission sources</span></span>
              <span class="day-row-meta">
                <span class="muted">${visibleContextSections.length} source${visibleContextSections.length === 1 ? "" : "s"}</span>
                ${renderRowReviewStatus(admissionCompleteness)}
              </span>
            </button>
            ${days.length ? days.map((day, index) => renderDayRow(day, admissionSelected ? "" : selectedPacketId, index)).join("") : `<div class="empty-state compact">No later hospital days saved.</div>`}
          </div>
          <details class="new-day-control" ${days.length ? "" : "open"}>
            <summary>${icon("plus")} Add hospital day</summary>
            <div class="form-grid compact">
              <label>Hospital day date
                <input id="newDayDate" type="date" value="${escapeHtml(localCalendarDate)}">
              </label>
              <label>Label
                <input id="newDayLabel" placeholder="HD2 - Today">
              </label>
              <button class="button--secondary" type="button" data-action="add-day">Add day</button>
            </div>
          </details>
        </aside>
        <div class="stay-content">
          ${
            admissionSelected
              ? `<section class="panel admission-packet packet-surface hospital-day-packet">
              <div class="admission-packet-body">
                <div class="section-heading source-day-heading"><div><h2>Admission</h2><p class="muted">Paste broad chart blocks. The app preserves the source and includes every saved capture.</p></div></div>
                ${renderSourceWorkspace({ scope: "admission", sources: admissionSections, sourceOptions: admissionSourceOptions, selectedSourceKind: admissionSourceKind, sourceDraft: admissionSourceDraft, sourceParse: admissionSourceParse, renderSourceCaptureEditor: (section) => renderSectionEditor(section, "context"), renderWarnings, packetCheck: admissionPacketCheck, deidBusy, renderDeidStrip, generateAction: "open-admission-note", generateLabel: "Review data / draft H&P", primaryTeamNote: patient.admissionPrimaryTeamNote, structuredNoteDraft: structuredNoteDrafts?.admission || {}, noteType: NOTE_TYPES.H_AND_P, resultMetadata: admissionResultMetadata })}
              </div>
          </section>`
              : ""
          }
          ${
            !admissionSelected
              ? `<section class="panel hospital-day-packet packet-surface source-capture-workspace">
            ${
              selected
                ? `
              <div class="section-heading source-day-heading">
                <div><h2>${escapeHtml(selected.label)}</h2><p class="muted">${escapeHtml(selected.date)} · Paste broad chart blocks. The app preserves their source and includes every saved capture.</p></div>
                <div class="button-row">
                  <button class="button--quiet danger" type="button" data-action="remove-day">Remove day</button>
                  <button class="button--secondary" type="button" data-action="save-day" ${deidBusy || !selected.sourceCaptures.length ? "disabled" : ""}>Save source edits</button>
                </div>
              </div>
              ${renderSourceWorkspace({ scope: "daily", sources: selected.sourceCaptures, sourceOptions, selectedSourceKind, sourceDraft, sourceParse, renderSourceCaptureEditor, renderWarnings, packetCheck, deidBusy, renderDeidStrip, generateAction: "open-progress-note", generateLabel: "Review data / draft progress note", primaryTeamNote: selected.primaryTeamNote, structuredNoteDraft: structuredNoteDrafts?.[selected.id] || {}, noteType: NOTE_TYPES.PROGRESS, resultMetadata: dailyResultMetadata })}
            `
                : `<div class="empty-state">Add a hospital day to begin capturing selected-day sources.</div>`
            }
          </section>`
              : ""
          }
        </div>
      </div>
    `;
  }

  return Object.freeze({ renderClinicalDisplay, renderDaily, renderDayRow, renderSavedClinicalDisplay, renderSourceParsePreview });
}
