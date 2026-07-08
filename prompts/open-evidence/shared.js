// Shared text fragments and pure composition helpers used by every OpenEvidence
// task prompt in this folder. Keep this file free of task-specific instructions —
// each task's wording lives in its own prompts/open-evidence/<task-id>.js file.

export function clean(value) {
  return String(value || "").trim();
}

export const EVIDENCE_GUARDRAILS = `<guidance>
A de-identified clinical case for educational use follows below.
Answer using OpenEvidence's current guidelines and literature. Base your response on evidence you can cite.
Do not fabricate facts, patient identifiers, diagnoses, or clinical data not present in the context or your sources.
Distinguish what evidence supports from what is uncertain or not yet verified.
</guidance>`;

export const NOTE_STANDARD_GUIDANCE = "Use docs/presentation-note-standard.md as the canonical local standard for oral presentations, H&Ps, progress notes, follow-up notes, and handoff-style summaries.";

export const PLAIN_OPEN_EVIDENCE_OUTPUT = "Return plain-language clinical guidance only. Do not return JSON, fenced code, APP_PASTE_BACK_JSON, paste-back blocks, or app-specific schemas.";

export function block(title, value) {
  const text = clean(value);
  return text ? `<${title}>\n${text}\n</${title}>` : "";
}

export function taskBoundary({ primary, notFor = [] } = {}) {
  const exclusions = notFor
    .map((item) => `- ${clean(item)}`)
    .filter(Boolean)
    .join("\n");
  return [
    "<scope>",
    primary ? `What to answer: ${clean(primary)}` : "",
    exclusions ? `Do not include:\n${exclusions}` : "",
    "</scope>"
  ].filter(Boolean).join("\n");
}

export function sourceContextBlock(context) {
  return [
    block("context_type", context.contextType || "De-identified case for evidence review."),
    context.labChronologyBlock ? block("lab_chronology", context.labChronologyBlock) : "",
    block("source_context", context.sourceContext)
  ].filter(Boolean).join("\n\n");
}

export function findingsContextBlock(context) {
  return [
    context.sameConversationReady ? block("same_conversation_context", "The de-identified case context was provided earlier in this conversation. Use that context.") : "",
    block("new_bedside_findings", context.compiledFindings),
    context.sourceContext && !context.sameConversationReady ? sourceContextBlock(context) : ""
  ].filter(Boolean).join("\n\n");
}

export function buildPatientPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    sourceContextBlock(context),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}

export function buildSameConversationPrompt(context, taskInstructions, finalInstruction) {
  return [
    taskInstructions,
    EVIDENCE_GUARDRAILS,
    context.userContext || "",
    block("same_conversation_context", "The de-identified case context was provided earlier in this conversation. Use that context; do not ask for it again."),
    finalInstruction
  ].filter(Boolean).join("\n\n");
}
