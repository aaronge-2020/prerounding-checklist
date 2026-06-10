import { complaintModules, complaintSourceRegistry } from "./medical-knowledge-db.js";
import {
  buildUnsupportedClinicalIntentGap,
  resolveClinicalIntents,
  sanitizeUnsupportedClinicalIntentGapText
} from "./clinical-intents.js";

export const complaintCdsSchemaVersion = "complaint-cds-artifact-v1";
export { complaintModules, complaintSourceRegistry };

const plannedComplaintModules = [
  { id: "shortness_of_breath_v1", label: "Shortness of breath", status: "planned" },
  { id: "abdominal_pain_v1", label: "Abdominal pain", status: "planned" },
  { id: "headache_neuro_v1", label: "Headache / acute neurologic complaint", status: "planned" }
];

export function normalizeComplaintText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+%/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contextContainsTerm(context, term) {
  const normalized = normalizeComplaintText(term);
  if (!normalized) {
    return false;
  }
  if (!/\s/.test(normalized)) {
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(context);
  }
  return context.includes(normalized);
}

const complaintMatchStopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "men",
  "of",
  "or",
  "patient",
  "patients",
  "possible",
  "related",
  "the",
  "to",
  "with",
  "women"
]);

function complaintSearchTokens(value = "") {
  return normalizeComplaintText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !complaintMatchStopWords.has(token));
}

function distinctiveComplaintToken(token = "") {
  return token.length >= 6 || /^(?:aki|acs|dka|ed|hhs|sti|uti)$/.test(token);
}

const pediatricComplaintTokens = new Set([
  "adolescent",
  "baby",
  "child",
  "children",
  "infant",
  "paediatric",
  "pediatric",
  "teen",
  "toddler"
]);

function termRequiresPediatricContext(termTokens = []) {
  return termTokens.some((token) => pediatricComplaintTokens.has(token));
}

function contextHasPediatricToken(contextTokens = new Set()) {
  return Array.from(pediatricComplaintTokens).some((token) => contextTokens.has(token));
}

function tokenSubsetScore(context, term = "") {
  const termTokens = complaintSearchTokens(term);
  if (termTokens.length < 2) return 0;
  const contextTokens = new Set(complaintSearchTokens(context));
  if (termRequiresPediatricContext(termTokens) && !contextHasPediatricToken(contextTokens)) return 0;
  const matched = termTokens.filter((token) => contextTokens.has(token));
  if (matched.length < 2 || !matched.some(distinctiveComplaintToken)) return 0;
  const coverage = matched.length / termTokens.length;
  const coverageBonus = coverage >= 0.6 ? 8 : 0;
  return 8 + matched.length * 5 + coverageBonus;
}

function clinicalSynonymModuleScore(module, context) {
  if (
    module.id === "hypogonadism_v1"
    && /\b(?:androgen deficiency|low t|low testosterone|testosterone deficiency)\b/i.test(context)
  ) {
    return 60;
  }
  return 0;
}

function answerMatches(answerValue, expected = "yes") {
  const answer = String(answerValue || "unknown").toLowerCase();
  if (Array.isArray(expected)) {
    return expected.map((item) => String(item).toLowerCase()).includes(answer);
  }
  return answer === String(expected || "yes").toLowerCase();
}

function answerConditionMatches(answers, condition) {
  if (typeof condition === "string") {
    return answerMatches(answers[condition], "yes");
  }
  return answerMatches(answers[condition.id], condition.value || "yes");
}

export function evaluateComplaintCondition(when, contextText = "", answers = {}, extra = {}) {
  if (!when) {
    return true;
  }
  const context = normalizeComplaintText(contextText);
  const selectedIntentIds = new Set((extra.intentIds || []).map((value) => String(value || "").trim()).filter(Boolean));
  let matched = false;

  if (when.intentIdsAny?.length) {
    const ok = when.intentIdsAny.some((intentId) => selectedIntentIds.has(String(intentId || "").trim()));
    if (ok) {
      matched = true;
    }
  }
  if (when.termsAny?.length) {
    const ok = when.termsAny.some((term) => contextContainsTerm(context, term));
    if (!ok && !matched) {
      return false;
    }
    matched = matched || ok;
  }
  if (when.termsAll?.length) {
    const ok = when.termsAll.every((term) => contextContainsTerm(context, term));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.answersAny?.length) {
    const ok = when.answersAny.some((condition) => answerConditionMatches(answers, condition));
    if (!ok && !matched) {
      return false;
    }
    matched = matched || ok;
  }
  if (when.answersAll?.length) {
    const ok = when.answersAll.every((condition) => answerConditionMatches(answers, condition));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.intentIdsAll?.length) {
    const ok = when.intentIdsAll.every((intentId) => selectedIntentIds.has(String(intentId || "").trim()));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.not && evaluateComplaintCondition(when.not, context, answers, extra)) {
    return false;
  }
  return matched || Boolean(when.not);
}

function moduleScore(module, context) {
  const triggerScore = module.triggers.reduce((score, trigger) => {
    if (!contextContainsTerm(context, trigger)) {
      return score;
    }
    const normalizedTrigger = normalizeComplaintText(trigger);
    const baseScore = trigger.includes(" ") ? 18 : (String(trigger).trim().length <= 5 ? 40 : 24);
    const leadingDiagnosisBonus = context.startsWith(normalizedTrigger) ? 20 : 0;
    return score + baseScore + leadingDiagnosisBonus;
  }, 0);
  const labelScore = contextContainsTerm(context, module.label) ? 12 : 0;
  const tokenScore = [
    module.label,
    ...(module.triggers || [])
  ].reduce((score, term) => score + tokenSubsetScore(context, term), 0);
  return triggerScore + labelScore + tokenScore + clinicalSynonymModuleScore(module, context);
}

export function selectComplaintModule(inputText, modules = complaintModules) {
  const context = normalizeComplaintText(inputText);
  if (!context) {
    return null;
  }
  const scored = modules
    .map((module) => ({ module, score: moduleScore(module, context) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.module.label.localeCompare(b.module.label));
  return scored[0]?.module || null;
}

function withEvaluation(item, contextText, answers, extra = {}) {
  return {
    ...item,
    triggered: item.when ? evaluateComplaintCondition(item.when, contextText, answers, extra) : Boolean(extra.defaultTriggered),
    included: item.when ? evaluateComplaintCondition(item.when, contextText, answers, extra) : true
  };
}

function patientFactContextForConditionalItems(contextText = "", options = {}) {
  const raw = String(contextText || "");
  const explicitModifiers = [
    options.patientModifiers,
    options.modifiers,
    options.modifierText
  ].filter(Boolean);
  const patientModifierLines = Array.from(raw.matchAll(/^patient modifiers:\s*(.+)$/gim))
    .map((match) => match[1])
    .filter(Boolean);

  if (!/validated clinical intent workup/i.test(raw) && !patientModifierLines.length && !explicitModifiers.length) {
    return raw;
  }

  const nonMetadataLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^(?:intent|intent_id|intent tags|clinical bundles|required domains|avoid labels)\s*:/i.test(line)) {
        return false;
      }
      if (/^validated clinical intent workup$/i.test(line)) {
        return false;
      }
      return /^patient modifiers:/i.test(line);
    })
    .map((line) => line.replace(/^patient modifiers:\s*/i, ""));

  return [
    ...explicitModifiers,
    ...patientModifierLines,
    ...nonMetadataLines
  ].join(" ").trim();
}

function expectedItemTypeForGroup(group = "") {
  if (group === "safetyChecks") return "safety_check";
  if (group === "requiredQuestions" || group === "conditionalQuestions") return "history_question";
  if (group === "requiredExam" || group === "conditionalExam") return "physical_exam_maneuver";
  if (group === "redFlags") return "red_flag";
  if (group === "initialTests") return "diagnostic_test";
  if (group === "dispositionRules") return "management_change";
  if (group === "decisionTrees" || group === "treatmentOptions") return "management_change";
  if (group === "differentialBuckets") return "diagnostic_frame";
  return "";
}

function traceArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIntentTrace(intentRow = {}) {
  const intentId = String(intentRow.intent_id || intentRow.id || "").trim();
  if (!intentId) {
    return null;
  }
  return {
    intent_id: intentId,
    label: String(intentRow.label || intentId).trim(),
    source_ids: traceArray(intentRow.source_ids),
    clinical_bundle_ids: traceArray(intentRow.clinical_bundle_ids)
  };
}

function traceComplaintCdsItem(item = {}, module = {}, group = "", intentTrace = [], authorizedBy = "") {
  const sourceId = item.source?.source_id || "";
  const traces = intentTrace.map(normalizeIntentTrace).filter(Boolean);
  const intentIds = traces.map((trace) => trace.intent_id);
  const intentLabels = traces.map((trace) => trace.label);
  const clinicalBundleIds = Array.from(new Set(traces.flatMap((trace) => trace.clinical_bundle_ids || [])));
  const sourceIds = Array.from(new Set([
    sourceId,
    ...(module.endocrine_metadata?.source_ids || []),
    ...traces.flatMap((trace) => trace.source_ids || [])
  ].filter(Boolean)));
  const traceability = {
    intent_ids: intentIds,
    intent_labels: intentLabels,
    clinical_bundle_ids: clinicalBundleIds,
    module_id: module.id || "",
    module_label: module.label || "",
    item_id: item.id || "",
    item_group: group,
    source_ids: sourceIds,
    evidence_row_id: item.id || "",
    authorized_by: authorizedBy || (intentIds.length ? "validated_clinical_intent" : "validated_complaint_module")
  };
  return {
    ...item,
    item_type: item.item_type || expectedItemTypeForGroup(group),
    validatedIntentIds: intentIds,
    traceability
  };
}

function complaintTraceContext(inputText = "", module = {}, options = {}) {
  const selectedIntentTrace = options.validatedIntents || options.selectedIntents || [];
  if (selectedIntentTrace.length) {
    return {
      module,
      intentTrace: selectedIntentTrace,
      authorizedBy: "validated_clinical_intent"
    };
  }
  const resolved = resolveClinicalIntents(`${inputText || ""} ${module.label || ""}`, undefined, { limit: 6 });
  const moduleMatches = (resolved.validatedMatches || []).filter((intentRow) => intentRow.complaint_module_id === module.id);
  return {
    module,
    intentTrace: moduleMatches.length === 1 ? moduleMatches : [],
    authorizedBy: "validated_complaint_module"
  };
}

const basicBedsideDataPattern = /\b(?:measure|check|document|calculate|obtain|record)\s+(?:blood pressure|bp|heart rate|hr|respiratory rate|rr|oxygen saturation|spo2|pulse oximetry|temperature|temp|current weight|weight|body mass index|bmi|waist circumference|orthostatic|bedside glucose|point-of-care glucose|fingerstick glucose|pain score|mental status|intake|oral intake|fluid intake|urine output|wet napp(?:y|ies))\b|\b(?:assess|document|observe)\s+(?:general appearance|mental status|ability to protect airway|airway protection|intake and urine output|intake\/output)\b|\b(?:check|document|verify)\s+(?:ability to protect airway|airway protection)\b|^\s*mental status\s*$/i;

export function isBasicBedsideDataItem(item = {}) {
  const text = `${item.id || ""} ${item.label || ""} ${item.action || ""}`;
  return basicBedsideDataPattern.test(text)
    || /(?:_measure_bp|_measure_hr|_measure_rr|_measure_spo2|_measure_temperature|_measure_weight|orthostatic|bedside_glucose|fingerstick|pain_score|mental_status|assess_mental_status|airway_protection)/i.test(text);
}

function expectedBasicBedsideEquipment(item = {}) {
  const text = `${item.id || ""} ${item.label || ""}`.toLowerCase();
  if (/\bblood pressure|\bbp\b|orthostatic|standing blood pressure/.test(text)) return "blood pressure cuff";
  if (/\bheart rate\b|\bhr\b|pulse rate/.test(text)) return "watch/timer or bedside monitor";
  if (/\brespiratory rate\b|\brr\b/.test(text)) return "watch/timer or bedside monitor";
  if (/oxygen saturation|spo2|pulse oximetry/.test(text)) return "pulse oximeter";
  if (/temperature|temp/.test(text)) return "thermometer";
  if (/waist circumference/.test(text)) return "tape measure";
  if (/body mass index|bmi/.test(text)) return "scale and height measurement";
  if (/current weight|\bweight\b/.test(text)) return "scale";
  if (/glucose|fingerstick/.test(text)) return "glucometer";
  if (/general appearance|mental status|pain score/.test(text)) return "none";
  return "";
}

function equipmentForBedsideItem(item = {}) {
  const expected = expectedBasicBedsideEquipment(item);
  if (expected) return expected;
  const text = `${item.id || ""} ${item.label || ""}`.toLowerCase();
  if (/auscultate|heart sounds|lung sounds|wheeze|crackle|murmur|gallop/.test(text)) return "stethoscope";
  if (/visual acuity/.test(text)) return "visual acuity card";
  if (/ophthalmoscopic|fundoscopic/.test(text)) return "ophthalmoscope";
  return item.equipment_needed || "none";
}

function safetyEquipmentIssue(item = {}) {
  const expected = expectedBasicBedsideEquipment(item);
  if (!expected) return "";
  const actual = String(item.equipment_needed || "").trim().toLowerCase();
  const normalizedExpected = expected.toLowerCase();
  if (!actual) return `expected ${expected}`;
  if (normalizedExpected === "none") {
    return actual === "none" ? "" : `expected ${expected}, got ${item.equipment_needed}`;
  }
  const expectedAny = normalizedExpected.split(/\s+or\s+|,\s*/).map((value) => value.trim()).filter(Boolean);
  const matches = expectedAny.some((option) => actual.includes(option)) || actual.includes(normalizedExpected);
  return matches ? "" : `expected ${expected}, got ${item.equipment_needed}`;
}

function likelihoodRatioUnavailable(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || text === "n/a" || text === "na" || text === "not available" || text === "unavailable";
}

function likelihoodRatioNoteForItem(item = {}, group = "", lrPlus = "", lrMinus = "") {
  const existing = item.likelihood_ratio_note || item.LR_note || item.lr_note || item.likelihoodRatioNote;
  if (String(existing || "").trim()) {
    return existing;
  }
  if (!likelihoodRatioUnavailable(lrPlus) || !likelihoodRatioUnavailable(lrMinus)) {
    return "Quantitative likelihood-ratio values are available in the curated metadata; interpret with the cited source, pretest probability, and patient context.";
  }
  if (group === "safetyChecks") {
    return "Likelihood ratios are not applicable to routine bedside safety data; use this item to assess acuity, monitoring needs, and management safety rather than diagnostic probability.";
  }
  return "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat this bedside finding as supportive and interpret it with the cited guideline, diagnostic tests, and patient context.";
}

function likelihoodRatioNoteForQuestionItem(item = {}) {
  const existing = item.likelihood_ratio_note || item.LR_note || item.lr_note || item.likelihoodRatioNote;
  if (String(existing || "").trim()) {
    return existing;
  }
  return "Question-level LR+/LR- is not available unless the cited evidence validates the exact response; use this answer to localize the source, assess severity, and guide management.";
}

function cleanHistoryPromptFragment(value = "") {
  return String(value || "")
    .replace(/\b(?:and|or)\s*$/i, "")
    .replace(/^\b(?:and|or)\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:]+$/g, "");
}

function splitHistoryPromptList(value = "") {
  return String(value || "")
    .replace(/\band\/or\b/gi, ", ")
    .replace(/\s+(?:or|and)\s+/gi, ", ")
    .split(/[,;]/)
    .map(cleanHistoryPromptFragment)
    .filter((fragment) => fragment.length >= 4)
    .filter((fragment) => !/^(?:any|new|current|recent|history of|symptoms?|medications?|supplements?)$/i.test(fragment))
    .slice(0, 8);
}

function medicationHistoryPromptFragment(fragment = "") {
  const normalized = normalizeComplaintText(fragment);
  if (normalized === "biotin") return "high-dose biotin or supplement use";
  if (normalized === "missed doses") return "missed or delayed doses";
  if (normalized === "supplements") return "over-the-counter supplements";
  if (normalized === "hormone therapy") return "hormone therapy or androgen/estrogen exposure";
  if (normalized === "recent treatment changes") return "recent dose or treatment changes";
  return fragment;
}

function uniqueHistoryPromptDetails(prompts = []) {
  const seen = new Set();
  return prompts
    .map((prompt) => String(prompt || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((prompt) => {
      const key = normalizeComplaintText(prompt);
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
      "Ask about neurologic danger symptoms: severe headache, neck stiffness, photophobia, confusion, seizure, petechiae, or purpura.",
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
    || (/^Any\b/i.test(value.trim()) && commaCount >= 3);
}

function historyQuestionDetailPrompts(item = {}) {
  if (Array.isArray(item.detail_prompts) && item.detail_prompts.some(Boolean)) {
    return item.detail_prompts.map(String).map(cleanHistoryPromptFragment).filter(Boolean);
  }
  const text = String(item.text || item.label || "").trim();
  if (!historyQuestionNeedsDetailPrompts(text)) {
    return [];
  }
  const withoutQuestionMark = text.replace(/\?+\s*$/g, "");
  const normalized = normalizeComplaintText(withoutQuestionMark);
  if (/^how high was the fever/.test(normalized)) {
    return [
      "Document maximum temperature and how it was measured.",
      "Clarify fever onset and trajectory.",
      "Ask what antipyretics, antibiotics, steroids, or immunosuppressants were already taken."
    ];
  }
  const infectionSourcePrompts = infectionSourceDetailPrompts(normalized);
  if (infectionSourcePrompts) {
    return uniqueHistoryPromptDetails(infectionSourcePrompts);
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
  if (/^which medications/.test(normalized) || /\bmedications?, supplements?/.test(normalized)) {
    const list = splitHistoryPromptList(
      withoutQuestionMark
        .replace(/^Which\s+/i, "")
        .replace(/\s+could\s+alter[\s\S]*$/i, "")
        .replace(/\s+affecting[\s\S]*$/i, "")
    );
    return uniqueHistoryPromptDetails(list.map((fragment) => `Review ${medicationHistoryPromptFragment(fragment)}.`));
  }
  if (/pregnancy|fertility/.test(normalized) && /partner|planned|postpartum|treatment|imaging|safety/.test(normalized)) {
    return uniqueHistoryPromptDetails([
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
  const list = splitHistoryPromptList(listSource);
  return uniqueHistoryPromptDetails(list.map((fragment) => `Ask specifically about ${fragment}.`));
}

function titleCaseFirst(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOriginalLabelReferences(value = "", originalLabel = "", displayLabel = "") {
  const text = String(value || "");
  if (!text || !originalLabel || !displayLabel || originalLabel === displayLabel) {
    return text;
  }
  return text.replace(new RegExp(escapeRegExp(originalLabel), "gi"), displayLabel);
}

function normalizedBedsideTags(item = {}, fallbackTags = []) {
  const rawTags = item.tags?.length ? item.tags : fallbackTags;
  return rawTags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag) => !/^(?:check|assess|evaluate|screen|review|document|perform)$/i.test(tag));
}

function clinicalExamActionLabel(item = {}, group = "") {
  const label = String(item.label || "").trim();
  if (group !== "requiredExam" && group !== "conditionalExam") {
    return label;
  }
  const actionLabelPattern = /^(?:inspect|palpate|auscultate|percuss|observe|test|compare|measure|listen|use|press|stage|estimate|elicit)\b/i;
  const match = label.match(/^(?:assess|evaluate|screen for|check)\s+(.+)$/i);
  if (!match && actionLabelPattern.test(label)) {
    return label;
  }
  const subject = (match ? match[1] : label).trim();
  const normalizedSubject = normalizeComplaintText(subject);
  const technique = normalizeComplaintText(item.technique || "");
  const sourceText = normalizeComplaintText(`${item.id || ""} ${label} ${item.diagnostic_target || ""} ${item.tags?.join?.(" ") || ""}`);

  if (/\bmental status\b/.test(normalizedSubject)) {
    return "Check mental status";
  }
  if (/\bextraocular movements?\b/.test(normalizedSubject)) {
    return "Test extraocular movements";
  }
  if (/\btremor\b/.test(normalizedSubject)) {
    return "Observe outstretched-hands tremor";
  }
  if (/\bkussmaul\b/.test(normalizedSubject) || /\bwork of breathing\b/.test(normalizedSubject)) {
    return /kussmaul/.test(normalizedSubject) ? "Observe Kussmaul breathing" : "Observe work of breathing";
  }
  if (/\bjvp|jugular venous pressure\b/.test(normalizedSubject)) {
    return "Inspect jugular venous pressure";
  }
  if (/\bedema\b/.test(normalizedSubject)) {
    return /lower leg|lower extremity/.test(normalizedSubject)
      ? "Inspect and press lower extremity edema"
      : "Inspect and press peripheral edema";
  }
  if (/\bextremity perfusion\b/.test(normalizedSubject)) {
    return "Inspect and palpate extremity perfusion";
  }
  if (/\bextremity temperature\b/.test(normalizedSubject)) {
    return "Palpate distal extremity warmth";
  }
  if (/\bskin turgor\b/.test(normalizedSubject)) {
    return "Test skin turgor";
  }
  if (/\bcapillary refill\b/.test(normalizedSubject)) {
    return "Test capillary refill";
  }
  if (/\babdominal guarding\b/.test(normalizedSubject)) {
    return "Palpate for abdominal guarding";
  }
  if (/\bcostovertebral angle tenderness\b|\bcva tenderness\b/.test(normalizedSubject)) {
    return "Percuss costovertebral angle tenderness";
  }
  if (/\bfocal neurologic deficits?\b/.test(normalizedSubject)) {
    return "Test focal neurologic deficits";
  }
  if (/\bpubertal stage\b/.test(normalizedSubject)) {
    return "Stage pubertal development";
  }
  if (/\bsecondary sex characteristics\b/.test(normalizedSubject)) {
    return "Inspect secondary sex characteristics";
  }
  if (/\bbody hair distribution\b/.test(normalizedSubject)) {
    return "Inspect body hair distribution";
  }
  if (/\bvoice quality\b/.test(normalizedSubject)) {
    return "Listen to voice quality";
  }
  if (/\bgait stability\b/.test(normalizedSubject)) {
    return "Observe gait stability if safe";
  }
  if (/\bproximal .*strength\b|\bhip flexor strength\b/.test(normalizedSubject)) {
    return "Test proximal hip flexor strength";
  }
  if (/\bneck stiffness\b/.test(normalizedSubject)) {
    return "Test neck stiffness";
  }
  if (/\bmouth exam\b|\boral mucosa\b/.test(normalizedSubject)) {
    return "Inspect oral mucosa";
  }
  if (/\bgenital exam\b/.test(normalizedSubject)) {
    return "Inspect genital area";
  }
  if (/\bscrotal exam\b/.test(normalizedSubject)) {
    return "Inspect and palpate scrotum";
  }
  if (/\bfocused painful site inspection\b/.test(normalizedSubject)) {
    return "Inspect painful site";
  }
  if (/\bfocused painful site palpation\b|\bfocused muscle tenderness\b/.test(normalizedSubject)) {
    return "Palpate painful site";
  }
  if (/\bfocused painful site range of motion\b|\brange of motion\b/.test(normalizedSubject)) {
    return "Test painful-site range of motion";
  }

  const verbRules = [
    { pattern: /^(?:inspect and palpate|look and feel)\b/, verb: "Inspect and palpate" },
    { pattern: /^(?:inspect and press|press)\b/, verb: "Inspect and press" },
    { pattern: /^inspect\b/, verb: "Inspect" },
    { pattern: /^palpate\b/, verb: "Palpate" },
    { pattern: /^auscultate\b/, verb: "Auscultate" },
    { pattern: /^percuss\b/, verb: "Percuss" },
    { pattern: /^observe\b/, verb: "Observe" },
    { pattern: /^test\b/, verb: "Test" },
    { pattern: /^(?:estimate|measure)\b/, verb: sourceText.includes("volume") ? "Estimate" : "Measure" },
    { pattern: /^listen\b/, verb: "Listen to" },
    { pattern: /^ask the patient\b/, verb: "Test" }
  ];
  const rule = verbRules.find((entry) => entry.pattern.test(technique));
  return rule ? `${rule.verb} ${subject}` : `Examine ${titleCaseFirst(subject)}`;
}

function genericFindingsOptions(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/\s*(?:[;|]|\s+\/\s+)\s*/);
  const tokens = list
    .map((entry) => normalizeComplaintText(entry))
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

function hasFindingsOptions(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry || "").trim());
  }
  return Boolean(String(value || "").trim());
}

function maneuverSpecificFindingsOptions(item = {}, label = "") {
  const text = normalizeComplaintText([
    label,
    item.original_label,
    item.technique,
    item.diagnostic_target,
    item.management_change,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags
  ].filter(Boolean).join(" "));
  const options = [
    {
      pattern: /\b(?:proximal hip flexor strength|chair rise strength|chair rise|hip flexion strength)\b/,
      values: ["Normal symmetric strength", "Symmetric proximal weakness", "Asymmetric/focal weakness", "Unable or unsafe to test"]
    },
    {
      pattern: /\bjvp\b|\bjugular venous pressure\b/,
      values: ["JVP not elevated", "JVP elevated above expected level", "Waveform difficult/positioning limited", "Unable to assess"]
    },
    {
      pattern: /\bfocal bone tenderness\b|\bspine for focal tenderness\b|\bbone pain\b/,
      values: ["No focal bony tenderness", "Focal bony tenderness", "Severe pain/deformity or fracture concern", "Unable to assess"]
    },
    {
      pattern: /\bgait stability\b|\bstanding and gait\b/,
      values: ["Stable gait without new support", "Antalgic or unsteady gait", "Assistive device or hands-on help needed", "Unable or unsafe to stand/walk"]
    },
    {
      pattern: /\bspine posture\b|\bkyphosis\b|\bheight loss\b/,
      values: ["No kyphosis or height-loss concern", "Kyphosis or height-loss concern", "Marked deformity or vertebral compression concern", "Unable to assess"]
    },
    {
      pattern: /\bchvostek\b/,
      values: ["Negative", "Ipsilateral facial twitch present", "Unable or unreliable"]
    },
    {
      pattern: /\btrousseau\b/,
      values: ["Negative", "Carpopedal spasm present", "Unable or unsafe"]
    },
    {
      pattern: /\boral mucosa.*hyperpigmentation\b|\bmucosal hyperpigmentation\b|\bhyperpigmentation\b/,
      values: ["No mucosal hyperpigmentation", "Buccal/gingival hyperpigmentation present", "Diffuse skin/mucosal hyperpigmentation", "Unable to assess"]
    },
    {
      pattern: /\bacral enlargement\b|\bhands\b.*\bacral\b/,
      values: ["No acral enlargement", "Enlarged hands or soft-tissue thickening", "Coarsened/acral changes affecting function", "Unable to assess"]
    },
    {
      pattern: /\btongue size\b|\bmacroglossia\b/,
      values: ["Normal tongue size", "Macroglossia or dental spacing", "Airway/speech/swallow concern", "Unable to assess"]
    },
    {
      pattern: /\bacne distribution\b|\bacne\b/,
      values: ["No clinically significant acne", "Inflammatory acne in androgen-sensitive pattern", "Severe/rapid-onset acne or virilization concern", "Unable to assess"]
    },
    {
      pattern: /\bterminal hair distribution\b|\bhirsutism\b/,
      values: ["Expected terminal hair distribution", "Excess terminal hair in androgen-sensitive areas", "Rapid progression or virilization pattern", "Unable to assess"]
    },
    {
      pattern: /\bacanthosis\b/,
      values: ["No acanthosis nigricans", "Velvety hyperpigmented plaques present", "Extensive acanthosis or severe insulin-resistance phenotype", "Unable to assess"]
    },
    {
      pattern: /\bgalactorrhea\b/,
      values: ["No spontaneous or reported nipple discharge", "Galactorrhea present", "Mass/skin/nipple red flag present", "Not examined, declined, or unable"]
    },
    {
      pattern: /\bpubertal development\b|\btanner\b|\bpubertal stage\b/,
      values: ["Age-appropriate pubertal development", "Delayed pubertal development", "Advanced or rapidly progressive pubertal development", "Not examined, declined, or unable"]
    },
    {
      pattern: /\bclitoromegaly\b/,
      values: ["No clitoromegaly on consented exam", "Clitoromegaly or virilization concern", "Rapidly progressive virilization concern", "Not examined, declined, or unable"]
    },
    {
      pattern: /\bsecondary sex characteristics\b/,
      values: ["Expected secondary sex characteristics", "Delayed/reduced secondary sex characteristics", "Excess androgen or estrogen pattern", "Not examined, declined, or unable"]
    },
    {
      pattern: /\btesticular volume\b/,
      values: ["Expected adult testicular volume", "Small testes or asymmetry", "Mass, tenderness, or concerning scrotal finding", "Not examined, declined, or unable"]
    },
    {
      pattern: /\bbreast tissue\b|\bgynecomastia\b/,
      values: ["No glandular breast enlargement", "Tender or enlarged glandular tissue", "Mass, skin, or nipple-discharge concern", "Not examined, declined, or unable"]
    },
    {
      pattern: /\bbody hair distribution\b/,
      values: ["Expected body hair distribution", "Reduced androgen-dependent hair", "Excess androgen-pattern hair", "Unable to assess"]
    },
    {
      pattern: /\bcervical lymph nodes\b|\bregional lymph node\b|\bneck lymph\b/,
      values: ["No abnormal cervical nodes", "Tender/mobile nodes", "Firm, fixed, enlarging, or supraclavicular nodes", "Unable to assess"]
    },
    {
      pattern: /\boutstretched hands tremor\b|\btremor\b/,
      values: ["No tremor", "Fine tremor", "Coarse, severe, or function-limiting tremor", "Unable to assess"]
    },
    {
      pattern: /\beyes for proptosis\b|\bproptosis\b|\blid retraction\b/,
      values: ["No proptosis or lid retraction", "Proptosis/lid retraction present", "Pain, diplopia, exposure, or vision-threatening eye finding", "Unable to assess"]
    },
    {
      pattern: /\bvoice quality\b|\bhoarseness\b/,
      values: ["Normal voice", "Hoarse, weak, or changed voice", "Stridor, choking, or airway concern", "Unable to assess"]
    },
    {
      pattern: /\bairway narrowing\b|\bneck.*airway\b|\bstridor\b/,
      values: ["No visible airway compromise", "Positional dyspnea or compressive symptoms", "Stridor or urgent airway concern", "Unable to assess"]
    },
    {
      pattern: /\bdiaphoresis\b|\bsweating\b/,
      values: ["No diaphoresis", "Diaphoresis present", "Profuse diaphoresis with instability concern", "Unable to assess"]
    },
    {
      pattern: /\bkussmaul\b|\bdeep labored\b/,
      values: ["Normal respiratory pattern", "Tachypnea without deep-labored pattern", "Deep-labored Kussmaul pattern", "Shallow/tiring or unable to assess"]
    },
    {
      pattern: /\binsulin pump site\b|\bpump site\b/,
      values: ["Pump/infusion site clean and secure", "Erythema, drainage, tenderness, or infection concern", "Dislodgement, leakage, lipohypertrophy, or scarring", "Unable to assess"]
    }
  ];
  return options.find((entry) => entry.pattern.test(text))?.values || null;
}

function safetySpecificFindingsOptions(item = {}, label = "") {
  const text = normalizeComplaintText([
    label,
    item.original_label,
    item.action,
    item.management_change,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags
  ].filter(Boolean).join(" "));
  const options = [
    {
      pattern: /\bblood pressure\b|\bbp\b/,
      values: ["___/___ mmHg", "Hypotensive", "Severe hypertension", "Orthostatic concern", "Not available"]
    },
    {
      pattern: /\bheart rate\b|\bhr\b|\bpulse rate\b/,
      values: ["___ bpm regular", "Tachycardic", "Bradycardic", "Irregular", "Not available"]
    },
    {
      pattern: /\brespiratory rate\b|\brr\b/,
      values: ["___/min", "Normal effort", "Tachypneic or labored", "Bradypneic or tiring", "Not available"]
    },
    {
      pattern: /\boxygen saturation\b|\bspo2\b|\bpulse oximetry\b/,
      values: ["___% room air", "___% on oxygen ___ L/min", "Hypoxemic", "Escalating oxygen need", "Not available"]
    },
    {
      pattern: /\btemperature\b|\btemp\b/,
      values: ["___ C/F", "Fever", "Hypothermia", "Afebrile", "Not available"]
    },
    {
      pattern: /\bcurrent weight\b|\bweight\b/,
      values: ["___ kg/lb", "Recent weight gain", "Recent weight loss", "Unable/not available"]
    },
    {
      pattern: /\bbody mass index\b|\bbmi\b/,
      values: ["___ kg/m2", "Underweight", "Overweight/obesity range", "Not available"]
    },
    {
      pattern: /\bwaist circumference\b/,
      values: ["___ cm/in", "Above cardiometabolic-risk threshold", "Not available"]
    },
    {
      pattern: /\bbedside glucose\b|\bfingerstick\b|\bpoint of care glucose\b/,
      values: ["___ mg/dL", "Low", "High", "Critical/urgent value", "Not available"]
    },
    {
      pattern: /\borthostatic\b/,
      values: ["No orthostatic drop/symptoms", "Orthostatic BP/HR change", "Symptomatic or unsafe to stand", "Not available"]
    },
    {
      pattern: /\bgeneral appearance\b|\bacuity\b|\bill appearing\b/,
      values: ["Well appearing", "Ill appearing", "Toxic/unstable appearance", "Unable to assess"]
    }
  ];
  return options.find((entry) => entry.pattern.test(text))?.values || null;
}

function normalizeEvaluatedBedsideItem(item, group = "") {
  if (group !== "requiredExam" && group !== "conditionalExam" && group !== "safetyChecks") {
    return item;
  }
  const originalLabel = String(item.label || "");
  const label = clinicalExamActionLabel(item, group);
  const findingsOptions = group === "requiredExam" || group === "conditionalExam"
    ? (genericFindingsOptions(item.findings_options || item.findingsOptions)
      ? maneuverSpecificFindingsOptions({ ...item, original_label: originalLabel }, label)
      : null)
    : (group === "safetyChecks"
      && (!hasFindingsOptions(item.findings_options || item.findingsOptions)
        || genericFindingsOptions(item.findings_options || item.findingsOptions))
      ? safetySpecificFindingsOptions({ ...item, original_label: originalLabel }, label)
      : null);
  const fallbackTags = String(`${item.id || ""} ${label} ${item.source?.source_section || ""}`)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/[^a-z0-9+]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 10);
  const LR_plus = item.LR_plus || item.lr_plus || item.likelihood_ratio_plus || "n/a";
  const LR_minus = item.LR_minus || item.lr_minus || item.likelihood_ratio_minus || "n/a";
  return {
    ...item,
    label,
    original_label: label !== originalLabel ? originalLabel : item.original_label,
    technique: item.technique || "Perform the named bedside item directly and document positive, negative, and unable-to-assess findings.",
    findings_options: findingsOptions || item.findings_options || item.findingsOptions || ["Normal/absent", "Abnormal/present", "Unable to assess"],
    diagnostic_target: normalizeOriginalLabelReferences(item.diagnostic_target || item.diagnosticTarget || item.label || "", originalLabel, label),
    management_change: normalizeOriginalLabelReferences(item.management_change || item.managementImplication || item.action || "", originalLabel, label),
    LR_plus,
    LR_minus,
    likelihood_ratio_note: likelihoodRatioNoteForItem(item, group, LR_plus, LR_minus),
    difficulty: item.difficulty || "easy",
    time_burden_minutes: item.time_burden_minutes || 1,
    equipment_needed: group === "safetyChecks"
      ? equipmentForBedsideItem(item)
      : (item.equipment_needed || equipmentForBedsideItem(item)),
    patient_cooperation_required: item.patient_cooperation_required || "low",
    when_to_perform: item.when_to_perform || item.when_to_use || item.when_to_use_structured || "When this validated workup is selected and the bedside assessment is clinically safe to perform.",
    limitations: normalizeOriginalLabelReferences(item.limitations
      || item.interpretation_cautions
      || "Interpret with the full clinical context; bedside findings support but do not replace indicated diagnostic testing, guideline thresholds, or local protocols.", originalLabel, label),
    tags: normalizedBedsideTags(item, fallbackTags)
  };
}

function tagsForQuestionItem(item = {}) {
  if (item.tags?.length) return item.tags;
  return String(`${item.id || ""} ${item.label || ""} ${item.source?.source_section || ""}`)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/[^a-z0-9+]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 10);
}

function cleanQuestionOptionLabel(value = "") {
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

function questionOptionLabels(value) {
  if (Array.isArray(value)) {
    const labels = value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return entry.label || entry.value || entry.text || "";
        }
        return entry;
      })
      .map((entry) => String(entry || "").replace(/\s+/g, " ").trim())
      .map(cleanQuestionOptionLabel)
      .filter(Boolean);
    return Array.from(new Map(labels.map((entry) => [entry.toLowerCase(), entry])).values());
  }
  const labels = String(value || "")
    .split(/\s*(?:[;|]|\s+\/\s+)\s*/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .map(cleanQuestionOptionLabel)
    .filter(Boolean);
  return Array.from(new Map(labels.map((entry) => [entry.toLowerCase(), entry])).values());
}

function genericQuestionOptions(value) {
  const labels = questionOptionLabels(value).map((entry) => entry.toLowerCase());
  if (!labels.length) {
    return true;
  }
  return labels.length <= 4
    && labels.every((entry) => /^(?:unknown|yes|no|other|other ___|not sure|unable)$/.test(entry))
    && labels.some((entry) => entry === "yes")
    && labels.some((entry) => entry === "no");
}

function titleCaseOptionFragment(fragment = "") {
  const cleaned = String(fragment || "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:/\s-]+|[,;:/\s?.-]+$/g, "")
    .trim();
  if (!cleaned) {
    return "";
  }
  const acronym = cleaned.match(/^(?:cad|mi|cabg|ckd|cgm|sglt2|cgms?|dka|hhs|uti|cva|bp|hr|rr|ecg|ekg)$/i);
  if (acronym) {
    return cleaned.toUpperCase();
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function splitQuestionOptionFragments(text = "") {
  return String(text || "")
    .replace(/\?+$/g, "")
    .replace(/^Any\s+/i, "")
    .replace(/^Known\s+/i, "")
    .replace(/^Recent\s+/i, "")
    .replace(/^What has already been given:\s*/i, "")
    .replace(/^What symptoms localize[^:]*:\s*/i, "")
    .replace(/\band\s+what\s+/gi, ", ")
    .replace(/\band\s+has\s+/gi, ", ")
    .replace(/\band\s+is\s+/gi, ", ")
    .split(/\s*,\s*|\s+\/\s+|\s+\bor\b\s+|\s+\band\b\s+/i)
    .map((fragment) => fragment
      .replace(/^(?:or|and)\s+/i, "")
      .replace(/\b(if|when)\s+known\b/gi, "")
      .replace(/\bif\s+.+$/i, "")
      .replace(/\b(?:have you taken|use|known)\b$/i, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((fragment) => fragment.length >= 3)
    .filter((fragment) => !/^(?:and|or|if|when|any|known|recent|other)$/i.test(fragment));
}

function inferredQuestionOptions(item = {}, text = "", existingOptions = "") {
  if (!genericQuestionOptions(existingOptions)) {
    return questionOptionLabels(existingOptions);
  }
  const normalized = normalizeComplaintText([
    text,
    item.label,
    item.id,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    item.source?.source_section
  ].filter(Boolean).join(" "));
  const patternOptions = [
    {
      pattern: /\bchest\b.*\b(?:start|onset|ongoing|duration)\b|\b(?:start|onset|ongoing|duration)\b.*\bchest\b/,
      values: ["Onset time documented", "Ongoing now", "Resolved", "Recurrent/intermittent", "Unknown"]
    },
    {
      pattern: /\b(?:chest|discomfort)\b.*\b(?:feel|quality|radiate|radiation|arm|jaw|back|shoulder)\b|\b(?:radiate|radiation)\b.*\b(?:arm|jaw|back|shoulder)\b/,
      values: ["Pressure/heaviness", "Sharp or pleuritic", "Burning/reflux-like", "Reproducible with palpation/movement", "Radiates to arm/jaw/back/shoulder", "Other ___"]
    },
    {
      pattern: /\b(?:exertional|relieved by rest|prior angina)\b/,
      values: ["Exertional", "Relieved by rest", "Similar to prior angina", "Non-exertional", "Not sure"]
    },
    {
      pattern: /\b(?:diabetes type|insulin regimen|pump|cgm|last insulin)\b/,
      values: ["Diabetes type known", "Insulin regimen known", "Pump/CGM use", "Last insulin dose known", "Unknown", "Other ___"]
    },
    {
      pattern: /\b(?:what has already been given|fluids|insulin route|potassium\/phosphate|dextrose|antibiotics|monitoring level)\b/,
      values: ["None yet", "Fluids given", "Insulin started", "Potassium/phosphate addressed", "Dextrose or bicarbonate used", "Antibiotics given", "Monitoring level documented", "Other ___"]
    },
    {
      pattern: /\b(?:glucose|beta hydroxybutyrate|ketones|anion gap|bicarbonate|ph|potassium|creatinine|osmolality)\b/,
      values: ["Known/reviewed", "Hyperglycemia", "Ketones elevated", "Acidosis or anion gap", "Potassium abnormal", "Renal/osmolality concern", "Not available"]
    },
    {
      pattern: /\b(?:which medications|medications supplements|supplements missed doses|missed doses|biotin|iodine contrast|hormone therapy|recent treatment changes|assay interference)\b/,
      values: ["No relevant exposure", "Medication change", "Supplement use", "Missed doses", "Biotin", "Iodine/contrast exposure", "Hormone therapy", "Recent treatment change", "Other ___"]
    },
    {
      pattern: /\b(?:pregnan|postpartum|fertility|gestational)\b/,
      values: ["Not possible", "Possible", "Known pregnant/postpartum", "Timing/dating known", "Unknown", "Other ___"]
    }
  ];
  const matched = patternOptions.find((entry) => entry.pattern.test(normalized));
  if (matched) {
    return matched.values;
  }
  const fragments = splitQuestionOptionFragments(text)
    .map(titleCaseOptionFragment)
    .filter(Boolean);
  const uniqueFragments = [];
  fragments.forEach((fragment) => {
    const key = fragment.toLowerCase();
    if (!uniqueFragments.some((existing) => existing.toLowerCase() === key)) {
      uniqueFragments.push(fragment);
    }
  });
  if (uniqueFragments.length >= 2) {
    const prefix = /^any\b/i.test(String(text || "").trim()) ? ["No"] : [];
    return [...prefix, ...uniqueFragments.slice(0, 8), "Other ___"];
  }
  return ["No", "Present/yes", "Absent/no", "Unknown", "Other ___"];
}

function normalizeEvaluatedQuestionItem(item, group = "") {
  if (group !== "requiredQuestions" && group !== "conditionalQuestions") {
    return item;
  }
  const text = item.text || item.label || "";
  const existingOptions = item.options || item.answer_options || item.answerOptions || item.bedsideQuestionOptions || item.bedside_question_options || "";
  const diagnosticPurpose = item.diagnostic_purpose
    || item.diagnosticPurpose
    || item.rationale
    || "Clarifies diagnostic probability, severity, red flags, relevant mimics, or safe interpretation for the selected validated workup.";
  const managementImplication = item.management_implication
    || item.managementImplication
    || item.action
    || "The answer changes urgency, diagnostic testing, treatment safety, disposition, or follow-up planning.";
  const detailPrompts = historyQuestionDetailPrompts(item);
  const options = questionOptionLabels(inferredQuestionOptions(item, text, existingOptions));
  return {
    ...item,
    text,
    options,
    answer_options: options,
    detail_prompts: detailPrompts,
    when_to_ask: item.when_to_ask || item.whenToAsk || "Ask when this validated workup is selected or when the answer changes clinical interpretation.",
    diagnostic_purpose: diagnosticPurpose,
    management_implication: managementImplication,
    likelihood_ratio_note: likelihoodRatioNoteForQuestionItem(item),
    tags: tagsForQuestionItem(item)
  };
}

const feverSourceHistoryAtomDefinitions = [
  {
    suffix: "heent_oral",
    label: "Ask HEENT/oral source symptoms",
    text: "Any sore throat, ear pain, sinus pain, dental or oral pain, neck swelling, hoarseness, trouble swallowing, or drooling with the fever?",
    options: "No / Sore throat / Ear pain / Sinus pain / Dental or oral pain / Neck swelling / Hoarseness / Trouble swallowing / Drooling / Other ___",
    diagnostic_purpose: "Screens for HEENT, dental, oral, or deep-neck infection sources.",
    management_implication: "Positive answers focus HEENT/oral exam, airway-risk assessment, source-directed testing, antimicrobial framing, imaging threshold, and ENT/dental escalation.",
    tags: ["fever", "heent_source", "dental_source", "oral_source", "source_localizing_history"]
  },
  {
    suffix: "urinary_flank",
    label: "Ask urinary and flank infection-source symptoms",
    text: "Any dysuria, urinary frequency or urgency, hematuria, suprapubic pain, flank pain, catheter or urologic procedure, pregnancy possibility, prior resistant urine culture, nausea, vomiting, or reduced urine output?",
    options: "No / Dysuria / Frequency or urgency / Hematuria / Suprapubic pain / Flank pain / Catheter or procedure / Pregnancy possible / Resistant organism history / Nausea or vomiting / Reduced urine output / Other ___",
    diagnostic_purpose: "Screens for cystitis, pyelonephritis, obstructing urinary infection, catheter/procedure-associated infection, and renal/perfusion risk.",
    management_implication: "Positive answers change CVA/flank exam, urinalysis/culture, renal function review, imaging threshold, antimicrobial choice, pregnancy safety, and escalation threshold.",
    tags: ["fever", "urinary_source", "flank_pain", "pyelonephritis", "source_localizing_history"]
  },
  {
    suffix: "abdominal_gi",
    label: "Ask abdominal and GI infection-source symptoms",
    text: "Any abdominal pain, vomiting, diarrhea, jaundice, focal tenderness, recent intra-abdominal procedure, or concern for an abdominal infection source?",
    options: "No / Abdominal pain / Vomiting / Diarrhea / Jaundice / Focal tenderness / Recent abdominal procedure / Other ___",
    diagnostic_purpose: "Screens for intra-abdominal, biliary, GI, procedure-related, or peritoneal infection sources.",
    management_implication: "Positive answers focus abdominal exam, liver/biliary labs, stool or culture decisions, abdominal imaging threshold, antimicrobial framing, and surgical/GI escalation.",
    tags: ["fever", "abdominal_source", "gi_source", "biliary_source", "source_localizing_history"]
  },
  {
    suffix: "skin_wound_line",
    label: "Ask skin/line infection-source symptoms",
    text: "Any rash, wound, ulcer, drainage, line pain or redness, rapidly spreading skin pain, bite, recent procedure site, or soft-tissue infection concern?",
    options: "No / Rash / Wound or ulcer / Drainage / Line pain or redness / Rapidly spreading skin pain / Bite / Procedure site / Other ___",
    diagnostic_purpose: "Screens for cellulitis, abscess, wound infection, line/device infection, bite-related infection, and soft-tissue source-control needs.",
    management_implication: "Positive answers focus skin/wound/line inspection, culture/source-control decisions, antibiotic route and breadth, isolation, and surgical or line-management escalation.",
    tags: ["fever", "skin_source", "wound_source", "line_source", "soft_tissue_infection", "source_localizing_history"]
  },
  {
    suffix: "cns_joint_spine",
    label: "Ask about severe headache, stiff neck, confusion, seizure, hot swollen joint, severe back pain, fainting, very low urine, or symptoms getting worse quickly",
    text: "Any severe headache, neck stiffness, photophobia, confusion, seizure, petechiae, purpura, hot swollen joint, severe focal bone or back pain, new weakness, bowel or bladder symptoms, fainting, low urine output, or rapid worsening?",
    options: "No / Severe headache / Neck stiffness / Photophobia / Confusion / Seizure / Petechiae or purpura / Hot swollen joint / Focal bone or back pain / New weakness / Bowel or bladder symptoms / Fainting / Low urine output / Rapid worsening / Other ___",
    diagnostic_purpose: "Screens for meningitis/encephalitis, septic arthritis, spine infection, osteomyelitis, bacteremia complications, sepsis severity, and dangerous trajectory.",
    management_implication: "Positive answers change neurologic/joint/spine exam, sepsis reassessment, lumbar puncture or imaging threshold, cultures, antimicrobial urgency, and ED/inpatient escalation.",
    tags: ["fever", "cns_infection", "meningitis", "joint_source", "spine_infection", "sepsis", "source_localizing_history"]
  }
];

function isBroadFeverSourceHistoryQuestion(item = {}) {
  const text = normalizeComplaintText([
    item.id,
    item.label,
    item.text,
    item.diagnostic_purpose,
    item.management_implication,
    ...(item.tags || [])
  ].filter(Boolean).join(" "));
  const sourceDomainCount = [
    /\b(?:cough|sputum|dyspnea|pleuritic|respiratory|pneumonia)\b/.test(text),
    /\b(?:sore throat|ear|sinus|dental|oral|heent)\b/.test(text),
    /\b(?:dysuria|urinary|flank|hematuria|uti|pyelonephritis)\b/.test(text),
    /\b(?:abdominal|vomiting|diarrhea|gi|jaundice)\b/.test(text),
    /\b(?:rash|wound|line|skin|cellulitis)\b/.test(text),
    /\b(?:headache|neck stiffness|confusion|hot joint|back pain|low urine|fainting|rapid worsening)\b/.test(text)
  ].filter(Boolean).length;
  return /\bfever_source_localizing_symptoms\b/.test(text)
    || (/\b(?:what symptoms localize|localize the fever source|source localizing symptoms|source_localizing_history)\b/.test(text) && sourceDomainCount >= 4);
}

function atomizedHistoryTraceability(parent = {}, childId = "") {
  const parentTrace = parent.traceability || {};
  return {
    ...parentTrace,
    item_id: childId,
    parent_item_id: parentTrace.item_id || parent.id || "",
    parent_item_group: parentTrace.item_group || "",
    atomized_from_history_question: true
  };
}

function atomizedFeverSourceHistoryQuestion(parent = {}, definition = {}, group = "requiredQuestions") {
  const childId = `${parent.id || parent.traceability?.item_id || "source_history"}__${definition.suffix}`;
  const child = normalizeEvaluatedQuestionItem({
    ...parent,
    id: childId,
    label: definition.label,
    text: definition.text,
    options: definition.options,
    answer_options: definition.options,
    detail_prompts: [],
    diagnostic_purpose: definition.diagnostic_purpose,
    diagnostic_target: definition.diagnostic_purpose,
    management_implication: definition.management_implication,
    management_change: definition.management_implication,
    likelihood_ratio_note: parent.likelihood_ratio_note || "Question-level LR+/LR- is not available for this source-localizing history item; interpret it with vitals, exam, laboratory testing, imaging, and clinical trajectory.",
    tags: definition.tags,
    atomized_from_history_question: true,
    parent_question_id: parent.id || parent.traceability?.item_id || ""
  }, group);
  return {
    ...child,
    source: parent.source,
    traceability: atomizedHistoryTraceability(parent, childId)
  };
}

function infectionHistoryDomainKey(question = {}) {
  const text = normalizeComplaintText([
    question.id,
    question.label,
    question.text,
    question.diagnostic_purpose,
    ...(question.tags || [])
  ].filter(Boolean).join(" "));
  const explicitSourceHistory = /\b(?:source localizing history|infection modifier|urinary source|respiratory source|skin source|wound source|line source|abdominal source|gi source|heent source|dental source|cns infection|meningeal source|joint source|spine infection)\b/.test(text);
  if (!explicitSourceHistory) {
    return "";
  }
  if (/\b(?:fever severity intake perfusion question|severity history)\b/.test(text)) {
    return "";
  }
  if (!/\b(?:fever|infection|source|pneumonia|pyelonephritis|meningitis|sepsis|wound|line|abdominal|urinary|heent)\b/.test(text)) {
    return "";
  }
  if (/\b(?:respiratory source|pneumonia|cough|sputum|dyspnea|pleuritic)\b/.test(text)) return "infection_source:respiratory";
  if (/\b(?:heent source|dental source|oral source|sore throat|sinus|dental|oral|ear pain)\b/.test(text)) return "infection_source:heent_oral";
  if (/\b(?:urinary source|flank|pyelonephritis|dysuria|urinary frequency|urinary urgency|hematuria|urosepsis)\b/.test(text)) return "infection_source:urinary_flank";
  if (/\b(?:abdominal source|gi source|biliary source|abdominal pain|vomiting|diarrhea|jaundice)\b/.test(text)) return "infection_source:abdominal_gi";
  if (/\b(?:skin source|wound source|line source|soft tissue|rash|wound|line pain|drainage|cellulitis|abscess)\b/.test(text)) return "infection_source:skin_wound_line";
  if (/\b(?:cns infection|meningitis|meningeal|joint source|spine infection|hot joint|neck stiffness|photophobia|seizure|purpura|severe back pain)\b/.test(text)) return "infection_source:cns_joint_spine";
  return "";
}

function atomizeBroadHistoryQuestions(questions = [], group = "requiredQuestions") {
  return (questions || []).flatMap((question) => {
    if (isBroadFeverSourceHistoryQuestion(question)) {
      return feverSourceHistoryAtomDefinitions.map((definition) => atomizedFeverSourceHistoryQuestion(question, definition, group));
    }
    return [question];
  });
}

function dedupeHistoryQuestionsByDomain(requiredQuestions = [], conditionalQuestions = []) {
  const seenDomains = new Set();
  const dedupe = (question) => {
    const key = infectionHistoryDomainKey(question);
    if (!key) {
      return true;
    }
    if (seenDomains.has(key)) {
      return false;
    }
    seenDomains.add(key);
    return true;
  };
  const required = (requiredQuestions || []).filter(dedupe);
  const conditional = (conditionalQuestions || []).filter(dedupe);
  return { requiredQuestions: required, conditionalQuestions: conditional };
}

function includeItems(items = [], contextText, answers, group = "", traceContext = {}) {
  const intentIds = (traceContext.intentTrace || []).map((intentRow) => intentRow.intent_id).filter(Boolean);
  return items
    .map((item) => withEvaluation(item, contextText, answers, { intentIds }))
    .filter((item) => item.included)
    .map((item) => normalizeEvaluatedBedsideItem(item, group))
    .map((item) => normalizeEvaluatedQuestionItem(item, group))
    .map((item) => traceComplaintCdsItem(item, traceContext.module || {}, group, traceContext.intentTrace || [], traceContext.authorizedBy));
}

function isActivatedBySelectedIntent(item = {}, intentIds = []) {
  const selectedIntentIds = new Set((intentIds || []).map((value) => String(value || "").trim()).filter(Boolean));
  const activatingIntentIds = item.when?.intentIdsAny || item.when?.intentIdsAll || [];
  return activatingIntentIds.some((intentId) => selectedIntentIds.has(String(intentId || "").trim()));
}

function promoteIntentActivatedConditionalQuestions(requiredQuestions = [], conditionalQuestions = [], traceContext = {}) {
  const intentIds = (traceContext.intentTrace || []).map((intentRow) => intentRow.intent_id).filter(Boolean);
  const promoted = [];
  const remainingConditional = [];
  conditionalQuestions.forEach((item) => {
    if (isActivatedBySelectedIntent(item, intentIds)) {
      promoted.push({
        ...item,
        item_group: "requiredQuestions",
        promoted_from_group: item.item_group || "conditionalQuestions",
        activation_role: "required_for_selected_validated_intent",
        traceability: {
          ...(item.traceability || {}),
          item_group: "requiredQuestions",
          promoted_from_group: item.traceability?.item_group || item.item_group || "conditionalQuestions",
          activation_role: "required_for_selected_validated_intent"
        }
      });
    } else {
      remainingConditional.push(item);
    }
  });
  return {
    requiredQuestions: [...requiredQuestions, ...promoted],
    conditionalQuestions: remainingConditional
  };
}

function partitionBedsideExamItems(items = []) {
  return items.reduce((groups, item) => {
    if (isBasicBedsideDataItem(item)) {
      groups.safetyChecks.push(item);
    } else {
      groups.examManeuvers.push(item);
    }
    return groups;
  }, { safetyChecks: [], examManeuvers: [] });
}

function hasStructuredActivationTrigger(item = {}) {
  return Boolean(
    item.when?.termsAny?.length
    || item.when?.answersAny?.length
    || item.when?.termsAll?.length
    || item.when?.answersAll?.length
    || item.when?.intentIdsAny?.length
    || item.when?.intentIdsAll?.length
  );
}

function partitionExplicitSafetyChecks(items = []) {
  return items.reduce((groups, item) => {
    if (hasStructuredActivationTrigger(item)) {
      groups.conditionalSafetyChecks.push(item);
    } else {
      groups.requiredSafetyChecks.push(item);
    }
    return groups;
  }, { requiredSafetyChecks: [], conditionalSafetyChecks: [] });
}

function evaluateRedFlags(items = [], contextText, answers) {
  return items.map((item) => withEvaluation(item, contextText, answers));
}

function uniqueSourceIds(items = []) {
  return Array.from(new Set(items.map((item) => item.source?.source_id).filter(Boolean)));
}

function compactId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "item";
}

function sourceReferenceForIntent(intentRow = {}) {
  return {
    source_id: (intentRow.source_ids || [])[0] || "VALIDATED_CLINICAL_INTENT",
    source_section: "validated clinical intent suppress rules",
    evidence_strength: "expert-reviewed scope control",
    version_date: intentRow.last_reviewed || "",
    last_reviewed: intentRow.last_reviewed || "",
    clinical_owner: intentRow.review_owner || ""
  };
}

function suppressedItemsFromValidatedIntents(intents = [], module = {}) {
  return intents
    .filter((intentRow) => intentRow?.status === "validated")
    .flatMap((intentRow) => (intentRow.suppress_rules || []).map((rule, index) => {
      const labels = (rule.suppress_labels || []).filter(Boolean);
      const ruleId = rule.rule_id || `${intentRow.intent_id || "intent"}_suppress_${compactId(labels.join("_"))}_${index + 1}`;
      return {
        id: ruleId,
        label: labels.join("; ") || "Unspecified suppressed item",
        item_type: "suppressed_item",
        role: "suppressed",
        reason: rule.reason || "Outside the selected validated clinical intent unless patient modifiers or another validated intent explicitly support it.",
        suppressionReason: rule.reason || "Outside the selected validated clinical intent unless patient modifiers or another validated intent explicitly support it.",
        unless_tags_include: rule.unless_tags_include || [],
        rule_scope: rule.rule_scope || "validated_intent_suppress_unless_triggered",
        source: sourceReferenceForIntent(intentRow),
        diagnostic_target: `Scope control for ${intentRow.label || intentRow.intent_id || "validated intent"}`,
        management_change: "Keeps unrelated bedside maneuvers out of the recommended workup unless the patient context activates an appropriate secondary intent or modifier.",
        LR_plus: "n/a",
        LR_minus: "n/a",
        likelihood_ratio_note: "Likelihood ratios are not applicable to suppression rules; use this row to audit why a maneuver was not recommended.",
        difficulty: "n/a",
        time_burden_minutes: 0,
        equipment_needed: "n/a",
        patient_cooperation_required: "n/a",
        limitations: "Suppression is scope control, not a claim that the maneuver is never appropriate; override by selecting another validated intent or adding explicit patient modifiers.",
        tags: [
          ...(intentRow.evidence_tags || []),
          ...(rule.unless_tags_include || []),
          "suppressed_not_recommended"
        ],
        traceability: {
          intent_ids: [intentRow.intent_id].filter(Boolean),
          intent_labels: [intentRow.label].filter(Boolean),
          clinical_bundle_ids: intentRow.clinical_bundle_ids || [],
          module_id: module.id || "",
          module_label: module.label || "",
          item_id: ruleId,
          item_group: "suppressedNotRecommendedItems",
          source_ids: intentRow.source_ids || [],
          evidence_row_id: ruleId,
          authorized_by: "validated_clinical_intent_suppress_rule"
        },
        validatedIntentIds: [intentRow.intent_id].filter(Boolean)
      };
    }));
}

function catalogGapItemsFromOptions(gaps = [], traceContext = {}) {
  return (gaps || []).map((gap, index) => {
    const gapId = gap.gap_exam_id || gap.gap_id || gap.id || `catalog_gap_${index + 1}`;
    return {
      ...gap,
      id: gapId,
      label: gap.label || gap.gap_label || gap.required_domain || "Catalog gap needing review",
      item_type: "catalog_gap",
      role: "catalog_gap",
      source: gap.source || {
        source_id: gap.source_id || "CATALOG_GAP_REGISTRY",
        source_section: gap.source_section || "staged catalog gap",
        evidence_strength: "staged reviewer gap",
        version_date: gap.last_reviewed || "",
        last_reviewed: gap.last_reviewed || "",
        clinical_owner: gap.review_owner || ""
      },
      diagnostic_target: gap.diagnostic_target || gap.required_domain || "Missing reviewed bedside workup coverage",
      management_change: gap.management_change || gap.resolution_plan || "Needs reviewer action before it can authorize recommendations.",
      LR_plus: gap.LR_plus || "n/a",
      LR_minus: gap.LR_minus || "n/a",
      likelihood_ratio_note: gap.likelihood_ratio_note || "Likelihood ratios are not applicable to staged catalog gaps until reviewed evidence is added.",
      limitations: gap.limitations || "Not accepted evidence; shown only for reviewer follow-up.",
      tags: gap.tags || gap.retrieval_tags || ["catalog_gap"],
      traceability: {
        intent_ids: (traceContext.intentTrace || []).map((intentRow) => intentRow.intent_id).filter(Boolean),
        intent_labels: (traceContext.intentTrace || []).map((intentRow) => intentRow.label).filter(Boolean),
        clinical_bundle_ids: Array.from(new Set((traceContext.intentTrace || []).flatMap((intentRow) => intentRow.clinical_bundle_ids || []))),
        module_id: traceContext.module?.id || "",
        module_label: traceContext.module?.label || "",
        item_id: gapId,
        item_group: "catalogGapsNeedingReview",
        source_ids: [gap.source_id || "CATALOG_GAP_REGISTRY"].filter(Boolean),
        evidence_row_id: gapId,
        catalog_gap: true,
        gap_type: gap.gap_type || gap.item_type || "catalog_gap",
        gap_review_status: gap.review_status || gap.gap_status || "staged_gap",
        authorized_by: "staged_catalog_gap"
      }
    };
  });
}

function moduleConditionalExamCompletenessGaps(traceContext = {}) {
  const module = traceContext.module || {};
  const intentTrace = traceContext.intentTrace || [];
  if (!module.id || !intentTrace.length || (module.conditionalExam || []).length) {
    return [];
  }
  const primaryIntent = intentTrace[0] || {};
  const sourceId = (primaryIntent.source_ids || [])[0] || module.source_ids?.[0] || "AHRQ_CALIBRATE_DX";
  const gapId = `GAP-${module.id}-conditional-exam-addons`;
  return [
    {
      gap_id: gapId,
      gap_exam_id: gapId,
      label: "Conditional physical exam add-ons need review",
      gap_label: "Conditional physical exam add-ons need review",
      gap_type: "exam_maneuver",
      review_status: "staged_gap",
      gap_status: "staged_gap",
      review_owner: primaryIntent.review_owner || module.review_owner || "clinical_content_lead",
      last_reviewed: primaryIntent.last_reviewed || module.last_reviewed || "2026-06-07",
      source_id: sourceId,
      source_section: "module completeness review",
      required_domain: "conditional physical exam add-ons",
      diagnostic_target: `Missing reviewed modifier-triggered exam add-ons for ${module.label || primaryIntent.label || module.id}`,
      management_change: "Needs reviewer action before the module can claim complete conditional exam coverage.",
      resolution_plan: `Add source-backed conditional exam add-ons with trigger conditions, technique, finding options, diagnostic target, LR fields or LR limitation note, management implications, feasibility, source IDs, and regression tests for ${module.label || primaryIntent.label || module.id}.`,
      rationale: `The validated module "${module.label || module.id}" currently has no conditional physical exam add-ons. Do not imply that the core exam is exhaustive for every modifier or complication; stage reviewed add-ons before calling this section complete.`,
      limitations: "Not accepted evidence; shown only for reviewer follow-up.",
      tags: ["workup_completeness_gap", "conditional_exam_addons", ...(primaryIntent.evidence_tags || [])],
      retrieval_tags: ["workup_completeness_gap", "conditional_exam_addons", ...(primaryIntent.evidence_tags || [])]
    }
  ];
}

function limitationTextForItem(item = {}) {
  return String(item.limitations || item.interpretation_cautions || item.interpretationCautions || "").trim();
}

function limitationCautionsFromItems(items = []) {
  const seen = new Set();
  return items
    .map((item) => {
      const limitation = limitationTextForItem(item);
      if (!limitation) {
        return null;
      }
      const key = `${item.id || item.label || limitation}::${limitation}`.toLowerCase();
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      return {
        id: `${item.id || "item"}_limitation`,
        label: item.label || "Interpretation caution",
        item_type: "interpretation_caution",
        source: item.source,
        limitation,
        interpretation_cautions: limitation,
        diagnostic_target: item.diagnostic_target || item.diagnostic_purpose || item.label || "",
        management_change: item.management_change || item.management_implication || item.action || "",
        tags: item.tags || [],
        LR_plus: item.LR_plus || item.lr_plus || "n/a",
        LR_minus: item.LR_minus || item.lr_minus || "n/a",
        likelihood_ratio_note: item.likelihood_ratio_note || likelihoodRatioNoteForItem(item, "", item.LR_plus || item.lr_plus || "n/a", item.LR_minus || item.lr_minus || "n/a"),
        traceability: {
          ...(item.traceability || {}),
          item_group: "limitationsAndInterpretationCautions",
          evidence_row_id: item.id || item.traceability?.evidence_row_id || ""
        },
        validatedIntentIds: item.validatedIntentIds || item.traceability?.intent_ids || []
      };
    })
    .filter(Boolean);
}

function modulePrimarySource(module = {}, fallbackItems = []) {
  const firstItemWithSource = fallbackItems.find((item) => item.source?.source_id);
  const sourceId = firstItemWithSource?.source?.source_id
    || (module.endocrine_metadata?.source_ids || [])[0]
    || (module.source_ids || [])[0]
    || "VALIDATED_COMPLAINT_MODULE";
  const reviewed = firstItemWithSource?.source?.last_reviewed
    || module.endocrine_metadata?.last_reviewed
    || module.last_reviewed
    || "";
  return {
    source_id: sourceId,
    source_section: `${module.label || module.id || "Validated workup"} physical exam scope control`,
    evidence_strength: firstItemWithSource?.source?.evidence_strength || "guideline/consensus",
    version_date: firstItemWithSource?.source?.version_date || module.endocrine_metadata?.version_date || "",
    last_reviewed: reviewed,
    clinical_owner: firstItemWithSource?.source?.clinical_owner || module.review_owner || "clinical_content_review",
    implementation_notes: "Generated as a scope-control caution so lab-driven workups do not invent unsupported physical exam maneuvers."
  };
}

function moduleIsIntentionallyExamLight(module = {}) {
  const text = normalizeComplaintText([
    module.id,
    module.label,
    module.endocrine_metadata?.source_diagnosis,
    module.endocrine_metadata?.category,
    (module.endocrine_metadata?.source_ids || []).join(" ")
  ].filter(Boolean).join(" "));
  return /\b(?:prediabetes|metabolic syndrome|gestational diabetes|gdm)\b/.test(text);
}

function moduleExamScopeCautions(module = {}, requiredExam = [], conditionalExam = [], traceContext = {}) {
  if (!moduleIsIntentionallyExamLight(module) || (requiredExam.length + conditionalExam.length) >= 2) {
    return [];
  }
  const traces = (traceContext.intentTrace || []).map(normalizeIntentTrace).filter(Boolean);
  const intentIds = traces.map((trace) => trace.intent_id);
  const intentLabels = traces.map((trace) => trace.label);
  const source = modulePrimarySource(module, [...requiredExam, ...conditionalExam]);
  const itemId = `${module.id || "module"}_physical_exam_scope`;
  const limitation = "This workup is intentionally exam-light: diagnosis and risk stratification are driven by guideline laboratory thresholds, pregnancy/medication context, and anthropometrics rather than a broad physical exam. Check basic bedside data and anthropometrics, document the focused insulin-resistance phenotype exam when relevant, and add foot/vascular, hydration/perfusion, abdominal, cardiopulmonary, or neurologic exams only when symptoms, complications, or a second validated intent trigger them.";
  return [
    {
      id: itemId,
      label: `Physical exam scope for ${module.label || "this workup"}`,
      item_type: "interpretation_caution",
      source,
      limitation,
      interpretation_cautions: limitation,
      diagnostic_target: `Scope control for ${module.label || module.id || "lab-driven endocrine workup"}`,
      management_change: "Prevents unsupported exam expansion while preserving symptom-triggered add-ons and guideline-based diagnostic testing.",
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to exam-scope cautions; use this row to audit why the workup remains focused rather than comprehensive-by-default.",
      tags: ["exam_scope", "exam_light", "endocrine", "laboratory_guided", "diagnostic_safety"],
      traceability: {
        intent_ids: intentIds,
        intent_labels: intentLabels,
        clinical_bundle_ids: Array.from(new Set(traces.flatMap((trace) => trace.clinical_bundle_ids || []))),
        module_id: module.id || "",
        module_label: module.label || "",
        item_id: itemId,
        item_group: "limitationsAndInterpretationCautions",
        source_ids: Array.from(new Set([source.source_id, ...(module.endocrine_metadata?.source_ids || []), ...traces.flatMap((trace) => trace.source_ids || [])].filter(Boolean))),
        evidence_row_id: itemId,
        authorized_by: intentIds.length ? "validated_clinical_intent" : "validated_complaint_module"
      },
      validatedIntentIds: intentIds
    }
  ];
}

const infectionModifierTriggerPattern = /\b(?:fever|febrile|chills|rigors|infection|infectious|sepsis|pneumonia|leukocytosis|hypothermia|toxic appearance|cough|sputum|dyspnea|shortness of breath|pleuritic|hypoxemia|dysuria|urinary|flank|pyelonephritis|rash|wound|line|device|cellulitis|abscess|sore throat|neck stiffness|photophobia)\b/i;
const negatedStandaloneInfectionModifierPattern = /^\s*(?:no|none|denies|denied|without)\s+(?:fever|febrile symptoms|chills|rigors|infection|infectious symptoms|cough|urinary symptoms|dysuria|rash|wound|line concern)\s*$/i;

const infectionModifierHistoryFloorDefinitions = [
  {
    id_suffix: "infection_modifier_respiratory_source",
    label: "Ask respiratory infection-source symptoms",
    text: "Any cough, sputum, pleuritic pain, dyspnea, hypoxemia, wheeze, aspiration risk, or sick respiratory contacts suggesting pneumonia or respiratory infection?",
    answer_options: "No / Cough / Sputum / Pleuritic pain / Dyspnea / Hypoxemia / Wheeze / Aspiration risk / Sick contacts / Other ___",
    options: "No / Cough / Sputum / Pleuritic pain / Dyspnea / Hypoxemia / Wheeze / Aspiration risk / Sick contacts / Other ___",
    when_to_ask: "Ask when fever, infection, pneumonia, respiratory symptoms, or sepsis concern is entered as a modifier to another validated workup.",
    diagnostic_purpose: "Screens for pneumonia, viral respiratory infection, aspiration, obstructive lung disease with infection, or respiratory failure as a source or precipitant.",
    management_implication: "Positive respiratory-source symptoms change lung exam priority, chest imaging/testing, isolation, antimicrobial framing, respiratory support, and disposition.",
    tags: ["infection", "fever", "pneumonia", "respiratory_source", "source_localizing_history"],
    source: {
      source_id: "ATS_CAP_2025",
      source_section: "adult community-acquired pneumonia diagnostic and severity evaluation",
      evidence_strength: "guideline/consensus",
      version_date: "2025",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Modifier-triggered source question; does not replace selecting the fever/sepsis intent when infection is the primary problem."
    },
    diagnostic_target: "Respiratory infectious source or precipitant: pneumonia, respiratory viral infection, aspiration, or hypoxemic respiratory failure.",
    management_change: "Positive respiratory-source symptoms should activate lung auscultation, oxygenation review, chest imaging/testing, isolation, antimicrobial framing, and escalation decisions.",
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: "Question-level LR+/LR- is not available for this broad source-localizing prompt; use it to route exam and testing rather than diagnose pneumonia by history alone."
  },
  {
    id_suffix: "infection_modifier_urinary_flank_source",
    label: "Ask UTI symptoms and complicated-infection risk",
    text: "Any dysuria, urinary frequency or urgency, suprapubic pain, hematuria, flank pain, catheter/procedure context, vomiting, pregnancy possibility, or reduced urine output suggesting UTI, pyelonephritis, or urosepsis?",
    answer_options: "No / Dysuria / Frequency-urgency / Suprapubic pain / Hematuria / Flank pain / Catheter-procedure / Vomiting / Pregnancy possible / Low urine output / Other ___",
    options: "No / Dysuria / Frequency-urgency / Suprapubic pain / Hematuria / Flank pain / Catheter-procedure / Vomiting / Pregnancy possible / Low urine output / Other ___",
    when_to_ask: "Ask when fever, infection, urinary symptoms, flank symptoms, AKI, or sepsis concern is entered as a modifier to another validated workup.",
    diagnostic_purpose: "Distinguishes lower UTI, pyelonephritis, infected obstruction, catheter-associated infection, renal-source sepsis, and dehydration or renal dysfunction clues.",
    management_implication: "Positive urinary/flank symptoms change CVA/suprapubic exam priority, urinalysis/culture, renal function review, imaging threshold, antimicrobial choice, renal dosing, and escalation.",
    tags: ["infection", "fever", "urinary_source", "flank_pain", "pyelonephritis", "source_localizing_history"],
    source: {
      source_id: "MERCK_FEVER_ADULTS",
      source_section: "fever history and localizing urinary/flank symptoms",
      evidence_strength: "clinical_reference",
      version_date: "current",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Modifier-triggered source question; tie exam/testing to symptoms and selected primary workup."
    },
    diagnostic_target: "Urinary or renal infectious source: cystitis, pyelonephritis, infected obstruction, catheter-associated infection, or urosepsis.",
    management_change: "Positive urinary/flank symptoms should activate CVA/suprapubic exam, urinalysis/culture, renal-function review, renal imaging when obstruction is possible, and escalation decisions.",
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: "Question-level LR+/LR- is not available for this broad source-localizing prompt; interpret with urinalysis, culture, fever trajectory, renal function, and exam findings."
  },
  {
    id_suffix: "infection_modifier_skin_line_source",
    label: "Ask skin/line infection-source symptoms",
    text: "Any rash, cellulitis, abscess, ulcer, drainage, painful skin, rapidly spreading redness, indwelling line/device, surgical site, procedure-site tenderness, bite, petechiae, or purpura suggesting a skin, line, or soft-tissue infection source?",
    answer_options: "No / Rash / Cellulitis / Abscess / Wound-ulcer / Drainage / Painful skin / Rapid spread / Line-device / Procedure site / Bite / Petechiae-purpura / Other ___",
    options: "No / Rash / Cellulitis / Abscess / Wound-ulcer / Drainage / Painful skin / Rapid spread / Line-device / Procedure site / Bite / Petechiae-purpura / Other ___",
    when_to_ask: "Ask when fever, infection, wound, line/device, rash, soft-tissue symptoms, or sepsis concern is entered as a modifier to another validated workup.",
    diagnostic_purpose: "Screens visible source-control targets, soft-tissue infection, device-associated infection, necrotizing infection clues, and high-risk rash patterns.",
    management_implication: "Positive skin/line symptoms change inspection priority, culture targets, source control, wound care, antimicrobial coverage, isolation, and urgent escalation.",
    tags: ["infection", "fever", "skin_source", "wound", "line", "source_localizing_history"],
    source: {
      source_id: "MERCK_FEVER_ADULTS",
      source_section: "evaluation of fever and source-directed history and physical examination",
      evidence_strength: "clinical_reference",
      version_date: "current",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Modifier-triggered source question; source control and escalation depend on local exam findings."
    },
    diagnostic_target: "Skin, wound, line/device, rash, or soft-tissue infectious source.",
    management_change: "Positive skin/wound/line symptoms should activate focused skin/line inspection, wound or line culture when appropriate, source control, antimicrobial coverage, and escalation decisions.",
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: "Question-level LR+/LR- is not available for this broad source-localizing prompt; interpret with inspection, severity, host risk, and trajectory."
  },
  {
    id_suffix: "infection_modifier_host_exposure",
    label: "Ask host-risk and exposure history",
    text: "Any immunosuppression, pregnancy possibility, transplant/chemotherapy, high-dose steroids or biologics, asplenia, frailty, recent hospitalization/procedure, indwelling device, travel or outdoor bites, animal/food/water exposure, sick contacts, sexual exposure risk, injection drug use, or new medication?",
    answer_options: "No / Immunocompromised / Pregnancy possible / Transplant-chemo / Steroids-biologics / Asplenia-frailty / Recent healthcare exposure / Device-line / Travel-bites / Animal-food-water / Sick contacts / Sexual exposure / Injection drug use / New medication / Other ___",
    options: "No / Immunocompromised / Pregnancy possible / Transplant-chemo / Steroids-biologics / Asplenia-frailty / Recent healthcare exposure / Device-line / Travel-bites / Animal-food-water / Sick contacts / Sexual exposure / Injection drug use / New medication / Other ___",
    when_to_ask: "Ask when fever, infection, sepsis concern, unexplained systemic symptoms, or high-risk host context is entered as a modifier to another validated workup.",
    diagnostic_purpose: "Identifies host-risk, healthcare-associated, travel/vector, zoonotic, food/water, STI, injection-related, drug-fever, and exposure contexts.",
    management_implication: "Positive host/exposure features lower escalation and testing thresholds, change isolation and empiric coverage, and can trigger specialty consultation or public-health considerations.",
    tags: ["infection", "fever", "host_risk", "exposure_history", "source_localizing_history"],
    source: {
      source_id: "MERCK_FEVER_ADULTS",
      source_section: "host risk, exposures, hospitalization, procedures, and immunocompromise",
      evidence_strength: "clinical_reference",
      version_date: "current",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Modifier-triggered host-risk question; use with the selected primary validated workup."
    },
    diagnostic_target: "High-risk host or exposure clue that changes the meaning of fever or infection symptoms.",
    management_change: "Positive host/exposure features can change cultures, imaging, empiric therapy breadth, isolation, ID consultation, ED/inpatient threshold, and safety-netting.",
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: "Likelihood ratios are not applicable to broad host/exposure screening; use it for risk stratification and source routing."
  },
  {
    id_suffix: "infection_modifier_sepsis_severity",
    label: "Ask sepsis severity, hydration, and perfusion symptoms",
    text: "Any poor intake, inability to keep fluids down, dehydration, dizziness, fainting, confusion, unusual sleepiness, low urine output, severe weakness, increasing oxygen need, cold or mottled extremities, or rapid worsening with the fever or infection concern?",
    answer_options: "No / Poor intake / Cannot keep fluids down / Dehydration / Dizziness-fainting / Confusion-sleepiness / Low urine output / Severe weakness / More oxygen / Cold-mottled extremities / Rapid worsening / Other ___",
    options: "No / Poor intake / Cannot keep fluids down / Dehydration / Dizziness-fainting / Confusion-sleepiness / Low urine output / Severe weakness / More oxygen / Cold-mottled extremities / Rapid worsening / Other ___",
    when_to_ask: "Ask when fever, infection, sepsis concern, poor intake, hypovolemia, or systemic illness is entered as a modifier to another validated workup.",
    diagnostic_purpose: "Screens for sepsis physiology, dehydration, hypoperfusion, encephalopathy, respiratory deterioration, and inability to maintain safe oral intake.",
    management_implication: "Positive severity symptoms change urgency, vital-sign reassessment, cultures/lactate/organ-dysfunction labs, fluids, antimicrobials, ED/inpatient escalation, and safety-netting.",
    tags: ["infection", "sepsis", "perfusion", "hypovolemia", "severity_history"],
    source: {
      source_id: "SSC_SEPSIS_2026",
      source_section: "sepsis severity, hypoperfusion, altered mentation, and escalation assessment",
      evidence_strength: "guideline/consensus",
      version_date: "2026",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Modifier-triggered severity question; do not delay urgent sepsis treatment when unstable."
    },
    diagnostic_target: "Sepsis severity, hypoperfusion, dehydration, encephalopathy, or respiratory deterioration.",
    management_change: "Positive severity symptoms should trigger urgent reassessment, sepsis labs/cultures when appropriate, fluids or respiratory support evaluation, antimicrobial timing, and escalation decisions.",
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: "Question-level LR+/LR- is not available for this severity screen; use it as an acuity trigger interpreted with vitals, exam, labs, and trajectory."
  }
];

function infectionModifierHistoryFloorActive(contextText = "", module = {}) {
  if (module?.id === "fever_infection_sepsis_v1") {
    return false;
  }
  if (module?.modifier_add_on_policy?.suppress_generic_infection_modifier_history_floor === true) {
    return false;
  }
  const normalized = normalizeComplaintText(contextText);
  if (!normalized || negatedStandaloneInfectionModifierPattern.test(normalized)) {
    return false;
  }
  return infectionModifierTriggerPattern.test(normalized);
}

function sourceQuestionAlreadyRepresented(questions = [], definition = {}) {
  const definitionTags = new Set((definition.tags || []).map(normalizeComplaintText));
  const definitionText = normalizeComplaintText([
    definition.label,
    definition.text,
    definition.diagnostic_target
  ].filter(Boolean).join(" "));
  return questions.some((question) => {
    const labelText = normalizeComplaintText([question.id, question.label, question.text].filter(Boolean).join(" "));
    if (/\b(?:trigger|precipitant|mimic|source-localizing|source localizing|most likely|what source|which source)\b/.test(labelText)) {
      return false;
    }
    const questionTags = new Set((question.tags || []).map(normalizeComplaintText));
    if (Array.from(definitionTags).some((tag) => tag && questionTags.has(tag) && tag !== "infection" && tag !== "fever")) {
      return true;
    }
    const text = normalizeComplaintText([
      labelText,
      question.diagnostic_purpose,
      question.diagnostic_target,
      question.management_implication,
    ].filter(Boolean).join(" "));
    if (!text) {
      return false;
    }
    const questionInfectionContext = /\b(?:infection|infectious|fever|sepsis|pneumonia|source|pyelonephritis|urosepsis|cellulitis|abscess|wound|line)\b/.test(text);
    if (!questionInfectionContext) {
      return false;
    }
    if (/respiratory_source|pneumonia|cough|sputum|dyspnea/.test(definitionText)) {
      return /\b(?:respiratory|pneumonia|cough|sputum|dyspnea|pleuritic)\b/.test(text);
    }
    if (/urinary_source|flank|pyelonephritis/.test(definitionText)) {
      return /\b(?:urinary frequency|urinary urgency|dysuria|frequency|urgency|flank|pyelonephritis|hematuria|catheter|suprapubic|cva|urosepsis)\b/.test(text);
    }
    if (/skin_source|wound|line/.test(definitionText)) {
      return /\b(?:skin|wound|line|cellulitis|abscess|drainage)\b/.test(text);
    }
    if (/host_risk|exposure_history/.test(definitionText)) {
      return /\b(?:immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|travel|animal|food|water|sick contact|new medication|injection drug)\b/.test(text);
    }
    if (/severity_history|sepsis/.test(definitionText)) {
      return /\b(?:poor intake|dehydration|fainting|confusion|low urine|hypotension|perfusion|rapid worsening|oxygen)\b/.test(text);
    }
    return false;
  });
}

function infectionModifierHistoryFloorQuestions(module = {}, existingQuestions = [], conditionalContext = "", traceContext = {}) {
  if (!infectionModifierHistoryFloorActive(conditionalContext, module)) {
    return [];
  }
  return infectionModifierHistoryFloorDefinitions
    .filter((definition) => !sourceQuestionAlreadyRepresented(existingQuestions, definition))
    .map((definition) => {
      const normalizedQuestion = normalizeEvaluatedQuestionItem({
        ...definition,
        id: `${module.id || "module"}_${definition.id_suffix}`,
        item_type: "history_question"
      }, "conditionalQuestions");
      return traceComplaintCdsItem(normalizedQuestion, module, "conditionalQuestions", traceContext.intentTrace, traceContext.authorizedBy);
    });
}

const pregnancyDiabetesPrimaryOutputModuleIds = new Set([
  "type_1_diabetes_mellitus_v1",
  "type_2_diabetes_mellitus_v1",
  "prediabetes_v1"
]);

const postpartumDiabetesFollowUpModuleIds = new Set([
  "type_2_diabetes_mellitus_v1",
  "prediabetes_v1"
]);

const postpartumMaternalSafetyIntentIds = new Set([
  "fever_sepsis_v1",
  "suspected_pe_v1"
]);

const activePregnancyModifierPattern = /\b(?:currently pregnant|pregnant now|active pregnancy|pregnant patient|gestational age|weeks pregnant|wks pregnant|in pregnancy)\b/i;
const nonActivePregnancyModifierPattern = /\b(?:not pregnant|nonpregnant|not currently pregnant|pregnancy test negative|negative pregnancy test|postpartum|delivered)\b/i;
const postpartumModifierPattern = /\b(?:postpartum|post partum|post-delivery|post delivery|postnatal|recent delivery|delivered)\b/i;
const olderAdultModifierPattern = /\b(?:older adult|geriatric|elderly|frail|frailty|age(?:d)?\s*(?:6[5-9]|[789]\d|1\d{2})|(?:6[5-9]|[789]\d|1\d{2})\s*(?:yo|y\/o|year(?:s)?\s*old))\b/i;

const pregnancyDiabetesSource = {
  source_id: "ADA_SOC_2026",
  source_section: "Pregnancy-specific diabetes modifier add-on from gestational diabetes knowledge pack",
  evidence_strength: "guideline/consensus",
  version_date: "2026",
  last_reviewed: "2026-06-06",
  clinical_owner: "endocrine_content_review",
  implementation_notes: "Modifier-triggered primary-output add-on; use with validated diabetes intents when active pregnancy is entered, and select the gestational diabetes workup when pregnancy diabetes is the primary question."
};

const pregnancyDiabetesPrimaryOutputDefinitions = {
  conditionalQuestions: [
    {
      id_suffix: "pregnancy_diabetes_gestational_age_history",
      label: "Pregnancy diabetes gestational-age history",
      text: "How many weeks pregnant are you, and has pregnancy dating, fetal growth, or obstetric context changed diabetes screening or treatment safety?",
      options: "Not documented / Gestational age known / Dating uncertain / Fetal growth concern / Polyhydramnios / MFM or OB plan available / Other ___",
      when_to_ask: "Ask when active pregnancy is entered as a modifier on Type 1 diabetes, Type 2 diabetes, or prediabetes.",
      diagnostic_purpose: "Clarifies pregnancy-specific diabetes context: gestational age, pregnancy dating reliability, fetal growth or polyhydramnios concern, and obstetric-care plan.",
      management_implication: "Gestational age or dating uncertainty changes whether early risk testing, 24-28 week OGTT strategy, home glucose monitoring, medication safety review, fetal surveillance, or postpartum follow-up is the next management step.",
      diagnostic_target: "Pregnancy-specific diabetes context: gestational age, pregnancy dating reliability, fetal growth or polyhydramnios concern, and obstetric-care plan.",
      management_change: "Gestational age or dating uncertainty changes screening timing, glucose-monitoring intensity, medication safety, fetal surveillance, and postpartum diabetes follow-up.",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "history_question", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for this pregnancy modifier prompt; use it to route guideline thresholds, safety testing, and obstetric coordination rather than diagnose diabetes by history alone."
    },
    {
      id_suffix: "pregnancy_diabetes_preexisting_risk_history",
      label: "Pregnancy diabetes preexisting-risk history",
      text: "Any prior gestational diabetes, macrosomia, pre-pregnancy diabetes, prior A1c or glucose abnormality, PCOS, obesity, steroid exposure, or strong family history?",
      options: "No / Prior GDM / Prior macrosomia / Pre-pregnancy diabetes / Prior abnormal A1c-glucose / PCOS / Obesity / Steroid exposure / Strong family history / Other ___",
      when_to_ask: "Ask when active pregnancy is entered as a modifier on a validated diabetes workup.",
      diagnostic_purpose: "Separates prior GDM, macrosomia, and preexisting diabetes risk from current diabetes symptoms so classification and testing timing are auditable.",
      management_implication: "A positive risk history changes early testing threshold, classification as overt diabetes versus GDM, nutrition and glucose-monitoring intensity, maternal-fetal medicine involvement, and postpartum prevention follow-up.",
      diagnostic_target: "Pregnancy diabetes risk context: prior gestational diabetes, macrosomia, pre-pregnancy diabetes, prior abnormal A1c or glucose, PCOS, obesity, steroid exposure, or strong family history.",
      management_change: "Risk history changes early testing, classification, monitoring intensity, maternal-fetal medicine involvement, and postpartum prevention follow-up.",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "risk_factor", "history_question", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for this risk-history prompt; interpret with guideline criteria, glucose data, and obstetric context."
    },
    {
      id_suffix: "pregnancy_diabetes_fetal_obstetric_history",
      label: "Pregnancy diabetes fetal-obstetric plan history",
      text: "Have fetal growth, estimated fetal weight, amniotic fluid, ultrasound findings, fetal surveillance, delivery timing, or maternal-fetal medicine involvement changed the diabetes plan?",
      options: "No fetal concern documented / Fetal growth concern / Polyhydramnios / Ultrasound concern / Fetal surveillance planned / Delivery timing known / MFM involved / Other ___",
      when_to_ask: "Ask when active pregnancy is entered as a modifier on a validated diabetes workup.",
      diagnostic_purpose: "Clarifies fetal growth, ultrasound, surveillance, delivery-planning, and MFM context that changes diabetes management during pregnancy.",
      management_implication: "Fetal growth or obstetric-plan concerns change maternal-fetal monitoring, nutrition and medication escalation, care-team coordination, delivery planning, and postpartum follow-up.",
      diagnostic_target: "Pregnancy diabetes obstetric context: fetal growth, estimated fetal weight, amniotic fluid, ultrasound concern, fetal surveillance plan, delivery timing, and MFM involvement.",
      management_change: "Fetal growth or obstetric-plan concerns change surveillance, nutrition and medication escalation, delivery planning, and postpartum follow-up.",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "fetal_surveillance", "history_question", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for fetal-obstetric plan context; use it to coordinate guideline-backed maternal-fetal monitoring and escalation."
    }
  ],
  initialTests: [
    {
      id_suffix: "pregnancy_diabetes_ogtt_threshold_pathway",
      label: "Pregnancy diabetes OGTT threshold pathway",
      item_type: "diagnostic_test",
      action: "Route diabetes testing by gestational age: early risk testing when high risk and 24-28 week one-step 75-g OGTT or local two-step strategy when appropriate.",
      rationale: "Pregnancy changes diabetes diagnostic thresholds, screening timing, and interpretation of glucose and A1c results.",
      diagnostic_target: "Pregnancy diabetes test pathway: early risk testing when high risk and gestational-age-appropriate one-step or two-step OGTT interpretation.",
      management_change: "Crossing OGTT thresholds changes maternal-fetal monitoring, nutrition therapy, glucose-monitoring intensity, medication escalation, delivery planning, and postpartum follow-up.",
      options: "Early risk testing if high risk / 24-28 week one-step 75-g OGTT / Local two-step strategy / One-step GDM threshold fasting >=92 mg/dL / 1-hour >=180 mg/dL / 2-hour >=153 mg/dL / Two-step 50-g screen often >=130-140 mg/dL / 100-g Carpenter-Coustan fasting 95, 1-hour 180, 2-hour 155, 3-hour 140 mg/dL / Usually 2 abnormal 100-g values / Other ___",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "ogtt", "diagnostic_test", "reference_threshold", "primary_output_diff"],
      source: { ...pregnancyDiabetesSource, source_id: "ADA_DIAGNOSIS_2026" },
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for these guideline threshold rows; use the cited diagnostic criteria, local assay characteristics, and pretest probability."
    },
    {
      id_suffix: "pregnancy_diabetes_safety_test_pathway",
      label: "Pregnancy diabetes safety-test pathway",
      item_type: "diagnostic_test",
      action: "Review home glucose pattern when available and check ketones, electrolytes/anion gap, creatinine, and acid-base status when vomiting, dehydration, severe hyperglycemia, or insulin-deficiency symptoms are present.",
      rationale: "Active pregnancy lowers tolerance for missed ketosis, dehydration, severe hyperglycemia, and hypertensive disease in a diabetes workup.",
      diagnostic_target: "Pregnancy diabetes safety testing: glucose pattern, ketones, electrolytes/anion gap, creatinine, acid-base status, and hypertensive/preeclampsia context when symptomatic.",
      management_change: "Ketones, acidosis, renal dysfunction, severe hyperglycemia, or preeclampsia features change urgency to obstetric/endocrine evaluation, monitored care, medication adjustment, and maternal-fetal surveillance.",
      options: "Home glucose pattern / Ketones / Electrolytes and anion gap / Creatinine / Acid-base status / Blood pressure and urine protein context when preeclampsia features present / Other ___",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "ketones", "preeclampsia", "diagnostic_test", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for this safety-test bundle; use guideline rationale, labs, vitals, and obstetric context."
    }
  ],
  redFlags: [
    {
      id_suffix: "pregnancy_diabetes_urgent_cues",
      label: "Pregnancy diabetes urgent cues",
      item_type: "red_flag",
      action: "Screen for ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, acidosis or anion-gap concern, hypertension or preeclampsia features, reduced fetal movement, and hemodynamic instability.",
      rationale: "Diabetes plus active pregnancy needs explicit escalation cues because ketosis, severe hyperglycemia, hypertensive disease, and fetal-movement concerns can change disposition quickly.",
      diagnostic_target: "Urgent pregnancy diabetes danger pattern: ketones, vomiting/dehydration, severe hyperglycemia, altered mental status, acidosis, hypertensive/preeclampsia features, reduced fetal movement, or instability.",
      management_change: "These cues change disposition to urgent obstetric/endocrine evaluation, monitored care, DKA/HHS rule-out, fetal assessment, blood-pressure/proteinuria assessment, and medication safety review.",
      options: "Ketones / Vomiting or dehydration / Severe hyperglycemia / Altered mental status / Acidosis or anion gap concern / Hypertension or preeclampsia features / Reduced fetal movement / Hemodynamic instability / Other ___",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "red_flag", "ketones", "preeclampsia", "fetal_movement", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this escalation row; use it to identify urgency and safety risk rather than diagnostic probability.",
      triggered: false,
      included: true
    }
  ],
  dispositionRules: [
    {
      id_suffix: "pregnancy_diabetes_postpartum_follow_up",
      label: "Pregnancy diabetes postpartum follow-up plan",
      item_type: "management_change",
      action: "Plan postpartum 75-g OGTT at 4-12 weeks when pregnancy-associated dysglycemia or diabetes care during pregnancy is present, then hand off long-term diabetes prevention and follow-up.",
      rationale: "Pregnancy-associated dysglycemia changes follow-up even after delivery, so postpartum testing and prevention cannot be buried in generic diabetes counseling.",
      diagnostic_target: "Postpartum diabetes risk and prevention pathway after pregnancy-associated dysglycemia or diabetes care during pregnancy.",
      management_change: "A postpartum 75-g OGTT at 4-12 weeks and long-term prevention plan change follow-up timing, counseling, medication safety review, and handoff to primary care or endocrinology.",
      options: "Postpartum 75-g OGTT at 4-12 weeks / Long-term diabetes prevention / Primary care or endocrine follow-up / Breastfeeding and medication safety review when relevant / Not applicable because still pregnant and immediate obstetric plan pending / Other ___",
      tags: ["diabetes_mellitus", "pregnancy", "gestational_diabetes", "postpartum", "management_change", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this management-change row; use it to connect pregnancy diabetes context to follow-up and prevention decisions."
    }
  ]
};

const postpartumDiabetesFollowUpDefinitions = {
  conditionalQuestions: [
    {
      id_suffix: "postpartum_gdm_follow_up_timing",
      label: "Postpartum GDM follow-up timing",
      text: "How many weeks postpartum are you, was gestational diabetes or pregnancy-associated dysglycemia diagnosed, and has a postpartum 75-g OGTT already been completed?",
      options: "Delivery date/timing unknown / <4 weeks postpartum / 4-12 weeks postpartum / >12 weeks postpartum / GDM or pregnancy dysglycemia documented / OGTT completed / OGTT not completed / Prior type 2 diabetes already diagnosed / Other ___",
      when_to_ask: "Ask when postpartum context is entered with Type 2 diabetes or prediabetes workups after pregnancy-associated dysglycemia or GDM concern.",
      diagnostic_purpose: "Separates postpartum follow-up after GDM or pregnancy-associated dysglycemia from active-pregnancy GDM screening so testing criteria and handoff are auditable.",
      management_implication: "Postpartum timing and prior GDM status change whether to schedule a 4-12 week 75-g OGTT, interpret results with nonpregnancy criteria, route confirmed diabetes/prediabetes treatment, or hand off long-term screening.",
      diagnostic_target: "Postpartum diabetes follow-up context: weeks since delivery, prior GDM or pregnancy-associated dysglycemia, prior postpartum OGTT completion, and existing diabetes diagnosis.",
      management_change: "Changes follow-up timing, OGTT ordering, nonpregnancy diagnostic interpretation, prevention/treatment handoff, and long-term diabetes surveillance.",
      tags: ["diabetes_mellitus", "gestational_diabetes", "postpartum", "history_question", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for postpartum follow-up routing; use this item to route source-backed testing and handoff rather than diagnose diabetes by history alone."
    }
  ],
  initialTests: [
    {
      id_suffix: "postpartum_gdm_ogtt_pathway",
      label: "Postpartum GDM 75-g OGTT pathway",
      item_type: "diagnostic_test",
      action: "For prior GDM or pregnancy-associated dysglycemia, confirm or schedule a fasting 75-g 2-hour OGTT at 4-12 weeks postpartum using clinically appropriate nonpregnancy diagnostic criteria; prefer OGTT over A1c in this early postpartum window.",
      rationale: "Postpartum follow-up after GDM is a distinct pathway from active-pregnancy GDM screening because early postpartum A1c can be affected by pregnancy and delivery physiology.",
      diagnostic_target: "Persistent diabetes or prediabetes after GDM or pregnancy-associated dysglycemia, tested with postpartum 75-g OGTT and nonpregnancy diagnostic criteria.",
      management_change: "An abnormal postpartum OGTT changes diagnosis, prevention or treatment intensity, medication safety review, primary-care/endocrine handoff, and counseling before future pregnancies.",
      options: "4-12 week postpartum 75-g OGTT / Use nonpregnancy criteria / OGTT preferred over A1c in early postpartum window / If already >12 weeks postpartum, arrange catch-up diabetes testing / Other ___",
      tags: ["diabetes_mellitus", "gestational_diabetes", "postpartum", "ogtt", "diagnostic_test", "reference_threshold", "primary_output_diff"],
      source: { ...pregnancyDiabetesSource, source_id: "ADA_DIAGNOSIS_2026", source_section: "Postpartum testing after gestational diabetes" },
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for this postpartum testing pathway; use ADA diagnostic criteria and local laboratory methods."
    }
  ],
  dispositionRules: [
    {
      id_suffix: "postpartum_gdm_long_term_screening",
      label: "Postpartum GDM long-term diabetes screening handoff",
      item_type: "management_change",
      action: "If the 4-12 week postpartum OGTT is normal, document lifelong diabetes screening every 1-3 years; if prediabetes or diabetes is present, route prevention/treatment, medication safety review, and primary-care or endocrine follow-up.",
      rationale: "A history of GDM remains a long-term diabetes-risk state even when the initial postpartum OGTT is normal.",
      diagnostic_target: "Long-term diabetes risk after GDM or pregnancy-associated dysglycemia.",
      management_change: "Changes follow-up interval, prevention counseling, medication review, future pregnancy planning, and responsibility for longitudinal surveillance.",
      options: "Normal postpartum OGTT: screen every 1-3 years / Prediabetes: prevention program and follow-up / Diabetes: treatment and primary-care or endocrine handoff / Future pregnancy planning / Other ___",
      tags: ["diabetes_mellitus", "gestational_diabetes", "postpartum", "long_term_screening", "management_change", "primary_output_diff"],
      source: pregnancyDiabetesSource,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this follow-up handoff row; use it to ensure source-backed surveillance after GDM is not lost."
    }
  ]
};

const postpartumMaternalSafetySources = {
  sepsis: {
    source_id: "SMFM_MATERNAL_SEPSIS_2023",
    source_section: "Pregnant and postpartum sepsis recognition, evaluation, cultures/lactate, broad-spectrum antibiotics, source control, fluids, vasopressors, VTE prophylaxis, and survivor support",
    evidence_strength: "specialty society consult/guideline",
    version_date: "2023",
    last_reviewed: "2026-06-08",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Modifier-triggered postpartum sepsis add-on; use with validated fever/sepsis output and local maternal sepsis protocols."
  },
  warningSigns: {
    source_id: "CDC_HEAR_HER_WARNING_SIGNS_2024",
    source_section: "Urgent maternal warning signs during pregnancy and within 1 year after delivery",
    evidence_strength: "public health warning-sign guidance",
    version_date: "2024",
    last_reviewed: "2026-06-08",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Use as warning-sign and escalation context; not a diagnostic rule."
  },
  rcogVte: {
    source_id: "RCOG_VTE_PUERPERIUM_2015",
    source_section: "Immediate investigation and management of suspected venous thromboembolism during pregnancy or the puerperium",
    evidence_strength: "guideline",
    version_date: "2015",
    last_reviewed: "2026-06-08",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Use to keep suspected postpartum PE/DVT in a validated VTE pathway; review local imaging and anticoagulation protocols."
  },
  ashVte: {
    source_id: "ASH_VTE_PREGNANCY_2018",
    source_section: "Diagnosis, prevention, and treatment of VTE during and after pregnancy",
    evidence_strength: "guideline",
    version_date: "2018",
    last_reviewed: "2026-06-08",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Use for pregnancy/postpartum VTE context and anticoagulation risk framing; apply local protocols for imaging and treatment."
  }
};

const postpartumMaternalSafetyDefinitions = {
  conditionalQuestions: [
    {
      id_suffix: "postpartum_infection_source_warning_history",
      intent_ids: ["fever_sepsis_v1"],
      label: "Postpartum infection source and warning-sign screen",
      text: "Postpartum multi-select: how many days or weeks since delivery, and are there fever >=100.4 F, uterine or pelvic pain, foul lochia, C-section or perineal wound symptoms, breast pain/redness, urinary symptoms, severe headache or vision change, dyspnea, chest pain, dizziness, or fainting?",
      options: "Timing unknown / <7 days postpartum / 1-6 weeks postpartum / 6 weeks-1 year postpartum / Fever >=100.4 F / Uterine or pelvic pain / Foul lochia / C-section or perineal wound concern / Breast pain or redness / Dysuria or flank pain / Severe headache or vision change / Dyspnea or chest pain / Dizziness or fainting / Other ___",
      when_to_ask: "Ask when postpartum context is entered with a validated fever, infection, or sepsis workup.",
      diagnostic_purpose: "Localizes postpartum infection source and urgent maternal warning signs without treating postpartum status as a generic fever modifier.",
      management_implication: "Positive uterine, wound, breast, urinary, cardiopulmonary, neurologic, or syncope warning signs change source workup, urgency, maternal sepsis protocol activation, OB/MFM contact, and disposition.",
      diagnostic_target: "Postpartum infection source and urgent maternal warning-sign context after recent delivery.",
      management_change: "Changes microbiologic testing, lactate/source-control urgency, empiric antibiotic urgency, OB/MFM handoff, and disposition.",
      tags: ["postpartum", "maternal_sepsis", "infection_source", "warning_sign", "history_question", "primary_output_diff"],
      source: postpartumMaternalSafetySources.warningSigns,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for this postpartum warning-sign screen; use it to localize source and escalation needs, then apply sepsis criteria, cultures, lactate, and source control."
    },
    {
      id_suffix: "postpartum_vte_symptom_risk_history",
      intent_ids: ["suspected_pe_v1"],
      label: "Postpartum VTE symptoms and risk history",
      text: "Postpartum multi-select: how many days or weeks since delivery, and are there sudden dyspnea, pleuritic chest pain, hemoptysis, syncope, unilateral leg symptoms, cesarean delivery, immobility, hemorrhage/transfusion, preeclampsia, thrombophilia, prior VTE, current anticoagulation, or breastfeeding medication-safety needs?",
      options: "Timing unknown / <7 days postpartum / 1-6 weeks postpartum / 6 weeks-1 year postpartum / Sudden dyspnea / Pleuritic chest pain / Hemoptysis / Syncope or presyncope / Unilateral leg swelling or pain / Cesarean delivery / Immobility / Hemorrhage or transfusion / Preeclampsia / Thrombophilia or prior VTE / Current anticoagulation / Breastfeeding medication-safety need / Other ___",
      when_to_ask: "Ask when postpartum context is entered with a validated suspected PE workup.",
      diagnostic_purpose: "Separates postpartum VTE symptoms, provoking factors, bleeding/anticoagulation state, and lactation medication-safety context from generic PE history.",
      management_implication: "Positive PE/DVT symptoms or postpartum risk factors change imaging threshold, compression-ultrasound use when leg symptoms are present, anticoagulation safety review, OB/MFM or hematology contact, and disposition.",
      diagnostic_target: "Postpartum pulmonary embolism or DVT risk and anticoagulation-safety context.",
      management_change: "Changes VTE diagnostic pathway, anticoagulation planning, breastfeeding-safe medication review, consultation, and disposition.",
      tags: ["postpartum", "puerperium", "vte", "pulmonary_embolism", "dvt", "anticoagulation_safety", "history_question", "primary_output_diff"],
      source: postpartumMaternalSafetySources.rcogVte,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for this postpartum VTE screen; use it to set pretest concern, bleeding risk, and diagnostic pathway rather than rule PE in or out."
    }
  ],
  initialTests: [
    {
      id_suffix: "postpartum_sepsis_lactate_culture_source_control",
      intent_ids: ["fever_sepsis_v1"],
      label: "Postpartum sepsis lactate, cultures, and source-control pathway",
      item_type: "diagnostic_test",
      action: "For postpartum suspected sepsis, obtain lactate and evaluate infectious and noninfectious organ dysfunction; obtain blood and source-directed cultures before antibiotics when this will not delay treatment; rapidly identify or exclude an anatomic source and source-control need.",
      rationale: "SMFM recommends maternal sepsis be treated as a medical emergency in pregnant or postpartum patients, with lactate, cultures when feasible, timely broad-spectrum antibiotics, and rapid anatomic source evaluation.",
      diagnostic_target: "Maternal sepsis or septic shock after delivery, including uterine, wound, urinary, breast, respiratory, retained-product, or noninfectious organ-dysfunction mimics.",
      management_change: "Positive lactate, organ dysfunction, suspected uterine/source-control need, or high likelihood of sepsis changes urgency to maternal sepsis protocol, broad-spectrum antibiotics ideally within 1 hour, fluids/vasopressors per protocol, and OB/MFM escalation.",
      options: "Serum lactate / Blood cultures before antibiotics if no delay / Source-directed cultures / CBC and CMP / Urinalysis and urine culture / Wound or breast source evaluation / Imaging for source control when indicated / Broad-spectrum antibiotics ideally within 1 hour if high likelihood or shock / Other ___",
      tags: ["postpartum", "maternal_sepsis", "lactate", "blood_culture", "source_control", "diagnostic_test", "primary_output_diff"],
      source: postpartumMaternalSafetySources.sepsis,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for this pathway row; use guideline sepsis criteria, lactate, cultures, organ dysfunction, and source-control findings."
    },
    {
      id_suffix: "postpartum_vte_diagnostic_pathway",
      intent_ids: ["suspected_pe_v1"],
      label: "Postpartum PE/DVT diagnostic and anticoagulation-safety pathway",
      item_type: "diagnostic_test",
      action: "For postpartum suspected PE, keep the patient in a validated VTE pathway: assess hemodynamics and oxygenation, evaluate DVT symptoms with compression ultrasound when present, select chest imaging per local pregnancy/postpartum protocol, and review anticoagulation, bleeding, neuraxial, procedure, and breastfeeding safety before treatment decisions.",
      rationale: "Pregnancy and the puerperium are reviewed VTE contexts; suspected postpartum PE needs immediate investigation rather than reassurance from nonspecific postpartum symptoms.",
      diagnostic_target: "Postpartum pulmonary embolism or DVT and treatment safety constraints.",
      management_change: "Positive DVT imaging, high PE concern, hypoxemia, hemodynamic compromise, or anticoagulation contraindication changes imaging, monitoring level, anticoagulation route, consultation, and disposition.",
      options: "Hemodynamic and oxygenation assessment / Compression ultrasound when leg symptoms present / Chest imaging per local protocol / Anticoagulation contraindication review / Recent neuraxial or procedure timing / Bleeding or hemorrhage risk / Breastfeeding medication-safety review / OB/MFM or hematology contact / Other ___",
      tags: ["postpartum", "puerperium", "vte", "pulmonary_embolism", "dvt", "diagnostic_test", "anticoagulation_safety", "primary_output_diff"],
      source: postpartumMaternalSafetySources.ashVte,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for this postpartum VTE pathway row; interpret imaging and clinical probability with cited guideline context and local protocol."
    }
  ],
  redFlags: [
    {
      id_suffix: "postpartum_urgent_maternal_warning_cues",
      intent_ids: ["fever_sepsis_v1", "suspected_pe_v1"],
      label: "Postpartum urgent maternal warning cues",
      item_type: "red_flag",
      action: "Escalate immediately for fever >=100.4 F, dyspnea, chest pain, syncope or persistent dizziness, severe headache, vision changes, extreme face/hand swelling, altered mental status, hypotension, hypoxemia, uterine/pelvic pain with systemic illness, or concern that something is seriously wrong within 1 year after delivery.",
      rationale: "CDC warning signs and maternal sepsis/VTE guidance emphasize that pregnancy-related complications can occur after delivery and may be life-threatening.",
      diagnostic_target: "Postpartum warning-sign pattern requiring urgent maternal evaluation, including sepsis, PE/DVT, hypertensive disease, cardiopulmonary disease, hemorrhage, or neurologic danger.",
      management_change: "These cues change disposition to urgent evaluation or monitored care, maternal sepsis/VTE/hypertensive pathway selection, OB/MFM communication, and explicit return precautions.",
      options: "Fever >=100.4 F / Dyspnea / Chest pain / Syncope or persistent dizziness / Severe headache / Vision change / Extreme face or hand swelling / Altered mental status / Hypotension or hypoxemia / Uterine or pelvic pain with systemic illness / Patient says something is seriously wrong / Other ___",
      tags: ["postpartum", "maternal_warning_sign", "sepsis", "pulmonary_embolism", "hypertensive_disorder", "red_flag", "primary_output_diff"],
      source: postpartumMaternalSafetySources.warningSigns,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this warning-sign row; use it to avoid delayed recognition and to route urgent evaluation."
    }
  ],
  dispositionRules: [
    {
      id_suffix: "postpartum_ob_mfm_handoff",
      intent_ids: ["fever_sepsis_v1", "suspected_pe_v1"],
      label: "Postpartum OB/MFM safety handoff",
      item_type: "management_change",
      action: "Document postpartum timing, delivery type, delivery complications, lactation or medication-safety needs, warning signs reviewed, maternal sepsis/VTE pathway decisions, OB/MFM or hematology contacts, and follow-up or return precautions.",
      rationale: "Postpartum status changes safety handoff even when the presenting syndrome is fever or PE; delayed recognition and poor handoff contribute to preventable maternal harm.",
      diagnostic_target: "Postpartum disposition readiness and maternal safety follow-up after fever/sepsis or suspected PE evaluation.",
      management_change: "Changes consultation, medication selection, breastfeeding safety review, monitoring, discharge readiness, and return precautions.",
      options: "Postpartum timing documented / Delivery type documented / Delivery complications documented / Lactation medication-safety review / OB or MFM contacted / Hematology contacted for VTE / Return precautions reviewed / Follow-up arranged / Monitored disposition needed / Other ___",
      tags: ["postpartum", "maternal_safety", "handoff", "ob_mfm", "vte", "sepsis", "management_change", "primary_output_diff"],
      source: postpartumMaternalSafetySources.warningSigns,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this handoff row; use it to make postpartum safety consequences explicit."
    }
  ]
};

const olderAdultSafetySources = {
  steadi: {
    source_id: "CDC_STEADI_2025",
    source_section: "Older adult fall-risk screening, functional assessment, orthostatic blood pressure, and medication review resources",
    evidence_strength: "public health/clinical implementation guidance",
    version_date: "2025",
    last_reviewed: "2026-06-09",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Modifier-triggered older-adult safety add-on; use to adjust bedside risk assessment, not to diagnose the presenting syndrome."
  },
  beers: {
    source_id: "AGS_BEERS_2023",
    source_section: "Potentially inappropriate medication use in older adults, disease/syndrome interactions, renal dosing, and medication combinations",
    evidence_strength: "expert consensus/guideline",
    version_date: "2023",
    last_reviewed: "2026-06-09",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Use as medication-safety review support; do not use as an automatic stop-order without patient-specific clinician judgment."
  },
  delirium: {
    source_id: "NICE_DELIRIUM_CG103",
    source_section: "Delirium risk factors and prevention in hospital or long-term care, including age 65 years or older",
    evidence_strength: "guideline",
    version_date: "2023 surveillance",
    last_reviewed: "2026-06-09",
    clinical_owner: "general_medicine_content_review",
    implementation_notes: "Use to surface delirium risk, cognitive baseline, severe illness, and reversible contributor assessment."
  }
};

const olderAdultSafetyAddOnDefinitions = {
  safetyChecks: [
    {
      id_suffix: "older_adult_orthostatic_bp",
      label: "Measure orthostatic blood pressure",
      item_type: "safety_check",
      action: "Measure supine or seated and standing blood pressure and heart-rate response when safe, especially with falls, syncope, dizziness, dehydration, antihypertensives, sedatives, or acute illness.",
      rationale: "Orthostatic hypotension is a modifiable older-adult fall and syncope risk and can change medication, fluid, monitoring, and disposition decisions.",
      diagnostic_target: "Orthostatic hypotension, volume depletion, medication effect, autonomic dysfunction, and fall/syncope risk in older adults.",
      management_change: "A positive or unsafe orthostatic assessment changes fall precautions, medication review, fluid strategy, PT/OT needs, and discharge safety planning.",
      options: "Normal / Systolic drop >=20 or diastolic drop >=10 / Symptomatic / Unable unsafe / Not indicated now / Other ___",
      tags: ["older_adult", "geriatric", "fall_risk", "orthostatic_hypotension", "safety_check", "primary_output_diff"],
      source: olderAdultSafetySources.steadi,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for this safety check; use it as fall/syncope risk and medication-safety assessment rather than disease diagnosis."
    }
  ],
  conditionalQuestions: [
    {
      id_suffix: "older_adult_baseline_function_cognition_falls",
      label: "Older-adult baseline function, cognition, and falls",
      text: "What is baseline cognition and function, and are there recent falls, mobility changes, caregiver gaps, sensory impairment, or new delirium concerns?",
      options: "Baseline independent / Needs ADL help / Cognitive impairment or dementia / Acute confusion from baseline / Recent fall / Fear of falling / Uses walker/cane / Caregiver or home-safety gap / Hearing/vision barrier / Other ___",
      when_to_ask: "Ask when older-adult, geriatric, frailty, or age >=65 context is entered with a validated adult workup.",
      diagnostic_purpose: "Separates baseline function and cognition from acute symptoms so delirium, fall risk, and discharge safety are not missed.",
      management_implication: "New confusion, recent fall, functional decline, or unsafe support changes delirium workup, fall precautions, medication review, PT/OT, caregiver planning, and disposition.",
      diagnostic_target: "Older-adult vulnerability context: baseline cognition, ADLs, mobility, falls, sensory barriers, caregiver support, and acute delirium concern.",
      management_change: "Changes risk stratification, safety precautions, consult needs, medication review, and discharge planning.",
      tags: ["older_adult", "geriatric", "frailty", "delirium", "fall_risk", "history_question", "primary_output_diff"],
      source: olderAdultSafetySources.delirium,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Question-level LR+/LR- is not available for this older-adult routing prompt; use it to identify delirium/fall/disposition modifiers and then apply condition-specific diagnostic criteria."
    },
    {
      id_suffix: "older_adult_medication_fall_delirium_risk",
      label: "Older-adult medication fall and delirium risk",
      text: "Any high-risk medicines, recent dose changes, polypharmacy, renal-dose concerns, hypoglycemia risk, anticoagulants, sedatives, anticholinergics, opioids, or alcohol/substance exposure?",
      options: "No high-risk medicine identified / >=4 medicines / Recent medication change / Anticoagulant or antiplatelet / Benzodiazepine or sedative-hypnotic / Opioid / Anticholinergic / Insulin or sulfonylurea / Renal-dose concern / Alcohol or substance exposure / Other ___",
      when_to_ask: "Ask when older-adult, geriatric, frailty, or age >=65 context is entered with a validated adult workup.",
      diagnostic_purpose: "Identifies medication contributors to falls, delirium, bleeding, hypoglycemia, orthostasis, sedation, and renal toxicity.",
      management_implication: "High-risk medicines or renal-dose mismatch changes medication reconciliation, deprescribing/substitution review, monitoring, antidote/reversal planning, and discharge safety.",
      diagnostic_target: "Medication-related fall, delirium, bleeding, hypoglycemia, orthostatic, sedation, or renal-dose risk in older adults.",
      management_change: "Changes medication reconciliation, pharmacy review, monitoring intensity, and discharge medication plan.",
      tags: ["older_adult", "geriatric", "beers_criteria", "polypharmacy", "medication_safety", "history_question", "primary_output_diff"],
      source: olderAdultSafetySources.beers,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not available for this medication-safety screen; use AGS Beers/source rationale and patient-specific clinician judgment."
    }
  ],
  initialTests: [
    {
      id_suffix: "older_adult_medication_renal_dose_review",
      label: "Older-adult medication and renal-dose safety review",
      item_type: "diagnostic_test",
      action: "Review the active medication list, recent dose changes, anticholinergic/sedative/opioid burden, anticoagulation, hypoglycemia-risk drugs, and renal function before finalizing testing or disposition.",
      rationale: "Older adults have higher risk from medication adverse effects, drug-disease interactions, combinations, and reduced kidney function; medication review changes interpretation and safety.",
      diagnostic_target: "Medication-related delirium, fall, bleeding, hypoglycemia, sedation, orthostasis, and renal-dose risk.",
      management_change: "Abnormal review changes drug holds/substitution, renal dosing, monitoring, reversal planning, pharmacy consultation, and safe discharge medication instructions.",
      options: "Medication reconciliation complete / Recent dose change / Anticholinergic burden / Sedative or opioid / Anticoagulant bleeding risk / Insulin-sulfonylurea hypoglycemia risk / eGFR dose issue / Pharmacy review needed / Other ___",
      tags: ["older_adult", "geriatric", "beers_criteria", "medication_safety", "renal_dosing", "diagnostic_test", "primary_output_diff"],
      source: olderAdultSafetySources.beers,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not encoded for medication review; use this source-backed safety step to change management, monitoring, and discharge planning."
    }
  ],
  redFlags: [
    {
      id_suffix: "older_adult_delirium_fall_escalation_cues",
      label: "Older-adult delirium, fall, and unsafe-disposition cues",
      item_type: "red_flag",
      action: "Escalate or broaden evaluation for acute confusion from baseline, inability to ambulate safely, fall with head trauma or anticoagulation, syncope, suspected dehydration, severe illness, uncontrolled pain, or absent safe caregiver/home support.",
      rationale: "Older adults may present with functional decline or delirium rather than classic symptoms, and falls or unsafe support can change disposition even when the disease-specific workup is otherwise routine.",
      diagnostic_target: "Delirium, serious injury, severe illness, unsafe mobility, medication toxicity, or unsafe discharge context.",
      management_change: "These cues change monitoring level, imaging/lab threshold, medication review, PT/OT or pharmacy consultation, caregiver planning, and disposition.",
      options: "Acute confusion / Cannot ambulate safely / Fall with head trauma / Anticoagulated fall / Syncope / Dehydration concern / Severe illness / Unsafe home or caregiver gap / Other ___",
      tags: ["older_adult", "geriatric", "delirium", "fall_risk", "unsafe_disposition", "red_flag", "primary_output_diff"],
      source: olderAdultSafetySources.delirium,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this escalation row; use it to avoid missing disposition-changing geriatric safety risk."
    }
  ],
  dispositionRules: [
    {
      id_suffix: "older_adult_discharge_safety_handoff",
      label: "Older-adult function, falls, and medication-safety handoff",
      item_type: "management_change",
      action: "Document baseline function/cognition, fall risk, orthostatic findings, high-risk medicines, renal-dose concerns, caregiver support, and PT/OT/pharmacy follow-up needs before discharge or outpatient handoff.",
      rationale: "Older-adult safety modifiers often change the next clinician's plan even when the presenting diagnosis is unchanged.",
      diagnostic_target: "Disposition readiness and longitudinal safety after an acute adult workup in an older adult.",
      management_change: "Changes discharge readiness, medication plan, PT/OT or pharmacy referral, caregiver instructions, follow-up timing, and need for monitored care.",
      options: "Baseline function documented / Delirium risk documented / Fall precautions or PT/OT / Medication changes reviewed / Renal-dose follow-up / Caregiver/home support confirmed / Monitored disposition needed / Other ___",
      tags: ["older_adult", "geriatric", "fall_risk", "medication_safety", "disposition", "management_change", "primary_output_diff"],
      source: olderAdultSafetySources.steadi,
      LR_plus: "n/a",
      LR_minus: "n/a",
      likelihood_ratio_note: "Likelihood ratios are not applicable to this management handoff row; use it to make safety consequences explicit."
    }
  ]
};

function pregnancyDiabetesPrimaryOutputActive(contextText = "", module = {}) {
  const normalized = normalizeComplaintText(contextText);
  return pregnancyDiabetesPrimaryOutputModuleIds.has(module?.id)
    && activePregnancyModifierPattern.test(normalized)
    && !nonActivePregnancyModifierPattern.test(normalized);
}

function postpartumDiabetesFollowUpActive(contextText = "", module = {}) {
  const normalized = normalizeComplaintText(contextText);
  return postpartumDiabetesFollowUpModuleIds.has(module?.id)
    && postpartumModifierPattern.test(normalized)
    && !activePregnancyModifierPattern.test(normalized);
}

function postpartumMaternalSafetyAddOnActive(contextText = "", module = {}, traceContext = {}) {
  const normalized = normalizeComplaintText(contextText);
  const intentIds = (traceContext.intentTrace || []).map((intentRow) => intentRow.intent_id).filter(Boolean);
  return postpartumModifierPattern.test(normalized)
    && !activePregnancyModifierPattern.test(normalized)
    && intentIds.some((intentId) => postpartumMaternalSafetyIntentIds.has(intentId));
}

function olderAdultSafetyAddOnActive(contextText = "", module = {}) {
  const normalized = normalizeComplaintText(contextText);
  const moduleAgeGroup = normalizeComplaintText(module?.applicability?.age_group || module?.population?.age_group || "");
  return olderAdultModifierPattern.test(normalized)
    && (moduleAgeGroup.includes("adult") || !moduleAgeGroup);
}

function tracedPregnancyDiabetesAddOnItem(definition = {}, module = {}, group = "", traceContext = {}) {
  const item = {
    ...definition,
    id: `${module.id || "diabetes_module"}_${definition.id_suffix}`,
    modifier_add_on_id: "pregnancy_diabetes_context_primary_output",
    activated_by_modifier: "currently pregnant"
  };
  const normalized = group === "conditionalQuestions"
    ? normalizeEvaluatedQuestionItem(item, group)
    : item;
  return traceComplaintCdsItem(normalized, module, group, traceContext.intentTrace, traceContext.authorizedBy);
}

function tracedPostpartumDiabetesAddOnItem(definition = {}, module = {}, group = "", traceContext = {}) {
  const item = {
    ...definition,
    id: `${module.id || "diabetes_module"}_${definition.id_suffix}`,
    modifier_add_on_id: "postpartum_gdm_follow_up_primary_output",
    activated_by_modifier: "postpartum"
  };
  const normalized = group === "conditionalQuestions"
    ? normalizeEvaluatedQuestionItem(item, group)
    : item;
  return traceComplaintCdsItem(normalized, module, group, traceContext.intentTrace, traceContext.authorizedBy);
}

function tracedPostpartumMaternalSafetyAddOnItem(definition = {}, module = {}, group = "", traceContext = {}) {
  const item = {
    ...definition,
    id: `${module.id || "postpartum_module"}_${definition.id_suffix}`,
    modifier_add_on_id: "postpartum_maternal_safety_primary_output",
    activated_by_modifier: "postpartum"
  };
  const normalized = group === "conditionalQuestions"
    ? normalizeEvaluatedQuestionItem(item, group)
    : item;
  return traceComplaintCdsItem(normalized, module, group, traceContext.intentTrace, traceContext.authorizedBy);
}

function tracedOlderAdultSafetyAddOnItem(definition = {}, module = {}, group = "", traceContext = {}) {
  const item = {
    ...definition,
    id: `${module.id || "adult_module"}_${definition.id_suffix}`,
    modifier_add_on_id: "older_adult_safety_primary_output",
    activated_by_modifier: "older adult"
  };
  const normalized = group === "conditionalQuestions"
    ? normalizeEvaluatedQuestionItem(item, group)
    : item;
  return traceComplaintCdsItem(normalized, module, group, traceContext.intentTrace, traceContext.authorizedBy);
}

function pregnancyDiabetesPrimaryOutputAddOns(module = {}, conditionalContext = "", traceContext = {}) {
  if (!pregnancyDiabetesPrimaryOutputActive(conditionalContext, module)) {
    return {
      active: false,
      activeClinicalAddOns: [],
      safetyChecks: [],
      conditionalQuestions: [],
      initialTests: [],
      redFlags: [],
      dispositionRules: []
    };
  }
  const mapGroup = (group) => pregnancyDiabetesPrimaryOutputDefinitions[group]
    .map((definition) => tracedPregnancyDiabetesAddOnItem(definition, module, group, traceContext));
  return {
    active: true,
    activeClinicalAddOns: ["pregnancy_diabetes_context_primary_output"],
    safetyChecks: [],
    conditionalQuestions: mapGroup("conditionalQuestions"),
    initialTests: mapGroup("initialTests"),
    redFlags: mapGroup("redFlags"),
    dispositionRules: mapGroup("dispositionRules")
  };
}

function postpartumDiabetesFollowUpAddOns(module = {}, conditionalContext = "", traceContext = {}) {
  if (!postpartumDiabetesFollowUpActive(conditionalContext, module)) {
    return {
      active: false,
      activeClinicalAddOns: [],
      safetyChecks: [],
      conditionalQuestions: [],
      initialTests: [],
      redFlags: [],
      dispositionRules: []
    };
  }
  const mapGroup = (group) => postpartumDiabetesFollowUpDefinitions[group]
    .map((definition) => tracedPostpartumDiabetesAddOnItem(definition, module, group, traceContext));
  return {
    active: true,
    activeClinicalAddOns: ["postpartum_gdm_follow_up_primary_output"],
    safetyChecks: [],
    conditionalQuestions: mapGroup("conditionalQuestions"),
    initialTests: mapGroup("initialTests"),
    redFlags: [],
    dispositionRules: mapGroup("dispositionRules")
  };
}

function postpartumMaternalSafetyAddOns(module = {}, conditionalContext = "", traceContext = {}) {
  if (!postpartumMaternalSafetyAddOnActive(conditionalContext, module, traceContext)) {
    return {
      active: false,
      activeClinicalAddOns: [],
      safetyChecks: [],
      conditionalQuestions: [],
      initialTests: [],
      redFlags: [],
      dispositionRules: []
    };
  }
  const intentIds = new Set((traceContext.intentTrace || []).map((intentRow) => intentRow.intent_id).filter(Boolean));
  const forActiveIntent = (definition = {}) => {
    const allowed = definition.intent_ids || [];
    return !allowed.length || allowed.some((intentId) => intentIds.has(intentId));
  };
  const mapGroup = (group) => postpartumMaternalSafetyDefinitions[group]
    .filter(forActiveIntent)
    .map((definition) => tracedPostpartumMaternalSafetyAddOnItem(definition, module, group, traceContext));
  return {
    active: true,
    activeClinicalAddOns: ["postpartum_maternal_safety_primary_output"],
    safetyChecks: [],
    conditionalQuestions: mapGroup("conditionalQuestions"),
    initialTests: mapGroup("initialTests"),
    redFlags: mapGroup("redFlags"),
    dispositionRules: mapGroup("dispositionRules")
  };
}

function olderAdultSafetyAddOns(module = {}, conditionalContext = "", traceContext = {}) {
  if (!olderAdultSafetyAddOnActive(conditionalContext, module)) {
    return {
      active: false,
      activeClinicalAddOns: [],
      safetyChecks: [],
      conditionalQuestions: [],
      initialTests: [],
      redFlags: [],
      dispositionRules: []
    };
  }
  const mapGroup = (group) => olderAdultSafetyAddOnDefinitions[group]
    .map((definition) => tracedOlderAdultSafetyAddOnItem(definition, module, group, traceContext));
  return {
    active: true,
    activeClinicalAddOns: ["older_adult_safety_primary_output"],
    safetyChecks: mapGroup("safetyChecks"),
    conditionalQuestions: mapGroup("conditionalQuestions"),
    initialTests: mapGroup("initialTests"),
    redFlags: mapGroup("redFlags"),
    dispositionRules: mapGroup("dispositionRules")
  };
}

export function evaluateComplaintCds(inputText = "", answers = {}, options = {}) {
  const module = options.module || selectComplaintModule(inputText, options.modules || complaintModules);
  const sources = options.sources || complaintSourceRegistry;
  if (!module) {
    const unsupportedClinicalIntentGap = buildUnsupportedClinicalIntentGap({
      query: inputText,
      modifiers: options.modifiers || options.patientModifiers || "",
      setting: options.setting || "",
      population: options.population || "",
      reviewer: options.reviewer || "local_reviewer"
    });
    return {
      matched: false,
      unsupported: true,
      finalRecommendationAuthorized: false,
      authorizationStatus: "unsupported_gap",
      inputText,
      sanitizedInputText: unsupportedClinicalIntentGap.sanitized_query,
      unsupportedClinicalIntentGap,
      catalogGapsNeedingReview: [unsupportedClinicalIntentGap],
      catalogGaps: [unsupportedClinicalIntentGap],
      suppressedNotRecommendedItems: [],
      suppressedItems: [],
      sourceIds: [],
      sources: [],
      modules: options.modules || complaintModules,
      plannedModules: plannedComplaintModules,
      message: "No validated clinical intent or complaint module matched in the installed medical knowledge database. No recommendations are authorized."
    };
  }

  const traceContext = complaintTraceContext(inputText, module, options);
  const conditionalContext = patientFactContextForConditionalItems(inputText, options);
  const pregnancyDiabetesAddOns = pregnancyDiabetesPrimaryOutputAddOns(module, conditionalContext, traceContext);
  const postpartumDiabetesAddOns = postpartumDiabetesFollowUpAddOns(module, conditionalContext, traceContext);
  const postpartumMaternalAddOns = postpartumMaternalSafetyAddOns(module, conditionalContext, traceContext);
  const olderAdultAddOns = olderAdultSafetyAddOns(module, conditionalContext, traceContext);
  const includedRequiredQuestions = includeItems(module.requiredQuestions, conditionalContext, answers, "requiredQuestions", traceContext);
  const includedConditionalQuestions = includeItems(module.conditionalQuestions, conditionalContext, answers, "conditionalQuestions", traceContext);
  const promotedQuestions = promoteIntentActivatedConditionalQuestions(includedRequiredQuestions, includedConditionalQuestions, traceContext);
  const atomizedRequiredQuestionCandidates = atomizeBroadHistoryQuestions(promotedQuestions.requiredQuestions, "requiredQuestions");
  const atomizedConditionalQuestionCandidates = atomizeBroadHistoryQuestions([
    ...promotedQuestions.conditionalQuestions,
    ...pregnancyDiabetesAddOns.conditionalQuestions,
    ...postpartumDiabetesAddOns.conditionalQuestions,
    ...postpartumMaternalAddOns.conditionalQuestions,
    ...olderAdultAddOns.conditionalQuestions,
    ...infectionModifierHistoryFloorQuestions(
      module,
      [...atomizedRequiredQuestionCandidates, ...promotedQuestions.conditionalQuestions],
      conditionalContext,
      traceContext
    )
  ], "conditionalQuestions");
  const dedupedQuestions = dedupeHistoryQuestionsByDomain(atomizedRequiredQuestionCandidates, atomizedConditionalQuestionCandidates);
  const requiredQuestions = dedupedQuestions.requiredQuestions;
  const conditionalQuestions = dedupedQuestions.conditionalQuestions;
  const explicitSafetyChecks = [
    ...includeItems(module.safetyChecks, conditionalContext, answers, "safetyChecks", traceContext),
    ...olderAdultAddOns.safetyChecks
  ];
  const explicitSafetyGroups = partitionExplicitSafetyChecks(explicitSafetyChecks);
  const includedRequiredExam = includeItems(module.requiredExam, conditionalContext, answers, "requiredExam", traceContext);
  const includedConditionalExam = includeItems(module.conditionalExam, conditionalContext, answers, "conditionalExam", traceContext);
  const requiredExamGroups = partitionBedsideExamItems(includedRequiredExam);
  const conditionalExamGroups = partitionBedsideExamItems(includedConditionalExam);
  const requiredSafetyChecks = [...explicitSafetyGroups.requiredSafetyChecks, ...requiredExamGroups.safetyChecks];
  const conditionalSafetyChecks = [...explicitSafetyGroups.conditionalSafetyChecks, ...conditionalExamGroups.safetyChecks];
  const requiredExam = requiredExamGroups.examManeuvers;
  const conditionalExam = conditionalExamGroups.examManeuvers;
  const initialTests = [
    ...includeItems(module.initialTests, conditionalContext, answers, "initialTests", traceContext),
    ...pregnancyDiabetesAddOns.initialTests,
    ...postpartumDiabetesAddOns.initialTests,
    ...postpartumMaternalAddOns.initialTests,
    ...olderAdultAddOns.initialTests
  ];
  const dispositionRules = [
    ...includeItems(module.dispositionRules, conditionalContext, answers, "dispositionRules", traceContext),
    ...pregnancyDiabetesAddOns.dispositionRules,
    ...postpartumDiabetesAddOns.dispositionRules,
    ...postpartumMaternalAddOns.dispositionRules,
    ...olderAdultAddOns.dispositionRules
  ];
  const decisionTrees = includeItems(module.decisionTrees, conditionalContext, answers, "decisionTrees", traceContext);
  const treatmentOptions = includeItems(module.treatmentOptions, conditionalContext, answers, "treatmentOptions", traceContext);
  const redFlags = [
    ...evaluateRedFlags(module.redFlags, conditionalContext, answers)
      .map((item) => traceComplaintCdsItem(item, module, "redFlags", traceContext.intentTrace, traceContext.authorizedBy)),
    ...pregnancyDiabetesAddOns.redFlags,
    ...postpartumMaternalAddOns.redFlags,
    ...olderAdultAddOns.redFlags
  ];
  const triggeredRedFlags = redFlags.filter((item) => item.triggered);
  const differentialBuckets = (module.differentialBuckets || [])
    .map((item) => traceComplaintCdsItem(item, module, "differentialBuckets", traceContext.intentTrace, traceContext.authorizedBy));
  const allIncluded = [
    ...requiredQuestions,
    ...conditionalQuestions,
    ...explicitSafetyChecks,
    ...includedRequiredExam,
    ...includedConditionalExam,
    ...initialTests,
    ...dispositionRules,
    ...decisionTrees,
    ...treatmentOptions,
    ...redFlags,
    ...differentialBuckets
  ];
  const limitationsAndInterpretationCautions = [
    ...limitationCautionsFromItems([
      ...requiredSafetyChecks,
      ...conditionalSafetyChecks,
      ...requiredExam,
      ...conditionalExam,
      ...initialTests,
      ...dispositionRules,
      ...decisionTrees,
      ...treatmentOptions,
      ...redFlags,
      ...differentialBuckets
    ]),
    ...moduleExamScopeCautions(module, requiredExam, conditionalExam, traceContext)
  ];
  const suppressedNotRecommendedItems = suppressedItemsFromValidatedIntents(traceContext.intentTrace, module);
  const catalogGapsNeedingReview = catalogGapItemsFromOptions([
    ...(options.catalogGapsNeedingReview || options.catalogGaps || []),
    ...moduleConditionalExamCompletenessGaps(traceContext)
  ], traceContext);
  const resultSourceIds = uniqueSourceIds([
    ...allIncluded,
    ...limitationsAndInterpretationCautions,
    ...suppressedNotRecommendedItems,
    ...catalogGapsNeedingReview
  ]);

  return {
    matched: true,
    inputText,
    module,
    answers,
    redFlags,
    triggeredRedFlags,
    requiredQuestions,
    conditionalQuestions,
    requiredSafetyChecks,
    conditionalSafetyChecks,
    safetyChecks: [...requiredSafetyChecks, ...conditionalSafetyChecks],
    requiredExam,
    conditionalExam,
    focusedExam: [...requiredExam, ...conditionalExam],
    initialTests,
    dispositionRules,
    decisionTrees,
    treatmentOptions,
    limitationsAndInterpretationCautions,
    suppressedNotRecommendedItems,
    suppressedItems: suppressedNotRecommendedItems,
    catalogGapsNeedingReview,
    catalogGaps: catalogGapsNeedingReview,
    differentialBuckets,
    activeClinicalAddOns: [
      ...pregnancyDiabetesAddOns.activeClinicalAddOns,
      ...postpartumDiabetesAddOns.activeClinicalAddOns,
      ...postpartumMaternalAddOns.activeClinicalAddOns,
      ...olderAdultAddOns.activeClinicalAddOns
    ],
    sourceIds: resultSourceIds,
    sources: resultSourceIds.map((id) => sources.find((sourceRow) => sourceRow.id === id)).filter(Boolean),
    plannedModules: plannedComplaintModules
  };
}

function requireComplaintItemFields(issues, moduleId, group, item, fields) {
  for (const field of fields) {
    const value = item[field];
    const missing = Array.isArray(value)
      ? !value.some((entry) => String(entry || "").trim())
      : !String(value || "").trim();
    if (missing) {
      issues.push(`${moduleId}.${group}.${item.id || "missing"} missing ${field}`);
    }
  }
}

const validComplaintLrPattern = /^(?:n\/a|na|not available|not studied|pending|unavailable|[<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*[<>]?\s*\d+(?:\.\d+)?)?)$/i;
const validDifficultyValues = new Set(["easy", "moderate", "hard", "difficult"]);
const validCooperationValues = new Set(["low", "moderate", "high", "n/a"]);

function validateComplaintMetadataValues(issues, moduleId, group, item = {}) {
  ["LR_plus", "LR_minus"].forEach((field) => {
    const value = item[field];
    if (value !== undefined && value !== null && String(value).trim() && !validComplaintLrPattern.test(String(value).trim())) {
      issues.push(`${moduleId}.${group}.${item.id || "missing"} invalid ${field}: ${value}`);
    }
  });

  if (group === "safetyChecks" || group === "requiredExam" || group === "conditionalExam") {
    const minutes = Number(item.time_burden_minutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 30) {
      issues.push(`${moduleId}.${group}.${item.id || "missing"} invalid time_burden_minutes: ${item.time_burden_minutes}`);
    }
    const difficulty = String(item.difficulty || "").trim().toLowerCase();
    if (difficulty && !validDifficultyValues.has(difficulty)) {
      issues.push(`${moduleId}.${group}.${item.id || "missing"} invalid difficulty: ${item.difficulty}`);
    }
    const cooperation = String(item.patient_cooperation_required || "").trim().toLowerCase();
    if (cooperation && !validCooperationValues.has(cooperation)) {
      issues.push(`${moduleId}.${group}.${item.id || "missing"} invalid patient_cooperation_required: ${item.patient_cooperation_required}`);
    }
  }
}

export function examSemanticConsistencyIssues(moduleId, group, item = {}) {
  const issues = [];
  const labelText = normalizeComplaintText(item.label || "");
  const supportText = normalizeComplaintText([
    item.technique,
    Array.isArray(item.findings_options) ? item.findings_options.join(" ") : item.findings_options,
    item.when_to_perform,
    item.diagnostic_target,
    item.management_change,
    item.limitations,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    item.source?.source_section
  ].filter(Boolean).join(" "));
  const targetText = normalizeComplaintText([
    item.diagnostic_target,
    item.management_change,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    item.source?.source_section
  ].filter(Boolean).join(" "));
  const moduleText = normalizeComplaintText([
    moduleId,
    item.source?.source_section,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags
  ].filter(Boolean).join(" "));
  const findingTargetText = normalizeComplaintText([
    Array.isArray(item.findings_options) ? item.findings_options.join(" ") : item.findings_options,
    item.diagnostic_target,
    item.management_change
  ].filter(Boolean).join(" "));

  const add = (message) => issues.push(`${moduleId}.${group}.${item.id || "missing"} ${message}: ${item.label}`);

  if (/\bskin turgor\b/.test(labelText)) {
    if (!/\b(?:dehydration|volume|hypovolemia|perfusion|shock|fluid)\b/.test(targetText)) {
      add("exam semantic mismatch: skin turgor must target dehydration, volume, perfusion, or shock physiology");
    }
    if (/\b(?:wound|drainage|ulcer|cellulitis|line site)\b/.test(findingTargetText)) {
      add("exam semantic mismatch: skin turgor findings must not use wound or soft-tissue infection metadata");
    }
  }
  if (/\bbone tenderness\b/.test(labelText) && !/\b(?:bone|fracture|osteomalacia|skeletal|calcium|hyperparathyroid|pain)\b/.test(targetText)) {
    add("exam semantic mismatch: bone tenderness must target bone pain, fracture risk, osteomalacia, calcium, or skeletal disease");
  }
  if (/\b(?:visual acuity|visual field|extraocular|diplopia|pupil)\b/.test(labelText)
    && !/\b(?:vision|visual|optic|cranial|pituitary|sellar|eye|diplopia|pupil)\b/.test(targetText)) {
    add("exam semantic mismatch: eye or visual maneuvers must target visual, optic, cranial nerve, pituitary/sellar, or ocular disease");
  }
  if (/\bextraocular\b/.test(labelText)
    && /\b(?:graves|thyrotoxicosis|thyroid eye|orbitopathy)\b/.test(targetText)
    && !/\b(?:thyroid|graves|hyperthyroidism|thyrotoxicosis|orbitopathy)\b/.test(moduleText)) {
    add("exam semantic mismatch: extraocular movements should not inherit Graves/orbitopathy wording outside thyroid eye contexts");
  }
  if (/\bextraocular\b/.test(labelText)
    && /\b(?:pituitary|prolactinoma|acromegaly|gigantism|hypopituitarism|diabetes insipidus|cushing s disease)\b/.test(moduleText)
    && !/\b(?:pituitary|sellar|cavernous|cranial|ophthalmoplegia|diplopia|visual|mass effect)\b/.test(targetText)) {
    add("exam semantic mismatch: pituitary extraocular-movement exams must target sellar/cavernous sinus or cranial nerve involvement");
  }
  if (/\bthyroid\b/.test(labelText) && !/\b(?:thyroid|goiter|nodule|neck|compressive|orbitopathy)\b/.test(targetText)) {
    add("exam semantic mismatch: thyroid maneuvers must target thyroid, goiter, nodule, compressive neck, or orbitopathy findings");
  }
  if (/\bacanthosis\b/.test(labelText) && !/\b(?:insulin resistance|cardiometabolic|metabolic risk|diabetes|pcos|hyperandrogen|androgen)\b/.test(findingTargetText)) {
    add("exam semantic mismatch: acanthosis must target insulin resistance, PCOS/metabolic, or cardiometabolic risk");
  }
  if (/\b(?:lung sounds|auscultate lungs|wheeze|crackle)\b/.test(labelText)
    && !/\b(?:lung|pulmonary|respiratory|pneumonia|wheeze|crackle|hypoxia|dyspnea|airway)\b/.test(supportText)) {
    add("exam semantic mismatch: lung auscultation must target pulmonary or respiratory findings");
  }
  if (/\babdominal palpation\b|\bpalpate abdomen\b/.test(labelText)
    && !/\b(?:abdominal|abdomen|tenderness|guarding|peritonitis|gastrointestinal|bowel|dka|hyperglycemic|pain)\b/.test(supportText)) {
    add("exam semantic mismatch: abdominal palpation must target abdominal tenderness, peritonitis, GI, pain, or DKA-related findings");
  }
  if (/\boral mucosa\b.*\bhyperpigmentation\b|\bhyperpigmentation\b/.test(labelText)
    && !/\b(?:primary adrenal|adrenal insufficiency|addison|acth|congenital adrenal|cah|hyperpigmentation)\b/.test(targetText)) {
    add("exam semantic mismatch: hyperpigmentation exams must target primary adrenal insufficiency, ACTH excess, or CAH physiology");
  }
  if (/\bhyperpigmentation\b/.test(labelText) && /\b(?:cushing|glucocorticoid excess|bruising|striae)\b/.test(targetText)) {
    add("exam semantic mismatch: hyperpigmentation findings must not inherit Cushing/bruising/striae metadata");
  }
  const cushingPhenotypeLabel = /\b(?:purple striae|supraclavicular fullness)\b/.test(labelText)
    || (/\bbruising\b/.test(labelText)
      && /\b(?:cushing|hypercortisol|glucocorticoid|steroid|cortisol|cushingoid)\b/.test(`${supportText} ${moduleText}`));
  if (cushingPhenotypeLabel
    && !/\b(?:cushing|hypercortisol|glucocorticoid|steroid|cortisol)\b/.test(targetText)) {
    add("exam semantic mismatch: Cushing phenotype maneuvers must target hypercortisolism or glucocorticoid excess");
  }
  if (/\btremor\b/.test(labelText)
    && /\b(?:acral|growth hormone|acromegaly)\b/.test(findingTargetText)) {
    add("exam semantic mismatch: tremor maneuvers must not inherit acromegaly/acral-hand metadata");
  }
  if (/\btremor\b/.test(labelText)
    && /\bpheochromocytoma\b/.test(moduleText)
    && !/\b(?:catecholamine|adrenergic|autonomic|spell|hypertensive)\b/.test(findingTargetText)) {
    add("exam semantic mismatch: pheochromocytoma tremor maneuvers must target adrenergic spell physiology");
  }
  if (/\bpedal pulses?\b/.test(labelText)
    && !/\b(?:diabetic foot|peripheral arterial|arterial disease|vascular|foot perfusion|pulse|pulses)\b/.test(targetText)) {
    add("exam semantic mismatch: pedal pulses must target diabetic foot perfusion, PAD, vascular risk, or pulse abnormality");
  }
  if (/\bmucous membranes?\b.*\bdehydration\b/.test(labelText)
    && !/\b(?:dehydration|volume|hypovolemia|fluid|perfusion|dry mucous|hypernatremia|poor intake)\b/.test(targetText)) {
    add("exam semantic mismatch: dehydration mucous-membrane exams must target volume or fluid status");
  }

  return issues;
}

export function validateComplaintModules(modules = complaintModules, sources = complaintSourceRegistry) {
  const issues = [];
  const moduleIds = new Set();
  const sourceIds = new Set(sources.map((row) => row.id));
  const itemGroups = ["redFlags", "safetyChecks", "requiredQuestions", "conditionalQuestions", "requiredExam", "conditionalExam", "initialTests", "dispositionRules", "decisionTrees", "treatmentOptions", "differentialBuckets"];
  const bundledExamPattern = /[,;:]|\/|\band\s*\/\s*or\b|\b(?:focused exam|acuity screen|add repeat vitals|trigger exam|work-of-breathing|screen|assessment|vital signs including|cardiac exam|pulmonary exam|perfusion and pulses|volume status)\b/i;
  const vagueExamActionPattern = /^(?:Check|Assess|Evaluate|Screen|Review|Document|Perform)\b/i;
  const weakSafetyCheckLabelPattern = /^(?:Assess|Check|Evaluate)\b|^(?:Mental status|General appearance)$/i;
  const placeholderExamTechniquePattern = /\bperform the named (?:bedside item|maneuver) directly\b/i;
  const placeholderDiagnosticTargetPattern = /\bfocused bedside finding relevant to\b|^\s*$/i;
  const genericHistoryQuestionPattern = /\bAny .+\brelevant to\b/i;
  const genericQuestionManagementPattern = /\bAsk and document because the answer changes diagnostic probability, urgency, test interpretation, or treatment safety\b/i;
  const genericConditionalQuestionActionPattern = /\bAsk only when the patient context or selected modifiers mention this feature\b/i;
  const genericExamActionPattern = /\bPerform this bedside maneuver and document positive, negative, and unable-to-assess findings\b/i;
  const genericExamRationalePattern = /\bDocuments focused endocrine signs and complications that help distinguish severity, mimics, and management priorities\b|\bAssesses .+ so abnormal findings can change urgency, diagnostic focus, testing, treatment safety, or specialty planning\b/i;
  const staleBundledGeneratedWorkupPattern = /\b(?:Focused physical exam|Vitals and acuity screen|Proximal strength, bone tenderness, gait\/falls, hypocalcemia signs)\b/i;

  modules.forEach((module) => {
    if (!module.id || moduleIds.has(module.id)) {
      issues.push(`Duplicate or missing module id: ${module.id || "missing"}`);
    }
    moduleIds.add(module.id);
    for (const field of ["schema_version", "label", "version", "status", "triggers"]) {
      if (!module[field] || (Array.isArray(module[field]) && !module[field].length)) {
        issues.push(`${module.id} missing ${field}`);
      }
    }
    itemGroups.forEach((group) => {
      (module[group] || []).forEach((item) => {
        if (!item.id || !item.label) {
          issues.push(`${module.id}.${group} has item missing id or label`);
        }
        const expectedItemType = expectedItemTypeForGroup(group);
        if (expectedItemType && item.item_type !== expectedItemType) {
          issues.push(`${module.id}.${group}.${item.id || "missing"} item_type must be ${expectedItemType}, got ${item.item_type || "missing"}`);
        }
        if (!item.source?.source_id || !sourceIds.has(item.source.source_id)) {
          issues.push(`${module.id}.${group}.${item.id} has invalid source`);
        }
        if (staleBundledGeneratedWorkupPattern.test(JSON.stringify(item))) {
          issues.push(`${module.id}.${group}.${item.id} contains stale bundled generated workup wording`);
        }
        for (const field of ["source_section", "version_date", "last_reviewed", "clinical_owner"]) {
          if (!item.source?.[field]) {
            issues.push(`${module.id}.${group}.${item.id} missing source.${field}`);
          }
        }
        validateComplaintMetadataValues(issues, module.id, group, item);
        if (group === "requiredExam" || group === "conditionalExam") {
          if (isBasicBedsideDataItem(item)) {
            issues.push(`${module.id}.${group}.${item.id} basic bedside data/safety item belongs in safetyChecks, not physical exam: ${item.label}`);
          }
          if (bundledExamPattern.test(item.label || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam label appears bundled or vague: ${item.label}`);
          }
          if (vagueExamActionPattern.test(item.label || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam label must name a concrete maneuver action: ${item.label}`);
          }
          if (group === "conditionalExam" && !(item.when?.termsAny?.length || item.when?.answersAny?.length || item.when?.termsAll?.length || item.when?.answersAll?.length || item.when?.intentIdsAny?.length || item.when?.intentIdsAll?.length)) {
            issues.push(`${module.id}.${group}.${item.id} conditional exam needs structured activation triggers`);
          }
          if (!item.action && !item.rationale && !item.management_change) {
            issues.push(`${module.id}.${group}.${item.id} exam item needs action, rationale, or management implication text`);
          }
          if (genericExamActionPattern.test(item.action || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam action is generic generated filler`);
          }
          for (const field of ["technique", "findings_options", "when_to_perform", "diagnostic_target", "LR_plus", "LR_minus", "likelihood_ratio_note", "management_change", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "tags"]) {
            const value = item[field];
            if (!value || (Array.isArray(value) && !value.length)) {
              issues.push(`${module.id}.${group}.${item.id} exam maneuver missing ${field}`);
            }
          }
          if (placeholderExamTechniquePattern.test(item.technique || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam technique is a placeholder, not a maneuver-specific bedside technique`);
          }
          if (placeholderDiagnosticTargetPattern.test(item.diagnostic_target || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam diagnostic_target is too generic`);
          }
          if (genericExamRationalePattern.test(item.rationale || "")) {
            issues.push(`${module.id}.${group}.${item.id} exam rationale is generic rather than maneuver-specific`);
          }
          issues.push(...examSemanticConsistencyIssues(module.id, group, item));
        }
        if (group === "requiredQuestions" || group === "conditionalQuestions") {
          if (!item.text || !item.options?.length || !item.when_to_ask || !item.diagnostic_purpose || !item.management_implication || !String(item.likelihood_ratio_note || "").trim() || !item.tags?.length) {
            issues.push(`${module.id}.${group}.${item.id} history question needs text, options, when_to_ask, diagnostic_purpose, management_implication, likelihood_ratio_note, and tags`);
          }
          if (!/\?$/.test(String(item.text || item.label || "").trim())) {
            issues.push(`${module.id}.${group}.${item.id} history question must be phrased as an askable question`);
          }
          if (genericHistoryQuestionPattern.test(`${item.text || ""} ${item.label || ""}`)) {
            issues.push(`${module.id}.${group}.${item.id} history question uses generic relevance boilerplate`);
          }
          if (genericQuestionManagementPattern.test(`${item.action || ""} ${item.management_implication || ""}`)) {
            issues.push(`${module.id}.${group}.${item.id} history question uses generic generated management implication`);
          }
          if (genericConditionalQuestionActionPattern.test(item.action || "")) {
            issues.push(`${module.id}.${group}.${item.id} conditional question action is generic generated filler`);
          }
        }
        if (group === "redFlags") {
          requireComplaintItemFields(issues, module.id, group, item, ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]);
        }
        if (group === "safetyChecks") {
          if (weakSafetyCheckLabelPattern.test(item.label || "")) {
            issues.push(`${module.id}.${group}.${item.id} safety-check label should name a specific bedside action: ${item.label}`);
          }
          requireComplaintItemFields(
            issues,
            module.id,
            group,
            item,
            [
              "action",
              "rationale",
              "management_change",
              "difficulty",
              "time_burden_minutes",
              "equipment_needed",
              "patient_cooperation_required",
              "limitations",
              "likelihood_ratio_note",
              "tags"
            ]
          );
          const equipmentIssue = safetyEquipmentIssue(item);
          if (equipmentIssue) {
            issues.push(`${module.id}.${group}.${item.id} safety-check equipment mismatch: ${equipmentIssue}`);
          }
        }
        if (group === "initialTests") {
          requireComplaintItemFields(issues, module.id, group, item, ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]);
        }
        if (group === "dispositionRules" || group === "decisionTrees" || group === "treatmentOptions") {
          requireComplaintItemFields(issues, module.id, group, item, ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]);
        }
        if (group === "differentialBuckets") {
          requireComplaintItemFields(issues, module.id, group, item, ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]);
        }
      });
    });
    const examLabels = [...(module.requiredExam || []), ...(module.conditionalExam || [])].map((item) => String(item.label || "").toLowerCase());
    if (new Set(examLabels).size !== examLabels.length) {
      issues.push(`${module.id} has duplicate exam labels across required and conditional exam items`);
    }
  });

  return { ok: issues.length === 0, issues };
}

function reportValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return entry.label || entry.value || JSON.stringify(entry);
        }
        return String(entry || "").trim();
      })
      .filter(Boolean)
      .join(" / ");
  }
  return String(value || "").trim();
}

function reportEvidenceLine(item) {
  const parts = [
    item.source?.evidence_strength,
    item.source?.source_section ? `section ${item.source.source_section}` : "",
    item.source?.version_date ? `version ${item.source.version_date}` : "",
    item.source?.last_reviewed ? `reviewed ${item.source.last_reviewed}` : "",
    item.source?.clinical_owner ? `owner ${item.source.clinical_owner}` : ""
  ].filter(Boolean);
  return parts.length ? `Evidence: ${parts.join("; ")}` : "";
}

function reportLikelihoodLine(item) {
  if (!Object.prototype.hasOwnProperty.call(item, "LR_plus") && !Object.prototype.hasOwnProperty.call(item, "LR_minus")) {
    return "";
  }
  const note = item.likelihood_ratio_note || item.LR_note || item.lr_note || item.likelihoodRatioNote;
  return `Likelihood ratios: LR+ ${item.LR_plus || "n/a"}; LR- ${item.LR_minus || "n/a"}${note ? `. Note: ${note}` : ""}`;
}

function reportFeasibilityLine(item) {
  const parts = [
    item.difficulty ? `difficulty ${item.difficulty}` : "",
    item.time_burden_minutes ? `${item.time_burden_minutes} min` : "",
    item.equipment_needed ? `equipment ${item.equipment_needed}` : "",
    item.patient_cooperation_required ? `cooperation ${item.patient_cooperation_required}` : ""
  ].filter(Boolean);
  return parts.length ? `Feasibility: ${parts.join("; ")}` : "";
}

function appendReportDetail(lines, label, value) {
  const text = reportValue(value);
  if (text) {
    lines.push(`${label}: ${text}`);
  }
}

function defaultComplaintReportLines(item) {
  const lines = [item.text || item.label];
  if (item.options?.length) {
    appendReportDetail(lines, "Options", item.options);
  }
  appendReportDetail(lines, "Ask when", item.when_to_ask);
  appendReportDetail(lines, "Use when", item.when_to_perform || item.when_to_use || item.when_to_use_structured);
  appendReportDetail(lines, "Action", item.action);
  appendReportDetail(lines, "Rationale", item.rationale);
  appendReportDetail(lines, "Diagnostic purpose", item.diagnostic_purpose);
  appendReportDetail(lines, "Diagnostic target", item.diagnostic_target);
  appendReportDetail(lines, "Management implication", item.management_implication);
  appendReportDetail(lines, "Management change", item.management_change);
  appendReportDetail(lines, "Limitations", item.limitations);
  appendReportDetail(lines, "Tags", item.tags);
  [reportLikelihoodLine(item), reportFeasibilityLine(item), reportEvidenceLine(item)]
    .filter(Boolean)
    .forEach((line) => lines.push(line));
  return lines;
}

function examComplaintReportLines(item) {
  const lines = [item.label];
  appendReportDetail(lines, "Technique", item.technique || item.maneuver);
  appendReportDetail(lines, "Findings/options", item.findings_options);
  appendReportDetail(lines, "Use when", item.when_to_perform || item.when_to_use || item.when_to_use_structured);
  appendReportDetail(lines, "Diagnostic target", item.diagnostic_target);
  [reportLikelihoodLine(item), reportFeasibilityLine(item)].filter(Boolean).forEach((line) => lines.push(line));
  appendReportDetail(lines, "Management change", item.management_change || item.action);
  appendReportDetail(lines, "Limitations", item.limitations);
  appendReportDetail(lines, "Tags", item.tags);
  const evidenceLine = reportEvidenceLine(item);
  if (evidenceLine) lines.push(evidenceLine);
  return lines;
}

function questionComplaintReportLines(item) {
  const lines = [item.text || item.label];
  appendReportDetail(lines, "Detail prompts", item.detail_prompts);
  appendReportDetail(lines, "Options", item.options);
  appendReportDetail(lines, "Ask when", item.when_to_ask);
  appendReportDetail(lines, "Diagnostic purpose", item.diagnostic_purpose);
  appendReportDetail(lines, "Management implication", item.management_implication || item.action);
  appendReportDetail(lines, "Likelihood-ratio note", item.likelihood_ratio_note || item.LR_note || item.lr_note || item.likelihoodRatioNote);
  appendReportDetail(lines, "Tags", item.tags);
  const evidenceLine = reportEvidenceLine(item);
  if (evidenceLine) lines.push(evidenceLine);
  return lines;
}

function suppressedComplaintReportLines(item) {
  const lines = [item.label || item.id || "Suppressed item"];
  appendReportDetail(lines, "Why not recommended", item.reason || item.suppressionReason);
  appendReportDetail(lines, "Override if", item.unless_tags_include);
  appendReportDetail(lines, "Diagnostic target", item.diagnostic_target);
  appendReportDetail(lines, "Management implication", item.management_change || item.management_implication);
  appendReportDetail(lines, "Limitations", item.limitations);
  appendReportDetail(lines, "Tags", item.tags);
  [reportLikelihoodLine(item), reportFeasibilityLine(item), reportEvidenceLine(item)]
    .filter(Boolean)
    .forEach((line) => lines.push(line));
  return lines;
}

function catalogGapComplaintReportLines(item) {
  const lines = [item.label || item.id || "Catalog gap"];
  appendReportDetail(lines, "Evidence status", "staged catalog gap; not accepted evidence");
  appendReportDetail(lines, "Diagnostic target", item.diagnostic_target || item.required_domain);
  appendReportDetail(lines, "Resolution plan", item.resolution_plan || item.management_change);
  appendReportDetail(lines, "Limitations", item.limitations);
  appendReportDetail(lines, "Tags", item.tags);
  [reportLikelihoodLine(item), reportEvidenceLine(item)]
    .filter(Boolean)
    .forEach((line) => lines.push(line));
  return lines;
}

function compactComplaintTrace(item = {}) {
  const traceability = item.traceability || {};
  const intentIds = Array.isArray(traceability.intent_ids) ? traceability.intent_ids.filter(Boolean) : [];
  const intentTrace = intentIds.length ? `; intent ${intentIds.join(",")}` : "";
  const moduleTrace = [traceability.module_id, traceability.item_group, traceability.item_id]
    .filter(Boolean)
    .join(".");
  const itemTrace = traceability ? `; trace ${moduleTrace || "n/a"}` : "";
  const authorizationTrace = traceability.authorized_by ? `; auth ${traceability.authorized_by}` : "";
  return `${intentTrace}${itemTrace}${authorizationTrace}`;
}

function reportItems(title, items, lines, formatter = defaultComplaintReportLines) {
  lines.push("", title);
  if (!items.length) {
    lines.push("- None");
    return;
  }
  items.forEach((item) => {
    const trace = compactComplaintTrace(item);
    const formatted = formatter(item);
    const formattedLines = Array.isArray(formatted) ? formatted.filter(Boolean) : [formatted].filter(Boolean);
    const [firstLine, ...detailLines] = formattedLines.length ? formattedLines : [item.label || item.id || "Unlabeled item"];
    lines.push(`- ${firstLine} [${item.source?.source_id || "source"}${trace}]`);
    detailLines.forEach((line) => {
      lines.push(`  ${line}`);
    });
  });
}

function reportEvidenceMetadata(result = {}, lines = []) {
  lines.push("", "Evidence / LR metadata");
  const sourceRows = result.sources || [];
  if (!sourceRows.length) {
    lines.push("- None");
  } else {
    sourceRows.forEach((sourceRow) => {
      lines.push(`- ${sourceRow.id}: ${sourceRow.citation}; ${sourceRow.url}`);
    });
  }
  lines.push("- LR convention: each recommendation row includes LR+ and LR- when available, or an interpretation note explaining why quantitative likelihood ratios are unavailable or not applicable.");
}

export function formatComplaintCdsReport(result) {
  if (!result?.matched) {
    const gap = result?.unsupportedClinicalIntentGap || {};
    const lines = [
      "Guideline Complaint CDS",
      "Recommendations: none. Free text and retrieval/audit matches do not authorize bedside workup recommendations.",
      result?.message || "No validated clinical intent or complaint module matched.",
      "",
      "Unsupported/gap state",
      `- Staged unsupported clinical intent: ${gap.sanitized_query || result?.sanitizedInputText || "unsupported concern not specified"}`,
      `  Gap status: ${gap.gap_status || "staged_gap"}`,
      `  Gap type: ${gap.gap_type || "unsupported_clinical_intent"}`,
      gap.sanitized_modifiers ? `  Sanitized modifiers: ${gap.sanitized_modifiers}` : "",
      gap.setting ? `  Setting: ${gap.setting}` : "",
      gap.population ? `  Population: ${gap.population}` : "",
      `  Review owner: ${gap.review_owner || "local_reviewer"}`,
      `  Activation rule: ${gap.activation_rule || "Requires reviewed knowledge-pack activation before recommendations."}`,
      "",
      "Catalog gaps needing review",
      `- ${gap.sanitized_query || result?.sanitizedInputText || "unsupported concern not specified"} [staged catalog gap; not accepted evidence]`
    ].filter((line) => line !== "");
    return `${lines.join("\n")}\n`;
  }
  const lines = [
    "Guideline Complaint CDS",
    `Input: ${sanitizeUnsupportedClinicalIntentGapText(result.inputText || "") || "Not specified"}`,
    `Module: ${result.module.label} (${result.module.id}, v${result.module.version})`,
    `Triggered red flags: ${result.triggeredRedFlags.length}`
  ];
  reportItems("Basic bedside data / safety checks", result.safetyChecks || [], lines);
  reportItems("Focused history questions", result.requiredQuestions, lines, questionComplaintReportLines);
  reportItems("Core physical exam maneuvers", result.requiredExam || [], lines, examComplaintReportLines);
  reportItems("Conditional exam add-ons", result.conditionalExam || [], lines, examComplaintReportLines);
  reportItems("Conditional history add-ons", result.conditionalQuestions, lines, questionComplaintReportLines);
  reportItems("Immediate tests / next steps", result.initialTests, lines);
  reportItems("Clinical decision tree", result.decisionTrees || [], lines);
  reportItems("Management-changing findings / disposition cues", result.dispositionRules, lines);
  reportItems("Treatment options", result.treatmentOptions || [], lines);
  reportItems("Red flags and escalation cues", result.redFlags, lines, (item) => `${item.triggered ? "TRIGGERED: " : "Screen: "}${item.label}${item.action ? ` - ${item.action}` : ""}`);
  reportEvidenceMetadata(result, lines);
  reportItems("Limitations and interpretation cautions", result.limitationsAndInterpretationCautions || [], lines);
  reportItems("Suppressed/not-recommended items", result.suppressedNotRecommendedItems || result.suppressedItems || [], lines, suppressedComplaintReportLines);
  reportItems("Catalog gaps needing review", result.catalogGapsNeedingReview || result.catalogGaps || [], lines, catalogGapComplaintReportLines);
  reportItems("Differential buckets", result.differentialBuckets, lines);
  return `${lines.join("\n")}\n`;
}
