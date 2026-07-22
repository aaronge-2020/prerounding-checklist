import { checklistAnswersSummary, hasAssessedChecklistContent } from "../checklist/state.js";
import { isCarryForwardContextRole, packetRoleFor, packetRoleLabel, packetRolesForScope } from "../patient-context/packet-roles.js";
import { naturalLanguagePrompt } from "./natural-language.js";

function compactText(value) {
  return String(value || "").trim();
}

function renderField(scope, section) {
  const text = compactText(section?.deidentifiedText);
  if (!text) return "";
  const role = packetRoleFor(scope, section.role);
  return `${role?.label || packetRoleLabel(scope, section.role, section.label || "Saved information")}: ${text}`;
}

function sortedFields(scope, sections, include) {
  const order = new Map(packetRolesForScope(scope).map(({ id }, index) => [id, index]));
  return (sections || [])
    .filter((section) => include(section))
    .sort((left, right) => (order.get(left.role) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.role) ?? Number.MAX_SAFE_INTEGER))
    .map((section) => renderField(scope, section))
    .filter(Boolean);
}

function selectedDayExam(day) {
  const focusedExam = (day?.sections || []).find((section) => section.role === "focused_exam")?.deidentifiedText;
  if (compactText(focusedExam)) return compactText(focusedExam);
  if (hasAssessedChecklistContent(day?.checklistSnapshot || null, day?.answers || {}, day?.quickNotes || [])) {
    return checklistAnswersSummary(day.checklistSnapshot, day.answers || {}, day.quickNotes || []);
  }
  return compactText(day?.openEvidenceExamNote?.text);
}

export function buildProgressNotePacket({ patient, selectedDay } = {}) {
  const dayLabel = compactText(selectedDay?.label) || "Selected hospital day";
  const dayDate = compactText(selectedDay?.date) || "not documented";
  const admission = sortedFields("context", patient?.contextSections || [], (section) => isCarryForwardContextRole(section.role));
  const dayFields = sortedFields("daily", selectedDay?.sections || [], (section) => section.role !== "focused_exam" && section.role !== "additional_daily_source");
  const exam = selectedDayExam(selectedDay);

  const parts = [
    `Selected hospital day. ${dayLabel}. Date: ${dayDate}.`,
    `Carry-forward admission context. ${admission.length ? admission.join("\n\n") : "No carry-forward admission context saved."}`,
    `Selected-day information. ${dayFields.length ? dayFields.join("\n\n") : "No selected-day information saved."}`,
    exam ? `Selected-day examination. ${exam}` : "Selected-day examination. No focused examination findings saved."
  ];
  return naturalLanguagePrompt(parts.filter(Boolean).join("\n\n"));
}
