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
Include only items that change what the student says, verifies, escalates, or follows up.
Use exactly the requested section headings, in order; no added, renamed, combined, or reordered sections.
Use concise bullets/short paragraphs. If a section has no high-yield content, write "No high-yield items."
Do not include conversational follow-up offers, closing questions, disclaimers, filler, or background reviews.
Do not ask the team about facts the student can usually verify directly in the chart, medication administration record, bedside assessment, local checklist, labs, vitals, imaging, intake/output, orders, or notes.
Sort action items as SELF-CHECK for directly verifiable facts, TEAM QUESTION for judgment/rationale/contingencies/consultant preferences/unavailable context, and OMIT for answered, generic, redundant, or low-yield content.
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

const guidelineSectionLimits = new Map([
  ["Basic bedside data / safety checks", 6],
  ["Focused history questions", 8],
  ["Core physical exam maneuvers", 6],
  ["Conditional exam add-ons", 4],
  ["Conditional history add-ons", 4],
  ["Immediate tests / next steps", 6],
  ["Management-changing findings / disposition cues", 6],
  ["Red flags and escalation cues", 6],
  ["Limitations and interpretation cautions", 4],
  ["Differential buckets", 4],
  ["Catalog gaps needing review", 4],
  ["Unsupported/gap state", 4],
  ["Evidence / LR metadata", 0],
  ["Suppressed/not-recommended items", 0]
]);

function compactPromptLine(line, maxLength = 220) {
  const withoutTrace = clean(line)
    .replace(/\s+\[([^\];\]]+)(?:;[^\]]*)?\]/g, " [$1]")
    .replace(/\s+/g, " ");
  if (withoutTrace.length <= maxLength) return withoutTrace;
  return `${withoutTrace.slice(0, maxLength - 3).trim()}...`;
}

function compactGuidelineReport(report, maxChars = 4500) {
  const text = clean(report);
  if (!text) return "";

  const out = [];
  const omitted = new Map();
  let currentSection = "";
  let sectionCount = 0;
  let sectionIncluded = false;

  function omit(section) {
    const key = section || "Details";
    omitted.set(key, (omitted.get(key) || 0) + 1);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = clean(line);
    if (!trimmed) continue;

    if (guidelineSectionLimits.has(trimmed)) {
      currentSection = trimmed;
      sectionCount = 0;
      sectionIncluded = false;
      if (guidelineSectionLimits.get(trimmed) > 0) {
        out.push("", trimmed);
        sectionIncluded = true;
      }
      continue;
    }

    const limit = currentSection ? guidelineSectionLimits.get(currentSection) ?? 4 : 4;
    if (limit === 0) {
      omit(currentSection);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      sectionCount += 1;
      if (sectionCount <= limit) {
        if (currentSection && !sectionIncluded) {
          out.push("", currentSection);
          sectionIncluded = true;
        }
        out.push(compactPromptLine(trimmed));
      } else {
        omit(currentSection);
      }
      continue;
    }

    if (!currentSection || /^(Input|Module|Triggered red flags|Recommendations|Status|Next step|Gap status|Gap type|Setting|Population):/i.test(trimmed)) {
      out.push(compactPromptLine(trimmed));
    } else {
      omit(currentSection);
    }
  }

  for (const [section, count] of omitted.entries()) {
    if (count > 0) out.push(`- ${count} ${section} detail line${count === 1 ? "" : "s"} omitted from prompt; use local app/workup report for full trace.`);
  }

  const compacted = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, maxChars - 90).trim()}\n- Additional local pathway details omitted to keep this prompt concise.`;
}

function compactEvidenceSummary(summary, maxChars = 1800) {
  const text = clean(summary);
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 75).trim()}\n- Additional retrieved evidence summary omitted for prompt length.`;
}

function guidelineContextBlock(context) {
  return [
    block("local_guideline_pathway", compactGuidelineReport(context.complaintCdsReport)),
    block("evidence_retrieval_summary", compactEvidenceSummary(context.evidenceSummary))
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
    guidelineContextBlock(context),
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
    guidelineContextBlock(context),
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
Use plain text with these sections:
SNAPSHOT
TODAY'S CLINICAL TRAJECTORY
PROBLEM LIST FOR PRESENTATION
PRE-ROUNDS SELF-CHECKS
TEAM DECISION QUESTIONS
ONE-LINE WATCHOUTS
Put labs, vitals, medication administration record checks, orders, imaging, intake/output, and note review under PRE-ROUNDS SELF-CHECKS.
Use TEAM DECISION QUESTIONS only for team judgment, rationale, contingency thresholds, consultant preference, or unavailable context.
Do not include citations or a reference list for routine rounds preparation.
Do not write a full problem-based plan; reserve that for the attending-level plan task.
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
Use exactly these sections:
UPDATED TWO MINUTE PRESENTATION
BEDSIDE FINDINGS THAT CHANGE THE STORY
REMAINING SELF-CHECKS BEFORE ROUNDS
TEAM DECISION QUESTIONS
ESCALATION OR SAFETY FLAGS
UNCHANGED ITEMS NOT WORTH REPEATING
Keep only changes since the initial report. Do not ask the team about bedside findings, labs, medication administration record entries, or other facts the student can verify directly.
Do not include citations or a reference list.
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
Use exactly these sections:
MEDICATION SAFETY SNAPSHOT
HIGH PRIORITY MEDICATION VERIFICATIONS
DOSE ROUTE FREQUENCY OR RENAL-HEPATIC CONCERNS
ADMINISTRATION TIMING AND MAR MISMATCHES
INTERACTIONS CONTRAINDICATIONS AND MONITORING
MEDICATION TEAM OR NURSING QUESTIONS
LIKELY OKAY OR NO ACTION NEEDED
For each concern: medication/class, what seems off, why it matters, and what to self-check or ask.
Keep chart-verifiable medication administration record, active order, dose, route, frequency, renal function, and lab-monitoring checks in verification sections. Use MEDICATION TEAM OR NURSING QUESTIONS only for rationale, intended plan, unclear holds, missing administrations, handoff needs, or bedside administration context not visible in the chart.
Do not rename or combine headings. If there is no concern for a heading, keep the heading and write "No high-yield items."
Do not include non-medication problems unless they directly change medication safety.
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
  primary: "Audit whether the local guideline pathway and key recommendations are current, evidence-aligned, and applicable to this case.",
  notFor: [
    "hunting for contraindications or rare exceptions; use the exception task for that",
    "creating an attending problem-based plan",
    "teaching a junior learner",
    "generating bedside checklist rows"
  ]
})}

<task>
Check whether the local pathway is current, evidence-aligned, and applicable to this case. Cite only sources that support or contradict a pathway point.
</task>`,
    `<output_format>
Use sections:
GUIDELINE ALIGNMENT VERDICT
LOCAL PATHWAY POINTS THAT MATCH CURRENT GUIDANCE
OUTDATED MISSING OR OVERSTATED POINTS
CASE-SPECIFIC EVIDENCE APPLICATION
SELF-CHECKS BEFORE RELYING ON THE GUIDELINE
CITATIONS
Start with GUIDELINE ALIGNMENT VERDICT. Do not begin with a Practice Guideline narrative or broad literature summary.
Use only these headings, exactly as written and in this order.
Put citations only under CITATIONS and limit them to the 3-5 highest-yield sources.
Only include self-checks that affect whether the guideline applies; do not list generic chart-review tasks.
Identify conflicts without writing a full assessment and plan.
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
Use sections:
CASE FEATURES THAT COULD CHANGE THE DEFAULT PATHWAY
CONTRAINDICATIONS COMPETING RISKS OR SPECIAL POPULATIONS
MISSING PREREQUISITES BEFORE APPLYING GUIDANCE
SELF-CHECKS AND TEAM QUESTIONS
CITATIONS WHEN RELEVANT
Start with CASE FEATURES THAT COULD CHANGE THE DEFAULT PATHWAY. Do not begin with a Practice Guideline narrative or broad literature summary.
Use only these headings, exactly as written and in this order.
Put citations only under CITATIONS WHEN RELEVANT and limit them to sources that directly support an exception, contraindication, or prerequisite.
Separate self-checkable facts from true team questions. Do not ask the team for labs, vitals, or medication details the student can verify directly.
Do not restate standard guideline recommendations unless needed to explain the exception.
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
Use sections:
ONE-LINER
ACTIVE PROBLEMS AND WORKING ASSESSMENT
DIAGNOSTIC REASONING AND SELF-CHECKS
TREATMENT REASONING AND TEAM DECISIONS
CONTINGENCIES AND ESCALATION THRESHOLDS
STUDENT VERIFICATION TASKS
Keep it concise; do not invent orders.
In STUDENT VERIFICATION TASKS, include only high-yield chart, bedside, or medication administration record checks the student can do independently. Put team judgment under TREATMENT REASONING AND TEAM DECISIONS.
Do not include citations or a reference list; this is a reasoning handoff, not a literature review.
Do not repeat a full rounds report unless a fact is needed for the plan.
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
Use sections:
PATIENT SNAPSHOT
WHY THIS PATIENT IS HERE
ILLNESS SCRIPT AND DIFFERENTIAL FRAME
DATA INTERPRETATION FOR THIS CASE
MEDICATIONS AND TREATMENTS TO UNDERSTAND
HOW TO PRESENT WITHOUT OVERCLAIMING
HIGH-YIELD LEARNING QUESTIONS
ROUNDING TAKEAWAYS
Use learning questions only for concepts or reasoning worth asking a supervising clinician or reading about; do not include factual questions answerable from the chart.
Do not include citations or a reference list. Do not include a reading plan, source names, journal names, society names, evidence grades, bracketed citation markers, relevant images, or external links.
Stop immediately after the last ROUNDING TAKEAWAYS item.
Do not output a management plan as instructions; explain reasoning behind likely team decisions.
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
Use sections:
DISPOSITION READINESS VERDICT
MEDICATIONS SUPPLIES AND ACCESS
FOLLOW-UP AND HANDOFF NEEDS
PATIENT COUNSELING TOPICS
SAFETY-NET AND RETURN PRECAUTIONS
UNRESOLVED BARRIERS
Focus on discharge-limiting barriers and handoff needs. Do not include inpatient tasks unless they determine discharge readiness.
Do not include citations or a reference list. Do not include source names, journal names, society names, evidence grades, or bracketed citation markers.
Base discharge readiness on the provided case facts and local pathway only; do not invoke external guideline organizations or evidence summaries.
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
Use sections:
TOP BLIND SPOTS
MANAGEMENT-CHANGING DATA TO VERIFY
ESCALATION TRIGGERS TO WATCH
UNVALIDATED GAP SUGGESTIONS FOR LOCAL REVIEW
TEAM DECISION QUESTIONS
LOW-YIELD DISTRACTIONS TO IGNORE
Only include team questions when the answer requires team judgment or unavailable context. Put self-checkable facts under MANAGEMENT-CHANGING DATA TO VERIFY.
Do not perform a guideline review or literature search. Do not include citations or a reference list.
If there are no high-yield blind spots, say so directly and do not pad the answer.
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
    block("local_guideline_pathway", compactGuidelineReport(context.complaintCdsReport)),
    block("evidence_retrieval_summary", compactEvidenceSummary(context.evidenceSummary)),
    block("current_checklist", context.currentChecklist),
    block("local_checklist_audit", context.checklistAuditSummary),
    block("clinician_refinement_notes", context.refinementNotes),
    `<privacy_boundary>
Raw chart text, HPI, identifiers, names, exact dates, room numbers, and medical record numbers were intentionally withheld. Work only from the compact de-identified context and current checklist.
</privacy_boundary>

<output_format>
Use exactly these sections:
CHECKLIST FIT
MISSING OR WEAKLY COVERED DOMAINS
WORDING OR OPTION IMPROVEMENTS
UNVALIDATED CHECKLIST IMPROVEMENT SUGGESTIONS
WHAT TO VERIFY LOCALLY BEFORE CHANGING THE CHECKLIST
Do not output a replacement final checklist. Do not provide a copy-ready checklist. Label every suggested added or changed bedside question/exam item as an unvalidated suggestion for local review.
Do not include citations or a reference list.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

export const openEvidenceTasks = [
  { id: "initial_rounds_report", label: "Concise rounds report", category: "Rounds", requiredContext: "source", outputKind: "rounds_report", promptBuilder: initialRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Initial rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
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
    promptIncludesFindings ? context.compiledFindings : "",
    context.complaintCdsReport
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
