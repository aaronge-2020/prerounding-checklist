// Shared OpenAI Responses-API calling core. Feature-specific validation
// messages, prompt text, and JSON schemas stay with their own callers (see
// openai-workup-api.js and openai-checklist-api.js) - this module only knows
// how to make the structured-output request and parse the reply.
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

export async function requestOpenAiStructuredJson({ apiKey, model, input, schemaName, schema, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema
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
  if (!output) throw new Error("The OpenAI API did not return a JSON object.");
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("The OpenAI API returned text that was not valid JSON. Review the input and try again.");
  }
}
