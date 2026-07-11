import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const coreFiles = [
  "src/app/state/vault.js",
  "src/app/state/persistence.js",
  "src/app/state/workspace-mirror.js",
  "src/patient-context/sections.js",
  "src/patient-context/model-packs.js",
  "src/patient-context/model-pack-storage.js",
  "src/daily-updates/days.js",
  "src/workups/catalog.js",
  "src/workups/admission-core.js",
  "src/workups/workspace-mirror-plan.js",
  "src/workups/schema.js",
  "src/workups/checklist-conversion.js",
  "src/checklist/state.js",
  "src/prompts/open-evidence.js",
  "src/prompts/custom-templates.js",
  "src/ui/app.js",
  "src/vault/deid.js",
  "service-worker.js"
];

const packageScriptFiles = Object.values(packageJson.scripts || {}).flatMap((command) =>
  [...String(command).matchAll(/\bnode\s+([^\s&|]+\.js)\b/g)].map((match) => match[1].replaceAll("\\", "/"))
);

function runNodeCheck(file) {
  if (!existsSync(file)) return;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Syntax check failed for ${file}`);
  }
}

for (const file of [...new Set([...coreFiles, ...packageScriptFiles])].sort()) runNodeCheck(file);

const html = readFileSync("index.html", "utf8");
const stylesheet = readFileSync("styles.css", "utf8");
const promptRegistry = readFileSync("src/prompts/open-evidence.js", "utf8");
const modelOptions = readFileSync("src/patient-context/deid-model-options.js", "utf8");
const modelService = readFileSync("src/patient-context/deid-service.js", "utf8");

for (const required of [
  "Pre-Rounding Checklist Builder",
  "Content-Security-Policy",
  "connect-src 'self'",
  "./src/ui/app.js",
  "./vendor/qrcode-generator-2.0.4.js",
  "Guidelines-admission.md",
  "Guidelines-progress.md",
  "initial_admission_rounds",
  "daily_progress_note",
  "teaching_case_trajectory",
  "medication_explainer_by_problem",
  "medication_safety_audit",
  "checklist_workup_refinement"
]) {
  if (!`${html}\n${stylesheet}\n${promptRegistry}`.includes(required)) {
    throw new Error(`Expected local-first app marker not found: ${required}`);
  }
}

if (!html.includes("connect-src 'self' https://huggingface.co https://*.hf.co")) {
  throw new Error("The static app CSP must allow only the approved model-download hosts in addition to same-origin requests.");
}

if (!modelOptions.includes("revision:") || !modelOptions.includes("repository:")) {
  throw new Error("Optional model download sources must stay revision-pinned.");
}

if (!modelService.includes("External model requests are disabled.")) {
  throw new Error("Advanced model inference must continue to reject external model requests.");
}

console.log("Syntax checks passed.");
