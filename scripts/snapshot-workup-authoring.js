import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkupAuthoringSnapshot,
  validateAuthoringSnapshotNoPatientData
} from "../workup-authoring.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function loadSourceKnowledge() {
  const manifest = readJson("medical-knowledge/manifest.json");
  const sourceRegistry = readJson(manifest.source_registry || "medical-knowledge/source-registry.json");
  const moduleEntries = (manifest.complaint_modules || []).map((modulePath) => ({
    filePath: modulePath,
    envelope: readJson(modulePath)
  }));
  return { manifest, sourceRegistry, moduleEntries };
}

function outputPathForSnapshot() {
  const explicit = argValue("--snapshot") || argValue("--out");
  if (explicit) return path.resolve(repoRoot, explicit);
  return path.join(repoRoot, "reports", "workup-authoring-snapshot-latest.json");
}

function main() {
  const snapshot = buildWorkupAuthoringSnapshot(loadSourceKnowledge());
  const privacyAudit = validateAuthoringSnapshotNoPatientData(snapshot);
  if (!privacyAudit.ok) {
    throw new Error(privacyAudit.issues.join("\n"));
  }

  const outPath = outputPathForSnapshot();
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Prepared Workup Studio authoring snapshot: ${path.relative(repoRoot, outPath)}`);
  console.log(`Rows: ${snapshot.workups.length} workups, ${snapshot.workup_items.length} items, ${snapshot.pathway_nodes.length} pathway nodes.`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
