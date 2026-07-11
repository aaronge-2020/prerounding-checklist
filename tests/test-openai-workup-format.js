import assert from "node:assert/strict";
import { formatWorkupDraftWithOpenAi, WORKUP_JSON_SCHEMA } from "../src/ui/openai-workup-api.js";
import { WORKUP_SYSTEM_IDS } from "../src/workups/systems.js";

const expectedWorkup = {
  schema: "prerounding_workup_v1",
  id: "chest-pain",
  title: "Chest pain",
  aliases: ["ACS evaluation"],
  items: [
    {
      id: "chest_pain_quality",
      kind: "history",
      system: "cardiovascular",
      text: "Characterize chest-pain quality and radiation.",
      choices: ["No chest pain", "Pressure", "Pleuritic", "Unclear"],
      select: "one"
    }
  ]
};

let capturedRequest = null;
const result = await formatWorkupDraftWithOpenAi({
  apiKey: "test-api-key",
  model: "gpt-5.6",
  sourceText: "History questions: characterize chest-pain quality and radiation.",
  workupTitle: "Chest pain",
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(expectedWorkup) })
    };
  }
});

assert.deepEqual(result, expectedWorkup);
assert.equal(capturedRequest.url, "https://api.openai.com/v1/responses");
assert.equal(capturedRequest.options.headers.Authorization, "Bearer test-api-key");
const payload = JSON.parse(capturedRequest.options.body);
assert.equal(payload.model, "gpt-5.6");
assert.equal(payload.text.format.type, "json_schema");
assert.equal(payload.text.format.strict, true);
assert.deepEqual(payload.text.format.schema, WORKUP_JSON_SCHEMA);
assert.deepEqual(WORKUP_JSON_SCHEMA.properties.items.items.properties.system.enum, WORKUP_SYSTEM_IDS);
assert.match(payload.input, /Return JSON only/i);

const fallbackResult = await formatWorkupDraftWithOpenAi({
  apiKey: "test-api-key",
  model: "an-unsupported-model",
  sourceText: "History questions: characterize chest-pain quality and radiation.",
  workupTitle: "Chest pain",
  fetchImpl: async (_url, options) => {
    capturedRequest = { options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(expectedWorkup) })
    };
  }
});
assert.deepEqual(fallbackResult, expectedWorkup);
assert.equal(JSON.parse(capturedRequest.options.body).model, "gpt-5.6");

await assert.rejects(
  () => formatWorkupDraftWithOpenAi({
    apiKey: "test-api-key",
    sourceText: "draft",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid key" } })
    })
  }),
  /OpenAI API request failed \(401\): Invalid key/
);

console.log("OpenAI workup-formatting tests passed");
