// [Cn] citation tags: parsing the model's answer and rendering citations as
// clickable chips.
//
// Pure module: no DOM. The chat presentation renders assistant messages
// through renderCitedHtml instead of plain escaping; clicking a chip is
// wired by the view (data-rag-cite="n") to reveal the cited chunk.
//
// Contract with the prompt (see rag-prompts.js): the model cites chart
// excerpts ONLY as [C1], [C2], … matching the numbered context block it
// received. Tags the model invents ([C99] with no such excerpt) render as
// inert text — never as a clickable chip — so a hallucinated citation
// can't open a fake source.

export const CITATION_TAG_PATTERN = /\[C(\d+)\]/g;

// Find every [Cn] tag: [{ n, start, end }]. n is 1-based.
export function parseCitationTags(text) {
  const out = [];
  const input = String(text || "");
  CITATION_TAG_PATTERN.lastIndex = 0;
  let match;
  while ((match = CITATION_TAG_PATTERN.exec(input)) !== null) {
    out.push({ n: Number(match[1]), start: match.index, end: match.index + match[0].length });
  }
  return out;
}

// Render an assistant message to safe HTML with [Cn] tags replaced by
// clickable chips. chunksByN maps n -> { label, group } for the tooltip.
// Unknown numbers stay as escaped plain text (inert).
// escapeHtml: (text) => escaped text, supplied by the view.
export function renderCitedHtml(rawText, chunksByN, escapeHtml) {
  const escape = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s);
  const input = String(rawText || "");
  const tags = parseCitationTags(input);
  if (!tags.length) return escape(input);
  const known = chunksByN instanceof Map ? chunksByN : new Map(Object.entries(chunksByN || {}).map(([k, v]) => [Number(k), v]));
  let html = "";
  let cursor = 0;
  for (const tag of tags) {
    html += escape(input.slice(cursor, tag.start));
    const chunk = known.get(tag.n);
    if (chunk) {
      const title = escape(`${chunk.group ? `${chunk.group} — ` : ""}${chunk.label || "Chart excerpt"}`);
      html += `<button type="button" class="rag-cite-chip" data-rag-cite="${tag.n}" title="Source: ${title}">[C${tag.n}]</button>`;
    } else {
      // Hallucinated or out-of-range citation: inert text, no chip.
      html += escape(input.slice(tag.start, tag.end));
    }
    cursor = tag.end;
  }
  html += escape(input.slice(cursor));
  return html;
}

// Collect the distinct cited excerpt numbers in order of first appearance.
export function citedNumbers(text) {
  const seen = [];
  for (const tag of parseCitationTags(text)) {
    if (!seen.includes(tag.n)) seen.push(tag.n);
  }
  return seen;
}
