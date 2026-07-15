import { ADMISSION_PSEUDO_DAY_ID, tokenAccentColor } from "../../prompts/custom-templates.js";
import { tokenColorSwatchButton } from "../token-color-picker.js";

export function renderHighlightedSegments(segments, escapeHtml, colorOverrides = {}) {
  return segments.map((segment) => segment.type === "token"
    ? `<span class="var-fill" style="background:${tokenAccentColor(segment.token, { overrides: colorOverrides })}" title="${escapeHtml(segment.token)}">${escapeHtml(segment.value)}</span>`
    : escapeHtml(segment.value)).join("");
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
    variables,
    smartMenuOpen,
    colorOverrides = {}
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
            <label class="prompt-day-select">Hospital day <select id="promptDaySelect" aria-label="Hospital day for prompt">
              <option value="${ADMISSION_PSEUDO_DAY_ID}" ${selectedPromptDayId === ADMISSION_PSEUDO_DAY_ID ? "selected" : ""}>Admission (before Hospital Day 1)</option>
              ${promptDays.map((day, index) => `<option value="${escapeHtml(day.id)}" ${day.id === selectedPromptDayId ? "selected" : ""}>HD${index + 1} · ${escapeHtml(day.label)} · ${escapeHtml(day.date)}</option>`).join("")}
            </select></label>
          </div>
          <div class="prompt-task-manage">
            <input id="newPromptTaskNameInput" type="text" placeholder="New prompt name" autocomplete="off">
            <button class="button--secondary" type="button" data-action="create-prompt-task">Create prompt</button>
          </div>
          <div class="prompt-template-wrap">
            <div id="promptTemplateHighlight" class="prompt-preview prompt-template-backdrop" aria-hidden="true">${renderHighlightedSegments(templateHighlightSegments, escapeHtml, colorOverrides)}</div>
            <textarea id="promptPreview" class="prompt-preview" rows="22" spellcheck="false">${escapeHtml(template)}</textarea>
            <div id="smartVariableMenu" class="smart-variable-menu ${smartMenuOpen ? "open" : ""}">
              ${variables.map((variable) => `
                <div class="smart-variable-row" data-token="${escapeHtml(variable.token)}">
                  ${tokenColorSwatchButton(variable.token, colorOverrides, escapeHtml)}
                  <button type="button" class="smart-variable-insert" data-action="insert-prompt-variable" data-token="${escapeHtml(variable.token)}"><strong>${escapeHtml(variable.token)}</strong><span>${escapeHtml(variable.description)}</span></button>
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
          <div id="promptOutputHighlighted" class="prompt-output-highlighted" aria-label="Generated prompt with variables highlighted">${renderHighlightedSegments(previewSegments, escapeHtml, colorOverrides)}</div>
          <div class="button-row">
            <button class="button--primary" type="button" data-action="copy-prompt">Copy prompt</button>
            <button class="button--secondary" type="button" data-action="open-open-evidence">Open OpenEvidence</button>
            <button class="button--quiet" type="button" data-action="reset-variable-colors">Reset colors</button>
          </div>
        </section>
      </div>
    `;
  }

  return Object.freeze({ renderPrompts });
}
