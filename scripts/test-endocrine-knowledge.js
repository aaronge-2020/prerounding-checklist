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
  "ATA_HYPOTHYROIDISM_2014",
  "ATA_HYPERTHYROIDISM_2016",
  "ATA_THYROID_NODULE_DTC_2015",
  "ATA_THYROID_CANCER_2025",
  "AACE_OSTEOPOROSIS_2020",
  "ES_CUSHING_TREATMENT_2015",
  "ESE_ADRENAL_INCIDENTALOMA_2023",
  "ES_PRIMARY_ALDO_2025",
  "PCOS_GUIDELINE_2023",
  "AUA_TESTOSTERONE_2024",
  "IMS_MENOPAUSE_2026",
  "ESHRE_POI_2024",
  "ASRM_AMENORRHEA_2024",
  "PITUITARY_PROLACTINOMA_2023",
  "ES_ACROMEGALY_2014",
  "PITUITARY_ACROMEGALY_2021",
  "ACROMEGALY_DIAGNOSIS_REMISSION_2024",
  "ACROMEGALY_COMPLICATIONS_2026",
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

const auditedItemGroups = [
  "redFlags",
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam",
  "initialTests",
  "dispositionRules",
  "differentialBuckets"
];

function assertMeaningfulItem(module, group, item) {
  assert.ok(item.source?.source_id && sourceIds.has(item.source.source_id), `${module.id}.${group}.${item.id} should have a valid source ID`);
  assert.ok(item.source?.source_section, `${module.id}.${group}.${item.id} should have source section`);
  assert.ok(item.action && item.action.length >= 20, `${module.id}.${group}.${item.id} should explain what action or management decision changes`);
  assert.ok(item.rationale && item.rationale.length >= 30, `${module.id}.${group}.${item.id} should explain why it belongs`);
  assert.doesNotMatch(item.label, /^(assess|check|evaluate|screen|review)\.?$/i, `${module.id}.${group}.${item.id} should not be a vague standalone checklist item`);
  assert.doesNotMatch(item.rationale, /\b(?:generic|template|todo|tbd)\b/i, `${module.id}.${group}.${item.id} should not have placeholder rationale`);
}

for (const module of endocrineModules) {
  assert.equal(module.status, "mvp", `${module.id} should be active mvp`);
  assert.ok(module.triggers.length >= 2, `${module.id} should have searchable triggers`);
  assert.ok(module.requiredQuestions.length >= 4, `${module.id} should include a deployment-grade question set`);
  assert.ok(module.requiredExam.length >= 3, `${module.id} should include focused exam plus severity/complication checks`);
  assert.ok(module.conditionalExam.length >= 2, `${module.id} should include modifier-triggered conditional exam add-ons`);
  assert.ok(module.initialTests.length >= 6, `${module.id} should include tests and reference anchors`);
  assert.ok(module.redFlags.length >= 2, `${module.id} should include red flags and escalation cues`);
  assert.ok(module.dispositionRules.length >= 3, `${module.id} should include management-changing results`);
  assert.ok(module.differentialBuckets.length >= 3, `${module.id} should include diagnostic buckets and mimics/exclusions`);
  assert.match(labels(module.differentialBuckets), /mimic|exclusion|alternative|confounder|premature closure/, `${module.id} should include differential mimics/exclusions`);
  assert.ok(module.endocrine_metadata.reference_values.length >= 2, `${module.id} should preserve reference values`);
  assert.ok(module.endocrine_metadata.source_ids.every((sourceId) => sourceIds.has(sourceId)), `${module.id} should reference valid sources`);
  assert.doesNotMatch(flattenModuleText(module), /\b(?:MRN|DOB|John Smith|Room 412B|Riverside General)\b/i, `${module.id} should not include PHI fixture text`);
  assert.equal(selectComplaintModule(module.label)?.id, module.id, `${module.id} should be searchable/selectable by exact diagnosis label`);
  assert.ok(module.conditionalExam.every((item) => item.when?.termsAny?.length), `${module.id} conditional exam add-ons should have structured modifier triggers`);
  const modifierResult = evaluateComplaintCds(`${module.label} unstable vomiting fever pregnancy headache visual symptoms medication discordant`, {}, { module });
  assert.ok(modifierResult.conditionalExam.length >= 1, `${module.id} should activate conditional exam add-ons when key modifiers are present`);
  auditedItemGroups.forEach((group) => {
    (module[group] || []).forEach((item) => assertMeaningfulItem(module, group, item));
  });
  module.requiredQuestions.forEach((item) => {
    assert.ok(item.options?.some((option) => option.value === "yes"), `${module.id}.${item.id} should be answerable`);
    assert.ok(item.options?.some((option) => option.value === "no"), `${module.id}.${item.id} should be answerable`);
  });
  module.endocrine_metadata.source_ids.forEach((sourceId) => {
    const source = complaintSourceRegistry.find((row) => row.id === sourceId);
    assert.equal(source?.date_accessed, "2026-06-06", `${module.id} source ${sourceId} should have current access date`);
    assert.match(source?.url || "", /^https:\/\//, `${module.id} source ${sourceId} should have HTTPS provenance`);
  });
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

const graves = evaluateComplaintCds("Graves disease palpitations heat intolerance eye irritation");
assert.equal(graves.module.id, "graves_disease_v1");
assertHas(graves.focusedExam, /goiter|tachycardia|tremor|lid lag|proptosis|eom/i, "Graves disease should include thyroid, cardiac/rhythm, tremor, and orbitopathy-focused exam");
assertHas(graves.initialTests, /tsh|free t4|t3|trab|tsi|raiu/i, "Graves disease should include biochemical and etiology-defining tests");

const thyroidNodule = evaluateComplaintCds("benign thyroid nodule low TSH ultrasound FNA goiter");
assert.equal(thyroidNodule.module.id, "thyroid_nodules_v1");
assertHas(thyroidNodule.focusedExam, /thyroid palpation|cervical nodes|voice|airway/i, "Thyroid nodule should include thyroid, cervical nodes, and compressive/voice assessment");
assertHas(thyroidNodule.initialTests, /tsh|ultrasound|fna|radionuclide/i, "Thyroid nodule should include TSH, ultrasound, FNA, and low-TSH scan pathway");

const thyroidCancer = evaluateComplaintCds("thyroid cancer hoarseness dysphagia radiation family thyroid cancer medullary");
assert.equal(thyroidCancer.module.id, "thyroid_cancer_v1");
assertHas(thyroidCancer.focusedExam, /thyroid mass|cervical nodal|voice|airway/i, "Thyroid cancer should include mass, nodal, voice, and airway assessment");
assertHas(thyroidCancer.initialTests, /ultrasound|fna|bethesda|calcitonin|ret/i, "Thyroid cancer should include nodal mapping/FNA and medullary cancer markers when relevant");

const report = readFileSync("reports/endocrine-workup-completion-2026-06-06.md", "utf8");
assert.match(report, /Completed modules: 37/);
assert.match(report, /37\. Cushing's Disease/);

console.log("Endocrine knowledge module tests passed.");
