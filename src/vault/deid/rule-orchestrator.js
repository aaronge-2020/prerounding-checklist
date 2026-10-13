// Rule proposer orchestrator: ties correction capture, proposing,
// approval, and application together.
//
// Flow:
//   1. Corrections accumulate in the session-only store (via correction-log.js)
//   2. Every correction re-runs separateAndConquer once enough corrections
//      exist for a pattern (MIN_SUPPORT); dedupe keeps this idempotent
//   3. Proposed rules are saved to the rule store
//   4. Clinician approves/rejects via approval UI
//   5. Approved rules run in the DETECT stage via applyProposedRules
//
// Raw corrections (PHI spans) stay in memory only and are cleared on
// patient switch and vault lock. Rules are vault-level: they survive
// patient switches, and the app edge persists their pattern-only
// projection (see rule-store.js) into the encrypted vault. In-memory
// rules are cleared on vault lock and rehydrated on unlock.

import { separateAndConquer, applyProposedRules, MIN_SUPPORT } from "./rule-proposer.js?v=20261013-durable-rules";
import {
  loadRules, addProposedRules, getApprovedRules, setRuleStatus, clearRules,
} from "./rule-store.js?v=20261013-durable-rules";
import {
  createCorrectionStore, addCorrection, getCorrections, buildCorrection,
} from "./correction-log.js";

// Session-only correction store (PHI never persisted).
let correctionStore = null;

export function ensureCorrectionStore() {
  if (!correctionStore) correctionStore = createCorrectionStore();
  return correctionStore;
}

/**
 * Clear the session-only correction store (raw PHI spans). Called on
 * patient switch and on vault lock. Learned rules are NOT cleared here:
 * they belong to the vault, not to one patient's session.
 */
export function clearProposerSession() {
  correctionStore = null;
}

/**
 * Clear in-memory learned rules. Called on vault lock only; the rules
 * themselves persist in the encrypted vault and are rehydrated on
 * unlock. Patient switches must not call this.
 */
export function clearLearnedRules() {
  clearRules();
}

/**
 * Record a clinician correction and trigger rule proposing.
 *
 * Called from the review flow after logDeidCorrection. The proposer runs
 * on every correction once MIN_SUPPORT corrections exist, so a pattern
 * surfaces as soon as its third matching correction lands instead of
 * waiting for an arbitrary batch boundary.
 *
 * @param {Object} opts - {decision, original, corrected, noteText, noteId}
 * @returns {Array} newly proposed rules (empty if none)
 */
export function recordCorrection(opts) {
  const store = ensureCorrectionStore();
  const correction = buildCorrection(opts);
  if (!correction) return [];
  addCorrection(store, correction);

  if (getCorrections(store).length >= MIN_SUPPORT) {
    return proposeRules();
  }
  return [];
}

/**
 * Run the proposer over accumulated corrections.
 * @returns {Array} newly proposed rules
 */
export function proposeRules() {
  const corrections = getCorrections(ensureCorrectionStore());
  if (corrections.length < MIN_SUPPORT) return [];
  const proposed = separateAndConquer(corrections, { minSupport: MIN_SUPPORT });
  return addProposedRules(proposed);
}

/**
 * Apply approved rules to entities in the DETECT stage.
 *
 * @param {string} text - note text
 * @param {Array} entities - [{start, end, label}]
 * @returns {Array} entities with approved rules applied
 */
export function applyApprovedRules(text, entities) {
  const approved = getApprovedRules();
  if (!approved.length) return entities;
  return applyProposedRules(text, entities, approved);
}

/**
 * Handle clinician approval/rejection of a proposed rule.
 */
export function decideRule(name, approved) {
  return setRuleStatus(name, approved ? "approved" : "rejected");
}

export { loadRules, getApprovedRules };
