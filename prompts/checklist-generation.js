import { renderTemplate, FRAGMENTS } from "./template-engine.js";
import {
  checklist_prompt,
  new_admission_checklist_prompt,
  cleanup_prompt
} from "./templates-bundle.js";

export const checklistContract = FRAGMENTS.CHECKLIST_CONTRACT;

export const checklistPrompt = renderTemplate(checklist_prompt);

export const newAdmissionChecklistPrompt = renderTemplate(new_admission_checklist_prompt, {
  CHECKLIST_PROMPT: checklistPrompt
});

export function buildCleanupPrompt(rawChecklist, auditResult, options = {}) {
  const issueText = auditResult?.issues?.length
    ? auditResult.issues.map((issue) => `- ${issue.message}`).join("\n")
    : "- Shorten and organize the checklist into the required bedside-first format.";
  return renderTemplate(cleanup_prompt, {
    USER_CONTEXT: options.userContext ? `\n\n${options.userContext}` : "",
    AUDIT_ISSUES: issueText,
    RAW_CHECKLIST: String(rawChecklist || "").trim()
  });
}
