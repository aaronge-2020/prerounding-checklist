const bedsideParentTitle = "BEDSIDE QUESTION CHECKLIST";
const examParentTitle = "TARGETED PHYSICAL EXAM CHECKLIST";

const checklistContract = `Return plain text only.
Return exactly two parent checklists in this order:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST

Parent checklist titles must be the exact all-caps lines above, with no colon.
Subheadings must be all-caps lines with no punctuation.
Every checklist item must be one line in this exact format:
Label: Option A / Option B / Option C

Bedside labels must be direct patient questions ending in ? before the colon.
Exam labels must be concise clinician-observed findings.
Use structured slash-separated options whenever possible.
Use ___ only for a short free-text detail, and put it at the end of the option or item.
Do not use blank numerator formats such as ___ / 5, ___/10, or ___ / ___.
Do not use markdown, bullets, numbering, tables, explanations, citations, or text before or after the two checklists.`;

const studentExamReferenceFallback = `Student exam reference (student_exam_reference; optional reminder, not exhaustive):
These are locally reviewed examples from the student's learned physical exam toolkit. Use them only as a compatibility fallback and completeness check for maneuvers already supported by the reviewed patient context.
Do not add unvalidated checklist items as final checklist rows. If a clinically important question or maneuver is missing from validated local material, omit it from the two checklists and treat it as a catalog gap for reviewer follow-up.
Use the reference to avoid missing relevant student-performable maneuvers, then choose the final concise checklist from reviewed patient context, installed clinical workup modules, validated clinical intents, or retrieved evidence candidates.`;

export const checklistPrompt = `Local bedside checklist generation contract for a third-year medical student preparing for inpatient rounds. Use the app's reviewed patient context, installed clinical workup modules, validated clinical intents, and retrieved evidence candidates to create a focused bedside pre-rounding checklist for clinician review. Do not ask OpenEvidence or another external system to generate this bedside checklist.

The checklist should help me identify today's clinical trajectory, severity, red flags, response to treatment, functional status, discharge readiness, and management-relevant changes.

Please include exactly two plain-text checklists:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST

Bedside question checklist:
- Include 6 to 8 true history questions that I can say out loud to the patient.
- Use patient-friendly language with no medical jargon.
- Focus on symptoms, changes since arrival or yesterday, breathing, pain, weakness, dizziness, intake/output, bowel/bladder changes, mobility, function, safety, treatment access, discharge readiness, and the patient's concerns.
- Do not include physical exam maneuvers, clinician-observed findings, or performance commands.
- Do not ask the patient to squeeze, lift, wiggle, count aloud, cough on command, stick out the tongue, follow a finger, walk, stand, or perform a physical exam task.
- When the patient might answer outside the choices, include Other ___ as the final option.

Targeted physical exam checklist:
- Include 12 to 18 focused exam findings total. For complex multi-system patients, you may include up to 22 when each item could affect management today.
- Choose findings from the patient's active problems, abnormal vitals/labs/trends, consult question, treatments, devices/support, and likely complications.
- Group findings by exam system or exam type, with no more than 5 items in any one exam subsection.
- Prefer grouped screening findings over exhaustive right-left inventories.
- Do not treat vital signs, oxygen saturation, current weight, glucose, or other basic measurements as physical exam maneuvers. Those belong in basic bedside data or safety checks.
- Include devices/support, volume status, cardiopulmonary status, abdominal findings, neurologic findings, wounds/lines/drains, functional safety, or other problem-specific findings only when relevant and traceable to reviewed local context.
- Use the student exam reference below as a completeness check for exam maneuvers I have learned, but do not use it to authorize unvalidated final rows.
- Write documentation-ready findings, not technique instructions.

If a <validated_clinical_intents> block is present, use those manually validated intents as the authority for bedside question and exam scope. Prefer relevant retrieved candidate bedside question labels/options and targeted exam labels/options when they fit the patient, and improve unclear wording or option choices when clinically better. Do not add unvalidated checklist items as final checklist rows. If you notice a clinically important gap that is not supported by the validated intents or retrieved candidates, omit it from the final two-section checklist and treat it as a gap suggestion for app-side review rather than silently inserting it.

If a <retrieved_evidence_candidates> block is present without a validated intent block, treat it as a reviewer-only evidence context and completeness check. Prefer relevant candidate bedside question labels/options and targeted exam labels/options only when they are also supported by reviewed patient context. Do not add unvalidated checklist items as final checklist rows. If a clinically important item is missing from the retrieved candidates, treat it as a catalog gap rather than inserting it into the final checklist. Do not copy low-relevance candidates merely because they were retrieved. Do not include citations or rationale text in the final checklist.

Do not include generic review-of-systems questions, a full head-to-toe exam, teaching, explanations, citations, caveats, or oral presentation text.
Do not mention de-identification.

${studentExamReferenceFallback}

Output format rules:
${checklistContract}

Example format:
BEDSIDE QUESTION CHECKLIST
SYMPTOM TRAJECTORY
Since yesterday, is your main symptom better, the same, or worse?: Better / Same / Worse / Other ___
Have you noticed any new or worsening symptom?: Yes / No / Other ___
FUNCTION AND SAFETY
Have you been able to get out of bed safely?: Yes / No / Not tried / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
RESPIRATORY EXAM
Work of breathing: Normal / Mildly increased / Markedly increased
Lung exam: Clear / Crackles / Wheezes / Diminished

Before you finish, check that both parent checklist titles are present, every bedside label ends in a question mark before the colon, no bedside item is a physical exam command, the bedside checklist has 6 to 8 items, the exam checklist has 12 to 18 items or up to 22 only for complex multi-system patients, no exam subsection has more than 5 items, and every item is parseable as Label: options.`;

export const newAdmissionChecklistPrompt = `${checklistPrompt}

New admission focus:
No prior subjective/objective/assessment/plan note is available. The patient is newly admitted or being admitted now.
Use the bedside questions to fill the highest-yield remaining gaps for a full first-history admission write-up: chief complaint, history of present illness timing and symptom character, relevant past medical history, medications, allergies, surgical history, health maintenance, family history, social history, review of systems positives and negatives, function, safety, and patient concerns.
Prefer broad, patient-friendly questions with structured answer choices so the student can capture a lot with minimal typing.
`;

function normalizeHeaderText(value) {
  return String(value || "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[:;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeader(value) {
  return normalizeHeaderText(value).toUpperCase();
}

function titleKey(value) {
  return normalizeHeaderText(value)
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function categoryForChecklistTitle(title) {
  const key = titleKey(title);
  if ([
    "BEDSIDE QUESTION CHECKLIST",
    "BEDSIDE QUESTIONS",
    "BEDSIDE QUESTION",
    "PATIENT QUESTION CHECKLIST",
    "PATIENT QUESTIONS",
    "PATIENT INTERVIEW CHECKLIST",
    "INTERVIEW QUESTION CHECKLIST"
  ].includes(key)) {
    return "bedside";
  }

  if ([
    "TARGETED PHYSICAL EXAM CHECKLIST",
    "TARGETED PHYSICAL EXAM",
    "TARGETED EXAM",
    "FOCUSED PHYSICAL EXAM CHECKLIST",
    "FOCUSED PHYSICAL EXAM",
    "FOCUSED EXAM",
    "PHYSICAL EXAM CHECKLIST",
    "EXAM CHECKLIST"
  ].includes(key)) {
    return "exam";
  }

  return "";
}

function canonicalParentTitle(category) {
  if (category === "bedside") {
    return bedsideParentTitle;
  }
  if (category === "exam") {
    return examParentTitle;
  }
  return "";
}

export function isAllCapsLine(line) {
  const text = normalizeHeaderText(line);
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && text === text.toUpperCase();
}

function headingCategory(title, activeCategory) {
  const normalized = normalizeHeader(title);
  if (activeCategory === "bedside" && /\b(?:SYMPTOM|SYMPTOMS|HISTORY|TRAJECTORY|CONCERN|CONCERNS|DISCHARGE|READINESS|KNOWLEDGE|PAIN|BREATHING|INTAKE|OUTPUT|GLYCEMIC|SICK DAY|FUNCTION)\b/.test(normalized)) {
    return "bedside";
  }
  if (/\b(?:VITAL|SUPPORT|EXAM|CARDIAC|CARDIOPULMONARY|PULMONARY|RESPIRATORY|ABDOMINAL|VOLUME|SKIN|LINE|LINES|WOUND|WOUNDS|FOOT|FEET|NEURO|NEUROLOGIC|MUSCULOSKELETAL|STRENGTH|REFLEX|SENSORY|CRANIAL|FUNCTIONAL SAFETY|DEVICE|DRAIN)\b/.test(normalized)) {
    return "exam";
  }
  if (activeCategory === "exam" && /\b(?:BASIC DATA|SAFETY|ACUITY|SEVERITY)\b/.test(normalized)) {
    return "exam";
  }
  if (/\b(?:SYMPTOM|TRAJECTORY|CONCERN|CONCERNS|DISCHARGE|READINESS|KNOWLEDGE|PAIN|BREATHING|INTAKE|OUTPUT|GLYCEMIC|SAFETY|SICK DAY|FUNCTION)\b/.test(normalized)) {
    return "bedside";
  }
  return activeCategory === "general" ? "bedside" : activeCategory;
}

function itemCategory(label, sectionCategory) {
  if (sectionCategory && sectionCategory !== "general") {
    return sectionCategory;
  }
  return String(label || "").trim().endsWith("?") ? "bedside" : "exam";
}

function makeItemId(sectionIndex, itemIndex) {
  return `s${sectionIndex}i${itemIndex}`;
}

function ensureSection(sections, category = "general") {
  if (!sections.length) {
    sections.push({ title: "CHECKLIST", category, items: [] });
  }
  return sections[sections.length - 1];
}

function addSection(sections, title, category) {
  sections.push({ title: normalizeHeader(title), category: category || "general", items: [] });
  return sections[sections.length - 1];
}

function stripTrailingNotePlaceholder(value) {
  const match = String(value || "").match(/\s*_{2,3}\s*$/);
  if (!match) {
    return { text: String(value || "").trim(), hasNotes: false };
  }
  return {
    text: String(value || "").slice(0, match.index).trim(),
    hasNotes: true
  };
}

function isBlankFractionValue(value) {
  const parts = String(value || "").split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return false;
  }

  const placeholderParts = parts.filter((part) => /^_{2,3}$/.test(part)).length;
  const denominatorParts = parts.filter((part) => /^(?:\d{1,3}|mmHg|mg\/dL|L|%)$/i.test(part)).length;
  return placeholderParts > 0 && placeholderParts + denominatorParts === parts.length;
}

function cleanOptionText(value) {
  return String(value || "")
    .replace(/_{2,3}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .trim();
}

function parseOptionText(value) {
  if (isBlankFractionValue(value)) {
    return {
      options: [],
      hasNotes: true
    };
  }

  const rawValue = String(value || "").trim();
  const hasInlineNotes = /_{2,3}/.test(rawValue);
  const noteParse = stripTrailingNotePlaceholder(rawValue);
  const parseText = hasInlineNotes ? rawValue : noteParse.text;
  const options = parseText.includes("/")
    ? parseText.split("/").map(cleanOptionText).filter(Boolean)
    : [cleanOptionText(noteParse.text)].filter(Boolean);
  return {
    options,
    hasNotes: noteParse.hasNotes || hasInlineNotes
  };
}

function isLikelyOptionLine(line) {
  if (!line || line.includes(":") || isAllCapsLine(line) || categoryForChecklistTitle(line)) {
    return false;
  }
  const optionText = stripTrailingNotePlaceholder(line).text;
  const wordCount = optionText.split(/\s+/).filter(Boolean).length;
  return line.includes("__") || wordCount > 0 && wordCount <= 6;
}

function isLikelySectionHeading(line) {
  return isAllCapsLine(line) && !line.includes("/") && !line.includes("__") && !/[?]/.test(line);
}

function addQuestion(sections, label, options, hasNotes, rawValue = "") {
  const currentSection = ensureSection(sections);
  const category = itemCategory(label, currentSection.category || "general");
  if (!currentSection.category || currentSection.category === "general") {
    currentSection.category = category;
  }
  const itemId = makeItemId(sections.length - 1, currentSection.items.length);
  currentSection.items.push({
    id: itemId,
    label,
    options,
    rawValue,
    category,
    hasNotes: Boolean(hasNotes || category === "bedside" && options.length)
  });
}

function cleanChecklistLine(line) {
  let cleaned = String(line || "")
    .trim()
    .replace(/\u201c|\u201d/g, "\"")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\uff1a/g, ":")
    .replace(/\u2215|\uff0f/g, "/")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[>*\u2022\u2023\u25aa\u25ab\u25e6-]+|[\u2610\u2611\u2612\u2713\u2714]|\[[ xX]\])\s+/, "")
    .replace(/^\(?\d+[\.)]\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned.includes(":")) {
    const dashOptionMatch = cleaned.match(/^(.{3,140}?)\s+-\s+(.+(?:\/|_{2,3}).*)$/);
    if (dashOptionMatch) {
      cleaned = `${dashOptionMatch[1].trim()}: ${dashOptionMatch[2].trim()}`;
    } else {
      const questionOptionMatch = cleaned.match(/^(.+\?)\s+(.+(?:\/|_{2,3}).*)$/);
      if (questionOptionMatch) {
        cleaned = `${questionOptionMatch[1].trim()}: ${questionOptionMatch[2].trim()}`;
      }
    }
  }

  const colonIndex = cleaned.indexOf(":");
  if (colonIndex === -1) {
    return cleaned;
  }
  return `${cleaned.slice(0, colonIndex).trim()}: ${cleaned.slice(colonIndex + 1).replace(/\s*\/\s*/g, " / ").replace(/\s{2,}/g, " ").trim()}`;
}

export function normalizeChecklistText(rawText) {
  return String(rawText || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .split(/\r?\n/)
    .map(cleanChecklistLine)
    .join("\n");
}

export function annotateChecklistSections(sections) {
  let activeCategory = "general";
  return (sections || []).map((section) => {
    const title = normalizeHeader(section.title || "CHECKLIST");
    const titleCategory = categoryForChecklistTitle(title);
    if (titleCategory) {
      activeCategory = titleCategory;
    }

    const category = section.category || titleCategory || activeCategory;
    return {
      ...section,
      title,
      category,
      items: (section.items || []).map((item) => {
        const itemCat = item.category || itemCategory(item.label, category);
        return {
          ...item,
          category: itemCat,
          hasNotes: Boolean(item.hasNotes || itemCat === "bedside" && item.options && item.options.length)
        };
      })
    };
  });
}

export function parseChecklist(rawText) {
  const normalizedText = normalizeChecklistText(rawText);
  const lines = [];
  let blockId = 0;

  normalizedText.split(/\r?\n/).forEach((rawLine) => {
    const text = rawLine.trim();
    if (!text) {
      blockId += 1;
      return;
    }
    lines.push({ text, blockId });
  });

  const sections = [];
  let activeCategory = "general";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].text;
    const parentCategory = categoryForChecklistTitle(line);
    if (parentCategory) {
      activeCategory = parentCategory;
      addSection(sections, canonicalParentTitle(parentCategory), activeCategory);
      continue;
    }

    if (!line.includes(":") && !isAllCapsLine(line)) {
      const nextLine = lines[index + 1];
      if (nextLine && nextLine.blockId === lines[index].blockId && isLikelyOptionLine(nextLine.text)) {
        const options = [];
        let hasNotes = false;
        let optionIndex = index + 1;

        while (
          optionIndex < lines.length &&
          lines[optionIndex].blockId === lines[index].blockId &&
          isLikelyOptionLine(lines[optionIndex].text)
        ) {
          const optionParse = parseOptionText(lines[optionIndex].text);
          options.push(...optionParse.options);
          hasNotes = hasNotes || optionParse.hasNotes;
          optionIndex += 1;
        }

        if (options.length || hasNotes) {
          addQuestion(sections, line, options, hasNotes, options.join(" / "));
          index = optionIndex - 1;
          continue;
        }
      }
      continue;
    }

    if (!line.includes(":")) {
      if (isLikelySectionHeading(line)) {
        activeCategory = headingCategory(line, activeCategory);
        addSection(sections, line, activeCategory);
      }
      continue;
    }

    const colonIndex = line.indexOf(":");
    const label = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    if (!label) {
      continue;
    }

    const labelParentCategory = categoryForChecklistTitle(label);
    if (labelParentCategory && !rawValue) {
      activeCategory = labelParentCategory;
      addSection(sections, canonicalParentTitle(labelParentCategory), activeCategory);
      continue;
    }

    if (!rawValue) {
      if (isLikelySectionHeading(label)) {
        activeCategory = headingCategory(label, activeCategory);
        addSection(sections, label, activeCategory);
      }
      continue;
    }

    const optionParse = parseOptionText(rawValue);
    if (!optionParse.options.length && !optionParse.hasNotes) {
      continue;
    }

    addQuestion(sections, label, optionParse.options, optionParse.hasNotes, rawValue);
  }

  return annotateChecklistSections(sections.filter((section) => section.items.length || section.title));
}

export function isBedsideExamManeuver(label) {
  const text = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) {
    return false;
  }

  const explicitExamTerms = /\b(?:babinski|clonus|hoffmann|finger[- ]to[- ]nose|heel[- ]to[- ]shin|romberg|pronator drift|gag reflex|deep tendon reflex|cranial nerve)\b/i;
  const commandExamPattern = /\b(?:(?:can|could|would)\s+you|please|try\s+to|i\s+need\s+you\s+to|let(?:'|’)s)\s+(?:squeeze|grip|lift|raise|wiggle|stick\s+out|follow|track|count\s+(?:aloud|out\s+loud|to\s+\d+)|cough\s+(?:for\s+me|on\s+command)?|walk\s+(?:for\s+me|across|heel|toe|tandem)|stand\s+(?:up|for\s+me|on)|touch\s+(?:your\s+)?(?:nose|finger)|turn\s+your\s+head|shrug\s+your\s+shoulders|open\s+and\s+close)\b/i;
  const directManeuverPattern = /\b(?:squeeze\s+(?:my|both|your)\s+fingers?|grip\s+(?:my|both|your)\s+fingers?|lift\s+(?:your\s+)?(?:arms?|legs?)|raise\s+(?:your\s+)?(?:arms?|legs?)|wiggle\s+(?:your\s+)?(?:toes?|fingers?)|stick\s+out\s+(?:your\s+)?tongue|follow\s+(?:my|this)\s+finger|count\s+(?:aloud|out\s+loud|to\s+\d+)|cough\s+(?:for\s+me|on\s+command)|walk\s+(?:across|heel[- ]to[- ]toe|on\s+(?:your\s+)?(?:heels?|toes?)|tandem)|stand\s+(?:up|on\s+(?:one|your)\s+(?:foot|leg)|for\s+me)|test\s+(?:your\s+)?(?:strength|reflexes?)|check\s+(?:your\s+)?(?:strength|reflexes?))\b/i;

  return explicitExamTerms.test(text) || commandExamPattern.test(text) || directManeuverPattern.test(text);
}

export function hasBadBlankFormat(item) {
  const rawValue = item.rawValue || "";
  return /_{2,3}\s*\/\s*(?:\d|_)/.test(rawValue) || /\d+\s*\/\s*_{2,3}/.test(rawValue);
}

export function validateChecklist(sections) {
  const issues = [];
  const bedsideItems = sections.flatMap((section) => section.items).filter((item) => item.category === "bedside");
  const examSections = sections.filter((section) => section.category === "exam" && section.items.length > 0);
  const examItems = examSections.flatMap((section) => section.items);
  const seenLabels = new Map();

  if (bedsideItems.length < 5) {
    issues.push({ type: "bedside-count-low", message: `Bedside checklist has only ${bedsideItems.length} patient questions. Aim for 6 to 8.` });
  } else if (bedsideItems.length > 8) {
    issues.push({ type: "bedside-count-high", message: `Bedside checklist has ${bedsideItems.length} patient questions. Aim for 6 to 8.` });
  }

  if (examItems.length > 22) {
    issues.push({ type: "exam-count-high", message: `Focused exam has ${examItems.length} items. Aim for 12 to 18 and use no more than 22 for complex multi-system patients.` });
  }

  examSections.forEach((section) => {
    if (section.items.length > 5) {
      issues.push({ type: "exam-section-long", message: `${section.title} has ${section.items.length} exam items. Keep each exam section to 5 or fewer.` });
    }
  });

  sections.forEach((section) => {
    section.items.forEach((item) => {
      const normalizedLabel = item.label.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenLabels.has(normalizedLabel)) {
        issues.push({ type: "duplicate-label", message: `Duplicate item label: ${item.label}` });
      } else {
        seenLabels.set(normalizedLabel, true);
      }

      if (hasBadBlankFormat(item)) {
        issues.push({ type: "bad-blank-format", message: `Possible bad blank format: ${item.label}` });
      }

      if (item.category === "bedside") {
        if (!item.label.trim().endsWith("?")) {
          issues.push({ type: "bedside-question-format", message: `Bedside item should be a direct question ending in ?: ${item.label}` });
        }
        if (isBedsideExamManeuver(item.label)) {
          issues.push({ type: "bedside-exam-maneuver", message: `Bedside item may be an exam maneuver, not history: ${item.label}` });
        }
      }
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    bedsideCount: bedsideItems.length,
    examCount: examItems.length
  };
}

function traceabilityAuditItemLabel(item = {}) {
  return String(item.label || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function auditChecklistTraceability(sections = [], options = {}) {
  const requireTraceability = Boolean(options.requireTraceability);
  const traceItem = typeof options.traceItem === "function" ? options.traceItem : null;
  const issues = [];
  let checkedCount = 0;
  let traceableCount = 0;
  let stagedGapCount = 0;

  if (!requireTraceability || !traceItem) {
    return {
      ok: true,
      issues,
      checkedCount,
      traceableCount,
      untraceableCount: 0,
      stagedGapCount
    };
  }

  (sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      checkedCount += 1;
      const trace = traceItem(item, section) || {};
      if (trace.matched) {
        traceableCount += 1;
        if (trace.status === "staged_gap") {
          stagedGapCount += 1;
          issues.push({
            type: "staged-gap-checklist-item",
            severity: "medium",
            label: item.label,
            category: item.category,
            message: `Checklist item is traceable only to a staged catalog gap and needs expert review before it is treated as a validated recommendation: ${traceabilityAuditItemLabel(item)}`
          });
        }
        return;
      }
      issues.push({
        type: "untraceable-checklist-item",
        severity: "high",
        label: item.label,
        category: item.category,
        message: `Checklist item is not traceable to retrieved evidence, selected validated intent content, accepted expert review, or a staged catalog gap: ${traceabilityAuditItemLabel(item)}`
      });
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    checkedCount,
    traceableCount,
    untraceableCount: checkedCount - traceableCount,
    stagedGapCount
  };
}

export function mergeChecklistAuditResults(...results) {
  const validResults = results.filter(Boolean);
  const issues = validResults.flatMap((result) => result.issues || []);
  return {
    ok: issues.length === 0,
    issues,
    bedsideCount: validResults.find((result) => Number.isFinite(result.bedsideCount))?.bedsideCount || 0,
    examCount: validResults.find((result) => Number.isFinite(result.examCount))?.examCount || 0,
    traceability: validResults.find((result) => Number.isFinite(result.checkedCount))
      ? {
          checkedCount: validResults.find((result) => Number.isFinite(result.checkedCount))?.checkedCount || 0,
          traceableCount: validResults.find((result) => Number.isFinite(result.traceableCount))?.traceableCount || 0,
          untraceableCount: validResults.find((result) => Number.isFinite(result.untraceableCount))?.untraceableCount || 0,
          stagedGapCount: validResults.find((result) => Number.isFinite(result.stagedGapCount))?.stagedGapCount || 0
        }
      : null
  };
}

function stripChecklistLabelPunctuation(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[:;]+/g, " -")
    .replace(/\s+-\s*$/g, "")
    .trim();
}

function normalizeLocalQuestionLabel(value) {
  const label = stripChecklistLabelPunctuation(value);
  if (!label) {
    return "";
  }
  return label.endsWith("?") ? label : `${label}?`;
}

function normalizeLocalExamLabel(value) {
  return stripChecklistLabelPunctuation(value).replace(/[?.]+$/g, "").trim();
}

function optionLabels(value, fallback) {
  if (Array.isArray(value)) {
    const labels = value
      .map((option) => (typeof option === "string" ? option : option?.label || option?.value || ""))
      .map((option) => String(option || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (labels.length) {
      return normalizeChecklistOptions(labels.join(" / "));
    }
  }
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return normalizeChecklistOptions(text || fallback);
}

function normalizeChecklistOptions(value) {
  return String(value || "")
    .replace(/(?:^| \/ )Other$/i, (match) => `${match} ___`)
    .replace(/(?:^| \/ )Unable$/i, (match) => `${match} to assess`)
    .replace(/\s+/g, " ")
    .trim();
}

function checklistItemOptions(item = {}, kind = "") {
  const fallback = kind === "bedside" ? "Yes / No / Unsure / Other ___" : "___";
  return optionLabels(
    item.options
      || item.findings_options
      || item.findingsOptions
      || item.answer_options
      || item.answerOptions
      || item.candidate?.examOptions
      || item.candidate?.findings_options
      || item.candidate?.findingsOptions,
    fallback
  );
}

function localChecklistKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:measure|assess|inspect|palpate|auscultate|check|test|document)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localChecklistItemText(item = {}, label = "") {
  return [
    label,
    item.label,
    item.text,
    optionLabels(item.options, ""),
    item.diagnosticPurpose,
    item.diagnostic_purpose,
    item.managementImplication,
    item.management_implication,
    item.source,
    item.source?.source_id,
    item.source?.source_section,
    item.linkedExamId,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags
  ].filter(Boolean).join(" ").toLowerCase();
}

function localChecklistQuestionSemanticKey(item = {}, label = "") {
  const text = localChecklistItemText(item, label)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const infectionContext = /\b(?:fever|febrile|infection|sepsis|source|pneumonia|cough|dysuria|flank|rash|wound|line|neck stiffness|high risk host|host factor|host risk|exposure|immunosuppression|immunocompromised|pregnancy)\b/.test(text);
  if (infectionContext) {
    if (/\b(?:how high was the fever|how was it measured|when did it start|antipyretics|antibiotics|steroids|immunosuppressants|fever or chills start|temperature)\b/.test(text)) {
      return "bedside:fever-timeline-medication";
    }
    if (/\b(?:urinary or flank source features|dysuria frequency urgency hematuria flank pain|catheter or recent urologic procedure|prior resistant urine culture)\b/.test(text)) {
      return "bedside:infection-urinary-source";
    }
    if (/\b(?:abdominal cns skin line joint or spine source features|severe headache neck stiffness photophobia|rash wound line pain|hot swollen joint|rapidly spreading skin pain)\b/.test(text)) {
      return "bedside:infection-abdomen-cns-skin-source";
    }
    const sourceDomainCount = [
      /\b(?:cough|shortness of breath|dyspnea|sputum|pleuritic|oxygen|aspiration|wheeze|respiratory)\b/.test(text),
      /\b(?:sore throat|ear|sinus|dental|oropharynx|heent)\b/.test(text),
      /\b(?:dysuria|frequency|flank|urinary|hematuria|catheter)\b/.test(text),
      /\b(?:abdominal|vomiting|diarrhea|gi|belly)\b/.test(text),
      /\b(?:rash|wound|line|cellulitis|skin|bite)\b/.test(text),
      /\b(?:headache|neck stiffness|confusion|meningismus|photophobia|hot joint|back pain)\b/.test(text)
    ].filter(Boolean).length;
    if (/\b(?:what symptoms localize|localize the fever source|source localizing symptoms|source-localizing symptoms|most plausible source)\b/.test(text) || /\bsource\b/.test(text) && sourceDomainCount >= 3 || sourceDomainCount >= 4) {
      return "bedside:infection-source-localization";
    }
    if (/\b(?:high risk host|host factor|host risk|exposure|immunosuppression|immunocompromised|pregnancy|hospitalization|procedure|travel|outdoor|tick|mosquito|animal|food|water|sick contacts|sexual exposure|injection drug|new medication|steroid|chemotherapy|transplant|asplenia)\b/.test(text)) {
      return "bedside:infection-host-exposure";
    }
    if (/\b(?:cough|shortness of breath|dyspnea|sputum|pleuritic|oxygen|aspiration|wheeze)\b/.test(text)) {
      return "bedside:infection-respiratory-source";
    }
    if (/\b(?:dysuria|frequency|flank|urinary|hematuria|catheter|burning|dark urine)\b/.test(text)) {
      return "bedside:infection-urinary-source";
    }
    if (/\b(?:rash|wound|line|cellulitis|skin|bite|drainage|redness|tube pain|skin tenderness)\b/.test(text)) {
      return "bedside:infection-skin-line-source";
    }
    if (/\b(?:fainting|confusion|very low urine|low urine|oliguria|mottled|cold extremities|severe weakness|rapid worsening|hypotension|shock|lactate|dehydration|poor intake|unable to keep fluids|unusual sleepiness)\b/.test(text)) {
      return "bedside:sepsis-severity-perfusion";
    }
    if (/\b(?:abdominal|vomiting|diarrhea|gi|belly|headache|neck stiffness|confusion|meningismus|photophobia|hot joint|back pain)\b/.test(text)) {
      return "bedside:infection-abdomen-cns-joint-source";
    }
  }
  return "";
}

function localChecklistExamSemanticKey(item = {}, label = "") {
  const text = localChecklistItemText(item, label)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(?:work of breathing|respiratory effort|labored breathing)\b/.test(text)) return "exam:work-of-breathing";
  if (/\b(?:posterior lung|lung sounds|lung fields|breath sounds|auscultate lungs?)\b/.test(text)) return "exam:posterior-lung-auscultation";
  if (/\b(?:skin source|skin infection source|wound source|line site|line-site|cellulitis|inspect skin for infection)\b/.test(text)) return "exam:skin-wound-line-source";
  if (/\b(?:oropharynx|mouth exam|oral mucosa|oral cavity|pharynx|dental)\b/.test(text)) return "exam:oropharyngeal-source";
  if (/\b(?:radial pulses|perfusion pulses|peripheral pulses)\b/.test(text)) return "exam:peripheral-pulses";
  return "";
}

function localChecklistItemKey(item = {}, label = "", kind = "") {
  if (kind === "bedside") {
    return localChecklistQuestionSemanticKey(item, label) || localChecklistKey(label);
  }
  if (kind === "exam") {
    return localChecklistExamSemanticKey(item, label) || localChecklistKey(label);
  }
  return localChecklistKey(label);
}

function isBasicBedsideDataLabel(label) {
  return /\b(?:blood pressure|bp|heart rate|hr|respiratory rate|rr|oxygen saturation|spo2|pulse oximetry|temperature|temp|current weight|weight|body mass index|bmi|waist circumference|orthostatic(?: vitals?)?|bedside glucose|point-of-care glucose|fingerstick glucose|pain score)\b/i.test(String(label || ""));
}

function addUniqueChecklistItem(items, seen, item, kind) {
  const label = kind === "bedside"
    ? normalizeLocalQuestionLabel(item?.label || item?.text)
    : normalizeLocalExamLabel(item?.label || item?.text);
  if (!label) {
    return;
  }
  if (kind === "exam" && isBasicBedsideDataLabel(label)) {
    return;
  }
  const key = localChecklistItemKey(item, label, kind);
  if (!key || seen.has(key)) {
    return;
  }
  seen.add(key);
  items.push({
    label,
    options: checklistItemOptions(item, kind)
  });
}

function recommendationExamItem(entry = {}) {
  const candidate = entry.candidate || {};
  return {
    label: entry.label || candidate.examLabel || candidate.maneuver || candidate.base?.suggested_checklist_label || candidate.exam_id,
    options: entry.options || candidate.examOptions || candidate.base?.suggested_options || ""
  };
}

function appendChecklistSection(lines, title, items, maxPerSection = 5) {
  if (!items.length) {
    return;
  }
  for (let start = 0; start < items.length; start += maxPerSection) {
    const chunk = items.slice(start, start + maxPerSection);
    lines.push(start === 0 ? title : `${title} CONTINUED`);
    chunk.forEach((item) => {
      lines.push(`${item.label}: ${item.options || "___"}`);
    });
    lines.push("");
  }
}

const genericLocalBedsideQuestions = [
  { label: "Since yesterday, is your main symptom better, the same, or worse?", options: "Better / Same / Worse / Other ___" },
  { label: "Have you noticed any new or worsening symptom?", options: "No / Yes / Other ___" },
  { label: "Are you eating and drinking enough?", options: "Yes / Some / No / Other ___" },
  { label: "Have you been able to get out of bed safely?", options: "Yes / No / Not tried / Other ___" },
  { label: "Any pain, dizziness, breathing trouble, weakness, or confusion?", options: "No / Pain / Dizziness / Breathing trouble / Weakness / Confusion / Other ___" },
  { label: "What is your main concern today?", options: "___" }
];

const genericLocalExamItems = [
  { label: "General appearance", options: "Comfortable / Uncomfortable / Toxic appearing / Other ___" },
  { label: "Work of breathing", options: "Normal / Mildly increased / Markedly increased" },
  { label: "Mental status", options: "Alert / Confused / Somnolent / Other ___" }
];

const contextualBackfillQuestionBanks = [
  {
    id: "infection-source",
    match: /\b(?:fever|febrile|infection|infectious|sepsis|pneumonia|source|cellulitis|meningitis)\b/i,
    questions: [
      { label: "When did the fever or chills start, and how high was the temperature?", options: "No measured fever / Less than 39 C / 39 C or higher / Chills or rigors / Unsure / Other ___" },
      { label: "Any cough, sputum, shortness of breath, pain with breathing, or new oxygen need?", options: "No / Cough / Sputum / Shortness of breath / Pain with breathing / Oxygen need / Other ___" },
      { label: "Any burning with urination, urinary frequency, flank pain, dark urine, or very low urine?", options: "No / Burning / Frequency / Flank pain / Dark urine / Low urine / Other ___" },
      { label: "Any new rash, wound, skin redness, drainage, line pain, tube pain, or skin tenderness?", options: "No / Rash / Wound / Redness / Drainage / Line or tube concern / Other ___" },
      { label: "Any belly pain, vomiting, diarrhea, severe headache, stiff neck, confusion, or hot swollen joint?", options: "No / Belly pain / Vomiting or diarrhea / Severe headache or stiff neck / Confusion / Hot swollen joint / Other ___" },
      { label: "Any immune suppression, pregnancy possibility, recent procedure, hospital stay, antibiotics, sick contact, travel, or bite exposure?", options: "No / Immune suppression / Pregnancy possible / Procedure or hospital stay / Antibiotics / Sick contact / Travel or bite exposure / Other ___" }
    ]
  },
  {
    id: "cardiopulmonary",
    match: /\b(?:dyspnea|shortness of breath|heart failure|chest pain|palpitations|syncope|presyncope|hypoxia|pneumothorax|pulmonary embolism|pe\b|orthopnea|pnd|edema)\b/i,
    questions: [
      { label: "Is breathing worse at rest, with walking, or when lying flat?", options: "No breathing trouble / With walking / At rest / Lying flat / Wakes from sleep / Other ___" },
      { label: "Any chest pressure, sharp pain with breathing, palpitations, fainting, or near-fainting?", options: "No / Pressure / Pleuritic pain / Palpitations / Fainting / Near-fainting / Other ___" },
      { label: "Any new cough, sputum, wheezing, fever, coughing blood, or sick respiratory contact?", options: "No / Cough / Sputum / Wheezing / Fever / Blood / Sick contact / Other ___" },
      { label: "Any one-sided leg swelling, calf pain, recent surgery, long travel, cancer, estrogen use, or prior clot?", options: "No / Leg swelling / Calf pain / Surgery or travel / Cancer / Estrogen / Prior clot / Other ___" },
      { label: "Any new swelling, rapid weight gain, less urine, dizziness, or trouble tolerating fluids?", options: "No / Swelling / Weight gain / Low urine / Dizziness / Poor intake / Other ___" },
      { label: "What activity can you do now compared with baseline?", options: "Baseline / Less than baseline / Bedbound / Cannot tell / Other ___" }
    ]
  },
  {
    id: "abdominal-gu",
    match: /\b(?:abdominal|abdomen|belly|stomach|cramp|nausea|vomiting|diarrhea|constipation|gi bleed|melena|hematochezia|dysuria|urinary|flank|renal|scrotal|testicular|pelvic|menstrual)\b/i,
    questions: [
      { label: "Where is the pain or discomfort strongest, and has it moved?", options: "No pain / Upper abdomen / Lower abdomen / One side / Flank or back / Moved location / Other ___" },
      { label: "Any vomiting, diarrhea, constipation, black stool, bloody stool, jaundice, or inability to pass gas?", options: "No / Vomiting / Diarrhea / Constipation / Black stool / Bloody stool / Jaundice / No gas / Other ___" },
      { label: "Any burning with urination, frequency, urgency, flank pain, blood in urine, or reduced urine?", options: "No / Burning / Frequency or urgency / Flank pain / Blood in urine / Reduced urine / Other ___" },
      { label: "Any fever, chills, fainting, severe worsening pain, chest discomfort, or shortness of breath?", options: "No / Fever or chills / Fainting / Severe worsening / Chest discomfort / Shortness of breath / Other ___" },
      { label: "Any pregnancy possibility, pelvic pain, vaginal bleeding, discharge, scrotal pain, or genital symptoms?", options: "No / Pregnancy possible / Pelvic pain / Bleeding / Discharge / Scrotal pain / Genital symptoms / Other ___" },
      { label: "Are you able to keep down fluids and medications?", options: "Yes / Some / No / Not tried / Other ___" }
    ]
  },
  {
    id: "neuro",
    match: /\b(?:stroke|weakness|facial droop|aphasia|seizure|headache|vertigo|dizziness|ataxia|gait|numbness|tingling|vision|diplopia|memory|tremor|cord compression|back pain)\b/i,
    questions: [
      { label: "When were you last completely normal before this symptom started?", options: "Less than 4.5 hours / Today / Yesterday / More than 24 hours / Unsure / Other ___" },
      { label: "Any face droop, speech trouble, vision loss, double vision, weakness, numbness, or trouble walking?", options: "No / Face droop / Speech trouble / Vision loss / Double vision / Weakness / Numbness / Walking trouble / Other ___" },
      { label: "Any severe headache, neck stiffness, seizure, confusion, fainting, or recent head injury?", options: "No / Severe headache / Neck stiffness / Seizure / Confusion / Fainting / Head injury / Other ___" },
      { label: "Any new back pain with leg weakness, numb groin area, bladder trouble, bowel trouble, fever, or cancer history?", options: "No / Leg weakness / Numb groin area / Bladder trouble / Bowel trouble / Fever / Cancer history / Other ___" },
      { label: "Can you safely sit, stand, and walk compared with baseline?", options: "Baseline / Needs help / Cannot stand / Not safe to try / Other ___" },
      { label: "Are symptoms constant, coming and going, or triggered by position or movement?", options: "Constant / Comes and goes / Position triggered / Movement triggered / Unsure / Other ___" }
    ]
  },
  {
    id: "metabolic-endocrine",
    match: /\b(?:diabetes|dka|hhs|hyperglycemia|hypoglycemia|thyroid|adrenal|cortisol|calcium|sodium|hyponatremia|hypercalcemia|pituitary|acromegaly|cushing|osteoporosis|vitamin d|hypogonadism|amenorrhea|hirsutism|gynecomastia|infertility|polyuria|polydipsia)\b/i,
    questions: [
      { label: "Any new confusion, severe weakness, dizziness, fainting, seizure, or inability to stay awake?", options: "No / Confusion / Severe weakness / Dizziness / Fainting / Seizure / Very sleepy / Other ___" },
      { label: "Any vomiting, poor intake, missed medicines, steroid use, infection symptoms, or recent medication change?", options: "No / Vomiting / Poor intake / Missed medicines / Steroid use / Infection symptoms / Medication change / Other ___" },
      { label: "Any excessive thirst, frequent urination, very low urine, swelling, cramps, constipation, or palpitations?", options: "No / Thirst / Frequent urination / Low urine / Swelling / Cramps / Constipation / Palpitations / Other ___" },
      { label: "Any heat intolerance, cold intolerance, sweating, tremor, neck swelling, voice change, or trouble swallowing?", options: "No / Heat intolerance / Cold intolerance / Sweating / Tremor / Neck swelling / Voice change / Trouble swallowing / Other ___" },
      { label: "Any numb feet, foot wound, skin infection, fall, fracture, bone pain, or new vision change?", options: "No / Numb feet / Foot wound / Skin infection / Fall / Fracture / Bone pain / Vision change / Other ___" },
      { label: "Do you have access to needed medicines, supplies, food, fluids, and follow-up?", options: "Yes / Missing medicine / Missing supplies / Food or fluids problem / Follow-up problem / Other ___" }
    ]
  },
  {
    id: "skin-heent",
    match: /\b(?:rash|skin|hives|urticaria|pruritus|itching|ulcer|wound|mole|hair loss|throat|pharyngitis|ear|otalgia|nasal|sinus|eye redness|conjunctiva|vision)\b/i,
    questions: [
      { label: "When did the skin, eye, ear, nose, or throat symptom start, and is it spreading or worsening?", options: "Improving / Same / Worsening / Spreading / Unsure / Other ___" },
      { label: "Any fever, severe pain, trouble breathing, trouble swallowing, vision change, eye pain, or light sensitivity?", options: "No / Fever / Severe pain / Breathing trouble / Swallowing trouble / Vision change / Eye pain / Light sensitivity / Other ___" },
      { label: "Any mouth sores, genital sores, skin peeling, facial swelling, joint pain, or swollen glands?", options: "No / Mouth sores / Genital sores / Skin peeling / Facial swelling / Joint pain / Swollen glands / Other ___" },
      { label: "Any new medicine, antibiotic, vaccine, food, plant, animal, bite, travel, or sick contact exposure?", options: "No / New medicine / Antibiotic / Vaccine / Food / Plant or animal / Bite / Travel / Sick contact / Other ___" },
      { label: "Any wound drainage, line or device pain, rapidly expanding redness, numbness, or weakness?", options: "No / Drainage / Line or device pain / Expanding redness / Numbness / Weakness / Other ___" },
      { label: "Any immune suppression, diabetes, pregnancy possibility, contact lens use, or recurrent infections?", options: "No / Immune suppression / Diabetes / Pregnancy possible / Contact lens use / Recurrent infections / Other ___" }
    ]
  },
  {
    id: "musculoskeletal",
    match: /\b(?:joint|arthralgia|muscle|myalgia|cramp|neck pain|back pain|bone|osteoporosis|osteomalacia|fall|fracture|swelling|stiffness)\b/i,
    questions: [
      { label: "Where is the pain or stiffness, and did it follow trauma, exertion, or a fall?", options: "No trauma / Trauma / Exertion / Fall / Unsure / Other ___" },
      { label: "Any fever, weight loss, cancer history, steroid use, injection drug use, or immune suppression?", options: "No / Fever / Weight loss / Cancer history / Steroids / Injection drug use / Immune suppression / Other ___" },
      { label: "Any weakness, numbness, bladder trouble, bowel trouble, numb groin area, or trouble walking?", options: "No / Weakness / Numbness / Bladder trouble / Bowel trouble / Numb groin area / Walking trouble / Other ___" },
      { label: "Any hot swollen joint, morning stiffness, rash, eye pain, mouth ulcers, or recent infection?", options: "No / Hot swollen joint / Morning stiffness / Rash / Eye pain / Mouth ulcers / Recent infection / Other ___" },
      { label: "What movement or activity is limited compared with baseline?", options: "None / Walking / Stairs / Dressing / Reaching / Grip / Bed mobility / Other ___" },
      { label: "What has helped or worsened the symptom today?", options: "Nothing tried / Rest helps / Movement worsens / Medicine helps / Medicine not helping / Other ___" }
    ]
  }
];

const contextualBackfillMetadataByBank = {
  "infection-source": {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "source-localizing diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for source, acuity, host risk, and management-changing infectious danger patterns when the installed workup has fewer than the bedside checklist target number of questions.",
    managementImplication: "Positive answers route the workup toward source-directed examination, testing, escalation, isolation, antimicrobial framing, or outpatient safety-netting.",
    tags: ["diagnostic_safety", "source_localizing_history", "infection"]
  },
  cardiopulmonary: {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "cardiopulmonary diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for cardiopulmonary severity, trajectory, clot risk, respiratory infection, and volume/perfusion context when additional focused history is needed.",
    managementImplication: "Positive answers change cardiopulmonary exam emphasis, ECG/imaging/lab review, oxygen or diuresis strategy, clot evaluation, escalation, or safety-netting.",
    tags: ["diagnostic_safety", "cardiopulmonary", "dyspnea", "chest_pain"]
  },
  "abdominal-gu": {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "abdominal and GU diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for abdominal, renal, urinary, pelvic, obstructive, bleeding, pregnancy, and instability features when additional focused history is needed.",
    managementImplication: "Positive answers change abdominal/GU exam focus, pregnancy testing, urine or stool studies, imaging, surgical/source-control escalation, and disposition.",
    tags: ["diagnostic_safety", "abdominal_pain", "GU", "renal"]
  },
  neuro: {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "neurologic diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for time-sensitive neurologic deficits, CNS red flags, cord compression features, and functional safety when additional focused history is needed.",
    managementImplication: "Positive answers change neurologic exam scope, imaging urgency, glucose/seizure/stroke pathway review, mobility safety, and escalation.",
    tags: ["diagnostic_safety", "neuro", "red_flag"]
  },
  "metabolic-endocrine": {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "metabolic and endocrine diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for metabolic acuity, medication access, endocrine crisis, hydration, neurologic symptoms, and complication clues when additional focused history is needed.",
    managementImplication: "Positive answers change bedside glucose/electrolyte review, endocrine testing, medication safety, infection search, hydration plan, escalation, and follow-up.",
    tags: ["diagnostic_safety", "endocrine", "metabolic"]
  },
  "skin-heent": {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "skin and HEENT diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for airway, mucosal, ocular, skin, exposure, and infection danger patterns when additional focused history is needed.",
    managementImplication: "Positive answers change eye/HEENT/skin exam focus, isolation, medication reaction review, infection source control, specialist referral, and escalation.",
    tags: ["diagnostic_safety", "skin", "HEENT"]
  },
  musculoskeletal: {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "musculoskeletal diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for trauma, infection, inflammatory disease, neurologic compromise, function, and medication response when additional focused history is needed.",
    managementImplication: "Positive answers change joint/spine/limb exam focus, imaging threshold, aspiration or antimicrobial urgency, mobility safety, consultation, and disposition.",
    tags: ["diagnostic_safety", "MSK", "red_flag"]
  },
  generic: {
    source_id: "AHRQ_CALIBRATE_DX",
    source_section: "generic bedside diagnostic safety history scaffold",
    diagnosticPurpose: "Screens for interval change, new danger symptoms, oral intake, medication access, function, and patient priorities when no more specific validated history row is available.",
    managementImplication: "Positive answers change reassessment priority, focused exam selection, medication safety, escalation, discharge readiness, or safety-netting.",
    tags: ["diagnostic_safety", "generic_history"]
  }
};

function contextualBackfillQuestionWithMetadata(bank, question = {}, index = 0) {
  const metadata = contextualBackfillMetadataByBank[bank.id] || contextualBackfillMetadataByBank.generic;
  const label = question.label || question.text || "";
  return {
    ...question,
    id: `LOCAL-BACKFILL-${bank.id}-${index + 1}`,
    text: question.text || label,
    item_type: "history_question",
    diagnosticPurpose: question.diagnosticPurpose || metadata.diagnosticPurpose,
    managementImplication: question.managementImplication || metadata.managementImplication,
    source: {
      source_id: metadata.source_id,
      source_section: metadata.source_section,
      evidence_strength: "diagnostic_safety_scaffold",
      version_date: "current",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Used only to complete a focused local checklist when validated module/recommendation history has fewer than the bedside checklist target."
    },
    tags: Array.from(new Set([...(question.tags || []), ...(metadata.tags || []), bank.id]))
  };
}

function genericLocalQuestionWithMetadata(question = {}, index = 0) {
  const metadata = contextualBackfillMetadataByBank.generic;
  const label = question.label || question.text || "";
  return {
    ...question,
    id: `LOCAL-GENERIC-${index + 1}`,
    text: question.text || label,
    item_type: "history_question",
    diagnosticPurpose: question.diagnosticPurpose || metadata.diagnosticPurpose,
    managementImplication: question.managementImplication || metadata.managementImplication,
    source: {
      source_id: metadata.source_id,
      source_section: metadata.source_section,
      evidence_strength: "diagnostic_safety_scaffold",
      version_date: "current",
      last_reviewed: "2026-06-08",
      clinical_owner: "clinical_content_lead",
      implementation_notes: "Used only as an explicit generic fallback when no more specific validated history row is available."
    },
    tags: Array.from(new Set([...(question.tags || []), ...(metadata.tags || [])]))
  };
}

function contextualWorkupText(workup = {}, options = {}) {
  const complaintResult = workup.complaintResult || {};
  const recommendation = workup.recommendation || workup.examWorkup?.recommendation || {};
  const selectedIntents = workup.selectedIntents || options.selectedIntents || [];
  const module = complaintResult.module || {};
  return [
    ...(selectedIntents || []).flatMap((intent) => [
      intent.intent_id,
      intent.label,
      ...(intent.aliases || []),
      ...(intent.clinical_bundle_ids || [])
    ]),
    module.id,
    module.label,
    ...(module.triggers || []),
    ...(recommendation.matchedTags || []),
    ...(recommendation.activeProfiles || []).flatMap((profile) => [profile.id, profile.name]),
    ...(recommendation.focusedHistoryQuestions || []).map((question) => [question.label, question.text, question.diagnosticPurpose].filter(Boolean).join(" ")),
    ...(recommendation.corePhysicalExamManeuvers || []).map((entry) => [entry.label, entry.domain, entry.reason].filter(Boolean).join(" "))
  ].filter(Boolean).join(" ");
}

function contextualBackfillQuestions(workup = {}, options = {}) {
  const text = contextualWorkupText(workup, options);
  const selectedIntents = workup.selectedIntents || options.selectedIntents || [];
  const selectedIntentIds = (selectedIntents || []).map((intent) => intent.intent_id).filter(Boolean);
  const sourceFocusedSingleInfectionIntent = selectedIntentIds.length === 1 && selectedIntentIds.includes("fever_sepsis_v1");
  const selected = contextualBackfillQuestionBanks
    .filter((bank) => bank.match.test(text))
    .filter((bank) => !sourceFocusedSingleInfectionIntent || bank.id === "infection-source")
    .flatMap((bank) => bank.questions.map((question, index) => contextualBackfillQuestionWithMetadata(bank, question, index)));
  const universal = [
    { label: "How has the main symptom changed since yesterday or since it started?", options: "Better / Same / Worse / New severe symptom / Other ___" },
    { label: "Any new trouble breathing, chest pain, fainting, confusion, severe weakness, or uncontrolled pain?", options: "No / Trouble breathing / Chest pain / Fainting / Confusion / Severe weakness / Uncontrolled pain / Other ___" },
    { label: "Are you eating, drinking, urinating, and taking needed medicines as expected?", options: "Yes / Poor intake / Low urine / Missed medicines / Cannot keep medicines down / Other ___" },
    { label: "Have you been able to get up, walk, and function safely compared with baseline?", options: "Baseline / Needs help / Not safe / Not tried / Other ___" },
    { label: "What is the most important change or concern you want the team to know today?", options: "___" }
  ].map((question, index) => genericLocalQuestionWithMetadata(question, index));
  return [...selected, ...universal];
}

export function localChecklistTraceEntriesFromWorkup(workup = {}, options = {}) {
  const complaintResult = workup.complaintResult || {};
  const recommendation = workup.recommendation || workup.examWorkup?.recommendation || {};
  const allowContextualBackfill = options.allowContextualBackfill !== false;
  return [
    ...(complaintResult.requiredQuestions || []),
    ...(complaintResult.conditionalQuestions || []),
    ...(complaintResult.focusedExam || []),
    ...(complaintResult.requiredExam || []),
    ...(complaintResult.conditionalExam || []),
    ...(recommendation.focusedHistoryQuestions || []),
    ...(recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []),
    ...(recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []),
    ...(allowContextualBackfill ? contextualBackfillQuestions(workup, options) : []),
    ...(options.allowGenericFallbacks ? genericLocalBedsideQuestions.map(genericLocalQuestionWithMetadata) : [])
  ];
}

export function buildLocalChecklistFromWorkup(workup = {}, options = {}) {
  const complaintResult = workup.complaintResult || {};
  const recommendation = workup.recommendation || workup.examWorkup?.recommendation || {};
  const allowGenericFallbacks = Boolean(options.allowGenericFallbacks);
  const allowContextualBackfill = options.allowContextualBackfill !== false;
  const maxBedsideQuestions = Math.max(5, Math.min(Number(options.maxBedsideQuestions) || 8, 8));
  const maxExamItems = Math.max(8, Math.min(Number(options.maxExamItems) || 18, 22));
  const includeSafetyInExamChecklist = Boolean(options.includeSafetyInExamChecklist);

  const bedsideItems = [];
  const bedsideSeen = new Set();
  [
    ...(complaintResult.requiredQuestions || []),
    ...(complaintResult.conditionalQuestions || []),
    ...(recommendation.focusedHistoryQuestions || [])
  ].forEach((item) => addUniqueChecklistItem(bedsideItems, bedsideSeen, item, "bedside"));
  if (allowContextualBackfill) {
    const backfillContextText = contextualWorkupText(workup, options);
    const backfillTarget = /\b(?:fever|febrile|infection|infectious|sepsis|pneumonia|source|cellulitis|meningitis)\b/i.test(backfillContextText)
      ? Math.min(8, maxBedsideQuestions)
      : Math.min(6, maxBedsideQuestions);
    contextualBackfillQuestions(workup, options).forEach((item) => {
      if (bedsideItems.length < backfillTarget) {
        addUniqueChecklistItem(bedsideItems, bedsideSeen, item, "bedside");
      }
    });
  }
  if (allowGenericFallbacks) {
    genericLocalBedsideQuestions.forEach((item) => {
      if (bedsideItems.length < 6) {
        addUniqueChecklistItem(bedsideItems, bedsideSeen, item, "bedside");
      }
    });
  }

  const safetyItems = [];
  const coreExamItems = [];
  const conditionalExamItems = [];
  const examSeen = new Set();
  (recommendation.basicSafetyChecks || []).forEach((entry) => {
    addUniqueChecklistItem(safetyItems, examSeen, recommendationExamItem(entry), "exam");
  });
  (complaintResult.focusedExam || []).forEach((item) => {
    addUniqueChecklistItem(coreExamItems, examSeen, item, "exam");
  });
  (recommendation.corePhysicalExamManeuvers || recommendation.coreItems || []).forEach((entry) => {
    addUniqueChecklistItem(coreExamItems, examSeen, recommendationExamItem(entry), "exam");
  });
  (recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || []).forEach((entry) => {
    addUniqueChecklistItem(conditionalExamItems, examSeen, recommendationExamItem(entry), "exam");
  });
  if (allowGenericFallbacks) {
    genericLocalExamItems.forEach((item) => {
      if (safetyItems.length + coreExamItems.length + conditionalExamItems.length < 8) {
        addUniqueChecklistItem(safetyItems, examSeen, item, "exam");
      }
    });
  }

  if (!bedsideItems.length || !(safetyItems.length || coreExamItems.length || conditionalExamItems.length)) {
    return "";
  }

  const selectedBedsideItems = bedsideItems.slice(0, maxBedsideQuestions);
  let remainingExamSlots = maxExamItems;
  const selectedSafetyItems = includeSafetyInExamChecklist ? safetyItems.slice(0, remainingExamSlots) : [];
  remainingExamSlots -= selectedSafetyItems.length;
  const selectedCoreExamItems = coreExamItems.slice(0, remainingExamSlots);
  remainingExamSlots -= selectedCoreExamItems.length;
  const selectedConditionalExamItems = conditionalExamItems.slice(0, remainingExamSlots);

  const lines = [bedsideParentTitle, "FOCUSED HISTORY"];
  selectedBedsideItems.forEach((item) => {
    lines.push(`${item.label}: ${item.options}`);
  });
  lines.push("", examParentTitle, "");
  appendChecklistSection(lines, "BASIC DATA AND SAFETY", selectedSafetyItems);
  appendChecklistSection(lines, "CORE BEDSIDE EXAM", selectedCoreExamItems);
  appendChecklistSection(lines, "CONDITIONAL ADD ONS", selectedConditionalExamItems);

  return normalizeChecklistText(lines.join("\n")).trim();
}

export function buildCleanupPrompt(rawChecklist, auditResult, options = {}) {
  const issueText = auditResult?.issues?.length
    ? auditResult.issues.map((issue) => `- ${issue.message}`).join("\n")
    : "- Shorten and organize the checklist into the required bedside-first format.";
  const userContext = options.userContext || "";

  return `You are an experienced attending physician and clerkship coach. Rewrite the checklist below so it is shorter, bedside-first, and fully parseable by a checklist app.${userContext ? `\n\n${userContext}` : ""}

Fix these issues:
${issueText}

Rules:
${checklistContract}

Checklist to rewrite:
${String(rawChecklist || "").trim()}`;
}
