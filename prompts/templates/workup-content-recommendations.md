<scope>
What to answer: Using OpenEvidence, recommend evidence-supported history questions and physical exam maneuvers for a comprehensive bedside workup for {{WORKUP_TITLE}}.
Do not include:
- a full rounds report or assessment and plan
- diagnostic test or imaging orders
- medication management or safety audit
- a discharge checklist
- management or disposition recommendations
- JSON, fenced code, or structured schema output
</scope>

<clinical_question>
Given the de-identified patient presentation and context below, what focused history questions and bedside physical exam maneuvers are most clinically important for a thorough workup of {{WORKUP_TITLE}}? For each recommendation, explain briefly what it helps distinguish or rule out. Use current evidence and guidelines.
</clinical_question>

{{EVIDENCE_GUARDRAILS}}

{{USER_CONTEXT}}

{{CONTEXT_SECTION}}

<output_format>
Organize your response into two sections:

HISTORY QUESTIONS
- List each bedside history question as a bullet.
- For each: state the question, then briefly note what diagnosis, risk, or management decision it helps clarify.
- Include questions about onset, severity, progression, associated symptoms, relevant risk factors, and prior workup.
- Flag any question where the answer would change immediate management or escalation.

PHYSICAL EXAM MANEUVERS
- List each focused bedside exam maneuver as a bullet.
- For each: name the maneuver, then note what finding or syndrome it assesses.
- Prefer maneuvers performable at bedside by a student or resident without specialized equipment.
- Flag any maneuver where an abnormal finding would change immediate management or escalation.

Use at most 15 bullets total across both sections. Keep each bullet to 1-2 sentences.
Do not include citations, reference lists, source names, or evidence grades.
Return plain text only — no JSON, no fenced code blocks, no app-specific markup.
</output_format>

{{PLAIN_OPEN_EVIDENCE_OUTPUT}}
