import assert from "node:assert/strict";
import {
  buildOpenEvidencePrompt,
  getOpenEvidenceTask,
  openEvidenceTasks
} from "../open-evidence-workflows.js";
import {
  extractCitations,
  parseOpenEvidenceResult
} from "../open-evidence-results.js";

assert.equal(openEvidenceTasks.length, 10, "OpenEvidence tasks should include higher-reasoning tasks plus optional checklist improvement review");
const ids = new Set(openEvidenceTasks.map((task) => task.id));
[
  "initial_rounds_report",
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

openEvidenceTasks.forEach((task) => {
  assert.equal(typeof task.promptBuilder, "function", `${task.id} should have a prompt builder`);
  assert.equal(typeof task.pasteBackParser, "function", `${task.id} should have a paste-back parser`);
  assert.ok(task.requiredContext, `${task.id} should declare required context`);
  assert.ok(task.outputKind, `${task.id} should declare output kind`);
  const built = buildOpenEvidencePrompt(task.id, baseContext);
  assert.ok(built.prompt.includes("<clinical_safety_rules>"), `${task.id} prompt should include safety rules`);
  assert.ok(
    built.prompt.includes("validated clinical intents, and reviewed evidence catalog remain the source of truth for bedside questions and physical exam maneuvers"),
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
  assert.ok(built.copySuccessMessage, `${task.id} should include copy success message`);
});

const missingItemsPrompt = buildOpenEvidencePrompt("what_am_i_missing", baseContext);
assert.ok(missingItemsPrompt.prompt.includes("CHECKLIST GAPS"), "blind-spot prompt should keep a checklist-gap section");
assert.ok(
  missingItemsPrompt.prompt.indexOf("UNVALIDATED GAP SUGGESTION") < missingItemsPrompt.prompt.indexOf("CHECKLIST GAPS"),
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
assert.ok(!checklistImprovementPrompt.prompt.includes("John Smith"), "checklist improvement prompt must not leak raw source text");
assert.ok(checklistImprovementPrompt.prompt.includes("full HPI are intentionally excluded"), "checklist improvement prompt should state the HPI boundary");
assert.ok(checklistImprovementPrompt.prompt.includes("UNVALIDATED CHECKLIST IMPROVEMENT SUGGESTIONS"), "checklist improvement prompt should ask for review suggestions");
assert.ok(checklistImprovementPrompt.prompt.includes("Do not output a replacement final checklist"), "checklist improvement prompt should not create a replacement checklist");
assert.ok(checklistImprovementPrompt.reviewText.includes("Selected local workup"), "PHI review text should include the compact patient summary");
assert.ok(checklistImprovementPrompt.reviewText.includes("How is your nausea today?"), "PHI review text should include the current checklist");
assert.ok(!checklistImprovementPrompt.reviewText.includes("John Smith"), "PHI review text should not scan or expose withheld raw source text for checklist improvement");

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

const medicationResult = medicationFallback.pasteBackParser(`HIGH PRIORITY VERIFY BEFORE ROUNDS
- Insulin glargine: verify basal insulin was not held because omission matters in type 1 diabetes.

POSSIBLE DOSE OR SAFETY CONCERNS
None found from the provided context.

CITATIONS
Diabetes Care 2024. https://doi.org/10.2337/dci24-0032`);
assert.equal(medicationResult.outputKind, "medication_safety");
assert.equal(medicationResult.concerns.length, 1, "medication parser should retain actionable concern bullets");
assert.ok(medicationResult.citations.length >= 1, "medication parser should extract citations");

const guidelineResult = parseOpenEvidenceResult({
  taskId: "confirm_guideline",
  outputKind: "guideline_confirmation",
  text: "GUIDELINE MATCH\nThe local pathway matches Diabetes Care 2024 consensus recommendations.\nCITATIONS\nDiabetes Care 2024. doi:10.2337/dci24-0032"
});
assert.ok(guidelineResult.sections.some((section) => /GUIDELINE MATCH/.test(section.title)), "guideline parser should retain section headings");
assert.ok(extractCitations(guidelineResult.sections.map((section) => section.body).join("\n")).length >= 1, "citation extractor should find guideline citations");

assert.equal(getOpenEvidenceTask("not_a_task"), null, "unknown task lookup should return null");

console.log("OpenEvidence workflow tests passed.");
