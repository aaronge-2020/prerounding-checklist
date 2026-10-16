import assert from "node:assert/strict";
import { SAMPLE_NOTES_DATA } from "../src/data/sample-notes.data.js";
import { packetPrimaryNoteSource } from "../src/patient-context/primary-note-source.js";
import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";
import { normalizePatient } from "../src/app/state/vault.js";
import { encryptVaultPayload, decryptVaultPayload } from "../src/app/state/persistence.js";

for (const sample of SAMPLE_NOTES_DATA) {
  const patient = normalizePatient({
    id: sample.id,
    metadata: { sampleImport: true },
    contextSections: [{ id: "saved", sourceKind: "primary_note", deidentifiedText: sample.body }]
  });
  const before = JSON.stringify(patient);
  const resolved = packetPrimaryNoteSource(patient, "admission");
  assert.equal(resolved.representation, "capture");
  const expected = parsePrimaryTeamNote(sample.body, "hp");
  for (const [field, value] of Object.entries(expected.sections))
    assert.equal(resolved.note.sections[field].deidentifiedText, value, `${sample.id}: ${field}`);
  assert.ok(resolved.note.sections.history_of_present_illness.deidentifiedText.trim(), `${sample.id}: HPI available`);
  if (sample.body.includes("\nMEDICAL DECISION MAKING\n"))
    assert.ok(
      resolved.note.sections.assessment.deidentifiedText.trim(),
      `${sample.id}: explicit ED medical decision making is an assessment source`
    );
  assert.equal(resolved.note.sections.one_liner.deidentifiedText, "", "an absent explicit one-liner must not be invented");
  assert.equal(JSON.stringify(patient), before, "resolving a note neither mutates nor duplicates the saved chart");
  assert.equal(resolved.note.patientId, patient.id);
}
const ed = parsePrimaryTeamNote(
  "HPI\nSynthetic presenting concern.\nLABORATORY\nSynthetic lab result.\nED COURSE\nObserved during the encounter.\nMEDICAL DECISION MAKING\nExplicit assessment reasoning.\nDISPOSITION\nExplicit disposition.",
  "hp"
);
assert.match(ed.sections.history_of_present_illness, /Observed during the encounter/);
assert.match(ed.sections.assessment, /Explicit assessment reasoning/);
assert.doesNotMatch(ed.sections.objective, /Explicit assessment reasoning/);
let patient = normalizePatient({
  id: "p",
  contextSections: [
    { id: "admission", sourceKind: "primary_note", deidentifiedText: "HPI\nSaved source text.\nMEDICATIONS\nSource medication." }
  ],
  days: [{ id: "day", sourceCaptures: [{ id: "own", sourceKind: "primary_note", deidentifiedText: "SUBJECTIVE\nOwn interval history." }] }]
});
assert.match(packetPrimaryNoteSource(patient, "day").note.sections.patient_report.deidentifiedText, /Own interval/);
assert.equal(packetPrimaryNoteSource(patient, "missing").note, null);
patient.contextSections[0].deidentifiedText = "HPI\nEdited retained source.";
assert.match(packetPrimaryNoteSource(patient, "admission").note.sections.history_of_present_illness.deidentifiedText, /Edited retained/);
patient.contextSections[0].residualWarnings = [{ message: "Review synthetic flag", category: "identifier" }];
assert.ok(
  packetPrimaryNoteSource(patient, "admission").note.sections.history_of_present_illness.residualWarnings.length,
  "privacy metadata survives section derivation"
);
patient.contextSections.push({ ...patient.contextSections[0], id: "other" });
assert.equal(packetPrimaryNoteSource(patient, "admission").note, null);
assert.match(packetPrimaryNoteSource(patient, "admission").reason, /multiple primary-note/);
patient.contextSections.pop();
patient.contextSections[0].sourceKind = "other_chart_text";
assert.equal(packetPrimaryNoteSource(patient, "admission").note, null, "note-like text is not classified by guessing its contents");
patient.contextSections[0].sourceKind = "primary_note";
patient.contextSections[0].deidentificationSkipped = true;
assert.match(packetPrimaryNoteSource(patient, "admission").reason, /De-identify/);
patient.admissionPrimaryTeamNote = {
  id: "explicit",
  sections: { history_of_present_illness: { deidentifiedText: "Explicit edited note." } }
};
assert.equal(
  packetPrimaryNoteSource(patient, "admission").note,
  patient.admissionPrimaryTeamNote,
  "explicit structured edits remain authoritative"
);
delete patient.admissionPrimaryTeamNote;
patient.contextSections[0].deidentificationSkipped = false;
const restored = await decryptVaultPayload(
  await encryptVaultPayload({ patients: [patient], activePatientId: "p" }, "synthetic source test passphrase"),
  "synthetic source test passphrase"
);
assert.match(
  packetPrimaryNoteSource(restored.patients[0], "admission").note.sections.history_of_present_illness.deidentifiedText,
  /Edited retained/
);
assert.equal(restored.patients[0].admissionPrimaryTeamNote, null, "no duplicate parsed note is persisted");
console.log(
  `Primary-note read boundary: ${SAMPLE_NOTES_DATA.length} samples, edited sources, packet isolation, ambiguity, privacy metadata and encrypted round-trip passed.`
);
