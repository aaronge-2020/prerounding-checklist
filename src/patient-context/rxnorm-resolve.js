// Offline RxNorm concept resolution for CPRS medication order text.
//
// Pure module: no network, no DOM, no storage. Maps a raw order string such as
// "Give: Lipitor 20 mg PO daily" to canonical RxNorm concepts:
//
//   [{ rxcui, name, tty, strength, doseForm, route }]
//
// RxCUIs are ingredient-level (IN), combination (MIN), or precise-ingredient
// (PIN) concepts canonicalized via the NLM RxNav API at asset build time — the
// same keying as the DDInter interaction dataset in src/ui/drug-lookup, so MAR
// concepts join directly with DDI_PAIRS keys.
//
// Matching: strips the "Give:" prefix, dose/strength, frequency, route, dose
// form, and administration tokens, then resolves the remaining drug name via
// longest-match against the bundled bare-name lookup. Brand names resolve to
// their generic ingredient; combination products return one concept per
// ingredient; topical formulations stay distinguishable via doseForm/route.
//
// Unknown medications resolve to [] and this module never throws, so MAR
// parsing continues undisturbed when the lookup misses.

import { RXNORM_BARE_NAMES } from "./rxnorm-bare-names.data.js?v=20260929-rxnorm-mar-v2";

export const RXNORM_RESOLVER_TAG = "20260929-rxnorm-mar-v2";

// [rxcui, tty, name, kind, ingredients?] -> normalized concept records.
const CONCEPTS = new Map();
for (const [key, raw] of Object.entries(RXNORM_BARE_NAMES || {})) {
  if (!Array.isArray(raw) || raw.length < 4) continue;
  CONCEPTS.set(key, {
    rxcui: String(raw[0]),
    tty: String(raw[1]),
    name: String(raw[2]),
    kind: String(raw[3]),
    ingredients: Array.isArray(raw[4])
      ? raw[4]
          .filter((pair) => Array.isArray(pair) && pair.length >= 2)
          .map((pair) => ({ rxcui: String(pair[0]), name: String(pair[1]) }))
      : null
  });
}

/** Number of bare-name entries in the bundled lookup. */
export function rxNormAssetSize() {
  return CONCEPTS.size;
}

function normKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GIVE_PREFIX_RE = /^\s*give\s*:\s*/i;
const STRENGTH_RE =
  /\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:mcg|mg|grams?|g|ml|meq|mmol|units?|iu|%)(?![a-z])(?:\s*\/\s*(?:ml|hr|day|dose|kg))?/i;

const ROUTE_PATTERNS = [
  [/\bp\.?o\.?\b/i, "PO"],
  [/\bi\.?v\.?\b/i, "IV"],
  [/\bi\.?m\.?\b/i, "IM"],
  [/\bs\.?c\.?\b/i, "SC"],
  [/\bsq\b/i, "SC"],
  [/\bsl\b/i, "SL"],
  [/\bintradermal\b/i, "ID"],
  [/\boral\b/i, "PO"],
  [/\btopical\b/i, "topical"],
  [/\btransdermal\b/i, "transdermal"],
  [/\binhalation\b/i, "inhalation"],
  [/\bnebuliz\w*\b/i, "nebulized"],
  [/\bvaginal\b/i, "vaginal"],
  [/\brectal\b/i, "PR"],
  [/\bpr\b/i, "PR"],
  [/\botic\b/i, "otic"],
  [/\bophthalmic\b/i, "ophthalmic"],
  [/\bnasal\b/i, "nasal"]
];

const FORM_PATTERNS = [
  [/\btablets?\b/i, "tablet"],
  [/\btabs?\b/i, "tablet"],
  [/\bcapsules?\b/i, "capsule"],
  [/\bcaps?\b/i, "capsule"],
  [/\bcaplets?\b/i, "caplet"],
  [/\binjections?\b/i, "injection"],
  [/\binjs?\b/i, "injection"],
  [/\bsolutions?\b/i, "solution"],
  [/\bsolns?\b/i, "solution"],
  [/\bsuspensions?\b/i, "suspension"],
  [/\bcreams?\b/i, "cream"],
  [/\bointments?\b/i, "ointment"],
  [/\blotions?\b/i, "lotion"],
  [/\bgels?\b/i, "gel"],
  [/\bpatches?\b/i, "patch"],
  [/\bsprays?\b/i, "spray"],
  [/\bdrops\b/i, "drops"],
  [/\bsyrups?\b/i, "syrup"],
  [/\binhalers?\b/i, "inhaler"],
  [/\bpowders?\b/i, "powder"],
  [/\bsuppositor(?:y|ies)\b/i, "suppository"]
];

const FREQUENCY_RE = /\b(daily|qd|bid|tid|qid|qhs|qod|weekly|monthly|prn|q\d+\s*h\b|once|twice)\b/gi;
const ADMIN_VERB_RE = /\b(give|take|inject|apply|administer(?:ed)?)\b/gi;
const RELEASE_RE = /\b(extended|delayed|sustained|controlled)(?:\s+release)?\b|\brelease\b/gi;
const BRACKET_RE = /\[[^\]]*\]/g;
const PAREN_RE = /\([^)]*\)/g;
// Multi-ingredient free-text orders ("bupivacaine 0.0625% & fentanyl 2 mcg/mL").
// Strengths are stripped before this runs, so a surviving & or + separates
// ingredients rather than a ratio (ratios like 49/51 mg are consumed by
// STRENGTH_RE). Each fragment resolves independently; misses contribute nothing.
const COMBO_SPLIT_RE = /\s*[&+]\s*/;

function removeSpan(working, match) {
  return `${working.slice(0, match.index)} ${working.slice(match.index + match[0].length)}`;
}

function removeAll(working, pattern) {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return working.replace(global, " ");
}

function extractPattern(working, patterns) {
  for (const [pattern, label] of patterns) {
    if (pattern.test(working)) {
      let rest = working;
      for (const [other] of patterns) rest = removeAll(rest, other);
      return { value: label, rest };
    }
  }
  return { value: "", rest: working };
}

function normalizeStrength(raw) {
  return raw
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Longest-match: exact normalized name first, then progressively shorter
// trailing-word prefixes (handles trailing salt forms and stray tokens).
function lookupWithFallback(key) {
  if (!key) return null;
  const direct = CONCEPTS.get(key);
  if (direct) return direct;
  const words = key.split(" ").filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const hit = CONCEPTS.get(words.join(" "));
    if (hit) return hit;
  }
  return null;
}

function toConcepts(entry, strength, doseForm, route) {
  const base = { strength, doseForm, route };
  if (entry.kind === "combo" && entry.ingredients && entry.ingredients.length > 0) {
    return entry.ingredients.map((ingredient) => ({
      rxcui: ingredient.rxcui,
      name: ingredient.name,
      tty: "IN",
      ...base
    }));
  }
  return [{ rxcui: entry.rxcui, name: entry.name, tty: entry.tty, ...base }];
}

/**
 * Resolve a raw MAR order string to RxNorm concepts.
 * Never throws; returns [] for unrecognized or empty input.
 */
export function resolveMedicationConcepts(orderText) {
  try {
    if (orderText == null) return [];
    let working = String(orderText).replace(GIVE_PREFIX_RE, "");
    if (!working.trim()) return [];

    const strengthMatches = [...working.matchAll(new RegExp(STRENGTH_RE.source, "gi"))];
    const strength = strengthMatches.length
      ? normalizeStrength(strengthMatches[strengthMatches.length - 1][0])
      : "";
    if (strengthMatches.length) working = removeAll(working, STRENGTH_RE);

    const route = extractPattern(working, ROUTE_PATTERNS);
    working = route.rest;
    const form = extractPattern(working, FORM_PATTERNS);
    working = form.rest;

    working = working
      .replace(BRACKET_RE, " ")
      .replace(PAREN_RE, " ")
      .replace(RELEASE_RE, " ")
      .replace(FREQUENCY_RE, " ")
      .replace(ADMIN_VERB_RE, " ");

    const fragments = working.split(COMBO_SPLIT_RE).map((f) => f.trim()).filter(Boolean);
    if (fragments.length > 1) {
      const seen = new Set();
      const out = [];
      for (const fragment of fragments) {
        const entry = lookupWithFallback(normKey(fragment));
        if (!entry) continue;
        for (const concept of toConcepts(entry, strength, form.value, route.value)) {
          if (seen.has(concept.rxcui)) continue;
          seen.add(concept.rxcui);
          out.push(concept);
        }
      }
      return out;
    }

    const entry = lookupWithFallback(normKey(working));
    if (!entry) return [];
    return toConcepts(entry, strength, form.value, route.value);
  } catch {
    return [];
  }
}
