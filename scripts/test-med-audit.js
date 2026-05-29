import assert from "node:assert/strict";
import {
  auditMedicationAdministration,
  extractMedicationAdministrationText,
  formatMedicationAuditForPrompt,
  medicationAuditActionCount
} from "../med-audit.js";

function issueMessages(audit, category) {
  return audit.issues
    .filter((issue) => issue.category === category)
    .map((issue) => issue.message);
}

const sample = `SOAP NOTE:
Brief source context.

MEDICATION ORDERS AND ADMINISTRATION RECORD:
Medication Orders:
atorvastatin 40 mg PO nightly
enoxaparin 40 mg subcutaneous daily
acetaminophen 650 mg PO q6h PRN
ceftriaxone 1 g IV daily
hydralazine 50 mg PO TID

MAR:
atorvastatin 20 mg given Day 0 evening
enoxaparin 40 mg held by provider Day 0 morning
ceftriaxone 1 g given Day 0 morning
vancomycin 1 g administered Day 0 morning
hydralazine 50 mg PO BID given

HANDOFF SUMMARY AND OTHER CONTEXT:
No other medication context.`;

const extracted = extractMedicationAdministrationText(sample);
assert.ok(extracted.includes("atorvastatin 40 mg PO nightly"), "medication section should be extracted");
assert.ok(!extracted.includes("HANDOFF SUMMARY"), "next source block should be excluded");

const audit = auditMedicationAdministration(sample);
assert.equal(audit.hasMedicationSource, true);
assert.ok(issueMessages(audit, "Dose mismatch").some((message) => /atorvastatin/i.test(message)), "dose mismatch should be detected");
assert.ok(issueMessages(audit, "Held/refused/not given").some((message) => /enoxaparin/i.test(message)), "held medication should be detected");
assert.ok(issueMessages(audit, "Administered without matching order").some((message) => /vancomycin/i.test(message)), "unexpected administration should be detected");
assert.ok(issueMessages(audit, "Frequency or timing mismatch").some((message) => /hydralazine/i.test(message)), "frequency mismatch should be detected");
assert.ok(!audit.issues.some((issue) => /acetaminophen/i.test(issue.message)), "unadministered PRN should not be flagged as missed");

const missingAdmin = auditMedicationAdministration(`MEDICATION ORDERS AND ADMINISTRATION RECORD:
Medication Orders:
levothyroxine 50 mcg PO daily
MAR:
`);
assert.ok(issueMessages(missingAdmin, "Possible missed or not documented").some((message) => /levothyroxine/i.test(message)), "scheduled order without MAR should be flagged");

const ambiguous = auditMedicationAdministration(`MEDICATION ORDERS AND ADMINISTRATION RECORD:
Medication Orders:
insulin lispro sliding scale subcutaneous with meals and bedtime
MAR:
insulin lispro correction scale given
`);
assert.ok(issueMessages(ambiguous, "Needs verification").some((message) => /insulin/i.test(message)), "sliding-scale insulin should need verification");

const clean = auditMedicationAdministration(`MEDICATION ORDERS AND ADMINISTRATION RECORD:
Medication Orders:
ceftriaxone 1 g IV daily
MAR:
ceftriaxone 1 g IV daily given
`);
assert.equal(medicationAuditActionCount(clean), 0, "matched order and MAR should not create action items");
assert.ok(formatMedicationAuditForPrompt(clean).includes("No missed doses"), "clean prompt summary should stay concise");

console.log("Medication audit tests passed.");

