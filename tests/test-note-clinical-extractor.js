import assert from "node:assert/strict";
import {
  extractNoteClinicalData,
  extractNoteLabs,
  extractNoteMedications,
  extractNoteStudies,
  extractNoteVitals
} from "../src/patient-context/note-clinical-extractor.js";
import { clinicalDisplayModelFromPromptText } from "../src/patient-context/structured-clinical-data.js";

// Medications: bulleted lists, inline lists, and no-med lines.
{
  const bulleted = extractNoteMedications(
    "- Lisinopril 10 mg PO daily\n- Xarelto, dose unknown\n- Metoprolol succinate ER 25 mg daily"
  );
  assert.equal(
    bulleted,
    "Medications\nLisinopril — 10 mg PO daily\nXarelto — dose unknown\nMetoprolol succinate ER — 25 mg daily"
  );
  const model = clinicalDisplayModelFromPromptText("medication_activity", bulleted);
  assert.equal(model?.type, "medications");
  const names = model.groups.flatMap((group) => group.rows.map((row) => row.medication.name));
  assert.deepEqual(names, ["Lisinopril", "Xarelto", "Metoprolol succinate ER"]);

  const inline = extractNoteMedications("Home meds: lisinopril 10 mg daily; metoprolol 25 mg BID");
  assert.ok(inline.startsWith("Medications\n"), "inline lists get a Medications header");
  assert.ok(inline.includes("lisinopril — 10 mg daily"), `unexpected inline output: ${inline}`);
  assert.ok(inline.includes("metoprolol — 25 mg BID"), `unexpected inline output: ${inline}`);

  assert.equal(extractNoteMedications("No known home medications."), "");
  assert.equal(extractNoteMedications("NKDA"), "");
  assert.equal(extractNoteMedications("Wife manages his medications."), "");
  assert.equal(extractNoteMedications(""), "");
}

// Vitals: exam prose with common abbreviations; Fahrenheit converts to Celsius.
{
  const vitals = extractNoteVitals(
    "Gen: NAD. Vitals: BP 142/88, HR 94, T 98.6 F, RR 18, SpO2 96% on RA. Weight 82 kg. Pain 3/10."
  );
  assert.equal(vitals, "Vitals\nBP 142/88; HR 94; Temp 37; RR 18; SpO2 96; Weight 82; Pain 3");
  const model = clinicalDisplayModelFromPromptText("vital_signs", vitals);
  assert.equal(model?.type, "vitals");
  const byName = Object.fromEntries(
    model.groups.flatMap((group) => group.rows).map((row) => [row.cells[1], row.cells[2]])
  );
  assert.equal(byName["Blood Pressure (cuff)"], "142/88");
  assert.equal(byName["Pulse"], "94");
  assert.equal(byName["Temperature"], "37");
  assert.equal(byName["Respirations"], "18");
  assert.equal(byName["SpO2"], "96");
  assert.equal(byName["Weight"], "82");
  assert.equal(byName["Pain"], "3");

  const split = extractNoteVitals("SBP 122, DBP 78, MAP (cuff) 88");
  assert.ok(split.includes("SBP 122") && split.includes("DBP 78") && split.includes("MAP 88"), split);
  const splitModel = clinicalDisplayModelFromPromptText("vital_signs", split);
  const splitNames = splitModel.groups.flatMap((group) => group.rows.map((row) => row.cells[1]));
  assert.ok(splitNames.includes("Systolic BP") && splitNames.includes("Diastolic BP"), splitNames.join(", "));

  assert.equal(extractNoteVitals("Vitals: Not obtained during this encounter."), "");
  assert.equal(extractNoteVitals(""), "");
}

// Labs: narrative lab lines; flags; rpt/pending placeholders.
{
  const labs = extractNoteLabs(
    "Labs: WBC 12.3 (H), Hgb 9.1 (L), Na 140, K 4.2, Creatinine 1.6 (H), Glucose 220 (H), Troponin rpt, BNP pending."
  );
  assert.ok(labs.startsWith("Labs\n"), labs);
  assert.ok(labs.includes("WBC: 12.3 K/uL; flag H"), labs);
  assert.ok(labs.includes("Hemoglobin: 9.1 g/dL; flag L"), labs);
  assert.ok(labs.includes("Sodium: 140 mmol/L"), labs);
  assert.ok(labs.includes("Creatinine: 1.6 mg/dL; flag H"), labs);
  assert.ok(labs.includes("Troponin: rpt"), labs);
  assert.ok(labs.includes("BNP: pending"), labs);
  const model = clinicalDisplayModelFromPromptText("laboratory_results", labs);
  assert.equal(model?.type, "labs");
  const rows = model.groups.flatMap((group) => group.rows);
  const byName = Object.fromEntries(rows.map((row) => [row.cells[0], { value: row.cells[1], flag: row.cells[4] }]));
  assert.equal(byName["WBC"].value, "12.3 K/uL");
  assert.equal(byName["WBC"].flag, "H");
  assert.equal(byName["Troponin"].value, "rpt");
  assert.equal(byName["BNP"].value, "pending");

  // Non-lab lines and prose never match.
  assert.equal(extractNoteLabs("Assessment: patient is hypertensive. Plan: continue lisinopril."), "");
  assert.equal(extractNoteLabs("Labs: pending"), "");
  assert.equal(extractNoteLabs(""), "");
}

// Studies: labeled result lines with colon/dash separators.
{
  const studies = extractNoteStudies(
    "Labs: WBC 12.3.\nEKG 12 Lead: sinus tach, no ST changes.\nCT head: no acute bleed.\nBlood cultures: pending."
  );
  assert.deepEqual(studies, [
    { label: "EKG 12 Lead", text: "sinus tach, no ST changes." },
    { label: "CT head", text: "no acute bleed." },
    { label: "Blood cultures", text: "pending." }
  ]);

  // Lab lines are not studies; prose lines without a study prefix are skipped.
  const mixed = extractNoteStudies("CBC: WBC 12.3.\nPatient resting comfortably.\nXR Chest AP (Portable): Rpt");
  assert.deepEqual(mixed, [{ label: "XR Chest AP (Portable)", text: "Rpt" }]);
}

// Full sweep across note sections.
{
  const sections = {
    medications: "- Lisinopril 10 mg PO daily",
    physical_exam: "Gen: NAD. Vitals: BP 142/88, HR 94.",
    objective: "Labs: WBC 12.3 (H).\nEKG 12 Lead: sinus tach.",
    plan: "1. Stroke\n- telemetry"
  };
  const extracted = extractNoteClinicalData(sections, { noteType: "hp" });
  assert.equal(extracted.noteType, "hp");
  assert.ok(extracted.medicationsText.startsWith("Medications\n"), extracted.medicationsText);
  assert.ok(extracted.vitalsText.startsWith("Vitals\n"), extracted.vitalsText);
  assert.ok(extracted.labsText.startsWith("Labs\n"), extracted.labsText);
  assert.deepEqual(extracted.studies, [{ label: "EKG 12 Lead", text: "sinus tach." }]);
  const empty = extractNoteClinicalData({}, { noteType: "progress" });
  assert.equal(empty.medicationsText, "");
  assert.equal(empty.vitalsText, "");
  assert.equal(empty.labsText, "");
  assert.deepEqual(empty.studies, []);
}

console.log("note-clinical-extractor tests passed");
