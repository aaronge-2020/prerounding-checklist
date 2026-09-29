// Regression: MAR (Medication Administration Report) exports with bracketed
// line tags ("[Medications]", "[Completed Medications]", "[Discontinued
// Medications]", "[Other Encounter]", "[Lab 1/2]") and a "Medication
// Administration Report" footer must parse as individual medications — not
// collapse into the dictated-prose fallback that mangles them.
import assert from "node:assert/strict";
import {
  extractNoteMedications,
  isNonMedicationLine,
  splitMedicationLine,
  MAR_LEAD_TAG
} from "../src/patient-context/note-clinical-extractor.js";

// Bracketed tags are stripped so the drug name leads.
assert.equal(
  splitMedicationLine("[Medications] acetaminophen (TYLENOL) tablet 1,000 mg — Dose: 1,000 mg | Route: PO").name,
  "acetaminophen (TYLENOL) tablet 1,000 mg"
);
assert.equal(
  splitMedicationLine("[Completed Medications] furosemide (LASIX) injection 20 mg — Dose: 20 mg | Route: IV").name,
  "furosemide (LASIX) injection 20 mg"
);
assert.equal(
  splitMedicationLine("[Discontinued Medications] NIFEdipine (PROCARDIA XL) 24 hr tablet 30 mg — Dose: 30 mg | Route: PO").name,
  "NIFEdipine (PROCARDIA XL) 24 hr tablet 30 mg"
);
// Nested tags and the markdown latest-result marker.
assert.ok(MAR_LEAD_TAG.test("**[LATEST_RESULT]** [Lab 2/2] [Other Encounter] ibuprofen tablet 800 mg — Dose: 800 mg"));
assert.equal(
  splitMedicationLine("**[LATEST_RESULT]** [Lab 2/2] [Other Encounter] ibuprofen tablet 800 mg — Dose: 800 mg | Route: PO").name,
  "ibuprofen tablet 800 mg"
);
assert.equal(
  splitMedicationLine("[Lab 1/2] [Other Encounter] enoxaparin sodium (LOVENOX) injection 40 mg — Dose: 40 mg").name,
  "enoxaparin sodium (LOVENOX) injection 40 mg"
);
// Long drug+formulation names on tagged lines are not rejected as prose.
assert.ok(splitMedicationLine("[Other Encounter] bupivacaine 0.0625 % & fentaNYL 2 mcg/mL in NS 250 mL for PCEA — Route: EP"));

// MAR footers are never medications.
assert.ok(isNonMedicationLine("Medication Administration Report"));
assert.ok(isNonMedicationLine("for [NAME] as of [Hospital Day 4 at 15:39]-D/C'd"));
assert.ok(isNonMedicationLine("0734-D/C'd"));
assert.ok(isNonMedicationLine("0548-D/C'd"));
// A bare "Medications" section title is a heading, not a drug.
assert.ok(isNonMedicationLine("Medications"));

// Full MAR export: every line parses, nothing is mangled by prose fallback.
const marExport = `Medications
[Medications] acetaminophen (TYLENOL) tablet 1,000 mg — Dose: 1,000 mg | Route: PO | Frequency: every 6 hours PRN | Administrations: [Hospital Day 6 at 16:55] (1,000 mg); [Hospital Day 7 at 00:44] (1,000 mg)
[Completed Medications] magnesium sulfate infusion 40 g/1000 mL water premix — Dose: 2 g/hr | Rate: 50 mL/hr | Route: IV | Frequency: continuous | Administrations: [Hospital Day 6 at 14:52] (2 g/hr); [Hospital Day 7 at 15:21] [C]
[Discontinued Medications] NIFEdipine (PROCARDIA XL) 24 hr tablet 30 mg — Dose: 30 mg | Route: PO | Frequency: 1 time daily | Administrations: [Hospital Day 6 at 08:40] (30 mg)
[Other Encounter] oxytocin (PITOCIN) 30 units in NS 500 mL induction infusion — Dose: 2-20 milli-units/min | Rate: 2-20 mL/hr | Route: IV | Frequency: titrated
[Lab 1/2] [Other Encounter] ibuprofen tablet 800 mg — Dose: 800 mg | Route: PO | Frequency: every 8 hours PRN | Administrations: [Hospital Day 4 at 04:09] (800 mg)
**[LATEST_RESULT]** [Lab 2/2] [Other Encounter] enoxaparin sodium (LOVENOX) injection 40 mg — Dose: 40 mg | Route: SC | Frequency: 1 time daily | Administrations: [Hospital Day 6 at 11:47] (40 mg)
Medication Administration Report
for [NAME] as of [Hospital Day 4 at 15:39]-D/C'd
0734-D/C'd`;

const result = extractNoteMedications(marExport);
const lines = result.split("\n");
assert.equal(lines[0], "Medications");
assert.equal(lines.length, 7, `expected 6 meds + header, got ${lines.length}: ${JSON.stringify(lines)}`);
// No bracket tags leak into the output.
assert.ok(lines.every((l) => !l.includes("[Medications]") && !l.includes("[Other Encounter]") && !l.includes("[Lab")), "tags leaked");
// No footer fragments in the output.
assert.ok(lines.every((l) => !/D\/C'd|Administration Report/i.test(l)), "footer leaked");
// Spot-check drug names and details survived intact.
assert.ok(lines.some((l) => l.startsWith("acetaminophen (TYLENOL) tablet 1,000 mg — Dose: 1,000 mg")));
assert.ok(lines.some((l) => l.startsWith("magnesium sulfate infusion 40 g/1000 mL water premix — Dose: 2 g/hr")));
assert.ok(lines.some((l) => l.startsWith("enoxaparin sodium (LOVENOX) injection 40 mg — Dose: 40 mg")));

console.log("MAR medication parsing regression tests passed");
