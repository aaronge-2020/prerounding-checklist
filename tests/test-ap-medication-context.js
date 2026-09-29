import assert from "node:assert/strict";
import {
  buildApRevisionPrompt,
  buildMedicationContextBlock
} from "../src/ai/ap-generator.js";

// --- buildMedicationContextBlock: coded meds ---
const lipitor = buildMedicationContextBlock(["Give: Lipitor 20 mg PO daily"]);
assert.ok(lipitor.includes("MEDICATION CONTEXT"), "block has its header");
assert.ok(lipitor.includes("atorvastatin"), "brand resolves to generic ingredient");
assert.ok(lipitor.includes("RxCUI 83367"), "block carries the correct RxCUI");
assert.ok(lipitor.includes("20 mg"), "strength is preserved");
assert.ok(lipitor.includes("PO"), "route is preserved");
assert.ok(lipitor.includes("Lipitor 20 mg PO daily"), "original order text is shown");

// --- combination product: one line per ingredient ---
const combo = buildMedicationContextBlock(["sacubitril valsartan 49/51 mg PO BID"]);
assert.ok(combo.includes("sacubitril (RxCUI 1656328)"), "combo ingredient 1 coded");
assert.ok(combo.includes("valsartan (RxCUI 69749)"), "combo ingredient 2 coded");

// --- uncoded meds: omitted silently ---
assert.equal(buildMedicationContextBlock(["Give: unobtanium 5 mg PO daily"]), "", "unknown med yields no block");
assert.equal(buildMedicationContextBlock([]), "", "empty list yields no block");
assert.equal(buildMedicationContextBlock(), "", "missing arg yields no block");
assert.equal(buildMedicationContextBlock([null, 123, {}]), "", "non-string entries never throw");

// --- mixed list: coded kept, uncoded dropped ---
const mixed = buildMedicationContextBlock([
  "Give: Lipitor 20 mg PO daily",
  "Give: unobtanium 5 mg PO daily"
]);
assert.ok(mixed.includes("RxCUI 83367"), "coded med kept");
assert.ok(!mixed.includes("unobtanium"), "uncoded med dropped");

// --- dedup: same med twice renders once ---
const dupe = buildMedicationContextBlock(["Give: Lipitor 20 mg PO daily", "Lipitor 20 mg PO daily"]);
assert.equal(dupe.split("\n").filter((l) => l.includes("83367")).length, 1, "duplicate concepts collapse");

// --- prompt assembly: block flows into the revision prompt ---
const prompt = buildApRevisionPrompt({
  problem: "Acute decompensated heart failure",
  keyContext: "Volume overloaded",
  etiologyStatus: "unknown",
  therapeuticPlan: "Furosemide 40 mg IV BID",
  medications: ["Give: Lipitor 20 mg PO daily"]
});
assert.ok(prompt.includes("MEDICATION CONTEXT"), "revision prompt carries the medication block");
assert.ok(prompt.includes("atorvastatin (RxCUI 83367)"), "revision prompt carries coded concepts");
assert.ok(prompt.includes("Furosemide 40 mg IV BID"), "existing plan content is intact");

// --- no medications: no block, prompt otherwise unchanged ---
const promptNoMeds = buildApRevisionPrompt({ problem: "Fever", keyContext: "" });
assert.ok(!promptNoMeds.includes("MEDICATION CONTEXT"), "block omitted when nothing resolves");
assert.ok(promptNoMeds.includes("(none written yet)"), "existing placeholders intact");

// --- review gate: the block is part of the exact text the student reviews ---
// openApConfirm stores buildApRevisionPrompt's output as the modal's editable
// prompt text; the student reviews and approves that exact text before
// anything is sent. Asserting the block is embedded here asserts it passes
// through that gate — no parallel send path exists.
const reviewed = buildApRevisionPrompt({
  problem: "Heart failure",
  medications: ["sacubitril valsartan 49/51 mg PO BID"]
});
assert.ok(reviewed.includes("MEDICATION CONTEXT (RxNorm-coded, deterministic):"), "reviewed text contains the block");
assert.ok(reviewed.includes("valsartan (RxCUI 69749)"), "reviewed text contains coded concepts");

console.log("test-ap-medication-context: all assertions passed");
