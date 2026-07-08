import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkupAuthoringSnapshot,
  exportModuleEntriesFromSnapshot
} from "../src/workup/workup-authoring.js";
import { loadSupabaseEnvFiles, hasSupabaseServiceConfig } from "../utils/supabase/env.js";
import { createSupabaseServiceClient } from "../utils/supabase/node.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadSupabaseEnvFiles({ cwd: repoRoot });
const args = new Set(process.argv.slice(2));

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readJson(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function loadLocalSnapshot(changeSets = []) {
  const manifest = readJson("medical-knowledge/manifest.json");
  const sourceRegistry = readJson(manifest.source_registry || "medical-knowledge/source-registry.json");
  const moduleEntries = (manifest.complaint_modules || []).map((modulePath) => ({
    filePath: modulePath,
    envelope: readJson(modulePath)
  }));
  return buildWorkupAuthoringSnapshot({ manifest, sourceRegistry, moduleEntries, changeSets });
}

async function fetchApprovedChangeSetsFromSupabase() {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("change_sets")
    .select("*")
    .eq("review_status", "approved")
    .eq("export_ready", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to read approved Supabase change sets: ${error.message}`);
  return data || [];
}

function loadSnapshot() {
  const snapshotPath = argValue("--snapshot");
  if (snapshotPath) {
    return readJson(path.resolve(repoRoot, snapshotPath));
  }
  return null;
}

function writeExportedModules(moduleEntries, { outputDir = "" } = {}) {
  for (const entry of moduleEntries) {
    const targetPath = outputDir
      ? path.join(outputDir, entry.file_path)
      : path.join(repoRoot, entry.file_path);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(entry.envelope, null, 2)}\n`);
  }
}

function runNpmScript(scriptName) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", scriptName], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed.`);
  }
}

async function main() {
  const outputDir = argValue("--out-dir");
  let snapshot = loadSnapshot();
  if (!snapshot) {
    const changeSets = await fetchApprovedChangeSetsFromSupabase();
    snapshot = loadLocalSnapshot(changeSets);
  }

  const exported = exportModuleEntriesFromSnapshot(snapshot, {
    includeDrafts: args.has("--include-drafts")
  });

  if (args.has("--check")) {
    const currentSnapshot = loadLocalSnapshot();
    const currentExport = exportModuleEntriesFromSnapshot(currentSnapshot);
    const currentText = JSON.stringify(currentExport.map((entry) => entry.envelope));
    const nextText = JSON.stringify(exported.map((entry) => entry.envelope));
    if (currentText !== nextText) {
      throw new Error("Reviewed authoring export differs from local medical-knowledge JSON.");
    }
    console.log(`Verified ${exported.length} exported workup module envelopes without drift.`);
    return;
  }

  writeExportedModules(exported, { outputDir: outputDir ? path.resolve(repoRoot, outputDir) : "" });
  console.log(`${outputDir ? "Exported" : "Wrote"} ${exported.length} reviewed workup module JSON files.`);

  if (!outputDir && !args.has("--skip-build")) {
    runNpmScript("build:medical-knowledge");
    if (!args.has("--skip-tests")) runNpmScript("test:medical-knowledge");
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
