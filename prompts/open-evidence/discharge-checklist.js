import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { discharge_checklist } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function dischargePrompt(context) {
  return renderTemplate(discharge_checklist, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context)
  });
}
