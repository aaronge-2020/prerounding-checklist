import { buildJsonFormatterPrompt } from "../workups/editor.js";
import { WORKUP_SYSTEM_IDS } from "../workups/systems.js";
import { DEFAULT_OPENAI_WORKUP_MODEL, openAiWorkupModelOption } from "../app/preferences.js";

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

function responseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  return outputs
    .filter((entry) => entry?.type === "message")
    .flatMap((entry) => Array.isArray(entry.content) ? entry.content : [])
    .filter((entry) => entry?.type === "output_text" || entry?.type === "text")
    .map((entry) => String(entry.text || ""))
    .join("\n");
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiError(response, payload) {
  const message = String(payload?.error?.message || "").trim();
  return message
    ? `OpenAI API request failed (${response.status}): ${message}`
    : `OpenAI API request failed (${response.status}).`;
}

export async function formatWorkupDraftWithOpenAi({ apiKey, model, sourceText, workupTitle, fetchImpl = fetch } = {}) {
  const key = String(apiKey || "").trim();
  const draft = String(sourceText || "").trim();
  const selectedModel = openAiWorkupModelOption(model || DEFAULT_OPENAI_WORKUP_MODEL).value;
  if (!key) throw new Error("Save an OpenAI API key in Settings before formatting a workup.");
  if (!draft) throw new Error("Paste the de-identified OpenEvidence workup draft before formatting it.");

  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        input: buildJsonFormatterPrompt({ sourceText: draft, workupTitle }),
        text: {
          format: {
            type: "json_schema",
            name: "prerounding_workup",
            strict: true,
            schema: WORKUP_JSON_SCHEMA
          }
        }
      })
    });
  } catch {
    throw new Error("Unable to reach the OpenAI API from this browser. Check the network connection and try again.");
  }

  const payload = await readJson(response);
  if (!response.ok) throw new Error(apiError(response, payload));
  const output = responseText(payload).trim();
  if (!output) throw new Error("The OpenAI API did not return a workup JSON object.");
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("The OpenAI API returned text that was not valid JSON. Review the draft and try again.");
  }
}
