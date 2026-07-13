import assert from "node:assert/strict";
import { formatChecklistAnswersWithOpenAi } from "../src/ui/openai-checklist-api.js";
import { checklistAnswerImportSchema } from "../src/checklist/openevidence-import.js";

const snapshot = {
  schema: "prerounding_checklist_v1",
  id: "checklist_1",
  items: [
    { id: "lung_auscultation", workupTitle: "General admission", kind: "exam", text: "Lung auscultation", choices: ["Clear", "Crackles", "Wheezes"], select: "one", system: "pulmonary" }
  ]
};

const expectedResult = { answers: [{ id: "lung_auscultation", selected: ["Clear"], note: "" }], quickNotes: ["Reports new hearing loss."] };

let capturedRequest = null;
const result = await formatChecklistAnswersWithOpenAi({
  apiKey: "test-api-key",
  model: "gpt-5.6",
  sourceText: "Lungs clear bilaterally. Patient also reports new hearing loss.",
  snapshot,
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(expectedResult) })
    };
  }
});

assert.deepEqual(result, expectedResult);
assert.equal(capturedRequest.url, "https://api.openai.com/v1/responses");
assert.equal(capturedRequest.options.headers.Authorization, "Bearer test-api-key");
const payload = JSON.parse(capturedRequest.options.body);
assert.equal(payload.model, "gpt-5.6");
assert.equal(payload.text.format.type, "json_schema");
assert.equal(payload.text.format.strict, true);
assert.deepEqual(payload.text.format.schema, checklistAnswerImportSchema(snapshot));
assert.match(payload.input, /Return JSON only/i);
assert.match(payload.input, /lung_auscultation/);

await assert.rejects(
  () => formatChecklistAnswersWithOpenAi({ model: "gpt-5.6", sourceText: "draft", snapshot }),
  /Save an OpenAI API key in Settings/
);

await assert.rejects(
  () => formatChecklistAnswersWithOpenAi({ apiKey: "test-api-key", sourceText: "", snapshot }),
  /Paste the de-identified OpenEvidence note/
);

await assert.rejects(
  () => formatChecklistAnswersWithOpenAi({ apiKey: "test-api-key", sourceText: "draft", snapshot: { items: [] } }),
  /Build a checklist before importing/
);

await assert.rejects(
  () => formatChecklistAnswersWithOpenAi({
    apiKey: "test-api-key",
    sourceText: "draft",
    snapshot,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key" } })
    })
  }),
  /OpenAI API request failed \(401\): Invalid key/
);

console.log("OpenAI checklist-formatting tests passed");
