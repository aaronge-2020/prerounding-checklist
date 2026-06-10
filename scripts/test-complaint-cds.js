import assert from "node:assert/strict";
import {
  buildLocalChecklistFromWorkup,
  hasGenericOnlyChecklistOptions,
  parseChecklist
} from "../checklist.js";
import {
  complaintModules,
  complaintSourceRegistry,
  evaluateComplaintCds,
  formatComplaintCdsReport,
  isBasicBedsideDataItem,
  selectComplaintModule,
  validateComplaintModules
} from "../complaint-cds.js";
import {
  buildClinicalIntentRetrievalContext,
  getClinicalIntentById,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";

const audit = validateComplaintModules();
assert.ok(audit.ok, audit.issues.join("\n"));

const syntheticSource = {
  source_id: "AHA_ACC_CHEST_PAIN_2021",
  source_section: "synthetic validation regression",
  evidence_strength: "guideline/consensus",
  version_date: "2021",
  last_reviewed: "2026-06-07",
  clinical_owner: "test"
};
const badModuleAudit = validateComplaintModules([
  {
    id: "bad_module_v1",
    schema_version: "complaint-cds-artifact-v1",
    label: "Bad module",
    version: "0.0.1",
    status: "draft",
    triggers: ["bad module"],
    redFlags: [
      { id: "bad_red_flag", label: "Bad red flag", item_type: "history_question", source: syntheticSource }
    ],
    safetyChecks: [
      { id: "bad_safety", label: "Measure blood pressure", item_type: "physical_exam_maneuver", source: syntheticSource }
    ],
    requiredQuestions: [
      { id: "bad_question", label: "Chest pain onset", item_type: "history_question", text: "Chest pain onset", options: [{ value: "unknown", label: "Unknown" }], when_to_ask: "Always", diagnostic_purpose: "Test", management_implication: "Ask and document because the answer changes diagnostic probability, urgency, test interpretation, or treatment safety.", tags: ["test"], source: syntheticSource }
    ],
    requiredExam: [
      { id: "bad_exam_vitals", label: "Measure blood pressure", item_type: "physical_exam_maneuver", technique: "Use cuff.", findings_options: ["High"], when_to_perform: "Always", diagnostic_target: "BP", LR_plus: "n/a", LR_minus: "n/a", management_change: "Escalate", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "cuff", patient_cooperation_required: "low", limitations: "Context", tags: ["bp"], source: syntheticSource },
      { id: "bad_exam_bundle", label: "Inspect gait, strength, and focal tenderness", item_type: "physical_exam_maneuver", action: "Perform this bedside maneuver and document positive, negative, and unable-to-assess findings.", rationale: "Assesses many findings so abnormal findings can change urgency, diagnostic focus, testing, treatment safety, or specialty planning.", technique: "Do many things.", findings_options: ["Present"], when_to_perform: "Always", diagnostic_target: "Many targets", LR_plus: "high", LR_minus: "n/a", management_change: "Unclear", difficulty: "simple", time_burden_minutes: "about one minute", equipment_needed: "none", patient_cooperation_required: "some", limitations: "Context", tags: ["bundle"], source: syntheticSource },
      { id: "bad_exam_mismatch", label: "Assess skin turgor", item_type: "physical_exam_maneuver", technique: "Pinch the skin over the hand or sternum and observe recoil.", findings_options: ["Wound", "Drainage", "Ulcer"], when_to_perform: "When volume status matters", diagnostic_target: "Soft tissue infection and wound drainage", LR_plus: "n/a", LR_minus: "n/a", management_change: "Escalate wound care", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "low", limitations: "Context", tags: ["wound"], source: syntheticSource },
      { id: "bad_exam_eom", label: "Assess extraocular movements", item_type: "physical_exam_maneuver", technique: "Follow target.", findings_options: ["Restricted"], when_to_perform: "Pituitary mass concern", diagnostic_target: "Graves orbitopathy severity", LR_plus: "n/a", LR_minus: "n/a", management_change: "Escalate thyroid eye care", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "moderate", limitations: "Context", tags: ["pituitary"], source: syntheticSource },
      { id: "bad_exam_hyperpigmentation", label: "Inspect oral mucosa for hyperpigmentation", item_type: "physical_exam_maneuver", technique: "Inspect mucosa.", findings_options: ["Present"], when_to_perform: "Adrenal concern", diagnostic_target: "Cushing bruising and striae phenotype", LR_plus: "n/a", LR_minus: "n/a", management_change: "Escalate hypercortisolism workup", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "low", limitations: "Context", tags: ["adrenal"], source: syntheticSource },
      { id: "bad_exam_pedal_pulses", label: "Palpate pedal pulses", item_type: "physical_exam_maneuver", technique: "Palpate pulses.", findings_options: ["Weak"], when_to_perform: "Diabetes foot concern", diagnostic_target: "Dehydration and volume status", LR_plus: "n/a", LR_minus: "n/a", management_change: "Give fluids", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "low", limitations: "Context", tags: ["diabetes"], source: syntheticSource },
      { id: "bad_exam_acanthosis", label: "Inspect neck for acanthosis", item_type: "physical_exam_maneuver", technique: "Inspect neck.", findings_options: ["Present"], when_to_perform: "Metabolic risk", diagnostic_target: "Thyroid structural disease", LR_plus: "n/a", LR_minus: "n/a", management_change: "Order thyroid ultrasound", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "low", limitations: "Context", tags: ["metabolic"], source: syntheticSource },
      { id: "bad_exam_tremor", label: "Assess tremor with outstretched hands", item_type: "physical_exam_maneuver", technique: "Ask patient to hold hands out and observe.", findings_options: ["Fine tremor"], when_to_perform: "Pheochromocytoma concern", diagnostic_target: "Growth hormone excess phenotype with acral soft-tissue enlargement", LR_plus: "n/a", LR_minus: "n/a", management_change: "Order IGF-1", difficulty: "easy", time_burden_minutes: 1, equipment_needed: "none", patient_cooperation_required: "low", limitations: "Context", tags: ["pheochromocytoma"], source: syntheticSource }
    ],
    conditionalQuestions: [],
    conditionalExam: [],
    initialTests: [],
    dispositionRules: [],
    differentialBuckets: []
  }
], complaintSourceRegistry);
assert.equal(badModuleAudit.ok, false, "bad synthetic module should fail validation");
assert.match(badModuleAudit.issues.join("\n"), /redFlags\.bad_red_flag item_type must be red_flag/, "validator should enforce item_type by section");
assert.match(badModuleAudit.issues.join("\n"), /safetyChecks\.bad_safety item_type must be safety_check/, "validator should reject wrong safety item_type");
assert.match(badModuleAudit.issues.join("\n"), /basic bedside data\/safety item belongs in safetyChecks/, "validator should keep vitals out of physical exam sections");
assert.match(badModuleAudit.issues.join("\n"), /exam label appears bundled or vague/, "validator should reject bundled physical exam labels");
assert.match(badModuleAudit.issues.join("\n"), /invalid LR_plus/, "validator should reject non-numeric/non-n\/a LR values");
assert.match(badModuleAudit.issues.join("\n"), /invalid time_burden_minutes/, "validator should reject non-numeric time burden metadata");
assert.match(badModuleAudit.issues.join("\n"), /invalid difficulty/, "validator should reject unsupported difficulty metadata");
assert.match(badModuleAudit.issues.join("\n"), /invalid patient_cooperation_required/, "validator should reject unsupported cooperation metadata");
assert.match(badModuleAudit.issues.join("\n"), /history question uses generic generated management implication/, "validator should reject generated generic history management boilerplate");
assert.match(badModuleAudit.issues.join("\n"), /history question needs text, options, when_to_ask, diagnostic_purpose, management_implication, likelihood_ratio_note, and tags/, "validator should require history question LR interpretation notes");
assert.match(badModuleAudit.issues.join("\n"), /exam action is generic generated filler/, "validator should reject generated generic exam action boilerplate");
assert.match(badModuleAudit.issues.join("\n"), /exam rationale is generic rather than maneuver-specific/, "validator should reject generated generic exam rationale boilerplate");
assert.match(badModuleAudit.issues.join("\n"), /exam semantic mismatch: skin turgor/, "validator should reject mismatched exam findings and diagnostic targets");
assert.match(badModuleAudit.issues.join("\n"), /extraocular movements should not inherit Graves\/orbitopathy wording/, "validator should reject cross-condition eye exam metadata leakage");
assert.match(badModuleAudit.issues.join("\n"), /hyperpigmentation findings must not inherit Cushing/, "validator should reject adrenal hyperpigmentation metadata leakage");
assert.match(badModuleAudit.issues.join("\n"), /pedal pulses must target diabetic foot perfusion/, "validator should reject pedal-pulse dehydration metadata leakage");
assert.match(badModuleAudit.issues.join("\n"), /acanthosis must target insulin resistance/, "validator should reject acanthosis thyroid metadata leakage");
assert.match(badModuleAudit.issues.join("\n"), /tremor maneuvers must not inherit acromegaly/, "validator should reject tremor/acral-hand metadata collisions");

assert.ok(complaintModules.length >= 2, "MVP should include at least chest pain and hyperglycemia/DKA modules");
assert.ok(complaintSourceRegistry.some((source) => source.id === "AHA_ACC_CHEST_PAIN_2021"), "source registry should include chest pain guideline");
assert.ok(complaintSourceRegistry.some((source) => source.id === "ADA_HYPERGLYCEMIC_CRISES_2024"), "source registry should include 2024 hyperglycemic crises consensus");
assert.ok(complaintSourceRegistry.some((source) => source.id === "ADA_STANDARDS_HOSPITAL_2026"), "source registry should include 2026 ADA hospital standards");
assert.ok(complaintSourceRegistry.some((source) => source.id === "SSC_SEPSIS_2026"), "source registry should include current sepsis guidance");
assert.ok(complaintSourceRegistry.some((source) => source.id === "ATS_CAP_2025"), "source registry should include current adult CAP guidance");
assert.ok(complaintSourceRegistry.some((source) => source.id === "MERCK_FEVER_ADULTS"), "source registry should include fever evaluation reference");

function labels(items) {
  return items.map((item) => item.label.toLowerCase()).join(" | ");
}

function assertNoVagueRenderedExamLabels(moduleId, items) {
  const vagueLabels = items
    .map((item) => item.label || "")
    .filter((label) => /^(?:assess|evaluate|screen for)\b|\b(?:assessment|survey)\b/i.test(label));
  assert.deepEqual(
    vagueLabels,
    [],
    `${moduleId} should render action-specific physical exam labels instead of vague assessment labels`
  );
}

function historyQuestionNeedsDetailPrompts(question) {
  const text = String(question.text || question.label || "");
  const commaCount = (text.match(/,/g) || []).length;
  const orCount = (text.match(/\bor\b/gi) || []).length;
  return text.length >= 150
    || commaCount >= 5
    || orCount >= 4
    || (/^Any\b/i.test(text.trim()) && commaCount >= 3);
}

function assertHistoryDetailPrompts(moduleId, questions) {
  questions.forEach((question) => {
    if (!historyQuestionNeedsDetailPrompts(question)) {
      return;
    }
    assert.ok(
      (question.detail_prompts || []).length >= 2,
      `${moduleId}.${question.id}: broad history question should expose concrete detail prompts`
    );
    (question.detail_prompts || []).forEach((prompt) => {
      assert.ok(String(prompt || "").trim().length >= 12, `${moduleId}.${question.id}: detail prompt should be clinically useful`);
    });
  });
}

function assertHas(items, pattern, message) {
  assert.ok(pattern.test(labels(items)), `${message}: ${labels(items)}`);
}

function combinedWorkupText(result) {
  return [
    ...(result.safetyChecks || []),
    ...(result.requiredQuestions || []),
    ...(result.conditionalQuestions || []),
    ...(result.focusedExam || []),
    ...(result.requiredExam || []),
    ...(result.conditionalExam || []),
    ...(result.initialTests || []),
    ...(result.dispositionRules || []),
    ...(result.decisionTrees || []),
    ...(result.treatmentOptions || []),
    ...(result.redFlags || []),
    ...(result.differentialBuckets || [])
  ]
    .map((item) => JSON.stringify(item))
    .join("\n")
    .toLowerCase();
}

function assertFeverWorkupMeetsGeneralClinicianFloor(result) {
  const text = combinedWorkupText(result);
  [
    ["respiratory source history", /cough[\s\S]*sputum[\s\S]*dyspnea|shortness of breath[\s\S]*pleuritic|respiratory source/],
    ["urinary and flank source history", /dysuria[\s\S]*flank|urinalysis[\s\S]*urine culture/],
    ["GI and abdominal source history", /abdominal pain[\s\S]*(vomiting|diarrhea)|abdominal source/],
    ["skin, wound, or line source history", /rash[\s\S]*(wound|line)|skin[\s\S]*source/],
    ["neurologic danger history", /headache[\s\S]*neck stiffness|meningitis|photophobia/],
    ["host and exposure risk history", /immunosuppression[\s\S]*pregnancy[\s\S]*(travel|hospitalization)|animal exposure|food or water exposure/],
    ["severity, hydration, and perfusion history", /poor intake[\s\S]*(dehydration|low urine output|fainting)|perfusion/],
    ["lung auscultation", /auscultate posterior lung fields|lung sounds|breath sounds/],
    ["skin/wound source inspection", /inspect skin for infection source|wound|line site|cellulitis/],
    ["HEENT source inspection", /inspect oropharynx|sore throat|ear|sinus|dental/],
    ["mental status and perfusion exam", /mental status[\s\S]*(perfusion|altered)|palpate radial pulses/],
    ["source-directed tests", /source-directed infection studies|chest imaging|urinalysis|urine culture|blood cultures/],
    ["escalation and safety-net disposition", /escalate unstable fever|outpatient follow-up only when low risk|sepsis pathway/]
  ].forEach(([label, pattern]) => {
    assert.match(text, pattern, `fever workup should meet clinician-floor coverage for ${label}`);
  });
}

function assertTraceableComplaintItem(module, item, group) {
  assert.ok(item.traceability, `${module.id}.${group}.${item.id} missing traceability`);
  assert.equal(item.traceability.module_id, module.id, `${module.id}.${group}.${item.id} trace should include module id`);
  const expectedItemId = group === "limitationsAndInterpretationCautions"
    ? String(item.id || "").replace(/_limitation$/, "")
    : item.id;
  assert.equal(item.traceability.item_id, expectedItemId, `${module.id}.${group}.${item.id} trace should include item id`);
  assert.equal(item.traceability.item_group, group, `${module.id}.${group}.${item.id} trace should include item group`);
  assert.ok(
    (item.traceability.source_ids || []).includes(item.source?.source_id),
    `${module.id}.${group}.${item.id} trace should include source id`
  );
}

const checklistOptionSourceGroups = [
  ["requiredQuestions", "bedside"],
  ["conditionalQuestions", "bedside"],
  ["requiredExam", "exam"],
  ["conditionalExam", "exam"],
  ["safetyChecks", "exam"]
];

function optionControlValue(item = {}) {
  return item.options
    || item.answer_options
    || item.answerOptions
    || item.findings_options
    || item.findingsOptions
    || "";
}

function hasOptionControl(value) {
  return Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0;
}

function optionControlEntries(value = "") {
  if (Array.isArray(value)) {
    return value
      .map((option) => ({
        value: typeof option === "string" ? option : option?.value || option?.label || "",
        label: typeof option === "string" ? option : option?.label || option?.value || ""
      }))
      .map((option) => ({
        value: String(option.value || "").trim(),
        label: String(option.label || "").replace(/\s+/g, " ").trim()
      }))
      .filter((option) => option.label);
  }
  return String(value || "")
    .split(/\s*(?:[;|]|\s+\/\s+)\s*/)
    .map((label) => String(label || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((label) => ({ value: label, label }));
}

function optionControlLabelText(value = "") {
  return optionControlEntries(value).map((option) => option.label).join(" / ");
}

function normalizedOptionLabel(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/_{2,3}/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertNoGenericSourceOptionModifiers(modules = complaintModules) {
  const failures = [];
  modules.forEach((module) => {
    checklistOptionSourceGroups.forEach(([group, kind]) => {
      (module[group] || []).forEach((item) => {
        const value = optionControlValue(item);
        if (!hasOptionControl(value)) {
          return;
        }
        if (hasGenericOnlyChecklistOptions(value, kind)) {
          failures.push(`${module.id}.${group}.${item.id || item.label}: ${optionControlLabelText(value)}`);
        }
      });
    });
  });
  assert.deepEqual(failures, [], "source checklist option modifiers should be item-specific, not generic-only");
}

function walkObject(value, visit) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => walkObject(entry, visit));
    return;
  }
  visit(value);
  Object.values(value).forEach((entry) => walkObject(entry, visit));
}

function conditionalTriggerTerms(module = {}) {
  const terms = new Set();
  walkObject(module, (item) => {
    [...(item.when?.termsAny || []), ...(item.when?.termsAll || [])].forEach((term) => {
      if (String(term || "").trim()) {
        terms.add(String(term).trim());
      }
    });
  });
  return Array.from(terms);
}

function firstPositiveAnswerValue(item = {}) {
  const entry = optionControlEntries(optionControlValue(item)).find((option) => {
    const key = normalizedOptionLabel(option.label);
    return key
      && !/^(?:no|none|not possible|not applicable|unknown|unsure|not sure|other|baseline|resolved|taking as prescribed)\b/.test(key)
      && !/\bmissing$/.test(key);
  });
  return entry?.value || "";
}

function positiveAnswerMapForModule(module = {}) {
  const answers = {};
  [...(module.requiredQuestions || []), ...(module.conditionalQuestions || [])].forEach((item) => {
    const value = firstPositiveAnswerValue(item);
    if (item.id && value) {
      answers[item.id] = value;
    }
  });
  return answers;
}

function generatedChecklistGenericFailures(module = {}, scenarioName = "", contextText = "", answers = {}) {
  const result = evaluateComplaintCds(contextText, answers, { module });
  const text = buildLocalChecklistFromWorkup({ complaintResult: result });
  const failures = [];
  parseChecklist(text).forEach((section) => {
    (section.items || []).forEach((item) => {
      const kind = item.category || section.category;
      const value = item.rawValue || item.options;
      if (hasGenericOnlyChecklistOptions(value, kind)) {
        failures.push(`${module.id}.${scenarioName}.${kind}.${item.label}: ${optionControlLabelText(value)}`);
      }
    });
  });
  return failures;
}

function generatedChecklistBundledLabelFailures(module = {}, scenarioName = "", contextText = "", answers = {}) {
  const result = evaluateComplaintCds(contextText, answers, { module });
  const text = buildLocalChecklistFromWorkup({ complaintResult: result });
  const failures = [];
  parseChecklist(text).forEach((section) => {
    (section.items || []).forEach((item) => {
      const kind = item.category || section.category;
      const label = String(item.label || "").replace(/\s+/g, " ").trim();
      const canonicalSourceDomain = /^Any (?:respiratory source symptoms|throat, ear, sinus, dental, or oral source symptoms|urinary or flank source symptoms|abdominal or GI source symptoms|skin, wound, line, or device source symptoms|severe headache, stiff neck, confusion, seizure, hot swollen joint, severe back pain, fainting, very low urine, or symptoms getting worse quickly)\?$/i.test(label);
      if (canonicalSourceDomain) {
        return;
      }
      const commaCount = (label.match(/,/g) || []).length;
      const andOrCount = (label.match(/\b(?:and|or)\b/gi) || []).length;
      const slashCount = (label.match(/\//g) || []).length;
      const bundled = kind === "exam"
        ? andOrCount >= 1 || slashCount >= 1
        : commaCount >= 2 || andOrCount >= 3 || slashCount >= 2 || label.length > 150;
      if (bundled) {
        failures.push(`${module.id}.${scenarioName}.${kind}.${label}`);
      }
    });
  });
  return failures;
}

function assertNoGenericGeneratedChecklistModifiers(module = {}) {
  const maxTriggerContext = [
    module.label,
    ...conditionalTriggerTerms(module)
  ].filter(Boolean).join(" ");
  const scenarios = [
    ["base", module.label || module.id, {}],
    ["max-trigger", maxTriggerContext || module.label || module.id, positiveAnswerMapForModule(module)]
  ];
  const failures = scenarios.flatMap(([name, contextText, answers]) => generatedChecklistGenericFailures(module, name, contextText, answers));
  assert.deepEqual(failures, [], `${module.id} generated checklist modifiers should be item-specific in base and max-trigger scenarios`);
  const bundledFailures = scenarios.flatMap(([name, contextText, answers]) => generatedChecklistBundledLabelFailures(module, name, contextText, answers));
  assert.deepEqual(bundledFailures, [], `${module.id} generated checklist labels should be atomized in base and max-trigger scenarios`);
}

assertNoGenericSourceOptionModifiers();

function answerMap(entries) {
  return Object.fromEntries(entries);
}

const chestModule = selectComplaintModule("acute chest pain with pressure and diaphoresis");
assert.equal(chestModule?.id, "chest_pain_v1", "chest pain text should route to chest pain module");

const dkaModule = selectComplaintModule("hyperglycemia with vomiting and missed insulin possible dka");
assert.equal(dkaModule?.id, "hyperglycemia_possible_dka_v1", "hyperglycemia text should route to DKA/HHS module");

const feverModule = selectComplaintModule("fever with chills and possible pneumonia");
assert.equal(feverModule?.id, "fever_infection_sepsis_v1", "fever text should route to fever/infection/sepsis module");

const lowTestosteroneModule = selectComplaintModule("low testosterone with low libido and fatigue");
assert.equal(lowTestosteroneModule?.id, "hypogonadism_v1", "low testosterone text should route to hypogonadism module");
const testosteroneDeficiencyModule = selectComplaintModule("testosterone deficiency and reduced morning erections");
assert.equal(testosteroneDeficiencyModule?.id, "hypogonadism_v1", "testosterone deficiency text should route to hypogonadism module");
const lowTestosteroneResult = evaluateComplaintCds(
  "testosterone deficiency with low libido and reduced morning erections",
  {},
  { module: testosteroneDeficiencyModule }
);
const lowTestosteroneChecklist = parseChecklist(buildLocalChecklistFromWorkup(
  { complaintResult: lowTestosteroneResult, recommendation: lowTestosteroneResult.recommendation },
  { allowGenericFallbacks: true, maxBedsideQuestions: 18, maxExamItems: 15, includeSafetyInExamChecklist: true }
));
assert.ok(
  lowTestosteroneChecklist.flatMap((section) => section.items || []).length >= 8,
  "testosterone deficiency should build a parseable bedside checklist"
);
assert.match(
  lowTestosteroneChecklist.flatMap((section) => section.items || []).map((item) => item.label || item.text || "").join("\n"),
  /libido|morning erections|testicular/i,
  "testosterone deficiency checklist should include hypogonadism-specific bedside questions"
);

const plainFever = evaluateComplaintCds("fever", {}, { module: feverModule });
assert.equal(plainFever.matched, true, "plain fever should match the fever/infection/sepsis module");
assert.equal(plainFever.module.id, "fever_infection_sepsis_v1");
assertFeverWorkupMeetsGeneralClinicianFloor(plainFever);
const plainFeverQuestions = [
  ...(plainFever.requiredQuestions || []),
  ...(plainFever.conditionalQuestions || [])
];
assert.ok(
  !plainFeverQuestions.some((question) => question.id === "fever_source_localizing_symptoms"
    || /what symptoms localize the fever source/i.test(`${question.label || ""} ${question.text || ""}`)),
  "plain fever should atomize the broad source-localizing parent question before rendering recommendations"
);
[
  "fever_source_localizing_symptoms__heent_oral",
  "fever_source_localizing_symptoms__urinary_flank",
  "fever_source_localizing_symptoms__abdominal_gi",
  "fever_source_localizing_symptoms__skin_wound_line",
  "fever_source_localizing_symptoms__cns_joint_spine"
].forEach((childId) => {
  const child = plainFeverQuestions.find((question) => question.id === childId);
  assert.ok(child, `plain fever should include atomized source-domain question ${childId}`);
  assert.equal(child.traceability?.parent_item_id, "fever_source_localizing_symptoms", `${childId} should trace to the parent source question`);
  assert.equal(child.traceability?.atomized_from_history_question, true, `${childId} should preserve atomization traceability`);
});
assert.ok(
  plainFeverQuestions.some((question) => question.id === "fever_severity_intake_perfusion_question"),
  "plain fever atomization should not erase the separate severity, hydration, and perfusion history question"
);
assert.ok(
  !plainFeverQuestions.some((question) => question.id === "fever_urinary_source_question"),
  "plain fever should not duplicate the urinary/flank source row after atomizing the broad source question"
);
const plainFeverChecklist = buildLocalChecklistFromWorkup({ complaintResult: plainFever });
assert.match(
  plainFeverChecklist,
  /Any respiratory source symptoms\?: No \/ Cough \/ Sputum \/ Shortness of breath \/ Pleuritic pain \/ Wheeze \/ New oxygen need \/ Other ___/i,
  "plain fever checklist should visibly ask respiratory source questions without needing pneumonia keywords"
);
assert.doesNotMatch(
  plainFeverChecklist,
  /Any cough\?:|Any sputum\?:|Any shortness of breath\?:|Any pleuritic pain\?:/i,
  "plain fever checklist should not duplicate the respiratory source-domain question with single-symptom rows"
);
assert.match(
  plainFeverChecklist,
  /Auscultate posterior lung fields: Clear \/ Crackles \/ Wheezes \/ Rhonchi \/ Diminished \/ Asymmetric \/ Unable to assess/i,
  "plain fever checklist should visibly recommend lung auscultation with source-specific finding options"
);
assert.match(
  plainFeverChecklist,
  /Inspect skin for infection source: No focal skin source \/ Rash \/ Cellulitis \/ Abscess \/ Wound or drainage \/ Line-site inflammation \/ Petechiae or purpura \/ Unable to assess/i,
  "plain fever checklist should visibly include skin, wound, and line-source inspection"
);

const unmatched = evaluateComplaintCds("ankle sprain after basketball");
assert.equal(unmatched.matched, false, "unsupported complaint should return no-match response");
assert.equal(unmatched.unsupported, true, "unsupported complaint should expose unsupported/gap state");
assert.equal(unmatched.finalRecommendationAuthorized, false, "unsupported complaint should not authorize recommendations");
assert.equal(unmatched.authorizationStatus, "unsupported_gap", "unsupported complaint should be labeled as a staged gap");
assert.equal(unmatched.catalogGapsNeedingReview.length, 1, "unsupported complaint should stage a catalog gap for review");
assert.equal(unmatched.unsupportedClinicalIntentGap.gap_status, "staged_gap", "unsupported gap should remain staged");
assert.match(unmatched.unsupportedClinicalIntentGap.activation_rule, /cannot authorize recommendations/i, "unsupported gap should not authorize recommendations");
assert.ok(/medical knowledge database/.test(unmatched.message), "no-match response should point to installed medical knowledge database coverage");

const unsupportedPhi = evaluateComplaintCds("patient name: Jane Doe MRN 12345 DOB 1/2/1990 room 412B with purple fingernails after mango");
const unsupportedPhiReport = formatComplaintCdsReport(unsupportedPhi);
assert.ok(unsupportedPhiReport.includes("Recommendations: none"), "unsupported report should explicitly block recommendations");
assert.ok(unsupportedPhiReport.includes("Unsupported/gap state"), "unsupported report should expose gap state");
assert.ok(unsupportedPhiReport.includes("Catalog gaps needing review"), "unsupported report should expose reviewable catalog gap section");
assert.match(unsupportedPhiReport, /\[name\]|\[identifier\]|\[date\]|\[location\]/, "unsupported report should redact obvious PHI-like content");
assert.doesNotMatch(unsupportedPhiReport, /Jane Doe|12345|1\/2\/1990|412B/i, "unsupported report should not copy obvious PHI-like content");
assert.match(unsupportedPhiReport, /purple fingernails after mango/i, "unsupported report should preserve non-identifying clinical concern text");

const unsupportedPhiMetadata = evaluateComplaintCds(
  "weird unsupported symptom",
  {},
  {
    setting: "room 412B after 1/2/1990 transfer",
    population: "Adult DOB 1970-01-02",
    reviewer: "Jane Doe"
  }
);
const unsupportedPhiMetadataReport = formatComplaintCdsReport(unsupportedPhiMetadata);
assert.doesNotMatch(unsupportedPhiMetadataReport, /412B|1\/2\/1990|1970-01-02|Jane Doe/i, "unsupported metadata should not leak room, dates, or reviewer names");
assert.equal(unsupportedPhiMetadata.unsupportedClinicalIntentGap.review_owner, "local_reviewer", "unsafe reviewer labels should be replaced with a local reviewer id");
assert.match(unsupportedPhiMetadataReport, /\[location\]|\[date\]/, "unsupported metadata report should show sanitized placeholders");

const matchedPhi = evaluateComplaintCds("patient name: Jane Doe MRN 12345 DOB 1/2/1990 room 412B hyperglycemia possible DKA vomiting");
const matchedPhiReport = formatComplaintCdsReport(matchedPhi);
assert.equal(matchedPhi.matched, true, "PHI-containing DKA text should still resolve to the validated DKA module");
assert.match(matchedPhiReport, /\[name\]|\[identifier\]|\[date\]|\[location\]/, "matched report input line should redact obvious PHI-like content");
assert.doesNotMatch(matchedPhiReport, /Jane Doe|12345|1\/2\/1990|412B/i, "matched report should not copy obvious PHI-like content from the concern/search text");
assert.match(matchedPhiReport, /hyperglycemia possible DKA vomiting/i, "matched report should preserve non-identifying validated clinical concern text");

const chestPain = evaluateComplaintCds(
  "Emergency medicine/admission adult acute chest pain with pressure, diaphoresis, dyspnea, syncope, hypoxia, and possible leg swelling",
  answerMap([
    ["cp_dyspnea", "yes"],
    ["cp_syncope", "yes"],
    ["cp_vte_risk", "yes"]
  ])
);
assert.equal(chestPain.matched, true, "chest pain case should match");
assert.equal(chestPain.module.id, "chest_pain_v1");
assert.ok(chestPain.triggeredRedFlags.length >= 2, "high-risk chest pain should trigger red flags");
assertHas(chestPain.requiredQuestions, /onset|radiate|exertional|shortness/, "chest pain should ask core history");
assertHas(chestPain.conditionalQuestions, /unilateral leg swelling|pregnancy|reproducible/, "chest pain should activate conditional history");
assertHas(chestPain.safetyChecks, /measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation/, "chest pain should separate basic bedside safety checks from the exam");
assertHas(chestPain.focusedExam, /auscultate heart rhythm|auscultate lung sounds|inspect unilateral leg swelling|assess jugular venous pressure/, "chest pain should recommend atomic cardiopulmonary and VTE exam maneuvers");
assert.ok(!/measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation/i.test(labels(chestPain.focusedExam)), "chest pain focused exam should not contain vital signs");
assertHas(chestPain.initialTests, /ecg|troponin|ct pulmonary|d-dimer|chest x-ray/, "chest pain should recommend immediate tests");
assertHas(chestPain.dispositionRules, /emergency|structured chest pain/, "chest pain should include disposition cues");
assert.ok(chestPain.sources.every((source) => source.url.startsWith("http")), "sources should include URLs");
const chestPainChecklist = buildLocalChecklistFromWorkup({ complaintResult: chestPain }, { maxBedsideQuestions: 18 });
assert.match(
  chestPainChecklist,
  /What does the chest discomfort feel like\?: Pressure or heaviness \/ Sharp or pleuritic \/ Burning or reflux-like \/ Tight or crushing \/ Other quality ___ \/ Unsure/i,
  "source-backed chest pain checklist should atomize quality into item-specific controls"
);
assert.match(
  chestPainChecklist,
  /Where is the chest discomfort located\?: Central or left chest \/ Right chest \/ Epigastric \/ Back \/ Diffuse \/ Other location ___ \/ Unsure/i,
  "source-backed chest pain checklist should atomize location into item-specific controls"
);
assert.match(
  chestPainChecklist,
  /Does the chest discomfort radiate\?: No radiation \/ Arm radiation \/ Jaw radiation \/ Back radiation \/ Shoulder radiation \/ Multiple sites \/ Other ___/i,
  "source-backed chest pain checklist should atomize radiation into item-specific controls"
);
assert.doesNotMatch(
  chestPainChecklist,
  /What does it feel like, where is it|What does it feel like present|Any it radiate to arm|Jaw present|No known known CAD|Any known CAD|Any syncope|Any presyncope|prior MI|CABG|CKD/i,
  "source-backed chest pain checklist should not keep bundled rows or generic fragment controls"
);
assert.match(
  chestPainChecklist,
  /Have you ever been told you have coronary artery disease\?|Did you faint or pass out\?|Did you feel like you might faint or pass out\?/i,
  "source-backed chest pain checklist should rewrite shorthand into patient-facing questions"
);

const suspectedPeIntent = getClinicalIntentById("suspected_pe_v1");
const suspectedPeModule = complaintModules.find((module) => module.id === suspectedPeIntent.complaint_module_id);
const suspectedPe = evaluateComplaintCds("suspected PE", {}, {
  module: suspectedPeModule,
  selectedIntents: [suspectedPeIntent]
});
assert.equal(suspectedPe.module.id, "chest_pain_v1", "suspected PE intent should use the validated chest-pain/PE module scope");
assertHas(suspectedPe.requiredQuestions, /shortness of breath|pleuritic|hemoptysis|oxygen/, "suspected PE should ask PE-relevant cardiopulmonary history");
assertHas(suspectedPe.focusedExam, /assess work of breathing|auscultate lung sounds|inspect unilateral leg swelling|compare calf circumference/, "suspected PE selected intent should activate DVT leg exam even when the literal query is abbreviated");
assert.ok(
  suspectedPe.focusedExam.some((item) => (item.traceability?.intent_ids || []).includes("suspected_pe_v1")),
  "suspected PE exam items should trace back to the selected validated intent"
);
assert.ok(suspectedPe.suppressedNotRecommendedItems.length > 0, "selected PE intent should expose suppressed/not-recommended scope-control items");
assertHas(suspectedPe.suppressedNotRecommendedItems, /pmi|abdominal palpation|bowel sounds|cva tenderness|vibration sense/i, "selected PE intent should surface intent suppress rules");
suspectedPe.suppressedNotRecommendedItems.forEach((item) => {
  assert.equal(item.item_type, "suppressed_item", `${item.id} should be typed as a suppressed item`);
  assert.ok(item.reason || item.suppressionReason, `${item.id} should explain why it was not recommended`);
  assert.ok(item.traceability?.intent_ids?.includes("suspected_pe_v1"), `${item.id} should trace to selected PE intent`);
  assert.ok(item.source?.source_id, `${item.id} should retain source metadata`);
  assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_plus"), `${item.id} should preserve LR_plus field`);
  assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_minus"), `${item.id} should preserve LR_minus field`);
  assert.ok(item.likelihood_ratio_note, `${item.id} should explain LR non-applicability`);
  assert.ok(item.limitations, `${item.id} should preserve interpretation limitations`);
});

const suspectedPeWithGap = evaluateComplaintCds("suspected PE", {}, {
  module: suspectedPeModule,
  selectedIntents: [suspectedPeIntent],
  catalogGapsNeedingReview: [
    {
      id: "GAP-PE-BEDSIDE-QUESTION",
      label: "Validated PE bedside probability question refinement",
      source_id: "AHRQ_CALIBRATE_DX",
      required_domain: "PE probability and anticoagulation-risk question wording",
      resolution_plan: "Review and stage a source-backed question before promoting to recommendations.",
      tags: ["catalog_gap", "pulmonary_embolism", "review_needed"]
    }
  ]
});
assert.equal(suspectedPeWithGap.catalogGapsNeedingReview.length, 1, "selected workup should expose staged catalog gaps separately");
assert.equal(suspectedPeWithGap.catalogGapsNeedingReview[0].item_type, "catalog_gap", "catalog gap should not be promoted to a recommendation item");
assert.ok(
  suspectedPeWithGap.catalogGapsNeedingReview[0].traceability?.intent_ids?.includes("suspected_pe_v1"),
  "catalog gap should trace to the selected validated intent"
);

const dka = evaluateComplaintCds(
  "Endocrinology consult adult hyperglycemia possible DKA with vomiting, abdominal pain, missed insulin, ketones, Kussmaul respirations, confusion, dehydration, and fever",
  answerMap([
    ["dka_vomit_abdomen", "yes"],
    ["dka_missed_insulin", "yes"],
    ["dka_infection_trigger", "yes"],
    ["dka_mental_status_question", "yes"],
    ["dka_hhs_features", "yes"]
  ])
);
assert.equal(dka.matched, true, "DKA case should match");
assert.equal(dka.module.id, "hyperglycemia_possible_dka_v1");
assert.ok(dka.triggeredRedFlags.length >= 3, "severe DKA should trigger multiple red flags");
assertHas(dka.requiredQuestions, /insulin|ketone|polyuria|infection|confusion/, "DKA should ask core crisis history");
assertHas(dka.conditionalQuestions, /hyperosmolar|infection/, "DKA should ask conditional HHS/source history");
assertHas(dka.safetyChecks, /measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation|measure temperature|assess mental status/, "DKA should separate basic bedside safety checks and mental status from the exam");
assertHas(dka.focusedExam, /inspect mucous membranes|observe kussmaul breathing|test capillary refill|palpate distal extremity warmth|palpate abdomen|auscultate lungs/, "DKA should recommend atomic volume, respiratory, perfusion, abdominal, and source exam maneuvers");
assert.doesNotMatch(labels(dka.focusedExam), /mental status/i, "DKA mental status should remain basic safety/acuity data, not a physical exam maneuver");
assertNoVagueRenderedExamLabels("hyperglycemia_possible_dka_v1", dka.focusedExam);
assert.ok(
  dka.focusedExam.some((item) => !item.original_label && item.label === "Observe Kussmaul breathing"),
  "DKA source module should store action-specific Kussmaul breathing wording without requiring display-time label repair"
);
assert.ok(!/measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation|measure temperature|measure current weight/i.test(labels(dka.focusedExam)), "DKA focused exam should not contain vital signs or basic measurements");
const dkaSkinTurgor = dka.focusedExam.find((item) => /skin turgor/i.test(item.label));
assert.ok(dkaSkinTurgor, "DKA should include skin turgor as a dehydration/perfusion maneuver");
assert.match(dkaSkinTurgor.diagnostic_target, /dehydration|perfusion|shock/i, "DKA skin turgor should target dehydration/perfusion");
assert.doesNotMatch(dkaSkinTurgor.findings_options.join(" "), /wound|drainage|ulcer/i, "DKA skin turgor findings should not inherit wound metadata");
assertHas(dka.initialTests, /point-of-care glucose|beta-hydroxybutyrate|metabolic panel|blood gas|osmolality|ecg|cbc|a1c/, "DKA should recommend immediate crisis labs/tests");
assertHas(dka.dispositionRules, /urgent|icu|high-acuity|potassium|basal overlap|discharge/, "DKA should include high-acuity and transition/discharge cues");
assertHas(dka.differentialBuckets, /glucose >=200|beta-hydroxybutyrate >=3.0|glucose >=600|osmolality >300|mixed dka\/hhs/, "DKA/HHS differential should include current diagnostic thresholds");
const dkaChecklist = buildLocalChecklistFromWorkup({ complaintResult: dka }, { maxBedsideQuestions: 18 });
assert.match(
  dkaChecklist,
  /What type of diabetes do you have\?: Type 1 \/ Type 2 \/ Other \/ Unknown/i,
  "source-backed DKA checklist should atomize diabetes type controls"
);
assert.match(
  dkaChecklist,
  /Any insulin pump use\?: No pump \/ Pump in use \/ Pump stopped or removed \/ Pump malfunction concern \/ Unknown \/ Other ___/i,
  "source-backed DKA checklist should atomize pump-use controls"
);
assert.match(
  dkaChecklist,
  /Any CGM use\?: No CGM \/ CGM in use \/ CGM unavailable \/ CGM reading concern \/ Unknown \/ Other ___/i,
  "source-backed DKA checklist should atomize CGM-use controls"
);
assert.match(
  dkaChecklist,
  /Any missed or reduced insulin\?: Taking as prescribed \/ Missed insulin \/ Reduced dose \/ Unable to obtain insulin \/ Unsure \/ Other ___/i,
  "source-backed DKA checklist should atomize missed-insulin controls"
);
assert.doesNotMatch(
  dkaChecklist,
  /Known diabetes type, duration, insulin regimen|Missed or reduced insulin, pump\/infusion-set failure|Any missed or reduced insulin\?: No missed|Any polyuria\?: .*present.*worse than baseline|Any confusion\?: .*present.*worse than baseline/i,
  "source-backed DKA checklist should not keep bundled rows or generic present/worse controls"
);

const fever = evaluateComplaintCds(
  "Adult clinic fever with chills, cough, sputum, possible pneumonia, dysuria, flank pain, rash, and no clear source yet",
  answerMap([
    ["fever_urinary_source_question", "yes"],
    ["fever_abdominal_gi_source_question", "abdominal_pain"],
    ["fever_cns_meningeal_source_question", "headache_neck"],
    ["fever_skin_line_source_question", "wound_ulcer"]
  ]),
  { selectedIntents: [] }
);
assert.equal(fever.matched, true, "fever case should match");
assert.equal(fever.module.id, "fever_infection_sepsis_v1");
assertHas(fever.safetyChecks, /measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation|measure temperature/, "fever should separate basic bedside safety checks from the exam");
assertHas(fever.requiredQuestions, /fever.*measured/, "fever should ask timeline and measurement history");
assertHas(fever.requiredQuestions, /throat.*ear.*sinus.*dental|dysuria.*flank|abdominal.*gi|skin.*wound.*line|cns.*joint.*spine|cough.*sputum.*shortness|immunosuppression.*pregnancy.*travel/, "fever should ask atomic source-domain and host/exposure questions");
assert.ok(
  ![...(fever.requiredQuestions || []), ...(fever.conditionalQuestions || [])].some((question) => /what symptoms localize the fever source/i.test(`${question.label || ""} ${question.text || ""}`)),
  "fever case should not reintroduce the broad source-localizing history question"
);
assertHistoryDetailPrompts("fever_infection_sepsis_v1", fever.requiredQuestions);
assertHas(
  [...fever.requiredQuestions, ...fever.conditionalQuestions],
  /dysuria|flank|catheter|resistant|abdominal|neck stiffness|rash|line|joint/,
  "fever should activate source-directed history when context supports it"
);
assertHas(fever.focusedExam, /check mental status|observe work of breathing|auscultate posterior lung fields|inspect skin for infection source|inspect oropharynx|palpate radial pulses/, "fever should recommend atomic severity, respiratory, skin, HEENT, and perfusion maneuvers");
assertNoVagueRenderedExamLabels("fever_infection_sepsis_v1", fever.focusedExam);
assertHas(fever.focusedExam, /palpate cva tenderness|percuss posterior lung fields/, "fever should activate source-directed urinary and pulmonary add-on exams when context supports them");
assert.ok(!/measure blood pressure|measure heart rate|measure respiratory rate|measure oxygen saturation|measure temperature/i.test(labels(fever.focusedExam)), "fever focused exam should not contain vital signs or basic measurements");
assertHas(fever.initialTests, /sepsis severity labs|source-directed infection studies|respiratory source imaging/, "fever should include sepsis severity, source-directed, and respiratory-source testing");
assertHas(fever.dispositionRules, /escalate unstable fever|outpatient follow-up only when low risk/, "fever should include escalation and low-risk safety-net disposition rules");
assertHas(fever.differentialBuckets, /sepsis|respiratory source|urinary or flank source|skin.*heent.*cns.*abdominal/i, "fever differential should cover serious infection plus likely source categories");
assert.ok((fever.limitationsAndInterpretationCautions || []).length >= 6, "fever should expose exam and source interpretation limitations");
assertFeverWorkupMeetsGeneralClinicianFloor(fever);

const feverIntentRows = selectedValidatedClinicalIntents(["fever_sepsis_v1"]);
const feverIntentModule = complaintModules.find((module) => module.id === "fever_infection_sepsis_v1");
const structuredUndifferentiatedFeverContext = buildClinicalIntentRetrievalContext(
  feverIntentRows,
  "undifferentiated fever in clinic",
  "General medicine",
  "Adult"
);
const structuredUndifferentiatedFever = evaluateComplaintCds(structuredUndifferentiatedFeverContext, {}, {
  module: feverIntentModule,
  selectedIntents: feverIntentRows
});
assertHas(
  structuredUndifferentiatedFever.requiredExam,
  /observe work of breathing|auscultate posterior lung fields|inspect skin for infection source|inspect oropharynx|palpate radial pulses/i,
  "structured fever intent should keep the core source-screen floor"
);
assert.doesNotMatch(
  labels(structuredUndifferentiatedFever.conditionalExam),
  /palpate cva tenderness|palpate abdomen|percuss posterior lung fields/i,
  "structured fever intent metadata tags should not activate urinary, abdominal, or lower-yield pulmonary add-on exams without patient modifiers"
);
const structuredUndifferentiatedFeverChecklist = buildLocalChecklistFromWorkup({
  complaintResult: structuredUndifferentiatedFever,
  recommendation: {
    focusedHistoryQuestions: [],
    basicSafetyChecks: [],
    corePhysicalExamManeuvers: [],
    conditionalPhysicalExamManeuvers: []
  },
  selectedIntents: feverIntentRows
}, { includeSafetyInExamChecklist: true });
assert.doesNotMatch(
  structuredUndifferentiatedFeverChecklist,
  /Palpate CVA tenderness|Palpate abdomen|Percuss posterior lung fields/i,
  "local fever checklist should not reintroduce untriggered source add-ons from guideline-module metadata"
);
const structuredTriggeredFeverContext = buildClinicalIntentRetrievalContext(
  feverIntentRows,
  "fever with dysuria, flank pain, cough, focal crackles, and asymmetric diminished breath sounds",
  "General medicine",
  "Adult"
);
const structuredTriggeredFever = evaluateComplaintCds(structuredTriggeredFeverContext, {}, {
  module: feverIntentModule,
  selectedIntents: feverIntentRows
});
assertHas(
  structuredTriggeredFever.conditionalExam,
  /palpate cva tenderness|percuss posterior lung fields/i,
  "structured fever patient modifiers should activate urinary and focal-pulmonary source add-on exams"
);

const euDka = evaluateComplaintCds(
  "Adult diabetes on SGLT2 inhibitor with vomiting, abdominal pain, ketones, and only moderately elevated glucose",
  answerMap([["dka_sglt2_pregnancy", "yes"]])
);
assert.equal(euDka.module.id, "hyperglycemia_possible_dka_v1", "SGLT2 ketotic symptoms should route to DKA module");
assertHas(euDka.redFlags.filter((item) => item.triggered), /sglt2|lower glucose/, "SGLT2 case should trigger euglycemic DKA warning");
assertHas(euDka.dispositionRules, /ketones\/acidosis|glucose is <200|stop sglt2/i, "SGLT2 case should include euglycemic disposition cue");

const report = formatComplaintCdsReport(dka);
assert.ok(report.includes("Guideline Complaint CDS"), "report should have title");
assert.ok(report.includes("ADA_HYPERGLYCEMIC_CRISES_2024"), "report should include source ids");
assert.ok(report.includes("Basic bedside data / safety checks"), "report should separate bedside safety checks");
assert.ok(report.includes("Core physical exam maneuvers"), "report should separate core physical exam maneuvers");
assert.ok(report.includes("Conditional exam add-ons"), "report should separate conditional exam add-ons from core exams");
assert.ok(report.includes("Management-changing findings / disposition cues"), "report should name management-changing findings explicitly");
assert.ok(report.includes("Suppressed/not-recommended items"), "report should include suppressed/not-recommended section even when no selected intent was passed");
assert.ok(report.includes("Catalog gaps needing review"), "report should include catalog gaps section even when none are active");
assert.ok(!report.includes("\nPhysical exam maneuvers\n"), "report should not merge core and conditional exam maneuvers into one copied section");
assert.ok(report.includes("Detail prompts:"), "report should expose concrete sub-prompts for broad history questions");
assert.ok(report.includes("Options:"), "report should preserve history question answer options");
assert.ok(report.includes("Ask when:"), "report should preserve when-to-ask metadata for history");
assert.ok(report.includes("Diagnostic purpose:"), "report should preserve history diagnostic purpose");
assert.ok(report.includes("Management implication:"), "report should preserve history management implication");
assert.ok(report.includes("Likelihood-ratio note: Question-level LR+/LR-"), "report should preserve history question LR interpretation notes");
assert.ok(report.includes("Technique:"), "report should preserve exam technique in copied reports");
assert.ok(report.includes("Findings/options:"), "report should preserve exam findings/options");
assert.ok(report.includes("Diagnostic target:"), "report should preserve exam diagnostic target");
assert.ok(report.includes("Likelihood ratios: LR+"), "report should preserve LR metadata even when unavailable");
assert.ok(
  report.includes("Note: No maneuver-specific LR+/LR- is available")
    || report.includes("Note: Likelihood ratios are not applicable"),
  "report should explain unavailable LR metadata instead of showing silent n/a placeholders"
);
assert.ok(report.includes("Feasibility:"), "report should preserve difficulty, time, equipment, and cooperation metadata");
assert.ok(report.includes("Limitations:"), "report should preserve interpretation limitations/cautions");
assert.ok(report.includes("trace hyperglycemia_possible_dka_v1"), "report should include compact module/item traceability");
assert.ok(report.includes("intent dka_hhs_v1"), "report should include selected/validated intent traceability");
assert.ok(report.includes("auth validated_complaint_module"), "legacy module report should identify module-backed authorization source");
assert.ok(!/patient name|mrn|date of birth/i.test(report), "report should not introduce PHI labels");

const feverReport = formatComplaintCdsReport(fever);
assert.ok(feverReport.includes("Fever, infection, or sepsis"), "fever report should include module title");
assert.ok(feverReport.includes("Auscultate posterior lung fields"), "fever report should copy lung auscultation");
assert.ok(feverReport.includes("Source-directed infection studies"), "fever report should copy source-directed testing");
assert.ok(feverReport.includes("Likelihood-ratio note: Question-level LR+/LR-"), "fever report should copy history question LR interpretation notes");
assert.ok(feverReport.includes("trace fever_infection_sepsis_v1"), "fever report should include compact module/item traceability");
assert.ok(feverReport.includes("intent fever_sepsis_v1"), "fever report should include validated intent traceability");
assert.ok(!/patient name|mrn|date of birth/i.test(feverReport), "fever report should not introduce PHI labels");

const suspectedPeGapReport = formatComplaintCdsReport(suspectedPeWithGap);
assert.ok(suspectedPeGapReport.includes("Suppressed/not-recommended items"), "selected PE report should include suppressed/not-recommended section");
assert.ok(suspectedPeGapReport.includes("Why not recommended:"), "selected PE report should explain why suppressed items were not recommended");
assert.ok(suspectedPeGapReport.includes("Likelihood ratios: LR+ n/a; LR- n/a. Note: Likelihood ratios are not applicable to suppression rules"), "suppression report should explain LR non-applicability");
assert.ok(suspectedPeGapReport.includes("Catalog gaps needing review"), "selected PE report should include catalog gap section");
assert.ok(suspectedPeGapReport.includes("Evidence status: staged catalog gap; not accepted evidence"), "catalog gap report should clearly mark staged gap status");
assert.ok(suspectedPeGapReport.includes("GAP-PE-BEDSIDE-QUESTION"), "catalog gap report should include staged gap trace/id");
assert.ok(suspectedPeGapReport.includes("intent suspected_pe_v1"), "selected PE report should include selected intent traceability");
assert.ok(suspectedPeGapReport.includes("auth validated_clinical_intent"), "selected PE report should identify selected validated-intent authorization source");

complaintModules.forEach((module) => {
  const result = evaluateComplaintCds(module.label, {}, { module });
  assert.equal(result.matched, true, `${module.id} should evaluate directly by module`);
  assertNoGenericGeneratedChecklistModifiers(module);
  [
    ["redFlags", result.redFlags || []],
    ["safetyChecks", result.safetyChecks || []],
    ["requiredQuestions", result.requiredQuestions || []],
    ["conditionalQuestions", result.conditionalQuestions || []],
    ["requiredExam", result.requiredExam || []],
    ["conditionalExam", result.conditionalExam || []],
    ["initialTests", result.initialTests || []],
    ["dispositionRules", result.dispositionRules || []],
    ["decisionTrees", result.decisionTrees || []],
    ["treatmentOptions", result.treatmentOptions || []],
    ["limitationsAndInterpretationCautions", result.limitationsAndInterpretationCautions || []],
    ["suppressedNotRecommendedItems", result.suppressedNotRecommendedItems || []],
    ["catalogGapsNeedingReview", result.catalogGapsNeedingReview || []],
    ["differentialBuckets", result.differentialBuckets || []]
  ].forEach(([group, items]) => {
    items.forEach((item) => assertTraceableComplaintItem(module, item, group));
  });
  assert.ok(
    (result.limitationsAndInterpretationCautions || []).length > 0,
    `${module.id} should expose limitations and interpretation cautions as a first-class section`
  );
  (result.limitationsAndInterpretationCautions || []).forEach((item) => {
    assert.equal(item.item_type, "interpretation_caution", `${module.id}.${item.id} should be typed as an interpretation caution`);
    assert.ok(item.limitation || item.interpretation_cautions, `${module.id}.${item.id} missing caution text`);
    assert.ok(item.diagnostic_target, `${module.id}.${item.id} missing diagnostic target`);
    assert.ok(item.tags?.length, `${module.id}.${item.id} missing tags`);
    assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_plus"), `${module.id}.${item.id} missing LR_plus field`);
    assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_minus"), `${module.id}.${item.id} missing LR_minus field`);
    assert.ok(item.likelihood_ratio_note, `${module.id}.${item.id} should preserve likelihood-ratio interpretation note`);
  });
  [...(module.requiredExam || []), ...(module.conditionalExam || [])].forEach((item) => {
    assert.ok(
      !isBasicBedsideDataItem(item),
      `${module.id} source physical exam sections should exclude basic bedside data: ${item.label}`
    );
    for (const field of ["technique", "findings_options", "when_to_perform", "diagnostic_target", "LR_plus", "LR_minus", "management_change", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "tags"]) {
      const value = item[field];
      assert.ok(value && (!Array.isArray(value) || value.length), `${module.id}.${item.id} source exam missing ${field}`);
    }
  });
  assert.ok(
    result.focusedExam.every((item) => !isBasicBedsideDataItem(item)),
    `${module.id} focused physical exam should exclude basic bedside data: ${labels(result.focusedExam)}`
  );
  assertNoVagueRenderedExamLabels(module.id, result.focusedExam || []);
  [...(module.requiredQuestions || []), ...(module.conditionalQuestions || [])].forEach((item) => {
    assert.ok(item.text && /\?$/.test(item.text.trim()), `${module.id}.${item.id} should have askable question text`);
    assert.ok(item.options?.length >= 3, `${module.id}.${item.id} should include answer options`);
    assert.ok(item.when_to_ask, `${module.id}.${item.id} missing when_to_ask`);
    assert.ok(item.diagnostic_purpose, `${module.id}.${item.id} missing diagnostic purpose`);
    assert.ok(item.management_implication, `${module.id}.${item.id} missing management implication`);
    assert.ok(item.likelihood_ratio_note, `${module.id}.${item.id} missing history-question LR interpretation note`);
    assert.match(
      item.likelihood_ratio_note,
      /Question-level LR\+\/LR-|not available|not applicable|Quantitative likelihood-ratio/i,
      `${module.id}.${item.id} should explain history-question LR availability`
    );
    assert.ok(item.tags?.length, `${module.id}.${item.id} missing tags`);
  });
  [...(result.requiredQuestions || []), ...(result.conditionalQuestions || [])].forEach((item) => {
    assert.ok(item.likelihood_ratio_note, `${module.id}.${item.id} evaluated history question should preserve LR interpretation note`);
  });
  assertHistoryDetailPrompts(module.id, [...(result.requiredQuestions || []), ...(result.conditionalQuestions || [])]);
  [...(result.safetyChecks || []), ...(result.focusedExam || [])].forEach((item) => {
    assert.ok(item.management_change, `${module.id}.${item.id} missing management-change metadata`);
    assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_plus"), `${module.id}.${item.id} missing LR_plus field`);
    assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_minus"), `${module.id}.${item.id} missing LR_minus field`);
    assert.ok(item.likelihood_ratio_note, `${module.id}.${item.id} should explain LR availability or non-applicability`);
    if (/^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_plus || "")) && /^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_minus || ""))) {
      assert.match(
        item.likelihood_ratio_note,
        /not applicable|not available|No maneuver-specific LR/i,
        `${module.id}.${item.id} should explain why LR is unavailable`
      );
    }
    assert.ok(item.difficulty, `${module.id}.${item.id} missing difficulty`);
    assert.ok(item.time_burden_minutes, `${module.id}.${item.id} missing time burden`);
    assert.ok(item.equipment_needed, `${module.id}.${item.id} missing equipment`);
    assert.ok(item.patient_cooperation_required, `${module.id}.${item.id} missing cooperation metadata`);
    assert.ok(item.when_to_perform, `${module.id}.${item.id} missing when-to-perform metadata`);
    assert.ok(item.limitations, `${module.id}.${item.id} missing limitations`);
  });
});

console.log("Complaint CDS tests passed.");
