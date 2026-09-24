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

const NO_MEDS = /^(?:none|no\s+(?:known\s+)?(?:home\s+)?med(?:ication)?s|no\s+meds|denies|n\/?a|not\s+(?:currently\s+)?(?:on|taking)|nkda\b)/i;
const SENTENCE_SUBJECT = /^(?:wife|husband|patient|family|he|she|they|note|pharmacy|nursing|mother|father|daughter|son)\b/i;

function looksLikeSentence(line) {
  return SENTENCE_SUBJECT.test(line) || /assists with|manages (?:his|her|their) medications/i.test(line);
}

// Splits "Xarelto, dose unknown" into a name and detail text. The emitted
// canonical line is `Name — details`, which savedMedicationDisplay parses.
function splitMedicationLine(rawLine) {
  const line = stripBullet(rawLine);
  if (!line || NO_MEDS.test(line) || looksLikeSentence(line)) return null;
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
      const doseAt = line.search(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?|u|%|ml|tablets?|capsules?|puffs?)\b/i);
      if (doseAt > 2) {
        name = line.slice(0, doseAt).trim();
        details = line.slice(doseAt).trim();
      }
    }
  }
  name = clean(name).replace(/\s+/g, " ").replace(/[.]+$/, "");
  if (name.length < 2 || name.length > 60) return null;
  // A "name" that is really a sentence fragment is not a medication.
  if (/^(the|this|that|with|and|for|from)\b/i.test(name)) return null;
  if (name.split(" ").length > 6 && !details) return null;
  details = clean(details).replace(/[.]+$/g, "");
  return { name, details };
}

// Merges comma/semicolon fragments that continue the previous medication
// ("Xarelto, dose unknown" is one med, not two). A fragment that starts
// lowercase is only a continuation when it carries no dose of its own, so a
// new medication like "metoprolol 25 mg BID" is never glued onto the prior.
const INLINE_MED_LABEL = /^(?:home\s+)?(?:medications?|meds?|rx|prescriptions?)(?:\s+list)?\s*[:—–-]\s*/i;
const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?|u|%|ml|tablets?|capsules?|puffs?)\b/i;
const CONTINUATION_KEYWORDS = /^(?:dose|unknown|daily|bid|tid|qid|qhs|qday|prn|mg|mcg|g\b|ml|units?|po|iv|im|sc|sq|sl|as directed)/i;

function splitInlineMedList(text) {
  const stripped = clean(text).replace(INLINE_MED_LABEL, "");
  const fragments = stripped.split(/[;\n]+/).flatMap((part) => part.split(/,(?!\s*\d)/)).map(clean).filter(Boolean);
  const merged = [];
  for (const fragment of fragments) {
    const continuation = CONTINUATION_KEYWORDS.test(fragment)
      || (/^[a-z]/.test(fragment) && !DOSE_PATTERN.test(fragment));
    if (continuation && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${fragment}`;
    } else {
      merged.push(fragment);
    }
  }
  return merged;
}

export function extractNoteMedications(medicationsText) {
  const lines = linesOf(medicationsText);
  if (!lines.length) return "";
  if (lines.length === 1 && NO_MEDS.test(stripBullet(lines[0]))) return "";
  const hasBullets = lines.some((line) => /^(?:[-*•>▪]|\d{1,2}[.)])\s+/.test(line));
  const rawLines = hasBullets
    ? lines
    : splitInlineMedList(lines.join(" "));
  const meds = [];
  for (const rawLine of rawLines) {
    const parsed = splitMedicationLine(rawLine);
    if (parsed && !meds.some((med) => med.name.toLowerCase() === parsed.name.toLowerCase())) meds.push(parsed);
  }
  if (!meds.length) return "";
  return ["Medications", ...meds.map((med) => (med.details ? `${med.name} ${EM_DASH} ${med.details}` : med.name))].join("\n");
}

const VITAL_PATTERNS = [
  { name: "BP", regex: /\bB\/?P\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/i, format: (m) => `${m[1]}/${m[2]}` },
  { name: "SBP", regex: /\bSBP\b\s*(\d{2,3})\b/i, format: (m) => m[1] },
  { name: "DBP", regex: /\bDBP\b\s*(\d{2,3})\b/i, format: (m) => m[1] },
  { name: "MAP", regex: /\bMAP\b\s*\(?(?:cuff)?\)?\s*(\d{2,3})\b/i, format: (m) => m[1] },
  { name: "HR", regex: /\b(?:HR|Pulse)\b\s*(\d{2,3})\b/i, format: (m) => m[1] },
  {
    name: "Temp",
    regex: /\bT(?:emp(?:erature)?)?\b\.?\s*(\d{2,3}(?:\.\d)?)\s*°?\s*([CF])?/i,
    format: (m) => {
      let value = Number(m[1]);
      const scale = (m[2] || "").toUpperCase();
      if (scale === "F" || (!scale && value >= 90)) value = (value - 32) * 5 / 9;
      return String(Math.round(value * 10) / 10);
    }
  },
  { name: "RR", regex: /\b(?:RR|Resp(?:irations|\.|atory)?)\b\.?\s*(\d{1,2})\b/i, format: (m) => m[1] },
  { name: "SpO2", regex: /\b(?:SpO2?|O2\s*sat\w*)\b\s*(\d{2,3})\s*%?/i, format: (m) => m[1] },
  { name: "Weight", regex: /\b(?:Wt|Weight)\b\s*(?:\(kg\))?\s*(\d+(?:\.\d+)?)\s*kgs?\b/i, format: (m) => m[1] },
  { name: "Pain", regex: /\bPain\b\s*(\d{1,2})\s*\/\s*10\b/i, format: (m) => m[1] }
];

export function extractNoteVitals(...sectionTexts) {
  const text = sectionTexts.filter(Boolean).join("\n");
  if (!text) return "";
  const found = new Map();
  for (const { name, regex, format } of VITAL_PATTERNS) {
    if (found.has(name)) continue;
    const match = text.match(regex);
    if (match) found.set(name, format(match));
  }
  if (!found.size) return "";
  return ["Vitals", [...found.entries()].map(([name, value]) => `${name} ${value}`).join("; ")].join("\n");
}

// Narrative lab values ("Labs: WBC 12.3, Hgb 9.1, Na 140") keyed by a small
// dictionary of common analytes. Only lines that are clearly lab lines are
// scanned, so single-letter symbols never match prose.
const NARRATIVE_ANALYTES = [
  ["wbc|white blood cells?", "WBC", "K/uL"],
  ["hgb|hb|hemoglobin", "Hemoglobin", "g/dL"],
  ["hct|hematocrit", "Hematocrit", "%"],
  ["plt|plts|platelets?", "Platelets", "K/uL"],
  ["na|sodium", "Sodium", "mmol/L"],
  ["k|potassium", "Potassium", "mmol/L"],
  ["cl|chloride", "Chloride", "mmol/L"],
  ["co2|bicarb|bicarbonate|hco3", "Bicarbonate", "mmol/L"],
  ["bun", "BUN", "mg/dL"],
  ["creatinine|cr", "Creatinine", "mg/dL"],
  ["glucose|glu", "Glucose", "mg/dL"],
  ["mg|magnesium", "Magnesium", "mg/dL"],
  ["phos|phosphorus|phosphate", "Phosphorus", "mg/dL"],
  ["ca|calcium", "Calcium", "mg/dL"],
  ["alb|albumin", "Albumin", "g/dL"],
  ["tbili|total bilirubin|bili", "Total bilirubin", "mg/dL"],
  ["ast", "AST", "U/L"],
  ["alt", "ALT", "U/L"],
  ["alk phos|alkaline phosphatase", "Alkaline phosphatase", "U/L"],
  ["inr", "INR", ""],
  ["lactate|lactic acid", "Lactate", "mmol/L"],
  ["bnp", "BNP", "pg/mL"],
  ["troponin|trop|hs-trop", "Troponin", "ng/mL"],
  ["crp", "CRP", "mg/L"],
  ["esr", "ESR", "mm/hr"],
  ["a1c|hgba1c|hemoglobin a1c", "HbA1c", "%"],
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

function parseNarrativeLabLine(line) {
  const body = clean(line).replace(LAB_LINE, "");
  if (!body || /^(?:pending|not (?:done|available)|none|n\/a)\b/i.test(body)) return [];
  const results = [];
  const used = new Set();
  for (const [aliasPattern, canonical, unit] of NARRATIVE_ANALYTES) {
    // Numeric values include titers like "1:640" for ANA.
    const numericPattern = new RegExp(`\\b(?:${aliasPattern})\\s*:?\\s*(\\d+(?::\\d+)?(?:\\.\\d+)?)(?:\\s*\\((H|L|HH|LL)\\))?`, "i");
    const placeholderPattern = new RegExp(`\\b(?:${aliasPattern})\\s*:?\\s*(${PLACEHOLDER_VALUE_SOURCE})\\b`, "i");
    // Qualitative results: "dsDNA positive", "ANA negative".
    const qualitativePattern = new RegExp(`\\b(?:${aliasPattern})\\s*:?\\s*(positive|negative|pos|neg)\\b(?:\\s*\\((H|L|HH|LL)\\))?`, "i");
    const numericMatch = body.match(numericPattern);
    const placeholderMatch = numericMatch ? null : body.match(placeholderPattern);
    const qualitativeMatch = numericMatch || placeholderMatch ? null : body.match(qualitativePattern);
    const match = numericMatch || placeholderMatch || qualitativeMatch;
    if (!match || used.has(canonical)) continue;
    used.add(canonical);
    if (numericMatch) {
      const flagText = (numericMatch[2] || "").toUpperCase();
      const flag = flagText.startsWith("H") ? "H" : flagText.startsWith("L") ? "L" : "";
      results.push({ name: canonical, value: numericMatch[1], unit, flag });
    } else if (qualitativeMatch) {
      const flagText = (qualitativeMatch[2] || "").toUpperCase();
      const flag = flagText.startsWith("H") ? "H" : flagText.startsWith("L") ? "L" : "";
      const val = /^pos/i.test(qualitativeMatch[1]) ? "positive" : "negative";
      results.push({ name: canonical, value: val, unit: "", flag });
    } else {
      results.push({ name: canonical, value: placeholderMatch[1].toLowerCase(), unit: "", flag: "" });
    }
  }
  return results;
}

export function extractNoteLabs(...sectionTexts) {
  const rows = [];
  for (const sectionText of sectionTexts) {
    for (const rawLine of linesOf(sectionText)) {
      // Strip markdown bold/italic and list bullets: "**Labs: ..." or "- Labs: ..."
      const line = rawLine.replace(/^(\*\*|__|\*|_|[-•>])\s*/, "");
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
