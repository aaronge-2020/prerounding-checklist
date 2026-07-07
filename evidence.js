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

const catalogGapHeaders = [
  "case_id",
  "gap_exam_id",
  "gap_label",
  "gap_type",
  "review_status",
  "review_owner",
  "last_reviewed",
  "source_ids",
  "source_citation",
  "rationale",
  "activation_condition",
  "planned_resolution"
];

const acceptedCatalogAdditionHeaders = [
  "exam_id",
  "exam_label",
  "exam_options",
  "maneuver",
  "exam_system",
  "section",
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
  "retrieval_tags",
  "last_reviewed",
  "review_owner"
];

const sourceRegistryHeaders = [
  "source_id",
  "source_name",
  "source_type",
  "url_or_doi",
  "date_accessed",
  "license_access_notes",
  "preferred_citation"
];

const requiredEvidenceOverlayMetadataFields = evidenceOverlayHeaders.filter((header) => ![
  "LR_plus",
  "LR_minus"
].includes(header));

export const evidenceFileUrls = {
  base: "data/evidence/exam_technique_base.csv",
  overlay: "data/evidence/exam_evidence_overlay.csv",
  legacyOverlay: "data/physical-exam/physical_exam_evidence_overlay.csv",
  acceptedCatalogAdditions: "data/evidence/accepted_exam_catalog_additions.csv",
  tags: "data/evidence/retrieval_tag_dictionary.csv",
  sources: "data/evidence/source_registry.csv",
  gaps: "data/evidence/catalog_gap_registry.csv"
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
    expansion: "jaundice sclerae conjunctivae hepatobiliary liver spleen supraclavicular nodes"
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
    id: "dvt",
    terms: [
      "one calf",
      "calf more swollen",
      "swollen calf",
      "calf swelling",
      "unilateral leg swelling",
      "one leg swollen",
      "leg swelling after surgery"
    ],
    expansion: "DVT venous thromboembolism unilateral leg swelling lower extremity edema calf pain suspected pulmonary embolism compression ultrasound"
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

export function validateEvidenceOverlayRows(rows, options = {}) {
  const missingHeaders = evidenceOverlayHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, header));
  const ids = new Set();
  const issues = [];
  const knownSourceIds = options.knownSourceIds ? new Set(options.knownSourceIds) : null;
  const baseRows = Array.isArray(options.baseRows) ? options.baseRows : null;
  const requireCompleteMetadata = Boolean(options.requireCompleteMetadata);
  if (missingHeaders.length) {
    issues.push({ type: "missing-headers", message: `Missing evidence overlay columns: ${missingHeaders.join(", ")}` });
  }

  rows.forEach((row, index) => {
    const label = row.exam_id || `row ${index + 1}`;
    if (!row.exam_id) {
      issues.push({ type: "missing-id", message: `Evidence row ${index + 1} is missing exam_id.` });
    } else if (ids.has(row.exam_id)) {
      issues.push({ type: "duplicate-id", message: `Duplicate exam_id: ${row.exam_id}` });
    }
    ids.add(row.exam_id);
    if (requireCompleteMetadata) {
      requiredEvidenceOverlayMetadataFields.forEach((field) => {
        if (!String(row[field] || "").trim()) {
          issues.push({ type: "missing-field", message: `${label} is missing ${field}.` });
        }
      });
    }
    if (knownSourceIds) {
      [row.evidence_source_primary, ...splitEvidenceList(row.source_citation)].filter(Boolean).forEach((sourceId) => {
        if (!knownSourceIds.has(sourceId)) {
          issues.push({ type: "unknown-source", message: `${label} references unknown source_id ${sourceId}.` });
        }
      });
    }
    if (baseRows) {
      const baseRowNumber = Number(row.base_row_number);
      const base = Number.isInteger(baseRowNumber) && baseRowNumber > 0 ? baseRows[baseRowNumber - 1] : null;
      if (!base) {
        issues.push({ type: "bad-base-row", message: `${label} references invalid base_row_number ${row.base_row_number || "missing"}.` });
      } else if (row.base_row_fingerprint && row.base_row_fingerprint !== rowFingerprint(base)) {
        issues.push({ type: "bad-base-fingerprint", message: `${label} base_row_fingerprint does not match base row ${baseRowNumber}.` });
      }
    }

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
    if (!validEvidenceLikelihoodRatioValue(row.LR_plus)) {
      issues.push({ type: "bad-lr-plus", message: `${row.exam_id || `row ${index + 1}`} has invalid LR_plus.` });
    }
    if (!validEvidenceLikelihoodRatioValue(row.LR_minus)) {
      issues.push({ type: "bad-lr-minus", message: `${row.exam_id || `row ${index + 1}`} has invalid LR_minus.` });
    }
  });

  return { ok: issues.length === 0, issues };
}

function validEvidenceLikelihoodRatioValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }
  return /^(?:n\/a|na|not available|not studied|pending|[<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*[<>]?\s*\d+(?:\.\d+)?)?)$/i.test(text);
}

function evidenceLikelihoodRatioUnavailable(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || /^(?:n\/a|na|not available|unavailable|not studied|pending)$/i.test(text);
}

function likelihoodRatioNoteForEvidenceItem(item = {}, itemType = "", lrPlus = "", lrMinus = "") {
  const existing = item.likelihood_ratio_note
    || item.LR_note
    || item.lr_note
    || item.likelihoodRatioNote
    || item.evidence?.likelihood_ratio_note
    || item.evidence?.LR_note
    || item.evidence?.lr_note;
  if (existing) {
    return existing;
  }
  if (!evidenceLikelihoodRatioUnavailable(lrPlus) || !evidenceLikelihoodRatioUnavailable(lrMinus)) {
    return "Quantitative likelihood-ratio values are available in the curated metadata; interpret with the cited source, pretest probability, and patient context.";
  }
  const normalizedType = String(itemType || item.item_type || item.gap_type || item.role || "").toLowerCase();
  if (normalizedType === "safety_check" || normalizedType.includes("safety")) {
    return "Likelihood ratios are not applicable to routine bedside safety data; use this item to assess acuity, monitoring needs, and management safety rather than diagnostic probability.";
  }
  if (normalizedType === "history_question" || normalizedType.includes("history")) {
    return "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize the source, assess severity, and guide management.";
  }
  if (["diagnostic_test", "reference_threshold", "red_flag", "management_change"].includes(normalizedType)) {
    return "Likelihood ratios are not applicable to this structured workup support item; use the cited guideline or threshold to guide testing, escalation, or management.";
  }
  return "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat this bedside finding as supportive and interpret it with the cited guideline, diagnostic tests, and patient context.";
}

function evidenceMetadataWithLikelihoodRatioNote(evidence = {}, item = {}, itemType = "") {
  return {
    ...evidence,
    likelihood_ratio_note: likelihoodRatioNoteForEvidenceItem(item, itemType, evidence.LR_plus, evidence.LR_minus)
  };
}

export function validateEvidenceSourceRows(rows = [], options = {}) {
  const missingHeaders = sourceRegistryHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, header));
  const issues = [];
  const ids = new Set();
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const maxAccessDate = options.maxAccessDate || "";
  const validSourceTypes = new Set([
    "technique",
    "diagnostic_performance",
    "evidence_synthesis",
    "management_guideline",
    "diagnostic_guideline",
    "diagnostic_overview",
    "diagnostic_safety",
    "clinical_review",
    "clinical_reference",
    "imaging_guideline",
    "patient_guideline"
  ]);

  if (missingHeaders.length) {
    issues.push({ type: "missing-headers", message: `Missing source registry columns: ${missingHeaders.join(", ")}` });
  }

  rows.forEach((row, index) => {
    const label = row.source_id || `source registry row ${index + 1}`;
    for (const header of sourceRegistryHeaders) {
      if (!String(row[header] || "").trim()) {
        issues.push({ type: "missing-field", message: `${label} is missing ${header}.` });
      }
    }
    if (row.source_id) {
      if (!/^[A-Z0-9_]+$/.test(row.source_id)) {
        issues.push({ type: "bad-source-id", message: `${label} source_id must use uppercase letters, numbers, and underscores only.` });
      }
      if (ids.has(row.source_id)) {
        issues.push({ type: "duplicate-source-id", message: `Duplicate source_id: ${row.source_id}` });
      }
      ids.add(row.source_id);
    }
    if (row.source_type && !validSourceTypes.has(row.source_type)) {
      issues.push({ type: "bad-source-type", message: `${label} has invalid source_type ${row.source_type}.` });
    }
    if (row.url_or_doi && !/^https?:\/\//i.test(row.url_or_doi) && !/^10\.\d{4,9}\//.test(row.url_or_doi)) {
      issues.push({ type: "bad-url-or-doi", message: `${label} needs url_or_doi as an http(s) URL or DOI.` });
    }
    if (row.date_accessed && !isoDatePattern.test(row.date_accessed)) {
      issues.push({ type: "bad-date-accessed", message: `${label} needs date_accessed as YYYY-MM-DD.` });
    }
    if (row.date_accessed && isoDatePattern.test(row.date_accessed) && maxAccessDate && row.date_accessed > maxAccessDate) {
      issues.push({ type: "future-date-accessed", message: `${label} has date_accessed ${row.date_accessed} after audit date ${maxAccessDate}.` });
    }
    const sourceYear = String(row.source_id || "").match(/(?:^|_)(20\d{2})(?:_|$)/)?.[1];
    if (sourceYear && row.date_accessed && isoDatePattern.test(row.date_accessed)) {
      const accessYear = row.date_accessed.slice(0, 4);
      if (Number(sourceYear) > Number(accessYear)) {
        issues.push({ type: "source-year-after-access", message: `${label} source_id claims ${sourceYear} but date_accessed is ${row.date_accessed}.` });
      }
    }
    const provenanceText = [
      row.source_name,
      row.license_access_notes,
      row.preferred_citation
    ].join(" ");
    if (/\b(?:TODO|TBD|citation pending|source pending|replace with)\b/i.test(provenanceText)) {
      issues.push({ type: "placeholder-source", message: `${label} contains placeholder source metadata.` });
    }
  });

  return { ok: issues.length === 0, issues };
}

export function validateCatalogGapRows(rows = [], options = {}) {
  const missingHeaders = catalogGapHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, header));
  const issues = [];
  const keys = new Set();
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validGapTypes = new Set(["exam_maneuver", "safety_check", "history_question", "question", "red_flag", "diagnostic_test", "reference_threshold"]);
  const validStatuses = new Set(["staged_gap", "needs_review", "rejected"]);
  const knownSourceIds = options.knownSourceIds ? new Set(options.knownSourceIds) : null;
  if (missingHeaders.length) {
    issues.push({ type: "missing-headers", message: `Missing catalog gap columns: ${missingHeaders.join(", ")}` });
  }

  rows.forEach((row, index) => {
    const rowLabel = row.gap_exam_id || `catalog gap row ${index + 1}`;
    const key = `${row.case_id || ""}::${row.gap_exam_id || ""}`;
    for (const header of catalogGapHeaders) {
      if (!String(row[header] || "").trim()) {
        issues.push({ type: "missing-field", message: `${rowLabel} is missing ${header}.` });
      }
    }
    if (keys.has(key)) {
      issues.push({ type: "duplicate-gap", message: `${rowLabel} duplicates case_id + gap_exam_id.` });
    }
    keys.add(key);
    if (row.gap_exam_id && !/^GAP-[A-Za-z0-9-]+$/.test(row.gap_exam_id)) {
      issues.push({ type: "bad-gap-id", message: `${rowLabel} must use a GAP-* staged gap id.` });
    }
    if (row.gap_type && !validGapTypes.has(row.gap_type)) {
      issues.push({ type: "bad-gap-type", message: `${rowLabel} has invalid gap_type ${row.gap_type}.` });
    }
    if (row.review_status && !validStatuses.has(row.review_status)) {
      issues.push({ type: "bad-gap-status", message: `${rowLabel} has invalid review_status ${row.review_status}.` });
    }
    if (row.review_status === "rejected" && !/reject|do not|not recommend/i.test(row.planned_resolution || "")) {
      issues.push({ type: "bad-rejected-plan", message: `${rowLabel} rejected gaps need an explicit non-promotion plan.` });
    }
    if (row.last_reviewed && !isoDatePattern.test(row.last_reviewed)) {
      issues.push({ type: "bad-review-date", message: `${rowLabel} needs last_reviewed as YYYY-MM-DD.` });
    }
    if (knownSourceIds) {
      splitEvidenceList(row.source_ids).forEach((sourceId) => {
        if (!knownSourceIds.has(sourceId)) {
          issues.push({ type: "unknown-source", message: `${rowLabel} references unknown source_id ${sourceId}.` });
        }
      });
    }
    const phiText = [
      row.case_id,
      row.gap_label,
      row.rationale,
      row.activation_condition,
      row.planned_resolution
    ].join(" ");
    if (/\b(?:MRN|DOB|SSN|Room\s+\d+|John Smith)\b/i.test(phiText) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(phiText)) {
      issues.push({ type: "phi-like-gap-content", message: `${rowLabel} contains PHI-like content.` });
    }
  });

  return { ok: issues.length === 0, issues };
}

export function validateAcceptedCatalogAdditionRows(rows = [], options = {}) {
  const missingHeaders = acceptedCatalogAdditionHeaders.filter((header) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, header));
  const issues = [];
  const ids = new Set();
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const knownSourceIds = options.knownSourceIds ? new Set(options.knownSourceIds) : null;

  if (missingHeaders.length) {
    issues.push({ type: "missing-headers", message: `Missing accepted catalog addition columns: ${missingHeaders.join(", ")}` });
  }

  rows.forEach((row, index) => {
    const label = row.exam_id || `accepted catalog addition row ${index + 1}`;
    if (!row.exam_id) {
      issues.push({ type: "missing-id", message: `${label} is missing exam_id.` });
    } else if (ids.has(row.exam_id)) {
      issues.push({ type: "duplicate-id", message: `Duplicate accepted catalog addition exam_id: ${row.exam_id}` });
    }
    ids.add(row.exam_id);
    ["exam_label", "maneuver", "diagnostic_target", "result_changes_management", "evidence_source_primary", "evidence_tier", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "retrieval_tags", "last_reviewed", "review_owner"].forEach((field) => {
      if (!String(row[field] || "").trim()) {
        issues.push({ type: "missing-field", message: `${label} is missing ${field}.` });
      }
    });
    if (row.exam_id && /^GAP-/i.test(row.exam_id)) {
      issues.push({ type: "bad-id", message: `${label} must use an accepted EXAM-* style ID rather than a staged GAP-* ID.` });
    }
    if (row.last_reviewed && !isoDatePattern.test(row.last_reviewed)) {
      issues.push({ type: "bad-review-date", message: `${label} needs last_reviewed as YYYY-MM-DD.` });
    }
    if (row.evidence_tier && !["a", "b", "c", "d"].includes(String(row.evidence_tier).toLowerCase())) {
      issues.push({ type: "bad-tier", message: `${label} has invalid evidence_tier.` });
    }
    if (row.difficulty && !["easy", "moderate", "hard"].includes(String(row.difficulty).toLowerCase())) {
      issues.push({ type: "bad-difficulty", message: `${label} has invalid difficulty.` });
    }
    if (!validEvidenceLikelihoodRatioValue(row.LR_plus)) {
      issues.push({ type: "bad-lr-plus", message: `${label} has invalid LR_plus.` });
    }
    if (!validEvidenceLikelihoodRatioValue(row.LR_minus)) {
      issues.push({ type: "bad-lr-minus", message: `${label} has invalid LR_minus.` });
    }
    const time = numericValue(row.time_burden_minutes);
    if (time === null || time < 0 || time > 20) {
      issues.push({ type: "bad-time", message: `${label} has invalid time_burden_minutes.` });
    }
    if (knownSourceIds) {
      [row.evidence_source_primary, ...splitEvidenceList(row.source_citation)].filter(Boolean).forEach((sourceId) => {
        if (!knownSourceIds.has(sourceId)) {
          issues.push({ type: "unknown-source", message: `${label} references unknown source_id ${sourceId}.` });
        }
      });
    }
    const phiText = acceptedCatalogAdditionHeaders.map((field) => row[field]).join(" ");
    if (/\b(?:MRN|DOB|SSN|Room\s+\d+|John Smith)\b/i.test(phiText) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(phiText)) {
      issues.push({ type: "phi-like-accepted-catalog-content", message: `${label} contains PHI-like content.` });
    }
  });

  return { ok: issues.length === 0, issues };
}

const evidenceCatalogSemanticProfiles = [
  {
    id: "abdominal_metadata_leakage",
    match: /\b(?:abdomen|abdominal|bowel|murphy|rebound|psoas|obturator|liver|spleen)\b/,
    forbid: /\b(?:murmur|s3|s4|heart sound|focal consolidation|bronchodilator|patellofemoral|musculoskeletal|immobilization)\b/,
    message: "abdominal maneuvers should not carry cardiac, pulmonary, or musculoskeletal diagnostic targets or management implications"
  },
  {
    id: "cardiac_metadata_leakage",
    match: /\b(?:heart sounds|pmi|apical|aortic area|pulmonic area|tricuspid area|mitral area|cardiac)\b/,
    forbid: /\b(?:bowel|serial abdominal|patellofemoral|bronchodilator|antibiotic)\b/,
    message: "cardiac maneuvers should not carry abdominal, pulmonary-treatment, or musculoskeletal metadata"
  },
  {
    id: "pulmonary_metadata_leakage",
    match: /\b(?:lung sounds|lung percussion|fremitus|work of breathing|respiratory pattern|kussmaul)\b/,
    forbid: /\b(?:bowel|murmur|s3|s4|patellofemoral|immobilization)\b/,
    message: "pulmonary maneuvers should not carry abdominal, cardiac-auscultation, or musculoskeletal metadata"
  },
  {
    id: "neuro_metadata_leakage",
    match: /\b(?:reflex|babinski|pronator|pupil|visual|extraocular|facial|sensation|vibration|romberg|gait|coordination|finger to nose|heel to shin)\b/,
    forbid: /\b(?:patellofemoral|serial abdominal|bronchodilator|murmur|s3|s4)\b/,
    message: "neurologic maneuvers should not carry knee-pain, abdominal, pulmonary-treatment, or cardiac-auscultation metadata"
  },
  {
    id: "heent_metadata_leakage",
    match: /\b(?:mouth|oropharynx|nasal|nares|sclera|conjunctiva|ear|otoscope|thyroid)\b/,
    forbid: /\b(?:serial abdominal|bowel|patellofemoral|limb ischemia|bronchodilator)\b/,
    message: "HEENT maneuvers should not carry abdominal, knee-pain, vascular, or pulmonary-treatment metadata"
  },
  {
    id: "msk_metadata_leakage",
    match: /\b(?:patellar grind|ballottement|straight leg|tinel|phalen|finkelstein|range of motion|joint|shoulder|elbow|wrist|hand|hip|knee|ankle|mtp|spine posture|bone tenderness)\b/,
    forbid: /\b(?:murmur|s3|s4|focal consolidation|bronchodilator|bowel activity|serial abdominal|limb ischemia)\b/,
    message: "musculoskeletal maneuvers should not carry cardiac, pulmonary, abdominal, or vascular metadata"
  }
];

function evidenceCatalogIdentityText(candidate = {}) {
  const base = candidate.base || {};
  return normalizeEvidenceText([
    candidate.exam_id,
    candidate.examLabel,
    candidate.exam_label,
    candidate.source_item,
    candidate.maneuver,
    base.exam_system,
    base.section,
    base.region_or_subsection,
    base.maneuver_or_finding,
    base.suggested_checklist_label
  ].filter(Boolean).join(" "));
}

function evidenceCatalogMetadataText(candidate = {}) {
  return normalizeEvidenceText([
    candidate.diagnostic_target,
    candidate.result_changes_management,
    candidate.management_link
  ].filter(Boolean).join(" "));
}

export function validateEvidenceCatalogSemanticConsistency(catalogRows = []) {
  const issues = [];
  catalogRows.forEach((candidate, index) => {
    const identityText = evidenceCatalogIdentityText(candidate);
    const metadataText = evidenceCatalogMetadataText(candidate);
    if (!identityText || !metadataText) {
      return;
    }
    evidenceCatalogSemanticProfiles.forEach((profile) => {
      if (profile.match.test(identityText) && profile.forbid.test(metadataText)) {
        const label = candidate.exam_id || candidate.examLabel || candidate.exam_label || `catalog row ${index + 1}`;
        issues.push({
          type: "semantic-metadata-leakage",
          profile: profile.id,
          message: `${label} has ${profile.message}.`,
          exam_id: candidate.exam_id || "",
          label: candidate.examLabel || candidate.exam_label || "",
          diagnostic_target: candidate.diagnostic_target || "",
          result_changes_management: candidate.result_changes_management || ""
        });
      }
    });
  });
  return { ok: issues.length === 0, issues };
}

function acceptedCatalogAdditionCandidate(row = {}, sourceRowsById = new Map()) {
  const tags = unique([
    ...splitEvidenceList(row.retrieval_tags),
    ...splitEvidenceList(row.when_to_use_structured),
    ...splitEvidenceList(row.condition_or_syndrome)
  ]);
  const sourceIds = unique([row.evidence_source_primary, ...splitEvidenceList(row.source_citation)]);
  const base = {
    exam_system: row.exam_system || "",
    section: row.section || "",
    maneuver_or_finding: row.maneuver || row.exam_label || row.exam_id,
    suggested_checklist_label: row.exam_label || row.maneuver || row.exam_id,
    suggested_options: row.exam_options || "",
    include_when: row.when_to_use_structured || "",
    exam_id: row.exam_id
  };
  return {
    ...row,
    base,
    base_row_number: "",
    base_row_fingerprint: "",
    source_item: row.source_item || row.exam_id,
    source: sourceRowsById.get(row.evidence_source_primary) || null,
    sources: sourceIds.map((sourceId) => sourceRowsById.get(sourceId)).filter(Boolean),
    tags,
    examLabel: row.exam_label || row.maneuver || row.exam_id,
    examOptions: row.exam_options || "",
    maneuver: row.maneuver || row.exam_label || "",
    system: row.exam_system || "",
    section: row.section || "",
    rowFingerprintActual: "",
    acceptedCatalogAddition: true,
    traceability: {
      authorized_by: "accepted_catalog_addition",
      source_ids: sourceIds,
      review_owner: row.review_owner || "",
      last_reviewed: row.last_reviewed || ""
    }
  };
}

export function joinEvidenceCatalog(baseRows = [], overlayRows = [], sourceRows = [], acceptedCatalogAdditionRows = []) {
  const baseByRowNumber = new Map();
  baseRows.forEach((row, index) => {
    baseByRowNumber.set(String(index + 1), { ...row, base_row_number: String(index + 1) });
  });

  const sourcesById = new Map(sourceRows.map((source) => [source.source_id, source]));
  const overlayCandidates = overlayRows.map((overlay) => {
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
  const acceptedCandidates = acceptedCatalogAdditionRows.map((row) => acceptedCatalogAdditionCandidate(row, sourcesById));
  return [...overlayCandidates, ...acceptedCandidates];
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
    candidate.exam_id,
    candidate.examLabel,
    candidate.label,
    candidate.maneuver,
    candidate.domain,
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
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:cough|dyspnea|hypoxia|pneumonia|oxygen|shortness of breath|work of breathing|respiratory distress|tachypnea)\b/),
        diagnosticTarget: "Pulmonary precipitant or complication: pneumonia, wheeze, edema, or impaired ventilation during DKA/HHS.",
        management: "New focal lung findings can change infection workup, oxygen strategy, imaging, and escalation."
      }
    ],
    requiredGaps: [],
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
    context: /\b(?:pulmonary embolism|suspected pe|pleuritic chest pain|pleuritic pain|dvt|venous thromboembolism|unilateral leg swelling|one calf|calf swelling|calf more swollen|post-?op.*(?:dyspnea|hypoxia|pleuritic)|surgery.*(?:dyspnea|hypoxia|pleuritic))\b/,
    requiredItems: [
      {
        exam_id: "REQ-pe-cardiopulmonary-symptoms-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "PE cardiopulmonary symptom question",
        options: "No / Sudden dyspnea / Pleuritic chest pain / Hemoptysis / Syncope or presyncope / Escalating oxygen need / Cannot speak full sentences / Other ___",
        domain: "Focused VTE History",
        reason: "A suspected PE workup needs cardiopulmonary symptom severity separated from VTE risk factors and treatment-safety history.",
        diagnosticTarget: "PE probability and severity: sudden dyspnea, pleuritic pain, hemoptysis, syncope, oxygen escalation, and inability to speak full sentences.",
        management: "Positive symptoms change PE probability framing, oxygen/support strategy, ECG/troponin/BNP/imaging urgency, ED/monitoring escalation, and empiric anticoagulation discussion.",
        bedsideQuestion: "Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope or presyncope, escalating oxygen need, or inability to speak full sentences?",
        bedsideQuestionOptions: "No / Sudden dyspnea / Pleuritic pain / Hemoptysis / Syncope or presyncope / Escalating oxygen need / Cannot speak full sentences / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["pulmonary_embolism", "vte", "clinical_probability", "dyspnea", "pleuritic_chest_pain", "history_question"],
        satisfiedBy: /\b(?:pe cardiopulmonary symptom question|sudden dyspnea|pleuritic chest pain|hemoptysis|syncope|oxygen need|full sentences)\b/
      },
      {
        exam_id: "REQ-pe-dvt-leg-symptoms-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "DVT leg symptom question",
        options: "No / Unilateral leg swelling / Unilateral calf pain / New leg redness or warmth / Recent leg immobilization or cast / Other ___",
        domain: "Focused VTE History",
        reason: "Suspected PE workups need DVT symptoms asked separately because they trigger leg comparison, compression ultrasound, and anticoagulation documentation.",
        diagnosticTarget: "DVT probability context: unilateral leg swelling, calf pain, redness/warmth, or immobilization/cast context.",
        management: "Positive DVT symptoms change lower-extremity exam priority, compression ultrasound threshold, PE probability framing, anticoagulation discussion, and imaging strategy when chest imaging is delayed or contraindicated.",
        bedsideQuestion: "Any unilateral leg swelling, calf pain, new leg redness or warmth, or recent leg immobilization/cast?",
        bedsideQuestionOptions: "No / Unilateral leg swelling / Unilateral calf pain / Redness-warmth / Immobilization-cast / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["dvt", "vte", "lower_extremity", "unilateral_leg_swelling", "history_question"],
        satisfiedBy: /\b(?:dvt leg symptom question|unilateral leg swelling|unilateral calf pain|leg redness|leg warmth|immobilization|cast)\b/
      },
      {
        exam_id: "REQ-pe-vte-provoking-factors-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "VTE provoking-factor question",
        options: "No / Prior VTE / Recent surgery / Immobility or hospitalization / Long travel / Estrogen therapy / Pregnancy or postpartum / Active cancer / Other ___",
        domain: "Focused VTE History",
        reason: "VTE provoking factors should be separated from current symptoms so probability framing is auditable and not hidden in one multi-domain prompt.",
        diagnosticTarget: "VTE risk context: prior clot, recent surgery, immobility/hospitalization, travel, estrogen exposure, pregnancy/postpartum state, or active cancer.",
        management: "Positive provoking factors change Wells/Geneva/PERC applicability, D-dimer versus imaging strategy, recurrence-risk documentation, anticoagulation planning, and follow-up framing.",
        bedsideQuestion: "Any prior VTE, recent surgery, immobility or hospitalization, long travel, estrogen therapy, pregnancy or postpartum state, or active cancer?",
        bedsideQuestionOptions: "No / Prior VTE / Recent surgery / Immobility-hospitalization / Long travel / Estrogen therapy / Pregnancy-postpartum / Active cancer / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["vte", "dvt", "clinical_probability", "provoking_factor", "pregnancy", "cancer", "history_question"],
        satisfiedBy: /\b(?:vte provoking-factor question|prior vte|recent surgery|immobility|hospitalization|long travel|estrogen|pregnancy|postpartum|active cancer)\b/
      },
      {
        exam_id: "REQ-pe-anticoagulation-safety-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Anticoagulation bleeding-safety question",
        options: "No bleeding concern / Active bleeding / Recent major surgery or trauma / Prior intracranial hemorrhage or stroke concern / Anticoagulant use / Severe uncontrolled hypertension / Pending procedure / Pregnancy or postpartum / Other ___",
        domain: "Focused VTE History",
        reason: "Treatment-safety history must be separate from PE probability history because it affects anticoagulation and thrombolysis decisions even when PE probability is high.",
        diagnosticTarget: "Anticoagulation and thrombolysis safety: active bleeding, recent major surgery/trauma, intracranial risk, anticoagulant use, severe hypertension, procedure timing, or pregnancy/postpartum context.",
        management: "Positive bleeding-safety features change empiric anticoagulation risk-benefit discussion, reversal/holding decisions, thrombolysis contraindication review, imaging urgency, and specialist/monitored-care threshold.",
        bedsideQuestion: "Any active bleeding, recent major surgery or trauma, prior intracranial hemorrhage or stroke concern, anticoagulant use, severe uncontrolled hypertension, pending procedure, or pregnancy/postpartum state?",
        bedsideQuestionOptions: "No bleeding concern / Active bleeding / Recent major surgery-trauma / Prior intracranial hemorrhage-stroke concern / Anticoagulant use / Severe uncontrolled hypertension / Pending procedure / Pregnancy-postpartum / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["pulmonary_embolism", "anticoagulation_safety", "bleeding_risk", "thrombolysis", "history_question"],
        satisfiedBy: /\b(?:anticoagulation bleeding-safety question|active bleeding|recent major surgery|major trauma|intracranial hemorrhage|anticoagulant|severe uncontrolled hypertension|pending procedure)\b/
      },
      {
        exam_id: "REQ-pe-work-of-breathing",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Work of breathing observation",
        options: "Comfortable / Tachypneic / Labored / Accessory muscle use / Unable to speak full sentences / Cyanotic / Unable",
        domain: "Respiratory Severity",
        reason: "Suspected PE workups need a direct respiratory-severity check before lower-yield pulmonary maneuvers, because distress and hypoxemia change acuity even before imaging confirms PE.",
        diagnosticTarget: "Respiratory severity in suspected PE: tachypnea, labored breathing, accessory muscle use, inability to speak, cyanosis, fatigue, or impending respiratory failure.",
        management: "Increased work of breathing changes oxygen/support strategy, monitoring level, ED/ICU escalation, imaging urgency, and high-risk PE pathway consideration.",
        bedsideQuestion: "Any sudden dyspnea, pleuritic pain, hemoptysis, syncope, escalating oxygen need, or inability to speak full sentences?",
        bedsideQuestionOptions: "No / Sudden dyspnea / Pleuritic pain / Hemoptysis / Syncope / Escalating oxygen / Cannot speak full sentences / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ATS_CAP_2025; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ATS adult CAP guideline update 2025; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["pulmonary_embolism", "dyspnea", "hypoxia", "respiratory_status", "diagnostic_safety"],
        satisfiedBy: /\bwork of breathing observation\b/
      },
      {
        exam_id: "REQ-pe-unilateral-leg-swelling-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Unilateral leg swelling inspection",
        options: "Symmetric / Right more swollen / Left more swollen / Calf tenderness / Erythema-warmth / Unable",
        domain: "DVT/Vascular",
        reason: "Suspected PE workups should compare legs for DVT-compatible findings instead of relying only on history, because a proximal DVT clue changes VTE probability and imaging/treatment framing.",
        diagnosticTarget: "DVT-compatible bedside clue: asymmetric calf or leg swelling, focal calf tenderness, erythema/warmth, or an alternate limb process.",
        management: "DVT-compatible findings can increase VTE probability, raise compression ultrasound priority, support anticoagulation documentation, and guide strategy when PE chest imaging is delayed or contraindicated.",
        bedsideQuestion: "Any one-sided calf or leg swelling, calf pain/tenderness, redness/warmth, recent immobilization, surgery, travel, estrogen exposure, pregnancy/postpartum state, cancer, or prior VTE?",
        bedsideQuestionOptions: "No / One-sided swelling / Calf pain-tenderness / Redness-warmth / Surgery-immobility-travel / Estrogen-pregnancy-postpartum / Cancer / Prior VTE / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["pulmonary_embolism", "dvt", "vte", "lower_extremity", "vascular_exam", "clinical_probability"],
        satisfiedBy: /\b(?:unilateral leg swelling inspection|compare lower-leg swelling|calf tenderness inspection|dvt leg exam)\b/
      },
      {
        exam_id: "REQ-pe-probability-d-dimer-imaging",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "PE probability, D-dimer, and imaging pathway",
        options: "Document clinical probability / PERC when very-low-risk ED context applies / D-dimer for low or intermediate probability when appropriate / Age-adjusted D-dimer when eligible / CTPA or V/Q imaging for high probability, positive D-dimer, or contraindication-specific pathway / Do not use D-dimer alone to rule out high-probability or unstable PE",
        domain: "Tests / Diagnostic Pathway",
        reason: "Suspected PE testing should be anchored to clinical probability so low-risk patients avoid unnecessary imaging while high-risk or unstable patients are escalated promptly.",
        diagnosticTarget: "Diagnostic pathway selection: low/intermediate probability with D-dimer rule-out potential versus high probability or unstable PE requiring imaging/escalation.",
        management: "A negative appropriate D-dimer can avoid imaging in low/intermediate probability; high probability, positive D-dimer, hypoxemia, syncope, or instability changes CTPA/V/Q urgency, anticoagulation planning, and disposition.",
        bedsideQuestion: "After history, exam, vitals, and risk factors, is this low/intermediate probability where D-dimer can safely help, or high/unstable probability needing imaging or escalation?",
        bedsideQuestionOptions: "Low probability / Intermediate probability / High probability / Unstable / D-dimer appropriate / D-dimer not appropriate / CTPA feasible / V/Q preferred / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; CDC VTE testing overview",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["pulmonary_embolism", "clinical_probability", "d_dimer", "ctpa", "vq_scan", "diagnostic_test"],
        satisfiedBy: /\b(?:pe probability, d-dimer, and imaging pathway|d-dimer|ctpa|v\/q|clinical probability|wells|geneva|perc)\b/
      },
      {
        exam_id: "REQ-pe-dvt-rv-strain-workup",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "DVT and right-heart strain evaluation",
        options: "Compression ultrasound for unilateral leg symptoms or when chest imaging is delayed/contraindicated / ECG for alternate diagnoses or strain pattern / Troponin-BNP and echocardiography when intermediate-high-risk PE, syncope, hypotension, or RV strain concern exists / Trend oxygenation and hemodynamics",
        domain: "Tests / Risk Stratification",
        reason: "The bedside workup should connect leg findings and cardiopulmonary severity to DVT confirmation and PE risk stratification.",
        diagnosticTarget: "VTE confirmation and PE severity: proximal DVT evidence, right ventricular strain, myocardial injury, hemodynamic compromise, and oxygenation trend.",
        management: "A proximal DVT can support treatment decisions when PE imaging is not feasible; RV strain, positive biomarkers, hypotension, or worsening oxygen need changes monitoring, PE response-team/thrombolysis discussion, and disposition.",
        bedsideQuestion: "Is there unilateral leg swelling or pain, syncope, hypotension, rising oxygen need, known RV strain, abnormal ECG, or elevated troponin/BNP concern?",
        bedsideQuestionOptions: "No / Leg swelling-pain / Syncope / Hypotension / Higher oxygen need / ECG strain concern / Troponin-BNP concern / Echo/RV concern / Other ___",
        source: "ESC_PE_2019; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ASH VTE diagnosis guideline; CDC VTE testing overview",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["pulmonary_embolism", "dvt", "compression_ultrasound", "rv_strain", "troponin", "bnp", "diagnostic_test"],
        satisfiedBy: /\b(?:dvt and right-heart strain evaluation|compression ultrasound|right-heart strain|rv strain|troponin|bnp|echo)\b/
      },
      {
        exam_id: "REQ-pe-hemodynamic-escalation-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "High-risk PE escalation cues",
        options: "Hypotension or shock / Syncope / Severe hypoxemia or escalating oxygen / Altered mental status / Persistent tachycardia or tachypnea / JVP or RV strain concern / Cardiac arrest",
        domain: "Red Flags / Escalation",
        reason: "Suspected PE must screen for high-risk physiology because unstable PE changes the pathway from routine confirmation to urgent escalation.",
        diagnosticTarget: "High-risk PE physiology: shock, hypotension, syncope, severe hypoxemia, altered mentation, persistent tachycardia/tachypnea, RV strain, or arrest.",
        management: "These findings change disposition, monitoring level, urgent imaging/bedside echo strategy, anticoagulation urgency, PE response-team activation, and thrombolysis/embolectomy discussion.",
        bedsideQuestion: "Any fainting, severe breathlessness, confusion, chest pain with shock symptoms, escalating oxygen need, or known right-heart strain?",
        bedsideQuestionOptions: "No / Syncope / Severe dyspnea / Confusion / Shock symptoms / Escalating oxygen / RV strain concern / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "vitals and bedside reassessment",
        patient_cooperation_required: "low",
        matchedTags: ["pulmonary_embolism", "shock", "hypoxia", "rv_strain", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\b(?:high-risk pe escalation cues|shock|hypotension|syncope|severe hypoxemia|rv strain|cardiac arrest)\b/
      },
      {
        exam_id: "REQ-pe-anticoagulation-safety-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Anticoagulation and thrombolysis safety cues",
        options: "Active bleeding / Recent major surgery or trauma / Hemorrhagic stroke or intracranial lesion / Severe uncontrolled hypertension / Pregnancy or postpartum context / Renal failure or contrast limitation / High fall or urgent-procedure risk",
        domain: "Red Flags / Treatment Safety",
        reason: "A PE workup must document treatment-safety constraints because the diagnostic and management pathway often hinges on anticoagulation and sometimes thrombolysis.",
        diagnosticTarget: "Treatment-risk context: bleeding risk, recent surgery/trauma, intracranial risk, severe hypertension, pregnancy/postpartum, renal/contrast limitation, fall risk, or pending procedure.",
        management: "Safety cues change anticoagulation choice/dose/timing, imaging selection, consultation, thrombolysis eligibility, reversal planning, monitoring level, and shared risk documentation.",
        bedsideQuestion: "Any active bleeding, recent surgery or trauma, prior hemorrhagic stroke or brain lesion, severe uncontrolled blood pressure, pregnancy/postpartum state, kidney failure/contrast issue, high fall risk, or urgent procedure planned?",
        bedsideQuestionOptions: "No / Active bleeding / Recent surgery-trauma / Intracranial bleeding-risk history / Severe hypertension / Pregnancy-postpartum / Kidney or contrast issue / High fall risk / Urgent procedure / Other ___",
        source: "ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX",
        source_citation: "2019 ESC/ERS pulmonary embolism guideline; ACEP suspected VTE clinical policy; ASH VTE diagnosis guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "chart review and history",
        patient_cooperation_required: "moderate",
        matchedTags: ["pulmonary_embolism", "anticoagulation_safety", "thrombolysis", "bleeding_risk", "red_flag"],
        satisfiedBy: /\b(?:anticoagulation and thrombolysis safety cues|active bleeding|recent major surgery|hemorrhagic stroke|intracranial|contrast limitation)\b/
      }
    ],
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 92,
        domain: "Vitals",
        reason: "Checks hemodynamic and respiratory severity in suspected PE.",
        diagnosticTarget: "PE severity screen: tachycardia, tachypnea, hypotension, hypoxemia clue, or shock physiology.",
        management: "Abnormal vitals can change urgency of PE risk stratification, oxygen/support needs, monitoring level, and escalation for unstable PE.",
        bedsideQuestion: "Any sudden shortness of breath, pleuritic pain, fainting, coughing blood, or one-sided leg swelling?",
        bedsideQuestionOptions: "No / Sudden dyspnea / Pleuritic pain / Fainting / Hemoptysis / One-sided leg swelling / Other ___"
      },
      {
        pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds)\b/,
        strength: 78,
        domain: "Pulmonary",
        reason: "Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.",
        diagnosticTarget: "Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.",
        management: "Work of breathing or focal lung findings can change oxygen strategy, imaging review, treatment for alternatives such as pneumonia/pneumothorax, and escalation."
      },
      {
        pattern: /\b(?:heart sounds|jvp|radial pulses)\b/,
        strength: 72,
        domain: "Cardiac/Perfusion",
        reason: "Looks for right-heart strain, shock, or perfusion changes that would alter escalation and disposition.",
        diagnosticTarget: "Cardiac/perfusion severity: elevated JVP, abnormal heart sounds, hypotension/perfusion deficit, or shock physiology.",
        management: "Strain or shock findings can change monitoring level, anticoagulation/thrombolysis discussion urgency, imaging interpretation, and disposition."
      },
    ],
    conditional: [
      {
        pattern: /\b(?:dorsalis pedis|posterior tibial|femoral pulses)\b/,
        strength: 50,
        domain: "Limb Perfusion Add-on",
        reason: "Adds distal pulse assessment only when unilateral leg symptoms, marked swelling, vascular disease, or limb perfusion concern accompanies suspected PE/DVT.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:unilateral leg|leg swelling|leg pain|dvt|limb ischemia|vascular|absent pulse|marked swelling|cyanosis)\b/),
        diagnosticTarget: "Limb perfusion in suspected DVT/vascular mimic: pulse asymmetry, poor perfusion, or vascular compromise.",
        management: "Abnormal pulses change limb-risk documentation, alternate vascular diagnosis consideration, imaging urgency, and escalation."
      },
      {
        pattern: /\b(?:posterior lung percussion|anterior lung percussion|lung percussion|fremitus)\b/,
        strength: 46,
        domain: "Pulmonary Alternative Add-on",
        reason: "Adds percussion/fremitus only when pneumonia, pneumothorax, pleural effusion, asymmetric breath sounds, or pleuritic pulmonary alternative is specifically plausible.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:pneumonia|pneumothorax|effusion|asymmetric|diminished|decreased breath|focal crackles|cough|fever)\b/),
        diagnosticTarget: "Pulmonary alternative characterization: consolidation, effusion, pneumothorax, or asymmetric aeration clue.",
        management: "Abnormal percussion or fremitus can change chest imaging review, respiratory support, antimicrobial or pneumothorax pathway, and escalation."
      }
    ],
    suppress: [
      { pattern: /\b(?:abdominal inspection|abdominal palpation|abdominal percussion|bowel sounds|murphy|rebound|psoas|obturator|liver|spleen|cva tenderness)\b/, unless: /\b(?:abdominal|flank|vomit|diarrhea|jaundice|gi bleed|urinary|renal)\b/, reason: "Abdominal maneuvers are not PE-focused without abdominal, renal, or GI symptoms." },
      { pattern: /\blower extremity edema\b/, unless: /\b(?:heart failure|chf|volume overload|renal|aki|bilateral edema|anasarca|orthopnea|pnd|pulmonary edema|diuresis)\b/, reason: "In suspected PE, side-to-side DVT leg inspection is the recommended vascular exam; routine edema grading is reserved for separate volume-overload, HF, renal, or bilateral-edema context." },
      { pattern: /\b(?:pmi|apical impulse)\b/, unless: /\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|pulmonary hypertension|rv strain|right heart strain)\b/, reason: "PMI is not a core PE maneuver unless the chart adds cardiomyopathy, heart failure, or strain/volume context." },
      { pattern: /\b(?:pupils|visual acuity|visual fields|extraocular|pronator drift|babinski|gait|romberg|rapid alternating|finger to nose|heel to shin|carotids|vibration sense)\b/, unless: /\b(?:stroke|seizure|focal|facial droop|aphasia|headache|vision|ataxia|weakness|syncope)\b/, reason: "Focused neuro maneuvers need a neurologic or syncope trigger in suspected PE." }
    ]
  },
  {
    id: "dyspnea_hf",
    name: "Dyspnea, hypoxia, or heart failure/volume overload",
    context: /\b(?:dyspnea|shortness of breath|sob|hypoxia|oxygen|orthopnea|pnd|heart failure|chf|volume overload|pulmonary edema|diuresis)\b/,
    requiredItems: [
      {
        exam_id: "REQ-dyspnea-work-of-breathing",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Work of breathing observation",
        options: "Comfortable / Tachypneic / Labored / Accessory muscle use / Unable to speak full sentences / Fatigued / Unable",
        domain: "Respiratory Severity",
        reason: "Dyspnea workups must start with respiratory effort because distress changes oxygen, ventilatory support, monitoring, and disposition before the etiology is fully proven.",
        diagnosticTarget: "Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.",
        management: "Increased work of breathing changes oxygen/ventilatory support, need for urgent reassessment, ED/ICU escalation, and timing of CXR/ECG/labs.",
        bedsideQuestion: "Is breathing worse at rest, with exertion, lying flat, during sleep, or with chest pain, cough, wheeze, fever, leg swelling, or higher oxygen need?",
        bedsideQuestionOptions: "Rest dyspnea / Exertional / Orthopnea / PND / Chest pain / Cough-wheeze / Fever / Leg swelling / Higher oxygen need / Other ___",
        source: "AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX",
        source_citation: "2022 AHA/ACC/HFSA heart failure guideline; 2021 ESC heart failure guideline; 2025 ATS adult CAP guideline update; 2019 IDSA CAP clinical pathway; Stanford Medicine 25 pulmonary exam resources; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["dyspnea", "hypoxia", "respiratory_status", "pulmonary_exam", "heart_failure", "red_flag"],
        satisfiedBy: /\bwork of breathing observation\b/
      },
      {
        exam_id: "REQ-dyspnea-posterior-lung-sounds",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Auscultate posterior lung fields",
        options: "Clear / Crackles / Wheezes / Rhonchi / Diminished / Asymmetric / Unable",
        domain: "Pulmonary Source And Congestion",
        reason: "Posterior lung auscultation is the highest-yield bedside pulmonary screen for congestion, wheeze, focal pneumonia, effusion, or asymmetric ventilation in dyspnea.",
        diagnosticTarget: "Pulmonary dyspnea clue: crackles/congestion, wheeze/bronchospasm, focal rhonchi or crackles, diminished sounds, effusion, or asymmetric aeration.",
        management: "Abnormal lung sounds can change diuresis, bronchodilator, antimicrobial, chest imaging, oxygen/support, and escalation decisions.",
        bedsideQuestion: "Any cough, sputum, fever, wheezing, orthopnea, PND, leg swelling, weight gain, missed diuretic, aspiration risk, or new oxygen need?",
        bedsideQuestionOptions: "No / Cough / Sputum / Fever / Wheeze / Orthopnea-PND / Leg swelling-weight gain / Missed diuretic / Aspiration risk / Oxygen need / Other ___",
        source: "AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25",
        source_citation: "2022 AHA/ACC/HFSA heart failure guideline; 2021 ESC heart failure guideline; 2025 ATS adult CAP guideline update; 2019 IDSA CAP clinical pathway; Stanford Medicine 25 pulmonary exam resources",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1.5",
        equipment_needed: "stethoscope",
        patient_cooperation_required: "moderate",
        matchedTags: ["dyspnea", "hypoxia", "pulmonary_exam", "heart_failure", "volume_overload", "pneumonia"],
        satisfiedBy: /\bposterior lung sounds\b/
      },
      {
        exam_id: "REQ-dyspnea-hf-initial-tests",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Dyspnea/HF initial tests and reference thresholds",
        options: "ECG / Chest X-ray / BNP or NT-proBNP / BMP with sodium-potassium-bicarbonate-BUN-creatinine / CBC / Troponin when ischemia, acute decompensation, or myocardial injury concern / TTE for new or changed suspected HF",
        domain: "Tests / Diagnostic Pathway",
        reason: "Dyspnea with possible HF or volume overload needs objective cardiopulmonary testing because exam findings alone cannot reliably distinguish HF, pneumonia, COPD/asthma, PE, ischemia, renal failure, or anemia.",
        diagnosticTarget: "HF/dyspnea etiology and safety screen: congestion/cardiomegaly or alternative disease on CXR, rhythm/ischemia on ECG, natriuretic peptide support or exclusion of HF, renal/electrolyte safety, anemia/infection, and myocardial injury.",
        management: "BNP <100 pg/mL or NT-proBNP <300 pg/mL in acute dyspnea makes acute HF less likely; non-acute rule-out thresholds are lower (BNP <35 pg/mL, NT-proBNP <125 pg/mL). Elevated values support HF in context but are affected by age, atrial fibrillation, kidney disease, and obesity; abnormal ECG/CXR/labs change diuresis, oxygen, antibiotics, ischemia evaluation, echo, and disposition.",
        bedsideQuestion: "Is HF, pneumonia, COPD/asthma, PE, ischemia, renal failure, anemia, or medication nonadherence the leading dyspnea frame after history and exam?",
        bedsideQuestionOptions: "HF/volume overload / Pneumonia / COPD-asthma / PE / Ischemia / Renal failure / Anemia / Medication-diet issue / Unclear / Other ___",
        source: "AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX",
        source_citation: "2022 AHA/ACC/HFSA heart failure guideline; 2021 ESC heart failure guideline; 2025 ATS adult CAP guideline update; 2019 IDSA CAP clinical pathway; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["dyspnea", "heart_failure", "bnp", "nt_probnp", "cxr", "ecg", "troponin", "renal_function", "electrolytes", "diagnostic_test"],
        satisfiedBy: /\bdyspnea\/hf initial tests and reference thresholds\b/
      },
      {
        exam_id: "REQ-dyspnea-diuresis-safety-tests",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Diuresis and respiratory-support safety review",
        options: "Trend oxygen saturation/support / Review weight and net intake-output when inpatient / Creatinine-BUN and sodium-potassium-magnesium before or during diuresis / VBG-ABG when ventilatory failure, severe hypoxemia, or acid-base concern / Medication and renal-risk review",
        domain: "Tests / Treatment Safety",
        reason: "When dyspnea is treated as HF/volume overload, bedside exam should be paired with renal, electrolyte, oxygenation, and trajectory data so diuresis and respiratory support are safe.",
        diagnosticTarget: "Treatment-safety data: oxygen trajectory, renal function, potassium/magnesium/sodium abnormalities, acid-base or ventilatory failure, and response to diuresis or respiratory support.",
        management: "Worsening oxygen need, rising creatinine, severe electrolyte abnormality, hypercapnia/acidosis, poor urine output, or poor diuretic response changes monitoring, diuretic dose/route, potassium/magnesium replacement, ventilatory support, and escalation.",
        bedsideQuestion: "Has oxygen need, weight, urine output, creatinine, potassium, sodium, magnesium, or response to diuresis changed since presentation?",
        bedsideQuestionOptions: "Stable / Higher oxygen need / Weight gain / Low urine output / Creatinine rising / K-Mg-Na abnormal / Poor diuretic response / Hypercapnia-acidosis concern / Other ___",
        source: "AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX",
        source_citation: "2022 AHA/ACC/HFSA heart failure guideline; 2021 ESC heart failure guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab review",
        patient_cooperation_required: "low",
        matchedTags: ["dyspnea", "heart_failure", "volume_overload", "oxygen", "renal_function", "electrolytes", "diagnostic_test"],
        satisfiedBy: /\b(?:diuresis and respiratory-support safety review|creatinine|potassium|magnesium|intake-output|oxygen saturation|vbg|abg)\b/
      },
      {
        exam_id: "REQ-dyspnea-respiratory-failure-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Respiratory failure escalation cues",
        options: "Severe hypoxemia / Escalating oxygen need / Inability to speak full sentences / Accessory muscle use or fatigue / Cyanosis / Altered mental status / Hypercapnia or acidosis concern",
        domain: "Red Flags / Respiratory Escalation",
        reason: "Dyspnea workups must explicitly screen for respiratory failure rather than presenting lung findings as routine descriptive exam data.",
        diagnosticTarget: "Impending or established respiratory failure: severe hypoxemia, escalating oxygen, fatigue, cyanosis, altered mentation, hypercapnia, or acidemia.",
        management: "These cues change urgency of respiratory therapy, noninvasive/invasive ventilatory support, ED/ICU escalation, ABG/VBG review, and close reassessment.",
        bedsideQuestion: "Any worsening oxygen requirement, inability to speak full sentences, exhaustion, confusion, cyanosis, or known hypercapnia/acidosis?",
        bedsideQuestionOptions: "No / More oxygen / Cannot speak full sentences / Exhausted / Confused / Cyanosis / Hypercapnia-acidosis / Other ___",
        source: "ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX",
        source_citation: "2021 ESC heart failure guideline; 2025 ATS adult CAP guideline update; 2019 IDSA CAP clinical pathway; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "vitals and bedside reassessment",
        patient_cooperation_required: "low",
        matchedTags: ["dyspnea", "hypoxia", "respiratory_failure", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\b(?:respiratory failure escalation cues|severe hypoxemia|escalating oxygen|hypercapnia|acidosis|cyanosis)\b/
      },
      {
        exam_id: "REQ-dyspnea-shock-acute-hf-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Shock or acute heart-failure escalation cues",
        options: "Hypotension or shock / Cool or mottled extremities / Oliguria / New chest pain or ischemic ECG concern / New dangerous arrhythmia / Syncope / Flash pulmonary edema or hypertensive emergency / New severe murmur",
        domain: "Red Flags / Cardiac Escalation",
        reason: "Possible acute HF can become a perfusion or hypertensive pulmonary-edema emergency; those findings should be explicit and management-linked.",
        diagnosticTarget: "High-risk cardiac dyspnea clue: shock, poor perfusion, oliguria, ischemia, dangerous arrhythmia, syncope, flash pulmonary edema, hypertensive emergency, or acute valvular complication.",
        management: "These cues change monitoring location, IV therapy urgency, ECG/troponin/echo priority, vasodilator/diuretic/inotrope discussion, cardiology/critical-care involvement, and ED/ICU disposition.",
        bedsideQuestion: "Any fainting, chest pain, palpitations, very high or low blood pressure, cool/mottled extremities, low urine output, sudden severe dyspnea, or new murmur concern?",
        bedsideQuestionOptions: "No / Syncope / Chest pain / Palpitations / Hypotension-shock / Severe hypertension / Cool-mottled / Oliguria / Sudden severe dyspnea / New murmur / Other ___",
        source: "AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX",
        source_citation: "2022 AHA/ACC/HFSA heart failure guideline; 2021 ESC heart failure guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "vitals, ECG/lab review as available",
        patient_cooperation_required: "low",
        matchedTags: ["dyspnea", "heart_failure", "shock", "perfusion", "arrhythmia", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\b(?:shock or acute heart-failure escalation cues|hypotension|oliguria|flash pulmonary edema|hypertensive emergency|dangerous arrhythmia)\b/
      }
    ],
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 88,
        domain: "Vitals",
        reason: "Determines cardiopulmonary severity and whether oxygen, diuresis, bronchodilator, or escalation decisions are urgent.",
        diagnosticTarget: "Dyspnea severity: tachypnea, tachycardia, hypotension/hypertension, hypoxemia clue, or shock physiology.",
        management: "Abnormal vitals can change oxygen/support strategy, diuresis urgency, bronchodilator/antibiotic consideration, monitoring level, and escalation.",
        bedsideQuestion: "Is breathing worse lying flat, are you waking up short of breath, and has leg swelling or oxygen need changed?",
        bedsideQuestionOptions: "No / Orthopnea / Waking short of breath / Leg swelling / Higher oxygen need / Other ___"
      },
      {
        pattern: /\b(?:posterior thorax inspection|anterior thorax inspection)\b/,
        strength: 82,
        domain: "Work of Breathing",
        reason: "Assesses respiratory effort and distress before deciding whether bedside support or escalation is needed.",
        diagnosticTarget: "Work of breathing: accessory muscle use, retractions, asymmetry, fatigue, or distress.",
        management: "Increased work of breathing can change oxygen/ventilatory support, monitoring location, and urgency of reassessment."
      },
      {
        pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds)\b/,
        strength: 84,
        domain: "Pulmonary",
        reason: "Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.",
        diagnosticTarget: "Lung findings: crackles, wheeze, rhonchi, diminished sounds, asymmetry, or focal ventilation abnormality.",
        management: "New or changed lung findings can change diuresis, bronchodilator, antibiotic, imaging, oxygen/support, or escalation decisions."
      },
      {
        pattern: /\b(?:lung percussion|fremitus)\b/,
        strength: 54,
        domain: "Pulmonary Add-on",
        reason: "Adds effusion or consolidation assessment when the lung exam or fever/cough context suggests it.",
        when: /\b(?:effusion|consolidation|pneumonia|diminished|asymmetric|pleural|fever|cough)\b/,
        diagnosticTarget: "Consolidation/effusion clue: dullness, asymmetric fremitus, or focal decreased ventilation.",
        management: "Effusion or consolidation clues can change imaging review, antibiotic consideration, drainage/consult questions, and oxygen strategy."
      },
      {
        pattern: /\b(?:jvp|lower extremity edema|heart sounds|radial pulses)\b/,
        strength: 82,
        domain: "Volume/Cardiac",
        reason: "Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.",
        when: /\b(?:orthopnea|pnd|heart failure|chf|volume overload|pulmonary edema|diuresis|edema|leg swelling|aki|renal|shock|hypotension|chest pain|palpitations|syncope|presyncope)\b/,
        diagnosticTarget: "Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.",
        management: "Congestion or poor perfusion findings can change diuretic/fluid strategy, telemetry/ECG/echo urgency, respiratory support, and disposition."
      }
    ],
    conditional: [
      {
        pattern: /\bpmi\b/,
        strength: 46,
        domain: "Cardiac Add-on",
        reason: "Adds apical impulse only when dyspnea overlaps with heart failure, cardiomyopathy, pulmonary hypertension, or volume-overload context.",
        when: /\b(?:heart failure|chf|cardiomyopathy|volume overload|orthopnea|pnd|pulmonary hypertension|cardiomegaly)\b/,
        diagnosticTarget: "Precordial structural clue: displaced/diffuse apical impulse or visible heave in cardiomyopathy/volume-overload context.",
        management: "A displaced or diffuse impulse can support cardiac structural framing and echo/cardiology review when consistent with the rest of the case."
      }
    ],
    suppress: [
      { pattern: /\b(?:murphy|psoas|obturator|rebound|cva tenderness|spleen palpation)\b/, unless: /\b(?:abdominal|flank|urinary|jaundice|gi bleed)\b/, reason: "Not dyspnea-focused without abdominal, renal, or GU symptoms." },
      { pattern: /\b(?:aortic area|pulmonic area|tricuspid area|mitral area)\b/, unless: /\b(?:murmur|valvular|aortic stenosis|mitral|tricuspid|pulmonic|endocarditis)\b/, reason: "Individual valve-area cards are redundant when the general heart-sounds exam is already selected unless murmur/valvular disease is a specific concern." },
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
      { pattern: /\b(?:lung percussion)\b/, strength: 58, domain: "Pulmonary Add-on", reason: "Adds percussion when pneumothorax, effusion, or asymmetric ventilation is specifically suspected.", when: (context) => patientOrUnstructuredContextHas(context, /\b(?:pneumothorax|decreased breath sounds|diminished|asymmetric|effusion)\b/) },
      { pattern: /\b(?:lower extremity edema)\b/, strength: 56, domain: "Vascular", reason: "Adds DVT context when PE, DVT, swelling, or leg symptoms are present.", when: /\b(?:pe|pulmonary embolism|dvt|leg swelling|unilateral leg|one calf|calf swelling|calf more swollen|edema)\b/ }
    ],
    conditional: [
      { pattern: /\b(?:dorsalis pedis|posterior tibial|femoral pulses)\b/, strength: 44, domain: "Limb Perfusion Add-on", reason: "Adds distal pulses when chest pain/PE concern is paired with unilateral leg symptoms, vascular disease, marked swelling, or limb perfusion concern.", when: (context) => patientOrUnstructuredContextHas(context, /\b(?:unilateral leg|leg pain|marked swelling|vascular|limb ischemia|cold limb|absent pulse)\b/) },
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
    id: "sleep_apnea_airway",
    name: "Sleep apnea or snoring airway-risk evaluation",
    context: /\b(?:sleep apnea|obstructive sleep apnea|osa|snoring|daytime sleepiness|witnessed apnea|neck circumference)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate)\b/,
        strength: 70,
        domain: "Cardiometabolic Safety",
        reason: "Checks cardiometabolic risk and hypertension burden that commonly changes sleep-apnea risk framing and follow-up urgency.",
        diagnosticTarget: "Sleep-apnea comorbidity clue: elevated BP, tachycardia, or cardiometabolic risk signal.",
        management: "Hypertension or cardiometabolic risk can change sleep-study urgency, treatment framing, and cardiovascular risk follow-up.",
        bedsideQuestion: "Any loud snoring, witnessed apneas, waking choking, morning headache, daytime sleepiness, resistant hypertension, or drowsy driving?",
        bedsideQuestionOptions: "No / Loud snoring / Witnessed apneas / Choking awakenings / Morning headache / Daytime sleepiness / Drowsy driving / Other ___"
      },
      {
        pattern: /\b(?:oropharynx|mouth exam)\b/,
        strength: 76,
        domain: "Upper Airway",
        reason: "Looks for visible oropharyngeal crowding or oral airway findings that support sleep-apnea risk assessment.",
        diagnosticTarget: "Upper-airway risk clue: crowded oropharynx, large tonsils, macroglossia, or other visible obstruction pattern.",
        management: "Crowded airway findings support sleep-study referral, airway-risk documentation, and PAP/oral-appliance discussion in context."
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-sleep-apnea-neck-circumference",
        label: "Neck circumference",
        options: "Normal / Enlarged / Not measured / Unable",
        domain: "Sleep Apnea Risk",
        reason: "Neck circumference is a bedside risk marker for obstructive sleep apnea but is not yet an atomic base-catalog maneuver.",
        diagnosticTarget: "Sleep-apnea risk phenotype: enlarged neck circumference or upper-airway crowding.",
        management: "An enlarged neck circumference supports higher pretest probability, sleep-study referral, and peri-procedural airway-risk documentation.",
        bedsideQuestion: "Any loud snoring, witnessed apneas, daytime sleepiness, morning headache, resistant hypertension, or drowsy driving?",
        bedsideQuestionOptions: "No / Snoring / Witnessed apnea / Sleepiness / Morning headache / Resistant hypertension / Drowsy driving / Other ___",
        source: "AASM_OSA_DIAGNOSTIC_2017; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "tape measure",
        patient_cooperation_required: "low",
        matchedTags: ["sleep_apnea", "snoring", "upper_airway"],
        satisfiedBy: /\bneck circumference\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:abdominal palpation|bowel sounds|cva tenderness|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:abdominal|flank|urinary|gi bleed|jaundice)\b/, reason: "Sleep-apnea evaluation does not need abdominal/GU maneuvers unless those symptoms are separately present." },
      { pattern: /\b(?:pronator drift|babinski|finger to nose|heel to shin|vibration sense|gait)\b/, unless: /\b(?:stroke|focal|weakness|ataxia|gait|neuropathy)\b/, reason: "Sleep-apnea evaluation does not need broad neurologic testing without neurologic symptoms." }
    ]
  },
  {
    id: "neuromuscular_cramps",
    name: "Muscle cramps or neuromuscular irritability",
    context: /\b(?:muscle cramps|leg cramps|cramping muscles|tetany|carpopedal spasm|neuromuscular irritability)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 62,
        domain: "Basic Severity",
        reason: "Checks bedside instability, dehydration physiology, or systemic illness signals before narrowing cramps to benign causes.",
        diagnosticTarget: "Cramps severity screen: instability, tachycardia, tachypnea, or systemic stress.",
        management: "Abnormal vitals can change urgency of electrolyte/glucose review, hydration strategy, medication review, and escalation."
      },
      {
        pattern: /\b(?:mouth exam|radial pulses)\b/,
        strength: 66,
        domain: "Hydration/Perfusion",
        reason: "Assesses dehydration or perfusion clues that can contribute to cramps and change oral/IV fluid strategy.",
        diagnosticTarget: "Hydration/perfusion clue: dry mucosa, poor intake, or weak pulse.",
        management: "Dehydration or poor perfusion findings can change fluid strategy, orthostasis assessment, medication review, and electrolyte reassessment.",
        bedsideQuestion: "Any vomiting, diarrhea, poor intake, heavy sweating, new diuretics, weakness, numbness, dark urine, or severe pain?",
        bedsideQuestionOptions: "No / Vomiting or diarrhea / Poor intake / Heavy sweating / Diuretic / Weakness / Numbness / Dark urine / Other ___"
      },
      {
        pattern: /\b(?:ankle dorsiflexion strength|ankle plantarflexion strength|patellar reflex)\b/,
        strength: 70,
        domain: "Focused Neuro-Motor",
        reason: "Checks for weakness or reflex abnormality when cramps may reflect electrolyte, radicular, neuromuscular, or myelopathic disease.",
        diagnosticTarget: "Neuromuscular clue: focal weakness, reflex change, upper motor neuron pattern, or radicular deficit.",
        management: "Weakness or abnormal reflexes can change urgency of electrolyte correction, CK/renal review, medication/toxin review, spine localization, and neurology escalation.",
        bedsideQuestion: "Are the cramps associated with true weakness, numbness, back pain, dark urine, or trouble walking?",
        bedsideQuestionOptions: "No / Weakness / Numbness / Back pain / Dark urine / Trouble walking / Other ___"
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-cramps-focused-muscle-tenderness",
        label: "Focused muscle tenderness",
        options: "Absent / Focal tenderness / Diffuse tenderness / Swelling / Unable",
        domain: "Muscle Exam",
        reason: "Separates the symptomatic muscle exam from broad neurologic testing and documents tenderness, swelling, or myositis/rhabdomyolysis clues.",
        diagnosticTarget: "Muscle injury or inflammatory clue: focal tenderness, swelling, diffuse pain, or severe tenderness.",
        management: "Marked tenderness or swelling can change CK/renal/electrolyte urgency, medication review, and concern for myositis, compartment syndrome, or rhabdomyolysis.",
        bedsideQuestion: "Which muscle cramps most, and is there swelling, severe tenderness, dark urine, weakness, fever, or a new medication?",
        bedsideQuestionOptions: "Location ___ / Swelling / Severe tenderness / Dark urine / Weakness / Fever / New medication / Other ___",
        source: "MCGEE_EBPD; AHRQ_CALIBRATE_DX",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["muscle_cramps", "myalgia", "neuromuscular"],
        satisfiedBy: /\bfocused muscle tenderness\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:finger to nose|heel to shin|rapid alternating|visual acuity|visual fields|extraocular|ophthalmoscopic)\b/, unless: /\b(?:ataxia|vision|diplopia|stroke|focal|seizure)\b/, reason: "Muscle cramps do not need cerebellar or eye testing unless neurologic localization is present." },
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|cva tenderness)\b/, unless: /\b(?:abdominal|flank|urinary|vomit|diarrhea)\b/, reason: "Muscle cramps do not need abdominal/GU maneuvers unless GI, flank, or urinary symptoms are present." }
    ]
  },
  {
    id: "spine_cord_compression",
    name: "Spine, myelopathy, or cord-compression red flags",
    context: /\b(?:cord compression|myelopathy|saddle anesthesia|urinary retention|back pain with weakness|back pain.*weakness|weakness.*back pain)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 72,
        domain: "Basic Safety",
        reason: "Keeps instability, fever physiology, severe pain, or trauma severity visible while the neurologic localization exam is being planned.",
        diagnosticTarget: "Cord-compression safety context: unstable vitals, fever physiology, tachycardia/tachypnea, or acuity that changes escalation.",
        management: "Abnormal bedside safety data can change ED/spine escalation, fall precautions, imaging urgency, sepsis review, and monitoring level.",
        bedsideQuestion: "Any fever, cancer history, trauma, IV drug use, new leg weakness, urinary retention/incontinence, or saddle numbness?",
        bedsideQuestionOptions: "No / Fever / Cancer history / Trauma / IV drug use / New weakness / Retention or incontinence / Saddle numbness / Other ___"
      },
      {
        pattern: /\b(?:hip flexion strength|knee extension strength|ankle dorsiflexion strength|ankle plantarflexion strength)\b/,
        strength: 88,
        domain: "Lower Extremity Motor",
        reason: "Localizes motor deficits when spinal cord, cauda equina, radiculopathy, or compressive neurologic disease is possible.",
        diagnosticTarget: "Cord/cauda equina motor clue: leg weakness, asymmetric strength, foot drop, or motor level pattern.",
        management: "New or progressive weakness can change urgency of MRI/spine consultation, steroids when appropriate, fall precautions, and bladder/retention assessment.",
        bedsideQuestion: "Any new leg weakness, numbness, saddle numbness, urinary retention/incontinence, severe back pain, fever, cancer history, or trauma?",
        bedsideQuestionOptions: "No / Leg weakness / Numbness / Saddle numbness / Urinary retention or incontinence / Fever / Cancer or trauma / Other ___"
      },
      {
        pattern: /\b(?:extremity light touch|extremity pinprick|vibration sense|proprioception)\b/,
        strength: 82,
        domain: "Sensation",
        reason: "Checks sensory level, dorsal-column pattern, and radicular or cauda-equina symptoms.",
        diagnosticTarget: "Cord/cauda equina sensory clue: sensory level, asymmetric numbness, saddle-area symptoms, or dorsal-column impairment.",
        management: "A sensory level or saddle-distribution complaint changes urgency of MRI/spine evaluation and bladder/retention workup."
      },
      {
        pattern: /\b(?:babinski|patellar reflex|achilles reflex)\b/,
        strength: 80,
        domain: "Reflexes/UMN",
        reason: "Screens upper motor neuron, myelopathy, or radiculopathy signs when cord compression is possible.",
        diagnosticTarget: "Upper motor neuron or radicular clue: upgoing plantar response, hyperreflexia, clonus, or reflex asymmetry.",
        management: "UMN signs or reflex asymmetry can change spinal imaging urgency, neurology/neurosurgery escalation, and fall precautions."
      }
    ],
    conditional: [
      {
        pattern: /\b(?:gait|heel walking|toe walking|tandem gait|romberg)\b/,
        strength: 68,
        domain: "Functional Safety",
        reason: "Assesses functional impairment and fall risk when it is safe for the patient to stand.",
        when: /\b(?:gait|walk|fall|ambulatory|safe to stand|cord compression|myelopathy)\b/,
        diagnosticTarget: "Functional cord/radicular clue: impaired gait, foot drop during heel walking, or inability to safely ambulate.",
        management: "Unsafe gait changes fall precautions, therapy planning, imaging urgency, and disposition."
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-cord-saddle-sensation",
        label: "Saddle sensation",
        options: "Normal by history / Reduced / Not assessed / Unable",
        domain: "Cauda Equina Safety",
        reason: "Saddle sensory symptoms are high-risk for cauda equina/cord compression but are not yet represented as an atomic base-catalog maneuver.",
        diagnosticTarget: "Cauda equina warning: reduced perineal/saddle sensation by history or exam when appropriate.",
        management: "Possible saddle sensory loss changes urgency of bladder assessment, emergent MRI, and spine/neurosurgery escalation.",
        bedsideQuestion: "Any numbness around the groin/saddle area, new urinary retention, incontinence, bowel dysfunction, or bilateral leg symptoms?",
        bedsideQuestionOptions: "No / Saddle numbness / Urinary retention / Incontinence / Bowel dysfunction / Bilateral leg symptoms / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "moderate",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["cord_compression", "cauda_equina", "saddle_sensation"],
        satisfiedBy: /\bsaddle sensation\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:jvp|heart sounds|lower extremity edema|abdominal palpation|bowel sounds|mouth exam|oropharynx)\b/, unless: /\b(?:sepsis|fever|shock|dyspnea|abdominal|vomit|flank|urinary infection)\b/, reason: "Cord-compression workup should not substitute cardiopulmonary, abdominal, or HEENT exams for neurologic localization unless those symptoms are separately present." }
    ]
  },
  {
    id: "neuro_red_flags",
    name: "Neurologic red flags or focal symptoms",
    context: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|bell palsy|aphasia|weakness|numbness|tingling|seizure|headache|vision|diplopia|ataxia|vertigo|gait|cord compression|myelopathy|meningitis|meningeal|confusion|altered mental status)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 72, domain: "Neuro Safety Vitals", reason: "Screens instability, fever physiology, and severity in acute neurologic presentations.", when: /\b(?:headache|thunderclap|meningitis|sah|seizure|postictal|vertigo|ataxia|stroke|tia|confusion|altered)\b/ },
      { pattern: /\b(?:facial symmetry|eye closure)\b/, strength: 88, domain: "Cranial Nerve VII", reason: "Directly checks facial weakness and cranial nerve VII pattern.", when: /\b(?:stroke|tia|facial droop|facial weakness|face weakness|face droop|bell palsy|mouth droop|crooked smile|focal|seizure|postictal)\b/ },
      { pattern: /\b(?:pronator drift)\b/, strength: 80, domain: "Stroke Screen", reason: "Adds a high-yield upper motor neuron screen when facial weakness, postictal focal deficit, or stroke concern is present.", when: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|aphasia|arm weakness|hemiparesis|seizure|postictal|thunderclap|meningitis|sah)\b/ },
      { pattern: /\b(?:pupils)\b/, strength: 74, domain: "Cranial Nerves", reason: "Screens pupillary asymmetry or reactivity in headache, altered mental status, focal neurologic symptoms, seizure, or neuro-ophthalmic concern.", when: /\b(?:vision|diplopia|headache|meningitis|sah|stroke|tia|focal|aphasia|facial droop|facial weakness|face weakness|face droop|vertigo|ataxia|seizure|postictal|confusion|altered)\b/ },
      { pattern: /\b(?:visual fields|extraocular)\b/, strength: 66, domain: "Cranial Nerves", reason: "Localizes visual pathway, ocular motor, vestibular, brainstem, or postictal findings when vision, diplopia, focal deficits, vertigo, or ataxia are present.", when: /\b(?:vision|visual|blurry|diplopia|eye pain|stroke|tia|focal|aphasia|facial droop|facial weakness|face weakness|face droop|vertigo|ataxia|seizure|postictal)\b/ },
      { pattern: /\b(?:visual acuity)\b/, strength: 62, domain: "Visual Function Add-on", reason: "Adds bedside visual function when the complaint includes visual loss, diplopia, eye pain, or neuro-ophthalmic concern.", when: /\b(?:vision|visual|blurry|diplopia|eye pain|pituitary|optic)\b/ }
    ],
    conditional: [
      { pattern: /\b(?:facial light touch|facial sharp sensation|masseter)\b/, strength: 60, domain: "Facial Sensory/Motor Add-on", reason: "Adds trigeminal or jaw localization when facial sensory symptoms, jaw weakness, or broader cranial nerve concern exists.", when: /\b(?:facial numbness|face numbness|jaw|trigeminal|cranial nerve|stroke|tia|focal)\b/ },
      { pattern: /\b(?:tongue protrusion|palate elevation|scm strength|trapezius strength)\b/, strength: 58, domain: "Bulbar/Cranial Nerve Add-on", reason: "Adds bulbar or lower cranial nerve localization when dysarthria, dysphagia, hoarseness, choking, or lower cranial nerve symptoms exist.", when: /\b(?:dysarthria|dysphagia|bulbar|tongue|palate|hoarse|voice|weak cough|choking|aspiration)\b/ },
      { pattern: /\b(?:deltoid|hip flexion|knee extension|ankle dorsiflexion|ankle plantarflexion|finger abduction)\b/, strength: 56, domain: "Limb Motor Add-on", reason: "Adds limb strength localization when limb, generalized, cord, or radicular weakness is described.", when: /\b(?:arm weakness|leg weakness|limb weakness|hemiparesis|hemiplegia|paresis|generalized weakness|cord compression|myelopathy|radiculopathy|foot drop)\b/ },
      { pattern: /\b(?:extremity light touch|extremity pinprick|vibration sense|proprioception)\b/, strength: 54, domain: "Sensation Add-on", reason: "Assesses sensory localization, neuropathy, or dorsal column involvement when sensory symptoms are present.", when: /\b(?:numbness|tingling|paresthesia|neuropathy|sensory|dorsal column|b12|myelopathy|gait|ataxia|seizure|postictal)\b/ },
      { pattern: /\b(?:babinski|patellar reflex|achilles reflex|brachioradialis reflex)\b/, strength: 50, domain: "Reflex Add-on", reason: "Screens for upper motor neuron, radiculopathy, or myelopathy signs when localization matters.", when: /\b(?:limb weakness|arm weakness|leg weakness|hemiparesis|radiculopathy|cord compression|myelopathy|upper motor neuron|back pain|seizure|postictal|thunderclap|meningitis|sah)\b/ },
      { pattern: /\b(?:finger to nose|heel to shin|rapid alternating)\b/, strength: 64, domain: "Coordination", reason: "Adds bed-safe cerebellar/coordination localization for focal neurologic or stroke presentations.", when: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|aphasia|ataxia|vertigo|seizure|postictal|thunderclap|meningitis|sah)\b/ },
      { pattern: /\b(?:gait|romberg|tandem|toe walking|heel walking)\b/, strength: 62, domain: "Gait/Balance Safety", reason: "Assesses gait, vestibular/cerebellar safety, and fall risk only when standing assessment is clinically relevant and safe.", when: /\b(?:ataxia|vertigo|gait abnormality|fall|walk|dizziness|cord|myelopathy|sensory ataxia)\b/ }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-neuro-neck-stiffness",
        label: "Neck stiffness",
        options: "Absent / Present / Unable to assess safely",
        domain: "Meningeal Irritation",
        when: /\b(?:meningitis|meningeal|fever.*headache|headache.*fever|neck pain.*fever|photophobia.*fever)\b/,
        reason: "Suspected meningitis needs an explicit meningeal-irritation screen rather than relying on generic cranial nerve or gait maneuvers.",
        diagnosticTarget: "Meningeal irritation clue: neck stiffness or pain with passive flexion in a compatible febrile headache/confusion syndrome.",
        management: "Neck stiffness with fever, headache, photophobia, altered mental status, petechiae, or toxicity can change urgency of ED escalation, empiric antimicrobials, isolation, blood cultures, neuroimaging decision-making, and lumbar puncture planning.",
        bedsideQuestion: "Any fever, severe headache, neck stiffness, photophobia, confusion, rash, immunosuppression, or recent CNS procedure?",
        bedsideQuestionOptions: "No / Fever / Severe headache / Neck stiffness / Photophobia / Confusion / Rash / Immunosuppression / Recent CNS procedure / Other ___",
        source: "AHRQ_CALIBRATE_DX; IDSA bacterial meningitis guideline; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["meningitis", "infection", "neck_stiffness"],
        satisfiedBy: /\b(?:neck stiffness|meningeal irritation|nuchal rigidity)\b/
      }
    ]
  },
  {
    id: "abdominal_gi",
    name: "Abdominal or GI presentation",
    context: /\b(?:abdominal pain|abd pain|stomach|belly|cramps|nausea|vomit|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|gi bleed|heartburn|dysphagia|early satiety|anorexia)\b/,
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
        unless: /\b(?:pruritus|itching|rash|urticaria|hives|dry skin)\b(?![\s\S]*\b(?:abdominal pain|abd pain|stomach pain|belly pain|ruq|right upper quadrant|rlq|right lower quadrant|vomit|diarrhea|constipation|distension|bloating|melena|hematochezia|gi bleed)\b)/,
        diagnosticTarget: "Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.",
        management: "Focal, progressive, peritoneal, obstructive, or distended findings can change imaging urgency, surgical consultation, fluid strategy, and serial abdominal exam needs.",
        bedsideQuestion: "Where is the pain worst, and is it associated with vomiting, diarrhea, constipation, urinary symptoms, fever, or bleeding?",
        bedsideQuestionOptions: "Diffuse / Focal location ___ / Vomiting / Diarrhea / Constipation / Urinary symptoms / Fever / Bleeding / Other ___"
      },
      { pattern: /\b(?:liver edge|liver span)\b/, strength: 60, domain: "Liver/Jaundice Add-on", reason: "Targets hepatobiliary enlargement or tenderness when jaundice, RUQ symptoms, or liver disease is present.", when: /\b(?:ruq|right upper quadrant|jaundice|biliary|cholecystitis|liver)\b/ },
      { pattern: /\b(?:murphy)\b/, strength: 58, domain: "RUQ/Biliary Add-on", reason: "Targets biliary disease when RUQ pain, right upper quadrant tenderness, gallbladder disease, or cholecystitis is present.", when: /\b(?:ruq|right upper quadrant|biliary|cholecystitis|gallbladder)\b/ },
      { pattern: /\b(?:rebound|psoas|obturator)\b/, strength: 62, domain: "Peritoneal/RLQ", reason: "Targets peritoneal signs or appendicitis when localized pain/guarding exists.", when: /\b(?:rlq|right lower quadrant|appendicitis|peritonitis|guarding|rebound)\b/ },
      { pattern: /\b(?:cva tenderness)\b/, strength: 58, domain: "Renal/GU", reason: "Adds renal/GU source check when flank, urinary, or renal symptoms coexist.", when: /\b(?:flank|urinary|dysuria|hematuria|pyelo|stone|renal)\b/ }
    ],
    conditional: [
      {
        pattern: /\b(?:mouth exam|jvp|radial pulses)\b/,
        strength: 56,
        domain: "Hydration Add-on",
        reason: "Adds mucous membrane assessment when vomiting, poor intake, dehydration, orthostasis, or hypovolemia modifies abdominal pain.",
        when: /\b(?:vomit|emesis|poor intake|dehydrat|hypovolem|orthostasis|lightheaded|dry|diarrhea|pancreatitis)\b/,
        diagnosticTarget: "Hydration clue: dry mucosa, poor intake/vomiting physiology, or dehydration contributing to abdominal symptoms.",
        management: "Dry mucosa or dehydration clues can change oral/IV fluid strategy, antiemetic urgency, orthostasis assessment, and reassessment frequency.",
        bedsideQuestion: "Have you been able to keep fluids down, and are you lightheaded or urinating less?",
        bedsideQuestionOptions: "Keeping fluids down / Vomiting / Lightheaded / Less urine / Dry mouth / Other ___"
      },
      {
        pattern: /\b(?:sclerae and conjunctivae)\b/,
        strength: 54,
        domain: "Jaundice/Anemia Add-on",
        reason: "Adds visible jaundice or pallor assessment when abdominal pain includes jaundice, dark urine, GI bleeding, or anemia concern.",
        when: /\b(?:jaundice|dark urine|pale stool|melena|black stool|hematochezia|gi bleed|anemia|pallor)\b/,
        diagnosticTarget: "Visible anemia or hepatobiliary clue: conjunctival pallor or scleral icterus.",
        management: "Pallor or jaundice can change urgency of CBC/LFT review, bleeding/hepatobiliary workup, imaging, and escalation."
      },
      {
        pattern: /\b(?:radial pulses)\b/,
        strength: 52,
        domain: "Perfusion Add-on",
        reason: "Adds quick perfusion assessment when abdominal pain includes dehydration, bleeding, sepsis, shock, syncope, or marked lightheadedness.",
        when: /\b(?:dehydrat|hypovolem|bleeding|melena|hematochezia|sepsis|shock|syncope|faint|lightheaded|poor perfusion)\b/,
        diagnosticTarget: "Perfusion clue: weak/asymmetric pulse or poor peripheral perfusion in an unstable abdominal presentation.",
        management: "Poor perfusion can change resuscitation urgency, monitoring level, and escalation."
      }
    ],
    requiredItems: [
      {
        exam_id: "REQ-abdominal-source-severity-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Abdominal pain localization and danger-feature question",
        options: "Diffuse cramps / Localized RUQ / Localized RLQ / Epigastric / LLQ / Flank or urinary / Vomiting / Diarrhea / Constipation-obstipation / GI bleeding / Fever / Pregnancy possible / Severe or worsening / Other ___",
        domain: "Focused Abdominal History",
        reason: "Abdominal pain cannot be clinically curated from the word 'cramps' alone; localization, associated symptoms, pregnancy possibility, and danger features determine the focused exam, tests, imaging, and urgency.",
        diagnosticTarget: "Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.",
        management: "The answer changes whether to prioritize peritoneal signs, Murphy sign, CVA tenderness, pregnancy testing, CBC/CMP/LFT/lipase/UA, CT, RUQ ultrasound, pelvic imaging, stool studies, surgical/ED escalation, or serial reassessment.",
        bedsideQuestion: "Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas?",
        bedsideQuestionOptions: "Diffuse cramps / RUQ / RLQ / Epigastric / LLQ / Flank-urinary / Fever / Persistent vomiting / Black-bloody stool / Jaundice / Pregnancy possible / Syncope / Obstipation / Severe-worsening / Other ___",
        source: "AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX",
        source_citation: "AAFP acute abdominal pain review 2023; ACR RLQ and RUQ pain appropriateness criteria; AHRQ Calibrate Dx",
        evidenceTier: "Guideline/clinical review",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["abdominal_pain", "acute_abdomen", "peritonitis", "biliary_disease", "appendicitis", "pregnancy", "gi_bleed", "history_question"],
        satisfiedBy: /\babdominal pain localization and danger-feature question\b/
      },
      {
        exam_id: "REQ-abdominal-initial-tests",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Abdominal pain initial tests and localization pathway",
        options: "CBC / CMP with electrolytes-BUN-creatinine / LFTs-bilirubin when RUQ-jaundice-hepatobiliary concern / Lipase when epigastric-pancreatitis concern / Urinalysis with culture when urinary or flank source possible / Pregnancy test for patients with pregnancy potential / Stool testing when severe inflammatory diarrhea, travel, outbreak, immunocompromise, or persistent high-risk diarrhea / Lactate when shock, sepsis, ischemia, or pain out of proportion is possible",
        domain: "Tests / Initial Evaluation",
        reason: "Abdominal pain needs tests selected by localization and danger features; a generic abdominal exam alone can miss pregnancy-related, hepatobiliary, pancreatic, urinary, bleeding, septic, obstructive, or ischemic disease.",
        diagnosticTarget: "Initial abdominal-pain diagnostic data: infection/anemia, renal/electrolyte status, hepatobiliary obstruction/injury, pancreatitis, urinary/stone/pyelonephritis, pregnancy/ectopic risk, inflammatory diarrhea, sepsis, or ischemia.",
        management: "Abnormal CBC, creatinine/electrolytes, bilirubin/LFTs, lipase, urinalysis, pregnancy test, stool testing, or lactate changes imaging choice, fluids, antibiotics, surgical/OB/GU consultation, ED disposition, and serial exam urgency.",
        bedsideQuestion: "Based on location and associated features, which source is most plausible: biliary/RUQ, appendicitis/RLQ, pancreatitis/epigastric, obstruction, GI bleed, urinary/flank, pregnancy/pelvic, infectious diarrhea, or unclear?",
        bedsideQuestionOptions: "Biliary/RUQ / Appendicitis/RLQ / Pancreatitis/epigastric / Obstruction / GI bleed / Urinary-flank / Pregnancy-pelvic / Infectious diarrhea / Unclear / Other ___",
        source: "AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX",
        source_citation: "AAFP acute abdominal pain review 2023; ACR RLQ and RUQ pain appropriateness criteria; ACOG ectopic pregnancy FAQ; AHRQ Calibrate Dx",
        evidenceTier: "Guideline/clinical review",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab order review",
        patient_cooperation_required: "low",
        matchedTags: ["abdominal_pain", "diagnostic_test", "cbc", "cmp", "lft", "lipase", "urinalysis", "pregnancy", "lactate"],
        satisfiedBy: /\babdominal pain initial tests and localization pathway\b/
      },
      {
        exam_id: "REQ-abdominal-imaging-pathway",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Abdominal imaging pathway by location and risk",
        options: "No imaging for clearly benign improving low-risk cramps with reliable follow-up / CT abdomen-pelvis with IV contrast for many concerning nonlocalized, RLQ, LLQ, obstruction, perforation, abscess, or ischemia concerns when appropriate / RUQ ultrasound for suspected biliary disease / Pelvic ultrasound when pregnancy/pelvic source possible / Renal stone imaging pathway when colic/flank hematuria pattern / Imaging choice adjusted for pregnancy, contrast risk, renal function, and local protocol",
        domain: "Tests / Imaging",
        reason: "Imaging should follow clinical localization and risk rather than a one-size-fits-all abdominal-pain checklist.",
        diagnosticTarget: "Imaging target: appendicitis, diverticulitis, cholecystitis/biliary obstruction, bowel obstruction/perforation, abscess, ischemia, renal colic, pelvic/ectopic disease, or low-risk non-imaging trajectory.",
        management: "Appropriate imaging can change surgical/IR/OB/GU consultation, antibiotics, NPO status, analgesia, disposition, and need for serial abdominal exams; contrast/pregnancy/renal constraints change modality.",
        bedsideQuestion: "Does localization or risk point to CT, RUQ ultrasound, pelvic ultrasound, renal-colic imaging, no immediate imaging with follow-up, or urgent ED/surgical evaluation?",
        bedsideQuestionOptions: "CT A/P / RUQ ultrasound / Pelvic ultrasound / Renal-colic pathway / No immediate imaging / Urgent ED-surgery / Other ___",
        source: "ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AAFP_ACUTE_ABD_PAIN_2023; AHRQ_CALIBRATE_DX",
        source_citation: "ACR RLQ and RUQ pain appropriateness criteria; AAFP acute abdominal pain review 2023; AHRQ Calibrate Dx",
        evidenceTier: "Guideline/clinical review",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["abdominal_pain", "diagnostic_test", "imaging", "ct_abdomen", "ultrasound", "appendicitis", "biliary_disease", "pregnancy"],
        satisfiedBy: /\babdominal imaging pathway by location and risk\b/
      },
      {
        exam_id: "REQ-abdominal-acute-abdomen-red-flags",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Acute abdomen and surgical escalation cues",
        options: "Rigid abdomen / Guarding or rebound / Severe or worsening focal pain / Pain out of proportion / Distension with obstipation / Persistent bilious or feculent vomiting / GI bleeding with instability / Syncope or hypotension / Fever or sepsis physiology / Immunocompromised or older high-risk patient",
        domain: "Red Flags / Acute Abdomen",
        reason: "A clinically safe abdominal-pain workup must explicitly separate benign cramps from acute abdomen, obstruction, bleeding, ischemia, and sepsis patterns.",
        diagnosticTarget: "High-risk abdominal process: peritonitis, obstruction, perforation, ischemia, significant GI bleed, sepsis, or high-risk host with subtle signs.",
        management: "These cues change ED/surgical escalation, imaging urgency, NPO/IV access/analgesia/antiemetic strategy, fluids, antibiotics, type-screen or transfusion planning, and frequency of serial abdominal exams.",
        bedsideQuestion: "Any rigid abdomen, guarding/rebound, severe worsening focal pain, pain out of proportion, distension with no stool/gas, persistent bilious vomiting, black/bloody stool, syncope, hypotension, fever, or immunocompromise?",
        bedsideQuestionOptions: "No / Rigid abdomen / Guarding-rebound / Severe focal pain / Pain out of proportion / Distension-obstipation / Bilious vomiting / GI bleeding / Syncope-hypotension / Fever-sepsis / Immunocompromised / Other ___",
        source: "AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX",
        source_citation: "AAFP acute abdominal pain review 2023; ACR RLQ and RUQ pain appropriateness criteria; AHRQ Calibrate Dx",
        evidenceTier: "Guideline/clinical review",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["abdominal_pain", "acute_abdomen", "peritonitis", "obstruction", "gi_bleed", "sepsis", "red_flag"],
        satisfiedBy: /\bacute abdomen and surgical escalation cues\b/
      },
      {
        exam_id: "REQ-abdominal-pregnancy-vascular-mimic-red-flags",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Pregnancy, vascular, and extra-abdominal danger cues",
        options: "Pregnancy possible with pain or bleeding / Sudden tearing pain or pulsatile mass concern / Atrial fibrillation or vascular disease with pain out of proportion / Testicular or scrotal pain / Chest pain or dyspnea mimic / New jaundice with fever / Severe flank pain with fever or solitary kidney / Neurologic or metabolic instability",
        domain: "Red Flags / Dangerous Mimics",
        reason: "Some dangerous abdominal-pain presentations are missed when the checklist stays inside the abdomen; pregnancy, vascular, GU, cardiopulmonary, hepatobiliary, and metabolic mimics need an explicit screen.",
        diagnosticTarget: "Dangerous mimic or adjacent source: ectopic pregnancy, AAA/dissection/mesenteric ischemia, torsion, ACS/PE/lower-lobe pneumonia, cholangitis, obstructed infected stone, or metabolic crisis.",
        management: "These cues change pregnancy testing and pelvic imaging, vascular/CT pathway, GU exam/ultrasound, ECG/chest evaluation, antibiotics/source control, specialty consultation, and ED escalation.",
        bedsideQuestion: "Any pregnancy possibility or vaginal bleeding, sudden tearing pain, vascular disease/AF with pain out of proportion, scrotal pain, chest pain/dyspnea, jaundice with fever, severe flank pain with fever, or metabolic instability?",
        bedsideQuestionOptions: "No / Pregnancy-vaginal bleeding / Sudden tearing pain / Vascular disease-AF / Pain out of proportion / Scrotal pain / Chest pain-dyspnea / Jaundice-fever / Flank pain-fever / Metabolic instability / Other ___",
        source: "AAFP_ACUTE_ABD_PAIN_2023; ACOG_ECTOPIC_FAQ; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX",
        source_citation: "AAFP acute abdominal pain review 2023; ACOG ectopic pregnancy FAQ; ACR RLQ/RUQ pain appropriateness criteria; AHRQ Calibrate Dx",
        evidenceTier: "Guideline/clinical review",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "history and focused exam",
        patient_cooperation_required: "moderate",
        matchedTags: ["abdominal_pain", "pregnancy", "ectopic", "vascular", "torsion", "cholangitis", "renal_colic", "red_flag"],
        satisfiedBy: /\bpregnancy, vascular, and extra-abdominal danger cues\b/
      },
      {
        exam_id: "EXAM-081-rebound-tenderness",
        label: "Rebound tenderness",
        options: "No rebound or involuntary guarding / Rebound tenderness present / Rigidity or generalized peritonitis concern / Unable to assess",
        domain: "Peritoneal Signs Add-on",
        role: "conditional",
        when: /\b(?:intent:\s*abdominal pain|abdominal pain|abd pain|stomach|belly|cramps|acute abdomen|peritonitis|guarding|localized abdominal|localized pain|focal abdominal|focal pain|ruq|rlq|appendicitis|cholecystitis)\b/,
        unless: /\b(?:scrotal pain|scrotal swelling|testicular pain|testicular torsion|acute scrotum)\b/,
        reason: "Makes peritoneal irritation explicit as a conditional abdominal-pain maneuver instead of hiding it until the user supplies perfect localization terms.",
        diagnosticTarget: "Peritoneal irritation or acute abdomen: pain worse on release, guarding pattern, or worsening localized tenderness.",
        management: "A positive peritoneal sign can change imaging urgency, surgical consultation, NPO/analgesia planning, antibiotics, disposition, and need for serial abdominal exams.",
        bedsideQuestion: "Is the pain becoming localized, worse with movement, associated with guarding, fever, vomiting, or rebound-type pain?",
        bedsideQuestionOptions: "No / Localized / Worse with movement / Guarding / Fever / Vomiting / Rebound-type pain / Other ___",
        source: "MCGEE_EBPD; SM25; AHRQ_CALIBRATE_DX",
        evidenceTier: "A",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["abdominal_pain", "peritonitis", "acute_abdomen"],
        satisfiedBy: /\brebound tenderness\b/
      },
      {
        exam_id: "EXAM-080-murphy-sign",
        label: "Murphy sign",
        options: "Negative Murphy sign / RUQ inspiratory arrest or positive Murphy sign / Peritoneal or unstable exam concern / Unable to assess",
        domain: "RUQ/Biliary Add-on",
        role: "conditional",
        when: /\b(?:intent:\s*abdominal pain|abdominal pain|abd pain|stomach|belly|cramps|ruq|right upper quadrant|epigastric|biliary|cholecystitis|gallbladder)\b/,
        unless: /\b(?:scrotal pain|scrotal swelling|testicular pain|testicular torsion|acute scrotum)\b/,
        reason: "Keeps biliary disease on the abdominal-pain bedside differential; perform when pain localizes to RUQ/epigastrium or biliary features are present.",
        diagnosticTarget: "Biliary or gallbladder inflammation: inspiratory arrest or focal RUQ tenderness during gallbladder palpation.",
        management: "A positive Murphy sign can change ultrasound threshold, antibiotics/surgical consultation, NPO planning, analgesia strategy, and urgency of reassessment.",
        bedsideQuestion: "Is pain worst in the right upper abdomen or after meals, with fever, nausea/vomiting, jaundice, pale stool, or dark urine?",
        bedsideQuestionOptions: "No / RUQ pain / Post-prandial pain / Fever / Nausea or vomiting / Jaundice / Dark urine / Other ___",
        source: "MCGEE_EBPD; SM25; WSES acute calculous cholecystitis guideline",
        LR_plus: "2.8",
        evidenceTier: "A",
        difficulty: "moderate",
        time_burden_minutes: "2",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["abdominal_pain", "ruq_pain", "biliary_disease", "cholecystitis"],
        satisfiedBy: /\bmurphy sign\b/
      }
    ],
    requiredGaps: []
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
    requiredGaps: [
      {
        exam_id: "GAP-pelvic-pregnancy-status",
        item_type: "safety_check",
        gap_type: "safety_check",
        label: "Verify pregnancy possibility",
        options: "Not possible / Possible / Known positive / Unknown / Unable",
        domain: "Pregnancy/Ectopic Safety",
        reason: "Makes pregnancy status an explicit safety check for pelvic, menstrual, or lower-abdominal pain rather than burying it inside a broad gynecologic warning.",
        diagnosticTarget: "Pregnancy-related pelvic pain risk: possible pregnancy, unknown pregnancy status, syncope, heavy bleeding, or unilateral/severe pain.",
        management: "Possible or unknown pregnancy status changes urgency of pregnancy testing, ectopic-risk assessment, imaging choice, medication safety, and escalation threshold.",
        bedsideQuestion: "Any chance you could be pregnant, missed period, positive pregnancy test, fainting, shoulder pain, or heavy bleeding?",
        bedsideQuestionOptions: "No / Pregnancy possible / Missed period / Positive test / Fainting / Heavy bleeding / Other ___",
        source: "ACOG pelvic pain guidance; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["pelvic_pain", "pregnancy", "ectopic_pregnancy"],
        satisfiedBy: /\b(?:verify pregnancy possibility|pregnancy possibility safety check)\b/
      },
      {
        exam_id: "GAP-pelvic-pid-ectopic-red-flags",
        item_type: "safety_check",
        gap_type: "red_flag",
        label: "PID/ectopic red-flag review",
        options: "Absent / Fever-discharge / Severe unilateral pain / Heavy bleeding / Syncope / Unable",
        domain: "Pelvic Red Flags",
        reason: "Separates PID/ectopic red-flag review from the abdominal palpation row so the checklist does not imply uncomplicated cramps when dangerous pelvic causes are plausible.",
        diagnosticTarget: "High-risk pelvic pain features: fever, abnormal discharge, cervical/pelvic infection concern, severe unilateral pain, heavy bleeding, syncope, or pregnancy risk.",
        management: "Red flags should prompt urgent pelvic-source evaluation, pregnancy testing if relevant, STI/PID assessment, imaging/ED threshold review, and avoidance of routine dysmenorrhea framing.",
        bedsideQuestion: "Any fever, abnormal discharge, severe one-sided pelvic pain, heavy bleeding, fainting, STI exposure, or pain different from usual cramps?",
        bedsideQuestionOptions: "No / Fever / Discharge / One-sided severe pain / Heavy bleeding / Fainting / STI exposure / Other ___",
        source: "CDC STI treatment guidelines; ACOG pelvic pain guidance; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["pelvic_pain", "pid", "ectopic_pregnancy", "diagnostic_safety"],
        satisfiedBy: /\bpid\/ectopic red-flag review\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:abdominal percussion)\b/, unless: /\b(?:distension|bloating|obstruction|ileus|ascites)\b/, reason: "Abdominal percussion is a lower-yield add-on for uncomplicated menstrual/pelvic cramps unless distension, obstruction/ileus, or ascites is suspected." },
      { pattern: /\b(?:jvp|pmi|apical impulse|carotids|heart sounds|posterior lung sounds|radial pulses)\b/, unless: /\b(?:syncope|faint|shock|dyspnea|chest pain|palpitations|hypotension)\b/, reason: "Pelvic/lower-abdominal pain does not need cardiopulmonary add-ons unless instability, syncope, dyspnea, chest pain, palpitations, or shock is present." },
      { pattern: /\b(?:visual acuity|visual fields|extraocular|pupils|pronator drift|babinski|vibration sense|finger to nose|heel to shin)\b/, unless: /\b(?:focal|vision|headache|ataxia|weakness|seizure|confusion)\b/, reason: "Neuro/eye maneuvers need neurologic symptoms in pelvic/lower-abdominal pain presentations." }
    ]
  },
  {
    id: "genital_discharge_sti",
    name: "Genital discharge or STI-source evaluation",
    context: /\b(?:penile discharge|urethral discharge|genital discharge|sti|sexually transmitted)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 58, domain: "Basic Severity", reason: "Screens systemic illness or instability when genital discharge is accompanied by fever, pelvic/scrotal pain, or infection concern.", when: /\b(?:fever|systemic|pelvic pain|scrotal pain|testicular pain|ill appearing|infection)\b/, diagnosticTarget: "Systemic infection clue: fever physiology, tachycardia, hypotension, or significant pain.", management: "Abnormal vitals can change urgency of STI/PID/epididymo-orchitis workup, empiric treatment, and escalation." }
    ],
    requiredItems: [
      {
        exam_id: "REQ-sti-urethritis-cervicitis-tests",
        item_type: "diagnostic_test",
        label: "STI and urethritis/cervicitis diagnostic pathway",
        options: "NAAT for gonorrhea and chlamydia from appropriate site / Objective urethritis evidence when available: discharge on exam, urine leukocyte esterase, urine WBC, or urethral microscopy / HIV, syphilis, pregnancy, hepatitis, lesion testing, or trichomonas/M. genitalium testing when indicated / Culture and susceptibility pathway when gonorrhea treatment failure or resistant infection concern",
        domain: "Tests / STI",
        role: "core",
        reason: "Genital discharge workups need a visible STI diagnostic pathway so local exam findings are tied to management-changing testing and treatment.",
        diagnosticTarget: "Urethritis, cervicitis, gonorrhea, chlamydia, trichomonas, M. genitalium, syphilis/HIV risk, pregnancy safety, genital lesion cause, or resistant gonorrhea concern.",
        management: "Positive NAAT, objective urethritis evidence, pregnancy status, lesion testing, HIV/syphilis results, or resistant infection concern changes empiric treatment, partner services, reporting, follow-up, and specialist escalation.",
        bedsideQuestion: "Any dysuria, visible discharge, genital ulcer, pelvic or testicular pain, pregnancy possibility, new partners, STI exposure, HIV/syphilis risk, recent antibiotics, or persistent symptoms after treatment?",
        bedsideQuestionOptions: "No / Dysuria / Discharge / Ulcer / Pelvic pain / Testicular pain / Pregnancy possible / STI exposure / HIV-syphilis risk / Recent antibiotics / Persistent symptoms / Other ___",
        source: "CDC_STI_2021; AHRQ_CALIBRATE_DX",
        source_citation: "CDC sexually transmitted infections treatment guidelines 2021; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "NAAT specimen collection and urine or swab testing access",
        patient_cooperation_required: "moderate",
        matchedTags: ["genital_discharge", "sti", "urethritis", "cervicitis", "NAAT", "diagnostic_test"]
      },
      {
        exam_id: "REQ-sti-complicated-red-flags",
        item_type: "red_flag",
        label: "Complicated STI/GU escalation cues",
        options: "Fever or systemic toxicity / Pelvic or lower abdominal pain, cervical motion or adnexal tenderness concern / Scrotal or testicular pain or swelling / Genital ulcer, vesicle, necrotic lesion, or severe pain / Pregnancy or sexual assault concern / Immunocompromise / Persistent or recurrent symptoms after treatment / Unable to ensure follow-up or partner treatment",
        domain: "Red Flags / STI",
        role: "core",
        reason: "Genital discharge should be screened for PID, epididymo-orchitis, torsion mimics, genital ulcer disease, pregnancy safety, assault, and failed-treatment patterns.",
        diagnosticTarget: "Complicated GU/STI pattern: PID, epididymitis, torsion mimic, genital ulcer disease, disseminated or systemic infection, pregnancy-related risk, assault-related safety concern, or treatment failure.",
        management: "These cues change urgency of pelvic/scrotal exam, pregnancy testing, empiric antibiotics, ED or specialty escalation, public health counseling, safety planning, and partner management.",
        bedsideQuestion: "Any fever, pelvic pain, testicular pain or swelling, genital ulcer or severe lesion pain, pregnancy possibility, assault concern, immunocompromise, persistent symptoms after treatment, or inability to follow up?",
        bedsideQuestionOptions: "No / Fever / Pelvic pain / Testicular pain-swelling / Genital ulcer-severe lesion / Pregnancy possible / Assault concern / Immunocompromise / Persistent symptoms / Follow-up barrier / Other ___",
        source: "CDC_STI_2021; AHRQ_CALIBRATE_DX",
        source_citation: "CDC sexually transmitted infections treatment guidelines 2021; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["genital_discharge", "sti", "PID", "epididymitis", "genital_ulcer", "red_flag"]
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-gu-genital-exam",
        label: "Genital exam",
        options: "Normal / Discharge / Ulcer or lesion / Testicular tenderness / Deferred",
        domain: "GU/STI",
        reason: "Genital discharge requires local genital inspection when appropriate and consented, rather than substituting abdominal or HEENT maneuvers.",
        diagnosticTarget: "GU/STI source: urethral discharge, genital ulcers, lesions, epididymal/testicular tenderness, or local inflammation.",
        management: "Discharge, ulcers, testicular tenderness, or local inflammation can change STI testing, empiric treatment, partner counseling, torsion/epididymitis consideration, and need for urgent evaluation.",
        bedsideQuestion: "Any dysuria, urethral discharge, genital sores, testicular pain, new partners, STI exposure, fever, or pelvic/scrotal pain?",
        bedsideQuestionOptions: "No / Dysuria / Discharge / Sores / Testicular pain / STI exposure / Fever / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "moderate",
        time_burden_minutes: "3",
        equipment_needed: "gloves and chaperone as appropriate",
        patient_cooperation_required: "moderate",
        matchedTags: ["genital_discharge", "sti", "gu"],
        satisfiedBy: /\bgenital exam\b/
      },
      {
        exam_id: "GAP-gu-inguinal-nodes",
        label: "Inguinal nodes",
        options: "Normal / Tender / Enlarged / Not assessed",
        domain: "GU/STI",
        reason: "Inguinal lymph nodes are the local nodal basin for genital lesions or sexually transmitted infection concerns.",
        diagnosticTarget: "Local infection or malignancy clue: tender or enlarged inguinal nodes.",
        management: "Tender/enlarged inguinal nodes can change STI differential, lesion workup, empiric treatment framing, and follow-up urgency.",
        bedsideQuestion: "Any groin lumps, genital ulcers, painful lesions, fever, or STI exposure?",
        bedsideQuestionOptions: "No / Groin lump / Genital ulcer / Painful lesion / Fever / STI exposure / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["inguinal_nodes", "sti", "genital_exam"],
        satisfiedBy: /\binguinal nodes\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:jvp|mouth exam|radial pulses|bowel sounds|abdominal percussion|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:fever|sepsis|vomit|abdominal|flank|pyelo|shock|dehydrat)\b/, reason: "Genital discharge needs local GU/STI assessment; volume, bowel, or advanced abdominal maneuvers need separate systemic, abdominal, or flank context." }
    ]
  },
  {
    id: "acute_scrotal_pain",
    name: "Acute scrotal or testicular pain/swelling",
    context: /\b(?:scrotal pain|scrotal swelling|testicular pain|testicular torsion|torsion|acute scrotum)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 70, domain: "Basic Severity", reason: "Screens pain severity, instability, or infectious physiology in acute scrotal presentations.", diagnosticTarget: "Scrotal-pain severity: tachycardia, hypotension, tachypnea, or fever physiology.", management: "Abnormal vitals can change urgency of torsion/epididymitis workup, analgesia, imaging, antibiotics, and ED/urology escalation.", bedsideQuestion: "Did pain start suddenly, is there nausea/vomiting, swelling, high-riding testis, urinary symptoms, fever, trauma, or STI exposure?", bedsideQuestionOptions: "No / Sudden onset / Nausea-vomiting / Swelling / Urinary symptoms / Fever / Trauma / STI exposure / Other ___" },
      { pattern: /\b(?:abdominal palpation)\b/, strength: 56, domain: "Referred/Associated Abdomen", reason: "Checks associated lower abdominal tenderness because torsion, epididymitis, hernia, renal, or abdominal processes may overlap.", diagnosticTarget: "Associated abdominal clue: lower abdominal tenderness, guarding, hernia-like concern, or referred pain.", management: "Abdominal findings can change imaging choice, hernia/renal differential, and escalation." }
    ],
    requiredItems: [
      {
        exam_id: "REQ-acute-scrotum-torsion-tests",
        item_type: "diagnostic_test",
        label: "Acute scrotum torsion and infection pathway",
        options: "Urgent urology or surgical pathway when torsion is clinically suspected and do not delay for imaging / Doppler scrotal ultrasound when diagnosis is equivocal or it will not delay intervention / Urinalysis, urine culture, and STI NAAT when epididymitis, urethritis, fever, urinary symptoms, or STI risk are present / Consider pregnancy-style abdominal/pelvic or hernia/renal pathway only when symptoms support a non-scrotal source",
        domain: "Tests / Acute Scrotum",
        role: "core",
        reason: "Acute scrotal pain is time-sensitive; the workup must state when ultrasound helps and when urology escalation should not wait.",
        diagnosticTarget: "Testicular torsion, epididymo-orchitis, incarcerated hernia, renal colic mimic, testicular mass, trauma, or referred abdominal/pelvic source.",
        management: "High torsion concern changes immediate urology/surgery escalation; ultrasound flow, urinalysis, culture, and STI results change antibiotics, imaging, disposition, and follow-up.",
        bedsideQuestion: "How many hours since sudden onset, and is there nausea/vomiting, high-riding testis, swelling, fever, urinary symptoms, STI exposure, trauma, prior torsion, or hernia symptoms?",
        bedsideQuestionOptions: "Onset hours ___ / Sudden onset / Nausea-vomiting / High-riding / Swelling / Fever / Urinary symptoms / STI exposure / Trauma / Prior torsion / Hernia symptoms / Other ___",
        source: "AUA_ACUTE_SCROTUM; EAU_ACUTE_SCROTUM; AHRQ_CALIBRATE_DX",
        source_citation: "AUA acute scrotum curriculum; EAU acute scrotum guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "urology access, Doppler ultrasound and urine/STI testing when indicated",
        patient_cooperation_required: "moderate",
        matchedTags: ["acute_scrotum", "testicular_torsion", "epididymitis", "ultrasound", "diagnostic_test"]
      },
      {
        exam_id: "REQ-acute-scrotum-red-flags",
        item_type: "red_flag",
        label: "Torsion and acute scrotum escalation cues",
        options: "Sudden severe unilateral testicular pain / Nausea or vomiting / High-riding or horizontal testis / Absent cremasteric reflex in context / Severe focal testicular tenderness or swelling / Persistent pain with abnormal or equivocal Doppler flow / Fever or toxic appearance / Trauma, incarcerated hernia concern, or mass concern / Presentation within time-sensitive salvage window or delayed presentation with ongoing concern",
        domain: "Red Flags / Acute Scrotum",
        role: "core",
        reason: "Torsion-associated cues and dangerous mimics must be explicit because delay can cost testicular salvage and a normal or equivocal finding may not exclude torsion.",
        diagnosticTarget: "Testicular torsion, compromised testicular perfusion, epididymo-orchitis with systemic illness, incarcerated hernia, trauma-related injury, or testicular mass.",
        management: "These cues change immediate ED/urology escalation, surgical exploration threshold, ultrasound urgency, analgesia, antibiotics when infection is likely, and documentation of time of onset.",
        bedsideQuestion: "Did pain start suddenly, when exactly did it start, and is there nausea/vomiting, high-riding testis, severe swelling, fever, trauma, hernia symptoms, or a prior torsion episode?",
        bedsideQuestionOptions: "No / Sudden severe pain / Onset time ___ / Nausea-vomiting / High-riding / Severe swelling / Fever / Trauma / Hernia symptoms / Prior torsion / Other ___",
        source: "AUA_ACUTE_SCROTUM; EAU_ACUTE_SCROTUM; AHRQ_CALIBRATE_DX",
        source_citation: "AUA acute scrotum curriculum; EAU acute scrotum guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["acute_scrotum", "testicular_torsion", "cremasteric_reflex", "red_flag"]
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-gu-scrotal-exam",
        label: "Scrotal exam",
        options: "Normal / Swelling / High-riding testis / Tender epididymis / Mass / Deferred",
        domain: "Scrotal/GU",
        reason: "Acute scrotal pain requires local scrotal/testicular assessment when appropriate and consented.",
        diagnosticTarget: "Acute scrotum clue: swelling, high-riding testis, focal testicular or epididymal tenderness, mass, or hernia concern.",
        management: "High-riding testis, severe focal tenderness, swelling, or mass can change urology escalation, ultrasound urgency, analgesia, and empiric infection/torsion pathway decisions.",
        bedsideQuestion: "Was onset sudden, is pain severe, with nausea/vomiting, swelling, high-riding testis, urinary symptoms, fever, trauma, or STI exposure?",
        bedsideQuestionOptions: "No / Sudden severe pain / Nausea-vomiting / Swelling / Urinary symptoms / Fever / Trauma / STI exposure / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "moderate",
        time_burden_minutes: "3",
        equipment_needed: "gloves and chaperone as appropriate",
        patient_cooperation_required: "moderate",
        matchedTags: ["acute_scrotum", "testicular_torsion", "gu"],
        satisfiedBy: /\bscrotal exam\b/
      },
      {
        exam_id: "GAP-gu-cremasteric-reflex",
        label: "Cremasteric reflex",
        options: "Present bilaterally / Absent right / Absent left / Not assessed",
        domain: "Scrotal/GU",
        reason: "The cremasteric reflex is a bedside torsion-associated finding but is not yet an atomic base-catalog maneuver.",
        diagnosticTarget: "Torsion-associated clue: absent ipsilateral cremasteric reflex in acute scrotal pain.",
        management: "An absent reflex in the right context supports urgent torsion pathway/urology review; a present reflex does not safely exclude torsion.",
        bedsideQuestion: "Did the pain start suddenly, and is there nausea/vomiting, high-riding testis, swelling, trauma, or prior torsion?",
        bedsideQuestionOptions: "No / Sudden onset / Nausea-vomiting / High-riding / Swelling / Trauma / Prior torsion / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "moderate",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        limitations: "Presence of the reflex does not exclude torsion; do not delay urgent evaluation when clinical concern is high.",
        matchedTags: ["acute_scrotum", "testicular_torsion", "cremasteric_reflex"],
        satisfiedBy: /\bcremasteric reflex\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:murphy|rebound|psoas|obturator|liver edge|liver span|spleen palpation|abdominal percussion)\b/, unless: /\b(?:rlq|right lower quadrant|peritonitis|guarding|jaundice|biliary|splenomegaly)\b/, reason: "Acute scrotal pain needs local scrotal/GU assessment; advanced abdominal maneuvers require separate localized abdominal findings." },
      { pattern: /\b(?:visual acuity|vibration sense|proprioception|finger to nose|heel to shin)\b/, unless: /\b(?:vision|neuropathy|ataxia|weakness|numbness)\b/, reason: "Acute scrotal pain does not need unrelated eye or broad neuro testing without neurologic symptoms." }
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
    requiredItems: [
      {
        exam_id: "REQ-gu-renal-source-severity-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "GU/renal source and systemic-feature question",
        options: "Dysuria-frequency-urgency / Flank pain / Fever-chills / Nausea-vomiting / Hematuria / Oliguria-low intake / Stone history / Pregnancy possible / Indwelling catheter or procedure / Immunocompromised / Prior resistant organism / Other ___",
        domain: "Focused GU/Renal History",
        reason: "Dysuria, flank pain, and AKI need separation into lower UTI, systemic UTI/pyelonephritis, stone/obstruction, hypovolemia, pregnancy-related risk, and resistant-organism contexts.",
        diagnosticTarget: "GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.",
        management: "The answer changes whether to obtain urine culture, renal function/electrolytes, pregnancy testing, blood cultures/lactate, renal imaging, empiric antibiotic breadth, fluids, urology/OB escalation, or ED/inpatient monitoring.",
        bedsideQuestion: "Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture?",
        bedsideQuestionOptions: "Lower urinary symptoms only / Fever-chills / Flank pain / Nausea-vomiting / Hematuria / Low urine output / Stone history / Pregnancy possible / Catheter-procedure / Immunocompromised / Prior resistant organism / Other ___",
        source: "IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX",
        source_citation: "IDSA complicated UTI guideline update 2025; EAU urological infections guideline; ACOG UTI in pregnancy consensus; NICE renal/ureteric stones guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["dysuria", "UTI", "pyelonephritis", "AKI", "renal_colic", "pregnancy", "history_question"],
        satisfiedBy: /\bgu\/renal source and systemic-feature question\b/
      },
      {
        exam_id: "REQ-gu-renal-urine-renal-tests",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Urine and renal-function tests",
        options: "Urinalysis when urinary symptoms, flank pain, fever/systemic UTI, hematuria, or renal colic possible / Urine culture for pyelonephritis, systemic UTI, complicated UTI, pregnancy, recurrent/resistant risk, catheter/procedure risk, or treatment failure / BMP or CMP with creatinine-BUN-electrolytes for AKI, dehydration, vomiting, systemic illness, obstruction, or medication safety / Pregnancy test when pregnancy cannot be excluded / CBC and lactate-blood cultures when sepsis or systemic infection concern",
        domain: "Tests / Urine And Renal Safety",
        reason: "GU/renal symptoms need objective urine and renal-function data; exam alone cannot separate cystitis, pyelonephritis, stone, obstruction, AKI, pregnancy-related UTI, and urosepsis.",
        diagnosticTarget: "Urine/renal diagnostic data: pyuria/bacteriuria/hematuria, culture/susceptibility, creatinine or electrolyte abnormality, pregnancy status, systemic infection, sepsis physiology, or medication-safety constraint.",
        management: "UA/culture, pregnancy status, creatinine/electrolytes, CBC, lactate, or blood-culture findings change antibiotic selection, renal dosing, fluid strategy, imaging, source-control/urology need, pregnancy pathway, and disposition.",
        bedsideQuestion: "Is this uncomplicated lower urinary symptoms, possible pyelonephritis/systemic UTI, AKI/dehydration, renal colic/hematuria, pregnancy-related UTI, or complicated/resistant-risk UTI?",
        bedsideQuestionOptions: "Lower UTI / Pyelo-systemic UTI / AKI-dehydration / Renal colic-hematuria / Pregnancy-related / Catheter-procedure / Resistant-risk / Treatment failure / Other ___",
        source: "IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX",
        source_citation: "IDSA complicated UTI guideline update 2025; EAU urological infections guideline; ACOG UTI in pregnancy consensus; NICE renal/ureteric stones guideline; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab order review",
        patient_cooperation_required: "low",
        matchedTags: ["dysuria", "UTI", "urinalysis", "urine_culture", "renal_function", "pregnancy", "diagnostic_test"],
        satisfiedBy: /\burine and renal-function tests\b/
      },
      {
        exam_id: "REQ-gu-renal-imaging-pathway",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Renal obstruction and stone imaging pathway",
        options: "Renal/bladder ultrasound or CT pathway for suspected obstruction, infected stone, solitary kidney, severe/refractory renal colic, AKI with obstruction concern, persistent hematuria, or uncertain diagnosis / Imaging choice adjusted for pregnancy, radiation, contrast, renal function, and local protocol",
        domain: "Tests / Imaging",
        reason: "Flank pain, hematuria, AKI, or systemic UTI can require imaging when obstruction, stone, abscess, hydronephrosis, or alternate diagnosis would change urgent management.",
        diagnosticTarget: "Imaging target: hydronephrosis/obstruction, ureteral stone, infected obstructed system, renal abscess, urinary retention, or alternate abdominal/pelvic pathology.",
        management: "Obstruction, infected stone, abscess, solitary kidney risk, or worsening renal function changes urology consultation, decompression/source control, antibiotics, analgesia, fluids, admission, and imaging follow-up.",
        bedsideQuestion: "Any severe flank colic, fever with stone symptoms, solitary kidney, AKI/oliguria, persistent vomiting, uncontrolled pain, pregnancy, or hematuria needing renal imaging?",
        bedsideQuestionOptions: "No / Severe colic / Fever with stone symptoms / Solitary kidney / AKI-oliguria / Persistent vomiting / Uncontrolled pain / Pregnancy / Hematuria / Other ___",
        source: "NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX",
        source_citation: "NICE renal/ureteric stones guideline; EAU urological infections guideline; IDSA complicated UTI guideline update 2025; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["flank_pain", "renal_colic", "obstruction", "AKI", "imaging", "diagnostic_test"],
        satisfiedBy: /\brenal obstruction and stone imaging pathway\b/
      },
      {
        exam_id: "REQ-gu-renal-urosepsis-red-flags",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Urosepsis and pyelonephritis escalation cues",
        options: "Fever or rigors / Flank pain or CVA tenderness / Hypotension or tachycardia / Confusion / Vomiting or unable to tolerate PO / Pregnancy / Immunocompromised / Recent urologic procedure or catheter / Prior resistant organism / Rising creatinine or oliguria",
        domain: "Red Flags / Systemic UTI",
        reason: "A GU workup must distinguish uncomplicated cystitis from pyelonephritis, systemic UTI, and urosepsis because management and disposition change immediately.",
        diagnosticTarget: "Systemic urinary infection clue: fever/rigors, flank/CVA symptoms, sepsis physiology, altered mentation, vomiting, pregnancy, immunocompromise, catheter/procedure association, resistance risk, or renal dysfunction.",
        management: "These cues change urine culture and blood culture/lactate threshold, empiric antibiotic route/breadth, fluids, renal dosing, imaging/source-control urgency, OB/urology involvement, and ED/inpatient escalation.",
        bedsideQuestion: "Any fever, rigors, flank pain, vomiting, confusion, low blood pressure, fast heart rate, pregnancy, immunocompromise, catheter/procedure, prior resistant organism, rising creatinine, or low urine output?",
        bedsideQuestionOptions: "No / Fever-rigors / Flank pain / Vomiting / Confusion / Hypotension-tachycardia / Pregnancy / Immunocompromised / Catheter-procedure / Resistant organism / Rising creatinine-oliguria / Other ___",
        source: "IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; AHRQ_CALIBRATE_DX",
        source_citation: "IDSA complicated UTI guideline update 2025; EAU urological infections guideline; ACOG UTI in pregnancy consensus; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "vitals and chart/lab review",
        patient_cooperation_required: "low",
        matchedTags: ["pyelonephritis", "urosepsis", "AKI", "pregnancy", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\burosepsis and pyelonephritis escalation cues\b/
      },
      {
        exam_id: "REQ-gu-renal-obstruction-red-flags",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Obstruction, stone, and AKI danger cues",
        options: "Anuria or severe oliguria / Solitary kidney or transplant kidney / Fever with obstructing stone concern / Uncontrolled flank pain / Persistent vomiting / New hydronephrosis or urinary retention concern / Gross hematuria with instability / Severe electrolyte abnormality",
        domain: "Red Flags / Obstruction And AKI",
        reason: "Stone/obstruction and AKI red flags should not be hidden inside CVA tenderness or volume-status exams.",
        diagnosticTarget: "High-risk renal process: obstructed infected system, urinary retention, severe renal colic, solitary/transplant kidney risk, gross hematuria, worsening AKI, or dangerous electrolyte abnormality.",
        management: "These cues change imaging urgency, urology/nephrology consultation, decompression/source control, analgesia/antiemetic route, fluid strategy, electrolyte correction, and ED/inpatient disposition.",
        bedsideQuestion: "Any no urine, solitary/transplant kidney, fever with stone symptoms, uncontrolled flank pain, persistent vomiting, retention, gross hematuria, or known severe electrolyte problem?",
        bedsideQuestionOptions: "No / Anuria-oliguria / Solitary-transplant kidney / Fever with stone symptoms / Uncontrolled flank pain / Persistent vomiting / Retention / Gross hematuria / Severe electrolyte issue / Other ___",
        source: "NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX",
        source_citation: "NICE renal/ureteric stones guideline; EAU urological infections guideline; IDSA complicated UTI guideline update 2025; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "history, vitals, chart/lab review",
        patient_cooperation_required: "moderate",
        matchedTags: ["renal_colic", "obstruction", "AKI", "hematuria", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\bobstruction, stone, and aki danger cues\b/
      }
    ],
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 78, domain: "Vitals", reason: "Checks shock, fever physiology, and volume-sensitive management." },
      {
        pattern: /\b(?:mouth exam|radial pulses)\b/,
        strength: 84,
        domain: "Volume/Perfusion",
        reason: "Checks dehydration and bedside perfusion in GU/renal illness without turning uncomplicated urinary symptoms into a heart-failure exam.",
        when: /\b(?:aki|oliguria|poor intake|dehydration|hypovolemia|vomit|nausea|fever|pyelo|sepsis|shock|hypotension|tachycardia|flank|dysuria|urinary)\b/,
        diagnosticTarget: "Volume/perfusion clue: dry mucosa, poor intake/dehydration, weak pulses, shock physiology, or systemic infection physiology.",
        management: "Dehydration or poor perfusion changes oral/IV fluid strategy, renal-function monitoring, sepsis escalation, medication safety, and disposition."
      },
      { pattern: /\b(?:cva tenderness)\b/, strength: 70, domain: "Renal/GU Abdomen", reason: "Looks for pyelonephritis or renal colic when flank or urinary symptoms are present.", when: /\b(?:flank|pyelo|stone|renal colic|urinary|dysuria|hematuria|fever)\b/ },
      {
        pattern: /\b(?:abdominal palpation)\b/,
        strength: 58,
        domain: "Renal/GU Abdomen",
        reason: "Adds suprapubic or abdominal source assessment when urinary, flank, hematuria, nausea/vomiting, or abdominal symptoms coexist.",
        when: /\b(?:suprapubic|abdominal|flank|pyelo|vomit|nausea|urinary|dysuria|hematuria|retention)\b/,
        diagnosticTarget: "GU/abdominal source clue: suprapubic tenderness, abdominal tenderness, retention concern, or alternate abdominal process.",
        management: "Abdominal or suprapubic findings can change urinalysis/culture priority, imaging threshold, obstruction/retention concern, antibiotics, and escalation."
      }
    ],
    conditional: [
      {
        pattern: /\b(?:jvp)\b/,
        strength: 50,
        domain: "Volume Add-on",
        reason: "Adds JVP only when AKI, oliguria, renal failure, shock, or explicit volume-status uncertainty makes fluid versus congestion assessment management-changing.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:aki|oliguria|renal failure|volume overload|heart failure|edema|diuresis|shock|hypotension|hypovolemia|fluid status|volume status)\b/),
        diagnosticTarget: "Volume-status clue in renal illness: venous congestion versus hypovolemia when fluids, diuresis, or escalation are being considered.",
        management: "JVP findings can change fluid/diuresis strategy, cardiorenal framing, monitoring, and need for renal/cardiac reassessment."
      },
      {
        pattern: /\b(?:lower extremity edema)\b/,
        strength: 46,
        domain: "Volume Add-on",
        reason: "Adds edema assessment only when renal disease, nephrotic/volume overload, AKI, or heart-failure context is present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:edema|swelling|volume overload|nephrotic|renal failure|aki|heart failure|hypoalbumin|diuresis)\b/),
        diagnosticTarget: "Peripheral volume clue: edema suggesting renal, cardiac, hepatic, venous, or medication-related fluid retention.",
        management: "Edema findings can change volume-overload framing, renal/cardiac testing, diuretic decisions, and disposition."
      },
      {
        pattern: /\b(?:bowel sounds)\b/,
        strength: 42,
        domain: "GI/GU Add-on",
        reason: "Adds bowel sounds only when vomiting, distension, ileus, obstruction, constipation, or abdominal symptoms are part of the GU/renal presentation.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:vomit|nausea|distension|obstruction|ileus|constipation|abdominal|belly|stomach)\b/),
        diagnosticTarget: "GI mimic or complication clue: ileus, obstruction, distension, or alternate abdominal process.",
        management: "Abnormal bowel sounds can change imaging threshold, surgical/abdominal framing, antiemetic/PO strategy, and escalation."
      }
    ]
  },
  {
    id: "infection_sepsis",
    name: "Fever, infection, or sepsis",
    context: /\b(?:fever|chills|rigors|night sweats|infection|sepsis|leukocytosis|pneumonia|pyelonephritis|sore throat|pharyngitis|lymphadenitis|wound)\b/,
    requiredItems: [
      {
        exam_id: "REQ-infection-respiratory-source-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Respiratory infection-source question",
        options: "No / Cough / Sputum / Shortness of breath / Pleuritic pain / Wheeze / New oxygen need / Aspiration risk / Sick respiratory contacts / Other ___",
        domain: "Respiratory Source History",
        reason: "Fever or sepsis workups need a distinct respiratory-source screen so pneumonia, aspiration, and hypoxemia are not hidden inside a broad symptom bundle.",
        diagnosticTarget: "Respiratory infection clue: cough, sputum, dyspnea, pleuritic pain, wheeze, oxygen need, aspiration risk, or respiratory exposure.",
        management: "Positive respiratory-source symptoms focus work of breathing and lung exam, chest imaging/testing, isolation, oxygen/bronchodilator strategy, antimicrobial framing, and escalation.",
        bedsideQuestion: "Any cough, sputum, shortness of breath, pleuritic pain, wheeze, new oxygen need, aspiration risk, or sick respiratory contacts?",
        bedsideQuestionOptions: "No / Cough / Sputum / Shortness of breath / Pleuritic pain / Wheeze / New oxygen need / Aspiration risk / Sick respiratory contacts / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "respiratory_source", "pneumonia", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:respiratory infection-source question|respiratory source history|pneumonia source history)\b/
      },
      {
        exam_id: "REQ-infection-heent-oral-source-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "HEENT, dental, and oral infection-source question",
        options: "No / Sore throat / Ear pain / Sinus pain / Dental or oral pain / Neck swelling / Hoarseness / Trouble swallowing / Drooling / Other ___",
        domain: "HEENT / Oral Source History",
        reason: "Fever workups need a separate HEENT/oral source screen because throat, dental, sinus, and deep-neck patterns change the bedside exam and escalation threshold.",
        diagnosticTarget: "HEENT/oral source clue: pharyngitis, otitis/sinusitis, dental or oral infection, neck swelling, hoarseness, dysphagia, or drooling.",
        management: "Positive HEENT/oral symptoms focus oropharynx, neck, and airway assessment, testing, imaging threshold, antimicrobial framing, and ENT/dental escalation.",
        bedsideQuestion: "Any sore throat, ear pain, sinus pain, dental or oral pain, neck swelling, hoarseness, trouble swallowing, or drooling with the fever?",
        bedsideQuestionOptions: "No / Sore throat / Ear pain / Sinus pain / Dental or oral pain / Neck swelling / Hoarseness / Trouble swallowing / Drooling / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "heent_source", "dental_source", "oral_source", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:heent, dental, and oral infection-source question|heent source history|dental source history|oral source history)\b/
      },
      {
        exam_id: "REQ-infection-urinary-flank-source-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Urinary and flank infection-source question",
        options: "No / Dysuria / Frequency or urgency / Hematuria / Suprapubic pain / Flank pain / Catheter or procedure / Pregnancy possible / Resistant organism history / Nausea or vomiting / Reduced urine output / Other ___",
        domain: "Urinary / Flank Source History",
        reason: "Fever workups need a separate urinary/flank source screen so cystitis, pyelonephritis, catheter/procedure infection, and infected obstruction are not missed.",
        diagnosticTarget: "GU/flank source clue: dysuria, frequency/urgency, hematuria, suprapubic pain, flank pain, catheter/procedure, pregnancy, resistant organism history, vomiting, or renal/perfusion risk.",
        management: "Positive urinary/flank symptoms change CVA/flank exam, urinalysis/culture, renal function review, imaging threshold, antimicrobial choice, pregnancy safety, and escalation threshold.",
        bedsideQuestion: "Any dysuria, urinary frequency or urgency, hematuria, suprapubic pain, flank pain, catheter or urologic procedure, pregnancy possibility, prior resistant urine culture, nausea, vomiting, or reduced urine output?",
        bedsideQuestionOptions: "No / Dysuria / Frequency or urgency / Hematuria / Suprapubic pain / Flank pain / Catheter or procedure / Pregnancy possible / Resistant organism history / Nausea or vomiting / Reduced urine output / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "urinary_source", "flank_pain", "pyelonephritis", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:urinary and flank infection-source question|urinary source history|flank source history|pyelonephritis source history)\b/
      },
      {
        exam_id: "REQ-infection-abdominal-gi-source-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Abdominal and GI infection-source question",
        options: "No / Abdominal pain / Vomiting / Diarrhea / Jaundice / Focal tenderness / Recent abdominal procedure / Other ___",
        domain: "Abdominal / GI Source History",
        reason: "Fever workups need a distinct abdominal/GI source screen because biliary, intra-abdominal, diarrheal, and procedure-related sources change exam focus and imaging threshold.",
        diagnosticTarget: "Abdominal/GI source clue: abdominal pain, vomiting, diarrhea, jaundice, focal tenderness, recent intra-abdominal procedure, or peritoneal/source-control concern.",
        management: "Positive abdominal/GI symptoms focus abdominal exam, liver/biliary labs, stool or culture decisions, imaging threshold, antimicrobial framing, and surgical/GI escalation.",
        bedsideQuestion: "Any abdominal pain, vomiting, diarrhea, jaundice, focal tenderness, recent intra-abdominal procedure, or concern for an abdominal infection source?",
        bedsideQuestionOptions: "No / Abdominal pain / Vomiting / Diarrhea / Jaundice / Focal tenderness / Recent abdominal procedure / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "abdominal_source", "gi_source", "biliary_source", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:abdominal and gi infection-source question|abdominal source history|gi source history|biliary source history)\b/
      },
      {
        exam_id: "REQ-infection-skin-wound-line-source-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Skin, wound, and line-site infection-source question",
        options: "No / Rash / Wound or ulcer / Drainage / Line pain or redness / Rapidly spreading skin pain / Bite / Procedure site / Other ___",
        domain: "Skin / Wound / Line Source History",
        reason: "Fever workups need a separate skin, wound, and line-source screen because these findings can require culture, source control, line management, or surgical escalation.",
        diagnosticTarget: "Skin/device source clue: rash, wound/ulcer, drainage, line pain/redness, rapidly spreading pain, bite, or procedure-site infection.",
        management: "Positive skin/wound/line symptoms focus inspection, culture/source-control decisions, antibiotic route and breadth, isolation, and surgical or line-management escalation.",
        bedsideQuestion: "Any rash, wound, ulcer, drainage, line pain or redness, rapidly spreading skin pain, bite, recent procedure site, or soft-tissue infection concern?",
        bedsideQuestionOptions: "No / Rash / Wound or ulcer / Drainage / Line pain or redness / Rapidly spreading skin pain / Bite / Procedure site / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "skin_source", "wound_source", "line_source", "soft_tissue_infection", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:skin, wound, and line-site infection-source question|skin source history|wound source history|line source history)\b/
      },
      {
        exam_id: "REQ-infection-cns-joint-spine-danger-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "CNS, joint, spine, and rapid-worsening danger question",
        options: "No / Severe headache / Neck stiffness / Photophobia / Confusion / Seizure / Petechiae or purpura / Hot swollen joint / Focal bone or back pain / New weakness / Bowel or bladder symptoms / Fainting / Low urine output / Rapid worsening / Other ___",
        domain: "CNS / Joint / Spine Danger History",
        reason: "Fever workups need a distinct danger screen for meningitis/encephalitis, septic arthritis, spine infection, bacteremia complications, and sepsis trajectory.",
        diagnosticTarget: "Danger clue: severe headache, meningismus, photophobia, confusion, seizure, petechiae/purpura, hot swollen joint, focal bone/back pain, neurologic deficit, syncope/oliguria, or rapid worsening.",
        management: "Positive CNS/joint/spine or rapid-worsening symptoms change neurologic/joint/spine exam, sepsis reassessment, lumbar puncture or imaging threshold, cultures, antimicrobial urgency, and ED/inpatient escalation.",
        bedsideQuestion: "Any severe headache, neck stiffness, photophobia, confusion, seizure, petechiae, purpura, hot swollen joint, severe focal bone or back pain, new weakness, bowel or bladder symptoms, fainting, low urine output, or rapid worsening?",
        bedsideQuestionOptions: "No / Severe headache / Neck stiffness / Photophobia / Confusion / Seizure / Petechiae or purpura / Hot swollen joint / Focal bone or back pain / New weakness / Bowel or bladder symptoms / Fainting / Low urine output / Rapid worsening / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "cns_infection", "meningitis", "joint_source", "spine_infection", "source_localizing_history", "history_question", "diagnostic_safety"],
        satisfiedBy: /\b(?:cns, joint, spine, and rapid-worsening danger question|cns source history|joint source history|spine source history|meningitis source history)\b/
      },
      {
        exam_id: "REQ-infection-host-exposure-history",
        item_type: "history_question",
        gap_type: "history_question",
        label: "Infection exposure and high-risk host question",
        options: "None / Immunocompromised / Pregnancy possible / Recent hospitalization or procedure / Indwelling line or device / Travel or outdoor exposure / Animal or food-water exposure / Sick contacts / New medication / Other ___",
        domain: "Host Risk And Exposure History",
        reason: "Undifferentiated fever needs host-risk and exposure screening because the same bedside findings carry different urgency in immunocompromised, pregnant, device-associated, travel, or procedure-related contexts.",
        diagnosticTarget: "High-risk host or exposure clue: immunosuppression, pregnancy, recent healthcare exposure, indwelling device, travel/vector exposure, animal/food exposure, sick contacts, or drug fever mimic.",
        management: "High-risk host or exposure features can change urgency, isolation, cultures, empiric coverage, imaging, ID consultation, and threshold for ED or inpatient evaluation.",
        bedsideQuestion: "Any immunosuppression, pregnancy possibility, recent hospitalization/procedure, line/device, travel/outdoor bite exposure, animal or food-water exposure, sick contacts, or new medication?",
        bedsideQuestionOptions: "None / Immunocompromised / Pregnancy possible / Recent hospitalization or procedure / Line or device / Travel or bite exposure / Animal or food-water exposure / Sick contacts / New medication / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["infection", "sepsis", "host_risk", "exposure_history", "diagnostic_safety"],
        satisfiedBy: /\binfection exposure and high-risk host question\b/
      },
      {
        exam_id: "REQ-infection-sepsis-severity-labs",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Sepsis severity labs and reference thresholds",
        options: "CBC with differential / CMP or creatinine / Lactate if sepsis concern / Glucose as clinically indicated / Review recent cultures",
        domain: "Tests / Reference Thresholds",
        reason: "Fever with possible sepsis needs objective severity data rather than relying on exam alone.",
        diagnosticTarget: "Sepsis physiology and organ dysfunction screen: leukocytosis/leukopenia, thrombocytopenia, creatinine or bilirubin rise, hypoglycemia/hyperglycemia, and lactate elevation.",
        management: "Lactate >2 mmol/L, lactate >=4 mmol/L, hypotension, new organ dysfunction, or concerning CBC/CMP results change resuscitation urgency, antimicrobial timing, monitoring level, and disposition.",
        bedsideQuestion: "Any low blood pressure, confusion, oliguria, rigors, rapid worsening, immunosuppression, or concern that this is more than uncomplicated fever?",
        bedsideQuestionOptions: "No / Hypotension / Confusion / Low urine output / Rigors / Rapid worsening / Immunocompromised / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab review",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "diagnostic_test", "lactate", "organ_dysfunction"],
        satisfiedBy: /\b(?:sepsis severity labs|lactate|cbc|cmp|creatinine)\b/
      },
      {
        exam_id: "REQ-infection-source-directed-studies",
        item_type: "diagnostic_test",
        gap_type: "diagnostic_test",
        label: "Source-directed infection studies",
        options: "Blood cultures when serious bacterial infection/sepsis suspected / Chest imaging for respiratory source / UA or urine culture for urinary or flank source / Wound or line culture when present / Viral testing when syndrome/exposure supports it",
        domain: "Tests / Source Evaluation",
        reason: "The workup should pair source-localizing questions and exam findings with source-directed tests.",
        diagnosticTarget: "Likely infection source: respiratory, urinary, skin/line, viral, abdominal, CNS, or other localizing source.",
        management: "A positive source-directed test can change empiric antimicrobial choice, isolation, source control, imaging, and consultation; cultures should be obtained before antibiotics when feasible without delaying urgent treatment.",
        bedsideQuestion: "Which source is most plausible after history and exam: cough/dyspnea, dysuria/flank pain, wound/line, abdominal symptoms, sore throat, CNS symptoms, travel/exposure, or none?",
        bedsideQuestionOptions: "Respiratory / Urinary-flank / Skin-wound-line / Abdominal / HEENT / CNS / Exposure-related / No source yet / Other ___",
        source: "SSC_SEPSIS_2026; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; ATS adult CAP guideline update 2025; IDSA CAP clinical pathway; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart/lab/imaging order review",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "source_control", "pneumonia", "UTI", "diagnostic_test"],
        satisfiedBy: /\b(?:REQ-infection-source-directed-studies|source-directed infection studies)\b/
      },
      {
        exam_id: "REQ-infection-shock-escalation-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "Sepsis or shock escalation cues",
        options: "Hypotension/MAP concern / Lactate >2 / Lactate >=4 / Altered mental status / Oliguria / Mottled or cold extremities / Rising oxygen need / Rapid worsening",
        domain: "Red Flags / Escalation",
        reason: "A fever workup must explicitly screen for sepsis severity and shock physiology.",
        diagnosticTarget: "High-acuity sepsis clue: hypotension, elevated lactate, new organ dysfunction, altered mentation, oliguria, poor perfusion, hypoxemia, or rapid deterioration.",
        management: "These findings change urgency of sepsis pathway, fluids/vasopressors consideration, broad empiric antimicrobials, cultures, close reassessment, and ED/ICU escalation.",
        bedsideQuestion: "Any confusion, fainting, low urine output, cold/mottled extremities, severe weakness, increasing oxygen need, or rapid deterioration?",
        bedsideQuestionOptions: "No / Confusion / Fainting / Low urine output / Cold-mottled extremities / Severe weakness / More oxygen / Rapid worsening / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "vitals and chart/lab review",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "shock", "red_flag", "diagnostic_safety"],
        satisfiedBy: /\b(?:sepsis or shock escalation cues|shock|lactate|oliguria|mottled)\b/
      },
      {
        exam_id: "REQ-infection-cns-airway-purpura-cues",
        item_type: "red_flag",
        gap_type: "red_flag",
        label: "CNS, airway, or purpura danger cues",
        options: "Meningismus or severe headache / Photophobia / New seizure / Toxic appearance / Stridor or drooling / Petechiae or purpura / Necrotizing soft-tissue concern",
        domain: "Red Flags / Dangerous Infection Patterns",
        reason: "Some fever patterns require urgent escalation even before a source is fully proven.",
        diagnosticTarget: "Dangerous infection pattern: meningitis/encephalitis, threatened airway, meningococcemia, or necrotizing soft-tissue infection concern.",
        management: "These cues change isolation, empiric therapy urgency, airway/ED escalation, imaging or lumbar puncture planning, surgical/source-control urgency, and consultation.",
        bedsideQuestion: "Any severe headache, neck stiffness, photophobia, seizure, confusion, drooling/stridor, purple rash, severe skin pain, or rapidly spreading soft-tissue findings?",
        bedsideQuestionOptions: "No / Headache-neck stiffness / Photophobia / Seizure / Confusion / Drooling-stridor / Petechiae-purpura / Severe skin pain / Rapid spread / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "meningitis", "airway", "purpura", "red_flag"],
        satisfiedBy: /\b(?:cns, airway, or purpura danger cues|meningismus|photophobia|purpura|stridor|necrotizing)\b/
      },
      {
        exam_id: "REQ-infection-mental-status",
        item_type: "safety_check",
        gap_type: "safety_check",
        label: "Document mental status",
        options: "Baseline / Confused / Somnolent / Agitated / Unable to assess",
        domain: "Sepsis Severity Safety",
        reason: "Altered mentation is a severity clue in suspected infection and should be separated from organ-specific physical exam maneuvers.",
        diagnosticTarget: "Sepsis severity clue: acute confusion, somnolence, agitation, inability to participate, or change from baseline.",
        management: "Altered mental status changes monitoring level, airway/safety concern, delirium and metabolic evaluation, sepsis escalation, and disposition.",
        bedsideQuestion: "Is this mental status baseline, and has there been new confusion, sleepiness, agitation, fainting, or inability to safely cooperate?",
        bedsideQuestionOptions: "Baseline / New confusion / Sleepiness / Agitation / Fainting / Unable to cooperate / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "mental_status", "diagnostic_safety"],
        satisfiedBy: /\b(?:mental status|mental status assessment|alert|oriented|confusion|somnolent|agitated)\b/
      },
      {
        exam_id: "REQ-infection-radial-pulses",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Radial pulses",
        options: "Strong/equal / Weak / Bounding / Asymmetric / Unable",
        domain: "Perfusion",
        reason: "Screens bedside perfusion in fever, infection, or sepsis without using a heart-failure-specific source row.",
        diagnosticTarget: "Sepsis severity/perfusion clue: weak, thready, bounding, or asymmetric pulse suggesting shock physiology, circulatory stress, or another vascular problem.",
        management: "Poor perfusion can change urgency of fluids, cultures/antibiotics, lactate or shock reassessment, monitoring level, and ED/ICU escalation.",
        bedsideQuestion: "Any fainting, confusion, very low urine output, mottled/cold extremities, severe weakness, or rapid worsening?",
        bedsideQuestionOptions: "No / Fainting / Confusion / Low urine output / Cold or mottled extremities / Severe weakness / Rapid worsening / Other ___",
        source: "SSC_SEPSIS_2026; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "perfusion", "shock", "source_control"],
        satisfiedBy: /\bREQ-infection-radial-pulses\b/
      },
      {
        exam_id: "REQ-infection-work-of-breathing",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Work of breathing observation",
        options: "Normal / Tachypneic / Labored / Accessory muscle use / Unable",
        domain: "Respiratory Severity",
        reason: "Respiratory distress can signal pneumonia, hypoxemic respiratory failure, shock physiology, or need for urgent respiratory support.",
        diagnosticTarget: "Respiratory severity clue: tachypnea, labored breathing, accessory muscle use, speech limitation, or worsening oxygen need.",
        management: "Increased work of breathing changes oxygen strategy, respiratory support, imaging urgency, ED/ICU escalation, and reassessment frequency.",
        bedsideQuestion: "Any new cough, shortness of breath, chest discomfort, oxygen requirement, wheeze, sputum, or pleuritic pain?",
        bedsideQuestionOptions: "No / Cough / Shortness of breath / Oxygen need / Wheeze / Sputum / Pleuritic pain / Other ___",
        source: "SSC_SEPSIS_2026; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; MERCK_FEVER_ADULTS; SM25; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; ATS adult CAP guideline update 2025; IDSA CAP clinical pathway; Merck Manual Professional Fever; Stanford Medicine 25 pulmonary exam resources; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "pulmonary_exam", "respiratory_status", "hypoxia"],
        satisfiedBy: /\b(?:work of breathing|thorax inspection|respiratory pattern|tachypnea|labored breathing)\b/
      },
      {
        exam_id: "REQ-infection-posterior-lung-sounds",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Posterior lung sounds",
        options: "Clear / Crackles / Wheezes / Rhonchi / Diminished / Unable",
        domain: "Respiratory Source",
        reason: "Fever or sepsis evaluation should screen for pneumonia or pulmonary source before assuming a non-respiratory focus.",
        diagnosticTarget: "Respiratory source clue: focal crackles, wheeze, rhonchi, diminished sounds, or asymmetric aeration.",
        management: "New focal lung findings can change chest imaging review, oxygen/support, antimicrobial framing, bronchodilator treatment, and escalation.",
        bedsideQuestion: "Any cough, dyspnea, sputum, pleuritic chest pain, oxygen requirement, or recent aspiration risk?",
        bedsideQuestionOptions: "No / Cough / Dyspnea / Sputum / Pleuritic pain / Oxygen need / Aspiration risk / Other ___",
        source: "SSC_SEPSIS_2026; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; MERCK_FEVER_ADULTS; SM25; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; ATS adult CAP guideline update 2025; IDSA CAP clinical pathway; Merck Manual Professional Fever; Stanford Medicine 25 pulmonary exam resources; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1.5",
        equipment_needed: "stethoscope",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "pneumonia", "pulmonary_exam", "respiratory_status"],
        satisfiedBy: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds|auscultate .*lung)\b/
      },
      {
        exam_id: "REQ-infection-skin-source-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Inspect skin for infection source",
        options: "No focal skin source / Rash / Cellulitis / Wound / Drainage / Line-site inflammation / Unable",
        domain: "Skin/Wound Source",
        reason: "A focused skin inspection is a fast, source-directed infection screen for cellulitis, wounds, rash, line-site inflammation, and soft-tissue infection clues.",
        diagnosticTarget: "Skin or device source clue: rash, cellulitis, wound, drainage, necrosis, line-site erythema, or soft-tissue infection concern.",
        management: "A skin, wound, or line-site source changes source control urgency, culture targets, antimicrobial coverage, wound care, isolation, and escalation.",
        bedsideQuestion: "Any new rash, painful skin, wound, drainage, line pain/redness, recent procedure, bite, or rapidly spreading redness?",
        bedsideQuestionOptions: "No / Rash / Painful skin / Wound / Drainage / Line redness / Recent procedure / Bite / Rapid spread / Other ___",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX",
        source_citation: "Surviving Sepsis Campaign adult guidelines 2026; Merck Manual Professional Fever; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["infection", "sepsis", "skin", "wound", "source_control"],
        satisfiedBy: /\b(?:skin source inspection|skin inspection|wound inspection|line-site inspection)\b/
      }
    ],
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 84, domain: "Vitals", reason: "Checks sepsis physiology and escalation need." },
      {
        pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds)\b/,
        strength: 76,
        domain: "Respiratory Source",
        reason: "Screens for pneumonia or lower respiratory infection source in fever/sepsis rather than waiting for the model to infer a pulmonary exam.",
        when: /\b(?:fever|infection|sepsis|cough|dyspnea|hypoxia|pneumonia|respiratory|tachypnea)\b/,
        diagnosticTarget: "Respiratory source clue: focal crackles, wheeze, rhonchi, diminished sounds, or asymmetric aeration suggesting pneumonia, aspiration, obstructive disease, edema, or respiratory complication.",
        management: "New focal lung findings can change chest imaging review, oxygen/support strategy, antimicrobial framing, bronchodilator treatment, isolation, and escalation.",
        bedsideQuestion: "Any cough, shortness of breath, sputum, pleuritic chest pain, oxygen requirement, aspiration risk, or sick contacts?",
        bedsideQuestionOptions: "No / Cough / Dyspnea / Sputum / Pleuritic pain / Oxygen need / Aspiration risk / Sick contacts / Other ___",
        source: "SSC_SEPSIS_2026; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; MERCK_FEVER_ADULTS; SM25; AHRQ_CALIBRATE_DX"
      },
      {
        pattern: /\b(?:oropharynx|mouth exam)\b/,
        strength: 70,
        domain: "HEENT Source",
        reason: "Looks for pharyngitis, dental/oral lesions, mucosal findings, dehydration, or airway-adjacent infection as part of the source screen for undifferentiated fever.",
        when: /\b(?:fever|infection|sepsis|sore throat|pharyngitis|mouth|oral|mucosal|oropharynx|tonsil|neck|airway|rash)\b/,
        diagnosticTarget: "HEENT source clue: tonsillar/pharyngeal inflammation, oral lesion, mucosal abnormality, thrush, dehydration, or airway-adjacent infection clue.",
        management: "Abnormal HEENT findings can change testing, isolation, antimicrobial framing, hydration strategy, airway concern, and escalation.",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX; SM25"
      },
      {
        pattern: /\b(?:cva tenderness)\b/,
        strength: 64,
        domain: "Renal/GU Source",
        reason: "Looks for pyelonephritis or obstructing renal/GU source when flank pain, urinary symptoms, or renal source clues are present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:flank|urinary|dysuria|pyelo|renal|hematuria|oliguria)\b/),
        diagnosticTarget: "Renal/GU source clue: costovertebral-angle tenderness in possible pyelonephritis, renal colic, or infected obstruction context.",
        management: "CVA tenderness with fever/systemic illness can change urinalysis/culture priority, imaging threshold, antibiotics, obstruction concern, and escalation.",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX"
      },
      {
        pattern: /\b(?:abdominal palpation|bowel sounds)\b/,
        strength: 60,
        domain: "Abdominal Source",
        reason: "Adds abdominal source assessment when abdominal symptoms, GI symptoms, peritonitis, shock, or hypotension are present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:abdominal|vomit|nausea|diarrhea|gi|peritonitis|hypotension|shock)\b/),
        diagnosticTarget: "Abdominal source clue: focal tenderness, guarding, distension, ileus, peritonitis, diarrhea-associated illness, or abdominal source-control concern.",
        management: "Abdominal findings can change imaging, surgical/source-control urgency, stool/infectious testing, antimicrobial framing, and escalation.",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX"
      },
      {
        pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|tonsillar nodes|submandibular nodes|supraclavicular nodes)\b/,
        strength: 56,
        domain: "Nodes",
        reason: "Adds regional node exam when throat, neck, malignancy, or lymphadenopathy concerns are present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:sore throat|pharyngitis|lymph|adenopathy|neck mass|malignancy|night sweats)\b/),
        diagnosticTarget: "Nodal source clue: tender, enlarged, fixed, matted, localized, or supraclavicular lymphadenopathy in infection or malignancy context.",
        management: "Nodal findings can change HEENT/skin source localization, malignancy framing, imaging/biopsy urgency, and follow-up.",
        source: "SSC_SEPSIS_2026; MERCK_FEVER_ADULTS; AHRQ_CALIBRATE_DX"
      }
    ],
    conditional: [
      {
        pattern: /\b(?:posterior lung percussion|anterior lung percussion|lung percussion|fremitus)\b/,
        strength: 54,
        domain: "Respiratory Source Add-on",
        reason: "Adds consolidation or effusion characterization only after focal/asymmetric auscultation, pleural effusion, or complex pneumonia concern is present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:effusion|focal (?:crackles|rhonchi|decreased|diminished)|asymmetric|decreased breath|diminished breath|dullness|egophony|complicated pneumonia|empyema)\b/),
        diagnosticTarget: "Pulmonary source characterization: dullness, asymmetric percussion, fremitus change, or effusion/consolidation clue.",
        management: "Abnormal percussion or fremitus can support chest imaging review, pneumonia/effusion framing, respiratory support reassessment, and escalation when paired with symptoms and auscultation."
      }
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
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 58,
        domain: "Basic Safety",
        reason: "Screens fever, systemic illness, pain physiology, or injury severity before a site-specific MSK exam is interpreted.",
        diagnosticTarget: "MSK safety context: fever physiology, hemodynamic abnormality, tachycardia/tachypnea, or injury acuity that changes urgency.",
        management: "Abnormal bedside safety data can change septic arthritis concern, trauma escalation, imaging urgency, analgesia, and monitoring.",
        bedsideQuestion: "Any fever, trauma, inability to bear weight, rapidly worsening pain, swelling, redness, wound, or immunosuppression?",
        bedsideQuestionOptions: "No / Fever / Trauma / Cannot bear weight / Worsening pain / Swelling or redness / Wound / Immunosuppression / Other ___"
      },
      { pattern: /\b(?:shoulder inspection|shoulder palpation|shoulder flexion|shoulder extension|shoulder abduction|shoulder adduction|shoulder external rotation|shoulder internal rotation|empty can|hawkins)\b/, strength: 84, domain: "Shoulder", reason: "Localizes shoulder pain, ROM limitation, and rotator cuff/impingement concern.", when: /\b(?:shoulder|rotator cuff|abduction)\b/ },
      { pattern: /\b(?:knee inspection|knee palpation|knee flexion rom|knee extension rom|ballottement|anterior drawer|posterior drawer|patellar grind)\b/, strength: 84, domain: "Knee", reason: "Localizes knee swelling, pain, ROM loss, effusion, or instability.", when: /\b(?:knee|septic arthritis|unable to bear weight)\b/ },
      { pattern: /\b(?:hand inspection|hand joint palpation|finger flexion|finger extension|finger abduction|thumb opposition)\b/, strength: 82, domain: "Hand/Arthritis", reason: "Checks inflammatory hand joint pattern, swelling, tenderness, and functional ROM.", when: /\b(?:hand|mcp|pip|dip|swollen fingers|finger)\b/ },
      { pattern: /\b(?:ankle inspection|ankle palpation|ankle dorsiflexion rom|ankle plantarflexion rom|ankle inversion|ankle eversion)\b/, strength: 82, domain: "Ankle", reason: "Localizes ankle trauma, swelling, pain, and ROM limits.", when: /\b(?:ankle|sprain|twisting)\b/ }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-msk-focused-site-inspection",
        label: "Focused painful-site inspection",
        options: "Normal / Swelling / Deformity / Erythema / Wound / Unable",
        domain: "Focused MSK Basics",
        reason: "Every MSK workup needs an atomic inspection step for the symptomatic site before special tests are chosen.",
        diagnosticTarget: "Visible inflammation, deformity, wound, asymmetry, swelling, erythema, or trauma pattern at the symptomatic site.",
        management: "Visible deformity, wound, erythema, or marked swelling can change imaging, infection, trauma, immobilization, aspiration, or urgent referral decisions.",
        bedsideQuestion: "Which exact joint or body area hurts most, and was there trauma, fever, swelling, redness, wound, or inability to bear weight?",
        bedsideQuestionOptions: "Joint/site ___ / Trauma / Fever / Swelling / Redness / Wound / Cannot bear weight / Other ___",
        source: "SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
        evidenceTier: "Technique",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["musculoskeletal", "inspection", "site_specific"],
        satisfiedBy: /\b(?:focused painful-site inspection|shoulder inspection|knee inspection|hand inspection|ankle inspection)\b/
      },
      {
        exam_id: "GAP-msk-focused-site-palpation",
        label: "Focused painful-site palpation",
        options: "Nontender / Focal tenderness / Warmth / Effusion / Unable",
        domain: "Focused MSK Basics",
        reason: "Keeps palpation as a separate bedside action so tenderness, warmth, and effusion are not hidden inside a broad bundled MSK row.",
        diagnosticTarget: "Focal tenderness, warmth, effusion, bony tenderness, or soft-tissue tenderness at the symptomatic site.",
        management: "Focal bony tenderness, warmth, or effusion can change imaging threshold, septic/inflammatory arthritis concern, aspiration consideration, and activity restriction.",
        bedsideQuestion: "Where is the most tender point, and is there warmth, swelling, trauma, fever, or reduced function?",
        bedsideQuestionOptions: "Tender point ___ / Warmth / Swelling / Trauma / Fever / Reduced function / Other ___",
        source: "SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
        evidenceTier: "Technique",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["musculoskeletal", "palpation", "site_specific"],
        satisfiedBy: /\b(?:focused painful-site palpation|shoulder palpation|knee palpation|hand joint palpation|ankle palpation)\b/
      },
      {
        exam_id: "GAP-msk-focused-site-rom",
        label: "Focused painful-site range of motion",
        options: "Full / Limited active / Limited passive / Painful / Unable",
        domain: "Focused MSK Basics",
        reason: "Documents active/passive function as its own maneuver before selecting joint-specific provocative tests.",
        diagnosticTarget: "Active or passive range-of-motion limitation, painful arc, mechanical block, weakness-limited movement, or inability to bear/use the affected site.",
        management: "Loss of passive ROM, severe pain with movement, or inability to bear/use the site can change concern for septic arthritis, fracture, tendon injury, immobilization, imaging, or urgent evaluation.",
        bedsideQuestion: "Can you move and use the painful area normally, or is motion blocked, weak, severely painful, or impossible?",
        bedsideQuestionOptions: "Normal / Painful / Weak / Blocked / Cannot bear or use / Other ___",
        source: "SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
        evidenceTier: "Technique",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["musculoskeletal", "range_of_motion", "site_specific"],
        satisfiedBy: /\b(?:focused painful-site range of motion|shoulder flexion|shoulder abduction|knee flexion rom|knee extension rom|ankle dorsiflexion rom|ankle plantarflexion rom|finger flexion|finger extension)\b/
      }
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
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:thyroid|graves|heat intolerance|weight loss|palpitations|diarrhea|hyperthyroid|thyrotoxicosis|goiter|tremor)\b/),
        diagnosticTarget: "Thyroid enlargement, tenderness, nodularity, or asymmetry that supports endocrine framing.",
        management: "Abnormal thyroid findings can strengthen thyroid workup urgency and beta-blockade/endocrine escalation framing in context."
      },
      {
        pattern: /\b(?:heart sounds|radial pulses)\b/,
        strength: 54,
        domain: "Cardiac Add-on",
        reason: "Adds rhythm/perfusion clues when jitteriness includes palpitations, chest discomfort, syncope, or possible arrhythmia.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:palpitations|chest pain|chest discomfort|syncope|presyncope|arrhythmia|tachycardia)\b/),
        diagnosticTarget: "Irregular rhythm, murmur, or perfusion abnormality accompanying adrenergic symptoms.",
        management: "Abnormal cardiac/perfusion findings can change ECG/telemetry urgency and escalation."
      }
    ],
    conditional: [
      { pattern: /\b(?:pupils|pronator drift|facial symmetry|gait)\b/, strength: 48, domain: "Neuro Safety Add-on", reason: "Adds focused neurologic safety checks when confusion, focal symptoms, intoxication, or severe hypoglycemia is possible.", when: /\b(?:confusion|altered|seizure|focal|weakness|fall|intoxication|overdose|severe hypoglycemia)\b/ }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-hypoglycemia-mental-status",
        item_type: "safety_check",
        gap_type: "safety_check",
        label: "Document mental status",
        options: "Baseline / Anxious-jittery / Confused / Somnolent / Seizing / Unable",
        domain: "Neuroglycopenia Safety",
        reason: "Separates neuroglycopenic severity from generic adrenergic symptoms in hypoglycemia-like presentations.",
        diagnosticTarget: "Neuroglycopenia severity: confusion, somnolence, seizure, inability to cooperate, or unsafe self-treatment.",
        management: "Altered mental status or seizure changes urgency of immediate glucose treatment route, monitoring, supervision, and escalation.",
        bedsideQuestion: "Any confusion, sleepiness, seizure, trouble thinking, inability to eat/drink safely, or symptoms improving after carbohydrates?",
        bedsideQuestionOptions: "No / Confusion / Sleepy / Seizure / Cannot take PO / Improved after carbs / Other ___",
        source: "ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["hypoglycemia", "mental_status", "diagnostic_safety"],
        satisfiedBy: /\b(?:mental status|mental status assessment)\b/
      },
      {
        exam_id: "GAP-hypoglycemia-bedside-glucose",
        item_type: "safety_check",
        gap_type: "safety_check",
        label: "Measure bedside glucose",
        options: "___ mg/dL / Low / Normal / High / Not available",
        domain: "Immediate Glucose Check",
        reason: "Makes the immediately management-changing bedside glucose value explicit rather than relying on nonspecific endocrine exam findings.",
        diagnosticTarget: "Current blood glucose result in a patient with jittery, sweaty, tremulous, confused, or hypoglycemia-like symptoms.",
        management: "A low value changes immediate carbohydrate/dextrose/glucagon treatment, monitoring interval, medication hold decisions, and reassessment after treatment.",
        bedsideQuestion: "What was the most recent glucose value, timing of last insulin/secretagogue, last meal, and response to carbohydrates?",
        bedsideQuestionOptions: "Value ___ / Insulin or sulfonylurea / Missed meal / Alcohol / Exercise / Improved after carbs / Other ___",
        source: "ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "glucometer or recent point-of-care value",
        patient_cooperation_required: "low",
        matchedTags: ["hypoglycemia", "glucose", "point_of_care", "diagnostic_safety"],
        satisfiedBy: /\bbedside glucose safety check\b/
      },
      {
        exam_id: "GAP-hypoglycemia-diaphoresis-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Diaphoresis inspection",
        options: "Absent / Present / Clammy / Unable",
        domain: "Adrenergic Signs",
        reason: "Adds an atomic bedside exam for adrenergic physiology in hypoglycemia-like presentations without promoting a broad thyroid or cardiac exam.",
        diagnosticTarget: "Adrenergic hypoglycemia clue: diaphoresis, clamminess, or visible autonomic activation.",
        management: "Visible diaphoresis with low or unknown glucose supports immediate glucose treatment/recheck, medication hold review, monitoring, and reassessment after carbohydrates.",
        bedsideQuestion: "Any sweating, shaking, hunger, palpitations, confusion, missed meal, insulin or sulfonylurea use, or improvement after carbohydrates?",
        bedsideQuestionOptions: "No / Sweating / Shaking / Hunger / Palpitations / Confusion / Insulin or sulfonylurea / Improved after carbs / Other ___",
        source: "ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["hypoglycemia", "diaphoresis", "adrenergic", "diagnostic_safety"],
        satisfiedBy: /\bdiaphoresis inspection\b/
      },
      {
        exam_id: "GAP-hypoglycemia-tremor-observation",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Tremor observation",
        options: "Absent / Fine tremor / Coarse tremor / Unable",
        domain: "Adrenergic Signs",
        reason: "Adds an atomic observation for adrenergic tremor while keeping thyroid-specific tremor assessment conditional on thyroid features.",
        diagnosticTarget: "Adrenergic hypoglycemia clue: visible tremor or shakiness during symptoms.",
        management: "Tremor with low or unknown glucose supports immediate glucose check/treatment, medication review, and symptom reassessment after carbohydrates.",
        bedsideQuestion: "Any shakiness, sweating, hunger, palpitations, missed meal, insulin or sulfonylurea use, or response to carbohydrates?",
        bedsideQuestionOptions: "No / Shakiness / Sweating / Hunger / Palpitations / Insulin or sulfonylurea / Improved after carbs / Other ___",
        source: "ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["hypoglycemia", "tremor", "adrenergic", "diagnostic_safety"],
        satisfiedBy: /\btremor observation\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:jvp|pmi|lower extremity edema|carotids|radial pulses)\b/, unless: /\b(?:heart failure|volume overload|syncope|presyncope|vascular|bruit|chest pain|dyspnea|palpitations|arrhythmia|shock|hypotension)\b/, reason: "Adrenergic/jittery presentations need volume/perfusion add-ons only with cardiopulmonary, syncope, shock, arrhythmia, or vascular context." },
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|psoas|obturator|cva tenderness)\b/, unless: /\b(?:abdominal|vomit|diarrhea|flank|urinary|dka|hhs|adrenal)\b/, reason: "Adrenergic/jittery presentations do not need abdominal/GU maneuvers without GI, GU, or endocrine-crisis context." },
      { pattern: /\b(?:visual acuity|visual fields|ophthalmoscopic|vibration sense|proprioception|finger to nose|heel to shin|pronator drift|facial symmetry|pupils)\b/, unless: /\b(?:vision|ataxia|neuropathy|focal|seizure|confusion|altered|weakness)\b/, reason: "Broad neuro/eye maneuvers need neurologic, visual, sensory, or severe hypoglycemia context." }
    ]
  },
  {
    id: "pregnancy_diabetes_context",
    name: "Pregnancy-specific diabetes context",
    context: /\b__pregnancy_diabetes_primary_output_add_on__\b/,
    requiredItems: [
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-gestational-age-history",
        type: "history_question",
        label: "Pregnancy diabetes gestational-age history",
        options: "Not documented / Gestational age known / Dating uncertain / Fetal growth concern / Polyhydramnios / MFM or OB plan available / Other ___",
        domain: "Pregnancy Diabetes History",
        role: "conditional",
        reason: "Active pregnancy changes diabetes screening timing, glucose interpretation, medication safety, maternal-fetal monitoring, and postpartum follow-up.",
        diagnosticTarget: "Pregnancy-specific diabetes context: gestational age, pregnancy dating reliability, fetal growth or polyhydramnios concern, and obstetric-care plan.",
        management: "Gestational age or dating uncertainty changes whether early risk testing, 24-28 week OGTT strategy, home glucose monitoring, medication safety review, fetal surveillance, or postpartum follow-up is the next management step.",
        bedsideQuestion: "How many weeks pregnant are you, and has pregnancy dating, fetal growth, or obstetric context changed diabetes screening or treatment safety?",
        bedsideQuestionOptions: "Not documented / Gestational age known / Dating uncertain / Fetal growth concern / Polyhydramnios / MFM or OB plan available / Other ___",
        source: "ADA_SOC_2026; ADA_DIAGNOSIS_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; ADA diagnosis and classification guidance; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "history_question", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes gestational-age history|gestational age|pregnancy dating|fetal growth|polyhydramnios|obstetric context)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-risk-history",
        type: "history_question",
        label: "Pregnancy diabetes preexisting-risk history",
        options: "No / Prior GDM / Prior macrosomia / Pre-pregnancy diabetes / Prior A1c or glucose abnormality / PCOS / Obesity / Steroid exposure / Strong family history / Other ___",
        domain: "Pregnancy Diabetes History",
        role: "conditional",
        reason: "Preexisting diabetes risk and prior gestational diabetes history change classification, risk stratification, and follow-up intensity when diabetes care overlaps active pregnancy.",
        diagnosticTarget: "Pregnancy diabetes risk context: prior gestational diabetes, macrosomia, pre-pregnancy diabetes, prior abnormal A1c or glucose, PCOS, obesity, steroid exposure, or strong family history.",
        management: "A positive risk history changes early testing threshold, classification as overt diabetes versus GDM, nutrition and glucose-monitoring intensity, maternal-fetal medicine involvement, and postpartum prevention follow-up.",
        bedsideQuestion: "Any prior gestational diabetes, macrosomia, pre-pregnancy diabetes, prior A1c or glucose abnormality, PCOS, obesity, steroid exposure, or strong family history?",
        bedsideQuestionOptions: "No / Prior GDM / Prior macrosomia / Pre-pregnancy diabetes / Prior abnormal A1c-glucose / PCOS / Obesity / Steroid exposure / Strong family history / Other ___",
        source: "ADA_SOC_2026; ADA_DIAGNOSIS_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; ADA diagnosis and classification guidance; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "risk_factor", "history_question", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes preexisting-risk history|prior gestational diabetes|prior gdm|macrosomia|pre-pregnancy diabetes|pcos|steroid exposure|family history)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-fetal-obstetric-history",
        type: "history_question",
        label: "Pregnancy diabetes fetal-obstetric plan history",
        options: "No fetal concern documented / Fetal growth concern / Polyhydramnios / Ultrasound concern / Fetal surveillance planned / Delivery timing plan known / MFM involved / Other ___",
        domain: "Pregnancy Diabetes History",
        role: "conditional",
        reason: "Fetal growth, ultrasound context, and the obstetric plan determine whether diabetes findings should trigger maternal-fetal surveillance or care coordination.",
        diagnosticTarget: "Pregnancy diabetes obstetric context: fetal growth, estimated fetal weight, amniotic fluid, ultrasound concern, fetal surveillance plan, delivery timing, and MFM involvement.",
        management: "Fetal growth or obstetric-plan concerns change maternal-fetal monitoring, nutrition and medication escalation, care-team coordination, delivery planning, and postpartum follow-up.",
        bedsideQuestion: "Have fetal growth, estimated fetal weight, amniotic fluid, ultrasound findings, fetal surveillance, delivery timing, or maternal-fetal medicine involvement changed the diabetes plan?",
        bedsideQuestionOptions: "No fetal concern documented / Fetal growth concern / Polyhydramnios / Ultrasound concern / Fetal surveillance planned / Delivery timing known / MFM involved / Other ___",
        source: "ADA_SOC_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "chart review",
        patient_cooperation_required: "low",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "fetal_surveillance", "history_question", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes fetal-obstetric plan history|fetal surveillance|delivery timing|maternal-fetal medicine|estimated fetal weight|amniotic fluid|ultrasound)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-ogtt-thresholds",
        type: "diagnostic_test",
        label: "Pregnancy diabetes OGTT threshold pathway",
        options: "Early risk testing if high risk / 24-28 week one-step 75-g OGTT / Local two-step strategy / One-step GDM threshold fasting >=92 mg/dL / 1-hour >=180 mg/dL / 2-hour >=153 mg/dL / Two-step 50-g screen often >=130-140 mg/dL / 100-g Carpenter-Coustan fasting 95, 1-hour 180, 2-hour 155, 3-hour 140 mg/dL / Usually 2 abnormal 100-g values / Other ___",
        domain: "Tests / Pregnancy Diabetes",
        role: "conditional",
        reason: "Pregnancy changes diabetes diagnostic thresholds, screening timing, and interpretation of glucose and A1c results.",
        diagnosticTarget: "Pregnancy diabetes test pathway: early risk testing when high risk and gestational-age-appropriate one-step or two-step OGTT interpretation.",
        management: "Crossing OGTT thresholds changes maternal-fetal monitoring, nutrition therapy, glucose-monitoring intensity, medication escalation, delivery planning, and postpartum follow-up.",
        source: "ADA_SOC_2026; ADA_DIAGNOSIS_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; ADA diagnosis and classification guidance; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "lab order/result review",
        patient_cooperation_required: "moderate",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "ogtt", "diagnostic_test", "reference_threshold", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes ogtt threshold pathway|75-g ogtt|one-step|two-step|fasting\s*>?=?92|1-hour\s*>?=?180|2-hour\s*>?=?153|carpenter-coustan|postpartum ogtt)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-safety-tests",
        type: "diagnostic_test",
        label: "Pregnancy diabetes safety-test pathway",
        options: "Review home glucose pattern / Ketones for vomiting, dehydration, severe hyperglycemia, or insulin-deficiency symptoms / Electrolytes and anion gap / Creatinine / Acid-base status / Blood pressure and urine protein context when preeclampsia features present / Other ___",
        domain: "Tests / Pregnancy Diabetes",
        role: "conditional",
        reason: "Active pregnancy lowers tolerance for missed ketosis, dehydration, severe hyperglycemia, and hypertensive disease in a diabetes workup.",
        diagnosticTarget: "Pregnancy diabetes safety testing: glucose pattern, ketones, electrolytes/anion gap, creatinine, acid-base status, and hypertensive/preeclampsia context when symptomatic.",
        management: "Ketones, acidosis, renal dysfunction, severe hyperglycemia, or preeclampsia features change urgency to obstetric/endocrine evaluation, monitored care, medication adjustment, and maternal-fetal surveillance.",
        source: "ADA_SOC_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "lab order/result review",
        patient_cooperation_required: "low",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "ketones", "preeclampsia", "diagnostic_test", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes safety-test pathway|ketones|anion gap|acid-base|preeclampsia|home glucose pattern)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-urgent-cues",
        type: "red_flag",
        label: "Pregnancy diabetes urgent cues",
        options: "Ketones / Vomiting or dehydration / Severe hyperglycemia / Altered mental status / Acidosis or anion gap concern / Hypertension or preeclampsia features / Reduced fetal movement / Hemodynamic instability / Other ___",
        domain: "Red Flags / Pregnancy Diabetes",
        role: "conditional",
        reason: "Diabetes plus active pregnancy needs explicit escalation cues because ketosis, severe hyperglycemia, hypertensive disease, and fetal-movement concerns can change disposition quickly.",
        diagnosticTarget: "Urgent pregnancy diabetes danger pattern: ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, acidosis, hypertensive/preeclampsia features, reduced fetal movement, or instability.",
        management: "These cues change disposition to urgent obstetric/endocrine evaluation, monitored care, DKA/HHS rule-out, fetal assessment, blood-pressure/proteinuria assessment, and medication safety review.",
        source: "ADA_SOC_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "red_flag", "ketones", "preeclampsia", "fetal_movement", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes urgent cues|ketones|reduced fetal movement|preeclampsia|severe hyperglycemia|altered mental status)\b/
      }),
      bundleFloorItem({
        exam_id: "REQ-diabetes-pregnancy-postpartum-follow-up",
        type: "management_change",
        label: "Pregnancy diabetes postpartum follow-up plan",
        options: "Postpartum 75-g OGTT at 4-12 weeks / Long-term diabetes prevention / Primary care or endocrine follow-up / Breastfeeding and medication safety review when relevant / Not applicable because still pregnant and immediate obstetric plan pending / Other ___",
        domain: "Management / Pregnancy Diabetes",
        role: "conditional",
        reason: "Pregnancy-associated dysglycemia changes follow-up even after delivery, so postpartum testing and prevention cannot be buried in generic diabetes counseling.",
        diagnosticTarget: "Postpartum diabetes risk and prevention pathway after pregnancy-associated dysglycemia or diabetes care during pregnancy.",
        management: "A postpartum 75-g OGTT at 4-12 weeks and long-term prevention plan change follow-up timing, counseling, medication safety review, and handoff to primary care or endocrinology.",
        source: "ADA_SOC_2026; AHRQ_CALIBRATE_DX",
        source_citation: "ADA Standards of Care in Diabetes-2026; AHRQ Calibrate Dx",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "follow-up plan",
        patient_cooperation_required: "low",
        matchedTags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "postpartum", "management_change", "primary_output_diff"],
        satisfiedBy: /\b(?:pregnancy diabetes postpartum follow-up plan|postpartum 75-g ogtt|4-12 weeks|long-term prevention)\b/
      })
    ],
    suppress: []
  },
  {
    id: "diabetes_foot_neuropathy",
    name: "Diabetes foot, neuropathy, wound, or discharge-risk exam",
    context: /\b(?:neuropathy|numb feet|burning toes|foot ulcer|diabetic foot|diabetes foot|foot wound|non healing foot|poor perfusion|discharge planning|protective sensation)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate)\b/, strength: 58, domain: "Vitals", reason: "Adds basic hemodynamic context for inpatient diabetes, infection, wound, or discharge-risk assessment." },
      { pattern: /\b(?:dorsalis pedis|posterior tibial)\b/, strength: 82, domain: "Foot/Vascular", reason: "Assesses pedal perfusion relevant to foot ulcer, wound healing, and vascular risk." },
      { pattern: /\b(?:extremity light touch|extremity pinprick|vibration sense|proprioception)\b/, strength: 78, domain: "Neuropathy", reason: "Checks sensory neuropathy and protective sensation risk." },
      { pattern: /\b(?:ankle dorsiflexion|ankle plantarflexion|toe walking|heel walking)\b/, strength: 52, domain: "Foot Motor/Function", reason: "Adds functional foot/ankle assessment when neuropathy, foot drop, or discharge safety matters.", when: /\b(?:neuropathy|foot drop|weakness|discharge|ulcer|wound|foot)\b/ }
    ],
    conditional: [
      {
        pattern: /\bfemoral pulses\b/,
        strength: 48,
        domain: "PAD/Vascular Add-on",
        reason: "Adds proximal pulse assessment only when PAD, claudication, rest pain, limb ischemia, prior vascular intervention, or abnormal pedal pulses are present.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:pad|peripheral artery|peripheral arterial|claudication|rest pain|limb ischemia|cold foot|dusky foot|gangrene|absent pulse|absent pedal|decreased pedal|weak pedal|prior angioplasty|vascular surgery|revascularization)\b/),
        diagnosticTarget: "PAD severity or proximal inflow clue: diminished femoral pulse when symptoms or distal pulse abnormalities suggest arterial disease.",
        management: "Abnormal femoral pulse with PAD features can change ABI/toe-pressure ordering, vascular referral urgency, wound-healing risk, and limb-ischemia escalation."
      }
    ],
    suppress: [
      { pattern: /\b(?:visual acuity|visual fields|ophthalmoscopic|extraocular|pupils)\b/, unless: /\b(?:vision|blurry|eye|diplopia|headache|retinopathy)\b/, reason: "Eye maneuvers need visual symptoms or eye/retinopathy context in diabetes foot/neuropathy presentations." },
      { pattern: /\bfemoral pulses\b/, unless: /\b(?:pad|peripheral artery|peripheral arterial|claudication|rest pain|limb ischemia|cold foot|dusky foot|gangrene|absent pulse|absent pedal|decreased pedal|weak pedal|prior angioplasty|vascular surgery|revascularization)\b/, reason: "Femoral pulses are not a routine diabetes foot core item; check pedal pulses first and reserve proximal pulses for PAD, ischemia, prior vascular intervention, or abnormal pedal-pulse context." },
      { pattern: /\b(?:murphy|rebound|psoas|obturator|cva tenderness|abdominal palpation)\b/, unless: /\b(?:abdominal|flank|urinary|vomit|dka|hhs)\b/, reason: "Abdominal/GU maneuvers need abdominal, urinary, flank, or hyperglycemic-crisis context." }
    ]
  },
  {
    id: "routine_thyroid",
    name: "Routine thyroid disease evaluation",
    context: /\b(?:routine thyroid|thyroid disease|hypothyroidism|hyperthyroidism|thyrotoxicosis|graves|hashimoto|goiter|thyroid nodule|thyroid cancer|thyroid mass|abnormal tsh|heat intolerance|cold intolerance|palpitations with thyroid)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate)\b/,
        strength: 78,
        domain: "Vitals",
        reason: "Checks bradycardia, tachycardia, rhythm regularity, and BP patterns that change thyroid-disease severity framing.",
        diagnosticTarget: "Thyroid physiology at bedside: bradycardia, tachycardia, irregular pulse, systolic hypertension, hypotension, or unstable vital signs.",
        management: "Abnormal HR/BP can change ECG/telemetry urgency, beta-blocker consideration, crisis screening, or need for urgent endocrine/cardiac escalation.",
        bedsideQuestion: "Any palpitations, tremor, heat intolerance, cold intolerance, or clear weight change?",
        bedsideQuestionOptions: "No / Palpitations / Tremor / Heat intolerance / Cold intolerance / Weight change / Other ___"
      },
      {
        pattern: /\b(?:thyroid exam)\b/,
        strength: 92,
        domain: "Thyroid/Neck",
        reason: "Directly evaluates goiter, nodules, tenderness, asymmetry, and compressive neck findings in thyroid disease.",
        diagnosticTarget: "Thyroid/neck finding: diffuse goiter, nodularity, tenderness, asymmetry, fixation, or compressive clue.",
        management: "Nodule, tenderness, asymmetry, goiter, or compressive findings can change ultrasound, antibody/uptake workup, FNA pathway, or airway/ENT urgency.",
        bedsideQuestion: "Any neck swelling, rapid growth, thyroid pain, hoarseness, dysphagia, or positional dyspnea?",
        bedsideQuestionOptions: "No / Neck swelling / Rapid growth / Thyroid pain / Hoarseness / Dysphagia / Positional dyspnea / Other ___"
      },
      {
        pattern: /\b(?:heart sounds|radial pulses)\b/,
        strength: 66,
        domain: "Cardiac Rhythm/Perfusion",
        reason: "Adds rhythm and cardiac complication assessment when hyperthyroid symptoms, Graves disease, palpitations, tachycardia, or dyspnea are present.",
        when: /\b(?:graves disease|graves|thyrotoxicosis|hyperthyroidism|palpitations|tachycardia|atrial fibrillation|afib|heat intolerance|tremor|dyspnea|chest pain)\b/,
        diagnosticTarget: "Hyperthyroid cardiac clue: irregular rhythm, marked tachycardia, murmur/gallop, or poor perfusion.",
        management: "Irregular rhythm, marked tachycardia, or decompensation changes ECG/telemetry urgency, beta-blocker risk/benefit, and escalation."
      }
    ],
    conditional: [
      {
        pattern: /\b(?:pupils|extraocular|visual acuity|visual fields)\b/,
        strength: 60,
        domain: "Graves Orbitopathy/Vision",
        reason: "Adds eye movement, pupil, and visual-function checks when Graves disease, orbitopathy, diplopia, eye pain, or vision change is present.",
        when: /\b(?:graves disease|graves|orbitopathy|thyroid eye|diplopia|vision|visual|eye pain|proptosis|lid lag)\b/,
        diagnosticTarget: "Orbitopathy or neuro-ophthalmic concern: diplopia, EOM restriction, visual loss, afferent defect, or field deficit.",
        management: "Vision-threatening features change ophthalmology urgency, steroid/teprotumumab/radioiodine risk discussion, and imaging/escalation."
      },
      {
        pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes)\b/,
        strength: 58,
        domain: "Cervical Nodes",
        reason: "Adds focused nodal assessment when thyroid nodule, thyroid cancer, neck mass, hoarseness, dysphagia, radiation, or MEN2 risk is present.",
        when: /\b(?:thyroid nodule|thyroid cancer|thyroid mass|neck mass|malignancy|cancer|lymph|node|adenopathy|hoarseness|dysphagia|radiation|men2|medullary)\b/,
        diagnosticTarget: "Thyroid cancer risk clue: suspicious cervical or supraclavicular adenopathy.",
        management: "Suspicious nodes change ultrasound/nodal mapping, FNA planning, ENT/endocrine referral urgency, and surgical pathway."
      },
      {
        pattern: /\b(?:lower extremity edema)\b/,
        strength: 44,
        domain: "Hypothyroid/Cardiac Add-on",
        reason: "Adds edema assessment when hypothyroidism includes myxedema, dyspnea, heart failure, renal disease, or visible swelling.",
        when: /\b(?:hypothyroidism|myxedema|edema|swelling|heart failure|dyspnea|renal|kidney)\b/,
        diagnosticTarget: "Hypothyroid/cardiac volume clue: edema or myxedematous swelling.",
        management: "Edema with bradycardia, dyspnea, or severe hypothyroidism can change myxedema/cardiac evaluation and urgency."
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-routine-thyroid-skin-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Skin inspection for thyroid phenotype",
        options: "Normal / Warm moist skin / Dry coarse skin / Unable",
        domain: "Thyroid Phenotype",
        reason: "Adds an atomic skin inspection phenotype check not yet represented in the base catalog for hypo- or hyperthyroid presentations.",
        diagnosticTarget: "Thyroid phenotype clue: warm moist skin in thyrotoxicosis or dry coarse skin in hypothyroidism.",
        management: "Marked skin phenotype findings strengthen severity assessment and can change urgency of thyroid labs, crisis screen, or treatment discussion.",
        bedsideQuestion: "Any heat intolerance, sweating, cold intolerance, or dry/coarse skin change?",
        bedsideQuestionOptions: "No / Heat intolerance / Sweating / Cold intolerance / Dry or coarse skin / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["thyroid_disease", "routine_thyroid"],
        when: /\b(?:routine thyroid|thyroid disease|thyroid evaluation|abnormal tsh|hypothyroidism|hyperthyroidism|thyrotoxicosis|graves|hashimoto|heat intolerance|cold intolerance|constipation|dry skin|sweating)\b/,
        satisfiedBy: /\bskin inspection for thyroid phenotype\b/
      },
      {
        exam_id: "GAP-routine-thyroid-hair-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Hair thinning inspection",
        options: "Normal / Thinning or coarse hair / Patchy loss / Unable",
        domain: "Thyroid Phenotype",
        reason: "Adds an atomic hair phenotype check for chronic thyroid dysfunction when hair loss or hypothyroid features are part of the presentation.",
        diagnosticTarget: "Thyroid phenotype clue: diffuse thinning or coarse brittle hair that supports chronic thyroid dysfunction in context.",
        management: "Hair phenotype findings support chronicity framing and can change counseling, lab follow-up, and differential review when thyroid symptoms are present.",
        bedsideQuestion: "Any new diffuse hair thinning, brittle hair, cold intolerance, constipation, dry skin, or fatigue?",
        bedsideQuestionOptions: "No / Hair thinning / Brittle hair / Cold intolerance / Constipation / Dry skin / Fatigue / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["thyroid_disease", "routine_thyroid", "hair_loss"],
        when: /\b(?:hypothyroidism|hashimoto|cold intolerance|constipation|dry skin|hair|alopecia|hair thinning)\b/,
        satisfiedBy: /\bhair thinning inspection\b/
      },
      {
        exam_id: "GAP-routine-thyroid-tremor-assessment",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Outstretched-hands tremor",
        options: "Absent / Fine tremor / Coarse tremor / Unable",
        domain: "Thyroid Phenotype",
        reason: "Adds an atomic tremor check for adrenergic hyperthyroid or thyrotoxic features.",
        diagnosticTarget: "Thyrotoxicosis phenotype clue: fine tremor with outstretched hands.",
        management: "Fine tremor supports adrenergic thyrotoxicosis and can change beta-blocker discussion, ECG threshold, and thyroid-severity framing.",
        bedsideQuestion: "Any tremor, palpitations, heat intolerance, sweating, anxiety, insomnia, diarrhea, or weight loss?",
        bedsideQuestionOptions: "No / Tremor / Palpitations / Heat or sweating / Anxiety or insomnia / Diarrhea / Weight loss / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["thyroid_disease", "routine_thyroid", "tremor", "adrenergic"],
        when: /\b(?:hyperthyroidism|thyrotoxicosis|graves|heat intolerance|palpitations|tachycardia|tremor|sweating)\b/,
        satisfiedBy: /\b(?:outstretched-hands tremor|outstretched-hands tremor assessment|tremor with outstretched hands)\b/
      },
      {
        exam_id: "GAP-routine-thyroid-reflex-relaxation",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Deep tendon reflex relaxation",
        options: "Normal relaxation / Delayed relaxation / Brisk / Unable",
        domain: "Thyroid Phenotype",
        reason: "Adds an atomic reflex-relaxation assessment for hypothyroid or hyperthyroid phenotype when neuromuscular signs matter.",
        diagnosticTarget: "Thyroid phenotype clue: delayed relaxation in hypothyroidism or brisk reflexes in thyrotoxicosis.",
        management: "Abnormal reflex relaxation strengthens thyroid-severity framing and can change urgency of thyroid labs, medication review, or crisis screen.",
        bedsideQuestion: "Any slowed thinking, cold intolerance, constipation, dry skin, fatigue, tremor, or heat intolerance?",
        bedsideQuestionOptions: "No / Slowed thinking / Cold intolerance / Constipation / Dry skin / Fatigue / Tremor or heat intolerance / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; SM25",
        evidenceTier: "Guideline",
        difficulty: "moderate",
        time_burden_minutes: "1",
        equipment_needed: "reflex hammer",
        patient_cooperation_required: "moderate",
        matchedTags: ["thyroid_disease", "routine_thyroid", "reflexes"],
        when: /\b(?:hypothyroidism|hyperthyroidism|thyrotoxicosis|graves|hashimoto|cold intolerance|tremor|slowed thinking|constipation)\b/,
        satisfiedBy: /\b(?:deep tendon reflex relaxation|delayed reflex relaxation)\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:jvp|pmi|apical impulse|lower extremity edema)\b/, unless: /\b(?:heart failure|volume overload|orthopnea|pnd|edema|swelling|myxedema|dyspnea|cardiomyopathy|shock|hypotension)\b/, reason: "Routine thyroid disease does not need JVP, PMI, or edema checks unless there is volume overload, heart failure, dyspnea, myxedema, or shock context." },
      { pattern: /\b(?:preauricular nodes|posterior auricular nodes|occipital nodes|tonsillar nodes|submandibular nodes|submental nodes)\b/, unless: /\b(?:infection|sore throat|lymph|adenopathy|neck mass|malignancy|cancer)\b/, reason: "Routine thyroid evaluation uses thyroid/neck exam; broad lymph-node survey needs infection, malignancy, or neck-mass context." },
      { pattern: /\b(?:abdominal palpation|bowel sounds|murphy|rebound|psoas|obturator|cva tenderness)\b/, unless: /\b(?:abdominal|vomit|diarrhea|constipation|flank|urinary|adrenal|hypercalcemia)\b/, reason: "Routine thyroid disease does not need abdominal/GU maneuvers without GI, GU, adrenal, or calcium-related symptoms." },
      { pattern: /\b(?:pronator drift|gait|vibration sense|proprioception|babinski|finger to nose|heel to shin)\b/, unless: /\b(?:weakness|numbness|tingling|ataxia|gait|confusion|myxedema|stroke|neuropathy)\b/, reason: "Routine thyroid evaluation should not promote broad neuro testing unless neurologic symptoms, myxedema concern, stroke, or neuropathy context exists." }
    ]
  },
  {
    id: "thyroid_endocrine",
    name: "Thyroid storm or myxedema coma concern",
    context: /\b(?:thyroid storm|thyrotoxicosis|graves|myxedema|hypothyroid|hyperthyroid|thyroid|goiter|bradycardia|hyperthermia|hypothermia|palpitations)\b/,
    core: [
      { pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/, strength: 84, domain: "Vitals", reason: "Assesses cardiovascular and respiratory severity in thyroid emergencies." },
      { pattern: /\b(?:thyroid exam|heart sounds|jvp|lower extremity edema)\b/, strength: 82, domain: "Thyroid/Cardiac", reason: "Links neck and cardiovascular findings to thyroid severity and escalation." },
      { pattern: /\b(?:pupils|gait|pronator drift)\b/, strength: 52, domain: "Neuro", reason: "Adds focused neuro safety checks when mental status, weakness, or myxedema/storm concern exists.", when: /\b(?:confusion|somnolence|agitation|weakness|myxedema|storm)\b/ }
    ],
    requiredItems: [
      {
        exam_id: "SAFETY-thyroid-crisis-temperature",
        item_type: "safety_check",
        label: "Measure temperature",
        options: "___ C/F / Hyperthermia / Hypothermia / Not available",
        domain: "Basic Safety",
        role: "core",
        reason: "Temperature is required in suspected thyroid storm or myxedema coma because fever or hypothermia changes crisis severity and escalation.",
        diagnosticTarget: "Thyroid emergency severity: hyperthermia, hypothermia, or unstable temperature trend.",
        management: "Marked fever supports thyroid-storm severity and infection search; hypothermia supports myxedema-coma severity and warming/ICU-level monitoring.",
        source: "ATA_HYPERTHYROIDISM_2016; JTA_JES_THYROID_STORM_2016; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "thermometer",
        patient_cooperation_required: "low",
        matchedTags: ["thyroid_storm", "myxedema", "temperature", "vitals", "diagnostic_safety"],
        satisfiedBy: /\btemperature\b/
      },
      {
        exam_id: "EXAM-071-thyroid-exam",
        label: "Thyroid exam",
        options: "Normal / Enlarged / Nodule / Tender / Asymmetric / Unable",
        domain: "Thyroid/Neck",
        role: "core",
        reason: "Directly documents goiter, tenderness, nodularity, or neck mass findings in suspected thyroid emergency.",
        diagnosticTarget: "Thyroid/neck clue: goiter, tenderness, nodularity, asymmetry, fixation, or compressive finding.",
        management: "Goiter, tenderness, or nodules can change Graves/toxic nodular/subacute thyroiditis framing, imaging/uptake discussion, airway concern, and endocrine escalation.",
        bedsideQuestion: "Any neck swelling, pain, hoarseness, dysphagia, recent iodine exposure, antithyroid medication change, or thyroid hormone change?",
        bedsideQuestionOptions: "No / Neck swelling / Neck pain / Hoarseness / Dysphagia / Iodine exposure / Medication change / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; SM25",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "2",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: ["thyroid_disease", "thyroid_exam", "thyroid_storm", "myxedema"],
        satisfiedBy: /\bthyroid exam\b/
      }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-thyroid-crisis-mental-status",
        item_type: "safety_check",
        gap_type: "safety_check",
        label: "Document mental status",
        options: "Baseline / Agitated / Confused / Somnolent / Comatose / Unable",
        domain: "Mental Status",
        reason: "Checks thyroid-storm or myxedema-coma severity that changes escalation and treatment urgency.",
        diagnosticTarget: "Thyroid emergency severity: agitation, delirium, somnolence, coma, or inability to participate in care.",
        management: "Altered mental status supports crisis severity, ICU-level monitoring, airway/temperature strategy, and urgent endocrine escalation.",
        bedsideQuestion: "Any new confusion, agitation, unusual sleepiness, or trouble staying awake?",
        bedsideQuestionOptions: "No / Agitation / Confusion / Sleepiness / Trouble staying awake / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; JTA_JES_THYROID_STORM_2016",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        matchedTags: ["thyroid_storm", "myxedema", "mental_status"],
        satisfiedBy: /\b(?:mental status|mental status assessment|alert and oriented)\b/
      },
      {
        exam_id: "GAP-routine-thyroid-skin-inspection",
        item_type: "exam_maneuver",
        gap_type: "exam_maneuver",
        label: "Skin inspection for thyroid phenotype",
        options: "Normal / Warm moist skin / Dry coarse skin / Unable",
        domain: "Thyroid Phenotype",
        reason: "Adds a thyroid-specific skin phenotype check without reusing the broad dermatology morphology row.",
        diagnosticTarget: "Thyroid emergency phenotype clue: warm moist skin in thyrotoxicosis or dry coarse skin in myxedema/severe hypothyroidism.",
        management: "Marked warm-moist or dry-coarse skin phenotype strengthens thyroid-crisis severity framing and can change urgency of thyroid labs, temperature strategy, and endocrine escalation.",
        bedsideQuestion: "Any heat intolerance, sweating, cold intolerance, dry skin, constipation, tremor, or slowed thinking?",
        bedsideQuestionOptions: "No / Heat or sweating / Cold intolerance / Dry skin / Constipation / Tremor / Slowed thinking / Other ___",
        source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["thyroid_disease", "thyroid_storm", "myxedema", "thyroid_phenotype"],
        satisfiedBy: /\bskin inspection for thyroid phenotype\b/
      }
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
    context: /\b(?:eye redness|eye discharge|red eye|ocular|vision change|blurry vision|diplopia|eye pain|visual loss)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate|respiratory rate)\b/,
        strength: 56,
        domain: "Basic Safety",
        reason: "Keeps systemic infection, orbital-danger, severe pain, and neurologic acuity separate from the eye-specific exam.",
        diagnosticTarget: "Eye/vision safety context: unstable vitals, fever physiology, tachycardia/tachypnea, or acuity that changes escalation.",
        management: "Abnormal bedside safety data can change ED/ophthalmology escalation, infection review, imaging urgency, and monitoring.",
        bedsideQuestion: "Any vision loss, severe eye pain, photophobia, trauma, contact lens use, headache, fever, or neurologic symptom?",
        bedsideQuestionOptions: "No / Vision loss / Severe pain / Photophobia / Trauma / Contact lens use / Headache / Fever / Neuro symptom / Other ___"
      },
      { pattern: /\b(?:visual acuity|pupils|extraocular|visual fields|sclerae and conjunctivae|ophthalmoscopic)\b/, strength: 86, domain: "Eye/Cranial Nerves", reason: "Focuses the bedside exam on visual function, pupils, eye movement, and visible ocular inflammation." }
    ],
    suppress: [
      { pattern: /\b(?:posterior lung sounds|bowel sounds|cva tenderness|murphy|rebound|psoas|obturator)\b/, unless: /\b(?:fever|sepsis|dyspnea|cough|abdominal|flank|urinary)\b/, reason: "Not eye-focused without systemic, respiratory, abdominal, or GU triggers." }
    ]
  },
  {
    id: "dermatology",
    name: "Rash, wound, or dermatologic concern",
    context: /\b(?:rash|skin lesions?|moles?|urticaria|hives|pruritus|itching|ulcer|wound|alopecia|hair loss|dry skin|non healing|pruritus ani|perianal itching)\b/,
    core: [
      {
        pattern: /\b(?:blood pressure|heart rate)\b/,
        strength: 54,
        domain: "Basic Safety",
        reason: "Keeps routine bedside safety data separate from the skin exam while screening systemic illness, medication reaction, allergic physiology, or infection severity.",
        diagnosticTarget: "Dermatology safety context: hemodynamic abnormality, tachycardia, fever physiology by association, or systemic toxicity clue.",
        management: "Abnormal bedside safety data can change urgency of allergy/infection workup, medication-stop decisions, ED escalation, sepsis screen, or dermatology consultation timing.",
        bedsideQuestion: "Any fever, rapid spread, skin pain, mucosal involvement, new medication, breathing trouble, swelling of lips/tongue, or systemic symptoms?",
        bedsideQuestionOptions: "No / Fever / Rapid spread / Skin pain / Mucosal involvement / New medication / Breathing trouble / Lip-tongue swelling / Other ___"
      },
      {
        pattern: /\b(?:respiratory rate)\b/,
        strength: 58,
        domain: "Airway/Allergy Safety",
        reason: "Adds respiratory safety data when hives, angioedema, drug eruption, systemic rash, or airway symptoms could change acuity.",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:hives|urticaria|angioedema|lip swelling|tongue swelling|throat tightness|wheezing|drug eruption|systemic|anaphylaxis)\b/),
        diagnosticTarget: "Airway/allergy severity clue: tachypnea, respiratory distress, wheeze, or evolving anaphylaxis physiology.",
        management: "Respiratory abnormality with urticaria/angioedema/systemic rash can change epinephrine, airway escalation, observation, or emergency referral."
      }
    ],
    requiredItems: [
      {
        exam_id: "SAFETY-dermatology-temperature",
        item_type: "safety_check",
        label: "Measure temperature",
        options: "___ C/F / Fever / Afebrile / Not available",
        domain: "Basic Safety",
        role: "core",
        reason: "Temperature screens for infection, drug reaction, systemic inflammatory disease, or anaphylaxis mimic in dermatologic presentations.",
        diagnosticTarget: "Dermatology safety context: fever, hypothermia, or systemic illness accompanying rash, wound, hives, or skin lesion.",
        management: "Fever or systemic toxicity can change infection workup, isolation, medication-stop decisions, ED escalation, and dermatology consultation urgency.",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "thermometer",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "skin", "rash", "wound", "vitals", "diagnostic_safety"],
        satisfiedBy: /\btemperature\b/
      },
      {
        exam_id: "SAFETY-dermatology-blood-pressure",
        item_type: "safety_check",
        label: "Measure blood pressure",
        options: "___ / Normal / Low / High / Not available",
        domain: "Basic Safety",
        role: "core",
        reason: "Blood pressure keeps systemic illness, anaphylaxis, severe infection, and medication reaction risk separate from the skin morphology exam.",
        diagnosticTarget: "Dermatology safety context: hypotension, severe hypertension, or unstable hemodynamics.",
        management: "Hypotension or instability can change ED escalation, epinephrine/airway readiness, sepsis evaluation, and observation level.",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "blood pressure cuff",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "skin", "rash", "wound", "vitals", "diagnostic_safety"],
        satisfiedBy: /\bblood pressure\b/
      },
      {
        exam_id: "SAFETY-dermatology-heart-rate",
        item_type: "safety_check",
        label: "Measure heart rate",
        options: "___ / Regular / Irregular / Tachycardic / Bradycardic / Not available",
        domain: "Basic Safety",
        role: "core",
        reason: "Heart rate helps distinguish uncomplicated skin findings from systemic allergic, infectious, painful, or toxic presentations.",
        diagnosticTarget: "Dermatology safety context: tachycardia, bradycardia, irregular rhythm, or systemic stress.",
        management: "Tachycardia with rash, wound, fever, pain, or hives can change infection/allergy escalation, medication reaction concern, and monitoring.",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "skin", "rash", "wound", "vitals", "diagnostic_safety"],
        satisfiedBy: /\bheart rate\b/
      }
    ],
    conditional: [
      { pattern: /\b(?:mouth exam|oropharynx|sclerae and conjunctivae)\b/, strength: 58, domain: "Mucosal/Ocular Add-on", reason: "Checks mucosal, hydration, or ocular involvement when rash, drug eruption, hives, jaundice, dry-skin/dehydration, or systemic dermatologic disease may change management.", when: (context) => patientOrUnstructuredContextHas(context, /\b(?:mucosal|mouth|oral|eye|ocular|sclera|jaundice|hives|urticaria|throat|angioedema|drug eruption|fever|systemic|dry skin|excessive dryness|dehydrat)\b/) },
      { pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial)\b/, strength: 64, domain: "Wound/Vascular Risk", reason: "Adds vascular and edema context for wounds, ulcers, non-healing lesions, diabetic foot, or poor perfusion.", when: (context) => patientOrUnstructuredContextHas(context, /\b(?:ulcer|wound|non healing|foot|diabetes|vascular|poor perfusion|ischemia|edema)\b/) },
      { pattern: /\b(?:anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|submandibular nodes|tonsillar nodes)\b/, strength: 54, domain: "Regional Nodes", reason: "Uses available catalog nodes as a proxy for regional lymph assessment when lesions, wounds, or malignancy concern is present.", when: (context) => patientOrUnstructuredContextHas(context, /\b(?:skin lesions?|moles?|ulcer|wound|non healing|malignancy|cancer|infection|lymph|nodes?)\b/) }
    ],
    requiredGaps: [
      {
        exam_id: "GAP-derm-lesion-inspection",
        label: "Skin lesion inspection",
        options: "Benign-appearing / Asymmetric / Irregular border / Color variation / Large or evolving / Ulcerated or bleeding / Unable",
        domain: "Dermatology",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:skin lesions?|moles?|changing mole|new lesion|malignancy|melanoma|skin cancer)\b/),
        reason: "Skin lesions and moles need a lesion-specific inspection documenting morphology and change, not a generic rash exam or lymph-node survey alone.",
        diagnosticTarget: "Lesion risk pattern: asymmetry, border irregularity, color variation, diameter/evolution, ulceration, bleeding, or multiple concerning lesions.",
        management: "Concerning lesion features can change urgency of dermatology referral, dermoscopy/biopsy planning, photography/measurement follow-up, and regional lymph-node assessment.",
        bedsideQuestion: "Is the lesion new or changing, asymmetric, irregular, multicolored, bleeding, painful, ulcerated, or associated with personal/family skin cancer history?",
        bedsideQuestionOptions: "No / New / Changing / Asymmetric / Irregular border / Multicolored / Bleeding or ulcerated / Painful / Skin cancer history / Other ___",
        source: "AHRQ_CALIBRATE_DX; American Academy of Dermatology public melanoma detection guidance; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "2",
        equipment_needed: "light and ruler if measuring",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "skin_lesion", "mole"],
        satisfiedBy: /\bskin lesion inspection\b/
      },
      {
        exam_id: "GAP-derm-regional-lymph-nodes",
        label: "Regional lymph nodes",
        options: "Not enlarged / Enlarged-tender / Enlarged-firm-fixed / Not assessed / Unable",
        domain: "Dermatology",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:skin lesions?|moles?|changing mole|new lesion|malignancy|melanoma|skin cancer)\b/),
        reason: "Concerning skin lesions need a focused regional node assessment without expanding into an unfocused lymphoma-style node and spleen survey.",
        diagnosticTarget: "Regional spread or infection clue: tender, enlarged, firm, fixed, or asymmetric draining-basin nodes.",
        management: "Abnormal regional nodes can change urgency of dermatology/surgical referral, biopsy planning, infection treatment, imaging, or oncology evaluation.",
        bedsideQuestion: "Any rapidly enlarging lesion, bleeding, ulceration, nearby tender lumps, unexplained weight loss, night sweats, or personal history of skin cancer?",
        bedsideQuestionOptions: "No / Rapid growth / Bleeding or ulceration / Nearby lump / Weight loss / Night sweats / Skin cancer history / Other ___",
        source: "AHRQ_CALIBRATE_DX; American Academy of Dermatology public melanoma detection guidance; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "skin_lesion", "regional_nodes"],
        satisfiedBy: /\bregional lymph nodes\b/
      },
      {
        exam_id: "GAP-derm-skin-inspection",
        label: "Skin inspection",
        options: "No rash / Rash present / Vesicles-bullae / Petechiae-purpura / Urticarial / Scale / Unable",
        domain: "Dermatology",
        when: /\b(?:rash|urticaria|hives|pruritus|itching|dry skin|excessive dryness|drug eruption|desquamation|petechiae|purpura|perianal itching|pruritus ani)\b/,
        unless: (context) => patientOrUnstructuredContextHas(context, /\b(?:skin lesions?|moles?|changing mole|new lesion|malignancy|melanoma|skin cancer|ulcer|wound|non healing|diabetes foot)\b/),
        reason: "The primary dermatology maneuver is direct inspection of lesion morphology, distribution, and concerning systemic patterns.",
        diagnosticTarget: "Dermatologic pattern: morphology, distribution, mucosal involvement, petechiae/purpura, infection, urticaria, or desquamation clue.",
        management: "Petechiae/purpura, mucosal involvement, rapidly progressive rash, skin pain, bullae, fever, or systemic toxicity can change isolation, infectious workup, medication-stop decisions, ED escalation, or dermatology consultation.",
        bedsideQuestion: "When did the skin change start, where is it, is it painful or itchy, and are there fever, mucosal lesions, new medicines, or rapid spread?",
        bedsideQuestionOptions: "Location ___ / Itchy / Painful / Fever / Mucosal lesions / New medicine / Rapid spread / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "2",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["dermatology", "rash", "skin_inspection"],
        satisfiedBy: /\b(?:skin inspection|skin lesion inspection|wound inspection)\b/
      },
      {
        exam_id: "GAP-derm-mucosal-lesions",
        label: "Mucosal lesions",
        options: "Absent / Oral / Ocular / Genital / Multiple sites / Unable",
        domain: "Mucosal/Severe Rash Screen",
        role: "conditional",
        when: /\b(?:rash|urticaria|hives|drug eruption|fever|systemic|mucosal|mouth|oral|eye|ocular|genital|skin pain|blister|bullae|purpura|new medication)\b/,
        reason: "Adds a separate mucosal-involvement check for rash, urticaria, drug eruption, fever, blistering, purpura, or systemic skin illness rather than burying it inside generic skin inspection.",
        diagnosticTarget: "Severe dermatologic or mucocutaneous clue: oral, ocular, genital, or multisite mucosal involvement.",
        management: "Mucosal involvement with rash can change medication-stop decisions, ED/dermatology escalation, ocular/genital exam urgency, isolation/infection framing, and concern for severe cutaneous adverse reactions.",
        bedsideQuestion: "Any mouth sores, eye pain/redness, genital sores, skin pain, blisters, purpura, fever, or new high-risk medication?",
        bedsideQuestionOptions: "No / Mouth sores / Eye pain or redness / Genital sores / Skin pain / Blisters / Purpura / Fever / New medication / Other ___",
        source: "AAFP_PRURITUS_2022; CDC_STI_2021; AAO_CONJUNCTIVITIS_PPP_2023; AHRQ_CALIBRATE_DX",
        evidenceTier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "light; gloves/chaperone as appropriate for genital symptoms",
        patient_cooperation_required: "moderate",
        matchedTags: ["dermatology", "rash", "mucosal", "drug_eruption", "severe_rash"],
        satisfiedBy: /\bmucosal lesions\b/
      },
      {
        exam_id: "GAP-derm-wound-inspection",
        label: "Wound inspection",
        options: "Clean / Erythema / Drainage / Necrosis / Exposed structure / Unable",
        domain: "Wound",
        when: (context) => patientOrUnstructuredContextHas(context, /\b(?:ulcer|wound|non healing|diabetes|foot|ischemia|drainage|necrosis)\b/),
        reason: "Non-healing wounds need a separate wound-focused inspection before vascular or neuropathy add-ons are interpreted.",
        diagnosticTarget: "Wound severity: erythema, drainage, necrosis, exposed structure, ischemic appearance, or infection.",
        management: "Concerning wound findings can change antibiotics, debridement/vascular imaging, offloading, diabetes foot pathway, or urgent referral.",
        bedsideQuestion: "Is there drainage, spreading redness, odor, worsening pain, fever, black tissue, exposed bone/tendon, or reduced pulses?",
        bedsideQuestionOptions: "No / Drainage / Spreading redness / Odor / Fever / Black tissue / Exposed structure / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "2",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["wound", "skin_ulcer", "diabetes_foot"],
        satisfiedBy: /\bwound inspection\b/
      },
      {
        exam_id: "GAP-derm-scalp-exam",
        label: "Scalp exam",
        options: "Normal / Diffuse thinning / Patchy loss / Scale / Scarring / Inflammation / Unable",
        domain: "Hair/Scalp",
        when: /\b(?:hair loss|alopecia|scalp|patchy hair|thinning hair|scarring)\b/,
        reason: "Hair loss needs a separate scalp and hair-pattern assessment rather than a generic skin inspection alone.",
        diagnosticTarget: "Alopecia pattern: diffuse thinning, patchy loss, scale, inflammation, scarring, traction, or infection clue.",
        management: "Scarring, inflammation, scale, patchy loss, or rapid progression can change urgency of dermatology referral, fungal/inflammatory workup, medication review, and endocrine/autoimmune evaluation.",
        bedsideQuestion: "Is hair loss patchy or diffuse, sudden or gradual, with scalp itching, scale, pain, scarring, new medications, or thyroid symptoms?",
        bedsideQuestionOptions: "Diffuse / Patchy / Sudden / Itching or scale / Pain / Scarring / New medication / Thyroid symptoms / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "easy",
        time_burden_minutes: "2",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["alopecia", "hair_loss", "scalp"],
        satisfiedBy: /\bscalp exam\b/
      },
      {
        exam_id: "GAP-derm-perianal-inspection",
        label: "Perianal skin inspection",
        options: "Normal / Erythema / Fissure / Hemorrhoid / Drainage / Lesion / Deferred",
        domain: "Perianal",
        when: /\b(?:pruritus ani|perianal|rectal itching|anal itching)\b/,
        reason: "Perianal itching needs local skin inspection rather than unrelated HEENT or abdominal maneuvers.",
        diagnosticTarget: "Perianal source: dermatitis, fissure, hemorrhoid, drainage, lesion, infestation clue, or infection.",
        management: "Local lesions, drainage, bleeding, ulceration, or infection signs can change topical therapy, stool/parasite/STI workup, colorectal/dermatology referral, and safety counseling.",
        bedsideQuestion: "Any bleeding, pain, drainage, new lesion, diarrhea, hygiene product change, nocturnal itching, or household contacts with itching?",
        bedsideQuestionOptions: "No / Bleeding / Pain / Drainage / Lesion / Diarrhea / Nocturnal itching / Other ___",
        source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
        evidenceTier: "B",
        difficulty: "moderate",
        time_burden_minutes: "2",
        equipment_needed: "gloves and chaperone as appropriate",
        patient_cooperation_required: "moderate",
        matchedTags: ["pruritus_ani", "perianal", "skin_inspection"],
        satisfiedBy: /\bperianal skin inspection\b/
      }
    ],
    suppress: [
      { pattern: /\b(?:tonsillar nodes|submandibular nodes|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes)\b/, unless: /\b(?:sore throat|pharyngitis|oral|mouth|throat|neck mass|head|face|scalp)\b/, reason: "Skin lesions use a focused regional-node assessment; individual cervical-node rows need head, neck, oral, throat, or scalp localization." },
      { pattern: /\b(?:spleen palpation|abdominal palpation)\b/, unless: /\b(?:night sweats|unintentional weight loss|weight loss|lymphoma|hematologic|splenomegaly|abdominal)\b/, reason: "Skin-lesion evaluation should not expand to spleen or abdominal maneuvers unless B symptoms, hematologic concern, splenomegaly, or abdominal symptoms are present." },
      { pattern: /\b(?:mouth exam|oropharynx)\b/, unless: /\b(?:mucosal|oral|mouth|throat|sore throat|pharyngitis|angioedema|hives|urticaria|fever|systemic|drug eruption)\b/, reason: "Skin lesions and moles do not need oral/oropharyngeal exam unless mucosal, throat, allergic, infectious, or systemic features are present." },
      { pattern: /\b(?:tonsillar nodes|submandibular nodes|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes)\b/, unless: /\b(?:lymph|node|adenopathy|swollen glands|neck|head|face|scalp|throat|oral|skin lesions?|moles?|malignancy|cancer)\b/, reason: "Cervical-node survey is not a substitute for local skin or perianal inspection unless lymphadenopathy, head/neck involvement, or malignancy concern is present." },
      { pattern: /\b(?:pmi|vibration sense|carotids|murphy|psoas|obturator|babinski|finger to nose|abdominal palpation|bowel sounds|cva tenderness)\b/, unless: /\b(?:neuropathy|vascular|ulcer|weakness|abdominal|stroke|ataxia|flank|urinary)\b/, reason: "Not dermatology-focused without vascular, neurologic, abdominal, or GU triggers." }
    ]
  }
];

function bundleFloorItem(config = {}) {
  const itemType = config.item_type || config.gap_type || config.type || "exam_maneuver";
  const escapedLabel = normalizeEvidenceLabel(config.label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    exam_id: config.exam_id,
    item_type: itemType,
    gap_type: itemType,
    label: config.label,
    maneuver: config.maneuver || config.label,
    technique: config.technique || "",
    options: config.options || "",
    domain: config.domain || "Validated Workup Floor",
    role: config.role || "core",
    reason: config.reason || "Required by the selected validated clinical bundle.",
    diagnosticTarget: config.diagnosticTarget || config.target || "",
    management: config.management || "",
    bedsideQuestion: config.bedsideQuestion || "",
    bedsideQuestionOptions: config.bedsideQuestionOptions || "",
    source: config.source || "AHRQ_CALIBRATE_DX",
    source_citation: config.source_citation || config.source || "AHRQ Calibrate Dx",
    evidenceTier: config.evidenceTier || "Guideline",
    difficulty: config.difficulty || "easy",
    time_burden_minutes: config.time_burden_minutes || "0.5",
    equipment_needed: config.equipment_needed || "none",
    patient_cooperation_required: config.patient_cooperation_required || "low",
    matchedTags: config.matchedTags || config.tags || [],
    when: config.when,
    unless: config.unless,
    satisfiedBy: config.satisfiedBy || (escapedLabel ? new RegExp(`\\b${escapedLabel}\\b`, "i") : undefined)
  };
}

const validatedBundleWorkupFloors = {
  dka_hhs: [
    bundleFloorItem({
      exam_id: "REQ-dka-hhs-mental-status",
      type: "safety_check",
      label: "Document mental status",
      options: "Baseline / Confused / Somnolent / Agitated / Obtunded / Seizing / Unable",
      domain: "Basic Safety / Neurologic Acuity",
      reason: "Mental status is management-changing safety data in DKA/HHS and must be modeled separately from physical exam maneuvers.",
      diagnosticTarget: "Hyperglycemic-crisis severity clue: confusion, somnolence, agitation, seizure, obtundation, or inability to safely participate in care.",
      management: "Altered mental status changes airway and aspiration risk, osmolality/severity assessment, monitoring level, ICU or stepdown threshold, and urgency of reassessment.",
      bedsideQuestion: "Is this mental status baseline, and is there new confusion, unusual sleepiness, agitation, seizure, severe weakness, or trouble staying awake?",
      bedsideQuestionOptions: "Baseline / Confusion / Sleepy / Agitated / Seizure / Severe weakness / Trouble staying awake / Other ___",
      source: "ADA_HYPERGLYCEMIC_CRISES_2024; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      source_citation: "2024 hyperglycemic crises consensus report; ADA Standards of Care in Diabetes-2026, hospital section; AHRQ Calibrate Dx",
      evidenceTier: "Guideline",
      difficulty: "easy",
      time_burden_minutes: "0.5",
      equipment_needed: "none",
      patient_cooperation_required: "low",
      matchedTags: ["DKA_HHS", "mental_status", "hyperosmolarity", "diagnostic_safety"],
      satisfiedBy: /\b(?:mental status|alert|oriented|confusion|somnolent|obtunded|agitated|seizure)\b/
    }),
    bundleFloorItem({
      exam_id: "REQ-dka-hhs-respiratory-pattern",
      type: "exam_maneuver",
      label: "Observe Kussmaul respiratory pattern",
      options: "Normal / Tachypneic / Deep-labored Kussmaul pattern / Shallow or tiring / Unable",
      domain: "Respiratory Pattern",
      reason: "DKA/HHS bedside exam needs an atomic respiratory-pattern observation distinct from routine respiratory-rate measurement.",
      diagnosticTarget: "Hyperglycemic-crisis severity clue: tachypnea, deep Kussmaul-style compensation, fatigue, or respiratory distress.",
      management: "Deep Kussmaul respirations support severe acidosis physiology and should prompt close reassessment of pH/anion gap, respiratory fatigue risk, monitoring level, and escalation; shallow or tiring respirations raise concern for impending decompensation.",
      bedsideQuestion: "Any shortness of breath, deep or labored breathing, severe fatigue, confusion, vomiting, or inability to keep up with breathing?",
      bedsideQuestionOptions: "No / Shortness of breath / Deep breathing / Labored breathing / Severe fatigue / Confusion / Vomiting / Other ___",
      source: "ADA_HYPERGLYCEMIC_CRISES_2024; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      source_citation: "2024 hyperglycemic crises consensus report; ADA Standards of Care in Diabetes-2026, hospital section; AHRQ Calibrate Dx",
      evidenceTier: "Guideline",
      difficulty: "easy",
      time_burden_minutes: "0.5",
      equipment_needed: "none",
      patient_cooperation_required: "low",
      matchedTags: ["DKA_HHS", "respiratory_pattern", "kussmaul", "acidosis", "red_flag"],
      satisfiedBy: /\b(?:kussmaul|respiratory pattern|deep-labored|deep labored|work of breathing)\b/
    }),
    bundleFloorItem({
      exam_id: "REQ-dka-hhs-diagnostic-thresholds",
      type: "diagnostic_test",
      label: "DKA/HHS diagnostic and severity thresholds",
      options: "Glucose and diabetes context / Beta-hydroxybutyrate >=3.0 mmol/L or urine ketones >=2+ for DKA pattern / pH <7.3 and/or bicarbonate <18 mmol/L for acidosis / Anion gap and electrolytes including potassium / Creatinine-BUN and volume/AKI context / Effective osmolality >300 mOsm/kg or total osmolality >320 mOsm/kg for HHS pattern / Assess mixed DKA-HHS and euglycemic DKA when SGLT2, pregnancy, fasting, or poor intake risk exists",
      domain: "Tests / Hyperglycemic Crisis",
      reason: "DKA/HHS cannot be classified safely from bedside findings alone; biochemical criteria and potassium/osmolality safety thresholds are required.",
      diagnosticTarget: "DKA, HHS, mixed DKA-HHS, euglycemic DKA, severity, potassium risk, AKI, and osmolality-related neurologic risk.",
      management: "Glucose, ketones, pH/bicarbonate, anion gap, potassium, renal function, and osmolality change insulin timing, fluid strategy, potassium replacement, monitoring level, and resolution/transition decisions.",
      bedsideQuestion: "Any SGLT2 inhibitor use, pregnancy possibility, fasting/poor intake, missed insulin, pump failure, infection symptoms, chest pain, stroke symptoms, or medication access barrier?",
      bedsideQuestionOptions: "No / SGLT2 / Pregnancy possible / Fasting-poor intake / Missed insulin / Pump failure / Infection / Chest pain / Stroke symptoms / Access barrier / Other ___",
      source: "ADA_HYPERGLYCEMIC_CRISES_2024; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      source_citation: "2024 hyperglycemic crises consensus report; ADA Standards of Care in Diabetes-2026, hospital section; AHRQ Calibrate Dx",
      evidenceTier: "Guideline",
      equipment_needed: "lab and point-of-care glucose review",
      matchedTags: ["DKA_HHS", "diagnostic_test", "ketones", "anion_gap", "bicarbonate", "pH", "potassium", "osmolality"]
    }),
    bundleFloorItem({
      exam_id: "REQ-dka-hhs-precipitant-tests",
      type: "diagnostic_test",
      label: "DKA/HHS precipitant and safety testing",
      options: "ECG and troponin when chest pain, ischemia, arrhythmia, potassium abnormality, or high-risk presentation / CBC, urinalysis, chest imaging, cultures, or viral testing when infection source is possible / Lipase or abdominal imaging only when persistent focal abdominal concern supports pancreatitis or surgical mimic / Medication, insulin access, pump/CGM, steroid, alcohol, and pregnancy review when relevant",
      domain: "Tests / Precipitant Search",
      reason: "Hyperglycemic crises are often triggered by infection, insulin omission/access problems, pump failure, ischemia, medications, pregnancy, or other stressors; the workup should show that search explicitly.",
      diagnosticTarget: "Precipitating cause or mimic: infection, myocardial ischemia/arrhythmia, pancreatitis or surgical abdomen, medication effect, pregnancy-related risk, alcohol/starvation, insulin omission, or pump/device failure.",
      management: "Finding the precipitant changes antibiotics/source control, ACS or stroke evaluation, device troubleshooting, medication holds, pregnancy safety, social discharge planning, and recurrence prevention.",
      bedsideQuestion: "Any fever, cough, dysuria, wounds, chest pain, neurologic symptoms, severe focal abdominal pain, steroid use, alcohol/fasting, pregnancy possibility, insulin access issue, or pump/CGM problem?",
      bedsideQuestionOptions: "No / Infection symptoms / Chest pain / Neuro symptoms / Focal abdominal pain / Steroid / Alcohol-fasting / Pregnancy possible / Insulin access / Pump-CGM issue / Other ___",
      source: "ADA_HYPERGLYCEMIC_CRISES_2024; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      source_citation: "2024 hyperglycemic crises consensus report; ADA Standards of Care in Diabetes-2026, hospital section; AHRQ Calibrate Dx",
      evidenceTier: "Guideline",
      equipment_needed: "source-directed lab, ECG, imaging, and medication/device review",
      matchedTags: ["DKA_HHS", "diagnostic_test", "precipitant", "infection", "ACS", "pregnancy", "insulin_access"]
    }),
    bundleFloorItem({
      exam_id: "REQ-dka-hhs-escalation-cues",
      type: "red_flag",
      label: "DKA/HHS high-acuity escalation cues",
      options: "Altered mental status, seizure, obtundation, or inability to protect airway / Hypotension, shock, poor perfusion, or severe dehydration / Severe acidosis, rising anion gap, severe hyperosmolality, or mixed DKA-HHS / Potassium <3.5 mmol/L or dangerous potassium/ECG concern / Severe hypoxemia, respiratory fatigue, or suspected sepsis / Pregnancy, pediatric/young adult high-risk context, severe comorbidity, or unreliable monitoring setting",
      domain: "Red Flags / Hyperglycemic Crisis",
      reason: "DKA/HHS workups must explicitly screen for neurologic, airway, shock, potassium, respiratory, sepsis, pregnancy, and monitoring-risk features that change disposition and treatment sequence.",
      diagnosticTarget: "High-risk hyperglycemic crisis physiology: neurologic compromise, airway risk, shock, severe dehydration, severe acidosis/osmolality, potassium/arrhythmia risk, sepsis, respiratory failure, pregnancy, or unsafe monitoring context.",
      management: "These cues change ICU/stepdown threshold, airway and respiratory support, fluid and insulin sequence, potassium replacement before insulin, sepsis/precipitant treatment, and urgency of endocrine/critical-care escalation.",
      bedsideQuestion: "Any confusion, seizure, trouble protecting airway, syncope, very low urine, shock symptoms, severe shortness of breath, infection symptoms, pregnancy possibility, or known abnormal potassium/ECG?",
      bedsideQuestionOptions: "No / Confusion-seizure / Airway concern / Syncope-shock / Oliguria / Severe dyspnea / Infection / Pregnancy possible / Potassium-ECG concern / Other ___",
      source: "ADA_HYPERGLYCEMIC_CRISES_2024; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      source_citation: "2024 hyperglycemic crises consensus report; ADA Standards of Care in Diabetes-2026, hospital section; AHRQ Calibrate Dx",
      evidenceTier: "Guideline",
      matchedTags: ["DKA_HHS", "red_flag", "mental_status", "shock", "potassium", "sepsis", "respiratory_failure"]
    })
  ],
  sleep_apnea_airway: [
    bundleFloorItem({
      exam_id: "REQ-osa-neck-circumference",
      type: "exam_maneuver",
      label: "Neck circumference",
      options: "Measured ___ cm / Enlarged by local threshold / Not measured / Unable",
      domain: "Sleep Apnea Risk Phenotype",
      reason: "Neck circumference is a quick bedside OSA risk phenotype item and should be shown as an active exam step rather than a reviewer-only gap.",
      diagnosticTarget: "OSA risk phenotype: enlarged neck circumference or upper-airway crowding in a patient with snoring, witnessed apneas, or sleepiness.",
      management: "A high-risk phenotype supports formal sleep testing referral, PAP/oral-appliance discussion, peri-procedural airway-risk documentation, and cardiometabolic follow-up.",
      bedsideQuestion: "Any loud snoring, witnessed apneas, waking choking, morning headache, daytime sleepiness, resistant hypertension, or drowsy driving?",
      bedsideQuestionOptions: "No / Loud snoring / Witnessed apnea / Choking awakenings / Sleepiness / Morning headache / Resistant hypertension / Drowsy driving / Other ___",
      source: "AASM_OSA_DIAGNOSTIC_2017; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      source_citation: "AASM adult OSA diagnostic testing guideline 2017; McGee Evidence-Based Physical Diagnosis; AHRQ Calibrate Dx",
      equipment_needed: "tape measure",
      matchedTags: ["sleep_apnea", "snoring", "neck_circumference", "upper_airway"]
    }),
    bundleFloorItem({
      exam_id: "REQ-osa-testing-pathway",
      type: "diagnostic_test",
      label: "OSA diagnostic testing pathway",
      options: "Polysomnography for suspected OSA with significant comorbidity, hypoventilation, neuromuscular weakness, opioid use, stroke, severe insomnia, or inconclusive HSAT / Home sleep apnea testing only for uncomplicated adults at increased risk / Repeat PSG if HSAT negative-inconclusive-inadequate and suspicion remains",
      domain: "Tests / Sleep Study",
      reason: "OSA cannot be diagnosed by bedside exam alone; the workup must state when PSG or HSAT is needed.",
      diagnosticTarget: "Objective sleep-disordered breathing diagnosis, severity, and suitability for home versus laboratory testing.",
      management: "The testing route changes PAP eligibility, driving/work safety counseling, perioperative planning, and cardiometabolic risk management.",
      bedsideQuestion: "Any heart failure, COPD, neuromuscular weakness, opioid use, prior stroke, severe insomnia, hypoventilation concern, or prior inconclusive home test?",
      bedsideQuestionOptions: "No / HF-COPD / Neuromuscular weakness / Opioids / Prior stroke / Severe insomnia / Hypoventilation / Prior inconclusive HSAT / Other ___",
      source: "AASM_OSA_DIAGNOSTIC_2017; AHRQ_CALIBRATE_DX",
      source_citation: "AASM adult OSA diagnostic testing guideline 2017; AHRQ Calibrate Dx",
      equipment_needed: "sleep-study referral/order review",
      matchedTags: ["sleep_apnea", "polysomnography", "home_sleep_apnea_test", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-osa-safety-red-flags",
      type: "red_flag",
      label: "Sleep apnea safety and escalation cues",
      options: "Drowsy driving or occupational safety risk / Severe daytime sleepiness / Witnessed prolonged apneas or cyanosis / Resting hypoxemia / Pulmonary hypertension or right-heart failure concern / Uncontrolled or resistant hypertension / Opioid or sedative risk",
      domain: "Red Flags / Sleep Safety",
      reason: "OSA workups should not stop at snoring; safety-risk and cardiopulmonary comorbidity change urgency.",
      diagnosticTarget: "High-risk sleep-disordered breathing context: driving risk, severe hypersomnolence, hypoxemia, cardiopulmonary disease, resistant hypertension, or sedative/opioid risk.",
      management: "These cues change urgency of sleep testing, driving/work restrictions counseling, medication review, and cardiopulmonary evaluation.",
      bedsideQuestion: "Any near-miss crashes, falling asleep while driving, severe sleepiness, cyanosis, low oxygen readings, resistant hypertension, opioid/sedative use, or known pulmonary hypertension?",
      bedsideQuestionOptions: "No / Drowsy driving / Severe sleepiness / Cyanosis-apnea / Low oxygen / Resistant hypertension / Opioid-sedative / Pulmonary hypertension / Other ___",
      source: "AASM_OSA_DIAGNOSTIC_2017; AHRQ_CALIBRATE_DX",
      matchedTags: ["sleep_apnea", "red_flag", "driving_safety", "hypoxemia"]
    })
  ],
  pelvic_menstrual_pain: [
    bundleFloorItem({
      exam_id: "REQ-pelvic-pregnancy-safety",
      type: "safety_check",
      label: "Verify pregnancy possibility",
      options: "Not possible / Possible / Positive test / Negative test / Unknown",
      domain: "Basic Safety / Pregnancy",
      reason: "Pregnancy possibility changes medication, imaging, ectopic-risk, and escalation decisions in pelvic or lower-abdominal pain.",
      diagnosticTarget: "Pregnancy or ectopic-risk context in pelvic, menstrual, or lower-abdominal pain.",
      management: "Possible or confirmed pregnancy changes pregnancy testing, pelvic ultrasound, medication safety, ectopic precautions, and OB/ED escalation threshold.",
      bedsideQuestion: "Could you be pregnant, is the period late or abnormal, and is there severe one-sided pain, shoulder pain, syncope, or heavy bleeding?",
      bedsideQuestionOptions: "Not possible / Possible / Late period / Positive test / Heavy bleeding / One-sided severe pain / Syncope / Shoulder pain / Other ___",
      source: "ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX",
      matchedTags: ["pelvic_pain", "pregnancy", "ectopic", "diagnostic_safety"]
    }),
    bundleFloorItem({
      exam_id: "REQ-pelvic-initial-tests",
      type: "diagnostic_test",
      label: "Pelvic pain initial tests and imaging pathway",
      options: "Pregnancy test when pregnancy possible / Urinalysis when urinary symptoms or lower abdominal pain overlap / STI NAAT and wet mount when discharge, cervical symptoms, STI risk, or PID concern / CBC or inflammatory markers when fever/systemic illness / Pelvic ultrasound when pregnancy, adnexal mass/torsion, severe unilateral pain, or unclear diagnosis",
      domain: "Tests / Pelvic Pain",
      reason: "Pelvic pain needs explicit pregnancy, urinary, STI/PID, and ultrasound pathways because bedside abdominal exam alone misses management-changing mimics.",
      diagnosticTarget: "Pelvic source: pregnancy/ectopic, PID/STI, UTI, torsion/adnexal pathology, appendicitis mimic, or systemic infection.",
      management: "Positive pregnancy, STI/PID testing, urinary findings, leukocytosis/systemic illness, or ultrasound findings change antibiotics, imaging, OB/GYN escalation, and disposition.",
      bedsideQuestion: "Any pregnancy possibility, discharge, STI exposure, fever, urinary symptoms, severe unilateral pain, vomiting, syncope, or heavy bleeding?",
      bedsideQuestionOptions: "No / Pregnancy possible / Discharge / STI exposure / Fever / Urinary symptoms / Severe unilateral pain / Vomiting / Syncope / Heavy bleeding / Other ___",
      source: "CDC_STI_2021; ACOG_ECTOPIC_FAQ; ACOG_ENDOMETRIOSIS_DIAGNOSIS_2026; AHRQ_CALIBRATE_DX",
      matchedTags: ["pelvic_pain", "pregnancy", "PID", "ectopic", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-pelvic-pid-ectopic-red-flags",
      type: "red_flag",
      label: "PID/ectopic red-flag review",
      options: "Positive pregnancy or pregnancy possible with pain / Syncope or presyncope / Shoulder pain / Heavy bleeding / Severe unilateral pain / Fever or rigors / Purulent discharge or cervical motion/adnexal tenderness concern / Peritoneal signs / Hemodynamic instability",
      domain: "Red Flags / Pelvic Pain",
      reason: "PID, ectopic pregnancy, torsion, and acute abdomen are the management-changing misses in pelvic pain.",
      diagnosticTarget: "Pelvic danger pattern: ectopic pregnancy, ruptured ectopic, ovarian torsion, PID/tubo-ovarian abscess, appendicitis mimic, sepsis, or hemorrhage.",
      management: "These cues change pregnancy testing and ultrasound urgency, empiric PID treatment, OB/GYN or ED escalation, and hemodynamic monitoring.",
      bedsideQuestion: "Any positive pregnancy test, fainting, shoulder pain, heavy bleeding, severe one-sided pain, fever, discharge, severe vomiting, or worsening pain?",
      bedsideQuestionOptions: "No / Pregnancy positive-possible / Syncope / Shoulder pain / Heavy bleeding / Severe one-sided pain / Fever / Discharge / Vomiting / Other ___",
      source: "CDC_STI_2021; ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX",
      matchedTags: ["pelvic_pain", "PID", "ectopic", "red_flag"]
    })
  ],
  neuro_red_flags: [
    bundleFloorItem({
      exam_id: "REQ-stroke-tests-reference-thresholds",
      type: "diagnostic_test",
      label: "Stroke initial tests and timing pathway",
      options: "Fingerstick/serum glucose immediately to identify hypoglycemia mimic / Noncontrast head CT or MRI urgently when acute focal deficit suspected / Vascular imaging when large-vessel occlusion or thrombectomy pathway possible / ECG/telemetry and basic labs without delaying time-critical imaging or reperfusion review",
      domain: "Tests / Stroke",
      reason: "A stroke workup must explicitly include glucose and urgent neuroimaging rather than relying on focal exam maneuvers alone.",
      diagnosticTarget: "Stroke mimic exclusion and acute ischemic/hemorrhagic stroke triage.",
      management: "Glucose abnormality, hemorrhage, large-vessel occlusion, or contraindication data changes thrombolysis/thrombectomy review, stroke-alert escalation, and monitoring.",
      bedsideQuestion: "When was last known well, and are deficits disabling, improving, recurrent, associated with seizure, headache, anticoagulant use, or low glucose risk?",
      bedsideQuestionOptions: "Last known well ___ / Disabling / Improving / Recurrent / Seizure / Severe headache / Anticoagulant / Low glucose risk / Other ___",
      source: "AHA_ASA_STROKE_2019; AHRQ_CALIBRATE_DX",
      matchedTags: ["stroke", "glucose", "neuroimaging", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-stroke-red-flags",
      type: "red_flag",
      label: "Stroke alert and neurologic danger cues",
      options: "New face/arm/leg weakness or numbness / Aphasia or neglect / Vision loss or diplopia / Ataxia or severe vertigo with focal signs / Severe sudden headache / Seizure with persistent deficit / Altered mental status / Anticoagulant use or bleeding risk / Last-known-well within reperfusion window or unknown wake-up stroke",
      domain: "Red Flags / Stroke",
      reason: "Time-sensitive neurologic danger cues determine stroke-alert activation and imaging/reperfusion urgency.",
      diagnosticTarget: "Acute focal neurologic deficit, posterior circulation stroke, hemorrhage, seizure mimic with persistent deficit, or reperfusion-window presentation.",
      management: "These cues change immediate stroke alert, CT/CTA/MRI urgency, thrombolysis/thrombectomy eligibility review, anticoagulation reversal review, and neurology escalation.",
      bedsideQuestion: "Any new one-sided weakness/numbness, facial droop, speech trouble, vision loss, double vision, ataxia, severe sudden headache, seizure, anticoagulant use, or unknown onset?",
      bedsideQuestionOptions: "No / Face droop / Weakness-numbness / Speech trouble / Vision loss / Diplopia / Ataxia / Thunderclap headache / Seizure / Anticoagulant / Unknown onset / Other ___",
      source: "AHA_ASA_STROKE_2019; AHRQ_CALIBRATE_DX",
      matchedTags: ["stroke", "red_flag", "focal_neurologic_deficit"]
    })
  ],
  spine_cord_compression: [
    bundleFloorItem({
      exam_id: "REQ-cord-saddle-sensation-screen",
      type: "exam_maneuver",
      label: "Saddle sensation",
      options: "Normal by history / Decreased perineal sensation / Deferred after consent discussion / Unable",
      domain: "Cord/Cauda Equina Safety",
      reason: "Back pain with urinary, bowel, saddle, or progressive neurologic symptoms needs a visible cauda-equina safety screen.",
      diagnosticTarget: "Cauda equina or cord compression clue: saddle sensory change, urinary retention/incontinence, bowel dysfunction, or progressive bilateral deficit.",
      management: "Abnormal saddle or bladder/bowel findings change urgent MRI, spine/neurosurgical consultation, ED transfer, and documentation of consent/deferral.",
      bedsideQuestion: "Any new numbness around the groin/saddle area, urinary retention, overflow incontinence, fecal incontinence, bilateral sciatica, or progressive leg weakness?",
      bedsideQuestionOptions: "No / Saddle numbness / Urinary retention / Incontinence / Fecal incontinence / Bilateral sciatica / Progressive weakness / Other ___",
      source: "ACP_LOW_BACK_PAIN_2017; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      patient_cooperation_required: "moderate",
      matchedTags: ["cord_compression", "cauda_equina", "saddle_sensation"]
    }),
    bundleFloorItem({
      exam_id: "REQ-cord-imaging-tests",
      type: "diagnostic_test",
      label: "Cord compression imaging and bladder pathway",
      options: "Urgent MRI spine for suspected cauda equina, cord compression, epidural abscess, malignancy, or progressive neurologic deficit / Bladder scan or post-void residual when retention suspected / CBC, ESR/CRP, blood cultures when infection/epidural abscess concern / Cancer or fracture imaging pathway when trauma, osteoporosis, steroid use, or malignancy history",
      domain: "Tests / Spine Safety",
      reason: "Cord compression is an imaging diagnosis; bedside neuro exam must be tied to urgent MRI and bladder/infection pathways.",
      diagnosticTarget: "Compressive neurologic emergency, urinary retention, spinal infection, malignancy, or fracture.",
      management: "MRI, retention, inflammatory markers/cultures, or fracture/malignancy clues change ED transfer, spine/neurosurgery involvement, antibiotics, decompression, and disposition.",
      bedsideQuestion: "Any urinary retention, saddle numbness, fever, injection drug use, cancer history, major trauma, steroid use, osteoporosis, or progressive weakness?",
      bedsideQuestionOptions: "No / Retention / Saddle numbness / Fever-IVDU / Cancer / Trauma / Steroid-osteoporosis / Progressive weakness / Other ___",
      source: "ACP_LOW_BACK_PAIN_2017; AHRQ_CALIBRATE_DX",
      matchedTags: ["cord_compression", "MRI", "bladder_scan", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-cord-red-flags",
      type: "red_flag",
      label: "Cord compression and serious back-pain red flags",
      options: "New urinary retention or overflow incontinence / Saddle anesthesia / Fecal incontinence / Progressive or bilateral leg weakness / Fever, IVDU, immunosuppression, or recent bacteremia / Cancer history or unexplained weight loss / Significant trauma, osteoporosis, or chronic steroid use",
      domain: "Red Flags / Spine",
      reason: "Back pain workups must separate routine pain from time-sensitive cord, infection, malignancy, and fracture patterns.",
      diagnosticTarget: "Cauda equina, cord compression, epidural abscess, spinal malignancy, or fracture red flag.",
      management: "These cues change immediate MRI threshold, ED transfer, spine/neurosurgical consultation, blood cultures/antibiotics, and immobilization or fracture pathway.",
      bedsideQuestion: "Any new bladder/bowel dysfunction, saddle numbness, progressive weakness, fever, IVDU, immunosuppression, cancer, weight loss, trauma, osteoporosis, or steroid use?",
      bedsideQuestionOptions: "No / Bladder-bowel / Saddle numbness / Progressive weakness / Fever-IVDU / Immunosuppressed / Cancer-weight loss / Trauma / Steroid-osteoporosis / Other ___",
      source: "ACP_LOW_BACK_PAIN_2017; AHRQ_CALIBRATE_DX",
      matchedTags: ["cord_compression", "red_flag", "back_pain"]
    })
  ],
  adrenergic_jittery: [
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-mental-status",
      type: "safety_check",
      label: "Document mental status",
      options: "Baseline / Anxious-jittery / Confused / Somnolent / Seizing / Unable",
      domain: "Neuroglycopenia Safety",
      reason: "Mental status separates adrenergic symptoms from neuroglycopenic hypoglycemia that needs immediate treatment and monitoring.",
      diagnosticTarget: "Neuroglycopenia severity: confusion, somnolence, seizure, unsafe self-treatment, or inability to take oral carbohydrates.",
      management: "Altered mental status or seizure changes route of glucose treatment, monitoring interval, medication holds, and escalation.",
      bedsideQuestion: "Any confusion, sleepiness, seizure, trouble thinking, inability to eat/drink safely, or symptoms improving after carbohydrates?",
      bedsideQuestionOptions: "No / Confusion / Sleepy / Seizure / Cannot take PO / Improved after carbs / Other ___",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["hypoglycemia", "mental_status", "diagnostic_safety"]
    }),
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-bedside-glucose",
      type: "safety_check",
      label: "Measure bedside glucose",
      options: "___ mg/dL / <70 mg/dL / <54 mg/dL clinically significant / Normal / High / Not available",
      domain: "Immediate Glucose Check",
      reason: "Point-of-care glucose is immediately management-changing in hypoglycemia-like presentations.",
      diagnosticTarget: "Current glucose value and severity category in a patient with adrenergic or neuroglycopenic symptoms.",
      management: "A glucose <70 mg/dL triggers treatment and reassessment; <54 mg/dL or altered mental status raises monitoring and escalation urgency.",
      bedsideQuestion: "What was the most recent glucose, when were insulin or secretagogues taken, when was the last meal, and did symptoms improve after carbohydrates?",
      bedsideQuestionOptions: "Value ___ / Insulin-secretagogue / Missed meal / Alcohol / Exercise / Improved after carbs / Other ___",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      equipment_needed: "glucometer or recent point-of-care value",
      matchedTags: ["hypoglycemia", "glucose", "diagnostic_safety"]
    }),
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-diaphoresis-inspection",
      type: "exam_maneuver",
      label: "Diaphoresis inspection",
      options: "Absent / Present / Clammy / Unable",
      domain: "Adrenergic Signs",
      reason: "Visible diaphoresis is an atomic adrenergic sign and should not be hidden inside a broad endocrine exam.",
      diagnosticTarget: "Adrenergic hypoglycemia clue: diaphoresis, clamminess, or visible autonomic activation.",
      management: "Diaphoresis with low or unknown glucose supports immediate glucose check/treatment and reassessment after carbohydrates.",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["hypoglycemia", "diaphoresis", "adrenergic"]
    }),
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-tremor-observation",
      type: "exam_maneuver",
      label: "Tremor observation",
      options: "Absent / Fine tremor / Coarse tremor / Unable",
      domain: "Adrenergic Signs",
      reason: "Tremor observation captures adrenergic physiology while keeping thyroid-specific tremor assessment conditional on thyroid features.",
      diagnosticTarget: "Adrenergic hypoglycemia clue: visible tremor or shakiness during symptoms.",
      management: "Tremor with low or unknown glucose supports immediate glucose check/treatment, medication review, and symptom reassessment.",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["hypoglycemia", "tremor", "adrenergic"]
    }),
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-diagnostic-pathway",
      type: "diagnostic_test",
      label: "Hypoglycemia confirmation and cause pathway",
      options: "Confirm plasma or point-of-care glucose during symptoms / Document Whipple triad when feasible / Recheck glucose after treatment / Review insulin, sulfonylurea/meglitinide, alcohol, renal failure, poor intake, sepsis, adrenal insufficiency, and pregnancy risk / For unexplained recurrent hypoglycemia consider critical sample: glucose, insulin, C-peptide, proinsulin, beta-hydroxybutyrate, sulfonylurea screen, cortisol as clinically indicated",
      domain: "Tests / Hypoglycemia",
      reason: "Hypoglycemia-like symptoms require objective glucose confirmation, reassessment, and cause review rather than a generic tremor workup.",
      diagnosticTarget: "True hypoglycemia, treatment response, medication-related hypoglycemia, critical illness, adrenal/pregnancy risk, or endogenous hyperinsulinism pattern.",
      management: "Glucose severity, response, medication cause, renal failure, or critical-sample pattern changes immediate treatment, monitoring, medication holds, and endocrine evaluation.",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["hypoglycemia", "Whipple_triad", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-hypoglycemia-red-flags",
      type: "red_flag",
      label: "Hypoglycemia danger and disposition cues",
      options: "Altered mental status / Seizure / Unable to take oral carbohydrates / Recurrent or persistent low glucose / Sulfonylurea or long-acting insulin exposure / Pregnancy / Renal failure / Sepsis or adrenal crisis concern / No safe supervision or high-risk occupation/driving",
      domain: "Red Flags / Hypoglycemia",
      reason: "Hypoglycemia red flags change route of treatment, monitoring duration, and discharge safety.",
      diagnosticTarget: "Severe, persistent, recurrent, medication-related, pregnancy-related, or unsafe hypoglycemia pattern.",
      management: "These cues change IV dextrose or glucagon route, observation/admission, medication reversal/hold decisions, driving/work counseling, and endocrine escalation.",
      bedsideQuestion: "Any seizure, confusion, repeated lows, sulfonylurea or long-acting insulin, pregnancy, kidney failure, infection, adrenal disease, or unsafe driving/work risk?",
      bedsideQuestionOptions: "No / Seizure / Confusion / Recurrent lows / Sulfonylurea-long insulin / Pregnancy / Renal failure / Infection-adrenal / Driving-work risk / Other ___",
      source: "ADA_STANDARDS_HOSPITAL_2026; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["hypoglycemia", "red_flag", "diagnostic_safety"]
    })
  ],
  thyroid_endocrine: [
    bundleFloorItem({
      exam_id: "REQ-thyroid-crisis-mental-status",
      type: "safety_check",
      label: "Document mental status",
      options: "Baseline / Agitated / Delirious / Somnolent / Comatose / Unable",
      domain: "Thyroid Crisis Severity",
      reason: "Mental status is a severity criterion in thyroid storm and myxedema coma and should be active safety data.",
      diagnosticTarget: "Thyroid emergency severity: agitation, delirium, somnolence, coma, or inability to participate in care.",
      management: "Altered mental status changes ICU/airway/temperature strategy, endocrine escalation, and urgency of empiric treatment.",
      bedsideQuestion: "Any new confusion, agitation, unusual sleepiness, hypothermia, fever, infection, missed thyroid medication, or iodine/amiodarone exposure?",
      bedsideQuestionOptions: "No / Confusion / Agitation / Somnolence / Fever / Hypothermia / Infection / Medication change / Iodine-amiodarone / Other ___",
      source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; JTA_JES_THYROID_STORM_2016; AHRQ_CALIBRATE_DX",
      matchedTags: ["thyroid_storm", "myxedema", "mental_status"]
    }),
    bundleFloorItem({
      exam_id: "REQ-thyroid-crisis-tests",
      type: "diagnostic_test",
      label: "Thyroid crisis diagnostic and safety tests",
      options: "TSH with free T4 and total/free T3 / ECG for tachyarrhythmia or bradyarrhythmia / Glucose, sodium, potassium, calcium, renal function, liver tests, CBC, and infection evaluation when crisis possible / Cortisol/adrenal coverage consideration before thyroid hormone in myxedema coma when adrenal risk exists / Apply thyroid-storm or myxedema severity scoring only as adjunct to clinical judgment",
      domain: "Tests / Thyroid Crisis",
      reason: "Thyroid emergency workups need thyroid labs plus organ-safety testing and precipitant search, not just a thyroid neck exam.",
      diagnosticTarget: "Thyroid hormone excess/deficiency severity, arrhythmia, electrolyte/glucose disturbance, renal/hepatic dysfunction, infection precipitant, or adrenal risk.",
      management: "Abnormal thyroid, ECG, electrolyte, glucose, infection, or cortisol-risk data changes ICU monitoring, beta-blockade, thionamide/iodine/steroid sequence, thyroid hormone dosing, and precipitant treatment.",
      source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; JTA_JES_THYROID_STORM_2016; AHRQ_CALIBRATE_DX",
      equipment_needed: "lab and ECG review",
      matchedTags: ["thyroid_storm", "myxedema", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-thyroid-crisis-red-flags",
      type: "red_flag",
      label: "Thyroid storm or myxedema escalation cues",
      options: "Fever or hypothermia / Altered mental status / Marked tachycardia, atrial fibrillation, bradycardia, hypotension, or heart failure / Respiratory failure or hypoventilation / Severe hyponatremia, hypoglycemia, or hypothermia / Infection, trauma, surgery, iodine/amiodarone exposure, missed medication, pregnancy/postpartum concern",
      domain: "Red Flags / Thyroid Crisis",
      reason: "Thyroid storm and myxedema coma are clinical emergencies where escalation cues must be explicit.",
      diagnosticTarget: "Thyroid emergency with neurologic, thermoregulatory, cardiovascular, respiratory, electrolyte, or precipitant danger.",
      management: "These cues change ED/ICU disposition, empiric treatment sequence, airway/temperature management, ECG monitoring, infection search, and endocrine consultation urgency.",
      source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; JTA_JES_THYROID_STORM_2016; AHRQ_CALIBRATE_DX",
      matchedTags: ["thyroid_storm", "myxedema", "red_flag"]
    })
  ],
  lymph_malignancy: [
    bundleFloorItem({
      exam_id: "REQ-lymph-malignancy-regional-nodes",
      type: "exam_maneuver",
      label: "Regional lymph node exam",
      options: "None enlarged / Localized tender mobile / Generalized / Fixed or matted / Supraclavicular / Unable",
      domain: "Regional Nodes",
      reason: "Lymphadenopathy, B symptoms, neck mass, or malignancy concern should produce one focused nodal exam rather than separate station cards.",
      diagnosticTarget: "Nodal pattern: localized versus generalized adenopathy, tenderness, mobility, fixation/matting, asymmetry, or supraclavicular involvement.",
      management: "Abnormal, fixed, generalized, persistent, or supraclavicular nodes can change infection versus malignancy framing, imaging or biopsy threshold, specialty referral, and follow-up urgency.",
      bedsideQuestion: "Any enlarging neck, axillary, or groin lumps; fever, night sweats, weight loss, sore throat, dental or skin source, tobacco/alcohol risk, or prior malignancy?",
      bedsideQuestionOptions: "No / Local lump / Generalized lumps / Fever / Night sweats / Weight loss / Throat-dental-skin source / Tobacco-alcohol / Prior malignancy / Other ___",
      source: "JAMA_RCE; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      source_citation: "JAMA Rational Clinical Examination; McGee Evidence-Based Physical Diagnosis; AHRQ Calibrate Dx",
      evidenceTier: "B",
      difficulty: "easy",
      time_burden_minutes: "2",
      equipment_needed: "none",
      patient_cooperation_required: "low",
      matchedTags: ["lymphadenopathy", "malignancy", "infection", "regional_nodes", "neck_mass"],
      satisfiedBy: /\b(?:regional lymph node exam|regional lymph nodes|regional cervical lymph nodes)\b/i
    })
  ],
  routine_thyroid: [
    bundleFloorItem({
      exam_id: "REQ-routine-thyroid-tests",
      type: "diagnostic_test",
      label: "Routine thyroid diagnostic tests and thresholds",
      options: "TSH as initial test for most routine thyroid dysfunction / Free T4 when TSH abnormal or central disease suspected / Total or free T3 when thyrotoxicosis suspected / TRAb/TSI when Graves likely or pregnancy-relevant / TPO antibodies when autoimmune hypothyroidism framing matters / Thyroid ultrasound for palpable nodule, goiter, compressive symptoms, suspicious nodes, or cancer risk, not for nonspecific abnormal labs alone",
      domain: "Tests / Thyroid",
      reason: "Routine thyroid evaluation needs the lab and ultrasound pathway stated so bedside phenotype findings are interpreted safely.",
      diagnosticTarget: "Primary or central hypo/hyperthyroidism, Graves disease, autoimmune thyroiditis, thyroid nodule/cancer risk, or compressive structural disease.",
      management: "TSH/free T4/T3, antibodies, and ultrasound findings change medication decisions, beta-blocker use, uptake/imaging pathway, FNA referral, pregnancy safety, and follow-up interval.",
      source: "ATA_HYPOTHYROIDISM_2014; AACE_ATA_HYPOTHYROIDISM_2012; ATA_HYPERTHYROIDISM_2016; ATA_THYROID_NODULE_DTC_2015; ATA_THYROID_CANCER_2025; ETA_THYROID_NODULE_2023",
      matchedTags: ["thyroid_disease", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-routine-thyroid-red-flags",
      type: "red_flag",
      label: "Thyroid escalation and structural red flags",
      options: "Thyroid storm or myxedema features / New atrial fibrillation or decompensated heart failure / Pregnancy or immediate pregnancy plans with uncontrolled thyroid disease / Rapidly enlarging neck mass / Hoarseness, dysphagia, dyspnea, stridor, fixation, or suspicious cervical nodes / Eye pain, diplopia, reduced vision, or corneal exposure concern",
      domain: "Red Flags / Thyroid",
      reason: "Routine thyroid workups must visibly separate routine lab follow-up from crisis, pregnancy, cardiac, compressive, cancer, and orbitopathy danger cues.",
      diagnosticTarget: "Thyroid emergency, pregnancy-critical thyroid disease, cardiac complication, compressive goiter, thyroid malignancy risk, or sight-threatening orbitopathy.",
      management: "These cues change urgency of endocrine/ENT/ophthalmology referral, ECG/ED escalation, pregnancy-safe therapy, ultrasound/FNA pathway, airway planning, and treatment timing.",
      bedsideQuestion: "Any fever/confusion, severe cold intolerance/somnolence, palpitations or atrial fibrillation, pregnancy, rapid neck growth, hoarseness, dysphagia, dyspnea/stridor, or eye pain/diplopia/vision loss?",
      bedsideQuestionOptions: "No / Crisis symptoms / AF-palpitations / Pregnancy / Rapid neck growth / Hoarseness / Dysphagia / Dyspnea-stridor / Eye pain-diplopia-vision loss / Other ___",
      source: "ATA_HYPERTHYROIDISM_2016; ATA_HYPOTHYROIDISM_2014; ATA_THYROID_NODULE_DTC_2015; ATA_THYROID_CANCER_2025; AHRQ_CALIBRATE_DX",
      matchedTags: ["thyroid_disease", "red_flag"]
    })
  ],
  diabetes_foot_neuropathy: [
    bundleFloorItem({
      exam_id: "REQ-diabetes-foot-tests",
      type: "diagnostic_test",
      label: "Diabetes foot and neuropathy tests",
      options: "10-g monofilament or Ipswich touch plus at least one additional sensory modality such as pinprick, vibration, or temperature / Inspect skin, deformity, footwear, ulcer or wound / Palpate pedal pulses and consider ABI/toe pressures when PAD suspected / Wound culture only for clinically infected wounds after cleansing/debridement when appropriate / Imaging when deep infection, osteomyelitis, Charcot, foreign body, or fracture concern",
      domain: "Tests / Foot Risk",
      reason: "Diabetes foot workups need protective sensation, perfusion, wound infection, and imaging logic tied to ADA foot-care standards.",
      diagnosticTarget: "Loss of protective sensation, PAD, ulcer infection, osteomyelitis, Charcot arthropathy, deformity, footwear risk, or wound-healing risk.",
      management: "Positive findings change podiatry/wound care, offloading, vascular referral, antibiotics, imaging, footwear, discharge safety, and follow-up interval.",
      source: "ADA_FOOT_CARE_2026; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      matchedTags: ["diabetes_foot", "neuropathy", "monofilament", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-diabetes-foot-red-flags",
      type: "red_flag",
      label: "Diabetes foot urgent-risk cues",
      options: "New or worsening ulcer / Spreading erythema, warmth, drainage, odor, crepitus, necrosis, or systemic symptoms / Ischemic rest pain, absent pulses, dusky/cold foot, or gangrene / Probe-to-bone or osteomyelitis concern / Acute Charcot concern: warm swollen red foot with neuropathy / Inability to offload or safely inspect feet after discharge",
      domain: "Red Flags / Diabetes Foot",
      reason: "Foot and neuropathy workups must surface infection, ischemia, osteomyelitis, Charcot, and discharge-safety danger cues.",
      diagnosticTarget: "Limb-threatening infection, ischemia, osteomyelitis, Charcot neuroarthropathy, or unsafe discharge/self-care context.",
      management: "These cues change same-day podiatry/wound/vascular or ED referral, antibiotics, imaging, offloading, admission, and discharge planning.",
      bedsideQuestion: "Any new wound, drainage, spreading redness, fever, severe pain despite numbness, cold/dusky foot, missing pulses, bone exposure, warm swollen foot, or inability to inspect/offload?",
      bedsideQuestionOptions: "No / Wound / Drainage-redness / Fever / Cold-dusky foot / Absent pulses / Bone exposure / Warm swollen foot / Cannot offload-inspect / Other ___",
      source: "ADA_FOOT_CARE_2026; ADA_STANDARDS_HOSPITAL_2026; AHRQ_CALIBRATE_DX",
      matchedTags: ["diabetes_foot", "red_flag", "wound"]
    })
  ],
  dermatology: [
    bundleFloorItem({
      exam_id: "REQ-derm-skin-inspection",
      type: "exam_maneuver",
      label: "Skin inspection",
      options: "Localized / Generalized / Urticarial / Vesicular / Purpuric / Mucosal involvement / Wound or ulcer / Cellulitic / Unable",
      domain: "Dermatology Morphology",
      reason: "Rash or wound workups require a real morphology/distribution inspection rather than a single generic skin label.",
      diagnosticTarget: "Morphology and distribution: urticaria, cellulitis, abscess, vesicles, purpura, mucosal disease, ulcer/wound, jaundice, infestation, or suspicious lesion.",
      management: "Morphology, mucosal involvement, purpura, infection, ulceration, or rapid spread changes isolation, medication-stop decisions, antimicrobial/allergy treatment, biopsy/referral, and escalation.",
      bedsideQuestion: "Any new medicine, fever, rapid spread, skin pain, mucosal sores, facial/lip/tongue swelling, wheeze, wound drainage, travel/bite exposure, or immunosuppression?",
      bedsideQuestionOptions: "No / New medicine / Fever / Rapid spread / Skin pain / Mucosal sores / Swelling-wheeze / Drainage / Bite-travel / Immunosuppressed / Other ___",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
      matchedTags: ["skin", "rash", "skin_inspection", "wound"]
    }),
    bundleFloorItem({
      exam_id: "REQ-derm-tests",
      type: "diagnostic_test",
      label: "Dermatology source-directed tests",
      options: "No routine tests for clearly benign localized rash / CBC-CMP or inflammatory markers when fever, toxicity, purpura, severe drug eruption, or systemic illness / Wound culture when purulent or severe infection and after appropriate specimen collection / KOH, scabies prep, viral PCR, biopsy, or dermatology referral when morphology, immunosuppression, mucosal involvement, nonhealing lesion, or diagnostic uncertainty warrants",
      domain: "Tests / Skin",
      reason: "Skin workups should state when testing is unnecessary versus when systemic, infectious, or biopsy pathways are needed.",
      diagnosticTarget: "Benign rash, cellulitis/abscess, drug eruption, vasculitis/purpura, infestation/fungal/viral cause, nonhealing or malignant lesion, or systemic disease.",
      management: "Testing or biopsy/referral changes antibiotic/antiviral/antifungal therapy, medication discontinuation, isolation, cancer evaluation, and escalation.",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
      matchedTags: ["skin", "rash", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-derm-red-flags",
      type: "red_flag",
      label: "Dermatology danger cues",
      options: "Mucosal involvement / Skin pain, necrosis, bullae, crepitus, or rapidly spreading erythema / Petechiae or purpura with fever or toxicity / Facial, lip, tongue swelling, wheeze, hypotension, or anaphylaxis concern / New high-risk medication or widespread drug eruption / Immunocompromised host / Nonhealing, bleeding, rapidly changing, or asymmetric lesion",
      domain: "Red Flags / Skin",
      reason: "Rash output must catch the high-risk misses: anaphylaxis, severe drug eruption, necrotizing infection, purpura/sepsis, and suspicious lesions.",
      diagnosticTarget: "Life-threatening rash, severe cutaneous adverse reaction, necrotizing infection, meningococcemia/vasculitis, anaphylaxis, immunocompromised infection, or skin cancer risk.",
      management: "These cues change ED/airway escalation, medication cessation, cultures/antibiotics, isolation, urgent dermatology/surgery referral, biopsy, and disposition.",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
      matchedTags: ["skin", "rash", "red_flag", "anaphylaxis"]
    })
  ],
  eye_vision: [
    bundleFloorItem({
      exam_id: "REQ-eye-tests",
      type: "diagnostic_test",
      label: "Red eye and vision workup tests",
      options: "Visual acuity for every eye complaint / Fluorescein staining when pain, trauma, contact lens use, foreign body, or corneal process possible / Intraocular pressure when acute glaucoma possible and no open-globe concern / Slit lamp or ophthalmology evaluation when vision loss, severe pain, photophobia, corneal opacity, trauma, or diagnostic uncertainty / Neuroimaging or stroke pathway when diplopia, field loss, or focal neurologic signs",
      domain: "Tests / Eye",
      reason: "Red eye and vision complaints need visual acuity plus source-directed ocular tests; bedside conjunctival appearance alone is not enough.",
      diagnosticTarget: "Conjunctivitis, keratitis/corneal abrasion, uveitis, acute angle closure glaucoma, orbital cellulitis, open globe, retinal/optic nerve disease, or neurologic vision loss.",
      management: "Visual acuity loss, corneal staining, high IOP, trauma, or neurologic findings change ophthalmology/ED referral, antibiotics, glaucoma treatment, imaging, and precautions.",
      source: "AAO_CONJUNCTIVITIS_PPP_2023; AHRQ_CALIBRATE_DX; JAMA_RCE",
      equipment_needed: "visual acuity card, fluorescein/blue light or referral pathway as available",
      matchedTags: ["eye_vision", "visual_acuity", "red_eye", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-eye-red-flags",
      type: "red_flag",
      label: "Eye and vision red flags",
      options: "Vision loss or reduced acuity / Severe eye pain or photophobia / Contact lens with pain/redness / Trauma, chemical exposure, or open-globe concern / Corneal opacity or dendritic lesion / Irregular pupil, fixed mid-dilated pupil, headache/vomiting with eye pain / Proptosis, painful EOM, fever, or orbital cellulitis concern / Diplopia, field cut, or focal neurologic signs",
      domain: "Red Flags / Eye",
      reason: "Eye complaints require explicit sight-threatening and neurologic red flags.",
      diagnosticTarget: "Keratitis, uveitis, acute glaucoma, open globe, chemical injury, orbital cellulitis, optic/retinal disease, or neurologic emergency.",
      management: "These cues change same-day ophthalmology/ED referral, fluorescein/IOP/slit-lamp testing, imaging, antibiotics/antivirals, and vision-protective precautions.",
      source: "AAO_CONJUNCTIVITIS_PPP_2023; AHRQ_CALIBRATE_DX",
      matchedTags: ["eye_vision", "red_flag", "vision_change"]
    })
  ],
  heent_focused: [
    bundleFloorItem({
      exam_id: "REQ-heent-regional-cervical-nodes",
      type: "exam_maneuver",
      label: "Regional cervical lymph nodes",
      options: "Not enlarged / Tender mobile / Enlarged / Fixed or matted / Supraclavicular / Unable",
      domain: "Regional Nodes",
      reason: "HEENT, throat, neck infection, or head-and-neck malignancy concern needs one regional-node assessment rather than multiple station-specific cards.",
      diagnosticTarget: "Regional HEENT source clue: tender reactive adenopathy, asymmetric enlargement, fixed/matted nodes, or supraclavicular involvement.",
      management: "Nodal findings can change viral/strep/dental/skin source localization, deep-neck infection concern, imaging or ENT referral, malignancy follow-up, and biopsy threshold.",
      bedsideQuestion: "Any sore throat, fever, neck swelling, dysphagia, hoarseness, dental pain, skin/scalp source, weight loss, night sweats, tobacco or alcohol risk?",
      bedsideQuestionOptions: "No / Sore throat / Fever / Neck swelling / Dysphagia / Hoarseness / Dental-skin source / Weight loss-night sweats / Tobacco-alcohol / Other ___",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD; SM25",
      source_citation: "AHRQ Calibrate Dx; McGee Evidence-Based Physical Diagnosis; Stanford Medicine 25 bedside exam resources",
      evidenceTier: "B",
      difficulty: "easy",
      time_burden_minutes: "1.5",
      equipment_needed: "none",
      patient_cooperation_required: "low",
      matchedTags: ["heent", "infection", "lymphadenopathy", "neck_mass", "sore_throat", "regional_nodes"],
      when: /\b(?:sore throat|pharyngitis|lymph|adenopathy|neck mass|dysphagia|fever|malignancy|weight loss|hoarse|dental|skin source)\b/,
      unless: /\b(?:thyroid cancer|thyroid malignancy|lymphoma|metastatic|known malignancy)\b/,
      satisfiedBy: /\b(?:regional cervical lymph nodes|regional lymph node exam|regional lymph nodes)\b/i
    }),
    bundleFloorItem({
      exam_id: "REQ-heent-tests",
      type: "diagnostic_test",
      label: "Focused HEENT diagnostic tests",
      options: "Rapid strep or throat culture when Centor/McIsaac-compatible pharyngitis and no clear viral syndrome / COVID, influenza, RSV, or respiratory viral testing when epidemiology or treatment/isolation decisions change / Hearing evaluation or tympanometry/audiology when hearing loss or persistent otologic symptoms / Imaging or urgent ENT pathway when deep neck infection, mastoiditis, peritonsillar abscess, airway compromise, epistaxis instability, or malignancy red flags are present",
      domain: "Tests / HEENT",
      reason: "HEENT workups need testing tied to source and danger patterns, not just a long list of mouth/ear/nose maneuvers.",
      diagnosticTarget: "Strep pharyngitis, viral respiratory infection, otitis/hearing loss, sinusitis complication, deep neck infection, mastoiditis, epistaxis severity, or malignancy/airway risk.",
      management: "Test results and imaging/ENT triggers change antibiotics, antivirals/isolation, airway planning, drainage, epistaxis control, and referral urgency.",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
      matchedTags: ["heent", "sore_throat", "ear_pain", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-heent-red-flags",
      type: "red_flag",
      label: "HEENT airway, infection, and malignancy red flags",
      options: "Stridor, drooling, muffled voice, tripod position, or respiratory distress / Trismus, uvular deviation, neck swelling, toxic appearance, or severe unilateral throat pain / Mastoid tenderness, facial weakness, severe headache, meningismus, or neurologic signs / Epistaxis with hypotension, anticoagulation, posterior bleeding, or airway compromise / Dysphagia, odynophagia, hoarseness, neck mass, weight loss, or tobacco/alcohol cancer risk",
      domain: "Red Flags / HEENT",
      reason: "HEENT complaints can hide airway compromise, deep-space infection, mastoiditis, posterior epistaxis, and malignancy.",
      diagnosticTarget: "Airway emergency, peritonsillar/deep neck infection, mastoiditis/intracranial complication, significant epistaxis, or head-and-neck malignancy risk.",
      management: "These cues change ED/ENT escalation, airway readiness, imaging, drainage, antibiotics, epistaxis intervention, and cancer referral.",
      source: "AHRQ_CALIBRATE_DX; MCGEE_EBPD",
      matchedTags: ["heent", "airway", "red_flag"]
    })
  ],
  heme_bleeding_anemia: [
    bundleFloorItem({
      exam_id: "REQ-bleeding-anemia-tests",
      type: "diagnostic_test",
      label: "Bleeding and anemia tests and thresholds",
      options: "CBC with hemoglobin/platelets / Reticulocyte count, iron studies, B12/folate, hemolysis labs when anemia source unclear / PT/INR, PTT, fibrinogen, medication/anticoagulant review when bleeding or bruising / Type and screen/crossmatch when active, significant, or GI bleeding possible / For overt upper GI bleeding use risk stratification and consider transfusion threshold around Hgb <7 g/dL in stable hospitalized patients, with higher threshold individualized for active ischemia or instability",
      domain: "Tests / Bleeding And Anemia",
      reason: "Bleeding/anemia workups must include hemoglobin/platelets, coagulation, type-screen, and GI bleed thresholds when relevant.",
      diagnosticTarget: "Anemia severity, thrombocytopenia, coagulopathy, hemolysis, nutrient deficiency, active GI bleeding, or transfusion/endoscopy risk.",
      management: "Results change transfusion, reversal, endoscopy timing, admission, iron/B12 treatment, hematology/GI referral, and medication holds.",
      source: "ACG_UGIB_2021; JAMA_RCE; AHRQ_CALIBRATE_DX",
      matchedTags: ["bleeding", "anemia", "CBC", "type_screen", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-bleeding-anemia-red-flags",
      type: "red_flag",
      label: "Bleeding and anemia escalation cues",
      options: "Hypotension, tachycardia, syncope, chest pain, dyspnea, altered mental status, or ongoing brisk bleeding / Hematemesis, melena, hematochezia, or black stool with instability / Anticoagulant or antiplatelet use with significant bleeding / Platelet-type bleeding: diffuse petechiae, mucosal bleeding, or severe thrombocytopenia concern / Heavy uterine bleeding with pregnancy possibility / Severe anemia symptoms or known cardiovascular disease",
      domain: "Red Flags / Bleeding",
      reason: "Bleeding workups must distinguish stable bruising from hemodynamically important or organ-threatening bleeding.",
      diagnosticTarget: "Hemodynamic instability, active GI bleed, anticoagulant-associated bleeding, thrombocytopenic bleeding, pregnancy-related bleeding, or symptomatic severe anemia.",
      management: "These cues change ED/admission threshold, transfusion/type-screen, anticoagulant reversal, endoscopy timing, pregnancy evaluation, and specialist consultation.",
      source: "ACG_UGIB_2021; JAMA_RCE; AHRQ_CALIBRATE_DX",
      matchedTags: ["bleeding", "anemia", "red_flag"]
    })
  ],
  focused_msk: [
    bundleFloorItem({
      exam_id: "REQ-msk-focused-site-inspection",
      type: "exam_maneuver",
      label: "Focused painful-site inspection",
      options: "Normal / Swelling / Deformity / Erythema / Wound / Bruising / Unable",
      domain: "Focused MSK Basics",
      reason: "Every MSK workup needs an atomic inspection step for the symptomatic site before special tests are chosen.",
      diagnosticTarget: "Visible inflammation, deformity, wound, asymmetry, swelling, erythema, or trauma pattern at the symptomatic site.",
      management: "Deformity, wound, erythema, or marked swelling changes imaging, infection, trauma, immobilization, aspiration, or urgent referral decisions.",
      bedsideQuestion: "Which exact joint or body area hurts most, and was there trauma, fever, swelling, redness, wound, or inability to bear weight?",
      bedsideQuestionOptions: "Joint/site ___ / Trauma / Fever / Swelling / Redness / Wound / Cannot bear weight / Other ___",
      source: "AAFP_MONOARTHRITIS_2025; SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      matchedTags: ["musculoskeletal", "inspection", "site_specific"]
    }),
    bundleFloorItem({
      exam_id: "REQ-msk-focused-site-palpation",
      type: "exam_maneuver",
      label: "Focused painful-site palpation",
      options: "Nontender / Focal tenderness / Warmth / Effusion / Bony tenderness / Unable",
      domain: "Focused MSK Basics",
      reason: "Palpation must be separate from inspection and ROM so warmth, effusion, and bony tenderness remain visible.",
      diagnosticTarget: "Focal tenderness, warmth, effusion, bony tenderness, or soft-tissue tenderness at the symptomatic site.",
      management: "Focal bony tenderness, warmth, or effusion changes imaging threshold, septic/inflammatory arthritis concern, aspiration consideration, and activity restriction.",
      source: "AAFP_MONOARTHRITIS_2025; SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      matchedTags: ["musculoskeletal", "palpation", "site_specific"]
    }),
    bundleFloorItem({
      exam_id: "REQ-msk-focused-site-rom",
      type: "exam_maneuver",
      label: "Focused painful-site range of motion",
      options: "Full / Limited active / Limited passive / Painful / Blocked / Unable",
      domain: "Focused MSK Basics",
      reason: "Active/passive motion is its own maneuver and should not be bundled with strength, gait, or special tests.",
      diagnosticTarget: "Active or passive range-of-motion limitation, painful arc, mechanical block, weakness-limited movement, or inability to bear/use the site.",
      management: "Loss of passive ROM, severe pain with movement, or inability to bear/use the site changes concern for septic arthritis, fracture, tendon injury, immobilization, imaging, or urgent evaluation.",
      source: "AAFP_MONOARTHRITIS_2025; SM25; MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      matchedTags: ["musculoskeletal", "range_of_motion", "site_specific"]
    }),
    bundleFloorItem({
      exam_id: "REQ-msk-tests",
      type: "diagnostic_test",
      label: "Focused MSK tests and imaging pathway",
      options: "Plain radiographs when trauma, deformity, bony tenderness, inability to bear weight/use limb, osteoporosis/steroid risk, or Ottawa-style rule criteria apply / Arthrocentesis with cell count, Gram stain/culture, and crystal analysis when acute hot swollen atraumatic joint or septic arthritis/crystal concern / CBC, ESR/CRP, blood cultures when fever, immunosuppression, prosthetic joint, or systemic infection concern / MRI or advanced imaging for neurologic deficit, occult fracture, osteomyelitis, malignancy, tendon rupture, or persistent severe symptoms",
      domain: "Tests / MSK",
      reason: "MSK workups need imaging and aspiration/lab pathways tied to exam findings rather than only bedside maneuvers.",
      diagnosticTarget: "Fracture/dislocation, septic arthritis, crystal arthritis, osteomyelitis, inflammatory arthritis, malignancy, tendon injury, or serious spine disease.",
      management: "Results change immobilization, aspiration/antibiotics, orthopedic/rheumatology referral, imaging escalation, weight-bearing restrictions, and disposition.",
      source: "AAFP_MONOARTHRITIS_2025; ACP_LOW_BACK_PAIN_2017; AHRQ_CALIBRATE_DX",
      matchedTags: ["msk_exam", "imaging", "septic_arthritis", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-msk-red-flags",
      type: "red_flag",
      label: "MSK infection, fracture, and neurologic red flags",
      options: "Fever, hot swollen joint, immunosuppression, prosthetic joint, IVDU, or overlying cellulitis / Open wound, deformity, neurovascular compromise, severe trauma, or inability to bear weight/use limb / Progressive weakness, bowel/bladder dysfunction, saddle anesthesia, or bilateral neurologic symptoms / Cancer history, unexplained weight loss, night pain, chronic steroids, osteoporosis, or infection risk",
      domain: "Red Flags / MSK",
      reason: "MSK complaints must surface septic arthritis, fracture/dislocation, neurovascular compromise, cord compression, infection, and malignancy danger patterns.",
      diagnosticTarget: "Septic arthritis, open fracture/dislocation, acute limb ischemia/nerve injury, cauda equina/cord compression, osteomyelitis, malignancy, or compression fracture.",
      management: "These cues change ED/orthopedic/spine referral, urgent imaging, arthrocentesis, antibiotics, immobilization, and neurovascular monitoring.",
      source: "AAFP_MONOARTHRITIS_2025; ACP_LOW_BACK_PAIN_2017; AHRQ_CALIBRATE_DX",
      matchedTags: ["msk_exam", "red_flag", "septic_arthritis"]
    })
  ],
  neuromuscular_cramps: [
    bundleFloorItem({
      exam_id: "REQ-cramps-focused-muscle-tenderness",
      type: "exam_maneuver",
      label: "Focused muscle tenderness",
      options: "Absent / Focal tenderness / Diffuse tenderness / Swelling / Compartment firmness / Unable",
      domain: "Muscle Exam",
      reason: "Cramps/myalgia need an atomic muscle tenderness assessment before broad neuro testing is considered.",
      diagnosticTarget: "Muscle injury or inflammatory clue: focal tenderness, swelling, diffuse pain, severe tenderness, or compartment concern.",
      management: "Marked tenderness, swelling, or dark urine changes CK/renal testing, medication/toxin review, hydration strategy, compartment/rhabdomyolysis escalation, and follow-up.",
      bedsideQuestion: "Any severe muscle pain, weakness, swelling, dark urine, heavy exercise, heat exposure, statin or toxin exposure, vomiting/diarrhea, or diuretic use?",
      bedsideQuestionOptions: "No / Severe pain / Weakness / Swelling / Dark urine / Exercise-heat / Statin-toxin / Vomiting-diarrhea / Diuretic / Other ___",
      source: "MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      matchedTags: ["muscle_cramps", "myalgia", "muscle_tenderness"]
    }),
    bundleFloorItem({
      exam_id: "REQ-cramps-tests",
      type: "diagnostic_test",
      label: "Muscle cramps metabolic and injury tests",
      options: "BMP/CMP with sodium, potassium, bicarbonate, creatinine, calcium, magnesium, and glucose when persistent, severe, systemic, medication-related, or dehydration concern / CK and urinalysis for myoglobin when severe myalgia, weakness, swelling, dark urine, heat/exertion, statin/toxin, or rhabdomyolysis concern / TSH, vitamin D, PTH, or medication review when chronic or endocrine pattern fits / ECG when marked potassium, calcium, or magnesium abnormality is possible",
      domain: "Tests / Cramps",
      reason: "Cramps become clinically meaningful when they suggest electrolyte, renal, endocrine, medication, or muscle-injury risk.",
      diagnosticTarget: "Electrolyte disturbance, AKI/dehydration, hypoglycemia, rhabdomyolysis, thyroid/parathyroid/vitamin D disease, medication toxicity, or arrhythmia risk.",
      management: "Abnormal electrolytes, CK, renal function, glucose, or ECG changes fluid/electrolyte correction, medication holds, ED/admission, and endocrine/neurology workup.",
      source: "MCGEE_EBPD; ES_HYPOGLYCEMIA_2009; AHRQ_CALIBRATE_DX",
      matchedTags: ["muscle_cramps", "electrolytes", "CK", "diagnostic_test"]
    }),
    bundleFloorItem({
      exam_id: "REQ-cramps-red-flags",
      type: "red_flag",
      label: "Muscle cramps danger cues",
      options: "True weakness or progressive neurologic deficit / Dark urine, severe diffuse myalgia, swelling, heat illness, exertion, statin/toxin exposure, or rhabdomyolysis concern / Tetany, carpopedal spasm, seizure, or arrhythmia symptoms / Severe dehydration, vomiting/diarrhea, AKI/oliguria, or dangerous electrolyte history / Compartment-like severe pain with tense swelling",
      domain: "Red Flags / Cramps",
      reason: "Cramps should not be dismissed when they overlap with rhabdomyolysis, electrolyte crisis, neurologic deficit, dehydration/AKI, or compartment syndrome.",
      diagnosticTarget: "Rhabdomyolysis, electrolyte emergency, AKI/dehydration, neurologic disease, compartment syndrome, or arrhythmia risk.",
      management: "These cues change urgent labs, ECG, fluids, medication/toxin holds, ED referral, compartment evaluation, and neurology/endocrine escalation.",
      source: "MCGEE_EBPD; AHRQ_CALIBRATE_DX",
      matchedTags: ["muscle_cramps", "red_flag", "rhabdomyolysis"]
    })
  ]
};

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

function normalizeIntentSuppressRuleTrace(rule = {}, intentId = "") {
  const objectRule = typeof rule === "object" && rule !== null
    ? rule
    : { suppress_labels: rule };
  const suppressLabels = unique(traceArray(objectRule.suppress_labels || objectRule.avoid_labels || objectRule.label || ""));
  if (!suppressLabels.length) {
    return null;
  }
  return {
    rule_id: String(objectRule.rule_id || `${intentId || "intent"}_suppress_${normalizeEvidenceLabel(suppressLabels[0]).replace(/\s+/g, "_") || "item"}`).trim(),
    intent_ids: unique(traceArray(objectRule.intent_ids || objectRule.intent_id || intentId)),
    suppress_labels: suppressLabels,
    reason: String(objectRule.reason || `Suppress ${suppressLabels.join("; ")} unless the selected intent or patient modifiers support that clinical context.`).trim(),
    unless_tags_include: unique(traceArray(objectRule.unless_tags_include || objectRule.unless_context_tags || objectRule.when_context_has || "")),
    rule_scope: String(objectRule.rule_scope || "validated_intent_suppress_unless_triggered").trim()
  };
}

function parseIntentSuppressRulesLine(value = "", intentId = "") {
  const text = String(value || "").trim();
  if (!text || /^none$/i.test(text)) {
    return [];
  }
  return text.split(/\s+\|\s+/).map((part, index) => {
    const trimmed = part.trim();
    const ruleIdMatch = trimmed.match(/^([^:]+):/);
    const suppressMatch = trimmed.match(/\bsuppress\s+([^;]+)/i);
    const unlessMatch = trimmed.match(/\bunless tags\s+([^;]+)/i);
    const reasonMatch = trimmed.match(/\breason\s+(.+)$/i);
    return normalizeIntentSuppressRuleTrace({
      rule_id: ruleIdMatch ? ruleIdMatch[1].trim() : `${intentId || "intent"}_context_suppress_${index + 1}`,
      intent_ids: [intentId].filter(Boolean),
      suppress_labels: suppressMatch ? splitEvidenceList(suppressMatch[1]) : splitEvidenceList(trimmed),
      unless_tags_include: unlessMatch ? splitEvidenceList(unlessMatch[1]) : [],
      reason: reasonMatch ? reasonMatch[1].trim() : ""
    }, intentId);
  }).filter(Boolean);
}

function uniqueObjectsBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeValidatedIntentTrace(intentRow = {}) {
  const intentId = String(intentRow.intent_id || intentRow.id || "").trim();
  if (!intentId) {
    return null;
  }
  const suppressRules = uniqueObjectsBy(
    traceArray(intentRow.suppress_rules || [])
      .map((rule) => normalizeIntentSuppressRuleTrace(rule, intentId))
      .filter(Boolean),
    (rule) => `${rule.rule_id}::${(rule.suppress_labels || []).join("|")}`
  );
  const suppressLabels = unique(suppressRules.flatMap((rule) => rule.suppress_labels || []));
  return {
    intent_id: intentId,
    label: String(intentRow.label || intentId).trim(),
    status: String(intentRow.status || "").trim(),
    complaint_module_id: String(intentRow.complaint_module_id || "").trim(),
    source_ids: unique(traceArray(intentRow.source_ids || "")),
    evidence_tags: unique(traceArray(intentRow.evidence_tags || "")),
    clinical_bundle_ids: unique(traceArray(intentRow.clinical_bundle_ids || "")),
    required_domains: unique(traceArray(intentRow.required_domains || "")),
    avoid_labels: unique([...traceArray(intentRow.avoid_labels || ""), ...suppressLabels]),
    suppress_rules: suppressRules.length ? suppressRules : suppressLabels.map((label) => normalizeIntentSuppressRuleTrace(label, intentId)).filter(Boolean),
    knowledge_pack_id: String(intentRow.knowledge_pack_id || intentRow.pack_id || "").trim(),
    review_owner: String(intentRow.review_owner || "clinical_content_lead").trim(),
    last_reviewed: String(intentRow.last_reviewed || "").trim()
  };
}

function validatedIntentTraceFromContext(rawContext = "", optionIntents = []) {
  const traces = [];
  const seen = new Set();
  const addTrace = (trace) => {
    const normalized = normalizeValidatedIntentTrace(trace);
    if (!normalized || seen.has(normalized.intent_id)) {
      return;
    }
    traces.push(normalized);
    seen.add(normalized.intent_id);
  };

  optionIntents.forEach(addTrace);

  let current = null;
  const flushCurrent = () => {
    if (current?.intent_id) {
      addTrace(current);
    }
    current = null;
  };

  String(rawContext || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      const promptIntentMatch = trimmed.match(/^-\s*([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
      if (promptIntentMatch) {
        flushCurrent();
        current = {
          intent_id: promptIntentMatch[1],
          label: promptIntentMatch[2]
        };
        return;
      }

      const intentLabelMatch = trimmed.match(/^intent\s*:\s*(.+)$/i);
      if (intentLabelMatch) {
        flushCurrent();
        current = { label: intentLabelMatch[1] };
        return;
      }

      if (!current) {
        current = {};
      }

      const idMatch = trimmed.match(/^intent_id\s*:\s*(.+)$/i);
      if (idMatch) {
        current.intent_id = idMatch[1].trim();
        return;
      }

      const sourceMatch = trimmed.match(/^sources?\s*:\s*(.+)$/i);
      if (sourceMatch) {
        current.source_ids = splitEvidenceList(sourceMatch[1]);
        return;
      }

      const tagMatch = trimmed.match(/^(?:intent tags?|evidence tags?)\s*:\s*(.+)$/i);
      if (tagMatch) {
        current.evidence_tags = splitEvidenceList(tagMatch[1]);
        return;
      }

      const bundleMatch = trimmed.match(/^clinical bundles?\s*:\s*(.+)$/i);
      if (bundleMatch) {
        current.clinical_bundle_ids = splitEvidenceList(bundleMatch[1]);
        return;
      }

      const domainMatch = trimmed.match(/^required domains?\s*:\s*(.+)$/i);
      if (domainMatch) {
        current.required_domains = splitEvidenceList(domainMatch[1]);
        return;
      }

      const avoidMatch = trimmed.match(/^avoid labels?\s*:\s*(.+)$/i);
      if (avoidMatch) {
        current.avoid_labels = splitEvidenceList(avoidMatch[1]);
        return;
      }

      const suppressRulesMatch = trimmed.match(/^suppress rules?\s*:\s*(.+)$/i);
      if (suppressRulesMatch) {
        current.suppress_rules = parseIntentSuppressRulesLine(suppressRulesMatch[1], current.intent_id || "");
      }
    });

  flushCurrent();
  return traces;
}

function traceArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return splitEvidenceList(value || "");
}

function registryStyleSourceId(value = "") {
  const text = String(value || "").trim();
  return /^[A-Z][A-Z0-9_:-]{1,}$/.test(text)
    && !/^https?:\/\//i.test(text)
    && !/\s/.test(text)
    && !/[.,()]/.test(text);
}

function traceSourceIdArray(...values) {
  return unique(values
    .flatMap((value) => traceArray(value))
    .map((value) => String(value || "").trim())
    .filter(registryStyleSourceId));
}

function recommendationTraceability(entry = {}, intentTrace = []) {
  const candidate = entry.candidate || entry;
  const prior = typeof entry.traceability === "object" && entry.traceability
    ? entry.traceability
    : {};
  const candidatePrior = typeof candidate.traceability === "object" && candidate.traceability
    ? candidate.traceability
    : {};
  const intentIds = unique([
    ...traceArray(prior.intent_ids),
    ...traceArray(candidatePrior.intent_ids),
    ...traceArray(entry.validatedIntentIds),
    ...traceArray(candidate.validated_intent_ids),
    ...intentTrace.map((trace) => trace.intent_id)
  ]);
  const intentLabels = unique([
    ...traceArray(prior.intent_labels),
    ...traceArray(candidatePrior.intent_labels),
    ...traceArray(candidate.validated_intent_labels),
    ...intentTrace.map((trace) => trace.label)
  ]);
  const clinicalBundleIds = unique([
    ...traceArray(prior.clinical_bundle_ids),
    ...traceArray(candidatePrior.clinical_bundle_ids),
    ...intentTrace.flatMap((trace) => trace.clinical_bundle_ids || [])
  ]);
  const sourceIds = traceSourceIdArray(
    prior.source_ids,
    candidatePrior.source_ids,
    candidate.source?.source_id,
    candidate.evidence_source_primary,
    candidate.catalog_gap_source_ids,
    intentTrace.flatMap((trace) => trace.source_ids || [])
  );
  const knowledgePackIds = unique([
    ...traceArray(prior.knowledge_pack_id),
    ...traceArray(candidatePrior.knowledge_pack_id),
    ...intentTrace.map((trace) => trace.knowledge_pack_id)
  ]);
  const evidenceRowId = entry.exam_id || candidate.exam_id || prior.evidence_row_id || candidatePrior.evidence_row_id || "";
  const catalogGap = Boolean(entry.catalogGap || candidate.catalogGap || prior.catalog_gap || candidatePrior.catalog_gap);
  const gapType = prior.gap_type
    || candidatePrior.gap_type
    || entry.gap_type
    || candidate.gap_type
    || candidate.item_type
    || "";
  const gapReviewStatus = prior.gap_review_status
    || candidatePrior.gap_review_status
    || entry.catalog_gap_review_status
    || candidate.catalog_gap_review_status
    || (catalogGap ? "staged_gap" : "");
  return {
    ...candidatePrior,
    ...prior,
    intent_ids: intentIds,
    intent_labels: intentLabels,
    clinical_bundle_ids: clinicalBundleIds,
    evidence_row_id: evidenceRowId,
    source_ids: sourceIds,
    knowledge_pack_id: knowledgePackIds.join("; "),
    catalog_gap: catalogGap,
    gap_type: catalogGap ? (gapType || "exam_maneuver") : gapType,
    gap_review_status: gapReviewStatus,
    authorized_by: catalogGap
      ? "staged_catalog_gap"
      : (intentIds.length ? "validated_clinical_intent" : "evidence_catalog")
  };
}

function attachRecommendationTraceability(entry = {}, intentTrace = []) {
  const traceability = recommendationTraceability(entry, intentTrace);
  const candidate = entry.candidate || {};
  return {
    ...entry,
    validatedIntentIds: traceability.intent_ids,
    validatedIntentTrace: intentTrace,
    traceability,
    candidate: {
      ...candidate,
      validated_intent_ids: traceability.intent_ids.join("; "),
      validated_intent_labels: traceability.intent_labels.join("; "),
      traceability
    }
  };
}

function recognizedClinicalBundleIds(rawContext = "") {
  const profileIds = new Set(clinicalRecommendationProfiles.map((profile) => profile.id));
  return new Set(
    Array.from(clinicalBundleIdsFromContext(rawContext))
      .filter((bundleId) => profileIds.has(bundleId))
  );
}

const crossIntentSafetyProfileRules = [
  {
    profileId: "infection_sepsis",
    trigger: /\b(?:fever|febrile|chills|rigors|infection|infectious|sepsis|pneumonia|leukocytosis|hypothermia|toxic appearance|cough|sputum|dyspnea|shortness of breath|pleuritic|hypoxemia|dysuria|urinary|flank|pyelonephritis|rash|wound|line|device|cellulitis|abscess|sore throat|neck stiffness)\b/,
    includeSourceCoreAsConditional: false,
    requiredItemRole: "conditional",
    requiredItemIds: [
      "REQ-infection-respiratory-source-history",
      "REQ-infection-heent-oral-source-history",
      "REQ-infection-urinary-flank-source-history",
      "REQ-infection-abdominal-gi-source-history",
      "REQ-infection-skin-wound-line-source-history",
      "REQ-infection-cns-joint-spine-danger-history",
      "REQ-infection-host-exposure-history",
      "REQ-infection-sepsis-severity-labs",
      "REQ-infection-source-directed-studies",
      "REQ-infection-shock-escalation-cues",
      "REQ-infection-cns-airway-purpura-cues",
      "REQ-infection-work-of-breathing",
      "REQ-infection-posterior-lung-sounds",
      "REQ-infection-skin-source-inspection"
    ],
    warning: "Fever or infection symptoms were entered as modifiers outside the selected fever/sepsis intent. This adds source-localizing infection questions and conditional source exams, but select the validated fever/infection intent if infection is the primary problem."
  },
  {
    profileId: "pregnancy_diabetes_context",
    trigger: /\b(?:currently pregnant|pregnant now|active pregnancy|pregnant patient|gestational age|weeks pregnant|wks pregnant|in pregnancy)\b/,
    selectedContext: /\b(?:diabetes|diabetic|diabetes_mellitus|type[_\s-]*1|type[_\s-]*2|prediabetes|glucose|glycemic|hyperglyc|a1c|inpatient_diabetes)\b/,
    includeSourceCoreAsConditional: false,
    requiredItemRole: "conditional",
    requiredItemIds: [
      "REQ-diabetes-pregnancy-gestational-age-history",
      "REQ-diabetes-pregnancy-risk-history",
      "REQ-diabetes-pregnancy-fetal-obstetric-history",
      "REQ-diabetes-pregnancy-ogtt-thresholds",
      "REQ-diabetes-pregnancy-safety-tests",
      "REQ-diabetes-pregnancy-urgent-cues",
      "REQ-diabetes-pregnancy-postpartum-follow-up"
    ],
    warning: "Active pregnancy was entered as a modifier on a diabetes workup. This adds pregnancy-specific diabetes history, OGTT thresholds, maternal-fetal safety checks, urgent cues, and postpartum follow-up to the primary diabetes output; select the gestational diabetes workup when pregnancy diabetes is the primary question."
  },
  {
    profileId: "neuro_red_flags",
    trigger: /\b(?:stroke|tia|focal(?: neurologic| neuro)?(?: deficit| weakness)?|facial droop|facial weakness|face weakness|face droop|aphasia|hemiparesis|hemiplegia|new unilateral weakness|new weakness on one side|slurred speech|seizure|ataxia|diplopia)\b/,
    warning: "Focal neurologic symptoms were entered as modifiers but the selected validated intent is not a neuro intent. Treat the current workup as incomplete until a validated stroke/focal-neuro intent is added or urgent neurologic evaluation is addressed.",
    requiredGaps: [
      {
        exam_id: "EXAM-010-facial-symmetry",
        label: "Facial symmetry",
        options: "Symmetric / Droop right / Droop left / Unable",
        domain: "Neuro Safety Add-on",
        role: "conditional",
        when: /\b(?:stroke|tia|focal|facial droop|facial weakness|face weakness|face droop|slurred speech|aphasia|hemiparesis)\b/,
        reason: "Adds an atomic cranial nerve VII screen because a focal neurologic modifier was entered outside the selected intent.",
        diagnosticTarget: "Focal neurologic safety screen: facial asymmetry that could indicate central or peripheral facial weakness.",
        management: "New facial asymmetry should prompt urgent neurologic localization, stroke/TIA pathway consideration, imaging/escalation review, and selection of the validated focal-neuro intent.",
        bedsideQuestion: "Any new face droop, slurred speech, trouble speaking, one-sided weakness, numbness, vision change, or trouble walking?",
        bedsideQuestionOptions: "No / Face droop / Speech trouble / One-sided weakness / Numbness / Vision change / Trouble walking / Other ___",
        source: "JAMA_RCE; AHRQ_CALIBRATE_DX; SM25",
        evidenceTier: "A",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["stroke", "weakness", "neuro", "cross_intent_safety"],
        satisfiedBy: /\b(?:facial symmetry|eye closure)\b/
      },
      {
        exam_id: "EXAM-018-pronator-drift",
        label: "Pronator drift",
        options: "Absent / Present right / Present left / Unable",
        domain: "Neuro Safety Add-on",
        role: "conditional",
        when: /\b(?:stroke|tia|focal|weakness|hemiparesis|hemiplegia|aphasia|arm weakness|one-sided weakness)\b/,
        reason: "Adds an atomic upper motor neuron screen because focal weakness was entered outside the selected intent.",
        diagnosticTarget: "Focal neurologic safety screen: subtle unilateral upper motor neuron weakness.",
        management: "A positive pronator drift should prompt urgent localization, stroke/TIA pathway consideration, imaging/escalation review, and selection of the validated focal-neuro intent.",
        bedsideQuestion: "Any new arm weakness, one-sided heaviness, face droop, speech trouble, numbness, or gait change?",
        bedsideQuestionOptions: "No / Arm weakness / One-sided heaviness / Face droop / Speech trouble / Numbness / Gait change / Other ___",
        source: "JAMA_RCE; AHRQ_CALIBRATE_DX; SM25",
        evidenceTier: "A",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "low",
        matchedTags: ["stroke", "weakness", "neuro", "cross_intent_safety"],
        satisfiedBy: /\bpronator drift\b/
      },
      {
        exam_id: "EXAM-005-pupils",
        label: "Pupils",
        options: "Equal/reactive / Unequal / Nonreactive / Unable",
        domain: "Neuro Safety Add-on",
        role: "conditional",
        when: /\b(?:stroke|tia|focal|weakness|headache|vision|diplopia|seizure|altered|confusion)\b/,
        reason: "Adds an atomic cranial nerve/neurologic screen when a focal neurologic modifier appears outside the selected intent.",
        diagnosticTarget: "Focal neurologic safety screen: anisocoria, nonreactivity, or cranial nerve clue.",
        management: "Abnormal pupils with focal symptoms can change urgency of neurologic escalation, imaging review, and stroke/structural lesion evaluation.",
        bedsideQuestion: "Any new headache, vision change, double vision, confusion, seizure, or one-sided weakness?",
        bedsideQuestionOptions: "No / Headache / Vision change / Double vision / Confusion / Seizure / One-sided weakness / Other ___",
        source: "JAMA_RCE; AHRQ_CALIBRATE_DX; SM25",
        evidenceTier: "A",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "penlight",
        patient_cooperation_required: "low",
        matchedTags: ["stroke", "vision_change", "neuro", "cross_intent_safety"],
        satisfiedBy: /\bpupils?\b/
      }
    ]
  }
];

function crossIntentSafetyProfiles(context, validatedBundleIds) {
  if (!validatedBundleIds.size) {
    return [];
  }
  const modifierContext = normalizeEvidenceText(patientModifierContextText(context));
  const fullContext = normalizeEvidenceText(context);
  if (!modifierContext) {
    return [];
  }
  return crossIntentSafetyProfileRules
    .filter((rule) => !validatedBundleIds.has(rule.profileId) && rule.trigger.test(modifierContext))
    .filter((rule) => !rule.selectedContext || rule.selectedContext.test(fullContext))
    .map((rule) => {
      const sourceProfile = clinicalRecommendationProfiles.find((profile) => profile.id === rule.profileId);
      if (!sourceProfile) {
        return null;
      }
      const requiredItemIds = new Set(rule.requiredItemIds || []);
      const sourceRequiredItems = (sourceProfile.requiredItems || [])
        .filter((item) => !requiredItemIds.size || requiredItemIds.has(item.exam_id || item.id))
        .map((item) => ({
          ...item,
          role: rule.requiredItemRole || item.role || "conditional",
          domain: item.domain ? `${item.domain} Add-on` : "Modifier-triggered Add-on",
          reason: `${item.reason || "Required source-backed item."} This is conditional because it was activated by a patient modifier outside the selected primary bundle.`,
          matchedTags: unique([...(item.matchedTags || []), "cross_intent_modifier"])
        }));
      const safetyAddOns = [
        ...sourceRequiredItems,
        ...(rule.requiredGaps || [])
      ];
      const includeSourceCoreAsConditional = rule.includeSourceCoreAsConditional !== false;
      return {
        ...sourceProfile,
        id: `${sourceProfile.id}_cross_intent_safety`,
        name: `${sourceProfile.name} safety add-on`,
        core: [],
        conditional: includeSourceCoreAsConditional
          ? [
              ...(sourceProfile.core || []),
              ...(sourceProfile.conditional || [])
            ].map((group) => ({
              ...group,
              domain: group.domain ? `${group.domain} Safety Add-on` : "Safety Add-on",
              strength: Math.min(group.strength || 56, 66),
              reason: `${group.reason} This is conditional because the selected validated intent is outside the ${sourceProfile.name} bundle.`
            }))
          : [],
        requiredItems: safetyAddOns.filter((item) => !isStagedCatalogGapDefinition(item)),
        requiredGaps: safetyAddOns.filter(isStagedCatalogGapDefinition),
        suppress: [],
        warnings: [rule.warning]
      };
    })
    .filter(Boolean);
}

function activeRecommendationProfiles(context, rawContext = "") {
  const validatedBundleIds = clinicalBundleIdsFromContext(rawContext);
  if (validatedBundleIds.size) {
    const selectedProfiles = clinicalRecommendationProfiles.filter((profile) => validatedBundleIds.has(profile.id));
    if (!selectedProfiles.length && validatedBundleIds.has("installed_guideline_module")) {
      return [
        ...clinicalRecommendationProfiles.filter((profile) => unvalidatedProfileMatches(profile, context)),
        ...crossIntentSafetyProfiles(context, validatedBundleIds)
      ];
    }
    return [
      ...selectedProfiles,
      ...crossIntentSafetyProfiles(context, validatedBundleIds)
    ];
  }
  return clinicalRecommendationProfiles.filter((profile) => unvalidatedProfileMatches(profile, context));
}

function hasValidatedClinicalBundleScope(rawContext = "") {
  return recognizedClinicalBundleIds(rawContext).size > 0;
}

function clinicalRuleContextFromContextText(value = "") {
  return String(value || "")
    .split(/\n+/)
    .filter((line) => !/^\s*(?:intent tags:|required domains:|avoid labels:)(?:\s|$)/i.test(line))
    .join("\n");
}

function unvalidatedProfileMatches(profile, context) {
  if (profile.id === "gu_renal"
    && /\b(?:penile discharge|urethral discharge|genital discharge|scrotal pain|scrotal swelling|testicular pain|testicular torsion|acute scrotum)\b/.test(context)
    && !/\b(?:aki|acute kidney injury|rising creatinine|oliguria|hematuria|flank|pyelonephritis|renal colic|kidney stone|fever|sepsis|shock)\b/.test(context)) {
    return false;
  }
  const primaryContextByProfile = {
    abdominal_gi: /\b(?:abdominal pain|abd pain|stomach pain|stomach cramps|belly pain|belly cramps|abdominal cramps|nausea|vomit|diarrhea|constipation|distension|bloating|jaundice|melena|hematochezia|gi bleed|heartburn|dysphagia|early satiety|anorexia)\b/,
    gu_renal: /\b(?:aki|acute kidney injury|rising creatinine|oliguria|polyuria|dysuria|burning pee|hematuria|flank|pyelonephritis|renal colic|kidney stone)\b/,
    infection_sepsis: /\b(?:fever|febrile|chills|rigors|night sweats|sepsis|leukocytosis|pneumonia|pyelonephritis|sore throat|pharyngitis|lymphadenitis|infected|cellulitis|abscess|wound infection)\b/,
    heme_bleeding_anemia: /\b(?:easy bruising|bruising|petechiae|pallor|bleeding gums|epistaxis|nosebleeds?|anemia|unexplained fatigue|unexplained weakness)\b/,
    neuro_red_flags: /\b(?:stroke|tia|focal neurologic|focal neuro|focal deficit|facial droop|facial weakness|face droop|face weakness|aphasia|dysarthria|slurred speech|hemiparesis|hemiplegia|unilateral weakness|one sided weakness|seizure|meningitis|meningeal|neck pain.*fever|fever.*neck pain|photophobia.*fever|fever.*photophobia|thunderclap|worst headache|new severe headache|ataxia|vertigo|gait abnormality|diplopia|cord compression|myelopathy|saddle anesthesia|urinary retention.*back pain|back pain.*urinary retention)\b/,
    focused_msk: /\b(?:joint pain|arthralgia|joint swelling|morning stiffness|shoulder pain|rotator cuff|limited abduction|knee pain|swollen knee|hot swollen knee|septic arthritis|ankle pain|ankle sprain|twisting injury|hand pain|mcp|pip|arthritis|unable to bear weight|fall|trauma|osteoporosis|osteopenia|osteomalacia|vitamin d deficiency|bone pain|fragility fracture|hyperparathyroidism|hypoparathyroidism|proximal weakness)\b/,
    endocrine_symptoms: /\b(?:unexplained weight gain|weight gain|polydipsia|polyuria|polyphagia|heat intolerance|cold intolerance|excessive sweating|hyperhidrosis|erectile dysfunction|amenorrhea|infertility|gynecomastia|hirsutism)\b/,
    adrenergic_jittery: /\b(?:feeling jittery|jittery|shaky|feeling shaky|shaking|tremulous|sweaty|diaphoretic|sweating|hunger|low sugar|hypoglycemia|insulin reaction|adrenergic symptoms|palpitations|tremor)\b/,
    diabetes_foot_neuropathy: /\b(?:diabetes|diabetic|type 1 diabetes|type 2 diabetes|diabetes mellitus|prediabetes|gestational diabetes|neuropathy|numb feet|burning toes|foot ulcer|diabetic foot|diabetes foot|foot wound|non healing foot|poor perfusion|discharge planning|protective sensation|monofilament)\b/,
    routine_thyroid: /\b(?:routine thyroid|thyroid evaluation|hypothyroidism|hypothyroid|hyperthyroidism|hyperthyroid|thyrotoxicosis|graves|hashimoto|goiter|thyroid nodule|thyroid cancer|thyroid mass|abnormal tsh|heat intolerance|cold intolerance|palpitations with thyroid)\b/,
    thyroid_endocrine: /\b(?:thyroid storm|myxedema coma|myxedema crisis|severe hypothyroid|severe hyperthyroid|thyroid crisis|hyperthermia|hypothermia|altered mental status.*thyroid|bradycardia.*hypothyroid|tachycardia.*thyroid storm)\b/,
    eye_vision: /\b(?:vision changes?|blurry vision|diplopia|double vision|eye redness|eye discharge|red eye|ocular|photophobia|eye pain|visual field|pituitary|sellar|prolactinoma|acromegaly|gigantism|hypopituitarism|diabetes insipidus|thyroid eye|graves orbitopathy)\b/,
    dermatology: /\b(?:rash|skin lesions?|moles?|urticaria|hives|pruritus|itching|ulcer|wound|alopecia|hair loss|dry skin|non healing|perianal itching|pruritus ani)\b/
  };
  const primaryPattern = primaryContextByProfile[profile.id] || profile.context;
  return primaryPattern.test(context);
}

function conditionMatches(condition, context) {
  if (!condition) {
    return true;
  }
  if (typeof condition === "function") {
    return Boolean(condition(context));
  }
  return condition.test(context);
}

function conditionBlocks(condition, context) {
  return condition ? conditionMatches(condition, context) : false;
}

function stagedCatalogGapId(entry = {}) {
  const candidate = entry.candidate || {};
  return candidate.exam_id || entry.exam_id || entry.gap_exam_id || entry.gap_id || "";
}

function isStagedCatalogGapDefinition(entry = {}) {
  return /^GAP-/i.test(stagedCatalogGapId(entry));
}

function patientModifierContextText(context) {
  const text = String(context || "");
  const normalizedText = normalizeEvidenceText(text);
  if (!/validated clinical intent workup/i.test(normalizedText)) {
    return text;
  }
  const modifierIndex = normalizedText.indexOf("patient modifiers");
  return modifierIndex >= 0 ? normalizedText.slice(modifierIndex) : "";
}

function assertedPatientModifierText(context) {
  return patientModifierContextText(context)
    .replace(/\b(?:ask(?:ing)?|screen(?:ing)?|check(?:ing)?|query(?:ing)?|review(?:ing)?|look(?:ing)?)\s+(?:about|for)\b[\s\S]*$/gi, " ")
    .replace(/\b(?:question|questions|history prompts?)\s*(?:about|for|:)\b[\s\S]*$/gi, " ")
    .trim();
}

function patientOrUnstructuredContextHas(context, pattern) {
  return pattern.test(assertedPatientModifierText(context));
}

function requiredProfileItemAlreadySatisfied(item, selectedEntries = []) {
  const itemId = item.exam_id || item.id || "";
  const itemType = String(item.item_type || item.gap_type || "").toLowerCase();
  const pattern = item.satisfiedBy
    || new RegExp(normalizeEvidenceLabel(item.label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return selectedEntries.some((entry) => {
    const candidate = entry.candidate || entry;
    if (itemType && !requiredProfileSectionTypesCompatible(itemType, entry)) {
      return false;
    }
    if (itemId && (candidate.exam_id === itemId || entry.exam_id === itemId)) {
      return true;
    }
    const text = requiredProfileSatisfactionText(entry, itemType);
    return pattern.test(text);
  });
}

function requiredProfileSatisfactionText(entry = {}, itemType = "") {
  const candidate = entry.candidate || entry;
  const isSafety = itemType === "safety_check" || isBasicSafetyCheckEntry(entry);
  const isHistory = itemType === "history_question" || itemType === "question" || isHistoryQuestionEntry(entry);
  const isTest = itemType === "diagnostic_test" || itemType === "reference_threshold" || isDiagnosticTestEntry(entry);
  const isRedFlag = itemType === "red_flag" || itemType === "escalation_cue" || isRedFlagEntry(entry);
  const isManagement = itemType === "management_change" || isManagementChangeEntry(entry);
  const sharedIdentity = [
    entry.exam_id,
    candidate.exam_id,
    entry.label,
    entry.originalLabel,
    candidate.examLabel,
    candidate.maneuver,
    entry.options,
    candidate.examOptions,
    candidate.item_type,
    candidate.gap_type
  ];
  if (isSafety) {
    return normalizeEvidenceText(sharedIdentity.filter(Boolean).join(" "));
  }
  if (isHistory) {
    return normalizeEvidenceText([
      ...sharedIdentity,
      entry.text,
      entry.displayBedsideQuestion,
      entry.displayBedsideQuestionOptions,
      candidate.bedside_question_label,
      candidate.bedside_question_options
    ].filter(Boolean).join(" "));
  }
  if (isTest || isRedFlag || isManagement) {
    return normalizeEvidenceText([
      ...sharedIdentity,
      entry.text,
      entry.reason,
      entry.displayDiagnosticTarget,
      entry.displayManagement,
      candidate.diagnostic_target,
      candidate.result_changes_management,
      candidate.management_link
    ].filter(Boolean).join(" "));
  }
  return normalizeEvidenceText([
    ...sharedIdentity,
    entry.technique,
    candidate.technique,
    candidate.base?.technique,
    candidate.base?.checklist_label
  ].filter(Boolean).join(" "));
}

function requiredProfileSectionTypesCompatible(itemType, entry = {}) {
  if (itemType === "exam_maneuver") {
    return !isNonExamWorkupEntry(entry);
  }
  if (itemType === "history_question" || itemType === "question") {
    return isHistoryQuestionEntry(entry);
  }
  if (itemType === "diagnostic_test" || itemType === "reference_threshold") {
    return isDiagnosticTestEntry(entry);
  }
  if (itemType === "red_flag" || itemType === "escalation_cue") {
    return isRedFlagEntry(entry);
  }
  if (itemType === "safety_check") {
    return isBasicSafetyCheckEntry(entry);
  }
  if (itemType === "management_change") {
    return isManagementChangeEntry(entry);
  }
  return true;
}

const validatedSafetyFloorDefinitions = [
  {
    exam_id: "SAFETY-validated-blood-pressure",
    item_type: "safety_check",
    label: "Measure blood pressure",
    options: "___ / Low / Normal / High / Not available",
    diagnosticTarget: "Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.",
    management: "Abnormal blood pressure can change acuity, fluids, antihypertensive decisions, endocrine-crisis treatment, monitoring, and escalation.",
    equipment_needed: "blood pressure cuff",
    satisfiedBy: /\bblood pressure\b/
  },
  {
    exam_id: "SAFETY-validated-heart-rate",
    item_type: "safety_check",
    label: "Measure heart rate",
    options: "___ / Regular / Irregular / Tachycardic / Bradycardic / Not available",
    diagnosticTarget: "Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.",
    management: "Abnormal heart rate can change ECG/telemetry urgency, volume or endocrine-crisis assessment, infection severity, medication review, and escalation.",
    equipment_needed: "none",
    satisfiedBy: /\bheart rate\b/
  },
  {
    exam_id: "SAFETY-validated-respiratory-rate",
    item_type: "safety_check",
    label: "Count respiratory rate",
    options: "___ / Normal / Tachypneic / Bradypneic / Labored / Not available",
    diagnosticTarget: "Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.",
    management: "Abnormal respiratory rate or labored breathing can change oxygen/ventilation assessment, acid-base urgency, monitoring level, and escalation.",
    equipment_needed: "none",
    satisfiedBy: /\brespiratory rate\b/
  },
  {
    exam_id: "SAFETY-validated-oxygen-saturation",
    item_type: "safety_check",
    label: "Measure oxygen saturation and support",
    options: "___% room air / ___% on oxygen ___ L/min / Hypoxemic / Not available",
    diagnosticTarget: "Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.",
    management: "Abnormal oxygen saturation or rising oxygen requirement can change respiratory support, imaging urgency, pulmonary/infectious/cardiac framing, monitoring level, and escalation.",
    equipment_needed: "pulse oximeter",
    satisfiedBy: /\b(?:oxygen saturation|spo2|pulse oximetry|pulse ox)\b/
  },
  {
    exam_id: "SAFETY-validated-temperature",
    item_type: "safety_check",
    label: "Measure temperature",
    options: "___ C/F / Fever / Hypothermia / Afebrile / Not available",
    diagnosticTarget: "Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.",
    management: "Fever or hypothermia can change infection/endocrine-crisis workup, isolation, medication decisions, monitoring, and escalation.",
    equipment_needed: "thermometer",
    satisfiedBy: /\btemperature\b/
  }
];

function validatedSafetyFloorEntries(validatedIntentTrace = [], selectedEntries = []) {
  if (!validatedIntentTrace.length) {
    return [];
  }
  const sourceIds = unique([
    "AHRQ_CALIBRATE_DX",
    ...validatedIntentTrace.flatMap((trace) => trace.source_ids || [])
  ].filter(Boolean));
  const source = sourceIds.join("; ");
  return validatedSafetyFloorDefinitions
    .filter((item) => !requiredProfileItemAlreadySatisfied(item, selectedEntries))
    .map((item) => {
      const candidate = {
        exam_id: item.exam_id,
        item_type: "safety_check",
        examLabel: item.label,
        maneuver: item.label,
        examOptions: item.options,
        technique: "Measure and document as basic bedside safety data before interpreting the focused workup.",
        when_to_use_structured: "Every validated clinical workup; keep separate from physical exam maneuvers.",
        limitations: "Confirm abnormal or discordant values with the patient position, device, timing, trend, and clinical context.",
        score: 100,
        scoreBreakdown: { clinicalRelevance: 100, actionability: 100, diagnosticValue: 70, bedsideFeasibility: 100 },
        condition_or_syndrome: "Validated clinical intent safety floor",
        diagnostic_target: item.diagnosticTarget,
        result_changes_management: item.management,
        management_link: item.management,
        evidence_source_primary: source,
        source_citation: "AHRQ diagnostic safety workflow and selected validated-intent source metadata",
        LR_plus: "",
        LR_minus: "",
        evidence_tier: "Safety",
        difficulty: "easy",
        time_burden_minutes: "0.5",
        equipment_needed: item.equipment_needed,
        patient_cooperation_required: "low",
        matchedTags: ["basic_bedside_data", "safety_check", "vitals"],
        tags: ["basic_bedside_data", "safety_check", "vitals"],
        retrieval_tags: "basic_bedside_data; safety_check; vitals",
        retrievalRoutes: ["validated_intent_safety_floor"]
      };
      return {
        candidate,
        exam_id: item.exam_id,
        item_type: "safety_check",
        label: item.label,
        options: item.options,
        domain: "Basic Bedside Data",
        role: "core",
        reason: "Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.",
        rationale: "Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.",
        technique: candidate.technique,
        whenToUse: candidate.when_to_use_structured,
        limitations: candidate.limitations,
        interpretationCautions: candidate.limitations,
        managementRelevance: item.management,
        evidence: evidenceMetadataWithLikelihoodRatioNote({
          source,
          LR_plus: "",
          LR_minus: "",
          tier: "Safety"
        }, candidate, candidate.item_type),
        feasibility: {
          difficulty: "easy",
          time_burden_minutes: "0.5",
          equipment_needed: item.equipment_needed,
          patient_cooperation_required: "low"
        },
        matchedTags: ["basic_bedside_data", "safety_check", "vitals"],
        retrievalTags: ["basic_bedside_data", "safety_check", "vitals"],
        specificMatchedTags: ["basic_bedside_data", "safety_check", "vitals"],
        recommendationSignals: [{ type: "core", domain: "Basic Bedside Data", strength: 100 }],
        displayDiagnosticTarget: item.diagnosticTarget,
        displayManagement: item.management,
        contextFitScore: 100,
        score: 100,
        suppressionReason: ""
      };
    });
}

const validatedIntentHistoryQuestionDefinitions = {
  suspected_pe_v1: [
    {
      label: "PE cardiopulmonary symptom history",
      text: "Any sudden dyspnea, pleuritic chest pain, hemoptysis, syncope or presyncope, escalating oxygen need, or inability to speak full sentences?",
      options: "None / Sudden dyspnea / Pleuritic pain / Hemoptysis / Syncope-presyncope / Escalating oxygen / Cannot speak full sentences / Other ___",
      whenToAsk: "Ask when suspected PE, pleuritic chest pain, unexplained dyspnea/hypoxia, or syncope with VTE risk is selected.",
      diagnosticTarget: "PE probability and severity: cardiopulmonary symptom pattern, hypoxemia trajectory, and hemodynamic-risk symptoms.",
      management: "The answer changes PE probability framing, oxygen/support strategy, ECG/troponin/BNP/imaging urgency, and ED/escalation threshold.",
      tags: ["pulmonary_embolism", "dyspnea", "hypoxia", "chest_pain", "syncope", "history_question"]
    },
    {
      label: "DVT leg symptom history",
      text: "Any unilateral leg swelling, calf pain, new leg redness or warmth, or recent leg immobilization/cast?",
      options: "None / Unilateral leg swelling / Calf pain / Redness-warmth / Immobilization-cast / Other ___",
      whenToAsk: "Ask when suspected PE or DVT concern is selected.",
      diagnosticTarget: "DVT probability context: unilateral swelling, calf pain, inflammatory leg changes, or immobilization.",
      management: "The answer changes lower-extremity exam priority, compression ultrasound threshold, PE probability framing, and anticoagulation documentation.",
      tags: ["pulmonary_embolism", "dvt", "vte", "lower_extremity", "history_question"]
    },
    {
      label: "VTE provoking-factor history",
      text: "Any prior VTE, recent surgery, immobility or hospitalization, long travel, estrogen therapy, pregnancy or postpartum state, or active cancer?",
      options: "None / Prior VTE / Recent surgery / Immobility-hospitalization / Long travel / Estrogen therapy / Pregnancy-postpartum / Active cancer / Other ___",
      whenToAsk: "Ask when suspected PE, DVT, or VTE probability framing is selected.",
      diagnosticTarget: "VTE risk context: prior clot, surgery, immobilization, travel, estrogen/pregnancy/postpartum, or active cancer.",
      management: "The answer changes PERC/Wells/Geneva applicability, D-dimer versus imaging strategy, recurrence-risk documentation, and anticoagulation planning.",
      tags: ["pulmonary_embolism", "dvt", "vte", "clinical_probability", "provoking_factor", "history_question"]
    },
    {
      label: "Anticoagulation bleeding-safety history",
      text: "Any active bleeding, recent major surgery or trauma, prior intracranial hemorrhage or stroke concern, anticoagulant use, severe uncontrolled hypertension, pending procedure, or pregnancy/postpartum state?",
      options: "No bleeding concern / Active bleeding / Recent major surgery-trauma / Intracranial hemorrhage-stroke concern / Anticoagulant use / Severe uncontrolled hypertension / Pending procedure / Pregnancy-postpartum / Other ___",
      whenToAsk: "Ask when suspected PE treatment or escalation decisions may include anticoagulation or thrombolysis.",
      diagnosticTarget: "Treatment safety: anticoagulation and thrombolysis contraindication context.",
      management: "The answer changes empiric anticoagulation risk-benefit discussion, thrombolysis contraindication review, reversal/holding decisions, and monitored-care threshold.",
      tags: ["pulmonary_embolism", "anticoagulation_safety", "bleeding_risk", "thrombolysis", "history_question"]
    }
  ],
  chest_pain_acs_v1: {
    label: "Chest pain ischemic and alternate-cause history",
    text: "For chest discomfort: onset/time course, exertional or rest symptoms, pressure quality, radiation, dyspnea, diaphoresis, nausea, syncope, pleuritic/positional/reproducible features, prior CAD, or stimulant/cocaine use?",
    options: "Onset ___ / Exertional / Rest pain / Pressure / Radiation / Dyspnea / Diaphoresis / Nausea / Syncope / Pleuritic-positional / Reproducible / Prior CAD / Stimulant-cocaine / Other ___",
    whenToAsk: "Ask when ACS-style chest pain, typical or atypical chest discomfort, exertional symptoms, diaphoresis, nausea, radiation, or chest-pain red flags are selected.",
    diagnosticTarget: "Chest pain risk and differential: ischemic pattern, unstable symptoms, cardiopulmonary associated symptoms, PE/pericarditis/musculoskeletal clues, and stimulant risk.",
    management: "The answer changes ECG/troponin urgency, ED/escalation threshold, cardiopulmonary exam focus, PE/pericarditis/musculoskeletal add-ons, and telemetry/monitoring decisions.",
    tags: ["chest_pain", "ACS", "cardiopulmonary", "pulmonary_embolism", "history_question"]
  },
  dyspnea_hf_v1: {
    label: "Dyspnea and volume-focused history",
    text: "What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics?",
    options: "No change / Exertional dyspnea / Orthopnea-PND / Cough-wheeze / Chest pain / Leg swelling / Weight change / Oxygen need / Missed diuretics / Other ___",
    whenToAsk: "Ask when dyspnea, hypoxia, heart failure, orthopnea, PND, edema, or volume overload is the selected validated intent.",
    diagnosticTarget: "Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.",
    management: "The answer changes oxygen/support strategy, diuresis versus alternate pulmonary workup, ECG/troponin/imaging urgency, medication review, and disposition.",
    tags: ["dyspnea", "heart_failure", "volume_overload", "pulmonary_exam", "history_question"]
  },
  gu_renal_dysuria_v1: {
    label: "GU, renal, and volume-focused history",
    text: "Any dysuria, frequency/urgency, hematuria, flank pain, fever or rigors, nausea/vomiting, decreased urine, poor intake, stone history, or kidney disease?",
    options: "None / Dysuria / Frequency-urgency / Hematuria / Flank pain / Fever-rigors / Nausea-vomiting / Decreased urine / Poor intake / Stone history / Other ___",
    whenToAsk: "Ask when dysuria, flank pain, pyelonephritis, AKI, hypovolemia, oliguria, hematuria, or renal colic is selected.",
    diagnosticTarget: "GU/renal source and severity: lower UTI, pyelonephritis, obstructing stone, AKI/hypovolemia, systemic infection, or urine-output change.",
    management: "The answer changes CVA/flank exam priority, urinalysis/culture/imaging urgency, fluid strategy, antibiotics/escalation threshold, and medication safety review.",
    tags: ["dysuria", "UTI", "pyelonephritis", "flank_pain", "AKI", "hypovolemia", "history_question"]
  },
  stroke_focal_neuro_v1: {
    label: "Focal neurologic deficit timeline and localization history",
    text: "When was last known well, and what new focal symptoms occurred: face droop, speech trouble, arm/leg weakness, numbness, vision loss, diplopia, ataxia, seizure, or severe headache?",
    options: "Last-known-well ___ / Face droop / Speech trouble / Weakness / Numbness / Vision loss / Diplopia / Ataxia / Seizure / Severe headache / Other ___",
    whenToAsk: "Ask immediately when stroke, TIA, seizure with focal deficit, facial droop, aphasia, diplopia, ataxia, or focal weakness is selected.",
    diagnosticTarget: "Focal neurologic localization and time-sensitive eligibility: cortical, brainstem, cranial nerve, motor/sensory, cerebellar, seizure, or hemorrhage-pattern clues.",
    management: "The answer changes stroke-alert timing, imaging/vascular imaging urgency, thrombolysis/thrombectomy eligibility review, seizure pathway, and neurologic escalation.",
    tags: ["stroke", "focal_neurologic_deficit", "weakness", "vision_change", "cranial_nerve_exam", "history_question"]
  },
  diabetes_foot_neuropathy_v1: {
    label: "Diabetes foot and neuropathy history",
    text: "Any foot ulcer, wound, drainage, redness, new pain, numbness/tingling, loss of protective sensation, falls, prior amputation, poor footwear, or inability to inspect feet?",
    options: "None / Ulcer-wound / Drainage / Redness / New pain / Numbness-tingling / Falls / Prior amputation / Footwear issue / Cannot inspect feet / Other ___",
    whenToAsk: "Ask when diabetes foot, neuropathy, wound, ulcer, discharge-risk, protective sensation, or perfusion assessment is selected.",
    diagnosticTarget: "Diabetes foot risk: ulcer/infection, neuropathy, poor protective sensation, falls, vascular risk, footwear mismatch, or self-care barrier.",
    management: "The answer changes foot inspection priority, monofilament/sensory and pulse exam, wound/infection escalation, podiatry/wound care, footwear counseling, and discharge safety.",
    tags: ["diabetes_foot", "neuropathy", "wound", "protective_sensation", "vascular_exam", "history_question"]
  },
  eye_redness_vision_v1: {
    label: "Eye redness and vision red-flag history",
    text: "Any vision loss, eye pain, photophobia, trauma, contact lens use, discharge, severe headache, diplopia, neurologic symptoms, or immunocompromise?",
    options: "None / Vision loss / Eye pain / Photophobia / Trauma / Contact lens / Discharge / Severe headache / Diplopia / Neuro symptom / Immunocompromise / Other ___",
    whenToAsk: "Ask when eye redness, discharge, eye pain, photophobia, diplopia, or vision change is selected.",
    diagnosticTarget: "Vision-threatening or neurologic eye presentation: painful red eye, corneal/contact-lens risk, orbital/uveitic pattern, diplopia, headache, or focal neurologic clue.",
    management: "The answer changes urgency of visual acuity, pupil/EOM/field testing, fluorescein/ophthalmology referral, infection precautions, imaging, and ED escalation.",
    tags: ["eye_vision", "vision_change", "heent_exam", "infection", "history_question"]
  },
  heent_throat_ear_v1: {
    label: "Focused HEENT source and airway history",
    text: "Which HEENT symptoms localize the problem: sore throat, ear pain, hearing change, nasal congestion, sinus pain, hoarseness, dysphagia, drooling, neck swelling, fever, or eye symptoms?",
    options: "Sore throat / Ear pain / Hearing change / Nasal congestion / Sinus pain / Hoarseness / Dysphagia / Drooling / Neck swelling / Fever / Eye symptoms / Other ___",
    whenToAsk: "Ask when sore throat, ear pain, nasal/sinus symptoms, dysphagia, hoarseness, otalgia, epistaxis, or focused HEENT concern is selected.",
    diagnosticTarget: "HEENT source and severity: pharyngeal/tonsillar, otologic, nasal/sinus, airway-adjacent, neck mass, systemic infection, or ocular involvement.",
    management: "The answer changes whether to focus otoscopy, oropharynx, nasal/sinus, regional nodes, airway escalation, infection testing, imaging, or urgent referral.",
    tags: ["heent", "heent_exam", "sore_throat", "ear_pain", "sinus", "airway", "history_question"]
  },
  genital_discharge_sti_v1: {
    label: "Genital discharge STI source, exposure, and complication history",
    text: "Any dysuria, urethral or vaginal discharge, genital ulcer or lesion, pelvic pain, testicular pain, fever, pregnancy possibility, new partners, STI exposure, HIV/syphilis risk, recent antibiotics, or persistent symptoms after treatment?",
    options: "None / Dysuria / Discharge / Genital ulcer-lesion / Pelvic pain / Testicular pain / Fever / Pregnancy possible / New partner-STI exposure / HIV-syphilis risk / Recent antibiotics / Persistent symptoms / Other ___",
    whenToAsk: "Ask when penile, urethral, vaginal, or genital discharge; STI exposure; urethritis; cervicitis; genital ulcer; dysuria with STI risk; or STI treatment failure is selected.",
    diagnosticTarget: "Local GU/STI syndrome and complications: urethritis, cervicitis, PID, epididymitis, genital ulcer disease, pregnancy-related safety, resistant infection, or persistent/recurrent infection.",
    management: "The answer changes genital, pelvic, scrotal, and inguinal-node exam focus; NAAT and lesion testing; pregnancy or HIV/syphilis testing; empiric treatment; partner services; and escalation threshold.",
    tags: ["genital_discharge", "sti", "urethritis", "cervicitis", "PID", "epididymitis", "genital_ulcer", "history_question"]
  },
  acute_scrotal_pain_v1: {
    label: "Acute scrotum torsion-timing and mimic history",
    text: "When exactly did testicular or scrotal pain start, and is it sudden or severe with nausea/vomiting, swelling, high-riding testis, fever, urinary symptoms, STI exposure, trauma, prior torsion, hernia symptoms, or abdominal/flank pain?",
    options: "Onset time ___ / Sudden severe / Nausea-vomiting / Swelling / High-riding / Fever / Urinary symptoms / STI exposure / Trauma / Prior torsion / Hernia symptoms / Abdominal-flank pain / Other ___",
    whenToAsk: "Ask immediately when acute scrotal pain, testicular pain, scrotal swelling, torsion concern, epididymitis concern, or testicular trauma is selected.",
    diagnosticTarget: "Acute scrotum source and time-sensitivity: torsion, epididymo-orchitis, hernia, trauma, renal colic or abdominal mimic, testicular mass, and testicular salvage timing.",
    management: "The answer changes urgent urology/surgical escalation, ultrasound timing, urinalysis and STI testing, antibiotics when infection is likely, analgesia, and documentation of time-sensitive onset.",
    tags: ["acute_scrotum", "testicular_torsion", "scrotal_pain", "epididymitis", "hernia", "renal_colic", "history_question"]
  },
  bleeding_anemia_v1: {
    label: "Bleeding and anemia source/severity history",
    text: "Any hematemesis, melena, hematochezia, easy bruising, petechiae, gum/nose bleeding, anticoagulant use, dizziness/syncope, dyspnea, chest pain, or heavy menses?",
    options: "None / Hematemesis / Melena / Hematochezia / Bruising-petechiae / Gum-nose bleeding / Anticoagulant / Dizziness-syncope / Dyspnea / Chest pain / Heavy menses / Other ___",
    whenToAsk: "Ask when bleeding, bruising, pallor, anemia, GI bleed, epistaxis, petechiae, or systemic fatigue/weakness with anemia concern is selected.",
    diagnosticTarget: "Bleeding/anemia source and severity: GI bleed, mucocutaneous bleeding, medication-related bleeding, hemodynamic symptoms, cardiopulmonary strain, or menstrual source.",
    management: "The answer changes orthostatic/perfusion assessment, abdominal/oral/skin exam focus, CBC/coagulation/type-screen urgency, medication reversal questions, and ED/transfusion threshold review.",
    tags: ["bleeding", "anemia", "gi_bleed", "pallor", "bruising", "history_question"]
  }
};

const supplementalValidatedIntentHistoryQuestionDefinitions = {
  sleep_apnea_snoring_v1: [
    {
      id: "safety-comorbidity-treatment",
      label: "OSA safety, comorbidity, and treatment-readiness history",
      text: "Any drowsy driving or work-safety risk, resistant hypertension, atrial fibrillation, heart failure, opioid or sedative use, alcohol near bedtime, prior sleep study or CPAP use, CPAP intolerance, or oral-appliance interest?",
      options: "None / Drowsy driving-work safety / Resistant hypertension / Atrial fibrillation / Heart failure / Opioid-sedative use / Alcohol near bedtime / Prior sleep study / CPAP used / CPAP intolerant / Oral appliance interest / Other ___",
      whenToAsk: "Ask when snoring, witnessed apneas, daytime sleepiness, morning headaches, resistant hypertension, or suspected obstructive sleep apnea is selected.",
      diagnosticTarget: "OSA severity, safety risk, cardiometabolic comorbidity, medication/alcohol contributors, and treatment readiness.",
      management: "The answer changes sleep-testing urgency, driving or work-safety counseling, cardiometabolic risk framing, CPAP versus oral-appliance planning, and sedative/alcohol counseling.",
      tags: ["sleep_apnea", "snoring", "cardiometabolic", "treatment_safety", "history_question"]
    }
  ],
  pelvic_menstrual_pain_v1: [
    {
      id: "pregnancy-pid-ectopic-danger",
      label: "Pregnancy, PID, and ectopic danger-feature history",
      text: "Could pregnancy be possible, and are there ectopic or PID danger features: missed period, positive pregnancy test, severe unilateral pelvic pain, syncope, shoulder pain, fever, purulent discharge, dyspareunia, or heavy bleeding?",
      options: "Pregnancy not possible / Pregnancy possible / Missed period / Positive pregnancy test / Severe unilateral pain / Syncope / Shoulder pain / Fever / Purulent discharge / Dyspareunia / Heavy bleeding / Other ___",
      whenToAsk: "Ask when pelvic, menstrual, or lower-abdominal pain is selected, especially with pregnancy possibility, discharge, fever, severe pain, or bleeding.",
      diagnosticTarget: "Pregnancy-related emergency, ectopic-pattern symptoms, PID features, and bleeding severity.",
      management: "The answer changes pregnancy testing, pelvic or abdominal exam priority, STI/PID treatment threshold, ultrasound or ED escalation, and gynecology consultation urgency.",
      tags: ["pelvic_pain", "pregnancy", "ectopic", "PID", "gynecology", "history_question"]
    }
  ],
  genital_discharge_sti_v1: [
    {
      id: "sti-followup-partner-safety",
      label: "STI treatment, partner, and follow-up safety history",
      text: "Any prior STI treatment, allergy or pregnancy concern affecting antibiotics, untreated partners, recurrent exposure, sexual-assault safety concern, inability to abstain until treatment is complete, or follow-up barrier?",
      options: "None / Prior STI treatment / Antibiotic allergy / Pregnancy concern / Untreated partner / Recurrent exposure / Assault safety concern / Cannot abstain / Follow-up barrier / Other ___",
      whenToAsk: "Ask when genital discharge, STI exposure, urethritis, cervicitis, PID risk, epididymitis risk, or persistent symptoms after STI treatment is selected.",
      diagnosticTarget: "Treatment safety, reinfection risk, partner-management gap, assault/safety concern, and follow-up reliability.",
      management: "The answer changes antibiotic selection, pregnancy testing, expedited partner therapy or partner services, counseling, mandatory reporting/safety planning, and follow-up interval.",
      tags: ["genital_discharge", "sti", "partner_management", "medication_safety", "follow_up", "history_question"]
    }
  ],
  acute_scrotal_pain_v1: [
    {
      id: "acute-scrotum-infection-trauma-safety",
      label: "Acute scrotum infection, trauma, and disposition history",
      text: "Any urethral discharge, dysuria, urinary frequency, fever, recent STI exposure, mumps or viral symptoms, trauma, anticoagulant use, known testicular mass, solitary testis, or delay/barrier to urgent urology care?",
      options: "None / Urethral discharge / Dysuria-frequency / Fever / STI exposure / Viral symptoms / Trauma / Anticoagulant / Testicular mass / Solitary testis / Urology-care barrier / Other ___",
      whenToAsk: "Ask when acute scrotal pain, swelling, epididymitis, torsion concern, testicular trauma, or testicular mass concern is selected.",
      diagnosticTarget: "Epididymitis or STI source, viral orchitis, trauma/hematoma risk, malignancy/mass concern, fertility risk, and disposition barrier.",
      management: "The answer changes urinalysis, culture, STI NAAT, antibiotics, ultrasound interpretation, anticoagulation/trauma escalation, urology urgency, and safe disposition planning.",
      tags: ["acute_scrotum", "epididymitis", "testicular_torsion", "trauma", "sti", "disposition_safety", "history_question"]
    }
  ],
  gu_renal_dysuria_v1: [
    {
      id: "complicated-uti-obstruction-risk",
      label: "Complicated UTI, obstruction, and renal-risk history",
      text: "Any pregnancy, catheter or urinary instrumentation, urinary retention, known stone, solitary or transplant kidney, immunocompromise, resistant organism history, recent antibiotics, or inability to keep fluids or medicines down?",
      options: "None / Pregnancy / Catheter-instrumentation / Retention / Known stone / Solitary-transplant kidney / Immunocompromise / Resistant organism / Recent antibiotics / Cannot keep fluids-meds down / Other ___",
      whenToAsk: "Ask when dysuria, pyelonephritis, flank pain, hematuria, AKI, renal colic, or hypovolemia is selected.",
      diagnosticTarget: "Complicated UTI, obstructing stone, renal vulnerability, resistant infection risk, and inability to tolerate outpatient therapy.",
      management: "The answer changes urine culture, renal imaging, pregnancy testing, antibiotic selection, renal dosing, admission threshold, and urology escalation.",
      tags: ["dysuria", "UTI", "pyelonephritis", "renal_colic", "obstruction", "AKI", "pregnancy", "history_question"]
    }
  ],
  stroke_focal_neuro_v1: [
    {
      id: "stroke-eligibility-mimic-safety",
      label: "Stroke treatment eligibility, mimic, and safety history",
      text: "Any anticoagulant use, recent surgery or bleeding, prior intracranial hemorrhage, seizure at onset, hypoglycemia symptoms, migraine pattern, trauma, or rapidly resolving symptoms?",
      options: "None / Anticoagulant / Recent surgery-bleeding / Prior intracranial hemorrhage / Seizure at onset / Hypoglycemia symptoms / Migraine pattern / Trauma / Rapidly resolving / Other ___",
      whenToAsk: "Ask immediately when stroke, TIA, facial droop, aphasia, diplopia, ataxia, seizure with focal deficit, or focal weakness is selected.",
      diagnosticTarget: "Thrombolysis and thrombectomy eligibility context, hemorrhage risk, stroke mimic clues, seizure pathway, and glucose-related mimic risk.",
      management: "The answer changes stroke-alert workflow, thrombolysis contraindication review, vascular imaging urgency, bedside glucose priority, seizure or migraine mimic pathway, and escalation threshold.",
      tags: ["stroke", "focal_neurologic_deficit", "anticoagulation", "glucose", "seizure", "history_question"]
    }
  ],
  thyroid_crisis_v1: [
    {
      id: "thyroid-crisis-precipitant-medication",
      label: "Thyroid crisis precipitant and medication-safety history",
      text: "Any antithyroid medication or levothyroxine change or nonadherence, iodine or amiodarone exposure, infection, recent surgery or trauma, pregnancy or postpartum state, beta-blocker use, steroid use, or adrenal insufficiency concern?",
      options: "None / Antithyroid med change / Levothyroxine change / Nonadherence / Iodine-amiodarone exposure / Infection / Surgery-trauma / Pregnancy-postpartum / Beta-blocker use / Steroid use / Adrenal insufficiency concern / Other ___",
      whenToAsk: "Ask when thyroid storm, thyrotoxic crisis, myxedema coma, or severe thyroid dysfunction with altered mental status, temperature abnormality, or cardiopulmonary instability is selected.",
      diagnosticTarget: "Thyroid emergency precipitant, medication exposure, pregnancy/postpartum context, beta-blocker or iodine safety, and adrenal-risk context.",
      management: "The answer changes thyroid emergency framing, infection search, medication sequencing, beta-blocker and iodine safety review, steroid planning, pregnancy-specific management, and ICU/endocrine escalation.",
      tags: ["thyroid_disease", "thyroid_storm", "myxedema", "medication_safety", "precipitant", "history_question"]
    }
  ],
  routine_thyroid_disease_v1: [
    {
      id: "thyroid-compressive-symptoms",
      label: "Thyroid neck and compressive-symptom history",
      text: "Any neck swelling, rapid growth, thyroid pain, hoarseness, dysphagia, or positional shortness of breath?",
      options: "None / Neck swelling / Rapid growth / Thyroid pain / Hoarseness / Dysphagia / Positional dyspnea / Other ___",
      whenToAsk: "Ask when routine thyroid disease, abnormal TSH, hyperthyroidism, hypothyroidism, goiter, nodule, thyroid mass, or thyroid cancer concern is selected.",
      diagnosticTarget: "Structural thyroid symptoms: goiter/nodule growth, thyroiditis pain, recurrent laryngeal nerve clue, dysphagia, or airway/compressive symptom.",
      management: "The answer changes thyroid/neck exam focus, ultrasound or FNA urgency, thyroiditis workup, airway concern, and endocrine/ENT referral threshold.",
      tags: ["thyroid_disease", "thyroid_exam", "thyroid_nodule", "compressive_symptoms", "history_question"]
    },
    {
      id: "thyroid-cancer-risk-history",
      label: "Thyroid cancer-risk history",
      text: "Any childhood head or neck radiation, family thyroid cancer, MEN2, prior suspicious thyroid biopsy, or rapidly enlarging neck mass?",
      options: "None / Childhood head-neck radiation / Family thyroid cancer / MEN2 / Suspicious prior biopsy / Rapidly enlarging mass / Other ___",
      whenToAsk: "Ask when a thyroid nodule, goiter, neck mass, suspicious nodes, hoarseness, compressive symptoms, or thyroid cancer concern is selected.",
      diagnosticTarget: "Thyroid malignancy risk context: radiation exposure, inherited medullary thyroid cancer risk, suspicious prior cytology, or aggressive growth.",
      management: "The answer changes cervical-node exam priority, ultrasound/nodal mapping, FNA threshold, calcitonin or genetic-risk review when relevant, and endocrine/ENT referral urgency.",
      tags: ["thyroid_disease", "thyroid_nodule", "thyroid_cancer", "radiation", "MEN2", "history_question"]
    },
    {
      id: "thyroid-medication-assay-context",
      label: "Thyroid medication, supplement, and assay-interference history",
      text: "Any thyroid hormone, antithyroid drug, amiodarone, lithium, iodine/contrast exposure, high-dose biotin, thyroid supplement, missed dose, or recent dose change?",
      options: "None / Thyroid hormone / Antithyroid drug / Amiodarone / Lithium / Iodine or contrast / High-dose biotin / Thyroid supplement / Missed dose / Recent dose change / Other ___",
      whenToAsk: "Ask when thyroid lab interpretation, abnormal TSH, hyperthyroidism, hypothyroidism, goiter, thyroiditis, or thyroid medication adjustment is being considered.",
      diagnosticTarget: "Medication or assay context that can cause thyroid dysfunction, distort thyroid tests, or make treatment adjustment unsafe.",
      management: "The answer changes repeat-lab timing, biotin hold/retest planning, medication reconciliation, adverse-effect review, and whether abnormal thyroid tests represent true disease.",
      tags: ["thyroid_disease", "medication_safety", "assay_interference", "biotin", "amiodarone", "lithium", "history_question"]
    },
    {
      id: "thyroid-reproductive-context",
      label: "Thyroid pregnancy, postpartum, and fertility-context history",
      text: "Any current pregnancy, pregnancy plans, recent postpartum state, breastfeeding, infertility treatment, or fertility goal affected by thyroid status?",
      options: "None / Pregnant / Pregnancy plans / Recent postpartum / Breastfeeding / Infertility treatment / Fertility goal / Other ___",
      whenToAsk: "Ask when thyroid disease is evaluated in a patient for whom pregnancy, postpartum state, fertility goals, or medication safety could change targets or treatment choices.",
      diagnosticTarget: "Reproductive context that changes TSH targets, medication safety, antibody interpretation, and postpartum thyroiditis likelihood.",
      management: "The answer changes TSH target selection, levothyroxine dose planning, antithyroid-drug choice, imaging/radioiodine safety, and follow-up interval.",
      tags: ["thyroid_disease", "pregnancy", "postpartum", "fertility", "medication_safety", "history_question"]
    },
    {
      id: "thyroid-hyperthyroid-symptoms",
      label: "Hyperthyroid symptom history",
      text: "Any heat intolerance, palpitations, tremor, sweating, unintentional weight loss, diarrhea, anxiety, or insomnia?",
      options: "None / Heat intolerance / Palpitations / Tremor / Sweating / Weight loss / Diarrhea / Anxiety-insomnia / Other ___",
      whenToAsk: "Ask when abnormal TSH, suspected hyperthyroidism, Graves disease, thyrotoxicosis, tachycardia, tremor, or weight loss is selected.",
      diagnosticTarget: "Thyroid hormone excess phenotype and adrenergic severity.",
      management: "The answer changes urgency of TSH/free T4/T3 testing, ECG or beta-blocker consideration, Graves/thyroiditis framing, and thyroid-storm screen when severe.",
      tags: ["thyroid_disease", "hyperthyroidism", "thyrotoxicosis", "adrenergic", "history_question"]
    },
    {
      id: "thyroid-hypothyroid-symptoms",
      label: "Hypothyroid symptom history",
      text: "Any cold intolerance, fatigue, constipation, dry or coarse skin, hoarse voice, slowed thinking, weight gain, or heavy menses?",
      options: "None / Cold intolerance / Fatigue / Constipation / Dry or coarse skin / Hoarse voice / Slowed thinking / Weight gain / Heavy menses / Other ___",
      whenToAsk: "Ask when abnormal TSH, suspected hypothyroidism, Hashimoto disease, bradycardia, fatigue, constipation, or cold intolerance is selected.",
      diagnosticTarget: "Thyroid hormone deficiency phenotype and myxedema-risk symptoms.",
      management: "The answer changes TSH/free T4 interpretation, replacement planning, medication-adherence review, pregnancy target review when relevant, and myxedema screen when severe.",
      tags: ["thyroid_disease", "hypothyroidism", "hashimoto", "myxedema", "history_question"]
    }
  ],
  diabetes_foot_neuropathy_v1: [
    {
      id: "diabetes-foot-infection-ischemia-discharge",
      label: "Diabetes foot infection, ischemia, and offloading history",
      text: "Any spreading redness, drainage or odor, fever, new ischemic pain, rest pain, black tissue, loss of pulses, inability to offload, unsafe footwear, or lack of wound-care supplies or follow-up?",
      options: "None / Spreading redness / Drainage-odor / Fever / New ischemic pain / Rest pain / Black tissue / Loss of pulses / Cannot offload / Unsafe footwear / Lacks supplies-follow-up / Other ___",
      whenToAsk: "Ask when diabetes foot, neuropathy, ulcer, wound, nonhealing lesion, protective-sensation loss, vascular concern, or discharge-risk planning is selected.",
      diagnosticTarget: "Foot infection, limb ischemia, ulcer severity, offloading feasibility, footwear risk, and discharge safety.",
      management: "The answer changes wound/infection escalation, imaging or antibiotics, podiatry and vascular consultation, offloading plan, footwear counseling, supplies, and follow-up reliability.",
      tags: ["diabetes_foot", "wound", "infection", "ischemia", "offloading", "vascular_exam", "history_question"]
    }
  ],
  rash_skin_v1: [
    {
      id: "rash-severe-systemic-exposure",
      label: "Severe rash, systemic, mucosal, and exposure history",
      text: "Any fever, mucosal lesions, facial or tongue swelling, trouble breathing, skin pain, blistering, purpura, rapidly spreading redness, new medication, tick or travel exposure, or immunocompromise?",
      options: "None / Fever / Mucosal lesions / Facial-tongue swelling / Trouble breathing / Skin pain / Blistering / Purpura / Rapidly spreading redness / New medication / Tick-travel exposure / Immunocompromise / Other ___",
      whenToAsk: "Ask when rash, hives, pruritus, skin lesion, cellulitis, wound, ulcer, or systemic skin concern is selected.",
      diagnosticTarget: "Anaphylaxis, severe cutaneous adverse reaction, cellulitis or necrotizing infection, meningococcemia/purpura pattern, exposure-related rash, and host risk.",
      management: "The answer changes airway or anaphylaxis escalation, mucosal and full-skin exam priority, ED referral threshold, antimicrobial or source-control planning, medication cessation review, and isolation/testing choices.",
      tags: ["skin", "rash", "mucosal", "anaphylaxis", "infection", "medication_safety", "history_question"]
    }
  ],
  eye_redness_vision_v1: [
    {
      id: "vision-threatening-neuro-systemic",
      label: "Vision-threatening, neurologic, and systemic red-flag history",
      text: "Any severe headache, jaw claudication, scalp tenderness, neurologic deficit, halos or nausea, trauma or chemical exposure, shingles rash, immunosuppression, or inability to keep the eye open?",
      options: "None / Severe headache / Jaw claudication / Scalp tenderness / Neurologic deficit / Halos-nausea / Trauma / Chemical exposure / Shingles rash / Immunosuppression / Cannot keep eye open / Other ___",
      whenToAsk: "Ask when eye redness, eye pain, photophobia, vision change, diplopia, headache with ocular symptoms, or contact-lens risk is selected.",
      diagnosticTarget: "Giant-cell arteritis clues, acute angle-closure pattern, orbital or neurologic emergency, herpes zoster ophthalmicus, traumatic or chemical injury, and severe ocular inflammation.",
      management: "The answer changes urgency of visual acuity and pupil/EOM testing, fluorescein use, ED or ophthalmology referral, GCA evaluation, chemical irrigation, imaging, and infection precautions.",
      tags: ["eye_vision", "red_eye", "vision_change", "neuro", "heent_exam", "red_flag", "history_question"]
    }
  ],
  heent_throat_ear_v1: [
    {
      id: "heent-exposure-treatment-risk",
      label: "HEENT exposure, treatment, and complication-risk history",
      text: "Any sick contacts, recent COVID/flu/strep exposure, immunocompromise, recurrent ear or sinus infection, recent antibiotics, dental infection, tobacco or alcohol risk, severe unilateral pain, muffled voice, trismus, or inability to swallow fluids?",
      options: "None / Sick contacts / COVID-flu-strep exposure / Immunocompromised / Recurrent ear-sinus infection / Recent antibiotics / Dental infection / Tobacco-alcohol risk / Severe unilateral pain / Muffled voice-trismus / Cannot swallow fluids / Other ___",
      whenToAsk: "Ask when sore throat, ear pain, sinus/nasal symptoms, dysphagia, hoarseness, otalgia, epistaxis, fever, or focused HEENT concern is selected.",
      diagnosticTarget: "HEENT infection exposure, treatment failure, host risk, dental source, malignancy risk, deep-space infection clue, and hydration/disposition safety.",
      management: "The answer changes strep/viral testing, antibiotic or culture decisions, otoscopy/oropharynx/node focus, dental or ENT referral, imaging/escalation for deep neck infection, and outpatient safety-netting.",
      tags: ["heent", "heent_exam", "infection", "sore_throat", "ear_pain", "sinus", "airway", "history_question"]
    }
  ],
  bleeding_anemia_v1: [
    {
      id: "bleeding-medication-instability-transfusion-risk",
      label: "Bleeding medication, instability, and transfusion-risk history",
      text: "Any anticoagulant or antiplatelet use, liver disease, kidney disease, bleeding disorder, recent procedure or trauma, syncope, chest pain, dyspnea at rest, pregnancy, or prior transfusion reaction?",
      options: "None / Anticoagulant-antiplatelet / Liver disease / Kidney disease / Bleeding disorder / Procedure-trauma / Syncope / Chest pain / Dyspnea at rest / Pregnancy / Prior transfusion reaction / Other ___",
      whenToAsk: "Ask when bleeding, bruising, pallor, anemia, GI bleed, epistaxis, petechiae, or fatigue/weakness with anemia concern is selected.",
      diagnosticTarget: "Medication-related bleeding, coagulopathy risk, hemodynamic/cardiopulmonary instability, pregnancy context, and transfusion or reversal planning risk.",
      management: "The answer changes reversal planning, CBC/coagulation/type-screen urgency, transfusion threshold review, admission or endoscopy urgency, pregnancy-specific escalation, and consult threshold.",
      tags: ["bleeding", "anemia", "gi_bleed", "anticoagulation", "transfusion", "red_flag", "history_question"]
    }
  ],
  focused_msk_v1: [
    {
      id: "msk-red-flag-infection-neuro-trauma",
      label: "MSK red-flag, infection, neurologic, and trauma history",
      text: "Any trauma, inability to bear weight or use the limb, fever, hot swollen joint, immunosuppression, injection drug use, cancer history, neurologic deficit, bowel or bladder change, or anticoagulant use?",
      options: "None / Trauma / Cannot bear weight-use limb / Fever / Hot swollen joint / Immunosuppression / Injection drug use / Cancer history / Neurologic deficit / Bowel-bladder change / Anticoagulant / Other ___",
      whenToAsk: "Ask when joint, back, neck, limb, muscle, injury, swelling, or focused musculoskeletal concern is selected.",
      diagnosticTarget: "Fracture or dislocation risk, septic arthritis, spinal infection or cord compression, malignancy red flags, neurologic compromise, and bleeding risk.",
      management: "The answer changes imaging threshold, joint aspiration urgency, ED/orthopedic/neurosurgical escalation, antimicrobial consideration, gait safety, anticoagulation review, and site-specific exam focus.",
      tags: ["msk_exam", "joint_pain", "back_pain", "septic_arthritis", "fracture", "cord_compression", "history_question"]
    }
  ]
};

function historyQuestionDefinitionsForIntent(trace = {}) {
  const primary = validatedIntentHistoryQuestionDefinitions[trace.intent_id];
  const supplemental = supplementalValidatedIntentHistoryQuestionDefinitions[trace.intent_id] || [];
  const normalizeDefinitions = (definitions) => {
    if (!definitions) {
      return [];
    }
    return Array.isArray(definitions) ? definitions.filter(Boolean) : [definitions];
  };
  const seen = new Set();
  return [...normalizeDefinitions(primary), ...normalizeDefinitions(supplemental)]
    .filter((definition, index) => {
      const key = `${definition.id || definition.suffix || definition.label || definition.text || index}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function historyDefinitionExamId(trace = {}, definition = {}, index = 0) {
  if (!trace.intent_id) {
    return "";
  }
  const rawSuffix = definition.id || definition.suffix || definition.key || "";
  if (!rawSuffix && index === 0) {
    return `HISTORY-${trace.intent_id}`;
  }
  const suffix = normalizeEvidenceLabel(rawSuffix || `q${index + 1}`)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || `q${index + 1}`;
  return `HISTORY-${trace.intent_id}-${suffix}`;
}

function validatedIntentHistoryFloorEntries(validatedIntentTrace = [], selectedEntries = []) {
  if (!validatedIntentTrace.length) {
    return [];
  }
  const selectedIds = new Set(selectedEntries.map((entry) => entry.exam_id || entry.candidate?.exam_id).filter(Boolean));
  const selectedHistoryBuckets = new Set(
    selectedEntries
      .map((entry) => historyQuestionFromRecommendationEntry(entry))
      .map((question) => question ? historyQuestionSemanticBucket(question) : "")
      .filter(Boolean)
  );
  return validatedIntentTrace
    .flatMap((trace) => historyQuestionDefinitionsForIntent(trace).map((definition, index) => ({ trace, definition, index })))
    .filter(({ trace, definition, index }) => {
      const examId = historyDefinitionExamId(trace, definition, index);
      if (!definition || !examId || selectedIds.has(examId)) {
        return false;
      }
      const source = unique(["AHRQ_CALIBRATE_DX", ...(trace.source_ids || [])].filter(Boolean)).join("; ");
      const tags = unique([...(definition.tags || []), ...(trace.clinical_bundle_ids || []), ...(trace.source_ids || [])]);
      const semanticBucket = historyQuestionSemanticBucket({
        text: definition.text,
        options: definition.options,
        diagnosticPurpose: definition.diagnosticTarget,
        managementImplication: definition.management,
        source,
        tags
      });
      if (definition.id || definition.allowSemanticComplement) {
        return true;
      }
      return !semanticBucket || !selectedHistoryBuckets.has(semanticBucket);
    })
    .map(({ trace, definition, index }) => {
      const source = unique(["AHRQ_CALIBRATE_DX", ...(trace.source_ids || [])].filter(Boolean)).join("; ");
      const tags = unique([...(definition.tags || []), ...(trace.clinical_bundle_ids || []), ...(trace.source_ids || [])]);
      const examId = historyDefinitionExamId(trace, definition, index);
      const candidate = {
        exam_id: examId,
        item_type: "history_question",
        gap_type: "history_question",
        examLabel: definition.label,
        maneuver: definition.label,
        examOptions: definition.options,
        bedside_question_label: definition.text,
        bedside_question_options: definition.options,
        technique: "Ask the question directly and document the patient answer, uncertainty, and unavailable elements.",
        when_to_use_structured: definition.whenToAsk,
        limitations: "History may be limited by mental status, language, collateral availability, recall, and acuity; reconcile with chart, vitals, exam, and diagnostic testing.",
        score: 100,
        scoreBreakdown: { clinicalRelevance: 100, actionability: 100, diagnosticValue: 80, bedsideFeasibility: 100 },
        condition_or_syndrome: trace.label || trace.intent_id,
        diagnostic_target: definition.diagnosticTarget,
        result_changes_management: definition.management,
        management_link: definition.management,
        evidence_source_primary: source,
        source_citation: "Selected validated-intent source metadata plus AHRQ diagnostic safety workflow",
        LR_plus: "",
        LR_minus: "",
        evidence_tier: "Guideline",
        difficulty: "easy",
        time_burden_minutes: "1",
        equipment_needed: "none",
        patient_cooperation_required: "moderate",
        matchedTags: tags,
        tags,
        retrieval_tags: tags.join("; "),
        retrievalRoutes: ["validated_intent_history_floor"]
      };
      return {
        candidate,
        exam_id: candidate.exam_id,
        item_type: "history_question",
        gap_type: "history_question",
        label: definition.label,
        options: definition.options,
        domain: "Focused History",
        role: "core",
        reason: "Required source-localizing history for the selected validated clinical intent.",
        rationale: "Required source-localizing history for the selected validated clinical intent.",
        technique: candidate.technique,
        whenToUse: definition.whenToAsk,
        limitations: candidate.limitations,
        interpretationCautions: candidate.limitations,
        managementRelevance: definition.management,
        evidence: evidenceMetadataWithLikelihoodRatioNote({
          source,
          LR_plus: "",
          LR_minus: "",
          tier: "Guideline"
        }, candidate, candidate.item_type),
        feasibility: {
          difficulty: "easy",
          time_burden_minutes: "1",
          equipment_needed: "none",
          patient_cooperation_required: "moderate"
        },
        matchedTags: tags,
        retrievalTags: tags,
        specificMatchedTags: tags,
        recommendationSignals: [{ type: "core", domain: "Focused History", strength: 100 }],
        displayDiagnosticTarget: definition.diagnosticTarget,
        displayManagement: definition.management,
        displayBedsideQuestion: definition.text,
        displayBedsideQuestionOptions: definition.options,
        contextFitScore: 100,
        score: 100,
        suppressionReason: ""
      };
    });
}

function bundleRequiredProfileEntries(activeProfiles, context, selectedEntries = []) {
  return activeProfiles
    .flatMap((profile) => [
      ...(profile.requiredItems || []),
      ...(validatedBundleWorkupFloors[profile.id] || [])
    ].map((item) => ({ profile, item })))
    .filter(({ item }) => conditionMatches(item.when, context) && !conditionBlocks(item.unless, context) && !requiredProfileItemAlreadySatisfied(item, selectedEntries))
    .map(({ profile, item }) => {
      const role = item.role || "core";
      const whenToUse = item.whenToUse || item.when_to_use_structured || item.whenText || profile.name || "";
      const limitations = item.limitations
        || "Interpret in clinical context; abnormal bedside findings should be integrated with the full chart, patient trajectory, and measurement reliability.";
      const matchedTags = item.matchedTags || [];
      const source = item.source || item.evidence_source_primary || "";
      const itemType = item.item_type || item.gap_type || "exam_maneuver";
      const rawTechnique = item.technique || item.maneuver || item.action || item.label || "";
      const technique = itemType === "exam_maneuver"
        ? standardizedBedsideTechnique({
            ...item,
            examLabel: item.label,
            matchedTags,
            tags: matchedTags
          }, rawTechnique)
        : rawTechnique;
      const candidate = {
        exam_id: item.exam_id || item.id,
        item_type: itemType,
        gap_type: item.gap_type || itemType,
        examLabel: item.label,
        maneuver: item.maneuver || item.label,
        examOptions: item.options || "",
        bedside_question_label: item.bedsideQuestion || "",
        bedside_question_options: item.bedsideQuestionOptions || "",
        technique,
        when_to_use_structured: whenToUse,
        limitations,
        score: item.score || 100,
        scoreBreakdown: { clinicalRelevance: 100, actionability: 100, diagnosticValue: 75, bedsideFeasibility: 100 },
        condition_or_syndrome: profile.name,
        diagnostic_target: item.diagnosticTarget || "",
        result_changes_management: item.management || "",
        management_link: item.management || "",
        evidence_source_primary: source,
        source_citation: item.source_citation || source,
        LR_plus: item.LR_plus || "",
        LR_minus: item.LR_minus || "",
        evidence_tier: item.evidenceTier || "Guideline",
        difficulty: item.difficulty || "easy",
        time_burden_minutes: item.time_burden_minutes || "0.5",
        equipment_needed: item.equipment_needed || "none",
        patient_cooperation_required: item.patient_cooperation_required || "low",
        matchedTags,
        tags: matchedTags,
        retrieval_tags: matchedTags.join(";"),
        retrievalRoutes: ["validated_bundle_required"]
      };
      const displayLabel = actionSpecificPhysicalExamLabel(candidate, item.label);
      return {
        candidate,
        exam_id: candidate.exam_id,
        item_type: candidate.item_type,
        gap_type: candidate.gap_type,
        label: displayLabel,
        originalLabel: item.label,
        options: item.options || "",
        domain: item.domain || profile.name,
        role,
        reason: item.reason || "Required by the selected validated clinical bundle.",
        rationale: item.reason || "Required by the selected validated clinical bundle.",
        technique,
        whenToUse,
        limitations,
        interpretationCautions: limitations,
        managementRelevance: item.management || "",
        evidence: evidenceMetadataWithLikelihoodRatioNote({
          source,
          LR_plus: item.LR_plus || "",
          LR_minus: item.LR_minus || "",
          tier: item.evidenceTier || "Guideline"
        }, candidate, candidate.item_type),
        feasibility: {
          difficulty: item.difficulty || "easy",
          time_burden_minutes: item.time_burden_minutes || "0.5",
          equipment_needed: item.equipment_needed || "none",
          patient_cooperation_required: item.patient_cooperation_required || "low"
        },
        matchedTags,
        retrievalTags: matchedTags,
        specificMatchedTags: matchedTags,
        recommendationSignals: [{ type: role, domain: item.domain || profile.name, strength: role === "core" ? 100 : 70 }],
        displayDiagnosticTarget: item.diagnosticTarget || "",
        displayManagement: item.management || "",
        displayBedsideQuestion: item.bedsideQuestion || "",
        displayBedsideQuestionOptions: item.bedsideQuestionOptions || "",
        contextFitScore: item.contextFitScore || 100,
        score: item.score || 100,
        suppressionReason: ""
      };
    });
}

function acceptedCatalogGapReplacementEntries(activeProfiles, context, entries = [], selectedEntries = []) {
  const replacements = [];
  const seen = new Set(selectedEntries.map((entry) => entry.exam_id || entry.candidate?.exam_id).filter(Boolean));
  activeProfiles
    .flatMap((profile) => (profile.requiredGaps || []).map((gap) => ({ profile, gap })))
    .filter(({ gap }) => isStagedCatalogGapDefinition(gap))
    .filter(({ gap }) => conditionMatches(gap.when, context) && !conditionBlocks(gap.unless, context) && !gapAlreadySatisfied(gap, selectedEntries))
    .forEach(({ profile, gap }) => {
      const acceptedEntry = entries.find((entry) => {
        const candidate = entry.candidate || entry;
        return candidate.acceptedCatalogAddition
          && !isStagedCatalogGapDefinition(entry)
          && gapAlreadySatisfied(gap, [entry]);
      });
      if (!acceptedEntry) {
        return;
      }
      const acceptedCandidate = acceptedEntry.candidate || acceptedEntry;
      const examId = acceptedCandidate.exam_id || acceptedEntry.exam_id;
      if (!examId || seen.has(examId)) {
        return;
      }
      const role = gap.role || "core";
      const domain = gap.domain || acceptedEntry.domain || profile.name;
      const retrievalTags = unique([
        ...(acceptedEntry.retrievalTags || []),
        ...(acceptedEntry.matchedTags || []),
        ...(acceptedCandidate.matchedTags || []),
        ...(acceptedCandidate.tags || []),
        ...splitEvidenceList(acceptedCandidate.retrieval_tags),
        ...(gap.matchedTags || [])
      ]);
      const candidate = {
        ...acceptedCandidate,
        score: 100,
        scoreBreakdown: {
          ...(acceptedCandidate.scoreBreakdown || {}),
          clinicalRelevance: 100,
          actionability: Math.max(acceptedCandidate.scoreBreakdown?.actionability || 0, 95),
          diagnosticValue: Math.max(acceptedCandidate.scoreBreakdown?.diagnosticValue || 0, 80),
          bedsideFeasibility: Math.max(acceptedCandidate.scoreBreakdown?.bedsideFeasibility || 0, 90)
        },
        diagnostic_target: acceptedCandidate.diagnostic_target || gap.diagnosticTarget || "",
        result_changes_management: acceptedCandidate.result_changes_management || gap.management || "",
        management_link: acceptedCandidate.management_link || gap.management || "",
        bedside_question_label: acceptedCandidate.bedside_question_label || gap.bedsideQuestion || "",
        bedside_question_options: acceptedCandidate.bedside_question_options || gap.bedsideQuestionOptions || "",
        retrievalRoutes: unique([
          ...(acceptedCandidate.retrievalRoutes || []),
          "accepted_catalog_replaces_gap",
          "validated_bundle_required"
        ]),
        matchedTags: retrievalTags,
        tags: retrievalTags,
        retrieval_tags: retrievalTags.join("; "),
        catalogGap: false,
        catalog_gap_review_status: "",
        catalog_gap_resolution_plan: "",
        catalog_gap_rationale: ""
      };
      replacements.push({
        ...acceptedEntry,
        candidate,
        exam_id: examId,
        item_type: candidate.item_type || acceptedEntry.item_type || gap.item_type || gap.gap_type || "exam_maneuver",
        gap_type: candidate.gap_type || candidate.item_type || acceptedEntry.gap_type || acceptedEntry.item_type || gap.gap_type || "exam_maneuver",
        label: actionSpecificPhysicalExamLabel(candidate, acceptedEntry.label || candidate.examLabel || gap.label),
        originalLabel: acceptedEntry.label || candidate.examLabel || gap.label,
        options: acceptedEntry.options || candidate.examOptions || gap.options || "",
        action: acceptedEntry.action || acceptedEntry.maneuver || candidate.maneuver || gap.action || "",
        technique: standardizedBedsideTechnique({
          ...candidate,
          examLabel: acceptedEntry.label || candidate.examLabel || gap.label,
          matchedTags: retrievalTags,
          tags: retrievalTags
        }, acceptedEntry.technique || acceptedEntry.maneuver || candidate.technique || candidate.maneuver || gap.technique || ""),
        limitations: acceptedEntry.limitations || candidate.limitations || gap.limitations || "",
        domain,
        role,
        reason: acceptedEntry.reason
          || acceptedEntry.rationale
          || candidate.result_changes_management
          || gap.reason
          || "Required by the selected validated clinical bundle.",
        rationale: acceptedEntry.rationale
          || acceptedEntry.reason
          || candidate.result_changes_management
          || gap.reason
          || "Satisfies a required selected-bundle maneuver.",
        managementRelevance: acceptedEntry.managementRelevance || candidate.result_changes_management || gap.management || "",
        matchedTags: retrievalTags,
        retrievalTags,
        specificMatchedTags: retrievalTags,
        recommendationSignals: [
          ...(acceptedEntry.recommendationSignals || []),
          { type: role, domain, strength: role === "core" ? 100 : 75 }
        ],
        displayDiagnosticTarget: acceptedEntry.displayDiagnosticTarget || candidate.diagnostic_target || gap.diagnosticTarget || "",
        displayManagement: acceptedEntry.displayManagement || candidate.result_changes_management || candidate.management_link || gap.management || "",
        displayBedsideQuestion: acceptedEntry.displayBedsideQuestion || candidate.bedside_question_label || gap.bedsideQuestion || "",
        displayBedsideQuestionOptions: acceptedEntry.displayBedsideQuestionOptions || candidate.bedside_question_options || gap.bedsideQuestionOptions || "",
        contextFitScore: 100,
        score: 100,
        suppressionReason: "",
        catalogGap: false
      });
      seen.add(examId);
    });
  return replacements;
}

function recommendationGroupApplies(group, candidateText, context) {
  return group.pattern.test(candidateText)
    && conditionMatches(group.when, context)
    && !conditionBlocks(group.unless, context);
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
        source: group.source,
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
        source: group.source,
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

function avoidLabelMatchesCandidate(avoidLabel, candidateText) {
  const normalized = normalizeEvidenceLabel(avoidLabel);
  if (!normalized) {
    return false;
  }
  if (/\bunrelated lymph|lymph node survey|lymph-node survey\b/.test(normalized)
    && /\bthyroid (?:exam|inspection|palpation)\b/.test(candidateText)) {
    return false;
  }
  const broadRules = [
    { label: /\bbroad neuro\b|\bunrelated neuro\b/, candidate: /\b(?:pronator drift|babinski|vibration sense|proprioception|finger to nose|heel to shin|rapid alternating|romberg|gait|facial symmetry|eye closure|strength|reflex)\b/ },
    { label: /\bbroad abdominal\b|\bunrelated abdominal\b/, candidate: /\b(?:abdominal inspection|abdominal palpation|bowel sounds|murphy|rebound|psoas|obturator|cva tenderness|liver edge|liver span|spleen palpation)\b/ },
    { label: /\bunrelated lymph|lymph node survey|lymph-node survey\b/, candidate: /\b(?:lymph|node|nodes|tonsillar nodes|submandibular nodes|cervical nodes|supraclavicular nodes)\b/ },
    { label: /\bophthalmoscopic\b|\bfundoscopic\b/, candidate: /\b(?:ophthalmoscopic|fundoscopic|fundus)\b/ }
  ];
  if (broadRules.some((rule) => rule.label.test(normalized) && rule.candidate.test(candidateText))) {
    return true;
  }
  const escaped = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return escaped ? new RegExp(`\\b${escaped}\\b`, "i").test(candidateText) : false;
}

function contextAllowsAvoidLabel(avoidLabel, context) {
  const normalized = normalizeEvidenceLabel(avoidLabel);
  const checks = [
    { label: /\bpmi|apical impulse|point maximal impulse\b/, allow: /\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|murmur|heave|cardiac enlargement|precordial)\b/ },
    { label: /\bvibration sense|proprioception|broad neuro|pronator drift|babinski|gait|finger to nose|heel to shin|romberg|reflex\b/, allow: /\b(?:stroke|tia|focal|facial droop|aphasia|hemiparesis|seizure|postictal|weakness|numbness|tingling|paresthesia|neuropathy|foot ulcer|foot wound|gait|ataxia|fall|myelopathy|cord compression|radiculopathy|posterior column|b12|diabetes foot)\b/ },
    { label: /\bvisual acuity|ophthalmoscopic|fundoscopic|visual fields|extraocular\b/, allow: /\b(?:vision|visual|blurry|diplopia|eye pain|photophobia|headache|papilledema|pituitary|sellar|optic|orbitopathy|proptosis|thyroid eye|graves eye)\b/ },
    { label: /\bbroad abdominal|murphy|rebound|psoas|obturator|cva tenderness|liver|spleen\b/, allow: /\b(?:abdominal|abdomen|belly|stomach|vomit|diarrhea|constipation|distension|jaundice|melena|hematochezia|gi bleed|flank|urinary|dysuria|hematuria|ruq|rlq|guarding|peritonitis|cholecystitis|appendicitis|pyelonephritis|renal colic|severe pain|localized pain|focal tenderness)\b/ },
    { label: /\blower extremity edema|edema\b/, allow: /\b(?:edema|swelling|heart failure|chf|volume overload|orthopnea|pnd|renal|kidney|aki|liver|cirrhosis|ascites|dvt|leg|venous|hypothyroidism|myxedema)\b/ },
    { label: /\blymph|node\b/, allow: /\b(?:lymph|node|adenopathy|swollen glands|neck mass|malignancy|cancer|infection|sore throat|pharyngitis|thyroid mass|skin lesion|melanoma|night sweats|weight loss)\b/ },
    { label: /\bcarotid\b/, allow: /\b(?:syncope|presyncope|stroke|tia|bruit|carotid|vascular|focal)\b/ },
    { label: /\bmouth exam|oropharynx\b/, allow: /\b(?:dry|dehydration|hypovolemia|mouth|oral|sore throat|pharyngitis|infection|angioedema|mucosal|thrush|jaundice)\b/ }
  ];
  const match = checks.find((check) => check.label.test(normalized));
  if (match) {
    return match.allow.test(context);
  }
  const escaped = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return escaped ? new RegExp(`\\b${escaped}\\b`, "i").test(context) : false;
}

function suppressRuleAllowsContext(rule = {}, context = "") {
  const tagText = traceArray(rule.unless_tags_include || rule.unless_context_tags || "").join(" ");
  if (!tagText) {
    return false;
  }
  return traceArray(rule.unless_tags_include || rule.unless_context_tags || "").some((tag) => {
    const normalized = normalizeEvidenceLabel(tag);
    if (!normalized || /explicit patient modifier|secondary validated intent/.test(normalized)) {
      return false;
    }
    const escaped = normalized
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    return escaped ? new RegExp(`\\b${escaped}\\b`, "i").test(context) : false;
  });
}

function suppressRulesFromAvoidLabels(avoidLabels = []) {
  return traceArray(avoidLabels).map((avoidLabel) => ({
    rule_id: `legacy_avoid_label_${normalizeEvidenceLabel(avoidLabel).replace(/\s+/g, "_") || "item"}`,
    suppress_labels: [avoidLabel],
    reason: `Legacy selected-intent avoid label: ${avoidLabel}.`,
    unless_tags_include: []
  }));
}

function selectedIntentSuppressRuleSuppression(candidateText, context, suppressRules = [], avoidLabels = []) {
  const rules = [
    ...traceArray(suppressRules).map((rule) => normalizeIntentSuppressRuleTrace(rule)).filter(Boolean),
    ...suppressRulesFromAvoidLabels(avoidLabels)
  ];
  const seen = new Set();
  for (const rule of rules) {
    const ruleKey = `${rule.rule_id}::${(rule.suppress_labels || []).join("|")}`;
    if (seen.has(ruleKey)) {
      continue;
    }
    seen.add(ruleKey);
    for (const suppressLabel of rule.suppress_labels || []) {
      if (!avoidLabelMatchesCandidate(suppressLabel, candidateText)) {
        continue;
      }
      if (contextAllowsAvoidLabel(suppressLabel, context) || suppressRuleAllowsContext(rule, context)) {
        continue;
      }
      const reason = rule.reason || `${suppressLabel} is outside the selected validated intent scope.`;
      return `Suppressed by selected validated intent suppress rule ${rule.rule_id}: ${reason} Add a matching modifier or secondary validated intent before using this item.`;
    }
  }
  return "";
}

function selectedIntentAvoidLabelSuppression(candidateText, context, avoidLabels = [], suppressRules = []) {
  return selectedIntentSuppressRuleSuppression(candidateText, context, suppressRules, avoidLabels);
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
    && !/\b(?:ruq|rlq|right upper quadrant|right lower quadrant|jaundice|cholecystitis|appendicitis|peritonitis|guarding|rebound|localized|localised|localizing|focal abdominal|focal pain|focal tenderness|severe abdominal|severe pain|pelvic|ectopic|pid|pelvic inflammatory|splenomegaly|lymphoma|lymphadenopathy|swollen glands|night sweats|malignancy|cancer|liver|spleen)\b/.test(context)) {
    return "Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.";
  }
  if (/\b(?:pmi|apical impulse)\b/.test(candidateText)
    && !/\b(?:heart failure|cardiomyopathy|volume overload|orthopnea|pnd|edema|murmur|cardiac enlargement|heave)\b/.test(context)) {
    return "PMI/apical impulse is reserved for cardiac, heart-failure, or volume-overload contexts.";
  }
  if (/\b(?:lower extremity edema|edema)\b/.test(candidateText)
    && !/\b(?:edema|swelling|heart failure|chf|volume overload|orthopnea|pnd|diuresis|aki|renal|kidney|oliguria|hypovolemia|dehydration|shock|dka|hhs|adrenal|hypercalcemia|hypothyroidism|myxedema|ascites|cirrhosis|liver|jaundice|leg|dvt|venous)\b/.test(context)) {
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

function outsideStrictBundleReason(candidateText, context) {
  if (/\b(?:setup|stethoscope cleaned|cleaned|draping|positioning|before patient contact|hygiene)\b/.test(candidateText)) {
    return "Technique/setup rows are audit metadata, not patient-specific bedside workup recommendations.";
  }
  if (/\b(?:blood pressure|heart rate|respiratory rate|temperature|oxygen saturation|spo2|current weight|weight|bedside glucose|fingerstick glucose|orthostatic)\b/.test(candidateText)) {
    return "Not promoted as a physical exam candidate because routine vitals/basic bedside data are modeled separately in the safety-check section.";
  }
  if (/\b(?:heart sounds)\b/.test(candidateText)) {
    return /\b(?:palpitations|arrhythmia|chest pain|dyspnea|heart failure|murmur|endocarditis|shock|syncope|thyroid|thyrotoxic)\b/.test(context)
      ? "Not recommended separately because the selected workup already includes the highest-yield cardiopulmonary/perfusion item for this context; use focused heart sounds when murmur, arrhythmia, shock, or cardiac symptoms are explicit."
      : "Heart sounds need palpitations, arrhythmia, chest pain, dyspnea, shock, murmur/endocarditis, thyroid, or another cardiopulmonary trigger.";
  }
  if (/\b(?:aortic area|pulmonic area|tricuspid area|mitral area)\b/.test(candidateText)) {
    return "Individual valve-area auscultation cards are not recommended separately unless murmur, valvular disease, endocarditis, chest pain, heart failure, or a focused cardiac-auscultation modifier is present; use the broader heart-sounds item first.";
  }
  if (/\b(?:posterior lung sounds|anterior lung sounds|lateral lung sounds|lung sounds|tactile fremitus|lung percussion|anterior lung percussion|posterior lung percussion)\b/.test(candidateText)) {
    return /\b(?:dyspnea|shortness of breath|hypoxia|pe|pulmonary embolism|heart failure|pneumonia|cough|wheeze|hemoptysis|pleuritic|fever|sepsis)\b/.test(context)
      ? "Not promoted because the selected workup already uses the highest-yield respiratory maneuvers; extra lung-field, percussion, or fremitus rows are conditional add-ons for focal consolidation, effusion, or unclear pulmonary source."
      : "Pulmonary auscultation/percussion maneuvers need dyspnea, cough, hypoxia, pneumonia, PE, heart-failure, or infection-source context.";
  }
  if (/\b(?:mouth exam|oropharynx|tongue protrusion|palate elevation|sclerae and conjunctivae)\b/.test(candidateText)) {
    return /\b(?:dehydration|hypovolemia|poor intake|vomit|sore throat|pharyngitis|angioedema|mucosal|jaundice|infection|fever|sepsis|heent)\b/.test(context)
      ? "Not promoted because the selected workup already contains the focused HEENT/source item it needs; broader oral, mucosal, or scleral checks require a specific dehydration, throat, jaundice, mucosal, or source-localizing trigger."
      : "Oral/HEENT maneuvers need dehydration, sore throat, mucosal, jaundice, infection-source, or focused HEENT context.";
  }
  if (/\b(?:scalp exam)\b/.test(candidateText)) {
    return "Scalp exam needs localized scalp symptoms, alopecia, rash, trauma, infestation/tick exposure, head wound, or dermatologic/skin-lesion context.";
  }
  if (/\b(?:external ears|otoscope exam|auditory acuity|sinus tenderness|nasal exam)\b/.test(candidateText)) {
    return "Ear, hearing, sinus, or nasal maneuvers need otalgia, hearing loss, ear drainage, vertigo with auditory symptoms, sinus pain, nasal obstruction/congestion, URI, or focused HEENT-source context.";
  }
  if (/\b(?:eyelids orbit|eyelid|orbit|proptosis|lid lag)\b/.test(candidateText)) {
    return /\b(?:thyroid|graves|thyrotoxic|hyperthyroid|myxedema)\b/.test(context)
      ? "Not recommended separately because the thyroid phenotype and thyroid exam rows cover routine thyroid eye/skin screening; use focused orbit/eyelid exam when orbitopathy, proptosis, eye pain, diplopia, or vision symptoms are explicit."
      : "Orbit or eyelid maneuvers need eye symptoms, trauma, orbital infection concern, thyroid eye disease, proptosis, diplopia, or focused HEENT context.";
  }
  if (/\b(?:visual acuity|visual fields|extraocular|convergence|pupils|ophthalmoscopic|fundoscopic)\b/.test(candidateText)) {
    return "Eye/cranial-nerve maneuvers need vision change, eye pain/redness, diplopia, headache/papilledema, pituitary/sellar, or focal neurologic context.";
  }
  if (/\b(?:eye closure strength)\b/.test(candidateText)) {
    return "Facial-nerve strength testing needs facial droop, Bell palsy concern, stroke/TIA symptoms, facial numbness/weakness, or another focal cranial-nerve context.";
  }
  if (/\b(?:thyroid exam|thyroid inspection|thyroid palpation|goiter)\b/.test(candidateText)) {
    return "Thyroid exam needs thyroid disease, goiter/nodule, compressive neck symptoms, orbitopathy, thyroid crisis, or a selected thyroid validated intent.";
  }
  if (/\b(?:tremor|skin inspection|skin exam|nail pitting|onycholysis|hair distribution|diaphoresis|skin temperature)\b/.test(candidateText)
    && /\b(?:thyroid|graves|thyrotoxic|hyperthyroid|myxedema)\b/.test(context)) {
    return "Not recommended separately because the selected thyroid phenotype row covers routine thyroid tremor, skin, hair, and diaphoresis screening; use the generic row only with a patient-specific tremor or dermatologic modifier.";
  }
  if (/\b(?:tanner staging|puberty|sexual maturity)\b/.test(candidateText)) {
    return "Tanner staging is reserved for pediatric, adolescent, delayed puberty, precocious puberty, or reproductive-development contexts and is not a routine adult thyroid-crisis maneuver.";
  }
  if (/\b(?:pronator drift|deltoid strength|biceps strength|triceps strength|wrist extension strength|wrist flexion strength|hip flexion strength|knee extension strength|knee flexion strength|ankle dorsiflexion|ankle plantarflexion|extremity light touch|extremity pinprick|vibration sense|great toe proprioception|babinski|patellar reflex|achilles reflex|brachioradialis reflex|gait|heel walking|toe walking|tandem gait|romberg|finger-to-nose|finger to nose|heel-to-shin|heel to shin|rapid alternating)\b/.test(candidateText)) {
    return "Neuro, gait, strength, sensory, reflex, or coordination maneuvers need focal neurologic deficit, weakness, sensory loss, ataxia/gait concern, cord/radicular symptoms, neuropathy, or diabetic-foot context.";
  }
  if (/\b(?:abdominal inspection|abdominal palpation|abdominal percussion|bowel sounds|cva tenderness|murphy sign|rebound tenderness|psoas sign|obturator sign|liver edge|liver span|spleen palpation)\b/.test(candidateText)) {
    return "Abdominal, hepatobiliary, peritoneal, spleen, or CVA maneuvers need abdominal pain/localization, GI bleeding, jaundice, flank/GU symptoms, sepsis source concern, or another validated abdominal/GU intent.";
  }
  if (/\b(?:tonsillar nodes|submandibular nodes|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|occipital nodes|lymph|node)\b/.test(candidateText)
    && !/\b(?:thyroid exam|thyroid inspection|thyroid palpation)\b/.test(candidateText)) {
    return "Lymph-node survey is not promoted without lymphadenopathy, infection, malignancy, skin-lesion, sore-throat, thyroid-mass, or systemic B-symptom context.";
  }
  if (/\b(?:dorsalis pedis pulses|posterior tibial pulses|femoral pulses|radial pulses|carotids|lower extremity edema|edema|jvp|pmi|apical impulse)\b/.test(candidateText)) {
    return "Vascular, edema, JVP, or precordial add-ons need shock/perfusion, DVT/leg symptoms, heart-failure/volume overload, vascular disease, syncope, or cardiopulmonary context.";
  }
  if (/\b(?:focused painful-site inspection|focused painful-site palpation|focused painful-site range of motion|knee inspection|knee palpation|knee extension rom|knee flexion rom|patellar grind|patellar ballottement|anterior drawer|posterior drawer|shoulder range|hip range|hip flexion rom|wrist range|ankle range)\b/.test(candidateText)) {
    return "Site-specific MSK maneuvers need pain localized to that joint, muscle, bone, or functional region.";
  }
  return "Not promoted because this maneuver lacks a direct syndrome, organ-system, management, or feasibility match for the selected validated workup; use only after adding a specific patient trigger or secondary validated intent.";
}

function normalizedRecommendedEquipment(candidate = {}) {
  const text = normalizeEvidenceText([
    candidate.examLabel,
    candidate.maneuver,
    candidate.exam_id,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding
  ].filter(Boolean).join(" "));
  if (/\b(?:bowel sounds|heart sounds|lung sounds|aortic area|pulmonic area|tricuspid area|mitral area)\b/.test(text)) {
    return "stethoscope";
  }
  if (/\b(?:blood pressure)\b/.test(text)) {
    return "blood pressure cuff";
  }
  if (/\b(?:temperature)\b/.test(text)) {
    return "thermometer";
  }
  if (/\b(?:bedside glucose|blood glucose|fingerstick glucose|point of care glucose)\b/.test(text)) {
    return "glucometer or recent point-of-care value";
  }
  if (/\b(?:otoscope)\b/.test(text)) {
    return "otoscope";
  }
  if (/\b(?:visual acuity)\b/.test(text)) {
    return "vision chart or near card";
  }
  if (/\b(?:mouth exam|oropharynx|sclerae|conjunctivae|pupils|visual fields|extraocular)\b/.test(text)) {
    return "penlight";
  }
  if (/\b(?:abdominal inspection|abdominal palpation|abdominal percussion|rebound tenderness|murphy sign|psoas sign|obturator sign|cva tenderness|jvp|edema|radial pulses|posterior tibial pulses|dorsalis pedis pulses|femoral pulses|pronator drift|facial symmetry|eye closure|mental status|gait|romberg|finger to nose|heel to shin|rapid alternating|focused painful-site inspection|focused painful-site palpation|focused painful-site range of motion)\b/.test(text)) {
    return "none";
  }
  return candidate.equipment_needed || "none";
}

function genericEvidenceExamOptions(value = "") {
  const rawOptions = Array.isArray(value) ? value : String(value || "").split(/\s*(?:[;|]|\s+\/\s+)\s*/);
  const tokens = rawOptions
    .map((option) => normalizeEvidenceLabel(option))
    .filter(Boolean);
  const genericTokens = tokens.filter((option) => /^(?:normal|abnormal|present|absent|normal absent|abnormal present|positive|negative|yes|no|unable|unable to assess|not assessed)$/.test(option));
  if (tokens.length < 3 || genericTokens.length !== tokens.length) {
    return false;
  }
  const joined = tokens.join(" ");
  return /\b(?:unable|unable to assess|not assessed)\b/.test(joined)
    && ((/\bnormal\b/.test(joined) && /\babnormal\b/.test(joined))
      || (/\bpresent\b/.test(joined) && /\babsent\b/.test(joined))
      || (/\bpositive\b/.test(joined) && /\bnegative\b/.test(joined))
      || (/\byes\b/.test(joined) && /\bno\b/.test(joined)));
}

function maneuverSpecificEvidenceExamOptions(candidate = {}) {
  const text = normalizeEvidenceLabel([
    candidate.examLabel,
    candidate.maneuver,
    candidate.technique,
    candidate.diagnostic_target,
    candidate.result_changes_management,
    candidate.base?.maneuver_or_finding,
    candidate.base?.source_item,
    Array.isArray(candidate.tags) ? candidate.tags.join(" ") : candidate.tags,
    candidate.retrieval_tags
  ].filter(Boolean).join(" "));
  const rules = [
    { pattern: /\brebound tenderness\b|\bperitonitis\b|\bguarding\b/, values: ["No rebound or involuntary guarding", "Rebound tenderness present", "Rigidity or generalized peritonitis concern", "Unable to assess"] },
    { pattern: /\bmurphy sign\b/, values: ["Negative Murphy sign", "RUQ inspiratory arrest or positive Murphy sign", "Peritoneal or unstable exam concern", "Unable to assess"] },
    { pattern: /\bcva tenderness\b|\bcostovertebral\b/, values: ["Absent", "Present right", "Present left", "Present bilateral", "Unable to assess"] },
    { pattern: /\bjvp\b|\bjugular venous pressure\b|\bneck veins\b/, values: ["JVP not elevated", "JVP elevated above expected level", "Waveform difficult or positioning limited", "Unable to assess"] },
    { pattern: /\bedema\b|\bpitting\b/, values: ["No edema", "Trace or 1+ edema", "2+ or greater edema", "Asymmetric or unilateral swelling", "Unable to assess"] },
    { pattern: /\blung sounds\b|\bbreath sounds\b|\bauscultat.*lung\b/, values: ["Clear and symmetric", "Focal crackles/rales", "Wheeze/rhonchi", "Diminished or asymmetric", "Unable to assess"] },
    { pattern: /\bheart sounds\b|\bmurmur\b|\bs3\b|\bs4\b/, values: ["Regular rhythm, no new murmur/gallop", "Irregular rhythm", "New murmur", "S3/S4 or gallop", "Unable to assess"] },
    { pattern: /\babdominal palpation\b|\bpalpate abdomen\b/, values: ["Nontender", "Localized tenderness", "Diffuse tenderness", "Guarding or peritoneal concern", "Unable to assess"] },
    { pattern: /\bmental status\b|\borientation\b/, values: ["Baseline alertness/orientation", "Confused or delirious", "Somnolent or agitated", "Unable to assess"] },
    { pattern: /\bmucous membranes?\b|\boral mucosa\b/, values: ["Moist mucosa", "Dry mucosa", "Very dry/cracked mucosa", "Unable to assess"] },
    { pattern: /\bskin turgor\b/, values: ["Normal recoil", "Reduced recoil", "Unable to assess"] },
    { pattern: /\bcapillary refill\b|\bperfusion\b/, values: ["Warm with brisk capillary refill", "Delayed capillary refill", "Cool, mottled, or poor perfusion concern", "Unable to assess"] },
    { pattern: /\bpulses?\b/, values: ["Symmetric/normal", "Diminished", "Absent", "Asymmetric", "Unable to assess"] },
    { pattern: /\btremor\b/, values: ["No tremor", "Fine tremor", "Coarse, severe, or function-limiting tremor", "Unable to assess"] },
    { pattern: /\bthyroid\b|\bgoiter\b|\bnodule\b/, values: ["Normal size/no palpable nodule", "Goiter", "Nodule or asymmetry", "Tender, fixed, or hard finding", "Unable to assess"] }
  ];
  return rules.find((rule) => rule.pattern.test(text))?.values || null;
}

function displayOptionsForCandidate(candidate = {}) {
  const rawOptions = candidate.examOptions || candidate.options || candidate.base?.suggested_options || candidate.bedside_question_options || "";
  if (!genericEvidenceExamOptions(rawOptions)) {
    return rawOptions;
  }
  const specificOptions = maneuverSpecificEvidenceExamOptions(candidate);
  return specificOptions ? specificOptions.join(" / ") : rawOptions;
}

function techniqueTooThinForCandidate(candidate = {}, rawTechnique = "") {
  const technique = String(rawTechnique || "").replace(/\s+/g, " ").trim();
  if (!technique) {
    return true;
  }
  const label = normalizeEvidenceLabel([
    candidate.examLabel,
    candidate.label,
    candidate.maneuver,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding
  ].filter(Boolean).join(" "));
  const normalizedTechnique = normalizeEvidenceLabel(technique);
  return technique.length < 28
    || (label && normalizedTechnique === label)
    || /^(?:exam|physical exam|thyroid exam|skin inspection|diaphoresis inspection|tremor observation|neck circumference|saddle sensation|rebound tenderness|murphy sign|test both legs|observe ability|observe gait|inspect abdomen|inspect posterior thorax|inspect sclerae and conjunctivae)$/i.test(technique);
}

function standardizedBedsideTechnique(candidate = {}, rawTechnique = "") {
  const raw = String(rawTechnique || "").replace(/\s+/g, " ").trim();
  if (!techniqueTooThinForCandidate(candidate, raw)) {
    return raw;
  }
  const text = normalizeEvidenceLabel([
    candidate.exam_id,
    candidate.examLabel,
    candidate.label,
    candidate.maneuver,
    candidate.technique,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding,
    candidate.base?.source_item,
    candidate.section,
    candidate.system,
    candidate.diagnostic_target,
    candidate.retrieval_tags,
    Array.isArray(candidate.tags) ? candidate.tags.join(" ") : candidate.tags,
    Array.isArray(candidate.matchedTags) ? candidate.matchedTags.join(" ") : candidate.matchedTags
  ].filter(Boolean).join(" "));
  const rules = [
    {
      pattern: /\bmurphy sign\b/,
      technique: "Press under the right costal margin at the midclavicular line while the patient takes a deep breath; document inspiratory arrest or focal RUQ pain and stop if severe pain or instability occurs."
    },
    {
      pattern: /\brebound tenderness\b|\bperitonitis\b|\bguarding\b/,
      technique: "Palpate gently first, then press slowly away from maximal tenderness and release quickly; document pain worse on release, involuntary guarding, rigidity, or inability to tolerate the maneuver."
    },
    {
      pattern: /\bthyroid\b|\bgoiter\b|\bnodule\b/,
      technique: "Inspect the neck at rest and while swallowing, then palpate the isthmus and both thyroid lobes while the patient swallows; document enlargement, nodules, tenderness, asymmetry, fixation, or compressive concern."
    },
    {
      pattern: /\bneck circumference\b|\bosa\b|\bsleep apnea\b/,
      technique: "With the patient upright and head neutral, place a tape measure horizontally around the neck at the level just below the laryngeal prominence and record the circumference in centimeters."
    },
    {
      pattern: /\bsaddle sensation\b|\bcauda equina\b|\bperineal sensory\b/,
      technique: "Ask about numbness in the saddle/perineal area first; perform a consented, privacy-protected perineal sensory exam only when clinically appropriate and document deferred or unable-to-assess status."
    },
    {
      pattern: /\bheel to shin\b|\bheel-to-shin\b/,
      technique: "Ask the patient to place one heel on the opposite knee and slide it down the shin to the ankle, then repeat on the other side; compare smoothness, dysmetria, and ability to complete safely."
    },
    {
      pattern: /\bpronator drift\b/,
      technique: "Ask the patient to hold both arms extended forward, palms up, eyes closed if safe, for at least 10 seconds; document downward drift, pronation, asymmetry, or inability to participate."
    },
    {
      pattern: /\btoe walking\b/,
      technique: "Only if safe, ask the patient to walk several steps on the toes with support nearby; compare plantarflexion strength and asymmetry and stop for pain, imbalance, or fall risk."
    },
    {
      pattern: /\bheel walking\b/,
      technique: "Only if safe, ask the patient to walk several steps on the heels with support nearby; compare dorsiflexion strength and asymmetry and stop for pain, imbalance, or fall risk."
    },
    {
      pattern: /\bgait\b/,
      technique: "Only if safe, observe standing, gait initiation, stride, base, arm swing, turning, and need for assistance; document unable-to-walk or fall-risk limitations instead of forcing the maneuver."
    },
    {
      pattern: /\bfacial symmetry\b|\bface droop\b|\bfacial droop\b/,
      technique: "Observe the face at rest, then ask the patient to smile, raise eyebrows, close eyes tightly, and show teeth if able; compare upper and lower facial movement side to side."
    },
    {
      pattern: /\bposterior thorax\b|\bthorax inspection\b/,
      technique: "Expose the posterior chest as appropriate and inspect from behind for symmetry, deformity, accessory muscle use, retractions, and respiratory effort before auscultation or percussion."
    },
    {
      pattern: /\babdominal inspection\b|\binspect abdomen\b/,
      technique: "With the patient supine and the abdomen exposed appropriately, inspect contour, distension, scars, visible peristalsis, pulsations, lesions, and symmetry before palpation."
    },
    {
      pattern: /\bfocused muscle tenderness\b|\bpainful site\b|\bmuscle tenderness\b/,
      technique: "Inspect the symptomatic area first, then palpate the painful muscle or site for focal tenderness, swelling, warmth, firmness, fluctuance, and pain out of proportion while comparing with the opposite side when possible."
    },
    {
      pattern: /\bdiaphoresis\b|\bclammy\b/,
      technique: "Inspect exposed skin, forehead, and palms for visible sweating or clamminess while noting ambient temperature, fever, anxiety, pain, and recent treatment context."
    },
    {
      pattern: /\btremor\b|\bshakiness\b/,
      technique: "Observe at rest, then ask the patient to extend both arms with fingers spread if able; document fine versus coarse tremor, asymmetry, functional impact, and inability to participate."
    },
    {
      pattern: /\bsclerae and conjunctivae\b|\bconjunctivae\b|\bsclerae\b/,
      technique: "Inspect sclerae and gently pull down the lower lids to view conjunctivae in good light; document pallor, icterus, injection, discharge, or inability to assess."
    },
    {
      pattern: /\bskin inspection\b|\binspect skin\b|\brash\b|\burticaria\b|\bwound\b/,
      technique: "Inspect exposed and symptomatic skin in good light; document morphology, distribution, color, blanching, warmth, tenderness, excoriations, drainage, and mucosal involvement when relevant."
    }
  ];
  return rules.find((rule) => rule.pattern.test(text))?.technique || raw;
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

function displayTechniqueForCandidate(candidate = {}) {
  const rawTechnique = [
    candidate.technique,
    candidate.how_to_perform,
    candidate.base?.how_to_perform,
    candidate.examiner_technique,
    candidate.base?.examiner_technique,
    candidate.maneuver,
    candidate.base?.maneuver_or_finding
  ].find((value) => String(value || "").trim()) || "";
  return standardizedBedsideTechnique(candidate, rawTechnique);
}

function displayWhenToUseForCandidate(candidate = {}) {
  return [
    candidate.when_to_use_structured,
    candidate.base?.include_when,
    candidate.condition_or_syndrome
  ].find((value) => String(value || "").trim()) || "";
}

function displayLimitationsForCandidate(candidate = {}) {
  return [
    candidate.limitations,
    candidate.contraindications_or_limitations,
    candidate.base?.limitations,
    candidate.base?.contraindications_or_limitations
  ].find((value) => String(value || "").trim()) || "";
}

function displayTagsForCandidate(candidate = {}) {
  return unique([
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ]);
}

const physicalExamActionVerbPattern = /^(?:inspect|palpate|auscultate|percuss|observe|test|check|compare|measure|listen|use|press|stage|estimate|elicit)\b/i;

function isPhysicalExamRecommendationCandidate(candidate = {}) {
  const type = String(candidate.item_type || candidate.gap_type || "").toLowerCase();
  return !["safety_check", "history_question", "question", "diagnostic_test", "reference_threshold", "red_flag", "escalation_cue", "management_change"].includes(type);
}

function actionSpecificPhysicalExamLabel(candidate = {}, fallbackLabel = "") {
  const label = String(fallbackLabel || candidate.examLabel || candidate.maneuver || candidate.exam_id || "").trim();
  if (!label || !isPhysicalExamRecommendationCandidate(candidate) || physicalExamActionVerbPattern.test(label)) {
    return label;
  }
  const text = normalizeEvidenceText([
    label,
    candidate.exam_id,
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.maneuver_or_finding,
    candidate.section,
    candidate.system,
    candidate.technique
  ].filter(Boolean).join(" "));
  const rules = [
    { pattern: /\banterior lung sounds\b/, label: "Auscultate anterior lung fields" },
    { pattern: /\blateral lung sounds\b/, label: "Auscultate lateral lung fields" },
    { pattern: /\bposterior lung sounds\b/, label: "Auscultate posterior lung fields" },
    { pattern: /\blung sounds\b|\bbreath sounds\b/, label: "Auscultate lung fields" },
    { pattern: /\bheart sounds\b/, label: "Auscultate heart sounds" },
    { pattern: /\bjvp\b|\bjugular venous pressure\b/, label: "Inspect jugular venous pressure" },
    { pattern: /\bradial pulses?\b/, label: "Palpate radial pulses" },
    { pattern: /\bposterior tibial pulses?\b/, label: "Palpate posterior tibial pulses" },
    { pattern: /\bdorsalis pedis pulses?\b/, label: "Palpate dorsalis pedis pulses" },
    { pattern: /\blower extremity edema\b|\bperipheral edema\b/, label: "Inspect and press lower extremity edema" },
    { pattern: /\bwork of breathing\b/, label: "Observe work of breathing" },
    { pattern: /\bunilateral leg swelling\b/, label: "Inspect unilateral leg swelling" },
    { pattern: /\bposterior thorax inspection\b/, label: "Inspect posterior thorax" },
    { pattern: /\bpmi\b|\bpoint of maximal impulse\b|\bapical impulse\b/, label: "Palpate point of maximal impulse" },
    { pattern: /\boropharynx\b/, label: "Inspect oropharynx" },
    { pattern: /\bmouth exam\b|\boral mucosa\b/, label: "Inspect oral mucosa" },
    { pattern: /\bneck circumference\b/, label: "Measure neck circumference" },
    { pattern: /\babdominal inspection\b/, label: "Inspect abdomen" },
    { pattern: /\babdominal percussion\b/, label: "Percuss abdomen" },
    { pattern: /\bbowel sounds\b/, label: "Auscultate bowel sounds" },
    { pattern: /\babdominal palpation\b/, label: "Palpate abdomen" },
    { pattern: /\bliver edge\b/, label: "Palpate liver edge" },
    { pattern: /\bliver span\b/, label: "Percuss liver span" },
    { pattern: /\bspleen palpation\b|\bspleen\b/, label: "Palpate spleen" },
    { pattern: /\brebound tenderness\b/, label: "Test rebound tenderness" },
    { pattern: /\bmurphy sign\b/, label: "Test Murphy sign" },
    { pattern: /\bpsoas sign\b/, label: "Test psoas sign" },
    { pattern: /\bobturator sign\b/, label: "Test obturator sign" },
    { pattern: /\bcva tenderness\b|\bcostovertebral angle tenderness\b/, label: "Percuss costovertebral angle tenderness" },
    { pattern: /\bgenital exam\b/, label: "Inspect genital area" },
    { pattern: /\binguinal nodes?\b/, label: "Palpate inguinal lymph nodes" },
    { pattern: /\bscrotal exam\b/, label: "Inspect and palpate scrotum" },
    { pattern: /\bcremasteric reflex\b/, label: "Test cremasteric reflex" },
    { pattern: /\bpronator drift\b/, label: "Test pronator drift" },
    { pattern: /\bvisual fields?\b/, label: "Test visual fields" },
    { pattern: /\bvisual acuity\b/, label: "Test visual acuity" },
    { pattern: /\bpupils?\b/, label: "Test pupillary light response" },
    { pattern: /\bextraocular movements?\b/, label: "Test extraocular movements" },
    { pattern: /\bfacial symmetry\b/, label: "Inspect facial symmetry" },
    { pattern: /\beye closure strength\b/, label: "Test eye closure strength" },
    { pattern: /\bfinger to nose\b|\bfinger-to-nose\b/, label: "Test finger-to-nose" },
    { pattern: /\brapid alternating movements?\b/, label: "Test rapid alternating movements" },
    { pattern: /\bheel to shin\b|\bheel-to-shin\b/, label: "Test heel-to-shin" },
    { pattern: /\bfacial light touch\b/, label: "Test facial light touch" },
    { pattern: /\bfacial sharp sensation\b/, label: "Test facial sharp sensation" },
    { pattern: /\bmasseter strength\b/, label: "Test masseter strength" },
    { pattern: /\bextremity light touch\b/, label: "Test extremity light touch" },
    { pattern: /\bextremity pinprick\b/, label: "Test extremity pinprick" },
    { pattern: /\bhip flexion strength\b/, label: "Test hip flexion strength" },
    { pattern: /\bknee extension strength\b/, label: "Test knee extension strength" },
    { pattern: /\bankle dorsiflexion strength\b/, label: "Test ankle dorsiflexion strength" },
    { pattern: /\bankle plantarflexion strength\b/, label: "Test ankle plantarflexion strength" },
    { pattern: /\bpatellar reflex\b/, label: "Test patellar reflex" },
    { pattern: /\bachilles reflex\b/, label: "Test Achilles reflex" },
    { pattern: /\bbabinski sign\b/, label: "Test Babinski sign" },
    { pattern: /\bsaddle sensation\b/, label: "Test saddle sensation" },
    { pattern: /\bromberg\b/, label: "Test Romberg" },
    { pattern: /\bpull test\b/, label: "Test postural pull response" },
    { pattern: /\btruncal ataxia\b/, label: "Observe truncal ataxia" },
    { pattern: /\btoe walking\b/, label: "Observe toe walking" },
    { pattern: /\bheel walking\b/, label: "Observe heel walking" },
    { pattern: /\btandem gait\b/, label: "Observe tandem gait" },
    { pattern: /\bgait\b/, label: "Observe gait" },
    { pattern: /\boutstretched hands tremor\b|\boutstretched-hands tremor\b/, label: "Observe outstretched-hands tremor" },
    { pattern: /\bdiaphoresis inspection\b|\bdiaphoresis\b/, label: "Inspect diaphoresis" },
    { pattern: /\btremor observation\b|\btremor\b/, label: "Observe tremor" },
    { pattern: /\bthyroid exam\b/, label: "Inspect and palpate thyroid" },
    { pattern: /\bskin inspection for thyroid phenotype\b/, label: "Inspect skin for thyroid phenotype" },
    { pattern: /\bhair thinning inspection\b|\bhair thinning\b/, label: "Inspect hair thinning" },
    { pattern: /\bdeep tendon reflex relaxation\b/, label: "Test deep tendon reflex relaxation" },
    { pattern: /\bvibration sense\b/, label: "Test vibration sense" },
    { pattern: /\bgreat toe proprioception\b/, label: "Test great toe proprioception" },
    { pattern: /\bskin lesion inspection\b|\bskin lesions?\b/, label: "Inspect skin lesions" },
    { pattern: /\bskin inspection\b|\bskin exam\b/, label: "Inspect skin" },
    { pattern: /\bcapillary refill\b/, label: "Press nail bed for capillary refill" },
    { pattern: /\bmucosal lesions?\b/, label: "Inspect mucosa for lesions" },
    { pattern: /\bwound inspection\b|\bwound\b/, label: "Inspect wound" },
    { pattern: /\bscalp exam\b|\bscalp\b/, label: "Inspect scalp" },
    { pattern: /\bperianal skin inspection\b|\bperianal skin\b/, label: "Inspect perianal skin" },
    { pattern: /\bnasal exam\b|\bnasal mucosa\b/, label: "Inspect nasal mucosa" },
    { pattern: /\botoscope exam\b|\botoscope\b/, label: "Use otoscope to inspect ears" },
    { pattern: /\bexternal ears?\b/, label: "Inspect external ears" },
    { pattern: /\bsinus tenderness\b/, label: "Palpate sinus tenderness" },
    { pattern: /\btonsillar nodes?\b|\bsubmandibular nodes?\b|\banterior cervical nodes?\b|\bposterior cervical nodes?\b|\bsupraclavicular nodes?\b|\bregional cervical lymph nodes?\b|\bcervical lymph nodes?\b/, label: "Palpate regional cervical lymph nodes" },
    { pattern: /\bregional lymph nodes?\b|\blymph nodes?\b/, label: "Palpate regional lymph nodes" },
    { pattern: /\bsclerae and conjunctivae\b/, label: "Inspect sclerae and conjunctivae" },
    { pattern: /\bophthalmoscopic exam\b|\bfundoscopic\b|\bfundus\b/, label: "Inspect fundus with ophthalmoscope" },
    { pattern: /\bfocused painful site inspection\b/, label: "Inspect painful site" },
    { pattern: /\bfocused painful site palpation\b|\bfocused muscle tenderness\b/, label: "Palpate painful site" },
    { pattern: /\bfocused painful site range of motion\b|\brange of motion\b/, label: "Test painful-site range of motion" },
    { pattern: /\bbone tenderness\b/, label: "Palpate focal bone tenderness" },
    { pattern: /\bdistal extremity warmth\b|\bextremity temperature\b/, label: "Palpate distal extremity warmth" },
    { pattern: /\bfemoral pulses?\b/, label: "Palpate femoral pulses" }
  ];
  const match = rules.find((rule) => rule.pattern.test(text));
  if (match) {
    return match.label;
  }
  if (/\binspection\b/.test(text)) {
    return `Inspect ${label.replace(/\s+inspection$/i, "").trim()}`;
  }
  if (/\bpalpation\b/.test(text)) {
    return `Palpate ${label.replace(/\s+palpation$/i, "").trim()}`;
  }
  if (/\bpercussion\b/.test(text)) {
    return `Percuss ${label.replace(/\s+percussion$/i, "").trim()}`;
  }
  if (/\breflex\b/.test(text)) {
    return `Test ${label}`;
  }
  if (/\bstrength|sensation|sensory|fields?|acuity|movements?\b/.test(text)) {
    return `Test ${label}`;
  }
  return label;
}

function recommendationCandidateEntry(candidate, context, activeProfiles, options = {}) {
  const candidateText = candidateRecommendationText(candidate);
  const maneuverText = candidateManeuverText(candidate);
  const ruleContext = options.ruleContext || context;
  const profileSignals = activeProfiles.flatMap((profile) => profileSignalsForCandidate(maneuverText, ruleContext, profile));
  const bestSignal = profileSignals.sort((a, b) => b.strength - a.strength)[0] || null;
  const specificMatchedTags = (candidate.matchedTags || []).filter((tag) => !weakRecommendationTags.has(tag));
  const overlapTerms = recommendationContextOverlap(candidateText, context);
  const weakOnlyMatch = (candidate.matchedTags || []).length > 0 && specificMatchedTags.length === 0 && !profileSignals.length;
  const suppressionReason = suppressionForCandidate(maneuverText, ruleContext, activeProfiles)
    || selectedIntentAvoidLabelSuppression(maneuverText, ruleContext, options.intentAvoidLabels || [], options.intentSuppressRules || []);
  const strictProfileScope = Boolean(options.strictProfileScope);
  const acceptedKnowledgePackItem = candidate.review?.status === "accepted"
    && (candidate.retrievalRoutes || []).includes("activated_knowledge_pack");
  const outsideStrictBundle = strictProfileScope && !bestSignal && !acceptedKnowledgePackItem;
  const allowFallbackPromotion = !strictProfileScope && !activeProfiles.length;
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
  if (outsideStrictBundle) {
    contextFitScore -= 70;
  }
  contextFitScore = Math.max(0, Math.min(100, Math.round(contextFitScore)));

  let role = "suppressed";
  if (!suppressionReason && !outsideStrictBundle && (candidate.review?.status === "accepted" || bestSignal?.type === "core")) {
    role = "core";
  } else if (!suppressionReason && !outsideStrictBundle && (bestSignal?.type === "conditional" || (allowFallbackPromotion && (contextFitScore >= 54 || (specificMatchedTags.length && (candidate.score || 0) >= 70))))) {
    role = "conditional";
  }

  const reason = suppressionReason
    || bestSignal?.reason
    || (outsideStrictBundle ? outsideStrictBundleReason(maneuverText, ruleContext) : "")
    || (specificMatchedTags.length ? `Matches ${specificMatchedTags.slice(0, 4).join(", ")} context with management-linked evidence.` : "")
    || (overlapTerms.length ? `Shares context terms: ${overlapTerms.slice(0, 5).join(", ")}.` : "")
    || "Lower context fit than the recommended checklist.";
  const normalizedEquipment = normalizedRecommendedEquipment(candidate);
  const technique = displayTechniqueForCandidate(candidate);
  const whenToUse = displayWhenToUseForCandidate(candidate);
  const limitations = displayLimitationsForCandidate(candidate);
  const retrievalTags = displayTagsForCandidate(candidate);
  const examOptions = displayOptionsForCandidate(candidate);
  const displayCandidate = {
    ...candidate,
    examOptions,
    technique,
    when_to_use_structured: whenToUse,
    limitations,
    difficulty: candidate.difficulty || "moderate",
    time_burden_minutes: candidate.time_burden_minutes || "1",
    equipment_needed: normalizedEquipment,
    patient_cooperation_required: candidate.patient_cooperation_required || "low"
  };
  const displayLabel = actionSpecificPhysicalExamLabel(
    displayCandidate,
    displayCandidate.examLabel || displayCandidate.maneuver || displayCandidate.exam_id
  );

  return {
    candidate: displayCandidate,
    exam_id: displayCandidate.exam_id,
    label: displayLabel,
    originalLabel: displayCandidate.examLabel || displayCandidate.maneuver || displayCandidate.exam_id,
    options: examOptions || "",
    domain: bestSignal?.domain || displayCandidate.section || displayCandidate.system || "Exam",
    role,
    reason,
    rationale: reason,
    technique,
    whenToUse,
    limitations,
    interpretationCautions: limitations,
    managementRelevance: displayCandidate.result_changes_management || displayCandidate.management_link || "",
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source: bestSignal?.source || candidateSourceLabel(displayCandidate),
      LR_plus: displayCandidate.LR_plus || "",
      LR_minus: displayCandidate.LR_minus || "",
      tier: displayCandidate.evidence_tier || ""
    }, displayCandidate, displayCandidate.item_type),
    feasibility: {
      difficulty: displayCandidate.difficulty || "moderate",
      time_burden_minutes: displayCandidate.time_burden_minutes || "",
      equipment_needed: displayCandidate.equipment_needed || "none",
      patient_cooperation_required: displayCandidate.patient_cooperation_required || ""
    },
    matchedTags: retrievalTags,
    retrievalTags,
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
    const key = options.collapseFamilies
      ? recommendationFamilyRedundancyKey(entry.candidate, context)
      : candidateRedundancyKey(entry.candidate, context);
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

function reasonExplainsNonRecommendation(reason = "") {
  const text = normalizeEvidenceLabel(reason);
  if (!text || text === "suppressed") {
    return false;
  }
  return /\b(?:suppress rule|suppressed by selected|not promoted|not recommended|not included|needs?|requires?|reserved|modeled separately|audit metadata|outside|without|unless|lower yield|site specific|do not need|does not need|not .*focused|replaced by)\b/.test(text);
}

function postSelectionSuppressedEntry(entry = {}, selectedEntries = [], context = "") {
  const existingReason = entry.reason || entry.suppressionReason || "";
  const genericNonPromotionReason = /lacks a direct syndrome, organ-system, management, or feasibility match/i.test(existingReason);
  if (reasonExplainsNonRecommendation(existingReason) && !genericNonPromotionReason) {
    return entry;
  }
  const entryDisplayLabel = normalizeEvidenceLabel(actionSpecificPhysicalExamLabel(
    entry.candidate || entry,
    entry.label || entry.examLabel || entry.maneuver || entry.candidate?.examLabel || entry.candidate?.maneuver || ""
  ));
  const labelSelected = selectedEntries.find((selected) => normalizeEvidenceLabel(actionSpecificPhysicalExamLabel(
    selected.candidate || selected,
    selected.label || selected.examLabel || selected.maneuver || selected.candidate?.examLabel || selected.candidate?.maneuver || ""
  )) === entryDisplayLabel);
  const familyKey = recommendationFamilyRedundancyKey(entry.candidate || entry, context);
  const familySelected = selectedEntries.find((selected) => (
    recommendationFamilyRedundancyKey(selected.candidate || selected, context) === familyKey
  ));
  const fallbackReason = outsideStrictBundleReason(candidateManeuverText(entry.candidate || entry), context);
  const coveringSelection = labelSelected || familySelected;
  const reason = coveringSelection
    ? `Not recommended separately because ${coveringSelection.label || coveringSelection.exam_id || "a selected item"} covers the same bedside exam family; add a patient-specific modifier before using this lower-priority variant.`
    : (fallbackReason || "Not included because higher-priority selected items already cover the validated intent within bedside feasibility limits; add a patient-specific modifier or secondary validated intent before using this lower-priority candidate.");
  return {
    ...entry,
    role: "suppressed",
    reason,
    rationale: reason,
    suppressionReason: reason
  };
}

function suppressedRecommendationLabel(entry = {}) {
  const candidate = entry.candidate || entry;
  return entry.original_label || entry.sourceLabel || entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "";
}

function stripSuppressedRecommendationPrefix(value = "") {
  return String(value || "")
    .replace(/^(?:not\s+recommended|suppressed(?:\/not-recommended)?|suppressed\s+or\s+lower-fit|lower-fit)\s*[-:]\s*/i, "")
    .trim();
}

function suppressedRecommendationDisplayLabel(entry = {}) {
  const sourceLabel = stripSuppressedRecommendationPrefix(suppressedRecommendationLabel(entry))
    || entry.exam_id
    || entry.candidate?.exam_id
    || "suppressed item";
  return `Not recommended - ${sourceLabel}`;
}

function withSuppressedRecommendationDisplayLabel(entry = {}) {
  const originalLabel = stripSuppressedRecommendationPrefix(suppressedRecommendationLabel(entry))
    || entry.exam_id
    || entry.candidate?.exam_id
    || "suppressed item";
  return {
    ...entry,
    role: "suppressed",
    original_label: entry.original_label || originalLabel,
    label: suppressedRecommendationDisplayLabel({ ...entry, original_label: originalLabel })
  };
}

function isSetupOrProcessSuppressedEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  const text = normalizeEvidenceLabel([
    suppressedRecommendationLabel(entry),
    entry.reason,
    entry.suppressionReason,
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.checklist_label
  ].filter(Boolean).join(" "));
  return setupOrProcessPattern.test(text);
}

function suppressedRecommendationSortScore(entry = {}) {
  return Number(entry.score || entry.candidate?.score || 0)
    + Number(entry.contextFitScore || entry.candidate?.contextFitScore || 0) / 1000;
}

function curatedSuppressedRecommendationItems(items = [], maxItems = 36) {
  const byLabel = new Map();
  items
    .filter((entry) => !isSetupOrProcessSuppressedEntry(entry))
    .forEach((entry) => {
      const key = normalizeEvidenceLabel(suppressedRecommendationLabel(entry));
      if (!key) {
        return;
      }
      const previous = byLabel.get(key);
      if (!previous || suppressedRecommendationSortScore(entry) > suppressedRecommendationSortScore(previous)) {
        byLabel.set(key, entry);
      }
    });
  return Array.from(byLabel.values())
    .sort((a, b) => b.score - a.score || b.contextFitScore - a.contextFitScore)
    .slice(0, maxItems)
    .map(withSuppressedRecommendationDisplayLabel);
}

function recommendationFamilyRedundancyKey(candidate, context = "") {
  const identityText = normalizeEvidenceLabel([
    candidate.exam_id,
    candidate.examLabel,
    candidate.label,
    candidate.maneuver
  ].join(" "));
  if (/\b(?:tonsillar|submandibular|anterior cervical|posterior cervical|supraclavicular|cervical|lymph|nodes?)\b/.test(identityText)) {
    return "regional-lymph-node-exam";
  }
  if (/\bthyroid\b/.test(identityText)) {
    return "thyroid-exam";
  }
  const keyText = normalizeEvidenceLabel([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.section,
    candidate.base?.region_or_subsection
  ].join(" "));
  if (/\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds|auscultate posterior lung fields|auscultate lateral lung fields|auscultate anterior lung fields)\b/.test(keyText)) {
    return "lung-auscultation";
  }
  if (/\b(?:posterior thorax inspection|anterior thorax inspection|inspect posterior thorax|inspect anterior thorax)\b/.test(keyText)) {
    return "work-of-breathing-inspection";
  }
  if (/\b(?:tonsillar nodes|submandibular nodes|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|regional cervical lymph nodes|regional lymph nodes|regional lymph node exam|cervical lymph nodes|tonsillar lymph nodes|lymph nodes)\b/.test(keyText)
    || (/\bnodes\b/.test(keyText) && /\blymph\b/.test(keyText))) {
    return "regional-lymph-node-exam";
  }
  if (/\b(?:mouth(?: exam)?|oropharynx|oral cavity|pharynx|tonsil|inspect mouth|inspect oropharynx)\b/.test(keyText)) {
    return "oral-oropharyngeal-exam";
  }
  if (/\b(?:aortic area|pulmonic area|tricuspid area|mitral area)\b/.test(keyText)) {
    return "individual-valve-listening-areas";
  }
  return candidateRedundancyKey(candidate, context);
}

const collapsibleCoreExamFamilyKeys = new Set([
  "lung-auscultation",
  "work-of-breathing-inspection",
  "oral-oropharyngeal-exam",
  "regional-lymph-node-exam",
  "individual-valve-listening-areas"
]);

function removeDuplicateCoreExamFamilyEntries(entries = [], context = "") {
  const removed = [];
  const seenByFamily = new Map();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (isNonExamWorkupEntry(entry)) {
      continue;
    }
    const key = recommendationFamilyRedundancyKey(entry.candidate || entry, context);
    if (!collapsibleCoreExamFamilyKeys.has(key)) {
      continue;
    }
    const previous = seenByFamily.get(key);
    if (!previous) {
      seenByFamily.set(key, entry);
      continue;
    }
    const reason = `Not recommended separately because ${previous.label || previous.exam_id || "a selected item"} covers the same bedside exam family in the core checklist.`;
    removed.push({
      ...entry,
      role: "suppressed",
      reason,
      rationale: reason,
      suppressionReason: reason
    });
    entries.splice(index, 1);
  }
  return removed.reverse();
}

const basicSafetyCheckPattern = /\b(?:blood pressure|heart rate|respiratory rate|temperature|oxygen saturation|spo2|pulse oximetry|bedside glucose|point-of-care glucose|fingerstick glucose|blood glucose|weight|body mass index|bmi|orthostatic|orthostasis|pain score|pregnancy possibility safety check|pregnancy status|red-flag review|red flag review|safety check)\b/;

export function isBasicSafetyCheckEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  if (candidate.item_type === "safety_check") {
    return true;
  }
  const typedSection = String(candidate.item_type || candidate.gap_type || entry.item_type || entry.gap_type || "").toLowerCase();
  if (["history_question", "question", "diagnostic_test", "reference_threshold", "red_flag", "escalation_cue"].includes(typedSection)) {
    return false;
  }
  const text = normalizeEvidenceLabel([
    entry.label,
    entry.domain,
    candidate.exam_id,
    candidate.examLabel,
    candidate.maneuver,
    candidate.condition_or_syndrome,
    candidate.diagnostic_target,
    candidate.retrieval_tags,
    ...(candidate.matchedTags || [])
  ].filter(Boolean).join(" "));
  return basicSafetyCheckPattern.test(text);
}

function isHistoryQuestionEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  return candidate.item_type === "history_question";
}

function isDiagnosticTestEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  const type = String(candidate.item_type || candidate.gap_type || entry.item_type || entry.gap_type || "").toLowerCase();
  return type === "diagnostic_test" || type === "reference_threshold";
}

function isRedFlagEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  const type = String(candidate.item_type || candidate.gap_type || entry.item_type || entry.gap_type || "").toLowerCase();
  return type === "red_flag" || type === "escalation_cue";
}

function isManagementChangeEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  const type = String(candidate.item_type || candidate.gap_type || entry.item_type || entry.gap_type || "").toLowerCase();
  return type === "management_change";
}

function isNonExamWorkupEntry(entry = {}) {
  return isBasicSafetyCheckEntry(entry)
    || isHistoryQuestionEntry(entry)
    || isDiagnosticTestEntry(entry)
    || isRedFlagEntry(entry)
    || isManagementChangeEntry(entry);
}

function candidateHasVettedBedsideQuestion(candidate = {}) {
  const routes = candidate.retrievalRoutes || [];
  return candidate.item_type === "history_question"
    || candidate.gap_type === "history_question"
    || candidate.catalogGap
    || routes.includes("validated_bundle_required")
    || routes.includes("validated_bundle_gap")
    || routes.includes("validated_intent_history_floor");
}

function safetyEntryCanContributeHistory(entry = {}) {
  if (!isBasicSafetyCheckEntry(entry)) {
    return true;
  }
  const candidate = entry.candidate || entry;
  const routes = candidate.retrievalRoutes || [];
  return candidate.catalogGap
    || routes.includes("validated_bundle_required")
    || routes.includes("validated_bundle_gap")
    || routes.includes("validated_intent_safety_floor");
}

function routineVitalSafetyFloorReplacementKey(entry = {}) {
  const candidate = entry.candidate || entry;
  const examId = String(candidate.exam_id || entry.exam_id || "");
  const isSpecificModeledSafetyCheck = (candidate.item_type === "safety_check" || candidate.gap_type === "safety_check")
    && !/^GAP-vitals-/i.test(examId)
    && !/^SAFETY-validated-/i.test(examId);
  if (/^SAFETY-validated-/i.test(examId) || isSpecificModeledSafetyCheck) {
    return "";
  }
  const text = normalizeEvidenceLabel([
    entry.label,
    candidate.exam_id,
    candidate.examLabel,
    candidate.maneuver,
    candidate.section,
    candidate.base?.section,
    candidate.retrieval_tags,
    ...(candidate.matchedTags || [])
  ].filter(Boolean).join(" "));
  if (/\bblood pressure\b/.test(text)) {
    return "blood pressure";
  }
  if (/\bheart rate\b/.test(text)) {
    return "heart rate";
  }
  if (/\brespiratory rate\b/.test(text)) {
    return "respiratory rate";
  }
  if (/\b(?:oxygen saturation|spo2|pulse oximetry|pulse ox)\b/.test(text)) {
    return "oxygen saturation";
  }
  if (/\btemperature\b/.test(text)) {
    return "temperature";
  }
  return "";
}

function removeRoutineCatalogVitalEntries(entries = []) {
  const removed = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const replacementKey = routineVitalSafetyFloorReplacementKey(entries[index]);
    if (!replacementKey) {
      continue;
    }
    const entry = {
      ...entries[index],
      role: "suppressed",
      reason: `Replaced by the validated ${replacementKey} safety-floor item so basic bedside data stays separate from physical exam maneuvers.`,
      rationale: `Replaced by the validated ${replacementKey} safety-floor item so basic bedside data stays separate from physical exam maneuvers.`,
      suppressionReason: `Replaced by validated ${replacementKey} safety-floor item.`
    };
    removed.unshift(entry);
    entries.splice(index, 1);
  }
  return removed;
}

function historyQuestionKey(question = {}) {
  return normalizeEvidenceLabel([question.text, question.options].filter(Boolean).join(" "));
}

function cleanHistoryDetailFragment(value = "") {
  return String(value || "")
    .replace(/\b(?:and|or)\s*$/i, "")
    .replace(/^\b(?:and|or)\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:]+$/g, "");
}

function splitHistoryDetailList(value = "") {
  return String(value || "")
    .replace(/\band\/or\b/gi, ", ")
    .replace(/\s+(?:or|and)\s+/gi, ", ")
    .split(/[,;]/)
    .map(cleanHistoryDetailFragment)
    .filter((fragment) => fragment.length >= 4)
    .filter((fragment) => !/^(?:any|new|current|recent|history of|symptoms?|medications?|supplements?)$/i.test(fragment))
    .slice(0, 8);
}

function medicationHistoryDetailFragment(fragment = "") {
  const normalized = normalizeEvidenceLabel(fragment);
  if (normalized === "biotin") return "high-dose biotin or supplement use";
  if (normalized === "missed doses") return "missed or delayed doses";
  if (normalized === "supplements") return "over-the-counter supplements";
  if (normalized === "hormone therapy") return "hormone therapy or androgen/estrogen exposure";
  if (normalized === "recent treatment changes") return "recent dose or treatment changes";
  return fragment;
}

function uniqueHistoryDetailPrompts(prompts = []) {
  const seen = new Set();
  return prompts
    .map((prompt) => String(prompt || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((prompt) => {
      const key = normalizeEvidenceLabel(prompt);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function infectionSourceDetailPrompts(normalized = "") {
  if (!/\b(?:fever|infection|sepsis|source|pneumonia|respiratory|urinary|flank|wound|line)\b/.test(normalized)) {
    return null;
  }
  if (/what symptoms localize|localize the fever source|localizing symptoms|most likely[^.?!]*source|what source|which source/.test(normalized)) {
    return [
      "Ask about respiratory source: cough, sputum, dyspnea, pleuritic pain, wheeze, hypoxia, aspiration risk, and sick respiratory contacts.",
      "Ask about HEENT or dental source: sore throat, ear or sinus pain, oral lesions, dental pain, muffled voice, drooling, or trouble swallowing.",
      "Ask about urinary or flank source: dysuria, frequency, urgency, hematuria, flank pain, catheter/procedure context, pregnancy possibility, and reduced urine output.",
      "Ask about abdominal or GI source: abdominal pain, vomiting, diarrhea, jaundice, blood in stool, poor intake, or severe localized pain.",
      "Ask about skin, wound, or line source: rash, cellulitis, abscess, ulcer, drainage, indwelling line/device, surgical site, or procedure-site tenderness.",
      "Ask about CNS danger source: severe headache, neck stiffness, photophobia, confusion, seizure, petechiae, or purpura.",
      "Ask about joint, bone, or spine source: hot swollen joint, focal bone pain, severe back pain, injection drug use, or inability to bear weight.",
      "Ask about host and exposure risks: immunosuppression, pregnancy, recent hospitalization/procedure, travel, outdoor bites, animals, food/water, sick contacts, sexual exposure, injection drug use, and new medications."
    ];
  }
  if (/cough|sputum|shortness of breath|dyspnea|pleuritic|wheeze|hypoxia|aspiration|respiratory contacts|pneumonia/.test(normalized)) {
    return [
      "Ask about new cough, sputum color/amount, dyspnea, pleuritic pain, wheeze, aspiration risk, sick respiratory contacts, and oxygen requirement.",
      "Ask whether symptoms are focal, worsening, associated with rigors, or severe enough to change chest imaging, testing, isolation, antibiotics, or disposition."
    ];
  }
  if (/immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|travel|outdoor|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication/.test(normalized)) {
    return [
      "Ask about immunosuppression, transplant/chemotherapy, high-dose steroids/biologics, asplenia, frailty, pregnancy, and recent healthcare exposure.",
      "Ask about travel, outdoor or vector exposure, animal exposure, food/water exposure, sick contacts, sexual exposure risk, injection drug use, and new medications."
    ];
  }
  if (/dysuria|urinary frequency|urinary urgency|frequency|urgency|hematuria|flank|catheter|urologic|pyelonephritis|reduced urine output/.test(normalized)) {
    return [
      "Ask about dysuria, frequency, urgency, hematuria, suprapubic pain, flank pain, catheter/procedure context, prior resistant organisms, pregnancy possibility, vomiting, and reduced urine output.",
      "Ask whether urinary/flank symptoms are paired with rigors, hypotension, confusion, obstruction concern, renal dysfunction, or inability to tolerate oral intake."
    ];
  }
  if (/rash|wound|ulcer|drainage|line|device|cellulitis|abscess|procedure site|skin infection/.test(normalized)) {
    return [
      "Ask about rash, cellulitis, abscess, ulcer, drainage, pain out of proportion, rapidly spreading redness, indwelling line/device, surgical site, and procedure-site tenderness.",
      "Ask whether skin or line findings require culture, source control, antibiotic route/breadth, or urgent escalation."
    ];
  }
  return null;
}

function historyQuestionNeedsDetailPrompts(text = "") {
  const value = String(text || "");
  const commaCount = (value.match(/,/g) || []).length;
  const orCount = (value.match(/\bor\b/gi) || []).length;
  return value.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(value.trim()) && value.length >= 105)
    || (/^Any\b/i.test(value.trim()) && commaCount >= 3);
}

export function historyQuestionDetailPrompts(text = "", explicitPrompts = []) {
  const explicit = Array.isArray(explicitPrompts)
    ? explicitPrompts.map((prompt) => String(prompt || "").trim()).filter(Boolean)
    : [];
  if (explicit.length) {
    return explicit;
  }
  const raw = String(text || "").trim();
  if (!historyQuestionNeedsDetailPrompts(raw)) {
    return [];
  }
  const withoutQuestionMark = raw.replace(/\?+\s*$/g, "");
  const normalized = normalizeEvidenceLabel(withoutQuestionMark);
  if (/^how high was the fever/.test(normalized)) {
    return [
      "Document maximum temperature and how it was measured.",
      "Clarify fever onset and trajectory.",
      "Ask what antipyretics, antibiotics, steroids, or immunosuppressants were already taken."
    ];
  }
  const infectionSourcePrompts = infectionSourceDetailPrompts(normalized);
  if (infectionSourcePrompts) {
    return uniqueHistoryDetailPrompts(infectionSourcePrompts);
  }
  if (/^how has weight changed/.test(normalized)) {
    return [
      "Clarify amount and timeline of weight change.",
      "Ask whether weight change was intentional.",
      "Ask about associated appetite, fluid-status, and systemic symptoms."
    ];
  }
  if (/^how much are you drinking and urinating/.test(normalized)) {
    return [
      "Clarify urine volume, nocturia, and urinary frequency.",
      "Ask about thirst intensity and access to water.",
      "Ask about dehydration, confusion, and inability to keep up with intake."
    ];
  }
  if (/^which medications/.test(normalized) || /\bmedications? supplements?/.test(normalized)) {
    const list = splitHistoryDetailList(
      withoutQuestionMark
        .replace(/^Which\s+/i, "")
        .replace(/\s+could\s+alter[\s\S]*$/i, "")
        .replace(/\s+affecting[\s\S]*$/i, "")
    );
    return uniqueHistoryDetailPrompts(list.map((fragment) => `Review ${medicationHistoryDetailFragment(fragment)}.`));
  }
  if (/pregnancy|fertility/.test(normalized) && /partner|planned|postpartum|treatment|imaging|safety/.test(normalized)) {
    return uniqueHistoryDetailPrompts([
      "Ask whether pregnancy is possible now.",
      "Ask about current fertility goals or pregnancy plans.",
      "Ask whether postpartum status, partner factors, imaging, or medications change safety decisions."
    ]);
  }
  const listSource = withoutQuestionMark
    .replace(/^Any\s+/i, "")
    .replace(/^What symptoms localize[^:]*:\s*/i, "")
    .replace(/\s+including\s+/i, ", ")
    .replace(/\s+suggest(?:ing|s)\s+[\s\S]*$/i, "")
    .replace(/\s+affect(?:ing|s)\s+[\s\S]*$/i, "")
    .replace(/\s+that\s+(?:change|changes|could|would)\s+[\s\S]*$/i, "");
  const list = splitHistoryDetailList(listSource);
  return uniqueHistoryDetailPrompts(list.map((fragment) => `Ask specifically about ${fragment}.`));
}

function historyQuestionDisplayLabel(text = "", tags = []) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeEvidenceLabel(raw);
  const tagText = normalizeEvidenceLabel(Array.isArray(tags) ? tags.join(" ") : String(tags || ""));
  const sourceSignalText = tagText;
  const allText = `${normalized} ${sourceSignalText}`;
  const earlyDiabetesInsipidusContext = /\b(?:diabetes_insipidus|diabetes insipidus|pituitary_gland_disorders|desmopressin)\b/.test(allText)
    && /\b(?:urine|urinating|thirst|water|sodium|desmopressin|polyuria|polydipsia|nocturia|fluid restriction|lithium)\b/.test(allText);
  if (earlyDiabetesInsipidusContext && /24-hour urine volume|urine output changed/.test(normalized)) {
    return "Ask 24-hour urine volume and baseline change";
  }
  if (earlyDiabetesInsipidusContext && /urinate overnight|nocturia|new or worsening/.test(normalized)) {
    return "Ask nocturia frequency and progression";
  }
  if (earlyDiabetesInsipidusContext && /reliable access to water|thirst[\s\S]*limiting safe hydration|mental status limiting safe hydration/.test(normalized)) {
    return "Ask water access and safe hydration";
  }
  if (earlyDiabetesInsipidusContext && /lithium|demeclocycline|amphotericin|diuretic|sglt2|glucocorticoid|desmopressin|fluid restriction|medication change/.test(normalized)) {
    return "Review DI medication and fluid-balance triggers";
  }
  if (earlyDiabetesInsipidusContext && /kidney stones|constipation|bone pain|hypercalcemia|reduced kidney function|kidney concentrating ability/.test(normalized)) {
    return "Ask hypercalcemia and renal DI mimics";
  }
  if (earlyDiabetesInsipidusContext && /how much are you drinking and urinating|fluid intake|polyuria|polydipsia|overnight urination|thirst intensity|dehydration|confusion/.test(normalized)) {
    return "Ask DI thirst, polyuria, and hydration symptoms";
  }
  const preliminaryAbdominalPainContext = /\b(?:abdominal_pain|abdominal pain|acute_abdomen|acute abdomen|abdominal_exam|abdominal exam|gi_gu_exam|gi gu exam)\b/.test(allText);
  const pediatricHemeHistoryContext = /\b(?:pediatric|paediatric|child|adolescent|teen)\b/.test(allText)
    && /\b(?:hematology|haematology|anemia|anaemia|pallor|bleeding|bruising|petechiae|purpura|thrombocytopenia|itp|hemoglobinopathy|transfusion|ferritin|hemolysis|leukemia|lymphoma)\b/.test(allText);
  if (pediatricHemeHistoryContext) {
    if (/chronic transfusion|thalassemia|sickle cell disease|congenital anemia|congenital heart disease|chemotherapy|transplant|irradiated-product|prior transfusion reaction|consent barrier/.test(normalized)) return "Ask transfusion and specialty protocol context";
    if (/for an adolescent|heavy or prolonged periods|intermenstrual bleeding|possible pregnancy|postpartum state|sexual activity|eating disorder concern|self-harm|substance use|confidential safety/.test(normalized)) return "Ask adolescent confidential bleeding and pregnancy context";
    if (/if itp is suspected|otherwise well, with no fever|abnormal film|neutropenia|major bleeding|safeguarding concern/.test(normalized)) return "Ask ITP exclusion and low-risk context";
    if (/child's age|childs age|growth trajectory|baseline energy|recent weight change|prior cbc pattern|known hemoglobinopathy|hematology follow-up/.test(normalized)) return "Ask age growth and baseline hematology context";
    if (/fatigue, pallor, dizziness|exertional dyspnea|chest pain|palpitations|poor feeding|lethargy|exercise intolerance|heart failure symptoms/.test(normalized)) return "Ask anemia symptoms and instability history";
    if (/epistaxis|gum bleeding|oral bleeding|hematemesis|melena|hematochezia|hematuria|heavy menstrual bleeding|prolonged bleeding after procedures|recurrent bleeding episodes/.test(normalized)) return "Ask bleeding source and severity history";
    if (/bruises|petechiae|purpura|non-blanching spots|rapidly spreading lesions|mucosal bleeding|inconsistent injury story|mechanical causes such as coughing or vomiting/.test(normalized)) return "Ask bruising petechiae and trauma pattern";
    if (/excess cow's milk|excess cows milk|low iron diet|vegetarian or vegan diet|poor intake|pica|prematurity|rapid growth|chronic inflammation|poor response to prior iron/.test(normalized)) return "Ask iron nutrition and blood loss risk";
    if (/jaundice|scleral icterus|dark urine|episodic pallor|gallstones|splenectomy|ethnic\/family hemoglobinopathy|hemoglobinopathy risk/.test(normalized)) return "Ask hemolysis jaundice and dark urine history";
    if (/unexplained petechiae|unexplained bruising|persistent fatigue|recurrent infections|weight loss|night sweats|pruritus|bone pain|limp|lymph node swelling|abdominal fullness|parental concern/.test(normalized)) return "Ask leukemia lymphoma and marrow red flags";
    if (/anticoagulants|antiplatelets|nsaids|steroids|chemotherapy|antiepileptics|antibiotics|herbal medicines|toxins|supplements|family history of heavy bleeding|early gallstones|consanguinity/.test(normalized)) return "Ask medication anticoagulant and family bleeding history";
  }
  const pediatricDkaHistoryContext = /\b(?:peds[_ ]dka|pediatric[_ ]dka|pediatric[_ ]dka[_ ]hhs[_ ]hyperglycemia|pediatric dka|child dka|chq[_ ]dka[_ ]hhs[_ ]child|rch[_ ]dka[_ ]child|nice[_ ]ng18[_ ]dka[_ ]child|ispad[_ ]dka[_ ]hhs)\b/.test(allText);
  if (pediatricDkaHistoryContext) {
    if (/exact age|measured or estimated weight|known diabetes type if any|usual insulin or pump regimen/.test(normalized)) return "Ask age weight and diabetes context";
    if (/polyuria|polydipsia|weight loss|fatigue|vomiting|abdominal pain|deep breathing|fruity breath/.test(normalized)) return "Ask hyperglycemia ketone and acidosis symptoms";
    if (/basal or bolus insulin doses missed|pump\/cgm failure|infusion-site problem|sick-day plan/.test(normalized)) return "Ask insulin doses pump CGM and access barriers";
    if (/how many times has the child vomited|last intake|urine output is present|worsening dehydration/.test(normalized)) return "Ask vomiting intake and dehydration trajectory";
    if (/fever, cough, work-of-breathing|urinary symptoms|line or pump-site infection|recent steroids/.test(normalized)) return "Ask source-localizing infection and precipitant symptoms";
    if (/headache, recurrent vomiting|altered or fluctuating conscious state|cranial nerve symptoms|abnormal posturing/.test(normalized)) return "Ask cerebral edema and neurologic warning symptoms";
    if (/extreme thirst|very high glucose|severe dehydration|low\/absent ketone/.test(normalized)) return "Ask HHS dehydration and osmolality features";
    if (/recurrent dka|recent admissions|insulin restriction|housing\/food insecurity/.test(normalized)) return "Ask recurrent DKA psychosocial and safety context";
    if (/pregnancy possibility|fasting|sglt2 inhibitor|near-normal glucose/.test(normalized)) return "Ask euglycemic DKA and adolescent context";
    if (/hypernatremia|hyperosmolality|anuria|potassium above normal|ecg change/.test(normalized)) return "Ask hypernatremia anuria and potassium safety context";
    if (/asked separately|body image|self-harm|school support barrier/.test(normalized)) return "Ask recurrent DKA insulin omission confidentially";
  }
  const earlyDkaContext = /\b(?:dka|hhs|hyperglycemic|ketotic|ketones?|beta hydroxybutyrate|anion gap|insulin|sglt2)\b/.test(allText)
    && !preliminaryAbdominalPainContext;
  if (earlyDkaContext && /known diabetes type|diabetes type|duration|insulin regimen|pump\/cgm|pump cgm|last insulin dose/.test(normalized)) {
    return "Ask diabetes history, insulin regimen, and last insulin dose";
  }
  if (earlyDkaContext && /polyuria|polydipsia|weight loss|dehydration|very dry mouth/.test(normalized)) {
    return "Ask hyperglycemia dehydration symptoms";
  }
  if (earlyDkaContext && /vomiting|abdominal pain|poor oral intake|inability to keep fluids/.test(normalized)) {
    return "Ask DKA/HHS GI symptoms and oral intake";
  }
  if (earlyDkaContext && /fever|dysuria|cough|wound|line infection|dental\/skin infection|dental skin infection|chest pain|stroke symptoms|pancreatitis symptoms|other trigger/.test(normalized)) {
    return "Ask DKA/HHS infectious, ischemic, and medication triggers";
  }
  if (earlyDkaContext && /what has already been given|fluids|insulin route|current monitoring level|potassium\/phosphate|dextrose|antibiotics/.test(normalized)) {
    return "Review hyperglycemic-crisis treatments already started";
  }
  if (earlyDkaContext && /sglt2|fasting|low carb|alcohol|toxin/.test(normalized)) {
    return "Ask euglycemic DKA and special-population risks";
  }
  if (earlyDkaContext && /heart failure|ckd|eskd|frailty|cirrhosis|smaller fluid boluses|electrolyte monitoring/.test(normalized)) {
    return "Ask fluid-resuscitation and electrolyte-safety modifiers";
  }
  const pediatricNeuroHistoryContext = /\b(?:peds[_ ]neuro|pediatric[_ ]neuro|pediatric_neuro_headache_seizure_ams|pediatric headache|child headache|pediatric seizure|child seizure|altered conscious|altered mental|status epilepticus|raised[_ ]icp|papilledema)\b/.test(allText);
  if (pediatricNeuroHistoryContext) {
    if (/exact age|neurodevelopmental baseline|communication baseline|usual mobility|usual behavior|baseline_neuro/.test(allText)) return "Ask pediatric neuro age and baseline";
    if (/under-4 head size|head circumference|fontanelle|sunsetting|raised-icp context/.test(allText)) return "Ask under-4 head size and raised-ICP context";
    if (/known epilepsy|seizure management plan|rescue plan|missed antiseizure|more frequent or uncontrolled/.test(allText)) return "Ask known epilepsy and rescue plan";
    if (/vp shunt|neurosurgery|bleeding disorder|prothrombotic|sickle cell|immune-risk/.test(allText)) return "Ask shunt bleeding and immune-risk context";
    if (/when did it start|where is it located|how severe|acute recurrent|chronic\/progressive|triggers or relieves|headache pattern/.test(allText)) return "Ask headache pattern and triggers";
    if (/vomiting without another clear cause|papilledema|upward-gaze|visual change|shunt|malignancy|immunosuppression|bleeding tendency|anticoagulant|headache-associated danger/.test(allText)) return "Ask headache-associated danger features";
    if (/how did it start|how long did it last|full recovery between events|rescue medicines|still seizing|seizure event/.test(allText)) return "Ask seizure or blackout event details";
    if (/after the event|returned to their usual baseline|persistent weakness|facial droop|aphasia|diplopia|behavior change|recovery and focal deficit/.test(allText)) return "Ask recovery and focal deficit status";
    if (/neck stiffness|photophobia|petechiae|severe irritability|immunization gap|sick contacts|meningitis|encephalitis|fever_meningitis/.test(allText)) return "Ask fever and CNS infection features";
    if (/head injury|possible non-accidental injury|poisoning|drug exposure|diabetes|poor intake|dehydration|renal\/hepatic|metabolic condition|trauma_toxin/.test(allText)) return "Ask trauma toxin and metabolic context";
    if (/adolescent confidential|pregnancy possible|postpartum|estrogen therapy|substance use|medication overuse|self-harm/.test(allText)) return "Ask adolescent confidential neuro context";
  }
  if (/how high was the fever|how was it measured|when did it start|maximum temperature|document maximum temperature|antipyretics/.test(normalized)) {
    return "Ask fever timeline, measurement, and medication exposure";
  }
  if (/\bpeds rash\b|pediatric rash|pediatric_rash_skin|pediatric rash, urticaria|rash morphology and progression|kawasaki fever and feature/i.test(allText)) {
    if (/peds rash age context|exact age band|immunization status|under 6 months|infant under 12 months/.test(allText)) {
      return "Ask pediatric rash age and vulnerability";
    }
    if (/peds rash fever systemic danger|rigors|poor feeding|neck stiffness|bulging fontanelle|non-weight bearing/.test(allText)) {
      return "Ask fever and systemic danger symptoms";
    }
    if (/peds rash anaphylaxis context|tongue or lip swelling|voice change|wheeze|stridor|epinephrine already given/.test(allText)) {
      return "Ask hives and anaphylaxis symptoms";
    }
    if (/peds rash kawasaki features|fever lasted 4 to 5 days|bilateral non-exudative conjunctivitis|strawberry tongue|swollen red hands/.test(allText)) {
      return "Ask Kawasaki fever and feature history";
    }
    if (/peds rash ssti source history|skin infection and source-control history|painful red warm area|rapidly spreading border|prior mrsa|failed oral treatment|periorbital location/.test(allText)) {
      return "Ask skin infection and source-control history";
    }
    if (/peds rash morphology onset|petechial|purpuric|non-blanching|urticarial wheals|lesion type|rash morphology/.test(allText)) {
      return "Ask rash morphology and progression";
    }
    if (/peds rash bleeding trauma vasculitis|mucosal bleeding|gum bleeding|difficulty mobilizing|safeguarding concern/.test(allText)) {
      return "Ask bleeding trauma and vasculitis clues";
    }
    if (/peds rash chronic urticaria|persisted or recurred for more than 6 weeks|urticarial vasculitis/.test(allText)) {
      return "Ask chronic urticaria duration and systemic features";
    }
    if (/peds rash adolescent pregnancy|new medicines|anticonvulsants|isotretinoin|genital lesions/.test(allText)) {
      return "Ask adolescent pregnancy and medication context";
    }
    if (/peds rash imported infection exposure|measles|varicella|daycare|school outbreak|tick or animal/.test(allText)) {
      return "Ask travel outbreak and contact exposure";
    }
  }
  const sourceSpecificInfectionContext = /\b(?:source[_ ]localizing[_ ]history|respiratory[_ ]source|heent[_ ]source|dental[_ ]source|oral[_ ]source|urinary[_ ]source|abdominal[_ ]source|gi[_ ]source|biliary[_ ]source|skin[_ ]source|wound[_ ]source|line[_ ]source|cns[_ ]infection|joint[_ ]source|spine[_ ]infection|host[_ ]risk|exposure[_ ]history|severity[_ ]history)\b/.test(sourceSignalText);
  if (sourceSpecificInfectionContext && /what symptoms localize|localize the fever source|localizing symptoms|most likely[^.?!]*source|what source|which source/.test(normalized)) {
    return "Ask source-localizing infection symptoms";
  }
  if (sourceSpecificInfectionContext && (/respiratory[_ ]source/.test(sourceSignalText) || /cough|sputum|shortness of breath|dyspnea|pleuritic|wheeze|hypoxia|hypoxemia|aspiration|respiratory contacts|pneumonia/.test(normalized))) {
    return "Ask respiratory infection-source symptoms";
  }
  if (sourceSpecificInfectionContext && (/urinary[_ ]source/.test(sourceSignalText) || /dysuria|urinary frequency|urinary urgency|frequency|urgency|hematuria|flank|catheter|urologic|pyelonephritis|reduced urine output/.test(normalized))) {
    return "Ask urinary and flank infection-source symptoms";
  }
  if (sourceSpecificInfectionContext && (/heent[_ ]source|dental[_ ]source|oral[_ ]source/.test(sourceSignalText) || /sore throat|ear pain|sinus pain|dental|oral pain|neck swelling|hoarseness|trouble swallowing|drooling/.test(normalized))) {
    return "Ask HEENT/oral source symptoms";
  }
  if (sourceSpecificInfectionContext && (/abdominal[_ ]source|gi[_ ]source|biliary[_ ]source/.test(sourceSignalText) || /abdominal pain|vomiting|diarrhea|jaundice|focal tenderness|intra-abdominal|abdominal infection/.test(normalized))) {
    return "Ask abdominal and GI infection-source symptoms";
  }
  if (sourceSpecificInfectionContext && (/host[_ ]risk|exposure[_ ]history/.test(sourceSignalText) || /immunosuppression|immunocompromised|pregnancy|hospitalization|travel|outdoor|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication|chemotherapy|transplant|asplenia|frailty/.test(normalized))) {
    return "Ask host-risk and exposure history";
  }
  if (sourceSpecificInfectionContext && (/skin[_ ]source|wound[_ ]source|line[_ ]source/.test(sourceSignalText) || /rash|wound|ulcer|drainage|line pain|line redness|line concern|line site|cellulitis|abscess|procedure-site|procedure site|skin infection|soft-tissue|soft tissue/.test(normalized))) {
    return "Ask skin/line infection-source symptoms";
  }
  if (sourceSpecificInfectionContext && (/cns[_ ]infection|joint[_ ]source|spine[_ ]infection/.test(sourceSignalText) || /severe headache|neck stiffness|photophobia|seizure|petechiae|purpura|hot swollen joint|bone or back pain|focal bone|new weakness|bowel or bladder|meningitis|spine infection/.test(normalized))) {
    return "Ask CNS/joint/spine danger symptoms";
  }
  if (sourceSpecificInfectionContext && (/severity[_ ]history/.test(sourceSignalText) || /poor intake|inability to keep fluids|dehydration|dizziness|fainting|confusion|sleepiness|low urine|severe weakness|rapid worsening|hypotension|shock|perfusion|mottled|oxygen/.test(normalized))) {
    return "Ask sepsis severity, hydration, and perfusion symptoms";
  }
  if (!/\b(?:peds[_ ]rash|pediatric[_ ]rash|pediatric_rash_skin|rash|kawasaki|urticaria|hives|anaphylaxis|petechiae|purpura|ssti|skin[_ ]infection)\b/.test(allText)
    && /\b(?:pediatric|paediatric|child|adolescent|teen|limp|non[-_ ]?weight[-_ ]?bearing|hot[_ ]joint|septic[_ ]arthritis|osteomyelitis|bone[_ ]infection|toddler[_ ]fracture|baseline[_ ]mobility|safeguarding)\b/.test(allText)
    && /\b(?:limp|walk|walking|weight[-_ ]?bearing|joint|limb|bone|hip|knee|ankle|fracture|trauma|safeguarding|osteomyelitis|septic|back|neck|bladder|weakness|numbness|saddle)\b/.test(allText)) {
    if (/septic hip predictor|elevated inflammatory markers|severe passive-motion|severe passive motion|transient synovitis/.test(allText)) return "Ask septic hip predictor context";
    if (/for an adolescent|adolescent hip slip|slipped upper femoral epiphysis|scfe|sufe/.test(allText)) return "Ask adolescent hip slip symptoms";
    if (/developmental ability|caregiver explanations|injury consistency|delayed presentation|inconsistent history/.test(allText)) return "Ask safeguarding and injury consistency";
    if (/urinary retention|saddle sensory|bowel dysfunction|back neurologic|bladder symptoms/.test(allText)) return "Ask back neurologic and bladder symptoms";
    if (/exact age|usual walking|mobility baseline|baseline[_ ]mobility|age[_ ]band/.test(allText)) return "Ask pediatric MSK age and walking baseline";
    if (/walk or bear weight now|unable to bear weight|can the child walk|weight[-_ ]bearing ability|non[-_ ]?weight[-_ ]?bearing/.test(allText)) return "Ask current weight-bearing ability";
    if (!/recent bacterial infection|fever and infection|infection-source|source-localizing|reduced limb use without clear trauma/.test(allText)
      && /witnessed fall|twist|direct blow|puncture|other injury|injury mechanism|mechanism localize/.test(allText)) return "Ask onset and injury mechanism";
    if (/best localized|pain location|hip, groin, thigh|hip groin thigh|referred pain|child cannot localize/.test(allText)) return "Ask pain location and referred pain";
    if (/recent bacterial infection|skin wound|puncture injury|reduced limb use without clear trauma|fever and infection|source-localizing/.test(allText)) return "Ask fever and infection symptoms";
    if (/visible swelling|redness, warmth|severe pain with movement|reduced active use|swelling and motion/.test(allText)) return "Ask swelling and motion limitation";
    if (/night pain|weight loss|pallor|bruising|morning stiffness|recurrent fevers|systemic and malignancy/.test(allText)) return "Ask systemic and malignancy clues";
  }
  const dkaContext = /\b(?:dka|hhs|hyperglycemic|ketotic|ketones?|beta hydroxybutyrate|anion gap|insulin|sglt2)\b/.test(allText);
  const thyroidContext = /\b(?:thyroid|graves|hashimoto|thyrotoxicosis|hyperthyroid|hypothyroid|goiter|nodule|tsh|antithyroid|amiodarone|lithium|biotin)\b/.test(allText);
  const infectionContext = /\b(?:fever|infection|sepsis|pneumonia|source-localizing|source localizing|source control|cellulitis|abscess|line infection)\b/.test(allText);
  const feverSourceWorkupContext = /\b(?:fever|sepsis|pneumonia|source-localizing|source localizing|source control|respiratory source|urinary source|skin source|host risk|exposure history)\b/.test(allText);
  const eyeVisionContext = /\b(?:eye_vision|eye vision|red_eye|red eye|vision_change|vision change|ocular|ophthalm|photophobia|contact lens|diplopia)\b/.test(allText);
  const guStiContext = /\b(?:\bsti\b|sexually transmitted|urethritis|genital discharge|penile discharge|vaginal discharge|new partners|syphilis|hiv|gonorrhea|chlamydia|testicular pain|scrotal pain)\b/.test(allText);
  const guRenalContext = /\b(?:dysuria|urinary|uti|pyelonephritis|renal_colic|renal colic|flank|hematuria|catheter|urologic|oliguria|low urine|aki|obstruction|stone)\b/.test(allText);
  const dermRashContext = /\b(?:dermatology|rash|skin_ulcer|skin ulcer|wound|mucosal|drug_eruption|drug eruption|severe_rash|severe rash|diabetes_foot|diabetes foot|foot ulcer|skin_inspection|skin inspection|cellulitis|abscess)\b/.test(allText);
  const boneMineralContext = /\b(?:bone_and_parathyroid|bone and parathyroid|vitamin_d|vitamin d|osteomalacia|osteoporosis|osteopenia|hypoparathyroidism|hyperparathyroidism|parathyroid|calcium|pth|phosphorus|bone density|fragility fracture|kidney stones|nephrocalcinosis)\b/.test(allText);
  const pelvicPregnancyContext = /\b(?:pelvic_pain|pelvic pain|menstrual|period|missed period|ectopic|pid|gynecology|dyspareunia|purulent discharge|heavy bleeding|shoulder pain)\b/.test(allText);
  const abdominalPainContext = /\b(?:abdominal_pain|abdominal pain|acute_abdomen|acute abdomen|peritonitis|biliary_disease|biliary disease|appendicitis|abdominal_exam|abdominal exam)\b/.test(allText);
  const mskContext = /\b(?:focused_msk|focused msk|msk_exam|msk exam|musculoskeletal|joint_pain|joint pain|back_pain|back pain|septic_arthritis|septic arthritis|fracture|cord_compression|cord compression|site_specific|site specific)\b/.test(allText);
  const strokeContext = /\b(?:focal_neurologic_deficit|focal neurologic deficit|neuro_red_flags|neuro red flags|last-known-well|last known well|wake-up stroke|thrombectomy|aphasia|face droop|facial droop|diplopia|ataxia)\b/.test(allText);
  const diabetesContext = /\b(?:diabetes_and_blood_sugar|diabetes and blood sugar|type_1_diabetes|type_2_diabetes|gestational_diabetes|prediabetes|metabolic_syndrome|diabetes mellitus|blood sugar|glycemic|glucose|a1c|retinopathy|neuropathy)\b/.test(allText);
  const pituitaryAdrenalContext = /\b(?:pituitary_gland|pituitary gland|adrenal_gland|adrenal gland|cushing|cortisol|addison|adrenal_insufficiency|pheochromocytoma|hyperaldosteronism|hypopituitarism|prolactinoma|acromegaly|gigantism)\b/.test(allText);
  const reproductiveContext = /\b(?:reproductive_and_gonadal|reproductive and gonadal|amenorrhea|hypogonadism|menopause|premature ovarian insufficiency|infertility|gynecomastia|hirsutism|erectile dysfunction|libido|puberty|fertility|galactorrhea|vasomotor|genitourinary)\b/.test(allText);
  if (strokeContext && /anticoagulant use|recent surgery|prior intracranial hemorrhage|seizure at onset|hypoglycemia symptoms|migraine pattern|rapidly resolving/.test(allText)) {
    return "Ask stroke mimics, anticoagulants, and reperfusion timing";
  }
  if (strokeContext && /last[- ]known[- ]well|face droop|speech trouble|arm\/leg weakness|vision loss|diplopia|ataxia|severe headache/.test(allText)) {
    return "Ask focal neurologic symptom timeline and localization";
  }
  if (abdominalPainContext && /what changed over time|severe\/worsening focal pain|blood or black stool|jaundice|pregnancy possibility|inability to pass stool\/gas|obstipation/.test(allText)) {
    return "Ask abdominal pain location, trajectory, and red flags";
  }
  if (abdominalPainContext && /where is the pain worst[\s\S]*associated with vomiting|associated with vomiting|diarrhea|constipation|urinary symptoms|fever|bleeding/.test(allText)) {
    return "Ask abdominal associated GI/GU symptoms and bleeding";
  }
  if (mskContext && /exact joint|body area|which exact joint/.test(allText)) {
    return "Ask pain location, trauma, and inflammatory red flags";
  }
  if (mskContext && /inability to bear weight|hot swollen joint|injection drug use|cancer history|neurologic deficit|bowel or bladder|anticoagulant/.test(allText)) {
    return "Ask MSK red flags and trauma history";
  }
  if (dermRashContext && /new medicine|rapid spread|wound drainage|travel\/bite exposure/.test(allText)) {
    return "Ask rash danger features and exposure history";
  }
  if (dermRashContext && /mouth sores eye pain|genital sores blistering|mucosal sores/.test(allText)) {
    return "Ask mucosal, ocular, and severe-rash warning features";
  }
  if (dermRashContext && /mucosal lesions|facial or tongue swelling|trouble breathing|blistering|purpura|rapidly spreading redness|tick or travel exposure/.test(allText)) {
    return "Ask severe rash and systemic warnings";
  }
  const endocrineWeightSystemicQuestion = /^how has weight changed|weight changed from baseline|intentional weight|appetite|fluid status|systemic symptoms/.test(allText);
  if (!infectionContext && (diabetesContext || pituitaryAdrenalContext || boneMineralContext) && endocrineWeightSystemicQuestion) {
    return "Ask weight trajectory and systemic symptoms";
  }
  if (diabetesContext && /how have weight[\s\S]*waist circumference[\s\S]*(?:intentional|over time)/.test(allText)) {
    return "Ask weight, waist, and intentional change";
  }
  if (diabetesContext && /pre-pregnancy diabetes|prior a1c|prior glucose abnormality|pcos|obesity|steroid exposure|strong family history/.test(allText)) {
    return "Ask pre-pregnancy diabetes and GDM risk factors";
  }
  if (diabetesContext && /have fetal growth|estimated fetal weight|amniotic fluid|obstetric ultrasound|polyhydramnios/.test(normalized)) {
    return "Ask fetal-growth and obstetric ultrasound concerns";
  }
  if (diabetesContext && /how many weeks pregnant|pregnancy dating|obstetric context[\s\S]*diabetes screening|obstetric context[\s\S]*treatment safety/.test(normalized)) {
    return "Ask gestational age, dating, and obstetric context";
  }
  if (eyeVisionContext && /jaw claudication|scalp tenderness|halos|chemical exposure|shingles|inability to keep the eye open/.test(allText)) {
    return "Ask ocular emergency and systemic red flags";
  }
  if (eyeVisionContext && /vision loss|eye pain|photophobia|trauma|contact lens|discharge|severe headache|diplopia|neurologic|immunocompromise/.test(allText)) {
    return "Ask vision-threatening red-eye symptoms";
  }
  if (reproductiveContext && /height|growth velocity|family height|puberty timing/.test(allText)) {
    return "Ask growth velocity and puberty timing";
  }
  if (reproductiveContext && /breast tenderness|discrete mass|nipple discharge|testicular pain|testicular mass|liver\/kidney disease|alcohol|cannabis|gynecomastia/.test(allText)) {
    return "Ask breast/testicular symptoms and exposure risks";
  }
  if (pelvicPregnancyContext && /ectopic|\bpid\b|pelvic inflammatory|purulent discharge|dyspareunia|heavy bleeding|severe unilateral|missed period|positive pregnancy|shoulder pain/.test(allText)) {
    return "Ask ectopic/PID danger and bleeding features";
  }
  if (dermRashContext && /^(?:any )?(?:mouth sores|eye pain|eye redness|genital sores|skin pain|blisters|blistering|purpura)\b|high-risk medication/.test(normalized)) {
    return "Ask mucosal, ocular, and severe-rash warning features";
  }
  const acuteScrotalSourceText = `${normalized} ${tagText}`;
  if (/\b(?:acute_scrotum|scrotal pain|scrotal_pain|testicular torsion|testicular_torsion|torsion|high-riding|cremasteric|solitary testis|urgent urology|urology care)\b/.test(acuteScrotalSourceText)
    && !/\b(?:genital_discharge|genital discharge|penile discharge|vaginal discharge)\b/.test(acuteScrotalSourceText)) {
    if (/^was onset sudden|was onset sudden|urinary symptoms fever trauma or sti exposure/.test(normalized)) {
      return "Ask torsion nausea/swelling, urinary, and trauma features";
    }
    if (/when exactly|sudden|severe|high-riding|high riding|nausea|vomiting|swelling/.test(allText)) {
      return "Ask scrotal pain onset and torsion features";
    }
    return "Ask epididymitis/STI and urology-risk features";
  }
  if (guStiContext && /groin lumps|groin swelling|inguinal|genital ulcers|painful lesions|lower limb skin infection|skin infection/.test(allText)) {
    return "Ask groin nodes, genital lesions, and skin infection features";
  }
  if (guStiContext && /\b(?:dysuria|urethral|vaginal|genital|\bsti\b|new partners|syphilis|hiv|pelvic pain|testicular pain|discharge|ulcer|lesion)\b/.test(allText)) {
    return "Ask GU/STI discharge/dysuria, lesions, and exposure";
  }
  if (guRenalContext
    && !boneMineralContext
    && !/what symptoms localize|localize the fever source|source:/.test(normalized)
    && /are symptoms limited to dysuria|dysuria\/frequency\/urgency|dysuria|urinary frequency|urinary urgency|hematuria|flank pain|catheter\/procedure|urologic|pyelonephritis|stone history|obstruction|resistant urine culture|pregnancy possibility/.test(normalized)) {
    return "Ask UTI symptoms and complicated-infection risk";
  }
  const sourceLocalizingPrompt = /what symptoms localize|localize the fever source|source:/.test(normalized);
  if (dermRashContext && !sourceLocalizingPrompt && /^(?:is there )?(?:drainage|spreading redness|odor|worsening pain)|black tissue|exposed bone|exposed tendon|reduced pulses|foot ulcer/.test(normalized)) {
    return "Ask wound infection and limb-threat features";
  }
  if (dermRashContext && !sourceLocalizingPrompt && /^(?:any )?(?:mouth sores|eye pain|eye redness|genital sores|skin pain|blisters|purpura)|high-risk medication/.test(normalized)) {
    return "Ask mucosal, ocular, and severe-rash warning features";
  }
  if (dermRashContext && !sourceLocalizingPrompt && /new medicine|fever|rapid spread|facial|lip|tongue swelling|wheeze|travel|bite|immunosuppression|rash/.test(normalized)) {
    return "Ask rash danger features and exposure history";
  }
  const explicitFeverWorkupContext = /\b(?:fever sepsis|fever infection|infection sepsis|source localizing history|respiratory source|urinary source|skin source|host risk|exposure history|sepsis)\b/.test(allText)
    && !diabetesContext
    && !boneMineralContext
    && !pituitaryAdrenalContext
    && !thyroidContext;
  const feverWorkupContext = feverSourceWorkupContext
    && (explicitFeverWorkupContext || (!pelvicPregnancyContext && !diabetesContext && !boneMineralContext && !pituitaryAdrenalContext && !thyroidContext));
  if (feverWorkupContext && /how high was the fever|how was it measured|when did it start|maximum temperature|document maximum temperature|antipyretics/.test(normalized)) {
    return "Ask fever timeline, measurement, and medication exposure";
  }
  if (feverWorkupContext && /what symptoms localize|localize the fever source|localizing symptoms|most likely[^.?!]*source|what source|which source/.test(allText)) {
    return "Ask source-localizing infection symptoms";
  }
  if (feverWorkupContext && /cough|sputum|shortness of breath|dyspnea|pleuritic|wheeze|hypoxia|aspiration|respiratory contacts|pneumonia/.test(allText)) {
    return "Ask respiratory infection-source symptoms";
  }
  if (feverWorkupContext && /dysuria|urinary frequency|urinary urgency|frequency|urgency|hematuria|flank|catheter|urologic|pyelonephritis|reduced urine output/.test(allText)) {
    return "Ask urinary and flank infection-source symptoms";
  }
  if (feverWorkupContext && /immunosuppression|immunocompromised|pregnancy|hospitalization|travel|outdoor|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication|chemotherapy|transplant|asplenia/.test(normalized)) {
    return "Ask host-risk and exposure history";
  }
  if (feverWorkupContext && /rash|wound|ulcer|drainage|line|device|cellulitis|abscess|procedure-site|skin infection/.test(allText)) {
    return "Ask skin/line infection-source symptoms";
  }
  if (feverWorkupContext && /poor intake|inability to keep fluids|dehydration|dizziness|fainting|confusion|sleepiness|low urine|severe weakness|rapid worsening|hypotension|shock|perfusion/.test(allText)) {
    return "Ask sepsis severity, hydration, and perfusion symptoms";
  }
  if (thyroidContext && /^how has weight changed|weight changed from baseline|appetite|fluid status|systemic symptoms/.test(normalized)) {
    return "Ask thyroid-related weight and systemic symptoms";
  }
  if (thyroidContext && /thyroid hormone|antithyroid drug|amiodarone|lithium|iodine\/contrast|iodine|contrast exposure|biotin|thyroid supplement|missed dose|recent dose change/.test(allText)) {
    return "Review thyroid medications, iodine/biotin exposure, and assay interference";
  }
  if (thyroidContext && /has the thyroid nodule|neck mass grown rapidly|become painful|fixed|associated with hoarseness|suspicious nodes/.test(normalized)) {
    return "Ask thyroid nodule growth and invasion symptoms";
  }
  if (thyroidContext && /neck swelling[\s\S]*rapid growth[\s\S]*radiation exposure[\s\S]*family thyroid cancer/.test(normalized)) {
    return "Ask thyroid structural symptoms and cancer-risk history";
  }
  if (thyroidContext && /childhood head\/neck radiation|childhood head or neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer risk factor/.test(normalized)) {
    return "Ask thyroid radiation and family-risk history";
  }
  if (thyroidContext && /personal or family history of men|vhl|nf1|sdhx|medullary thyroid cancer|pheochromocytoma|paraganglioma/.test(normalized)) {
    return "Ask hereditary endocrine tumor history";
  }
  if (thyroidContext && /neck swelling[\s\S]*thyroid pain|thyroid pain or tenderness|pressure[\s\S]*hoarseness[\s\S]*trouble swallowing|rapidly enlarging neck mass/.test(normalized)) {
    return "Ask thyroid pain, pressure, and airway symptoms";
  }
  if (thyroidContext && /childhood head\/neck radiation|childhood head or neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer|medullary thyroid|men2|suspicious thyroid biopsy/.test(normalized)) {
    return "Ask thyroid cancer radiation, biopsy, and MEN2 risk";
  }
  if (thyroidContext && /thyroid nodule|neck mass|neck swelling|grown rapidly|rapid growth|thyroid pain|thyroid tenderness|hoarseness|dysphagia|trouble swallowing|dyspnea|positional shortness|suspicious nodes/.test(normalized)) {
    return "Ask thyroid nodule, pain, and compressive symptoms";
  }
  if (thyroidContext && /current pregnancy|pregnancy plans|pregnant|recent postpartum|postpartum|breastfeeding|infertility treatment|fertility goal/.test(normalized)) {
    return "Ask pregnancy, postpartum, and fertility-related thyroid safety";
  }
  if (thyroidContext && /heat intolerance|palpitations|tremor|anxiety|insomnia|unintentional weight loss|weight loss|diarrhea|increased sweating|sweating|thyrotoxicosis|adrenergic/.test(normalized)) {
    return "Ask hyperthyroid adrenergic, weight, and GI symptoms";
  }
  if (thyroidContext && /cold intolerance|fatigue|constipation|dry(?: or coarse)? skin|coarse skin|hoarse voice|slowed thinking|weight gain|heavy menses|hypothyroid|hypothyroidism/.test(normalized)) {
    return "Ask hypothyroid symptoms and menstrual pattern";
  }
  if (thyroidContext && /eye pain|redness|gritty|light sensitivity|bulging eyes|double vision|reduced vision|closing the eyelids|orbitopathy/.test(normalized)) {
    return "Ask Graves orbitopathy eye symptoms";
  }
  if (boneMineralContext && /height loss|new back pain|kyphosis|low-trauma fracture|low trauma fracture|fall|vertebral/.test(allText)) {
    return "Ask fracture, fall, and vertebral-compression symptoms";
  }
  if (boneMineralContext && /head\/neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer/.test(normalized)) {
    return "Ask neck radiation and parathyroid-risk history";
  }
  if (boneMineralContext && /prior neck|thyroid surgery|parathyroid surgery|postoperative calcium|post neck surgery|neck surgery/.test(normalized)) {
    return "Ask neck surgery and postoperative calcium history";
  }
  if (boneMineralContext && /muscle cramps|perioral numbness|tingling|cramps|tetany|carpopedal|paresthesias|paralysis|seizure|laryngospasm|arrhythmia/.test(normalized)) {
    return "Ask hypocalcemia neuromuscular symptoms";
  }
  if (boneMineralContext && /usual calcium|vitamin d intake|supplement use|diet pattern|sun exposure/.test(allText)) {
    return "Ask calcium/vitamin D intake and sun exposure";
  }
  if (boneMineralContext && /family history of men|familial hypocalciuric|parathyroid disease|pituitary tumors|pancreatic neuroendocrine|jaw tumors/.test(allText)) {
    return "Ask hereditary hyperparathyroidism/FHH and MEN history";
  }
  if (boneMineralContext && /nephrocalcinosis|hematuria|flank|recurrent utis|renal-function changes affecting calcium|affecting calcium\/pth interpretation/.test(allText)) {
    return "Ask kidney-stone and renal calcium/PTH complications";
  }
  if (boneMineralContext && /kidney stones|constipation|polyuria|polydipsia|bone pain|confusion|dehydration|reduced kidney function/.test(allText)) {
    return "Ask hypercalcemia symptom pattern and renal impact";
  }
  if (boneMineralContext && /chronic kidney disease|liver disease|calcium|phosphorus|pth|vitamin d interpretation|mineral/.test(allText)) {
    return "Ask renal, liver, and mineral-metabolism modifiers";
  }
  if (boneMineralContext && /malabsorption|bariatric|celiac|inflammatory bowel|pancreatic|chronic diarrhea|nutrient|absorption/.test(allText)) {
    return "Ask malabsorption and nutrient-absorption risks";
  }
  if (boneMineralContext && /antiseizure|enzyme-inducing|anticonvulsant/.test(allText)) {
    return "Review antiseizure and vitamin D metabolism medications";
  }
  if (boneMineralContext && /aromatase inhibitor|androgen-deprivation|glucocorticoid|antiseizure medication|ppi|transplant medication|bone-active medication/.test(allText)) {
    return "Review bone-active medication exposure";
  }
  if (boneMineralContext && /menopause|ovarian-insufficiency|ovarian insufficiency|fragility fracture|hormone-therapy|hormone therapy/.test(allText)) {
    return "Ask menopause timing and fracture-risk modifiers";
  }
  if (pelvicPregnancyContext && /could pregnancy be possible|could you be pregnant|missed period|positive pregnancy|ectopic|severe unilateral|one-sided pain|shoulder pain|syncope|heavy bleeding/.test(normalized)) {
    return "Ask pregnancy and ectopic danger features";
  }
  if (pelvicPregnancyContext && /where is the pain|typical for your period|urinary|gi|bleeding|discharge|cycle/.test(allText)) {
    return "Ask pelvic pain location, cycle timing, and GU/GI symptoms";
  }
  if (pelvicPregnancyContext && /pregnan|ectopic|missed period|positive pregnancy|severe unilateral|one-sided pain|shoulder pain|syncope|heavy bleeding/.test(allText)) {
    return "Ask pregnancy and ectopic danger features";
  }
  if (pelvicPregnancyContext && /pid|purulent discharge|dyspareunia|fever|pelvic infection/.test(allText)) {
    return "Ask PID and pelvic infection features";
  }
  if (diabetesContext && /weight changed|weight loss|weight gain|appetite|fluid status|systemic symptoms/.test(allText)) {
    return "Ask weight trajectory and systemic symptoms";
  }
  if (diabetesContext && /prior gestational diabetes|history of prior gestational diabetes|macrosomia/.test(allText)) {
    return "Ask prior gestational diabetes and macrosomia history";
  }
  if (diabetesContext && /current obstetric plan|gestational age|fetal surveillance|delivery timing|maternal-fetal medicine/.test(allText)) {
    return "Ask obstetric plan and fetal surveillance";
  }
  if (diabetesContext && /vomiting|abdominal pain|labored breathing|missed insulin|pump failure|very high glucose|ketones|hyperglycemic crisis/.test(allText)) {
    return "Ask hyperglycemic-crisis warning symptoms";
  }
  if (diabetesContext && /drinking and urinating|polyuria|polydipsia|overnight urination|thirst intensity|dehydration|confusion/.test(allText)) {
    return "Ask hyperglycemia thirst, polyuria, and dehydration symptoms";
  }
  if (diabetesContext && /autoimmune disease|thyroid cancer\/men2|adrenal disease|inherited condition|family autoimmune/.test(allText)) {
    return "Ask autoimmune and inherited endocrine history";
  }
  if (diabetesContext && /foot ulcer|foot wound|\bwounds?\b(?!-care)|skin redness|drainage|tenderness|indwelling line|procedure-site|skin infection|soft[- ]tissue infection|cellulitis|abscess/.test(allText)) {
    return "Ask foot/wound infection symptoms";
  }
  if (diabetesContext && /foot ulcer|foot wound|protective sensation|prior amputation|offload|footwear|wound-care supplies|inability to inspect feet/.test(allText)) {
    return "Ask diabetic foot wound, neuropathy, and self-care risk";
  }
  if (diabetesContext && /measured fever|rigors|hypothermia|toxic appearance|infection as a precipitant|infection as a mimic/.test(allText)) {
    return "Ask infection precipitant or mimic symptoms";
  }
  if (diabetesContext && /cough|sputum|pleuritic pain|dyspnea|hypoxemia|respiratory infection|pneumonia/.test(allText)) {
    return "Ask respiratory infection symptoms";
  }
  if (diabetesContext && /dysuria|urinary frequency|urinary urgency|suprapubic|hematuria|flank pain|uti|pyelonephritis/.test(allText)) {
    return "Ask urinary infection symptoms";
  }
  if (diabetesContext && /foot ulcer|wound|skin redness|drainage|indwelling line|procedure-site|skin infection/.test(allText)) {
    return "Ask foot/wound infection symptoms";
  }
  if (diabetesContext && /ascvd|heart failure|stroke\/tia|peripheral arterial|claudication|vascular procedures/.test(allText)) {
    return "Ask ASCVD, heart failure, and vascular disease history";
  }
  if (diabetesContext && /retinopathy|vision changes|eye injections|laser|dilated eye|eye examination|blurred vision/.test(allText)) {
    return "Ask retinopathy and dilated-eye exam status";
  }
  if (pituitaryAdrenalContext && /easy bruising|wide purple stretch marks|facial rounding|new hypertension|new diabetes|recurrent infections|proximal muscle weakness/.test(allText)) {
    return "Ask Cushing phenotype, metabolic complications, and infection risk";
  }
  if (pituitaryAdrenalContext && /episodes|cycles|symptom-free intervals|cyclic hormone excess|repeated abnormal labs/.test(allText)) {
    return "Ask cyclic cortisol-excess pattern";
  }
  if (pituitaryAdrenalContext && /oral, injected, inhaled|topical|eye-drop|joint-injection|supplement steroid|steroid exposure|exogenous steroid/.test(allText)) {
    return "Review exogenous steroid exposure";
  }
  if (pituitaryAdrenalContext && /new headache|peripheral vision loss|double vision|eye movement pain|sudden severe headache|pituitary surgery|pituitary radiation/.test(allText)) {
    return "Ask pituitary mass-effect and treatment history";
  }
  if (pituitaryAdrenalContext && /nipple discharge|breast tenderness|prolactin/.test(allText)) {
    return "Ask prolactin symptoms and medication causes";
  }
  if (/spontaneous or expressible nipple discharge|galactorrhea|nipple discharge|breast tenderness|medications that raise prolactin|raise prolactin|hyperprolactin|prolactin/.test(allText)
    && /headaches|visual symptoms|visual field|pituitary|amenorrhea|infertility|erectile dysfunction|polycystic|reproductive|gonadal|cycle/.test(allText)) {
    return "Ask prolactin symptoms, medication causes, and mass-effect symptoms";
  }
  if (pituitaryAdrenalContext && /24-hour urine volume|urine output changed|urinate overnight|nocturia|polyuria|polydipsia|overnight urination|thirst intensity|access to water|desmopressin/.test(allText)) {
    return "Ask diabetes-insipidus thirst, nocturia, and polyuria safety";
  }
  if (pituitaryAdrenalContext && /thyroid symptoms|palpitations|tremor|heat\/cold intolerance|neck swelling/.test(allText)) {
    return "Ask adrenal and thyroid-axis symptoms";
  }
  if (pituitaryAdrenalContext && /measured fever|rigors|hypothermia|toxic appearance|infection as a precipitant|infection as a mimic/.test(allText)) {
    return "Ask infection precipitant or mimic symptoms";
  }
  if (pituitaryAdrenalContext && /cough|sputum|pleuritic pain|dyspnea|hypoxemia|respiratory infection|pneumonia/.test(allText)) {
    return "Ask respiratory infection symptoms";
  }
  if (pituitaryAdrenalContext && /dysuria|urinary frequency|suprapubic|hematuria|flank pain|uti|pyelonephritis/.test(allText)) {
    return "Ask urinary infection symptoms";
  }
  if (pituitaryAdrenalContext && /wound|skin redness|drainage|indwelling line|procedure-site|skin infection/.test(allText)) {
    return "Ask wound and procedure-site infection symptoms";
  }
  if (pituitaryAdrenalContext && /hypertension|(?:type 1|type 2|gestational|mellitus)\s+diabetes|complication screening|medication choice/.test(allText)) {
    return "Ask treatment-limiting hypertension and diabetes complications";
  }
  if (pituitaryAdrenalContext && /autoimmune thyroid|type 1 diabetes|celiac|pernicious anemia|polyglandular autoimmune/.test(allText)) {
    return "Ask autoimmune polyglandular history";
  }
  if (/new headache|peripheral vision loss|double vision|eye movement pain|sudden severe headache|pituitary surgery|pituitary radiation/.test(allText)) {
    return "Ask pituitary mass-effect and treatment history";
  }
  if (pituitaryAdrenalContext && /24-hour urine volume|urine output changed|urinate overnight|nocturia|polyuria|polydipsia|overnight urination|thirst intensity|access to water|desmopressin/.test(allText)) {
    return "Ask diabetes-insipidus thirst, nocturia, and polyuria safety";
  }
  if (/new, worsening, resistant, or treatment-limiting hypertension or diabetes|treatment-limiting hypertension|treatment-limiting diabetes|complication screening|medication choice/.test(allText)) {
    return "Ask treatment-limiting hypertension and diabetes complications";
  }
  if (/hirsutism|acne|scalp hair loss|deepening voice|clitoromegaly|rapid virilization|cycle irregularity|androgenic medication/.test(allText)) {
    return "Ask hyperandrogenism and virilization features";
  }
  const peVteHistoryContext = /\b(?:pulmonary embolism|suspected pe|pe\/dvt|vte|dvt|clinical probability|esc_pe|acep_vte|ash_vte|ctpa|d-dimer|d dimer)\b/.test(allText)
    && !/\b(?:aha_asa_stroke|focal_neurologic_deficit|neuro_red_flags|gi_bleed|heme_bleeding_anemia|acg_ugib|hematemesis|melena|hematochezia|pallor|anemia)\b/.test(allText);
  if (peVteHistoryContext && /\b(?:sudden dyspnea|shortness of breath|pleuritic|hemoptysis|syncope|presyncope|oxygen need|escalating oxygen|full sentences)\b/.test(allText)) {
    return "Ask PE cardiopulmonary severity symptoms";
  }
  if (peVteHistoryContext && /\b(?:unilateral leg|calf pain|leg swelling|redness|warmth|immobilization|cast)\b/.test(allText)) {
    return "Ask DVT leg symptoms";
  }
  if (peVteHistoryContext && /\b(?:active bleeding|bleeding risk|anticoagulant|thrombolysis|contraindication|major surgery|major trauma|intracranial|severe uncontrolled hypertension|pending procedure)\b/.test(allText)) {
    return "Ask anticoagulation and bleeding-safety history";
  }
  if (peVteHistoryContext && /\b(?:prior vte|recent surgery|surgery|immobility|hospitalization|travel|estrogen|pregnancy|postpartum|active cancer|cancer)\b/.test(allText)) {
    return "Ask VTE provoking-factor history";
  }
  if (/\b(?:stroke|focal neurologic|last-known-well|reperfusion|thrombolysis|thrombectomy|aphasia|neglect)\b/.test(allText)
    && /\b(?:anticoagulant|bleeding risk|hypoglycemia|seizure|migraine|trauma|last-known-well|wake-up stroke)\b/.test(allText)) {
    return "Ask stroke mimics, anticoagulants, and reperfusion timing";
  }
  const bleedingAnemiaHistoryContext = /\b(?:bleeding|anemia|gi bleed|hematemesis|melena|hematochezia|pallor|bruising|petechiae|acg_ugib|heme_bleeding_anemia)\b/.test(allText);
  if (bleedingAnemiaHistoryContext
    && /\b(?:liver disease|kidney disease|bleeding disorder|procedure|trauma|transfusion|coagulopathy|prior transfusion|reversal)\b/.test(allText)) {
    return "Ask bleeding medication, coagulopathy, and transfusion-risk history";
  }
  if (bleedingAnemiaHistoryContext
    && /\b(?:hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|epistaxis|heavy menses|dizziness|syncope|dyspnea|chest pain)\b/.test(allText)) {
    return "Ask overt bleeding and anemia symptoms";
  }
  if (bleedingAnemiaHistoryContext
    && /\b(?:anticoagulant|antiplatelet|liver disease|kidney disease|bleeding disorder|procedure|trauma|transfusion|dyspnea at rest|syncope)\b/.test(allText)) {
    return "Ask bleeding medication, coagulopathy, and transfusion-risk history";
  }
  if (/\b(?:sleep apnea|snoring|osa|cpap|daytime sleepiness|witnessed apneas|drowsy driving)\b/.test(allText)
    && /\b(?:loud snoring|witnessed apneas|waking choking|morning headache|daytime sleepiness)\b/.test(allText)) {
    return "Ask OSA symptoms and daytime sleepiness";
  }
  if (/\b(?:sleep apnea|snoring|osa|cpap|daytime sleepiness|witnessed apneas|drowsy driving)\b/.test(allText)
    && /\b(?:drowsy driving|work-safety|resistant hypertension|atrial fibrillation|heart failure|opioid|sedative|alcohol near bedtime|prior sleep study|cpap intolerance|oral-appliance|oral appliance)\b/.test(allText)) {
    return "Ask OSA safety, comorbidities, and treatment context";
  }
  if (/\b(?:sleep apnea|snoring|osa|cpap|daytime sleepiness|witnessed apneas|drowsy driving)\b/.test(allText)) {
    return "Ask OSA symptoms, drowsy-driving risk, and CPAP context";
  }
  if (/\b(?:hypoglycemia|low glucose|neuroglycopenic|insulin|secretagogue|carbohydrate|jittery|shaky)\b/.test(allText)
    && /\b(?:confusion|sleepiness|seizure|trouble thinking|eat\/drink|eat drink|carbohydrates|most recent glucose|last meal)\b/.test(allText)) {
    return "Ask neuroglycopenic severity and carbohydrate response";
  }
  if (/\b(?:menopause|premature ovarian insufficiency|hypogonadism|reproductive endocrine|vasomotor|hot flashes|night sweats|genitourinary|fertility goal|cycle change)\b/.test(allText)) {
    return "Ask reproductive endocrine symptoms";
  }
  if (/\b(?:reproductive_and_gonadal|reproductive and gonadal|infertility|ovulation|lh-kit|luteal symptoms|cycle tracking|regular ovulation)\b/.test(allText)
    && /predictably ovulatory|lh-kit|luteal symptoms|cycle tracking|regular ovulation/.test(allText)) {
    return "Ask ovulation pattern and cycle tracking";
  }
  if (/\b(?:reproductive_and_gonadal|reproductive and gonadal|infertility|amenorrhea|hypogonadism)\b/.test(allText)
    && /palpitations|tremor|heat or cold intolerance|constipation or diarrhea|weight change|fatigue|neck swelling|eye symptoms/.test(allText)) {
    return "Ask thyroid symptoms affecting reproductive function";
  }
  if (/what has already been given|fluids|insulin route|current monitoring level|potassium\/phosphate|dextrose|antibiotics/.test(allText)) {
    return "Review hyperglycemic-crisis treatments already started";
  }
  if (/what does it feel like|radiate to arm|radiate.*jaw|radiate.*shoulder|chest pain quality|location radiation/.test(normalized)) {
    return "Ask chest pain quality, location, and radiation";
  }
  if (/shortness of breath|pleuritic pain|hemoptysis|oxygen requirement|cough/.test(normalized)
    && /chest|cardiovascular|cardiopulmonary/.test(`${normalized} ${tagText}`)) {
    return "Ask cardiopulmonary associated symptoms";
  }
  if (/diaphoresis|nausea|vomiting|palpitations|marked weakness/.test(normalized)
    && /chest|cardiovascular|ischemic|arrhythmia/.test(`${normalized} ${tagText}`)) {
    return "Ask ischemic and arrhythmia-associated symptoms";
  }
  if (/syncope|presyncope|neurologic symptoms|sudden maximal pain/.test(normalized)
    && /chest|cardiovascular|high risk/.test(`${normalized} ${tagText}`)) {
    return "Ask high-risk chest pain warning features";
  }
  if (/known cad|prior mi|stent|cabg|smoking|hypertension|family history/.test(normalized)
    && /chest|cardiovascular|risk/.test(`${normalized} ${tagText}`)) {
    return "Ask cardiovascular risk history";
  }
  if (!thyroidContext && /exact joint|body area|trauma|bear weight|swelling|redness|wound/.test(normalized)
    && /musculoskeletal|joint|site specific|pain/.test(`${normalized} ${tagText}`)) {
    return "Ask pain location, trauma, and inflammatory red flags";
  }
  if (/salt craving|dizziness on standing|low blood pressure|vomiting|abdominal pain|skin darkening/.test(normalized)) {
    return "Ask adrenal insufficiency and volume-depletion symptoms";
  }
  if ((pituitaryAdrenalContext || /\b(?:acromegaly|gigantism|growth hormone)\b/.test(allText))
    && /ring size|shoe size|facial features|jaw spacing|sweating|sleep apnea|joint pain|headaches/.test(normalized)) {
    return "Ask acral, soft-tissue, sleep, and headache changes";
  }
  if (thyroidContext && /heat intolerance|palpitations|tremor|anxiety|unintentional weight loss|diarrhea|increased sweating/.test(normalized)) {
    return "Ask hyperthyroid adrenergic, weight, and GI symptoms";
  }
  if (thyroidContext && /^how has weight changed|weight changed from baseline|appetite|fluid status|systemic symptoms/.test(normalized)) {
    return "Ask thyroid-related weight and systemic symptoms";
  }
  if (thyroidContext && /thyroid hormone|antithyroid drug|amiodarone|lithium|iodine|contrast exposure|high-dose biotin|biotin|thyroid supplement|missed dose|recent dose change/.test(allText)) {
    return "Review thyroid medications, iodine/biotin exposure, and assay interference";
  }
  if (thyroidContext && /has the thyroid nodule|neck mass grown rapidly|become painful|fixed|associated with hoarseness|suspicious nodes/.test(normalized)) {
    return "Ask thyroid nodule growth and invasion symptoms";
  }
  if (thyroidContext && /neck swelling[\s\S]*rapid growth[\s\S]*radiation exposure[\s\S]*family thyroid cancer/.test(normalized)) {
    return "Ask thyroid structural symptoms and cancer-risk history";
  }
  if (thyroidContext && /childhood head\/neck radiation|childhood head or neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer risk factor/.test(normalized)) {
    return "Ask thyroid radiation and family-risk history";
  }
  if (thyroidContext && /personal or family history of men|vhl|nf1|sdhx|medullary thyroid cancer|pheochromocytoma|paraganglioma/.test(normalized)) {
    return "Ask hereditary endocrine tumor history";
  }
  if (thyroidContext && /neck swelling[\s\S]*thyroid pain|thyroid pain or tenderness|pressure[\s\S]*hoarseness[\s\S]*trouble swallowing|rapidly enlarging neck mass/.test(normalized)) {
    return "Ask thyroid pain, pressure, and airway symptoms";
  }
  if (thyroidContext && /thyroid nodule|neck mass|grown rapidly|hoarseness|dysphagia|dyspnea|suspicious nodes/.test(normalized)) {
    return "Ask thyroid nodule growth, compressive, and node warnings";
  }
  if (thyroidContext && /childhood head\/neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer|medullary thyroid|men2/.test(allText)) {
    return "Ask thyroid cancer radiation and family-risk history";
  }
  if ((thyroidContext || /hypothyroid|hypothyroidism/.test(allText))
    && /cold intolerance|fatigue|constipation|dry(?: or coarse)? skin|coarse skin|hoarse voice|slowed thinking|weight gain|heavy menses|hypothyroid|hypothyroidism/.test(allText)) {
    return "Ask hypothyroid symptoms and menstrual pattern";
  }
  if (infectionContext
    && /\b(?:localize|localizing|source|cough|sputum|dyspnea|dysuria|flank|rash|wound|neck stiffness|abdominal)\b/.test(normalized)) {
    return "Ask source-localizing infection symptoms";
  }
  if (/\b(?:immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|indwelling line|device|travel|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication)\b/.test(normalized)
    && infectionContext) {
    return "Ask host-risk and exposure history";
  }
  if (/\b(?:dysuria|frequency|urgency|hematuria|flank|catheter|urologic|urine|urinary)\b/.test(normalized)
    && /\b(?:fever|urinary|renal|pyelonephritis|uti|infection)\b/.test(`${normalized} ${tagText}`)) {
    return "Ask urinary and renal-source symptoms";
  }
  if (reproductiveContext && /height|growth velocity|family height|puberty timing/.test(allText)) {
    return "Ask growth velocity and puberty timing";
  }
  if (/\b(?:acute_scrotum|scrotal pain|scrotal_pain|testicular torsion|testicular_torsion|torsion|high-riding|cremasteric|solitary testis|urgent urology|urology care)\b/.test(`${normalized} ${tagText}`)) {
    if (/^was onset sudden|was onset sudden|urinary symptoms fever trauma or sti exposure/.test(normalized)) {
      return "Ask torsion nausea/swelling, urinary, and trauma features";
    }
    if (/when exactly|sudden|severe|high-riding|high riding|nausea|vomiting|swelling/.test(allText)) {
      return "Ask scrotal pain onset and torsion features";
    }
    return "Ask epididymitis/STI and urology-risk features";
  }
  if (guStiContext && /groin lumps|groin swelling|inguinal|genital ulcers|painful lesions|lower limb skin infection|skin infection/.test(allText)) {
    return "Ask groin nodes, genital lesions, and skin infection features";
  }
  if (guStiContext && /\b(?:urethral|vaginal|genital|\bsti\b|new partners|syphilis|hiv|pelvic pain|testicular pain|discharge|ulcer|lesion)\b/.test(allText)) {
    return "Ask GU/STI discharge/dysuria, lesions, and exposure";
  }
  if (/\b(?:foot ulcer|foot wound|drainage|protective sensation|prior amputation|offload|footwear|wound-care supplies)\b/.test(`${normalized} ${tagText}`)) {
    return "Ask diabetic foot wound, neuropathy, and self-care risk";
  }
  if (/\b(?:rash|mucosal|tongue swelling|skin pain|blistering|purpura|new medicine|travel|tick|immunocompromise|urticaria)\b/.test(`${normalized} ${tagText}`)) {
    return "Ask rash danger features and exposure history";
  }
  if (/\b(?:sick contacts|covid|flu|strep|ear|sinus|dental|muffled voice|trismus|swallow fluids|heent|throat)\b/.test(`${normalized} ${tagText}`)) {
    return "Ask HEENT infection exposure and deep-space warning symptoms";
  }
  if (/\b(?:hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|anticoagulant|antiplatelet|transfusion|heavy menses)\b/.test(`${normalized} ${tagText}`)) {
    return "Ask bleeding source, severity, and medication risk";
  }
  if (!boneMineralContext && /\b(?:lithium|demeclocycline|amphotericin|diuretic|sglt2|glucocorticoid|desmopressin|fluid restriction)\b/.test(allText)) {
    return "Review medication and fluid-balance triggers";
  }
  if (/blood-pressure|blood pressure|lipid|kidney-protective|cardiometabolic medications|adherence|adverse-effect concerns/.test(allText)) {
    return "Review cardiometabolic medications and adverse effects";
  }
  if (/true weakness|numbness|back pain|dark urine|trouble walking|muscle cramps/.test(allText)) {
    return "Ask cramp-associated weakness and rhabdo symptoms";
  }
  if (/\bpcos\b|polycystic ovary/.test(allText)) {
    return "Ask PCOS and reproductive-metabolic history";
  }
  if (/^any\b/.test(normalized)) {
    return "Ask focused source, severity, and safety features";
  }
  return raw.length > 120 ? `${raw.slice(0, 116).trim()}...` : raw;
}

function historyQuestionDisplayLabelSuffix(question = {}) {
  const fullQuestion = normalizeEvidenceLabel(question.fullQuestion || question.text || question.displayLabel || "");
  const tagText = normalizeEvidenceLabel(Array.isArray(question.tags) ? question.tags.join(" ") : question.tags || "");
  const allText = `${fullQuestion} ${tagText}`;
  const detailText = normalizeEvidenceLabel((question.detail_prompts || question.detailPrompts || []).join(" "));
  const boneMineralContext = /\b(?:bone and parathyroid|vitamin d|osteomalacia|osteoporosis|osteopenia|hypoparathyroidism|hyperparathyroidism|parathyroid|calcium|pth|phosphorus|kidney stones|nephrocalcinosis)\b/.test(allText);
  const guStiContext = /\b(?:\bsti\b|sexually transmitted|urethritis|cervicitis|genital discharge|penile discharge|vaginal discharge|new partners|syphilis|hiv|gonorrhea|chlamydia|testicular pain|scrotal pain|pelvic pain)\b/.test(allText);
  if (boneMineralContext && /perioral numbness|tingling|tetany|carpopedal|laryngospasm|arrhythmia/.test(fullQuestion)) return "perioral/tetany symptoms";
  if (boneMineralContext && /muscle cramps|paresthesias|paralysis|palpitations|neuromuscular/.test(fullQuestion)) return "cramps/neuromuscular symptoms";
  if (boneMineralContext && /nephrocalcinosis|hematuria|flank pain|recurrent utis/.test(fullQuestion)) return "kidney stones";
  if (boneMineralContext && /constipation|polyuria|polydipsia|bone pain|confusion|dehydration|reduced kidney/.test(fullQuestion)) return "calcium-symptom pattern";
  if (boneMineralContext && /kidney stones/.test(fullQuestion)) return "kidney stones";
  if (boneMineralContext && /prior neck|thyroid|parathyroid surgery|postoperative calcium/.test(fullQuestion)) return "neck surgery/calcium history";
  if (/what has already been given|fluids|insulin route|current monitoring level/.test(fullQuestion)) return "treatments started";
  if (/recent glucose|beta hydroxybutyrate|anion gap|bicarbonate|osmolality|ketones/.test(fullQuestion)) return "labs and severity";
  if (/sglt2|fasting|low carb|alcohol|toxin/.test(fullQuestion)) return "SGLT2/fasting risks";
  if (/heart failure|ckd|eskd|frailty|cirrhosis|smaller fluid boluses/.test(fullQuestion)) return "fluid-risk comorbidities";
  if (/height|growth velocity|family height|puberty timing/.test(fullQuestion)) return "growth/puberty history";
  if (/childhood head|neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer/.test(fullQuestion)) return "radiation/family cancer risk";
  if (/personal or family history of men|vhl|nf1|sdhx|medullary thyroid|pheochromocytoma|paraganglioma/.test(fullQuestion)) return "hereditary endocrine syndromes";
  if (/\b(?:thyroid|goiter|nodule|neck mass)\b/.test(allText)
    && /neck swelling|rapid growth|thyroid pain|hoarseness|trouble swallowing|positional shortness|positional dyspnea|compressive/.test(fullQuestion)) return "compressive symptoms";
  const bleedingAnemiaSuffixContext = /\b(?:bleeding|anemia|gi bleed|hematemesis|melena|hematochezia|pallor|bruising|petechiae|acg_ugib|heme_bleeding_anemia)\b/.test(allText);
  if (bleedingAnemiaSuffixContext
    && /\b(?:liver disease|kidney disease|bleeding disorder|procedure|trauma|transfusion|coagulopathy|prior transfusion|reversal)\b/.test(fullQuestion)) return "medication/coagulopathy risk";
  if (bleedingAnemiaSuffixContext
    && /\b(?:hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|epistaxis|heavy menses|dizziness|syncope|dyspnea|chest pain)\b/.test(fullQuestion)) return "overt bleeding/anemia symptoms";
  if (/measured fever|rigors|hypothermia|toxic appearance|infection as a precipitant|infection as a mimic/.test(fullQuestion)) return "infection precipitant";
  if (/cough|sputum|pleuritic pain|dyspnea|hypoxemia|respiratory infection|pneumonia/.test(fullQuestion)) return "respiratory source";
  if (/immunosuppression|transplant|chemotherapy|high-dose steroids|biologics|asplenia|frailty|travel|outdoor|sick contacts|sexual exposure|injection drug|new medication/.test(fullQuestion)) return "host/exposure risk";
  if (/foot ulcer|wound|skin redness|drainage|indwelling line|procedure-site|skin infection/.test(fullQuestion)) return "skin/line source";
  if (/numbness|tingling|burning pain|loss of protective sensation|falls|ulcers|neuropathy/.test(fullQuestion)) return "neuropathy symptoms";
  if (/immunosuppression|transplant|chemotherapy|high dose steroids|biologics|asplenia|frailty|travel|outdoor|sick contacts|sexual exposure|injection drug|new medications?/.test(detailText)) return "host/exposure risk";
  if (/mouth sores|eye pain|eye redness|genital sores|skin pain|blistering|purpura|mucosal/.test(detailText)) return "mucosal/ocular warning signs";
  if (guStiContext && /dysuria|urethral|vaginal|discharge|genital|sti|new partner|syphilis|hiv|pelvic|testicular|ulcer|lesion/.test(detailText)) return "GU/STI symptoms and exposure";
  if (/dysuria|frequency|urgency|hematuria|suprapubic|flank pain|catheter|prior resistant|reduced urine output|renal dysfunction/.test(detailText)) return "urinary/flank symptoms";
  if (/pregnancy is possible|fertility goals?|postpartum|partner factors|medications change safety/.test(detailText)) return "pregnancy/fertility safety";
  if (/urine volume|nocturia|urinary frequency|thirst intensity|access to water|dehydration|confusion/.test(detailText)) return "polyuria/thirst details";
  if (!boneMineralContext && /fatigue|cold intolerance|constipation|dry skin|hoarse voice|slowed thinking|weight gain/.test(fullQuestion)) return "hypothyroid symptoms";
  if (/thyroid hormone|antithyroid drug|amiodarone|lithium|iodine|contrast|biotin/.test(fullQuestion)) return "medications and assay interference";
  if (/neck swelling|rapid growth|thyroid pain|hoarseness|trouble swallowing|positional shortness/.test(fullQuestion)) return "compressive symptoms";
  if (/loud snoring|witnessed apneas|morning headaches|daytime sleepiness|cpap/.test(fullQuestion)) return "sleep apnea symptoms";
  if (/nipple discharge|breast tenderness|prolactin/.test(fullQuestion)) return "prolactin symptoms/medications";
  const detail = (question.detail_prompts || [])
    .map((prompt) => String(prompt || "")
      .replace(/^Ask specifically about\s+/i, "")
      .replace(/^Review\s+/i, "")
      .replace(/[.?]+$/g, "")
      .trim())
    .find(Boolean);
  if (detail) {
    return detail.length > 36 ? `${detail.slice(0, 33).trim()}...` : detail;
  }
  const firstWords = String(question.fullQuestion || question.text || "")
    .replace(/\?+$/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
  return firstWords || "source question";
}

function uniquifyHistoryQuestionDisplayLabels(questions = []) {
  const buckets = new Map();
  questions.forEach((question) => {
    const key = normalizeEvidenceLabel(question.displayLabel || question.text || "");
    if (!key) return;
    const bucket = buckets.get(key) || [];
    bucket.push(question);
    buckets.set(key, bucket);
  });
  const used = new Set();
  return questions.map((question) => {
    const baseLabel = question.displayLabel || question.text || "";
    const key = normalizeEvidenceLabel(baseLabel);
    let displayLabel = baseLabel;
    if (key && (buckets.get(key) || []).length > 1) {
      displayLabel = `${baseLabel} - ${historyQuestionDisplayLabelSuffix(question)}`;
    }
    let uniqueLabel = displayLabel;
    let counter = 2;
    while (used.has(normalizeEvidenceLabel(uniqueLabel))) {
      uniqueLabel = `${displayLabel} ${counter}`;
      counter += 1;
    }
    used.add(normalizeEvidenceLabel(uniqueLabel));
    return { ...question, label: uniqueLabel, displayLabel: uniqueLabel };
  });
}

function historyQuestionSemanticBucket(question = {}) {
  const questionText = normalizeEvidenceLabel(question.text || "");
  const text = normalizeEvidenceLabel([
    question.text,
    question.options,
    question.diagnosticPurpose,
    question.managementImplication,
    question.source,
    ...(question.tags || [])
  ].filter(Boolean).join(" "));
  const earlyPeVteBucketContext = /\b(?:pulmonary embolism|suspected pe|pe\/dvt|vte|dvt|clinical probability|esc_pe|acep_vte|ash_vte|ctpa|d-dimer|d dimer)\b/.test(text)
    && !/\b(?:aha_asa_stroke|focal_neurologic_deficit|neuro_red_flags|gi_bleed|heme_bleeding_anemia|acg_ugib|hematemesis|melena|hematochezia|pallor|anemia)\b/.test(text);
  if (earlyPeVteBucketContext && /\b(?:sudden|dyspnea|shortness of breath|pleuritic|hemoptysis|syncope|presyncope|oxygen need|escalating oxygen|full sentences)\b/.test(questionText)) {
    return "pe-cardiopulmonary-severity-history";
  }
  if (earlyPeVteBucketContext && /\b(?:unilateral leg|calf pain|leg swelling|redness|warmth|immobilization|cast)\b/.test(questionText)) {
    return "pe-dvt-leg-symptoms-history";
  }
  if (earlyPeVteBucketContext && /\b(?:active bleeding|bleeding risk|anticoagulant|thrombolysis|contraindication|major surgery|major trauma|intracranial|severe uncontrolled hypertension|pending procedure)\b/.test(questionText)) {
    return "pe-anticoagulation-safety-history";
  }
  if (earlyPeVteBucketContext && /\b(?:prior vte|recent surgery|surgery|immobility|hospitalization|travel|estrogen|pregnancy|postpartum|active cancer|cancer)\b/.test(questionText)) {
    return "pe-vte-provoking-factor-history";
  }
  const feverSepsisHistoryContext = /\b(?:ssc sepsis|merck fever|ats cap|idsa cap|sepsis|source control|pneumonia)\b/.test(text);
  const infectionSourceDomainCount = [
    /\b(?:cough|shortness of breath|dyspnea|sputum|pleuritic|oxygen|aspiration|wheeze|respiratory)\b/.test(questionText),
    /\b(?:sore throat|ear|sinus|dental|oropharynx|heent)\b/.test(questionText),
    /\b(?:dysuria|frequency|flank|urinary|hematuria|catheter)\b/.test(questionText),
    /\b(?:abdominal|vomiting|diarrhea|gi|belly)\b/.test(questionText),
    /\b(?:rash|wound|line|cellulitis|skin|bite)\b/.test(questionText),
    /\b(?:headache|neck stiffness|confusion|meningismus|photophobia|hot joint|back pain)\b/.test(questionText)
  ].filter(Boolean).length;
  if (feverSepsisHistoryContext
    && (/\b(?:localize|localizing|most plausible)\b/.test(questionText) || infectionSourceDomainCount >= 3)) {
    return "infection-source-localization-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|line|device|travel|outdoor|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication|steroid|chemotherapy|transplant|asplenia)\b/.test(questionText)) {
    return "infection-host-exposure-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:cough|shortness of breath|dyspnea|sputum|pleuritic|oxygen|aspiration|wheeze)\b/.test(questionText)
    && !/\b(?:what symptoms localize|infection source)\b/.test(questionText)) {
    return "infection-respiratory-source-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:sore throat|ear pain|sinus pain|dental|oral pain|neck swelling|hoarseness|trouble swallowing|drooling|heent)\b/.test(questionText)) {
    return "infection-heent-oral-source-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:dysuria|urinary frequency|frequency or urgency|urgency|hematuria|suprapubic|flank|catheter|urologic|resistant urine|pyelonephritis|reduced urine)\b/.test(questionText)) {
    return "infection-urinary-flank-source-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:abdominal pain|vomiting|diarrhea|jaundice|focal tenderness|intra-abdominal|abdominal infection|biliary|gi source)\b/.test(questionText)) {
    return "infection-abdominal-gi-source-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:rash|painful skin|wound|drainage|line pain|line redness|line-site|recent procedure|bite|rapidly spreading|cellulitis|soft tissue)\b/.test(questionText)) {
    return "infection-skin-wound-source-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:severe headache|neck stiffness|photophobia|seizure|petechiae|purpura|hot swollen joint|bone or back pain|focal bone|new weakness|bowel or bladder|meningitis|spine infection)\b/.test(questionText)) {
    return "infection-cns-joint-spine-danger-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:fainting|confusion|very low urine|low urine|oliguria|mottled|cold extremities|severe weakness|rapid worsening|hypotension|shock|lactate)\b/.test(questionText)) {
    return "sepsis-shock-perfusion-history";
  }
  if (feverSepsisHistoryContext
    && /\b(?:mental status baseline|new confusion|sleepiness|somnolence|agitation|unable to safely cooperate|unable to cooperate)\b/.test(questionText)) {
    return "sepsis-mental-status-history";
  }
  if (/\b(?:fever|febrile|antipyretic|antibiotic|steroid|immunosuppressant)\b/.test(text)
    && /\b(?:how high was the fever|how was it measured|when did it start|antipyretics|antibiotics|steroids|immunosuppressants)\b/.test(questionText)) {
    return "fever-timeline-medication-history";
  }
  const thyroidHistoryContext = /\b(?:thyroid|graves|hashimoto|thyrotoxicosis|hyperthyroid|hypothyroid|goiter|nodule|abnormal tsh|men2|biotin|amiodarone|lithium|antithyroid)\b/.test(text);
  if (thyroidHistoryContext
    && /\b(?:head or neck radiation|neck radiation|radiation exposure|family thyroid cancer|men2|suspicious thyroid biopsy|suspicious prior biopsy|medullary thyroid)\b/.test(questionText)) {
    return "thyroid-cancer-risk-history";
  }
  if (thyroidHistoryContext
    && /\b(?:neck swelling|neck mass|rapid growth|thyroid pain|hoarseness|dysphagia|trouble swallowing|positional shortness|positional dyspnea|dyspnea when supine|compressive)\b/.test(questionText)) {
    return "thyroid-structural-compressive-history";
  }
  if (thyroidHistoryContext
    && /\b(?:thyroid hormone|antithyroid|amiodarone|lithium|iodine|contrast|biotin|thyroid supplement|missed dose|dose change|medication adherence)\b/.test(questionText)) {
    return "thyroid-medication-assay-history";
  }
  if (thyroidHistoryContext
    && /\b(?:pregnancy|postpartum|breastfeeding|fertility|infertility)\b/.test(questionText)) {
    return "thyroid-reproductive-context-history";
  }
  if (thyroidHistoryContext
    && /\bheat intolerance\b/.test(questionText)
    && /\bcold intolerance\b/.test(questionText)
    && /\b(?:dry|coarse)\b/.test(questionText)) {
    return "thyroid-phenotype-symptoms-history";
  }
  if (thyroidHistoryContext
    && /\b(?:heat intolerance|palpitations|tremor|sweating|unintentional weight loss|weight loss|diarrhea|anxiety|insomnia|thyroid hormone excess|adrenergic)\b/.test(questionText)) {
    return "thyroid-hyperthyroid-symptoms-history";
  }
  if (thyroidHistoryContext
    && /\b(?:cold intolerance|fatigue|constipation|dry or coarse skin|dry skin|coarse skin|hoarse voice|slowed thinking|weight gain|heavy menses|hypothyroid)\b/.test(questionText)) {
    return "thyroid-hypothyroid-symptoms-history";
  }
  const peVteBucketContext = /\b(?:pulmonary embolism|suspected pe|pe\/dvt|vte|dvt|clinical probability|esc_pe|acep_vte|ash_vte|ctpa|d-dimer|d dimer)\b/.test(text)
    && !/\b(?:aha_asa_stroke|focal_neurologic_deficit|neuro_red_flags|gi_bleed|heme_bleeding_anemia|acg_ugib|hematemesis|melena|hematochezia|pallor|anemia)\b/.test(text);
  if (peVteBucketContext && /\b(?:sudden|dyspnea|shortness of breath|pleuritic|hemoptysis|syncope|presyncope|oxygen need|escalating oxygen|full sentences)\b/.test(questionText)) {
    return "pe-cardiopulmonary-severity-history";
  }
  if (peVteBucketContext && /\b(?:unilateral leg|calf pain|leg swelling|redness|warmth|immobilization|cast)\b/.test(questionText)) {
    return "pe-dvt-leg-symptoms-history";
  }
  if (peVteBucketContext && /\b(?:active bleeding|bleeding risk|anticoagulant|thrombolysis|contraindication|major surgery|major trauma|intracranial|severe uncontrolled hypertension|pending procedure)\b/.test(questionText)) {
    return "pe-anticoagulation-safety-history";
  }
  if (peVteBucketContext && /\b(?:prior vte|recent surgery|surgery|immobility|hospitalization|travel|estrogen|pregnancy|postpartum|active cancer|cancer)\b/.test(questionText)) {
    return "pe-vte-provoking-factor-history";
  }
  if (/\b(?:abdominal_pain_cramping|abdominal pain|acute abdomen|peritonitis|biliary|appendicitis|pancreatitis|obstruction|gi bleed)\b/.test(text)
    && !/\b(?:pelvic|menstrual|ectopic|pid|pregnancy)\b/.test(text)
    && /\b(?:where is the pain worst|localized|localised|ruq|rlq|epigastric|flank|vomiting|diarrhea|constipation|fever|bleeding|black stool|stool|gas|jaundice)\b/.test(questionText)) {
    return "abdominal-source-localization-history";
  }
  return "";
}

function historyQuestionSemanticConflictBuckets(bucket = "") {
  if (bucket === "thyroid-phenotype-symptoms-history") {
    return ["thyroid-hyperthyroid-symptoms-history", "thyroid-hypothyroid-symptoms-history"];
  }
  if (bucket === "thyroid-hyperthyroid-symptoms-history" || bucket === "thyroid-hypothyroid-symptoms-history") {
    return ["thyroid-phenotype-symptoms-history"];
  }
  return [];
}

function historyQuestionFromRecommendationEntry(entry) {
  const candidate = entry.candidate || {};
  const LR_plus = candidate.LR_plus || entry.LR_plus || entry.evidence?.LR_plus || "";
  const LR_minus = candidate.LR_minus || entry.LR_minus || entry.evidence?.LR_minus || "";
  const text = entry.displayBedsideQuestion
    || (isHistoryQuestionEntry(entry) ? candidate.bedside_question_label : "")
    || "";
  if (!text) {
    return null;
  }
  const traceability = recommendationTraceability(entry, entry.validatedIntentTrace || []);
  const tags = unique([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ]);
  const displayLabel = historyQuestionDisplayLabel(text, tags);
  return {
    id: `${entry.exam_id || candidate.exam_id || "history"}-question`,
    label: displayLabel,
    text,
    displayLabel,
    fullQuestion: text,
    detail_prompts: historyQuestionDetailPrompts(text, entry.detail_prompts || candidate.detail_prompts),
    options: entry.displayBedsideQuestionOptions || candidate.bedside_question_options || "",
    whenToAsk: candidate.when_to_use_structured || entry.domain || "",
    diagnosticPurpose: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    managementImplication: entry.displayManagement || candidate.result_changes_management || candidate.management_link || "",
    source: candidateSourceLabel(candidate),
    LR_plus,
    LR_minus,
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source: candidateSourceLabel(candidate),
      LR_plus,
      LR_minus,
      tier: candidate.evidence_tier || ""
    }, candidate, candidate.item_type || "history_question"),
    tags,
    linkedExamId: entry.exam_id || candidate.exam_id || "",
    validatedIntentIds: traceability.intent_ids,
    traceability
  };
}

function focusedHistoryQuestionsFromEntries(entries = []) {
  const questions = [];
  const seen = new Set();
  const seenSemanticBuckets = new Set();
  const orderedEntries = [
    ...entries.filter(isHistoryQuestionEntry),
    ...entries.filter((entry) => !isHistoryQuestionEntry(entry))
  ];
  orderedEntries.forEach((entry) => {
    const question = historyQuestionFromRecommendationEntry(entry);
    if (!question) {
      return;
    }
    const entryIsCuratedHistory = isHistoryQuestionEntry(entry);
    const keepRequiredHistoryFloor = entryIsCuratedHistory
      && (entry.candidate?.retrievalRoutes || []).includes("validated_bundle_required");
    const key = historyQuestionKey(question);
    const semanticBucket = historyQuestionSemanticBucket(question);
    const semanticConflict = semanticBucket
      && historyQuestionSemanticConflictBuckets(semanticBucket).some((bucket) => seenSemanticBuckets.has(bucket));
    if (!key || seen.has(key) || (!keepRequiredHistoryFloor && semanticBucket && (seenSemanticBuckets.has(semanticBucket) || semanticConflict))) {
      return;
    }
    questions.push(question);
    seen.add(key);
    if (semanticBucket) {
      seenSemanticBuckets.add(semanticBucket);
    }
  });
  return uniquifyHistoryQuestionDisplayLabels(questions);
}

function managementFindingKey(finding = {}) {
  const managementKey = normalizeEvidenceLabel(
    finding.managementChange
      || finding.management_change
      || finding.managementImplication
      || finding.management_implication
      || ""
  );
  if (managementKey) {
    return `management:${managementKey}`;
  }
  return normalizeEvidenceLabel([
    finding.label,
    finding.linkedExamId
  ].filter(Boolean).join(" "));
}

function managementFindingDisplayLabel(entry = {}, candidate = {}) {
  const itemType = [
    entry.role,
    entry.exam_id,
    entry.id,
    candidate.exam_id,
    candidate.id,
    candidate.item_type,
    candidate.gap_type,
    candidate.traceability?.item_group,
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ].filter(Boolean).join(" ");
  const baseLabel = isHistoryQuestionEntry(entry)
    ? conciseLimitationCautionBaseLabel(entry, candidate)
    : (entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "linked workup item");
  const compactBaseLabel = compactManagementFindingLabel(baseLabel);
  return /^management implication\s+-\s+/i.test(String(compactBaseLabel || ""))
    ? compactBaseLabel
    : `Management implication - ${compactBaseLabel}`;
}

function managementChangingFindingFromEntry(entry = {}) {
  const candidate = entry.candidate || {};
  const LR_plus = candidate.LR_plus || entry.LR_plus || entry.evidence?.LR_plus || "";
  const LR_minus = candidate.LR_minus || entry.LR_minus || entry.evidence?.LR_minus || "";
  const managementChange = entry.displayManagement
    || entry.managementRelevance
    || candidate.result_changes_management
    || candidate.management_link
    || "";
  if (!String(managementChange || "").trim() || /^(?:n\/a|na|none|not applicable)$/i.test(String(managementChange).trim())) {
    return null;
  }
  const traceability = recommendationTraceability(entry, entry.validatedIntentTrace || []);
  const tags = unique([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ]);
  const label = managementFindingDisplayLabel(entry, candidate);
  return {
    id: `${entry.exam_id || candidate.exam_id || "management"}-management-change`,
    label,
    finding: candidate.examOptions || entry.options || candidate.bedside_question_options || "",
    managementChange,
    diagnosticTarget: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    source: candidateSourceLabel(candidate),
    LR_plus,
    LR_minus,
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source: candidateSourceLabel(candidate),
      LR_plus,
      LR_minus,
      tier: candidate.evidence_tier || ""
    }, candidate, candidate.item_type),
    tags,
    linkedExamId: entry.exam_id || candidate.exam_id || "",
    role: entry.role || "",
    validatedIntentIds: traceability.intent_ids,
    traceability
  };
}

function entryCanContributeManagementChangingFinding(entry = {}) {
  if (isBasicSafetyCheckEntry(entry) || isHistoryQuestionEntry(entry)) {
    return false;
  }
  return !isNonExamWorkupEntry(entry)
    || isDiagnosticTestEntry(entry)
    || isRedFlagEntry(entry)
    || isManagementChangeEntry(entry);
}

function managementChangingFindingsFromEntries(entries = []) {
  const findings = [];
  const seen = new Set();
  const byKey = new Map();
  entries.forEach((entry) => {
    if (!entryCanContributeManagementChangingFinding(entry)) {
      return;
    }
    const finding = managementChangingFindingFromEntry(entry);
    if (!finding) {
      return;
    }
    const key = managementFindingKey(finding);
    if (!key || seen.has(key)) {
      if (key && byKey.has(key)) {
        mergeManagementFindingTraceability(byKey.get(key), finding);
      }
      return;
    }
    findings.push(finding);
    seen.add(key);
    byKey.set(key, finding);
  });
  return findings.slice(0, 32);
}

function mergeManagementFindingTraceability(target = {}, duplicate = {}) {
  const targetTraceability = target.traceability || {};
  const duplicateTraceability = duplicate.traceability || {};
  const linkedExamIds = unique([
    ...traceArray(target.linkedExamIds),
    target.linkedExamId,
    targetTraceability.evidence_row_id,
    ...traceArray(duplicate.linkedExamIds),
    duplicate.linkedExamId,
    duplicateTraceability.evidence_row_id
  ].filter(Boolean));
  const sourceIds = traceSourceIdArray(
    targetTraceability.source_ids,
    duplicateTraceability.source_ids,
    target.sourceIds,
    duplicate.sourceIds
  );
  const intentIds = unique([
    ...traceArray(target.validatedIntentIds),
    ...traceArray(targetTraceability.intent_ids),
    ...traceArray(duplicate.validatedIntentIds),
    ...traceArray(duplicateTraceability.intent_ids)
  ]);
  target.linkedExamIds = linkedExamIds;
  target.sourceIds = sourceIds;
  target.validatedIntentIds = intentIds;
  target.tags = unique([
    ...traceArray(target.tags),
    ...traceArray(duplicate.tags)
  ]);
  target.traceability = {
    ...targetTraceability,
    intent_ids: intentIds,
    source_ids: sourceIds,
    evidence_row_ids: linkedExamIds,
    authorized_by: targetTraceability.authorized_by || duplicateTraceability.authorized_by || ""
  };
  return target;
}

function limitationCautionKey(caution = {}) {
  return normalizeEvidenceLabel([
    caution.label,
    caution.limitation,
    caution.linkedExamId
  ].filter(Boolean).join(" "));
}

function conciseLimitationCautionBaseLabel(entry = {}, candidate = {}) {
  const isHistory = isHistoryQuestionEntry(entry)
    || candidate.item_type === "history_question"
    || candidate.gap_type === "history_question";
  const rawLabel = [
    entry.label,
    entry.displayLabel,
    entry.displayBedsideQuestion,
    candidate.examLabel,
    candidate.maneuver,
    candidate.bedside_question_label,
    candidate.exam_id,
    entry.exam_id
  ].find((value) => String(value || "").trim()) || "linked workup item";
  const normalizedRawLabel = normalizeEvidenceLabel(rawLabel);
  if (!isHistory || !/^(?:any|what|how|when|could|are|do you|is there)\b/.test(normalizedRawLabel)) {
    return rawLabel;
  }
  const tagText = normalizeEvidenceLabel([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ].join(" "));
  if (/\b(?:pulmonary embolism|vte|dvt)\b/.test(tagText)) return "PE/VTE risk history";
  if (/\b(?:abdominal pain|acute abdomen|biliary|appendicitis)\b/.test(tagText)) return "abdominal pain source/severity history";
  if (/\b(?:dysuria|uti|pyelonephritis|flank pain|renal colic)\b/.test(tagText)) return "GU/renal source and severity history";
  if (/\b(?:infection|fever|sepsis|pneumonia|source localizing|source_localizing)\b/.test(tagText)) return "infection source/severity history";
  if (/\b(?:pelvic pain|pregnancy|ectopic|pid)\b/.test(tagText)) return "pelvic pain and pregnancy safety history";
  if (/\b(?:sti|genital discharge|urethritis|cervicitis|epididymitis)\b/.test(tagText)) return "GU/STI source and exposure history";
  if (/\b(?:sleep apnea|snoring|osa)\b/.test(tagText)) return "OSA risk and safety history";
  if (/\b(?:thyroid|hyperthyroid|hypothyroid|thyroid storm|myxedema)\b/.test(tagText)) return "thyroid symptom and medication history";
  if (/\b(?:diabetes|dka|hhs|hypoglycemia)\b/.test(tagText)) return "diabetes safety and trigger history";
  return "focused history question";
}

function compactLimitationCautionLabel(label = "", itemType = "") {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const typeText = String(itemType || "");
  const commaCount = (text.match(/,/g) || []).length;
  if (text.length <= 90 && commaCount < 2) {
    return text;
  }
  const head = text
    .replace(/\s*;\s*[\s\S]*$/g, "")
    .replace(/\s*,\s*[\s\S]*$/g, "")
    .replace(/\s+\b(?:with|when|if|for)\b\s+[\s\S]*$/i, "")
    .trim();
  if (head.length >= 12 && head.length <= 90) {
    return head;
  }
  if (/\b(?:diagnostic[_\s-]?test|reference[_\s-]?threshold|initialtests|initial[_\s-]?tests|test|tests|bmp|electrolyte|blood[_\s-]?gas|osmolality|ketone|glucose|ecg|troponin|culture|imaging|monitoring|labs?)\b/i.test(typeText)) {
    return "diagnostic test/reference interpretation";
  }
  if (/\b(?:red[_\s-]?flag|escalation|warning|shock|danger|cue)\b/i.test(typeText)) {
    return "red-flag interpretation";
  }
  if (/\b(?:management|disposition|rule|acuity|emergency|correction|transition|discharge|protocol|treatment|insulin[_\s-]?safety)\b/i.test(typeText)
    || /^(?:for|do not|before|transition|suspected|icu\/|uncomplicated)\b/i.test(text)) {
    return "management implication";
  }
  if (/\b(?:diagnostic_test|reference_threshold|test)\b/i.test(itemType)) {
    return "diagnostic test/reference interpretation";
  }
  if (/\bred_flag\b/i.test(itemType)) {
    return "red-flag interpretation";
  }
  if (/\bmanagement\b/i.test(itemType)) {
    return "management implication";
  }
  return text.length > 90 ? `${text.slice(0, 86).trim()}...` : text;
}

function compactManagementFindingLabel(label = "") {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  if (text.length <= 90 && commaCount < 2 && orCount < 3) {
    return text;
  }
  const head = text
    .replace(/\s*;\s*[\s\S]*$/g, "")
    .replace(/\s*,\s*[\s\S]*$/g, "")
    .replace(/\s+\b(?:with|when|if|for)\b\s+[\s\S]*$/i, "")
    .trim();
  if (head.length >= 12 && head.length <= 90) {
    return head;
  }
  if (/^(?:for|do not|before|transition|suspected|icu\/|uncomplicated)\b/i.test(text)) {
    return "management implication";
  }
  return text.length > 90 ? `${text.slice(0, 86).trim()}...` : text;
}

function limitationCautionDisplayLabel(entry = {}, candidate = {}) {
  const itemType = [
    entry.role,
    entry.exam_id,
    entry.id,
    candidate.exam_id,
    candidate.id,
    candidate.item_type,
    candidate.gap_type,
    candidate.traceability?.item_group,
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ].filter(Boolean).join(" ");
  const primaryBaseLabel = compactLimitationCautionLabel(conciseLimitationCautionBaseLabel(entry, candidate), itemType);
  const baseLabel = genericLimitationCautionBaseLabel(primaryBaseLabel)
    ? ([
        entry.displayManagement,
        entry.managementRelevance,
        candidate.result_changes_management,
        candidate.management_link,
        entry.displayDiagnosticTarget,
        candidate.diagnostic_target,
        entry.reason,
        entry.rationale,
        candidate.limitations,
        candidate.interpretation_cautions
      ]
        .map((candidateLabel) => compactLimitationCautionLabel(candidateLabel, ""))
        .find((candidateLabel) => candidateLabel && !genericLimitationCautionBaseLabel(candidateLabel)) || primaryBaseLabel)
    : primaryBaseLabel;
  return /^interpretation caution\b/i.test(String(baseLabel || ""))
    ? baseLabel
    : `Interpretation caution - ${baseLabel}`;
}

function genericLimitationCautionBaseLabel(label = "") {
  const text = String(label || "").trim();
  const normalized = normalizeEvidenceLabel(text);
  return /^(?:diagnostic test\/reference interpretation|red-flag interpretation|management implication|focused history question|linked workup item|differential-frame interpretation)$/i
    .test(text)
    || /^(?:diagnostic test reference interpretation|red flag interpretation|management implication|focused history question|linked workup item|differential frame interpretation)$/i
      .test(normalized);
}

function stripInterpretationCautionDisplayPrefix(label = "") {
  return String(label || "")
    .replace(/^interpretation caution\s*[-:]\s*/i, "")
    .trim();
}

function limitationCautionLabelKey(label = "") {
  return normalizeEvidenceLabel(label)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limitationCautionLabelLooksSpecific(label = "") {
  const text = stripInterpretationCautionDisplayPrefix(label);
  return Boolean(text)
    && !genericLimitationCautionBaseLabel(text)
    && !/[,:;]\s*$/.test(text)
    && !/\.\.\.$/.test(text);
}

function limitationCautionSpecificCandidates(caution = {}) {
  return [
    caution.diagnosticTarget,
    caution.diagnostic_target,
    caution.managementImplication,
    caution.management_implication,
    caution.managementChange,
    caution.management_change,
    caution.reason,
    caution.limitation,
    caution.interpretationCaution,
    caution.limitations,
    caution.source,
    caution.evidence?.source,
    caution.linkedExamId,
    caution.exam_id,
    caution.traceability?.item_id
  ];
}

function limitationCautionSpecificBaseLabel(caution = {}) {
  const rawBase = stripInterpretationCautionDisplayPrefix(caution.label || "");
  if (limitationCautionLabelLooksSpecific(rawBase)) {
    return rawBase;
  }
  return limitationCautionSpecificCandidates(caution)
    .map((candidate) => compactLimitationCautionLabel(candidate, caution.role || ""))
    .find((candidate) => limitationCautionLabelLooksSpecific(candidate))
    || rawBase
    || "linked workup item";
}

function limitationCautionDifferentiator(caution = {}, baseLabel = "") {
  const baseKey = limitationCautionLabelKey(stripInterpretationCautionDisplayPrefix(baseLabel));
  return limitationCautionSpecificCandidates(caution)
    .map((candidate) => compactLimitationCautionLabel(candidate, caution.role || ""))
    .find((candidate) => {
      const key = limitationCautionLabelKey(candidate);
      return limitationCautionLabelLooksSpecific(candidate)
        && key
        && key !== baseKey
        && !baseKey.includes(key)
        && !key.includes(baseKey);
    })
    || compactLimitationCautionLabel(caution.linkedExamId || caution.exam_id || caution.traceability?.item_id || "", "")
    || "";
}

function limitationCautionStableSuffix(caution = {}) {
  return compactLimitationCautionLabel(caution.linkedExamId || caution.exam_id || caution.traceability?.item_id || "", "")
    || "linked item";
}

function uniquifyLimitationCautionLabels(cautions = []) {
  const prepared = cautions.map((caution) => ({
    caution,
    baseLabel: limitationCautionSpecificBaseLabel(caution)
  }));
  const baseCounts = new Map();
  prepared.forEach(({ baseLabel }) => {
    const key = limitationCautionLabelKey(baseLabel);
    if (!key) return;
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
  });
  const emitted = new Map();
  return prepared.map(({ caution, baseLabel }) => {
    const baseKey = limitationCautionLabelKey(baseLabel);
    let displayBase = baseLabel || "linked workup item";
    if ((baseCounts.get(baseKey) || 0) > 1 || genericLimitationCautionBaseLabel(displayBase)) {
      const differentiator = limitationCautionDifferentiator(caution, displayBase);
      if (differentiator && limitationCautionLabelKey(differentiator) !== baseKey) {
        const differentiatedLabel = `Interpretation caution - ${displayBase} - ${differentiator}`;
        displayBase = differentiatedLabel.length <= 140
          ? `${displayBase} - ${differentiator}`
          : `${displayBase} - ${limitationCautionStableSuffix(caution)}`;
      } else {
        displayBase = `${displayBase} - ${limitationCautionStableSuffix(caution)}`;
      }
    }
    let label = /^interpretation caution\b/i.test(displayBase)
      ? displayBase
      : `Interpretation caution - ${displayBase}`;
    let emittedKey = limitationCautionLabelKey(label);
    const priorCount = emitted.get(emittedKey) || 0;
    if (priorCount) {
      const stableSuffix = compactLimitationCautionLabel(caution.linkedExamId || caution.exam_id || caution.traceability?.item_id || `item ${priorCount + 1}`, "");
      label = `${label} - ${stableSuffix}`;
      emittedKey = limitationCautionLabelKey(label);
    }
    emitted.set(emittedKey, (emitted.get(emittedKey) || 0) + 1);
    return { ...caution, label };
  });
}

function limitationCautionFromEntry(entry = {}) {
  const candidate = entry.candidate || {};
  const LR_plus = candidate.LR_plus || entry.LR_plus || entry.evidence?.LR_plus || "";
  const LR_minus = candidate.LR_minus || entry.LR_minus || entry.evidence?.LR_minus || "";
  const limitation = entry.limitations
    || entry.interpretationCautions
    || displayLimitationsForCandidate(candidate)
    || "";
  if (!String(limitation || "").trim() || /^(?:n\/a|na|none|not applicable)$/i.test(String(limitation).trim())) {
    return null;
  }
  const traceability = recommendationTraceability(entry, entry.validatedIntentTrace || []);
  const tags = unique([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ]);
  const label = limitationCautionDisplayLabel(entry, candidate);
  return {
    id: `${entry.exam_id || candidate.exam_id || "limitation"}-interpretation-caution`,
    label,
    limitation,
    interpretationCaution: limitation,
    diagnosticTarget: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    source: candidateSourceLabel(candidate),
    LR_plus,
    LR_minus,
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source: candidateSourceLabel(candidate),
      LR_plus,
      LR_minus,
      tier: candidate.evidence_tier || ""
    }, candidate, candidate.item_type),
    tags,
    linkedExamId: entry.exam_id || candidate.exam_id || "",
    role: entry.role || "",
    validatedIntentIds: traceability.intent_ids,
    traceability
  };
}

function limitationsAndInterpretationCautionsFromEntries(entries = []) {
  const cautions = [];
  const seen = new Set();
  entries.forEach((entry) => {
    const caution = limitationCautionFromEntry(entry);
    if (!caution) {
      return;
    }
    const key = limitationCautionKey(caution);
    if (!key || seen.has(key)) {
      return;
    }
    cautions.push(caution);
    seen.add(key);
  });
  return uniquifyLimitationCautionLabels(cautions).slice(0, 32);
}

function evidenceMetadataKey(metadata = {}) {
  return normalizeEvidenceLabel([
    metadata.label,
    metadata.source,
    metadata.evidence?.LR_plus,
    metadata.evidence?.LR_minus,
    metadata.linkedExamId
  ].filter(Boolean).join(" "));
}

function evidenceMetadataFromEntry(entry = {}) {
  const candidate = entry.candidate || {};
  const source = candidateSourceLabel(candidate);
  const LR_plus = candidate.LR_plus || entry.LR_plus || entry.evidence?.LR_plus || "";
  const LR_minus = candidate.LR_minus || entry.LR_minus || entry.evidence?.LR_minus || "";
  const traceability = recommendationTraceability(entry, entry.validatedIntentTrace || []);
  const tags = unique([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags)
  ]);
  const label = isHistoryQuestionEntry(entry)
    ? (entry.displayBedsideQuestion || candidate.bedside_question_label || candidate.examLabel || candidate.exam_id)
    : (entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id);
  return {
    id: `${entry.exam_id || candidate.exam_id || "evidence"}-evidence-metadata`,
    label,
    source,
    sourceIds: traceSourceIdArray(
      candidate.source?.source_id,
      candidate.evidence_source_primary,
      traceability.source_ids || []
    ),
    citation: candidate.source_citation || candidate.source?.citation || "",
    diagnosticTarget: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    LR_plus,
    LR_minus,
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source,
      LR_plus,
      LR_minus,
      tier: candidate.evidence_tier || ""
    }, candidate, candidate.item_type),
    retrievalRoute: (candidate.retrievalRoutes || []).join("+"),
    score: Math.round(candidate.score || entry.score || 0),
    contextFitScore: entry.contextFitScore ?? "",
    tags,
    linkedExamId: entry.exam_id || candidate.exam_id || "",
    validatedIntentIds: traceability.intent_ids,
    traceability
  };
}

function evidenceAndLikelihoodMetadataFromEntries(entries = []) {
  const metadataRows = [];
  const seen = new Set();
  entries.forEach((entry) => {
    const metadata = evidenceMetadataFromEntry(entry);
    const key = evidenceMetadataKey(metadata);
    if (!key || seen.has(key)) {
      return;
    }
    metadataRows.push(metadata);
    seen.add(key);
  });
  return metadataRows.slice(0, 48);
}

function sectionRecommendationEntries(coreItems = [], conditionalItems = []) {
  const recommendedEntries = [...coreItems, ...conditionalItems];
  const corePhysicalExamManeuvers = coreItems.filter((entry) => !isNonExamWorkupEntry(entry));
  const conditionalPhysicalExamManeuvers = conditionalItems.filter((entry) => !isNonExamWorkupEntry(entry));
  const basicSafetyChecks = recommendedEntries.filter(isBasicSafetyCheckEntry);
  const redFlagsAndEscalationCues = recommendedEntries.filter(isRedFlagEntry);
  const initialTestsAndReferenceThresholds = recommendedEntries.filter(isDiagnosticTestEntry);
  const evidenceRows = evidenceAndLikelihoodMetadataFromEntries(recommendedEntries);
  const focusedHistoryQuestions = focusedHistoryQuestionsFromEntries([
    ...coreItems.filter(isHistoryQuestionEntry),
    ...conditionalItems.filter(isHistoryQuestionEntry),
    ...corePhysicalExamManeuvers,
    ...conditionalPhysicalExamManeuvers,
    ...basicSafetyChecks.filter(safetyEntryCanContributeHistory)
  ]);
  return {
    basicSafetyChecks,
    focusedHistoryQuestions,
    redFlagsAndEscalationCues,
    initialTestsAndReferenceThresholds,
    managementChangingFindings: managementChangingFindingsFromEntries(recommendedEntries),
    limitationsAndInterpretationCautions: limitationsAndInterpretationCautionsFromEntries(recommendedEntries),
    evidenceAndLikelihoodMetadata: evidenceRows,
    evidenceMetadata: evidenceRows,
    corePhysicalExamManeuvers,
    conditionalPhysicalExamManeuvers
  };
}

const setupOrProcessPattern = /\b(?:setup|stethoscope cleaned|cleaned|draping|positioning|before patient contact|hygiene)\b/;
const bundledPhysicalExamLabelPattern = /[,;]|\b(?:and|plus)\b.*\b(?:and|plus)\b/;
const vaguePhysicalExamLabelPattern = /\b(?:screen|assessment|survey)\b/;
const allowedPairedAtomicExamLabelPattern = /\b(?:sclerae and conjunctivae)\b/;
const physicalExamConceptFamilies = [
  { id: "neuro", pattern: /\b(?:strength|gait|reflex|tremor|sensation|cranial|pupil|visual|ataxia|babinski|pronator)\b/ },
  { id: "cardiopulmonary", pattern: /\b(?:heart|lung|breath|respiratory|jvp|edema|pulse|pulses|perfusion|wheeze|crackle)\b/ },
  { id: "abdomen_gu", pattern: /\b(?:abdomen|abdominal|bowel|murphy|rebound|cva|flank|urinary|pelvic|scrotal|testicular|saddle)\b/ },
  { id: "skin_msk", pattern: /\b(?:skin|hair|rash|wound|ulcer|joint|bone|spine|muscle|tenderness|range of motion)\b/ },
  { id: "heent_eye", pattern: /\b(?:mouth|oropharynx|sclera|conjunctiva|ear|nose|throat|eye|extraocular|otoscope)\b/ },
  { id: "endocrine", pattern: /\b(?:thyroid|goiter|hypocalcemia|hypercalcemia|acromegaly|cushing|hirsutism|gynecomastia)\b/ }
];

function physicalExamLabelAtomicityIssues(labelText = "") {
  const actionText = normalizeEvidenceText(labelText);
  const normalized = normalizeEvidenceLabel(labelText);
  if (!actionText) {
    return [];
  }
  const issues = [];
  if (!physicalExamActionVerbPattern.test(actionText)) {
    issues.push({
      type: "actionless_exam_label",
      detail: "Physical exam labels should be written as a concrete bedside action, such as inspect, palpate, auscultate, percuss, observe, test, check, or measure."
    });
  }
  if (vaguePhysicalExamLabelPattern.test(normalized)) {
    issues.push({
      type: "vague_or_bundled_exam_label",
      detail: "Physical exam labels should name a concrete bedside maneuver or finding, not a broad screen, assessment, or survey."
    });
  }
  const matchedFamilies = physicalExamConceptFamilies
    .filter((family) => family.pattern.test(normalized))
    .map((family) => family.id);
  if (matchedFamilies.length > 2) {
    issues.push({
      type: "multi_domain_exam_label",
      detail: `Physical exam labels should be atomic; this label spans ${matchedFamilies.join(", ")} concepts.`
    });
  }
  return issues;
}

function limitationContextMismatchIssues(entry = {}) {
  const candidate = entry.candidate || entry;
  const labelText = normalizeEvidenceLabel([
    entry.label,
    entry.domain,
    candidate.examLabel,
    candidate.maneuver,
    candidate.exam_id,
    candidate.base?.section,
    candidate.base?.region_or_subsection
  ].filter(Boolean).join(" "));
  const limitationText = normalizeEvidenceLabel([
    entry.limitations,
    entry.interpretationCautions,
    candidate.limitations,
    candidate.contraindications_or_limitations,
    candidate.base?.limitations,
    candidate.base?.contraindications_or_limitations
  ].filter(Boolean).join(" "));
  const issues = [];
  if (/\b(?:photophobia|ocular|eye drops|corneal|open globe|open-globe)\b/.test(limitationText)
    && !/\b(?:eye|eyes|vision|visual|pupil|pupils|ophthalmoscopic|fundoscopic|fundus|red reflex|extraocular|sclerae|conjunctivae|conjunctiva)\b/.test(labelText)) {
    issues.push({
      type: "mismatched_limitation_context",
      detail: "Eye-specific limitation text is attached to a non-eye physical exam maneuver."
    });
  }
  if (/\bguarding\b/.test(limitationText)
    && !/\b(?:abdom\w*|bowel|murphy|rebound|psoas|obturator|cva|liver|spleen|ruq|rlq|peritoneal)\b/.test(labelText)) {
    issues.push({
      type: "mismatched_limitation_context",
      detail: "Abdominal guarding limitation text is attached to a non-abdominal physical exam maneuver."
    });
  }
  return issues;
}

function validLikelihoodRatioValue(value) {
  return validEvidenceLikelihoodRatioValue(value);
}

function rawRecommendationSource(candidate = {}) {
  return [
    candidate.source?.source_id,
    candidate.evidence_source_primary,
    candidate.source_citation
  ].filter(Boolean).join("; ").trim();
}

function recommendationEntryText(entry = {}) {
  const candidate = entry.candidate || entry;
  return normalizeEvidenceLabel([
    entry.label,
    candidate.examLabel,
    candidate.maneuver,
    candidate.exam_id
  ].filter(Boolean).join(" "));
}

function recommendationEntryLabelText(entry = {}) {
  const candidate = entry.candidate || entry;
  return String(entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "").trim();
}

function qualityIssue(severity, type, section, entry, detail) {
  const candidate = entry.candidate || entry;
  return {
    severity,
    type,
    section,
    exam_id: candidate.exam_id || entry.exam_id || "",
    label: entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "",
    detail
  };
}

function lintRecommendationEntry(entry, section) {
  const candidate = entry.candidate || entry;
  const labelText = recommendationEntryText(entry);
  const issues = [];
  if ((section === "corePhysicalExamManeuvers" || section === "conditionalPhysicalExamManeuvers") && isBasicSafetyCheckEntry(entry)) {
    issues.push(qualityIssue("high", "safety_check_in_exam_section", section, entry, "Basic bedside data or safety checks must not be presented as physical exam maneuvers."));
  }
  if (setupOrProcessPattern.test(labelText)) {
    issues.push(qualityIssue("high", "setup_or_process_row", section, entry, "Technique/setup/process rows cannot be user-facing workup recommendations."));
  }
  const labelOnlyText = recommendationEntryLabelText(entry);
  if ((section === "corePhysicalExamManeuvers" || section === "conditionalPhysicalExamManeuvers") && bundledPhysicalExamLabelPattern.test(labelOnlyText)) {
    issues.push(qualityIssue("high", "possibly_bundled_label", section, entry, "Physical exam labels must be atomic; bundled exam clusters cannot be promoted as recommended maneuvers."));
  }
  if (section === "corePhysicalExamManeuvers" || section === "conditionalPhysicalExamManeuvers") {
    for (const atomicityIssue of physicalExamLabelAtomicityIssues(labelOnlyText)) {
      issues.push(qualityIssue("high", atomicityIssue.type, section, entry, atomicityIssue.detail));
    }
    for (const mismatchIssue of limitationContextMismatchIssues(entry)) {
      issues.push(qualityIssue("high", mismatchIssue.type, section, entry, mismatchIssue.detail));
    }
  }
  if (!rawRecommendationSource(candidate)) {
    issues.push(qualityIssue("high", "missing_source", section, entry, "Recommended items must be traceable to an evidence source, accepted review, or catalog gap source."));
  }
  if (!validLikelihoodRatioValue(candidate.LR_plus)) {
    issues.push(qualityIssue("high", "invalid_lr_plus", section, entry, "LR+ must be blank, n/a, or a sourced numeric/range value."));
  }
  if (!validLikelihoodRatioValue(candidate.LR_minus)) {
    issues.push(qualityIssue("high", "invalid_lr_minus", section, entry, "LR- must be blank, n/a, or a sourced numeric/range value."));
  }
  if (!entry.evidence?.likelihood_ratio_note && (entry.evidence || candidate.LR_plus !== undefined || candidate.LR_minus !== undefined)) {
    issues.push(qualityIssue("medium", "missing_likelihood_ratio_note", section, entry, "Recommended items should explain whether LR values are quantitative, unavailable, or not applicable."));
  }
  const diagnosticTarget = entry.displayDiagnosticTarget || candidate.diagnostic_target || "";
  const management = entry.displayManagement || candidate.result_changes_management || candidate.management_link || "";
  if (!diagnosticTarget) {
    issues.push(qualityIssue("medium", "missing_diagnostic_target", section, entry, "Recommended items should state what finding or diagnostic target they assess."));
  }
  if (!management) {
    issues.push(qualityIssue("medium", "missing_management_change", section, entry, "Recommended items should state what result changes management."));
  }
  if (!candidate.difficulty || !candidate.time_burden_minutes || !candidate.equipment_needed || !candidate.patient_cooperation_required) {
    issues.push(qualityIssue("medium", "missing_feasibility_metadata", section, entry, "Recommended items should include difficulty, time burden, equipment, and patient cooperation metadata."));
  }
  if (section === "corePhysicalExamManeuvers" || section === "conditionalPhysicalExamManeuvers") {
    if (!(entry.technique || displayTechniqueForCandidate(candidate))) {
      issues.push(qualityIssue("medium", "missing_exam_technique", section, entry, "Physical exam recommendations must state the bedside technique or maneuver to perform."));
    }
    if (!(entry.whenToUse || displayWhenToUseForCandidate(candidate))) {
      issues.push(qualityIssue("medium", "missing_when_to_use", section, entry, "Physical exam recommendations must state when the item is clinically relevant."));
    }
    if (!(entry.limitations || entry.interpretationCautions || displayLimitationsForCandidate(candidate))) {
      issues.push(qualityIssue("medium", "missing_limitations", section, entry, "Physical exam recommendations must include limitations or interpretation cautions."));
    }
  }
  return issues;
}

function lintHistoryQuestion(question, section = "focusedHistoryQuestions") {
  const issues = [];
  const text = normalizeEvidenceLabel(question.text || "");
  if (!text) {
    issues.push({ severity: "high", type: "missing_history_question", section, label: "", detail: "Focused history questions must include question text." });
  }
  const answerOptions = Array.isArray(question.options)
    ? question.options.filter((option) => String(option?.label || option?.value || option || "").trim())
    : String(question.options || question.answer_options || question.answerOptions || "").split(/\s+\/\s+|[;|]/).filter((option) => option.trim());
  if (!answerOptions.length) {
    issues.push({ severity: "high", type: "missing_history_options", section, label: question.text || "", detail: "Focused history questions must include structured answer options so bedside responses are auditable." });
  }
  if (!question.source || /source pending/i.test(question.source)) {
    issues.push({ severity: "high", type: "missing_history_source", section, label: question.text || "", detail: "Focused history questions must be traceable to an evidence source or validated catalog item." });
  }
  if (!question.evidence?.likelihood_ratio_note && !question.likelihood_ratio_note) {
    issues.push({ severity: "medium", type: "missing_history_likelihood_ratio_note", section, label: question.text || "", detail: "Focused history questions must explain whether question-level LR values are available, unavailable, or not applicable." });
  }
  if (!question.diagnosticPurpose) {
    issues.push({ severity: "medium", type: "missing_history_diagnostic_purpose", section, label: question.text || "", detail: "Focused history questions should state their diagnostic purpose." });
  }
  if (!question.managementImplication) {
    issues.push({ severity: "medium", type: "missing_history_management_change", section, label: question.text || "", detail: "Focused history questions should state what answer changes management." });
  }
  if (!Array.isArray(question.tags) || !question.tags.length) {
    issues.push({ severity: "medium", type: "missing_history_tags", section, label: question.text || "", detail: "Focused history questions should preserve retrieval/evidence tags." });
  }
  if (historyQuestionNeedsDetailPrompts(question.text || "") && !(question.detail_prompts || []).length) {
    issues.push({ severity: "high", type: "missing_history_detail_prompts", section, label: question.text || "", detail: "Broad focused history questions must expose concrete detail prompts so the source-backed question is clinically actionable at bedside." });
  }
  return issues;
}

function lintManagementChangingFinding(finding, section = "managementChangingFindings") {
  const issues = [];
  if (!finding.label) {
    issues.push({ severity: "high", type: "missing_management_finding_label", section, label: "", detail: "Management-changing findings must name the question, safety check, or exam finding." });
  }
  if (!finding.managementChange) {
    issues.push({ severity: "high", type: "missing_management_change", section, label: finding.label || "", detail: "Management-changing findings must state what changes management." });
  }
  if (!finding.source || /source pending/i.test(finding.source)) {
    issues.push({ severity: "high", type: "missing_management_source", section, label: finding.label || "", detail: "Management-changing findings must be source-traceable." });
  }
  if (!finding.traceability?.intent_ids?.length) {
    issues.push({ severity: "high", type: "missing_management_traceability", section, label: finding.label || "", detail: "Management-changing findings must trace to a validated intent or staged catalog gap." });
  }
  if (!Array.isArray(finding.tags) || !finding.tags.length) {
    issues.push({ severity: "medium", type: "missing_management_tags", section, label: finding.label || "", detail: "Management-changing findings should preserve retrieval/evidence tags." });
  }
  return issues;
}

function lintLimitationCaution(caution, section = "limitationsAndInterpretationCautions") {
  const issues = [];
  if (!caution.label) {
    issues.push({ severity: "high", type: "missing_limitation_label", section, label: "", detail: "Limitations and interpretation cautions must name the linked question, safety check, or exam." });
  }
  if (!caution.limitation && !caution.interpretationCaution) {
    issues.push({ severity: "high", type: "missing_limitation_text", section, label: caution.label || "", detail: "Limitations and interpretation cautions must state the limitation or caution." });
  }
  if (!caution.source || /source pending/i.test(caution.source)) {
    issues.push({ severity: "high", type: "missing_limitation_source", section, label: caution.label || "", detail: "Limitations and interpretation cautions must be source-traceable." });
  }
  if (!caution.traceability?.intent_ids?.length) {
    issues.push({ severity: "high", type: "missing_limitation_traceability", section, label: caution.label || "", detail: "Limitations and interpretation cautions must trace to a validated intent or staged catalog gap." });
  }
  if (!Array.isArray(caution.tags) || !caution.tags.length) {
    issues.push({ severity: "medium", type: "missing_limitation_tags", section, label: caution.label || "", detail: "Limitations and interpretation cautions should preserve retrieval/evidence tags." });
  }
  return issues;
}

function lintEvidenceLikelihoodMetadata(metadata, section = "evidenceAndLikelihoodMetadata") {
  const issues = [];
  if (!metadata.label) {
    issues.push({ severity: "high", type: "missing_evidence_label", section, label: "", detail: "Evidence/LR metadata rows must name the linked question, safety check, or exam." });
  }
  if (!metadata.source || /source pending/i.test(metadata.source)) {
    issues.push({ severity: "high", type: "missing_evidence_source", section, label: metadata.label || "", detail: "Evidence/LR metadata rows must include source metadata." });
  }
  if (!metadata.evidence || !Object.prototype.hasOwnProperty.call(metadata.evidence, "LR_plus") || !Object.prototype.hasOwnProperty.call(metadata.evidence, "LR_minus")) {
    issues.push({ severity: "high", type: "missing_likelihood_ratio_fields", section, label: metadata.label || "", detail: "Evidence/LR metadata rows must carry LR+ and LR- fields, even when n/a." });
  }
  if (metadata.evidence && !validLikelihoodRatioValue(metadata.evidence.LR_plus)) {
    issues.push({ severity: "high", type: "invalid_evidence_lr_plus", section, label: metadata.label || "", detail: "Evidence/LR metadata LR+ must be blank, n/a, or a sourced numeric/range value." });
  }
  if (metadata.evidence && !validLikelihoodRatioValue(metadata.evidence.LR_minus)) {
    issues.push({ severity: "high", type: "invalid_evidence_lr_minus", section, label: metadata.label || "", detail: "Evidence/LR metadata LR- must be blank, n/a, or a sourced numeric/range value." });
  }
  if (!metadata.evidence?.likelihood_ratio_note) {
    issues.push({ severity: "medium", type: "missing_likelihood_ratio_note", section, label: metadata.label || "", detail: "Evidence/LR metadata must explain whether LR values are quantitative, unavailable, or not applicable." });
  }
  if (!metadata.traceability?.intent_ids?.length) {
    issues.push({ severity: "high", type: "missing_evidence_traceability", section, label: metadata.label || "", detail: "Evidence/LR metadata rows must trace to a validated intent or staged catalog gap." });
  }
  if (!Array.isArray(metadata.tags) || !metadata.tags.length) {
    issues.push({ severity: "medium", type: "missing_evidence_tags", section, label: metadata.label || "", detail: "Evidence/LR metadata rows should preserve retrieval/evidence tags." });
  }
  return issues;
}

function catalogGapReviewKey(gap = {}) {
  return normalizeEvidenceLabel([
    gap.gapId,
    gap.label,
    gap.rationale
  ].filter(Boolean).join(" "));
}

function catalogGapRegistryScore(row = {}, context = "", profile = {}) {
  const text = normalizeEvidenceText([
    row.case_id,
    row.activation_condition,
    row.rationale,
    row.gap_label
  ].filter(Boolean).join(" "));
  const contextText = normalizeEvidenceText([
    context,
    profile.id,
    profile.name
  ].filter(Boolean).join(" "));
  let score = 0;
  if (row.case_id && contextText.includes(normalizeEvidenceText(row.case_id))) {
    score += 12;
  }
  normalizeEvidenceText(row.activation_condition || "")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .forEach((token) => {
      if (contextText.includes(token)) {
        score += 1;
      }
    });
  if (profile.id && text.includes(normalizeEvidenceText(profile.id))) {
    score += 4;
  }
  if (profile.name && text.includes(normalizeEvidenceText(profile.name))) {
    score += 3;
  }
  return score;
}

function catalogGapRegistryRowForGap(gapId = "", registryRows = [], context = "", profile = {}) {
  const id = String(gapId || "").trim();
  if (!id) {
    return null;
  }
  const matches = (registryRows || []).filter((row) => row.gap_exam_id === id || row.exam_id === id);
  if (!matches.length) {
    return null;
  }
  return matches
    .map((row, index) => ({ row, index, score: catalogGapRegistryScore(row, context, profile) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].row;
}

function catalogGapReviewFromEntry(entry = {}, intentTrace = []) {
  const candidate = entry.candidate || {};
  const isRecommendationEntry = Boolean(entry.candidate || entry.traceability || candidate.exam_id);
  const gapId = candidate.exam_id
    || entry.exam_id
    || entry.gap_exam_id
    || entry.gap_id
    || "";
  const label = entry.label
    || candidate.examLabel
    || candidate.maneuver
    || entry.gap_label
    || entry.suggested_checklist_label
    || entry.maneuver_or_finding
    || gapId;
  const traceability = isRecommendationEntry
    ? recommendationTraceability(entry, entry.validatedIntentTrace || intentTrace)
    : {
        intent_ids: intentTrace.map((trace) => trace.intent_id),
        intent_labels: intentTrace.map((trace) => trace.label),
        source_ids: splitEvidenceList(entry.source_ids || entry.evidence_source_primary || ""),
        evidence_row_id: gapId,
        catalog_gap: true,
        gap_type: entry.gap_type || entry.item_type || "exam_maneuver",
        gap_review_status: entry.review_status || entry.catalog_gap_review_status || "staged_gap",
        authorized_by: "staged_catalog_gap"
      };
  const sourceIds = unique([
    ...splitEvidenceList(entry.source_ids || ""),
    ...splitEvidenceList(entry.catalog_gap_source_ids || ""),
    ...splitEvidenceList(candidate.evidence_source_primary || ""),
    ...splitEvidenceList(candidate.catalog_gap_source_ids || ""),
    candidate.source?.source_id,
    ...splitEvidenceList((traceability.source_ids || []).join(";"))
  ].filter(Boolean));
  const tags = unique([
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    ...splitEvidenceList(candidate.retrieval_tags),
    ...splitEvidenceList(entry.activation_condition || ""),
    entry.case_id,
    entry.gap_type
  ].filter(Boolean));
  return {
    id: `${gapId || "catalog-gap"}-review`,
    gapId,
    label,
    gapType: entry.gap_type || entry.item_type || candidate.gap_type || candidate.item_type || "exam_maneuver",
    reviewStatus: entry.review_status || entry.catalog_gap_review_status || candidate.catalog_gap_review_status || traceability.gap_review_status || "staged_gap",
    reviewOwner: entry.review_owner || entry.catalog_gap_review_owner || candidate.catalog_gap_review_owner || "clinical_content_lead",
    lastReviewed: entry.last_reviewed || entry.catalog_gap_last_reviewed || candidate.catalog_gap_last_reviewed || "",
    rationale: entry.catalog_gap_rationale || entry.rationale || entry.reason || candidate.catalog_gap_rationale || candidate.result_changes_management || "Required by a validated clinical bundle or local gap registry but not yet promoted to accepted evidence.",
    activationCondition: entry.catalog_gap_activation_condition || entry.activation_condition || entry.when_to_use_structured || candidate.catalog_gap_activation_condition || candidate.when_to_use_structured || "",
    resolutionPlan: entry.planned_resolution || entry.catalog_gap_resolution_plan || candidate.catalog_gap_resolution_plan || "Review source-specific technique, limitations, evidence, and feasibility before promotion.",
    source: entry.catalog_gap_source_citation || entry.source_citation || candidate.catalog_gap_source_citation || candidate.source_citation || sourceIds.join("; ") || "selected validated-intent source metadata",
    sourceIds,
    evidence: evidenceMetadataWithLikelihoodRatioNote({
      source: entry.catalog_gap_source_citation || entry.source_citation || candidate.catalog_gap_source_citation || candidate.source_citation || sourceIds.join("; ") || "",
      LR_plus: entry.LR_plus || candidate.LR_plus || "",
      LR_minus: entry.LR_minus || candidate.LR_minus || "",
      tier: entry.evidence_tier || candidate.evidence_tier || "staged_gap"
    }, candidate.item_type || candidate.gap_type ? candidate : entry, entry.gap_type || entry.item_type || candidate.gap_type || candidate.item_type),
    tags,
    linkedExamId: gapId,
    validatedIntentIds: traceability.intent_ids || [],
    traceability: {
      ...traceability,
      catalog_gap: true,
      gap_type: traceability.gap_type || entry.gap_type || entry.item_type || candidate.gap_type || candidate.item_type || "exam_maneuver",
      gap_review_status: traceability.gap_review_status || entry.review_status || candidate.catalog_gap_review_status || "staged_gap",
      authorized_by: "staged_catalog_gap"
    }
  };
}

function catalogGapsNeedingReviewFromEntries(gaps = [], intentTrace = []) {
  const normalized = [];
  const seen = new Set();
  gaps.forEach((gap) => {
    if (!isStagedCatalogGapDefinition(gap)) {
      return;
    }
    const review = catalogGapReviewFromEntry(gap, intentTrace);
    const key = catalogGapReviewKey(review);
    if (!key || seen.has(key)) {
      return;
    }
    normalized.push(review);
    seen.add(key);
  });
  return normalized;
}

function workupGapSlug(value = "") {
  return normalizeEvidenceText(value || "")
    .replace(/_v\d+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "validated-intent";
}

function generatedCompletenessGapId(trace = {}, suffix = "") {
  return `GAP-${workupGapSlug(trace.intent_id || trace.label)}-${suffix}`;
}

function generatedWorkupCompletenessGap(trace = {}, definition = {}) {
  const sourceIds = unique([
    ...(trace.source_ids || []),
    "AHRQ_CALIBRATE_DX"
  ].filter(Boolean));
  const sourceCitation = sourceIds.join("; ") || "selected validated-intent source metadata";
  const gapId = generatedCompletenessGapId(trace, definition.suffix);
  const tags = unique([
    "workup_completeness_gap",
    definition.gapType,
    ...(trace.evidence_tags || []),
    ...(trace.clinical_bundle_ids || [])
  ].filter(Boolean));
  return {
    exam_id: gapId,
    gap_exam_id: gapId,
    gap_id: gapId,
    label: definition.label,
    gap_label: definition.label,
    item_type: definition.gapType,
    gap_type: definition.gapType,
    review_status: "staged_gap",
    catalog_gap_review_status: "staged_gap",
    review_owner: trace.review_owner || "clinical_content_lead",
    catalog_gap_review_owner: trace.review_owner || "clinical_content_lead",
    last_reviewed: trace.last_reviewed || "2026-06-07",
    catalog_gap_last_reviewed: trace.last_reviewed || "2026-06-07",
    source_ids: sourceIds.join("; "),
    catalog_gap_source_ids: sourceIds.join("; "),
    source_citation: sourceCitation,
    catalog_gap_source_citation: sourceCitation,
    reason: definition.reason(trace),
    rationale: definition.reason(trace),
    catalog_gap_rationale: definition.reason(trace),
    activation_condition: `Selected validated intent: ${trace.label || trace.intent_id}; bundles ${(trace.clinical_bundle_ids || []).join("; ") || "none"}`,
    catalog_gap_activation_condition: `Selected validated intent: ${trace.label || trace.intent_id}; bundles ${(trace.clinical_bundle_ids || []).join("; ") || "none"}`,
    planned_resolution: definition.resolutionPlan(trace),
    catalog_gap_resolution_plan: definition.resolutionPlan(trace),
    matchedTags: tags,
    retrievalTags: tags,
    traceability: {
      intent_ids: [trace.intent_id].filter(Boolean),
      intent_labels: [trace.label].filter(Boolean),
      clinical_bundle_ids: trace.clinical_bundle_ids || [],
      source_ids: sourceIds,
      knowledge_pack_id: trace.knowledge_pack_id || "",
      evidence_row_id: gapId,
      catalog_gap: true,
      gap_type: definition.gapType,
      gap_review_status: "staged_gap",
      authorized_by: "staged_catalog_gap",
      generated_completeness_gap: true
    }
  };
}

function recommendationKnowledgePackIds(entry = {}) {
  const candidate = entry.candidate || {};
  const retrievalRoutes = [
    ...traceArray(entry.retrievalRoutes),
    ...traceArray(candidate.retrievalRoutes)
  ];
  const fingerprint = String(entry.base_row_fingerprint || candidate.base_row_fingerprint || "").trim();
  if (!retrievalRoutes.includes("activated_knowledge_pack") && !/^knowledge-pack:/i.test(fingerprint)) {
    return [];
  }
  return unique([
    ...traceArray(entry.knowledge_pack_id),
    ...traceArray(candidate.knowledge_pack_id),
    ...traceArray(entry.traceability?.knowledge_pack_id),
    ...traceArray(candidate.traceability?.knowledge_pack_id)
  ]);
}

function workupSectionText(sectionedWorkup = {}, sectionNames = []) {
  return sectionNames
    .flatMap((sectionName) => sectionedWorkup[sectionName] || [])
    .map((entry) => [
      entry.label,
      entry.text,
      entry.options,
      entry.domain,
      entry.reason,
      entry.rationale,
      entry.diagnosticTarget,
      entry.displayDiagnosticTarget,
      entry.management,
      entry.displayManagement,
      entry.managementImplication,
      entry.bedsideQuestion,
      entry.bedsideQuestionOptions,
      entry.source,
      entry.source_citation,
      entry.traceability?.item_id
    ].filter(Boolean).join(" "))
    .join(" | ");
}

function workupHas(sectionedWorkup = {}, sectionNames = [], pattern) {
  return pattern.test(workupSectionText(sectionedWorkup, sectionNames));
}

function traceHasBundle(trace = {}, bundleId = "") {
  return (trace.clinical_bundle_ids || []).includes(bundleId);
}

function traceIsIntent(trace = {}, intentId = "") {
  return trace.intent_id === intentId;
}

const requiredDomainCoverageDefinitions = [
  {
    suffix: "infection-source-history",
    gapType: "history_question",
    label: "Fever source-localizing infection history needs review",
    applies: (trace) => traceIsIntent(trace, "fever_sepsis_v1") || traceHasBundle(trace, "infection_sepsis"),
    isMissing: (sectionedWorkup) => !(
      workupHas(sectionedWorkup, ["focusedHistoryQuestions"], /\b(?:cough|sputum|dyspnea|pleuritic|shortness)/i)
      && workupHas(sectionedWorkup, ["focusedHistoryQuestions"], /\b(?:dysuria|flank|urinary|urine)/i)
      && workupHas(sectionedWorkup, ["focusedHistoryQuestions"], /\b(?:rash|wound|line|skin|neck stiffness|photophobia|abdominal|diarrhea|vomiting)/i)
      && workupHas(sectionedWorkup, ["focusedHistoryQuestions"], /\b(?:host|exposure|immunosuppression|pregnancy|travel|sick contacts)/i)
    ),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must keep source-localizing infection history visible, including respiratory, urinary/flank, skin/line, abdominal/GI, and CNS danger prompts. A fever workup is not clinically complete if it only asks generic fever questions.`,
    resolutionPlan: (trace) => `Add or restore a reviewed source-localizing fever history question with concrete respiratory, urinary/flank, skin/line, abdominal/GI, CNS, severity, management, source IDs, LR note, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "infection-host-exposure-history",
    gapType: "history_question",
    label: "Fever host-risk and exposure history needs review",
    applies: (trace) => traceIsIntent(trace, "fever_sepsis_v1") || traceHasBundle(trace, "infection_sepsis"),
    isMissing: (sectionedWorkup) => !workupHas(sectionedWorkup, ["focusedHistoryQuestions"], /\b(?:immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|line|device|travel|animal|food|water|sick contact|new medication)/i),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must ask host-risk and exposure questions because fever interpretation changes substantially with immunocompromise, pregnancy, healthcare exposure, indwelling devices, travel/vector exposure, animal/food/water exposure, sick contacts, and drug-fever mimics.`,
    resolutionPlan: (trace) => `Add or restore reviewed host-risk and exposure history with options, diagnostic purpose, management implications, source IDs, LR note, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "infection-lung-exam",
    gapType: "exam_maneuver",
    label: "Fever respiratory source lung exam needs review",
    applies: (trace) => traceIsIntent(trace, "fever_sepsis_v1") || traceHasBundle(trace, "infection_sepsis"),
    isMissing: (sectionedWorkup) => !workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:posterior lung sounds|lung sounds|auscultate .*lung|breath sounds|work of breathing)/i),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must keep a respiratory source exam visible. Fever can be pneumonia or respiratory viral infection even without an obvious source, so lung sounds and work-of-breathing assessment cannot disappear from the recommended bedside exam.`,
    resolutionPlan: (trace) => `Add or restore an atomic lung-sounds/work-of-breathing maneuver with findings, technique, source IDs, LR note, management implications, feasibility, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "infection-skin-heent-source-exam",
    gapType: "exam_maneuver",
    label: "Fever skin/HEENT source exam needs review",
    applies: (trace) => traceIsIntent(trace, "fever_sepsis_v1") || traceHasBundle(trace, "infection_sepsis"),
    isMissing: (sectionedWorkup) => !(
      workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:skin source|skin inspection|wound|line-site|cellulitis|rash)/i)
      && workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:mouth exam|oropharynx|pharynx|throat|oral|dental)/i)
    ),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must inspect common visible infection sources. A fever workup should not stop at cardiopulmonary maneuvers; skin/wound/line and HEENT/oral source checks are part of the minimum source screen.`,
    resolutionPlan: (trace) => `Add or restore atomic skin/wound/line and HEENT/oropharyngeal source maneuvers with technique, options, source IDs, LR notes, management implications, feasibility, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "infection-source-directed-tests",
    gapType: "diagnostic_test",
    label: "Fever source-directed testing pathway needs review",
    applies: (trace) => traceIsIntent(trace, "fever_sepsis_v1") || traceHasBundle(trace, "infection_sepsis"),
    isMissing: (sectionedWorkup) => !(
      workupHas(sectionedWorkup, ["initialTestsAndReferenceThresholds", "managementChangingFindings"], /\b(?:blood cultures|culture|lactate|cbc|cmp|creatinine)/i)
      && workupHas(sectionedWorkup, ["initialTestsAndReferenceThresholds", "managementChangingFindings"], /\b(?:chest imaging|chest x-ray|cxr|lung ultrasound|urinalysis|urine culture|viral testing|wound|line culture)/i)
    ),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must connect bedside source findings to source-directed testing. Fever recommendations are incomplete if they ask/source-screen but omit cultures, lactate or organ-dysfunction labs when sepsis is possible, respiratory testing/imaging, urinary testing, and wound/line testing when indicated.`,
    resolutionPlan: (trace) => `Add or restore reviewed source-directed infection studies with thresholds, indications, source IDs, management implications, limitations, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "dka-crisis-domains",
    gapType: "exam_maneuver",
    label: "DKA/HHS crisis bedside domains need review",
    applies: (trace) => traceIsIntent(trace, "dka_hhs_v1") || traceHasBundle(trace, "dka_hhs"),
    isMissing: (sectionedWorkup) => !(
      workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:respiratory pattern|kussmaul|work of breathing|respiratory)/i)
      && workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:mucous membranes|mouth exam|radial pulses|perfusion|skin turgor)/i)
      && workupHas(sectionedWorkup, ["basicSafetyChecks", "corePhysicalExamManeuvers"], /\b(?:mental status|confusion|somnolent|agitated)/i)
      && workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:abdominal palpation|abdomen|abdominal)/i)
    ),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must cover respiratory pattern/Kussmaul concern, volume/perfusion, mental status, and abdominal source/symptom assessment. DKA/HHS should not degrade into generic endocrine exam rows.`,
    resolutionPlan: (trace) => `Add or restore atomic DKA/HHS bedside maneuvers for respiratory pattern, mucous membranes/perfusion, mental status, abdomen, source triggers, management implications, source IDs, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    suffix: "pe-cardiorespiratory-dvt-domains",
    gapType: "exam_maneuver",
    label: "Suspected PE cardiopulmonary and DVT bedside domains need review",
    applies: (trace) => traceIsIntent(trace, "suspected_pe_v1") || traceHasBundle(trace, "suspected_pe"),
    isMissing: (sectionedWorkup) => !(
      workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:work of breathing|lung sounds|posterior lung|breath sounds|oxygen|respiratory)/i)
      && workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:heart sounds|radial pulses|jvp|perfusion|cardiac strain)/i)
      && workupHas(sectionedWorkup, ["corePhysicalExamManeuvers", "conditionalPhysicalExamManeuvers"], /\b(?:unilateral leg|leg swelling|dvt|lower extremity|calf|pedal pulses|dorsalis pedis|posterior tibial)/i)
    ),
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" must keep respiratory severity, cardiac strain/perfusion, and DVT leg exam domains visible. Suspected PE should not return abdominal, broad neuro, or generic cardiology rows while omitting DVT and respiratory findings.`,
    resolutionPlan: (trace) => `Add or restore atomic suspected-PE exam maneuvers for work of breathing/lung sounds, cardiac strain/perfusion, unilateral leg/DVT findings, source IDs, LR notes, management implications, feasibility, and regression tests for ${trace.label || trace.intent_id}.`
  }
];

export function auditRecommendedWorkupDomainCoverage(validatedIntentTrace = [], sectionedWorkup = {}) {
  const issues = [];
  validatedIntentTrace
    .filter((trace) => trace?.intent_id)
    .forEach((trace) => {
      requiredDomainCoverageDefinitions.forEach((definition) => {
        if (definition.applies && !definition.applies(trace, sectionedWorkup)) {
          return;
        }
        if (!definition.isMissing(sectionedWorkup, trace)) {
          return;
        }
        issues.push({
          ...definition,
          trace
        });
      });
    });
  return issues;
}

const workupCompletenessGapDefinitions = [
  {
    key: "diagnostic_tests",
    suffix: "diagnostic-tests",
    gapType: "diagnostic_test",
    label: "Diagnostic tests and reference thresholds need review",
    isMissing: (sectionedWorkup) => !(sectionedWorkup.initialTestsAndReferenceThresholds || []).length,
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" does not yet have source-specific initial tests or reference thresholds modeled in the local workup system. Do not infer that no tests are needed; stage this for guideline review before presenting a complete diagnostic workup.`,
    resolutionPlan: (trace) => `Add reviewed initial tests, reference ranges or action thresholds, source IDs, management implications, limitations, and gold-case tests for ${trace.label || trace.intent_id}.`
  },
  {
    key: "red_flags",
    suffix: "red-flags",
    gapType: "red_flag",
    label: "Red flags and escalation cues need review",
    isMissing: (sectionedWorkup) => !(sectionedWorkup.redFlagsAndEscalationCues || []).length,
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" does not yet have an explicit danger-cue/escalation section modeled in the local workup system. Do not imply there are no red flags; stage this for expert review before presenting the workup as complete.`,
    resolutionPlan: (trace) => `Add reviewed red flags, escalation triggers, source IDs, management implications, limitations, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    key: "focused_history_breadth",
    suffix: "focused-history",
    gapType: "history_question",
    label: "Focused history question enrichment needs review",
    isMissing: (sectionedWorkup) => (sectionedWorkup.focusedHistoryQuestions || []).length < 2,
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" currently has fewer than two focused history questions in the local workup system. Do not treat a single broad question as complete history coverage; stage additional source-, severity-, trigger-, and treatment-safety questions for review.`,
    resolutionPlan: (trace) => `Add at least one additional reviewed, source-specific focused history question with answer options, diagnostic purpose, management implication, source IDs, tags, LR note, and regression tests for ${trace.label || trace.intent_id}.`
  },
  {
    key: "conditional_exam_addons",
    suffix: "conditional-exam-addons",
    gapType: "exam_maneuver",
    label: "Conditional physical exam add-ons need review",
    applies: (trace) => Boolean(trace.knowledge_pack_id),
    isMissing: (sectionedWorkup, trace) => {
      const tracePackIds = traceArray(trace.knowledge_pack_id);
      if (!tracePackIds.length) {
        return !(sectionedWorkup.conditionalPhysicalExamManeuvers || []).length;
      }
      return !(sectionedWorkup.conditionalPhysicalExamManeuvers || []).some((entry) => (
        recommendationKnowledgePackIds(entry).some((packId) => tracePackIds.includes(packId))
      ));
    },
    reason: (trace) => `The validated intent "${trace.label || trace.intent_id}" does not yet have reviewed conditional physical exam add-ons modeled in the local workup system. Do not imply that the core exam is exhaustive for every modifier or complication; stage source-backed add-ons for review.`,
    resolutionPlan: (trace) => `Add reviewed conditional exam add-ons with trigger conditions, technique, finding options, diagnostic target, LR fields or LR limitation note, management implications, feasibility, source IDs, and regression tests for ${trace.label || trace.intent_id}.`
  }
];

function generatedWorkupCompletenessGaps(validatedIntentTrace = [], sectionedWorkup = {}, existingGaps = []) {
  const existingGapIds = new Set((existingGaps || []).map((gap) => stagedCatalogGapId(gap)).filter(Boolean));
  const generated = [];
  validatedIntentTrace
    .filter((trace) => trace?.intent_id)
    .forEach((trace) => {
      workupCompletenessGapDefinitions.forEach((definition) => {
        if (definition.applies && !definition.applies(trace, sectionedWorkup)) {
          return;
        }
        if (!definition.isMissing(sectionedWorkup, trace)) {
          return;
        }
        const gapId = generatedCompletenessGapId(trace, definition.suffix);
        if (existingGapIds.has(gapId)) {
          return;
        }
        generated.push(generatedWorkupCompletenessGap(trace, definition));
        existingGapIds.add(gapId);
      });
    });
  auditRecommendedWorkupDomainCoverage(validatedIntentTrace, sectionedWorkup).forEach((issue) => {
    const gapId = generatedCompletenessGapId(issue.trace, issue.suffix);
    if (existingGapIds.has(gapId)) {
      return;
    }
    generated.push(generatedWorkupCompletenessGap(issue.trace, issue));
    existingGapIds.add(gapId);
  });
  return generated;
}

function conditionalExamAddOnSectionStatus(validatedIntentTrace = [], sectionedWorkup = {}, catalogGapsNeedingReview = [], contextText = "") {
  const conditionalCount = (sectionedWorkup.conditionalPhysicalExamManeuvers || []).length;
  const traceIntentIds = unique(validatedIntentTrace.map((trace) => trace.intent_id).filter(Boolean));
  const traceIntentLabels = unique(validatedIntentTrace.map((trace) => trace.label).filter(Boolean));
  const traceBundleIds = unique(validatedIntentTrace.flatMap((trace) => trace.clinical_bundle_ids || []));
  const traceSourceIds = unique(validatedIntentTrace.flatMap((trace) => trace.source_ids || []));
  const baseTraceability = {
    intent_ids: traceIntentIds,
    intent_labels: traceIntentLabels,
    clinical_bundle_ids: traceBundleIds,
    source_ids: traceSourceIds,
    authorized_by: traceIntentIds.length ? "validated_clinical_intent" : "audit_only_unvalidated_context"
  };
  if (conditionalCount > 0) {
    return {
      status: "active_addons_present",
      label: "Conditional add-ons active",
      count: conditionalCount,
      reason: `${conditionalCount} conditional physical exam add-on${conditionalCount === 1 ? "" : "s"} activated from the selected validated intent, active modifiers, or source-specific trigger logic.`,
      traceability: baseTraceability
    };
  }
  const conditionalGapRows = (catalogGapsNeedingReview || []).filter((gap) => {
    const text = normalizeEvidenceLabel([
      gap.label,
      gap.gapLabel,
      gap.gapId,
      gap.gapType,
      gap.traceability?.gap_type,
      gap.traceability?.evidence_row_id,
      gap.resolutionPlan,
      gap.rationale
    ].filter(Boolean).join(" "));
    return /\bconditional\b/.test(text) && /\b(?:exam|maneuver|physical)\b/.test(text);
  });
  if (conditionalGapRows.length) {
    return {
      status: "staged_gaps_need_review",
      label: "Conditional add-ons need review",
      count: 0,
      gapCount: conditionalGapRows.length,
      reason: `${conditionalGapRows.length} conditional physical exam add-on gap${conditionalGapRows.length === 1 ? "" : "s"} need expert review before this section can be treated as complete.`,
      gapIds: conditionalGapRows.map((gap) => gap.gapId || gap.exam_id || gap.label).filter(Boolean),
      traceability: {
        ...baseTraceability,
        authorized_by: "staged_catalog_gap"
      }
    };
  }
  if (!traceIntentIds.length) {
    return {
      status: "audit_only_unvalidated_context",
      label: "Validated intent required",
      count: 0,
      reason: "No validated clinical intent selected; free text can support retrieval audit only and cannot authorize conditional add-on recommendations.",
      traceability: baseTraceability
    };
  }
  const modifierHint = normalizeEvidenceLabel(contextText).replace(/\s+/g, " ").trim();
  return {
    status: "none_active_for_current_context",
    label: "No conditional add-ons active",
    count: 0,
    reason: modifierHint
      ? "No patient modifier, source-specific symptom, or complication trigger activated a reviewed conditional physical exam add-on for this selected validated intent. The core exam remains the validated minimum for the current context."
      : "No patient modifier or source-specific trigger was supplied, so no reviewed conditional physical exam add-on is active. The core exam remains the validated minimum for the selected validated intent.",
    traceability: baseTraceability
  };
}

function lintCatalogGapReview(gap, section = "catalogGapsNeedingReview") {
  const issues = [];
  if (!gap.gapId || !/^GAP-/i.test(gap.gapId)) {
    issues.push({ severity: "high", type: "bad_catalog_gap_id", section, label: gap.label || "", detail: "Catalog gaps must remain staged GAP-* identifiers until promoted through review." });
  }
  if (!gap.reviewStatus || gap.reviewStatus !== "staged_gap") {
    issues.push({ severity: "high", type: "bad_catalog_gap_status", section, label: gap.label || "", detail: "Catalog gaps in recommendations must be visible as staged gaps, not validated evidence." });
  }
  if (!gap.rationale) {
    issues.push({ severity: "medium", type: "missing_catalog_gap_rationale", section, label: gap.label || "", detail: "Catalog gaps should explain why the gap is present." });
  }
  if (!gap.resolutionPlan) {
    issues.push({ severity: "medium", type: "missing_catalog_gap_resolution", section, label: gap.label || "", detail: "Catalog gaps should include a reviewer resolution plan." });
  }
  if (!gap.traceability?.catalog_gap || gap.traceability?.authorized_by !== "staged_catalog_gap") {
    issues.push({ severity: "high", type: "missing_catalog_gap_traceability", section, label: gap.label || "", detail: "Catalog gaps must not masquerade as validated evidence." });
  }
  if (!Array.isArray(gap.tags) || !gap.tags.length) {
    issues.push({ severity: "medium", type: "missing_catalog_gap_tags", section, label: gap.label || "", detail: "Catalog gaps should preserve activation tags or registry context." });
  }
  return issues;
}

function lintRecommendedWorkupSections(sectionedWorkup) {
  return [
    ...(sectionedWorkup.basicSafetyChecks || []).flatMap((entry) => lintRecommendationEntry(entry, "basicSafetyChecks")),
    ...(sectionedWorkup.focusedHistoryQuestions || []).flatMap((question) => lintHistoryQuestion(question)),
    ...(sectionedWorkup.redFlagsAndEscalationCues || []).flatMap((entry) => lintRecommendationEntry(entry, "redFlagsAndEscalationCues")),
    ...(sectionedWorkup.initialTestsAndReferenceThresholds || []).flatMap((entry) => lintRecommendationEntry(entry, "initialTestsAndReferenceThresholds")),
    ...(sectionedWorkup.managementChangingFindings || []).flatMap((finding) => lintManagementChangingFinding(finding)),
    ...(sectionedWorkup.limitationsAndInterpretationCautions || []).flatMap((caution) => lintLimitationCaution(caution)),
    ...(sectionedWorkup.evidenceAndLikelihoodMetadata || []).flatMap((metadata) => lintEvidenceLikelihoodMetadata(metadata)),
    ...(sectionedWorkup.catalogGapsNeedingReview || []).flatMap((gap) => lintCatalogGapReview(gap)),
    ...(sectionedWorkup.corePhysicalExamManeuvers || []).flatMap((entry) => lintRecommendationEntry(entry, "corePhysicalExamManeuvers")),
    ...(sectionedWorkup.conditionalPhysicalExamManeuvers || []).flatMap((entry) => lintRecommendationEntry(entry, "conditionalPhysicalExamManeuvers"))
  ];
}

function gapAlreadySatisfied(gap, selectedEntries = []) {
  const pattern = gap.satisfiedBy || new RegExp(normalizeEvidenceLabel(gap.label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const normalizedGapLabel = normalizeEvidenceText(gap.label || "");
  const relaxedGapLabel = normalizeEvidenceLabel(gap.label || "");
  const requiresFullIdentity = /\b(?:exam|check|screen|assessment|inspection|palpation|auscultation|percussion|reflex)\b/i.test(gap.label || "");
  const gapType = inferredCatalogGapItemType(gap);
  return selectedEntries.some((entry) => {
    if (gapType && !requiredProfileSectionTypesCompatible(gapType, entry)) {
      return false;
    }
    const text = requiredProfileSatisfactionText(entry, gapType);
    if (normalizedGapLabel && text.includes(normalizedGapLabel)) {
      return true;
    }
    if (!requiresFullIdentity && relaxedGapLabel && text.includes(relaxedGapLabel)) {
      return true;
    }
    return pattern.test(text);
  });
}

function inferredCatalogGapItemType(gap = {}) {
  const explicitType = String(gap.gap_type || gap.item_type || "").toLowerCase();
  if (explicitType) {
    return explicitType;
  }
  const identityText = normalizeEvidenceLabel([gap.exam_id, gap.gap_id, gap.label].filter(Boolean).join(" "));
  const text = normalizeEvidenceLabel([identityText, gap.domain].filter(Boolean).join(" "));
  if (/\b(?:red[-\s]?flag|escalation|danger|cue|urgent|emergent)\b/.test(identityText)) {
    return "red_flag";
  }
  if (/\b(?:test|testing|labs?|imaging|ultrasound|ct|mri|x-ray|threshold|reference|pathway)\b/.test(identityText)) {
    return "diagnostic_test";
  }
  if (/\b(?:exam|inspection|inspect|palpation|palpate|auscultation|auscultate|percussion|percuss|reflex|sensation|stiffness|meningeal|nuchal|range of motion|rom|pulses?|nodes?|skin|mucosa|mucosal|scrotal|genital|thyroid|abdomen|abdominal|lung|heart sounds)\b/.test(identityText)) {
    return "exam_maneuver";
  }
  if (/\b(?:vitals?|blood pressure|heart rate|respiratory rate|oxygen saturation|spo2|pulse oximetry|temperature|bedside glucose)\b/.test(identityText)) {
    return "safety_check";
  }
  if (/\b(?:red[-\s]?flag|escalation|danger|cue|urgent|emergent)\b/.test(text)) {
    return "red_flag";
  }
  if (/\b(?:exam|inspection|inspect|palpation|palpate|auscultation|auscultate|percussion|percuss|reflex|sensation|stiffness|meningeal|nuchal|range of motion|rom|pulses?|nodes?|skin|mucosa|mucosal|scrotal|genital|thyroid|abdomen|abdominal|lung|heart sounds)\b/.test(text)) {
    return "exam_maneuver";
  }
  return "";
}

function bundleCatalogGapEntries(activeProfiles, context, selectedEntries = [], catalogGapRegistryRows = []) {
  return activeProfiles
    .flatMap((profile) => (profile.requiredGaps || []).map((gap) => ({ profile, gap })))
    .filter(({ gap }) => isStagedCatalogGapDefinition(gap))
    .filter(({ gap }) => conditionMatches(gap.when, context) && !conditionBlocks(gap.unless, context) && !gapAlreadySatisfied(gap, selectedEntries))
    .map(({ profile, gap }) => {
      const registryRow = catalogGapRegistryRowForGap(gap.exam_id, catalogGapRegistryRows, context, profile) || {};
      const registrySourceIds = registryRow.source_ids || gap.source || "";
      const registryCitation = registryRow.source_citation || gap.source || "";
      const role = gap.role || "core";
      const whenToUse = gap.whenToUse || gap.when_to_use_structured || gap.whenText || profile.name || "";
      const limitations = gap.limitations
        || "Catalog gap staged by a validated clinical bundle; technique and interpretation should be reviewed against the source before converting into a permanent catalog maneuver.";
      const matchedTags = gap.matchedTags || [];
      const itemType = registryRow.gap_type || gap.item_type || gap.gap_type || "exam_maneuver";
      const rawTechnique = gap.technique || gap.maneuver || gap.action || gap.label || "";
      const technique = itemType === "exam_maneuver"
        ? standardizedBedsideTechnique({
            ...gap,
            examLabel: gap.label,
            matchedTags,
            tags: matchedTags
          }, rawTechnique)
        : rawTechnique;
      const candidate = {
        exam_id: gap.exam_id,
        item_type: itemType,
        gap_type: registryRow.gap_type || gap.gap_type || gap.item_type || "exam_maneuver",
        examLabel: gap.label,
        maneuver: gap.maneuver || gap.label,
        examOptions: gap.options || "",
        technique,
        when_to_use_structured: whenToUse,
        limitations,
        score: 100,
        scoreBreakdown: { clinicalRelevance: 100, actionability: 100, diagnosticValue: 75, bedsideFeasibility: 100 },
        condition_or_syndrome: profile.name,
        diagnostic_target: gap.diagnosticTarget || "",
        result_changes_management: gap.management || "",
        management_link: gap.management || "",
        evidence_source_primary: registrySourceIds,
        source_citation: registryCitation,
        LR_plus: gap.LR_plus || "",
        LR_minus: gap.LR_minus || "",
        evidence_tier: gap.evidenceTier || "Guideline",
        difficulty: gap.difficulty || "easy",
        time_burden_minutes: gap.time_burden_minutes || "0.5",
        equipment_needed: gap.equipment_needed || "none",
        patient_cooperation_required: gap.patient_cooperation_required || "low",
        matchedTags,
        tags: matchedTags,
        retrieval_tags: matchedTags.join(";"),
        retrievalRoutes: ["validated_bundle_gap"],
        catalogGap: true,
        catalog_gap_review_status: registryRow.review_status || gap.review_status || "staged_gap",
        catalog_gap_review_owner: registryRow.review_owner || gap.review_owner || "clinical_content_lead",
        catalog_gap_last_reviewed: registryRow.last_reviewed || gap.last_reviewed || "",
        catalog_gap_resolution_plan: registryRow.planned_resolution || gap.planned_resolution || "Review and promote to the base exam catalog only after source-specific technique, limitations, and evidence metadata are complete.",
        catalog_gap_rationale: registryRow.rationale || gap.reason || "",
        catalog_gap_activation_condition: registryRow.activation_condition || whenToUse,
        catalog_gap_source_ids: registrySourceIds,
        catalog_gap_source_citation: registryCitation,
        catalog_gap_registry_case_id: registryRow.case_id || ""
      };
      const displayLabel = actionSpecificPhysicalExamLabel(candidate, gap.label);
      return {
        candidate,
        exam_id: gap.exam_id,
        item_type: candidate.item_type,
        gap_type: candidate.gap_type,
        label: displayLabel,
        originalLabel: gap.label,
        options: gap.options || "",
        domain: gap.domain || "Catalog Gap",
        role,
        reason: gap.reason || "Required by the selected validated clinical bundle but not yet represented as a base catalog maneuver.",
        rationale: gap.reason || "Required by the selected validated clinical bundle but not yet represented as a base catalog maneuver.",
        technique,
        whenToUse,
        limitations,
        interpretationCautions: limitations,
        managementRelevance: gap.management || "",
        evidence: evidenceMetadataWithLikelihoodRatioNote({
          source: gap.source || "",
          LR_plus: gap.LR_plus || "",
          LR_minus: gap.LR_minus || "",
          tier: gap.evidenceTier || "Guideline"
        }, candidate, candidate.item_type),
        feasibility: {
          difficulty: gap.difficulty || "easy",
          time_burden_minutes: gap.time_burden_minutes || "0.5",
          equipment_needed: gap.equipment_needed || "none",
          patient_cooperation_required: gap.patient_cooperation_required || "low"
        },
        matchedTags,
        retrievalTags: matchedTags,
        specificMatchedTags: matchedTags,
        recommendationSignals: [{ type: role, domain: gap.domain || "Catalog Gap", strength: role === "core" ? 100 : 70 }],
        displayDiagnosticTarget: gap.diagnosticTarget || "",
        displayManagement: gap.management || "",
        displayBedsideQuestion: gap.bedsideQuestion || "",
        displayBedsideQuestionOptions: gap.bedsideQuestionOptions || "",
        contextFitScore: 100,
        score: 100,
        suppressionReason: "",
        catalogGap: true,
        item_type: candidate.item_type,
        gap_type: candidate.gap_type,
        catalog_gap_review_status: candidate.catalog_gap_review_status,
        catalog_gap_review_owner: candidate.catalog_gap_review_owner,
        catalog_gap_last_reviewed: candidate.catalog_gap_last_reviewed,
        catalog_gap_resolution_plan: candidate.catalog_gap_resolution_plan,
        catalog_gap_rationale: candidate.catalog_gap_rationale,
        catalog_gap_activation_condition: candidate.catalog_gap_activation_condition,
        catalog_gap_source_ids: candidate.catalog_gap_source_ids,
        catalog_gap_source_citation: candidate.catalog_gap_source_citation,
        catalog_gap_registry_case_id: candidate.catalog_gap_registry_case_id
      };
    });
}

export function buildRecommendedExamChecklist(contextText = "", rankedCandidates = [], options = {}) {
  const ranked = Array.isArray(rankedCandidates)
    ? { candidates: rankedCandidates, matchedTags: options.matchedTags || [] }
    : (rankedCandidates || {});
  const candidates = ranked.candidates || [];
  const context = normalizeEvidenceText(expandEvidenceContextText(contextText));
  const strictProfileScope = hasValidatedClinicalBundleScope(contextText);
  const ruleContext = strictProfileScope
    ? normalizeEvidenceText(clinicalRuleContextFromContextText(options.ruleContext || contextText))
    : context;
  const activeProfiles = activeRecommendationProfiles(ruleContext, contextText);
  const validatedIntentTrace = validatedIntentTraceFromContext(contextText, options.validatedIntents || options.selectedIntents || []);
  const catalogGapRegistryRows = options.catalogGapRegistryRows || options.gapRows || [];
  const intentSuppressRules = validatedIntentTrace.flatMap((trace) => trace.suppress_rules || []);
  const intentAvoidLabels = unique(validatedIntentTrace.flatMap((trace) => trace.avoid_labels || []));
  const matchedTags = ranked.matchedTags || options.matchedTags || [];
  const attachTraceability = (entry) => attachRecommendationTraceability(entry, validatedIntentTrace);
  const entries = candidates
    .map((candidate) => recommendationCandidateEntry(candidate, context, activeProfiles, { strictProfileScope, ruleContext, intentAvoidLabels, intentSuppressRules }))
    .map(attachTraceability);
  const replacementEntryPool = [
    ...entries,
    ...((ranked.allScored || [])
      .filter((candidate) => candidate.acceptedCatalogAddition)
      .filter((candidate) => !entries.some((entry) => entry.exam_id === candidate.exam_id))
      .map((candidate) => recommendationCandidateEntry(candidate, context, activeProfiles, { strictProfileScope, ruleContext, intentAvoidLabels, intentSuppressRules }))
      .map(attachTraceability))
  ];
  const coreItems = selectRecommendationEntries(entries.filter((entry) => entry.role === "core"), context, {
    maxItems: options.maxCoreItems || 24,
    maxPerDomain: options.maxCorePerDomain || 7,
    collapseFamilies: strictProfileScope
  });
  let coreIds = new Set(coreItems.map((entry) => entry.exam_id));
  const conditionalItems = selectRecommendationEntries(entries.filter((entry) => entry.role === "conditional" && !coreIds.has(entry.exam_id)), context, {
    maxItems: options.maxConditionalItems || 36,
    maxPerDomain: options.maxConditionalPerDomain || 8,
    collapseFamilies: strictProfileScope
  });
  let replacedRoutineVitalItems = strictProfileScope
    ? [
        ...removeRoutineCatalogVitalEntries(coreItems),
        ...removeRoutineCatalogVitalEntries(conditionalItems)
      ]
    : [];
  coreIds = new Set(coreItems.map((entry) => entry.exam_id));
  const requiredProfileItems = bundleRequiredProfileEntries(activeProfiles, ruleContext, [...coreItems, ...conditionalItems, ...(options.catalogGaps || [])])
    .map(attachTraceability);
  const requiredCoreItems = requiredProfileItems.filter((entry) => entry.role === "core" && !coreIds.has(entry.exam_id));
  coreItems.push(...requiredCoreItems);
  const requiredConditionalItems = requiredProfileItems.filter((entry) => entry.role !== "core" && !coreIds.has(entry.exam_id));
  const requiredConditionalIds = new Set(conditionalItems.map((entry) => entry.exam_id));
  conditionalItems.push(...requiredConditionalItems.filter((entry) => !requiredConditionalIds.has(entry.exam_id)));
  const acceptedGapReplacementItems = acceptedCatalogGapReplacementEntries(
    activeProfiles,
    ruleContext,
    replacementEntryPool,
    [...coreItems, ...conditionalItems, ...(options.catalogGaps || [])]
  ).map(attachTraceability);
  const acceptedGapReplacementCoreItems = acceptedGapReplacementItems.filter((entry) => entry.role === "core");
  coreItems.push(...acceptedGapReplacementCoreItems.filter((entry) => !coreItems.some((core) => core.exam_id === entry.exam_id)));
  const acceptedGapReplacementConditionalItems = acceptedGapReplacementItems.filter((entry) => entry.role !== "core");
  const acceptedGapReplacementConditionalIds = new Set(conditionalItems.map((entry) => entry.exam_id));
  conditionalItems.push(...acceptedGapReplacementConditionalItems.filter((entry) => !acceptedGapReplacementConditionalIds.has(entry.exam_id)));
  const catalogGapItems = bundleCatalogGapEntries(activeProfiles, ruleContext, [...coreItems, ...conditionalItems, ...(options.catalogGaps || [])], catalogGapRegistryRows)
    .map(attachTraceability);
  const coreCatalogGapItems = catalogGapItems.filter((entry) => entry.role === "core");
  const conditionalCatalogGapItems = catalogGapItems.filter((entry) => entry.role !== "core" && !coreIds.has(entry.exam_id));
  coreItems.push(...coreCatalogGapItems);
  const conditionalIds = new Set(conditionalItems.map((entry) => entry.exam_id));
  conditionalItems.push(...conditionalCatalogGapItems.filter((entry) => !conditionalIds.has(entry.exam_id)));
  if (strictProfileScope) {
    replacedRoutineVitalItems = [
      ...replacedRoutineVitalItems,
      ...removeRoutineCatalogVitalEntries(coreItems),
      ...removeRoutineCatalogVitalEntries(conditionalItems)
    ];
  }
  const replacedRoutineVitalIds = new Set(replacedRoutineVitalItems.map((entry) => entry.exam_id));
  const historyFloorItems = validatedIntentHistoryFloorEntries(validatedIntentTrace, [...coreItems, ...conditionalItems])
    .map(attachTraceability);
  const selectedBeforeHistoryIds = new Set([...coreItems, ...conditionalItems].map((entry) => entry.exam_id));
  coreItems.push(...historyFloorItems.filter((entry) => !selectedBeforeHistoryIds.has(entry.exam_id)));
  const safetyFloorItems = validatedSafetyFloorEntries(validatedIntentTrace, [...coreItems, ...conditionalItems])
    .map(attachTraceability);
  coreItems.push(...safetyFloorItems);
  const duplicateCoreExamItems = (strictProfileScope || validatedIntentTrace.length)
    ? removeDuplicateCoreExamFamilyEntries(coreItems, ruleContext)
    : [];
  const selectedIds = new Set([...coreIds, ...coreItems.map((entry) => entry.exam_id), ...conditionalItems.map((entry) => entry.exam_id)]);
  const selectedRecommendationEntries = [...coreItems, ...conditionalItems];
  const suppressedItemCandidates = [
    ...replacedRoutineVitalItems,
    ...duplicateCoreExamItems,
    ...entries
      .filter((entry) => !selectedIds.has(entry.exam_id) && !replacedRoutineVitalIds.has(entry.exam_id))
      .map((entry) => postSelectionSuppressedEntry(entry, selectedRecommendationEntries, context))
      .sort((a, b) => b.score - a.score || b.contextFitScore - a.contextFitScore)
  ];
  const suppressedItems = curatedSuppressedRecommendationItems(suppressedItemCandidates, options.maxSuppressedItems || 36);
  const sectionedWorkup = sectionRecommendationEntries(coreItems, conditionalItems);
  const generatedCompletenessGaps = generatedWorkupCompletenessGaps(
    validatedIntentTrace,
    sectionedWorkup,
    [...catalogGapItems, ...(options.catalogGaps || [])]
  );
  const catalogGapsNeedingReview = catalogGapsNeedingReviewFromEntries(
    [...catalogGapItems, ...generatedCompletenessGaps, ...(options.catalogGaps || [])],
    validatedIntentTrace
  );
  sectionedWorkup.catalogGapsNeedingReview = catalogGapsNeedingReview;
  const conditionalExamAddOnStatus = conditionalExamAddOnSectionStatus(
    validatedIntentTrace,
    sectionedWorkup,
    catalogGapsNeedingReview,
    ruleContext
  );
  const sectionStatuses = {
    conditionalPhysicalExamManeuvers: conditionalExamAddOnStatus
  };
  const qualityIssues = lintRecommendedWorkupSections(sectionedWorkup);
  const totalCoreMinutes = coreItems.reduce((sum, entry) => sum + (numericValue(entry.feasibility.time_burden_minutes) || 0), 0);
  const totalCoreExamMinutes = sectionedWorkup.corePhysicalExamManeuvers.reduce((sum, entry) => sum + (numericValue(entry.feasibility.time_burden_minutes) || 0), 0);
  const totalSafetyMinutes = sectionedWorkup.basicSafetyChecks.reduce((sum, entry) => sum + (numericValue(entry.feasibility.time_burden_minutes) || 0), 0);
  const warnings = [];
  const finalRecommendationAuthorized = validatedIntentTrace.length > 0;
  const authorizationStatus = finalRecommendationAuthorized
    ? "validated_intent"
    : "audit_only_unvalidated_context";
  const authorizationReason = finalRecommendationAuthorized
    ? "Recommendations trace to selected validated clinical intent(s)."
    : "No selected validated clinical intent; free text, tag overlap, and embedding retrieval can only support audit/gap review.";
  if (!finalRecommendationAuthorized) {
    warnings.push("No validated clinical intent authorized final bedside recommendations; treat this output as retrieval/audit context only.");
  }
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
  if (generatedCompletenessGaps.length) {
    const labels = unique(generatedCompletenessGaps.map((gap) => gap.label || gap.gap_label || gap.exam_id)).join("; ");
    warnings.push(`Validated workup is incomplete until staged content gaps are reviewed: ${labels}.`);
  }
  if (catalogGapsNeedingReview.length) {
    const nonGeneratedGapCount = catalogGapsNeedingReview.length - generatedCompletenessGaps.length;
    if (nonGeneratedGapCount > 0) {
      warnings.push(`${nonGeneratedGapCount} staged catalog gap(s) remain reviewer-only and are not accepted recommendations.`);
    }
  }

  const highQualityIssueCount = qualityIssues.filter((issue) => issue.severity === "high").length;
  const readinessReasons = [];
  if (!finalRecommendationAuthorized) {
    readinessReasons.push("No validated clinical intent selected.");
  }
  if (highQualityIssueCount) {
    readinessReasons.push(`${highQualityIssueCount} high-severity quality issue(s) need review.`);
  }
  if (catalogGapsNeedingReview.length) {
    readinessReasons.push(`${catalogGapsNeedingReview.length} staged catalog gap(s) need expert review before the workup can be called complete.`);
  }
  const workupReadinessStatus = !finalRecommendationAuthorized
    ? "audit_only_unvalidated_context"
    : (highQualityIssueCount
        ? "quality_review_required"
        : (catalogGapsNeedingReview.length ? "staged_gaps_need_review" : "complete_validated"));
  const workupReadinessLabel = {
    audit_only_unvalidated_context: "Audit only; validated intent required",
    quality_review_required: "Needs quality review",
    staged_gaps_need_review: "Validated core with staged gaps",
    complete_validated: "Complete validated workup"
  }[workupReadinessStatus] || workupReadinessStatus;
  const workupReadiness = {
    status: workupReadinessStatus,
    label: workupReadinessLabel,
    completeValidatedWorkup: workupReadinessStatus === "complete_validated",
    finalRecommendationsAllowed: finalRecommendationAuthorized && !highQualityIssueCount,
    unresolvedCatalogGapCount: catalogGapsNeedingReview.length,
    highQualityIssueCount,
    reasons: readinessReasons
  };

  return {
    finalRecommendationAuthorized,
    authorizationStatus,
    authorizationReason,
    workupReadiness,
    workupReadinessStatus,
    completeValidatedWorkup: workupReadiness.completeValidatedWorkup,
    basicSafetyChecks: sectionedWorkup.basicSafetyChecks,
    focusedHistoryQuestions: sectionedWorkup.focusedHistoryQuestions,
    redFlagsAndEscalationCues: sectionedWorkup.redFlagsAndEscalationCues,
    initialTestsAndReferenceThresholds: sectionedWorkup.initialTestsAndReferenceThresholds,
    managementChangingFindings: sectionedWorkup.managementChangingFindings,
    limitationsAndInterpretationCautions: sectionedWorkup.limitationsAndInterpretationCautions,
    evidenceAndLikelihoodMetadata: sectionedWorkup.evidenceAndLikelihoodMetadata,
    evidenceMetadata: sectionedWorkup.evidenceAndLikelihoodMetadata,
    catalogGapsNeedingReview,
    sectionStatuses,
    conditionalExamAddOnStatus,
    corePhysicalExamManeuvers: sectionedWorkup.corePhysicalExamManeuvers,
    conditionalPhysicalExamManeuvers: sectionedWorkup.conditionalPhysicalExamManeuvers,
    coreItems: sectionedWorkup.corePhysicalExamManeuvers,
    conditionalItems: sectionedWorkup.conditionalPhysicalExamManeuvers,
    suppressedItems,
    catalogGaps: [...(options.catalogGaps || []).filter(isStagedCatalogGapDefinition), ...catalogGapItems, ...generatedCompletenessGaps],
    requiredProfileItems,
    matchedTags,
    validatedIntentTrace,
    validatedIntentIds: validatedIntentTrace.map((trace) => trace.intent_id),
    intentAvoidLabels,
    activeProfiles: activeProfiles.map((profile) => ({ id: profile.id, name: profile.name })),
    retrievedCandidates: candidates.map((candidate) => attachRecommendationTraceability({ candidate, exam_id: candidate.exam_id }, validatedIntentTrace).candidate),
    totalCoreMinutes,
    totalCoreExamMinutes,
    totalSafetyMinutes,
    qualityIssues,
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
  if (/\b(?:thyroid disease|hypothyroidism|hypothyroid|hyperthyroidism|hyperthyroid|hashimoto|graves|goiter|thyroid nodule|thyroid mass|abnormal tsh|heat intolerance|cold intolerance|dry skin)\b/.test(context)
    && /\b(?:thyroid exam|thyroid inspection|thyroid palpation|thyroid inspection and palpation)\b/.test(candidateText)) {
    boost += 72;
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
  if (/\b(?:fever|febrile|chills|rigors|night sweats|sepsis|infection|leukocytosis)\b/.test(context)
    && /\b(?:respiratory rate|blood pressure|heart rate|temperature|oxygen saturation|work of breathing|posterior lung sounds|mouth|oropharynx|radial pulses|skin source|skin inspection|wound inspection|line site)\b/.test(candidateText)) {
    boost += 44;
  }
  if (/\b(?:fever|febrile|chills|rigors|night sweats|sepsis|infection|leukocytosis)\b/.test(context)
    && /\b(?:cough|sputum|dyspnea|shortness of breath|hypoxia|pneumonia|pleuritic|aspiration|respiratory)\b/.test(context)
    && /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds|work of breathing|lung percussion|fremitus)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:fever|febrile|chills|rigors|sepsis|infection)\b/.test(context)
    && /\b(?:dysuria|urinary|frequency|urgency|flank|hematuria|pyelonephritis|urosepsis|kidney stone|renal colic)\b/.test(context)
    && /\b(?:cva tenderness|abdominal palpation|mouth|radial pulses)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:fever|febrile|chills|rigors|sepsis|infection)\b/.test(context)
    && /\b(?:abdominal|abdomen|belly|stomach|vomit|diarrhea|jaundice|guarding|peritonitis|appendicitis|biliary|ruq|rlq)\b/.test(context)
    && /\b(?:abdominal palpation|abdominal inspection|bowel sounds|rebound|murphy|sclerae|conjunctivae|liver|spleen)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:fever|febrile|chills|rigors|night sweats|infection)\b/.test(context)
    && /\b(?:sore throat|pharyngitis|lymphadenitis|lymphadenopathy|swollen glands|neck mass|night sweats|weight loss|malignancy)\b/.test(context)
    && /\b(?:nodes|anterior cervical nodes|posterior cervical nodes|tonsillar nodes|submandibular nodes|supraclavicular nodes|spleen palpation|mouth|oropharynx)\b/.test(candidateText)) {
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
  const scoringBaseContextText = clinicalRuleContextFromContextText(contextText) || contextText;
  const expandedContextText = expandEvidenceContextText(contextText);
  const scoringContextText = expandEvidenceContextText(scoringBaseContextText) || expandedContextText;
  const context = normalizeEvidenceText(scoringContextText);
  const matchedTags = extractEvidenceTags(scoringContextText, tagRows);
  const matchedTagNames = new Set(matchedTags.map((match) => match.tag));
  const reviewState = normalizeEvidenceReviewState(options.reviewState || {});
  const weights = { ...defaultWeights, ...(options.weights || {}) };

  const rawScored = catalog.map((candidate, index) => {
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
  });

  const scored = rawScored
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
    allScored: rawScored.slice().sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
  };
}

function truncatePromptField(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function candidateSourceLabel(candidate) {
  return candidate.source?.source_id || candidate.evidence_source_primary || candidate.source_citation || "local exam catalog";
}

export function formatEvidenceCandidatesBlock(candidates = [], options = {}) {
  if (!candidates.length) {
    return "";
  }

  const lines = [
    "<retrieved_evidence_candidates>",
    "These are prioritized evidence-backed bedside question and exam candidates from the local catalog. They are reviewer-visible evidence context, not permission to invent unvalidated final checklist rows.",
    "Prefer relevant candidate labels/options when they fit the patient and are supported by the selected validated clinical intent or reviewed patient context. Improve wording/options when clinically clearer, but keep final checklist rows traceable to validated local material.",
    "If a clinically important bedside question or exam maneuver appears missing, identify it only as a catalog gap for app-side review; do not insert it into the final two-section checklist as an unvalidated row.",
    "Do not copy low-relevance candidates just because they appear here. Use the source, LR, rationale, difficulty, and time fields to judge value, but keep citations and rationale out of the final checklist because the app displays metadata separately.",
    "Return only the standard two plain-text checklists.",
    ""
  ];

  candidates.slice(0, options.maxCandidates || 48).forEach((candidate, index) => {
    const itemType = String(candidate.item_type || candidate.gap_type || "").trim() || "physical_exam_maneuver";
    const isQuestion = itemType === "history_question";
    const lrParts = [
      candidate.LR_plus ? `LR+ ${candidate.LR_plus}` : "",
      candidate.LR_minus ? `LR- ${candidate.LR_minus}` : ""
    ].filter(Boolean).join(", ") || "LR not available";
    lines.push(
      [
        `${index + 1}. ${candidate.exam_id}`,
        `item type: ${isQuestion ? "history_question" : "physical_exam_maneuver"}`,
        `condition: ${truncatePromptField(candidate.condition_or_syndrome, 90)}`,
        `question: ${candidateHasVettedBedsideQuestion(candidate) ? `${truncatePromptField(candidate.bedside_question_label, 120)}: ${truncatePromptField(candidate.bedside_question_options, 100)}` : "none"}`,
        `exam: ${isQuestion ? "none" : `${truncatePromptField(candidate.examLabel, 80)}: ${truncatePromptField(candidate.examOptions, 100)}`}`,
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

export function formatEvidenceGapOnlyBlock(recommendation = {}, options = {}) {
  const gaps = [
    ...(recommendation.catalogGapsNeedingReview || []),
    ...(recommendation.catalogGaps || [])
  ].filter((gap) => gap && (gap.traceability?.catalog_gap || gap.candidate?.traceability?.catalog_gap || gap.catalogGap || gap.gap_type));
  if (!gaps.length) {
    return "";
  }

  const seen = new Set();
  const lines = [
    "<retrieved_evidence_candidates>",
    "These are prioritized evidence-backed bedside question and exam candidates from the local catalog. They are reviewer-visible evidence context, not permission to invent unvalidated final checklist rows.",
    "No candidate rows are authorized for OpenEvidence final checklist insertion after app-side filtering. The validated local workup has staged catalog gaps that need app-side review.",
    "If a clinically important bedside question or exam maneuver appears missing, identify it only as a catalog gap for app-side review; do not insert it into the final two-section checklist as an unvalidated row.",
    "Return only the standard two plain-text checklists from validated candidate rows; if none are provided, leave the bedside checklist empty rather than inventing rows.",
    "",
    "catalog gaps for app-side review only:"
  ];

  for (const gap of gaps.slice(0, options.maxGapWarnings || 12)) {
    const candidate = gap.candidate || gap;
    const id = gap.exam_id || candidate.exam_id || gap.gap_id || candidate.gap_id || "";
    const label = gap.label || candidate.examLabel || candidate.label || id;
    const key = `${id}::${label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(
      `- ${id || "catalog-gap"}: ${truncatePromptField(label, 90)} | gap only, not a final checklist row | source: ${truncatePromptField(candidate.catalog_gap_source_ids || candidate.evidence_source_primary || gap.source || "", 120)} | plan: ${truncatePromptField(candidate.catalog_gap_resolution_plan || gap.resolutionPlan || gap.planned_resolution || "review before activation", 180)}`
    );
  }

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

function validatedEvidencePromptIntents(options = {}) {
  return [
    ...(Array.isArray(options.validatedIntents) ? options.validatedIntents : []),
    ...(Array.isArray(options.selectedIntents) ? options.selectedIntents : [])
  ].filter((intentRow) => intentRow && intentRow.status === "validated");
}

function blockedEvidencePromptReplacement(prompt, reason = "No validated clinical intent authorized evidence prompt injection.") {
  return {
    success: false,
    blocked: true,
    blockedReason: reason,
    prompt,
    evidenceBlock: "",
    candidates: [],
    promptCandidates: [],
    recommendation: null,
    matchedTags: []
  };
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
  const [baseText, overlayText, legacyOverlayText, acceptedCatalogAdditionsText, tagText, sourceText, gapText] = await Promise.all([
    fetchText(urls.base),
    fetchText(urls.overlay),
    optionalFetchText(urls.legacyOverlay),
    optionalFetchText(urls.acceptedCatalogAdditions),
    fetchText(urls.tags),
    fetchText(urls.sources),
    optionalFetchText(urls.gaps)
  ]);

  const baseRows = parseCsv(baseText);
  const overlayRows = parseCsv(overlayText);
  const legacyOverlayRows = parseCsv(legacyOverlayText);
  const acceptedCatalogAdditionRows = parseCsv(acceptedCatalogAdditionsText);
  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  const tagRows = parseCsv(tagText);
  const sourceRows = parseCsv(sourceText);
  const gapRows = parseCsv(gapText);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    requestedOverlayRows: overlayRows,
    legacyOverlayRows,
    acceptedCatalogAdditionRows,
    tagRows,
    sourceRows,
    gapRows,
    catalog: joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows, acceptedCatalogAdditionRows)
  };
}

export function buildEvidencePromptReplacement(prompt, evidenceCatalog, contextText, options = {}) {
  if (!validatedEvidencePromptIntents(options).length) {
    return blockedEvidencePromptReplacement(prompt);
  }
  const ranked = rankEvidenceCandidates(evidenceCatalog.catalog, contextText, evidenceCatalog.tagRows, options);
  const recommendation = buildRecommendedExamChecklist(contextText, ranked, options);
  const promptCandidates = promptEligibleRecommendationCandidates(recommendation, options);
  const evidenceBlock = formatEvidenceCandidatesBlock(promptCandidates, options)
    || formatEvidenceGapOnlyBlock(recommendation, options);
  return {
    success: Boolean(evidenceBlock),
    prompt: evidenceBlock ? replaceStudentReferenceWithEvidenceBlock(prompt, evidenceBlock) : prompt,
    evidenceBlock,
    candidates: ranked.candidates,
    promptCandidates,
    recommendation,
    matchedTags: ranked.matchedTags
  };
}

export function promptEligibleRecommendationCandidates(recommendation = {}, options = {}) {
  const entries = [
    ...(options.includeHistoryPromptCandidates === false ? [] : (recommendation.focusedHistoryQuestions || [])),
    ...(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []),
    ...(options.includeConditionalPromptCandidates === false ? [] : (recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []))
  ];
  const promptCandidates = [];
  const seenPromptCandidateIds = new Set();

  for (const entry of entries) {
    const candidate = promptCandidateFromRecommendationEntry(entry);
    const traceability = entry?.traceability || candidate?.traceability || {};
    if (!candidate?.exam_id || seenPromptCandidateIds.has(candidate.exam_id)) {
      continue;
    }
    if (candidate.embeddingOnly || candidate.semanticOnly || (candidate.retrievalRoutes || []).every((route) => route === "embedding")) {
      continue;
    }
    if (traceability.catalog_gap || traceability.authorized_by === "staged_catalog_gap" || candidate.catalogGap) {
      continue;
    }
    if (isBasicSafetyCheckEntry(entry) || isBasicSafetyCheckEntry(candidate)) {
      continue;
    }
    if (["diagnostic_test", "reference_threshold", "red_flag", "management_change", "safety_check"].includes(String(entry.item_type || candidate.item_type || "").toLowerCase())) {
      continue;
    }
    if (entry.role === "suppressed") {
      continue;
    }
    promptCandidates.push(candidate);
    seenPromptCandidateIds.add(candidate.exam_id);
  }

  return promptCandidates;
}

function promptCandidateFromRecommendationEntry(entry = {}) {
  if (entry?.candidate?.exam_id) {
    return entry.candidate;
  }
  if (!isHistoryQuestionEntry(entry) && !entry.text) {
    return entry;
  }
  const evidence = entry.evidence || {};
  const traceability = entry.traceability || {};
  const source = entry.source || evidence.source || (traceability.source_ids || []).join("; ") || "";
  const questionText = entry.text || entry.displayBedsideQuestion || entry.label || "";
  return {
    exam_id: entry.id || entry.exam_id || entry.linkedExamId || "",
    item_type: "history_question",
    gap_type: "history_question",
    examLabel: entry.label || questionText,
    maneuver: entry.label || questionText,
    examOptions: "",
    bedside_question_label: questionText,
    bedside_question_options: entry.options || entry.displayBedsideQuestionOptions || "",
    when_to_use_structured: entry.whenToAsk || entry.whenToUse || "",
    condition_or_syndrome: (traceability.intent_labels || []).join("; "),
    diagnostic_target: entry.diagnosticPurpose || entry.displayDiagnosticTarget || "",
    result_changes_management: entry.managementImplication || entry.displayManagement || "",
    management_link: entry.managementImplication || entry.displayManagement || "",
    evidence_source_primary: source,
    source_citation: source,
    LR_plus: entry.LR_plus || evidence.LR_plus || "",
    LR_minus: entry.LR_minus || evidence.LR_minus || "",
    evidence_tier: evidence.tier || entry.evidence_tier || "Guideline",
    difficulty: "easy",
    time_burden_minutes: "1",
    equipment_needed: "none",
    traceability,
    tags: entry.tags || [],
    matchedTags: entry.tags || [],
    retrievalRoutes: ["focused_history_question"]
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
