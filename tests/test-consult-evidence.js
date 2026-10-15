import assert from "node:assert/strict";
import { buildEvidenceSearchRequest, constrainEvidenceSuggestions, evidenceQuestion } from "../src/ai/consult-evidence.js";
import { generateEvidenceBasedProblemRevisions } from "../src/ui/consult-evidence-api.js";
import { setOfflineMode } from "../src/lib/network-gate.js?v=20261012-safety";
const source = { url: "https://example.org/synthetic-study", title: "Synthetic primary study" };
const summary = "Synthetic study enrolled people with reduced kidney function. Benefits and limitations require review.";
const suggestions = { suggestions: [{ id: 1, target: "diagnostic_plan", action: "add", anchor: "", suggested: "Review applicable evidence with the supervising clinician.", rationale: "Applicability depends on the documented kidney function.", citationIds: [1] }], references: [{ id: 1, title: source.title, authors: "", journal: "", year: "", url: source.url, excerpt: "Synthetic study enrolled people with reduced kidney function.", sourceLocation: "Retrieved evidence summary" }] };
const evidencePayload = {
  status: "completed", output_text: summary,
  output: [{ type: "web_search_call", status: "completed", action: { sources: [source] } }]
};
function transport({ noSearch = false, noSources = false, cancelAfterProposal, invalidReference = false, afterProposal } = {}) {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.text?.format.name === "consult_evidence_question") body.input = "REVIEWED_CONTEXT_ONLY: eGFR 25; previous treatment ineffective.";
    if (body.tools?.[0]?.type === "web_search") body.input = "Clinician-edited question: treatment options with eGFR 25?";
    init.onRequestReady?.(JSON.stringify(body));
    bodies.push(body);
    if (body.text?.format.name === "consult_evidence_question") {
      cancelAfterProposal?.abort();
      afterProposal?.();
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ question: "Proposed question for kidney impairment?" }) }) };
    }
    if (body.tools?.length) return { ok: true, json: async () => noSearch ? { output_text: "Unsearched model answer", output: [] } : noSources ? { ...evidencePayload, output: [{ type: "web_search_call", status: "completed" }] } : evidencePayload };
    const result = invalidReference ? { ...suggestions, references: [{ ...suggestions.references[0], url: "https://example.org/invented" }] } : suggestions;
    return { ok: true, json: async () => ({ output_text: JSON.stringify(result) }) };
  };
  return { bodies, fetchImpl };
}
const input = { apiKey: "synthetic-key", model: "test", prompt: "UNAPPROVED_CHART_MARKER", instructions: "CUSTOM_INSTRUCTIONS_MARKER" };
const mock = transport();
const result = await generateEvidenceBasedProblemRevisions({ ...input, fetchImpl: mock.fetchImpl });
assert.equal(mock.bodies.length, 3);
const [proposal, search, synthesis] = mock.bodies;
assert.equal(proposal.tools, undefined);
assert.equal(search.tool_choice, "required");
assert.deepEqual(search.include, ["web_search_call.action.sources"]);
assert.equal(search.input, "Clinician-edited question: treatment options with eGFR 25?");
assert.equal(search.instructions, undefined);
assert.ok(!JSON.stringify(search).includes("UNAPPROVED_CHART_MARKER"));
assert.ok(!JSON.stringify(search).includes("CUSTOM_INSTRUCTIONS_MARKER"));
assert.equal(synthesis.tools, undefined);
assert.match(synthesis.input, /REVIEWED_CONTEXT_ONLY/);
assert.doesNotMatch(synthesis.input, /UNAPPROVED_CHART_MARKER/);
assert.match(synthesis.input, /Clinician-edited question/);
assert.match(synthesis.input, /Synthetic study enrolled/);
assert.match(synthesis.instructions, /CUSTOM_INSTRUCTIONS_MARKER/);
assert.equal(result.references[0].sourceLocation, "Retrieved evidence summary");
for (const body of mock.bodies) assert.equal(body.store, false);
for (const failure of [{ noSearch: true }, { noSources: true }]) {
  const missing = transport(failure);
  await assert.rejects(generateEvidenceBasedProblemRevisions({ ...input, fetchImpl: missing.fetchImpl }), /No cited web evidence/);
  assert.equal(missing.bodies.length, 2, "missing evidence cannot fall through to unsourced synthesis");
}
const cancelled = new AbortController();
const interrupted = transport({ cancelAfterProposal: cancelled });
await assert.rejects(generateEvidenceBasedProblemRevisions({ ...input, fetchImpl: interrupted.fetchImpl, signal: cancelled.signal }), error => error.name === "AbortError");
assert.equal(interrupted.bodies.length, 1);
const offlineRace = transport({ afterProposal: () => { setOfflineMode(true); setOfflineMode(false); } });
await assert.rejects(generateEvidenceBasedProblemRevisions({ ...input, fetchImpl: offlineRace.fetchImpl }), error => error.name === "AbortError");
assert.equal(offlineRace.bodies.length, 1, "an offline transition permanently cancels the current pipeline even if connectivity returns");
await assert.rejects(generateEvidenceBasedProblemRevisions({ ...input, fetchImpl: transport({ invalidReference: true }).fetchImpl }), /outside the retrieved evidence/);
const evidence = { sources: [source], text: summary };
assert.throws(() => constrainEvidenceSuggestions({ ...suggestions, suggestions: [{ ...suggestions.suggestions[0], citationIds: [] }] }, evidence), /lacks a retrieved citation/);
const inventedQuote = constrainEvidenceSuggestions({ ...suggestions, references: [{ ...suggestions.references[0], excerpt: "Fabricated quotation" }] }, evidence);
assert.equal(inventedQuote.references[0].excerpt, "");
assert.match(inventedQuote.references[0].sourceLocation, /not verified/);
assert.throws(() => evidenceQuestion({ question: "a".repeat(2001) }), /too long/);
assert.deepEqual(Object.keys(buildEvidenceSearchRequest({ model: "test", question: "Focused question" })).sort(), ["include", "input", "model", "store", "tool_choice", "tools"]);
console.log("Consult evidence: reviewed scope, isolated edited search, required retrieval, patient-specific synthesis, citation constraints, missing evidence and cancellation passed.");
