// Rule proposer orchestrator: ties correction capture, proposing,
// approval, and application together.
//
// Flow:
//   1. Corrections accumulate in the session-only store (via correction-log.js)
//   2. After enough corrections, separateAndConquer proposes rules
//   3. Proposed rules are saved to the rule store (session-only)
//   4. Clinician approves/rejects via approval UI
//   5. Approved rules run in the DETECT stage via applyProposedRules
//
// All PHI stays in memory. Patterns and examples also stay in memory.

import { separateAndConquer, applyProposedRules, MIN_SUPPORT } from "./rule-proposer.js?v=20261011-epic-workflow";
import {
  loadRules, addProposedRules, getApprovedRules, setRuleStatus, clearRules,
} from "./rule-store.js?v=20261011-epic-workflow";
import {
  createCorrectionStore, addCorrection, getCorrections, buildCorrection,
} from "./correction-log.js";

// Corrections needed before the proposer runs.
const PROPOSE_THRESHOLD = 5;

// Session-only correction store (PHI never persisted).
let correctionStore = null;

export function ensureCorrectionStore() {
  if (!correctionStore) correctionStore = createCorrectionStore();
  return correctionStore;
}

export function clearProposerSession() {
  correctionStore = null;
  clearRules();
}

/**
 * Record a clinician correction and maybe trigger rule proposing.
 *
 * Called from the review flow after logDeidCorrection.
 *
 * @param {Object} opts - {decision, original, corrected, noteText, noteId}
 * @returns {Array} newly proposed rules (empty if threshold not met)
 */
export function recordCorrection(opts) {
  const store = ensureCorrectionStore();
  const correction = buildCorrection(opts);
  if (!correction) return [];
  addCorrection(store, correction);

  // Propose when enough corrections have accumulated
  const all = getCorrections(store);
  if (all.length >= PROPOSE_THRESHOLD && all.length % PROPOSE_THRESHOLD === 0) {
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
