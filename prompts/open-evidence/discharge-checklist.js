import { PLAIN_OPEN_EVIDENCE_OUTPUT, buildPatientPrompt, taskBoundary } from "./shared.js";

export function dischargePrompt(context) {
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
