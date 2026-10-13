import { primaryTeamNoteFields } from "./primary-team-note.js?v=20260921-medication-card-v4";
import { transformClinicalTablesInText } from "./clinical-table-parser.js";
import {
  ACTION_LEAD,
  NON_PROBLEM_LABEL,
  firstSentence,
  normalizeTwoColumnEhrText,
  parseClinicalPlanProblems,
  splitTwoColumnEhrTables,
  extractNumberedPlanItems,
  isBareActionItem,
  stripSignoffParagraphs,
  extractStatedDifferentials,
  dropRuleOutSelfDifferential
} from "./clinical-plan-parser.js?v=20261013-aloop-round3-final";

const H_AND_P = "hp";
const PROGRESS = "progress";

const HEADING_DEFINITIONS = Object.freeze([
  heading(["one liner", "one-liner", "source summary", "brief summary"], "one_liner"),
  heading(["chief complaint", "cc", "reason for admission", "reason for consultation", "reason for the consult", "reason for consult", "reason for neurological consultation", "reason for the consultation", "history and reason for consultation", "reason for referral", "reason for return visit", "indication", "indications", "chief concern", "presenting complaint", "reason for visit", "reason for encounter"], { [H_AND_P]: "chief_complaint", [PROGRESS]: "patient_report" }),
  heading(["history of present illness", "hpi", "history", "presenting history", "present illness", "history and physical", "abnormal pap history", "pelvic pain history"], { [H_AND_P]: "history_of_present_illness", [PROGRESS]: "patient_report" }),
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
  heading(["allergies", "allergy"], { [H_AND_P]: "allergies", [PROGRESS]: "other" }),
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
    "intake output", "i o", "ins and outs", "i/o", "laboratory data", "laboratory results", "laboratory studies", "laboratory", "labs", "labs reviewed",
    "labs/imaging", "lab/imaging", "labs and imaging", "labs & imaging", "lab data",
    "studies", "study results", "studies reviewed", "test results", "results review", "data review",
    "imaging", "x ray", "xray", "xr", "electrocardiogram", "diagnostic studies", "diagnostic data", "diagnostic studies review management",
    "diagnostic studies / review management", "diagnostic and objective findings",
    "objective diagnostic studies", "objective / diagnostic studies", "results", "data", "radiology"
  ], "objective", true),
  heading(["assessment", "assessments", "impression", "clinical impression", "a", "final diagnosis", "final diagnoses", "admitting diagnosis", "admitting diagnoses", "preoperative diagnosis", "preoperative diagnoses"], "assessment"),
  heading(["assessment and plan", "assessment / plan", "assessment plan", "a and p", "a p", "ap", "impression and plan", "impression plan", "assessment and recommendations", "impression and recommendations", "plan", "p", "plans", "plan by system", "systems plan", "recommendations", "recs", "plan and recommendations", "discussion and plan", "treatment", "treatments", "next steps"], "plan"),
  heading(["discharge instructions", "discharge instruction"], "plan"),
  heading(["discharge diagnosis", "discharge diagnoses", "additional discharge diagnoses", "discharge dx"], "assessment", true, true),
  // A standalone "Diagnoses" section is an assessment section (the plural
  // section header, common in consult notes). The singular "Diagnosis"
  // stays unrecognized on purpose: it appears as a subheader inside
  // problem lists, where treating it as a section would steal the list.
  heading(["diagnoses"], "assessment", true, true),
  heading(["complications"], "assessment", true, true),
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
  heading(["principal problem", "active problems", "resolved problems", "active hospital problems", "problem list", "medical problem list"], "assessment", true, true),
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

/**
 * A team plan heading names a team: "<team> plan" or "<team> team plan"
 * (one word, or a word plus "team"). Any longer phrase that merely ends in
 * "plan" is content, not a heading: "Your Personal Wellness Plan", the form
 * label "Comments for Coping Strategies Plan", and the sentence fragment
 * "the patient will plan" all matched the old loose pattern and split
 * sections or fabricated problems (round 2 fix, verdict Rules 4 and 5).
 */
function isTeamPlanHeading(normalized) {
  if (!normalized.endsWith(" plan") || normalized.includes("discharge")) return false;
  const prefix = normalized.slice(0, -" plan".length).trim();
  if (!prefix) return false;
  return /^[a-z]+$/.test(prefix) || /^[a-z]+ team$/.test(prefix);
}

// Headings that combine assessment reasoning and plan actions in one
// section. When one of these is used and there is no separate Assessment
// section, the assessment reasoning is split back out of the parsed
// problems so sections.assessment is not left empty.
const COMBINED_ASSESSMENT_PLAN_ALIASES = new Set([
  "assessment and plan",
  "assessment / plan",
  "assessment plan",
  "a and p",
  "a p",
  "ap",
  "impression and plan",
  "impression plan",
  "assessment and recommendations",
  "impression and recommendations"
]);

function assessmentItemTitle(text) {
  const clean = String(text || "").trim();
  const firstLine = clean.split("\n").map((line) => line.trim()).filter(Boolean)[0] || "";
  const sentence = (firstSentence(firstLine) || firstLine).trim();
  // A one-line assessment paragraph is a whole section on one line (the
  // flattened-copy format): its first sentence is the title even when the
  // sentence runs past the short-title cap, because the alternative is the
  // entire paragraph as the title.
  if (sentence.length <= 400 && clean.length > sentence.length) return sentence;
  return firstLine;
}

// Preserve explicit problem hierarchy: title separators or a title line with
// subordinate content distinguish problems from flat numbered actions.
function planItemHasProblemTitle(itemText) {
  const text = String(itemText || "").trim();
  const colon = text.match(/^([^:]{3,60}):\s*\S/);
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  // A titled numbered block followed by subordinate bullets is a problem
  // hierarchy. Do not flatten all such blocks into the assessment paragraph.
  const titledBulletBlock = lines.length > 1 && /^[-•]\s+/.test(lines[1]);
  const separatedTitle = /^.{3,80}\s[—–]\s\S/.test(text);
  const titledParagraph = lines.length > 1 && !/[.!?:]$/.test(lines[0]) && lines[0].length <= 80;
  return titledBulletBlock || titledParagraph || separatedTitle || !!(colon && !NON_PROBLEM_LABEL.test(colon[1].trim()));
}

// Two lists share one field when numbering restarts ("ADMITTING
// DIAGNOSES: 1. Fever... DISCHARGE DIAGNOSES: 1. Bilateral otitis
// media..."): the items of the first list are the note's list. Keep the
// longest run that starts at 1 and increments by 1 (the gold reader's
// numbered_items rule); when no such run exists, keep the items as read.
function longestSequentialRun(items) {
  if (!items.length) return items;
  const nums = items.map((it) => parseInt(String(it.marker || "").replace(/[^0-9]/g, ""), 10));
  if (nums.some((n) => !Number.isFinite(n))) return items;
  let best = [];
  let cur = [];
  let expect = 1;
  items.forEach((it, i) => {
    const n = nums[i];
    if (n === expect) { cur.push(it); expect += 1; }
    else if (n === 1) { if (cur.length > best.length) best = cur; cur = [it]; expect = 2; }
  });
  if (cur.length > best.length) best = cur;
  return best.length >= 2 && best.length < items.length ? best : items;
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
    // Differentials the assessment item itself states (settlement C5 forms)
    // ride on the paired problem. A "Rule out X" item states X as its own
    // title, never as a differential (settlement round 2, D1(b)).
    differentials: dropRuleOutSelfDifferential(title, extractStatedDifferentials(assessment)),
    diagnosticPlan: "",
    therapeuticPlan: plan
  };
}

// An assessment paragraph that opens with an examination statement
// ("Neurological examination is normal, aside from ...") states findings,
// not a problem title: titling a problem with its first sentence puts an
// examination fragment where a problem name belongs (settlement round 2,
// D5, mts-4111). Such a paragraph yields no titled problem.
const EXAMINATION_STATEMENT = /^(?:[a-z]+\s+){0,2}examination\s+(?:is|was|shows|showed|reveals?|revealed|demonstrates?)\b/i;

function opensWithExaminationStatement(text) {
  const first = firstSentence(String(text || "").trim());
  return EXAMINATION_STATEMENT.test(first);
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

  const assessmentItems = longestSequentialRun(extractNumberedPlanItems(assessment));
  const planItems = longestSequentialRun(extractNumberedPlanItems(plan));

  if (assessmentItems.length > 0 && planItems.length > 0) {
    // Equal-length numbered lists pair by index: plan item i elaborates
    // assessment item i, even when the plan item restates the problem in
    // different words ("1. Posttransplant lymphoproliferative disorder" in
    // the Diagnoses list, "1. Diffuse large B-cell lymphoma following
    // transplantation. ..." in the plan). The titles come from the
    // assessment, which is the list that names the problems.
    if (assessmentItems.length === planItems.length) {
      return assessmentItems.map((item, i) => makePairedProblem(item.text, planItems[i].text));
    }
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
    // Unequal lists with titled plan items: the assessment items are the
    // problems and the plan is scored as a whole (the gold reader's
    // convention). A plan item that restates a problem in shorter words
    // ("1. Neuroblastoma. The patient will return...") does not replace
    // the assessment's title for it.
    return assessmentItems.map((item, i) => makePairedProblem(item.text, i === 0 ? plan : ""));
  }

  // A numbered assessment with an unnumbered plan paragraph (a common
  // consult format: "IMPRESSION: 1. A 2. B" then one plan paragraph): the
  // assessment items are the problems. The plan paragraph is not split
  // across them, because the source does not say which part belongs to
  // which problem; it rides on the first problem whole.
  if (assessmentItems.length >= 2 && planItems.length === 0) {
    const paired = assessmentItems.map((item, i) => makePairedProblem(item.text, i === 0 ? plan : ""));
    return paired;
  }

  if (assessmentItems.length === 0 && planItems.length === 0) {
    if (parsedProblems.length > 1) return parsedProblems;
    // An examination-statement paragraph states no problem title (D5).
    if (opensWithExaminationStatement(assessment)) return [];
    return [makePairedProblem(assessment, plan)];
  }

  // Single assessment paragraph ("Right ankle sprain.") with a numbered
  // plan: one problem carrying the whole plan text (a lead sentence like
  // "Our recommendations are as follows:" is plan content, not an item),
  // unless the plan items carry their own problem titles.
  if (
    assessmentItems.length === 0 &&
    planItems.length > 0 &&
    !planItems.some((item) => planItemHasProblemTitle(item.text))
  ) {
    if (opensWithExaminationStatement(assessment)) return parsedProblems;
    return [makePairedProblem(assessment, plan)];
  }

  return parsedProblems;
}

// Combined A/P partition helpers (settlement C4). The segment and marker
// rules mirror the gold partition in build_gold.py: a problem block starts
// at a numbered item, a bullet, a labeled plan line, a problem-list header,
// or a bare title line followed by a bullet.
const PARTITION_LABELED_PLAN = /^(?:diagnostic|therapeutic|treatment|management)\s+plan\s*:/i;
const PARTITION_PROBLEM_LIST_HEADS = new Set(["problems", "problem list", "active problems", "assessment", "impression", "diagnoses", "diagnosis"]);

function partitionSegments(text) {
  const segments = [];
  for (const rawLine of String(text || "").split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^[-=_*~. ]{3,}$/.test(line)) continue; // separator-only line: chart chrome
    line = line.replace(/^[-=_*~]{3,}\s+/, "");
    // Flattened numbered items sit directly after sentence punctuation
    // ("...rate control.,2. Carotid..."). The digit guard keeps decimals
    // ("1.5 after") whole.
    line = line.replace(/(?<![0-9])([.,;])\s*(\d{1,2}[.)]\s)/g, "$1\n$2");
    for (const part of line.split("\n")) {
      for (const piece of part.split(/\s{2,}(?=-)/)) {
        const segment = piece.trim();
        if (segment) segments.push(segment);
      }
    }
  }
  return segments;
}

// A period-terminated title segment (settlement round 2, D1(a)): a short
// noun phrase closed by a period, with no finite verb. Synthesis sentences
// carry finite verbs, so they never qualify; "Diabetes mellitus type 2."
// does, and segments exactly like the unterminated form.
const PARTITION_FINITE_VERB = /\b(?:is|are|was|were|has|have|had|will|would|shall|should|can|could|may|might|presents?|presented|reports?|reported|denies|denied|complains?|shows?|showed|remains?|remained|continues?|continued|requires?|required|needs?|needed|appears?|appeared|seems?|includes?|including)\b/i;

function partitionPeriodTitle(s) {
  if (!/\.$/.test(s) || /\.\.$/.test(s)) return false;
  const bare = s.slice(0, -1).trim();
  return bare.length <= 80 && !/[.!?]/.test(bare) && !PARTITION_FINITE_VERB.test(bare);
}

// A segment that states a differential list for the title above it
// ("Differential includes MI, GERD, costochondritis."): it is that
// problem's own content, so a title followed by this segment and then its
// plan bullets still opens the problem block at the title (verifier S2).
function partitionDiffStatement(s) {
  return /^(?:the\s+)?differential\b[^.]*\b(?:includes?|included|consists of)\b/i.test(s)
    || /^(?:differential|ddx)\s*:/i.test(s);
}

function partitionIsMarker(segments, i) {
  const s = segments[i];
  if (/^\d{1,2}[.)]\s/.test(s)) return true;
  if (/^[-•*]\s?/.test(s)) return true;
  if (PARTITION_LABELED_PLAN.test(s)) return true;
  if (PARTITION_PROBLEM_LIST_HEADS.has(s.toLowerCase().replace(/[:\s]+$/, ""))) return true;
  // A bare title followed by a bullet (its plan lines), or a title-only
  // problem followed by another bare title whose bullets follow: the first
  // title is a problem with no plan lines, not synthesis. Synthesis
  // sentences end in sentence punctuation, so they never qualify; a
  // period-terminated title (D1(a)) is the one exception.
  if (s.length > 100) return false;
  if (/[.!?]$/.test(s) && !partitionPeriodTitle(s)) return false;
  if (i + 1 < segments.length && /^[-•*]/.test(segments[i + 1])) return true;
  if (i + 2 < segments.length && partitionDiffStatement(segments[i + 1]) && /^[-•*]/.test(segments[i + 2])) return true;
  return i + 2 < segments.length
    && (!/[.!?]$/.test(segments[i + 1]) || partitionPeriodTitle(segments[i + 1])) && segments[i + 1].length <= 100
    && !/^[-•*]/.test(segments[i + 1]) && !/^\d{1,2}[.)]\s/.test(segments[i + 1])
    && /^[-•*]/.test(segments[i + 2]);
}

// A short well-being lead: the patient's general state and nothing else
// (no comma, so no compound content), never a problem statement.
function partitionWellBeingLead(s) {
  return s.length <= 60 && !/,/.test(s)
    && /\b(?:doing well|doing fine|feels? well|feeling well|no complaints|in no (?:acute )?distress|is stable|remains stable|stable condition)\b/i.test(s);
}

// A directive sentence inside an unmarked combined body: an action lead
// ("Continue ...", "Schedule ..."), a first-person directive ("I
// instructed her to ..."), or a "Please ..." instruction. Used only when
// the body states no problem-block marker at all.
function partitionDirectiveSentence(s) {
  if (!/[.!?]$/.test(s)) return false;
  if (ACTION_LEAD.test(s)) return true;
  if (/^(?:i|we)\s+(?:instructed|advised|prescribed|dispensed|ordered|started|continued|discussed|recommended|will|would)\b/i.test(s)) return true;
  return /^please\b/i.test(s);
}

// Sentence split for an unmarked combined body: a flattened note holds
// the whole body on one physical line, so the synthesis/directive split
// reads it at sentence granularity. A piece ending in an abbreviation
// period ("Ms.", "Dr.", a single letter) does not end the sentence.
function splitPartitionSentences(segment) {
  const pieces = String(segment).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
  const out = [];
  for (const piece of pieces) {
    const p = piece.trim();
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && /(?:^|\s)(?:[A-Za-z]|Dr|Mr|Mrs|Ms|St|vs|No)\.$/.test(prev)) {
      out[out.length - 1] = `${prev} ${p}`;
    } else {
      out.push(p);
    }
  }
  return out;
}

function partitionCombinedPlanText(text) {
  const segments = partitionSegments(text);
  const idx = segments.findIndex((_, i) => partitionIsMarker(segments, i));
  if (idx < 0) {
    // No problem block is stated. One narrow C4 case remains (settlement
    // round 2, D5, SHIELD 7badfee069cd): the body opens with a short
    // well-being sentence ("Ms. Clifton is doing well.") and then turns
    // to directive sentences. The well-being sentence is the assessment,
    // the directives are the plan, and no problem title is stated. A
    // narrative lead that states a problem keeps the single-problem
    // reading, so the split is gated on the well-being lead alone.
    const sentSegs = segments.flatMap(splitPartitionSentences);
    const useSegs = sentSegs.length > segments.length ? sentSegs : segments;
    const first = useSegs[0] || "";
    if (useSegs.length > 1 && partitionWellBeingLead(first)) {
      const d = useSegs.findIndex((seg, j) => j > 0 && partitionDirectiveSentence(seg)
        && useSegs.slice(1, j).every((s) => !partitionDirectiveSentence(s) && /[.!?]$/.test(s)));
      if (d > 0) {
        return {
          synthesis: useSegs.slice(0, d).join(" "),
          problemText: useSegs.slice(d).join("\n"),
          foundMarker: true,
          directiveSplit: true,
          segments
        };
      }
    }
    return { synthesis: segments.join(" "), problemText: "", foundMarker: false, segments };
  }
  return {
    synthesis: segments.slice(0, idx).join(" "),
    problemText: segments.slice(idx).join("\n"),
    foundMarker: true,
    segments
  };
}

// A bare title segment inside a partitioned combined body: no sentence-
// final punctuation, short, followed by a bullet (its plan lines) or by
// another bare title whose bullets follow (a title-only problem in front
// of a titled problem). Mirrors the title-start rule in gold's splitter.
function partitionIsTitleStart(segments, i) {
  const s = segments[i];
  if (/^\d{1,2}[.)]\s/.test(s) || /^[-•*]\s?/.test(s) || PARTITION_LABELED_PLAN.test(s)) return false;
  if (PARTITION_PROBLEM_LIST_HEADS.has(s.toLowerCase().replace(/[:\s]+$/, ""))) return false;
  if (s.length > 100) return false;
  if (/[.!?]$/.test(s) && !partitionPeriodTitle(s)) return false;
  if (i + 1 < segments.length && /^[-•*]/.test(segments[i + 1])) return true;
  if (i + 2 < segments.length && partitionDiffStatement(segments[i + 1]) && /^[-•*]/.test(segments[i + 2])) return true;
  return i + 2 < segments.length
    && (!/[.!?]$/.test(segments[i + 1]) || partitionPeriodTitle(segments[i + 1])) && segments[i + 1].length <= 100
    && !/^[-•*]/.test(segments[i + 1]) && !/^\d{1,2}[.)]\s/.test(segments[i + 1])
    && /^[-•*]/.test(segments[i + 2]);
}

// An eye-style dash item ("-Refractive Error OU"): the head phrase before
// the first wide-space run carries an OU/OS/OD token and does not start
// with "s/p". Such an item is a stated problem title, never a directive.
function partitionDashItemStart(segment) {
  const text = String(segment || "").replace(/^[-•*]\s?/, "");
  const head = text.split(/\s{2,}/)[0];
  return /\b(?:OU|OS|OD)\b/.test(head) && !/^s\/p\b/i.test(head);
}

// True when a partitioned combined A/P body is a list of single-segment
// items that are all bare directives (action-led, pronoun-led,
// conditional, dosed orders, or verbless directive fragments). Such a body
// states plan content only, the same reading the plan-only rule applies to
// a recommendations list. Blocks are grouped with the block-start rules
// the gold reader uses: a bullet plan line joins the titled block above
// it and starts its own block only in a dash list of titled items or an
// all-bullets body, so a titled problem always spans more than one
// segment and is safe by construction.
function partitionBlocksAllDirectives(segments) {
  const first = segments.findIndex((_, i) => partitionIsMarker(segments, i));
  if (first < 0) return false;
  const body = segments.slice(first);
  const isBullet = (s) => /^[-•*]\s?/.test(s);
  const dashList = body.filter((s) => isBullet(s) && partitionDashItemStart(s)).length >= 2;
  const allBullets = body.every(isBullet);
  const starts = (i) => {
    const s = body[i];
    return /^\d{1,2}[.)]\s/.test(s) || partitionIsTitleStart(body, i) || PARTITION_LABELED_PLAN.test(s)
      || (dashList && isBullet(s) && partitionDashItemStart(s))
      || (allBullets && !dashList && isBullet(s));
  };
  const blocks = [];
  for (let i = 0; i < body.length; i++) {
    if (starts(i) || !blocks.length) blocks.push([]);
    blocks[blocks.length - 1].push(body[i]);
  }
  if (!blocks.length) return false;
  return blocks.every((block) => {
    if (block.length !== 1) return false;
    const segment = block[0];
    if (PARTITION_LABELED_PLAN.test(segment)) return false;
    if (!/^(\d{1,2}[.)]|#\d{1,2}\b|[-•*])/.test(segment)) return false;
    if (partitionDashItemStart(segment)) return false;
    const text = segment.replace(/^(\d{1,2}[.)]|#\d{1,2}\b[.:)]?|[-•*])\s*/, "");
    return isBareActionItem(text);
  });
}

// Inline heading segmentation (redesign, 2026-10-13): some note sources
// deliver a whole note as one physical line with its section headings inline
// ("...,HISTORY OF PRESENT ILLNESS: , ...", the MTSamples mirror format), and
// some Epic pastes place a heading mid-line after a sentence. The section
// loop below works one heading per line, so a line that carries ALL-CAPS
// headings is first split at those headings: the text before a heading stays
// with the section that was already open, and each heading starts its own
// line. Only ALL-CAPS or Title Case surfaces count (that is how these notes
// set headings mid-line), the heading must be a recognized section alias,
// and a trailing comma or semicolon left by line-break flattening is
// dropped at the split point.
const INLINE_HEADING_SCAN = /(^|[.,;]\s*|\s{2,}|[)]\s+)([A-Z][A-Za-z/&'()\- ]{2,60}?):(?=[\s,A-Z]|$)/g;

// Connector words stay lowercase inside real headings ("Reason for
// Referral", "History of Present Illness"); a Title Case surface
// capitalizes every other word.
const HEADING_CONNECTOR_WORDS = new Set(["for", "of", "and", "the", "in", "on", "a", "an", "&"]);

function isInlineHeadingSurface(surface) {
  const letters = surface.replace(/[^A-Za-z]/g, "");
  // A two-letter surface is trusted only in ALL CAPS and only when it
  // resolves to a known alias: "A/P:" in flattened multi-day progress
  // notes (mts-1348) carries just the letters A and P, and rejecting it
  // left every repeated A/P block inside the previous S or O section
  // (settlement round 2, D1(c)).
  if (letters.length < 3) {
    return letters.length === 2 && surface === surface.toUpperCase() && !!definitionFor(surface);
  }
  const isCaps = surface === surface.toUpperCase();
  // Title Case surfaces also count ("...in her face. Vital signs: ..."):
  // capitalized content words are how these notes set a heading mid-line,
  // and the candidate still has to resolve to a recognized section alias,
  // so ordinary prose phrases never qualify.
  const words = surface.split(/[\s/]+/).filter(Boolean);
  const isTitleCase = words.some((w) => /^[A-Z]/.test(w))
    && words.every((w) => /^[A-Z]/.test(w) || HEADING_CONNECTOR_WORDS.has(w.toLowerCase()));
  if (!isCaps && !isTitleCase) return false;
  return !!definitionFor(surface) || isTeamPlanHeading(normalizeHeading(surface));
}

// Bare headings (round 2, verdict Rule 4): flattened therapy notes state
// their SOAP headings as bare Title-Case words bounded by wide spacing, with
// no colon ("...HEP.           Plan  Duration in visits: 3 ..."). A bare
// surface counts only when it is one of the four SOAP words, set in Title
// Case or ALL CAPS, and the note states the pattern more than once (or it is
// the only heading signal in the line): a single bare word inside prose is
// not a heading.
const BARE_HEADING_SCAN = /(^|\s{2,})(Subjective|Objective|Assessment|Plan|SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)(?=\s{2,}\S)/g;

// Single-letter SOAP labels (S:/O:/A:/P:) in SBAR transfer notes and terse
// SOAP notes sit at wide-space boundaries inside one long line
// ("...stable.    B: ...    A: ..."). The general inline scan requires
// three or more letters, so these labels never split a line. A single
// letter counts only when the line states two or more of them: one letter
// alone is how prose talks ("option A: ..."), two or more are a structure.
// The colon may carry a space before it ("S : ...", SHIELD 01f71927) and
// the content may start immediately after it ("HPI:Patient ..." shape).
const SINGLE_LETTER_SCAN = /(^|\s{2,}|[.,;]\s*)([SOAP])\s*:(?=[\s,A-Z]|$)/g;

function segmentInlineHeadings(line) {
  if (!line || line.length < 120) return [line];
  const points = [];
  for (const match of line.matchAll(INLINE_HEADING_SCAN)) {
    const surface = match[2].trim();
    if (isInlineHeadingSurface(surface)) {
      points.push({ start: match.index + match[1].length, surface, end: match.index + match[0].length });
      continue;
    }
    // A rejected surface can swallow a real heading that follows a wide
    // gap ("...Precautions:   Sternal    Subjective:   ..." scans as the
    // surface "Sternal    Subjective"; "...Bilateral       Past Surgical
    // History:" scans as one rejected surface whose last chunk is the
    // heading, SHIELD 8c7e15ee). Only the chunk after the LAST wide gap
    // is tried, and only its trailing runs of one to four words: without
    // the wide-gap boundary, any rejected surface ending in an alias
    // word ("IDENTIFYING DATA" -> "Data") would split spuriously.
    const gaps = [...surface.matchAll(/\s{2,}/g)];
    if (gaps.length) {
      const lastGap = gaps[gaps.length - 1];
      const chunk = surface.slice(lastGap.index + lastGap[0].length).trim();
      const chunkWords = chunk.split(/\s+/).filter(Boolean);
      // Longest runs first. A one-word run counts only when it is the
      // whole chunk: a lone trailing word is usually the end of a
      // longer form label ("VAD Relevant History:" is not an HPI
      // heading), while a multi-word run can carry its own qualifier
      // words ("the Past Surgical History").
      const runLengths = [];
      for (let k = Math.min(4, chunkWords.length); k >= 2; k--) runLengths.push(k);
      if (chunkWords.length === 1) runLengths.push(1);
      for (const k of runLengths) {
        const candidate = chunkWords.slice(-k).join(" ");
        if (candidate === surface.trim()) continue;
        if (isInlineHeadingSurface(candidate)) {
          const start = match.index + match[1].length + surface.lastIndexOf(candidate);
          points.push({ start, surface: candidate, end: match.index + match[0].length });
          break;
        }
      }
    }
  }
  const letterPoints = [];
  for (const match of line.matchAll(SINGLE_LETTER_SCAN)) {
    const surface = match[2];
    if (!definitionFor(surface)) continue;
    letterPoints.push({ start: match.index + match[1].length, surface, end: match.index + match[0].length });
  }
  if (letterPoints.length >= 2) {
    points.push(...letterPoints);
    points.sort((a, b) => a.start - b.start);
  }
  const barePoints = [];
  for (const match of line.matchAll(BARE_HEADING_SCAN)) {
    const surface = match[2];
    if (!definitionFor(surface)) continue;
    barePoints.push({ start: match.index + match[1].length, surface, end: match.index + match[0].length });
  }
  if (barePoints.length >= 2 || (barePoints.length === 1 && points.length === 0)) {
    points.push(...barePoints);
    points.sort((a, b) => a.start - b.start);
  }
  if (!points.length) return [line];
  const segments = [];
  const prefix = line.slice(0, points[0].start).replace(/[;,\s]+$/, "");
  if (prefix.trim()) segments.push(prefix);
  points.forEach((point, i) => {
    const segEnd = i + 1 < points.length ? points[i + 1].start : line.length;
    let body = line.slice(point.end, segEnd).replace(/^[;,\s]+/, "").replace(/[;,\s]+$/, "");
    segments.push(`${point.surface}:${body ? ` ${body.trim()}` : ""}`);
  });
  return segments.length > 1 || prefix.trim() ? segments : [line];
}

function definitionFor(candidate) {
  const normalized = normalizeHeading(candidate);
  if (!normalized) return null;
  const match = HEADING_DEFINITIONS.find((definition) => definition.aliases.includes(normalized));
  if (match) return match;
  if (isTeamPlanHeading(normalized)) {
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
  // Only a vitals line gets this treatment (see the comment above): a lab
  // heading that reports "None" is a stated section whose content is
  // "None", and it opens its section like any other heading.
  if (!["vital signs", "vitals"].includes(normalizeHeading(match.heading))) return false;
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

  // Bare SOAP heading at a line start (round 2): "Subjective  Pt reports
  // ..." with the word set off by wide spacing and no colon. The inline
  // bare-heading scan only runs inside lines of 120+ characters; a short
  // line states the same heading. The surface is one of the four SOAP
  // words in Title Case or ALL CAPS, the same surfaces the scan accepts.
  if (!bulletMatch) {
    const bareSoap = headingText.match(/^(Subjective|Objective|Assessment|Plan|SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)\s{2,}(\S.*)$/);
    if (bareSoap) {
      const definition = definitionFor(bareSoap[1]);
      if (definition) {
        return { definition, heading: bareSoap[1], inlineText: bareSoap[2].trim(), prefixText: "" };
      }
    }
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
  let imagingBlockHasExam = false;
  let combinedPlanHeading = false;
  let combinedPlanHeadingCount = 0;

  const flush = () => {
    appendBlock(blocks, activeField, compactBlock(activeLines));
    activeLines = [];
  };

  for (const line of source.split("\n").flatMap(segmentInlineHeadings)) {
    // Setext/markdown underline rows ("===", "~~~") are formatting, not content.
    // ("---" alone is not skipped: it may wrap a header like "--- Chief Complaint ---".)
    if (/^[=~]{3,}\s*$/.test(line.trim())) continue;
    // Note-header metadata before the first recognized heading is chart
    // chrome ("Date: 09/20/2026 Author: J. Smith, MD Pager: 1234"), never
    // Subjective/Other content. The skip is bounded to short lines: a
    // flattened note is a single line, and skipping a 1,400-character
    // line that merely STARTS with "Date:" discarded the whole note
    // (SHIELD f9a39466, a nursing flowsheet with no recognized headings).
    if (activeField === fallbackField && line.trim().length <= 240 && NOTE_HEADER_METADATA.test(line.trim())) continue;
    // Inside an Assessment/Plan section, "#..." lines are problem entries for
    // parseClinicalPlanProblems, not markdown headings. Without this guard a
    // line like "#DVT prophylaxis" is stolen as a VTE-prophylaxis section
    // heading and everything after it is swallowed into the wrong field.
    const inPlanSection = activeField === "plan";
    const rawMatch = inPlanSection && /^(?:#|[-•]\s)/.test(line.trim()) ? null : headingMatch(line);
    const match = rawMatch && isNoDataHeader(rawMatch) ? null : rawMatch;
    if (!match) {
      activeLines.push(line);
      continue;
    }

    const priorField = activeField;
    // Captured before flush() empties the pending lines: whether the field
    // being left already holds any content of its own.
    const priorHadContent = activeLines.some((l) => l.trim()) || (blocks.get(priorField) || []).length > 0;
    flush();
    if (match.prefixText) appendBlock(blocks, fallbackField, match.prefixText);
    const normalizedMatchHeading = normalizeHeading(match.heading);
    // Inside an imaging block, "Exam"/"Examination" subheadings stay
    // with the study. An "Impression" subheading stays with the study
    // only in a full radiology report, where an Exam subheading has
    // already appeared in the block ("Imaging: CT head / Exam:
    // Noncontrast head CT / Impression: No hemorrhage", the repo
    // suite's radiology case). Where the block states findings without
    // an Exam subheading, the Impression is the note's own diagnostic
    // statement and lands in Assessment (settlement round 2, D4:
    // mts-1320 "Impression: prostatic malignancy..." and SHIELD
    // bc5d8237 both read as the assessment; the round 2 dispute on
    // mts-1320 is resolved to that reading).
    const isExamSubheading = insideImagingBlock && ["exam", "examination"].includes(normalizedMatchHeading);
    if (isExamSubheading) imagingBlockHasExam = true;
    const imagingSubheading = isExamSubheading
      || (insideImagingBlock && normalizedMatchHeading === "impression" && imagingBlockHasExam);
    // A vitals heading is an Objective heading by the definitions above and
    // lands in Objective (redesign, 2026-10-13: Rule 4, text under a heading
    // lands in that heading's field). Two narrow exceptions stay in the
    // exam: a no-data vitals line ("Vitals: Not obtained..."), which is a
    // finding about the exam and never opens a section at all (handled by
    // isNoDataHeader above), and a vitals label that opens a physical exam
    // before the exam has any content of its own, where the label is the
    // exam's first line rather than a standalone vitals section. A vitals
    // label after exam content is a standalone vitals section even when its
    // text is qualitative ("VITAL SIGNS: She has been afebrile since
    // admission. Vital signs have been stable."): the note set it as its
    // own labeled segment, so it lands in Objective.
    const vitalsOpensExam = priorField === "physical_exam"
      && ["vital signs", "vitals"].includes(normalizedMatchHeading)
      && !priorHadContent;
    activeField = imagingSubheading
      ? "objective"
      : vitalsOpensExam
        ? priorField
        : match.definition.stayWithPlan && priorField === "plan"
          ? priorField
          : fieldFor(match.definition, noteType, availableFields) || fallbackField;
    if (activeField === "plan" && COMBINED_ASSESSMENT_PLAN_ALIASES.has(normalizeHeading(match.heading))) {
      combinedPlanHeading = true;
      combinedPlanHeadingCount += 1;
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
    // Only an "Imaging" heading opens an imaging-report block (the kind of
    // block that carries its own "Impression:" subheading). A "Diagnostic
    // Studies" note section is a section, not a report: the "Impression"
    // that follows it is the note's assessment, not an imaging impression.
    insideImagingBlock = imagingSubheading || normalizedMatchHeading === "imaging";
    if (!insideImagingBlock) imagingBlockHasExam = false;
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

  // Only an explicitly labeled source section supplies a one-liner.
  // Clinician synthesis belongs in the editable one-liner, not a parser guess.
  const detectedFieldIds = [...new Set(detected.map(({ fieldId }) => fieldId).filter((fieldId) => transformedSections[fieldId]))];

  // Combined Assessment and Plan partition (settlement C4): the combined
  // section's text is partitioned, never copied. The leading synthesis
  // sentences (before the first problem block) are the assessment; the
  // problem blocks are the plan. When the body states no problem blocks,
  // the whole body stays in the plan field and the assessment stays empty.
  let combinedAllDirectives = false;
  let partitionSynthesis = "";
  let partitionFound = false;
  let partitionDirectiveSplit = false;
  if (combinedPlanHeading) {
    // A note that repeats its combined heading (multi-day progress notes
    // with an A/P block per day, mts-1348) states one combined section per
    // occurrence: the partition runs per block, because running it over
    // the joined field text reads the first day's problem block as the
    // synthesis of the whole field and moves it into the assessment
    // (settlement round 2, D1(c)).
    const applyPartition = (synthesis, problemText, segmentsList, directiveSplit = false) => {
      partitionSynthesis = synthesis;
      partitionFound = true;
      partitionDirectiveSplit = directiveSplit;
      transformedSections.plan = problemText;
      if (synthesis) {
        const existing = String(transformedSections.assessment || "").trim();
        transformedSections.assessment = existing ? `${existing}\n\n${synthesis}` : synthesis;
      }
      // Only with no synthesis: a stated synthesis is a problem statement,
      // and the directive items are that problem's plan, not a standalone
      // directive list.
      combinedAllDirectives = !synthesis && segmentsList.every((segments) => partitionBlocksAllDirectives(segments));
    };
    if (combinedPlanHeadingCount > 1) {
      const syntheses = [];
      const problemTexts = [];
      const segmentsList = [];
      let anyFound = false;
      let allDirectiveSplit = true;
      for (const blockText of String(transformedSections.plan || "").split(/\n\n+/)) {
        if (!blockText.trim()) continue;
        const part = partitionCombinedPlanText(blockText);
        segmentsList.push(part.segments);
        if (part.foundMarker) {
          anyFound = true;
          if (!part.directiveSplit) allDirectiveSplit = false;
          if (part.synthesis) syntheses.push(part.synthesis);
          if (part.problemText) problemTexts.push(part.problemText);
        } else {
          allDirectiveSplit = false;
          problemTexts.push(blockText);
        }
      }
      if (anyFound) applyPartition(syntheses.join(" "), problemTexts.join("\n\n"), segmentsList, allDirectiveSplit);
    } else {
      const { synthesis, problemText, foundMarker, segments, directiveSplit } = partitionCombinedPlanText(String(transformedSections.plan || ""));
      if (foundMarker) applyPartition(synthesis, problemText, [segments], !!directiveSplit);
    }
  }
  const planProblems = parseClinicalPlanProblems(transformedSections.plan || "");
  // A stated problem list (PROBLEM LIST / MEDICAL PROBLEM LIST / ACTIVE
  // PROBLEMS section) names the note's problems directly, ahead of every
  // other convention (the gold reader checks it first): the list items are
  // the problems, and the note's plan text is their plan as a whole,
  // carried on the first problem. Only the list block's own items count; a
  // later assessment section in the same field is not part of the list.
  let statedProblemList = null;
  {
    const PROBLEM_LIST_HEADINGS = ["principal problem", "active problems", "resolved problems", "active hospital problems", "problem list", "medical problem list", "diagnoses"];
    const assessEntries = detected.filter((entry) => entry.fieldId === "assessment");
    const problemListIndex = assessEntries.findIndex((entry) => PROBLEM_LIST_HEADINGS.includes(normalizeHeading(entry.heading)));
    if (problemListIndex >= 0 && String(transformedSections.assessment || "").trim()) {
      const assessBlocks = String(transformedSections.assessment).split(/\n\n+/);
      const listText = assessBlocks[problemListIndex] || assessBlocks[0] || "";
      const items = extractNumberedPlanItems(listText);
      if (items.length) statedProblemList = items.map((item) => item.text);
      else {
        const bullets = listText.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[-•]\s+/.test(line));
        if (bullets.length) statedProblemList = bullets.map((line) => line.replace(/^[-•]\s+/, ""));
      }
    }
  }
  let parsedProblems;
  if (statedProblemList) {
    const planWhole = String(transformedSections.plan || "");
    parsedProblems = statedProblemList.map((text, i) => makePairedProblem(text, i === 0 ? planWhole : ""));
  } else if (combinedPlanHeading) {
    // A combined heading's own blocks are the note's problems: a separate
    // diagnoses list elsewhere in the note does not override them (the
    // gold reader's combined branch reads the combined section first).
    // The one pairing a combined section keeps is its own synthesis: a
    // synthesis plus bare plan items is one problem, titled by the
    // synthesis, carrying the items as its plan.
    const combinedItems = longestSequentialRun(extractNumberedPlanItems(String(transformedSections.plan || "")));
    if (partitionFound && partitionSynthesis && combinedItems.length
      && combinedItems.every((item) => isBareActionItem(item.text))
      && planProblems.length === combinedItems.length) {
      parsedProblems = [makePairedProblem(partitionSynthesis, combinedItems.map((item) => item.text).join("\n"))];
    } else {
      parsedProblems = planProblems;
    }
  } else {
    parsedProblems = pairAssessmentPlanProblems(transformedSections.assessment, transformedSections.plan, planProblems);
  }
  // A combined A/P body whose blocks are all bare directives states no
  // problem titles: the directives stay in the plan field, no problems.
  if (combinedAllDirectives && !statedProblemList) parsedProblems = [];
  // A combined body split at its first directive sentence (synthesis plus
  // unmarked directives) states no problem title either (D5).
  if (partitionDirectiveSplit && !statedProblemList) parsedProblems = [];
  // Plan-only text (no Assessment section, no combined heading): problems
  // exist only where the plan itself states problem titles. A numbered
  // list whose items are all bare directives ("1. GI consult..., 2.
  // Continue Levaquin...") states no titles, so it yields no problems; the
  // directives stay in the plan section text. The same holds for a lone
  // action-led directive parsed as a single problem. Titled problem blocks
  // (the Epic paste shape: a title line with its own plan lines) are not
  // numbered bare items and are never suppressed by this rule.
  if (!combinedPlanHeading && !String(transformedSections.assessment || "").trim()) {
    const planText = String(transformedSections.plan || "");
    const planItems = extractNumberedPlanItems(planText);
    const allBareNumbered = planItems.length > 0
      && planItems.every((item) => isBareActionItem(item.text))
      && parsedProblems.length === planItems.length;
    const only = parsedProblems[0];
    const onlyTitle = String(only?.title || only?.problem || "");
    // A lone problem parsed from one unbulleted paragraph whose title is a
    // full directive sentence ("To obtain a routine sonogram.") is a plan
    // with no stated problem title. A titled problem block is protected:
    // its plan lines are bulleted, or its title is a noun phrase rather
    // than a sentence.
    const singleDirective = planItems.length === 0 && parsedProblems.length === 1
      && !/^\s*[-•*>]/m.test(planText)
      && isBareActionItem(onlyTitle)
      && (ACTION_LEAD.test(onlyTitle) || /^(?:i|we|he|she|they|it)\s/i.test(onlyTitle) || /\.\s*$/.test(onlyTitle));
    // A plan-only bullet list states directives, not problems (verdict
    // Rule 2, fix (b)): when every plan line is a bullet, no title-plus-plan
    // structure was stated. The C3 fallback problem is exempt: labeled plan
    // content is never all bullets, because the label line itself is not a
    // bullet.
    const nonBlankLines = planText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const allBullets = parsedProblems.length > 0 && nonBlankLines.length > 0
      && nonBlankLines.every((l) => /^[-•*>]/.test(l));
    // A one-line plan answer ("Plan: Sedation    Starr, Farrell, MD 9:33
    // AM") states no title-plus-plan pair either (verdict Rule 4, fix (c)):
    // one line holds both parts only in the "Title: plan" shape with a
    // digit-free title candidate, which this line does not have (its first
    // colon sits inside "9:33").
    const singleLine = parsedProblems.length === 1 && planItems.length === 0 && nonBlankLines.length === 1;
    const colonTitle = /^([^:]{3,60}):\s*\S/.test(nonBlankLines[0] || "") && !/\d/.test((nonBlankLines[0] || "").split(":")[0]);
    if (allBareNumbered || singleDirective || allBullets || (singleLine && !colonTitle)) parsedProblems = [];
  }
  // Differential extraction is local (settlement round 2, D1(b)): a
  // differential attaches only to the problem whose own text states it.
  // Paired problems extract from their own assessment item and plan
  // blocks from their own block text, both inside the makers above. The
  // round 2 branch attachment (one stated set copied onto every problem
  // of the branch) is removed: on mts-1441 it smeared "hypercholesterolemia",
  // stated once as its own numbered problem ("9. Rule out
  // hypercholesterolemia"), onto all 12 problems of the note.
  // Differentials stated elsewhere in the note (an MDM paragraph, a
  // "COMPLEXITY:" segment) belong to the problem when the note has exactly
  // one (settlement C5): the paired and plan parses only see their own
  // sections, so a single-problem note gets one whole-note scan.
  if (parsedProblems.length === 1 && !(parsedProblems[0].differentials || []).length) {
    const stated = extractStatedDifferentials(rawSource);
    if (stated.length) {
      parsedProblems[0].differentials = dropRuleOutSelfDifferential(parsedProblems[0].title, stated);
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
