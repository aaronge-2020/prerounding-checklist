import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOpenEvidencePrompt,
  getOpenEvidenceTask,
  openEvidenceTasks
} from "../open-evidence-workflows.js";
import {
  extractCitations,
  parseOpenEvidenceResult
} from "../open-evidence-results.js";

assert.equal(openEvidenceTasks.length, 11, "OpenEvidence tasks should include concise and full rounds tasks plus higher-reasoning tasks and optional checklist improvement review");
const ids = new Set(openEvidenceTasks.map((task) => task.id));
[
  "initial_rounds_report",
  "full_rounds_report",
  "final_rounds_update",
  "checklist_improvement_review",
  "medication_safety",
  "confirm_guideline",
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
    "This is a compact de-identified checklist-review context. Raw source note text and the full HPI are intentionally excluded.",
    "Selected local workup: Hyperglycemia / possible DKA or HHS",
    "Setting: Endocrinology consult / General medicine",
    "Modifier text, sanitized: discharge supply barrier"
  ].join("\n"),
  currentChecklist: "BEDSIDE QUESTION CHECKLIST\nHow is your nausea today?: Better / Same / Worse\n\nTARGETED PHYSICAL EXAM CHECKLIST\nMental status: Alert / Confused",
  checklistAuditSummary: "Bedside checklist has only 1 patient question.",
  refinementNotes: "Too short and missing discharge readiness.",
  compiledFindings: "Nausea resolved. Mental status alert.",
  sameConversationReady: true
};

const outputContracts = {
  initial_rounds_report: ["Use at most 6 bullets total.", "Prefix every bullet with SAY, CHECK, ASK, or WATCH."],
  full_rounds_report: [
    "Use exactly these headings, in this order:",
    "ACTIVE PROBLEMS AND TRAJECTORY",
    "ASSESSMENT AND PLAN",
    "Put each lab/vital/medication/imaging trend in only one section unless it changes a separate decision elsewhere.",
    "Do not include exhaustive PMH, medication lists, normal exam, negative ROS, or copied chart narrative unless it changes today's plan."
  ],
  final_rounds_update: ["Use at most 5 bullets total.", "Only include changes since the initial report"],
  checklist_improvement_review: ["Use at most 5 bullets total.", "Prefix every bullet with ADD, REMOVE, or WORDING.", "UNVALIDATED LOCAL REVIEW"],
  medication_safety: ["Use at most 5 bullets total.", "Prefix every bullet with VERIFY, ASK, MONITOR, or ESCALATE."],
  confirm_guideline: ["Use at most 4 bullets total.", "Use OpenEvidence's own current guideline access; do not ask me to paste guidelines.", "Include at most 2 citations total"],
  find_exception: ["Use at most 4 bullets total.", "Prefix every bullet with EXCEPTION, CONTRAINDICATION, PREREQUISITE, or SPECIAL-POPULATION."],
  attending_plan: ["Use at most 6 bullets total.", "Do not write a full problem-list assessment and plan"],
  teaching_explanation: ["Use at most 4 bullets total.", "Do not write an illness-script review, background review, or management plan."],
  discharge_checklist: ["Use at most 5 bullets total.", "Prefix every bullet with BARRIER, SUPPLY, FOLLOW-UP, COUNSEL, or RETURN."],
  what_am_i_missing: ["Use at most 5 bullets total.", "Prefix every bullet with MISS, VERIFY, ESCALATE, ASK, or UNVALIDATED GAP."]
};

openEvidenceTasks.forEach((task) => {
  assert.equal(typeof task.promptBuilder, "function", `${task.id} should have a prompt builder`);
  assert.equal(typeof task.pasteBackParser, "function", `${task.id} should have a paste-back parser`);
  assert.ok(task.requiredContext, `${task.id} should declare required context`);
  assert.ok(task.outputKind, `${task.id} should declare output kind`);
  const built = buildOpenEvidencePrompt(task.id, baseContext);
  assert.ok(built.prompt.length < 4000, `${task.id} base prompt should stay tighter than the old 4.6k cap; saw ${built.prompt.length} chars`);
  assert.ok(built.prompt.includes("<task_boundary>"), `${task.id} prompt should define a unique task boundary`);
  assert.ok(built.prompt.includes("Primary purpose:"), `${task.id} prompt should define a primary purpose`);
  assert.ok(built.prompt.includes("Do not use this task for:"), `${task.id} prompt should name exclusions to prevent redundant task use`);
  assert.ok(built.prompt.includes("<clinical_safety_rules>"), `${task.id} prompt should include safety rules`);
  assert.ok(built.prompt.includes("<usefulness_rules>"), `${task.id} prompt should include usefulness rules`);
  assert.ok(
    built.prompt.includes("Output only management-changing items"),
    `${task.id} prompt should require management-changing output only`
  );
  assert.ok(
    built.prompt.includes("NO MANAGEMENT-CHANGING ITEMS FOUND"),
    `${task.id} prompt should define the no-management-change fallback`
  );
  assert.ok(
    built.prompt.includes("Do not ask the team about facts the student can usually verify directly"),
    `${task.id} prompt should prevent self-checkable facts from becoming team questions`
  );
  assert.ok(
    built.prompt.includes("Do not include conversational follow-up offers"),
    `${task.id} prompt should suppress low-value conversational closing offers`
  );
  assert.ok(
    built.prompt.includes("Use only the prefixes or headings requested by the task; do not add empty headings or sections."),
    `${task.id} prompt should avoid padded headings and sections`
  );
  assert.ok(
    built.prompt.includes("Local validated clinical intents and reviewed evidence remain authoritative"),
    `${task.id} prompt should preserve the local validated-intent authority boundary`
  );
  assert.ok(
    built.prompt.includes("UNVALIDATED GAP SUGGESTION"),
    `${task.id} prompt should label missing bedside question/exam ideas as unvalidated gap suggestions`
  );
  assert.ok(
    built.prompt.includes("Do not write, rewrite, or silently expand the final bedside checklist"),
    `${task.id} prompt should prevent OpenEvidence from creating bedside checklist rows`
  );
  assert.ok(!built.prompt.includes("<local_guideline_pathway>"), `${task.id} prompt should not paste local guideline pathway dumps into OpenEvidence`);
  assert.ok(!built.prompt.includes("<evidence_retrieval_summary>"), `${task.id} prompt should not paste local evidence retrieval summaries into OpenEvidence`);
  assert.ok(!built.prompt.includes("Use exactly these sections:"), `${task.id} prompt should not require broad fixed section inventories`);
  assert.ok(!built.prompt.includes("Use sections:"), `${task.id} prompt should not require broad fixed section inventories`);
  assert.ok(!built.prompt.includes("No high-yield items"), `${task.id} prompt should not request padded empty-section filler`);
  assert.ok(!built.prompt.includes("LIKELY OKAY OR NO ACTION NEEDED"), `${task.id} prompt should not request likely-okay/no-action output`);
  assert.ok(!built.prompt.includes("UNCHANGED ITEMS NOT WORTH REPEATING"), `${task.id} prompt should not request unchanged-item output`);
  assert.ok(!built.prompt.includes("LOW-YIELD DISTRACTIONS TO IGNORE"), `${task.id} prompt should not request low-yield-distraction output`);
  (outputContracts[task.id] || []).forEach((snippet) => {
    assert.ok(built.prompt.includes(snippet), `${task.id} should preserve minimal output contract text: ${snippet}`);
  });
  assert.ok(built.copySuccessMessage, `${task.id} should include copy success message`);
});

const builtPromptById = Object.fromEntries(openEvidenceTasks.map((task) => [task.id, buildOpenEvidencePrompt(task.id, baseContext).prompt]));
assert.ok(!builtPromptById.confirm_guideline.includes("CONTRAINDICATIONS COMPETING RISKS OR SPECIAL POPULATIONS"), "guideline confirmation should not duplicate the exception-hunting output");
assert.ok(!builtPromptById.find_exception.includes("GUIDELINE ALIGNMENT VERDICT"), "exception finding should not duplicate guideline confirmation");
assert.ok(!builtPromptById.attending_plan.includes("READING PLAN"), "attending plan should not duplicate teaching output");
assert.ok(!builtPromptById.teaching_explanation.includes("READING PLAN"), "teaching output should avoid reference-triggering reading plan sections");
assert.ok(!builtPromptById.discharge_checklist.includes("PROBLEM LIST FOR PRESENTATION"), "discharge readiness should not duplicate rounds report sections");
assert.ok(!builtPromptById.what_am_i_missing.includes("DISPOSITION READINESS VERDICT"), "blind-spot review should not duplicate discharge readiness output");
assert.ok(!builtPromptById.initial_rounds_report.includes("QUESTIONS FOR TEAM"), "initial rounds should not invite generic team questions");
assert.ok(!builtPromptById.initial_rounds_report.includes("PRE-ROUNDS SELF-CHECKS"), "initial rounds should not restore the old rounds report sections");
assert.ok(!builtPromptById.final_rounds_update.includes("PLAN OR TASK CHANGES TO VERIFY"), "final update should avoid vague task-change sections");
assert.ok(!builtPromptById.medication_safety.includes("MEDICATION QUESTIONS FOR TEAM OR NURSING"), "medication prompt should avoid generic team/nursing questions");
[
  "initial_rounds_report",
  "full_rounds_report",
  "final_rounds_update",
  "checklist_improvement_review",
  "attending_plan",
  "teaching_explanation",
  "discharge_checklist",
  "what_am_i_missing"
].forEach((taskId) => {
  assert.ok(builtPromptById[taskId].includes("Do not include citations or a reference list"), `${taskId} should suppress citation/reference tails`);
});
["teaching_explanation", "discharge_checklist"].forEach((taskId) => {
  assert.ok(builtPromptById[taskId].includes("source names, journal names, society names"), `${taskId} should explicitly suppress evidence-source clutter`);
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
assert.ok(promptWithoutGuidelineDump.length < 4000, `verbose guideline/evidence context should not bloat OpenEvidence prompts; saw ${promptWithoutGuidelineDump.length} chars`);
assert.ok(!promptWithoutGuidelineDump.includes("Measure vital sign 1"), "OpenEvidence prompt should not include local guideline rows");
assert.ok(!promptWithoutGuidelineDump.includes("Retrieved evidence detail"), "OpenEvidence prompt should not include retrieved evidence summaries");
assert.ok(!promptWithoutGuidelineDump.includes("trace fever_infection_sepsis_v1"), "OpenEvidence prompt should not include local trace/debug metadata");
assert.ok(!promptWithoutGuidelineDump.includes("omitted from prompt"), "OpenEvidence prompt should not include guideline dump omission notices");

const missingItemsPrompt = buildOpenEvidencePrompt("what_am_i_missing", baseContext);
assert.ok(missingItemsPrompt.prompt.includes("UNVALIDATED GAP"), "blind-spot prompt should keep a local-review gap prefix");
assert.ok(
  missingItemsPrompt.prompt.indexOf("UNVALIDATED GAP SUGGESTION") < missingItemsPrompt.prompt.indexOf("Prefix every bullet with MISS, VERIFY, ESCALATE, ASK, or UNVALIDATED GAP."),
  "blind-spot checklist gaps should be governed by the unvalidated-gap instruction before the output format"
);

const checklistImprovementPrompt = buildOpenEvidencePrompt("checklist_improvement_review", {
  ...baseContext,
  sourceContext: "Raw HPI from John Smith with room 123 should never be included in this prompt."
});
assert.equal(checklistImprovementPrompt.requiredContext, "checklist_refinement", "checklist improvement should require the local checklist plus compact context");
assert.equal(checklistImprovementPrompt.outputKind, "checklist_improvement_review", "checklist improvement should not parse as a replacement checklist");
assert.ok(checklistImprovementPrompt.prompt.includes("<current_checklist>"), "checklist improvement prompt should include the current checklist");
assert.ok(checklistImprovementPrompt.prompt.includes("<deidentified_patient_context>"), "checklist improvement prompt should include compact de-identified context");
assert.ok(!checklistImprovementPrompt.prompt.includes("<source_context>"), "checklist improvement prompt must not include the full source context");
assert.ok(!checklistImprovementPrompt.prompt.includes("<local_guideline_pathway>"), "checklist improvement prompt must not include local guideline dumps");
assert.ok(!checklistImprovementPrompt.prompt.includes("<evidence_retrieval_summary>"), "checklist improvement prompt must not include evidence retrieval summaries");
assert.ok(!checklistImprovementPrompt.prompt.includes("John Smith"), "checklist improvement prompt must not leak raw source text");
assert.ok(checklistImprovementPrompt.prompt.includes("full HPI are intentionally excluded"), "checklist improvement prompt should state the HPI boundary");
assert.ok(checklistImprovementPrompt.prompt.includes("UNVALIDATED LOCAL REVIEW"), "checklist improvement prompt should label local-review suggestions");
assert.ok(checklistImprovementPrompt.prompt.includes("Do not output a replacement final checklist"), "checklist improvement prompt should not create a replacement checklist");
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

const guidelineResult = parseOpenEvidenceResult({
  taskId: "confirm_guideline",
  outputKind: "guideline_confirmation",
  text: "CHANGE\n- Use a lower treatment threshold supported by Diabetes Care 2024. doi:10.2337/dci24-0032"
});
assert.ok(guidelineResult.sections.some((section) => /CHANGE/.test(section.title)), "guideline parser should retain section headings");
assert.ok(extractCitations(guidelineResult.sections.map((section) => section.body).join("\n")).length >= 1, "citation extractor should find guideline citations");

assert.equal(getOpenEvidenceTask("not_a_task"), null, "unknown task lookup should return null");

const appHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(appHtml.includes('"Task boundary:"'), "OpenEvidence review-tab preview should expose each prompt's task boundary");
assert.ok(appHtml.includes('"Output contract:"'), "OpenEvidence review-tab preview should expose each prompt's output contract");
assert.ok(appHtml.includes('"Context preview:"'), "OpenEvidence review-tab preview should separate context from instructions");
assert.ok(!appHtml.includes("Answer in concise bullet points. Do not include patient identifiers."), "review-tab preview should not collapse every task into a generic bullet-answer prompt");
assert.ok(!appHtml.includes("1) List current medications and doses when provided."), "medication safety preview should use the registry output contract, not legacy generic preview instructions");

console.log("OpenEvidence workflow tests passed.");
