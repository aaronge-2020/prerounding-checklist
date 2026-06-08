import { complaintModules as installedComplaintModules } from "./medical-knowledge-db.js?v=20260608-workup-quality";

export const clinicalIntentSchemaVersion = "clinical-intent-registry-v1";

const defaultReviewDate = "2026-06-06";
const defaultOwner = "clinical_content_lead";

function splitClinicalIntentRuleList(value = "") {
  if (Array.isArray(value)) {
    return uniqueNormalizedStrings(value);
  }
  return uniqueNormalizedStrings(String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean));
}

function suppressRuleSlug(value = "") {
  return normalizeClinicalIntentText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "item";
}

function suppressRuleAllowedTagsForLabel(label = "") {
  const normalized = normalizeClinicalIntentText(label);
  const rules = [
    { label: /\bpmi|apical impulse|point maximal impulse\b/, tags: ["heart_failure", "cardiomyopathy", "volume_overload", "murmur", "cardiac_exam"] },
    { label: /\bvibration sense|proprioception|broad neuro|pronator drift|babinski|gait|finger to nose|heel to shin|romberg|reflex\b/, tags: ["stroke", "focal_neuro", "weakness", "paresthesia", "neuropathy", "diabetes_foot", "gait", "ataxia", "fall", "cord_compression"] },
    { label: /\bvisual acuity|ophthalmoscopic|fundoscopic|visual fields|extraocular\b/, tags: ["vision_change", "eye_pain", "headache", "papilledema", "pituitary", "sellar", "orbitopathy", "graves_eye"] },
    { label: /\bbroad abdominal|murphy|rebound|psoas|obturator|cva tenderness|liver|spleen\b/, tags: ["abdominal_pain", "vomiting", "diarrhea", "jaundice", "gi_bleed", "flank_pain", "dysuria", "peritonitis", "biliary_disease", "appendicitis", "pyelonephritis"] },
    { label: /\blower extremity edema|edema\b/, tags: ["edema", "heart_failure", "volume_overload", "renal_disease", "dvt", "hypothyroidism", "myxedema"] },
    { label: /\blymph|node\b/, tags: ["lymphadenopathy", "infection", "malignancy", "sore_throat", "neck_mass", "skin_lesion", "night_sweats", "weight_loss"] },
    { label: /\bcarotid\b/, tags: ["syncope", "stroke", "tia", "bruit", "vascular_exam"] },
    { label: /\bmouth exam|oropharynx\b/, tags: ["dehydration", "hypovolemia", "sore_throat", "infection", "angioedema", "mucosal_lesion"] }
  ];
  return rules.find((rule) => rule.label.test(normalized))?.tags || ["explicit_patient_modifier", "secondary_validated_intent"];
}

export function normalizeClinicalIntentSuppressRules({
  intentId = "",
  intentLabel = "",
  avoidLabels = [],
  suppressRules = []
} = {}) {
  const rules = (Array.isArray(suppressRules) && suppressRules.length)
    ? suppressRules
    : splitClinicalIntentRuleList(avoidLabels).map((label) => ({ suppress_labels: [label] }));
  const normalized = [];
  const seen = new Set();
  rules.forEach((rule, index) => {
    const objectRule = typeof rule === "object" && rule !== null
      ? rule
      : { suppress_labels: [rule] };
    const suppressLabels = splitClinicalIntentRuleList(
      objectRule.suppress_labels || objectRule.avoid_labels || objectRule.label || objectRule.labels || ""
    );
    if (!suppressLabels.length) {
      return;
    }
    const firstLabel = suppressLabels[0];
    const ruleId = String(objectRule.rule_id || `${intentId || "intent"}_suppress_${suppressRuleSlug(firstLabel)}_${index + 1}`).trim();
    const key = `${ruleId.toLowerCase()}::${suppressLabels.map(normalizeClinicalIntentText).join("|")}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({
      rule_id: ruleId,
      intent_ids: splitClinicalIntentRuleList(objectRule.intent_ids || objectRule.intent_id || intentId),
      suppress_labels: suppressLabels,
      reason: String(objectRule.reason || `${suppressLabels.join("; ")} is outside the validated scope for ${intentLabel || intentId} unless patient modifiers or another validated intent explicitly support that organ-system context.`).trim(),
      unless_tags_include: splitClinicalIntentRuleList(objectRule.unless_tags_include || objectRule.unless_context_tags || suppressLabels.flatMap(suppressRuleAllowedTagsForLabel)),
      rule_scope: String(objectRule.rule_scope || "validated_intent_suppress_unless_triggered").trim()
    });
  });
  return normalized;
}

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
  suppress_rules = [],
  gold_case_ids = [],
  last_reviewed = defaultReviewDate,
  review_owner = defaultOwner
}) {
  const normalizedAvoidLabels = uniqueNormalizedStrings(avoid_labels);
  const normalizedSuppressRules = normalizeClinicalIntentSuppressRules({
    intentId: intent_id,
    intentLabel: label,
    avoidLabels: normalizedAvoidLabels,
    suppressRules: suppress_rules
  });
  const suppressLabels = uniqueNormalizedStrings(normalizedSuppressRules.flatMap((rule) => rule.suppress_labels || []));
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
    avoid_labels: normalizedAvoidLabels.length ? normalizedAvoidLabels : suppressLabels,
    suppress_rules: normalizedSuppressRules,
    gold_case_ids,
    last_reviewed,
    review_owner
  };
}

const curatedClinicalIntentRegistry = [
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
    aliases: ["suspected pe", "suspected pulmonary embolism", "pulmonary embolism", "pe dyspnea", "dvt pe dyspnea", "dyspnea with dvt", "shortness of breath with dvt", "pleuritic chest pain", "vte", "dvt with dyspnea", "hypoxia with leg swelling", "unilateral leg swelling with shortness of breath"],
    intent_type: "diagnosis",
    source_ids: ["ESC_PE_2019", "ACEP_VTE_POLICY", "ASH_VTE_DIAGNOSIS", "CDC_VTE_DIAGNOSIS", "JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dyspnea", "hypoxia", "chest_pain", "cardiopulmonary", "perfusion", "shock", "vitals", "vital_signs", "lower_extremity", "vascular_exam", "dvt", "vte", "edema", "pulmonary_embolism", "d_dimer", "ctpa", "vq_scan", "clinical_probability", "anticoagulation_safety"],
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
    source_ids: ["AHA_ACC_HFSA_HF_2022", "ESC_HF_2021", "JAMA_RCE", "SM25", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dyspnea", "hypoxia", "heart_failure", "acute_heart_failure", "volume_overload", "cardiopulmonary", "pulmonary_exam", "perfusion", "vitals", "vital_signs", "edema", "bnp", "nt_probnp", "cxr", "ecg", "troponin", "renal_function", "electrolytes", "red_flag"],
    clinical_bundle_ids: ["dyspnea_hf"],
    required_domains: ["vitals", "lungs/work of breathing", "JVP/edema", "heart sounds/perfusion", "Dyspnea/HF initial tests", "respiratory/hemodynamic red flags"],
    avoid_labels: ["Murphy sign", "CVA tenderness", "Vibration sense"],
    gold_case_ids: ["dyspnea_volume_overload"]
  }),
  intent({
    intent_id: "sleep_apnea_snoring_v1",
    label: "Snoring or suspected obstructive sleep apnea",
    aliases: ["snoring", "sleep apnea", "obstructive sleep apnea", "osa", "witnessed apnea", "daytime sleepiness", "waking choking", "morning headaches with snoring", "drowsy driving", "resistant hypertension with snoring"],
    intent_type: "complaint",
    source_ids: ["AASM_OSA_DIAGNOSTIC_2017", "MCGEE_EBPD", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["sleep_apnea", "snoring", "upper_airway", "heent", "hypertension", "cardiometabolic", "vitals", "vital_signs"],
    clinical_bundle_ids: ["sleep_apnea_airway"],
    required_domains: ["sleep symptom history", "upper airway exam", "blood pressure/cardiometabolic safety", "neck circumference and upper-airway risk measurement when feasible"],
    avoid_labels: ["Abdominal palpation", "Bowel sounds", "CVA tenderness", "Murphy sign", "Pronator drift", "Babinski sign", "Vibration sense"],
    gold_case_ids: ["pulm_snoring_sleep_apnea"]
  }),
  intent({
    intent_id: "abdominal_pain_cramping_v1",
    label: "Abdominal pain or cramping",
    aliases: ["abdominal pain", "abd pain", "stomach cramps", "belly cramps", "stomach pain", "belly pain", "tummy ache", "nausea", "vomiting", "diarrhea", "constipation", "bloating"],
    intent_type: "complaint",
    source_ids: ["AAFP_ACUTE_ABD_PAIN_2023", "ACR_RLQ_PAIN_2022", "ACR_RUQ_PAIN_2022", "JAMA_RCE", "MCGEE_EBPD", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["abdominal_pain", "abdomen", "abdominal_exam", "gi_gu_exam", "vitals", "vital_signs", "infection", "hypovolemia", "peritonitis", "acute_abdomen", "appendicitis", "biliary_disease", "pancreatitis", "obstruction", "gi_bleed", "pregnancy", "ectopic", "urinary", "flank_pain", "diagnostic_test", "red_flag"],
    clinical_bundle_ids: ["abdominal_gi"],
    required_domains: ["vitals", "abdominal inspection", "bowel sounds", "palpation/peritoneal signs when indicated", "abdominal pain initial tests", "acute abdomen red flags"],
    avoid_labels: ["PMI", "Visual acuity", "Vibration sense", "Pronator drift"],
    gold_case_ids: ["stomach_cramps", "abdominal_pain"]
  }),
  intent({
    intent_id: "pelvic_menstrual_pain_v1",
    label: "Pelvic, menstrual, or lower-abdominal pain",
    aliases: ["period cramps", "menstrual cramps", "dysmenorrhea", "pelvic pain", "lower belly cramps", "lower abdominal cramps", "cramps on period"],
    intent_type: "complaint",
    source_ids: ["ACOG_ENDOMETRIOSIS_DIAGNOSIS_2026", "CDC_STI_2021", "ACOG_ECTOPIC_FAQ", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["pelvic_pain", "abdominal_pain", "abdomen", "abdominal_exam", "gynecology", "pregnancy", "PID", "ectopic", "vitals", "diagnostic_test", "red_flag"],
    clinical_bundle_ids: ["pelvic_menstrual_pain"],
    required_domains: ["vitals", "lower abdominal exam", "pregnancy/PID/ectopic danger cues"],
    avoid_labels: ["PMI", "Vibration sense", "Carotids"],
    gold_case_ids: ["period_cramps"]
  }),
  intent({
    intent_id: "gu_renal_dysuria_v1",
    label: "Dysuria, flank pain, pyelonephritis, or AKI/hypovolemia",
    aliases: ["dysuria", "burning pee", "burning urination", "painful urination", "uti", "pyelonephritis", "flank pain", "hematuria", "oliguria", "aki", "rising creatinine", "renal colic"],
    intent_type: "syndrome",
    source_ids: ["IDSA_CUTI_2025", "EAU_URO_INFECTIONS", "ACOG_UTI_PREGNANCY_2023", "NICE_RENAL_STONES", "JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["dysuria", "UTI", "pyelonephritis", "flank_pain", "AKI", "hypovolemia", "renal_colic", "vitals", "vital_signs", "abdominal_pain", "cva_tenderness", "urinalysis", "urine_culture", "pregnancy", "urosepsis", "obstruction", "renal_function", "diagnostic_test", "red_flag"],
    clinical_bundle_ids: ["gu_renal"],
    required_domains: ["vitals", "volume/perfusion", "CVA/flank exam", "abdominal add-on when indicated", "urine and renal tests", "urosepsis or obstruction red flags"],
    avoid_labels: ["PMI", "Vibration sense", "Visual acuity"],
    gold_case_ids: ["dysuria_pyelo", "aki_hypovolemia"]
  }),
  intent({
    intent_id: "genital_discharge_sti_v1",
    label: "Genital discharge or STI-source evaluation",
    aliases: ["penile discharge", "urethral discharge", "genital discharge", "sti symptoms", "sexually transmitted infection", "genital sores", "urethritis"],
    intent_type: "syndrome",
    source_ids: ["CDC_STI_2021", "AHRQ_CALIBRATE_DX", "MCGEE_EBPD"],
    evidence_tags: ["genital_discharge", "sti", "gu", "dysuria", "infection", "urethritis", "genital_exam", "inguinal_nodes", "vitals", "red_flag"],
    clinical_bundle_ids: ["genital_discharge_sti"],
    required_domains: ["consented genital/STI exam", "inguinal nodes when lesion or STI concern", "systemic infection safety when febrile"],
    avoid_labels: ["Visual acuity", "PMI", "Bowel sounds", "Murphy sign"],
    gold_case_ids: ["gu_penile_discharge"]
  }),
  intent({
    intent_id: "acute_scrotal_pain_v1",
    label: "Acute scrotal pain, swelling, or torsion concern",
    aliases: ["scrotal pain", "scrotal swelling", "testicular pain", "testicular torsion", "acute scrotum", "high riding testis", "testicle pain"],
    intent_type: "syndrome",
    source_ids: ["AUA_ACUTE_SCROTUM", "EAU_ACUTE_SCROTUM", "AHRQ_CALIBRATE_DX", "MCGEE_EBPD"],
    evidence_tags: ["acute_scrotum", "testicular_torsion", "scrotal_pain", "gu", "abdominal_pain", "infection", "gi_gu_exam", "vitals", "red_flag"],
    clinical_bundle_ids: ["acute_scrotal_pain"],
    required_domains: ["acute scrotum history", "consented scrotal/testicular exam", "cremasteric reflex with limitations", "abdominal add-on when referred pain or nausea is present", "urology escalation red flags"],
    avoid_labels: ["Visual acuity", "Vibration sense", "PMI", "Liver span"],
    gold_case_ids: ["gu_scrotal_pain", "dx_testicular_torsion"]
  }),
  intent({
    intent_id: "fever_sepsis_v1",
    label: "Fever, infection, or sepsis",
    aliases: ["fever", "chills", "rigors", "night sweats", "sepsis", "infection", "leukocytosis", "pneumonia", "lymphadenitis", "wound infection"],
    intent_type: "syndrome",
    source_ids: ["SSC_SEPSIS_2026", "ATS_CAP_2025", "IDSA_CAP_PATHWAY_2019", "MERCK_FEVER_ADULTS", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["infection", "sepsis", "pneumonia", "vitals", "vital_signs", "perfusion", "shock", "pulmonary_exam", "heent", "cva_tenderness", "abdominal_pain", "skin"],
    complaint_module_id: "fever_infection_sepsis_v1",
    clinical_bundle_ids: ["infection_sepsis"],
    required_domains: [
      "vitals/temperature",
      "mental status/perfusion",
      "source-localizing infection history",
      "respiratory source screen",
      "skin/wound source screen",
      "source-directed HEENT add-ons when indicated",
      "source-directed GU/flank add-ons when indicated",
      "source-directed abdomen add-ons when indicated"
    ],
    avoid_labels: ["PMI", "Visual acuity", "Vibration sense"],
    gold_case_ids: ["fever_sepsis"]
  }),
  intent({
    intent_id: "stroke_focal_neuro_v1",
    label: "Stroke or focal neurologic deficit",
    aliases: ["stroke", "tia", "facial droop", "face droop", "face weakness", "aphasia", "weakness", "hemiparesis", "numbness", "diplopia", "ataxia", "seizure", "vertigo with focal symptoms"],
    intent_type: "syndrome",
    source_ids: ["AHA_ASA_STROKE_2019", "JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["stroke", "weakness", "vision_change", "cranial_nerve_exam", "neuro", "focal_neurologic_deficit", "gait", "vitals", "glucose", "neuroimaging", "red_flag"],
    clinical_bundle_ids: ["neuro_red_flags"],
    required_domains: ["mental status", "cranial nerves", "motor/sensory localization", "coordination/gait when safe"],
    avoid_labels: ["Murphy sign", "PMI", "Lower extremity edema"],
    gold_case_ids: ["stroke_facial_weakness"]
  }),
  intent({
    intent_id: "spine_cord_compression_v1",
    label: "Back pain, incontinence, or cord compression red flags",
    aliases: ["cord compression", "cauda equina", "saddle anesthesia", "saddle numbness", "urinary incontinence with back pain", "urinary retention with back pain", "back pain weakness", "myelopathy"],
    intent_type: "syndrome",
    source_ids: ["ACP_LOW_BACK_PAIN_2017", "AHRQ_CALIBRATE_DX", "MCGEE_EBPD"],
    evidence_tags: ["cord_compression", "cauda_equina", "saddle_sensation", "weakness", "gait", "neuro", "vitals", "MRI", "red_flag"],
    clinical_bundle_ids: ["spine_cord_compression"],
    required_domains: ["lower-extremity strength/reflex localization", "gait safety when safe", "saddle sensation and bowel/bladder safety when cord compression is possible"],
    avoid_labels: ["PMI", "Broad abdominal exam"],
    gold_case_ids: ["gu_incontinence", "dx_cord_compression"]
  }),
  intent({
    intent_id: "hypoglycemia_jittery_v1",
    label: "Hypoglycemia-like, jittery, or adrenergic symptoms",
    aliases: ["hypoglycemia", "low sugar", "jittery", "feeling jittery", "shaky", "sweaty and shaky", "tremor", "tremors", "tremulous", "diaphoretic", "insulin reaction", "palpitations with sweating", "palpitations with tremor"],
    intent_type: "syndrome",
    source_ids: ["ADA_STANDARDS_HOSPITAL_2026", "ES_HYPOGLYCEMIA_2009", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["hypoglycemia", "inpatient_diabetes", "vitals", "vital_signs", "thyroid_disease", "cardiopulmonary", "mental_status", "glucose", "Whipple_triad", "red_flag"],
    clinical_bundle_ids: ["adrenergic_jittery"],
    required_domains: ["vitals", "mental status and bedside glucose safety", "thyroid/cardiac add-ons when indicated"],
    avoid_labels: ["PMI", "CVA tenderness", "Broad abdominal exam"],
    gold_case_ids: ["hypoglycemia_jittery", "endo_hyperhidrosis", "neuro_tremors"]
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
    source_ids: ["JTA_JES_THYROID_STORM_2016", "ATA_HYPERTHYROIDISM_2016", "ATA_HYPOTHYROIDISM_2014", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["thyroid_disease", "thyroid_storm", "myxedema", "vitals", "vital_signs", "cardiopulmonary", "mental_status"],
    clinical_bundle_ids: ["thyroid_endocrine"],
    required_domains: ["vitals/temperature", "thyroid exam", "cardiac rhythm/perfusion", "mental status when crisis possible"],
    avoid_labels: ["CVA tenderness", "Vibration sense"],
    gold_case_ids: ["thyroid_storm_myxedema"]
  }),
  intent({
    intent_id: "routine_thyroid_disease_v1",
    label: "Routine thyroid disease evaluation",
    aliases: [
      "routine thyroid disease evaluation",
      "routine thyroid evaluation",
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
      "thyroid mass",
      "heat intolerance",
      "cold intolerance",
      "palpitations with thyroid",
      "thyroid labs abnormal",
      "abnormal tsh"
    ],
    intent_type: "syndrome",
    source_ids: ["ATA_HYPOTHYROIDISM_2014", "AACE_ATA_HYPOTHYROIDISM_2012", "ATA_HYPERTHYROIDISM_2016", "ATA_THYROID_NODULE_DTC_2015", "ATA_THYROID_CANCER_2025", "ETA_THYROID_NODULE_2023"],
    evidence_tags: ["thyroid_disease", "thyroid_exam", "vitals", "vital_signs", "cardiopulmonary", "heent_exam", "eye_vision", "lymphadenopathy"],
    clinical_bundle_ids: ["routine_thyroid"],
    required_domains: ["vitals/HR/BP", "thyroid/neck exam", "cardiac rhythm/perfusion when thyrotoxic symptoms are present", "eye/orbitopathy screen when eye symptoms are present", "cervical nodes/compressive symptoms when structural thyroid concern is present"],
    avoid_labels: ["CVA tenderness", "Vibration sense", "PMI", "Broad abdominal exam"],
    gold_case_ids: ["routine_thyroid_disease", "graves_disease", "hypothyroidism", "thyroid_nodule"],
    review_owner: "endocrine_content_review"
  }),
  intent({
    intent_id: "diabetes_foot_neuropathy_v1",
    label: "Diabetes foot, neuropathy, wound, or discharge-risk exam",
    aliases: ["diabetic foot", "diabetes foot", "foot ulcer", "foot wound", "neuropathy", "burning toes", "numb feet", "protective sensation", "non healing foot"],
    intent_type: "syndrome",
    source_ids: ["ADA_FOOT_CARE_2026", "ADA_STANDARDS_HOSPITAL_2026", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["inpatient_diabetes", "neuropathy", "foot", "wound", "vascular_exam", "peripheral_pulses", "skin", "monofilament", "vitals", "diagnostic_test", "red_flag"],
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
    source_ids: ["AHRQ_CALIBRATE_DX", "MCGEE_EBPD"],
    evidence_tags: ["skin", "rash", "infection", "wound", "vascular_exam", "heent", "mucosal", "anaphylaxis", "vitals", "diagnostic_test", "red_flag"],
    clinical_bundle_ids: ["dermatology"],
    required_domains: ["skin morphology/distribution", "mucosal involvement when systemic", "wound/perfusion when relevant"],
    avoid_labels: ["PMI", "Vibration sense", "CVA tenderness"],
    gold_case_ids: ["rash_skin", "derm_ulcer_wound"]
  }),
  intent({
    intent_id: "eye_redness_vision_v1",
    label: "Eye redness, discharge, or vision change",
    aliases: ["eye redness", "red eye", "eye discharge", "ocular redness", "vision change", "eye pain", "photophobia"],
    intent_type: "complaint",
    source_ids: ["AAO_CONJUNCTIVITIS_PPP_2023", "AHRQ_CALIBRATE_DX", "JAMA_RCE"],
    evidence_tags: ["eye_vision", "heent_exam", "vision_change", "infection", "vitals", "visual_acuity", "red_eye", "red_flag"],
    clinical_bundle_ids: ["eye_vision"],
    required_domains: ["visual acuity and pupils", "sclerae/conjunctivae", "extraocular or visual-field screen when neurologic or vision symptoms are present"],
    avoid_labels: ["Abdominal palpation", "PMI", "Vibration sense"],
    gold_case_ids: ["id_eye_redness"]
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
    source_ids: ["ACG_UGIB_2021", "JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["anemia", "bleeding", "pallor", "gi_bleed", "melena", "hematochezia", "vitals", "abdominal_pain", "heent", "skin", "CBC", "type_screen", "red_flag"],
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
    source_ids: ["AAFP_MONOARTHRITIS_2025", "ACP_LOW_BACK_PAIN_2017", "JAMA_RCE", "AHRQ_CALIBRATE_DX"],
    evidence_tags: ["msk_exam", "pain", "joint_pain", "back_pain", "weakness", "gait", "vitals", "septic_arthritis", "fracture", "imaging", "red_flag"],
    clinical_bundle_ids: ["focused_msk"],
    required_domains: ["site-specific inspection/palpation/ROM", "neuro screen when back pain red flags", "vitals when infection/trauma"],
    avoid_labels: ["Mouth exam", "CVA tenderness", "PMI"],
    gold_case_ids: ["focused_msk", "msk_myalgia"]
  }),
  intent({
    intent_id: "muscle_cramps_neuromuscular_v1",
    label: "Muscle cramps or neuromuscular irritability",
    aliases: ["muscle cramps", "leg cramps", "cramping muscles", "tetany", "myalgia cramps", "cramps with weakness"],
    intent_type: "complaint",
    source_ids: ["AHRQ_CALIBRATE_DX", "MCGEE_EBPD", "ES_HYPOGLYCEMIA_2009"],
    evidence_tags: ["muscle_cramps", "myalgia", "neuromuscular", "weakness", "vitals", "electrolytes", "CK", "glucose", "red_flag"],
    clinical_bundle_ids: ["neuromuscular_cramps"],
    required_domains: ["vitals/hydration", "focused muscle tenderness and site-specific pain exam", "motor/reflex screen when weakness is present"],
    avoid_labels: ["Abdominal palpation", "Visual acuity", "PMI"],
    gold_case_ids: ["msk_muscle_cramps"]
  })
];

function uniqueStrings(items = []) {
  const seen = new Set();
  return items
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function uniqueNormalizedStrings(items = []) {
  const seen = new Set();
  return items
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeClinicalIntentText(item) || item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function intentIdFromModuleId(moduleId = "") {
  return `${String(moduleId || "")
    .replace(/_v1$/i, "")
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "")}_intent_v1`;
}

function isStandaloneThyroidCategory(normalizedCategory = "") {
  return /\bthyroid\b/.test(normalizedCategory) && !/\bparathyroid\b/.test(normalizedCategory);
}

function tagsForModule(module = {}) {
  const category = module.endocrine_metadata?.category || module.complaint_group || "";
  const label = module.label || "";
  const normalizedCategory = normalizeClinicalIntentText(category);
  const normalizedLabel = normalizeClinicalIntentText(label);
  const categoryTags = [];
  if (/diabetes|blood sugar/.test(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "inpatient_diabetes", "diabetes_mellitus", "glucose_disorder", "vitals", "vital_signs");
  } else if (isStandaloneThyroidCategory(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "thyroid_disease", "thyroid_exam", "cardiopulmonary", "vitals", "vital_signs");
  } else if (/bone|parathyroid/.test(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "hypercalcemia", "hypocalcemia", "bone_health", "weakness", "gait", "vitals", "vital_signs");
  } else if (/adrenal/.test(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "adrenal_insufficiency", "shock", "hypovolemia", "perfusion", "vitals", "vital_signs");
  } else if (/reproductive|gonadal/.test(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "reproductive_endocrine", "gynecology", "androgen", "vitals", "vital_signs");
  } else if (/pituitary/.test(normalizedCategory)) {
    categoryTags.push("endocrine_metabolic", "pituitary", "sellar", "vision_change", "cranial_nerve_exam", "vitals", "vital_signs");
  }
  if (/diabetes insipidus|hypernatremia|polyuria/.test(normalizedLabel)) {
    categoryTags.push("hypovolemia", "perfusion", "mental_status");
  }
  if (/dka|hhs|diabetic ketoacidosis|hyperosmolar|hyperglycemic crisis/.test(normalizedLabel)) {
    categoryTags.push("DKA_HHS", "hypovolemia", "perfusion", "mental_status");
  }
  if (/hypoglycemia|low blood sugar/.test(normalizedLabel)) {
    categoryTags.push("hypoglycemia", "mental_status", "adrenergic_symptoms");
  }
  if (/pheochromocytoma|hyperaldosteronism|cushing|adrenal/.test(normalizedLabel)) {
    categoryTags.push("cardiopulmonary", "perfusion", "shock");
  }
  if (/osteoporosis|osteopenia|vitamin d|osteomalacia|hyperparathyroidism|hypoparathyroidism/.test(normalizedLabel)) {
    categoryTags.push("msk_exam", "fall_risk", "weakness");
  }
  return uniqueStrings([
    "validated_guideline_workup",
    module.complaint_group,
    categoryTags,
    normalizedLabel.split(/\s+/).filter((token) => token.length >= 4)
  ]);
}

function requiredDomainsForModule(module = {}) {
  const category = normalizeClinicalIntentText(module.endocrine_metadata?.category || module.complaint_group || "");
  const label = normalizeClinicalIntentText(module.label || "");
  const domains = ["basic bedside safety", "focused endocrine history", "guideline-backed physical exam", "tests/reference thresholds", "red flags/management changes"];
  if (isStandaloneThyroidCategory(category)) {
    domains.push("thyroid/neck exam", "cardiac rhythm/perfusion when symptomatic");
  }
  if (/diabetes|blood sugar/.test(category)) {
    domains.push("hydration/perfusion when volume status is clinically relevant", "diabetes foot/skin when relevant", "glycemic safety");
    if (/dka|hhs|diabetic ketoacidosis|hyperosmolar|hyperglycemic crisis/.test(label)) {
      domains.push("hyperglycemic crisis safety");
    }
    if (/hypoglycemia|low blood sugar/.test(label)) {
      domains.push("hypoglycemia safety");
    }
  }
  if (/bone|parathyroid/.test(category)) {
    domains.push("bone tenderness/strength/gait when relevant", "calcium complication signs");
  }
  if (/adrenal/.test(category)) {
    domains.push("orthostasis/volume", "adrenal phenotype", "crisis features when acute");
  }
  if (/pituitary/.test(category) || /prolactinoma|acromegaly|hypopituitarism|diabetes insipidus/.test(label)) {
    domains.push("visual fields/cranial nerve screen when mass effect possible", "pituitary hormone phenotype");
  }
  if (/reproductive|gonadal/.test(category)) {
    domains.push("reproductive/endocrine phenotype", "pregnancy/fertility safety when relevant");
  }
  return uniqueStrings(domains);
}

function avoidLabelsForModule(module = {}) {
  const category = normalizeClinicalIntentText(module.endocrine_metadata?.category || module.complaint_group || "");
  const label = normalizeClinicalIntentText(module.label || "");
  const avoid = ["PMI", "Broad abdominal exam", "Broad neuro exam", "Unrelated lymph-node survey"];
  if (!/pituitary|diabetes insipidus|prolactinoma|acromegaly|gigantism|thyroid cancer|thyroid nodule/.test(`${category} ${label}`)) {
    avoid.push("Visual acuity", "Ophthalmoscopic exam");
  }
  if (!/diabetes|neuropathy|foot|wound/.test(`${category} ${label}`)) {
    avoid.push("Vibration sense");
  }
  if (!/adrenal|diabetes|hypercalcemia|abdominal|vomiting/.test(`${category} ${label}`)) {
    avoid.push("CVA tenderness", "Murphy sign");
  }
  return uniqueStrings(avoid);
}

function aliasesForModule(module = {}) {
  const label = module.label || "";
  const metadata = module.endocrine_metadata || {};
  return uniqueNormalizedStrings([
    label,
    metadata.source_diagnosis,
    metadata.aliases,
    module.triggers,
    normalizeClinicalIntentText(label.replace(/\([^)]*\)/g, "")),
    normalizeClinicalIntentText(label.replace(/['’]/g, ""))
  ]).filter((alias) => alias.length >= 3);
}

function moduleBackedIntent(module = {}) {
  const metadata = module.endocrine_metadata || {};
  return intent({
    intent_id: intentIdFromModuleId(module.id),
    label: module.label,
    status: "validated",
    aliases: aliasesForModule(module),
    intent_type: "diagnosis",
    source_ids: metadata.source_ids || [],
    evidence_tags: tagsForModule(module),
    complaint_module_id: module.id,
    clinical_bundle_ids: ["installed_guideline_module"],
    required_domains: requiredDomainsForModule(module),
    avoid_labels: avoidLabelsForModule(module),
    gold_case_ids: [`${module.id.replace(/_v1$/i, "")}_gold`],
    last_reviewed: defaultReviewDate,
    review_owner: metadata.generated_from ? "endocrine_content_review" : defaultOwner
  });
}

export const moduleBackedClinicalIntentRegistry = installedComplaintModules
  .filter((module) => module.endocrine_metadata?.activation_status === "active_guideline_workup")
  .map(moduleBackedIntent);

export const clinicalIntentRegistry = [
  ...curatedClinicalIntentRegistry,
  ...moduleBackedClinicalIntentRegistry.filter((derivedIntent) => (
    !curatedClinicalIntentRegistry.some((curatedIntent) => curatedIntent.complaint_module_id === derivedIntent.complaint_module_id)
  ))
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
    .map(normalizeIntentToken)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function normalizeIntentToken(token = "") {
  const value = String(token || "").trim();
  const irregular = new Map([
    ["lesions", "lesion"],
    ["moles", "mole"],
    ["cramps", "cramp"],
    ["symptoms", "symptom"],
    ["findings", "finding"],
    ["questions", "question"],
    ["exams", "exam"]
  ]);
  if (irregular.has(value)) {
    return irregular.get(value);
  }
  if (value.length > 5 && /ies$/.test(value)) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.length > 4 && /s$/.test(value) && !/(?:ss|us|is|sis|tes|des|ous)$/.test(value)) {
    return value.slice(0, -1);
  }
  return value;
}

function containsPhrase(context, phrase) {
  const normalized = normalizeClinicalIntentText(phrase);
  if (!normalized) {
    return false;
  }
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(context);
}

function allowShortQueryContainedInLongerAlias(context, alias) {
  const contextTokens = tokenizeIntentText(context);
  const aliasTokens = tokenizeIntentText(alias);
  if (contextTokens.length >= 2) {
    return true;
  }
  if (contextTokens.length === 0 || aliasTokens.length <= 1) {
    return true;
  }
  return false;
}

function scoreClinicalIntent(intentRow, query) {
  const context = normalizeClinicalIntentText(query);
  if (!context) {
    return 0;
  }
  let score = 0;
  const label = normalizeClinicalIntentText(intentRow.label);
  const aliases = (intentRow.aliases || []).map(normalizeClinicalIntentText).filter(Boolean);
  let matchedLabelOrAliasPhrase = false;
  if (context === label) {
    score += 120;
    matchedLabelOrAliasPhrase = true;
  } else if (containsPhrase(context, label) || containsPhrase(label, context)) {
    score += 70;
    matchedLabelOrAliasPhrase = true;
  }
  aliases.forEach((alias) => {
    if (context === alias) {
      score += 115;
      matchedLabelOrAliasPhrase = true;
    } else if (containsPhrase(context, alias)) {
      const multiWordLeadingAliasBonus = context.startsWith(alias) && /\s/.test(alias) ? 34 : 0;
      score += Math.min(85, 30 + alias.length / 2) + multiWordLeadingAliasBonus;
      matchedLabelOrAliasPhrase = true;
    } else if (allowShortQueryContainedInLongerAlias(context, alias) && containsPhrase(alias, context)) {
      score += 36;
      matchedLabelOrAliasPhrase = true;
    }
  });
  if (matchedLabelOrAliasPhrase && (intentRow.intent_type === "diagnosis" || intentRow.complaint_module_id)) {
    score += 36;
  }

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

function formatClinicalIntentSuppressRules(intentRow = {}) {
  return (intentRow.suppress_rules || []).map((rule) => {
    const labels = (rule.suppress_labels || []).join(", ");
    const unlessTags = (rule.unless_tags_include || []).join(", ");
    return `${rule.rule_id}: suppress ${labels}; unless tags ${unlessTags || "explicit modifier/secondary intent"}; reason ${rule.reason || "outside validated intent scope"}`;
  }).join(" | ");
}

export function buildClinicalIntentRetrievalContext(intents = [], modifiers = "", setting = "", population = "") {
  const validated = intents.filter((intentRow) => intentRow?.status === "validated");
  return [
    setting,
    population,
    "validated clinical intent workup",
    ...validated.map((intentRow) => [
      `intent: ${intentRow.label}`,
      `intent_id: ${intentRow.intent_id}`,
      `intent tags: ${(intentRow.evidence_tags || []).join("; ")}`,
      `clinical bundles: ${(intentRow.clinical_bundle_ids || []).join("; ")}`,
      `required domains: ${(intentRow.required_domains || []).join("; ")}`,
      `avoid labels: ${(intentRow.avoid_labels || []).join("; ")}`
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
      `  intent type: ${intentRow.intent_type || "n/a"}`,
      `  complaint module: ${intentRow.complaint_module_id || "none"}`,
      `  clinical bundles: ${(intentRow.clinical_bundle_ids || []).join("; ") || "none"}`,
      `  sources: ${(intentRow.source_ids || []).join("; ") || "none listed"}`,
      `  gold cases: ${(intentRow.gold_case_ids || []).join("; ") || "none"}`,
      `  last reviewed: ${intentRow.last_reviewed || "n/a"}`,
      `  review owner: ${intentRow.review_owner || "n/a"}`,
      `  evidence tags: ${(intentRow.evidence_tags || []).join("; ")}`,
      `  required domains: ${(intentRow.required_domains || []).join("; ")}`,
      `  avoid labels: ${(intentRow.avoid_labels || []).join("; ")}`,
      `  suppress rules: ${formatClinicalIntentSuppressRules(intentRow) || "none"}`
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

export function sanitizeUnsupportedClinicalIntentGapText(value = "") {
  return String(value || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "[name]")
    .replace(/\bDOB\s*[:#]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, "[date]")
    .replace(/\bDOB\s*[:#]?\s*\d{4}-\d{2}-\d{2}\b/gi, "[date]")
    .replace(/\b(?:MRN|CSN|SSN)\s*[:#]?\s*[\w-]+\b/gi, "[identifier]")
    .replace(/\bFIN\s*[:#]\s*[\w-]+\b/gi, "[identifier]")
    .replace(/\b(?:patient|pt|name)\s*(?:is|named|[:#])?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/gi, "[name]")
    .replace(/\b(?:room|rm|bed)\s*[:#]?\s*[A-Za-z]?\d+[A-Za-z]?\b/gi, "[location]")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "[date]")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[date]")
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, "[time]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function buildUnsupportedClinicalIntentGap({
  query = "",
  modifiers = "",
  setting = "",
  population = "",
  reviewer = "local_reviewer",
  now = new Date()
} = {}) {
  const sanitizedQuery = sanitizeUnsupportedClinicalIntentGapText(query);
  const sanitizedModifiers = sanitizeUnsupportedClinicalIntentGapText(modifiers);
  const sanitizedSetting = sanitizeUnsupportedClinicalIntentGapText(setting);
  const sanitizedPopulation = sanitizeUnsupportedClinicalIntentGapText(population);
  const reviewerText = String(reviewer || "local_reviewer").trim() || "local_reviewer";
  const sanitizedReviewer = sanitizeUnsupportedClinicalIntentGapText(reviewerText);
  const reviewerLooksUnsafe = sanitizedReviewer !== reviewerText
    || !/^[a-z0-9_.-]{2,64}$/i.test(reviewerText);
  return {
    schema_version: "clinical-intent-gap-v1",
    gap_status: "staged_gap",
    gap_type: "unsupported_clinical_intent",
    sanitized_query: sanitizedQuery || "unsupported concern not specified",
    sanitized_modifiers: sanitizedModifiers,
    setting: sanitizedSetting,
    population: sanitizedPopulation,
    staged_at: now instanceof Date ? now.toISOString() : String(now || ""),
    review_owner: reviewerLooksUnsafe ? "local_reviewer" : reviewerText,
    activation_rule: "This staged gap cannot authorize recommendations until a reviewed knowledge pack promotes a validated clinical intent."
  };
}

function validateClinicalIntentSuppressRules(intentRow = {}, label = "") {
  const issues = [];
  if (!Array.isArray(intentRow.suppress_rules)) {
    issues.push(`${label} field suppress_rules must be an array.`);
    return issues;
  }
  const ruleIds = new Set();
  intentRow.suppress_rules.forEach((rule, index) => {
    const ruleLabel = `${label} suppress_rules[${index + 1}]`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      issues.push(`${ruleLabel} must be an object.`);
      return;
    }
    if (!String(rule.rule_id || "").trim()) {
      issues.push(`${ruleLabel} needs rule_id.`);
    } else if (ruleIds.has(String(rule.rule_id).trim().toLowerCase())) {
      issues.push(`${ruleLabel} duplicate rule_id ${rule.rule_id}.`);
    }
    ruleIds.add(String(rule.rule_id || "").trim().toLowerCase());
    if (!Array.isArray(rule.intent_ids) || !rule.intent_ids.map((value) => String(value || "").trim()).filter(Boolean).length) {
      issues.push(`${ruleLabel} needs intent_ids for traceability.`);
    } else if (!rule.intent_ids.includes(intentRow.intent_id)) {
      issues.push(`${ruleLabel} intent_ids must include ${intentRow.intent_id}.`);
    }
    if (!Array.isArray(rule.suppress_labels)) {
      issues.push(`${ruleLabel} suppress_labels must be an array.`);
    } else {
      const labels = rule.suppress_labels.map((value) => String(value || "").trim()).filter(Boolean);
      if (!labels.length || labels.length !== rule.suppress_labels.length) {
        issues.push(`${ruleLabel} suppress_labels must contain nonblank labels.`);
      }
      if (new Set(labels.map(normalizeClinicalIntentText)).size !== labels.length) {
        issues.push(`${ruleLabel} suppress_labels must not contain duplicate values.`);
      }
    }
    if (!String(rule.reason || "").trim()) {
      issues.push(`${ruleLabel} needs reason.`);
    }
    if (!Array.isArray(rule.unless_tags_include) || !rule.unless_tags_include.map((value) => String(value || "").trim()).filter(Boolean).length) {
      issues.push(`${ruleLabel} needs unless_tags_include override tags.`);
    }
    if (!String(rule.rule_scope || "").trim()) {
      issues.push(`${ruleLabel} needs rule_scope.`);
    }
  });
  return issues;
}

export function validateClinicalIntentRegistry(registry = clinicalIntentRegistry, options = {}) {
  const issues = [];
  const ids = new Set();
  const validStatuses = new Set(["validated", "partial", "draft", "unsupported"]);
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validatedScaffoldPattern = /\b(?:staged gap|gap warning|gap review|needs review|reviewer needed|source pending)\b/i;
  const knownSourceIds = options.knownSourceIds ? new Set(options.knownSourceIds) : null;
  const knownComplaintModuleIds = options.knownComplaintModuleIds ? new Set(options.knownComplaintModuleIds) : null;
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
    if (!intentRow.last_reviewed || !isoDatePattern.test(String(intentRow.last_reviewed))) {
      issues.push(`${label} needs last_reviewed as YYYY-MM-DD.`);
    }
    if (!intentRow.review_owner) {
      issues.push(`${label} needs review_owner.`);
    }
    for (const field of ["aliases", "source_ids", "evidence_tags", "clinical_bundle_ids", "required_domains", "avoid_labels", "gold_case_ids"]) {
      if (!Array.isArray(intentRow[field])) {
        issues.push(`${label} field ${field} must be an array.`);
      } else {
        const normalizedValues = intentRow[field].map((value) => String(value || "").trim()).filter(Boolean);
        if (normalizedValues.length !== intentRow[field].length) {
          issues.push(`${label} field ${field} must not contain blank values.`);
        }
        if (new Set(normalizedValues.map(normalizeClinicalIntentText)).size !== normalizedValues.length) {
          issues.push(`${label} field ${field} must not contain duplicate values.`);
        }
      }
    }
    issues.push(...validateClinicalIntentSuppressRules(intentRow, label));
    if (intentRow.status === "validated" && !(intentRow.aliases || []).length) {
      issues.push(`${label} validated intent needs aliases.`);
    }
    if (intentRow.status === "validated" && (!(intentRow.source_ids || []).length || !(intentRow.gold_case_ids || []).length)) {
      issues.push(`${label} validated intent needs source_ids and gold_case_ids.`);
    }
    if (intentRow.status === "validated" && (!(intentRow.evidence_tags || []).length || !(intentRow.clinical_bundle_ids || []).length || !(intentRow.required_domains || []).length)) {
      issues.push(`${label} validated intent needs evidence_tags, clinical_bundle_ids, and required_domains.`);
    }
    if (intentRow.status === "validated") {
      const userFacingMetadata = [
        intentRow.label,
        intentRow.intent_type,
        intentRow.complaint_module_id,
        ...(intentRow.aliases || []),
        ...(intentRow.evidence_tags || []),
        ...(intentRow.clinical_bundle_ids || []),
        ...(intentRow.required_domains || []),
        ...(intentRow.avoid_labels || []),
        ...(intentRow.gold_case_ids || [])
      ].map((value) => String(value || "")).join(" | ");
      if (validatedScaffoldPattern.test(userFacingMetadata)) {
        issues.push(`${label} validated intent user-facing metadata must not contain scaffold review/gap wording.`);
      }
    }
    const suppressRuleLabels = (intentRow.suppress_rules || []).flatMap((rule) => Array.isArray(rule?.suppress_labels) ? rule.suppress_labels : []);
    if (intentRow.status === "validated" && !(intentRow.avoid_labels || []).length && !suppressRuleLabels.length) {
      issues.push(`${label} validated intent needs avoid_labels or suppress-rule labels.`);
    }
    if (intentRow.status === "validated" && !(intentRow.suppress_rules || []).length) {
      issues.push(`${label} validated intent needs suppress_rules with reasons and override tags.`);
    }
    if (knownSourceIds) {
      (intentRow.source_ids || []).forEach((sourceId) => {
        if (!knownSourceIds.has(sourceId)) {
          issues.push(`${label} references unknown source_id ${sourceId}.`);
        }
      });
    }
    if (knownComplaintModuleIds && intentRow.complaint_module_id && !knownComplaintModuleIds.has(intentRow.complaint_module_id)) {
      issues.push(`${label} references unknown complaint_module_id ${intentRow.complaint_module_id}.`);
    }
  });
  return {
    ok: issues.length === 0,
    issues
  };
}
