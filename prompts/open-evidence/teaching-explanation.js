import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { teaching_explanation } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function teachingPrompt(context) {
  return renderTemplate(teaching_explanation, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context)
  });
}
