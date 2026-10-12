// Section-grounded citations: the model cites patient facts as
// per [Section Label]: 'short verbatim quote'.
//
// Pure parsing shared by metadata matching and the numbered-citation renderer.
// The legacy chip helper below is retained for its existing callers; AI Chat
// uses citation-presentation.js to hide quotations behind numbered markers.
// Accept straight or paired typographic quotation marks and multiline excerpts.
// A closing quote must be followed by a boundary so internal apostrophes
// ("patient's pain") do not end the citation early.
export const SECTION_CITATION_PATTERN = /per \[([^\]]+)\]:\s*(?:(["'])([\s\S]*?)\2|“([\s\S]*?)”|‘([\s\S]*?)’)(?=[\s.,;:!?]|$)/gi;

// Find every section citation: [{ section, quote, start, end }].
export function parseSectionCitations(text) {
  const out = [];
  const input = String(text || "");
  SECTION_CITATION_PATTERN.lastIndex = 0;
  let match;
  while ((match = SECTION_CITATION_PATTERN.exec(input)) !== null) {
    out.push({
      section: match[1].trim(),
      quote: (match[3] ?? match[4] ?? match[5]).trim(),
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return out;
}

// Replace each citation with a sentinel the Markdown renderer passes
// through untouched. Returns { text, cites } in match order; the caller
// renders Markdown, then swaps each sentinel for chip HTML via
// sectionCitationChipHtml (zipped by order — same regex, same order).
export function sentinelizeSectionCitations(text) {
  const cites = [];
  const out = String(text || "").replace(
    SECTION_CITATION_PATTERN,
    (match, section, _quoteChar, straightQuote, doubleQuote, singleQuote, offset) => {
      const quote = straightQuote ?? doubleQuote ?? singleQuote;
      const sentinel = `\uE000SECITE${cites.length}\uE001`;
      cites.push({
        section: String(section || "").trim(),
        quote: String(quote || "").trim(),
        start: Number(offset) || 0,
        end: (Number(offset) || 0) + match.length
      });
      return sentinel;
    }
  );
  return { text: out, cites };
}

// Render one citation chip. meta is the controller's match for the section
// label ({ pieceId, label }) or null when the label matched no reviewed
// chart section. A null meta renders the citation as inert escaped text —
// the quote stays readable, but nothing is clickable.
export function sectionCitationChipHtml(cite, meta, escapeHtml, messageIndex) {
  const escape = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s ?? "");
  const section = String(cite?.section || "");
  const quote = String(cite?.quote || "");
  if (!meta || !meta.pieceId) {
    return escape(`per [${section}]: '${quote}'`);
  }
  const msgIdx = Number.isInteger(messageIndex) ? ` data-message-index="${messageIndex}"` : "";
  const title = escape(`Open chart section: ${meta.label || section}`);
  return (
    `<button type="button" class="rag-cite-chip" data-section-cite="${escape(meta.pieceId)}"${msgIdx} title="${title}">` +
    `per [${escape(section)}]</button>` +
    ` <q class="aic-cite-quote">${escape(quote)}</q>`
  );
}

// Collect the distinct cited section labels in order of first appearance.
export function citedSections(text) {
  const seen = [];
  for (const cite of parseSectionCitations(text)) {
    if (!seen.includes(cite.section)) seen.push(cite.section);
  }
  return seen;
}
