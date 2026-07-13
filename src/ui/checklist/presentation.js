import { groupChecklistItemsBySystem } from "../../checklist/grouping.js?v=20260711-functional-remediation-19";

// Rendering is deliberately a pure adapter: callers supply escaped text and
// icons, while this module only derives view data and returns markup.
export function createChecklistPresentation({ escapeHtml, icon }) {
  function groupChecklistItems(snapshot) {
    const items = snapshot?.items || [];
    return {
      history: items.filter((item) => item.kind === "history"),
      exam: items.filter((item) => item.kind === "exam")
    };
  }

  function completedCount(items, answers) {
    return items.filter((item) => answers?.[item.id]?.selected?.length || answers?.[item.id]?.note).length;
  }

  function renderChecklistItem(item, answers, openNoteIds = new Set()) {
    const answer = answers[item.id] || { selected: [], note: "" };
    const multiple = item.select === "many";
    const hasNote = Boolean(answer.note);
    const isOpen = openNoteIds.has(item.id);
    return `
      <article class="checklist-item ${hasNote ? "has-note" : ""} ${isOpen ? "note-open" : ""}" data-item-id="${escapeHtml(item.id)}">
        <div>
          <strong>${escapeHtml(item.text)}</strong>
          <div class="muted">${escapeHtml(item.workupTitle)}</div>
        </div>
        <div class="choice-row">
          ${
            multiple
              ? item.choices
                  .map(
                    (choice, index) => `
                      <label class="${index === 0 ? "baseline-choice" : ""}">
                        <input type="checkbox" class="checklist-answer" name="${escapeHtml(item.id)}" value="${escapeHtml(choice)}" ${answer.selected?.includes(choice) ? "checked" : ""}>
                        ${escapeHtml(choice)}
                      </label>
                    `
                  )
                  .join("")
              : `
                  <select class="checklist-answer checklist-answer-select" name="${escapeHtml(item.id)}" aria-label="Answer for ${escapeHtml(item.text)}">
                    <option value="">--</option>
                    ${item.choices.map((choice) => `<option value="${escapeHtml(choice)}" ${answer.selected?.includes(choice) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
                  </select>
                `
          }
        </div>
        <button class="icon-button note-toggle" type="button" data-action="toggle-item-note" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${hasNote ? "Edit note" : "Add note"}" title="${hasNote ? "Edit note" : "Add note"}">${icon("edit")}</button>
        <textarea class="item-note-input" rows="2" placeholder="Optional note">${escapeHtml(answer.note || "")}</textarea>
        <span class="status-dot">${answer.selected?.length || answer.note ? "✓" : "○"}</span>
      </article>
    `;
  }

  function renderChecklistSystem(system, items, answers, kind, { showBulkControls = true, openNoteIds = new Set() } = {}) {
    const fillLabel = kind === "exam" ? "Mark remaining normal" : "Mark remaining negative";
    return `
      <section class="checklist-system">
        <div class="checklist-system-header">
          <h4>${escapeHtml(system)}</h4>
          <div class="button-row">
            <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
            ${showBulkControls ? `<button class="button--quiet" type="button" data-action="fill-system-negatives" data-kind="${escapeHtml(kind)}" data-system="${escapeHtml(system)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>` : ""}
          </div>
        </div>
        <div class="checklist-table">
          ${items.map((item) => renderChecklistItem(item, answers, openNoteIds)).join("")}
        </div>
      </section>
    `;
  }

  function renderChecklistSection(title, items, answers, { showBulkControls = true, openNoteIds = new Set() } = {}) {
    const kind = items[0]?.kind || (title === "Physical Exam" ? "exam" : "history");
    const fillLabel = kind === "exam" ? "Fill remaining normal" : "Fill remaining negative";
    return `
      <section class="checklist-section">
        <div class="checklist-section-header">
          <h3>${escapeHtml(title)}</h3>
          <div class="button-row">
            <span class="muted">${completedCount(items, answers)} / ${items.length}</span>
            ${showBulkControls ? `<button class="button--quiet" type="button" data-action="fill-section-negatives" data-kind="${escapeHtml(kind)}" title="Uses the first, baseline answer choice for each unanswered item">${escapeHtml(fillLabel)}</button>` : ""}
          </div>
        </div>
        ${
          items.length
            ? `
                <div class="checklist-column-head" aria-hidden="true">
                  <span>${escapeHtml(title)}</span><span>Answer</span><span>Notes</span><span>Status</span>
                </div>
                ${groupChecklistItemsBySystem(items).map(({ system, items: groupedItems }) => renderChecklistSystem(system, groupedItems, answers, kind, { showBulkControls, openNoteIds })).join("")}
              `
            : `<div class="empty-state">No ${escapeHtml(title.toLowerCase())} items in this checklist.</div>`
        }
      </section>
    `;
  }

  // Filtering happens by hiding rows in place (see updateChecklistSearchFilter
  // in app.js) so typing doesn't force a full re-render of the checklist.
  function renderChecklistSearch(searchQuery = "") {
    return `
      <label class="checklist-search-field">Search questions
        <input id="checklistSearchInput" type="search" value="${escapeHtml(searchQuery)}" placeholder="e.g. chest pain, murmur, home meds" autocomplete="off">
      </label>
      <span class="muted" data-checklist-search-count></span>
      <button class="button--quiet" type="button" data-action="clear-checklist-search" ${searchQuery ? "" : "hidden"}>Clear</button>
    `;
  }

  function formatNoteTime(isoString) {
    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // A running scratchpad for anything the patient said that doesn't map to a
  // checklist question - not tied to any item id, so it stays outside the
  // answer grid entirely and travels alongside answers as its own field.
  function renderQuickNotes(quickNotes = []) {
    return `
      <section class="quick-notes-panel">
        <div class="quick-notes-header">
          <h4>Quick notes</h4>
          <span class="muted">Not tied to a specific question</span>
        </div>
        ${
          quickNotes.length
            ? `<ul class="quick-notes-list">
                ${quickNotes
                  .map(
                    (note) => `
                      <li>
                        <span>${escapeHtml(note.text)}</span>
                        <div class="quick-note-meta">
                          <span class="muted">${formatNoteTime(note.createdAt)}</span>
                          <button class="icon-button" type="button" data-action="delete-quick-note" data-note-id="${escapeHtml(note.id)}" aria-label="Delete this note" title="Delete this note">${icon("trash")}</button>
                        </div>
                      </li>
                    `
                  )
                  .join("")}
              </ul>`
            : `<p class="muted quick-notes-empty">Something worth keeping that isn't a question below? Jot it here.</p>`
        }
        <div class="quick-note-compose">
          <input id="quickNoteInput" type="text" placeholder="Something the patient said..." enterkeyhint="done" autocomplete="off">
          <button class="button--primary icon-button" type="button" data-action="add-quick-note" aria-label="Add quick note" title="Add quick note">${icon("plus")}</button>
        </div>
      </section>
    `;
  }

  // Paste an OpenEvidence SOAP note, de-identify it locally, then let ChatGPT
  // map it onto this checklist's answers - mirrors the Workups page's
  // "Format or import a workup" panel (same dual saved-key/copy-prompt paths,
  // same paste-draft-then-paste-JSON-back textarea) but for checklist answers.
  function renderOpenEvidenceImportPanel({
    input = "",
    busy = false,
    error = "",
    deidConfirmed = false,
    deidStatus = "",
    hasSavedOpenAiKey = false,
    openAiModelLabel = ""
  }) {
    return `
      <details class="utility-panel openevidence-import" ${error || busy || deidConfirmed || deidStatus || input ? "open" : ""}>
        <summary>
          <strong>Fill from OpenEvidence note</strong>
          <span class="muted">Paste the OpenEvidence SOAP note, de-identify it locally, then let ChatGPT map it onto this checklist.</span>
        </summary>
        <div class="workup-import-body">
          <div class="section-heading tight">
            <div>
              <h3>Paste the OpenEvidence note</h3>
              <p class="muted">De-identify it locally first. Anything that doesn't match a checklist item becomes a quick note automatically.</p>
            </div>
            <button class="button--secondary" type="button" data-action="run-openevidence-note-deid">${icon("shield")} De-identify locally</button>
          </div>
          <textarea id="openEvidenceImportInput" class="json-import" spellcheck="false" placeholder="Paste the OpenEvidence SOAP note here, then de-identify it locally before sending it anywhere.">${escapeHtml(input)}</textarea>
          ${deidStatus ? `<span class="model-selection-message" aria-live="polite">${escapeHtml(deidStatus)}</span>` : ""}
          ${hasSavedOpenAiKey ? `<div class="workup-api-formatting">
            <label class="check-row">
              <input id="openEvidenceImportDeidConfirmed" type="checkbox" ${deidConfirmed ? "checked" : ""}>
              <span>I confirm this text is de-identified and may be sent to OpenAI using my saved API key.</span>
            </label>
            <div class="button-row">
              <button type="button" data-action="format-checklist-answers-api" ${deidConfirmed && !busy ? "" : "disabled"}>${busy ? "Filling checklist with saved key..." : "Fill checklist with saved API key"}</button>
              <span class="muted">Ready to use ${escapeHtml(openAiModelLabel)} after you confirm the text is de-identified.</span>
            </div>
          </div>` : `<div class="notice"><span>To fill the checklist automatically, save an OpenAI API key in Settings.</span><button class="button--quiet" type="button" data-action="go-settings">Open Settings</button></div>`}
          <div class="button-row">
            <button class="button--secondary" type="button" data-action="copy-checklist-answers-formatter-prompt">Copy ChatGPT prompt</button>
            <button class="button--secondary" type="button" data-action="parse-checklist-answers-json">Parse pasted ChatGPT JSON</button>
          </div>
          <p class="muted">No saved key? Copy the prompt, paste it into ChatGPT yourself, then paste its JSON reply into the box above and choose Parse pasted ChatGPT JSON.</p>
          ${error ? `<div class="warning-box">${escapeHtml(error)}</div>` : ""}
          <textarea id="checklistImportPromptOutput" rows="6" readonly placeholder="Copied ChatGPT prompt appears here."></textarea>
        </div>
      </details>
    `;
  }

  function renderPhoneTransfer(phoneLink) {
    return `
      <aside class="panel phone-transfer">
        <div>
          <h3>Send to phone</h3>
          <p class="muted">Share the link if your browser supports it, or download the file instead.</p>
        </div>
        <label>Checklist link
          <textarea id="phoneBundleText" readonly rows="4">${escapeHtml(phoneLink)}</textarea>
        </label>
        <div class="button-row">
          <button class="button--primary" type="button" data-action="share-phone-bundle">${icon("share")} Share link</button>
          <button class="button--secondary" type="button" data-action="copy-phone-bundle" data-bundle="${escapeHtml(phoneLink)}">${icon("copy")} Copy link</button>
          <button class="button--secondary" type="button" data-action="download-phone-bundle">${icon("download")} Download file</button>
        </div>
        <label>Returned phone answers
          <textarea id="phoneReturnText" rows="5" placeholder="Paste the returned code, or an AirDropped .bundle.json file's contents"></textarea>
        </label>
        <div class="button-row">
          <button class="button--secondary" type="button" data-action="import-phone-return">Import pasted answers</button>
          <button class="button--secondary" type="button" data-action="choose-phone-return-file">${icon("upload")} Import file</button>
          <input id="phoneReturnFileInput" type="file" accept="application/json,.json,text/plain,.txt" hidden>
        </div>
        <p class="muted">Tip: on the phone, tap "Copy return code" instead of sharing a file. If the phone and this computer use the same Apple ID with Handoff on, the code appears on this computer's clipboard within a minute or two — just paste it above, right in this tab.</p>
      </aside>
    `;
  }

  function renderDesktopChecklist({ day, snapshot, answers, quickNotes = [], openNoteIds = new Set(), searchQuery = "", phoneLink, openEvidenceImport }) {
    const totalItems = snapshot?.items.length || 0;
    const completedItems = completedCount(snapshot?.items || [], answers);
    return `
      <div class="checklist-shell">
        <section class="panel checklist-panel">
          <div class="section-heading">
            <div>
              <h2>Checklist</h2>
              <p class="muted">${snapshot ? `${escapeHtml(day.label)} · ${completedItems} / ${totalItems} completed · ${escapeHtml(snapshot.workupTitles.join(", "))}` : "Build a checklist from the Workups page."}</p>
            </div>
            <div class="button-row">
              <button class="button--secondary" type="button" data-action="go-workups">Build from workups</button>
              <button class="button--secondary" type="button" data-action="choose-phone-bundle-file">${icon("upload")} Open shared file</button>
              <input id="phoneBundleFileInput" type="file" accept="application/json,.json,text/plain,.txt" hidden>
            </div>
          </div>
          ${snapshot ? renderOpenEvidenceImportPanel(openEvidenceImport || {}) : ""}
          ${
            snapshot
              ? `<div class="checklist-toolbar-row">${renderChecklistSearch(searchQuery)}</div>`
              : ""
          }
          ${
            snapshot
              ? `
                  <div id="checklistSections" class="checklist-scroll">
                    ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers, { openNoteIds })}
                    ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers, { openNoteIds })}
                  </div>
                  ${renderQuickNotes(quickNotes)}
                `
              : `<div class="empty-state next-step"><strong>Next step: build a checklist.</strong><span>Select one or more workups, then return here to record history and exam findings.</span></div>`
          }
        </section>
        ${snapshot ? renderPhoneTransfer(phoneLink) : `<section class="panel"><h3>Send to phone</h3><p class="muted">Build a checklist first.</p></section>`}
      </div>
    `;
  }

  function renderPhoneResumeOffer(patientLabel, resumeOffer) {
    const savedAt = new Date(resumeOffer.savedAt);
    const savedLabel = Number.isNaN(savedAt.getTime()) ? "earlier on this device" : `at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} on this device`;
    return `
      <div class="checklist-shell">
        <section class="panel checklist-panel phone-resume-panel">
          <div class="section-heading">
            <div>
              <h2>${escapeHtml(patientLabel || "Patient")}</h2>
              <p class="muted">Phone checklist</p>
            </div>
          </div>
          <div class="notice phone-resume-notice">
            <strong>Resume in-progress answers?</strong>
            <span>This checklist has answers saved ${escapeHtml(savedLabel)} that aren't part of the link or file you just opened.</span>
            <div class="button-row">
              <button class="button--primary" type="button" data-action="resume-phone-autosave">Resume saved answers</button>
              <button class="button--secondary" type="button" data-action="discard-phone-autosave">Start fresh</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function buildPhoneChecklistView({ patientLabel, snapshot, answers, quickNotes = [], openNoteIds = new Set(), searchQuery = "", phoneReturnReady, resumeOffer = null, returnBundle }) {
    if (resumeOffer) {
      return Object.freeze({ readyToReturn: false, markup: renderPhoneResumeOffer(patientLabel, resumeOffer) });
    }
    const allItems = snapshot?.items || [];
    const completed = completedCount(allItems, answers);
    const remaining = Math.max(0, allItems.length - completed);
    const readyToReturn = allItems.length > 0 && remaining === 0;
    const returnPanel = phoneReturnReady && readyToReturn
      ? `
          <section class="panel phone-transfer phone-return-ready">
            <h3>Return answers</h3>
            <p class="muted">Copy the code and paste it into the computer's already-open tab — no file needed. Share or download the file only if the computer isn't open on this checklist.</p>
            <textarea id="phoneReturnBundle" rows="6" readonly>${escapeHtml(returnBundle)}</textarea>
            <div class="button-row">
              <button class="button--primary" type="button" data-action="copy-phone-return">${icon("copy")} Copy return code</button>
              <button class="button--secondary" type="button" data-action="share-phone-return">${icon("share")} Share return file</button>
              <button class="button--secondary" type="button" data-action="download-phone-return">${icon("download")} Download return file</button>
            </div>
          </section>`
      : "";
    return Object.freeze({
      readyToReturn,
      markup: `
        <div class="checklist-shell">
          <section class="panel checklist-panel">
            <div class="section-heading">
              <div>
                <h2>${escapeHtml(patientLabel || "Patient")}</h2>
                <p class="muted">Phone checklist · answers stay on this phone until returned.</p>
              </div>
              <div class="button-row">
                <button class="button--secondary" type="button" data-action="fill-all-negatives" ${remaining ? "" : "disabled"}>Fill all remaining baseline</button>
                ${phoneReturnReady && readyToReturn ? `<button type="button" data-action="copy-phone-return">Copy return code</button>` : ""}
              </div>
            </div>
            <div class="checklist-toolbar-row">
              <div class="phone-completion-bar ${readyToReturn ? "ready" : ""}">
                <div>
                  <strong>${readyToReturn ? "Checklist complete." : `${remaining} item${remaining === 1 ? "" : "s"} remain.`}</strong>
                  <span>${readyToReturn ? "Confirm when you're ready to generate the return code." : "The return code appears once every history and exam item has an answer."}</span>
                </div>
                ${readyToReturn && !phoneReturnReady ? `<button class="button--primary" type="button" data-action="show-phone-return">Finish & show return code</button>` : ""}
              </div>
              ${renderChecklistSearch(searchQuery)}
            </div>
            <div id="checklistSections" class="checklist-scroll">
              ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers, { showBulkControls: false, openNoteIds })}
              ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers, { showBulkControls: false, openNoteIds })}
            </div>
            ${renderQuickNotes(quickNotes)}
          </section>
          ${returnPanel}
        </div>
      `
    });
  }

  return Object.freeze({
    buildPhoneChecklistView,
    completedCount,
    groupChecklistItems,
    renderChecklistSection,
    renderDesktopChecklist
  });
}
