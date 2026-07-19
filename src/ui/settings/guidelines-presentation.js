import { tokenColorSwatchButton } from "../token-color-picker.js";

// Pure presentation module (scripts/check-ui-module-boundaries.js enforces
// this stays free of document/window/navigator) - renders reusable prompt
// instruction management on the Settings page.
export function renderGuidelineSets({ guidelineSets, escapeHtml, colorOverrides = {} }) {
  const summary = (text) => String(text || "").trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] || "No instructions saved yet.";
  return `
    <section class="panel settings-panel instruction-library">
      <div class="section-heading instruction-library-heading">
        <div>
          <h2>Reusable prompt instructions</h2>
          <p class="muted">Edit the reusable guidance behind every built-in prompt, then insert its smart variable into any template.</p>
        </div>
      </div>
      <div class="guideline-set-manage">
        <input id="newGuidelineSetNameInput" type="text" aria-label="New instruction set name" placeholder="New instruction set name, e.g. Discharge summary" autocomplete="off">
        <button class="button--secondary" type="button" data-action="create-guideline-set">Add instruction set</button>
      </div>
      ${guidelineSets.length ? `
        <div class="instruction-library-columns" aria-hidden="true">
          <span>Instruction set</span><span>Smart variable</span><span>What it controls</span><span></span>
        </div>
        <div class="instruction-library-list">
          ${guidelineSets.map((set) => `
            <details class="guideline-set-card">
              <summary>
                <span class="instruction-set-name">
                  ${tokenColorSwatchButton(set.token, colorOverrides, escapeHtml)}
                  <strong>${escapeHtml(set.label)}</strong>
                </span>
                <code title="${escapeHtml(set.token)}">${escapeHtml(set.token)}</code>
                <span class="instruction-set-summary" title="${escapeHtml(summary(set.text))}">${escapeHtml(summary(set.text))}</span>
                <span class="instruction-set-edit" aria-hidden="true">Edit</span>
              </summary>
              <div class="guideline-set-body">
                <label>Name
                  <input id="guidelineSetLabel-${escapeHtml(set.id)}" value="${escapeHtml(set.label)}">
                </label>
                <label>Instructions
                  <textarea id="guidelineSetText-${escapeHtml(set.id)}" rows="10" spellcheck="false" placeholder="Write reusable instructions for a prompt or note type.">${escapeHtml(set.text)}</textarea>
                </label>
                <div class="button-row">
                  <button class="button--primary" type="button" data-action="save-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}">Save changes</button>
                  <button class="button--quiet danger-button" type="button" data-action="request-remove-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}">Delete</button>
                </div>
              </div>
            </details>
          `).join("")}
        </div>
      ` : `<p class="muted instruction-library-empty">No instruction sets yet. Add one for teaching, medication review, a note type, or any reusable task.</p>`}
    </section>
  `;
}
