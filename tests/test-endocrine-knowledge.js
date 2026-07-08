import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  complaintModules,
  complaintSourceRegistry,
  evaluateComplaintCds,
  isBasicBedsideDataItem,
  selectComplaintModule,
  validateComplaintModules
} from "../src/clinical/complaint-cds.js";

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

const endocrineInstallerSource = readFileSync("scripts/install-endocrine-workups.js", "utf8");
const requiredExamTemplateStart = endocrineInstallerSource.indexOf("function requiredExamTemplates");
const requiredExamTemplateEnd = endocrineInstallerSource.indexOf("function conditionalExamTemplates", requiredExamTemplateStart);
const conditionalExamTemplateEnd = endocrineInstallerSource.indexOf("function moduleFromWorkup", requiredExamTemplateEnd);
assert.ok(
  requiredExamTemplateStart > 0 && requiredExamTemplateEnd > requiredExamTemplateStart && conditionalExamTemplateEnd > requiredExamTemplateEnd,
  "endocrine installer should expose exam template functions for static safety checks"
);
const examTemplateSource = endocrineInstallerSource.slice(requiredExamTemplateStart, conditionalExamTemplateEnd);
assert.doesNotMatch(
  examTemplateSource,
  /\b(?:Measure blood pressure|Measure heart rate|Measure respiratory rate|Measure oxygen saturation|Measure temperature|Measure current weight|Measure body mass index|Measure waist circumference|Calculate body mass index|Measure orthostatic blood pressure|Measure standing blood pressure|Check bedside glucose|Measure bedside glucose|Bedside glucose|Assess general appearance)\b/i,
  "endocrine exam templates must not mint basic bedside data/safety checks"
);
assert.match(
  endocrineInstallerSource,
  /function requiredSafetyTemplates[\s\S]*function conditionalSafetyTemplates[\s\S]*const requiredSafetyAtoms = requiredSafetyTemplates\(row\)/,
  "endocrine safety checks should be first-class templates, not filtered out of exam templates"
);
assert.doesNotMatch(
  endocrineInstallerSource,
  /requiredExamAtoms\.filter\(isSafetyCheckAtom\)|conditionalExamAtoms\.filter\(isSafetyCheckAtom\)/,
  "endocrine builder must not rely on filtering safety checks out of physical exam atoms"
);

function flattenModuleText(module) {
  return [
    module.label,
    module.triggers,
    module.requiredQuestions,
    module.conditionalQuestions,
    module.requiredExam,
    module.conditionalExam,
    module.endocrine_metadata
  ].map((value) => JSON.stringify(value)).join("\n");
}

const auditedItemGroups = [
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam"
];

function assertMeaningfulItem(module, group, item) {
  assert.ok(item.source?.source_id && sourceIds.has(item.source.source_id), `${module.id}.${group}.${item.id} should have a valid source ID`);
  assert.ok(item.source?.source_section, `${module.id}.${group}.${item.id} should have source section`);
  assert.ok(item.action && item.action.length >= 20, `${module.id}.${group}.${item.id} should explain what action or management decision changes`);
  assert.ok(item.rationale && item.rationale.length >= 30, `${module.id}.${group}.${item.id} should explain why it belongs`);
  assert.doesNotMatch(item.label, /^(assess|check|evaluate|screen|review)\.?$/i, `${module.id}.${group}.${item.id} should not be a vague standalone checklist item`);
  assert.doesNotMatch(item.rationale, /\b(?:generic|template|todo|tbd)\b/i, `${module.id}.${group}.${item.id} should not have placeholder rationale`);
}

function assertAtomicExamItem(module, group, item) {
  assert.ok(
    item.label && item.label.trim().length >= 3,
    `${module.id}.${group}.${item.id} should have a concise maneuver label`
  );
  assert.doesNotMatch(item.label, /[,;:]/, `${module.id}.${group}.${item.id} should not be a comma/semicolon/colon bundled exam cluster`);
  assert.doesNotMatch(item.label, /\//, `${module.id}.${group}.${item.id} should not be a slash-bundled exam cluster`);
  assert.doesNotMatch(item.label, /\band\s*\/\s*or\b/i, `${module.id}.${group}.${item.id} should not contain and/or clusters`);
  assert.doesNotMatch(item.label, /\b(?:focused exam|acuity screen|add repeat vitals|trigger exam|work-of-breathing|screen|assessment)\b/i, `${module.id}.${group}.${item.id} should be an atomic maneuver rather than a broad exam bundle`);
  assert.ok(item.when_to_perform && item.when_to_perform.length >= 20, `${module.id}.${group}.${item.id} should state when to perform the maneuver`);
  assert.ok(item.technique && item.technique.length >= 20, `${module.id}.${group}.${item.id} should include bedside technique`);
  assert.doesNotMatch(item.technique, /\bperform the named (?:bedside item|maneuver) directly\b/i, `${module.id}.${group}.${item.id} should not use placeholder technique`);
  assert.ok(item.findings_options?.length >= 3, `${module.id}.${group}.${item.id} should include findings/options`);
  assert.ok(item.diagnostic_target && item.diagnostic_target.length >= 10, `${module.id}.${group}.${item.id} should include diagnostic target`);
  assert.doesNotMatch(item.diagnostic_target, /\bfocused bedside finding relevant to\b/i, `${module.id}.${group}.${item.id} should not use a generic diagnostic target`);
  assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_plus"), `${module.id}.${group}.${item.id} should include LR_plus`);
  assert.ok(Object.prototype.hasOwnProperty.call(item, "LR_minus"), `${module.id}.${group}.${item.id} should include LR_minus`);
  assert.ok(item.management_change && item.management_change.length >= 20, `${module.id}.${group}.${item.id} should state what result changes management`);
  assert.ok(item.difficulty, `${module.id}.${group}.${item.id} should include difficulty metadata`);
  assert.ok(Number(item.time_burden_minutes) > 0, `${module.id}.${group}.${item.id} should include time burden metadata`);
  assert.ok(item.equipment_needed, `${module.id}.${group}.${item.id} should include equipment metadata`);
  assert.ok(item.patient_cooperation_required, `${module.id}.${group}.${item.id} should include cooperation metadata`);
  assert.ok(item.limitations && item.limitations.length >= 20, `${module.id}.${group}.${item.id} should include limitations`);
  assert.ok(item.tags?.length, `${module.id}.${group}.${item.id} should include tags`);
}

function questionOptionLabels(value = []) {
  return (Array.isArray(value) ? value : String(value || "").split(/\s*(?:[;|]|\s+\/\s+)\s*/))
    .map((option) => (typeof option === "string" ? option : option?.label || option?.value || ""))
    .map((option) => String(option || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function genericQuestionOptions(value = []) {
  const labels = questionOptionLabels(value).map((option) => option.toLowerCase().replace(/_{2,3}/g, "").trim());
  return labels.length <= 4
    && labels.every((option) => /^(?:unknown|yes|no|other|not sure|unsure|unable)$/.test(option))
    && labels.includes("yes")
    && labels.includes("no");
}

for (const module of endocrineModules) {
  const lowExamCardiometabolicWorkup = /\b(?:prediabetes|metabolic syndrome|gestational diabetes)\b/i.test(module.label || "");
  assert.equal(module.status, "mvp", `${module.id} should be active mvp`);
  assert.ok(module.triggers.length >= 2, `${module.id} should have searchable triggers`);
  const requiredVitalsItems = module.requiredExam.filter(isBasicBedsideDataItem);
  assert.ok(requiredVitalsItems.length >= 2, `${module.id} should include first-class basic bedside data/safety checks within required exam`);
  assert.ok(module.requiredQuestions.length >= 4, `${module.id} should include a deployment-grade question set`);
  assert.ok(module.requiredQuestions.length <= 10, `${module.id} should keep required bedside history focused instead of turning every guideline cue into a required question`);
  assert.ok(module.conditionalQuestions.every((item) => item.when?.termsAny?.length || item.when?.answersAny?.length || item.when?.termsAll?.length || item.when?.answersAll?.length), `${module.id} conditional history add-ons should have structured modifier triggers`);
  assert.ok(
    module.requiredExam.length >= (lowExamCardiometabolicWorkup ? 1 : 3),
    `${module.id} should include clinically meaningful required exam maneuvers`
  );
  const conditionalSafetyChecksInRequired = module.requiredExam.filter((item) => (
    isBasicBedsideDataItem(item)
    && (item.when?.termsAny?.length || item.when?.answersAny?.length || item.when?.termsAll?.length || item.when?.answersAll?.length)
  ));
  assert.ok(
    module.conditionalExam.length + conditionalSafetyChecksInRequired.length >= (lowExamCardiometabolicWorkup ? 0 : 2),
    `${module.id} should include modifier-triggered conditional bedside add-ons`
  );
  assert.ok(module.endocrine_metadata.reference_values.length >= 2, `${module.id} should preserve reference values`);
  assert.ok(module.endocrine_metadata.decision_steps.length >= 3, `${module.id} should preserve decision-tree source rows`);
  assert.ok(module.endocrine_metadata.treatment_options.length >= 3, `${module.id} should preserve treatment-option source rows`);
  assert.ok(module.endocrine_metadata.source_ids.every((sourceId) => sourceIds.has(sourceId)), `${module.id} should reference valid sources`);
  assert.doesNotMatch(flattenModuleText(module), /\b(?:MRN|DOB|John Smith|Room 412B|Riverside General)\b/i, `${module.id} should not include PHI fixture text`);
  assert.equal(selectComplaintModule(module.label)?.id, module.id, `${module.id} should be searchable/selectable by exact diagnosis label`);
  assert.ok(module.conditionalExam.every((item) => item.when?.termsAny?.length), `${module.id} conditional exam add-ons should have structured modifier triggers`);
  const examLabels = [...module.requiredExam, ...module.conditionalExam].map((item) => item.label.toLowerCase());
  assert.equal(new Set(examLabels).size, examLabels.length, `${module.id} should not duplicate exam labels across required and conditional items`);
  [...module.requiredExam, ...module.conditionalExam].filter(isBasicBedsideDataItem).forEach((item) => {
    const findingsText = (item.findings_options || []).join(" ");
    if (/current weight|\bweight\b/i.test(item.label || "")) {
      assert.match(findingsText, /kg\/lb|weight gain|weight loss/i, `${module.id}.${item.id} weight safety check should use weight-specific documentation choices`);
      assert.doesNotMatch(findingsText, /tachypneic|bradypneic|normal effort/i, `${module.id}.${item.id} weight safety check should not inherit respiratory-rate options`);
    }
    if (/body mass index|bmi/i.test(item.label || "")) {
      assert.match(findingsText, /kg\/m2|underweight|overweight|obesity/i, `${module.id}.${item.id} BMI safety check should use BMI-specific documentation choices`);
    }
    if (/waist circumference/i.test(item.label || "")) {
      assert.match(findingsText, /cm\/in|risk threshold/i, `${module.id}.${item.id} waist safety check should use waist-specific documentation choices`);
    }
  });
  const noModifierResult = evaluateComplaintCds(module.label, {}, { module });
  assert.ok(
    noModifierResult.requiredQuestions.length + noModifierResult.conditionalQuestions.length <= 14,
    `${module.id} should not overload the no-modifier bedside history set`
  );
  assert.equal(
    noModifierResult.conditionalQuestions.length,
    0,
    `${module.id} should not activate conditional history add-ons from the diagnosis label alone`
  );
  assert.equal(
    noModifierResult.conditionalExam.length,
    0,
    `${module.id} should not activate conditional exam add-ons from the diagnosis label alone`
  );
  if (module.conditionalQuestions.length) {
    const triggerText = module.conditionalQuestions[0].when?.termsAny?.slice(0, 3).join(" ");
    const conditionalHistoryResult = evaluateComplaintCds(`${module.label} ${triggerText}`, {}, { module });
    assert.ok(
      conditionalHistoryResult.conditionalQuestions.length >= 1,
      `${module.id} should activate conditional history add-ons when their structured modifier terms are present`
    );
  }
  if (module.conditionalExam.length) {
    const triggerText = module.conditionalExam[0].when?.termsAny?.slice(0, 3).join(" ");
    const conditionalExamResult = evaluateComplaintCds(`${module.label} ${triggerText}`, {}, { module });
    assert.ok(
      conditionalExamResult.conditionalExam.length >= 1,
      `${module.id} should activate conditional exam add-ons when their structured modifier terms are present`
    );
  }
  const conditionalSafetyChecksInConditional = module.conditionalExam.filter(isBasicBedsideDataItem);
  if (conditionalSafetyChecksInConditional.length) {
    const triggerText = conditionalSafetyChecksInConditional[0].when?.termsAny?.slice(0, 3).join(" ");
    const conditionalSafetyResult = evaluateComplaintCds(`${module.label} ${triggerText}`, {}, { module });
    assert.ok(
      conditionalSafetyResult.conditionalExam.some(isBasicBedsideDataItem),
      `${module.id} should activate conditional safety add-ons when their structured modifier terms are present`
    );
  }
  auditedItemGroups.forEach((group) => {
    (module[group] || []).forEach((item) => assertMeaningfulItem(module, group, item));
  });
  ["requiredExam", "conditionalExam"].forEach((group) => {
    (module[group] || []).forEach((item) => assertAtomicExamItem(module, group, item));
  });
  [...module.requiredExam, ...module.conditionalExam].forEach((item) => {
    const label = item.label || "";
    const rationale = item.rationale || "";
    if (/acanthosis/i.test(label)) {
      assert.match(
        rationale,
        /insulin-resistance|cardiometabolic/i,
        `${module.id}.${item.id} acanthosis rationale should stay in insulin-resistance/cardiometabolic domain`
      );
      assert.doesNotMatch(
        rationale,
        /mass-effect|imaging|procedure planning/i,
        `${module.id}.${item.id} acanthosis rationale should not inherit neck-mass/imaging wording`
      );
    }
    if (/body mass index|current weight|waist circumference/i.test(label)) {
      assert.doesNotMatch(
        rationale,
        /mass-effect|procedure planning/i,
        `${module.id}.${item.id} anthropometric rationale should not inherit mass-effect wording`
      );
    }
  });
  [...module.requiredQuestions, ...module.conditionalQuestions].forEach((item) => {
    assert.ok(item.text && /\?$/.test(item.text.trim()), `${module.id}.${item.id} should be phrased as an askable bedside question`);
    assert.doesNotMatch(item.label, /\.$/, `${module.id}.${item.id} should not be a list-fragment statement`);
    assert.doesNotMatch(item.label, /^(Ask about|Clarify)\b/i, `${module.id}.${item.id} should not expose source extraction instructions`);
    assert.ok(item.when_to_ask, `${module.id}.${item.id} should include when-to-ask metadata`);
    assert.ok(item.diagnostic_purpose, `${module.id}.${item.id} should include diagnostic purpose metadata`);
    assert.ok(item.management_implication, `${module.id}.${item.id} should include management implication metadata`);
    assert.ok(item.tags?.length, `${module.id}.${item.id} should include retrieval/clinical tags`);
    assert.ok(questionOptionLabels(item.options).length >= 3, `${module.id}.${item.id} should include structured answer options`);
    assert.ok(!genericQuestionOptions(item.options), `${module.id}.${item.id} should use question-specific answer options`);
  });
  module.endocrine_metadata.source_ids.forEach((sourceId) => {
    const source = complaintSourceRegistry.find((row) => row.id === sourceId);
    assert.match(source?.date_accessed || "", /^\d{4}-\d{2}-\d{2}$/, `${module.id} source ${sourceId} should use ISO access date`);
    assert.ok(source.date_accessed <= "2026-06-11", `${module.id} source ${sourceId} access date should not be later than the audit date`);
    assert.match(source?.last_reviewed || "", /^\d{4}-\d{2}-\d{2}$/, `${module.id} source ${sourceId} should use ISO last-reviewed date`);
    assert.ok(source.last_reviewed >= source.date_accessed, `${module.id} source ${sourceId} should be reviewed on or after access`);
    assert.match(source?.url || "", /^https:\/\//, `${module.id} source ${sourceId} should have HTTPS provenance`);
  });
}

const endocrineModuleText = endocrineModules.map(flattenModuleText).join("\n");
const endocrineQuestionText = endocrineModules
  .flatMap((module) => [...module.requiredQuestions, ...module.conditionalQuestions])
  .map((item) => `${item.label || ""}\n${item.text || ""}`)
  .join("\n");
const endocrineQuestionStrings = endocrineModules.flatMap((module) =>
  [...module.requiredQuestions, ...module.conditionalQuestions].flatMap((item) => [item.label || "", item.text || ""])
);
const endocrineQuestionRows = endocrineModules.flatMap((module) =>
  [...module.requiredQuestions, ...module.conditionalQuestions].map((item) => ({
    moduleId: module.id,
    moduleLabel: module.label,
    id: item.id,
    tags: item.tags || [],
    termsAny: item.when?.termsAny || [],
    text: [
      item.label || "",
      item.text || "",
      item.action || "",
      item.when_to_ask || "",
      item.management_implication || ""
    ].join("\n")
  }))
);
function assertNoQuestionMatch(pattern, message) {
  const offenders = endocrineQuestionStrings.filter((text) => pattern.test(text));
  assert.deepEqual(offenders, [], `${message}: ${offenders.slice(0, 5).join(" | ")}`);
}
function assertNoQuestionRowMatch(predicate, message) {
  const offenders = endocrineQuestionRows
    .filter(predicate)
    .map((row) => `${row.moduleId}.${row.id}: ${row.text.replace(/\s+/g, " ").slice(0, 220)}`);
  assert.deepEqual(offenders, [], `${message}: ${offenders.slice(0, 5).join(" | ")}`);
}
assertNoQuestionMatch(
  /Have you had (?:anticonvulsants|injections or creams or inhalers|diet or sun exposure|neck surgery|calcium or vitamin D(?: intake)?|CKD\/chronic kidney disease or liver disease)\?/i,
  "generated endocrine history questions should not expose chopped-up risk-factor fragments"
);
assertNoQuestionMatch(
  /\bHave you had (?!heat intolerance,|cold intolerance,|new salt craving,)[^,?]{1,60}\?/i,
  "generated endocrine history questions should not expose bare seed-fragment phrasing"
);
assertNoQuestionMatch(
  /\b(?:Have you had|Is there) (?:and|or)\b/i,
  "generated endocrine history questions should not preserve dangling conjunctions from source fragments"
);
assertNoQuestionMatch(
  /\bIs there [^?]+\?/i,
  "generated endocrine history questions should avoid bare 'Is there ...?' source fragments"
);
assertNoQuestionMatch(
  /Any history of [^?]+because these change/i,
  "generated endocrine history questions should not expose source-rationale fragments as history text"
);
assertNoQuestionMatch(
  /The answer changes diagnostic framing, urgency, test interpretation, treatment safety, or follow-up planning/i,
  "generated endocrine history questions should not use generic management-implication filler"
);
assertNoQuestionRowMatch(
  (row) => /gestational_diabetes/.test(row.moduleId)
    && /\b(?:pregnancy possible now|planned soon|would pregnancy change|aldosterone-renin ratio|\bARR\b|adrenal incidentaloma)\b/i.test(row.text),
  "gestational diabetes history should not ask redundant pregnancy-possibility or adrenal-hypertension questions"
);
assertNoQuestionRowMatch(
  (row) => !/(?:thyroid|graves|hashimoto|thyrotoxicosis)/i.test(row.moduleId)
    && /\b(?:Graves orbitopathy|thyroid ultrasound|thyroid FNA|thyroid cancer-risk|compressive-symptom)\b/i.test(row.text),
  "non-thyroid endocrine questions should not leak thyroid-specific rationale"
);
assertNoQuestionRowMatch(
  (row) => !/(?:diabetes|prediabetes|metabolic_syndrome)/i.test(row.moduleId)
    && /\b(?:same-day hyperglycemia|hyperglycemia, ketosis|insulin-delivery evaluation)\b/i.test(row.text),
  "non-diabetes endocrine questions should not leak hyperglycemic-crisis rationale"
);
assertNoQuestionRowMatch(
  (row) => /\bAsk when the history or modifiers mention\b/i.test(row.text)
    || /\bpatient context includes one of:\s*(?:[a-z0-9/+-]+,\s*){3,}/i.test(row.text),
  "generated endocrine conditional-history metadata should summarize clinical context rather than dumping raw trigger tokens"
);
assertNoQuestionRowMatch(
  (row) => !/(?:adrenal|addison|congenital_adrenal_hyperplasia|hyperaldosteronism|pheochromocytoma|cushing)/i.test(row.moduleId)
    && /\badrenal-crisis\b/i.test(row.text),
  "non-adrenal endocrine questions should not leak adrenal-crisis trigger summaries"
);
const triggerStopwordTokens = new Set([
  "because",
  "these",
  "those",
  "this",
  "that",
  "from",
  "with",
  "associated",
  "change",
  "changed",
  "changes",
  "changing",
  "target",
  "targets",
  "therapy"
]);
const triggerTokenOffenders = endocrineQuestionRows
  .flatMap((row) => [
    ...(row.termsAny || []).map((term) => ({ ...row, field: "when.termsAny", term })),
    ...(row.tags || []).map((term) => ({ ...row, field: "tags", term }))
  ])
  .filter((row) => triggerStopwordTokens.has(String(row.term || "").toLowerCase()));
assert.deepEqual(
  triggerTokenOffenders.map((row) => `${row.moduleId}.${row.id} ${row.field}: ${row.term}`).slice(0, 20),
  [],
  "generated endocrine question tags/triggers should not contain connective stopwords as clinical retrieval concepts"
);
assertNoQuestionRowMatch(
  (row) => !/hyperaldosteronism/i.test(row.moduleId)
    && /\b(?:aldosterone-renin ratio|\bARR\b|adrenal incidentaloma)\b/i.test(row.text),
  "non-hyperaldosteronism questions should not leak aldosterone-renin workup prompts"
);
assertNoQuestionMatch(
  /Any current or recent (?:adrenal or thyroid symptoms|heat or cold intolerance|bowel change|mood or cognition|neck symptoms|eye symptoms|cyclic symptoms|ovulation symptoms|thyroid symptoms|vasomotor or sleep or mood or genitourinary symptoms|neurocognitive symptoms|pain or tenderness),/i,
  "generated endocrine history questions should expand broad symptom clusters into concrete bedside questions"
);
assertNoQuestionMatch(
  /\bAny current or recent\b/i,
  "generated endocrine history questions should not use the weak current-or-recent fallback template"
);
assertNoQuestionMatch(
  /\bAny [a-z][^?]{0,80} that could change reproductive counseling, test timing, or treatment safety\?/i,
  "generated endocrine reproductive questions should ask concrete reproductive context rather than expose a generic fallback"
);
assert.match(
  endocrineQuestionText,
  /Any oral, injected, inhaled, topical, eye-drop, joint-injection, or supplement steroid exposure\?/i,
  "steroid-route fragments should map to a clinically usable medication-exposure question"
);
assert.match(
  endocrineQuestionText,
  /What is the usual calcium and vitamin D intake, supplement use, diet pattern, and sun exposure\?/i,
  "calcium/vitamin D fragments should map to an intake and sun-exposure question"
);
assert.match(
  endocrineQuestionText,
  /Any antiseizure or enzyme-inducing medication use that could affect vitamin D metabolism, bone density, or calcium interpretation\?/i,
  "anticonvulsant fragments should map to a clinically usable bone-health medication question"
);

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

const primaryAldo = evaluateComplaintCds("primary aldosteronism Conn syndrome resistant hypertension hypokalemia");
assert.equal(primaryAldo.module.id, "hyperaldosteronism_v1");
assertHas(primaryAldo.requiredQuestions, /resistant|hypokalemia|arr/, "primary aldosteronism should ask resistant HTN and ARR context");

const pcos = evaluateComplaintCds("PCOS irregular periods hirsutism infertility acne");
assert.equal(pcos.module.id, "polycystic_ovary_syndrome_v1");
assertHas(pcos.requiredQuestions, /cycle|hirsutism|rapid virilization/, "PCOS should ask cycle and androgen history");
assert.doesNotMatch(labels(pcos.requiredQuestions), /morning erections|testicular symptoms|hot flashes|night sweats|vaginal dryness/i, "PCOS should not inherit male hypogonadism or menopause history questions");
assert.doesNotMatch(labels([...(pcos.requiredExam || []), ...(pcos.conditionalExam || []), ...(pcos.focusedExam || [])]), /testicular volume/i, "PCOS should not recommend testicular volume exam");

const prediabetes = evaluateComplaintCds("Prediabetes metabolic risk activity family history");
assert.equal(prediabetes.module.id, "prediabetes_v1");
assertHas(prediabetes.requiredQuestions, /family history of type 2 diabetes|cardiometabolic risk/i, "Prediabetes should ask diabetes/cardiometabolic family history, not generic endocrine pedigree");
assert.doesNotMatch(labels(prediabetes.requiredQuestions), /fever|infection symptoms|recent illness|wound|urinary symptoms|cough|ketone|kussmaul/i, "Prediabetes should not inherit acute infection or DKA-style trigger questions");
assertHas(prediabetes.focusedExam, /acanthosis/i, "Prediabetes should include insulin-resistance phenotype exam");
assert.doesNotMatch(labels(prediabetes.focusedExam), /monofilament|feet for ulcers|pedal pulses/i, "Prediabetes should not promote established-diabetes foot complication exams as core");
assertHas(prediabetes.module.conditionalExam, /lower leg edema|xanthomas|xanthelasma/i, "Prediabetes source module should include cardiometabolic conditional exam add-ons without foot-complication padding");
const prediabetesTriggeredExam = evaluateComplaintCds("Prediabetes metabolic risk with edema hypertriglyceridemia xanthoma");
assertHas(prediabetesTriggeredExam.conditionalExam, /lower leg edema|xanthomas|xanthelasma/i, "Prediabetes should activate cardiometabolic conditional exam add-ons when modifiers are present");

const metabolicSyndrome = evaluateComplaintCds("Metabolic syndrome waist triglycerides hdl hypertension insulin resistance");
assert.equal(metabolicSyndrome.module.id, "metabolic_syndrome_v1");
assertHas(metabolicSyndrome.requiredQuestions, /waist|sleep apnea|fatty liver|cardiometabolic/i, "Metabolic syndrome should ask cardiometabolic risk history");
assertHas(metabolicSyndrome.focusedExam, /acanthosis|waist circumference/i, "Metabolic syndrome should include insulin-resistance or anthropometric phenotype exam");
assertHas(metabolicSyndrome.module.conditionalExam, /lower leg edema|xanthomas|xanthelasma/i, "Metabolic syndrome source module should include cardiometabolic conditional exam add-ons");
const metabolicSyndromeTriggeredExam = evaluateComplaintCds("Metabolic syndrome with dyspnea edema heart failure and severe hypertriglyceridemia xanthelasma");
assertHas(metabolicSyndromeTriggeredExam.conditionalExam, /lower leg edema|xanthomas|xanthelasma/i, "Metabolic syndrome should activate cardiometabolic conditional exam add-ons when modifiers are present");

const gestational = evaluateComplaintCds("Gestational diabetes 28 weeks OGTT vomiting ketones hypertension fetal growth");
assert.equal(gestational.module.id, "gestational_diabetes_v1");
assertHas(gestational.requiredQuestions, /gestational age|prior gestational diabetes|fetal growth/i, "Gestational diabetes should ask pregnancy-specific diabetes context");

const diabetesInsipidus = evaluateComplaintCds("diabetes insipidus polyuria polydipsia hypernatremia pituitary surgery");
assert.equal(diabetesInsipidus.module.id, "diabetes_insipidus_v1");
assertHas(diabetesInsipidus.requiredQuestions, /24-hour urine|thirst|lithium|pituitary/, "DI should ask polyuria and cause context");
assertHas(diabetesInsipidus.focusedExam, /mucous membranes|capillary refill|skin turgor/i, "DI should focus the physical exam on dehydration and perfusion maneuvers");
assertHas(diabetesInsipidus.requiredExam.filter(isBasicBedsideDataItem), /mental status/i, "DI should keep hypernatremia mental-status acuity assessment among bedside data items");
assert.doesNotMatch(labels(diabetesInsipidus.focusedExam), /galactorrhea|secondary sex|acral|tongue|pubertal|testicular|breast tissue/i, "DI should not inherit unrelated pituitary/gonadal phenotype exams");
assert.doesNotMatch(labels(diabetesInsipidus.focusedExam), /visual field|extraocular/i, "DI should not promote mass-effect eye exams without headache, vision, diplopia, macroadenoma, or apoplexy triggers");

const diabetesInsipidusMassEffect = evaluateComplaintCds("diabetes insipidus polyuria polydipsia hypernatremia headache peripheral vision loss diplopia pituitary surgery");
assertHas(diabetesInsipidusMassEffect.conditionalExam, /visual fields|extraocular/i, "DI should add sellar mass-effect exams when headache, visual loss, or diplopia modifiers are present");

const prolactinoma = selectComplaintModule("prolactinoma galactorrhea amenorrhea visual field headache");
assert.equal(prolactinoma.id, "prolactinoma_v1", "prolactinoma query should route to prolactinoma module");

const graves = evaluateComplaintCds("Graves disease palpitations heat intolerance eye irritation");
assert.equal(graves.module.id, "graves_disease_v1");
assertHas(graves.focusedExam, /goiter|tachycardia|tremor|lid lag|proptosis|eom/i, "Graves disease should include thyroid, cardiac/rhythm, tremor, and orbitopathy-focused exam");

const thyroidNodule = evaluateComplaintCds("benign thyroid nodule low TSH ultrasound FNA goiter");
assert.equal(thyroidNodule.module.id, "thyroid_nodules_v1");
assertHas(thyroidNodule.focusedExam, /thyroid palpation|cervical nodes|voice|airway/i, "Thyroid nodule should include thyroid, cervical nodes, and compressive/voice assessment");

const thyroidCancer = evaluateComplaintCds("thyroid cancer hoarseness dysphagia radiation family thyroid cancer medullary");
assert.equal(thyroidCancer.module.id, "thyroid_cancer_v1");
assertHas(thyroidCancer.focusedExam, /thyroid mass|cervical nodal|voice|airway/i, "Thyroid cancer should include mass, nodal, voice, and airway assessment");

const vitaminD = evaluateComplaintCds("Vitamin D Deficiency / Osteomalacia bone pain proximal weakness falls");
const vitaminDBoneTenderness = vitaminD.focusedExam.find((item) => /bone tenderness/i.test(item.label));
assert.ok(vitaminDBoneTenderness, "Vitamin D/Osteomalacia should include bone tenderness exam");
assert.match(vitaminDBoneTenderness.diagnostic_target, /osteomalacia|fracture|fall|hypocalcemia/i, "bone tenderness target should stay in bone/mineral domain");
assert.doesNotMatch(vitaminDBoneTenderness.diagnostic_target, /abdominal/i, "bone tenderness should not inherit abdominal-tenderness target");
const vitaminDSpinePosture = vitaminD.focusedExam.find((item) => /spine posture|kyphosis/i.test(item.label));
assert.ok(vitaminDSpinePosture, "Vitamin D/Osteomalacia should include spine posture exam");
assert.match(vitaminDSpinePosture.technique, /Inspect standing posture|spinal curvature/i, "spine posture technique should be inspection, not palpation");

const cushing = evaluateComplaintCds("Cushing's Syndrome purple striae bruising proximal weakness");
const purpleStriae = cushing.focusedExam.find((item) => /purple striae/i.test(item.label));
assert.ok(purpleStriae, "Cushing syndrome should include purple striae exam");
assert.match(purpleStriae.diagnostic_target, /glucocorticoid|Cushing|adrenal/i, "purple striae target should stay in Cushing/adrenal phenotype domain");
assert.doesNotMatch(purpleStriae.diagnostic_target, /abdominal complication/i, "purple striae should not inherit generic abdominal-tenderness target");
assert.equal(selectComplaintModule("Cushing syndrome purple striae")?.id, "cushings_syndrome_v1", "non-possessive Cushing syndrome should resolve");

const report = readFileSync("reports/endocrine-workup-completion-2026-06-06.md", "utf8");
assert.match(report, /Completed modules: 37/);
assert.match(report, /37\. Cushing's Disease/);

const generatedReport = readFileSync("reports/endocrine-workups-2026-06-06.md", "utf8");
assert.match(generatedReport, /Basic bedside data \/ safety checks/);
assert.match(generatedReport, /Core physical exam maneuvers/);
assert.match(generatedReport, /Conditional exam add-ons/);
assert.doesNotMatch(generatedReport, /Focused physical exam/i, "generated report should not expose raw bundled physical exam seed sections");
assert.doesNotMatch(generatedReport, /Vitals and acuity screen/i, "basic vital-sign data should not be presented as a physical exam item");
assert.doesNotMatch(generatedReport, /Proximal strength, bone tenderness, gait\/falls, hypocalcemia signs/i, "Vitamin D/Osteomalacia report should use atomic maneuvers, not bundled seed text");
assert.doesNotMatch(generatedReport, /Any fever, infection symptoms, recent illness, procedure, hospitalization, wound, urinary symptoms, cough, or sick contacts\?/i, "generated report should split broad infection-source history into clinically localizing questions");
assert.doesNotMatch(generatedReport, /localizing infectious symptoms/i, "generated report should not expose vague infectious-symptom fallback wording");
assert.doesNotMatch(generatedReport, /Have you had (?:anticonvulsants|injections or creams or inhalers|diet or sun exposure|neck surgery|calcium or vitamin D(?: intake)?|CKD\/chronic kidney disease or liver disease)\?/i, "generated report should not expose chopped-up risk-factor questions");
assert.doesNotMatch(generatedReport, /\bHave you had (?!heat intolerance,|cold intolerance,|new salt craving,)[^,?]{1,60}\?/i, "generated report should not expose bare seed-fragment history questions");
assert.doesNotMatch(generatedReport, /\b(?:Have you had|Is there) (?:and|or)\b/i, "generated report should not expose dangling conjunction history questions");
assert.doesNotMatch(generatedReport, /\bIs there [^?]+\?/i, "generated report should avoid bare 'Is there ...?' source fragments");
assert.doesNotMatch(generatedReport, /Any history of [^?]+because these change/i, "generated report should not expose source-rationale fragments as history text");
assert.doesNotMatch(generatedReport, /Any current or recent (?:adrenal or thyroid symptoms|heat or cold intolerance|bowel change|mood or cognition|neck symptoms|eye symptoms|cyclic symptoms|ovulation symptoms|thyroid symptoms|vasomotor or sleep or mood or genitourinary symptoms|neurocognitive symptoms|pain or tenderness),/i, "generated report should expand broad symptom clusters into concrete bedside questions");
assert.doesNotMatch(generatedReport, /\bAny current or recent\b/i, "generated report should not use the weak current-or-recent fallback template");
assert.doesNotMatch(generatedReport, /\bAny [a-z][^?]{0,80} that could change reproductive counseling, test timing, or treatment safety\?/i, "generated report should ask concrete reproductive context instead of generic reproductive fallback");
assert.match(generatedReport, /(?:Assess|Test) proximal hip flexor strength/i, "Vitamin D/Osteomalacia report should include an atomic proximal strength maneuver");
assert.match(generatedReport, /Palpate focal bone tenderness/i, "Vitamin D/Osteomalacia report should include an atomic bone tenderness maneuver");
assert.match(generatedReport, /(?:Assess|Observe) gait stability if safe/i, "Vitamin D/Osteomalacia report should include an atomic gait/falls maneuver when safe");
assert.match(generatedReport, /Elicit Chvostek sign/i, "Vitamin D/Osteomalacia report should include an atomic hypocalcemia-sign maneuver");
assert.match(generatedReport, /Any cough, sputum, pleuritic pain, dyspnea, hypoxemia, or focal chest symptoms suggesting pneumonia or respiratory infection\?/i, "infection-trigger workups should ask source-specific respiratory infection questions");
assert.match(generatedReport, /Any dysuria, urinary frequency or urgency, suprapubic pain, hematuria, or flank pain suggesting UTI or pyelonephritis\?/i, "infection-trigger workups should ask source-specific urinary/flank infection questions");
assert.match(generatedReport, /Any (?:foot ulcer, )?wound, skin redness, drainage, tenderness, indwelling line\/device, or procedure-site concern suggesting infection\?/i, "infection-trigger workups should ask source-specific skin/wound/line infection questions");

console.log("Endocrine knowledge module tests passed.");
