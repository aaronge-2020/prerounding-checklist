import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createDeidentifier, deidentifyTextStructuredOnly } from "../deid.js";
import { makeAdversarialCases } from "./deid-fixtures.js";
import {
  assertDeidCase,
  scoreDeidCase,
  validateAdversarialCase,
  writeFailureReport
} from "./deid-adversarial.js";

function loadJsonlCases(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

function predictionsFor(input, targets) {
  return targets.flatMap(({ text, label, score = 0.99 }) => {
    const predictions = [];
    let start = 0;
    while (start < input.length) {
      const index = input.indexOf(text, start);
      if (index === -1) {
        break;
      }
      predictions.push({
        entity_group: label,
        start: index,
        end: index + text.length,
        score
      });
      start = index + text.length;
    }
    return predictions;
  });
}

function makeMockDeidentifier(targets, mode = "hybrid") {
  return createDeidentifier({
    mode,
    pipelineFactory: async () => async (input) => predictionsFor(input, targets),
    modelCandidates: [{ modelId: "mock-adversarial-model", options: {} }]
  });
}

const seenIds = new Set();
const cases = [
  ...makeAdversarialCases(),
  ...loadJsonlCases("fixtures/deid/adversarial.curated.jsonl"),
  ...loadJsonlCases("fixtures/deid/adversarial.generated.jsonl")
].map((caseItem) => validateAdversarialCase(caseItem, seenIds));

const failures = [];
for (const caseItem of cases) {
  const result = deidentifyTextStructuredOnly(caseItem.text);
  const score = scoreDeidCase(caseItem, result);
  if (!score.clean) {
    failures.push({
      case: caseItem,
      result: {
        text: result.text,
        entities: result.entities,
        warnings: result.residualWarnings
      },
      failures: score.failures
    });
  }
}

const modelFalsePositiveText = `Patient Name: John Smith
HPI:
Chest Pain
Shortness Of Breath
Daily Labs
Insulin Glargine
TSH
DKA and AKI remain active.
Per Dr. Hu. Room: C3E 54-A.`;
const modelFalsePositiveCase = validateAdversarialCase({
  id: "mock-model-clinical-false-positives",
  category: "mock-model",
  tags: ["mock-model", "false-positive", "clinical-guard"],
  text: modelFalsePositiveText,
  mustRedact: ["John Smith", "Dr. Hu", "C3E 54-A"],
  mustPreserve: ["HPI", "Chest Pain", "Shortness Of Breath", "Daily Labs", "Insulin Glargine", "TSH", "DKA", "AKI"],
  forbiddenWarningSnippets: ["HPI", "Chest Pain", "Shortness Of Breath", "Daily Labs", "Insulin Glargine", "TSH", "DKA", "AKI"],
  expectedPlaceholders: ["Patient Name: [PATIENT NAME]", "Per [PROVIDER NAME]", "Room: [ROOM]"]
}, seenIds);
const falsePositiveTargets = [
  { text: "HPI", label: "PERSON" },
  { text: "Chest Pain", label: "PERSON" },
  { text: "Shortness Of Breath", label: "PERSON" },
  { text: "Daily Labs", label: "ORGANIZATION" },
  { text: "Insulin Glargine", label: "PERSON" },
  { text: "TSH", label: "LOCATION" },
  { text: "DKA", label: "PERSON" },
  { text: "AKI", label: "PERSON" }
];
const modelFalsePositiveResult = await makeMockDeidentifier(falsePositiveTargets).deidentifyText(modelFalsePositiveText);
const modelFalsePositiveScore = scoreDeidCase(modelFalsePositiveCase, modelFalsePositiveResult);
if (!modelFalsePositiveScore.clean) {
  failures.push({
    case: modelFalsePositiveCase,
    result: {
      text: modelFalsePositiveResult.text,
      entities: modelFalsePositiveResult.entities,
      warnings: modelFalsePositiveResult.residualWarnings
    },
    failures: modelFalsePositiveScore.failures
  });
}

const modelTruePositiveText = "Alicia Rivera met the team at Riverside General Hospital. HPI remains DKA-focused.";
const modelTruePositive = await makeMockDeidentifier([
  { text: "Alicia Rivera", label: "PERSON" },
  { text: "Riverside General Hospital", label: "ORGANIZATION" },
  { text: "HPI", label: "PERSON" },
  { text: "DKA", label: "PERSON" }
], "model-only").deidentifyText(modelTruePositiveText);
assert.ok(!modelTruePositive.text.includes("Alicia Rivera"), "model-only should redact true person names");
assert.ok(!modelTruePositive.text.includes("Riverside General Hospital"), "model-only should redact true facility names");
assert.ok(modelTruePositive.text.includes("HPI"), "model-only should preserve HPI false positives");
assert.ok(modelTruePositive.text.includes("DKA"), "model-only should preserve DKA false positives");

if (failures.length) {
  writeFailureReport("benchmark-results/deid-adversarial-failures.json", failures);
}

assert.deepEqual(
  failures.map((failure) => ({ id: failure.case.id, failures: failure.failures })),
  [],
  "adversarial de-ID cases must have zero leaks, zero protected-term false positives, and zero malformed placeholders"
);

for (const caseItem of cases.slice(0, 3)) {
  assertDeidCase(caseItem, deidentifyTextStructuredOnly(caseItem.text));
}

console.log(`Adversarial De-ID tests passed for ${cases.length} deterministic/curated cases plus mocked model guards.`);
