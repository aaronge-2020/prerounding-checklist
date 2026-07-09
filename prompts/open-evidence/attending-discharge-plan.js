import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { attending_discharge_plan } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function attendingDischargePlanPrompt(context) {
  return renderTemplate(attending_discharge_plan, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context)
  });
}
