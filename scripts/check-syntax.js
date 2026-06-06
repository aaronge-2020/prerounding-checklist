import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = [
  "checklist.js",
  "deid.js",
  "deid-worker.js",
  "evidence.js",
  "labs.js",
  "scripts/deid-fixtures.js",
  "scripts/build-physical-exam-evidence.js",
  "scripts/audit-evidence-checklist.js",
  "scripts/evidence-eval.js",
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
if (/Use one OpenEvidence conversation for the patient/i.test(html)) {
  throw new Error("Remove implementation-style OpenEvidence workflow copy from the visible UI.");
}
const scriptMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  throw new Error("Could not find the module script in index.html.");
}

const moduleScript = scriptMatch[1];
if (!/from\s+["']\.\/deid\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared deid.js module.");
}
if (!/from\s+["']\.\/checklist\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared checklist.js module.");
}
if (!/from\s+["']\.\/labs\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared labs.js module.");
}
if (!/from\s+["']\.\/evidence\.js["']/.test(moduleScript)) {
  throw new Error("index.html must import the shared evidence.js module.");
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
  "Evidence review",
  "Do not limit yourself to this reference"
]) {
  if (!html.includes(requiredSnippet) && !moduleScript.includes(requiredSnippet)) {
    throw new Error(`Expected checklist usability guardrail not found: ${requiredSnippet}`);
  }
}
if (/>\s*Build checklist\s*</i.test(html) || /Copy teaching prompt/i.test(html)) {
  throw new Error("Old workflow labels should not be visible in the app.");
}
if (!/elements\.checklistPasteCard\.hidden\s*=\s*!\(bedsideMode\s*\|\|\s*state\.useChecklistOnLaptop\s*\|\|\s*hasChecklistPasteText\(\)\)/.test(moduleScript)) {
  throw new Error("Laptop mode must not show the checklist paste card by default after prompt copy.");
}
const worker = readFileSync("deid-worker.js", "utf8");
if (!/\bcreateDeidentifier\b/.test(worker) || !/from\s+["']\.\/deid\.js["']/.test(worker)) {
  throw new Error("deid-worker.js must run the shared deidentifier from deid.js.");
}

const checklistModule = readFileSync("checklist.js", "utf8");
for (const requiredSnippet of [
  "Parent checklist titles must be the exact all-caps lines above, with no colon.",
  "categoryForChecklistTitle",
  "dashOptionMatch",
  "questionOptionMatch",
  "student_exam_reference",
  "Use it as a floor, not a ceiling",
  "retrieved_evidence_candidates",
  "prioritized evidence-seeded starting point",
  "add any missing evidence-based, safe, bedside-feasible questions or exam maneuvers",
  "I am a third-year medical student preparing for inpatient rounds.",
  "BEDSIDE QUESTION CHECKLIST",
  "TARGETED PHYSICAL EXAM CHECKLIST"
]) {
  if (!checklistModule.includes(requiredSnippet)) {
    throw new Error(`Expected shared checklist guardrail not found: ${requiredSnippet}`);
  }
}

const examReferenceCsv = readFileSync("physical_exam_reference.csv", "utf8");
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

const requestedBaseCsv = readFileSync("exam_technique_base.csv", "utf8");
if (requestedBaseCsv !== examReferenceCsv) {
  throw new Error("exam_technique_base.csv must be an unchanged copy of physical_exam_reference.csv.");
}

const requestedOverlayCsv = readFileSync("exam_evidence_overlay.csv", "utf8");
const requestedTagDictionaryCsv = readFileSync("retrieval_tag_dictionary.csv", "utf8");
const requestedQueueCsv = readFileSync("priority_enrichment_queue.csv", "utf8");
const sourceRegistryCsv = readFileSync("source_registry.csv", "utf8");
const evidenceEvalCasesCsv = readFileSync("evidence_eval_cases.csv", "utf8");
const evidenceEvalGoldCsv = readFileSync("evidence_eval_gold.csv", "utf8");
for (const [fileName, csvText, snippets] of [
  ["exam_evidence_overlay.csv", requestedOverlayCsv, ["base_row_fingerprint", "bedside_question_label", "result_changes_management", "retrieval_tags"]],
  ["retrieval_tag_dictionary.csv", requestedTagDictionaryCsv, ["thyroid_disease", "hypovolemia", "inpatient_diabetes", "pituitary_sellar"]],
  ["priority_enrichment_queue.csv", requestedQueueCsv, ["exam_id", "base_row_number", "priority_reason", "planned_sources"]],
  ["source_registry.csv", sourceRegistryCsv, ["SM25", "JAMA_RCE", "MCGEE_EBPD", "AHRQ_CALIBRATE_DX"]],
  ["evidence_eval_cases.csv", evidenceEvalCasesCsv, ["dx_dka_hhs", "dx_suspected_pe", "cv_chest_pain", "psych_malaise"]],
  ["evidence_eval_gold.csv", evidenceEvalGoldCsv, ["expected_core_labels", "dx_dka_hhs", "dx_suspected_pe", "avoid_labels"]]
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

const examReference = parseCsvForValidation(examReferenceCsv, "physical_exam_reference.csv");
if (!examReference.headers.includes("exam_id")) {
  throw new Error("physical_exam_reference.csv must include exam_id.");
}
if (examReference.rows.length !== 187) {
  throw new Error(`Expected 187 physical exam reference rows, got ${examReference.rows.length}.`);
}

const examIds = new Set();
for (const [index, row] of examReference.rows.entries()) {
  if (!row.exam_id) {
    throw new Error(`physical_exam_reference.csv row ${index + 2} is missing exam_id.`);
  }
  if (examIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in physical_exam_reference.csv: ${row.exam_id}`);
  }
  examIds.add(row.exam_id);
}

const overlayCsv = readFileSync("physical_exam_evidence_overlay.csv", "utf8");
const overlay = parseCsvForValidation(overlayCsv, "physical_exam_evidence_overlay.csv");
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
  throw new Error("physical_exam_evidence_overlay.csv has an unexpected header order.");
}
if (overlay.rows.length !== examReference.rows.length) {
  throw new Error("physical_exam_evidence_overlay.csv must have one row per base exam row.");
}

const overlayIds = new Set();
const allowedStatuses = new Set(["curated", "public_lr_unavailable", "pending"]);
const allowedTiers = new Set(["rce_or_meta_analysis", "systematic_review", "guideline", "teaching_reference", "expert_consensus", "insufficient_public_evidence"]);
const allowedDifficulties = new Set(["low", "medium", "high"]);

for (const [index, row] of overlay.rows.entries()) {
  const rowLabel = `physical_exam_evidence_overlay.csv row ${index + 2} (${row.exam_id || "missing exam_id"})`;
  if (!examIds.has(row.exam_id)) {
    throw new Error(`${rowLabel} does not match any base exam_id.`);
  }
  if (overlayIds.has(row.exam_id)) {
    throw new Error(`Duplicate exam_id in physical_exam_evidence_overlay.csv: ${row.exam_id}`);
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
