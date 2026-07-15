export {
  DEFAULT_PRIMARY_MODEL_ID,
  DEFAULT_FALLBACK_MODEL_ID,
  OPENMED_MODEL_ID,
  MULTILANG_PII_MODEL_ID,
  GLINER_PII_MODEL_ID,
  OPENAI_PRIVACY_FILTER_MODEL_ID,
  ETTIN_68M_NEMOTRON_PII_MODEL_ID,
  KNOWLEDGATOR_GLINER_PII_MODEL_ID,
  I2B2_CLINICALBERT_MODEL_ID,
  DEFAULT_DTYPE,
  MODEL_PROFILES
} from "./deid/model-config.js";
import {
  DEFAULT_PRIMARY_MODEL_ID,
  DEFAULT_FALLBACK_MODEL_ID,
  GLINER_PII_MODEL_ID,
  MULTILANG_PII_MODEL_ID,
  I2B2_CLINICALBERT_MODEL_ID,
  DEFAULT_DTYPE
} from "./deid/model-config.js";
import {
  phiLabelMap,
  nameEntityLabels,
  nonNameClinicalPhrases,
  nonNameClinicalWords,
  commonFirstNames,
  clinicalAnchorWords,
  protectedClinicalAcronyms,
  promptHeadingWords,
  promptHeadingAnchorWords,
  appGeneratedSourceLabelPattern,
  broadNonPhiLocationWords,
  medicationSaltOrFormWords,
  medicationNameWords,
  clinicalInstructionWords,
  clinicalInstructionAnchorWords,
  medicationClassOrStemPattern,
  honorificPatternSource,
  patientHonorificPatternSource,
  namePartPatternSource,
  fullNamePatternSource,
  titledNamePatternSource,
  suffixPattern,
  credentialPattern,
  doseUnitPattern,
  doseFormPattern,
  isLikelyMedicationContext
} from "./deid/lexicons.js";
import { buildZoneMap, zoneTypeForSpan, isProtectedZoneType } from "./deid/zones.js";
import { collectDictionaryNameCandidates } from "./deid/name-recall.js";
// Free-text date/time detection and parsing runs entirely through chrono-node
// (https://github.com/wanasit/chrono, vendored English-only build) rather
// than hand-rolled regexes - it understands far more real-world phrasing
// (ordinals, weekday-relative dates, "X days ago", military time, ...) than
// a bespoke parser reasonably can. Only the "which detected date becomes
// which Hospital Day/Historical placeholder" clinical logic below stays
// bespoke - that part is specific to this app's de-identification scheme.
import * as chrono from "../../vendor/chrono-node/index.js";

// This app only ever anchors dates to a calendar day (Date.UTC, no
// timezone-aware math anywhere in this file), so chrono's timezone-name
// refiner is pure downside: it reads a 2-3 letter clinical acronym right
// after a date (PET, CT, MRI-adjacent phrasing) as if it were a trailing
// timezone abbreviation like "EST", silently absorbing that word into the
// date span it replaces. Building one shared instance without it once, up
// front, is simpler than special-casing every clinical acronym that
// happens to collide with a real timezone name.
const clinicalChrono = (() => {
  const configuration = chrono.configuration.createCasualConfiguration(false);
  configuration.refiners = configuration.refiners.filter((refiner) => !/Timezone/.test(refiner.constructor.name));
  return new chrono.Chrono(configuration);
})();


// ── Auto-import clinical guard vocabulary (built from MeSH + RxNorm) ──
// To update: npm run build:clinical-guard-full
import {
  medicationWords as _vwMedicationWords,
  nonNameClinicalWords as _vwNonNameClinicalWords,
  nonNameClinicalPhrases as _vwNonNameClinicalPhrases,
  clinicalAnchorWords as _vwClinicalAnchorWords
} from "../../data/clinical-guard-export.js";

_vwMedicationWords.forEach((w) => medicationNameWords.add(w));
_vwNonNameClinicalWords.forEach((w) => nonNameClinicalWords.add(w));
_vwNonNameClinicalPhrases.forEach((p) => nonNameClinicalPhrases.add(p));
_vwClinicalAnchorWords.forEach((w) => clinicalAnchorWords.add(w));

export function normalizePhiLabel(entityOrLabel) {
  const rawLabel = typeof entityOrLabel === "string"
    ? entityOrLabel
    : entityOrLabel.entity_group || entityOrLabel.entity || entityOrLabel.label || "PHI";
  const label = String(rawLabel)
    .replace(/^[BI]-/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return phiLabelMap[label] || label.replace(/_/g, " ");
}

export function placeholderForLabel(label) {
  return `[${normalizePhiLabel(label)}]`;
}

function normalizePhrase(value) {
  return String(value || "")
    .replace(/^[*\-\u2022\s]+/, "")
    .replace(/[:;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The zone map is rebuilt only when the text changes; the repeated filter
// passes inside expandIdentityGraphEntities all reuse the cached map.
const zoneMapCache = { text: null, map: null };
function zoneMapForText(rawText) {
  if (zoneMapCache.text !== rawText) {
    zoneMapCache.text = rawText;
    zoneMapCache.map = buildZoneMap(rawText);
  }
  return zoneMapCache.map;
}

function spanZoneType(rawText, start, end) {
  return zoneTypeForSpan(zoneMapForText(rawText), start, end);
}

function isSpanInProtectedZone(rawText, start, end) {
  return isProtectedZoneType(spanZoneType(rawText, start, end));
}

function lineAroundSpan(rawText, start, end) {
  const lineStart = rawText.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = rawText.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? rawText.length : lineEndIndex;
  return rawText.slice(lineStart, lineEnd).trim();
}

function lineContext(rawText, start, end) {
  const line = lineAroundSpan(rawText, start, end);
  const before = rawText.slice(Math.max(0, start - 80), start);
  const after = rawText.slice(end, Math.min(rawText.length, end + 80));
  return `${before}\n${line}\n${after}`;
}

function sameLineContext(rawText, start, end) {
  return lineAroundSpan(rawText, start, end).toLowerCase();
}

function clinicalResultLabelFromLine(line) {
  const clean = String(line || "").trim();
  const delimiter = clean.match(/:\s+/);
  const colonIndex = delimiter ? delimiter.index : -1;
  if (colonIndex <= 0 || colonIndex > 110) {
    return null;
  }
  const label = clean.slice(0, colonIndex).trim();
  const value = clean.slice(colonIndex + 1).trim();
  if (!label || !value) {
    return null;
  }
  if (/\b(?:patient(?: name)?|pt(?: name)?|name|dob|date of birth|mrn|medical record|csn|fin|har|account|phone|fax|email|address|room|bed|unit|provider|attending|resident|fellow|consultant|emergency contact|mother|father|spouse|daughter|son|guardian|caregiver)\b/i.test(label)) {
    return null;
  }
  if (/^(?:\(?[HLPE!]\)?|Rpt)$/i.test(label)) {
    return null;
  }
  return { label, value };
}

function isLikelyClinicalResultLine(line) {
  const parsed = clinicalResultLabelFromLine(line);
  if (!parsed) {
    return false;
  }

  const label = parsed.label.toLowerCase();
  const labelLooksClinical = /\b(?:bg site|spec site|source|oxygen device|fio2|mode|vent|peep|resp|respirations|pressure support|tidal volume|liter flow|test cup|appearance|ketones|mucus|casts|cast type|manual diff|ref com comments|axis|banding|cells analyzed|cells counted|cells karyotyped|clinical indication|karyotype|prelim result|final result|poc|wbc|hgb|hbg|hemoglobin|hematocrit|hct|platelet|plt|neutro|lymph|mono|basophil|eosinophil|rbc|mch|mchc|mcv|mpv|rdw|retic|sodium|potassium|chloride|co2|anion|bun|creatinine|creat|egfr|glucose|calcium|magnesium|phosphorus|protein|albumin|globulin|ast|alt|bilirubin|alk|base exc|base excess|hypochromasia|microcytes|lactate|troponin|protime|inr|ptt|teg|clotting time|fibrinogen activity|coag index|lyse30|platelet aggregation|ferritin|iron|transferrin|a1c|hcg|quantiferon|rpr|treponema|pallidum|resistance|tumor marker|pcr|culture|body fluid|viral|virus|dna|rna|fish|cmv|ebv|bk|bkv|hbv|hcv|hiv|sars|cov|covid|vaginosis|streptococcus|urine|ua|vancomycin|tacrolimus|abo|antibody|antigen|path|pocus|fascial|nerve|block|xr|xray|ct|mri|us|vas|echo|ekg|ecg|crossmatch|transfuse|request for|lab|result)\b/.test(label);
  const valueLooksResult = /^(?:[<>]?\d|not detected|detected|positive|negative|nonreactive|non-reactive|non reactive|reactive|minimal react|indeterminate|not predicted|none seen|rpt\b|see note|see comment|normal|abnormal|yellow|cloudy|slightly cloudy|clear|trace\b|small\b|slight\b|present|absent|cannot be determined|not performed|plain cup|fish\b|normal fish|blood\b|serum\b|plasma\b|urine\b|pleural fluid\b|peripheral venous\b|a-line\b|ventilator\b|high flow|o positive|neg\b)/i.test(parsed.value);
  return labelLooksClinical || valueLooksResult;
}

function isLikelyClinicalSlashValue(rawText, start, end) {
  const span = rawText.slice(start, end);
  const before = rawText.slice(Math.max(0, start - 36), start).toLowerCase();
  const after = rawText.slice(end, Math.min(rawText.length, end + 36)).toLowerCase();
  const denominator = Number(span.split(/[/-]/)[1]);
  return /(strength|motor|reflex|pain|score|rated|grade|gcs|glasgow|apgar|mrc|nihss)\s*(?:is|was|:)?\s*$/.test(before) ||
    /^\s*(?:strength|motor|reflex|pain|score|out of|\/)/.test(after) ||
    denominator <= 10 && /(strength|motor|pain|score|grade|rated|exam|neuro|mrc|nihss)/.test(`${before} ${after}`);
}

function isLikelyNonDateSlashMeasurement(rawText, start, end) {
  const span = rawText.slice(start, end).trim();
  if (!/^\d{1,2}[/-]\d{1,2}$/.test(span)) {
    return false;
  }
  const before = rawText.slice(Math.max(0, start - 48), start).toLowerCase();
  const after = rawText.slice(end, Math.min(rawText.length, end + 48)).toLowerCase();
  return isLikelyClinicalSlashValue(rawText, start, end) ||
    /\b(?:xr|x-ray|xray|knee|chest|abdomen|foot|hand|shoulder|hip|views?)\s*$/.test(before) && /^\s*(?:views?|view|right|left|ap|pa|lat|lateral|portable)\b/.test(after);
}

function isLikelyMedicationWord(word) {
  return medicationNameWords.has(word) || medicationClassOrStemPattern.test(word);
}

function isLikelyMedicationPhrase(words) {
  return words.length >= 2 &&
    words.length <= 4 &&
    words.some(isLikelyMedicationWord) &&
    words.every((word) => isLikelyMedicationWord(word) || medicationSaltOrFormWords.has(word) || nonNameClinicalWords.has(word));
}

function clinicalWordsFromNormalized(normalized) {
  return String(normalized || "")
    .replace(/\./g, "")
    .split(" ")
    .filter(Boolean);
}

// Lowercased words with interior punctuation stripped ("Center," -> "center"),
// for vocabulary-set membership checks.
function vocabularyWords(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .filter(Boolean);
}

function normalizeClinicalGuardToken(value) {
  return String(value || "")
    .replace(/^[^A-Za-z0-9/]+|[^A-Za-z0-9/]+$/g, "")
    .toLowerCase();
}

function isProtectedClinicalAcronymToken(value) {
  const raw = String(value || "").replace(/^[^A-Za-z0-9/]+|[^A-Za-z0-9/]+$/g, "");
  const normalized = normalizeClinicalGuardToken(raw);
  if (!protectedClinicalAcronyms.has(normalized)) {
    return false;
  }
  return /[0-9/]/.test(raw) || raw === raw.toUpperCase();
}

function isLikelyClinicalNameLikePhrase(normalized) {
  const words = clinicalWordsFromNormalized(normalized);
  if (words.length < 2 || words.length > 5) {
    return false;
  }

  if (nonNameClinicalPhrases.has(normalized)) {
    return true;
  }

  if (isLikelyClinicalInstructionPhrase(normalized)) {
    return true;
  }

  if (words.length === 2 && medicationNameWords.has(words[0]) && medicationSaltOrFormWords.has(words[1])) {
    return true;
  }

  if (isLikelyMedicationPhrase(words)) {
    return true;
  }

  return words.every((word) => nonNameClinicalWords.has(word)) &&
    words.some((word) => clinicalAnchorWords.has(word));
}

function isLikelyClinicalInstructionPhrase(normalized) {
  const words = clinicalWordsFromNormalized(normalized);
  if (words.length < 2 || words.length > 7) {
    return false;
  }

  return words.every((word) => (
    clinicalInstructionWords.has(word) ||
    clinicalInstructionAnchorWords.has(word) ||
    nonNameClinicalWords.has(word) ||
    clinicalAnchorWords.has(word) ||
    medicationNameWords.has(word) ||
    medicationSaltOrFormWords.has(word)
  )) &&
    words.some((word) => clinicalInstructionWords.has(word)) &&
    words.some((word) => (
      clinicalInstructionAnchorWords.has(word) ||
      clinicalAnchorWords.has(word) ||
      medicationNameWords.has(word)
    ));
}

function isLikelyPromptInstructionHeading(value) {
  const span = String(value || "").replace(/\s+/g, " ").trim();
  if (!span || span.length > 96) {
    return false;
  }
  const normalized = normalizePhrase(span);
  const words = clinicalWordsFromNormalized(normalized);
  if (words.length < 2 || words.length > 8) {
    return false;
  }
  const letterChars = span.replace(/[^A-Za-z]/g, "");
  if (!letterChars || letterChars !== letterChars.toUpperCase()) {
    return false;
  }
  return words.every((word) => promptHeadingWords.has(word)) &&
    words.some((word) => promptHeadingAnchorWords.has(word));
}

function isLikelyAppGeneratedSourceLabel(value) {
  const span = String(value || "").replace(/\s+/g, " ").trim();
  if (!span || span.length > 80) {
    return false;
  }
  return appGeneratedSourceLabelPattern.test(span);
}

function isClinicalGuardOnlyText(value) {
  const normalized = normalizePhrase(value);
  if (!normalized) {
    return false;
  }

  if (nonNameClinicalPhrases.has(normalized)) {
    return true;
  }

  const stripped = normalized
    .replace(/^[A-Z][a-z]+'s\s+/i, "")
    .replace(/^(?:Mr|Mrs|Ms|Miss|Dr|Doctor)\.?\s+[A-Z][a-z]+'s\s+/i, "")
    .replace(/^\[.*?\]\s*/g, "");
  if (stripped && stripped !== normalized) {
    if (nonNameClinicalPhrases.has(stripped)) {
      return true;
    }
    if (isLikelyClinicalInstructionPhrase(stripped)) {
      return true;
    }
  }

  for (const phrase of nonNameClinicalPhrases) {
    // Prefix match must end at a word boundary: "ros" (review of systems)
    // guards "ros negative", not the name "Rosa".
    if (normalized.startsWith(phrase) &&
        (normalized.length === phrase.length || !/[a-z0-9]/.test(normalized[phrase.length]))) {
      return true;
    }
  }

  if (isLikelyClinicalInstructionPhrase(normalized)) {
    return true;
  }

  const words = String(value || "")
    .replace(/\./g, "")
    .split(" ")
    .map((word) => ({
      raw: word,
      normalized: normalizeClinicalGuardToken(word)
    }))
    .filter((word) => word.normalized);
  if (!words.length || words.length > 6) {
    return false;
  }

  return words.every((word) => (
    isProtectedClinicalAcronymToken(word.raw) ||
    nonNameClinicalWords.has(word.normalized) ||
    medicationNameWords.has(word.normalized) ||
    medicationSaltOrFormWords.has(word.normalized)
  )) && words.some((word) => (
    isProtectedClinicalAcronymToken(word.raw) ||
    clinicalAnchorWords.has(word.normalized) ||
    medicationNameWords.has(word.normalized)
  ));
}

const facilitySuffixWords = new Set([
  "center", "centers", "hospital", "hospitals", "clinic", "clinics",
  "institute", "institutes", "associates", "association", "associations",
  "group", "groups", "practice", "practices", "partners", "partner",
  "healthcare", "health", "medical", "surgical", "dental", "care",
  "services", "service", "foundation", "network", "system", "systems",
  "laboratory", "laboratories", "lab", "labs", "pharmacy", "pharmacies",
  "imaging", "radiology", "diagnostics", "rehabilitation", "rehab",
  "nursing", "hospice", "facility", "facilities", "unit", "units",
  "department", "departments", "division", "office", "offices",
  "specialists", "specialist", "physicians", "physician", "surgeons",
  "consultants", "cardiology", "cardiovascular", "dermatology",
  "endocrinology", "gastroenterology", "hematology", "neurology",
  "oncology", "ophthalmology", "orthopedics", "pediatrics", "psychiatry",
  "pulmonology", "rheumatology", "urology", "nephrology",
]);

function isLikelyFacilityPhrase(normalized) {
  const words = clinicalWordsFromNormalized(normalized);
  if (words.length < 2 || words.length > 6) {
    return false;
  }
  const lastWord = words[words.length - 1];
  return facilitySuffixWords.has(lastWord);
}

function hasExplicitIdentifierContext(rawText, start, end) {
  const lineStart = rawText.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const beforeInLine = rawText.slice(lineStart, start).toLowerCase();
  return /\b(?:patient(?:\s+name)?|pt(?:\s+name)?|name|provider|attending|resident|fellow|consultant|surgeon|pcp|primary care provider|referring provider|ordering provider|primary endocrinologist|emergency contact|mother|father|spouse|daughter|son|guardian|caregiver)\s*[:#]\s*$/.test(beforeInLine);
}

function isProtectedClinicalEntityFalsePositive(rawText, entity) {
  const label = normalizePhiLabel(entity.label);
  if (!nameEntityLabels.has(label) && label !== "LOCATION" && label !== "FACILITY" && label !== "ORGANIZATION") {
    return false;
  }

  const span = rawText.slice(entity.start, entity.end).replace(/\s+/g, " ").trim();
  const normalized = normalizePhrase(span);
  if ((label === "LOCATION" || label === "FACILITY" || label === "ORGANIZATION") && broadNonPhiLocationWords.has(normalized)) {
    return true;
  }

  if (!isClinicalGuardOnlyText(span)) {
    return false;
  }

  if (nameEntityLabels.has(label) && hasExplicitIdentifierContext(rawText, entity.start, entity.end) && parsePersonName(span)) {
    return false;
  }

  return true;
}

function isLikelyChartHeadingPhrase(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  const normalized = normalizePhrase(span);
  if (!normalized) {
    return false;
  }

  if (nonNameClinicalPhrases.has(normalized)) {
    return true;
  }

  const rawLine = lineAroundSpan(rawText, start, end);
  const line = normalizePhrase(rawLine);
  const beforeInLine = rawLine.slice(0, Math.max(0, rawLine.indexOf(span)));
  if (/^\s*(?:#|[-*]|\d+\.)?\s*$/.test(beforeInLine) && /(?:^#|:?\s*$|, resolved\s*$|, improved\s*$|, stable\s*$)/i.test(rawLine)) {
    const words = clinicalWordsFromNormalized(normalized);
    if (words.length <= 5 && words.every((word) => nonNameClinicalWords.has(word) || medicationNameWords.has(word))) {
      return true;
    }
  }

  if (line && line === normalized) {
    const words = clinicalWordsFromNormalized(normalized);
    return words.length <= 5 && words.every((word) => nonNameClinicalWords.has(word));
  }

  return false;
}

function isLikelyNonNamePhrase(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  const normalized = normalizePhrase(span);
  if (!normalized) {
    return true;
  }

  if (isLikelyPromptInstructionHeading(span)) {
    return true;
  }

  if (isLikelyAppGeneratedSourceLabel(span)) {
    return true;
  }

  const lineStart = rawText.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = rawText.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? rawText.length : lineEndIndex;
  const beforeInLine = rawText.slice(lineStart, start);
  const afterInLine = rawText.slice(end, lineEnd);
  if (/^\s*(?:#|[-*]|\d+\.)?\s*$/.test(beforeInLine) && /^\s*[:#]/.test(afterInLine)) {
    return true;
  }

  if (isLikelyChartHeadingPhrase(rawText, start, end)) {
    return true;
  }

  if (isLikelyClinicalNameLikePhrase(normalized)) {
    return true;
  }

  if (/^patient\b/i.test(span) && !/\bname\s*[:#]/i.test(lineAroundSpan(rawText, start, end))) {
    return true;
  }

  const words = clinicalWordsFromNormalized(normalized);
  return words.length >= 2 && words.length <= 5 && words.every((word) => nonNameClinicalWords.has(word));
}

function isLikelyDateFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).trim();
  const before = rawText.slice(Math.max(0, start - 40), start).toLowerCase();
  const after = rawText.slice(end, Math.min(rawText.length, end + 40)).toLowerCase();

  if (!/\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(span)) {
    return true;
  }

  if (/^\/?\d{4}$/.test(span)) {
    return true;
  }

  // A bare clock time carries no calendar-date information - Safe Harbor's
  // date-generalization requirement is about dates, not time-of-day, and
  // collapsing a lone time into a Hospital Day/Historical placeholder (as
  // happens whenever a model mistags a "Collection Time" column as DATE)
  // destroys clinically useful timing the user wants kept exactly as-is.
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]\.?M\.?)?$/i.test(span)) {
    return true;
  }

  if (/(?:year[-\s]*old|years old|y\.?o\.?|yo)$/i.test(span) || /^[-\s]*(?:year[-\s]*old|years old|y\.?o\.?|yo)$/i.test(span)) {
    return true;
  }

  const hasDateContext = /(admit|admitted|admission|discharge|date|dos|collected|collection|result|received|drawn|ordered|started|start|onset|began|developed|changed|resolved|improved|worsened|since|through|from|to|on)\W*$/.test(before);

  if (/^\d{1,2}[/-]\d{1,2}$/.test(span) && !hasDateContext) {
    return true;
  }

  // Dot-separated number pairs (e.g. "13.5") are decimal values, not dates.
  // Dates use / or -, dots appear in lab reference ranges like "13.5-17.5".
  if (/^\d{1,2}\.\d{1,2}$/.test(span) && !hasDateContext) {
    return true;
  }

  // Dot-separated number.twoDigit (e.g. "5.25") — looks like M.YY date but
  // far more likely to be a decimal lab value unless in a date context line.
  if (/^\d{1,2}\.\d{2}$/.test(span) && !hasDateContext && !/(?:date|dos|collected|drawn|ordered|admit)/i.test(before + after)) {
    return true;
  }

  // A dash-separated number range (e.g. "13.5-17.5") is almost always a lab
  // reference range or dose range, not a date - chrono-node's general
  // grammar occasionally reads these as a date interval.
  if (/^\d{1,3}(?:\.\d+)?-\d{1,3}(?:\.\d+)?$/.test(span) && !hasDateContext) {
    return true;
  }

  if (isLikelyNonDateSlashMeasurement(rawText, start, end)) {
    return true;
  }

  if (/^\d{1,2}\/\d{1,2}$/.test(span) && isLikelyClinicalSlashValue(rawText, start, end)) {
    return true;
  }

  return /^(?:\/|-)\d{2,4}$/.test(span) ||
    /^\d{1,2}[- ][A-Za-z]+$/.test(span) ||
    /^\d{1,2}-\d{1,2}\s*(?:days?|weeks?|months?)\b/i.test(`${span} ${after}`);
}

function isLikelyLocationFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).trim();
  const normalized = normalizePhrase(span);
  return broadNonPhiLocationWords.has(normalized) ||
    /^hospital\s+(?:course|problem|problems|day|stay|medicine|admission|course had)\b/i.test(span) ||
    /^[a-z]/.test(span) && !/\b(?:clinic|medical center|health system|room|unit|floor|ward)\b/i.test(span);
}

function isLikelyOrganizationFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  const after = rawText.slice(end, Math.min(rawText.length, end + 32));
  const normalized = normalizePhrase(span);
  const line = lineAroundSpan(rawText, start, end);
  return broadNonPhiLocationWords.has(normalized) ||
    nonNameClinicalPhrases.has(normalized) ||
    /\b(?:xr|xray|ct|cta|mr|mri|fl|ir|us|vas|echo|ekg|eeg|pocus)\b/i.test(line) && /\b(?:rpt|report|views?|con|w\/o|with|without|image|screening|clearance)\b/i.test(line) ||
    /^running hospital$/i.test(span) && /^\s+(?:course|stay|problems?)\b/i.test(after) ||
    /\bhospital$/i.test(span) && /^\s+(?:course|stay|problems?|day|progress note)\b/i.test(after);
}

function isLikelyAddressFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  return /\b(?:creatinine|glucose|sodium|potassium|chloride|calcium|magnesium|phosphorus|bld|bun|egfr|labs?|vitals?|mmhg|mg|mcg|per dr)\b/i.test(span) ||
    /\bDr\.\s+[A-Z]/.test(span);
}

function isLikelyIdentifierFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  const line = lineAroundSpan(rawText, start, end);
  if (/^(?:COVID-19|COVID19|COOMBS-C3D)$/i.test(span) && isLikelyClinicalResultLine(line)) {
    return true;
  }
  if (isLikelyClinicalResultLine(line)) {
    return true;
  }
  return false;
}

function sentenceBreakIndexForName(span) {
  const matches = [...String(span || "").matchAll(/\.\s+[A-Z]/g)];
  for (const match of matches) {
    const beforeDot = span.slice(0, match.index + 1);
    if (/\b(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Mx|Prof|Professor)\.$/i.test(beforeDot.trim())) {
      continue;
    }
    if (/\b[A-Za-z]\.[ \t]*$/i.test(beforeDot)) {
      continue;
    }
    return match.index + 1;
  }
  return -1;
}

function refineNameLabel(label, rawText, start, end) {
  const normalized = normalizePhiLabel(label);
  if (!nameEntityLabels.has(normalized)) {
    return normalized;
  }

  const span = rawText.slice(start, end).trim().toLowerCase();
  const spanOriginal = rawText.slice(start, end).trim();

  // Facility suffix: if phrase ends with a facility word, it's an organization
  if (isLikelyFacilityPhrase(normalizePhrase(spanOriginal))) {
    return "ORGANIZATION";
  }

  // Strip leading article from single-word entities (e.g. "An ECG" -> ECG is clinical)
  const spanNoArticle = span.replace(/^(?:a|an|the)\s+/i, "");
  if (spanNoArticle !== span && spanNoArticle.length >= 2) {
    if (nonNameClinicalWords.has(spanNoArticle) || medicationNameWords.has(spanNoArticle) ||
        isProtectedClinicalAcronymToken(spanNoArticle)) {
      return normalizePhiLabel("NAME"); // Let the clinical guard filter handle it
    }
  }

  const sameLine = sameLineContext(rawText, start, end);
  const broaderContext = lineContext(rawText, start, end).toLowerCase();

  // Check immediate prefix for contact relationship indicators
  const prefix = rawText.slice(Math.max(0, start - 60), start).toLowerCase();
  const isPrefixedContact = /(?:daughter|son|mother|father|spouse|guardian|caregiver)\s*$/.test(prefix) ||
    /\b(?:emergency contact|caregiver)\s*[:#]\s*$/.test(prefix);

  if (isPrefixedContact || /^(?:daughter|son|mother|father)\s+/i.test(span)) {
    return "CONTACT NAME";
  }

  // Provider context: override generic NAME to PROVIDER NAME
  if (normalized === "NAME") {
    if (/^(?:dr|doctor)\.?\s+/i.test(span)) {
      return "PROVIDER NAME";
    }
    // Credential suffix after the name span: "John Smith, MD" or "Jane Doe MD"
    const afterSpan = rawText.slice(end, Math.min(rawText.length, end + 40));
    const credentialMatch = afterSpan.match(/^\s*(?:,\s*)?(?:MD|DO|NP|PA-?C?|RN|LPN|CRNA|PharmD|PhD|MSW|LCSW|APRN|FNP|DNP|RD|RRT|EMT)(?:\b|[\s,.;])/);
    if (credentialMatch) {
      return "PROVIDER NAME";
    }
    // Report header/author context: signed/prepared/dictated by
    if (/(?:signed by|cosigned by|dictated by|prepared by|interpreted by|read by|verified by|performed by|entered by|completed by)\s*$/i.test(prefix) ||
        /\b(?:provider|doctor|physician|attending|resident|fellow|consultant|surgeon|pcp|endocrinologist|referring provider|ordering provider|follow-up with|hospitalist|anesthesiologist)\b/.test(prefix)) {
      return "PROVIDER NAME";
    }
    // Signature block: name alone on or near a line with credential-like suffix
    // e.g., "John Smith, MD" on a line by itself near document end
    if (/(?:MD|DO|NP|PA-?C?|RN|PharmD|PhD)\b/.test(afterSpan.slice(0, 20)) &&
        !/patient|pt\.?\s*name/i.test(prefix)) {
      return "PROVIDER NAME";
    }
    if (/\b(?:one-line summary|overall assessment|patient name|pt name|patient|subjective|admitted|discharge planning)\b/.test(sameLine) ||
        /\b(?:one-line summary|overall assessment|patient name|pt name|subjective|admitted|discharge planning)\b/.test(broaderContext) ||
        /\b(?:\d{1,3}\s*(?:y\.?o\.?|yo)|\d{1,3}[- ]year[- ]old|female|male|woman|man|adult)\b/.test(sameLine)) {
      return "PATIENT NAME";
    }
  }

  return normalized;
}

function normalizePhiEntity(rawText, entity) {
  const start = Number(entity.start);
  const end = Number(entity.end);
  const label = refineNameLabel(entity.label, rawText, start, end);
  return {
    start,
    end,
    label,
    placeholder: placeholderForLabel(label),
    source: entity.source || "model",
    score: entity.score || 0,
    context: entity.context || "",
    temporal: entity.temporal || null
  };
}

function tokenToSearchText(token) {
  return String(token || "")
    .replace(/^##/, "")
    .replace(/^\u0120/, "")
    .replace(/^\u2581/, "")
    .toLowerCase();
}

function findTokenSpan(rawText, token, cursor) {
  const tokenText = tokenToSearchText(token);
  if (!tokenText || tokenText === "[unk]") {
    return null;
  }

  const lowerText = rawText.toLowerCase();
  const isContinuation = String(token).startsWith("##");
  const directStart = isContinuation ? cursor : -1;

  if (directStart >= 0 && lowerText.slice(directStart, directStart + tokenText.length) === tokenText) {
    return { start: directStart, end: directStart + tokenText.length };
  }

  const start = lowerText.indexOf(tokenText, Math.max(0, cursor - (isContinuation ? 2 : 0)));
  if (start === -1) {
    return null;
  }

  return { start, end: start + tokenText.length };
}

function constrainModelEntity(rawText, entity) {
  let { start, end } = entity;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  let span = rawText.slice(start, end);
  const newlineIndex = span.search(/\r?\n/);
  if (newlineIndex > 0) {
    end = start + newlineIndex;
    span = rawText.slice(start, end);
  }

  const headerInside = span.search(/\b(?:DOB|D\.O\.B\.|Date of birth|MRN|CSN|FIN|HAR|Encounter date|Phone|Email|Address|Facility|Unit|Room|Primary endocrinologist|Referring Provider|Emergency contact|Preferred pharmacy|Insurance ID)\s*[:#]/i);
  if (headerInside > 0) {
    end = start + headerInside;
  }

  while (start < end && /[\s:;,#]/.test(rawText[start])) {
    start += 1;
  }
  while (end > start && /[\s:;,#]/.test(rawText[end - 1])) {
    end -= 1;
  }

  if (end <= start || !rawText.slice(start, end).trim()) {
    return null;
  }

  return { ...entity, start, end };
}

export function modelPredictionsToEntities(rawText, predictions, offset = 0) {
  const entities = [];
  let cursor = 0;

  predictions.forEach((prediction) => {
    const hasOffsets = Number.isFinite(prediction.start) && Number.isFinite(prediction.end) && prediction.end > prediction.start;
    const span = hasOffsets
      ? { start: prediction.start, end: prediction.end }
      : findTokenSpan(rawText, prediction.word, cursor);
    if (!span) {
      return;
    }

    cursor = Math.max(cursor, span.end);
    const label = normalizePhiLabel(prediction);

    if (label === "O") {
      return;
    }

    const constrained = constrainModelEntity(rawText, {
      start: span.start,
      end: span.end,
      label,
      placeholder: placeholderForLabel(label),
      score: prediction.score || 0,
      source: "model"
    });

    if (!constrained) {
      return;
    }

    if (isProtectedClinicalEntityFalsePositive(rawText, constrained)) {
      return;
    }

    entities.push({
      ...constrained,
      start: offset + constrained.start,
      end: offset + constrained.end
    });
  });

  return entities;
}

function pushPatternEntity(entities, rawText, label, start, end, source = "structured identifier", context = "") {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return;
  }

  const constrained = constrainPatternEntitySpan(rawText, label, start, end);
  start = constrained.start;
  end = constrained.end;
  if (end <= start) {
    return;
  }

  const coveringEntity = entities.find((entity) => start >= entity.start && end <= entity.end);
  if (coveringEntity && !/model/.test(coveringEntity.source || "")) {
    return;
  }

  const span = rawText.slice(start, end);
  if (!span.trim()) {
    return;
  }

  const normalizedLabel = refineNameLabel(label, rawText, start, end);
  if (isProtectedClinicalEntityFalsePositive(rawText, {
    start,
    end,
    label: normalizedLabel,
    source
  })) {
    return;
  }

  entities.push({
    start,
    end,
    label: normalizedLabel,
    placeholder: placeholderForLabel(normalizedLabel),
    score: 1,
    source,
    context
  });
}

function addRegexEntities(rawText, entities, label, regex, source = "structured identifier", shouldSkip = null) {
  for (const match of rawText.matchAll(regex)) {
    if (shouldSkip && shouldSkip(rawText, match.index, match.index + match[0].length, match)) {
      continue;
    }
    pushPatternEntity(entities, rawText, label, match.index, match.index + match[0].length, source);
  }
}

function addCapturedEntity(rawText, entities, label, regex, source = "structured identifier", groupIndex = 1, context = "") {
  for (const match of rawText.matchAll(regex)) {
    const value = match[groupIndex];
    if (!value || !value.trim()) {
      continue;
    }
    const valueOffset = match[0].indexOf(value);
    if (valueOffset < 0) {
      continue;
    }
    const leadingTrim = value.match(/^\s*/)[0].length;
    const trailingTrim = value.match(/\s*$/)[0].length;
    const start = match.index + valueOffset + leadingTrim;
    const end = match.index + valueOffset + value.length - trailingTrim;
    pushPatternEntity(entities, rawText, label, start, end, source, context || match[0].split(/[:#]/)[0].trim());
  }
}

function constrainPatternEntitySpan(rawText, label, start, end) {
  let constrainedStart = start;
  let constrainedEnd = end;
  const normalizedLabel = normalizePhiLabel(label);
  if (!nameEntityLabels.has(normalizedLabel)) {
    return { start: constrainedStart, end: constrainedEnd };
  }

  let span = rawText.slice(constrainedStart, constrainedEnd);
  const sentenceBreak = sentenceBreakIndexForName(span);
  if (sentenceBreak > 0) {
    constrainedEnd = constrainedStart + sentenceBreak;
  }

  const lineEndIndex = rawText.indexOf("\n", constrainedEnd);
  const lineEnd = lineEndIndex === -1 ? rawText.length : lineEndIndex;
  const afterInLine = rawText.slice(constrainedEnd, lineEnd);
  span = rawText.slice(constrainedStart, constrainedEnd);
  if (/^\s*[:#]/.test(afterInLine)) {
    const trailingHeader = span.match(/[ \t]+(?:Room|Rm|Bed|Unit|Floor|Ward|Pod|Bay|Location|Phone|Email|Address|DOB|MRN)$/i);
    if (trailingHeader) {
      constrainedEnd = constrainedStart + trailingHeader.index;
    }
  }

  span = rawText.slice(constrainedStart, constrainedEnd);
  const credentialsMatch = span.match(/[,\s]+(?:MD|DO|NP|PA-C|PA|RN|PharmD|PhD)\b[.\s]*$/i);
  if (credentialsMatch) {
    constrainedEnd = constrainedStart + credentialsMatch.index;
  }

  const leadingPer = rawText.slice(constrainedStart, constrainedEnd).match(/^Per[ \t]+(?=(?:Dr|Doctor)\b)/i);
  if (leadingPer) {
    constrainedStart += leadingPer[0].length;
  }

  while (constrainedStart < constrainedEnd && /[\s:;,#]/.test(rawText[constrainedStart])) {
    constrainedStart += 1;
  }
  while (constrainedEnd > constrainedStart && /[\s:;,#]/.test(rawText[constrainedEnd - 1])) {
    constrainedEnd -= 1;
  }
  if (constrainedEnd > constrainedStart && rawText[constrainedEnd - 1] === "." && !/[ \t][A-Z]\.$/.test(rawText.slice(constrainedStart, constrainedEnd))) {
    constrainedEnd -= 1;
  }

  return { start: constrainedStart, end: constrainedEnd };
}

export function addStructuredSafeHarborEntities(rawText, entities = [], currentDate = null) {
  const dateValue = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})`;

  const capturedPatterns = [
    { label: "PATIENT NAME", regex: /^\s*(?:Patient(?: Name)?|Pt(?: Name)?|Name)\s*[:#]\s*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){1,3})\s*$/gmi },
    { label: "DOB", regex: new RegExp(String.raw`^\s*(?:DOB|D\.O\.B\.|Date of birth|Birth date)\s*[:#]\s*(${dateValue})\s*$`, "gmi") },
    { label: "MRN", regex: /^\s*(?:MRN|Medical Record(?: Number)?)(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
    { label: "ENCOUNTER ID", regex: /^\s*(?:CSN|FIN|HAR|Encounter(?: ID| Number))(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
    { label: "ID", regex: /^\s*(?:Account(?: Number)?|Acct|Guarantor|Policy(?: Number)?|Member(?: ID| Number)?|Insurance(?: ID| Number)?|Subscriber(?: ID| Number)?|Accession(?: Number)?|Order(?: ID| Number)?|Specimen(?: ID| Number)?|Chart(?: ID| Number)?|Case(?: ID| Number)?|Visit(?: ID| Number)?|License(?: Number)?|Certificate(?: Number)?|DEA|NPI|Device ID|Device Identifier|Serial Number|IMEI|VIN|Plate)(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
    { label: "DATE", regex: new RegExp(String.raw`^\s*(?:Encounter date|Admit(?:ted| date)?|Admission date|Discharge(?:d| date)?|Date of service|DOS|Collected|Collection(?: date| time| date\/time)?|Result(?:ed| date| time| date\/time)?|Received|Drawn|Specimen(?: collected)?|Ordered)\s*[:#]\s*(${dateValue}(?:\s+(?:at\s+)?\d{1,2}:\d{2}(?:\s*[AP]M)?)?)\s*$`, "gmi") },
    { label: "PHONE", regex: /^\s*(?:Phone|Fax|Pager|Callback|Cell|Mobile|Tel)\s*[:#]\s*((?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4})\s*$/gmi },
    { label: "EMAIL", regex: /^\s*Email\s*[:#]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*$/gmi },
    { label: "ADDRESS", regex: /^\s*Address\s*[:#]\s*(.+)$/gmi },
    { label: "FACILITY", regex: /^\s*(?:Facility|Campus|Hospital|Clinic|Site|Service location|Lab location|Ordering location)\s*[:#]\s*([^\n\r,]{2,80}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed)\s*[:#]|[,;\n\r]|$)/gmi },
    { label: "ROOM", regex: /^\s*(?:Room|Rm|Bed|ICU room|ED room|Unit|Floor|Ward|Pod|Bay|Location)\s*[:#]\s*([A-Z0-9][A-Z0-9 \t-]*\d?[A-Z0-9-]*)\s*$/gmi },
    { label: "PROVIDER NAME", regex: /^\s*(?:Primary endocrinologist|Provider|Attending|Resident|Fellow|Consultant|Surgeon|PCP|Primary care provider|Referring provider|Ordering provider)\s*[:#]\s*((?:Dr|Doctor|Mr|Mrs|Ms|Miss)\.?\s+[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,2}|[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){1,2})/gmi },
    { label: "CONTACT NAME", regex: /^\s*(?:Emergency contact|Mother|Father|Spouse|Daughter|Son|Guardian|Caregiver)\s*[:#]\s*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){1,3})/gmi },
    { label: "ORGANIZATION", regex: /^\s*Preferred pharmacy\s*[:#]\s*([^,\n\r]{2,80})/gmi },
    { label: "DOB", regex: new RegExp(String.raw`\b(?:DOB|D\.O\.B\.|Date of birth|Birth date)\s*[:#]\s*(${dateValue})`, "gi") },
    { label: "PATIENT NAME", regex: /\b(?:Patient(?: Name)?|Pt(?: Name)?)\s+(?!is\b|was\b|reports\b|states\b)([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){1,3})(?=\s+(?:MRN|Medical Record(?: Number)?|DOB|Date of birth|Birth date)\b|[,:;\n\r]|$)/gi },
    { label: "MRN", regex: /\b(?:MRN|Medical Record(?: Number)?)(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "ENCOUNTER ID", regex: /\b(?:CSN|FIN|HAR|Encounter(?: ID| Number))(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "ID", regex: /\b(?:Account(?: Number)?|Acct|Guarantor|Policy(?: Number)?|Member(?: ID| Number)?|Insurance(?: ID| Number)?|Subscriber(?: ID| Number)?|Accession(?: Number)?|Order(?: ID| Number)?|Specimen(?: ID| Number)?|Chart(?: ID| Number)?|Case(?: ID| Number)?|Visit(?: ID| Number)?)(?:\s*[:#]\s*|\s+)((?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "FACILITY", regex: /\b(?:Facility|Campus|Hospital|Clinic|Service location|Lab location|Ordering location)\s*[:#]\s*([^\n\r,]{2,80}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed)\s*[:#]|[,;\n\r]|$)/gi },
    { label: "ROOM", regex: /\b(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed|ICU room|ED room|Location)\s*[:#]\s*([A-Z0-9][A-Z0-9 \t-]{0,30}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed|Phone|Email|Address|Primary|Preferred)\s*[:#]|[.,;\n\r]|$)/gi }
  ];

  capturedPatterns.forEach(({ label, regex }) => {
    addCapturedEntity(rawText, entities, label, regex);
  });

  const directPatterns = [
    { label: "EMAIL", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { label: "URL", regex: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi },
    { label: "IP", regex: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },
    { label: "IP", regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g },
    { label: "ID", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    // Presidio SSN patterns: broader than \d{3}-\d{2}-\d{4}
    { label: "ID", regex: /\b(\d{3})[- .](\d{2})[- .](\d{4})\b/g },
    { label: "ID", regex: /\b(\d{5})-(\d{4})\b/g },
    // NPI: National Provider Identifier (10-digit, starts with 1-4)
    { label: "ID", regex: /\bNPI\s*[:#]?\s*\d{10}\b/gi },
    // Medical license number (DEA-like patterns)
    { label: "ID", regex: /\b(?:DEA|License|Lic|NPI|State License)\s*[:#]\s*([A-Z0-9]{5,16})\b/gi },
    // Credit card numbers (from Presidio CreditCardRecognizer)
    { label: "ID", regex: /\b(?!1\d{12}(?!\d))((4\d{3})|(5[0-5]\d{2})|(6\d{3})|(1\d{3})|(3\d{3}))[- ]?(\d{3,4})[- ]?(\d{3,4})[- ]?(\d{3,5})\b/g },
    // US driver license (from Presidio UsLicenseRecognizer)
    { label: "ID", regex: /\b(?:[A-Z][0-9]{3,6}|[A-Z][0-9]{5,9}|[A-Z][0-9]{6,8}|[A-Z][0-9]{4,8}|[A-Z][0-9]{9,11}|[A-Z]{1,2}[0-9]{5,6}|H[0-9]{8}|V[0-9]{6}|X[0-9]{8}|[A-Z]{2}[0-9]{2,5}|[A-Z]{2}[0-9]{3,7}|[0-9]{2}[A-Z]{3}[0-9]{5,6}|[A-Z][0-9]{13,14}|[A-Z][0-9]{18}|[A-Z][0-9]{6}R|[A-Z][0-9]{9}|[0-9]{9}[A-Z]|[A-Z]{2}[0-9]{6}[A-Z]|[0-9]{8}[A-Z]{2}|[0-9]{3}[A-Z]{2}[0-9]{4}|[A-Z][0-9][A-Z][0-9][A-Z]|[0-9]{7,8}[A-Z])\b/g, skip: isLikelyIdentifierFalsePositive },
    // US Passport (9 digits or letter+8 digits from Presidio)
    { label: "ID", regex: /\b[A-Z][0-9]{8}\b/g },
    { label: "PHONE", regex: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
    // Free-text date/time detection runs through chrono-node instead (see
    // addTemporalPatternEntities below) - it covers every format this list
    // used to enumerate by hand (ISO, slash/dash dates in any order, "Month
    // Day, Year", ordinals, weekday-relative dates, "X days ago", ...) plus
    // many phrasings this regex list never matched. What is left here is
    // narrow clinical/fiscal shorthand chrono general-purpose grammar does
    // not recognize at all: fiscal quarters and vague relative periods.
    // Fiscal quarter: Q1 2026, Q2/2026, 2nd Quarter 2026
    { label: "DATE", regex: /\bQ[1-4][/\s]?\d{2,4}\b/g },
    { label: "DATE", regex: /\b(?:1st|2nd|3rd|4th)\s+[Qq]uarter\s+\d{2,4}\b/g },
    // "last week", "next month", "previous quarter", "past year"
    { label: "DATE", regex: /\b(?:last|next|this|previous|prior|past|upcoming|following)\s+(?:week|month|quarter|year|semester|trimester|decade|century)\b/gi },
    { label: "ADDRESS", regex: /\b\d{1,6}[ \t]+[A-Z0-9][A-Za-z0-9.'-]*(?:[ \t]+[A-Za-z0-9.'-]+){0,5}[ \t]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy)\b(?:,?[ \t]+[A-Za-z .-]+)?(?:,?[ \t]+[A-Z]{2})?(?:[ \t]+\d{5}(?:-\d{4})?)?/gi, skip: isLikelyAddressFalsePositive },
    { label: "ROOM", regex: /\b(?:Room|Rm|Bed|ICU room|ED room)\b(?!\s*[:#])\s+[A-Z0-9-]*\d[A-Z0-9-]*\b/gi },
    { label: "LOCATION", regex: /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g },
    { label: "ORGANIZATION", regex: /\b[A-Z][A-Za-z&.'-]+(?:[ \t]+[A-Z][A-Za-z&.'-]+){0,4}[ \t]+Laboratory,\s+(?:University|College|Institute) of [A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,4},\s+[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*,\s+[A-Z]{2}\b/g },
    { label: "ORGANIZATION", regex: /\b(?:University|College|Institute) of [A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,4}\b/g },
    { label: "ORGANIZATION", regex: /\b[A-Z][A-Za-z&.'-]+(?:[ \t]+(?:of|and|the|[A-Z][A-Za-z&.'-]+)){0,5}[ \t]+(?:Hospital|Clinic|Pharmacy|Medical Center|Health System|Healthcare|Medical Group|University Hospital|Children's Hospital|Cancer Center|Laboratory|Lab|Rehabilitation|Rehab|Nursing Home|Skilled Nursing Facility)\b/g, skip: isLikelyOrganizationFalsePositive },
    { label: "PROVIDER NAME", regex: /\b(?:Dr|Doctor)\.?\s+[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,2}\b/g },
    { label: "NAME", regex: /\b[A-Z][a-z]{2,}[ \t]+[A-Z]\.[ \t]+[A-Z][A-Za-z'-]{5,}\b/g, skip: isLikelyNonNamePhrase },
    { label: "ID", regex: /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g, skip: isLikelyIdentifierFalsePositive },
    { label: "ID", regex: /\b[A-F0-9]{12,}\b/g },
    { label: "ID", regex: /\b[A-HJ-NPR-Z0-9]{17}\b/g }
  ];

  directPatterns.forEach(({ label, regex, skip }) => {
    addRegexEntities(rawText, entities, label, regex, "structured identifier", skip);
  });

  addTemporalPatternEntities(rawText, entities, currentDate);

  return entities;
}

function labelPriority(label) {
  const priorities = ["DOB", "EMAIL", "PHONE", "MRN", "ENCOUNTER ID", "ID", "ADDRESS", "ROOM", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME", "NAME", "FACILITY", "ORGANIZATION", "LOCATION", "DATE", "URL", "IP"];
  const index = priorities.indexOf(label);
  return index === -1 ? priorities.length : index;
}

function mergeSourceLabel(existingSource, nextSource) {
  if (!existingSource || existingSource === nextSource) {
    return nextSource || existingSource || "model";
  }
  if (!nextSource || existingSource.includes(nextSource)) {
    return existingSource;
  }
  return `${existingSource}+${nextSource}`;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function isStructuredEntity(entity) {
  return /structured|alias|residual/.test(entity.source || "");
}

function isModelEntity(entity) {
  return /model/.test(entity.source || "");
}

export function mergeEntities(entities, rawText) {
  const sorted = entities
    .filter((entity) => Number.isFinite(entity.start) && Number.isFinite(entity.end) && entity.end > entity.start)
    .map((entity) => normalizePhiEntity(rawText, entity))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];

  sorted.forEach((entity) => {
    const last = merged[merged.length - 1];
    const gap = last ? rawText.slice(last.end, entity.start) : "";
    const tokenContinuation = last &&
      entity.start >= last.end &&
      last.label === entity.label &&
      /model/.test(`${last.source} ${entity.source}`) &&
      /^[ \t.'-]{0,4}$/.test(gap);
    const shouldMerge = last && (
      rangesOverlap(last, entity) ||
      tokenContinuation
    );

    if (shouldMerge) {
      if (rangesOverlap(last, entity) && isStructuredEntity(last) && entity.source === "model") {
        return;
      }
      if (rangesOverlap(last, entity) && last.source === "model" && isStructuredEntity(entity)) {
        merged[merged.length - 1] = { ...entity };
        return;
      }

      if (rangesOverlap(last, entity) && !isModelEntity(last) && !isModelEntity(entity) && entity.start >= last.start && entity.end <= last.end) {
        last.source = mergeSourceLabel(last.source, entity.source);
        last.context = [last.context, entity.context].filter(Boolean).join("; ");
        last.temporal = last.temporal || entity.temporal || null;
        return;
      }

      last.end = Math.max(last.end, entity.end);
      last.score = Math.max(last.score, entity.score || 0);
      if (labelPriority(entity.label) < labelPriority(last.label)) {
        last.label = entity.label;
      }
      last.placeholder = placeholderForLabel(last.label);
      last.source = mergeSourceLabel(last.source, entity.source);
      last.context = [last.context, entity.context].filter(Boolean).join("; ");
      last.temporal = last.temporal || entity.temporal || null;
      return;
    }

    merged.push({
      start: entity.start,
      end: entity.end,
      label: entity.label,
      placeholder: entity.placeholder || placeholderForLabel(entity.label),
      score: entity.score || 0,
      source: entity.source || "model",
      context: entity.context || "",
      temporal: entity.temporal || null
    });
  });

  return merged;
}

export function filterLikelyFalsePositiveEntities(rawText, entities) {
  return entities.filter((entity) => {
    if (entity.label === "ROOM") {
      const normalized = normalizePhrase(rawText.slice(entity.start, entity.end));
      const facilitySuffixes = new Set([
        "center", "hospital", "clinic", "institute", "associates", "association",
        "group", "practice", "healthcare", "medical", "pharmacy", "lab", "labs",
        "services", "foundation", "network", "system", "facility", "department",
        "medicine", "surgery", "care", "partners", "physicians", "specialists",
      ]);
      const words = normalized.split(" ").filter(Boolean);
      if (words.length >= 3 && facilitySuffixes.has(words[words.length - 1])) {
        entity.label = "FACILITY";
        entity.placeholder = placeholderForLabel("FACILITY");
        return true;
      }
    }

    if (entity.label === "AGE") {
      const age = Number(rawText.slice(entity.start, entity.end).match(/\d{1,3}/)?.[0] || 0);
      return age >= 90;
    }

    if (isProtectedClinicalEntityFalsePositive(rawText, entity)) {
      return false;
    }

    if (nameEntityLabels.has(entity.label) && isLikelyNonNamePhrase(rawText, entity.start, entity.end)) {
      return false;
    }

    // Reject NAME entities that appear in medication dose-form contexts
    // (e.g. "Celebrex 200 mg" — the drug name is not a person)
    if (nameEntityLabels.has(entity.label)) {
      const beforeMedCtx = rawText.slice(Math.max(0, entity.start - 80), entity.start);
      const afterMedCtx = rawText.slice(entity.end, Math.min(rawText.length, entity.end + 80));
      if (isLikelyMedicationContext(beforeMedCtx) || isLikelyMedicationContext(afterMedCtx)) {
        const span = rawText.slice(entity.start, entity.end).replace(/\s+/g, " ").trim().toLowerCase();
        if (medicationNameWords.has(span) || medicationClassOrStemPattern.test(span)) {
          return false;
        }
      }
    }

    // Single letters cannot be real person names — reject regardless of source.
    if (nameEntityLabels.has(entity.label)) {
      const span = rawText.slice(entity.start, entity.end).replace(/\s+/g, " ").trim();
      if (span.length <= 2 || /^[a-z]$/i.test(span)) {
        return false;
      }
    }

    // Model findings inside lab/vitals/meds/imaging zones are usually clinical
    // tokens misread as identifiers (analytes, anatomy, device names). Keep
    // them only when the line carries explicit person-name context.
    if (/model/.test(entity.source || "") &&
        (nameEntityLabels.has(entity.label) || entity.label === "LOCATION") &&
        isSpanInProtectedZone(rawText, entity.start, entity.end) &&
        !hasStrongNameContext(rawText, entity.start, entity.end)) {
      return false;
    }

    if (nameEntityLabels.has(entity.label) && /model/.test(entity.source || "")) {
      const span = rawText.slice(entity.start, entity.end).replace(/\s+/g, " ").trim();
      if (!parsePersonName(span) && !hasStrongNameContext(rawText, entity.start, entity.end)) {
        // If it doesn't parse as a person name but looks like a facility, relabel it
        if (isLikelyFacilityPhrase(normalizePhrase(span))) {
          entity.label = "ORGANIZATION";
          entity.placeholder = placeholderForLabel("ORGANIZATION");
          return true;
        }
        return false;
      }
      // If it parses as a name but ends with a facility suffix, relabel
      if (parsePersonName(span) && isLikelyFacilityPhrase(normalizePhrase(span))) {
        entity.label = "ORGANIZATION";
        entity.placeholder = placeholderForLabel("ORGANIZATION");
        return true;
      }
    }

    if (entity.label === "DATE") {
      return !isLikelyDateFalsePositive(rawText, entity.start, entity.end);
    }

    if (entity.label === "ADDRESS") {
      return !isLikelyAddressFalsePositive(rawText, entity.start, entity.end);
    }

    if (entity.label === "NAME") {
      return !isLikelyNonNamePhrase(rawText, entity.start, entity.end);
    }

    if (entity.label === "LOCATION") {
      const normalized = normalizePhrase(rawText.slice(entity.start, entity.end));
      return !nonNameClinicalWords.has(normalized) &&
        !nonNameClinicalPhrases.has(normalized) &&
        !isLikelyLocationFalsePositive(rawText, entity.start, entity.end);
    }

    if (entity.label === "ORGANIZATION" || entity.label === "FACILITY") {
      const normalized = normalizePhrase(rawText.slice(entity.start, entity.end));
      if (isLikelyOrganizationFalsePositive(rawText, entity.start, entity.end)) {
        return false;
      }
      if (/model/.test(entity.source || "")) {
        return !nonNameClinicalWords.has(normalized) && !nonNameClinicalPhrases.has(normalized);
      }
    }

    return true;
  });
}

function generalizeAgesOver89(text) {
  return text
    .replace(/\bAge\s*[:#]?\s*(?:9[0-9]|1[0-9]{2})\b/gi, "Age: 90 or older")
    .replace(/(?<!\d)(?:9[0-9]|1[0-9]{2})[-\s]*(?:year[-\s]*old|years old|yo|y\/o)\b(?:\s*(?:male|female|man|woman|M|F))?/gi, "90 or older")
    .replace(/(?<!\d)(?:9[0-9]|1[0-9]{2})\s*(?:M|F)\b/g, "90 or older");
}

function monthDiff(left, right) {
  return (left.getUTCFullYear() - right.getUTCFullYear()) * 12 + (left.getUTCMonth() - right.getUTCMonth());
}

function clockTimeFromValue(value) {
  const clean = String(value || "").trim().toUpperCase();
  if (!clean) {
    return null;
  }

  let hour = null;
  let minute = null;
  let match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match) {
    hour = Number(match[1]);
    minute = Number(match[2]);
    if (match[3] === "PM" && hour < 12) hour += 12;
    if (match[3] === "AM" && hour === 12) hour = 0;
  } else {
    match = clean.match(/^(\d{3,4})$/);
    if (match) {
      const digits = match[1].padStart(4, "0");
      hour = Number(digits.slice(0, 2));
      minute = Number(digits.slice(2));
    }
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  };
}

// A span like "6/17 0800" or "17-Jun-24 at 0800" is exactly the kind of
// bare military time chrono-node's grammar doesn't recognize (it only
// understands explicit "HH:MM" or AM/PM). Rewriting a trailing bare 3-4
// digit military time into "at HH:MM" before handing the span to chrono
// keeps that clinical shorthand working without hand-parsing the date part.
function withExplicitClockTime(span) {
  const match = span.match(/^(.*\S)\s+(?:at\s+)?(\d{3,4})$/i);
  if (!match) return span;
  const clock = clockTimeFromValue(match[2]);
  if (!clock) return span;
  return `${match[1]} at ${clock.label}`;
}

// Maps a chrono-node ParsingResult into this app's {kind, year, month, day,
// hasExplicitYear, clockTime} shape, which the Hospital Day/Historical
// placement logic below (unchanged) already knows how to consume. A
// component only counts as "explicit"/known here when chrono itself marks
// it "known" rather than an implied default - that distinguishes a bare
// "6/17" (year implied, needs year inference below) from "2 days ago"
// (chrono already resolved every component from the reference date) and
// from "June 2020" (day implied - a month-only mention, never anchored to
// a specific Hospital Day).
function chronoResultToTemporal(result) {
  const known = result?.start?.knownValues;
  if (!known || !Number.isFinite(known.month)) {
    return null;
  }
  const hasDay = Number.isFinite(known.day);
  const temporal = {
    kind: hasDay ? "day" : "month",
    year: result.start.get("year"),
    month: result.start.get("month"),
    hasExplicitYear: Number.isFinite(known.year),
    clockTime: ""
  };
  if (hasDay) temporal.day = result.start.get("day");
  if (Number.isFinite(known.hour)) {
    const hour = result.start.get("hour");
    const minute = result.start.get("minute") || 0;
    temporal.clockTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return temporal;
}

function contextAroundSpan(rawText, start, end) {
  return {
    line: lineAroundSpan(rawText, start, end),
    before: rawText.slice(Math.max(0, start - 96), start),
    after: rawText.slice(end, Math.min(rawText.length, end + 64))
  };
}

function linePrefixBefore(rawText, start) {
  const lineStart = rawText.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  return rawText.slice(lineStart, start);
}

function hasClinicalTemporalContext(rawText, start, end) {
  const { line, before, after } = contextAroundSpan(rawText, start, end);
  const context = `${before} ${line} ${after}`.toLowerCase();
  const prefix = linePrefixBefore(rawText, start);
  return /^\s*(?:[\-\u2022*]\s*)?$/.test(prefix) ||
    /\b(?:admit|admitted|admission|discharge|date|dos|encounter|collected|collection|result|resulted|received|drawn|ordered|specimen|vital|vitals|lab|labs|urine labs|ct|mri|pet|imaging|xray|ultrasound|procedure|surgery|started|start|onset|began|developed|changed|resolved|improved|worsened|edited by|as of|course by date|hospital course|today|current)\b/.test(context);
}

function isCourseDateLabel(rawText, start, end) {
  const prefix = linePrefixBefore(rawText, start);
  const after = rawText.slice(end, Math.min(rawText.length, end + 4));
  return /^\s*(?:[\-\u2022*]\s*)?$/.test(prefix) && /^\s*:/.test(after);
}

// chrono-node reads the reference date it's given back out through local
// Date getters internally, while every date this app hands it (like the
// admission date) is built as a UTC-midnight Date - the same UTC/local
// mismatch flagged in chooseCurrentSourceDate below. On a machine west of
// UTC that silently rolls the reference back a calendar day, throwing every
// relative phrase ("tomorrow", "next week") off by exactly one day. Re-anchor
// to a local-midnight Date carrying the same UTC calendar day first.
function chronoReferenceDate(referenceDate) {
  const base = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  return new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
}

// Parses one already-matched date/time span (from any detector: the model,
// a labeled field like "DOB:", or addTemporalPatternEntities below) into
// this app's {kind, year, month, day, hasExplicitYear, clockTime} shape via
// chrono-node. referenceDate anchors relative phrases ("2 days ago",
// "tomorrow") - pass the admission date/current-source-date when known;
// without one, chrono falls back to the real current date, which only
// matters for entities whose year still needs inferring below anyway.
function parseTemporalSpan(value, context = {}, referenceDate = null) {
  const span = withExplicitClockTime(String(value || "").replace(/[,]/g, " ").replace(/\s+/g, " ").trim());
  if (!span) {
    return null;
  }
  const ref = chronoReferenceDate(referenceDate);
  let results;
  try {
    results = clinicalChrono.parse(span, ref, { forwardDate: false });
  } catch {
    return null;
  }
  if (!results.length) {
    return null;
  }
  // Prefer whichever result covers the most of the span - chrono can return
  // more than one match for a compound phrase, but this function is only
  // ever given text a caller already believes is a single date/time mention.
  const best = results.reduce((widest, candidate) => (candidate.text.length > widest.text.length ? candidate : widest));
  return chronoResultToTemporal(best);
}

function dateFromParts(parts, fallbackYear = null, referenceDate = null) {
  if (!parts || !parts.month || (parts.kind !== "month" && !parts.day)) {
    return null;
  }

  const year = parts.year || fallbackYear;
  if (!year) {
    return null;
  }

  const day = parts.kind === "month" ? 1 : parts.day;
  const makeDate = (candidateYear) => {
    const candidate = new Date(Date.UTC(candidateYear, parts.month - 1, day));
    if (candidate.getUTCFullYear() !== candidateYear || candidate.getUTCMonth() !== parts.month - 1 || candidate.getUTCDate() !== day) {
      return null;
    }
    return candidate;
  };

  if (parts.kind !== "month" && !parts.hasExplicitYear && referenceDate) {
    const referenceYear = referenceDate.getUTCFullYear();
    const candidateYears = [...new Set([year, referenceYear - 1, referenceYear, referenceYear + 1])];
    return candidateYears
      .map((candidateYear) => makeDate(candidateYear))
      .filter(Boolean)
      .sort((left, right) => {
        const leftDiff = left.getTime() - referenceDate.getTime();
        const rightDiff = right.getTime() - referenceDate.getTime();
        const absoluteDelta = Math.abs(leftDiff) - Math.abs(rightDiff);
        if (absoluteDelta !== 0) {
          return absoluteDelta;
        }
        return leftDiff - rightDiff;
      })[0] || null;
  }

  return makeDate(year);
}

function dateKeyFromDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function isCurrentSourceDateContext(entity) {
  const context = String(entity.context || "").toLowerCase();
  const temporal = entity.temporal || null;
  if (/^\s*(?:collected|collection(?: date| time| date\/time)?|resulted|received|drawn|issued|specimen(?: collected)?|ordered)\s*[:#]/.test(context)) {
    return true;
  }
  if (/\b(?:encounter date|date of service|dos|collected|resulted|received|drawn|specimen collected|vital|vitals|note date|as of|current|today|this am)\b/.test(context)) {
    return true;
  }
  return Boolean(temporal && !temporal.hasExplicitYear && /\blabs?\b/.test(context));
}

function temporalContextDirection(entity) {
  const context = String(entity.context || "").toLowerCase();
  if (isCurrentSourceDateContext(entity)) {
    return "current";
  }
  if (/\b(?:follow[-\s]?up|appointment|scheduled|planned|will|future|repeat|outpatient|after discharge|pending)\b/.test(context)) {
    return "future";
  }
  if (/\b(?:prior|previous|history|historical|since|diagnosed|seen on|as far back|ago|presented|admitted|started|began|developed|resolved|improved|worsened|showed|demonstrated|on admission|hospital course|course by date|course)\b/.test(context)) {
    return "past";
  }
  return "neutral";
}

function inferYearForMissingTemporal(temporal, temporalEntities, fallbackYear) {
  if (!temporal || temporal.hasExplicitYear || !fallbackYear) {
    return temporal?.year || fallbackYear;
  }

  const explicitInfos = temporalEntities
    .map((entity) => ({
      entity,
      temporal: entity.temporal || parseTemporalSpan(entity.span || "", entity)
    }))
    .filter((info) => info.temporal?.year)
    .map((info) => ({
      ...info,
      date: dateFromParts(info.temporal, info.temporal.year)
    }))
    .filter((info) => info.date);

  if (!explicitInfos.length) {
    return fallbackYear;
  }

  const candidateYears = [...new Set([
    fallbackYear - 1,
    fallbackYear,
    fallbackYear + 1,
    ...explicitInfos.flatMap((info) => [info.temporal.year - 1, info.temporal.year, info.temporal.year + 1])
  ])].filter((year) => Number.isFinite(year));

  const day = temporal.kind === "month" ? 1 : temporal.day;
  const candidates = candidateYears
    .map((year) => {
      const date = new Date(Date.UTC(year, temporal.month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== temporal.month - 1 || date.getUTCDate() !== day) {
        return null;
      }

      const score = explicitInfos.reduce((total, info) => {
        const diffDays = Math.round((info.date.getTime() - date.getTime()) / 86400000);
        const direction = temporalContextDirection(info.entity);
        if (direction === "past" && diffDays > 7) {
          return total + 10000 + diffDays;
        }
        if (direction === "future" && diffDays < -7) {
          return total + 10000 + Math.abs(diffDays);
        }
        if (direction === "current") {
          return total + Math.abs(diffDays) * 8;
        }
        return total + Math.min(Math.abs(diffDays), 365) / 365;
      }, Math.abs(year - fallbackYear) * 0.01);

      return { year, score };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || Math.abs(left.year - fallbackYear) - Math.abs(right.year - fallbackYear));

  return candidates[0]?.year || fallbackYear;
}

function pushTemporalEntity(rawText, entities, start, end, source = "temporal", context = "", precomputedTemporal = null) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return;
  }
  if (isSpanCovered(start, end, entities)) {
    return;
  }
  const temporal = precomputedTemporal || parseTemporalSpan(rawText.slice(start, end), { rawText, start, end });
  if (!temporal) {
    return;
  }
  if (temporal.kind === "day" && !temporal.hasExplicitYear && !hasClinicalTemporalContext(rawText, start, end)) {
    return;
  }
  entities.push({
    start,
    end,
    label: "DATE",
    placeholder: "[DATE]",
    score: 1,
    source,
    context: context || lineAroundSpan(rawText, start, end),
    temporal
  });
}

// Detects every date/time mention in free text via chrono-node and turns
// each into a DATE entity - the single source of free-text date detection
// for both the "structured only" pipeline (addTemporalPatternEntities) and
// the temporal fallback pass (buildDateTimeline/resolvedRedactionEntities).
// referenceDate anchors relative phrases ("2 days ago") - pass the
// admission date when known, since that already is this app's best guess
// at "today" for a pasted note.
// Chrono can misread a clinical value immediately before a date (a
// flowsheet's "VALUE DATE" shape, e.g. "Troponin: 12 1/3/26" or
// "pH, Arterial: 7.35 2/6/26") as that date's implied hour or "H.MM" clock
// time, silently absorbing the value into the match it replaces - a lab
// result, not a date. If the text is still a clean, equally-good date once
// that leading number is dropped, treat the number as untouched
// surrounding text instead of part of the date.
function dropAbsorbedLeadingValue(text, result, referenceDate) {
  const leading = result.text.match(/^\d{1,2}(?:\.\d{1,2})?\s+(?=\S)/);
  if (!leading || !Number.isFinite(result.start.knownValues.hour)) {
    return { result, start: result.index };
  }
  const trimmed = result.text.slice(leading[0].length);
  let reparsed;
  try {
    reparsed = clinicalChrono.parse(trimmed, referenceDate, { forwardDate: false });
  } catch {
    return { result, start: result.index };
  }
  const [first] = reparsed;
  if (first && first.index === 0 && first.text.length === trimmed.length) {
    return { result: first, start: result.index + leading[0].length };
  }
  return { result, start: result.index };
}

export function collectTemporalEntities(rawText, referenceDate = null) {
  const text = String(rawText || "");
  const ref = chronoReferenceDate(referenceDate);
  const entities = [];
  let rawResults;
  try {
    rawResults = clinicalChrono.parse(text, ref, { forwardDate: false });
  } catch {
    rawResults = [];
  }
  const results = rawResults.map((rawResult) => dropAbsorbedLeadingValue(text, rawResult, ref));

  results.forEach(({ result, start }) => {
    const end = start + result.text.length;
    if (isLikelyNonDateSlashMeasurement(text, start, end)) {
      return;
    }
    if (isLikelyDateFalsePositive(text, start, end) && !isCourseDateLabel(text, start, end) && !hasClinicalTemporalContext(text, start, end)) {
      return;
    }
    const temporal = chronoResultToTemporal(result);
    if (!temporal) {
      return;
    }
    // A trailing time right after the date - bare military time like
    // "6/17 0800", or a plain "HH:MM" chrono left as its own separate match
    // instead of merging into the date (seen in flowsheet rows like
    // "12 1/3/26 11:35") - falls outside this result's own match boundary.
    // Fold it in here so the placeholder still carries the time.
    let entityEnd = end;
    if (!temporal.clockTime) {
      const tail = text.slice(end, Math.min(text.length, end + 12)).match(/^\s+(?:at\s+)?(\d{1,2}:\d{2}(?:\s*[AP]M)?|\d{3,4})\b/i);
      const clock = tail && clockTimeFromValue(tail[1]);
      if (clock) {
        entityEnd = end + tail[0].length;
        temporal.clockTime = clock.label;
      }
    }
    pushTemporalEntity(text, entities, start, entityEnd, "temporal", "", temporal);
  });

  return mergeEntities(entities, text);
}

// Feeds collectTemporalEntities' chrono-node detection into the structured
// (regex-based) Safe Harbor pass, in the same {start,end,label:"DATE",...}
// shape addRegexEntities/addCapturedEntity produce above, so it merges with
// everything else in this function's output identically either way.
function addTemporalPatternEntities(rawText, entities, currentDate = null) {
  collectTemporalEntities(rawText, currentDate).forEach((entity) => {
    if (isSpanCovered(entity.start, entity.end, entities)) {
      return;
    }
    entities.push(entity);
  });
}

function chooseCurrentSourceDate(temporalEntities, currentDate = null) {
  if (currentDate) {
    const d = new Date(currentDate);
    // Use UTC getters, not local getters: a date-only string like
    // "2026-05-01" parses as UTC midnight, and reading it back with local
    // getters can roll it back a calendar day west of UTC.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const parsedEntities = temporalEntities
    .map((entity) => ({
      entity,
      temporal: entity.temporal || parseTemporalSpan(entity.span || "", entity)
    }))
    .filter((info) => info.temporal);
  const explicitYears = parsedEntities
    .map((info) => info.temporal?.year)
    .filter((year) => Number.isFinite(year));
  const fallbackYear = explicitYears.length ? Math.max(...explicitYears) : new Date().getFullYear();

  const explicitDayEntities = parsedEntities
    .filter((info) => info.temporal.kind === "day" && info.temporal.hasExplicitYear)
    .map((info) => ({
      ...info,
      date: dateFromParts(info.temporal, info.temporal.year)
    }))
    .filter((info) => info.date);
  const explicitCurrent = explicitDayEntities.filter((info) => isCurrentSourceDateContext(info.entity));
  if (explicitCurrent.length) {
    return explicitCurrent.reduce((latest, info) => (
      !latest || info.date > latest ? info.date : latest
    ), null);
  }

  const explicitAnchor = explicitDayEntities.reduce((latest, info) => (
    !latest || info.date > latest ? info.date : latest
  ), null);
  const dateForInfo = (info) => {
    const inferredYear = info.temporal.hasExplicitYear
      ? info.temporal.year
      : inferYearForMissingTemporal(info.temporal, temporalEntities, explicitAnchor?.getUTCFullYear() || fallbackYear);
    return dateFromParts(info.temporal, inferredYear, explicitAnchor);
  };

  const dayEntities = parsedEntities
    .map((info) => ({
      ...info,
      date: dateForInfo(info)
    }))
    .filter((info) => info.temporal?.kind === "day" && info.date);
  if (!dayEntities.length) {
    return null;
  }

  const prioritized = dayEntities.filter((info) => isCurrentSourceDateContext(info.entity));
  if (prioritized.length) {
    return prioritized.reduce((latest, info) => (
      !latest || info.date > latest ? info.date : latest
    ), null);
  }

  if (!explicitAnchor && dayEntities.some((info) => !info.temporal.hasExplicitYear)) {
    return dayEntities.reduce((latest, info) => (
      !latest || info.entity.start > latest.entity.start ? info : latest
    ), null).date;
  }

  const pool = dayEntities;
  return pool.reduce((latest, info) => (
    !latest || info.date > latest ? info.date : latest
  ), null);
}

// True calendar history (a prior encounter, PMH, an old diagnosis) — as
// opposed to an event narrated in past tense but still part of the current
// admission ("was admitted", "started vancomycin 2 days ago").
function isHistoricalTemporalContext(entity) {
  const context = String(entity?.context || "").toLowerCase();
  return /\b(?:prior to admission|pre-?admission|preadmission|previous(?:ly)? (?:diagnosed|admitted|admission|hospitalization|episode|visit)|history of|historical|remote history|past medical history|\bpmh\b|last (?:admission|hospitalization)|outpatient history|diagnosed (?:in|on|back in)|since (?:19|20)\d{2})\b/.test(context);
}

// Anything more than two weeks before admission with no explicit narrative
// tying it to this stay is treated as an unrelated past encounter rather
// than guessed at as a Hospital Day offset.
const HISTORICAL_LOOKBACK_DAYS = 14;

function classifyTemporalPlacement(temporal, date, admissionDate, entity) {
  if (!admissionDate || !date || temporal.kind === "month") {
    const year = temporal.year || date?.getUTCFullYear() || null;
    return { historical: true, year };
  }
  if (isHistoricalTemporalContext(entity)) {
    return { historical: true, year: date.getUTCFullYear() };
  }
  const dayDiff = Math.round((date.getTime() - admissionDate.getTime()) / 86400000);
  if (dayDiff < -HISTORICAL_LOOKBACK_DAYS) {
    return { historical: true, year: date.getUTCFullYear() };
  }
  return { historical: false, hospitalDay: dayDiff <= 0 ? 1 : dayDiff + 1 };
}

function formatRelativeTemporalPlaceholder(entity, currentSourceDate, fallbackYear = null) {
  const span = entity.span || "";
  const temporal = entity.temporal || parseTemporalSpan(span, entity, currentSourceDate);
  if (!temporal) {
    return "[Historical date]";
  }
  const year = temporal.year || fallbackYear || currentSourceDate?.getUTCFullYear() || null;
  const date = dateFromParts(temporal, year, currentSourceDate);
  const placement = classifyTemporalPlacement(temporal, date, currentSourceDate, entity);
  if (placement.historical) {
    return placement.year ? `[Historical: ${placement.year}]` : "[Historical date]";
  }
  const clockTime = temporal.clockTime || "";
  return clockTime
    ? `[Hospital Day ${placement.hospitalDay} at ${clockTime}]`
    : `[Hospital Day ${placement.hospitalDay}]`;
}

function buildDateTimeline(rawText, entities, currentDate = null, { includeTemporalFallback = true } = {}) {
  const fallbackTemporalEntities = includeTemporalFallback ? collectTemporalEntities(rawText, currentDate) : [];
  const dateEntities = mergeEntities([...entities, ...fallbackTemporalEntities], rawText)
    .filter((entity) => entity.label === "DATE")
    .map((entity) => {
      const span = rawText.slice(entity.start, entity.end).trim();
      const temporal = entity.temporal || parseTemporalSpan(span, { rawText, start: entity.start, end: entity.end }, currentDate);
      return { entity, span, temporal };
    });

  const currentSourceDate = chooseCurrentSourceDate(dateEntities.map((info) => ({
    ...info.entity,
    span: info.span,
    temporal: info.temporal
  })), currentDate);
  const fallbackYear = currentSourceDate ? currentSourceDate.getUTCFullYear() : new Date().getFullYear();
  const placeholdersByEntity = new Map();

  dateEntities.forEach((info) => {
    const entityKey = `${info.entity.start}:${info.entity.end}`;
    placeholdersByEntity.set(entityKey, formatRelativeTemporalPlaceholder({
      ...info.entity,
      span: info.span,
      temporal: info.temporal,
      rawText
    }, currentSourceDate, fallbackYear));
  });

  return placeholdersByEntity;
}

function makeDateTimelinePlaceholder(entity, dateTimeline) {
  return dateTimeline.get(`${entity.start}:${entity.end}`) || "[DATE]";
}

function resolvedRedactionEntities(rawText, entities, currentDate = null, { includeTemporalFallback = true } = {}) {
  const temporalEntities = includeTemporalFallback ? collectTemporalEntities(rawText, currentDate) : [];
  const allEntities = mergeEntities([...entities, ...temporalEntities], rawText);
  const dateTimeline = buildDateTimeline(rawText, allEntities, currentDate, { includeTemporalFallback });
  return allEntities.map((entity) => ({
    ...entity,
    renderedPlaceholder: entity.label === "DATE"
      ? makeDateTimelinePlaceholder(entity, dateTimeline)
      : entity.placeholder || placeholderForLabel(entity.label)
  }));
}

// Once a value on a "Date"/"Time"-labeled line has been converted to a
// Hospital Day / Historical placeholder, the field label itself is renamed
// so the column header can no longer be paired with a real calendar date.
const TIMELINE_DATE_LABEL_SOURCE = String.raw`Encounter date|Admit(?:ted)?(?: date)?|Admission date|Discharge(?:d)?(?: date)?|Date of service|DOS|Collected|Collection(?: date| time| date\/time)?|Result(?:ed)?(?: date| time| date\/time)?|Received|Drawn|Specimen(?: collected)?|Ordered|Date`;

function renameTimelineFieldLabels(text) {
  return String(text || "")
    .replace(new RegExp(String.raw`^(\s*(?:[-*]\s*)?)(?:${TIMELINE_DATE_LABEL_SOURCE})(\s*:\s*)(?=\[(?:Hospital Day|Historical))`, "gim"), "$1Timeline$2")
    .replace(/^(\s*(?:[-*]\s*)?)Time(\s*:\s*)(?=\[(?:Hospital Day|Historical))/gim, "$1Elapsed Time$2");
}

// Numbers repeated same-label lab results in chronological (document) order
// so a reader can scan a lab's trend without any of the entries carrying a
// real date; the last occurrence of each repeated label is the newest draw.
function applyLabOrdinalTags(text) {
  const sourceText = String(text || "");
  if (!/\[Hospital Day|\[Historical/.test(sourceText)) {
    return sourceText;
  }

  const lines = sourceText.split("\n");
  const groups = new Map();
  lines.forEach((line, index) => {
    if (!/\[Hospital Day|\[Historical/.test(line)) {
      return;
    }
    const parsed = clinicalResultLabelFromLine(line);
    // The value once carried the raw date/time that isLikelyClinicalResultLine
    // keys off of; after redaction it starts with our placeholder instead, so
    // only clinicalResultLabelFromLine's own name/header exclusions gate this.
    if (!parsed || !/\[(?:Hospital Day|Historical)/.test(parsed.value)) {
      return;
    }
    const key = normalizePhrase(parsed.label);
    if (!key) {
      return;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(index);
  });

  groups.forEach((indices) => {
    if (indices.length < 2) {
      return;
    }
    const total = indices.length;
    indices.forEach((lineIndex, position) => {
      const ordinal = position + 1;
      const tag = ordinal === total ? `**[LATEST_RESULT]** [Lab ${ordinal}/${total}]` : `[Lab ${ordinal}/${total}]`;
      lines[lineIndex] = `${tag} ${lines[lineIndex]}`;
    });
  });

  return lines.join("\n");
}

function redactResolvedEntities(rawText, entities) {
  let cursor = 0;
  let output = "";

  entities.forEach((entity) => {
    output += rawText.slice(cursor, entity.start);
    output += entity.renderedPlaceholder || entity.placeholder || placeholderForLabel(entity.label);
    cursor = entity.end;
  });

  output += rawText.slice(cursor);
  const cleaned = cleanupDeidArtifacts(normalizeResidualTemporalPhi(generalizeAgesOver89(output.trim())));
  return applyLabOrdinalTags(renameTimelineFieldLabels(cleaned));
}

export function redactFromEntities(rawText, entities, currentDate = null, options = {}) {
  return redactResolvedEntities(rawText, resolvedRedactionEntities(rawText, entities, currentDate, options));
}

// Any legacy relative-date placeholder from a previous export (e.g. a note
// that was already de-identified with an older version of this tool) is
// collapsed to a year-only marker — there is no admission anchor available
// at this point to recompute a trustworthy Hospital Day number from it.
function oldTimelinePlaceholderToRelative(year) {
  return year ? `[Historical: ${year}]` : "[Historical date]";
}

function normalizeLegacyDatePlaceholders(text) {
  return String(text || "")
    .replace(/\[(CURRENT SOURCE DATE)(?:\s*-\s*((?:19|20)\d{2}))?\]/gi, (_, _label, year) => oldTimelinePlaceholderToRelative(year))
    .replace(/\[DATE\s+\d+(?:\s*-\s*((?:19|20)\d{2}))?(?:,\s*[^\]]*)?\]/gi, (_, year) => oldTimelinePlaceholderToRelative(year));
}

function replaceTemporalEntitiesWithRelativeText(text, currentDate = null) {
  const sourceText = String(text || "");
  const entities = collectTemporalEntities(sourceText);
  if (!entities.length) {
    return sourceText;
  }

  const currentSourceDate = chooseCurrentSourceDate(entities, currentDate);
  const fallbackYear = currentSourceDate ? currentSourceDate.getUTCFullYear() : new Date().getFullYear();
  let cursor = 0;
  let output = "";

  entities.forEach((entity) => {
    output += sourceText.slice(cursor, entity.start);
    output += formatRelativeTemporalPlaceholder({
      ...entity,
      span: sourceText.slice(entity.start, entity.end),
      rawText: sourceText
    }, currentSourceDate, fallbackYear);
    cursor = entity.end;
  });

  output += sourceText.slice(cursor);
  return output;
}

export function cleanupDeidArtifacts(text) {
  return String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\[(\d+(?:\.\d+)?)\s+\[NAME\]\s*(\d+(?:\.\d+)?)\s*([A-Z%/ ]{0,16})\]/gi, (_, left, right, unit) => `[${left}-${right}${unit ? ` ${unit.trim()}` : ""}]`)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function normalizeResidualTemporalPhi(text, currentDate = null) {
  const withoutArtifacts = cleanupDeidArtifacts(text);
  const withoutLegacy = normalizeLegacyDatePlaceholders(withoutArtifacts);
  const withoutExactDates = replaceTemporalEntitiesWithRelativeText(withoutLegacy, currentDate);
  return cleanupDeidArtifacts(withoutExactDates);
}

function summarizeEntities(entities) {
  return entities.reduce((counts, entity) => {
    const label = (entity.placeholder || placeholderForLabel(entity.label)).replace(/^\[|\]$/g, "");
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
}

function entityFlags(rawText, entities) {
  if (!entities.length) {
    return ["No PHI spans detected. Review still required."];
  }

  return entities.slice(0, 12).map((entity) => {
    const placeholder = (entity.placeholder || placeholderForLabel(entity.label)).replace(/^\[|\]$/g, "");
    const span = entity.label === "DATE"
      ? "exact date converted to relative timeline"
      : `${placeholder} redacted`;
    const score = /model/.test(entity.source) && entity.score ? ` ${(entity.score * 100).toFixed(0)}%` : "";
    const source = entity.source ? ` (${entity.source}${score})` : score;
    return `${placeholder}${source}: ${span}`;
  });
}

function normalizeWarningSnippet(value) {
  const snippet = String(value || "").replace(/\s+/g, " ").trim();
  return snippet.length > 96 ? `${snippet.slice(0, 93)}...` : snippet;
}

function addResidualWarning(warnings, severity, type, snippet, reason, start = null, end = null, label = null) {
  const cleanSnippet = normalizeWarningSnippet(snippet);
  if (!cleanSnippet || cleanSnippet.startsWith("[") && cleanSnippet.endsWith("]")) {
    return;
  }

  const key = `${severity}|${type}|${cleanSnippet.toLowerCase()}`;
  if (warnings.some((warning) => warning.key === key)) {
    return;
  }

  warnings.push({ key, severity, type, snippet: cleanSnippet, reason, start, end, label });
}

function isInsideBracketPlaceholder(text, start, end) {
  const open = text.lastIndexOf("[", start);
  const close = text.indexOf("]", start);
  return open !== -1 && close !== -1 && close >= end && (text.indexOf("[", open + 1) === -1 || text.indexOf("[", open + 1) > start);
}

function addResidualMatches(warnings, text, severity, type, regex, reason, shouldSkip = null) {
  for (const match of text.matchAll(regex)) {
    if (isInsideBracketPlaceholder(text, match.index, match.index + match[0].length)) {
      continue;
    }
    if (shouldSkip && shouldSkip(text, match.index, match.index + match[0].length, match)) {
      continue;
    }
    addResidualWarning(warnings, severity, type, match[0], reason, match.index, match.index + match[0].length);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSpanCovered(start, end, entities) {
  return entities.some((entity) => start >= entity.start && end <= entity.end);
}

function cleanNameText(value) {
  return String(value || "")
    .replace(/^[A-Za-z /().-]+[:#]\s*/, "")
    .replace(/^\s*(?:daughter|son|mother|father|spouse|guardian|caregiver)\s+/i, "")
    .replace(/\s+(?:MD|DO|NP|PA-C|PA|RN|PharmD|PhD)\b\.?/gi, "")
    .split(/\s+(?:mother|father|spouse|daughter|son|guardian|caregiver)\b/i)[0]
    .split(/\s*,\s*/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function stripHonorific(value) {
  return String(value || "").replace(new RegExp(String.raw`^${honorificPatternSource}\.?\s+`, "i"), "").trim();
}

function normalizeNameKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeNameLoose(value) {
  return normalizeNameKey(value).replace(/[^a-z]/g, "");
}

function isLikelyHumanNamePart(part) {
  const token = String(part || "").replace(/^[^A-Za-z]+|[^A-Za-z.'-]+$/g, "");
  if (!/^[A-Za-z][A-Za-z.'-]{1,}$/.test(token) || !/[a-z]/.test(token)) {
    return false;
  }
  return !isProtectedClinicalAcronymToken(token) && !nonNameClinicalWords.has(normalizeClinicalGuardToken(token));
}

function parsePersonName(value) {
  const cleaned = cleanNameText(value);
  if (!cleaned) {
    return null;
  }

  if (sentenceBreakIndexForName(cleaned) > 0) {
    return null;
  }

  const titleMatch = cleaned.match(new RegExp(String.raw`^(${honorificPatternSource})\.?\s+`, "i"));
  const title = titleMatch ? titleMatch[1].replace(/\.$/, "") : "";
  const withoutTitle = title ? cleaned.slice(titleMatch[0].length).trim() : cleaned;
  const rawParts = withoutTitle
    .split(/\s+/)
    .map((part) => part.replace(/^[^A-Za-z]+|[^A-Za-z.'-]+$/g, ""))
    .filter(Boolean)
    .filter((part) => !suffixPattern.test(part) && !credentialPattern.test(part));
  const realParts = rawParts.filter((part) => !/^[A-Z]\.?$/.test(part));

  if (!realParts.length) {
    return null;
  }

  const normalized = normalizePhrase(withoutTitle);
  if (nonNameClinicalPhrases.has(normalized) || isLikelyClinicalNameLikePhrase(normalized)) {
    return null;
  }

  if (!realParts.some(isLikelyHumanNamePart)) {
    return null;
  }

  const hasFullName = realParts.length >= 2;
  const hasTitleSurname = Boolean(title) && realParts.length === 1;
  if (!hasFullName && !hasTitleSurname) {
    return null;
  }

  const surname = realParts[realParts.length - 1];
  const first = hasFullName ? realParts[0] : "";
  return {
    original: cleaned,
    title,
    parts: rawParts,
    realParts,
    first,
    surname,
    key: normalizeNameKey(withoutTitle),
    surnameKey: normalizeNameKey(surname),
    looseSurnameKey: normalizeNameLoose(surname)
  };
}

function isDistinctiveSurname(surname) {
  const normalized = normalizeNameKey(surname);
  return /[-']/.test(surname) || normalized.replace(/[^a-z]/g, "").length >= 9;
}

function isPlausibleNameText(value) {
  return Boolean(parsePersonName(value));
}

function aliasVariantsFromSpan(span) {
  const parsed = parsePersonName(span);
  if (!parsed) {
    return [];
  }
  const withoutTitle = parsed.parts.join(" ");
  const variants = new Set([parsed.original, withoutTitle]);
  if (parsed.title) {
    variants.add(`${parsed.title} ${withoutTitle}`);
    variants.add(`${parsed.title}. ${withoutTitle}`);
    variants.add(`${parsed.title} ${parsed.surname}`);
    variants.add(`${parsed.title}. ${parsed.surname}`);
  }
  if (parsed.first && parsed.surname) {
    variants.add(`${parsed.first} ${parsed.surname}`);
  }
  if (isDistinctiveSurname(parsed.surname)) {
    variants.add(parsed.surname);
  }
  return [...variants].filter(Boolean);
}

function addAlias(aliases, identity, text, options = {}) {
  const clean = cleanNameText(text);
  if (!clean) {
    return;
  }
  const key = normalizeNameKey(clean);
  if (!key || nonNameClinicalPhrases.has(key)) {
    return;
  }
  if (!aliases.has(key) || !options.requiresStrongContext) {
    aliases.set(key, {
      text: clean,
      label: identity.label,
      placeholder: placeholderForLabel(identity.label),
      identityId: identity.id,
      requiresStrongContext: Boolean(options.requiresStrongContext),
      source: options.source || "alias repeat",
      surnameKey: identity.surnameKey,
      looseSurnameKey: identity.looseSurnameKey
    });
  }
}

function buildAliasVariantsForIdentity(identity) {
  const variants = [];
  const full = identity.parts.join(" ");
  if (full) {
    variants.push({ text: full });
  }
  if (identity.title && full) {
    variants.push({ text: `${identity.title} ${full}` });
    variants.push({ text: `${identity.title}. ${full}` });
  }
  if (identity.first && identity.surname) {
    variants.push({ text: `${identity.first} ${identity.surname}` });
    variants.push({ text: identity.first, requiresStrongContext: true, source: "first-name alias" });
  }

  const distinctive = isDistinctiveSurname(identity.surname);
  if (identity.surname) {
    variants.push({ text: identity.surname, requiresStrongContext: !distinctive });
    const titles = identity.title ? [identity.title] : ["Mr", "Mrs", "Ms", "Miss", "Mx"];
    titles.forEach((title) => {
      variants.push({ text: `${title} ${identity.surname}` });
      variants.push({ text: `${title}. ${identity.surname}` });
    });
  }

  if (identity.surname.includes("-")) {
    identity.surname.split("-").filter((part) => part.length >= 4).forEach((part) => {
      variants.push({ text: part, requiresStrongContext: true });
      if (identity.title) {
        variants.push({ text: `${identity.title} ${part}`, requiresStrongContext: true });
        variants.push({ text: `${identity.title}. ${part}`, requiresStrongContext: true });
      }
    });
  }

  return variants;
}

function buildIdentityGraph(rawText, entities) {
  const identities = [];
  const identityKeys = new Set();
  entities.forEach((entity) => {
    if (!nameEntityLabels.has(entity.label)) {
      return;
    }
    const parsed = parsePersonName(rawText.slice(entity.start, entity.end));
    if (!parsed) {
      return;
    }
    const label = entity.label === "NAME" ? refineNameLabel("NAME", rawText, entity.start, entity.end) : entity.label;
    const key = `${label}|${parsed.key}|${parsed.surnameKey}`;
    if (identityKeys.has(key)) {
      return;
    }
    identityKeys.add(key);
    identities.push({
      id: `identity-${identities.length + 1}`,
      label,
      title: parsed.title,
      first: parsed.first,
      surname: parsed.surname,
      surnameKey: parsed.surnameKey,
      looseSurnameKey: parsed.looseSurnameKey,
      parts: parsed.parts,
      source: entity.source || "identity"
    });
  });

  const aliases = new Map();
  identities.forEach((identity) => {
    buildAliasVariantsForIdentity(identity).forEach((variant) => {
      addAlias(aliases, identity, variant.text, variant);
    });
  });
  return { identities, aliases };
}

function inferNameAliases(rawText, entities) {
  return buildIdentityGraph(rawText, entities).aliases;
}

function addAliasRepeatEntities(rawText, entities, aliases) {
  aliases.forEach((alias) => {
    const regex = new RegExp(`(^|[^A-Za-z])(${escapeRegExp(alias.text)})(?=$|[^A-Za-z])`, "g");
    for (const match of rawText.matchAll(regex)) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      const coveringEntity = entities.find((entity) => start >= entity.start && end <= entity.end);
      if (coveringEntity && !/model/.test(coveringEntity.source || "")) {
        continue;
      }
      if (alias.requiresStrongContext && !hasStrongNameContext(rawText, start, end)) {
        continue;
      }
      pushPatternEntity(entities, rawText, alias.label, start, end, alias.source || "alias repeat", `known alias: ${alias.text}`);
    }
  });
  return entities;
}

function hasStrongNameContext(rawText, start, end) {
  const span = rawText.slice(start, end);
  const sameLine = sameLineContext(rawText, start, end);
  return /^(?:dr|doctor|mr|mrs|ms|miss)\.?\s+/i.test(span) ||
    /\b(?:one-line summary|overall assessment|patient name|pt name|patient|provider|doctor|physician|attending|resident|fellow|consultant|surgeon|pcp|endocrinologist|referring provider|ordering provider|emergency contact|mother|father|spouse|daughter|son|guardian|caregiver|follow-up with|follow up with|spoke with|call|called|contact|can bring|confirm|before leaving|prescriptions to|admitted|discharge|scheduling|appointment|reports|reported|states|stated|says|said|endorses|denies|feels|complains|presents|presented|at bedside)\b/.test(sameLine) ||
    /\b(?:\d{1,3}\s*(?:y\.?o\.?|yo)|\d{1,3}[- ]year[- ]old|female|male|woman|man|adult)\b/.test(sameLine);
}

function addContextualCapturedName(rawText, entities, label, regex, source) {
  for (const match of rawText.matchAll(regex)) {
    const value = match[1];
    if (!value) {
      continue;
    }
    const start = match.index + match[0].indexOf(value);
    const end = start + value.length;
    const coveringEntity = entities.find((entity) => start >= entity.start && end <= entity.end);
    if (coveringEntity && !/model/.test(coveringEntity.source || "")) {
      continue;
    }
    if (isLikelyNonNamePhrase(rawText, start, end)) {
      continue;
    }
    const parsed = parsePersonName(value);
    if (!parsed) {
      continue;
    }
    pushPatternEntity(entities, rawText, label, start, end, source);
  }
}

function addContextualPersonNameEntities(rawText, entities) {
  const ageIntro = String.raw`(?:is|was|presents|presented|reports|states|has)\s+(?:an?\s+)?(?:\d{1,3}\s*(?:y\.?o\.?|yo)|\d{1,3}[- ]year[- ]old|female|male|woman|man|adult|patient)\b`;
  const contextualPatterns = [
    {
      label: "PATIENT NAME",
      source: "patient identity",
      regex: new RegExp(String.raw`\b((?:${patientHonorificPatternSource})\.?\s+${namePartPatternSource}(?:[ \t]+${namePartPatternSource}){0,4})\s+${ageIntro}`, "g")
    },
    {
      label: "PATIENT NAME",
      source: "patient identity",
      regex: new RegExp(String.raw`\b(${fullNamePatternSource})\s+${ageIntro}`, "g")
    },
    {
      label: "PATIENT NAME",
      source: "patient identity",
      regex: new RegExp(String.raw`\b(?:[Oo]ne-line summary|[Oo]verall [Aa]ssessment|[Ss]ubjective|HPI)\s*:\s*((?:${patientHonorificPatternSource}\.?\s+)?${fullNamePatternSource})(?=\s+(?:is|was|presents|presented|reports|states|has)\b)`, "g")
    },
    {
      label: "PROVIDER NAME",
      source: "provider identity",
      regex: new RegExp(String.raw`\b(?:[Ff]ollow-?up with|[Ff]ollow up with|[Ss]cheduling with|[Ss]chedule with|[Aa]ppointment with|[Cc]onsulted|[Ss]een by|[Ss]taffed with|[Ss]igned by|[Pp]er)\s+((?:Dr|Doctor)\.?\s+${namePartPatternSource}(?:[ \t]+${namePartPatternSource}){0,3})`, "g")
    },
    {
      label: "CONTACT NAME",
      source: "contact identity",
      regex: new RegExp(String.raw`\b(?:[Ss]poke with|[Cc]all|[Cc]alled|[Uu]pdate|[Uu]pdated)\s+(${fullNamePatternSource})(?=\s+(?:at|about|regarding|for|if)\b|[,.;])`, "g")
    }
  ];

  contextualPatterns.forEach(({ label, regex, source }) => {
    addContextualCapturedName(rawText, entities, label, regex, source);
  });
  return entities;
}

function isDictionaryRecallClinicalToken(norm) {
  return nonNameClinicalWords.has(norm) ||
    clinicalAnchorWords.has(norm) ||
    medicationSaltOrFormWords.has(norm) ||
    protectedClinicalAcronyms.has(norm) ||
    isLikelyMedicationWord(norm);
}

// Dictionary-based recall layer: catches names the model and the contextual
// regexes miss (lowercase relatives, ALL-CAPS headers, comma-reversed names)
// by looking tokens up in Census/SSA name dictionaries with context scoring.
function addDictionaryNameEntities(rawText, entities) {
  const candidates = collectDictionaryNameCandidates(rawText, {
    isClinicalToken: isDictionaryRecallClinicalToken,
    zoneTypeForSpan: (start, end) => spanZoneType(rawText, start, end)
  });
  for (const candidate of candidates) {
    if (isLikelyNonNamePhrase(rawText, candidate.start, candidate.end)) {
      continue;
    }
    // Facility vocabulary means this is an institution, not a person; the
    // structured facility patterns own that case.
    if (vocabularyWords(rawText.slice(candidate.start, candidate.end)).some((word) => facilitySuffixWords.has(word))) {
      continue;
    }
    pushPatternEntity(entities, rawText, candidate.label, candidate.start, candidate.end, "dictionary name recall", candidate.context);
  }
  return entities;
}

function editDistanceAtMostOne(a, b) {
  if (!a || !b || Math.abs(a.length - b.length) > 1) {
    return false;
  }
  if (a === b) {
    return true;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function findAliasForCandidate(candidate, aliases) {
  const exactKey = normalizeNameKey(candidate);
  const strippedKey = normalizeNameKey(stripHonorific(candidate));
  if (aliases.has(exactKey)) {
    return aliases.get(exactKey);
  }
  if (aliases.has(strippedKey)) {
    return aliases.get(strippedKey);
  }
  return null;
}

function findFuzzyIdentityForCandidate(candidate, graph) {
  const parsed = parsePersonName(candidate);
  if (!parsed || !parsed.looseSurnameKey || parsed.looseSurnameKey.length < 7) {
    return null;
  }
  return graph.identities.find((identity) => (
    identity.looseSurnameKey &&
    isDistinctiveSurname(identity.surname) &&
    editDistanceAtMostOne(parsed.looseSurnameKey, identity.looseSurnameKey)
  )) || null;
}

function hasProseContinuationAfterName(rawText, end) {
  const after = rawText.slice(end, Math.min(rawText.length, end + 80));
  const firstWord = after.match(/^[\s,;:.!?-]*(\w+)/)?.[1] || "";
  return /^(?:was|were|is|are|has|had|have|came|went|arrived|left|departed|presented|reported|stated|said|told|spoke|called|denied|endorsed|complained|asked|requested|received|underwent|developed|began|started|stopped|continued|remained|became|felt|noted|showed|demonstrated|required|needed|wanted|tried|failed|agreed|refused|decided|planned|expected|hoped|thought|believed|knew|found|gave|took|made|got|put|went|followed|walked|ran|sat|stood|lay|slept|ate|drank|used|tolerated|a|an|the|in|on|at|to|for|with|from|by|about|after|before|during|and|or|but|not|also|now|then|today|yesterday|will|would|should|could|can|may|might|who|that|which|this|these|those|his|her|their|our|my|your|its|no|yes|very|just|quite|rather|still|yet|already|soon|currently|currently|initially|subsequently|eventually|finally)$/i.test(firstWord);
}

function shouldAutoPromoteStandalonePersonName(candidate) {
  const parsed = parsePersonName(candidate);
  if (!parsed) {
    return false;
  }

  const hasMiddleInitial = parsed.parts
    .slice(1, -1)
    .some((part) => /^[A-Z]\.?$/.test(part));
  const surnameLength = normalizeNameLoose(parsed.surname).length;
  return Boolean(parsed.title) ||
    isDistinctiveSurname(parsed.surname) ||
    (hasMiddleInitial && surnameLength >= 6);
}

function promoteResidualNameEntities(rawText, entities, graph) {
  const patterns = [
    new RegExp(String.raw`\b${titledNamePatternSource}\b`, "g"),
    new RegExp(String.raw`\b${fullNamePatternSource}\b`, "g")
  ];

  patterns.forEach((namePattern) => {
    for (const match of rawText.matchAll(namePattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const candidate = match[0];
      if (isSpanCovered(start, end, entities) || isLikelyNonNamePhrase(rawText, start, end)) {
        continue;
      }

      if (sentenceBreakIndexForName(candidate) > 0 || isClinicalGuardOnlyText(candidate) || !parsePersonName(candidate)) {
        continue;
      }

      const alias = findAliasForCandidate(candidate, graph.aliases);
      const fuzzyIdentity = alias ? null : findFuzzyIdentityForCandidate(candidate, graph);
      const standalonePersonName = !alias && !fuzzyIdentity && shouldAutoPromoteStandalonePersonName(candidate);
      const parsedCandidate = parsePersonName(candidate);
      const proseNameSignal = !alias && !fuzzyIdentity && !standalonePersonName &&
        parsedCandidate && parsedCandidate.realParts.length >= 2 &&
        parsedCandidate.realParts.every(isLikelyHumanNamePart) &&
        (hasProseContinuationAfterName(rawText, end) ||
         (parsedCandidate.first && commonFirstNames.has(normalizeNameKey(parsedCandidate.first))));
      if (!alias && !fuzzyIdentity && !standalonePersonName && !proseNameSignal && !hasStrongNameContext(rawText, start, end)) {
        continue;
      }
      if (alias?.requiresStrongContext && !hasStrongNameContext(rawText, start, end)) {
        continue;
      }
      // A capitalized pair whose final word is clinical vocabulary ("An ECG",
      // "Valarie's Hyperlipidemia") is prose, not a surname — other layers
      // still catch the actual name token on its own.
      const candidateWords = vocabularyWords(candidate);
      const candidateLastWord = candidateWords[candidateWords.length - 1] || "";
      if (!alias && !fuzzyIdentity &&
          (nonNameClinicalWords.has(candidateLastWord) || protectedClinicalAcronyms.has(candidateLastWord))) {
        continue;
      }
      // "Green Valley Medical Center Dialysis" parses like a person name but
      // contains facility vocabulary — redact it as a facility, not a person.
      const facilityLike = !alias && !fuzzyIdentity &&
        candidateWords.some((word) => facilitySuffixWords.has(word));
      const label = facilityLike
        ? "FACILITY"
        : alias?.label || fuzzyIdentity?.label || refineNameLabel("NAME", rawText, start, end);
      const source = alias ? "alias repeat" : fuzzyIdentity ? "fuzzy alias" : "residual auto-fix";
      const context = alias ? "known identity alias" : fuzzyIdentity ? `near ${fuzzyIdentity.surname}` : standalonePersonName ? "standalone person name pattern" : proseNameSignal ? "prose name signal" : "strong name context";
      let entityStart = start;
      if (parsedCandidate && parsedCandidate.original !== candidate) {
        const cleanedOffset = candidate.indexOf(parsedCandidate.original);
        if (cleanedOffset > 0) {
          entityStart = start + cleanedOffset;
        }
      }
      pushPatternEntity(entities, rawText, label, entityStart, end, source, context);
    }
  });
  return entities;
}

export function scanResidualPhi(text) {
  const warnings = [];
  const sourceText = String(text || "");

  addResidualMatches(warnings, sourceText, "high", "email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "direct contact identifier");
  addResidualMatches(warnings, sourceText, "high", "URL", /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, "web identifier");
  addResidualMatches(warnings, sourceText, "high", "IP address", /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g, "network identifier");
  addResidualMatches(warnings, sourceText, "high", "SSN", /\b\d{3}-\d{2}-\d{4}\b/g, "direct identifier");
  addResidualMatches(warnings, sourceText, "high", "phone or fax", /\b(?:Phone|Fax|Pager|Callback|Cell|Mobile|Tel)?\s*[:#]?\s*(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/gi, "direct contact identifier");
  addResidualMatches(warnings, sourceText, "high", "DOB", /\b(?:DOB|D\.O\.B\.|Date of birth|Birth date)\s*[:#]?\s*(?:\d{4}-\d{1,2}-\d{1,2}|(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})\b/gi, "birth date");
  addResidualMatches(warnings, sourceText, "high", "exact date", /\b\d{4}-\d{1,2}-\d{1,2}\b/g, "exact calendar date");
  addResidualMatches(warnings, sourceText, "high", "exact date", /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?\b/g, "exact calendar date", isLikelyDateFalsePositive);
  addResidualMatches(warnings, sourceText, "high", "exact date", /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/gi, "exact calendar date");
  addResidualMatches(warnings, sourceText, "high", "identifier", /\b(?:MRN|Medical Record Number|Medical Record(?! Number)|CSN|FIN|HAR|Encounter(?: ID| Number)|Account Number|Acct|Policy Number|Policy(?! Number)|Member(?: ID| Number)|Member(?! ID| Number)|Insurance(?: ID| Number)|Insurance(?! ID| Number)|Subscriber(?: ID| Number)|Subscriber(?! ID| Number)|Accession Number|Accession(?! Number)|Order(?: ID| Number)|Order(?! ID| Number)|Specimen(?: ID| Number)|Specimen(?! ID| Number)|Chart(?: ID| Number)|Chart(?! ID| Number)|Case(?: ID| Number)|Case(?! ID| Number)|Visit(?: ID| Number)|Visit(?! ID| Number)|License Number|License(?! Number)|Certificate Number|Certificate(?! Number)|DEA|NPI|Device ID|Device Identifier|Serial Number|IMEI|VIN|Plate)\b(?:\s*[:#]\s*|\s+)(?=[A-Z0-9./_-]*\d)[A-Z0-9][A-Z0-9./_-]{2,}\b/gi, "record, insurance, device, or other unique code");
  addResidualMatches(warnings, sourceText, "high", "street address", /\b\d{1,6}[ \t]+[A-Z0-9][A-Za-z0-9.'-]*(?:[ \t]+[A-Za-z0-9.'-]+){0,5}[ \t]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy)\b/gi, "street address", isLikelyAddressFalsePositive);
  addResidualMatches(warnings, sourceText, "medium", "ZIP or postal code", /\b(?:ZIP|Zip code|Postal code)\s*[:#]?\s*\d{5}(?:-\d{4})?\b/gi, "geographic detail smaller than state");
  addResidualMatches(warnings, sourceText, "medium", "unit or room", /\b(?:Room|Rm|Bed|ICU room|ED room)\b\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*\b/gi, "care location detail");
  addResidualMatches(warnings, sourceText, "medium", "unit or room", /\b(?:Unit|Floor|Ward|Pod|Bay|Location)\b\s*[:#]\s*[A-Z0-9-]+\b/gi, "care location detail");
  addResidualMatches(warnings, sourceText, "medium", "facility", /\b[A-Z][A-Za-z&.'-]+(?:[ \t]+(?:of|and|the|[A-Z][A-Za-z&.'-]+)){0,5}[ \t]+(?:Hospital|Clinic|Pharmacy|Medical Center|Health System|Healthcare|Medical Group|University Hospital|Children's Hospital|Cancer Center|Laboratory|Lab|Rehabilitation|Rehab|Nursing Home|Skilled Nursing Facility)\b/g, "facility or organization name", isLikelyOrganizationFalsePositive);
  addResidualMatches(warnings, sourceText, "medium", "possible full name", new RegExp(String.raw`\b(?:${titledNamePatternSource}|${fullNamePatternSource})\b`, "g"), "capitalized name-like phrase", isLikelyNonNamePhrase);
  addResidualMatches(warnings, sourceText, "medium", "ID-like string", /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g, "long alphanumeric code", isLikelyIdentifierFalsePositive);
  addResidualMatches(warnings, sourceText, "medium", "age over 89", /\b(?:Age\s*[:#]?\s*(?:9[0-9]|1[0-9]{2})|(?:9[0-9]|1[0-9]{2})\s*(?:yo|y\/o|years? old|M|F|male|female))\b/gi, "age must be generalized");
  addResidualMatches(warnings, sourceText, "review", "rare identifying context", /\b(?:celebrity|publicized|news article|newspaper|police report|lawsuit|incarcerated|inmate|professional athlete|mayor|judge|teacher at|works at|employer|specific school|rare occupation|well-known)\b/gi, "context can identify a patient even without direct IDs");

  return warnings.map(({ key, ...warning }) => warning);
}

export function splitTextForModel(rawText, maxChars = 700, overlap = 80) {
  if (rawText.length <= maxChars) {
    return [{ text: rawText, offset: 0 }];
  }

  const chunks = [];
  let start = 0;
  while (start < rawText.length) {
    let end = Math.min(rawText.length, start + maxChars);
    if (end < rawText.length) {
      const newline = rawText.lastIndexOf("\n", end);
      if (newline > start + Math.floor(maxChars * 0.55)) {
        end = newline + 1;
      }
    }

    chunks.push({ text: rawText.slice(start, end), offset: start });
    if (end >= rawText.length) {
      break;
    }
    const nextStart = Math.max(0, end - overlap);
    start = nextStart <= start ? end : nextStart;
  }
  return chunks;
}

function splitChunkForRetry(chunk) {
  const midpoint = Math.floor(chunk.text.length / 2);
  const preferredBreaks = [
    chunk.text.lastIndexOf("\n", midpoint),
    chunk.text.indexOf("\n", midpoint),
    chunk.text.lastIndexOf(". ", midpoint),
    chunk.text.indexOf(". ", midpoint),
    chunk.text.lastIndexOf(" ", midpoint),
    chunk.text.indexOf(" ", midpoint)
  ].filter((index) => index > 80 && index < chunk.text.length - 80);
  let splitIndex = preferredBreaks.length
    ? preferredBreaks.sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0]
    : midpoint;
  if (chunk.text.slice(splitIndex, splitIndex + 2) === ". ") {
    splitIndex += 2;
  } else if (chunk.text[splitIndex] === "\n" || chunk.text[splitIndex] === " ") {
    splitIndex += 1;
  }
  splitIndex = Math.max(1, Math.min(chunk.text.length - 1, splitIndex));
  return [
    { text: chunk.text.slice(0, splitIndex), offset: chunk.offset },
    { text: chunk.text.slice(splitIndex), offset: chunk.offset + splitIndex }
  ].filter((part) => part.text.trim());
}

function looksLikeModelLengthError(error) {
  const message = String(error?.message || error || "");
  return /\b512\b/.test(message) ||
    /broadcast.*dimension/i.test(message) ||
    /maximum sequence|max(?:imum)? length|position embeddings|input_ids.*dims/i.test(message);
}

function overlapsAny(entity, entities) {
  return entities.some((other) => rangesOverlap(entity, other));
}

function entitySignature(entities) {
  return entities
    .map((entity) => `${entity.start}:${entity.end}:${entity.label}:${entity.source}`)
    .sort()
    .join("|");
}

function expandIdentityGraphEntities(rawText, seedEntities, maxPasses = 3) {
  let entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addDictionaryNameEntities(rawText, seedEntities), rawText));
  let graph = buildIdentityGraph(rawText, entities);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const before = entitySignature(entities);
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addContextualPersonNameEntities(rawText, entities), rawText));
    graph = buildIdentityGraph(rawText, entities);
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addAliasRepeatEntities(rawText, entities, graph.aliases), rawText));
    graph = buildIdentityGraph(rawText, entities);
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(promoteResidualNameEntities(rawText, entities, graph), rawText));
    graph = buildIdentityGraph(rawText, entities);
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addAliasRepeatEntities(rawText, entities, graph.aliases), rawText));
    if (entitySignature(entities) === before) {
      break;
    }
  }
  return { entities, graph };
}

function deidentifyFromEntities(rawText, entities, modelResult = { modelId: null, modelStatus: "structured only" }, currentDate = null, options = {}) {
  const renderedEntities = resolvedRedactionEntities(rawText, entities, currentDate, options);
  const text = redactResolvedEntities(rawText, renderedEntities);
  const counts = summarizeEntities(renderedEntities);
  const residualWarnings = scanResidualPhi(text);
  const residualFlags = residualWarnings.slice(0, 12).map(formatPhiWarning);
  const modelFlag = modelResult.modelStatus === "Model unavailable; structured redaction only." || modelResult.modelStatus === "structured only"
    ? [modelResult.modelStatus === "structured only" ? "Structured-only de-identification." : "Model unavailable; structured redaction only."]
    : [`Model: ${modelResult.modelId}`];

  return {
    text,
    counts,
    redactionTotal: renderedEntities.length,
    residualWarnings,
    flags: [...modelFlag, ...residualFlags, ...entityFlags(rawText, renderedEntities)],
    entities: renderedEntities,
    modelId: modelResult.modelId,
    modelStatus: modelResult.modelStatus
  };
}

function formatPhiWarning(warning) {
  const label = warning.severity === "high" ? "High" : warning.severity === "medium" ? "Medium" : "Review";
  return `${label}: ${warning.type} - ${warning.snippet}`;
}

export function deidentifyTextStructuredOnly(rawText, currentDate = null) {
  const bracketEntities = collectBracketedPlaceholderEntities(rawText);
  const { entities } = expandIdentityGraphEntities(rawText, addStructuredSafeHarborEntities(rawText, bracketEntities, currentDate));
  return deidentifyFromEntities(rawText, entities, { modelId: null, modelStatus: "structured only" }, currentDate);
}

const BRACKET_LABEL_MAP = {
  "NAME": "NAME",
  "PATIENT NAME": "PATIENT NAME",
  "PATIENT": "PATIENT NAME",
  "PROVIDER NAME": "PROVIDER NAME",
  "PROVIDER": "PROVIDER NAME",
  "DOCTOR": "PROVIDER NAME",
  "DR": "PROVIDER NAME",
  "CONTACT": "CONTACT NAME",
  "CONTACT NAME": "CONTACT NAME",
  "ORGANIZATION": "ORGANIZATION",
  "ORG": "ORGANIZATION",
  "FACILITY": "FACILITY",
  "HOSPITAL": "FACILITY",
  "CLINIC": "FACILITY",
  "LOCATION": "LOCATION",
  "ADDRESS": "ADDRESS",
  "PHONE": "PHONE",
  "EMAIL": "EMAIL",
  "MRN": "MRN",
  "MEDICAL RECORD": "MRN",
  "DOB": "DOB",
  "DATE OF BIRTH": "DOB",
  "AGE": "AGE",
  "DATE": "DATE",
  "ID": "ID",
  "ROOM": "ROOM",
  "URL": "URL",
  "IP": "IP",
  "SSN": "ID",
  "LICENSE": "ID"
};

function collectBracketedPlaceholderEntities(rawText) {
  const entities = [];
  const pattern = /\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(rawText)) !== null) {
    const bracketContent = match[1].trim();
    const upperContent = bracketContent.toUpperCase();
    let label = BRACKET_LABEL_MAP[upperContent];
    if (!label) {
      // Long or sentence-like bracket content is template/instructional text
      // ("[Other medications not related to hyperlipidemia, if applicable]"),
      // not a placeholder — leave it for the normal layers to scan.
      const wordCount = bracketContent.split(/\s+/).filter(Boolean).length;
      if (wordCount > 4 || /[.;]/.test(bracketContent) ||
          /^(?:insert|enter|add|list|describe|include|specify|other|see|refer)\b/i.test(bracketContent)) {
        continue;
      }
      label = "NAME";
    }
    entities.push({
      start: match.index,
      end: match.index + match[0].length,
      label,
      placeholder: `[${label}]`,
      score: 1,
      source: "bracketed placeholder",
      context: match[0]
    });
  }
  return entities;
}


const _webgpuCache = { checked: false, device: "" };

export function detectWebGPUDevice() {
  if (_webgpuCache.checked) {
    return _webgpuCache.device;
  }
  _webgpuCache.checked = true;
  try {
    if (typeof navigator !== "undefined" && navigator.gpu) {
      _webgpuCache.device = "webgpu";
    }
  } catch (_) {
    // navigator.gpu access can throw in some locked-down environments
  }
  return _webgpuCache.device;
}

export function createDeidentifier(options = {}) {
  const pipelineFactory = options.pipelineFactory || null;
  const pipelineDevice = options.device || detectWebGPUDevice();
  const dtype = options.dtype || DEFAULT_DTYPE;
  const withStableRuntime = (candidateOptions = {}) => ({
    ...candidateOptions,
    ...(candidateOptions.device || pipelineDevice
      ? { device: candidateOptions.device || pipelineDevice }
      : {})
  });
  const modelCandidates = options.modelCandidates || [
    { modelId: options.primaryModelId || GLINER_PII_MODEL_ID, options: withStableRuntime({ dtype }) },
    { modelId: options.primaryModelId || GLINER_PII_MODEL_ID, options: withStableRuntime({}) },
    { modelId: options.primaryModelId || DEFAULT_PRIMARY_MODEL_ID, options: withStableRuntime({ dtype }) },
    { modelId: options.primaryModelId || DEFAULT_PRIMARY_MODEL_ID, options: withStableRuntime({}) },
    { modelId: options.fallbackModelId || I2B2_CLINICALBERT_MODEL_ID, options: withStableRuntime({ dtype }) },
    { modelId: options.fallbackModelId || I2B2_CLINICALBERT_MODEL_ID, options: withStableRuntime({}) },
    { modelId: options.fallbackModelId || MULTILANG_PII_MODEL_ID, options: withStableRuntime({ dtype }) },
    { modelId: options.fallbackModelId || MULTILANG_PII_MODEL_ID, options: withStableRuntime({}) },
    { modelId: options.fallbackModelId || DEFAULT_FALLBACK_MODEL_ID, options: withStableRuntime({ dtype }) },
    { modelId: options.fallbackModelId || DEFAULT_FALLBACK_MODEL_ID, options: withStableRuntime({}) }
  ].filter((candidate) => candidate.modelId);
  const onModelStatus = typeof options.onModelStatus === "function" ? options.onModelStatus : () => {};
  let modelPromise = null;
  let loadedModel = null;

  function setStatus(update) {
    onModelStatus(update);
  }

  function reportProgress(callback, update) {
    if (typeof callback === "function") {
      callback(update);
    }
  }

  async function loadModel(loadOptions = {}) {
    const onProgress = loadOptions.onProgress;
    if (!pipelineFactory) {
      throw new Error("No model pipeline factory configured.");
    }
    if (loadedModel) {
      reportProgress(onProgress, { stage: "model-ready", message: "Local PII model ready.", percent: 0.18 });
      return loadedModel;
    }
    if (!modelPromise) {
      setStatus({ message: "Preparing local PII model. First load can take a minute.", ready: false });
      reportProgress(onProgress, { stage: "model-loading", message: "Preparing local PII model. First load can take a minute.", percent: 0.04 });
      modelPromise = (async () => {
        const errors = [];
        for (const candidate of modelCandidates) {
          try {
            reportProgress(onProgress, { stage: "model-loading", message: `Loading ${candidate.modelId}...`, percent: 0.08 });
            const loadedPipeline = await pipelineFactory("token-classification", candidate.modelId, candidate.options || {});
            loadedModel = {
              pipeline: loadedPipeline,
              modelId: candidate.modelId,
              modelStatus: candidate.modelId === DEFAULT_FALLBACK_MODEL_ID ? "fallback model" : "primary model",
              inferenceOptions: { ...(candidate.inferenceOptions || {}) }
            };
            setStatus({
              message: `Local PII model ready.${loadedModel.modelStatus === "fallback model" ? " Fallback model in use." : ""}`,
              ready: true,
              modelId: loadedModel.modelId,
              modelStatus: loadedModel.modelStatus
            });
            reportProgress(onProgress, { stage: "model-ready", message: "Local PII model ready.", percent: 0.18 });
            return loadedModel;
          } catch (error) {
            errors.push(error);
            console.warn(`Could not load de-ID model ${candidate.modelId}.`, error);
          }
        }
        setStatus({ message: "Model unavailable; structured redaction only.", ready: false });
        throw errors[errors.length - 1] || new Error("No de-ID model could be loaded.");
      })().catch((error) => {
        modelPromise = null;
        throw error;
      });
    }
    return modelPromise;
  }

  async function detectModelEntities(rawText, detectOptions = {}) {
    const onProgress = detectOptions.onProgress;
    try {
      const model = await loadModel({ onProgress });
      const entities = [];
      const failedChunks = [];
      const chunks = splitTextForModel(rawText);
      let completedChunks = 0;
      async function runChunk(chunk, depth = 0) {
        try {
          reportProgress(onProgress, {
            stage: "model-running",
            message: `Scanning with local model (${Math.min(completedChunks + 1, chunks.length)} of ${chunks.length})...`,
            percent: 0.18 + (completedChunks / Math.max(1, chunks.length)) * 0.5
          });
          const predictions = await model.pipeline(chunk.text, { ignore_labels: [], ...model.inferenceOptions });
          entities.push(...modelPredictionsToEntities(chunk.text, predictions || [], chunk.offset));
        } catch (error) {
          if (chunk.text.length > 180 && depth < 4 && looksLikeModelLengthError(error)) {
            for (const part of splitChunkForRetry(chunk)) {
              await runChunk(part, depth + 1);
            }
            return;
          }
          failedChunks.push({ offset: chunk.offset, length: chunk.text.length, error });
          console.warn("Skipped one de-ID model chunk.", error);
        }
      }
      for (const chunk of chunks) {
        await runChunk(chunk);
        completedChunks += 1;
        reportProgress(onProgress, {
          stage: "model-running",
          message: `Local model pass ${completedChunks} of ${chunks.length} complete...`,
          percent: 0.18 + (completedChunks / Math.max(1, chunks.length)) * 0.5
        });
      }
      return {
        entities,
        modelId: model.modelId,
        modelStatus: failedChunks.length ? `${model.modelStatus}; partial model pass` : model.modelStatus,
        modelChunkFailures: failedChunks.length
      };
    } catch (error) {
      console.warn("Model unavailable.", error);
      reportProgress(onProgress, { stage: "model-unavailable", message: "Local PII model unavailable.", percent: 0.2 });
      return {
        entities: [],
        modelId: null,
        modelStatus: "Model unavailable; structured redaction only."
      };
    }
  }

  async function deidentifyText(rawText, runOptions = {}) {
    const mode = runOptions.mode || options.mode || "hybrid";
    const onProgress = runOptions.onProgress;
    const admissionDate = runOptions.admissionDate || null;
    reportProgress(onProgress, { stage: "starting", message: "Starting local de-identification...", percent: 0.02 });

    const bracketEntities = collectBracketedPlaceholderEntities(rawText);

    if (mode === "structured-only") {
      reportProgress(onProgress, { stage: "structured", message: "Running structured redaction...", percent: 0.25 });
      return deidentifyTextStructuredOnly(rawText, admissionDate);
    }

    const modelResult = await detectModelEntities(rawText, { onProgress });
    reportProgress(onProgress, { stage: "filtering", message: "Filtering model findings...", percent: 0.7 });
    let modelEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(modelResult.entities, rawText));

    if (mode === "model-only") {
      reportProgress(onProgress, { stage: "redacting", message: "Creating redacted preview...", percent: 0.9 });
      return deidentifyFromEntities(rawText, modelEntities, modelResult, admissionDate, {
        includeTemporalFallback: runOptions.includeTemporalFallback !== false
      });
    }

    reportProgress(onProgress, { stage: "structured", message: "Running structured redaction and date conversion...", percent: 0.76 });
    let structuredEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addStructuredSafeHarborEntities(rawText, bracketEntities, admissionDate), rawText));
    modelEntities = modelEntities.filter((entity) => !overlapsAny(entity, structuredEntities));
    reportProgress(onProgress, { stage: "aliases", message: "Checking repeated names and aliases...", percent: 0.84 });
    const { entities } = expandIdentityGraphEntities(rawText, [...structuredEntities, ...modelEntities]);
    reportProgress(onProgress, { stage: "redacting", message: "Creating redacted preview...", percent: 0.92 });
    const result = deidentifyFromEntities(rawText, entities, modelResult, admissionDate);
    reportProgress(onProgress, { stage: "complete", message: "De-identified preview ready.", percent: 1 });
    return result;
  }

  return {
    deidentifyText,
    detectModelEntities,
    loadModel,
    isModelLoading: () => Boolean(modelPromise && !loadedModel),
    isModelReady: () => Boolean(loadedModel),
    getLoadedModel: () => loadedModel
  };
}
