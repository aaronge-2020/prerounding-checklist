import assert from "node:assert/strict";
import {
  AP_RESPONSE_SCHEMA,
  apResultToHtml,
  buildApContextText,
  buildApPrompt,
  parseApResult
} from "../src/ai/ap-generator.js";
import { generateProblemApWithOpenAi } from "../src/ui/openai-ap-api.js";

// --- Pure prompt/context builders ---
const contextText = buildApContextText({
  oneLiner: "65M with acute decompensated heart failure",
  hpi: "3 days of progressive dyspnea on exertion and orthopnea",
  pastMedicalHistory: "HFrEF (EF 30%), hypertension",
  medications: "Furosemide 40 mg PO daily",
  allergies: "NKDA"
});
assert.ok(contextText.includes("One-liner: 65M"));
assert.ok(contextText.includes("Home medications: Furosemide"));

const prompt = buildApPrompt({
  problem: "Acute decompensated heart failure",
  keyContext: "Volume overloaded, EF 30%",
  existingDifferentials: ["Pneumonia"],
  contextText
});
assert.ok(prompt.includes("Acute decompensated heart failure"));
assert.ok(prompt.includes("ORDER-LEVEL SPECIFICITY"));
assert.ok(prompt.includes("ORIGINAL clinical trial paper"));
assert.ok(prompt.includes("NEVER invent a citation"));
assert.ok(prompt.includes("STRICT JSON"));

// --- Response parsing ---
const raw = {
  differentials: [
    { diagnosis: "ADHF exacerbation", reasoning: "Orthopnea and known HFrEF", likelihood: "most likely" },
    { diagnosis: "Pneumonia", reasoning: "Possible infiltrate", likelihood: "possible" },
    { diagnosis: "", reasoning: "empty, should be dropped", likelihood: "likely" }
  ],
  diagnosticPlan: [
    { order: "BNP", indication: "Confirm decompensation", citationIds: [1] },
    { order: "CXR", indication: "Pulmonary edema", citationIds: [99] }
  ],
  therapeuticPlan: [
    { order: "Furosemide", details: "40 mg IV BID", rationale: "Diuresis", citationIds: [1] }
  ],
  references: [
    { id: 1, title: "PARADIGM-HF", authors: "McMurray JJV et al.", journal: "N Engl J Med", year: "2014", url: "https://pubmed.ncbi.nlm.nih.gov/25176015/" },
    { id: 2, title: "Unused ref", authors: "", journal: "", year: "", url: "not-a-url" }
  ]
};
const parsed = parseApResult(raw);
assert.equal(parsed.differentials.length, 2);
assert.equal(parsed.differentials[0].diagnosis, "ADHF exacerbation");
assert.equal(parsed.differentials[0].likelihood, "most likely");
assert.equal(parsed.diagnosticPlan[0].citationIds.length, 1);
assert.equal(parsed.diagnosticPlan[1].citationIds.length, 0, "unknown citation id is dropped");
assert.equal(parsed.references[1].url, "", "non-http URL is stripped");

// --- HTML rendering ---
const html = apResultToHtml(parsed);
assert.ok(html.diagnosticPlanHtml.includes("<strong>BNP</strong>"));
assert.ok(html.diagnosticPlanHtml.includes('href="https://pubmed.ncbi.nlm.nih.gov/25176015/"'));
assert.ok(html.diagnosticPlanHtml.includes("[1]"));
assert.ok(html.therapeuticPlanHtml.includes("40 mg IV BID"));
assert.ok(html.therapeuticPlanHtml.includes("References"));

// --- API wrapper with mocked fetch ---
const expectedJson = {
  differentials: [{ diagnosis: "ADHF", reasoning: "classic", likelihood: "most likely" }],
  diagnosticPlan: [],
  therapeuticPlan: [{ order: "Furosemide 40 mg IV BID", details: "Diurese", rationale: "Volume overload", citationIds: [] }],
  references: []
};
let capturedBody = null;
const result = await generateProblemApWithOpenAi({
  apiKey: "test-key",
  model: "gpt-5.6",
  problem: "Heart failure",
  keyContext: "overloaded",
  existingDifferentials: [],
  contextText: "65M with ADHF",
  fetchImpl: async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(expectedJson) }) };
  }
});
assert.equal(result.differentials[0].diagnosis, "ADHF");
assert.equal(result.therapeuticPlan[0].order, "Furosemide 40 mg IV BID");
assert.deepEqual(capturedBody.tools, [{ type: "web_search" }], "web_search tool is requested for citation grounding");
assert.equal(capturedBody.text.format.name, "problem_assessment_plan");
assert.ok(capturedBody.input.includes("Heart failure"));

// --- Guards ---
await assert.rejects(
  generateProblemApWithOpenAi({ apiKey: "", problem: "x", fetchImpl: async () => ({}) }),
  /Save an OpenAI API key/
);
await assert.rejects(
  generateProblemApWithOpenAi({ apiKey: "k", problem: "", keyContext: "", fetchImpl: async () => ({}) }),
  /Name the clinical problem/
);
assert.throws(() => parseApResult(null), /empty or malformed/);
assert.throws(() => parseApResult({ differentials: [], diagnosticPlan: [], therapeuticPlan: [], references: [] }), /no usable/);

// Schema sanity: strict-mode compatible
assert.equal(AP_RESPONSE_SCHEMA.type, "object");
assert.equal(AP_RESPONSE_SCHEMA.additionalProperties, false);
assert.ok(AP_RESPONSE_SCHEMA.required.includes("references"));

console.log("test-openai-ap-format: all assertions passed");
