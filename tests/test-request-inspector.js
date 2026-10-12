import assert from 'node:assert/strict';
import { buildStructuredRequest } from '../src/ai/structured-request.js';
import { generateProblemApRevisionsWithOpenAi } from '../src/ui/openai-ap-api.js';
import { AP_SUGGESTION_SCHEMA } from '../src/ai/ap-generator.js';
import { normalizeUserPreferences } from '../src/app/preferences.js';
import { setOfflineMode } from '../src/lib/network-gate.js?v=20261012-safety';
const fields = { model: 'gpt-6-luna', input: '  Synthetic case\n', instructions: 'Short suggestions.', temperature: 0.2, schemaName: 'problem_plan_suggestions', schema: AP_SUGGESTION_SCHEMA, tools: [] };
const preview = buildStructuredRequest(fields);
await generateProblemApRevisionsWithOpenAi({ apiKey: 'test-only', model: fields.model, prompt: fields.input, instructions: fields.instructions, temperature: fields.temperature, webSearch: false, fetchImpl: async (_, options) => {
  assert.deepEqual(JSON.parse(options.body), preview);
  assert.equal(preview.store, false);
  assert.equal(JSON.stringify(preview).includes('test-only'), false);
  return { ok: true, json: async () => ({ output_text: '{"suggestions":[],"references":[]}' }) };
} });
assert.throws(() => buildStructuredRequest({ ...fields, temperature: 3 }));
assert.throws(() => buildStructuredRequest({ ...fields, temperature: 'not a number' }));
assert.equal('temperature' in buildStructuredRequest({ ...fields, temperature: '' }), false);
assert.equal(normalizeUserPreferences({ apInstructions: '' }).apInstructions, '');
assert.equal(normalizeUserPreferences().apInstructions, null);
setOfflineMode(true);
try {
  await assert.rejects(generateProblemApRevisionsWithOpenAi({apiKey:'test-only', model: fields.model, prompt:'Synthetic input'}), /offline/i);
} finally { setOfflineMode(false); }
console.log('Request inspector: exact transport, secret exclusion, temperature validation, defaults and offline gate passed.');

const { requestOpenAiStructuredJson, requestOpenAiChatWithUsage } = await import('../src/ui/openai-client.js');
const { buildConsultNoteContext } = await import('../src/ai/note-context.js');
const { createNoteDraft, updateNoteSection, selectObjectiveBlock, editObjectiveGroup } = await import('../src/note-drafts/index.js');
const request = {apiKey:'synthetic-test-key', ...fields};
const resultFetch = (payload) => async () => ({ok:true,json:async()=>payload});
for (const [payload, message] of [
  [{status:'incomplete',output_text:'{"suggestions":[]}'}, /incomplete/],
  [{status:'failed',output_text:'{"suggestions":[]}'}, /incomplete/],
  [{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'Declined'}]}]}, /declined/],
  [{status:'completed',output_text:'not JSON'}, /not valid JSON/],
]) await assert.rejects(requestOpenAiStructuredJson({...request,fetchImpl:resultFetch(payload)}),message);
// Deadline includes response-body reading, not just receipt of headers.
await assert.rejects(requestOpenAiStructuredJson({...request,timeoutMs:5,fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>setTimeout(()=>resolve({output_text:'{}'}),15))})}),/timed out/);
const aborter = new AbortController();
const cancelled = requestOpenAiStructuredJson({...request,signal:aborter.signal,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('stopped','AbortError'))))});
aborter.abort();
await assert.rejects(cancelled,{name:'AbortError'});
let chatBody;
await requestOpenAiChatWithUsage({apiKey:'test',model:'gpt-6-luna',input:'synthetic',fetchImpl:async(_,options)=>{chatBody=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:'Synthetic answer'})};}});
assert.equal(chatBody.store,false,'plain-text chat also disables response storage');

let consultDraft = createNoteDraft('hp');
consultDraft = updateNoteSection(consultDraft,'history_of_present_illness','Synthetic cough history.');
consultDraft.sections.physical_exam = {deidentifiedText:'Synthetic clear lungs.'};
consultDraft = selectObjectiveBlock(consultDraft,{selectionId:'lab1',sourceFingerprint:'v1',noteGroupKey:'lab:metabolic',noteLabel:'Creatinine',noteDetail:'1.3 mg/dL',generatedText:'Creatinine 1.3 mg/dL'});
let context = buildConsultNoteContext(consultDraft);
assert.match(context,/Synthetic cough history/);
assert.match(context,/Synthetic clear lungs/);
assert.match(context,/1.3 mg\/dL/);
consultDraft = editObjectiveGroup(consultDraft,'lab:metabolic','Clinician edited lab interpretation.');
context = buildConsultNoteContext(consultDraft);
assert.match(context,/Clinician edited lab interpretation/);
assert.doesNotMatch(context,/1.3 mg\/dL/,'edited group replaces generated laboratory context');
console.log('AI resilience: cancellation, incomplete/refused replies, body deadline, storage controls, and selected-note context passed.');

const { addPlanProblem, updatePlanProblem, renderFinalNotePlainText } = await import('../src/note-drafts/index.js');
consultDraft = addPlanProblem(consultDraft,{problem:'Other problem',diagnosticPlan:'• Synthetic action'});
const problemId = consultDraft.problems.at(-1).id;
consultDraft = updatePlanProblem(consultDraft,problemId,{problem:'Other problem',diagnosticPlan:'• Synthetic action'});
assert.doesNotMatch(buildConsultNoteContext(consultDraft),/Other problem|Synthetic action/,'other problems are not included in per-problem context');
assert.match(renderFinalNotePlainText(consultDraft),/- Synthetic action/);
assert.doesNotMatch(renderFinalNotePlainText(consultDraft),/- •/,'approved suggestions have one export bullet');
