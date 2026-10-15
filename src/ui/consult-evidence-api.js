import { buildEvidenceQuestionRequest, evidenceQuestion, buildEvidenceSynthesisPrompt, EVIDENCE_SYNTHESIS_INSTRUCTIONS, constrainEvidenceSuggestions } from "../ai/consult-evidence.js?v=20261015-simple-review";
import { AP_SUGGESTION_SCHEMA, parseApSuggestions } from "../ai/ap-generator.js?v=20261012-citation-preview";
import { requestOpenAiStructuredJson, requestOpenAiEvidence } from "./openai-client.js?v=20261015-simple-review";
import { assertRemoteAllowed, onOfflineModeChange } from "../lib/network-gate.js?v=20261012-safety";

// Each request independently enters the final scan/approval transport. Only
// the edited, approved question enters the web-enabled request. No history,
// chart, settings instructions, or previous_response_id travels with it.
export async function generateEvidenceBasedProblemRevisions({ apiKey, model, prompt, instructions, temperature, signal, fetchImpl, onStage = () => {} }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const stopOffline = onOfflineModeChange(offline => { if (offline) abort(); });
  const active = () => {
    if (controller.signal.aborted) throw new DOMException("Consult stopped. Nothing was applied.", "AbortError");
    assertRemoteAllowed("https://api.openai.com/v1/responses");
  };
  const transport = { apiKey, model, signal: controller.signal, fetchImpl };
  try {
    active();
    onStage("Preparing a focused evidence question from the selected context…");
    let reviewedContext = prompt;
    const proposal = await requestOpenAiStructuredJson({
      ...buildEvidenceQuestionRequest({ model, prompt, temperature }), ...transport,
      onRequestApproved: body => { reviewedContext = body.input; }
    });
    active();
    onStage("Review the focused evidence question before searching…");
    const evidence = await requestOpenAiEvidence({ ...transport, question: evidenceQuestion(proposal) });
    active();
    onStage("Applying retrieved evidence to the reviewed patient context…");
    const result = await requestOpenAiStructuredJson({
      ...transport, temperature,
      input: buildEvidenceSynthesisPrompt({ context: reviewedContext, evidence }),
      instructions: `${instructions || ""}\n\n${EVIDENCE_SYNTHESIS_INSTRUCTIONS}`,
      schemaName: "problem_plan_suggestions", schema: AP_SUGGESTION_SCHEMA, tools: []
    });
    active();
    return parseApSuggestions(constrainEvidenceSuggestions(result, evidence));
  } finally {
    stopOffline();
    signal?.removeEventListener("abort", abort);
  }
}
