// Saved clinical-score calculations: pure helpers for persisting a
// calculated score result onto the active patient record and formatting it
// for insertion into a note draft. No DOM, storage, or network access here;
// persistence happens through the vault (updateActivePatient + persistVault)
// at the UI edge.
export const SAVED_SCORE_SCHEMA = "saved_clinical_score_v1";

function cleanText(value) {
  return String(value ?? "").trim();
}

function timestampNow() {
  return new Date().toISOString();
}

export function createLocalId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

// Build a saved-score record from a calculator definition and its completed
// result. Returns null when the result is not a completed calculation.
export function createSavedScoreRecord({ definition, result, now = timestampNow } = {}) {
  if (!definition || !result || result.complete === false) return null;
  const interpretation = result.interpretation || {};
  const headline = cleanText(interpretation.headline);
  const detail = cleanText(interpretation.detail);
  // Some calculators (e.g. Light's Criteria) show a result sentence with no
  // headline; only reject when there is nothing worth saving at all.
  if (!headline && !detail) return null;
  const timestamp = now();
  return {
    id: createLocalId("score"),
    schema: SAVED_SCORE_SCHEMA,
    scoreId: String(definition.id || ""),
    title: cleanText(definition.title) || "Clinical score",
    headline,
    detail,
    band: cleanText(interpretation.band),
    savedAt: timestamp
  };
}

// Normalize a persisted savedScores array (vault schema edge).
export function normalizeSavedScores(list, { now = timestampNow } = {}) {
  if (!Array.isArray(list)) return [];
  const timestamp = now();
  const seen = new Set();
  const normalized = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = cleanText(entry.id) || createLocalId("score");
    if (seen.has(id)) continue;
    seen.add(id);
    const headline = cleanText(entry.headline);
    if (!headline) continue;
    normalized.push({
      id,
      schema: SAVED_SCORE_SCHEMA,
      scoreId: cleanText(entry.scoreId),
      title: cleanText(entry.title) || "Clinical score",
      headline,
      detail: cleanText(entry.detail),
      band: cleanText(entry.band),
      savedAt: cleanText(entry.savedAt) || timestamp
    });
  }
  // Newest first, so the picker surfaces recent calculations.
  normalized.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return normalized;
}

export function appendSavedScore(list, record) {
  if (!record) return normalizeSavedScores(list);
  return normalizeSavedScores([...(Array.isArray(list) ? list : []), record]);
}

export function removeSavedScore(list, id) {
  const target = cleanText(id);
  return normalizeSavedScores((Array.isArray(list) ? list : []).filter((entry) => cleanText(entry?.id) !== target));
}

export function listSavedScores(patient) {
  return normalizeSavedScores(patient?.savedScores);
}

// Note-style one-line text for insertion into a draft note section, e.g.
// "CHA2DS2-VASc: 3 points — 3.2% annual stroke risk. Anticoagulation ...".
// The inserted text remains fully editable once placed.
export function formatSavedScoreForNote(record) {
  if (!record) return "";
  const title = cleanText(record.title) || "Clinical score";
  const headline = cleanText(record.headline);
  const detail = cleanText(record.detail);
  const head = headline ? `${title}: ${headline}` : title;
  return detail ? `${head} — ${detail}` : head;
}

// Short label for the picker row.
export function formatSavedScoreLabel(record) {
  if (!record) return "";
  const title = cleanText(record.title) || "Clinical score";
  const headline = cleanText(record.headline);
  return headline ? `${title} — ${headline}` : title;
}
