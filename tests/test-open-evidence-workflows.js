import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOpenEvidencePrompt,
  getOpenEvidenceTask,
  OPEN_EVIDENCE_PROMPT_CHAR_LIMIT,
  openEvidenceTasks
} from "../open-evidence-workflows.js";
import {
  extractCitations,
  extractRoundsPasteBack,
  parseOpenEvidenceResult
} from "../open-evidence-results.js";

assert.equal(openEvidenceTasks.length, 11, "OpenEvidence tasks should include rounds, safety, teaching, checklist refinement, and decision-tree builder tasks without the removed guideline-confirmation task");
const ids = new Set(openEvidenceTasks.map((task) => task.id));
[
  "initial_rounds_report",
  "full_rounds_report",
  "final_rounds_update",
  "checklist_improvement_review",
  "decision_tree_builder",
  "medication_safety",
  "find_exception",
  "attending_plan",
  "teaching_explanation",
  "discharge_checklist",
  "what_am_i_missing"
].forEach((id) => assert.ok(ids.has(id), `missing OpenEvidence task ${id}`));
[
  "generate_checklist",
  "refine_checklist"
].forEach((id) => assert.ok(!ids.has(id), `bedside checklist task should stay local, not OpenEvidence: ${id}`));

const baseContext = {
  sourceMode: "prior",
  contextType: "De-identified prior source note.",
  sourceContext: "Adult with diabetic ketoacidosis, potassium 3.4, insulin infusion, and discharge supply barrier.",
  labChronologyBlock: "Most recent potassium 3.4.",
  userContext: "<user_context>\nService: Endocrinology consult\n</user_context>",
  complaintCdsReport: "Hyperglycemia / possible DKA or HHS v1.1.0\nPotassium rule present.",
  evidenceSummary: "- Respiratory pattern: Kussmaul / normal / distressed",
  checklistPatientSummary: [
    "De-identified patient context for checklist tailoring.",
    "Adult with diabetic ketoacidosis, potassium 3.4, insulin infusion, and discharge supply barrier.",
    "Labs/medications: potassium 3.4, insulin infusion",
    "Selected local workup: Hyperglycemia / possible DKA or HHS",
    "Setting: Endocrinology consult / General medicine",
    "Modifier text, sanitized: discharge supply barrier"
  ].join("\n"),
  currentChecklist: "BEDSIDE QUESTION CHECKLIST\nHow is your nausea today?: Better / Same / Worse\n\nTARGETED PHYSICAL EXAM CHECKLIST\nMental status: Alert / Confused",
  checklistAuditSummary: "Bedside checklist has only 1 patient question.",
  refinementNotes: "Too short and missing discharge readiness.",
  compiledFindings: "Nausea resolved. Mental status alert.",
  objectiveData: "- Glucose: 486 (auto from chart)\n- Potassium: 3.4 (manual)",
  selectedWorkupTitle: "Hyperglycemia / possible DKA or HHS",
  selectedWorkupId: "hyperglycemia_possible_dka_v1",
  decisionTreeJson: "{\"schema\":\"clinical_pathway_tree_v1\",\"workupId\":\"hyperglycemia_possible_dka_v1\",\"root\":{\"id\":\"root\",\"label\":\"Current pathway\",\"type\":\"decision\",\"children\":[]},\"activationRules\":{}}",
  sameConversationReady: true
};

const outputContracts = {
  initial_rounds_report: ["I. SUBJECTIVE", "III. ASSESSMENT AND PLAN", "management recommendation", "Return plain-language clinical guidance only", "Do not return JSON"],
  full_rounds_report: [
    "I. SUBJECTIVE",
    "II. OBJECTIVE",
    "III. ASSESSMENT AND PLAN",
    "Include important negatives, trends, medication context, and contingencies",
    "Return plain-language clinical guidance only",
    "Do not return JSON"
  ],
  final_rounds_update: ["do not repeat stable background", "III. ASSESSMENT AND PLAN", "what changed in the last 24 hours", "changes management", "Return plain-language clinical guidance only", "Do not return JSON"],
  checklist_improvement_review: ["<clinical_question>", "plain-language clinical guidance only", "Do not return JSON", "Evidence-backed bedside additions to consider"],
  decision_tree_builder: [
    "plain-language clinical pathway question",
    "What evidence-backed management pathway considerations",
    "Do not include:",
    "JSON",
    "clinical_pathway_tree_v2",
    "Plain-language bullets only"
  ],
  medication_safety: ["5Rs", "right medication", "right dose", "right route", "right time/frequency"],
  find_exception: ["Use at most 4 bullets total.", "Prefix every bullet with EXCEPTION, CONTRAINDICATION, PREREQUISITE, or SPECIAL-POPULATION."],
  attending_plan: ["management recommendations", "latest guideline or literature", "Organize by active problem"],
  teaching_explanation: ["Use SOAP headings", "brand-new third-year medical student", "Spell out all non-obvious abbreviations"],
  discharge_checklist: ["Use at most 5 bullets total.", "Prefix every bullet with BARRIER, SUPPLY, FOLLOW-UP, COUNSEL, or RETURN."],
  what_am_i_missing: ["Use at most 5 bullets total.", "Prefix every bullet with MISS, VERIFY, ESCALATE, ASK, or UNVALIDATED GAP."]
};

openEvidenceTasks.forEach((task) => {
  assert.equal(typeof task.promptBuilder, "function", `${task.id} should have a prompt builder`);
  assert.equal(typeof task.pasteBackParser, "function", `${task.id} should have a paste-back parser`);
  assert.ok(task.requiredContext, `${task.id} should declare required context`);
  assert.ok(task.outputKind, `${task.id} should declare output kind`);
  assert.equal(task.pasteBackSchema, "", `${task.id} should not request OpenEvidence paste-back JSON`);
  const built = buildOpenEvidencePrompt(task.id, baseContext);
  const maxPromptLength = task.id === "decision_tree_builder"
    ? 9000
    : task.id === "checklist_improvement_review"
      ? 7000
      : 5200;
  assert.ok(built.prompt.length < maxPromptLength, `${task.id} base prompt should stay compact enough to review; saw ${built.prompt.length} chars`);
  if (task.id !== "decision_tree_builder" && task.id !== "checklist_improvement_review") {
    assert.ok(built.prompt.includes("<scope>"), `${task.id} prompt should define a scope boundary`);
    assert.ok(built.prompt.includes("What to answer:"), `${task.id} prompt should define what to answer`);
    assert.ok(built.prompt.includes("Do not include:"), `${task.id} prompt should name exclusions`);
    assert.ok(built.prompt.includes("<guidance>"), `${task.id} prompt should include evidence guidance`);
  } else if (task.id === "decision_tree_builder") {
    assert.ok(built.prompt.startsWith("Using OpenEvidence, answer a plain-language clinical pathway question"), "decision-tree prompt should ask for plain-language evidence review");
    assert.ok(!built.prompt.includes("Existing pathway JSON, if available:\n"), "decision-tree prompt should not include the existing-tree context heading");
    assert.ok(!built.prompt.includes("Objective workup data, if available:\n"), "decision-tree prompt should not include objective-data context bloat");
    assert.ok(!built.prompt.includes('Add "activationRules"'), "decision-tree prompt should not restore the old activationRules request");
  }
  if (task.id !== "decision_tree_builder") {
    assert.ok(
      built.prompt.includes("Base your response on evidence you can cite"),
      `${task.id} prompt should require evidence-based responses`
    );
    assert.ok(
      built.prompt.includes("fabricate facts, patient identifiers"),
      `${task.id} prompt should prohibit fabricating clinical data`
    );
    assert.ok(
      built.prompt.includes("Distinguish what evidence supports from what is uncertain"),
      `${task.id} prompt should separate evidence from uncertainty`
    );
  }
  assert.ok(!built.prompt.includes("<local_guideline_pathway>"), `${task.id} prompt should not paste local guideline pathway dumps into OpenEvidence`);
  assert.ok(!built.prompt.includes("<evidence_retrieval_summary>"), `${task.id} prompt should not paste local evidence retrieval summaries into OpenEvidence`);
  assert.ok(!built.prompt.includes("Use exactly these sections:"), `${task.id} prompt should not require broad fixed section inventories`);
  assert.ok(!built.prompt.includes("Use sections:"), `${task.id} prompt should not require broad fixed section inventories`);
  assert.ok(!built.prompt.includes("No high-yield items"), `${task.id} prompt should not request padded empty-section filler`);
  assert.ok(!built.prompt.includes("LIKELY OKAY OR NO ACTION NEEDED"), `${task.id} prompt should not request likely-okay/no-action output`);
  assert.ok(!built.prompt.includes("UNCHANGED ITEMS NOT WORTH REPEATING"), `${task.id} prompt should not request unchanged-item output`);
  assert.ok(!built.prompt.includes("LOW-YIELD DISTRACTIONS TO IGNORE"), `${task.id} prompt should not request low-yield-distraction output`);
  assert.ok(!built.prompt.includes("include exactly one fenced JSON block"), `${task.id} prompt should not request app paste-back JSON`);
  assert.ok(!built.prompt.includes("The JSON must use schema"), `${task.id} prompt should not include app schema contracts`);
  assert.ok(built.prompt.includes("Do not return JSON"), `${task.id} prompt should explicitly prohibit JSON output`);
  (outputContracts[task.id] || []).forEach((snippet) => {
    assert.ok(built.prompt.includes(snippet), `${task.id} should preserve minimal output contract text: ${snippet}`);
  });
  assert.ok(built.copySuccessMessage, `${task.id} should include copy success message`);
});

const builtPromptById = Object.fromEntries(openEvidenceTasks.map((task) => [task.id, buildOpenEvidencePrompt(task.id, baseContext).prompt]));
assert.ok(builtPromptById.initial_rounds_report.includes("docs/presentation-note-standard.md"), "initial rounds prompt should reference the canonical note standard");
assert.ok(builtPromptById.full_rounds_report.includes("docs/presentation-note-standard.md"), "full rounds prompt should reference the canonical note standard");
assert.ok(builtPromptById.final_rounds_update.includes("docs/presentation-note-standard.md"), "final update prompt should reference the canonical note standard");
assert.ok(!builtPromptById.decision_tree_builder.includes("Return only valid JSON."), "pathway OpenEvidence prompt must not request valid JSON");
assert.ok(!builtPromptById.decision_tree_builder.includes("\"schema\": \"clinical_pathway_tree_v2\""), "pathway OpenEvidence prompt must not include pathway schema JSON");
assert.ok(!builtPromptById.decision_tree_builder.includes("\"boxText\""), "pathway OpenEvidence prompt must not include app node fields");
assert.ok(!ids.has("confirm_guideline"), "Confirm guideline task should be removed because attending-level plan covers guideline-based recommendations");
assert.ok(!builtPromptById.find_exception.includes("GUIDELINE ALIGNMENT VERDICT"), "exception finding should not duplicate guideline confirmation");
assert.ok(!builtPromptById.attending_plan.includes("READING PLAN"), "attending plan should not duplicate teaching output");
assert.ok(!builtPromptById.teaching_explanation.includes("READING PLAN"), "teaching output should avoid reference-triggering reading plan sections");
assert.ok(!builtPromptById.discharge_checklist.includes("PROBLEM LIST FOR PRESENTATION"), "discharge readiness should not duplicate rounds report sections");
assert.ok(!builtPromptById.what_am_i_missing.includes("DISPOSITION READINESS VERDICT"), "blind-spot review should not duplicate discharge readiness output");
assert.ok(!builtPromptById.initial_rounds_report.includes("QUESTIONS FOR TEAM"), "initial rounds should not invite generic team questions");
assert.ok(!builtPromptById.initial_rounds_report.includes("PRE-ROUNDS SELF-CHECKS"), "initial rounds should not restore the old rounds report sections");
assert.ok(!builtPromptById.final_rounds_update.includes("PLAN OR TASK CHANGES TO VERIFY"), "final update should avoid vague task-change sections");
assert.ok(!builtPromptById.medication_safety.includes("MEDICATION QUESTIONS FOR TEAM OR NURSING"), "medication prompt should avoid generic team/nursing questions");
["initial_rounds_report", "full_rounds_report", "final_rounds_update", "attending_plan"].forEach((taskId) => {
  assert.ok(/citation|guideline|literature/i.test(builtPromptById[taskId]), `${taskId} should request guideline/literature support where management recommendations are made`);
});

const verboseGuidelineReport = [
  "Guideline Complaint CDS",
  "Basic bedside data / safety checks",
  "- Measure vital sign 1 [SSC_SEPSIS_2026; trace fever_infection_sepsis_v1.safety.1]",
  "  Rationale: Repeated rationale text that should not bloat copied prompts.",
  "Suppressed/not-recommended items",
  "- PMI [SSC_SEPSIS_2026; trace suppressed]"
].join("\n");

const promptWithoutGuidelineDump = buildOpenEvidencePrompt("initial_rounds_report", {
  ...baseContext,
  complaintCdsReport: verboseGuidelineReport,
  evidenceSummary: `${"- Retrieved evidence detail that should not be pasted.\n".repeat(120)}`
}).prompt;
assert.ok(promptWithoutGuidelineDump.length < 5200, `verbose guideline/evidence context should not bloat OpenEvidence prompts; saw ${promptWithoutGuidelineDump.length} chars`);
assert.ok(!promptWithoutGuidelineDump.includes("Measure vital sign 1"), "OpenEvidence prompt should not include local guideline rows");
assert.ok(!promptWithoutGuidelineDump.includes("Retrieved evidence detail"), "OpenEvidence prompt should not include retrieved evidence summaries");
assert.ok(!promptWithoutGuidelineDump.includes("trace fever_infection_sepsis_v1"), "OpenEvidence prompt should not include local trace/debug metadata");
assert.ok(!promptWithoutGuidelineDump.includes("omitted from prompt"), "OpenEvidence prompt should not include guideline dump omission notices");

const oversizedSourceContext = [
  "Case B - Pneumonia",
  "Selected workup: Fever, infection, or sepsis",
  "Assessment: hypoxic pneumonia with antibiotics started and oxygen requirement improving.",
  "Plan: reassess oxygen need, cultures, antibiotic fit, discharge barriers, and return precautions.",
  ...Array.from({ length: 1800 }, (_, index) => `Generated boilerplate line ${index}: copied chart shell text that should not enter OpenEvidence prompts.`),
  ...Array.from({ length: 260 }, (_, index) => `Lab trend ${index}: WBC ${12 + (index % 4)}; creatinine ${1 + (index % 3) / 10}; oxygen saturation ${92 + (index % 5)}%.`)
].join("\n");
const oversizedChecklist = [
  "BEDSIDE QUESTION CHECKLIST",
  ...Array.from({ length: 900 }, (_, index) => `Question ${index}: Any worsening cough, dyspnea, fever, oral intake issue, medication barrier, or discharge concern?`),
  "TARGETED PHYSICAL EXAM CHECKLIST",
  ...Array.from({ length: 900 }, (_, index) => `Exam ${index}: Check work of breathing, oxygen device fit, focal lung sounds, edema, perfusion, and mental status.`)
].join("\n");
const oversizedDecisionTree = JSON.stringify({
  schema: "clinical_pathway_tree_v1",
  workupId: "fever_infection_sepsis_v1",
  root: {
    id: "root",
    label: "Assess suspected infection",
    type: "action",
    children: Array.from({ length: 600 }, (_, index) => ({
      id: `node_${index}`,
      label: `Branch ${index}: evaluate severity, source, antimicrobial fit, monitoring, and disposition threshold.`,
      type: "decision",
      edgeLabel: `criteria ${index}`,
      children: []
    }))
  },
  activationRules: {}
}, null, 2);
const oversizedContext = {
  ...baseContext,
  sourceContext: oversizedSourceContext,
  checklistPatientSummary: [
    "Compact de-identified checklist-review context. Raw source note text and the full HPI are intentionally excluded.",
    "Patient: Case B - Pneumonia",
    "Selected local workup: Fever, infection, or sepsis",
    ...Array.from({ length: 500 }, (_, index) => `Repeated checklist context ${index}: not needed in the copied prompt.`)
  ].join("\n"),
  currentChecklist: oversizedChecklist,
  compiledFindings: [
    "Pre-rounding update draft (local review)",
    "Case B - Pneumonia",
    "Bedside findings: Oxygen need increased during hallway ambulation.",
    ...Array.from({ length: 900 }, (_, index) => `Repeated finding ${index}: unchanged low-yield detail.`)
  ].join("\n"),
  objectiveData: [
    "Objective workup data for Fever, infection, or sepsis:",
    ...Array.from({ length: 500 }, (_, index) => `- Objective row ${index}: present (auto from chart)`)
  ].join("\n"),
  decisionTreeJson: oversizedDecisionTree,
  sameConversationReady: false
};
for (const task of openEvidenceTasks) {
  const built = buildOpenEvidencePrompt(task.id, oversizedContext);
  assert.ok(
    built.prompt.length < OPEN_EVIDENCE_PROMPT_CHAR_LIMIT,
    `${task.id} prompt must stay under OpenEvidence's 50,000 character limit with oversized local context; saw ${built.prompt.length}`
  );
  assert.ok(
    built.prompt.length < 30000,
    `${task.id} prompt should stay concise after context compaction; saw ${built.prompt.length}`
  );
  assert.ok(!built.prompt.includes("Generated boilerplate line 1799"), `${task.id} prompt should drop repeated chart boilerplate`);
}

const oversizedDecisionTreePrompt = buildOpenEvidencePrompt("decision_tree_builder", oversizedContext).prompt;
assert.ok(
  oversizedDecisionTreePrompt.length < 7000,
  `decision-tree prompt should stay short and omit existing trees; saw ${oversizedDecisionTreePrompt.length}`
);
assert.ok(!oversizedDecisionTreePrompt.includes("Existing pathway summarized"), "decision-tree prompt should not include existing-tree summaries");
assert.ok(!oversizedDecisionTreePrompt.includes("Existing pathway JSON"), "decision-tree prompt should not include existing-tree JSON context");
assert.ok(!oversizedDecisionTreePrompt.includes("node_599"), "decision-tree prompt should not include tail raw node ids from huge local trees");
assert.ok(!oversizedDecisionTreePrompt.includes("Branch 599"), "decision-tree prompt should not include tail raw branch labels from huge local trees");

const missingItemsPrompt = buildOpenEvidencePrompt("what_am_i_missing", baseContext);
assert.ok(missingItemsPrompt.prompt.includes("UNVALIDATED GAP"), "blind-spot prompt should keep a local-review gap prefix");
assert.ok(
  missingItemsPrompt.prompt.includes("ASK, or UNVALIDATED GAP"),
  "blind-spot prompt should keep the ASK prefix for team-judgment items"
);

const checklistImprovementPrompt = buildOpenEvidencePrompt("checklist_improvement_review", {
  ...baseContext,
  sourceContext: "Raw HPI from John Smith with room 123 should never be included in this prompt."
});
const examOnlyChecklistPrompt = buildOpenEvidencePrompt("checklist_improvement_review", {
  ...baseContext,
  checklistSectionKey: "physical_exam",
  currentChecklist: "Checklist scope: physical_exam\n<target_section_rows>\n- exam_row_1 | physical_exam | requiredExam | Vitals | Mental status | unanswered\n</target_section_rows>"
});
const allSectionsChecklistPrompt = buildOpenEvidencePrompt("checklist_improvement_review", {
  ...baseContext,
  checklistSectionKey: "all_sections",
  currentChecklist: "Checklist scope: physical_exam and history_questions\n<physical_exam_rows>\n- exam_row_1\n</physical_exam_rows>\n<history_questions_rows>\n- history_row_1\n</history_questions_rows>"
});
assert.equal(checklistImprovementPrompt.requiredContext, "checklist_refinement", "checklist improvement should require the local checklist plus compact context");
assert.equal(checklistImprovementPrompt.outputKind, "checklist_evidence_review", "checklist improvement should be an evidence review, not a structured paste-back task");
assert.ok(checklistImprovementPrompt.prompt.includes("<current_checklist>"), "checklist improvement prompt should include the current checklist");
assert.ok(checklistImprovementPrompt.prompt.includes("<deidentified_patient_context>"), "checklist improvement prompt should include de-identified patient context");
assert.ok(checklistImprovementPrompt.prompt.includes("<objective_data>"), "checklist improvement prompt should include structured objective data");
assert.ok(checklistImprovementPrompt.prompt.includes("<new_bedside_findings>"), "checklist improvement prompt should include bedside findings");
assert.ok(!checklistImprovementPrompt.prompt.includes("<source_context>"), "checklist improvement prompt must not include the raw source context block");
assert.ok(!checklistImprovementPrompt.prompt.includes("<local_guideline_pathway>"), "checklist improvement prompt must not include local guideline dumps");
assert.ok(!checklistImprovementPrompt.prompt.includes("<evidence_retrieval_summary>"), "checklist improvement prompt must not include evidence retrieval summaries");
assert.ok(!checklistImprovementPrompt.prompt.includes("John Smith"), "checklist improvement prompt must not leak raw source text");
assert.ok(checklistImprovementPrompt.prompt.includes("de-identified patient context"), "checklist improvement prompt should include full de-identified context guidance");
assert.ok(!checklistImprovementPrompt.prompt.includes("full HPI are intentionally excluded"), "checklist improvement prompt should not withhold patient context");
assert.ok(!checklistImprovementPrompt.prompt.includes("workup_section_patch_v1"), "checklist improvement prompt must not request structured patch JSON");
assert.ok(!checklistImprovementPrompt.prompt.includes("\"operations\""), "checklist improvement prompt must not ask for patch operations");
assert.ok(!checklistImprovementPrompt.prompt.includes("\"itemId\""), "checklist improvement prompt must not ask for app item IDs");
assert.ok(checklistImprovementPrompt.prompt.includes("Do not return JSON"), "checklist improvement prompt should explicitly prohibit JSON");
assert.ok(examOnlyChecklistPrompt.prompt.includes("Name the target section as physical exam"), "single-section checklist prompt should name the selected section in prose");
assert.ok(examOnlyChecklistPrompt.prompt.includes("<target_section_rows>"), "single-section checklist prompt should include only the focused section rows");
assert.ok(!examOnlyChecklistPrompt.prompt.includes("BEDSIDE QUESTION CHECKLIST"), "single-section checklist prompt should not include the full rendered checklist text");
assert.ok(!allSectionsChecklistPrompt.prompt.includes("Return one fenced JSON block per section"), "all-sections checklist prompt must not request JSON blocks");
assert.ok(allSectionsChecklistPrompt.prompt.includes("<physical_exam_rows>"), "all-sections checklist prompt should include both section row blocks");
assert.ok(!checklistImprovementPrompt.prompt.includes("\"schema\": \"workup_refinement_v1\""), "checklist improvement prompt should not request the legacy full replacement schema");
assert.ok(checklistImprovementPrompt.prompt.indexOf("<clinical_question>") < checklistImprovementPrompt.prompt.indexOf("<output_format>"), "checklist improvement prompt should present the clinical question before output guidance");
assert.ok(!checklistImprovementPrompt.prompt.includes("Output only one fenced JSON block"), "checklist improvement prompt must not be a paste-back prompt");
assert.ok(!checklistImprovementPrompt.prompt.includes("literal underscores"), "checklist improvement prompt should not include JSON formatting repair rules");
assert.ok(!checklistImprovementPrompt.prompt.includes("Update/remove: use exact itemId"), "checklist improvement prompt should not require stable row IDs");
assert.ok(checklistImprovementPrompt.reviewText.includes("Selected local workup"), "PHI review text should include the compact patient summary");
assert.ok(checklistImprovementPrompt.reviewText.includes("How is your nausea today?"), "PHI review text should include the current checklist");
assert.ok(!checklistImprovementPrompt.reviewText.includes("John Smith"), "PHI review text should not scan or expose withheld raw source text for checklist improvement");
assert.ok(!checklistImprovementPrompt.reviewText.includes("Potassium rule present"), "PHI review text should not include local guideline report text that is not in the prompt");

const medicationSameConversation = buildOpenEvidencePrompt("medication_safety", {
  ...baseContext,
  sameConversationReady: true
});
assert.equal(medicationSameConversation.reviewScope, "source-free", "same-conversation medication safety should not scan source-free prompt");
assert.ok(!medicationSameConversation.prompt.includes("<source_context>"), "same-conversation medication prompt should not repeat source context");

const medicationFallback = buildOpenEvidencePrompt("medication_safety", {
  ...baseContext,
  sameConversationReady: false
});
assert.equal(medicationFallback.reviewScope, "custom", "context-included medication fallback should scan patient-originated context");
assert.ok(medicationFallback.prompt.includes("<source_context>"), "medication fallback should include de-identified source context");

const medicationResult = medicationFallback.pasteBackParser(`VERIFY
- Insulin glargine: verify basal insulin was not held because omission matters in type 1 diabetes.

CITATIONS
Diabetes Care 2024. https://doi.org/10.2337/dci24-0032`);
assert.equal(medicationResult.outputKind, "medication_safety");
assert.equal(medicationResult.concerns.length, 1, "medication parser should retain actionable concern bullets");
assert.ok(medicationResult.citations.length >= 1, "medication parser should extract citations");

const attendingPlanResult = parseOpenEvidenceResult({
  taskId: "attending_plan",
  outputKind: "attending_plan",
  text: "DIABETIC KETOACIDOSIS\n- Continue insulin strategy supported by Diabetes Care 2024. doi:10.2337/dci24-0032"
});
assert.ok(attendingPlanResult.sections.some((section) => /DIABETIC KETOACIDOSIS/.test(section.title)), "attending plan parser should retain problem headings");
assert.ok(extractCitations(attendingPlanResult.sections.map((section) => section.body).join("\n")).length >= 1, "citation extractor should find guideline citations in attending plan output");

const roundsPasteBackText = `I. SUBJECTIVE
- Better nausea.

APP_PASTE_BACK_JSON
\`\`\`json
{"schema":"open_evidence_rounds_pasteback_v1","presentationType":"oral_rounds_soap","oneLiner":"Adult with DKA improving on insulin.","subjective":["Nausea improved"],"objective":["K 3.4"],"assessmentPlan":["Continue insulin with potassium monitoring"],"followUpTasks":["Verify supplies"],"bedsideRecheck":["Ask about oral intake"],"plainTextSummary":"DKA improving; verify potassium and discharge supplies."}
\`\`\``;
const roundsPasteBack = extractRoundsPasteBack(roundsPasteBackText);
assert.equal(roundsPasteBack.oneLiner, "Adult with DKA improving on insulin.");
assert.deepEqual(roundsPasteBack.followUpTasks, ["Verify supplies"]);
const roundsParsedResult = parseOpenEvidenceResult({
  taskId: "initial_rounds_report",
  outputKind: "rounds_report",
  text: roundsPasteBackText
});
assert.equal(roundsParsedResult.roundsPasteBack.plainTextSummary, "DKA improving; verify potassium and discharge supplies.");

const repairedRoundsPasteBack = extractRoundsPasteBack(`{
  "schema": "open<em>evidence</em>rounds<em>pasteback</em>v1",
  "presentationType": "oral<em>rounds</em>soap",
  "oneLiner": "Adult with diabetes admitted for moderate DKA.",
  "subjective":
    "Missed basal insulin",
    "Needs sick-day education"
  ],
  "objective":
    "Glucose 318",
    "Anion gap 22"
  ],
  "assessmentPlan":
    "Continue insulin until resolution criteria met"
  ],
  "followUpTasks":
    "Trend BMP and VBG"
  ],
  "bedsideRecheck":
    "Volume status"
  ],
  "plainTextSummary": "Moderate DKA; trend labs and confirm insulin access."
}`);
assert.equal(repairedRoundsPasteBack.schema, "open_evidence_rounds_pasteback_v1");
assert.equal(repairedRoundsPasteBack.presentationType, "oral_rounds_soap");
assert.deepEqual(repairedRoundsPasteBack.subjective, ["Missed basal insulin", "Needs sick-day education"]);

assert.equal(getOpenEvidenceTask("not_a_task"), null, "unknown task lookup should return null");

const appHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(appHtml.includes("promptTemplatesByTaskId"), "OpenEvidence prompt templates should persist as first-class local state");
assert.ok(appHtml.includes("todayOpenEvidencePasteInput"), "Today cockpit should accept returned OpenEvidence answers");
assert.ok(appHtml.includes("todayRoundsPasteBackPreview"), "Today cockpit should preview returned OpenEvidence answers");
assert.ok(appHtml.includes("Save result"), "OpenEvidence review tab should save plain answers locally");
assert.ok(appHtml.includes("savePlainOpenEvidenceAnswerForActivePatient"), "app should persist plain OpenEvidence answers to active patient state");
assert.ok(appHtml.includes("extractRoundsPasteBack"), "Today cockpit should keep legacy structured paste-back parsing available");
assert.ok(appHtml.includes("resolvePromptTemplate"), "OpenEvidence copy should resolve editable template variables before copying");
assert.ok(appHtml.includes("Editable smart-phrase template"), "OpenEvidence review tab should show editable smart-phrase prompt templates");
assert.ok(appHtml.includes('id="savePromptTemplateButton"'), "OpenEvidence review tab should let users save edited prompt templates");
assert.ok(appHtml.includes('id="promptVariableBar"'), "OpenEvidence review tab should expose prompt variable insertion");
assert.ok(!appHtml.includes("Paste answer for local review"), "OpenEvidence review tab should not invite arbitrary answer paste-back");
assert.ok(!appHtml.includes("Answer in concise bullet points. Do not include patient identifiers."), "review-tab preview should not collapse every task into a generic bullet-answer prompt");
assert.ok(!appHtml.includes("1) List current medications and doses when provided."), "medication safety preview should use the registry output contract, not legacy generic preview instructions");
assert.ok(appHtml.includes("workupRefinementsByModuleId"), "app should persist saved workup refinements in vault state");
assert.ok(appHtml.includes("patientWorkupRefinements"), "app should support patient-only checklist refinements");
assert.ok(appHtml.includes("decisionTreeGraphsByModuleId"), "app should persist saved decision-tree defaults in vault state");
assert.ok(appHtml.includes('id="decisionTreeJsonInput"'), "app should support decision-tree JSON paste-back");

console.log("OpenEvidence workflow tests passed.");
