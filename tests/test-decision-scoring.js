import assert from "node:assert/strict";
import {
  buildDifferentialScoringRequest,
  DECISION1_MIN_CANDIDATES,
  DECISION1_OPENROUTER_MODEL,
  DECISION1_QUESTION_ID,
  formatProbability,
  parseDifferentialScoringResponse
} from "../src/ai/decision-scoring.js";

// --- Request builder ---
const request = buildDifferentialScoringRequest({
  problem: "Chest pain",
  contextText: "Key context: 45M, acute onset\nVitals: HR 110",
  differentials: [
    { id: "d1", diagnosis: "Acute coronary syndrome", cluesFor: "Troponin bump", cluesAgainst: "" },
    { id: "d2", diagnosis: "Pulmonary embolism", cluesFor: "Tachycardia", cluesAgainst: "No DVT signs" },
    { id: "d3", diagnosis: "Aortic dissection", cluesFor: "", cluesAgainst: "No tearing radiation" }
  ]
});
assert.equal(request.endpoint, "https://openrouter.ai/api/alpha/decisions");
assert.equal(request.body.model, DECISION1_OPENROUTER_MODEL);
assert.equal(request.questionId, DECISION1_QUESTION_ID);
assert.deepEqual(request.optionIds, ["dx0", "dx1", "dx2"]);
assert.deepEqual(request.differentialIds, ["d1", "d2", "d3"]);
const question = request.body.questions[DECISION1_QUESTION_ID];
assert.equal(question.type, "choice");
assert.ok(question.instructions.length > 20, "instructions must explain the ranking task");
assert.ok(question.criteria.dx0.includes("Acute coronary syndrome"), "criteria carry the diagnosis");
assert.ok(question.criteria.dx0.includes("Troponin bump"), "criteria carry clues for");
assert.ok(question.criteria.dx1.includes("No DVT signs"), "criteria carry clues against");
assert.ok(String(request.body.state).includes("Chest pain"), "state carries the problem");
assert.ok(String(request.body.state).includes("HR 110"), "state carries the context");
console.log("✓ request builder shapes a valid Decisions-API choice question");

// Fewer than two candidates is a hard error, never a silent trivial ranking.
assert.throws(
  () => buildDifferentialScoringRequest({
    problem: "Fever",
    contextText: "",
    differentials: [{ id: "d1", diagnosis: "Viral URI", cluesFor: "", cluesAgainst: "" }]
  }),
  new RegExp(`at least ${DECISION1_MIN_CANDIDATES}`),
  "single candidate must throw"
);
assert.throws(
  () => buildDifferentialScoringRequest({ problem: "Fever", differentials: [] }),
  /at least/,
  "empty differential must throw"
);
// Blank diagnoses are dropped, not sent as empty options.
assert.throws(
  () => buildDifferentialScoringRequest({
    problem: "Fever",
    differentials: [
      { id: "d1", diagnosis: "  ", cluesFor: "", cluesAgainst: "" },
      { id: "d2", diagnosis: "Viral URI", cluesFor: "", cluesAgainst: "" }
    ]
  }),
  /at least/,
  "blank diagnoses do not count as candidates"
);
console.log("✓ request builder rejects under-populated differentials");

// --- Response parser ---
const validResponse = {
  id: "gen-dec-1",
  model: "microsoft/microsoft-decision-1-20261009",
  provider: "Azure",
  answers: {
    [DECISION1_QUESTION_ID]: {
      type: "choice",
      choice: "dx1",
      confidence: 0.61,
      probabilities: { dx0: 0.22, dx1: 0.63, dx2: 0.15 }
    }
  },
  usage: { input_tokens: 400, output_tokens: 0 }
};
const parsed = parseDifferentialScoringResponse(validResponse, {
  questionId: DECISION1_QUESTION_ID,
  optionIds: ["dx0", "dx1", "dx2"]
});
assert.equal(parsed.choice, "dx1");
assert.equal(parsed.confidence, 0.61);
assert.deepEqual(
  parsed.ranked.map((r) => r.optionId),
  ["dx1", "dx0", "dx2"],
  "ranked highest-probability first"
);
assert.equal(parsed.ranked[0].probability, 0.63);
console.log("✓ response parser returns the ranked distribution");

// Malformed replies throw loudly — a bad score must never render quietly.
const missingAnswer = { answers: {} };
assert.throws(
  () => parseDifferentialScoringResponse(missingAnswer, { questionId: DECISION1_QUESTION_ID, optionIds: ["dx0", "dx1"] }),
  /did not contain the differential answer/
);
const wrongType = { answers: { [DECISION1_QUESTION_ID]: { type: "score", score: 2 } } };
assert.throws(
  () => parseDifferentialScoringResponse(wrongType, { questionId: DECISION1_QUESTION_ID, optionIds: ["dx0", "dx1"] }),
  /expected "choice"/
);
const missingProbability = {
  answers: { [DECISION1_QUESTION_ID]: { type: "choice", choice: "dx0", probabilities: { dx0: 0.9 } } }
};
assert.throws(
  () => parseDifferentialScoringResponse(missingProbability, { questionId: DECISION1_QUESTION_ID, optionIds: ["dx0", "dx1"] }),
  /no valid probability for candidate "dx1"/
);
const outOfRange = {
  answers: { [DECISION1_QUESTION_ID]: { type: "choice", choice: "dx0", probabilities: { dx0: 1.4, dx1: -0.2 } } }
};
assert.throws(
  () => parseDifferentialScoringResponse(outOfRange, { questionId: DECISION1_QUESTION_ID, optionIds: ["dx0", "dx1"] }),
  /no valid probability/
);
assert.throws(
  () => parseDifferentialScoringResponse(validResponse, { questionId: DECISION1_QUESTION_ID, optionIds: [] }),
  /option ids/
);
console.log("✓ response parser rejects malformed replies");

// --- Probability formatting ---
assert.equal(formatProbability(0.723), "72%");
assert.equal(formatProbability(0), "0%");
assert.equal(formatProbability(1), "100%");
assert.equal(formatProbability(0.005), "1%");
assert.equal(formatProbability(NaN), "—");
assert.equal(formatProbability(1.5), "—");
assert.equal(formatProbability("0.5"), "—");
console.log("✓ probability formatting");

console.log("\nAll decision-scoring assertions passed.");
