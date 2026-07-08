import { PLAIN_OPEN_EVIDENCE_OUTPUT, buildPatientPrompt, taskBoundary } from "./shared.js";

export function teachingPrompt(context) {
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
