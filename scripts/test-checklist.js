import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { complaintModules, evaluateComplaintCds } from "../complaint-cds.js";
import { clinicalIntentRegistry } from "../clinical-intents.js";
import {
  auditChecklistTraceability,
  buildCleanupPrompt,
  buildLocalChecklistFromWorkup,
  checklistPrompt,
  expandedLocalBedsideQuestionItems,
  groupChecklistSectionsByOrganSystem,
  hasGenericOnlyChecklistOptions,
  mergeChecklistAuditResults,
  newAdmissionChecklistPrompt,
  normalizeChecklistText,
  validateOrganSystemChecklistSchema,
  parseChecklist,
  validateChecklist
} from "../checklist.js";

function itemsByCategory(sections, category) {
  return sections.flatMap((section) => section.items).filter((item) => item.category === category);
}

function issueTypes(audit) {
  return audit.issues.map((issue) => issue.type);
}

const dkaChecklist = `BEDSIDE QUESTION CHECKLIST

SYMPTOM TRAJECTORY

Since yesterday, have you had any nausea or vomiting?: No / Yes, mild / Yes, severe / Other ___

How has your appetite been -- were you able to eat dinner last night and breakfast this morning?: Ate both full meals / Ate some / Could not eat / Other ___

Are you still feeling more thirsty than usual or urinating a lot?: No / Yes, thirst / Yes, urinating a lot / Both / Other ___

GLYCEMIC SAFETY

Have you felt shaky, sweaty, or lightheaded at any point since yesterday?: No hypoglycemia symptom / Shaky / Sweaty / Lightheaded / Other ___

DISCHARGE READINESS

Were you able to bring your insulin pen box from home?: Brought pen box / Forgot or unavailable / Someone can bring it / No access to supplies / Other ___

Do you have ketone test strips and a glucagon kit at home?: Yes, both / Ketone strips only / Glucagon only / Neither / Not sure / Other ___

SICK DAY KNOWLEDGE AND CONCERNS

If you get sick again and cannot eat, do you know what to do with your long-acting insulin?: Keep taking it / Stop it / Not sure / Other ___

What is your biggest concern about going home?: Symptom concern / Treatment concern / Discharge concern / Question for team / Other ___

TARGETED PHYSICAL EXAM CHECKLIST

RESPIRATORY STATUS

Work of breathing: Normal / Mildly increased / Markedly increased

Kussmaul breathing: Absent / Deep or labored / Respiratory distress / Unable to assess

Oxygen support: Room air / Nasal cannula / Other ___

VOLUME EXAM

Mucous membranes: Moist / Dry / Tacky

Skin turgor: Normal / Decreased

Capillary refill: Less than 2 seconds / 2 seconds or more

ABDOMINAL EXAM

Abdominal tenderness: Absent / Present, location ___

Bowel sounds: Normal / Hyperactive / Hypoactive / Absent

SKIN LINES AND WOUNDS

IV access site: Clean and intact / Erythema or swelling / Not present

Insulin injection sites if visible: No lipohypertrophy / Lipohypertrophy present, location ___

ENDOCRINE FOOT SCREEN

Pedal pulses: Palpable bilaterally / Diminished / Absent

Monofilament sensation feet: Intact bilaterally / Diminished right / Diminished left / Diminished both

Foot skin integrity: Intact / Ulcer or wound present, location ___`;

const dkaSections = parseChecklist(dkaChecklist);
const dkaAudit = validateChecklist(dkaSections);
const dkaOrganAudit = validateOrganSystemChecklistSchema(dkaSections, { throwOnError: true });
assert.ok(dkaOrganAudit.ok, "DKA sample should assign every checklist row to an organ system");
const dkaOrganSections = groupChecklistSectionsByOrganSystem(dkaSections, { throwOnError: true });
assert.ok(
  ["CARDIOPULMONARY", "ENDOCRINE / METABOLIC", "ABDOMEN / GU", "FUNCTION / SAFETY"].every((title) => dkaOrganSections.some((section) => section.title === title)),
  "organ-system grouping should preserve a clinically scannable system sweep"
);
assert.ok(
  dkaOrganSections.every((section) => section.items.every((item) => item.organSystemKey && item.originalSectionTitle)),
  "grouped organ-system items should keep schema keys and original checklist subsection labels"
);
const orphanOrganSections = parseChecklist(`BEDSIDE QUESTION CHECKLIST
FOCUSED HISTORY
Invented sparkle sign?: Glitter / Flash / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
FOCUSED EXAM
Moonbeam resonance: Low / High / Other ___`);
assert.throws(
  () => validateOrganSystemChecklistSchema(orphanOrganSections, { throwOnError: true }),
  /orphan checklist item/i,
  "organ-system schema validation should throw on orphan checklist rows"
);
const cushingModule = complaintModules.find((module) => module.id === "cushings_syndrome_v1");
assert.ok(cushingModule, "Cushing syndrome workup module should be bundled");
const cushingWorkup = evaluateComplaintCds("Cushing syndrome", {}, { module: cushingModule, modules: [cushingModule] });
const cushingChecklist = buildLocalChecklistFromWorkup(
  { complaintResult: cushingWorkup, recommendation: cushingWorkup?.recommendation },
  { allowGenericFallbacks: true, maxBedsideQuestions: 18, maxExamItems: 15, includeSafetyInExamChecklist: true }
);
const cushingSections = parseChecklist(cushingChecklist).filter((section) => Array.isArray(section.items) && section.items.length);
const cushingOrganSections = groupChecklistSectionsByOrganSystem(cushingSections, { throwOnError: true });
const cushingOrganItems = cushingOrganSections.flatMap((section) => section.items.map((item) => item.label || item.text || ""));
assert.ok(
  cushingOrganItems.some((label) => /limiting hypertension/i.test(label))
    && cushingOrganItems.some((label) => /supraclavicular fullness/i.test(label)),
  "Cushing checklist should classify hypertension and supraclavicular-fullness rows without orphaning them"
);

const moduleChecklistFailures = [];
for (const module of complaintModules) {
  const validatedIntents = clinicalIntentRegistry.filter((intent) => (
    intent.status === "validated" && intent.complaint_module_id === module.id
  ));
  try {
    const complaintResult = evaluateComplaintCds(
      `${module.label} ${(module.triggers || []).join(" ")}`,
      {},
      { module, modules: [module], validatedIntents }
    );
    const checklistText = buildLocalChecklistFromWorkup(
      { complaintResult, recommendation: complaintResult?.recommendation, selectedIntents: validatedIntents },
      { allowGenericFallbacks: true, maxBedsideQuestions: 18, maxExamItems: 15, includeSafetyInExamChecklist: true }
    );
    const sections = parseChecklist(checklistText).filter((section) => Array.isArray(section.items) && section.items.length);
    const audit = validateChecklist(sections);
    const bedsideCount = itemsByCategory(sections, "bedside").length;
    const examCount = itemsByCategory(sections, "exam").length;
    groupChecklistSectionsByOrganSystem(sections, { throwOnError: true });
    if (!checklistText || !audit.ok || bedsideCount < 5 || examCount < 1) {
      moduleChecklistFailures.push(`${module.id}: checklist=${Boolean(checklistText)} bedside=${bedsideCount} exam=${examCount} issues=${audit.issues.map((issue) => issue.message).join("; ")}`);
    }
  } catch (error) {
    moduleChecklistFailures.push(`${module.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
assert.deepEqual(
  moduleChecklistFailures,
  [],
  `Every bundled validated workup module should build a parseable organ-system bedside checklist:\n${moduleChecklistFailures.join("\n")}`
);

assert.equal(itemsByCategory(dkaSections, "bedside").length, 12, "DKA sample should atomize compound bedside questions");
assert.equal(itemsByCategory(dkaSections, "exam").length, 13, "DKA sample has 13 targeted exam item lines");
assert.ok(!issueTypes(dkaAudit).includes("bedside-count-low"), "DKA sample must not warn that bedside questions are zero");
assert.ok(dkaAudit.ok, "DKA sample should pass checklist quality validation");
assert.ok(!dkaSections.flatMap((section) => section.items).some((item) => hasGenericOnlyChecklistOptions(item.rawValue || item.options, item.category)), "DKA sample should not contain generic-only checklist options");

const trailingColonChecklist = `BEDSIDE QUESTION CHECKLIST:
SYMPTOM TRAJECTORY:
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having chest pain now?: No / Yes / Other ___
Have you felt dizzy since yesterday?: No / Yes / Other ___
Were you able to eat breakfast?: Yes / Some / No / Other ___
What is your biggest concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST:
VITAL SIGNS AND SUPPORT:
Heart rate: ___
Blood pressure: ___
Oxygen support: Room air / Nasal cannula / Other ___`;
const trailingColonSections = parseChecklist(trailingColonChecklist);
assert.equal(itemsByCategory(trailingColonSections, "bedside").length, 5, "parent titles with colons should preserve bedside category");
assert.equal(itemsByCategory(trailingColonSections, "exam").length, 3, "parent titles with colons should preserve exam category");

const markdownChecklist = `Here is the checklist:

## BEDSIDE QUESTIONS
- SYMPTOM TRAJECTORY
1. How is your pain today? Better / Same / Worse / Other ___
2. Are you short of breath right now? No / Yes, mild / Yes, severe / Other ___
3. Have you been able to walk safely?: Yes / No / Not tried / Other ___
4. Are you eating and drinking enough?: Yes / Some / No / Other ___
5. What is your main concern today?: ___

## TARGETED EXAM
* VITAL SIGNS AND SUPPORT
* Respiratory rate: ___
* Oxygen support - Room air / Nasal cannula / Other ___
* ABDOMINAL EXAM
* Abdominal tenderness: Absent / Present, location ___`;
const markdownSections = parseChecklist(markdownChecklist);
assert.equal(itemsByCategory(markdownSections, "bedside").length, 5, "markdown and numbered question lines should parse");
assert.equal(itemsByCategory(markdownSections, "exam").length, 3, "markdown bullets and dash-separated options should parse");

const bedsideRespiratorySymptomsChecklist = `BEDSIDE QUESTION CHECKLIST
RESPIRATORY SYMPTOMS
Are you short of breath right now?: No / Yes, mild / Yes, severe / Other ___
Have you had cough or sputum since yesterday?: No / Cough / Sputum / Both / Other ___
Are you having chest pain with breathing?: No / Yes / Other ___
Are you eating and drinking enough?: Yes / Some / No / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Work of breathing: Normal / Mildly increased / Markedly increased
Lung sounds: Clear / Crackles / Wheezes / Diminished`;
const bedsideRespiratorySymptomsSections = parseChecklist(bedsideRespiratorySymptomsChecklist);
assert.equal(itemsByCategory(bedsideRespiratorySymptomsSections, "bedside").length, 5, "respiratory symptom headings inside bedside parent should remain history questions");
assert.equal(itemsByCategory(bedsideRespiratorySymptomsSections, "exam").length, 2, "respiratory exam headings inside exam parent should remain exam items");

const missingParentChecklist = `SYMPTOM TRAJECTORY
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having chest pain now?: No / Yes / Other ___

VITAL SIGNS AND SUPPORT
Heart rate: ___
Blood pressure: ___`;
const missingParentSections = parseChecklist(missingParentChecklist);
assert.equal(itemsByCategory(missingParentSections, "bedside").length, 2, "missing parent title should infer bedside questions");
assert.equal(itemsByCategory(missingParentSections, "exam").length, 2, "missing parent title should infer exam headings");

const badManeuverChecklist = `BEDSIDE QUESTION CHECKLIST
FUNCTION
Can you squeeze my fingers?: Yes / No
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having pain right now?: No / Yes / Other ___
Have you felt dizzy today?: No / Yes / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
VITAL SIGNS AND SUPPORT
Respiratory rate: ___`;
const badManeuverAudit = validateChecklist(parseChecklist(badManeuverChecklist));
assert.ok(issueTypes(badManeuverAudit).includes("bedside-exam-maneuver"), "bedside exam maneuvers should still warn");

const badCoughCommandChecklist = `BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Can you cough for me?: Yes / No
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having pain right now?: No / Yes / Other ___
Have you felt dizzy today?: No / Yes / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Work of breathing: Normal / Mildly increased / Markedly increased`;
const badCoughCommandAudit = validateChecklist(parseChecklist(badCoughCommandChecklist));
assert.ok(issueTypes(badCoughCommandAudit).includes("bedside-exam-maneuver"), "bedside exam commands to cough should still warn");

const feverSourceHistoryChecklist = `BEDSIDE QUESTION CHECKLIST
FOCUSED HISTORY
How high was the fever, how was it measured, when did it start, and what antipyretics, antibiotics, steroids, or immunosuppressants have you taken?: Unknown / Short duration / Persistent or recurrent / Antipyretic used / Antibiotic already used / Steroid or immunosuppression / Other ___
What symptoms localize the fever source: cough, sputum, dyspnea, pleuritic pain, sore throat, ear or sinus pain, dental pain, dysuria, flank pain, abdominal pain, vomiting, diarrhea, rash, wound, line concern, headache, neck stiffness, hot joint, back pain, confusion, low urine output, fainting, or rapid worsening?: No localizing symptoms / Cough-dyspnea-sputum-pleuritic pain / Dysuria-frequency-flank pain / Rash-wound-line / Other ___
Any cough, sputum, shortness of breath, pleuritic pain, wheeze, hypoxia, aspiration risk, or sick respiratory contacts?: No / Yes / Other ___
Have you been able to walk safely since the fever started?: Yes / No / Not tried / Other ___
Are you eating and drinking enough?: Yes / Some / No / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Work of breathing: Normal / Mildly increased / Markedly increased
Auscultate posterior lung fields: Clear / Crackles / Wheezes / Diminished`;
const feverSourceHistoryAudit = validateChecklist(parseChecklist(feverSourceHistoryChecklist));
assert.ok(!issueTypes(feverSourceHistoryAudit).includes("bedside-exam-maneuver"), "source-localizing fever symptom history should not be flagged as an exam maneuver");
const feverSourceHistorySections = parseChecklist(feverSourceHistoryChecklist);
const feverSourceHistoryLabels = itemsByCategory(feverSourceHistorySections, "bedside").map((item) => item.label);
assert.ok(
  feverSourceHistoryLabels.includes("How high was the measured temperature?")
    && feverSourceHistoryLabels.includes("Before we evaluated you, did you take any fever medicine such as acetaminophen or ibuprofen?")
    && feverSourceHistoryLabels.includes("Before we evaluated you, did you take any antibiotics?")
    && feverSourceHistoryLabels.includes("Before we evaluated you, did you take any steroid or immunosuppressing medicine?"),
  "parsed pasted fever timeline/medication bundles should become separate bedside questions"
);
assert.ok(
  feverSourceHistoryLabels.includes("Any respiratory source symptoms?"),
  "parsed pasted fever source bundles should become a respiratory source bedside question"
);
assert.ok(
  feverSourceHistoryLabels.includes("Any urinary or flank source symptoms?"),
  "parsed pasted fever source bundles should become a urinary/flank source bedside question"
);
assert.ok(
  !feverSourceHistoryLabels.some((label) => /What symptoms localize the fever source|How high was the fever, how was it measured/i.test(label)),
  "parsed pasted fever source and timeline bundles should not keep the original giant grouped labels"
);
const parsedRespiratorySource = itemsByCategory(feverSourceHistorySections, "bedside")
  .find((item) => item.label === "Any respiratory source symptoms?");
assert.ok(
  parsedRespiratorySource?.options?.includes("Cough") && parsedRespiratorySource.options.includes("Shortness of breath"),
  "parsed respiratory source rows should preserve independently markable symptom options"
);

const badBlankChecklist = `TARGETED PHYSICAL EXAM CHECKLIST
MUSCULOSKELETAL STRENGTH EXAM
Upper extremity strength: ___ / 5`;
const badBlankAudit = validateChecklist(parseChecklist(badBlankChecklist));
assert.ok(issueTypes(badBlankAudit).includes("bad-blank-format"), "bad blank fraction formats should still warn");

const badGenericOptionsChecklist = `BEDSIDE QUESTION CHECKLIST
FOCUSED HISTORY
Any swelling?: Yes / No / Unsure / Other ___
What is your main concern today?: ___
How is the symptom trajectory?: Improved / Same / Worse
Are you eating and drinking enough?: Yes / Some / No / Other ___
Have you been able to get out of bed safely?: Baseline / Needs help / Not safe / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
VOLUME EXAM
Peripheral edema: Present / Absent
General appearance: Normal / Abnormal
Lung sounds: Clear / Crackles / Wheezes / Diminished`;
const badGenericOptionsAudit = validateChecklist(parseChecklist(badGenericOptionsChecklist));
assert.ok(
  issueTypes(badGenericOptionsAudit).filter((type) => type === "generic-options").length >= 5,
  "history, exam, free-text-only, and trajectory-only generic modifiers should fail validation"
);

const normalized = normalizeChecklistText("BEDSIDE QUESTION CHECKLIST:\n- How are you? Better / Worse / Other ___");
assert.ok(normalized.includes("How are you?: Better / Worse / Other ___"), "normalization should recover question-plus-options lines");

const unsupportedLocalChecklist = buildLocalChecklistFromWorkup({});
assert.equal(unsupportedLocalChecklist, "", "local checklist generation should block unsupported/no-intent workups instead of emitting generic defaults");

const generatedBadAtomicLabels = [];
for (const module of complaintModules) {
  const result = evaluateComplaintCds(module.label || module.title || module.id, {}, { module });
  const checklist = buildLocalChecklistFromWorkup(
    { complaintResult: result, recommendation: result.recommendation },
    { allowGenericFallbacks: true, maxBedsideQuestions: 24, maxExamItems: 22, includeSafetyInExamChecklist: true }
  );
  for (const section of parseChecklist(checklist)) {
    for (const item of section.items || []) {
      if (/^Any not present\?$/i.test(item.label || "")) {
        generatedBadAtomicLabels.push(`${module.id}: ${item.label}`);
      }
    }
  }
}
assert.deepEqual(generatedBadAtomicLabels, [], "generated local checklists should not turn generic option text into patient questions");

const broadFeverSourceQuestion = {
  id: "REQ-infection-source-severity-history",
  label: "Fever source-localizing and sepsis severity question",
  text: "What symptoms localize the fever source: cough, sputum, dyspnea, pleuritic pain, sore throat, ear/sinus/dental pain, dysuria, flank pain, abdominal pain, vomiting/diarrhea, rash, wound/line concern, headache/neck stiffness, hot joint/back pain, confusion, low urine output, fainting, or rapid worsening?",
  options: "No localizing symptoms / Cough-dyspnea-sputum-pleuritic pain / Sore throat-ear-sinus-dental / Dysuria-frequency-flank pain / Abdominal pain-vomiting-diarrhea / Rash-wound-line / Headache-neck stiffness-confusion / Hot joint-back pain / Low urine output / Rapid worsening / Other ___",
  tags: ["infection", "sepsis", "source_localizing_history"]
};
const atomizedFeverSourceQuestions = expandedLocalBedsideQuestionItems(broadFeverSourceQuestion);
assert.equal(atomizedFeverSourceQuestions.length, 6, "broad fever source questions should become six source-domain bedside questions");
assert.ok(
  atomizedFeverSourceQuestions.every((item) => /\?$/.test(item.label) && !/What symptoms localize the fever source/i.test(item.label)),
  "atomized fever source rows should be directly askable questions, not the original bundled prompt"
);
assert.ok(
  atomizedFeverSourceQuestions.some((item) => /respiratory source/i.test(item.label) && /Cough \/ Sputum \/ Shortness of breath/i.test(item.options)),
  "atomized fever source rows should preserve respiratory options for multi-mark response controls"
);
assert.ok(
  atomizedFeverSourceQuestions.every((item) => item.source_domain_key && /^bedside:infection-/i.test(item.source_domain_key)),
  "atomized fever source rows should preserve source-domain semantic keys for dedupe and traceability"
);

const respiratorySourceFollowup = {
  id: "REQ-respiratory-infection-source-history",
  label: "Any cough, sputum, shortness of breath, pleuritic pain, wheeze, hypoxia, aspiration risk, or sick respiratory contacts?",
  options: "None / Cough / Sputum / Shortness of breath / Pleuritic pain / Wheeze / Hypoxia or oxygen need / Aspiration risk / Sick respiratory contacts",
  tags: ["fever", "infection", "respiratory_source"]
};
assert.ok(
  expandedLocalBedsideQuestionItems(respiratorySourceFollowup).every((item) => item.source_domain_key === "bedside:infection-respiratory-source"),
  "atomized respiratory infection follow-up rows should dedupe against the respiratory source-domain row"
);

const olderMultiDomainSourceFeatureQuestion = {
  id: "REQ-older-source-feature-wording",
  label: "Any abdominal, neurologic, skin, line, joint, or spine source features?",
  options: "No / Abdominal pain / Vomiting / Diarrhea / Rash / Wound / Line pain / Severe headache / Neck stiffness / Confusion / Hot swollen joint / Back pain / Rapid worsening / Other ___",
  tags: ["fever", "infection", "sepsis"]
};
const olderMultiDomainSourceFeatureRows = expandedLocalBedsideQuestionItems(olderMultiDomainSourceFeatureQuestion);
assert.ok(
  olderMultiDomainSourceFeatureRows.some((item) => item.source_domain_key === "bedside:infection-abdominal-gi-source")
    && olderMultiDomainSourceFeatureRows.some((item) => item.source_domain_key === "bedside:infection-cns-joint-spine-danger")
    && olderMultiDomainSourceFeatureRows.some((item) => item.source_domain_key === "bedside:infection-skin-line-source"),
  "older multi-domain source-feature wording should be atomized into source-domain bedside rows"
);
assert.ok(
  !olderMultiDomainSourceFeatureRows.some((item) => /abdominal, neurologic, skin, line, joint, or spine source features/i.test(item.label)),
  "older multi-domain source-feature wording should not survive as one giant bedside question"
);

const locallyGeneratedChecklist = buildLocalChecklistFromWorkup({
  complaintResult: {
    matched: true,
    requiredQuestions: [
      { label: "Known diabetes type, home insulin regimen, and last insulin dose?", options: [{ label: "Unknown" }, { label: "Yes" }, { label: "No" }] },
      { label: "Recent glucose values, beta-hydroxybutyrate/urine ketones, anion gap, bicarbonate, pH, potassium, creatinine, and osmolality if known?", options: [{ label: "Known / reviewed" }, { label: "Hyperglycemia" }, { label: "Ketones elevated" }, { label: "Acidosis or anion gap" }] },
      { label: "Vomiting, abdominal pain, poor oral intake, or inability to keep fluids down?", options: [{ label: "No" }, { label: "Yes" }, { label: "Other ___" }] },
      { label: "Any confusion, sleepiness, seizure, severe weakness, or inability to participate in care?", options: [{ label: "No" }, { label: "Yes" }, { label: "Other ___" }] }
    ],
    conditionalQuestions: [
      { label: "Before discharge planning, are insulin supplies, ketone strips, sick-day plan, and follow-up arranged?", options: [{ label: "Unknown" }, { label: "Yes" }, { label: "No" }] }
    ],
    focusedExam: [
      { label: "Measure blood pressure" },
      { label: "Measure heart rate" },
      { label: "Measure respiratory rate" },
      { label: "Inspect mucous membranes for dehydration" },
      { label: "Observe Kussmaul breathing" },
      { label: "Assess mental status" }
    ]
  },
  recommendation: {
    focusedHistoryQuestions: [
      { text: "What was the most recent glucose value and timing of last insulin?", options: "Value ___ / Last insulin ___ / Unsure / Other ___" }
    ],
    basicSafetyChecks: [
      { label: "Measure bedside glucose", options: "___" }
    ],
    corePhysicalExamManeuvers: [
      { label: "Test capillary refill", options: "Less than 2 seconds / 2 seconds or more" }
    ]
  }
});
const localSections = parseChecklist(locallyGeneratedChecklist);
const localAudit = validateChecklist(localSections);
assert.ok(
  itemsByCategory(localSections, "bedside").length >= 6 && itemsByCategory(localSections, "bedside").length <= 24,
  "local workup checklist should use validated/guideline history plus contextual clinical backfill without generic padding or bundled-row pressure"
);
assert.ok(itemsByCategory(localSections, "exam").length >= 4, "local workup checklist should include validated/guideline exam items without an external generator");
assert.doesNotMatch(
  locallyGeneratedChecklist,
  /(?:Blood pressure|Heart rate|Respiratory rate|Oxygen saturation|Temperature|Measure bedside glucose):/i,
  "local physical exam checklist should not emit vital signs or basic bedside measurements as exam rows"
);
assert.match(
  locallyGeneratedChecklist,
  /Inspect mucous membranes|Observe Kussmaul breathing|Assess mental status|Test capillary refill/i,
  "local physical exam checklist should preserve actual bedside maneuvers after removing basic safety checks"
);
assert.ok(localAudit.ok, localAudit.issues.map((issue) => issue.message).join("\n"));
assert.doesNotMatch(locallyGeneratedChecklist, /OpenEvidence/i, "local checklist output should not be an OpenEvidence prompt");
assert.doesNotMatch(locallyGeneratedChecklist, /Since yesterday, is your main symptom|What is your main concern today|General appearance/i, "local checklist output should not add generic fallback rows when validated content exists");
assert.doesNotMatch(
  locallyGeneratedChecklist,
  /beta-hydroxybutyrate|anion gap|bicarbonate|osmolality/i,
  "local bedside question checklist should not turn chart/lab review rows into patient-facing questions"
);
assert.doesNotMatch(
  locallyGeneratedChecklist,
  /^Any cough, sputum, shortness of breath, pleuritic pain, wheeze, hypoxia, aspiration risk, or sick respiratory contacts\?$/im,
  "local checklist should not emit bare orphan question lines without parseable options"
);
assert.match(
  locallyGeneratedChecklist,
  /Any confusion\?: No confusion \/ Mild confusion \/ Moderate confusion \/ Severe confusion \/ Worse than baseline \/ Unsure \/ Other ___/i,
  "local checklist should atomize broad symptom-list questions into one symptom per row with item-specific modifiers"
);

const peripheralEdemaChecklist = buildLocalChecklistFromWorkup({
  recommendation: {
    focusedHistoryQuestions: [
      { label: "Any new or worse swelling in the legs?", options: "Yes / No / Unsure / Other ___" }
    ],
    corePhysicalExamManeuvers: [
      { label: "Assess peripheral edema", options: "___" }
    ]
  }
}, { allowContextualBackfill: false });
assert.match(
  peripheralEdemaChecklist,
  /Peripheral edema: None \/ Trace \/ 1\+ \/ 2\+ \/ 3\+ \/ 4\+ \/ Ankle or pedal \/ Pretibial \/ Sacral \/ Unilateral \/ Bilateral \/ Unable to assess \/ Other ___/i,
  "peripheral edema checklist rows should expose severity, location, and laterality controls"
);
assert.doesNotMatch(
  peripheralEdemaChecklist,
  /Assess peripheral edema: (?:___|Present \/ Absent|Normal \/ Abnormal)/i,
  "peripheral edema should not fall back to generic exam modifiers"
);

const dyspneaAtomicLocalChecklist = buildLocalChecklistFromWorkup({
  selectedIntents: [{
    intent_id: "dyspnea_hf_v1",
    label: "Dyspnea / heart failure or volume overload",
    aliases: ["dyspnea", "shortness of breath"],
    evidence_tags: ["dyspnea", "heart_failure", "orthopnea", "edema"],
    clinical_bundle_ids: ["dyspnea_hf"],
    required_domains: ["lungs/work of breathing", "JVP/edema"]
  }],
  recommendation: {
    focusedHistoryQuestions: [
      {
        label: "Ask cardiopulmonary associated symptoms",
        text: "What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics?",
        options: "No change / Exertional dyspnea / Orthopnea-PND / Cough-wheeze / Chest pain / Leg swelling / Weight change / Oxygen need / Missed diuretics / Other ___",
        diagnosticPurpose: "Dyspnea and heart-failure source and severity: pulmonary congestion, obstructive or infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.",
        managementImplication: "Changes oxygen/support strategy, diuresis versus alternate pulmonary workup, ECG/troponin/imaging urgency, medication review, and disposition.",
        tags: ["dyspnea", "heart_failure", "pulmonary_exam"]
      },
      {
        label: "Ask respiratory red flags",
        text: "Is breathing worse at rest, with exertion, lying flat, during sleep, or with chest pain, cough, wheeze, fever, leg swelling, or higher oxygen need?",
        options: "Rest dyspnea / Exertional / Orthopnea / PND / Chest pain / Cough-wheeze / Fever / Leg swelling / Higher oxygen need / Other ___",
        tags: ["dyspnea", "hypoxia", "respiratory_status", "red_flag"]
      }
    ],
    corePhysicalExamManeuvers: [
      { label: "Observe work of breathing", options: "Normal / Increased / Unable" }
    ]
  }
}, { maxBedsideQuestions: 18 });
assert.match(
  dyspneaAtomicLocalChecklist,
  /Any exertional dyspnea\?: No exertional dyspnea \/ Mild with exertion \/ Limits usual activity \/ Occurs with minimal activity \/ Unsure \/ Other ___/i,
  "dyspnea local checklist should keep atomic dyspnea symptom questions"
);
assert.match(
  dyspneaAtomicLocalChecklist,
  /Is breathing worse when lying flat\?: No orthopnea \/ Uses extra pillows \/ Cannot lie flat \/ Wakes short of breath \/ Unsure \/ Other ___/i,
  "dyspnea local checklist should turn position fragments into askable questions"
);
assert.doesNotMatch(
  dyspneaAtomicLocalChecklist,
  /How high was the measured temperature|Before we evaluated you, did you take any fever medicine/i,
  "dyspnea local checklist should not misroute broad cardiopulmonary questions into fever timeline rows"
);
assert.doesNotMatch(
  dyspneaAtomicLocalChecklist,
  /^Any with walking|^when lying flat\?:/im,
  "dyspnea local checklist should not emit unaskable fragment questions"
);

const residualOrAtomicChecklist = buildLocalChecklistFromWorkup({
  recommendation: {
    focusedHistoryQuestions: [{
      label: "Ask thyroid temperature symptoms",
      text: "Any heat intolerance or sweating or cold intolerance or dry change?",
      options: "No / Yes / Unsure / Other ___",
      tags: ["thyroid", "temperature_symptoms"]
    }],
    corePhysicalExamManeuvers: [
      { label: "Inspect thyroid/neck", options: "Normal / Goiter / Nodule / Tender / Unable" }
    ]
  }
}, { maxBedsideQuestions: 8, allowContextualBackfill: false });
[
  [/Any heat intolerance\?: Not present \/ Mild or limited heat intolerance \/ Moderate heat intolerance \/ Severe or function-limiting heat intolerance \/ Unsure \/ Other ___/i, "heat intolerance"],
  [/Any sweating\?: No sweating \/ Mild sweating \/ Moderate sweating \/ Severe sweating \/ Worse than baseline \/ Unsure \/ Other ___/i, "sweating"],
  [/Any cold intolerance\?: Not present \/ Mild or limited cold intolerance \/ Moderate cold intolerance \/ Severe or function-limiting cold intolerance \/ Unsure \/ Other ___/i, "cold intolerance"],
  [/Any dry change\?: Baseline or resolved \/ New dry change \/ Worsening dry change \/ Rapidly worsening \/ Unsure \/ Other ___/i, "dry change"]
].forEach(([pattern, term]) => {
  assert.match(residualOrAtomicChecklist, pattern, `local checklist should split residual or-list component for ${term}`);
});

const stiSourceWordIntent = {
  intent_id: "genital_discharge_sti_v1",
  label: "Genital discharge or STI-source evaluation",
  aliases: ["genital discharge", "STI source"],
  evidence_tags: ["sti", "genital_discharge", "urinary"],
  clinical_bundle_ids: ["genital_discharge_sti"],
  required_domains: ["GU/STI history", "genital exam"]
};
const stiSourceWordChecklist = buildLocalChecklistFromWorkup({
  selectedIntents: [stiSourceWordIntent],
  recommendation: {
    corePhysicalExamManeuvers: [
      { label: "Inspect genital discharge source", options: "No discharge / Urethral / Cervical-vaginal / Ulcer / Unable" }
    ]
  }
}, { maxBedsideQuestions: 12 });
assert.doesNotMatch(
  stiSourceWordChecklist,
  /Any respiratory source symptoms|Any severe headache, stiff neck, confusion, seizure/i,
  "non-fever intents should not activate the full infection-source screen merely because their label contains source"
);

const stiWithFeverModifierChecklist = buildLocalChecklistFromWorkup({
  selectedIntents: [stiSourceWordIntent],
  patientModifiers: "fever and sepsis concern",
  recommendation: {
    corePhysicalExamManeuvers: [
      { label: "Inspect genital discharge source", options: "No discharge / Urethral / Cervical-vaginal / Ulcer / Unable" }
    ]
  }
}, { maxBedsideQuestions: 18 });
assert.match(
  stiWithFeverModifierChecklist,
  /Any respiratory source symptoms\?: No \/ Cough \/ Sputum/i,
  "explicit fever or sepsis modifiers should activate the infection-source screen inside another validated intent"
);

const nonThyroidMedicationExposureChecklist = buildLocalChecklistFromWorkup({
  recommendation: {
    focusedHistoryQuestions: [{
      label: "Medication exposure check",
      text: "Which medications, supplements, missed doses, biotin, iodine/contrast exposure, hormone therapy, or recent treatment changes could alter Hirsutism interpretation or safety?",
      options: "Medications / Supplements / Missed doses / Biotin / Iodine exposure / Contrast exposure / Hormone therapy / Recent treatment changes / Other ___",
      tags: ["hirsutism", "reproductive_and_gonadal_disorders", "medications"]
    }],
    corePhysicalExamManeuvers: [
      { label: "Inspect hair distribution", options: "Normal / Hirsutism / Virilization / Unable" }
    ]
  }
}, { maxBedsideQuestions: 12, allowContextualBackfill: false });
assert.doesNotMatch(
  nonThyroidMedicationExposureChecklist,
  /iodine exposure|contrast exposure/i,
  "non-thyroid endocrine workups should not inherit thyroid-only iodine/contrast exposure questions"
);
assert.match(
  nonThyroidMedicationExposureChecklist,
  /Any biotin\?: No biotin \/ Current biotin \/ Stopped within last week \/ Unsure \/ Other ___/i,
  "non-thyroid medication exposure atomization should keep generally relevant medication/supplement questions"
);
assert.match(
  nonThyroidMedicationExposureChecklist,
  /Any recent treatment changes\?: No recent treatment changes \/ Dose increased \/ Dose decreased or stopped \/ New treatment started \/ Unsure \/ Other ___/i,
  "generic endocrine medication rows should render recent treatment changes as an askable question"
);

const diabetesFamilyHistoryChecklist = buildLocalChecklistFromWorkup({
  recommendation: {
    focusedHistoryQuestions: [{
      label: "Family endocrine history",
      text: "Any personal or family autoimmune disease, endocrine disease, thyroid cancer/MEN2, adrenal disease, or related inherited condition?",
      options: "Personal / Family autoimmune disease / Endocrine disease / Thyroid cancer / MEN2 / Adrenal disease / Related inherited condition / Other ___",
      tags: ["type_1_diabetes_mellitus", "diabetes_and_blood_sugar_disorders", "family_history"]
    }],
    corePhysicalExamManeuvers: [
      { label: "Inspect injection sites", options: "Normal / Lipohypertrophy / Irritation / Unable" }
    ]
  }
}, { maxBedsideQuestions: 12, allowContextualBackfill: false });
assert.doesNotMatch(
  diabetesFamilyHistoryChecklist,
  /thyroid cancer|MEN2/i,
  "diabetes family-history rows should not inherit thyroid cancer or MEN2 questions outside thyroid/MEN contexts"
);

const adrenalSteroidCrisisChecklist = buildLocalChecklistFromWorkup({
  recommendation: {
    focusedHistoryQuestions: [{
      label: "Adrenal crisis symptoms",
      text: "Any vomiting, severe weakness, abdominal pain, fever, missed steroid doses, recent illness, or inability to keep down stress-dose steroids?",
      options: "Vomiting / Severe weakness / Abdominal pain / Fever / Missed steroid doses / Recent illness / Cannot keep down stress-dose steroids / Other ___",
      tags: ["adrenal_insufficiency", "steroid_replacement", "sick_day"]
    }],
    corePhysicalExamManeuvers: [
      { label: "Check mucous membranes", options: "Moist / Dry / Unable" }
    ]
  }
}, { maxBedsideQuestions: 12, allowContextualBackfill: false });
assert.match(
  adrenalSteroidCrisisChecklist,
  /Any missed steroid doses\?: Taking as prescribed \/ Missed steroid dose \/ Unable to keep down dose \/ Needs stress dosing \/ Unsure \/ Other ___/i,
  "missed steroid dose questions should remain adrenal-specific bedside questions"
);
assert.doesNotMatch(
  adrenalSteroidCrisisChecklist,
  /How high was the measured temperature|Before we evaluated you, did you take any fever medicine/i,
  "adrenal sick-day questions should not be rewritten into fever timeline medication rows"
);

const feverDedupedLocalChecklist = buildLocalChecklistFromWorkup({
  complaintResult: {
    matched: true,
    requiredQuestions: [
      {
        label: "What symptoms localize the fever source?",
        options: [
          { label: "No localizing symptoms" },
          { label: "Cough, sputum, dyspnea, or pleuritic pain" },
          { label: "Dysuria, frequency, or flank pain" },
          { label: "Rash, wound, or line concern" }
        ]
      },
      {
        label: "Any cough, sputum, shortness of breath, pleuritic pain, wheeze, hypoxia, aspiration risk, or sick respiratory contacts?",
        options: [{ label: "None" }, { label: "Cough" }, { label: "Sputum" }, { label: "Shortness of breath" }]
      },
      {
        label: "Any high-risk host factor or exposure?",
        options: [{ label: "None" }, { label: "Immunocompromised" }, { label: "Pregnancy possible" }]
      }
    ],
    focusedExam: [
      { label: "Observe work of breathing", options: "Normal / Tachypneic / Labored / Unable" },
      { label: "Auscultate posterior lung fields", options: "Clear / Crackles / Wheezes / Diminished / Unable" },
      { label: "Inspect skin for infection source", options: "No focal skin source / Rash / Cellulitis / Wound / Unable" }
    ]
  },
  recommendation: {
    focusedHistoryQuestions: [
      {
        text: "What symptoms localize the fever source: cough, sputum, dyspnea, pleuritic pain, sore throat, ear/sinus/dental pain, dysuria, flank pain, abdominal pain, vomiting/diarrhea, rash, wound/line concern, headache/neck stiffness, hot joint/back pain, confusion, low urine output, fainting, or rapid worsening?",
        options: "No localizing symptoms / Cough-dyspnea-sputum-pleuritic pain / Dysuria-frequency-flank pain / Rash-wound-line / Other ___"
      },
      {
        text: "Any new cough, shortness of breath, chest discomfort, oxygen requirement, wheeze, sputum, or pleuritic pain?",
        options: "No / Cough / Shortness of breath / Oxygen need / Wheeze / Sputum / Pleuritic pain / Other ___"
      },
      {
        text: "Any immunosuppression, pregnancy possibility, recent hospitalization/procedure, line/device, travel/outdoor bite exposure, animal or food-water exposure, sick contacts, or new medication?",
        options: "None / Immunocompromised / Pregnancy possible / Line or device / Travel / Sick contacts / Other ___"
      }
    ],
    corePhysicalExamManeuvers: [
      { label: "Work of breathing observation", options: "Normal / Tachypneic / Labored / Unable" },
      { label: "Auscultate posterior lung fields", options: "Clear / Crackles / Wheezes / Diminished / Unable" },
      { label: "Inspect skin for infection source", options: "No focal skin source / Rash / Cellulitis / Wound / Unable" }
    ]
  }
});
const feverDedupedSections = parseChecklist(feverDedupedLocalChecklist);
const feverDedupedQuestionLabelRows = itemsByCategory(feverDedupedSections, "bedside").map((item) => item.label);
const feverDedupedExamLabelRows = itemsByCategory(feverDedupedSections, "exam").map((item) => item.label);
assert.equal(
  feverDedupedQuestionLabelRows.filter((label) => /fever source|symptoms localize/i.test(label)).length,
  0,
  "local checklist should expand broad fever source-localizing questions instead of preserving an overloaded source question"
);
[
  [/respiratory source symptoms/i, "respiratory source"],
  [/throat.*ear.*sinus.*dental.*oral source symptoms/i, "HEENT/oral source"],
  [/urinary or flank source symptoms/i, "urinary/flank source"],
  [/abdominal or GI source symptoms/i, "abdominal/GI source"],
  [/skin.*wound.*line.*device source symptoms/i, "skin/wound/line/device source"],
  [/severe headache.*stiff neck.*confusion.*seizure.*hot swollen joint.*severe back pain/i, "neurologic/joint/spine danger source"]
].forEach(([pattern, domain]) => assert.equal(
  feverDedupedQuestionLabelRows.filter((label) => pattern.test(label)).length,
  1,
  `local checklist should include one focused ${domain} row after expanding broad source-localizing history`
));
assert.match(
  feverDedupedLocalChecklist,
  /Any urinary or flank source symptoms\?: No \/ Dysuria \/ Frequency \/ Urgency \/ Flank pain \/ Hematuria \/ Low urine output \/ Other ___/i,
  "expanded source-domain rows should retain specific selectable symptom options"
);
assert.equal(
  feverDedupedQuestionLabelRows.filter((label) => /^Any respiratory source symptoms\?$/i.test(label)).length,
  1,
  "local checklist should not duplicate fever respiratory-source questions from module and evidence recommendation"
);
assert.equal(
  feverDedupedQuestionLabelRows.filter((label) => /high-risk host|immunosuppression|pregnancy/i.test(label)).length,
  1,
  "local checklist should not duplicate fever host/exposure questions from module and evidence recommendation"
);
assert.equal(
  feverDedupedExamLabelRows.filter((label) => /work of breathing/i.test(label)).length,
  1,
  "local checklist should not duplicate work-of-breathing exam rows"
);
assert.equal(
  feverDedupedExamLabelRows.filter((label) => /posterior lung|lung fields|lung sounds/i.test(label)).length,
  1,
  "local checklist should not duplicate lung auscultation exam rows"
);
assert.equal(
  feverDedupedExamLabelRows.filter((label) => /skin.*source|infection source/i.test(label)).length,
  1,
  "local checklist should not duplicate skin/wound/line source exam rows"
);

const traceabilityChecklist = `BEDSIDE QUESTION CHECKLIST
FOCUSED HISTORY
Any cough, sputum, shortness of breath, or pleuritic pain?: No / Yes / Other ___
What symptoms localize the fever source?: No localizing symptoms / Respiratory / Urinary / Skin / Other ___
Any high-risk host factor or exposure?: None / Immunocompromised / Pregnancy possible / Other ___
Are you eating and drinking enough?: Yes / Some / No / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Posterior lung sounds: Clear / Crackles / Wheezes / Diminished
Invented sparkle sign: Absent / Present`;
const traceabilitySections = parseChecklist(traceabilityChecklist);
const traceableLabels = new Set([
  "any cough, sputum, shortness of breath, or pleuritic pain?",
  "what symptoms localize the fever source?",
  "any high-risk host factor or exposure?",
  "are you eating and drinking enough?",
  "what is your main concern today?",
  "posterior lung sounds"
]);
const traceabilityAudit = auditChecklistTraceability(traceabilitySections, {
  requireTraceability: true,
  traceItem: (item) => ({ matched: traceableLabels.has(item.label.toLowerCase()) })
});
assert.ok(issueTypes(traceabilityAudit).includes("untraceable-checklist-item"), "traceability audit should flag invented checklist rows");
assert.equal(traceabilityAudit.untraceableCount, 1, "traceability audit should count the single untraceable row");
const stagedGapTraceAudit = auditChecklistTraceability(traceabilitySections, {
  requireTraceability: true,
  traceItem: (item) => item.label === "Invented sparkle sign"
    ? { matched: true, status: "staged_gap" }
    : { matched: true, status: "validated" }
});
assert.ok(issueTypes(stagedGapTraceAudit).includes("staged-gap-checklist-item"), "traceability audit should distinguish staged gaps from validated rows");
const mergedTraceabilityAudit = mergeChecklistAuditResults(validateChecklist(traceabilitySections), traceabilityAudit);
assert.ok(issueTypes(mergedTraceabilityAudit).includes("untraceable-checklist-item"), "merged checklist audit should preserve traceability issues");

assert.ok(checklistPrompt.includes("Parent checklist titles must be the exact all-caps lines above, with no colon."), "main prompt should include strict parent-title contract");
assert.ok(!checklistPrompt.includes("BEDSIDE QUESTION CHECKLIST:"), "main prompt should not show colon after parent title");
assert.ok(checklistPrompt.includes("Student exam reference (student_exam_reference"), "main prompt should include the plain student exam reference block");
assert.ok(!checklistPrompt.includes("<student_exam_reference>"), "main prompt should avoid XML-style student exam reference tags");
assert.ok(!checklistPrompt.includes("Core exam domains:"), "main prompt should avoid bloating the accepted checklist prompt with long exam reference rows");
assert.ok(checklistPrompt.includes("Do not ask OpenEvidence or another external system"), "legacy checklist prompt export should now point to local generation");
assert.ok(checklistPrompt.includes("catalog gap for reviewer follow-up"), "exam reference should route missing unvalidated items to review gaps");
assert.ok(checklistPrompt.includes("Do not treat vital signs"), "main prompt should keep basic measurements out of physical exam maneuvers");
assert.ok(checklistPrompt.includes("<validated_clinical_intents>"), "main prompt should support the validated clinical intent gate");
assert.ok(checklistPrompt.includes("Do not add unvalidated checklist items as final checklist rows"), "validated intent prompts should block unvalidated final checklist items");
assert.ok(checklistPrompt.includes("<retrieved_evidence_candidates>"), "main prompt should support retrieved evidence candidates");
assert.ok(checklistPrompt.includes("reviewer-only evidence context"), "retrieved evidence should guide candidate use without authorizing unvalidated rows");
assert.ok(newAdmissionChecklistPrompt.includes("No prior subjective/objective/assessment/plan note is available"), "new admission prompt should retain admission context without unexplained abbreviation");
assert.ok(newAdmissionChecklistPrompt.includes("full first-history admission write-up"), "new admission prompt should prioritize first-history write-up gaps");

const appHtml = readFileSync("index.html", "utf8");
const evidenceModule = readFileSync("evidence.js", "utf8");
const examReferenceCsv = readFileSync("data/physical-exam/physical_exam_reference.csv", "utf8");
const examEvidenceOverlayCsv = readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8");

function parseCsvRow(line) {
  const fields = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields.map((field) => field.trim());
}

function parseCsv(csvText) {
  const lines = String(csvText || "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseCsvRow(line);
    return headers.reduce((row, header, index) => {
      row[header] = fields[index] || "";
      return row;
    }, {});
  });
}

function truncatePromptField(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

assert.ok(examReferenceCsv.includes("exam_id"), "physical exam base CSV should expose stable exam_id keys");
assert.ok(examEvidenceOverlayCsv.includes("retrieval_tags"), "evidence overlay should include retrieval tags");
assert.ok(examEvidenceOverlayCsv.includes("cardiopulmonary_vascular_exam_neck_jvp"), "evidence overlay should include high-yield JVP metadata");
assert.ok(evidenceModule.includes("retrieved_evidence_candidates"), "evidence module should inject retrieved evidence candidates");
assert.ok(appHtml.includes('id="workupConcernInput"'), "main workflow should expose a diagnosis/workup search input");
assert.ok(appHtml.includes('id="patientWorkupSelect"'), "patient workspace should expose an explicit validated-workup selector");
assert.ok(appHtml.includes("selectedWorkupModuleId"), "patient workup selection should persist as first-class state");
assert.ok(appHtml.includes("patientWorkupSelections"), "patient workup selections should persist per patient instead of globally");
assert.ok(appHtml.includes("patientObjectiveData"), "patient objective workup data should persist locally per selected workup");
assert.ok(appHtml.includes("patientContinuityCases"), "patient daily pre-round updates should persist locally per patient");
assert.ok(appHtml.includes("todayModeByPatientId"), "new-vs-returning preround mode should persist per patient");
assert.ok(appHtml.includes('data-patient-tab="today"'), "patient workspace should expose a first-class Today cockpit tab");
assert.ok(appHtml.includes('id="todaySmartPasteInput"'), "Today cockpit should support smart paste intake");
assert.ok(appHtml.includes('id="todayRoundsPromptPreview"'), "Today cockpit should preview the de-identified oral rounds SOAP prompt");
assert.ok(appHtml.includes('id="todayOpenEvidencePasteInput"'), "Today cockpit should accept standardized OpenEvidence returned presentations");
assert.ok(appHtml.includes("APP_PASTE_BACK_JSON"), "OpenEvidence rounds prompts should request standardized app paste-back JSON");
assert.ok(appHtml.includes('id="patientObjectiveDataPanel"'), "patient context should expose structured workup data fields");
assert.ok(appHtml.includes('id="patientObjectiveSummaryPanel"'), "patient summary should expose entered and missing objective workup data");
assert.ok(
  appHtml.includes('id="patientWorkupOrdersPanel"')
    && appHtml.includes('id="patientDecisionTreePanel"')
    && appHtml.includes('id="workupOrdersPanel"')
    && appHtml.includes('id="decisionTreePanel"'),
  "workup views should show orders/results panels and a live decision-tree visualization"
);
assert.ok(
  appHtml.includes("betaHydroxybutyrate")
    && appHtml.includes("anionGap")
    && appHtml.includes("bicarbonate")
    && appHtml.includes("sodiumOsmolality"),
  "DKA objective data UI should include beta-hydroxybutyrate, anion gap, bicarbonate, and sodium/osmolality fields"
);
assert.ok(appHtml.includes('id="patientWorkupResults"') && appHtml.includes("workup-result-row"), "patient workspace should render selectable workup result rows from the search surface");
assert.ok(!appHtml.includes("Validated workup to use"), "patient workup UI should not show a separate dropdown label next to the search control");
assert.ok(appHtml.includes("No validated workup selected"), "unsupported patient concerns should render an explicit no-workup-selected state");
assert.ok(appHtml.includes("reviewedSourceContextText"), "OpenEvidence and phone handoffs should use reviewed selected-patient context");
const sampleContextToken = "SAMPLE" + "_CONTEXT";
assert.ok(!appHtml.includes(`state.scrubbedText || ${sampleContextToken}`), "patient evidence handoffs should not fall back directly to the DKA sample context");
assert.ok(appHtml.includes("Validated intent"), "workflow should explicitly show the selected validated diagnosis/workup");
assert.ok(appHtml.includes('id="buildChecklistButton"'), "workflow should expose local guideline/workup generation before checklist build");
assert.ok(!appHtml.includes('id="workupRows"'), "workflow should not show the removed full-workup row drilldown");
assert.ok(appHtml.includes("decision-tree-node"), "workflow should render the decision pathway as visible tree nodes");
assert.ok(appHtml.includes("resolveUiComplaintModule"), "UI workup generation should resolve an explicit local module before checklist build");
assert.ok(appHtml.includes("evaluateUiComplaintCds"), "UI workup generation should use a guarded complaint-CDS path");
assert.ok(!appHtml.includes("Paste the initial rounds prompt into OpenEvidence first so"), "main guided flow should not make OpenEvidence the prerequisite before local checklist build");
assert.ok(appHtml.includes("buildLocalChecklistFromWorkup"), "local checklist generation should use the shared checklist builder");
assert.ok(appHtml.includes("parseChecklist"), "app should parse local checklist sections before rendering bedside rows");
assert.ok(appHtml.includes("checklist_improvement_review"), "app should expose optional OpenEvidence checklist improvement review");
assert.ok(appHtml.includes('id="copyPromptButton"'), "checklist screen should offer optional prompt copy instead of making OpenEvidence the generator");
assert.ok(
  appHtml.includes("checklistOptionsForItem")
    && appHtml.includes("splitChecklistOptions")
    && appHtml.includes("answer-chip")
    && appHtml.includes("answer-select")
    && appHtml.includes("aria-pressed"),
  "bedside checklist response controls should render item-specific chips or menus with accessible state"
);
assert.ok(
  appHtml.includes('id="evidenceReviewCard"')
    && appHtml.includes('id="evidenceSupportedCount"')
    && appHtml.includes('id="evidenceNeedsReviewCount"')
    && appHtml.includes('id="evidenceNoSourceCount"')
    && appHtml.includes('id="evidenceReviewItems"'),
  "bedside checklist should expose a first-class evidence review card with counts and supported-item rows"
);
assert.ok(
  appHtml.includes('id="exportPhoneContextButton"')
    && appHtml.includes('id="importPhoneFindingsButton"')
    && appHtml.includes("No backend sync is used.")
    && appHtml.includes("Use the phone only for bedside checklist answers and focused notes")
    && appHtml.includes('aria-label="Return findings to computer"'),
  "desktop-to-phone checklist handoff should be explicit and local-first"
);
assert.ok(
  appHtml.includes("phoneHandoffPayloadMatchesCurrentChecklist")
    && appHtml.includes("clearStalePhonePayload")
    && appHtml.includes("payloadManifestHash === currentManifestHash")
    && appHtml.includes("assertMatchingPhoneChecklistManifest")
    && appHtml.includes("phoneQr3")
    && appHtml.includes("phoneChecklistManifestPatchOperations")
    && appHtml.includes("phoneReturnQr4")
    && appHtml.includes("R4:"),
  "phone handoff should reject stale checklist manifests, sync default-workup patches, and use the compact indexed return QR format"
);
assert.ok(
  appHtml.includes("Editable smart-phrase template")
    && appHtml.includes('id="promptVariableBar"')
    && appHtml.includes("promptTemplatesByTaskId")
    && appHtml.includes("resolvePromptTemplate"),
  "desktop OpenEvidence handoff should show smart-phrase prompt templates while resolving patient variables only on copy"
);
assert.ok(
  !appHtml.includes('id="evidenceTaskStrip"')
    && appHtml.includes('id="sharedPromptWorkbench"')
    && appHtml.includes('id="patientEvidenceTaskStrip"')
    && appHtml.includes("renderTaskStrip")
    && appHtml.includes("taskLabel")
    && appHtml.includes("taskDescription"),
  "desktop OpenEvidence handoff should use the single patient workbench task list instead of a duplicate global board"
);
assert.ok(
  appHtml.includes('data-patient-tab="checklist"')
    && appHtml.indexOf('data-patient-tab="checklist"') < appHtml.indexOf('data-patient-tab="findings"'),
  "patient workspace tabs should put Checklist before Findings"
);
assert.ok(
  appHtml.includes('data-patient-tab="evidence"')
    && appHtml.includes('id="patientEvidenceTaskStrip"')
    && appHtml.includes('id="patientEvidencePromptPreview"')
    && appHtml.includes("renderTaskStrip(elements.patientEvidenceTaskStrip"),
  "desktop patient workspace should expose OpenEvidence prompts as a first-class patient tab"
);
assert.ok(
  appHtml.includes('data-patient-tab="handoff"')
    && appHtml.includes('data-patient-tab="handoff" aria-selected="false" aria-label="Phone handoff" aria-hidden="true" tabindex="-1" hidden')
    && appHtml.includes('function patientTabAvailableOnDevice')
    && appHtml.includes('const phonePatientTabs = new Set(["checklist", "handoff"]);')
    && appHtml.includes('if (isPhoneWorkflowDevice()) return phonePatientTabs.has(tabName);')
    && appHtml.includes('return tabName !== "handoff";'),
  "desktop patient workspace should keep the Phone tab hidden by default while phone-width devices stay limited to checklist and handoff"
);
assert.ok(
  appHtml.includes("decisionTreeGraphsByModuleId")
    && appHtml.includes("clinical_pathway_tree_v1")
    && appHtml.includes('id="decisionTreeJsonInput"')
    && appHtml.includes('id="saveDecisionTreeLocalFileButton"')
    && appHtml.includes("./vendor/d3.v7.min.js"),
  "patient workup should support persisted editable D3 decision-tree pathways"
);
assert.ok(
  appHtml.includes('id="workspaceFindingsGateNotice"')
    && appHtml.includes("Build the bedside checklist before sending or returning phone findings.")
    && appHtml.includes("findingsUnlocked"),
  "patient findings should be gated behind checklist-derived findings"
);
assert.ok(
  appHtml.includes('id="workspaceOpenBedsideChecklistButton"')
    && appHtml.includes('id="workspaceChecklistSecondaryButton"')
    && appHtml.includes("Build checklist from workup")
    && appHtml.includes("Select workup first")
    && appHtml.includes("Answer bedside checklist")
    && appHtml.includes("Checklist rows appear here after building."),
  "patient checklist panel should expose one stateful primary action plus one contextual secondary action"
);
assert.ok(
  !appHtml.includes('id="workspaceBuildChecklistFromPanelButton"')
    && !appHtml.includes('id="workspaceCopyWorkupButton"')
    && !appHtml.includes('id="workspaceEvidenceReviewButton"'),
  "patient checklist panel should not show duplicate build, copy-workup, or OpenEvidence buttons"
);

const baseExamRows = parseCsv(examReferenceCsv);
const overlayById = new Map(parseCsv(examEvidenceOverlayCsv).map((row) => [row.exam_id, row]));
const evidenceRows = baseExamRows
  .map((row) => ({ ...row, ...overlayById.get(row.exam_id) }))
  .filter((row) => row.evidence_status && row.evidence_status !== "pending")
  .slice(0, 30);
const estimatedEvidenceBlock = evidenceRows.map((row) => {
  const location = [row.exam_system, row.section, row.region_or_subsection].filter(Boolean).join(" > ");
  const evidencePhrase = [
    row.diagnostic_target ? `target: ${truncatePromptField(row.diagnostic_target, 48)}` : "",
    row.LR_plus ? `LR+ ${truncatePromptField(row.LR_plus, 12)}` : "",
    row.LR_minus ? `LR- ${truncatePromptField(row.LR_minus, 12)}` : "",
    row.result_changes_management ? `management: ${truncatePromptField(row.result_changes_management, 56)}` : "",
    row.evidence_source_primary ? `source: ${truncatePromptField(row.evidence_source_primary, 42)}` : ""
  ].filter(Boolean).join("; ");
  return `- ${location}: ${truncatePromptField(row.maneuver_or_finding, 70)} | label: ${truncatePromptField(row.suggested_checklist_label, 60)} | options: ${truncatePromptField(row.suggested_options, 90)} | use when: ${truncatePromptField(row.include_when, 110)} | evidence: ${truncatePromptField(evidencePhrase, 160)}`;
}).join("\n");
assert.ok(estimatedEvidenceBlock.includes("evidence:"), "evidence-enhanced rows should produce compact evidence text");
assert.ok(estimatedEvidenceBlock.length < 12000, "evidence-enhanced exam block should stay within prompt budget");

const cleanupPrompt = buildCleanupPrompt("BEDSIDE QUESTION CHECKLIST:", { issues: [{ message: "Example issue" }] }, { userContext: "<user_context>\nService: Endocrinology\n</user_context>" });
assert.ok(cleanupPrompt.includes("Example issue"), "cleanup prompt should include audit issues");
assert.ok(cleanupPrompt.includes("<user_context>"), "cleanup prompt should preserve user context");
assert.ok(cleanupPrompt.includes("Parent checklist titles must be the exact all-caps lines above, with no colon."), "cleanup prompt should reuse the shared format contract");

console.log("Checklist parser tests passed.");
