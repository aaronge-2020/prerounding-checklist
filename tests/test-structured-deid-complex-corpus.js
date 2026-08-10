import assert from "node:assert/strict";
import {
  CORPUS_SCHEMA,
  MIN_CASE_CHARACTERS,
  makeStructuredDeidComplexCases
} from "./fixtures/structured-deid-complex-corpus.js";

const cases = makeStructuredDeidComplexCases(100);
assert.equal(cases.length, 100);
assert.equal(new Set(cases.map((item) => item.id)).size, 100);

for (const item of cases) {
  assert.equal(item.schema, CORPUS_SCHEMA);
  assert.equal(item.synthetic, true);
  assert.ok(item.text.length >= MIN_CASE_CHARACTERS, `${item.id} is too short`);
  assert.ok(item.annotations.phi.length > 0, `${item.id} has no PHI truth spans`);
  assert.ok(item.annotations.protected.length > 0, `${item.id} has no protected truth spans`);
  for (const span of [...item.annotations.phi, ...item.annotations.protected]) {
    assert.equal(item.text.slice(span.start, span.end), span.text, `${item.id} has a stale span at ${span.start}`);
  }
}

const summary = {
  cases: cases.length,
  minimumCharacters: Math.min(...cases.map((item) => item.text.length)),
  phiSpans: cases.reduce((total, item) => total + item.annotations.phi.length, 0),
  protectedSpans: cases.reduce((total, item) => total + item.annotations.protected.length, 0)
};

console.log(`Structured de-id synthetic corpus valid: ${JSON.stringify(summary)}`);

