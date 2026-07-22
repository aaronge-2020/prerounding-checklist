import { createTextSection, normalizeSection } from "../app/state/vault.js";
import { isActionableResidualWarning, sanitizeResidualWarningMetadata } from "./review.js";
import { naturalLanguagePrompt } from "../prompts/natural-language.js";

export function reorderSections(sections, sectionId, direction) {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return sections;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function reorderSectionsById(sections, orderedSectionIds = []) {
  const byId = new Map((sections || []).map((section) => [section.id, section]));
  const ordered = (orderedSectionIds || []).map((id) => byId.get(id)).filter(Boolean);
  const included = new Set(ordered.map((section) => section.id));
  return [...ordered, ...(sections || []).filter((section) => !included.has(section.id))];
}

export function removeSection(sections, sectionId) {
  return sections.filter((section) => section.id !== sectionId);
}

export function addSection(sections, label = "Other", options = {}) {
  return [...sections, createTextSection(label, options)];
}

export function replaceSectionsFromForm(rows, deidentify, { scope = "context" } = {}) {
  return rows.map((row, index) => {
    const result = deidentify(String(row.text || ""));
    return normalizeSection(
      {
        id: row.id,
        label: row.label || `Section ${index + 1}`,
        role: row.role,
        deidentifiedText: result.text || "",
        residualWarnings: sanitizeResidualWarningMetadata(result.residualWarnings || result.flags || []),
        createdAt: row.createdAt,
        updatedAt: new Date().toISOString()
      },
      `Section ${index + 1}`,
      { scope, index }
    );
  });
}

// Deciding how much of a field actually needs to go back through the local
// de-id pass. The common clinical workflow is appending new findings below
// text that was already reviewed and saved, so re-running the whole field
// through the model on every save is pure waste (and, for the ML modes, slow).
// Only the plain "unchanged prefix, new text appended after it" shape is
// optimized; anything else (edits in place, reordering, deletions) falls back
// to a full re-redaction so correctness never depends on diffing arbitrary edits.
export function planSectionRedaction(priorText, currentText) {
  const prior = String(priorText || "");
  const current = String(currentText || "");
  if (current === prior) return { mode: "unchanged" };
  if (prior && current.startsWith(prior)) {
    const appended = current.slice(prior.length);
    // The local de-id pass trims leading/trailing whitespace from whatever
    // text it's handed. Carve that whitespace out before sending only the
    // meaningful middle through de-identification, then splice it back in
    // verbatim - otherwise the boundary between the untouched prior text and
    // the newly redacted suffix silently loses its separating whitespace.
    const leadingWhitespace = appended.match(/^\s*/)[0];
    const withoutLeading = appended.slice(leadingWhitespace.length);
    const trailingWhitespace = withoutLeading.match(/\s*$/)[0];
    const suffix = trailingWhitespace ? withoutLeading.slice(0, -trailingWhitespace.length) : withoutLeading;
    return { mode: "append", suffix, leadingWhitespace, trailingWhitespace };
  }
  return { mode: "full" };
}

export async function replaceSectionsFromFormAsync(rows, deidentify, { onResult, onProgress, priorSections = [], scope = "context" } = {}) {
  const priorById = new Map((priorSections || []).map((section) => [section.id, section]));
  const plans = rows.map((row) => {
    const prior = priorById.get(row.id) || null;
    return { row, prior, plan: planSectionRedaction(prior?.deidentifiedText, row.text) };
  });
  let completed = 0;
  const total = rows.length;
  const results = await Promise.all(plans.map(async ({ row, prior, plan }, index) => {
    onProgress?.({ phase: "started", index, completed, total, row });
    let result;
    if (plan.mode === "unchanged") {
      // Nothing to redact - the field is byte-identical to what was already
      // reviewed and saved last time.
      result = { text: prior.deidentifiedText, residualWarnings: prior.residualWarnings || [] };
    } else if (plan.mode === "append") {
      if (!plan.suffix) {
        // Only whitespace was appended - nothing new to redact.
        result = { text: prior.deidentifiedText + plan.leadingWhitespace + plan.trailingWhitespace, residualWarnings: prior.residualWarnings || [] };
      } else {
        const suffixResult = await deidentify(plan.suffix);
        result = {
          text: prior.deidentifiedText + plan.leadingWhitespace + (suffixResult.text || "") + plan.trailingWhitespace,
          residualWarnings: [...(prior.residualWarnings || []), ...(suffixResult.residualWarnings || suffixResult.flags || [])],
          suffixResult
        };
      }
    } else {
      result = await deidentify(String(row.text || ""));
    }
    completed += 1;
    onProgress?.({ phase: "completed", index, completed, total, row });
    return result;
  }));
  return rows.map((row, index) => {
    const { prior, plan } = plans[index];
    const result = results[index] || {};
    onResult?.({ row, result, prior, plan, index });
    return normalizeSection(
      {
        id: row.id,
        label: row.label || `Section ${index + 1}`,
        role: row.role,
        deidentifiedText: result.text || "",
        // Warning snippets can themselves contain residual PHI. Persist only
        // the metadata; detailed review remains in the active browser tab.
        residualWarnings: sanitizeResidualWarningMetadata(result.residualWarnings || result.flags || []),
        createdAt: row.createdAt,
        updatedAt: new Date().toISOString()
      },
      `Section ${index + 1}`,
      { scope, index }
    );
  });
}

export function sectionsToPromptBlock(sections = [], title = "Patient context") {
  const entries = sections
    .filter((section) => String(section.deidentifiedText || "").trim())
    .map((section) => `${section.label || "Saved information"}: ${section.deidentifiedText.trim()}`);
  const body = entries.length ? entries.join("\n\n") : "No saved de-identified text.";
  return naturalLanguagePrompt(`${title}.\n\n${body}`);
}

export function sectionWarningSummary(sections = []) {
  return sections.flatMap((section) =>
    (section.residualWarnings || []).map((warning, warningIndex) => ({ warning, warningIndex })).filter(({ warning }) => isActionableResidualWarning(warning)).map(({ warning, warningIndex }) => ({
      sectionLabel: section.label,
      sectionId: section.id,
      warningIndex,
      warning,
      text: typeof warning === "string" ? warning : warning.reason || warning.type || JSON.stringify(warning),
      snippet: typeof warning === "object" && warning ? String(warning.snippet || "") : ""
    }))
  );
}
