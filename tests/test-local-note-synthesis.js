import assert from "node:assert/strict";
import { localLlmModelByKey } from "../src/local-llm/models.js?v=20261015-tokenized-drafts";
import { buildNoteSourceUnits, planLocalNoteSynthesis, synthesizeLocalNote, validateNoteSelection, validateNoteQuestions, NOTE_INTERVIEW_QUESTIONS, measureLocalNoteSource } from "../src/local-llm/note-synthesis.js?v=20261015-tokenized-drafts";

const units = buildNoteSourceUnits("Prior dose: 10 mg daily. A separate list reports 20 mg daily.", "Current dose is not confirmed.");
assert.equal(units.length, 3);
assert.deepEqual(units.map(unit => unit.kind), ["prior", "prior", "today"]);
assert.throws(() => validateNoteSelection('{"selected_ids":["made-up-id"]}', units, 3), /invalid source/);
assert.throws(() => validateNoteSelection('{"selected_ids":["P1"],"text":"Invented normal exam"}', units, 3), /invalid source/);
assert.equal(validateNoteSelection('<think>hidden reasoning</think>{"selected_ids":["P1"]}', units, 3).selected[0].text, "Prior dose: 10 mg daily.");
assert.throws(() => validateNoteQuestions('{"questions":[{"question_id":"invented_question","source_ids":["P1"]}]}', units), /unsupported question/);
assert.equal(validateNoteQuestions('{"questions":[{"question_id":"current_regimen","source_ids":["P1"]}]}', units)[0].question, NOTE_INTERVIEW_QUESTIONS.current_regimen);

const source = Array.from({ length: 600 }, (_, index) => `Archived source sentence ${index + 1}: previously documented scheduling details, not a new encounter.`).join("\n") + "\nPrior potassium: 5.7 mmol/L (H).";
const plan = planLocalNoteSynthesis({ source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"));
assert.ok(plan.chunks.length > 1, "long sources get multiple bounded passes");
assert.equal(plan.chunks.flat().length, plan.units.length, "all source sentences, including the tail, are accounted for");
assert.match(plan.chunks.at(-1).at(-1).text, /5.7 mmol/);
assert.ok(plan.budget.maxPassTokens <= plan.budget.contextWindow, "each pass includes output reserve and headroom");

const seen = [];
const client = {
  getStatus: () => ({ status: "ready", verified: true, activeModelKey: "qwen3.5-2b" }),
  countTokens: async texts => texts.map(text => Math.ceil(text.length / 2)),
  resetChat: async () => {},
  chat: async messages => {
    seen.push(messages);
    const ids = [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]);
    if (messages[0].content.startsWith("Select up to three")) return JSON.stringify({ questions: [{ question_id: "interval_tests", source_ids: [ids[0]] }] });
    const meaningful = messages[1].content.match(/\[(P\d+)\] PRIOR\/UNCONFIRMED: Prior potassium/);
    return JSON.stringify({ selected_ids: meaningful ? [meaningful[1]] : [] });
  }
};
const draft = await synthesizeLocalNote(client, { source, todayUpdates: "New results have not been obtained today.", section: "history_of_present_illness" });
assert.equal(draft.chunks, plan.chunks.length);
assert.match(draft.text, /5.7 mmol\/L \(H\)/);
assert.match(draft.text, /New results have not been obtained today/, "model cannot discard explicit updates");
assert.ok(!draft.text.includes("<think>"));
assert.ok(seen.some(messages => messages[1].content.includes("source sentence 600")), "tail of long note reaches actual transport");
for (const item of draft.evidence) assert.ok((item.kind === "today" ? "New results have not been obtained today." : source).includes(item.text));
await assert.rejects(synthesizeLocalNote(client, { source, section: "one_liner" }, { isCurrent: () => false }), /cancelled/);
await assert.rejects(synthesizeLocalNote({ ...client, chat: async () => "Nonsensical free-form draft" }, { source: "Prior history: asthma.", section: "one_liner" }));
console.log("Source-grounded note drafting: bounded long-source coverage, exact facts, typed questions, hidden reasoning, current updates and cancellation passed.");

const measured = await measureLocalNoteSource(client, { source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"));
assert.equal(planLocalNoteSynthesis({ source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"), measured).budget.tokenizerMeasured, true);
assert.throws(() => planLocalNoteSynthesis({ source: source + " changed", section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"), measured));
assert.throws(() => planLocalNoteSynthesis({ source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-9b"), measured));
const { countLoadedModelTokens } = await import("../src/local-llm/tokenizer.js?v=20261015-tokenized-drafts");
assert.deepEqual(countLoadedModelTokens({ loadedModelIdToPipeline: new Map([["test", { tokenizer: { encode: text => [...text] } }]]) }, "test", ["abc", ""]), [3, 0]);
assert.throws(() => countLoadedModelTokens({}, "test", ["abc"]), /tokenizer/);
