import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createExternalRequestReview, validateExternalRequest, externalReviewGroups, AI_ENDPOINTS } from "../src/ai/external-request-review.js";
import { buildLocalSynthesisMessages } from "../src/local-llm/note-synthesis.js?v=20261015-tokenized-drafts";
import { buildDifferentialScoringRequest } from "../src/ai/decision-scoring.js";
const endpoint = AI_ENDPOINTS[0];
const consent = { reviewedContent: true, permittedProvider: true };
const deidentify = async text => ({ text: text.replaceAll("SYNTHETIC-IDENTIFIER", "[REDACTED]"), modelId: "synthetic-test-model" });
const body = {
  model: "test-model", store: true,
  instructions: "Instructions SYNTHETIC-IDENTIFIER",
  input: [
    { role: "system", content: "Preferences SYNTHETIC-IDENTIFIER" },
    { role: "assistant", content: "History SYNTHETIC-IDENTIFIER" },
    { role: "user", content: [{ type: "input_text", text: "Edited consult SYNTHETIC-IDENTIFIER" }] },
    { type: "function_call", call_id: "fixed-id", name: "calculator", arguments: "SYNTHETIC-IDENTIFIER" },
    { type: "function_call_output", call_id: "fixed-id", output: "SYNTHETIC-IDENTIFIER" }
  ]
};
const review = createExternalRequestReview(endpoint, body);
assert.throws(() => review.approve(consent), /Scan and review/);
await review.scan(deidentify);
assert.throws(() => review.approve({ reviewedContent: true }), /Scan and review/);
const approved = review.approve(consent);
assert.ok(!approved.includes("SYNTHETIC-IDENTIFIER"), "all free text, including history and tool results, is scanned");
assert.equal(JSON.parse(approved).store, false);
assert.equal(JSON.parse(approved).input[3].call_id, "fixed-id");
assert.ok(body.instructions.includes("SYNTHETIC-IDENTIFIER"), "source object is never mutated");
assert.throws(() => review.approve(consent), /Scan and review/, "approval is single use");
await review.scan(deidentify);
review.edit(["instructions"], "Changed SYNTHETIC-IDENTIFIER");
assert.throws(() => review.approve(consent), /Scan and review/, "edits revoke approval");
await assert.rejects(review.scan(async () => ({ text: "partial", modelId: "test", modelChunkFailures: 1 })), /failed/);
assert.throws(() => review.approve(consent), /Scan and review/);
let release;
const blocked = new Promise(resolve => { release = resolve; });
const racing = review.scan(async text => { await blocked; return deidentify(text); });
review.edit(["instructions"], "Changed again");
release();
await assert.rejects(racing, /changed during scanning/);
assert.throws(() => review.approve(consent), /Scan and review/);
assert.throws(() => validateExternalRequest("https://unapproved.example", body), /destination/);
assert.throws(() => validateExternalRequest(endpoint, { ...body, tools: [{ type: "web_search" }] }), /cannot enable web search/);
assert.throws(() => validateExternalRequest(endpoint, { ...body, previous_response_id: "unreviewed-history" }), /self-contained/);
assert.throws(() => validateExternalRequest(endpoint, { ...body, metadata: { patient: "unreviewable" } }), /cannot be reviewed/);
assert.throws(() => validateExternalRequest(endpoint, { ...body, input: [{ role: "user", content: [{ type: "input_image", image_url: "https://example.test/patient" }] }] }), /Only text/);
const literature = createExternalRequestReview(endpoint, { model: "test", input: "General clinical question", tools: [{ type: "web_search" }] }, { literatureOnly: true });
await literature.scan(deidentify);
assert.throws(() => literature.approve(consent), /Scan and review/);
assert.equal(JSON.parse(literature.approve({ ...consent, reviewedSearchQuestion: true })).input, "General clinical question");
assert.throws(() => validateExternalRequest(endpoint, body, { literatureOnly: true }), /standalone question/);
const ranking = buildDifferentialScoringRequest({ problem: "SYNTHETIC-IDENTIFIER", contextText: "SYNTHETIC-IDENTIFIER", differentials: [{ id: "a", diagnosis: "A SYNTHETIC-IDENTIFIER" }, { id: "b", diagnosis: "B" }] });
const scoring = createExternalRequestReview(ranking.endpoint, ranking.body);
await scoring.scan(deidentify);
assert.ok(!scoring.approve(consent).includes("SYNTHETIC-IDENTIFIER"));
const messages = buildLocalSynthesisMessages({ source: "Prior note: historical symptom. Lab: 5 mmol/L", section: "history_of_present_illness" });
assert.match(messages[0].content, /historical/);
assert.match(messages[0].content, /selected_ids/);
assert.match(messages[0].content, /untrusted data/);
assert.match(messages[1].content, /5 mmol\/L/);
assert.throws(() => buildLocalSynthesisMessages({ source: "", section: "one_liner" }), /source material/);
for (const module of ["external-ai-review", "local-note-synthesis", "ai-chat/controller"]) {
  const source = await readFile(new URL(`../src/ui/${module}.js`, import.meta.url), "utf8");
  assert.match(source, /patient-context\/deid-client\.js\?v=/, "UI de-identification uses the worker client");
  assert.doesNotMatch(source, /from\s+["'][^"']*deid-service\.js/, "UI must never load the model service on the main thread");
}
console.log("External request review: full text coverage, minimum consent, exact single-use approval, stale scans, failure, endpoints, search isolation, ranking and local synthesis passed.");

// Grouping changes presentation only: all exact request paths and text survive.
const grouped = externalReviewGroups(body, createExternalRequestReview(endpoint, body).fields());
assert.equal(grouped[0].key, "request");
assert.equal(grouped[0].fields[0].text, body.input[2].content[0].text);
assert.equal(grouped.find(group => group.key === "instructions").fields.length, 2);
assert.equal(grouped.find(group => group.key === "history").fields[0].label, "AI reply");
assert.equal(grouped.flatMap(group => group.fields).length, review.fields().length);
const warningReview = createExternalRequestReview(endpoint, { model: "test", instructions: "SYNTHETIC-IDENTIFIER", input: "Question" });
const scanned = await warningReview.scan(async text => ({ ...await deidentify(text), residualWarnings: text === "Question" ? [] : [{ message: "Check this section" }] }));
assert.deepEqual(scanned.changedPaths, [["instructions"]]);
assert.deepEqual(scanned.warningPaths, [["instructions"]]);
assert.ok(!JSON.stringify(scanned).includes("SYNTHETIC-IDENTIFIER"), "scan presentation metadata retains no originals");
