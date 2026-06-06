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

const studentExamReferenceFallback = `<student_exam_reference>
Use this as a compact fallback reference for exam maneuvers the student has learned and can reliably perform. This is not the full universe of useful physical exam findings.
Do not limit yourself to this reference. Use it as a floor, not a ceiling. If an additional bedside exam finding is clinically important, evidence-based, safe, and feasible for a third-year medical student, include it even if it is not listed here.
Do not output the whole reference. Select only the exam domains that match the patient's active problems, risks, abnormal data, treatments, or consult question.

Core exam domains:
VITAL SIGNS AND SUPPORT: temperature, heart rate, respiratory rate, blood pressure, oxygen saturation, oxygen or ventilatory support, pain score, intake/output when relevant.
GENERAL AND VOLUME: distress, mental status, appearance, mucous membranes, JVP, edema, capillary refill, skin turgor, weight trend when relevant.
CARDIOPULMONARY: work of breathing, anterior/posterior/lateral lung sounds, wheezes/crackles/rhonchi/diminished bases, heart rhythm, murmurs/rubs/gallops, peripheral pulses, lower-extremity edema.
ABDOMINAL AND RENAL: distension, tenderness, rebound/guarding, bowel sounds, hepatosplenomegaly when relevant, Murphy sign, CVA tenderness, bladder distension, graft tenderness for renal transplant.
NEUROLOGIC CRANIAL NERVES: visual acuity, visual fields, pupils, extraocular movements, facial sensation, facial symmetry, hearing screen, palate elevation, tongue protrusion, shoulder shrug.
NEUROLOGIC MOTOR: pronator drift, deltoid, biceps, triceps, wrist extension/flexion, grip, finger abduction, hip flexion, knee extension/flexion, ankle dorsiflexion/plantarflexion.
NEUROLOGIC SENSORY: light touch, pinprick, vibration, proprioception, sensory level, symmetric distal sensation.
NEUROLOGIC REFLEXES AND COORDINATION: biceps, brachioradialis, triceps, patellar, Achilles, Babinski, clonus, finger-to-nose, rapid alternating movements, heel-to-shin, gait, Romberg.
HEENT AND ENDOCRINE-RELEVANT: sclera/conjunctiva, oral mucosa, oropharynx, thyroid inspection/palpation, cervical/supraclavicular lymph nodes, visual fields for pituitary/optic concerns.
MUSCULOSKELETAL: focused joint inspection, palpation, range of motion, swelling, deformity, tenderness, warmth, shoulder impingement tests, wrist carpal tunnel tests, straight-leg raise, knee effusion/laxity tests, spine range of motion when relevant.
SKIN WOUNDS LINES AND SAFETY: rashes, petechiae/bruising, ulcers, diabetic foot wounds, sacrum/heels, IV/central line site, surgical wounds, drains, bleeding, infection signs, fall-risk mobility screen.

Selection rules:
For neurologic weakness, numbness, spine disease, altered mental status, pituitary/visual symptoms, stroke, seizure, or neuromuscular disease, choose focused neurologic sections from cranial nerves, motor, sensory, reflexes, coordination, and gait rather than a generic neuro exam.
For dyspnea, hypoxia, pneumonia, asthma/COPD, heart failure, hypercapnia, or respiratory support, include respiratory effort, oxygen support, lung fields, single-breath count only if neuromuscular or ventilatory weakness is relevant, and volume/cardiac signs when relevant.
For chest pain, arrhythmia, heart failure, hypertension, syncope, or edema, include cardiopulmonary and vascular/volume findings such as rhythm, murmurs, JVP, pulses, edema, and lung crackles.
For abdominal pain, infection, GI bleeding, diarrhea, renal colic, urinary symptoms, transplant, or AKI, include abdominal tenderness/distension, peritoneal signs only when relevant, CVA tenderness, volume status, and graft tenderness for kidney transplant.
For diabetes, DKA, endocrine, steroid, thyroid, adrenal, pituitary, or electrolyte cases, include volume status, mental status, thyroid/neck findings when relevant, foot/skin findings when relevant, visual fields for sellar disease, and injection/IV site checks when treatments make them safety-critical.
For anticoagulation, thrombocytopenia, anemia, heparin, GI bleed risk, or falling hemoglobin, include bleeding-focused skin and mucosal findings such as petechiae, bruising, melena report belongs in bedside questions, and IV/surgical-site bleeding when relevant.
For musculoskeletal or pain complaints, include the affected joint or spine inspection, palpation, range of motion, neurovascular status distal to injury, and only the special maneuvers that directly test the suspected problem.

Documentation option style:
Prefer finding labels that document the result, not how to perform the maneuver.
Good: Pupils: Equal and reactive / Unequal / Nonreactive
Good: Extraocular movements: Intact / Limited / Diplopia
Good: Shoulder range of motion: Full / Limited by pain / Unable
Good: Patellar reflexes: Absent / Diminished / Normal / Brisk / Clonus
Good: Renal graft tenderness: Absent / Present / Not applicable
Avoid: Ask patient to follow your finger, tap reflex hammer, palpate abdomen, perform straight leg raise.
Use 0 / 1 / 2 / 3 / 4 / 5 only for strength ratings. Do not write ___ / 5.
</student_exam_reference>`;

export const checklistPrompt = `<role>
You are an experienced attending physician and clerkship coach helping a third-year medical student pre-round efficiently and safely.
</role>

<task>
Create a patient-specific bedside pre-rounding checklist from the clinical context already available in this OpenEvidence conversation.
Your final answer must contain exactly two plain-text checklists:
BEDSIDE QUESTION CHECKLIST
TARGETED PHYSICAL EXAM CHECKLIST
Never omit either checklist.
</task>

<clinical_goal>
The checklist should help the student quickly determine today's clinical trajectory, severity, red flags, response to treatment, functional status, discharge readiness, and management-relevant changes.
Include only items that could affect today's rounds presentation, assessment, monitoring, treatment plan, discharge readiness, or escalation decisions.
</clinical_goal>

<content_rules>
For the bedside question checklist:
Use patient-friendly language with no medical jargon.
Write 6 to 8 direct history questions the student can say out loud to the patient.
Focus on symptoms, changes since arrival or yesterday, breathing, pain, weakness, dizziness, intake/output, bowel/bladder changes, mobility, function, safety, treatment access, discharge readiness, and patient concerns.
Do not include exam maneuvers, commands, performance tests, or clinician-observed findings.
Do not ask the patient to squeeze, lift, wiggle, count aloud, cough on command, stick out the tongue, follow your finger, walk, stand, or perform a physical exam task.
When the patient might answer outside the choices, include Other ___ as the final option.

For the targeted physical exam checklist:
First reason from the patient's active problems, abnormal vitals/labs/trends, consult question, treatments, devices/support, and likely complications.
Use broader clinical knowledge, medical literature, and bedside clinical reasoning to choose the most important exam findings.
Use the student exam reference as a completeness check for maneuvers the student has learned, but do not restrict the final exam checklist to that reference.
You may add exam items not listed in the reference when they are clinically important, evidence-based, safe, and feasible at bedside for a third-year medical student.
Use 10 to 14 focused exam items total. Never exceed 16 exam items.
Group exam items by exam system or exam type.
Use no more than 4 items in any one exam subsection.
Focus on vital signs, devices/support, volume status, cardiopulmonary status, abdominal findings, neurologic findings, wounds/lines/drains, functional safety, or other problem-specific objective findings.
Prefer grouped screening items over exhaustive right-left inventories.

If a <retrieved_evidence_candidates> block is present, it overrides the nonrestrictive student exam reference. In that case, use only candidate bedside question labels/options and targeted exam labels/options from the retrieved block, with patient-specific tailoring only when it preserves the same clinical intent. Do not invent additional bedside questions, exam maneuvers, citations, or rationale text outside the candidate list.

Do not include generic review-of-systems questions, a full head-to-toe exam, teaching, explanations, citations, caveats, or oral presentation text.
Do not mention that the note is de-identified.
</content_rules>

${studentExamReferenceFallback}

<format_contract>
${checklistContract}
</format_contract>

<output_template>
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
</output_template>

<final_self_check>
Before finalizing, silently verify:
1. Both exact parent checklist titles are present.
2. There is at least one bedside subsection and one exam subsection.
3. Every bedside label is a patient-facing question ending in ?.
4. No bedside item asks the patient to perform an exam maneuver.
5. The bedside checklist has 6 to 8 items.
6. The targeted physical exam checklist has 10 to 14 items and no more than 16 items.
7. No exam subsection contains more than 4 items.
8. Every item is parseable as Label: options.
9. No item uses ___ / 5, ___ / 10, ___ / ___, or a blank before another slash option.
</final_self_check>`;

export const newAdmissionChecklistPrompt = `${checklistPrompt}

<context_type>
No prior SOAP note is available. The patient is newly admitted or being admitted now.
</context_type>

<new_patient_history_goal>
Use the bedside questions to fill the highest-yield remaining gaps for a full first-history admission write-up: chief complaint, HPI timing and symptom character, relevant PMH, medications, allergies, surgical history, health maintenance, family history, social history, ROS positives and negatives, function, safety, and patient concerns.
Prefer broad, patient-friendly questions with structured answer choices so the student can capture a lot with minimal typing.
</new_patient_history_goal>`;

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

  if (examItems.length > 16) {
    issues.push({ type: "exam-count-high", message: `Focused exam has ${examItems.length} items. Aim for 10 to 14 and never more than 16.` });
  }

  examSections.forEach((section) => {
    if (section.items.length > 4) {
      issues.push({ type: "exam-section-long", message: `${section.title} has ${section.items.length} exam items. Keep each exam section to 4 or fewer.` });
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
