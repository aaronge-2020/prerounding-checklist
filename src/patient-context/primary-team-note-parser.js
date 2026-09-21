import { primaryTeamNoteFields } from "./primary-team-note.js?v=20260921-medication-card-v4";

const H_AND_P = "hp";
const PROGRESS = "progress";

const HEADING_DEFINITIONS = Object.freeze([
  heading(["one liner", "one-liner", "source summary", "brief summary"], "one_liner"),
  heading(["chief complaint", "cc", "reason for admission"], { [H_AND_P]: "chief_complaint", [PROGRESS]: "patient_report" }),
  heading(["history of present illness", "hpi"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "patient_report" }),
  heading(["stay summary", "hospital course", "brief hospital course"], {
    [H_AND_P]: "history_of_present_illness",
    [PROGRESS]: "interval_events"
  }, true),
  heading(["subjective interval history", "subjective / interval history", "interval history", "interval events", "overnight events"], {
    [H_AND_P]: "history_of_present_illness",
    [PROGRESS]: "interval_events"
  }),
  heading(["subjective", "patient report", "s"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "patient_report" }),
  heading(["nursing report"], { [H_AND_P]: "other", [PROGRESS]: "nursing_report" }),
  heading(["pertinent symptoms"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "pertinent_symptoms" }),
  heading(["review of systems", "ros"], { [H_AND_P]: "review_of_systems", [PROGRESS]: "pertinent_symptoms" }),
  heading(["medications", "meds", "medication list", "current medications", "current meds", "current rx", "home medications", "medication changes", "current facility-administered medications"], "medications"),
  heading(["allergies"], { [H_AND_P]: "allergies", [PROGRESS]: "other" }),
  heading(["past medical history", "medical history", "pmh", "pmhx"], { [H_AND_P]: "past_medical_history", [PROGRESS]: "other" }),
  heading(["past surgical history", "surgical history", "psh", "pshx"], { [H_AND_P]: "past_surgical_history", [PROGRESS]: "other" }),
  heading(["family history", "family hx", "fhx", "fh"], { [H_AND_P]: "family_history", [PROGRESS]: "other" }),
  heading(["social history", "social hx", "soc hx", "sh"], { [H_AND_P]: "social_history", [PROGRESS]: "other" }),
  heading(["diet and exercise", "diet exercise"], { [H_AND_P]: "diet_and_exercise", [PROGRESS]: "other" }),
  heading(["physical exam", "physical examination", "exam", "examination", "neurological examination", "neurologic examination"], "physical_exam"),
  heading(["objective", "objective data", "objective findings", "o"], "objective"),
  heading(["vital signs", "vitals", "intake output", "i o", "laboratory data", "laboratory results", "labs", "imaging", "diagnostic studies", "diagnostic studies review management", "diagnostic studies / review management", "diagnostic and objective findings", "objective diagnostic studies", "objective / diagnostic studies", "results"], "objective", true),
  heading(["assessment", "impression", "a"], "assessment"),
  heading(["assessment and plan", "assessment / plan", "a and p", "a p", "ap", "impression and plan", "plan", "p"], "plan"),
  heading(["fen", "fluids electrolytes nutrition"], "fen"),
  heading(["vte prophylaxis", "dvt prophylaxis", "venous thromboembolism prophylaxis"], "vte_prophylaxis"),
  heading(["code status"], "code_status"),
  heading(["disposition", "dispo", "discharge planning", "education discharge planning and follow up"], "disposition"),
  heading(["lda", "lines drains airways", "lines drains and airways"], "plan", true),
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

function configuredFieldFor(definition, noteType) {
  return typeof definition.field === "string" ? definition.field : definition.field[noteType];
}

function fieldFor(definition, noteType, availableFields) {
  const candidate = configuredFieldFor(definition, noteType);
  return availableFields.has(candidate) ? candidate : availableFields.has("other") ? "other" : "";
}

function definitionFor(candidate) {
  const normalized = normalizeHeading(candidate);
  if (!normalized) return null;
  return HEADING_DEFINITIONS.find((definition) => definition.aliases.includes(normalized)) || null;
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
  return fields.some((field) => ["code_status", "disposition", "fen", "vte_prophylaxis", "plan"].includes(field));
}

function headingMatch(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  const bulletMatch = trimmed.match(/^[-•>]\s*(.+)$/);
  const headingText = bulletMatch ? bulletMatch[1] : trimmed;

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

export function parsePrimaryTeamNote(sourceText, noteType) {
  const source = normalizedSource(sourceText);
  const fields = primaryTeamNoteFields(noteType);
  const availableFields = new Set(fields.map(({ id }) => id));
  const fallbackField = availableFields.has("other") ? "other" : fields[0]?.id || "";
  const blocks = new Map();
  const detected = [];
  let activeField = fallbackField;
  let activeLines = [];
  let insideImagingBlock = false;

  const flush = () => {
    appendBlock(blocks, activeField, compactBlock(activeLines));
    activeLines = [];
  };

  for (const line of source.split("\n")) {
    const match = headingMatch(line);
    if (!match) {
      activeLines.push(line);
      continue;
    }

    const priorField = activeField;
    flush();
    if (match.prefixText) appendBlock(blocks, fallbackField, match.prefixText);
    const normalizedMatchHeading = normalizeHeading(match.heading);
    const imagingSubheading = insideImagingBlock && ["exam", "examination", "impression"].includes(normalizedMatchHeading);
    activeField = imagingSubheading
      ? "objective"
      : match.definition.stayWithPlan && priorField === "plan"
        ? priorField
        : fieldFor(match.definition, noteType, availableFields) || fallbackField;
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

  const sections = Object.fromEntries(fields.map(({ id }) => [id, (blocks.get(id) || []).join("\n\n").trim()]));
  const detectedFieldIds = [...new Set(detected.map(({ fieldId }) => fieldId).filter((fieldId) => sections[fieldId]))];
  return {
    recognized: detectedFieldIds.length > 0,
    rawCharacterCount: source.length,
    sourceCharacterCount: source.length,
    parsedCharacterCount: Object.values(sections).reduce((total, value) => total + value.length, 0),
    sections,
    detected,
    detectedFieldIds,
    detectedSectionCount: detectedFieldIds.length,
    matchedHeadingCount: detected.length,
    unmatchedText: sections.other || ""
  };
}
