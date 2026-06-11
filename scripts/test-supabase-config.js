import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseServiceConfig
} from "../utils/supabase/env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.dependencies["@supabase/supabase-js"], "Supabase JS client dependency should be installed.");
assert.ok(pkg.dependencies["@supabase/ssr"], "Supabase SSR helper dependency should be installed for a future Next.js migration.");
assert.equal(pkg.scripts["import:medical-knowledge"], "node scripts/import-medical-knowledge.js");
assert.equal(pkg.scripts["export:medical-knowledge"], "node scripts/export-medical-knowledge.js");

const envExample = read(".env.example");
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
]) {
  assert.ok(envExample.includes(key), `.env.example should document ${key}.`);
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://hajjuzpnlvpetsleuxwb.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
};
assert.equal(getSupabaseUrl(env), "https://hajjuzpnlvpetsleuxwb.supabase.co");
assert.equal(getSupabasePublishableKey(env), "sb_publishable_test");
assert.equal(hasSupabaseServiceConfig(env), false, "Public browser config must not be treated as service config.");
assert.equal(hasSupabaseServiceConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: "service-role" }), true);

const importScript = read("scripts/import-medical-knowledge.js");
assert.ok(importScript.includes("loadSupabaseEnvFiles"), "Import command should load ignored local env files.");
assert.ok(importScript.includes("createSupabaseServiceClient"), "Import command should use the shared service client.");

const exportScript = read("scripts/export-medical-knowledge.js");
assert.ok(exportScript.includes("loadSupabaseEnvFiles"), "Export command should load ignored local env files.");
assert.ok(exportScript.includes("createSupabaseServiceClient"), "Export command should use the shared service client.");
assert.ok(exportScript.includes('eq("review_status", "approved")'), "Export command should only pull approved change sets.");
assert.ok(exportScript.includes('eq("export_ready", true)'), "Export command should only pull export-ready change sets.");

const html = read("index.html");
assert.ok(html.includes("WORKUP_STUDIO_DEFAULT_BACKEND"), "Workup Studio should have public backend defaults.");
assert.ok(html.includes("https://hajjuzpnlvpetsleuxwb.supabase.co"), "Workup Studio should be prefilled with the configured Supabase project.");
assert.ok(html.includes("Publishable key"), "Workup Studio should use publishable-key wording.");
assert.ok(html.includes("https://*.supabase.co"), "CSP should allow Supabase REST/Auth calls.");
assert.ok(!html.includes("SUPABASE_SERVICE_ROLE_KEY"), "Browser app must not reference the service role key.");

const migration = read("supabase/migrations/202606110001_workup_authoring.sql");
for (const table of [
  "workup_author_profiles",
  "sources",
  "workups",
  "workup_sections",
  "workup_items",
  "pathway_trees",
  "pathway_nodes",
  "review_cases",
  "change_sets"
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `Migration should create ${table}.`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} should have RLS enabled.`);
}
for (const required of [
  "authors can draft their own change sets",
  "reviewers can approve exportable change sets",
  "change_sets_review_status_idx",
  "change_sets_source_ids_gin_idx"
]) {
  assert.ok(migration.includes(required), `Migration should include ${required}.`);
}

const docs = read("docs/supabase-workup-authoring.md");
assert.ok(docs.includes("npx supabase db push"), "Setup docs should explain how to deploy the migration.");
assert.ok(docs.includes("npm run import:medical-knowledge"), "Setup docs should explain how to seed from JSON.");
assert.ok(docs.includes("npm run export:medical-knowledge"), "Setup docs should explain how to export reviewed content.");

console.log("Supabase Workup Studio configuration checks passed.");
