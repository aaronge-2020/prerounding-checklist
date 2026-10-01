// Regression test for src/ui/sample-notes/import-plan.js, the pure
// fixture-to-import-plan conversion behind "Add to vault".
//
// Guards the import contract: every fixture note produces an ordered plan
// of admission sources (note, vitals, labs, medications, imaging), each
// source text opens with the canonical header the app's own parsers
// recognize ("Labs", "Vitals", "Medications"), each part carries its
// sourceKind/label/role, imaging parts carry the imaging result category,
// and structured sources never embed a patient header line (which would
// pollute medication parsing and drug checks). Also guards the stable
// import key used for duplicate detection.
//
// Node built-ins only. Run from the repo root:
//   node tests/test-sample-notes-import-plan.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildImportPlan, sampleImportKey } from "../src/ui/sample-notes/import-plan.js";
import { clinicalDisplayModelFromPromptText } from "../src/patient-context/structured-clinical-data.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const notes = JSON.parse(readFileSync(join(root, "src/data/sample-notes.json"), "utf8"));

let checked = 0;
for (const note of notes) {
  const plan = buildImportPlan(note);
  assert.ok(Array.isArray(plan) && plan.length > 0, `${note.id}: plan is non-empty`);

  const kinds = plan.map((part) => part.sourceKind);
  // The note body always imports first as the admission note.
  assert.equal(kinds[0], "primary_note", `${note.id}: first part is the note`);
  assert.ok(kinds.includes("vital_signs"), `${note.id}: plan includes vitals`);
  assert.ok(kinds.includes("laboratory_results"), `${note.id}: plan includes labs`);
  assert.ok(kinds.includes("medication_activity"), `${note.id}: plan includes medications`);

  const byKind = new Map();
  for (const part of plan) {
    assert.ok(typeof part.sourceKind === "string" && part.sourceKind, `${note.id}: part has a sourceKind`);
    assert.ok(typeof part.label === "string" && part.label.trim(), `${note.id}: part has a label`);
    assert.ok(typeof part.role === "string" && part.role.trim(), `${note.id}: part has a role`);
    assert.ok(typeof part.sourceText === "string" && part.sourceText.trim(), `${note.id}: part has source text`);
    if (!byKind.has(part.sourceKind)) byKind.set(part.sourceKind, []);
    byKind.get(part.sourceKind).push(part);
  }

  const vitals = byKind.get("vital_signs")[0];
  assert.ok(vitals.sourceText.startsWith("Vitals\n"), `${note.id}: vitals text uses the canonical header`);
  const vitalsModel = clinicalDisplayModelFromPromptText("vital_signs", vitals.sourceText);
  assert.ok(vitalsModel && vitalsModel.groups.length > 0, `${note.id}: vitals text parses into the vitals model`);

  const labs = byKind.get("laboratory_results")[0];
  assert.ok(labs.sourceText.startsWith("Labs\n"), `${note.id}: labs text uses the canonical header`);
  const labsModel = clinicalDisplayModelFromPromptText("laboratory_results", labs.sourceText);
  assert.ok(labsModel && labsModel.groups.length > 0, `${note.id}: labs text parses into the labs model`);

  const meds = byKind.get("medication_activity")[0];
  assert.ok(meds.sourceText.startsWith("Medications\n"), `${note.id}: meds text uses the canonical header`);
  const medsModel = clinicalDisplayModelFromPromptText("medication_activity", meds.sourceText);
  assert.ok(medsModel && medsModel.groups.length > 0, `${note.id}: meds text parses into the medication model`);
  // No patient header in structured sources: a "Patient: ..." line would
  // parse as a bogus medication and pollute drug checks.
  for (const line of meds.sourceText.split("\n").slice(1)) {
    assert.ok(!/^patient\s*:/i.test(line.trim()), `${note.id}: medication line is not a patient header: ${line.slice(0, 40)}`);
  }

  const imaging = byKind.get("results") || [];
  for (const part of imaging) {
    assert.equal(part.resultCategory, "imaging", `${note.id}: imaging part carries the imaging category`);
  }
  if (note.id === "clinic-dm-htn") {
    assert.equal(imaging.length, 0, "clinic visit has no imaging parts");
  } else {
    assert.ok(imaging.length > 0, `${note.id}: plan includes imaging`);
  }

  assert.equal(sampleImportKey(note), note.id, `${note.id}: import key is the stable note id`);
  checked += 1;
}

// Defensive behavior on malformed input.
assert.deepEqual(buildImportPlan(null), [], "null note yields an empty plan");
assert.deepEqual(buildImportPlan({}), [], "empty note yields an empty plan");
assert.equal(sampleImportKey(null), "", "null note yields an empty import key");

console.log(`sample notes import plan: ${checked} fixtures checked, all assertions passed.`);
