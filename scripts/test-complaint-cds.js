import assert from "node:assert/strict";
import {
  complaintModules,
  complaintSourceRegistry,
  evaluateComplaintCds,
  formatComplaintCdsReport,
  selectComplaintModule,
  validateComplaintModules
} from "../complaint-cds.js";

const audit = validateComplaintModules();
assert.ok(audit.ok, audit.issues.join("\n"));
assert.ok(complaintModules.length >= 2, "MVP should include at least chest pain and hyperglycemia/DKA modules");
assert.ok(complaintSourceRegistry.some((source) => source.id === "AHA_ACC_CHEST_PAIN_2021"), "source registry should include chest pain guideline");
assert.ok(complaintSourceRegistry.some((source) => source.id === "ADA_HYPERGLYCEMIC_CRISES_2024"), "source registry should include 2024 hyperglycemic crises consensus");
assert.ok(complaintSourceRegistry.some((source) => source.id === "ADA_STANDARDS_HOSPITAL_2026"), "source registry should include 2026 ADA hospital standards");

function labels(items) {
  return items.map((item) => item.label.toLowerCase()).join(" | ");
}

function assertHas(items, pattern, message) {
  assert.ok(pattern.test(labels(items)), `${message}: ${labels(items)}`);
}

function answerMap(entries) {
  return Object.fromEntries(entries);
}

const chestModule = selectComplaintModule("acute chest pain with pressure and diaphoresis");
assert.equal(chestModule?.id, "chest_pain_v1", "chest pain text should route to chest pain module");

const dkaModule = selectComplaintModule("hyperglycemia with vomiting and missed insulin possible dka");
assert.equal(dkaModule?.id, "hyperglycemia_possible_dka_v1", "hyperglycemia text should route to DKA/HHS module");

const unmatched = evaluateComplaintCds("ankle sprain after basketball");
assert.equal(unmatched.matched, false, "unsupported complaint should return no-match response");
assert.ok(/medical knowledge database/.test(unmatched.message), "no-match response should point to installed knowledge database coverage");

const chestPain = evaluateComplaintCds(
  "Emergency medicine/admission adult acute chest pain with pressure, diaphoresis, dyspnea, syncope, hypoxia, and possible leg swelling",
  answerMap([
    ["cp_dyspnea", "yes"],
    ["cp_syncope", "yes"],
    ["cp_vte_risk", "yes"]
  ])
);
assert.equal(chestPain.matched, true, "chest pain case should match");
assert.equal(chestPain.module.id, "chest_pain_v1");
assert.ok(chestPain.triggeredRedFlags.length >= 2, "high-risk chest pain should trigger red flags");
assertHas(chestPain.requiredQuestions, /onset|radiate|exertional|shortness/, "chest pain should ask core history");
assertHas(chestPain.conditionalQuestions, /unilateral leg swelling|pregnancy|reproducible/, "chest pain should activate conditional history");
assertHas(chestPain.focusedExam, /vital signs|cardiac|pulmonary|unilateral leg|jvp/, "chest pain should recommend focused cardiopulmonary and VTE exam");
assertHas(chestPain.initialTests, /ecg|troponin|ct pulmonary|d-dimer|chest x-ray/, "chest pain should recommend immediate tests");
assertHas(chestPain.dispositionRules, /emergency|structured chest pain/, "chest pain should include disposition cues");
assert.ok(chestPain.sources.every((source) => source.url.startsWith("http")), "sources should include URLs");

const dka = evaluateComplaintCds(
  "Endocrinology consult adult hyperglycemia possible DKA with vomiting, abdominal pain, missed insulin, ketones, Kussmaul respirations, confusion, dehydration, and fever",
  answerMap([
    ["dka_vomit_abdomen", "yes"],
    ["dka_missed_insulin", "yes"],
    ["dka_infection_trigger", "yes"],
    ["dka_mental_status_question", "yes"],
    ["dka_hhs_features", "yes"]
  ])
);
assert.equal(dka.matched, true, "DKA case should match");
assert.equal(dka.module.id, "hyperglycemia_possible_dka_v1");
assert.ok(dka.triggeredRedFlags.length >= 3, "severe DKA should trigger multiple red flags");
assertHas(dka.requiredQuestions, /insulin|ketone|polyuria|infection|confusion/, "DKA should ask core crisis history");
assertHas(dka.conditionalQuestions, /hyperosmolar|infection/, "DKA should ask conditional HHS/source history");
assertHas(dka.focusedExam, /vital signs|hydration|respiratory pattern|mental status|perfusion|abdominal|infection source/, "DKA should recommend volume, respiratory, mental, abdominal, and source exam");
assertHas(dka.initialTests, /point-of-care glucose|beta-hydroxybutyrate|metabolic panel|blood gas|osmolality|ecg|cbc|a1c/, "DKA should recommend immediate crisis labs/tests");
assertHas(dka.dispositionRules, /urgent|icu|high-acuity|potassium|basal overlap|discharge/, "DKA should include high-acuity and transition/discharge cues");
assertHas(dka.differentialBuckets, /glucose >=200|beta-hydroxybutyrate >=3.0|glucose >=600|osmolality >300|mixed dka\/hhs/, "DKA/HHS differential should include current diagnostic thresholds");

const euDka = evaluateComplaintCds(
  "Adult diabetes on SGLT2 inhibitor with vomiting, abdominal pain, ketones, and only moderately elevated glucose",
  answerMap([["dka_sglt2_pregnancy", "yes"]])
);
assert.equal(euDka.module.id, "hyperglycemia_possible_dka_v1", "SGLT2 ketotic symptoms should route to DKA module");
assertHas(euDka.redFlags.filter((item) => item.triggered), /sglt2|lower glucose/, "SGLT2 case should trigger euglycemic DKA warning");
assertHas(euDka.dispositionRules, /ketones\/acidosis|glucose is <200|stop sglt2/i, "SGLT2 case should include euglycemic disposition cue");

const report = formatComplaintCdsReport(dka);
assert.ok(report.includes("Guideline Complaint CDS"), "report should have title");
assert.ok(report.includes("ADA_HYPERGLYCEMIC_CRISES_2024"), "report should include source ids");
assert.ok(!/patient name|mrn|date of birth/i.test(report), "report should not introduce PHI labels");

console.log("Complaint CDS tests passed.");
