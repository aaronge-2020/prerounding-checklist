// Pinned assertion chips for Agent-mode deterministic findings.
//
// Deterministic tool results (drug interactions, calculator scores, label
// excerpts) are rendered as pinned chips SEPARATE from the model's prose.
// The model can reference them but cannot alter, soften, or override them:
// chips are built from the structured `deterministic` payloads captured by
// the agent runner, never from model text.
//
// Pure module: takes findings + an escapeHtml function, returns HTML.
// No DOM, no storage, no network.

export const AGENT_DETERMINISTIC_TAG = "20260929-agent-deterministic-v1";

/**
 * Render pinned assertion chips for a list of deterministic findings.
 * Returns "" when there is nothing deterministic to pin.
 */
export function renderAssertionChips(deterministicFindings, escapeHtml) {
  const esc = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s ?? "");
  const chips = [];
  for (const finding of deterministicFindings || []) {
    if (!finding || typeof finding !== "object") continue;
    const kind = String(finding.kind || "");
    if (kind === "interaction-check" || kind === "pair-check") {
      chips.push(...renderInteractionChips(finding, esc));
    } else if (kind === "calculator-run") {
      const chip = renderCalculatorChip(finding, esc);
      if (chip) chips.push(chip);
    } else if (kind === "label-lookup") {
      const chip = renderLabelChip(finding, esc);
      if (chip) chips.push(chip);
    }
    // "calculator-list" findings are navigational, not assertions — skipped.
  }
  if (!chips.length) return "";
  return (
    `<div class="aic-assertions" data-agent-assertions>` +
    `<p class="aic-assertions-title">Verified findings <span class="aic-muted">(computed locally — model prose cannot override these)</span></p>` +
    chips.join("") +
    `</div>`
  );
}

function severityClass(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "major") return "aic-chip--major";
  if (s === "moderate") return "aic-chip--moderate";
  return "aic-chip--info";
}

function renderInteractionChips(finding, esc) {
  const chips = [];
  const interactions = Array.isArray(finding.interactions) ? finding.interactions : [];
  for (const hit of interactions) {
    const drugs = Array.isArray(hit.drugs) && hit.drugs.length
      ? hit.drugs.join(" + ")
      : [hit.rxcuiA, hit.rxcuiB].filter(Boolean).join(" + ");
    const mechs = Array.isArray(hit.mechanisms) && hit.mechanisms.length
      ? ` <span class="aic-chip-mech">${esc(hit.mechanisms.join(", "))}</span>`
      : "";
    chips.push(
      `<div class="aic-chip ${severityClass(hit.severity)}" data-assertion="interaction">` +
      `<span class="aic-chip-sev">${esc(hit.severity || "Unknown")}</span>` +
      `<span class="aic-chip-body">${esc(drugs)}${mechs}</span>` +
      `</div>`
    );
  }
  if (finding.bundlePartial && chips.length) {
    chips.push(
      `<div class="aic-chip aic-chip--warn" data-assertion="coverage">` +
      `<span class="aic-chip-body">Interaction bundle is partial — absence of other pairs here is not proof of safety.</span>` +
      `</div>`
    );
  }
  if (!interactions.length && finding.kind === "interaction-check" && (finding.medicationCount || 0) > 0) {
    chips.push(
      `<div class="aic-chip aic-chip--info" data-assertion="interaction">` +
      `<span class="aic-chip-body">No interactions found in the DDInter bundle for ${esc(String(finding.medicationCount))} checked medications` +
      `${finding.bundlePartial ? " (partial bundle — not proof of safety)" : ""}.</span>` +
      `</div>`
    );
  }
  if (finding.kind === "pair-check" && finding.resolved === false) {
    chips.push(
      `<div class="aic-chip aic-chip--warn" data-assertion="interaction">` +
      `<span class="aic-chip-body">Could not resolve ${esc(finding.drugA || "")} / ${esc(finding.drugB || "")} to RxNorm — not checked for interactions.</span>` +
      `</div>`
    );
  }
  return chips;
}

function renderCalculatorChip(finding, esc) {
  if (!finding.found) {
    return (
      `<div class="aic-chip aic-chip--warn" data-assertion="calculator">` +
      `<span class="aic-chip-body">Unknown calculator "${esc(finding.calculatorId || "")}".</span>` +
      `</div>`
    );
  }
  if (!finding.complete) {
    const missing = Array.isArray(finding.missing) ? finding.missing.join(", ") : "";
    return (
      `<div class="aic-chip aic-chip--warn" data-assertion="calculator">` +
      `<span class="aic-chip-body">${esc(finding.title || finding.calculatorId)}: incomplete — missing ${esc(missing)}.</span>` +
      `</div>`
    );
  }
  return (
    `<div class="aic-chip aic-chip--calc" data-assertion="calculator">` +
    `<span class="aic-chip-sev">${esc(String(finding.score ?? ""))}</span>` +
    `<span class="aic-chip-body">${esc(finding.title || "")}: ${esc(finding.headline || "")}` +
    (finding.verifiedOn ? ` <span class="aic-chip-mech">MDCalc-parity, verified ${esc(finding.verifiedOn)}</span>` : "") +
    `</span></div>`
  );
}

function renderLabelChip(finding, esc) {
  if (finding.rejected) {
    return (
      `<div class="aic-chip aic-chip--warn" data-assertion="label">` +
      `<span class="aic-chip-body">Label lookup rejected — not a bare drug name.</span>` +
      `</div>`
    );
  }
  if (!finding.resolved) {
    return (
      `<div class="aic-chip aic-chip--warn" data-assertion="label">` +
      `<span class="aic-chip-body">Could not resolve "${esc(finding.drugName || "")}" to RxNorm — no label retrieved.</span>` +
      `</div>`
    );
  }
  const sections = Array.isArray(finding.sections) ? finding.sections : [];
  if (!sections.length) {
    return (
      `<div class="aic-chip aic-chip--info" data-assertion="label">` +
      `<span class="aic-chip-body">No DailyMed label sections retrieved for ${esc(finding.drugName || "")}.</span>` +
      `</div>`
    );
  }
  return sections.map(
    (s) =>
      `<div class="aic-chip aic-chip--label" data-assertion="label">` +
      `<span class="aic-chip-sev">${esc(s.title || "Label")}</span>` +
      `<span class="aic-chip-body">${esc(finding.drugName || "")}: ${esc(String(s.excerpt || "").slice(0, 220))}</span>` +
      `</div>`
  ).join("");
}
