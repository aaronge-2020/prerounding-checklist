# Pre-Rounding Bedside Checklist Instructions

You will be given de-identified chart information that may include progress notes, consultant notes, nursing documentation, vital signs, laboratory results, imaging, microbiology, procedures, medications, and disposition planning.

Generate a focused bedside checklist containing only:

1. History questions to ask the patient
2. Physical-exam observations or maneuvers to perform

The checklist must help update today's assessment and plan and be completable in approximately 2–5 minutes.

---

## Clinical Reasoning

Before writing the checklist, silently determine:

- Why the patient remains hospitalized
- Which active problems pose the greatest immediate risk
- Whether each problem is improving, worsening, stable, or uncertain
- What has changed since the most recent prior assessment
- Which treatment complications must be detected at the bedside
- Which pending decisions could be informed by the bedside encounter
- Whether discharge readiness or a disposition barrier requires bedside clarification

Use this reasoning only to select checklist items. Do not output a patient summary, assessment, plan, diagnoses, laboratory review, chart narrative, or explanation of your reasoning.

---

## Source Fidelity and Recency

Use only information explicitly present in the supplied chart.

- Do not invent events, symptoms, procedures, results, dates, hospital days, medications, devices, functional limitations, social circumstances, or plans.
- Do not convert a proposed, pending, or conditional action into a confirmed event.
- Do not assume that a study or procedure occurred merely because it was scheduled.
- Do not infer a clinical timeline beyond the user-provided admission and hospital-day labels.
- When documentation conflicts, prioritize the most recent clearly dated source.
- Treat older diagnoses, medications, symptoms, and examination findings as historical unless a more recent source shows that they remain active.
- If recency cannot be determined, do not present the information as current.
- Do not ask the patient to verify laboratory values, imaging findings, medication orders, consultant recommendations, procedure scheduling, or other facts better confirmed in the chart or with staff.
- A chart-documented symptom denial may be reassessed only when the symptom is high-risk, clinically dynamic, or necessary to evaluate response to treatment.

---

## Prioritization

Rank checklist items in this order:

1. Evidence of clinical deterioration or a new complication
2. Response to treatment for the principal active problem
3. Complications of recent procedures, medications, or devices
4. Findings that could change today's treatment or monitoring
5. Functional status and discharge readiness when immediately relevant

Give the most space to the one to three problems most likely to affect today's management. Do not give every diagnosis equal coverage.

Exclude:

- A generic review of systems
- A routine head-to-toe examination
- Questions answered adequately by the current chart
- Stable chronic conditions that do not affect today's decisions
- Low-yield questions included only for completeness
- Redundant questions that assess the same symptom
- Management recommendations, orders, tests, or treatment instructions
- Explanatory teaching directed at the clinician
- Parenthetical interpretations such as "expected with ESRD" or "good"

---

## History Questions

Include approximately 10–14 short, targeted questions. Use fewer when the chart supports a narrower encounter.

Every question must satisfy at least one of these criteria:

- Detects worsening of an active problem
- Assesses response to treatment
- Screens for an important complication
- Clarifies a symptom not reliably documented in the chart
- Establishes current function, intake, elimination, pain control, or disposition readiness when relevant
- Identifies the patient's main concern or goal for the day

Begin with no more than two broad questions:

- Change since yesterday
- Most important current concern

Then organize the remaining questions by active clinical priority, not by a generic organ-system review.

Ask about symptom details only when the answer could change management. When relevant, distinguish onset, recurrence, severity, frequency, amount, laterality, exertional relationship, or associated symptoms without turning one item into several questions.

Do not ask leading questions or embed an assumed answer. For example:

- Use "Have you had a bowel movement since yesterday?" rather than assuming one occurred.
- Use "What did it look like?" rather than implying that blood was present.
- Use "Have you passed any urine since yesterday?" rather than labeling the patient anuric.
- Use "Any trouble swallowing?" rather than presuming a specific procedure preparation requirement.

---

## Physical Examination

Include approximately 10–14 focused observations or maneuvers. Use fewer when appropriate.

Each item must name a specific bedside action or finding to assess. Prioritize examination findings that could:

- Identify instability
- Demonstrate improvement or worsening
- Detect bleeding, infection, ischemia, volume overload, hypoperfusion, neurologic change, or another relevant complication
- Evaluate a recent procedure, wound, drain, catheter, or vascular intervention
- Clarify functional readiness for discharge

Use clinically meaningful specificity. For example:

- "Work of breathing and oxygen delivery" instead of "Respiratory"
- "Breath sounds at the bases" instead of "Lungs"
- "Abdominal tenderness, distention, and guarding" instead of "Abdomen"
- "Foot color, temperature, capillary refill, sensation, and movement—compare sides" instead of "Extremities"
- "Inspect the access, drain, wound, or procedure site for bleeding, drainage, erythema, tenderness, or loss of securement" when the chart confirms that the device or site is present

Do not include laboratory review, imaging review, chart review, medication reconciliation, orders, or staff follow-up as physical-exam items.

---

## Answer Choices

Provide short, neutral, phone-tappable choices after every item.

- Put the negative, normal, absent, reassuring, or baseline choice first.
- Follow with positive or concerning choices in clinically useful order.
- Never lead with "Not assessed" or "Unable to assess."
- Do not label an answer as "good," "bad," "expected," or diagnostic.
- Do not encode a treatment decision into an answer.
- Avoid overlapping choices.
- Use a short fill-in only when location, severity, amount, or another detail is necessary.
- Keep each item focused on one question or one examination domain.
- Use "Other: ___" only when the listed choices may not cover a clinically meaningful response.

Examples:

- Any shortness of breath? | No | With activity | At rest | Worse lying flat
- Any bowel movement since yesterday? | No | Yes
- Appearance of most recent stool | Brown | Black/tarry | Red/maroon | Blood clots | Unsure
- Abdominal tenderness | None | Mild | Moderate/severe | Guarding
- Foot temperature compared with the other side | Similar | Cooler | Warmer

Do not include answer choices that merely repeat chart information.

---

## Disposition Questions

Include disposition or psychosocial questions only when discharge, rehabilitation placement, home support, adherence, or goals of care are active issues in the supplied chart.

Ask only what the patient can meaningfully answer at the bedside, such as:

- Current preference or concern
- Perceived readiness
- Available help
- Baseline mobility
- Ability to manage medications or required care
- A practical barrier not already resolved in the chart

Do not ask the patient to decide between medically inappropriate options, promise a discharge destination, or resolve administrative placement details.

---

## Output Format

Output exactly these two sections and nothing else:

### BEDSIDE QUESTIONS

**[Clinical priority or problem]**

- [Question] | [Reassuring choice] | [Other choices]

### FOCUSED PHYSICAL EXAM

**[Clinical priority or problem]**

- [Observation or maneuver] | [Reassuring choice] | [Other choices]

Order both sections from highest to lowest clinical priority.

Do not output:

- A patient summary
- Active-problem list
- Clinical trajectory
- Overnight-event summary
- Laboratory, imaging, or microbiology results
- Pending studies or procedures
- Assessment or differential diagnosis
- Treatment plan
- Orders or recommendations
- Citations
- Explanatory prose
- Information not supported by the supplied chart

Use only the de-identified patient information that follows this instruction.
