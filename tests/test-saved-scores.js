import assert from "node:assert/strict";
import {
  appendSavedScore,
  createSavedScoreRecord,
  formatSavedScoreForNote,
  formatSavedScoreLabel,
  listSavedScores,
  normalizeSavedScores,
  removeSavedScore,
  SAVED_SCORE_SCHEMA
} from "../src/clinical-scores/saved-scores.js";

const DEFINITION = { id: "chadsvasc", title: "CHA₂DS₂-VASc" };
const COMPLETE_RESULT = {
  complete: true,
  interpretation: {
    headline: "3 points",
    detail: "3.2% annual stroke risk.",
    band: "intermediate"
  }
};
const NOW = "2026-09-26T12:00:00.000Z";

function makeRecord(overrides = {}) {
  return {
    id: "score_1",
    schema: SAVED_SCORE_SCHEMA,
    scoreId: "chadsvasc",
    title: "CHA₂DS₂-VASc",
    headline: "3 points",
    detail: "3.2% annual stroke risk.",
    band: "intermediate",
    savedAt: NOW,
    ...overrides
  };
}

// createSavedScoreRecord builds a vault record from a definition + result.
const record = createSavedScoreRecord({
  definition: DEFINITION,
  result: COMPLETE_RESULT,
  now: () => NOW
});
assert.ok(record, "complete result produces a record");
assert.equal(record.schema, SAVED_SCORE_SCHEMA);
assert.equal(record.scoreId, "chadsvasc");
assert.equal(record.title, "CHA₂DS₂-VASc");
assert.equal(record.headline, "3 points");
assert.equal(record.detail, "3.2% annual stroke risk.");
assert.equal(record.band, "intermediate");
assert.equal(record.savedAt, NOW);
assert.ok(record.id.startsWith("score_"), "record has a generated id");

// Incomplete results and missing inputs never produce a record.
assert.equal(createSavedScoreRecord({ definition: DEFINITION, result: { complete: false } }), null);
assert.equal(createSavedScoreRecord({ definition: DEFINITION, result: null }), null);
assert.equal(createSavedScoreRecord({ definition: null, result: COMPLETE_RESULT }), null);
// An empty headline means there is nothing worth saving.
// A result sentence with no headline (Light's Criteria) still saves.
assert.equal(
  createSavedScoreRecord({ definition: DEFINITION, result: { complete: true, interpretation: {} } }),
  null
);
const headlineLess = createSavedScoreRecord({
  definition: DEFINITION,
  result: { complete: true, interpretation: { headline: "", detail: "None of Light's criteria met; suggests likely transudative effusion." } },
  now: () => NOW
});
assert.ok(headlineLess, "headline-less result with a detail saves");
assert.equal(headlineLess.headline, "");
assert.equal(
  formatSavedScoreForNote(headlineLess),
  "CHA₂DS₂-VASc — None of Light's criteria met; suggests likely transudative effusion."
);

// normalizeSavedScores: drops junk, dedupes, newest first.
const dupe = makeRecord();
const normalized = normalizeSavedScores(
  [dupe, { ...dupe }, makeRecord({ id: "score_2", headline: "", savedAt: "2020-01-01T00:00:00Z" }), null, "junk"],
  { now: () => NOW }
);
assert.equal(normalized.length, 1, "dedupes identical ids and drops empty headlines");
assert.equal(normalized[0].id, "score_1");

const ordered = normalizeSavedScores(
  [makeRecord({ id: "old", savedAt: "2020-01-01T00:00:00Z" }), makeRecord({ id: "new", savedAt: "2026-01-01T00:00:00Z" })],
  { now: () => NOW }
);
assert.deepEqual(ordered.map((entry) => entry.id), ["new", "old"], "newest first");

// appendSavedScore / removeSavedScore are immutable helpers.
const appended = appendSavedScore([], makeRecord());
assert.equal(appended.length, 1);
assert.equal(appendSavedScore(appended, makeRecord()).length, 1, "append dedupes by id");
assert.equal(removeSavedScore(appended, "score_1").length, 0);
assert.equal(removeSavedScore(appended, "missing").length, 1, "removing unknown id is a no-op");

// Formatting for note insertion.
assert.equal(
  formatSavedScoreForNote(makeRecord()),
  "CHA₂DS₂-VASc: 3 points — 3.2% annual stroke risk."
);
assert.equal(
  formatSavedScoreForNote(makeRecord({ detail: "" })),
  "CHA₂DS₂-VASc: 3 points"
);
assert.equal(formatSavedScoreLabel(makeRecord()), "CHA₂DS₂-VASc — 3 points");
assert.equal(formatSavedScoreForNote(null), "");

// listSavedScores reads from the patient record defensively.
assert.deepEqual(listSavedScores(null), []);
assert.deepEqual(listSavedScores({}), []);
assert.equal(listSavedScores({ savedScores: [makeRecord()] }).length, 1);

console.log("saved-score model tests passed");
