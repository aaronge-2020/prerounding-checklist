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
  // `worksheet: true` (the Mental Status Examination sheet). Each exam
  // item carries per-bullet `fields`: descriptor chips drawn from the
  // worksheet's own categories (single-select on scales, multi-select for
  // independent picks) plus an optional free-text detail per field.
  // State shape: keyed by item id, then field index ->
  // { selected: Set<string>, text: string, detail: string } (the state may
  // be a Map or a plain object at either level). This module stays pure:
  // it only reads that state and returns markup or note text.

  function readWorksheetFieldEntry(state, itemId, fieldIndex) {
    if (!state) return null;
    const perItem = typeof state.get === "function" ? state.get(itemId) : state[itemId];
    if (!perItem) return null;
    const entry = typeof perItem.get === "function" ? perItem.get(fieldIndex) : perItem[fieldIndex];
    if (!entry) return null;
    const selected = entry.selected instanceof Set ? entry.selected : new Set(entry.selected || []);
    return { selected, text: String(entry.text ?? ""), detail: String(entry.detail ?? "") };
  }

  function lowerFirst(value) {
    const text = String(value ?? "");
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  // One filled field's note segment, or null when the field is untouched.
  // Values keep data order and lose only their first letter's case; the
  // detail is reproduced exactly as typed, in parentheses (double-quoted
  // inside the parentheses for quoteDetail fields such as Mood).
  function worksheetFieldSegment(item, field, entry, omitLabel) {
    if (!entry) return null;
    const selected = (field.options || []).filter((option) => entry.selected.has(option));
    const detail = String(entry.detail ?? "").trim();
    if (!selected.length && !detail) return null;
    let core = selected.map(lowerFirst).join(", ");
    if (detail) {
      const wrapped = field.quoteDetail ? `("${detail}")` : `(${detail})`;
      core = core ? `${core} ${wrapped}` : wrapped;
    }
    if (omitLabel) return core;
    return `${String(field.label ?? "").toLowerCase()}: ${core}`;
  }

  function worksheetItemLine(sheet, state, item) {
    const fields = item.fields || [];
    // A domain with exactly one field names the field by the domain alone.
    const omitLabel = fields.length === 1;
    const segments = fields
      .map((field, index) => worksheetFieldSegment(item, field, readWorksheetFieldEntry(state, item.id, index), omitLabel))
      .filter(Boolean);
    if (!segments.length) return null;
    const domain = String(item.system ?? "").trim() || "General";
    return `${domain}: ${segments.join("; ")}`;
  }

  function worksheetFilledCount(sheet, state) {
    let filled = 0;
    for (const item of (sheet && sheet.exam) || []) {
      if (worksheetItemLine(sheet, state, item)) filled += 1;
    }
    return filled;
  }

  function worksheetProgressText(sheet, state) {
    const total = ((sheet && sheet.exam) || []).length;
    return `${worksheetFilledCount(sheet, state)} of ${total} sections filled`;
  }

  // The exact text the clinician pastes into their note: a header line,
  // then one line per filled domain, in sheet order.
  function worksheetNoteText(sheet, state) {
    const lines = [];
    for (const item of (sheet && sheet.exam) || []) {
      const line = worksheetItemLine(sheet, state, item);
      if (line) lines.push(line);
    }
    return lines.length ? `Mental Status Examination\n${lines.join("\n")}` : "";
  }

  // Chip toggle rule, shared by the controller and the tests: a
  // single-select field replaces its pick (tapping the picked chip clears
  // it); a multi-select field toggles the value in or out.
  function worksheetChipToggle(field, selected, value) {
    const current = selected instanceof Set ? [...selected] : [...(selected || [])];
    if (field && field.multi === false) {
      return current.length === 1 && current[0] === value ? [] : [value];
    }
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  function renderWorksheetField(state, item, field, fieldIndex) {
    const entry = readWorksheetFieldEntry(state, item.id, fieldIndex) || { selected: new Set(), text: "", detail: "" };
    const itemId = escapeHtml(String(item.id));
    const chips = (field.options || []).map((option) => {
      const value = String(option);
      const selected = entry.selected.has(value);
      return `
        <button type="button" class="cs-worksheet-chip" data-worksheet-chip="${itemId}" data-worksheet-field="${fieldIndex}" data-value="${escapeHtml(value)}" aria-pressed="${selected ? "true" : "false"}">${selected ? "\u2713 " : ""}${escapeHtml(value)}</button>`;
    }).join("");
    const detailId = `cs-worksheet-detail-${itemId}-${fieldIndex}`;
    return `
      <div class="cs-worksheet-field">
        <p class="cs-worksheet-field-label">${escapeHtml(String(field.label ?? ""))}</p>
        ${chips ? `<div class="cs-worksheet-chips" role="group" aria-label="${escapeHtml(String(field.label ?? ""))}">${chips}
        </div>` : ""}
        <input type="text" class="cs-worksheet-detail" id="${detailId}" data-worksheet-detail="${itemId}" data-worksheet-field="${fieldIndex}" placeholder="${escapeHtml(String(field.detailHint || "Add detail (optional)"))}" aria-label="Detail for ${escapeHtml(String(field.label ?? ""))}" value="${escapeHtml(entry.detail)}">
      </div>`;
  }

  function renderWorksheetSection(sheet, state, item) {
    const fields = (item.fields || []).map((field, index) => renderWorksheetField(state, item, field, index)).join("");
    return `
      <section class="cs-worksheet-card" data-worksheet-section="${escapeHtml(String(item.id))}">
        <h2 class="cs-worksheet-domain">${escapeHtml(String(item.system ?? "").trim() || "General")}</h2>
        ${item.maneuver ? `<p class="cs-worksheet-maneuver">${escapeHtml(String(item.maneuver))}</p>` : ""}
        ${item.how ? `<p class="cs-worksheet-maneuver">${escapeHtml(String(item.how))}</p>` : ""}
        ${fields}
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

  return { sheetListHtml, sheetListResultsHtml, sheetDetailHtml, emptyStateHtml, worksheetHtml, worksheetNoteText, worksheetProgressText, worksheetChipToggle };
}
