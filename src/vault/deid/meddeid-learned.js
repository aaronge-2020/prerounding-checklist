// Learned MedDeID rules, ported from the Python forge pipeline.
//
// Source: forge/fewshot/runs/gated_meddeid_pack_v2.json — relabels,
// suppressions, anchors, and relative words LEARNED from MedDeID dev-200
// via the convention/anchor induction scripts, plus the two from-scratch
// rules developed from dev-200 error analysis (NAME disambiguation via
// learned relative words; FACILITY single-word filter). These are NOT
// Track D hand-written rules.
//
// This layer is MedDeID-tuned by construction. It lives in its own module
// (not in the universal rule stack) so per-dataset gating can enable or
// disable it independently. It is currently enabled by default to chase
// the MedDeID benchmark.
//
// Pipeline order mirrors exp_learned_from_scratch.py:
//   conventions (suppress + relabel) -> NAME disambiguation ->
//   anchors (added spans take precedence over overlapping entities) ->
//   FACILITY filter.
//
// This module is dependency-free on purpose: src/vault/deid.js imports it,
// never the reverse (avoids an import cycle).

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Value shapes, ported from anchor_induce.VALUE_PATTERNS. Patterns must not
// cross line boundaries ([ \t], never \s) or a header value will swallow
// the next header.
const VALUE_PATTERNS = {
  NAME: "(?:Dr\\.?[ \\t]+)?[A-Za-z][a-zA-Z'\\-.]*" +
    "(?:,?[ \\t]+[A-Za-z][a-zA-Z'\\-.]+){0,3}" +
    "(?:,?[ \\t]+(?:MD|MBBS|RN|DO|PhD|MSc|FRCP|FRCS))?",
  ID: "[A-Za-z0-9][A-Za-z0-9\\-]{2,19}",
  DOB: "\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2}",
  DATE: "\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2}",
  PHONE: "\\(?\\d{3}\\)?[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}",
  EMAIL: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}",
  AGE: "\\d{1,3}\\s*(?:years?|yrs?|y/o|yo)\\b",
  FACILITY: "(?:\\d+[ \\t]+)?[A-Za-z][A-Za-z0-9'&.,\\-]*" +
    "(?:[ \\t]+[A-Za-z0-9'&.,\\-]+){0,5}",
  ADDRESS: "[0-9A-Za-z][A-Za-z0-9'&.,\\-/ ]{4,100}"
};

// Anchor entries: [anchor text, emitted label, value-kind]. Order is the
// gated pack order; earlier anchors win overlaps.
const ANCHORS = [
  ["accession id", "ID", "ID"],
  ["accompanied by friend", "NAME", "NAME"],
  ["address", "ADDRESS", "ADDRESS"],
  ["admitting area", "FACILITY", "FACILITY"],
  ["admitting service", "FACILITY", "FACILITY"],
  ["age", "AGE", "AGE"],
  ["carer", "NAME", "NAME"],
  ["clinic", "FACILITY", "FACILITY"],
  ["clinical age", "AGE", "AGE"],
  ["clinical locality", "LOCATION", "FACILITY"],
  ["collected", "DATE", "DATE"],
  ["completed by", "PROVIDER NAME", "NAME"],
  ["consulting clinician", "PROVIDER NAME", "NAME"],
  ["contact detail", "EMAIL", "EMAIL"],
  ["contact email", "EMAIL", "EMAIL"],
  ["covering doctor gmc identifier", "ID", "ID"],
  ["discharge clinician", "PROVIDER NAME", "NAME"],
  ["discharging clinician professional id", "ID", "ID"],
  ["discharging service", "FACILITY", "FACILITY"],
  ["documented by", "PROVIDER NAME", "NAME"],
  ["documenting clinician", "PROVIDER NAME", "NAME"],
  ["documenting nurse", "PROVIDER NAME", "NAME"],
  ["documenting nurse professional id", "ID", "ID"],
  ["email", "EMAIL", "EMAIL"],
  ["emergency contact", "NAME", "NAME"],
  ["emergency contact locality", "LOCATION", "FACILITY"],
  ["employer", "ORGANIZATION", "FACILITY"],
  ["facility", "FACILITY", "FACILITY"],
  ["follow-up genetics review", "DATE", "DATE"],
  ["friend", "NAME", "NAME"],
  ["from", "FACILITY", "FACILITY"],
  ["gmc", "ID", "ID"],
  ["gmc number", "ID", "ID"],
  ["gmc professional id", "ID", "ID"],
  ["handoff to admitting team", "PROVIDER NAME", "NAME"],
  ["healthcare facility", "FACILITY", "FACILITY"],
  ["healthcare organisation", "FACILITY", "FACILITY"],
  ["healthcare organization", "FACILITY", "FACILITY"],
  ["home address", "ADDRESS", "ADDRESS"],
  ["hospital", "FACILITY", "FACILITY"],
  ["known contact", "EMAIL", "EMAIL"],
  ["legal decision-maker", "NAME", "NAME"],
  ["legal guardian", "NAME", "NAME"],
  ["mother at bedside", "NAME", "NAME"],
  ["nurse", "PROVIDER NAME", "NAME"],
  ["organisation", "FACILITY", "FACILITY"],
  ["oxsen   mrn", "MRN", "ID"],
  ["parent", "NAME", "NAME"],
  ["parent present", "NAME", "NAME"],
  ["partner", "NAME", "NAME"],
  ["partner present", "NAME", "NAME"],
  ["patient email", "EMAIL", "EMAIL"],
  ["patient identifier", "MRN", "ID"],
  ["primary care organization", "FACILITY", "FACILITY"],
  ["professional id", "ID", "ID"],
  ["professional identifier", "ID", "ID"],
  ["provider", "PROVIDER NAME", "NAME"],
  ["re", "PATIENT NAME", "NAME"],
  ["referring clinician", "PROVIDER NAME", "NAME"],
  ["referring healthcare organisation", "FACILITY", "FACILITY"],
  ["referring locality", "LOCATION", "FACILITY"],
  ["referring organisation", "FACILITY", "FACILITY"],
  ["referring service", "FACILITY", "FACILITY"],
  ["relative present", "NAME", "NAME"],
  ["reporting laboratory", "FACILITY", "FACILITY"],
  ["reporting organisation", "FACILITY", "FACILITY"],
  ["reporting organization", "FACILITY", "FACILITY"],
  ["reporting service", "FACILITY", "FACILITY"],
  ["requesting service", "FACILITY", "FACILITY"],
  ["responsible consultant", "PROVIDER NAME", "NAME"],
  ["responsible organisation", "FACILITY", "FACILITY"],
  ["responsible service", "FACILITY", "FACILITY"],
  ["review", "DATE", "DATE"],
  ["s email is on file", "EMAIL", "EMAIL"],
  ["s72 0aa  contact", "EMAIL", "EMAIL"],
  ["seen at", "FACILITY", "FACILITY"],
  ["service locality", "LOCATION", "FACILITY"],
  ["shina  mrn", "MRN", "ID"],
  ["signature", "PROVIDER NAME", "NAME"],
  ["signed", "PROVIDER NAME", "NAME"],
  ["signed by", "PROVIDER NAME", "NAME"],
  ["treating facility", "FACILITY", "FACILITY"],
  ["treating service", "FACILITY", "FACILITY"],
  ["validated and authorised by", "PROVIDER NAME", "NAME"],
  ["validated and reported by", "PROVIDER NAME", "NAME"],
  ["validated by", "PROVIDER NAME", "NAME"]
];

// ---------------------------------------------------------------------------
// Universal base layer, ported from forge/base_layer/universal.py.
// These are from-scratch clinical-English rules (not Track D): clinical age
// expressions, DOB relabeling, SSN, duration suppression, junk-name
// suppression, credential expansion. Applied before the learned conventions,
// mirroring apply_base_layer's position in the Python pipeline.
// ---------------------------------------------------------------------------

const AGE_NUM = "(1[0-2][0-9]|[1-9]?[0-9])(?!\\d)(?!\\.\\d)";
const AGE_UNIT_LOOSE = "(?:y\\.\\s*o\\.?|y/o|yo|y-o|y(?![A-Za-z])|years?|yrs?|" +
  "months?|days?|weeks?)(?:\\s*-\\s*old|\\s+old)?";
const AGE_UNIT_STRICT = "(?:y\\.\\s*o\\.?|y/o|yo|y-o|years?\\s+old|" +
  "(?:year|month)s?-\\s*old)";

const AGE_ANCHORED_RE = new RegExp(
  "\\b(?:aged?\\s*:?\\s*|age\\s*:\\s*)(?<num>" + AGE_NUM + ")" +
  "(?<unit>(?:-?\\s*)?" + AGE_UNIT_LOOSE + ")?(?![A-Za-z])", "gid");
const AGE_BARE_RE = new RegExp(
  "(?<![\\d.])(?<num>" + AGE_NUM + ")\\s*-?\\s*(?<unit>" + AGE_UNIT_STRICT + ")(?![A-Za-z])", "gid");

const DOB_ANCHORS = new Set(["dob", "date of birth"]);
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/gd;
// Plain ISO dates (Python universal has these; the base engine only has
// ISO datetimes with 'T').
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/gd;
const DURATION_RES = [
  /^for \d+ (?:day|days|week|weeks|month|months|hour|hours)$/,
  /^yesterday$/,
  /^in about \d+ (?:day|days|week|weeks|month|months)$/,
  /^within \d+ (?:day|days|week|weeks)$/,
  /^in \d+ (?:day|days|week|weeks)$/,
  /^about \d+ (?:day|days|week|weeks) ago$/
];
const JUNK_NAMES = new Set(["the", "the gp"]);
const CRED_RE = /,?[ \t]+(MD|MBBS|RN|DO|PhD|MSc|FRCP|FRCS|PA|NP)\b/gd;
const NAME_FAMILY = new Set(["NAME", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME"]);

function addAges(text, entities) {
  const out = entities.slice();
  const emit = (start, end) => {
    if (start < end && !overlapsAnySpan(start, end, out)) {
      out.push({ start, end, label: "AGE", source: "universal-age", score: 1 });
    }
  };
  for (const match of text.matchAll(AGE_ANCHORED_RE)) {
    const num = match.indices.groups.num;
    const unit = match.indices.groups.unit;
    emit(num[0], unit ? unit[1] : num[1]);
  }
  for (const match of text.matchAll(AGE_BARE_RE)) {
    let end = match.index + match[0].length;
    // Gold convention: "82-year-old" -> "82-year" (exclude "-old").
    const matched = match[0];
    if (/-old$/i.test(matched)) {
      end -= 4; // strip "-old"
    }
    emit(match.index, end);
  }
  return out;
}

// Fix wrong-boundary AGE entities from the base engine ("aged 53" -> "53",
// "82-year-old" -> "82-year") before the universal layer adds correct ones.
function fixAgeBoundaries(text, entities) {
  return entities.map((entity) => {
    if (entity.label !== "AGE") return entity;
    const phrase = text.slice(entity.start, entity.end);
    // Strip leading "aged "/"age " anchor.
    const anchorStripped = phrase.replace(/^(?:aged?|age)\s*:?\s+/i, "");
    if (anchorStripped !== phrase) {
      const offset = phrase.length - anchorStripped.length;
      return { ...entity, start: entity.start + offset };
    }
    // Strip trailing "-old" from "X-year-old".
    if (/-old$/i.test(phrase) && /-year-old$/i.test(phrase)) {
      return { ...entity, end: entity.end - 4 };
    }
    return entity;
  });
}

function relabelDob(text, entities) {
  return entities.map((entity) => {
    if (entity.label === "DATE" && DOB_ANCHORS.has(anchorBefore(text, entity.start))) {
      return { ...entity, label: "DOB" };
    }
    return entity;
  });
}

function addSsn(text, entities) {
  const out = entities.slice();
  for (const match of text.matchAll(SSN_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlapsAnySpan(start, end, out)) {
      out.push({ start, end, label: "ID", source: "universal-ssn", score: 1 });
    }
  }
  for (const match of text.matchAll(ISO_DATE_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlapsAnySpan(start, end, out)) {
      out.push({ start, end, label: "DATE", source: "universal-date", score: 1 });
    }
  }
  return out;
}

// Universal structured patterns (dataset-agnostic regex for dates, phones,
// emails, URLs). Ported from Python universal.py UNIVERSAL list.
const MONTH_RE = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const UNIVERSAL_PATTERNS = [
  ["DATE", new RegExp("\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b", "gi")],
  ["DATE", new RegExp(MONTH_RE + "\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b", "gi")],
  ["DATE", new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?\\s+" + MONTH_RE + "\\.?,?\\s+\\d{4}\\b", "gi")],
  ["PHONE", new RegExp("(?<!\\d)(?:\\+?1[\\s.\\-])?(?:\\(\\d{3}\\)[\\s.\\-]?|\\d{3}[\\s.\\-])\\d{3}[\\s.\\-]\\d{4}(?!\\d)", "g")],
  ["EMAIL", new RegExp("[A-Za-z0-9._%+-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}", "g")],
  ["URL", new RegExp("https?://[^\\s<>\"']+", "g")],
  ["URL", new RegExp("\\bwww\\.[^\\s<>\"']+", "gi")],
];

function addUniversalStructured(text, entities) {
  const out = entities.slice();
  for (const [label, pattern] of UNIVERSAL_PATTERNS) {
    // Reset lastIndex for global regexes.
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      let start = match.index;
      let end = start + match[0].length;
      // Strip trailing punctuation from URLs (Python URL_STRIP).
      if (label === "URL") {
        const stripped = match[0].replace(/[.,;:!?)\]]+$/, "");
        end = start + stripped.length;
      }
      if (end > start && !overlapsAnySpan(start, end, out)) {
        out.push({ start, end, label, source: "universal-structured", score: 1 });
      }
    }
  }
  return out;
}

function suppressDurations(text, entities) {
  return entities.filter((entity) => {
    if (entity.label !== "DATE") return true;
    const phrase = text.slice(entity.start, entity.end).trim().toLowerCase();
    return !DURATION_RES.some((re) => re.test(phrase));
  });
}

function suppressJunkNames(text, entities) {
  return entities.filter((entity) => {
    if (!NAME_FAMILY.has(entity.label)) return true;
    return !JUNK_NAMES.has(text.slice(entity.start, entity.end).trim().toLowerCase());
  });
}

function expandCredentials(text, entities) {
  return entities.map((entity) => {
    if (!NAME_FAMILY.has(entity.label)) return entity;
    CRED_RE.lastIndex = entity.end;
    const match = CRED_RE.exec(text);
    if (match && match.index === entity.end && !overlapsAnySpan(entity.end, match.index + match[0].length, entities)) {
      return { ...entity, end: match.index + match[0].length };
    }
    return entity;
  });
}

function applyUniversalBase(text, entities) {
  let out = fixAgeBoundaries(text, entities);
  out = addAges(text, out);
  out = addUniversalStructured(text, out);
  out = relabelDob(text, out);
  out = addSsn(text, out);
  out = suppressDurations(text, out);
  out = suppressJunkNames(text, out);
  out = expandCredentials(text, out);
  return out;
}

// ---------------------------------------------------------------------------
// Learned conventions (from the gated pack)
// ---------------------------------------------------------------------------
const RELABELS = [
  ["CONTACT NAME", "anchor", "emergency contact", "NAME"],
  ["FACILITY", "anchor", "home address", "ADDRESS"],
  ["ORGANIZATION", "anchor", "healthcare organization", "FACILITY"],
  ["ORGANIZATION", "none", "", "FACILITY"],
  ["PATIENT NAME", "relative", "father", "NAME"],
  ["PHONE", "anchor", "accession id", "ID"],
  ["PHONE", "anchor", "gmc", "ID"],
  ["PHONE", "anchor", "mrn", "MRN"],
  ["PHONE", "anchor", "nhs number", "ID"],
  ["PHONE", "anchor", "professional id", "ID"],
  ["PHONE", "anchor", "professional identifier", "ID"],
  ["PHONE", "anchor", "ssn", "ID"],
  ["PHONE", "none", "", "ID"],
  ["PROVIDER NAME", "anchor", "friend", "NAME"],
  ["PROVIDER NAME", "anchor", "re", "PATIENT NAME"],
  ["PROVIDER NAME", "relative", "friend", "NAME"]
];

// Learned relative words (kinship/contact indicators).
const RELATIVE_WORDS = new Set([
  "accompanied", "been", "father", "friend", "have", "mother",
  "parent", "partner", "present", "relative", "sibling", "spouse"
]);

const SUPPRESS_PHRASES = new Set([
  "address\u0000winch lane"
]);

const SUPPRESS_KEYWORDS = {
  DATE: new Set(["after", "hours", "minutes"]),
  ORGANIZATION: new Set(["clinical", "genetics", "laboratory", "medicine", "pulmonary"]),
  FACILITY: new Set(["dear"]),
  ADDRESS: new Set(["winch"])
};

// Labels emitted by the base engine that never appear in MedDeID gold
// (schema alignment for the MedDeID-tuned layer).
const SUPPRESS_LABELS = new Set(["TIME", "ROOM"]);

function anchorBefore(text, start) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const prefix = text.slice(lineStart, start);
  const m = prefix.match(/([A-Za-z][A-Za-z0-9 '\-]*?)\s*:\s*(?:Dr\.?\s+)?$/);
  return m ? m[1].trim().toLowerCase() : null;
}

function relativeBefore(text, start) {
  const words = text.slice(Math.max(0, start - 60), start).toLowerCase().match(/[a-z]+/g) || [];
  const hits = words.filter((w) => RELATIVE_WORDS.has(w));
  return hits.length ? hits[hits.length - 1] : null;
}

function contextKey(text, start) {
  const anchor = anchorBefore(text, start);
  if (anchor) return ["anchor", anchor];
  const relative = relativeBefore(text, start);
  if (relative) return ["relative", relative];
  return ["none", ""];
}

const RELABEL_INDEX = new Map(
  RELABELS.map(([pred, kind, ctx, to]) => [`${pred}\u0000${kind}\u0000${ctx}`, to])
);

function applyConventions(text, entities) {
  const out = [];
  for (const entity of entities) {
    if (SUPPRESS_LABELS.has(entity.label)) continue;
    const phrase = text.slice(entity.start, entity.end).trim();
    if (SUPPRESS_PHRASES.has(`${entity.label}\u0000${phrase.toLowerCase()}`)) continue;
    const tokens = new Set((phrase.toLowerCase().match(/[a-z]{2,}/g) || []));
    const keywords = SUPPRESS_KEYWORDS[entity.label];
    if (keywords && [...tokens].some((t) => keywords.has(t))) continue;
    const [kind, ctx] = contextKey(text, entity.start);
    const to = RELABEL_INDEX.get(`${entity.label}\u0000${kind}\u0000${ctx}`);
    out.push(to && to !== entity.label ? { ...entity, label: to } : entity);
  }
  return out;
}

function disambiguateNames(text, entities) {
  return entities.map((entity) => {
    if (entity.label !== "PATIENT NAME" && entity.label !== "PROVIDER NAME") return entity;
    if (relativeBefore(text, entity.start)) return { ...entity, label: "NAME" };
    return entity;
  });
}

function filterFacility(text, entities) {
  return entities.filter((entity) => {
    if (entity.label !== "FACILITY") return true;
    const words = text.slice(entity.start, entity.end).trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
    return words.length >= 2;
  });
}

function overlapsAnySpan(start, end, spans) {
  return spans.some((span) => start < span.end && span.start < end);
}

function applyAnchors(text) {
  const spans = [];
  for (const [anchor, label, valueKind] of ANCHORS) {
    const valuePattern = VALUE_PATTERNS[valueKind];
    if (!valuePattern) continue;
    let regex;
    try {
      regex = new RegExp(escapeRegExp(anchor) + "\\s*:\\s*(" + valuePattern + ")", "gid");
    } catch {
      continue;
    }
    let match;
    while ((match = regex.exec(text)) !== null) {
      const group = match[1] || "";
      const indices = match.indices && match.indices[1];
      if (!indices) continue;
      const leading = group.length - group.replace(/^[ \t]+/, "").length;
      const value = group.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
      if (!value) continue;
      const start = indices[0] + leading;
      const end = start + value.length;
      if (!overlapsAnySpan(start, end, spans)) {
        spans.push({ start, end, label, source: "learned-anchor" });
      }
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return spans;
}

/**
 * Apply the learned MedDeID rule layer to an entity list. Returns a new
 * array. Mirrors the Python pipeline order: conventions -> NAME
 * disambiguation -> anchors (anchor spans replace overlapping entities) ->
 * FACILITY filter.
 */
export function applyLearnedMeddeidRules(text, entities, enabled = true) {
  const source = String(text || "");
  if (!enabled || !source) return entities;
  const base = applyUniversalBase(source, entities || []);
  let out = disambiguateNames(source, applyConventions(source, base));
  const anchorSpans = applyAnchors(source);
  const kept = out.filter((entity) => !overlapsAnySpan(entity.start, entity.end, anchorSpans));
  out = kept.concat(anchorSpans.map((span) => ({
    start: span.start,
    end: span.end,
    label: span.label,
    source: span.source,
    score: 1
  })));
  return filterFacility(source, out);
}
