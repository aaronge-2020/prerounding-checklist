import { ADMISSION_PSEUDO_DAY_ID, tokenAccentColor } from "../../prompts/custom-templates.js?v=20260819-one-to-one-task-guidelines";
import { tokenColorSwatchButton } from "../token-color-picker.js?v=20260819-one-to-one-task-guidelines";

export function renderHighlightedSegments(segments, escapeHtml, colorOverrides = {}, { interactive = true } = {}) {
  return segments.map((segment) => {
    const rendered = segment.type === "token"
      ? (interactive
        ? `<button type="button" class="var-fill" data-action="jump-to-prompt-variable" data-token="${escapeHtml(segment.token)}" style="background:${tokenAccentColor(segment.token, { overrides: colorOverrides })}" title="Jump to ${escapeHtml(segment.token)} in the generated prompt" aria-label="Jump to ${escapeHtml(segment.token)} in the generated prompt">${escapeHtml(segment.value)}</button>`
        : `<span class="var-fill" data-token="${escapeHtml(segment.token)}" style="background:${tokenAccentColor(segment.token, { overrides: colorOverrides })}" title="${escapeHtml(segment.token)}">${escapeHtml(segment.value)}</span>`)
      : escapeHtml(segment.value);
    return rendered;
  }).join("");
}

export function createPromptsPresentation({ escapeHtml }) {
  function renderPrompts({
    patient,
    patientRequiredMessage,
    task,
    tasks,
    promptDays,
    selectedPromptDayId,
    template,
    previewSegments,
    templateHighlightSegments,
    promptError,
    presentationToEdit,
    requiresPresentationToEdit,
    variables,
    smartMenuOpen,
    colorOverrides = {}
  }) {
    if (!patient) {
      return patientRequiredMessage;
    }

    return `
      <div class="prompt-layout">
        <section class="prompt-panel prompt-template-panel ${requiresPresentationToEdit ? "prompt-template-panel--presentation-editor" : ""}">
          <div class="prompt-panel-header">
            <div>
              <h2>Prompt template (editable)</h2>
              <p class="muted">Next: choose a task, adjust the template, then copy the de-identified prompt.</p>
            </div>
            <select id="promptTaskSelect" aria-label="Prompt type">
              ${tasks.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === task.id ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}
            </select>
            <label class="prompt-day-select">Hospital day <select id="promptDaySelect" aria-label="Hospital day for prompt">
              <option value="${ADMISSION_PSEUDO_DAY_ID}" ${selectedPromptDayId === ADMISSION_PSEUDO_DAY_ID ? "selected" : ""}>Admission (before Hospital Day 1)</option>
              ${promptDays.map((day, index) => `<option value="${escapeHtml(day.id)}" ${day.id === selectedPromptDayId ? "selected" : ""}>HD${index + 1} · ${escapeHtml(day.label)} · ${escapeHtml(day.date)}</option>`).join("")}
            </select></label>
          </div>
          <div class="prompt-task-manage">
            <input id="newPromptTaskNameInput" type="text" placeholder="New prompt name" autocomplete="off">
            <button class="button--secondary" type="button" data-action="create-prompt-task">Create prompt</button>
          </div>
          ${requiresPresentationToEdit ? `
            <section class="presentation-editor-input" aria-labelledby="presentationEditorInputTitle">
              <div class="presentation-editor-input__heading">
                <h3 id="presentationEditorInputTitle">Presentation to edit <span class="presentation-editor-input__optional">Optional</span></h3>
                <p>Paste a de-identified H&amp;P or progress presentation to insert it in the prompt. Leave this blank when you will provide the presentation in the chat instead. This text stays only in the current browser tab.</p>
              </div>
              <textarea id="presentationToEdit" rows="12" spellcheck="true" placeholder="Paste the de-identified presentation here...">${escapeHtml(presentationToEdit)}</textarea>
            </section>
          ` : ""}
          <div class="prompt-template-wrap">
            <div id="promptTemplateHighlight" class="prompt-preview prompt-template-backdrop" aria-hidden="true">${renderHighlightedSegments(templateHighlightSegments, escapeHtml, colorOverrides, { interactive: false })}</div>
            <textarea id="promptPreview" class="prompt-preview" rows="22" spellcheck="false">${escapeHtml(template)}</textarea>
            <div id="smartVariableMenu" class="smart-variable-menu ${smartMenuOpen ? "open" : ""}">
              ${variables.map((variable) => `
                <div class="smart-variable-row" data-token="${escapeHtml(variable.token)}">
                  ${tokenColorSwatchButton(variable.token, colorOverrides, escapeHtml)}
                  <button type="button" class="smart-variable-insert" data-action="insert-prompt-variable" data-token="${escapeHtml(variable.token)}"><span class="smart-variable-identity"><strong>${escapeHtml(variable.label)}</strong><code>${escapeHtml(variable.token)}</code></span><span>${escapeHtml(variable.description)}</span></button>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="prompt-template-footer">
            <div class="notice">Insert only the saved context you want to include - nothing is added automatically.</div>
            <div class="button-row">
              <button class="button--secondary" type="button" data-action="save-prompt-template">Save prompt</button>
              ${task.custom
                ? `<button class="button--quiet danger-button" type="button" data-action="request-remove-prompt-task" data-task-id="${escapeHtml(task.id)}">Delete this prompt</button>`
                : `<button class="button--quiet" type="button" data-action="reset-prompt-template">Reset</button>`}
            </div>
          </div>
          ${promptError ? `<div class="warning-box">${escapeHtml(promptError)}</div>` : ""}
        </section>

        <section class="prompt-panel prompt-output-panel">
          <div class="section-heading tight">
            <div>
              <h2>Generated prompt preview</h2>
              <p class="muted">De-identified context only. Colors match each smart variable to the text it filled in.</p>
            </div>
          </div>
          <div id="promptOutputHighlighted" class="prompt-output-highlighted" tabindex="-1" aria-label="Generated prompt with variables highlighted">${renderHighlightedSegments(previewSegments, escapeHtml, colorOverrides)}</div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="copy-prompt" ${promptError ? "disabled" : ""}>Copy prompt</button>
            <button class="button--secondary" type="button" data-action="open-open-evidence">Open OpenEvidence</button>
            <button class="button--secondary" type="button" data-action="open-open-evidence" data-destination="doximity">Open in Doximity</button>
            <button class="button--quiet" type="button" data-action="reset-variable-colors">Reset colors</button>
          </div>
        </section>
      </div>
    `;
  }

  return Object.freeze({ renderPrompts });
}
