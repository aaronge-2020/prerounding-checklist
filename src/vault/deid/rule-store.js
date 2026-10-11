// Rule store: persistent JSON storage for proposed and approved rules.
//
// Rules are regex patterns + metadata. They contain NO PHI, so they can be
// safely persisted to localStorage (unlike corrections, which stay in memory).
//
// Format is inspired by chart-scrub's validated JSON rule format:
//   {name, pattern, action, targetType, description, ...}
// with added lifecycle states: proposed → approved|rejected.

const STORAGE_KEY = "deid.proposedRules.v1";
export const RULE_STORE_VERSION = 1;

/**
 * Load rules from localStorage.
 * @returns {Array} rules
 */
export function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data.rules)) return [];
    return data.rules.filter(r => r && r.pattern && r.name);
  } catch {
    return [];
  }
}

/**
 * Save rules to localStorage.
 */
export function saveRules(rules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: RULE_STORE_VERSION,
      updatedAt: Date.now(),
      rules: rules || [],
    }));
  } catch {
    // Storage full or unavailable; rules still work for the session.
  }
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
export function clearRules() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
