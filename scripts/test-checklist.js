import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  auditChecklistTraceability,
  buildCleanupPrompt,
  buildLocalChecklistFromWorkup,
  checklistPrompt,
  mergeChecklistAuditResults,
  newAdmissionChecklistPrompt,
  normalizeChecklistText,
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

Have you felt shaky, sweaty, or lightheaded at any point since yesterday?: No / Yes / Other ___

DISCHARGE READINESS

Were you able to bring your insulin pen box from home?: Yes / No / Other ___

Do you have ketone test strips and a glucagon kit at home?: Yes, both / Ketone strips only / Glucagon only / Neither / Not sure / Other ___

SICK DAY KNOWLEDGE AND CONCERNS

If you get sick again and cannot eat, do you know what to do with your long-acting insulin?: Keep taking it / Stop it / Not sure / Other ___

What is your biggest concern about going home?: ___

TARGETED PHYSICAL EXAM CHECKLIST

VITAL SIGNS AND SUPPORT

Heart rate: ___

Blood pressure: ___

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
assert.equal(itemsByCategory(dkaSections, "bedside").length, 8, "DKA sample should parse 8 bedside questions");
assert.equal(itemsByCategory(dkaSections, "exam").length, 13, "DKA sample has 13 targeted exam item lines");
assert.ok(!issueTypes(dkaAudit).includes("bedside-count-low"), "DKA sample must not warn that bedside questions are zero");
assert.ok(dkaAudit.ok, "DKA sample should pass checklist quality validation");

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

const badBlankChecklist = `TARGETED PHYSICAL EXAM CHECKLIST
MUSCULOSKELETAL STRENGTH EXAM
Upper extremity strength: ___ / 5`;
const badBlankAudit = validateChecklist(parseChecklist(badBlankChecklist));
assert.ok(issueTypes(badBlankAudit).includes("bad-blank-format"), "bad blank fraction formats should still warn");

const normalized = normalizeChecklistText("BEDSIDE QUESTION CHECKLIST:\n- How are you? Better / Worse / Other ___");
assert.ok(normalized.includes("How are you?: Better / Worse / Other ___"), "normalization should recover question-plus-options lines");

const unsupportedLocalChecklist = buildLocalChecklistFromWorkup({});
assert.equal(unsupportedLocalChecklist, "", "local checklist generation should block unsupported/no-intent workups instead of emitting generic defaults");

const locallyGeneratedChecklist = buildLocalChecklistFromWorkup({
  complaintResult: {
    matched: true,
    requiredQuestions: [
      { label: "Known diabetes type, home insulin regimen, and last insulin dose?", options: [{ label: "Unknown" }, { label: "Yes" }, { label: "No" }] },
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
      { label: "Assess Kussmaul breathing" },
      { label: "Assess mental status" }
    ]
  },
  recommendation: {
    focusedHistoryQuestions: [
      { text: "What was the most recent glucose value and timing of last insulin?", options: "Value ___ / Last insulin ___ / Unsure / Other ___" }
    ],
    basicSafetyChecks: [
      { label: "Bedside glucose safety check", options: "___" }
    ],
    corePhysicalExamManeuvers: [
      { label: "Capillary refill", options: "Less than 2 seconds / 2 seconds or more" }
    ]
  }
});
const localSections = parseChecklist(locallyGeneratedChecklist);
const localAudit = validateChecklist(localSections);
assert.ok(
  itemsByCategory(localSections, "bedside").length >= 6 && itemsByCategory(localSections, "bedside").length <= 8,
  "local workup checklist should use validated/guideline history plus contextual clinical backfill without generic padding"
);
assert.ok(itemsByCategory(localSections, "exam").length >= 4, "local workup checklist should include validated/guideline exam items without an external generator");
assert.doesNotMatch(
  locallyGeneratedChecklist,
  /(?:Blood pressure|Heart rate|Respiratory rate|Oxygen saturation|Temperature|Bedside glucose safety check):/i,
  "local physical exam checklist should not emit vital signs or basic bedside measurements as exam rows"
);
assert.match(
  locallyGeneratedChecklist,
  /Inspect mucous membranes|Assess Kussmaul breathing|Assess mental status|Capillary refill/i,
  "local physical exam checklist should preserve actual bedside maneuvers after removing basic safety checks"
);
assert.ok(localAudit.ok, localAudit.issues.map((issue) => issue.message).join("\n"));
assert.doesNotMatch(locallyGeneratedChecklist, /OpenEvidence/i, "local checklist output should not be an OpenEvidence prompt");
assert.doesNotMatch(locallyGeneratedChecklist, /Since yesterday, is your main symptom|What is your main concern today|General appearance/i, "local checklist output should not add generic fallback rows when validated content exists");

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
  1,
  "local checklist should not duplicate broad fever source-localizing questions from module and evidence recommendation"
);
assert.equal(
  feverDedupedQuestionLabelRows.filter((label) => /cough|shortness of breath|respiratory/i.test(label)).length,
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
assert.ok(appHtml.includes("studentExamEvidenceOverlayUrl"), "app should load the exam evidence overlay");
assert.ok(appHtml.includes("formatStudentExamEvidencePhrase"), "app should append compact evidence phrases to selected exam rows");
assert.ok(appHtml.includes("When evidence metadata appears"), "student exam reference prompt should scope evidence metadata");
assert.ok(appHtml.includes("studentExamReferenceMaxRows = 30"), "exam reference prompt should keep the existing row cap for prompt budget");
assert.ok(appHtml.includes("evidenceFileUrls"), "app should know the requested evidence CSV file set");
assert.ok(appHtml.includes("addEvidenceOrStudentReferenceToPrompt"), "app should try evidence retrieval before legacy exam reference fallback");
assert.ok(appHtml.includes("renderEvidenceMeta"), "app should render evidence rationale chips for matched checklist rows");
assert.ok(appHtml.includes("evidenceReviewStorageKey"), "app should persist expert review feedback locally");
assert.ok(evidenceModule.includes("retrieved_evidence_candidates"), "evidence module should inject retrieved evidence candidates");
assert.ok(appHtml.includes('id="localWorkupStep"'), "main workflow should include an inline local workup selection step");
assert.ok(appHtml.includes("Choose diagnosis or bedside workup"), "workflow should explicitly ask the user to choose a diagnosis/workup");
assert.ok(appHtml.includes("Build selected workup / guidelines"), "workflow should expose local guideline/workup generation before checklist build");
assert.ok(appHtml.includes("localWorkupBuiltResults"), "workflow should show selected local workup/guideline detail inline, not only in tools");
assert.ok(appHtml.includes('syncLocalWorkupSearchInput("DKA")'), "demo note should prefill DKA search without silently selecting a workup");
assert.ok(appHtml.includes('action: "focus-workup"'), "guided next action should focus the local workup selector");
assert.ok(appHtml.includes('action: "build-local-workup"'), "guided next action should build selected local workup/guidelines");
assert.ok(!appHtml.includes("Paste the initial rounds prompt into OpenEvidence first so"), "main guided flow should not make OpenEvidence the prerequisite before local checklist build");
assert.ok(appHtml.includes("elements.scrubAndCopyButton.disabled = isPrior && (!hasReviewedPriorContext || !hasSelectedWorkup);"), "prior-note local checklist build should require reviewed local context and a selected validated workup, not an OpenEvidence prompt first");
assert.ok(appHtml.includes("elements.copySummaryChecklistPromptButton.disabled = !summaryChecklistContextReady || !hasSelectedWorkup;"), "summary local checklist build should require a selected validated workup without being gated by initial OpenEvidence context");
assert.ok(appHtml.includes("Choose a validated local diagnosis/workup before building the bedside checklist."), "local checklist generator should block until a validated workup is explicitly selected");
assert.ok(/function\s+clinicalIntentsForLocalChecklist[\s\S]*?return selected;[\s\S]*?\}/.test(appHtml), "local checklist generation should use only explicitly selected validated intents, not silent text inference");
assert.ok(appHtml.includes("const selectedIntentKnowledgeModule = complaintModuleForSelectedIntents(initialSelectedIntents);"), "local checklist build should resolve an explicitly selected diagnosis/workup before text matching");
assert.ok(appHtml.includes("const contextKnowledgeModule = explicitKnowledgeModule || selectedIntentKnowledgeModule;"), "selected workup should be the local checklist module source");
assert.ok(!appHtml.includes("selectedIntentKnowledgeModule || selectComplaintModule(contextText"), "local checklist build should not silently fall back to free-text diagnosis matching");
assert.ok(appHtml.includes('const complaintCdsReport = needsChecklistRefinementContext ? "" : fullComplaintCdsReport;'), "OpenEvidence checklist improvement prompt should not include the full local guideline report");
assert.ok(appHtml.includes("checklist_improvement_review"), "app should expose optional OpenEvidence checklist improvement review");
assert.ok(appHtml.includes("Copy review prompt"), "checklist screen should offer optional prompt copy instead of making OpenEvidence the generator");
assert.ok(
  /taskId:\s*"checklist_improvement_review"[\s\S]*?filterLikelyFalsePositiveWarnings:\s*true/.test(appHtml),
  "checklist improvement prompt copy should one-click through likely clinical false-positive name warnings"
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
