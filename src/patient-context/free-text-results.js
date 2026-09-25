// Free-text diagnostic result detection.
//
// When Epic results are copy-pasted, some results never carry their actual
// report text — the pasted value is just a status/placeholder (e.g. "Final",
// "Pending", or a short code like "RCT") instead of the interpretation.
// These are almost always free-text reports: EKGs, echocardiograms, CT/MRI/
// X-ray/ultrasound reads, blood cultures, pathology, etc. — and they are
// usually the most important things to report on rounds.
//
// This module identifies those so the app can:
//   1. flag them prominently ("needs result text — paste the report"),
//   2. auto-select them into the note draft, and
//   3. auto-create the "Other results" source entries in the admissions tab
//      so the student pastes the report into a ready-made slot instead of
//      manually creating a new source.

const FREE_TEXT_LABEL_PATTERNS = [
  // Cardiac electrical / imaging
  /\b(?:ekg|ecg|electrocardiogram)\b/i,
  /\b(?:echo|echocardiogram|tte|tee)\b/i,
  /\btransthoracic echo/i,
  /\btransesophageal echo/i,
  // Cross-sectional imaging
  /\bct\b/i,
  /\bcta\b/i,
  /computed tomography/i,
  /\bmri?\b/i,
  /\bmra\b/i,
  /magnetic resonance/i,
  // Plain film / ultrasound / nuclear
  /\b(?:xr|x-?ray|cxr|chest x-?ray|kub|abdominal x-?ray)\b/i,
  /\b(?:us|ultrasound|doppler)\b/i,
  /\bpet\b/i,
  /positron emission/i,
  /nuclear medicine/i,
  /\bv\/?q\b/i,
  /bone scan/i,
  // Microbiology — cultures are free-text reports
  /\bcultures?\b/i,
  /\bblood culture/i,
  // Pathology
  /\bpath(?:ology)?\b/i,
  /\bbiopsy\b/i,
  /\bcytology\b/i,
  /\bfna\b/i,
  // Other free-text studies
  /\bcardiac cath/i,
  /\bcoronary angiograph/i,
  /\beeg\b/i,
  /\bemg\b/i,
  /\bpft/i,
  /pulmonary function/i,
  /sleep study/i,
  /\bstress test\b/i,
  /\bholter\b/i,
  /\bevent monitor/i,
];

const PLACEHOLDER_VALUE_PATTERNS = [
  // Epic result statuses — the report text is behind a link, not in the paste
  /^(?:final|preliminary|corrected|amended|addendum|pending|in[\s-]?process|in[\s-]?progress|collected|received|ordered|scheduled|cancelled|canceled|complete[ds]?|completed|verified|signed|resulted| resulted|released|posted|see[\s-]?report|see[\s-]?note|see[\s-]?scanned|see[\s-]?addendum|available)\b/i,
  // Short all-caps status codes like "RCT", "R*T", "F", "P" — placeholder,
  // not report text. Real interpretations are never 1-4 bare capitals.
  /^[A-Z*]{1,4}$/,
  // A bare date/datetime is a collection stamp, not a result
  /^\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M?)?)?$/,
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(:\d{2})?)?$/,
];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// True when the label names a study whose result is a free-text report
// (imaging read, EKG interpretation, culture, pathology, ...).
export function isFreeTextResultLabel(label) {
  const text = compact(label);
  if (!text) return false;
  return FREE_TEXT_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

// True when the pasted value looks like a status/placeholder rather than
// actual report content. Conservative: real results like "Negative" or
// "No growth to date" do NOT match — only statuses, short codes, and dates.
export function isPlaceholderResultValue(value) {
  const text = compact(value);
  if (!text) return true;
  return PLACEHOLDER_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

// True when this result needs its free-text report pasted in.
export function needsFreeTextResult(label, value) {
  return isFreeTextResultLabel(label) && isPlaceholderResultValue(value);
}

// Same check against a full source text (often "Label: <value>"). Strips a
// leading label prefix and also tests the segment after the last colon, so
// the flag survives de-identification mangling the label slightly.
export function needsFreeTextResultText(label, text) {
  if (!isFreeTextResultLabel(label)) return false;
  const compacted = compact(text);
  if (!compacted) return true;
  if (isPlaceholderResultValue(compacted)) return true;
  const afterColon = compacted.includes(":") ? compact(compacted.slice(compacted.lastIndexOf(":") + 1)) : "";
  if (afterColon && isPlaceholderResultValue(afterColon)) return true;
  return false;
}

export function freeTextResultCategory(label) {
  const text = compact(label);
  if (/\b(?:ct|cta|mri|mra|cxr|xr|x-?ray|us|ultrasound|echo|tte|tee|pet|kub|dexa|doppler|nuclear|mammogram)\b/i.test(text)) return "imaging";
  if (/\bcultures?\b/i.test(text) || /^(?:blood|sputum|urine|wound|csf|stool)/i.test(text)) return "microbiology";
  if (/\bpath(?:ology)?\b|\bbiopsy\b|\bcytology\b|\bfna\b/i.test(text)) return "pathology";
  return "other";
}
