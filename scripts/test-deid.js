import assert from "node:assert/strict";
import { deidentifyTextStructuredOnly, modelPredictionsToEntities } from "../deid.js";
import { clinicalGuardTerms, makeDemoLikeCase, makeSyntheticCases } from "./deid-fixtures.js";

function countNeedle(text, needle) {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function leakedForbidden(caseItem, redactedText) {
  return caseItem.forbidden
    .filter((value) => countNeedle(redactedText, value) > 0)
    .sort();
}

function assertCaseClean(caseItem) {
  const result = deidentifyTextStructuredOnly(caseItem.text);
  const leaks = leakedForbidden(caseItem, result.text);
  assert.deepEqual(leaks, [], `${caseItem.id} leaked forbidden strings: ${leaks.join(", ")}`);

  for (const snippet of caseItem.requiredSnippets) {
    assert.ok(result.text.includes(snippet), `${caseItem.id} missing readable snippet: ${snippet}`);
  }

  for (const term of caseItem.clinicalTerms) {
    assert.ok(result.text.includes(term), `${caseItem.id} redacted clinical guard term: ${term}`);
  }

  const highResiduals = result.residualWarnings.filter((warning) => warning.severity === "high");
  assert.deepEqual(highResiduals, [], `${caseItem.id} left high-risk residual warnings.`);
  return result;
}

const demo = makeDemoLikeCase();
const demoResult = assertCaseClean(demo);
assert.ok(!demoResult.text.includes("John Smith"), "demo should redact repeated patient name");
assert.ok(!demoResult.text.includes("Mary Smith"), "demo should redact repeated contact name");
assert.ok(!demoResult.text.includes("Emily Johnson"), "demo should redact provider name");
assert.ok(demoResult.text.includes("Patient Name: [PATIENT NAME]"), "demo should keep the patient header readable");
assert.ok(demoResult.text.includes("Primary endocrinologist: [PROVIDER NAME]"), "demo should keep the provider header readable");

const cases = makeSyntheticCases(100);
for (const caseItem of cases) {
  assertCaseClean(caseItem);
}

const guardText = clinicalGuardTerms.join("\n");
const guardResult = deidentifyTextStructuredOnly(guardText);
for (const term of clinicalGuardTerms) {
  assert.ok(guardResult.text.includes(term), `clinical term should be preserved: ${term}`);
}

const ambiguous = "Assessment: The Blue Ridge protocol was discussed as a teaching phrase.";
const ambiguousResult = deidentifyTextStructuredOnly(ambiguous);
assert.ok(ambiguousResult.text.includes("Blue Ridge"), "ambiguous capitalized phrase should not be auto-redacted without strong context");

const modeled = modelPredictionsToEntities(
  "Patient Name: John Smith\nDOB: 03/14/1998",
  [{ entity_group: "PERSON", start: 14, end: 35, score: 0.99 }]
);
assert.equal(modeled.length, 1, "model span should survive clipping");
assert.deepEqual(
  { start: modeled[0].start, end: modeled[0].end },
  { start: 14, end: 24 },
  "model span reconstruction must not cross a newline/header boundary"
);

console.log(`De-ID tests passed for ${cases.length} synthetic cases plus targeted guards.`);
