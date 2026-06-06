import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  complaintModules,
  complaintSourceRegistry,
  evaluateComplaintCds,
  selectComplaintModule,
  validateComplaintModules
} from "../complaint-cds.js";

const endocrineModules = complaintModules.filter((module) => module.endocrine_metadata?.generated_from === "scripts/generate-endocrine-workups.js");
const sourceIds = new Set(complaintSourceRegistry.map((source) => source.id));

assert.equal(endocrineModules.length, 37, "database should include all 37 endocrine workup modules");
assert.ok(validateComplaintModules().ok, "complaint modules should validate after endocrine install");

const requiredSources = [
  "ADA_SOC_2026",
  "ADA_DIAGNOSIS_2026",
  "ATA_HYPERTHYROIDISM_2016",
  "ES_PRIMARY_ALDO_2025",
  "PCOS_GUIDELINE_2023",
  "ESHRE_POI_2024",
  "ASRM_AMENORRHEA_2024",
  "ES_HYPOPITUITARISM_2016",
  "ENDOTEXT_DI_2026"
];
requiredSources.forEach((sourceId) => {
  assert.ok(sourceIds.has(sourceId), `source registry should include ${sourceId}`);
});

function flattenModuleText(module) {
  return [
    module.label,
    module.triggers,
    module.redFlags,
    module.requiredQuestions,
    module.requiredExam,
    module.initialTests,
    module.dispositionRules,
    module.differentialBuckets,
    module.endocrine_metadata
  ].map((value) => JSON.stringify(value)).join("\n");
}

for (const module of endocrineModules) {
  assert.equal(module.status, "review_ready", `${module.id} should be review_ready`);
  assert.ok(module.triggers.length >= 2, `${module.id} should have searchable triggers`);
  assert.ok(module.requiredQuestions.length, `${module.id} should include clinical questions`);
  assert.ok(module.requiredExam.length, `${module.id} should include focused exam`);
  assert.ok(module.initialTests.length >= 2, `${module.id} should include tests and reference anchors`);
  assert.ok(module.redFlags.length, `${module.id} should include red flags`);
  assert.ok(module.dispositionRules.length, `${module.id} should include management-changing results`);
  assert.ok(module.differentialBuckets.length >= 2, `${module.id} should include diagnostic buckets`);
  assert.ok(module.endocrine_metadata.reference_values.length, `${module.id} should preserve reference values`);
  assert.ok(module.endocrine_metadata.source_ids.every((sourceId) => sourceIds.has(sourceId)), `${module.id} should reference valid sources`);
  assert.doesNotMatch(flattenModuleText(module), /\b(?:MRN|DOB|John Smith|Room 412B|Riverside General)\b/i, `${module.id} should not include PHI fixture text`);
}

function labels(items) {
  return items.map((item) => `${item.label} ${item.action || ""}`).join(" | ").toLowerCase();
}

function assertHas(items, pattern, message) {
  assert.match(labels(items), pattern, message);
}

const type2 = evaluateComplaintCds("type 2 diabetes mellitus adult neuropathy kidney albumin");
assert.equal(type2.module.id, "type_2_diabetes_mellitus_v1");
assertHas(type2.requiredQuestions, /polyuria|polydipsia|ascvd|ckd/, "T2DM should ask symptoms and comorbidities");
assertHas(type2.focusedExam, /foot|pulses|monofilament|cardiovascular|thyroid/, "T2DM should include complication-focused exam");
assertHas(type2.initialTests, /a1c|fasting plasma glucose|urine albumin|uacr normal <30/, "T2DM should include glycemic and kidney thresholds");

const primaryAldo = evaluateComplaintCds("primary aldosteronism Conn syndrome resistant hypertension hypokalemia");
assert.equal(primaryAldo.module.id, "hyperaldosteronism_v1");
assertHas(primaryAldo.requiredQuestions, /resistant|hypokalemia|arr/, "primary aldosteronism should ask resistant HTN and ARR context");
assertHas(primaryAldo.initialTests, /aldosterone|renin|arr|15 ng\/dl|20 ng\/dl/, "primary aldosteronism should include 2025 ARR anchors");

const pcos = evaluateComplaintCds("PCOS irregular periods hirsutism infertility acne");
assert.equal(pcos.module.id, "polycystic_ovary_syndrome_v1");
assertHas(pcos.requiredQuestions, /cycle|hirsutism|rapid virilization/, "PCOS should ask cycle and androgen history");
assertHas(pcos.initialTests, /pregnancy|testosterone|17-ohp|rotterdam/i, "PCOS should include exclusion and criteria anchors");

const diabetesInsipidus = evaluateComplaintCds("diabetes insipidus polyuria polydipsia hypernatremia pituitary surgery");
assert.equal(diabetesInsipidus.module.id, "diabetes_insipidus_v1");
assertHas(diabetesInsipidus.requiredQuestions, /24-hour urine|thirst|lithium|pituitary/, "DI should ask polyuria and cause context");
assertHas(diabetesInsipidus.initialTests, /urine volume|urine osmolality|serum sodium|146-149|>160/, "DI should include urine and hypernatremia thresholds");

const prolactinoma = selectComplaintModule("prolactinoma galactorrhea amenorrhea visual field headache");
assert.equal(prolactinoma.id, "prolactinoma_v1", "prolactinoma query should route to prolactinoma module");

const report = readFileSync("reports/endocrine-workup-completion-2026-06-06.md", "utf8");
assert.match(report, /Completed modules: 37/);
assert.match(report, /37\. Cushing's Disease/);

console.log("Endocrine knowledge module tests passed.");
