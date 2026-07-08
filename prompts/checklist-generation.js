// Prompt text for the local (non-OpenEvidence) bedside checklist generation
// contract. Not currently wired into index.html's live UI — kept for the
// scripts/tests that still exercise this generation path (see
// scripts/build-qr-zstd-dictionary.js, tests/test-checklist.js,
// tests/test-continuity.js).

export const checklistContract = `Return plain text only.
Return exactly two parent checklists in this order:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST

Parent checklist titles must be the exact all-caps lines above, with no colon.
Subheadings must be all-caps lines with no punctuation.
Every checklist item must be one line in this exact format:
Label: Option A / Option B / Option C

Bedside labels must be direct patient questions ending in ? before the colon.
Exam labels must be concise clinician-observed findings.
Use structured slash-separated options whenever possible.
Options must be item-specific: include relevant symptom states, location, laterality, severity, duration, trajectory, quantification, or unable-to-assess choices for that exact row.
Do not use generic-only options such as Yes / No / Unsure / Other ___, Normal / Abnormal, Present / Absent, Improved / Same / Worse, or ___ alone.
Use ___ only for a short free-text detail, and put it at the end of the option or item.
Do not use blank numerator formats such as ___ / 5, ___/10, or ___ / ___.
Do not use markdown, bullets, numbering, tables, explanations, citations, or text before or after the two checklists.`;

const studentExamReferenceFallback = `Student exam reference (student_exam_reference; optional reminder, not exhaustive):
These are locally reviewed examples from the student's learned physical exam toolkit. Use them only as a compatibility fallback and completeness check for maneuvers already supported by the reviewed patient context.
Do not add unvalidated checklist items as final checklist rows. If a clinically important question or maneuver is missing from validated local material, omit it from the two checklists and treat it as a catalog gap for reviewer follow-up.
Use the reference to avoid missing relevant student-performable maneuvers, then choose the final concise checklist from reviewed patient context, installed clinical workup modules, validated clinical intents, or retrieved evidence candidates.`;

export const checklistPrompt = `Local bedside checklist generation contract for a third-year medical student preparing for inpatient rounds. Use the app's reviewed patient context, installed clinical workup modules, validated clinical intents, and retrieved evidence candidates to create a focused bedside pre-rounding checklist for clinician review. Do not ask OpenEvidence or another external system to generate this bedside checklist.

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

${studentExamReferenceFallback}

Output format rules:
${checklistContract}

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

Before you finish, check that both parent checklist titles are present, every bedside label ends in a question mark before the colon, no bedside item is a physical exam command, the bedside checklist has 6 to 24 items, the exam checklist has 12 to 18 items or up to 22 only for complex multi-system patients, no exam subsection has more than 5 items, every item is parseable as Label: options, and no item uses generic-only options.`;

export const newAdmissionChecklistPrompt = `${checklistPrompt}

New admission focus:
No prior subjective/objective/assessment/plan note is available. The patient is newly admitted or being admitted now.
Use the bedside questions to fill the highest-yield remaining gaps for a full first-history admission write-up: chief complaint, history of present illness timing and symptom character, relevant past medical history, medications, allergies, surgical history, health maintenance, family history, social history, review of systems positives and negatives, function, safety, and patient concerns.
Prefer broad, patient-friendly questions with structured answer choices so the student can capture a lot with minimal typing.
`;

export function buildCleanupPrompt(rawChecklist, auditResult, options = {}) {
  const issueText = auditResult?.issues?.length
    ? auditResult.issues.map((issue) => `- ${issue.message}`).join("\n")
    : "- Shorten and organize the checklist into the required bedside-first format.";
  const userContext = options.userContext || "";

  return `You are an experienced attending physician and clerkship coach. Rewrite the checklist below so it is shorter, bedside-first, and fully parseable by a checklist app.${userContext ? `\n\n${userContext}` : ""}

Fix these issues:
${issueText}

Rules:
${checklistContract}

Checklist to rewrite:
${String(rawChecklist || "").trim()}`;
}
