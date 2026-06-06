import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = [
  "checklist.js",
  "clinical-intents.js",
  "complaint-cds.js",
  "census.js",
  "continuity.js",
  "deid.js",
  "deid-worker.js",
  "embedding-recall.js",
  "evidence.js",
  "labs.js",
  "medical-knowledge-db.js",
  "open-evidence-results.js",
  "open-evidence-workflows.js",
  "scripts/deid-fixtures.js",
  "scripts/build-medical-knowledge-db.js",
  "scripts/build-physical-exam-evidence.js",
  "scripts/audit-evidence-checklist.js",
  "scripts/evidence-eval.js",
  "scripts/iterate-clinical-workups.js",
  "scripts/generate-endocrine-workups.js",
  "scripts/install-endocrine-workups.js",
  "scripts/test-endocrine-knowledge.js",
  "scripts/benchmark-embedding-models.js",
  "scripts/test-complaint-cds.js",
  "scripts/test-medical-knowledge-db.js",
  "scripts/test-clinical-intents.js",
  "scripts/test-open-evidence-workflows.js",
  "scripts/test-embedding-recall.js",
  "scripts/test-evidence-adversarial.js",
  "scripts/test-evidence-eval.js",
  "scripts/test-evidence.js",
  "scripts/test-labs.js",
  "scripts/test-checklist.js",
  "scripts/test-deid.js",
  "scripts/benchmark-deid.js",
  "scripts/check-syntax.js"
];

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Syntax check failed for ${file}`);
  }
}

for (const file of files) {
  runNodeCheck(file);
}

const html = readFileSync("index.html", "utf8");
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
  throw new Error("Do not load third-party Google Fonts in the clinical app shell.");
}
const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
if (!cspMatch) {
  throw new Error("index.html must define a Content Security Policy.");
}
const csp = cspMatch[1];
for (const requiredDirective of [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'"
]) {
  if (!csp.includes(requiredDirective)) {
    throw new Error(`Content Security Policy missing required directive: ${requiredDirective}`);
  }
}
for (const requiredSnippet of [
  "No analytics, telemetry, tracking pixels, or ad scripts",
  "No cloud upload by default",
  "structuredOnlyDeidToggle",
  "clipboardAutoClearToggle",
  "does not legally certify HIPAA de-identification",
  "Business Associate Agreement",
  "raw chart text, admission intake text, patient names, MRNs, and room numbers are not persisted",
  "PHI safety check for encrypted export",
  "PHI safety check for stored OpenEvidence summary"
]) {
  if (!html.includes(requiredSnippet)) {
    throw new Error(`Expected privacy/security guardrail copy not found: ${requiredSnippet}`);
  }
}
for (const forbiddenSnippet of [
  "Patient data stays on this computer",
  "saved patient workspaces",
  "patient workspace to a backend service"
]) {
  if (html.includes(forbiddenSnippet)) {
    throw new Error(`Unsafe privacy copy remains in index.html: ${forbiddenSnippet}`);
  }
}
const securityDoc = readFileSync("SECURITY.md", "utf8");
const privacyDoc = readFileSync("PRIVACY.md", "utf8");
const readmeDoc = readFileSync("README.md", "utf8");
for (const [label, doc] of [["README.md", readmeDoc], ["SECURITY.md", securityDoc], ["PRIVACY.md", privacyDoc], ["index.html", html]]) {
  if (/\bHIPAA compliant\b/i.test(doc)) {
    throw new Error(`${label} should avoid HIPAA compliant phrasing; describe obligations and safeguards instead.`);
  }
}
for (const requiredSnippet of [
  "HIPAA compliance depends on the full operating environment",
  "Security risk analysis guidance",
  "Business associate guidance",
  "do not by themselves satisfy HIPAA obligations",
  "Encrypted context export is user-initiated and gated by the PHI safety check",
  "frame-ancestors 'none'"
]) {
  if (!securityDoc.includes(requiredSnippet)) {
    throw new Error(`Expected SECURITY.md guidance not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  "not a legal de-identification certification service",
  "Local-First Defaults",
  "Data That Can Leave The Browser",
  "External clinical AI tools",
  "Raw chart text, admission intake text, patient names, MRNs, room numbers, and obvious roster identifiers are dropped before vault storage"
]) {
  if (!privacyDoc.includes(requiredSnippet)) {
    throw new Error(`Expected PRIVACY.md guidance not found: ${requiredSnippet}`);
  }
}
if (/Use one OpenEvidence conversation for the patient/i.test(html)) {
  throw new Error("Remove implementation-style OpenEvidence workflow copy from the visible UI.");
}
const scriptMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  throw new Error("Could not find the module script in index.html.");
}

const moduleScript = scriptMatch[1];
if (!/from\s+["']\.\/deid\.js(?:\?[^"']+)?["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared deid.js module.");
}
if (!/from\s+["']\.\/checklist\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared checklist.js module.");
}
if (!/from\s+["']\.\/clinical-intents\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the clinical intents module.");
}
if (!/from\s+["']\.\/complaint-cds\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the complaint CDS module.");
}
if (!/from\s+["']\.\/labs\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared labs.js module.");
}
if (!/from\s+["']\.\/evidence\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared evidence.js module.");
}
if (!/from\s+["']\.\/embedding-recall\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the embedding recall module.");
}
if (!/from\s+["']\.\/open-evidence-workflows\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the OpenEvidence workflow module.");
}
if (!/from\s+["']\.\/open-evidence-results\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the OpenEvidence results module.");
}
for (const importedName of ["cleanupDeidArtifacts", "deidentifyTextStructuredOnly", "normalizeResidualTemporalPhi"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from deid.js.`);
  }
}
for (const importedName of ["parseChecklist", "validateChecklist", "normalizeChecklistText", "buildCleanupPrompt"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from checklist.js.`);
  }
}
for (const importedName of ["resolveClinicalIntents", "selectedValidatedClinicalIntents", "buildValidatedClinicalIntentPromptBlock"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from clinical-intents.js.`);
  }
}
for (const importedName of ["evaluateComplaintCds", "formatComplaintCdsReport"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from complaint-cds.js.`);
  }
}

for (const requiredSnippet of [
  "knowledgeBasePanel",
  "knowledgeModuleSelect",
  "knowledgeModuleEditor",
  "knowledgeProposalList",
  "medicalKnowledgeProposalV1",
  "preRoundMedicalKnowledgeLocalOverridesV1",
  "Local knowledge editor",
  "Edit active local copy",
  "saveKnowledgeLocalOverrideButton",
  "suggestKnowledgeLocalOverrideButton",
  "resetKnowledgeLocalOverrideButton",
  "knowledgeSectionSelect",
  "knowledgeItemSearchInput",
  "loadKnowledgeJsonToFormButton",
  "applyKnowledgeFormToJsonButton",
  "knowledgeSectionTabs",
  "selectedKnowledgeEditorModule",
  "saveCurrentKnowledgeOverride",
  "localKnowledgeOverrideForModule",
  "knowledgeChangeSummaryHasMeaningfulChanges",
  "Make a local edit and save it before suggesting",
  "buildGuidelineExtractionPrompt",
  "loadKnowledgeEnvelopeIntoReadableEditor",
  "syncKnowledgeReadableEditorToJson",
  "renderKnowledgeSectionEditor",
  "effectiveComplaintModules",
  "updateKnowledgeProposalStatus",
  "renderKnowledgeBaseWorkbench"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected medical knowledge workbench implementation not found: ${requiredSnippet}`);
  }
}
const selectedKnowledgeModuleDefinitions = moduleScript.match(/\bfunction\s+selectedKnowledgeModule\s*\(/g) || [];
if (selectedKnowledgeModuleDefinitions.length !== 1) {
  throw new Error("index.html must define exactly one clinical selectedKnowledgeModule() helper.");
}
for (const importedName of ["parseLabTimeline", "formatLabTimelinePreview", "formatLabChronologyPromptBlock"]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from labs.js.`);
  }
}
for (const importedName of [
  "buildEvidencePromptReplacement",
  "loadEvidenceCatalog",
  "matchEvidenceForChecklistItem",
  "updateEvidenceReviewState",
  "exportEvidenceReviewState",
  "importEvidenceReviewState"
]) {
  if (!new RegExp(`\\b${importedName}\\b`).test(moduleScript)) {
    throw new Error(`index.html must use shared ${importedName} from evidence.js.`);
  }
}
if (!/\bscanResidualPhi\s+as\s+scanResidualPhiShared\b/.test(moduleScript)) {
  throw new Error("index.html must import shared scanResidualPhi as scanResidualPhiShared.");
}
if (/\bfunction\s+(?:modelPredictionsToEntities|addStructuredSafeHarborEntities|filterLikelyFalsePositiveEntities|scanResidualPhi)\b/.test(moduleScript)) {
  throw new Error("index.html contains duplicate inline de-id helpers; keep de-identification logic in deid.js.");
}
if (!/PHI safety check for medication safety prompt[\s\S]{0,400}reviewScope:\s*"source-free"/.test(moduleScript)) {
  throw new Error("Medication safety prompt must be marked source-free for PHI review.");
}
for (const requiredSnippet of [
  "securitySettingsStorageKey",
  "normalizeSecuritySettings",
  "currentDeidMode",
  "isStructuredOnlyDeid",
  "scheduleClipboardClearAfterCopy",
  "blockingPhiWarnings",
  "storageSafeOpenEvidenceResult",
  "openEvidenceResultStorageText"
]) {
  if (!moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected security settings implementation not found: ${requiredSnippet}`);
  }
}
if (!/function\s+exportContextToPhone[\s\S]{0,900}runPhiSafetyCheck[\s\S]{0,700}blockingPhiWarnings[\s\S]{0,1200}encryptContextPayload/.test(moduleScript)) {
  throw new Error("Encrypted context export must run a PHI safety check before creating the file.");
}
if (!/function\s+acceptOpenEvidenceResult[\s\S]{0,900}openEvidenceResultStorageText[\s\S]{0,900}blockingPhiWarnings[\s\S]{0,900}storageSafeOpenEvidenceResult/.test(moduleScript)) {
  throw new Error("Accepted OpenEvidence paste-back summaries must be PHI-checked and storage-sanitized.");
}
if (!/function\s+applyOpenEvidenceChecklistResult[\s\S]{0,700}runPhiSafetyCheck[\s\S]{0,700}blockingPhiWarnings[\s\S]{0,900}tryBuildChecklist/.test(moduleScript)) {
  throw new Error("OpenEvidence checklist paste-back must pass PHI review before applying to app state.");
}
if (!/currentDeidMode\(\)[\s\S]{0,260}structured-only[\s\S]{0,900}deidentifyTextStructuredOnly/.test(moduleScript)) {
  throw new Error("Structured-only mode must bypass the de-ID worker and run shared structured redaction directly.");
}
if (!/function\s+prepareDeidentifierModel\(\)[\s\S]{0,350}isStructuredOnlyDeid\(\)/.test(moduleScript)) {
  throw new Error("Model preparation must respect structured-only mode.");
}
if (/function\s+renderReviewGroups[\s\S]{0,900}raw\.slice/.test(moduleScript)) {
  throw new Error("Rendered review groups must not replay raw redacted PHI spans.");
}
for (const requiredSnippet of [
  "cleanOutputLabel",
  "cleanOutputValue",
  "format-fix prompt",
  "deviceWorkflowMode",
  "laptopHandoffCard",
  "Use checklist on this laptop",
  "Start bedside checklist",
  "Teach me this patient",
  "loadStudentExamReferenceRows",
  "selectStudentExamReferenceRows",
  "student_exam_reference",
  "Clinical workup",
  "Search concern or diagnosis",
  "clinicalIntentResults",
  "clinicalModifierQuickChips",
  "clinical-search-box",
  "type=\"search\"",
  "copyClinicalImprovementAuditButton",
  "copyExamImprovementAuditButton",
  "formatClinicalImprovementAuditReport",
  "stageKnowledgeGapButton",
  "complaintCdsInput",
  "runComplaintCds",
  "buildUnifiedClinicalWorkup",
  "unifiedEvidenceRetrievalContext",
  "Evidence review",
  "Reviewer audit / evidence retrieval",
  "examTesterInput",
  "runExamTester",
  "examTesterEmbeddingToggle",
  "Semantic recall: EmbeddingGemma q4",
  "knowledgePackImportInput",
  "Do not limit yourself to this reference"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected checklist usability guardrail not found: ${requiredSnippet}`);
  }
}
if (/>\s*Build checklist\s*</i.test(html) || /Copy teaching prompt/i.test(html)) {
  throw new Error("Old workflow labels should not be visible in the app.");
}
if (/Evidence exam tester \/ audit/.test(html)) {
  throw new Error("Evidence exam tester should be nested as reviewer audit, not presented as a separate normal workflow.");
}
if (!/id="runComplaintCdsButton"[\s\S]{0,160}disabled/.test(html)) {
  throw new Error("Clinical workup build must start disabled until a validated intent is selected.");
}
if (!/elements\.checklistPasteCard\.hidden\s*=\s*!\(bedsideMode\s*\|\|\s*state\.useChecklistOnLaptop\s*\|\|\s*hasChecklistPasteText\(\)\)/.test(moduleScript)) {
  throw new Error("Laptop mode must not show the checklist paste card by default after prompt copy.");
}
const worker = readFileSync("deid-worker.js", "utf8");
if (!/\bcreateDeidentifier\b/.test(worker) || !/from\s+["']\.\/deid\.js(?:\?[^"']+)?["']/.test(worker)) {
  throw new Error("deid-worker.js must run the shared deidentifier from deid.js.");
}

const checklistModule = readFileSync("checklist.js", "utf8");
const deidModule = readFileSync("deid.js", "utf8");
if (/function\s+entityFlags[\s\S]{0,700}rawText\.slice/.test(deidModule)) {
  throw new Error("De-ID entity flags must not replay raw redacted PHI spans.");
}
for (const requiredSnippet of [
  "Parent checklist titles must be the exact all-caps lines above, with no colon.",
  "categoryForChecklistTitle",
  "dashOptionMatch",
  "questionOptionMatch",
  "student_exam_reference",
  "Use it as a floor, not a ceiling",
  "retrieved_evidence_candidates",
  "prioritized evidence-seeded starting point",
  "validated_clinical_intents",
  "Do not add unvalidated checklist items as final checklist rows",
  "I am a third-year medical student preparing for inpatient rounds.",
  "BEDSIDE QUESTION CHECKLIST",
  "TARGETED PHYSICAL EXAM CHECKLIST"
]) {
  if (!checklistModule.includes(requiredSnippet)) {
    throw new Error(`Expected shared checklist guardrail not found: ${requiredSnippet}`);
  }
}
for (const requiredSnippet of [
  "OpenEvidence Rounds Hub",
  "openEvidenceTaskBoard",
  "openEvidencePastebackInput",
  "Refine with OpenEvidence",
  "structured paste-back review"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence rounds hub guardrail not found: ${requiredSnippet}`);
  }
}

const complaintCdsModule = readFileSync("complaint-cds.js", "utf8");
for (const requiredSnippet of [
  "complaint-cds-artifact-v1",
  "./medical-knowledge-db.js",
  "evaluateComplaintCds",
  "validateComplaintModules",
  "formatComplaintCdsReport"
]) {
  if (!complaintCdsModule.includes(requiredSnippet)) {
    throw new Error(`Expected complaint CDS implementation not found: ${requiredSnippet}`);
  }
}

const medicalKnowledgeDbModule = readFileSync("medical-knowledge-db.js", "utf8");
for (const requiredSnippet of [
  "Generated by scripts/build-medical-knowledge-db.js",
  "medical_knowledge_database_v1",
  "chest_pain_v1",
  "hyperglycemia_possible_dka_v1",
  "AHA_ACC_CHEST_PAIN_2021",
  "ADA_HYPERGLYCEMIC_CRISES_2024"
]) {
  if (!medicalKnowledgeDbModule.includes(requiredSnippet)) {
    throw new Error(`Expected generated medical knowledge database content not found: ${requiredSnippet}`);
  }
}

const medicalKnowledgeBuilder = readFileSync("scripts/build-medical-knowledge-db.js", "utf8");
for (const requiredSnippet of [
  "medical_knowledge_database_v1",
  "validateMedicalKnowledgeDatabase",
  "medical-knowledge-db.js is out of date"
]) {
  if (!medicalKnowledgeBuilder.includes(requiredSnippet)) {
    throw new Error(`Expected medical knowledge builder implementation not found: ${requiredSnippet}`);
  }
}

const clinicalIntentsModule = readFileSync("clinical-intents.js", "utf8");
for (const requiredSnippet of [
  "clinical-intent-registry-v1",
  "clinicalIntentRegistry",
  "dka_hhs_v1",
  "suspected_pe_v1",
  "abdominal_pain_cramping_v1",
  "resolveClinicalIntents",
  "filterEvidenceCatalogForClinicalIntents",
  "buildValidatedClinicalIntentPromptBlock",
  "validateClinicalIntentRegistry"
]) {
  if (!clinicalIntentsModule.includes(requiredSnippet)) {
    throw new Error(`Expected clinical intent implementation not found: ${requiredSnippet}`);
  }
}

const physicalExamReferencePath = "data/physical-exam/physical_exam_reference.csv";
const physicalExamOverlayPath = "data/physical-exam/physical_exam_evidence_overlay.csv";
const examTechniqueBasePath = "data/evidence/exam_technique_base.csv";
const examEvidenceOverlayPath = "data/evidence/exam_evidence_overlay.csv";
const retrievalTagDictionaryPath = "data/evidence/retrieval_tag_dictionary.csv";
const priorityEnrichmentQueuePath = "data/evidence/priority_enrichment_queue.csv";
const sourceRegistryCsvPath = "data/evidence/source_registry.csv";
const evidenceEvalCasesPath = "data/evidence/evidence_eval_cases.csv";
const evidenceEvalGoldPath = "data/evidence/evidence_eval_gold.csv";

const examReferenceCsv = readFileSync(physicalExamReferencePath, "utf8");
for (const requiredSnippet of [
  "exam_system,section,region_or_subsection,maneuver_or_finding",
  "Visual acuity",
  "Auscultate heart with diaphragm and bell",
  "Patellar grind Clarke test",
  "Stethoscope hygiene"
]) {
  if (!examReferenceCsv.includes(requiredSnippet)) {
    throw new Error(`Expected physical exam CSV reference not found: ${requiredSnippet}`);
  }
}

const evidenceModule = readFileSync("evidence.js", "utf8");
for (const requiredSnippet of [
  "rankEvidenceCandidates",
  "formatEvidenceCandidatesBlock",
  "mergeLegacyPhysicalExamOverlay",
  "legacyOverlay",
  "replaceStudentReferenceWithEvidenceBlock",
  "retrieved_evidence_candidates",
  "review?.status === \"accepted\"",
  "review?.status === \"rejected\"",
  "clinicalRelevance",
  "bedsideFeasibility"
]) {
  if (!evidenceModule.includes(requiredSnippet)) {
    throw new Error(`Expected evidence retrieval implementation not found: ${requiredSnippet}`);
  }
}

const embeddingRecallModule = readFileSync("embedding-recall.js", "utf8");
for (const requiredSnippet of [
  "defaultEmbeddingModelKey = \"embeddinggemma\"",
  "onnx-community/embeddinggemma-300m-ONNX",
  "task: search result | query:",
  "rankEvidenceCandidatesHybrid",
  "Embedding service is required to build an index.",
  "clinical_knowledge_pack_v1",
  "validateClinicalKnowledgePack",
  "embeddingOnly"
]) {
  if (!embeddingRecallModule.includes(requiredSnippet)) {
    throw new Error(`Expected embedding recall implementation not found: ${requiredSnippet}`);
  }
}

const clinicalIterationModule = readFileSync("scripts/iterate-clinical-workups.js", "utf8");
for (const requiredSnippet of [
  "Clinical Workup Iteration Report",
  "missing_required_domain",
  "high_score_suppressed",
  "filterEvidenceCatalogForClinicalIntents"
]) {
  if (!clinicalIterationModule.includes(requiredSnippet)) {
    throw new Error(`Expected clinical workup iteration runner not found: ${requiredSnippet}`);
  }
}

const endocrineWorkupModule = readFileSync("scripts/generate-endocrine-workups.js", "utf8");
for (const requiredSnippet of [
  "Endocrine Diagnosis Workup Automation Report",
  "ADA_SOC_2026",
  "ES_PRIMARY_ALDO_2025",
  "PCOS_GUIDELINE_2023",
  "resolveClinicalIntents"
]) {
  if (!endocrineWorkupModule.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine workup generator not found: ${requiredSnippet}`);
  }
}

const endocrineInstallModule = readFileSync("scripts/install-endocrine-workups.js", "utf8");
for (const requiredSnippet of [
  "Endocrine Workup Completion Report",
  "complaint-modules\", \"endocrine",
  "active_guideline_workup",
  "Expected 37 endocrine workups"
]) {
  if (!endocrineInstallModule.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine workup installer not found: ${requiredSnippet}`);
  }
}

const endocrineKnowledgeTest = readFileSync("scripts/test-endocrine-knowledge.js", "utf8");
for (const requiredSnippet of [
  "database should include all 37 endocrine workup modules",
  "PCOS should include exclusion and criteria anchors",
  "DI should include urine and hypernatremia thresholds"
]) {
  if (!endocrineKnowledgeTest.includes(requiredSnippet)) {
    throw new Error(`Expected endocrine knowledge test guardrail not found: ${requiredSnippet}`);
  }
}

const openEvidenceWorkflowsModule = readFileSync("open-evidence-workflows.js", "utf8");
for (const requiredSnippet of [
  "openEvidenceTasks",
  "buildOpenEvidencePrompt",
  "initial_rounds_report",
  "final_rounds_update",
  "generate_checklist",
  "refine_checklist",
  "medication_safety",
  "confirm_guideline",
  "find_exception",
  "attending_plan",
  "teaching_explanation",
  "discharge_checklist",
  "what_am_i_missing"
]) {
  if (!openEvidenceWorkflowsModule.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence workflow registry guardrail not found: ${requiredSnippet}`);
  }
}

const openEvidenceResultsModule = readFileSync("open-evidence-results.js", "utf8");
for (const requiredSnippet of [
  "open-evidence-task-result-v1",
  "parseOpenEvidenceResult",
  "normalizeOpenEvidenceTaskResult",
  "extractCitations",
  "checklistText",
  "acceptedSummary"
]) {
  if (!openEvidenceResultsModule.includes(requiredSnippet)) {
    throw new Error(`Expected OpenEvidence paste-back parser guardrail not found: ${requiredSnippet}`);
  }
}

const requestedBaseCsv = readFileSync(examTechniqueBasePath, "utf8");
if (requestedBaseCsv !== examReferenceCsv) {
  throw new Error(`${examTechniqueBasePath} must be an unchanged copy of ${physicalExamReferencePath}.`);
}

const requestedOverlayCsv = readFileSync(examEvidenceOverlayPath, "utf8");
const requestedTagDictionaryCsv = readFileSync(retrievalTagDictionaryPath, "utf8");
const requestedQueueCsv = readFileSync(priorityEnrichmentQueuePath, "utf8");
const sourceRegistryCsv = readFileSync(sourceRegistryCsvPath, "utf8");
const evidenceEvalCasesCsv = readFileSync(evidenceEvalCasesPath, "utf8");
const evidenceEvalGoldCsv = readFileSync(evidenceEvalGoldPath, "utf8");
for (const [fileName, csvText, snippets] of [
  [examEvidenceOverlayPath, requestedOverlayCsv, ["base_row_fingerprint", "bedside_question_label", "result_changes_management", "retrieval_tags"]],
  [retrievalTagDictionaryPath, requestedTagDictionaryCsv, ["thyroid_disease", "hypovolemia", "inpatient_diabetes", "pituitary_sellar"]],
  [priorityEnrichmentQueuePath, requestedQueueCsv, ["exam_id", "base_row_number", "priority_reason", "planned_sources"]],
  [sourceRegistryCsvPath, sourceRegistryCsv, ["SM25", "JAMA_RCE", "MCGEE_EBPD", "AHRQ_CALIBRATE_DX"]],
  [evidenceEvalCasesPath, evidenceEvalCasesCsv, ["dx_dka_hhs", "dx_suspected_pe", "cv_chest_pain", "psych_malaise"]],
  [evidenceEvalGoldPath, evidenceEvalGoldCsv, ["expected_core_labels", "dx_dka_hhs", "dx_suspected_pe", "avoid_labels"]]
]) {
  for (const snippet of snippets) {
    if (!csvText.includes(snippet)) {
      throw new Error(`Expected ${fileName} reference not found: ${snippet}`);
    }
  }
}

function parseCsvRow(line) {
  const fields = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function parseCsvForValidation(csvText, fileName) {
  const lines = String(csvText || "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error(`${fileName} must include a header and at least one data row.`);
  }
  const headers = parseCsvRow(lines[0]);
  const rows = lines.slice(1).map((line, rowIndex) => {
    const fields = parseCsvRow(line);
    if (fields.length !== headers.length) {
      throw new Error(`${fileName} row ${rowIndex + 2} has ${fields.length} fields but expected ${headers.length}.`);
    }
    return headers.reduce((row, header, index) => {
      row[header] = fields[index] || "";
      return row;
    }, {});
  });
  return { headers, rows };
}

function assertInSet(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`${label} has invalid value "${value}".`);
  }
}

function assertNumeric(value, label, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (!value && !required) {
    return;
  }
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be numeric between ${min} and ${max}; got "${value}".`);
  }
}

const examReference = parseCsvForValidation(examReferenceCsv, physicalExamReferencePath);
if (!examReference.headers.includes("exam_id")) {
  throw new Error(`${physicalExamReferencePath} must include exam_id.`);
}
if (examReference.rows.length !== 187) {
  throw new Error(`Expected 187 physical exam reference rows, got ${examReference.rows.length}.`);
}

const examIds = new Set();
for (const [index, row] of examReference.rows.entries()) {
  if (!row.exam_id) {
    throw new Error(`${physicalExamReferencePath} row ${index + 2} is missing exam_id.`);
  }
  if (examIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in ${physicalExamReferencePath}: ${row.exam_id}`);
  }
  examIds.add(row.exam_id);
}

const overlayCsv = readFileSync(physicalExamOverlayPath, "utf8");
const overlay = parseCsvForValidation(overlayCsv, physicalExamOverlayPath);
const expectedOverlayHeaders = [
  "exam_id",
  "condition_or_syndrome",
  "diagnostic_target",
  "when_to_use_structured",
  "result_changes_management",
  "management_link",
  "evidence_source_primary",
  "source_url_or_pubmed",
  "LR_plus",
  "LR_minus",
  "evidence_tier",
  "difficulty",
  "time_burden_minutes",
  "equipment_needed",
  "care_setting",
  "contraindications_or_limitations",
  "retrieval_tags",
  "actionability_score_seed",
  "evidence_status",
  "evidence_summary",
  "last_reviewed"
];
if (overlay.headers.join(",") !== expectedOverlayHeaders.join(",")) {
  throw new Error(`${physicalExamOverlayPath} has an unexpected header order.`);
}
if (overlay.rows.length !== examReference.rows.length) {
  throw new Error(`${physicalExamOverlayPath} must have one row per base exam row.`);
}

const overlayIds = new Set();
const allowedStatuses = new Set(["curated", "public_lr_unavailable", "pending"]);
const allowedTiers = new Set(["rce_or_meta_analysis", "systematic_review", "guideline", "teaching_reference", "expert_consensus", "insufficient_public_evidence"]);
const allowedDifficulties = new Set(["low", "medium", "high"]);

for (const [index, row] of overlay.rows.entries()) {
  const rowLabel = `${physicalExamOverlayPath} row ${index + 2} (${row.exam_id || "missing exam_id"})`;
  if (!examIds.has(row.exam_id)) {
    throw new Error(`${rowLabel} does not match any base exam_id.`);
  }
  if (overlayIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in ${physicalExamOverlayPath}: ${row.exam_id}`);
  }
  overlayIds.add(row.exam_id);
  if (!row.retrieval_tags) {
    throw new Error(`${rowLabel} is missing retrieval_tags.`);
  }
  if (!row.equipment_needed || !row.care_setting || !row.time_burden_minutes) {
    throw new Error(`${rowLabel} is missing feasibility metadata.`);
  }
  assertInSet(row.evidence_status, allowedStatuses, `${rowLabel} evidence_status`);
  assertInSet(row.evidence_tier, allowedTiers, `${rowLabel} evidence_tier`);
  assertInSet(row.difficulty, allowedDifficulties, `${rowLabel} difficulty`);
  assertNumeric(row.time_burden_minutes, `${rowLabel} time_burden_minutes`, { min: 0.1, max: 20 });
  assertNumeric(row.actionability_score_seed, `${rowLabel} actionability_score_seed`, { min: 0, max: 10 });
  assertNumeric(row.LR_plus, `${rowLabel} LR_plus`, { required: false, min: 0, max: 100 });
  assertNumeric(row.LR_minus, `${rowLabel} LR_minus`, { required: false, min: 0, max: 100 });
  if (row.evidence_status !== "pending" && (!row.evidence_source_primary || !row.source_url_or_pubmed || !row.evidence_summary || !row.last_reviewed)) {
    throw new Error(`${rowLabel} has evidence metadata status but lacks source, summary, or review date.`);
  }
  if (row.evidence_status === "pending" && row.last_reviewed) {
    throw new Error(`${rowLabel} should not have last_reviewed while pending.`);
  }
}

if (overlayIds.size !== examIds.size) {
  throw new Error("Overlay/base exam_id sets differ.");
}

const evidenceRows = overlay.rows.filter((row) => row.evidence_status !== "pending");
if (evidenceRows.length !== 75) {
  throw new Error(`Expected exactly 75 evidence-populated overlay rows, got ${evidenceRows.length}.`);
}

const baseById = new Map(examReference.rows.map((row) => [row.exam_id, row]));
const evidenceCountsBySystem = new Map();
for (const row of evidenceRows) {
  const system = baseById.get(row.exam_id)?.exam_system || "Unknown";
  evidenceCountsBySystem.set(system, (evidenceCountsBySystem.get(system) || 0) + 1);
}
if (evidenceCountsBySystem.get("Cardiopulmonary") !== 28 || evidenceCountsBySystem.get("Abdomen") !== 13 || evidenceCountsBySystem.get("Neuro") !== 34) {
  throw new Error(`Evidence tranche must be 28 cardiopulmonary, 13 abdomen, and 34 neuro rows; got ${JSON.stringify(Object.fromEntries(evidenceCountsBySystem))}.`);
}

for (const requiredEvidenceSnippet of [
  "cardiopulmonary_vascular_exam_neck_jvp",
  "cardiopulmonary_cardiac_exam_auscultation_auscultate_heart_with_diaphragm_and_bell",
  "abdomen_advanced_maneuvers_ruq_murphy_sign",
  "abdomen_advanced_maneuvers_appendicitis_psoas_sign",
  "abdomen_advanced_maneuvers_cva_cva_tenderness",
  "2.47",
  "11",
  "2.8",
  "2.38",
  "1.3"
]) {
  if (!overlayCsv.includes(requiredEvidenceSnippet)) {
    throw new Error(`Expected evidence overlay reference not found: ${requiredEvidenceSnippet}`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), "preround-syntax-"));
try {
  const modulePath = join(scratch, "index-inline.mjs");
  writeFileSync(modulePath, moduleScript, "utf8");
  runNodeCheck(modulePath);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("Syntax checks passed.");
