// UI-edge wrapper for Microsoft Decision-1 differential scoring.
// Owns the network call; request assembly, parsing, and ranking stay pure in
// src/ai/decision-scoring.js. Only de-identified context may be passed in.
//
// The call goes to OpenRouter's Decisions API (Azure-hosted model) using the
// student's own OpenRouter key from Settings — the same bring-your-own-key
// pattern as the OpenAI generation calls. Blocked while offline mode is on.
import { gatedFetch } from "../lib/network-gate.js?v=20260929-offline-mode-v1";
import { parseDifferentialScoringResponse } from "../ai/decision-scoring.js?v=20261010-decision1-v1";

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function decisionApiError(response, payload) {
  const message = String(payload?.error?.message || "").trim();
  if (response.status === 401) {
    return "The OpenRouter API key was rejected. Check the key in Settings and try again.";
  }
  if (response.status === 402) {
    return "The OpenRouter account is out of credits. Add credits at openrouter.ai/credits and try again.";
  }
  if (response.status === 429) {
    return "OpenRouter rate-limited the request. Wait a moment and try again.";
  }
  return message
    ? `Differential ranking failed (${response.status}): ${message}`
    : `Differential ranking failed (${response.status}).`;
}

// Score one problem's differential. `request` is the object returned by
// buildDifferentialScoringRequest. Resolves to
// { choice, confidence, ranked: [{ optionId, probability }] }.
export async function scoreDifferentialsWithDecision1({ apiKey, request, fetchImpl = gatedFetch } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Save an OpenRouter API key in Settings before ranking differentials.");
  if (!request || !request.endpoint || !request.body) {
    throw new Error("The differential scoring request was not built. Try again.");
  }
  let response;
  try {
    response = await fetchImpl(request.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.body)
    });
  } catch (err) {
    // The network gate's refusal is already a clear, calm explanation —
    // pass it through untouched.
    if (err && err.name === "OfflineBlockedError") throw err;
    throw new Error("Unable to reach the OpenRouter Decisions API from this browser. Check the network connection and try again.");
  }
  const payload = await readJson(response);
  if (!response.ok) throw new Error(decisionApiError(response, payload));
  return parseDifferentialScoringResponse(payload, {
    questionId: request.questionId,
    optionIds: request.optionIds
  });
}
