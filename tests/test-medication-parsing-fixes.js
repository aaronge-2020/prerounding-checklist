import assert from "node:assert/strict";
import { clinicalDisplayModelFromPromptText } from "../src/patient-context/structured-clinical-data.js";
import { buildClinicalReviewIndex } from "../src/review-data/index.js";
import { redactFromEntities } from "../src/vault/deid.js";

// 1. De-id lab tags must never leak into medication names at the saved-source
// clinical boundary, and PRN Comment rows must not become medications.
{
  const tagged = [
    "Medications",
    "**[LATEST_RESULT]** [Lab 12/12] [Medications] PRN Comment: for phosphorus level <=2 mg/dL with K>= 4 mEq/L OR SCr >= 2 mg/dL",
    "[Lab 2/2] [Medications] PRN Reasons: Nausea,Vomiting",
    "Potassium Chloride — Dose: 20 mEq | Route: PO | Frequency: daily | Administrations: 0600; 2044",
  ].join("\n");
  const model = clinicalDisplayModelFromPromptText("medication_activity", tagged);
  const names = model.groups.flatMap((group) => group.rows.map((row) => row.medication.name));
  assert.deepEqual(names, ["Potassium Chloride"], `medication names after tag strip: ${JSON.stringify(names)}`);
}

// 2. The lab ordinal tagger must not tag medication-order annotation lines,
// even when their conditional text mentions lab values.
{
  const mar = [
    "[Medications] PRN Comment: for phosphorus level <=2 mg/dL [Hospital Day 9 at 06:27]",
    "[Medications] PRN Comment: for phosphorus level <=2 mg/dL [Hospital Day 8 at 06:27]",
    "Sodium: 139 [Hospital Day 9 at 06:27]",
    "Sodium: 140 [Hospital Day 8 at 06:27]",
  ].join("\n");
  const redacted = redactFromEntities(mar, [], new Date("2026-09-24T12:00:00"));
  assert.ok(!/\[Lab \d+\/\d+\] \[Medications\] PRN Comment/.test(redacted), `PRN Comment lines must not be lab-tagged:\n${redacted}`);
  assert.ok(/\[Lab 2\/2\] Sodium/.test(redacted), `real repeated labs still get ordinals:\n${redacted}`);
}

// 3. Review index: garbage medication rows are dropped, schedule label is
// empty when unknown, and military times render as HH:MM.
{
  const tagged = [
    "Medications",
    "**[LATEST_RESULT]** [Lab 12/12] [Medications] PRN Comment: for phosphorus level <=2 mg/dL with K>= 4 mEq/L OR SCr >= 2 mg/dL",
    "Metoprolol — Dose: 25 mg | Route: PO | Frequency: daily | Administrations: 0800; 2044",
    "Aspirin — Dose: 81 mg | Route: PO | Frequency: | Administrations: 0900",
  ].join("\n");
  const patient = {
    contextSections: [
      { id: "src-1", sourceKind: "medication_activity", label: "MAR", deidentifiedText: tagged },
    ],
  };
  const index = buildClinicalReviewIndex(patient);
  const meds = index.medications || [];
  const names = meds.map((candidate) => candidate.name);
  assert.deepEqual(names, ["Aspirin", "Metoprolol"], `review medication names: ${JSON.stringify(names)}`);
  const metoprolol = meds.find((candidate) => candidate.name === "Metoprolol");
  assert.equal(metoprolol.scheduleLabel, "Scheduled");
  assert.equal(metoprolol.latestAdministration, "20:44");
  assert.ok(!/Order/.test(metoprolol.noteDetail), `no "Order" jargon in note detail: ${metoprolol.noteDetail}`);
  const aspirin = meds.find((candidate) => candidate.name === "Aspirin");
  assert.equal(aspirin.scheduleLabel, "", `unknown schedule shows no label, got: ${JSON.stringify(aspirin.scheduleLabel)}`);
  assert.equal(aspirin.latestAdministration, "09:00");
}

console.log("medication parsing + schedule label + select-all fixes: OK");
