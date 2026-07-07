import { parseOpenEvidenceResult } from "./open-evidence-results.js";

export const OPEN_EVIDENCE_PROMPT_CHAR_LIMIT = 50000;

const DEFAULT_CONTEXT_LIMITS = {
  contextType: 400,
  userContext: 1200,
  labChronologyBlock: 1800,
  sourceContext: 9000,
  source_context: 9000,
  compiledFindings: 6000,
  new_bedside_findings: 6000,
  checklistPatientSummary: 3000,
  deidentified_patient_context: 3000,
  currentChecklist: 9000,
  current_checklist: 9000,
  checklistAuditSummary: 1000,
  refinementNotes: 1000,
  objectiveData: 3000,
  objective_data: 3000,
  selectedWorkupTitle: 240,
  selected_workup_title: 240,
  selectedWorkupId: 120,
  selected_workup_id: 120,
  decisionTreeJson: 3200,
  decision_tree_json: 3200
};

const TASK_CONTEXT_LIMIT_OVERRIDES = {
  full_rounds_report: {
    sourceContext: 12000,
    source_context: 12000
  },
  teaching_explanation: {
    sourceContext: 10000,
    source_context: 10000
  },
  checklist_improvement_review: {
    currentChecklist: 12000,
    current_checklist: 12000,
    checklistPatientSummary: 12000,
    deidentified_patient_context: 12000,
    objectiveData: 6000,
    objective_data: 6000,
    compiledFindings: 4000,
    new_bedside_findings: 4000
  },
  final_rounds_update: {
    sourceContext: 5000,
    source_context: 5000,
    compiledFindings: 7000,
    new_bedside_findings: 7000
  },
  decision_tree_builder: {
    decisionTreeJson: 3200,
    decision_tree_json: 3200,
    sourceContext: 3000,
    source_context: 3000
  }
};

const HIGH_VALUE_CONTEXT_LINE_PATTERN = /\b(?:chief complaint|one-liner|assessment|plan|problem|diagnos|subjective|objective|hpi|history|hospital course|interval|overnight|event|vital|temperature|heart rate|blood pressure|respiratory|oxygen|exam|lab|sodium|potassium|creatinine|glucose|anion gap|bicarb|wbc|hemoglobin|platelet|lactate|troponin|culture|imaging|x-?ray|ct\b|mri\b|ultrasound|medication|mar\b|antibiotic|insulin|allerg|consult|procedure|discharge|follow.?up|pending|intake|output|urine|diet|pain|mental status|baseline|active problem|workup)\b/i;
const LOW_VALUE_CONTEXT_LINE_PATTERN = /^(?:page \d+|printed|generated|electronically signed|signed by|cosigned by|dictated by|confidentiality notice|copyright|fax|phone|address|insurance|billing|encounter id|account|medical record|mrn|dob|room|bed|visit number|result status|specimen received|reference range|normal range)\b/i;

const EVIDENCE_GUARDRAILS = `<guidance>
A de-identified clinical case for educational use follows below.
Answer using OpenEvidence's current guidelines and literature. Base your response on evidence you can cite.
Do not fabricate facts, patient identifiers, diagnoses, or clinical data not present in the context or your sources.
Distinguish what evidence supports from what is uncertain or not yet verified.
</guidance>`;
const NOTE_STANDARD_GUIDANCE = "Use docs/presentation-note-standard.md as the canonical local standard for oral presentations, H&Ps, progress notes, follow-up notes, and handoff-style summaries.";

const PLAIN_OPEN_EVIDENCE_OUTPUT = "Return plain-language clinical guidance only. Do not return JSON, fenced code, APP_PASTE_BACK_JSON, paste-back blocks, or app-specific schemas.";

function clean(value) {
  return String(value || "").trim();
}

function jsonStringContent(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function contextLimitsForTask(taskId = "") {
  return {
    ...DEFAULT_CONTEXT_LIMITS,
    ...(TASK_CONTEXT_LIMIT_OVERRIDES[taskId] || {})
  };
}

function normalizeContextLine(line = "") {
  return String(line || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenContextLine(line = "", maxChars = 700) {
  const text = normalizeContextLine(line);
  if (text.length <= maxChars) return text;
  const keep = Math.max(80, maxChars - 42);
  return `${text.slice(0, keep).trim()} [line shortened for prompt size]`;
}

function compactPromptText(value, {
  maxChars = 9000,
  maxLines = 160,
  headLines = 24,
  tailLines = 20,
  lineMaxChars = 700
} = {}) {
  const text = clean(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const seen = new Set();
  const records = [];
  text.split("\n").forEach((line, index) => {
    const normalized = normalizeContextLine(line);
    if (!normalized) return;
    if (LOW_VALUE_CONTEXT_LINE_PATTERN.test(normalized) && !HIGH_VALUE_CONTEXT_LINE_PATTERN.test(normalized)) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    records.push({
      index,
      line: shortenContextLine(normalized, lineMaxChars),
      highValue: HIGH_VALUE_CONTEXT_LINE_PATTERN.test(normalized)
    });
  });

  const usableRecords = records.length ? records : text.split("\n")
    .map((line, index) => ({ index, line: shortenContextLine(line, lineMaxChars), highValue: false }))
    .filter((record) => record.line);
  if (!usableRecords.length) return "";

  const selected = new Map();
  const addRecord = (record) => {
    if (record && selected.size < maxLines) selected.set(record.index, record);
  };
  usableRecords.slice(0, headLines).forEach(addRecord);
  const remainingSlots = Math.max(0, maxLines - selected.size - tailLines);
  usableRecords
    .filter((record) => record.highValue && !selected.has(record.index))
    .slice(0, remainingSlots)
    .forEach(addRecord);
  usableRecords.slice(-tailLines).forEach(addRecord);

  const ordered = Array.from(selected.values()).sort((a, b) => a.index - b.index);
  const notice = `[Context shortened for OpenEvidence input limit: kept ${ordered.length} of ${usableRecords.length} useful lines; omitted repeated chart boilerplate and overflow.]`;
  const availableChars = Math.max(800, maxChars - notice.length - 2);
  const outputLines = [];
  let usedChars = 0;
  for (const record of ordered) {
    const separatorChars = outputLines.length ? 1 : 0;
    const nextChars = separatorChars + record.line.length;
    if (usedChars + nextChars > availableChars) break;
    outputLines.push(record.line);
    usedChars += nextChars;
  }
  if (!outputLines.length) {
    outputLines.push(shortenContextLine(usableRecords[0].line, Math.max(200, availableChars)));
  }
  return `${outputLines.join("\n")}\n${notice}`.trim();
}

export function compactOpenEvidenceContext(context = {}, taskId = "") {
  const limits = contextLimitsForTask(taskId);
  const compacted = { ...context };
  for (const [field, maxChars] of Object.entries(limits)) {
    if (typeof context[field] === "string") {
      compacted[field] = compactPromptText(context[field], {
        maxChars,
        maxLines: /^(?:sourceContext|source_context|currentChecklist|current_checklist)$/.test(field) ? 180 : 90,
        headLines: 24,
        tailLines: /^(?:sourceContext|source_context)$/.test(field) ? 28 : 16,
        lineMaxChars: 700
      });
    }
  }
  return compacted;
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
    "<scope>",
    primary ? `What to answer: ${clean(primary)}` : "",
    exclusions ? `Do not include:\n${exclusions}` : "",
    "</scope>"
  ].filter(Boolean).join("\n");
}

function sourceContextBlock(context) {
  return [
    block("context_type", context.contextType || "De-identified case for evidence review."),
    context.labChronologyBlock ? block("lab_chronology", context.labChronologyBlock) : "",
    block("source_context", context.sourceContext)
  ].filter(Boolean).join("\n\n");
}

function findingsContextBlock(context) {
  return [
    context.sameConversationReady ? block("same_conversation_context", "The de-identified case context was provided earlier in this conversation. Use that context.") : "",
    block("new_bedside_findings", context.compiledFindings),
    context.sourceContext && !context.sameConversationReady ? sourceContextBlock(context) : ""
  ].filter(Boolean).join("\n\n");
}

function buildPatientPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    sourceContextBlock(context),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}

function buildSameConversationPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    block("same_conversation_context", "The de-identified case context was provided earlier in this conversation. Use that context; do not ask for it again."),
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
    `${taskBoundary({
  primary: "Using OpenEvidence, summarize the de-identified case below into a concise structured SOAP-format report, citing relevant evidence and guidelines.",
  notFor: [
    "a comprehensive full SOAP note",
    "a medication-only safety audit",
    "a teaching handout",
    "a discharge readiness review",
    "a blind-spot second opinion"
  ]
})}

<clinical_question>
Produce a concise evidence-informed case summary in SOAP format. Avoid redundancy. Include each detail only if it changes the clinical story, objective interpretation, or management.
</clinical_question>`,
    `<output_format>
${NOTE_STANDARD_GUIDANCE}
Use concise bullets only, organized exactly as:
I. SUBJECTIVE
- One-liner
- HPI / consult question / management to date
- Medications and allergies, grouped by indication
- Relevant psychosocial, family, and social history
II. OBJECTIVE
- Vitals
- Physical exam
- Laboratory data and trends
- Imaging / other workup
III. ASSESSMENT AND PLAN
- Summary of patient
- Problem list with management plan / workup for each active problem
For each management recommendation, include an inline citation to current guideline or literature when OpenEvidence can support it.
Keep subjective and objective sections as short as possible without losing management-changing details.
Do not repeat the same fact in multiple sections unless it changes a separate management decision.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function fullRoundsReportPrompt(context) {
  return buildPatientPrompt(
    context,
    `${taskBoundary({
  primary: "Using OpenEvidence, produce a thorough evidence-informed structured summary of the de-identified case below in full SOAP format, citing relevant guidelines and literature.",
  notFor: [
    "a short highlights-only report; use the concise rounds report for that",
    "a medication-only safety audit",
    "a teaching handout",
    "a discharge readiness-only review",
    "a blind-spot second opinion"
  ]
})}

<clinical_question>
Create a complete structured case summary in SOAP format. Include all details needed to understand the case, with evidence citations. Avoid copied chart narrative and avoid repeating data unless the repetition changes interpretation.
</clinical_question>`,
    `<output_format>
${NOTE_STANDARD_GUIDANCE}
Use concise bullets only, organized exactly as:
I. SUBJECTIVE
- One-liner
- HPI / consult question / management to date
- Medications and allergies, grouped by indication
- Relevant psychosocial, family, and social history
II. OBJECTIVE
- Vitals
- Physical exam
- Laboratory data and trends
- Imaging / other workup
III. ASSESSMENT AND PLAN
- Summary of patient
- Problem list with management plan / workup for each active problem
Include important negatives, trends, medication context, and contingencies when they matter to the team's management.
For each management recommendation, include an inline citation to current guideline or literature when OpenEvidence can support it.
Do not add a separate reference list unless inline citations would be unclear.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function finalRoundsPrompt(context) {
  return [
    taskBoundary({
      primary: "Using the de-identified case context below and prior context from earlier in this conversation, identify what changed in the last 24 hours and what current evidence says about how it changes management.",
      notFor: [
        "re-summarizing the full chart from scratch",
        "adding unsupported new diagnoses or orders",
        "rewriting the local bedside checklist",
        "performing a broad teaching or guideline review"
      ]
    }),
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    findingsContextBlock(context),
    `<output_format>
${NOTE_STANDARD_GUIDANCE}
Use concise bullets only.
Use the case context already provided earlier in this conversation; do not repeat stable background.
Organize exactly as:
I. SUBJECTIVE - only new symptoms, interval events, or patient-reported changes
II. OBJECTIVE - only new vitals, exam changes, labs/trends, imaging, medication administrations, or procedures
III. ASSESSMENT AND PLAN - each bullet must state what changed in the last 24 hours and whether/how it changes management
Include "no management change" only when a new result might otherwise appear to require action.
Use inline guideline/literature citations only for new management recommendations or changed thresholds.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  ].filter(Boolean).join("\n\n");
}

function medicationSafetyPrompt(context) {
  const question = `${taskBoundary({
  primary: "Using OpenEvidence, review the medication information in the de-identified case below for evidence-supported medication safety considerations, addressing the 5Rs on every active medication.",
  notFor: [
    "a general assessment and plan",
    "a discharge checklist except medication or supply barriers",
    "a broad blind-spot review unrelated to medications"
  ]
})}

<clinical_question>
Using the medication and case information provided, identify evidence-supported medication safety considerations: verify right patient/context, right medication, right dose, right route, and right time/frequency for every active medication when data are available. Check whether medications are being given as ordered; dose/frequency fit with renal/hepatic/weight/age status; medication has a clear indication; the selected medication is appropriate for the case's active problems; duplicate therapy; disease/lab mismatches; held/refused/delayed/missing administrations; order/MAR mismatches; interactions; peri-procedural timing; prophylaxis gaps; and home medication restart/hold questions. Cite the evidence or guideline that supports each concern.
</clinical_question>`;

  const output = `<output_format>
Use concise bullets only, grouped by medication or medication class.
For each active medication with enough context, address the 5Rs: right patient/context, right medication, right dose, right route, right time/frequency.
For each issue, state: medication/class; what is mismatched, missing, unsafe, or unclear; why it matters; what to verify or change.
Use prefixes only when helpful: VERIFY, HOLD/RESTART, DOSE, INDICATION, INTERACTION, MONITOR, ESCALATE.
Include "no issue found" only for a high-risk medication where the MAR and notes clearly support all 5Rs.
Do not include non-medication problems unless they directly change medication safety.
</output_format>`;

  const fullOutput = `${output}

${PLAIN_OPEN_EVIDENCE_OUTPUT}`;
  if (context.sameConversationReady && !context.forceIncludeSourceForMedicationSafety) {
    return buildSameConversationPrompt(context, question, fullOutput);
  }
  return buildPatientPrompt(context, question, fullOutput);
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
    `${taskBoundary({
  primary: "Using OpenEvidence's current guidance, identify case-specific guideline exceptions, contraindications, competing risks, missing prerequisites, and special-population caveats for the de-identified case below.",
  notFor: [
    "reconfirming the whole guideline pathway",
    "writing a general problem-based plan",
    "performing a medication-only audit",
    "teaching basic illness scripts"
  ]
})}

<clinical_question>
Find evidence-supported exceptions, contraindications, competing risks, missing prerequisites, or special-population issues that could change routine guidance for this clinical scenario. Cite the specific evidence or guideline for each point.
</clinical_question>`,
    `<output_format>
Use at most 4 bullets total.
Prefix every bullet with EXCEPTION, CONTRAINDICATION, PREREQUISITE, or SPECIAL-POPULATION.
Include only exceptions, competing risks, missing prerequisites, or special-population issues that alter a default pathway for this case.
If a citation is essential, include it inline; do not create a citation section or reference list.
Do not restate standard guideline recommendations unless needed to explain the exception.
Do not write a broad guideline summary.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function attendingPlanPrompt(context) {
  return buildPatientPrompt(
    context,
    `${taskBoundary({
  primary: "Using OpenEvidence, provide evidence-supported management recommendations for the de-identified case below, based on current guidelines and literature.",
  notFor: [
    "a compact rounds presentation script",
    "a medication-only safety check",
    "a teaching handout",
    "a discharge logistics checklist"
  ]
})}

<clinical_question>
What do current guidelines and literature recommend for management approach, diagnostic workup, monitoring/escalation thresholds, and factors that would change the plan for each active problem in this case? Use OpenEvidence's current guideline/literature access for recommendation support and thresholds.
</clinical_question>`,
    `<output_format>
Use concise bullets only.
Organize by active problem.
For each problem, include management recommendations, diagnostic workup, monitoring/escalation thresholds, and what would change the plan.
For each recommendation, include an inline citation to the latest guideline or literature OpenEvidence can support.
State uncertainty explicitly and avoid inventing orders or facts.
Do not write a full SOAP note; focus on management.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function teachingPrompt(context) {
  return buildPatientPrompt(
    context,
    `${taskBoundary({
  primary: "Using OpenEvidence, explain the clinical reasoning for the de-identified case below in SOAP format, suitable for a new third-year medical student learning the case.",
  notFor: [
    "a directive attending plan",
    "a medication safety audit",
    "a guideline citation audit",
    "a discharge readiness checklist",
    "a blind-spot review"
  ]
})}

<clinical_question>
Explain this case following the full SOAP structure. Expand medical abbreviations, define terms, and explain why each clinically important detail matters. Reference supporting evidence or guidelines where applicable.
</clinical_question>`,
    `<output_format>
Use SOAP headings:
I. SUBJECTIVE
II. OBJECTIVE
III. ASSESSMENT AND PLAN
Within each section, use bullets with short explanations in plain language for a brand-new third-year medical student.
Spell out all non-obvious abbreviations and briefly define them on first use.
Explain the clinical reasoning behind important symptoms, exam findings, lab trends, imaging, medications, and management choices.
Include enough background for the learner to understand the case, but keep it patient-specific rather than a generic textbook chapter.
Do not include a reading plan or external links unless directly needed to explain a cited management recommendation.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function dischargePrompt(context) {
  return buildPatientPrompt(
    context,
    `${taskBoundary({
  primary: "Using OpenEvidence, identify evidence-supported discharge readiness and transition safety considerations for the de-identified case below.",
  notFor: [
    "a full inpatient assessment and plan",
    "a medication-only safety audit except discharge medications and supplies",
    "a teaching handout",
    "a general blind-spot review",
    "a guideline currency audit"
  ]
})}

<clinical_question>
What evidence or guidelines inform discharge readiness, transition barriers, follow-up, supplies, counseling, and unresolved safety issues for the clinical scenario described below?
</clinical_question>`,
    `<output_format>
Use at most 5 bullets total.
Prefix every bullet with BARRIER, SUPPLY, FOLLOW-UP, COUNSEL, or RETURN.
Include only discharge-limiting barriers, medication/supply/access issues, follow-up or handoff needs, counseling that changes safety, or return precautions.
Do not include inpatient tasks unless they determine discharge readiness.
Do not include citations or a reference list. Do not include source names, journal names, society names, evidence grades, or bracketed citation markers.
Do not rewrite the inpatient plan except where it directly affects discharge readiness.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function missingPrompt(context) {
  return buildPatientPrompt(
    context,
    `${taskBoundary({
  primary: "Using OpenEvidence, provide a second-look audit of the de-identified case below that finds evidence-supported omissions not already covered by other specialized reviews.",
  notFor: [
    "a complete rounds report",
    "a full attending assessment and plan",
    "a medication-only audit unless a medication issue is a major blind spot",
    "a guideline citation review",
    "a teaching guide",
    "a discharge checklist unless discharge is the main blind spot"
  ]
})}

<clinical_question>
Find evidence-supported blind spots for this case: diagnostic considerations, monitoring gaps, red flags, missing follow-up data, communication gaps, and escalation triggers. For each point, cite the relevant evidence or guideline.
</clinical_question>`,
    `<output_format>
Use at most 5 bullets total.
Prefix every bullet with MISS, VERIFY, ESCALATE, ASK, or UNVALIDATED GAP.
Include only true blind spots that could change diagnosis, treatment, monitoring, escalation, disposition, communication, or local checklist review.
Only use ASK when the answer requires team judgment or unavailable context. Put self-checkable facts under VERIFY.
Label every bedside checklist addition idea with the UNVALIDATED GAP prefix.
Include an inline citation for each evidence-based point.
Do not include low-yield distractions or padding.
</output_format>

${PLAIN_OPEN_EVIDENCE_OUTPUT}`
  );
}

function checklistImprovementPrompt(context) {
  const sectionKey = clean(context.checklistSectionKey) || "physical_exam";
  const isAll = sectionKey === "all_sections";
  const sectionLabel = isAll
    ? "history_questions and physical_exam"
    : sectionKey === "physical_exam"
      ? "physical exam"
      : "history";
  const clinicalQuestion = isAll
    ? `<clinical_question>
Clinical question: For this de-identified patient, what bedside history and physical exam considerations would improve clinical verification of the selected workup?
Focus on source-backed bedside findings, severity signals, safety checks, contraindications, escalation triggers, and redundant rows. Keep the answer plain-language.
</clinical_question>

<task_boundary>
Primary purpose: Evidence and guideline clarification for bedside checklist review.
Do not use this task for: JSON, patch objects, app schema output, checklist regeneration, default workup edits, or chart summaries.
</task_boundary>`
    : `<clinical_question>
Clinical question: For this de-identified patient, what bedside ${sectionLabel} considerations would improve clinical verification of the selected workup?
Focus on source-backed bedside findings, severity signals, safety checks, contraindications, escalation triggers, and redundant rows. Keep the answer plain-language.
</clinical_question>

<task_boundary>
Primary purpose: Evidence and guideline clarification for bedside checklist review.
Do not use this task for: JSON, patch objects, app schema output, checklist regeneration, default workup edits, or chart summaries.
</task_boundary>`;
  return [
    clinicalQuestion,
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    block("deidentified_patient_context", context.checklistPatientSummary),
    block("objective_data", context.objectiveData),
    block("new_bedside_findings", context.compiledFindings),
    block("current_checklist", context.currentChecklist),
    block("local_checklist_audit", context.checklistAuditSummary),
    block("clinician_refinement_notes", context.refinementNotes),
    `<privacy_boundary>
Use only the de-identified patient context, objective data, bedside findings, and current checklist provided above. Do not invent identifiers, exact dates, room numbers, or facts not supported by the context.
</privacy_boundary>

<output_format>
Return plain-language clinical guidance only.
Do not return JSON, fenced code, patch objects, app-specific schemas, item IDs, or machine-readable output.
Use concise bullets under these headings:
1. Evidence-backed bedside additions to consider
2. Existing checklist rows to de-emphasize or avoid if redundant
3. Safety, contraindication, escalation, or exception notes
4. Source-backed uncertainty or what the care team must verify
Name the target section as ${sectionLabel}, but do not rewrite the checklist for this app.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

function decisionTreeBuilderPrompt(context) {
  const workupTitle = clean(context.selectedWorkupTitle) || "[INSERT WORKUP TITLE]";
  const workupId = clean(context.selectedWorkupId) || "[INSERT WORKUP ID]";
  return `Using OpenEvidence, answer a plain-language clinical pathway question for the selected workup.

Workup:
WORKUP_TITLE: ${workupTitle}
WORKUP_ID: ${workupId}

<clinical_question>
What evidence-backed management pathway considerations, escalation thresholds, contraindications, exceptions, reassessment points, and disposition considerations should a clinician know for this workup?
</clinical_question>

<guidance>
Use current guidelines and citeable literature when available. If thresholds, doses, or monitoring intervals vary by guideline, say so and name the dependency. Keep the answer clinically actionable but not app-specific.
</guidance>

Do not include:
- JSON
- fenced code blocks
- clinical_pathway_tree_v1 or clinical_pathway_tree_v2
- node IDs, edge labels, or app schema fields
- instructions for this app to parse
- a full chart summary

Instead:
- State who enters the pathway.
- Identify unstable/red-flag findings that require immediate escalation.
- Summarize classification or diagnostic criteria only when they change management.
- Name safety stops or contraindications before treatment.
- Summarize first-line management, reassessment, response targets, escalation triggers, and disposition.
- Include concise citations or source names when OpenEvidence can support them.

<output_format>
Plain-language bullets only. Do not produce machine-readable output.
${PLAIN_OPEN_EVIDENCE_OUTPUT}
</output_format>`;
}

export const openEvidenceTasks = [
  { id: "initial_rounds_report", label: "Concise rounds report", category: "Rounds", requiredContext: "source", outputKind: "rounds_report", pasteBackSchema: "", promptBuilder: initialRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Initial rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "full_rounds_report", label: "Full rounds report", category: "Rounds", requiredContext: "source", outputKind: "full_rounds_report", pasteBackSchema: "", promptBuilder: fullRoundsReportPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Full rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "final_rounds_update", label: "Final rounds update", category: "Rounds", requiredContext: "findings", outputKind: "rounds_update", pasteBackSchema: "", promptBuilder: finalRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Final rounds update prompt copied. Paste it into OpenEvidence.", requiresSameConversation: true },
  { id: "checklist_improvement_review", label: "Checklist evidence review", category: "Checklist", requiredContext: "checklist_refinement", outputKind: "checklist_evidence_review", pasteBackSchema: "", promptBuilder: checklistImprovementPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Checklist evidence-review prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "decision_tree_builder", label: "Pathway evidence review", category: "Pathway", requiredContext: "decision_tree", outputKind: "pathway_evidence_review", pasteBackSchema: "", promptBuilder: decisionTreeBuilderPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Pathway evidence-review prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "medication_safety", label: "Medication safety", category: "Safety", requiredContext: "medication_context", outputKind: "medication_safety", pasteBackSchema: "", promptBuilder: medicationSafetyPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Medication safety prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "find_exception", label: "Find exception", category: "Guidelines", requiredContext: "source", outputKind: "guideline_exceptions", pasteBackSchema: "", promptBuilder: exceptionPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Exception-finding prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "attending_plan", label: "Attending-level plan", category: "Reasoning", requiredContext: "source", outputKind: "attending_plan", pasteBackSchema: "", promptBuilder: attendingPlanPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Attending-level plan prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "teaching_explanation", label: "Teaching explanation", category: "Teaching", requiredContext: "source", outputKind: "teaching", pasteBackSchema: "", promptBuilder: teachingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Teaching explanation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "discharge_checklist", label: "Discharge readiness review", category: "Discharge", requiredContext: "source", outputKind: "discharge_checklist", pasteBackSchema: "", promptBuilder: dischargePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Discharge readiness prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "what_am_i_missing", label: "What am I missing?", category: "Safety", requiredContext: "source", outputKind: "missing_items", pasteBackSchema: "", promptBuilder: missingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Blind-spot prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false }
];

export function getOpenEvidenceTask(taskId) {
  return openEvidenceTasks.find((task) => task.id === taskId) || null;
}

export function buildOpenEvidencePrompt(taskId, context = {}) {
  const task = getOpenEvidenceTask(taskId);
  if (!task) {
    throw new Error(`Unknown OpenEvidence task: ${taskId}`);
  }
  const compactContext = compactOpenEvidenceContext(context, task.id);
  const prompt = task.promptBuilder(compactContext);
  const promptIncludesSource = /<source_context>/i.test(prompt);
  const promptIncludesChecklist = /<current_checklist>/i.test(prompt);
  const promptIncludesPatientContext = /<deidentified_patient_context>/i.test(prompt);
  const promptIncludesFindings = /<new_bedside_findings>/i.test(prompt);
  const promptIncludesObjective = /<objective_data>/i.test(prompt);
  const promptIncludesPathwayTemplate = /(?:Generate an up-to-date clinical management pathway for:|Create a concise, guideline-based management pathway for:|Create a protocol-style decision tree for:)/i.test(prompt);
  const promptIncludesWorkupTitle = /<selected_workup_title>/i.test(prompt) || promptIncludesPathwayTemplate;
  const promptIncludesWorkupId = /<selected_workup_id>/i.test(prompt) || (promptIncludesPathwayTemplate && /"workupId":/i.test(prompt));
  const promptIncludesNewObjective = promptIncludesPathwayTemplate && /Objective workup data, if available:/i.test(prompt);
  const promptIncludesDecisionTree = /<existing_decision_tree_json>/i.test(prompt) || /<decision_tree_json>/i.test(prompt) || (promptIncludesPathwayTemplate && /Existing pathway JSON, if available:/i.test(prompt));
  const sourceIncluded = promptIncludesSource || promptIncludesChecklist || promptIncludesPatientContext || promptIncludesFindings || promptIncludesObjective || promptIncludesNewObjective || promptIncludesWorkupTitle || promptIncludesWorkupId || promptIncludesDecisionTree;
  const reviewText = [
    promptIncludesSource ? compactContext.sourceContext : "",
    promptIncludesPatientContext ? compactContext.checklistPatientSummary : "",
    promptIncludesChecklist ? compactContext.currentChecklist : "",
    promptIncludesFindings ? compactContext.compiledFindings : "",
    promptIncludesObjective || promptIncludesNewObjective ? compactContext.objectiveData : "",
    promptIncludesWorkupTitle ? compactContext.selectedWorkupTitle : "",
    promptIncludesWorkupId ? compactContext.selectedWorkupId : "",
    promptIncludesDecisionTree ? compactContext.decisionTreeJson : ""
  ].filter((value) => clean(value)).join("\n\n");
  return {
    taskId: task.id,
    label: task.label,
    category: task.category,
    requiredContext: task.requiredContext,
    outputKind: task.outputKind,
    prompt,
    contextText: compactContext.sourceContext || compactContext.checklistPatientSummary || compactContext.currentChecklist || compactContext.compiledFindings || "",
    reviewScope: sourceIncluded ? "custom" : "source-free",
    reviewText: sourceIncluded ? reviewText : "",
    copySuccessMessage: task.copySuccessMessage,
    requiresSameConversation: task.requiresSameConversation,
    sameConversationReady: Boolean(compactContext.sameConversationReady),
    pasteBackParser: (text) => task.pasteBackParser(task, text, compactContext)
  };
}
