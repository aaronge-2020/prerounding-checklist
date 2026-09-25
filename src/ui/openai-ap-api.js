// UI-edge wrapper for per-problem Assessment & Plan generation.
// Owns the network call; prompt assembly, schema, and parsing stay pure in
// src/ai/ap-generator.js. Only de-identified context may be passed in.
import {
  AP_RESPONSE_SCHEMA,
  buildApPrompt,
  parseApResult
} from "../ai/ap-generator.js?v=20260925-ap-generator-v1";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../app/preferences.js";
import { requestOpenAiStructuredJson } from "./openai-client.js";

export async function generateProblemApWithOpenAi({
  apiKey,
  model,
  problem,
  keyContext,
  existingDifferentials,
  contextText,
  fetchImpl = fetch
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenAI API key in Settings before generating a plan.");
  const prompt = buildApPrompt({ problem, keyContext, existingDifferentials, contextText });
  if (!String(problem || "").trim() && !String(keyContext || "").trim()) {
    throw new Error("Name the clinical problem (or add key context) before generating a plan.");
  }
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  const json = await requestOpenAiStructuredJson({
    apiKey: key,
    model: selectedModel,
    input: prompt,
    schemaName: "problem_assessment_plan",
    schema: AP_RESPONSE_SCHEMA,
    tools: [{ type: "web_search" }],
    fetchImpl
  });
  return parseApResult(json);
}
