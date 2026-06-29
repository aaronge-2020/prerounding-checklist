import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkupAuthoringSnapshot,
  exportModuleEntriesFromSnapshot
} from "../workup-authoring.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function argValues(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2)
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length))
    .filter(Boolean);
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

function loadSnapshot() {
  const snapshotPath = argValue("--snapshot");
  if (snapshotPath) {
    return readJson(path.resolve(repoRoot, snapshotPath));
  }
  return null;
}

function normalizeChangeSet(entry = {}) {
  if (!entry || typeof entry !== "object" || entry.schema !== "workup_change_set_v1") return null;
  return entry;
}

function changeSetsFromJson(value) {
  if (Array.isArray(value)) return value.map(normalizeChangeSet).filter(Boolean);
  if (value?.schema === "workup_change_set_v1") return [value];
  if (Array.isArray(value?.change_sets)) return value.change_sets.map(normalizeChangeSet).filter(Boolean);
  if (Array.isArray(value?.changeSets)) return value.changeSets.map(normalizeChangeSet).filter(Boolean);
  if (value?.changeSet) return changeSetsFromJson(value.changeSet);
  return [];
}

function loadChangeSets() {
  const paths = [
    ...argValues("--change-set"),
    ...argValues("--change-sets")
  ];
  const positionalJson = process.argv.slice(2)
    .filter((arg) => !arg.startsWith("-") && /\.json$/i.test(arg));
  paths.push(...positionalJson);
  const changeSets = [];
  for (const filePath of paths) {
    const parsed = readJson(path.resolve(repoRoot, filePath));
    const fromFile = changeSetsFromJson(parsed);
    if (!fromFile.length) {
      throw new Error(`${filePath} did not contain a workup_change_set_v1 change set.`);
    }
    changeSets.push(...fromFile);
  }
  return changeSets;
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
  let loadedChangeSets = [];
  if (!snapshot) {
    loadedChangeSets = loadChangeSets();
    snapshot = loadLocalSnapshot(loadedChangeSets);
  }

  const exported = exportModuleEntriesFromSnapshot(snapshot, {
    includeDrafts: args.has("--include-drafts") || loadedChangeSets.length > 0
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
