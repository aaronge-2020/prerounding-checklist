const TWO_COLUMN_HEADER_REGEX = /Diagnostic and Objective Findings\s*[\t|]\s*Assessment and Plan/i;

const KNOWN_SYSTEMS = new Set([
  "neuro", "neurologic", "neurology", "neurosurgery", "cv", "cardiovascular", "cardiology", "cardio", "cards",
  "pulm", "pulmonary", "pulmonology", "renal", "nephrology", "heme",
  "hematology", "heme / onc", "heme/onc", "oncology", "id", "infectious", "infectious disease",
  "gi / nutrition", "gi/nutrition", "gi", "gastrointestinal", "endo",
  "endocrine", "endocrinology", "msk / derm", "msk/derm", "msk", "derm",
  "dermatology", "prophylaxis", "fen"
]);

// Headers that introduce a flat problem list: every bullet underneath becomes
// its own problem, while non-bullet lines (for example a "Diagnosis"
// subheader) are skipped instead of turning into context or plans.
const PROBLEM_LIST_HEADERS = new Set([
  "active hospital problems",
  "active problems",
  "hospital problems",
  "principal problems",
  "problem list",
  "problems"
]);

// Titles that mean "no problem here" (for example "ID:" followed by "NAI")
// and must never become problem entries.
const NEGATED_PROBLEM_TITLE = /^(?:nai|na|n[/]a|none|no active (?:issues?|problems?)|no issues?|not applicable|negative|unremarkable|no acute issues?)[.]?$/i;

const LAB_OR_LDA_ROW = /^\s*\t\s*(?:\[(?:Lab|LATEST|Hospital\s+Day|\d+\s+days?\s+prior)|Component\t|\d{1,2}\/\d{1,2}\/\d{2,4}|Peripheral IV|Urinary Catheter|Non-Surgical Airway|Arterial Line|CVC|PICC|Chest Tube|JP|Jackson|Drain|Airway|Endotracheal|HGBA1C)/i;
const NOT_PLAN_TEXT = /^(?:none|no data recorded|no active orders?|\[lab\s*\d+\/\d+\]|component\b|\d{1,2}\/\d{1,2}\/\d{2,4}|[a-z0-9_,\s]+\t+(?:--|\d|\+|-|negative|positive|clear|trace|normal))/i;

const SPECIALTY_PLAN_HEADER = /^[A-Za-z\s/]+plan\s*:?$/i;
const LDA_START_REGEX = /^(?:patient\s+)?lines[\s/]+drains[\s/]+airways|active\s+(?:active\s+)?ldas/i;

// Verbs (and verb-led phrases) that open an action/recommendation sentence
// rather than a problem title: "Continue vancomycin", "We will obtain...",
// "The patient needs...". Used to tell a bare numbered recommendation list
// ("1. Continue with vancomycin...") apart from a problem list whose items
// carry their own titles ("1. Diabetes mellitus type 1: We will...").
const ACTION_LEAD = /^(?:continue|resume|re-?start|begin|stop|hold|withhold|discontinue|d\/c|wean|titrate|increase|decrease|adjust|monitor|watch|check|obtain|get|order|send|repeat|recheck|follow|reassess|re-?evaluate|evaluate|assess|consult|refer|recommend|advise|counsel|educate|encourage|discuss|review|ensure|provide|give|administer|prescribe|add|change|switch|maintain|avoid|consider|plan|schedule|arrange|admit|discharge|transfer|agree|we\s+will|i\s+will|the\s+patient\s+(?:needs|requires|should|will))\b/i;

// Labels that look like "Title: ..." but are not problems ("Differential:
// ...", "Assessment: ...").
const NON_PROBLEM_LABEL = /^(?:differential|differentials|ddx|assessment|plan|impression|recommendations?|diagnos[ie]s|treatments?)$/i;

// Professional sign-off paragraphs ("As always, we greatly appreciate...")
// that close consult notes. They are courtesy text, never problems or plans.
const SIGNOFF_LEAD = /^(?:as\s+always[\s,]|we\s+(?:greatly\s+)?appreciate|thank\s+you\s+for|please\s+(?:do\s+not\s+hesitate|feel\s+free|contact)|sincerely|respectfully)[\s,]/i;

function firstSentence(text) {
  const match = String(text || "").match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : String(text || "")).trim();
}

/** Drops professional sign-off paragraphs from plan/consult text. */
export function stripSignoffParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .filter((para) => {
      const first = para.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
      return !SIGNOFF_LEAD.test(first);
    })
    .join("\n\n");
}

/**
 * Splits plan/assessment text into top-level numbered items
 * ("1. ...", "2. ..."). Non-numbered lines attach to the current item;
 * text before the first number is ignored.
 */
export function extractNumberedPlanItems(text) {
  const items = [];
  let current = null;
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const marker = line.match(/^(\d{1,2}[.:])\s*(\S[\s\S]*)$/);
    if (marker) {
      current = { marker: marker[1], text: marker[2].trim() };
      items.push(current);
    } else if (current) {
      current.text = `${current.text}\n${line}`.trim();
    }
  }
  return items;
}

/**
 * True when a numbered plan item is a bare recommendation/action rather than
 * a problem carrying its own title. "1. Continue with vancomycin..." is a
 * bare action; "1. Diabetes mellitus type 1: We will..." and "2. Followup
 * scooter accident. Lacerations..." are problem-titled.
 */
export function isBareActionItem(itemText) {
  const text = String(itemText || "").trim();
  if (!text) return true;
  const colon = text.match(/^([^:]{3,60}):\s*\S/);
  if (colon && !NON_PROBLEM_LABEL.test(colon[1].trim())) return false;
  const first = firstSentence(text);
  const rest = text.slice(first.length).trim();
  if (rest && first.length <= 60 && !ACTION_LEAD.test(first)) return false;
  return true;
}

/**
 * True when the first line of a raw plan block opens a new problem entry:
 * a number/hash/system marker, a "Problem: details" colon title, or a short
 * noun-led first sentence followed by more text.
 */
function blockOpensProblem(firstLine) {
  const line = String(firstLine || "").trim();
  if (!line) return false;
  if (/^(?:#+\s*|(?:problem\s*\d+\s*[:.]|\d{1,2}[.:])\s*[a-zA-Z])/i.test(line)) return true;
  const clean = line.replace(/^#+\s*/, "").replace(/^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*/i, "").trim();
  const cleanNoColon = clean.replace(/[:\s]+$/, "");
  if (KNOWN_SYSTEMS.has(cleanNoColon.replace(/\s+plan$/i, "").toLowerCase())) return true;
  if (SPECIALTY_PLAN_HEADER.test(clean)) return true;
  if (PROBLEM_LIST_HEADERS.has(cleanNoColon.toLowerCase())) return true;
  const colon = clean.match(/^([^:]{3,60}):\s*\S/);
  if (colon && !NON_PROBLEM_LABEL.test(colon[1].trim())) return true;
  const first = firstSentence(clean);
  const rest = clean.slice(first.length).trim();
  if (rest && first.length <= 60 && !ACTION_LEAD.test(first)) return true;
  return false;
}

/**
 * Normalizes two-column EHR table formats (such as Epic's Diagnostic and Objective Findings / Assessment and Plan)
 * into cleanly separated clinical sections with standard headings.
 */
export function normalizeTwoColumnEhrText(fullText) {
  if (!fullText || typeof fullText !== "string") return "";
  if (!TWO_COLUMN_HEADER_REGEX.test(fullText)) {
    return fullText;
  }

  const lines = fullText.split(/\r?\n/);
  const resultLines = [];
  let inTwoColumn = false;
  let objectiveLines = [];
  let ldaLines = [];
  let planLines = [];
  let currentColumn = "objective"; // "objective", "lda", "plan"
  let currentSystem = "";

  const flushTwoColumn = () => {
    if (objectiveLines.length > 0) {
      resultLines.push("Objective:");
      resultLines.push(...objectiveLines);
      resultLines.push("");
      objectiveLines = [];
    }
    if (ldaLines.length > 0) {
      resultLines.push("Lines drains airways:");
      resultLines.push(...ldaLines);
      resultLines.push("");
      ldaLines = [];
    }
    if (planLines.length > 0) {
      resultLines.push("Plan:");
      resultLines.push(...planLines);
      resultLines.push("");
      planLines = [];
    }
    inTwoColumn = false;
    currentColumn = "objective";
    currentSystem = "";
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check for 2-column table header
    if (TWO_COLUMN_HEADER_REGEX.test(trimmed)) {
      if (inTwoColumn) flushTwoColumn();
      inTwoColumn = true;
      currentColumn = "objective";
      continue;
    }

    if (!inTwoColumn) {
      resultLines.push(rawLine);
      continue;
    }

    // Inside 2-column mode:
    // Check if line exits 2-column mode (e.g. specialty team plan like Neurosurgery plan:)
    if (SPECIALTY_PLAN_HEADER.test(trimmed)) {
      flushTwoColumn();
      resultLines.push(rawLine);
      continue;
    }

    // Check if line starts a system row: 'Neuro\t...' or 'CV\t...'
    const tabIndex = rawLine.indexOf("\t");
    const firstCell = (tabIndex !== -1 ? rawLine.slice(0, tabIndex) : rawLine).trim().toLowerCase();

    if (KNOWN_SYSTEMS.has(firstCell)) {
      currentSystem = (tabIndex !== -1 ? rawLine.slice(0, tabIndex) : rawLine).trim();
      currentColumn = "objective";
      const rest = tabIndex !== -1 ? rawLine.slice(tabIndex + 1) : "";

      // Check if this same line also has a second tab leading to the plan column
      const secondTab = rest.indexOf("\t");
      if (secondTab !== -1) {
        const objPart = rest.slice(0, secondTab).trim();
        const planPart = rest.slice(secondTab + 1).trim();
        if (objPart) objectiveLines.push(`${currentSystem}: ${objPart}`);
        else objectiveLines.push(`${currentSystem}:`);
        if (planPart && !NOT_PLAN_TEXT.test(planPart)) {
          planLines.push(`${currentSystem}:`);
          planLines.push(planPart);
          currentColumn = "plan";
        }
      } else if (rest.trim()) {
        objectiveLines.push(`${currentSystem}: ${rest.trim()}`);
      } else {
        objectiveLines.push(`${currentSystem}:`);
      }
      continue;
    }

    // Check if line is LDA start
    if (LDA_START_REGEX.test(trimmed)) {
      currentColumn = "lda";
      ldaLines.push(trimmed);
      continue;
    }

    // If currently in LDA mode:
    if (currentColumn === "lda") {
      if (/^\s*(?:--\s*s\/p PEG|Central Line indication:)/i.test(rawLine)) {
        ldaLines.push(rawLine);
        continue;
      }
      if (/^--\s*Monitor for clinical signs of infection/i.test(trimmed)) {
        ldaLines.push(rawLine);
        continue;
      }
      ldaLines.push(rawLine);
      continue;
    }

    // Check if line transitions from objective to plan:
    const startsWithTab = /^\s*\t/.test(rawLine) && !LAB_OR_LDA_ROW.test(rawLine);

    if (currentColumn === "objective" && (startsWithTab || /^(?:Last\s+)?\t/.test(rawLine))) {
      const candidatePlan = rawLine.replace(/^(?:.*?\t)+/, "").trim();
      if (candidatePlan && !NOT_PLAN_TEXT.test(candidatePlan)) {
        currentColumn = "plan";
        if (currentSystem && (!planLines.length || planLines[planLines.length - 1] !== `${currentSystem}:`)) {
          planLines.push(`${currentSystem}:`);
        }
        planLines.push(candidatePlan);
        continue;
      }
    }

    if (currentColumn === "plan") {
      planLines.push(rawLine);
    } else {
      objectiveLines.push(rawLine);
    }
  }

  if (inTwoColumn) flushTwoColumn();
  return resultLines.join("\n");
}

/**
 * Splits two-column EHR tables into distinct text streams.
 */
export function splitTwoColumnEhrTables(fullText) {
  const normalized = normalizeTwoColumnEhrText(fullText);
  // Extract objective, lda, and plan sections
  return {
    normalizedText: normalized
  };
}

const DIAGNOSTIC_KEYWORDS = /\b(?:work\s*up|workup|mri|ct|cth|cta|dect|eeg|cveeg|echo|tte|tee|labs|lab|bmp|cbc|tsh|a1c|lipid|panel|pet|ultrasound|u\/s|xray|cxr|swallow|eval|evaluation|telemetry|monitor|monitoring|serial|checks?|cultures?|culture|blood pressure goals?|goal|map goal|sbp goal|target|pupillometry|mammogram|mammography|biopsy|screen|screening)\b/i;

const CONTEXT_START_KEYWORDS = /^(?:date of|acute revascularization|stroke type|stroke risk|stroke etiology|etiology|history of|premorbid|last pain|last rass|rass goal|icdsc|braden|indication|site checks?|differential|ddx|possible causes?|r\/o|rule out|due to|patient|intubated|s\/p|loaded|continued|evolving|repeat|no active bleeding|utox|findings|imaging|sedation|subclinical)\b/i;

const PLAN_ACTION_KEYWORDS = /^(?:continue|resume|start|hold|discontinue|wean|give|administer|infuse|transfuse|consult|pt\/ot|slp|neurosurgery|heme\s*onc|sbp|map|na\s*goal|transfusion|maintain|nursing|turn|reposition|elevate|hob|ngt|tf|scd|sqh|iv|prn|poct|ldssi|dressing|cdi|pursue|recommend|schedule|call|contact|follow|assess|wound|staples|closed|bulb|suction|dvt|vte|prbc|diet)\b/i;

/**
 * Parses clinical plan text into structured problems with:
 * - Problem name / title
 * - Clinical context / differential diagnosis
 * - Diagnostic plan
 * - Therapeutic plan
 */
export function parseClinicalPlanProblems(planText) {
  if (!planText || typeof planText !== "string") return [];

  const rawLines = planText.split(/\r?\n/);
  const blocks = [];
  let currentBlock = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBlock.length > 0) {
        const nonBlank = currentBlock.map((l) => l.trim()).filter(Boolean);
        const first = nonBlank[0] || "";
        const isHeaderOnly = nonBlank.length === 1 && (
          SPECIALTY_PLAN_HEADER.test(first) ||
          KNOWN_SYSTEMS.has(first.replace(/[:\s]+$/, "").toLowerCase()) ||
          /^(?:plan|recommendations|assessment and plan)\s*:?$/i.test(first)
        );
        if (!isHeaderOnly) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
      }
      continue;
    }

    const isHashProblem = /^#\s*[a-zA-Z0-9]/.test(trimmed);
    const isNumberedProblem = /^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*[a-zA-Z]/i.test(trimmed);
    const isTeamPlan = SPECIALTY_PLAN_HEADER.test(trimmed);
    // System header: "Neurologic:" or "Neurologic: details" (inline details).
    const systemHeaderMatch = trimmed.match(/^([a-zA-Z\/\s]+?):\s*(.+)?$/);
    const isSystemHeader = KNOWN_SYSTEMS.has(trimmed.replace(/[:\s]+$/, "").toLowerCase()) ||
      (systemHeaderMatch && KNOWN_SYSTEMS.has(systemHeaderMatch[1].trim().toLowerCase()));

    if ((isHashProblem || isNumberedProblem || isTeamPlan || isSystemHeader) && currentBlock.length > 0) {
      const nonBlank = currentBlock.map((l) => l.trim()).filter(Boolean);
      // Push the block if it has content. For system headers, a single line
      // like "Neurologic: details" still contains a valid problem (the system
      // name) with inline plan details, so it must not be discarded.
      const hasInlineSystemDetails = nonBlank.length === 1 &&
        isSystemHeader &&
        /^([a-zA-Z\/\s]+?):\s*.+$/s.test(nonBlank[0]);
      if (nonBlank.length > 1 || (!isTeamPlan && !isSystemHeader) || hasInlineSystemDetails) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    }

    currentBlock.push(line);
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // Bullets separated from their numbered problem by a blank line belong to
  // that problem's plan ("1. Stroke\n\n- telemetry"), not to phantom
  // problems of their own. More generally, a block that does not open a new
  // problem (a continuation paragraph, a trailing "Additional ...
  // recommendations" line) merges into the previous problem block instead of
  // becoming a bogus problem entry. Professional sign-off paragraphs are
  // dropped outright: they are courtesy text, never problems.
  const mergedBlocks = [];
  for (const block of blocks) {
    const lines = block.map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0 && SIGNOFF_LEAD.test(lines[0])) continue;
    const previous = mergedBlocks.at(-1);
    const previousLines = previous ? previous.map((line) => line.trim()).filter(Boolean) : [];
    const previousOpensProblem = previousLines.length > 0 && blockOpensProblem(previousLines[0]);
    const bulletOnly = lines.length > 0 && lines.every((line) => /^(?:[-•*>—–]|>>)/.test(line));
    if (previous && previousOpensProblem && (bulletOnly || !blockOpensProblem(lines[0] || ""))) {
      previous.push(...block);
    } else {
      mergedBlocks.push([...block]);
    }
  }

  const problems = [];
  let currentSystemContext = "";
  let blockIndex = 0;

  const pushProblem = ({ title, system, keyContext = "", diagnosticPlan = "", therapeuticPlan = "", differentials = [] }) => {
    const cleanTitle = String(title || "").replace(/[:\s]+$/, "").trim();
    if (!cleanTitle || NEGATED_PROBLEM_TITLE.test(cleanTitle)) return;
    problems.push({
      id: `problem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      system,
      title: cleanTitle,
      problem: cleanTitle,
      keyContext: String(keyContext || "").trim(),
      differentials,
      diagnosticPlan: String(diagnosticPlan || "").trim(),
      therapeuticPlan: String(therapeuticPlan || "").trim()
    });
  };

  for (const block of mergedBlocks) {
    const isFirstBlock = blockIndex === 0;
    blockIndex += 1;
    const nonBlank = block.map((l) => l.trim()).filter(Boolean);
    if (!nonBlank.length) continue;

    const firstLine = nonBlank[0];
    const cleanFirst = firstLine.replace(/^#+\s*/, "").replace(/[:\s]+$/, "");
    const strippedFirst = cleanFirst.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]?\s+/, "").trim();

    // A leading assessment narrative ("74 y.o. with ... s/p HBOT.") is not a
    // problem entry; it stays in the plan section text and must not become a
    // problem with the whole paragraph as its title. But when the entire plan
    // section is one unmarked paragraph (a combined Assessment/Plan note),
    // that paragraph IS the problem entry: fall through and title it with
    // its first sentence below.
    const hasProblemMarker = nonBlank.some((line) => /^#+\s*[a-zA-Z0-9]|^[-•*>—–]|^>>|^\d+[.)]/.test(line));
    const isSingleBlock = mergedBlocks.length === 1;
    if (isFirstBlock && firstLine.length > 200 && !hasProblemMarker && !isSingleBlock) continue;

    const cleanSystemCandidate = strippedFirst.replace(/\s+plan$/i, "").toLowerCase();
    if (KNOWN_SYSTEMS.has(cleanSystemCandidate)) {
      currentSystemContext = strippedFirst.replace(/plan$/i, "").trim();
      if (nonBlank.length === 1) continue;
    }

    if (PROBLEM_LIST_HEADERS.has(strippedFirst.toLowerCase())) {
      for (let j = 1; j < nonBlank.length; j++) {
        const line = nonBlank[j];
        if (!/^[-•*>—–]|^>>|^\d+[.)]/.test(line)) continue;
        const title = line.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]\s*/, "").trim();
        pushProblem({ title, system: currentSystemContext });
      }
      continue;
    }

    let problemTitle = "";
    let startIndex = 0;

    if (SPECIALTY_PLAN_HEADER.test(firstLine)) {
      problemTitle = cleanFirst;
      startIndex = 1;
    } else if (KNOWN_SYSTEMS.has(strippedFirst.toLowerCase()) && nonBlank.length > 1) {
      currentSystemContext = strippedFirst;
      problemTitle = nonBlank[1].replace(/^#+\s*/, "").replace(/^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*/i, "");
      startIndex = 2;
    } else {
      problemTitle = firstLine.replace(/^#+\s*/, "").replace(/^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*/i, "");
      startIndex = 1;
    }

    if (/^(?:plan|recommendations|assessment and plan)\s*:?$/i.test(nonBlank[startIndex] || "")) {
      startIndex++;
    }

    // Strip leading dashes or bullets from problem title
    problemTitle = problemTitle.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]?\s+/, "").trim();

    // "Upper GI bleed on apixaban — hold apixaban, ..." — split the inline
    // plan details (after " — " or " - ") from the problem title.
    const inlinePlanSplit = problemTitle.match(/^(.*?)\s+[—–-]\s+(.+)$/);
    let inlinePlan = "";
    if (inlinePlanSplit && inlinePlanSplit[1].trim().length >= 3) {
      problemTitle = inlinePlanSplit[1].trim();
      inlinePlan = inlinePlanSplit[2].trim();
    }

    // "Neurologic: Sedation vacation..." — system header with inline details.
    // Split into title "Neurologic" and plan details.
    const systemInlineSplit = problemTitle.match(/^([a-zA-Z\/\s]+?):\s*(.+)$/);
    let colonRest = "";
    if (systemInlineSplit && KNOWN_SYSTEMS.has(systemInlineSplit[1].trim().toLowerCase())) {
      problemTitle = systemInlineSplit[1].trim();
      const systemDetails = systemInlineSplit[2].trim();
      if (systemDetails) inlinePlan = inlinePlan ? `${inlinePlan}\n${systemDetails}` : systemDetails;
    } else {
      // "Diabetes mellitus type 1: We will follow up ..." — a problem title
      // followed by its plan after a colon. Split the title from the plan.
      const colonTitleSplit = problemTitle.match(/^([^:]{3,60}):\s*(\S[\s\S]*)$/);
      if (colonTitleSplit && !NON_PROBLEM_LABEL.test(colonTitleSplit[1].trim())) {
        problemTitle = colonTitleSplit[1].trim();
        colonRest = colonTitleSplit[2].trim();
      } else if (!hasProblemMarker || /^\d{1,2}[.:]/.test(firstLine)) {
        // "Followup scooter accident. Lacerations on scalp and shin appear
        // to be healing. ..." — a numbered item whose first sentence is a
        // short noun-led problem title followed by its plan. Split it so the
        // whole paragraph does not become an oversized title. A lone
        // unmarked paragraph (one combined Assessment/Plan section) gets a
        // generous limit: its first sentence is the best available title.
        const first = firstSentence(problemTitle);
        const rest = problemTitle.slice(first.length).trim();
        const titleLimit = isSingleBlock && !hasProblemMarker ? 200 : 60;
        if (rest && first.length <= titleLimit && !ACTION_LEAD.test(first)) {
          problemTitle = first;
          colonRest = rest;
        }
      }
    }

    if (!problemTitle) continue;

    const contextLines = [];
    const diagLines = [];
    const theraLines = [];
    const differentials = [];

    // Inline plan details from the title ("Problem — do X, Y") go to the plan
    // when they read as actions; fragments like "— improving" are assessment
    // reasoning and stay with the problem's context.
    if (inlinePlan) {
      if (PLAN_ACTION_KEYWORDS.test(inlinePlan)) theraLines.push(inlinePlan);
      else contextLines.push(inlinePlan);
    }

    // Text split off a "Problem: details" title or a first-sentence title is
    // classified like any other content line below.
    const contentLines = colonRest ? [colonRest] : [];
    for (let j = startIndex; j < nonBlank.length; j++) {
      const line = nonBlank[j];
      if (j === startIndex && colonRest && line === firstLine) continue;
      contentLines.push(line);
    }

    for (const line of contentLines) {
      const isBullet = /^[-•*>—–]|^>>|^\d+[.)]/.test(line);
      const cleanLine = line.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]\s*/, "").trim();
      if (!cleanLine) continue;

      // Check for differential diagnosis line
      const diffMatch = cleanLine.match(/^(?:differential|ddx|r\/o|rule out)\s*[:—–-]\s*(.+)$/i);
      if (diffMatch) {
        const diffItems = diffMatch[1].split(/[;,]|\bor\b|\bvs\.?\b/i).map((d) => d.trim()).filter(Boolean);
        for (const item of diffItems) {
          differentials.push({
            id: `diff_${Math.random().toString(36).slice(2, 9)}`,
            diagnosis: item,
            cluesFor: "",
            cluesAgainst: ""
          });
        }
        contextLines.push(line);
        continue;
      }

      const isContext = !isBullet && CONTEXT_START_KEYWORDS.test(cleanLine);
      const isAction = isBullet || PLAN_ACTION_KEYWORDS.test(cleanLine);

      if (isContext) {
        contextLines.push(line);
      } else if (isAction) {
        if (DIAGNOSTIC_KEYWORDS.test(cleanLine)) {
          diagLines.push(line);
        } else {
          theraLines.push(line);
        }
      } else {
        contextLines.push(line);
      }
    }

    pushProblem({
      title: problemTitle,
      system: currentSystemContext,
      keyContext: contextLines.join("\n"),
      differentials,
      diagnosticPlan: diagLines.join("\n"),
      therapeuticPlan: theraLines.join("\n")
    });
  }

  return problems;
}
