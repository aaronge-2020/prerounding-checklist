<scope>
What to answer: Using OpenEvidence, review the de-identified patient context and current {{SECTION_NAME}} section of the {{WORKUP_TITLE}} workup. Recommend evidence-supported additions, updates, or removals.
Do not include:
- a full rounds report or assessment and plan
- diagnostic test or imaging orders unless they replace a history or exam question
- medication management or safety audit
- a discharge checklist
- JSON, fenced code, or structured schema output
</scope>

<clinical_question>
Review the current {{SECTION_NAME}} items below against the de-identified patient context. Using current evidence and guidelines, identify:
1. Missing history questions or exam maneuvers that should be added for a more comprehensive bedside workup.
2. Existing items that should be updated (e.g., changed wording, new answer options, revised rationale).
3. Any items that are redundant, outdated, or not supported by evidence and should be removed.

For each recommendation, explain the clinical reasoning and evidence basis briefly.
</clinical_question>

{{EVIDENCE_GUARDRAILS}}

{{USER_CONTEXT}}

{{CONTEXT_SECTION}}

<output_format>
Organize your response into three sections:

ADD
- List items that should be added.
- For each: state the proposed item, why it is clinically important for this workup, and what it helps distinguish or rule out.

UPDATE
- List existing items that should be revised.
- For each: identify the item by its current label or ID, state what should change, and why.

REMOVE
- List items that should be removed.
- For each: identify the item by its current label or ID, and state why it is redundant or not evidence-supported.

If no changes are needed in a section, write "No changes recommended."
Use at most 12 bullets total across all three sections. Keep each bullet concise.
Do not include citations, reference lists, source names, or evidence grades.
Return plain text only — no JSON, no fenced code blocks, no app-specific markup.
</output_format>

{{PLAIN_OPEN_EVIDENCE_OUTPUT}}
