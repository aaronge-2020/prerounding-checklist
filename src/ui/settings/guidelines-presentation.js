import { tokenAccentColor } from "../../prompts/custom-templates.js";

// Pure presentation module (scripts/check-ui-module-boundaries.js enforces
// this stays free of document/window/navigator) - renders the "Documentation
// guidelines" management section on the Settings page.
export function renderGuidelineSets({ guidelineSets, escapeHtml }) {
  return `
    <section class="panel settings-panel">
      <div class="section-heading">
        <div>
          <h2>Documentation guidelines</h2>
          <p class="muted">Each set becomes its own smart variable you can insert into any prompt template, so an H&amp;P standard and a SOAP standard (or anything else you write) never have to share one variable.</p>
        </div>
      </div>
      <div class="guideline-set-manage">
        <input id="newGuidelineSetNameInput" type="text" placeholder="New guideline set name (e.g., Discharge summary)" autocomplete="off">
        <button class="button--secondary" type="button" data-action="create-guideline-set">Add guideline set</button>
      </div>
      ${guidelineSets.length ? guidelineSets.map((set) => `
        <details class="guideline-set-card">
          <summary>
            <span class="variable-swatch" style="background:${tokenAccentColor(set.token, { dot: true })}" aria-hidden="true"></span>
            <strong>${escapeHtml(set.label)}</strong>
            <code>${escapeHtml(set.token)}</code>
          </summary>
          <div class="guideline-set-body">
            <label>Name
              <input id="guidelineSetLabel-${escapeHtml(set.id)}" value="${escapeHtml(set.label)}">
            </label>
            <label>Guidelines text
              <textarea id="guidelineSetText-${escapeHtml(set.id)}" rows="10" spellcheck="false" placeholder="Paste or write the documentation standard for this note type.">${escapeHtml(set.text)}</textarea>
            </label>
            <div class="button-row">
              <button class="button--primary" type="button" data-action="save-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}">Save</button>
              <button class="button--quiet danger-button" type="button" data-action="request-remove-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}">Delete</button>
            </div>
          </div>
        </details>
      `).join("") : `<p class="muted">No guideline sets yet. Add one for any note type - H&amp;P, SOAP, discharge summary, whatever you write.</p>`}
    </section>
  `;
}
