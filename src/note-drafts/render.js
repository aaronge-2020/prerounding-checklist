import { NOTE_TYPES, normalizeSectionVisibility, objectiveGroupKeyFor } from "./model.js";
import {
  NOTE_LAB_FAMILY_LABELS,
  NOTE_LAB_FAMILY_ORDER,
  NOTE_VITALS_GROUP_KEY,
  NOTE_VITALS_GROUP_LABEL
} from "../review-data/compact-summary.js?v=20260924-optional-sections-v1";

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

function bulletLines(value) {
  const content = valueText(value);
  if (!content) return [];
  return content.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s+/, "")).filter(Boolean);
}

// U3: plan bullets render WITHOUT the verbose per-bullet "Diagnostic plan —"
// / "Therapeutic plan —" prefixes. When a problem has both kinds, short
// group subheads keep the dx/tx distinction without repeating it on every
// line; otherwise plain bullets.
function planBullets(problem) {
  const dx = bulletLines(problem.diagnosticPlan);
  const tx = bulletLines(problem.therapeuticPlan);
  const bullets = (lines) => lines.map((line) => `- ${line}`);
  if (dx.length && tx.length) {
    return ["**Diagnostics**", ...bullets(dx), "**Therapeutics**", ...bullets(tx)];
  }
  return [...bullets(dx), ...bullets(tx)];
}

// U9 (defense in depth): a problem title that is really a raw markdown table
// header/row from a failed A&P table parse must never render raw pipes. When a
// separator line is present the problem is the first cell of the first data
// row (never the header text); otherwise separator-only lines are dropped and
// remaining pipes become spaces.
export function sanitizeProblemTitle(name) {
  const lines = String(name || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);
  const isSeparator = (line) => /^\|?[\s:|\-]+\|?$/.test(line) && /[-:]/.test(line);
  const firstCell = (line) =>
    line.split("|").map((cell) => cell.trim()).filter((cell) => cell)[0] || "";
  if (lines.some(isSeparator)) {
    const separatorIndex = lines.findIndex(isSeparator);
    const dataTitle = lines
      .slice(separatorIndex + 1)
      .filter((line) => !isSeparator(line))
      .map(firstCell)
      .find((cell) => cell);
    if (dataTitle) return dataTitle;
    const headerTitle = lines.slice(0, separatorIndex).map(firstCell).find((cell) => cell);
    if (headerTitle) return headerTitle;
  }
  return lines
    .filter((line) => !isSeparator(line))
    .join(" ")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// U12: the copied note must not list every problem twice. When the Assessment
// section is nothing but the plan's own problem titles (bare, one per line),
// drop it from the copy — the Plan section carries the titles with content.
// Partial matches are left untouched (never mangle real assessment prose).
function assessmentWithoutDuplicateProblems(assessmentText, problems) {
  const text = String(assessmentText || "").trim();
  if (!text || !Array.isArray(problems) || !problems.length) return text;
  const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const titles = new Set(
    problems.map((problem) => normalize(sanitizeProblemTitle(valueText(problem.problem)))).filter(Boolean)
  );
  if (!titles.size) return text;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (!lines.length) return text;
  return lines.every((line) => titles.has(normalize(line))) ? "" : text;
}

// U13 (defense in depth): pulled Subjective text sometimes opens with the
// source note's header block ("PROGRESS NOTE - HD 2", "[NAME], 54F",
// "H&P - Admission Note"). Strip leading header-like lines so they never
// reach the copied note. Only the first few lines are considered.
const NOTE_HEADER_PATTERNS = [
  /^(progress|h\s*&\s*p|admission|discharge|consult|operative|clinic|ed)\b.{0,50}\bnote\b/i,
  /\badmitted\s*[[(]/i,
  /^\[?[A-Z][A-Z'.\- ]{1,}\]?,\s*\d{1,3}\s*[MF]\b/,
  /^\[.*(patient name|mrn|dob).*\]$/i
];

function stripNoteHeaderLines(text) {
  const lines = String(text || "").split(/\r?\n/);
  let index = 0;
  while (index < lines.length && index < 4) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (!NOTE_HEADER_PATTERNS.some((pattern) => pattern.test(line))) break;
    index += 1;
  }
  return lines.slice(index).join("\n").trim();
}

// U15 (defense in depth): sanitize em-dash artifacts the medication parser
// can leave around comparison operators ("phosphorus <= — 2.5 mg/dL").
function sanitizeMedicationText(text) {
  return String(text || "").replace(/([<>=!]=?)\s*—\s*/g, "$1 ");
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
// (CBC, metabolic, ...), then everything else in selection order. A
// group-level text override from the inline editor replaces that group's
// generated lines; the member blocks underneath keep their identities.
function objectiveModel(draft) {
  const items = (draft.objective?.selectedBlocks || [])
    .map((block) => ({ block, ...objectiveItem(block) }))
    .filter((entry) => entry.text);
  const groupEdits = draft.objective?.groupEdits || {};
  const overriddenGroups = new Set();
  const vitals = [];
  const labGroups = new Map();
  const medications = [];
  const pendingLabs = [];
  const paragraphs = [];
  // A group edit replaces the whole group's lines with the student's own
  // words, pushed once into whichever bucket the group renders in.
  const pushGroupOverride = (groupKey, entry) => {
    const override = String(groupEdits[groupKey] || "").trim();
    if (!override || overriddenGroups.has(groupKey)) return false;
    overriddenGroups.add(groupKey);
    const key = String(entry.block.noteGroupKey || "");
    const lines = override.split("\n").map((line) => line.trim()).filter(Boolean);
    if (key === NOTE_VITALS_GROUP_KEY) {
      for (const line of lines) vitals.push({ label: "", detail: "", text: line, edited: true });
    } else if (key === "medications") {
      for (const line of lines) medications.push({ label: "", detail: "", text: line, edited: true });
    } else if (key === "pending-labs") {
      for (const line of lines) pendingLabs.push(line);
    } else if (key.startsWith("lab:")) {
      const familyKey = key.slice(4);
      if (!labGroups.has(familyKey)) {
        labGroups.set(familyKey, {
          label: String(entry.block.noteGroupLabel || "").trim() || NOTE_LAB_FAMILY_LABELS[familyKey] || familyKey,
          items: []
        });
      }
      for (const line of lines) labGroups.get(familyKey).items.push({ label: "", detail: "", text: line, edited: true });
    } else {
      for (const line of lines) paragraphs.push(line);
    }
    return true;
  };
  for (const entry of items) {
    const key = String(entry.block.noteGroupKey || "");
    const groupKey = objectiveGroupKeyFor(entry.block);
    if (pushGroupOverride(groupKey, entry)) continue;
    if (String(groupEdits[groupKey] || "").trim()) continue; // remaining members of an overridden group
    if (key === NOTE_VITALS_GROUP_KEY && entry.text) {
      vitals.push({ label: entry.label, detail: entry.detail, text: entry.text, edited: entry.edited });
      continue;
    }
    // Medication blocks never render under Objective; they collapse into
    // their own Medications section at the very end of the final note.
    if (key === "medications" && entry.text) {
      medications.push({ label: entry.label, detail: entry.detail, text: entry.text, edited: entry.edited });
      continue;
    }
    // Pending results render as their own group at the very bottom of
    // Objective so nothing still in process is silently dropped.
    if (key === "pending-labs" && entry.text) {
      pendingLabs.push(entry.text);
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
  return { vitals, labFamilies, medications, pendingLabs, paragraphs };
}

function objectiveText(draft) {
  const model = objectiveModel(draft);
  const parts = [];
  if (model.vitals.length) parts.push(`**${NOTE_VITALS_GROUP_LABEL}:** ${model.vitals.map((item) => item.text).join("; ")}`);
  for (const family of model.labFamilies) {
    parts.push(`**${family.label}:** ${family.items.map((item) => item.text).join("; ")}`);
  }
  parts.push(...model.paragraphs);
  if (model.pendingLabs.length) parts.push(`**Pending labs:** ${model.pendingLabs.join("; ")}`);
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
  // U13: strip leaked source-note header lines from each pulled field before
  // it reaches the copied note.
  const cleanField = (value) => ({ deidentifiedText: stripNoteHeaderLines(valueText(value)) });
  return [
    labeledLine("Interval events", cleanField(sections.interval_events)),
    labeledLine("Patient report", cleanField(sections.patient_report)),
    labeledLine("Nursing report", cleanField(sections.nursing_report)),
    labeledLine("Pertinent symptoms", cleanField(sections.pertinent_symptoms)),
    labeledLine("Other", cleanField(sections.other))
  ].filter(Boolean).join("\n\n");
}

function renderProblem(problem) {
  const problemName = sanitizeProblemTitle(valueText(problem.problem));
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

  parts.push(...planBullets(problem));
  return parts.join("\n\n");
}

function planText(draft) {
  return (draft.problems || []).map(renderProblem).filter(Boolean).join("\n\n");
}

function closingSectionList(draft) {
  return [
    { heading: "FEN", body: valueText(draft.closing?.fen), visibility: "fen" },
    { heading: "Ins/Outs", body: valueText(draft.closing?.ins_outs), visibility: "ins_outs" },
    { heading: "VTE Prophylaxis", body: valueText(draft.closing?.vte_prophylaxis), visibility: "vte_prophylaxis" },
    { heading: "Code Status", body: valueText(draft.closing?.code_status), visibility: "code_status" },
    { heading: "Disposition", body: valueText(draft.closing?.disposition), visibility: "disposition" },
    { heading: "Medication Regimens", body: valueText(draft.closing?.medication_regimens), visibility: "medication_regimens" }
  ];
}

function medicationsText(draft) {
  const model = objectiveModel(draft);
  return model.medications
    .map((item) => `- **${sanitizeMedicationText(item.label) || "Medication"}**${item.detail ? ` — ${sanitizeMedicationText(item.detail)}` : item.text ? ` — ${sanitizeMedicationText(item.text)}` : ""}`)
    .join("\n");
}

function medicationsHtml(draft) {
  const model = objectiveModel(draft);
  if (!model.medications.length) return "";
  const rows = model.medications.map((item) => item.edited
    ? `<tr><td colspan="2">${inlineMarkdown(escapeHtml(item.text))}</td></tr>`
    : `<tr><th scope="row">${escapeHtml(item.label || "Medication")}</th><td>${inlineMarkdown(escapeHtml(item.detail || item.text))}</td></tr>`
  ).join("");
  return `<table class="note-medications"><tbody>${rows}</tbody></table>`;
}

// Shared section order for the markdown, plain-text, and rich-HTML note.
// Entries are { heading, body, visibility } with markdown bodies, except the
// Objective entry which carries { heading, objective: true } and the
// Medications entry which carries { heading, medications: true } and renders
// from the structured objective model. Only optional sections carry a
// visibility key: core sections always appear, and toggled-off optional
// sections are omitted.
function finalNoteSectionList(draft) {
  const fields = draft.sections || {};
  // U14: the copied one-liner must not retain the source "CC:" label.
  const oneLiner = valueText(fields.one_liner).replace(/^(cc|chief complaint)\s*:\s*/i, "");
  const front = draft.noteType === NOTE_TYPES.H_AND_P
    ? [
        { heading: "One-Liner", body: oneLiner },
        { heading: "Chief Complaint", body: valueText(fields.chief_complaint) },
        { heading: "HPI", body: dedupeOneLiner(oneLiner, valueText(fields.history_of_present_illness)) },
        { heading: "Review of Systems", body: checklistFindingText(draft, "history") },
        { heading: "Relevant History", body: relevantHistoryText(fields) },
        { heading: "Diet and Exercise", body: valueText(fields.diet_and_exercise), visibility: "diet_and_exercise" }
      ]
    : [
        { heading: "One-Liner", body: oneLiner },
        { heading: "Subjective", body: appendChecklistFindings(subjectiveText(fields), checklistFindingText(draft, "history")) }
      ];
  const visibility = normalizeSectionVisibility(draft?.sectionVisibility);
  const sections = [
    ...front,
    { heading: "Physical Exam", body: checklistFindingText(draft, "exam") },
    { heading: "Objective", objective: true },
    // U12: drop an Assessment that merely repeats the plan's problem titles.
    { heading: "Assessment", body: assessmentWithoutDuplicateProblems(valueText(draft.assessment), draft.problems) },
    { heading: "Plan", body: planText(draft) },
    ...closingSectionList(draft),
    { heading: "Medications", medications: true }
  ];
  return sections.filter((section) => section.visibility === undefined || visibility[section.visibility] !== false);
}

function assertNoteType(draft) {
  if (!draft || ![NOTE_TYPES.H_AND_P, NOTE_TYPES.PROGRESS].includes(draft.noteType)) {
    throw new TypeError(`Unsupported note type: ${String(draft?.noteType || "(blank)")}`);
  }
}

export function renderFinalNote(draft) {
  assertNoteType(draft);
  return finalNoteSectionList(draft)
    .map(({ heading, body, objective, medications }) => section(
      heading,
      objective ? objectiveText(draft) : medications ? medicationsText(draft) : body
    ))
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
    .map(({ heading, body, objective, medications }) => {
      const bodyHtml = objective ? objectiveHtml(draft) : medications ? medicationsHtml(draft) : markdownBodyToHtml(body);
      if (!bodyHtml.trim()) return "";
      return `<section class="note-section"><h2>${escapeHtml(heading)}</h2>${bodyHtml}</section>`;
    })
    .filter(Boolean);
  return sections.length ? `<div class="rich-note">${sections.join("")}</div>` : "";
}
