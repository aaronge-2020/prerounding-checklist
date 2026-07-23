export function createDailyPresentation({ escapeHtml, icon }) {
  function renderDayRow(day, selectedDayId, index) {
    const userLabel = String(day.label || "").replace(/^\s*hd\s*\d+\s*[-:|]?\s*/i, "").trim() || `Hospital day ${index + 1}`;
    return `
      <button type="button" class="day-row ${day.id === selectedDayId ? "selected" : ""}" data-action="select-day" data-day-id="${escapeHtml(day.id)}">
        <span>
          <strong>HD${index + 1}</strong>
          <span class="muted">${escapeHtml(userLabel)} - ${escapeHtml(day.date)}</span>
        </span>
        <span class="muted">${day.sourceCaptures.length} source${day.sourceCaptures.length === 1 ? "" : "s"}</span>
      </button>
    `;
  }

  function renderSourcePicker(sourceOptions, selectedSourceKind, scope = "daily") {
    return `
      <div class="source-kind-picker" role="group" aria-label="Epic source for the next paste">
        ${sourceOptions.map((option) => `
          <button type="button" class="source-kind-button ${option.id === selectedSourceKind ? "selected" : ""}" data-action="select-${escapeHtml(scope)}-source-kind" data-source-kind="${escapeHtml(option.id)}" aria-pressed="${String(option.id === selectedSourceKind)}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderSourceWorkspace({
    scope,
    sources,
    sourceOptions,
    selectedSourceKind,
    sourceDraft,
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
    const draftId = `${prefix}SourceDraft`;
    const sourceTitle = scope === "admission" ? "Admission sources" : "Saved sources";
    return `
      ${renderDeidStrip}
      <section class="source-capture-composer" aria-labelledby="addFromEpicTitle">
        <div class="section-heading tight"><div><h3 id="addFromEpicTitle">Add from Epic</h3><p class="muted">Choose where the text came from, then paste the whole relevant block without reorganizing it.</p></div></div>
        ${renderSourcePicker(sourceOptions, selectedSourceKind, scope)}
        <label class="source-draft-label" for="${draftId}">Paste the full copied block
          <textarea id="${draftId}" rows="8" placeholder="Paste the full copied text from ${escapeHtml(selectedSource.label)} here">${escapeHtml(sourceDraft)}</textarea>
        </label>
        <div class="source-draft-footer">
          <span class="muted" data-${prefix}-source-draft-count>${sourceDraft.length.toLocaleString()} characters · ${escapeHtml(selectedSource.description)}</span>
          <button class="button--primary" type="button" data-action="${addAction}" ${deidBusy || !sourceDraft.trim() ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "De-identify and add source"}</button>
        </div>
      </section>
      <section class="saved-source-list" aria-labelledby="savedSourcesTitle">
        <div class="section-heading tight"><div><h3 id="savedSourcesTitle">${sourceTitle}</h3><p class="muted">${sources.length} source${sources.length === 1 ? "" : "s"} · all included by default</p></div><button class="button--primary" type="button" data-action="${generateAction}" ${sources.length ? "" : "disabled"}>${generateLabel}</button></div>
        <div id="${scope === "admission" ? "contextSections" : "dailySources"}" class="source-capture-list">
          ${sources.length ? sources.map(renderSourceCaptureEditor).join("") : `<div class="empty-state">No sources saved yet. Start with the primary team note, Results, or Medication Activity.</div>`}
        </div>
        ${renderWarnings(sources, scope === "admission" ? "context" : "daily")}
      </section>
      ${renderPacketCheck(packetCheck)}
    `;
  }

  function renderPacketCheck(packetCheck) {
    const included = packetCheck.included.length ? packetCheck.included.join(", ") : "No selected-day sources saved yet.";
    const notSupplied = packetCheck.notSupplied.length ? packetCheck.notSupplied.join(", ") : "None of the expected source types are missing.";
    const needsConfirmation = packetCheck.needsConfirmation.length ? packetCheck.needsConfirmation.join(", ") : "No residual de-identification warnings.";
    return `
      <section class="packet-check" aria-labelledby="packetCheckTitle">
        <div class="section-heading tight">
          <div>
            <h3 id="packetCheckTitle">Packet check</h3>
            <p class="muted">This reports source coverage and redaction warnings. It does not claim the chart is complete or reconcile conflicting clinical statements.</p>
          </div>
        </div>
        <dl class="packet-check-list">
          <div><dt>Included</dt><dd>${escapeHtml(included)}</dd></div>
          <div class="packet-check-missing"><dt>Not supplied</dt><dd>${escapeHtml(notSupplied)}</dd></div>
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
    admissionSourceKind = "primary_note",
    admissionSourceDraft = "",
    packetCheck,
    admissionPacketCheck = { included: [], notSupplied: [], needsConfirmation: [] },
    deidBusy
  }) {
    if (!patient) return patientRequiredMessage;
    const selected = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
    const admissionSelected = selectedPacketId === "admission";
    const visibleContextSections = patient.contextSections.filter((section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length);
    const admissionSections = patient.contextSections.filter((section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length);

    return `
      <div class="stay-layout source-first-stay">
        <aside class="panel stay-rail">
          <div class="section-heading tight"><div><h2>Hospital stay</h2><p class="muted">Admission and each hospital day use one chronological workspace.</p></div></div>
          <div class="timeline-rail">
            <button type="button" class="day-row admission-day-row ${admissionSelected ? "selected" : ""}" data-action="select-admission" aria-current="${admissionSelected ? "page" : "false"}">
              <span><strong>Admission</strong><span class="muted">Initial presentation and admission sources</span></span>
              <span class="muted">${visibleContextSections.length} source${visibleContextSections.length === 1 ? "" : "s"}</span>
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
          ${admissionSelected ? `<section class="panel admission-packet packet-surface hospital-day-packet">
              <div class="admission-packet-body">
                <div class="section-heading source-day-heading"><div><h2>Admission</h2><p class="muted">Paste broad Epic blocks. The app preserves the source and includes every saved capture.</p></div></div>
                ${renderSourceWorkspace({ scope: "admission", sources: admissionSections, sourceOptions: admissionSourceOptions, selectedSourceKind: admissionSourceKind, sourceDraft: admissionSourceDraft, renderSourceCaptureEditor: (section) => renderSectionEditor(section, "context"), renderWarnings, packetCheck: admissionPacketCheck, deidBusy, renderDeidStrip, generateAction: "open-admission-note", generateLabel: "Generate admission H&P" })}
              </div>
          </section>` : ""}
          ${!admissionSelected ? `<section class="panel hospital-day-packet packet-surface source-capture-workspace">
            ${selected ? `
              <div class="section-heading source-day-heading">
                <div><h2>${escapeHtml(selected.label)}</h2><p class="muted">${escapeHtml(selected.date)} · Paste broad Epic blocks. The app preserves their source and includes every saved capture.</p></div>
                <div class="button-row">
                  <button class="button--quiet danger" type="button" data-action="remove-day">Remove day</button>
                  <button class="button--secondary" type="button" data-action="save-day" ${deidBusy || !selected.sourceCaptures.length ? "disabled" : ""}>Save source edits</button>
                </div>
              </div>
              ${renderSourceWorkspace({ scope: "daily", sources: selected.sourceCaptures, sourceOptions, selectedSourceKind, sourceDraft, renderSourceCaptureEditor, renderWarnings, packetCheck, deidBusy, renderDeidStrip, generateAction: "open-progress-note", generateLabel: "Generate progress note" })}
            ` : `<div class="empty-state">Add a hospital day to begin capturing selected-day sources.</div>`}
          </section>` : ""}
        </div>
      </div>
    `;
  }

  return Object.freeze({ renderDaily, renderDayRow });
}
