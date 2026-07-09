<scope>
What to answer: Using OpenEvidence, produce an attending-level discharge plan for the de-identified case below, assuming discharge criteria are met: medication reconciliation and instructions, follow-up, activity/diet/work restrictions, pending-result follow-up, and return precautions.
Do not include:
- assessing whether the patient is ready for discharge; use the discharge readiness review for that
- a full inpatient assessment and plan
- a medication-only safety audit
- a teaching handout
- a guideline currency audit
</scope>

<clinical_question>
Assuming this patient is ready for discharge, what does the discharge plan need to include: medication reconciliation (continue/stop/start/dose-change with reason for each active medication), follow-up appointments and timing, activity/diet/work restrictions, a plan for any pending results, and specific return precautions? Use OpenEvidence's current guideline/literature access for medication safety and follow-up-interval support.
</clinical_question>

{{EVIDENCE_GUARDRAILS}}

{{USER_CONTEXT}}

{{CONTEXT_SECTION}}

<output_format>
Use concise bullets only, organized exactly as:
MEDICATIONS
- Continue / stop / start / dose-change for each active or discharge-relevant medication, with a one-line reason for each change
- Home-medication conflicts, duplications, or renal/hepatic dose adjustments to resolve before discharge
FOLLOW-UP
- Who to follow up with, what for, and the target timeframe
ACTIVITY, DIET, AND WORK/SCHOOL RESTRICTIONS
- Specific restrictions and duration, only when supported by the case
PENDING RESULTS
- Any results still pending at discharge and who is responsible for following up
RETURN PRECAUTIONS
- Specific symptoms or findings that should prompt return, and where to go
For each medication or follow-up recommendation, include an inline citation to current guideline or literature when OpenEvidence can support it.
State uncertainty explicitly and avoid inventing orders, appointments, or facts not supported by the context.
Do not restate the inpatient assessment and plan; focus only on the discharge plan.
</output_format>

{{PLAIN_OPEN_EVIDENCE_OUTPUT}}
