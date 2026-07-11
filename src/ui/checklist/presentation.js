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

  function renderChecklistItem(item, answers) {
    const answer = answers[item.id] || { selected: [], note: "" };
    const multiple = item.select === "many";
    return `
      <article class="checklist-item" data-item-id="${escapeHtml(item.id)}">
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
        <textarea class="item-note-input" rows="2" placeholder="Optional note">${escapeHtml(answer.note || "")}</textarea>
        <span class="status-dot">${answer.selected?.length || answer.note ? "✓" : "○"}</span>
      </article>
    `;
  }

  function renderChecklistSystem(system, items, answers, kind, { showBulkControls = true } = {}) {
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
          ${items.map((item) => renderChecklistItem(item, answers)).join("")}
        </div>
      </section>
    `;
  }

  function renderChecklistSection(title, items, answers, { showBulkControls = true } = {}) {
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
                ${groupChecklistItemsBySystem(items).map(({ system, items: groupedItems }) => renderChecklistSystem(system, groupedItems, answers, kind, { showBulkControls })).join("")}
              `
            : `<div class="empty-state">No ${escapeHtml(title.toLowerCase())} items in this checklist.</div>`
        }
      </section>
    `;
  }

  function renderPhoneTransfer(phoneLink) {
    return `
      <aside class="panel phone-transfer">
        <div>
          <h3>Send to phone</h3>
          <p class="muted">Share the link when supported. Download the file if the browser has no native share sheet.</p>
        </div>
        <div id="phoneQr" class="qr-box"></div>
        <label>Bundle link
          <textarea id="phoneBundleText" readonly rows="4">${escapeHtml(phoneLink)}</textarea>
        </label>
        <div class="button-row">
          <button class="button--primary" type="button" data-action="share-phone-bundle">${icon("share")} Share link</button>
          <button class="button--secondary" type="button" data-action="copy-phone-bundle" data-bundle="${escapeHtml(phoneLink)}">${icon("copy")} Copy bundle</button>
          <button class="button--secondary" type="button" data-action="download-phone-bundle">${icon("download")} Download file</button>
        </div>
        <label>Returned phone answers
          <textarea id="phoneReturnText" rows="5" placeholder="Paste return bundle"></textarea>
        </label>
        <div class="button-row">
          <button class="button--secondary" type="button" data-action="import-phone-return">Import pasted answers</button>
          <button class="button--secondary" type="button" data-action="choose-phone-return-file">${icon("upload")} Import file</button>
          <input id="phoneReturnFileInput" type="file" accept="application/json,.json" hidden>
        </div>
      </aside>
    `;
  }

  function renderDesktopChecklist({ day, snapshot, answers, phoneLink }) {
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
              <input id="phoneBundleFileInput" type="file" accept="application/json,.json" hidden>
            </div>
          </div>
          ${
            snapshot
              ? `<div id="checklistSections" class="checklist-scroll">
                  ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers)}
                  ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers)}
                </div>`
              : `<div class="empty-state next-step"><strong>Next step: build a checklist.</strong><span>Select one or more workups, then return here to record history and exam findings.</span></div>`
          }
        </section>
        ${snapshot ? renderPhoneTransfer(phoneLink) : `<section class="panel"><h3>Send to phone</h3><p class="muted">Build a checklist first.</p></section>`}
      </div>
    `;
  }

  function buildPhoneChecklistView({ patientLabel, snapshot, answers, phoneReturnReady, returnBundle }) {
    const allItems = snapshot?.items || [];
    const completed = completedCount(allItems, answers);
    const remaining = Math.max(0, allItems.length - completed);
    const readyToReturn = allItems.length > 0 && remaining === 0;
    const returnPanel = phoneReturnReady && readyToReturn
      ? `
          <section class="panel phone-transfer phone-return-ready">
            <h3>Return answers</h3>
            <p class="muted">Share the file back to the computer, or download it and import it there.</p>
            <div id="returnQr" class="qr-box"></div>
            <textarea id="phoneReturnBundle" rows="6" readonly>${escapeHtml(returnBundle)}</textarea>
            <div class="button-row">
              <button class="button--primary" type="button" data-action="share-phone-return">${icon("share")} Share return file</button>
              <button class="button--secondary" type="button" data-action="download-phone-return">${icon("download")} Download return file</button>
              <button class="button--secondary" type="button" data-action="copy-phone-return">${icon("copy")} Copy return code</button>
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
            <div class="phone-completion-bar ${readyToReturn ? "ready" : ""}">
              <div>
                <strong>${readyToReturn ? "Checklist complete." : `${remaining} item${remaining === 1 ? "" : "s"} remain.`}</strong>
                <span>${readyToReturn ? "Confirm when you are ready to generate the return code." : "The return code stays hidden until every history and exam item has an answer."}</span>
              </div>
              ${readyToReturn && !phoneReturnReady ? `<button class="button--primary" type="button" data-action="show-phone-return">Finish & show return code</button>` : ""}
            </div>
            <div id="checklistSections" class="checklist-scroll">
              ${renderChecklistSection("History", groupChecklistItems(snapshot).history, answers, { showBulkControls: false })}
              ${renderChecklistSection("Physical Exam", groupChecklistItems(snapshot).exam, answers, { showBulkControls: false })}
            </div>
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
