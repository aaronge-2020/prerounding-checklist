import assert from "node:assert/strict";
import { localLlmModelByKey } from "../src/local-llm/models.js?v=20261015-stable-draft-runtime";
import { buildNoteSourceUnits, planLocalNoteSynthesis, synthesizeLocalNote, validateNoteSelection, validateNoteQuestions, NOTE_INTERVIEW_QUESTIONS, measureLocalNoteSource } from "../src/local-llm/note-synthesis.js?v=20261015-clinical-drafts";

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

await assert.rejects(synthesizeLocalNote({ getStatus: () => ({ status: "ready", verified: true, activeModelKey: "qwen3.5-9b" }) }, { source: "Synthetic source.", section: "one_liner" }), /unavailable for note drafting/, "failed model is blocked before any chart processing");
const seen = [];
let modelRefreshes = 0;
const client = {
  getStatus: () => ({ status: "ready", verified: true, activeModelKey: "qwen3.5-2b" }),
  countTokens: async texts => texts.map(text => Math.ceil(text.length / 2)),
  resetChat: async () => {}, unload: async () => {}, ensureReady: async () => { modelRefreshes++; },
  chat: async messages => {
    seen.push(messages);
    const ids = [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]);
    if (messages[0].content.startsWith("Select up to three")) return JSON.stringify({ questions: [{ question_id: "interval_tests", source_ids: [ids[0]] }] });
    const meaningful = messages[1].content.match(/\[(P\d+)\] PRIOR\/UNCONFIRMED: Prior potassium/);
    return JSON.stringify({ selected_ids: meaningful ? [meaningful[1]] : [] });
  }
};
const draft = await synthesizeLocalNote(client, { source, todayUpdates: "New results have not been obtained today.", section: "history_of_present_illness" });
assert.equal(draft.chunks, plan.chunks.length + 1, "today updates are inspected separately from historical source");
assert.ok(modelRefreshes >= 2, "long generations release and reverify worker state in bounded batches");
let stillActive = true, restartedAfterCancel = false;
await assert.rejects(synthesizeLocalNote({ ...client, unload: async () => { stillActive = false; }, ensureReady: async () => { restartedAfterCancel = true; } }, { source, section: "history_of_present_illness" }, { isCurrent: () => stillActive }), /cancelled/);
assert.equal(restartedAfterCancel, false, "cancellation between release and reload never starts another worker");
assert.match(draft.text, /5.7 mmol\/L \(H\)/);
assert.match(draft.text, /New results have not been obtained today/, "model cannot discard explicit updates");
assert.ok(!draft.text.includes("<think>"));
assert.ok(seen.some(messages => messages[1].content.includes("source sentence 600")), "tail of long note reaches actual transport");
for (const item of draft.evidence) assert.ok((item.kind === "today" ? "New results have not been obtained today." : source).includes(item.text));
await assert.rejects(synthesizeLocalNote(client, { source, section: "one_liner" }, { isCurrent: () => false }), /cancelled/);
await assert.rejects(synthesizeLocalNote({ ...client, chat: async () => "Nonsensical free-form draft" }, { source: "Prior history: asthma.", section: "one_liner" }));
await assert.rejects(synthesizeLocalNote({ ...client, chat: async messages => JSON.stringify(messages[0].content.includes("ONE-LINER CONTRACT") ? { baseline_ids: [], history_ids: ["P1"], uncertainty_ids: [] } : { selected_ids: ["P1"] }) }, { source: "## other\nDocumented patient baseline.", section: "one_liner" }), /No documented patient description/, "a history-only result cannot replace an available patient description");
console.log("Source-grounded note drafting: bounded long-source coverage, exact facts, typed questions, hidden reasoning, current updates and cancellation passed.");

const measured = await measureLocalNoteSource(client, { source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"));
assert.equal(planLocalNoteSynthesis({ source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"), measured).budget.tokenizerMeasured, true);
assert.throws(() => planLocalNoteSynthesis({ source: source + " changed", section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-2b"), measured));
assert.throws(() => planLocalNoteSynthesis({ source, section: "history_of_present_illness" }, localLlmModelByKey("qwen3.5-9b"), measured));
const { countLoadedModelTokens } = await import("../src/local-llm/tokenizer.js?v=20261015-stable-draft-runtime");
assert.deepEqual(countLoadedModelTokens({ loadedModelIdToPipeline: new Map([["test", { tokenizer: { encode: text => [...text] } }]]) }, "test", ["abc", ""]), [3, 0]);
assert.throws(() => countLoadedModelTokens({}, "test", ["abc"]), /tokenizer/);

const { buildLocalNoteSources } = await import("../src/local-llm/note-source.js?v=20261015-clinical-drafts");
const options = buildLocalNoteSources({ importedSections: { past_medical_history: { deidentifiedText: "History: asthma." }, medications: "Albuterol as needed.", empty: "" }, draftEntries: [{ heading: "History", text: "History: asthma. Clinician edit retained here." }, { heading: "Objective", text: "Prior BP: 120/80 mmHg." }] });
assert.equal(options.length, 2);
assert.equal(options[0].text.match(/History: asthma/g).length, 1);
assert.ok(!options[0].text.includes("Clinician edit"));
assert.ok(options[0].text.includes("120/80"));
assert.ok(options[1].text.includes("Clinician edit"));
assert.equal(buildLocalNoteSources({ importedSections: { other: "" }, draftEntries: [{ heading: "HPI", text: "Manually entered history." }] })[0].id, "working");
const tableSource = "## medications\r\nMedication\tDose\r\nMedicine A\t5 mg daily\r\nMedicine B\t10 mg daily\r\n\r\n## plan\r\nPrior plan: repeat chemistry.";
const tableUnits = buildNoteSourceUnits(tableSource);
assert.equal(tableUnits[0].section, "medications");
assert.ok(tableUnits[0].text.includes("Dose\r\nMedicine A"));
for (const item of tableUnits) assert.equal(tableSource.slice(item.offset, item.offset + item.text.length), item.text);
const { renderSourceGroundedNote } = await import("../src/local-llm/note-synthesis.js?v=20261015-clinical-drafts");
const prechart = renderSourceGroundedNote({ section: "full_note", evidence: tableUnits, questions: [] });
assert.equal(prechart.match(/Prior plan: repeat chemistry/g).length, 1);
assert.ok(prechart.includes("[Completion / result / current relevance: ____]"));
const baseline = renderSourceGroundedNote({ section: "one_liner", evidence: tableUnits, questions: [{ question: "Generic question" }] });
assert.ok(!baseline.includes("Generic question") && !baseline.includes("Ask:"));

const roleSource = buildNoteSourceUnits("## other\nPrior obstetric baseline: G4P2012.\n\n## past_medical_history\nHistory: cervical procedure.\n\n## plan\nPrior plan: repeat screening.");
const roles = validateNoteSelection(JSON.stringify({ baseline_ids: [roleSource[0].id], history_ids: [roleSource[1].id], uncertainty_ids: [] }), roleSource, 6, "one_liner");
assert.equal(roles.selected[0].selectionRole, "baseline_ids");
assert.equal(validateNoteSelection(JSON.stringify({ selected_ids: [roleSource[2].id] }), roleSource, 6).selected.length, 1, "source candidates are collected before final role organization");
assert.throws(() => validateNoteSelection('{"selected_ids":["P9999"]}', roleSource, 6), /invalid source/);
assert.throws(() => validateNoteSelection(JSON.stringify({ baseline_ids: [roleSource[2].id], history_ids: [], uncertainty_ids: [] }), roleSource, 6, "one_liner"), /invalid one-liner/);
assert.throws(() => validateNoteSelection(JSON.stringify({ selected_ids: [roleSource[0].id] }), roleSource, 6, "one_liner"), /required one-liner roles/);
const longTable = "## results\nTest\tValue\tUnits\n" + Array.from({ length: 70 }, (_, i) => `Source row ${i}\t${i}\tmmol/L`).join("\n");
const longTableUnits = buildNoteSourceUnits(longTable);
const baselineScope = planLocalNoteSynthesis({ source: "## other\nDocumented patient baseline.\n\n" + longTable, section: "one_liner" }, localLlmModelByKey("qwen3.5-4b"));
assert.equal(baselineScope.units.length, 1, "one-liners explicitly scope out result tables");
assert.equal(baselineScope.budget.excludedSourceUnits, 70);
assert.ok(planLocalNoteSynthesis({ source: longTable, section: "full_note" }, localLlmModelByKey("qwen3.5-4b")).units.length === 70, "full drafts still inspect every result row");
assert.equal(longTableUnits.length, 70, "each result row is independently selectable");
assert.ok(longTableUnits.every(unit => unit.tableContext === "Test\tValue\tUnits"));
for (const item of longTableUnits) { assert.ok(longTable.includes(item.text)); if (item.tableContext) assert.ok(longTable.includes(item.tableContext)); }
assert.ok(longTableUnits.at(-1).text.includes("Source row 69"));

const mixedSource = "## past_medical_history\n" + Array.from({ length: 8 }, (_, i) => `History item ${i}.`).join("\n") + "\n\n## results\nSupplied potassium 5.8 mmol/L (H).\nSupplied creatinine 1.9 mg/dL.\n\n## medications\nDose A: 10 mg daily.\nDose B: 20 mg daily.\n\n## plan\nPrior plan: repeat chemistry.\nStatus not documented.";
let stage = "";
const reductionGroups = [];
const coverageClient = { ...client, countTokens: async texts => texts.map(text => /^\[P/.test(text) ? 2000 : Math.ceil(text.length / 2)), chat: async messages => {
  if (messages[0].content.startsWith("Select up to three")) return '{"questions":[]}';
  const ids = [...messages[1].content.matchAll(/\[(P\d+|T\d+)\]/g)].map(match => match[1]);
  if (stage === "reducing") reductionGroups.push([...messages[1].content.matchAll(/\{(past_medical_history|results|medications|plan)\}/g)].map(match => match[1]));
  return JSON.stringify({ selected_ids: ids.slice(0, Number(messages[1].content.match(/Select at most (\d+)/)[1])) });
} };
// Small context forces initial selections across packets; reduction retains
// sections independently instead of allowing one domain to erase another.
const mixed = await synthesizeLocalNote(coverageClient, { source: mixedSource, section: "history_of_present_illness" }, { onProgress: event => { stage = event.phase; } });
assert.ok(mixed.text.includes("5.8 mmol/L"));
assert.ok(reductionGroups.length > 0);
for (const group of reductionGroups) assert.equal(new Set(group).size, 1);
const repeatedRows = await synthesizeLocalNote({ ...coverageClient, countTokens: client.countTokens }, { source: "## results\nPanel A\nTest\tValue\tUnits\nPotassium\t4.0\tmmol/L\n\nPanel B\nTest\tValue\tUnits\nPotassium\t4.0\tmmol/L", section: "history_of_present_illness" });
assert.equal(repeatedRows.evidence.length, 2, "equal result values from distinct panels retain provenance");
assert.ok(repeatedRows.text.includes("Panel A") && repeatedRows.text.includes("Panel B"));

const { createDraftPrivacyReview, decideDraftPrivacyChange, draftPrivacyText } = await import("../src/local-llm/draft-privacy-review.js?v=20261015-clinical-drafts");
const privateSource = "Literal [ID]; baseline G4P2012; older entry G3P2012.";
const entities = ["G4P2012", "G3P2012"].map(value => ({ start: privateSource.indexOf(value), end: privateSource.indexOf(value) + value.length, label: "ID", replacement: "[ID]", text: value }));
const privacy = createDraftPrivacyReview(privateSource, { text: "Literal [ID]; baseline [ID]; older entry [ID].", entities });
assert.equal(privacy.mapped, true);
assert.equal(draftPrivacyText(privacy), "Literal [ID]; baseline [ID]; older entry [ID].");
assert.match(decideDraftPrivacyChange(privacy, 0, "restored"), /^Literal \[ID\]; baseline G4P2012/);
assert.ok(!draftPrivacyText(privacy).includes("G3P2012"));
decideDraftPrivacyChange(privacy, 1, "confirmed");
decideDraftPrivacyChange(privacy, 0, "pending");
assert.ok(!draftPrivacyText(privacy).includes("G4P2012"));
const unmapped = createDraftPrivacyReview(privateSource, { text: "Unexpected transformed output", entities });
assert.equal(unmapped.mapped, false);
assert.throws(() => decideDraftPrivacyChange(unmapped, 0, "restored"), /mapped exactly/);
