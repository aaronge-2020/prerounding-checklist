import { NOTE_STANDARD_GUIDANCE, PLAIN_OPEN_EVIDENCE_OUTPUT, buildPatientPrompt, taskBoundary } from "./shared.js";

export function initialRoundsPrompt(context) {
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
