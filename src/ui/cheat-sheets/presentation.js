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

  return { sheetListHtml, sheetListResultsHtml, sheetDetailHtml, emptyStateHtml };
}
