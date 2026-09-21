import { evaluatePacketCompleteness, packetReviewRequirement } from "../../daily-updates/packet-completeness.js?v=20260920-clinical-review";
import { parseClinicalExport } from "../../patient-context/clinical-export-parser.js?v=20260920-clinical-review";
import { clinicalDisplayModelFromPromptText } from "../../patient-context/structured-clinical-data.js?v=20260920-clinical-review";

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
        <span class="clinical-trend__range">${escapeHtml(String(values[0]))} → ${escapeHtml(String(values.at(-1)))}${series.points[0]?.unit ? ` ${escapeHtml(series.points[0].unit)}` : ""}</span>
      </div>
    `;
  }

  function renderClinicalDisplay(displayModel, idBase = "clinical") {
    if (!displayModel?.groups?.length) return "";
    const safeIdBase = String(idBase || "clinical").replace(/[^a-z0-9_-]/gi, "") || "clinical";
    const allowedEmphasis = new Set(["high", "low", "abnormal", "normal", "unknown"]);
    const tables = displayModel.groups.map((group, groupIndex) => `
      <section class="clinical-data-group" aria-labelledby="${safeIdBase}ClinicalDataGroup${groupIndex}">
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
    const trends = (displayModel.series || []).filter((series) => series.points?.length > 1).slice(0, 8);
    const sourceSystem = displayModel.provenance?.sourceSystem || "the copied chart";
    return `
      <div class="clinical-data-view" data-clinical-view="${escapeHtml(displayModel.type)}">
        <div class="clinical-data-view__heading">
          <strong>${escapeHtml(displayModel.title)}</strong>
          <span>Parsed locally from ${escapeHtml(sourceSystem)} standard-format data</span>
        </div>
        ${tables}
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
                  ${renderClinicalDisplay(section.displayModel, `${prefix}${index}`)}
                  ${renderPromptTextEditor({ prefix, outputText: section.outputText, sectionIndex: String(index) })}
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
        <p class="source-parse-help">Review the clean display below. The separate AI-ready text is compact, editable, and is the only parsed representation sent through local de-identification and into prompts.</p>
        ${renderClinicalDisplay(parseResult.displayModel, prefix)}
        ${renderPromptTextEditor({ prefix, outputText: parseResult.outputText })}
      </section>
    `;
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
    generateLabel
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
      <section class="source-capture-composer" aria-labelledby="addChartSourceTitle">
        <div class="section-heading tight"><div><h3 id="addChartSourceTitle">Add chart source</h3><p class="muted">Paste a full Epic or CPRS block. Medication, laboratory, and vital-sign tables are organized automatically; narrative text stays as written.</p></div></div>
        ${renderSourcePicker(sourceOptions, selectedSourceKind, scope)}
        <label class="source-draft-label" for="${draftId}">Paste the full copied block
          <textarea id="${draftId}" rows="8" placeholder="Paste the full copied text from ${escapeHtml(selectedSource.label)} here">${escapeHtml(sourceDraft)}</textarea>
        </label>
        <div class="source-draft-footer">
          <span class="muted" data-${prefix}-source-draft-count>${sourceDraft.length.toLocaleString()} characters · ${escapeHtml(selectedSource.description)}</span>
          <button class="button--primary" type="button" data-action="${addAction}" ${deidBusy || !sourceDraft.trim() ? "disabled" : ""}>${deidBusy ? "De-identifying…" : addLabel}</button>
        </div>
        <div data-source-parse-preview="${prefix}">${renderSourceParsePreview({ scope, parseResult: sourceParse })}</div>
      </section>
      <section class="saved-source-list" aria-labelledby="savedSourcesTitle">
        <div class="section-heading tight"><div><h3 id="savedSourcesTitle">${sourceTitle}</h3><p class="muted">${sources.length} source${sources.length === 1 ? "" : "s"} · all included by default</p></div><button class="button--primary" type="button" data-action="${generateAction}" ${sources.length ? "" : "disabled"}>${generateLabel}</button></div>
        <div id="${scope === "admission" ? "contextSections" : "dailySources"}" class="source-capture-list">
          ${sources.length ? sources.map(renderSourceCaptureEditor).join("") : `<div class="empty-state">No sources saved yet. Start with the primary team note, Results, or Medication Activity.</div>`}
        </div>
        ${renderWarnings(sources, scope === "admission" ? "context" : "daily")}
      </section>
      ${renderPacketCheck(packetCheck, sources, scope)}
    `;
  }

  function renderPacketCheck(packetCheck, sources, scope) {
    const completeness = evaluatePacketCompleteness(sources, { scope });
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
                ${renderSourceWorkspace({ scope: "admission", sources: admissionSections, sourceOptions: admissionSourceOptions, selectedSourceKind: admissionSourceKind, sourceDraft: admissionSourceDraft, sourceParse: admissionSourceParse, renderSourceCaptureEditor: (section) => renderSectionEditor(section, "context"), renderWarnings, packetCheck: admissionPacketCheck, deidBusy, renderDeidStrip, generateAction: "open-admission-note", generateLabel: "Generate admission H&P" })}
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
              ${renderSourceWorkspace({ scope: "daily", sources: selected.sourceCaptures, sourceOptions, selectedSourceKind, sourceDraft, sourceParse, renderSourceCaptureEditor, renderWarnings, packetCheck, deidBusy, renderDeidStrip, generateAction: "open-progress-note", generateLabel: "Generate progress note" })}
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
