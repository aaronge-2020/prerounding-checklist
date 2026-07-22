import assert from "node:assert/strict";
import { createDailyRecord } from "../src/daily-updates/days.js";
import { createPatientRecord } from "../src/app/state/vault.js";
import { buildProgressNotePacket } from "../src/prompts/progress-note-packet.js";

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
  sections: withText(createDailyRecord({ date: "2026-07-08", label: "Hospital day 1" }).sections, "focused_exam", "Older exam: diffuse crackles.")
};
const selectedDay = {
  ...createDailyRecord({ date: "2026-07-09", label: "Hospital day 2" }),
  sections: withText(
    withText(
      withText(createDailyRecord({ date: "2026-07-09", label: "Hospital day 2" }).sections, "interval_events", "Received hemodialysis overnight."),
      "medication_order_events",
      "Carvedilol was given and later held."
    ),
    "focused_exam",
    "Lungs clear; no increased work of breathing."
  )
};

const packet = buildProgressNotePacket({ patient: { ...patient, contextSections, days: [olderDay, selectedDay] }, selectedDay });
assert.match(packet, /Selected hospital day\. Hospital day 2\. Date: 2026-07-09\./);
assert.match(packet, /Admission reason and initial severity: Admitted for dyspnea/);
assert.match(packet, /Relevant baseline and active problem context: HFpEF and ESRD/);
assert.doesNotMatch(packet, /Admission BNP/, "admission-only objective data must stay out of the progress packet");
assert.match(packet, /Interval events: Received hemodialysis overnight/);
assert.match(packet, /Medication and order events: Carvedilol was given and later held/);
assert.match(packet, /Selected-day examination\. Lungs clear/);
assert.doesNotMatch(packet, /Older exam/, "only the selected-day examination may enter the default progress packet");
assert.doesNotMatch(packet, /[\[\]{}<>()`]/, "progress packet must remain compatible with the plain-language OpenEvidence contract");

console.log("progress note packet tests passed");
