// Pure extraction of structured clinical data from parsed primary-team note
// sections (H&P / progress notes).
//
// The note parser (primary-team-note-parser.js) splits a pasted note into
// narrative sections for the draft composer. This module goes one step
// further: it pulls the structured elements embedded in those sections —
// home medications, examination vitals, narrative labs, and diagnostic
// studies — and emits them in the app's canonical prompt-text formats
// ("Medications", "Vitals", "Labs") so the exact same parsers that handle
// pasted Epic/CPRS exports turn them into review-index candidates.
//
// Nothing here touches the DOM or storage; it is pure text in, text out.

const EM_DASH = "—";

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function linesOf(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function stripBullet(line) {
  return clean(line).replace(/^(?:[-*•>▪]|\d{1,2}[.)])\s+/, "");
}

const NO_MEDS = /^(?:none|no\s+(?:known\s+)?(?:home\s+)?med(?:ication)?s|no\s+meds|denies|n\/?a\b|not\s+(?:currently\s+)?(?:on|taking)|nkda\b)/i;
const SENTENCE_SUBJECT = /^(?:wife|husband|patient|family|he|she|they|note|pharmacy|nursing|mother|father|daughter|son)\b/i;
// MAR annotation labels ("PRN Reasons: Nausea,Vomiting") are metadata, never
// medications. Blood-product orders are not medications either.
export const MED_METADATA_LABEL = /^(?:PRN Reasons?|PRN Comment|Weight Dosing Info)\s*:/i;
export const TRANSFUSION_ORDER = /^\s*transfus(?:e|ion)\b/i;
// Vital-sign goals ("SBP goal <=130 mmHg") are targets, never medications.
const VITAL_GOAL_LINE = /\b(?:sbp|dbp|map|bp|hr|rr|spo2|fio2|temp(?:erature)?)\s+goals?\b/i;
// Section headings ("Medications:", "Inpatient orders:") that leak into the
// medication section text.
export const MED_LIST_HEADING = /^(?:(?:home|inpatient|outpatient|active|current)\s+)?(?:medications?|meds?|rx|prescriptions?|orders)(?:\s+list)?\s*[:—–-]\s*$/i;

// True for lines that are never medications (metadata labels, headings,
// transfusion orders) so list parsers can drop them before parsing.
export function isNonMedicationLine(rawLine) {
  const stripped = stripBullet(rawLine);
  return MED_METADATA_LABEL.test(stripped) || MED_LIST_HEADING.test(stripped) || TRANSFUSION_ORDER.test(stripped) || VITAL_GOAL_LINE.test(stripped);
}

function looksLikeSentence(line) {
  return SENTENCE_SUBJECT.test(line) || /assists with|manages (?:his|her|their) medications/i.test(line);
}

// Splits "Xarelto, dose unknown" into a name and detail text. The emitted
// canonical line is `Name — details`, which savedMedicationDisplay parses.
export function splitMedicationLine(rawLine) {
  let line = stripBullet(rawLine);
  if (!line || NO_MEDS.test(line) || isNonMedicationLine(rawLine) || looksLikeSentence(line)) return null;
  // "She takes Lexapro", "He is on lisinopril": strip the verb phrase so the
  // drug name leads.
  line = line.replace(/^(?:(?:she|he|they|the patient|patient|pt)\s+)?(?:takes?|taking|is\s+(?:on|taking))\s+/i, "");
  if (!line) return null;
  let name = line;
  let details = "";
  const separator = line.match(/^(.*?)[,;:—–-]\s+(.+)$/);
  if (separator && separator[1].trim().length >= 2) {
    name = separator[1].trim();
    details = separator[2].trim();
  } else {
    // Insulin-style carb ratios: "Insulin lispro 1:10 carb ratio with meals"
    // The ":" is not followed by whitespace so the separator above misses it.
    const ratioSeparator = line.match(/^(.*?)\s+(\d+\s*:\s*\d+.*)$/);
    if (ratioSeparator && ratioSeparator[1].trim().length >= 2) {
      name = ratioSeparator[1].trim();
      details = ratioSeparator[2].trim();
    } else {
      // A dose that belongs to a PRN condition ("phosphorus <= 2.5 mg/dL")
      // must not split the medication name from its sig: skip dose matches
      // preceded by a comparator and split at the medication's own dose.
      const doseFinder = new RegExp(DOSE_PATTERN.source, "gi");
      let doseAt = -1;
      let doseMatch;
      while ((doseMatch = doseFinder.exec(line))) {
        if (COMPARATOR_BEFORE.test(line.slice(0, doseMatch.index))) continue;
        doseAt = doseMatch.index;
        break;
      }
      if (doseAt > 2) {
        name = line.slice(0, doseAt).trim();
        details = line.slice(doseAt).trim();
      }
    }
  }
  name = clean(name).replace(/\s+/g, " ").replace(/[.—–-\s]+$/, "");
  if (name.length < 2 || name.length > 60) return null;
  // A "name" that is really a sentence fragment is not a medication.
  if (/^(the|this|that|with|and|for|from|a|an|but)\b/i.test(name)) return null;
  if (name.split(" ").length > 6 && !details) return null;
  details = clean(details).replace(/[.]+$/g, "");
  return { name, details };
}

// Merges comma/semicolon fragments that continue the previous medication
// ("Xarelto, dose unknown" is one med, not two). A fragment is only a
// continuation when it is sig-like (a schedule keyword or an abbreviated sig
// with periods, e.g. "q.a.m."); a lowercase drug name ("metformin",
// "folic acid") is its own medication and is never glued onto the prior.
const INLINE_MED_LABEL = /^(?:home\s+)?(?:medications?|meds?|rx|prescriptions?)(?:\s+list)?\s*[:—–-]\s*/i;
const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|mmol|meq|units?|u|%|ml|tablets?|capsules?|puffs?)\b/i;
const COMPARATOR_BEFORE = /(?:<=|>=|<|>|≤|≥)\s*$/;
const CONTINUATION_KEYWORDS = /^(?:dose|unknown|daily|bid|tid|qid|qhs|qday|prn|mg|mcg|g|ml|units?|po|iv|im|sc|sq|sl|as directed|extended|sustained|twice|once|thrice|every)\b/i;

function splitInlineMedList(text) {
  const stripped = clean(text)
    .replace(INLINE_MED_LABEL, "")
    // "Listed in the chart and include Coumadin, Lasix, ...": the drug list
    // starts after the intro clause.
    .replace(/^.*?\bincludes?\b\s*/i, "")
    .replace(/^.*?\bincluding\b\s*/i, "");
  const fragments = stripped.split(/[;\n]+/).flatMap((part) => part.split(/,(?!\s*\d)/)).map(clean).filter(Boolean);
  const merged = [];
  for (let fragment of fragments) {
    fragment = fragment.replace(/^and\s+/i, "").trim();
    if (!fragment) continue;
    if (CONTINUATION_KEYWORDS.test(fragment) && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${fragment}`;
      continue;
    }
    // "Claritin and Zyrtec p.r.n.", "lisinopril 10 mg daily and metoprolol
    // 25 mg BID": each side is its own drug. A part starting with a digit
    // ("1 at night") is a sig fragment, not a new drug, so it never splits.
    const andParts = fragment.split(/\s+and\s+/i).map(clean).filter(Boolean);
    if (
      andParts.length > 1 &&
      andParts.every((part) => !/^\d/.test(part)) &&
      andParts.some((part) => DOSE_PATTERN.test(part) || /^[A-Z]/.test(part))
    ) {
      merged.push(...andParts);
      continue;
    }
    // A fragment that is ONLY an abbreviated sig ("p.r.n.", "q.a.m.") continues
    // the prior med instead of becoming a medication of its own. A fragment
    // carrying a drug name ("potassium chloride p.r.n.", "vitamin K.") is its
    // own medication and is never glued onto the prior.
    if (merged.length && /^(?:[a-z]+\.){2,}[a-z]*\.?$/i.test(fragment) && !DOSE_PATTERN.test(fragment)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${fragment}`;
      continue;
    }
    merged.push(fragment);
  }
  return merged;
}

export function extractNoteMedications(medicationsText) {
  const lines = linesOf(medicationsText);
  if (!lines.length) return "";
  if (lines.length === 1 && NO_MEDS.test(stripBullet(lines[0]))) return "";
  // MAR annotations, pasted section headings, and blood-product orders are
  // never medications; drop them before parsing so they cannot glue onto a
  // neighboring drug line.
  const contentLines = lines.filter((line) => !isNonMedicationLine(line));
  if (!contentLines.length) return "";
  const hasBullets = contentLines.some((line) => /^(?:[-*•>▪]|\d{1,2}[.)])\s+/.test(line));
  // An unbulleted list whose every physical line parses as a medication is a
  // plain med list ("Lisinopril 10 mg PO daily\nMetoprolol 25 mg PO BID"):
  // parse lines independently so distinct same-name orders (bolus vs
  // infusion) survive. Dictated prose falls back to sentence splitting.
  const independent = !hasBullets && contentLines.length >= 2
    ? contentLines.map((line) => splitMedicationLine(line))
    : null;
  let rawLines;
  if (independent && independent.every(Boolean)) {
    rawLines = independent;
  } else if (hasBullets) {
    rawLines = contentLines.map((line) => splitMedicationLine(line));
  } else {
    // Dictated prose packs several sentences into one "line"; split sentences
    // first so "Claritin and Zyrtec p.r.n." never inherits the prior sentence.
    rawLines = contentLines
      .join(" ")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .flatMap((sentence) => splitInlineMedList(sentence))
      .map((fragment) => splitMedicationLine(fragment));
  }
  const meds = [];
  for (const parsed of rawLines) {
    if (!parsed) continue;
    // Same-name orders with different sigs (inpatient bolus vs infusion) are
    // distinct administrations; only exact name+sig duplicates collapse.
    const duplicate = meds.some((med) =>
      med.name.toLowerCase() === parsed.name.toLowerCase() &&
      med.details.toLowerCase() === parsed.details.toLowerCase());
    if (!duplicate) meds.push(parsed);
  }
  if (!meds.length) return "";
  return ["Medications", ...meds.map((med) => (med.details ? `${med.name} ${EM_DASH} ${med.details}` : med.name))].join("\n");
}

// Words that may sit between a vital keyword and its value in dictated prose
// ("temperature over the past 24 hours was 36.5", "pulse of 99", "BP:
// 142/88"). The connector never crosses a sentence boundary, so "Her
// temperature is normal. BP 120/80" does not leak the BP value into the
// temperature.
const VITAL_CONNECTOR = String.raw`(?:\s*[.:]\s*|\s+(?:[a-z0-9]+\s+){0,7}?(?:of|is|was|were|at)\s+|\s+)`;
const vitalPattern = (keyword, value) => new RegExp(`\\b(?:${keyword})\\b${VITAL_CONNECTOR}(${value})`, "i");

const VITAL_PATTERNS = [
  { name: "BP", regex: vitalPattern(String.raw`B\/?P|blood pressure`, String.raw`\d{2,3}\s*\/\s*\d{2,3}`), format: (m) => m[1].replace(/\s+/g, "") },
  { name: "SBP", regex: /\bSBP\b\s*(\d{2,3})\b/i, format: (m) => m[1] },
  { name: "DBP", regex: /\bDBP\b\s*(\d{2,3})\b/i, format: (m) => m[1] },
  { name: "MAP", regex: /\bMAP\b\s*\(?(?:cuff)?\)?\s*(\d{2,3})\b/i, format: (m) => m[1] },
  {
    name: "HR",
    regex: vitalPattern(String.raw`HR|heart rate|pulse|P`, String.raw`\d{2,3}(?:\s*(?:to|-)\s*\d{2,3})?`),
    format: (m) => m[1].replace(/\s*(?:to|-)\s*/i, "-")
  },
  {
    name: "Temp",
    // Group 1: keyword ("T" vs "Temp"/"Temperature"), group 2: value,
    // group 3: explicit scale. An unmarked temperature keeps its raw value
    // with no unit so the loader flags it unitUnmarked and the review UI
    // requires an explicit student confirmation instead of silently
    // assuming Fahrenheit.
    regex: new RegExp(`\\b(T(?:emp(?:erature)?)?)${VITAL_CONNECTOR}(\\d{2,3}(?:\\.\\d)?)\\s*°?\\s*([CF])?`, "i"),
    validate: (m) => {
      // A bare "T" with no unit is only a temperature when the value is in a
      // plausible human range in either scale ("T 12 lead EKG" is not a
      // temperature). Spelled-out keywords are unambiguous.
      if (/^t$/i.test(m[1]) && !m[3]) {
        const value = Number(m[2]);
        return (value >= 30 && value <= 45) || (value >= 90 && value <= 115);
      }
      return true;
    },
    format: (m) => {
      const scale = (m[3] || "").toUpperCase();
      const value = Number(m[2]);
      if (scale === "F") return `${Math.round((((value - 32) * 5) / 9) * 10) / 10} °C`;
      if (scale === "C") return `${value} °C`;
      return `${value}`;
    }
  },
  { name: "RR", regex: vitalPattern(String.raw`respiratory rate|RR|R|Resp(?:irations?|\.|atory)?`, String.raw`\d{1,2}`), format: (m) => m[1] },
  {
    name: "SpO2",
    regex: new RegExp(
      `\\b(?:SpO2?|O2\\s*sat(?:uration)?|saturation)\\b${VITAL_CONNECTOR}(\\d{2,3})\\s*%?` +
      `|\\b(\\d{2,3})\\s*%\\s+on\\s+(?:\\d+(?:\\.\\d+)?\\s*L(?:\\s*(?:via|by)\\s+)?(?:nasal\\s+cannula)?|room\\s+air|RA\\b|nasal\\s+cannula|oxygen\\b)`,
      "i"
    ),
    format: (m) => m[1] || m[2]
  },
  {
    name: "Weight",
    regex: vitalPattern(String.raw`Wt|Weight|weighs`, String.raw`\d+(?:\.\d+)?\s*(?:pounds?|lbs?|kilos?|kgs?)`),
    format: (m) => {
      const parts = m[1].match(/^(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kilos?|kgs?)$/i);
      if (!parts) return m[1];
      const value = Number(parts[1]);
      const unit = parts[2].toLowerCase();
      // The review UI labels Weight in kg, so convert pounds at the boundary.
      if (unit.startsWith("pound") || unit === "lb" || unit === "lbs") {
        return `${Math.round(value * 0.45359237 * 10) / 10}`;
      }
      return `${value}`;
    }
  },
  { name: "Pain", regex: vitalPattern(String.raw`Pain`, String.raw`(\d{1,2})\s*\/\s*10`), format: (m) => m[2] }
];

export function extractNoteVitals(...sectionTexts) {
  const text = sectionTexts.filter(Boolean).join("\n");
  if (!text) return "";
  const found = new Map();
  for (const { name, regex, format, validate } of VITAL_PATTERNS) {
    if (found.has(name)) continue;
    const match = text.match(regex);
    if (match && (!validate || validate(match))) found.set(name, format(match));
  }
  if (!found.size) return "";
  return ["Vitals", [...found.entries()].map(([name, value]) => `${name} ${value}`).join("; ")].join("\n");
}

// Narrative lab values ("Labs: WBC 12.3, Hgb 9.1, Na 140") keyed by a small
// dictionary of common analytes. Only lines that are clearly lab lines are
// scanned, so single-letter symbols never match prose.
const NARRATIVE_ANALYTES = [
  ["wbc|white blood cells?|white count|wbc count", "WBC", "K/uL"],
  ["hgb|hb|hemoglobin", "Hemoglobin", "g/dL"],
  ["hct|hematocrit", "Hematocrit", "%"],
  ["plt|plts|platelets?", "Platelets", "K/uL"],
  ["na|sodium", "Sodium", "mmol/L"],
  ["k|potassium", "Potassium", "mmol/L"],
  ["cl|chloride", "Chloride", "mmol/L"],
  ["co2|bicarb|bicarbonate|hco3", "Bicarbonate", "mmol/L"],
  ["bun", "BUN", "mg/dL"],
  ["creatinine|cr", "Creatinine", "mg/dL"],
  ["glucose|glu|blood sugar", "Glucose", "mg/dL"],
  ["mg|magnesium", "Magnesium", "mg/dL"],
  ["phos|phosphorus|phosphate", "Phosphorus", "mg/dL"],
  ["ionized calcium|ca|calcium", "Calcium", "mg/dL"],
  ["alb|albumin", "Albumin", "g/dL"],
  ["total protein", "Total protein", "g/dL"],
  ["tbili|total bilirubin|bili", "Total bilirubin", "mg/dL"],
  ["ast", "AST", "U/L"],
  ["alt", "ALT", "U/L"],
  ["alk phos|alk-phos|alkphos|alkaline phosphatase", "Alkaline phosphatase", "U/L"],
  ["gfr|egfr|glomerular filtration rate", "GFR", "mL/min/1.73m²"],
  ["ammonia", "Ammonia", ""],
  ["inr", "INR", ""],
  ["lactate|lactic acid", "Lactate", "mmol/L"],
  ["ph", "pH", ""],
  ["pco2", "pCO2", "mmHg"],
  ["po2", "pO2", "mmHg"],
  ["base excess", "Base excess", "mmol/L"],
  ["bnp", "BNP", "pg/mL"],
  ["troponin|trop|hs-trop", "Troponin", "ng/mL"],
  ["crp", "CRP", "mg/L"],
  ["esr", "ESR", "mm/hr"],
  ["a1c|hgba1c|hemoglobin a1c", "HbA1c", "%"],
  ["microalbumin|urine microalbumin", "Microalbumin", ""],
  ["hdl cholesterol|hdl", "HDL", "mg/dL"],
  ["ldl cholesterol|ldl", "LDL", "mg/dL"],
  ["cholesterol", "Cholesterol", "mg/dL"],
  ["lipase", "Lipase", "U/L"],
  ["triglycerides|trig", "Triglycerides", "mg/dL"],
  ["psa", "PSA", "ng/mL"],
  ["ana", "ANA", ""],
  ["dsdna", "dsDNA", ""],
  ["c3", "C3", "mg/dL"],
  ["c4", "C4", "mg/dL"],
  ["b12|vitamin b12|cobalamin", "Vitamin B12", "pg/mL"],
  ["tsh|thyroid stimulating hormone", "TSH", "uIU/mL"]
];

const LAB_LINE = /^\s*(?:labs?|laboratory|chem(?:istry)?|cbc|bmp|cmp|abg|vbg|renal|hepatic)\b\s*[:—–-]?\s*/i;
// Non-numeric placeholder values a narrative lab line may carry. "rpt" rows
// flow into the reports-to-review section and "pending" rows into the pending
// section of the review sheet via the canonical lab parser.
const PLACEHOLDER_VALUE_SOURCE = "(?:rpt(?:\\s*\\(ip\\))?|pending|in\\s+process)";

// Words allowed between an analyte name and its value in dictated prose
// ("calcium was slightly low at 7.8", "white blood cell count is 5.3").
const LAB_FILLER = String.raw`(?:[a-z]+\s+){0,8}?`;
// Leading minus for genuinely negative results (base excess -4.2).
const LAB_VALUE_SOURCE = String.raw`(-?\d[\d,]*(?::\d+)?(?:\.\d+)?)(\s*\((H|L|HH|LL)\))?`;

const ANALYTE_UNIT_BY_NAME = new Map(NARRATIVE_ANALYTES.map(([, canonical, unit]) => [canonical, unit]));

function resolveAnalyteName(name) {
  const clean = String(name || "").trim();
  if (!clean) return "";
  for (const [aliases, canonical] of NARRATIVE_ANALYTES) {
    if (new RegExp(`^(?:${aliases})$`, "i").test(clean)) return canonical;
  }
  return "";
}

// All analyte mentions in a clause, longest match winning at overlaps so
// "HDL cholesterol" resolves to HDL instead of matching "HDL" and then
// "cholesterol" separately.
function findAnalyteMentions(clause) {
  const raw = [];
  for (const [aliases, canonical] of NARRATIVE_ANALYTES) {
    const re = new RegExp(`\\b(?:${aliases})\\b`, "gi");
    let m;
    while ((m = re.exec(clause))) {
      raw.push({ start: m.index, end: m.index + m[0].length, canonical, length: m[0].length });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.length - a.length);
  const mentions = [];
  let lastEnd = -1;
  for (const r of raw) {
    if (r.start < lastEnd) continue;
    mentions.push(r);
    lastEnd = r.end;
  }
  return mentions;
}

function normLabNumber(raw, unit) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (text.includes(":")) return text; // titers like 1:640
  const num = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  // Counts written out ("platelets 126,000") are per microliter; the K/uL
  // unit needs them scaled.
  if (unit === "K/uL" && num >= 1000) return String(Math.round((num / 1000) * 100) / 100);
  return String(num);
}

function parseLabValueSegment(segment) {
  const m = segment.match(new RegExp(`^\\s*:?\\s*${LAB_FILLER}${LAB_VALUE_SOURCE}`, "i"));
  if (!m) return null;
  const flagText = (m[3] || "").toUpperCase();
  return { value: m[1], flag: flagText.startsWith("H") ? "H" : flagText.startsWith("L") ? "L" : "" };
}

function parseLabQualitativeSegment(segment) {
  const m = segment.match(new RegExp(`^\\s*:?\\s*${LAB_FILLER}(positive|negative|pos|neg)\\b`, "i"));
  if (!m) return null;
  return { value: /^pos/i.test(m[1]) ? "positive" : "negative" };
}

function parseLabPlaceholderSegment(segment) {
  const m = segment.match(new RegExp(`^\\s*:?\\s*${LAB_FILLER}(${PLACEHOLDER_VALUE_SOURCE})\\b`, "i"));
  if (!m) return null;
  return { value: m[1].toLowerCase() };
}

// Paired values ("BUN and creatinine 26.8/1.2", "BUN/creatinine 26.8/1.2",
// "H&H 9.7/28.2") are claimed before general parsing so the first value can
// never attach to the wrong analyte.
function extractPairedLabValues(body, claim) {
  body = body.replace(/\bH\s*[&/]\s*H\b\s*(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/gi, (m, hgb, hct) => {
    claim("Hemoglobin", hgb);
    claim("Hematocrit", hct);
    return " ";
  });
  body = body.replace(
    /\b([a-z][a-z. ]*?)\s*(?:and|\/)\s*([a-z][a-z. ]*?)\s+(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/gi,
    (m, nameA, nameB, valA, valB) => {
      const a = resolveAnalyteName(nameA);
      const b = resolveAnalyteName(nameB);
      if (a && b && a !== b) {
        claim(a, valA);
        claim(b, valB);
        return " ";
      }
      return m;
    }
  );
  return body;
}

function parseNarrativeLabLine(line) {
  let body = clean(line).replace(LAB_LINE, "");
  if (!body || /^(?:pending|not (?:done|available)|none|n\/a)\b/i.test(body)) return [];
  // Dates ("from 01/08/09 is 9") must not be mistaken for lab values: strip
  // MM/DD/YY and MM-DD-YY patterns before value extraction.
  body = body.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ").replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, " ");
  const results = [];
  const used = new Set();
  const claim = (canonical, rawValue, flag = "") => {
    if (!canonical || used.has(canonical)) return;
    const unit = ANALYTE_UNIT_BY_NAME.get(canonical) || "";
    const value = normLabNumber(rawValue, unit);
    if (value == null) return;
    used.add(canonical);
    results.push({ name: canonical, value, unit, flag });
  };
  const claimText = (canonical, value) => {
    if (!canonical || used.has(canonical)) return;
    used.add(canonical);
    results.push({ name: canonical, value, unit: "", flag: "" });
  };

  body = extractPairedLabValues(body, claim);

  // Split into clauses so a value never attaches to the wrong analyte
  // ("sodium was normal and potassium was 4.0").
  const clauses = body.split(/\s*(?:;|\band\b|\bwith\b)\s*/i);
  for (const clause of clauses) {
    const mentions = findAnalyteMentions(clause);
    for (let i = 0; i < mentions.length; i++) {
      const { canonical, end } = mentions[i];
      if (used.has(canonical)) continue;
      const nextStart = i + 1 < mentions.length ? mentions[i + 1].start : clause.length;
      const segment = clause.slice(end, nextStart);
      const numeric = parseLabValueSegment(segment);
      if (numeric) {
        claim(canonical, numeric.value, numeric.flag);
        continue;
      }
      const qualitative = parseLabQualitativeSegment(segment);
      if (qualitative) {
        claimText(canonical, qualitative.value);
        continue;
      }
      const placeholder = parseLabPlaceholderSegment(segment);
      if (placeholder) claimText(canonical, placeholder.value);
    }
  }
  return results;
}

export function extractNoteLabs(...sectionTexts) {
  const rows = [];
  for (const sectionText of sectionTexts) {
    for (const rawLine of linesOf(sectionText)) {
      // Strip markdown bold/italic and list bullets: "**Labs: ..." or "- Labs: ..."
      let line = rawLine.replace(/^(\*\*|__|\*|_|[-•>])\s*/, "");
      // Dictated "STUDIES:" lines sometimes carry prose labs ("STUDIES: His
      // white blood cell count is 8.4..."); scan them as lab lines.
      if (/^\s*studies\s*:/i.test(line) && !LAB_LINE.test(line)) {
        line = line.replace(/^\s*studies\s*:\s*/i, "Labs: ");
      }
      if (!LAB_LINE.test(line)) continue;
      rows.push(...parseNarrativeLabLine(line));
    }
  }
  if (!rows.length) return "";
  const seen = new Set();
  const unique = rows.filter((row) => {
    if (seen.has(row.name)) return false;
    seen.add(row.name);
    return true;
  });
  return [
    "Labs",
    ...unique.map((row) => `${row.name}: ${row.value}${row.unit ? ` ${row.unit}` : ""}${row.flag ? `; flag ${row.flag}` : ""}`)
  ].join("\n");
}

const STUDY_PREFIX = /^(?:ekg|ecg|electrocardiogram|cxr|ct|cta|mri|mra|xr|x-?ray|us|ultrasound|echo(?:cardiogram)?|tte|tee|eeg|pet|v\/?q|kub|abg|vbg|ua|urinalysis)\b/i;
const CULTURE_PREFIX = /^(?:blood|sputum|urine|wound|csf)\s+cultures?\b/i;
// "RUQ ultrasound", "OB ultrasound": modality appears mid-label.
const STUDY_HEAD_ANYWHERE = /\b(?:ultrasound|echocardiogram|mammogram|x-?ray)\b/i;
// "Head CT", "Chest X-ray": anatomy before modality.
const STUDY_ANATOMY_MODALITY = /\b(?:head|chest|abdomen|pelvis|spine|neck|extremity|cardiac)\s+(?:ct|cta|mri|mra|x-?ray|xr|us|ultrasound)\b/i;
// "LP results", "Respiratory viral panel", "Stone analysis", "Urine protein/creatinine ratio".
const RESULT_HEAD = /\b(?:results?|panel|analysis|testing|ratio)\s*$/i;

export function extractNoteStudies(...sectionTexts) {
  const studies = [];
  const seen = new Set();
  for (const sectionText of sectionTexts) {
    for (const rawLine of linesOf(sectionText)) {
      // Strip markdown and list bullets: "- CT head: ..." or "**CXR:** ..."
      let line = rawLine.replace(/^(\*\*|__|\*|_|[-•>])\s*/, "");
      if (LAB_LINE.test(line)) continue;
      if (VITAL_PATTERNS.some(({ regex }) => regex.test(line)) && /vitals?\b/i.test(line)) continue;
      // "Studies: OB ultrasound: ..." or "Studies reviewed: CXR: ..." — strip
      // the generic "Studies:"/"Data:" prefix and parse the remainder as the
      // actual study line.
      line = line.replace(/^(?:studies(?:\s+reviewed)?|data)\s*:\s*/i, "");
      const colonAt = line.search(/\s*[:—–]\s*|\s+-\s+/);
      let label = "";
      let text = "";
      if (colonAt > 0) {
        const head = line.slice(0, colonAt).trim();
        // Modality at the start ("CT head"), in the middle ("RUQ ultrasound",
        // "OB ultrasound"), anatomy before modality ("Head CT"), cultures, or
        // result-type labels ("LP results", "Respiratory viral panel").
        if (STUDY_PREFIX.test(head) || STUDY_HEAD_ANYWHERE.test(head) || STUDY_ANATOMY_MODALITY.test(head) || CULTURE_PREFIX.test(head) || RESULT_HEAD.test(head)) {
          label = head.replace(/\s+/g, " ");
          text = clean(line.slice(colonAt).replace(/^[:—–-]\s*/, ""));
        }
      }
      if (!label) continue;
      if (!text || /^(?:pending|not (?:done|available)|none|n\/?a)\b/i.test(text)) {
        text = text || "Result pending";
      }
      const key = `${label}::${text}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      studies.push({ label, text });
    }
  }
  return studies;
}

/**
 * Runs every extractor over the parsed note sections.
 * sections: { fieldId: text } — missing fields are fine.
 */
export function extractNoteClinicalData(sections = {}, { noteType = "" } = {}) {
  // Sections keep their line structure: the labs and studies extractors are
  // line-based, so collapsing newlines here would merge a "Labs:" line into
  // the study line that follows it and hide the study.
  const get = (id) => String(sections[id] || "").replace(/\r\n?/g, "\n").trim();
  const examText = [get("physical_exam"), get("objective")].filter(Boolean).join("\n");
  const objectiveText = get("objective");
  return {
    noteType,
    medicationsText: extractNoteMedications(get("medications")),
    vitalsText: extractNoteVitals(examText),
    // Labs and studies can appear in physical_exam (e.g., "Exam:" followed by
    // "Labs:", "UA:", "Head CT:") as well as objective.
    labsText: extractNoteLabs(examText),
    studies: extractNoteStudies(examText)
  };
}
