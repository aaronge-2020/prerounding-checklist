import assert from "node:assert/strict";
import { normalizePatient } from "../src/app/state/vault.js";
import { encryptVaultPayload, decryptVaultPayload } from "../src/app/state/persistence.js";
import {
  packetSources,
  createSourceReference,
  addReviewItem,
  recordItemReview,
  reviewItemState,
  compareEncounterPackets,
  compareSourceLines,
  planPassages,
  renderedSourceText,
  retainedSourceRange,
  renderedSourceRange,
  buildEncounterReviewBrief,
  referenceState,
  normalizeEncounterReview
} from "../src/encounter-review/index.js";
import { buildPromptVariableMap } from "../src/prompts/custom-templates.js";

const source = (id, text, extra = {}) => ({
  id,
  label: "Follow-up plan",
  sourceKind: "primary_note",
  deidentifiedText: text,
  updatedAt: "v1",
  ...extra
});
let patient = normalizePatient({
  id: "p",
  displayLabel: "Synthetic",
  contextSections: [source("a", "Repeat pulmonary testing. Review inhaler technique.")],
  days: [
    { id: "visit", label: "PRIVATE LABEL MUST NOT LEAVE", sourceCaptures: [source("b", "Pulmonary testing completed; report reviewed.")] },
    { id: "later", label: "Subsequent review", sourceCaptures: [] }
  ]
});
const original = createSourceReference(patient, "admission", "capture:a", 0, 25);
patient = addReviewItem(patient, { id: "item", kind: "follow_up", source: original });
assert.equal(addReviewItem(patient, { id: "duplicate", kind: "follow_up", source: original }).encounterReview.items.length, 1);
const evidence = createSourceReference(patient, "visit", "capture:b", 0, 43);
patient = recordItemReview(patient, { itemId: "item", packetId: "visit", status: "completed", evidence, recordedAt: "test" });
let item = patient.encounterReview.items[0];
assert.equal(Object.hasOwn(item.source, "snapshotText"), false, "transient source content is not duplicated into each reference");
assert.equal(
  referenceState({ ...patient, id: "another-patient" }, item.source).valid,
  false,
  "identical packet/source IDs and text cannot cross patient identity"
);
assert.throws(
  () => addReviewItem({ ...patient, id: "another-patient" }, { id: "cross", kind: "verify", source: original }),
  /different patient/
);
assert.equal(reviewItemState(patient, item, "visit").status, "completed");
assert.equal(reviewItemState(patient, item, "later").status, "unknown", "confirmation never crosses encounter boundaries");
assert.equal(reviewItemState(patient, item, "later").prior.status, "completed");
assert.equal(
  reviewItemState(patient, item, "later").needsAttention,
  false,
  "historically closed follow-ups do not become new tasks in every encounter"
);
assert.match(buildEncounterReviewBrief(patient, "later"), /Previously completed.*not verified today/);
const reopened = recordItemReview(patient, { itemId: "item", packetId: "later", status: "pending", recordedAt: "reopen" });
assert.equal(reviewItemState(reopened, reopened.encounterReview.items[0], "later").needsAttention, true);
const corrected = recordItemReview(patient, { itemId: "item", packetId: "visit", status: "pending", recordedAt: "correction" });
assert.equal(corrected.encounterReview.items[0].reviews.length, 2, "explicit corrections retain the earlier decision");
assert.equal(
  reviewItemState(corrected, corrected.encounterReview.items[0], "visit").status,
  "pending",
  "latest explicit decision applies within its packet"
);
let brief = buildEncounterReviewBrief(patient, "visit");
assert.match(brief, /Completed \(clinician-recorded\)/);
assert.match(brief, /Supporting source quotation \(Packet 2, source 1\)/);
assert.ok(!brief.includes("PRIVATE LABEL"), "user packet labels never enter the transferable brief");
assert.match(buildPromptVariableMap({ patient, selectedDayId: "visit" })["@encounter-review"], /Completed/);
assert.doesNotMatch(buildPromptVariableMap({ patient, selectedDayId: "later" })["@encounter-review"], /Completed/);

const encrypted = await encryptVaultPayload({ patients: [patient], activePatientId: "p" }, "synthetic test passphrase");
assert.ok(!JSON.stringify(encrypted).includes("pulmonary"));
const restored = await decryptVaultPayload(encrypted, "synthetic test passphrase");
assert.deepEqual(restored.patients[0].encounterReview, patient.encounterReview);
assert.equal(normalizePatient({}).encounterReview.items.length, 0, "older vaults need no fabricated review records");

const changedEvidence = structuredClone(patient);
changedEvidence.days[0].sourceCaptures[0].updatedAt = "v2";
assert.equal(reviewItemState(changedEvidence, item, "visit").status, "completed", "a no-op save must preserve review decisions");
changedEvidence.days[0].sourceCaptures[0].deidentifiedText += " New source context.";
assert.equal(reviewItemState(changedEvidence, item, "visit").status, "unknown");
assert.doesNotMatch(buildEncounterReviewBrief(changedEvidence, "visit"), /Pulmonary testing completed/);
assert.throws(
  () => recordItemReview(changedEvidence, { itemId: "item", packetId: "visit", status: "completed", evidence }),
  /supporting source/
);
const changedSource = structuredClone(patient);
changedSource.contextSections[0].label = "Revised source heading";
assert.equal(
  referenceState(changedSource, original).valid,
  false,
  "changed source metadata invalidates the reference even when selected words are identical"
);
changedSource.contextSections[0].deidentifiedText = "Changed source";
assert.equal(referenceState(changedSource, original).valid, false);
assert.throws(() => recordItemReview(changedSource, { itemId: "item", packetId: "visit", status: "completed" }), /changed or missing/);
assert.doesNotMatch(buildEncounterReviewBrief(changedSource, "visit"), /Repeat pulmonary/);
const removed = structuredClone(patient);
removed.contextSections = [];
assert.equal(referenceState(removed, original).reason, "Source removed");
const warned = structuredClone(patient);
warned.contextSections[0].residualWarnings = [{ reason: "Review" }];
assert.equal(referenceState(warned, original).valid, false);
assert.throws(() => createSourceReference(warned, "admission", "capture:a", 0, 25), /privacy review/);
assert.throws(() => createSourceReference(patient, "admission", "capture:a", 0, 999), /Select a passage/);
assert.throws(() => recordItemReview(patient, { itemId: "item", packetId: "missing", status: "completed" }), /existing encounter/);
assert.throws(() => addReviewItem(patient, { id: "bad", kind: "toString", source: original }), /supported/);
assert.equal(
  normalizeEncounterReview({ items: [{ id: "bad", kind: "follow_up", source: { ...original, quote: "fabricated" } }] }).items.length,
  0
);

assert.equal(compareEncounterPackets(patient, "admission", "visit")[0].state, "different");
assert.equal(
  compareEncounterPackets(patient, "admission", "later")[0].state,
  "only_before",
  "missing text does not mean clinical resolution"
);
assert.deepEqual(compareEncounterPackets(patient, "visit", "visit"), []);
const multiple = structuredClone(patient);
multiple.days[0].sourceCaptures.push(source("c", "Another explicitly labeled source"));
assert.equal(
  compareEncounterPackets(multiple, "admission", "visit")[0].state,
  "multiple",
  "duplicate source labels are never arbitrarily paired"
);
assert.equal(packetSources(patient, "missing").length, 0);
const sameSourceAgain = createSourceReference(patient, "admission", "capture:a", 26, 49);
const twoItems = addReviewItem(patient, { id: "second", kind: "verify", source: sameSourceAgain });
const verified = recordItemReview(twoItems, { itemId: "second", packetId: "visit", status: "confirmed", recordedAt: "verify" });
assert.equal(
  reviewItemState(verified, verified.encounterReview.items[1], "later").needsAttention,
  true,
  "verification of current findings must not inherit historical task closure"
);
assert.equal(
  twoItems.encounterReview.snapshots.length,
  2,
  "multiple excerpts share a source snapshot; the other snapshot is supporting evidence"
);
assert.equal(
  normalizeEncounterReview({ ...twoItems.encounterReview, items: [] }).snapshots.length,
  0,
  "unused retained snapshots are pruned"
);
const diff = compareSourceLines("Header\nPotassium 3.2 mmol/L\nFooter", "Header\nPotassium 4.0 mmol/L\nFooter");
assert.deepEqual(
  diff.before.map((line) => line.changed),
  [false, true, false]
);
assert.equal(diff.before.map((line) => line.text).join(""), "Header\nPotassium 3.2 mmol/L\nFooter");
assert.equal(diff.after.map((line) => line.text).join(""), "Header\nPotassium 4.0 mmol/L\nFooter");
const longText = "same\n".repeat(1000);
const longDiff = compareSourceLines(longText + "old\n", longText + "new\n");
assert.equal(longDiff.before.filter((line) => line.changed).length, 1);
assert.equal(longDiff.after.map((line) => line.text).join(""), longText + "new\n", "large-source comparison preserves every character");
const planText = "Repeat testing\n\nReview report\n";
const passages = planPassages({ fieldId: "plan", text: planText });
assert.deepEqual(
  passages.map((passage) => planText.slice(passage.start, passage.end)),
  ["Repeat testing", "Review report"]
);
assert.deepEqual(planPassages({ fieldId: "other", text: planText }), [], "no plan inference from unstructured text");
const windowsText = "Header\r\n🫁 result\rFollow-up\r\nEnd";
const visibleText = renderedSourceText(windowsText);
const visibleStart = visibleText.indexOf("🫁"),
  visibleEnd = visibleText.indexOf("\nEnd");
const exactRange = retainedSourceRange(windowsText, visibleStart, visibleEnd);
assert.equal(windowsText.slice(exactRange.start, exactRange.end), "🫁 result\rFollow-up");
assert.deepEqual(renderedSourceRange(windowsText, exactRange.start, exactRange.end), { start: visibleStart, end: visibleEnd });
assert.throws(() => retainedSourceRange(windowsText, -1, 20), /Invalid/);
assert.throws(() => retainedSourceRange(windowsText, 0, 999), /outside/);
const windowsPassages = planPassages({ fieldId: "plan", text: "First\r\nSecond\rThird" });
assert.deepEqual(
  windowsPassages.map((passage) => passage.text),
  ["First", "Second", "Third"]
);
console.log(
  "Encounter review: provenance, explicit packet decisions, stale evidence, privacy gates, comparison ambiguity, prompt scope and encrypted round-trip passed."
);
