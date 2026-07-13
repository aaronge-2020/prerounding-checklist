import { buildChecklistAnswerImportPrompt, checklistAnswerImportSchema } from "../checklist/openevidence-import.js";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../app/preferences.js";
import { requestOpenAiStructuredJson } from "./openai-client.js";

export async function formatChecklistAnswersWithOpenAi({ apiKey, model, sourceText, snapshot, fetchImpl = fetch } = {}) {
  const key = String(apiKey || "").trim();
  const draft = String(sourceText || "").trim();
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  if (!key) throw new Error("Save an OpenAI API key in Settings before filling the checklist.");
  if (!draft) throw new Error("Paste the de-identified OpenEvidence note before filling the checklist.");
  if (!snapshot?.items?.length) throw new Error("Build a checklist before importing an OpenEvidence note.");

  return requestOpenAiStructuredJson({
    apiKey: key,
    model: selectedModel,
    input: buildChecklistAnswerImportPrompt({ snapshot, sourceText: draft }),
    schemaName: "prerounding_checklist_answers",
    schema: checklistAnswerImportSchema(snapshot),
    fetchImpl
  });
}
