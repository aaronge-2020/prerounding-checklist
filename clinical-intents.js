export const clinicalIntentSchemaVersion = "clinical-intent-registry-v1";

const defaultReviewDate = "2026-06-06";
const defaultOwner = "clinical_content_lead";

function intent({
  intent_id,
  label,
  status = "validated",
  aliases = [],
  intent_type = "syndrome",
  source_ids = [],
  evidence_tags = [],
  complaint_module_id = "",
  clinical_bundle_ids = [],
  required_domains = [],
  avoid_labels = [],
  gold_case_ids = [],
  last_reviewed = defaultReviewDate,
  review_owner = defaultOwner
}) {
  return {
    schema_version: clinicalIntentSchemaVersion,
    intent_id,
    label,
    status,
    aliases,
    intent_type,
    source_ids,
    evidence_tags,
    complaint_module_id,
    clinical_bundle_ids,
    required_domains,
    avoid_labels,
    gold_case_ids,
    last_reviewed,
    review_owner
  };
}

export const clinicalIntentRegistry = [
  intent({
    intent_id: "dka_hhs_v1",
    label: "DKA/HHS or hyperglycemic crisis",
    aliases: ["dka", "diabetic ketoacidosis", "hhs", "hyperosmolar", "hyperglycemic crisis", "anion gap acidosis", "ketones", "insulin drip", "vomiting in diabetes", "missed insulin"],
    intent_type: "diagnosis",
    source_ids: ["ADA_HYPERGLYCEMIC_CRISES_2024", "ADA_STANDARDS_HOSPITAL_2026"],
    evidence_tags: ["DKA_HHS", "hypovolemia", "perfusion", "shock", "vitals", "vital_signs", "routine_vitals", "dehydration", "abdominal_pain", "respiratory_status", "pulmonary_exam"],
    complaint_module_id: "hyperglycemia_possible_dka_v1",
    clinical_bundle_ids: ["dka_hhs"],
    required_domains: ["vitals", "respiratory pattern", "volume/perfusion", "mental status", "abdomen"],
    avoid_labels: ["PMI", "Vibration sense", "Visual acuity", "Ophthalmoscopic exam", "Pronator drift"],
    gold_case_ids: ["dka_hhs", "hyperglycemia_possible_dka"]
  }),
  intent({
    intent_id: "suspected_pe_v1",
    label: "Suspected pulmonary embolism",
    aliases: ["suspected pe", "pulmonary embolism", "pleuritic chest pain", "vte", "dvt with dyspnea", "hypoxia with leg swelling", "unilateral leg swelling with shortness of breath"],
    intent_type: "diagnosis",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dyspnea", "hypoxia", "chest_pain", "cardiopulmonary", "perfusion", "shock", "vitals", "vital_signs", "lower_extremity", "vascular_exam", "dvt", "edema"],
    complaint_module_id: "chest_pain_v1",
    clinical_bundle_ids: ["suspected_pe", "chest_pain"],
    required_domains: ["vitals", "work of breathing/lungs", "cardiac strain/perfusion", "DVT leg exam"],
    avoid_labels: ["PMI", "Abdominal palpation", "Bowel sounds", "CVA tenderness", "Vibration sense"],
    gold_case_ids: ["suspected_pe"]
  }),
  intent({
    intent_id: "chest_pain_acs_v1",
    label: "Chest pain / ACS-style presentation",
    aliases: ["chest pain", "chest pressure", "angina", "acs", "acute coronary syndrome", "chest discomfort", "diaphoresis with chest pain"],
    intent_type: "complaint",
    source_ids: ["AHA_ACC_CHEST_PAIN_2021"],
    evidence_tags: ["chest_pain", "cardiopulmonary", "cardiac_exam", "perfusion", "shock", "vitals", "vital_signs", "dyspnea"],
    complaint_module_id: "chest_pain_v1",
    clinical_bundle_ids: ["chest_pain"],
    required_domains: ["vitals", "cardiopulmonary", "perfusion", "DVT add-on when PE features exist"],
    avoid_labels: ["Vibration sense", "Ophthalmoscopic exam"],
    gold_case_ids: ["chest_pain_acs"]
  }),
  intent({
    intent_id: "dyspnea_hf_v1",
    label: "Dyspnea / heart failure or volume overload",
    aliases: ["shortness of breath", "dyspnea", "sob", "can't breathe", "cant breathe", "orthopnea", "pnd", "heart failure", "volume overload", "pulmonary edema", "leg swelling with dyspnea"],
    intent_type: "syndrome",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dyspnea", "hypoxia", "heart_failure", "volume_overload", "cardiopulmonary", "pulmonary_exam", "perfusion", "vitals", "vital_signs", "edema"],
    clinical_bundle_ids: ["dyspnea_hf"],
    required_domains: ["vitals", "lungs/work of breathing", "JVP/edema", "heart sounds/perfusion"],
    avoid_labels: ["Murphy sign", "CVA tenderness", "Vibration sense"],
    gold_case_ids: ["dyspnea_volume_overload"]
  }),
  intent({
    intent_id: "abdominal_pain_cramping_v1",
    label: "Abdominal pain or cramping",
    aliases: ["abdominal pain", "abd pain", "stomach cramps", "belly cramps", "stomach pain", "belly pain", "tummy ache", "nausea", "vomiting", "diarrhea", "constipation", "bloating"],
    intent_type: "complaint",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["abdominal_pain", "abdomen", "abdominal_exam", "gi_gu_exam", "vitals", "vital_signs", "infection", "hypovolemia"],
    clinical_bundle_ids: ["abdominal_gi"],
    required_domains: ["vitals", "abdominal inspection", "bowel sounds", "palpation/peritoneal signs when indicated"],
    avoid_labels: ["PMI", "Visual acuity", "Vibration sense", "Pronator drift"],
    gold_case_ids: ["stomach_cramps", "abdominal_pain"]
  }),
  intent({
    intent_id: "pelvic_menstrual_pain_v1",
    label: "Pelvic, menstrual, or lower-abdominal pain",
    aliases: ["period cramps", "menstrual cramps", "dysmenorrhea", "pelvic pain", "lower belly cramps", "lower abdominal cramps", "cramps on period"],
    intent_type: "complaint",
    source_ids: ["ACOG_DYSMENORRHEA", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["pelvic_pain", "abdominal_pain", "abdomen", "abdominal_exam", "gynecology", "pregnancy", "vitals"],
    clinical_bundle_ids: ["pelvic_menstrual_pain"],
    required_domains: ["vitals", "lower abdominal exam", "pregnancy/PID/ectopic gap warnings"],
    avoid_labels: ["PMI", "Vibration sense", "Carotids"],
    gold_case_ids: ["period_cramps"]
  }),
  intent({
    intent_id: "gu_renal_dysuria_v1",
    label: "Dysuria, flank pain, pyelonephritis, or AKI/hypovolemia",
    aliases: ["dysuria", "burning pee", "burning urination", "painful urination", "uti", "pyelonephritis", "flank pain", "hematuria", "oliguria", "aki", "rising creatinine", "renal colic"],
    intent_type: "syndrome",
    source_ids: ["AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dysuria", "UTI", "pyelonephritis", "flank_pain", "AKI", "hypovolemia", "renal_colic", "vitals", "vital_signs", "abdominal_pain", "cva_tenderness"],
    clinical_bundle_ids: ["gu_renal"],
    required_domains: ["vitals", "volume/perfusion", "CVA/flank exam", "abdominal add-on when indicated"],
    avoid_labels: ["PMI", "Vibration sense", "Visual acuity"],
    gold_case_ids: ["dysuria_pyelo", "aki_hypovolemia"]
  }),
  intent({
    intent_id: "fever_sepsis_v1",
    label: "Fever, infection, or sepsis",
    aliases: ["fever", "chills", "rigors", "night sweats", "sepsis", "infection", "leukocytosis", "pneumonia", "lymphadenitis", "wound infection"],
    intent_type: "syndrome",
    source_ids: ["AHRQ_CALIBRATE_DX"],
    evidence_tags: ["infection", "sepsis", "pneumonia", "vitals", "vital_signs", "pulmonary_exam", "heent", "cva_tenderness", "abdominal_pain", "skin"],
    clinical_bundle_ids: ["infection_sepsis"],
    required_domains: ["vitals", "source-directed lung/HEENT/GU/abdomen/skin exam"],
    avoid_labels: ["PMI", "Visual acuity", "Vibration sense"],
    gold_case_ids: ["fever_sepsis"]
  }),
  intent({
    intent_id: "stroke_focal_neuro_v1",
    label: "Stroke or focal neurologic deficit",
    aliases: ["stroke", "tia", "facial droop", "face droop", "face weakness", "aphasia", "weakness", "hemiparesis", "numbness", "diplopia", "ataxia", "seizure", "vertigo with focal symptoms"],
    intent_type: "syndrome",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["stroke", "weakness", "vision_change", "cranial_nerve_exam", "neuro", "focal_neurologic_deficit", "gait", "vitals"],
    clinical_bundle_ids: ["neuro_red_flags"],
    required_domains: ["mental status", "cranial nerves", "motor/sensory localization", "coordination/gait when safe"],
    avoid_labels: ["Murphy sign", "PMI", "Lower extremity edema"],
    gold_case_ids: ["stroke_facial_weakness"]
  }),
  intent({
    intent_id: "hypoglycemia_jittery_v1",
    label: "Hypoglycemia-like, jittery, or adrenergic symptoms",
    aliases: ["hypoglycemia", "low sugar", "jittery", "feeling jittery", "shaky", "sweaty and shaky", "tremulous", "diaphoretic", "insulin reaction", "palpitations with sweating"],
    intent_type: "syndrome",
    source_ids: ["ADA_STANDARDS_HOSPITAL_2026"],
    evidence_tags: ["hypoglycemia", "inpatient_diabetes", "vitals", "vital_signs", "thyroid_disease", "cardiopulmonary", "mental_status"],
    clinical_bundle_ids: ["adrenergic_jittery"],
    required_domains: ["vitals", "mental status/glucose gap warning", "thyroid/cardiac add-ons when indicated"],
    avoid_labels: ["PMI", "CVA tenderness", "Broad abdominal exam"],
    gold_case_ids: ["hypoglycemia_jittery"]
  }),
  intent({
    intent_id: "thyroid_crisis_v1",
    label: "Thyroid storm or myxedema coma concern",
    aliases: [
      "thyroid storm",
      "thyrotoxic crisis",
      "thyrotoxic emergency",
      "hyperthyroid emergency",
      "hyperthyroid crisis",
      "fever agitation thyroid disease",
      "myxedema coma",
      "hypothyroid emergency",
      "hypothyroid crisis",
      "hypothermia with myxedema",
      "thyroid crisis"
    ],
    intent_type: "diagnosis",
    source_ids: ["ENDOCRINE_SOCIETY", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["thyroid_disease", "thyroid_storm", "myxedema", "vitals", "vital_signs", "cardiopulmonary", "mental_status"],
    clinical_bundle_ids: ["thyroid_endocrine"],
    required_domains: ["vitals/temperature", "thyroid exam", "cardiac rhythm/perfusion", "mental status when crisis possible"],
    avoid_labels: ["CVA tenderness", "Vibration sense"],
    gold_case_ids: ["thyroid_storm_myxedema"]
  }),
  intent({
    intent_id: "routine_thyroid_disease_gap_v1",
    label: "Routine thyroid disease evaluation",
    status: "partial",
    aliases: [
      "hyperthyroidism",
      "hyperthyroid",
      "graves",
      "graves disease",
      "thyrotoxicosis",
      "hypothyroidism",
      "hypothyroid",
      "hashimoto",
      "hashimoto thyroiditis",
      "goiter",
      "thyroid nodule",
      "thyroid cancer",
      "heat intolerance",
      "cold intolerance",
      "palpitations with thyroid"
    ],
    intent_type: "diagnosis",
    source_ids: ["AACE_ATA_HYPOTHYROIDISM_2012", "ATA_HYPERTHYROIDISM_2016", "ETA_THYROID_NODULE_2023"],
    evidence_tags: ["thyroid_disease", "vitals", "vital_signs", "cardiopulmonary", "heent_exam"],
    clinical_bundle_ids: ["thyroid_endocrine"],
    required_domains: ["vitals", "thyroid/neck exam", "cardiac exam when hyperthyroid symptoms"],
    avoid_labels: ["CVA tenderness", "Vibration sense"],
    gold_case_ids: [],
    review_owner: "endocrine_content_review"
  }),
  intent({
    intent_id: "diabetes_foot_neuropathy_v1",
    label: "Diabetes foot, neuropathy, wound, or discharge-risk exam",
    aliases: ["diabetic foot", "diabetes foot", "foot ulcer", "foot wound", "neuropathy", "burning toes", "numb feet", "protective sensation", "non healing foot"],
    intent_type: "syndrome",
    source_ids: ["ADA_STANDARDS_HOSPITAL_2026"],
    evidence_tags: ["inpatient_diabetes", "neuropathy", "foot", "wound", "vascular_exam", "peripheral_pulses", "skin", "vitals"],
    clinical_bundle_ids: ["diabetes_foot_neuropathy"],
    required_domains: ["foot inspection", "pulses/perfusion", "protective sensation"],
    avoid_labels: ["Ophthalmoscopic exam without vision context", "Murphy sign"],
    gold_case_ids: ["diabetes_foot"]
  }),
  intent({
    intent_id: "rash_skin_v1",
    label: "Rash, urticaria, wound, or skin lesion",
    aliases: ["rash", "hives", "urticaria", "itching", "pruritus", "skin lesion", "mole", "skin ulcer", "non healing wound", "cellulitis"],
    intent_type: "complaint",
    source_ids: ["AHRQ_CALIBRATE_DX"],
    evidence_tags: ["skin", "rash", "infection", "wound", "vascular_exam", "heent", "vitals"],
    clinical_bundle_ids: ["dermatology"],
    required_domains: ["skin morphology/distribution", "mucosal involvement when systemic", "wound/perfusion when relevant"],
    avoid_labels: ["PMI", "Vibration sense", "CVA tenderness"],
    gold_case_ids: ["rash_skin"]
  }),
  intent({
    intent_id: "heent_throat_ear_v1",
    label: "Sore throat, ear pain, nasal, or focused HEENT concern",
    aliases: ["sore throat", "pharyngitis", "earache", "ear pain", "otalgia", "hearing loss", "nasal congestion", "runny nose", "sinus pain", "epistaxis", "nosebleed", "dysphagia"],
    intent_type: "complaint",
    source_ids: ["AHRQ_CALIBRATE_DX"],
    evidence_tags: ["heent", "heent_exam", "mouth", "oropharynx", "ear_symptoms", "infection", "lymphadenopathy", "vitals"],
    clinical_bundle_ids: ["heent_focused"],
    required_domains: ["focused ear/nose/throat exam", "regional nodes when indicated", "airway/vitals when severe"],
    avoid_labels: ["PMI", "Lower extremity edema", "Abdominal palpation"],
    gold_case_ids: ["heent_throat_ear"]
  }),
  intent({
    intent_id: "bleeding_anemia_v1",
    label: "Bleeding, bruising, pallor, anemia, or GI bleed",
    aliases: ["easy bruising", "petechiae", "pallor", "bleeding gums", "nosebleeds", "epistaxis", "anemia", "fatigue with anemia", "black stool", "melena", "hematochezia", "vomiting blood", "hematemesis", "blood in stool"],
    intent_type: "syndrome",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["anemia", "bleeding", "pallor", "gi_bleed", "melena", "hematochezia", "vitals", "abdominal_pain", "heent", "skin"],
    clinical_bundle_ids: ["heme_bleeding_anemia", "gi_bleed_alarm"],
    required_domains: ["vitals/hemodynamics", "mucosa/conjunctiva/skin", "abdominal add-on for GI bleed"],
    avoid_labels: ["Vibration sense", "Babinski", "PMI"],
    gold_case_ids: ["gi_bleed", "anemia_bleeding"]
  }),
  intent({
    intent_id: "focused_msk_v1",
    label: "Focused musculoskeletal joint, back, neck, or injury concern",
    aliases: ["joint pain", "arthralgia", "joint swelling", "back pain", "neck pain", "shoulder pain", "knee pain", "ankle pain", "hand pain", "morning stiffness", "muscle pain", "trauma", "sprain"],
    intent_type: "complaint",
    source_ids: ["JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["msk_exam", "pain", "joint_pain", "back_pain", "weakness", "gait", "vitals"],
    clinical_bundle_ids: ["focused_msk"],
    required_domains: ["site-specific inspection/palpation/ROM", "neuro screen when back pain red flags", "vitals when infection/trauma"],
    avoid_labels: ["Mouth exam", "CVA tenderness", "PMI"],
    gold_case_ids: ["focused_msk"]
  })
];

export function normalizeClinicalIntentText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+%/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeIntentText(value) {
  const stop = new Set(["and", "or", "with", "without", "the", "a", "an", "of", "for", "to", "in", "on", "possible", "suspected", "concern"]);
  return normalizeClinicalIntentText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function containsPhrase(context, phrase) {
  const normalized = normalizeClinicalIntentText(phrase);
  if (!normalized) {
    return false;
  }
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(context);
}

function scoreClinicalIntent(intentRow, query) {
  const context = normalizeClinicalIntentText(query);
  if (!context) {
    return 0;
  }
  let score = 0;
  const label = normalizeClinicalIntentText(intentRow.label);
  const aliases = (intentRow.aliases || []).map(normalizeClinicalIntentText).filter(Boolean);
  if (context === label) {
    score += 120;
  } else if (containsPhrase(context, label) || containsPhrase(label, context)) {
    score += 70;
  }
  aliases.forEach((alias) => {
    if (context === alias) {
      score += 115;
    } else if (containsPhrase(context, alias)) {
      score += Math.min(85, 30 + alias.length / 2);
    } else if (containsPhrase(alias, context)) {
      score += 36;
    }
  });

  const queryTokens = new Set(tokenizeIntentText(context));
  const haystackTokens = new Set(tokenizeIntentText([
    intentRow.label,
    ...(intentRow.aliases || []),
    ...(intentRow.evidence_tags || []),
    ...(intentRow.required_domains || [])
  ].join(" ")));
  let overlap = 0;
  queryTokens.forEach((token) => {
    if (haystackTokens.has(token)) {
      overlap += 1;
    }
  });
  score += Math.min(34, overlap * 8);
  return Math.round(score);
}

export function resolveClinicalIntents(query, registry = clinicalIntentRegistry, options = {}) {
  const minScore = options.minScore || 24;
  const matches = registry
    .map((intentRow) => ({
      ...intentRow,
      score: scoreClinicalIntent(intentRow, query)
    }))
    .filter((intentRow) => intentRow.score >= minScore)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, options.limit || 8);
  return {
    query: String(query || ""),
    normalizedQuery: normalizeClinicalIntentText(query),
    matches,
    validatedMatches: matches.filter((intentRow) => intentRow.status === "validated"),
    requiresSelection: matches.some((intentRow) => intentRow.status === "validated"),
    unsupported: !matches.some((intentRow) => intentRow.status === "validated")
  };
}

export function getClinicalIntentById(intentId, registry = clinicalIntentRegistry) {
  return registry.find((intentRow) => intentRow.intent_id === intentId) || null;
}

export function selectedValidatedClinicalIntents(intentIds = [], registry = clinicalIntentRegistry) {
  const seen = new Set();
  return intentIds
    .map((intentId) => getClinicalIntentById(intentId, registry))
    .filter(Boolean)
    .filter((intentRow) => {
      if (seen.has(intentRow.intent_id)) {
        return false;
      }
      seen.add(intentRow.intent_id);
      return intentRow.status === "validated";
    });
}

export function clinicalIntentAllowedTags(intents = []) {
  const genericTags = ["vitals", "vital_signs", "routine_vitals", "blood_pressure", "heart_rate", "respiratory_rate", "temperature", "oxygenation"];
  return Array.from(new Set([
    ...genericTags,
    ...intents.flatMap((intentRow) => intentRow.evidence_tags || [])
  ].filter(Boolean)));
}

export function filterEvidenceCatalogForClinicalIntents(catalog = [], intents = []) {
  const validated = intents.filter((intentRow) => intentRow?.status === "validated");
  if (!validated.length) {
    return [];
  }
  const allowedTags = new Set(clinicalIntentAllowedTags(validated));
  const allowedBundles = new Set(validated.flatMap((intentRow) => intentRow.clinical_bundle_ids || []));
  return catalog.filter((candidate) => {
    const tags = candidate.tags || [];
    if (tags.some((tag) => allowedTags.has(tag))) {
      return true;
    }
    const text = normalizeClinicalIntentText([
      candidate.examLabel,
      candidate.maneuver,
      candidate.condition_or_syndrome,
      candidate.diagnostic_target,
      candidate.when_to_use_structured,
      candidate.retrieval_tags
    ].join(" "));
    return Array.from(allowedBundles).some((bundleId) => text.includes(normalizeClinicalIntentText(bundleId)));
  });
}

export function buildClinicalIntentRetrievalContext(intents = [], modifiers = "", setting = "", population = "") {
  return [
    setting,
    population,
    "validated clinical intent workup",
    ...intents.map((intentRow) => [
      `intent: ${intentRow.label}`,
      `intent_id: ${intentRow.intent_id}`,
      `intent tags: ${(intentRow.evidence_tags || []).join("; ")}`,
      `clinical bundles: ${(intentRow.clinical_bundle_ids || []).join("; ")}`,
      `required domains: ${(intentRow.required_domains || []).join("; ")}`
    ].filter(Boolean).join("\n")),
    modifiers ? `patient modifiers: ${modifiers}` : ""
  ].filter(Boolean).join("\n");
}

export function buildValidatedClinicalIntentPromptBlock(intents = [], modifiers = "", warnings = []) {
  const validated = intents.filter((intentRow) => intentRow?.status === "validated");
  const lines = [
    "<validated_clinical_intents>",
    validated.length
      ? "Use only these manually validated clinical intents as the authority for question/exam scope."
      : "No manually validated clinical intent was selected. Do not invent a recommended bedside exam checklist.",
    ...validated.map((intentRow) => [
      `- ${intentRow.intent_id}: ${intentRow.label}`,
      `  status: ${intentRow.status}`,
      `  sources: ${(intentRow.source_ids || []).join("; ") || "source pending"}`,
      `  evidence tags: ${(intentRow.evidence_tags || []).join("; ")}`,
      `  required domains: ${(intentRow.required_domains || []).join("; ")}`,
      `  avoid labels: ${(intentRow.avoid_labels || []).join("; ")}`
    ].join("\n")),
    "</validated_clinical_intents>",
    "",
    "<patient_modifiers>",
    modifiers ? String(modifiers).trim() : "No additional patient modifiers entered.",
    "</patient_modifiers>",
    "",
    "<unsupported_or_gap_warnings>",
    warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") : "- None.",
    "</unsupported_or_gap_warnings>"
  ];
  return lines.join("\n");
}

export function validateClinicalIntentRegistry(registry = clinicalIntentRegistry) {
  const issues = [];
  const ids = new Set();
  const validStatuses = new Set(["validated", "partial", "draft", "unsupported"]);
  registry.forEach((intentRow, index) => {
    const label = intentRow.intent_id || intentRow.label || `intent ${index + 1}`;
    if (!intentRow.intent_id || ids.has(intentRow.intent_id)) {
      issues.push(`${label} has duplicate or missing intent_id.`);
    }
    ids.add(intentRow.intent_id);
    if (!intentRow.label) {
      issues.push(`${label} is missing label.`);
    }
    if (!validStatuses.has(intentRow.status)) {
      issues.push(`${label} has invalid status ${intentRow.status || "blank"}.`);
    }
    for (const field of ["aliases", "source_ids", "evidence_tags", "clinical_bundle_ids", "required_domains", "avoid_labels", "gold_case_ids"]) {
      if (!Array.isArray(intentRow[field])) {
        issues.push(`${label} field ${field} must be an array.`);
      }
    }
    if (intentRow.status === "validated" && !(intentRow.aliases || []).length) {
      issues.push(`${label} validated intent needs aliases.`);
    }
    if (intentRow.status === "validated" && (!(intentRow.source_ids || []).length || !(intentRow.gold_case_ids || []).length)) {
      issues.push(`${label} validated intent needs source_ids and gold_case_ids.`);
    }
  });
  return {
    ok: issues.length === 0,
    issues
  };
}
