import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = [
  "checklist.js",
  "deid.js",
  "deid-worker.js",
  "scripts/deid-fixtures.js",
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

const scratch = mkdtempSync(join(tmpdir(), "preround-syntax-"));
try {
  const modulePath = join(scratch, "index-inline.mjs");
  writeFileSync(modulePath, moduleScript, "utf8");
  runNodeCheck(modulePath);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("Syntax checks passed.");
