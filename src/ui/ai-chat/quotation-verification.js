import { hashPiece } from './delta-review.js?v=20261011-epic-workflow';

// Match against the approved snapshot, never raw originals or a later chart.
// Duplicate labels are ambiguous: do not silently select a source.
export function verifyChartQuotation(cite, pieces = []) {
  const matches = pieces.filter(piece => String(piece.label || piece.title || '').trim().toLowerCase() === cite.section.toLowerCase());
  if (matches.length !== 1) return { verification: matches.length ? 'ambiguous-section' : 'missing-section', sourceRanges: [] };
  const source = String(matches[0].approvedText || '');
  const sourceRanges = [];
  if (cite.quote) {
    for (let at = source.indexOf(cite.quote); at !== -1; at = source.indexOf(cite.quote, at + cite.quote.length)) {
      sourceRanges.push({ start: at, end: at + cite.quote.length });
    }
  }
  return { verification: sourceRanges.length ? 'verified' : 'quote-not-found', sourceVersion: hashPiece(source), sourceRanges };
}
