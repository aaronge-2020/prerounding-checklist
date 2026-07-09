import { renderTemplate, FRAGMENTS } from "../template-engine.js";
import { workup_section_recommendations } from "../templates-bundle.js";
import { buildContextSection } from "./shared.js";

export function workupSectionPrompt(context) {
  const workupTitle = context.selectedWorkupTitle || "the selected clinical workup";
  const sectionLabel = context.sectionLabel || context.sectionKey || "history_questions";
  const sectionName = sectionLabel === "physical_exam" ? "physical exam" : "history questions";
  return renderTemplate(workup_section_recommendations, {
    ...FRAGMENTS,
    USER_CONTEXT: context.userContext || "",
    CONTEXT_SECTION: buildContextSection(context),
    WORKUP_TITLE: workupTitle,
    SECTION_NAME: sectionName
  });
}
