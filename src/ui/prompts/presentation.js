export function createPromptsPresentation({ escapeHtml }) {
  function renderPrompts({
    patient,
    patientRequiredMessage,
    task,
    tasks,
    promptDays,
    selectedPromptDayId,
    template,
    prompt,
    promptError,
    variables,
    smartMenuOpen
  }) {
    if (!patient) {
      return patientRequiredMessage;
    }

    return `
      <div class="prompt-layout">
        <section class="prompt-panel prompt-template-panel">
          <div class="prompt-panel-header">
            <div>
              <h2>Prompt template (editable)</h2>
              <p class="muted">Next: choose a task, adjust the template, then copy the de-identified prompt.</p>
            </div>
            <select id="promptTaskSelect" aria-label="Prompt type">
              ${tasks.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === task.id ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
            </select>
            ${promptDays.length ? `<label class="prompt-day-select">Hospital day <select id="promptDaySelect" aria-label="Hospital day for prompt">${promptDays.map((day, index) => `<option value="${escapeHtml(day.id)}" ${day.id === selectedPromptDayId ? "selected" : ""}>HD${index + 1} · ${escapeHtml(day.label)} · ${escapeHtml(day.date)}</option>`).join("")}</select></label>` : ""}
          </div>
          <div class="prompt-template-wrap">
            <textarea id="promptPreview" class="prompt-preview" rows="22" spellcheck="false">${escapeHtml(template)}</textarea>
            <div id="smartVariableMenu" class="smart-variable-menu ${smartMenuOpen ? "open" : ""}">
              ${variables.map((variable) => `<button type="button" data-action="insert-prompt-variable" data-token="${escapeHtml(variable.token)}"><strong>${escapeHtml(variable.token)}</strong><span>${escapeHtml(variable.description)}</span></button>`).join("")}
            </div>
          </div>
          <div class="prompt-template-footer">
            <div class="notice">${task.requiresGuidelines ? "@guidelines is included by default and required for this prompt type." : "Insert only the saved context you want to include."}</div>
            <div class="button-row">
              <button class="button--secondary" type="button" data-action="save-prompt-template">Save prompt</button>
              <button class="button--quiet" type="button" data-action="reset-prompt-template">Reset</button>
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
            <button class="button--primary" type="button" data-action="copy-prompt">Copy prompt</button>
            <button class="button--secondary" type="button" data-action="open-open-evidence">Open OpenEvidence</button>
          </div>
        </section>
      </div>
    `;
  }

  return Object.freeze({ renderPrompts });
}
