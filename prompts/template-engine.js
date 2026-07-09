/**
 * Simple template engine for prompt templates.
 *
 * Templates are plain Markdown/plaintext files with {{PLACEHOLDER}} markers.
 * This module provides:
 *  - FRAGMENTS: static reusable text blocks (evidence guardrails, etc.)
 *  - renderTemplate(template, vars): replaces {{KEY}} with values from vars
 *    (plus FRAGMENTS keys). Unknown placeholders are left unchanged.
 *
 * Works in both browser ESM and Node.js.
 */

export const FRAGMENTS = {
  EVIDENCE_GUARDRAILS: `<guidance>
A de-identified clinical case for educational use follows below.
Answer using OpenEvidence's current guidelines and literature. Base your response on evidence you can cite.
Do not fabricate facts, patient identifiers, diagnoses, or clinical data not present in the context or your sources.
Distinguish what evidence supports from what is uncertain or not yet verified.
</guidance>`,

  NOTE_STANDARD_GUIDANCE: `Follow this clinical documentation standard exactly. Tell a clear clinical story. Present factual data without distortion. Keep text concise and functional so the reader finds relevant data fast.
Rule of separation: place each fact in exactly one section. Never repeat data across sections. Maintain strict boundaries between subjective reports, objective data, clinical reasoning, and action steps.
SUBJECTIVE: patient-reported statements and interval events only. Exclude vital signs, physical exam findings, and plans.
OBJECTIVE: vital signs, physical exam findings, and new diagnostic results only. Exclude patient statements, diagnostic theories, and treatment plans.
ASSESSMENT: state the current clinical trajectory and the reasoning that connects new objective data to it. Exclude subjective complaints, objective data repetition, and action steps.
PLAN: specific interventions, orders, and quantitative thresholds only. Exclude clinical reasoning, patient history, and test results already stated elsewhere.`,

  PLAIN_OPEN_EVIDENCE_OUTPUT: "Return plain-language clinical guidance only. Do not return JSON, fenced code, APP_PASTE_BACK_JSON, paste-back blocks, or app-specific schemas.",

  CHECKLIST_CONTRACT: `Return plain text only.
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
Do not use markdown, bullets, numbering, tables, explanations, citations, or text before or after the two checklists.`,

  STUDENT_EXAM_REFERENCE: `Student exam reference (student_exam_reference; optional reminder, not exhaustive):
These are locally reviewed examples from the student's learned physical exam toolkit. Use them only as a compatibility fallback and completeness check for maneuvers already supported by the reviewed patient context.
Do not add unvalidated checklist items as final checklist rows. If a clinically important question or maneuver is missing from validated local material, omit it from the two checklists and treat it as a catalog gap for reviewer follow-up.
Use the reference to avoid missing relevant student-performable maneuvers, then choose the final concise checklist from reviewed patient context, installed clinical workup modules, validated clinical intents, or retrieved evidence candidates.`
};

/**
 * Replace all {{KEY}} placeholders in the template with values from vars.
 * Also checks FRAGMENTS for any key not found in vars.
 * Unknown keys are left as-is ({{UNKNOWN}} stays {{UNKNOWN}}).
 *
 * @param {string} template - Raw template string with {{PLACEHOLDER}} markers
 * @param {Record<string,string>} [vars={}] - Variable values to substitute
 * @returns {string} Rendered template
 */
export function renderTemplate(template, vars = {}) {
  let result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in vars) {
      const val = vars[key];
      return val == null ? "" : String(val);
    }
    if (key in FRAGMENTS) {
      return FRAGMENTS[key];
    }
    return match;
  });
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  if (result) result += "\n";
  return result;
}
