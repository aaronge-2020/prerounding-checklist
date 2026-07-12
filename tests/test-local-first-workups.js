import assert from "node:assert/strict";
import { createChecklistReturnBundle, createChecklistReturnTransferFile, createPhoneChecklistTransferFile, decodeChecklistReturnBundle, decodeChecklistReturnInput, decodeChecklistReturnTransferFile, decodePhoneChecklistBundle, decodePhoneChecklistTransferFile, encodeChecklistReturnBundle, encodePhoneChecklistBundle, fillNegativeChecklistAnswers, mergeQuickNotes, mergeReturnedAnswers, setChecklistChoice } from "../src/checklist/state.js";
import { BUNDLED_WORKUPS } from "../src/workups/catalog.js";
import { createChecklistSnapshot } from "../src/workups/checklist-conversion.js";
import { buildWorkupAuthoringPrompt, effectiveWorkupCatalog, normalizeWorkup, parseWorkupJson, validateWorkup } from "../src/workups/schema.js";
import { buildJsonFormatterPrompt, buildOpenEvidenceWorkupDraftPrompt } from "../src/workups/editor.js";

const workup = normalizeWorkup(BUNDLED_WORKUPS[0]);
assert.equal(workup.schema, "prerounding_workup_v1");
assert.equal(workup.items.every((item) => item.kind === "history" || item.kind === "exam"), true);

assert.throws(
  () =>
    validateWorkup({
      schema: "prerounding_workup_v1",
      id: "bad",
      title: "Bad",
      items: [{ id: "x", kind: "order", text: "Order CT", choices: ["yes", "no"], select: "one" }]
    }),
  /kind must be history or exam/
);

const parsed = parseWorkupJson(JSON.stringify(workup));
assert.equal(parsed.id, workup.id);

const catalog = effectiveWorkupCatalog({
  [workup.id]: {
    ...workup,
    title: "Local override title"
  }
});
assert.equal(catalog.find((entry) => entry.id === workup.id).title, "Local override title");

const snapshot = createChecklistSnapshot([workup], { now: () => "2026-07-09T12:00:00.000Z", id: "checklist_test" });
assert.equal(snapshot.items.length, workup.items.length);
assert.equal(snapshot.items[0].choices.length >= 2, true);
assert.equal(typeof snapshot.items[0].system, "string");

let answers = {};
answers = setChecklistChoice(answers, snapshot.items[0], snapshot.items[0].choices[1], true);
assert.deepEqual(answers[snapshot.items[0].id].selected, [snapshot.items[0].choices[1]]);

const deskQuickNotes = [{ id: "note_desk", text: "Reports new hip pain, not admission-related.", createdAt: "2026-07-09T12:00:00.000Z" }];
const encodedPhone = encodePhoneChecklistBundle({
  schema: "prerounding_phone_checklist_bundle_v1",
  patientLabel: "Room 1",
  checklist: snapshot,
  answers,
  quickNotes: deskQuickNotes
});
const decodedPhone = decodePhoneChecklistBundle(encodedPhone);
assert.equal(decodedPhone.checklist.id, "checklist_test");
assert.equal(decodedPhone.checklist.items[0].system, snapshot.items[0].system);
assert.deepEqual(decodedPhone.quickNotes, deskQuickNotes);
const phoneTransferFile = createPhoneChecklistTransferFile({
  schema: "prerounding_phone_checklist_bundle_v1",
  patientLabel: "Room 1",
  checklist: snapshot,
  answers,
  quickNotes: deskQuickNotes
});
assert.deepEqual(decodePhoneChecklistTransferFile(JSON.stringify(phoneTransferFile)).answers, answers);
assert.deepEqual(decodePhoneChecklistTransferFile(JSON.stringify(phoneTransferFile)).quickNotes, deskQuickNotes);
assert.equal(decodePhoneChecklistTransferFile(JSON.stringify({ bundle: encodedPhone })).checklist.id, snapshot.id);
// Bundles created before quick notes existed must still decode cleanly.
assert.deepEqual(decodePhoneChecklistTransferFile(JSON.stringify({ bundle: encodedPhone })).quickNotes, deskQuickNotes);

const phoneQuickNotes = [{ id: "note_phone", text: "Patient mentions occasional palpitations.", createdAt: "2026-07-09T13:00:00.000Z" }];
const returnBundle = createChecklistReturnBundle(snapshot, answers, phoneQuickNotes);
const decodedReturn = decodeChecklistReturnBundle(encodeChecklistReturnBundle(returnBundle));
assert.deepEqual(mergeReturnedAnswers({}, decodedReturn, snapshot), answers);
assert.deepEqual(decodedReturn.quickNotes, phoneQuickNotes);
assert.deepEqual(mergeQuickNotes(deskQuickNotes, decodedReturn.quickNotes), [...deskQuickNotes, ...phoneQuickNotes]);
// Merging the same return twice must not duplicate notes already saved.
assert.deepEqual(mergeQuickNotes(mergeQuickNotes(deskQuickNotes, decodedReturn.quickNotes), decodedReturn.quickNotes), [...deskQuickNotes, ...phoneQuickNotes]);
const returnTransferFile = createChecklistReturnTransferFile(returnBundle);
assert.deepEqual(decodeChecklistReturnTransferFile(JSON.stringify(returnTransferFile)).answers, answers);
assert.deepEqual(decodeChecklistReturnTransferFile(JSON.stringify(returnTransferFile)).quickNotes, phoneQuickNotes);
assert.deepEqual(decodeChecklistReturnTransferFile(JSON.stringify({ bundle: encodeChecklistReturnBundle(returnBundle) })).answers, answers);
assert.throws(() => decodeChecklistReturnTransferFile(JSON.stringify({ ...phoneTransferFile, type: "checklist" })), /valid returned checklist bundle file/);

// The paste box must accept either the short return code or a pasted
// AirDropped transfer file's raw JSON contents.
assert.deepEqual(decodeChecklistReturnInput(encodeChecklistReturnBundle(returnBundle)).answers, answers);
assert.deepEqual(decodeChecklistReturnInput(JSON.stringify(returnTransferFile)).answers, answers);
assert.deepEqual(decodeChecklistReturnInput(`  ${JSON.stringify(returnTransferFile)}  `).answers, answers);

const bulkItems = [
  { id: "normal", choices: ["Normal", "Abnormal"] },
  { id: "negative", choices: ["Negative", "Positive"] },
  { id: "brief-baseline", choices: ["No", "Yes"] },
  { id: "free-text", choices: [] },
  { id: "answered", choices: ["Normal", "Abnormal"] }
];
const bulkResult = fillNegativeChecklistAnswers({ answered: { selected: ["Abnormal"], note: "Existing finding" } }, bulkItems);
assert.equal(bulkResult.changed, 3);
assert.deepEqual(bulkResult.answers.normal.selected, ["Normal"]);
assert.deepEqual(bulkResult.answers.negative.selected, ["Negative"]);
assert.deepEqual(bulkResult.answers["brief-baseline"].selected, ["No"]);
assert.equal(bulkResult.answers["free-text"], undefined);
assert.deepEqual(bulkResult.answers.answered, { selected: ["Abnormal"], note: "Existing finding" });

assert.match(buildWorkupAuthoringPrompt(workup), /Return only valid JSON/);
assert.match(buildWorkupAuthoringPrompt(workup), /history questions and physical exam items/);
assert.match(buildWorkupAuthoringPrompt(workup), /first choice must always be the negative, normal, absent, reassuring, or baseline finding/i);
assert.match(buildOpenEvidenceWorkupDraftPrompt(), /Put the negative, normal, absent, reassuring, or other baseline answer first/i);
assert.match(buildOpenEvidenceWorkupDraftPrompt({ thoroughness: "focused" }), /focused fast-rounds scope/i);
assert.match(buildOpenEvidenceWorkupDraftPrompt({ thoroughness: "thorough" }), /thorough teaching-level scope/i);
assert.match(buildOpenEvidenceWorkupDraftPrompt({ teamPreferences: { medicalService: "consult", serviceFocus: "Focus on infection source control." } }), /consulted clinical question/i);
assert.match(buildOpenEvidenceWorkupDraftPrompt({ teamPreferences: { medicalService: "consult", serviceFocus: "Focus on infection source control." } }), /infection source control/);
assert.doesNotMatch(buildOpenEvidenceWorkupDraftPrompt(), /[\[\]{}<>()`]/);
assert.doesNotMatch(buildOpenEvidenceWorkupDraftPrompt(), /^\s*(?:#|[-*]|\d+[.)])\s/m);
assert.doesNotMatch(buildOpenEvidenceWorkupDraftPrompt({ patientContext: "[De-identified] context", dailyTrajectory: "<Daily update>" }), /[\[\]{}<>()`]/, "workup prompts must remove bracketed patient-context syntax");
assert.match(buildJsonFormatterPrompt(), /first choice for every item must be the negative, normal, absent, reassuring, or baseline finding/i);

console.log("local-first workup/checklist tests passed");
