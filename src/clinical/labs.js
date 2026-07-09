const currentYear = new Date().getFullYear();

const panelOrder = ["BMP", "CMP", "CBC", "Glucose", "A1c"];

export const labNormalizationDictionary = Object.freeze([
  { canonical: "sodium", displayName: "Sodium", aliases: ["sodium", "na"], panels: ["BMP", "CMP"] },
  { canonical: "potassium", displayName: "Potassium", aliases: ["potassium", "k"], panels: ["BMP", "CMP"] },
  { canonical: "chloride", displayName: "Chloride", aliases: ["chloride", "cl"], panels: ["BMP", "CMP"] },
  { canonical: "co2", displayName: "CO2", aliases: ["co2", "bicarbonate", "bicarb", "hco3", "carbon dioxide"], panels: ["BMP", "CMP"] },
  { canonical: "bun", displayName: "BUN", aliases: ["bun", "urea nitrogen", "blood urea nitrogen"], panels: ["BMP", "CMP"] },
  { canonical: "creatinine", displayName: "Creatinine", aliases: ["creatinine", "cr", "scr"], panels: ["BMP", "CMP"] },
  { canonical: "glucose", displayName: "Glucose", aliases: ["glucose", "glu", "blood glucose", "serum glucose"], panels: ["BMP", "CMP", "Glucose"] },
  { canonical: "calcium", displayName: "Calcium", aliases: ["calcium", "ca"], panels: ["BMP", "CMP"] },
  { canonical: "albumin", displayName: "Albumin", aliases: ["albumin", "alb"], panels: ["CMP"] },
  { canonical: "protein", displayName: "Total protein", aliases: ["total protein", "protein"], panels: ["CMP"] },
  { canonical: "ast", displayName: "AST", aliases: ["ast", "sgot"], panels: ["CMP"] },
  { canonical: "alt", displayName: "ALT", aliases: ["alt", "sgpt"], panels: ["CMP"] },
  { canonical: "alk_phos", displayName: "Alk phos", aliases: ["alk phos", "alkaline phosphatase", "alp"], panels: ["CMP"] },
  { canonical: "bilirubin", displayName: "Bilirubin", aliases: ["bilirubin", "total bilirubin", "t bili", "tbili"], panels: ["CMP"] },
  { canonical: "wbc", displayName: "WBC", aliases: ["wbc", "white blood cell", "white blood cells"], panels: ["CBC"] },
  { canonical: "hemoglobin", displayName: "Hemoglobin", aliases: ["hemoglobin", "hgb", "hb"], panels: ["CBC"] },
  { canonical: "hematocrit", displayName: "Hematocrit", aliases: ["hematocrit", "hct"], panels: ["CBC"] },
  { canonical: "platelets", displayName: "Platelets", aliases: ["platelets", "plt", "plts"], panels: ["CBC"] },
  { canonical: "rbc", displayName: "RBC", aliases: ["rbc", "red blood cell", "red blood cells"], panels: ["CBC"] },
  { canonical: "mcv", displayName: "MCV", aliases: ["mcv"], panels: ["CBC"] },
  { canonical: "a1c", displayName: "A1c", aliases: ["a1c", "hba1c", "hb a1c", "hemoglobin a1c"], panels: ["A1c"] },
  { canonical: "magnesium", displayName: "Magnesium", aliases: ["magnesium", "mg"], panels: [] },
  { canonical: "phosphorus", displayName: "Phosphorus", aliases: ["phosphorus", "phosphate", "phos"], panels: [] },
  { canonical: "lactate", displayName: "Lactate", aliases: ["lactate", "lactic acid"], panels: [] },
  { canonical: "troponin", displayName: "Troponin", aliases: ["troponin", "trop", "troponin i", "troponin t"], panels: [] },
  { canonical: "bnp", displayName: "BNP", aliases: ["bnp", "nt-probnp", "nt pro bnp"], panels: [] },
  { canonical: "tsh", displayName: "TSH", aliases: ["tsh"], panels: [] },
  { canonical: "free_t4", displayName: "Free T4", aliases: ["free t4", "ft4"], panels: [] },
  { canonical: "inr", displayName: "INR", aliases: ["inr"], panels: [] },
  { canonical: "pt", displayName: "PT", aliases: ["pt", "protime", "prothrombin time"], panels: [] },
  { canonical: "ptt", displayName: "PTT", aliases: ["ptt", "aptt"], panels: [] },
  { canonical: "anion_gap", displayName: "Anion gap", aliases: ["anion gap", "ag"], panels: ["BMP", "CMP"] },
  { canonical: "beta_hydroxybutyrate", displayName: "Beta-hydroxybutyrate", aliases: ["beta hydroxybutyrate", "beta-hydroxybutyrate", "bhb"], panels: [] }
]);

const dictionaryByCanonical = new Map(labNormalizationDictionary.map((entry) => [entry.canonical, entry]));
const aliases = [];
labNormalizationDictionary.forEach((entry) => {
  entry.aliases.forEach((alias) => {
    aliases.push({ alias, entry, key: normalizeAlias(alias) });
  });
});
aliases.sort((left, right) => right.alias.length - left.alias.length);

const labReferenceRanges = Object.freeze({
  sodium: { low: 135, high: 145, criticalLow: 120, criticalHigh: 160, unit: "mEq/L" },
  potassium: { low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6, unit: "mEq/L" },
  chloride: { low: 96, high: 106, unit: "mEq/L" },
  co2: { low: 22, high: 29, criticalLow: 10, unit: "mEq/L" },
  bun: { low: 7, high: 20, unit: "mg/dL" },
  creatinine: { low: 0.6, high: 1.3, criticalHigh: 4, unit: "mg/dL" },
  glucose: { low: 70, high: 180, criticalLow: 54, criticalHigh: 400, unit: "mg/dL" },
  calcium: { low: 8.5, high: 10.5, criticalLow: 7, criticalHigh: 13, unit: "mg/dL" },
  albumin: { low: 3.5, high: 5.0, unit: "g/dL" },
  ast: { low: 0, high: 40, criticalHigh: 1000, unit: "U/L" },
  alt: { low: 0, high: 40, criticalHigh: 1000, unit: "U/L" },
  alk_phos: { low: 40, high: 130, unit: "U/L" },
  bilirubin: { low: 0, high: 1.2, criticalHigh: 5, unit: "mg/dL" },
  wbc: { low: 4, high: 11, criticalLow: 1, criticalHigh: 30, unit: "K/uL" },
  hemoglobin: { low: 12, high: 17.5, criticalLow: 7, criticalHigh: 20, unit: "g/dL" },
  hematocrit: { low: 36, high: 52, unit: "%" },
  platelets: { low: 150, high: 450, criticalLow: 20, criticalHigh: 1000, unit: "K/uL" },
  rbc: { low: 4.0, high: 5.9, unit: "M/uL" },
  mcv: { low: 80, high: 100, unit: "fL" },
  a1c: { low: 0, high: 5.7, criticalHigh: 10, unit: "%" },
  magnesium: { low: 1.7, high: 2.4, criticalLow: 1.2, criticalHigh: 4, unit: "mg/dL" },
  phosphorus: { low: 2.5, high: 4.5, criticalLow: 1, criticalHigh: 8, unit: "mg/dL" },
  lactate: { low: 0, high: 2, criticalHigh: 4, unit: "mmol/L" },
  inr: { low: 0.8, high: 1.2, criticalHigh: 5, unit: "" },
  anion_gap: { low: 4, high: 12, criticalHigh: 24, unit: "mEq/L" },
  beta_hydroxybutyrate: { low: 0, high: 0.5, criticalHigh: 3, unit: "mmol/L" }
});

/**
 * Parses the numeric component of a lab value while preserving leading
 * inequality direction for interpretation.
 *
 * @param {string} value
 * @returns {{ number: number, comparator: string } | null}
 */
function numericLabValue(value) {
  const match = String(value || "").trim().match(/^([<>]=?)?\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[2]);
  return Number.isFinite(number) ? { number, comparator: match[1] || "" } : null;
}

function interpretLabValue(analyte, value) {
  const range = labReferenceRanges[analyte];
  const parsed = numericLabValue(value);
  if (!range || !parsed) return null;
  const { number } = parsed;
  const criticalLow = Number.isFinite(range.criticalLow) && number <= range.criticalLow;
  const criticalHigh = Number.isFinite(range.criticalHigh) && number >= range.criticalHigh;
  const low = Number.isFinite(range.low) && number < range.low;
  const high = Number.isFinite(range.high) && number > range.high;
  if (!criticalLow && !criticalHigh && !low && !high) {
    return {
      status: "normal",
      severity: "normal",
      direction: "",
      reference: range
    };
  }
  return {
    status: criticalLow || criticalHigh ? "critical" : "abnormal",
    severity: criticalLow || criticalHigh ? "critical" : "abnormal",
    direction: criticalLow || low ? "low" : "high",
    reference: range
  };
}

const monthNameToNumber = new Map([
  ["jan", 1], ["january", 1], ["feb", 2], ["february", 2], ["mar", 3], ["march", 3],
  ["apr", 4], ["april", 4], ["may", 5], ["jun", 6], ["june", 6], ["jul", 7], ["july", 7],
  ["aug", 8], ["august", 8], ["sep", 9], ["sept", 9], ["september", 9], ["oct", 10],
  ["october", 10], ["nov", 11], ["november", 11], ["dec", 12], ["december", 12]
]);

const panelAliases = [
  { panel: "BMP", regex: /\b(?:bmp|basic metabolic panel|basic chem(?:istry)?|chem\s*7|chem\s*8|metabolic panel basic)\b/i },
  { panel: "CMP", regex: /\b(?:cmp|comprehensive metabolic panel|metabolic panel comprehensive)\b/i },
  { panel: "CBC", regex: /\b(?:cbc|complete blood count|hemogram)\b/i },
  { panel: "A1c", regex: /\b(?:a1c|hba1c|hb a1c|hemoglobin a1c)\b/i }
];
const panelAliasSource = panelAliases.map(({ regex }) => regex.source).join("|");
const timedPanelAliasSource = panelAliases
  .filter(({ panel }) => ["BMP", "CMP", "CBC"].includes(panel))
  .map(({ regex }) => regex.source)
  .join("|");

const collectionLabelRegex = /\b(?:collected|collection(?: date(?:\/time)?| time)?|specimen(?: collected)?|drawn|obtained|effective(?: date(?:\/time)?)?|observation time|sample(?: collected)?|taken)\b/i;
const resultLabelRegex = /\b(?:resulted|result(?: date(?:\/time)?| time)?|issued|final(?: result)?|received|reported|verified)\b/i;
const metadataOnlyRegex = /^\s*(?:collected|collection(?: date(?:\/time)?| time)?|specimen(?: collected)?|drawn|obtained|resulted|result(?: date(?:\/time)?| time)?|issued|final(?: result)?|received|reported|verified)\s*[:\-]/i;

function normalizeAlias(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectPanel(text) {
  const value = String(text || "");
  return panelAliases.find((candidate) => candidate.regex.test(value))?.panel || "";
}

function canonicalizeAnalyte(label) {
  const normalized = normalizeAlias(label);
  if (!normalized) {
    return null;
  }
  const exact = aliases.find((candidate) => candidate.key === normalized);
  if (exact) {
    return exact.entry;
  }
  return aliases.find((candidate) => {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegex(candidate.key)}(?:\\s|$)`, "i");
    return pattern.test(normalized);
  })?.entry || null;
}

function parseTimeValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) {
    return null;
  }

  let match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (match[3] === "PM" && hour < 12) hour += 12;
    if (match[3] === "AM" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        minutes: hour * 60 + minute,
        timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      };
    }
    return null;
  }

  match = raw.match(/^(\d{3,4})$/);
  if (!match) {
    return null;
  }
  const digits = match[1].padStart(4, "0");
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return {
      minutes: hour * 60 + minute,
      timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    };
  }
  return null;
}

function normalizeTwoDigitYear(year) {
  const value = Number(year);
  if (!Number.isFinite(value)) {
    return currentYear;
  }
  if (value >= 100) {
    return value;
  }
  const century = Math.floor(currentYear / 100) * 100;
  const candidate = century + value;
  return candidate > currentYear + 1 ? candidate - 100 : candidate;
}

function makeDateKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function dayNumber(dateKey) {
  if (!dateKey) {
    return null;
  }
  return Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86400000);
}

function dayDiff(leftDateKey, rightDateKey) {
  const left = dayNumber(leftDateKey);
  const right = dayNumber(rightDateKey);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  return left - right;
}

function formatDayLabel(diff) {
  if (!Number.isFinite(diff)) {
    return "Date unknown";
  }
  if (diff === 0) {
    return "Day 0";
  }
  return `Day ${diff > 0 ? `+${diff}` : String(diff)}`;
}

function explicitYearFromSource(text) {
  const match = String(text || "").match(/\b((?:19|20)\d{2})[-/]\d{1,2}[-/]\d{1,2}|\b\d{1,2}\/\d{1,2}\/((?:19|20)\d{2})\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+((?:19|20)\d{2})\b/i);
  return match ? Number(match[1] || match[2] || match[3]) : currentYear;
}

function buildTimestamp({ raw, year, month, day, hasExplicitYear, time }, referenceYear, inheritedDate = null) {
  const resolvedYear = year || inheritedDate?.year || referenceYear || currentYear;
  const dateKey = month && day ? makeDateKey(resolvedYear, month, day) : inheritedDate?.dateKey || "";
  const timeInfo = time ? parseTimeValue(time) : null;
  const hasDate = Boolean(dateKey);
  const hasTime = Boolean(timeInfo);
  const dateDayNumber = dayNumber(dateKey);
  return {
    raw: String(raw || "").trim(),
    dateKey,
    year: hasDate ? Number(dateKey.slice(0, 4)) : null,
    month: hasDate ? Number(dateKey.slice(5, 7)) : null,
    day: hasDate ? Number(dateKey.slice(8, 10)) : null,
    hasExplicitYear: Boolean(hasExplicitYear || inheritedDate?.hasExplicitYear),
    hasDate,
    hasTime,
    minutes: hasTime ? timeInfo.minutes : null,
    timeLabel: hasTime ? timeInfo.timeLabel : "",
    precision: hasDate && hasTime ? "datetime" : hasDate ? "date" : hasTime ? "time" : "unknown",
    sortKey: hasDate && hasTime ? dateDayNumber * 1440 + timeInfo.minutes : null,
    ambiguous: !(hasDate && hasTime),
    dayLabel: ""
  };
}

function parseTemporalText(text, { referenceYear = currentYear, inheritedDate = null, allowTimeOnly = true } = {}) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) {
    return null;
  }

  let match = value.match(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}:\d{2}(?::\d{2})?|\d{3,4}))?/);
  if (match) {
    return buildTimestamp({
      raw: match[0],
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hasExplicitYear: true,
      time: match[4]?.slice(0, 5)
    }, referenceYear, inheritedDate);
  }

  match = value.match(/\b(0?[1-9]|1[0-2])\/([0-3]?\d)(?:\/((?:19|20)?\d{2}))?(?:\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4}))?/i);
  if (match) {
    return buildTimestamp({
      raw: match[0],
      year: match[3] ? normalizeTwoDigitYear(match[3]) : null,
      month: Number(match[1]),
      day: Number(match[2]),
      hasExplicitYear: Boolean(match[3]),
      time: match[4]
    }, referenceYear, inheritedDate);
  }

  match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+((?:19|20)\d{2}))?(?:\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4}))?/i);
  if (match) {
    return buildTimestamp({
      raw: match[0],
      year: match[3] ? Number(match[3]) : null,
      month: monthNameToNumber.get(match[1].replace(/\.$/, "").toLowerCase()),
      day: Number(match[2]),
      hasExplicitYear: Boolean(match[3]),
      time: match[4]
    }, referenceYear, inheritedDate);
  }

  if (!allowTimeOnly) {
    return null;
  }

  match = value.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4})\b/i);
  if (match) {
    return buildTimestamp({
      raw: match[0],
      time: match[1]
    }, referenceYear, inheritedDate);
  }

  return null;
}

function timestampAfterLabel(line, labelRegex, referenceYear, inheritedDate) {
  const text = String(line || "");
  const match = text.match(labelRegex);
  if (!match) {
    return null;
  }
  return parseTemporalText(text.slice(match.index + match[0].length), {
    referenceYear,
    inheritedDate,
    allowTimeOnly: true
  });
}

function genericCollectionTimestamp(line, referenceYear, inheritedDate) {
  const text = String(line || "");
  if (/\b(?:19|20)\d{2}-\d{1,2}-\d{1,2}|\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b/i.test(text)) {
    return parseTemporalText(text, { referenceYear, inheritedDate, allowTimeOnly: true });
  }
  if (/^\s*(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4})\b/i.test(text) || new RegExp(`(?:${timedPanelAliasSource})\\s*(?:at\\s*)?(?:\\d{1,2}:\\d{2}\\s*(?:AM|PM)?|\\d{3,4})\\b`, "i").test(text)) {
    return parseTemporalText(text, { referenceYear, inheritedDate, allowTimeOnly: true });
  }
  return null;
}

function splitTableCells(line) {
  const value = String(line || "");
  if (value.includes("|")) {
    return value.split("|").map((cell) => cell.trim());
  }
  if (value.includes("\t")) {
    return value.split("\t").map((cell) => cell.trim());
  }
  return [];
}

function extractValueAndUnit(rawValue) {
  const clean = String(rawValue || "")
    .replace(/\s+/g, " ")
    .replace(/\b(?:high|low|normal|abnormal|final|flag)\b/gi, "")
    .trim();
  if (!clean || /^[-–—]+$/.test(clean)) {
    return null;
  }
  const match = clean.match(/([<>]?\s*\d+(?:\.\d+)?|positive|negative|present|absent|detected|not detected|trace|small|moderate|large)(?:\s*([A-Za-z%/][A-Za-z0-9%/.\-^ ]{0,20}))?/i);
  if (!match) {
    return null;
  }
  return {
    value: match[1].replace(/\s+/g, ""),
    unit: (match[2] || "").trim()
  };
}

function timestampWarnings(collectionTime, resultTime) {
  const warnings = [];
  if (!collectionTime) {
    warnings.push(resultTime ? "collection time missing; result time is not used for most-recent selection" : "collection time missing");
  } else {
    if (!collectionTime.hasDate) {
      warnings.push("collection date unknown");
    }
    if (!collectionTime.hasTime) {
      warnings.push("collection clock time missing");
    }
  }
  if (!collectionTime || collectionTime.ambiguous) {
    warnings.push("ambiguous lab time; not eligible for most-recent selection");
  }
  return [...new Set(warnings)];
}

function rowConfidence(collectionTime, value) {
  if (!value) {
    return "low";
  }
  if (collectionTime?.hasDate && collectionTime.hasTime) {
    return "high";
  }
  return "medium";
}

function createRow({ entry, value, unit, collectionTime, resultTime, sourceLine, sourceIndex, panel }) {
  const warnings = timestampWarnings(collectionTime, resultTime);
  const interpretation = interpretLabValue(entry.canonical, value);
  return {
    analyte: entry.canonical,
    displayName: entry.displayName,
    value,
    unit: unit || "",
    interpretation,
    referenceRange: interpretation?.reference || labReferenceRanges[entry.canonical] || null,
    abnormal: interpretation?.severity === "abnormal" || interpretation?.severity === "critical",
    critical: interpretation?.severity === "critical",
    collectionTime,
    resultTime,
    sourceLine: String(sourceLine || "").trim(),
    sourceIndex,
    panel: panel || (entry.canonical === "glucose" ? "Glucose" : entry.panels[0] || entry.displayName),
    confidence: rowConfidence(collectionTime, value),
    warnings
  };
}

function stripTimelineNoise(line) {
  return String(line || "")
    .replace(/\b(?:collected|collection(?: date(?:\/time)?| time)?|specimen(?: collected)?|drawn|obtained|effective(?: date(?:\/time)?)?|observation time|sample(?: collected)?|taken|resulted|result(?: date(?:\/time)?| time)?|issued|final(?: result)?|received|reported|verified)\b\s*[:\-]?\s*/gi, " ")
    .replace(/\b(?:19|20)\d{2}-\d{1,2}-\d{1,2}(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, " ")
    .replace(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])(?:\/(?:\d{2}|\d{4}))?(?:\s+(?:at\s+)?(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4}))?\b/gi, " ")
    .replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+(?:19|20)\d{2})?(?:\s+(?:at\s+)?(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4}))?\b/gi, " ")
    .replace(/^\s*(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{3,4})\b/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi, " ")
    .replace(new RegExp(timedPanelAliasSource, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasPattern() {
  return aliases.map((candidate) => escapeRegex(candidate.alias).replace(/\s+/g, "\\s+")).join("|");
}

const pairRegex = new RegExp(`(?:^|[^A-Za-z0-9])(${aliasPattern()})\\s*(?:[:=])?\\s*([<>]?\\s*\\d+(?:\\.\\d+)?|positive|negative|present|absent|detected|not\\s+detected|trace|small|moderate|large)(?:\\s*([A-Za-z%/][A-Za-z0-9%/.\\-^]{0,14}))?`, "gi");

function parseInlineRows(line, context, referenceYear, sourceIndex) {
  const panel = detectPanel(line) || context.panel || "";
  const inheritedCollectionDate = context.collectionTime?.hasDate ? context.collectionTime : null;
  const collectionTime = timestampAfterLabel(line, collectionLabelRegex, referenceYear, inheritedCollectionDate) ||
    (!resultLabelRegex.test(line) ? genericCollectionTimestamp(line, referenceYear, inheritedCollectionDate) : null) ||
    context.collectionTime ||
    null;
  const resultTime = timestampAfterLabel(line, resultLabelRegex, referenceYear, context.collectionTime || inheritedCollectionDate) ||
    context.resultTime ||
    null;
  const clean = stripTimelineNoise(line);
  const rows = [];

  for (const match of clean.matchAll(pairRegex)) {
    const entry = canonicalizeAnalyte(match[1]);
    const parsedValue = extractValueAndUnit(`${match[2]} ${match[3] || ""}`);
    if (!entry || !parsedValue) {
      continue;
    }
    rows.push(createRow({
      entry,
      value: parsedValue.value,
      unit: parsedValue.unit,
      collectionTime,
      resultTime,
      sourceLine: line,
      sourceIndex,
      panel
    }));
  }

  return rows;
}

function parseTable(lines, startIndex, context, referenceYear) {
  const headerCells = splitTableCells(lines[startIndex]);
  if (headerCells.length < 3) {
    return null;
  }

  const inheritedDate = context.collectionTime?.hasDate ? context.collectionTime : null;
  const timestampColumns = headerCells
    .map((cell, index) => ({
      index,
      timestamp: parseTemporalText(cell, { referenceYear, inheritedDate, allowTimeOnly: true })
    }))
    .filter((cell) => cell.index > 0 && cell.timestamp);

  if (!timestampColumns.length) {
    return null;
  }

  const rows = [];
  let consumed = 1;
  for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitTableCells(lines[lineIndex]);
    if (cells.length < 2) {
      break;
    }
    const entry = canonicalizeAnalyte(cells[0]);
    if (!entry) {
      if (metadataOnlyRegex.test(cells[0])) {
        consumed += 1;
        continue;
      }
      break;
    }
    const panel = detectPanel(lines[startIndex]) || context.panel || "";
    timestampColumns.forEach(({ index, timestamp }) => {
      const parsedValue = extractValueAndUnit(cells[index]);
      if (!parsedValue) {
        return;
      }
      rows.push(createRow({
        entry,
        value: parsedValue.value,
        unit: parsedValue.unit,
        collectionTime: timestamp,
        resultTime: context.resultTime || null,
        sourceLine: lines[lineIndex],
        sourceIndex: lineIndex,
        panel
      }));
    });
    consumed += 1;
  }

  return rows.length ? { rows, consumed } : null;
}

function timestampIdentity(timestamp) {
  if (!timestamp) {
    return "";
  }
  return [timestamp.dateKey, timestamp.timeLabel, timestamp.precision, timestamp.raw].join("|");
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.analyte,
      row.value,
      row.unit,
      timestampIdentity(row.collectionTime),
      timestampIdentity(row.resultTime),
      row.sourceLine
    ].join("||");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferPanels(rows) {
  const bmpMembers = new Set(["sodium", "potassium", "chloride", "co2", "bun", "creatinine", "glucose", "calcium", "anion_gap"]);
  const cmpMembers = new Set(["albumin", "protein", "ast", "alt", "alk_phos", "bilirubin"]);
  const cbcMembers = new Set(["wbc", "hemoglobin", "hematocrit", "platelets", "rbc", "mcv"]);
  const groups = new Map();

  rows.forEach((row) => {
    const key = timestampIdentity(row.collectionTime) || `source:${row.sourceIndex}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  });

  groups.forEach((group) => {
    const analytes = new Set(group.map((row) => row.analyte));
    const explicitPanel = group.find((row) => ["BMP", "CMP", "CBC"].includes(row.panel))?.panel || "";
    let inferred = explicitPanel;
    const cbcCount = [...analytes].filter((analyte) => cbcMembers.has(analyte)).length;
    const cmpCount = [...analytes].filter((analyte) => cmpMembers.has(analyte)).length;
    const bmpCount = [...analytes].filter((analyte) => bmpMembers.has(analyte)).length;
    if (!inferred && cmpCount >= 2 && bmpCount >= 3) {
      inferred = "CMP";
    } else if (!inferred && cbcCount >= 3) {
      inferred = "CBC";
    } else if (!inferred && bmpCount >= 3) {
      inferred = "BMP";
    }
    if (inferred) {
      group.forEach((row) => {
        if (row.panel !== "A1c") {
          row.panel = inferred;
        }
      });
    }
  });

  return rows;
}

function sortTimestamp(left, right) {
  if (left?.sortKey != null && right?.sortKey != null) {
    return left.sortKey - right.sortKey;
  }
  if (left?.sortKey != null) return -1;
  if (right?.sortKey != null) return 1;
  if (left?.dateKey && right?.dateKey && left.dateKey !== right.dateKey) {
    return left.dateKey.localeCompare(right.dateKey);
  }
  if (left?.minutes != null && right?.minutes != null) {
    return left.minutes - right.minutes;
  }
  return 0;
}

function sortRows(left, right) {
  const collection = sortTimestamp(left.collectionTime, right.collectionTime);
  if (collection !== 0) {
    return collection;
  }
  const result = sortTimestamp(left.resultTime, right.resultTime);
  if (result !== 0) {
    return result;
  }
  return left.sourceIndex - right.sourceIndex;
}

function anchorTimestampLabels(rows) {
  const dateKeys = rows
    .flatMap((row) => [row.collectionTime, row.resultTime])
    .filter((timestamp) => timestamp?.dateKey)
    .map((timestamp) => timestamp.dateKey)
    .sort();
  const anchorDateKey = dateKeys[dateKeys.length - 1] || "";
  rows.forEach((row) => {
    [row.collectionTime, row.resultTime].forEach((timestamp) => {
      if (!timestamp || !timestamp.dateKey) {
        return;
      }
      timestamp.dayLabel = formatDayLabel(dayDiff(timestamp.dateKey, anchorDateKey));
    });
  });
  return anchorDateKey;
}

function eventLabelForRow(row) {
  if (["BMP", "CMP", "CBC"].includes(row.panel)) {
    return row.panel;
  }
  if (row.analyte === "glucose") {
    return "Glucose";
  }
  if (row.analyte === "a1c") {
    return "A1c";
  }
  return row.displayName;
}

function buildEvents(rows) {
  const eventMap = new Map();
  rows
    .filter((row) => row.collectionTime?.sortKey != null)
    .forEach((row) => {
      const label = eventLabelForRow(row);
      const key = `${label}|${row.collectionTime.sortKey}`;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          label,
          collectionTime: row.collectionTime,
          resultTime: row.resultTime,
          rows: [],
          sourceIndex: row.sourceIndex
        });
      }
      const event = eventMap.get(key);
      event.rows.push(row);
      event.sourceIndex = Math.min(event.sourceIndex, row.sourceIndex);
    });

  return [...eventMap.values()].sort((left, right) => (
    sortTimestamp(left.collectionTime, right.collectionTime) ||
    panelOrder.indexOf(left.label) - panelOrder.indexOf(right.label) ||
    left.label.localeCompare(right.label) ||
    left.sourceIndex - right.sourceIndex
  ));
}

function latestEventsByLabel(events) {
  const byLabel = new Map();
  events.forEach((event) => {
    if (!byLabel.has(event.label)) {
      byLabel.set(event.label, []);
    }
    byLabel.get(event.label).push(event);
  });
  return [...byLabel.entries()].map(([label, labelEvents]) => ({
    label,
    events: labelEvents,
    latest: labelEvents[labelEvents.length - 1]
  })).sort((left, right) => {
    const leftIndex = panelOrder.includes(left.label) ? panelOrder.indexOf(left.label) : 999;
    const rightIndex = panelOrder.includes(right.label) ? panelOrder.indexOf(right.label) : 999;
    return leftIndex - rightIndex || left.label.localeCompare(right.label);
  });
}

function ambiguousRows(rows) {
  return rows.filter((row) => row.warnings.length);
}

function abnormalRows(rows) {
  return rows.filter((row) => row.abnormal || row.critical);
}

function labFlagForRow(row) {
  const direction = row.interpretation?.direction || "";
  const severity = row.critical ? "critical" : "abnormal";
  const reference = row.referenceRange
    ? `${row.referenceRange.low ?? ""}-${row.referenceRange.high ?? ""}${row.referenceRange.unit ? ` ${row.referenceRange.unit}` : ""}`.replace(/^-|-\s*$/g, "")
    : "";
  return {
    analyte: row.displayName,
    value: row.value,
    unit: row.unit,
    direction,
    severity,
    time: row.collectionTime,
    sourceLine: row.sourceLine,
    text: `${row.displayName} ${row.value}${row.unit ? ` ${row.unit}` : ""} is ${severity}${direction ? ` ${direction}` : ""}${reference ? ` (reference ${reference})` : ""}`
  };
}

function updateContextFromLine(line, context, referenceYear) {
  const detectedPanel = detectPanel(line);
  if (detectedPanel && !parseInlineRows(line, { ...context, panel: detectedPanel }, referenceYear, 0).length) {
    context.panel = detectedPanel;
  }
  if (!metadataOnlyRegex.test(line)) {
    return;
  }
  const collectionTime = timestampAfterLabel(line, collectionLabelRegex, referenceYear, context.collectionTime);
  const resultTime = timestampAfterLabel(line, resultLabelRegex, referenceYear, context.collectionTime);
  if (collectionTime) {
    context.collectionTime = collectionTime;
  }
  if (resultTime) {
    context.resultTime = resultTime;
  }
}

export function parseLabTimeline(sourceText) {
  const text = String(sourceText || "");
  const referenceYear = explicitYearFromSource(text);
  const lines = text.split(/\r?\n/);
  const context = {
    collectionTime: null,
    resultTime: null,
    panel: ""
  };
  const parsedRows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      context.panel = "";
      context.collectionTime = null;
      context.resultTime = null;
      continue;
    }

    const table = parseTable(lines, index, context, referenceYear);
    if (table) {
      parsedRows.push(...table.rows);
      index += table.consumed - 1;
      continue;
    }

    updateContextFromLine(line, context, referenceYear);
    if (metadataOnlyRegex.test(line) && !canonicalizeAnalyte(line)) {
      continue;
    }
    parsedRows.push(...parseInlineRows(line, context, referenceYear, index));
  }

  const rows = dedupeRows(inferPanels(parsedRows)).sort(sortRows);
  const anchorDateKey = anchorTimestampLabels(rows);
  const events = buildEvents(rows);
  const ambiguous = ambiguousRows(rows);
  const abnormal = abnormalRows(rows);
  const warnings = ambiguous.map((row) => ({
    analyte: row.displayName,
    panel: row.panel,
    sourceLine: row.sourceLine,
    warnings: row.warnings
  }));

  return {
    rows,
    events,
    ambiguousRows: ambiguous,
    latestByLabel: latestEventsByLabel(events),
    warnings,
    abnormalFlags: abnormal.map(labFlagForRow),
    criticalFlags: abnormal.filter((row) => row.critical).map(labFlagForRow),
    anchorDateKey,
    hasLabs: rows.length > 0
  };
}

function formatTimestampForPreview(timestamp) {
  if (!timestamp) {
    return "Date unknown";
  }
  if (timestamp.hasDate && timestamp.hasTime) {
    return `${timestamp.dayLabel || "Day 0"} ${timestamp.timeLabel}`;
  }
  if (timestamp.hasDate) {
    return `${timestamp.dayLabel || "Day 0"} time unknown`;
  }
  if (timestamp.hasTime) {
    return `Date unknown ${timestamp.timeLabel}`;
  }
  return "Date unknown";
}

function formatTimestampForPrompt(timestamp) {
  if (!timestamp) {
    return "date/time unknown";
  }
  if (timestamp.hasDate && timestamp.hasTime) {
    return `${timestamp.timeLabel} on ${timestamp.dayLabel || "Day 0"}`;
  }
  if (timestamp.hasDate) {
    return `${timestamp.dayLabel || "Day 0"}, time unknown`;
  }
  if (timestamp.hasTime) {
    return `${timestamp.timeLabel}, date unknown`;
  }
  return "date/time unknown";
}

function rowValueLabel(row) {
  return `${row.displayName}${row.value ? ` ${row.value}${row.unit ? ` ${row.unit}` : ""}` : ""}`;
}

export function formatLabTimelinePreview(timeline) {
  if (!timeline?.hasLabs) {
    return {
      summary: "No structured labs detected.",
      items: [],
      warnings: []
    };
  }

  const items = timeline.events.map((event) => ({
    label: event.label,
    time: formatTimestampForPreview(event.collectionTime),
    text: `${formatTimestampForPreview(event.collectionTime)}: ${event.label}`,
    warning: false
  }));

  const warnings = timeline.ambiguousRows.slice(0, 12).map((row) => ({
    label: row.displayName,
    time: formatTimestampForPreview(row.collectionTime),
    text: `${formatTimestampForPreview(row.collectionTime)}: ${rowValueLabel(row)} - ${row.warnings[0]}`,
    warning: true
  }));
  const abnormalWarnings = (timeline.abnormalFlags || []).slice(0, 12).map((flag) => ({
    label: flag.analyte,
    time: formatTimestampForPreview(flag.time),
    text: `${formatTimestampForPreview(flag.time)}: ${flag.text}`,
    warning: true,
    severity: flag.severity
  }));

  return {
    summary: `${timeline.rows.length} lab row${timeline.rows.length === 1 ? "" : "s"} parsed; ${timeline.events.length} timed event${timeline.events.length === 1 ? "" : "s"}`,
    items,
    warnings: [...abnormalWarnings, ...warnings]
  };
}

export function formatLabChronologyPromptBlock(timeline) {
  if (!timeline?.hasLabs) {
    return "";
  }

  const lines = [
    "<lab_chronology>",
    "Deterministic lab chronology generated by the app before prompting.",
    "Rule: Use collection/specimen/observation time for lab recency; use result/issued time only as a tie-breaker. Do not infer recency from source order."
  ];

  if (!timeline.events.length) {
    lines.push("No lab rows had a determinate collection date and clock time; do not call any lab most recent based on source order.");
  }

  timeline.latestByLabel.forEach(({ label, events, latest }) => {
    const orderedTimes = events.map((event) => formatTimestampForPrompt(event.collectionTime));
    if (orderedTimes.length > 1) {
      lines.push(`${label} timeline: ${orderedTimes.join(" -> ")}.`);
    }
    const earlierSameDay = events
      .filter((event) => event !== latest && event.collectionTime?.dateKey === latest.collectionTime?.dateKey)
      .map((event) => formatTimestampForPrompt(event.collectionTime));
    lines.push(`Most recent ${label} by collection time: ${formatTimestampForPrompt(latest.collectionTime)}.`);
    if (earlierSameDay.length) {
      lines.push(`Earlier same-day ${label}: ${earlierSameDay.join(", ")}.`);
    }
  });

  if (timeline.ambiguousRows.length) {
    lines.push("Ambiguous lab timing; do not use these rows for most-recent selection:");
    timeline.ambiguousRows.slice(0, 12).forEach((row) => {
      lines.push(`- ${rowValueLabel(row)}: ${row.warnings.join("; ")}.`);
    });
    if (timeline.ambiguousRows.length > 12) {
      lines.push(`- ${timeline.ambiguousRows.length - 12} additional ambiguous lab row(s) omitted from this chronology block.`);
    }
  }

  if (timeline.abnormalFlags?.length) {
    lines.push("Automated lab range screen; verify against local reference ranges and clinical context:");
    timeline.abnormalFlags.slice(0, 12).forEach((flag) => {
      lines.push(`- ${flag.text} at ${formatTimestampForPrompt(flag.time)}.`);
    });
  }

  lines.push("</lab_chronology>");
  return lines.join("\n");
}
