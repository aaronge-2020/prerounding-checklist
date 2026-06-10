import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  auditRecommendedWorkupDomainCoverage,
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";
import {
  buildClinicalIntentRetrievalContext,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";
import {
  complaintModules,
  evaluateComplaintCds,
  isBasicBedsideDataItem
} from "../complaint-cds.js";
import {
  formatConciseClinicalWorkupReport,
  formatConciseExamRecommendationReport
} from "../workup-report.js";
import { buildRun, loadCatalog } from "./iterate-clinical-workups.js";

const QUALITY_GOAL = "attending-level tiered bedside workup";

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const acceptedCatalogAdditionRows = parseCsv(readFileSync("data/evidence/accepted_exam_catalog_additions.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const gapRows = parseCsv(readFileSync("data/evidence/catalog_gap_registry.csv", "utf8"));
const workupReportSource = readFileSync("workup-report.js", "utf8");
const catalog = joinEvidenceCatalog(
  baseRows,
  mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows),
  sourceRows,
  acceptedCatalogAdditionRows
);

function rx(pattern) {
  return new RegExp(pattern, "i");
}

function labels(entries) {
  return entries.map((entry) => entry.label).join(" | ");
}

function labelsAndReasons(entries) {
  return entries
    .map((entry) => [
      entry.label,
      entry.options,
      entry.candidate?.examOptions,
      entry.domain,
      entry.reason,
      entry.displayDiagnosticTarget,
      entry.displayManagement
    ].filter(Boolean).join(" "))
    .join(" | ");
}

const routineSafetyLabels = /^(?:Measure blood pressure|Measure heart rate|Count respiratory rate|Measure temperature|Measure oxygen saturation and support)$/i;
const actionSpecificRoutineSafetyLabelPattern = /^(?:Measure|Count)\b/i;

function recommendationForIntent(intentIds, modifiers = "", options = {}) {
  const selectedIntents = selectedValidatedClinicalIntents(intentIds);
  const filteredCatalog = filterEvidenceCatalogForClinicalIntents(catalog, selectedIntents);
  const context = buildClinicalIntentRetrievalContext(
    selectedIntents,
    modifiers,
    options.setting || "General medicine",
    options.population || "Adult"
  );
  const ranked = rankEvidenceCandidates(filteredCatalog, context, tagRows, {
    maxCandidates: 90,
    specialty: options.specialty || "General medicine"
  });
  return buildRecommendedExamChecklist(context, ranked, {
    specialty: options.specialty || "General medicine",
    maxCoreItems: 28,
    maxConditionalItems: 44,
    validatedIntents: selectedIntents,
    catalogGapRegistryRows: gapRows
  });
}

function rankedCandidatesForIntent(intentIds, modifiers = "", options = {}) {
  const selectedIntents = selectedValidatedClinicalIntents(intentIds);
  const filteredCatalog = filterEvidenceCatalogForClinicalIntents(catalog, selectedIntents);
  const context = buildClinicalIntentRetrievalContext(
    selectedIntents,
    modifiers,
    options.setting || "General medicine",
    options.population || "Adult"
  );
  return rankEvidenceCandidates(filteredCatalog, context, tagRows, {
    maxCandidates: options.maxCandidates || 30,
    specialty: options.specialty || "General medicine"
  }).candidates;
}

const missingHistoryOptionsRecommendation = buildRecommendedExamChecklist(
  "synthetic DKA HHS hyperglycemia history metadata guard",
  [{
    exam_id: "TEST-history-missing-options",
    item_type: "history_question",
    examLabel: "Ask synthetic history guard",
    maneuver: "Ask synthetic history guard",
    bedside_question_label: "Any synthetic symptom cluster that should require structured answer options?",
    bedside_question_options: "",
    condition_or_syndrome: "DKA/HHS or hyperglycemic crisis",
    diagnostic_target: "Synthetic history metadata quality",
    result_changes_management: "A missing structured answer should be caught before UI rendering.",
    evidence_source_primary: "TEST_SOURCE",
    source_citation: "Synthetic test fixture",
    evidence_tier: "test",
    LR_plus: "n/a",
    LR_minus: "n/a",
    difficulty: "easy",
    time_burden_minutes: "1",
    equipment_needed: "none",
    patient_cooperation_required: "low",
    retrieval_tags: "DKA_HHS; history_question; hyperglycemia",
    matchedTags: ["DKA_HHS", "history_question"],
    tags: ["DKA_HHS", "history_question"],
    score: 95,
    retrievalRoutes: ["test_fixture"],
    review: { status: "accepted" }
  }],
  { maxCoreItems: 8, maxConditionalItems: 8 }
);
assert.ok(
  (missingHistoryOptionsRecommendation.qualityIssues || []).some((issue) => issue.severity === "high" && issue.type === "missing_history_options"),
  "Recommendation quality linter should flag focused history questions without structured answer options"
);

const qualityCases = [
  {
    id: "abdominal_generic_tiered",
    intentIds: ["abdominal_pain_cramping_v1"],
    modifiers: "stomach cramps",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("Temperature")
    ],
    requireCore: [
      rx("Inspect abdomen"),
      rx("Auscultate bowel sounds"),
      rx("Palpate abdomen")
    ],
    requireHistory: [
      rx("Where is the pain worst|fever|vomiting|black stool|pregnancy|stool/gas")
    ],
    requireConditional: [
      rx("Test rebound tenderness"),
      rx("Test Murphy sign")
    ],
    requireTests: [
      rx("Abdominal pain initial tests|CBC|CMP|lipase|urinalysis|pregnancy"),
      rx("Abdominal imaging pathway|CT|RUQ ultrasound|pelvic ultrasound")
    ],
    requireRedFlags: [
      rx("Acute abdomen and surgical escalation cues|guarding|rebound|obstipation|GI bleeding"),
      rx("Pregnancy, vascular, and extra-abdominal danger cues|ectopic|vascular|scrotal|dyspnea")
    ],
    avoidCore: [
      rx("Murphy|Rebound|Psoas|Obturator"),
      rx("Pronator drift|Facial symmetry|Pupils|PMI")
    ],
    avoidAll: [
      rx("Psoas sign|Obturator sign"),
      rx("Visual acuity|Vibration sense|Ophthalmoscopic")
    ],
    requireRationale: [
      rx("peritoneal|acute abdomen|surgical"),
      rx("biliary|gallbladder|ultrasound"),
      rx("pregnancy|CT|lactate|urinalysis|lipase")
    ],
    requireEvidence: [
      rx("AAFP_ACUTE_ABD_PAIN_2023"),
      rx("ACR_RLQ_PAIN_2022|ACR_RUQ_PAIN_2022")
    ]
  },
  {
    id: "abdominal_ruq_promotes_biliary",
    intentIds: ["abdominal_pain_cramping_v1"],
    modifiers: "RUQ abdominal pain fever jaundice dark urine",
    requireSafety: [
      rx("Temperature")
    ],
    requireCore: [
      rx("Test Murphy sign"),
      rx("Palpate abdomen")
    ],
    requireAny: [
      rx("Inspect sclerae and conjunctivae|Liver edge|Liver span")
    ],
    avoidAll: [
      rx("Pronator drift|Vibration sense|PMI")
    ]
  },
  {
    id: "abdominal_rlq_promotes_appendicitis",
    intentIds: ["abdominal_pain_cramping_v1"],
    modifiers: "RLQ abdominal pain guarding appendicitis concern",
    requireSafety: [
      rx("Temperature")
    ],
    requireCore: [
      rx("Test rebound tenderness"),
      rx("Test psoas sign"),
      rx("Test obturator sign"),
      rx("Palpate abdomen")
    ],
    avoidAll: [
      rx("Pronator drift|Vibration sense|PMI")
    ]
  },
  {
    id: "abdominal_focal_neuro_stays_tiered",
    intentIds: ["abdominal_pain_cramping_v1"],
    modifiers: "stomach cramps with focal weakness",
    requireSafety: [
      rx("Temperature")
    ],
    requireCore: [
      rx("Palpate abdomen")
    ],
    requireConditional: [
      rx("Test rebound tenderness"),
      rx("Test Murphy sign"),
      rx("Inspect facial symmetry"),
      rx("Test pronator drift"),
      rx("Test pupillary light response")
    ],
    avoidCore: [
      rx("Facial symmetry|Pronator drift|Pupils")
    ],
    requireWarning: rx("Focal neurologic symptoms.*not a neuro intent")
  },
  {
    id: "chest_pain_with_nausea_no_abdomen_leak",
    intentIds: ["chest_pain_acs_v1"],
    modifiers: "crushing chest pressure diaphoresis nausea radiation left arm possible ACS",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate")
    ],
    requireCore: [
      rx("Auscultate heart sounds|Palpate radial pulses"),
      rx("Auscultate posterior lung fields|Auscultate lateral lung fields")
    ],
    avoidAll: [
      rx("Murphy sign|Rebound tenderness|Psoas sign|Obturator sign"),
      rx("Vibration sense|Visual acuity")
    ]
  },
  {
    id: "suspected_pe_keeps_dvt_and_lungs",
    intentIds: ["suspected_pe_v1"],
    modifiers: "pleuritic chest pain dyspnea hypoxia unilateral leg swelling",
    requireSafety: [
      rx("Respiratory rate")
    ],
    requireHistory: [
      rx("sudden shortness of breath|pleuritic chest pain"),
      rx("prior VTE|surgery|immobility|estrogen|pregnancy|cancer|unilateral leg swelling|bleeding risk")
    ],
    requireCore: [
      rx("Observe work of breathing"),
      rx("Auscultate posterior lung fields|Auscultate lateral lung fields|Auscultate anterior lung fields"),
      rx("Auscultate heart sounds|Inspect jugular venous pressure"),
      rx("Inspect unilateral leg swelling|Inspect and press lower extremity edema|Palpate dorsalis pedis pulses|Palpate posterior tibial pulses")
    ],
    requireRedFlags: [
      rx("High-risk PE escalation cues|hypotension|shock|syncope|hypoxemia"),
      rx("Anticoagulation and thrombolysis safety cues|active bleeding|recent surgery|intracranial")
    ],
    requireTests: [
      rx("PE probability, D-dimer, and imaging pathway|D-dimer|CTPA|V/Q|clinical probability"),
      rx("DVT and right-heart strain evaluation|compression ultrasound|right-heart strain|troponin|BNP|echo")
    ],
    requireRationale: [
      rx("PERC|Wells|Geneva|D-dimer|imaging"),
      rx("anticoagulation|thrombolysis|right-heart strain|risk stratification")
    ],
    requireEvidence: [
      rx("ESC_PE_2019"),
      rx("ACEP_VTE_POLICY|ASH_VTE_DIAGNOSIS")
    ],
    avoidAll: [
      rx("Test Murphy sign|Test rebound tenderness|Palpate abdomen|Auscultate bowel sounds"),
      rx("Vibration sense|Visual acuity")
    ],
    avoidCore: [
      rx("Posterior lung percussion|Anterior lung percussion|Tactile fremitus"),
      rx("Palpate dorsalis pedis pulses|Palpate posterior tibial pulses|Palpate femoral pulses")
    ]
  },
  {
    id: "heart_failure_dyspnea_prioritizes_volume",
    intentIds: ["dyspnea_hf_v1"],
    modifiers: "dyspnea orthopnea PND crackles bilateral leg edema rising creatinine",
    requireSafety: [
      rx("Blood pressure|Respiratory rate")
    ],
    requireCore: [
      rx("Observe work of breathing"),
      rx("Auscultate posterior lung fields"),
      rx("Inspect jugular venous pressure"),
      rx("Inspect and press lower extremity edema"),
      rx("Auscultate posterior lung fields|Auscultate lateral lung fields|Auscultate anterior lung fields"),
      rx("Auscultate heart sounds")
    ],
    requireTests: [
      rx("Dyspnea/HF initial tests|BNP|NT-proBNP|Chest X-ray|ECG"),
      rx("Diuresis and respiratory-support safety review|creatinine|potassium|oxygen")
    ],
    requireRedFlags: [
      rx("Respiratory failure escalation cues|hypoxemia|oxygen|hypercapnia"),
      rx("Shock or acute heart-failure escalation cues|shock|oliguria|pulmonary edema")
    ],
    requireRationale: [
      rx("BNP <100|NT-proBNP <300|chest imaging|ECG"),
      rx("diuresis|respiratory support|renal|electrolyte")
    ],
    requireEvidence: [
      rx("AHA_ACC_HFSA_HF_2022"),
      rx("ESC_HF_2021")
    ],
    avoidAll: [
      rx("Murphy sign|Rebound tenderness|Psoas sign|Obturator sign"),
      rx("Vibration sense|Visual acuity")
    ]
  },
  {
    id: "pelvic_pain_promotes_safety_gaps",
    intentIds: ["pelvic_menstrual_pain_v1"],
    modifiers: "lower belly cramps period pain severe one sided pelvic pain pregnancy possible discharge",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("Verify pregnancy possibility")
    ],
    requireCore: [
      rx("Palpate abdomen")
    ],
    requireRationale: [
      rx("pregnancy.*ectopic|ectopic.*pregnancy"),
      rx("PID|red-flag|discharge")
    ],
    requireRedFlags: [
      rx("PID/ectopic red-flag review")
    ],
    avoidAll: [
      rx("PMI|Vibration sense|Visual acuity")
    ]
  },
  {
    id: "dysuria_flank_promotes_cva_and_volume",
    intentIds: ["gu_renal_dysuria_v1"],
    modifiers: "burning pee fever flank pain pyelonephritis concern poor oral intake",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate")
    ],
    requireCore: [
      rx("Percuss costovertebral angle tenderness"),
      rx("Inspect oral mucosa"),
      rx("Palpate radial pulses")
    ],
    avoidCore: [
      rx("Inspect jugular venous pressure|Inspect and press lower extremity edema|Auscultate bowel sounds")
    ],
    requireHistory: [
      rx("dysuria|frequency|urgency|flank pain|fever|rigors"),
      rx("pregnancy|catheter|resistant|stone")
    ],
    requireTests: [
      rx("Urine and renal-function tests|urinalysis|urine culture|creatinine|electrolytes|pregnancy"),
      rx("Renal obstruction and stone imaging pathway|ultrasound|CT|obstruction|stone")
    ],
    requireRedFlags: [
      rx("Urosepsis and pyelonephritis escalation cues|fever|rigors|hypotension|tachycardia"),
      rx("Obstruction, stone, and AKI danger cues|anuria|oliguria|solitary|obstructing stone")
    ],
    requireRationale: [
      rx("pyelonephritis|renal colic|volume"),
      rx("antibiotic|culture|imaging|urology|renal dosing")
    ],
    requireEvidence: [
      rx("IDSA_CUTI_2025"),
      rx("EAU_URO_INFECTIONS|NICE_RENAL_STONES")
    ],
    avoidAll: [
      rx("PMI|Visual acuity|Vibration sense")
    ]
  },
  {
    id: "fever_sepsis_beats_generic_gpt_baseline",
    intentIds: ["fever_sepsis_v1"],
    modifiers: "undifferentiated fever in clinic",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("Temperature"),
      rx("Mental status")
    ],
    requireHistory: [
      rx("fever source-localizing|source.*cough.*dysuria.*rash|source.*sepsis"),
      rx("cough.*sputum.*dyspnea|new cough.*shortness of breath.*sputum|respiratory.*source"),
      rx("exposure and high-risk host|host.*exposure")
    ],
    requireCore: [
      rx("Palpate radial pulses"),
      rx("Observe work of breathing"),
      rx("Auscultate posterior lung fields"),
      rx("Inspect oral mucosa|Inspect oropharynx"),
      rx("Inspect skin source|Inspect skin for infection source")
    ],
    requireTests: [
      rx("Sepsis severity labs and reference thresholds"),
      rx("Source-directed infection studies")
    ],
    requireRationale: [
      rx("cultures|imaging|antimicrobial|source control"),
      rx("oxygen|respiratory support|pneumonia"),
      rx("skin|wound|line-site|soft-tissue")
    ],
    requireEvidence: [
      rx("SSC_SEPSIS_2026"),
      rx("ATS_CAP_2025|IDSA_CAP_PATHWAY_2019"),
      rx("MERCK_FEVER_ADULTS"),
      rx("SM25")
    ],
    avoidEvidence: [
      rx("SSC_SEPSIS_2021|Sepsis Campaign adult guidelines 2021|Surviving-Sepsis-Guidelines-2021")
    ],
    avoidAll: [
      rx("PMI|Visual acuity|Vibration sense|Ophthalmoscopic")
    ],
    avoidCore: [
      rx("Posterior lung percussion|Anterior lung percussion|Fremitus")
    ]
  },
  {
    id: "hypoglycemia_like_includes_immediate_safety",
    intentIds: ["hypoglycemia_jittery_v1"],
    modifiers: "jittery shaky sweaty possible low sugar insulin missed meal",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("Measure bedside glucose"),
      rx("Mental status")
    ],
    requireCore: [
      rx("Inspect diaphoresis"),
      rx("Observe tremor")
    ],
    requireRationale: [
      rx("glucose|dextrose|carbohydrate"),
      rx("neuroglycopen|confusion|seizure")
    ],
    avoidCore: [
      rx("Inspect and palpate thyroid|Auscultate heart sounds|Palpate radial pulses")
    ],
    avoidAll: [
      rx("PMI|Murphy sign|Vibration sense|Visual acuity")
    ]
  },
  {
    id: "adrenergic_thyroid_features_add_thyroid_and_cardiac",
    intentIds: ["hypoglycemia_jittery_v1"],
    modifiers: "jittery palpitations heat intolerance weight loss hyperthyroid symptoms",
    requireSafety: [
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("Measure bedside glucose"),
      rx("Mental status")
    ],
    requireCore: [
      rx("Inspect diaphoresis|Observe tremor"),
      rx("Inspect and palpate thyroid"),
      rx("Auscultate heart sounds|Palpate radial pulses")
    ],
    requireRationale: [
      rx("thyroid|thyrotoxicosis"),
      rx("ECG|telemetry|arrhythmia")
    ],
    avoidAll: [
      rx("PMI|Murphy sign|Vibration sense|Visual acuity")
    ]
  },
  {
    id: "thyroid_crisis_keeps_temperature_as_safety_not_exam",
    intentIds: ["thyroid_crisis_v1"],
    modifiers: "thyroid storm fever agitation atrial fibrillation infection",
    requireSafety: [
      rx("Temperature"),
      rx("Mental status"),
      rx("Blood pressure"),
      rx("Heart rate"),
      rx("Respiratory rate"),
      rx("oxygen saturation")
    ],
    requireHistory: [
      rx("antithyroid|levothyroxine|iodine|amiodarone|postpartum|steroid")
    ],
    requireCore: [
      rx("Inspect and palpate thyroid"),
      rx("Inspect skin for thyroid phenotype"),
      rx("Auscultate heart sounds")
    ],
    requireRationale: [
      rx("thyroid-storm|myxedema|crisis|ICU|escalation"),
      rx("goiter|Graves|toxic nodular|subacute thyroiditis")
    ],
    avoidCore: [
      rx("Temperature|Blood pressure|Heart rate|Respiratory rate|oxygen saturation|Mental status")
    ],
    avoidAll: [
      rx("PMI|Murphy sign|Vibration sense|Visual acuity|Ophthalmoscopic")
    ]
  },
  {
    id: "generic_msk_uses_atomic_basics",
    intentIds: ["focused_msk_v1"],
    modifiers: "joint pain and swelling without clear site yet",
    requireCore: [
      rx("Inspect painful site"),
      rx("Palpate painful site"),
      rx("Test painful-site range of motion")
    ],
    avoidAll: [
      rx("Murphy sign|CVA tenderness|JVP|PMI|Visual acuity")
    ]
  },
  {
    id: "stroke_generic_does_not_overpromote_bulbar_lower_cn",
    intentIds: ["stroke_focal_neuro_v1"],
    modifiers: "face droop aphasia right arm weakness stroke alert",
    requireCore: [
      rx("Inspect facial symmetry"),
      rx("Test pronator drift"),
      rx("Test pupillary light response|Test visual fields|Test extraocular")
    ],
    avoidAll: [
      rx("SCM strength|Trapezius strength")
    ]
  }
];

function assertPatterns(caseId, text, patterns, label) {
  for (const pattern of patterns || []) {
    assert.match(text, pattern, `${caseId}: expected ${label} to include ${pattern.source}`);
  }
}

function assertNoPatterns(caseId, text, patterns, label) {
  for (const pattern of patterns || []) {
    assert.doesNotMatch(text, pattern, `${caseId}: expected ${label} to exclude ${pattern.source}`);
  }
}

function nonEmptyValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.filter(Boolean).length) return value.filter(Boolean).join("; ");
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function valueList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceForEntry(entry) {
  const candidate = entry.candidate || {};
  const evidence = entry.evidence || {};
  return nonEmptyValue(
    entry.source,
    entry.sourceId,
    entry.sourceCitation,
    evidence.source,
    evidence.sourceId,
    evidence.citation,
    candidate.evidence_source_primary,
    candidate.source_citation,
    candidate.sourceCitation,
    candidate.source_id,
    candidate.sourceIds
  );
}

function hasLikelihoodRatioFields(entry) {
  const candidate = entry.candidate || {};
  const hasLrPlus = Object.prototype.hasOwnProperty.call(entry, "LR_plus")
    || Object.prototype.hasOwnProperty.call(entry, "lrPlus")
    || Object.prototype.hasOwnProperty.call(candidate, "LR_plus")
    || Object.prototype.hasOwnProperty.call(candidate, "lrPlus");
  const hasLrMinus = Object.prototype.hasOwnProperty.call(entry, "LR_minus")
    || Object.prototype.hasOwnProperty.call(entry, "lrMinus")
    || Object.prototype.hasOwnProperty.call(candidate, "LR_minus")
    || Object.prototype.hasOwnProperty.call(candidate, "lrMinus");
  return hasLrPlus && hasLrMinus;
}

function feasibilityComplete(entry) {
  const candidate = entry.candidate || {};
  const feasibility = entry.feasibility || {};
  return Boolean(
    nonEmptyValue(feasibility.difficulty, entry.difficulty, candidate.difficulty)
    && nonEmptyValue(feasibility.time_burden_minutes, entry.time_burden_minutes, candidate.time_burden_minutes)
    && nonEmptyValue(feasibility.equipment_needed, entry.equipment_needed, candidate.equipment_needed)
    && nonEmptyValue(
      feasibility.patient_cooperation_required,
      entry.patient_cooperation_required,
      candidate.patient_cooperation_required
    )
  );
}

function tagsForEntry(entry) {
  const candidate = entry.candidate || {};
  return [
    ...valueList(entry.retrievalTags),
    ...valueList(entry.matchedTags),
    ...valueList(entry.tags),
    ...valueList(candidate.retrieval_tags),
    ...valueList(candidate.retrievalTags),
    ...valueList(candidate.matchedTags),
    ...valueList(candidate.tags)
  ].join(" ");
}

function intentTraceIdsForEntry(entry) {
  const candidate = entry.candidate || {};
  const traceability = entry.traceability || {};
  const candidateTraceability = candidate.traceability || {};
  const traceValues = [
    ...valueList(entry.validatedIntentIds),
    ...valueList(traceability.intent_ids),
    ...valueList(candidateTraceability.intent_ids),
    ...valueList(entry.intentTraceIds),
    ...valueList(entry.intentTrace),
    ...valueList(entry.authorizedBy),
    ...valueList(entry.matchedIntentIds),
    ...valueList(candidate.validated_intent_ids),
    ...valueList(candidate.intentTraceIds),
    ...valueList(candidate.intentTrace),
    ...valueList(candidate.authorizedBy),
    ...valueList(candidate.matchedIntentIds)
  ];
  return traceValues.map((trace) => String(trace).replace(/^intent:/i, "").trim()).filter(Boolean);
}

function assertLrInterpretationNotes(testId, recommendation) {
  const entries = [
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []),
    ...(recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []),
    ...(recommendation.initialTestsAndReferenceThresholds || []),
    ...(recommendation.redFlagsAndEscalationCues || []),
    ...(recommendation.managementChangingFindings || []),
    ...(recommendation.limitationsAndInterpretationCautions || []),
    ...(recommendation.evidenceAndLikelihoodMetadata || [])
  ];
  entries.forEach((entry) => {
    assert.ok(
      entry.evidence?.likelihood_ratio_note,
      `${testId}: ${entry.label || entry.text || entry.exam_id || "workup entry"} should explain LR availability or non-applicability`
    );
  });
}

const displayedExamLabelIssues = [];
const broadDisplayedExamLabelPattern = /[,;:]|\band\s*\/\s*or\b|\b(?:vitals?|acuity screen|focused physical exam|trigger exam|screening exam|physical exam|perform and document|BP,|HR,|respiratory status|weight\/BMI|all findings|complications?)\b/i;
const vagueDisplayedExamLabelPattern = /^(?:check|assess|evaluate|screen|review|document|perform)(?:\b|\.?$)/i;
for (const module of complaintModules) {
  const result = evaluateComplaintCds(module.label, {}, { module });
  for (const [group, list] of Object.entries({
    focusedExam: result.focusedExam || [],
    conditionalExam: result.conditionalExam || []
  })) {
    for (const item of list) {
      const label = item.label || "";
      if (isBasicBedsideDataItem(item)) {
        displayedExamLabelIssues.push(`${module.id}.${group}.${item.id}: basic bedside data leaked into exam label "${label}"`);
      }
      if (broadDisplayedExamLabelPattern.test(label)) {
        displayedExamLabelIssues.push(`${module.id}.${group}.${item.id}: broad or bundled displayed exam label "${label}"`);
      }
      if (vagueDisplayedExamLabelPattern.test(label)) {
        displayedExamLabelIssues.push(`${module.id}.${group}.${item.id}: vague displayed exam label "${label}"`);
      }
    }
  }
}
assert.deepEqual(displayedExamLabelIssues, [], `Displayed exam labels should be atomic, specific, and not basic safety data:\n${displayedExamLabelIssues.slice(0, 20).join("\n")}`);

const displayedHistoryQuestionIssues = [];
const staleBundledInfectionQuestionPattern = /Any fever, infection symptoms, recent illness, procedure, hospitalization, wound, urinary symptoms, cough, or sick contacts\?/i;
const vagueInfectionFallbackQuestionPattern = /localizing infectious symptoms/i;
for (const module of complaintModules) {
  const result = evaluateComplaintCds(module.label, {}, { module });
  for (const [group, list] of Object.entries({
    requiredQuestions: result.requiredQuestions || [],
    conditionalQuestions: result.conditionalQuestions || []
  })) {
    for (const item of list) {
      const text = item.text || item.label || "";
      if (staleBundledInfectionQuestionPattern.test(text)) {
        displayedHistoryQuestionIssues.push(`${module.id}.${group}.${item.id}: stale bundled infection question "${text}"`);
      }
      if (vagueInfectionFallbackQuestionPattern.test(text)) {
        displayedHistoryQuestionIssues.push(`${module.id}.${group}.${item.id}: vague infection fallback question "${text}"`);
      }
    }
  }
}
assert.deepEqual(displayedHistoryQuestionIssues, [], `Displayed history questions should avoid stale bundled source-localization wording:\n${displayedHistoryQuestionIssues.slice(0, 20).join("\n")}`);

const promotedEvidenceExamLabelIssues = [];
const vaguePromotedEvidenceExamLabelPattern = /^(?:check|assess|evaluate|screen|review|document|perform)(?:\b|\.?$)/i;
for (const intentRow of clinicalIntentRegistry.filter((row) => row.status === "validated")) {
  const recommendation = recommendationForIntent([intentRow.intent_id], intentRow.label, {
    maxCoreItems: 28,
    maxConditionalItems: 44
  });
  for (const [group, list] of Object.entries({
    corePhysicalExamManeuvers: recommendation.corePhysicalExamManeuvers || [],
    conditionalExamAddOns: recommendation.conditionalExamAddOns || []
  })) {
    for (const item of list) {
      const label = item.label || "";
      if (broadDisplayedExamLabelPattern.test(label)) {
        promotedEvidenceExamLabelIssues.push(`${intentRow.intent_id}.${group}: broad or bundled promoted exam label "${label}"`);
      }
      if (vaguePromotedEvidenceExamLabelPattern.test(label)) {
        promotedEvidenceExamLabelIssues.push(`${intentRow.intent_id}.${group}: vague promoted exam label "${label}"`);
      }
    }
  }
}
assert.deepEqual(
  promotedEvidenceExamLabelIssues,
  [],
  `Promoted evidence recommendations should use atomic, action-specific physical exam labels:\n${promotedEvidenceExamLabelIssues.slice(0, 20).join("\n")}`
);

const promotedHistoryQuestionMetadataIssues = [];
for (const intentRow of clinicalIntentRegistry.filter((row) => row.status === "validated")) {
  const recommendation = recommendationForIntent([intentRow.intent_id], intentRow.label, {
    maxCoreItems: 28,
    maxConditionalItems: 44
  });
  for (const question of recommendation.focusedHistoryQuestions || []) {
    const questionName = `${intentRow.intent_id}.${question.id || question.text || "focused-history-question"}`;
    if (!question.label || !question.displayLabel) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: missing stable label/displayLabel`);
    }
    if (question.label !== question.displayLabel) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: label "${question.label}" does not match displayLabel "${question.displayLabel}"`);
    }
    if (!question.text || !question.fullQuestion) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: missing question text/fullQuestion`);
    }
    if (!question.source || !question.evidence?.source) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: missing source metadata`);
    }
    if (!question.evidence?.likelihood_ratio_note) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: missing LR interpretation note`);
    }
    if (!(question.traceability?.intent_ids || []).includes(intentRow.intent_id)) {
      promotedHistoryQuestionMetadataIssues.push(`${questionName}: missing traceability to selected validated intent`);
    }
  }
}
assert.deepEqual(
  promotedHistoryQuestionMetadataIssues,
  [],
  `Promoted focused history questions should be labeled, sourced, LR-noted, and traceable:\n${promotedHistoryQuestionMetadataIssues.slice(0, 25).join("\n")}`
);

for (const testCase of qualityCases) {
  const recommendation = recommendationForIntent(testCase.intentIds, testCase.modifiers, testCase);
  const safetyText = labels(recommendation.basicSafetyChecks || []);
  const routineSafetyChecks = (recommendation.basicSafetyChecks || []).filter((entry) => routineSafetyLabels.test(entry.label || ""));
  const historyText = (recommendation.focusedHistoryQuestions || [])
    .map((question) => [question.text, question.options, question.diagnosticPurpose, question.managementImplication].filter(Boolean).join(" "))
    .join(" | ");
  const coreItems = recommendation.corePhysicalExamManeuvers || recommendation.coreItems;
  const conditionalItems = recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems;
  const coreText = labels(coreItems);
  const conditionalText = labels(conditionalItems);
  const redFlagText = labelsAndReasons(recommendation.redFlagsAndEscalationCues || []);
  const testText = labelsAndReasons(recommendation.initialTestsAndReferenceThresholds || []);
  const allText = `${safetyText} | ${coreText} | ${conditionalText} | ${redFlagText} | ${testText}`;
  const rationaleText = labelsAndReasons([
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...coreItems,
    ...conditionalItems,
    ...(recommendation.redFlagsAndEscalationCues || []),
    ...(recommendation.initialTestsAndReferenceThresholds || [])
  ]);
  const evidenceText = [
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...coreItems,
    ...conditionalItems,
    ...(recommendation.redFlagsAndEscalationCues || []),
    ...(recommendation.initialTestsAndReferenceThresholds || []),
    ...(recommendation.evidenceAndLikelihoodMetadata || [])
  ].map((entry) => [
    entry.source,
    entry.evidence?.source,
    entry.candidate?.evidence_source_primary,
    entry.candidate?.source_citation
  ].filter(Boolean).join(" ")).join(" | ");
  assert.ok(coreItems.length > 0 || (recommendation.basicSafetyChecks || []).length > 0, `${testCase.id}: ${QUALITY_GOAL} should not produce an empty workup`);
  const severeQualityIssues = (recommendation.qualityIssues || []).filter((issue) => issue.severity === "high");
  assert.deepEqual(severeQualityIssues, [], `${testCase.id}: severe recommendation quality issues should be absent`);
  assertLrInterpretationNotes(testCase.id, recommendation);
  const managementChangeCounts = new Map();
  (recommendation.managementChangingFindings || []).forEach((finding) => {
    const key = String(finding.managementChange || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) return;
    managementChangeCounts.set(key, (managementChangeCounts.get(key) || 0) + 1);
  });
  const duplicateManagementChanges = Array.from(managementChangeCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([managementChange]) => managementChange);
  assert.deepEqual(
    duplicateManagementChanges,
    [],
    `${testCase.id}: management-changing findings should not repeat the same management implication once per linked exam maneuver`
  );
  for (const safetyEntry of routineSafetyChecks) {
    const candidate = safetyEntry.candidate || {};
    assert.match(
      safetyEntry.label || "",
      actionSpecificRoutineSafetyLabelPattern,
      `${testCase.id}: routine safety ${safetyEntry.label} should name the bedside action, not just the vital-sign noun`
    );
    assert.match(candidate.exam_id || "", /^SAFETY-/, `${testCase.id}: routine safety ${safetyEntry.label} should come from modeled safety data, not raw exam catalog or staged vital gaps`);
    assert.ok(
      (candidate.retrievalRoutes || []).includes("validated_intent_safety_floor")
        || (candidate.retrievalRoutes || []).includes("validated_bundle_required"),
      `${testCase.id}: routine safety ${safetyEntry.label} should not be a promoted raw catalog vital row`
    );
    assert.equal(
      candidate.bedside_question_label || safetyEntry.displayBedsideQuestion || "",
      "",
      `${testCase.id}: routine safety ${safetyEntry.label} should not carry a stale bedside question`
    );
  }
  assertNoPatterns(testCase.id, coreText, [rx("Blood pressure|Heart rate|Respiratory rate|Temperature|Bedside glucose|SpO2|oxygen saturation|weight|orthostatic|pain score")], "core physical exam maneuvers");
  assertNoPatterns(testCase.id, coreText, [rx("Pregnancy possibility safety check|Bedside glucose safety check|PID/ectopic red-flag review|red-flag review|safety check")], "core physical exam maneuvers");
  assertPatterns(testCase.id, safetyText, testCase.requireSafety, "basic safety checks");
  assertPatterns(testCase.id, historyText, testCase.requireHistory, "focused history");
  assertPatterns(testCase.id, coreText, testCase.requireCore, "core");
  assertPatterns(testCase.id, conditionalText, testCase.requireConditional, "conditional add-ons");
  assertPatterns(testCase.id, redFlagText, testCase.requireRedFlags, "red flags");
  assertPatterns(testCase.id, testText, testCase.requireTests, "tests/reference thresholds");
  assertPatterns(testCase.id, allText, testCase.requireAny, "full recommendation");
  assertPatterns(testCase.id, rationaleText, testCase.requireRationale, "rationale/management text");
  assertPatterns(testCase.id, evidenceText, testCase.requireEvidence, "evidence/source metadata");
  assertNoPatterns(testCase.id, coreText, testCase.avoidCore, "core");
  assertNoPatterns(testCase.id, allText, testCase.avoidAll, "full recommendation");
  assertNoPatterns(testCase.id, evidenceText, testCase.avoidEvidence, "evidence/source metadata");
  if (testCase.requireWarning) {
    assert.match(recommendation.warnings.join(" "), testCase.requireWarning, `${testCase.id}: expected warning ${testCase.requireWarning.source}`);
  }
}

const dyspneaDedupeRecommendation = recommendationForIntent(
  ["dyspnea_hf_v1"],
  "dyspnea orthopnea PND crackles bilateral leg edema rising creatinine"
);
const sharedCongestionManagementFinding = (dyspneaDedupeRecommendation.managementChangingFindings || [])
  .find((finding) => /congestion or poor perfusion findings can change/i.test(finding.managementChange || ""));
assert.ok(
  sharedCongestionManagementFinding,
  "Dyspnea/HF should retain a management-changing congestion/perfusion implication after dedupe"
);
assert.ok(
  (sharedCongestionManagementFinding.linkedExamIds || []).length >= 3,
  "Deduped dyspnea/HF congestion/perfusion management row should preserve multiple linked exam IDs for auditability"
);

const historyQualityCases = [
  {
    id: "sleep_apnea_history_stays_sleep_focused",
    intentIds: ["sleep_apnea_snoring_v1"],
    modifiers: "snoring witnessed apneas daytime sleepiness morning headaches",
    requireHistory: [rx("snor|apnea|sleep|daytime")],
    avoidHistory: [rx("thirst|less urine|urine output|orthopnea|flank")]
  },
  {
    id: "eye_redness_history_stays_eye_focused",
    intentIds: ["eye_redness_vision_v1"],
    modifiers: "red painful eye photophobia contact lens use",
    requireHistory: [rx("vision loss|eye pain|photophobia|contact lens|discharge")],
    avoidHistory: [rx("thirst|less urine|orthopnea|flank|constipation")]
  },
  {
    id: "heent_history_stays_heent_focused",
    intentIds: ["heent_throat_ear_v1"],
    modifiers: "sore throat ear pain sinus congestion fever",
    requireHistory: [rx("sore throat|ear pain|nasal|sinus|dysphagia|drooling|neck swelling")],
    requireCore: [rx("Palpate regional cervical lymph nodes")],
    avoidCore: [rx("Tonsillar nodes|Submandibular nodes|Anterior cervical nodes|Posterior cervical nodes|Supraclavicular nodes")],
    avoidHistory: [rx("thyroid|palpitations|thirst|less urine|orthopnea")]
  },
  {
    id: "thyroid_cancer_uses_single_nodal_exam",
    intentIds: ["thyroid_cancer_intent_v1"],
    modifiers: "thyroid cancer neck mass hoarseness dysphagia suspicious cervical nodes",
    requireCore: [rx("Palpate cervical lymph nodes|Palpate regional cervical lymph nodes|Palpate regional lymph nodes")],
    avoidCore: [rx("Tonsillar nodes|Submandibular nodes|Anterior cervical nodes|Posterior cervical nodes|Supraclavicular nodes")],
    requireRationale: [rx("biopsy|imaging|malignancy|referral")]
  },
  {
    id: "diabetes_foot_history_stays_foot_focused",
    intentIds: ["diabetes_foot_neuropathy_v1"],
    modifiers: "diabetes foot ulcer numbness poor footwear discharge planning",
    requireHistory: [rx("foot ulcer|wound|drainage|numbness|protective sensation|footwear")],
    requireCore: [rx("Palpate posterior tibial pulses"), rx("Palpate dorsalis pedis pulses")],
    avoidCore: [rx("Palpate femoral pulses")],
    avoidHistory: [rx("vision loss|double vision|orthopnea|dysuria|flank")]
  },
  {
    id: "diabetes_foot_pad_modifier_adds_proximal_pulse",
    intentIds: ["diabetes_foot_neuropathy_v1"],
    modifiers: "diabetes foot ulcer numbness claudication rest pain weak pedal pulse prior vascular surgery",
    requireHistory: [rx("foot ulcer|wound|drainage|numbness|protective sensation|footwear")],
    requireCore: [rx("Palpate posterior tibial pulses"), rx("Palpate dorsalis pedis pulses")],
    requireConditional: [rx("Palpate femoral pulses")],
    requireRationale: [rx("ABI|toe-pressure|vascular|limb-ischemia|wound-healing|PAD")]
  },
  {
    id: "bleeding_anemia_history_stays_bleeding_focused",
    intentIds: ["bleeding_anemia_v1"],
    modifiers: "pallor easy bruising melena anticoagulant dizziness",
    requireHistory: [rx("hematemesis|melena|hematochezia|bruising|anticoagulant|dizziness|dyspnea|chest pain")],
    avoidHistory: [rx("dysuria|constipation|thirst|less urine|orthopnea")]
  },
  {
    id: "fever_history_and_lungs_match_gpt_floor",
    intentIds: ["fever_sepsis_v1"],
    modifiers: "fever with no source yet, possible pneumonia or urinary source",
    requireHistory: [rx("source|cough|sputum|dyspnea|pleuritic|dysuria|flank|rash|wound|headache|neck stiffness|confusion|low urine")],
    requireCore: [rx("Auscultate posterior lung fields"), rx("Observe work of breathing"), rx("Inspect skin source|Inspect skin for infection source"), rx("Inspect oral mucosa|Inspect oropharynx"), rx("Palpate radial pulses")],
    requireRationale: [rx("pneumonia|pulmonary source|respiratory"), rx("cultures|antimicrobial|source control")],
    requireRedFlags: [rx("sepsis|shock"), rx("CNS|airway|purpura|meningismus|photophobia")],
    requireTests: [rx("lactate|CBC|CMP|creatinine"), rx("blood cultures|chest imaging|urinalysis|urine culture")]
  }
];

for (const testCase of historyQualityCases) {
  const recommendation = recommendationForIntent(testCase.intentIds, testCase.modifiers, testCase);
  assertLrInterpretationNotes(testCase.id, recommendation);
  const historyText = (recommendation.focusedHistoryQuestions || [])
    .map((question) => [question.text, question.options, question.diagnosticPurpose, question.managementImplication].filter(Boolean).join(" "))
    .join(" | ");
  const coreText = labels(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []);
  const conditionalText = labels(recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []);
  const redFlagText = labelsAndReasons(recommendation.redFlagsAndEscalationCues || []);
  const testText = labelsAndReasons(recommendation.initialTestsAndReferenceThresholds || []);
  const rationaleText = labelsAndReasons([
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []),
    ...(recommendation.redFlagsAndEscalationCues || []),
    ...(recommendation.initialTestsAndReferenceThresholds || []),
    ...(recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || [])
  ]);
  assertPatterns(testCase.id, historyText, testCase.requireHistory, "focused history");
  assertNoPatterns(testCase.id, historyText, testCase.avoidHistory, "focused history");
  assertPatterns(testCase.id, coreText, testCase.requireCore, "core");
  assertPatterns(testCase.id, conditionalText, testCase.requireConditional, "conditional add-ons");
  assertPatterns(testCase.id, redFlagText, testCase.requireRedFlags, "red flags");
  assertPatterns(testCase.id, testText, testCase.requireTests, "tests/reference thresholds");
  assertPatterns(testCase.id, rationaleText, testCase.requireRationale, "rationale/management text");
}

const remediatedFocusedHistoryCases = [
  {
    intentId: "sleep_apnea_snoring_v1",
    modifiers: "snoring witnessed apneas daytime sleepiness morning headaches",
    requireHistory: rx("drowsy driving|resistant hypertension|CPAP|oral-appliance")
  },
  {
    intentId: "pelvic_menstrual_pain_v1",
    modifiers: "lower belly cramps period pain pregnancy possible discharge fever",
    requireHistory: rx("pregnancy|ectopic|PID|discharge|heavy bleeding")
  },
  {
    intentId: "gu_renal_dysuria_v1",
    modifiers: "burning pee fever flank pain pyelonephritis concern poor oral intake",
    requireHistory: rx("pregnancy|catheter|retention|stone|resistant|recent antibiotics")
  },
  {
    intentId: "stroke_focal_neuro_v1",
    modifiers: "face droop aphasia right arm weakness stroke alert",
    requireHistory: rx("anticoagulant|recent surgery|bleeding|seizure|hypoglycemia|trauma")
  },
  {
    intentId: "thyroid_crisis_v1",
    modifiers: "thyroid storm fever agitation atrial fibrillation infection",
    requireHistory: rx("antithyroid|levothyroxine|iodine|amiodarone|postpartum|steroid")
  },
  {
    intentId: "routine_thyroid_disease_v1",
    modifiers: "routine thyroid disease evaluation abnormal TSH nodule hoarseness",
    requireHistory: rx("neck mass|dysphagia|hoarseness|radiation|MEN2|biotin"),
    requireExam: rx("Inspect and palpate thyroid[\\s\\S]*Inspect skin for thyroid phenotype|Inspect skin for thyroid phenotype[\\s\\S]*Inspect and palpate thyroid")
  },
  {
    intentId: "diabetes_foot_neuropathy_v1",
    modifiers: "diabetes foot ulcer numbness poor footwear discharge planning",
    requireHistory: rx("spreading redness|drainage|rest pain|black tissue|offload|follow-up")
  },
  {
    intentId: "rash_skin_v1",
    modifiers: "rash hives itching new medication fever mucosal symptoms",
    requireHistory: rx("mucosal|facial|tongue|trouble breathing|blistering|purpura|new medication"),
    requireCore: rx("Inspect skin"),
    requireConditional: rx("Inspect mucosa for lesions")
  },
  {
    intentId: "eye_redness_vision_v1",
    modifiers: "red painful eye photophobia contact lens use severe headache",
    requireHistory: rx("jaw claudication|scalp tenderness|halos|chemical exposure|shingles"),
    requireHistoryLabel: rx("vision-threatening red-eye|ocular emergency"),
    avoidHistoryLabel: rx("infection-source|rash danger|urinary and flank")
  },
  {
    intentId: "bleeding_anemia_v1",
    modifiers: "pallor easy bruising melena anticoagulant dizziness",
    requireHistory: rx("anticoagulant|antiplatelet|liver disease|kidney disease|transfusion")
  },
  {
    intentId: "focused_msk_v1",
    modifiers: "joint pain and swelling without clear site yet fever trauma",
    requireHistory: rx("trauma|bear weight|hot swollen joint|injection drug|bowel|bladder")
  }
];

for (const testCase of remediatedFocusedHistoryCases) {
  const recommendation = recommendationForIntent([testCase.intentId], testCase.modifiers);
  const questions = recommendation.focusedHistoryQuestions || [];
  const historyText = questions
    .map((question) => [question.text, question.options, question.diagnosticPurpose, question.managementImplication].filter(Boolean).join(" "))
    .join(" | ");
  const historyLabelText = questions
    .map((question) => [question.label, question.displayLabel].filter(Boolean).join(" "))
    .join(" | ");
  const coreText = labels(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []);
  const conditionalText = labels(recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []);
  const examText = [coreText, conditionalText].filter(Boolean).join(" | ");
  assert.ok(
    questions.length >= 2,
    `${testCase.intentId}: validated workup should have at least two focused history questions, not one overloaded prompt`
  );
  assert.match(historyText, testCase.requireHistory, `${testCase.intentId}: supplemental focused history should address the source-specific risk domain`);
  if (testCase.requireHistoryLabel) {
    assert.match(
      historyLabelText,
      testCase.requireHistoryLabel,
      `${testCase.intentId}: focused history labels should be clinically specific, not generic`
    );
  }
  if (testCase.avoidHistoryLabel) {
    assert.doesNotMatch(
      historyLabelText,
      testCase.avoidHistoryLabel,
      `${testCase.intentId}: focused history labels should not leak unrelated clinical domains`
    );
  }
  if (testCase.requireCore) {
    assert.match(coreText, testCase.requireCore, `${testCase.intentId}: core exam should include the clinically required maneuver`);
  }
  if (testCase.requireExam) {
    assert.match(examText, testCase.requireExam, `${testCase.intentId}: exam section should include the clinically required maneuvers`);
  }
  if (testCase.requireConditional) {
    assert.match(conditionalText, testCase.requireConditional, `${testCase.intentId}: conditional exam add-ons should include the clinically required maneuver`);
  }
  assert.ok(
    !(recommendation.catalogGapsNeedingReview || []).some((gap) => /Focused history question enrichment needs review/i.test(gap.label || "")),
    `${testCase.intentId}: focused history enrichment should be satisfied rather than staged as a gap`
  );
  assert.doesNotMatch(
    recommendation.warnings.join(" "),
    /Focused history question enrichment needs review/i,
    `${testCase.intentId}: remediated focused history should not warn as a thin history gap`
  );
  questions.forEach((question) => {
    assert.ok(question.diagnosticPurpose, `${testCase.intentId}: history questions should state diagnostic purpose`);
    assert.ok(question.managementImplication, `${testCase.intentId}: history questions should state management implication`);
    assert.ok(question.source, `${testCase.intentId}: history questions should retain source IDs`);
    assert.match(
      question.evidence?.likelihood_ratio_note || "",
      /LR\+\/LR-|LR values|likelihood/i,
      `${testCase.intentId}: history questions should explain when LR values are unavailable`
    );
    assert.ok(
      (question.traceability?.intent_ids || []).includes(testCase.intentId),
      `${testCase.intentId}: history questions should trace back to the selected validated intent`
    );
  });
}

const routineThyroidRecommendation = recommendationForIntent(
  ["routine_thyroid_disease_v1"],
  "routine thyroid disease evaluation abnormal TSH thyroid nodule hoarseness palpitations cold intolerance pregnancy planning biotin"
);
const routineThyroidHistoryText = (routineThyroidRecommendation.focusedHistoryQuestions || [])
  .map((question) => [question.text, question.options, question.diagnosticPurpose, question.managementImplication].filter(Boolean).join(" "))
  .join(" | ");
[
  /neck swelling|rapid growth|thyroid pain|hoarseness|dysphagia|positional shortness/i,
  /childhood head|neck radiation|family thyroid cancer|MEN2|suspicious prior biopsy/i,
  /thyroid hormone|antithyroid|amiodarone|lithium|biotin|iodine|contrast/i,
  /pregnancy|postpartum|breastfeeding|fertility/i,
  /heat intolerance|palpitations|tremor|sweating|weight loss|diarrhea/i,
  /cold intolerance|fatigue|constipation|dry or coarse skin|hoarse voice|slowed thinking/i
].forEach((pattern) => {
  assert.match(
    routineThyroidHistoryText,
    pattern,
    `routine thyroid workup should include an atomic history domain matching ${pattern.source}`
  );
});
const routineThyroidHistoryItems = (routineThyroidRecommendation.focusedHistoryQuestions || [])
  .map((question) => [question.text, question.options, question.diagnosticPurpose, question.managementImplication].filter(Boolean).join(" "));
[
  /neck mass growth[\s\S]*pregnancy[\s\S]*amiodarone/i,
  /radiation exposure[\s\S]*biotin/i,
  /family thyroid cancer[\s\S]*thyroid medication/i,
  /heat intolerance sweating cold intolerance dry skin constipation tremor slowed thinking/i
].forEach((pattern) => {
  routineThyroidHistoryItems.forEach((itemText) => {
    assert.doesNotMatch(
      itemText,
      pattern,
      `routine thyroid workup should not use the old bundled history wording ${pattern.source}`
    );
  });
});
const acceptedThyroidSkinRow = acceptedCatalogAdditionRows.find((row) => row.exam_id === "EXAM-ENDO-THYROID-SKIN-PHENOTYPE");
assert.ok(acceptedThyroidSkinRow, "accepted catalog should include thyroid skin phenotype row");
assert.doesNotMatch(
  acceptedThyroidSkinRow.bedside_question_label || "",
  /heat intolerance sweating cold intolerance dry skin constipation tremor slowed thinking/i,
  "accepted thyroid skin phenotype row should not use the old unpunctuated symptom chain"
);

const feverSourceRecommendation = recommendationForIntent(
  ["fever_sepsis_v1"],
  "fever with no source yet, possible pneumonia or urinary source"
);
const feverManagementText = labels(feverSourceRecommendation.managementChangingFindings || []);
assert.doesNotMatch(
  feverManagementText,
  /Blood pressure|Heart rate|Respiratory rate|Oxygen saturation|Temperature|How high was the fever|What symptoms localize/i,
  "fever/sepsis management-changing findings should not duplicate routine safety checks or focused history questions"
);
assert.match(
  feverManagementText,
  /Sepsis severity labs|Source-directed infection studies|Respiratory source imaging|Escalate unstable fever|outpatient follow-up/i,
  "fever/sepsis management-changing findings should retain tests, red flags, and explicit disposition cues"
);
const feverRespiratorySourceQuestionCount = (feverSourceRecommendation.focusedHistoryQuestions || [])
  .filter((question) => !/localize the fever source/i.test(question.text || ""))
  .filter((question) => /cough/i.test(question.text || "") && /sputum|pleuritic|oxygen|dyspnea|shortness/i.test(question.text || ""))
  .length;
assert.equal(
  feverRespiratorySourceQuestionCount,
  1,
  "fever/sepsis workup should include one non-duplicative respiratory-source history question"
);
const feverFocusedHistoryText = (feverSourceRecommendation.focusedHistoryQuestions || [])
  .map((question) => `${question.label || question.displayLabel || ""} ${question.text || ""} ${question.options || ""}`)
  .join(" | ");
assert.doesNotMatch(
  feverFocusedHistoryText,
  /what symptoms localize the fever source/i,
  "fever/sepsis workup should not expose one overloaded source-localizing history question"
);
[
  /Ask respiratory infection-source symptoms[\s\S]*cough[\s\S]*sputum[\s\S]*shortness/i,
  /Ask HEENT\/oral source symptoms[\s\S]*sore throat[\s\S]*dental/i,
  /Ask urinary and flank infection-source symptoms[\s\S]*dysuria[\s\S]*flank/i,
  /Ask abdominal and GI infection-source symptoms[\s\S]*abdominal pain[\s\S]*vomiting[\s\S]*diarrhea/i,
  /Ask skin\/line infection-source symptoms[\s\S]*rash[\s\S]*wound[\s\S]*line/i,
  /Ask CNS\/joint\/spine danger symptoms[\s\S]*headache[\s\S]*neck stiffness[\s\S]*hot swollen joint/i,
  /Ask host-risk and exposure history[\s\S]*immunosuppression[\s\S]*travel[\s\S]*sick contacts/i
].forEach((pattern) => {
  assert.match(
    feverFocusedHistoryText,
    pattern,
    `fever/sepsis focused history should expose atomic source-domain row ${pattern.source}`
  );
});
const feverHostExposureQuestionCount = (feverSourceRecommendation.focusedHistoryQuestions || [])
  .filter((question) => /host-risk and exposure history/i.test(question.displayLabel || question.label || ""))
  .length;
assert.equal(
  feverHostExposureQuestionCount,
  1,
  "fever/sepsis workup should include one non-duplicative host/exposure history question"
);
const feverHostExposureQuestion = (feverSourceRecommendation.focusedHistoryQuestions || [])
  .find((question) => /host-risk and exposure history/i.test(question.displayLabel || question.label || ""));
assert.equal(
  feverHostExposureQuestion?.displayLabel,
  "Ask host-risk and exposure history",
  "fever/sepsis host-risk and exposure question should not be mislabeled as a skin/wound source question"
);
const feverMultiSourceModuleResult = evaluateComplaintCds(
  "fever abdominal pain vomiting diarrhea jaundice severe headache neck stiffness photophobia seizure purpura rash wound line drainage soft-tissue infection hot swollen joint bone pain severe back pain spine infection",
  {},
  { module: complaintModules.find((module) => module.id === "fever_infection_sepsis_v1") }
);
const feverHistoryQuestionText = [
  ...(feverMultiSourceModuleResult.requiredQuestions || []),
  ...(feverMultiSourceModuleResult.conditionalQuestions || [])
]
  .map((question) => `${question.text || ""} ${question.label || ""}`)
  .join(" | ");
assert.doesNotMatch(
  feverHistoryQuestionText,
  /abdominal,\s*CNS,\s*skin,\s*line,\s*joint,\s*or\s*spine source features/i,
  "fever/sepsis should not collapse abdominal, CNS, skin/line, and joint/spine source history into one bundled question"
);
[
  /abdominal pain|vomiting|diarrhea|jaundice/i,
  /headache|neck stiffness|photophobia|seizure|purpura/i,
  /rash|wound|line|drainage|soft-tissue/i,
  /hot swollen joint|bone pain|severe back pain|spine/i
].forEach((pattern) => {
  assert.match(
    feverHistoryQuestionText,
    pattern,
    `fever/sepsis should preserve separate source-domain history coverage for ${pattern.source}`
  );
});
const feverDomainCoverageIssues = auditRecommendedWorkupDomainCoverage(
  selectedValidatedClinicalIntents(["fever_sepsis_v1"]),
  feverSourceRecommendation
);
assert.deepEqual(
  feverDomainCoverageIssues.map((issue) => issue.label),
  [],
  `fever/sepsis recommendation should satisfy all hard required-domain checks: ${feverDomainCoverageIssues.map((issue) => issue.label).join("; ")}`
);
const feverSourceCoreText = labels(feverSourceRecommendation.corePhysicalExamManeuvers || []);
const feverSourceConditionalText = labels(feverSourceRecommendation.conditionalPhysicalExamManeuvers || []);
assert.match(
  feverSourceCoreText,
  /Auscultate posterior lung fields/i,
  "fever with possible pneumonia should make lung auscultation a core exam item"
);
assert.match(
  feverSourceCoreText,
  /Observe work of breathing/i,
  "fever with possible pneumonia should make work-of-breathing assessment a core exam item"
);
assert.doesNotMatch(
  `${feverSourceCoreText} | ${feverSourceConditionalText}`,
  /Tactile fremitus|Percuss posterior lung|Percuss anterior lung/i,
  "fever with possible pneumonia alone should not add lower-yield percussion/fremitus unless focal/asymmetric findings are present"
);
const feverConciseReport = formatConciseExamRecommendationReport(feverSourceRecommendation);
const feverStartHereIndex = feverConciseReport.indexOf("Start here / minimum bedside workup");
assert.ok(
  feverStartHereIndex > 0,
  "concise workup copy should include a start-here section that summarizes the minimum bedside workup"
);
assert.ok(
  feverStartHereIndex < feverConciseReport.indexOf("Baseline vitals / safety data"),
  "start-here summary should appear before routine safety metadata in copied workups"
);
const feverStartHereExcerpt = feverConciseReport.slice(feverStartHereIndex, feverStartHereIndex + 4200);
[
  /ask: Ask respiratory infection-source symptoms/i,
  /ask: Ask HEENT\/oral source symptoms/i,
  /examine: Observe work of breathing/i,
  /examine: Auscultate posterior lung fields/i,
  /examine: Inspect skin for infection source/i
].forEach((pattern) => {
  assert.match(
    feverStartHereExcerpt,
    pattern,
    `start-here fever summary should visibly include ${pattern.source}`
  );
});
const thinFeverDomainCoverageIssues = auditRecommendedWorkupDomainCoverage(
  selectedValidatedClinicalIntents(["fever_sepsis_v1"]),
  {
    focusedHistoryQuestions: [{ label: "How high was the fever?", text: "How high was the fever?" }],
    corePhysicalExamManeuvers: [{ label: "Palpate radial pulses", domain: "Perfusion" }],
    conditionalPhysicalExamManeuvers: [],
    initialTestsAndReferenceThresholds: [],
    managementChangingFindings: [],
    redFlagsAndEscalationCues: []
  }
).map((issue) => issue.label).join(" | ");
assert.match(
  thinFeverDomainCoverageIssues,
  /Fever source-localizing infection history needs review/i,
  "domain coverage audit should flag fever workups that omit source-localizing infection questions"
);
assert.match(
  thinFeverDomainCoverageIssues,
  /Fever respiratory source lung exam needs review/i,
  "domain coverage audit should flag fever workups that omit lung sounds or work-of-breathing assessment"
);
assert.match(
  thinFeverDomainCoverageIssues,
  /Fever skin\/HEENT source exam needs review/i,
  "domain coverage audit should flag fever workups that omit visible infection-source exams"
);
const dkaDomainCoverageIssues = auditRecommendedWorkupDomainCoverage(
  selectedValidatedClinicalIntents(["dka_hhs_v1"]),
  recommendationForIntent(["dka_hhs_v1"], "vomiting poor intake dehydration abdominal pain kussmaul concern")
);
assert.deepEqual(
  dkaDomainCoverageIssues.map((issue) => issue.label),
  [],
  `DKA/HHS recommendation should satisfy crisis-domain checks: ${dkaDomainCoverageIssues.map((issue) => issue.label).join("; ")}`
);
const dkaStandaloneRecommendation = recommendationForIntent(
  ["dka_hhs_v1"],
  "vomiting poor intake dehydration abdominal pain kussmaul concern"
);
assert.equal(
  dkaStandaloneRecommendation.workupReadiness?.status,
  "complete_validated",
  "standalone DKA/HHS evidence recommendation should be complete without relying on a separate guideline-module dump"
);
assert.match(
  labels(dkaStandaloneRecommendation.corePhysicalExamManeuvers || []),
  /Observe Kussmaul respiratory pattern/i,
  "DKA/HHS should keep respiratory-pattern assessment as an atomic action-style physical exam maneuver"
);
assert.match(
  labels(dkaStandaloneRecommendation.initialTestsAndReferenceThresholds || []),
  /DKA\/HHS diagnostic and severity thresholds/i,
  "DKA/HHS should include diagnostic criteria, ketone/acidosis, potassium, renal, and osmolality thresholds in the evidence recommendation"
);
assert.match(
  labels(dkaStandaloneRecommendation.initialTestsAndReferenceThresholds || []),
  /DKA\/HHS precipitant and safety testing/i,
  "DKA/HHS should include precipitant and treatment-safety testing in the evidence recommendation"
);
assert.match(
  labels(dkaStandaloneRecommendation.redFlagsAndEscalationCues || []),
  /DKA\/HHS high-acuity escalation cues/i,
  "DKA/HHS should include high-acuity escalation cues in the evidence recommendation"
);
assert.deepEqual(
  (dkaStandaloneRecommendation.catalogGapsNeedingReview || []).map((gap) => gap.label),
  [],
  "standalone DKA/HHS evidence recommendation should not stage already-modeled safety, test, or red-flag rows as catalog gaps"
);
const dkaInfectionModifierRecommendation = recommendationForIntent(
  ["hyperglycemia_possible_dka_v1"],
  "fever cough dysuria wound poor intake"
);
const dkaInfectionHistoryLabels = (dkaInfectionModifierRecommendation.focusedHistoryQuestions || [])
  .map((question) => question.label || question.displayLabel || "")
  .join(" | ");
[
  /UTI symptoms and complicated-infection risk/i,
  /respiratory infection-source symptoms/i,
  /HEENT\/oral source symptoms/i,
  /urinary and flank infection-source symptoms/i,
  /abdominal and GI infection-source symptoms/i,
  /skin\/line infection-source symptoms/i,
  /CNS\/joint\/spine danger symptoms/i,
  /host-risk and exposure history/i,
  /sepsis severity, hydration, and perfusion symptoms/i,
  /rash danger features and exposure history/i,
  /wound infection and limb-threat features/i,
  /mucosal, ocular, and severe-rash warning features/i
].forEach((pattern) => {
  assert.match(
    dkaInfectionHistoryLabels,
    pattern,
    `DKA with infectious modifiers should preserve clinically specific history label ${pattern.source}`
  );
});
assert.doesNotMatch(
  dkaInfectionHistoryLabels,
  /pregnancy and ectopic|infection-source symptoms - .*mouth|rash danger features.*new cough|urinary symptoms.*respiratory source/i,
  "DKA with infectious modifiers should not leak pelvic, respiratory, urinary, or rash labels across unrelated source questions"
);
const routineType2DiabetesRecommendation = recommendationForIntent(
  ["type_2_diabetes_mellitus_intent_v1"],
  "routine type 2 diabetes follow-up A1c medications kidney foot retinal screening"
);
const routineType2DiabetesHistoryText = (routineType2DiabetesRecommendation.focusedHistoryQuestions || [])
  .map((question) => [
    question.label,
    question.text,
    question.fullQuestion,
    question.action,
    question.management_implication,
    question.reason
  ].filter(Boolean).join(" "))
  .join(" | ");
assert.doesNotMatch(
  routineType2DiabetesHistoryText,
  /pituitary|sellar|parasellar|visual-field review|neurosurgical|diabetes insipidus|water deprivation|copeptin|serum\/urine osmolality/i,
  "routine type 2 diabetes history should not leak pituitary or diabetes-insipidus prompts from broad endocrine vision/polyuria wording"
);
const type2DiabetesModule = complaintModules.find((module) => module.id === "type_2_diabetes_mellitus_v1");
const type2DiabetesModuleHistoryText = JSON.stringify([
  ...(type2DiabetesModule?.requiredQuestions || []),
  ...(type2DiabetesModule?.conditionalQuestions || [])
]);
assert.match(
  type2DiabetesModuleHistoryText,
  /blurred vision|retinopathy|dilated-eye|dilated eye/i,
  "type 2 diabetes module should preserve diabetes eye/retinopathy history"
);
assert.doesNotMatch(
  type2DiabetesModuleHistoryText,
  /pituitary|sellar|parasellar|visual-field review|neurosurgical|diabetes insipidus|water deprivation|copeptin|serum\/urine osmolality/i,
  "type 2 diabetes module history should not leak pituitary or diabetes-insipidus prompts from broad endocrine vision/polyuria wording"
);
const gestationalDiabetesModule = complaintModules.find((module) => module.id === "gestational_diabetes_v1");
const gestationalPreeclampsiaHistoryText = JSON.stringify([
  ...(gestationalDiabetesModule?.requiredQuestions || []),
  ...(gestationalDiabetesModule?.conditionalQuestions || [])
].filter((question) => /preeclampsia|high blood pressure|right upper quadrant|proteinuria/i.test(JSON.stringify(question))));
assert.match(
  gestationalPreeclampsiaHistoryText,
  /obstetric blood-pressure\/proteinuria|fetal-safety|coordinated endocrine\/OB/i,
  "gestational diabetes preeclampsia history should explain obstetric BP, proteinuria, fetal-safety, and OB/endocrine escalation consequences"
);
assert.doesNotMatch(
  gestationalPreeclampsiaHistoryText,
  /pituitary|sellar|parasellar|visual-field review|neurosurgical|water deprivation|copeptin/i,
  "gestational diabetes headache/visual-symptom history should not be interpreted as pituitary leakage"
);
const routineType2DiabetesExportRun = buildRun(loadCatalog(), {
  diagnosis: "",
  intentIds: ["type_2_diabetes_mellitus_intent_v1"],
  allMatches: false,
  modifiers: "routine type 2 diabetes follow-up A1c medications kidney foot retinal screening",
  setting: "General medicine",
  population: "Adult",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const routineType2DiabetesExportHistoryText = (routineType2DiabetesExportRun.results[0]?.history || [])
  .map((entry) => [
    entry.label,
    entry.fullQuestion,
    entry.reason,
    entry.action,
    entry.managementChange
  ].filter(Boolean).join(" "))
  .join(" | ");
assert.match(
  routineType2DiabetesExportHistoryText,
  /blurred vision|retinopathy|dilated-eye|dilated eye/i,
  "installed type 2 diabetes workup export should preserve diabetes eye/retinopathy history"
);
assert.doesNotMatch(
  routineType2DiabetesExportHistoryText,
  /pituitary|sellar|parasellar|visual-field review|neurosurgical|diabetes insipidus|water deprivation|copeptin|serum\/urine osmolality/i,
  "installed type 2 diabetes export should not leak pituitary or diabetes-insipidus prompts from broad endocrine vision/polyuria wording"
);
const type2DiabetesInfectionRecommendation = recommendationForIntent(
  ["type_2_diabetes_mellitus_intent_v1"],
  "fever cough pneumonia wound line skin redness drainage"
);
const type2DiabetesInfectionHistoryLabels = labels(type2DiabetesInfectionRecommendation.focusedHistoryQuestions || []);
[
  /respiratory infection-source symptoms/i,
  /skin\/line infection-source symptoms/i,
  /wound infection and limb-threat features/i,
  /host-risk and exposure history/i
].forEach((pattern) => {
  assert.match(
    type2DiabetesInfectionHistoryLabels,
    pattern,
    `type 2 diabetes with infection modifiers should preserve distinct clinical history label ${pattern.source}`
  );
});
assert.doesNotMatch(
  type2DiabetesInfectionHistoryLabels,
  /foot\/wound infection symptoms - (?:infection precipitant|respiratory source|neuropathy symptoms)/i,
  "type 2 diabetes infection modifiers should not relabel fever, respiratory-source, or neuropathy questions as foot/wound infection history"
);
const type2DiabetesExportRun = buildRun(loadCatalog(), {
  diagnosis: "",
  intentIds: ["type_2_diabetes_mellitus_intent_v1"],
  allMatches: false,
  modifiers: "fever cough pneumonia wound line skin redness drainage",
  setting: "General medicine",
  population: "Adult",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const type2DiabetesExportHistoryLabels = (type2DiabetesExportRun.results[0]?.history || [])
  .map((entry) => entry.label || "")
  .join(" | ");
[
  /infection precipitant or mimic symptoms/i,
  /respiratory infection symptoms/i,
  /foot\/wound infection symptoms/i,
  /diabetic foot wound, neuropathy, and self-care risk/i,
  /host-risk and exposure history/i
].forEach((pattern) => {
  assert.match(
    type2DiabetesExportHistoryLabels,
    pattern,
    `type 2 diabetes installed workup export should preserve distinct clinical history label ${pattern.source}`
  );
});
assert.doesNotMatch(
  type2DiabetesExportHistoryLabels,
  /foot\/wound infection symptoms - (?:infection precipitant|respiratory source|neuropathy symptoms)/i,
  "type 2 diabetes installed workup export should not relabel fever, respiratory-source, or neuropathy questions as foot/wound infection history"
);
const peDomainCoverageIssues = auditRecommendedWorkupDomainCoverage(
  selectedValidatedClinicalIntents(["suspected_pe_v1"]),
  recommendationForIntent(["suspected_pe_v1"], "suspected PE dyspnea hypoxia pleuritic chest pain unilateral leg swelling")
);
assert.deepEqual(
  peDomainCoverageIssues.map((issue) => issue.label),
  [],
  `suspected PE recommendation should satisfy cardiopulmonary/DVT-domain checks: ${peDomainCoverageIssues.map((issue) => issue.label).join("; ")}`
);
const genericFeverRanked = rankedCandidatesForIntent(
  ["fever_sepsis_v1"],
  "undifferentiated fever in clinic",
  { maxCandidates: 20 }
);
const genericFeverTopEight = labels(genericFeverRanked.slice(0, 8).map((candidate) => ({ label: candidate.examLabel })));
assert.match(
  genericFeverTopEight,
  /Posterior lung sounds/i,
  "generic fever retrieval should surface lung auscultation near the top, not bury pneumonia screening"
);
assert.match(
  genericFeverTopEight,
  /Mouth exam|Oropharynx/i,
  "generic fever retrieval should surface HEENT/source inspection near the top"
);
assert.match(
  genericFeverTopEight,
  /Radial pulses|Blood pressure|Heart rate|Respiratory rate/i,
  "generic fever retrieval should surface acuity/perfusion screening near the top"
);
assert.doesNotMatch(
  genericFeverTopEight,
  /Abdominal palpation|Bowel sounds|Murphy sign|Rebound tenderness|CVA tenderness|Spleen palpation/i,
  "generic fever retrieval should not promote abdomen/GU add-ons without source-localizing modifiers"
);
const pneumoniaFeverTopFive = labels(rankedCandidatesForIntent(
  ["fever_sepsis_v1"],
  "fever cough sputum dyspnea possible pneumonia",
  { maxCandidates: 10 }
).slice(0, 5).map((candidate) => ({ label: candidate.examLabel })));
assert.match(
  pneumoniaFeverTopFive,
  /Posterior lung sounds/i,
  "fever with cough/dyspnea should make lung auscultation a leading retrieval candidate"
);
const focalPneumoniaFeverRecommendation = recommendationForIntent(
  ["fever_sepsis_v1"],
  "fever cough focal crackles asymmetric diminished breath sounds possible effusion"
);
assert.match(
  labels(focalPneumoniaFeverRecommendation.conditionalPhysicalExamManeuvers || []),
  /Percuss posterior lung|Tactile fremitus/i,
  "fever with focal/asymmetric lung findings should allow pulmonary characterization add-ons"
);
const sourceScreeningInstructionFever = recommendationForIntent(
  ["fever_sepsis_v1"],
  "fever in clinic; ask about cough sputum dyspnea urinary symptoms rash wounds headache neck stiffness abdominal pain travel sick contacts immunosuppression"
);
const sourceScreeningCoreExamText = labels(sourceScreeningInstructionFever.corePhysicalExamManeuvers || []);
assert.match(
  sourceScreeningCoreExamText,
  /Auscultate posterior lung fields|Inspect oral mucosa|Inspect skin source|Inspect skin for infection source/i,
  "fever source-screening instructions should still produce a clinically useful source exam"
);
assert.doesNotMatch(
  sourceScreeningCoreExamText,
  /Palpate abdomen|Auscultate bowel sounds|Percuss costovertebral angle tenderness|Test Murphy sign|Test rebound tenderness/i,
  "source-screening instruction text should not be treated as positive abdominal or GU symptoms"
);
assert.match(
  (sourceScreeningInstructionFever.focusedHistoryQuestions || [])
    .map((question) => `${question.text} ${(question.detail_prompts || []).join(" ")}`)
    .join(" | "),
  /cough|sputum|dyspnea|dysuria|flank pain|abdominal pain|rash|wound|neck stiffness/i,
  "fever source-screening instructions should remain visible as focused history prompts"
);
const abdominalFeverTopTen = labels(rankedCandidatesForIntent(
  ["fever_sepsis_v1"],
  "fever abdominal pain vomiting guarding possible appendicitis",
  { maxCandidates: 15 }
).slice(0, 10).map((candidate) => ({ label: candidate.examLabel })));
assert.match(
  abdominalFeverTopTen,
  /Abdominal palpation|Bowel sounds|Murphy sign|Rebound tenderness|Palpate abdomen|Auscultate bowel sounds|Test Murphy sign|Test rebound tenderness/i,
  "fever with abdominal source modifiers should still retrieve abdominal source exams"
);

const suppressedAuditSample = feverSourceRecommendation.suppressedItems || [];
assert.ok(suppressedAuditSample.length > 0, "fever/sepsis audit should retain suppressed/lower-fit candidates for reviewer inspection");
suppressedAuditSample.slice(0, 6).forEach((entry) => {
  assert.ok(entry.reason || entry.suppressionReason, `${entry.label}: suppressed item should explain why it was not recommended`);
  assert.ok(sourceForEntry(entry), `${entry.label}: suppressed item should retain source/evidence metadata`);
  assert.ok(hasLikelihoodRatioFields(entry), `${entry.label}: suppressed item should retain LR fields even when values are n/a`);
  assert.ok(feasibilityComplete(entry), `${entry.label}: suppressed item should retain feasibility metadata`);
  assert.ok(tagsForEntry(entry), `${entry.label}: suppressed item should retain matched/retrieval tags`);
  assert.ok(
    intentTraceIdsForEntry(entry).includes("fever_sepsis_v1"),
    `${entry.label}: suppressed item should remain traceable to the selected validated intent`
  );
});

const feverConciseExamReport = formatConciseExamRecommendationReport(feverSourceRecommendation);
const feverConciseClinicalReport = formatConciseClinicalWorkupReport({
  input: "fever with possible pneumonia or urinary source",
  guidelineSetting: "Clinician support",
  examSetting: "General medicine",
  builtAt: "2026-06-08T00:00:00.000Z",
  selectedIntents: selectedValidatedClinicalIntents(["fever_sepsis_v1"]),
  recommendation: feverSourceRecommendation,
  complaintMatched: true
});
[
  "Unified Clinical Workup",
  "Validated Bedside Workup",
  "Baseline vitals / safety data",
  "Vitals and basic measurements are baseline clinical data; they are not physical exam maneuvers.",
  "Focused history questions",
  "Core physical exam maneuvers",
  "Conditional exam add-ons",
  "Initial tests and reference thresholds",
  "Red flags and escalation cues",
  "Management-changing findings",
  "Limitations and interpretation cautions",
  "Compact audit footer",
  "Ask respiratory infection-source symptoms",
  "Ask skin/line infection-source symptoms",
  "Auscultate posterior lung fields",
  "Observe work of breathing",
  "Technique:",
  "Use when:",
  "Management change:",
  "Evidence/LR:",
  "LR interpretation:",
  "Feasibility:",
  "Limitations:",
  "Trace IDs:",
  "Source IDs:",
  "Source currency:",
  "Reviewer-only omitted:",
  "Reviewer audit: use Copy review audit"
].forEach((requiredText) => {
  assert.ok(
    feverConciseClinicalReport.includes(requiredText),
    `Concise fever workup copy should include clinically useful section/detail: ${requiredText}`
  );
});
assert.ok(
  feverConciseExamReport.includes("Raw retrieval candidates, score/debug detail, and supporting module dumps are available only in Copy review audit"),
  "Concise exam recommendation report should explicitly separate user-facing recommendations from reviewer-only retrieval/debug detail"
);
assert.match(
  feverConciseClinicalReport,
  /Source currency:[\s\S]*(?:AHRQ_CALIBRATE_DX|SSC_SEPSIS_2026|ATS_CAP_2025)[\s\S]*accessed \d{4}-\d{2}-\d{2}[\s\S]*reviewed \d{4}-\d{2}-\d{2}[\s\S]*next review due \d{4}-\d{2}-\d{2}[\s\S]*status reviewed_/i,
  "Concise copied workup should display source currency/access/review metadata for registry-backed citations"
);
assert.doesNotMatch(
  feverConciseClinicalReport,
  /<validated_clinical_intents>|<retrieved_evidence_candidates>|<student_exam_reference>|Guideline Complaint CDS|Top Retrieved Evidence Candidates|retrievedCandidates|state\.examTesterCandidates|Fit\/score\/routes|score \d|Trace route:|Tags:|Citation:|Suppressed\/not-recommended items|Catalog gaps needing review/i,
  "Concise fever workup copy should not include prompt XML blocks, full guideline-module dumps, row-level tags/citations, suppressed lists, catalog-gap lists, or raw retrieval/debug state"
);
assert.ok(
  feverConciseClinicalReport.length > 4000 && feverConciseClinicalReport.length < 40000,
  `Concise fever workup copy should be detailed but not a raw audit dump; saw ${feverConciseClinicalReport.length} chars`
);
const phiUnsafeConciseClinicalReport = formatConciseClinicalWorkupReport({
  input: "Patient name: Jane Doe MRN 12345 DOB 1/2/1990 room 412B phone 555-222-3333 fever with cough",
  guidelineSetting: "Clinician support",
  examSetting: "General medicine",
  builtAt: "2026-06-08T00:00:00.000Z",
  selectedIntents: selectedValidatedClinicalIntents(["fever_sepsis_v1"]),
  recommendation: feverSourceRecommendation,
  complaintMatched: true
});
assert.match(
  phiUnsafeConciseClinicalReport,
  /\[name\]|\[identifier\]|\[date\]|\[location\]|\[phone\]/,
  "Concise copied workup should redact obvious PHI-like input even if the formatter is called directly"
);
assert.doesNotMatch(
  phiUnsafeConciseClinicalReport,
  /Jane Doe|12345|1\/2\/1990|412B|555-222-3333/i,
  "Concise copied workup should not preserve obvious PHI-like input values"
);
assert.match(
  phiUnsafeConciseClinicalReport,
  /Compact audit footer[\s\S]*Trace IDs:[\s\S]*fever_sepsis_v1[\s\S]*Source IDs:/i,
  "Concise copied workup should retain compact trace/source audit metadata after PHI sanitization"
);

const unsupportedConciseClinicalReport = formatConciseClinicalWorkupReport({
  input: "unsupported concern without validated intent",
  selectedIntents: [],
  recommendation: feverSourceRecommendation
});
assert.match(
  unsupportedConciseClinicalReport,
  /Unsupported Clinical Workup Gap[\s\S]*Recommendations: none/i,
  "Concise copied workup should block recommendations when no validated intent is selected"
);
assert.doesNotMatch(
  unsupportedConciseClinicalReport,
  /Auscultate posterior lung fields|Focused history questions|Core physical exam maneuvers/i,
  "Unsupported copied workup should not leak previously built recommendations"
);

const bloatedMergedRecommendation = {
  ...feverSourceRecommendation,
  managementChangingFindings: Array.from({ length: 30 }, (_, index) => ({
    label: `Source-control management row ${index + 1}`,
    action: "Use the finding to decide cultures, imaging, antimicrobial timing, source control, monitoring level, or disposition.",
    managementChange: "Changes immediate fever/sepsis management.",
    source: "SSC_SEPSIS_2026",
    evidence: { tier: "Guideline" },
    tags: ["infection", "sepsis"]
  })),
  limitationsAndInterpretationCautions: Array.from({ length: 45 }, (_, index) => ({
    label: `Interpretation caution row ${index + 1}`,
    limitation: "Interpret bedside findings with immune status, baseline function, medications, device accuracy, and trajectory.",
    source: "AHRQ_CALIBRATE_DX",
    evidence: { tier: "Diagnostic safety" },
    tags: ["diagnostic_safety"]
  }))
};
const bloatedConciseClinicalReport = formatConciseClinicalWorkupReport({
  input: "fever",
  guidelineSetting: "Clinician support",
  examSetting: "General medicine",
  selectedIntents: selectedValidatedClinicalIntents(["fever_sepsis_v1"]),
  recommendation: bloatedMergedRecommendation,
  complaintMatched: true
});
assert.match(
  bloatedConciseClinicalReport,
  /Management-changing findings[\s\S]*30 rows available; showing the 6 highest-priority rows/i,
  "Concise copied workup should summarize oversized management-finding sections"
);
assert.match(
  bloatedConciseClinicalReport,
  /Limitations and interpretation cautions[\s\S]*45 rows available; showing the 4 highest-priority rows/i,
  "Concise copied workup should summarize oversized limitation sections"
);
assert.ok(
  bloatedConciseClinicalReport.length < 40000,
  `Concise copied workup should stay bounded even after guideline-module merge; saw ${bloatedConciseClinicalReport.length} chars`
);
assert.doesNotMatch(
  bloatedConciseClinicalReport,
  /Interpretation caution row 45|Source-control management row 30/i,
  "Concise copied workup should keep overflow guideline rows in the review audit rather than normal copy"
);

const peRecommendation = recommendationForIntent(
  ["suspected_pe_v1"],
  "suspected PE with pleuritic chest pain dyspnea hypoxia and unilateral leg swelling"
);
const peManagementText = labels(peRecommendation.managementChangingFindings || []);
assert.doesNotMatch(
  peManagementText,
  /Blood pressure|Heart rate|Respiratory rate|Oxygen saturation|Any sudden shortness of breath|prior VTE|recent surgery/i,
  "PE management-changing findings should not duplicate routine safety checks or VTE history questions"
);
assert.match(
  peManagementText,
  /lung fields|jugular venous pressure|heart sounds|radial pulses|work of breathing|unilateral leg swelling|D-dimer|right-heart strain/i,
  "PE management-changing findings should retain exam and test findings that change management"
);

const uiSource = readFileSync("index.html", "utf8");
if (uiSource.includes("prerounding-redesign-state-v1")) {
  for (const requiredSnippet of [
    "function ensureWorkup",
    "resolveUiComplaintModule",
    "evaluateUiComplaintCds",
    "fallbackComplaintResult",
    'id="workupRows"',
    "Prioritized bedside questions",
    "Basic safety checks",
    "Red flags",
    "Targeted exam",
    "Initial workup",
    "Clinical reasoning aids",
    "buildLocalChecklistFromWorkup",
    "parseChecklist",
    'const endorsementOptions = ["No", "Yes"];',
    'id="copyWorkupButton"',
    'id="patientWorkupSelect"',
    'id="patientWorkupResults"',
    "Select a reviewed workup from the results list before building.",
    "PHI safety check for workup copy",
    "Task boundary:",
    "Output contract:",
    "Context preview:",
    "code-paired local bundles",
    "not HIPAA certification"
  ]) {
    assert.ok(uiSource.includes(requiredSnippet), `Redesigned workup UI guardrail missing: ${requiredSnippet}`);
  }
  assert.ok(!uiSource.includes("Paste the initial rounds prompt into OpenEvidence first so"), "Redesigned UI should not make OpenEvidence the prerequisite before local checklist build");
  assert.ok(!uiSource.includes("Ask focused source, severity, and safety features"), "Redesigned UI should not fall back to a generic source/severity/safety label");
  console.log(`Clinical workup quality tests passed for ${qualityCases.length} tiered recommendation cases, ${historyQualityCases.length} history-source cases, and ${remediatedFocusedHistoryCases.length} remediated focused-history cases with redesigned UI shell guardrails.`);
  process.exit(0);
}
const historyQuestionRendererStart = uiSource.indexOf("function renderWorkupHistoryQuestion");
const historyQuestionRendererEnd = uiSource.indexOf("function renderWorkupManagementFinding", historyQuestionRendererStart);
assert.ok(
  historyQuestionRendererStart > 0 && historyQuestionRendererEnd > historyQuestionRendererStart,
  "UI source should include focused history question renderer"
);
assert.ok(
  uiSource.slice(historyQuestionRendererStart, historyQuestionRendererEnd).includes("Detail prompts"),
  "UI should expose concrete detail prompts inside focused history question cards"
);
assert.ok(
  uiSource.slice(historyQuestionRendererStart, historyQuestionRendererEnd).includes("renderHistoryOptionResponseControls")
    && uiSource.slice(historyQuestionRendererStart, historyQuestionRendererEnd).includes("Recorded responses"),
  "UI should let broad focused-history questions capture per-option endorsed/denied response marks"
);
assert.ok(
  uiSource.includes("data-history-option-response")
    && uiSource.includes("clinicalHistoryOptionResponses")
    && uiSource.includes("Recorded responses:"),
  "Focused history response marks should be stateful and included in copied workup text"
);
assert.ok(
  uiSource.includes("function usesSymptomResponseAnswers")
    && uiSource.includes("Answer every component: left (-) denied, right (+) endorsed.")
    && uiSource.includes("(-) Denied")
    && uiSource.includes("(+) Endorsed")
    && uiSource.includes("finding-symptom-response-button")
    && uiSource.includes("setSymptomResponse(item, component, \"endorsed\")"),
  "Checklist bedside symptom-list questions should render explicit per-symptom -/+ endorsed/denied controls"
);
assert.ok(
  uiSource.includes("phone-concept-symptom-response-button")
    && uiSource.includes("function phoneConceptSetSymptomResponse")
    && uiSource.includes("Use left (-) Denied and right (+) Endorsed")
    && uiSource.includes("mode === \"questions\" && usesSymptomResponseAnswers(item)")
    && uiSource.includes('data-phone-action="response-option"'),
  "Mobile bedside symptom-list questions should use the same endorsed/denied control model"
);
assert.ok(
  uiSource.slice(historyQuestionRendererStart, historyQuestionRendererEnd).includes("question.displayLabel || question.text")
    && uiSource.slice(historyQuestionRendererStart, historyQuestionRendererEnd).includes("Full source question"),
  "UI should use concise history display labels while preserving full source questions for audit"
);
const complaintItemRendererStart = uiSource.indexOf("function renderComplaintCdsItem");
const complaintItemRendererEnd = uiSource.indexOf("function renderWorkupHistoryQuestion", complaintItemRendererStart);
assert.ok(
  complaintItemRendererStart > 0 && complaintItemRendererEnd > complaintItemRendererStart,
  "UI source should include installed guideline module item renderer"
);
const complaintItemRendererSource = uiSource.slice(complaintItemRendererStart, complaintItemRendererEnd);
assert.ok(
  uiSource.includes("function compactComplaintCdsQuestionLabel")
    && uiSource.includes("function compactSourceQuestionFallbackLabel")
    && complaintItemRendererSource.includes("compactComplaintCdsQuestionLabel(item)")
    && complaintItemRendererSource.includes("Source question wording")
    && complaintItemRendererSource.includes("Full source question"),
  "Installed guideline module detail should use compact question labels while preserving full source wording in collapsed reviewer detail"
);
assert.doesNotMatch(
  uiSource,
  /Ask focused source, severity, and safety features/,
  "Module question compacting should not fall back to a generic source/severity/safety label"
);
assert.ok(
  uiSource.includes("function uniquifyClinicalHistoryDisplayLabels")
    && uiSource.includes("recommendation.focusedHistoryQuestions = uniquifyClinicalHistoryDisplayLabels(recommendation.focusedHistoryQuestions)"),
  "Unified workup UI should make focused-history display labels unique after merging evidence and installed-module history"
);
const evidenceSummaryStart = uiSource.indexOf("function renderUnifiedEvidenceSummary");
const evidenceSummaryEnd = uiSource.indexOf("function renderComplaintCdsResult");
assert.ok(evidenceSummaryStart > 0 && evidenceSummaryEnd > evidenceSummaryStart, "UI source should include unified evidence summary renderer");
const evidenceSummarySource = uiSource.slice(evidenceSummaryStart, evidenceSummaryEnd);
assert.ok(
  evidenceSummarySource.includes('title.textContent = "Recommended evidence-backed workup";'),
  "UI should present the evidence-backed workup as the recommendation, not as raw audit"
);
assert.ok(
  evidenceSummarySource.includes("authorizationStatus")
    && evidenceSummarySource.includes("validated-intent authorized")
    && evidenceSummarySource.includes("audit-only; not final")
    && evidenceSummarySource.includes("Recommendation authorization:")
    && evidenceSummarySource.includes("Recommendation warnings:"),
  "UI should visibly distinguish validated final recommendations from audit-only retrieval output"
);
assert.ok(
  evidenceSummarySource.indexOf('"Focused history questions"') < evidenceSummarySource.indexOf('"Core physical exam maneuvers"'),
  "UI should show focused history before physical exam maneuvers"
);
assert.ok(
  evidenceSummarySource.indexOf('"Baseline vitals / safety data"') < evidenceSummarySource.indexOf('"Focused history questions"'),
  "UI should show baseline vitals/safety data before focused history questions"
);
assert.ok(
  evidenceSummarySource.indexOf('"Baseline vitals / safety data"') < evidenceSummarySource.indexOf('"Core physical exam maneuvers"'),
  "UI should show baseline vitals/safety data before physical exam maneuvers"
);
assert.ok(
  evidenceSummarySource.includes('"Start here / minimum bedside workup"')
    && evidenceSummarySource.includes("workupStartHereHighlights(recommendation)")
    && evidenceSummarySource.indexOf('"Start here / minimum bedside workup"') < evidenceSummarySource.indexOf('"Focused history questions"'),
  "UI should surface a start-here minimum bedside workup before detailed history/exam sections"
);
assert.ok(
  evidenceSummarySource.includes("appendBaselineBedsideDataBoundary(section, safetyChecks.length)")
    && evidenceSummarySource.includes('renderExamTesterCandidate(entry, index, { rankPrefix: "B", sectionKind: "baseline-data" })'),
  "UI should render baseline vitals/safety as a visible not-exam section before maneuver sections"
);
assert.ok(
  evidenceSummarySource.includes('"Red flags and escalation cues"'),
  "UI should show evidence-backed red flags/escalation cues when available"
);
assert.ok(
  evidenceSummarySource.includes('"Workup gaps needing review"'),
  "UI should show staged missing-workup gaps in the primary workup area"
);
assert.ok(
  evidenceSummarySource.includes("workup gap")
    && evidenceSummarySource.includes("reviewer-only catalog item")
    && evidenceSummarySource.includes("Validated workup; reviewer catalog items available"),
  "UI should separate true workup-completeness gaps from reviewer-only catalog/audit items"
);
assert.ok(
  evidenceSummarySource.includes('"Initial tests and reference thresholds"'),
  "UI should show evidence-backed tests/reference thresholds when available"
);
assert.ok(
  uiSource.includes('title: "Baseline vitals / safety data"')
    && uiSource.includes('copy: "Measured data and safety checks before exam maneuvers"')
    && uiSource.includes('title: "Physical exam maneuvers"')
    && uiSource.includes('copy: isDkaReferenceState ? "Individual bedside maneuvers for DKA" : "Individual bedside maneuvers for selected concern"')
    && uiSource.includes('detail.dataset.sectionKind = row.kind'),
  "Compact workup board should visibly separate baseline vitals/safety data from physical exam maneuvers"
);
assert.ok(
  evidenceSummarySource.includes('"Management-changing findings"')
    && evidenceSummarySource.includes('"Limitations and interpretation cautions"')
    && evidenceSummarySource.includes('"Evidence/LR metadata"')
    && evidenceSummarySource.includes('"Catalog gaps needing review"'),
  "Unified UI should expose management-changing findings, limitations, evidence/LR metadata, and catalog gap review sections"
);
assert.ok(
  evidenceSummarySource.indexOf('"Core physical exam maneuvers"') < evidenceSummarySource.indexOf("Rationale, evidence, and catalog review"),
  "UI should show core exam maneuvers before rationale/evidence audit details"
);
assert.ok(
  evidenceSummarySource.includes('renderExamTesterCandidate(entry, index, { rankPrefix: "S" })'),
  "UI should render suppressed items with the full evidence candidate card, not a bare label/reason row"
);
[
  'appendExamTesterText(row, "LR interpretation", formatLikelihoodRatioNote(question))',
  'appendExamTesterText(row, "LR interpretation", formatLikelihoodRatioNote(metadata))',
  'appendExamTesterText(row, "LR interpretation", formatLikelihoodRatioNote(recommendation, candidate))'
].forEach((requiredSnippet) => {
  assert.ok(
    uiSource.includes(requiredSnippet),
    `UI workup cards should render LR interpretation notes: ${requiredSnippet}`
  );
});

const complaintRenderStart = uiSource.indexOf("function renderComplaintCdsResult");
const complaintRenderEnd = uiSource.indexOf("function runComplaintCds");
assert.ok(complaintRenderStart > 0 && complaintRenderEnd > complaintRenderStart, "UI source should include complaint CDS result renderer");
const complaintRenderSource = uiSource.slice(complaintRenderStart, complaintRenderEnd);
const examTesterResultsStart = uiSource.indexOf("function renderExamTesterResults");
const examTesterResultsEnd = uiSource.indexOf("async function buildExamTesterWorkup", examTesterResultsStart);
assert.ok(
  examTesterResultsStart > 0 && examTesterResultsEnd > examTesterResultsStart,
  "UI source should include reviewer/tester workup renderer"
);
const examTesterResultsSource = uiSource.slice(examTesterResultsStart, examTesterResultsEnd);
assert.ok(
  examTesterResultsSource.includes("recommendation?.managementChangingFindings")
    && examTesterResultsSource.includes("recommendation?.limitationsAndInterpretationCautions")
    && examTesterResultsSource.includes("recommendation?.evidenceAndLikelihoodMetadata")
    && examTesterResultsSource.includes("recommendation?.catalogGapsNeedingReview"),
  "Reviewer/tester renderer should load every section in the structured recommendation contract"
);
assert.ok(
  examTesterResultsSource.includes("managementFindings.length")
    && examTesterResultsSource.includes("interpretationCautions.length")
    && examTesterResultsSource.includes("evidenceMetadata.length")
    && examTesterResultsSource.includes("catalogGapReviews.length")
    && examTesterResultsSource.includes("visibleWorkupGaps.length")
    && examTesterResultsSource.includes("auditOnlyCatalogGaps.length")
    && examTesterResultsSource.includes("copyExamTesterButton.disabled"),
  "Reviewer/tester renderer should count management, limitations, evidence, and gap sections for visibility and copy enablement"
);
assert.ok(
  examTesterResultsSource.includes("workup gap")
    && examTesterResultsSource.includes("reviewer-only catalog item"),
  "Reviewer/tester summary should not collapse reviewer-only catalog metadata into clinical workup-gap counts"
);
const examTesterCandidateRendererStart = uiSource.indexOf("function renderExamTesterCandidate");
const examTesterCandidateRendererEnd = uiSource.indexOf("function renderExamTesterGapRow", examTesterCandidateRendererStart);
assert.ok(
  examTesterCandidateRendererStart > 0 && examTesterCandidateRendererEnd > examTesterCandidateRendererStart,
  "UI source should include the candidate row renderer"
);
const examTesterCandidateRendererSource = uiSource.slice(examTesterCandidateRendererStart, examTesterCandidateRendererEnd);
assert.ok(
  examTesterCandidateRendererSource.includes("appendReviewerOnlyDetails(row, \"Reviewer audit details\"")
    && examTesterCandidateRendererSource.includes("\"Fit/score/routes\"")
    && examTesterCandidateRendererSource.includes("\"Matched tags\"")
    && examTesterCandidateRendererSource.includes("\"Citation\"")
    && uiSource.includes("details.dataset.reviewerOnly = \"true\""),
  "Default clinician candidate rows should move fit/score/routes, tags, and citations into collapsed reviewer-only details"
);
assert.ok(
  examTesterCandidateRendererSource.includes('sectionKind === "baseline-data" ? "baseline data, not exam" : ""')
    && examTesterCandidateRendererSource.includes('sectionKind === "baseline-data" ? "Vitals/safety" : (candidate.system || "Exam")')
    && examTesterCandidateRendererSource.includes('row.dataset.sectionKind = sectionKind'),
  "Safety/vitals rows rendered through the shared candidate renderer should be marked as baseline data, not physical exam"
);
const visibleCandidateMetaStart = examTesterCandidateRendererSource.indexOf("const meta = document.createElement(\"div\")");
const visibleCandidateMetaEnd = examTesterCandidateRendererSource.indexOf("row.appendChild(meta);", visibleCandidateMetaStart);
const visibleCandidateMetaSource = examTesterCandidateRendererSource.slice(visibleCandidateMetaStart, visibleCandidateMetaEnd);
assert.ok(
  visibleCandidateMetaStart > 0 && visibleCandidateMetaEnd > visibleCandidateMetaStart,
  "UI source should expose the default visible candidate metadata block"
);
assert.doesNotMatch(
  visibleCandidateMetaSource,
  /contextFitScore|retrievalRoutes|score\s*\$\{|score \${|embedding_score/i,
  "Default visible candidate metadata should not expose ranking/debug fields"
);
assert.ok(
  examTesterResultsSource.includes("Management-changing findings (")
    && examTesterResultsSource.includes("Limitations and interpretation cautions (")
    && examTesterResultsSource.includes("Evidence/LR metadata (")
    && examTesterResultsSource.includes("Catalog gaps needing review (")
    && examTesterResultsSource.includes("renderWorkupManagementFinding")
    && examTesterResultsSource.includes("renderWorkupLimitationCaution")
    && examTesterResultsSource.includes("renderWorkupEvidenceMetadata")
    && examTesterResultsSource.includes("renderWorkupCatalogGapReview"),
  "Reviewer/tester UI should render every supporting evidence section instead of hiding it behind raw retrieval"
);
assert.ok(
  uiSource.includes("function mergeInstalledGuidelineModuleIntoRecommendation"),
  "Unified workup should have an explicit merge layer that promotes installed guideline-module content into the primary recommendation"
);
assert.ok(
  uiSource.includes("function moduleResolvedCompletenessGap")
    && uiSource.includes("function removeModuleResolvedCompletenessGaps")
    && uiSource.includes("function refreshMergedWorkupReadiness")
    && uiSource.includes("traceability?.generated_completeness_gap")
    && uiSource.includes("historyCount: moduleHistory.length")
    && uiSource.includes("testCount: moduleTests.length")
    && uiSource.includes("redFlagCount: moduleRedFlags.length")
    && uiSource.includes("conditionalExamCount: visibleModuleConditionalExam.length"),
  "Unified module merge should clear generated completeness gaps only after installed module content actually satisfies that section"
);
assert.ok(
  uiSource.includes("function clinicalHistoryQuestionMergeKey")
    && uiSource.includes("recommendation.focusedHistoryQuestions = mergeUniquePreferAdditions(")
    && uiSource.includes("appendUniqueByKey(recommendation.focusedHistoryQuestions, moduleHistory, clinicalHistoryQuestionMergeKey)"),
  "Unified workup merge should dedupe evidence and installed-module history questions by clinical purpose, not exact text"
);
const historySemanticKeyStart = uiSource.indexOf("function clinicalHistoryQuestionSemanticKey");
const historySemanticKeyEnd = uiSource.indexOf("function clinicalHistoryQuestionMergeKey", historySemanticKeyStart);
assert.ok(historySemanticKeyStart > 0 && historySemanticKeyEnd > historySemanticKeyStart, "UI source should include the history semantic dedupe helper");
const historySemanticKeySource = uiSource.slice(historySemanticKeyStart, historySemanticKeyEnd);
[
  "history:infection-urinary-flank-source",
  "history:infection-abdominal-gi-source",
  "history:infection-skin-wound-source",
  "history:infection-cns-meningeal-source",
  "history:infection-heent-dental-source",
  "history:infection-joint-spine-source"
].forEach((semanticKey) => {
  assert.ok(
    historySemanticKeySource.includes(semanticKey),
    `Unified history dedupe should preserve distinct fever source-domain question ${semanticKey}`
  );
});
assert.ok(
  historySemanticKeySource.indexOf("history:infection-source-localization")
    < historySemanticKeySource.indexOf("history:infection-urinary-flank-source"),
  "Unified history dedupe should classify true multi-domain fever source-localization questions before specific source-domain questions"
);
assert.ok(
  historySemanticKeySource.includes("infectionSourceDomainCount >= 3"),
  "Unified history dedupe should reserve the broad fever source-localization key for multi-domain source screening"
);
assert.ok(
  !historySemanticKeySource.includes("\\b(?:localize|localizing|source|most plausible)\\b"),
  "Unified history dedupe should not collapse every question containing the word source into one broad fever bucket"
);
assert.ok(
  !historySemanticKeySource.includes("abdominal_pain_cramping|abdominal pain|acute abdomen"),
  "Unified history dedupe should not classify endocrine/adrenal crisis questions as abdominal-pain workups merely because they mention abdominal pain"
);
assert.ok(
  historySemanticKeySource.indexOf("history:sepsis-shock-perfusion")
    < historySemanticKeySource.indexOf("history:infection-cns-meningeal-source"),
  "Unified history dedupe should classify sepsis severity/perfusion prompts before CNS-source prompts so confusion/oliguria do not hide severity history"
);
assert.ok(
  historySemanticKeySource.indexOf("history:infection-host-exposure")
    < historySemanticKeySource.indexOf("history:infection-skin-wound-source"),
  "Unified history dedupe should classify host/exposure prompts before skin/line-source prompts so line/device history does not hide source inspection history"
);
assert.ok(
  uiSource.includes("function emptyValidatedModuleWorkupFallback")
    && uiSource.includes("moduleOnlyFallback: true")
    && uiSource.includes("Evidence retrieval was unavailable; using the selected validated guideline module as the primary bedside workup."),
  "Validated installed modules should have a normalized primary-workup fallback when evidence catalog retrieval is unavailable"
);
assert.ok(
  uiSource.includes("function complaintCdsScopeForValidatedIntents")
    && uiSource.includes("modules: scopedModule ? effectiveComplaintModules() : []"),
  "Complaint-CDS module selection should be scoped to the selected validated intent instead of free-searching installed modules"
);
const unifiedBuildStart = uiSource.indexOf('async function buildUnifiedClinicalWorkup');
const unifiedBuildEnd = uiSource.indexOf('async function runExamTester', unifiedBuildStart);
assert.ok(unifiedBuildStart > 0 && unifiedBuildEnd > unifiedBuildStart, "UI source should include unified clinical workup builder");
const unifiedBuildSource = uiSource.slice(unifiedBuildStart, unifiedBuildEnd);
assert.ok(
  unifiedBuildSource.includes("const complaintModuleScope = complaintCdsScopeForValidatedIntents(selectedIntents, knowledgeModule)")
    && unifiedBuildSource.includes("module: complaintModuleScope.module")
    && unifiedBuildSource.includes("modules: complaintModuleScope.modules"),
  "Unified workup should evaluate complaint-CDS only inside the selected intent's mapped module scope"
);
const localChecklistBuildStart = uiSource.indexOf('async function buildLocalBedsideChecklistText');
const localChecklistBuildEnd = uiSource.indexOf('async function buildAndApplyLocalBedsideChecklist', localChecklistBuildStart);
assert.ok(localChecklistBuildStart > 0 && localChecklistBuildEnd > localChecklistBuildStart, "UI source should include local bedside checklist builder");
const localChecklistBuildSource = uiSource.slice(localChecklistBuildStart, localChecklistBuildEnd);
assert.ok(
  localChecklistBuildSource.includes("const contextKnowledgeModule = explicitKnowledgeModule || selectedIntentKnowledgeModule;")
    && localChecklistBuildSource.includes("const complaintModuleScope = complaintCdsScopeForValidatedIntents(initialSelectedIntents, contextKnowledgeModule)")
    && localChecklistBuildSource.includes("modules: complaintModuleScope.modules"),
  "Local checklist generation should not attach an arbitrary installed module to a module-less validated intent"
);
assert.doesNotMatch(
  localChecklistBuildSource,
  /selectedIntentKnowledgeModule\s*\|\|\s*selectComplaintModule\(contextText/,
  "Local checklist generation should not fall back to free-text module matching once a validated intent is selected"
);
assert.ok(
  uiSource.includes("moduleQuestionAsWorkupQuestion")
    && uiSource.includes("moduleItemAsRecommendationEntry")
    && uiSource.includes("moduleItemAsEvidenceMetadata"),
  "Installed module history, exam/test/red-flag items, and evidence rows should be normalized into recommendation-shaped primary output"
);
assert.ok(
  uiSource.includes("function canonicalMergedSafetyLabel")
    && uiSource.includes("function safetyWorkupItemKey")
    && uiSource.includes("function canonicalMergedExamLabel")
    && uiSource.includes("function examWorkupItemKey")
    && uiSource.includes("function coreExamCoveredBySafety")
    && uiSource.includes("function examClinicalCoverageKey")
    && uiSource.includes("function filterClinicallyRedundantExamItems")
    && uiSource.includes("function mergeUniquePreferAdditions"),
  "Unified workup merge should canonicalize duplicate safety and exam labels and filter redundant clinical coverage before rendering module-backed recommendations"
);
assert.ok(
  uiSource.includes("mergeUniquePreferAdditions(\n        recommendation.basicSafetyChecks,\n        moduleSafety,\n        safetyWorkupItemKey\n      )"),
  "Installed guideline-module safety checks should replace generic duplicated safety-floor rows"
);
assert.ok(
  uiSource.includes("mergeUniquePreferAdditions(\n        recommendation.corePhysicalExamManeuvers,\n        visibleModuleCoreExam,\n        examWorkupItemKey\n      )"),
  "Installed guideline-module physical exam maneuvers should replace synonymous synthetic bundle rows through the filtered visible module core list"
);
assert.ok(
  uiSource.includes("visibleModuleCoreExam = moduleCoreExam.filter((entry) => !coreExamCoveredBySafety(entry, mergedSafetyKeys))")
    && uiSource.includes(".filter((entry) => !coreExamCoveredBySafety(entry, mergedSafetyKeys));"),
  "Safety-like items such as mental status should not remain duplicated in physical exam sections after module merge"
);
assert.ok(
  uiSource.includes('"mental status"')
    && uiSource.includes("examKeysCoveredBySafety")
    && uiSource.includes("safetyKeys.has(key)"),
  "Mental status should be treated as basic safety data when a selected module already has it in the safety section"
);
assert.ok(
  uiSource.includes("oral mucosal hyperpigmentation")
    && uiSource.includes("mucous membranes")
    && uiSource.includes("oropharynx"),
  "Oral/mouth exam canonicalization should distinguish adrenal hyperpigmentation, dehydration mucosa, and HEENT source exam targets"
);
assert.ok(
  uiSource.includes("coreRedundancy = filterClinicallyRedundantExamItems")
    && uiSource.includes("conditionalRedundancy = filterClinicallyRedundantExamItems")
    && uiSource.includes("moduleCoverageDominatingKey")
    && uiSource.includes("Covered by the selected validated workup item"),
  "Validated module-backed workups should demote clinically redundant catalog overlap into the suppressed audit rather than showing it as recommended exam"
);
assert.ok(
  uiSource.includes("function isPhysicalExamRecommendationEntry")
    && uiSource.includes("safety_check|diagnostic_test|reference_threshold|red_flag|history_question|management_change|diagnostic_frame|catalog_gap")
    && uiSource.includes("existingCoreExamItems = (recommendation.coreItems || []).filter(isPhysicalExamRecommendationEntry)")
    && uiSource.includes("recommendation.coreItems = mergeUniquePreferAdditions(existingCoreExamItems, visibleModuleCoreExam, mergedRecommendationEntryKey)"),
  "Legacy coreItems aliases should be filtered to physical exam maneuvers instead of carrying safety, tests, red flags, or history rows"
);
assert.doesNotMatch(
  uiSource,
  /appendUniqueByKey\(recommendation\.coreItems,\s*\[\.\.\.visibleModuleCoreExam,\s*\.\.\.moduleTests,\s*\.\.\.moduleRedFlags,\s*\.\.\.moduleSafety\]/,
  "Module merge should not place diagnostic tests, red flags, or safety checks into the legacy coreItems exam alias"
);
assert.ok(
  uiSource.includes("const recommendation = state.examTesterRecommendation || state.unifiedClinicalWorkup?.examWorkup?.recommendation || null;")
    && uiSource.includes("recommendation.basicSafetyChecks")
    && uiSource.includes("recommendation.focusedHistoryQuestions")
    && uiSource.includes("recommendation.corePhysicalExamManeuvers")
    && uiSource.includes("recommendation.initialTestsAndReferenceThresholds")
    && uiSource.includes("recommendation.redFlagsAndEscalationCues")
    && uiSource.includes(": (state.retrievedEvidenceCandidates || []).map((entry) => ({ entry, kind: \"retrieved audit candidate\" }))"),
  "OpenEvidence review summaries should prefer the structured local recommendation sections before falling back to raw retrieved audit candidates"
);
assert.ok(
  uiSource.indexOf("mergeInstalledGuidelineModuleIntoRecommendation(examWorkup, complaintResult, selectedIntents);") < uiSource.indexOf("applyExamTesterWorkup(examWorkup, evidenceContext);"),
  "Installed guideline-module content should be merged before rendering/applying the unified evidence workup"
);
assert.ok(
  uiSource.includes("canUseValidatedModuleFallback = selectedIntents.length")
    && uiSource.includes("examWorkup = emptyValidatedModuleWorkupFallback")
    && uiSource.includes("mergeInstalledGuidelineModuleIntoRecommendation(examWorkup, complaintResult, selectedIntents);")
    && uiSource.includes("applyExamTesterWorkup(examWorkup, evidenceContext);"),
  "Evidence retrieval failures should still render selected validated guideline-module recommendations through the primary workup path"
);
assert.ok(
  complaintRenderSource.indexOf("renderUnifiedEvidenceSummary(elements.complaintCdsResults);") < complaintRenderSource.indexOf('"Installed guideline module detail"'),
  "Unified workup UI should show the curated evidence-backed recommendation before installed guideline module detail"
);
assert.ok(
  complaintRenderSource.includes('"Installed guideline module detail"'),
  "Unified workup UI should label the module output as supporting guideline detail below the curated recommendation"
);
assert.ok(
  complaintRenderSource.includes("Curated bedside workup below")
    && complaintRenderSource.includes("Installed guideline module collapsed for review"),
  "Unified workup summary should make the curated recommendation primary and push module detail into review"
);
assert.doesNotMatch(
  complaintRenderSource,
  /raw module exam rows|raw conditional module rows/i,
  "Unified workup summary should not expose raw module row counts as recommendations"
);
assert.ok(
  complaintRenderSource.includes('moduleDetailParent = hasWorkupEvidence')
    && complaintRenderSource.includes('document.createElement("details")')
    && complaintRenderSource.includes('moduleDetailParent.className = "review-details"'),
  "Unified workup UI should collapse installed guideline module detail when curated evidence-backed recommendations exist"
);
assert.ok(
  complaintRenderSource.includes("Supporting source-backed module output for audit and review"),
  "Collapsed module detail should explain that it is supporting audit material, not the primary bedside recommendation"
);
assert.ok(
  complaintRenderSource.includes('renderComplaintCdsSection(moduleDetailParent, "Basic bedside data / safety checks"'),
  "Installed module sections should render inside the collapsed supporting-detail container"
);
assert.doesNotMatch(
  uiSource,
  /\.clinical-modifier-chip\[data-clinical-modifier="(?:currently pregnant|not pregnant|postpartum|male reproductive context|ovarian uterine pregnancy-capable context|pediatric age|older adult frailty)"\][^{]*\{[^}]*(?:display:\s*none|visibility:\s*hidden|width:\s*0|height:\s*0)/i,
  "Clinical applicability context chips should never be hidden or zero-sized by pre-build or built-workup CSS"
);
const builtDesktopLayoutStart = uiSource.indexOf('#complaintCdsPanel[open][data-workup-built="true"] > .complaint-cds-body');
const builtDesktopLayoutEnd = uiSource.indexOf(".finding-compound-control", builtDesktopLayoutStart);
assert.ok(
  builtDesktopLayoutStart > 0 && builtDesktopLayoutEnd > builtDesktopLayoutStart,
  "Desktop built-workup layout should have an explicit source-audited CSS block"
);
const builtDesktopLayoutSource = uiSource.slice(builtDesktopLayoutStart, builtDesktopLayoutEnd);
assert.ok(
  builtDesktopLayoutSource.includes('"context controls"')
    && builtDesktopLayoutSource.includes('"results results"')
    && builtDesktopLayoutSource.includes("max-height: min(62vh, 580px)")
    && builtDesktopLayoutSource.includes(".clinical-workup-compact-board"),
  "Desktop built clinical workups should promote the result to a full-width readable row while keeping context compact"
);
const compactBoardStart = uiSource.indexOf("function clinicalWorkupCompactThresholdPriority");
const compactBoardEnd = uiSource.indexOf("function renderComplaintCdsResult", compactBoardStart);
assert.ok(compactBoardStart > 0 && compactBoardEnd > compactBoardStart, "UI source should include compact clinical workup board renderer");
const compactBoardSource = uiSource.slice(compactBoardStart, compactBoardEnd);
assert.ok(
  compactBoardSource.includes("renderClinicalWorkupCompactThresholdStrip(result, recommendation)")
    && compactBoardSource.includes("Top thresholds that change management")
    && compactBoardSource.includes("clinicalWorkupCompactThresholdPriority")
    && compactBoardSource.includes("initialTestsAndReferenceThresholds")
    && compactBoardSource.includes("managementImplication")
    && compactBoardSource.includes("displayManagement"),
  "Compact board should surface top actionable test/reference thresholds and their management consequences without opening reviewer detail"
);
assert.ok(
  uiSource.includes(".clinical-workup-threshold-strip")
    && uiSource.includes(".clinical-workup-threshold-list")
    && uiSource.includes("grid-template-columns: repeat(3, minmax(0, 1fr))")
    && uiSource.includes("-webkit-line-clamp: 2"),
  "Compact board threshold strip should have bounded desktop styling so long thresholds do not crowd the workup board"
);
assert.ok(
  complaintRenderSource.includes("elements.copyComplaintCdsButton.disabled = !hasSelectedIntent"),
  "Copying the unified workup should require a selected validated clinical intent"
);
assert.doesNotMatch(
  complaintRenderSource,
  /copyComplaintCdsButton\.disabled[\s\S]{0,180}hasKnowledgeModule/,
  "Installed guideline-module matches should not bypass the validated-intent copy gate"
);

const complaintCopyListenerStart = uiSource.indexOf('elements.copyComplaintCdsButton.addEventListener("click"');
const complaintCopyListenerEnd = uiSource.indexOf('elements.copyClinicalImprovementAuditButton.addEventListener("click"', complaintCopyListenerStart);
assert.ok(
  complaintCopyListenerStart > 0 && complaintCopyListenerEnd > complaintCopyListenerStart,
  "UI source should include the unified workup copy listener"
);
const complaintCopyListenerSource = uiSource.slice(complaintCopyListenerStart, complaintCopyListenerEnd);
assert.ok(
  complaintCopyListenerSource.includes("if (!selectedClinicalIntents().length)"),
  "Copy listener should defend against stale enabled buttons without a selected validated intent"
);
assert.ok(
  complaintCopyListenerSource.includes("Select a validated clinical intent before copying a workup"),
  "Copy listener should explain that unsupported concerns cannot be copied as recommendations"
);

const examCopyListenerStart = uiSource.indexOf('elements.copyExamTesterButton.addEventListener("click"');
const examCopyListenerEnd = uiSource.indexOf('elements.copyExamImprovementAuditButton.addEventListener("click"', examCopyListenerStart);
assert.ok(
  examCopyListenerStart > 0 && examCopyListenerEnd > examCopyListenerStart,
  "UI source should include the reviewer-side workup copy listener"
);
const examCopyListenerSource = uiSource.slice(examCopyListenerStart, examCopyListenerEnd);
assert.ok(
  examCopyListenerSource.includes("if (!selectedClinicalIntents().length)")
    && examCopyListenerSource.includes("Reviewer audit matches cannot be copied as recommendations"),
  "Reviewer-side copied workups should also require a selected validated intent"
);
const complaintAuditCopyListenerStart = uiSource.indexOf('elements.copyClinicalImprovementAuditButton.addEventListener("click"');
const complaintAuditCopyListenerEnd = uiSource.indexOf('elements.clearComplaintCdsButton.addEventListener("click"', complaintAuditCopyListenerStart);
assert.ok(
  complaintAuditCopyListenerStart > 0 && complaintAuditCopyListenerEnd > complaintAuditCopyListenerStart,
  "UI source should include the clinical improvement audit copy listener"
);
const complaintAuditCopyListenerSource = uiSource.slice(complaintAuditCopyListenerStart, complaintAuditCopyListenerEnd);
assert.ok(
  complaintAuditCopyListenerSource.includes("sanitizeClinicalAuditReport(formatClinicalImprovementAuditReport())"),
  "Clinical improvement audit copying should apply a full-report PHI sanitizer before clipboard export"
);
assert.ok(
  complaintAuditCopyListenerSource.includes("stagedUnsupportedClinicalIntentGapCount()")
    && complaintAuditCopyListenerSource.includes("Log a de-identified unsupported concern"),
  "Clinical improvement audit copying should allow staged unsupported-gap review artifacts while guarding empty audit copies"
);
assert.ok(
  uiSource.includes("function updateClinicalImprovementAuditButtonState")
    && uiSource.includes("stagedUnsupportedClinicalIntentGapCount()"),
  "Clinical workup UI should enable Copy review audit for staged unsupported gaps without enabling recommendation copy"
);
const examAuditCopyListenerStart = uiSource.indexOf('elements.copyExamImprovementAuditButton.addEventListener("click"');
const examAuditCopyListenerEnd = uiSource.indexOf('elements.clearExamTesterButton.addEventListener("click"', examAuditCopyListenerStart);
assert.ok(
  examAuditCopyListenerStart > 0 && examAuditCopyListenerEnd > examAuditCopyListenerStart,
  "UI source should include the reviewer-side improvement audit copy listener"
);
assert.ok(
  uiSource.slice(examAuditCopyListenerStart, examAuditCopyListenerEnd).includes("sanitizeClinicalAuditReport(formatClinicalImprovementAuditReport())"),
  "Reviewer-side improvement audit copying should apply the full-report PHI sanitizer before clipboard export"
);

const guardedUnifiedReportStart = uiSource.indexOf("function formatUnifiedClinicalWorkupReport");
const guardedUnifiedReportEnd = uiSource.indexOf("function sanitizeClinicalAuditText", guardedUnifiedReportStart);
assert.ok(guardedUnifiedReportStart > 0 && guardedUnifiedReportEnd > guardedUnifiedReportStart, "UI source should include unified workup report formatter");
const guardedUnifiedReportSource = uiSource.slice(guardedUnifiedReportStart, guardedUnifiedReportEnd);
assert.ok(
  workupReportSource.includes("Unsupported Clinical Workup Gap")
    && workupReportSource.includes("Status: blocked - no validated clinical intent selected.")
    && workupReportSource.includes("Free text and retrieval/audit matches do not authorize bedside workup recommendations."),
  "Unified report formatter should be safe even if invoked without a validated clinical intent"
);
assert.ok(
  workupReportSource.includes("Reviewer audit: use Copy review audit for raw retrieval candidates"),
  "Unified copied workup should explicitly separate concise validated recommendations from reviewer-only raw retrieval/audit detail"
);
assert.ok(
  guardedUnifiedReportSource.includes("formatConciseClinicalWorkupReport({"),
  "Unified copied workup should use the shared concise validated bedside workup formatter"
);
assert.ok(
  !guardedUnifiedReportSource.includes("validatedIntentPromptBlock")
    && !guardedUnifiedReportSource.includes("formatComplaintCdsReport(state.complaintCdsResult).trim()"),
  "Unified copied workup should not include OpenEvidence prompt blocks or full guideline module dumps"
);

const auditSanitizerStart = uiSource.indexOf("function sanitizeClinicalAuditReport");
const auditSanitizerEnd = uiSource.indexOf("function activeClinicalModifierChips", auditSanitizerStart);
assert.ok(auditSanitizerStart > 0 && auditSanitizerEnd > auditSanitizerStart, "UI source should include full clinical audit report sanitizer");
const auditSanitizerSource = uiSource.slice(auditSanitizerStart, auditSanitizerEnd);
[
  "[email]",
  "[phone]",
  "[identifier]",
  "[date]",
  "[name]",
  "[location]"
].forEach((placeholder) => {
  assert.ok(auditSanitizerSource.includes(placeholder), `Audit report sanitizer should redact ${placeholder}`);
});
assert.ok(
  !auditSanitizerSource.includes("\\b\\d{4}-\\d{2}-\\d{2}\\b"),
  "Full audit report sanitizer should preserve source/review ISO dates while still redacting DOB-style dates"
);

const improvementAuditStart = uiSource.indexOf("function formatClinicalImprovementAuditReport");
const improvementAuditEnd = uiSource.indexOf("function clearExamTester", improvementAuditStart);
assert.ok(improvementAuditStart > 0 && improvementAuditEnd > improvementAuditStart, "UI source should include clinical improvement audit formatter");
const improvementAuditSource = uiSource.slice(improvementAuditStart, improvementAuditEnd);
[
  "const stagedIntentGaps = state.stagedClinicalIntentGaps || []",
  "intent_type:",
  "complaint_module_id:",
  "gold_case_ids:",
  "review_owner:",
  "last_reviewed:",
  "## Unsupported Clinical Intent Gaps",
  "gap_status:",
  "gap_type:",
  "activation_rule:"
].forEach((requiredText) => {
  assert.ok(
    improvementAuditSource.includes(requiredText),
    `Clinical improvement audit should expose selected intent audit metadata: ${requiredText}`
  );
});

const formatReportStart = uiSource.indexOf("function formatExamTesterReport");
const formatReportEnd = uiSource.indexOf("function formatUnifiedClinicalWorkupReport");
assert.ok(formatReportStart > 0 && formatReportEnd > formatReportStart, "UI source should include exam tester copied report formatter");
const formatReportSource = uiSource.slice(formatReportStart, formatReportEnd);
[
  "Recommendation authorization:",
  "Final recommendation authorized:",
  "Authorization reason:",
  "Recommendation warnings:",
  "Focused history questions",
  "Detail prompts",
  "Core physical exam maneuvers",
  "Suppressed/not-recommended items",
  "Why not recommended",
  "Authorized by",
  "Diagnostic target",
  "Management change",
  "Fit/score/routes",
  "Feasibility",
  "Use when",
  "Limitations",
  "Tags",
  "Citation"
].forEach((requiredText) => {
  assert.ok(
    formatReportSource.includes(requiredText),
    `Copied workup report should include ${requiredText} for suppressed/not-recommended items`
  );
});
[
  "LR interpretation",
  "formatLikelihoodRatioNote(entry, candidate)",
  "formatLikelihoodRatioNote(question)",
  "formatLikelihoodRatioNote(finding)",
  "formatLikelihoodRatioNote(caution)",
  "formatLikelihoodRatioNote(metadata)"
].forEach((requiredText) => {
  assert.ok(
    formatReportSource.includes(requiredText),
    `Copied workup report should include LR interpretation notes: ${requiredText}`
  );
});
const promotedExamFormatterStart = formatReportSource.indexOf("const appendRecommendationEntry");
const promotedExamFormatterEnd = formatReportSource.indexOf("if (historyQuestions.length)", promotedExamFormatterStart);
assert.ok(
  promotedExamFormatterStart > 0 && promotedExamFormatterEnd > promotedExamFormatterStart,
  "Copied workup report should include the promoted exam row formatter"
);
const promotedExamFormatterSource = formatReportSource.slice(promotedExamFormatterStart, promotedExamFormatterEnd);
[
  "Technique:",
  "Use when:",
  "Limitations:",
  "Tags:",
  "Citation:",
  "entry.options || entry.findings_options"
].forEach((requiredText) => {
  assert.ok(
    promotedExamFormatterSource.includes(requiredText),
    `Promoted core/conditional exam rows should preserve ${requiredText}`
  );
});
assert.ok(
  formatReportSource.indexOf('"Baseline vitals / safety data"') < formatReportSource.indexOf('"Focused history questions"'),
  "Copied workup report should put baseline vitals/safety data before focused history"
);
assert.ok(
  formatReportSource.indexOf('"Baseline vitals / safety data"') < formatReportSource.indexOf('"Core physical exam maneuvers"'),
  "Copied workup report should put baseline vitals/safety data before physical exam maneuvers"
);

const conciseReportSource = workupReportSource;
[
  "Baseline vitals / safety data",
  "Vitals and basic measurements are baseline clinical data; they are not physical exam maneuvers.",
  "Focused history questions",
  "Core physical exam maneuvers",
  "Conditional exam add-ons",
  "Management-changing findings",
  "Limitations and interpretation cautions",
  "Compact audit footer",
  "Trace IDs:",
  "Source IDs:",
  "Reviewer-only omitted:",
  "Raw retrieval candidates, score/debug detail, and supporting module dumps are available only in Copy review audit"
].forEach((requiredText) => {
  assert.ok(
    conciseReportSource.includes(requiredText),
    `Shared concise copied workup formatter should preserve required section or separation text: ${requiredText}`
  );
});
assert.ok(
  conciseReportSource.includes("appendEvidenceLine")
    && conciseReportSource.includes("candidateFeasibility")
    && conciseReportSource.includes("appendCompactAuditFooter")
    && conciseReportSource.includes("sourceIdsForEntry")
    && conciseReportSource.includes("intentTraceLabelForEntry"),
  "Shared concise copied workup should preserve evidence/LR and feasibility while moving trace/source IDs into a compact audit footer"
);
assert.doesNotMatch(
  conciseReportSource,
  /state\.examTesterCandidates|Top Retrieved Evidence Candidates|retrievedCandidates|Fit\/score\/routes|Trace route:/i,
  "Concise copied workup should not expose raw retrieved candidates or retrieval score/debug fields"
);

const unifiedReportStart = uiSource.indexOf("function formatUnifiedClinicalWorkupReport");
const unifiedReportEnd = uiSource.indexOf("function sanitizeClinicalAuditText");
assert.ok(unifiedReportStart > 0 && unifiedReportEnd > unifiedReportStart, "UI source should include unified copied workup formatter");
const unifiedReportSource = uiSource.slice(unifiedReportStart, unifiedReportEnd);
assert.ok(
  unifiedReportSource.includes("formatConciseClinicalWorkupReport({")
    && !unifiedReportSource.includes("formatComplaintCdsReport(state.complaintCdsResult).trim()"),
  "Copied unified workup should copy concise validated recommendations while keeping full guideline-module detail in the review audit"
);

console.log(`Clinical workup quality tests passed for ${qualityCases.length} tiered recommendation cases, ${historyQualityCases.length} history-source cases, and ${remediatedFocusedHistoryCases.length} remediated focused-history cases.`);
