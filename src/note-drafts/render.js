import { NOTE_TYPES } from "./model.js";

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

function objectiveText(draft) {
  const selected = (draft.objective?.selectedBlocks || []).map((block) => String(block.editedText || "").trim()).filter(Boolean);
  const manual = valueText(draft.objective?.manual);
  return [...selected, ...(manual ? [manual] : [])].join("\n\n");
}

function checklistFindingText(draft, kind) {
  return (draft.checklistFindings?.selectedBlocks || [])
    .filter((block) => block.kind === kind)
    .map((block) => String(block.editedText || "").trim())
    .filter(Boolean)
    .map((finding) => `- ${finding}`)
    .join("\n");
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

function closingSections(draft) {
  return [
    section("FEN", valueText(draft.closing?.fen)),
    section("VTE Prophylaxis", valueText(draft.closing?.vte_prophylaxis)),
    section("Code Status", valueText(draft.closing?.code_status)),
    section("Disposition", valueText(draft.closing?.disposition)),
    section("Medication Regimens", valueText(draft.closing?.medication_regimens))
  ].filter(Boolean);
}

export function renderFinalNote(draft) {
  if (!draft || ![NOTE_TYPES.H_AND_P, NOTE_TYPES.PROGRESS].includes(draft.noteType)) {
    throw new TypeError(`Unsupported note type: ${String(draft?.noteType || "(blank)")}`);
  }
  const fields = draft.sections || {};
  const parts = draft.noteType === NOTE_TYPES.H_AND_P
    ? [
        section("One-Liner", valueText(fields.one_liner)),
        section("Chief Complaint", valueText(fields.chief_complaint)),
        section("HPI", valueText(fields.history_of_present_illness)),
        section("Relevant History", relevantHistoryText(fields)),
        section("Diet and Exercise", valueText(fields.diet_and_exercise)),
        section("History / Review of Systems from Checklist", checklistFindingText(draft, "history"))
      ]
    : [
        section("One-Liner", valueText(fields.one_liner)),
        section("Subjective", subjectiveText(fields)),
        section("Focused History from Checklist", checklistFindingText(draft, "history"))
      ];

  parts.push(
    section("Physical Exam", checklistFindingText(draft, "exam")),
    section("Objective", objectiveText(draft)),
    section("Assessment", valueText(draft.assessment)),
    section("Plan", planText(draft)),
    ...closingSections(draft)
  );
  return parts.filter(Boolean).join("\n\n");
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
