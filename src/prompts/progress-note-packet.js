import { checklistAnswersSummary, hasAssessedChecklistContent } from "../checklist/state.js";
import { isCarryForwardContextRole, packetRoleFor, packetRoleLabel, packetRolesForScope } from "../patient-context/packet-roles.js";
import { dailySourceKindLabel, sourceCapturePacketCheck } from "../patient-context/source-captures.js?v=20260921-lab-panel-sets";
import { naturalLanguagePrompt } from "./natural-language.js";
import { renderFinalNote } from "../note-drafts/index.js?v=20260921-lab-panel-sets";

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
  if (hasAssessedChecklistContent(day?.checklistSnapshot || null, day?.answers || {}, day?.quickNotes || [])) {
    return checklistAnswersSummary(day.checklistSnapshot, day.answers || {}, day.quickNotes || []);
  }
  return compactText(day?.openEvidenceExamNote?.text);
}

function selectedDaySources(captures = []) {
  return (captures || [])
    .filter((capture) => compactText(capture?.deidentifiedText))
    .map((capture) => `${dailySourceKindLabel(capture.sourceKind)}. ${compactText(capture.deidentifiedText)}`);
}

export function buildProgressNotePacket({ patient, selectedDay } = {}) {
  const admission = sortedFields("context", patient?.contextSections || [], (section) => isCarryForwardContextRole(section.role));
  const daySources = selectedDaySources(selectedDay?.sourceCaptures || []);
  const admissionStructuredNote = patient?.admissionPrimaryTeamNote ? renderFinalNote(patient.admissionPrimaryTeamNote).trim() : "";
  const dailyStructuredNote = selectedDay?.primaryTeamNote ? renderFinalNote(selectedDay.primaryTeamNote).trim() : "";
  const packetCheck = sourceCapturePacketCheck(selectedDay?.sourceCaptures || [], { structuredNote: selectedDay?.primaryTeamNote, scope: "daily" });
  const exam = selectedDayExam(selectedDay);

  const parts = [
    // A packet's stored calendar day is an internal redaction anchor, never
    // OpenEvidence context. The source text already carries only relative
    // timeline placeholders, and this heading must preserve that boundary.
    "Selected hospital day.",
    `Carry-forward admission context. ${[admission.join("\n\n"), admissionStructuredNote].filter(Boolean).join("\n\n") || "No carry-forward admission context saved."}`,
    `Selected-day source record. ${[daySources.join("\n\n"), dailyStructuredNote].filter(Boolean).join("\n\n") || "No selected-day sources saved."}`,
    exam ? `Separate selected-day examination. ${exam}` : "Separate selected-day examination. No checklist or examination note saved outside the source record.",
    packetCheck.notSupplied.length
      ? `Packet limitations. The following source types were not supplied: ${packetCheck.notSupplied.join(", ")}. Do not infer their contents from another source.`
      : "Packet limitations. The required daily review sources—primary team note, vital signs, and laboratory results—were supplied. Consult notes and medication activity are optional sources. This does not establish that the chart is complete or internally consistent."
  ];
  return naturalLanguagePrompt(parts.filter(Boolean).join("\n\n"));
}
