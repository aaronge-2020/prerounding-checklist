const TWO_COLUMN_HEADER_REGEX = /Diagnostic and Objective Findings\s*[\t|]\s*Assessment and Plan/i;

const KNOWN_SYSTEMS = new Set([
  "neuro", "neurology", "neurosurgery", "cv", "cardiovascular", "cardiology",
  "pulm", "pulmonary", "pulmonology", "renal", "nephrology", "heme",
  "hematology", "heme / onc", "heme/onc", "oncology", "id", "infectious disease",
  "gi / nutrition", "gi/nutrition", "gi", "gastrointestinal", "endo",
  "endocrine", "endocrinology", "msk / derm", "msk/derm", "msk", "derm",
  "dermatology", "prophylaxis", "fen"
]);

const LAB_OR_LDA_ROW = /^\s*\t\s*(?:\[(?:Lab|LATEST|Hospital\s+Day|\d+\s+days?\s+prior)|Component\t|\d{1,2}\/\d{1,2}\/\d{2,4}|Peripheral IV|Urinary Catheter|Non-Surgical Airway|Arterial Line|CVC|PICC|Chest Tube|JP|Jackson|Drain|Airway|Endotracheal|HGBA1C)/i;
const NOT_PLAN_TEXT = /^(?:none|no data recorded|no active orders?|\[lab\s*\d+\/\d+\]|component\b|\d{1,2}\/\d{1,2}\/\d{2,4}|[a-z0-9_,\s]+\t+(?:--|\d|\+|-|negative|positive|clear|trace|normal))/i;

const SPECIALTY_PLAN_HEADER = /^[A-Za-z\s/]+plan\s*:?$/i;
const LDA_START_REGEX = /^(?:patient\s+)?lines[\s/]+drains[\s/]+airways|active\s+(?:active\s+)?ldas/i;

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
    const isSystemHeader = KNOWN_SYSTEMS.has(trimmed.replace(/[:\s]+$/, "").toLowerCase());

    if ((isHashProblem || isNumberedProblem || isTeamPlan || isSystemHeader) && currentBlock.length > 0) {
      const nonBlank = currentBlock.map((l) => l.trim()).filter(Boolean);
      if (nonBlank.length > 1 || (!isTeamPlan && !isSystemHeader)) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    }

    currentBlock.push(line);
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const problems = [];
  let currentSystemContext = "";

  for (const block of blocks) {
    const nonBlank = block.map((l) => l.trim()).filter(Boolean);
    if (!nonBlank.length) continue;

    const firstLine = nonBlank[0];
    const cleanFirst = firstLine.replace(/^#+\s*/, "").replace(/[:\s]+$/, "");

    const cleanSystemCandidate = cleanFirst.replace(/\s+plan$/i, "").toLowerCase();
    if (KNOWN_SYSTEMS.has(cleanSystemCandidate)) {
      currentSystemContext = cleanFirst.replace(/plan$/i, "").trim();
      if (nonBlank.length === 1) continue;
    }

    let problemTitle = "";
    let startIndex = 0;

    if (SPECIALTY_PLAN_HEADER.test(firstLine)) {
      problemTitle = cleanFirst;
      startIndex = 1;
    } else if (KNOWN_SYSTEMS.has(cleanFirst.toLowerCase()) && nonBlank.length > 1) {
      currentSystemContext = cleanFirst;
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
    problemTitle = problemTitle.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]\s*/, "").trim();

    if (!problemTitle) continue;

    const contextLines = [];
    const diagLines = [];
    const theraLines = [];
    const differentials = [];

    for (let j = startIndex; j < nonBlank.length; j++) {
      const line = nonBlank[j];
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

    const cleanTitle = problemTitle.replace(/[:\s]+$/, "");
    problems.push({
      id: `problem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      system: currentSystemContext,
      title: cleanTitle,
      problem: cleanTitle,
      keyContext: contextLines.join("\n").trim(),
      differentials,
      diagnosticPlan: diagLines.join("\n").trim(),
      therapeuticPlan: theraLines.join("\n").trim()
    });
  }

  return problems;
}
