// UI-edge wrapper for per-problem Assessment & Plan generation.
// Owns the network call; prompt assembly, schema, and parsing stay pure in
// src/ai/ap-generator.js. Only de-identified context may be passed in.
import {
  AP_SUGGESTION_SCHEMA,
  parseApSuggestions
} from "../ai/ap-generator.js?v=20260928-ap-suggestions-v1";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../app/preferences.js";
import { requestOpenAiStructuredJson } from "./openai-client.js";

// Suggested-edits generation: the caller passes the final prompt text (the
// student may have edited it in the confirm modal). The model returns
// targeted revision suggestions, not a whole new plan.
export async function generateProblemApRevisionsWithOpenAi({
  apiKey,
  model,
  prompt,
  fetchImpl = fetch
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenAI API key in Settings before generating suggestions.");
  const input = String(prompt || "").trim();
  if (!input) throw new Error("The prompt is empty — write or restore the prompt before sending.");
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  const json = await requestOpenAiStructuredJson({
    apiKey: key,
    model: selectedModel,
    input,
    schemaName: "problem_plan_suggestions",
    schema: AP_SUGGESTION_SCHEMA,
    tools: [{ type: "web_search" }],
    fetchImpl
  });
  return parseApSuggestions(json);
}
