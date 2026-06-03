import assert from "node:assert/strict";
import {
  buildCleanupPrompt,
  checklistPrompt,
  newAdmissionChecklistPrompt,
  normalizeChecklistText,
  parseChecklist,
  validateChecklist
} from "../checklist.js";

function itemsByCategory(sections, category) {
  return sections.flatMap((section) => section.items).filter((item) => item.category === category);
}

function issueTypes(audit) {
  return audit.issues.map((issue) => issue.type);
}

const dkaChecklist = `BEDSIDE QUESTION CHECKLIST

SYMPTOM TRAJECTORY

Since yesterday, have you had any nausea or vomiting?: No / Yes, mild / Yes, severe / Other ___

How has your appetite been -- were you able to eat dinner last night and breakfast this morning?: Ate both full meals / Ate some / Could not eat / Other ___

Are you still feeling more thirsty than usual or urinating a lot?: No / Yes, thirst / Yes, urinating a lot / Both / Other ___

GLYCEMIC SAFETY

Have you felt shaky, sweaty, or lightheaded at any point since yesterday?: No / Yes / Other ___

DISCHARGE READINESS

Were you able to bring your insulin pen box from home?: Yes / No / Other ___

Do you have ketone test strips and a glucagon kit at home?: Yes, both / Ketone strips only / Glucagon only / Neither / Not sure / Other ___

SICK DAY KNOWLEDGE AND CONCERNS

If you get sick again and cannot eat, do you know what to do with your long-acting insulin?: Keep taking it / Stop it / Not sure / Other ___

What is your biggest concern about going home?: ___

TARGETED PHYSICAL EXAM CHECKLIST

VITAL SIGNS AND SUPPORT

Heart rate: ___

Blood pressure: ___

Oxygen support: Room air / Nasal cannula / Other ___

VOLUME EXAM

Mucous membranes: Moist / Dry / Tacky

Skin turgor: Normal / Decreased

Capillary refill: Less than 2 seconds / 2 seconds or more

ABDOMINAL EXAM

Abdominal tenderness: Absent / Present, location ___

Bowel sounds: Normal / Hyperactive / Hypoactive / Absent

SKIN LINES AND WOUNDS

IV access site: Clean and intact / Erythema or swelling / Not present

Insulin injection sites if visible: No lipohypertrophy / Lipohypertrophy present, location ___

ENDOCRINE FOOT SCREEN

Pedal pulses: Palpable bilaterally / Diminished / Absent

Monofilament sensation feet: Intact bilaterally / Diminished right / Diminished left / Diminished both

Foot skin integrity: Intact / Ulcer or wound present, location ___`;

const dkaSections = parseChecklist(dkaChecklist);
const dkaAudit = validateChecklist(dkaSections);
assert.equal(itemsByCategory(dkaSections, "bedside").length, 8, "DKA sample should parse 8 bedside questions");
assert.equal(itemsByCategory(dkaSections, "exam").length, 13, "DKA sample has 13 targeted exam item lines");
assert.ok(!issueTypes(dkaAudit).includes("bedside-count-low"), "DKA sample must not warn that bedside questions are zero");
assert.ok(dkaAudit.ok, "DKA sample should pass checklist quality validation");

const trailingColonChecklist = `BEDSIDE QUESTION CHECKLIST:
SYMPTOM TRAJECTORY:
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having chest pain now?: No / Yes / Other ___
Have you felt dizzy since yesterday?: No / Yes / Other ___
Were you able to eat breakfast?: Yes / Some / No / Other ___
What is your biggest concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST:
VITAL SIGNS AND SUPPORT:
Heart rate: ___
Blood pressure: ___
Oxygen support: Room air / Nasal cannula / Other ___`;
const trailingColonSections = parseChecklist(trailingColonChecklist);
assert.equal(itemsByCategory(trailingColonSections, "bedside").length, 5, "parent titles with colons should preserve bedside category");
assert.equal(itemsByCategory(trailingColonSections, "exam").length, 3, "parent titles with colons should preserve exam category");

const markdownChecklist = `Here is the checklist:

## BEDSIDE QUESTIONS
- SYMPTOM TRAJECTORY
1. How is your pain today? Better / Same / Worse / Other ___
2. Are you short of breath right now? No / Yes, mild / Yes, severe / Other ___
3. Have you been able to walk safely?: Yes / No / Not tried / Other ___
4. Are you eating and drinking enough?: Yes / Some / No / Other ___
5. What is your main concern today?: ___

## TARGETED EXAM
* VITAL SIGNS AND SUPPORT
* Respiratory rate: ___
* Oxygen support - Room air / Nasal cannula / Other ___
* ABDOMINAL EXAM
* Abdominal tenderness: Absent / Present, location ___`;
const markdownSections = parseChecklist(markdownChecklist);
assert.equal(itemsByCategory(markdownSections, "bedside").length, 5, "markdown and numbered question lines should parse");
assert.equal(itemsByCategory(markdownSections, "exam").length, 3, "markdown bullets and dash-separated options should parse");

const missingParentChecklist = `SYMPTOM TRAJECTORY
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having chest pain now?: No / Yes / Other ___

VITAL SIGNS AND SUPPORT
Heart rate: ___
Blood pressure: ___`;
const missingParentSections = parseChecklist(missingParentChecklist);
assert.equal(itemsByCategory(missingParentSections, "bedside").length, 2, "missing parent title should infer bedside questions");
assert.equal(itemsByCategory(missingParentSections, "exam").length, 2, "missing parent title should infer exam headings");

const badManeuverChecklist = `BEDSIDE QUESTION CHECKLIST
FUNCTION
Can you squeeze my fingers?: Yes / No
How is your breathing today?: Normal / A little hard / Very hard / Other ___
Are you having pain right now?: No / Yes / Other ___
Have you felt dizzy today?: No / Yes / Other ___
What is your main concern today?: ___

TARGETED PHYSICAL EXAM CHECKLIST
VITAL SIGNS AND SUPPORT
Respiratory rate: ___`;
const badManeuverAudit = validateChecklist(parseChecklist(badManeuverChecklist));
assert.ok(issueTypes(badManeuverAudit).includes("bedside-exam-maneuver"), "bedside exam maneuvers should still warn");

const badBlankChecklist = `TARGETED PHYSICAL EXAM CHECKLIST
MUSCULOSKELETAL STRENGTH EXAM
Upper extremity strength: ___ / 5`;
const badBlankAudit = validateChecklist(parseChecklist(badBlankChecklist));
assert.ok(issueTypes(badBlankAudit).includes("bad-blank-format"), "bad blank fraction formats should still warn");

const normalized = normalizeChecklistText("BEDSIDE QUESTION CHECKLIST:\n- How are you? Better / Worse / Other ___");
assert.ok(normalized.includes("How are you?: Better / Worse / Other ___"), "normalization should recover question-plus-options lines");

assert.ok(checklistPrompt.includes("Parent checklist titles must be the exact all-caps lines above, with no colon."), "main prompt should include strict parent-title contract");
assert.ok(!checklistPrompt.includes("BEDSIDE QUESTION CHECKLIST:"), "main prompt should not show colon after parent title");
assert.ok(checklistPrompt.includes("<student_exam_reference>"), "main prompt should include the student exam reference block");
assert.ok(checklistPrompt.includes("Use it as a floor, not a ceiling"), "exam reference should guide, not restrict, OpenEvidence");
assert.ok(newAdmissionChecklistPrompt.includes("No prior SOAP note is available"), "new admission prompt should retain admission context");
assert.ok(newAdmissionChecklistPrompt.includes("full first-history admission write-up"), "new admission prompt should prioritize first-history write-up gaps");

const cleanupPrompt = buildCleanupPrompt("BEDSIDE QUESTION CHECKLIST:", { issues: [{ message: "Example issue" }] }, { userContext: "<user_context>\nService: Endocrinology\n</user_context>" });
assert.ok(cleanupPrompt.includes("Example issue"), "cleanup prompt should include audit issues");
assert.ok(cleanupPrompt.includes("<user_context>"), "cleanup prompt should preserve user context");
assert.ok(cleanupPrompt.includes("Parent checklist titles must be the exact all-caps lines above, with no colon."), "cleanup prompt should reuse the shared format contract");

console.log("Checklist parser tests passed.");
