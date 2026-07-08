import assert from "node:assert/strict";
import {
  CONTINUITY_REQUIRED_PROMPT_PHRASE,
  CONTINUITY_STORAGE_KEY,
  appendOrUpdateContinuityDay,
  buildSmartUpdateReview,
  buildContinuityChecklistContext,
  buildContinuityChecklistPrompt,
  buildContinuityUpdatePrompt,
  classifySmartUpdateSections,
  createContinuityCase,
  hasDailyInputs,
  normalizeContinuityCase,
  normalizeDailyInputs,
  smartSectionsToDailyInputs,
  stripRawDailyInputsForStorage
} from "../src/clinical/continuity.js";

assert.equal(CONTINUITY_STORAGE_KEY, "preRoundPatientCasesV1");

const patientCase = createContinuityCase({
  label: "Patient A",
  conversationCaseKey: "PREROUNDS-ABCD",
  baselineSummary: "T1DM admitted with DKA, gap closed.",
  activeProblems: "T1DM; hypokalemia",
  pendingItems: "Confirm discharge supplies."
}, new Date("2026-06-06T12:00:00Z"));

assert.equal(patientCase.label, "Patient A");
assert.equal(patientCase.days.length, 0);
assert.equal(normalizeContinuityCase({ label: "  Patient B  " }).label, "Patient B");

const dailyInputs = normalizeDailyInputs({
  todayNote: "Feels better today.",
  todayLabs: "K 3.4, glucose 180",
  updatedMar: "Glargine given.",
  overnightEvents: "No acute events.",
  subjectiveChange: "Less nausea.",
  rawExtra: "should not survive"
});
assert.equal(dailyInputs.rawExtra, undefined);
assert.ok(hasDailyInputs(dailyInputs));

const dayOne = appendOrUpdateContinuityDay(patientCase, {
  date: "2026-06-06",
  deidentifiedInputs: dailyInputs,
  copiedContinuityPrompt: true
}, new Date("2026-06-06T13:00:00Z"));
assert.equal(dayOne.days.length, 1);
assert.equal(dayOne.days[0].deidentifiedInputs.todayLabs, "K 3.4, glucose 180");

const updatedSameDay = appendOrUpdateContinuityDay(dayOne, {
  date: "2026-06-06",
  finalCompiledFindings: "Bedside findings ready.",
  roundsPasteBack: {
    schema: "open_evidence_rounds_pasteback_v1",
    presentationType: "oral_rounds_soap",
    plainTextSummary: "DKA improving; continue potassium monitoring."
  }
}, new Date("2026-06-06T15:00:00Z"));
assert.equal(updatedSameDay.days.length, 1, "same date should update rather than append");
assert.equal(updatedSameDay.days[0].finalCompiledFindings, "Bedside findings ready.");
assert.equal(updatedSameDay.days[0].roundsPasteBack.plainTextSummary, "DKA improving; continue potassium monitoring.");
assert.equal(updatedSameDay.days[0].deidentifiedInputs.todayNote, "Feels better today.");

const dayTwo = appendOrUpdateContinuityDay(updatedSameDay, {
  date: "2026-06-07",
  deidentifiedInputs: { subjectiveChange: "Eating full meals." }
}, new Date("2026-06-07T09:00:00Z"));
assert.equal(dayTwo.days.length, 2);
assert.equal(dayTwo.days[1].date, "2026-06-07");

const storagePatch = stripRawDailyInputsForStorage({
  rawInputs: { todayNote: "raw PHI text" },
  todayInputs: { todayNote: "also raw" },
  rawSections: [{ text: "raw section" }],
  deidentifiedInputs: { todayNote: "de-identified only" }
});
assert.equal(Object.hasOwn(storagePatch, "rawInputs"), false);
assert.equal(Object.hasOwn(storagePatch, "todayInputs"), false);
assert.equal(Object.hasOwn(storagePatch, "rawSections"), false);
assert.equal(storagePatch.deidentifiedInputs.todayNote, "de-identified only");

const smartSections = classifySmartUpdateSections(`Labs:
Glucose 140
K 4.1

---

MAR:
Glargine 18 units given

---

Overnight:
No acute events`);
assert.equal(smartSections.length, 3);
assert.equal(smartSections[0].type, "labs");
assert.equal(smartSections[1].type, "mar");
assert.equal(smartSections[2].type, "handoff");
const smartInputs = smartSectionsToDailyInputs(smartSections.map((section) => ({
  ...section,
  deidentifiedText: section.text.replace("Glargine", "Insulin glargine")
})));
assert.ok(smartInputs.todayLabs.includes("Glucose 140"));
assert.ok(smartInputs.updatedMar.includes("Insulin glargine"));
assert.ok(smartInputs.overnightEvents.includes("No acute events"));

const smartReview = buildSmartUpdateReview(smartSections.map((section) => ({
  ...section,
  deidentifiedText: section.text
})), dayOne);
assert.ok(smartReview.rows.some((row) => row.type === "labs" && row.status === "changed"));
assert.ok(smartReview.rows.some((row) => row.type === "subjective" && row.status === "missing"));
assert.ok(smartReview.rows.find((row) => row.type === "labs").details.some((detail) => /parsed lab row/i.test(detail)));
assert.ok(smartReview.rows.find((row) => row.type === "mar").details.some((detail) => /MAR line/i.test(detail)));

const mixedSmartSections = classifySmartUpdateSections(`Overnight events: N/V overnight, better after antiemetic.
Subjective: Less thirsty, still fatigued.
Today labs: K still low. Mg normal.
Updated MAR: Insulin drip 3u/hr. KCl IV given.
Plan: Continue insulin drip, recheck K.`);
assert.deepEqual(
  mixedSmartSections.map((section) => section.type),
  ["handoff", "subjective", "labs", "mar", "note"],
  "single mixed continuity paste should split section headings into bedside-review buckets"
);
const mixedSmartInputs = smartSectionsToDailyInputs(mixedSmartSections);
assert.ok(mixedSmartInputs.overnightEvents.includes("N/V overnight"));
assert.ok(mixedSmartInputs.subjectiveChange.includes("Less thirsty"));
assert.ok(mixedSmartInputs.todayLabs.includes("K still low"));
assert.ok(mixedSmartInputs.updatedMar.includes("Insulin drip"));
assert.ok(mixedSmartInputs.todayNote.includes("Continue insulin drip"));

const dayWithSmartReview = appendOrUpdateContinuityDay(dayOne, {
  date: "2026-06-06",
  smartUpdateReview: smartReview.rows,
  carryForwardUpdates: smartReview.carryForwardSuggestions
});
assert.equal(dayWithSmartReview.days[0].smartUpdateReview.length, smartReview.rows.length);

const updatePrompt = buildContinuityUpdatePrompt({
  patientCase: dayTwo,
  todayInputs: dailyInputs,
  userContext: "<user_context>\nService: Endocrinology consult\n</user_context>"
});
assert.ok(updatePrompt.startsWith(CONTINUITY_REQUIRED_PROMPT_PHRASE));
assert.ok(updatePrompt.includes("Today note:\nFeels better today."));
assert.ok(updatePrompt.includes("Today labs:\nK 3.4, glucose 180"));
assert.ok(updatePrompt.includes("Updated MAR:\nGlargine given."));
assert.ok(updatePrompt.includes("Overnight events:\nNo acute events."));
assert.ok(updatePrompt.includes("Subjective change:\nLess nausea."));
assert.ok(updatePrompt.includes("Do not ask me to paste yesterday's OpenEvidence report back into the app."));
assert.ok(!/paste yesterday.?s report back into the app/i.test(updatePrompt.replace("Do not ask me to paste yesterday's OpenEvidence report back into the app.", "")));
assert.ok(updatePrompt.includes("Output only changes since yesterday that could change what the student says, verifies, asks, escalates, monitors, or carries forward for rounds."));
assert.ok(updatePrompt.includes("Use at most 5 bullets total. Prefix each bullet with SAY, CHECK, ASK, WATCH, or CARRY-FORWARD."));
assert.ok(updatePrompt.includes("NO MANAGEMENT-CHANGING ITEMS FOUND."));
assert.ok(!updatePrompt.includes("Separate stable background, changed data, unresolved pending items, and new concerns."));
assert.ok(!updatePrompt.includes("Summarize what changed since yesterday."));

const checklistPrompt = buildContinuityChecklistPrompt({
  patientCase: dayTwo,
  todayInputs: dailyInputs
});
assert.equal(checklistPrompt, buildContinuityChecklistContext({ patientCase: dayTwo, todayInputs: dailyInputs }), "legacy continuity checklist export should return the local context");
assert.ok(checklistPrompt.includes("Use this de-identified local continuity context to build today's bedside checklist inside the app."));
assert.ok(checklistPrompt.includes("Do not ask OpenEvidence to generate the checklist."));
assert.doesNotMatch(checklistPrompt, /same OpenEvidence conversation|Now produce today's bedside checklist only/i);
assert.ok(checklistPrompt.includes("Today labs:\nK 3.4, glucose 180"));

console.log("Continuity tests passed.");
