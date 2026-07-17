import { choicesToText, groupWorkupItems, WORKUP_THOROUGHNESS, workupThoroughnessOption } from "../../workups/editor.js?v=20260711-functional-remediation-19";
import { WORKUP_SYSTEMS, workupSystemLabel } from "../../workups/systems.js?v=20260711-functional-remediation-19";

export function normalizeWorkupCatalogQuery(query) {
  return String(query || "").trim().toLocaleLowerCase();
}

// Pure workup rendering. State selection, persistence, file access, and drag
// behavior remain in the controller that calls this module.
export function createWorkupPresentation({ escapeHtml, icon }) {
  function renderWorkupRow(workup, selectedIds, matchingWorkupIds = null) {
    const matches = !matchingWorkupIds || matchingWorkupIds.has(workup.id);
    const historyCount = workup.items.filter((item) => item.kind === "history").length;
    const examCount = workup.items.filter((item) => item.kind === "exam").length;
    return `
      <div class="workup-catalog-row ${selectedIds.has(workup.id) ? "is-selected" : ""}" data-workup-id="${escapeHtml(workup.id)}" ${matches ? "" : 'hidden style="display: none;"'}>
        <label class="check-row">
          <input type="checkbox" class="workup-checkbox" value="${escapeHtml(workup.id)}" ${selectedIds.has(workup.id) ? "checked" : ""}>
          <span>
            <strong>${escapeHtml(workup.title)}</strong>
            <span class="muted">${historyCount} history · ${examCount} exam</span>
          </span>
        </label>
        <div class="workup-row-actions">
          <button class="icon-button button--quiet workup-edit-button" type="button" data-action="edit-workup" data-workup-id="${escapeHtml(workup.id)}" title="Edit workup" aria-label="Edit ${escapeHtml(workup.title)}">${icon("edit")}</button>
          <button class="icon-button danger-subtle" type="button" data-action="delete-workup" data-workup-id="${escapeHtml(workup.id)}" title="Delete workup" aria-label="Delete ${escapeHtml(workup.title)}">${icon("trash")}</button>
        </div>
      </div>
    `;
  }

  function renderHiddenWorkups(hiddenWorkups) {
    if (!hiddenWorkups.length) return "";
    return `
      <details class="workup-hidden-list">
        <summary><span>${hiddenWorkups.length} hidden built-in workup${hiddenWorkups.length === 1 ? "" : "s"}</span></summary>
        <div class="list-stack">
          ${hiddenWorkups.map((workup) => `
            <div class="workup-hidden-row">
              <span>${escapeHtml(workup.title)}</span>
              <button class="button--quiet" type="button" data-action="restore-hidden-workup" data-workup-id="${escapeHtml(workup.id)}">Restore</button>
            </div>
          `).join("")}
        </div>
      </details>
    `;
  }

  function renderWorkupItemEditor(item, kind, index = 0) {
    const promptLabel = kind === "exam" ? "Exam item" : "History question";
    return `
      <article class="workup-editor-card" data-workup-item-row data-kind="${kind}">
        <div class="workup-item-main">
          <div class="workup-item-rail">
            <span class="icon-button workup-drag-handle" draggable="true" title="Drag to reorder ${kind} items" aria-label="Drag to reorder ${kind} item" role="img">${icon("grip")}</span>
            <span class="workup-row-number" aria-hidden="true">${index + 1}</span>
          </div>
          <label class="workup-item-question">
            <span class="workup-field-label">${promptLabel}</span>
            <textarea data-field="item-text" rows="2" aria-label="${kind} item text">${escapeHtml(item.text)}</textarea>
          </label>
        </div>
        <div class="workup-item-options">
          <label class="workup-item-choices">
            <span class="workup-field-label">Answer choices <span class="muted">baseline first</span></span>
            <input data-field="item-choices" value="${escapeHtml(choicesToText(item.choices))}" placeholder="Normal, then positive or abnormal" aria-label="${kind} answer choices, baseline first">
          </label>
          <label class="workup-item-select">
            <span class="workup-field-label">Answer mode</span>
            <select data-field="item-select" aria-label="${kind} select mode">
              <option value="one" ${item.select !== "many" ? "selected" : ""}>One</option>
              <option value="many" ${item.select === "many" ? "selected" : ""}>Many</option>
            </select>
          </label>
          <div class="workup-item-actions" aria-label="${promptLabel} actions">
            <div class="button-row">
              <button class="icon-button" type="button" data-action="move-workup-item" data-direction="up" title="Move up" aria-label="Move ${kind} item up">${icon("moveUp")}</button>
              <button class="icon-button" type="button" data-action="move-workup-item" data-direction="down" title="Move down" aria-label="Move ${kind} item down">${icon("moveDown")}</button>
              <button class="icon-button" type="button" data-action="duplicate-workup-item" title="Duplicate item" aria-label="Duplicate ${kind} item">${icon("copy")}</button>
              <button class="icon-button" type="button" data-action="remove-workup-item" title="Remove item" aria-label="Remove ${kind} item">${icon("trash")}</button>
            </div>
          </div>
        </div>
        <details class="workup-item-details">
          <summary>Item details</summary>
          <div class="workup-item-detail-grid">
            <label>System<select data-field="item-system">${WORKUP_SYSTEMS.map((system) => `<option value="${escapeHtml(system.id)}" ${item.system === system.id ? "selected" : ""}>${escapeHtml(system.label)}</option>`).join("")}</select></label>
            <label>Item ID<input data-field="item-id" value="${escapeHtml(item.id)}"></label>
          </div>
        </details>
      </article>
    `;
  }

  function renderWorkupColumn(kind, title, items) {
    const groups = new Map();
    items.forEach((item, index) => {
      const system = String(item.system || "").trim() || "general";
      groups.set(system, [...(groups.get(system) || []), { item, index }]);
    });
    return `
      <div class="workup-column" data-workup-kind="${kind}">
        <div class="section-heading tight">
          <h3>${escapeHtml(title)}</h3>
          <button class="button--quiet" type="button" data-action="add-workup-item" data-kind="${kind}">${icon("plus")} Add</button>
        </div>
        <div class="workup-item-scroll">
          ${[...groups.entries()].map(([system, entries]) => `
            <section class="workup-system-group" data-workup-system="${escapeHtml(system)}">
              <div class="workup-system-group-header"><h4>${escapeHtml(workupSystemLabel(system))}</h4><span class="muted">${entries.length} item${entries.length === 1 ? "" : "s"}</span></div>
              <div class="list-stack" data-workup-system-list="${escapeHtml(system)}">
                ${entries.map(({ item, index }) => renderWorkupItemEditor(item, kind, index)).join("")}
              </div>
            </section>`).join("")}
        </div>
      </div>
    `;
  }

  function renderWorkups({
    catalog,
    selectedIds,
    matchingWorkupIds,
    editorWorkup,
    hasDraftWorkup,
    catalogQuery,
    thoroughness,
    hasSavedOpenAiKey,
    openAiModelLabel,
    workspace,
    workspaceBusy,
    workupOverrides,
    workupImportError,
    workupApiBusy,
    workupApiDeidConfirmed,
    workupImportPanelOpen,
    workupImportDraft,
    hiddenWorkups = []
  }) {
    const grouped = groupWorkupItems(editorWorkup);
    const workspaceReady = workspace.status === "ready";
    const overrideCount = Object.keys(workupOverrides || {}).length;
    const selectedCount = selectedIds.size;
    const selectedThoroughness = workupThoroughnessOption(thoroughness);
    const matchingCount = matchingWorkupIds ? matchingWorkupIds.size : catalog.length;
    return `
      <section class="panel workup-editor-surface">
        <div class="workup-topline">
          <div class="workup-editor-heading">
            <input id="workupTitleInput" class="workup-title-input" value="${escapeHtml(editorWorkup.title)}" aria-label="Workup title">
            <label class="workup-editor-select">Editing
              <select id="workupEditorSelect" data-action="select-workup-editor" aria-label="Edit workup">
                ${catalog.map((workup) => `<option value="${escapeHtml(workup.id)}" ${workup.id === editorWorkup.id && !hasDraftWorkup ? "selected" : ""}>${escapeHtml(workup.title)}</option>`).join("")}
              </select>
            </label>
            <div class="workup-editor-header-actions">
              <button class="button--primary" type="button" data-action="build-checklist" ${selectedCount ? "" : "disabled"}>Build checklist${selectedCount ? ` (${selectedCount})` : ""}</button>
            </div>
          </div>
          <label class="workup-alias-control">Aliases
            <input id="workupAliasesInput" value="${escapeHtml((editorWorkup.aliases || []).join(", "))}" placeholder="Gen Admit, Adult Admit">
          </label>
          <details class="workup-catalog-menu" open>
            <summary title="Open workup catalog"><span><strong>Workup catalog</strong><span class="muted">Choose workups for the checklist.</span></span>${icon("settings")}</summary>
            <div class="workup-catalog-popover">
              <div class="section-heading tight">
                <div>
                  <h3>Workup catalog</h3>
                  <p class="muted">Next: select one or more workups, then build the checklist.</p>
                </div>
                <button class="button--secondary" type="button" data-action="new-workup">${icon("plus")} New</button>
              </div>
              <div class="workup-catalog-actions">
                <button class="button--primary" type="button" data-action="build-checklist" ${selectedCount ? "" : "disabled"}>Build checklist</button>
                <span class="muted">${selectedCount ? `${selectedCount} selected` : "Select one or more workups"}</span>
              </div>
              <div class="workup-catalog-search">
                <label for="workupCatalogSearch">Find a workup
                  <span class="workup-search-control">
                    <input id="workupCatalogSearch" type="search" value="${escapeHtml(catalogQuery)}" placeholder="Search title, alias, or ID" autocomplete="off">
                    <button class="button--quiet" type="button" data-action="clear-workup-search" ${catalogQuery ? "" : "hidden"}>Clear</button>
                  </span>
                </label>
                <span class="muted" data-workup-catalog-count>${matchingWorkupIds ? `${matchingCount} of ${catalog.length} workups` : `${catalog.length} workups`}</span>
              </div>
              <div class="workup-list" data-workup-catalog-list>
                ${catalog.map((workup) => renderWorkupRow(workup, selectedIds, matchingWorkupIds)).join("")}
                <div class="empty-state" data-workup-catalog-empty ${matchingWorkupIds && matchingCount === 0 ? "" : "hidden"}>No workups match this search.</div>
              </div>
              ${renderHiddenWorkups(hiddenWorkups)}
            </div>
          </details>
        </div>
        <div class="workup-subtitle">The first choice in each row is always the normal or negative baseline. Drag rows or use the arrow buttons to reorder them.</div>
        <div class="workup-scope-control">
          <label>OpenEvidence detail
            <select id="workupThoroughness" aria-label="OpenEvidence workup detail">
              ${Object.entries(WORKUP_THOROUGHNESS).map(([value, option]) => `<option value="${value}" ${selectedThoroughness === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
          <span class="muted">${escapeHtml(WORKUP_THOROUGHNESS[selectedThoroughness].helper)}</span>
        </div>
        <div class="workflow-strip">
          <div class="workflow-step"><strong>1 OpenEvidence draft</strong><span class="muted">Create H&P item set</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>2 Format as JSON</strong><span class="muted">Use your saved key, or ChatGPT as a fallback</span></div>
          <span class="muted" aria-hidden="true">→</span>
          <div class="workflow-step"><strong>Parse & review</strong><span class="muted">Editable rows saved locally</span></div>
        </div>
        <input id="workupIdInput" value="${escapeHtml(editorWorkup.id)}" hidden>
        <div class="workup-columns">
          ${renderWorkupColumn("history", "History questions", grouped.history)}
          ${renderWorkupColumn("exam", "Physical exam items", grouped.exam)}
        </div>
        <div class="workup-footer-actions">
          <div class="workup-action-group workup-prompt-actions">
            <button class="button--secondary" type="button" data-action="copy-open-evidence-workup-prompt">OpenEvidence draft</button>
            <button class="button--secondary" type="button" data-action="copy-json-formatter-prompt">Copy ChatGPT formatter prompt</button>
          </div>
          <div class="workup-action-group workup-file-actions">
            <button class="button--secondary button--transfer" type="button" data-action="export-workup-json">${icon("download")} Download workup</button>
            <button class="button--secondary button--transfer" type="button" data-action="export-workup-library">${icon("download")} Download local library</button>
            <button class="button--secondary button--transfer" type="button" data-action="choose-workup-library-file">${icon("upload")} Import library</button>
            <input id="workupLibraryFileInput" type="file" accept="application/json" hidden>
          </div>
          <button class="button--primary workup-save-button" type="button" data-action="save-workup-ui">Save to catalog</button>
        </div>
        <p class="muted workup-library-note">Workup libraries contain no patient data. Building a checklist is always explicit.</p>
        <section class="workup-workspace-mirror" aria-live="polite">
          <div class="workup-workspace-copy">
            <strong>Workspace mirror</strong>
            <p class="muted">${workspaceReady ? `Mirrors ${overrideCount} local workup${overrideCount === 1 ? "" : "s"} to <code>workups/local/</code>. Browser saves remain encrypted and canonical.` : escapeHtml(workspace.message || "Choose a workspace folder to mirror local workups.")}</p>
            <small>Writes only workup JSON and a mirror manifest — never patient data, and never stages, commits, or deletes files in your workspace.</small>
          </div>
          <div class="workup-workspace-actions button-row">
            ${workspaceReady ? `<button class="button--secondary" type="button" data-action="sync-workup-workspace" ${workspaceBusy ? "disabled" : ""}>${workspaceBusy ? "Syncing…" : "Sync now"}</button><button class="button--quiet" type="button" data-action="choose-workup-workspace" ${workspaceBusy ? "disabled" : ""}>Change folder</button><button class="button--quiet" type="button" data-action="disconnect-workup-workspace" ${workspaceBusy ? "disabled" : ""}>Disconnect</button>` : `<button class="button--secondary" type="button" data-action="choose-workup-workspace" ${workspaceBusy || workspace.status === "unsupported" ? "disabled" : ""}>Choose workspace folder</button>`}
          </div>
        </section>
        <details class="utility-panel workup-import" ${workupImportError || workupApiBusy || workupApiDeidConfirmed || workupImportPanelOpen ? "open" : ""}>
          <summary>
            <span class="workup-import-summary-marker" aria-hidden="true">${icon("chevron")}</span>
            <span class="workup-import-summary-copy">
              <strong>Format or import a workup</strong>
              <span class="muted">Paste a de-identified OpenEvidence draft to format it automatically, or paste finished JSON to import directly.</span>
            </span>
            <span class="workup-import-summary-action">Open options</span>
          </summary>
          <div class="workup-import-body">
            <div class="section-heading tight workup-import-heading">
              <div>
                <h3>Format into editable workup rows</h3>
                <p class="muted">Automatic formatting uses only the pasted draft. You can also paste finished JSON to parse it directly.</p>
              </div>
              <div class="button-row">
                <button type="button" data-action="parse-workup-json">Parse & save</button>
                <button class="button--transfer" type="button" data-action="choose-workup-file">${icon("upload")} Import file</button>
                <input id="workupJsonFileInput" type="file" accept="application/json" hidden>
              </div>
            </div>
            <textarea id="workupJsonImport" class="json-import" spellcheck="false" placeholder="Paste a reviewed, de-identified OpenEvidence workup draft or prerounding_workup_v1 JSON here.">${escapeHtml(workupImportDraft)}</textarea>
            ${hasSavedOpenAiKey ? `<div class="workup-api-formatting">
              <label class="check-row workup-deid-confirmation">
                <input id="workupApiDeidConfirmed" type="checkbox" ${workupApiDeidConfirmed ? "checked" : ""}>
                <span>I've reviewed this draft and confirm it's de-identified.</span>
              </label>
              <div class="button-row workup-api-action">
                <button type="button" data-action="format-workup-json-api" ${workupApiDeidConfirmed && !workupApiBusy ? "" : "disabled"}>${workupApiBusy ? '<span class="spinner" aria-hidden="true"></span> Formatting...' : "Format & load with saved API key"}</button>
                <span class="muted">Ready to use ${escapeHtml(openAiModelLabel)} after you confirm the draft is de-identified.</span>
              </div>
            </div>` : `<div class="notice workup-api-guidance"><span>To format a de-identified draft automatically, save an OpenAI API key in Settings.</span><button class="button--quiet" type="button" data-action="go-settings">Open Settings</button></div>`}
            ${workupImportError ? `<div class="warning-box workup-json-note">${escapeHtml(workupImportError)}</div>` : `<div class="notice workup-json-note">JSON import is parsed into editable rows — there's no raw JSON editor in this view.</div>`}
          </div>
        </details>
        <button type="button" class="text-button workup-reset-override" data-action="reset-workup-json">Remove local override</button>
      </section>
    `;
  }

  return Object.freeze({ renderWorkups });
}
