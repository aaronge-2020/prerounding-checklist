// Pure presentation for the Sample Notes test data tab. No DOM, no storage,
// no network: every renderer takes data in and returns an HTML string.
// The controller in ./controller.js owns expand state and actions.
export function createSampleNotesPresentation({ escapeHtml, icon }) {
  const PREVIEW_LINES = 8;

  function previewText(body, expanded) {
    const text = String(body || "");
    if (expanded) return text;
    const lines = text.split("\n");
    if (lines.length <= PREVIEW_LINES) return text;
    return lines.slice(0, PREVIEW_LINES).join("\n");
  }

  function renderBanner() {
    return `
      <div class="notice sample-notes-banner" role="note">
        <strong>Synthetic test data — no real patients.</strong>
        <p class="muted">Every note on this page is fictional and was written for testing. Names, dates, addresses, and record numbers are invented. Use these notes to exercise de-identification and review flows without touching real patient data.</p>
      </div>
    `;
  }

  function renderCard(note, expanded) {
    const id = escapeHtml(note.id);
    const full = previewText(note.body, expanded);
    const truncated = !expanded && String(note.body || "").split("\n").length > PREVIEW_LINES;
    return `
      <article class="panel sample-note-card" data-sample-note-card="${id}">
        <div class="section-heading sample-note-heading">
          <div>
            <h3>${escapeHtml(note.title)}</h3>
            <p class="muted">${escapeHtml(note.description || "")}</p>
          </div>
          <span class="sample-note-type-badge">${escapeHtml(note.type || "Note")}</span>
        </div>
        <pre class="sample-note-preview" aria-label="Note preview">${escapeHtml(full)}${truncated ? "\n…" : ""}</pre>
        <div class="button-row sample-note-actions">
          <button class="button--quiet" type="button" data-action="sample-notes-toggle" data-note-id="${id}">
            ${icon(expanded ? "chevron" : "plus")} ${expanded ? "Collapse" : "Show full note"}
          </button>
          <button class="button--secondary" type="button" data-action="sample-notes-use" data-note-id="${id}">
            ${icon("wand")} Use in Quick De-ID
          </button>
          <button class="button--quiet" type="button" data-action="sample-notes-copy" data-note-id="${id}">
            ${icon("copy")} Copy
          </button>
        </div>
      </article>
    `;
  }

  function renderSampleNotes({ notes, expandedId }) {
    const cards = (notes || []).map((note) => renderCard(note, expandedId === note.id)).join("");
    return `
      <section class="panel sample-notes-panel">
        <div class="section-heading">
          <div>
            <h2>Sample Notes</h2>
            <p class="muted">Fictional Epic style notes for end to end testing. Pick one to load into Quick De-ID or copy anywhere.</p>
          </div>
        </div>
        ${renderBanner()}
        <div class="sample-notes-list">
          ${cards}
        </div>
      </section>
    `;
  }

  function renderEmpty() {
    return `
      <section class="panel sample-notes-panel">
        <div class="section-heading">
          <div>
            <h2>Sample Notes</h2>
          </div>
        </div>
        ${renderBanner()}
        <div class="notice">
          <strong>No sample notes available</strong>
          <p class="muted">The bundled test data could not be loaded. Rebuild it with the sample notes data build script and reload.</p>
        </div>
      </section>
    `;
  }

  return Object.freeze({ renderSampleNotes, renderEmpty });
}
