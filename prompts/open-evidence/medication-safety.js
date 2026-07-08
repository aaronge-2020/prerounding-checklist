import { PLAIN_OPEN_EVIDENCE_OUTPUT, buildPatientPrompt, buildSameConversationPrompt, taskBoundary } from "./shared.js";

export function medicationSafetyPrompt(context) {
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
