import { primaryTeamNoteFields } from "./primary-team-note.js?v=20260921-medication-card-v4";
import { transformClinicalTablesInText } from "./clinical-table-parser.js";
import {
  NON_PROBLEM_LABEL,
  normalizeTwoColumnEhrText,
  parseClinicalPlanProblems,
  splitTwoColumnEhrTables,
  extractNumberedPlanItems,
  isBareActionItem,
  stripSignoffParagraphs
} from "./clinical-plan-parser.js?v=20260925-plan-rows-v1";

const H_AND_P = "hp";
const PROGRESS = "progress";

const HEADING_DEFINITIONS = Object.freeze([
  heading(["one liner", "one-liner", "source summary", "brief summary"], "one_liner"),
  heading(["chief complaint", "cc", "reason for admission", "reason for consultation", "reason for the consult", "reason for consult", "chief concern", "presenting complaint", "reason for visit", "reason for encounter"], { [H_AND_P]: "chief_complaint", [PROGRESS]: "patient_report" }),
  heading(["history of present illness", "hpi", "history", "presenting history", "present illness", "history and physical"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "patient_report" }),
  heading(["stay summary", "hospital course", "brief hospital course", "hospital course per problem list", "hospital course by problem"], {
    [H_AND_P]: "history_of_present_illness",
    [PROGRESS]: "interval_events"
  }, true),
  heading(["subjective interval history", "subjective / interval history", "interval history", "interval events", "overnight events"], {
    [H_AND_P]: "history_of_present_illness",
    [PROGRESS]: "interval_events"
  }),
  heading(["subjective", "patient report", "patient reports", "s"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "patient_report" }),
  heading(["nursing report"], { [H_AND_P]: "other", [PROGRESS]: "nursing_report" }),
  heading(["pertinent symptoms"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "pertinent_symptoms" }),
  heading(["review of systems", "ros", "systems review"], { [H_AND_P]: "review_of_systems", [PROGRESS]: "pertinent_symptoms" }),
  heading(["medications", "meds", "medication list", "current medications", "current meds", "current rx", "home medications", "home meds", "med list", "prescriptions", "medication changes", "discharge medications", "discharge meds", "current facility-administered medications"], "medications"),
  heading(["allergies", "allergy", "nkda"], { [H_AND_P]: "allergies", [PROGRESS]: "other" }),
  heading(["past medical history", "medical history", "pmh", "pmhx", "past history"], { [H_AND_P]: "past_medical_history", [PROGRESS]: "other" }),
  heading(["past surgical history", "surgical history", "psh", "pshx"], { [H_AND_P]: "past_surgical_history", [PROGRESS]: "other" }),
  heading(["family history", "family hx", "fhx", "fh"], { [H_AND_P]: "family_history", [PROGRESS]: "other" }),
  // Combined "FAMILY, SOCIAL, AND ALLERGY HISTORY" cannot be split back into
  // its parts structurally, so it stays out of the individual fields.
  heading(["family social and allergy history"], { [H_AND_P]: "other", [PROGRESS]: "other" }),
  heading(["social history", "social hx", "soc hx", "sh", "social", "habits"], { [H_AND_P]: "social_history", [PROGRESS]: "other" }),
  heading(["diet and exercise", "diet exercise"], { [H_AND_P]: "diet_and_exercise", [PROGRESS]: "other" }),
  heading(["physical exam", "physical examination", "exam", "examination", "pe", "exam findings", "neurological examination", "neurologic examination"], "physical_exam"),
  heading(["objective", "objective data", "objective findings", "o"], "objective"),
  heading([
    "vital signs", "vitals", "encounter vitals stats", "encounter vitals stats last 24 hours",
    "encounter vitals", "vitals stats", "vital signs stats", "encounter vitals summary",
    "intake output", "i o", "ins and outs", "i/o", "laboratory data", "laboratory results", "laboratory", "labs", "labs reviewed",
    "labs/imaging", "lab/imaging", "labs and imaging", "labs & imaging", "lab data",
    "studies", "study results", "studies reviewed", "test results", "results review", "data review",
    "imaging", "x ray", "xray", "xr", "electrocardiogram", "diagnostic studies", "diagnostic studies review management",
    "diagnostic studies / review management", "diagnostic and objective findings",
    "objective diagnostic studies", "objective / diagnostic studies", "results", "data", "radiology"
  ], "objective", true),
  heading(["assessment", "impression", "clinical impression", "a"], "assessment"),
  heading(["assessment and plan", "assessment / plan", "a and p", "a p", "ap", "impression and plan", "plan", "p", "plans", "plan by system", "systems plan", "recommendations", "recs", "treatment", "treatments", "next steps"], "plan"),
  heading(["discharge instructions", "discharge instruction"], "plan"),
  heading(["discharge diagnosis", "discharge diagnoses", "additional discharge diagnoses", "discharge dx"], "assessment", true, true),
  heading(["fen", "fluids electrolytes nutrition"], "fen"),
  heading([
    "lda", "ldas", "lines drains airways", "lines drains and airways",
    "lines drains airways status", "lines drains and airways status",
    "patient lines drains airways status", "patient lines drains and airways status",
    "active active ldas selected", "active ldas selected", "active active ldas", "active ldas", "active lda"
  ], "lda", true),
  heading(["vte prophylaxis", "dvt prophylaxis", "venous thromboembolism prophylaxis", "prophylaxis"], "vte_prophylaxis"),
  heading(["code status"], "code_status"),
  heading(["disposition", "dispo", "discharge planning", "discharge disposition", "condition on discharge", "condition at discharge", "discharge condition", "education discharge planning and follow up"], "disposition"),
  heading(["principal problem", "active problems", "resolved problems", "active hospital problems"], "assessment", true, true),
  heading(["basic information", "premorbid mrs"], {
    [H_AND_P]: "other",
    [PROGRESS]: "other"
  }, true)
]);

function heading(aliases, field, preserveHeading = false, stayWithPlan = false) {
  return Object.freeze({ aliases: Object.freeze(aliases.map(normalizeHeading)), field, preserveHeading, stayWithPlan });
}

function normalizeHeading(value) {
  return String(value || "").normalize("NFKC")
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    // Numbered section headers: "1. Chief Complaint" -> "Chief Complaint"
    .replace(/^\d{1,2}[.)]\s*/, "")
    // Dash-wrapped headers: "--- Chief Complaint ---" -> "Chief Complaint"
    .replace(/^[-—–]+\s*/, "")
    .replace(/\s*[-—–]+$/, "")
    // Parenthetical qualifiers: "Vitals (per patient home cuff)" -> "Vitals"
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[\\:;,.\s]+$/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedSource(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

// Note-header chrome ("Date: 09/20/2026 Author: J. Smith, MD Pager: 1234")
// is metadata, not clinical content: drop it before it lands in
// Subjective/Other. Kept narrow on purpose: "Room:"/"Treatment Team:" lines
// are asserted to survive in Other by the tabbed-metadata test.
const NOTE_HEADER_METADATA = /^(?:date|author(?:ed by)?|pager|mrn|dob|dictated by|transcribed by|electronically signed(?: by)?)\s*:/i;

// Chief-complaint labels stripped from one-liner synthesis.
const CC_LABEL = /^(?:chief complaint|cc|reason for admission)\s*[:—–-]\s*/i;

// One-liner synthesis from source text only: strip CC/chief-complaint labels
// and prefer the first substantive sentence. "CC: chest pain. Patient
// reports 3 days of pressure-like chest pain." yields the patient-report
// sentence, never "CC: chest pain." A bare complaint fragment with nothing
// after it ("Shortness of breath") is the honest fallback. No demographics,
// diagnoses, or chronology are ever invented.
export function extractSubstantiveOneLiner(text) {
  if (!text || typeof text !== "string") return "";
  const narrative = text.trim().replace(CC_LABEL, "");
  if (!narrative) return "";
  const first = extractFirstSentence(narrative);
  if (!first) return "";
  const rest = narrative.slice(narrative.indexOf(first) + first.length).trim().replace(/^[:—–-]\s*/, "");
  const firstCore = first.replace(/[.\s]+$/, "");
  if (firstCore.length <= 24 && rest) {
    const next = extractFirstSentence(rest);
    if (next && next.replace(/[.\s]+$/, "").length > firstCore.length) return next;
  }
  return first;
}

function configuredFieldFor(definition, noteType) {
  return typeof definition.field === "string" ? definition.field : definition.field[noteType];
}

function fieldFor(definition, noteType, availableFields) {
  const candidate = configuredFieldFor(definition, noteType);
  return availableFields.has(candidate) ? candidate : availableFields.has("other") ? "other" : "";
}

const TEAM_PLAN_DEFINITION = heading([], "plan", true);

// Headings that combine assessment reasoning and plan actions in one
// section. When one of these is used and there is no separate Assessment
// section, the assessment reasoning is split back out of the parsed
// problems so sections.assessment is not left empty.
const COMBINED_ASSESSMENT_PLAN_ALIASES = new Set([
  "assessment and plan",
  "assessment / plan",
  "a and p",
  "a p",
  "ap",
  "impression and plan"
]);

function assessmentItemTitle(text) {
  const clean = String(text || "").trim();
  const firstLine = clean.split("\n").map((line) => line.trim()).filter(Boolean)[0] || "";
  const sentence = (firstLine.match(/^[^.!?]+[.!?]/)?.[0] || firstLine).trim();
  if (sentence.length <= 100 && clean.length > sentence.length) return sentence;
  return firstLine;
}

// True when a plan item carries its own problem title ("Diabetes mellitus
// type 1: ..."). Used for the single-assessment case, where a colon title is
// the reliable signal that the plan item is a problem rather than an action
// on the assessment.
function planItemHasProblemTitle(itemText) {
  const text = String(itemText || "").trim();
  const colon = text.match(/^([^:]{3,60}):\s*\S/);
  return !!(colon && !NON_PROBLEM_LABEL.test(colon[1].trim()));
}

function makePairedProblem(assessmentItemText, planItemText) {
  const assessment = String(assessmentItemText || "").trim();
  const plan = String(planItemText || "").trim();
  const title = assessmentItemTitle(assessment) || "Assessment";
  return {
    id: `problem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    system: "",
    title,
    problem: title,
    keyContext: assessment,
    differentials: [],
    diagnosticPlan: "",
    therapeuticPlan: plan
  };
}

// Consult notes often number the assessment ("IMPRESSION:\n1. Septic
// shock...") and separately number the recommendations ("RECOMMENDATIONS:\n1.
// Continue with vancomycin..."). The plan parser sees only bare actions with
// no problem titles; pair them back to the assessment items by index so each
// recommendation lands on its problem instead of becoming a bogus problem of
// its own. A single assessment paragraph with a single plan paragraph pairs
// the same way. Anything else keeps the plan's own parse.
function pairAssessmentPlanProblems(assessmentText, planText, parsedProblems) {
  const assessment = String(assessmentText || "").trim();
  const plan = stripSignoffParagraphs(planText).trim();
  if (!assessment || !plan) return parsedProblems;

  const assessmentItems = extractNumberedPlanItems(assessment);
  const planItems = extractNumberedPlanItems(plan);

  if (assessmentItems.length > 0 && planItems.length > 0) {
    // Only pair when the plan items are bare actions. When they carry their
    // own problem titles ("1. Diabetes mellitus type 1: ...") the plan's own
    // parse is the honest problem list.
    if (planItems.every((item) => isBareActionItem(item.text))) {
      const paired = [];
      const count = Math.min(assessmentItems.length, planItems.length);
      for (let i = 0; i < count; i++) {
        paired.push(makePairedProblem(assessmentItems[i].text, planItems[i].text));
      }
      // Extra assessment items still become problems, just without a plan.
      for (let i = count; i < assessmentItems.length; i++) {
        paired.push(makePairedProblem(assessmentItems[i].text, ""));
      }
      // Extra plan actions (more actions than problems) join the last problem
      // rather than becoming problems of their own.
      for (let i = count; i < planItems.length; i++) {
        const last = paired[paired.length - 1];
        if (last) last.therapeuticPlan = [last.therapeuticPlan, planItems[i].text].filter(Boolean).join("\n");
      }
      return paired;
    }
    // The plan carries its own problem titles: keep the plan's parse, but
    // preserve assessment items the plan never addresses.
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const planTitles = parsedProblems.map((p) => norm(p.title || p.problem));
    const extra = [];
    for (const item of assessmentItems) {
      const title = norm(assessmentItemTitle(item.text)).slice(0, 60);
      if (!title) continue;
      const covered = planTitles.some(
        (pt) => (pt && title && (pt.includes(title.slice(0, 30)) || title.includes(pt.slice(0, 30))))
      );
      if (!covered) extra.push(makePairedProblem(item.text, ""));
    }
    return [...parsedProblems, ...extra];
  }

  if (assessmentItems.length === 0 && planItems.length === 0) {
    return [makePairedProblem(assessment, plan)];
  }

  // Single assessment paragraph ("Right ankle sprain.") with a numbered
  // plan: one problem carrying all the plan items, unless the plan items
  // carry their own problem titles.
  if (
    assessmentItems.length === 0 &&
    planItems.length > 0 &&
    !planItems.some((item) => planItemHasProblemTitle(item.text))
  ) {
    return [makePairedProblem(assessment, planItems.map((item) => item.text).join("\n"))];
  }

  return parsedProblems;
}

function definitionFor(candidate) {
  const normalized = normalizeHeading(candidate);
  if (!normalized) return null;
  const match = HEADING_DEFINITIONS.find((definition) => definition.aliases.includes(normalized));
  if (match) return match;
  if (/^[a-z0-9\s/]+(?:team\s+)?plan$/i.test(normalized) && !normalized.includes("discharge")) {
    return TEAM_PLAN_DEFINITION;
  }
  return null;
}

function delimiterStartBefore(line, index) {
  const prefix = line.slice(0, index);
  const tab = prefix.lastIndexOf("\t");
  let whitespace = -1;
  for (const match of prefix.matchAll(/\s{2,}/g)) whitespace = match.index + match[0].length - 1;
  return Math.max(tab, whitespace) + 1;
}

function permitsBulletHeading(definition) {
  const fields = typeof definition.field === "string" ? [definition.field] : Object.values(definition.field);
  return fields.some((field) => ["code_status", "disposition", "fen", "vte_prophylaxis", "plan", "lda"].includes(field));
}

// A data-header line that explicitly reports no data ("Vitals: Not obtained
// during this encounter.") is a finding, not a section boundary. Letting it
// open a new objective block would swallow the rest of the physical exam into
// the wrong section, so the line stays where it is.
const NO_DATA_INLINE = /^(?:not\s+(?:obtained|done|recorded|available|documented|assessed|performed)|none|n\/?a|unknown|deferred|not\s+applicable)\b/i;

function isNoDataHeader(match) {
  if (!match?.inlineText) return false;
  const fields = typeof match.definition.field === "string" ? [match.definition.field] : Object.values(match.definition.field);
  return fields.includes("objective") && NO_DATA_INLINE.test(match.inlineText.trim());
}

function headingMatch(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  // Dash-wrapped headers: "--- Chief Complaint ---" is a heading, not a bullet.
  const dashWrapped = trimmed.match(/^[-—–]{2,}\s*(.+?)\s*[-—–]{2,}$/);
  const bulletMatch = dashWrapped ? null : trimmed.match(/^[-•>]\s*(.+)$/);
  const headingText = dashWrapped ? dashWrapped[1] : bulletMatch ? bulletMatch[1] : trimmed;

  const exact = headingText.length <= 180 ? definitionFor(headingText) : null;
  if (exact && (!bulletMatch || permitsBulletHeading(exact))) {
    return { definition: exact, heading: headingText.replace(/[\\:;,.\s]+$/g, ""), inlineText: "", prefixText: "" };
  }

  for (let colon = headingText.indexOf(":"); colon >= 0; colon = headingText.indexOf(":", colon + 1)) {
    const start = delimiterStartBefore(headingText, colon);
    const candidate = headingText.slice(start, colon);
    if (candidate.length > 80) continue;
    const definition = definitionFor(candidate);
    if (!definition) continue;
    if (bulletMatch && !permitsBulletHeading(definition)) continue;
    return {
      definition,
      heading: candidate.trim(),
      inlineText: headingText.slice(colon + 1).replace(/^\s*(?:[\\]+|\*\*)\s*/, "").trim(),
      prefixText: headingText.slice(0, start).trim()
    };
  }
  if (bulletMatch) return null;
  const dashMatch = headingText.match(/^(.{1,64}?)\s+[—–-]\s+(.+)$/);
  if (dashMatch) {
    const definition = definitionFor(dashMatch[1]);
    if (definition) {
      return { definition, heading: dashMatch[1].trim(), inlineText: dashMatch[2].trim(), prefixText: "" };
    }
  }
  return null;
}

function appendBlock(blocks, fieldId, value) {
  const cleaned = String(value || "").replace(/^\n+|\n+$/g, "");
  if (!cleaned) return;
  if (!blocks.has(fieldId)) blocks.set(fieldId, []);
  blocks.get(fieldId).push(cleaned);
}

function compactBlock(lines) {
  return lines.join("\n").replace(/^\n+|\n+$/g, "");
}

const ABBREVIATIONS = new Set([
  "yo", "y.o", "mo", "m.o", "wo", "w.o",
  "dr", "mr", "mrs", "ms", "prof",
  "md", "m.d", "do", "d.o", "rn", "r.n", "np", "n.p", "pa", "p.a",
  "vs", "approx", "pt", "hx", "fx", "dx", "rx", "sx", "tx",
  "st", "jr", "sr", "dept", "no", "vol", "gen"
]);

const INCOMPLETE_LINE_ENDINGS = new Set([
  "and", "or", "but", "with", "w/", "without", "w/o", "for", "to", "in", "on", "at",
  "from", "by", "of", "into", "as", "is", "was", "are", "were", "has", "had", "have",
  "been", "be", "who", "which", "that", "s/p", "completed", "severe", "mild", "moderate"
]);

const NEW_SENTENCE_STARTERS = new Set([
  "patient", "pt", "he", "she", "they", "last", "onset", "pain", "reports", "denies",
  "complains", "presented", "admitted", "hospital", "stay", "events", "yesterday",
  "today", "prior", "initial", "no", "also", "furthermore", "however"
]);

function isAbbreviation(word) {
  if (!word) return false;
  const clean = word.toLowerCase().replace(/^[([{"']+/, "").replace(/[)\]}"']+$/, "");
  if (ABBREVIATIONS.has(clean)) return true;
  if (/^[a-z]\.?$/i.test(clean)) return true;
  if (/^(?:[a-z]\.)+[a-z]?$/i.test(clean)) return true;
  return false;
}

function findSentenceEnd(text) {
  const regex = /([.!?]+)(?=\s|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const punct = match[1];
    const punctIndex = match.index + punct.length;
    const beforePunct = text.slice(0, match.index).trim();
    const afterPunct = text.slice(punctIndex);

    if (punct.includes("!") || punct.includes("?")) {
      return punctIndex;
    }

    if (/\d$/.test(beforePunct)) {
      continue;
    }

    const lastWordMatch = beforePunct.match(/([a-zA-Z0-9./-]+)$/);
    const lastWord = lastWordMatch ? lastWordMatch[1] : "";

    if (isAbbreviation(lastWord)) {
      continue;
    }

    const nextCharMatch = afterPunct.match(/^\s*([^\s])/);
    if (nextCharMatch) {
      const nextChar = nextCharMatch[1];
      if (/[a-z]/.test(nextChar)) {
        continue;
      }
    }

    return punctIndex;
  }
  return -1;
}

export function extractFirstSentence(text) {
  if (!text || typeof text !== "string") return "";

  let narrative = text.trim();

  const hpiMatch = narrative.match(/(?:^|\n)\s*(?:hpi|history of present illness)\s*[:—–-]\s*([\s\S]+)$/i);
  if (hpiMatch) {
    narrative = hpiMatch[1].trim();
  } else {
    narrative = narrative.replace(/^[-*•>]\s*/, "");
    // Section labels are stripped only when followed by a colon/dash
    // delimiter (or end of text). Without the delimiter guard, a sentence
    // like "Patient reports 3 days of pain." loses its subject.
    narrative = narrative.replace(/^(?:subjective(?:\s*\/\s*interval history)?|patient report|hpi|history of present illness)(?:\s*[:—–-]\s*|\s*$)/i, "");
  }

  if (!narrative.trim()) return "";

  const lines = narrative.split(/\r?\n/);
  const collected = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      if (collected.length > 0) break;
      continue;
    }
    if (collected.length > 0 && (/^[-*•>]/.test(line) || /^(?:[A-Z][a-zA-Z\s/]{1,30}:|\[Hospital Day|\d{1,2}\/\d{1,2})/.test(line))) {
      break;
    }

    if (collected.length > 0) {
      const prevLine = collected[collected.length - 1];
      const prevEnd = findSentenceEnd(prevLine);
      if (prevEnd !== -1) {
        break;
      }
      const prevLastWord = prevLine.split(/\s+/).pop()?.toLowerCase() || "";
      const currentFirstWord = line.split(/\s+/)[0]?.toLowerCase() || "";
      if (!INCOMPLETE_LINE_ENDINGS.has(prevLastWord) && NEW_SENTENCE_STARTERS.has(currentFirstWord)) {
        break;
      }
    }

    collected.push(line);
    const currentText = collected.join(" ");

    const sentenceEnd = findSentenceEnd(currentText);
    if (sentenceEnd !== -1) {
      return currentText.slice(0, sentenceEnd).replace(/^[-*•>]\s*/, "").trim();
    }
  }

  const result = collected.join(" ").trim();
  const end = findSentenceEnd(result);
  const candidate = (end !== -1 ? result.slice(0, end) : result).trim();
  return candidate.replace(/^[-*•>]\s*/, "").trim();
}

export function parsePrimaryTeamNote(sourceText, noteType) {
  const rawSource = normalizedSource(sourceText);
  const preprocessed = normalizeTwoColumnEhrText(sourceText);
  const source = normalizedSource(preprocessed);
  const fields = primaryTeamNoteFields(noteType);
  const availableFields = new Set(fields.map(({ id }) => id));
  const fallbackField = availableFields.has("other") ? "other" : fields[0]?.id || "";
  const blocks = new Map();
  const detected = [];
  let activeField = fallbackField;
  let activeLines = [];
  let insideImagingBlock = false;
  let combinedPlanHeading = false;

  const flush = () => {
    appendBlock(blocks, activeField, compactBlock(activeLines));
    activeLines = [];
  };

  for (const line of source.split("\n")) {
    // Setext/markdown underline rows ("===", "~~~") are formatting, not content.
    // ("---" alone is not skipped: it may wrap a header like "--- Chief Complaint ---".)
    if (/^[=~]{3,}\s*$/.test(line.trim())) continue;
    // Note-header metadata before the first recognized heading is chart
    // chrome ("Date: 09/20/2026 Author: J. Smith, MD Pager: 1234"), never
    // Subjective/Other content.
    if (activeField === fallbackField && NOTE_HEADER_METADATA.test(line.trim())) continue;
    // Inside an Assessment/Plan section, "#..." lines are problem entries for
    // parseClinicalPlanProblems, not markdown headings. Without this guard a
    // line like "#DVT prophylaxis" is stolen as a VTE-prophylaxis section
    // heading and everything after it is swallowed into the wrong field.
    const inPlanSection = activeField === "plan";
    const rawMatch = inPlanSection && /^#/.test(line.trim()) ? null : headingMatch(line);
    const match = rawMatch && isNoDataHeader(rawMatch) ? null : rawMatch;
    if (!match) {
      activeLines.push(line);
      continue;
    }

    const priorField = activeField;
    flush();
    if (match.prefixText) appendBlock(blocks, fallbackField, match.prefixText);
    const normalizedMatchHeading = normalizeHeading(match.heading);
    const imagingSubheading = insideImagingBlock && ["exam", "examination", "impression"].includes(normalizedMatchHeading);
    // "Vitals:" at the start of a Physical Exam belongs to the exam, not a
    // new Objective section. Without this guard the exam section ends up
    // empty and vitals are orphaned into objective.
    const vitalsInExam = priorField === "physical_exam"
      && ["vital signs", "vitals"].includes(normalizedMatchHeading);
    activeField = imagingSubheading
      ? "objective"
      : vitalsInExam
        ? priorField
        : match.definition.stayWithPlan && priorField === "plan"
          ? priorField
          : fieldFor(match.definition, noteType, availableFields) || fallbackField;
    if (activeField === "plan" && COMBINED_ASSESSMENT_PLAN_ALIASES.has(normalizeHeading(match.heading))) {
      combinedPlanHeading = true;
    }
    detected.push({ fieldId: activeField, heading: match.heading });
    const preserveFallbackHeading = activeField === fallbackField;
    const preserveCombinedPatientHeading = noteType === PROGRESS
      && activeField === "patient_report"
      && ["chief complaint", "cc", "reason for admission", "history of present illness", "hpi"].includes(normalizedMatchHeading);
    if (match.definition.preserveHeading || preserveFallbackHeading || preserveCombinedPatientHeading || imagingSubheading) {
      activeLines.push(match.inlineText ? `${match.heading}: ${match.inlineText}` : match.heading);
    } else if (match.inlineText) {
      activeLines.push(match.inlineText);
    }
    insideImagingBlock = imagingSubheading || [
      "imaging",
      "diagnostic studies",
      "diagnostic studies review management",
      "diagnostic studies / review management"
    ].includes(normalizedMatchHeading);
  }
  flush();

  const transformedSections = {};
  const detectedTables = [];
  for (const { id } of fields) {
    const raw = (blocks.get(id) || []).join("\n\n").trim();
    const { text: transformed, detectedTables: tables } = transformClinicalTablesInText(raw);
    transformedSections[id] = transformed;
    if (tables?.length) {
      detectedTables.push(...tables.map((table) => ({ ...table, fieldId: id })));
    }
  }

  if (!transformedSections.one_liner) {
    let candidateText = "";
    if (noteType === H_AND_P) {
      candidateText = transformedSections.history_of_present_illness || "";
    } else {
      const patientReport = transformedSections.patient_report || "";
      const intervalEvents = transformedSections.interval_events || "";
      // A leading "CC:"/"Chief Complaint:" label is not one-liner content:
      // strip it and prefer the substantive remainder of the patient report
      // over interval events.
      const reportBody = patientReport.replace(CC_LABEL, "").trim();
      if (/(?:^|\n)\s*(?:hpi|history of present illness)\s*[:—–-]/i.test(patientReport)) {
        candidateText = patientReport;
      } else if (reportBody) {
        candidateText = reportBody;
      } else if (intervalEvents) {
        candidateText = intervalEvents;
      } else {
        candidateText = patientReport;
      }
    }
    if (candidateText) {
      const extracted = extractSubstantiveOneLiner(candidateText);
      if (extracted) {
        transformedSections.one_liner = extracted;
        if (!detected.some((d) => d.fieldId === "one_liner")) {
          detected.unshift({ fieldId: "one_liner", heading: "One-liner" });
        }
      }
    }
  }
  const detectedFieldIds = [...new Set(detected.map(({ fieldId }) => fieldId).filter((fieldId) => transformedSections[fieldId]))];
  const planProblems = parseClinicalPlanProblems(transformedSections.plan || "");
  const parsedProblems = pairAssessmentPlanProblems(transformedSections.assessment, transformedSections.plan, planProblems);
  // A combined "Assessment and Plan" heading parks all reasoning in the plan
  // section. The synthesis paragraph(s) at the top — before the first
  // problem list, system section, or #problem — are the assessment narrative.
  // Extract them so sections.assessment reflects the synthesis while
  // sections.plan keeps the full problem-oriented text and its actions.
  // If there is no synthesis (the section starts directly with problems),
  // fall back to listing the problem titles so the assessment is not empty.
  // Structured EHR problem lists (fromProblemList) are excluded from the
  // fallback: their billing-coded titles are problem entries, not assessment
  // reasoning.
  if (combinedPlanHeading && !String(transformedSections.assessment || "").trim()) {
    const planText = String(transformedSections.plan || "");
    const problemListHeaders = new Set([
      "active hospital problems", "active problems", "hospital problems",
      "principal problems", "principal problem", "problem list", "problems",
      "diagnosis", "diagnoses"
    ]);
    const lines = planText.split(/\r?\n/);
    let splitIndex = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const lower = trimmed.toLowerCase().replace(/[:\s]+$/, "");
      // Problem list header, #problem line, or numbered problem marks the
      // end of the synthesis and the start of problem-oriented content.
      if (problemListHeaders.has(lower) || /^#\s*[a-zA-Z0-9]/.test(trimmed) ||
          /^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*[a-zA-Z]/i.test(trimmed)) {
        splitIndex = i;
        break;
      }
    }
    const synthesis = lines.slice(0, splitIndex).join("\n").trim();
    // Only use the synthesis if it's substantive (not just a heading remnant).
    // It should contain sentence-like content, not just a single short label.
    if (synthesis && /[.!?]/.test(synthesis) && synthesis.length > 40) {
      transformedSections.assessment = synthesis;
    } else if (parsedProblems.length > 0) {
      // Fallback: no synthesis paragraph; list the problem titles so the
      // assessment is not empty. Excludes structured problem-list entries.
      const assessmentParts = [];
      for (const problem of parsedProblems) {
        if (problem.fromProblemList) continue;
        const title = String(problem.problem || problem.title || "").trim();
        const linesOut = [];
        if (title) linesOut.push(title);
        const context = String(problem.keyContext || "").trim();
        if (context) linesOut.push(context);
        const differentials = (problem.differentials || [])
          .map((entry) => String(entry.diagnosis || "").trim())
          .filter(Boolean);
        if (differentials.length) linesOut.push(`Ranked differential: ${differentials.join("; ")}.`);
        if (linesOut.length) assessmentParts.push(linesOut.join("\n"));
      }
      if (assessmentParts.length) transformedSections.assessment = assessmentParts.join("\n\n");
    }
  }
  return {
    recognized: detectedFieldIds.length > 0,
    rawCharacterCount: rawSource.length,
    sourceCharacterCount: rawSource.length,
    parsedCharacterCount: Object.values(transformedSections).reduce((total, value) => total + value.length, 0),
    sections: transformedSections,
    parsedProblems,
    detected,
    detectedTables,
    detectedFieldIds,
    detectedSectionCount: detectedFieldIds.length,
    matchedHeadingCount: detected.length,
    unmatchedText: transformedSections.other || ""
  };
}

export {
  normalizeTwoColumnEhrText,
  parseClinicalPlanProblems,
  splitTwoColumnEhrTables
};
