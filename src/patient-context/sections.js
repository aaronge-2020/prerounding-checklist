import { createTextSection, normalizeSection } from "../app/state/vault.js";

export function reorderSections(sections, sectionId, direction) {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return sections;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
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
        residualWarnings: result.residualWarnings || result.flags || [],
        createdAt: row.createdAt,
        updatedAt: new Date().toISOString()
      },
      `Section ${index + 1}`
    );
  });
}

export async function replaceSectionsFromFormAsync(rows, deidentify) {
  const results = await Promise.all(rows.map((row) => deidentify(String(row.text || ""))));
  return rows.map((row, index) => {
    const result = results[index] || {};
    return normalizeSection(
      {
        id: row.id,
        label: row.label || `Section ${index + 1}`,
        deidentifiedText: result.text || "",
        residualWarnings: result.residualWarnings || result.flags || [],
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
    .map((section) => `## ${section.label}\n${section.deidentifiedText.trim()}`);
  return entries.length ? `# ${title}\n\n${entries.join("\n\n")}` : `# ${title}\n\nNo saved de-identified text.`;
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
