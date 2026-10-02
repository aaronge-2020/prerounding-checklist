// Shared OpenAI Responses-API calling core. Feature-specific validation
// messages, prompt text, and JSON schemas stay with their own callers -
// this module only knows how to make the structured-output request and
// parse the reply.
//
// All requests flow through the central network gate: when offline mode is
// on, the call fails fast with OfflineBlockedError instead of hanging.
import { gatedFetch } from "../lib/network-gate.js?v=20260929-offline-mode-v1";
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

export async function requestOpenAiStructuredJson({ apiKey, model, input, schemaName, schema, tools, fetchImpl = gatedFetch } = {}) {
  let response;
  const body = {
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
  };
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    // The network gate's refusal is already a clear, calm explanation —
    // pass it through untouched.
    if (err && err.name === "OfflineBlockedError") throw err;
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

// Plain-text chat completion for AI Chat's remote (ChatGPT) mode. Unlike
// requestOpenAiStructuredJson, the reply is free-form text, not a JSON
// object. `input` is a Responses-API input array
// ([{ role: "system"|"user"|"assistant", content }]) or a plain string.
// `tools` optionally enables web search ([{ type: "web_search" }]) so the
// model's citations can be grounded in real sources.
export async function requestOpenAiChat({ apiKey, model, input, tools, fetchImpl = gatedFetch, timeoutMs = 300000 } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenAI API key in Settings before using ChatGPT chat.");
  const body = { model, input };
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("The ChatGPT request timed out after 5 minutes. Try again, or turn off web search for a faster reply.");
    }
    // The network gate's refusal is already a clear, calm explanation —
    // pass it through untouched.
    if (err && err.name === "OfflineBlockedError") throw err;
    throw new Error("Unable to reach the OpenAI API from this browser. Check the network connection and try again.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  const payload = await readJson(response);
  if (!response.ok) throw new Error(apiError(response, payload));
  const output = responseText(payload).trim();
  if (!output) throw new Error("The OpenAI API returned an empty reply. Try again.");
  return output;
}
