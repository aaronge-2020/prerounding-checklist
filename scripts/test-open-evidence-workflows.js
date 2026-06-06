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

assert.equal(openEvidenceTasks.length, 11, "all planned OpenEvidence tasks should be registered");
const ids = new Set(openEvidenceTasks.map((task) => task.id));
[
  "initial_rounds_report",
  "final_rounds_update",
  "generate_checklist",
  "refine_checklist",
  "medication_safety",
  "confirm_guideline",
  "find_exception",
  "attending_plan",
  "teaching_explanation",
  "discharge_checklist",
  "what_am_i_missing"
].forEach((id) => assert.ok(ids.has(id), `missing OpenEvidence task ${id}`));

const baseContext = {
  sourceMode: "prior",
  contextType: "De-identified prior source note.",
  sourceContext: "Adult with diabetic ketoacidosis, potassium 3.4, insulin infusion, and discharge supply barrier.",
  labChronologyBlock: "Most recent potassium 3.4.",
  userContext: "<user_context>\nService: Endocrinology consult\n</user_context>",
  complaintCdsReport: "Hyperglycemia / possible DKA or HHS v1.1.0\nPotassium rule present.",
  evidenceSummary: "- Respiratory pattern: Kussmaul / normal / distressed",
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
  assert.ok(built.copySuccessMessage, `${task.id} should include copy success message`);
});

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

const checklistResult = parseOpenEvidenceResult({
  taskId: "generate_checklist",
  outputKind: "checklist",
  text: `BEDSIDE QUESTION CHECKLIST
SYMPTOMS
How is your breathing today?: Better / Same / Worse

TARGETED PHYSICAL EXAM CHECKLIST
VITALS
Respiratory rate: ___`
});
assert.ok(checklistResult.checklistText.includes("TARGETED PHYSICAL EXAM CHECKLIST"), "checklist paste-back should extract checklist text");

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
