import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildMedicalKnowledgeDatabase,
  loadMedicalKnowledgeDatabase,
  validateMedicalKnowledgeDatabase
} from "./build-medical-knowledge-db.js";
import {
  complaintModules,
  complaintSourceRegistry,
  medicalKnowledgeDbManifest
} from "../medical-knowledge-db.js";

const database = loadMedicalKnowledgeDatabase();
const validation = validateMedicalKnowledgeDatabase(database);
assert.ok(validation.ok, validation.issues.join("\n"));
assert.equal(validation.moduleCount, complaintModules.length, "module count should match source database");
assert.equal(validation.sourceCount, complaintSourceRegistry.length, "source count should match source database");
assert.equal(medicalKnowledgeDbManifest.schema_version, "medical_knowledge_database_v1");

function readComplaintModuleSourceFiles(dir = "medical-knowledge/complaint-modules") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return readComplaintModuleSourceFiles(fullPath);
    }
    if (!entry.name.endsWith(".json")) {
      return [];
    }
    const raw = JSON.parse(readFileSync(fullPath, "utf8"));
    return [{ file: fullPath, module: raw.module || raw }];
  });
}

readComplaintModuleSourceFiles().forEach(({ file, module }) => {
  assert.ok((module.decisionTrees || []).length >= 3, `${file} should include source decision-tree support rows`);
  assert.ok((module.treatmentOptions || []).length >= 3, `${file} should include source treatment-option support rows`);
});

const medicalKnowledgeSchema = JSON.parse(readFileSync("medical-knowledge/schema/medical-knowledge-database-v1.schema.json", "utf8"));
const moduleItemSchema = medicalKnowledgeSchema.$defs.moduleItem;
assert.ok(Array.isArray(moduleItemSchema.allOf), "module item schema should include item-type-specific requirements");

const stalePhysicalExamLabelPattern = /\b(?:Check capillary refill|Check skin turgor|Check distal extremity warmth|Check neck stiffness|Assess Kussmaul breathing|Assess extremity temperature|Assess skin turgor)\b/i;
const vaguePhysicalExamLabelPattern = /^(?:Check|Assess|Evaluate|Screen|Review|Document|Perform)\b/i;
const weakSafetyCheckLabelPattern = /^(?:Assess|Check|Evaluate)\b|^(?:Mental status|General appearance)$/i;

function requiredFieldsForSchemaItemType(itemType) {
  return moduleItemSchema.allOf
    .find((rule) => rule.if?.properties?.item_type?.const === itemType)
    ?.then?.required || [];
}
[
  ["history_question", ["text", "options", "when_to_ask", "diagnostic_purpose", "management_implication", "likelihood_ratio_note", "tags"]],
  ["physical_exam_maneuver", ["technique", "findings_options", "when_to_perform", "diagnostic_target", "LR_plus", "LR_minus", "likelihood_ratio_note", "management_change", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "tags"]],
  ["safety_check", ["action", "rationale", "management_change", "difficulty", "time_burden_minutes", "equipment_needed", "patient_cooperation_required", "limitations", "likelihood_ratio_note", "tags"]],
  ["red_flag", ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]],
  ["diagnostic_test", ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]],
  ["management_change", ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]],
  ["diagnostic_frame", ["action", "rationale", "diagnostic_target", "management_change", "LR_plus", "LR_minus", "likelihood_ratio_note", "limitations", "tags"]]
].forEach(([itemType, expectedFields]) => {
  expectedFields.forEach((field) => {
    assert.ok(
      requiredFieldsForSchemaItemType(itemType).includes(field),
      `module item schema should require ${field} for ${itemType}`
    );
  });
});
assert.ok(moduleItemSchema.properties.LR_plus.pattern, "module item schema should constrain LR+ values");
assert.ok(moduleItemSchema.properties.LR_minus.pattern, "module item schema should constrain LR- values");
assert.deepEqual(moduleItemSchema.properties.difficulty.enum, ["easy", "moderate", "hard", "difficult"], "module item schema should constrain difficulty metadata");
assert.deepEqual(moduleItemSchema.properties.patient_cooperation_required.enum, ["low", "moderate", "high", "n/a"], "module item schema should constrain patient cooperation metadata");
assert.ok(moduleItemSchema.properties.findings_options.minItems >= 1, "exam findings_options should not be empty");
assert.ok(moduleItemSchema.properties.tags.minItems >= 1, "module item tags should not be empty");
assert.ok(moduleItemSchema.properties.likelihood_ratio_note, "module item schema should allow explicit LR interpretation notes");
assert.equal(moduleItemSchema.properties.likelihood_ratio_note.minLength, 1, "module item schema should reject empty LR interpretation notes");

complaintModules.forEach((module) => {
  ["requiredQuestions", "conditionalQuestions"].forEach((group) => {
    (module[group] || []).forEach((item) => {
      assert.ok(item.likelihood_ratio_note, `${module.id}.${group}.${item.id} source history question should include LR interpretation note`);
      assert.match(
        item.likelihood_ratio_note,
        /Question-level LR\+\/LR-|not available|not applicable|Quantitative likelihood-ratio/i,
        `${module.id}.${group}.${item.id} should explain history-question LR availability`
      );
    });
  });
  ["requiredExam", "conditionalExam"].forEach((group) => {
    (module[group] || []).forEach((item) => {
      const sourceText = [
        item.label,
        item.limitations,
        item.diagnostic_target,
        item.management_change,
        ...(item.tags || [])
      ].filter(Boolean).join(" ");
      assert.doesNotMatch(
        sourceText,
        stalePhysicalExamLabelPattern,
        `${module.id}.${group}.${item.id} should store current action-specific maneuver wording at the source-data layer`
      );
      assert.doesNotMatch(
        String(item.label || ""),
        vaguePhysicalExamLabelPattern,
        `${module.id}.${group}.${item.id} physical exam source label should name the maneuver action, not a vague task verb`
      );
      assert.ok(item.likelihood_ratio_note, `${module.id}.${group}.${item.id} source exam should include LR interpretation note`);
      if (/^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_plus || "")) && /^n\/?a$|^unavailable$|^not available$/i.test(String(item.LR_minus || ""))) {
        assert.match(
          item.likelihood_ratio_note,
          /No maneuver-specific LR\+\/LR- is available|not applicable|not available/i,
          `${module.id}.${group}.${item.id} should explicitly explain unavailable exam LR metadata`
        );
      }
    });
  });
  (module.safetyChecks || []).forEach((item) => {
    assert.doesNotMatch(
      String(item.label || ""),
      weakSafetyCheckLabelPattern,
      `${module.id}.${item.id} source safety-check label should name a specific bedside action`
    );
    [
      "action",
      "rationale",
      "management_change",
      "difficulty",
      "time_burden_minutes",
      "equipment_needed",
      "patient_cooperation_required",
      "limitations",
      "likelihood_ratio_note",
      "tags"
    ].forEach((field) => {
      const value = item[field];
      assert.ok(value && (!Array.isArray(value) || value.length), `${module.id}.${item.id} source safety check should include ${field}`);
    });
  });
  assert.ok((module.decisionTrees || []).length >= 3, `${module.id} should include decision-tree support rows`);
  assert.ok((module.treatmentOptions || []).length >= 3, `${module.id} should include treatment-option support rows`);
  ["redFlags", "initialTests", "dispositionRules", "decisionTrees", "treatmentOptions", "differentialBuckets"].forEach((group) => {
    (module[group] || []).forEach((item) => {
      [
        "action",
        "rationale",
        "diagnostic_target",
        "management_change",
        "LR_plus",
        "LR_minus",
        "likelihood_ratio_note",
        "limitations",
        "tags"
      ].forEach((field) => {
        const value = item[field];
        assert.ok(value && (!Array.isArray(value) || value.length), `${module.id}.${group}.${item.id} source decision item should include ${field}`);
      });
    });
  });
});

const moduleIds = new Set(complaintModules.map((module) => module.id));
assert.ok(moduleIds.has("chest_pain_v1"), "database should include chest pain module");
assert.ok(moduleIds.has("hyperglycemia_possible_dka_v1"), "database should include DKA/HHS module");
const structuredApplicabilityModules = new Set([
  "amenorrhea_v1",
  "erectile_dysfunction_v1",
  "gestational_diabetes_v1",
  "gynecomastia_v1",
  "hirsutism_v1",
  "hypogonadism_v1",
  "infertility_v1",
  "menopause_premature_ovarian_insufficiency_v1",
  "polycystic_ovary_syndrome_v1"
]);
structuredApplicabilityModules.forEach((moduleId) => {
  const module = complaintModules.find((row) => row.id === moduleId);
  assert.ok(module?.applicability?.sex_or_reproductive_context, `${moduleId}: should declare sex/reproductive applicability context`);
  assert.ok(module?.applicability?.use_when?.length, `${moduleId}: should declare when to use the module`);
  assert.ok(module?.applicability?.do_not_use_when?.length, `${moduleId}: should declare when not to use the module`);
  assert.ok(module?.applicability?.review_owner, `${moduleId}: should declare applicability review owner`);
});
assert.equal(
  complaintModules.find((module) => module.id === "gestational_diabetes_v1")?.applicability?.pregnancy_status_required,
  "pregnant",
  "gestational diabetes should explicitly require active pregnancy context"
);

const dkaSource = complaintSourceRegistry.find((source) => source.id === "ADA_HYPERGLYCEMIC_CRISES_2024");
assert.ok(dkaSource?.url?.startsWith("https://"), "DKA source should retain URL provenance");
const atsCapSource = complaintSourceRegistry.find((source) => source.id === "ATS_CAP_2025");
assert.ok(atsCapSource, "medical knowledge source registry should include the ATS adult CAP guideline");
assert.equal(
  atsCapSource.url,
  "https://academic.oup.com/ajrccm/article/212/1/24/8435770",
  "ATS_CAP_2025 should retain the canonical article URL"
);
assert.equal(
  atsCapSource.version,
  "2026",
  "ATS_CAP_2025 stable source id should carry the publication-year version shown in its citation"
);
assert.match(
  atsCapSource.citation,
  /Am J Respir Crit Care Med\. 2026;212\(1\):24-44/i,
  "ATS_CAP_2025 citation should distinguish the 2026 ATS guideline from the older ATS/IDSA 2019 guideline"
);
const sourceAuditDate = "2026-06-11";
const allowedSourceCurrencyStatuses = new Set([
  "reviewed_current_for_scope",
  "reviewed_legacy_active",
  "review_due",
  "retired"
]);
complaintSourceRegistry.forEach((source) => {
  assert.match(source.date_accessed || "", /^\d{4}-\d{2}-\d{2}$/, `${source.id}: source access date should use YYYY-MM-DD`);
  assert.match(source.last_reviewed || "", /^\d{4}-\d{2}-\d{2}$/, `${source.id}: source last_reviewed should use YYYY-MM-DD`);
  assert.match(source.next_review_due || "", /^\d{4}-\d{2}-\d{2}$/, `${source.id}: source next_review_due should use YYYY-MM-DD`);
  assert.ok(source.review_owner, `${source.id}: source should include review_owner`);
  assert.ok(source.reviewed_by_role, `${source.id}: source should include reviewed_by_role`);
  assert.ok(allowedSourceCurrencyStatuses.has(source.currency_status), `${source.id}: source should include recognized currency_status`);
  assert.ok(
    source.date_accessed <= sourceAuditDate,
    `${source.id}: source access date ${source.date_accessed} should not be later than audit date ${sourceAuditDate}`
  );
  assert.ok(
    source.last_reviewed >= source.date_accessed,
    `${source.id}: source last_reviewed ${source.last_reviewed} should be on or after access date ${source.date_accessed}`
  );
  assert.ok(
    source.next_review_due > source.last_reviewed,
    `${source.id}: source next_review_due ${source.next_review_due} should be later than last_reviewed ${source.last_reviewed}`
  );
  const sourceYear = String(source.id || "").match(/(?:^|_)(20\d{2})(?:_|$)/)?.[1];
  if (sourceYear) {
    assert.ok(
      Number(sourceYear) <= Number(String(source.date_accessed || "").slice(0, 4)),
      `${source.id}: source ID claims ${sourceYear} but source was accessed on ${source.date_accessed}`
    );
  }
  const versionYear = String(source.version || "").match(/20\d{2}/)?.[0];
  const publicationYear = Number(versionYear || sourceYear || 0);
  if (publicationYear && publicationYear < 2021) {
    assert.equal(
      source.currency_status,
      "reviewed_legacy_active",
      `${source.id}: legacy sources should be explicitly marked reviewed_legacy_active`
    );
  }
});
const sepsisSource = complaintSourceRegistry.find((source) => source.id === "SSC_SEPSIS_2026");
assert.ok(sepsisSource, "medical knowledge source registry should include the manually verified 2026 Surviving Sepsis Campaign adult guideline");
assert.equal(
  sepsisSource.url,
  "https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources/surviving-sepsis-campaign-adult-guidelines",
  "SSC_SEPSIS_2026 should retain the canonical SCCM guideline page"
);
assert.match(
  sepsisSource.citation,
  /Sepsis and Septic Shock 2026/i,
  "SSC_SEPSIS_2026 citation should preserve the verified 2026 guideline year"
);
assert.ok(
  complaintSourceRegistry.some((source) => source.id === "IDSA_CAP_PATHWAY_2019"),
  "IDSA CAP pathway should remain a separately traceable 2019 source"
);

assert.doesNotThrow(() => buildMedicalKnowledgeDatabase({ check: true }), "generated medical-knowledge-db.js should be current");

const complaintCdsSource = readFileSync("complaint-cds.js", "utf8");
assert.ok(/from\s+["']\.\/medical-knowledge-db\.js["']/.test(complaintCdsSource), "complaint CDS logic should import generated medical knowledge");
assert.ok(!complaintCdsSource.includes("ADA_HYPERGLYCEMIC_CRISES_2024"), "medical content should not live in complaint-cds.js");

const sourceReference = {
  source_id: "ADA_HYPERGLYCEMIC_CRISES_2024",
  source_section: "Synthetic generated endocrine workup regression",
  evidence_strength: "guideline/consensus",
  version_date: "2024",
  last_reviewed: "2026-06-07",
  clinical_owner: "test",
  implementation_notes: "Generated from guideline-backed endocrine workup automation"
};
const badBuildValidation = validateMedicalKnowledgeDatabase({
  manifest: {
    schema_version: "medical_knowledge_database_v1",
    database_id: "synthetic",
    title: "Synthetic",
    version: "0"
  },
  sourceRegistry: {
    schema_version: "medical_knowledge_database_v1",
    sources: [
      {
        id: "ADA_HYPERGLYCEMIC_CRISES_2024",
        title: "Synthetic source",
        source: "Synthetic",
        version: "2024",
        url: "https://example.org",
        date_accessed: "2026-06-07",
        citation: "Synthetic"
      }
    ]
  },
  complaintModules: [
    {
      id: "synthetic_bad_workup_v1",
      schema_version: "complaint-cds-artifact-v1",
      label: "Synthetic bad workup",
      version: "0",
      status: "draft",
      triggers: ["synthetic"],
      requiredQuestions: [
        {
          id: "bad_question",
          label: "When did symptoms start?",
          item_type: "history_question",
          text: "When did symptoms start?",
          options: ["Unknown", "Acute", "Subacute"],
          when_to_ask: "Always",
          diagnostic_purpose: "Clarifies timing.",
          management_implication: "Changes urgency.",
          tags: ["timing"],
          source: sourceReference
        }
      ],
      requiredExam: [
        {
          id: "synthetic_vitals_exam",
          label: "Measure blood pressure",
          item_type: "physical_exam_maneuver",
          technique: "Use cuff.",
          findings_options: ["High"],
          when_to_perform: "Always",
          diagnostic_target: "BP",
          LR_plus: "n/a",
          LR_minus: "n/a",
          management_change: "Escalate",
          difficulty: "easy",
          time_burden_minutes: 1,
          equipment_needed: "cuff",
          patient_cooperation_required: "low",
          limitations: "Context",
          tags: ["bp"],
          source: sourceReference
        },
        {
          id: "synthetic_bundle_exam",
          label: "Inspect gait, strength, and focal tenderness",
          item_type: "physical_exam_maneuver",
          technique: "Do multiple maneuvers.",
          findings_options: ["Present"],
          when_to_perform: "Always",
          diagnostic_target: "Too broad",
          LR_plus: "likely high",
          LR_minus: "n/a",
          management_change: "Unclear",
          difficulty: "simple",
          time_burden_minutes: "about one minute",
          equipment_needed: "none",
          patient_cooperation_required: "some",
          limitations: "Context",
          tags: ["bundle"],
          source: sourceReference
        },
        {
          id: "synthetic_blank_lr_note_exam",
          label: "CVA tenderness",
          item_type: "physical_exam_maneuver",
          technique: "Percuss each costovertebral angle and compare for pain.",
          findings_options: ["Absent", "Present", "Unable"],
          when_to_perform: "When flank pain, urinary infection, or renal colic is clinically relevant.",
          diagnostic_target: "Renal or upper urinary tract pain localization.",
          LR_plus: "n/a",
          LR_minus: "n/a",
          likelihood_ratio_note: "   ",
          management_change: "CVA tenderness with fever or systemic illness changes pyelonephritis or stone-complication framing.",
          difficulty: "easy",
          time_burden_minutes: 1,
          equipment_needed: "none",
          patient_cooperation_required: "low",
          limitations: "Absence does not exclude renal infection or stone.",
          tags: ["flank_pain", "pyelonephritis"],
          source: sourceReference
        },
        {
          id: "synthetic_vague_exam_label",
          label: "Assess strength",
          item_type: "physical_exam_maneuver",
          technique: "Test shoulder abduction strength against resistance bilaterally.",
          findings_options: ["Normal", "Weak", "Asymmetric", "Unable"],
          when_to_perform: "When focal weakness or myopathy is clinically relevant.",
          diagnostic_target: "Motor weakness localization.",
          LR_plus: "n/a",
          LR_minus: "n/a",
          likelihood_ratio_note: "No maneuver-specific LR+/LR- is available in the local validated source metadata; interpret with context.",
          management_change: "Weakness changes localization and escalation.",
          difficulty: "easy",
          time_burden_minutes: 1,
          equipment_needed: "none",
          patient_cooperation_required: "moderate",
          limitations: "Pain, effort, baseline deficits, and cooperation can limit reliability.",
          tags: ["weakness"],
          source: sourceReference
        }
      ],
      redFlags: [
        { id: "wrong_type_red_flag", label: "Wrong typed red flag", item_type: "history_question", source: sourceReference },
        { id: "sparse_red_flag", label: "Sparse red flag", item_type: "red_flag", source: sourceReference }
      ],
      safetyChecks: [
        { id: "sparse_safety", label: "Measure heart rate", item_type: "safety_check", source: sourceReference }
      ],
      initialTests: [
        { id: "sparse_test", label: "Sparse diagnostic test", item_type: "diagnostic_test", source: sourceReference }
      ],
      dispositionRules: [
        { id: "sparse_management", label: "Sparse management rule", item_type: "management_change", source: sourceReference }
      ],
      differentialBuckets: [
        { id: "sparse_frame", label: "Sparse diagnostic frame", item_type: "diagnostic_frame", source: sourceReference }
      ]
    }
  ]
});
assert.equal(badBuildValidation.ok, false, "build validation should reject bad typed workup source");
assert.match(badBuildValidation.issues.join("\n"), /item_type must be red_flag/, "build validation should enforce item_type by source section");
assert.match(badBuildValidation.issues.join("\n"), /basic bedside data\/safety item belongs in safetyChecks/, "build validation should reject vitals inside exam sections");
assert.match(badBuildValidation.issues.join("\n"), /exam label appears bundled or vague/, "build validation should reject bundled exam labels");
assert.match(badBuildValidation.issues.join("\n"), /exam label must name a concrete maneuver action/, "build validation should reject vague physical exam action verbs");
assert.match(badBuildValidation.issues.join("\n"), /invalid LR_plus/, "build validation should reject invalid LR metadata");
assert.match(badBuildValidation.issues.join("\n"), /invalid time_burden_minutes/, "build validation should reject invalid time burden metadata");
assert.match(badBuildValidation.issues.join("\n"), /invalid difficulty/, "build validation should reject invalid difficulty metadata");
assert.match(badBuildValidation.issues.join("\n"), /invalid patient_cooperation_required/, "build validation should reject invalid cooperation metadata");
assert.match(badBuildValidation.issues.join("\n"), /source provenance uses stale generated-workup wording/, "build validation should reject stale generated-workup provenance in user-visible source metadata");
assert.match(badBuildValidation.issues.join("\n"), /missing source governance field review_owner/, "build validation should reject source registry rows without review owner governance");
assert.match(badBuildValidation.issues.join("\n"), /missing source governance field next_review_due/, "build validation should reject source registry rows without next-review governance");
assert.match(badBuildValidation.issues.join("\n"), /bad_question missing likelihood_ratio_note/, "build validation should reject history questions without LR interpretation notes");
assert.match(badBuildValidation.issues.join("\n"), /synthetic_blank_lr_note_exam missing likelihood_ratio_note/, "build validation should reject whitespace-only LR interpretation notes");
assert.match(badBuildValidation.issues.join("\n"), /sparse_red_flag missing action/, "build validation should reject red flags without action/rationale/tags");
assert.match(badBuildValidation.issues.join("\n"), /sparse_safety missing action/, "build validation should reject safety checks without action/tags");
assert.match(badBuildValidation.issues.join("\n"), /sparse_safety missing rationale/, "build validation should reject safety checks without rationale");
assert.match(badBuildValidation.issues.join("\n"), /sparse_safety missing management_change/, "build validation should reject safety checks without management implication");
assert.match(badBuildValidation.issues.join("\n"), /sparse_safety missing likelihood_ratio_note/, "build validation should reject safety checks without LR interpretation note");
assert.match(badBuildValidation.issues.join("\n"), /sparse_test missing action/, "build validation should reject diagnostic tests without action/rationale/tags");
assert.match(badBuildValidation.issues.join("\n"), /sparse_test missing diagnostic_target/, "build validation should reject diagnostic tests without diagnostic target");
assert.match(badBuildValidation.issues.join("\n"), /sparse_test missing limitations/, "build validation should reject diagnostic tests without limitations");
assert.match(badBuildValidation.issues.join("\n"), /sparse_management missing action/, "build validation should reject management rules without action/rationale/tags");
assert.match(badBuildValidation.issues.join("\n"), /sparse_management missing management_change/, "build validation should reject management rules without explicit management-change metadata");
assert.match(badBuildValidation.issues.join("\n"), /sparse_frame missing diagnostic_target/, "build validation should reject diagnostic frames without diagnostic target");

const missingApplicabilityValidation = validateMedicalKnowledgeDatabase({
  manifest: {
    schema_version: "medical_knowledge_database_v1",
    database_id: "synthetic",
    title: "Synthetic",
    version: "0"
  },
  sourceRegistry: {
    schema_version: "medical_knowledge_database_v1",
    sources: [
      {
        id: "SYNTHETIC_GDM_2026",
        title: "Synthetic source",
        source: "Synthetic",
        version: "2026",
        url: "https://example.org",
        date_accessed: "2026-06-07",
        review_owner: "test_reviewer",
        reviewed_by_role: "clinician_content_reviewer",
        last_reviewed: "2026-06-07",
        next_review_due: "2027-06-07",
        currency_status: "reviewed_current_for_scope",
        citation: "Synthetic"
      }
    ]
  },
  complaintModules: [
    {
      id: "gestational_diabetes_v1",
      schema_version: "complaint-cds-artifact-v1",
      label: "Gestational Diabetes",
      version: "0",
      status: "draft",
      triggers: ["gestational diabetes"]
    }
  ]
});
assert.equal(missingApplicabilityValidation.ok, false, "build validation should reject missing structured applicability");
assert.match(missingApplicabilityValidation.issues.join("\n"), /gestational_diabetes_v1 applicability missing sex_or_reproductive_context/);
assert.match(missingApplicabilityValidation.issues.join("\n"), /gestational_diabetes_v1 applicability must require active pregnancy/);

const genericEndocrineSafetyTestPattern = /Check safety labs that change immediate management when clinically relevant/i;
complaintModules
  .filter((module) => module.id.endsWith("_intent_v1") || module.id.includes("endocrine") || module.endocrine_metadata)
  .forEach((module) => {
    assert.doesNotMatch(
      JSON.stringify(module),
      genericEndocrineSafetyTestPattern,
      `${module.id}: curated workups should use diagnosis-specific testing anchors, not a generic safety-labs sentence`
    );
  });

console.log("Medical knowledge database tests passed.");
