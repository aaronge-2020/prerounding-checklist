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

  function renderSourcePicker(sourceOptions, selectedSourceKind) {
    return `
      <div class="source-kind-picker" role="group" aria-label="Epic source for the next paste">
        ${sourceOptions.map((option) => `
          <button type="button" class="source-kind-button ${option.id === selectedSourceKind ? "selected" : ""}" data-action="select-daily-source-kind" data-source-kind="${escapeHtml(option.id)}" aria-pressed="${String(option.id === selectedSourceKind)}">
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
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
    selectedSourceKind,
    sourceDraft,
    packetCheck,
    deidBusy
  }) {
    if (!patient) return patientRequiredMessage;
    const selected = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
    const admissionSelected = selectedPacketId === "admission";
    const visibleContextSections = patient.contextSections.filter((section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length);
    const admissionSections = patient.contextSections.filter((section, index) => (
      index === 0
      || String(section.deidentifiedText || "").trim()
      || (section.residualWarnings || []).length
      || section.label === "Additional admission source"
    ));
    const selectedSource = sourceOptions.find((option) => option.id === selectedSourceKind) || sourceOptions[0];

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
                <div class="section-heading">
                  <div><h2>Admission</h2><p class="muted">Paste and edit admission source notes here. Save always runs local de-identification before the encrypted vault is updated.</p></div>
                  <button class="button--secondary" type="button" data-action="add-context-section">${icon("plus")} Add admission source</button>
                </div>
                ${renderDeidStrip}
                <div id="contextSections" class="section-list">${admissionSections.map((section) => renderSectionEditor(section, "context")).join("")}</div>
                ${renderWarnings(admissionSections, "context")}
                <div class="packet-action-footer"><button class="button--primary" type="button" data-action="save-context" ${deidBusy ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "Save admission sources"}</button></div>
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
              ${renderDeidStrip}
              <section class="source-capture-composer" aria-labelledby="addFromEpicTitle">
                <div class="section-heading tight"><div><h3 id="addFromEpicTitle">Add from Epic</h3><p class="muted">Choose where the text came from, then paste the whole relevant block without reorganizing it.</p></div></div>
                ${renderSourcePicker(sourceOptions, selectedSourceKind)}
                <label class="source-draft-label" for="dailySourceDraft">Paste the full copied block
                  <textarea id="dailySourceDraft" rows="8" placeholder="Paste the full copied text from ${escapeHtml(selectedSource.label)} here">${escapeHtml(sourceDraft)}</textarea>
                </label>
                <div class="source-draft-footer">
                  <span class="muted" data-source-draft-count>${sourceDraft.length.toLocaleString()} characters · ${escapeHtml(selectedSource.description)}</span>
                  <button class="button--primary" type="button" data-action="add-daily-source" ${deidBusy || !sourceDraft.trim() ? "disabled" : ""}>${deidBusy ? "De-identifying…" : "De-identify and add source"}</button>
                </div>
              </section>
              <section class="saved-source-list" aria-labelledby="savedSourcesTitle">
                <div class="section-heading tight"><div><h3 id="savedSourcesTitle">Saved sources</h3><p class="muted">${selected.sourceCaptures.length} source${selected.sourceCaptures.length === 1 ? "" : "s"} · all included by default</p></div><button class="button--primary" type="button" data-action="open-progress-note" ${selected.sourceCaptures.length ? "" : "disabled"}>Generate progress note</button></div>
                <div id="dailySources" class="source-capture-list">
                  ${selected.sourceCaptures.length ? selected.sourceCaptures.map((capture) => renderSourceCaptureEditor(capture)).join("") : `<div class="empty-state">No sources saved for this day. Start with the primary team note, Results, or Medication Activity.</div>`}
                </div>
                ${renderWarnings(selected.sourceCaptures, "daily")}
              </section>
              ${renderPacketCheck(packetCheck)}
            ` : `<div class="empty-state">Add a hospital day to begin capturing selected-day sources.</div>`}
          </section>` : ""}
        </div>
      </div>
    `;
  }

  return Object.freeze({ renderDaily, renderDayRow });
}
