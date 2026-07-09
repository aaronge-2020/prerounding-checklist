import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { full_rounds_report } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function fullRoundsReportPrompt(context) {
  return renderTemplate(full_rounds_report, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context)
  });
}
