// Regression test for src/data/sample-notes.json, the fictional Epic style
// notes that power the Sample Notes test data tab.
//
// Every note is synthetic fixture data for exercising the de-identification
// pipeline end to end with zero real patient data. This test guards the
// fixture contract: the JSON parses, every entry carries the fields the UI
// needs, bodies are long enough to be realistic, and every body contains
// obvious synthetic PHI tokens (MRN, phone, date) so the fixtures actually
// test the de-identification pipeline.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const fromJson = JSON.parse(readFileSync(join(root, "src", "data", "sample-notes.json"), "utf8"));
assert.deepStrictEqual(SAMPLE_NOTES_DATA, fromJson, "sample-notes.data.js drifted from sample-notes.json");

assert.ok(Array.isArray(fromJson), "sample-notes.json must be a top-level array");
assert.strictEqual(fromJson.length, 6, "expected six sample notes");

const EXPECTED_IDS = ["adhf-hp", "lapchole-pod2", "cap-discharge", "ed-chest-pain", "icu-septic-shock", "clinic-dm-htn"];
assert.deepStrictEqual(
  fromJson.map((note) => note.id),
  EXPECTED_IDS,
  "sample note ids changed; update the expected list deliberately if notes are added or removed"
);

const seenIds = new Set();
for (const note of fromJson) {
  assert.ok(note && typeof note === "object", "each entry must be an object");
  for (const field of ["id", "title", "type", "description", "body"]) {
    assert.ok(typeof note[field] === "string" && note[field].trim() !== "", `note ${note.id} needs a non-empty ${field}`);
  }
  assert.ok(!seenIds.has(note.id), `duplicate note id: ${note.id}`);
  seenIds.add(note.id);
  // Realistic length floor: the shortest fixture is a focused progress note.
  assert.ok(note.body.length >= 3000, `note ${note.id} body is suspiciously short (${note.body.length} chars)`);
  // Every fixture must carry synthetic PHI tokens the de-id pipeline can find.
  assert.match(note.body, /MRN: \d{8}/, `note ${note.id} is missing a synthetic MRN`);
  assert.match(note.body, /\d{3}-\d{3}-\d{4}/, `note ${note.id} is missing a synthetic phone number`);
  assert.match(note.body, /\d{2}\/\d{2}\/\d{4}/, `note ${note.id} is missing a synthetic date`);
  assert.match(note.body, /DOB:/, `note ${note.id} is missing a synthetic DOB line`);
}

// Fixture hygiene: no two notes may share a patient identity (name + MRN),
// which would read as one real person appearing across fixtures.
const identities = fromJson.map((note) => {
  const mrn = note.body.match(/MRN: (\d{8})/)[1];
  const patientLine = note.body.match(/Patient: ([^\n]+)/)[1].trim();
  return `${patientLine} / ${mrn}`;
});
assert.strictEqual(new Set(identities).size, identities.length, "two fixtures share a patient identity");

console.log(`sample-notes-data: ${fromJson.length} notes, all fixture checks passed`);
