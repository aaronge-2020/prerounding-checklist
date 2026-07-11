import { createTextSection, normalizeSection } from "../app/state/vault.js";
import { sanitizeResidualWarningMetadata } from "./review.js";
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

export function addSection(sections, label = "Other") {
  return [...sections, createTextSection(label)];
}

export function replaceSectionsFromForm(rows, deidentify) {
  return rows.map((row, index) => {
    const result = deidentify(String(row.text || ""));
    return normalizeSection(
      {
        id: row.id,
        label: row.label || `Section ${index + 1}`,
        deidentifiedText: result.text || "",
        residualWarnings: sanitizeResidualWarningMetadata(result.residualWarnings || result.flags || []),
        createdAt: row.createdAt,
        updatedAt: new Date().toISOString()
      },
      `Section ${index + 1}`
    );
  });
}

export async function replaceSectionsFromFormAsync(rows, deidentify, { onResult, onProgress } = {}) {
  let completed = 0;
  const total = rows.length;
  const results = await Promise.all(rows.map(async (row, index) => {
    onProgress?.({ phase: "started", index, completed, total, row });
    const result = await deidentify(String(row.text || ""));
    completed += 1;
    onProgress?.({ phase: "completed", index, completed, total, row });
    return result;
  }));
  return rows.map((row, index) => {
    const result = results[index] || {};
    onResult?.({ row, result, index });
    return normalizeSection(
      {
        id: row.id,
        label: row.label || `Section ${index + 1}`,
        deidentifiedText: result.text || "",
        // Warning snippets can themselves contain residual PHI. Persist only
        // the metadata; detailed review remains in the active browser tab.
        residualWarnings: sanitizeResidualWarningMetadata(result.residualWarnings || result.flags || []),
        createdAt: row.createdAt,
        updatedAt: new Date().toISOString()
      },
      `Section ${index + 1}`
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
    (section.residualWarnings || []).map((warning, warningIndex) => ({
      sectionLabel: section.label,
      sectionId: section.id,
      warningIndex,
      warning,
      text: typeof warning === "string" ? warning : warning.reason || warning.type || JSON.stringify(warning),
      snippet: typeof warning === "object" && warning ? String(warning.snippet || "") : ""
    }))
  );
}
