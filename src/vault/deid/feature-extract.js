// Feature extraction for the automatic rule proposer.
//
// Extracts 9 features from each clinician correction, following
// frankenstein-architecture.md §3.2. These features capture the patterns
// our manual R1-R3 rules used (headers, contextual triggers, span shapes).
//
// All processing is local. No data leaves the device.

/**
 * Get the shape pattern of a span's text.
 * Examples: "DD/DD/DDDD" for dates, "Two Capitalized Words" for names.
 */
export function getSpanShape(text) {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return "DD/DD/DDDD";
  if (/^\d+$/.test(text)) return `${text.length} digits`;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 2 && words.every(w => w[0] && w[0] === w[0].toUpperCase())) {
    return "Two Capitalized Words";
  }
  if (words.length === 1 && text[0] === text[0].toUpperCase()) {
    return "Single Capitalized Word";
  }
  if (/^[A-Z\s.\-]+$/.test(text)) return "ALL CAPS";
  return `${words.length} words`;
}

/**
 * Extract the 9 features from a correction.
 *
 * @param {Object} correction - {begin, end, noteText, spanText}
 * @returns {Object} features
 */
export function extractFeatures(correction) {
  const { begin, end, noteText, spanText } = correction;
  if (begin == null || end == null || !noteText) return {};

  const text = noteText;
  const span = spanText || text.slice(begin, end);

  // Context windows
  const beforeText = text.slice(Math.max(0, begin - 200), begin);
  const afterText = text.slice(end, end + 200);

  // before_5_words, after_5_words
  const beforeWords = beforeText.split(/\s+/).filter(Boolean).slice(-5);
  const afterWords = afterText.split(/\s+/).filter(Boolean).slice(0, 5);

  // before_30_chars, after_30_chars (for regex generation)
  const before30 = text.slice(Math.max(0, begin - 30), begin);
  const after30 = text.slice(end, end + 30);

  // span_shape
  const shape = getSpanShape(span);

  // line_position
  const lineStart = text.lastIndexOf("\n", begin - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const relPos = (begin - lineStart) / Math.max(1, line.length);
  const linePosition = relPos < 0.2 ? "start" : relPos > 0.8 ? "end" : "middle";

  // preceded_by_header: does text before match "Header:" pattern?
  const headerMatch = before30.match(/([A-Za-z][A-Za-z ]+):\s*$/);
  const precededByHeader = headerMatch ? headerMatch[1] : null;

  // is_first_on_line
  const lineBefore = text.slice(lineStart, begin).trim();
  const isFirstOnLine = lineBefore.length === 0;

  return {
    before_5_words: beforeWords,
    after_5_words: afterWords,
    before_30_chars: before30,
    after_30_chars: after30,
    span_shape: shape,
    span_length: end - begin,
    line_position: linePosition,
    preceded_by_header: precededByHeader,
    is_first_on_line: isFirstOnLine,
    span_text: span,
  };
}
