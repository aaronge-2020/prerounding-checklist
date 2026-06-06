export const openEvidenceResultSchemaVersion = "open-evidence-task-result-v1";

const checklistStartPattern = /\bBEDSIDE QUESTION CHECKLIST\b/i;
const checklistEndPattern = /\bTARGETED PHYSICAL EXAM CHECKLIST\b/i;

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBody(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleKey(value) {
  return cleanLine(value).replace(/[:.]+$/g, "").toUpperCase();
}

function isSectionHeading(line) {
  const text = cleanLine(line);
  if (!text || text.length > 90) {
    return false;
  }
  if (/^#{1,4}\s+\S/.test(text)) {
    return true;
  }
  if (/^[A-Z][A-Z0-9 /&()+,-]{4,}:?$/.test(text)) {
    return true;
  }
  return /^(high priority|possible|questions|likely okay|summary|assessment|plan|teaching|discharge|guideline|citations|what to verify|blind spots|missing items)\b/i.test(text);
}

export function extractOpenEvidenceSections(text = "") {
  const normalized = normalizeBody(text);
  if (!normalized) {
    return [];
  }
  const sections = [];
  let current = { title: "Summary", lines: [] };

  normalized.split("\n").forEach((line) => {
    if (isSectionHeading(line)) {
      if (current.lines.join("\n").trim()) {
        sections.push({
          title: titleKey(current.title),
          body: normalizeBody(current.lines.join("\n")),
          bullets: extractBullets(current.lines.join("\n"))
        });
      }
      current = { title: line, lines: [] };
      return;
    }
    current.lines.push(line);
  });

  if (current.lines.join("\n").trim()) {
    sections.push({
      title: titleKey(current.title),
      body: normalizeBody(current.lines.join("\n")),
      bullets: extractBullets(current.lines.join("\n"))
    });
  }

  return sections.length ? sections : [{
    title: "SUMMARY",
    body: normalized,
    bullets: extractBullets(normalized)
  }];
}

export function extractBullets(text = "") {
  return normalizeBody(text)
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0 && line.length <= 500);
}

export function extractCitations(text = "") {
  const citations = [];
  const seen = new Set();
  const patterns = [
    /\bhttps?:\/\/[^\s)]+/gi,
    /\bdoi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi,
    /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi,
    /\b(?:NEJM|JAMA|Lancet|BMJ|Cochrane|Diabetes Care|Circulation|Annals|AHA|ACC|ADA|Endocrine Society|NCCN|ACEP)\b[^.\n]*(?:\d{4})?/gi
  ];

  patterns.forEach((pattern) => {
    for (const match of String(text || "").matchAll(pattern)) {
      const value = cleanLine(match[0]).replace(/[),.;]+$/g, "");
      const key = value.toLowerCase();
      if (value && !seen.has(key)) {
        seen.add(key);
        citations.push(value);
      }
    }
  });

  return citations.slice(0, 24);
}

function extractChecklistText(text = "") {
  const normalized = normalizeBody(text);
  const start = normalized.search(checklistStartPattern);
  const examStart = normalized.search(checklistEndPattern);
  if (start < 0 && examStart < 0) {
    return "";
  }
  const from = start >= 0 ? start : examStart;
  return normalized.slice(from).trim();
}

function concernPriority(sectionTitle) {
  const title = titleKey(sectionTitle);
  if (/HIGH PRIORITY|URGENT|VERIFY BEFORE ROUNDS/.test(title)) {
    return "high";
  }
  if (/DOSE|SAFETY|MISSED|HELD|UNEXPECTED|CONCERN/.test(title)) {
    return "medium";
  }
  if (/QUESTION|ASK/.test(title)) {
    return "question";
  }
  return "review";
}

function extractConcerns(sections = []) {
  return sections
    .filter((section) => !/CITATION|SOURCE|REFERENCE|LIKELY OKAY|NO ACTION/.test(titleKey(section.title)))
    .flatMap((section) => (
      section.bullets
        .filter((bullet) => !/^none found\b/i.test(bullet))
        .slice(0, 12)
        .map((bullet) => ({
          priority: concernPriority(section.title),
          section: section.title,
          text: bullet
        }))
    )).slice(0, 40);
}

function acceptedSummaryFromSections(sections = [], outputKind = "general") {
  if (!sections.length) {
    return "";
  }
  if (outputKind === "checklist") {
    return "Checklist response parsed. Review quality before replacing the active checklist.";
  }
  const summarySection = sections.find((section) => /SUMMARY|SNAPSHOT|HIGH PRIORITY|WHAT/.test(section.title)) || sections[0];
  const bullets = summarySection.bullets.length ? summarySection.bullets : [summarySection.body];
  return bullets.slice(0, 4).map((line) => `- ${line}`).join("\n");
}

export function normalizeOpenEvidenceTaskResult(result = {}) {
  return {
    schemaVersion: openEvidenceResultSchemaVersion,
    taskId: cleanLine(result.taskId),
    createdAt: result.createdAt || new Date().toISOString(),
    sourceMode: cleanLine(result.sourceMode || "prior"),
    outputKind: cleanLine(result.outputKind || "general"),
    sections: Array.isArray(result.sections) ? result.sections : [],
    citations: Array.isArray(result.citations) ? result.citations : [],
    concerns: Array.isArray(result.concerns) ? result.concerns : [],
    checklistText: String(result.checklistText || "").trim(),
    acceptedSummary: String(result.acceptedSummary || "").trim(),
    reviewStatus: ["accepted", "needs_review", "rejected"].includes(result.reviewStatus) ? result.reviewStatus : "needs_review"
  };
}

export function parseOpenEvidenceResult({ taskId = "", outputKind = "general", sourceMode = "prior", text = "" } = {}) {
  const normalizedText = normalizeBody(text);
  const sections = extractOpenEvidenceSections(normalizedText);
  const checklistText = outputKind === "checklist" || checklistStartPattern.test(normalizedText)
    ? extractChecklistText(normalizedText)
    : "";
  const citations = extractCitations(normalizedText);
  const concerns = outputKind === "medication_safety"
    ? extractConcerns(sections)
    : outputKind === "missing_items"
      ? extractConcerns(sections)
      : [];

  return normalizeOpenEvidenceTaskResult({
    taskId,
    sourceMode,
    outputKind,
    sections,
    citations,
    concerns,
    checklistText,
    acceptedSummary: acceptedSummaryFromSections(sections, outputKind),
    reviewStatus: "needs_review"
  });
}

export function formatOpenEvidenceResultSummary(result = {}) {
  const normalized = normalizeOpenEvidenceTaskResult(result);
  const lines = [
    `Task: ${normalized.taskId || "unknown"}`,
    `Kind: ${normalized.outputKind || "general"}`,
    `Sections: ${normalized.sections.length}`,
    normalized.citations.length ? `Citations: ${normalized.citations.length}` : "",
    normalized.concerns.length ? `Concerns: ${normalized.concerns.length}` : "",
    normalized.checklistText ? "Checklist: detected" : "",
    normalized.acceptedSummary ? `Summary:\n${normalized.acceptedSummary}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}
