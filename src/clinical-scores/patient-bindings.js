// Auto-pull bindings: resolve calculator inputs from the selected patient's
// saved data. Pure module: no DOM, no storage writes, no network.
//
// Sources, in order:
//   1. Saved vitals / labs tables, parsed through the same canonical parser the
//      Review UI uses (clinicalDisplayModelFromPromptText) so bindings only see
//      what the app itself can already render as structured vitals/labs.
//   2. Conservative regex extraction from narrative text (HPI) for age, EGA and
//      LMP, which on a labor & delivery service live in the history, not tables.
//
// Every binding carries a `source` label naming where the value came from so
// the UI can show "from patient" honestly. Anything not found stays manual.

import { listScoreDefinitions } from "./index.js";
import { listAiModelDefinitions } from "../ai-models/index.js";
import { clinicalDisplayModelFromPromptText } from "../patient-context/structured-clinical-data.js";

function cleanText(value) {
  return String(value || "").replace(/\r/g, "");
}

function dayLabel(day) {
  return day?.label || (day?.date ? `Hospital day ${day.date}` : "Selected day");
}

function selectedDay(patient, selectedDayId) {
  const days = [...(patient?.days || [])].sort((left, right) =>
    `${left.date || ""} ${left.createdAt || ""}`.localeCompare(`${right.date || ""} ${right.createdAt || ""}`)
  );
  if (!selectedDayId || selectedDayId === "__admission__") return days.at(-1) || null;
  return days.find((day) => day.id === selectedDayId) || days.at(-1) || null;
}

// Admission sections plus the selected day's captures, as { sourceKind, text, label }.
export function collectScoreSourceTexts(patient, selectedDayId) {
  const sources = [];
  for (const section of patient?.contextSections || []) {
    const text = cleanText(section?.deidentifiedText);
    if (!text.trim()) continue;
    sources.push({
      sourceKind: section?.sourceKind || "",
      text,
      label: `Admission \u2014 ${section?.label || section?.sourceKind || "field"}`
    });
  }
  const day = selectedDay(patient, selectedDayId);
  if (day) {
    for (const capture of day?.sourceCaptures || []) {
      const text = cleanText(capture?.deidentifiedText);
      if (!text.trim()) continue;
      sources.push({
        sourceKind: capture?.sourceKind || "",
        text,
        label: `${dayLabel(day)} \u2014 ${capture?.label || capture?.sourceKind || "field"}`
      });
    }
  }
  return sources;
}

function normalizeName(value) {
  return cleanText(value).toLowerCase();
}

// Latest numeric value for a vital whose name matches any matcher regex.
// Returns { value, unit, source } or null.
export function latestVitalValue(sources, matchers) {
  const candidates = [];
  for (const source of sources) {
    // Canonical path: only sources saved as vitals parse as vitals, exactly
    // like the Review UI renders them.
    if (!source.sourceKind || source.sourceKind === "vital_signs") {
      let model = null;
      try {
        model = clinicalDisplayModelFromPromptText("vital_signs", source.text);
      } catch {
        model = null;
      }
      const series = model?.series || [];
      for (const entry of series) {
        if (!matchers.some((matcher) => matcher.test(normalizeName(entry.name)))) continue;
        const points = [...(entry.points || [])].filter((point) => Number.isFinite(point.value));
        if (!points.length) continue;
        const latest = points[points.length - 1];
        candidates.push({ value: latest.value, unit: cleanText(latest.unit || entry.unit), source: source.label });
      }
    }
    // Fallback: plain "Weight 70 kg" / "Height: 165 cm" style fragments in the
    // raw text (height is not a canonical saved vital name, so it usually
    // only appears this way).
    for (const line of source.text.split("\n")) {
      const pattern = /(weight|wt|height|ht)\b\s*[:\-]?\s*([\d.]+)\s*(kg|kgs|lb|lbs|cm|in|inch|inches)\b/gi;
      let match;
      while ((match = pattern.exec(line))) {
        const name = match[1].toLowerCase();
        const isWeight = name === "weight" || name === "wt";
        const isHeight = name === "height" || name === "ht";
        const wanted = matchers.some((matcher) =>
          matcher.test(isWeight ? "weight" : isHeight ? "height" : name)
        );
        if (!wanted) continue;
        const value = Number(match[2]);
        if (!Number.isFinite(value)) continue;
        candidates.push({ value, unit: (match[3] || "").toLowerCase(), source: source.label });
      }
    }
  }
  return candidates.at(-1) || null;
}

function toKilograms(value, unit) {
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("lb")) return value * 0.45359237;
  return value;
}

function toCentimeters(value, unit) {
  const u = String(unit || "").toLowerCase();
  if (u === "in" || u.startsWith("inch")) return value * 2.54;
  return value;
}

function toCelsius(value, unit) {
  const u = String(unit || "").toLowerCase();
  if (u.includes("f")) return ((value - 32) * 5) / 9;
  if (u.includes("c")) return value;
  // Unmarked temperature: refuse to guess (matches the review UI, which
  // flags unmarked temps instead of fabricating a unit). The caller leaves
  // the field manual.
  return null;
}

// Conservative age extraction from narrative text ("28-year-old", "28F", "Age: 28").
export function parseAgeYears(text) {
  const source = cleanText(text);
  const patterns = [
    /(\d{1,3})\s*-\s*year\s*-\s*old/i,
    /(\d{1,3})\s+years?\s+old/i,
    /(\d{1,3})\s*(?:yo|y\.o\.)\b/i,
    /age\s*[:\-]\s*(\d{1,3})\b/i,
    /\b(\d{2})\s*[FM]\b/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const age = Number(match[1]);
    if (Number.isFinite(age) && age >= 10 && age <= 110) return age;
  }
  return null;
}

// EGA extraction ("39w2d", "39 2/7", "EGA: 34w1d").
export function parseEgaParts(text) {
  const source = cleanText(text);
  let match = /(\d{1,2})\s*w\s*(\d)\s*d/i.exec(source);
  if (match) return { weeks: Number(match[1]), days: Number(match[2]) };
  match = /\b(\d{1,2})\s+(\d)\s*\/\s*7\b/.exec(source);
  if (match) return { weeks: Number(match[1]), days: Number(match[2]) };
  match = /(?:ega|gestational age)\s*[:\-]?\s*(\d{1,2})\s*(?:weeks?|w)\b/i.exec(source);
  if (match) return { weeks: Number(match[1]), days: 0 };
  return null;
}

// LMP extraction ("LMP 1/15/26", "LMP: 01-15-2026") -> ISO date.
export function parseLmpISO(text) {
  const source = cleanText(text);
  const match = /\blmp\b\s*[:\-]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i.exec(source);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function firstTextHit(sources, parser) {
  for (const source of sources) {
    const value = parser(source.text);
    if (value !== null && value !== undefined) return { value, source: source.label };
  }
  return null;
}

// Conservative sex extraction from narrative text ("Sex: Male",
// "74 year old man", "58F"). Returns "male"/"female" or null.
export function parseSex(text) {
  const source = cleanText(text);
  const patterns = [
    /\bsex\s*[:=\-]\s*(female|male|woman|man)\b/i,
    /(\d{1,3})\s*-\s*year\s*-\s*old\s+(woman|man|female|male)\b/i,
    /(\d{1,3})\s+years?\s+old\s+(woman|man|female|male)\b/i,
    /\b(\d{2,3})\s*([FfMm])\b/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const token = (match[match.length - 1] || "").toLowerCase();
    if (token === "f" || token === "female" || token === "woman") return "female";
    if (token === "m" || token === "male" || token === "man") return "male";
  }
  return null;
}

// Split a labs result cell like "18 mg/dL", "<0.1", or "18" (with a
// separate unit cell) into { value, unit }. The canonical labs parser
// leaves plain "18 mg/dL" as one cell, so the unit is read from
// whichever cell carries it. Returns null for non-numeric results
// like "pending" or "positive".
function parseLabResultCell(resultCell, unitCell) {
  const match = resultCell.match(/^(?:[<>]=?\s*)?([-+]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s+(.+))?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: cleanText(unitCell || match[2] || "") };
}

// Latest numeric value for a lab whose name matches any matcher regex,
// parsed through the same canonical labs parser the Review UI uses.
// Optional `exclude` regexes skip contexts like "Urine" for serum sodium.
// Returns { value, unit, source } or null.
export function latestLabValue(sources, matchers, exclude = []) {
  const candidates = [];
  for (const source of sources) {
    if (source.sourceKind && source.sourceKind !== "laboratory_results") continue;
    let model = null;
    try {
      model = clinicalDisplayModelFromPromptText("laboratory_results", source.text);
    } catch {
      model = null;
    }
    for (const group of model?.groups || []) {
      for (const row of group?.rows || []) {
        const cells = row?.cells || [];
        const name = cleanText(cells[0] || "");
        if (!name) continue;
        if (!matchers.some((matcher) => matcher.test(normalizeName(name)))) continue;
        if (exclude.some((matcher) => matcher.test(name))) continue;
        const parsed = parseLabResultCell(cleanText(cells[1] || ""), cleanText(cells[2] || ""));
        if (!parsed) continue;
        candidates.push({ value: parsed.value, unit: parsed.unit, source: source.label });
      }
    }
  }
  return candidates.at(-1) || null;
}

// Derive a yes/no radio value (1/0) from a numeric pull, e.g. derive "gt19"
// means value > 19 ? 1 : 0. Supports gt/gte/lt/lte thresholds.
function deriveThreshold(pull, value) {
  const match = /^([gl]te?)(\d+(?:\.\d+)?)$/.exec(pull.derive || "");
  if (!match || !Number.isFinite(value)) return null;
  const threshold = Number(match[2]);
  const op = match[1];
  const passes =
    op === "gt" ? value > threshold :
    op === "gte" ? value >= threshold :
    op === "lt" ? value < threshold :
    value <= threshold;
  return passes ? 1 : 0;
}

function resolvePull(pull, sources) {
  if (!pull) return null;
  if (pull.kind === "demographic" && pull.field === "ageYears") {
    const hit = firstTextHit(sources, parseAgeYears);
    if (!hit) return null;
    if (pull.derive === "lt40") return { value: hit.value < 40 ? 2 : 0, source: hit.source };
    const derived = pull.derive ? deriveThreshold(pull, hit.value) : null;
    if (derived !== null) return { value: derived, source: hit.source };
    return { value: hit.value, source: hit.source };
  }
  if (pull.kind === "demographic" && pull.field === "sex") {
    const hit = firstTextHit(sources, parseSex);
    if (!hit) return null;
    const value = pull.valueMap ? pull.valueMap[hit.value] : hit.value;
    if (value === undefined || value === null) return null;
    return { value, source: hit.source };
  }
  if (pull.kind === "lab") {
    const hit = latestLabValue(sources, pull.match || [], pull.exclude || []);
    if (!hit) return null;
    const derived = pull.derive ? deriveThreshold(pull, hit.value) : null;
    if (derived !== null) return { value: derived, source: hit.source };
    return { value: hit.value, unit: hit.unit, source: hit.source };
  }
  if (pull.kind === "vital") {
    const hit = latestVitalValue(sources, pull.match || []);
    if (!hit) return null;
    const prefer = (pull.preferUnit || "").toLowerCase();
    let { value, unit } = hit;
    if (prefer === "kg") {
      value = toKilograms(value, unit);
      unit = "kg";
    } else if (prefer === "cm") {
      value = toCentimeters(value, unit);
      unit = "cm";
    } else if (prefer === "°c") {
      const converted = toCelsius(value, unit);
      if (converted === null) return null;
      value = converted;
      unit = "°C";
    }
    return { value: Math.round(value * 10) / 10, unit, source: hit.source };
  }
  if (pull.kind === "text" && pull.field === "lmpISO") {
    const hit = firstTextHit(sources, parseLmpISO);
    return hit ? { value: hit.value, source: hit.source } : null;
  }
  if (pull.kind === "text" && (pull.field === "egaWeeks" || pull.field === "egaDays")) {
    const hit = firstTextHit(sources, parseEgaParts);
    if (!hit) return null;
    return {
      value: pull.field === "egaWeeks" ? hit.value.weeks : hit.value.days,
      source: hit.source
    };
  }
  return null;
}

// { [scoreId]: { [inputKey]: { value, unit?, source } } }
// Covers both MDCalc calculators and native AI models.
export function resolveScoreBindings(patient, selectedDayId) {
  const sources = collectScoreSourceTexts(patient, selectedDayId);
  const bindings = {};
  for (const definition of [...listScoreDefinitions(), ...listAiModelDefinitions()]) {
    const scoreBindings = {};
    for (const input of definition.inputs || []) {
      if (!input.pull) continue;
      // Mode-gated pulls (e.g. the due-dates date field) resolve here; the
      // controller only applies them when the matching mode is active.
      const resolved = resolvePull(input.pull, sources);
      if (resolved) scoreBindings[input.key] = resolved;
    }
    if (Object.keys(scoreBindings).length) bindings[definition.id] = scoreBindings;
  }
  return bindings;
}
