// Regression test for src/data/sample-notes.json, the fictional full
// patient charts that power the Sample Notes test data tab.
//
// Every chart is synthetic fixture data for exercising the de-identification
// pipeline end to end with zero real patient data. This test guards the
// fixture contract: the JSON parses, every entry carries the fields the UI
// needs, note bodies are long enough to be realistic, each chart carries
// labs, medications, vitals, and imaging sections (except the routine
// clinic visit, which has no imaging), and every section carries synthetic
// PHI tokens (name, MRN, DOB, dates) so the fixtures actually test the
// de-identification pipeline.
//
// The generated JS data module the app imports must carry the exact same
// payload as the JSON source of truth; regenerate it with
// `npm run build:sample-notes-data` if the drift check fails.
//
// Node built-ins only. Run from the repo root:
//   node tests/test-sample-notes-data.js
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_NOTES_DATA } from "../src/data/sample-notes.data.js";
import {
  availableSections,
  resolveSection,
  buildSectionText,
  buildChartText
} from "../src/ui/sample-notes/presentation.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const fromJson = JSON.parse(readFileSync(join(root, "src", "data", "sample-notes.json"), "utf8"));
assert.deepStrictEqual(SAMPLE_NOTES_DATA, fromJson, "sample-notes.data.js drifted from sample-notes.json");

assert.ok(Array.isArray(fromJson), "sample-notes.json must be a top-level array");
assert.strictEqual(fromJson.length, 9, "expected nine sample charts");

const EXPECTED_IDS = ["adhf-hp", "lapchole-pod2", "cap-discharge", "ed-chest-pain", "icu-septic-shock", "clinic-dm-htn", "cirrhosis-etoh", "ugi-bleed", "pe-workup"];
assert.deepStrictEqual(
  fromJson.map((note) => note.id),
  EXPECTED_IDS,
  "sample chart ids changed; update the expected list deliberately if charts are added or removed"
);

// Every chart carries coverage metadata ("Try with this chart") so the UI can
// show which calculators, cheat sheets, and drug interactions the chart
// exercises. Coverage ids must be real: calculators from the clinical-scores
// registry, cheat sheets from cheat-sheets.json.
const KNOWN_CALCULATORS = new Set(["ascvd", "chadsvasc", "hasbled", "heart", "timi", "grace", "wells-dvt", "wells-pe", "perc", "curb65", "lights", "meldna", "child-pugh", "fib4", "fena", "crcl", "qsofa", "sofa", "blatchford", "anion-gap", "corrected-calcium"]);
const cheatSheets = JSON.parse(readFileSync(new URL("../src/data/cheat-sheets.json", import.meta.url), "utf8"));
const KNOWN_SHEETS = new Set(cheatSheets.sheets.map((s) => s.id));

const seenIds = new Set();
const seenMrns = new Set();
for (const note of fromJson) {
  assert.ok(note && typeof note === "object", "each entry must be an object");
  for (const field of ["id", "title", "type", "description", "body"]) {
    assert.ok(typeof note[field] === "string" && note[field].trim() !== "", `chart ${note.id} needs a non-empty ${field}`);
  }
  assert.ok(!seenIds.has(note.id), `duplicate chart id: ${note.id}`);
  seenIds.add(note.id);
  // Realistic length floor: the shortest fixture is a focused progress note.
  assert.ok(note.body.length >= 3000, `chart ${note.id} body is suspiciously short (${note.body.length} chars)`);
  // Every fixture must carry synthetic PHI tokens the de-id pipeline can find.
  assert.match(note.body, /MRN: \d{8}/, `chart ${note.id} is missing a synthetic MRN`);
  assert.match(note.body, /\d{3}-\d{3}-\d{4}/, `chart ${note.id} is missing a synthetic phone number`);
  assert.match(note.body, /\d{2}\/\d{2}\/\d{4}/, `chart ${note.id} is missing a synthetic date`);
  assert.match(note.body, /DOB:/, `chart ${note.id} is missing a synthetic DOB line`);

  // Patient header must agree with the note body: same name and MRN.
  const p = note.patient;
  assert.ok(p && typeof p === "object", `chart ${note.id} needs a patient object`);
  for (const field of ["name", "dob", "mrn"]) {
    assert.ok(typeof p[field] === "string" && p[field].trim() !== "", `chart ${note.id} patient needs ${field}`);
  }
  assert.ok(Number.isInteger(p.age) && p.age > 0, `chart ${note.id} patient needs an age`);
  assert.ok(note.body.includes(p.name), `chart ${note.id} body does not mention patient name ${p.name}`);
  const bodyMrn = note.body.match(/MRN: (\d{8})/)[1];
  assert.strictEqual(p.mrn, bodyMrn, `chart ${note.id} patient MRN disagrees with the note body`);
  assert.ok(!seenMrns.has(p.mrn), `two fixtures share MRN ${p.mrn}`);
  seenMrns.add(p.mrn);

  // Labs: at least two panels; every panel and test well formed.
  assert.ok(Array.isArray(note.labs) && note.labs.length >= 2, `chart ${note.id} needs at least two lab panels`);
  let testCount = 0;
  for (const panel of note.labs) {
    assert.ok(typeof panel.panel === "string" && panel.panel.trim() !== "", `chart ${note.id} lab panel needs a name`);
    assert.ok(typeof panel.collected === "string" && panel.collected.trim() !== "", `chart ${note.id} lab panel needs a collection time`);
    assert.ok(Array.isArray(panel.tests) && panel.tests.length > 0, `chart ${note.id} lab panel ${panel.panel} needs tests`);
    for (const t of panel.tests) {
      assert.ok(typeof t.name === "string" && t.name.trim() !== "", `chart ${note.id} lab test needs a name`);
      assert.ok(typeof t.value === "string" && t.value.trim() !== "", `chart ${note.id} lab test ${t.name} needs a value`);
      testCount += 1;
    }
  }
  assert.ok(testCount >= 10, `chart ${note.id} has only ${testCount} lab tests`);

  // Medications: at least six orders with full sig fields.
  assert.ok(Array.isArray(note.medications) && note.medications.length >= 6, `chart ${note.id} needs at least six medications`);
  for (const m of note.medications) {
    for (const field of ["name", "dose", "route", "frequency", "status"]) {
      assert.ok(typeof m[field] === "string" && m[field].trim() !== "", `chart ${note.id} medication ${m.name} needs ${field}`);
    }
  }

  // Vitals: a flowsheet with at least five timepoints.
  assert.ok(Array.isArray(note.vitals) && note.vitals.length >= 5, `chart ${note.id} needs at least five vital timepoints`);
  for (const v of note.vitals) {
    assert.ok(typeof v.time === "string" && v.time.trim() !== "", `chart ${note.id} vital row needs a time`);
    const filled = ["temp", "hr", "bp", "rr", "spo2", "pain"].some((k) => String(v[k] ?? "").trim() !== "");
    assert.ok(filled, `chart ${note.id} vital row ${v.time} has no values`);
  }

  // Imaging: every chart except the routine clinic visit carries reports.
  if (note.id === "clinic-dm-htn") {
    assert.ok(!note.imaging || note.imaging.length === 0, "the clinic fixture must not carry imaging");
  } else {
    assert.ok(Array.isArray(note.imaging) && note.imaging.length > 0, `chart ${note.id} needs imaging reports`);
    for (const img of note.imaging) {
      for (const field of ["modality", "title", "date", "body"]) {
        assert.ok(typeof img[field] === "string" && img[field].trim() !== "", `chart ${note.id} imaging needs ${field}`);
      }
      assert.ok(img.body.includes(p.name) || img.body.includes(p.mrn), `chart ${note.id} imaging report is missing patient PHI`);
    }
  }

  // Section tabs: note always present; imaging tab hidden for the clinic visit.
  const keys = availableSections(note).map((s) => s.key);
  assert.ok(keys[0] === "note", `chart ${note.id} must list the note section first`);
  for (const key of ["labs", "medications", "vitals"]) {
    assert.ok(keys.includes(key), `chart ${note.id} is missing the ${key} section`);
  }
  assert.strictEqual(keys.includes("imaging"), note.id !== "clinic-dm-htn", `chart ${note.id} imaging tab visibility is wrong`);
  assert.strictEqual(resolveSection(note, "nope"), "note", "unknown section must resolve to the note");
  assert.strictEqual(resolveSection(note, "labs"), "labs", "known section must resolve");

  // Coverage metadata ("Try with this chart"): every chart declares which
  // calculators, cheat sheets, and drug interactions it exercises.
  const coverage = note.coverage;
  assert.ok(coverage && typeof coverage === "object", `chart ${note.id} needs coverage metadata`);
  assert.ok(Array.isArray(coverage.calculators) && coverage.calculators.length > 0, `chart ${note.id} needs calculator coverage`);
  for (const calc of coverage.calculators) {
    assert.ok(KNOWN_CALCULATORS.has(calc), `chart ${note.id} references unknown calculator ${calc}`);
  }
  assert.ok(Array.isArray(coverage.cheatSheets) && coverage.cheatSheets.length > 0, `chart ${note.id} needs cheat-sheet coverage`);
  for (const sheet of coverage.cheatSheets) {
    assert.ok(KNOWN_SHEETS.has(sheet), `chart ${note.id} references unknown cheat sheet ${sheet}`);
  }
  assert.ok(Array.isArray(coverage.drugInteractions), `chart ${note.id} needs a drugInteractions array`);
  assert.ok(Array.isArray(coverage.workflows) && coverage.workflows.length > 0, `chart ${note.id} needs workflow coverage`);

  // Section text and full chart text keep synthetic PHI so they test de-id.
  for (const key of keys) {
    if (key === "note") continue;
    const text = buildSectionText(note, key);
    assert.ok(text.includes(p.name) || text.includes(p.mrn), `chart ${note.id} ${key} text is missing patient PHI`);
  }
  const chart = buildChartText(note);
  assert.ok(chart.includes(note.body.trimEnd().slice(0, 60)), `chart ${note.id} chart text must start with the note`);
  assert.ok(chart.includes(p.mrn), `chart ${note.id} chart text is missing the MRN`);
}

// Fixture hygiene: no two charts may share a patient identity (name + MRN),
// which would read as one real person appearing across fixtures.
const identities = fromJson.map((note) => `${note.patient.name} / ${note.patient.mrn}`);
assert.strictEqual(new Set(identities).size, identities.length, "two fixtures share a patient identity");

console.log(`sample-notes-data: ${fromJson.length} charts, all fixture checks passed`);
