import { parseOpenEvidenceResult } from "./open-evidence-results.js";

const commonClinicalRules = `<clinical_safety_rules>
Use only de-identified context in this prompt or earlier in this OpenEvidence conversation.
Do not invent facts, identifiers, orders, diagnoses, results, responses, or consultant recommendations.
Separate facts from interpretation, preserve uncertainty, and frame possible actions as items to verify or consider with the treating team.
Local validated clinical intents and reviewed evidence remain authoritative for bedside questions/exams. Do not write, rewrite, or silently expand the final bedside checklist; label any bedside addition idea as an UNVALIDATED GAP SUGGESTION.
</clinical_safety_rules>`;

const abbreviationRules = `<abbreviation_rules>
Spell out non-obvious abbreviations on first use. Medication dose units may stay abbreviated with exact doses.
</abbreviation_rules>`;

const usefulnessRules = `<usefulness_rules>
Output only management-changing items: items that could change diagnosis, treatment, monitoring, escalation/disposition, medication safety, discharge, or what the student says or asks on rounds.
Omit no-action, likely-okay, unchanged, low-yield, background, broad review, citation padding, and filler.
If nothing changes management, output exactly: NO MANAGEMENT-CHANGING ITEMS FOUND.
Use concise bullets or short lines only. Respect each task's cap. Each item must state the action or decision and why it matters.
Do not include conversational follow-up offers, closing questions, disclaimers, filler, or background reviews.
Do not ask the team about facts the student can usually verify directly in the chart, medication administration record, bedside assessment, local checklist, labs, vitals, imaging, intake/output, orders, or notes.
Use only the prefixes or headings requested by the task; do not add empty headings or sections.
</usefulness_rules>`;

function clean(value) {
  return String(value || "").trim();
}

function block(title, value) {
  const text = clean(value);
  return text ? `<${title}>\n${text}\n</${title}>` : "";
}

function taskBoundary({ primary, notFor = [] } = {}) {
  const exclusions = notFor
    .map((item) => `- ${clean(item)}`)
    .filter(Boolean)
    .join("\n");
  return [
    "<task_boundary>",
    primary ? `Primary purpose: ${clean(primary)}` : "",
    exclusions ? `Do not use this task for:\n${exclusions}` : "",
    "</task_boundary>"
  ].filter(Boolean).join("\n");
}

function sourceContextBlock(context) {
  return [
    block("context_type", context.contextType || "De-identified patient context for rounds preparation."),
    context.labChronologyBlock ? block("lab_chronology", context.labChronologyBlock) : "",
    block("source_context", context.sourceContext)
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
    usefulnessRules,
    context.userContext || "",
    sourceContextBlock(context),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}

function buildSameConversationPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    commonClinicalRules,
    abbreviationRules,
    usefulnessRules,
    context.userContext || "",
    block("same_conversation_context", "Use the de-identified patient context already provided earlier in this same OpenEvidence conversation. Do not ask for the full source context again unless it is truly missing."),
    finalInstruction
  ].filter(Boolean).join("\n\n");
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
Attending physician and clerkship coach helping a medical student prepare concise rounds.
</role>

${taskBoundary({
  primary: "Turn de-identified chart context into a compact, presentation-ready orientation for morning rounds.",
  notFor: [
    "a full attending assessment and plan",
    "a medication-only safety audit",
    "a guideline currency review",
    "a teaching handout",
    "a discharge readiness review",
    "a blind-spot second opinion"
  ]
})}

<task>
Create a patient-specific rounds report: what to say, what to self-check before rounds, and only decision-level team questions.
</task>`,
    `<output_format>
Use at most 6 bullets total.
Prefix every bullet with SAY, CHECK, ASK, or WATCH.
SAY = wording that materially improves the rounds presentation.
CHECK = chart, bedside, lab, medication administration record, order, imaging, intake/output, or note fact the student should verify directly.
ASK = team judgment, rationale, contingency threshold, consultant preference, or unavailable context.
WATCH = escalation, monitoring, or disposition cue.
Do not include citations or a reference list for routine rounds preparation.
Do not write a full problem-based plan; reserve that for the attending-level plan task.
Do not add headings or empty categories.
</output_format>`
  );
}

function fullRoundsReportPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician and clerkship coach helping a medical student prepare a complete but concise rounds report.
</role>

${taskBoundary({
  primary: "Turn de-identified chart context into a fuller rounds report with concise clinical trajectory, objective anchors, assessment, and management priorities.",
  notFor: [
    "a short bullets-only rounds orientation; use the concise rounds report for that",
    "a medication-only safety audit",
    "a guideline currency review",
    "a teaching handout",
    "a discharge readiness-only review",
    "a blind-spot second opinion"
  ]
})}

<task>
Create a full rounds report modeled on a classic one-liner, active-problem trajectory, objective data, assessment, and plan. Make it compact enough to present from, with no repeated data unless a repeated value changes the interpretation.
</task>`,
    `<output_format>
Use exactly these headings, in this order:
ONE-LINER
ACTIVE PROBLEMS AND TRAJECTORY
TODAY'S ROUNDS PRIORITIES
SUBJECTIVE AND INTERVAL EVENTS
OBJECTIVE DATA TO ANCHOR PRESENTATION
ASSESSMENT AND PLAN
CONTINGENCIES AND DISPOSITION
Keep the whole report concise: max 1 one-liner sentence, max 6 active problems, max 5 priorities, max 6 objective anchors, max 6 assessment/plan bullets, and max 4 contingency/disposition bullets.
For each active problem, include only status, trend, and the decision it changes today.
Put each lab/vital/medication/imaging trend in only one section unless it changes a separate decision elsewhere.
Do not include exhaustive PMH, medication lists, normal exam, negative ROS, or copied chart narrative unless it changes today's plan.
Put chart-verifiable missing data under TODAY'S ROUNDS PRIORITIES or OBJECTIVE DATA TO ANCHOR PRESENTATION; put true team judgment under ASSESSMENT AND PLAN.
Do not include citations or a reference list.
</output_format>`
  );
}

function finalRoundsPrompt(context) {
  return [
    `<role>
Attending physician and clerkship coach updating a rounds presentation after bedside pre-rounding.
</role>`,
    taskBoundary({
      primary: "Update the already-created OpenEvidence rounds conversation using only new bedside findings and local checklist results.",
      notFor: [
        "re-summarizing the full chart from scratch",
        "adding unsupported new diagnoses or orders",
        "rewriting the local bedside checklist",
        "performing a broad teaching or guideline review"
      ]
    }),
    commonClinicalRules,
    abbreviationRules,
    usefulnessRules,
    context.userContext || "",
    findingsContextBlock(context),
    `<output_format>
Use at most 5 bullets total.
Prefix every bullet with SAY, CHECK, ASK, or WATCH.
Only include changes since the initial report that change the presentation, self-checks, escalation/monitoring, or a true team decision question.
Do not ask the team about bedside findings, labs, medication administration record entries, or other facts the student can verify directly.
Do not include citations or a reference list.
Do not add headings, unchanged items, or empty categories.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

function medicationSafetyPrompt(context) {
  const task = `<role>
Attending physician and medication safety reviewer helping a student prepare for rounds.
</role>

${taskBoundary({
  primary: "Find medication, dosing, administration, monitoring, interaction, and supply issues that should be verified before rounds.",
  notFor: [
    "a general assessment and plan",
    "a discharge checklist except medication or supply barriers",
    "a guideline literature review",
    "a broad blind-spot review unrelated to medications"
  ]
})}

<task>
Identify medication-related issues to verify before rounds. Use cautious language; call something an error only if directly supported.
</task>

<safety_focus>
Check dose/frequency, renal/hepatic/weight/age fit, duplicate therapy, disease/lab mismatches, held/refused/delayed/missing administrations, order/MAR mismatches, high-risk interactions, peri-procedural timing, prophylaxis gaps, and critical home med restart/hold questions.
</safety_focus>`;

  const output = `<output_format>
Use at most 5 bullets total.
Prefix every bullet with VERIFY, ASK, MONITOR, or ESCALATE.
For each bullet: name the medication/class, state what could be wrong or unclear, and explain why it changes safety or management.
VERIFY = chart-verifiable order, dose, route, frequency, renal/hepatic/weight/age fit, lab monitoring, or medication administration record issue.
ASK = rationale, intended plan, unclear hold/restart, missing administration context, nursing barrier, or consultant preference not visible in the chart.
MONITOR = monitoring action tied to a medication risk.
ESCALATE = urgent medication safety concern.
Do not include non-medication problems unless they directly change medication safety.
Do not include likely-okay, no-action, or no-concern bullets.
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
Attending-level clinical evidence reviewer.
</role>

${taskBoundary({
  primary: "Use OpenEvidence's current guidance to identify only patient-specific evidence points that could change today's management.",
  notFor: [
    "auditing pasted local guideline text",
    "summarizing current guidelines without a case-specific management change",
    "hunting for contraindications or rare exceptions; use the exception task for that",
    "creating an attending problem-based plan",
    "teaching a junior learner",
    "generating bedside checklist rows"
  ]
})}

<task>
Check whether OpenEvidence's current guidelines or evidence change what should be verified, escalated, monitored, treated, or avoided for this patient today.
</task>`,
    `<output_format>
Use at most 4 bullets total.
Prefix every bullet with CHANGE, CONFIRM, or VERIFY.
CHANGE = current evidence suggests a different action, threshold, test, treatment, monitoring plan, or disposition frame.
CONFIRM = current evidence strongly supports continuing a high-stakes current action.
VERIFY = patient fact needed before applying a guideline threshold or recommendation.
Use OpenEvidence's own current guideline access; do not ask me to paste guidelines.
Include at most 2 citations total, inline only, and only when directly supporting a management-changing point.
Do not write a broad guideline summary, practice-guideline narrative, or reference list.
</output_format>`
  );
}

function exceptionPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician looking for guideline exceptions, contraindications, and special-population caveats.
</role>

${taskBoundary({
  primary: "Find patient-specific reasons a normally appropriate guideline or default pathway may need modification.",
  notFor: [
    "reconfirming the whole guideline pathway",
    "writing a general problem-based plan",
    "performing a medication-only audit",
    "teaching basic illness scripts"
  ]
})}

<task>
Find case-specific exceptions, contraindications, competing risks, missing prerequisites, or special-population issues that could change routine guidance.
</task>`,
    `<output_format>
Use at most 4 bullets total.
Prefix every bullet with EXCEPTION, CONTRAINDICATION, PREREQUISITE, or SPECIAL-POPULATION.
Include only exceptions, competing risks, missing prerequisites, or special-population issues that alter a default pathway for this patient.
If a citation is essential, include it inline; do not create a citation section or reference list.
Separate self-checkable facts from true team questions. Do not ask the team for labs, vitals, or medication details the student can verify directly.
Do not restate standard guideline recommendations unless needed to explain the exception.
Do not write a broad guideline summary.
</output_format>`
  );
}

function attendingPlanPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician giving a concise assessment and plan to help a learner understand safe next steps.
</role>

${taskBoundary({
  primary: "Build a problem-based diagnostic and treatment reasoning plan from supported case facts.",
  notFor: [
    "a compact rounds presentation script",
    "a medication-only safety check",
    "a guideline currency audit",
    "a teaching handout",
    "a discharge logistics checklist"
  ]
})}

<task>
Create an attending-level assessment and plan from supported facts. Separate confirmed facts, plausible interpretations, and items needing team verification.
</task>`,
    `<output_format>
Use at most 6 bullets total.
Prefix every bullet with DIAGNOSIS, TREATMENT, MONITOR, ESCALATE, or ASK.
Include only diagnostic or treatment reasoning that changes today's decisions, monitoring, escalation, or team discussion.
Keep chart, bedside, medication administration record, and order checks as student-verifiable facts; use ASK only for team judgment or unavailable context.
Do not invent orders.
Do not include citations or a reference list; this is a reasoning handoff, not a literature review.
Do not write a full problem-list assessment and plan or repeat a full rounds report.
</output_format>`
  );
}

function teachingPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician teaching an early third-year medical student.
</role>

${taskBoundary({
  primary: "Explain the case, reasoning, and learning points so a junior student can understand and present intelligently.",
  notFor: [
    "a directive attending plan",
    "a medication safety audit",
    "a guideline citation audit",
    "a discharge readiness checklist",
    "a blind-spot review"
  ]
})}

<task>
Explain the patient and reasoning in practical language for prerounding, presentation, data interpretation, and common learner mistakes.
</task>`,
    `<output_format>
Use at most 4 bullets total.
Prefix every bullet with SAY, CHECK, ASK, or AVOID.
Include only learner-facing points that change what the student says on rounds, verifies before rounds, asks the team, or avoids overclaiming.
Use ASK only for concepts or reasoning worth asking a supervising clinician; do not include factual questions answerable from the chart.
Do not include citations or a reference list. Do not include a reading plan, source names, journal names, society names, evidence grades, bracketed citation markers, relevant images, or external links.
Do not write an illness-script review, background review, or management plan.
</output_format>`
  );
}

function dischargePrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician checking discharge readiness and transition safety.
</role>

${taskBoundary({
  primary: "Assess whether the patient is approaching a safe transition out of the hospital and what barriers remain.",
  notFor: [
    "a full inpatient assessment and plan",
    "a medication-only safety audit except discharge medications and supplies",
    "a teaching handout",
    "a general blind-spot review",
    "a guideline currency audit"
  ]
})}

<task>
Identify case-specific discharge readiness, transition barriers, follow-up, supplies, counseling, and unresolved safety issues.
</task>`,
    `<output_format>
Use at most 5 bullets total.
Prefix every bullet with BARRIER, SUPPLY, FOLLOW-UP, COUNSEL, or RETURN.
Include only discharge-limiting barriers, medication/supply/access issues, follow-up or handoff needs, counseling that changes safety, or return precautions.
Do not include inpatient tasks unless they determine discharge readiness.
Do not include citations or a reference list. Do not include source names, journal names, society names, evidence grades, or bracketed citation markers.
Do not rewrite the inpatient plan except where it directly affects discharge readiness.
</output_format>`
  );
}

function missingPrompt(context) {
  return buildPatientPrompt(
    context,
    `<role>
Attending physician pressure-testing a medical student's prerounding plan.
</role>

${taskBoundary({
  primary: "Provide a second-look safety and reasoning audit that finds important omissions not already covered by the specialized tasks.",
  notFor: [
    "a complete rounds report",
    "a full attending assessment and plan",
    "a medication-only audit unless a medication issue is a major blind spot",
    "a guideline citation review",
    "a teaching guide",
    "a discharge checklist unless discharge is the main blind spot"
  ]
})}

<task>
Find high-yield blind spots: diagnostic misses, monitoring gaps, red flags, missing follow-up data, communication gaps, escalation triggers, and locally unvalidated checklist gaps.
</task>`,
    `<output_format>
Use at most 5 bullets total.
Prefix every bullet with MISS, VERIFY, ESCALATE, ASK, or UNVALIDATED GAP.
Include only true blind spots that could change diagnosis, treatment, monitoring, escalation, disposition, communication, or local checklist review.
Only use ASK when the answer requires team judgment or unavailable context. Put self-checkable facts under VERIFY.
Label every bedside checklist addition idea with the UNVALIDATED GAP prefix.
Do not perform a guideline review or literature search. Do not include citations or a reference list.
Do not include low-yield distractions or padding.
</output_format>`
  );
}

function checklistImprovementPrompt(context) {
  return [
    `<role>
Attending physician helping a clinician pressure-test a locally generated bedside prerounding checklist.
</role>

${taskBoundary({
  primary: "Critique the locally generated bedside checklist for omissions, wording problems, and mismatch with validated local workup context.",
  notFor: [
    "creating a replacement checklist",
    "writing a patient management plan",
    "summarizing the full chart",
    "performing a medication-only audit",
    "giving generic disease teaching"
  ]
})}

<task>
Review the current checklist against the compact de-identified context. Flag omissions, broad/unclear wording, unsafe assumptions, and mismatch with the selected local diagnosis/workup.
</task>`,
    commonClinicalRules,
    abbreviationRules,
    usefulnessRules,
    context.userContext || "",
    block("deidentified_patient_context", context.checklistPatientSummary),
    block("current_checklist", context.currentChecklist),
    block("local_checklist_audit", context.checklistAuditSummary),
    block("clinician_refinement_notes", context.refinementNotes),
    `<privacy_boundary>
Raw chart text, HPI, identifiers, names, exact dates, room numbers, and medical record numbers were intentionally withheld. Work only from the compact de-identified context and current checklist.
</privacy_boundary>

<output_format>
Use at most 5 bullets total.
Prefix every bullet with ADD, REMOVE, or WORDING.
Include only checklist changes that could alter bedside verification, escalation, disposition, or team decision-making.
Label every suggested added or changed bedside question/exam item as UNVALIDATED LOCAL REVIEW in the same bullet.
Do not output a replacement final checklist. Do not provide a copy-ready checklist.
Do not include citations or a reference list.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

export const openEvidenceTasks = [
  { id: "initial_rounds_report", label: "Concise rounds report", category: "Rounds", requiredContext: "source", outputKind: "rounds_report", promptBuilder: initialRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Initial rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "full_rounds_report", label: "Full rounds report", category: "Rounds", requiredContext: "source", outputKind: "full_rounds_report", promptBuilder: fullRoundsReportPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Full rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "final_rounds_update", label: "Final rounds update", category: "Rounds", requiredContext: "findings", outputKind: "rounds_update", promptBuilder: finalRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Final rounds update prompt copied. Paste it into OpenEvidence.", requiresSameConversation: true },
  { id: "checklist_improvement_review", label: "Checklist improvement review", category: "Checklist", requiredContext: "checklist_refinement", outputKind: "checklist_improvement_review", promptBuilder: checklistImprovementPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Checklist improvement prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "medication_safety", label: "Medication safety", category: "Safety", requiredContext: "medication_context", outputKind: "medication_safety", promptBuilder: medicationSafetyPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Medication safety prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "confirm_guideline", label: "Confirm guideline", category: "Guidelines", requiredContext: "guideline_or_source", outputKind: "guideline_confirmation", promptBuilder: guidelinePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Guideline confirmation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "find_exception", label: "Find exception", category: "Guidelines", requiredContext: "source", outputKind: "guideline_exceptions", promptBuilder: exceptionPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Exception-finding prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "attending_plan", label: "Attending-level plan", category: "Reasoning", requiredContext: "source", outputKind: "attending_plan", promptBuilder: attendingPlanPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Attending-level plan prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "teaching_explanation", label: "Teaching explanation", category: "Teaching", requiredContext: "source", outputKind: "teaching", promptBuilder: teachingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Teaching explanation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "discharge_checklist", label: "Discharge readiness review", category: "Discharge", requiredContext: "source", outputKind: "discharge_checklist", promptBuilder: dischargePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Discharge readiness prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
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
  const promptIncludesSource = /<source_context>/i.test(prompt);
  const promptIncludesChecklist = /<current_checklist>/i.test(prompt);
  const promptIncludesPatientContext = /<deidentified_patient_context>/i.test(prompt);
  const promptIncludesFindings = /<new_bedside_findings>/i.test(prompt);
  const sourceIncluded = promptIncludesSource || promptIncludesChecklist || promptIncludesPatientContext || promptIncludesFindings;
  const reviewText = [
    promptIncludesSource ? context.sourceContext : "",
    promptIncludesPatientContext ? context.checklistPatientSummary : "",
    promptIncludesChecklist ? context.currentChecklist : "",
    promptIncludesFindings ? context.compiledFindings : ""
  ].filter((value) => clean(value)).join("\n\n");
  return {
    taskId: task.id,
    label: task.label,
    category: task.category,
    requiredContext: task.requiredContext,
    outputKind: task.outputKind,
    prompt,
    contextText: context.sourceContext || context.checklistPatientSummary || context.currentChecklist || context.compiledFindings || "",
    reviewScope: sourceIncluded ? "custom" : "source-free",
    reviewText: sourceIncluded ? reviewText : "",
    copySuccessMessage: task.copySuccessMessage,
    requiresSameConversation: task.requiresSameConversation,
    sameConversationReady: Boolean(context.sameConversationReady),
    pasteBackParser: (text) => task.pasteBackParser(task, text, context)
  };
}
