// Approval UI: plain-English proposal cards for auto-generated rules.
//
// Each card shows what the rule does in plain language, with examples from
// the clinician's own corrections. Approve/Reject buttons. No regex shown
// unless the clinician asks for details.
//
// Follows the presentation-module pattern: factory function, escapeHtml,
// returns HTML strings. No DOM side effects.

/**
 * Describe a rule in plain English.
 */
export function describeRule(rule) {
  if (!rule) return "";
  const n = rule.coverage || 0;
  const times = n === 1 ? "1 correction" : `${n} corrections`;
  switch (rule.action) {
    case "detect":
      return `When this pattern appears, mark the following text as ${rule.targetType}. Based on ${times} you made.`;
    case "suppress":
      return `Don't flag ${rule.targetType} when this pattern appears. Based on ${times} you removed.`;
    case "relabel":
      return `Change ${rule.targetType} to ${rule.newType} when this pattern appears. Based on ${times} you relabeled.`;
    default:
      return rule.description || "";
  }
}

/**
 * Create the approval UI presentation.
 */
export function createApprovalPresentation({ escapeHtml }) {
  function renderRuleCard(rule) {
    const desc = describeRule(rule);
    const examples = (rule.examples || []).filter(Boolean).slice(0, 3);
    const exampleHtml = examples.length
      ? `<ul class="rule-card-examples">${examples.map(ex =>
          `<li><q>${escapeHtml(ex)}</q></li>`).join("")}</ul>`
      : "";
    return `
      <div class="rule-card" data-rule-name="${escapeHtml(rule.name)}">
        <div class="rule-card-body">
          <p class="rule-card-desc">${escapeHtml(desc)}</p>
          ${exampleHtml}
          <p class="rule-card-meta">Covers ${rule.coverage || 0} of your corrections</p>
        </div>
        <div class="rule-card-actions">
          <button type="button" data-action="approve-rule" data-rule-name="${escapeHtml(rule.name)}">Enable rule</button>
          <button type="button" data-action="reject-rule" data-rule-name="${escapeHtml(rule.name)}">Reject</button>
        </div>
      </div>`;
  }

  function renderPendingRules(rules) {
    const pending = (rules || []).filter(r => r.status === "proposed");
    if (!pending.length) {
      return `
      <div class="rule-list" data-rule-list>
        <h3>Suggested rules</h3>
        <p class="rule-empty">No new rule suggestions. Keep reviewing — suggestions appear after you've made a few corrections with a shared pattern.</p>
      </div>`;
    }
    return `
      <div class="rule-list" data-rule-list>
        <h3>Suggested rules (${pending.length})</h3>
        <p class="rule-intro">Experimental suggestions learned from your corrections. Inspect each pattern before enabling it. Rules are saved in your encrypted vault (pattern only, never your notes' text) and stay active across patients; locking the vault hides them until you unlock. Correction coverage is not a validated accuracy score.</p>
        ${pending.map(renderRuleCard).join("")}
      </div>`;
  }

  function renderApprovedRules(rules) {
    const approved = (rules || []).filter(r => r.status === "approved");
    if (!approved.length) return "";
    return `
      <div class="rule-list rule-list--approved" data-approved-rule-list>
        <h3>Active rules (${approved.length})</h3>
        ${approved.map(r => `
          <div class="rule-card rule-card--compact" data-rule-name="${escapeHtml(r.name)}">
            <span>${escapeHtml(describeRule(r))}</span>
            <button type="button" data-action="reject-rule" data-rule-name="${escapeHtml(r.name)}" title="Disable this rule">Disable</button>
          </div>`).join("")}
      </div>`;
  }

  return { renderRuleCard, renderPendingRules, renderApprovedRules, describeRule };
}
