import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { medication_safety } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function medicationSafetyPrompt(context) {
  const useSameConversation = context.sameConversationReady && !context.forceIncludeSourceForMedicationSafety;
  return renderTemplate(medication_safety, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: useSameConversation
      ? `<same_conversation_context>The de-identified case context was provided earlier in this conversation. Use that context; do not ask for it again.</same_conversation_context>`
      : buildContextSection(context)
  });
}
