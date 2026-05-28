export const DEFAULT_PRIMARY_MODEL_ID = "rtrigoso/bert-small-pii-detection-ONNX";
export const DEFAULT_FALLBACK_MODEL_ID = "onnx-community/stanford-deidentifier-base-ONNX";
export const OPENMED_MODEL_ID = "sidupadhyay/OpenMed-PII-SuperClinical-Small-44M-v1-ONNX";
export const DEFAULT_DTYPE = "q8";

export const MODEL_PROFILES = {
  rtrigoso: {
    id: DEFAULT_PRIMARY_MODEL_ID,
    mobileFeasible: true,
    expectedQuantizedBytes: 28845474,
    notes: "Small Transformers.js ONNX PII model; fastest mobile candidate."
  },
  stanford: {
    id: DEFAULT_FALLBACK_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 109651017,
    notes: "Clinical deidentifier fallback; larger but more stable in current benchmarks."
  },
  openmed: {
    id: OPENMED_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 283404624,
    notes: "Large clinical PII model; metadata-only in normal benchmark."
  }
};

const phiLabelMap = {
  HCW: "PROVIDER NAME",
  PATIENT: "PATIENT NAME",
  PERSON: "NAME",
  PER: "NAME",
  NAME: "NAME",
  FIRST_NAME: "NAME",
  LAST_NAME: "NAME",
  EMAIL_ADDRESS: "EMAIL",
  EMAIL: "EMAIL",
  PHONE_NUMBER: "PHONE",
  PHONE: "PHONE",
  FAX_NUMBER: "PHONE",
  URL: "URL",
  IP_ADDRESS: "IP",
  IPV4: "IP",
  IPV6: "IP",
  DATE_TIME: "DATE",
  DATE: "DATE",
  DATE_OF_BIRTH: "DOB",
  DOB: "DOB",
  "DOB REDACTED": "DOB",
  MEDICAL_RECORD: "MRN",
  MEDICAL_RECORD_NUMBER: "MRN",
  MRN: "MRN",
  CSN: "ENCOUNTER ID",
  FIN: "ENCOUNTER ID",
  HAR: "ENCOUNTER ID",
  ACCOUNT_NUMBER: "ID",
  UNIQUE_ID: "ID",
  CUSTOMER_ID: "ID",
  ID_CARD: "ID",
  INSURANCE_NUMBER: "ID",
  HEALTH_PLAN_BENEFICIARY_NUMBER: "ID",
  SSN: "ID",
  US_SSN: "ID",
  TAX_ID: "ID",
  DRIVER_LICENSE: "ID",
  US_DRIVER_LICENSE: "ID",
  US_PASSPORT: "ID",
  PASSPORT_NUMBER: "ID",
  STREET_ADDRESS: "ADDRESS",
  ADDRESS: "ADDRESS",
  CITY: "LOCATION",
  STATE: "LOCATION",
  COUNTY: "LOCATION",
  COUNTRY: "LOCATION",
  POSTCODE: "LOCATION",
  ZIPCODE: "LOCATION",
  ZIP: "LOCATION",
  LOCATION: "LOCATION",
  HOSPITAL: "FACILITY",
  FACILITY: "FACILITY",
  ORGANIZATION: "ORGANIZATION",
  COMPANY_NAME: "ORGANIZATION",
  VENDOR: "ORGANIZATION",
  ROOM: "ROOM",
  UNIT: "ROOM",
  BED: "ROOM",
  BIOMETRIC: "ID",
  VEHICLE: "ID",
  VEHICLE_ID: "ID",
  VEHICLE_IDENTIFIER: "ID",
  DEVICE_ID: "ID",
  DEVICE_IDENTIFIER: "ID",
  MAC_ADDRESS: "ID",
  IMEI: "ID"
};

const nameEntityLabels = new Set(["NAME", "PATIENT NAME", "PROVIDER NAME", "CONTACT NAME"]);

const nonNameClinicalPhrases = new Set([
  "basic information", "chief complaint", "principal problem", "active problems", "resolved problems",
  "general neurology", "history problem", "past medical", "past medical history", "surgical history",
  "family history", "social history", "home meds", "home medications", "current medications",
  "current medication", "prior medications", "inpatient medications", "scheduled medications",
  "prn medications", "infusion medications", "hospital course", "interval history", "progress note",
  "discharge summary", "admission note", "transfer summary", "operative note", "procedure note",
  "radiology report", "pathology report", "microbiology results", "blood culture", "urine culture",
  "respiratory culture", "assessment plan", "assessment and plan", "physical exam", "focused exam",
  "review systems", "review of systems", "allergies", "vital signs", "lab results", "laboratory results",
  "consult note", "endocrinology consult", "cardiology consult", "neurology consult",
  "nephrology consult", "pulmonology consult", "infectious disease consult", "infectious disease",
  "gastroenterology consult", "treatment team", "scheduled meds", "current inpatient", "vital sign",
  "heart rate", "output summary", "basic metabolic", "complete blood", "reticulated platelets",
  "plt morphology", "normal absolute", "platelet count", "absolute neutrophils", "absolute lymphocytes",
  "atypical lymphocytes", "absolute monocytes", "absolute basophils", "absolute eosinophils",
  "burr cells", "anion gap", "see comment", "toxic granulation", "total protein", "bilirubin total",
  "alk phos", "base excess", "phosphorus level", "iron studies", "thyroid studies", "warfarin sodium",
  "insulin glargine", "insulin lispro", "insulin regular", "metformin hydrochloride", "heparin infusion",
  "vancomycin trough", "blood glucose", "urine output", "intake output", "mental status",
  "oxygen saturation", "respiratory rate", "blood pressure", "temperature maximum", "temperature minimum",
  "mean arterial", "arterial pressure", "encephalopathy diabetes", "diabetes mellitus", "acute kidney",
  "kidney injury", "renal function", "heart failure", "respiratory failure", "altered mental",
  "general medicine", "type 1 diabetes mellitus", "type 2 diabetes mellitus", "free t4",
  "beta hydroxybutyrate", "beta-hydroxybutyrate"
]);

const nonNameClinicalWords = new Set([
  "abdomen", "abdominal", "absolute", "acetaminophen", "active", "activity", "acute", "admission",
  "albumin", "alk", "alkaline", "allergies", "alt", "and", "anion", "anesthesia", "antibiotic",
  "anticoagulation", "arterial", "assessment", "ast", "atypical", "basophils", "base", "basic",
  "beta", "bicarbonate", "bilirubin", "blood", "bladder", "bowel", "brain", "bun", "burr",
  "calcium", "cardiac", "cardiology", "cardiovascular", "catheter", "cbc", "cells", "cervical",
  "chloride", "chief", "clinic", "cloudy", "coagulation", "code", "comment", "complaint", "complete",
  "consult", "coordination", "count", "course", "cranial", "creatinine", "critical", "culture",
  "current", "decreased", "dermatology", "diabetes", "diagnoses", "diagnosis", "diet", "differential",
  "dimer", "discharge", "drain", "dvt", "edema", "elevated", "emergency", "encephalopathy",
  "endocrine", "endocrinology", "eosinophils", "esr", "exam", "excess", "failure", "family",
  "ferritin", "fibrinogen", "follow", "free", "gap", "gastroenterology", "general", "glucose",
  "gram", "granulation", "granulocytes", "gu", "hba1c", "hct", "heart", "hematocrit", "hematology",
  "hemoglobin", "hepatology", "hgb", "high", "history", "home", "hospital", "hospitalist",
  "hydroxybutyrate", "imaging", "immature", "impression", "infectious", "information", "injury",
  "inpatient", "intact", "intake", "iron", "kidney", "lab", "laboratory", "labs", "lactate",
  "lactic", "level", "line", "lipase", "liver", "low", "lumbar", "lung", "lungs", "lymphocytes",
  "magnesium", "maximum", "mean", "medical", "medication", "medications", "medicine", "meds",
  "mental", "microbiology", "minimum", "monocytes", "morphology", "motor", "musculoskeletal",
  "nephrology", "nerve", "neuro", "neurologic", "neurology", "neurosurgery", "neutrophils", "normal",
  "note", "objective", "obstetrics", "oncology", "operative", "orthopedics", "outpatient", "output",
  "palliative", "pathology", "past", "pco2", "pediatrics", "ph", "pharmacy", "phos", "phosphatase",
  "phosphate", "phosphorus", "physical", "platelet", "platelets", "plt", "po2", "potassium",
  "precautions", "principal", "prn", "problem", "problems", "procedure", "procalcitonin", "progress",
  "protein", "psychiatry", "pt", "ptt", "pulmonary", "pulmonology", "radiology", "rare", "rate",
  "rbc", "red", "reflex", "renal", "report", "resolved", "respiratory", "reticulated", "reticulocyte",
  "review", "rheumatology", "saturation", "scheduled", "schistocytes", "see", "sensory", "severe",
  "sign", "signs", "sodium", "social", "spinal", "spine", "sputum", "stain", "status", "subjective",
  "studies", "summary", "surgery", "surgical", "systems", "t4", "team", "temperature", "therapy",
  "thoracic", "thyroid", "tibc", "tone", "total", "toxic", "transfer", "transferrin", "trauma",
  "treatment", "triglycerides", "troponin", "tsh", "turbid", "ua", "unit", "urinary", "urine",
  "urology", "vascular", "vital", "vitals", "warfarin", "wbc", "white", "wound"
]);

const clinicalAnchorWords = new Set([
  "absolute", "albumin", "alk", "alkaline", "anion", "antibiotic", "anticoagulation", "arterial",
  "ast", "atypical", "basophils", "base", "bicarbonate", "bilirubin", "blood", "bun", "burr",
  "calcium", "cardiology", "cbc", "chloride", "comment", "consult", "creatinine", "culture", "dimer",
  "eosinophils", "endocrinology", "esr", "excess", "ferritin", "fibrinogen", "gap", "glucose",
  "heart", "hematocrit", "hematology", "hemoglobin", "hgb", "imaging", "inpatient", "intake",
  "iron", "kidney", "lab", "laboratory", "labs", "lactate", "lipase", "lymphocytes", "magnesium",
  "medications", "meds", "mental", "microbiology", "monocytes", "morphology", "nephrology",
  "neurology", "neutrophils", "note", "oncology", "output", "pathology", "pco2", "ph", "phos",
  "phosphatase", "phosphate", "phosphorus", "platelet", "platelets", "plt", "po2", "potassium",
  "procalcitonin", "protein", "ptt", "pulmonology", "radiology", "rate", "rbc", "renal", "report",
  "respiratory", "reticulated", "reticulocyte", "saturation", "scheduled", "schistocytes", "sodium",
  "studies", "summary", "team", "temperature", "thyroid", "tibc", "total", "toxic", "transferrin",
  "treatment", "triglycerides", "troponin", "tsh", "urine", "vital", "vitals", "warfarin", "wbc"
]);

const medicationSaltOrFormWords = new Set([
  "acetate", "bromide", "calcium", "chloride", "citrate", "extended", "fumarate", "hcl",
  "hydrochloride", "injection", "lactate", "magnesium", "oral", "potassium", "sodium", "succinate",
  "sulfate", "tartrate", "tablet", "topical"
]);

const medicationNameWords = new Set([
  "acetaminophen", "amlodipine", "aspirin", "atorvastatin", "azithromycin", "cefazolin", "cefepime",
  "ceftriaxone", "duloxetine", "enoxaparin", "furosemide", "gabapentin", "heparin", "hydromorphone",
  "insulin", "levothyroxine", "lisinopril", "losartan", "metformin", "metoprolol", "ondansetron",
  "oxycodone", "pantoprazole", "pregabalin", "senna", "tamsulosin", "tramadol", "trazodone",
  "vancomycin", "warfarin"
]);

const medicationClassOrStemPattern = /(?:^cef|cillin$|cycline$|floxacin$|mycin$|azole$|avir$|pril$|sartan$|olol$|dipine$|statin$|parin$|prazole$|tidine$|zepam$|zolam$|azepam$|azide$|semide$|thiazide$|gliflozin$|gliptin$|tide$|caine$|sone$|mab$|nib$)/i;

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

function isLikelyClinicalSlashValue(rawText, start, end) {
  const span = rawText.slice(start, end);
  const before = rawText.slice(Math.max(0, start - 36), start).toLowerCase();
  const after = rawText.slice(end, Math.min(rawText.length, end + 36)).toLowerCase();
  const denominator = Number(span.split(/[/-]/)[1]);
  return /(strength|motor|reflex|pain|score|rated|grade|gcs|glasgow|apgar|mrc|nihss)\s*(?:is|was|:)?\s*$/.test(before) ||
    /^\s*(?:strength|motor|reflex|pain|score|out of|\/)/.test(after) ||
    denominator <= 10 && /(strength|motor|pain|score|grade|rated|exam|neuro|mrc|nihss)/.test(`${before} ${after}`);
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

function isLikelyClinicalNameLikePhrase(normalized) {
  const words = normalized.split(" ");
  if (words.length < 2 || words.length > 5) {
    return false;
  }

  if (nonNameClinicalPhrases.has(normalized)) {
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

function isLikelyChartHeadingPhrase(rawText, start, end) {
  const span = rawText.slice(start, end).replace(/\s+/g, " ").trim();
  const normalized = normalizePhrase(span);
  if (!normalized) {
    return false;
  }

  if (nonNameClinicalPhrases.has(normalized)) {
    return true;
  }

  const line = normalizePhrase(lineAroundSpan(rawText, start, end));
  if (line && line === normalized) {
    const words = normalized.split(" ");
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

  const lineStart = rawText.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = rawText.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? rawText.length : lineEndIndex;
  const beforeInLine = rawText.slice(lineStart, start);
  const afterInLine = rawText.slice(end, lineEnd);
  if (!beforeInLine.trim() && /^\s*[:#]/.test(afterInLine)) {
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

  const words = normalized.split(" ");
  return words.length >= 2 && words.length <= 5 && words.every((word) => nonNameClinicalWords.has(word));
}

function isLikelyDateFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).trim();
  const before = rawText.slice(Math.max(0, start - 40), start).toLowerCase();
  const after = rawText.slice(end, Math.min(rawText.length, end + 40)).toLowerCase();

  if (/^\/?\d{4}$/.test(span)) {
    return true;
  }

  const hasDateContext = /(admit|discharge|date|dos|collected|result|received|since|through|from|to|on)\W*$/.test(before);

  if (/^\d{1,2}[/-]\d{1,2}$/.test(span) && !hasDateContext) {
    return true;
  }

  if (/^\d{1,2}\/\d{1,2}$/.test(span) && isLikelyClinicalSlashValue(rawText, start, end)) {
    return true;
  }

  return /^(?:\/|-)\d{2,4}$/.test(span) || /^\d{1,2}-\d{1,2}\s*(?:days?|weeks?|months?)\b/i.test(`${span} ${after}`);
}

function isLikelyLocationFalsePositive(rawText, start, end) {
  const span = rawText.slice(start, end).trim();
  return /^hospital\s+(?:course|problem|problems|day|stay|medicine|admission|course had)\b/i.test(span) ||
    /^[a-z]/.test(span) && !/\b(?:clinic|medical center|health system|room|unit|floor|ward)\b/i.test(span);
}

function refineNameLabel(label, rawText, start, end) {
  const normalized = normalizePhiLabel(label);
  if (!nameEntityLabels.has(normalized)) {
    return normalized;
  }

  if (normalized !== "NAME") {
    return normalized;
  }

  const span = rawText.slice(start, end).trim();
  const sameLine = sameLineContext(rawText, start, end);
  const broaderContext = lineContext(rawText, start, end).toLowerCase();

  if (/\b(?:emergency contact|mother|father|spouse|daughter|son|guardian|caregiver|family)\b/.test(sameLine)) {
    return "CONTACT NAME";
  }
  if (/^(?:dr|doctor)\.?\s+/i.test(span) || /\b(?:provider|doctor|physician|attending|resident|fellow|consultant|surgeon|pcp|endocrinologist|referring provider|ordering provider|follow-up with)\b/.test(sameLine)) {
    return "PROVIDER NAME";
  }
  if (/\b(?:patient name|pt name|patient|subjective|admitted|discharge planning)\b/.test(sameLine) ||
      /\b(?:patient name|pt name|subjective|admitted|discharge planning)\b/.test(broaderContext)) {
    return "PATIENT NAME";
  }
  return "NAME";
}

function normalizePhiEntity(rawText, entity) {
  const start = Number(entity.start);
  const end = Number(entity.end);
  const label = refineNameLabel(entity.label, rawText, start, end);
  return {
    start,
    end,
    label,
    placeholder: entity.placeholder || placeholderForLabel(label),
    source: entity.source || "model",
    score: entity.score || 0,
    context: entity.context || ""
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

  const span = rawText.slice(start, end);
  if (!span.trim()) {
    return;
  }

  const normalizedLabel = refineNameLabel(label, rawText, start, end);
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

export function addStructuredSafeHarborEntities(rawText, entities = []) {
  const dateValue = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})`;

  const capturedPatterns = [
    { label: "PATIENT NAME", regex: /^\s*(?:Patient(?: Name)?|Pt(?: Name)?|Name)\s*[:#]\s*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){1,3})\s*$/gmi },
    { label: "DOB", regex: new RegExp(String.raw`^\s*(?:DOB|D\.O\.B\.|Date of birth|Birth date)\s*[:#]\s*(${dateValue})\s*$`, "gmi") },
    { label: "MRN", regex: /^\s*(?:MRN|Medical Record(?: Number)?)\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
    { label: "ENCOUNTER ID", regex: /^\s*(?:CSN|FIN|HAR|Encounter(?: ID| Number))\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
    { label: "ID", regex: /^\s*(?:Account(?: Number)?|Acct|Guarantor|Policy(?: Number)?|Member(?: ID| Number)?|Insurance(?: ID| Number)?|Subscriber(?: ID| Number)?|Accession(?: Number)?|Order(?: ID| Number)?|Specimen(?: ID| Number)?|Chart(?: ID| Number)?|Case(?: ID| Number)?|Visit(?: ID| Number)?|License(?: Number)?|Certificate(?: Number)?|DEA|NPI|Device ID|Device Identifier|Serial Number|IMEI|VIN|Plate)\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})\s*$/gmi },
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
    { label: "MRN", regex: /\b(?:MRN|Medical Record(?: Number)?)\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "ENCOUNTER ID", regex: /\b(?:CSN|FIN|HAR|Encounter(?: ID| Number))\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "ID", regex: /\b(?:Account(?: Number)?|Acct|Guarantor|Policy(?: Number)?|Member(?: ID| Number)?|Insurance(?: ID| Number)?|Subscriber(?: ID| Number)?|Accession(?: Number)?|Order(?: ID| Number)?|Specimen(?: ID| Number)?|Chart(?: ID| Number)?|Case(?: ID| Number)?|Visit(?: ID| Number)?)\s*[:#]\s*([A-Z0-9][A-Z0-9./_-]{2,})/gi },
    { label: "FACILITY", regex: /\b(?:Facility|Campus|Hospital|Clinic|Site|Service location|Lab location|Ordering location)\s*[:#]\s*([^\n\r,]{2,80}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed)\s*[:#]|[,;\n\r]|$)/gi },
    { label: "ROOM", regex: /\b(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed|ICU room|ED room|Location)\s*[:#]\s*([A-Z0-9][A-Z0-9 \t-]{0,30}?)(?=\s+(?:Unit|Floor|Ward|Pod|Bay|Room|Rm|Bed|Phone|Email|Address|Primary|Preferred)\s*[:#]|[,;\n\r]|$)/gi }
  ];

  capturedPatterns.forEach(({ label, regex }) => {
    addCapturedEntity(rawText, entities, label, regex);
  });

  const directPatterns = [
    { label: "EMAIL", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { label: "URL", regex: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi },
    { label: "IP", regex: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g },
    { label: "ID", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { label: "PHONE", regex: /(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
    { label: "DATE", regex: /\b\d{4}-\d{1,2}-\d{1,2}\b/g },
    { label: "DATE", regex: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])(?:[/-](?:\d{2}|\d{4}))?\b/g, skip: isLikelyDateFalsePositive },
    { label: "DATE", regex: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/gi },
    { label: "ADDRESS", regex: /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy)\b(?:,?\s+[A-Za-z .-]+)?(?:,?\s+[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?/gi },
    { label: "ROOM", regex: /\b(?:Room|Rm|Bed|ICU room|ED room)\b(?!\s*[:#])\s+[A-Z0-9-]*\d[A-Z0-9-]*\b/gi },
    { label: "LOCATION", regex: /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g },
    { label: "ORGANIZATION", regex: /\b[A-Z][A-Za-z&.'-]+(?:[ \t]+(?:of|and|the|[A-Z][A-Za-z&.'-]+)){0,5}[ \t]+(?:Hospital|Clinic|Pharmacy|Medical Center|Health System|Healthcare|Medical Group|University Hospital|Children's Hospital|Cancer Center|Laboratory|Lab|Rehabilitation|Rehab|Nursing Home|Skilled Nursing Facility)\b/g },
    { label: "PROVIDER NAME", regex: /\b(?:Dr|Doctor)\.?\s+[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,2}\b/g },
    { label: "ID", regex: /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g },
    { label: "ID", regex: /\b[A-F0-9]{12,}\b/g },
    { label: "ID", regex: /\b[A-HJ-NPR-Z0-9]{17}\b/g }
  ];

  directPatterns.forEach(({ label, regex, skip }) => {
    addRegexEntities(rawText, entities, label, regex, "structured identifier", skip);
  });

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

      last.end = Math.max(last.end, entity.end);
      last.score = Math.max(last.score, entity.score || 0);
      if (labelPriority(entity.label) < labelPriority(last.label)) {
        last.label = entity.label;
      }
      last.placeholder = placeholderForLabel(last.label);
      last.source = mergeSourceLabel(last.source, entity.source);
      last.context = [last.context, entity.context].filter(Boolean).join("; ");
      return;
    }

    merged.push({
      start: entity.start,
      end: entity.end,
      label: entity.label,
      placeholder: entity.placeholder || placeholderForLabel(entity.label),
      score: entity.score || 0,
      source: entity.source || "model",
      context: entity.context || ""
    });
  });

  return merged;
}

export function filterLikelyFalsePositiveEntities(rawText, entities) {
  return entities.filter((entity) => {
    if (entity.label === "DATE") {
      return !isLikelyDateFalsePositive(rawText, entity.start, entity.end);
    }

    if (entity.label === "NAME") {
      return !isLikelyNonNamePhrase(rawText, entity.start, entity.end);
    }

    if (entity.label === "LOCATION") {
      return !isLikelyLocationFalsePositive(rawText, entity.start, entity.end);
    }

    return true;
  });
}

function generalizeAgesOver89(text) {
  return text
    .replace(/\bAge\s*[:#]?\s*(?:9[0-9]|1[0-9]{2})\b/gi, "Age: 90 or older")
    .replace(/\b(?:9[0-9]|1[0-9]{2})[-\s]*(?:year[-\s]*old|years old|yo|y\/o)\b(?:\s*(?:male|female|man|woman|M|F))?/gi, "90 or older")
    .replace(/\b(?:9[0-9]|1[0-9]{2})\s*(?:M|F)\b/g, "90 or older");
}

export function redactFromEntities(rawText, entities) {
  let cursor = 0;
  let output = "";

  entities.forEach((entity) => {
    output += rawText.slice(cursor, entity.start);
    output += entity.placeholder || placeholderForLabel(entity.label);
    cursor = entity.end;
  });

  output += rawText.slice(cursor);
  return generalizeAgesOver89(output.trim());
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
    const span = rawText.slice(entity.start, entity.end).replace(/\s+/g, " ").trim();
    const score = /model/.test(entity.source) && entity.score ? ` ${(entity.score * 100).toFixed(0)}%` : "";
    const source = entity.source ? ` (${entity.source}${score})` : score;
    return `${(entity.placeholder || placeholderForLabel(entity.label)).replace(/^\[|\]$/g, "")}${source}: ${span}`;
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

function addResidualMatches(warnings, text, severity, type, regex, reason, shouldSkip = null) {
  for (const match of text.matchAll(regex)) {
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

function isPlausibleNameText(value) {
  const cleaned = String(value || "")
    .replace(/^(?:Dr|Doctor|Mr|Mrs|Ms|Miss)\.?\s+/i, "")
    .replace(/[,\s]+$/g, "")
    .trim();
  const normalized = normalizePhrase(cleaned);
  if (!normalized || isLikelyClinicalNameLikePhrase(normalized) || nonNameClinicalPhrases.has(normalized)) {
    return false;
  }
  const words = cleaned.split(/\s+/);
  return words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Z][A-Za-z.'-]{1,}$/.test(word));
}

function aliasVariantsFromSpan(span) {
  const withoutLabel = String(span || "")
    .replace(/^[A-Za-z /().-]+[:#]\s*/, "")
    .replace(/\s+(?:MD|DO|NP|PA-C|RN)\b\.?/gi, "")
    .split(/\s+(?:mother|father|spouse|daughter|son|guardian|caregiver)\b/i)[0]
    .split(/\s*,\s*/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (!isPlausibleNameText(withoutLabel)) {
    return [];
  }
  const variants = [withoutLabel];
  const withoutTitle = withoutLabel.replace(/^(?:Dr|Doctor|Mr|Mrs|Ms|Miss)\.?\s+/i, "").trim();
  if (withoutTitle && withoutTitle !== withoutLabel && isPlausibleNameText(withoutTitle)) {
    variants.push(withoutTitle);
  }
  return [...new Set(variants)];
}

function inferNameAliases(rawText, entities) {
  const aliases = new Map();
  entities.forEach((entity) => {
    if (!nameEntityLabels.has(entity.label)) {
      return;
    }
    const span = rawText.slice(entity.start, entity.end);
    aliasVariantsFromSpan(span).forEach((alias) => {
      const key = normalizePhrase(alias.replace(/^(?:Dr|Doctor|Mr|Mrs|Ms|Miss)\.?\s+/i, ""));
      if (!key || aliases.has(key)) {
        return;
      }
      aliases.set(key, {
        text: alias,
        label: entity.label === "NAME" ? refineNameLabel("NAME", rawText, entity.start, entity.end) : entity.label,
        placeholder: entity.placeholder || placeholderForLabel(entity.label)
      });
    });
  });
  return aliases;
}

function addAliasRepeatEntities(rawText, entities, aliases) {
  aliases.forEach((alias) => {
    const variants = aliasVariantsFromSpan(alias.text);
    variants.forEach((variant) => {
      const regex = new RegExp(`(^|[^A-Za-z])(${escapeRegExp(variant)})(?=$|[^A-Za-z])`, "g");
      for (const match of rawText.matchAll(regex)) {
        const start = match.index + match[1].length;
        const end = start + match[2].length;
        if (isSpanCovered(start, end, entities)) {
          continue;
        }
        pushPatternEntity(entities, rawText, alias.label, start, end, "alias repeat", `known alias: ${alias.text}`);
      }
    });
  });
  return entities;
}

function hasStrongNameContext(rawText, start, end) {
  const span = rawText.slice(start, end);
  const sameLine = sameLineContext(rawText, start, end);
  return /^(?:dr|doctor|mr|mrs|ms|miss)\.?\s+/i.test(span) ||
    /\b(?:patient name|pt name|patient|provider|doctor|physician|attending|resident|fellow|consultant|surgeon|pcp|endocrinologist|referring provider|ordering provider|emergency contact|mother|father|spouse|daughter|son|guardian|caregiver|follow-up with|spoke with|call|called|contact|can bring|confirm|before leaving|prescriptions to)\b/.test(sameLine);
}

function promoteResidualNameEntities(rawText, entities, aliases) {
  const namePattern = /\b(?:Dr\.?[ \t]+)?[A-Z][a-z]{2,}(?:[ \t]+[A-Z]\.?)?[ \t]+[A-Z][a-z]{2,}\b/g;
  for (const match of rawText.matchAll(namePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (isSpanCovered(start, end, entities) || isLikelyNonNamePhrase(rawText, start, end)) {
      continue;
    }
    const aliasKey = normalizePhrase(match[0].replace(/^(?:Dr|Doctor|Mr|Mrs|Ms|Miss)\.?\s+/i, ""));
    if (!aliases.has(aliasKey) && !hasStrongNameContext(rawText, start, end)) {
      continue;
    }
    const label = aliases.get(aliasKey)?.label || refineNameLabel("NAME", rawText, start, end);
    pushPatternEntity(entities, rawText, label, start, end, "residual auto-fix", aliases.has(aliasKey) ? "known alias" : "strong name context");
  }
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
  addResidualMatches(warnings, sourceText, "high", "street address", /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy)\b/gi, "street address");
  addResidualMatches(warnings, sourceText, "medium", "ZIP or postal code", /\b(?:ZIP|Zip code|Postal code)\s*[:#]?\s*\d{5}(?:-\d{4})?\b/gi, "geographic detail smaller than state");
  addResidualMatches(warnings, sourceText, "medium", "unit or room", /\b(?:Room|Rm|Bed|ICU room|ED room)\b\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*\b/gi, "care location detail");
  addResidualMatches(warnings, sourceText, "medium", "unit or room", /\b(?:Unit|Floor|Ward|Pod|Bay|Location)\b\s*[:#]\s*[A-Z0-9-]+\b/gi, "care location detail");
  addResidualMatches(warnings, sourceText, "medium", "facility", /\b[A-Z][A-Za-z&.'-]+(?:[ \t]+(?:of|and|the|[A-Z][A-Za-z&.'-]+)){0,5}[ \t]+(?:Hospital|Clinic|Pharmacy|Medical Center|Health System|Healthcare|Medical Group|University Hospital|Children's Hospital|Cancer Center|Laboratory|Lab|Rehabilitation|Rehab|Nursing Home|Skilled Nursing Facility)\b/g, "facility or organization name");
  addResidualMatches(warnings, sourceText, "medium", "possible full name", /\b(?:Dr\.?[ \t]+)?[A-Z][a-z]{2,}(?:[ \t]+[A-Z]\.?)?[ \t]+[A-Z][a-z]{2,}\b/g, "capitalized name-like phrase", isLikelyNonNamePhrase);
  addResidualMatches(warnings, sourceText, "medium", "ID-like string", /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g, "long alphanumeric code");
  addResidualMatches(warnings, sourceText, "medium", "age over 89", /\b(?:Age\s*[:#]?\s*(?:9[0-9]|1[0-9]{2})|(?:9[0-9]|1[0-9]{2})\s*(?:yo|y\/o|years? old|M|F|male|female))\b/gi, "age must be generalized");
  addResidualMatches(warnings, sourceText, "review", "rare identifying context", /\b(?:celebrity|publicized|news article|newspaper|police report|lawsuit|incarcerated|inmate|professional athlete|mayor|judge|teacher at|works at|employer|specific school|rare occupation|well-known)\b/gi, "context can identify a patient even without direct IDs");

  return warnings.map(({ key, ...warning }) => warning);
}

export function splitTextForModel(rawText, maxChars = 1800, overlap = 180) {
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

function overlapsAny(entity, entities) {
  return entities.some((other) => rangesOverlap(entity, other));
}

function deidentifyFromEntities(rawText, entities, modelResult = { modelId: null, modelStatus: "structured only" }) {
  const text = redactFromEntities(rawText, entities);
  const counts = summarizeEntities(entities);
  const residualWarnings = scanResidualPhi(text);
  const residualFlags = residualWarnings.slice(0, 12).map(formatPhiWarning);
  const modelFlag = modelResult.modelStatus === "Model unavailable; structured redaction only." || modelResult.modelStatus === "structured only"
    ? [modelResult.modelStatus === "structured only" ? "Structured-only de-identification." : "Model unavailable; structured redaction only."]
    : [`Model: ${modelResult.modelId}`];

  return {
    text,
    counts,
    redactionTotal: entities.length,
    residualWarnings,
    flags: [...modelFlag, ...residualFlags, ...entityFlags(rawText, entities)],
    entities,
    modelId: modelResult.modelId,
    modelStatus: modelResult.modelStatus
  };
}

function formatPhiWarning(warning) {
  const label = warning.severity === "high" ? "High" : warning.severity === "medium" ? "Medium" : "Review";
  return `${label}: ${warning.type} - ${warning.snippet}`;
}

export function deidentifyTextStructuredOnly(rawText) {
  let entities = mergeEntities(addStructuredSafeHarborEntities(rawText, []), rawText);
  const aliases = inferNameAliases(rawText, entities);
  entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addAliasRepeatEntities(rawText, entities, aliases), rawText));
  entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(promoteResidualNameEntities(rawText, entities, aliases), rawText));
  return deidentifyFromEntities(rawText, entities, { modelId: null, modelStatus: "structured only" });
}

export function createDeidentifier(options = {}) {
  const pipelineFactory = options.pipelineFactory || null;
  const modelCandidates = options.modelCandidates || [
    { modelId: options.primaryModelId || DEFAULT_PRIMARY_MODEL_ID, options: { dtype: options.dtype || DEFAULT_DTYPE } },
    { modelId: options.primaryModelId || DEFAULT_PRIMARY_MODEL_ID, options: {} },
    { modelId: options.fallbackModelId || DEFAULT_FALLBACK_MODEL_ID, options: { dtype: options.dtype || DEFAULT_DTYPE } }
  ].filter((candidate) => candidate.modelId);
  const onModelStatus = typeof options.onModelStatus === "function" ? options.onModelStatus : () => {};
  let modelPromise = null;
  let loadedModel = null;

  function setStatus(update) {
    onModelStatus(update);
  }

  async function loadModel() {
    if (!pipelineFactory) {
      throw new Error("No model pipeline factory configured.");
    }
    if (loadedModel) {
      return loadedModel;
    }
    if (!modelPromise) {
      setStatus({ message: "Preparing local PII model. First load can take a minute.", ready: false });
      modelPromise = (async () => {
        const errors = [];
        for (const candidate of modelCandidates) {
          try {
            const loadedPipeline = await pipelineFactory("token-classification", candidate.modelId, candidate.options || {});
            loadedModel = {
              pipeline: loadedPipeline,
              modelId: candidate.modelId,
              modelStatus: candidate.modelId === DEFAULT_FALLBACK_MODEL_ID ? "fallback model" : "primary model"
            };
            setStatus({
              message: `Local PII model ready.${loadedModel.modelStatus === "fallback model" ? " Fallback model in use." : ""}`,
              ready: true,
              modelId: loadedModel.modelId,
              modelStatus: loadedModel.modelStatus
            });
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

  async function detectModelEntities(rawText) {
    try {
      const model = await loadModel();
      const entities = [];
      for (const chunk of splitTextForModel(rawText)) {
        const predictions = await model.pipeline(chunk.text, { ignore_labels: [] });
        entities.push(...modelPredictionsToEntities(chunk.text, predictions || [], chunk.offset));
      }
      return {
        entities,
        modelId: model.modelId,
        modelStatus: model.modelStatus
      };
    } catch (error) {
      console.warn("Model unavailable; structured redaction only.", error);
      return {
        entities: [],
        modelId: null,
        modelStatus: "Model unavailable; structured redaction only."
      };
    }
  }

  async function deidentifyText(rawText, runOptions = {}) {
    const mode = runOptions.mode || options.mode || "hybrid";
    if (mode === "structured-only") {
      return deidentifyTextStructuredOnly(rawText);
    }

    const modelResult = await detectModelEntities(rawText);
    let modelEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(modelResult.entities, rawText));

    if (mode === "model-only") {
      return deidentifyFromEntities(rawText, modelEntities, modelResult);
    }

    let structuredEntities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addStructuredSafeHarborEntities(rawText, []), rawText));
    modelEntities = modelEntities.filter((entity) => !overlapsAny(entity, structuredEntities));
    let entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities([...structuredEntities, ...modelEntities], rawText));
    const aliases = inferNameAliases(rawText, entities);
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(addAliasRepeatEntities(rawText, entities, aliases), rawText));
    entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(promoteResidualNameEntities(rawText, entities, aliases), rawText));
    return deidentifyFromEntities(rawText, entities, modelResult);
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
