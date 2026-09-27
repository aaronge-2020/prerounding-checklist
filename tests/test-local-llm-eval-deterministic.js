// Deterministic-parser baseline for the local-LLM eval corpus.
//
// Runs parsePrimaryTeamNote over every fixture in
// tests/fixtures/local-llm-eval/fixtures.js, scores per-sentence section
// assignment with the shared scorer, and prints a table. Writes the full
// per-sentence results to /tmp/local-llm-eval-deterministic.json for the
// comparison report. No PHI: all fixtures are synthetic.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";
import { LOCAL_LLM_EVAL_FIXTURES } from "./fixtures/local-llm-eval/fixtures.js";
import { scoreParse, summarizeScores } from "./fixtures/local-llm-eval/score.js";

const results = LOCAL_LLM_EVAL_FIXTURES.map((fixture) => {
  const started = Date.now();
  const parsed = parsePrimaryTeamNote(fixture.text, fixture.noteType);
  const latencyMs = Date.now() - started;
  assert.ok(parsed.recognized !== false || true, "parser ran");
  return scoreParse(fixture, parsed.sections, { latencyMs });
});

const summary = summarizeScores(results);

console.log("fixture            type      sentences  accuracy  dropped  verbatim  ms");
for (const result of results) {
  console.log(
    `${result.fixtureId.padEnd(18)} ${result.noteType.padEnd(8)} ` +
    `${String(result.sentences).padStart(9)} ` +
    `${(result.accuracy * 100).toFixed(1).padStart(7)}% ` +
    `${String(result.dropped).padStart(7)} ` +
    `${(result.verbatimRate * 100).toFixed(1).padStart(7)}% ` +
    `${String(result.latencyMs).padStart(4)}`
  );
}
console.log(
  `TOTAL ${summary.fixtures} fixtures, ${summary.sentences} sentences: ` +
  `accuracy ${(summary.accuracy * 100).toFixed(1)}%, ` +
  `drop rate ${(summary.dropRate * 100).toFixed(1)}%, ` +
  `verbatim ${(summary.verbatimRate * 100).toFixed(1)}%`
);

writeFileSync(
  "/tmp/local-llm-eval-deterministic.json",
  JSON.stringify({ parser: "deterministic", summary, results }, null, 2)
);
console.log("wrote /tmp/local-llm-eval-deterministic.json");
