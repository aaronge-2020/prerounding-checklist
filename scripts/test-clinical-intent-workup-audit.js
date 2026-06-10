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
const appSource = readFileSync("index.html", "utf8");
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
assert.doesNotMatch(
  appSource,
  /moduleDetailParent\.open\s*=\s*true/,
  "installed guideline module audit detail should stay collapsed in the default clinician workup view"
);
assert.match(
  appSource,
  /Full recommendation detail/,
  "expanded recommendation detail should be explicitly labeled as review detail instead of rendering inline by default"
);
assert.match(
  appSource,
  /clinicalWorkupHistoryCountLabel/,
  "clinician workup UI should distinguish source history questions from atomic response components"
);
assert.match(
  appSource,
  /advancedWorkupOpen[\s\S]+clinicalIntentResults\.hidden\s*=\s*true/,
  "local bedside workup mirroring should hide the advanced intent-result copy unless advanced tools are open"
);
assert.match(
  appSource,
  /localMirrorHidden/,
  "local bedside workup mirroring should not copy the advanced copy's hidden state back onto bedside results"
);
assert.match(
  appSource,
  /simplifyLocalWorkupResultList[\s\S]+exam-result-text[\s\S]+remove/,
  "local bedside workup results should have a simplified clinician-facing renderer instead of exposing raw audit metadata"
);
assert.match(
  appSource,
  /moduleApplicabilitySummary[\s\S]+moduleApplicabilityAsLimitation/,
  "installed module applicability constraints should be visible in search rows and preserved in generated workup cautions"
);
assert.match(
  appSource,
  /selectedApplicabilityContextSignals[\s\S]+active_pregnancy_unconfirmed[\s\S]+runComplaintCdsButton\.disabled\s*=\s*!selected\.length\s*\|\|\s*Boolean\(applicabilityIssue\?\.blocking\)/,
  "active-pregnancy-required modules should block build controls until patient context confirms applicability"
);
assert.match(
  appSource,
  /active_pregnancy_unconfirmed[\s\S]+Open Advanced workup tools[\s\S]+refreshClinicalApplicabilityControls/,
  "applicability blockers should tell clinicians where to add context and refresh local/advanced build controls after modifier edits"
);
assert.match(
  appSource,
  /data-clinical-modifier="currently pregnant"[\s\S]+data-clinical-modifier="not pregnant"[\s\S]+data-clinical-modifier="postpartum"[\s\S]+data-clinical-modifier="male reproductive context"[\s\S]+data-clinical-modifier="ovarian uterine pregnancy-capable context"[\s\S]+data-clinical-modifier="pediatric age"[\s\S]+data-clinical-modifier="older adult frailty"/,
  "patient-context chips should explicitly capture pregnancy, postpartum, reproductive physiology, pediatric age, and older-adult/frailty context"
);
assert.match(
  appSource,
  /pediatric_age_not_supported[\s\S]+pregnancy_status_unassessed[\s\S]+male_context_unconfirmed[\s\S]+ovarian_context_unconfirmed/,
  "applicability gating should block adult/pediatric, pregnancy-status, and reproductive-context ambiguity before recommendations"
);
assert.match(
  appSource,
  /pediatricAlternativeIntentByAdultIntent[\s\S]+dka_hhs_v1[\s\S]+pediatric_dka_hhs_hyperglycemia_v1/,
  "adult DKA/HHS should be blocked by pediatric-age applicability context with a concrete pediatric DKA/HHS alternative"
);
assert.match(
  appSource,
  /pediatricAlternativeIntentByAdultIntent[\s\S]+bleeding_anemia_v1[\s\S]+pediatric_hematology_anemia_bleeding_v1/,
  "adult bleeding/anemia should be blocked by pediatric-age applicability context with a concrete pediatric hematology alternative"
);
assert.match(
  appSource,
  /olderAdultAge/,
  "applicability context should recognize older-adult and frailty modifiers before recommendations"
);
assert.match(
  appSource,
  /active_pregnancy_postpartum_context[\s\S]+nonpregnant diabetes or prediabetes workup[\s\S]+4-12 week 75-g OGTT/i,
  "postpartum context should route active-pregnancy GDM requests to nonpregnant diabetes follow-up rather than generic pregnancy contradiction"
);
assert.match(
  appSource,
  /clinical-modifier-body label[\s\S]+display:\s*block !important[\s\S]+clinical-modifier-input[\s\S]+display:\s*block !important/,
  "clinical modifier details input should remain visible in the clinical workup panel for exact non-PHI applicability context"
);
assert.match(
  appSource,
  /copyComplaintCdsButton[\s\S]+selectedWorkupApplicabilityIssue\(\)[\s\S]+applicabilityIssue\.message/,
  "copy/export controls should refuse workups blocked by applicability conflicts"
);
assert.match(
  appSource,
  /secondaryIntentSuggestionRules[\s\S]+pediatric_dka_hhs_hyperglycemia_v1[\s\S]+pediatric_hematology_anemia_bleeding_v1[\s\S]+abdominal_pain_cramping_v1[\s\S]+dka_hhs_v1[\s\S]+excludeModifier:[\s\S]+gestational_diabetes_intent_v1/,
  "acute modifier chips should map to concrete validated secondary-intent prompts instead of remaining decorative"
);
assert.match(
  appSource,
  /Modifier prompt:[\s\S]+Add validated workup[\s\S]+add\.dataset\.intentSelectId[\s\S]+elements\.clinicalIntentSelection\.addEventListener[\s\S]+closest\?\.\("\[data-intent-select-id\]"\)[\s\S]+selectClinicalIntent\(selectIntentId\)[\s\S]+elements\.localWorkupSelection\.addEventListener[\s\S]+closest\?\.\("\[data-intent-select-id\]"\)[\s\S]+selectClinicalIntent\(selectIntentId\)/,
  "secondary-intent prompts should let clinicians add the suggested validated workup"
);

function htmlAttributes(tag = "") {
  const attributes = {};
  [...String(tag || "").matchAll(/\s([a-zA-Z0-9_-]+)="([^"]*)"/g)].forEach(([, name, value]) => {
    attributes[name] = value;
  });
  return attributes;
}

const modifierChipTags = [...appSource.matchAll(/<button\b[^>]*class="clinical-modifier-chip"[^>]*data-clinical-modifier="[^"]+"[^>]*>/g)]
  .map((match) => match[0]);
const hiddenModifierChipTags = modifierChipTags
  .filter((tag) => /\s(?:hidden\b|aria-hidden="true")/i.test(tag))
  .map((tag) => tag.match(/data-clinical-modifier="([^"]+)"/)?.[1] || tag);
assert.deepEqual(
  hiddenModifierChipTags,
  [],
  "Clinical modifier chips must not be hidden from clinicians or assistive technology"
);
const modifierChips = modifierChipTags.map((tag) => htmlAttributes(tag));
assert.ok(modifierChips.length, "clinical modifier materiality audit should find visible modifier chips");
const validatedIntentIds = new Set(clinicalIntentRegistry.filter((row) => row.status === "validated").map((row) => row.intent_id));
const secondaryRuleSource = appSource.match(/const secondaryIntentSuggestionRules = \[([\s\S]*?)\];/)?.[1] || "";
const secondaryRuleIntentIds = new Set([...secondaryRuleSource.matchAll(/intentId:\s*"([^"]+)"/g)].map((match) => match[1]));
const selectedApplicabilitySignalSource = appSource.match(/function selectedApplicabilityContextSignals\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
const allowedModifierEffects = new Set(["secondary-intent", "applicability-context", "primary-output-diff"]);
const primaryOutputDiffRegressionIntentIds = new Set([
  "type_1_diabetes_mellitus_intent_v1",
  "type_2_diabetes_mellitus_intent_v1",
  "prediabetes_intent_v1",
  "fever_sepsis_v1",
  "suspected_pe_v1",
  "dka_hhs_v1"
]);
const modifierMaterialityIssues = [];
modifierChips.forEach((chip) => {
  const modifier = chip["data-clinical-modifier"] || "(missing modifier)";
  const effects = String(chip["data-modifier-effect"] || "").split(/\s+/).filter(Boolean);
  if (!effects.length) {
    modifierMaterialityIssues.push(`${modifier}: missing data-modifier-effect`);
  }
  effects.forEach((effect) => {
    if (!allowedModifierEffects.has(effect)) {
      modifierMaterialityIssues.push(`${modifier}: unknown modifier effect ${effect}`);
    }
  });
  if (!chip.title) {
    modifierMaterialityIssues.push(`${modifier}: missing clinician-facing title explaining what changes`);
  }
  if (effects.includes("secondary-intent")) {
    const secondaryIds = String(chip["data-secondary-intent-ids"] || "").split(/\s+/).filter(Boolean);
    if (!secondaryIds.length) {
      modifierMaterialityIssues.push(`${modifier}: secondary-intent effect missing data-secondary-intent-ids`);
    }
    secondaryIds.forEach((intentId) => {
      if (!validatedIntentIds.has(intentId)) {
        modifierMaterialityIssues.push(`${modifier}: secondary intent ${intentId} is not validated`);
      }
      if (!secondaryRuleIntentIds.has(intentId)) {
        modifierMaterialityIssues.push(`${modifier}: secondary intent ${intentId} is not represented in secondaryIntentSuggestionRules`);
      }
    });
  }
  if (effects.includes("applicability-context")) {
    const signals = String(chip["data-applicability-signals"] || "").split(/\s+/).filter(Boolean);
    if (!signals.length) {
      modifierMaterialityIssues.push(`${modifier}: applicability-context effect missing data-applicability-signals`);
    }
    signals.forEach((signal) => {
      assert.match(
        selectedApplicabilitySignalSource,
        new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
        `${modifier}: applicability signal ${signal} should be produced by selectedApplicabilityContextSignals`
      );
    });
  }
  if (effects.includes("primary-output-diff")) {
    const diffIntentIds = String(chip["data-primary-output-diff-intent-ids"] || "").split(/\s+/).filter(Boolean);
    if (!diffIntentIds.length) {
      modifierMaterialityIssues.push(`${modifier}: primary-output-diff effect missing data-primary-output-diff-intent-ids`);
    }
    diffIntentIds.forEach((intentId) => {
      if (!validatedIntentIds.has(intentId)) {
        modifierMaterialityIssues.push(`${modifier}: primary-output-diff intent ${intentId} is not validated`);
      }
      if (!primaryOutputDiffRegressionIntentIds.has(intentId)) {
        modifierMaterialityIssues.push(`${modifier}: primary-output-diff intent ${intentId} is not covered by modifier regression tests`);
      }
    });
    if (!/\b(?:primary|adds|changes|threshold|follow-up|escalation)\b/i.test(chip.title || "")) {
      modifierMaterialityIssues.push(`${modifier}: primary-output-diff title should tell clinicians what changes in the primary output`);
    }
  }
  if (!effects.some((effect) => ["secondary-intent", "applicability-context", "primary-output-diff"].includes(effect))) {
    modifierMaterialityIssues.push(`${modifier}: visible chip does not declare a material workup effect`);
  }
});
assert.deepEqual(
  modifierMaterialityIssues,
  [],
  `visible clinical modifier chips should declare and prove a material effect:\n${modifierMaterialityIssues.join("\n")}`
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

function comparatorFieldText(value) {
  if (Array.isArray(value)) {
    return value.map(comparatorFieldText).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(comparatorFieldText).filter(Boolean).join(" ");
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function comparatorEntryText(entry = {}) {
  return [
    entry.label,
    entry.text,
    entry.full_question,
    entry.reason,
    entry.diagnostic_purpose,
    entry.diagnostic_target,
    entry.management_implication,
    entry.management_change,
    entry.action,
    entry.options,
    entry.tags,
    entry.limitations,
    entry.source
  ].map(comparatorFieldText).filter(Boolean).join(" ");
}

function comparatorSectionText(result = {}, sections = []) {
  return sections
    .flatMap((section) => result[section] || [])
    .map(comparatorEntryText)
    .join(" | ");
}

function assertUniqueComparatorLabels(result = {}, sections = []) {
  const duplicates = [];
  sections.forEach((section) => {
    const seen = new Set();
    (result[section] || []).forEach((entry) => {
      const label = normalizedLabel(entry.label || entry.text || entry.exam_id || "");
      if (!label) {
        return;
      }
      if (seen.has(label)) {
        duplicates.push(`${section}: ${entry.label}`);
      }
      seen.add(label);
    });
  });
  assert.deepEqual(
    duplicates,
    [],
    `${result.intent_id}: competent-clinician comparator expects duplicate-free visible section labels`
  );
}

function assertCompetentClinicianComparator(iterationResults = []) {
  const resultsByIntent = new Map(iterationResults.map((result) => [result.intent_id, result]));
  const allClinicalSections = ["safety", "history", "core", "conditional", "tests", "red_flags", "management_changes"];
  const representativeRubric = [
    {
      intent_id: "type_2_diabetes_mellitus_intent_v1",
      domain: "endocrine",
      requirements: [
        ["history", /polyuria|polydipsia|dehydration|retinopathy|dilated eye|ASCVD|heart failure|foot wound|neuropathy/i, "diabetes symptom, complication, and ASCVD/HF history"],
        ["core", /Inspect feet[\s\S]*Palpate pedal pulses[\s\S]*monofilament|monofilament[\s\S]*Inspect feet[\s\S]*Palpate pedal pulses/i, "diabetes foot inspection, pulses, and monofilament"],
        ["tests", /A1c[\s\S]*(?:fasting plasma glucose|OGTT)[\s\S]*(?:CMP|eGFR)[\s\S]*(?:UACR|albumin)[\s\S]*(?:lipid|ketone|anion gap)/i, "diagnostic glucose criteria and complication/safety labs"],
        ["red_flags", /DKA|HHS|altered mental|dehydration|vomiting/i, "DKA/HHS escalation"],
        ["management_changes", /UACR|eGFR|ketosis|kidney-protective|treatment intensity/i, "management-changing diabetes thresholds"],
        ["all", /pituitary|diabetes insipidus|water deprivation|copeptin/i, "pituitary/DI leakage", "absent"]
      ]
    },
    {
      intent_id: "dyspnea_hf_v1",
      domain: "cardiopulmonary",
      requirements: [
        ["safety", /blood pressure[\s\S]*heart rate[\s\S]*respiratory rate[\s\S]*oxygen[\s\S]*temperature/i, "cardiopulmonary safety data"],
        ["history", /orthopnea|PND|cough|wheeze|chest pain|leg swelling|oxygen need|missed diuretics/i, "HF/dyspnea source and severity history"],
        ["core", /posterior lung fields[\s\S]*heart sounds[\s\S]*(?:jugular venous pressure|JVP)[\s\S]*edema[\s\S]*work of breathing/i, "lung, heart, JVP, edema, and work-of-breathing exam"],
        ["tests", /(?:BNP|NT-proBNP|CXR|chest radiograph|ECG|troponin|renal|electrolyte|diuresis|respiratory-support)/i, "HF/dyspnea tests and treatment-safety review"],
        ["red_flags", /respiratory failure|shock|acute heart-failure|hypotension|hypoxemia/i, "respiratory failure and shock escalation"],
        ["management_changes", /diuresis|oxygen|ventilatory support|telemetry|ECG|echo|disposition/i, "dyspnea management consequences"]
      ]
    },
    {
      intent_id: "fever_sepsis_v1",
      domain: "infectious",
      requirements: [
        ["safety", /temperature[\s\S]*mental status|mental status[\s\S]*temperature/i, "temperature and mental-status acuity"],
        ["history", /(?=[\s\S]*cough)(?=[\s\S]*(?:dysuria|flank))(?=[\s\S]*(?:rash|wound|line))(?=[\s\S]*(?:exposure|immunosuppression|pregnancy|host))/i, "source-localizing infection history"],
        ["core", /work of breathing[\s\S]*posterior lung fields[\s\S]*skin[\s\S]*oropharynx[\s\S]*radial pulses/i, "source and perfusion exam"],
        ["tests", /sepsis severity labs[\s\S]*source-directed infection studies[\s\S]*respiratory source imaging/i, "sepsis labs and source-directed tests"],
        ["red_flags", /shock|CNS|airway|purpura|necrotizing|high-risk host/i, "sepsis and danger-pattern escalation"],
        ["management_changes", /escalate unstable fever|suspected sepsis|outpatient follow-up|safety net/i, "escalation and safety-net consequences"]
      ]
    },
    {
      intent_id: "abdominal_pain_cramping_v1",
      domain: "GI",
      requirements: [
        ["history", /pain worst|changed over time|vomiting|diarrhea|blood|black stool|jaundice|urinary|flank|pregnancy|syncope|stool\/gas/i, "abdominal pain localization and red-flag history"],
        ["core", /Inspect abdomen[\s\S]*Percuss abdomen[\s\S]*Auscultate bowel sounds[\s\S]*Palpate abdomen/i, "atomic abdominal exam sequence"],
        ["conditional", /rebound tenderness|Murphy sign/i, "conditional peritoneal/biliary maneuvers"],
        ["tests", /Abdominal pain initial tests|CBC|CMP|lipase|urinalysis|pregnancy|Abdominal imaging pathway/i, "abdominal labs and imaging pathway"],
        ["red_flags", /acute abdomen|surgical|pregnancy|vascular|extra-abdominal/i, "acute abdomen and dangerous mimic escalation"],
        ["management_changes", /imaging|surgical consultation|NPO|analgesia|antibiotics|serial abdominal exams/i, "abdominal management consequences"],
        ["history", /DKA\/HHS|hypothyroid/i, "metabolic/endocrine label leakage", "absent"]
      ]
    },
    {
      intent_id: "genital_discharge_sti_v1",
      domain: "GU",
      requirements: [
        ["history", /discharge|dysuria|lesion|exposure|groin|inguinal|ectopic|PID|bleeding/i, "STI/GU exposure and complication history"],
        ["core", /Inspect genital area[\s\S]*Palpate inguinal lymph nodes/i, "consented genital inspection and inguinal nodes"],
        ["tests", /STI and urethritis\/cervicitis diagnostic pathway|NAAT|gonorrhea|chlamydia|HIV|syphilis/i, "STI diagnostic pathway"],
        ["red_flags", /Complicated STI\/GU|PID|ectopic|torsion|systemic|fever/i, "complicated GU/STI escalation"],
        ["management_changes", /partner counseling|empiric treatment|testing|torsion|epididymitis|follow-up/i, "STI management and partner consequences"]
      ]
    },
    {
      intent_id: "stroke_focal_neuro_v1",
      domain: "neuro",
      requirements: [
        ["history", /last known well|face droop|speech|weakness|numbness|vision loss|diplopia|ataxia|anticoagulant|hypoglycemia|seizure|trauma/i, "stroke timeline, localization, mimic, and anticoagulant history"],
        ["core", /pronator drift[\s\S]*visual fields[\s\S]*pupillary[\s\S]*extraocular[\s\S]*facial/i, "focal neurologic bedside maneuvers"],
        ["conditional", /finger-to-nose|rapid alternating|heel-to-shin|facial light touch|sharp sensation/i, "conditional coordination and sensory localization"],
        ["tests", /Stroke initial tests|CT|CTA|glucose|coag|thrombolysis|thrombectomy|timing/i, "stroke imaging, glucose, and treatment-timing pathway"],
        ["red_flags", /Stroke alert|neurologic danger|hemorrhage|reperfusion/i, "stroke alert escalation"],
        ["management_changes", /stroke|neuro escalation|imaging|thrombolysis|thrombectomy|fall precautions/i, "stroke management consequences"],
        ["history", /red-eye|eye redness|conjunctivitis/i, "red-eye history leakage", "absent"]
      ]
    },
    {
      intent_id: "focused_msk_v1",
      domain: "MSK",
      requirements: [
        ["history", /exact joint|body area|trauma|bear weight|hot swollen joint|neurologic deficit|bowel or bladder|anticoagulant/i, "site, trauma, infection, neuro, and fracture history"],
        ["core", /Inspect painful site[\s\S]*Palpate painful site[\s\S]*(?:range of motion|ROM)/i, "site-specific inspection, palpation, and ROM"],
        ["tests", /Focused MSK tests|imaging|aspiration|CBC|inflammatory|radiograph/i, "MSK test and imaging pathway"],
        ["red_flags", /MSK infection|fracture|neurologic|septic arthritis|neurovascular/i, "MSK infection/fracture/neuro red flags"],
        ["management_changes", /immobilization|aspiration|urgent referral|orthopedic|neurosurgical|activity restriction|imaging/i, "MSK management consequences"],
        ["history", /UTI|rash danger/i, "unrelated UTI/rash label leakage", "absent"]
      ]
    },
    {
      intent_id: "rash_skin_v1",
      domain: "derm",
      requirements: [
        ["history", /fever|mucosal|facial|tongue|trouble breathing|skin pain|blistering|purpura|new medication|wound drainage|travel|bite|immunocompromise/i, "rash danger, systemic, mucosal, and exposure history"],
        ["core", /Inspect skin/i, "skin morphology and distribution inspection"],
        ["conditional", /Inspect mucosa|mucosal/i, "mucosal inspection when indicated"],
        ["tests", /Dermatology source-directed tests|CBC|wound culture|KOH|scabies|viral PCR|biopsy|dermatology referral/i, "skin testing/biopsy pathway"],
        ["red_flags", /anaphylaxis|severe cutaneous|necrotizing|purpura|sepsis|immunocompromised|skin cancer/i, "dangerous rash escalation"],
        ["management_changes", /isolation|medication-stop|antimicrobial|allergy|biopsy|referral|escalation/i, "dermatology management consequences"]
      ]
    },
    {
      intent_id: "bleeding_anemia_v1",
      domain: "hematology",
      requirements: [
        ["history", /hematemesis|melena|hematochezia|bruising|petechiae|gum|nose bleeding|anticoagulant|syncope|dyspnea|chest pain|heavy menses|coagulopathy/i, "bleeding source, instability, medication, and coagulopathy history"],
        ["core", /sclerae and conjunctivae[\s\S]*oral mucosa[\s\S]*Inspect abdomen[\s\S]*bowel sounds[\s\S]*Palpate abdomen/i, "pallor/mucosa and GI bleed abdominal exam"],
        ["tests", /CBC|hemoglobin|platelets|PT\/INR|PTT|fibrinogen|type and screen|Hgb <7/i, "bleeding/anemia lab and transfusion thresholds"],
        ["red_flags", /hypotension|tachycardia|syncope|chest pain|dyspnea|altered mental|brisk bleeding|anticoagulant|pregnancy/i, "bleeding instability red flags"],
        ["management_changes", /transfusion|reversal|endoscopy|admission|iron|B12|medication holds|GI referral/i, "bleeding/anemia management consequences"]
      ]
    }
  ];

  representativeRubric.forEach(({ intent_id, domain, requirements }) => {
    const result = resultsByIntent.get(intent_id);
    assert.ok(result, `competent-clinician comparator missing ${domain} representative intent ${intent_id}`);
    assert.equal(result.status, "validated", `${intent_id}: comparator requires a validated intent`);
    assert.ok(result.complete_validated_workup, `${intent_id}: comparator target should be complete-ready`);
    assertUniqueComparatorLabels(result, ["history", "core", "conditional", "tests", "red_flags"]);
    requirements.forEach(([section, pattern, label, mode]) => {
      const sections = section === "all" ? allClinicalSections : [section];
      const sectionText = comparatorSectionText(result, sections);
      if (mode === "absent") {
        assert.doesNotMatch(sectionText, pattern, `${intent_id}: competent-clinician comparator should not show ${label}`);
      } else {
        assert.match(sectionText, pattern, `${intent_id}: competent-clinician comparator missing ${label}`);
      }
    });
  });
}

assertCompetentClinicianComparator(iterationRun.results);
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
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_fever_sepsis_v1"),
  "pediatric fever/sepsis should be a complete validated readiness row after adding age-band routing"
);
const pediatricFeverRow = iterationRun.results.find((result) => result.intent_id === "pediatric_fever_sepsis_v1");
assert.ok(pediatricFeverRow, "pediatric fever/sepsis iteration row should exist");
assert.equal(pediatricFeverRow.complete_validated_workup, true, "pediatric fever/sepsis should be complete and not left as staged review text");
[
  "SSC_PEDIATRIC_SEPSIS_2026",
  "NICE_SEPSIS_UNDER16_2025",
  "NICE_FEVER_UNDER5_NG143",
  "AAP_FEBRILE_INFANT_2021"
].forEach((sourceId) => {
  assert.ok(
    pediatricFeverRow.source_ids.includes(sourceId),
    `pediatric fever/sepsis should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricFeverRow.source_ids.includes("SSC_SEPSIS_2026") && !pediatricFeverRow.source_ids.includes("ATS_CAP_2025"),
  "pediatric fever/sepsis should not inherit adult sepsis or adult pneumonia source rows"
);
const pediatricSafetyText = (pediatricFeverRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricHistoryText = (pediatricFeverRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricExamText = [...(pediatricFeverRow.core || []), ...(pediatricFeverRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricTestsText = (pediatricFeverRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricRedFlagText = (pediatricFeverRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricManagementText = (pediatricFeverRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricSafetyText,
  /Measure temperature[\s\S]*Measure respiratory rate[\s\S]*Measure oxygen saturation[\s\S]*Measure heart rate[\s\S]*Measure blood pressure[\s\S]*Document mental status/i,
  "pediatric fever/sepsis should keep pediatric vitals and mental status in baseline safety data"
);
assert.match(
  pediatricHistoryText,
  /(?=[\s\S]*8 to 60 days)(?=[\s\S]*cough)(?=[\s\S]*(?:dysuria|flank))(?=[\s\S]*(?:abdominal|vomiting|diarrhea))(?=[\s\S]*(?:rash|wound|line))(?=[\s\S]*(?:neck|confusion|seizure))(?=[\s\S]*pregnancy)/i,
  "pediatric fever/sepsis should ask age-band, respiratory, urinary, GI, skin/line, CNS, and pregnancy-sensitive host/applicability history"
);
assert.match(
  pediatricExamText,
  /work of breathing[\s\S]*skin rash[\s\S]*capillary refill[\s\S]*lung sounds/i,
  "pediatric fever/sepsis should render individual core pediatric bedside maneuvers, not a generic focused pediatric exam"
);
assert.match(
  pediatricTestsText,
  /lactate[\s\S]*blood cultures[\s\S]*1 hour[\s\S]*3 hours[\s\S]*8 to 60 day/i,
  "pediatric fever/sepsis should include lactate/cultures/antibiotic timing and febrile-infant pathway tests"
);
assert.match(
  pediatricRedFlagText,
  /under 3 months[\s\S]*(?:shock|danger physiology)[\s\S]*(?:non-blanching|meningitis|CNS)/i,
  "pediatric fever/sepsis should include infant, shock, and meningitis/purpura escalation cues"
);
assert.match(
  pediatricManagementText,
  /escalate[\s\S]*10 to 20 mL\/kg[\s\S]*40 to 60 mL\/kg[\s\S]*(?:safety net|follow-up)[\s\S]*(?:pregnant|postpartum)/i,
  "pediatric fever/sepsis should show escalation, pediatric fluid reassessment, safety-net, and pregnancy/postpartum routing consequences"
);
const pediatricFeverTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_fever_sepsis_v1"],
  allMatches: false,
  modifiers: "febrile infant 8 to 60 days sore throat neck stiffness adolescent pregnancy",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const pediatricFeverTriggeredRow = pediatricFeverTriggeredRun.results.find((result) => result.intent_id === "pediatric_fever_sepsis_v1");
assert.ok(pediatricFeverTriggeredRow, "triggered pediatric fever/sepsis audit row should exist");
const pediatricTriggeredHistoryText = (pediatricFeverTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricTriggeredExamText = [...(pediatricFeverTriggeredRow.core || []), ...(pediatricFeverTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricTriggeredHistoryText,
  /well-appearing infant 8 to 60 days[\s\S]*(?:pregnancy possible|recent postpartum|pregnancy-specific)/i,
  "pediatric fever/sepsis conditional history should activate for infant and adolescent pregnancy trigger terms"
);
assert.match(
  pediatricTriggeredExamText,
  /Inspect oropharynx[\s\S]*(?:Test passive neck flexion|neck flexion)/i,
  "pediatric fever/sepsis conditional exam add-ons should activate for HEENT and meningitis trigger terms"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_respiratory_wheeze_v1"),
  "pediatric respiratory distress/wheeze should be a complete validated readiness row after adding pediatric cardiopulmonary routing"
);
const pediatricRespRow = iterationRun.results.find((result) => result.intent_id === "pediatric_respiratory_wheeze_v1");
assert.ok(pediatricRespRow, "pediatric respiratory distress/wheeze iteration row should exist");
assert.equal(pediatricRespRow.complete_validated_workup, true, "pediatric respiratory distress/wheeze should be complete and not left as staged review text");
[
  "NICE_BRONCHIOLITIS_NG9",
  "GINA_ASTHMA_2025",
  "NHLBI_NAEPP_ASTHMA_2020",
  "NICE_SEPSIS_UNDER16_2025"
].forEach((sourceId) => {
  assert.ok(
    pediatricRespRow.source_ids.includes(sourceId),
    `pediatric respiratory distress/wheeze should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricRespRow.source_ids.includes("AHA_ACC_HFSA_HF_2022") && !pediatricRespRow.source_ids.includes("ESC_HF_2021"),
  "pediatric respiratory distress/wheeze should not inherit adult heart failure source rows"
);
const pediatricRespSafetyText = (pediatricRespRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricRespHistoryText = (pediatricRespRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricRespExamText = [...(pediatricRespRow.core || []), ...(pediatricRespRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricRespTestsText = (pediatricRespRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricRespRedFlagText = (pediatricRespRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricRespManagementText = (pediatricRespRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricRespSafetyText,
  /Measure oxygen saturation[\s\S]*Measure respiratory rate[\s\S]*Measure temperature[\s\S]*Measure current weight[\s\S]*Document mental status[\s\S]*Document intake and urine output/i,
  "pediatric respiratory distress/wheeze should keep SpO2, respiratory rate, temperature, weight, alertness, and intake/urine in baseline safety data"
);
assert.match(
  pediatricRespHistoryText,
  /(?=[\s\S]*under 6 weeks)(?=[\s\S]*(?:coryzal|runny nose))(?=[\s\S]*recurrent episodic wheeze)(?=[\s\S]*(?:feeding|drinking))(?=[\s\S]*(?:choking|aspiration))(?=[\s\S]*(?:fever over 39|focal))/i,
  "pediatric respiratory distress/wheeze should ask age-band, bronchiolitis-pattern, asthma/atopy, feeding, foreign-body, and pneumonia/sepsis history"
);
assert.match(
  pediatricRespExamText,
  /Observe chest retractions[\s\S]*Inspect nasal flaring[\s\S]*Auscultate lung fields[\s\S]*Inspect lips and tongue color/i,
  "pediatric respiratory distress/wheeze should render individual respiratory bedside maneuvers, not a generic pulmonary exam"
);
assert.doesNotMatch(
  pediatricRespExamText,
  /oxygen saturation|respiratory rate|current weight|Document mental status/i,
  "pediatric respiratory distress/wheeze should not leak baseline safety data into physical exam maneuvers"
);
assert.match(
  pediatricRespTestsText,
  /Bronchiolitis testing limits[\s\S]*(?:do not routinely order blood tests or chest X-ray)[\s\S]*Chest imaging when focal or severe[\s\S]*Asthma response reassessment[\s\S]*Controller and trigger review/i,
  "pediatric respiratory distress/wheeze should include bronchiolitis testing limits, focal/severe imaging triggers, asthma response reassessment, and controller/trigger review"
);
assert.match(
  pediatricRespRedFlagText,
  /Apnea or central cyanosis[\s\S]*Exhaustion or poor respiratory effort[\s\S]*Severe respiratory distress[\s\S]*Poor intake or no urine/i,
  "pediatric respiratory distress/wheeze should include respiratory failure and hydration escalation red flags"
);
assert.match(
  pediatricRespManagementText,
  /Emergency pediatric respiratory escalation[\s\S]*Bronchiolitis supportive plan[\s\S]*Asthma acute plan[\s\S]*Respiratory home safety net/i,
  "pediatric respiratory distress/wheeze should show emergency escalation, bronchiolitis supportive care, asthma acute plan, and home safety-net consequences"
);
const pediatricRespTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_respiratory_wheeze_v1"],
  allMatches: false,
  modifiers: "bronchiolitis infant wheeze under 2 years poor intake dehydration no wet nappy asthma albuterol prior ICU",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 80,
  maxCoreItems: 24,
  maxConditionalItems: 36,
  limit: 0
});
const pediatricRespTriggeredRow = pediatricRespTriggeredRun.results.find((result) => result.intent_id === "pediatric_respiratory_wheeze_v1");
assert.ok(pediatricRespTriggeredRow, "triggered pediatric respiratory audit row should exist");
const pediatricRespTriggeredHistoryText = (pediatricRespTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricRespTriggeredExamText = [...(pediatricRespTriggeredRow.core || []), ...(pediatricRespTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricRespTriggeredHistoryText,
  /Which bronchiolitis severe-disease risk features[\s\S]*Has the child had ICU care/i,
  "pediatric respiratory conditional history should activate bronchiolitis high-risk and prior severe asthma rows"
);
assert.match(
  pediatricRespTriggeredExamText,
  /Inspect oral mucosa/i,
  "pediatric respiratory conditional exam should activate oral mucosa inspection for dehydration/poor intake triggers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_abdominal_pain_vomiting_v1"),
  "pediatric abdominal pain/vomiting should be a complete validated readiness row after adding pediatric GI/GU routing"
);
const pediatricAbdRow = iterationRun.results.find((result) => result.intent_id === "pediatric_abdominal_pain_vomiting_v1");
assert.ok(pediatricAbdRow, "pediatric abdominal pain/vomiting iteration row should exist");
assert.equal(pediatricAbdRow.complete_validated_workup, true, "pediatric abdominal pain/vomiting should be complete and not left as staged review text");
[
  "IDSA_APPENDICITIS_IMAGING_2024",
  "ACEP_APPENDICITIS_2023",
  "NICE_UTI_UNDER16_NG224",
  "NICE_GASTROENTERITIS_UNDER5_CG84",
  "NICE_ECTOPIC_MISCARRIAGE_NG126",
  "RCH_ACUTE_ABDOMINAL_PAIN",
  "RCH_VOMITING_CHILD"
].forEach((sourceId) => {
  assert.ok(
    pediatricAbdRow.source_ids.includes(sourceId),
    `pediatric abdominal pain/vomiting should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricAbdRow.source_ids.includes("AAFP_ACUTE_ABD_PAIN_2023") && !pediatricAbdRow.source_ids.includes("ACR_RLQ_PAIN_2022"),
  "pediatric abdominal pain/vomiting should not inherit adult abdominal pain source rows"
);
const pediatricAbdSafetyText = (pediatricAbdRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricAbdHistoryText = (pediatricAbdRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricAbdExamText = [...(pediatricAbdRow.core || []), ...(pediatricAbdRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricAbdTestsText = (pediatricAbdRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricAbdRedFlagText = (pediatricAbdRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricAbdManagementText = (pediatricAbdRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricAbdSafetyText,
  /Measure blood pressure[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Measure temperature[\s\S]*Measure current weight[\s\S]*Document mental status[\s\S]*Document intake and urine output[\s\S]*Measure bedside glucose/i,
  "pediatric abdominal pain/vomiting should keep vitals, weight, mental status, intake/urine output, and bedside glucose in baseline safety data"
);
assert.match(
  pediatricAbdHistoryText,
  /(?=[\s\S]*under 6 weeks)(?=[\s\S]*pain now)(?=[\s\S]*bilious green)(?=[\s\S]*blood or mucus)(?=[\s\S]*more than 5 diarrheal stools)(?=[\s\S]*dysuria)(?=[\s\S]*pregnancy possible)(?=[\s\S]*testicular pain)/i,
  "pediatric abdominal pain/vomiting should ask age-band, pain trajectory, vomiting character, stool/exposure, dehydration, urinary, pregnancy, and scrotal history"
);
assert.match(
  pediatricAbdExamText,
  /Inspect abdomen[\s\S]*Auscultate bowel sounds[\s\S]*Palpate abdomen for focal tenderness[\s\S]*Test rebound tenderness[\s\S]*Test capillary refill/i,
  "pediatric abdominal pain/vomiting should render individual abdominal and hydration maneuvers, not a generic focused exam"
);
assert.doesNotMatch(
  pediatricAbdExamText,
  /Measure blood pressure|Measure heart rate|Measure respiratory rate|Measure temperature|Measure current weight|Measure bedside glucose|Document intake and urine output/i,
  "pediatric abdominal pain/vomiting should not leak baseline safety data into physical exam maneuvers"
);
assert.match(
  pediatricAbdTestsText,
  /Right lower quadrant ultrasound first[\s\S]*Equivocal ultrasound appendicitis pathway[\s\S]*Urinalysis with urine culture[\s\S]*Pregnancy test for pregnancy-capable adolescent[\s\S]*Stool microbiology when indicated[\s\S]*Oral rehydration therapy threshold/i,
  "pediatric abdominal pain/vomiting should include ultrasound-first appendicitis logic, equivocal-US pathway, urine testing, pregnancy testing, stool triggers, and ORS threshold"
);
assert.match(
  pediatricAbdTestsText,
  /LR\+ about 14\.4[\s\S]*LR- about 0\.23|LR\+ about 14\.4[\s\S]*LR- about 0\.23/i,
  "pediatric abdominal pain/vomiting should expose available ultrasound likelihood-ratio context when available"
);
assert.match(
  pediatricAbdRedFlagText,
  /Bilious green vomiting[\s\S]*Peritonitis[\s\S]*Shock dehydration[\s\S]*ectopic pregnancy[\s\S]*testicular torsion/i,
  "pediatric abdominal pain/vomiting should include obstruction, peritonitis, dehydration/shock, ectopic, and torsion red flags"
);
assert.match(
  pediatricAbdManagementText,
  /Surgical or ED escalation[\s\S]*Appendicitis imaging disposition[\s\S]*Gastroenteritis oral rehydration safety net[\s\S]*UTI testing treatment[\s\S]*Adolescent pregnancy/i,
  "pediatric abdominal pain/vomiting should show surgical escalation, appendicitis imaging disposition, ORS safety net, UTI route, and adolescent pregnancy route"
);
const pediatricAbdTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_abdominal_pain_vomiting_v1"],
  allMatches: false,
  modifiers: "right lower quadrant migration appendicitis equivocal ultrasound bilious green vomit obstruction currant jelly blood in stool outbreak travel dehydration no urine poor intake adolescent missed period pregnancy vaginal bleeding syncope shoulder tip rectal pressure testicular scrotal high riding torsion",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 90,
  maxCoreItems: 28,
  maxConditionalItems: 44,
  limit: 0
});
const pediatricAbdTriggeredRow = pediatricAbdTriggeredRun.results.find((result) => result.intent_id === "pediatric_abdominal_pain_vomiting_v1");
assert.ok(pediatricAbdTriggeredRow, "triggered pediatric abdominal audit row should exist");
const pediatricAbdTriggeredHistoryText = (pediatricAbdTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricAbdTriggeredExamText = [...(pediatricAbdTriggeredRow.core || []), ...(pediatricAbdTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricAbdTriggeredHistoryText,
  /Are right lower quadrant pain[\s\S]*Are bilious green vomiting[\s\S]*If pregnancy is possible[\s\S]*Are blood or mucus in stool[\s\S]*is there sudden testicular pain/i,
  "pediatric abdominal conditional history should activate appendicitis, obstruction, ectopic, stool-testing, and torsion rows"
);
assert.match(
  pediatricAbdTriggeredExamText,
  /Percuss abdomen for peritoneal irritation[\s\S]*Inspect scrotum[\s\S]*Palpate testis position[\s\S]*Inspect oral mucosa/i,
  "pediatric abdominal conditional exam should activate peritoneal, scrotal, testis-position, and dehydration maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_chest_pain_syncope_v1"),
  "pediatric chest pain/syncope should be a complete validated readiness row after adding pediatric cardiopulmonary routing"
);
const pediatricChestRow = iterationRun.results.find((result) => result.intent_id === "pediatric_chest_pain_syncope_v1");
assert.ok(pediatricChestRow, "pediatric chest pain/syncope iteration row should exist");
assert.equal(pediatricChestRow.complete_validated_workup, true, "pediatric chest pain/syncope should be complete and not left as staged review text");
[
  "RCH_CHEST_PAIN_CHILD",
  "RCH_SYNCOPE_CHILD",
  "RCH_PEDIATRIC_ECG",
  "CHOP_PEDS_CHEST_PAIN_2025",
  "JHACH_CHEST_PAIN_2018"
].forEach((sourceId) => {
  assert.ok(
    pediatricChestRow.source_ids.includes(sourceId),
    `pediatric chest pain/syncope should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricChestRow.source_ids.includes("AHA_ACC_CHEST_PAIN_2021") && !pediatricChestRow.source_ids.includes("ESC_ACS_NSTE"),
  "pediatric chest pain/syncope should not inherit adult ACS source rows"
);
const pediatricChestSafetyText = (pediatricChestRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricChestHistoryText = (pediatricChestRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricChestExamText = [...(pediatricChestRow.core || []), ...(pediatricChestRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricChestTestsText = (pediatricChestRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricChestRedFlagText = (pediatricChestRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricChestManagementText = (pediatricChestRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricChestSafetyText,
  /Measure blood pressure[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Measure oxygen saturation[\s\S]*Measure temperature[\s\S]*Measure orthostatic blood pressure[\s\S]*Measure pain score/i,
  "pediatric chest pain/syncope should keep vitals, oxygen saturation, orthostatics, and pain score in baseline safety data"
);
assert.match(
  pediatricChestHistoryText,
  /(?=[\s\S]*under 6 weeks)(?=[\s\S]*crushing)(?=[\s\S]*syncope)(?=[\s\S]*family)(?=[\s\S]*dyspnea)(?=[\s\S]*hemoptysis)(?=[\s\S]*vaccination)(?=[\s\S]*reproducible)/i,
  "pediatric chest pain/syncope should ask age-band, pain character, syncope/palpitations, cardiac family history, respiratory/PE, illness/vaccine/drug, and reproducible pain history"
);
assert.match(
  pediatricChestExamText,
  /Auscultate heart sounds[\s\S]*Palpate peripheral pulses[\s\S]*Auscultate lung fields[\s\S]*Observe work of breathing[\s\S]*Palpate chest wall/i,
  "pediatric chest pain/syncope should render individual heart, pulse, lung, work-of-breathing, and chest-wall maneuvers"
);
assert.doesNotMatch(
  pediatricChestExamText,
  /Measure blood pressure|Measure heart rate|Measure respiratory rate|Measure oxygen saturation|Measure temperature|Measure orthostatic blood pressure|Measure pain score/i,
  "pediatric chest pain/syncope should not leak baseline safety data into physical exam maneuvers"
);
assert.match(
  pediatricChestTestsText,
  /ECG when cardiac risk or syncope is present[\s\S]*Chest X-ray only when indicated[\s\S]*Troponin and inflammatory labs when indicated[\s\S]*Syncope ECG glucose anemia and pregnancy tests[\s\S]*Echo Holter or exercise testing after review/i,
  "pediatric chest pain/syncope should include pediatric ECG indications, targeted CXR/troponin/labs, syncope testing, and post-review advanced testing"
);
assert.match(
  pediatricChestTestsText,
  /Guideline pathways do not provide one ECG LR[\s\S]*LR is not attached to CXR selection|LR is not attached to CXR selection[\s\S]*Guideline pathways do not provide one ECG LR/i,
  "pediatric chest pain/syncope should state when LR data are unavailable and fall back to source-specific indications"
);
assert.match(
  pediatricChestRedFlagText,
  /Exertional chest pain or syncope[\s\S]*Abnormal cardiac exam or poor perfusion[\s\S]*Family history of early sudden death[\s\S]*Hypoxia respiratory distress or hemoptysis[\s\S]*Abnormal pediatric ECG/i,
  "pediatric chest pain/syncope should include exertional, cardiac exam, family history, respiratory, and ECG red flags"
);
assert.match(
  pediatricChestManagementText,
  /Emergency pediatric cardiology escalation[\s\S]*Low-risk chest pain testing restraint[\s\S]*Syncope consultation and discharge route[\s\S]*Respiratory or PE route[\s\S]*Activity restriction and return precautions/i,
  "pediatric chest pain/syncope should show cardiology escalation, low-risk testing restraint, syncope disposition, respiratory/PE route, and activity restriction"
);
const pediatricChestTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_chest_pain_syncope_v1"],
  allMatches: false,
  modifiers: "syncope fainting passed out during exercise no prodrome sudden onset palpitations fast irregular rhythm svt family sudden death long qt wpw hemoptysis hypoxia estrogen pregnancy postpartum marfan cardiomyopathy myocarditis orthopnea gallop hypotension poor perfusion",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 90,
  maxCoreItems: 28,
  maxConditionalItems: 44,
  limit: 0
});
const pediatricChestTriggeredRow = pediatricChestTriggeredRun.results.find((result) => result.intent_id === "pediatric_chest_pain_syncope_v1");
assert.ok(pediatricChestTriggeredRow, "triggered pediatric chest pain/syncope audit row should exist");
const pediatricChestTriggeredHistoryText = (pediatricChestTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricChestTriggeredExamText = [...(pediatricChestTriggeredRow.core || []), ...(pediatricChestTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricChestTriggeredHistoryText,
  /For syncope or near-syncope[\s\S]*For palpitations[\s\S]*If PE is possible[\s\S]*pregnancy-capable adolescent/i,
  "pediatric chest conditional history should activate syncope, palpitations, PE-risk, and adolescent pregnancy rows"
);
assert.match(
  pediatricChestTriggeredExamText,
  /Inspect skin perfusion[\s\S]*Palpate liver edge[\s\S]*Inspect aortopathy features/i,
  "pediatric chest conditional exam should activate perfusion, liver-edge, and aortopathy maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_urinary_uti_pyelonephritis_v1"),
  "pediatric urinary/UTI should be a complete validated readiness row after adding pediatric GU routing"
);
const pediatricUtiRow = iterationRun.results.find((result) => result.intent_id === "pediatric_urinary_uti_pyelonephritis_v1");
assert.ok(pediatricUtiRow, "pediatric urinary/UTI iteration row should exist");
assert.equal(pediatricUtiRow.complete_validated_workup, true, "pediatric urinary/UTI should be complete and not left as staged review text");
[
  "NICE_UTI_UNDER16_NG224",
  "RCH_UTI_CHILD",
  "CHQ_PEDS_UTI_2024"
].forEach((sourceId) => {
  assert.ok(
    pediatricUtiRow.source_ids.includes(sourceId),
    `pediatric urinary/UTI should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricUtiRow.source_ids.includes("IDSA_CUTI_2025") && !pediatricUtiRow.source_ids.includes("EAU_URO_INFECTIONS"),
  "pediatric urinary/UTI should not inherit adult GU/pyelonephritis source rows"
);
const pediatricUtiSafetyText = (pediatricUtiRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricUtiHistoryText = (pediatricUtiRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricUtiExamText = [...(pediatricUtiRow.core || []), ...(pediatricUtiRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricUtiTestsText = (pediatricUtiRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricUtiRedFlagText = (pediatricUtiRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricUtiManagementText = (pediatricUtiRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricUtiSafetyText,
  /Measure temperature[\s\S]*Measure blood pressure[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Document mental status[\s\S]*Document intake and urine output[\s\S]*Measure current weight/i,
  "pediatric urinary/UTI should keep temperature, blood pressure, vitals, mental status, intake/urine output, and weight in baseline safety data"
);
assert.match(
  pediatricUtiHistoryText,
  /(?=[\s\S]*under 28 days)(?=[\s\S]*painful urination)(?=[\s\S]*poor feeding)(?=[\s\S]*loin)(?=[\s\S]*previous confirmed UTI)(?=[\s\S]*nappy rash)/i,
  "pediatric urinary/UTI should ask age-band, classic urinary, infant nonspecific, upper-tract, risk-factor, and mimic history"
);
assert.match(
  pediatricUtiExamText,
  /Palpate suprapubic area[\s\S]*Palpate loin tenderness[\s\S]*Inspect oral mucosa[\s\S]*Inspect external genitalia when indicated/i,
  "pediatric urinary/UTI should render individual suprapubic, loin, hydration, and indicated external-genitalia maneuvers"
);
assert.doesNotMatch(
  pediatricUtiExamText,
  /Measure temperature|Measure blood pressure|Measure heart rate|Measure respiratory rate|Document mental status|Document intake and urine output|Measure current weight/i,
  "pediatric urinary/UTI should not leak baseline safety data into physical exam maneuvers"
);
assert.match(
  pediatricUtiTestsText,
  /Urine sample before antibiotics when feasible[\s\S]*Dipstick microscopy and culture interpretation[\s\S]*Upper-tract labs and renal ultrasound when indicated[\s\S]*Age-based UTI imaging schedule[\s\S]*Adolescent STI and pregnancy tests when indicated/i,
  "pediatric urinary/UTI should include urine collection validity, dipstick/culture interpretation, upper-tract tests, age-based imaging, and adolescent STI/pregnancy tests"
);
assert.match(
  pediatricUtiTestsText,
  /Guidelines do not provide one universal LR[\s\S]*LR is not applicable to guideline imaging schedules|LR is not applicable to guideline imaging schedules[\s\S]*Guidelines do not provide one universal LR/i,
  "pediatric urinary/UTI should explain unavailable LR data and use source-defined testing thresholds"
);
assert.match(
  pediatricUtiRedFlagText,
  /Suspected UTI in baby under 3 months[\s\S]*Toxic appearance or sepsis physiology[\s\S]*Upper UTI or pyelonephritis features[\s\S]*Atypical or recurrent UTI[\s\S]*Contaminated sample, bag culture, chronic catheter, or colonization risk/i,
  "pediatric urinary/UTI should include infant, sepsis, upper-tract, atypical/recurrent, and contamination/catheter red flags"
);
assert.match(
  pediatricUtiManagementText,
  /Infant or sepsis escalation[\s\S]*Uncomplicated outpatient UTI route[\s\S]*Upper or complex UTI route[\s\S]*Imaging and follow-up stewardship[\s\S]*Culture follow-up, return precautions, and recurrence prevention/i,
  "pediatric urinary/UTI should show infant/sepsis escalation, outpatient route, complex route, imaging stewardship, and culture follow-up consequences"
);
const pediatricUtiTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_urinary_uti_pyelonephritis_v1"],
  allMatches: false,
  modifiers: "urine sample collected clean catch bag specimen sexually active pregnancy possible sti symptoms long-term catheter recent instrumentation known colonization known resistant organism mitrofanoff neurogenic bladder prophylactic antibiotics poor urine flow raised creatinine non e coli not responding 48 hours bladder mass atypical uti recurrent uti criteria urinary retention leg weakness saddle",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 90,
  maxCoreItems: 28,
  maxConditionalItems: 44,
  limit: 0
});
const pediatricUtiTriggeredRow = pediatricUtiTriggeredRun.results.find((result) => result.intent_id === "pediatric_urinary_uti_pyelonephritis_v1");
assert.ok(pediatricUtiTriggeredRow, "triggered pediatric urinary/UTI audit row should exist");
const pediatricUtiTriggeredHistoryText = (pediatricUtiTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricUtiTriggeredExamText = [...(pediatricUtiTriggeredRow.core || []), ...(pediatricUtiTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricUtiTriggeredHistoryText,
  /Which urine collection method[\s\S]*adolescent with urinary symptoms[\s\S]*catheter\/anomaly\/prophylaxis[\s\S]*Atypical or recurrent UTI/i,
  "pediatric urinary/UTI conditional history should activate collection, adolescent STI/pregnancy, catheter/anomaly, and atypical/recurrent rows"
);
assert.match(
  pediatricUtiTriggeredExamText,
  /Palpate abdomen for bladder or abdominal mass[\s\S]*Test lower-limb reflex symmetry/i,
  "pediatric urinary/UTI conditional exam should activate bladder/mass and neurologic-bladder maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_rash_skin_v1"),
  "pediatric rash/skin should be a complete validated readiness row after adding pediatric derm routing"
);
const pediatricRashRow = iterationRun.results.find((result) => result.intent_id === "pediatric_rash_skin_v1");
assert.ok(pediatricRashRow, "pediatric rash/skin iteration row should exist");
assert.equal(pediatricRashRow.complete_validated_workup, true, "pediatric rash/skin should be complete and not left as staged review text");
[
  "NICE_FEVER_UNDER5_NG143",
  "RCH_PETECHIAE_PURPURA_CHILD",
  "RCH_KAWASAKI_DISEASE",
  "RCH_URTICARIA_CHILD",
  "JHACH_SSTI_CHILD_2023"
].forEach((sourceId) => {
  assert.ok(
    pediatricRashRow.source_ids.includes(sourceId),
    `pediatric rash/skin should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricRashRow.source_ids.includes("AHRQ_CALIBRATE_DX") && !pediatricRashRow.source_ids.includes("MCGEE_EBPD"),
  "pediatric rash/skin should not inherit adult generic dermatology source rows"
);
const pediatricRashSafetyText = (pediatricRashRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricRashHistoryText = (pediatricRashRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricRashExamText = [...(pediatricRashRow.core || []), ...(pediatricRashRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricRashTestsText = (pediatricRashRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricRashRedFlagText = (pediatricRashRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricRashManagementText = (pediatricRashRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricRashSafetyText,
  /Measure temperature[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Measure oxygen saturation[\s\S]*Measure blood pressure[\s\S]*Document mental status[\s\S]*Measure current weight/i,
  "pediatric rash/skin should keep vitals, mental status, and weight in baseline safety data"
);
assert.match(
  pediatricRashHistoryText,
  /Ask pediatric rash age and vulnerability[\s\S]*Ask rash morphology and progression[\s\S]*Ask fever and systemic danger symptoms[\s\S]*Ask hives and anaphylaxis symptoms[\s\S]*Ask Kawasaki fever and feature history[\s\S]*Ask skin infection and source-control history[\s\S]*Ask bleeding trauma and vasculitis clues/i,
  "pediatric rash/skin should ask age/vulnerability, morphology, systemic danger, anaphylaxis, Kawasaki, SSTI, and bleeding/vasculitis history"
);
assert.doesNotMatch(
  pediatricRashHistoryText,
  /urinary and flank infection-source symptoms|skin\/line infection-source symptoms/i,
  "pediatric rash/skin history labels should not be generic infection-source labels"
);
assert.match(
  pediatricRashExamText,
  /Inspect rash morphology and distribution[\s\S]*Test rash blanching with clear pressure[\s\S]*Inspect oral mucosa and lips[\s\S]*Inspect conjunctival injection[\s\S]*Inspect skin infection border warmth and drainage/i,
  "pediatric rash/skin should render individual rash, blanching, mucosal, conjunctival, and SSTI maneuvers"
);
assert.doesNotMatch(
  pediatricRashExamText,
  /Measure temperature|Measure heart rate|Measure respiratory rate|Measure oxygen saturation|Measure blood pressure|Document mental status|Measure current weight|generic focused skin exam/i,
  "pediatric rash/skin should not leak baseline safety data or generic focused exam labels into physical exam maneuvers"
);
assert.match(
  pediatricRashTestsText,
  /Non-blanching rash senior-review tests[\s\S]*Kawasaki labs ECG and echocardiography route[\s\S]*SSTI culture imaging and source control route[\s\S]*Anaphylaxis immediate treatment route[\s\S]*Bleeding vasculitis and hematology screen/i,
  "pediatric rash/skin should include non-blanching/sepsis tests, Kawasaki ECG/echo route, SSTI source control, anaphylaxis action, and heme/vasculitis tests"
);
assert.match(
  pediatricRashTestsText,
  /Guidelines do not provide one universal LR[\s\S]*LR is not applicable to the Kawasaki testing route|LR is not applicable to the Kawasaki testing route[\s\S]*Guidelines do not provide one universal LR/i,
  "pediatric rash/skin should explain unavailable LR data and fall back to source-defined thresholds"
);
assert.match(
  pediatricRashRedFlagText,
  /Non-blanching rash with fever or unwell child[\s\S]*Urticaria with airway breathing circulation or GI symptoms[\s\S]*Prolonged fever with Kawasaki features[\s\S]*Severe skin infection or necrotizing features[\s\S]*Purpura with bleeding abdominal joint or hematology features/i,
  "pediatric rash/skin should include non-blanching, anaphylaxis, Kawasaki, severe SSTI, and bleeding/heme red flags"
);
assert.match(
  pediatricRashManagementText,
  /Immediate sepsis or meningococcal route[\s\S]*Anaphylaxis observation and discharge route[\s\S]*Kawasaki senior review and cardiac route[\s\S]*SSTI outpatient observation or admission route[\s\S]*Low-risk rash discharge and return precautions/i,
  "pediatric rash/skin should show sepsis, anaphylaxis, Kawasaki, SSTI, and low-risk discharge consequences"
);
const pediatricRashTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_rash_skin_v1"],
  allMatches: false,
  modifiers: "chronic urticaria hives more than 6 weeks teen pregnancy possible new medicine rash recent travel rash measles exposure cervical lymph node bruising with rash hepatosplenomegaly kawasaki hands feet palms soles rash desquamation perineal rash",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 90,
  maxCoreItems: 28,
  maxConditionalItems: 44,
  limit: 0
});
const pediatricRashTriggeredRow = pediatricRashTriggeredRun.results.find((result) => result.intent_id === "pediatric_rash_skin_v1");
assert.ok(pediatricRashTriggeredRow, "triggered pediatric rash/skin audit row should exist");
const pediatricRashTriggeredHistoryText = (pediatricRashTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricRashTriggeredExamText = [...(pediatricRashTriggeredRow.core || []), ...(pediatricRashTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricRashTriggeredHistoryText,
  /Ask chronic urticaria duration and systemic features[\s\S]*Ask adolescent pregnancy and medication context[\s\S]*Ask travel outbreak and contact exposure/i,
  "pediatric rash/skin conditional history should activate chronic urticaria, adolescent medication/pregnancy, and exposure rows"
);
assert.match(
  pediatricRashTriggeredExamText,
  /Palpate cervical lymph node size[\s\S]*Palpate liver edge and spleen tip[\s\S]*Inspect palms soles and perineum/i,
  "pediatric rash/skin conditional exam should activate lymph-node, liver/spleen, and palms/soles/perineal maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_msk_limp_hot_joint_v1"),
  "pediatric MSK limp/hot-joint should be a complete validated readiness row after adding pediatric orthopaedic routing"
);
const pediatricMskRow = iterationRun.results.find((result) => result.intent_id === "pediatric_msk_limp_hot_joint_v1");
assert.ok(pediatricMskRow, "pediatric MSK limp/hot-joint iteration row should exist");
assert.equal(pediatricMskRow.complete_validated_workup, true, "pediatric MSK limp/hot-joint should be complete and not left as staged review text");
[
  "RCH_LIMPING_CHILD",
  "RCH_BONE_JOINT_INFECTION",
  "CHQ_LIMP_CHILD_2026",
  "CHQ_BONE_JOINT_INFECTION_2025",
  "ACR_ACUTELY_LIMPING_CHILD_2018"
].forEach((sourceId) => {
  assert.ok(
    pediatricMskRow.source_ids.includes(sourceId),
    `pediatric MSK limp/hot-joint should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricMskRow.source_ids.includes("AAFP_MONOARTHRITIS_2025") && !pediatricMskRow.source_ids.includes("ACP_LOW_BACK_PAIN_2017"),
  "pediatric MSK limp/hot-joint should not inherit adult monoarthritis or adult low-back-pain source rows"
);
const pediatricMskSafetyText = (pediatricMskRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricMskHistoryText = (pediatricMskRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricMskExamText = [...(pediatricMskRow.core || []), ...(pediatricMskRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricMskTestsText = (pediatricMskRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricMskRedFlagText = (pediatricMskRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricMskManagementText = (pediatricMskRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricMskSafetyText,
  /Measure temperature[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Measure blood pressure[\s\S]*Measure oxygen saturation[\s\S]*Document mental status[\s\S]*Measure current weight[\s\S]*Measure pain score/i,
  "pediatric MSK limp/hot-joint should keep pediatric vitals, mental status, weight, and pain score in baseline safety data"
);
assert.match(
  pediatricMskHistoryText,
  /Ask pediatric MSK age and walking baseline[\s\S]*Ask current weight-bearing ability[\s\S]*Ask onset and injury mechanism[\s\S]*Ask pain location and referred pain[\s\S]*Ask fever and infection symptoms[\s\S]*Ask swelling and motion limitation[\s\S]*Ask systemic and malignancy clues/i,
  "pediatric MSK limp/hot-joint should ask age/baseline, weight-bearing, mechanism, localization, infection, swelling/motion, and systemic-red-flag history"
);
assert.match(
  pediatricMskHistoryText,
  /Multi-select:[\s\S]*Endorsed able to walk comfortably[\s\S]*Denied unable to bear weight/i,
  "pediatric MSK limp/hot-joint should expose explicit multi-select and endorsed/denied controls"
);
assert.match(
  pediatricMskExamText,
  /Observe gait[\s\S]*Inspect affected limb position[\s\S]*Palpate focal bony tenderness[\s\S]*Test active joint motion[\s\S]*Test passive joint motion/i,
  "pediatric MSK limp/hot-joint should render individual gait, inspection, palpation, active-motion, and passive-motion maneuvers"
);
assert.doesNotMatch(
  pediatricMskExamText,
  /Measure temperature|Measure heart rate|Measure respiratory rate|Measure blood pressure|Measure oxygen saturation|Document mental status|Measure current weight|Measure pain score|generic focused musculoskeletal exam/i,
  "pediatric MSK limp/hot-joint should not leak baseline safety data or generic focused exam labels into physical exam maneuvers"
);
assert.match(
  pediatricMskTestsText,
  /No routine tests for low-risk comfortable limp[\s\S]*X-ray localized pain or injury area[\s\S]*Infection labs and blood culture route[\s\S]*Ultrasound hip effusion route[\s\S]*MRI for osteomyelitis localization/i,
  "pediatric MSK limp/hot-joint should include low-risk testing restraint, site-specific X-ray, infection labs/cultures, ultrasound effusion route, and MRI localization"
);
assert.match(
  pediatricMskTestsText,
  /no laboratory test or combination is specific[\s\S]*no single LR is encoded|no single LR is encoded[\s\S]*no laboratory test or combination is specific/i,
  "pediatric MSK limp/hot-joint should explain unavailable LR data and fall back to guideline/source rationale"
);
assert.match(
  pediatricMskRedFlagText,
  /Unable to walk or weight bear[\s\S]*Fever with hot swollen limited joint[\s\S]*Systemically unwell or sepsis physiology[\s\S]*Night pain weight loss pallor bruising[\s\S]*Safeguarding concern or inconsistent injury/i,
  "pediatric MSK limp/hot-joint should include non-weight-bearing, septic-joint, sepsis, malignancy/systemic, and safeguarding red flags"
);
assert.match(
  pediatricMskManagementText,
  /Immediate orthopedic route for septic arthritis[\s\S]*Bone infection admission and antibiotic route[\s\S]*Low-risk discharge only when walking comfortably[\s\S]*Persistent limp or negative X-ray route[\s\S]*Referred or systemic cause route/i,
  "pediatric MSK limp/hot-joint should show orthopaedic, bone-infection, low-risk discharge, persistent-limp, and referred/systemic management consequences"
);
const pediatricMskTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_msk_limp_hot_joint_v1"],
  allMatches: false,
  modifiers: "hip pain septic arthritis transient synovitis joint effusion fever adolescent groin pain thigh pain scfe fall unwitnessed delayed presentation bruising inconsistent history back pain weakness urinary retention numbness fracture dislocation cool limb wound puncture",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 90,
  maxCoreItems: 28,
  maxConditionalItems: 44,
  limit: 0
});
const pediatricMskTriggeredRow = pediatricMskTriggeredRun.results.find((result) => result.intent_id === "pediatric_msk_limp_hot_joint_v1");
assert.ok(pediatricMskTriggeredRow, "triggered pediatric MSK limp/hot-joint audit row should exist");
const pediatricMskTriggeredHistoryText = (pediatricMskTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricMskTriggeredExamText = [...(pediatricMskTriggeredRow.core || []), ...(pediatricMskTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricMskTriggeredHistoryText,
  /Ask septic hip predictor context[\s\S]*Ask adolescent hip slip symptoms[\s\S]*Ask safeguarding and injury consistency[\s\S]*Ask back neurologic and bladder symptoms/i,
  "pediatric MSK conditional history should activate septic-hip, adolescent-hip, safeguarding, and back-neuro rows"
);
assert.match(
  pediatricMskTriggeredExamText,
  /Palpate joint effusion[\s\S]*Inspect open wounds[\s\S]*Palpate distal pulses[\s\S]*Inspect injury pattern/i,
  "pediatric MSK conditional exam should activate effusion, wound, distal-pulse, and injury-pattern maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_neuro_headache_seizure_ams_v1"),
  "pediatric neuro headache/seizure/AMS should be a complete validated readiness row after adding pediatric neuro routing"
);
const pediatricNeuroRow = iterationRun.results.find((result) => result.intent_id === "pediatric_neuro_headache_seizure_ams_v1");
assert.ok(pediatricNeuroRow, "pediatric neuro headache/seizure/AMS iteration row should exist");
assert.equal(pediatricNeuroRow.complete_validated_workup, true, "pediatric neuro headache/seizure/AMS should be complete and not left as staged review text");
[
  "RCH_HEADACHE_CHILD",
  "RCH_SEIZURES_ACUTE_2025",
  "RCH_ALTERED_CONSCIOUS_STATE_2022",
  "NICE_NG127_CHILD_NEURO_2019",
  "NICE_NG217_EPILEPSY_2025",
  "CHQ_STATUS_EPILEPTICUS_CHILD"
].forEach((sourceId) => {
  assert.ok(
    pediatricNeuroRow.source_ids.includes(sourceId),
    `pediatric neuro headache/seizure/AMS should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricNeuroRow.source_ids.includes("AHA_ASA_STROKE_2019"),
  "pediatric neuro headache/seizure/AMS should not inherit the adult stroke guideline source"
);
const pediatricNeuroSafetyText = (pediatricNeuroRow.safety || []).map((entry) => entry.label).join(" | ");
const pediatricNeuroHistoryText = (pediatricNeuroRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricNeuroExamText = [...(pediatricNeuroRow.core || []), ...(pediatricNeuroRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
const pediatricNeuroTestsText = (pediatricNeuroRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.reference_range_or_threshold, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricNeuroRedFlagText = (pediatricNeuroRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
const pediatricNeuroManagementText = (pediatricNeuroRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricNeuroSafetyText,
  /Measure temperature[\s\S]*Measure heart rate[\s\S]*Measure respiratory rate[\s\S]*Measure blood pressure[\s\S]*Measure oxygen saturation[\s\S]*Document mental status with AVPU or pediatric GCS[\s\S]*Measure bedside glucose[\s\S]*Measure current weight/i,
  "pediatric neuro should keep pediatric vitals, mental status/GCS, bedside glucose, and weight in baseline safety data"
);
assert.match(
  pediatricNeuroHistoryText,
  /Ask pediatric neuro age and baseline[\s\S]*Ask headache pattern and triggers[\s\S]*Ask headache-associated danger features[\s\S]*Ask seizure or blackout event details[\s\S]*Ask recovery and focal deficit status[\s\S]*Ask fever and CNS infection features[\s\S]*Ask trauma toxin and metabolic context/i,
  "pediatric neuro should ask age/baseline, headache, red flags, seizure event, recovery/focal deficit, CNS infection, and trauma/toxin/metabolic history"
);
assert.match(
  pediatricNeuroHistoryText,
  /Multi-select:[\s\S]*still seizing[\s\S]*full recovery[\s\S]*unable to obtain/i,
  "pediatric neuro should expose explicit multi-select seizure/recovery documentation controls"
);
assert.match(
  pediatricNeuroExamText,
  /Inspect pupils[\s\S]*Inspect eye movements[\s\S]*Test limb strength[\s\S]*Test coordination or gait when safe[\s\S]*Inspect optic discs by fundoscopy/i,
  "pediatric neuro should render individual pupil, eye-movement, strength, coordination/gait, and fundoscopy maneuvers"
);
assert.doesNotMatch(
  pediatricNeuroExamText,
  /Measure temperature|Measure heart rate|Measure respiratory rate|Measure blood pressure|Measure oxygen saturation|Measure bedside glucose|Measure current weight|generic broad neurologic exam|NIHSS-only/i,
  "pediatric neuro should not leak baseline safety data, adult NIHSS-only scoring, or generic broad neuro exam labels into physical exam maneuvers"
);
assert.match(
  pediatricNeuroTestsText,
  /Do not order routine tests for low-risk headache[\s\S]*Point-of-care glucose[\s\S]*Seizure metabolic labs when indicated[\s\S]*12-lead ECG when seizure mimic or first seizure assessment[\s\S]*Neuroimaging when indicated[\s\S]*EEG and urgent first-seizure referral[\s\S]*CNS infection testing with LP safety check/i,
  "pediatric neuro should include low-risk headache testing restraint, glucose, conditional metabolic labs, ECG, imaging, EEG/referral, and CNS infection/LP-safety routes"
);
assert.match(
  pediatricNeuroTestsText,
  /EEG should support diagnosis but should not be used alone to exclude epilepsy[\s\S]*Reduced GCS: do not perform LP|Reduced GCS: do not perform LP[\s\S]*EEG should support diagnosis but should not be used alone to exclude epilepsy/i,
  "pediatric neuro should explain unavailable LR/evidence limits and include EEG and LP safety limitations"
);
assert.match(
  pediatricNeuroRedFlagText,
  /Seizure over 5 minutes or repeated without recovery[\s\S]*Persistent altered conscious state[\s\S]*Pediatric headache red flags[\s\S]*Focal deficit, papilledema, or raised-ICP signs[\s\S]*CNS infection, trauma, toxin, or safeguarding concern/i,
  "pediatric neuro should include status, altered-state, headache, focal/ICP, and infection/trauma/toxin/safeguarding red flags"
);
assert.match(
  pediatricNeuroManagementText,
  /Active seizure emergency route[\s\S]*Persistent altered conscious state admission or transfer[\s\S]*Headache red flag senior review route[\s\S]*First seizure follow-up route[\s\S]*Low-risk headache discharge constraints/i,
  "pediatric neuro should show emergency seizure, altered-state, headache-red-flag, first-seizure follow-up, and low-risk discharge consequences"
);
const pediatricNeuroTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_neuro_headache_seizure_ams_v1"],
  allMatches: false,
  modifiers: "under 4 infant head circumference fontanelle sunsetting known epilepsy seizure plan rescue medication missed antiseizure adolescent pregnancy possible postpartum estrogen medication overuse self-harm vp shunt neurosurgery bleeding disorder sickle cell immunosuppression head injury fall safeguarding toxin fever photophobia rash",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 120,
  maxCoreItems: 30,
  maxConditionalItems: 60,
  limit: 0
});
const pediatricNeuroTriggeredRow = pediatricNeuroTriggeredRun.results.find((result) => result.intent_id === "pediatric_neuro_headache_seizure_ams_v1");
assert.ok(pediatricNeuroTriggeredRow, "triggered pediatric neuro audit row should exist");
const pediatricNeuroTriggeredHistoryText = (pediatricNeuroTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricNeuroTriggeredExamText = [...(pediatricNeuroTriggeredRow.core || []), ...(pediatricNeuroTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricNeuroTriggeredHistoryText,
  /Ask under-4 head size and raised-ICP context[\s\S]*Ask known epilepsy and rescue plan[\s\S]*Ask adolescent confidential neuro context[\s\S]*Ask shunt bleeding and immune-risk context/i,
  "pediatric neuro conditional history should activate under-4 ICP, known epilepsy, adolescent, and shunt/bleeding/immune-risk rows"
);
assert.match(
  pediatricNeuroTriggeredExamText,
  /Test neck stiffness[\s\S]*Inspect skin for rash or bruising[\s\S]*Inspect head for trauma signs[\s\S]*Measure head circumference/i,
  "pediatric neuro conditional exam should activate meningism, rash/bruising, head-trauma, and head-circumference maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_dka_hhs_hyperglycemia_v1"),
  "pediatric DKA/HHS should be a complete validated readiness row after adding child-specific hyperglycemic-crisis routing"
);
const pediatricDkaRow = iterationRun.results.find((result) => result.intent_id === "pediatric_dka_hhs_hyperglycemia_v1");
assert.ok(pediatricDkaRow, "pediatric DKA/HHS iteration row should exist");
assert.equal(pediatricDkaRow.complete_validated_workup, true, "pediatric DKA/HHS should be complete and not left as staged review text");
[
  "RCH_DKA_CHILD",
  "NICE_NG18_DKA_CHILD",
  "ISPAD_DKA_HHS_2022",
  "CHQ_DKA_HHS_CHILD_2024"
].forEach((sourceId) => {
  assert.ok(
    pediatricDkaRow.source_ids.includes(sourceId),
    `pediatric DKA/HHS should be traceable to ${sourceId}`
  );
});
assert.ok(
  !pediatricDkaRow.source_ids.includes("ADA_HYPERGLYCEMIC_CRISES_2024") && !pediatricDkaRow.source_ids.includes("ADA_STANDARDS_HOSPITAL_2026"),
  "pediatric DKA/HHS should not inherit adult hyperglycemic-crisis source rows"
);
const pediatricDkaSafetyText = (pediatricDkaRow.safety || []).map((entry) => [entry.label, entry.options, entry.management_change].join(" ")).join(" | ");
const pediatricDkaHistoryText = (pediatricDkaRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, entry.likelihood_ratio_note, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricDkaExamText = [...(pediatricDkaRow.core || []), ...(pediatricDkaRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricDkaTestsText = (pediatricDkaRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.reference_range_or_threshold, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricDkaRedFlagText = (pediatricDkaRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricDkaManagementText = (pediatricDkaRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.limitations].join(" "))
  .join(" | ");
assert.match(
  pediatricDkaSafetyText,
  /Measure temperature[\s\S]*Measure heart rate and blood pressure[\s\S]*Measure respiratory rate and oxygen saturation[\s\S]*Document mental status with AVPU or modified GCS[\s\S]*Measure current weight[\s\S]*Measure bedside glucose and point-of-care ketones[\s\S]*Document intake, urine output, and fluid balance/i,
  "pediatric DKA/HHS should keep vitals, neurologic status, weight, glucose/ketones, and fluid balance in baseline safety data"
);
assert.match(
  pediatricDkaHistoryText,
  /Ask age weight and diabetes context[\s\S]*Ask hyperglycemia ketone and acidosis symptoms[\s\S]*Ask insulin doses pump CGM and access barriers[\s\S]*Ask vomiting intake and dehydration trajectory[\s\S]*Ask source-localizing infection and precipitant symptoms[\s\S]*Ask cerebral edema and neurologic warning symptoms[\s\S]*Ask HHS dehydration and osmolality features[\s\S]*Ask recurrent DKA psychosocial and safety context/i,
  "pediatric DKA/HHS should ask age/diabetes, DKA symptoms, insulin/device/access, hydration, precipitant, cerebral edema, HHS, and recurrence history"
);
assert.match(
  pediatricDkaHistoryText,
  /Multi-select:[\s\S]*missed basal[\s\S]*pump failure[\s\S]*doses taken as prescribed[\s\S]*unable to obtain/i,
  "pediatric DKA/HHS should expose multi-select controls that allow endorsed, denied, and unable-to-obtain insulin/device documentation"
);
assert.match(
  pediatricDkaHistoryText,
  /Likelihood ratios are not available|Question-level LR\+\/LR- is not available|source-defined biochemical confirmation/i,
  "pediatric DKA/HHS should explain when LR data are unavailable and fall back to source thresholds"
);
assert.match(
  pediatricDkaExamText,
  /Test central capillary refill[\s\S]*Inspect mucous membranes[\s\S]*Test skin turgor[\s\S]*Observe work of breathing and Kussmaul pattern[\s\S]*Inspect pupils and eye movements[\s\S]*Palpate abdomen for focal tenderness/i,
  "pediatric DKA/HHS should render individual capillary refill, mucosa, turgor, Kussmaul, pupil/eye, and abdominal maneuvers"
);
assert.doesNotMatch(
  pediatricDkaExamText,
  /Measure temperature|Measure heart rate|Measure respiratory rate|Measure blood pressure|Measure current weight|Measure bedside glucose|Document neurologic status|fluid balance|generic focused exam|Adult DKA/i,
  "pediatric DKA/HHS should not leak vitals, weight, bedside labs, fluid balance, generic labels, or adult DKA language into physical exam maneuvers"
);
assert.match(
  pediatricDkaTestsText,
  /Venous blood gas and acid-base status[\s\S]*Glucose and blood ketone thresholds[\s\S]*Electrolytes, urea, creatinine, corrected sodium, and potassium[\s\S]*Effective osmolality for HHS or mixed DKA\/HHS[\s\S]*12-lead ECG when potassium risk or severe illness[\s\S]*New diabetes baseline labs and autoimmune\/celiac screen[\s\S]*Source-directed infection tests only when indicated/i,
  "pediatric DKA/HHS should include VBG, glucose/ketones, electrolytes/corrected sodium/potassium, osmolality, ECG, new-diabetes labs, and source-directed infection testing"
);
assert.match(
  pediatricDkaTestsText,
  /(?=[\s\S]*BGL >11 mmol\/L)(?=[\s\S]*pH <7\.3)(?=[\s\S]*bicarbonate <18)(?=[\s\S]*BGL >33\.3 mmol\/L)(?=[\s\S]*ketones <1\.1 mmol\/L)(?=[\s\S]*effective osmolality >320)(?=[\s\S]*plasma glucose <14 mmol\/L)/i,
  "pediatric DKA/HHS should show pediatric DKA, HHS, and dextrose-addition thresholds"
);
assert.match(
  pediatricDkaTestsText,
  /40 mmol\/L KCl[\s\S]*(?:anuria|potassium above normal)[\s\S]*hypokalemia|hypokalemia[\s\S]*40 mmol\/L KCl[\s\S]*(?:anuria|potassium above normal)/i,
  "pediatric DKA/HHS should show potassium concentration and exception thresholds"
);
assert.match(
  pediatricDkaRedFlagText,
  /Cerebral edema or oedema signs[\s\S]*Severe DKA or high-risk age[\s\S]*Shock, cardiovascular compromise, or repeated fluid bolus need[\s\S]*Potassium danger or anuria[\s\S]*Pediatric HHS or mixed DKA\/HHS concern/i,
  "pediatric DKA/HHS should include cerebral edema, severe/young-age, shock, potassium/anuria, and HHS red flags"
);
assert.match(
  pediatricDkaManagementText,
  /Emergency ABCD and senior escalation route[\s\S]*Pediatric fluid and dextrose route[\s\S]*Insulin after fluids with no bolus[\s\S]*Potassium-safe fluid route[\s\S]*Avoid bicarbonate except specialist emergency indication[\s\S]*Cerebral edema emergency treatment route[\s\S]*Pediatric HHS specialist route[\s\S]*Diabetes team, education, and recurrence prevention route/i,
  "pediatric DKA/HHS should show emergency route, fluid/dextrose, insulin no-bolus, potassium, bicarbonate limitation, cerebral edema treatment, HHS route, and diabetes-team recurrence consequences"
);
assert.match(
  pediatricDkaManagementText,
  /10 mL\/kg[\s\S]*0\.9% sodium chloride[\s\S]*1 hour[\s\S]*0\.05 to 0\.1 units\/kg\/hour[\s\S]*never give an IV or IM insulin bolus/i,
  "pediatric DKA/HHS should show pediatric bolus, fluid, delayed insulin, dose, and no-bolus rules"
);
const pediatricDkaTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_dka_hhs_hyperglycemia_v1"],
  allMatches: false,
  modifiers: "adolescent sglt2 euglycemic near normal glucose fasting pregnancy hypernatremia hyperosmolality osmolality anuria hyperkalemia recurrent dka insulin omission body image self harm pump infusion site fever cough cerebral oedema headache bradycardia hypertension cranial nerve falling gcs severe dehydration hhs shock",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 120,
  maxCoreItems: 30,
  maxConditionalItems: 60,
  limit: 0
});
const pediatricDkaTriggeredRow = pediatricDkaTriggeredRun.results.find((result) => result.intent_id === "pediatric_dka_hhs_hyperglycemia_v1");
assert.ok(pediatricDkaTriggeredRow, "triggered pediatric DKA/HHS audit row should exist");
const pediatricDkaTriggeredHistoryText = (pediatricDkaTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricDkaTriggeredExamText = [...(pediatricDkaTriggeredRow.core || []), ...(pediatricDkaTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricDkaTriggeredHistoryText,
  /Ask euglycemic DKA and adolescent context[\s\S]*Ask hypernatremia anuria and potassium safety context[\s\S]*Ask recurrent DKA insulin omission confidentially/i,
  "pediatric DKA/HHS conditional history should activate euglycemic/adolescent, sodium-potassium-renal, and recurrence/confidential rows"
);
assert.match(
  pediatricDkaTriggeredExamText,
  /Auscultate lungs for infection source[\s\S]*Inspect insulin pump infusion site[\s\S]*Palpate peripheral pulses[\s\S]*Inspect pupils for neurologic deterioration/i,
  "pediatric DKA/HHS conditional exam should activate source-localizing lung/site, pulse, and cerebral edema maneuvers"
);
assert.ok(
  readyRows.some((result) => result.intent_id === "pediatric_hematology_anemia_bleeding_v1"),
  "pediatric hematology should be a complete validated readiness row after adding child-specific anemia/bleeding routing"
);
const pediatricHemeRow = iterationRun.results.find((result) => result.intent_id === "pediatric_hematology_anemia_bleeding_v1");
assert.ok(pediatricHemeRow, "pediatric hematology iteration row should exist");
assert.equal(pediatricHemeRow.complete_validated_workup, true, "pediatric hematology should be complete and not left as staged review text");
[
  "RCH_ANAEMIA_CHILD",
  "RCH_IRON_DEFICIENCY_CHILD",
  "RCH_ITP_CHILD",
  "RCH_BLOOD_PRODUCT_CHILD",
  "RCH_PETECHIAE_PURPURA_CHILD",
  "NICE_NG12_SUSPECTED_CANCER_2026"
].forEach((sourceId) => {
  assert.ok(
    pediatricHemeRow.source_ids.includes(sourceId),
    `pediatric hematology should be traceable to ${sourceId}`
  );
});
const pediatricHemeSafetyText = (pediatricHemeRow.safety || [])
  .map((entry) => [entry.label, entry.options, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricHemeHistoryText = (pediatricHemeRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.full_question, entry.reason, entry.management_change, entry.options, entry.likelihood_ratio_note, ...(entry.detail_prompts || [])].join(" "))
  .join(" | ");
const pediatricHemeExamText = [...(pediatricHemeRow.core || []), ...(pediatricHemeRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricHemeTestsText = (pediatricHemeRow.tests || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.reference_range_or_threshold, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricHemeRedFlagText = (pediatricHemeRow.red_flags || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.likelihood_ratio_note].join(" "))
  .join(" | ");
const pediatricHemeManagementText = (pediatricHemeRow.management_changes || [])
  .map((entry) => [entry.label, entry.action, entry.reason, entry.management_change, entry.reference_range_or_threshold, entry.limitations].join(" "))
  .join(" | ");
assert.match(
  pediatricHemeSafetyText,
  /Measure temperature[\s\S]*Measure heart rate and blood pressure[\s\S]*Measure respiratory rate and oxygen saturation[\s\S]*Measure current weight[\s\S]*Document active bleeding burden and mental status/i,
  "pediatric hematology should keep temperature, cardiopulmonary vitals, weight, bleeding burden, and mental status in baseline safety data"
);
assert.match(
  pediatricHemeHistoryText,
  /Ask age growth and baseline hematology context[\s\S]*Ask anemia symptoms and instability history[\s\S]*Ask bleeding source and severity history[\s\S]*Ask bruising petechiae and trauma pattern[\s\S]*Ask iron nutrition and blood loss risk[\s\S]*Ask hemolysis jaundice and dark urine history[\s\S]*Ask leukemia lymphoma and marrow red flags[\s\S]*Ask medication anticoagulant and family bleeding history/i,
  "pediatric hematology should ask distinct age/baseline, anemia, bleeding, bruising, iron, hemolysis, malignancy, and medication/family history at baseline"
);
assert.match(
  pediatricHemeHistoryText,
  /Multi-select:[\s\S]*epistaxis[\s\S]*heavy menstrual bleeding[\s\S]*none endorsed[\s\S]*unable to assess/i,
  "pediatric hematology should expose multi-select controls that allow endorsed, denied, and unable-to-assess symptom documentation"
);
assert.doesNotMatch(
  pediatricHemeHistoryText,
  /adrenal insufficiency|PID and pelvic infection|urinary and flank infection-source|ectopic\/PID danger|bleeding medication, coagulopathy/i,
  "pediatric hematology history labels should not borrow unrelated endocrine, pelvic, urinary, or adult bleeding labels"
);
assert.match(
  pediatricHemeExamText,
  /Inspect conjunctival pallor[\s\S]*Inspect petechiae distribution[\s\S]*Inspect oral mucosal bleeding[\s\S]*Palpate cervical lymph nodes[\s\S]*Palpate liver edge[\s\S]*Palpate spleen tip/i,
  "pediatric hematology should render individual pallor, petechiae, mucosal bleeding, cervical node, liver, and spleen maneuvers"
);
assert.doesNotMatch(
  pediatricHemeExamText,
  /Measure temperature|Measure heart rate|Measure respiratory rate|Measure blood pressure|Measure current weight|mental status|generic focused exam|Adult/i,
  "pediatric hematology should not leak vitals, weight, mental status, generic focused exam, or adult language into physical exam maneuvers"
);
assert.match(
  pediatricHemeTestsText,
  /Full blood examination film and reticulocyte count[\s\S]*Ferritin and iron deficiency assessment[\s\S]*Coagulation and fibrinogen tests[\s\S]*Group screen and crossmatch when transfusion possible[\s\S]*Hemolysis bilirubin LDH haptoglobin DAT and urine tests[\s\S]*B12 folate renal liver and inflammatory tests when indicated[\s\S]*Pregnancy test when adolescent bleeding or anemia context applies/i,
  "pediatric hematology should include CBC/film/retic, ferritin, coagulation, crossmatch, hemolysis, targeted B12/renal/liver/inflammatory tests, and adolescent pregnancy testing"
);
assert.match(
  `${pediatricHemeTestsText} ${pediatricHemeManagementText}`,
  /platelet count <100 x 10\^9\/L[\s\S]*Hb <70 g\/L[\s\S]*Hb 70-90 g\/L[\s\S]*Ferritin <20 microgram\/L[\s\S]*Hb >90 g\/L/i,
  "pediatric hematology should show platelet, Hb transfusion, and ferritin thresholds in exported audit rows"
);
assert.match(
  pediatricHemeRedFlagText,
  /Active bleeding with shock or altered state[\s\S]*Petechiae or purpura with fever or unwell appearance[\s\S]*Unexplained petechiae bruising pallor fatigue fever infection or bone pain[\s\S]*Lymphadenopathy or splenomegaly with systemic features[\s\S]*ITP concern with abnormal film cytopenias systemic features or major bleeding[\s\S]*Severe anemia or symptomatic Hb below transfusion range/i,
  "pediatric hematology should include bleeding instability, febrile petechiae, leukemia, lymphoma, ITP exclusion, and severe anemia red flags"
);
assert.match(
  pediatricHemeManagementText,
  /Emergency stabilization route[\s\S]*RBC transfusion threshold route[\s\S]*Iron therapy and diet route[\s\S]*ITP observation treatment and precautions route[\s\S]*Leukemia lymphoma urgent referral route[\s\S]*Hematology handoff and review owner route/i,
  "pediatric hematology should show emergency, transfusion, iron, ITP, cancer-referral, and hematology-handoff management consequences"
);
assert.match(
  pediatricHemeManagementText,
  /Do not include patient identifiers|keep source IDs and clinical facts only/i,
  "pediatric hematology should keep copy/export handoff PHI-safe and auditable"
);
const pediatricHemeTriggeredRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
  diagnosis: "",
  intentIds: ["pediatric_hematology_anemia_bleeding_v1"],
  allMatches: false,
  modifiers: "adolescent heavy menstrual pregnancy postpartum self harm itp low platelets thrombocytopenia fever bone pain lymphadenopathy hepatosplenomegaly transfusion thalassemia sickle chemotherapy transplant epistaxis hemarthrosis joint swelling",
  setting: "General medicine",
  population: "Pediatric",
  maxCandidates: 120,
  maxCoreItems: 30,
  maxConditionalItems: 60,
  limit: 0
});
const pediatricHemeTriggeredRow = pediatricHemeTriggeredRun.results.find((result) => result.intent_id === "pediatric_hematology_anemia_bleeding_v1");
assert.ok(pediatricHemeTriggeredRow, "triggered pediatric hematology audit row should exist");
const pediatricHemeTriggeredHistoryText = (pediatricHemeTriggeredRow.history || [])
  .map((entry) => [entry.label, entry.text, entry.reason, entry.management_change, entry.options].join(" "))
  .join(" | ");
const pediatricHemeTriggeredExamText = [...(pediatricHemeTriggeredRow.core || []), ...(pediatricHemeTriggeredRow.conditional || [])]
  .map((entry) => [entry.label, entry.technique, entry.options, entry.management_change].join(" "))
  .join(" | ");
assert.match(
  pediatricHemeTriggeredHistoryText,
  /Ask adolescent confidential bleeding and pregnancy context[\s\S]*Ask ITP exclusion and low-risk context[\s\S]*Ask transfusion and specialty protocol context/i,
  "pediatric hematology conditional history should activate adolescent, ITP-exclusion, and transfusion/specialty rows"
);
assert.match(
  pediatricHemeTriggeredExamText,
  /Inspect anterior nares[\s\S]*Palpate axillary lymph nodes[\s\S]*Palpate inguinal lymph nodes[\s\S]*Inspect target joint swelling/i,
  "pediatric hematology conditional exam should activate epistaxis, lymphoma-node, and hemarthrosis/joint maneuvers"
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
const pregnancyDiabetesPrimaryOutputIntentIds = [
  "type_1_diabetes_mellitus_intent_v1",
  "type_2_diabetes_mellitus_intent_v1",
  "prediabetes_intent_v1"
];
pregnancyDiabetesPrimaryOutputIntentIds.forEach((intentId) => {
  const pregnancyRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
    diagnosis: "",
    intentIds: [intentId],
    allMatches: false,
    modifiers: "currently pregnant",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 80,
    maxCoreItems: 24,
    maxConditionalItems: 36,
    limit: 0
  });
  const pregnancyRow = pregnancyRun.results.find((result) => result.intent_id === intentId);
  assert.ok(pregnancyRow, `${intentId}: active pregnancy modifier audit row should exist`);
  assert.ok(
    (pregnancyRow.active_bundles || []).some((bundleId) => /pregnancy_diabetes_context/.test(bundleId)),
    `${intentId}: active pregnancy should activate the pregnancy-specific diabetes primary-output add-on`
  );
  const pregnancyHistoryText = (pregnancyRow.history || [])
    .map((entry) => [entry.label, entry.text, ...(entry.detail_prompts || [])].join(" "))
    .join(" | ");
  const pregnancyTestsText = (pregnancyRow.tests || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.management_implication].join(" "))
    .join(" | ");
  const pregnancyRedFlagText = (pregnancyRow.red_flags || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.management_implication].join(" "))
    .join(" | ");
  const pregnancyManagementText = (pregnancyRow.management_changes || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.management_implication].join(" "))
    .join(" | ");
  assert.match(
    pregnancyHistoryText,
    /gestational-age history|gestational age, dating, and obstetric context|pregnancy dating/i,
    `${intentId}: active pregnancy should add gestational-age and dating history to the primary diabetes workup`
  );
  assert.match(
    pregnancyHistoryText,
    /preexisting-risk history|prior gestational diabetes|prior gdm|macrosomia|pre-pregnancy diabetes/i,
    `${intentId}: active pregnancy should add prior GDM, macrosomia, and preexisting-risk history`
  );
  assert.match(
    pregnancyHistoryText,
    /fetal-obstetric plan history|fetal surveillance|delivery timing|maternal-fetal medicine|fetal growth/i,
    `${intentId}: active pregnancy should add fetal and obstetric-plan context`
  );
  assert.match(
    pregnancyTestsText,
    /OGTT threshold pathway|75-g OGTT|fasting\s*>?=?92|1-hour\s*>?=?180|2-hour\s*>?=?153|Carpenter-Coustan/i,
    `${intentId}: active pregnancy should add pregnancy-specific OGTT threshold interpretation`
  );
  assert.match(
    pregnancyTestsText,
    /safety-test pathway|ketones|anion gap|acid-base|preeclampsia/i,
    `${intentId}: active pregnancy should add pregnancy diabetes safety tests`
  );
  assert.match(
    pregnancyRedFlagText,
    /urgent cues|reduced fetal movement|preeclampsia|severe hyperglycemia|ketones/i,
    `${intentId}: active pregnancy should add pregnancy-specific urgent cues`
  );
  assert.match(
    pregnancyManagementText,
    /postpartum follow-up plan|postpartum 75-g OGTT|4-12 weeks|long-term prevention/i,
    `${intentId}: active pregnancy should add postpartum diabetes follow-up`
  );
  const baselineRow = iterationRun.results.find((result) => result.intent_id === intentId);
  if (baselineRow) {
    const baselineText = [
      ...(baselineRow.history || []),
      ...(baselineRow.tests || []),
      ...(baselineRow.red_flags || []),
      ...(baselineRow.management_changes || [])
    ].map((entry) => entry.label).join(" | ");
    assert.doesNotMatch(
      baselineText,
      /Pregnancy diabetes gestational-age history|Pregnancy diabetes OGTT threshold pathway|Pregnancy diabetes postpartum follow-up plan/i,
      `${intentId}: pregnancy-specific primary-output add-on should not leak into baseline output without the active pregnancy modifier`
    );
  }
});

const postpartumDiabetesFollowUpIntentIds = [
  "type_2_diabetes_mellitus_intent_v1",
  "prediabetes_intent_v1"
];
postpartumDiabetesFollowUpIntentIds.forEach((intentId) => {
  const postpartumRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
    diagnosis: "",
    intentIds: [intentId],
    allMatches: false,
    modifiers: "postpartum after gestational diabetes",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 80,
    maxCoreItems: 24,
    maxConditionalItems: 36,
    limit: 0
  });
  const postpartumRow = postpartumRun.results.find((result) => result.intent_id === intentId);
  assert.ok(postpartumRow, `${intentId}: postpartum modifier audit row should exist`);
  assert.ok(
    (postpartumRow.active_bundles || []).some((bundleId) => /postpartum_gdm_follow_up_primary_output/.test(bundleId)),
    `${intentId}: postpartum modifier should activate the postpartum GDM follow-up primary-output add-on`
  );
  const postpartumHistoryText = (postpartumRow.history || [])
    .map((entry) => [entry.label, entry.text, ...(entry.detail_prompts || [])].join(" "))
    .join(" | ");
  const postpartumTestsText = (postpartumRow.tests || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.management_implication, entry.action].join(" "))
    .join(" | ");
  const postpartumManagementText = (postpartumRow.management_changes || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.management_implication, entry.action].join(" "))
    .join(" | ");
  assert.match(
    postpartumHistoryText,
    /Postpartum GDM follow-up timing|weeks postpartum|75-g OGTT already been completed|pregnancy-associated dysglycemia/i,
    `${intentId}: postpartum modifier should add postpartum GDM follow-up timing history`
  );
  assert.match(
    postpartumTestsText,
    /Postpartum GDM 75-g OGTT pathway|4-12 weeks postpartum|nonpregnancy diagnostic criteria|OGTT preferred over A1c/i,
    `${intentId}: postpartum modifier should add postpartum 75-g OGTT testing with nonpregnancy criteria`
  );
  assert.match(
    postpartumManagementText,
    /long-term diabetes screening handoff|every 1-3 years|primary-care or endocrine follow-up|future pregnancy planning/i,
    `${intentId}: postpartum modifier should add long-term diabetes screening and handoff`
  );
  const activePregnancyLeakText = [
    ...(postpartumRow.history || []),
    ...(postpartumRow.tests || []),
    ...(postpartumRow.red_flags || []),
    ...(postpartumRow.management_changes || [])
  ].map((entry) => [entry.label, entry.text, entry.action].join(" ")).join(" | ");
  assert.doesNotMatch(
    activePregnancyLeakText,
    /Pregnancy diabetes gestational-age history|Pregnancy diabetes urgent cues|reduced fetal movement/i,
    `${intentId}: postpartum modifier should not activate active-pregnancy GDM urgent-cue output`
  );
});

const postpartumMaternalSafetyIntentIds = [
  "fever_sepsis_v1",
  "suspected_pe_v1"
];
postpartumMaternalSafetyIntentIds.forEach((intentId) => {
  const postpartumRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
    diagnosis: "",
    intentIds: [intentId],
    allMatches: false,
    modifiers: "postpartum recent delivery",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 90,
    maxCoreItems: 28,
    maxConditionalItems: 44,
    limit: 0
  });
  const postpartumRow = postpartumRun.results.find((result) => result.intent_id === intentId);
  assert.ok(postpartumRow, `${intentId}: postpartum maternal-safety modifier audit row should exist`);
  assert.ok(
    (postpartumRow.active_bundles || []).some((bundleId) => /postpartum_maternal_safety_primary_output/.test(bundleId)),
    `${intentId}: postpartum modifier should activate the maternal safety primary-output add-on`
  );
  const postpartumHistoryText = (postpartumRow.history || [])
    .map((entry) => [entry.label, entry.text, entry.reason, ...(entry.detail_prompts || [])].join(" "))
    .join(" | ");
  const postpartumTestsText = (postpartumRow.tests || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action, entry.options].join(" "))
    .join(" | ");
  const postpartumRedFlagText = (postpartumRow.red_flags || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action, entry.options].join(" "))
    .join(" | ");
  const postpartumManagementText = (postpartumRow.management_changes || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action, entry.options].join(" "))
    .join(" | ");
  if (intentId === "fever_sepsis_v1") {
    assert.match(
      postpartumHistoryText,
      /Postpartum infection source and warning-sign screen|fever >=100\.4|uterine|lochia|wound|breast|urinary/i,
      `${intentId}: postpartum fever/sepsis should add postpartum infection-source and warning-sign history`
    );
    assert.match(
      postpartumTestsText,
      /Postpartum sepsis lactate, cultures, and source-control pathway|lactate|blood cultures|antibiotics|source-control/i,
      `${intentId}: postpartum fever/sepsis should add maternal sepsis lactate/culture/source-control pathway`
    );
  } else {
    assert.match(
      postpartumHistoryText,
      /Postpartum VTE symptoms and risk history|dyspnea|pleuritic|unilateral leg|cesarean|anticoagulation|breastfeeding/i,
      `${intentId}: postpartum PE should add postpartum VTE symptom/risk and anticoagulation-safety history`
    );
    assert.match(
      postpartumTestsText,
      /Postpartum PE\/DVT diagnostic and anticoagulation-safety pathway|compression ultrasound|chest imaging|anticoagulation|breastfeeding/i,
      `${intentId}: postpartum PE should add postpartum VTE diagnostic and anticoagulation-safety pathway`
    );
  }
  assert.match(
    postpartumRedFlagText,
    /Postpartum urgent maternal warning cues|fever >=100\.4|dyspnea|chest pain|syncope|severe headache|vision/i,
    `${intentId}: postpartum modifier should add urgent maternal warning cues`
  );
  assert.match(
    postpartumManagementText,
    /Postpartum OB\/MFM safety handoff|postpartum timing|delivery type|lactation|OB or MFM|return precautions/i,
    `${intentId}: postpartum modifier should add OB/MFM safety handoff consequences`
  );
  assert.doesNotMatch(
    [...(postpartumRow.core || []), ...(postpartumRow.conditional || [])].map((entry) => entry.label).join(" | "),
    /Postpartum urgent maternal warning cues|Postpartum infection source|Postpartum VTE symptoms/i,
    `${intentId}: postpartum maternal-safety add-on should not appear as physical exam maneuvers`
  );
  const baselineRow = iterationRun.results.find((result) => result.intent_id === intentId);
  const baselineText = [
    ...(baselineRow?.history || []),
    ...(baselineRow?.tests || []),
    ...(baselineRow?.red_flags || []),
    ...(baselineRow?.management_changes || [])
  ].map((entry) => entry.label).join(" | ");
  assert.doesNotMatch(
    baselineText,
    /Postpartum infection source|Postpartum VTE symptoms|Postpartum urgent maternal warning cues|Postpartum OB\/MFM safety handoff/i,
    `${intentId}: postpartum maternal-safety add-on should not leak into baseline output without postpartum context`
  );
});

const olderAdultSafetyIntentIds = [
  "fever_sepsis_v1",
  "suspected_pe_v1",
  "dka_hhs_v1"
];
olderAdultSafetyIntentIds.forEach((intentId) => {
  const olderAdultRun = buildClinicalWorkupIterationRun(loadClinicalWorkupIterationCatalog(), {
    diagnosis: "",
    intentIds: [intentId],
    allMatches: false,
    modifiers: "older adult frailty age 75 recent fall polypharmacy",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 90,
    maxCoreItems: 28,
    maxConditionalItems: 44,
    limit: 0
  });
  const olderAdultRow = olderAdultRun.results.find((result) => result.intent_id === intentId);
  assert.ok(olderAdultRow, `${intentId}: older-adult modifier audit row should exist`);
  assert.ok(
    (olderAdultRow.active_bundles || []).some((bundleId) => /older_adult_safety_primary_output/.test(bundleId)),
    `${intentId}: older-adult modifier should activate the geriatric safety primary-output add-on`
  );
  const olderAdultSafetyText = (olderAdultRow.safety || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action, entry.options].join(" "))
    .join(" | ");
  const olderAdultHistoryText = (olderAdultRow.history || [])
    .map((entry) => [entry.label, entry.text, entry.reason, ...(entry.detail_prompts || [])].join(" "))
    .join(" | ");
  const olderAdultTestsText = (olderAdultRow.tests || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action].join(" "))
    .join(" | ");
  const olderAdultRedFlagText = (olderAdultRow.red_flags || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action].join(" "))
    .join(" | ");
  const olderAdultManagementText = (olderAdultRow.management_changes || [])
    .map((entry) => [entry.label, entry.reason, entry.management_change, entry.action].join(" "))
    .join(" | ");
  assert.match(
    olderAdultSafetyText,
    /Measure orthostatic blood pressure|Systolic drop >=20|fall|syncope|medication/i,
    `${intentId}: older-adult modifier should add orthostatic BP as baseline safety data`
  );
  assert.match(
    olderAdultHistoryText,
    /Older-adult baseline function, cognition, and falls|baseline cognition|recent falls|caregiver|delirium/i,
    `${intentId}: older-adult modifier should add baseline function/cognition/fall history`
  );
  assert.match(
    olderAdultHistoryText,
    /Older-adult medication fall and delirium risk|polypharmacy|renal-dose|sedatives|anticholinergics|anticoagulants/i,
    `${intentId}: older-adult modifier should add medication/fall/delirium risk history`
  );
  assert.match(
    olderAdultTestsText,
    /Older-adult medication and renal-dose safety review|anticholinergic|sedative|opioid|renal function|pharmacy/i,
    `${intentId}: older-adult modifier should add medication and renal-dose review`
  );
  assert.match(
    olderAdultRedFlagText,
    /Older-adult delirium, fall, and unsafe-disposition cues|acute confusion|Cannot ambulate safely|Anticoagulated fall|Unsafe home/i,
    `${intentId}: older-adult modifier should add delirium/fall/unsafe-disposition escalation cues`
  );
  assert.match(
    olderAdultManagementText,
    /function, falls, and medication-safety handoff|PT\/OT|Medication changes reviewed|Caregiver\/home support/i,
    `${intentId}: older-adult modifier should add disposition and handoff consequences`
  );
  assert.doesNotMatch(
    [...(olderAdultRow.core || []), ...(olderAdultRow.conditional || [])].map((entry) => entry.label).join(" | "),
    /orthostatic blood pressure/i,
    `${intentId}: older-adult orthostatic data should stay out of physical exam maneuvers`
  );
});

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
assert.match(genitalHistoryLabels, /GU\/STI discharge\/dysuria, lesions, and exposure/i, "genital discharge should label discharge/dysuria/exposure history as local GU/STI context");
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
const gestationalDiabetesLimitations = (iterationRun.results.find((result) => result.intent_id === "gestational_diabetes_intent_v1")?.limitations || [])
  .map((entry) => `${entry.label} ${entry.limitations || ""}`)
  .join("; ");
assert.match(
  gestationalDiabetesLimitations,
  /applicability limits/i,
  "gestational diabetes should surface module applicability as a limitation/caution"
);
assert.match(
  gestationalDiabetesLimitations,
  /pregnancy/i,
  "gestational diabetes applicability caution should name active pregnancy context"
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
