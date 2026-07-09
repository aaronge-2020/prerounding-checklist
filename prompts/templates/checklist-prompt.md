Local bedside checklist generation contract for a third-year medical student preparing for inpatient rounds. Use the app's reviewed patient context, installed clinical workup modules, validated clinical intents, and retrieved evidence candidates to create a focused bedside pre-rounding checklist for clinician review. Do not ask OpenEvidence or another external system to generate this bedside checklist.

The checklist should help me identify today's clinical trajectory, severity, red flags, response to treatment, functional status, discharge readiness, and management-relevant changes.

Please include exactly two plain-text checklists:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST

Bedside question checklist:
- Include 6 to 24 true history questions that I can say out loud to the patient. Use more rows when that is needed to keep each question atomic and clinically usable.
- Use patient-friendly language with no medical jargon.
- Focus on symptoms, changes since arrival or yesterday, breathing, pain, weakness, dizziness, intake/output, bowel/bladder changes, mobility, function, safety, treatment access, discharge readiness, and the patient's concerns.
- Do not include physical exam maneuvers, clinician-observed findings, or performance commands.
- Do not ask the patient to squeeze, lift, wiggle, count aloud, cough on command, stick out the tongue, follow a finger, walk, stand, or perform a physical exam task.
- Make each row's options specific to that question rather than generic yes/no controls. For symptoms, include the named symptom, severity/trajectory, timing, location, or treatment/access state when relevant.
- When the patient might answer outside the choices, include Other ___ as the final option.

Targeted physical exam checklist:
- Include 12 to 18 focused exam findings total. For complex multi-system patients, you may include up to 22 when each item could affect management today.
- Choose findings from the patient's active problems, abnormal vitals/labs/trends, consult question, treatments, devices/support, and likely complications.
- Group findings by exam system or exam type, with no more than 5 items in any one exam subsection.
- Prefer grouped screening findings over exhaustive right-left inventories.
- Do not treat vital signs, oxygen saturation, current weight, glucose, or other basic measurements as physical exam maneuvers. Those belong in basic bedside data or safety checks.
- Include devices/support, volume status, cardiopulmonary status, abdominal findings, neurologic findings, wounds/lines/drains, functional safety, or other problem-specific findings only when relevant and traceable to reviewed local context.
- Use the student exam reference below as a completeness check for exam maneuvers I have learned, but do not use it to authorize unvalidated final rows.
- Write documentation-ready findings, not technique instructions.
- Make each exam row's options specific to the finding. For example, edema options should let the user record severity and location/laterality, not just present/absent.

If a <validated_clinical_intents> block is present, use those manually validated intents as the authority for bedside question and exam scope. Prefer relevant retrieved candidate bedside question labels/options and targeted exam labels/options when they fit the patient, and improve unclear wording or option choices when clinically better. Do not add unvalidated checklist items as final checklist rows. If you notice a clinically important gap that is not supported by the validated intents or retrieved candidates, omit it from the final two-section checklist and treat it as a gap suggestion for app-side review rather than silently inserting it.

If a <retrieved_evidence_candidates> block is present without a validated intent block, treat it as a reviewer-only evidence context and completeness check. Prefer relevant candidate bedside question labels/options and targeted exam labels/options only when they are also supported by reviewed patient context. Do not add unvalidated checklist items as final checklist rows. If a clinically important item is missing from the retrieved candidates, treat it as a catalog gap rather than inserting it into the final checklist. Do not copy low-relevance candidates merely because they were retrieved. Do not include citations or rationale text in the final checklist.

Do not include generic review-of-systems questions, a full head-to-toe exam, teaching, explanations, citations, caveats, or oral presentation text.
Do not mention de-identification.

{{STUDENT_EXAM_REFERENCE}}

Output format rules:
{{CHECKLIST_CONTRACT}}

Example format:
BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Since yesterday, how has the main symptom changed?: Resolved / Improving / Same / Worse / New severe symptom / Other ___
Have you noticed any new or worsening symptom?: No new symptom / New symptom / Worsening symptom / Unsure / Other ___
FUNCTION AND SAFETY
Have you been able to get out of bed safely?: Baseline / Needs help / Not safe / Not tried / Other ___
What is your main concern today?: Symptom concern / Treatment concern / Discharge concern / Question for team / Other ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Work of breathing: Normal / Mildly increased / Markedly increased
Lung exam: Clear / Crackles / Wheezes / Diminished

Before you finish, check that both parent checklist titles are present, every bedside label ends in a question mark before the colon, no bedside item is a physical exam command, the bedside checklist has 6 to 24 items, the exam checklist has 12 to 18 items or up to 22 only for complex multi-system patients, no exam subsection has more than 5 items, every item is parseable as Label: options, and no item uses generic-only options.