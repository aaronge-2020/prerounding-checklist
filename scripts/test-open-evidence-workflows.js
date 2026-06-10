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

const purposeSnippets = {
  initial_rounds_report: [
    "presentation-ready orientation",
    "PRE-ROUNDS SELF-CHECKS",
    "TEAM DECISION QUESTIONS",
    "Do not write a full problem-based plan"
  ],
  final_rounds_update: [
    "using only new bedside findings",
    "REMAINING SELF-CHECKS BEFORE ROUNDS",
    "TEAM DECISION QUESTIONS",
    "UNCHANGED ITEMS NOT WORTH REPEATING"
  ],
  checklist_improvement_review: [
    "Critique the locally generated bedside checklist",
    "creating a replacement checklist"
  ],
  medication_safety: [
    "medication, dosing, administration, monitoring, interaction, and supply issues",
    "MEDICATION TEAM OR NURSING QUESTIONS",
    "Do not include non-medication problems"
  ],
  confirm_guideline: [
    "Audit whether the local guideline pathway",
    "GUIDELINE ALIGNMENT VERDICT"
  ],
  find_exception: [
    "patient-specific reasons a normally appropriate guideline",
    "SELF-CHECKS AND TEAM QUESTIONS",
    "Do not restate standard guideline recommendations"
  ],
  attending_plan: [
    "problem-based diagnostic and treatment reasoning plan",
    "DIAGNOSTIC REASONING AND SELF-CHECKS",
    "TREATMENT REASONING AND TEAM DECISIONS",
    "Do not repeat a full rounds report"
  ],
  teaching_explanation: [
    "so a junior student can understand and present intelligently",
    "HIGH-YIELD LEARNING QUESTIONS",
    "ROUNDING TAKEAWAYS",
    "Do not output a management plan as instructions"
  ],
  discharge_checklist: [
    "safe transition out of the hospital",
    "Do not rewrite the inpatient plan"
  ],
  what_am_i_missing: [
    "second-look safety and reasoning audit",
    "If there are no high-yield blind spots"
  ]
};

openEvidenceTasks.forEach((task) => {
  assert.equal(typeof task.promptBuilder, "function", `${task.id} should have a prompt builder`);
  assert.equal(typeof task.pasteBackParser, "function", `${task.id} should have a paste-back parser`);
  assert.ok(task.requiredContext, `${task.id} should declare required context`);
  assert.ok(task.outputKind, `${task.id} should declare output kind`);
  const built = buildOpenEvidencePrompt(task.id, baseContext);
  assert.ok(built.prompt.length < 4600, `${task.id} base prompt should stay concise; saw ${built.prompt.length} chars`);
  assert.ok(built.prompt.includes("<task_boundary>"), `${task.id} prompt should define a unique task boundary`);
  assert.ok(built.prompt.includes("Primary purpose:"), `${task.id} prompt should define a primary purpose`);
  assert.ok(built.prompt.includes("Do not use this task for:"), `${task.id} prompt should name exclusions to prevent redundant task use`);
  (purposeSnippets[task.id] || []).forEach((snippet) => {
    assert.ok(built.prompt.includes(snippet), `${task.id} should preserve distinct-purpose prompt text: ${snippet}`);
  });
  assert.ok(built.prompt.includes("<clinical_safety_rules>"), `${task.id} prompt should include safety rules`);
  assert.ok(built.prompt.includes("<usefulness_rules>"), `${task.id} prompt should include usefulness rules`);
  assert.ok(
    built.prompt.includes("Do not ask the team about facts the student can usually verify directly"),
    `${task.id} prompt should prevent self-checkable facts from becoming team questions`
  );
  assert.ok(
    built.prompt.includes("Do not include conversational follow-up offers"),
    `${task.id} prompt should suppress low-value conversational closing offers`
  );
  assert.ok(
    built.prompt.includes("Use exactly the requested section headings"),
    `${task.id} prompt should require exact requested headings`
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
  assert.ok(built.copySuccessMessage, `${task.id} should include copy success message`);
});

const builtPromptById = Object.fromEntries(openEvidenceTasks.map((task) => [task.id, buildOpenEvidencePrompt(task.id, baseContext).prompt]));
assert.ok(!builtPromptById.confirm_guideline.includes("CONTRAINDICATIONS COMPETING RISKS OR SPECIAL POPULATIONS"), "guideline confirmation should not duplicate the exception-hunting output");
assert.ok(!builtPromptById.find_exception.includes("GUIDELINE ALIGNMENT VERDICT"), "exception finding should not duplicate guideline confirmation");
assert.ok(!builtPromptById.attending_plan.includes("READING PLAN"), "attending plan should not duplicate teaching output");
assert.ok(!builtPromptById.teaching_explanation.includes("DIAGNOSTIC PLAN TO VERIFY"), "teaching output should not duplicate attending-plan sections");
assert.ok(!builtPromptById.teaching_explanation.includes("READING PLAN"), "teaching output should avoid reference-triggering reading plan sections");
assert.ok(!builtPromptById.discharge_checklist.includes("PROBLEM LIST FOR PRESENTATION"), "discharge readiness should not duplicate rounds report sections");
assert.ok(!builtPromptById.what_am_i_missing.includes("DISPOSITION READINESS VERDICT"), "blind-spot review should not duplicate discharge readiness output");
assert.ok(!builtPromptById.initial_rounds_report.includes("QUESTIONS FOR TEAM"), "initial rounds should not invite generic team questions");
assert.ok(!builtPromptById.initial_rounds_report.includes("PRE-ROUNDS VERIFICATION CHECKS"), "initial rounds should separate self-checks from generic verification");
assert.ok(builtPromptById.initial_rounds_report.includes("Put labs, vitals, medication administration record checks"), "initial rounds should direct chart-verifiable facts to self-checks");
assert.ok(!builtPromptById.final_rounds_update.includes("PLAN OR TASK CHANGES TO VERIFY"), "final update should avoid vague task-change sections");
assert.ok(!builtPromptById.medication_safety.includes("MEDICATION QUESTIONS FOR TEAM OR NURSING"), "medication prompt should avoid generic team/nursing questions");
assert.ok(builtPromptById.what_am_i_missing.includes("LOW-YIELD DISTRACTIONS TO IGNORE"), "blind-spot review should explicitly suppress low-yield padding");
assert.ok(builtPromptById.medication_safety.includes("Do not rename or combine headings"), "medication prompt should force exact heading compliance");
assert.ok(builtPromptById.confirm_guideline.includes("Start with GUIDELINE ALIGNMENT VERDICT"), "guideline prompt should prevent default evidence-review opening");
assert.ok(builtPromptById.confirm_guideline.includes("Put citations only under CITATIONS"), "guideline prompt should control citation placement");
assert.ok(builtPromptById.find_exception.includes("Start with CASE FEATURES THAT COULD CHANGE THE DEFAULT PATHWAY"), "exception prompt should prevent default evidence-review opening");
assert.ok(builtPromptById.what_am_i_missing.includes("Do not perform a guideline review or literature search"), "blind-spot review should not duplicate guideline tasks");
[
  "initial_rounds_report",
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
assert.ok(
  builtPromptById.discharge_checklist.includes("provided case facts and local pathway only"),
  "discharge prompt should avoid external guideline/source drift"
);

const verboseGuidelineReport = [
  "Guideline Complaint CDS",
  "Input: Fever, infection, or sepsis Fever, infection, or sepsis Vomiting Poor intake",
  "Module: Fever, infection, or sepsis (fever_infection_sepsis_v1, v1.0.0)",
  "Triggered red flags: 0",
  "",
  "Basic bedside data / safety checks",
  ...Array.from({ length: 10 }, (_, index) => [
    `- Measure vital sign ${index + 1} [SSC_SEPSIS_2026; intent fever_sepsis_v1; trace fever_infection_sepsis_v1.safety.${index}; auth validated_complaint_module]`,
    "  Use when: When this validated workup is selected and the bedside assessment is clinically safe to perform.",
    "  Action: Document the value and compare with baseline.",
    "  Rationale: Repeated rationale text that should not bloat copied prompts.",
    "  Likelihood ratios: LR+ n/a; LR- n/a. Note: not applicable to routine bedside safety data.",
    "  Feasibility: difficulty easy; 1 min; equipment bedside monitor; cooperation low",
    "  Evidence: guideline/consensus; section early recognition; version 2026; reviewed 2026-06-07"
  ].join("\n")),
  "",
  "Focused history questions",
  ...Array.from({ length: 14 }, (_, index) => [
    `- Fever source question ${index + 1}? [MERCK_FEVER_ADULTS; intent fever_sepsis_v1; trace fever_infection_sepsis_v1.requiredQuestions.${index}; auth validated_complaint_module]`,
    "  Detail prompts: Ask every possible subquestion and repeated detail.",
    "  Options: No / Yes / Other ___",
    "  Ask when: Ask for every selected fever workup.",
    "  Diagnostic purpose: Screens for a source.",
    "  Management implication: Changes testing, imaging, antimicrobials, and escalation.",
    "  Evidence: clinical_reference; section source-localizing fever history"
  ].join("\n")),
  "",
  "Suppressed/not-recommended items",
  "- PMI [SSC_SEPSIS_2026; trace suppressed] ",
  "  Why not recommended: Should not enter compact prompt details.",
  "",
  "Differential buckets",
  ...Array.from({ length: 8 }, (_, index) => [
    `- Differential bucket ${index + 1} [SOURCE_${index}; trace noisy.trace.${index}; auth validated_complaint_module]`,
    "  Action: More detail that should be compacted.",
    "  Rationale: More repeated rationale."
  ].join("\n"))
].join("\n");

const compactedGuidelinePrompt = buildOpenEvidencePrompt("initial_rounds_report", {
  ...baseContext,
  complaintCdsReport: verboseGuidelineReport,
  evidenceSummary: `${"- Retrieved evidence detail that should be capped.\n".repeat(120)}`
}).prompt;
assert.ok(compactedGuidelinePrompt.length < 9000, `verbose guideline prompt should stay bounded; saw ${compactedGuidelinePrompt.length} chars`);
assert.ok(compactedGuidelinePrompt.includes("Measure vital sign 1 [SSC_SEPSIS_2026]"), "compact prompt should keep high-signal guideline rows");
assert.ok(!compactedGuidelinePrompt.includes("trace fever_infection_sepsis_v1"), "compact prompt should remove trace/debug metadata");
assert.ok(!compactedGuidelinePrompt.includes("Likelihood ratios:"), "compact prompt should omit LR boilerplate");
assert.ok(!compactedGuidelinePrompt.includes("Feasibility:"), "compact prompt should omit feasibility boilerplate");
assert.ok(compactedGuidelinePrompt.includes("omitted from prompt"), "compact prompt should disclose omitted guideline detail");

const missingItemsPrompt = buildOpenEvidencePrompt("what_am_i_missing", baseContext);
assert.ok(missingItemsPrompt.prompt.includes("UNVALIDATED GAP SUGGESTIONS FOR LOCAL REVIEW"), "blind-spot prompt should keep a local-review gap section");
assert.ok(
  missingItemsPrompt.prompt.indexOf("UNVALIDATED GAP SUGGESTION") < missingItemsPrompt.prompt.indexOf("UNVALIDATED GAP SUGGESTIONS FOR LOCAL REVIEW"),
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

const appHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(appHtml.includes('"Task boundary:"'), "OpenEvidence review-tab preview should expose each prompt's task boundary");
assert.ok(appHtml.includes('"Output contract:"'), "OpenEvidence review-tab preview should expose each prompt's output contract");
assert.ok(appHtml.includes('"Context preview:"'), "OpenEvidence review-tab preview should separate context from instructions");
assert.ok(!appHtml.includes("Answer in concise bullet points. Do not include patient identifiers."), "review-tab preview should not collapse every task into a generic bullet-answer prompt");
assert.ok(!appHtml.includes("1) List current medications and doses when provided."), "medication safety preview should use the registry output contract, not legacy generic preview instructions");

console.log("OpenEvidence workflow tests passed.");
