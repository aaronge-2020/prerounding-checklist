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
These are patient-relevant examples from the student's learned physical exam toolkit. This reference is not exhaustive and is not a restriction.
Do not limit yourself to this reference. Use it as a floor, not a ceiling. If an additional bedside exam finding is clinically important, evidence-based, safe, and feasible for a third-year medical student, include it even if it is not listed here.
Use the reference to avoid missing student-performable maneuvers, then choose the final concise exam checklist from patient-specific reasoning plus this reference.`;

export const checklistPrompt = `I am a third-year medical student preparing for inpatient rounds. Based on the patient context already available in this OpenEvidence conversation, please create a focused bedside pre-rounding checklist I can use today.

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
- Include vital signs, devices/support, volume status, cardiopulmonary status, abdominal findings, neurologic findings, wounds/lines/drains, functional safety, or other problem-specific findings only when relevant.
- Use the student exam reference below as a completeness check for exam maneuvers I have learned, but do not restrict yourself to it. Add other clinically important, evidence-based, safe, bedside-feasible exam findings when they matter for this patient.
- Write documentation-ready findings, not technique instructions.

If a <retrieved_evidence_candidates> block is present, treat it as a prioritized evidence-seeded starting point and completeness check, not as an exclusive list. Prefer relevant candidate bedside question labels/options and targeted exam labels/options when they fit the patient, but improve unclear wording, change options when clinically better, and add any missing evidence-based, safe, bedside-feasible questions or exam maneuvers needed to cover the patient's active problems and red flags. Do not copy low-relevance candidates merely because they were retrieved. Do not include citations or rationale text in the final checklist.

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
VITAL SIGNS AND SUPPORT
Respiratory rate: ___
Oxygen support and flow rate: Room air / Nasal cannula / Face mask / Ventilator / Other ___
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
  if (/\b(?:VITAL|SUPPORT|EXAM|CARDIAC|CARDIOPULMONARY|PULMONARY|RESPIRATORY|ABDOMINAL|VOLUME|SKIN|LINE|LINES|WOUND|WOUNDS|FOOT|FEET|NEURO|NEUROLOGIC|MUSCULOSKELETAL|STRENGTH|REFLEX|SENSORY|CRANIAL|FUNCTIONAL SAFETY|DEVICE|DRAIN)\b/.test(normalized)) {
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
  return /\b(?:squeeze|lift|wiggle|count\s+(?:aloud|out loud)|count\s+to|cough|stick\s+out|tongue|palate|gag|reflex|strength|babinski|clonus|hoffmann|follow\s+(?:my|your)|finger-to-nose|walk|stand)\b/i.test(label);
}

export function hasBadBlankFormat(item) {
  const rawValue = item.rawValue || "";
  return /_{2,3}\s*\/\s*(?:\d|_|[A-Za-z])/.test(rawValue) ||
    /_{2,3}[\s\S]*\/[\s\S]*(?:\S)/.test(rawValue) && !/\/[^/]*_{2,3}\s*$/.test(rawValue);
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
