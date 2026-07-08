import { EVIDENCE_GUARDRAILS, NOTE_STANDARD_GUIDANCE, PLAIN_OPEN_EVIDENCE_OUTPUT, findingsContextBlock, taskBoundary } from "./shared.js";

export function finalRoundsPrompt(context) {
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
