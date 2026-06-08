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
  return triggerScore + labelScore;
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

function expectedItemTypeForGroup(group = "") {
  if (group === "safetyChecks") return "safety_check";
  if (group === "requiredQuestions" || group === "conditionalQuestions") return "history_question";
  if (group === "requiredExam" || group === "conditionalExam") return "physical_exam_maneuver";
  if (group === "redFlags") return "red_flag";
  if (group === "initialTests") return "diagnostic_test";
  if (group === "dispositionRules") return "management_change";
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

const basicBedsideDataPattern = /\b(?:measure|check|document|calculate|obtain|record)\s+(?:blood pressure|bp|heart rate|hr|respiratory rate|rr|oxygen saturation|spo2|pulse oximetry|temperature|temp|current weight|weight|body mass index|bmi|waist circumference|orthostatic|bedside glucose|point-of-care glucose|fingerstick glucose|pain score|mental status)\b|\b(?:assess|document)\s+(?:general appearance|mental status|ability to protect airway|airway protection)\b|\b(?:check|document)\s+(?:ability to protect airway|airway protection)\b|^\s*mental status\s*$/i;

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
      "Record maximum temperature and how it was measured.",
      "Clarify fever onset and trajectory.",
      "Ask what antipyretics, antibiotics, steroids, or immunosuppressants were already taken."
    ];
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
    return uniqueHistoryPromptDetails(list.map((fragment) => `Review ${fragment}.`));
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

function clinicalExamActionLabel(item = {}, group = "") {
  const label = String(item.label || "").trim();
  if (group !== "requiredExam" && group !== "conditionalExam") {
    return label;
  }
  const actionLabelPattern = /^(?:inspect|palpate|auscultate|percuss|observe|test|check|compare|measure|listen|use|press|stage|estimate|elicit)\b/i;
  const match = label.match(/^(?:assess|evaluate|screen for)\s+(.+)$/i);
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
    return "Check distal extremity warmth";
  }
  if (/\bskin turgor\b/.test(normalizedSubject)) {
    return "Check skin turgor";
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
    return "Check neck stiffness";
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
  const list = Array.isArray(value) ? value : String(value || "").split(/[;|/]+/);
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
    diagnostic_target: item.diagnostic_target || item.diagnosticTarget || item.label || "",
    management_change: item.management_change || item.managementImplication || item.action || "",
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
    limitations: item.limitations
      || item.interpretation_cautions
      || "Interpret with the full clinical context; bedside findings support but do not replace indicated diagnostic testing, guideline thresholds, or local protocols.",
    tags: item.tags?.length ? item.tags : fallbackTags
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

function normalizeEvaluatedQuestionItem(item, group = "") {
  if (group !== "requiredQuestions" && group !== "conditionalQuestions") {
    return item;
  }
  const text = item.text || item.label || "";
  const diagnosticPurpose = item.diagnostic_purpose
    || item.diagnosticPurpose
    || item.rationale
    || "Clarifies diagnostic probability, severity, red flags, relevant mimics, or safe interpretation for the selected validated workup.";
  const managementImplication = item.management_implication
    || item.managementImplication
    || item.action
    || "The answer changes urgency, diagnostic testing, treatment safety, disposition, or follow-up planning.";
  const detailPrompts = historyQuestionDetailPrompts(item);
  return {
    ...item,
    text,
    detail_prompts: detailPrompts,
    when_to_ask: item.when_to_ask || item.whenToAsk || "Ask when this validated workup is selected or when the answer changes clinical interpretation.",
    diagnostic_purpose: diagnosticPurpose,
    management_implication: managementImplication,
    likelihood_ratio_note: likelihoodRatioNoteForQuestionItem(item),
    tags: tagsForQuestionItem(item)
  };
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
  const includedRequiredQuestions = includeItems(module.requiredQuestions, inputText, answers, "requiredQuestions", traceContext);
  const includedConditionalQuestions = includeItems(module.conditionalQuestions, inputText, answers, "conditionalQuestions", traceContext);
  const promotedQuestions = promoteIntentActivatedConditionalQuestions(includedRequiredQuestions, includedConditionalQuestions, traceContext);
  const requiredQuestions = promotedQuestions.requiredQuestions;
  const conditionalQuestions = promotedQuestions.conditionalQuestions;
  const explicitSafetyChecks = includeItems(module.safetyChecks, inputText, answers, "safetyChecks", traceContext);
  const explicitSafetyGroups = partitionExplicitSafetyChecks(explicitSafetyChecks);
  const includedRequiredExam = includeItems(module.requiredExam, inputText, answers, "requiredExam", traceContext);
  const includedConditionalExam = includeItems(module.conditionalExam, inputText, answers, "conditionalExam", traceContext);
  const requiredExamGroups = partitionBedsideExamItems(includedRequiredExam);
  const conditionalExamGroups = partitionBedsideExamItems(includedConditionalExam);
  const requiredSafetyChecks = [...explicitSafetyGroups.requiredSafetyChecks, ...requiredExamGroups.safetyChecks];
  const conditionalSafetyChecks = [...explicitSafetyGroups.conditionalSafetyChecks, ...conditionalExamGroups.safetyChecks];
  const requiredExam = requiredExamGroups.examManeuvers;
  const conditionalExam = conditionalExamGroups.examManeuvers;
  const initialTests = includeItems(module.initialTests, inputText, answers, "initialTests", traceContext);
  const dispositionRules = includeItems(module.dispositionRules, inputText, answers, "dispositionRules", traceContext);
  const redFlags = evaluateRedFlags(module.redFlags, inputText, answers)
    .map((item) => traceComplaintCdsItem(item, module, "redFlags", traceContext.intentTrace, traceContext.authorizedBy));
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
    limitationsAndInterpretationCautions,
    suppressedNotRecommendedItems,
    suppressedItems: suppressedNotRecommendedItems,
    catalogGapsNeedingReview,
    catalogGaps: catalogGapsNeedingReview,
    differentialBuckets,
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
  if (/\b(?:bruising|purple striae|supraclavicular fullness)\b/.test(labelText)
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
  const itemGroups = ["redFlags", "safetyChecks", "requiredQuestions", "conditionalQuestions", "requiredExam", "conditionalExam", "initialTests", "dispositionRules", "differentialBuckets"];
  const bundledExamPattern = /[,;:]|\/|\band\s*\/\s*or\b|\b(?:focused exam|acuity screen|add repeat vitals|trigger exam|work-of-breathing|screen|assessment|vital signs including|cardiac exam|pulmonary exam|perfusion and pulses|volume status)\b/i;
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
        if (group === "dispositionRules") {
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
  reportItems("Management-changing findings / disposition cues", result.dispositionRules, lines);
  reportItems("Red flags and escalation cues", result.redFlags, lines, (item) => `${item.triggered ? "TRIGGERED: " : "Screen: "}${item.label}${item.action ? ` - ${item.action}` : ""}`);
  reportEvidenceMetadata(result, lines);
  reportItems("Limitations and interpretation cautions", result.limitationsAndInterpretationCautions || [], lines);
  reportItems("Suppressed/not-recommended items", result.suppressedNotRecommendedItems || result.suppressedItems || [], lines, suppressedComplaintReportLines);
  reportItems("Catalog gaps needing review", result.catalogGapsNeedingReview || result.catalogGaps || [], lines, catalogGapComplaintReportLines);
  reportItems("Differential buckets", result.differentialBuckets, lines);
  return `${lines.join("\n")}\n`;
}
