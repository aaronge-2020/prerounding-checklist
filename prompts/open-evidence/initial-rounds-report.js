import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { initial_rounds_report } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function initialRoundsPrompt(context) {
  return renderTemplate(initial_rounds_report, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context)
  });
}
