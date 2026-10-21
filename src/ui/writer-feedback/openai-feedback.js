// UI-edge wrapper for writer feedback through OpenAI. Mirrors
// src/ui/openai-ap-api.js: prompt assembly, schema, and parsing stay pure
// in src/note-drafts/feedback.js, and the request goes through
// requestOpenAiStructuredJson, whose default transport is the reviewed-send
// gate in src/ui/external-ai-review.js. No direct fetch here.
import { WRITER_FEEDBACK_SCHEMA, parseWriterFeedback } from "../../note-drafts/feedback.js?v=20261021-writer-feedback";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../../app/preferences.js?v=20261011-request-controls";
import { requestOpenAiStructuredJson } from "../openai-client.js?v=20261015-simple-review";

export async function generateWriterFeedbackWithOpenAi({ apiKey, model, prompt, sectionIds, signal, fetchImpl } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenAI API key in Settings before running OpenAI feedback.");
  if (!String(prompt?.input || "").trim()) throw new Error("There is no writing in scope to send.");
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  const json = await requestOpenAiStructuredJson({
    apiKey: key,
    model: selectedModel,
    input: prompt.input,
    instructions: prompt.instructions,
    schemaName: "writer_feedback",
    schema: WRITER_FEEDBACK_SCHEMA,
    fetchImpl,
    signal
  });
  return parseWriterFeedback(json, { sectionIds });
}
