import assert from "node:assert/strict";
import { isWorkupSystem, WORKUP_SYSTEM_IDS, workupSystemLabel } from "../src/workups/systems.js";
import { parseWorkupJson } from "../src/workups/schema.js";
import { buildJsonFormatterPrompt, buildOpenEvidenceWorkupDraftPrompt } from "../src/workups/editor.js";

assert.equal(isWorkupSystem("respiratory"), true);
assert.equal(isWorkupSystem("Respiratory"), false);
assert.equal(workupSystemLabel("respiratory"), "Respiratory");
assert.equal(WORKUP_SYSTEM_IDS.includes("functional"), true);

const controlledWorkup = {
  schema: "prerounding_workup_v1",
  id: "controlled-system-test",
  title: "Controlled system test",
  aliases: [],
  items: [
    { id: "history", kind: "history", system: "cardiovascular", text: "Ask about chest pain.", choices: ["No", "Yes"], select: "one" },
    { id: "exam", kind: "exam", system: "respiratory", text: "Auscultate the lungs.", choices: ["Normal", "Abnormal"], select: "one" }
  ]
};

assert.deepEqual(parseWorkupJson(JSON.stringify(controlledWorkup)), controlledWorkup);
assert.throws(
  () => parseWorkupJson(JSON.stringify({ ...controlledWorkup, items: [{ ...controlledWorkup.items[0], system: "Cardiopulmonary" }] })),
  /controlled workup-system id/
);
assert.doesNotMatch(buildOpenEvidenceWorkupDraftPrompt(), /controlled system ID/i);
assert.match(buildJsonFormatterPrompt(), /- cardiovascular: Cardiovascular/);

console.log("controlled workup-system taxonomy tests passed");
