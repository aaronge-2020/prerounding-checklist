import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildClinicalIntentRetrievalContext,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";
import {
  complaintSourceRegistry,
  complaintModules,
  evaluateComplaintCds,
  isBasicBedsideDataItem
} from "../complaint-cds.js";
import {
  buildLocalChecklistFromWorkup,
  localChecklistTraceEntriesFromWorkup,
  parseChecklist,
  validateChecklist
} from "../checklist.js";
import {
  buildRun as buildClinicalWorkupIterationRun,
  formatMarkdown as formatClinicalWorkupIterationMarkdown,
  loadCatalog as loadClinicalWorkupIterationCatalog
} from "./iterate-clinical-workups.js";
import {
  buildRecommendedExamChecklist,
  isBasicSafetyCheckEntry,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const acceptedCatalogAdditionRows = parseCsv(readFileSync("data/evidence/accepted_exam_catalog_additions.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const registeredSourceIds = new Set([
  ...sourceRows.map((row) => row.source_id).filter(Boolean),
  ...complaintSourceRegistry.map((row) => row.id || row.source_id).filter(Boolean)
]);
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const gapRows = parseCsv(readFileSync("data/evidence/catalog_gap_registry.csv", "utf8"));
const gapRegistryIds = new Set(gapRows.map((row) => row.gap_exam_id));
const catalog = joinEvidenceCatalog(
  baseRows,
  mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyRows),
  sourceRows,
  acceptedCatalogAdditionRows
);
assert.ok(
  catalog.some((candidate) => candidate.exam_id === "EXAM-DERM-SKIN-INSPECTION" && candidate.acceptedCatalogAddition),
  "clinical intent audit should use the same accepted catalog additions as the app evidence loader"
);

const bundledLabelPattern = /[,;]|\b(?:and|plus)\b.*\b(?:and|plus)\b/i;
const vaguePhysicalExamLabelPattern = /^(?:assess|evaluate|screen for|document|perform|review)\b|\b(?:screen|assessment|survey)\b/i;
const weakSafetyCheckLabelPattern = /^(?:assess|check|evaluate)\b|^(?:mental status|general appearance|pregnancy possibility safety check|bedside glucose safety check)$|\bsafety check\b/i;
const actionSpecificPhysicalExamLabelPattern = /^(?:inspect|palpate|auscultate|percuss|observe|test|check|compare|measure|listen|use|press|stage|estimate|elicit)\b/i;
const allowedPairedAtomicExamLabelPattern = /\b(?:sclerae and conjunctivae)\b/i;
const vitalsOrSafetyLabelPattern = /\b(?:blood pressure|heart rate|respiratory rate|temperature|bedside glucose|oxygen saturation|spo2|pulse oximetry|weight|bmi|orthostatic|pregnancy possibility|red-flag review|safety check)\b/i;
const routineSafetyNormalizedLabels = new Set([
  "measure blood pressure",
  "measure heart rate",
  "count respiratory rate",
  "measure temperature",
  "measure oxygen saturation and support"
]);
const bareRoutineSafetyNounLabels = new Set([
  "blood pressure",
  "heart rate",
  "respiratory rate",
  "temperature",
  "oxygen saturation support"
]);
const actionSpecificRoutineSafetyLabelPattern = /^(?:measure|count)\b/i;
const actionSpecificSafetyLabelPattern = /^(?:measure|count|document|verify|observe|clarify|calculate|review|screen|ask|obtain)\b/i;
const genericHistoryQuestionPattern = /\bAny .+\brelevant to\b/i;
const vagueFocusedHistoryLabelPattern = /^(?:ask focused source, severity, and safety features|review medication and fluid-balance triggers|review hyperglycemic-crisis diagnostic and severity data)$/i;
const genericExamRationalePattern = /\bDocuments focused endocrine signs and complications that help distinguish severity, mimics, and management priorities\b/i;
const genericEndocrineSafetyTestPattern = /Check safety labs that change immediate management when clinically relevant/i;

function isNonExamCompatibilityAliasEntry(entry = {}) {
  const typeText = `${entry.role || ""} ${entry.item_type || ""} ${entry.candidate?.item_type || ""} ${entry.exam_id || ""}`;
  const label = `${entry.label || ""} ${entry.candidate?.examLabel || ""} ${entry.exam_id || ""}`;
  return /\b(?:safety_check|diagnostic_test|reference_threshold|red_flag|history_question|management_change|diagnostic_frame|catalog_gap)\b/i.test(typeText)
    || isBasicSafetyCheckEntry(entry)
    || vitalsOrSafetyLabelPattern.test(label);
}

function historyQuestionNeedsDetailPrompts(item = {}) {
  const text = String(item.full_question || item.text || item.label || "");
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  return text.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(text.trim()) && commaCount >= 3);
}

function historyQuestionLabelIsOverloaded(item = {}) {
  const label = String(item.label || item.displayLabel || "");
  if (!label) {
    return false;
  }
  const commaCount = (label.match(/,/g) || []).length;
  const orCount = (label.match(/\bor\b/gi) || []).length;
  return label.length > 120
    || commaCount >= 3
    || orCount >= 3
    || (/^Any\b/i.test(label.trim()) && commaCount >= 3);
}

function historyDetailPromptTooTerse(prompt = "") {
  const text = String(prompt || "").replace(/\s+/g, " ").trim();
  return text.length < 18
    || /^(?:Ask specifically about|Clarify|Review)\s*\.?$/i.test(text)
    || /^Review\s+(?:biotin|supplements?|medications?|missed doses)\.?$/i.test(text);
}

function historyDetailPromptHasBedsideAction(prompt = "") {
  return /^(?:Ask|Clarify|Review|Confirm|Document|Screen|Localize|Check)\b/i.test(String(prompt || "").trim());
}

function assertExportedFields(result, sectionName, entries = [], requiredFields = []) {
  entries.forEach((entry) => {
    requiredFields.forEach(([field, label]) => {
      assert.ok(
        String(entry[field] ?? "").trim(),
        `${result.intent_id}: ${entry.label || entry.exam_id || sectionName} ${sectionName} row should preserve ${label} in exported row data`
      );
    });
  });
}

function normalizedLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawQuestionLikeLabel(value = "") {
  const label = String(value || "").trim();
  const commaCount = (label.match(/,/g) || []).length;
  const orCount = (label.match(/\bor\b/gi) || []).length;
  return /^(?:Any|What|How|When|Could|Are|Do you|Is there)\b/i.test(label)
    || label.length > 140
    || commaCount >= 3
    || orCount >= 3;
}

function normalizedLimitationBaseLabel(value = "") {
  return normalizedLabel(String(value || "").replace(/^interpretation caution\s*[-:]\s*/i, ""));
}

function genericLimitationBaseLabel(value = "") {
  return /^(?:diagnostic test reference interpretation|red flag interpretation|management implication|focused history question|linked workup item|differential frame interpretation)$/i
    .test(normalizedLimitationBaseLabel(value));
}

function checklistItemsByCategory(sections = [], category = "") {
  return sections
    .flatMap((section) => (section.items || []).map((item) => ({ ...item, category: section.category })))
    .filter((item) => item.category === category);
}

function localChecklistTraceKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:measure|assess|inspect|palpate|auscultate|check|test|document|observe|ask)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localChecklistTraceLabelsForEntry(entry = {}) {
  const candidate = entry.candidate || {};
  const base = entry.base || candidate.base || {};
  return [
    ...(Array.isArray(entry.trace_labels) ? entry.trace_labels : []),
    ...(Array.isArray(entry.traceLabels) ? entry.traceLabels : []),
    entry.label,
    entry.text,
    entry.examLabel,
    entry.maneuver,
    entry.bedside_question_label,
    entry.original_label,
    candidate.label,
    candidate.text,
    candidate.examLabel,
    candidate.maneuver,
    candidate.bedside_question_label,
    candidate.original_label,
    base.suggested_checklist_label,
    base.maneuver_or_finding
  ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function localChecklistTraceLabelsMatch(itemKey, sourceKey) {
  if (!itemKey || !sourceKey) {
    return false;
  }
  if (itemKey === sourceKey) {
    return true;
  }
  const itemTokens = itemKey.split(/\s+/).filter(Boolean);
  const sourceTokens = sourceKey.split(/\s+/).filter(Boolean);
  if (itemTokens.length < 2 || sourceTokens.length < 2) {
    return false;
  }
  return sourceKey.includes(itemKey) || itemKey.includes(sourceKey);
}

function localChecklistTraceSourceEntries(workup = {}, options = {}) {
  return localChecklistTraceEntriesFromWorkup(workup, options).map((entry) => ({
    entry,
    labels: localChecklistTraceLabelsForEntry(entry)
  })).filter((entry) => entry.labels.length);
}

function localChecklistTraceabilityIssues(sections = [], workup = {}, options = {}) {
  const traceEntries = localChecklistTraceSourceEntries(workup, options);
  return sections
    .flatMap((section) => section.items || [])
    .map((item) => ({
      item,
      key: localChecklistTraceKey(item.label)
    }))
    .filter(({ key }) => key)
    .filter(({ key }) => !traceEntries.some((traceEntry) => traceEntry.labels.some((label) => localChecklistTraceLabelsMatch(key, localChecklistTraceKey(label)))))
    .map(({ item }) => `local checklist item is not traceable to a validated module or recommendation item: ${item.label}`);
}

function materializedLocalChecklistAuditIssues(intentRow) {
  const module = complaintModuleById.get(intentRow.complaint_module_id || "");
  const complaintResult = module
    ? evaluateComplaintCds(module.label, {}, { module, validatedIntents: [intentRow] })
    : {};
  const recommendation = recommendationForIntent(intentRow);
  const checklistText = buildLocalChecklistFromWorkup({
    complaintResult,
    recommendation,
    selectedIntents: [intentRow]
  }, {
    maxBedsideQuestions: 24,
    maxExamItems: 22
  });
  const sections = parseChecklist(checklistText);
  const audit = validateChecklist(sections);
  const bedsideItems = checklistItemsByCategory(sections, "bedside");
  const examItems = checklistItemsByCategory(sections, "exam");
  const issues = [];
  if (!checklistText) {
    issues.push("local checklist builder returned an empty checklist");
  }
  if (!audit.ok) {
    issues.push(...audit.issues.map((issue) => `parser/format audit failed: ${issue.type} - ${issue.message}`));
  }
  issues.push(...localChecklistTraceabilityIssues(sections, {
    complaintResult,
    recommendation,
    selectedIntents: [intentRow]
  }));
  if (bedsideItems.length < 6) {
    issues.push(`local bedside checklist has too few clinically specific history questions: ${bedsideItems.length}`);
  }
  if (!examItems.length) {
    issues.push("local bedside checklist has no true physical exam maneuvers");
  }
  examItems
    .filter((item) => /^_{2,3}$/.test(String(item.rawValue || item.options || "").trim()))
    .forEach((item) => issues.push(`local physical exam item lost maneuver-specific options: ${item.label}`));
  if (intentRow.intent_id === "fever_sepsis_v1") {
    const bedsideText = bedsideItems.map((item) => `${item.label} ${item.rawValue || item.options || ""}`).join(" | ");
    const examText = examItems.map((item) => `${item.label} ${item.rawValue || item.options || ""}`).join(" | ");
    if (!/cough|sputum|shortness of breath|oxygen/i.test(bedsideText)) {
      issues.push("fever local checklist should ask respiratory-source questions");
    }
    if (!/dysuria|urinary|flank|urine/i.test(bedsideText)) {
      issues.push("fever local checklist should ask urinary-source questions");
    }
    if (!/rash|wound|line|skin/i.test(bedsideText)) {
      issues.push("fever local checklist should ask skin/line-source questions");
    }
    if (!/immuno|pregnancy|hospitalization|procedure|travel|tick|mosquito|animal|food|water|sick contact|new medication/i.test(bedsideText)) {
      issues.push("fever local checklist should ask high-risk host and exposure questions");
    }
    if (!/poor intake|dehydration|low urine|rapid worsening|fainting|confusion/i.test(bedsideText)) {
      issues.push("fever local checklist should ask sepsis severity and perfusion questions");
    }
    if (/one-sided leg swelling|estrogen use|prior clot|worse .*lying flat|wakes from sleep/i.test(bedsideText)) {
      issues.push("standalone fever local checklist should not import generic cardiopulmonary backfill prompts");
    }
    if (!/auscultate posterior lung fields/i.test(examText)) {
      issues.push("fever local checklist should include posterior lung auscultation");
    }
    if (!/crackles|wheezes|rhonchi|diminished|asymmetric/i.test(examText)) {
      issues.push("fever lung exam should retain source-specific findings options");
    }
    if (!/inspect skin for infection source/i.test(examText)) {
      issues.push("fever local checklist should include skin/wound/line source inspection");
    }
  }
  return issues.map((issue) => `${intentRow.intent_id}: ${issue}`);
}

function reportHasExamScopeCaution(result = {}) {
  return (result.limitations || []).some((entry) => {
    const text = [
      entry.exam_id,
      entry.label,
      entry.reason,
      entry.limitations,
      Array.isArray(entry.tags) ? entry.tags.join(" ") : entry.tags
    ].filter(Boolean).join(" ");
    return /\b(?:exam_scope|exam light|exam-light|intentionally exam-light|physical exam scope)\b/i.test(text);
  });
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
  return normalizedLabel(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !moduleCoverageStopWords.has(token));
}

const requiredDomainCoverageStopWords = new Set([
  ...moduleCoverageStopWords,
  "adult",
  "add",
  "adds",
  "addon",
  "basic",
  "check",
  "checks",
  "clinical",
  "core",
  "cue",
  "cues",
  "exist",
  "exists",
  "gap",
  "review",
  "safety",
  "screen",
  "screening",
  "severe",
  "source",
  "specific",
  "trigger",
  "triggered",
  "warning",
  "when",
  "while",
  "with"
]);

function requiredDomainTokens(value = "") {
  return normalizedLabel(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !requiredDomainCoverageStopWords.has(token));
}

function visibleEntryText(entry = {}) {
  if (!entry || typeof entry !== "object") {
    return String(entry || "");
  }
  return [
    entry.label,
    entry.text,
    entry.action,
    entry.options,
    entry.domain,
    entry.reason,
    entry.rationale,
    entry.technique,
    entry.whenToUse,
    entry.when_to_use_structured,
    entry.when_to_perform,
    entry.when_to_ask,
    entry.diagnosticPurpose,
    entry.diagnostic_purpose,
    entry.diagnosticTarget,
    entry.diagnostic_target,
    entry.displayDiagnosticTarget,
    entry.managementImplication,
    entry.management_implication,
    entry.managementRelevance,
    entry.management_change,
    entry.managementChange,
    entry.displayManagement,
    entry.limitation,
    entry.limitations,
    entry.interpretationCaution,
    entry.interpretation_cautions,
    entry.rationale,
    entry.resolutionPlan,
    entry.gapType,
    ...(entry.tags || []),
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || [])
  ].filter(Boolean).join(" ");
}

const physicalExamConceptFamilies = [
  { id: "neuro", pattern: /\b(?:strength|gait|reflex|tremor|sensation|cranial|pupil|visual|ataxia|babinski|pronator)\b/i },
  { id: "cardiopulmonary", pattern: /\b(?:heart|lung|breath|respiratory|jvp|edema|pulse|pulses|perfusion|wheeze|crackle)\b/i },
  { id: "abdomen_gu", pattern: /\b(?:abdomen|abdominal|bowel|murphy|rebound|cva|flank|urinary|pelvic|scrotal|testicular|saddle)\b/i },
  { id: "skin_msk", pattern: /\b(?:skin|hair|rash|wound|ulcer|joint|bone|spine|muscle|tenderness|range of motion)\b/i },
  { id: "heent_eye", pattern: /\b(?:mouth|oropharynx|sclera|conjunctiva|ear|nose|throat|eye|extraocular|otoscope)\b/i },
  { id: "endocrine", pattern: /\b(?:thyroid|goiter|hypocalcemia|hypercalcemia|acromegaly|cushing|hirsutism|gynecomastia)\b/i }
];

function physicalExamLabelAtomicityIssues(label = "") {
  const normalized = normalizedLabel(label);
  if (!normalized) {
    return [];
  }
  const issues = [];
  if (!actionSpecificPhysicalExamLabelPattern.test(normalized)) {
    issues.push(`physical exam label is not written as a concrete bedside action: ${label}`);
  }
  if (vaguePhysicalExamLabelPattern.test(normalized)) {
    issues.push(`physical exam label is vague instead of atomic: ${label}`);
  }
  const matchedFamilies = physicalExamConceptFamilies
    .filter((family) => family.pattern.test(normalized))
    .map((family) => family.id);
  if (matchedFamilies.length > 2) {
    issues.push(`physical exam label spans too many concept families (${matchedFamilies.join(", ")}): ${label}`);
  }
  return issues;
}

function genericFindingsOptions(value) {
  const options = Array.isArray(value) ? value : String(value || "").split(/\s*(?:[;|]|\s+\/\s+)\s*/);
  const tokens = options
    .map(normalizedLabel)
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

function findingsOptionsForEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  return entry.findings_options
    || entry.findingsOptions
    || entry.options
    || candidate.findings_options
    || candidate.findingsOptions
    || candidate.examOptions
    || candidate.base?.findings_options
    || "";
}

const duplicateCoreExamFamilies = [
  {
    id: "oral-oropharyngeal-exam",
    pattern: /\b(?:mouth exam|oropharynx|oral cavity|pharynx|tonsil)\b/i
  },
  {
    id: "lung-auscultation",
    pattern: /\b(?:posterior lung sounds|lateral lung sounds|anterior lung sounds|auscultate (?:posterior |lateral |anterior )?lung fields?)\b/i
  },
  {
    id: "individual-valve-listening-areas",
    pattern: /\b(?:aortic area|pulmonic area|tricuspid area|mitral area)\b/i
  },
  {
    id: "regional-lymph-node-exam",
    pattern: /\b(?:tonsillar nodes|submandibular nodes|anterior cervical nodes|posterior cervical nodes|supraclavicular nodes|regional cervical lymph nodes|regional lymph node exam|regional lymph nodes)\b/i
  },
  {
    id: "lower-extremity-pulse-survey",
    pattern: /\b(?:dorsalis pedis pulses|posterior tibial pulses|femoral pulses)\b/i,
    maxUnique: 2
  }
];

function duplicateCoreExamFamilyIssues(examEntries = []) {
  const issues = [];
  duplicateCoreExamFamilies.forEach((family) => {
    const labels = examEntries
      .map((entry) => entry.label || entry.candidate?.examLabel || entry.exam_id || "")
      .filter((label) => family.pattern.test(label));
    const uniqueLabels = [...new Set(labels.map(normalizedLabel))].filter(Boolean);
    const maxUnique = family.maxUnique || 1;
    if (uniqueLabels.length > maxUnique) {
      issues.push(`duplicate same-family core physical exam maneuvers (${family.id}): ${labels.join(" + ")}`);
    }
  });
  return issues;
}

function visibleRecommendationText(recommendation = {}) {
  return [
    ...(recommendation.basicSafetyChecks || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...(recommendation.corePhysicalExamManeuvers || []),
    ...(recommendation.conditionalPhysicalExamManeuvers || []),
    ...(recommendation.initialTestsAndReferenceThresholds || []),
    ...(recommendation.redFlagsAndEscalationCues || []),
    ...(recommendation.managementChangingFindings || []),
    ...(recommendation.limitationsAndInterpretationCautions || []),
    ...(recommendation.catalogGapsNeedingReview || [])
  ].map(visibleEntryText).join(" ");
}

function visibleModuleResultText(result = {}) {
  return [
    ...(result.safetyChecks || []),
    ...(result.requiredQuestions || []),
    ...(result.conditionalQuestions || []),
    ...(result.focusedExam || []),
    ...(result.conditionalExam || []),
    ...(result.initialTests || []),
    ...(result.redFlags || []),
    ...(result.dispositionRules || []),
    ...(result.limitationsAndInterpretationCautions || []),
    ...(result.differentialBuckets || [])
  ].map(visibleEntryText).join(" ");
}

function moduleSectionText(items = []) {
  return (items || []).map(visibleEntryText).join(" ");
}

function attendingBaselineIssuesForModule(intentRow = {}, module = {}, result = {}) {
  const issues = [];
  const requiredDomainText = (intentRow.required_domains || []).join(" ");
  const intentText = [
    intentRow.intent_id,
    intentRow.label,
    ...(intentRow.evidence_tags || []),
    requiredDomainText,
    ...(intentRow.clinical_bundle_ids || []),
    module.id,
    module.label,
    ...(module.triggers || [])
  ].join(" ");
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
        pattern: /source-directed[\s\S]*(?:chest|respiratory|pneumonia|lung)|(?:chest|respiratory|pneumonia|lung)[\s\S]*source-directed/i
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
        issues.push(`attending baseline failed: ${requirement.label}`);
      }
    });
  }

  return issues;
}

function sourceDomainHistorySatisfiedByEvaluatedQuestion(item = {}, result = {}) {
  const itemText = `${item.id || ""} ${item.label || ""} ${item.text || ""} ${(item.tags || []).join(" ")}`;
  const evaluatedText = moduleSectionText([
    ...(result.requiredQuestions || []),
    ...(result.conditionalQuestions || [])
  ]);
  const checks = [
    {
      trigger: /urinary|flank|pyelonephritis|dysuria/i,
      coverage: /urinary and flank|dysuria|urinary frequency|flank pain|pyelonephritis/i
    },
    {
      trigger: /abdominal|gi|vomiting|diarrhea|jaundice/i,
      coverage: /abdominal and GI|abdominal pain|vomiting|diarrhea|jaundice/i
    },
    {
      trigger: /cns|meningeal|meningitis|headache|neck stiffness|photophobia/i,
      coverage: /CNS\/joint\/spine|severe headache|neck stiffness|photophobia|seizure/i
    },
    {
      trigger: /skin|wound|line|soft[- ]tissue|cellulitis/i,
      coverage: /skin\/line|rash|wound|line pain|drainage|soft-tissue/i
    },
    {
      trigger: /hot joint|bone|spine|back pain/i,
      coverage: /CNS\/joint\/spine|hot swollen joint|focal bone|back pain|spine/i
    }
  ];
  return checks.some((check) => check.trigger.test(itemText) && check.coverage.test(evaluatedText));
}

function requiredDomainSynonymPatterns(domain = "") {
  const normalized = normalizedLabel(domain);
  const patterns = [];
  const add = (pattern) => patterns.push(pattern);

  if (/\bvitals?\b|\bhemodynamic/.test(normalized)) {
    add(/\b(?:vitals?|blood pressure|heart rate|respiratory rate|temperature|oxygen saturation|spo2|hypotension|tachycardia|shock|perfusion|hemodynamic)\b/);
  }
  if (/\bglycemic\b|\bdiabetes\b|\bglucose\b/.test(normalized)) {
    add(/\b(?:glycemic|glucose|blood sugar|fingerstick|a1c|hypoglycemia|hyperglycemia|diabetes)\b/);
  }
  if (/\brespiratory\b|\blungs?\b|\bwork of breathing\b/.test(normalized)) {
    add(/\b(?:respiratory|work of breathing|lung|lungs|crackles|wheeze|posterior lung sounds|oxygen|spo2|hypoxia|tachypnea)\b/);
  }
  if (/\bvolume\b|\bhydration\b|\bperfusion\b/.test(normalized)) {
    add(/\b(?:volume|hydration|dehydration|mucous membranes|capillary refill|perfusion|pulses|jvp|edema|orthostatic|shock)\b/);
  }
  if (/\bmental\b|\bmentation\b|\bconfusion\b/.test(normalized)) {
    add(/\b(?:mental status|mentation|alert|oriented|confusion|altered mental status|delirium|encephalopathy)\b/);
  }
  if (/\babdomen\b|\babdominal\b/.test(normalized)) {
    add(/\b(?:abdomen|abdominal|belly|stomach|bowel|tenderness|guarding|rebound|murphy|cva|flank)\b/);
  }
  if (/\bgenital\b|\bsti\b|\burethral\b/.test(normalized)) {
    add(/\b(?:genital|sti|urethral|discharge|ulcer|lesion|inguinal|partner|gonorrhea|chlamydia|consent)\b/);
  }
  if (/\bscrotal\b|\btesticular\b|\btorsion\b|\bacute scrotum\b/.test(normalized)) {
    add(/\b(?:scrotal|testicular|testis|torsion|cremasteric|high riding|epididymis|urology|consent)\b/);
  }
  if (/\bcranial\b|\bnerves?\b/.test(normalized)) {
    add(/\b(?:cranial nerve|facial|pupils?|visual fields?|extraocular|eye closure|palate|tongue|masseter)\b/);
  }
  if (/\bmotor\b|\bsensory\b|\blocalization\b/.test(normalized)) {
    add(/\b(?:motor|strength|pronator drift|sensory|sensation|light touch|pinprick|reflex|babinski|localization)\b/);
  }
  if (/\bcoordination\b|\bgait\b/.test(normalized)) {
    add(/\b(?:coordination|gait|finger to nose|finger-to-nose|heel to shin|heel-to-shin|romberg|tandem|ataxia|balance|cerebellar)\b/);
  }
  if (/\bdvt\b|\bleg\b/.test(normalized)) {
    add(/\b(?:dvt|unilateral leg|leg swelling|calf|lower extremity edema|dorsalis pedis|posterior tibial|pulses)\b/);
  }
  if (/\bcardiac\b|\bheart\b|\bjvp\b|\bedema\b/.test(normalized)) {
    add(/\b(?:cardiac|heart sounds?|murmur|s3|jvp|jugular|edema|perfusion|pulses|heave|strain)\b/);
  }
  if (/\bsource\b|\binfection\b/.test(normalized)) {
    add(/\b(?:source|infection|pneumonia|urinary|skin|wound|lung|cough|dysuria|cellulitis|meningitis|abdomen)\b/);
  }
  return patterns;
}

function tokenCoveredInText(token, visibleText) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(visibleText);
}

function requiredDomainCovered(domain, visibleText) {
  const normalizedVisible = normalizedLabel(visibleText);
  if (!normalizedVisible) {
    return false;
  }
  const patterns = requiredDomainSynonymPatterns(domain);
  if (patterns.some((pattern) => pattern.test(normalizedVisible))) {
    return true;
  }
  const tokens = requiredDomainTokens(domain);
  if (!tokens.length) {
    return true;
  }
  const hits = tokens.filter((token) => tokenCoveredInText(token, normalizedVisible));
  const requiredHits = tokens.length <= 2 ? 1 : Math.min(2, Math.ceil(tokens.length * 0.45));
  return hits.length >= requiredHits;
}

function structuralRequiredDomainCovered(domain = "", structure = {}) {
  const normalized = normalizedLabel(domain);
  if (/basic bedside safety/.test(normalized)) {
    return Boolean(structure.hasSafety);
  }
  if (/focused (?:endocrine )?history/.test(normalized) || /symptom history/.test(normalized)) {
    return Boolean(structure.hasHistory);
  }
  if (/guideline backed physical exam/.test(normalized) || /physical exam/.test(normalized)) {
    return Boolean(structure.hasExam);
  }
  if (/tests|reference thresholds/.test(normalized)) {
    return Boolean(structure.hasTests);
  }
  if (/red flags|management changes/.test(normalized)) {
    return Boolean(structure.hasRedFlags && structure.hasManagement);
  }
  return false;
}

function auditRequiredDomainCoverage(intentRow, visibleText, structure = {}) {
  return traceList(intentRow.required_domains || [])
    .filter(Boolean)
    .filter((domain) => !structuralRequiredDomainCovered(domain, structure))
    .filter((domain) => !requiredDomainCovered(domain, visibleText))
    .map((domain) => `required domain not represented in visible workup: ${domain}`);
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

function sourceForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    entry.source,
    entry.evidence?.source,
    candidate.source?.source_id,
    candidate.evidence_source_primary,
    candidate.source_citation
  ].filter(Boolean).join("; ").trim();
}

function managementForEntry(entry) {
  const candidate = entry.candidate || entry;
  return entry.managementImplication
    || entry.managementChange
    || entry.displayManagement
    || entry.managementRelevance
    || candidate.result_changes_management
    || candidate.management_link
    || "";
}

function suppressionReasonForEntry(entry) {
  return entry.reason
    || entry.suppressionReason
    || entry.rationale
    || entry.candidate?.suppressionReason
    || "";
}

function diagnosticTargetForEntry(entry) {
  const candidate = entry.candidate || entry;
  return entry.diagnosticPurpose
    || entry.diagnostic_target
    || entry.displayDiagnosticTarget
    || candidate.diagnostic_target
    || "";
}

function traceIdForEntry(entry) {
  const candidate = entry.candidate || entry;
  return entry.exam_id || entry.linkedExamId || candidate.exam_id || candidate.linkedExamId || "";
}

function traceIdentityKeysForEntry(entry) {
  const candidate = entry.candidate || entry;
  const traceability = entry.traceability || candidate.traceability || {};
  return Array.from(new Set([
    entry.id,
    entry.exam_id,
    entry.linkedExamId,
    entry.linkedItemId,
    candidate.id,
    candidate.exam_id,
    candidate.linkedExamId,
    traceability.evidence_row_id,
    traceability.item_id,
    traceability.linkedExamId
  ].filter(Boolean)));
}

function likelihoodRatioNoteForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    entry.likelihood_ratio_note,
    entry.likelihoodRatioNote,
    entry.LR_note,
    entry.lr_note,
    entry.evidence?.likelihood_ratio_note,
    entry.evidence?.likelihoodRatioNote,
    entry.evidence?.LR_note,
    entry.evidence?.lr_note,
    candidate.likelihood_ratio_note,
    candidate.likelihoodRatioNote,
    candidate.LR_note,
    candidate.lr_note,
    candidate.evidence?.likelihood_ratio_note
  ].filter(Boolean).join("; ").trim();
}

function feasibilityComplete(entry) {
  const candidate = entry.candidate || entry;
  return Boolean(
    (entry.feasibility?.difficulty || candidate.difficulty)
      && (entry.feasibility?.time_burden_minutes || candidate.time_burden_minutes)
      && (entry.feasibility?.equipment_needed || candidate.equipment_needed)
      && (entry.feasibility?.patient_cooperation_required || candidate.patient_cooperation_required)
  );
}

function techniqueForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    entry.technique,
    candidate.technique,
    candidate.examiner_technique,
    candidate.base?.examiner_technique,
    candidate.maneuver,
    candidate.base?.maneuver_or_finding
  ].filter(Boolean).join("; ").trim();
}

function primaryTechniqueForEntry(entry = {}) {
  const candidate = entry.candidate || entry;
  return [
    entry.technique,
    candidate.technique,
    candidate.examiner_technique,
    candidate.base?.examiner_technique
  ].find((value) => String(value || "").trim()) || "";
}

function physicalExamTechniqueTooThin(label = "", technique = "") {
  const normalizedTechnique = normalizedLabel(technique);
  return !String(technique || "").trim()
    || String(technique || "").replace(/\s+/g, " ").trim().length < 28
    || normalizedTechnique === normalizedLabel(label)
    || /^(?:exam|physical exam|thyroid exam|skin exam|skin inspection|diaphoresis inspection|tremor observation|neck circumference|rebound tenderness|murphy sign|test both legs|observe ability|observe gait|inspect abdomen|inspect posterior thorax|inspect sclerae and conjunctivae|focused muscle tenderness)$/i.test(String(technique || "").trim());
}

function registryStyleSourceId(value = "") {
  const text = String(value || "").trim();
  return /^[A-Z][A-Z0-9_:-]{1,}$/.test(text)
    && !/^https?:\/\//i.test(text)
    && !/\s/.test(text)
    && !/[.,()]/.test(text);
}

function whenToUseForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    entry.whenToUse,
    candidate.when_to_use_structured,
    candidate.base?.include_when,
    candidate.condition_or_syndrome
  ].filter(Boolean).join("; ").trim();
}

function limitationsForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    entry.limitations,
    entry.interpretationCautions,
    candidate.limitations,
    candidate.contraindications_or_limitations,
    candidate.base?.limitations,
    candidate.base?.contraindications_or_limitations
  ].filter(Boolean).join("; ").trim();
}

function hasLikelihoodRatioFields(entry) {
  const candidate = entry.candidate || entry;
  const evidence = entry.evidence || {};
  const hasLrPlus = Object.prototype.hasOwnProperty.call(entry, "LR_plus")
    || Object.prototype.hasOwnProperty.call(entry, "lrPlus")
    || Object.prototype.hasOwnProperty.call(evidence, "LR_plus")
    || Object.prototype.hasOwnProperty.call(evidence, "lrPlus")
    || Object.prototype.hasOwnProperty.call(candidate, "LR_plus")
    || Object.prototype.hasOwnProperty.call(candidate, "lrPlus");
  const hasLrMinus = Object.prototype.hasOwnProperty.call(entry, "LR_minus")
    || Object.prototype.hasOwnProperty.call(entry, "lrMinus")
    || Object.prototype.hasOwnProperty.call(evidence, "LR_minus")
    || Object.prototype.hasOwnProperty.call(evidence, "lrMinus")
    || Object.prototype.hasOwnProperty.call(candidate, "LR_minus")
    || Object.prototype.hasOwnProperty.call(candidate, "lrMinus");
  return hasLrPlus && hasLrMinus;
}

function tagsForEntry(entry) {
  const candidate = entry.candidate || entry;
  return [
    ...(entry.tags || []),
    ...(entry.matchedTags || []),
    ...(entry.retrievalTags || []),
    ...(candidate.matchedTags || []),
    ...(candidate.tags || []),
    candidate.retrieval_tags
  ].filter(Boolean).join("; ").trim();
}

function traceList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function intentTraceIdsForEntry(entry) {
  const candidate = entry.candidate || entry;
  const traceability = entry.traceability || candidate.traceability || {};
  return Array.from(new Set([
    ...traceList(traceability.intent_ids),
    ...traceList(entry.validatedIntentIds),
    ...traceList(candidate.validated_intent_ids)
  ].filter(Boolean)));
}

function recommendationForIntent(intentRow) {
  const selectedIntents = selectedValidatedClinicalIntents([intentRow.intent_id]);
  const filteredCatalog = filterEvidenceCatalogForClinicalIntents(catalog, selectedIntents);
  const context = buildClinicalIntentRetrievalContext(
    selectedIntents,
    "",
    "General medicine",
    "Adult"
  );
  const ranked = rankEvidenceCandidates(filteredCatalog, context, tagRows, {
    maxCandidates: 90,
    specialty: "General medicine"
  });
  return buildRecommendedExamChecklist(context, ranked, {
    specialty: "General medicine",
    maxCoreItems: 28,
    maxConditionalItems: 44,
    validatedIntents: selectedIntents,
    catalogGapRegistryRows: gapRows
  });
}

function assertModuleBackedEvidenceRecommendation({
  intentId,
  requiredProfiles = [],
  forbiddenProfiles = [],
  requiredCoreLabels = [],
  forbiddenCoreLabels = []
}) {
  const intentRow = clinicalIntentRegistry.find((row) => row.intent_id === intentId);
  assert.ok(intentRow, `missing module-backed intent regression target: ${intentId}`);
  const recommendation = recommendationForIntent(intentRow);
  const activeProfileIds = new Set((recommendation.activeProfiles || []).map((profile) => profile.id));
  const coreLabels = new Set((recommendation.corePhysicalExamManeuvers || []).map((entry) => normalizedLabel(entry.label)));

  assert.ok(
    (recommendation.validatedIntentIds || []).includes(intentId),
    `${intentId}: recommendation should carry validated intent trace`
  );
  assert.ok(
    activeProfileIds.size > 0,
    `${intentId}: module-backed evidence recommendation should activate at least one deterministic profile`
  );
  requiredProfiles.forEach((profileId) => {
    assert.ok(activeProfileIds.has(profileId), `${intentId}: expected active profile ${profileId}`);
  });
  forbiddenProfiles.forEach((profileId) => {
    assert.ok(!activeProfileIds.has(profileId), `${intentId}: unexpected active profile ${profileId}`);
  });
  requiredCoreLabels.forEach((label) => {
    assert.ok(coreLabels.has(normalizedLabel(label)), `${intentId}: expected core exam ${label}`);
  });
  forbiddenCoreLabels.forEach((label) => {
    assert.ok(!coreLabels.has(normalizedLabel(label)), `${intentId}: unexpected core exam ${label}`);
  });
}

function auditRecommendation(intentRow, recommendation) {
  const issues = [];
  const safety = recommendation.basicSafetyChecks || [];
  const history = recommendation.focusedHistoryQuestions || [];
  const managementFindings = recommendation.managementChangingFindings || [];
  const interpretationCautions = recommendation.limitationsAndInterpretationCautions || [];
  const evidenceMetadata = recommendation.evidenceAndLikelihoodMetadata || [];
  const evidenceMetadataAlias = recommendation.evidenceMetadata || [];
  const catalogGaps = recommendation.catalogGapsNeedingReview || [];
  const coreExams = recommendation.corePhysicalExamManeuvers || [];
  const conditionalExams = recommendation.conditionalPhysicalExamManeuvers || [];
  const legacyCoreAlias = recommendation.coreItems || [];
  const legacyConditionalAlias = recommendation.conditionalItems || [];
  const tests = recommendation.initialTestsAndReferenceThresholds || [];
  const redFlags = recommendation.redFlagsAndEscalationCues || [];
  const suppressed = recommendation.suppressedItems || [];
  const examEntries = [...coreExams, ...conditionalExams];
  const recommendationEntries = [...safety, ...history, ...examEntries, ...tests, ...redFlags];
  const renderedItemIdentityKeys = new Set([
    ...safety,
    ...history,
    ...examEntries,
    ...tests,
    ...redFlags,
    ...managementFindings,
    ...interpretationCautions
  ].flatMap(traceIdentityKeysForEntry));
  const coveredBySameTopicModule = intentHasSameTopicComplaintModule(intentRow);
  const hasCatalogGapOfType = (patterns = []) => catalogGaps.some((gap) => {
    const typeText = `${gap.gapType || ""} ${gap.traceability?.gap_type || ""}`.toLowerCase();
    return patterns.some((pattern) => pattern.test(typeText));
  });

  if (!safety.length) {
    issues.push("missing basic bedside data/safety checks");
  }
  if (!history.length) {
    issues.push("missing focused history questions");
  }
  if (!coreExams.length) {
    issues.push("missing core physical exam maneuvers");
  }
  legacyCoreAlias
    .filter(isNonExamCompatibilityAliasEntry)
    .forEach((entry) => {
      issues.push(`coreItems compatibility alias contains non-exam entry: ${entry.label || entry.exam_id}`);
    });
  legacyConditionalAlias
    .filter(isNonExamCompatibilityAliasEntry)
    .forEach((entry) => {
      issues.push(`conditionalItems compatibility alias contains non-exam entry: ${entry.label || entry.exam_id}`);
    });
  if (intentRow.knowledge_pack_id && !conditionalExams.length && !hasCatalogGapOfType([/exam_maneuver/])) {
    issues.push("missing conditional physical exam add-ons section or staged completeness gap");
  }
  if (!managementFindings.length) {
    issues.push("missing management-changing findings");
  }
  if (!interpretationCautions.length) {
    issues.push("missing limitations and interpretation cautions");
  }
  if (!evidenceMetadata.length) {
    issues.push("missing evidence/LR metadata");
  }
  if (!Array.isArray(recommendation.suppressedItems)) {
    issues.push("missing suppressed/not-recommended audit section");
  }
  if (!Array.isArray(recommendation.catalogGapsNeedingReview)) {
    issues.push("missing catalog gaps needing review section");
  }
  if (!Array.isArray(recommendation.evidenceMetadata)) {
    issues.push("missing evidenceMetadata compatibility alias");
  } else if (evidenceMetadataAlias.length !== evidenceMetadata.length) {
    issues.push("evidenceMetadata alias does not match evidenceAndLikelihoodMetadata length");
  } else {
    const canonicalKeys = evidenceMetadata.map((row) => normalizedLabel(`${row.id || ""} ${row.label || ""} ${row.linkedExamId || ""}`));
    const aliasKeys = evidenceMetadataAlias.map((row) => normalizedLabel(`${row.id || ""} ${row.label || ""} ${row.linkedExamId || ""}`));
    if (canonicalKeys.join("|") !== aliasKeys.join("|")) {
      issues.push("evidenceMetadata alias rows do not match evidenceAndLikelihoodMetadata rows");
    }
  }
  if (!coveredBySameTopicModule
    && !recommendation.initialTestsAndReferenceThresholds?.length
    && !hasCatalogGapOfType([/diagnostic_test/, /reference_threshold/])) {
    issues.push("missing initial tests/reference thresholds section or staged completeness gap");
  }
  if (!coveredBySameTopicModule
    && !recommendation.redFlagsAndEscalationCues?.length
    && !hasCatalogGapOfType([/red_flag/])) {
    issues.push("missing red flags/escalation section or staged completeness gap");
  }
  const visibleText = visibleRecommendationText(recommendation);
  if (genericEndocrineSafetyTestPattern.test(visibleText)) {
    issues.push("visible workup contains generic endocrine safety-labs sentence instead of diagnosis-specific testing anchor");
  }
  issues.push(...auditRequiredDomainCoverage(intentRow, visibleText, {
    hasSafety: safety.length > 0,
    hasHistory: history.length > 0,
    hasExam: examEntries.length > 0,
    hasTests: tests.length > 0,
    hasRedFlags: redFlags.length > 0,
    hasManagement: managementFindings.length > 0
  }));
  if (!(recommendation.validatedIntentIds || []).includes(intentRow.intent_id)) {
    issues.push("recommendation missing selected validated intent trace");
  }
  if (!(intentRow.suppress_rules || []).length) {
    issues.push("intent missing suppress_rules");
  } else {
    const suppressLabels = new Set((intentRow.suppress_rules || []).flatMap((rule) => rule.suppress_labels || []));
    (intentRow.avoid_labels || []).forEach((label) => {
      if (!suppressLabels.has(label)) {
        issues.push(`intent suppress_rules missing avoid label: ${label}`);
      }
    });
  }
  for (const issue of recommendation.qualityIssues || []) {
    issues.push(`${issue.severity} quality issue ${issue.type}: ${issue.label}`);
  }

  const seenLabels = new Set();
  const duplicateScopeEntries = [...safety, ...examEntries, ...tests, ...redFlags];
  duplicateScopeEntries.forEach((entry) => {
    const label = entry.label || entry.candidate?.examLabel || entry.exam_id || "";
    const labelKey = normalizedLabel(label);
    if (labelKey && seenLabels.has(labelKey)) {
      issues.push(`duplicate recommendation label: ${label}`);
    }
    seenLabels.add(labelKey);
    if (!traceIdForEntry(entry)) {
      issues.push(`missing traceable exam_id: ${label}`);
    }
    if (!intentTraceIdsForEntry(entry).includes(intentRow.intent_id)) {
      issues.push(`missing validated intent trace: ${label}`);
    }
    if (!sourceForEntry(entry)) {
      issues.push(`missing source metadata: ${label}`);
    }
    if (!diagnosticTargetForEntry(entry)) {
      issues.push(`missing diagnostic target: ${label}`);
    }
    if (!managementForEntry(entry)) {
      issues.push(`missing management implication: ${label}`);
    }
    if (!feasibilityComplete(entry)) {
      issues.push(`missing feasibility metadata: ${label}`);
    }
    if (hasLikelihoodRatioFields(entry) && !likelihoodRatioNoteForEntry(entry)) {
      issues.push(`missing LR interpretation note: ${label}`);
    }
  });

  history.forEach((question) => {
    const label = question.text || question.label || question.id || "";
    const displayLabel = question.displayLabel || question.label || "";
    if (vagueFocusedHistoryLabelPattern.test(displayLabel)) {
      issues.push(`history question display label is too vague for clinical use: ${displayLabel}`);
    }
    if (!traceIdForEntry(question)) {
      issues.push(`history question missing traceable exam_id: ${label}`);
    }
    if (!intentTraceIdsForEntry(question).includes(intentRow.intent_id)) {
      issues.push(`history question missing validated intent trace: ${label}`);
    }
    if (!sourceForEntry(question)) {
      issues.push(`history question missing source metadata: ${label}`);
    }
    if (!diagnosticTargetForEntry(question)) {
      issues.push(`history question missing diagnostic target: ${label}`);
    }
    if (!managementForEntry(question)) {
      issues.push(`history question missing management implication: ${label}`);
    }
    if (!tagsForEntry(question)) {
      issues.push(`history question missing retrieval/evidence tags: ${label}`);
    }
    if (hasLikelihoodRatioFields(question) && !likelihoodRatioNoteForEntry(question)) {
      issues.push(`history question missing LR interpretation note: ${label}`);
    }
    if (historyQuestionNeedsDetailPrompts(question) && !(question.detail_prompts || []).length) {
      issues.push(`broad history question missing concrete detail prompts: ${label}`);
    }
  });

  [...tests, ...redFlags].forEach((entry) => {
    const label = entry.label || entry.candidate?.examLabel || entry.exam_id || "";
    if (!traceIdForEntry(entry)) {
      issues.push(`test/red-flag item missing traceable exam_id: ${label}`);
    }
    if (!intentTraceIdsForEntry(entry).includes(intentRow.intent_id)) {
      issues.push(`test/red-flag item missing validated intent trace: ${label}`);
    }
    if (!sourceForEntry(entry)) {
      issues.push(`test/red-flag item missing source metadata: ${label}`);
    }
    if (!diagnosticTargetForEntry(entry)) {
      issues.push(`test/red-flag item missing diagnostic target: ${label}`);
    }
    if (!managementForEntry(entry)) {
      issues.push(`test/red-flag item missing management implication: ${label}`);
    }
    if (!feasibilityComplete(entry)) {
      issues.push(`test/red-flag item missing feasibility metadata: ${label}`);
    }
    if (!hasLikelihoodRatioFields(entry)) {
      issues.push(`test/red-flag item missing LR metadata fields: ${label}`);
    }
    if (!tagsForEntry(entry)) {
      issues.push(`test/red-flag item missing retrieval/evidence tags: ${label}`);
    }
    if (/need review|source pending|reviewer needed|not yet have/i.test([
      label,
      entry.reason,
      diagnosticTargetForEntry(entry),
      managementForEntry(entry),
      sourceForEntry(entry)
    ].filter(Boolean).join(" "))) {
      issues.push(`validated test/red-flag item still looks like an unresolved placeholder: ${label}`);
    }
  });

  safety.forEach((entry) => {
    const label = entry.label || entry.candidate?.examLabel || entry.exam_id || "";
    const normalized = normalizedLabel(label);
    const examId = traceIdForEntry(entry);
    const candidate = entry.candidate || {};
    if (bareRoutineSafetyNounLabels.has(normalized)) {
      issues.push(`routine safety item should name the bedside action, not just the vital-sign noun: ${label}`);
    }
    if (routineSafetyNormalizedLabels.has(normalized)) {
      if (!actionSpecificRoutineSafetyLabelPattern.test(normalized)) {
        issues.push(`routine safety item should name the bedside action, not just the vital-sign noun: ${label}`);
      }
      if (!/^SAFETY-/i.test(examId)) {
        issues.push(`routine safety item should use modeled SAFETY-* id, not raw catalog/gap data: ${label} (${examId})`);
      }
      if (candidate.bedside_question_label || entry.displayBedsideQuestion) {
        issues.push(`routine safety item should not carry a bedside question: ${label}`);
      }
    }
    if (/^GAP-vitals-/i.test(examId)) {
      issues.push(`routine vital staged gap should be replaced by modeled safety floor: ${label} (${examId})`);
    }
    if (genericFindingsOptions(findingsOptionsForEntry(entry))) {
      issues.push(`safety check has generic findings/options instead of specific bedside values: ${label}`);
    }
    if (weakSafetyCheckLabelPattern.test(normalized)) {
      issues.push(`safety check label should name a specific bedside action: ${label}`);
    }
    if (!actionSpecificSafetyLabelPattern.test(normalized)) {
      issues.push(`safety check label should start with a specific bedside action: ${label}`);
    }
  });

  examEntries.forEach((entry) => {
    const label = entry.label || "";
    if (isBasicSafetyCheckEntry(entry) || vitalsOrSafetyLabelPattern.test(label)) {
      issues.push(`safety/basic data item appears in physical exam section: ${label}`);
    }
    if (bundledLabelPattern.test(label)) {
      issues.push(`possibly bundled physical exam label: ${label}`);
    }
    issues.push(...physicalExamLabelAtomicityIssues(label));
    if (!techniqueForEntry(entry)) {
      issues.push(`physical exam missing bedside technique: ${label}`);
    }
    if (physicalExamTechniqueTooThin(label, primaryTechniqueForEntry(entry))) {
      issues.push(`physical exam technique is too terse or placeholder-like: ${label}`);
    }
    if (!whenToUseForEntry(entry)) {
      issues.push(`physical exam missing when-to-use metadata: ${label}`);
    }
    if (!limitationsForEntry(entry)) {
      issues.push(`physical exam missing limitations/interpretation cautions: ${label}`);
    }
    if (!hasLikelihoodRatioFields(entry)) {
      issues.push(`physical exam missing LR metadata fields: ${label}`);
    }
    if (!tagsForEntry(entry)) {
      issues.push(`physical exam missing retrieval/evidence tags: ${label}`);
    }
    if (genericFindingsOptions(findingsOptionsForEntry(entry))) {
      issues.push(`physical exam has generic findings/options instead of maneuver-specific documentation choices: ${label}`);
    }
  });
  issues.push(...duplicateCoreExamFamilyIssues(examEntries));

  suppressed.slice(0, 12).forEach((entry) => {
    const label = entry.label || entry.candidate?.examLabel || entry.exam_id || "";
    const reason = suppressionReasonForEntry(entry);
    if (!reason) {
      issues.push(`suppressed item missing why-not-recommended reason: ${label}`);
    }
    if (/selected validated clinical intent did not define/i.test(reason)) {
      issues.push(`suppressed item uses generic intent-scope reason: ${label}`);
    }
    if (!traceIdForEntry(entry)) {
      issues.push(`suppressed item missing traceable exam_id: ${label}`);
    }
    if (!intentTraceIdsForEntry(entry).includes(intentRow.intent_id)) {
      issues.push(`suppressed item missing validated intent trace: ${label}`);
    }
    if (!sourceForEntry(entry)) {
      issues.push(`suppressed item missing source metadata: ${label}`);
    }
    if (!diagnosticTargetForEntry(entry)) {
      issues.push(`suppressed item missing diagnostic target: ${label}`);
    }
    if (!managementForEntry(entry)) {
      issues.push(`suppressed item missing management implication: ${label}`);
    }
    if (!feasibilityComplete(entry)) {
      issues.push(`suppressed item missing feasibility metadata: ${label}`);
    }
    if (!hasLikelihoodRatioFields(entry)) {
      issues.push(`suppressed item missing LR metadata fields: ${label}`);
    }
    if (!tagsForEntry(entry)) {
      issues.push(`suppressed item missing retrieval/evidence tags: ${label}`);
    }
  });

  history.forEach((question) => {
    if (!question.text) {
      issues.push("history question missing text");
    }
    if (!question.options) {
      issues.push(`history question missing answer options: ${question.text || question.id}`);
    }
    if (!question.whenToAsk) {
      issues.push(`history question missing when-to-ask metadata: ${question.text || question.id}`);
    }
    if (!question.diagnosticPurpose) {
      issues.push(`history question missing diagnostic purpose: ${question.text || question.id}`);
    }
    if (!question.managementImplication) {
      issues.push(`history question missing management implication: ${question.text || question.id}`);
    }
    if (!question.source) {
      issues.push(`history question missing source: ${question.text || question.id}`);
    }
    if (!tagsForEntry(question)) {
      issues.push(`history question missing tags: ${question.text || question.id}`);
    }
    if (!question.traceability) {
      issues.push(`history question missing traceability: ${question.text || question.id}`);
    }
    if (!intentTraceIdsForEntry(question).includes(intentRow.intent_id)) {
      issues.push(`history question missing validated intent trace: ${question.text || question.id}`);
    }
    if (historyQuestionNeedsDetailPrompts(question) && !(question.detail_prompts || []).length) {
      issues.push(`broad history question missing concrete detail prompts: ${question.text || question.id}`);
    }
  });

  managementFindings.forEach((finding) => {
    if (!finding.label) {
      issues.push("management-changing finding missing label");
    }
    if (!finding.managementChange) {
      issues.push(`management-changing finding missing management change: ${finding.label || finding.id}`);
    }
    if (!finding.source) {
      issues.push(`management-changing finding missing source: ${finding.label || finding.id}`);
    }
    if (!tagsForEntry(finding)) {
      issues.push(`management-changing finding missing tags: ${finding.label || finding.id}`);
    }
    if (!hasLikelihoodRatioFields(finding)) {
      issues.push(`management-changing finding missing LR metadata fields: ${finding.label || finding.id}`);
    }
    if (!likelihoodRatioNoteForEntry(finding)) {
      issues.push(`management-changing finding missing LR interpretation note: ${finding.label || finding.id}`);
    }
    if (!finding.traceability) {
      issues.push(`management-changing finding missing traceability: ${finding.label || finding.id}`);
    }
    if (!intentTraceIdsForEntry(finding).includes(intentRow.intent_id)) {
      issues.push(`management-changing finding missing validated intent trace: ${finding.label || finding.id}`);
    }
  });

  interpretationCautions.forEach((caution) => {
    if (!caution.label) {
      issues.push("interpretation caution missing label");
    }
    if (!caution.limitation && !caution.interpretationCaution) {
      issues.push(`interpretation caution missing caution text: ${caution.label || caution.id}`);
    }
    if (!caution.source) {
      issues.push(`interpretation caution missing source: ${caution.label || caution.id}`);
    }
    if (!tagsForEntry(caution)) {
      issues.push(`interpretation caution missing tags: ${caution.label || caution.id}`);
    }
    if (!hasLikelihoodRatioFields(caution)) {
      issues.push(`interpretation caution missing LR metadata fields: ${caution.label || caution.id}`);
    }
    if (!likelihoodRatioNoteForEntry(caution)) {
      issues.push(`interpretation caution missing LR interpretation note: ${caution.label || caution.id}`);
    }
    if (!caution.traceability) {
      issues.push(`interpretation caution missing traceability: ${caution.label || caution.id}`);
    }
    if (!intentTraceIdsForEntry(caution).includes(intentRow.intent_id)) {
      issues.push(`interpretation caution missing validated intent trace: ${caution.label || caution.id}`);
    }
  });

  evidenceMetadata.forEach((metadata) => {
    if (!metadata.label) {
      issues.push("evidence/LR metadata missing label");
    }
    if (!metadata.source) {
      issues.push(`evidence/LR metadata missing source: ${metadata.label || metadata.id}`);
    }
    if (!metadata.evidence || !Object.prototype.hasOwnProperty.call(metadata.evidence, "LR_plus") || !Object.prototype.hasOwnProperty.call(metadata.evidence, "LR_minus")) {
      issues.push(`evidence/LR metadata missing LR fields: ${metadata.label || metadata.id}`);
    }
    if (!likelihoodRatioNoteForEntry(metadata)) {
      issues.push(`evidence/LR metadata missing LR interpretation note: ${metadata.label || metadata.id}`);
    }
    if (!tagsForEntry(metadata)) {
      issues.push(`evidence/LR metadata missing tags: ${metadata.label || metadata.id}`);
    }
    if (!metadata.traceability) {
      issues.push(`evidence/LR metadata missing traceability: ${metadata.label || metadata.id}`);
    }
    if (!intentTraceIdsForEntry(metadata).includes(intentRow.intent_id)) {
      issues.push(`evidence/LR metadata missing validated intent trace: ${metadata.label || metadata.id}`);
    }
    const metadataKeys = traceIdentityKeysForEntry(metadata);
    if (!metadataKeys.some((key) => renderedItemIdentityKeys.has(key))) {
      issues.push(`evidence/LR metadata does not link to a rendered recommendation item: ${metadata.label || metadata.id}`);
    }
  });

  catalogGaps.forEach((gap) => {
    const generatedCompletenessGap = Boolean(gap.traceability?.generated_completeness_gap
      || (gap.tags || []).includes("workup_completeness_gap"));
    if (!gap.gapId || !/^GAP-/.test(gap.gapId)) {
      issues.push(`catalog gap should keep GAP-* staged ID: ${gap.label || gap.gapId || "unlabeled gap"}`);
    }
    if (!gapRegistryIds.has(gap.gapId) && !generatedCompletenessGap) {
      issues.push(`catalog gap missing registry row: ${gap.label || gap.gapId}`);
    }
    if (gap.reviewStatus !== "staged_gap") {
      issues.push(`catalog gap should remain staged_gap: ${gap.label || gap.gapId}`);
    }
    if (!gap.reviewOwner || !gap.lastReviewed) {
      issues.push(`catalog gap missing registry review metadata: ${gap.label || gap.gapId}`);
    }
    if (!gap.rationale) {
      issues.push(`catalog gap missing rationale: ${gap.label || gap.gapId}`);
    }
    if (!gap.resolutionPlan) {
      issues.push(`catalog gap missing resolution plan: ${gap.label || gap.gapId}`);
    }
    if (!gap.source && !(gap.sourceIds || []).length) {
      issues.push(`catalog gap missing source metadata: ${gap.label || gap.gapId}`);
    }
    if (!tagsForEntry(gap)) {
      issues.push(`catalog gap missing activation tags: ${gap.label || gap.gapId}`);
    }
    if (!gap.traceability?.catalog_gap || gap.traceability?.authorized_by !== "staged_catalog_gap") {
      issues.push(`catalog gap missing staged traceability: ${gap.label || gap.gapId}`);
    }
    if (!intentTraceIdsForEntry(gap).includes(intentRow.intent_id)) {
      issues.push(`catalog gap missing validated intent trace: ${gap.label || gap.gapId}`);
    }
    if ((gap.gapType === "safety_check" || gap.traceability?.gap_type === "safety_check")
      && examEntries.some((entry) => traceIdForEntry(entry) === gap.gapId)) {
      issues.push(`safety catalog gap appears in physical exam section: ${gap.label || gap.gapId}`);
    }
  });

  return issues.map((issue) => `${intentRow.intent_id}: ${issue}`);
}

const complaintModuleById = new Map(complaintModules.map((module) => [module.id, module]));

function sourceIdForModuleItem(item) {
  return item.source?.source_id || item.source_id || "";
}

function sourceMetadataCompleteForModuleItem(item) {
  return Boolean(
    item.source?.source_id
      && item.source?.source_section
      && item.source?.evidence_strength
      && item.source?.version_date
      && item.source?.last_reviewed
      && item.source?.clinical_owner
  );
}

function missingModuleItemFields(item = {}, fields = []) {
  return fields.filter((field) => {
    const value = item[field];
    return !value || (Array.isArray(value) && !value.length);
  });
}

function auditEvaluatedHistoryQuestion(item, issues, intentRow, labelPrefix = "history question") {
  if (!intentTraceIdsForEntry(item).includes(intentRow.intent_id)) {
    issues.push(`${labelPrefix} missing validated intent trace: ${item.label}`);
  }
  if (!item.text || !/\?$/.test(String(item.text || "").trim())) {
    issues.push(`${labelPrefix} is not askable: ${item.label}`);
  }
  if (genericHistoryQuestionPattern.test(`${item.text || ""} ${item.label || ""}`)) {
    issues.push(`${labelPrefix} uses generic relevance boilerplate: ${item.label}`);
  }
  if (!item.options?.length) {
    issues.push(`${labelPrefix} missing options: ${item.label}`);
  }
  if (!item.when_to_ask || !item.diagnostic_purpose || !item.management_implication) {
    issues.push(`${labelPrefix} missing purpose/management metadata: ${item.label}`);
  }
  if (!sourceIdForModuleItem(item)) {
    issues.push(`${labelPrefix} missing source: ${item.label}`);
  }
  if (!sourceMetadataCompleteForModuleItem(item)) {
    issues.push(`${labelPrefix} missing complete source metadata: ${item.label}`);
  }
  if (!item.tags?.length) {
    issues.push(`${labelPrefix} missing tags: ${item.label}`);
  }
  if (!item.likelihood_ratio_note) {
    issues.push(`${labelPrefix} missing LR interpretation note: ${item.label}`);
  }
  if (historyQuestionNeedsDetailPrompts(item) && !(item.detail_prompts || []).length) {
    issues.push(`${labelPrefix} missing concrete detail prompts: ${item.label}`);
  }
}

function auditEvaluatedPhysicalExam(item, issues, intentRow, labelPrefix = "module physical exam") {
  if (!intentTraceIdsForEntry(item).includes(intentRow.intent_id)) {
    issues.push(`${labelPrefix} missing validated intent trace: ${item.label}`);
  }
  if (isBasicBedsideDataItem(item)) {
    issues.push(`basic bedside data appears in ${labelPrefix}: ${item.label}`);
  }
  if (bundledLabelPattern.test(item.label || "")) {
    issues.push(`possibly bundled ${labelPrefix} label: ${item.label}`);
  }
  issues.push(...physicalExamLabelAtomicityIssues(item.label || "").map((issue) => `${labelPrefix} ${issue}`));
  if (!sourceIdForModuleItem(item)) {
    issues.push(`${labelPrefix} missing source: ${item.label}`);
  }
  if (!sourceMetadataCompleteForModuleItem(item)) {
    issues.push(`${labelPrefix} missing complete source metadata: ${item.label}`);
  }
  for (const field of ["technique", "findings_options", "when_to_perform", "diagnostic_target", "LR_plus", "LR_minus", "management_change", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "tags"]) {
    const value = item[field];
    if (!value || (Array.isArray(value) && !value.length)) {
      issues.push(`${labelPrefix} missing ${field}: ${item.label}`);
    }
  }
  if (!item.likelihood_ratio_note) {
    issues.push(`${labelPrefix} missing LR interpretation note: ${item.label}`);
  }
  if (genericFindingsOptions(item.findings_options || item.findingsOptions || item.options)) {
    issues.push(`${labelPrefix} has generic findings/options instead of maneuver-specific documentation choices: ${item.label}`);
  }
  if (/^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_plus || "")) && /^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_minus || "")) && !/not applicable|not available|No maneuver-specific LR/i.test(item.likelihood_ratio_note || "")) {
    issues.push(`${labelPrefix} has silent unavailable LR metadata: ${item.label}`);
  }
  if (/\bperform the named (?:bedside item|maneuver) directly\b/i.test(item.technique || "")) {
    issues.push(`${labelPrefix} has placeholder technique: ${item.label}`);
  }
  if (/\bfocused bedside finding relevant to\b/i.test(item.diagnostic_target || "")) {
    issues.push(`${labelPrefix} has generic diagnostic target: ${item.label}`);
  }
  if (genericExamRationalePattern.test(item.rationale || "")) {
    issues.push(`${labelPrefix} has generic rationale: ${item.label}`);
  }
}

function auditModuleBackedIntent(intentRow) {
  const issues = [];
  const module = complaintModuleById.get(intentRow.complaint_module_id || "");
  if (!module) {
    return [`${intentRow.intent_id}: missing installed complaint module ${intentRow.complaint_module_id || "blank"}`];
  }
  const result = evaluateComplaintCds(module.label, {}, {
    module,
    validatedIntents: [intentRow]
  });
  if (!result.matched) {
    issues.push(`installed module did not evaluate: ${module.id}`);
  }
  if (!(result.safetyChecks || []).length) {
    issues.push("missing module safety checks");
  }
  if (!(result.requiredQuestions || []).length) {
    issues.push("missing module focused history questions");
  }
  if (!(result.focusedExam || []).length) {
    issues.push("missing module physical exam maneuvers");
  }
  if (!(result.initialTests || []).length) {
    issues.push("missing module tests/reference thresholds");
  }
  if (!(result.dispositionRules || []).length) {
    issues.push("missing module management-changing findings");
  }
  if (!(result.limitationsAndInterpretationCautions || []).length) {
    issues.push("missing module limitations and interpretation cautions");
  }
  if (!(result.redFlags || []).length) {
    issues.push("missing module red flags");
  }
  if ((module.requiredQuestions || []).length > 10) {
    issues.push(`module has too many required history questions: ${(module.requiredQuestions || []).length}`);
  }
  if ((result.requiredQuestions || []).length + (result.conditionalQuestions || []).length > 14) {
    issues.push(`active history question set is not focused enough: ${(result.requiredQuestions || []).length + (result.conditionalQuestions || []).length}`);
  }
  if ((module.conditionalQuestions || []).some((item) => !item.when?.termsAny?.length && !item.when?.answersAny?.length && !item.when?.termsAll?.length && !item.when?.answersAll?.length)) {
    issues.push("conditional history questions require structured activation triggers");
  }
  if ((module.conditionalExam || []).some((item) => !item.when?.termsAny?.length && !item.when?.answersAny?.length && !item.when?.termsAll?.length && !item.when?.answersAll?.length)) {
    issues.push("conditional exam add-ons require structured activation triggers");
  }
  if (!(module.conditionalExam || []).length
    && !(result.catalogGapsNeedingReview || []).some((gap) => /Conditional physical exam add-ons need review/i.test(gap.label || ""))) {
    issues.push("missing module conditional physical exam add-ons or staged completeness gap");
  }
  if ((result.conditionalQuestions || []).length) {
    issues.push(`conditional history add-ons activated from diagnosis label alone: ${(result.conditionalQuestions || []).map((item) => item.label).join("; ")}`);
  }
  if ((result.conditionalExam || []).length) {
    issues.push(`conditional exam add-ons activated from diagnosis label alone: ${(result.conditionalExam || []).map((item) => item.label).join("; ")}`);
  }
  const visibleText = visibleModuleResultText(result);
  if (genericEndocrineSafetyTestPattern.test(visibleText)) {
    issues.push("module-backed workup contains generic endocrine safety-labs sentence instead of diagnosis-specific testing anchor");
  }
  issues.push(...attendingBaselineIssuesForModule(intentRow, module, result));
  issues.push(...auditRequiredDomainCoverage(intentRow, visibleText, {
    hasSafety: (result.safetyChecks || []).length > 0,
    hasHistory: (result.requiredQuestions || []).length > 0 || (result.conditionalQuestions || []).length > 0,
    hasExam: (result.focusedExam || []).length > 0 || (result.conditionalExam || []).length > 0,
    hasTests: (result.initialTests || []).length > 0,
    hasRedFlags: (result.redFlags || []).length > 0,
    hasManagement: (result.dispositionRules || []).length > 0
  }));

  [
    ["red flag", result.redFlags || [], ["action", "rationale", "tags"]],
    ["initial test/reference", result.initialTests || [], ["action", "rationale", "tags"]],
    ["management/disposition", result.dispositionRules || [], ["action", "rationale", "tags"]],
    ["differential bucket", result.differentialBuckets || [], ["action", "rationale"]]
  ].forEach(([label, items, requiredFields]) => {
    items.forEach((item) => {
      if (!intentTraceIdsForEntry(item).includes(intentRow.intent_id)) {
        issues.push(`${label} missing validated intent trace: ${item.label}`);
      }
      if (!sourceIdForModuleItem(item)) {
        issues.push(`${label} missing source: ${item.label}`);
      }
      if (!sourceMetadataCompleteForModuleItem(item)) {
        issues.push(`${label} missing complete source metadata: ${item.label}`);
      }
      const missingFields = missingModuleItemFields(item, requiredFields);
      if (missingFields.length) {
        issues.push(`${label} missing ${missingFields.join(", ")}: ${item.label}`);
      }
    });
  });

  (result.limitationsAndInterpretationCautions || []).forEach((item) => {
    if (!intentTraceIdsForEntry(item).includes(intentRow.intent_id)) {
      issues.push(`interpretation caution missing validated intent trace: ${item.label}`);
    }
    if (!sourceIdForModuleItem(item)) {
      issues.push(`interpretation caution missing source: ${item.label}`);
    }
    if (!sourceMetadataCompleteForModuleItem(item)) {
      issues.push(`interpretation caution missing complete source metadata: ${item.label}`);
    }
    if (!item.limitation && !item.interpretation_cautions) {
      issues.push(`interpretation caution missing caution text: ${item.label}`);
    }
    if (!item.diagnostic_target) {
      issues.push(`interpretation caution missing diagnostic target: ${item.label}`);
    }
    if (!item.tags?.length) {
      issues.push(`interpretation caution missing tags: ${item.label}`);
    }
    if (!Object.prototype.hasOwnProperty.call(item, "LR_plus") || !Object.prototype.hasOwnProperty.call(item, "LR_minus")) {
      issues.push(`interpretation caution missing LR metadata fields: ${item.label}`);
    }
    if (!item.likelihood_ratio_note) {
      issues.push(`interpretation caution missing LR interpretation note: ${item.label}`);
    }
  });

  (result.safetyChecks || []).forEach((item) => {
    if (!intentTraceIdsForEntry(item).includes(intentRow.intent_id)) {
      issues.push(`safety item missing validated intent trace: ${item.label}`);
    }
    if (!isBasicBedsideDataItem(item)) {
      issues.push(`safety item is not recognizable as basic bedside data: ${item.label}`);
    }
    if (!sourceIdForModuleItem(item)) {
      issues.push(`safety item missing source: ${item.label}`);
    }
    if (!sourceMetadataCompleteForModuleItem(item)) {
      issues.push(`safety item missing complete source metadata: ${item.label}`);
    }
    if (!item.management_change) {
      issues.push(`safety item missing management implication: ${item.label}`);
    }
    if (!item.action) {
      issues.push(`safety item missing action: ${item.label}`);
    }
    if (!item.tags?.length) {
      issues.push(`safety item missing tags: ${item.label}`);
    }
    if (!item.difficulty || !item.time_burden_minutes || !item.equipment_needed || !item.patient_cooperation_required) {
      issues.push(`safety item missing feasibility metadata: ${item.label}`);
    }
    if (!item.likelihood_ratio_note) {
      issues.push(`safety item missing LR interpretation note: ${item.label}`);
    }
    if (genericFindingsOptions(item.findings_options || item.findingsOptions || item.options)) {
      issues.push(`safety item has generic findings/options instead of specific bedside values: ${item.label}`);
    }
    if (weakSafetyCheckLabelPattern.test(normalizedLabel(item.label || ""))) {
      issues.push(`safety item label should name a specific bedside action: ${item.label}`);
    }
    if (!actionSpecificSafetyLabelPattern.test(normalizedLabel(item.label || ""))) {
      issues.push(`safety item label should start with a specific bedside action: ${item.label}`);
    }
  });

  (result.requiredQuestions || []).forEach((item) => {
    auditEvaluatedHistoryQuestion(item, issues, intentRow);
  });

  (module.conditionalQuestions || []).forEach((item) => {
    if (!item.when?.termsAny?.length && !item.when?.answersAny?.length && !item.when?.termsAll?.length && !item.when?.answersAll?.length) {
      issues.push(`conditional history question missing structured trigger: ${item.label}`);
      return;
    }
    const triggerTerms = [
      ...(item.when?.termsAny || []),
      ...(item.when?.termsAll || [])
    ].slice(0, 5);
    if (triggerTerms.length) {
      const triggered = evaluateComplaintCds(`${module.label} ${triggerTerms.join(" ")}`, {}, {
        module,
        validatedIntents: [intentRow]
      });
      const triggeredItem = [
        ...(triggered.requiredQuestions || []),
        ...(triggered.conditionalQuestions || [])
      ].find((candidate) => candidate.id === item.id || candidate.label === item.label);
      if (!triggeredItem) {
        if (!sourceDomainHistorySatisfiedByEvaluatedQuestion(item, triggered)) {
          issues.push(`conditional history question did not activate from its own trigger terms: ${item.label}`);
        }
      } else {
        auditEvaluatedHistoryQuestion(triggeredItem, issues, intentRow, "conditional history question");
      }
    }
  });

  (module.conditionalExam || []).forEach((item) => {
    if (!item.when?.termsAny?.length && !item.when?.answersAny?.length && !item.when?.termsAll?.length && !item.when?.answersAll?.length) {
      issues.push(`conditional exam add-on missing structured trigger: ${item.label}`);
    }
  });

  (module.conditionalExam || []).forEach((item) => {
    const triggerTerms = [
      ...(item.when?.termsAny || []),
      ...(item.when?.termsAll || [])
    ].slice(0, 5);
    if (!triggerTerms.length) {
      return;
    }
    const triggered = evaluateComplaintCds(`${module.label} ${triggerTerms.join(" ")}`, {}, {
      module,
      validatedIntents: [intentRow]
    });
    const triggeredItem = (triggered.conditionalExam || []).find((candidate) => candidate.id === item.id || candidate.label === item.label);
    if (!triggeredItem) {
      issues.push(`conditional exam add-on did not activate from its own trigger terms: ${item.label}`);
    } else {
      auditEvaluatedPhysicalExam(triggeredItem, issues, intentRow, "conditional physical exam");
    }
  });

  (result.focusedExam || []).forEach((item) => {
    auditEvaluatedPhysicalExam(item, issues, intentRow);
  });

  return issues.map((issue) => `${intentRow.intent_id}: ${issue}`);
}

const validatedIntents = clinicalIntentRegistry.filter((intentRow) => intentRow.status === "validated");

[
  {
    intentId: "graves_disease_intent_v1",
    requiredProfiles: ["routine_thyroid"],
    forbiddenProfiles: ["thyroid_endocrine", "adrenergic_jittery"],
    requiredCoreLabels: ["Inspect and palpate thyroid", "Inspect skin for thyroid phenotype", "Observe outstretched-hands tremor"],
    forbiddenCoreLabels: ["Mental status assessment", "Skin, hair, tremor, and reflex screen", "Outstretched-hands tremor assessment"]
  },
  {
    intentId: "type_2_diabetes_mellitus_intent_v1",
    requiredProfiles: ["diabetes_foot_neuropathy"],
    forbiddenProfiles: ["dka_hhs", "adrenergic_jittery"],
    requiredCoreLabels: ["Palpate dorsalis pedis pulses"],
    forbiddenCoreLabels: ["Inspect abdomen"]
  },
  {
    intentId: "acromegaly_intent_v1",
    requiredProfiles: ["eye_vision"],
    forbiddenProfiles: ["neuro_red_flags"],
    requiredCoreLabels: ["Test visual fields"],
    forbiddenCoreLabels: ["Pronator drift"]
  },
  {
    intentId: "vitamin_d_deficiency_osteomalacia_intent_v1",
    requiredProfiles: ["focused_msk"],
    forbiddenProfiles: ["endocrine_symptoms", "neuro_red_flags"],
    requiredCoreLabels: ["Inspect painful site"],
    forbiddenCoreLabels: ["Inspect and palpate thyroid"]
  }
].forEach(assertModuleBackedEvidenceRecommendation);

const thyroidCrisisIntent = clinicalIntentRegistry.find((row) => row.intent_id === "thyroid_crisis_v1");
assert.ok(thyroidCrisisIntent, "thyroid crisis regression target should exist");
const thyroidCrisisRecommendation = recommendationForIntent(thyroidCrisisIntent);
assert.ok(
  !(thyroidCrisisRecommendation.catalogGapsNeedingReview || []).some((gap) => gap.gapId === "GAP-routine-thyroid-skin-inspection"),
  "thyroid crisis should use the accepted atomic thyroid skin phenotype maneuver rather than exposing it as a staged gap"
);
assert.ok(
  [
    ...(thyroidCrisisRecommendation.corePhysicalExamManeuvers || []),
    ...(thyroidCrisisRecommendation.conditionalPhysicalExamManeuvers || [])
  ].some((entry) => entry.candidate?.exam_id === "EXAM-ENDO-THYROID-SKIN-PHENOTYPE" || /skin inspection for thyroid phenotype/i.test(entry.label || "")),
  "thyroid crisis should include accepted thyroid phenotype skin inspection"
);
assert.ok(
  ![
    ...(thyroidCrisisRecommendation.corePhysicalExamManeuvers || []),
    ...(thyroidCrisisRecommendation.conditionalPhysicalExamManeuvers || []),
    ...(thyroidCrisisRecommendation.suppressedItems || [])
  ].some((entry) => entry.candidate?.exam_id === "EXAM-DERM-SKIN-INSPECTION"),
  "thyroid crisis should not use the broad dermatology skin inspection row as thyroid phenotype evidence"
);
assert.match(
  (thyroidCrisisRecommendation.basicSafetyChecks || []).map((entry) => entry.label).join("; "),
  /Temperature/i,
  "thyroid crisis should include temperature as basic safety data"
);
assert.doesNotMatch(
  [
    ...(thyroidCrisisRecommendation.corePhysicalExamManeuvers || []),
    ...(thyroidCrisisRecommendation.conditionalPhysicalExamManeuvers || [])
  ].map((entry) => entry.label).join("; "),
  /Temperature/i,
  "thyroid crisis should not present temperature as a physical exam maneuver"
);

const failures = validatedIntents.flatMap((intentRow) => (
  ((intentRow.clinical_bundle_ids || []).includes("installed_guideline_module") || intentHasSameTopicComplaintModule(intentRow))
    ? auditModuleBackedIntent(intentRow)
    : auditRecommendation(intentRow, recommendationForIntent(intentRow))
));

assert.deepEqual(failures, [], failures.join("\n"));

const materializedChecklistFailures = validatedIntents.flatMap(materializedLocalChecklistAuditIssues);
assert.deepEqual(
  materializedChecklistFailures,
  [],
  `local bedside checklist output should remain clinically complete, parseable, and option-specific:\n${materializedChecklistFailures.join("\n")}`
);

const iterationRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: [],
  allMatches: false,
  modifiers: "",
  setting: "General medicine",
  population: "Adult",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const iterationMarkdown = formatClinicalWorkupIterationMarkdown(iterationRun);
assert.equal(
  iterationRun.results.length,
  validatedIntents.length,
  "default clinical-workup iteration report should audit every validated intent"
);
assert.doesNotMatch(
  JSON.stringify(iterationRun),
  /\[object Object\]/,
  "clinical-workup iteration JSON should serialize option labels, not raw option objects"
);
assert.doesNotMatch(
  iterationMarkdown,
  /\[object Object\]/,
  "clinical-workup iteration Markdown should serialize option labels, not raw option objects"
);
const highIssueRows = iterationRun.results.flatMap((result) => (
  (result.issues || [])
    .filter((issue) => issue.severity === "high")
    .map((issue) => `${result.intent_id}: ${issue.type} - ${issue.detail}`)
));
assert.deepEqual(highIssueRows, [], highIssueRows.join("\n"));
const canonicalExportRequiredFields = {
  safety: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "difficulty", "time_burden_minutes", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  history: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "diagnostic_purpose", "management_implication", "when_to_ask", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  core: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "difficulty", "time_burden_minutes", "technique", "when_to_use", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  conditional: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "difficulty", "time_burden_minutes", "technique", "when_to_use", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  tests: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  red_flags: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  management_changes: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "management_implication", "diagnostic_purpose", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  limitations: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "diagnostic_purpose", "limitations", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"],
  evidence_metadata: ["label", "source", "LR_plus", "LR_minus", "likelihood_ratio_note", "traceability", "intent_trace", "source_ids", "authorized_by", "trace_item_id", "retrieval_routes"]
};
const canonicalExportFieldIssues = [];
Object.entries(canonicalExportRequiredFields).forEach(([section, fields]) => {
  iterationRun.results.forEach((result) => {
    assert.ok(Array.isArray(result.source_ids) && result.source_ids.length, `${result.intent_id}: top-level report row should expose source_ids`);
    result.source_ids.forEach((sourceId) => {
      assert.ok(
        registryStyleSourceId(sourceId),
        `${result.intent_id}: top-level source ID should be a registry identifier, not citation prose or a URL: ${sourceId}`
      );
      assert.ok(
        registeredSourceIds.has(sourceId),
        `${result.intent_id}: top-level source ID should exist in the evidence or medical-knowledge source registry: ${sourceId}`
      );
    });
    (result[section] || []).forEach((entry) => {
      fields.forEach((field) => {
        const value = entry[field];
        const present = field === "traceability"
          ? value && Array.isArray(value.intent_ids) && value.intent_ids.length
          : String(value ?? "").trim();
        if (!present) {
          canonicalExportFieldIssues.push(`${result.intent_id}.${section}.${entry.label || entry.exam_id || "(unlabeled)"} missing ${field}`);
        }
      });
    });
  });
});
assert.deepEqual(
  canonicalExportFieldIssues,
  [],
  `generated validated workup rows should preserve canonical source/LR/traceability schema fields:\n${canonicalExportFieldIssues.slice(0, 80).join("\n")}`
);
const reportShapeIssues = [];
iterationRun.results.forEach((result) => {
  [
    "safety",
    "history",
    "tests",
    "red_flags",
    "management_changes",
    "limitations",
    "evidence_metadata",
    "catalog_gaps",
    "suppressed"
  ].forEach((sectionName) => {
    (result[sectionName] || []).forEach((entry) => {
      if (String(entry.technique || "").trim()) {
        reportShapeIssues.push(`${result.intent_id}.${sectionName}.${entry.label}: only core/conditional physical exam rows should export bedside technique text`);
      }
    });
  });
  [
    "safety",
    "history",
    "tests",
    "red_flags",
    "management_changes",
    "limitations",
    "evidence_metadata",
    "catalog_gaps",
    "suppressed"
  ].forEach((sectionName) => {
    (result[sectionName] || []).forEach((entry) => {
      if (/(?:^|\/)\s*(?:Or|And)\b/i.test(String(entry.options || ""))) {
        reportShapeIssues.push(`${result.intent_id}.${sectionName}.${entry.label}: structured options should not contain leading Or/And fragments`);
      }
    });
  });
  (result.safety || []).forEach((entry) => {
    if (/perform the named bedside item directly/i.test(entry.technique || "")) {
      reportShapeIssues.push(`${result.intent_id}.safety.${entry.label}: safety rows should not export placeholder exam technique text`);
    }
  });
  (result.history || []).forEach((entry) => {
    const questionText = String(entry.text || entry.full_question || "").trim();
    if (!questionText) {
      reportShapeIssues.push(`${result.intent_id}.history.${entry.label}: history rows should expose text/full_question for audit and copy workflows`);
    }
    if (vagueFocusedHistoryLabelPattern.test(entry.label || "")) {
      reportShapeIssues.push(`${result.intent_id}.history.${entry.label}: history labels should be clinically specific, not generic source/severity placeholders`);
    }
  });
});
assert.deepEqual(
  reportShapeIssues,
  [],
  `clinical-workup report rows should keep safety, history, and exam semantics separate:\n${reportShapeIssues.slice(0, 80).join("\n")}`
);
assert.doesNotMatch(
  iterationMarkdown,
  /Basic bedside data \/ safety checks[\s\S]*?technique Perform the named bedside item directly/i,
  "clinical-workup Markdown should not make basic safety checks look like physical exam maneuvers"
);
const readyRows = iterationRun.results.filter((result) => result.complete_validated_workup);
const reviewRows = iterationRun.results.filter((result) => !result.complete_validated_workup);
assert.ok(
  readyRows.some((result) => result.intent_id === "dka_hhs_v1"),
  "DKA should remain in the complete validated readiness bucket"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "fever_sepsis_v1"),
  "fever/sepsis should remain complete after adding source-localizing history and lung exam coverage"
);
const feverSepsisRow = iterationRun.results.find((result) => result.intent_id === "fever_sepsis_v1");
assert.ok(feverSepsisRow, "fever/sepsis iteration row should exist");
const feverHistoryText = (feverSepsisRow.history || []).map((entry) => [entry.label, ...(entry.detail_prompts || [])].join(" ")).join(" | ");
const feverSafetyText = (feverSepsisRow.safety || []).map((entry) => entry.label).join(" | ");
const feverCoreExamText = [...(feverSepsisRow.core || []), ...(feverSepsisRow.conditional || [])].map((entry) => entry.label).join(" | ");
const feverTestsText = (feverSepsisRow.tests || []).map((entry) => [entry.label, entry.reason, entry.management_change].join(" ")).join(" | ");
const feverRedFlagText = (feverSepsisRow.red_flags || []).map((entry) => [entry.label, entry.reason, entry.management_change].join(" ")).join(" | ");
assert.match(
  feverSafetyText,
  /Mental status/i,
  "fever/sepsis should classify mental status as basic safety/acuity data"
);
assert.doesNotMatch(
  feverCoreExamText,
  /Mental status/i,
  "fever/sepsis should not classify mental status as a core physical exam maneuver"
);
assert.match(
  feverHistoryText,
  /(?=[\s\S]*cough)(?=[\s\S]*(?:dysuria|flank))(?=[\s\S]*(?:rash|wound|line))(?=[\s\S]*(?:exposure|host|immunosuppression|pregnancy))/i,
  "fever/sepsis should visibly ask source-localizing respiratory, urinary, skin/line, and host/exposure questions"
);
assert.match(
  feverHistoryText,
  /poor intake|dehydration|low urine|rapid worsening|fainting|confusion/i,
  "fever/sepsis should visibly ask sepsis severity and perfusion questions"
);
assert.doesNotMatch(
  feverHistoryText,
  /one-sided leg swelling|estrogen use|prior clot|worse .*lying flat|wakes from sleep/i,
  "standalone fever/sepsis should not import generic cardiopulmonary backfill prompts"
);
assert.match(
  feverCoreExamText,
  /(?:Auscultate posterior lung fields|Posterior lung sounds)/i,
  "fever/sepsis should visibly recommend lung auscultation for pneumonia-source screening"
);
assert.match(
  feverCoreExamText,
  /(?:Inspect skin for infection source|Skin source inspection)/i,
  "fever/sepsis should visibly recommend skin/wound/line source inspection"
);
assert.match(
  feverTestsText,
  /Source-directed infection studies[\s\S]*Respiratory source imaging and testing pathway|Respiratory source imaging and testing pathway[\s\S]*Source-directed infection studies/i,
  "fever/sepsis should include both broad source-directed studies and respiratory imaging/testing pathway"
);
assert.match(
  feverRedFlagText,
  /Sepsis or shock physiology[\s\S]*(?:CNS|airway|purpura)|(?:CNS|airway|purpura)[\s\S]*Sepsis or shock physiology/i,
  "fever/sepsis should include sepsis/shock and CNS/airway/purpura escalation cues"
);
const dkaHhsRow = iterationRun.results.find((result) => result.intent_id === "dka_hhs_v1");
assert.ok(dkaHhsRow, "DKA/HHS iteration row should exist");
const dkaSafetyText = (dkaHhsRow.safety || []).map((entry) => entry.label).join(" | ");
const dkaCoreExamText = [...(dkaHhsRow.core || []), ...(dkaHhsRow.conditional || [])].map((entry) => entry.label).join(" | ");
assert.match(
  dkaSafetyText,
  /Mental status/i,
  "DKA/HHS should classify mental status as basic safety/acuity data"
);
assert.match(
  dkaSafetyText,
  /protect airway|airway protection/i,
  "DKA/HHS should classify airway protection as safety/acuity data"
);
assert.doesNotMatch(
  dkaCoreExamText,
  /Mental status/i,
  "DKA/HHS should not classify mental status as a core physical exam maneuver"
);
assert.doesNotMatch(
  dkaCoreExamText,
  /protect airway|airway protection/i,
  "DKA/HHS should not classify airway protection as a core physical exam maneuver"
);
const dkaWithFeverRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["dka_hhs_v1"],
  allMatches: false,
  modifiers: "fever",
  setting: "General medicine",
  population: "Adult",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const dkaWithFeverRow = dkaWithFeverRun.results.find((result) => result.intent_id === "dka_hhs_v1");
assert.ok(dkaWithFeverRow, "DKA/HHS with fever modifier audit row should exist");
const dkaWithFeverHistoryText = (dkaWithFeverRow.history || [])
  .map((entry) => [entry.label, entry.text, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const dkaWithFeverExamText = [...(dkaWithFeverRow.core || []), ...(dkaWithFeverRow.conditional || [])]
  .map((entry) => [entry.label, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  dkaWithFeverHistoryText,
  /respiratory infection-source symptoms/i,
  "fever modifier should make respiratory infection-source history visible in DKA/HHS"
);
assert.match(
  dkaWithFeverHistoryText,
  /urinary and flank infection-source symptoms/i,
  "fever modifier should make urinary/flank infection-source history visible in DKA/HHS"
);
assert.match(
  dkaWithFeverHistoryText,
  /skin\/line infection-source symptoms/i,
  "fever modifier should make skin/wound/line source history visible in DKA/HHS"
);
assert.match(
  dkaWithFeverHistoryText,
  /host-risk and exposure history/i,
  "fever modifier should make host-risk and exposure history visible in DKA/HHS"
);
assert.match(
  dkaWithFeverHistoryText,
  /sepsis severity, hydration, and perfusion symptoms/i,
  "fever modifier should make sepsis severity history visible in DKA/HHS"
);
assert.match(
  dkaWithFeverExamText,
  /Auscultate lungs for infection source|Posterior lung sounds|Auscultate posterior lung fields/i,
  "fever modifier should activate lung auscultation/source exam in DKA/HHS"
);
assert.match(
  dkaWithFeverExamText,
  /Inspect skin wounds|Inspect skin for infection source|Inspect line sites/i,
  "fever modifier should activate skin/wound/line source inspection in DKA/HHS"
);
const thyroidCrisisRow = iterationRun.results.find((result) => result.intent_id === "thyroid_crisis_v1");
assert.ok(thyroidCrisisRow, "thyroid crisis iteration row should exist");
const thyroidCrisisSafetyText = (thyroidCrisisRow.safety || []).map((entry) => entry.label).join(" | ");
const thyroidCrisisExamText = [...(thyroidCrisisRow.core || []), ...(thyroidCrisisRow.conditional || [])].map((entry) => entry.label).join(" | ");
assert.match(
  thyroidCrisisSafetyText,
  /Temperature/i,
  "thyroid crisis iteration output should include temperature in basic safety data"
);
assert.doesNotMatch(
  thyroidCrisisExamText,
  /Temperature/i,
  "thyroid crisis iteration output should keep temperature out of physical exam maneuvers"
);
assert.ok(
  reviewRows.length === 0,
  `all validated intents should produce complete validated workups after accepted gap replacements: ${reviewRows.map((result) => result.intent_id).join(", ")}`
);
["genital_discharge_sti_v1", "acute_scrotal_pain_v1"].forEach((intentId) => {
  const row = iterationRun.results.find((result) => result.intent_id === intentId);
  assert.ok(row, `${intentId}: audit row should exist`);
  assert.equal(row.complete_validated_workup, true, `${intentId}: accepted tests and red flags should keep the workup in the complete-ready bucket`);
  assert.equal(row.readiness_status, "complete_validated", `${intentId}: expected complete validated readiness status`);
  assert.ok(!(row.review_notes || []).some((issue) => issue.type === "tests_reference_gap"), `${intentId}: accepted tests should remove the tests gap`);
  assert.ok(!(row.review_notes || []).some((issue) => issue.type === "red_flag_gap"), `${intentId}: accepted red flags should remove the red-flag gap`);
});
const genitalDischargeRow = iterationRun.results.find((result) => result.intent_id === "genital_discharge_sti_v1");
const genitalCoreLabels = (genitalDischargeRow?.core || []).map((entry) => entry.label).join("; ");
const genitalHistoryLabels = (genitalDischargeRow?.history || []).map((entry) => entry.label).join("; ");
assert.match(genitalHistoryLabels, /discharge, dysuria, genital lesions, and STI exposure/i, "genital discharge should label discharge/dysuria/exposure history as local GU/STI context");
assert.match(genitalHistoryLabels, /groin nodes, genital lesions, and skin infection features/i, "genital discharge should label groin-node/lesion history separately from urinary source history");
assert.doesNotMatch(genitalHistoryLabels, /urinary\/flank symptoms/i, "genital discharge history labels should not borrow urinary/flank suffixes");
assert.match(genitalCoreLabels, /Inspect genital area/i, "genital discharge should include the accepted atomic genital exam, not a broad mucosal substitute");
assert.match(genitalCoreLabels, /Palpate inguinal lymph nodes/i, "genital discharge should include accepted local inguinal-node assessment");
assert.doesNotMatch(genitalCoreLabels, /Mucosal lesions/i, "genital discharge core exam should not substitute a broad mucosal-lesion row for the local GU exam");
assert.match((genitalDischargeRow?.tests || []).map((entry) => entry.label).join("; "), /STI and urethritis\/cervicitis diagnostic pathway/i, "genital discharge should include the accepted STI diagnostic pathway");
assert.match((genitalDischargeRow?.red_flags || []).map((entry) => entry.label).join("; "), /Complicated STI\/GU escalation cues/i, "genital discharge should include complication and escalation cues");
const acuteScrotalRow = iterationRun.results.find((result) => result.intent_id === "acute_scrotal_pain_v1");
const acuteScrotalCoreLabels = (acuteScrotalRow?.core || []).map((entry) => entry.label).join("; ");
const acuteScrotalHistoryLabels = (acuteScrotalRow?.history || []).map((entry) => entry.label).join("; ");
assert.match(acuteScrotalHistoryLabels, /scrotal pain onset and torsion features/i, "acute scrotal pain should label onset/nausea/high-riding features as torsion-focused history");
assert.match(acuteScrotalHistoryLabels, /epididymitis\/STI and urology-risk features/i, "acute scrotal pain should label infectious/urology barriers separately from torsion onset");
assert.doesNotMatch(acuteScrotalHistoryLabels, /urinary\/flank symptoms/i, "acute scrotal pain history labels should not borrow urinary/flank suffixes");
assert.match(acuteScrotalCoreLabels, /Inspect and palpate scrotum/i, "acute scrotal pain should include the accepted atomic scrotal exam");
assert.match(acuteScrotalCoreLabels, /Test cremasteric reflex/i, "acute scrotal pain should include cremasteric reflex as a separate torsion-associated maneuver");
assert.doesNotMatch(acuteScrotalCoreLabels, /Genital exam|Mucosal lesions/i, "acute scrotal pain core exam should not substitute broad genital or mucosal rows for scrotal exam");
assert.match((acuteScrotalRow?.tests || []).map((entry) => entry.label).join("; "), /Acute scrotum torsion and infection pathway/i, "acute scrotal pain should include torsion and infection diagnostic pathway");
assert.match((acuteScrotalRow?.red_flags || []).map((entry) => entry.label).join("; "), /Torsion and acute scrotum escalation cues/i, "acute scrotal pain should include torsion escalation cues");
const sleepApneaHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "sleep_apnea_snoring_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
assert.match(sleepApneaHistoryLabels, /OSA safety, comorbidities, and treatment context/i, "sleep apnea should label drowsy-driving/comorbidity/CPAP context separately");
assert.match(sleepApneaHistoryLabels, /OSA symptoms and daytime sleepiness/i, "sleep apnea should label symptom-screen history separately");
assert.doesNotMatch(sleepApneaHistoryLabels, /SGLT2\/fasting risks/i, "sleep apnea history labels should not borrow diabetes/DKA suffixes");
[
  "vitamin_d_deficiency_osteomalacia_intent_v1",
  "hypoparathyroidism_intent_v1",
  "osteoporosis_intent_v1"
].forEach((intentId) => {
  const row = iterationRun.results.find((result) => result.intent_id === intentId);
  assert.ok(row, `${intentId}: bone/mineral audit row should exist`);
  const historyLabels = (row.history || []).map((entry) => entry.label).join("; ");
  assert.doesNotMatch(
    historyLabels,
    /euglycemic DKA|hyperthyroid adrenergic|GU\/STI|host-risk and exposure|source-localizing infection/i,
    `${intentId}: concise history labels should not borrow unrelated DKA, thyroid, STI, or infection-source frames`
  );
});
const vitaminDHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "vitamin_d_deficiency_osteomalacia_intent_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
assert.match(vitaminDHistoryLabels, /malabsorption and nutrient-absorption risks/i, "vitamin D workup should label malabsorption history as bone/mineral-specific");
assert.match(vitaminDHistoryLabels, /renal, liver, and mineral-metabolism modifiers/i, "vitamin D workup should label CKD/liver/PTH history as mineral-metabolism context");
assert.match(vitaminDHistoryLabels, /kidney-stone and renal calcium\/PTH complications|hypercalcemia symptom pattern and renal impact/i, "vitamin D workup should label stone/polyuria history as calcium/PTH or hypercalcemia context");
const diabetesInsipidusHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "diabetes_insipidus_intent_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
assert.match(diabetesInsipidusHistoryLabels, /24-hour urine volume and baseline change/i, "diabetes insipidus should label 24-hour urine-volume history as DI/polyuria context");
assert.match(diabetesInsipidusHistoryLabels, /nocturia frequency and progression/i, "diabetes insipidus should label nocturia history as progression/severity context");
assert.match(diabetesInsipidusHistoryLabels, /DI medication and fluid-balance triggers/i, "diabetes insipidus should label lithium/desmopressin/fluid-trigger history as DI medication context");
assert.doesNotMatch(diabetesInsipidusHistoryLabels, /hyperglycemia dehydration|treatment-limiting hypertension and diabetes complications/i, "diabetes insipidus should not borrow diabetes-mellitus or hyperglycemic-crisis history labels");
const hypoparaHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "hypoparathyroidism_intent_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
assert.match(hypoparaHistoryLabels, /neck surgery and postoperative calcium history/i, "hypoparathyroidism workup should label neck surgery history as postoperative calcium context");
assert.match(hypoparaHistoryLabels, /hypocalcemia neuromuscular symptoms/i, "hypoparathyroidism workup should label cramps/tetany history as hypocalcemia symptoms");
const thyroidNoduleHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "thyroid_nodules_intent_v1")?.history || [])
  .map((entry) => entry.label);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /thyroid nodule growth and invasion symptoms/i.test(label)),
  "thyroid nodule workup should label growth/fixation/voice/node questions as nodule invasion symptoms"
);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /thyroid structural symptoms and cancer-risk history/i.test(label)),
  "thyroid nodule workup should distinguish structural symptoms plus cancer-risk history"
);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /thyroid radiation and family-risk history/i.test(label)),
  "thyroid nodule workup should separately label radiation/family thyroid cancer risk"
);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /hereditary endocrine tumor history/i.test(label)),
  "thyroid nodule workup should separately label MEN/VHL/NF1/SDHx hereditary tumor history"
);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /thyroid-related weight and systemic symptoms/i.test(label)),
  "thyroid nodule workup should label weight/systemic symptoms rather than clipping the raw question"
);
assert.ok(
  thyroidNoduleHistoryLabels.some((label) => /thyroid medications, iodine\/biotin exposure, and assay interference/i.test(label)),
  "thyroid nodule workup should label medication/biotin/iodine context as assay interpretation history"
);
assert.ok(
  thyroidNoduleHistoryLabels.every((label) => !/\s2$/.test(label)),
  `thyroid nodule history labels should not require duplicate counters: ${thyroidNoduleHistoryLabels.join("; ")}`
);
const longRawAnyHistoryLabels = iterationRun.results.flatMap((result) => (
  (result.history || [])
    .filter((entry) => /^Any\b/i.test(entry.label || "") && String(entry.label || "").length >= 105)
    .map((entry) => `${result.intent_id}: ${entry.label}`)
));
assert.deepEqual(
  longRawAnyHistoryLabels,
  [],
  `history labels should be concise clinical domains rather than long raw Any-questions:\n${longRawAnyHistoryLabels.join("\n")}`
);
const gestationalDiabetesHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "gestational_diabetes_intent_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
const metabolicSyndromeHistoryLabels = (iterationRun.results.find((result) => result.intent_id === "metabolic_syndrome_intent_v1")?.history || [])
  .map((entry) => entry.label).join("; ");
assert.match(
  metabolicSyndromeHistoryLabels,
  /weight, waist, and intentional change/i,
  "metabolic syndrome should label weight/waist trajectory as a concise cardiometabolic history domain"
);
assert.match(
  gestationalDiabetesHistoryLabels,
  /prior gestational diabetes and macrosomia history/i,
  "gestational diabetes should label prior GDM/macrosomia risk as a concise obstetric-metabolic history domain"
);
assert.match(
  gestationalDiabetesHistoryLabels,
  /gestational age, dating, and obstetric context/i,
  "gestational diabetes should label gestational-age/dating history as obstetric diabetes context, not pelvic-pain/ectopic danger wording"
);
assert.match(
  gestationalDiabetesHistoryLabels,
  /pre-pregnancy diabetes and GDM risk factors/i,
  "gestational diabetes should label pre-pregnancy diabetes risk factors as GDM risk, not pregnancy/ectopic danger wording"
);
assert.match(
  gestationalDiabetesHistoryLabels,
  /fetal-growth and obstetric ultrasound concerns/i,
  "gestational diabetes should label fetal-growth/polyhydramnios concerns as a distinct obstetric-ultrasound history domain"
);
const genericHighScoreSuppressedNotes = iterationRun.results.flatMap((result) => (
  (result.review_notes || [])
    .filter((issue) => issue.type === "high_score_suppressed")
    .filter((issue) => /selected validated clinical intent did not define/i.test(issue.detail || ""))
    .map((issue) => `${result.intent_id}: ${issue.detail}`)
));
assert.deepEqual(
  genericHighScoreSuppressedNotes,
  [],
  `high-score suppressed review notes need clinically specific suppression reasons:\n${genericHighScoreSuppressedNotes.join("\n")}`
);
const highScoreSuppressedNotes = iterationRun.results.flatMap((result) => (
  (result.review_notes || [])
    .filter((issue) => issue.type === "high_score_suppressed")
    .map((issue) => `${result.intent_id}: ${issue.detail}`)
));
assert.deepEqual(
  highScoreSuppressedNotes,
  [],
  `the iteration improvement queue should not flag clinically explained suppressed candidates:\n${highScoreSuppressedNotes.join("\n")}`
);
const moduleBackedRows = iterationRun.results.filter((result) => result.module_id);
assert.equal(
  moduleBackedRows.length,
  validatedIntents.filter((intentRow) => (intentRow.clinical_bundle_ids || []).includes("installed_guideline_module") || intentHasSameTopicComplaintModule(intentRow)).length,
  "iteration report should represent installed guideline-module intents with module-backed rows"
);
moduleBackedRows.forEach((result) => {
  assert.ok(result.counts.safety > 0, `${result.intent_id}: module-backed report should include safety checks`);
  assert.ok(result.counts.history > 0, `${result.intent_id}: module-backed report should include history questions`);
  assert.ok(result.counts.core + result.counts.conditional > 0, `${result.intent_id}: module-backed report should include exam maneuvers`);
  assert.ok(result.counts.tests > 0, `${result.intent_id}: module-backed report should include tests/reference thresholds`);
  assert.ok(result.counts.red_flags > 0, `${result.intent_id}: module-backed report should include red flags`);
  assert.ok(result.counts.management > 0, `${result.intent_id}: module-backed report should include management-changing findings`);
  assert.ok(result.counts.limitations > 0, `${result.intent_id}: module-backed report should include limitations and interpretation cautions`);
  assert.ok(result.counts.suppressed > 0, `${result.intent_id}: module-backed report should include suppressed/not-recommended items from validated intent scope rules`);
  assert.ok(result.source_ids.length > 0, `${result.intent_id}: module-backed report should include source ids`);
});
const intentionallyExamLightIntentIds = new Set([
  "gestational_diabetes_intent_v1",
  "metabolic_syndrome_intent_v1",
  "prediabetes_intent_v1"
]);
iterationRun.results.forEach((result) => {
  const examCount = (result.counts.core || 0) + (result.counts.conditional || 0);
  if (intentionallyExamLightIntentIds.has(result.intent_id)) {
    assert.ok(
      reportHasExamScopeCaution(result),
      `${result.intent_id}: exam-light workup should include a source-backed physical exam scope caution`
    );
    return;
  }
  assert.ok(
    examCount >= 2,
    `${result.intent_id}: validated workup should not pass with fewer than two true exam maneuvers unless explicitly exam-light`
  );
});
const routineThyroidRow = iterationRun.results.find((result) => result.intent_id === "routine_thyroid_disease_v1");
const routineThyroidHistoryLabels = (routineThyroidRow?.history || []).map((entry) => entry.label).join("; ");
assert.match(
  routineThyroidHistoryLabels,
  /thyroid pain, pressure, and airway symptoms|thyroid nodule growth and invasion symptoms|thyroid structural symptoms and cancer-risk history/i,
  "routine thyroid disease should label thyroid pain/compressive history as thyroid-specific, not generic pain/trauma"
);
assert.match(
  routineThyroidHistoryLabels,
  /thyroid radiation and family-risk history|thyroid structural symptoms and cancer-risk history/i,
  "routine thyroid disease should label radiation/family-risk history as thyroid cancer risk"
);
assert.match(
  routineThyroidHistoryLabels,
  /pregnancy, postpartum, and fertility-related thyroid safety/i,
  "routine thyroid disease should label pregnancy/fertility context as thyroid treatment and lab-safety context"
);
assert.match(
  routineThyroidHistoryLabels,
  /hyperthyroid adrenergic, weight, and GI symptoms/i,
  "routine thyroid disease should label palpitations/sweating/weight-loss history as hyperthyroid symptom review"
);
assert.doesNotMatch(
  routineThyroidHistoryLabels,
  /pain location, trauma|pregnancy and ectopic|acral, soft-tissue/i,
  "routine thyroid disease should not borrow MSK, pelvic/ectopic, or acromegaly history labels"
);
assert.match(
  [...(routineThyroidRow?.core || []), ...(routineThyroidRow?.conditional || [])].map((entry) => entry.label).join("; "),
  /Inspect skin for thyroid phenotype/i,
  "routine thyroid disease should include a thyroid phenotype skin inspection after accepted gap replacement"
);
const rashSkinRow = iterationRun.results.find((result) => result.intent_id === "rash_skin_v1");
assert.match(
  [...(rashSkinRow?.core || []), ...(rashSkinRow?.conditional || [])].map((entry) => entry.label).join("; "),
  /Inspect mucosa for lesions/i,
  "rash/skin workup should include mucosal lesions as a separate conditional severe-rash screen"
);

[
  "## Structured Workups",
  "Complete validated workups:",
  "Workups needing reviewer completion:",
  "readiness: Complete validated workup",
  "Basic bedside data / safety checks",
  "Focused history questions",
  "Core physical exam maneuvers",
  "Conditional exam add-ons",
  "Management-changing findings",
  "Limitations and interpretation cautions",
  "Evidence / likelihood-ratio metadata",
  "Catalog gaps needing review",
  "Suppressed/not-recommended items"
].forEach((snippet) => {
  assert.ok(iterationMarkdown.includes(snippet), `clinical workup report should include section: ${snippet}`);
});
assert.ok(
  iterationMarkdown.includes("LR note: No maneuver-specific LR+/LR- is available")
    || iterationMarkdown.includes("LR note: Likelihood ratios are not applicable"),
  "clinical workup report should explain unavailable LR metadata in the reviewer-facing Markdown"
);
assert.ok(
  iterationMarkdown.includes("details Ask specifically about")
    || iterationMarkdown.includes("details Clarify"),
  "clinical workup iteration report should expose concrete detail prompts for broad focused-history questions"
);
assert.ok(
  /Focused history questions[\s\S]*options\s+[^.\n]*\/[^.\n]*/.test(iterationMarkdown),
  "clinical workup iteration report should expose structured answer options for focused history questions"
);
assert.ok(
  /Focused history questions[\s\S]*ask when\s+[^;\n]+[\s\S]*tags\s+[^;\n]+/.test(iterationMarkdown),
  "clinical workup iteration report should expose when-to-ask and tags for focused history questions"
);
assert.ok(
  /Core physical exam maneuvers[\s\S]*use when\s+[^;\n]+[\s\S]*technique\s+[^;\n]+[\s\S]*feasibility\s+[^;\n]+[\s\S]*limitations\s+[^;\n]+[\s\S]*tags\s+[^;\n]+/.test(iterationMarkdown),
  "clinical workup iteration report should expose when-to-use, technique, feasibility, limitations, and tags for physical exam maneuvers"
);
assert.doesNotMatch(
  iterationMarkdown,
  /Suppressed\/not-recommended items[\s\S]*\(\)\s*-\s*suppressed/i,
  "suppressed/not-recommended Markdown rows should show stable IDs and reasons, not empty score placeholders"
);
assert.doesNotMatch(
  iterationMarkdown,
  /Suppressed\/not-recommended items[\s\S]*\(no-id\)/i,
  "suppressed/not-recommended Markdown rows should not use no-id placeholders"
);
assert.ok(
  /Suppressed\/not-recommended items[\s\S]*LR note:[\s\S]*tags\s+[^;\n]+[\s\S]*authorization\s+[^;\n]+/.test(iterationMarkdown),
  "suppressed/not-recommended Markdown rows should expose LR interpretation, tags, and authorization"
);

iterationRun.results.forEach((result) => {
  assert.ok(Array.isArray(result.safety), `${result.intent_id}: report row should expose safety section`);
  assert.ok(Array.isArray(result.history), `${result.intent_id}: report row should expose history section`);
  const visibleHistoryLabelCounts = new Map();
  result.history.forEach((entry) => {
    const key = normalizedLabel(entry.label || "");
    if (!key) return;
    visibleHistoryLabelCounts.set(key, (visibleHistoryLabelCounts.get(key) || 0) + 1);
  });
  const duplicateVisibleHistoryLabels = Array.from(visibleHistoryLabelCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([label]) => label);
  assert.deepEqual(
    duplicateVisibleHistoryLabels,
    [],
    `${result.intent_id}: visible focused-history labels should be unique within the workup`
  );
  const visibleHistoryLabels = (result.history || []).map((entry) => String(entry.label || ""));
  visibleHistoryLabels.forEach((label) => {
    assert.doesNotMatch(
      label,
      /Ask PE severity, VTE risk factors, and bleeding risk/i,
      `${result.intent_id}: PE history should be split into atomic symptom, DVT, provoking-factor, and bleeding-safety questions`
    );
    if (result.intent_id !== "suspected_pe_v1") {
      assert.doesNotMatch(
        label,
        /^Ask PE\b/i,
        `${result.intent_id}: PE-specific history labels should not leak into unrelated validated intents`
      );
    }
  });
  if (result.intent_id === "suspected_pe_v1") {
    const historyLabelText = visibleHistoryLabels.join(" | ");
    [
      /PE cardiopulmonary severity symptoms/i,
      /DVT leg symptoms/i,
      /VTE provoking-factor history/i,
      /anticoagulation and bleeding-safety history/i
    ].forEach((pattern) => {
      assert.match(
        historyLabelText,
        pattern,
        `suspected PE history should expose separate bedside-facing domains: ${pattern}`
      );
    });
    assert.equal(
      visibleHistoryLabels.filter((label) => /PE cardiopulmonary severity symptoms/i.test(label)).length,
      1,
      "suspected PE should not duplicate the cardiopulmonary symptom history row from attached exam-question metadata"
    );
  }
  const visibleManagementChangeCounts = new Map();
  (result.management_changes || []).forEach((entry) => {
    const key = normalizedLabel(entry.management_change || entry.management_implication || "");
    if (!key) return;
    visibleManagementChangeCounts.set(key, (visibleManagementChangeCounts.get(key) || 0) + 1);
  });
  const duplicateVisibleManagementChanges = Array.from(visibleManagementChangeCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([managementChange]) => managementChange);
  assert.deepEqual(
    duplicateVisibleManagementChanges,
    [],
    `${result.intent_id}: management-changing findings should be unique by management implication, not repeated once per linked maneuver`
  );
  result.history.forEach((entry) => {
    assert.ok(
      String(entry.options || "").trim(),
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should preserve structured answer options in exported row data`
    );
    assert.doesNotMatch(
      String(entry.options || "").trim(),
      /^(?:Unknown\s*\/\s*)?Yes\s*\/\s*No(?:\s*\/\s*Other)?$|^Unknown\s*\/\s*Yes\s*\/\s*No(?:\s*\/\s*Other)?$/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not fall back to generic yes/no options`
    );
    assert.doesNotMatch(
      String(entry.options || "").trim(),
      /(?:^|\/)\s*(?:Or|And)\b/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not expose leading Or/And option fragments`
    );
    assert.doesNotMatch(
      String(entry.options || "").trim(),
      /(?:^|\/)\s*Other\s*(?:\/|$)/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should use Other ___ rather than a bare Other option`
    );
    assert.doesNotMatch(
      String(entry.options || "").trim(),
      /(?:Prior MI\s+\/\s+stent\s+\/\s+CABG|Iodine\s+\/\s+contrast|Renal\s+\/\s+osmolality|Dental\s+\/\s+skin|V\s+\/\s+Q)/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not split internal clinical slash phrases into separate options`
    );
    assert.doesNotMatch(
      String(entry.options || "").trim(),
      /(?:^|\/)\s*Which medications\b/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not turn a question stem into an answer option`
    );
    const optionQuestionStemFragments = String(entry.options || "")
      .split(/\s+\/\s+|[;\n|]+/)
      .map((option) => option.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((option) => /^(?:Have you(?: had| noticed)?|How has|How have|Was the|Associated with|Did |When was|How regular|Do symptoms|Are there|Do you(?: have| currently)?|What is|How many|How much|Have ring|Has the|Has pregnancy dating|Neck mass grown|Become painful|Is it|Have rapid growth|Nipple discharge occurred|Tenderness been present|Recently smoke|Waist circumference changed|The change intentional|This new)\b/i.test(option));
    assert.deepEqual(
      optionQuestionStemFragments,
      [],
      `${result.intent_id}: ${entry.label || entry.exam_id} history row options should be selectable components, not clipped question stems`
    );
    if (/^How has weight changed/i.test(String(entry.full_question || entry.text || ""))) {
      assert.match(
        String(entry.label || ""),
        /weight|systemic/i,
        `${result.intent_id}: weight/systemic history should be labeled as weight/systemic context, not an unrelated clinical domain`
      );
    }
    if (/cold intolerance|fatigue|constipation|dry(?: or coarse)? skin|hoarse voice|slowed thinking|weight gain|heavy menses|hypothyroid/i.test(`${entry.text || ""} ${entry.full_question || ""}`)) {
      assert.doesNotMatch(
        entry.label || "",
        /bleeding source/i,
        `${result.intent_id}: hypothyroid symptom history should not be mislabeled as bleeding-source history`
      );
    }
    if (/bleeding source/i.test(entry.label || "")) {
      const explicitBleedingContext = /bleeding_anemia|bleeding|hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|epistaxis|transfusion|heavy menses|pallor|anemia/i
        .test(`${result.intent_id || ""} ${result.label || ""} ${entry.text || ""} ${entry.full_question || ""} ${entry.options || ""}`);
      assert.ok(
        explicitBleedingContext,
        `${result.intent_id}: bleeding-source history label should require an actual bleeding/anemia/GI-bleed context`
      );
    }
    if (result.intent_id === "chest_pain_acs_v1") {
      assert.doesNotMatch(
        entry.label || "",
        /bleeding source/i,
        "chest pain medication/thrombotic-risk history should not be mislabeled as bleeding-source history"
      );
    }
    if (/respiratory source/i.test(entry.label || "")) {
      const explicitRespiratorySourceContext = /fever|infection|sepsis|pneumonia|respiratory_source|respiratory source|pulmonary embolism|suspected pe|cough|sputum|wheeze|aspiration/i
        .test(`${result.intent_id || ""} ${result.label || ""} ${entry.text || ""} ${entry.full_question || ""} ${entry.options || ""} ${entry.tags || ""}`);
      assert.ok(
        explicitRespiratorySourceContext,
        `${result.intent_id}: respiratory-source history label should require infection, PE, or true respiratory-source context`
      );
    }
    assert.ok(
      String(entry.when_to_ask || "").trim(),
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should preserve when-to-ask metadata in exported row data`
    );
    assert.ok(
      String(entry.tags || "").trim(),
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should preserve retrieval/clinical tags in exported row data`
    );
    assert.ok(
      !historyQuestionLabelIsOverloaded(entry),
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should expose a concise bedside-facing label and preserve the long source text separately`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /\.\.\.| - (?:Ask about|Clarify|Review)\b/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not expose truncated detail-prompt suffixes in the bedside-facing label`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /^Ask (?:is it|did|what is|how|has a|have|are|do|does|was|were|can|could|has)\b|,\s*$/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should not expose clipped question fragments as bedside-facing labels`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /\s-\s+(?:How has|How have|How many|Has the|Has pregnancy dating|Waist circumference|Any thyroid hormone|Any neck swelling)\b/i,
      `${result.intent_id}: ${entry.label || entry.exam_id} history row should use a clinical-domain suffix, not a clipped raw question fragment`
    );
    if (normalizedLabel(entry.label || "") !== normalizedLabel(entry.full_question || "")) {
      assert.ok(
        String(entry.full_question || "").trim(),
        `${result.intent_id}: ${entry.label || entry.exam_id} history row should preserve the full source-backed question for audit`
      );
    }
    if (historyQuestionNeedsDetailPrompts(entry)) {
      assert.ok(
        (entry.detail_prompts || []).length >= 2,
        `${result.intent_id}: broad history report row should carry concrete detail prompts`
      );
      (entry.detail_prompts || []).forEach((prompt) => {
        assert.ok(
          historyDetailPromptHasBedsideAction(prompt),
          `${result.intent_id}: broad history detail prompt should start with a bedside action verb: ${prompt}`
        );
        assert.ok(
          !historyDetailPromptTooTerse(prompt),
          `${result.intent_id}: broad history detail prompt should be clinically specific, not terse or generic: ${prompt}`
        );
      });
      assert.ok(
        String(entry.full_question || "").trim(),
        `${result.intent_id}: broad history report row should preserve the full source-backed question for audit`
      );
    }
  });
  assert.ok(Array.isArray(result.core), `${result.intent_id}: report row should expose core exam section`);
  assert.ok(Array.isArray(result.conditional), `${result.intent_id}: report row should expose conditional exam section`);
  const conditionalStatus = result.conditional_exam_addon_status || result.section_statuses?.conditional_exam_addons;
  assert.ok(conditionalStatus?.status, `${result.intent_id}: report row should expose conditional exam add-on status`);
  assert.ok(conditionalStatus?.reason, `${result.intent_id}: conditional exam add-on status should explain active add-ons, inactive triggers, or staged gaps`);
  if (!(result.conditional || []).length) {
    assert.ok(
      ["none_active_for_current_context", "staged_gaps_need_review", "audit_only_unvalidated_context"].includes(conditionalStatus.status),
      `${result.intent_id}: empty conditional exam section should be explicitly explained, not silent`
    );
  }
  const visibleSuppressedLabelCounts = new Map();
  (result.suppressed || []).forEach((entry) => {
    const label = entry.label || "";
    assert.doesNotMatch(
      `${label} ${entry.reason || ""}`,
      /\b(?:setup|stethoscope cleaned|cleaned|draping|positioning|before patient contact|hygiene)\b/i,
      `${result.intent_id}: clinician-facing suppressed list should not expose setup/process audit metadata`
    );
    const key = normalizedLabel(label);
    if (!key) return;
    visibleSuppressedLabelCounts.set(key, (visibleSuppressedLabelCounts.get(key) || 0) + 1);
  });
  const duplicateVisibleSuppressedLabels = Array.from(visibleSuppressedLabelCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([label]) => label);
  assert.deepEqual(
    duplicateVisibleSuppressedLabels,
    [],
    `${result.intent_id}: suppressed/not-recommended labels should be unique within the workup`
  );
  assertExportedFields(result, "physical exam", [...(result.core || []), ...(result.conditional || [])], [
    ["options", "findings/options"],
    ["technique", "exam technique"],
    ["when_to_use", "when-to-use metadata"],
    ["diagnostic_target", "diagnostic target"],
    ["management_change", "management-changing implication"],
    ["evidence", "source/evidence metadata"],
    ["difficulty", "difficulty metadata"],
    ["time_burden_minutes", "time-burden metadata"],
    ["equipment_needed", "equipment metadata"],
    ["patient_cooperation_required", "patient-cooperation metadata"],
    ["limitations", "limitations/interpretation cautions"],
    ["tags", "retrieval/clinical tags"]
  ]);
  [...(result.core || []), ...(result.conditional || [])].forEach((entry) => {
    assert.ok(
      !physicalExamTechniqueTooThin(entry.label || entry.exam_id || "", entry.technique || ""),
      `${result.intent_id}: ${entry.label || entry.exam_id} exported physical exam technique should be concrete and bedside-instructive, not a terse placeholder`
    );
  });
  assertExportedFields(result, "basic safety", result.safety || [], [
    ["options", "measurement/options"],
    ["reason", "rationale"],
    ["management_change", "management-changing implication"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"],
    ["difficulty", "difficulty metadata"],
    ["time_burden_minutes", "time-burden metadata"],
    ["equipment_needed", "equipment metadata"],
    ["patient_cooperation_required", "patient-cooperation metadata"],
    ["limitations", "limitations/interpretation cautions"],
    ["tags", "retrieval/clinical tags"]
  ]);
  assertExportedFields(result, "test/reference", result.tests || [], [
    ["reason", "diagnostic rationale"],
    ["management_change", "management-changing implication"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"],
    ["tags", "retrieval/clinical tags"]
  ]);
  assertExportedFields(result, "red flag", result.red_flags || [], [
    ["reason", "danger rationale"],
    ["management_change", "management-changing implication"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"],
    ["tags", "retrieval/clinical tags"]
  ]);
  assertExportedFields(result, "management-changing finding", result.management_changes || [], [
    ["reason", "diagnostic rationale"],
    ["management_change", "management-changing implication"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"]
  ]);
  (result.management_changes || []).forEach((entry) => {
    assert.doesNotMatch(
      String(entry.label || ""),
      /^Management implication - (?:management implication|linked workup item)$/i,
      `${result.intent_id}: management-changing finding should expose the specific clinical action, not a generic placeholder`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /\.\.\.$/,
      `${result.intent_id}: management-changing finding label should not be ellipsized; preserve the full action or a concise reviewed summary`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /[,:;]\s*$/,
      `${result.intent_id}: management-changing finding label should not end with a dangling punctuation fragment`
    );
    assert.doesNotMatch(
      String(entry.label || ""),
      /^Management implication - (?:Auscultate|Inspect|Palpate|Percuss|Observe|Test|Measure|Count|Use otoscope)\b/i,
      `${result.intent_id}: management-changing finding label should describe the management-changing result, not repeat the exam maneuver`
    );
  });
  assertExportedFields(result, "limitation", result.limitations || [], [
    ["reason", "interpretation rationale"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"],
    ["limitations", "limitations/interpretation cautions"]
  ]);
  const primaryVisibleLabels = new Set([
    ...(result.safety || []),
    ...(result.history || []),
    ...(result.core || []),
    ...(result.conditional || []),
    ...(result.tests || []),
    ...(result.red_flags || []),
    ...(result.management_changes || [])
  ].map((entry) => normalizedLabel(entry.label || "")).filter(Boolean));
  const visibleLimitationLabelCounts = new Map();
  (result.limitations || []).forEach((entry) => {
    const key = normalizedLabel(entry.label || "");
    if (!key) return;
    visibleLimitationLabelCounts.set(key, (visibleLimitationLabelCounts.get(key) || 0) + 1);
  });
  const duplicateVisibleLimitationLabels = Array.from(visibleLimitationLabelCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([label]) => label);
  assert.deepEqual(
    duplicateVisibleLimitationLabels,
    [],
    `${result.intent_id}: limitation/interpretation-caution labels should be unique within the workup`
  );
  (result.limitations || []).forEach((entry) => {
    const label = String(entry.label || "");
    assert.match(
      label,
      /^Interpretation caution - /,
      `${result.intent_id}: limitation rows should be labeled as interpretation cautions, not duplicate checklist items: ${label}`
    );
    assert.ok(
      !genericLimitationBaseLabel(label),
      `${result.intent_id}: limitation row should expose the specific clinical caution, not a generic placeholder: ${label}`
    );
    assert.ok(
      !rawQuestionLikeLabel(label),
      `${result.intent_id}: limitation row should not expose a raw overloaded question label: ${label}`
    );
    assert.ok(
      !primaryVisibleLabels.has(normalizedLabel(label)),
      `${result.intent_id}: limitation row label should not duplicate a primary recommendation label: ${label}`
    );
  });
  assertExportedFields(result, "evidence metadata", result.evidence_metadata || [], [
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"]
  ]);
  assertExportedFields(result, "suppressed/not-recommended", result.suppressed || [], [
    ["reason", "suppression reason"],
    ["evidence", "source/evidence metadata"],
    ["lr_note", "LR interpretation"],
    ["tags", "retrieval/clinical tags"]
  ]);
  assert.ok(Array.isArray(result.management_changes), `${result.intent_id}: report row should expose management-changing findings`);
  assert.ok(Array.isArray(result.limitations), `${result.intent_id}: report row should expose limitations and interpretation cautions`);
  assert.ok(Array.isArray(result.evidence_metadata), `${result.intent_id}: report row should expose evidence/LR metadata`);
  assert.ok(Array.isArray(result.suppressed), `${result.intent_id}: report row should expose suppressed/not-recommended items`);
  assert.ok(
    (result.suppressed || []).length > 0,
    `${result.intent_id}: validated workup export should include at least one suppressed/not-recommended item for auditability`
  );
  (result.suppressed || []).forEach((entry) => {
    const suppressedLabel = String(entry.label || "");
    assert.match(
      suppressedLabel,
      /^Not recommended - /,
      `${result.intent_id}: suppressed row label should be explicitly marked as not recommended: ${suppressedLabel}`
    );
    assert.ok(
      !primaryVisibleLabels.has(normalizedLabel(suppressedLabel)),
      `${result.intent_id}: suppressed row label should not visually duplicate a primary recommendation label: ${suppressedLabel}`
    );
    assert.ok(entry.exam_id, `${result.intent_id}: ${entry.label || "suppressed item"} suppressed row should expose a stable exam_id/item_id in report data`);
    assert.notEqual(entry.exam_id, "no-id", `${result.intent_id}: ${entry.label || "suppressed item"} suppressed row should not use a placeholder ID`);
    assert.ok(
      /suppress|validated_clinical_intent|scope|retrieval/i.test(entry.traceability?.authorized_by || ""),
      `${result.intent_id}: ${entry.label || entry.exam_id} suppressed row should preserve suppression/scope authorization metadata`
    );
    assert.ok(entry.reason || entry.management_change, `${result.intent_id}: ${entry.label || entry.exam_id} suppressed row should explain why it is not recommended`);
  });
  if ([...(result.safety || []), ...(result.core || []), ...(result.conditional || []), ...(result.limitations || [])].length) {
    [...(result.safety || []), ...(result.core || []), ...(result.conditional || []), ...(result.limitations || [])].forEach((entry) => {
      assert.ok(entry.lr_note, `${result.intent_id}: ${entry.label || entry.exam_id} should carry LR interpretation note in exported row data`);
    });
  }
  [
    ...(result.safety || []),
    ...(result.history || []),
    ...(result.core || []),
    ...(result.conditional || []),
    ...(result.tests || []),
    ...(result.red_flags || []),
    ...(result.management_changes || []),
    ...(result.limitations || []),
    ...(result.evidence_metadata || []),
    ...(result.suppressed || [])
  ].forEach((entry) => {
    assert.ok(entry.traceability, `${result.intent_id}: ${entry.label || entry.exam_id} should carry exported traceability metadata`);
    assert.ok(
      (entry.traceability.intent_ids || []).includes(result.intent_id),
      `${result.intent_id}: ${entry.label || entry.exam_id} traceability should include the selected validated intent`
    );
    assert.ok(
      (entry.traceability.source_ids || []).length,
      `${result.intent_id}: ${entry.label || entry.exam_id} traceability should include source IDs`
    );
    (entry.traceability.source_ids || []).forEach((sourceId) => {
      assert.ok(
        registryStyleSourceId(sourceId),
        `${result.intent_id}: ${entry.label || entry.exam_id} source ID should be a registry identifier, not citation prose or a URL: ${sourceId}`
      );
      assert.ok(
        registeredSourceIds.has(sourceId),
        `${result.intent_id}: ${entry.label || entry.exam_id} source ID should exist in the evidence or medical-knowledge source registry: ${sourceId}`
      );
    });
    assert.ok(
      !(entry.traceability.source_ids || []).some((sourceId) => /\[object Object\]/i.test(String(sourceId || ""))),
      `${result.intent_id}: ${entry.label || entry.exam_id} traceability should not stringify source objects`
    );
    assert.ok(
      entry.traceability.item_id || entry.exam_id,
      `${result.intent_id}: ${entry.label || entry.exam_id} traceability should include an item ID`
    );
  });
  assert.ok(Array.isArray(result.catalog_gaps), `${result.intent_id}: report row should expose catalog gaps separately`);
  (result.catalog_gaps || []).forEach((gap) => {
    assert.ok(gap.traceability?.catalog_gap, `${result.intent_id}: ${gap.label || gap.exam_id} gap export should be explicitly marked as a catalog gap`);
    assert.equal(gap.traceability?.authorized_by, "staged_catalog_gap", `${result.intent_id}: ${gap.label || gap.exam_id} gap export should remain reviewer-only`);
  });
});

const iterationSource = readFileSync("scripts/iterate-clinical-workups.js", "utf8");
[
  "function moduleExamAtomicityIssues",
  "bundled_exam_label",
  "vague_exam_label",
  "missing_exam_technique",
  "missing_exam_diagnostic_target",
  "missing_exam_management_change",
  "missing_exam_lr_fields",
  "missing_history_options",
  "missing_history_diagnostic_purpose",
  "missing_history_management_change"
].forEach((snippet) => {
  assert.ok(
    iterationSource.includes(snippet),
    `clinical workup iteration harness should enforce module-backed quality gate: ${snippet}`
  );
});

console.log(`Clinical intent workup audit passed for ${validatedIntents.length} validated intents.`);
