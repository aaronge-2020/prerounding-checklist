import { NOTE_TYPES } from "./model.js";
import {
  NOTE_LAB_FAMILY_LABELS,
  NOTE_LAB_FAMILY_ORDER,
  NOTE_VITALS_GROUP_KEY,
  NOTE_VITALS_GROUP_LABEL
} from "../review-data/compact-summary.js?v=20260924-note-grouping-v1";

function valueText(value) {
  return String(value?.deidentifiedText || "").trim();
}

function section(heading, body) {
  const content = String(body || "").trim();
  return content ? `**${heading}**\n\n${content}` : "";
}

function labeledLine(label, value) {
  const content = valueText(value);
  return content ? `**${label}:** ${content}` : "";
}

function markdownTableCell(value) {
  return String(value || "").trim().replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function actionBullets(label, value) {
  const content = valueText(value);
  if (!content) return [];
  const lines = content.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s+/, "")).filter(Boolean);
  return lines.map((line) => `- ${label} — ${line}`);
}

// The HPI often opens by restating the one-liner verbatim. The note should
// not repeat it: drop a leading paragraph or leading sentence of the HPI that
// matches the one-liner after case/punctuation normalization.
function dedupeOneLiner(oneLiner, hpi) {
  const one = String(oneLiner || "").trim();
  const body = String(hpi || "").trim();
  if (!one || !body) return body;
  const normalize = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const oneNorm = normalize(one);
  if (!oneNorm) return body;
  if (normalize(body) === oneNorm) return "";
  const paragraphs = body.split(/\n\s*\n/);
  if (paragraphs.length > 1 && normalize(paragraphs[0]) === oneNorm) {
    return paragraphs.slice(1).join("\n\n").trim();
  }
  const sentenceMatch = body.match(/^(.+?[.!?])(\s+|$)/);
  if (sentenceMatch && normalize(sentenceMatch[1]) === oneNorm) {
    return body.slice(sentenceMatch[0].length).trim();
  }
  return body;
}

// Structured form of one objective selection for the note. Synced blocks use
// the label/detail pair captured at selection time; edited blocks keep the
// student's wording but stay in their group.
function objectiveItem(block) {
  const label = String(block?.noteLabel || "").trim();
  const detail = String(block?.noteDetail || "").trim();
  if (block?.state === "edited") return { edited: true, text: String(block.editedText || "").trim() };
  const text = `${label}${detail ? ` ${detail}` : ""}`.trim() || String(block?.editedText || "").trim();
  return { label, detail, text };
}

function mergeMetabolicFamilies(groups) {
  const metabolic = groups.get("metabolic");
  const hepatic = groups.get("hepatic");
  if (!metabolic?.items.length || !hepatic?.items.length) return;
  groups.delete("metabolic");
  groups.delete("hepatic");
  groups.set("comprehensive_metabolic", {
    label: NOTE_LAB_FAMILY_LABELS.comprehensive_metabolic,
    items: [...metabolic.items, ...hepatic.items]
  });
}

// The Objective section groups selections instead of concatenating one
// paragraph per block: a Vitals group, one group per laboratory panel family
// (CBC, metabolic, ...), then everything else in selection order.
function objectiveModel(draft) {
  const items = (draft.objective?.selectedBlocks || [])
    .map((block) => ({ block, ...objectiveItem(block) }))
    .filter((entry) => entry.text);
  const vitals = [];
  const labGroups = new Map();
  const paragraphs = [];
  for (const entry of items) {
    const key = String(entry.block.noteGroupKey || "");
    if (key === NOTE_VITALS_GROUP_KEY && entry.text) {
      vitals.push({ label: entry.label, detail: entry.detail, text: entry.text, edited: entry.edited });
      continue;
    }
    if (key.startsWith("lab:") && entry.text) {
      const familyKey = key.slice(4);
      if (!labGroups.has(familyKey)) {
        labGroups.set(familyKey, {
          label: String(entry.block.noteGroupLabel || "").trim() || NOTE_LAB_FAMILY_LABELS[familyKey] || familyKey,
          items: []
        });
      }
      labGroups.get(familyKey).items.push({ label: entry.label, detail: entry.detail, text: entry.text, edited: entry.edited });
      continue;
    }
    paragraphs.push(entry.text);
  }
  mergeMetabolicFamilies(labGroups);
  const labFamilies = [];
  for (const familyKey of NOTE_LAB_FAMILY_ORDER) {
    const group = labGroups.get(familyKey);
    if (!group?.items.length) continue;
    labFamilies.push(group);
    labGroups.delete(familyKey);
  }
  for (const group of labGroups.values()) {
    if (group.items.length) labFamilies.push(group);
  }
  const manual = valueText(draft.objective?.manual);
  if (manual) paragraphs.push(manual);
  return { vitals, labFamilies, paragraphs };
}

function objectiveText(draft) {
  const model = objectiveModel(draft);
  const parts = [];
  if (model.vitals.length) parts.push(`**${NOTE_VITALS_GROUP_LABEL}:** ${model.vitals.map((item) => item.text).join("; ")}`);
  for (const family of model.labFamilies) {
    parts.push(`**${family.label}:** ${family.items.map((item) => item.text).join("; ")}`);
  }
  parts.push(...model.paragraphs);
  return parts.join("\n\n");
}

function checklistFindingText(draft, kind) {
  return (draft.checklistFindings?.selectedBlocks || [])
    .filter((block) => block.kind === kind)
    .map((block) => String(block.editedText || "").trim())
    .filter(Boolean)
    .map((finding) => `- ${finding}`)
    .join("\n");
}

function appendChecklistFindings(body, findings) {
  return [body, findings].filter(Boolean).join("\n\n");
}

function relevantHistoryText(sections) {
  return [
    labeledLine("Past medical history", sections.past_medical_history),
    labeledLine("Past surgical history", sections.past_surgical_history),
    labeledLine("Medications", sections.medications),
    labeledLine("Allergies", sections.allergies),
    labeledLine("Family", sections.family_history),
    labeledLine("Social", sections.social_history),
    labeledLine("Other", sections.other)
  ].filter(Boolean).join("\n\n");
}

function subjectiveText(sections) {
  return [
    labeledLine("Interval events", sections.interval_events),
    labeledLine("Patient report", sections.patient_report),
    labeledLine("Nursing report", sections.nursing_report),
    labeledLine("Pertinent symptoms", sections.pertinent_symptoms),
    labeledLine("Other", sections.other)
  ].filter(Boolean).join("\n\n");
}

function renderProblem(problem) {
  const problemName = valueText(problem.problem);
  if (!problemName) return "";
  const parts = [`**${problemName}**`];
  const keyContext = valueText(problem.keyContext);
  if (keyContext) parts.push(`**Key context:** ${keyContext}`);

  if (problem.etiologyStatus === "known") {
    const knownEtiology = valueText(problem.knownEtiology);
    if (knownEtiology) parts.push(`*Known etiology: ${knownEtiology}*`);
  } else {
    const differentials = (problem.differentials || []).filter((entry) => valueText(entry.diagnosis));
    if (differentials.length) {
      parts.push(`*Ranked differential: ${differentials.map((entry) => valueText(entry.diagnosis)).join("; ")}.*`);
      parts.push([
        "| Differential | Clues for this differential | Clues against this differential |",
        "|---|---|---|",
        ...differentials.map((entry) => `| ${markdownTableCell(valueText(entry.diagnosis))} | ${markdownTableCell(valueText(entry.cluesFor))} | ${markdownTableCell(valueText(entry.cluesAgainst))} |`)
      ].join("\n"));
    }
  }

  parts.push(...actionBullets("Diagnostic plan", problem.diagnosticPlan));
  parts.push(...actionBullets("Therapeutic plan", problem.therapeuticPlan));
  return parts.join("\n\n");
}

function planText(draft) {
  return (draft.problems || []).map(renderProblem).filter(Boolean).join("\n\n");
}

function closingSectionList(draft) {
  return [
    { heading: "FEN", body: valueText(draft.closing?.fen) },
    { heading: "VTE Prophylaxis", body: valueText(draft.closing?.vte_prophylaxis) },
    { heading: "Code Status", body: valueText(draft.closing?.code_status) },
    { heading: "Disposition", body: valueText(draft.closing?.disposition) },
    { heading: "Medication Regimens", body: valueText(draft.closing?.medication_regimens) }
  ];
}

// Shared section order for the markdown, plain-text, and rich-HTML note.
// Entries are { heading, body } with markdown bodies, except the Objective
// entry which carries { heading, objective: true } and renders from the
// structured objective model.
function finalNoteSectionList(draft) {
  const fields = draft.sections || {};
  const oneLiner = valueText(fields.one_liner);
  const front = draft.noteType === NOTE_TYPES.H_AND_P
    ? [
        { heading: "One-Liner", body: oneLiner },
        { heading: "Chief Complaint", body: valueText(fields.chief_complaint) },
        { heading: "HPI", body: dedupeOneLiner(oneLiner, valueText(fields.history_of_present_illness)) },
        { heading: "Review of Systems", body: checklistFindingText(draft, "history") },
        { heading: "Relevant History", body: relevantHistoryText(fields) },
        { heading: "Diet and Exercise", body: valueText(fields.diet_and_exercise) }
      ]
    : [
        { heading: "One-Liner", body: oneLiner },
        { heading: "Subjective", body: appendChecklistFindings(subjectiveText(fields), checklistFindingText(draft, "history")) }
      ];
  return [
    ...front,
    { heading: "Physical Exam", body: checklistFindingText(draft, "exam") },
    { heading: "Objective", objective: true },
    { heading: "Assessment", body: valueText(draft.assessment) },
    { heading: "Plan", body: planText(draft) },
    ...closingSectionList(draft)
  ];
}

function assertNoteType(draft) {
  if (!draft || ![NOTE_TYPES.H_AND_P, NOTE_TYPES.PROGRESS].includes(draft.noteType)) {
    throw new TypeError(`Unsupported note type: ${String(draft?.noteType || "(blank)")}`);
  }
}

export function renderFinalNote(draft) {
  assertNoteType(draft);
  return finalNoteSectionList(draft)
    .map(({ heading, body, objective }) => section(heading, objective ? objectiveText(draft) : body))
    .filter(Boolean)
    .join("\n\n");
}

export function renderFinalNotePlainText(draft) {
  return renderFinalNote(draft)
    .split(/\r?\n/)
    .filter((line) => !/^\|\s*-+(?:\s*\|\s*-+)+\s*\|?$/.test(line.trim()))
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("|") && trimmed.endsWith("|"))
        return trimmed.slice(1, -1).split("|").map((cell) => cell.trim().replace(/<br>/g, "; ")).join(" | ");
      return line.replace(/\*\*/g, "").replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1$2").replace(/<br>/g, "\n");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Rich-HTML note. The preview and rich-text copy render real headings,
// tables, lists, and bold/italic instead of markdown glyphs. The converter
// only handles the markdown subset this module generates; everything is
// HTML-escaped first so note content can never inject markup.
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(escaped) {
  return String(escaped)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,;:]|$)/g, "$1<em>$2</em>")
    .replace(/&lt;br&gt;/g, "<br>");
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function markdownTableToHtml(lines) {
  const rows = lines.map(splitTableRow).filter((cells) => cells.some((cell) => cell !== ""));
  if (!rows.length) return "";
  const header = rows[0];
  const body = rows.slice(1).filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));
  const headerHtml = `<thead><tr>${header.map((cell) => `<th>${inlineMarkdown(escapeHtml(cell))}</th>`).join("")}</tr></thead>`;
  const bodyHtml = body.length
    ? `<tbody>${body.map((cells) => `<tr>${cells.map((cell) => `<td>${inlineMarkdown(escapeHtml(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`
    : "";
  return `<table>${headerHtml}${bodyHtml}</table>`;
}

function markdownBodyToHtml(body) {
  const blocks = String(body || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const htmlBlocks = blocks.map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length && lines.every((line) => line.startsWith("|"))) return { list: false, html: markdownTableToHtml(lines) };
    if (lines.length && lines.every((line) => /^[-*]\s+/.test(line))) {
      return { list: true, items: lines.map((line) => `<li>${inlineMarkdown(escapeHtml(line.replace(/^[-*]\s+/, "")))}</li>`) };
    }
    if (/^\*[^*]+\*$/.test(block)) return { list: false, html: `<p><em>${escapeHtml(block.slice(1, -1))}</em></p>` };
    return { list: false, html: `<p>${inlineMarkdown(escapeHtml(block)).replace(/\r?\n/g, "<br>")}</p>` };
  });
  // Merge consecutive bullet blocks into a single list.
  const merged = [];
  for (const entry of htmlBlocks) {
    const previous = merged[merged.length - 1];
    if (entry.list && previous?.list) previous.items.push(...entry.items);
    else merged.push(entry);
  }
  return merged.map((entry) => (entry.list ? `<ul>${entry.items.join("")}</ul>` : entry.html)).join("");
}

function objectiveHtml(draft) {
  const model = objectiveModel(draft);
  const groupRow = (item, fallbackLabel) => item.edited
    ? `<tr><td colspan="2">${inlineMarkdown(escapeHtml(item.text))}</td></tr>`
    : `<tr><th scope="row">${escapeHtml(item.label || fallbackLabel)}</th><td>${inlineMarkdown(escapeHtml(item.detail || item.text))}</td></tr>`;
  const parts = [];
  if (model.vitals.length) {
    parts.push(
      `<h3>${escapeHtml(NOTE_VITALS_GROUP_LABEL)}</h3>` +
      `<table class="note-vitals"><tbody>${model.vitals.map((item) => groupRow(item, "Vital")).join("")}</tbody></table>`
    );
  }
  for (const family of model.labFamilies) {
    parts.push(
      `<h3>${escapeHtml(family.label)}</h3>` +
      `<table class="note-labs"><tbody>${family.items.map((item) => groupRow(item, "Result")).join("")}</tbody></table>`
    );
  }
  for (const paragraph of model.paragraphs) {
    parts.push(`<p>${inlineMarkdown(escapeHtml(paragraph)).replace(/\r?\n/g, "<br>")}</p>`);
  }
  return parts.join("");
}

export function renderFinalNoteHtml(draft) {
  assertNoteType(draft);
  const sections = finalNoteSectionList(draft)
    .map(({ heading, body, objective }) => {
      const bodyHtml = objective ? objectiveHtml(draft) : markdownBodyToHtml(body);
      if (!bodyHtml.trim()) return "";
      return `<section class="note-section"><h2>${escapeHtml(heading)}</h2>${bodyHtml}</section>`;
    })
    .filter(Boolean);
  return sections.length ? `<div class="rich-note">${sections.join("")}</div>` : "";
}
