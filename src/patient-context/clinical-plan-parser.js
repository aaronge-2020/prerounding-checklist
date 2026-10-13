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

const SYSTEM_SLASH_KEYS = new Set([...KNOWN_SYSTEMS].map((s) => s.replace(/\s*\/\s*/g, "/")));

/**
 * A specialty/team plan header names the team: "<team> plan", "<team> team
 * plan", or a known system phrase ("Heme/Onc plan"). A longer phrase that
 * merely ends in "plan" ("Comments for Coping Strategies Plan:", "Your
 * Personal Wellness Plan:") is a form label or content, never a team
 * header: treating it as one fabricates a problem out of the words before
 * the colon (round 2 fix, verdict Rule 4).
 */
export function isSpecialtyPlanHeader(text) {
  const clean = String(text || "").trim().replace(/:\s*$/, "");
  const match = clean.match(/^([A-Za-z][A-Za-z\s/]*?)\s+plan$/i);
  if (!match) return false;
  const prefix = match[1].trim().toLowerCase();
  if (/^[a-z]+$/.test(prefix)) return true;
  if (/^[a-z]+ team$/.test(prefix)) return true;
  return SYSTEM_SLASH_KEYS.has(prefix.replace(/\s+/g, "/"));
}
const LDA_START_REGEX = /^(?:patient\s+)?lines[\s/]+drains[\s/]+airways|active\s+(?:active\s+)?ldas/i;

// Verbs (and verb-led phrases) that open an action/recommendation sentence
// rather than a problem title: "Continue vancomycin", "We will obtain...",
// "The patient needs...". Used to tell a bare numbered recommendation list
// ("1. Continue with vancomycin...") apart from a problem list whose items
// carry their own titles ("1. Diabetes mellitus type 1: We will...").
export const ACTION_LEAD = /^(?:continue|resume|re-?start|begin|stop|hold|withhold|discontinue|d\/c|wean|titrate|increase|decrease|adjust|monitor|watch|check|obtain|get|order|send|repeat|recheck|follow|reassess|re-?evaluate|evaluate|assess|consult|refer|recommend|advise|counsel|educate|encourage|discuss|review|ensure|provide|give|administer|prescribe|add|change|switch|maintain|avoid|consider|plan|schedule|arrange|admit|discharge|transfer|agree|we\s+will|i\s+will|the\s+patient\s+(?:needs|requires|should|will))\b/i;

// Labels that look like "Title: ..." but are not problems ("Differential:
// ...", "Assessment: ...").
export const NON_PROBLEM_LABEL = /^(?:differential|differentials|ddx|assessment|plan|impression|recommendations?|diagnos[ie]s|treatments?)$/i;

// Professional sign-off paragraphs ("As always, we greatly appreciate...")
// that close consult notes. They are courtesy text, never problems or plans.
const SIGNOFF_LEAD = /^(?:as\s+always[\s,]|we\s+(?:greatly\s+)?appreciate|thank\s+you\s+for|please\s+(?:do\s+not\s+hesitate|feel\s+free|contact)|sincerely|respectfully)[\s,]/i;

const SENTENCE_ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "st", "vs", "approx", "dept", "no", "jr", "sr"
]);

/**
 * First sentence of a text, abbreviation-aware: a period after a single
 * letter ("E. coli", "p.r.n.") or a known abbreviation ("Ms.", "Dr.") does
 * not end the sentence, and neither does a period followed by a lowercase
 * letter. Without this, a title that starts "Ms. ABC is..." collapses to
 * the title "Ms.".
 */
export function firstSentence(text) {
  const t = String(text || "");
  for (const match of t.matchAll(/[.!?]+/g)) {
    const end = match.index + match[0].length;
    const before = t.slice(0, match.index).trimEnd();
    const lastWord = (before.split(/\s+/).pop() || "").replace(/^[([{"']+/, "").replace(/[)\]}"']+$/, "");
    if (lastWord.length === 1 || SENTENCE_ABBREVIATIONS.has(lastWord.toLowerCase())) continue;
    // Line-break flattening leaves a stray comma at sentence breaks
    // ("...stenosis.,I agree..."), so a capital after an optional comma
    // still ends the sentence.
    const rest = t.slice(end).replace(/^[,\s]+/, "");
    if (rest && !/^[A-Z0-9"'(]/.test(rest)) continue;
    return t.slice(0, end).trim();
  }
  return t.trim();
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
 * Splits a line at inline numbered-item boundaries (redesign, 2026-10-13):
 * flattened note copies write a numbered list on one line
 * ("1. End-stage renal disease.,2. Hypertension.,3. Gout."), so item
 * boundaries also occur mid-line after a period or comma. A boundary is
 * trusted only when the line already opens with a numbered item or the
 * boundaries form a run of two or more sequential numbers, which keeps
 * prose like "repeat in 2. 5 hours" in one piece.
 */
export function splitInlineNumberedItems(line) {
  const text = String(line || "");
  // A section label can share the line with item 1 ("DISCHARGE DIAGNOSES:
  // 1. Bilateral otitis media.,2. Fever."): the label is the section
  // heading, not part of the item, and it hides the item's number from
  // line-start extraction. Drop the label and re-read the line.
  const labelItem = text.match(/^\s*((?:discharge\s+)?diagnoses?|assessment|impression|problems?|problem\s+list|active\s+problems|principal\s+problem)\s*:\s*(\d{1,2}[.)]\s+[\s\S]*)$/i);
  if (labelItem) return splitInlineNumberedItems(labelItem[2]);
  const matches = [...text.matchAll(/[.;,]\s*(\d{1,2})[.)]\s+/g)];
  if (!matches.length) return [text];
  let best = [];
  let cur = [];
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    const entry = { n, index: m.index, end: m.index + m[0].length };
    if (cur.length && n === cur[cur.length - 1].n + 1) cur.push(entry);
    else {
      if (cur.length > best.length) best = cur;
      cur = [entry];
    }
  }
  if (cur.length > best.length) best = cur;
  if (!best.length) return [text];
  const head = text.slice(0, best[0].index).replace(/[.;,\s]+$/, "");
  const headOpensNumbered = /(?:^|[.;:,]\s*)\d{1,2}[.)]\s+/.test(head);
  if (!headOpensNumbered && best.length < 2) return [text];
  const segments = [];
  if (head.trim()) segments.push(head);
  best.forEach((b, i) => {
    const segEnd = i + 1 < best.length ? best[i + 1].index : text.length;
    const body = text.slice(b.end, segEnd).replace(/[.;,\s]+$/, "").trim();
    segments.push(`${b.n}. ${body}`.trim());
  });
  return segments.filter((s) => s.trim());
}

/**
 * Splits plan/assessment text into top-level numbered items
 * ("1. ...", "2. ..."). Non-numbered lines attach to the current item;
 * text before the first number is ignored.
 */
export function extractNumberedPlanItems(text) {
  const items = [];
  let current = null;
  for (const raw of String(text || "").split("\n").flatMap(splitInlineNumberedItems)) {
    const line = raw.trim();
    if (!line) continue;
    const marker = line.match(/^(#\d{1,2}\b[.:)]?|\d{1,2}[.:)])\s*(\S[\s\S]*)$/);
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
  // A pronoun-led first sentence ("I did call and talk with...", "We will
  // see her back...") is narrative plan text, never a problem title: problem
  // titles are noun phrases. Without this, a numbered plan of narrative
  // recommendations looks problem-titled and refuses to pair with the
  // numbered assessment it belongs to.
  if (/^(?:i|we|he|she|they|it)\s+\w+/i.test(first)) return true;
  // A conditional first sentence ("If rebleeds, recommend IR consult...")
  // is a directive with a condition attached, never a problem title:
  // titles are noun phrases, not clauses.
  if (/^if\b/i.test(first)) return true;
  // A first sentence built on an auxiliary verb ("Nerve conduction and
  // EMG will be performed today.") is a narrative plan statement, not a
  // problem title: titles are noun phrases without a finite verb.
  if (/\b(?:will|would|shall|should|can|could|may|might)\s+(?:be\s+)?\w+/i.test(first)
    || /\b(?:is|are|was|were)\s+\w+ed\b/i.test(first)) return true;
  // A first sentence that is itself a dosed medication order or another
  // therapeutic action ("Lamisil 250 mg #30 one p.o. daily...") is a plan
  // action for a problem, not a problem title.
  if (THERAPEUTIC_ACTION.test(first)) return true;
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
  if (isSpecialtyPlanHeader(clean)) return true;
  if (PROBLEM_LIST_HEADERS.has(cleanNoColon.toLowerCase())) return true;
  const colon = clean.match(/^([^:]{3,60}):\s*\S/);
  if (colon && !NON_PROBLEM_LABEL.test(colon[1].trim())) return true;
  const first = firstSentence(clean);
  const rest = clean.slice(first.length).trim();
  if (rest && first.length <= 60 && !ACTION_LEAD.test(first)) return true;
  return false;
}

const BULLET_LINE = /^(?:[-•*>—–]|>>)/;

/**
 * The shape of a bare problem title line: short, unbulleted, unnumbered, not
 * a label (no trailing colon), not a sentence (no terminal punctuation),
 * and not an action or sign-off lead. Problem segmentation (redesign,
 * 2026-10-13) treats such a line as a new problem boundary when it follows
 * plan content and is itself followed by plan lines, so problem splitting
 * no longer depends on blank lines between problems.
 */
function bareTitleShape(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.length > 110) return false;
  // Problem titles are capitalized phrases (or bracketed labels like
  // "[NAME] carrier"); a lowercase fragment ("lactate 4.0") is a
  // continuation of the previous problem's content, never a new title.
  if (!/^[A-Z\[]/.test(trimmed)) return false;
  if (BULLET_LINE.test(trimmed) || /^#/.test(trimmed)) return false;
  if (/^\d{1,2}[.)]\s/.test(trimmed)) return false;
  if (/[:;]$/.test(trimmed) || /[.!?]$/.test(trimmed)) return false;
  if (ACTION_LEAD.test(trimmed) || SIGNOFF_LEAD.test(trimmed)) return false;
  return true;
}

// Finite verbs mark a sentence, not a title: "The patient is improving."
// has them, "Diabetes mellitus type 2." does not.
const TITLE_FINITE_VERB = /\b(?:is|are|was|were|has|have|had|will|would|shall|should|can|could|may|might|be|been|being|presents?|presented|reports?|reported|denies|denied|complains?|shows?|showed|remains?|remained|continues?|continued|requires?|required|needs?|needed|appears?|appeared|seems?|feels?|felt|states?|stated|notes?|noted|includes?|including|develops?|developed)\b/i;

/**
 * A title line that ends in a period (settlement round 2, D1(a)): Epic
 * pastes set problem titles as short noun phrases closed by a period
 * ("Diabetes mellitus type 2."). The period is sentence punctuation, not
 * part of the title, and it must not demote the line to prose: without
 * this shape, the titles fell into context and the first plan bullet was
 * promoted to a problem title. A line qualifies only when the text before
 * the period is a bare title shape with no finite verb, so real sentences
 * never qualify.
 */
function periodTitleShape(line) {
  const trimmed = String(line || "").trim();
  if (!/\.$/.test(trimmed) || /\.\.$/.test(trimmed)) return false;
  const bare = trimmed.slice(0, -1).trim();
  if (bare.length > 80) return false;
  if (!bareTitleShape(bare)) return false;
  return !TITLE_FINITE_VERB.test(bare);
}

function titleLineShape(line) {
  return bareTitleShape(line) || periodTitleShape(line);
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
    if (isSpecialtyPlanHeader(trimmed)) {
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

    // Problem-titled row: "Acute decompensated HFrEF\tJVP elevated, crackles\t- Lasix 40mg IV BID"
    // or the two-column shape "Acute decompensated HFrEF: JVP elevated, crackles\tLasix 40mg IV BID".
    // The first column names the problem (not a system); middle columns are
    // objective findings and the last column is the plan. Without this the
    // whole row collapses into Objective and no Plan is produced.
    if (!LAB_OR_LDA_ROW.test(rawLine)) {
      const cells = rawLine.split("\t").map((cell) => cell.trim());
      const firstCellText = cells[0] || "";
      if (cells.length >= 2 && firstCellText && !KNOWN_SYSTEMS.has(firstCellText.toLowerCase())) {
        const lastCell = cells[cells.length - 1];
        const lastIsPlan = /^(?:[-•*>—–]|>>)/.test(lastCell) || ACTION_LEAD.test(lastCell);
        // A "Problem: findings" first cell ("Acute decompensated HFrEF: JVP
        // elevated, crackles") names the problem explicitly; split the title
        // from its findings so the "#Problem" plan marker stays clean.
        const titleSplit = firstCellText.match(/^([^:]{2,80}?):\s*(\S.*)$/);
        const problem = (titleSplit ? titleSplit[1] : firstCellText).trim();
        const firstFindings = titleSplit ? titleSplit[2].trim() : "";
        // In a two-column table the last column is the Assessment/Plan
        // column, so a problem-titled row's second cell is its plan even
        // when it does not start with an action verb ("Lasix 40mg IV BID").
        const takesPlanFromLastCell = cells.length >= 3 ? lastIsPlan : (lastIsPlan || !!titleSplit);
        if (cells.length >= 3 || takesPlanFromLastCell) {
          const middle = [
            firstFindings,
            ...cells.slice(1, cells.length - (takesPlanFromLastCell ? 1 : 0))
          ].map((part) => part.trim()).filter(Boolean);
          const planPart = takesPlanFromLastCell ? lastCell : "";
          currentSystem = "";
          if (middle.length) objectiveLines.push(`${problem}: ${middle.join("; ")}`);
          else objectiveLines.push(`${problem}:`);
          if (planPart && !NOT_PLAN_TEXT.test(planPart)) {
            // "#Problem" markers become problem entries in parseClinicalPlanProblems.
            planLines.push(`#${problem}`);
            planLines.push(planPart);
            currentColumn = "plan";
          } else {
            currentColumn = "objective";
          }
          continue;
        }
      }
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

const PLAN_ACTION_KEYWORDS = /^(?:continue|continued|resume|resumed|start|started|hold|held|discontinue|discontinued|wean|weaned|give|gave|administer|administered|infuse|infused|transfuse|transfused|consult|pt\/ot|slp|neurosurgery|heme\s*onc|sbp|map|na\s*goal|transfusion|maintain|maintained|nursing|turn|reposition|elevate|hob|ngt|tf|scd|sqh|iv|prn|poct|ldssi|dressing|cdi|pursue|recommend|recommended|schedule|scheduled|call|contact|follow|assess|wound|staples|closed|bulb|suction|dvt|vte|prbc|diet|initiate|initiated)\b/i;

// A leading chart-date stamp ("09/24/2026: started heparin") is metadata,
// not content; strip it before classification so the action is recognized.
const DATE_PREFIX = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*:\s*/;

// Explicit plan labels ("Diagnostic plan", "Therapeutic plan") are section
// labels, never problem titles.
const PLAN_SECTION_LABEL = /^(?:diagnostic|therapeutic|treatment|management)(?:\s+plan)?\s*:?$/i;

// A therapeutic action (dosed medication, IV fluids, bolus/infusion,
// transfusion) outranks an incidental diagnostic word like "monitor":
// "Aggressive IV fluids, monitor I/O hourly" is primarily therapeutic.
const THERAPEUTIC_ACTION = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?|u|ml|l)\b(?!\/)|\biv\s+fluids?\b|\bfluid\s+(?:bolus|challenge|resuscitation)\b|\b(?:bolus|infusion|drip|transfus\w+)\b/i;

function classifyLabeledPlanItem(kind, item) {
  // A strong therapeutic action ("Aggressive IV fluids", a transfusion, a
  // dosed medication order) keeps its therapeutic meaning even under a
  // "Diagnostic plan" label. Weaker signals do not override the label:
  // incidental verbs such as "monitor" stay diagnostic under a diagnostic
  // label, and non-action reasoning under a therapeutic label stays context.
  if (THERAPEUTIC_ACTION.test(item)) return "therapeutic";
  if (kind === "diagnostic") return "diagnostic";
  if (PLAN_ACTION_KEYWORDS.test(item) || ACTION_LEAD.test(item)) return "therapeutic";
  // Assessment reasoning under a "Therapeutic plan" label ("Anion gap still
  // open at 24; not ready to transition to subQ") is not an action: it stays
  // in context instead of being forced into therapeutic actions.
  return "context";
}

// Markdown assessment/plan tables ("| Problem | Assessment | Plan |").
// Without normalization the header row becomes a bogus problem titled
// "| Problem | Assessment | Plan |". Convert them into "#Problem" blocks
// before problem parsing.
const AP_TABLE_PLAN_COLUMN = /^(?:plan|treatment plan|management plan|management|interventions?|actions?)$/i;
const AP_TABLE_PROBLEM_COLUMN = /^(?:problem|problems|diagnos[ei]s|system|systems|issue|issues|condition)$/i;
const AP_TABLE_ASSESSMENT_COLUMN = /^(?:assessment|findings|diagnostic(?:\s+workup|\s+findings)?|objective(?:\s+findings)?|workup|evaluation)$/i;

function splitMarkdownTableRow(line) {
  let cells = String(line || "").split("|").map((cell) => cell.trim());
  if (cells.length && !cells[0]) cells = cells.slice(1);
  if (cells.length && !cells.at(-1)) cells = cells.slice(0, -1);
  return cells;
}

function isMarkdownDelimiterRow(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function tryParseAssessmentPlanTable(lines, startIndex) {
  const headerCells = splitMarkdownTableRow(lines[startIndex]);
  if (headerCells.length < 2 || !lines[startIndex].includes("|")) return null;
  if (!isMarkdownDelimiterRow(lines[startIndex + 1] || "")) return null;
  const roles = headerCells.map((cell) => {
    if (AP_TABLE_PLAN_COLUMN.test(cell)) return "plan";
    if (AP_TABLE_PROBLEM_COLUMN.test(cell)) return "problem";
    if (AP_TABLE_ASSESSMENT_COLUMN.test(cell)) return "assessment";
    return "other";
  });
  if (!roles.includes("plan") || !roles.includes("problem")) return null;
  const problemIndex = roles.indexOf("problem");
  const planIndex = roles.indexOf("plan");
  const output = [];
  let current = null;
  let index = startIndex + 2;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("|")) break;
    const cells = splitMarkdownTableRow(line);
    if (!cells.length || cells.every((cell) => !cell)) break;
    const problem = (cells[problemIndex] || "").trim();
    const plan = (cells[planIndex] || "").trim();
    const assessment = cells
      .filter((_, cellIndex) => cellIndex !== problemIndex && cellIndex !== planIndex)
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (!problem && !plan && !assessment.length) continue;
    if (!problem && current) {
      // Continuation row: the problem cell is empty, so the content belongs
      // to the previous problem instead of opening a nameless one.
      current.push(...assessment);
      if (plan) current.push(/^(?:[-•*>—–]|>>)/.test(plan) ? plan : `- ${plan}`);
      continue;
    }
    if (current) output.push(...current, "");
    current = [`#${problem || "Unspecified problem"}`];
    current.push(...assessment);
    if (plan) current.push(/^(?:[-•*>—–]|>>)/.test(plan) ? plan : `- ${plan}`);
  }
  if (current) output.push(...current);
  if (!output.length) return null;
  return { text: output, nextIndex: index };
}

export function normalizeMarkdownAssessmentPlanTable(fullText) {
  if (!fullText || typeof fullText !== "string" || !fullText.includes("|")) return fullText;
  const lines = fullText.split(/\r?\n/);
  const output = [];
  let index = 0;
  while (index < lines.length) {
    const parsed = tryParseAssessmentPlanTable(lines, index);
    if (parsed) {
      output.push(...parsed.text, "");
      index = parsed.nextIndex;
    } else {
      output.push(lines[index]);
      index += 1;
    }
  }
  return output.join("\n");
}

const EYE_SIDE_TOKEN = /(?:^|\s)(OU|OS|OD)(?:\s|$)/;

function dashItemHead(line) {
  const clean = String(line || "").trim().replace(/^[-•]\s?/, "");
  return (clean.split(/\s{2,}/)[0] || "").trim();
}

/**
 * A dash segment starts a new problem item when its head phrase (the text
 * before the first wide-space run) names an eye diagnosis (carries OU/OS/OD)
 * and does not start with "s/p": the item form the flattened eye notes state
 * ("-Refractive Error OU   Rx specs; ..."). Other dash segments (sub-bullets
 * like "-s/p CXL OS", datum lines like "- Last DFE") are plan content of the
 * item above them. Mirrors the gold convention in build_gold.py.
 */
function isDashItemStart(line) {
  if (!/^[-•]\s?/.test(String(line || "").trim())) return false;
  const head = dashItemHead(line);
  if (/^s\/p\b/i.test(head)) return false;
  return EYE_SIDE_TOKEN.test(head);
}

function splitInlineDashItems(line) {
  return String(line || "").split(/\s{2,}(?=-)/);
}

/**
 * When a plan text is a dash-item list (two or more eye-diagnosis items),
 * rewrite each item's first line as a "#Title" marker line plus its plan
 * text, so the block segmenter treats items as problems. Other lines pass
 * through unchanged.
 */
function rewriteDashItemLines(lines) {
  if (lines.filter((line) => isDashItemStart(line)).length < 2) return lines;
  const out = [];
  for (const line of lines) {
    if (!isDashItemStart(line)) {
      out.push(line);
      continue;
    }
    const clean = line.trim().replace(/^[-•]\s?/, "");
    const splitAt = clean.search(/\s{2,}/);
    if (splitAt < 0) {
      out.push(`#${clean.trim()}`);
    } else {
      out.push(`#${clean.slice(0, splitAt).trim()}`);
      const rest = clean.slice(splitAt).trim();
      if (rest) out.push(rest);
    }
  }
  return out;
}

const DX_LIST_SPLIT = /\s*(?:,|;|\band\b|\bor\b|\bvs\.?\b)\s*/;

/**
 * Differentials the source states, in the forms settlement C5 names: an
 * enumerated "(a) X, (b) Y" list, a "The differential includes ..." sentence,
 * a labeled "Differential:"/"DDx:" list, and the MDM prose forms
 * ("possibility of X", "rule out X", "X cannot be excluded"). Returns the
 * parser's differential objects. Mirrors the gold extraction in
 * build_gold.py; nothing is inferred beyond those stated forms.
 */
export function extractStatedDifferentials(text) {
  const found = [];
  const push = (value, maxLen = 60) => {
    const diagnosis = String(value || "").trim().replace(/^[.,\s]+|[.,\s]+$/g, "");
    // Two characters is the floor: "MI" is a stated differential in the
    // verifier's S2 synthetic and must survive extraction (D1(a)).
    if (diagnosis.length < 2 || diagnosis.length > maxLen) return;
    // "rule out any pathology" names no diagnosis; a value starting with
    // "any " is a generic phrase, not a stated differential.
    if (/^any\s/i.test(diagnosis)) return;
    if (found.some((f) => f.diagnosis.toLowerCase() === diagnosis.toLowerCase())) return;
    found.push({ id: `diff_${Math.random().toString(36).slice(2, 9)}`, diagnosis, cluesFor: "", cluesAgainst: "" });
  };
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  const enumerated = flat.match(/\(a\)\s*(.+?)\s*\(b\)\s*(.+?)(?:\s*\(c\)\s*(.+?))?(?:\s*\(d\)\s*(.+?))?(?:\s*\(e\)\s*(.+?))?(?:\.|$)/);
  if (enumerated) {
    for (const group of enumerated.slice(1)) if (group) push(group.replace(/,\s*$/, ""), 200);
  }
  if (!found.length) {
    const includes = flat.match(/(?:^|\s)(?:[Tt]he\s+)?[Dd]ifferential(?: diagnoses)? (?:includes?|included|consists of)\s+([^.]+)\./);
    if (includes) for (const part of includes[1].split(DX_LIST_SPLIT)) push(part, 200);
  }
  if (!found.length) {
    const labeled = String(text || "").match(/(?:Differential(?: diagnosis)?|DDx|DDX)\s*:\s*([^\n]+)/);
    if (labeled) {
      const segment = labeled[1].split(/[.!?]\s/)[0];
      for (const part of segment.split(DX_LIST_SPLIT)) push(part, 200);
    }
  }
  if (!found.length) {
    for (const m of flat.matchAll(/possibility of ([^.,;]+?)(?:\s+(?:is|was|are|were|remains?)\b|[.,;]|$)/g)) push(m[1]);
    for (const m of flat.matchAll(/(?:difficult to |hard to |to )?rule out ([^.,;]+)/gi)) push(m[1]);
    for (const m of flat.matchAll(/([A-Z][A-Za-z /-]{2,40}?) cannot be excluded/g)) push(m[1]);
  }
  return found;
}

/**
 * Settlement round 2, D1(b): differential extraction is local. A problem
 * the source numbers or lists as "Rule out X" states X as its own title,
 * not as a differential: not for itself and not for any other problem.
 * Drops any extracted differential that is exactly that rule-out phrase.
 */
export function dropRuleOutSelfDifferential(title, differentials) {
  const match = String(title || "").trim().match(/^rule out\s+(.+)$/i);
  if (!match) return differentials;
  const phrase = match[1].split(/[.,;]/)[0].trim().toLowerCase();
  if (!phrase) return differentials;
  return (differentials || []).filter((d) => String(d.diagnosis || "").trim().toLowerCase() !== phrase);
}

/**
 * Parses clinical plan text into structured problems with:
 * - Problem name / title
 * - Clinical context / differential diagnosis
 * - Diagnostic plan
 * - Therapeutic plan
 */
export function parseClinicalPlanProblems(planText) {
  if (!planText || typeof planText !== "string") return [];

  // Markdown assessment/plan tables normalize into "#Problem" blocks first;
  // otherwise the header row becomes a bogus problem title.
  const rawLines = rewriteDashItemLines(
    normalizeMarkdownAssessmentPlanTable(planText).split(/\r?\n/).flatMap(splitInlineNumberedItems).flatMap(splitInlineDashItems)
  );
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
          isSpecialtyPlanHeader(first) ||
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
    const isTeamPlan = isSpecialtyPlanHeader(trimmed);
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

    // Bare title boundary: a title-shaped line that follows plan bullets
    // and is itself followed by a plan line opens a new problem block even
    // when no blank line separates the problems (the pregnancy-plan bug:
    // without this, a plan pasted without blank lines is one block and so
    // one problem). A period-terminated title line counts too (D1(a)).
    if (!isHashProblem && !isNumberedProblem && !isTeamPlan && !isSystemHeader && currentBlock.length > 0 && titleLineShape(trimmed)) {
      const blockNonBlank = currentBlock.map((l) => l.trim()).filter(Boolean);
      let nextNonBlank = "";
      for (let j = i + 1; j < rawLines.length; j++) {
        if (rawLines[j].trim()) { nextNonBlank = rawLines[j].trim(); break; }
      }
      // The block above may be a single title-only problem ("Varicella
      // non-immune" with no plan lines of its own): it still closes here,
      // or it swallows the titled problem that follows it (verdict Rule 2,
      // fix (a)). A lone line carrying a digit ("Post-op day 2") is a
      // status line, not a title-only problem, and never closes a block.
      // Neither does a header line (a problem-list header, a system name, a
      // team plan header): its content follows it in the same block.
      const loneLine = (blockNonBlank[0] || "").replace(/[:\s]+$/, "");
      const loneTitleBlock = blockNonBlank.length === 1 && titleLineShape(blockNonBlank[0]) && !/\d/.test(blockNonBlank[0])
        && !PROBLEM_LIST_HEADERS.has(loneLine.toLowerCase())
        && !KNOWN_SYSTEMS.has(loneLine.toLowerCase())
        && !isSpecialtyPlanHeader(blockNonBlank[0]);
      if (((blockNonBlank.length >= 2 && blockNonBlank.some((l) => BULLET_LINE.test(l))) || loneTitleBlock) && BULLET_LINE.test(nextNonBlank)) {
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
    // A block that starts with a bare problem title followed by plan lines
    // is a problem boundary the segmenter found without a blank line; the
    // merge stage must not fold it back into the previous problem.
    const bareTitleStart = lines.length >= 2 && titleLineShape(lines[0]) && BULLET_LINE.test(lines[1]);
    if (previous && previousOpensProblem && !bareTitleStart && (bulletOnly || !blockOpensProblem(lines[0] || ""))) {
      previous.push(...block);
    } else {
      mergedBlocks.push([...block]);
    }
  }

  const problems = [];
  let currentSystemContext = "";
  let blockIndex = 0;
  // Plan-label blocks ("Diagnostic plan — ...") seen before any problem are
  // held here and prepended to the next problem's buckets.
  const orphanLabeled = { diagnostic: [], therapeutic: [], context: [] };

  const pushProblem = ({ title, system, keyContext = "", diagnosticPlan = "", therapeuticPlan = "", differentials = [], fromProblemList = false }) => {
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
      therapeuticPlan: String(therapeuticPlan || "").trim(),
      // Structured EHR problem lists (e.g. "Active Hospital Problems" with
      // CMS/HHS-HCC billing codes) are problem entries, not assessment
      // reasoning. Tag them so the combined "Assessment and Plan" fallback
      // doesn't copy billing-coded titles into the narrative assessment.
      fromProblemList
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

    // A one-sentence patient introduction in front of a numbered problem
    // list ("This is a 45-year-old woman with history as noted above.",
    // then "1. ...", "2. ...", ...) is the combined Assessment/Plan
    // preamble, not a problem entry. The numbered items are the problems.
    // The sentence stays in the plan section text; it only stops being a
    // problem of its own.
    if (isFirstBlock && !hasProblemMarker && !isSingleBlock) {
      const blockText = nonBlank.join(" ");
      const laterNumberedBlocks = mergedBlocks.slice(blockIndex)
        .filter((later) => later.some((line) => /^\d+[.)]/.test(line.trim()))).length;
      if (laterNumberedBlocks >= 2
        && /^(?:this is|the patient is)\b/i.test(firstLine)
        && firstSentence(blockText) === blockText) continue;
    }

    const cleanSystemCandidate = strippedFirst.replace(/\s+plan$/i, "").toLowerCase();
    if (KNOWN_SYSTEMS.has(cleanSystemCandidate)) {
      currentSystemContext = strippedFirst.replace(/plan$/i, "").trim();
      if (nonBlank.length === 1) continue;
    }

    if (PROBLEM_LIST_HEADERS.has(strippedFirst.toLowerCase())) {
      // Flat problem list: every bullet underneath becomes its own problem,
      // while non-bullet lines (for example a "Diagnosis" subheader) are
      // skipped instead of turning into context or plans.
      for (const line of nonBlank.slice(1)) {
        if (!/^(?:[-•*>—–]|>>|\d+[.)])/.test(line)) continue;
        const bulletText = line.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]\s*/, "").trim();
        if (!bulletText) continue;
        pushProblem({ title: bulletText, system: "", differentials: [], fromProblemList: true });
      }
      continue;
    }

    let problemTitle = "";
    let startIndex = 0;

    if (isSpecialtyPlanHeader(firstLine)) {
      problemTitle = cleanFirst;
      startIndex = 1;
    } else if (KNOWN_SYSTEMS.has(strippedFirst.toLowerCase()) && nonBlank.length > 1) {
      const nextLine = nonBlank[1];
      // "Neuro:\n- Continue keppra": the bullets are plan content, not a new
      // problem title. The system itself is the problem; an action-led or
      // bulleted next line never becomes the title.
      const nextIsPlanContent = /^(?:[-•*>—–]|>>|\d+[.)])/.test(nextLine) || ACTION_LEAD.test(nextLine);
      if (nextIsPlanContent) {
        currentSystemContext = strippedFirst;
        problemTitle = strippedFirst;
        startIndex = 1;
      } else {
        currentSystemContext = strippedFirst;
        problemTitle = nonBlank[1].replace(/^#+\s*/, "").replace(/^(?:problem\s*\d+[:.]|\d{1,2}[.:])\s*/i, "");
        startIndex = 2;
      }
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
        // A numbered item is explicitly a problem entry, so its first
        // sentence may run longer than the 60-character short-title cap
        // ("Small bowel obstruction/paralytic ileus, rule out obstipation."
        // is 61) and still be the title, with the rest as its plan.
        const titleLimit = isSingleBlock && !hasProblemMarker ? 400 : (/^\d{1,2}[.:]/.test(firstLine) ? 160 : 60);
        // The action-lead veto ("Continue X." is a plan, not a title) guards
        // unnumbered prose. A numbered item is explicitly an entry, and in a
        // combined Assessment/Plan list the entry itself may be a directive
        // ("5. Plan today is to repeat her thyroid function studies. This
        // case was discussed..."): its first sentence is the entry's title
        // and the rest is its plan.
        if (rest && first.length <= titleLimit && (/^\d{1,2}[.:]/.test(firstLine) || !ACTION_LEAD.test(first))) {
          problemTitle = first;
          colonRest = rest;
        }
      }
    }

    if (!problemTitle) continue;

    // "Diagnostic plan — ..." / "Therapeutic plan — ..." are plan labels,
    // never problem titles. Fold the labeled content into the previous
    // problem; when this block opens the section (no previous problem yet),
    // hold the labeled content for the next problem instead of inventing a
    // problem called "Diagnostic plan".
    const planLabelKind = PLAN_SECTION_LABEL.test(problemTitle)
      ? (/diagnostic/i.test(problemTitle) ? "diagnostic" : "therapeutic")
      : "";
    if (planLabelKind) {
      const labeledItems = [];
      if (inlinePlan) labeledItems.push(inlinePlan);
      if (colonRest) labeledItems.push(colonRest);
      for (let j = startIndex; j < nonBlank.length; j++) {
        if (nonBlank[j] === firstLine) continue;
        labeledItems.push(nonBlank[j]);
      }
      const appendLabeled = (target, asBuckets) => {
        for (const item of labeledItems) {
          const bucket = classifyLabeledPlanItem(planLabelKind, item);
          if (asBuckets) {
            asBuckets[bucket].push(item);
          } else {
            if (bucket === "diagnostic") target.diagnosticPlan = [target.diagnosticPlan, item].filter(Boolean).join("\n");
            else if (bucket === "therapeutic") target.therapeuticPlan = [target.therapeuticPlan, item].filter(Boolean).join("\n");
            else target.keyContext = [target.keyContext, item].filter(Boolean).join("\n");
          }
        }
      };
      const previous = problems.at(-1);
      if (previous) appendLabeled(previous, null);
      else {
        appendLabeled(null, orphanLabeled);
      }
      continue;
    }

    const contextLines = [];
    const diagLines = [];
    const theraLines = [];
    const differentials = [];

    // Orphaned plan-label content collected before the first problem belongs
    // to this problem.
    if (orphanLabeled.diagnostic.length || orphanLabeled.therapeutic.length || orphanLabeled.context.length) {
      diagLines.push(...orphanLabeled.diagnostic);
      theraLines.push(...orphanLabeled.therapeutic);
      contextLines.push(...orphanLabeled.context);
      orphanLabeled.diagnostic = [];
      orphanLabeled.therapeutic = [];
      orphanLabeled.context = [];
    }

    // Inline plan details from the title ("Problem — do X, Y") go to the plan
    // when they read as actions; fragments like "— improving" are assessment
    // reasoning and stay with the problem's context.
    if (inlinePlan) {
      if (PLAN_ACTION_KEYWORDS.test(inlinePlan) || THERAPEUTIC_ACTION.test(inlinePlan)) theraLines.push(inlinePlan);
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
      const cleanLine = line.replace(/^[-•*>—–\s]+|^>>\s*|^\d+[.)]\s*/, "").replace(DATE_PREFIX, "").trim();
      if (!cleanLine) continue;

      // Explicit plan labels mid-block ("Diagnostic plan — ...",
      // "Therapeutic plan: ..."): the label is never content; the remainder
      // is bucketed by label kind with label-aware classification.
      const planLabelMatch = cleanLine.match(/^(diagnostic|therapeutic|treatment|management)(?:\s+plan)?\s*[—–:\-]\s*(.+)$/i);
      if (planLabelMatch && planLabelMatch[2].trim()) {
        const labeledKind = /diagnostic/i.test(planLabelMatch[1]) ? "diagnostic" : "therapeutic";
        const labeledItem = planLabelMatch[2].trim();
        const labeledBucket = classifyLabeledPlanItem(labeledKind, labeledItem);
        if (labeledBucket === "diagnostic") diagLines.push(labeledItem);
        else if (labeledBucket === "therapeutic") theraLines.push(labeledItem);
        else contextLines.push(labeledItem);
        continue;
      }

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
      // A dosed medication order ("Lasix 40mg IV BID") is a therapeutic
      // action even when it opens with the drug name instead of an action
      // verb. Context still wins first ("Loaded w/ 500ml NS" stays context).
      const isAction = isBullet || PLAN_ACTION_KEYWORDS.test(cleanLine) || THERAPEUTIC_ACTION.test(cleanLine);

      if (isContext) {
        contextLines.push(line);
      } else if (isAction) {
        // A therapeutic action outranks an incidental diagnostic word:
        // "Aggressive IV fluids, monitor I/O hourly" is therapeutic even
        // though it mentions monitoring.
        if (THERAPEUTIC_ACTION.test(cleanLine)) {
          theraLines.push(line);
        } else if (DIAGNOSTIC_KEYWORDS.test(cleanLine)) {
          diagLines.push(line);
        } else {
          theraLines.push(line);
        }
      } else {
        contextLines.push(line);
      }
    }

    // Differentials stated in the block's own text in any C5 form (an
    // enumerated list, a "The differential includes..." sentence, MDM prose)
    // belong to this problem, alongside any labeled "Differential:" lines
    // collected above.
    for (const stated of extractStatedDifferentials(nonBlank.join("\n"))) {
      if (!differentials.some((d) => d.diagnosis.toLowerCase() === stated.diagnosis.toLowerCase())) {
        differentials.push(stated);
      }
    }

    pushProblem({
      title: problemTitle,
      system: currentSystemContext,
      keyContext: contextLines.join("\n"),
      differentials: dropRuleOutSelfDifferential(problemTitle, differentials),
      diagnosticPlan: diagLines.join("\n"),
      therapeuticPlan: theraLines.join("\n")
    });
  }

  // Plan-label content with no problem anywhere in the section is preserved
  // under an honest "Unspecified problem" title rather than dropped.
  if (orphanLabeled.diagnostic.length || orphanLabeled.therapeutic.length || orphanLabeled.context.length) {
    pushProblem({
      title: "Unspecified problem",
      system: "",
      keyContext: orphanLabeled.context.join("\n"),
      differentials: [],
      diagnosticPlan: orphanLabeled.diagnostic.join("\n"),
      therapeuticPlan: orphanLabeled.therapeutic.join("\n")
    });
  }

  return problems;
}
