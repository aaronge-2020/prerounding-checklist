import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildClinicalIntentRetrievalContext,
  buildUnsupportedClinicalIntentGap,
  buildValidatedClinicalIntentPromptBlock,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  getClinicalIntentById,
  moduleBackedClinicalIntentRegistry,
  normalizeClinicalIntentSuppressRules,
  resolveClinicalIntents,
  sanitizeUnsupportedClinicalIntentGapText,
  selectedValidatedClinicalIntents,
  validateClinicalIntentRegistry
} from "../clinical-intents.js";
import {
  complaintModules,
  complaintSourceRegistry
} from "../complaint-cds.js";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";

const evidenceSourceRowsForRegistry = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const knownClinicalSourceIds = new Set([
  ...complaintSourceRegistry.map((source) => source.id),
  ...evidenceSourceRowsForRegistry.map((source) => source.source_id)
]);
const knownComplaintModuleIds = new Set(complaintModules.map((module) => module.id));
const uiSource = readFileSync("index.html", "utf8");
assert.ok(
  uiSource.includes("function evidenceSourceRowAsComplaintSource")
    && uiSource.includes("state.evidenceCatalog?.sourceRows")
    && uiSource.includes("sourceRow.source_id")
    && uiSource.includes("sourceRow.preferred_citation"),
  "app source registry should merge evidence-overlay source rows into the effective source registry for validated clinical-intent traceability"
);
assert.ok(
  uiSource.includes("function clinicalIntentSelectionPrompt")
    && uiSource.includes("result.ambiguous")
    && uiSource.includes("Multiple validated clinical intents matched")
    && uiSource.includes("Select the intended workup before building recommendations"),
  "clinical workup UI should distinguish ambiguous validated intent matches from unsupported search gaps"
);
assert.ok(
  uiSource.includes("function renderUnsupportedClinicalIntentResult")
    && uiSource.includes("Unsupported concern blocked")
    && uiSource.includes("recommendations blocked")
    && uiSource.includes("dataset.unsupportedIntentGap")
    && uiSource.includes("No validated local intent matched"),
  "unsupported free-text searches should render an explicit blocked-state result instead of an authoritative or empty recommendation state"
);
assert.ok(knownClinicalSourceIds.has("SSC_SEPSIS_2026"), "source registry should cite the current Surviving Sepsis Campaign adult guideline year");
assert.ok(knownClinicalSourceIds.has("ATS_CAP_2025"), "source registry should cite the current adult CAP guideline update");
assert.ok(knownClinicalSourceIds.has("IDSA_CAP_PATHWAY_2019"), "source registry should cite the CAP pathway used for fever/pneumonia bedside findings");

const registryAudit = validateClinicalIntentRegistry(clinicalIntentRegistry, {
  knownSourceIds: knownClinicalSourceIds,
  knownComplaintModuleIds
});
assert.ok(registryAudit.ok, registryAudit.issues.join("\n"));
clinicalIntentRegistry
  .filter((intentRow) => intentRow.status === "validated")
  .forEach((intentRow) => {
    assert.ok((intentRow.suppress_rules || []).length, `${intentRow.intent_id} should carry explicit suppress rules`);
    const suppressLabels = new Set((intentRow.suppress_rules || []).flatMap((rule) => rule.suppress_labels || []));
    (intentRow.avoid_labels || []).forEach((label) => {
      assert.ok(suppressLabels.has(label), `${intentRow.intent_id} suppress_rules should cover avoid label ${label}`);
    });
    (intentRow.suppress_rules || []).forEach((rule) => {
      assert.ok(rule.rule_id && rule.reason, `${intentRow.intent_id} suppress rule should have id and reason`);
      assert.ok((rule.intent_ids || []).includes(intentRow.intent_id), `${intentRow.intent_id} suppress rule should trace to its intent`);
      assert.ok((rule.unless_tags_include || []).length, `${intentRow.intent_id} suppress rule should document override tags`);
    });
  });

const normalizedSyntheticSuppressRules = normalizeClinicalIntentSuppressRules({
  intentId: "synthetic_intent_v1",
  intentLabel: "Synthetic intent",
  avoidLabels: ["PMI"]
});
assert.equal(normalizedSyntheticSuppressRules[0].suppress_labels[0], "PMI", "suppress-rule normalizer should convert avoid labels into rule labels");
assert.ok(normalizedSyntheticSuppressRules[0].reason, "suppress-rule normalizer should add an auditable reason");

const missingReviewMetadataAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_missing_review_v1",
    last_reviewed: "",
    review_owner: ""
  }
]);
assert.ok(!missingReviewMetadataAudit.ok, "clinical intents should require reviewer/date metadata");
assert.ok(
  missingReviewMetadataAudit.issues.some((issue) => /last_reviewed/.test(issue))
    && missingReviewMetadataAudit.issues.some((issue) => /review_owner/.test(issue)),
  "review metadata failures should name last_reviewed and review_owner"
);

const missingValidatedScopeAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_scope_v1",
    evidence_tags: [],
    clinical_bundle_ids: [],
    required_domains: []
  }
]);
assert.ok(!missingValidatedScopeAudit.ok, "validated intents should require scope tags, bundles, and domains");
assert.ok(
  missingValidatedScopeAudit.issues.some((issue) => /evidence_tags, clinical_bundle_ids, and required_domains/.test(issue)),
  "validated scope metadata failures should be explicit"
);

const invalidStatusAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_status_v1",
    status: "readyish"
  }
]);
assert.ok(!invalidStatusAudit.ok, "clinical intents should reject unrecognized status values");
assert.ok(
  invalidStatusAudit.issues.some((issue) => /invalid status readyish/.test(issue)),
  "invalid status failures should be explicit"
);

const scaffoldValidatedMetadataAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_scaffold_metadata_v1",
    required_domains: ["focused exam gap review"]
  }
]);
assert.ok(!scaffoldValidatedMetadataAudit.ok, "validated intents should reject scaffold review/gap wording");
assert.ok(
  scaffoldValidatedMetadataAudit.issues.some((issue) => /scaffold review\/gap wording/.test(issue)),
  "scaffold metadata failures should be explicit"
);
clinicalIntentRegistry
  .filter((intentRow) => intentRow.status === "validated")
  .forEach((intentRow) => {
    const validatedUserFacingMetadata = [
      intentRow.label,
      intentRow.intent_type,
      intentRow.complaint_module_id,
      ...(intentRow.aliases || []),
      ...(intentRow.evidence_tags || []),
      ...(intentRow.clinical_bundle_ids || []),
      ...(intentRow.required_domains || []),
      ...(intentRow.avoid_labels || []),
      ...(intentRow.gold_case_ids || [])
    ].map((value) => String(value || "")).join(" | ");
    assert.doesNotMatch(
      validatedUserFacingMetadata,
      /\b(?:staged gap|gap warning|gap review|needs review|reviewer needed|source pending)\b/i,
      `${intentRow.intent_id} validated user-facing metadata should not expose scaffold review/gap wording`
    );
  });

const missingAvoidLabelsAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_missing_avoid_v1",
    avoid_labels: [],
    suppress_rules: []
  }
]);
assert.ok(!missingAvoidLabelsAudit.ok, "validated intents should require avoid/suppress labels");
assert.ok(
  missingAvoidLabelsAudit.issues.some((issue) => /avoid_labels or suppress-rule labels/.test(issue)),
  "missing avoid/suppress metadata failures should be explicit"
);

const badSuppressRuleAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_suppress_rule_v1",
    suppress_rules: [{ rule_id: "bad_rule", suppress_labels: ["PMI"], reason: "" }]
  }
]);
assert.ok(!badSuppressRuleAudit.ok, "validated intents should require structured suppress-rule metadata");
assert.ok(
  badSuppressRuleAudit.issues.some((issue) => /intent_ids/.test(issue))
    && badSuppressRuleAudit.issues.some((issue) => /reason/.test(issue))
    && badSuppressRuleAudit.issues.some((issue) => /unless_tags_include/.test(issue)),
  "bad suppress-rule failures should name missing traceability, reason, and override tags"
);

const duplicateAliasAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_duplicate_alias_v1",
    aliases: ["Duplicate Alias", "duplicate-alias"]
  }
]);
assert.ok(!duplicateAliasAudit.ok, "clinical intent arrays should reject normalized duplicates");
assert.ok(
  duplicateAliasAudit.issues.some((issue) => /aliases must not contain duplicate values/.test(issue)),
  "duplicate alias failures should be explicit"
);

const badReferenceAudit = validateClinicalIntentRegistry([
  {
    ...clinicalIntentRegistry[0],
    intent_id: "bad_source_ref_v1",
    source_ids: ["MISSING_SOURCE_FOR_TEST"],
    complaint_module_id: "missing_module_for_test"
  }
], {
  knownSourceIds: knownClinicalSourceIds,
  knownComplaintModuleIds
});
assert.ok(!badReferenceAudit.ok, "clinical intent registry should reject unknown source/module references when registries are supplied");
assert.ok(
  badReferenceAudit.issues.some((issue) => /unknown source_id MISSING_SOURCE_FOR_TEST/.test(issue))
    && badReferenceAudit.issues.some((issue) => /unknown complaint_module_id missing_module_for_test/.test(issue)),
  "unknown source/module failures should be explicit"
);

const activeEndocrineModules = complaintModules.filter((module) => module.endocrine_metadata?.activation_status === "active_guideline_workup");
const moduleBackedIntentModuleIds = new Set(moduleBackedClinicalIntentRegistry.map((intentRow) => intentRow.complaint_module_id));
assert.equal(moduleBackedClinicalIntentRegistry.length, 37, "all curated endocrine workups should be exposed as module-backed validated intents");
activeEndocrineModules.forEach((module) => {
  assert.ok(moduleBackedIntentModuleIds.has(module.id), `${module.id} should have a validated module-backed clinical intent`);
  const resolved = resolveClinicalIntents(module.label, clinicalIntentRegistry, { limit: 4 });
  assert.ok(
    resolved.validatedMatches.some((intentRow) => intentRow.complaint_module_id === module.id),
    `${module.label} should resolve to its module-backed validated intent`
  );
});

function topIntent(query) {
  return resolveClinicalIntents(query, clinicalIntentRegistry).validatedMatches[0]?.intent_id || "";
}

assert.equal(topIntent("belly cramps after eating"), "abdominal_pain_cramping_v1");
assert.equal(topIntent("burning pee with fever"), "gu_renal_dysuria_v1");
assert.equal(topIntent("can't breathe lying flat"), "dyspnea_hf_v1");
assert.equal(topIntent("face droop and aphasia"), "stroke_focal_neuro_v1");
assert.equal(topIntent("black stool and dizziness"), "bleeding_anemia_v1");
assert.equal(topIntent("DVT PE dyspnea"), "suspected_pe_v1");
assert.equal(topIntent("PE dyspnea with hypoxia"), "suspected_pe_v1");
assert.equal(topIntent("thyroid storm with fever and agitation"), "thyroid_crisis_v1");
assert.equal(topIntent("fever with possible pneumonia or infection source"), "fever_sepsis_v1");
assert.equal(topIntent("pediatric fever"), "pediatric_fever_sepsis_v1");
assert.equal(topIntent("child fever sepsis"), "pediatric_fever_sepsis_v1");
assert.equal(topIntent("febrile infant"), "pediatric_fever_sepsis_v1");
assert.equal(topIntent("child wheeze"), "pediatric_respiratory_wheeze_v1");
assert.equal(topIntent("bronchiolitis"), "pediatric_respiratory_wheeze_v1");
assert.equal(topIntent("pediatric respiratory distress"), "pediatric_respiratory_wheeze_v1");
assert.equal(topIntent("child abdominal pain"), "pediatric_abdominal_pain_vomiting_v1");
assert.equal(topIntent("child vomiting green"), "pediatric_abdominal_pain_vomiting_v1");
assert.equal(topIntent("pediatric acute abdomen"), "pediatric_abdominal_pain_vomiting_v1");
assert.equal(topIntent("child chest pain"), "pediatric_chest_pain_syncope_v1");
assert.equal(topIntent("child fainting"), "pediatric_chest_pain_syncope_v1");
assert.equal(topIntent("pediatric syncope"), "pediatric_chest_pain_syncope_v1");
assert.equal(topIntent("child palpitations"), "pediatric_chest_pain_syncope_v1");
assert.equal(topIntent("child dysuria"), "pediatric_urinary_uti_pyelonephritis_v1");
assert.equal(topIntent("pediatric UTI"), "pediatric_urinary_uti_pyelonephritis_v1");
assert.equal(topIntent("child pyelonephritis"), "pediatric_urinary_uti_pyelonephritis_v1");
assert.equal(topIntent("febrile UTI child"), "pediatric_urinary_uti_pyelonephritis_v1");
assert.equal(topIntent("child rash"), "pediatric_rash_skin_v1");
assert.equal(topIntent("child petechiae"), "pediatric_rash_skin_v1");
assert.equal(topIntent("non blanching rash child"), "pediatric_rash_skin_v1");
assert.equal(topIntent("kawasaki concern"), "pediatric_rash_skin_v1");
assert.equal(topIntent("child anemia"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("child anaemia"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("pale child"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("child low platelets"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("child ITP"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("heavy period teen anemia"), "pediatric_hematology_anemia_bleeding_v1");
assert.equal(topIntent("anemia"), "bleeding_anemia_v1");
assert.equal(topIntent("child limp"), "pediatric_msk_limp_hot_joint_v1");
assert.equal(topIntent("limping child"), "pediatric_msk_limp_hot_joint_v1");
assert.equal(topIntent("non weight bearing child"), "pediatric_msk_limp_hot_joint_v1");
assert.equal(topIntent("hot swollen knee child"), "pediatric_msk_limp_hot_joint_v1");
assert.equal(topIntent("child septic arthritis"), "pediatric_msk_limp_hot_joint_v1");
assert.equal(topIntent("child headache vomiting"), "pediatric_neuro_headache_seizure_ams_v1");
assert.equal(topIntent("child seizure"), "pediatric_neuro_headache_seizure_ams_v1");
assert.equal(topIntent("child altered mental status"), "pediatric_neuro_headache_seizure_ams_v1");
assert.equal(topIntent("child face droop"), "pediatric_neuro_headache_seizure_ams_v1");
assert.equal(topIntent("status epilepticus child"), "pediatric_neuro_headache_seizure_ams_v1");
assert.equal(topIntent("penile discharge and dysuria after STI exposure"), "genital_discharge_sti_v1");
assert.equal(topIntent("acute scrotal pain with nausea and high riding testis"), "acute_scrotal_pain_v1");
assert.equal(topIntent("routine thyroid disease evaluation"), "routine_thyroid_disease_v1");
assert.equal(topIntent("Graves disease palpitations heat intolerance"), "graves_disease_intent_v1");

[
  ["can not catch my breath", "dyspnea_hf_v1"],
  ["can't catch my breath", "dyspnea_hf_v1"],
  ["child shortness of breath", "pediatric_respiratory_wheeze_v1"],
  ["infant wheeze", "pediatric_respiratory_wheeze_v1"],
  ["baby wheezing", "pediatric_respiratory_wheeze_v1"],
  ["child asthma exacerbation", "pediatric_respiratory_wheeze_v1"],
  ["child belly pain", "pediatric_abdominal_pain_vomiting_v1"],
  ["green vomit child", "pediatric_abdominal_pain_vomiting_v1"],
  ["teen lower abdominal pain", "pediatric_abdominal_pain_vomiting_v1"],
  ["child uti abdominal pain", "pediatric_abdominal_pain_vomiting_v1"],
  ["teen chest pain", "pediatric_chest_pain_syncope_v1"],
  ["adolescent palpitations", "pediatric_chest_pain_syncope_v1"],
  ["exertional syncope child", "pediatric_chest_pain_syncope_v1"],
  ["fainted during exercise child", "pediatric_chest_pain_syncope_v1"],
  ["burning pee child", "pediatric_urinary_uti_pyelonephritis_v1"],
  ["child urinary frequency", "pediatric_urinary_uti_pyelonephritis_v1"],
  ["child flank pain", "pediatric_urinary_uti_pyelonephritis_v1"],
  ["recurrent uti child", "pediatric_urinary_uti_pyelonephritis_v1"],
  ["catheter uti child", "pediatric_urinary_uti_pyelonephritis_v1"],
  ["fever and rash child", "pediatric_rash_skin_v1"],
  ["child hives", "pediatric_rash_skin_v1"],
  ["child cellulitis", "pediatric_rash_skin_v1"],
  ["prolonged fever rash child", "pediatric_rash_skin_v1"],
  ["child bruising pallor", "pediatric_hematology_anemia_bleeding_v1"],
  ["adolescent heavy menstrual bleeding anemia", "pediatric_hematology_anemia_bleeding_v1"],
  ["child leukemia symptoms", "pediatric_hematology_anemia_bleeding_v1"],
  ["child cannot walk", "pediatric_msk_limp_hot_joint_v1"],
  ["child refuses to walk", "pediatric_msk_limp_hot_joint_v1"],
  ["child swollen joint", "pediatric_msk_limp_hot_joint_v1"],
  ["pediatric osteomyelitis", "pediatric_msk_limp_hot_joint_v1"],
  ["toddler fracture concern", "pediatric_msk_limp_hot_joint_v1"],
  ["headache wakes child from sleep", "pediatric_neuro_headache_seizure_ams_v1"],
  ["morning headache child", "pediatric_neuro_headache_seizure_ams_v1"],
  ["child headache ataxia", "pediatric_neuro_headache_seizure_ams_v1"],
  ["first seizure child", "pediatric_neuro_headache_seizure_ams_v1"],
  ["child still seizing", "pediatric_neuro_headache_seizure_ams_v1"],
  ["child focal weakness", "pediatric_neuro_headache_seizure_ams_v1"],
  ["stops breathing during sleep", "sleep_apnea_snoring_v1"],
  ["coffee ground emesis", "bleeding_anemia_v1"],
  ["tarry stool and lightheaded", "bleeding_anemia_v1"],
  ["right upper quadrant pain after fatty food", "abdominal_pain_cramping_v1"],
  ["missed period and lower abdominal pain", "pelvic_menstrual_pain_v1"],
  ["pregnant with pelvic pain and shoulder pain", "pelvic_menstrual_pain_v1"],
  ["kidney stone colic", "gu_renal_dysuria_v1"],
  ["pus from penis", "genital_discharge_sti_v1"],
  ["vaginal discharge after new partner", "genital_discharge_sti_v1"],
  ["genital ulcer painful", "genital_discharge_sti_v1"],
  ["can not urinate with back pain", "spine_cord_compression_v1"],
  ["red swollen joint with fever", "focused_msk_v1"],
  ["cannot bear weight after injury", "focused_msk_v1"],
  ["hot knee swelling", "focused_msk_v1"]
].forEach(([query, expectedIntentId]) => {
  const resolved = resolveClinicalIntents(query, clinicalIntentRegistry, { limit: 4 });
  assert.equal(
    resolved.validatedMatches[0]?.intent_id,
    expectedIntentId,
    `${query} should route to the validated ${expectedIntentId} intent`
  );
  assert.equal(resolved.unsupported, false, `${query} should not be treated as an unsupported free-text gap`);
});

[
  "purple fingernails after eating mango while juggling",
  "my left eyebrow twitches after espresso"
].forEach((query) => {
  const resolved = resolveClinicalIntents(query, clinicalIntentRegistry, { limit: 4 });
  assert.equal(resolved.unsupported, true, `${query} should remain unsupported despite broader synonym coverage`);
  assert.equal(resolved.validatedMatches.length, 0, `${query} should not produce validated intent matches`);
});

const routineGraves = resolveClinicalIntents("Graves disease palpitations heat intolerance");
assert.equal(routineGraves.validatedMatches[0]?.intent_id, "graves_disease_intent_v1", "exact Graves disease should authorize the specific module-backed Graves intent");
assert.equal(routineGraves.unsupported, false, "specific Graves disease should be an active validated intent");
assert.equal(routineGraves.selectionStatus, "ambiguous_validated_intent", "specific Graves search should still expose broader thyroid alternatives as selectable, not auto-run them");
assert.equal(routineGraves.ambiguous, true, "multiple validated thyroid matches should be explicitly marked ambiguous for UI messaging");
assert.equal(routineGraves.topValidatedMatch?.intent_id, "graves_disease_intent_v1", "resolver should expose the highest scoring validated match for display/audit only");
assert.ok(
  routineGraves.validatedMatches.some((intentRow) => intentRow.intent_id === "routine_thyroid_disease_v1"),
  "routine thyroid intent should remain available as a broader thyroid option"
);
assert.ok(
  !routineGraves.validatedMatches.some((intentRow) => intentRow.intent_id === "thyroid_crisis_v1"),
  "routine Graves disease should not auto-authorize the thyroid crisis intent"
);

const plainFever = resolveClinicalIntents("fever");
assert.equal(plainFever.validatedMatches[0]?.intent_id, "fever_sepsis_v1", "plain fever should resolve to the fever/infection validated intent");
assert.ok(
  !plainFever.validatedMatches.some((intentRow) => intentRow.intent_id === "thyroid_crisis_v1"),
  "plain fever should not offer thyroid crisis from a longer alias without thyroid-specific context"
);
const pneumoniaFever = resolveClinicalIntents("fever with possible pneumonia");
assert.ok(
  !pneumoniaFever.validatedMatches.some((intentRow) => intentRow.intent_id === "thyroid_crisis_v1"),
  "fever with pneumonia context should not offer thyroid crisis unless thyroid features are present"
);
const pediatricFever = resolveClinicalIntents("child fever with possible sepsis");
assert.equal(
  pediatricFever.validatedMatches[0]?.intent_id,
  "pediatric_fever_sepsis_v1",
  "child fever should route to the pediatric fever/sepsis validated intent"
);
assert.ok(
  pediatricFever.validatedMatches.some((intentRow) => intentRow.intent_id === "fever_sepsis_v1"),
  "child fever should still expose adult fever as a lower-ranked alternative only for deliberate selection and applicability gating"
);
const pediatricRespiratory = resolveClinicalIntents("child shortness of breath with wheeze");
assert.equal(
  pediatricRespiratory.validatedMatches[0]?.intent_id,
  "pediatric_respiratory_wheeze_v1",
  "child shortness of breath with wheeze should route to the pediatric respiratory validated intent"
);
assert.ok(
  pediatricRespiratory.validatedMatches.some((intentRow) => intentRow.intent_id === "dyspnea_hf_v1"),
  "child respiratory distress should still expose adult dyspnea/HF only as a lower-ranked deliberate alternative with pediatric gating"
);
const pediatricMsk = resolveClinicalIntents("child hot swollen knee cannot bear weight");
assert.equal(
  pediatricMsk.validatedMatches[0]?.intent_id,
  "pediatric_msk_limp_hot_joint_v1",
  "child hot swollen joint with inability to bear weight should route to the pediatric MSK validated intent"
);
assert.ok(
  pediatricMsk.validatedMatches.some((intentRow) => intentRow.intent_id === "focused_msk_v1"),
  "child MSK concern should still expose adult focused MSK only as a lower-ranked deliberate alternative with pediatric gating"
);
const pediatricNeuro = resolveClinicalIntents("child face droop and aphasia");
assert.equal(
  pediatricNeuro.validatedMatches[0]?.intent_id,
  "pediatric_neuro_headache_seizure_ams_v1",
  "child focal neurologic symptoms should route to the pediatric neuro validated intent"
);
assert.ok(
  pediatricNeuro.validatedMatches.some((intentRow) => intentRow.intent_id === "stroke_focal_neuro_v1"),
  "child focal neurologic symptoms should still expose adult stroke/focal neuro only as a lower-ranked deliberate alternative with pediatric gating"
);
const pediatricDkaQueries = [
  "child dka",
  "child diabetic ketoacidosis",
  "child high blood sugar ketones",
  "child vomiting diabetes",
  "pediatric HHS",
  "adolescent euglycemic dka sglt2"
];
pediatricDkaQueries.forEach((query) => {
  const pediatricDka = resolveClinicalIntents(query);
  assert.equal(
    pediatricDka.validatedMatches[0]?.intent_id,
    "pediatric_dka_hhs_hyperglycemia_v1",
    `${query} should route to the pediatric DKA/HHS validated intent`
  );
  const adultDkaIndex = pediatricDka.validatedMatches.findIndex((intentRow) => intentRow.intent_id === "dka_hhs_v1");
  if (adultDkaIndex >= 0) {
    assert.ok(
      adultDkaIndex > 0,
      `${query} should expose adult DKA/HHS only as a lower-ranked deliberate alternative with pediatric gating`
    );
  }
});
const explicitThyroidCrisis = resolveClinicalIntents("thyroid storm fever agitation");
assert.equal(
  explicitThyroidCrisis.validatedMatches[0]?.intent_id,
  "thyroid_crisis_v1",
  "explicit thyroid storm language should still authorize the thyroid-crisis intent"
);
const dkaSearch = resolveClinicalIntents("dka");
assert.equal(dkaSearch.validatedMatches.length, 1, "DKA search should return one validated intent rather than duplicate module-backed concepts");
assert.equal(dkaSearch.validatedMatches[0]?.intent_id, "dka_hhs_v1", "DKA search should select the curated DKA/HHS intent");
assert.equal(dkaSearch.validatedMatchCount, 1, "resolver should expose validated match count for UI gating");
assert.equal(dkaSearch.singleValidatedMatch?.intent_id, "dka_hhs_v1", "single-match resolver metadata should expose the validated intent without auto-selecting it");
assert.equal(dkaSearch.topValidatedMatch?.intent_id, "dka_hhs_v1", "top validated match should be available for audit/display");
assert.equal(dkaSearch.ambiguous, false, "single-match DKA search should not be marked ambiguous");
assert.equal(dkaSearch.requiresSelection, true, "single-match DKA search still requires explicit user selection before recommendations");
assert.equal(dkaSearch.selectionStatus, "single_validated_intent", "single-match resolver status should be explicit");
assert.match(dkaSearch.selectionReason, /explicit selection is still required/i, "single-match resolver status should not imply auto-authorization");
assert.equal(
  dkaSearch.validatedMatches[0]?.complaint_module_id,
  "hyperglycemia_possible_dka_v1",
  "DKA intent should carry the installed workup mapping instead of rendering a separate installed-workup result"
);

const unsupported = resolveClinicalIntents("purple fingernails after eating mango while juggling");
assert.equal(unsupported.unsupported, true, "unsupported free text should not authorize recommendations");
assert.equal(unsupported.validatedMatches.length, 0, "unsupported free text should have no validated match");
assert.equal(unsupported.validatedMatchCount, 0, "unsupported resolver result should expose zero validated matches");
assert.equal(unsupported.requiresSelection, false, "unsupported resolver result should not enable validated-intent selection");
assert.equal(unsupported.ambiguous, false, "unsupported resolver result should not masquerade as ambiguous");
assert.equal(unsupported.singleValidatedMatch, null, "unsupported resolver result should not expose a single validated match");
assert.equal(unsupported.topValidatedMatch, null, "unsupported resolver result should not expose a top validated match");
assert.equal(unsupported.selectionStatus, "unsupported_gap", "unsupported resolver status should be explicit");
assert.match(unsupported.selectionReason, /recommendations are blocked/i, "unsupported resolver reason should explain the block");

const unvalidatedIntentsForGate = ["draft", "partial", "unsupported"].map((status) => ({
  ...clinicalIntentRegistry[0],
  intent_id: `${status}_dka_like_gap_v1`,
  label: `${status} DKA-like gap`,
  status,
  aliases: [`${status} dka-like gap`],
  evidence_tags: [`${status}_semantic_tag`],
  clinical_bundle_ids: [`${status}_bundle`],
  required_domains: [`${status} source pending domain`],
  source_ids: [],
  gold_case_ids: []
}));
unvalidatedIntentsForGate.forEach((intentRow) => {
  const resolvedUnvalidated = resolveClinicalIntents(intentRow.aliases[0], [intentRow]);
  assert.equal(resolvedUnvalidated.matches.length, 1, `${intentRow.status} intents may remain searchable for review`);
  assert.equal(resolvedUnvalidated.validatedMatches.length, 0, `${intentRow.status} intents must not become validated matches`);
  assert.equal(resolvedUnvalidated.requiresSelection, false, `${intentRow.status} intents must not enable selection`);
  assert.equal(resolvedUnvalidated.unsupported, true, `${intentRow.status} intents must resolve as unsupported for recommendations`);
  assert.equal(
    selectedValidatedClinicalIntents([intentRow.intent_id], [intentRow]).length,
    0,
    `${intentRow.status} intents must not be selectable as authorized clinical intents`
  );
  const unvalidatedContext = buildClinicalIntentRetrievalContext([intentRow], "vomiting", "General medicine", "Adult");
  assert.doesNotMatch(unvalidatedContext, new RegExp(intentRow.intent_id), `${intentRow.status} intent id must not enter retrieval context`);
  assert.doesNotMatch(unvalidatedContext, new RegExp(intentRow.evidence_tags[0]), `${intentRow.status} evidence tags must not enter retrieval context`);
  const unvalidatedPromptBlock = buildValidatedClinicalIntentPromptBlock([intentRow], "vomiting", []);
  assert.doesNotMatch(unvalidatedPromptBlock, new RegExp(intentRow.intent_id), `${intentRow.status} intent id must not enter the OpenEvidence authorized-intent block`);
  assert.match(
    unvalidatedPromptBlock,
    /No manually validated clinical intent was selected/,
    `${intentRow.status} prompt should explicitly block recommendation authority`
  );
  const unvalidatedCatalog = filterEvidenceCatalogForClinicalIntents([
    { exam_id: "TEST-UNVALIDATED", examLabel: "Unvalidated matching exam", tags: [intentRow.evidence_tags[0]] }
  ], [intentRow]);
  assert.equal(unvalidatedCatalog.length, 0, `${intentRow.status} intent tags must not authorize evidence catalog rows`);
});

const sanitizedUnsupportedGapText = sanitizeUnsupportedClinicalIntentGapText(
  "Patient name: John Smith MRN 12345 DOB 1/2/1990 room 412B phone 555-222-3333 has purple fingernails after eating mango"
);
const contextualNameGapText = sanitizeUnsupportedClinicalIntentGapText(
  "purple fingernails for Alice Nguyen after eating mango"
);
assert.match(sanitizedUnsupportedGapText, /\[name\]/, "unsupported gap sanitizer should redact labeled names");
assert.match(contextualNameGapText, /for \[name\]/, "unsupported gap sanitizer should redact contextual names after for/about/regarding");
assert.match(sanitizedUnsupportedGapText, /\[identifier\]/, "unsupported gap sanitizer should redact identifiers");
assert.match(sanitizedUnsupportedGapText, /\[date\]/, "unsupported gap sanitizer should redact dates");
assert.match(sanitizedUnsupportedGapText, /\[location\]/, "unsupported gap sanitizer should redact room/bed locations");
assert.match(sanitizedUnsupportedGapText, /\[phone\]/, "unsupported gap sanitizer should redact phone numbers");
assert.match(sanitizedUnsupportedGapText, /purple fingernails after eating mango/i, "unsupported gap sanitizer should preserve clinical concern terms");
assert.doesNotMatch(sanitizedUnsupportedGapText, /John Smith|12345|1\/2\/1990|412B|555-222-3333/i, "unsupported gap sanitizer should not preserve obvious PHI");
assert.doesNotMatch(contextualNameGapText, /Alice Nguyen/i, "unsupported gap sanitizer should not preserve contextual names");

const stagedUnsupportedGap = buildUnsupportedClinicalIntentGap({
  query: "Name: Jane Doe MRN 999 purple fingernails after eating mango",
  modifiers: "DOB 4/5/1980 phone 555-111-2222 severe itching",
  setting: "General medicine",
  population: "Adult",
  reviewer: "reviewer_a",
  now: new Date("2026-06-07T12:00:00Z")
});
assert.equal(stagedUnsupportedGap.schema_version, "clinical-intent-gap-v1", "unsupported gaps should be schema-tagged");
assert.equal(stagedUnsupportedGap.gap_status, "staged_gap", "unsupported gaps should remain staged");
assert.equal(stagedUnsupportedGap.gap_type, "unsupported_clinical_intent", "unsupported gaps should be typed");
assert.equal(stagedUnsupportedGap.review_owner, "reviewer_a", "unsupported gaps should preserve reviewer metadata");
assert.match(stagedUnsupportedGap.activation_rule, /cannot authorize recommendations/i, "unsupported gaps should not authorize recommendations");
assert.doesNotMatch(JSON.stringify(stagedUnsupportedGap), /Jane Doe|999|4\/5\/1980|555-111-2222/i, "unsupported gap artifacts should be PHI-free");
assert.match(JSON.stringify(stagedUnsupportedGap), /purple fingernails|severe itching/i, "unsupported gap artifacts should preserve non-identifying clinical terms");

const ambiguous = resolveClinicalIntents("chest pain with dyspnea and unilateral leg swelling");
assert.ok(ambiguous.validatedMatches.length >= 2, "ambiguous cardiopulmonary text should require picking from multiple intents");
assert.equal(ambiguous.requiresSelection, true, "resolver should not auto-authorize ambiguous text");
assert.equal(ambiguous.ambiguous, true, "resolver should explicitly label multiple cardiopulmonary matches as ambiguous");
assert.equal(ambiguous.selectionStatus, "ambiguous_validated_intent", "ambiguous resolver status should be explicit");
assert.equal(ambiguous.singleValidatedMatch, null, "ambiguous resolver result should not expose a single validated match");
assert.ok(ambiguous.topValidatedMatch?.intent_id, "ambiguous resolver result should still expose a top match for display/audit only");
assert.match(ambiguous.selectionReason, /Multiple validated clinical intents matched/i, "ambiguous resolver reason should explain that a user choice is required");

const selected = selectedValidatedClinicalIntents(["dka_hhs_v1", "missing_intent"]);
assert.equal(selected.length, 1);
assert.equal(selected[0].intent_id, "dka_hhs_v1");

const context = buildClinicalIntentRetrievalContext(
  [getClinicalIntentById("dka_hhs_v1")],
  "vomiting, tachypnea, dehydration",
  "Endocrinology consult",
  "Adult"
);
assert.match(context, /intent_id: dka_hhs_v1/);
assert.doesNotMatch(context, /suppress rules:/, "retrieval context should not treat suppress-rule override tags as patient context");
assert.match(context, /patient modifiers: vomiting/);

const promptBlock = buildValidatedClinicalIntentPromptBlock(selected, "vomiting", []);
assert.match(promptBlock, /<validated_clinical_intents>/);
assert.match(promptBlock, /dka_hhs_v1/);
assert.match(promptBlock, /intent type: diagnosis/, "OpenEvidence prompt block should expose validated-intent type");
assert.match(promptBlock, /complaint module: hyperglycemia_possible_dka_v1/, "OpenEvidence prompt block should expose mapped installed module");
assert.match(promptBlock, /clinical bundles: dka_hhs/, "OpenEvidence prompt block should expose clinical bundle IDs");
assert.match(promptBlock, /gold cases: dka_hhs; hyperglycemia_possible_dka/, "OpenEvidence prompt block should expose gold-case traceability");
assert.match(promptBlock, /last reviewed: 2026-06-06/, "OpenEvidence prompt block should expose last-reviewed date");
assert.match(promptBlock, /review owner: clinical_content_lead/, "OpenEvidence prompt block should expose review owner");
assert.match(promptBlock, /suppress rules:/, "OpenEvidence prompt block should expose selected-intent suppress rules");
assert.match(promptBlock, /<patient_modifiers>/);
assert.doesNotMatch(promptBlock, /John Smith|DOB|MRN/i);

const baseRows = parseCsv(readFileSync("data/evidence/exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("data/evidence/exam_evidence_overlay.csv", "utf8"));
const legacyRows = parseCsv(readFileSync("data/physical-exam/physical_exam_evidence_overlay.csv", "utf8"));
const acceptedCatalogAdditionRows = parseCsv(readFileSync("data/evidence/accepted_exam_catalog_additions.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("data/evidence/source_registry.csv", "utf8"));
const tagRows = parseCsv(readFileSync("data/evidence/retrieval_tag_dictionary.csv", "utf8"));
const catalog = joinEvidenceCatalog(baseRows, mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyRows), sourceRows, acceptedCatalogAdditionRows);
const dkaCatalog = filterEvidenceCatalogForClinicalIntents(catalog, selected);
assert.ok(dkaCatalog.some((candidate) => /blood pressure/i.test(candidate.examLabel || "")), "DKA intent should allow vital signs");
assert.ok(dkaCatalog.some((candidate) => /abdominal palpation/i.test(candidate.examLabel || "")), "DKA intent should allow abdominal exam");
assert.equal(
  dkaCatalog.filter((candidate) => /visual acuity/i.test(candidate.examLabel || "")).length,
  0,
  "DKA intent filter should not allow unrelated visual acuity rows"
);

const dkaRanked = rankEvidenceCandidates(dkaCatalog, context, tagRows, {
  maxCandidates: 80,
  specialty: "Endocrinology consult"
});
const dkaRecommendation = buildRecommendedExamChecklist(context, dkaRanked, {
  specialty: "Endocrinology consult",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: selected
});
const dkaRecommendedText = [
  ...dkaRecommendation.coreItems,
  ...dkaRecommendation.conditionalItems
].map((entry) => entry.label).join(" | ");
assert.doesNotMatch(
  dkaRecommendedText,
  /PMI|Vibration sense|Visual acuity|Ophthalmoscopic|Pronator drift/i,
  "DKA intent avoid labels should suppress unrelated cardiac, neuro, and eye maneuvers without explicit modifiers"
);
const pronatorCandidate = catalog.find((candidate) => /pronator drift/i.test(candidate.examLabel || ""));
assert.ok(pronatorCandidate, "test catalog should include pronator drift for avoid-label suppression regression");
const dkaAvoidRegression = buildRecommendedExamChecklist(context, {
  candidates: [{
    ...pronatorCandidate,
    score: 95,
    scoreBreakdown: { clinicalRelevance: 80, actionability: 80, diagnosticValue: 80, bedsideFeasibility: 80 },
    matchedTags: ["diagnostic_safety"]
  }],
  matchedTags: []
}, {
  specialty: "Endocrinology consult",
  validatedIntents: selected
});
assert.ok(
  (dkaAvoidRegression.suppressedItems || []).some((entry) => /Pronator drift/i.test(entry.label || "")),
  "DKA intent should suppress unrelated pronator drift before it can become a recommendation"
);
assert.equal(
  [...dkaAvoidRegression.coreItems, ...dkaAvoidRegression.conditionalItems].filter((entry) => /Pronator drift/i.test(entry.label || "")).length,
  0,
  "DKA intent should not recommend pronator drift without focal-neuro modifiers"
);
const syntheticAvoidRecommendation = buildRecommendedExamChecklist(context, {
  candidates: [{
    exam_id: "TEST-synthetic-avoid",
    examLabel: "Synthetic avoided maneuver",
    maneuver: "Synthetic avoided maneuver",
    examOptions: "Absent / Present / Unable",
    condition_or_syndrome: "Synthetic",
    diagnostic_target: "Synthetic avoid-label regression target",
    result_changes_management: "Would change nothing; this candidate exists only to test selected-intent avoid suppression.",
    evidence_source_primary: "AHRQ_CALIBRATE_DX",
    source_citation: "AHRQ diagnostic safety tooling",
    LR_plus: "n/a",
    LR_minus: "n/a",
    evidence_tier: "C",
    difficulty: "easy",
    time_burden_minutes: "1",
    equipment_needed: "none",
    patient_cooperation_required: "low",
    limitations: "Synthetic regression candidate.",
    retrieval_tags: "diagnostic_safety",
    matchedTags: ["diagnostic_safety"],
    score: 95,
    scoreBreakdown: { clinicalRelevance: 80, actionability: 80, diagnosticValue: 80, bedsideFeasibility: 80 }
  }],
  matchedTags: []
}, {
  specialty: "Endocrinology consult",
  validatedIntents: [{ ...selected[0], intent_id: "synthetic_avoid_intent_v1", avoid_labels: ["Synthetic avoided maneuver"] }]
});
assert.ok(
  (syntheticAvoidRecommendation.suppressedItems || []).some((entry) => /Synthetic avoided maneuver/i.test(entry.label || "") && /suppress rule/.test(entry.reason || "")),
  "selected intent suppress rules should suppress matching candidates even when no older suppressor applies"
);

const dkaFocalContext = buildClinicalIntentRetrievalContext(
  [getClinicalIntentById("dka_hhs_v1")],
  "vomiting, tachypnea, dehydration, focal weakness and face droop",
  "Endocrinology consult",
  "Adult"
);
const dkaFocalRanked = rankEvidenceCandidates(dkaCatalog, dkaFocalContext, tagRows, {
  maxCandidates: 80,
  specialty: "Endocrinology consult"
});
const dkaFocalRecommendation = buildRecommendedExamChecklist(dkaFocalContext, dkaFocalRanked, {
  specialty: "Endocrinology consult",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: selected
});
assert.match(
  dkaFocalRecommendation.conditionalItems.map((entry) => entry.label).join(" | "),
  /Test pronator drift|Inspect facial symmetry|Test pupillary light response/i,
  "explicit focal-neuro modifiers should override DKA avoid labels only as conditional safety add-ons"
);

const abdominalIntent = selectedValidatedClinicalIntents(["abdominal_pain_cramping_v1"]);
const abdominalContext = buildClinicalIntentRetrievalContext(
  abdominalIntent,
  "",
  "General medicine",
  "Adult"
);
const abdominalCatalog = filterEvidenceCatalogForClinicalIntents(catalog, abdominalIntent);
const abdominalRanked = rankEvidenceCandidates(abdominalCatalog, abdominalContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const abdominalRecommendation = buildRecommendedExamChecklist(abdominalContext, abdominalRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: abdominalIntent
});
assert.deepEqual(
  abdominalRecommendation.activeProfiles.map((profile) => profile.id),
  ["abdominal_gi"],
  "validated abdominal intent should activate only its declared clinical bundle"
);
const abdominalCoreText = abdominalRecommendation.coreItems
  .map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`)
  .join(" | ");
assert.match(abdominalCoreText, /abdominal palpation|abdominal inspection|bowel sounds/i);
assert.doesNotMatch(abdominalCoreText, /Inspect oral mucosa|Mouth exam/i, "abdominal cramps should not promote volume/renal mouth exam to core without dehydration modifier");
assert.doesNotMatch(abdominalCoreText, /sepsis physiology/i, "abdominal cramps should not inherit sepsis rationale without a sepsis intent");
const abdominalConditionalText = abdominalRecommendation.conditionalItems
  .map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`)
  .join(" | ");
assert.doesNotMatch(abdominalConditionalText, /Lower extremity edema|Otoscope|nodes|fremitus|JVP/i, "abdominal cramps should not show broad tag-only add-ons");

const abdominalDehydrationContext = buildClinicalIntentRetrievalContext(
  abdominalIntent,
  "vomiting, poor intake or dehydration",
  "General medicine",
  "Adult"
);
const abdominalDehydrationRanked = rankEvidenceCandidates(abdominalCatalog, abdominalDehydrationContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const abdominalDehydrationRecommendation = buildRecommendedExamChecklist(abdominalDehydrationContext, abdominalDehydrationRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: abdominalIntent
});
assert.match(
  abdominalDehydrationRecommendation.conditionalItems.map((entry) => entry.label).join(" | "),
  /Inspect oral mucosa/i,
  "dehydration/vomiting modifier should activate hydration add-ons for abdominal pain"
);

const heartFailureIntent = selectedValidatedClinicalIntents(["dyspnea_hf_v1"]);
const heartFailureContext = buildClinicalIntentRetrievalContext(
  heartFailureIntent,
  "",
  "General medicine",
  "Adult"
);
const heartFailureCatalog = filterEvidenceCatalogForClinicalIntents(catalog, heartFailureIntent);
const heartFailureRanked = rankEvidenceCandidates(heartFailureCatalog, heartFailureContext, tagRows, {
  maxCandidates: 80,
  specialty: "General medicine"
});
const heartFailureRecommendation = buildRecommendedExamChecklist(heartFailureContext, heartFailureRanked, {
  specialty: "General medicine",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: heartFailureIntent
});
assert.deepEqual(
  heartFailureRecommendation.activeProfiles.map((profile) => profile.id),
  ["dyspnea_hf"],
  "validated dyspnea/HF intent should activate only its declared bundle"
);
const heartFailureCoreLabels = heartFailureRecommendation.coreItems.map((entry) => entry.label).join(" | ");
const heartFailureSafetyLabels = heartFailureRecommendation.basicSafetyChecks.map((entry) => entry.label).join(" | ");
assert.match(heartFailureSafetyLabels, /Respiratory rate|Blood pressure|Heart rate/i);
assert.doesNotMatch(heartFailureCoreLabels, /Respiratory rate|Blood pressure|Heart rate/i, "legacy coreItems alias should remain physical-exam only");
assert.match(heartFailureCoreLabels, /Auscultate posterior lung fields|Auscultate lateral lung fields|Auscultate anterior lung fields|Inspect posterior thorax|Observe work of breathing/i);
assert.match(heartFailureCoreLabels, /Inspect jugular venous pressure|Inspect and press lower extremity edema|Auscultate heart sounds|Palpate radial pulses/i);
const heartSoundsEntry = heartFailureRecommendation.coreItems.find((entry) => /Heart sounds/i.test(entry.label));
assert.ok(heartSoundsEntry, "HF/dyspnea should include heart sounds when volume/cardiac bundle is selected");
assert.doesNotMatch(heartSoundsEntry.displayDiagnosticTarget || "", /focal consolidation|effusion|wheeze/i, "heart sounds should not inherit pulmonary diagnostic target");
assert.doesNotMatch(
  heartFailureRecommendation.conditionalItems.map((entry) => entry.label).join(" | "),
  /Aortic area|Pulmonic area|Tricuspid area|Mitral area/i,
  "HF/dyspnea should not show individual valve-area cards unless murmur/valve modifier is present"
);

const routineThyroidIntent = selectedValidatedClinicalIntents(["routine_thyroid_disease_v1"]);
const routineThyroidContext = buildClinicalIntentRetrievalContext(
  routineThyroidIntent,
  "Graves disease palpitations heat intolerance eye irritation",
  "Endocrinology consult",
  "Adult"
);
const routineThyroidCatalog = filterEvidenceCatalogForClinicalIntents(catalog, routineThyroidIntent);
const routineThyroidRanked = rankEvidenceCandidates(routineThyroidCatalog, routineThyroidContext, tagRows, {
  maxCandidates: 80,
  specialty: "Endocrinology consult"
});
const routineThyroidRecommendation = buildRecommendedExamChecklist(routineThyroidContext, routineThyroidRanked, {
  specialty: "Endocrinology consult",
  maxCoreItems: 24,
  maxConditionalItems: 36,
  validatedIntents: routineThyroidIntent
});
assert.deepEqual(
  routineThyroidRecommendation.activeProfiles.map((profile) => profile.id),
  ["routine_thyroid"],
  "routine thyroid intent should activate the routine thyroid bundle, not the thyroid-crisis bundle"
);
const routineThyroidCoreText = routineThyroidRecommendation.coreItems.map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`).join(" | ");
const routineThyroidSafetyText = routineThyroidRecommendation.basicSafetyChecks.map((entry) => `${entry.label} ${entry.domain} ${entry.reason}`).join(" | ");
assert.match(routineThyroidSafetyText, /Blood pressure|Heart rate/i, "routine thyroid should include HR/BP vitals as basic safety data");
assert.doesNotMatch(routineThyroidCoreText, /Blood pressure|Heart rate/i, "routine thyroid physical-exam alias should not contain vital signs");
assert.match(routineThyroidCoreText, /Inspect and palpate thyroid|Thyroid exam/i, "routine thyroid should include thyroid inspection/palpation");
assert.match(routineThyroidCoreText, /Auscultate heart sounds|Palpate radial pulses/i, "Graves with palpitations should include rhythm/perfusion exam");
assert.doesNotMatch(routineThyroidCoreText, /Inspect jugular venous pressure|JVP|Palpate point of maximal impulse|PMI|Test vibration sense|Vibration sense|Percuss costovertebral angle tenderness|CVA tenderness/i, "routine Graves should not promote unrelated volume, neuro, or GU maneuvers");
const routineThyroidConditionalText = routineThyroidRecommendation.conditionalItems.map((entry) => entry.label).join(" | ");
assert.match(routineThyroidConditionalText, /Test pupillary light response|Test extraocular movements|Test visual acuity|Test visual fields/i, "Graves with eye symptoms should include orbitopathy/vision add-ons");

console.log("Clinical intent tests passed.");
