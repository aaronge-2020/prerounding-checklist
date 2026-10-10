import assert from "node:assert/strict";
import {
  AP_RESPONSE_SCHEMA,
  AP_SUGGESTION_ACTIONS,
  AP_SUGGESTION_SCHEMA,
  AP_SUGGESTION_TARGETS,
  buildApRevisionPrompt,
  parseApSuggestions
} from "../src/ai/ap-generator.js";
import { generateProblemApRevisionsWithOpenAi } from "../src/ui/openai-ap-api.js";

// --- Revision prompt builder: scoped to ONE problem ---
const prompt = buildApRevisionPrompt({
  problem: "Acute decompensated heart failure",
  keyContext: "Volume overloaded, EF 30%",
  etiologyStatus: "unknown",
  knownEtiology: "",
  differentials: [
    { diagnosis: "ADHF exacerbation", likelihood: "most likely", cluesFor: "Orthopnea and known HFrEF" },
    { diagnosis: "Pneumonia", likelihood: "possible", cluesFor: "Possible infiltrate" }
  ],
  diagnosticPlan: "BNP\nChest radiograph",
  therapeuticPlan: "Furosemide 40 mg IV BID",
  assessment: "65M with ADHF, volume overloaded",
  vitals: "BP 150/90, HR 110",
  keyLabs: "BNP 2400, creatinine 1.4"
});
assert.ok(prompt.includes("Acute decompensated heart failure"));
assert.ok(prompt.includes("SUGGESTED EDITS, NOT A REWRITE"), "prompt must forbid whole-plan rewrites");
assert.ok(prompt.includes("ADHF exacerbation (most likely) — Orthopnea"), "current differential is included");
assert.ok(prompt.includes("Furosemide 40 mg IV BID"), "current therapeutic plan is included");
assert.ok(prompt.includes("65M with ADHF, volume overloaded"), "assessment synthesis is included");
assert.ok(prompt.includes("Vitals: BP 150/90"), "compact objective data is included");
assert.ok(prompt.includes("NEVER invent a citation"));
assert.ok(prompt.includes("STRICT JSON"));

const promptNoPlans = buildApRevisionPrompt({ problem: "Fever", keyContext: "" });
assert.ok(promptNoPlans.includes("(none written yet)"), "empty plans render as placeholders");
assert.ok(promptNoPlans.includes("FULL COMPLETION"), "blank consult defaults to full-completion mode");

// --- Revision prompt modes: blank consult completes, filled consult answers ---
const promptComplete = buildApRevisionPrompt({
  problem: "Chest pain",
  keyContext: "45M, acute onset",
  mode: "complete",
  consultQuestions: ""
});
assert.ok(promptComplete.includes("FULL COMPLETION"), "complete mode states the full-completion goal");
assert.ok(promptComplete.includes("add-suggestion for EVERY missing piece"), "complete mode asks for every missing piece");
assert.ok(!promptComplete.includes("ANSWER THE CONSULT"), "complete mode has no consult goal");

const promptConsult = buildApRevisionPrompt({
  problem: "Chest pain",
  keyContext: "45M, acute onset",
  mode: "consult",
  consultQuestions: "Should I order a d-dimer?"
});
assert.ok(promptConsult.includes("ANSWER THE CONSULT"), "consult mode states the consult goal");
assert.ok(promptConsult.includes("Should I order a d-dimer?"), "consult questions are woven into the prompt");
assert.ok(promptConsult.includes("do not pad the plan with unrelated changes"), "consult mode stays focused");
assert.ok(!promptConsult.includes("FULL COMPLETION"), "consult mode has no completion goal");

// --- Suggestion response parsing ---
const raw = {
  suggestions: [
    { id: 1, target: "differential", action: "add", suggested: "Pulmonary embolism", rationale: "Tachycardia, consider", likelihood: "possible", citationIds: [1] },
    { id: 2, target: "diagnostic_plan", action: "revise", anchor: "Chest radiograph", suggested: "CT angiography of the chest, PE protocol", rationale: "Better test", citationIds: [1] },
    { id: 3, target: "therapeutic_plan", action: "remove", anchor: "Furosemide 40 mg IV BID", suggested: "", rationale: "Duplicate" },
    { id: 4, target: "differential", action: "add", suggested: "", rationale: "empty, dropped" },
    { id: 5, target: "bogus", action: "add", suggested: "x", rationale: "bad target, dropped" },
    { id: 6, target: "diagnostic_plan", action: "revise", suggested: "no anchor, dropped", rationale: "x" },
    { id: 7, target: "therapeutic_plan", action: "add", suggested: "Metoprolol 25 mg PO daily", rationale: "GDMT", citationIds: [99], likelihood: "bogus-likelihood" }
  ],
  references: [
    { id: 1, title: "PARADIGM-HF", authors: "McMurray JJV et al.", journal: "N Engl J Med", year: "2014", url: "https://pubmed.ncbi.nlm.nih.gov/25176015/" },
    { id: 2, title: "Unused ref", authors: "", journal: "", year: "", url: "not-a-url" }
  ]
};
const parsed = parseApSuggestions(raw);
assert.equal(parsed.suggestions.length, 4, "invalid suggestions are dropped");
assert.equal(parsed.suggestions[0].target, "differential");
assert.equal(parsed.suggestions[0].likelihood, "possible");
assert.deepEqual(parsed.suggestions[0].citationIds, [1]);
assert.equal(parsed.suggestions[1].anchor, "Chest radiograph");
assert.equal(parsed.suggestions[1].suggested, "CT angiography of the chest, PE protocol");
assert.equal(parsed.suggestions[2].action, "remove");
assert.equal(parsed.suggestions[3].likelihood, "", "unknown likelihood is cleared");
assert.deepEqual(parsed.suggestions[3].citationIds, [], "unknown citation id is dropped");
assert.equal(parsed.references[1].url, "", "non-http URL is stripped");
assert.deepEqual(AP_SUGGESTION_TARGETS, ["differential", "diagnostic_plan", "therapeutic_plan"]);
assert.deepEqual(AP_SUGGESTION_ACTIONS, ["add", "revise", "remove"]);

// --- Schema sanity: strict-mode compatible ---
assert.equal(AP_SUGGESTION_SCHEMA.type, "object");
assert.equal(AP_SUGGESTION_SCHEMA.additionalProperties, false);
assert.ok(AP_SUGGESTION_SCHEMA.required.includes("suggestions"));
assert.ok(AP_SUGGESTION_SCHEMA.required.includes("references"));

// --- API wrapper with mocked fetch: the EDITED prompt is sent verbatim ---
const expectedJson = {
  suggestions: [
    { id: 1, target: "diagnostic_plan", action: "add", suggested: "BNP", rationale: "Confirm decompensation", citationIds: [] }
  ],
  references: []
};
let capturedBody = null;
const editedPrompt = "STUDENT-EDITED prompt marker 12345 — only this problem's assessment";
const result = await generateProblemApRevisionsWithOpenAi({
apiKey: ["fake", "key"].join("-"),
  model: "gpt-5.6",
  prompt: editedPrompt,
  fetchImpl: async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(expectedJson) }) };
  }
});
assert.equal(result.suggestions.length, 1);
assert.equal(result.suggestions[0].suggested, "BNP");
assert.equal(capturedBody.input, editedPrompt, "the student's edited prompt is sent verbatim");
assert.deepEqual(capturedBody.tools, [{ type: "web_search" }], "web_search tool is requested for citation grounding");
assert.equal(capturedBody.text.format.name, "problem_plan_suggestions");

// --- Guards ---
await assert.rejects(
  generateProblemApRevisionsWithOpenAi({ apiKey: "", prompt: "x", fetchImpl: async () => ({}) }),
  /Save an OpenAI API key/
);
await assert.rejects(
  generateProblemApRevisionsWithOpenAi({ apiKey: "k", prompt: "   ", fetchImpl: async () => ({}) }),
  /prompt is empty/
);
assert.throws(() => parseApSuggestions(null), /empty or malformed/);
assert.deepEqual(parseApSuggestions({ suggestions: [], references: [] }).suggestions, []);

console.log("test-openai-ap-format: all assertions passed");

// --- OpenAI strict-mode schema compliance ---
// OpenAI's structured outputs require: every property listed in `required`,
// additionalProperties: false at every object level. This validates both
// schemas recursively so a missing `required` entry can never 400 again.
function assertStrictSchema(schema, path) {
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, `${path}: additionalProperties must be false`);
    const props = Object.keys(schema.properties || {});
    const required = schema.required || [];
    for (const p of props) {
      assert.ok(required.includes(p), `${path}: property '${p}' must be in required`);
      assertStrictSchema(schema.properties[p], `${path}.${p}`);
    }
  }
  if (schema.type === "array" && schema.items) {
    assertStrictSchema(schema.items, `${path}[]`);
  }
}
assertStrictSchema(AP_RESPONSE_SCHEMA, "AP_RESPONSE_SCHEMA");
assertStrictSchema(AP_SUGGESTION_SCHEMA, "AP_SUGGESTION_SCHEMA");
console.log("test-openai-ap-format: strict-mode schema compliance passed");
