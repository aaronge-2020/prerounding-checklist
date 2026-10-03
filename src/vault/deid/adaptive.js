// Adaptive de-identification loop.
//
// Learns from clinician corrections in real time, entirely on-device:
//   1. Personal gazetteer: corrected strings remembered per user.
//   2. Pattern templates: context around a correction becomes a reusable
//      rule ("Dr. X", "Dear Ms. Y", "signed by Z").
//   3. Suppression list: rejected spans are never proposed again.
//   4. Within-note projection: a confirmed entity covers all its identical
//      mentions in the same note.
//
// No model retraining, no cloud, no batch jobs. A correction updates the
// store synchronously; the note re-scans in milliseconds.
//
// This module is dependency-free on purpose: src/vault/deid.js imports it,
// never the reverse (avoids an import cycle).

export const ADAPTIVE_STORE_VERSION = 1;

// Labels the adaptive layer is allowed to emit. Anything outside this set
// is ignored at learn time so a bad correction cannot poison the store.
const ADAPTIVE_LABELS = new Set([
  "NAME", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME",
  "LOCATION", "FACILITY", "ORGANIZATION", "ADDRESS", "ROOM", "AGE",
  "OCCUPATION", "DATE", "DOB", "EMAIL", "PHONE", "MRN", "ID", "URL"
]);

// Common words that are also surnames. Single-word gazetteer entries on
// this list never fire: too easy to false-positive on ordinary prose.
const COMMON_WORD_STOPLIST = new Set(
  ("a,about,above,after,again,against,all,also,am,an,and,any,are,as,at,be," +
    "because,been,before,being,below,between,both,but,by,can,cannot,could," +
    "day,days,did,do,does,doing,down,during,each,few,for,from,further,had," +
    "has,have,having,he,her,here,hers,herself,him,himself,his,how,i,if,in," +
    "into,is,it,its,itself,long,may,me,more,most,my,myself,no,nor,not,now," +
    "of,off,on,once,only,or,other,ought,our,ours,ourselves,out,over,own," +
    "same,she,should,so,some,such,than,that,the,their,theirs,them," +
    "themselves,then,there,these,they,this,those,through,to,too,under," +
    "until,up,very,was,we,were,what,when,where,which,while,who,whom,why," +
    "will,with,would,year,years,you,young,your,yours,yourself,yourselves," +
    "january,february,march,april,may,june,july,august,september,october," +
    "november,december,monday,tuesday,wednesday,thursday,friday,saturday," +
    "sunday,today,tomorrow,yesterday,patient,doctor,provider,nurse,hospital," +
    "clinic,department,unit,floor,room,bed,report,note,summary,plan,history," +
    "exam,assessment,impression,findings,results,labs,medications,allergies").split(",")
);

const TITLE_WORDS = ["dr", "mr", "mrs", "ms", "miss"];
const ROLE_BY_VERBS = [
  "signed", "prepared", "created", "authorized", "dictated", "transcribed",
  "performed", "evaluated", "authenticated", "cosigned", "reviewed"
];
const ROLE_LABEL_WORDS = [
  "attending", "author", "provider", "pcp", "surgeon", "physician",
  "resident", "intern", "fellow", "nurse", "practitioner", "doctor"
];

// One capitalized word, allowing hyphens and apostrophes: "Smith",
// "phoebe-marie", "O'Brien". Used inside larger shapes.
const NAME_WORD = "[A-Z][a-z'\\-]+";
// A person-name-shaped span: 1-3 capitalized words, or "LAST, First".
const NAME_SHAPE_SOURCE =
  "(?:" + NAME_WORD + "(?:\\s+" + NAME_WORD + "){0,2}" +
  "|" + NAME_WORD + ",\\s*" + NAME_WORD + "(?:" + "\\s+" + NAME_WORD + ")?)";
// All-caps variant: "HARDEEP HUGHES".
const NAME_SHAPE_CAPS_SOURCE =
  "(?:[A-Z][A-Z'\\-]+(?:\\s+[A-Z][A-Z'\\-]+){0,2})";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeGazetteerKey(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isNameShaped(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 80) return false;
  return new RegExp("^(?:" + NAME_SHAPE_SOURCE + "|" + NAME_SHAPE_CAPS_SOURCE + ")$").test(value);
}

function isProperNounPhrase(text) {
  // Multi-word capitalized phrase: safe enough for the gazetteer even when
  // it is not strictly a person name ("St. Mary Hospital").
  const value = String(text || "").trim();
  if (!value || value.length > 120) return false;
  const words = value.split(/\s+/);
  if (words.length < 2) return false;
  return words.every((word) => /^[A-Z][\w.'\-]*$/.test(word) || /^(?:of|the|and|de|la|st\.?)$/i.test(word));
}

function singleWordFires(key) {
  // Single-word gazetteer entries only fire when capitalized in the text
  // and not a common word: "Smith" yes, "may" no.
  return !COMMON_WORD_STOPLIST.has(key);
}

export function createAdaptiveStore(initial) {
  const store = {
    version: ADAPTIVE_STORE_VERSION,
    gazetteer: {},
    patterns: [],
    suppressions: [],
    stats: { correctionsSeen: 0, accepted: 0, rejected: 0, added: 0 }
  };
  if (initial) {
    const clean = deserializeAdaptiveStore(initial);
    if (clean) return clean;
  }
  return store;
}

// Validate and normalize a stored blob (e.g. from the encrypted vault).
// Returns a clean store, or null when the blob is unusable.
export function deserializeAdaptiveStore(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const store = createAdaptiveStore();
    const gazetteer = raw.gazetteer && typeof raw.gazetteer === "object" ? raw.gazetteer : {};
    for (const [key, entry] of Object.entries(gazetteer)) {
      if (!entry || typeof entry !== "object") continue;
      if (!ADAPTIVE_LABELS.has(entry.label)) continue;
      if (typeof key !== "string" || !key || key.length > 200) continue;
      store.gazetteer[key] = {
        label: entry.label,
        hits: Number(entry.hits) || 0,
        misses: Number(entry.misses) || 0,
        lastSeen: Number(entry.lastSeen) || 0
      };
    }
    const patterns = Array.isArray(raw.patterns) ? raw.patterns : [];
    for (const pattern of patterns) {
      if (!pattern || typeof pattern !== "object") continue;
      if (!ADAPTIVE_LABELS.has(pattern.label)) continue;
      if (typeof pattern.source !== "string" || !pattern.source) continue;
      try {
        // eslint-disable-next-line no-new
        new RegExp(pattern.source, typeof pattern.flags === "string" ? pattern.flags : "");
      } catch {
        continue;
      }
      store.patterns.push({
        id: String(pattern.id || `pat_${store.patterns.length}`),
        kind: String(pattern.kind || "custom"),
        label: pattern.label,
        source: pattern.source,
        flags: typeof pattern.flags === "string" ? pattern.flags : "",
        hits: Number(pattern.hits) || 0,
        misses: Number(pattern.misses) || 0,
        enabled: pattern.enabled !== false,
        createdFrom: String(pattern.createdFrom || "").slice(0, 120)
      });
    }
    const suppressions = Array.isArray(raw.suppressions) ? raw.suppressions : [];
    for (const suppression of suppressions) {
      if (!suppression || typeof suppression !== "object") continue;
      const key = normalizeGazetteerKey(suppression.text);
      if (!key) continue;
      store.suppressions.push({
        id: String(suppression.id || `sup_${store.suppressions.length}`),
        text: key,
        label: ADAPTIVE_LABELS.has(suppression.label) ? suppression.label : "",
        hits: Number(suppression.hits) || 0,
        createdFrom: String(suppression.createdFrom || "").slice(0, 120)
      });
    }
    const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
    store.stats = {
      correctionsSeen: Number(stats.correctionsSeen) || 0,
      accepted: Number(stats.accepted) || 0,
      rejected: Number(stats.rejected) || 0,
      added: Number(stats.added) || 0
    };
    return store;
  } catch {
    return null;
  }
}

export function serializeAdaptiveStore(store) {
  if (!store || typeof store !== "object") return null;
  return JSON.parse(JSON.stringify({
    version: ADAPTIVE_STORE_VERSION,
    gazetteer: store.gazetteer || {},
    patterns: store.patterns || [],
    suppressions: store.suppressions || [],
    stats: store.stats || { correctionsSeen: 0, accepted: 0, rejected: 0, added: 0 }
  }));
}

let patternCounter = 0;
let suppressionCounter = 0;

function nextPatternId() {
  patternCounter += 1;
  return `pat_${Date.now().toString(36)}_${patternCounter}`;
}

function nextSuppressionId() {
  suppressionCounter += 1;
  return `sup_${Date.now().toString(36)}_${suppressionCounter}`;
}

// Case-insensitive literal for trigger words: "dr" -> "[Dd][Rr]". The name
// shape itself stays case-sensitive on purpose (capitalization is the
// signal), so trigger words cannot use a blanket /i flag.
function ciWord(word) {
  return String(word).split("").map((ch) =>
    /[a-z]/i.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escapeRegExp(ch)
  ).join("");
}

// Extract at most one reusable pattern from the context before a corrected
// span. Priority: title prefix, greeting, role-by verb, role label.
function extractPattern(textBefore, label, spanText) {
  const before = String(textBefore || "");
  if (!before || !isNameShaped(spanText)) return null;
  const nameGroup = "(" + NAME_SHAPE_SOURCE + "|" + NAME_SHAPE_CAPS_SOURCE + ")";

  const titleMatch = before.match(new RegExp("\\b(" + TITLE_WORDS.join("|") + ")\\.?\\s*$", "i"));
  if (titleMatch) {
    const title = titleMatch[1].toLowerCase();
    return {
      kind: "title-prefix",
      label,
      source: "\\b" + ciWord(title) + "\\.?\\s+" + nameGroup,
      flags: "",
      createdFrom: `${titleMatch[1]}. ${spanText}`.slice(0, 120)
    };
  }

  if (/\bdear\s+(?:(?:mr|mrs|ms|miss)\.?\s*)?$/i.test(before)) {
    const titles = TITLE_WORDS.map((title) => ciWord(title) + "\\.?\\s+").join("|");
    return {
      kind: "greeting",
      label,
      source: "\\b" + ciWord("dear") + "\\s+(?:" + titles + ")?" + nameGroup,
      flags: "",
      createdFrom: `Dear ${spanText}`.slice(0, 120)
    };
  }

  if (new RegExp("\\b(?:" + ROLE_BY_VERBS.join("|") + ")\\s+by\\s*$", "i").test(before)) {
    const verbs = ROLE_BY_VERBS.map(ciWord).join("|");
    return {
      kind: "role-by",
      label,
      source: "\\b(?:" + verbs + ")\\s+" + ciWord("by") + "\\s+" + nameGroup,
      flags: "",
      createdFrom: `signed by ${spanText}`.slice(0, 120)
    };
  }

  const lastLine = before.split("\n").pop() || "";
  const roleLabelMatch = lastLine.match(new RegExp("^\\s*(" + ROLE_LABEL_WORDS.join("|") + ")\\s*:\\s*$", "i"));
  if (roleLabelMatch) {
    return {
      kind: "role-label",
      label,
      source: "^\\s*" + ciWord(roleLabelMatch[1].toLowerCase()) + "\\s*:\\s*" + nameGroup,
      flags: "m",
      createdFrom: `${roleLabelMatch[1]}: ${spanText}`.slice(0, 120)
    };
  }

  return null;
}

function patternExists(store, source, label) {
  return store.patterns.some((pattern) => pattern.source === source && pattern.label === label);
}

function suppressionKey(text, label) {
  return `${normalizeGazetteerKey(text)}\u0000${label || ""}`;
}

// Infer a PHI label for a manually redacted span (a recall miss the system
// never proposed, so there is no label to learn from).
export function inferManualLabel(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(value)) return "EMAIL";
  if (/^https?:\/\/\S+$/i.test(value) || /^www\.\S+$/i.test(value)) return "URL";
  if (/^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(value)) return "PHONE";
  if (/^\d{3}-\d{2}-\d{4}$/.test(value) || /^(?:MRN\s*)?\d{6,10}$/i.test(value)) return "ID";
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(value) && /\d/.test(value)) return "DATE";
  if (isNameShaped(value)) return "NAME";
  if (isProperNounPhrase(value)) return "FACILITY";
  return null;
}

/**
 * Learn from one clinician correction. Mutates the store in place and
 * returns it.
 *
 * correction = {
 *   decision: "accepted" | "rejected" | "added" | "edited",
 *   original: span text (PHI),
 *   label: PHI label,
 *   textBefore: up to ~80 chars left of the span (for pattern extraction),
 *   textAfter: up to ~40 chars right of the span,
 *   source: where the correction came from
 * }
 */
export function learnFromCorrection(store, correction) {
  if (!store || !correction) return store;
  const decision = String(correction.decision || "");
  const original = String(correction.original || "").slice(0, 200);
  const label = String(correction.label || "");
  const textBefore = String(correction.textBefore || "").slice(-120);
  if (!original || !ADAPTIVE_LABELS.has(label)) {
    return store;
  }
  store.stats.correctionsSeen += 1;

  if (decision === "rejected") {
    store.stats.rejected += 1;
    const key = suppressionKey(original, label);
    if (!store.suppressions.some((entry) => suppressionKey(entry.text, entry.label) === key)) {
      store.suppressions.push({
        id: nextSuppressionId(),
        text: normalizeGazetteerKey(original),
        label,
        hits: 0,
        createdFrom: original.slice(0, 120)
      });
    }
    // A demoted gazetteer entry stops firing after repeated rejections.
    const gazetteKey = normalizeGazetteerKey(original);
    const gazetteEntry = store.gazetteer[gazetteKey];
    if (gazetteEntry) {
      gazetteEntry.misses += 1;
    }
    return store;
  }

  if (decision === "accepted" || decision === "added" || decision === "edited") {
    store.stats[decision === "accepted" ? "accepted" : "added"] += 1;
    const key = normalizeGazetteerKey(original);
    const multiWord = key.includes(" ");
    // Single common words never enter the gazetteer.
    if ((multiWord || singleWordFires(key)) && (isNameShaped(original) || isProperNounPhrase(original) || multiWord)) {
      const existing = store.gazetteer[key];
      if (existing) {
        existing.hits += 1;
        existing.label = label;
        existing.lastSeen = Date.now();
      } else {
        store.gazetteer[key] = { label, hits: 1, misses: 0, lastSeen: Date.now() };
      }
    }
    const extracted = extractPattern(textBefore, label, original);
    if (extracted && !patternExists(store, extracted.source, extracted.label)) {
      store.patterns.push({
        id: nextPatternId(),
        kind: extracted.kind,
        label: extracted.label,
        source: extracted.source,
        flags: extracted.flags || "",
        hits: 0,
        misses: 0,
        enabled: true,
        createdFrom: extracted.createdFrom
      });
    }
    return store;
  }

  return store;
}

function isSuppressed(store, text, label) {
  const key = normalizeGazetteerKey(text);
  return store.suppressions.some((entry) => entry.text === key && (!entry.label || entry.label === label));
}

function entityOverlaps(entities, start, end) {
  return entities.some((entity) => start < entity.end && entity.start < end);
}

function findAllOccurrences(text, needle) {
  // Case-insensitive whole-phrase search with word boundaries.
  const spans = [];
  if (!needle || needle.length < 2) return spans;
  const pattern = new RegExp("\\b" + escapeRegExp(needle) + "\\b", "gi");
  let match;
  while ((match = pattern.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return spans;
}

/**
 * Apply the adaptive store to a note's entities. Returns a new entity
 * array: suppressions removed, gazetteer and pattern matches added,
 * adaptive/user-confirmed entities projected to all identical mentions.
 *
 * Entities are {start, end, label, ...}. Added entities carry
 * source "adaptive-gazetteer" or "adaptive-pattern" and no placeholder;
 * the caller assigns placeholders from the label mapping.
 */
export function applyAdaptiveEntities(text, entities, store) {
  const source = String(text || "");
  if (!source || !store) return entities;
  let next = (entities || []).filter((entity) => {
    if (!entity || entity.end <= entity.start) return false;
    const entityText = source.slice(entity.start, entity.end);
    return !isSuppressed(store, entityText, entity.label);
  });

  const additions = [];
  const tryAdd = (start, end, label, patternId) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    if (entityOverlaps(next, start, end) || entityOverlaps(additions, start, end)) return;
    additions.push({
      start,
      end,
      label,
      source: patternId ? "adaptive-pattern" : "adaptive-gazetteer",
      patternId: patternId || null,
      score: 1
    });
  };

  // Gazetteer: longest entries first so "St. Mary Hospital" wins over "Mary".
  const gazetteKeys = Object.keys(store.gazetteer || {}).sort((a, b) => b.length - a.length);
  for (const key of gazetteKeys) {
    const entry = store.gazetteer[key];
    if (!entry || entry.misses >= 2) continue;
    const spans = findAllOccurrences(source, key);
    for (const span of spans) {
      const matchedText = source.slice(span.start, span.end);
      // Single-word entries must appear capitalized to fire.
      if (!key.includes(" ") && !/^[A-Z]/.test(matchedText)) continue;
      tryAdd(span.start, span.end, entry.label, null);
    }
    if (spans.length > 0) entry.hits += 1;
  }

  // Patterns: group 1 of each regex is the name span. Patterns carry their
  // own flags (role-label needs multiline for ^); the name shape is always
  // case-sensitive so capitalization remains the signal.
  for (const pattern of store.patterns || []) {
    if (!pattern || pattern.enabled === false) continue;
    let regex;
    try {
      // Always global so exec() advances; the stored flags add the rest.
      const flags = `g${String(pattern.flags || "").replace(/g/g, "")}`;
      regex = new RegExp(pattern.source, flags);
    } catch {
      continue;
    }
    let match;
    let fired = false;
    while ((match = regex.exec(source)) !== null) {
      const nameText = match[1] || match[0];
      const offsetInMatch = match[0].indexOf(nameText);
      const start = match.index + Math.max(0, offsetInMatch);
      const end = start + nameText.length;
      if (!isNameShaped(nameText)) continue;
      if (isSuppressed(store, nameText, pattern.label)) continue;
      tryAdd(start, end, pattern.label, pattern.id);
      fired = true;
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
    if (fired) pattern.hits += 1;
  }

  next = next.concat(additions);

  // Within-note projection: every adaptive or user-confirmed entity covers
  // all identical mentions in the note.
  const projectable = next.filter((entity) =>
    entity && (String(entity.source || "").startsWith("adaptive") || entity.userConfirmed === true)
  );
  const projected = [];
  for (const entity of projectable) {
    const needle = source.slice(entity.start, entity.end);
    if (!needle || needle.trim().length < 3) continue;
    for (const span of findAllOccurrences(source, needle.trim())) {
      if (entityOverlaps(next, span.start, span.end) || entityOverlaps(projected, span.start, span.end)) continue;
      projected.push({
        start: span.start,
        end: span.end,
        label: entity.label,
        source: "adaptive-projection",
        score: 1
      });
    }
  }
  next = next.concat(projected);

  // Dedupe overlaps: keep the longest span; ties keep the earlier one.
  next.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const deduped = [];
  for (const entity of next) {
    const clash = deduped.find((kept) => entity.start < kept.end && kept.start < entity.end);
    if (!clash) {
      deduped.push(entity);
      continue;
    }
    const entityLen = entity.end - entity.start;
    const keptLen = clash.end - clash.start;
    if (entityLen > keptLen) {
      deduped[deduped.indexOf(clash)] = entity;
    }
  }
  return deduped;
}

// Merge `from` into `into` (mutates `into`): union of gazetteer entries,
// patterns, and suppressions with summed counters. Used when a session
// learned corrections before the vault was unlocked.
export function mergeAdaptiveStores(into, from) {
  if (!into) return from || createAdaptiveStore();
  if (!from) return into;
  for (const [key, entry] of Object.entries(from.gazetteer || {})) {
    if (!entry || typeof entry !== "object") continue;
    const existing = into.gazetteer[key];
    if (existing) {
      existing.hits += Number(entry.hits) || 0;
      existing.misses += Number(entry.misses) || 0;
      existing.label = entry.label || existing.label;
      existing.lastSeen = Math.max(existing.lastSeen || 0, Number(entry.lastSeen) || 0);
    } else {
      into.gazetteer[key] = { ...entry };
    }
  }
  for (const pattern of from.patterns || []) {
    if (!pattern || typeof pattern !== "object") continue;
    const existing = into.patterns.find((candidate) =>
      candidate.source === pattern.source && candidate.label === pattern.label);
    if (existing) {
      existing.hits += Number(pattern.hits) || 0;
      existing.misses += Number(pattern.misses) || 0;
      existing.enabled = existing.enabled !== false && pattern.enabled !== false;
    } else {
      into.patterns.push({ ...pattern });
    }
  }
  for (const suppression of from.suppressions || []) {
    if (!suppression || typeof suppression !== "object") continue;
    const exists = into.suppressions.some((candidate) =>
      candidate.text === suppression.text && candidate.label === suppression.label);
    if (!exists) into.suppressions.push({ ...suppression });
  }
  for (const key of ["correctionsSeen", "accepted", "rejected", "added"]) {
    into.stats[key] = (Number(into.stats[key]) || 0) + (Number(from.stats?.[key]) || 0);
  }
  return into;
}

// A pattern that keeps missing gets disabled automatically.
export function auditPatterns(store) {
  if (!store) return store;
  for (const pattern of store.patterns || []) {
    const trials = (pattern.hits || 0) + (pattern.misses || 0);
    if (trials >= 5 && pattern.hits / trials < 0.5) {
      pattern.enabled = false;
    }
  }
  return store;
}
