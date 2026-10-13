// In-memory working store for proposed and approved rules.
//
// Rules in memory may carry this session's examples (source span text) for
// the review cards, so this store is never serialized as-is. Persistence
// goes through sanitizeRulesForPersistence(): a pattern-only projection
// (no examples, no correction ids, no span text) that the app edge writes
// into the encrypted vault. Plaintext browser storage is never used — the
// pre-2026-10 build that cached source-derived patterns in a plaintext
// localStorage key was removed on purpose, and this store must never
// touch browser storage directly.
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

const PERSISTED_RULE_ACTIONS = ["detect", "suppress", "relabel"];
const PERSISTED_RULE_STATUSES = ["proposed", "approved", "rejected"];

/**
 * Project one rule to its persisted shape: pattern and decision metadata
 * only. Examples, correction ids, and descriptions are dropped — examples
 * are raw source span text, correction ids are session-local, and the
 * description is re-derivable from the pattern. Returns null for anything
 * that is not a well-formed rule (unparseable pattern, unknown action or
 * status), so a tampered or legacy record fails closed instead of
 * smuggling source text into the vault.
 */
export function sanitizeRuleForPersistence(rule) {
  if (!rule || typeof rule !== "object") return null;
  const name = typeof rule.name === "string" ? rule.name : "";
  const action = PERSISTED_RULE_ACTIONS.includes(rule.action) ? rule.action : "";
  const pattern = typeof rule.pattern === "string" ? rule.pattern : "";
  const targetType = typeof rule.targetType === "string" ? rule.targetType : "";
  const status = PERSISTED_RULE_STATUSES.includes(rule.status) ? rule.status : "";
  if (!name || !action || !pattern || !targetType || !status) return null;
  try { new RegExp(pattern); } catch { return null; }
  const clean = {
    name,
    action,
    pattern,
    targetType,
    status,
    coverage: Number.isFinite(rule.coverage) ? rule.coverage : 0,
    createdAt: Number.isFinite(rule.createdAt) ? rule.createdAt : 0,
  };
  if (typeof rule.context === "string" && rule.context) clean.context = rule.context;
  if (action === "relabel" && typeof rule.newType === "string" && rule.newType) clean.newType = rule.newType;
  if (Number.isFinite(rule.decidedAt)) clean.decidedAt = rule.decidedAt;
  return clean;
}

/**
 * Project a rule list to its persisted shape, dropping invalid entries.
 */
export function sanitizeRulesForPersistence(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.map(sanitizeRuleForPersistence).filter(Boolean);
}
