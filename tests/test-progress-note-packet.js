import assert from "node:assert/strict";
import { createDailyRecord } from "../src/daily-updates/days.js";
import { createPatientRecord } from "../src/app/state/vault.js";
import { buildProgressNotePacket } from "../src/prompts/progress-note-packet.js";
import { createSourceCapture } from "../src/patient-context/source-captures.js";

function withText(sections, role, text) {
  return sections.map((section) => (section.role === role ? { ...section, deidentifiedText: text } : section));
}

const patient = createPatientRecord("Room 7", { id: "packet_patient" });
const contextSections = withText(
  withText(
    withText(patient.contextSections, "admission_reason", "Admitted for dyspnea requiring noninvasive ventilation."),
    "relevant_baseline",
    "HFpEF and ESRD on hemodialysis."
  ),
  "admission_results",
  "Admission BNP was elevated and admission chest radiograph showed edema."
);

const olderDay = {
  ...createDailyRecord({ date: "2026-07-08", label: "Hospital day 1" }),
  sourceCaptures: [createSourceCapture({ sourceKind: "bedside_update", text: "Older exam: diffuse crackles." })]
};
const selectedDay = {
  ...createDailyRecord({ date: "2026-07-09", label: "Hospital day 2" }),
  sourceCaptures: [
    createSourceCapture({ sourceKind: "primary_note", text: "Received hemodialysis overnight." }),
    createSourceCapture({ sourceKind: "medication_activity", text: "Carvedilol was given and later held." }),
    createSourceCapture({ sourceKind: "other_chart_text", text: "Case management is awaiting an outpatient dialysis chair." })
  ],
  openEvidenceExamNote: { text: "Lungs clear; no increased work of breathing." }
};

const packet = buildProgressNotePacket({ patient: { ...patient, contextSections, days: [olderDay, selectedDay] }, selectedDay });
assert.match(packet, /Selected hospital day\. Hospital day 2\. Date: 2026-07-09\./);
assert.match(packet, /Admission reason and initial severity: Admitted for dyspnea/);
assert.match(packet, /Relevant baseline and active problem context: HFpEF and ESRD/);
assert.doesNotMatch(packet, /Admission BNP/, "admission-only objective data must stay out of the progress packet");
assert.match(packet, /Primary team note\. Received hemodialysis overnight/);
assert.match(packet, /Medication activity\. Carvedilol was given and later held/);
assert.match(packet, /Other chart text\. Case management is awaiting/);
assert.match(packet, /Separate selected-day examination\. Lungs clear/);
assert.match(packet, /Results, Bedside update/, "missing expected source types must be disclosed without inventing content");
assert.doesNotMatch(packet, /Older exam/, "only the selected-day examination may enter the default progress packet");
assert.doesNotMatch(packet, /[\[\]{}<>()`]/, "progress packet must remain compatible with the plain-language OpenEvidence contract");

console.log("progress note packet tests passed");
