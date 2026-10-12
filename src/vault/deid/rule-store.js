// Session-only proposed rules. Patterns and examples may contain source text.
// Never serialize this store to browser storage or the encrypted vault.
let sessionRules = [];
export const RULE_STORE_VERSION = 2;
const clone = (rules) => JSON.parse(JSON.stringify(rules));
export function loadRules() { return clone(sessionRules); }
export function saveRules(rules) {
  sessionRules = clone(Array.isArray(rules) ? rules : []);
}

/**
 * Add newly proposed rules, deduplicating against existing.
 * @returns {Array} newly added rules
 */
export function addProposedRules(proposed) {
  const existing = loadRules();
  const seen = new Set(existing.map(r => `${r.action}:${r.pattern}`));
  const fresh = (proposed || []).filter(r => !seen.has(`${r.action}:${r.pattern}`));
  if (fresh.length) saveRules([...existing, ...fresh]);
  return fresh;
}

/**
 * Update a rule's status (approved / rejected).
 */
export function setRuleStatus(name, status) {
  const rules = loadRules();
  const rule = rules.find(r => r.name === name);
  if (!rule) return false;
  if (!["approved", "rejected"].includes(status)) return false;
  rule.status = status;
  rule.decidedAt = Date.now();
  saveRules(rules);
  return true;
}

/**
 * Get approved rules for the DETECT stage.
 */
export function getApprovedRules() {
  return loadRules().filter(r => r.status === "approved");
}

/**
 * Get proposed rules awaiting clinician review.
 */
export function getPendingRules() {
  return loadRules().filter(r => r.status === "proposed");
}

/**
 * Remove a rule entirely.
 */
export function deleteRule(name) {
  saveRules(loadRules().filter(r => r.name !== name));
}

/**
 * Clear all rules (for testing/reset).
 */
export function clearRules() { sessionRules = []; }
