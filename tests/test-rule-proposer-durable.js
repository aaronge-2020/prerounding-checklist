// Durable rule proposer: learned rules persist in the encrypted vault,
// the proposer runs on every correction, and the Suggested rules panel
// exists in the Hospital Stay view as well as Quick De-ID.
//
// Privacy boundary under test:
//   - Raw correction spans stay session-only in memory (cleared on
//     patient switch and on vault lock) and never reach any store.
//   - Only a sanitized pattern-only projection of a rule may persist:
//     no examples, no correction ids, no span text of any kind.
//   - The proposer modules themselves never touch plaintext storage
//     (the throwing localStorage getter below proves it).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() { throw new Error('Rule modules must never access plaintext storage'); },
});

const TAG = '20261013-durable-rules';
const orchestrator = await import(`../src/vault/deid/rule-orchestrator.js?v=${TAG}`);
const store = await import(`../src/vault/deid/rule-store.js?v=${TAG}`);
const proposer = await import(`../src/vault/deid/rule-proposer.js?v=${TAG}`);
const vaultState = await import(`../src/app/state/vault.js?v=${TAG}`);
const { getCorrections } = await import('../src/vault/deid/correction-log.js');

// --- New API surface the fix must provide -----------------------------------
assert.equal(typeof store.sanitizeRulesForPersistence, 'function',
  'rule-store must export sanitizeRulesForPersistence (pattern-only projection)');
assert.equal(typeof orchestrator.clearLearnedRules, 'function',
  'rule-orchestrator must export clearLearnedRules (vault-lock clear that leaves corrections handling untouched)');
assert.equal(proposer.MIN_SUPPORT, 3, 'MIN_SUPPORT stays 3');

// --- Clean slate -------------------------------------------------------------
store.clearRules();
orchestrator.clearProposerSession();
assert.equal(store.loadRules().length, 0);
assert.equal(getCorrections(orchestrator.ensureCorrectionStore()).length, 0);

// --- Scripted flow, part 1: three identical-pattern corrections in a stay ---
// Synthetic patients only. The detector missed each attending name; the
// clinician adds it. Same before-context ("Attending: ") every time.
const names = ['Zephyr Quinn', 'Priya Nair', 'Tomas Lindqvist'];
function addedNameCorrection(name, i) {
  const noteText = `Attending: ${name}, MD\nSeen on rounds today.`;
  const start = noteText.indexOf(name);
  return {
    decision: 'added',
    original: null,
    corrected: { start, end: start + name.length, label: 'Name', text: name },
    noteText,
    noteId: `synthetic-note-${i}`,
    label: 'Name',
  };
}
names.forEach((name, i) => orchestrator.recordCorrection(addedNameCorrection(name, i)));

// The proposer runs on every correction, so the third matching correction
// (MIN_SUPPORT) proposes immediately — no waiting for a fifth correction.
const pending = store.getPendingRules();
assert.ok(pending.length >= 1,
  `expected a proposed rule after 3 same-pattern corrections, got ${pending.length}`);
assert.doesNotThrow(() => new RegExp(pending[0].pattern), 'proposed pattern must compile');

// In-memory rules may carry this session's examples (for the review cards).
assert.ok(JSON.stringify(pending[0].examples || []).includes('Zephyr Quinn'),
  'in-memory proposed rule should still carry its session examples for display');

// --- Clinician approves ------------------------------------------------------
assert.equal(orchestrator.decideRule(pending[0].name, true), true);
assert.equal(store.getApprovedRules().length, 1);

// --- The persisted projection contains patterns only -------------------------
const persisted = store.sanitizeRulesForPersistence(store.loadRules());
assert.equal(persisted.length, 1);
const persistedJson = JSON.stringify(persisted);
for (const fragment of ['Zephyr', 'Quinn', 'Priya', 'Nair', 'Tomas', 'Lindqvist', 'examples', 'correctionIds', 'span_text', 'synthetic-note']) {
  assert.ok(!persistedJson.includes(fragment),
    `persisted rule projection must not contain ${JSON.stringify(fragment)}`);
}
assert.equal(persisted[0].status, 'approved');
assert.equal(persisted[0].pattern, pending[0].pattern);
assert.equal(persisted[0].targetType, 'Name');

// A tampered or legacy record must fail closed: unparseable patterns and
// unknown actions/statuses are dropped, never carried into the app.
const cleaned = store.sanitizeRulesForPersistence([
  { name: 'bad-pattern', action: 'detect', pattern: '([', targetType: 'Name', status: 'approved' },
  { name: 'bad-action', action: 'exfiltrate', pattern: 'x', targetType: 'Name', status: 'approved' },
  { name: 'bad-status', action: 'detect', pattern: 'x', targetType: 'Name', status: 'pending-ish' },
  null,
  'not a rule',
]);
assert.deepEqual(cleaned, [], 'invalid persisted rules must be dropped by the sanitizer');

// --- Vault round trip (the encrypted record's data shape) --------------------
const vault = vaultState.migrateVaultState({
  ...vaultState.createEmptyVaultState(),
  learnedDeidRules: persisted,
});
const serializedVault = JSON.stringify(vault);
for (const fragment of ['Zephyr', 'Quinn', 'Priya', 'Nair', 'Tomas', 'Lindqvist']) {
  assert.ok(!serializedVault.includes(fragment),
    `serialized vault must not contain patient span text ${JSON.stringify(fragment)}`);
}
const reloaded = vaultState.migrateVaultState(JSON.parse(serializedVault));
assert.equal(reloaded.learnedDeidRules.length, 1,
  'learned rules must survive a vault save/load migration round trip');
assert.equal(reloaded.learnedDeidRules[0].pattern, pending[0].pattern);

// Patient edits must not drop the rules: every vault CRUD helper routes
// through migrateVaultState, so an unrelated update keeps the field.
const withPatient = vaultState.upsertPatient(reloaded, vaultState.createPatientRecord('Room 12'));
assert.equal(withPatient.learnedDeidRules.length, 1,
  'learned rules must survive unrelated vault updates (upsertPatient)');

// --- Patient switch: corrections die, rules live ------------------------------
orchestrator.clearProposerSession();
assert.equal(getCorrections(orchestrator.ensureCorrectionStore()).length, 0,
  'raw corrections must be cleared on patient switch');
assert.equal(store.getApprovedRules().length, 1,
  'approved rules must survive a patient switch');

// --- Vault lock clears memory; unlock rehydrates from the vault ---------------
orchestrator.clearLearnedRules();
assert.equal(store.loadRules().length, 0, 'vault lock must clear in-memory rules');
store.saveRules(reloaded.learnedDeidRules); // what unlock does with app.vault.learnedDeidRules
assert.equal(store.getApprovedRules().length, 1, 'unlock must rehydrate approved rules from the vault');

// --- The approved rule changes detection on a new patient's note ---------------
const newNote = 'Attending: Marlowe Reyes, MD\nNew admission, full note to follow.';
const detected = orchestrator.applyApprovedRules(newNote, []);
assert.ok(
  detected.some((e) => e.label === 'Name' && newNote.slice(e.start, e.end) === 'Marlowe Reyes'),
  `approved rule should detect the attending name in a new note, got ${JSON.stringify(detected)}`,
);

// --- Panel contract: Hospital Stay view hosts the panel too --------------------
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/ui/app.js?v=20261015-tokenized-drafts', import.meta.url), 'utf8');
assert.ok(indexHtml.includes('id="dailyRuleProposals"'),
  'index.html must host a Suggested rules panel container inside the Hospital Stay (daily) view');
const renderDailyBody = appSource.slice(appSource.indexOf('function renderDaily()'), appSource.indexOf('function renderDaily()') + 600);
assert.ok(renderDailyBody.includes('dailyRuleProposals') && renderDailyBody.includes('data-rule-proposals'),
  'renderDaily must render the Suggested rules panel into the Hospital Stay view');
assert.ok(appSource.includes('querySelectorAll("[data-rule-proposals]")'),
  'refreshRuleProposalsPanel must update every mounted panel (Hospital Stay and Quick De-ID), not just the first');
assert.ok(appSource.includes('data-rule-proposals'),
  'Quick De-ID must keep its Suggested rules panel');

delete globalThis.localStorage;
console.log('Durable rules: propose-on-every-correction, vault persistence (pattern-only), patient-switch survival, lock clear + unlock rehydrate, detection, and Hospital Stay panel contract passed.');
