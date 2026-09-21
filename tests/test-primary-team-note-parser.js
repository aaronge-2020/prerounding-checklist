import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "primary-team-notes");
const fixture = (name) => fs.readFileSync(path.join(fixtureDirectory, name), "utf8");

function assertMostlyLossless(source, parsed, label) {
  assert.ok(parsed.recognized, `${label} should recognize explicit note headings`);
  assert.ok(parsed.parsedCharacterCount / parsed.sourceCharacterCount > 0.93, `${label} should retain source content instead of summarizing it`);
}

const progressTeamNote = fixture("progress-team-note.txt");
const progressParsed = parsePrimaryTeamNote(progressTeamNote, "progress");
assertMostlyLossless(progressTeamNote, progressParsed, "progress-team note");
assert.match(progressParsed.sections.interval_events, /No acute overnight events/);
assert.match(progressParsed.sections.medications, /NUTRITION Tube Feeding/);
assert.match(progressParsed.sections.physical_exam, /Sedated, not following commands/);
assert.match(progressParsed.sections.objective, /Sodium\s+150/);
assert.match(progressParsed.sections.objective, /midline shift/);
assert.match(progressParsed.sections.plan, /Right MCA\/ACA/);
assert.match(progressParsed.sections.plan, /Patient Lines\/Drains\/Airways Status/);
assert.doesNotMatch(progressParsed.sections.vte_prophylaxis, /Patient Lines\/Drains\/Airways Status/);
assert.match(progressParsed.sections.other, /Name: \[PATIENT NAME\]/);
assert.match(progressParsed.sections.other, /ALLERGIES: Patient has no known allergies/);
assert.match(progressParsed.sections.code_status, /CPR, Full Code/);

const criticalCareNote = fixture("critical-care-note.txt");
const criticalCareParsed = parsePrimaryTeamNote(criticalCareNote, "progress");
assertMostlyLossless(criticalCareNote, criticalCareParsed, "critical-care note");
assert.match(criticalCareParsed.sections.patient_report, /Acute ischemic stroke and Cerebral edema/);
assert.match(criticalCareParsed.sections.patient_report, /Chief Complaint:/);
assert.match(criticalCareParsed.sections.patient_report, /HPI:/);
assert.match(criticalCareParsed.sections.interval_events, /\[Hospital Day 1\]: OR for DHC/);
assert.match(criticalCareParsed.sections.interval_events, /RTOR for blown right pupil/);
assert.match(criticalCareParsed.sections.assessment, /Principal Problem/);
assert.match(criticalCareParsed.sections.physical_exam, /Pupillometer/);
assert.match(criticalCareParsed.sections.objective, /PH ART/);
assert.match(criticalCareParsed.sections.objective, /SBP goal <160/);
assert.match(criticalCareParsed.sections.disposition, /EDUCATION\/COUNSELING/);

const compactNote = fixture("compact-soap-note.txt");
const compactParsed = parsePrimaryTeamNote(compactNote, "progress");
assertMostlyLossless(compactNote, compactParsed, "compact SOAP note");
assert.match(compactParsed.sections.patient_report, /complete occlusion of the right M1 MCA/);
assert.match(compactParsed.sections.objective, /Intake\/Output Summary/);
assert.match(compactParsed.sections.objective, /150\\\*\s+121\\\*\s+14\s+94/);
assert.match(compactParsed.sections.physical_exam, /GCS 3T/);
assert.match(compactParsed.sections.medications, /levETIRAcetam/);
assert.match(compactParsed.sections.plan, /SBP<160/);

const hAndP = parsePrimaryTeamNote(`## Chief Complaint\r\nDyspnea\r\n\r\n**HPI:** Progressive symptoms.\r\nPMH — Asthma\r\nROS:\r\nNo fever.`, "hp");
assert.equal(hAndP.sections.chief_complaint, "Dyspnea");
assert.equal(hAndP.sections.history_of_present_illness, "Progressive symptoms.");
assert.equal(hAndP.sections.past_medical_history, "Asthma");
assert.equal(hAndP.sections.review_of_systems, "No fever.");

const tabbedMetadata = parsePrimaryTeamNote("Room: [ROOM]\tALLERGIES: Penicillin\nTreatment Team: Service\tCODE STATUS: Full Code", "hp");
assert.equal(tabbedMetadata.sections.allergies, "Penicillin");
assert.equal(tabbedMetadata.sections.code_status, "Full Code");
assert.match(tabbedMetadata.sections.other, /Room: \[ROOM\]/);
assert.match(tabbedMetadata.sections.other, /Treatment Team: Service/);

const repeated = parsePrimaryTeamNote("Imaging:\nFirst study\nImaging\nSecond study", "progress");
assert.match(repeated.sections.objective, /Imaging\nFirst study/);
assert.match(repeated.sections.objective, /Imaging\nSecond study/);

const prose = parsePrimaryTeamNote("HPI\nPlan to repeat CT tomorrow.\nBP: 120\/80\nHPI was reviewed with the team.\n- Labs: repeat in AM", "progress");
assert.match(prose.sections.patient_report, /Plan to repeat CT tomorrow/);
assert.match(prose.sections.patient_report, /BP: 120\/80/);
assert.match(prose.sections.patient_report, /- Labs: repeat in AM/);
assert.equal(prose.sections.plan, "");
assert.equal(prose.sections.objective, "");

const soapVariants = parsePrimaryTeamNote("S:\nReports weakness.\nO:\nBP 120/80\nA&P:\nContinue monitoring.\nMeds:\nAspirin\nP:\nFollow up.", "progress");
assert.equal(soapVariants.sections.patient_report, "Reports weakness.");
assert.match(soapVariants.sections.objective, /BP 120\/80/);
assert.match(soapVariants.sections.plan, /Continue monitoring/);
assert.match(soapVariants.sections.plan, /Follow up/);
assert.equal(soapVariants.sections.medications, "Aspirin");

const historyVariants = parsePrimaryTeamNote("PMHx: Asthma\nPSHx:\nAppendectomy", "hp");
assert.equal(historyVariants.sections.past_medical_history, "Asthma");
assert.equal(historyVariants.sections.past_surgical_history, "Appendectomy");

const longInlineHpiText = "long clinical content ".repeat(12).trim();
const longInlineHpi = parsePrimaryTeamNote(`HPI: ${longInlineHpiText}`, "progress");
assert.equal(longInlineHpi.recognized, true);
assert.match(longInlineHpi.sections.patient_report, new RegExp(longInlineHpiText.slice(-48).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const fallbackHeading = parsePrimaryTeamNote("ALLERGIES: Penicillin\nPMHx: Asthma", "progress");
assert.match(fallbackHeading.sections.other, /ALLERGIES: Penicillin/);
assert.match(fallbackHeading.sections.other, /PMHx: Asthma/);

const metadataOrder = parsePrimaryTeamNote("Name: A\nDOB: B\nRoom: C\tALLERGIES: none", "hp");
assert.ok(metadataOrder.sections.other.indexOf("Name: A") < metadataOrder.sections.other.indexOf("Room: C"));

const unicodeBody = parsePrimaryTeamNote("HPI\nDose 5 ㎎ and ﬂow", "progress");
assert.match(unicodeBody.sections.patient_report, /Dose 5 ㎎ and ﬂow/);

const radiologySubheadings = parsePrimaryTeamNote("Imaging:\nCT head\nExam: Noncontrast head CT\nImpression: No hemorrhage\nAssessment:\nStable", "progress");
assert.match(radiologySubheadings.sections.objective, /Exam: Noncontrast head CT/);
assert.match(radiologySubheadings.sections.objective, /Impression: No hemorrhage/);
assert.equal(radiologySubheadings.sections.assessment, "Stable");

const opaque = parsePrimaryTeamNote("Unlabeled narrative remains intact.\nSecond line remains intact.", "hp");
assert.equal(opaque.recognized, false);
assert.equal(opaque.sections.other, "Unlabeled narrative remains intact.\nSecond line remains intact.");

console.log("primary-team note parser tests passed");
