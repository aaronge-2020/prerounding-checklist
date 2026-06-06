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
  return Boolean(row?.exam_id) && status !== "pending" && status !== "";
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
  if (!/\s/.test(term)) {
    return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(context);
  }
  return context.includes(term);
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
  if (/\b(?:headache|vision|blurry|diplopia|facial droop|aphasia|stroke|tia|focal deficit)\b/.test(context)
    && /\b(?:pupils|visual fields|visual acuity|extraocular|facial symmetry|pronator drift|tongue|gait)\b/.test(candidateText)) {
    boost += 40;
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
  if (/\b(?:vertigo|ataxia|gait abnormality)\b/.test(context)
    && /\b(?:gait|romberg|tandem|finger to nose|heel to shin|extraocular|pupils)\b/.test(candidateText)) {
    boost += 40;
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
  if (/\b(?:bruising|petechiae|pallor|bleeding gums|epistaxis|anemia|thrombocytopenia|anticoagulation)\b/.test(context)
    && /\b(?:mouth|oropharynx|sclerae|conjunctivae|blood pressure|heart rate|jvp)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:dysuria|hematuria|urinary|oliguria|flank pain|pyelonephritis|renal colic|polyuria)\b/.test(context)
    && /\b(?:cva tenderness|abdominal palpation|blood pressure|mouth|jvp|heart rate|bowel sounds)\b/.test(candidateText)) {
    boost += 34;
  }
  if (/\b(?:scrotal pain|testicular|torsion|penile discharge)\b/.test(context)
    && /\b(?:abdominal palpation|blood pressure|heart rate|bowel sounds)\b/.test(candidateText)) {
    boost += 36;
  }
  if (/\b(?:anxiety|depression|insomnia|malaise|fatigue|weight change)\b/.test(context)
    && /\b(?:heart rate|blood pressure|thyroid|sclerae|conjunctivae|mouth|respiratory rate)\b/.test(candidateText)) {
    boost += 28;
  }
  return boost;
}

export function rankEvidenceCandidates(catalog = [], contextText = "", tagRows = [], options = {}) {
  const context = normalizeEvidenceText(contextText);
  const matchedTags = extractEvidenceTags(contextText, tagRows);
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
  return candidate.source?.source_id || candidate.evidence_source_primary || "source";
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
  const evidenceBlock = formatEvidenceCandidatesBlock(ranked.candidates, options);
  return {
    prompt: evidenceBlock ? replaceStudentReferenceWithEvidenceBlock(prompt, evidenceBlock) : prompt,
    evidenceBlock,
    candidates: ranked.candidates,
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
