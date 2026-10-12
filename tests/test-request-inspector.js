import assert from 'node:assert/strict';
import { buildStructuredRequest } from '../src/ai/structured-request.js';
import { generateProblemApRevisionsWithOpenAi } from '../src/ui/openai-ap-api.js';
import { AP_SUGGESTION_SCHEMA } from '../src/ai/ap-generator.js';
import { normalizeUserPreferences } from '../src/app/preferences.js';
import { setOfflineMode } from '../src/lib/network-gate.js?v=20260929-offline-mode-v1';
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
