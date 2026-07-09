// Thin helpers for OpenEvidence prompt template rendering.
// The actual prompt prose lives in prompts/templates/*.md —
// this file provides the shared context-section builders used by every
// prompts/open-evidence/*.js thin wrapper.

export function buildContextSection(context) {
  const parts = [];
  if (context.contextType) {
    parts.push(`<context_type>${context.contextType}</context_type>`);
  }
  if (context.labChronologyBlock) {
    parts.push(`<lab_chronology>\n${context.labChronologyBlock}\n</lab_chronology>`);
  }
  if (context.sourceContext) {
    parts.push(`<source_context>\n${context.sourceContext}\n</source_context>`);
  }
  return parts.join("\n\n");
}

export function buildFindingsSection(context) {
  const parts = [];
  if (context.sameConversationReady) {
    parts.push(
      "<same_conversation_context>The de-identified case context was provided earlier in this conversation. Use that context.</same_conversation_context>"
    );
  }
  if (context.compiledFindings) {
    parts.push(`<new_bedside_findings>\n${context.compiledFindings}\n</new_bedside_findings>`);
  }
  if (context.sourceContext && !context.sameConversationReady) {
    parts.push(buildContextSection(context));
  }
  return parts.join("\n\n");
}
