import assert from "node:assert/strict";
import { gradeStructuredRedaction } from "../scripts/grade-structured-redaction.js";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";
import { makeStructuredDeidComplexCases } from "./fixtures/structured-deid-complex-corpus.js";

const cases = makeStructuredDeidComplexCases(100);
const runItems = cases.map((caseItem) => ({
  id: caseItem.id,
  output: deidentifyTextStructuredOnly(caseItem.text, caseItem.admissionDate, {
    relativeDate: caseItem.relativeDate
  })
}));
const grade = gradeStructuredRedaction(cases, runItems);

assert.equal(grade.corpus.eligible, true);
assert.equal(grade.metrics.phiSpanCount, 6400);
assert.equal(grade.metrics.protectedSpanCount, 1500);
assert.equal(grade.metrics.phiRecall, 1);
assert.equal(grade.metrics.categoryAccuracy, 1);
assert.deepEqual(grade.metrics.failureCounts, {});
assert.equal(grade.survivingPhiValues.length, 0);
assert.equal(grade.passed, true);

console.log("Structured redaction corpus passed:", JSON.stringify({
  cases: grade.corpus.caseCount,
  characters: grade.corpus.characterCount,
  phiSpans: grade.metrics.phiSpanCount,
  protectedSpans: grade.metrics.protectedSpanCount
}));
