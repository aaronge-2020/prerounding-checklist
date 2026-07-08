/**
 * Document zone segmentation for de-identification.
 *
 * Classifies each line of a clinical note into a zone so the redaction
 * pipeline can apply zone-aware policy:
 *   - "lab"       lab result lines and result blocks
 *   - "vitals"    vital-sign lines
 *   - "meds"      medication list lines
 *   - "imaging"   imaging / procedure report blocks (CT, MRI, echo, ...)
 *   - "narrative" everything else
 *
 * Inside protected zones (lab/vitals/meds/imaging), name-like and
 * organization-like entities require explicit identifier evidence; this is
 * what keeps lab panels, CT impressions, and medication lists from being
 * over-redacted while still catching "Read by Dr. Smith" style signatures.
 */

const PROTECTED_ZONE_TYPES = new Set(["lab", "vitals", "meds", "imaging"]);

const analyteTokenPattern = /\b(?:wbc|rbc|hgb|hbg|hemoglobin|hct|hematocrit|plt|platelets?|mcv|mch|mchc|rdw|mpv|retic|neutrophils?|lymphs?|lymphocytes?|monos?|monocytes?|eos|eosinophils?|basos?|basophils?|bands|blasts|na|sodium|k|potassium|cl|chloride|co2|bicarb|bicarbonate|hco3|bun|cr|creatinine|egfr|gfr|glucose|glu|ca|calcium|mg|magnesium|phos|phosphorus|phosphate|ast|alt|alp|ggt|tbili|dbili|bilirubin|albumin|protein|globulin|inr|ptt|protime|fibrinogen|dimer|d-dimer|troponin|trop|bnp|probnp|ck|ckmb|lactate|lactic|ammonia|lipase|amylase|tsh|ft4|t4|t3|a1c|hba1c|crp|esr|procalcitonin|ferritin|iron|tibc|transferrin|folate|b12|haptoglobin|ldh|uric|osmolality|osm|anion|vbg|abg|ph|pco2|po2|lyte|lytes|vanc|vancomycin|tacro|tacrolimus|digoxin|cortisol|prolactin|pth|vitamin|ketones|beta-hydroxybutyrate|bhb|ua|urinalysis|urine|culture|cx|gram|mrsa|covid|influenza|flu|rsv|cdiff|hiv|rpr|hbsag|hcv|cmv|ebv|quantiferon)\b/gi;

const unitPattern = /\b(?:mmol\/L|mEq\/L|mg\/dL|g\/dL|ng\/mL|pg\/mL|mcg\/dL|IU\/L|U\/L|mIU\/L|uIU\/mL|k\/uL|K\/uL|x10|10\^|cells\/|mm3|mmHg|mL\/min|fL|pg|%|sec|seconds)\b/i;

const refRangePattern = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/;

const resultFlagPattern = /(?:\((?:H|L|HH|LL|A|AB|abn|abnl|crit(?:ical)?)\)|\b(?:high|low|critical|abnormal|positive|negative|pos|neg|detected|not detected|reactive|nonreactive|pending|final|prelim(?:inary)?|no growth|normal)\b)/i;

const vitalsPattern = /\b(?:bp|blood pressure|hr|heart rate|rr|resp(?:iratory)? rate|respirations|spo2|sao2|o2 ?sat|pulse ?ox|temp(?:erature)?|tmax|tcurrent|tc|pulse|wt|weight|ht|height|bmi|map|cvp|uop|i\/os?|ins? ?and ?outs?)\b/i;

const doseUnitPattern = /\b\d[\d.,]*\s*(?:mg|mcg|g|gram|grams|ml|mL|units?|IU|mEq|mmol|tabs?|tablets?|caps?|capsules?|puffs?|drops?|gtts?|sprays?|patch(?:es)?|supp)\b/i;

const doseFrequencyPattern = /\b(?:daily|nightly|q\.?d|bid|tid|qid|qhs|qam|qpm|qod|prn|q ?\d+ ?-? ?\d* ?(?:h|hr|hrs|hours?|min)|once|twice|weekly|monthly|po|p\.o\.|iv|i\.v\.|ivp|ivpb|subq|sq|sc|im|sl|pr|inh|inhaled|nebulized|topical|transdermal|with meals?|at bedtime|as needed|scheduled|continuous|drip|infusion|gtt)\b/i;

const imagingHeaderPattern = /^\s*(?:[-*•#]\s*)?(?:portable\s+)?(?:ct|cta|ctpa|hrct|mri|mr|mra|mrcp|us|u\/s|ultrasound|duplex|doppler|xr|x-?ray|cxr|kub|dexa|mammo(?:gram|graphy)?|echo(?:cardiogram)?|tte|tee|ekg|ecg|eeg|emg|pet(?:\/ct)?|nm|v\/?q|hida|fluoro|angio(?:gram|graphy)?|swallow study|barium|egd|colonoscopy|bronch(?:oscopy)?|eus|ercp)\b[^\n]{0,120}$/i;

const reportSectionHeaderPattern = /^\s*(?:exam|examination|study|procedure|technique|comparison|indication|clinical (?:history|indication)|contrast|findings|impression|conclusion|interpretation|read|wet read|prelim(?:inary)? (?:read|report)|final (?:read|report))\s*[:\-]/i;

const narrativeSectionHeaderPattern = /^\s*(?:[-*•#]\s*)?(?:hpi|history of present illness|subjective|objective|assessment(?: and plan| & plan|\/plan)?|plan|a\/p|ros|review of systems|physical exam(?:ination)?|pe|pmh|past medical history|psh|surgical history|fh|family history|sh|social history|allergies|hospital course|course|interval events?|overnight events?|events?|to ?do|disposition|dispo|discharge planning|follow ?-? ?up|one-line summary|overall assessment|id|hd|pod)\s*[:#]?\s*$/i;

function countMatches(value, regex) {
  const matches = value.match(regex);
  return matches ? matches.length : 0;
}

function numericDensity(line) {
  const compact = line.replace(/\s+/g, "");
  if (!compact) {
    return 0;
  }
  const numericChars = compact.replace(/[^0-9.,:/<>()%+-]/g, "").length;
  return numericChars / compact.length;
}

function isLabLine(trimmed) {
  if (!trimmed) {
    return false;
  }
  const analyteCount = countMatches(trimmed, analyteTokenPattern);
  const numberCount = countMatches(trimmed, /\d+(?:\.\d+)?/g);
  if (analyteCount >= 2 && numberCount >= 2) {
    return true;
  }
  if (analyteCount >= 1 && numberCount >= 1 && (unitPattern.test(trimmed) || refRangePattern.test(trimmed) || resultFlagPattern.test(trimmed))) {
    return true;
  }
  if (analyteCount >= 1 && /:\s*(?:\d|positive|negative|pending|detected|not detected|reactive|nonreactive|no growth|normal|abnormal|trace|small|moderate|large)/i.test(trimmed)) {
    return true;
  }
  // Fishbone / tabular rows: number-dense with units or separators
  if (numberCount >= 4 && numericDensity(trimmed) > 0.5) {
    return true;
  }
  // "Label: value" with a resulty value and unit
  if (/^[A-Za-z][A-Za-z0-9 ()\/.,%-]{1,60}:\s*[<>]?\d+(?:\.\d+)?/.test(trimmed) && (unitPattern.test(trimmed) || refRangePattern.test(trimmed) || resultFlagPattern.test(trimmed))) {
    return true;
  }
  return false;
}

function isVitalsLine(trimmed) {
  if (!trimmed) {
    return false;
  }
  const vitalHits = countMatches(trimmed, new RegExp(vitalsPattern.source, "gi"));
  const numberCount = countMatches(trimmed, /\d+(?:\.\d+)?/g);
  return (vitalHits >= 2 && numberCount >= 2) ||
    (vitalHits >= 1 && numberCount >= 3) ||
    (vitalHits >= 1 && /\b\d{2,3}\/\d{2,3}\b/.test(trimmed) && numberCount >= 2);
}

function isMedsLine(trimmed) {
  if (!trimmed) {
    return false;
  }
  return doseUnitPattern.test(trimmed) && doseFrequencyPattern.test(trimmed);
}

function isLabBlockHeader(trimmed) {
  return /^\s*(?:[-*•#]\s*)?(?:labs?|lab results?|laboratory(?: data| results?)?|significant labs?|pertinent labs?|am labs?|daily labs?|micro(?:biology)?|cultures?|urine labs?|cbc|bmp|cmp|chem\s*(?:7|8|10|14)?|coags?|lfts?|abg|vbg|ua|urinalysis|poc(?:t)? (?:glucose|labs?))\s*[:#]?\s*(?:\(?[^)]*\)?)?\s*$/i.test(trimmed) ||
    /^\s*(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\[[^\]]+\]|today|yesterday|this am|am|pm)\s*(?:labs?|results?)?\s*[:#]?\s*$/i.test(trimmed);
}

/**
 * Build a per-line zone map. Returns { lines: [{ start, end, type }] }.
 */
export function buildZoneMap(rawText) {
  const text = String(rawText || "");
  const lines = [];
  let offset = 0;
  const rawLines = text.split("\n");

  // Pass 1: intrinsic per-line classification
  const intrinsic = rawLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return "blank";
    }
    if (narrativeSectionHeaderPattern.test(trimmed)) {
      return "section-header";
    }
    if (imagingHeaderPattern.test(trimmed)) {
      return "imaging-header";
    }
    if (reportSectionHeaderPattern.test(trimmed)) {
      return "report-section";
    }
    if (isVitalsLine(trimmed)) {
      return "vitals";
    }
    if (isMedsLine(trimmed)) {
      return "meds";
    }
    if (isLabLine(trimmed)) {
      return "lab";
    }
    if (isLabBlockHeader(trimmed)) {
      return "lab-header";
    }
    return "narrative";
  });

  // Pass 2: block propagation
  const resolved = new Array(rawLines.length).fill("narrative");
  let imagingBlock = false;
  let blankRun = 0;
  for (let i = 0; i < rawLines.length; i += 1) {
    const kind = intrinsic[i];
    if (kind === "blank") {
      blankRun += 1;
      if (blankRun >= 2) {
        imagingBlock = false;
      }
      resolved[i] = imagingBlock ? "imaging" : "narrative";
      continue;
    }
    if (kind === "section-header") {
      imagingBlock = false;
      resolved[i] = "narrative";
      blankRun = 0;
      continue;
    }
    if (kind === "imaging-header") {
      imagingBlock = true;
      resolved[i] = "imaging";
      blankRun = 0;
      continue;
    }
    if (kind === "report-section") {
      // Findings:/Impression:/... inside a report keeps the block going; on its
      // own (e.g. pasted impression without a study header) it starts one.
      imagingBlock = true;
      resolved[i] = "imaging";
      blankRun = 0;
      continue;
    }
    blankRun = 0;
    if (imagingBlock) {
      resolved[i] = "imaging";
      continue;
    }
    if (kind === "vitals" || kind === "meds" || kind === "lab") {
      resolved[i] = kind;
      continue;
    }
    if (kind === "lab-header") {
      // Lab block headers only become lab zone if a lab-ish line follows soon.
      const lookahead = intrinsic.slice(i + 1, i + 4);
      resolved[i] = lookahead.some((next) => next === "lab" || next === "vitals" || next === "lab-header") ? "lab" : "narrative";
      continue;
    }
    resolved[i] = "narrative";
  }

  // Pass 3: smoothing — short narrative lines sandwiched between lab lines
  // (panel names, collection dates) join the lab block.
  for (let i = 1; i < resolved.length - 1; i += 1) {
    if (resolved[i] === "narrative" && intrinsic[i] !== "blank" &&
        resolved[i - 1] === "lab" && resolved[i + 1] === "lab" &&
        rawLines[i].trim().length <= 40) {
      resolved[i] = "lab";
    }
  }

  for (let i = 0; i < rawLines.length; i += 1) {
    const start = offset;
    const end = offset + rawLines[i].length;
    lines.push({ start, end, type: resolved[i] });
    offset = end + 1; // account for the newline
  }

  return { lines };
}

export function zoneTypeForSpan(zoneMap, start, end) {
  if (!zoneMap || !Array.isArray(zoneMap.lines)) {
    return "narrative";
  }
  // Binary search for the line containing `start`.
  let low = 0;
  let high = zoneMap.lines.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = zoneMap.lines[mid];
    if (start < line.start) {
      high = mid - 1;
    } else if (start > line.end) {
      low = mid + 1;
    } else {
      // A span crossing into a following line only counts as in-zone if every
      // covered line shares the zone type.
      let type = line.type;
      for (let i = mid + 1; i < zoneMap.lines.length && zoneMap.lines[i].start < end; i += 1) {
        if (zoneMap.lines[i].type !== type) {
          return "narrative";
        }
      }
      return type;
    }
  }
  return "narrative";
}

export function isProtectedZoneType(type) {
  return PROTECTED_ZONE_TYPES.has(type);
}
