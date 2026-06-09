import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  buildRecommendedExamChecklist,
  historyQuestionDetailPrompts,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  normalizeEvidenceLabel,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";
import {
  buildClinicalIntentRetrievalContext,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  normalizeClinicalIntentText,
  resolveClinicalIntents,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";
import {
  complaintModules,
  complaintSourceRegistry,
  evaluateComplaintCds,
  isBasicBedsideDataItem
} from "../complaint-cds.js";

const defaultPaths = {
  base: "data/evidence/exam_technique_base.csv",
  overlay: "data/evidence/exam_evidence_overlay.csv",
  legacyOverlay: "data/physical-exam/physical_exam_evidence_overlay.csv",
  acceptedCatalogAdditions: "data/evidence/accepted_exam_catalog_additions.csv",
  tags: "data/evidence/retrieval_tag_dictionary.csv",
  sources: "data/evidence/source_registry.csv",
  gaps: "data/evidence/catalog_gap_registry.csv"
};

const stopWords = new Set([
  "and",
  "or",
  "the",
  "when",
  "with",
  "without",
  "for",
  "exam",
  "exams",
  "sign",
  "signs",
  "add",
  "addon",
  "indicated",
  "possible",
  "focused",
  "required"
]);

const domainSynonyms = [
  { match: /\bvitals?\b|hemodynamic/, pattern: /\b(?:blood pressure|heart rate|respiratory rate|temperature|vital)\b/ },
  { match: /respiratory pattern|work of breathing|lungs?/, pattern: /\b(?:respiratory rate|kussmaul|thorax|work of breathing|lung sounds|wheez|crackle|diminished)\b/ },
  { match: /volume|perfusion|jvp|edema/, pattern: /\b(?:jvp|edema|pulses?|mouth exam|mucous|blood pressure|heart rate|capillary|perfusion)\b/ },
  { match: /mental status|mentation/, pattern: /\b(?:mental status|confusion|obtund|alert|oriented|pupils?)\b/ },
  { match: /abdomen|abdominal|bowel|peritoneal/, pattern: /\b(?:abdominal|bowel|murphy|rebound|guarding|psoas|obturator|liver|spleen)\b/ },
  { match: /cva|flank|renal|gu/, pattern: /\b(?:cva tenderness|flank|costovertebral|renal|urinary|dysuria|hematuria)\b/ },
  { match: /genital|sti|urethral/, pattern: /\b(?:genital|sti|urethral|discharge|ulcer|lesion|inguinal|partner|gonorrhea|chlamydia)\b/ },
  { match: /scrotal|testicular|acute scrotum|torsion/, pattern: /\b(?:scrotal|testicular|testis|torsion|cremasteric|high riding|epididymis|urology)\b/ },
  { match: /pregnancy|pid|ectopic|gynecologic|pelvic/, pattern: /\b(?:pregnancy|pid|ectopic|gynecologic|pelvic|speculum|bimanual|discharge|heavy bleeding)\b/ },
  { match: /glucose|neuroglycopen|hypoglycemia/, pattern: /\b(?:glucose|hypoglycemia|neuroglycopen|mental status|confusion|somnolent|seiz)\b/ },
  { match: /dvt|leg|vascular/, pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial|femoral|calf|leg swelling)\b/ },
  { match: /skin|rash|wound/, pattern: /\b(?:skin|rash|ulcer|wound|mucosa|hives|urticaria)\b/ },
  { match: /mucosa|mucosal|conjunctiva|heent|ear|nose|throat/, pattern: /\b(?:mouth exam|oropharynx|sclerae|conjunctivae|otoscope|ear|nasal|nodes?)\b/ },
  { match: /foot|neuropathy|protective sensation/, pattern: /\b(?:foot|dorsalis pedis|posterior tibial|vibration|light touch|monofilament|proprioception)\b/ },
  { match: /cranial|vision|facial/, pattern: /\b(?:pupils?|extraocular|visual|facial|eye closure|fields)\b/ },
  { match: /motor|sensory|localization|weakness/, pattern: /\b(?:pronator|strength|deltoid|hip|knee|ankle|finger abduction|light touch|pinprick)\b/ },
  { match: /coordination|gait|ataxia/, pattern: /\b(?:gait|romberg|finger to nose|heel to shin|rapid alternating|tandem)\b/ },
  { match: /thyroid/, pattern: /\bthyroid\b/ },
  { match: /joint|musculoskeletal|site specific|range of motion|rom/, pattern: /\b(?:shoulder|knee|ankle|hand|joint|range of motion|palpate|inspect)\b/ }
];

function readCsv(path) {
  return parseCsv(readFileSync(path, "utf8"));
}

export function loadCatalog(paths = defaultPaths) {
  const baseRows = readCsv(paths.base);
  const overlayRows = readCsv(paths.overlay);
  const legacyOverlayRows = readCsv(paths.legacyOverlay);
  const acceptedCatalogAdditionRows = readCsv(paths.acceptedCatalogAdditions);
  const tagRows = readCsv(paths.tags);
  const sourceRows = readCsv(paths.sources);
  const gapRows = readCsv(paths.gaps);
  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    tagRows,
    sourceRows,
    gapRows,
    acceptedCatalogAdditionRows,
    catalog: joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows, acceptedCatalogAdditionRows)
  };
}

const complaintModuleById = new Map(complaintModules.map((module) => [module.id, module]));

function parseArgs(argv) {
  const args = {
    diagnosis: "",
    intentIds: [],
    allMatches: false,
    modifiers: "",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 80,
    maxCoreItems: 24,
    maxConditionalItems: 36,
    limit: 0,
    out: "",
    json: "",
    latestOut: "",
    latestJson: "",
    iterations: 1,
    watchMs: 0
  };
  argv.forEach((arg) => {
    const [rawKey, ...rawValue] = arg.replace(/^--/, "").split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim();
    if (key === "diagnosis" || key === "query") args.diagnosis = value;
    if (key === "intent") args.intentIds.push(value);
    if (key === "all-matches") args.allMatches = true;
    if (key === "modifiers") args.modifiers = value;
    if (key === "setting") args.setting = value;
    if (key === "population") args.population = value;
    if (key === "max-candidates") args.maxCandidates = Number.parseInt(value, 10) || args.maxCandidates;
    if (key === "max-core") args.maxCoreItems = Number.parseInt(value, 10) || args.maxCoreItems;
    if (key === "max-conditional") args.maxConditionalItems = Number.parseInt(value, 10) || args.maxConditionalItems;
    if (key === "limit") args.limit = Number.parseInt(value, 10) || 0;
    if (key === "out") args.out = value;
    if (key === "json") args.json = value;
    if (key === "latest-out") args.latestOut = value;
    if (key === "latest-json") args.latestJson = value;
    if (key === "iterations") args.iterations = Math.max(1, Number.parseInt(value, 10) || 1);
    if (key === "watch-ms") args.watchMs = Math.max(0, Number.parseInt(value, 10) || 0);
  });
  return args;
}

function selectedIntentsForArgs(args) {
  if (args.intentIds.length) {
    return selectedValidatedClinicalIntents(args.intentIds, clinicalIntentRegistry);
  }
  if (args.diagnosis) {
    const resolved = resolveClinicalIntents(args.diagnosis, clinicalIntentRegistry, { limit: args.allMatches ? 8 : 1 });
    return selectedValidatedClinicalIntents(resolved.validatedMatches.map((intentRow) => intentRow.intent_id), clinicalIntentRegistry);
  }
  return clinicalIntentRegistry.filter((intentRow) => intentRow.status === "validated");
}

function entryLabel(entry) {
  const candidate = entry.candidate || entry;
  return entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "";
}

function stripSuppressedReportPrefix(value = "") {
  return String(value || "")
    .replace(/^(?:not\s+recommended|suppressed(?:\/not-recommended)?|suppressed\s+or\s+lower-fit|lower-fit)\s*[-:]\s*/i, "")
    .trim();
}

function suppressedReportLabel(entry = {}) {
  const candidate = entry.candidate || entry;
  const sourceLabel = stripSuppressedReportPrefix(
    entry.original_label
      || entry.sourceLabel
      || entry.label
      || candidate.examLabel
      || candidate.maneuver
      || candidate.exam_id
      || entry.exam_id
      || ""
  ) || "suppressed item";
  return `Not recommended - ${sourceLabel}`;
}

function entryText(entry) {
  const candidate = entry.candidate || entry;
  return normalizeEvidenceLabel([
    entryLabel(entry),
    entry.domain,
    entry.reason,
    entry.action,
    entry.technique,
    entry.displayDiagnosticTarget,
    entry.displayManagement,
    entry.limitations,
    candidate.diagnostic_target,
    candidate.result_changes_management,
    candidate.management_link,
    candidate.maneuver,
    candidate.limitations,
    candidate.retrieval_tags,
    candidate.condition_or_syndrome
  ].filter(Boolean).join(" "));
}

function requiredDomainSatisfied(domain, recommendationText) {
  const normalizedDomain = normalizeClinicalIntentText(domain);
  const synonym = domainSynonyms.find((row) => row.match.test(normalizedDomain));
  if (synonym) {
    return synonym.pattern.test(recommendationText);
  }
  const tokens = normalizedDomain
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token));
  return tokens.length ? tokens.some((token) => recommendationText.includes(token)) : true;
}

function avoidHitLabels(avoidLabels = [], recommendedEntries = []) {
  const recommendationTextByLabel = recommendedEntries.map((entry) => ({
    label: entryLabel(entry),
    text: normalizeEvidenceLabel(entryLabel(entry))
  }));
  return avoidLabels.flatMap((avoidLabel) => {
    const avoid = normalizeEvidenceLabel(avoidLabel);
    if (!avoid) return [];
    return recommendationTextByLabel
      .filter((entry) => entry.text.includes(avoid) || avoid.includes(entry.text))
      .map((entry) => `${avoidLabel} -> ${entry.label}`);
  });
}

function repeatedLabels(entries = []) {
  const seen = new Map();
  entries.forEach((entry) => {
    const key = normalizeEvidenceLabel(entryLabel(entry));
    if (!key) return;
    seen.set(key, [...(seen.get(key) || []), entryLabel(entry)]);
  });
  return Array.from(seen.values()).filter((labels) => labels.length > 1).map((labels) => labels[0]);
}

function clinicallySpecificSuppressionReason(reason = "") {
  const text = normalizeClinicalIntentText(reason);
  if (!text || text === "suppressed") {
    return false;
  }
  if (/selected validated clinical intent did not define|lacks a direct syndrome|lacks direct syndrome/.test(text)) {
    return false;
  }
  return [
    /\bneeds?\b.+\b(?:context|concern|symptoms?|intent|trigger|modifier|features?)\b/,
    /\bnot promoted\b.+\b(?:already|higher yield|selected workup|modeled separately|routine vitals|focused|physical exam candidate|safety check)\b/,
    /\bnot recommended\b.+\b(?:separately|because|unless|until)\b/,
    /\bnot included\b.+\b(?:higher priority|selected items|feasibility|validated intent)\b/,
    /\breplaced by\b.+\b(?:validated|safety|recommended|higher yield)\b/,
    /\blower yield\b.+\b(?:unless|without|add on|context)\b/,
    /\b(?:reserved for|audit metadata|modeled separately|not eye focused|do not need|does not need|site specific)\b/,
    /\bwithout\b.+\b(?:trigger|context|symptoms?|features?)\b/,
    /\brequires?\b.+\b(?:context|concern|symptoms?|trigger|modifier|features?)\b/
  ].some((pattern) => pattern.test(text));
}

function moduleReadinessFromIssues(issues = [], catalogGaps = []) {
  const blockingIssues = issues.filter((issue) => issue.severity !== "review");
  const highIssueCount = blockingIssues.filter((issue) => issue.severity === "high").length;
  const status = highIssueCount
    ? "quality_review_required"
    : (catalogGaps.length ? "staged_gaps_need_review" : "complete_validated");
  return {
    status,
    label: status === "complete_validated"
      ? "Complete validated workup"
      : (status === "quality_review_required" ? "Needs quality review" : "Validated core with staged gaps"),
    completeValidatedWorkup: status === "complete_validated",
    unresolvedCatalogGapCount: catalogGaps.length,
    highQualityIssueCount: highIssueCount,
    reasons: [
      ...(highIssueCount ? [`${highIssueCount} high-severity quality issue(s) need review.`] : []),
      ...(catalogGaps.length ? [`${catalogGaps.length} staged catalog gap(s) need expert review before the workup can be called complete.`] : [])
    ]
  };
}

function conditionalExamAddOnStatusForReport(intentRow = {}, conditional = [], catalogGaps = [], context = "") {
  const traceability = {
    intent_ids: [intentRow.intent_id].filter(Boolean),
    intent_labels: [intentRow.label].filter(Boolean),
    clinical_bundle_ids: intentRow.clinical_bundle_ids || [],
    source_ids: intentRow.source_ids || [],
    authorized_by: intentRow.status === "validated" ? "validated_clinical_intent" : "audit_only_unvalidated_context"
  };
  const count = conditional.length;
  if (count) {
    return {
      status: "active_addons_present",
      label: "Conditional add-ons active",
      count,
      reason: `${count} conditional physical exam add-on${count === 1 ? "" : "s"} activated from active modifiers or source-specific trigger logic.`,
      traceability
    };
  }
  const conditionalGaps = (catalogGaps || []).filter((gap) => {
    const text = normalizeClinicalIntentText([
      gap.label,
      gap.gap_label,
      gap.gapId,
      gap.exam_id,
      gap.role,
      gap.gapType,
      gap.gap_type,
      gap.activation_condition,
      gap.reason,
      gap.management_change
    ].filter(Boolean).join(" "));
    return /\bconditional\b/.test(text) && /\b(?:exam|maneuver|physical)\b/.test(text);
  });
  if (conditionalGaps.length) {
    return {
      status: "staged_gaps_need_review",
      label: "Conditional add-ons need review",
      count: 0,
      gap_count: conditionalGaps.length,
      gap_ids: conditionalGaps.map((gap) => gap.exam_id || gap.gapId || gap.label).filter(Boolean),
      reason: `${conditionalGaps.length} conditional physical exam add-on gap${conditionalGaps.length === 1 ? "" : "s"} need expert review before this section can be treated as complete.`,
      traceability: { ...traceability, authorized_by: "staged_catalog_gap" }
    };
  }
  if (intentRow.status !== "validated") {
    return {
      status: "audit_only_unvalidated_context",
      label: "Validated intent required",
      count: 0,
      reason: "No validated clinical intent authorized conditional add-on recommendations.",
      traceability
    };
  }
  return {
    status: "none_active_for_current_context",
    label: "No conditional add-ons active",
    count: 0,
    reason: context
      ? "No patient modifier, source-specific symptom, or complication trigger activated a reviewed conditional physical exam add-on for this selected validated intent. The core exam remains the validated minimum for the current context."
      : "No patient modifier or source-specific trigger was supplied, so no reviewed conditional physical exam add-on is active. The core exam remains the validated minimum for the selected validated intent.",
    traceability
  };
}

function fallbackReadinessFromRecommendation(recommendation = {}, catalogGaps = [], qualityIssues = []) {
  if (recommendation.workupReadiness) {
    return recommendation.workupReadiness;
  }
  const highQualityIssueCount = (qualityIssues || []).filter((issue) => issue.severity === "high").length;
  const status = highQualityIssueCount
    ? "quality_review_required"
    : (catalogGaps.length ? "staged_gaps_need_review" : "complete_validated");
  return {
    status,
    label: status === "complete_validated"
      ? "Complete validated workup"
      : (status === "quality_review_required" ? "Needs quality review" : "Validated core with staged gaps"),
    completeValidatedWorkup: status === "complete_validated",
    unresolvedCatalogGapCount: catalogGaps.length,
    highQualityIssueCount,
    reasons: [
      ...(highQualityIssueCount ? [`${highQualityIssueCount} high-severity quality issue(s) need review.`] : []),
      ...(catalogGaps.length ? [`${catalogGaps.length} staged catalog gap(s) need expert review before the workup can be called complete.`] : [])
    ]
  };
}

function patientModifierSegment(context = "") {
  const normalized = normalizeClinicalIntentText(context);
  const marker = "patient modifiers";
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length).trim() : "";
}

function conditionalRequiredDomainIsTriggered(domain, context) {
  const normalizedDomain = normalizeClinicalIntentText(domain);
  if (!/\b(?:when|if|relevant|indicated)\b/.test(normalizedDomain)) {
    return true;
  }
  const modifiers = patientModifierSegment(context);
  if (!modifiers) {
    return false;
  }
  if (/mucosal|oral|mouth|ocular|eye/.test(normalizedDomain)) {
    return /\b(?:mucosal|mouth|oral|eye|ocular|throat|angioedema|hives|urticaria|drug eruption|fever|systemic|skin pain|rapid spread)\b/.test(modifiers);
  }
  if (/cardiac|rhythm|perfusion|thyrotoxic/.test(normalizedDomain)) {
    return /\b(?:palpitations|tachycardia|chest pain|dyspnea|syncope|presyncope|arrhythmia|thyrotoxic|hyperthyroid|heat intolerance)\b/.test(modifiers);
  }
  if (/eye|orbitopathy|vision/.test(normalizedDomain)) {
    return /\b(?:eye|vision|visual|diplopia|orbitopathy|proptosis|pain)\b/.test(modifiers);
  }
  if (/node|compressive|structural|neck/.test(normalizedDomain)) {
    return /\b(?:node|lymph|neck mass|nodule|cancer|hoarseness|dysphagia|compressive|radiation|men2)\b/.test(modifiers);
  }
  return true;
}

const moduleCoverageStopWords = new Set([
  "v1",
  "possible",
  "suspected",
  "style",
  "presentation",
  "concern",
  "diagnosis",
  "clinical",
  "intent",
  "workup",
  "evaluation"
]);

function moduleCoverageTokens(value = "") {
  return normalizeClinicalIntentText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !moduleCoverageStopWords.has(token));
}

function intentHasSameTopicComplaintModule(intentRow = {}) {
  if (!intentRow.complaint_module_id) {
    return false;
  }
  const moduleTokens = new Set(moduleCoverageTokens(intentRow.complaint_module_id));
  if (!moduleTokens.size) {
    return false;
  }
  return moduleCoverageTokens(`${intentRow.intent_id || ""} ${intentRow.label || ""}`)
    .some((token) => moduleTokens.has(token));
}

function moduleBackedIntent(intentRow = {}) {
  return Boolean(intentRow.complaint_module_id)
    && (
      (intentRow.clinical_bundle_ids || []).includes("installed_guideline_module")
        || intentHasSameTopicComplaintModule(intentRow)
    );
}

function moduleItemLabel(item = {}) {
  return item.label || item.text || item.id || "";
}

const allowedPairedModuleExamLabelPattern = /\b(?:sclerae and conjunctivae)\b/i;
const bundledModuleExamLabelPattern = /[,;]|\b(?:and|plus)\b.*\b(?:and|plus)\b/i;
const vagueModuleExamLabelPattern = /^(?:assess|evaluate|screen for)\b|\b(?:screen|assessment|survey)\b/i;
const moduleExamVitalOrSafetyPattern = /\b(?:blood pressure|heart rate|respiratory rate|oxygen saturation|spo2|bedside glucose|weight|bmi|orthostatic|safety check|red-flag review)\b|(?:^|\b)(?:measure|check|document)\s+temperature\b/i;

function moduleExamAtomicityIssues(item = {}) {
  const label = moduleItemLabel(item);
  const normalized = normalizeEvidenceLabel(label);
  if (!normalized || allowedPairedModuleExamLabelPattern.test(normalized)) {
    return [];
  }
  const issues = [];
  if (moduleExamVitalOrSafetyPattern.test(normalized)) {
    issues.push({ severity: "high", type: "vitals_in_exam", detail: label });
  }
  if (bundledModuleExamLabelPattern.test(normalized)) {
    issues.push({ severity: "high", type: "bundled_exam_label", detail: label });
  }
  if (vagueModuleExamLabelPattern.test(normalized)) {
    issues.push({ severity: "high", type: "vague_exam_label", detail: label });
  }
  return issues;
}

function moduleItemTechnique(item = {}) {
  return item.technique || item.maneuver || item.action || "";
}

function moduleItemFindingsOptions(item = {}) {
  return item.findings_options || item.findingsOptions || item.options || "";
}

function cleanModuleOptionLabel(value = "") {
  let text = String(value || "")
    .replace(/[_]{2,}/g, "___")
    .replace(/\s+/g, " ")
    .replace(/^[,;:/\s-]+|[,;:/\s?.-]+$/g, "")
    .trim();
  if (!text) {
    return "";
  }
  if (/^Other(?:\s*_+)?$/i.test(text)) {
    return "Other ___";
  }
  const replacements = [
    [/^Have you had new salt craving$/i, "Salt craving"],
    [/^Have you had heat intolerance$/i, "Heat intolerance"],
    [/^Have you had cold intolerance$/i, "Cold intolerance"],
    [/^Have you noticed easy bruising$/i, "Easy bruising"],
    [/^Did menstrual periods never start by the expected age$/i, "Periods never started by expected age"],
    [/^Did previously present periods stop$/i, "Previously present periods stopped"],
    [/^When was the last menstrual period$/i, "Last menstrual period timing"],
    [/^How regular are cycles$/i, "Cycle regularity"],
    [/^How has weight changed from baseline$/i, "Weight change from baseline"],
    [/^How have weight$/i, "Weight trajectory"],
    [/^Waist circumference changed over time$/i, "Waist circumference trend"],
    [/^Was the change intentional$/i, "Intentional weight change"],
    [/^The change intentional$/i, "Intentional change"],
    [/^Associated with appetite$/i, "Appetite change"],
    [/^Fluid status$/i, "Fluid-status change"],
    [/^Systemic symptoms$/i, "Systemic symptoms"],
    [/^Do symptoms occur in episodes$/i, "Episodic symptoms"],
    [/^Are there symptom-free intervals$/i, "Symptom-free intervals"],
    [/^Do you have reliable access to water$/i, "Reliable water access"],
    [/^Are thirst$/i, "Thirst/intake limits hydration"],
    [/^What is the usual calcium$/i, "Calcium intake"],
    [/^Supplement$/i, "Supplement use"],
    [/^What is the usual physical activity level$/i, "Physical activity level"],
    [/^It changed recently because of symptoms$/i, "Activity changed because of symptoms"],
    [/^Function$/i, "Functional limitation"],
    [/^What is the current weight trajectory$/i, "Current weight trajectory"],
    [/^It changed from baseline$/i, "Changed from baseline"],
    [/^What is the current prior FNA Bethesda category$/i, "Prior FNA/Bethesda category"],
    [/^What is the approximate 24-hour urine volume$/i, "24-hour urine volume"],
    [/^How many times do you urinate overnight$/i, "Nocturia frequency"],
    [/^How much are you drinking$/i, "Fluid intake"],
    [/^Including polyuria$/i, "Polyuria"],
    [/^Any dehydration$/i, "Dehydration"],
    [/^How many weeks pregnant are you$/i, "Gestational age"],
    [/^This new$/i, "New or worsening"],
    [/^Has pregnancy dating$/i, "Pregnancy dating"],
    [/^Pregnancy dating$/i, "Pregnancy dating"],
    [/^Fetal growth$/i, "Fetal growth"],
    [/^Obstetric context changed diabetes screening or treatment safety$/i, "Obstetric diabetes-safety context"],
    [/^Urinating$/i, "Urine output"],
    [/^Do you have trouble rising from a chair$/i, "Trouble rising from chair"],
    [/^Have ring size$/i, "Ring size change"],
    [/^Shoe size$/i, "Shoe size change"],
    [/^Facial features$/i, "Facial feature change"],
    [/^How has height$/i, "Height/growth change"],
    [/^Do you currently smoke$/i, "Current smoking"],
    [/^Recently smoke$/i, "Recent smoking"],
    [/^How long has breast tissue enlargement$/i, "Breast enlargement duration"],
    [/^Tenderness been present$/i, "Breast tenderness duration"],
    [/^Is it unilateral$/i, "Unilateral breast enlargement"],
    [/^Have rapid growth$/i, "Rapid growth"],
    [/^Nipple discharge occurred$/i, "Nipple discharge"],
    [/^Has the thyroid nodule$/i, "Thyroid nodule or neck mass"],
    [/^Neck mass grown rapidly$/i, "Rapid neck-mass growth"],
    [/^Become painful$/i, "Painful nodule or neck mass"],
    [/^Associated with hoarseness$/i, "Hoarseness"]
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(text)) {
      return replacement;
    }
  }
  text = text
    .replace(/^Have you had\s+/i, "")
    .replace(/^Have you noticed\s+/i, "")
    .replace(/^Do you have\s+/i, "")
    .replace(/^Did\s+/i, "")
    .replace(/^When was the\s+/i, "")
    .replace(/^What is the approximate\s+/i, "")
    .replace(/^How many times do you\s+/i, "")
    .replace(/^How much are you\s+/i, "")
    .replace(/^How has\s+/i, "")
    .replace(/^Was the\s+/i, "")
    .replace(/^Are there\s+/i, "")
    .replace(/^Is it\s+/i, "")
    .replace(/^Has the\s+/i, "")
    .replace(/^Are\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:/\s-]+|[,;:/\s?.-]+$/g, "")
    .trim();
  if (!text) {
    return "";
  }
  if (/^Other(?:\s*_+)?$/i.test(text)) {
    return "Other ___";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function moduleItemOptionLabels(value) {
  if (Array.isArray(value)) {
    const labels = value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return entry.label || entry.value || entry.text || "";
        }
        return entry;
      })
      .map((entry) => String(entry || "").replace(/\s+/g, " ").trim())
      .map(cleanModuleOptionLabel)
      .filter(Boolean);
    return Array.from(new Map(labels.map((entry) => [entry.toLowerCase(), entry])).values());
  }
  const labels = String(value || "")
    .split(/\s*(?:[;|]|\s+\/\s+)\s*/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .map(cleanModuleOptionLabel)
    .filter(Boolean);
  return Array.from(new Map(labels.map((entry) => [entry.toLowerCase(), entry])).values());
}

function moduleItemOptionText(value) {
  return moduleItemOptionLabels(value).join(" / ");
}

function genericModuleHistoryOption(label = "") {
  return /^(?:no|none|yes|other|other ___|unknown|unable|unable to assess|not assessed|n\/a|na|not sure|unsure|no localizing symptoms)$/i
    .test(String(label || "").replace(/[_-]{2,}/g, "").trim());
}

function moduleHistoryOptionComponentLabel(part = "", source = "") {
  const label = cleanModuleOptionLabel(part);
  if (!label || genericModuleHistoryOption(label)) {
    return "";
  }
  const lower = label.toLowerCase();
  const sourceText = String(source || "").toLowerCase();
  if (/^(?:ear|sinus|dental)$/.test(lower) && /\bpain\b/.test(sourceText)) {
    return `${label} pain`;
  }
  if (lower === "line") {
    return "Line concern";
  }
  if (lower === "wound") {
    return "Wound concern";
  }
  if (lower === "frequency" && /\b(?:urinary|dysuria|uti)\b/.test(sourceText)) {
    return "Urinary frequency";
  }
  return label;
}

function moduleHistoryOptionLabels(value) {
  const labels = moduleItemOptionLabels(value);
  const output = [];
  const seen = new Set();
  labels.forEach((label) => {
    if (genericModuleHistoryOption(label)) {
      return;
    }
    const protectedCompoundOption = /\b(?:24-hour|2-hour|1-hour|50-g|75-g|100-g|beta-hydroxybutyrate|pre-pregnancy)\b/i.test(label);
    const groupish = !protectedCompoundOption
      && /[-/,]|\b(?:and|or)\b/i.test(label)
      && /\b(?:cough|dyspnea|sputum|pleuritic|dysuria|frequency|urgency|flank|abdominal|vomit|diarrhea|rash|wound|line|headache|neck stiffness|confusion|joint|back pain|urine|worsening|heat intolerance|cold intolerance|palpitations|tremor|anxiety|insomnia|weight|appetite|sweating|nausea|syncope|hemoptysis|leg swelling|calf pain)\b/i.test(label);
    const pieces = groupish
      ? label.split(/\s*(?:-|\/|,|\band\b|\bor\b)\s*/i)
      : [label];
    pieces
      .map((part) => moduleHistoryOptionComponentLabel(part, label))
      .filter(Boolean)
      .forEach((component) => {
        const key = normalizeClinicalIntentText(component);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        output.push(component);
      });
  });
  return output.length ? output : labels.filter((label) => !genericModuleHistoryOption(label));
}

function moduleHistoryOptionText(value) {
  return moduleHistoryOptionLabels(value).join(" / ");
}

function genericFindingsOptions(value) {
  const tokens = moduleItemOptionLabels(value)
    .map((entry) => normalizeClinicalIntentText(entry))
    .filter(Boolean);
  const genericTokens = tokens.filter((entry) => /^(?:normal|abnormal|present|absent|normal absent|abnormal present|unable|unable to assess|not assessed)$/.test(entry));
  if (tokens.length < 3 || genericTokens.length !== tokens.length) {
    return false;
  }
  const normalized = tokens.join(" ");
  return /\b(?:unable|unable to assess|not assessed)\b/.test(normalized)
    && (((/\bnormal\b/.test(normalized) && /\babnormal\b/.test(normalized)))
      || (/\bpresent\b/.test(normalized) && /\babsent\b/.test(normalized)));
}

function moduleItemDiagnosticTarget(item = {}) {
  return item.diagnostic_target || item.diagnostic_purpose || "";
}

function moduleItemManagementChange(item = {}) {
  return item.management_change || item.management_implication || item.action || "";
}

function moduleItemLimitations(item = {}) {
  return item.limitations || item.interpretation_cautions || item.interpretationCautions || "";
}

function moduleItemFeasibilityComplete(item = {}) {
  return Boolean(
    item.difficulty
      && item.time_burden_minutes !== undefined
      && item.time_burden_minutes !== null
      && String(item.equipment_needed || "").trim()
      && String(item.patient_cooperation_required || "").trim()
  );
}

function moduleItemHasLikelihoodRatioFields(item = {}) {
  return Object.prototype.hasOwnProperty.call(item, "LR_plus")
    && Object.prototype.hasOwnProperty.call(item, "LR_minus");
}

function moduleItemLikelihoodRatioNote(item = {}) {
  return item.likelihood_ratio_note || item.LR_note || item.lr_note || "";
}

function moduleItemTags(item = {}) {
  return Array.isArray(item.tags) ? item.tags.filter(Boolean).join("; ") : String(item.tags || "").trim();
}

function hasExamScopeCaution(items = []) {
  return (items || []).some((item) => {
    const text = [
      item.id,
      item.label,
      item.limitation,
      item.interpretation_cautions,
      item.limitations,
      Array.isArray(item.tags) ? item.tags.join(" ") : item.tags
    ].filter(Boolean).join(" ");
    return /\b(?:exam_scope|exam light|exam-light|intentionally exam-light|physical exam scope)\b/i.test(text);
  });
}

function moduleSourceForItem(item = {}) {
  return item.source?.source_id || item.source_id || "";
}

function firstReportText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map((entry) => String(entry || "").trim()).filter(Boolean).join("; ");
      if (joined) return joined;
    } else if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function reportValueParts(value) {
  if (Array.isArray(value)) {
    return value.flatMap(reportValueParts);
  }
  if (value && typeof value === "object") {
    return [
      value.source_id,
      value.sourceId,
      value.id,
      value.intent_id,
      value.exam_id,
      value.route,
      value.authorized_by
    ].filter(Boolean);
  }
  return String(value || "").split(/[;|]/);
}

function uniqueReportValues(values = []) {
  return Array.from(new Set(values
    .flatMap(reportValueParts)
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => value !== "[object Object]")));
}

function registryStyleReportSourceId(value = "") {
  const text = String(value || "").trim();
  return /^[A-Z][A-Z0-9_:-]{1,}$/.test(text)
    && !/^https?:\/\//i.test(text)
    && !/\s/.test(text)
    && !/[.,()]/.test(text);
}

function uniqueReportSourceIds(values = []) {
  return uniqueReportValues(values).filter(registryStyleReportSourceId);
}

function reportTagText(...values) {
  return uniqueReportValues(values).join("; ");
}

function reportTraceabilityForEntry(entry = {}, fallback = {}) {
  const candidate = entry.candidate || entry;
  const traceability = entry.traceability || candidate.traceability || {};
  const evidence = entry.evidence || candidate.evidence || {};
  const sourceIds = uniqueReportSourceIds([
    traceability.source_ids,
    entry.source_ids,
    candidate.evidence_source_primary,
    candidate.source?.source_id,
    fallback.source_ids
  ]);
  return {
    intent_ids: uniqueReportValues([
      traceability.intent_ids,
      entry.validatedIntentIds,
      candidate.validatedIntentIds,
      fallback.intent_ids
    ]),
    source_ids: sourceIds,
    authorized_by: traceability.authorized_by || entry.authorized_by || candidate.authorized_by || fallback.authorized_by || "",
    item_id: traceability.item_id
      || traceability.evidence_row_id
      || traceability.linkedExamId
      || entry.exam_id
      || candidate.exam_id
      || fallback.item_id
      || "",
    routes: uniqueReportValues([
      traceability.retrieval_routes,
      traceability.routes,
      entry.retrievalRoutes,
      entry.retrievalRoute,
      candidate.retrievalRoutes,
      candidate.retrievalRoute,
      entry.routes,
      fallback.routes
    ]),
    catalog_gap: Boolean(traceability.catalog_gap || candidate.catalogGap || fallback.catalog_gap)
  };
}

function withFlatTraceabilityFields(row = {}) {
  const traceability = row.traceability || {};
  const intentIds = uniqueReportValues(traceability.intent_ids);
  const sourceIds = uniqueReportSourceIds(traceability.source_ids);
  const routes = uniqueReportValues([
    traceability.routes,
    traceability.retrieval_routes,
    row.routes,
    row.retrievalRoute,
    row.retrievalRoutes,
    row.authorized_by || traceability.authorized_by,
    row.role ? `${row.role}_export` : ""
  ]);
  return {
    ...row,
    intent_trace: intentIds.join("; "),
    source_ids: sourceIds,
    authorized_by: traceability.authorized_by || row.authorized_by || "",
    trace_item_id: traceability.item_id || row.exam_id || "",
    retrieval_routes: routes.join("; "),
    catalog_gap: Boolean(traceability.catalog_gap || row.catalog_gap)
  };
}

function reportTraceabilityForModuleItem(item = {}, intentRow = {}, role = "") {
  const sourceId = moduleSourceForItem(item);
  return {
    intent_ids: uniqueReportValues([
      moduleTraceIdsForItem(item),
      intentRow.intent_id
    ]),
    source_ids: uniqueReportSourceIds([
      sourceId,
      intentRow.source_ids || []
    ]),
    authorized_by: "installed_guideline_module",
    item_id: item.id || "",
    routes: uniqueReportValues(["installed_guideline_module", role]),
    catalog_gap: false
  };
}

function moduleItemText(item = {}) {
  return normalizeEvidenceLabel([
    moduleItemLabel(item),
    item.text,
    item.action,
    item.rationale,
    item.diagnostic_purpose,
    item.diagnostic_target,
    item.management_implication,
    item.management_change,
    item.when_to_ask,
    item.when_to_perform,
    item.source?.source_section,
    ...(item.tags || [])
  ].filter(Boolean).join(" "));
}

function moduleWorkupText(result = {}) {
  return [
    ...(result.safetyChecks || []),
    ...(result.requiredQuestions || []),
    ...(result.conditionalQuestions || []),
    ...(result.focusedExam || []),
    ...(result.initialTests || []),
    ...(result.redFlags || []),
    ...(result.dispositionRules || []),
    ...(result.differentialBuckets || [])
  ].map(moduleItemText).join(" ");
}

function moduleSectionText(items = []) {
  return (items || []).map(moduleItemText).join(" ");
}

function attendingBaselineIssuesForModule(intentRow = {}, module = {}, result = {}) {
  const issues = [];
  const requiredDomainText = (intentRow.required_domains || []).join(" ");
  const sourceLocalizingInfection = /source-localizing infection history|respiratory source screen/i.test(requiredDomainText)
    || /(?:^|_)fever_sepsis(?:_|$)|\bfever, infection, or sepsis\b/i.test(`${intentRow.intent_id || ""} ${intentRow.label || ""} ${module.id || ""} ${module.label || ""}`);

  if (sourceLocalizingInfection) {
    const historyText = moduleSectionText([...(result.requiredQuestions || []), ...(result.conditionalQuestions || [])]);
    const examText = moduleSectionText([...(result.focusedExam || []), ...(result.conditionalExam || [])]);
    const testsText = moduleSectionText(result.initialTests || []);
    const redFlagText = moduleSectionText(result.redFlags || []);
    const managementText = moduleSectionText(result.dispositionRules || []);

    [
      {
        label: "source-localizing fever history must ask respiratory, urinary, skin/line/wound, abdominal/GI, CNS, and host/exposure questions",
        text: historyText,
        pattern: /(?=[\s\S]*cough)(?=[\s\S]*(?:dysuria|urinary|flank))(?=[\s\S]*(?:rash|wound|line))(?=[\s\S]*(?:abdominal|vomiting|diarrhea))(?=[\s\S]*(?:headache|neck|confusion))(?=[\s\S]*(?:exposure|host|immunosuppression|pregnancy))/i
      },
      {
        label: "fever/infection exam must include respiratory effort and lung auscultation for pneumonia/hypoxemia source screening",
        text: examText,
        pattern: /(?:work of breathing|respiratory effort)[\s\S]*(?:auscultate.*lung|posterior lung sounds|lung fields)|(?:auscultate.*lung|posterior lung sounds|lung fields)[\s\S]*(?:work of breathing|respiratory effort)/i
      },
      {
        label: "fever/infection exam must include skin, wound, or line-site source inspection",
        text: examText,
        pattern: /(?:skin|wound|line)[\s\S]*(?:source|infection|cellulitis|abscess|drainage)|(?:source|infection|cellulitis|abscess|drainage)[\s\S]*(?:skin|wound|line)/i
      },
      {
        label: "fever/infection tests must include source-directed studies and respiratory imaging/testing when pneumonia is plausible",
        text: testsText,
        pattern: /source[- ]directed[\s\S]*(?:chest|respiratory|pneumonia|lung)|(?:chest|respiratory|pneumonia|lung)[\s\S]*source[- ]directed/i
      },
      {
        label: "fever/infection red flags must include sepsis/shock and CNS/airway/purpura danger patterns",
        text: redFlagText,
        pattern: /sepsis[\s\S]*(?:CNS|airway|purpura|meningitis)|(?:CNS|airway|purpura|meningitis)[\s\S]*sepsis/i
      },
      {
        label: "fever/infection management must distinguish urgent escalation from low-risk outpatient safety-netting",
        text: managementText,
        pattern: /escalate[\s\S]*(?:outpatient|safety net|follow-up)|(?:outpatient|safety net|follow-up)[\s\S]*escalate/i
      }
    ].forEach((requirement) => {
      if (!requirement.pattern.test(requirement.text)) {
        issues.push(requirement.label);
      }
    });
  }

  return issues;
}

function moduleRequiredDomainSatisfied(domain, result = {}) {
  const normalizedDomain = normalizeClinicalIntentText(domain);
  const text = moduleWorkupText(result);
  if (/basic bedside safety/.test(normalizedDomain)) return Boolean((result.safetyChecks || []).length);
  if (/focused endocrine history/.test(normalizedDomain)) return Boolean((result.requiredQuestions || []).length || (result.conditionalQuestions || []).length);
  if (/guideline backed physical exam/.test(normalizedDomain)) return Boolean((result.focusedExam || []).length);
  if (/tests|reference thresholds/.test(normalizedDomain)) return Boolean((result.initialTests || []).length);
  if (/red flags|management changes/.test(normalizedDomain)) return Boolean((result.redFlags || []).length && (result.dispositionRules || []).length);
  if (/visual fields|cranial nerve|mass effect/.test(normalizedDomain)) return /\b(?:visual fields?|visual acuity|extraocular|pupils?|cranial|diplopia|optic|pituitary|apoplexy)\b/.test(text);
  if (/pituitary hormone phenotype/.test(normalizedDomain)) return /\b(?:pituitary|hormone|prolactin|lh|fsh|igf|gh|acth|cortisol|adrenal|thyroid|gonad|polyuria|polydipsia)\b/.test(text);
  if (/orthostasis|volume/.test(normalizedDomain)) return /\b(?:orthostatic|blood pressure|heart rate|volume|dehydration|hypovolemia|salt|shock|hyperpigmentation|mucous)\b/.test(text);
  if (/adrenal phenotype/.test(normalizedDomain)) return /\b(?:adrenal|cortisol|acth|aldosterone|renin|androgen|hyperpigmentation|salt|crisis|pheochromocytoma|cushing)\b/.test(text);
  if (/crisis features/.test(normalizedDomain)) return /\b(?:crisis|shock|vomiting|hypotension|acute|severe|altered mental|electrolyte|arrhythmia|unstable)\b/.test(text);
  if (/reproductive|fertility|pregnancy/.test(normalizedDomain)) return /\b(?:reproductive|fertility|pregnancy|menstrual|cycle|amenorrhea|libido|testicular|gynecomastia|hirsutism|ovarian|gonad)\b/.test(text);
  if (/hydration|perfusion/.test(normalizedDomain)) return /\b(?:hydration|perfusion|dehydration|volume|blood pressure|heart rate|mucous|edema|pulse)\b/.test(text);
  if (/diabetes foot|skin/.test(normalizedDomain)) return /\b(?:foot|skin|wound|ulcer|neuropathy|pulses?|dorsalis|posterior tibial|monofilament)\b/.test(text);
  if (/glycemic safety/.test(normalizedDomain)) return /\b(?:glucose|a1c|hypoglycemia|hyperglycemia|diabetes|insulin|ketone)\b/.test(text);
  if (/thyroid|neck/.test(normalizedDomain)) return /\b(?:thyroid|neck|goiter|nodule|compressive|hoarseness|lymph|cervical)\b/.test(text);
  if (/cardiac rhythm|perfusion/.test(normalizedDomain)) return /\b(?:heart|pulse|blood pressure|arrhythmia|palpitation|tachycardia|bradycardia|perfusion|edema)\b/.test(text);
  if (/bone tenderness|strength|gait/.test(normalizedDomain)) return /\b(?:bone|tenderness|strength|gait|falls?|fracture|proximal|myopathy|osteomalacia|osteoporosis)\b/.test(text);
  if (/calcium complication/.test(normalizedDomain)) return /\b(?:calcium|hypocalcemia|hypercalcemia|tetany|chvostek|kidney stone|nephrolithiasis|constipation|confusion)\b/.test(text);
  return requiredDomainSatisfied(domain, text);
}

function summarizeModuleItem(item, role = "", intentRow = {}) {
  const source = moduleSourceForItem(item);
  const lrPlus = item.LR_plus || item.lr_plus || "n/a";
  const lrMinus = item.LR_minus || item.lr_minus || "n/a";
  const lrNote = item.likelihood_ratio_note || item.LR_note || item.lr_note || "Likelihood ratios are not available or not applicable for this installed guideline-module item; use the cited guideline/source context and management implication.";
  const diagnosticPurpose = item.diagnostic_purpose || item.reason || item.rationale || item.diagnostic_target || "";
  const managementImplication = item.management_implication || item.management_change || item.action || "";
  const baseLabel = role === "management" ? moduleManagementDisplayLabel(item) : moduleItemLabel(item);
  const displayLabel = role === "suppressed"
    ? suppressedReportLabel({ label: baseLabel, original_label: baseLabel, exam_id: item.id || item.exam_id || "" })
    : baseLabel;
  return withFlatTraceabilityFields({
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: displayLabel,
    original_label: role === "suppressed" ? stripSuppressedReportPrefix(baseLabel) : "",
    role,
    fit: "",
    score: item.score ?? "",
    reason: item.reason || item.suppressionReason || item.rationale || item.diagnostic_purpose || item.action || "",
    diagnostic_purpose: diagnosticPurpose,
    diagnostic_target: item.diagnostic_target || item.diagnostic_purpose || diagnosticPurpose,
    management_implication: managementImplication,
    management_change: item.management_change || item.management_implication || item.action || managementImplication,
    options: moduleItemOptionText(moduleItemFindingsOptions(item)),
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    difficulty: item.difficulty || "",
    time_burden_minutes: item.time_burden_minutes ?? "",
    action: item.action || "",
    technique: reportTechniqueForRole(role, moduleItemTechnique(item)),
    when_to_use: firstReportText(item.when_to_perform, item.when_to_use, item.whenToUse, item.when_to_use_structured, item.when_to_review),
    equipment_needed: item.equipment_needed || "",
    patient_cooperation_required: item.patient_cooperation_required || "",
    limitations: item.limitations || item.interpretation_cautions || item.interpretationCautions || "",
    tags: moduleItemTags(item),
    routes: ["installed_guideline_module"],
    traceability: reportTraceabilityForModuleExport(item, intentRow, role)
  });
}

function summarizeQuestionItem(item, intentRow = {}) {
  const fullQuestion = item.text || item.label || "";
  const source = moduleSourceForItem(item);
  const lrPlus = item.LR_plus || item.lr_plus || "n/a";
  const lrMinus = item.LR_minus || item.lr_minus || "n/a";
  const lrNote = item.likelihood_ratio_note || item.LR_note || item.lr_note || "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize the source, assess severity, and guide management.";
  const diagnosticPurpose = item.diagnostic_purpose || item.rationale || item.reason || "";
  const managementImplication = item.management_implication || item.management_change || item.action || "";
  return withFlatTraceabilityFields({
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: conciseHistoryQuestionLabel({ ...item, text: fullQuestion }),
    text: fullQuestion,
    full_question: fullQuestion,
    role: "history",
    reason: diagnosticPurpose,
    diagnostic_purpose: diagnosticPurpose,
    management_implication: managementImplication,
    management_change: managementImplication,
    options: moduleHistoryOptionText(item.options || item.answer_options || item.answerOptions || item.bedsideQuestionOptions || item.bedside_question_options || ""),
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    when_to_ask: firstReportText(item.when_to_ask, item.whenToAsk, item.when_to_use, item.when_to_use_structured),
    tags: moduleItemTags(item),
    detail_prompts: historyQuestionDetailPrompts(fullQuestion, item.detail_prompts || []),
    traceability: reportTraceabilityForModuleExport(item, intentRow, "history")
  });
}

function historyQuestionNeedsDetailPrompts(item = {}) {
  const text = String(item.full_question || item.text || item.label || "");
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  return text.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(text.trim()) && text.length >= 105)
    || (/^Any\b/i.test(text.trim()) && commaCount >= 3);
}

function conciseHistoryQuestionLabel(item = {}) {
  const text = String(item.text || item.label || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeEvidenceLabel(text);
  const tagText = normalizeEvidenceLabel(reportTagText(item.tags, item.retrievalTags, item.matchedTags));
  const itemKeyText = normalizeEvidenceLabel([item.id, item.label, item.exam_id].filter(Boolean).join(" "));
  const sourceSignalText = `${itemKeyText} ${tagText}`;
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
  const earlyDkaContext = /\b(?:dka|hhs|hyperglycemic|ketotic|ketones?|beta hydroxybutyrate|anion gap|insulin|sglt2)\b/.test(`${normalized} ${tagText}`);
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
  if (/how high was the fever|how was it measured|when did it start|maximum temperature|document maximum temperature|antipyretics/.test(normalized)) {
    return "Ask fever timeline, measurement, and medication exposure";
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
  const dkaContext = /\b(?:dka|hhs|hyperglycemic|ketotic|ketones?|beta hydroxybutyrate|anion gap|insulin|sglt2)\b/.test(allText);
  const thyroidContext = /\b(?:thyroid|graves|hashimoto|thyrotoxicosis|hyperthyroid|hypothyroid|goiter|nodule|tsh|antithyroid|amiodarone|lithium|biotin)\b/.test(allText);
  const infectionContext = /\b(?:fever|infection|sepsis|pneumonia|source-localizing|source localizing|source control|cellulitis|abscess|line infection)\b/.test(allText);
  const guStiContext = /\b(?:\bsti\b|sexually transmitted|urethritis|genital discharge|penile discharge|vaginal discharge|new partners|syphilis|hiv|gonorrhea|chlamydia|testicular pain|scrotal pain)\b/.test(allText);
  const boneMineralContext = /\b(?:bone_and_parathyroid|bone and parathyroid|vitamin_d|vitamin d|osteomalacia|osteoporosis|osteopenia|hypoparathyroidism|hyperparathyroidism|parathyroid|calcium|pth|phosphorus|bone density|fragility fracture|kidney stones|nephrocalcinosis)\b/.test(allText);
  const pelvicPregnancyContext = /\b(?:pelvic_pain|pelvic pain|menstrual|period|ectopic|pid|gynecology|pregnancy|pregnant|dyspareunia|purulent discharge|heavy bleeding)\b/.test(allText);
  const chestPainContext = /\b(?:chest_pain|chest pain|angina|acs|acute coronary|cardiopulmonary|cardiovascular|myocardial|pleuritic)\b/.test(allText);
  const diabetesContext = /\b(?:diabetes_and_blood_sugar|diabetes and blood sugar|type_1_diabetes|type_2_diabetes|gestational_diabetes|prediabetes|metabolic_syndrome|diabetes mellitus|blood sugar|glycemic|glucose|a1c|retinopathy|neuropathy)\b/.test(allText);
  const pituitaryAdrenalContext = /\b(?:pituitary_gland|pituitary gland|adrenal_gland|adrenal gland|cushing|cortisol|addison|adrenal_insufficiency|pheochromocytoma|hyperaldosteronism|hypopituitarism|prolactinoma|acromegaly|gigantism)\b/.test(allText);
  const reproductiveContext = /\b(?:reproductive_and_gonadal|reproductive and gonadal|amenorrhea|hypogonadism|menopause|premature ovarian insufficiency|infertility|gynecomastia|hirsutism|erectile dysfunction|libido|puberty|fertility|galactorrhea|vasomotor|genitourinary)\b/.test(allText);
  const endocrineWeightSystemicQuestion = /^how has weight changed|weight changed from baseline|intentional weight|appetite|fluid status|systemic symptoms/.test(allText);
  if (!infectionContext && (diabetesContext || pituitaryAdrenalContext || boneMineralContext || reproductiveContext) && endocrineWeightSystemicQuestion) {
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
  const explicitFeverWorkupContext = /\b(?:fever sepsis|fever infection|infection sepsis|source localizing history|respiratory source|urinary source|skin source|host risk|exposure history|sepsis)\b/.test(allText)
    && !diabetesContext
    && !boneMineralContext
    && !pituitaryAdrenalContext
    && !thyroidContext;
  const feverWorkupContext = infectionContext
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
  const acuteScrotalHistoryContext = /\b(?:acute_scrotum|scrotal pain|scrotal_pain|testicular torsion|testicular_torsion|torsion|high-riding|cremasteric|solitary testis|urgent urology|urology care)\b/.test(`${normalized} ${tagText}`);
  if (acuteScrotalHistoryContext) {
    if (/^was onset sudden|was onset sudden|urinary symptoms fever trauma or sti exposure/.test(normalized)) {
      return "Ask torsion-associated nausea, swelling, urinary, and trauma features";
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
    return "Ask discharge, dysuria, genital lesions, and STI exposure";
  }
  if (/\b(?:dysuria|urinary|uti|pyelonephritis|renal_colic|renal colic|flank|hematuria|catheter|urologic|oliguria|low urine|aki|obstruction|stone)\b/.test(allText)
    && !guStiContext
    && !boneMineralContext
    && !/what symptoms localize|localize the fever source|source:/.test(normalized)
    && /are symptoms limited to dysuria|dysuria\/frequency\/urgency|dysuria|urinary frequency|urinary urgency|hematuria|flank pain|catheter\/procedure|urologic|pyelonephritis|stone history|obstruction|resistant urine culture|pregnancy possibility/.test(normalized)) {
    if (/symptoms limited to dysuria|catheter\/procedure|prior resistant|immunocompromise|pregnancy possibility/.test(normalized)) {
      return "Ask UTI symptoms and complicated-infection risk";
    }
    return "Ask urinary symptoms and renal warning features";
  }
  if (reproductiveContext && /last menstrual period|regular are cycles|bleeding changed|cycle irregularity|cycle change/.test(allText)) {
    return "Ask menstrual timing and bleeding pattern";
  }
  if (reproductiveContext && /menstrual periods never start|previously present periods stop|primary amenorrhea|secondary amenorrhea/.test(allText)) {
    return "Ask amenorrhea onset and menstrual pattern";
  }
  if (reproductiveContext && /pregnancy possible|planned soon|recently postpartum|pregnancy change medication|pregnancy change imaging/.test(allText)) {
    return "Ask pregnancy possibility and reproductive plans";
  }
  if (reproductiveContext && /hot flashes|night sweats|sleep disruption|vaginal dryness|dyspareunia|urinary symptoms|sexual-function|vasomotor|genitourinary symptoms|mood change/.test(allText)) {
    return "Ask vasomotor and genitourinary symptoms";
  }
  if (reproductiveContext && /change in libido|morning erections|erectile function|ejaculation|orgasm|testicular symptoms/.test(allText)) {
    return "Ask sexual function and fertility goals";
  }
  if (reproductiveContext && /timing of puberty|sexual development|pubertal milestones|delayed.*pubert|incomplete.*pubert/.test(allText)) {
    return "Ask pubertal timing and development";
  }
  if (reproductiveContext && /nipple discharge|breast tenderness|headaches|visual symptoms|medications that raise prolactin|galactorrhea|prolactin/.test(allText)) {
    return "Ask prolactin symptoms and mass-effect risk";
  }
  if (reproductiveContext && /chemotherapy|radiation|pelvic\/cranial surgery|gonadal surgery|cancer treatment/.test(allText)) {
    return "Ask gonadotoxic treatment history";
  }
  if (reproductiveContext && /autoimmune|family premature ovarian insufficiency|premature ovarian insufficiency risk/.test(allText)) {
    return "Ask autoimmune and family reproductive history";
  }
  if (reproductiveContext && /breast tenderness|discrete mass|testicular pain|testicular mass|liver\/kidney disease|alcohol|cannabis|gynecomastia/.test(allText)) {
    return "Ask breast/testicular symptoms and exposure risks";
  }
  if (reproductiveContext && /predictably ovulatory|lh-kit|luteal symptoms|cycle tracking|regular ovulation/.test(allText)) {
    return "Ask ovulation pattern and cycle tracking";
  }
  if (reproductiveContext && /semen analysis|partner fertility evaluation|partner evaluation/.test(allText)) {
    return "Ask partner semen analysis and fertility evaluation";
  }
  if (reproductiveContext && /palpitations|tremor|heat or cold intolerance|constipation or diarrhea|weight change|fatigue|neck swelling|eye symptoms/.test(allText)) {
    return "Ask thyroid symptoms affecting reproductive function";
  }
  if (boneMineralContext && /height loss|new back pain|kyphosis|low-trauma fracture|low trauma fracture|fall|vertebral/.test(allText)) {
    return "Ask fracture, fall, and vertebral-compression symptoms";
  }
  if ((boneMineralContext || pituitaryAdrenalContext) && /rising from a chair|climbing stairs|lifting overhead|getting up from the floor|proximal muscle weakness|proximal weakness/.test(allText)) {
    return "Ask proximal muscle weakness symptoms";
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
  if (boneMineralContext && /family history of men|familial hypocalciuric|parathyroid disease|pituitary tumors|pancreatic neuroendocrine|jaw tumors/.test(allText)) {
    return "Ask hereditary hyperparathyroidism/FHH and MEN history";
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
  if (boneMineralContext && /perioral numbness|tingling|cramps|tetany|carpopedal|seizure|laryngospasm|arrhythmia/.test(allText)) {
    return "Ask hypocalcemia neuromuscular symptoms";
  }
  if (boneMineralContext && /prior neck|thyroid surgery|parathyroid surgery|postoperative calcium|post neck surgery|neck surgery/.test(allText)) {
    return "Ask neck surgery and postoperative calcium history";
  }
  if (boneMineralContext && /head\/neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer/.test(allText)) {
    return "Ask neck radiation and parathyroid-risk history";
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
  if (diabetesContext && /home glucose pattern|glucose pattern|changed from baseline/.test(allText)) {
    return "Ask home glucose pattern and baseline change";
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
  if (/what has already been given|fluids|insulin route|current monitoring level|potassium\/phosphate|dextrose|antibiotics/.test(allText)) {
    return "Review hyperglycemic-crisis treatments already started";
  }
  if (/recent glucose|beta hydroxybutyrate|anion gap|bicarbonate|osmolality|ketones/.test(allText)) {
    return "Review hyperglycemic-crisis diagnostic and severity data";
  }
  if (/what does it feel like|radiate to arm|radiate.*jaw|radiate.*shoulder|chest pain quality|location radiation/.test(allText)) {
    return "Ask chest pain quality, location, and radiation";
  }
  if (chestPainContext
    && /exertional|relieved by rest|similar to prior angina|non-exertional|provoked by exertion/.test(allText)) {
    return "Ask exertional pattern and response to rest";
  }
  if (/shortness of breath|pleuritic pain|hemoptysis|oxygen requirement|cough/.test(allText)
    && /chest|cardiovascular|cardiopulmonary/.test(allText)) {
    return "Ask cardiopulmonary associated symptoms";
  }
  if (/diaphoresis|nausea|vomiting|palpitations|marked weakness/.test(allText)
    && /chest|cardiovascular|ischemic|arrhythmia/.test(allText)) {
    return "Ask ischemic and arrhythmia-associated symptoms";
  }
  if (/syncope|presyncope|neurologic symptoms|sudden maximal pain/.test(allText)
    && /chest|cardiovascular|high risk/.test(allText)) {
    return "Ask high-risk chest pain warning features";
  }
  if (/known cad|prior mi|stent|cabg|smoking|hypertension|family history/.test(allText)
    && /chest|cardiovascular|risk/.test(allText)) {
    return "Ask cardiovascular risk history";
  }
  if (chestPainContext
    && /cocaine|stimulant|anticoagulant|antiplatelet|estrogen|medication change|medication risk|vte risk|thrombotic/.test(allText)) {
    return "Ask medication, stimulant, and thrombotic-risk modifiers";
  }
  if (!thyroidContext && /exact joint|body area|trauma|bear weight|swelling|redness|wound/.test(allText)
    && /musculoskeletal|joint|site specific|pain/.test(allText)) {
    return "Ask pain location, trauma, and inflammatory red flags";
  }
  if (/salt craving|dizziness on standing|low blood pressure|vomiting|abdominal pain|skin darkening/.test(allText)) {
    return "Ask adrenal insufficiency and volume-depletion symptoms";
  }
  if ((pituitaryAdrenalContext || /\b(?:acromegaly|gigantism|growth hormone)\b/.test(allText))
    && /ring size|shoe size|facial features|jaw spacing|sweating|sleep apnea|joint pain|headaches/.test(allText)) {
    return "Ask acral, soft-tissue, sleep, and headache changes";
  }
  if (thyroidContext && /heat intolerance|palpitations|tremor|anxiety|unintentional weight loss|diarrhea|increased sweating/.test(allText)) {
    return "Ask hyperthyroid adrenergic, weight, and GI symptoms";
  }
  if (thyroidContext && /^how has weight changed|weight changed from baseline|appetite|fluid status|systemic symptoms/.test(allText)) {
    return "Ask thyroid-related weight and systemic symptoms";
  }
  if (thyroidContext && /thyroid hormone|antithyroid drug|amiodarone|lithium|iodine|contrast exposure|high-dose biotin|biotin|thyroid supplement|missed dose|recent dose change/.test(allText)) {
    return "Review thyroid medications, iodine/biotin exposure, and assay interference";
  }
  if (thyroidContext && /has the thyroid nodule|neck mass grown rapidly|become painful|fixed|associated with hoarseness|suspicious nodes/.test(allText)) {
    return "Ask thyroid nodule growth and invasion symptoms";
  }
  if (thyroidContext && /neck swelling[\s\S]*rapid growth[\s\S]*radiation exposure[\s\S]*family thyroid cancer/.test(allText)) {
    return "Ask thyroid structural symptoms and cancer-risk history";
  }
  if (thyroidContext && /childhood head\/neck radiation|childhood head or neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer risk factor/.test(allText)) {
    return "Ask thyroid radiation and family-risk history";
  }
  if (thyroidContext && /personal or family history of men|vhl|nf1|sdhx|medullary thyroid cancer|pheochromocytoma|paraganglioma/.test(allText)) {
    return "Ask hereditary endocrine tumor history";
  }
  if (thyroidContext && /neck swelling[\s\S]*thyroid pain|thyroid pain or tenderness|pressure[\s\S]*hoarseness[\s\S]*trouble swallowing|rapidly enlarging neck mass/.test(allText)) {
    return "Ask thyroid pain, pressure, and airway symptoms";
  }
  if (thyroidContext && /thyroid nodule|neck mass|grown rapidly|hoarseness|dysphagia|dyspnea|suspicious nodes/.test(allText)) {
    return "Ask thyroid nodule growth, compressive, and node warnings";
  }
  if (thyroidContext && /childhood head\/neck radiation|head neck radiation|therapeutic radiation|occupational exposure|family thyroid cancer|medullary thyroid|men2/.test(allText)) {
    return "Ask thyroid cancer radiation and family-risk history";
  }
  if (/missed|reduced insulin|pump|reservoir|expired insulin|medication access/.test(allText)) {
    return "Ask insulin delivery and access precipitants";
  }
  if (/fever|dysuria|cough|wound|line infection|dental|skin infection|chest pain|stroke symptoms|pancreatitis|trigger/.test(allText)
    && /dka|hyperglycemia|infection trigger|hyperglycemic/.test(allText)) {
    return "Ask DKA/HHS infectious, ischemic, and medication triggers";
  }
  if (dkaContext
    && /confusion|sleepiness|seizure|severe weakness|participate in care/.test(allText)) {
    return "Ask hyperglycemic-crisis neurologic severity symptoms";
  }
  if (dkaContext && /sglt2|pregnancy|postpartum|fasting|low carb|alcohol|toxin/.test(allText)) {
    return "Ask euglycemic DKA and special-population risks";
  }
  if (/heart failure|ckd|eskd|frailty|cirrhosis|smaller fluid boluses|electrolyte monitoring/.test(allText)) {
    return "Ask fluid-resuscitation and electrolyte-safety modifiers";
  }
  if (/fluids|insulin route|potassium|phosphate|dextrose|bicarbonate|antibiotics|monitoring level/.test(allText)) {
    return "Review treatments already started and monitoring level";
  }
  if (infectionContext && /localize|source|cough|sputum|dyspnea|dysuria|flank|rash|wound|neck stiffness|abdominal/.test(allText)) {
    return "Ask source-localizing infection symptoms";
  }
  if (infectionContext && /immunosuppression|pregnancy|hospitalization|procedure|indwelling|travel|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication/.test(allText)) {
    return "Ask host-risk and exposure history";
  }
  if (/\b(?:acute_scrotum|scrotal pain|scrotal_pain|testicular torsion|testicular_torsion|torsion|high-riding|cremasteric|solitary testis|urgent urology|urology care)\b/.test(allText)) {
    if (/^was onset sudden|was onset sudden|urinary symptoms fever trauma or sti exposure/.test(normalized)) {
      return "Ask torsion-associated nausea, swelling, urinary, and trauma features";
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
    return "Ask discharge, dysuria, genital lesions, and STI exposure";
  }
  if (/foot ulcer|foot wound|drainage|protective sensation|amputation|offload|footwear|wound care/.test(allText)) {
    return "Ask diabetic foot wound, neuropathy, and self-care risk";
  }
  if (/rash|mucosal|tongue swelling|skin pain|blistering|purpura|new medication|urticaria|immunocompromise/.test(allText)) {
    return "Ask rash danger features and exposure history";
  }
  if (/sick contacts|covid|flu|strep|ear|sinus|dental|muffled voice|trismus|swallow fluids|heent|throat/.test(allText)) {
    return "Ask HEENT infection exposure and deep-space warning symptoms";
  }
  if ((thyroidContext || /hypothyroid|hypothyroidism/.test(allText))
    && /cold intolerance|fatigue|constipation|dry(?: or coarse)? skin|coarse skin|hoarse voice|slowed thinking|weight gain|heavy menses|hypothyroid|hypothyroidism/.test(allText)) {
    return "Ask hypothyroid symptoms and menstrual pattern";
  }
  if (/hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|transfusion|heavy menses|\b(?:bleeding_anemia|bleeding anemia|gi bleed|gastrointestinal bleeding|anemia|pallor|epistaxis)\b/.test(allText)
    || (/\b(?:anticoagulant|antiplatelet)\b/.test(allText) && /\b(?:bleeding|bruising|hematemesis|melena|hematochezia|epistaxis|transfusion|anemia)\b/.test(allText))) {
    return "Ask bleeding source, severity, and medication risk";
  }
  if (!boneMineralContext && /lithium|demeclocycline|amphotericin|diuretic|sglt2|glucocorticoid|desmopressin|fluid restriction/.test(allText)) {
    return "Review medication and fluid-balance triggers";
  }
  if (/blood-pressure|blood pressure|lipid|kidney-protective|cardiometabolic medications|adherence|adverse-effect concerns/.test(allText)) {
    return "Review cardiometabolic medications and adverse effects";
  }
  if (/usual physical activity level|physical activity level|treatment barriers|function/.test(allText)) {
    return "Ask physical activity level and treatment barriers";
  }
  if (thyroidContext && /prior fna bethesda|bethesda category|fna result|thyroid biopsy/.test(allText)) {
    return "Ask prior thyroid biopsy/FNA category and change";
  }
  if (/current weight trajectory|weight trajectory|changed from baseline/.test(allText)) {
    return "Ask weight trajectory and baseline change";
  }
  if (thyroidContext && /prior fna bethesda|bethesda category|fna result|thyroid biopsy/.test(allText)) {
    return "Ask prior thyroid biopsy/FNA category and change";
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
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  if (text.length <= 80 && commaCount <= 1 && orCount <= 1) {
    return text;
  }
  const firstDetailPrompt = historyQuestionDetailPrompts(text, item.detail_prompts || [])
    .map((prompt) => String(prompt || "")
      .replace(/^(?:Ask specifically about|Ask|Clarify|Review|Confirm|Document|Screen|Localize|Check)\s+/i, "")
      .replace(/[.?]+$/g, "")
      .trim())
    .find(Boolean);
  if (firstDetailPrompt) {
    const trimmed = firstDetailPrompt.length > 64 ? `${firstDetailPrompt.slice(0, 61).trim()}...` : firstDetailPrompt;
    return /^(?:medication|treatment|steroid|anticoagulant|fluid|thyroid|insulin|glucose|calcium|bone|adrenal|pituitary|reproductive|bleeding|infection|respiratory|urinary|skin|wound|line|source|exposure|pregnancy|vision|pain|symptom|risk)/i.test(trimmed)
      ? `Ask ${trimmed}`
      : `Ask ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  }
  const firstClause = text
    .replace(/\?+$/g, "")
    .split(/[.;:]/)[0]
    .replace(/\s+\b(?:and|or)\b\s+.*$/i, "")
    .trim();
  if (firstClause && firstClause.length <= 72) {
    return /^(?:ask|review|clarify|confirm|document|screen|localize|check)\b/i.test(firstClause)
      ? firstClause
      : `Ask ${firstClause.charAt(0).toLowerCase()}${firstClause.slice(1)}`;
  }
  return `${text.slice(0, 76).trim()}...`;
}

function historyQuestionLabelSuffix(item = {}) {
  const fullQuestion = normalizeEvidenceLabel(item.full_question || item.text || item.label || "");
  const tagText = normalizeEvidenceLabel(reportTagText(item.tags, item.retrievalTags, item.matchedTags));
  const allText = `${fullQuestion} ${tagText}`;
  const detailText = normalizeEvidenceLabel((item.detail_prompts || []).join(" "));
  const boneMineralContext = /\b(?:bone and parathyroid|vitamin d|osteomalacia|osteoporosis|osteopenia|hypoparathyroidism|hyperparathyroidism|parathyroid|calcium|pth|phosphorus|kidney stones|nephrocalcinosis)\b/.test(allText);
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
  if (/dysuria|frequency|urgency|hematuria|suprapubic|flank pain|catheter|prior resistant|reduced urine output|renal dysfunction/.test(detailText)) return "urinary/flank symptoms";
  if (/pregnancy is possible|fertility goals?|postpartum|partner factors|medications change safety/.test(detailText)) return "pregnancy/fertility safety";
  if (/urine volume|nocturia|urinary frequency|thirst intensity|access to water|dehydration|confusion/.test(detailText)) return "polyuria/thirst details";
  if (!boneMineralContext && /fatigue|cold intolerance|constipation|dry skin|hoarse voice|slowed thinking|weight gain/.test(fullQuestion)) return "hypothyroid symptoms";
  if (/thyroid hormone|antithyroid drug|amiodarone|lithium|iodine|contrast|biotin/.test(fullQuestion)) return "medications and assay interference";
  if (/neck swelling|rapid growth|thyroid pain|hoarseness|trouble swallowing|positional shortness/.test(fullQuestion)) return "compressive symptoms";
  if (/loud snoring|witnessed apneas|morning headaches|daytime sleepiness|cpap/.test(fullQuestion)) return "sleep apnea symptoms";
  if (/nipple discharge|breast tenderness|prolactin/.test(fullQuestion)) return "prolactin symptoms/medications";
  const detail = (item.detail_prompts || [])
    .map((prompt) => String(prompt || "")
      .replace(/^Ask specifically about\s+/i, "")
      .replace(/^Review\s+/i, "")
      .replace(/[.?]+$/g, "")
      .trim())
    .find(Boolean);
  if (detail) {
    return detail.length > 36 ? `${detail.slice(0, 33).trim()}...` : detail;
  }
  const firstWords = String(item.full_question || item.text || item.label || "")
    .replace(/\?+$/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
  return firstWords || "source question";
}

function uniquifyHistoryQuestionLabels(items = []) {
  const buckets = new Map();
  items.forEach((item) => {
    const key = normalizeEvidenceLabel(item.label || item.text || item.full_question || "");
    if (!key) return;
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  });
  const used = new Set();
  return items.map((item) => {
    const originalLabel = item.label || item.text || item.full_question || "";
    const key = normalizeEvidenceLabel(originalLabel);
    let label = originalLabel;
    if (key && (buckets.get(key) || []).length > 1) {
      label = `${originalLabel} - ${historyQuestionLabelSuffix(item)}`;
    }
    let uniqueLabel = label;
    let counter = 2;
    while (used.has(normalizeEvidenceLabel(uniqueLabel))) {
      uniqueLabel = `${label} ${counter}`;
      counter += 1;
    }
    used.add(normalizeEvidenceLabel(uniqueLabel));
    return { ...item, label: uniqueLabel };
  });
}

function historyQuestionText(item = {}) {
  return String(item.full_question || item.text || item.label || item.displayBedsideQuestion || "").replace(/\s+/g, " ").trim();
}

function historyQuestionAtomicityIssues(item = {}) {
  const text = historyQuestionText(item);
  const normalized = normalizeEvidenceLabel(text);
  if (!normalized) {
    return [];
  }
  const issues = [];
  if (/\bheat intolerance sweating cold intolerance dry skin constipation tremor slowed thinking\b/i.test(text)) {
    issues.push({ severity: "high", type: "unpunctuated_history_symptom_chain", detail: text });
  }
  if (/\bneck mass growth\b[\s\S]*\b(?:pregnancy|postpartum|amiodarone|lithium|biotin|medication adherence)\b/i.test(text)
    || /\bradiation exposure\b[\s\S]*\b(?:pregnancy|postpartum|amiodarone|lithium|biotin|medication adherence)\b/i.test(text)
    || /\bfamily thyroid cancer\b[\s\S]*\b(?:pregnancy|postpartum|amiodarone|lithium|biotin|thyroid medication)\b/i.test(text)) {
    issues.push({ severity: "high", type: "cross_domain_bundled_history_question", detail: text });
  }
  if (/abdominal,\s*CNS,\s*skin,\s*line,\s*joint,\s*or\s*spine source features/i.test(text)) {
    issues.push({ severity: "high", type: "stale_bundled_infection_source_history", detail: text });
  }
  if (/vitals and acuity screen/i.test(text)
    || /\bBP,\s*HR,\s*respiratory status,\s*temperature\b/i.test(text)) {
    issues.push({ severity: "high", type: "safety_bundle_as_history_question", detail: text });
  }
  const generatedDetailPrompts = historyQuestionDetailPrompts(text, item.detail_prompts || []);
  if (historyQuestionNeedsDetailPrompts(item) && !generatedDetailPrompts.length) {
    issues.push({ severity: "high", type: "missing_history_detail_prompts", detail: text });
  }
  return issues;
}

function moduleLimitationBaseLabel(item = {}) {
  const itemType = String([
    item.item_type,
    item.gap_type,
    item.role,
    item.id,
    item.exam_id,
    item.traceability?.item_group,
    ...(item.tags || [])
  ].filter(Boolean).join(" ")).toLowerCase();
  const text = item.text || item.label || "";
  const isHistory = itemType.includes("history") || itemType === "question" || /^REQ-.*history/i.test(String(item.id || item.exam_id || ""));
  if (isHistory) {
    return conciseHistoryQuestionLabel({ ...item, text });
  }
  const primaryLabel = compactLimitationBaseLabel(moduleItemLabel(item), itemType);
  if (!genericLimitationBaseLabel(primaryLabel)) {
    return primaryLabel;
  }
  const fallbackLabel = [
    item.management_change,
    item.management_implication,
    item.action,
    item.diagnostic_target,
    item.rationale,
    item.reason,
    item.limitation,
    item.interpretation_cautions,
    item.limitations
  ]
    .map((candidate) => compactLimitationBaseLabel(candidate, ""))
    .find((candidate) => candidate && !genericLimitationBaseLabel(candidate));
  return fallbackLabel || primaryLabel;
}

function genericLimitationBaseLabel(label = "") {
  const text = String(label || "").trim();
  const normalized = normalizeEvidenceLabel(text);
  return /^(?:diagnostic test\/reference interpretation|red-flag interpretation|management implication|focused history question|linked workup item|differential-frame interpretation)$/i
    .test(text)
    || /^(?:diagnostic test reference interpretation|red flag interpretation|management implication|focused history question|linked workup item|differential frame interpretation)$/i
      .test(normalized);
}

function compactLimitationBaseLabel(label = "", itemType = "") {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const typeText = String(itemType || "");
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
  const firstComponent = text.split(/\s*,\s*|\s+\bor\b\s+/i)[0]?.trim() || "";
  if ((commaCount >= 2 || orCount >= 3) && firstComponent.length >= 4 && firstComponent.length <= 90) {
    return firstComponent;
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
  if (commaCount >= 2 || orCount >= 3) {
    return "differential-frame interpretation";
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

function compactManagementBaseLabel(label = "") {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  if (text.length <= 260 && commaCount < 10 && orCount < 7) {
    return text;
  }
  const head = text
    .replace(/\s*;\s*[\s\S]*$/g, "")
    .trim();
  if (head.length >= 12 && head.length <= 260) {
    return head;
  }
  const contextLead = text.match(/^(?:for|before)\s+([^,]{2,50}),\s*([\s\S]+)$/i);
  if (contextLead) {
    const action = contextLead[2].replace(/\s*;\s*[\s\S]*$/g, "").trim();
    if (action.length >= 12 && action.length <= 180) {
      return `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
    }
  }
  const firstComponent = (text.split(/\s*;\s*|\s+\band\s+|\s+\bor\s+/i)[0] || "")
    .replace(/[,:;]\s*$/g, "")
    .trim();
  if (firstComponent.length >= 12 && firstComponent.length <= 260) {
    return firstComponent;
  }
  return text;
}

function managementBaseLabelLooksComplete(label = "") {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  return Boolean(text)
    && !/^management implication$/i.test(text)
    && !/[,:;]\s*$/.test(text)
    && !/\.\.\.$/.test(text);
}

const managementExamActionLabelPattern = /^(?:auscultate|inspect|palpate|percuss|observe|test|measure|count|use otoscope)\b/i;

function managementLabelCandidatesForStructuredFinding(entry = {}, rawLabel = "") {
  const strippedRawLabel = String(rawLabel || "").replace(/^management implication\s*-\s*/i, "");
  const preferredResultLabels = [
    entry.managementChange,
    entry.management_change,
    entry.managementImplication,
    entry.management_implication,
    entry.displayManagement
  ];
  const rawLabelCandidates = [
    strippedRawLabel,
    entry.action,
    entry.reason,
    entry.rationale,
    entry.diagnosticTarget,
    entry.diagnostic_target
  ];
  return managementExamActionLabelPattern.test(strippedRawLabel)
    ? [...preferredResultLabels, ...rawLabelCandidates]
    : [...rawLabelCandidates, ...preferredResultLabels];
}

function moduleLimitationDisplayLabel(item = {}) {
  const baseLabel = moduleLimitationBaseLabel(item) || "linked workup item";
  return /^interpretation caution\b/i.test(String(baseLabel || ""))
    ? baseLabel
    : `Interpretation caution - ${baseLabel}`;
}

function stripInterpretationCautionPrefix(label = "") {
  return String(label || "")
    .replace(/^interpretation caution\s*[-:]\s*/i, "")
    .trim();
}

function limitationReportLabelKey(label = "") {
  return normalizeEvidenceLabel(label)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limitationLabelLooksSpecific(label = "") {
  const text = stripInterpretationCautionPrefix(label);
  return Boolean(text)
    && !genericLimitationBaseLabel(text)
    && !/[,:;]\s*$/.test(text)
    && !/\.\.\.$/.test(text);
}

function limitationSpecificLabelCandidates(entry = {}) {
  return [
    entry.diagnostic_purpose,
    entry.diagnosticPurpose,
    entry.diagnostic_target,
    entry.diagnosticTarget,
    entry.management_implication,
    entry.managementImplication,
    entry.management_change,
    entry.managementChange,
    entry.reason,
    entry.limitation,
    entry.interpretationCaution,
    entry.interpretation_cautions,
    entry.limitations,
    entry.source,
    entry.evidence,
    entry.exam_id,
    entry.trace_item_id,
    entry.traceability?.item_id
  ];
}

function specificLimitationBaseLabel(entry = {}, fallback = "") {
  const rawBase = stripInterpretationCautionPrefix(entry.label || fallback || "");
  if (limitationLabelLooksSpecific(rawBase)) {
    return rawBase;
  }
  return limitationSpecificLabelCandidates(entry)
    .map((candidate) => compactLimitationBaseLabel(candidate, entry.role || entry.item_type || ""))
    .find((candidate) => limitationLabelLooksSpecific(candidate))
    || rawBase
    || "linked workup item";
}

function limitationLabelDifferentiator(entry = {}, baseLabel = "") {
  const baseKey = limitationReportLabelKey(stripInterpretationCautionPrefix(baseLabel));
  return limitationSpecificLabelCandidates(entry)
    .map((candidate) => compactLimitationBaseLabel(candidate, entry.role || entry.item_type || ""))
    .find((candidate) => {
      const key = limitationReportLabelKey(candidate);
      return limitationLabelLooksSpecific(candidate)
        && key
        && key !== baseKey
        && !baseKey.includes(key)
        && !key.includes(baseKey);
    })
    || compactLimitationBaseLabel(entry.exam_id || entry.trace_item_id || entry.traceability?.item_id || "", "")
    || "";
}

function limitationStableSuffix(entry = {}) {
  return compactLimitationBaseLabel(entry.exam_id || entry.trace_item_id || entry.traceability?.item_id || "", "")
    || "linked item";
}

function uniquifyLimitationReportLabels(rows = []) {
  const preparedRows = rows.map((row) => ({
    row,
    baseLabel: specificLimitationBaseLabel(row)
  }));
  const baseCounts = new Map();
  preparedRows.forEach(({ baseLabel }) => {
    const key = limitationReportLabelKey(baseLabel);
    if (!key) return;
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
  });
  const emitted = new Map();
  return preparedRows.map(({ row, baseLabel }) => {
    const baseKey = limitationReportLabelKey(baseLabel);
    let displayBase = baseLabel || "linked workup item";
    if ((baseCounts.get(baseKey) || 0) > 1 || genericLimitationBaseLabel(displayBase)) {
      const differentiator = limitationLabelDifferentiator(row, displayBase);
      if (differentiator && limitationReportLabelKey(differentiator) !== baseKey) {
        const differentiatedLabel = `Interpretation caution - ${displayBase} - ${differentiator}`;
        displayBase = differentiatedLabel.length <= 140
          ? `${displayBase} - ${differentiator}`
          : `${displayBase} - ${limitationStableSuffix(row)}`;
      } else {
        displayBase = `${displayBase} - ${limitationStableSuffix(row)}`;
      }
    }
    let label = /^interpretation caution\b/i.test(displayBase)
      ? displayBase
      : `Interpretation caution - ${displayBase}`;
    let emittedKey = limitationReportLabelKey(label);
    const priorCount = emitted.get(emittedKey) || 0;
    if (priorCount) {
      const stableSuffix = compactLimitationBaseLabel(row.exam_id || row.trace_item_id || row.traceability?.item_id || `item ${priorCount + 1}`, "");
      label = `${label} - ${stableSuffix}`;
      emittedKey = limitationReportLabelKey(label);
    }
    emitted.set(emittedKey, (emitted.get(emittedKey) || 0) + 1);
    return { ...row, label };
  });
}

function moduleManagementDisplayLabel(item = {}) {
  const itemType = String([
    item.item_type,
    item.gap_type,
    item.role,
    item.id,
    item.exam_id,
    item.traceability?.item_group,
    ...(item.tags || [])
  ].filter(Boolean).join(" ")).toLowerCase();
  const baseLabel = [
    moduleItemLabel(item),
    item.management_change,
    item.action,
    item.management_implication,
    item.reason,
    item.rationale
  ]
    .map((candidate) => compactManagementBaseLabel(candidate))
    .find((candidate) => managementBaseLabelLooksComplete(candidate))
    || "linked workup item";
  return /^management implication\s+-\s+/i.test(String(baseLabel || ""))
    ? baseLabel
    : `Management implication - ${baseLabel}`;
}

function summarizeModuleLimitation(item, intentRow = {}) {
  const source = moduleSourceForItem(item);
  const lrPlus = item.LR_plus || item.lr_plus || "n/a";
  const lrMinus = item.LR_minus || item.lr_minus || "n/a";
  const lrNote = item.likelihood_ratio_note || item.LR_note || item.lr_note || "Likelihood ratios are not available or not applicable for this installed guideline-module item; use the cited guideline/source context and management implication.";
  const limitation = item.limitation || item.interpretation_cautions || item.limitations || "";
  const diagnosticPurpose = item.diagnostic_purpose || item.diagnostic_target || limitation;
  const managementImplication = item.management_implication || item.management_change || item.action || "";
  return withFlatTraceabilityFields({
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: moduleLimitationDisplayLabel(item),
    role: "limitation",
    reason: limitation,
    diagnostic_purpose: diagnosticPurpose,
    diagnostic_target: item.diagnostic_target || diagnosticPurpose,
    management_implication: managementImplication,
    management_change: item.management_change || item.action || managementImplication,
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    limitations: limitation,
    tags: item.tags || [],
    routes: ["installed_guideline_module"],
    traceability: reportTraceabilityForModuleExport(item, intentRow, "limitation")
  });
}

function moduleTraceIdsForItem(item = {}) {
  const value = item.traceability?.intent_ids || item.validatedIntentIds || [];
  return Array.isArray(value)
    ? value
    : String(value || "").split(/[;|]/).map((entry) => entry.trim()).filter(Boolean);
}

function reportTraceabilityForModuleExport(item = {}, intentRow = {}, role = "") {
  const moduleRoutes = uniqueReportValues([item.traceability?.routes, item.traceability?.retrieval_routes, "installed_guideline_module", role]);
  if (item.traceability) {
    return reportTraceabilityForEntry({
      ...item,
      traceability: {
        ...item.traceability,
        routes: moduleRoutes
      }
    }, {
      intent_ids: [intentRow.intent_id],
      source_ids: [moduleSourceForItem(item), ...(intentRow.source_ids || [])],
      authorized_by: item.traceability.authorized_by || "validated_clinical_intent",
      item_id: item.id || "",
      routes: moduleRoutes
    });
  }
  return reportTraceabilityForModuleItem(item, intentRow, role);
}

function evaluateModuleBackedIntent(intentRow, args) {
  const module = complaintModuleById.get(intentRow.complaint_module_id || "");
  if (!module) {
    return {
      intent_id: intentRow.intent_id,
      label: intentRow.label,
      status: intentRow.status,
      required_domains: intentRow.required_domains || [],
      avoid_labels: intentRow.avoid_labels || [],
      context: "",
      matched_tags: [],
      active_bundles: intentRow.clinical_bundle_ids || [],
      counts: { safety: 0, history: 0, core: 0, conditional: 0, tests: 0, red_flags: 0, management: 0, limitations: 0, evidence_metadata: 0, catalog_gaps: 0, retrieved: 0, suppressed: 0, issues: 1, review_notes: 0 },
      safety: [],
      history: [],
      core: [],
      conditional: [],
      tests: [],
      red_flags: [],
      management_changes: [],
      limitations: [],
      evidence_metadata: [],
      catalog_gaps: [],
      differential: [],
      top_retrieved: [],
      high_score_suppressed: [],
      suppressed: [],
      missing_required_domains: [],
      avoid_hits: [],
      duplicate_labels: [],
      missing_evidence: [],
      quality_issues: [],
      issues: [{ severity: "high", type: "missing_complaint_module", detail: intentRow.complaint_module_id || "blank" }],
      review_notes: [],
      pass: false
    };
  }

  const context = [
    args.setting,
    args.population,
    module.label,
    args.modifiers
  ].filter(Boolean).join(" ");
  const result = evaluateComplaintCds(context, {}, {
    module,
    sources: complaintSourceRegistry,
    validatedIntents: [intentRow]
  });
  const safety = result.safetyChecks || [];
  const history = [...(result.requiredQuestions || []), ...(result.conditionalQuestions || [])];
  const core = result.requiredExam || [];
  const conditional = result.conditionalExam || [];
  const tests = result.initialTests || [];
  const redFlags = result.redFlags || [];
  const managementChanges = result.dispositionRules || [];
  const interpretationCautions = result.limitationsAndInterpretationCautions || [];
  const differential = result.differentialBuckets || [];
  const catalogGaps = result.catalogGapsNeedingReview || result.catalogGaps || [];
  const suppressed = result.suppressedNotRecommendedItems || result.suppressedItems || [];
  const recommended = [...safety, ...core, ...conditional];
  const missingRequiredDomains = (intentRow.required_domains || [])
    .filter((domain) => conditionalRequiredDomainIsTriggered(domain, context))
    .filter((domain) => !moduleRequiredDomainSatisfied(domain, result));
  const avoidHits = avoidHitLabels(intentRow.avoid_labels || [], recommended.map((item) => ({ label: moduleItemLabel(item), candidate: item })));
  const duplicateLabels = repeatedLabels(recommended.map((item) => ({ label: moduleItemLabel(item), candidate: item })));
  const sourceChecked = [...safety, ...history, ...core, ...conditional, ...tests, ...redFlags, ...managementChanges, ...differential];
  const missingEvidence = sourceChecked.filter((item) => !moduleSourceForItem(item)).map(moduleItemLabel);
  const issues = [];
  if (!result.matched) issues.push({ severity: "high", type: "module_not_matched", detail: module.id });
  if (!safety.length) issues.push({ severity: "high", type: "no_basic_safety_checks", detail: "No basic bedside data or safety checks were recommended." });
  if (!history.length) issues.push({ severity: "high", type: "no_focused_history", detail: "No focused history questions were recommended." });
  if (!core.length && !conditional.length) issues.push({ severity: "high", type: "no_core_exam", detail: "No physical exam maneuvers were recommended." });
  if ((core.length + conditional.length) === 1 && !hasExamScopeCaution(interpretationCautions)) {
    issues.push({
      severity: "high",
      type: "thin_exam_without_scope_note",
      detail: "Only one true physical exam maneuver was recommended and no source-backed exam-scope caution explains why broader exam add-ons are not appropriate."
    });
  }
  if (!tests.length) issues.push({ severity: "high", type: "no_tests", detail: "No tests/reference thresholds were available." });
  if (!redFlags.length) issues.push({ severity: "high", type: "no_red_flags", detail: "No red flags/escalation cues were available." });
  if (!managementChanges.length) issues.push({ severity: "high", type: "no_management_changes", detail: "No management-changing findings were available." });
  if (!interpretationCautions.length) issues.push({ severity: "high", type: "no_limitations", detail: "No limitations or interpretation cautions were available." });
  missingRequiredDomains.forEach((domain) => issues.push({ severity: "high", type: "missing_required_domain", detail: domain }));
  attendingBaselineIssuesForModule(intentRow, module, result)
    .forEach((issue) => issues.push({ severity: "high", type: "attending_baseline_gap", detail: issue }));
  avoidHits.forEach((hit) => issues.push({ severity: "high", type: "avoid_hit", detail: hit }));
  duplicateLabels.forEach((label) => issues.push({ severity: "medium", type: "duplicate_label", detail: label }));
  missingEvidence.forEach((label) => issues.push({ severity: "medium", type: "missing_source", detail: label }));
  safety.forEach((item) => {
    if (!isBasicBedsideDataItem(item)) {
      issues.push({ severity: "medium", type: "safety_shape", detail: `${moduleItemLabel(item)} is not recognizable as basic bedside data.` });
    }
    if (genericFindingsOptions(moduleItemFindingsOptions(item))) {
      issues.push({ severity: "high", type: "generic_safety_findings_options", detail: moduleItemLabel(item) });
    }
  });
  [...core, ...conditional].forEach((item) => {
    if (isBasicBedsideDataItem(item)) {
      issues.push({ severity: "high", type: "vitals_in_exam", detail: moduleItemLabel(item) });
    }
    moduleExamAtomicityIssues(item).forEach((issue) => issues.push(issue));
    if (!moduleItemTechnique(item)) {
      issues.push({ severity: "high", type: "missing_exam_technique", detail: moduleItemLabel(item) });
    }
    if (genericFindingsOptions(moduleItemFindingsOptions(item))) {
      issues.push({ severity: "high", type: "generic_exam_findings_options", detail: moduleItemLabel(item) });
    }
    if (!moduleItemDiagnosticTarget(item)) {
      issues.push({ severity: "high", type: "missing_exam_diagnostic_target", detail: moduleItemLabel(item) });
    }
    if (!moduleItemManagementChange(item)) {
      issues.push({ severity: "high", type: "missing_exam_management_change", detail: moduleItemLabel(item) });
    }
    if (!moduleItemLimitations(item)) {
      issues.push({ severity: "medium", type: "missing_exam_limitations", detail: moduleItemLabel(item) });
    }
    if (!moduleItemFeasibilityComplete(item)) {
      issues.push({ severity: "medium", type: "missing_exam_feasibility", detail: moduleItemLabel(item) });
    }
    if (!moduleItemHasLikelihoodRatioFields(item)) {
      issues.push({ severity: "medium", type: "missing_exam_lr_fields", detail: moduleItemLabel(item) });
    }
    if (!moduleItemLikelihoodRatioNote(item)) {
      issues.push({ severity: "medium", type: "missing_exam_lr_note", detail: moduleItemLabel(item) });
    }
    if (!moduleItemTags(item)) {
      issues.push({ severity: "medium", type: "missing_exam_tags", detail: moduleItemLabel(item) });
    }
  });
  if (!suppressed.length) {
    issues.push({ severity: "medium", type: "missing_suppressed_items", detail: "No suppressed/not-recommended items were exported for this validated intent." });
  }
  suppressed.forEach((item) => {
    const label = moduleItemLabel(item);
    if (!moduleTraceIdsForItem(item).includes(intentRow.intent_id)) {
      issues.push({ severity: "medium", type: "suppressed_missing_validated_intent_trace", detail: label });
    }
    if (!moduleSourceForItem(item)) {
      issues.push({ severity: "medium", type: "suppressed_missing_source", detail: label });
    }
    if (!moduleItemManagementChange(item)) {
      issues.push({ severity: "medium", type: "suppressed_missing_management_reason", detail: label });
    }
    if (!item.reason && !item.suppressionReason) {
      issues.push({ severity: "medium", type: "suppressed_missing_reason", detail: label });
    }
    if (!moduleItemHasLikelihoodRatioFields(item)) {
      issues.push({ severity: "medium", type: "suppressed_missing_lr_fields", detail: label });
    }
    if (!moduleItemLikelihoodRatioNote(item)) {
      issues.push({ severity: "medium", type: "suppressed_missing_lr_note", detail: label });
    }
    if (!moduleItemTags(item)) {
      issues.push({ severity: "medium", type: "suppressed_missing_tags", detail: label });
    }
  });
  history.forEach((item) => {
    const label = moduleItemLabel(item);
    historyQuestionAtomicityIssues(item).forEach((issue) => issues.push(issue));
    if (!item.text) {
      issues.push({ severity: "high", type: "missing_history_text", detail: label });
    }
    if (!Array.isArray(item.options) || !item.options.length) {
      issues.push({ severity: "medium", type: "missing_history_options", detail: label });
    }
    if (!moduleItemDiagnosticTarget(item)) {
      issues.push({ severity: "high", type: "missing_history_diagnostic_purpose", detail: label });
    }
    if (!moduleItemManagementChange(item)) {
      issues.push({ severity: "high", type: "missing_history_management_change", detail: label });
    }
    if (!moduleItemTags(item)) {
      issues.push({ severity: "medium", type: "missing_history_tags", detail: label });
    }
  });
  sourceChecked.forEach((item) => {
    if (!moduleTraceIdsForItem(item).includes(intentRow.intent_id)) {
      issues.push({ severity: "medium", type: "missing_validated_intent_trace", detail: moduleItemLabel(item) });
    }
  });
  const blockingIssues = issues.filter((issue) => issue.severity !== "review");
  const reviewNotes = issues.filter((issue) => issue.severity === "review");
  const readiness = moduleReadinessFromIssues(issues, catalogGaps);
  const conditionalExamAddOnStatus = conditionalExamAddOnStatusForReport(intentRow, conditional, catalogGaps, context);
  const historyRows = uniquifyHistoryQuestionLabels(history.map((entry) => summarizeQuestionItem(entry, intentRow)));
  return {
    intent_id: intentRow.intent_id,
    label: intentRow.label,
    status: intentRow.status,
    required_domains: intentRow.required_domains || [],
    avoid_labels: intentRow.avoid_labels || [],
    context,
    matched_tags: intentRow.evidence_tags || [],
    active_bundles: intentRow.clinical_bundle_ids || [],
    module_id: module.id,
    module_label: module.label,
    source_ids: uniqueReportSourceIds([result.sourceIds, intentRow.source_ids]),
    counts: {
      safety: safety.length,
      history: history.length,
      core: core.length,
      conditional: conditional.length,
      tests: tests.length,
      red_flags: redFlags.length,
      management: managementChanges.length,
      limitations: interpretationCautions.length,
      evidence_metadata: sourceChecked.length,
      catalog_gaps: catalogGaps.length,
      retrieved: sourceChecked.length,
      suppressed: suppressed.length,
      issues: blockingIssues.length,
      review_notes: reviewNotes.length
    },
    readiness,
    readiness_status: readiness.status,
    readiness_label: readiness.label,
    complete_validated_workup: readiness.completeValidatedWorkup,
    section_statuses: {
      conditional_exam_addons: conditionalExamAddOnStatus,
      conditionalPhysicalExamManeuvers: conditionalExamAddOnStatus
    },
    conditional_exam_addon_status: conditionalExamAddOnStatus,
    safety: safety.map((entry) => summarizeModuleItem(entry, "safety", intentRow)),
    history: historyRows,
    core: core.map((entry) => summarizeModuleItem(entry, "core", intentRow)),
    conditional: conditional.map((entry) => summarizeModuleItem(entry, "conditional", intentRow)),
    tests: tests.map((entry) => summarizeModuleItem(entry, "test", intentRow)),
    red_flags: redFlags.map((entry) => summarizeModuleItem(entry, "red_flag", intentRow)),
    management_changes: managementChanges.map((entry) => summarizeModuleItem(entry, "management", intentRow)),
    limitations: uniquifyLimitationReportLabels(interpretationCautions.map((entry) => summarizeModuleLimitation(entry, intentRow))),
    evidence_metadata: sourceChecked.map((entry) => summarizeModuleItem(entry, "evidence", intentRow)),
    catalog_gaps: catalogGaps.map(summarizeCatalogGap),
    differential: differential.map((entry) => summarizeModuleItem(entry, "differential", intentRow)),
    top_retrieved: sourceChecked.slice(0, 16).map((entry) => summarizeModuleItem(entry, entry.item_type || "", intentRow)),
    high_score_suppressed: [],
    suppressed: suppressed.map((entry) => summarizeModuleItem(entry, "suppressed", intentRow)),
    missing_required_domains: missingRequiredDomains,
    avoid_hits: avoidHits,
    duplicate_labels: duplicateLabels,
    missing_evidence: missingEvidence,
    quality_issues: [],
    issues: blockingIssues,
    review_notes: reviewNotes,
    pass: readiness.completeValidatedWorkup && !blockingIssues.some((issue) => issue.severity === "high")
  };
}

function evaluateIntent(intentRow, fixtures, args) {
  if (moduleBackedIntent(intentRow)) {
    return evaluateModuleBackedIntent(intentRow, args);
  }
  const selectedIntents = selectedValidatedClinicalIntents([intentRow.intent_id], clinicalIntentRegistry);
  const context = buildClinicalIntentRetrievalContext(selectedIntents, args.modifiers, args.setting, args.population);
  const filteredCatalog = filterEvidenceCatalogForClinicalIntents(fixtures.catalog, selectedIntents);
  const ranked = rankEvidenceCandidates(filteredCatalog, context, fixtures.tagRows, {
    maxCandidates: args.maxCandidates,
    specialty: args.setting
  });
  const recommendation = buildRecommendedExamChecklist(context, ranked, {
    specialty: args.setting,
    maxCoreItems: args.maxCoreItems,
    maxConditionalItems: args.maxConditionalItems,
    validatedIntents: selectedIntents,
    catalogGapRegistryRows: fixtures.gapRows || []
  });
  const safety = recommendation.basicSafetyChecks || [];
  const history = recommendation.focusedHistoryQuestions || [];
  const tests = recommendation.initialTestsAndReferenceThresholds || [];
  const redFlags = recommendation.redFlagsAndEscalationCues || [];
  const core = recommendation.corePhysicalExamManeuvers || recommendation.coreItems || [];
  const conditional = recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || [];
  const managementChanges = recommendation.managementChangingFindings || [];
  const interpretationCautions = recommendation.limitationsAndInterpretationCautions || [];
  const evidenceMetadata = recommendation.evidenceAndLikelihoodMetadata || [];
  const catalogGaps = recommendation.catalogGapsNeedingReview || [];
  const recommended = [...safety, ...core, ...conditional];
  const recommendationText = [
    history.map(entryText).join(" "),
    recommended.map(entryText).join(" "),
    tests.map(entryText).join(" "),
    redFlags.map(entryText).join(" "),
    managementChanges.map(entryText).join(" "),
    (recommendation.catalogGaps || []).map(entryText).join(" "),
    (recommendation.warnings || []).join(" ")
  ].join(" ");
  const missingRequiredDomains = (intentRow.required_domains || [])
    .filter((domain) => conditionalRequiredDomainIsTriggered(domain, context))
    .filter((domain) => !requiredDomainSatisfied(domain, recommendationText));
  const avoidHits = avoidHitLabels(intentRow.avoid_labels || [], recommended);
  const duplicateLabels = repeatedLabels(recommended);
  const missingEvidence = recommended.filter((entry) => {
    const candidate = entry.candidate || entry;
    return !candidate.evidence_source_primary && !candidate.source_citation;
  }).map(entryLabel);
  const qualityIssues = recommendation.qualityIssues || [];
  const highScoreSuppressed = (recommendation.suppressedItems || [])
    .filter((entry) => Number(entry.candidate?.score || 0) >= 90)
    .filter((entry) => !/replaced by the validated .* safety-floor item/i.test(entry.reason || entry.suppressionReason || ""))
    .filter((entry) => !clinicallySpecificSuppressionReason(entry.reason || entry.suppressionReason || ""))
    .slice(0, 8)
    .map((entry) => ({
      label: entryLabel(entry),
      score: Math.round(entry.candidate?.score || 0),
      reason: entry.reason || "suppressed"
    }));
  const issues = [];
  if (!safety.length) issues.push({ severity: "high", type: "no_basic_safety_checks", detail: "No basic bedside data or safety checks were recommended." });
  if (!history.length) issues.push({ severity: "high", type: "no_focused_history", detail: "No focused history questions were recommended." });
  if (!core.length) issues.push({ severity: "high", type: "no_core_exam", detail: "No core physical exam maneuvers were recommended." });
  if ((core.length + conditional.length) === 1 && !hasExamScopeCaution(interpretationCautions)) {
    issues.push({
      severity: "high",
      type: "thin_exam_without_scope_note",
      detail: "Only one true physical exam maneuver was recommended and no source-backed exam-scope caution explains why broader exam add-ons are not appropriate."
    });
  }
  if (!tests.length) issues.push({ severity: "review", type: "tests_reference_gap", detail: "No accepted tests/reference thresholds are available; keep this workup out of the complete-ready bucket until reviewed content is added." });
  if (!redFlags.length) issues.push({ severity: "review", type: "red_flag_gap", detail: "No accepted red flags/escalation cues are available; keep this workup out of the complete-ready bucket until reviewed content is added." });
  if (catalogGaps.length) issues.push({ severity: "review", type: "staged_catalog_gaps", detail: `${catalogGaps.length} staged catalog gap(s) remain unresolved and reviewer-only.` });
  missingRequiredDomains.forEach((domain) => issues.push({ severity: "high", type: "missing_required_domain", detail: domain }));
  avoidHits.forEach((hit) => issues.push({ severity: "high", type: "avoid_hit", detail: hit }));
  duplicateLabels.forEach((label) => issues.push({ severity: "medium", type: "duplicate_label", detail: label }));
  if (core.length > 14) issues.push({ severity: "medium", type: "high_burden", detail: `${core.length} core items may be too many for routine bedside use.` });
  missingEvidence.forEach((label) => issues.push({ severity: "medium", type: "missing_source", detail: label }));
  qualityIssues.forEach((issue) => {
    issues.push({
      severity: issue.severity === "high" ? "high" : "medium",
      type: `quality_${issue.type}`,
      detail: `${issue.section || "workup"}: ${issue.label || issue.exam_id || "item"} - ${issue.detail}`
    });
  });
  history.forEach((entry) => {
    historyQuestionAtomicityIssues(entry).forEach((issue) => issues.push(issue));
  });
  safety.forEach((entry) => {
    const candidate = entry.candidate || entry;
    const options = entry.options || entry.findings_options || candidate.examOptions || candidate.findings_options || "";
    if (genericFindingsOptions(options)) {
      issues.push({ severity: "high", type: "generic_safety_findings_options", detail: entryLabel(entry) });
    }
  });
  [...core, ...conditional].forEach((entry) => {
    const candidate = entry.candidate || entry;
    const options = entry.options || entry.findings_options || candidate.examOptions || candidate.findings_options || "";
    if (genericFindingsOptions(options)) {
      issues.push({ severity: "high", type: "generic_exam_findings_options", detail: entryLabel(entry) });
    }
  });
  highScoreSuppressed.forEach((item) => issues.push({ severity: "review", type: "high_score_suppressed", detail: `${item.label} (${item.score}): ${item.reason}` }));
  const blockingIssues = issues.filter((issue) => issue.severity !== "review");
  const reviewNotes = issues.filter((issue) => issue.severity === "review");
  const readiness = fallbackReadinessFromRecommendation(recommendation, catalogGaps, qualityIssues);
  const conditionalExamAddOnStatus = recommendation.conditionalExamAddOnStatus
    || conditionalExamAddOnStatusForReport(intentRow, conditional, catalogGaps, context);
  const historyRows = uniquifyHistoryQuestionLabels(history.map((entry) => {
    const traceability = reportTraceabilityForEntry(entry);
    const source = firstReportText(entry.source, entry.evidence?.source, entry.candidate?.source_citation, (traceability.source_ids || []).join("; "));
    const lrPlus = entry.evidence?.LR_plus || entry.LR_plus || entry.lr_plus || "n/a";
    const lrMinus = entry.evidence?.LR_minus || entry.LR_minus || entry.lr_minus || "n/a";
    const lrNote = entry.evidence?.likelihood_ratio_note
      || entry.likelihood_ratio_note
      || entry.lr_note
      || "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize the source, assess severity, and guide management.";
    const diagnosticPurpose = entry.diagnosticPurpose || entry.diagnostic_purpose || entry.reason || "";
    const managementImplication = entry.managementImplication || entry.management_implication || entry.management_change || "";
    return withFlatTraceabilityFields({
      exam_id: entry.exam_id || entry.candidate?.exam_id || "",
      label: entry.displayLabel || entry.text || "",
      text: entry.fullQuestion || entry.text || "",
      full_question: entry.fullQuestion || entry.text || "",
      role: "history",
      reason: diagnosticPurpose,
      diagnostic_purpose: diagnosticPurpose,
      management_implication: managementImplication,
      management_change: managementImplication,
      options: moduleHistoryOptionText(entry.options || entry.answer_options || entry.answerOptions || entry.displayBedsideQuestionOptions || entry.candidate?.bedside_question_options || ""),
      evidence: source,
      source,
      LR_plus: lrPlus,
      LR_minus: lrMinus,
      lr_plus: lrPlus,
      lr_minus: lrMinus,
      likelihood_ratio_note: lrNote,
      lr_note: lrNote,
      when_to_ask: firstReportText(entry.whenToAsk, entry.when_to_ask, entry.candidate?.when_to_use_structured),
      tags: reportTagText(entry.tags, entry.retrievalTags, entry.matchedTags, entry.candidate?.tags, entry.candidate?.retrieval_tags),
      detail_prompts: entry.detail_prompts || [],
      traceability
    });
  }));
  return {
    intent_id: intentRow.intent_id,
    label: intentRow.label,
    status: intentRow.status,
    required_domains: intentRow.required_domains || [],
    avoid_labels: intentRow.avoid_labels || [],
    context,
    matched_tags: ranked.matchedTags.map((match) => match.tag),
    source_ids: uniqueReportSourceIds([intentRow.source_ids]),
    active_bundles: (recommendation.activeProfiles || []).map((profile) => profile.id || profile.name),
    counts: {
      safety: safety.length,
      history: history.length,
      core: core.length,
      conditional: conditional.length,
      tests: tests.length,
      red_flags: redFlags.length,
      management: managementChanges.length,
      limitations: interpretationCautions.length,
      evidence_metadata: evidenceMetadata.length,
      catalog_gaps: catalogGaps.length,
      retrieved: ranked.candidates.length,
      suppressed: (recommendation.suppressedItems || []).length,
      issues: blockingIssues.length,
      review_notes: reviewNotes.length
    },
    readiness,
    readiness_status: readiness.status,
    readiness_label: readiness.label,
    complete_validated_workup: readiness.completeValidatedWorkup,
    section_statuses: {
      ...(recommendation.sectionStatuses || {}),
      conditional_exam_addons: conditionalExamAddOnStatus,
      conditionalPhysicalExamManeuvers: conditionalExamAddOnStatus
    },
    conditional_exam_addon_status: conditionalExamAddOnStatus,
    safety: safety.map((entry) => summarizeEntry(entry, "safety")),
    history: historyRows,
    core: core.map((entry) => summarizeEntry(entry, "core")),
    conditional: conditional.map((entry) => summarizeEntry(entry, "conditional")),
    tests: tests.map((entry) => summarizeEntry(entry, "test")),
    red_flags: redFlags.map((entry) => summarizeEntry(entry, "red_flag")),
    management_changes: managementChanges.map(summarizeStructuredFinding),
    limitations: uniquifyLimitationReportLabels(interpretationCautions.map(summarizeStructuredFinding)),
    evidence_metadata: evidenceMetadata.map(summarizeEvidenceMetadata),
    catalog_gaps: catalogGaps.map(summarizeCatalogGap),
    top_retrieved: ranked.candidates.slice(0, 16).map((candidate) => summarizeEntry(candidate)),
    high_score_suppressed: highScoreSuppressed,
    suppressed: (recommendation.suppressedItems || []).slice(0, 24).map((entry) => {
      const summary = summarizeEntry(entry, "suppressed");
      const originalLabel = stripSuppressedReportPrefix(entry.original_label || summary.original_label || entryLabel(entry) || summary.label || "");
      return {
        ...summary,
        label: suppressedReportLabel({ ...entry, label: summary.label, original_label: originalLabel }),
        original_label: originalLabel || stripSuppressedReportPrefix(summary.label || ""),
        score: Math.round(entry.candidate?.score || entry.score || 0),
        reason: entry.reason || entry.suppressionReason || "Not selected for this validated intent."
      };
    }),
    missing_required_domains: missingRequiredDomains,
    avoid_hits: avoidHits,
    duplicate_labels: duplicateLabels,
    missing_evidence: missingEvidence,
    quality_issues: qualityIssues,
    issues: blockingIssues,
    review_notes: reviewNotes,
    pass: readiness.completeValidatedWorkup && !blockingIssues.some((issue) => issue.severity === "high")
  };
}

function summarizeEntry(entry, fallbackRole = "") {
  const candidate = entry.candidate || entry;
  const label = entryLabel(entry);
  const role = fallbackRole || entry.role || "";
  const lrPlus = candidate.LR_plus || candidate.lr_plus || entry.LR_plus || entry.lr_plus || entry.evidence?.LR_plus || "n/a";
  const lrMinus = candidate.LR_minus || candidate.lr_minus || entry.LR_minus || entry.lr_minus || entry.evidence?.LR_minus || "n/a";
  const traceability = reportTraceabilityForEntry(entry);
  const source = firstReportText(
    candidate.evidence_source_primary,
    candidate.source_citation,
    entry.source,
    typeof entry.evidence === "string" ? entry.evidence : "",
    entry.evidence?.source,
    candidate.source_id,
    candidate.source?.source_id,
    (traceability.source_ids || []).join("; ")
  );
  const lrNote = summaryLikelihoodRatioNote({
    label,
    role,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    entry,
    candidate
  });
  const diagnosticPurpose = firstReportText(
    entry.diagnostic_purpose,
    entry.displayDiagnosticTarget,
    candidate.diagnostic_purpose,
    candidate.diagnostic_target,
    entry.reason
  );
  const managementImplication = firstReportText(
    entry.management_implication,
    entry.displayManagement,
    candidate.result_changes_management,
    candidate.management_link,
    entry.management_change
  );
  return withFlatTraceabilityFields({
    exam_id: candidate.exam_id || entry.exam_id || "",
    label,
    role,
    fit: entry.contextFitScore ?? "",
    score: Math.round(candidate.score || entry.score || 0),
    reason: entry.reason || "",
    diagnostic_purpose: diagnosticPurpose,
    diagnostic_target: entry.displayDiagnosticTarget || candidate.diagnostic_target || diagnosticPurpose,
    management_implication: managementImplication,
    management_change: entry.displayManagement || candidate.result_changes_management || candidate.management_link || managementImplication,
    options: entry.options || entry.findings_options || candidate.examOptions || candidate.findings_options || "",
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    difficulty: entry.feasibility?.difficulty || entry.difficulty || candidate.difficulty || "",
    time_burden_minutes: entry.feasibility?.time_burden_minutes || entry.time_burden_minutes || candidate.time_burden_minutes || "",
    action: entry.action || candidate.action || "",
    technique: reportTechniqueForRole(role, entry.technique || candidate.technique || candidate.maneuver || ""),
    when_to_use: firstReportText(entry.whenToUse, entry.when_to_use, entry.when_to_use_structured, candidate.when_to_use_structured, candidate.whenToUse),
    equipment_needed: entry.feasibility?.equipment_needed || entry.equipment_needed || candidate.equipment_needed || "",
    patient_cooperation_required: entry.feasibility?.patient_cooperation_required || entry.patient_cooperation_required || candidate.patient_cooperation_required || "",
    limitations: entry.limitations || entry.interpretationCautions || candidate.limitations || "",
    tags: reportTagText(entry.tags, entry.matchedTags, entry.retrievalTags, candidate.tags, candidate.matchedTags, candidate.retrieval_tags),
    routes: candidate.retrievalRoutes || [],
    traceability
  });
}

function reportTechniqueForRole(role = "", value = "") {
  const technique = String(value || "").trim();
  if (!technique) {
    return "";
  }
  const normalizedRole = String(role || "").toLowerCase();
  const isExamRole = normalizedRole === "core" || normalizedRole === "conditional";
  if (!isExamRole) {
    return "";
  }
  return technique;
}

function summaryLikelihoodRatioUnavailable(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || text === "n/a" || text === "na" || text === "not available" || text === "unavailable";
}

function summaryLikelihoodRatioNote({ label = "", role = "", lr_plus = "", lr_minus = "", entry = {}, candidate = {} } = {}) {
  const explicit = entry.lr_note
    || entry.likelihood_ratio_note
    || entry.evidence?.likelihood_ratio_note
    || candidate.lr_note
    || candidate.likelihood_ratio_note
    || candidate.LR_note;
  if (explicit) {
    return explicit;
  }
  if (!summaryLikelihoodRatioUnavailable(lr_plus) || !summaryLikelihoodRatioUnavailable(lr_minus)) {
    return "Quantitative likelihood-ratio values are available in the curated metadata; interpret with the cited source, pretest probability, and patient context.";
  }
  if (role === "safety" || isBasicBedsideDataItem({ label, action: entry.reason || entry.management_change || candidate.result_changes_management || "" })) {
    return "Likelihood ratios are not applicable to routine bedside safety data; use this item to assess acuity, monitoring needs, and management safety rather than diagnostic probability.";
  }
  return "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat this bedside finding as supportive and interpret it with the cited guideline, diagnostic tests, and patient context.";
}

function summarizeStructuredFinding(entry = {}) {
  const lrPlus = entry.evidence?.LR_plus || entry.LR_plus || entry.lr_plus || "n/a";
  const lrMinus = entry.evidence?.LR_minus || entry.LR_minus || entry.lr_minus || "n/a";
  const rawLabel = entry.label || entry.id || "";
  const isLimitation = entry.role === "limitation" || Boolean(entry.limitation || entry.interpretationCaution);
  const isManagement = entry.role === "management" || Boolean(entry.managementChange || entry.management_change || entry.managementImplication || entry.management_implication);
  const limitationBaseLabel = isLimitation
    ? compactLimitationBaseLabel(
      String(rawLabel || "").replace(/^interpretation caution\s*-\s*/i, ""),
      entry.role || entry.item_type || entry.type || ""
    )
    : "";
  const managementBaseLabel = isManagement
    ? managementLabelCandidatesForStructuredFinding(entry, rawLabel)
      .map((candidate) => compactManagementBaseLabel(candidate))
      .find((candidate) => managementBaseLabelLooksComplete(candidate))
    : "";
  const label = isLimitation
    ? `Interpretation caution - ${limitationBaseLabel || "linked workup item"}`
    : isManagement
      ? `Management implication - ${managementBaseLabel || "linked workup item"}`
    : rawLabel;
  const traceability = reportTraceabilityForEntry(entry);
  const source = entry.source || entry.evidence?.source || (traceability.source_ids || []).join("; ");
  const lrNote = summaryLikelihoodRatioNote({ label, role: entry.role || "", lr_plus: lrPlus, lr_minus: lrMinus, entry });
  const diagnosticPurpose = entry.diagnosticPurpose || entry.diagnosticTarget || entry.limitation || entry.interpretationCaution || "";
  const managementImplication = entry.managementImplication || entry.managementChange || "";
  return withFlatTraceabilityFields({
    exam_id: entry.linkedExamId || entry.exam_id || entry.id || "",
    label,
    role: entry.role || "",
    reason: entry.diagnosticTarget || entry.limitation || entry.interpretationCaution || entry.managementChange || "",
    diagnostic_purpose: diagnosticPurpose,
    diagnostic_target: entry.diagnosticTarget || diagnosticPurpose,
    management_implication: managementImplication,
    management_change: entry.managementChange || managementImplication,
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    limitations: entry.limitation || entry.interpretationCaution || entry.limitations || "",
    routes: entry.retrievalRoute ? [entry.retrievalRoute] : [],
    traceability
  });
}

function summarizeEvidenceMetadata(entry = {}) {
  const lrPlus = entry.evidence?.LR_plus || entry.LR_plus || entry.lr_plus || "n/a";
  const lrMinus = entry.evidence?.LR_minus || entry.LR_minus || entry.lr_minus || "n/a";
  const label = entry.label || entry.id || "";
  const traceability = reportTraceabilityForEntry(entry);
  const source = entry.source || entry.evidence?.source || (traceability.source_ids || []).join("; ");
  const lrNote = summaryLikelihoodRatioNote({ label, role: "evidence", lr_plus: lrPlus, lr_minus: lrMinus, entry });
  const diagnosticPurpose = entry.diagnosticPurpose || entry.diagnosticTarget || "";
  const managementImplication = entry.managementImplication || entry.managementChange || "";
  return withFlatTraceabilityFields({
    exam_id: entry.linkedExamId || entry.id || "",
    label,
    role: "evidence",
    reason: entry.diagnosticTarget || "",
    diagnostic_purpose: diagnosticPurpose,
    diagnostic_target: entry.diagnosticTarget || diagnosticPurpose,
    management_implication: managementImplication,
    management_change: managementImplication,
    evidence: source,
    source,
    LR_plus: lrPlus,
    LR_minus: lrMinus,
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    likelihood_ratio_note: lrNote,
    lr_note: lrNote,
    routes: entry.retrievalRoute ? [entry.retrievalRoute] : [],
    traceability
  });
}

function summarizeCatalogGap(gap = {}) {
  const gapId = gap.gapId || gap.gap_id || gap.gap_exam_id || gap.linkedExamId || gap.id || "";
  const sourceIds = gap.sourceIds || gap.source_ids || gap.source_id || gap.source || "";
  const traceability = reportTraceabilityForEntry(gap, {
    source_ids: sourceIds,
    authorized_by: "staged_catalog_gap",
    item_id: gapId,
    routes: ["staged_catalog_gap"],
    catalog_gap: true
  });
  return withFlatTraceabilityFields({
    exam_id: gapId,
    label: gap.label || gap.gap_label || gapId,
    role: gap.gapType || gap.gap_type || gap.item_type || "catalog_gap",
    reason: gap.rationale || "",
    diagnostic_target: "",
    management_change: gap.resolutionPlan || gap.resolution_plan || gap.management_change || "",
    evidence: Array.isArray(sourceIds) ? sourceIds.join("; ") : String(sourceIds || ""),
    lr_plus: gap.evidence?.LR_plus || "",
    lr_minus: gap.evidence?.LR_minus || "",
    review_status: gap.reviewStatus || gap.review_status || gap.gap_status || "",
    review_owner: gap.reviewOwner || gap.review_owner || "",
    last_reviewed: gap.lastReviewed || gap.last_reviewed || "",
    activation_condition: gap.activationCondition || gap.activation_condition || gap.when_to_use || "",
    routes: ["staged_catalog_gap"],
    traceability
  });
}

function appendReportSection(lines, title, entries = [], formatter = null) {
  lines.push("", title);
  if (!entries.length) {
    lines.push("- none");
    return;
  }
  entries.forEach((entry, index) => {
    if (formatter) {
      lines.push(formatter(entry, index));
      return;
    }
    const evidence = entry.evidence ? `; source ${entry.evidence}` : "";
    const lr = entry.lr_plus || entry.lr_minus || entry.lr_note ? `; LR+ ${entry.lr_plus || "n/a"}, LR- ${entry.lr_minus || "n/a"}` : "";
    const lrNote = entry.lr_note ? `; LR note: ${entry.lr_note}` : "";
    const options = entry.options ? `; options ${entry.options}` : "";
    const useWhen = entry.when_to_use || entry.when_to_ask ? `; use when ${entry.when_to_use || entry.when_to_ask}` : "";
    const technique = entry.technique ? `; technique ${entry.technique}` : "";
    const feasibility = [
      entry.difficulty ? `difficulty ${entry.difficulty}` : "",
      entry.time_burden_minutes !== "" && entry.time_burden_minutes !== undefined ? `time ${entry.time_burden_minutes} min` : "",
      entry.equipment_needed ? `equipment ${entry.equipment_needed}` : "",
      entry.patient_cooperation_required ? `cooperation ${entry.patient_cooperation_required}` : ""
    ].filter(Boolean).join(", ");
    const feasibilityText = feasibility ? `; feasibility ${feasibility}` : "";
    const limitations = entry.limitations ? `; limitations ${entry.limitations}` : "";
    const tags = entry.tags ? `; tags ${entry.tags}` : "";
    const reason = entry.reason || entry.management_change || "no rationale";
    lines.push(`${index + 1}. ${entry.label || entry.exam_id || "unlabeled"} (${entry.exam_id || "no-id"}) - ${reason}${options}${useWhen}${technique}${feasibilityText}${limitations}${tags}${evidence}${lr}${lrNote}`);
  });
}

export function formatMarkdown(run) {
  const lines = [
    "# Clinical Workup Iteration Report",
    "",
    `Generated: ${run.generated_at}`,
    `Setting: ${run.setting}`,
    `Population: ${run.population}`,
    `Modifiers: ${run.modifiers || "none"}`,
    `Intents evaluated: ${run.results.length}`,
    `Complete validated workups: ${run.results.filter((result) => result.complete_validated_workup).length}`,
    `Workups needing reviewer completion: ${run.results.filter((result) => !result.complete_validated_workup).length}`,
    `High-severity issue cases: ${run.results.filter((result) => result.issues.some((issue) => issue.severity === "high")).length}`,
    `Review-note cases: ${run.results.filter((result) => result.review_notes.length).length}`,
    "",
    "## Summary",
    ""
  ];
  run.results.forEach((result) => {
    const status = result.complete_validated_workup ? "READY" : "REVIEW";
    lines.push(`- ${status} ${result.intent_id}: ${result.label}`);
    lines.push(`  - readiness: ${result.readiness_label || result.readiness_status || "not recorded"}`);
    lines.push(`  - safety ${result.counts.safety}, history ${result.counts.history}, core exam ${result.counts.core}, conditional exam ${result.counts.conditional}, tests ${result.counts.tests || 0}, red flags ${result.counts.red_flags || 0}, management ${result.counts.management || 0}, evidence/LR ${result.counts.evidence_metadata || 0}, catalog gaps ${result.counts.catalog_gaps || 0}, retrieved ${result.counts.retrieved}, suppressed ${result.counts.suppressed}`);
    if (result.conditional_exam_addon_status?.status) {
      lines.push(`  - conditional add-ons status: ${result.conditional_exam_addon_status.label || result.conditional_exam_addon_status.status} (${result.conditional_exam_addon_status.status})`);
    }
    if (result.module_id) {
      lines.push(`  - module: ${result.module_label} (${result.module_id}); sources: ${(result.source_ids || []).join("; ") || "n/a"}`);
    }
    lines.push(`  - issues: ${result.issues.length ? result.issues.map((issue) => `${issue.type}: ${issue.detail}`).join("; ") : "none"}`);
    lines.push(`  - review notes: ${result.review_notes.length ? result.review_notes.map((issue) => `${issue.type}: ${issue.detail}`).join("; ") : "none"}`);
    lines.push(`  - safety labels: ${result.safety.map((entry) => entry.label).join("; ") || "none"}`);
    lines.push(`  - core exam labels: ${result.core.map((entry) => entry.label).join("; ") || "none"}`);
    if ((result.tests || []).length) {
      lines.push(`  - tests/reference thresholds: ${result.tests.map((entry) => entry.label).slice(0, 6).join("; ")}${result.tests.length > 6 ? "; ..." : ""}`);
    }
    if ((result.management_changes || []).length) {
      lines.push(`  - management-changing findings: ${result.management_changes.map((entry) => entry.label).slice(0, 6).join("; ")}${result.management_changes.length > 6 ? "; ..." : ""}`);
    }
  });
  lines.push("", "## Structured Workups", "");
  run.results.forEach((result) => {
    lines.push(`### ${result.intent_id}: ${result.label}`, "");
    lines.push(`Status: ${result.complete_validated_workup ? "READY" : "REVIEW"}`);
    lines.push(`Readiness: ${result.readiness_label || result.readiness_status || "not recorded"}`);
    if (result.readiness?.reasons?.length) {
      lines.push(`Readiness reasons: ${result.readiness.reasons.join("; ")}`);
    }
    lines.push(`Validated bundles: ${(result.active_bundles || []).join("; ") || "none"}`);
    if (result.module_id) {
      lines.push(`Installed module: ${result.module_label} (${result.module_id})`);
    }
    appendReportSection(lines, "Basic bedside data / safety checks", result.safety || []);
    appendReportSection(lines, "Focused history questions", result.history || [], (entry, index) => {
      const evidence = entry.evidence ? `; source ${entry.evidence}` : "";
      const options = entry.options ? `; options ${entry.options}` : "";
      const useWhen = entry.when_to_ask ? `; ask when ${entry.when_to_ask}` : "";
      const tags = entry.tags ? `; tags ${entry.tags}` : "";
      const fullQuestion = entry.full_question && entry.full_question !== entry.label ? `; full question ${entry.full_question}` : "";
      const details = entry.detail_prompts?.length ? `; details ${entry.detail_prompts.join(" | ")}` : "";
      return `${index + 1}. ${entry.label || "unlabeled question"} - ${entry.reason || entry.management_change || "no rationale"}${options}${useWhen}${tags}${evidence}${fullQuestion}${details}`;
    });
    appendReportSection(lines, "Core physical exam maneuvers", result.core || []);
    appendReportSection(lines, "Conditional exam add-ons", result.conditional || []);
    if (result.conditional_exam_addon_status?.reason) {
      lines.push(`Conditional add-on status: ${result.conditional_exam_addon_status.label || result.conditional_exam_addon_status.status} (${result.conditional_exam_addon_status.status}) - ${result.conditional_exam_addon_status.reason}`);
    }
    appendReportSection(lines, "Management-changing findings", result.management_changes || []);
    appendReportSection(lines, "Limitations and interpretation cautions", result.limitations || []);
    appendReportSection(lines, "Evidence / likelihood-ratio metadata", result.evidence_metadata || [], (entry, index) => {
      const lr = entry.lr_plus || entry.lr_minus ? `; LR+ ${entry.lr_plus || "n/a"}, LR- ${entry.lr_minus || "n/a"}` : "; LR unavailable";
      const lrNote = entry.lr_note ? `; LR note: ${entry.lr_note}` : "";
      return `${index + 1}. ${entry.label || entry.exam_id || "unlabeled"} (${entry.exam_id || "no-id"}) - source ${entry.evidence || "n/a"}${lr}${lrNote}`;
    });
    appendReportSection(lines, "Catalog gaps needing review", result.catalog_gaps || [], (entry, index) => {
      return `${index + 1}. ${entry.label || entry.exam_id || "unlabeled"} (${entry.exam_id || "no-id"}) - ${entry.review_status || "staged"}; owner ${entry.review_owner || "n/a"}; ${entry.reason || "no rationale"}; plan ${entry.management_change || "n/a"}`;
    });
    appendReportSection(lines, "Suppressed/not-recommended items", result.suppressed || result.high_score_suppressed || [], (entry, index) => {
      const source = entry.evidence ? `; source ${entry.evidence}` : "";
      const lr = entry.lr_plus || entry.lr_minus ? `; LR+ ${entry.lr_plus || "n/a"}, LR- ${entry.lr_minus || "n/a"}` : "";
      const lrNote = entry.lr_note ? `; LR note: ${entry.lr_note}` : "";
      const tags = entry.tags ? `; tags ${entry.tags}` : "";
      const authorization = entry.traceability?.authorized_by ? `; authorization ${entry.traceability.authorized_by}` : "";
      return `${index + 1}. ${entry.label || "unlabeled"} (${entry.exam_id || entry.traceability?.item_id || "no-id"}) - ${entry.reason || "suppressed"}${source}${lr}${lrNote}${tags}${authorization}`;
    });
    lines.push("");
  });
  const issueCases = run.results.filter((result) => result.issues.length || result.review_notes.length);
  if (issueCases.length) {
    lines.push("", "## Improvement Queue", "");
    issueCases.forEach((result) => {
      lines.push(`### ${result.intent_id}: ${result.label}`, "");
      if (result.issues.length) {
        lines.push("Issues:");
        result.issues.forEach((issue) => {
          lines.push(`- ${issue.severity}: ${issue.type} - ${issue.detail}`);
        });
      }
      if (result.review_notes.length) {
        lines.push("Review notes:");
        result.review_notes.forEach((issue) => {
          lines.push(`- ${issue.type} - ${issue.detail}`);
        });
      }
      if (result.safety.length) {
        lines.push("", "Basic safety checks:");
        result.safety.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if (result.history.length) {
        lines.push("", "Focused history:");
        result.history.forEach((entry, index) => {
          const options = entry.options ? `; options ${entry.options}` : "";
          const useWhen = entry.when_to_ask ? `; ask when ${entry.when_to_ask}` : "";
          const tags = entry.tags ? `; tags ${entry.tags}` : "";
          lines.push(`${index + 1}. ${entry.label} - ${entry.reason || entry.management_change || "no rationale"}${options}${useWhen}${tags}`);
        });
      }
      lines.push("", "Core physical exam:");
      result.core.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
      });
      if (result.conditional.length) {
        lines.push("", "Conditional:");
        result.conditional.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if ((result.tests || []).length) {
        lines.push("", "Tests / reference thresholds:");
        result.tests.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if ((result.red_flags || []).length) {
        lines.push("", "Red flags / escalation cues:");
        result.red_flags.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if ((result.management_changes || []).length) {
        lines.push("", "Management-changing findings:");
        result.management_changes.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if (result.high_score_suppressed.length) {
        lines.push("", "High-score suppressed candidates to review:");
        result.high_score_suppressed.forEach((entry) => {
          lines.push(`- ${entry.label} (${entry.score}): ${entry.reason}`);
        });
      }
      lines.push("");
    });
  }
  return `${lines.join("\n")}\n`;
}

function outputPathForIteration(path, iteration) {
  if (!path || iteration === 1) return path;
  const extension = extname(path);
  return extension
    ? `${path.slice(0, -extension.length)}.${String(iteration).padStart(3, "0")}${extension}`
    : `${path}.${String(iteration).padStart(3, "0")}`;
}

function writeOutput(path, text) {
  if (!path) return;
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, "utf8");
}

export function buildRun(fixtures, args) {
  let intents = selectedIntentsForArgs(args);
  if (args.limit > 0) {
    intents = intents.slice(0, args.limit);
  }
  if (!intents.length) {
    throw new Error("No validated clinical intents matched the requested diagnosis or intent id.");
  }
  const results = intents.map((intentRow) => evaluateIntent(intentRow, fixtures, args));
  return {
    generated_at: new Date().toISOString(),
    setting: args.setting,
    population: args.population,
    modifiers: args.modifiers,
    diagnosis_query: args.diagnosis,
    intent_ids: intents.map((intentRow) => intentRow.intent_id),
    results
  };
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = loadCatalog();
  for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
    const run = buildRun(fixtures, args);
    const markdown = formatMarkdown(run);
    writeOutput(outputPathForIteration(args.out, iteration), markdown);
    writeOutput(outputPathForIteration(args.json, iteration), `${JSON.stringify(run, null, 2)}\n`);
    writeOutput(args.latestOut, markdown);
    writeOutput(args.latestJson, `${JSON.stringify(run, null, 2)}\n`);
    if (!args.out && !args.json) {
      process.stdout.write(markdown);
    } else {
      const issueCount = run.results.reduce((sum, result) => sum + result.counts.issues, 0);
      const reviewNoteCount = run.results.reduce((sum, result) => sum + result.counts.review_notes, 0);
      const completeCount = run.results.filter((result) => result.complete_validated_workup).length;
      process.stdout.write(`Clinical workup iteration ${iteration}: ${run.results.length} intent(s), ${completeCount} complete, ${run.results.length - completeCount} need review, ${issueCount} issue(s), ${reviewNoteCount} review note(s).\n`);
    }
    if (iteration < args.iterations && args.watchMs > 0) {
      await delay(args.watchMs);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
