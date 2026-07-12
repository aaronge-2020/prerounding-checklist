export function createDailyPresentation({ escapeHtml, icon }) {
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

  function renderDaily({
    patient,
    days,
    selectedDayId,
    deidReady,
    deidActive,
    localCalendarDate,
    patientRequiredMessage,
    renderDeidStrip,
    renderSectionEditor,
    renderWarnings
  }) {
    if (!patient) {
      return patientRequiredMessage;
    }

    const selected = days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
    
    return `
      <div class="stay-layout">
        <aside class="panel stay-rail">
          <div class="section-heading tight">
            <div>
              <h2>Hospital day</h2>
              <p class="muted">You choose the label for each day.</p>
            </div>
          </div>
          <div class="next-step compact-next-step">
            <strong>${days.length ? "Next: keep this stay current." : "Next: add the first hospital day."}</strong>
            <span>${days.length ? "Select a day, add de-identified updates, then save changes." : "Add a hospital day before building a workup."}</span>
          </div>
          <div class="timeline-rail">
            ${days.length ? days.map((day, index) => renderDayRow(day, selected?.id, index)).join("") : `<div class="empty-state">No hospital days saved.</div>`}
          </div>
          <details class="new-day-control" ${days.length ? "" : "open"}>
            <summary>${icon("plus")} Add hospital day</summary>
            <div class="form-grid compact">
              <label>Date
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
          <section class="panel admission-packet packet-surface">
            <details class="admission-packet-details" open>
              <summary>
                <span><strong>Admission packet</strong><span class="muted">De-identified background for this stay</span></span>
                <span class="muted">${patient.contextSections.length} fields</span>
              </summary>
              <div class="admission-packet-body">
                <div class="section-heading">
                  <div>
                    <h2>Admission packet</h2>
                    <p class="muted">De-identified background information used throughout this hospital stay.</p>
                  </div>
                  <div class="button-row">
                    <button class="button--secondary" type="button" data-action="add-context-section">${icon("plus")} Add field</button>
                  </div>
                </div>
                ${renderDeidStrip}
                <div id="contextSections" class="section-list">
                  ${patient.contextSections.map((section) => renderSectionEditor(section, "context")).join("")}
                </div>
                ${renderWarnings(patient.contextSections, "context")}
                <div class="packet-action-footer">
                  <button class="button--primary" type="button" data-action="save-context" ${deidReady ? "" : "disabled"}>${deidActive ? "De-identifying…" : "De-identify and save"}</button>
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
                      <p class="muted">${escapeHtml(selected.date)} · No automatic trend detection — you write and label each day's findings yourself.</p>
                    </div>
                    <div class="button-row">
                      <button class="button--secondary" type="button" data-action="add-daily-section">${icon("plus")} Add field</button>
                      <button class="button--primary" type="button" data-action="save-day" ${deidReady ? "" : "disabled"}>${deidActive ? "De-identifying…" : "De-identify and save"}</button>
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
  }

  return Object.freeze({ renderDaily, renderDayRow });
}
