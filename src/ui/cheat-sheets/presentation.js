// Pure presentation for the Cheat Sheets pocket reference.
// Mirrors the density of Aaron's OBGYN history interview cheat sheet:
// sectioned cards per system, "why it matters" pearl callouts, technique
// tips for maneuvers, and plain one-phrase markers. No DOM access, no
// state — the cheat-sheets controller owns state and passes everything in.
// escapeHtml is injected (never imported), matching the other feature
// presentation factories.
export function createCheatSheetsPresentation({ escapeHtml }) {
  const ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/><path d="M20 18H6.5A2.5 2.5 0 0 0 4 20.5"/><path d="M9 8h7M9 11.5h5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>'
  };

  // --- shared bits ---

  // Pearl callout: clinical reasoning for the question/maneuver — why it is
  // asked and what the answer means. AI-drafted meanings are labeled as such;
  // the sheet-level review banner carries the clinician-review requirement.
  function meaningPearl(meaning, meaningSource) {
    if (meaning && String(meaning).trim()) {
      const src = meaningSource === "ai-draft"
        ? "AI-drafted \u2014 needs clinician review"
        : (meaningSource && String(meaningSource).trim() ? `Source: ${meaningSource}` : "");
      return `
        <aside class="cs-pearl">
          <span class="cs-pearl-label">Why it matters</span>
          <p>${escapeHtml(String(meaning))}</p>
          ${src ? `<p class="cs-pearl-source">${escapeHtml(src)}</p>` : ""}
        </aside>`;
    }
    return `<p class="cs-pending">Clinical reasoning note pending review.</p>`;
  }

  function groupBySystem(items, pickSystem) {
    const groups = [];
    const bySystem = new Map();
    for (const item of items || []) {
      if (!item) continue;
      const system = String(pickSystem(item) ?? "").trim() || "General";
      if (!bySystem.has(system)) {
        const group = { system, items: [] };
        bySystem.set(system, group);
        groups.push(group);
      }
      bySystem.get(system).items.push(item);
    }
    return groups;
  }

  // --- history ---

  function renderHistoryQuestion(item) {
    return `
      <li class="cs-q">
        <p class="cs-q-text">${escapeHtml(String(item.question ?? ""))}</p>
        ${meaningPearl(item.meaning, item.meaningSource)}
      </li>`;
  }

  function renderHistorySection(history) {
    const groups = groupBySystem(history, (item) => item.system);
    if (!groups.length) return "";
    return `
      <section class="cs-section" aria-label="History questions">
        <h2 class="cs-section-title">History</h2>
        ${groups.map((group) => `
        <div class="cs-group">
          <h3 class="cs-group-title">${escapeHtml(group.system)}</h3>
          <ul class="cs-qlist">
            ${group.items.map(renderHistoryQuestion).join("")}
          </ul>
        </div>`).join("")}
      </section>`;
  }

  // --- exam ---

  function renderExamManeuver(item) {
    return `
      <li class="cs-exam">
        <p class="cs-exam-name">${escapeHtml(String(item.maneuver ?? ""))}</p>
        ${item.how && String(item.how).trim() ? `
        <p class="cs-how"><span class="cs-how-label">How to</span> ${escapeHtml(String(item.how))}</p>` : ""}
        ${meaningPearl(item.meaning, item.meaningSource)}
      </li>`;
  }

  function renderExamSection(exam) {
    const groups = groupBySystem(exam, (item) => item.system);
    if (!groups.length) return "";
    return `
      <section class="cs-section" aria-label="Physical exam">
        <h2 class="cs-section-title">Exam</h2>
        ${groups.map((group) => `
        <div class="cs-group">
          <h3 class="cs-group-title">${escapeHtml(group.system)}</h3>
          <ul class="cs-qlist">
            ${group.items.map(renderExamManeuver).join("")}
          </ul>
        </div>`).join("")}
      </section>`;
  }

  // --- fillable worksheet (session-only; the controller owns the state) ---
  //
  // Narrow exception to the read-only rule, for sheets flagged
  // `worksheet: true` (the Mental Status Examination sheet): answer chips
  // per exam item plus an optional free-text detail per item, rendered from
  // the item's coded findings. State shape: a Map or plain object keyed by
  // item id -> { selected: Set<string>, note: string }. This module stays
  // pure: it only reads that state and returns markup or note text.

  function readWorksheetEntry(state, itemId) {
    if (!state) return null;
    const entry = typeof state.get === "function" ? state.get(itemId) : state[itemId];
    if (!entry) return null;
    const selected = entry.selected instanceof Set ? entry.selected : new Set(entry.selected || []);
    return { selected, note: String(entry.note ?? "") };
  }

  function worksheetSection(sheet, state, item) {
    const entry = readWorksheetEntry(state, item.id);
    if (!entry) return null;
    const detail = entry.note.trim();
    const selections = (item.findings || []).filter((finding) => entry.selected.has(finding));
    if (!selections.length && !detail) return null;
    return { item, selections, detail };
  }

  function worksheetFilledCount(sheet, state) {
    let filled = 0;
    for (const item of (sheet && sheet.exam) || []) {
      if (worksheetSection(sheet, state, item)) filled += 1;
    }
    return filled;
  }

  function worksheetProgressText(sheet, state) {
    const total = ((sheet && sheet.exam) || []).length;
    return `${worksheetFilledCount(sheet, state)} of ${total} sections filled`;
  }

  // The exact text the clinician pastes into their note. One line per
  // filled section, in sheet order; selections in findings data order;
  // a detail follows the selections after ". " (or stands alone), trimmed,
  // with a single trailing period.
  function worksheetNoteText(sheet, state) {
    const lines = [];
    for (const item of (sheet && sheet.exam) || []) {
      const section = worksheetSection(sheet, state, item);
      if (!section) continue;
      const domain = String(item.system ?? "").trim() || "General";
      let detail = section.detail;
      if (detail && !detail.endsWith(".")) detail += ".";
      if (section.selections.length) {
        lines.push(`${domain}: ${section.selections.join("; ")}${detail ? `. ${detail}` : ""}`);
      } else {
        lines.push(`${domain}: ${detail}`);
      }
    }
    return lines.length ? `Mental Status Examination\n${lines.join("\n")}` : "";
  }

  function renderWorksheetSection(sheet, state, item) {
    const entry = readWorksheetEntry(state, item.id) || { selected: new Set(), note: "" };
    const itemId = escapeHtml(String(item.id));
    const chips = (item.findings || []).map((finding) => {
      const value = String(finding);
      const selected = entry.selected.has(value);
      return `
        <button type="button" class="cs-worksheet-chip" data-worksheet-chip="${itemId}" data-value="${escapeHtml(value)}" aria-pressed="${selected ? "true" : "false"}">${selected ? "\u2713 " : ""}${escapeHtml(value)}</button>`;
    }).join("");
    return `
      <section class="cs-worksheet-card" data-worksheet-section="${itemId}">
        <h2 class="cs-worksheet-domain">${escapeHtml(String(item.system ?? "").trim() || "General")}</h2>
        ${item.maneuver ? `<p class="cs-worksheet-maneuver">${escapeHtml(String(item.maneuver))}</p>` : ""}
        ${chips ? `<div class="cs-worksheet-chips" role="group" aria-label="${escapeHtml(String(item.system ?? ""))} answers">${chips}
        </div>` : ""}
        <label class="cs-worksheet-note-label" for="cs-worksheet-note-${itemId}">Detail (optional)</label>
        <textarea class="cs-worksheet-note" id="cs-worksheet-note-${itemId}" data-worksheet-note="${itemId}" rows="2" placeholder="Add specifics in your own words">${escapeHtml(entry.note)}</textarea>
      </section>`;
  }

  function worksheetHtml(sheet, state) {
    if (!sheet) return emptyStateHtml();
    const noteText = worksheetNoteText(sheet, state);
    const rows = Math.max(4, noteText ? noteText.split("\n").length + 1 : 4);
    return `
      <div class="cs-worksheet">
        <header class="cs-worksheet-header">
          <button type="button" class="cs-back" data-action="cheat-sheets-worksheet-back" aria-label="Back to the sheet">
            <span class="cs-back-icon">${ICONS.back}</span><span>Sheet</span>
          </button>
          <h1 class="cs-title">MSE Worksheet</h1>
          <p class="cs-worksheet-progress" data-worksheet-progress aria-live="polite">${escapeHtml(worksheetProgressText(sheet, state))}</p>
        </header>
        <p class="cs-worksheet-privacy">Answers stay on this page and are not saved. Copy your note text before you close the page.</p>
        ${((sheet.exam) || []).map((item) => renderWorksheetSection(sheet, state, item)).join("")}
        <section class="cs-worksheet-card cs-worksheet-output-card">
          <label class="cs-worksheet-domain" for="cheat-sheets-worksheet-output">Note text</label>
          <textarea class="cs-worksheet-output" id="cheat-sheets-worksheet-output" readonly rows="${rows}" placeholder="Your note text builds here as you tap answers.">${escapeHtml(noteText)}</textarea>
          <div class="cs-worksheet-actions">
            <button type="button" class="cs-worksheet-copy" data-action="cheat-sheets-worksheet-copy"${noteText ? "" : " disabled"}>Copy note text</button>
            <button type="button" class="cs-worksheet-clear" data-action="cheat-sheets-worksheet-clear">Clear</button>
          </div>
          <p class="cs-worksheet-copy-hint" data-worksheet-copy-hint hidden></p>
        </section>
      </div>`;
  }

  // --- detail ---

  function renderReviewBanner(sheet) {
    if (!sheet.reviewNeeded) return "";
    return `
      <p class="cs-review-banner" role="note">This sheet is marked for review \u2014 confirm each item against your local reference before the bedside.</p>`;
  }

  function countItems(sheet) {
    const history = (sheet.history || []).length;
    const exam = (sheet.exam || []).length;
    const parts = [];
    if (history) parts.push(`${history} history question${history === 1 ? "" : "s"}`);
    if (exam) parts.push(`${exam} exam maneuver${exam === 1 ? "" : "s"}`);
    return parts.join(" \u00b7 ");
  }

  function sheetDetailHtml(sheet) {
    if (!sheet) return emptyStateHtml();
    const aliases = (sheet.aliases || []).filter((alias) => alias && String(alias).trim());
    return `
      <div class="cs-detail">
        <header class="cs-detail-header">
          <button type="button" class="cs-back" data-action="cheat-sheets-back" aria-label="Back to cheat sheet search">
            <span class="cs-back-icon">${ICONS.back}</span><span>Cheat Sheets</span>
          </button>
          <h1 class="cs-title">${escapeHtml(String(sheet.title ?? sheet.id ?? "Cheat sheet"))}</h1>
          ${aliases.length ? `<p class="cs-aliases">Also: ${aliases.map((alias) => escapeHtml(String(alias))).join(", ")}</p>` : ""}
        </header>
        ${sheet.worksheet ? `
        <button type="button" class="cs-worksheet-open" data-action="cheat-sheets-open-worksheet">
          <span class="cs-worksheet-open-title">Fill in worksheet</span>
          <span class="cs-worksheet-open-sub">Tap answers, then copy into your note.</span>
        </button>` : ""}
        ${renderReviewBanner(sheet)}
        ${renderHistorySection(sheet.history)}
        ${renderExamSection(sheet.exam)}
        <p class="cs-footnote">Read-only pocket reference \u2014 educational, not a substitute for supervision or local policy.</p>
      </div>`;
  }

  // --- list / search ---

  function renderSheetCard(sheet) {
    const aliases = (sheet.aliases || []).filter((alias) => alias && String(alias).trim()).slice(0, 3);
    return `
      <li>
        <button type="button" class="cs-card" data-cheat-sheets-open="${escapeHtml(String(sheet.id))}">
          <span class="cs-card-icon" aria-hidden="true">${ICONS.book}</span>
          <span class="cs-card-body">
            <strong class="cs-card-title">${escapeHtml(String(sheet.title ?? sheet.id ?? ""))}</strong>
            ${aliases.length ? `<span class="cs-card-aliases">${aliases.map((alias) => escapeHtml(String(alias))).join(" \u00b7 ")}</span>` : ""}
            <span class="cs-card-meta">${escapeHtml(countItems(sheet))}</span>
          </span>
          <span class="cs-card-chev" aria-hidden="true">${ICONS.chev}</span>
        </button>
      </li>`;
  }

  // Results region only — the controller patches just this node on each
  // keystroke so the search input keeps focus while typing on a phone.
  function sheetListResultsHtml({ sheets, query }) {
    const results = Array.isArray(sheets) ? sheets : [];
    if (!results.length) {
      return `
        <div class="cs-empty" data-cheat-sheets-results>
          <p class="cs-empty-title">No cheat sheets match \u201c${escapeHtml(String(query ?? ""))}\u201d.</p>
          <p class="cs-empty-hint">Try a shorter word \u2014 \u201cchest\u201d, \u201cabd\u201d, \u201cob\u201d.</p>
        </div>`;
    }
    return `
      <ul class="cs-cards" data-cheat-sheets-results>
        ${results.map(renderSheetCard).join("")}
      </ul>`;
  }

  function sheetListHtml({ sheets, query, total }) {
    const showing = Array.isArray(sheets) ? sheets.length : 0;
    return `
      <div class="cs-list">
        <div class="cs-searchbar">
          <span class="cs-search-icon" aria-hidden="true">${ICONS.search}</span>
          <label class="cs-search-label" for="cheat-sheets-search">Search cheat sheets</label>
          <input id="cheat-sheets-search" class="cs-search" type="search" autocomplete="off"
            data-cheat-sheets-search placeholder="Search by condition, alias, or system\u2026"
            value="${escapeHtml(String(query ?? ""))}" aria-label="Search cheat sheets">
        </div>
        <p class="cs-count" aria-live="polite">${showing === total ? `${total} sheet${total === 1 ? "" : "s"}` : `${showing} of ${total} sheets`}</p>
        ${sheetListResultsHtml({ sheets, query })}
        <p class="cs-footnote">Read-only pocket reference \u2014 educational, not a substitute for supervision or local policy.</p>
      </div>`;
  }

  // Rendered when the bundled data file is missing or carries no sheets.
  function emptyStateHtml() {
    return `
      <div class="cs-empty">
        <p class="cs-empty-title">No cheat sheets available.</p>
        <p class="cs-empty-hint">The reference data isn\u2019t bundled with this build yet \u2014 check for an app update.</p>
      </div>`;
  }

  return { sheetListHtml, sheetListResultsHtml, sheetDetailHtml, emptyStateHtml, worksheetHtml, worksheetNoteText, worksheetProgressText };
}
