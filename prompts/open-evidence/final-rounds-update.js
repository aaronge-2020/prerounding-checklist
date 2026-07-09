import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { final_rounds_update } from "../templates-bundle.js";
import { buildFindingsSection } from "./shared.js";

export function finalRoundsPrompt(context) {
  return renderTemplate(final_rounds_update, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    FINDINGS_SECTION: buildFindingsSection(context)
  });
}
