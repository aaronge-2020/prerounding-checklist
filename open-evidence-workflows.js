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

const roundsPasteBackContract = `<local_app_paste_back_contract>
After the human-readable rounds presentation, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "open_evidence_rounds_pasteback_v1" and this shape:
{"schema":"open_evidence_rounds_pasteback_v1","presentationType":"oral_rounds_soap","oneLiner":"","subjective":[],"objective":[],"assessmentPlan":[],"followUpTasks":[],"bedsideRecheck":[],"plainTextSummary":""}
Each array item must be a concise de-identified string. Put only facts or recommendations already supported by the prompt or current OpenEvidence citations.
</local_app_paste_back_contract>`;

const medicationSafetyPasteBackContract = `<local_app_paste_back_contract>
After the human-readable safety audit, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "medication_safety_pasteback_v1" and this shape:
{"schema":"medication_safety_pasteback_v1","issues":[],"plainTextSummary":""}
Each issue must be a concise de-identified string prefixed with VERIFY, HOLD/RESTART, DOSE, INDICATION, INTERACTION, MONITOR, or ESCALATE, stating the medication, the concern, and why it matters.
</local_app_paste_back_contract>`;

const guidelineExceptionsPasteBackContract = `<local_app_paste_back_contract>
After the human-readable list, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "guideline_exceptions_pasteback_v1" and this shape:
{"schema":"guideline_exceptions_pasteback_v1","exceptions":[],"plainTextSummary":""}
Each exception must be a concise de-identified string prefixed with EXCEPTION, CONTRAINDICATION, PREREQUISITE, or SPECIAL-POPULATION.
</local_app_paste_back_contract>`;

const attendingPlanPasteBackContract = `<local_app_paste_back_contract>
After the human-readable plan, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "open_evidence_rounds_pasteback_v1" and this shape:
{"schema":"open_evidence_rounds_pasteback_v1","presentationType":"attending_plan","oneLiner":"","subjective":[],"objective":[],"assessmentPlan":[],"followUpTasks":[],"bedsideRecheck":[],"plainTextSummary":""}
assessmentPlan entries are the management recommendations per problem. Each array item must be a concise de-identified string.
</local_app_paste_back_contract>`;

const teachingExplanationPasteBackContract = `<local_app_paste_back_contract>
After the human-readable teaching report, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "open_evidence_rounds_pasteback_v1" and this shape:
{"schema":"open_evidence_rounds_pasteback_v1","presentationType":"teaching_explanation","oneLiner":"","subjective":[],"objective":[],"assessmentPlan":[],"followUpTasks":[],"bedsideRecheck":[],"plainTextSummary":""}
Each array item must be a concise de-identified teaching point string.
</local_app_paste_back_contract>`;

const dischargeReadinessPasteBackContract = `<local_app_paste_back_contract>
After the human-readable list, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "discharge_readiness_pasteback_v1" and this shape:
{"schema":"discharge_readiness_pasteback_v1","barriers":[],"supplies":[],"followUpNeeds":[],"counseling":[],"returnPrecautions":[],"plainTextSummary":""}
Each array item must be a concise de-identified string.
</local_app_paste_back_contract>`;

const blindSpotPasteBackContract = `<local_app_paste_back_contract>
After the human-readable list, include exactly one fenced JSON block labeled APP_PASTE_BACK_JSON.
The JSON must use schema "blind_spot_pasteback_v1" and this shape:
{"schema":"blind_spot_pasteback_v1","misses":[],"verifies":[],"escalations":[],"asks":[],"unvalidatedGaps":[],"plainTextSummary":""}
Each array item must be a concise de-identified string.
</local_app_paste_back_contract>`;

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

${roundsPasteBackContract}`
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

${roundsPasteBackContract}`
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
Use concise bullets only.
Use the case context already provided earlier in this conversation; do not repeat stable background.
Organize exactly as:
I. SUBJECTIVE - only new symptoms, interval events, or patient-reported changes
II. OBJECTIVE - only new vitals, exam changes, labs/trends, imaging, medication administrations, or procedures
III. ASSESSMENT AND PLAN - each bullet must state what changed in the last 24 hours and whether/how it changes management
Include "no management change" only when a new result might otherwise appear to require action.
Use inline guideline/literature citations only for new management recommendations or changed thresholds.
</output_format>

${roundsPasteBackContract}`
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

${medicationSafetyPasteBackContract}`;
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

${guidelineExceptionsPasteBackContract}`
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

${attendingPlanPasteBackContract}`
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

${teachingExplanationPasteBackContract}`
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

${dischargeReadinessPasteBackContract}`
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

${blindSpotPasteBackContract}`
  );
}

function checklistImprovementPrompt(context) {
  const workupId = clean(context.selectedWorkupId) || "selected local workup id if known";
  const sectionKey = clean(context.checklistSectionKey) || "physical_exam";
  const isAll = sectionKey === "all_sections";
  const exampleSectionKey = isAll ? "physical_exam" : sectionKey;
  const sectionLabel = isAll
    ? "history_questions and physical_exam"
    : sectionKey === "physical_exam"
      ? "physical exam"
      : "history";
  const clinicalQuestion = isAll
    ? `<clinical_question>
Clinical question: For this de-identified patient, what bedside history and physical exam rows should be added, removed, or reworded across both checklist sections?
Focus on bedside findings, severity signals, safety checks, triggers, and redundant rows. The JSON block is only the paste-back format.
</clinical_question>

<task_boundary>
Primary purpose: Useful bedside checklist edits for one patient.
Do not use this task for: checklist regeneration, default edits, management plans, or chart summaries.
</task_boundary>`
    : `<clinical_question>
Clinical question: For this de-identified patient, what bedside ${sectionLabel} rows should be added, removed, or reworded to improve the selected workup assessment?
Focus on bedside findings, severity signals, safety checks, triggers, and redundant rows. The JSON block is only the paste-back format.
</clinical_question>

<task_boundary>
Primary purpose: Useful bedside checklist edits for one patient.
Do not use this task for: checklist regeneration, default edits, management plans, or chart summaries.
</task_boundary>`;
  const outputSectionRules = isAll
    ? `Return one fenced JSON block per section that needs changes. Each block must set sectionKey to physical_exam or history_questions and use itemIds only from that section in current_checklist.
If both sections need edits, return two fenced JSON blocks.`
    : `Set sectionKey to ${sectionKey}. Use itemIds only from the ${sectionKey} rows in current_checklist. Do not modify rows outside this section.`;
  const outputBlockRule = isAll
    ? "Output one fenced JSON block per section that needs clinically useful checklist edits."
    : "Output only one fenced JSON block with the clinically useful checklist edits.";
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
${outputBlockRule} Do not include prose before or after it. Do not include :contentReference markers or citation prose.
Fence as \`\`\`json. Use literal underscores, not asterisks or HTML emphasis tags. JSON.parse must pass. "operations", "options", and "normalAnswers" must be bracketed arrays.
Use this exact top-level schema:
{
  "schema": "workup_section_patch_v1",
  "workupId": "${workupId}",
  "sectionKey": "${exampleSectionKey}",
  "summary": "Brief reason for the row changes.",
  "operations": [
    {
      "op": "add",
      "groupKey": "conditionalExam",
      "item": {
        "id": "stable_snake_case_id",
        "item_type": "physical_exam_maneuver",
        "label": "Exam item to add",
        "answerMode": "single or multi",
        "options": ["Normal", "Abnormal", "Unable to assess"],
        "normalAnswers": ["Normal"],
        "rationale": "Why this item changes bedside verification or management."
      }
    },
    { "op": "update", "itemId": "exact_existing_itemId", "label": "Revised row text" },
    { "op": "remove", "itemId": "exact_existing_itemId" }
  ]
}
Allowed sectionKey values: history_questions, physical_exam.
${outputSectionRules}
Allowed groupKey values: requiredQuestions or conditionalQuestions for history_questions; requiredExam or conditionalExam for physical_exam.
Allowed op values: add, update, remove.
Add: include groupKey and complete item. Use item_type "history_question" or "physical_exam_maneuver".
Update/remove: use exact itemId from the current checklist. Do not invent IDs for existing rows.
Update: include only changed fields directly on the operation or inside item.
If no changes are useful, return "operations": [].
Do not include identifiers, exact dates, room numbers, medical record numbers, or full chart narrative.
</output_format>`
  ].filter(Boolean).join("\n\n");
}

function decisionTreeBuilderPrompt(context) {
  const workupTitle = clean(context.selectedWorkupTitle) || "[INSERT WORKUP TITLE]";
  const workupId = clean(context.selectedWorkupId) || "[INSERT WORKUP ID]";
  return `Using OpenEvidence, produce a compact, evidence-based clinical management pathway, not a guideline summary.

Create a protocol-style decision tree for:
WORKUP_TITLE: ${workupTitle}
WORKUP_ID: ${workupId}

<guidance>
Style target: AHA/ACLS, UpToDate, or society-protocol algorithm. Each node should be a diagram box a clinician can act on.

Core rule:
A node exists only if it changes management, determines urgency, starts a treatment bundle, stops unsafe treatment, defines reassessment, or determines disposition.
</guidance>

Do not include:
- "missing data" nodes
- generic "assess" nodes
- generic "consider" nodes
- "clinician review" nodes without a specific trigger and action
- one-node-per-lab trees
- one-node-per-criterion trees
- vague endpoints like "treat DKA," "monitor," or "follow up"

Instead:
- Combine related diagnostic criteria in one decision box.
- Combine related treatments into one action box.
- Combine monitoring frequency, response targets, and escalation triggers into one reassessment box.
- Put exact thresholds and doses in the box text when guideline-supported.
- Branch only when the next action is different.

Return only valid JSON.

Schema:
{
  "schema": "clinical_pathway_tree_v2",
  "workupId": "${jsonStringContent(workupId)}",
  "title": "${jsonStringContent(workupTitle)}",
  "style": "compact_protocol_algorithm",
  "source_metadata": [],
  "root": {
    "id": "root",
    "label": "",
    "type": "action",
    "boxText": "",
    "source_ids": [],
    "children": []
  }
}

Every node:
{
  "id": "stable_unique_id",
  "label": "short box title",
  "type": "action | decision | endpoint",
  "boxText": "clinically specific display text; may include multiple bullets or semicolon-separated actions",
  "source_ids": [],
  "children": []
}

Every child of a decision node must include:
"edgeLabel": "specific branch criterion"

Algorithm architecture:
1. Activation box: who enters the pathway.
2. Unstable/red-flag decision: identifies immediate high-acuity care.
3. Classification decision: combines diagnostic criteria that separate major pathways.
4. Safety-stop decision: only if a treatment can cause harm without a prerequisite.
5. Treatment bundle: exact first-line management, doses, thresholds, and exceptions.
6. Reassessment decision: response targets, monitoring frequency, and failure criteria.
7. Transition/disposition endpoint: stopping criteria, discharge/follow-up, safety net.

Quality test before final output:
- Would this fit on one page?
- Is each box worth showing in a diagram?
- Does every branch change management?
- Does every treatment box say exactly what to do?
- Are doses, thresholds, monitoring intervals, escalation triggers, and stopping criteria explicit?
- Are any nodes just documentation, missing-data bookkeeping, or guideline trivia? If yes, delete or merge them.`;
}

export const openEvidenceTasks = [
  { id: "initial_rounds_report", label: "Concise rounds report", category: "Rounds", requiredContext: "source", outputKind: "rounds_report", pasteBackSchema: "open_evidence_rounds_pasteback_v1", promptBuilder: initialRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Initial rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "full_rounds_report", label: "Full rounds report", category: "Rounds", requiredContext: "source", outputKind: "full_rounds_report", pasteBackSchema: "open_evidence_rounds_pasteback_v1", promptBuilder: fullRoundsReportPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Full rounds report prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "final_rounds_update", label: "Final rounds update", category: "Rounds", requiredContext: "findings", outputKind: "rounds_update", pasteBackSchema: "open_evidence_rounds_pasteback_v1", promptBuilder: finalRoundsPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Final rounds update prompt copied. Paste it into OpenEvidence.", requiresSameConversation: true },
  { id: "checklist_improvement_review", label: "Checklist improvement review", category: "Checklist", requiredContext: "checklist_refinement", outputKind: "checklist_improvement_review", pasteBackSchema: "workup_section_patch_v1", promptBuilder: checklistImprovementPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Checklist improvement prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "decision_tree_builder", label: "Decision tree builder", category: "Pathway", requiredContext: "decision_tree", outputKind: "decision_tree_json", pasteBackSchema: "clinical_pathway_tree_v2", promptBuilder: decisionTreeBuilderPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Decision tree builder prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "medication_safety", label: "Medication safety", category: "Safety", requiredContext: "medication_context", outputKind: "medication_safety", pasteBackSchema: "medication_safety_pasteback_v1", promptBuilder: medicationSafetyPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Medication safety prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "find_exception", label: "Find exception", category: "Guidelines", requiredContext: "source", outputKind: "guideline_exceptions", pasteBackSchema: "guideline_exceptions_pasteback_v1", promptBuilder: exceptionPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Exception-finding prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "attending_plan", label: "Attending-level plan", category: "Reasoning", requiredContext: "source", outputKind: "attending_plan", pasteBackSchema: "open_evidence_rounds_pasteback_v1", promptBuilder: attendingPlanPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Attending-level plan prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "teaching_explanation", label: "Teaching explanation", category: "Teaching", requiredContext: "source", outputKind: "teaching", pasteBackSchema: "open_evidence_rounds_pasteback_v1", promptBuilder: teachingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Teaching explanation prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "discharge_checklist", label: "Discharge readiness review", category: "Discharge", requiredContext: "source", outputKind: "discharge_checklist", pasteBackSchema: "discharge_readiness_pasteback_v1", promptBuilder: dischargePrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Discharge readiness prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false },
  { id: "what_am_i_missing", label: "What am I missing?", category: "Safety", requiredContext: "source", outputKind: "missing_items", pasteBackSchema: "blind_spot_pasteback_v1", promptBuilder: missingPrompt, pasteBackParser: parseTaskResult, copySuccessMessage: "Blind-spot prompt copied. Paste it into OpenEvidence.", requiresSameConversation: false }
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
