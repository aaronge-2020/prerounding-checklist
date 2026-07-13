import { buildJsonFormatterPrompt } from "../workups/editor.js";
import { WORKUP_SYSTEM_IDS } from "../workups/systems.js";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../app/preferences.js";
import { requestOpenAiStructuredJson } from "./openai-client.js";

export const WORKUP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "id", "title", "aliases", "items"],
  properties: {
    schema: { type: "string", enum: ["prerounding_workup_v1"] },
    id: { type: "string" },
    title: { type: "string" },
    aliases: {
      type: "array",
      items: { type: "string" }
    },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "system", "text", "choices", "select"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["history", "exam"] },
          system: { type: "string", enum: WORKUP_SYSTEM_IDS },
          text: { type: "string" },
          choices: {
            type: "array",
            minItems: 2,
            items: { type: "string" }
          },
          select: { type: "string", enum: ["one", "many"] }
        }
      }
    }
  }
};

export async function formatWorkupDraftWithOpenAi({ apiKey, model, sourceText, workupTitle, fetchImpl = fetch } = {}) {
  const key = String(apiKey || "").trim();
  const draft = String(sourceText || "").trim();
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  if (!key) throw new Error("Save an OpenAI API key in Settings before formatting a workup.");
  if (!draft) throw new Error("Paste the de-identified OpenEvidence workup draft before formatting it.");

  return requestOpenAiStructuredJson({
    apiKey: key,
    model: selectedModel,
    input: buildJsonFormatterPrompt({ sourceText: draft, workupTitle }),
    schemaName: "prerounding_workup",
    schema: WORKUP_JSON_SCHEMA,
    fetchImpl
  });
}
