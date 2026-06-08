import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  buildRecommendedExamChecklist,
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

function moduleItemOptionLabels(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return entry.label || entry.value || entry.text || "";
        }
        return entry;
      })
      .map((entry) => String(entry || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[;|/]+/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function moduleItemOptionText(value) {
  return moduleItemOptionLabels(value).join(" / ");
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

function reportTraceabilityForEntry(entry = {}, fallback = {}) {
  const candidate = entry.candidate || entry;
  const traceability = entry.traceability || candidate.traceability || {};
  const evidence = entry.evidence || candidate.evidence || {};
  const sourceIds = uniqueReportValues([
    traceability.source_ids,
    entry.source_ids,
    entry.source,
    entry.evidence?.source,
    evidence.source,
    candidate.evidence_source_primary,
    candidate.source_citation,
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

function reportTraceabilityForModuleItem(item = {}, intentRow = {}, role = "") {
  const sourceId = moduleSourceForItem(item);
  return {
    intent_ids: uniqueReportValues([
      moduleTraceIdsForItem(item),
      intentRow.intent_id
    ]),
    source_ids: uniqueReportValues([
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
        pattern: /cough[\s\S]*(?:dysuria|urinary|flank)[\s\S]*(?:rash|wound|line)[\s\S]*(?:abdominal|vomiting|diarrhea)[\s\S]*(?:headache|neck|confusion)[\s\S]*(?:exposure|host|immunosuppression|pregnancy)/i
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
  return {
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: moduleItemLabel(item),
    role,
    fit: "",
    score: item.score ?? "",
    reason: item.reason || item.suppressionReason || item.rationale || item.diagnostic_purpose || item.action || "",
    diagnostic_target: item.diagnostic_target || item.diagnostic_purpose || "",
    management_change: item.management_change || item.management_implication || item.action || "",
    options: moduleItemOptionText(moduleItemFindingsOptions(item)),
    evidence: moduleSourceForItem(item),
    lr_plus: item.LR_plus || "",
    lr_minus: item.LR_minus || "",
    lr_note: item.likelihood_ratio_note || item.LR_note || item.lr_note || "",
    difficulty: item.difficulty || "",
    time_burden_minutes: item.time_burden_minutes ?? "",
    limitations: item.limitations || item.interpretation_cautions || item.interpretationCautions || "",
    routes: ["installed_guideline_module"],
    traceability: reportTraceabilityForModuleExport(item, intentRow, role)
  };
}

function summarizeQuestionItem(item, intentRow = {}) {
  return {
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: item.text || item.label || "",
    role: "history",
    reason: item.diagnostic_purpose || item.rationale || "",
    management_change: item.management_implication || item.action || "",
    evidence: moduleSourceForItem(item),
    lr_plus: item.LR_plus || "",
    lr_minus: item.LR_minus || "",
    lr_note: item.likelihood_ratio_note || item.LR_note || item.lr_note || "",
    detail_prompts: item.detail_prompts || [],
    traceability: reportTraceabilityForModuleExport(item, intentRow, "history")
  };
}

function historyQuestionNeedsDetailPrompts(item = {}) {
  const text = String(item.text || item.label || "");
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  return text.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(text.trim()) && commaCount >= 3);
}

function summarizeModuleLimitation(item, intentRow = {}) {
  return {
    exam_id: item.id || item.exam_id || item.traceability?.item_id || item.traceability?.evidence_row_id || "",
    label: moduleItemLabel(item),
    role: "limitation",
    reason: item.limitation || item.interpretation_cautions || item.limitations || "",
    diagnostic_target: item.diagnostic_target || "",
    management_change: item.management_change || item.action || "",
    evidence: moduleSourceForItem(item),
    lr_plus: item.LR_plus || "",
    lr_minus: item.LR_minus || "",
    lr_note: item.likelihood_ratio_note || item.LR_note || item.lr_note || "",
    limitations: item.limitation || item.interpretation_cautions || item.limitations || "",
    tags: item.tags || [],
    routes: ["installed_guideline_module"],
    traceability: reportTraceabilityForModuleExport(item, intentRow, "limitation")
  };
}

function moduleTraceIdsForItem(item = {}) {
  const value = item.traceability?.intent_ids || item.validatedIntentIds || [];
  return Array.isArray(value)
    ? value
    : String(value || "").split(/[;|]/).map((entry) => entry.trim()).filter(Boolean);
}

function reportTraceabilityForModuleExport(item = {}, intentRow = {}, role = "") {
  if (item.traceability) {
    return reportTraceabilityForEntry(item, {
      intent_ids: [intentRow.intent_id],
      source_ids: [moduleSourceForItem(item), ...(intentRow.source_ids || [])],
      authorized_by: item.traceability.authorized_by || "validated_clinical_intent",
      item_id: item.id || "",
      routes: ["installed_guideline_module", role]
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
    if (historyQuestionNeedsDetailPrompts(item) && !(item.detail_prompts || []).length) {
      issues.push({ severity: "high", type: "missing_history_detail_prompts", detail: label });
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
    source_ids: result.sourceIds || [],
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
    safety: safety.map((entry) => summarizeModuleItem(entry, "safety", intentRow)),
    history: history.map((entry) => summarizeQuestionItem(entry, intentRow)),
    core: core.map((entry) => summarizeModuleItem(entry, "core", intentRow)),
    conditional: conditional.map((entry) => summarizeModuleItem(entry, "conditional", intentRow)),
    tests: tests.map((entry) => summarizeModuleItem(entry, "test", intentRow)),
    red_flags: redFlags.map((entry) => summarizeModuleItem(entry, "red_flag", intentRow)),
    management_changes: managementChanges.map((entry) => summarizeModuleItem(entry, "management", intentRow)),
    limitations: interpretationCautions.map((entry) => summarizeModuleLimitation(entry, intentRow)),
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
  return {
    intent_id: intentRow.intent_id,
    label: intentRow.label,
    status: intentRow.status,
    required_domains: intentRow.required_domains || [],
    avoid_labels: intentRow.avoid_labels || [],
    context,
    matched_tags: ranked.matchedTags.map((match) => match.tag),
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
    safety: safety.map((entry) => summarizeEntry(entry)),
    history: history.map((entry) => ({
      exam_id: entry.exam_id || entry.candidate?.exam_id || "",
      label: entry.text || "",
      role: "history",
      reason: entry.diagnosticPurpose || "",
      management_change: entry.managementImplication || "",
      evidence: entry.source || "",
      lr_plus: entry.evidence?.LR_plus || "",
      lr_minus: entry.evidence?.LR_minus || "",
      lr_note: entry.evidence?.likelihood_ratio_note || "",
      detail_prompts: entry.detail_prompts || [],
      traceability: reportTraceabilityForEntry(entry)
    })),
    core: core.map((entry) => summarizeEntry(entry)),
    conditional: conditional.map((entry) => summarizeEntry(entry)),
    tests: tests.map((entry) => summarizeEntry(entry)),
    red_flags: redFlags.map((entry) => summarizeEntry(entry)),
    management_changes: managementChanges.map(summarizeStructuredFinding),
    limitations: interpretationCautions.map(summarizeStructuredFinding),
    evidence_metadata: evidenceMetadata.map(summarizeEvidenceMetadata),
    catalog_gaps: catalogGaps.map(summarizeCatalogGap),
    top_retrieved: ranked.candidates.slice(0, 16).map((candidate) => summarizeEntry(candidate)),
    high_score_suppressed: highScoreSuppressed,
    suppressed: (recommendation.suppressedItems || []).slice(0, 24).map((entry) => ({
      ...summarizeEntry(entry),
      score: Math.round(entry.candidate?.score || entry.score || 0),
      reason: entry.reason || entry.suppressionReason || "Not selected for this validated intent."
    })),
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

function summarizeEntry(entry) {
  const candidate = entry.candidate || entry;
  const label = entryLabel(entry);
  const lrPlus = candidate.LR_plus || entry.LR_plus || entry.evidence?.LR_plus || "";
  const lrMinus = candidate.LR_minus || entry.LR_minus || entry.evidence?.LR_minus || "";
  const traceability = reportTraceabilityForEntry(entry);
  return {
    exam_id: candidate.exam_id || entry.exam_id || "",
    label,
    role: entry.role || "",
    fit: entry.contextFitScore ?? "",
    score: Math.round(candidate.score || entry.score || 0),
    reason: entry.reason || "",
    diagnostic_target: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    management_change: entry.displayManagement || candidate.result_changes_management || candidate.management_link || "",
    options: entry.options || entry.findings_options || candidate.examOptions || candidate.findings_options || "",
    evidence: candidate.evidence_source_primary || candidate.source_citation || "",
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    lr_note: summaryLikelihoodRatioNote({
      label,
      role: entry.role || "",
      lr_plus: lrPlus,
      lr_minus: lrMinus,
      entry,
      candidate
    }),
    difficulty: candidate.difficulty || "",
    time_burden_minutes: candidate.time_burden_minutes || "",
    routes: candidate.retrievalRoutes || [],
    traceability
  };
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
  const lrPlus = entry.evidence?.LR_plus || entry.LR_plus || "";
  const lrMinus = entry.evidence?.LR_minus || entry.LR_minus || "";
  const label = entry.label || entry.id || "";
  const traceability = reportTraceabilityForEntry(entry);
  return {
    exam_id: entry.linkedExamId || entry.exam_id || entry.id || "",
    label,
    role: entry.role || "",
    reason: entry.diagnosticTarget || entry.limitation || entry.interpretationCaution || entry.managementChange || "",
    diagnostic_target: entry.diagnosticTarget || "",
    management_change: entry.managementChange || "",
    evidence: entry.source || entry.evidence?.source || "",
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    lr_note: summaryLikelihoodRatioNote({ label, role: entry.role || "", lr_plus: lrPlus, lr_minus: lrMinus, entry }),
    routes: entry.retrievalRoute ? [entry.retrievalRoute] : [],
    traceability
  };
}

function summarizeEvidenceMetadata(entry = {}) {
  const lrPlus = entry.evidence?.LR_plus || entry.LR_plus || "";
  const lrMinus = entry.evidence?.LR_minus || entry.LR_minus || "";
  const label = entry.label || entry.id || "";
  const traceability = reportTraceabilityForEntry(entry);
  return {
    exam_id: entry.linkedExamId || entry.id || "",
    label,
    role: "evidence",
    reason: entry.diagnosticTarget || "",
    diagnostic_target: entry.diagnosticTarget || "",
    management_change: "",
    evidence: entry.source || entry.evidence?.source || "",
    lr_plus: lrPlus,
    lr_minus: lrMinus,
    lr_note: summaryLikelihoodRatioNote({ label, role: "evidence", lr_plus: lrPlus, lr_minus: lrMinus, entry }),
    routes: entry.retrievalRoute ? [entry.retrievalRoute] : [],
    traceability
  };
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
  return {
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
  };
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
    const reason = entry.reason || entry.management_change || "no rationale";
    lines.push(`${index + 1}. ${entry.label || entry.exam_id || "unlabeled"} (${entry.exam_id || "no-id"}) - ${reason}${options}${evidence}${lr}${lrNote}`);
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
      const details = entry.detail_prompts?.length ? `; details ${entry.detail_prompts.join(" | ")}` : "";
      return `${index + 1}. ${entry.label || "unlabeled question"} - ${entry.reason || entry.management_change || "no rationale"}${evidence}${details}`;
    });
    appendReportSection(lines, "Core physical exam maneuvers", result.core || []);
    appendReportSection(lines, "Conditional exam add-ons", result.conditional || []);
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
      const authorization = entry.traceability?.authorized_by ? `; authorization ${entry.traceability.authorized_by}` : "";
      return `${index + 1}. ${entry.label || "unlabeled"} (${entry.exam_id || entry.traceability?.item_id || "no-id"}) - ${entry.reason || "suppressed"}${source}${authorization}`;
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
          lines.push(`${index + 1}. ${entry.label} - ${entry.reason || entry.management_change || "no rationale"}`);
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
