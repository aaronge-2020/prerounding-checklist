// Boundary contract for the rule proposer (updated 2026-10-13 for durable
// rules):
//   - The rule store NEVER touches plaintext browser storage (the throwing
//     localStorage getter below proves it). Persistence happens only as a
//     pattern-only projection inside the encrypted vault, written by the
//     app edge — and that projection drops examples (raw span text),
//     correction ids, and anything malformed.
//   - Rules require explicit clinician approval before they apply, and
//     reads are immutable copies.
//   - Raw corrections are session-only: clearProposerSession() (patient
//     switch / vault lock) wipes them, as before. Learned rules are
//     vault-level, so clearProposerSession() no longer wipes them; only
//     clearLearnedRules() (vault lock) clears the in-memory rules.
import assert from 'node:assert/strict';
import { saveRules, loadRules, getApprovedRules, setRuleStatus, sanitizeRulesForPersistence } from '../src/vault/deid/rule-store.js?v=20261013-durable-rules';
import { clearProposerSession, clearLearnedRules, recordCorrection, ensureCorrectionStore } from '../src/vault/deid/rule-orchestrator.js?v=20261013-durable-rules';
import { getCorrections } from '../src/vault/deid/correction-log.js';
Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Rule text must never access plaintext storage');}});
saveRules([{name:'synthetic',action:'detect',pattern:'Sensitive example',targetType:'Name',examples:['Synthetic source'],correctionIds:['corr_1'],status:'proposed'}]);
assert.equal(getApprovedRules().length,0);
assert.equal(setRuleStatus('synthetic','approved'),true);
assert.equal(getApprovedRules().length,1);
const copy=loadRules();copy[0].pattern='changed';assert.equal(loadRules()[0].pattern,'Sensitive example');
// The persistence projection carries the pattern and the decision, never the examples.
const persisted=sanitizeRulesForPersistence(loadRules());
assert.equal(persisted.length,1);
assert.equal(persisted[0].status,'approved');
assert.ok(!('examples' in persisted[0])&&!('correctionIds' in persisted[0]));
assert.ok(!JSON.stringify(persisted).includes('Synthetic source'));
// Raw corrections still die on a patient switch; learned rules survive it.
const noteText='Attending: Boundary Synthetic, MD';
recordCorrection({decision:'added',original:null,corrected:{start:11,end:29,label:'Name',text:'Boundary Synthetic'},noteText,noteId:'synthetic',label:'Name'});
assert.equal(getCorrections(ensureCorrectionStore()).length,1);
clearProposerSession();
assert.equal(getCorrections(ensureCorrectionStore()).length,0);
assert.equal(loadRules().length,1);
// Vault lock clears the in-memory rules too.
clearLearnedRules();assert.equal(loadRules().length,0);
delete globalThis.localStorage;
console.log('Rules: no plaintext storage access, explicit approval, immutable reads, pattern-only persistence projection, corrections session-only, rules survive patient switch and clear on lock passed.');
