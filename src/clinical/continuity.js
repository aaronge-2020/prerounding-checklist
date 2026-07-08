import { parseLabTimeline } from "./labs.js";

export const CONTINUITY_STORAGE_KEY = "preRoundPatientCasesV1";
export const CONTINUITY_REQUIRED_PROMPT_PHRASE = "Use prior case context from previous days. Here are today's changes.";

export const smartUpdateTypes = ["note", "labs", "mar", "handoff", "subjective"];

const carryForwardFields = [
  "baselineSummary",
  "activeProblems",
  "yesterdayPlan",
  "pendingItems",
  "medicationTrendNotes",
  "labTrendNotes"
];

const dailyInputFields = [
  "todayNote",
  "todayLabs",
  "updatedMar",
  "overnightEvents",
  "subjectiveChange"
];

function cleanText(value) {
  return String(value || "").trim();
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function todayDate(now = new Date()) {
  return isoNow(now).slice(0, 10);
}

function fallbackId(prefix = "case") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.+/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSmartUpdateType(text) {
  const normalized = String(text || "").toLowerCase();
  if (/\b(?:mar|medication|medications|administered|given|held|dose|insulin|heparin|antibiotic|cef|vanco|glargine|lispro)\b/.test(normalized)) {
    return "mar";
  }
  if (/\b(?:lab|labs|result|results|bmp|cmp|cbc|sodium|potassium|chloride|bicarbonate|creatinine|bun|glucose|anion gap|hemoglobin|platelet|wbc|magnesium|phosphorus|a1c|tsh)\b/.test(normalized) || /\b[A-Za-z][A-Za-z0-9/-]{0,12}\s+\d+(?:\.\d+)?\b/.test(text)) {
    return "labs";
  }
  if (/\b(?:subjective|feels|reports|denies|symptom|pain|nausea|breathing|appetite|weakness)\b/.test(normalized)) {
    return "subjective";
  }
  if (/\b(?:handoff|overnight|event|events|nursing|cross-cover|paged|to-do|todo|pending|barrier)\b/.test(normalized)) {
    return "handoff";
  }
  return "note";
}

function smartHeadingType(heading = "") {
  const normalized = String(heading || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(?:lab|result)/.test(normalized)) {
    return "labs";
  }
  if (/\b(?:mar|med|medication)/.test(normalized)) {
    return "mar";
  }
  if (/\b(?:handoff|event|overnight)/.test(normalized)) {
    return "handoff";
  }
  if (/\bsubjective/.test(normalized)) {
    return "subjective";
  }
  return "note";
}

function splitSmartUpdateChunk(chunk = "") {
  const headingPattern = /^\s*((?:today(?:'s)?\s+)?(?:note|plan|assessment|a\/p|soap|labs?|results?|updated\s+mar|mar|updated\s+med(?:ication)?s?|med(?:ication)?s?|handoff|events?|overnight(?:\s+events?)?|subjective(?:\s+change)?))\s*[:#-]\s*(.*)$/i;
  const sections = [];
  let current = null;
  let leadingLines = [];

  String(chunk || "").split("\n").forEach((line) => {
    const match = line.match(headingPattern);
    if (match) {
      if (current) {
        sections.push(current);
      } else if (leadingLines.some((leadingLine) => leadingLine.trim())) {
        sections.push({ heading: "note", lines: leadingLines });
      }
      current = {
        heading: match[1],
        lines: match[2]?.trim() ? [match[2].trim()] : []
      };
      leadingLines = [];
      return;
    }
    if (current) {
      current.lines.push(line);
    } else {
      leadingLines.push(line);
    }
  });

  if (current) {
    sections.push(current);
  } else if (leadingLines.some((line) => line.trim())) {
    sections.push({ heading: "", lines: leadingLines });
  }

  return sections
    .map((section) => ({
      heading: section.heading,
      type: section.heading ? smartHeadingType(section.heading) : "",
      text: section.lines.join("\n").trim()
    }))
    .filter((section) => section.text);
}

function smartTypeToDailyField(type) {
  return {
    note: "todayNote",
    labs: "todayLabs",
    mar: "updatedMar",
    handoff: "overnightEvents",
    subjective: "subjectiveChange"
  }[type] || "todayNote";
}

function labRowKey(row) {
  return [
    row.analyte || row.displayName || "",
    row.value || "",
    row.unit || "",
    row.collectionTime?.dateKey || "",
    row.collectionTime?.timeLabel || ""
  ].map((part) => String(part || "").toLowerCase()).join("|");
}

function labRowLabel(row) {
  const time = [row.collectionTime?.dayLabel, row.collectionTime?.timeLabel].filter(Boolean).join(" ");
  return `${row.displayName || row.analyte || "Lab"} ${row.value || ""}${row.unit ? ` ${row.unit}` : ""}${time ? ` (${time})` : ""}`.trim();
}

function summarizeLabChanges(currentText, previousText) {
  const currentTimeline = parseLabTimeline(currentText);
  const previousTimeline = parseLabTimeline(previousText);
  if (!currentTimeline.hasLabs && !previousTimeline.hasLabs) {
    return [];
  }
  const previousKeys = new Set(previousTimeline.rows.map(labRowKey));
  const newRows = currentTimeline.rows.filter((row) => !previousKeys.has(labRowKey(row)));
  const details = [
    `${currentTimeline.rows.length} parsed lab row${currentTimeline.rows.length === 1 ? "" : "s"} today; ${previousTimeline.rows.length} previously.`
  ];
  if (newRows.length) {
    details.push(`New lab/result rows: ${newRows.slice(0, 4).map(labRowLabel).join("; ")}${newRows.length > 4 ? "; more not shown" : ""}.`);
  } else if (currentTimeline.hasLabs) {
    details.push("No new parsed lab rows compared with the latest saved day.");
  }
  if (currentTimeline.warnings.length) {
    details.push(`${currentTimeline.warnings.length} lab timing warning${currentTimeline.warnings.length === 1 ? "" : "s"} need review.`);
  }
  return details;
}

function normalizeMedicationLine(line) {
  return String(line || "")
    .toLowerCase()
    .replace(/\b(?:held|given|administered|ordered|home med|scheduled|prn|po|iv|subq|sq)\b/g, " ")
    .replace(/\b\d{1,2}[/:]\d{2}(?:\s*[ap]m)?\b/g, " ")
    .replace(/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/(?:19|20)?\d{2})?\b/g, " ")
    .replace(/[^a-z0-9.%-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function medicationLines(text) {
  return String(text || "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line && normalizeMedicationLine(line))
    .map((line) => ({ raw: line, key: normalizeMedicationLine(line) }));
}

function summarizeMedicationChanges(currentText, previousText) {
  const currentLines = medicationLines(currentText);
  const previousLines = medicationLines(previousText);
  if (!currentLines.length && !previousLines.length) {
    return [];
  }
  const previousKeys = new Set(previousLines.map((line) => line.key));
  const currentKeys = new Set(currentLines.map((line) => line.key));
  const added = currentLines.filter((line) => !previousKeys.has(line.key));
  const removed = previousLines.filter((line) => !currentKeys.has(line.key));
  const details = [
    `${currentLines.length} medication/MAR line${currentLines.length === 1 ? "" : "s"} today; ${previousLines.length} previously.`
  ];
  if (added.length) {
    details.push(`New or changed MAR lines: ${added.slice(0, 4).map((line) => line.raw).join("; ")}${added.length > 4 ? "; more not shown" : ""}.`);
  }
  if (removed.length) {
    details.push(`Missing prior MAR lines: ${removed.slice(0, 3).map((line) => line.raw).join("; ")}${removed.length > 3 ? "; more not shown" : ""}.`);
  }
  if (!added.length && !removed.length) {
    details.push("No normalized MAR line changes compared with the latest saved day.");
  }
  return details;
}

function smartReviewDetails(type, currentText, previousText) {
  if (type === "labs") {
    return summarizeLabChanges(currentText, previousText);
  }
  if (type === "mar") {
    return summarizeMedicationChanges(currentText, previousText);
  }
  return [];
}

export function classifySmartUpdateSections(text = "") {
  const normalizedText = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalizedText) {
    return [];
  }
  const chunks = normalizedText
    .split(/\n\s*(?:---+|={3,})\s*\n|\n{3,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks
    .flatMap((chunk) => splitSmartUpdateChunk(chunk))
    .map((section, index) => {
      const body = section.text || "";
      const type = section.type || inferSmartUpdateType(body);
      return {
        id: `smart-${index + 1}`,
        label: `Section ${index + 1}`,
        type,
        text: body
      };
    });
}

export function smartSectionsToDailyInputs(sections = []) {
  return normalizeDailyInputs(sections.reduce((inputs, section) => {
    const field = smartTypeToDailyField(section.type);
    const text = cleanText(section.deidentifiedText || section.text);
    if (text) {
      inputs[field] = [inputs[field], text].filter(Boolean).join("\n\n");
    }
    return inputs;
  }, {}));
}

export function buildSmartUpdateReview(sections = [], patientCase = {}) {
  const normalizedCase = normalizeContinuityCase(patientCase);
  const previousDay = normalizedCase.days[normalizedCase.days.length - 1] || null;
  const previousInputs = previousDay?.deidentifiedInputs || {};
  const rows = sections.map((section) => {
    const field = smartTypeToDailyField(section.type);
    const currentText = cleanText(section.deidentifiedText || section.text);
    const previousText = cleanText(previousInputs[field]);
    let status = "new";
    if (!currentText) {
      status = "missing";
    } else if (previousText && normalizeComparableText(previousText) === normalizeComparableText(currentText)) {
      status = "unchanged";
    } else if (previousText) {
      status = "changed";
    }
    return {
      id: section.id || fallbackId("smart"),
      label: section.label || section.type || "Section",
      type: smartUpdateTypes.includes(section.type) ? section.type : "note",
      dailyField: field,
      status,
      previousCharacterCount: previousText.length,
      currentCharacterCount: currentText.length,
      details: smartReviewDetails(section.type, currentText, previousText),
      preview: currentText.slice(0, 220)
    };
  });

  const currentTypes = new Set(rows.map((row) => row.type));
  smartUpdateTypes.forEach((type) => {
    if (!currentTypes.has(type)) {
      rows.push({
        id: `missing-${type}`,
        label: type,
        type,
        dailyField: smartTypeToDailyField(type),
        status: "missing",
        previousCharacterCount: cleanText(previousInputs[smartTypeToDailyField(type)]).length,
        currentCharacterCount: 0,
        details: [],
        preview: ""
      });
    }
  });

  const carryForwardSuggestions = [];
  if (rows.some((row) => row.type === "labs" && row.status === "changed") && normalizedCase.labTrendNotes) {
    carryForwardSuggestions.push({ field: "labTrendNotes", reason: "Today labs/results differ from the latest saved day." });
  }
  if (rows.some((row) => row.type === "mar" && row.status === "changed") && normalizedCase.medicationTrendNotes) {
    carryForwardSuggestions.push({ field: "medicationTrendNotes", reason: "Today MAR/medication section differs from the latest saved day." });
  }
  if (rows.some((row) => ["handoff", "subjective", "note"].includes(row.type) && row.status === "changed") && normalizedCase.pendingItems) {
    carryForwardSuggestions.push({ field: "pendingItems", reason: "Today interval context changed; review pending items." });
  }

  return {
    previousDate: previousDay?.date || "",
    rows,
    carryForwardSuggestions
  };
}

export function normalizeDailyInputs(inputs = {}) {
  return dailyInputFields.reduce((normalized, field) => {
    normalized[field] = cleanText(inputs[field]);
    return normalized;
  }, {});
}

export function hasDailyInputs(inputs = {}) {
  return Object.values(normalizeDailyInputs(inputs)).some(Boolean);
}

export function formatDailyInputs(inputs = {}) {
  const normalized = normalizeDailyInputs(inputs);
  return [
    ["Today note", normalized.todayNote],
    ["Today labs", normalized.todayLabs],
    ["Updated MAR", normalized.updatedMar],
    ["Overnight events", normalized.overnightEvents],
    ["Subjective change", normalized.subjectiveChange]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

export function normalizeContinuityDay(day = {}, now = new Date()) {
  const deidentifiedInputs = normalizeDailyInputs(day.deidentifiedInputs || day.todayInputs || {});
  return {
    id: cleanText(day.id) || fallbackId("day"),
    date: cleanText(day.date) || todayDate(now),
    createdAt: cleanText(day.createdAt) || isoNow(now),
    updatedAt: cleanText(day.updatedAt) || cleanText(day.createdAt) || isoNow(now),
    deidentifiedInputs,
    copiedContinuityPrompt: Boolean(day.copiedContinuityPrompt),
    generatedChecklistText: cleanText(day.generatedChecklistText),
    parsedChecklist: Array.isArray(day.parsedChecklist) ? day.parsedChecklist : [],
    bedsideAnswers: day.bedsideAnswers && typeof day.bedsideAnswers === "object" ? { ...day.bedsideAnswers } : {},
    notes: day.notes && typeof day.notes === "object" ? { ...day.notes } : {},
    finalCompiledFindings: cleanText(day.finalCompiledFindings),
    roundsPasteBack: day.roundsPasteBack && typeof day.roundsPasteBack === "object" && !Array.isArray(day.roundsPasteBack) ? { ...day.roundsPasteBack } : null,
    smartUpdateReview: Array.isArray(day.smartUpdateReview) ? day.smartUpdateReview.map((row) => ({ ...row })) : [],
    carryForwardUpdates: Array.isArray(day.carryForwardUpdates) ? day.carryForwardUpdates.map((row) => ({ ...row })) : []
  };
}

export function createContinuityCase(values = {}, now = new Date()) {
  return normalizeContinuityCase({
    id: values.id || fallbackId("case"),
    label: values.label || "Patient A",
    patientId: values.patientId || "",
    createdAt: values.createdAt || isoNow(now),
    updatedAt: values.updatedAt || isoNow(now),
    conversationCaseKey: values.conversationCaseKey || "",
    baselineSummary: values.baselineSummary || "",
    activeProblems: values.activeProblems || "",
    yesterdayPlan: values.yesterdayPlan || "",
    pendingItems: values.pendingItems || "",
    medicationTrendNotes: values.medicationTrendNotes || "",
    labTrendNotes: values.labTrendNotes || "",
    days: values.days || []
  }, now);
}

export function normalizeContinuityCase(patientCase = {}, now = new Date()) {
  const createdAt = cleanText(patientCase.createdAt) || isoNow(now);
  const normalized = {
    id: cleanText(patientCase.id) || fallbackId("case"),
    patientId: cleanText(patientCase.patientId),
    label: cleanText(patientCase.label) || "Patient",
    createdAt,
    updatedAt: cleanText(patientCase.updatedAt) || createdAt,
    conversationCaseKey: cleanText(patientCase.conversationCaseKey),
    days: Array.isArray(patientCase.days)
      ? patientCase.days.map((day) => normalizeContinuityDay(day, now))
      : []
  };
  carryForwardFields.forEach((field) => {
    normalized[field] = cleanText(patientCase[field]);
  });
  return normalized;
}

export function normalizeContinuityCases(value = []) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((patientCase) => normalizeContinuityCase(patientCase));
}

export function appendOrUpdateContinuityDay(patientCase, dayPatch = {}, now = new Date()) {
  const normalized = normalizeContinuityCase(patientCase, now);
  const date = cleanText(dayPatch.date) || todayDate(now);
  const existingIndex = normalized.days.findIndex((day) => day.date === date);
  const existingDay = existingIndex >= 0 ? normalized.days[existingIndex] : {};
  const nextDay = normalizeContinuityDay({
    ...existingDay,
    ...dayPatch,
    date,
    updatedAt: isoNow(now)
  }, now);
  const nextDays = [...normalized.days];
  if (existingIndex >= 0) {
    nextDays[existingIndex] = nextDay;
  } else {
    nextDays.push(nextDay);
  }
  nextDays.sort((a, b) => a.date.localeCompare(b.date));
  return normalizeContinuityCase({
    ...normalized,
    days: nextDays,
    updatedAt: isoNow(now)
  }, now);
}

export function latestContinuityDay(patientCase) {
  const normalized = normalizeContinuityCase(patientCase);
  return normalized.days[normalized.days.length - 1] || null;
}

export function stripRawDailyInputsForStorage(dayPatch = {}) {
  const storagePatch = {
    ...dayPatch,
    deidentifiedInputs: normalizeDailyInputs(dayPatch.deidentifiedInputs || {})
  };
  delete storagePatch.rawInputs;
  delete storagePatch.todayInputs;
  delete storagePatch.rawSections;
  return storagePatch;
}

export function buildCarryForwardBlock(patientCase = {}) {
  const normalized = normalizeContinuityCase(patientCase);
  const lines = [
    ["Stable background", normalized.baselineSummary],
    ["Active problems", normalized.activeProblems],
    ["Yesterday plan", normalized.yesterdayPlan],
    ["Unresolved pending items", normalized.pendingItems],
    ["Medication trend notes", normalized.medicationTrendNotes],
    ["Lab trend notes", normalized.labTrendNotes]
  ];
  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

export function buildContinuityUpdatePrompt({ patientCase, todayInputs, userContext = "" } = {}) {
  const normalizedCase = normalizeContinuityCase(patientCase || {});
  const todayBlock = formatDailyInputs(todayInputs);
  const carryForwardBlock = buildCarryForwardBlock(normalizedCase);
  return `${CONTINUITY_REQUIRED_PROMPT_PHRASE}

You are updating the same OpenEvidence conversation for this local patient case. Use the prior case context from previous days already present in this conversation as the longitudinal source of truth. Do not ask me to paste yesterday's OpenEvidence report back into the app.

<task>
Update today's rounds preparation using only today's de-identified changes below plus the prior context already in this same OpenEvidence conversation.
Output only changes since yesterday that could change what the student says, verifies, asks, escalates, monitors, or carries forward for rounds.
Use at most 5 bullets total. Prefix each bullet with SAY, CHECK, ASK, WATCH, or CARRY-FORWARD.
If nothing changes management, output exactly: NO MANAGEMENT-CHANGING ITEMS FOUND.
Preserve uncertainty and do not invent trends, plans, diagnoses, vitals, labs, medications, or bedside findings.
Do not include unchanged background, no-action items, broad summaries, or filler.
</task>${userContext ? `\n\n${userContext}` : ""}

<local_case_label>
${normalizedCase.label}
</local_case_label>${normalizedCase.conversationCaseKey ? `\n\n<conversation_case_key>\n${normalizedCase.conversationCaseKey}\n</conversation_case_key>` : ""}${carryForwardBlock ? `\n\n<editable_carry_forward>\n${carryForwardBlock}\n</editable_carry_forward>` : ""}

<today_changes>
${todayBlock || "No de-identified today changes were provided."}
</today_changes>

Now update the existing case context for today using only management-changing deltas.`;
}

export function buildContinuityChecklistContext({ patientCase, todayInputs, userContext = "" } = {}) {
  const normalizedCase = normalizeContinuityCase(patientCase || {});
  const todayBlock = formatDailyInputs(todayInputs);
  return `${userContext ? `${userContext}\n\n` : ""}<local_case_label>
${normalizedCase.label}
</local_case_label>

<today_changes>
${todayBlock || "No de-identified today changes were provided."}
</today_changes>

Use this de-identified local continuity context to build today's bedside checklist inside the app. Do not ask OpenEvidence to generate the checklist.`;
}

export function buildContinuityChecklistPrompt(args = {}) {
  return buildContinuityChecklistContext(args);
}
