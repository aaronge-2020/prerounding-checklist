import { tokenColorSwatchButton } from "../token-color-picker.js";
import { guidelineSetMatchesQuery } from "../../prompts/guideline-sets.js";

// Pure presentation module. The library stays compact by keeping editing in a
// single side panel instead of expanding every guideline into a giant card.
export function renderGuidelineSets({ guidelineSets, escapeHtml, colorOverrides = {}, searchQuery = "", selectedIds = new Set(), openId = "" }) {
  const query = String(searchQuery || "").trim().toLowerCase();
  const visibleSets = guidelineSets.filter((set) => guidelineSetMatchesQuery(set, query));
  const allVisibleSelected = visibleSets.length > 0 && visibleSets.every((set) => selectedIds.has(set.id));
  const previewText = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 112);

  return `
    <section class="panel settings-panel settings-panel--guidelines">
      <div class="section-heading guideline-library-heading">
        <div>
          <h2>Documentation guidelines</h2>
          <p class="muted">Create reusable instruction sets. Each one becomes its own smart variable in the prompt editor.</p>
        </div>
      </div>
      <div class="guideline-library-toolbar">
        <label class="guideline-search">
          <span>Search guidelines</span>
          <input id="guidelineSearchInput" type="search" value="${escapeHtml(searchQuery)}" placeholder="Search guidelines" autocomplete="off">
        </label>
        <div class="guideline-set-manage">
          <button class="button--primary" type="button" data-action="create-guideline-set">Add guideline</button>
        </div>
      </div>
      <div class="guideline-bulk-toolbar">
        <label class="guideline-select-all"><input type="checkbox" data-action="select-all-guidelines" ${allVisibleSelected ? "checked" : ""} ${visibleSets.length ? "" : "disabled"}> <span>Select all visible</span></label>
        <span class="guideline-selection-count">${selectedIds.size ? `${selectedIds.size} selected` : ""}</span>
        <button class="button--quiet danger-button" type="button" data-action="delete-selected-guidelines" ${selectedIds.size ? "" : "disabled"}>Delete selected</button>
        <button class="button--quiet" type="button" data-action="clear-guideline-selection" ${selectedIds.size ? "" : "disabled"}>Clear selection</button>
      </div>
      <div class="guideline-library-body">
        <div class="guideline-list" role="table" aria-label="Documentation guidelines">
          <div class="guideline-list-header" role="row">
            <span></span><span></span><span>Name</span><span>Token</span><span>Preview</span><span>Edit</span>
          </div>
          ${visibleSets.length ? visibleSets.map((set) => `
            <div class="guideline-row ${openId === set.id ? "is-active" : ""}" data-guideline-id="${escapeHtml(set.id)}" role="row">
              <input class="guideline-select" type="checkbox" data-guideline-id="${escapeHtml(set.id)}" ${selectedIds.has(set.id) ? "checked" : ""} aria-label="Select ${escapeHtml(set.label)}">
              ${tokenColorSwatchButton(set.token, colorOverrides, escapeHtml)}
              <button class="guideline-row-open" type="button" data-action="toggle-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}" aria-expanded="${openId === set.id ? "true" : "false"}">
                <strong>${escapeHtml(set.label)}</strong><code>${escapeHtml(set.token)}</code><span class="guideline-row-preview">${escapeHtml(previewText(set.text))}</span>
              </button>
              <button class="guideline-row-edit button--quiet" type="button" data-action="toggle-guideline-set" data-guideline-set-id="${escapeHtml(set.id)}">Edit</button>
            </div>
          `).join("") : `<div class="guideline-empty"><strong>${query ? "No guidelines match that search." : "No guidelines yet."}</strong><span>${query ? "Try another name, variable, or phrase." : "Add a guideline above to create your first smart variable."}</span></div>`}
          ${visibleSets.length ? `<div class="guideline-list-footer"><span>Showing ${visibleSets.length} of ${guidelineSets.length} guidelines</span></div>` : ""}
        </div>
      </div>
    </section>
  `;
}

export function renderGuidelineEditor({ guidelineSets, escapeHtml, openId = "", createDraft = null }) {
  const isNew = Boolean(createDraft);
  const set = createDraft || guidelineSets.find((candidate) => candidate.id === openId);
  if (!set) return "";
  const id = escapeHtml(set.id);
  return `
    <aside class="guideline-editor" aria-label="${isNew ? "New guideline" : "Edit guideline"}">
      <div class="guideline-editor-heading"><h2>${isNew ? "New guideline" : "Edit guideline"}</h2><button class="button--quiet" type="button" data-action="${isNew ? "cancel-new-guideline" : "toggle-guideline-set"}" ${isNew ? "" : `data-guideline-set-id="${id}"`}>Close</button></div>
      <label>Name<input id="${isNew ? "guidelineCreateLabel" : `guidelineSetLabel-${id}`}" value="${escapeHtml(set.label || "")}" placeholder="e.g., Discharge summary" autofocus></label>
      <label>Token${isNew ? `<input value="Generated when saved" disabled>` : `<input value="${escapeHtml(set.token)}" disabled><span class="muted">The smart-variable token stays stable after creation.</span>`}</label>
      <label>Guidelines text<textarea id="${isNew ? "guidelineCreateText" : `guidelineSetText-${id}`}" rows="18" spellcheck="false" placeholder="Write the documentation standard for this note type.">${escapeHtml(set.text || "")}</textarea></label>
      <div class="guideline-editor-footer">
        ${isNew ? `<button class="button--quiet" type="button" data-action="cancel-new-guideline">Cancel</button>` : `<button class="button--quiet danger-button" type="button" data-action="request-remove-guideline-set" data-guideline-set-id="${id}">Delete guideline</button>`}
        <span></span>
        ${isNew ? "" : `<button class="button--quiet" type="button" data-action="toggle-guideline-set" data-guideline-set-id="${id}">Cancel</button>`}
        <button class="button--primary" type="button" data-action="${isNew ? "save-new-guideline-set" : "save-guideline-set"}" ${isNew ? "" : `data-guideline-set-id="${id}"`}>${isNew ? "Save guideline" : "Save changes"}</button>
      </div>
    </aside>
  `;
}
