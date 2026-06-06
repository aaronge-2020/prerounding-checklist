const defaultWeights = {
  clinicalRelevance: 0.3,
  actionability: 0.25,
  diagnosticValue: 0.2,
  bedsideFeasibility: 0.15,
  specialtyContext: 0.1
};

const evidenceOverlayHeaders = [
  "exam_id",
  "base_row_number",
  "base_row_fingerprint",
  "source_item",
  "condition_or_syndrome",
  "diagnostic_target",
  "bedside_question_label",
  "bedside_question_options",
  "when_to_use_structured",
  "result_changes_management",
  "management_link",
  "evidence_source_primary",
  "source_citation",
  "LR_plus",
  "LR_minus",
  "evidence_tier",
  "difficulty",
  "time_burden_minutes",
  "equipment_needed",
  "patient_cooperation_required",
  "care_setting",
  "limitations",
  "retrieval_tags"
];

export const evidenceFileUrls = {
  base: "exam_technique_base.csv",
  overlay: "exam_evidence_overlay.csv",
  legacyOverlay: "physical_exam_evidence_overlay.csv",
  tags: "retrieval_tag_dictionary.csv",
  sources: "source_registry.csv",
  queue: "priority_enrichment_queue.csv"
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  const source = String(text || "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\"") {
      if (inQuotes && source[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((field) => field.trim())) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    if (row.some((field) => field.trim())) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift().map((header) => header.trim());
  return rows.map((fields) => {
    const parsed = {};
    headers.forEach((header, index) => {
      parsed[header] = (fields[index] || "").trim();
    });
    return parsed;
  });
}

export function normalizeEvidenceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+%/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEvidenceLabel(value) {
  return normalizeEvidenceText(value)
    .replace(/\b(?:exam|check|screen|finding|findings|assessment)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitEvidenceList(value) {
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function tokenizeEvidence(value) {
  return normalizeEvidenceText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function rowFingerprint(row) {
  const material = [
    row.exam_system,
    row.section,
    row.source_item,
    row.maneuver_or_finding,
    row.suggested_checklist_label
  ].join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function valueScore(value, values) {
  const key = String(value || "").toLowerCase();
  return values[key] ?? values.default ?? 0;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mapLegacyEvidenceTier(value) {
  const key = normalizeEvidenceText(value);
  if (/\b(?:rce|meta analysis|systematic review|guideline)\b/.test(key)) {
    return "A";
  }
  if (/\b(?:review|validated)\b/.test(key)) {
    return "B";
  }
  if (/\b(?:expert|consensus)\b/.test(key)) {
    return "C";
  }
  return "D";
}

function mapLegacyDifficulty(value) {
  const key = normalizeEvidenceText(value);
  if (key === "low" || key === "easy") {
    return "easy";
  }
  if (key === "high" || key === "hard") {
    return "hard";
  }
  return "moderate";
}

function legacyOverlayHasEvidence(row) {
  const status = normalizeEvidenceText(row.evidence_status);
  if (!row?.exam_id) {
    return false;
  }
  if (status && status !== "pending") {
    return true;
  }
  const hasStructuredLocalMetadata = splitEvidenceList(row.retrieval_tags).length > 0
    && Boolean(row.diagnostic_target || row.result_changes_management || row.when_to_use_structured);
  return status === "pending" && hasStructuredLocalMetadata;
}

function transformLegacyOverlayRow(baseRow, baseRowNumber, legacyRow, existingRow = {}) {
  const retrievalTags = unique([
    ...splitEvidenceList(existingRow.retrieval_tags),
    ...splitEvidenceList(legacyRow.retrieval_tags),
    ...splitEvidenceList(existingRow.when_to_use_structured),
    ...splitEvidenceList(legacyRow.when_to_use_structured)
  ]).join("; ");
  return {
    ...existingRow,
    exam_id: existingRow.exam_id || `LEGACY-${legacyRow.exam_id}`,
    base_row_number: existingRow.base_row_number || String(baseRowNumber),
    base_row_fingerprint: existingRow.base_row_fingerprint || rowFingerprint(baseRow),
    source_item: existingRow.source_item || baseRow.source_item || legacyRow.exam_id,
    condition_or_syndrome: legacyRow.condition_or_syndrome || existingRow.condition_or_syndrome || "",
    diagnostic_target: legacyRow.diagnostic_target || existingRow.diagnostic_target || "",
    bedside_question_label: existingRow.bedside_question_label || "",
    bedside_question_options: existingRow.bedside_question_options || "",
    when_to_use_structured: legacyRow.when_to_use_structured || existingRow.when_to_use_structured || "",
    result_changes_management: legacyRow.result_changes_management || existingRow.result_changes_management || "",
    management_link: legacyRow.management_link || existingRow.management_link || "",
    evidence_source_primary: legacyRow.evidence_source_primary || existingRow.evidence_source_primary || "",
    source_citation: unique([
      ...splitEvidenceList(existingRow.source_citation),
      legacyRow.evidence_source_primary,
      legacyRow.source_url_or_pubmed
    ]).join("; "),
    LR_plus: legacyRow.LR_plus || existingRow.LR_plus || "",
    LR_minus: legacyRow.LR_minus || existingRow.LR_minus || "",
    evidence_tier: mapLegacyEvidenceTier(legacyRow.evidence_tier || existingRow.evidence_tier),
    difficulty: mapLegacyDifficulty(legacyRow.difficulty || existingRow.difficulty),
    time_burden_minutes: legacyRow.time_burden_minutes || existingRow.time_burden_minutes || "2",
    equipment_needed: legacyRow.equipment_needed || existingRow.equipment_needed || "none",
    patient_cooperation_required: existingRow.patient_cooperation_required || "",
    care_setting: legacyRow.care_setting || existingRow.care_setting || "inpatient bedside",
    limitations: legacyRow.contraindications_or_limitations || existingRow.limitations || "",
    retrieval_tags: retrievalTags
  };
}

export function mergeLegacyPhysicalExamOverlay(baseRows = [], overlayRows = [], legacyRows = []) {
  const legacyByBaseExamId = new Map();
  legacyRows.filter(legacyOverlayHasEvidence).forEach((row) => {
    legacyByBaseExamId.set(row.exam_id, row);
  });
  if (!legacyByBaseExamId.size) {
    return overlayRows;
  }

  const baseByExamId = new Map();
  baseRows.forEach((row, index) => {
    if (row.exam_id) {
      baseByExamId.set(row.exam_id, { row, rowNumber: index + 1 });
    }
  });

  const usedLegacyIds = new Set();
  const mergedRows = overlayRows.map((overlay) => {
    const base = baseRows[Number(overlay.base_row_number) - 1] || {};
    const legacy = legacyByBaseExamId.get(base.exam_id);
    if (!legacy) {
      return overlay;
    }
    usedLegacyIds.add(legacy.exam_id);
    return transformLegacyOverlayRow(base, overlay.base_row_number, legacy, overlay);
  });

  for (const [baseExamId, legacy] of legacyByBaseExamId.entries()) {
    if (usedLegacyIds.has(baseExamId)) {
      continue;
    }
    const match = baseByExamId.get(baseExamId);
    if (!match) {
      continue;
    }
    mergedRows.push(transformLegacyOverlayRow(match.row, match.rowNumber, legacy));
  }

  return mergedRows;
}

function tagTerms(tagRow) {
  return splitEvidenceList(tagRow.trigger_terms).map((term) => normalizeEvidenceText(term)).filter(Boolean);
}

function contextContainsTerm(context, term) {
  if (!term) {
    return false;
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = !/\s/.test(term)
    ? new RegExp(`\\b${escaped}\\b`, "ig")
    : new RegExp(`\\b${escaped}\\b`, "ig");
  const matches = Array.from(context.matchAll(pattern));
  if (!matches.length) {
    return false;
  }
  return matches.some((match) => !termAppearsNegated(context, match.index || 0));
}

function termAppearsNegated(context, matchIndex) {
  const prefix = context.slice(Math.max(0, matchIndex - 110), matchIndex).trim();
  return /(?:^|\s)(?:no|not|without|denies|denied|negative for|free of|absence of|absent)(?:\s+(?:or|and)?\s*[a-z0-9+%/.]+){0,8}\s*$/.test(prefix);
}

function stripNegatedEvidencePhrases(value) {
  return normalizeEvidenceText(value)
    .replace(/\b(?:no|not|without|denies|denied|negative for|free of|absence of|absent)\b(?:\s+(?:or|and)?\s*[a-z0-9+%/.]+){1,10}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const evidenceConcernConcepts = [
  {
    id: "abdominal_pain",
    terms: [
      "stomach cramps",
      "stomach cramp",
      "belly cramps",
      "belly cramp",
      "abdominal cramps",
      "abdominal cramp",
      "stomach pain",
      "stomach ache",
      "belly pain",
      "belly ache",
      "tummy ache",
      "tummy pain",
      "gas pain"
    ],
    expansion: "abdominal pain abdomen abdominal cramping GI GU exam"
  },
  {
    id: "pelvic_menstrual_pain",
    terms: [
      "period cramps",
      "menstrual cramps",
      "menstrual pain",
      "period pain",
      "dysmenorrhea",
      "pelvic cramps",
      "pelvic pain",
      "lower belly cramps",
      "lower abdominal cramps",
      "cramps on period"
    ],
    expansion: "pelvic pain dysmenorrhea menstrual cramps lower abdominal pain menses menstrual bleeding pregnancy ectopic pelvic inflammatory disease abdominal exam GU exam"
  },
  {
    id: "adrenergic_jittery",
    terms: [
      "feeling jittery",
      "jittery",
      "shaky",
      "shaking",
      "tremulous",
      "feeling shaky",
      "low sugar feeling",
      "sweaty and shaky",
      "diaphoretic",
      "sweating and hungry"
    ],
    expansion: "adrenergic symptoms hypoglycemia shakiness sweating tremor hunger anxiety heart rate blood pressure mental status"
  },
  {
    id: "facial_weakness",
    terms: [
      "face weakness",
      "facial weakness",
      "face droop",
      "facial droop",
      "mouth droop",
      "crooked smile",
      "bell palsy",
      "bells palsy"
    ],
    expansion: "facial weakness facial droop cranial nerve vii facial symmetry eye closure stroke TIA focal neurologic deficit pronator drift"
  },
  {
    id: "dyspnea",
    terms: [
      "can't breathe",
      "cant breathe",
      "hard to breathe",
      "trouble breathing",
      "breathing problem",
      "winded"
    ],
    expansion: "dyspnea shortness of breath hypoxia respiratory distress work of breathing lung exam"
  },
  {
    id: "upper_airway",
    terms: [
      "stridor",
      "noisy breathing",
      "throat tightness",
      "hoarse voice",
      "drooling",
      "lip swelling",
      "anaphylaxis"
    ],
    expansion: "airway concerns stridor dyspnea hypoxia respiratory distress wheezing oropharynx mouth exam"
  },
  {
    id: "gi_bleed",
    terms: [
      "black stool",
      "tarry stool",
      "vomiting blood",
      "throwing up blood",
      "hematemesis",
      "melena",
      "blood in stool"
    ],
    expansion: "GI bleed melena hematemesis abdominal pain anemia hemodynamics abdominal exam"
  },
  {
    id: "dysphagia",
    terms: [
      "dysphagia",
      "trouble swallowing",
      "difficulty swallowing",
      "food stuck",
      "progressive dysphagia"
    ],
    expansion: "dysphagia weight loss oropharynx mouth exam neck mass supraclavicular nodes"
  },
  {
    id: "jaundice",
    terms: [
      "jaundice",
      "yellow eyes",
      "dark urine",
      "pale stools"
    ],
    expansion: "jaundice sclerae conjunctivae abdominal pain liver spleen supraclavicular nodes"
  },
  {
    id: "ear_symptoms",
    terms: [
      "earache",
      "ear pain",
      "ear hurts",
      "hearing changes",
      "hearing loss"
    ],
    expansion: "ear pain otoscope exam external ears vertigo hearing loss HEENT"
  },
  {
    id: "focused_msk",
    terms: [
      "shoulder pain",
      "rotator cuff",
      "limited abduction",
      "hot swollen knee",
      "swollen knee",
      "morning stiffness",
      "hand pain",
      "ankle pain",
      "twisting injury",
      "cannot bear weight"
    ],
    expansion: "MSK exam joint pain arthralgia range of motion palpation inspection"
  },
  {
    id: "raynaud",
    terms: [
      "raynaud",
      "raynaud phenomenon",
      "cold painful fingers",
      "cold fingers",
      "fingers turn white",
      "blue fingers",
      "white fingers"
    ],
    expansion: "Raynaud hand inspection radial pulses capillary refill vascular disease digital ischemia ulcers cold digits"
  },
  {
    id: "hypertension_emergency",
    terms: [
      "very high blood pressure",
      "hypertensive emergency",
      "hypertension emergency",
      "high blood pressure"
    ],
    expansion: "hypertension blood pressure headache blurry vision chest pain heart sounds lung sounds neurologic exam"
  },
  {
    id: "dysuria",
    terms: [
      "burning pee",
      "burning urination",
      "pain when peeing",
      "painful urination",
      "urine burning"
    ],
    expansion: "dysuria urinary frequency urinary urgency UTI pyelonephritis flank pain GU renal exam"
  }
];

export function expandEvidenceContextText(value) {
  const original = stripNegatedEvidencePhrases(value);
  const context = normalizeEvidenceText(original);
  if (!context) {
    return original;
  }

  const expansions = [];
  for (const concept of evidenceConcernConcepts) {
    const matched = concept.terms
      .map((term) => normalizeEvidenceText(term))
      .some((term) => contextContainsTerm(context, term));
    if (matched) {
      expansions.push(concept.id.replace(/_/g, " "), concept.expansion);
    }
  }
  return unique([original, ...expansions]).join(" ");
}

export function extractEvidenceTags(contextText, tagRows = []) {
  const context = normalizeEvidenceText(contextText);
  if (!context) {
    return [];
  }

  const matches = [];
  for (const row of tagRows) {
    const terms = tagTerms(row);
    const matchedTerms = terms.filter((term) => contextContainsTerm(context, term));
    if (matchedTerms.length) {
      matches.push({
        tag: row.tag,
        category: row.category || "",
        scoreHint: row.score_hint || "",
        matchedTerms,
        score: Math.min(100, 45 + matchedTerms.length * 15)
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
}

export function validateEvidenceOverlayRows(rows) {
  const missingHeaders = evidenceOverlayHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, header));
  const ids = new Set();
  const issues = [];
  if (missingHeaders.length) {
    issues.push({ type: "missing-headers", message: `Missing evidence overlay columns: ${missingHeaders.join(", ")}` });
  }

  rows.forEach((row, index) => {
    if (!row.exam_id) {
      issues.push({ type: "missing-id", message: `Evidence row ${index + 1} is missing exam_id.` });
    } else if (ids.has(row.exam_id)) {
      issues.push({ type: "duplicate-id", message: `Duplicate exam_id: ${row.exam_id}` });
    }
    ids.add(row.exam_id);

    const time = numericValue(row.time_burden_minutes);
    if (time === null || time < 0 || time > 20) {
      issues.push({ type: "bad-time", message: `${row.exam_id || `row ${index + 1}`} has invalid time_burden_minutes.` });
    }

    if (!["a", "b", "c", "d"].includes(String(row.evidence_tier || "").toLowerCase())) {
      issues.push({ type: "bad-tier", message: `${row.exam_id || `row ${index + 1}`} has invalid evidence_tier.` });
    }
    if (!["easy", "moderate", "hard"].includes(String(row.difficulty || "").toLowerCase())) {
      issues.push({ type: "bad-difficulty", message: `${row.exam_id || `row ${index + 1}`} has invalid difficulty.` });
    }
  });

  return { ok: issues.length === 0, issues };
}

export function joinEvidenceCatalog(baseRows = [], overlayRows = [], sourceRows = []) {
  const baseByRowNumber = new Map();
  baseRows.forEach((row, index) => {
    baseByRowNumber.set(String(index + 1), { ...row, base_row_number: String(index + 1) });
  });

  const sourcesById = new Map(sourceRows.map((source) => [source.source_id, source]));
  return overlayRows.map((overlay) => {
    const base = baseByRowNumber.get(String(overlay.base_row_number)) || {};
    const tags = unique([
      ...splitEvidenceList(overlay.retrieval_tags),
      ...splitEvidenceList(overlay.when_to_use_structured),
      ...splitEvidenceList(overlay.condition_or_syndrome)
    ]);
    const sourceIds = unique([overlay.evidence_source_primary, ...splitEvidenceList(overlay.source_citation)]);
    return {
      ...overlay,
      base,
      source: sourcesById.get(overlay.evidence_source_primary) || null,
      sources: sourceIds.map((sourceId) => sourcesById.get(sourceId)).filter(Boolean),
      tags,
      examLabel: base.suggested_checklist_label || base.maneuver_or_finding || overlay.exam_id,
      examOptions: base.suggested_options || "",
      maneuver: base.maneuver_or_finding || "",
      system: base.exam_system || "",
      section: base.section || "",
      rowFingerprintActual: base.exam_system ? rowFingerprint(base) : ""
    };
  });
}

function reviewForCandidate(candidate, reviewState) {
  return reviewState?.items?.[candidate.exam_id] || null;
}

function scoreClinicalRelevance(candidate, matchedTags, context) {
  const matchedTagNames = new Set(matchedTags.map((match) => match.tag));
  const candidateTags = candidate.tags || [];
  const intersections = candidateTags.filter((tag) => matchedTagNames.has(tag));
  let score = Math.min(100, intersections.length * 24);
  const candidateText = normalizeEvidenceText([
    candidate.condition_or_syndrome,
    candidate.diagnostic_target,
    candidate.when_to_use_structured,
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.include_when
  ].join(" "));
  const contextTokens = tokenizeEvidence(context);
  score += contextTokens.filter((token) => candidateText.includes(token)).slice(0, 8).length * 5;
  if (candidateTags.includes("diagnostic_safety") && matchedTagNames.size > 0) {
    score += 8;
  }
  return Math.min(100, score);
}

function scoreActionability(candidate) {
  const text = normalizeEvidenceText(`${candidate.result_changes_management} ${candidate.management_link}`);
  let score = text ? 55 : 25;
  if (/\b(?:escalation|icu|urgent|steroid|fluids|diuresis|antibiotic|imaging|oxygen|telemetry|surgery|neurosurgery|ophthalmology|fall|discharge)\b/.test(text)) {
    score += 25;
  }
  if (text.length > 150) {
    score += 10;
  }
  return Math.min(100, score);
}

function scoreDiagnosticValue(candidate) {
  const lrPlus = numericValue(candidate.LR_plus);
  const lrMinus = numericValue(candidate.LR_minus);
  let score = valueScore(candidate.evidence_tier, { a: 70, b: 58, c: 42, d: 25, default: 35 });
  if (lrPlus !== null) {
    score += lrPlus >= 5 ? 25 : lrPlus >= 2 ? 14 : 5;
  }
  if (lrMinus !== null) {
    score += lrMinus <= 0.2 ? 25 : lrMinus <= 0.5 ? 14 : 5;
  }
  if (candidate.evidence_source_primary === "JAMA_RCE") {
    score += 8;
  }
  return Math.min(100, score);
}

function scoreFeasibility(candidate) {
  let score = valueScore(candidate.difficulty, { easy: 92, moderate: 72, hard: 42, default: 60 });
  const time = numericValue(candidate.time_burden_minutes) ?? 2;
  score -= Math.max(0, time - 1) * 8;
  if (candidate.equipment_needed && candidate.equipment_needed !== "none") {
    score -= 6;
  }
  if (/high/i.test(candidate.patient_cooperation_required || "")) {
    score -= 18;
  } else if (/moderate/i.test(candidate.patient_cooperation_required || "")) {
    score -= 8;
  }
  return Math.max(0, Math.min(100, score));
}

function scoreSpecialtyContext(candidate, context, options = {}) {
  const specialty = normalizeEvidenceText(options.specialty || "");
  const contextText = normalizeEvidenceText(context);
  const endocrineTags = ["DKA_HHS", "inpatient_diabetes", "hypoglycemia", "adrenal_insufficiency", "thyroid_disease", "thyroid_storm", "myxedema", "hyponatremia", "hypercalcemia", "pituitary_sellar"];
  if (/endocrin|diabetes|thyroid|adrenal|pituitary|calcium|sodium/.test(`${specialty} ${contextText}`)) {
    return candidate.tags?.some((tag) => endocrineTags.includes(tag)) ? 100 : 55;
  }
  if (/cardiology|heart|dyspnea|edema|volume/.test(`${specialty} ${contextText}`)) {
    return candidate.tags?.some((tag) => ["dyspnea", "volume_overload", "heart_failure", "perfusion"].includes(tag)) ? 100 : 45;
  }
  if (/neurology|stroke|weakness|vision/.test(`${specialty} ${contextText}`)) {
    return candidate.tags?.some((tag) => ["stroke", "weakness", "pituitary_sellar", "vision_change"].includes(tag)) ? 100 : 45;
  }
  return 50;
}

function candidateRedundancyKey(candidate, context = "") {
  const keyText = normalizeEvidenceLabel([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.section,
    candidate.base?.region_or_subsection
  ].join(" "));
  if (/\b(?:lymph|nodes?)\b/.test(keyText)
    && !/\b(?:lymph|lymphadenopathy|adenopathy|swollen glands|neck mass|malignancy|cancer|night sweats)\b/.test(context)) {
    return "lymph-node-survey";
  }
  return normalizeEvidenceLabel(candidate.examLabel || candidate.maneuver || candidate.exam_id);
}

function candidateRecommendationText(candidate) {
  return normalizeEvidenceText([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding,
    candidate.system,
    candidate.section,
    candidate.base?.region_or_subsection,
    candidate.condition_or_syndrome,
    candidate.diagnostic_target,
    candidate.when_to_use_structured,
    candidate.result_changes_management,
    candidate.management_link,
    candidate.retrieval_tags,
    candidate.base?.include_when
  ].join(" "));
}

function candidateManeuverText(candidate) {
  return normalizeEvidenceText([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding,
    candidate.system,
    candidate.section,
    candidate.base?.region_or_subsection
  ].join(" "));
}

const weakRecommendationTags = new Set([
  "diagnostic_safety",
  "inpatient_bedside",
  "functional_status",
  "msk_exam",
  "pain",
  "setup",
  "positioning",
  "positioning_and_draping"
]);

const clinicalRecommendationProfiles = [
  {
    id: "dka_hhs",
    name: "DKA/HHS or hyperglycemic crisis",
    context: /\b(?:dka|hhs|diabetic ketoacidosis|hyperosmolar|hyperglycemic crisis|anion gap|ketones|insulin drip)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 92,
        domain: "Vitals",
        reason: "Tracks shock, tachycardia, and compensatory respiratory pattern in hyperglycemic crisis.",
        diagnosticTarget: "DKA/HHS severity: tachycardia, hypotension, tachypnea, or Kussmaul-style respiratory compensation.",
        management: "Abnormal vitals can change fluid strategy, monitoring intensity, ICU/stepdown need, and urgency of reassessment.",
        bedsideQuestion: "Any worsening thirst, urination, vomiting, abdominal pain, shortness of breath, confusion, or missed insulin?",
        bedsideQuestionOptions: "No / Vomiting / Abdominal pain / Shortness of breath / Confusion / Missed insulin / Other ___"
      },
      {
        pattern: /\b(?:mouth exam|mucous|jvp|radial pulses|capillary)\b/,
        strength: 84,
        domain: "Volume and Perfusion",
        reason: "Assesses dehydration, perfusion, and fluid strategy during DKA/HHS treatment.",
        diagnosticTarget: "Volume and perfusion status: dehydration, poor perfusion, or unexpected congestion during hyperglycemic-crisis treatment.",
        management: "Supports bedside fluid reassessment, perfusion escalation, and avoiding over- or under-resuscitation.",
        bedsideQuestion: "Have you felt very thirsty, lightheaded standing, had less urine, or noticed swelling or trouble breathing?",
        bedsideQuestionOptions: "No / Thirsty / Lightheaded / Less urine / Swelling / Dyspnea / Other ___"
      },
      {
        pattern: /\b(?:abdominal palpation|abdominal inspection|bowel sounds)\b/,
        strength: 72,
        domain: "Abdomen",
        reason: "Checks abdominal tenderness or ileus that can accompany DKA/HHS or reveal a trigger.",
        diagnosticTarget: "Abdominal tenderness, guarding, distension, or ileus pattern that may reflect DKA physiology or a precipitating abdominal process.",
        management: "Persistent focal tenderness, guarding, or worsening abdominal findings should prompt reassessment for a non-DKA abdominal trigger.",
        bedsideQuestion: "Is the abdominal pain improving with DKA treatment, or is it focal, worsening, or associated with vomiting?",
        bedsideQuestionOptions: "No pain / Improving / Focal / Worsening / Vomiting / Other ___"
      },
      {
        pattern: /\b(?:posterior lung sounds|lateral lung sounds)\b/,
        strength: 58,
        domain: "Respiratory",
        reason: "Looks for pulmonary infection, edema, or respiratory complication when respiratory symptoms are present.",
        when: /\b(?:cough|dyspnea|hypoxia|pneumonia|respiratory|oxygen|shortness of breath)\b/,
        diagnosticTarget: "Pulmonary precipitant or complication: pneumonia, wheeze, edema, or impaired ventilation during DKA/HHS.",
        management: "New focal lung findings can change infection workup, oxygen strategy, imaging, and escalation."
      }
    ],
    conditional: [
      { pattern: /\b(?:lower extremity edema)\b/, strength: 54, domain: "Volume Add-on", reason: "Adds edema assessment when DKA/HHS overlaps with renal disease, heart failure, leg swelling, or volume-overload concern.", when: /\b(?:edema|leg swelling|heart failure|chf|renal|aki|volume overload)\b/ },
      { pattern: /\b(?:dorsalis pedis|posterior tibial|extremity light touch|extremity pinprick|vibration sense|proprioception)\b/, strength: 58, domain: "Diabetes Foot/Neuro", reason: "Adds diabetes foot or neuropathy assessment when infection, wound, neuropathy, or discharge planning is relevant.", when: /\b(?:foot|ulcer|wound|infection|cellulitis|neuropathy|numbness|tingling|discharge|skin)\b/ },
      { pattern: /\b(?:cva tenderness)\b/, strength: 52, domain: "Renal/Infectious Source", reason: "Checks for pyelonephritis or renal colic when flank pain, urinary symptoms, or infection may be a trigger.", when: /\b(?:flank|pyelo|urinary|dysuria|hematuria|infection|fever|stone)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:pmi|apical impulse|carotids)\b/, unless: /\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|pulmonary hypertension|chest pain|dyspnea|murmur|shock|hypotension|syncope)\b/, reason: "Cardiac structural maneuvers are not core DKA/HHS exams unless the chart adds cardiac, strain, shock, or volume-overload context." },
      { pattern: /\b(?:heart sounds)\b/, unless: /\b(?:chest pain|dyspnea|arrhythmia|murmur|heart failure|cardiomyopathy|potassium|hyperkalemia|hypokalemia|ecg|shock|hypotension|syncope)\b/, reason: "Heart auscultation in DKA/HHS needs arrhythmia, potassium/ECG, chest pain, dyspnea, shock, murmur, or heart-failure context." },
      { pattern: /\b(?:femoral pulses|posterior tibial pulses|dorsalis pedis pulses)\b/, unless: /\b(?:leg|foot|dvt|vascular|wound|ulcer|poor perfusion|limb ischemia|absent pulses|shock|hypotension)\b/, reason: "Lower-extremity pulse survey is a DKA/HHS add-on only with limb, vascular, diabetic-foot, DVT, shock, or poor-perfusion context." },
      { pattern: /\b(?:visual acuity|visual fields|extraocular|ophthalmoscopic|convergence|pupils)\b/, unless: /\b(?:vision|visual|eye|diplopia|headache|stroke|focal|seizure|papilledema|retinopathy)\b/, reason: "Eye and funduscopic maneuvers are not core DKA/HHS exams unless the chart adds visual, eye, focal neurologic, seizure, headache, or retinopathy context." },
      { pattern: /\b(?:vibration sense|proprioception|extremity light touch|extremity pinprick|ankle dorsiflexion|ankle plantarflexion|deltoid|hip flexion|pronator drift|babinski|gait|romberg|rapid alternating|finger to nose|heel to shin)\b/, unless: /\b(?:stroke|focal|facial droop|aphasia|vision|ataxia|fall|seizure|limb weakness|neuropathy|numbness|tingling|foot|wound|ulcer)\b/, reason: "Broad neuro or neuropathy maneuvers need focal neurologic, seizure, gait, weakness, sensory, or diabetic-foot context; confusion alone calls for mental-status assessment." },
      { pattern: /\b(?:nodes?)\b/, unless: /\b(?:infection|lymph|sore throat|fever|neck mass|malignancy|cancer)\b/, reason: "Lymph-node survey needs infection-source, lymphadenopathy, malignancy, or throat/neck context." },
      { pattern: /\b(?:lower extremity edema)\b/, unless: /\b(?:edema|leg swelling|heart failure|chf|renal|aki|volume overload)\b/, reason: "Lower-extremity edema is a DKA/HHS add-on only when renal, heart-failure, leg-swelling, or volume-overload context is present." },
      { pattern: /\b(?:oropharynx|sclerae and conjunctivae)\b/, unless: /\b(?:sore throat|infection|fever|jaundice|eye|thyroid|oral lesion)\b/, reason: "Less management-relevant than mucous membranes for uncomplicated DKA/HHS." },
      { pattern: /\b(?:murphy|psoas|obturator|rebound|liver edge|liver span|spleen palpation)\b/, unless: /\b(?:ruq|rlq|right upper quadrant|right lower quadrant|cholecystitis|appendicitis|peritonitis|guarding|jaundice|splenomegaly)\b/, reason: "Advanced abdominal maneuvers need a localized abdominal or peritoneal trigger." }
    ]
  },
  {
    id: "suspected_pe",
    name: "Suspected pulmonary embolism",
    context: /\b(?:pulmonary embolism|suspected pe|pleuritic chest pain|dvt|venous thromboembolism)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 92, domain: "Vitals", reason: "Checks hemodynamic and respiratory severity in suspected PE." },
      { pattern: /\b(?:posterior lung sounds|lateral lung sounds)\b/, strength: 78, domain: "Pulmonary", reason: "Assesses workup alternatives and respiratory complications while PE remains on the table." },
      { pattern: /\b(?:heart sounds|jvp|radial pulses)\b/, strength: 72, domain: "Cardiac/Perfusion", reason: "Looks for strain, shock, or perfusion changes that would alter escalation and disposition." },
      { pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial|femoral pulses)\b/, strength: 72, domain: "DVT/Vascular", reason: "Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing." }
    ],
    suppress: [
      { pattern: /\b(?:abdominal inspection|abdominal palpation|abdominal percussion|bowel sounds|murphy|rebound|psoas|obturator|liver|spleen|cva tenderness)\b/, unless: /\b(?:abdominal|flank|vomit|diarrhea|jaundice|gi bleed|urinary|renal)\b/, reason: "Abdominal maneuvers are not PE-focused without abdominal, renal, or GI symptoms." },
      { pattern: /\b(?:pmi|apical impulse)\b/, unless: /\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|pulmonary hypertension|rv strain|right heart strain)\b/, reason: "PMI is not a core PE maneuver unless the chart adds cardiomyopathy, heart failure, or strain/volume context." },
      { pattern: /\b(?:pupils|visual acuity|visual fields|extraocular|pronator drift|babinski|gait|romberg|rapid alternating|finger to nose|heel to shin|carotids|vibration sense)\b/, unless: /\b(?:stroke|seizure|focal|facial droop|aphasia|headache|vision|ataxia|weakness|syncope)\b/, reason: "Focused neuro maneuvers need a neurologic or syncope trigger in suspected PE." }
    ]
  },
  {
    id: "dyspnea_hf",
    name: "Dyspnea, hypoxia, or heart failure/volume overload",
    context: /\b(?:dyspnea|shortness of breath|sob|hypoxia|oxygen|orthopnea|pnd|heart failure|chf|volume overload|pulmonary edema|diuresis)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 88, domain: "Vitals", reason: "Determines cardiopulmonary severity and whether support/escalation is needed." },
      { pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds)\b/, strength: 84, domain: "Pulmonary", reason: "Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes." },
      { pattern: /\b(?:lung percussion|fremitus)\b/, strength: 54, domain: "Pulmonary Add-on", reason: "Adds effusion or consolidation assessment when the lung exam suggests it.", when: /\b(?:effusion|consolidation|pneumonia|diminished|asymmetric|pleural)\b/ },
      { pattern: /\b(?:jvp|lower extremity edema|heart sounds|radial pulses)\b/, strength: 82, domain: "Volume/Cardiac", reason: "Checks congestion, cardiac exam findings, and perfusion relevant to fluid and diuretic strategy.", when: /\b(?:orthopnea|pnd|heart failure|chf|volume overload|pulmonary edema|diuresis|edema|leg swelling|aki|renal|shock|hypotension|chest pain|palpitations|syncope|presyncope)\b/ }
    ],
    conditional: [
      { pattern: /\b(?:pmi|apical impulse)\b/, strength: 46, domain: "Cardiac Add-on", reason: "Adds apical impulse only when dyspnea overlaps with heart failure, cardiomyopathy, pulmonary hypertension, or volume-overload context.", when: /\b(?:heart failure|chf|cardiomyopathy|volume overload|orthopnea|pnd|pulmonary hypertension|cardiomegaly)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:murphy|psoas|obturator|rebound|cva tenderness|spleen palpation)\b/, unless: /\b(?:abdominal|flank|urinary|jaundice|gi bleed)\b/, reason: "Not dyspnea-focused without abdominal, renal, or GU symptoms." },
      { pattern: /\b(?:visual acuity|visual fields|extraocular|finger to nose|heel to shin|vibration sense)\b/, unless: /\b(?:vision|ataxia|neuropathy|numbness|weakness|stroke|seizure)\b/, reason: "Neuro-localizing maneuvers need neurologic symptoms." }
    ]
  },
  {
    id: "airway_allergy",
    name: "Upper airway, stridor, or anaphylaxis concern",
    context: /\b(?:airway|stridor|noisy breathing|throat tightness|hoarse voice|drooling|anaphylaxis|hives|urticaria|lip swelling|wheezing)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 92, domain: "Vitals/Airway", reason: "Checks shock and respiratory severity when airway compromise or anaphylaxis is possible." },
      { pattern: /\b(?:oropharynx|mouth exam)\b/, strength: 84, domain: "Airway/HEENT", reason: "Looks for visible oral, pharyngeal, or mucosal findings that can change airway escalation." },
      { pattern: /\b(?:posterior lung sounds|anterior lung sounds|lateral lung sounds)\b/, strength: 78, domain: "Pulmonary", reason: "Checks wheeze, ventilation, and respiratory involvement in airway/allergic presentations." }
    ],
    suppress: [
      { pattern: /\b(?:pmi|apical impulse|lower extremity edema|dorsalis pedis|posterior tibial|femoral pulses)\b/, unless: /\b(?:shock|hypotension|vascular|leg|foot|ulcer|wound|edema)\b/, reason: "Airway/allergy presentations do not need vascular or PMI checks unless shock, vascular, leg, or wound context is present." },
      { pattern: /\b(?:murphy|rebound|psoas|obturator|cva tenderness|liver edge|spleen palpation)\b/, unless: /\b(?:abdominal|flank|urinary|jaundice)\b/, reason: "Airway/allergy presentations need abdominal maneuvers only with abdominal, GU, or hepatobiliary symptoms." }
    ]
  },
  {
    id: "chest_pain",
    name: "Chest pain or ACS-style presentation",
    context: /\b(?:chest pain|acs|acute coronary syndrome|angina|pericarditis|pneumothorax|pleuritic)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 84, domain: "Vitals", reason: "Checks instability and severity in chest pain." },
      { pattern: /\b(?:heart sounds|jvp|radial pulses)\b/, strength: 78, domain: "Cardiac", reason: "Assesses rhythm, murmur, heart failure/strain, and perfusion clues." },
      { pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds)\b/, strength: 72, domain: "Pulmonary", reason: "Screens for pulmonary causes or complications of chest pain." },
      { pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial)\b/, strength: 56, domain: "Vascular", reason: "Adds VTE/vascular context when PE, DVT, swelling, or leg symptoms are present.", when: /\b(?:pe|pulmonary embolism|dvt|leg|swelling|edema|pleuritic|hypoxia)\b/ }
    ],
    conditional: [
      { pattern: /\b(?:pmi|apical impulse)\b/, strength: 46, domain: "Cardiac Add-on", reason: "Adds apical impulse only when chest pain overlaps with heart failure, cardiomyopathy, or volume-overload context.", when: /\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|cardiomegaly)\b/ }
    ]
  },
  {
    id: "peripheral_vascular_raynaud",
    name: "Peripheral vascular or Raynaud concern",
    context: /\b(?:raynaud|cold painful fingers|cold fingers|fingers turn white|blue fingers|white fingers|claudication|rest pain|cold limb|digital ischemia|vascular disease)\b/,
    core: [
      { pattern: /\b(?:radial pulses)\b/, strength: 82, domain: "Upper Extremity Perfusion", reason: "Checks upper-extremity perfusion and asymmetry when Raynaud or digital ischemia is considered.", when: /\b(?:raynaud|finger|hand|digital|upper extremity|vascular)\b/ },
      { pattern: /\b(?:hand inspection)\b/, strength: 80, domain: "Hands/Skin", reason: "Looks for digital color change, ulcers, wounds, or inflammatory clues that change Raynaud/ischemia framing.", when: /\b(?:raynaud|finger|hand|digital|ulcer|ischemia|autoimmune)\b/ },
      { pattern: /\b(?:dorsalis pedis|posterior tibial|femoral pulses)\b/, strength: 82, domain: "Lower Extremity Perfusion", reason: "Checks lower-extremity perfusion in claudication, rest pain, vascular disease, or limb ischemia.", when: /\b(?:claudication|leg|foot|cold limb|rest pain|ulcer)\b/ },
      { pattern: /\b(?:lower extremity edema)\b/, strength: 54, domain: "Vascular Add-on", reason: "Adds swelling/venous context when lower-extremity vascular disease, edema, or DVT overlap is possible.", when: /\b(?:leg|edema|swelling|dvt|venous)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|cva tenderness)\b/, unless: /\b(?:abdominal|flank|urinary|gi bleed|jaundice)\b/, reason: "Peripheral vascular/Raynaud presentations do not need abdominal or GU maneuvers without GI, renal, or urinary context." },
      { pattern: /\b(?:visual acuity|visual fields|extraocular|pupils|pronator drift|babinski|finger to nose|heel to shin)\b/, unless: /\b(?:vision|focal|stroke|ataxia|weakness|headache)\b/, reason: "Peripheral vascular/Raynaud presentations need neuro/eye maneuvers only with focal neurologic or visual symptoms." },
      { pattern: /\b(?:pmi|jvp|heart sounds)\b/, unless: /\b(?:chest pain|dyspnea|heart failure|syncope|shock)\b/, reason: "Cardiac add-ons need cardiopulmonary, shock, or syncope context in peripheral vascular/Raynaud presentations." }
    ]
  },
  {
    id: "neuro_red_flags",
    name: "Neurologic red flags or focal symptoms",
    context: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|bell palsy|aphasia|weakness|numbness|tingling|seizure|headache|vision|diplopia|ataxia|vertigo|gait|cord compression|myelopathy)\b/,
    core: [
      { pattern: /\b(?:facial symmetry|eye closure)\b/, strength: 88, domain: "Cranial Nerve VII", reason: "Directly checks facial weakness and cranial nerve VII pattern.", when: /\b(?:stroke|tia|facial droop|facial weakness|face weakness|face droop|bell palsy|mouth droop|crooked smile|focal)\b/ },
      { pattern: /\b(?:pronator drift)\b/, strength: 80, domain: "Stroke Screen", reason: "Adds a high-yield upper motor neuron screen when facial weakness or focal stroke concern is present.", when: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|aphasia|arm weakness|hemiparesis)\b/ },
      { pattern: /\b(?:pupils|visual fields|extraocular)\b/, strength: 74, domain: "Cranial Nerves", reason: "Localizes cranial nerve, visual pathway, vestibular, or postictal findings.", when: /\b(?:vision|diplopia|headache|stroke|tia|focal|aphasia|facial droop|facial weakness|face weakness|face droop|vertigo|ataxia|seizure|postictal)\b/ },
      { pattern: /\b(?:visual acuity)\b/, strength: 62, domain: "Visual Function Add-on", reason: "Adds bedside visual function when the complaint includes visual loss, diplopia, eye pain, or neuro-ophthalmic concern.", when: /\b(?:vision|visual|blurry|diplopia|eye pain|photophobia|pituitary|optic|headache)\b/ }
    ],
    conditional: [
      { pattern: /\b(?:facial light touch|facial sharp sensation|masseter)\b/, strength: 60, domain: "Facial Sensory/Motor Add-on", reason: "Adds trigeminal or jaw localization when facial sensory symptoms, jaw weakness, or broader cranial nerve concern exists.", when: /\b(?:facial numbness|face numbness|jaw|trigeminal|cranial nerve|stroke|tia|focal)\b/ },
      { pattern: /\b(?:tongue protrusion|palate elevation|scm strength|trapezius strength)\b/, strength: 58, domain: "Bulbar/Cranial Nerve Add-on", reason: "Adds bulbar or lower cranial nerve localization when dysarthria, dysphagia, or broader stroke concern exists.", when: /\b(?:dysarthria|dysphagia|bulbar|tongue|palate|stroke|tia|aphasia)\b/ },
      { pattern: /\b(?:deltoid|hip flexion|knee extension|ankle dorsiflexion|ankle plantarflexion|finger abduction)\b/, strength: 56, domain: "Limb Motor Add-on", reason: "Adds limb strength localization when limb, generalized, cord, or radicular weakness is described.", when: /\b(?:arm weakness|leg weakness|limb weakness|hemiparesis|hemiplegia|paresis|generalized weakness|cord compression|myelopathy|radiculopathy|foot drop)\b/ },
      { pattern: /\b(?:extremity light touch|extremity pinprick|vibration sense|proprioception)\b/, strength: 54, domain: "Sensation Add-on", reason: "Assesses sensory localization, neuropathy, or dorsal column involvement when sensory symptoms are present.", when: /\b(?:numbness|tingling|paresthesia|neuropathy|sensory|dorsal column|b12|myelopathy|gait|ataxia)\b/ },
      { pattern: /\b(?:babinski|patellar reflex|achilles reflex|brachioradialis reflex)\b/, strength: 50, domain: "Reflex Add-on", reason: "Screens for upper motor neuron, radiculopathy, or myelopathy signs when localization matters.", when: /\b(?:limb weakness|arm weakness|leg weakness|hemiparesis|radiculopathy|cord compression|myelopathy|upper motor neuron|back pain)\b/ },
      { pattern: /\b(?:gait|romberg|finger to nose|heel to shin|rapid alternating)\b/, strength: 64, domain: "Coordination/Gait", reason: "Assesses cerebellar/vestibular localization and fall risk when safe.", when: /\b(?:ataxia|vertigo|gait|fall|walk|dizziness|cord|myelopathy)\b/ }
    ]
  },
  {
    id: "abdominal_gi",
    name: "Abdominal or GI presentation",
    context: /\b(?:abdominal pain|abd pain|nausea|vomit|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|gi bleed|heartburn|dysphagia|early satiety|anorexia)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 70,
        domain: "Vitals",
        reason: "Checks hemodynamic severity, infection, bleeding, dehydration, and pain-related physiologic stress in abdominal presentations.",
        diagnosticTarget: "Abdominal-pain severity screen: hypotension, tachycardia, tachypnea, fever physiology, dehydration, bleeding physiology, or severe distress.",
        management: "Abnormal vitals can change urgency, fluid strategy, analgesia/antiemetic reassessment, labs/imaging, surgical or infectious workup, and ED/inpatient escalation.",
        bedsideQuestion: "Any fainting, fever, persistent vomiting, black or bloody stool, or pain that is worsening or becoming localized?",
        bedsideQuestionOptions: "No / Fainting / Fever / Persistent vomiting / Black or bloody stool / Worsening or localized pain / Other ___"
      },
      {
        pattern: /\b(?:abdominal inspection|abdominal palpation|bowel sounds|abdominal percussion)\b/,
        strength: 86,
        domain: "Core Abdomen",
        reason: "Defines tenderness pattern, distension, bowel activity, and peritoneal concern.",
        diagnosticTarget: "Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.",
        management: "Focal, progressive, peritoneal, obstructive, or distended findings can change imaging urgency, surgical consultation, fluid strategy, and serial abdominal exam needs.",
        bedsideQuestion: "Where is the pain worst, and is it associated with vomiting, diarrhea, constipation, urinary symptoms, fever, or bleeding?",
        bedsideQuestionOptions: "Diffuse / Focal location ___ / Vomiting / Diarrhea / Constipation / Urinary symptoms / Fever / Bleeding / Other ___"
      },
      { pattern: /\b(?:murphy|liver edge|liver span)\b/, strength: 64, domain: "RUQ/Liver", reason: "Targets biliary or liver disease when RUQ pain or jaundice is present.", when: /\b(?:ruq|right upper quadrant|jaundice|biliary|cholecystitis|liver)\b/ },
      { pattern: /\b(?:rebound|psoas|obturator)\b/, strength: 62, domain: "Peritoneal/RLQ", reason: "Targets peritoneal signs or appendicitis when localized pain/guarding exists.", when: /\b(?:rlq|right lower quadrant|appendicitis|peritonitis|guarding|rebound)\b/ },
      { pattern: /\b(?:cva tenderness)\b/, strength: 58, domain: "Renal/GU", reason: "Adds renal/GU source check when flank, urinary, or renal symptoms coexist.", when: /\b(?:flank|urinary|dysuria|hematuria|pyelo|stone|renal)\b/ }
    ]
  },
  {
    id: "pelvic_menstrual_pain",
    name: "Menstrual, pelvic, or lower-abdominal pain",
    context: /\b(?:period cramps|menstrual cramps|menstrual pain|period pain|dysmenorrhea|pelvic cramps|pelvic pain|lower abdominal pain|lower belly cramps|lower abdominal cramps|menses|menstrual bleeding|ectopic|pid|pelvic inflammatory)\b/,
    warnings: [
      "Pelvic/speculum/bimanual exam, pregnancy assessment, and genital/gynecologic source exam are clinically important when pregnancy is possible, pain is severe or atypical, bleeding is heavy, discharge/fever is present, or STI/PID/ectopic concern exists; these are not yet represented in the local exam catalog."
    ],
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 76,
        domain: "Vitals",
        reason: "Screens hemodynamic instability, fever physiology, or severe pain in pelvic/lower-abdominal presentations.",
        diagnosticTarget: "Severity screen: tachycardia, hypotension, fever physiology, or distress that would raise concern beyond uncomplicated cramps.",
        management: "Abnormal vitals should prompt escalation for pregnancy complication, infection, hemorrhage, or acute abdomen rather than routine dysmenorrhea management.",
        bedsideQuestion: "Any chance of pregnancy, heavy bleeding, fainting, fever, abnormal discharge, or pain different from usual cramps?",
        bedsideQuestionOptions: "No / Pregnancy possible / Heavy bleeding / Fainting / Fever / Discharge / Different pain / Other ___"
      },
      {
        pattern: /\b(?:abdominal inspection|abdominal palpation|bowel sounds)\b/,
        strength: 94,
        domain: "Lower Abdomen",
        reason: "Localizes lower-abdominal tenderness, distension, guarding, or bowel pattern when menstrual cramps could mask pelvic, GI, or GU pathology.",
        diagnosticTarget: "Lower-abdominal tenderness pattern, guarding, distension, or bowel abnormality that separates uncomplicated cramps from acute abdomen/GU/pelvic pathology.",
        management: "Focal tenderness, guarding, distension, or worsening findings can change urgency, imaging/lab needs, pelvic evaluation, or ED referral.",
        bedsideQuestion: "Where is the pain, is it typical for your period, and are there urinary, GI, bleeding, pregnancy, fever, or discharge symptoms?",
        bedsideQuestionOptions: "Typical cramps / Focal pain / Urinary symptoms / GI symptoms / Heavy bleeding / Pregnancy possible / Fever or discharge / Other ___"
      }
    ],
    conditional: [
      { pattern: /\b(?:cva tenderness)\b/, strength: 54, domain: "GU/Renal Add-on", reason: "Adds renal/GU source check when urinary symptoms or flank pain accompany pelvic/lower-abdominal pain.", when: /\b(?:flank|urinary|dysuria|hematuria|pyelo|renal|stone)\b/ },
      { pattern: /\b(?:rebound|psoas|obturator)\b/, strength: 56, domain: "Peritoneal/Pelvic Irritation Add-on", reason: "Adds peritoneal or pelvic-irritation signs when pain is focal, severe, atypical, or appendicitis/ectopic/PID is being considered.", when: /\b(?:severe|focal|rlq|right lower quadrant|guarding|rebound|appendicitis|ectopic|pid|pelvic inflammatory)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:abdominal percussion)\b/, unless: /\b(?:distension|bloating|obstruction|ileus|ascites)\b/, reason: "Abdominal percussion is a lower-yield add-on for uncomplicated menstrual/pelvic cramps unless distension, obstruction/ileus, or ascites is suspected." },
      { pattern: /\b(?:jvp|pmi|apical impulse|carotids|heart sounds|posterior lung sounds|radial pulses)\b/, unless: /\b(?:syncope|faint|shock|dyspnea|chest pain|palpitations|hypotension)\b/, reason: "Pelvic/lower-abdominal pain does not need cardiopulmonary add-ons unless instability, syncope, dyspnea, chest pain, palpitations, or shock is present." },
      { pattern: /\b(?:visual acuity|visual fields|extraocular|pupils|pronator drift|babinski|vibration sense|finger to nose|heel to shin)\b/, unless: /\b(?:focal|vision|headache|ataxia|weakness|seizure|confusion)\b/, reason: "Neuro/eye maneuvers need neurologic symptoms in pelvic/lower-abdominal pain presentations." }
    ]
  },
  {
    id: "gi_bleed_alarm",
    name: "GI bleeding or upper GI alarm symptoms",
    context: /\b(?:gi bleed|melena|black stool|tarry stool|hematemesis|vomiting blood|blood in stool|hematochezia|dysphagia|trouble swallowing|difficulty swallowing|weight loss|early satiety)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 82, domain: "Vitals", reason: "Assesses hemodynamic significance and instability in GI bleed or alarm presentations." },
      { pattern: /\b(?:sclerae and conjunctivae|mouth exam|oropharynx)\b/, strength: 78, domain: "Mucosa/HEENT", reason: "Checks pallor, mucosal bleeding, oral lesions, or oropharyngeal clues relevant to bleeding or dysphagia." },
      { pattern: /\b(?:abdominal palpation|abdominal inspection|bowel sounds)\b/, strength: 76, domain: "Abdomen", reason: "Assesses tenderness, distension, and abdominal source clues in GI bleeding or alarm symptoms.", unless: /\b(?:isolated dysphagia|food stuck only)\b/ },
      { pattern: /\b(?:supraclavicular nodes|anterior cervical nodes|posterior cervical nodes|submandibular nodes)\b/, strength: 58, domain: "Alarm/Nodes", reason: "Adds node survey when progressive dysphagia, weight loss, malignancy, or systemic symptoms are present.", when: /\b(?:dysphagia|trouble swallowing|difficulty swallowing|weight loss|malignancy|cancer|night sweats|neck mass|hoarse)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:pmi|jvp|lower extremity edema|carotids)\b/, unless: /\b(?:heart failure|syncope|shock|edema|orthopnea|cardiac)\b/, reason: "Cardiac/volume add-ons need shock, cardiac, or volume context in GI presentations." },
      { pattern: /\b(?:visual acuity|vibration sense|babinski|finger to nose|heel to shin)\b/, unless: /\b(?:focal|vision|ataxia|neuropathy|weakness|fall)\b/, reason: "Neuro/eye maneuvers need focal neurologic, visual, or neuropathy symptoms in GI presentations." }
    ]
  },
  {
    id: "gu_renal",
    name: "GU, AKI, hypovolemia, or flank pain",
    context: /\b(?:aki|acute kidney injury|rising creatinine|oliguria|dysuria|hematuria|urinary|flank|pyelonephritis|renal colic|polyuria|hypovolemia|dehydration)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 78, domain: "Vitals", reason: "Checks shock, fever physiology, and volume-sensitive management." },
      { pattern: /\b(?:jvp|mouth exam|radial pulses|lower extremity edema)\b/, strength: 82, domain: "Volume/Perfusion", reason: "Assesses volume status and perfusion before fluid or diuresis decisions." },
      { pattern: /\b(?:cva tenderness)\b/, strength: 70, domain: "Renal/GU Abdomen", reason: "Looks for pyelonephritis or renal colic when flank or urinary symptoms are present.", when: /\b(?:flank|pyelo|stone|renal colic|urinary|dysuria|hematuria|fever)\b/ },
      { pattern: /\b(?:abdominal palpation|bowel sounds)\b/, strength: 58, domain: "Renal/GU Abdomen", reason: "Adds abdominal/GU source assessment when abdominal pain, vomiting, or urinary symptoms coexist.", when: /\b(?:abdominal|vomit|nausea|urinary|dysuria|hematuria)\b/ }
    ]
  },
  {
    id: "infection_sepsis",
    name: "Fever, infection, or sepsis",
    context: /\b(?:fever|chills|rigors|night sweats|infection|sepsis|leukocytosis|pneumonia|pyelonephritis|sore throat|pharyngitis|lymphadenitis|wound)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 84, domain: "Vitals", reason: "Checks sepsis physiology and escalation need." },
      { pattern: /\b(?:posterior lung sounds|lateral lung sounds|lung percussion)\b/, strength: 70, domain: "Respiratory Source", reason: "Looks for pneumonia or lower respiratory source when cough, dyspnea, hypoxia, or sepsis is present.", when: /\b(?:cough|dyspnea|hypoxia|pneumonia|respiratory|sepsis)\b/ },
      { pattern: /\b(?:oropharynx|mouth exam)\b/, strength: 70, domain: "HEENT Source", reason: "Looks for pharyngitis, oral lesions, or mucosal findings when HEENT infection is possible." },
      { pattern: /\b(?:cva tenderness)\b/, strength: 62, domain: "Renal/GU Source", reason: "Looks for pyelonephritis when flank pain, urinary symptoms, or sepsis is present.", when: /\b(?:flank|urinary|dysuria|pyelo|renal|sepsis)\b/ },
      { pattern: /\b(?:abdominal palpation|bowel sounds)\b/, strength: 58, domain: "Abdominal Source", reason: "Adds abdominal source assessment when abdominal symptoms or undifferentiated sepsis are present.", when: /\b(?:abdominal|vomit|diarrhea|gi|sepsis|peritonitis)\b/ },
      { pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|tonsillar nodes|submandibular nodes|supraclavicular nodes)\b/, strength: 56, domain: "Nodes", reason: "Adds regional node exam when throat, neck, malignancy, or lymphadenopathy concerns are present.", when: /\b(?:sore throat|pharyngitis|lymph|adenopathy|neck mass|malignancy|night sweats)\b/ }
    ]
  },
  {
    id: "lymph_malignancy",
    name: "Lymphadenopathy, B symptoms, or malignancy concern",
    context: /\b(?:lymphadenopathy|swollen glands|lymph nodes|neck mass|night sweats|unintentional weight loss|weight loss|lymphoma|malignancy|cancer)\b/,
    core: [
      { pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|submandibular nodes|tonsillar nodes)\b/, strength: 86, domain: "Nodes", reason: "Localizes lymphadenopathy and screens high-risk nodal regions when B symptoms or malignancy are possible." },
      { pattern: /\b(?:spleen palpation|abdominal palpation)\b/, strength: 64, domain: "Abdomen/Spleen", reason: "Checks splenomegaly or abdominal findings relevant to hematologic malignancy or systemic infection." },
      { pattern: /\b(?:mouth exam|oropharynx)\b/, strength: 56, domain: "HEENT Source", reason: "Looks for oral, tonsillar, or pharyngeal source clues when regional nodes are present." },
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 52, domain: "Vitals", reason: "Screens systemic illness severity in malignancy, infection, or inflammatory presentations." }
    ],
    suppress: [
      { pattern: /\b(?:pmi|jvp|carotids|lower extremity edema)\b/, unless: /\b(?:edema|heart failure|syncope|vascular)\b/, reason: "Cardiac/vascular maneuvers need specific cardiac, volume, or vascular context in lymphadenopathy presentations." },
      { pattern: /\b(?:vibration sense|babinski|visual acuity|finger to nose|heel to shin)\b/, unless: /\b(?:neuropathy|focal|vision|ataxia|weakness)\b/, reason: "Neuro/eye maneuvers need focal neurologic, visual, or neuropathy symptoms." }
    ]
  },
  {
    id: "heent_focused",
    name: "Focused HEENT, ear, nasal, or throat concern",
    context: /\b(?:earache|ear pain|otalgia|hearing changes|hearing loss|sore throat|pharyngitis|muffled voice|drooling|epistaxis|nosebleed|nasal congestion|runny nose|sinus|dysphagia|hoarse voice)\b/,
    core: [
      { pattern: /\b(?:external ears|otoscope exam)\b/, strength: 78, domain: "Ear", reason: "Targets external ear, canal, and tympanic membrane findings when ear pain, hearing change, or otalgia is present.", when: /\b(?:earache|ear pain|otalgia|hearing|vertigo)\b/ },
      { pattern: /\b(?:nasal exam|sinus tenderness)\b/, strength: 66, domain: "Nose/Sinus", reason: "Targets nasal source or sinus tenderness when epistaxis, congestion, or sinus symptoms are present.", when: /\b(?:epistaxis|nosebleed|nasal|congestion|runny nose|sinus)\b/ },
      { pattern: /\b(?:mouth exam|oropharynx)\b/, strength: 76, domain: "Mouth/Throat", reason: "Checks oral, pharyngeal, tonsillar, or airway-adjacent findings when throat, dysphagia, or airway symptoms are present.", when: /\b(?:sore throat|pharyngitis|muffled|drooling|dysphagia|hoarse|airway|throat)\b/ },
      { pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|tonsillar nodes|submandibular nodes)\b/, strength: 58, domain: "Regional Nodes", reason: "Adds regional nodes when infection, throat symptoms, or malignancy concern is present.", when: /\b(?:sore throat|pharyngitis|lymph|neck mass|dysphagia|fever|malignancy|weight loss)\b/ },
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 56, domain: "Vitals", reason: "Checks systemic severity, bleeding impact, and airway/respiratory risk." }
    ],
    suppress: [
      { pattern: /\b(?:abdominal palpation|abdominal inspection|bowel sounds|cva tenderness|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:abdominal pain|vomit|diarrhea|flank|urinary|jaundice|gi bleed)\b/, reason: "HEENT presentations do not need abdominal/GU maneuvers unless abdominal, GU, or hepatobiliary symptoms are present." },
      { pattern: /\b(?:pmi|jvp|lower extremity edema|dorsalis pedis|posterior tibial)\b/, unless: /\b(?:heart failure|edema|shock|vascular|foot|ulcer)\b/, reason: "HEENT presentations need cardiac/vascular add-ons only with shock, volume, vascular, or wound context." }
    ]
  },
  {
    id: "heme_bleeding_anemia",
    name: "Bleeding, bruising, pallor, or anemia concern",
    context: /\b(?:easy bruising|bruising|petechiae|pallor|bleeding gums|epistaxis|nosebleed|anemia|fatigue|unexplained fatigue)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 74, domain: "Vitals", reason: "Assesses hemodynamic significance of anemia, bleeding, or systemic illness." },
      { pattern: /\b(?:mouth exam|oropharynx|sclerae and conjunctivae)\b/, strength: 78, domain: "Mucosa/Conjunctiva", reason: "Checks mucosal bleeding, pallor, jaundice, or dehydration clues relevant to bleeding/anemia." },
      { pattern: /\b(?:abdominal palpation|spleen palpation)\b/, strength: 48, domain: "Abdomen Add-on", reason: "Adds hepatosplenomegaly or abdominal assessment when malignancy, hemolysis, or systemic disease is suspected.", when: /\b(?:splenomegaly|lymph|night sweats|malignancy|cancer|hepatomegaly|abdominal)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:visual acuity|visual fields|extraocular|ophthalmoscopic|finger to nose|heel to shin|rapid alternating|gait|romberg|babinski|vibration sense)\b/, unless: /\b(?:focal|vision|ataxia|neuropathy|stroke|numbness|weakness|fall)\b/, reason: "Neuro/eye maneuvers need focal neurologic, visual, gait, or neuropathy symptoms in anemia/bleeding presentations." }
    ]
  },
  {
    id: "focused_msk",
    name: "Focused musculoskeletal joint or injury concern",
    context: /\b(?:shoulder pain|rotator cuff|limited abduction|knee pain|swollen knee|hot swollen knee|septic arthritis|ankle pain|ankle sprain|twisting injury|hand pain|morning stiffness|mcp|pip|arthritis|joint pain|arthralgia|joint swelling|unable to bear weight|fall|trauma)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 58, domain: "Vitals", reason: "Screens fever, systemic illness, or injury severity when infection or acute trauma is possible.", when: /\b(?:fever|hot|septic|infection|trauma|fall|unable to bear weight)\b/ },
      { pattern: /\b(?:shoulder inspection|shoulder palpation|shoulder flexion|shoulder extension|shoulder abduction|shoulder adduction|shoulder external rotation|shoulder internal rotation|empty can|hawkins)\b/, strength: 84, domain: "Shoulder", reason: "Localizes shoulder pain, ROM limitation, and rotator cuff/impingement concern.", when: /\b(?:shoulder|rotator cuff|abduction)\b/ },
      { pattern: /\b(?:knee inspection|knee palpation|knee flexion rom|knee extension rom|ballottement|anterior drawer|posterior drawer|patellar grind)\b/, strength: 84, domain: "Knee", reason: "Localizes knee swelling, pain, ROM loss, effusion, or instability.", when: /\b(?:knee|septic arthritis|unable to bear weight)\b/ },
      { pattern: /\b(?:hand inspection|hand joint palpation|finger flexion|finger extension|finger abduction|thumb opposition)\b/, strength: 82, domain: "Hand/Arthritis", reason: "Checks inflammatory hand joint pattern, swelling, tenderness, and functional ROM.", when: /\b(?:hand|mcp|pip|dip|morning stiffness|swollen fingers|finger)\b/ },
      { pattern: /\b(?:ankle inspection|ankle palpation|ankle dorsiflexion rom|ankle plantarflexion rom|ankle inversion|ankle eversion)\b/, strength: 82, domain: "Ankle", reason: "Localizes ankle trauma, swelling, pain, and ROM limits.", when: /\b(?:ankle|sprain|twisting)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:visual acuity|pupils|extraocular|facial symmetry|babinski|pronator drift|vibration sense)\b/, unless: /\b(?:focal|vision|headache|ataxia|neuropathy|weakness|numbness|tingling|stroke)\b/, reason: "Neuro/eye maneuvers need focal neurologic, visual, sensory, or weakness context in MSK presentations." },
      { pattern: /\b(?:mouth exam|oropharynx|otoscope|external ears|sclerae and conjunctivae)\b/, unless: /\b(?:sore throat|pharyngitis|airway|drooling|oral|dental|epistaxis|bleeding gums|eye|jaundice)\b/, reason: "Focused MSK presentations need HEENT add-ons only with airway, oral, eye, bleeding, or hepatobiliary context." },
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|cva tenderness|jvp|pmi|heart sounds)\b/, unless: /\b(?:abdominal|flank|urinary|heart failure|chest pain|syncope|shock|sepsis)\b/, reason: "Abdominal/cardiac maneuvers need specific abdominal, GU, cardiac, shock, or sepsis context in MSK presentations." }
    ]
  },
  {
    id: "endocrine_symptoms",
    name: "Common endocrine symptom screen",
    context: /\b(?:weight gain|polydipsia|polyuria|polyphagia|heat intolerance|cold intolerance|excessive sweating|hyperhidrosis|erectile dysfunction|amenorrhea)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 72, domain: "Vitals", reason: "Screens hemodynamic and metabolic severity for endocrine presentations." },
      { pattern: /\b(?:thyroid exam|heart sounds|mouth exam|sclerae and conjunctivae)\b/, strength: 74, domain: "Endocrine Focus", reason: "Checks thyroid, cardiac, hydration, and visible systemic clues that can redirect endocrine workup." }
    ],
    suppress: [
      { pattern: /\b(?:abdominal palpation|bowel sounds|cva tenderness|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:abdominal|vomit|constipation|diarrhea|flank|urinary|polyuria|renal)\b/, reason: "Abdominal/GU maneuvers need GI, flank, urinary, or renal symptoms in endocrine screening." },
      { pattern: /\b(?:toe walking|heel walking|tandem gait|finger to nose|heel to shin|vibration sense|babinski)\b/, unless: /\b(?:neuropathy|numbness|weakness|gait|ataxia|fall)\b/, reason: "Neuro maneuvers need neuropathy, weakness, gait, or focal symptoms in endocrine screening." }
    ]
  },
  {
    id: "adrenergic_jittery",
    name: "Adrenergic, jittery, tremulous, or hypoglycemia-like symptoms",
    context: /\b(?:feeling jittery|jittery|shaky|feeling shaky|shaking|tremulous|sweaty|diaphoretic|sweating|hunger|low sugar|hypoglycemia|insulin reaction|adrenergic symptoms|palpitations|tremor)\b/,
    warnings: [
      "Bedside glucose check, mental status assessment, diaphoresis/tremor observation, medication/substance review, and symptom response to carbohydrates are clinically important for jittery or hypoglycemia-like presentations; not all are represented as physical-exam catalog rows."
    ],
    core: [
      {
        pattern: /\b(?:heart rate|blood pressure|respiratory rate)\b/,
        strength: 84,
        domain: "Vitals/Adrenergic Severity",
        reason: "Checks adrenergic physiology, instability, and severity for hypoglycemia-like, thyroid, stimulant, withdrawal, anxiety, or arrhythmia presentations.",
        diagnosticTarget: "Adrenergic severity: tachycardia, hypertension, hypotension, tachypnea, or instability accompanying jitteriness/shakiness.",
        management: "Abnormal vitals can trigger immediate glucose check/treatment, ECG/telemetry consideration, medication review, or escalation.",
        bedsideQuestion: "Any diabetes medicines or missed meals, low glucose reading, palpitations, chest pain, heat intolerance, weight loss, stimulant use, or anxiety trigger?",
        bedsideQuestionOptions: "No / Diabetes medicine / Missed meal / Low glucose / Palpitations / Heat or weight loss / Stimulant / Anxiety / Other ___"
      },
      {
        pattern: /\b(?:thyroid exam)\b/,
        strength: 58,
        domain: "Thyroid Add-on",
        reason: "Screens for goiter or thyroid tenderness when jitteriness could reflect thyrotoxicosis or thyroid disease.",
        when: /\b(?:thyroid|graves|heat intolerance|weight loss|palpitations|diarrhea|hyperthyroid|thyrotoxicosis)\b/,
        diagnosticTarget: "Thyroid enlargement, tenderness, nodularity, or asymmetry that supports endocrine framing.",
        management: "Abnormal thyroid findings can strengthen thyroid workup urgency and beta-blockade/endocrine escalation framing in context."
      },
      {
        pattern: /\b(?:heart sounds|radial pulses)\b/,
        strength: 54,
        domain: "Cardiac Add-on",
        reason: "Adds rhythm/perfusion clues when jitteriness includes palpitations, chest discomfort, syncope, or possible arrhythmia.",
        when: /\b(?:palpitations|chest pain|chest discomfort|syncope|presyncope|arrhythmia|tachycardia)\b/,
        diagnosticTarget: "Irregular rhythm, murmur, or perfusion abnormality accompanying adrenergic symptoms.",
        management: "Abnormal cardiac/perfusion findings can change ECG/telemetry urgency and escalation."
      }
    ],
    conditional: [
      { pattern: /\b(?:pupils|pronator drift|facial symmetry|gait)\b/, strength: 48, domain: "Neuro Safety Add-on", reason: "Adds focused neurologic safety checks when confusion, focal symptoms, intoxication, or severe hypoglycemia is possible.", when: /\b(?:confusion|altered|seizure|focal|weakness|fall|intoxication|overdose|severe hypoglycemia)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:jvp|pmi|lower extremity edema|carotids|radial pulses)\b/, unless: /\b(?:heart failure|volume overload|syncope|presyncope|vascular|bruit|chest pain|dyspnea|palpitations|arrhythmia|shock|hypotension)\b/, reason: "Adrenergic/jittery presentations need volume/perfusion add-ons only with cardiopulmonary, syncope, shock, arrhythmia, or vascular context." },
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|psoas|obturator|cva tenderness)\b/, unless: /\b(?:abdominal|vomit|diarrhea|flank|urinary|dka|hhs|adrenal)\b/, reason: "Adrenergic/jittery presentations do not need abdominal/GU maneuvers without GI, GU, or endocrine-crisis context." },
      { pattern: /\b(?:visual acuity|visual fields|ophthalmoscopic|vibration sense|proprioception|finger to nose|heel to shin|pronator drift|facial symmetry|pupils)\b/, unless: /\b(?:vision|ataxia|neuropathy|focal|seizure|confusion|altered|weakness)\b/, reason: "Broad neuro/eye maneuvers need neurologic, visual, sensory, or severe hypoglycemia context." }
    ]
  },
  {
    id: "diabetes_foot_neuropathy",
    name: "Diabetes foot, neuropathy, wound, or discharge-risk exam",
    context: /\b(?:neuropathy|numb feet|burning toes|foot ulcer|diabetic foot|diabetes foot|foot wound|non healing foot|poor perfusion|discharge planning|protective sensation)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate)\b/, strength: 58, domain: "Vitals", reason: "Adds basic hemodynamic context for inpatient diabetes, infection, wound, or discharge-risk assessment." },
      { pattern: /\b(?:dorsalis pedis|posterior tibial|femoral pulses)\b/, strength: 82, domain: "Foot/Vascular", reason: "Assesses perfusion relevant to foot ulcer, wound healing, and vascular risk." },
      { pattern: /\b(?:extremity light touch|extremity pinprick|vibration sense|proprioception)\b/, strength: 78, domain: "Neuropathy", reason: "Checks sensory neuropathy and protective sensation risk." },
      { pattern: /\b(?:ankle dorsiflexion|ankle plantarflexion|toe walking|heel walking)\b/, strength: 52, domain: "Foot Motor/Function", reason: "Adds functional foot/ankle assessment when neuropathy, foot drop, or discharge safety matters.", when: /\b(?:neuropathy|foot drop|weakness|discharge|ulcer|wound|foot)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:visual acuity|visual fields|ophthalmoscopic|extraocular|pupils)\b/, unless: /\b(?:vision|blurry|eye|diplopia|headache|retinopathy)\b/, reason: "Eye maneuvers need visual symptoms or eye/retinopathy context in diabetes foot/neuropathy presentations." },
      { pattern: /\b(?:murphy|rebound|psoas|obturator|cva tenderness|abdominal palpation)\b/, unless: /\b(?:abdominal|flank|urinary|vomit|dka|hhs)\b/, reason: "Abdominal/GU maneuvers need abdominal, urinary, flank, or hyperglycemic-crisis context." }
    ]
  },
  {
    id: "thyroid_endocrine",
    name: "Thyroid disease, storm, or myxedema",
    context: /\b(?:thyroid storm|thyrotoxicosis|graves|myxedema|hypothyroid|hyperthyroid|thyroid|goiter|bradycardia|hyperthermia|hypothermia|palpitations)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 84, domain: "Vitals", reason: "Assesses cardiovascular and respiratory severity in thyroid emergencies." },
      { pattern: /\b(?:thyroid exam|heart sounds|jvp|lower extremity edema)\b/, strength: 82, domain: "Thyroid/Cardiac", reason: "Links neck and cardiovascular findings to thyroid severity and escalation." },
      { pattern: /\b(?:pupils|gait|pronator drift)\b/, strength: 52, domain: "Neuro", reason: "Adds focused neuro safety checks when mental status, weakness, or myxedema/storm concern exists.", when: /\b(?:confusion|somnolence|agitation|weakness|myxedema|storm)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:preauricular nodes|posterior auricular nodes|occipital nodes|tonsillar nodes|submandibular nodes|submental nodes|posterior cervical nodes|supraclavicular nodes)\b/, unless: /\b(?:lymph|adenopathy|neck mass|malignancy|infection|sore throat)\b/, reason: "A full lymph-node survey is not core thyroid exam unless nodes, infection, or malignancy are part of the concern." }
    ]
  },
  {
    id: "hypertension_emergency",
    name: "Severe hypertension with end-organ symptom concern",
    context: /\b(?:hypertensive emergency|very high blood pressure|high blood pressure|severe hypertension|hypertension crisis)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 92, domain: "Vitals", reason: "Confirms severity and cardiopulmonary stress when hypertensive emergency is possible." },
      { pattern: /\b(?:pupils|visual acuity|visual fields|extraocular|ophthalmoscopic)\b/, strength: 78, domain: "Neuro/Ophthalmic", reason: "Checks visual or neurologic end-organ symptoms that change urgency." },
      { pattern: /\b(?:heart sounds|posterior lung sounds|jvp|radial pulses)\b/, strength: 74, domain: "Cardiopulmonary", reason: "Screens for heart failure, ischemia, pulmonary edema, or perfusion clues." },
      { pattern: /\b(?:pronator drift|facial symmetry)\b/, strength: 54, domain: "Stroke Screen", reason: "Adds a brief focal neurologic screen when headache, vision change, or neurologic symptoms accompany severe hypertension.", when: /\b(?:headache|vision|blurry|focal|weakness|aphasia|confusion)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:murphy|rebound|psoas|obturator|cva tenderness)\b/, unless: /\b(?:abdominal|flank|urinary)\b/, reason: "Abdominal/GU maneuvers need abdominal, flank, or urinary symptoms in hypertension presentations." },
      { pattern: /\b(?:vibration sense|proprioception|toe walking|heel walking)\b/, unless: /\b(?:neuropathy|gait|ataxia|numbness|tingling|weakness)\b/, reason: "Peripheral sensory/gait maneuvers need neuropathy, gait, sensory, or weakness symptoms." }
    ]
  },
  {
    id: "eye_vision",
    name: "Eye redness, discharge, or vision change",
    context: /\b(?:eye redness|eye discharge|red eye|ocular|vision change|blurry vision|diplopia|photophobia|eye pain|visual loss)\b/,
    core: [
      { pattern: /\b(?:visual acuity|pupils|extraocular|visual fields|sclerae and conjunctivae|ophthalmoscopic)\b/, strength: 86, domain: "Eye/Cranial Nerves", reason: "Focuses the bedside exam on visual function, pupils, eye movement, and visible ocular inflammation." }
    ],
    suppress: [
      { pattern: /\b(?:posterior lung sounds|bowel sounds|cva tenderness|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:fever|sepsis|dyspnea|cough|abdominal|flank|urinary)\b/, reason: "Not eye-focused without systemic, respiratory, abdominal, or GU triggers." }
    ]
  },
  {
    id: "dermatology",
    name: "Rash, wound, or dermatologic concern",
    context: /\b(?:rash|skin lesion|mole|urticaria|hives|pruritus|itching|ulcer|wound|alopecia|hair loss|dry skin|non healing)\b/,
    core: [
      { pattern: /\b(?:mouth exam|oropharynx|sclerae and conjunctivae)\b/, strength: 66, domain: "Skin Adjacent Exam", reason: "Checks mucosal and ocular involvement when rash, drug eruption, hives, or systemic dermatologic disease may change management." },
      { pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial)\b/, strength: 64, domain: "Wound/Vascular Risk", reason: "Adds vascular and edema context for wounds, ulcers, non-healing lesions, diabetic foot, or poor perfusion.", when: /\b(?:ulcer|wound|non healing|foot|diabetes|vascular|poor perfusion|ischemia|edema)\b/ },
      { pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|submandibular nodes|tonsillar nodes)\b/, strength: 54, domain: "Regional Nodes", reason: "Uses available catalog nodes as a proxy for regional lymph assessment when lesions, wounds, or malignancy concern is present.", when: /\b(?:skin lesion|mole|ulcer|wound|non healing|malignancy|cancer|infection)\b/ }
    ],
    suppress: [
      { pattern: /\b(?:pmi|vibration sense|carotids|murphy|psoas|obturator|babinski|finger to nose|abdominal palpation|bowel sounds|cva tenderness)\b/, unless: /\b(?:neuropathy|vascular|ulcer|weakness|abdominal|stroke|ataxia|flank|urinary)\b/, reason: "Not dermatology-focused without vascular, neurologic, abdominal, or GU triggers." }
    ]
  }
];

function clinicalBundleIdsFromContext(rawContext = "") {
  const ids = new Set();
  String(rawContext || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*clinical bundles?\s*:\s*(.+)$/i);
      if (!match) {
        return;
      }
      splitEvidenceList(match[1]).forEach((bundleId) => {
        if (bundleId) {
          ids.add(bundleId);
        }
      });
    });
  return ids;
}

function activeRecommendationProfiles(context, rawContext = "") {
  const validatedBundleIds = clinicalBundleIdsFromContext(rawContext);
  if (validatedBundleIds.size) {
    return clinicalRecommendationProfiles.filter((profile) => validatedBundleIds.has(profile.id));
  }
  return clinicalRecommendationProfiles.filter((profile) => profile.context.test(context));
}

function recommendationGroupApplies(group, candidateText, context) {
  return group.pattern.test(candidateText)
    && (!group.when || group.when.test(context))
    && (!group.unless || !group.unless.test(context));
}

function profileSignalsForCandidate(candidateText, context, profile) {
  const signals = [];
  for (const group of profile.core || []) {
    if (recommendationGroupApplies(group, candidateText, context)) {
      signals.push({
        profileId: profile.id,
        profileName: profile.name,
        type: "core",
        domain: group.domain || profile.name,
        reason: group.reason,
        diagnosticTarget: group.diagnosticTarget,
        management: group.management,
        bedsideQuestion: group.bedsideQuestion,
        bedsideQuestionOptions: group.bedsideQuestionOptions,
        strength: group.strength || 70
      });
    }
  }
  for (const group of profile.conditional || []) {
    if (recommendationGroupApplies(group, candidateText, context)) {
      signals.push({
        profileId: profile.id,
        profileName: profile.name,
        type: "conditional",
        domain: group.domain || profile.name,
        reason: group.reason,
        diagnosticTarget: group.diagnosticTarget,
        management: group.management,
        bedsideQuestion: group.bedsideQuestion,
        bedsideQuestionOptions: group.bedsideQuestionOptions,
        strength: group.strength || 50
      });
    }
  }
  return signals;
}

function isFaceFocusedNeuroContext(context) {
  return /\b(?:face weakness|facial weakness|face droop|facial droop|mouth droop|crooked smile|bell palsy|bells palsy)\b/.test(context)
    && !/\b(?:arm weakness|hand weakness|leg weakness|limb weakness|hemiparesis|hemiplegia|monoparesis|generalized weakness|numbness|tingling|paresthesia|sensory loss|ataxia|gait|walk|fall|myelopathy|radiculopathy|cord compression|back pain|foot drop)\b/.test(context);
}

function suppressionForCandidate(candidateText, context, activeProfiles) {
  if (/\b(?:setup|positioning|draping|stethoscope hygiene)\b/.test(candidateText)) {
    return "Technique/setup rows are audit metadata, not a patient-specific recommended exam item.";
  }
  if (isFaceFocusedNeuroContext(context)
    && /\b(?:deltoid|biceps|triceps|wrist extension|wrist flexion|finger abduction|hip flexion|knee extension|knee flexion|ankle dorsiflexion|ankle plantarflexion|plantarflexion|extremity light touch|extremity pinprick|vibration sense|proprioception|babinski|patellar reflex|achilles reflex|brachioradialis reflex|gait|toe walking|heel walking|romberg|rapid alternating|finger to nose|heel to shin)\b/.test(candidateText)) {
    return "Face-specific weakness prioritizes cranial nerve VII and stroke-screen maneuvers; broad limb, sensory, reflex, and gait testing needs limb, sensory, gait, cord, or neuropathy context.";
  }
  if (isFaceFocusedNeuroContext(context)
    && /\b(?:visual acuity|ophthalmoscopic|convergence)\b/.test(candidateText)) {
    return "Face-specific weakness prioritizes facial motor symmetry, basic cranial nerve/stroke screening, and pronator drift; acuity/fundoscopic add-ons need vision, eye, or headache context.";
  }
  if (/\b(?:lymph|nodes?)\b/.test(candidateText)
    && !/\b(?:thyroid exam|thyroid inspection|thyroid palpation)\b/.test(candidateText)
    && !/\b(?:lymph|lymphoma|node|adenopathy|swollen glands|night sweats|neck mass|malignancy|cancer|infection|sore throat|fever|pharyngitis|thyroid mass)\b/.test(context)) {
    return "Lymph-node survey needs lymphadenopathy, infection, malignancy, or neck-mass context.";
  }
  if (/\b(?:headache|migraine|eye redness|eye discharge|red eye|vision|vertigo|earache|ear pain|otalgia)\b/.test(context)
    && /\b(?:abdominal palpation|abdominal inspection|abdominal percussion|bowel sounds|murphy|rebound|psoas|obturator|cva tenderness)\b/.test(candidateText)
    && !/\b(?:abdominal pain|abd pain|belly pain|stomach pain|vomit|diarrhea|constipation|distension|jaundice|melena|hematochezia|gi bleed|flank|urinary|dysuria)\b/.test(context)) {
    return "Headache, eye, vertigo, or ear presentations do not need abdominal/GU maneuvers for nausea alone.";
  }
  if (/\b(?:diabetes|diabetic|neuropathy|foot ulcer|foot wound|non healing foot|poor perfusion)\b/.test(context)
    && /\b(?:visual acuity|visual fields|ophthalmoscopic|extraocular|pupils)\b/.test(candidateText)
    && !/\b(?:vision|blurry|eye|diplopia|headache|retinopathy)\b/.test(context)) {
    return "Diabetes foot/neuropathy presentations need eye maneuvers only with vision, eye, headache, or retinopathy context.";
  }
  if (/\b(?:abdominal palpation|abdominal inspection|abdominal percussion|bowel sounds|cva tenderness)\b/.test(candidateText)
    && !/\b(?:abdominal|abd pain|lower abdominal|pelvic|period cramps|menstrual|dysmenorrhea|vomit|nausea|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|gi bleed|heartburn|dysphagia|flank|dysuria|hematuria|pyelo|renal colic|sepsis|peritonitis|dka|hhs|adrenal|hypercalcemia)\b/.test(context)) {
    return "Abdominal/CVA maneuvers need GI, flank/GU, sepsis, or endocrine-crisis context.";
  }
  if (/\b(?:psoas|obturator)\b/.test(candidateText)
    && !/\b(?:rlq|right lower quadrant|appendicitis|pelvic|ectopic|pid|pelvic inflammatory)\b/.test(context)) {
    return "Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.";
  }
  if (/\b(?:murphy)\b/.test(candidateText)
    && !/\b(?:ruq|right upper quadrant|biliary|cholecystitis|jaundice|gallbladder)\b/.test(context)) {
    return "Murphy sign needs RUQ, biliary, gallbladder, or jaundice context.";
  }
  if (/\b(?:liver edge|liver span)\b/.test(candidateText)
    && !/\b(?:ruq|right upper quadrant|jaundice|hepatomegaly|liver|cirrhosis|ascites)\b/.test(context)) {
    return "Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.";
  }
  if (/\b(?:spleen palpation)\b/.test(candidateText)
    && !/\b(?:splenomegaly|spleen|lymphoma|lymphadenopathy|swollen glands|night sweats|malignancy|cancer|hematologic)\b/.test(context)) {
    return "Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.";
  }
  if (/\b(?:murphy|psoas|obturator|rebound|liver edge|liver span|spleen palpation)\b/.test(candidateText)
    && !/\b(?:ruq|rlq|right upper quadrant|right lower quadrant|jaundice|cholecystitis|appendicitis|peritonitis|guarding|pelvic|ectopic|pid|pelvic inflammatory|severe|focal|splenomegaly|lymphoma|lymphadenopathy|swollen glands|night sweats|malignancy|cancer|liver|spleen)\b/.test(context)) {
    return "Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.";
  }
  if (/\b(?:pmi|apical impulse)\b/.test(candidateText)
    && !/\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|edema|murmur|cardiac enlargement|heave)\b/.test(context)) {
    return "PMI/apical impulse is reserved for cardiac, heart-failure, or volume-overload contexts.";
  }
  if (/\b(?:lower extremity edema|edema)\b/.test(candidateText)
    && !/\b(?:edema|swelling|heart failure|chf|volume overload|orthopnea|pnd|diuresis|aki|renal|kidney|oliguria|hypovolemia|dehydration|shock|dka|hhs|adrenal|hypercalcemia|ascites|cirrhosis|liver|jaundice|leg|dvt|venous)\b/.test(context)) {
    return "Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.";
  }
  if (/\b(?:vibration sense|proprioception)\b/.test(candidateText)
    && !/\b(?:neuropathy|numbness|tingling|paresthesia|b12|dorsal column|foot|ulcer|wound|gait|ataxia|weakness)\b/.test(context)) {
    return "Vibration/proprioception testing needs neuropathy, sensory, gait, or diabetic-foot context.";
  }
  if (/\b(?:carotids)\b/.test(candidateText)
    && !/\b(?:syncope|presyncope|stroke|tia|bruit|carotid|vascular|focal)\b/.test(context)) {
    return "Carotid exam needs syncope, focal neurologic, bruit, or vascular context.";
  }
  for (const profile of activeProfiles) {
    for (const rule of profile.suppress || []) {
      if (rule.pattern.test(candidateText) && (!rule.unless || !rule.unless.test(context))) {
        return rule.reason;
      }
    }
  }
  return "";
}

function recommendationContextOverlap(candidateText, context) {
  const ignored = new Set([
    "exam",
    "check",
    "finding",
    "findings",
    "patient",
    "bedside",
    "diagnostic",
    "safety",
    "management",
    "relevant",
    "general",
    "clinic",
    "medicine"
  ]);
  return tokenizeEvidence(context)
    .filter((token) => !ignored.has(token) && candidateText.includes(token))
    .slice(0, 8);
}

function recommendationCandidateEntry(candidate, context, activeProfiles) {
  const candidateText = candidateRecommendationText(candidate);
  const maneuverText = candidateManeuverText(candidate);
  const profileSignals = activeProfiles.flatMap((profile) => profileSignalsForCandidate(maneuverText, context, profile));
  const bestSignal = profileSignals.sort((a, b) => b.strength - a.strength)[0] || null;
  const specificMatchedTags = (candidate.matchedTags || []).filter((tag) => !weakRecommendationTags.has(tag));
  const overlapTerms = recommendationContextOverlap(candidateText, context);
  const weakOnlyMatch = (candidate.matchedTags || []).length > 0 && specificMatchedTags.length === 0 && !profileSignals.length;
  const suppressionReason = suppressionForCandidate(maneuverText, context, activeProfiles);
  const scoreBreakdown = candidate.scoreBreakdown || {};
  let contextFitScore = 0;

  contextFitScore += bestSignal ? bestSignal.strength : 0;
  contextFitScore += Math.min(32, specificMatchedTags.length * 12);
  contextFitScore += Math.min(24, overlapTerms.length * 4);
  contextFitScore += Math.min(22, Math.max(0, (candidate.score || 0) - 55) / 3);
  contextFitScore += Math.min(12, (scoreBreakdown.actionability || 0) / 8);
  if (candidate.review?.status === "accepted") {
    contextFitScore += 24;
  }
  if (weakOnlyMatch) {
    contextFitScore -= 34;
  }
  if (suppressionReason) {
    contextFitScore -= 85;
  }
  contextFitScore = Math.max(0, Math.min(100, Math.round(contextFitScore)));

  let role = "suppressed";
  if (!suppressionReason && (candidate.review?.status === "accepted" || bestSignal?.type === "core")) {
    role = "core";
  } else if (!suppressionReason && (bestSignal?.type === "conditional" || contextFitScore >= 54 || (specificMatchedTags.length && (candidate.score || 0) >= 70))) {
    role = "conditional";
  }

  const reason = suppressionReason
    || bestSignal?.reason
    || (specificMatchedTags.length ? `Matches ${specificMatchedTags.slice(0, 4).join(", ")} context with management-linked evidence.` : "")
    || (overlapTerms.length ? `Shares context terms: ${overlapTerms.slice(0, 5).join(", ")}.` : "")
    || "Lower context fit than the recommended checklist.";

  return {
    candidate,
    exam_id: candidate.exam_id,
    label: candidate.examLabel || candidate.maneuver || candidate.exam_id,
    options: candidate.examOptions || "",
    domain: bestSignal?.domain || candidate.section || candidate.system || "Exam",
    role,
    reason,
    rationale: reason,
    managementRelevance: candidate.result_changes_management || candidate.management_link || "",
    evidence: {
      source: candidateSourceLabel(candidate),
      LR_plus: candidate.LR_plus || "",
      LR_minus: candidate.LR_minus || "",
      tier: candidate.evidence_tier || ""
    },
    feasibility: {
      difficulty: candidate.difficulty || "moderate",
      time_burden_minutes: candidate.time_burden_minutes || "",
      equipment_needed: candidate.equipment_needed || "none",
      patient_cooperation_required: candidate.patient_cooperation_required || ""
    },
    matchedTags: candidate.matchedTags || [],
    specificMatchedTags,
    recommendationSignals: profileSignals,
    displayDiagnosticTarget: bestSignal?.diagnosticTarget || "",
    displayManagement: bestSignal?.management || "",
    displayBedsideQuestion: bestSignal?.bedsideQuestion || "",
    displayBedsideQuestionOptions: bestSignal?.bedsideQuestionOptions || "",
    contextFitScore,
    score: candidate.score || 0,
    suppressionReason
  };
}

function selectRecommendationEntries(entries, context, options = {}) {
  const maxItems = options.maxItems || 24;
  const selected = [];
  const seen = new Set();
  const perDomain = new Map();
  const sorted = entries
    .slice()
    .sort((a, b) => b.contextFitScore - a.contextFitScore || b.score - a.score || (a.candidate.originalIndex || 0) - (b.candidate.originalIndex || 0));

  for (const entry of sorted) {
    const key = candidateRedundancyKey(entry.candidate, context);
    if (seen.has(key)) {
      continue;
    }
    const domain = entry.domain || "Exam";
    const domainCount = perDomain.get(domain) || 0;
    if (domainCount >= (options.maxPerDomain || 7) && selected.length >= 10) {
      continue;
    }
    selected.push(entry);
    seen.add(key);
    perDomain.set(domain, domainCount + 1);
    if (selected.length >= maxItems) {
      break;
    }
  }
  return selected;
}

export function buildRecommendedExamChecklist(contextText = "", rankedCandidates = [], options = {}) {
  const ranked = Array.isArray(rankedCandidates)
    ? { candidates: rankedCandidates, matchedTags: options.matchedTags || [] }
    : (rankedCandidates || {});
  const candidates = ranked.candidates || [];
  const context = normalizeEvidenceText(expandEvidenceContextText(contextText));
  const activeProfiles = activeRecommendationProfiles(context, contextText);
  const matchedTags = ranked.matchedTags || options.matchedTags || [];
  const entries = candidates.map((candidate) => recommendationCandidateEntry(candidate, context, activeProfiles));
  const coreItems = selectRecommendationEntries(entries.filter((entry) => entry.role === "core"), context, {
    maxItems: options.maxCoreItems || 24,
    maxPerDomain: options.maxCorePerDomain || 7
  });
  const coreIds = new Set(coreItems.map((entry) => entry.exam_id));
  const conditionalItems = selectRecommendationEntries(entries.filter((entry) => entry.role === "conditional" && !coreIds.has(entry.exam_id)), context, {
    maxItems: options.maxConditionalItems || 36,
    maxPerDomain: options.maxConditionalPerDomain || 8
  });
  const selectedIds = new Set([...coreIds, ...conditionalItems.map((entry) => entry.exam_id)]);
  const suppressedItems = entries
    .filter((entry) => !selectedIds.has(entry.exam_id))
    .sort((a, b) => b.score - a.score || b.contextFitScore - a.contextFitScore)
    .slice(0, options.maxSuppressedItems || 36);
  const totalCoreMinutes = coreItems.reduce((sum, entry) => sum + (numericValue(entry.feasibility.time_burden_minutes) || 0), 0);
  const warnings = [];
  activeProfiles
    .flatMap((profile) => profile.warnings || [])
    .forEach((warning) => {
      if (warning && !warnings.includes(warning)) {
        warnings.push(warning);
      }
    });
  if (!activeProfiles.length) {
    warnings.push("No syndrome bundle matched; recommendations are based on tag overlap, actionability, and feasibility.");
  }
  if (!coreItems.length && candidates.length) {
    warnings.push("Evidence retrieval succeeded, but no candidate had enough context fit to become a core recommendation.");
  }

  return {
    coreItems,
    conditionalItems,
    suppressedItems,
    catalogGaps: options.catalogGaps || [],
    matchedTags,
    activeProfiles: activeProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
    retrievedCandidates: candidates,
    totalCoreMinutes,
    warnings
  };
}

function lowActionabilityContextPenalty(candidate, context) {
  const candidateText = normalizeEvidenceText([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.section,
    candidate.base?.region_or_subsection
  ].join(" "));
  if (/\b(?:lymph|nodes?)\b/.test(candidateText) && !/\b(?:lymph|node|adenopathy|neck mass|malignancy|cancer|infection|sore throat|fever)\b/.test(context)) {
    return 35;
  }
  if (/\b(?:sclerae|conjunctivae|mouth|oropharynx)\b/.test(candidateText) && !/\b(?:eye|sclera|conjunct|mouth|oral|throat|jaundice|dry|dehydration|hypovolemia|infection|sore throat)\b/.test(context)) {
    return 18;
  }
  if (/\b(?:eye redness|eye discharge|red eye|ocular|vision change|blurry vision|diplopia|photophobia|eye pain)\b/.test(context)
    && /\b(?:nodes?|respiratory rate|cva tenderness|posterior lung sounds|bowel sounds)\b/.test(candidateText)
    && !/\b(?:fever|sepsis|lymph|sore throat|dyspnea|cough|flank|urinary|abdominal)\b/.test(context)) {
    return 30;
  }
  if (/\bcva tenderness\b/.test(candidateText) && !/\b(?:flank|cva|pyelo|stone|renal colic|uti|costovertebral)\b/.test(context)) {
    return 32;
  }
  if (/\b(?:edema|liver edge|liver span|apical impulse)\b/.test(candidateText) && !/\b(?:edema|swelling|heart failure|chf|orthopnea|congestion|volume overload|diuresis|ascites|hepatomegaly)\b/.test(context)) {
    return 24;
  }
  if (/\b(?:toe walking|heel walking|sensory exam setup|wrist extension|tandem gait|gait)\b/.test(candidateText) && !/\b(?:focal|stroke|fall|ataxia|neuropathy|numbness|tingling|weakness|sensory|gait|walk)\b/.test(context)) {
    return 20;
  }
  if (/\b(?:toe walking|heel walking|tandem gait)\b/.test(candidateText) && !/\b(?:gait|walk|fall|ataxia|vertigo|neuropathy|foot drop|leg weakness)\b/.test(context)) {
    return 22;
  }
  if (/\b(?:syncope|presyncope|lightheadedness|dizziness|near syncope|faint)\b/.test(context)
    && /\b(?:rapid alternating movements|finger to nose|heel to shin|toe walking|heel walking|tandem gait|romberg)\b/.test(candidateText)
    && !/\b(?:ataxia|vertigo|gait abnormality|fall|cerebellar|coordination)\b/.test(context)) {
    return 34;
  }
  if (/\b(?:pulmonary embolism|suspected pe|dvt|pleuritic chest pain)\b/.test(context)
    && /\b(?:pupils|pronator drift|gait|rapid alternating|finger to nose|heel to shin|romberg|carotids)\b/.test(candidateText)
    && !/\b(?:stroke|seizure|focal|facial droop|aphasia|headache|vision|ataxia)\b/.test(context)) {
    return 36;
  }
  if (isFaceFocusedNeuroContext(context)
    && /\b(?:deltoid|biceps|triceps|wrist extension|wrist flexion|finger abduction|hip flexion|knee extension|knee flexion|ankle dorsiflexion|ankle plantarflexion|plantarflexion|extremity light touch|extremity pinprick|vibration sense|proprioception|babinski|patellar reflex|achilles reflex|brachioradialis reflex|gait|toe walking|heel walking|romberg|rapid alternating|finger to nose|heel to shin)\b/.test(candidateText)) {
    return 42;
  }
  if (/\b(?:back pain|radiculopathy|sciatica|cord compression|saddle anesthesia|myelopathy)\b/.test(context)
    && /\b(?:wrist|finger abduction|facial|visual|extraocular|coordination|rapid alternating|finger to nose|heel to shin)\b/.test(candidateText)
    && !/\b(?:upper extremity|arm|hand|stroke|facial droop|vision|ataxia)\b/.test(context)) {
    return 28;
  }
  if (/\b(?:abdominal inspection|abdominal palpation|abdominal percussion|murphy|rebound|psoas|obturator|spleen|liver)\b/.test(candidateText) && !/\b(?:abdomen|abdominal|nausea|vomit|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|gi bleed|heartburn|dysphagia|urinary|flank|dysuria|hematuria)\b/.test(context)) {
    return 44;
  }
  if (/\b(?:scrotal|testicular|torsion|penile discharge)\b/.test(context)
    && /\b(?:murphy|psoas|obturator|rebound|liver edge|spleen palpation|abdominal percussion)\b/.test(candidateText)
    && !/\b(?:right upper quadrant|ruq|appendicitis|peritonitis|guarding)\b/.test(context)) {
    return 26;
  }
  if (/\b(?:femoral pulses|posterior tibial pulses|dorsalis pedis pulses)\b/.test(candidateText) && !/\b(?:leg|foot|edema|swelling|claudication|vascular|diabetes|neuropathy|dvt|wound|ulcer|shock|hypovolemia|dehydration|dyspnea)\b/.test(context)) {
    return 24;
  }
  if (/\b(?:setup|positioning|draping)\b/.test(candidateText)) {
    return 18;
  }
  return 0;
}

function highYieldContextBoost(candidate, context) {
  const candidateText = normalizeEvidenceText([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.section,
    candidate.base?.region_or_subsection,
    candidate.retrieval_tags
  ].join(" "));
  let boost = 0;
  if (/\b(?:dka|hhs|anion gap|insulin drip|hyperglycemic crisis)\b/.test(context)
    && /\b(?:blood pressure|heart rate|respiratory rate|mouth|mucous|jvp|abdominal tenderness|abdominal palpation|bowel sounds|radial pulses|capillary)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:dka|hhs|anion gap|insulin drip|hyperglycemic crisis)\b/.test(context)
    && /\b(?:respiratory rate|work of breathing|posterior lung sounds)\b/.test(candidateText)) {
    boost += 26;
  }
  if (/\b(?:dka|hhs|anion gap|insulin drip|hyperglycemic crisis)\b/.test(context)
    && /\b(?:blood pressure|heart rate|respiratory rate|mouth|mucous)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:thyroid storm|thyrotoxicosis|graves|myxedema|severe hypothyroidism)\b/.test(context)
    && /\b(?:heart rate|blood pressure|respiratory rate|heart sounds|thyroid|jvp|edema|vital signs|vitals)\b/.test(candidateText)) {
    boost += 30;
  }
  if (/\b(?:pituitary|sellar|optic chiasm|visual field|apoplexy|diplopia)\b/.test(context)
    && /\b(?:visual acuity|visual fields|extraocular|pupils|cranial nerves)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:adrenal crisis|adrenal insufficiency|hydrocortisone|hypotension|hyperkalemia)\b/.test(context)
    && /\b(?:blood pressure|heart rate|jvp|mouth|mucous|abdominal tenderness|bowel sounds|respiratory rate)\b/.test(candidateText)) {
    boost += 32;
  }
  if (/\b(?:dyspnea|hypoxia|orthopnea|heart failure|volume overload|diuresis)\b/.test(context)
    && /\b(?:jvp|edema|posterior lung sounds|lung sounds|lung percussion|fremitus|heart sounds|blood pressure|respiratory rate)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:airway|stridor|throat tightness|hoarse voice|drooling|anaphylaxis|hives|lip swelling|wheezing)\b/.test(context)
    && /\b(?:blood pressure|heart rate|respiratory rate|oropharynx|mouth|posterior lung sounds|anterior lung sounds|lateral lung sounds)\b/.test(candidateText)) {
    boost += 48;
  }
  if (/\b(?:pulmonary embolism|suspected pe|pleuritic chest pain|dyspnea|hypoxia|oxygen requirement)\b/.test(context)
    && /\b(?:respiratory rate|posterior lung sounds|lateral lung sounds|work of breathing|oxygen support)\b/.test(candidateText)) {
    boost += 44;
  }
  if (/\b(?:aki|acute kidney injury|rising creatinine|oliguria|hypovolemia|dehydration)\b/.test(context)
    && /\b(?:blood pressure|jvp|mouth|mucous|radial pulses|heart rate|cva tenderness)\b/.test(candidateText)) {
    boost += 24;
  }
  if (/\b(?:palpitations|tachycardia|syncope|presyncope|dizziness|lightheadedness)\b/.test(context)
    && /\b(?:heart rate|blood pressure|heart sounds|pupils|gait|jvp|thyroid)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:syncope|presyncope|near syncope|faint|lightheadedness)\b/.test(context)
    && /\b(?:heart rate|blood pressure|heart sounds|jvp|posterior lung sounds|radial pulses|carotids|pupils|pronator drift)\b/.test(candidateText)) {
    boost += 52;
  }
  if (/\b(?:syncope|presyncope|near syncope|faint|lightheadedness)\b/.test(context)
    && /\b(?:heart rate|blood pressure|heart sounds|radial pulses|carotids)\b/.test(candidateText)) {
    boost += 46;
  }
  if (/\b(?:abdominal pain|nausea|vomit|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|heartburn|dysphagia|early satiety|anorexia|gi bleed)\b/.test(context)
    && /\b(?:abdominal palpation|abdominal inspection|abdominal percussion|bowel sounds|murphy|rebound|psoas|obturator|liver|spleen|mouth|blood pressure|heart rate|sclerae)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:gi bleed|melena|black stool|tarry stool|hematemesis|vomiting blood|blood in stool)\b/.test(context)
    && /\b(?:blood pressure|heart rate|respiratory rate|sclerae|conjunctivae|mouth|oropharynx|abdominal palpation|abdominal inspection|bowel sounds)\b/.test(candidateText)) {
    boost += 46;
  }
  if (/\b(?:dysphagia|trouble swallowing|difficulty swallowing|food stuck|hoarse voice)\b/.test(context)
    && /\b(?:mouth|oropharynx|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|submandibular nodes|blood pressure|heart rate)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:jaundice|dark urine|pale stools)\b/.test(context)
    && /\b(?:sclerae|conjunctivae|abdominal palpation|abdominal inspection|liver edge|liver span|spleen|supraclavicular nodes|blood pressure|heart rate)\b/.test(candidateText)) {
    boost += 38;
  }
  if (/\b(?:headache|vision|blurry|diplopia|facial droop|aphasia|stroke|tia|focal deficit)\b/.test(context)
    && /\b(?:pupils|visual fields|visual acuity|extraocular|facial symmetry|pronator drift|tongue|gait)\b/.test(candidateText)) {
    boost += 40;
  }
  if (/\b(?:face weakness|facial weakness|face droop|facial droop|mouth droop|crooked smile|bell palsy|bells palsy)\b/.test(context)
    && /\b(?:facial symmetry|eye closure|pronator drift|pupils|extraocular|visual fields|tongue protrusion)\b/.test(candidateText)) {
    boost += 54;
  }
  if (/\b(?:eye redness|eye discharge|red eye|ocular|vision change|blurry vision|diplopia|photophobia|eye pain)\b/.test(context)
    && /\b(?:sclerae|conjunctivae|visual acuity|pupils|extraocular|ophthalmoscopic|visual fields)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:numbness|tingling|paresthesia|neuropathy|weakness|hemiparesis|seizure)\b/.test(context)
    && /\b(?:extremity light touch|extremity pinprick|vibration|proprioception|pronator drift|deltoid|hip flexion|babinski|pupils|gait)\b/.test(candidateText)) {
    boost += 38;
  }
  if (/\b(?:numbness|tingling|paresthesia|neuropathy)\b/.test(context)
    && /\b(?:extremity light touch|extremity pinprick|vibration|proprioception)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:claudication|leg pain|rest pain|cold limb)\b/.test(context)
    && /\b(?:dorsalis pedis|posterior tibial|femoral pulses|lower extremity edema|extremity light touch)\b/.test(candidateText)) {
    boost += 48;
  }
  if (/\b(?:raynaud|cold painful fingers|cold fingers|fingers turn white|blue fingers|white fingers|digital ischemia)\b/.test(context)
    && /\b(?:radial pulses|hand inspection|hand joint palpation)\b/.test(candidateText)) {
    boost += 54;
  }
  if (/\b(?:vertigo|ataxia|gait abnormality)\b/.test(context)
    && /\b(?:gait|romberg|tandem|finger to nose|heel to shin|extraocular|pupils)\b/.test(candidateText)) {
    boost += 40;
  }
  if (/\b(?:earache|ear pain|otalgia|hearing changes|hearing loss|vertigo)\b/.test(context)
    && /\b(?:external ears|otoscope|extraocular|pupils|gait|romberg|blood pressure|heart rate)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:shoulder pain|rotator cuff|limited abduction)\b/.test(context)
    && /\b(?:shoulder inspection|shoulder palpation|shoulder flexion|shoulder extension|shoulder abduction|shoulder adduction|shoulder external rotation|shoulder internal rotation|empty can|hawkins)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:knee pain|swollen knee|hot swollen knee|septic arthritis|unable to bear weight)\b/.test(context)
    && /\b(?:knee inspection|knee palpation|knee flexion rom|knee extension rom|ballottement|anterior drawer|posterior drawer|patellar grind)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:hand pain|morning stiffness|mcp|pip|dip|swollen fingers|finger swelling)\b/.test(context)
    && /\b(?:hand inspection|hand joint palpation|finger flexion|finger extension|finger abduction|thumb opposition)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:ankle pain|ankle sprain|twisting injury)\b/.test(context)
    && /\b(?:ankle inspection|ankle palpation|ankle dorsiflexion rom|ankle plantarflexion rom|ankle inversion|ankle eversion)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:back pain|radiculopathy|sciatica|cord compression|saddle anesthesia|myelopathy|urinary incontinence)\b/.test(context)
    && /\b(?:babinski|patellar reflex|achilles|extremity light touch|extremity pinprick|hip flexion|knee extension|ankle dorsiflexion|ankle plantarflexion|gait|toe walking|heel walking)\b/.test(candidateText)) {
    boost += 52;
  }
  if (/\b(?:fever|chills|rigors|night sweats|sore throat|pharyngitis|nasal congestion|runny nose|earache|otalgia|eye redness|discharge|lymphadenitis|lymphadenopathy)\b/.test(context)
    && /\b(?:respiratory rate|blood pressure|mouth|oropharynx|sclerae|conjunctivae|nodes|posterior lung sounds|cva tenderness|abdominal palpation|spleen)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:lymphadenopathy|swollen glands|lymph nodes|night sweats|malignancy|neck mass)\b/.test(context)
    && /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|tonsillar nodes|submandibular nodes|spleen palpation)\b/.test(candidateText)) {
    boost += 58;
  }
  if (/\b(?:weight loss|lymphoma|malignancy|cancer|night sweats|swollen glands|lymphadenopathy)\b/.test(context)
    && /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|tonsillar nodes|submandibular nodes|spleen palpation|mouth|oropharynx)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:bruising|petechiae|pallor|bleeding gums|epistaxis|anemia|thrombocytopenia|anticoagulation)\b/.test(context)
    && /\b(?:mouth|oropharynx|sclerae|conjunctivae|blood pressure|heart rate|jvp)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:dysuria|hematuria|urinary|oliguria|flank pain|pyelonephritis|renal colic|polyuria)\b/.test(context)
    && /\b(?:cva tenderness|abdominal palpation|blood pressure|mouth|jvp|heart rate|bowel sounds)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:period cramps|menstrual cramps|menstrual pain|period pain|dysmenorrhea|pelvic pain|pelvic cramps|lower abdominal pain|lower belly cramps|menses|ectopic|pid|pelvic inflammatory)\b/.test(context)
    && /\b(?:abdominal inspection|abdominal palpation|bowel sounds|blood pressure|heart rate|respiratory rate|cva tenderness|rebound|psoas|obturator)\b/.test(candidateText)) {
    boost += 44;
  }
  if (/\b(?:feeling jittery|jittery|shaky|feeling shaky|shaking|tremulous|sweaty|diaphoretic|sweating|hunger|low sugar|hypoglycemia|insulin reaction|adrenergic symptoms|palpitations|tremor)\b/.test(context)
    && /\b(?:heart rate|blood pressure|respiratory rate|thyroid exam|heart sounds|radial pulses|pupils|pronator drift|facial symmetry)\b/.test(candidateText)) {
    boost += 42;
  }
  if (/\b(?:diabetes|diabetic|neuropathy|foot ulcer|foot wound|non healing foot|poor perfusion|discharge planning)\b/.test(context)
    && /\b(?:blood pressure|heart rate|dorsalis pedis|posterior tibial|femoral pulses|extremity light touch|extremity pinprick|vibration|proprioception|ankle dorsiflexion|ankle plantarflexion|toe walking|heel walking)\b/.test(candidateText)) {
    boost += 44;
  }
  if (/\b(?:scrotal pain|testicular|torsion|penile discharge)\b/.test(context)
    && /\b(?:abdominal palpation|blood pressure|heart rate|bowel sounds)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:anxiety|depression|insomnia|malaise|fatigue|weight change)\b/.test(context)
    && /\b(?:heart rate|blood pressure|thyroid|sclerae|conjunctivae|mouth|respiratory rate)\b/.test(candidateText)) {
    boost += 28;
  }
  if (/\b(?:hypertensive emergency|very high blood pressure|high blood pressure|severe hypertension|hypertension crisis)\b/.test(context)
    && /\b(?:blood pressure|heart rate|respiratory rate|pupils|visual acuity|visual fields|extraocular|ophthalmoscopic|heart sounds|posterior lung sounds|jvp|radial pulses|pronator drift|facial symmetry)\b/.test(candidateText)) {
    boost += 48;
  }
  return boost;
}

export function rankEvidenceCandidates(catalog = [], contextText = "", tagRows = [], options = {}) {
  const expandedContextText = expandEvidenceContextText(contextText);
  const context = normalizeEvidenceText(expandedContextText);
  const matchedTags = extractEvidenceTags(expandedContextText, tagRows);
  const matchedTagNames = new Set(matchedTags.map((match) => match.tag));
  const reviewState = normalizeEvidenceReviewState(options.reviewState || {});
  const weights = { ...defaultWeights, ...(options.weights || {}) };

  const scored = catalog.map((candidate, index) => {
    const review = reviewForCandidate(candidate, reviewState);
    const clinicalRelevance = scoreClinicalRelevance(candidate, matchedTags, context);
    const actionability = scoreActionability(candidate);
    const diagnosticValue = scoreDiagnosticValue(candidate);
    const bedsideFeasibility = scoreFeasibility(candidate);
    const specialtyContext = scoreSpecialtyContext(candidate, context, options);
    const exactTagMatch = candidate.tags?.some((tag) => matchedTagNames.has(tag));
    let score =
      clinicalRelevance * weights.clinicalRelevance +
      actionability * weights.actionability +
      diagnosticValue * weights.diagnosticValue +
      bedsideFeasibility * weights.bedsideFeasibility +
      specialtyContext * weights.specialtyContext;

    if (candidate.evidence_tier === "A") {
      score += 3;
    }
    if (exactTagMatch) {
      score += 12;
    }
    if (review?.status === "accepted") {
      score += 10;
    }
    if (review?.status === "rejected") {
      score -= 60;
    }
    score += highYieldContextBoost(candidate, context);
    score -= lowActionabilityContextPenalty(candidate, context);

    return {
      ...candidate,
      review,
      matchedTags: candidate.tags?.filter((tag) => matchedTagNames.has(tag)) || [],
      retrievalRoutes: [
        candidate.tags?.some((tag) => matchedTagNames.has(tag)) ? "tag" : "",
        "lexical"
      ].filter(Boolean),
      score,
      scoreBreakdown: {
        clinicalRelevance,
        actionability,
        diagnosticValue,
        bedsideFeasibility,
        specialtyContext
      },
      originalIndex: index
    };
  })
    .filter((candidate) => candidate.score > 35 && candidate.review?.status !== "rejected")
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  const selected = [];
  const seen = new Set();
  const maxCandidates = options.maxCandidates || 48;
  for (const candidate of scored) {
    const key = candidateRedundancyKey(candidate, context);
    if (seen.has(key)) {
      continue;
    }
    selected.push(candidate);
    seen.add(key);
    if (selected.length >= maxCandidates) {
      break;
    }
  }

  return {
    candidates: selected,
    matchedTags,
    allScored: scored
  };
}

function truncatePromptField(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function candidateSourceLabel(candidate) {
  return candidate.source?.source_id || candidate.evidence_source_primary || "local exam catalog (source pending)";
}

export function formatEvidenceCandidatesBlock(candidates = [], options = {}) {
  if (!candidates.length) {
    return "";
  }

  const lines = [
    "<retrieved_evidence_candidates>",
    "These are prioritized evidence-backed bedside question and exam seeds from the local maneuver catalog. They are a starting point, not an exclusive list.",
    "Prefer relevant candidate labels/options when they fit the patient, improve wording/options when clinically clearer, and add any missing bedside-feasible exam maneuvers or questions that are important for today's management.",
    "Do not copy low-relevance candidates just because they appear here. Use the source, LR, rationale, difficulty, and time fields to judge value, but keep citations and rationale out of the final checklist because the app displays metadata separately.",
    "Return only the standard two plain-text checklists.",
    ""
  ];

  candidates.slice(0, options.maxCandidates || 48).forEach((candidate, index) => {
    const lrParts = [
      candidate.LR_plus ? `LR+ ${candidate.LR_plus}` : "",
      candidate.LR_minus ? `LR- ${candidate.LR_minus}` : ""
    ].filter(Boolean).join(", ") || "LR not available";
    lines.push(
      [
        `${index + 1}. ${candidate.exam_id}`,
        `condition: ${truncatePromptField(candidate.condition_or_syndrome, 90)}`,
        `question: ${truncatePromptField(candidate.bedside_question_label, 120)}: ${truncatePromptField(candidate.bedside_question_options, 100)}`,
        `exam: ${truncatePromptField(candidate.examLabel, 80)}: ${truncatePromptField(candidate.examOptions, 100)}`,
        `use when: ${truncatePromptField(candidate.when_to_use_structured, 120)}`,
        `changes management: ${truncatePromptField(candidate.result_changes_management || candidate.management_link, 180)}`,
        `source: ${candidateSourceLabel(candidate)}; ${lrParts}; evidence ${candidate.evidence_tier || "C"}`,
        `feasibility: ${candidate.difficulty || "moderate"}, ${candidate.time_burden_minutes || "?"} min, equipment ${candidate.equipment_needed || "none"}`
      ].join(" | ")
    );
  });

  lines.push("</retrieved_evidence_candidates>");
  return lines.join("\n");
}

export function replaceStudentReferenceWithEvidenceBlock(prompt, evidenceBlock) {
  if (!evidenceBlock) {
    return prompt;
  }
  const promptText = String(prompt || "");
  if (/<student_exam_reference>[\s\S]*?<\/student_exam_reference>/.test(promptText)) {
    return promptText.replace(/<student_exam_reference>[\s\S]*?<\/student_exam_reference>/, evidenceBlock);
  }
  const plainStudentReferencePattern = /Student exam reference \(student_exam_reference[\s\S]*?(?:End student_exam_reference\.|Use the reference to avoid missing student-performable maneuvers, then choose the final concise exam checklist from patient-specific reasoning plus this reference\.)/;
  if (plainStudentReferencePattern.test(promptText)) {
    return promptText.replace(plainStudentReferencePattern, evidenceBlock);
  }
  if (promptText.includes("<format_contract>")) {
    return promptText.replace("<format_contract>", `${evidenceBlock}\n\n<format_contract>`);
  }
  if (promptText.includes("Output format rules:")) {
    return promptText.replace("Output format rules:", `${evidenceBlock}\n\nOutput format rules:`);
  }
  return `${promptText}\n\n${evidenceBlock}`;
}

export async function loadEvidenceCatalog(fetchText, urls = evidenceFileUrls) {
  const optionalFetchText = async (url) => {
    if (!url) {
      return "";
    }
    try {
      return await fetchText(url);
    } catch (error) {
      return "";
    }
  };
  const [baseText, overlayText, legacyOverlayText, tagText, sourceText] = await Promise.all([
    fetchText(urls.base),
    fetchText(urls.overlay),
    optionalFetchText(urls.legacyOverlay),
    fetchText(urls.tags),
    fetchText(urls.sources)
  ]);

  const baseRows = parseCsv(baseText);
  const overlayRows = parseCsv(overlayText);
  const legacyOverlayRows = parseCsv(legacyOverlayText);
  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  const tagRows = parseCsv(tagText);
  const sourceRows = parseCsv(sourceText);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    requestedOverlayRows: overlayRows,
    legacyOverlayRows,
    tagRows,
    sourceRows,
    catalog: joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows)
  };
}

export function buildEvidencePromptReplacement(prompt, evidenceCatalog, contextText, options = {}) {
  const ranked = rankEvidenceCandidates(evidenceCatalog.catalog, contextText, evidenceCatalog.tagRows, options);
  const recommendation = buildRecommendedExamChecklist(contextText, ranked, options);
  const promptCandidates = [];
  const seenPromptCandidateIds = new Set();
  [
    ...recommendation.coreItems.map((entry) => entry.candidate),
    ...recommendation.conditionalItems.map((entry) => entry.candidate),
    ...ranked.candidates
  ].forEach((candidate) => {
    if (!candidate?.exam_id || seenPromptCandidateIds.has(candidate.exam_id)) {
      return;
    }
    promptCandidates.push(candidate);
    seenPromptCandidateIds.add(candidate.exam_id);
  });
  const evidenceBlock = formatEvidenceCandidatesBlock(promptCandidates, options);
  return {
    prompt: evidenceBlock ? replaceStudentReferenceWithEvidenceBlock(prompt, evidenceBlock) : prompt,
    evidenceBlock,
    candidates: ranked.candidates,
    promptCandidates,
    recommendation,
    matchedTags: ranked.matchedTags
  };
}

export function matchEvidenceForChecklistItem(itemOrLabel, candidates = []) {
  const label = typeof itemOrLabel === "string" ? itemOrLabel : itemOrLabel?.label;
  const normalized = normalizeEvidenceLabel(label);
  if (!normalized) {
    return null;
  }
  let best = null;
  let bestScore = 0;
  const labelTokens = tokenizeEvidence(normalized);

  for (const candidate of candidates) {
    const candidateLabels = [
      candidate.examLabel,
      candidate.maneuver,
      candidate.bedside_question_label,
      candidate.base?.suggested_checklist_label,
      candidate.base?.maneuver_or_finding
    ].map(normalizeEvidenceLabel).filter(Boolean);

    for (const candidateLabel of candidateLabels) {
      let score = 0;
      if (candidateLabel === normalized) {
        score = 100;
      } else if (candidateLabel.includes(normalized) || normalized.includes(candidateLabel)) {
        score = 82;
      } else {
        const candidateTokens = new Set(tokenizeEvidence(candidateLabel));
        const overlap = labelTokens.filter((token) => candidateTokens.has(token)).length;
        score = labelTokens.length ? Math.round(overlap / labelTokens.length * 70) : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }

  return bestScore >= 45 ? { ...best, matchScore: bestScore } : null;
}

export function normalizeEvidenceReviewState(value = {}) {
  const source = typeof value === "string" ? safeJsonParse(value) : value;
  const items = {};
  Object.entries(source?.items || {}).forEach(([examId, review]) => {
    if (!examId || !["accepted", "rejected", "edited"].includes(review?.status)) {
      return;
    }
    items[examId] = {
      status: review.status,
      suggested_label: String(review.suggested_label || "").slice(0, 160),
      suggested_management: String(review.suggested_management || "").slice(0, 260),
      updated_at: review.updated_at || new Date().toISOString()
    };
  });
  return {
    schema: "preRoundEvidenceReviewV1",
    exported_at: source?.exported_at || "",
    items
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

export function updateEvidenceReviewState(state, examId, update) {
  const normalized = normalizeEvidenceReviewState(state);
  if (!examId) {
    return normalized;
  }
  normalized.items[examId] = {
    ...(normalized.items[examId] || {}),
    status: update.status,
    suggested_label: String(update.suggested_label || normalized.items[examId]?.suggested_label || "").slice(0, 160),
    suggested_management: String(update.suggested_management || normalized.items[examId]?.suggested_management || "").slice(0, 260),
    updated_at: new Date().toISOString()
  };
  return normalized;
}

export function exportEvidenceReviewState(state) {
  const normalized = normalizeEvidenceReviewState(state);
  return JSON.stringify({
    schema: "preRoundEvidenceReviewV1",
    exported_at: new Date().toISOString(),
    items: normalized.items
  }, null, 2);
}

export function importEvidenceReviewState(text) {
  return normalizeEvidenceReviewState(text);
}

export function evidenceReviewContainsPhiLikeContent(state) {
  const serialized = JSON.stringify(normalizeEvidenceReviewState(state));
  return /\b(?:MRN|DOB|CSN|SSN|Room|Patient Name|[A-Z][a-z]+ [A-Z][a-z]+,?\s+(?:MD|DO|RN))\b/.test(serialized);
}
