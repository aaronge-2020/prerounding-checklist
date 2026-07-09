import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { workup_content_recommendations } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function workupContentPrompt(context) {
  const complaint = context.selectedWorkupTitle || context.complaint || "the clinical problem described below";
  return renderTemplate(workup_content_recommendations, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context),
    WORKUP_TITLE: complaint
  });
}
