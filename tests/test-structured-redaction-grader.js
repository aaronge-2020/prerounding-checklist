import assert from "node:assert/strict";
import { gradeStructuredRedaction, summarizeStructuredGrade, validateStructuredCorpus } from "../scripts/grade-structured-redaction.js";

const text = "Patient: Ada Example. Assessment: Parkinson disease.";
const phiStart = text.indexOf("Ada Example");
const protectedStart = text.indexOf("Parkinson disease");
const corpus = [{
  id: "grader-contract",
  text,
  annotations: {
    phi: [{ start: phiStart, end: phiStart + 11, text: "Ada Example", category: "PATIENT_NAME" }],
    protected: [{ start: protectedStart, end: protectedStart + 17, text: "Parkinson disease", category: "CLINICAL_TERM" }]
  }
}];

assert.equal(validateStructuredCorpus(corpus, { minimumCases: 1, minimumCharactersPerCase: 1 }).eligible, true);

const clean = gradeStructuredRedaction(corpus, [{
  id: "grader-contract",
  text: "Patient: [PATIENT NAME]. Assessment: Parkinson disease.",
  entities: [{ start: phiStart, end: phiStart + 11, label: "PATIENT_NAME", placeholder: "[PATIENT NAME]" }]
}], { minimumCases: 1, minimumCharactersPerCase: 1 });
assert.equal(clean.passed, true);
assert.equal(clean.metrics.phiRecall, 1);

const broken = gradeStructuredRedaction(corpus, [{
  id: "grader-contract",
  text: "Patient: Ada Example. Assessment: [NAME].",
  entities: [{ start: protectedStart, end: protectedStart + 17, label: "NAME", placeholder: "[NAME]" }]
}], { minimumCases: 1, minimumCharactersPerCase: 1 });
assert.equal(broken.passed, false);
assert.equal(broken.metrics.failureCounts["missed-phi-span"], 1);
assert.equal(broken.survivingPhiValues.length, 1);
assert.equal(broken.metrics.failureCounts["protected-span-redacted"], 1);
assert.deepEqual(summarizeStructuredGrade(broken).failureClusters.map((cluster) => cluster.occurrences), [1, 1]);

const undersized = validateStructuredCorpus(corpus);
assert.equal(undersized.eligible, false);
assert.ok(undersized.problems.some((problem) => problem.type === "too-few-cases"));
assert.ok(undersized.problems.some((problem) => problem.type === "case-too-short"));

console.log("Structured redaction grader tests passed.");
