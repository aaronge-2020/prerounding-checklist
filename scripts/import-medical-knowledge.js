import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkupAuthoringSnapshot,
  validateAuthoringSnapshotNoPatientData
} from "../workup-authoring.js";
import { loadSupabaseEnvFiles, hasSupabaseServiceConfig } from "../utils/supabase/env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadSupabaseEnvFiles({ cwd: repoRoot });
const args = new Set(process.argv.slice(2));

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
  const explicit = argValue("--snapshot");
  if (explicit) return path.resolve(repoRoot, explicit);
  return path.join(repoRoot, "reports", "workup-authoring-import-latest.json");
}

async function supabaseRequest(table, rows, onConflict = "id") {
  if (!rows.length) return;
  const { createSupabaseServiceClient } = await import("../utils/supabase/node.js");
  const supabase = createSupabaseServiceClient();
  const chunkSize = 250;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`Supabase import failed for ${table}: ${error.message}`);
  }
}

async function seedSupabase(snapshot) {
  await supabaseRequest("sources", snapshot.sources, "source_id");
  await supabaseRequest("workups", snapshot.workups, "id");
  await supabaseRequest("workup_sections", snapshot.workup_sections, "workup_id,section_key");
  await supabaseRequest("workup_items", snapshot.workup_items, "workup_id,group_key,item_id");
  await supabaseRequest("pathway_trees", snapshot.pathway_trees, "workup_id,section_key");
  await supabaseRequest("pathway_nodes", snapshot.pathway_nodes, "tree_id,node_id");
  await supabaseRequest("review_cases", snapshot.review_cases, "workup_id,case_type,case_id");
}

async function main() {
  const source = loadSourceKnowledge();
  const snapshot = buildWorkupAuthoringSnapshot(source);
  const privacyAudit = validateAuthoringSnapshotNoPatientData(snapshot);
  if (!privacyAudit.ok) {
    throw new Error(privacyAudit.issues.join("\n"));
  }

  const dryRun = args.has("--dry-run")
    || args.has("--local")
    || !hasSupabaseServiceConfig();

  if (dryRun) {
    const outPath = outputPathForSnapshot();
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Prepared Workup Studio authoring snapshot: ${path.relative(repoRoot, outPath)}`);
    console.log(`Rows: ${snapshot.workups.length} workups, ${snapshot.workup_items.length} items, ${snapshot.pathway_nodes.length} pathway nodes.`);
    console.log("Set SUPABASE_SERVICE_ROLE_KEY to seed Supabase directly; .env.local can provide the project URL.");
    return;
  }

  await seedSupabase(snapshot);
  console.log(`Seeded Supabase Workup Studio authoring tables for ${snapshot.workups.length} workups.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
