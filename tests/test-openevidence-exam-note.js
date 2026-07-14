import assert from "node:assert/strict";
import { normalizeDay } from "../src/app/state/vault.js";
import { createDailyRecord, saveOpenEvidenceExamNote, clearOpenEvidenceExamNote } from "../src/daily-updates/days.js";

// A freshly created day has no exam note yet.
{
  const day = createDailyRecord({ date: "2026-07-13", label: "HD1" });
  assert.equal(day.openEvidenceExamNote, null);
}

// normalizeDay defaults a missing/malformed field to null rather than throwing.
{
  const day = normalizeDay({ id: "day_1" });
  assert.equal(day.openEvidenceExamNote, null);
  const malformed = normalizeDay({ id: "day_2", openEvidenceExamNote: "not an object" });
  assert.equal(malformed.openEvidenceExamNote, null);
}

// normalizeDay preserves and sanitizes an existing exam note.
{
  const raw = {
    id: "day_3",
    openEvidenceExamNote: { text: "MRN: [MRN] exam unremarkable.", residualWarnings: [{ severity: "review", type: "residual" }], savedAt: "2026-07-13T10:00:00.000Z" }
  };
  const day = normalizeDay(raw);
  assert.deepEqual(day.openEvidenceExamNote, {
    text: "MRN: [MRN] exam unremarkable.",
    residualWarnings: [{ severity: "review", type: "residual" }],
    savedAt: "2026-07-13T10:00:00.000Z"
  });
  // residualWarnings defensively defaults to [] if malformed on a saved record.
  const badWarnings = normalizeDay({ id: "day_4", openEvidenceExamNote: { text: "x", residualWarnings: "nope" } });
  assert.deepEqual(badWarnings.openEvidenceExamNote.residualWarnings, []);
}

// saveOpenEvidenceExamNote/clearOpenEvidenceExamNote are pure and update the day's timestamp.
{
  const day = createDailyRecord({ date: "2026-07-13", label: "HD1" });
  const now = () => "2026-07-13T12:00:00.000Z";
  const saved = saveOpenEvidenceExamNote(day, { text: "Exam note text.", residualWarnings: [{ severity: "review" }], now });
  assert.equal(saved.openEvidenceExamNote.text, "Exam note text.");
  assert.deepEqual(saved.openEvidenceExamNote.residualWarnings, [{ severity: "review" }]);
  assert.equal(saved.openEvidenceExamNote.savedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(saved.updatedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(day.openEvidenceExamNote, null, "the input day is not mutated");

  const cleared = clearOpenEvidenceExamNote(saved, { now: () => "2026-07-13T13:00:00.000Z" });
  assert.equal(cleared.openEvidenceExamNote, null);
  assert.equal(cleared.updatedAt, "2026-07-13T13:00:00.000Z");
}

assert.equal(saveOpenEvidenceExamNote(null, { text: "x" }), null, "a missing day is passed through unchanged");
assert.equal(clearOpenEvidenceExamNote(null), null, "a missing day is passed through unchanged");

console.log("OpenEvidence exam note schema tests passed");
