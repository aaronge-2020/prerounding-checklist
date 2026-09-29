// Pure search and lookup logic for the Cheat Sheets pocket reference.
// No DOM, no storage, no network — safe to run in plain node (and tested
// that way in tests/test-cheat-sheets.js).
//
// Expected sheet shape (from src/data/cheat-sheets.json):
//   { id, title, aliases[], history: [{ id, system, question, listenFor[], why, whySource }],
//     exam: [{ id, system, maneuver, findings[], how, why, whySource }], reviewNeeded }

export function normalizeQuery(query) {
  return String(query ?? "").trim().toLowerCase();
}

// Distinct system names across a sheet's history and exam items, in first-
// appearance order. Used only for search matching, never for display.
function systemNames(sheet) {
  const seen = [];
  const push = (value) => {
    const name = String(value ?? "").trim().toLowerCase();
    if (name && !seen.includes(name)) seen.push(name);
  };
  for (const item of sheet.history || []) push(item && item.system);
  for (const item of sheet.exam || []) push(item && item.system);
  return seen;
}

// Ranking tiers, highest first: a title hit always outranks an alias hit,
// an alias hit always outranks an id hit, and any of those outrank a system
// hit. Prefix matches outrank substring matches within each tier.
const TIER = {
  titlePrefix: 100,
  aliasPrefix: 80,
  idPrefix: 70,
  titleSub: 60,
  aliasSub: 45,
  idSub: 40,
  systemPrefix: 30,
  systemSub: 15
};

export function scoreSheet(sheet, rawQuery) {
  const q = normalizeQuery(rawQuery);
  if (!q || !sheet) return 0;
  const startsWith = (value) => value.startsWith(q);
  const includes = (value) => value.includes(q);
  let best = 0;

  const title = String(sheet.title ?? "").trim().toLowerCase();
  if (title) {
    if (startsWith(title)) best = Math.max(best, TIER.titlePrefix);
    else if (includes(title)) best = Math.max(best, TIER.titleSub);
  }

  for (const alias of sheet.aliases || []) {
    const text = String(alias ?? "").trim().toLowerCase();
    if (!text) continue;
    if (startsWith(text)) best = Math.max(best, TIER.aliasPrefix);
    else if (includes(text)) best = Math.max(best, TIER.aliasSub);
  }

  const id = String(sheet.id ?? "").trim().toLowerCase();
  if (id) {
    if (startsWith(id)) best = Math.max(best, TIER.idPrefix);
    else if (includes(id)) best = Math.max(best, TIER.idSub);
  }

  for (const system of systemNames(sheet)) {
    if (startsWith(system)) best = Math.max(best, TIER.systemPrefix);
    else if (includes(system)) best = Math.max(best, TIER.systemSub);
  }

  return best;
}

function compareByTitle(a, b) {
  return String(a.title ?? a.id ?? "").localeCompare(String(b.title ?? b.id ?? ""));
}

// Ranked sheet list for a query. Empty/blank query returns every sheet in
// source order; a query returns only sheets that match, best match first,
// ties broken alphabetically by title for a stable phone-friendly list.
export function searchSheets(sheets, query) {
  const list = (Array.isArray(sheets) ? sheets : []).filter((sheet) => sheet && typeof sheet === "object");
  const q = normalizeQuery(query);
  if (!q) return list.slice();
  return list
    .map((sheet) => ({ sheet, score: scoreSheet(sheet, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || compareByTitle(a.sheet, b.sheet))
    .map((entry) => entry.sheet);
}

export function getSheetById(sheets, id) {
  if (id === undefined || id === null || id === "") return null;
  const wanted = String(id);
  const list = Array.isArray(sheets) ? sheets : [];
  return list.find((sheet) => sheet && String(sheet.id) === wanted) || null;
}
