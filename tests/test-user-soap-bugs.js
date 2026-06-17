import { deidentifyTextStructuredOnly } from "../deid.js";

const text = `SOAP NOTE — ENDOCRINE CONSULT
Patient: James Chen
DOB: 03/15/1998      Age: 28 y.o. male
MRN: JC-2478135      CSN: 100429853
Admitted: June 15, 2026
Hospital day: 2
Phone: (555) 482-3371
Facility: University Medical Center
Unit: 4 West          Room: 518A
Attending: Dr. Maria Rodriguez
Referring: Dr. David Park
Emergency contact: Lisa Chen (daughter), (555) 591-4412
Code status: Full Code

HISTORY OF PRESENT ILLNESS:
James Chen is a 28-year-old male with Type 1 Diabetes Mellitus and autoimmune hypothyroidism admitted with diabetic ketoacidosis. The patient reports 2 days of vomiting, poor oral intake, and missed basal insulin (Insulin Glargine 20 units nightly). He developed polyuria, polydipsia, abdominal discomfort, fatigue, and nausea. Daughter Lisa Chen is at bedside and reports he has been unable to keep fluids down. No chest pain or shortness of breath. No fever or infectious symptoms.

ASSESSMENT:
1. Diabetic Ketoacidosis — resolving, transitioning from IV insulin infusion to SC
2. Type 1 Diabetes Mellitus with poor sick-day management
3. Autoimmune Hypothyroidism — on stable replacement
4. Acute Kidney Injury (Cr 1.3, likely pre-renal from volume depletion)

PLAN:
4. Resume Levothyroxine 75 mcg PO daily
6. Confirm prescriptions sent to Campus Health Pharmacy before discharge`;

const result = deidentifyTextStructuredOnly(text);

// Check for the exact bugs:
console.log("=== DE-IDENTIFIED OUTPUT ===");
console.log(result.text);
console.log("\n=== ENTITIES FOUND ===");
for (const e of result.entities) {
  console.log(`  [${e.start}-${e.end}] ${e.label}: "${text.slice(e.start, e.end)}" (${e.source})`);
}
console.log("\n=== BUG CHECKS ===");
console.log("Diabetic Ketoacidosis preserved?", result.text.includes("Diabetic Ketoacidosis"));
console.log("Autoimmune Hypothyroidism preserved?", result.text.includes("Autoimmune Hypothyroidism"));
console.log("Levothyroxine preserved?", result.text.includes("Levothyroxine"));
console.log("Daughter Lisa Chen as CONTACT?", !result.text.includes("Lisa Chen") && result.text.includes("[CONTACT NAME]"));
console.log("James Chen preserved as patient?", !result.text.includes("James Chen") && result.text.includes("[PATIENT NAME]"));
console.log("Type 1 Diabetes Mellitus preserved?", result.text.includes("Type 1 Diabetes Mellitus"));
console.log("Acute Kidney Injury preserved?", result.text.includes("Acute Kidney Injury"));
