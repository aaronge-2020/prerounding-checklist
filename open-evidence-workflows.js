import { parseOpenEvidenceResult } from "./open-evidence-results.js";

const commonClinicalRules = `<clinical_safety_rules>
Use only the de-identified context provided here or earlier in this same OpenEvidence conversation.
Do not invent diagnoses, medications, lab values, imaging, exam findings, treatment responses, plans, or consultant recommendations.
Separate objective facts from interpretation, preserve uncertainty, and use cautious verification language for possible safety issues.
Do not provide patient-specific orders as if you are the treating clinician; frame recommendations as items to consider or verify with the treating team.
Do not include names, exact dates, medical record numbers, locations, room numbers, phone numbers, or other identifiers.
</clinical_safety_rules>`;

const abbreviationRules = `<abbreviation_rules>
Avoid unexplained abbreviations. Spell out clinical terms on first use, including medication administration record, electrocardiogram, complete blood count, basic metabolic panel, and venous thromboembolism.
Medication dose units may stay abbreviated when attached to exact doses.
</abbreviation_rules>`;

function clean(value) {
  return String(value || "").trim();
}

function block(title, value) {
  const text = clean(value);
  return text ? `<${title}>\n${text}\n</${title}>` : "";
}

function sourceContextBlock(context) {
  return [
    block("context_type", context.contextType || "De-identified patient context for rounds preparation."),
    context.labChronologyBlock ? block("lab_chronology", context.labChronologyBlock) : "",
    block("source_context", context.sourceContext)
  ].filter(Boolean).join("\n\n");
}

function guidelineContextBlock(context) {
  return [
    block("local_guideline_pathway", context.complaintCdsReport),
    block("evidence_retrieval_summary", context.evidenceSummary)
  ].filter(Boolean).join("\n\n");
}

function checklistContextBlock(context) {
  return [
    block("current_checklist", context.currentChecklist),
    block("checklist_audit_issues", context.checklistAuditSummary),
    block("checklist_refinement_goals", context.refinementNotes),
    block("retrieved_evidence_candidates", context.evidenceSummary),
    block("local_guideline_pathway", context.complaintCdsReport)
  ].filter(Boolean).join("\n\n");
}

function findingsContextBlock(context) {
  return [
    context.sameConversationReady ? block("same_conversation_context", "Use the initial rounds report and patient context already provided earlier in this same OpenEvidence conversation.") : "",
    block("new_bedside_findings", context.compiledFindings),
    context.sourceContext && !context.sameConversationReady ? sourceContextBlock(context) : ""
  ].filter(Boolean).join("\n\n");
}

function buildPatientPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    commonClinicalRules,
    abbreviationRules,
    context.userContext || "",
    sourceContextBlock(context),
    guidelineContextBlock(context),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}

function buildSameConversationPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    commonClinicalRules,
    abbreviationRules,
    context.userContext || "",
    block("same_conversation_context", "Use the de-identified patient context already provided earlier in this same OpenEvidence conversation. Do not ask for the full source context again unless it is truly missing."),
    guidelineContextBlock(context),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}

function outputFormatForChecklist() {
  return `<output_format>
Return plain text only.
Return exactly two parent checklists in this order:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST

Parent checklist titles must be all caps with no colon.
Every item must be one line in the exact format: Label: Option A / Option B / Option C
Bedside labels must be patient questions ending in a question mark before the colon.
Exam labels must be concise clinician-observed findings.
Do not include explanations, citations, markdown bullets, or text outside the two checklists.
</output_format>`;
}

function parseTaskResult(task, text, context = {}) {
  return parseOpenEvidenceResult({
    taskId: task.id,
    outputKind: task.outputKind,
    sourceMode: context.sourceMode,
    text
  });
}

function initialRoundsPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician and clerkship coach helping a medical student prepare concise rounds.
</role>

<task>
Create a concise patient-specific rounds preparation report from the de-identified source context.
</task>`,
    `<output_format>
Use plain text with these sections:
SNAPSHOT
TODAY'S CLINICAL TRAJECTORY
ACTIVE PROBLEMS
MEDICATIONS AND SAFETY ITEMS TO VERIFY
WHAT TO CHECK BEFORE ROUNDS
QUESTIONS FOR TEAM
Do not include citations unless they directly support a guideline or medication safety point.
</output_format>`
  );
}

function finalRoundsPrompt(context) {
  return [
    `<role>
You are an attending physician and clerkship coach helping update a rounds presentation after bedside pre-rounding.
</role>`,
    commonClinicalRules,
    abbreviationRules,
    context.userContext || "",
    findingsContextBlock(context),
    `<output_format>
Return a concise final rounds update with:
TWO MINUTE ROUNDS UPDATE
ASSESSMENT AND PLAN CHANGES
SAFETY OR ESCALATION ITEMS
TASKS BEFORE ROUNDS
Use only prior conversation context and the new bedside findings.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

function checklistPrompt(context) {
  return [
    `<role>
You are an attending physician and clerkship coach creating a focused pre-rounding bedside checklist.
</role>`,
    commonClinicalRules,
    context.sameConversationReady && !context.sourceContext
      ? block("same_conversation_context", "Use the patient context already provided earlier in this same OpenEvidence conversation.")
      : sourceContextBlock(context),
    guidelineContextBlock(context),
    outputFormatForChecklist(),
    "Now create the final concise bedside checklist only."
  ].filter(Boolean).join("\n\n");
}

function refineChecklistPrompt(context) {
  return [
    `<role>
You are an attending physician and checklist editor improving a bedside pre-rounding checklist.
</role>`,
    commonClinicalRules,
    abbreviationRules,
    sourceContextBlock(context),
    checklistContextBlock(context),
    outputFormatForChecklist(),
    "Rewrite the checklist to address the refinement goals and audit issues while keeping it concise, patient-specific, and parseable."
  ].filter(Boolean).join("\n\n");
}

function medicationSafetyPrompt(context) {
  const task = `<role>
You are an attending physician and medication safety reviewer helping a medical student prepare for rounds.
</role>

<task>
Identify medication-related issues that should be verified before rounds. Use cautious language and do not call something an error unless directly supported.
</task>

<safety_focus>
Look for unusual doses or frequencies, renal/hepatic/weight/age dose concerns, duplicate therapy, medication-disease conflicts, medication-lab mismatches, missed/held/refused/delayed administrations, active orders without administration, administrations without clear active order, high-risk interactions, peri-procedural timing, missing prophylaxis, and critical home medications that may need restart or hold clarification.
</safety_focus>`;

  const output = `<output_format>
Use exactly these sections:
HIGH PRIORITY VERIFY BEFORE ROUNDS
POSSIBLE DOSE OR SAFETY CONCERNS
POSSIBLE MISSED HELD OR UNEXPECTED ADMINISTRATIONS
QUESTIONS TO ASK TEAM OR NURSING
LIKELY OKAY OR NO ACTION NEEDED
For each concern, include the medication/class, what seems off, why it matters, and exactly what to verify.
</output_format>`;

  if (context.sameConversationReady && !context.forceIncludeSourceForMedicationSafety) {
    return buildSameConversationPrompt(context, task, output);
  }
  return buildPatientPrompt(context, task, output);
}

function guidelinePrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending-level clinical evidence reviewer.
</role>

<task>
Confirm whether the local guideline pathway is current and appropriate for this de-identified case. Cite current guidelines or consensus statements when relevant.
</task>`,
    `<output_format>
Use sections:
GUIDELINE MATCH
ANY OUTDATED OR MISSING POINTS
CASE-SPECIFIC APPLICATION
CITATIONS
Be concise and identify conflicts between the local pathway and current evidence.
</output_format>`
  );
}

function exceptionPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician looking for guideline exceptions, contraindications, and special-population caveats.
</role>

<task>
Find case-specific exceptions, edge cases, or reasons routine guideline advice may need modification.
</task>`,
    `<output_format>
Use sections:
HIGH-YIELD EXCEPTIONS
CONTRAINDICATIONS OR MODIFICATIONS
WHAT TO VERIFY
CITATIONS WHEN RELEVANT
</output_format>`
  );
}

function attendingPlanPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician giving a concise assessment and plan to help a learner understand the safest next steps.
</role>

<task>
Create an attending-level assessment and plan using only supported context.
</task>`,
    `<output_format>
Use sections:
ONE-LINER
PROBLEM-BASED ASSESSMENT AND PLAN
CONTINGENCIES
WHAT THE STUDENT SHOULD VERIFY
Keep it concise and do not invent orders.
</output_format>`
  );
}

function teachingPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician teaching an early third-year medical student.
</role>

<task>
Explain this patient and the clinical reasoning in practical language for prerounding and presenting.
</task>`,
    `<output_format>
Use sections:
PATIENT SNAPSHOT
ILLNESS SCRIPTS
DATA INTERPRETATION
MEDICATIONS AND TREATMENTS
HOW TO PRESENT
QUESTIONS TO ASK
READING PLAN
</output_format>`
  );
}

function dischargePrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician checking discharge readiness and transition safety.
</role>

<task>
Create a case-specific discharge readiness checklist and identify barriers.
</task>`,
    `<output_format>
Use sections:
DISCHARGE READINESS
MEDICATIONS AND SUPPLIES
FOLLOW-UP
PATIENT COUNSELING
SAFETY-NET AND RETURN PRECAUTIONS
UNRESOLVED BARRIERS
</output_format>`
  );
}

function missingPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
You are an attending physician pressure-testing a medical student's prerounding plan.
</role>

<task>
Identify high-yield blind spots: diagnostic misses, monitoring gaps, medication safety issues, discharge barriers, escalation triggers, and checklist gaps.
</task>`,
    `<output_format>
Use sections:
WHAT I MIGHT BE MISSING
SAFETY ITEMS TO VERIFY NOW
CHECKLIST GAPS
TEAM QUESTIONS
LOW-YIELD DISTRACTIONS TO IGNORE
</output_format>`
  );
}

export const openEvidenceTasks = [
  { id: "initial_rounds_report", label: "Concise rounds report", category: "Rounds", requiredContext: "source", outputKind: "rounds_report", promptBuilder: initialRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Initial rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "final_rounds_update", label: "Final rounds update", category: "Rounds", requiredContext: "findings", outputKind: "rounds_update", promptBuilder: finalRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Final rounds update prompt copied. Paste it into OpenEvidence.", requiresSameConversation: true },
  { id: "generate_checklist", label: "Generate checklist", category: "Checklist", requiredContext: "source", outputKind: "checklist", promptBuilder: checklistPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Checklist prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "refine_checklist", label: "Refine checklist", category: "Checklist", requiredContext: "current_checklist", outputKind: "checklist", promptBuilder: refineChecklistPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Checklist refinement prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "medication_safety", label: "Medication safety", category: "Safety", requiredContext: "medication_context", outputKind: "medication_safety", promptBuilder: medicationSafetyPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Medication safety prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "confirm_guideline", label: "Confirm guideline", category: "Guidelines", requiredContext: "guideline_or_source", outputKind: "guideline_confirmation", promptBuilder: guidelinePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Guideline confirmation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "find_exception", label: "Find exception", category: "Guidelines", requiredContext: "source", outputKind: "guideline_exceptions", promptBuilder: exceptionPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Exception-finding prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "attending_plan", label: "Attending-level plan", category: "Reasoning", requiredContext: "source", outputKind: "attending_plan", promptBuilder: attendingPlanPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Attending-level plan prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "teaching_explanation", label: "Teaching explanation", category: "Teaching", requiredContext: "source", outputKind: "teaching", promptBuilder: teachingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Teaching explanation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "discharge_checklist", label: "Discharge checklist", category: "Discharge", requiredContext: "source", outputKind: "discharge_checklist", promptBuilder: dischargePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Discharge checklist prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "what_am_i_missing", label: "What am I missing?", category: "Safety", requiredContext: "source", outputKind: "missing_items", promptBuilder: missingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Blind-spot prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false }
];

export function getOpenEvidenceTask(taskId) {
  return openEvidenceTasks.find((task) => task.id === taskId) || null;
}

export function buildOpenEvidencePrompt(taskId, context = {}) {
  const task = getOpenEvidenceTask(taskId);
  if (!task) {
    throw new Error(`Unknown OpenEvidence task: ${taskId}`);
  }
  const prompt = task.promptBuilder(context);
  const sourceIncluded = /<source_context>|<current_checklist>|<new_bedside_findings>/.test(prompt);
  const reviewText = [
    context.sourceContext,
    context.currentChecklist,
    context.compiledFindings,
    context.complaintCdsReport
  ].filter((value) => clean(value)).join("\n\n");
  return {
    taskId: task.id,
    label: task.label,
    category: task.category,
    requiredContext: task.requiredContext,
    outputKind: task.outputKind,
    prompt,
    contextText: context.sourceContext || context.currentChecklist || context.compiledFindings || "",
    reviewScope: sourceIncluded ? "custom" : "source-free",
    reviewText: sourceIncluded ? reviewText : "",
    copySuccessMessage: task.copySuccessMessage,
    requiresSameConversation: task.requiresSameConversation,
    sameConversationReady: Boolean(context.sameConversationReady),
    pasteBackParser: (text) => task.pasteBackParser(task, text, context)
  };
}
