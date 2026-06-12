import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
assert.equal(pkg.scripts["grant:workup-access"], "node scripts/grant-workup-access.js");
assert.equal(pkg.scripts["deploy:supabase-workup-authoring"], "node scripts/deploy-supabase-workup-authoring.js");

const envExample = read(".env.example");
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "WORKUP_STUDIO_AUTH_METHOD",
  "WORKUP_STUDIO_OAUTH_PROVIDER",
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID",
  "SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
  "WORKUP_STUDIO_REVIEWER_EMAIL"
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

const grantScript = read("scripts/grant-workup-access.js");
assert.ok(grantScript.includes("createSupabaseServiceClient"), "Grant command should use the service-role client.");
assert.ok(grantScript.includes("workup_author_assignments"), "Grant command should write delegated workup assignments.");
assert.ok(grantScript.includes("workup_author_profiles"), "Grant command should write author/reviewer profiles.");
assert.ok(grantScript.includes("No Supabase Auth user found"), "Grant command should require an existing Supabase Auth user.");

const readinessScript = read("scripts/check-supabase-auth-readiness.js");
assert.ok(readinessScript.includes("/auth/v1/settings"), "Readiness check should probe Supabase Auth settings.");
assert.ok(readinessScript.includes("Email magic-link auth"), "Readiness check should require Supabase Email magic-link auth.");
assert.ok(readinessScript.includes("create_user: false"), "Readiness check should require existing users for magic links.");
assert.ok(readinessScript.includes("PGRST205"), "Readiness check should detect missing Supabase authoring tables.");
assert.ok(readinessScript.includes("Anonymous publishable-key request returned rows"), "Readiness check should flag anonymous authoring-data exposure.");
assert.ok(readinessScript.includes("npm run deploy:supabase-workup-authoring"), "Readiness check should suggest the deploy command.");

const deployScript = read("scripts/deploy-supabase-workup-authoring.js");
assert.ok(deployScript.includes("supabase\", \"config\", \"push\""), "Deploy command should push Supabase auth config.");
assert.ok(deployScript.includes("supabase\", \"db\", \"push\""), "Deploy command should push Supabase migrations.");
assert.ok(deployScript.includes("--auth-method=magic-link|oauth"), "Deploy command should expose magic-link versus optional OAuth auth methods.");
assert.ok(deployScript.includes("email magic link"), "Deploy command should default to email magic-link config.");
assert.ok(deployScript.includes("SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID"), "Deploy command should still support GitHub OAuth provider secrets as an optional fallback.");
assert.ok(deployScript.includes("import:medical-knowledge"), "Deploy command should seed authoring tables.");
assert.ok(deployScript.includes("grant:workup-access"), "Deploy command should support reviewer grants.");
assert.ok(deployScript.includes("check:supabase-auth"), "Deploy command should finish with the readiness probe.");
assert.ok(existsSync(path.join(repoRoot, ".github", "workflows", "supabase-workup-authoring.yml")), "GitHub Actions workflow should exist for hosted Supabase deploys.");

const html = read("index.html");
assert.ok(html.includes("WORKUP_STUDIO_DEFAULT_BACKEND"), "Workup Studio should have public backend defaults.");
assert.ok(html.includes("https://hajjuzpnlvpetsleuxwb.supabase.co"), "Workup Studio should use the configured Supabase project.");
assert.ok(!html.includes("workupStudioSupabaseUrlInput"), "Workup Studio should not let users edit the Supabase project URL.");
assert.ok(!html.includes("workupStudioSupabaseAnonKeyInput"), "Workup Studio should not render an editable publishable key.");
assert.ok(!html.includes("workupStudioSaveBackendConfigButton"), "Workup Studio should not expose a backend config save button.");
assert.ok(!html.includes("workupStudioSupabasePasswordInput"), "Workup Studio should not render password auth.");
assert.ok(!html.includes("grant_type=password"), "Workup Studio should not use the password grant.");
assert.ok(html.includes("Send magic link"), "Workup Studio should use email magic-link auth.");
assert.ok(html.includes("/auth/v1/otp"), "Workup Studio should request Supabase email magic links.");
assert.ok(html.includes("create_user: false"), "Workup Studio should require existing Supabase Auth users for magic links.");
assert.ok(!html.includes("/auth/v1/settings"), "Workup Studio should not require social-provider settings before sign-in.");
assert.ok(!html.includes("auth/v1/authorize"), "Workup Studio should not require a social OAuth provider before sign-in.");
assert.ok(html.includes("Backend: Workup Studio Supabase"), "Workup Studio should explain that backend access is configured by the app.");
assert.ok(html.includes("workupStudioOpenEvidencePromptOutput"), "Workup Studio should expose generated OpenEvidence section prompts.");
assert.ok(html.includes("workup_section_update_v1"), "OpenEvidence prompt should request a section-scoped JSON schema.");
assert.ok(html.includes("workupStudioPublishImportButton"), "Workup Studio should expose save-and-publish for reviewer users.");
assert.ok(html.includes("loadWorkupStudioPermissions"), "Workup Studio should verify author/reviewer permissions after authentication.");
assert.ok(html.includes("https://*.supabase.co"), "CSP should allow Supabase REST/Auth calls.");
assert.ok(!html.includes("SUPABASE_SERVICE_ROLE_KEY"), "Browser app must not reference the service role key.");
assert.ok(html.includes("`${window.location.origin}${window.location.pathname || \"/\"}`"), "Magic-link redirect should use a stable callback URL instead of preserving arbitrary query state.");

const migration = readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => read(path.join("supabase", "migrations", fileName)))
  .join("\n\n");
for (const table of [
  "workup_author_profiles",
  "workup_author_assignments",
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
  "assigned authors can draft their own change sets",
  "can_edit_workup_content",
  "reviewers can maintain workup assignments",
  "reviewers can approve exportable change sets",
  "assigned authors can read workups",
  "assigned authors can read pathway nodes",
  "revoke execute on function public.can_edit_workup_content(text) from public",
  "grant execute on function public.can_edit_workup_content(text) to authenticated, service_role",
  "change_sets_review_status_idx",
  "change_sets_source_ids_gin_idx"
]) {
  assert.ok(migration.includes(required), `Migration should include ${required}.`);
}
const finalChangeSetReadPolicy = migration.slice(migration.lastIndexOf('create policy "authors can read relevant change sets"'));
assert.ok(finalChangeSetReadPolicy.includes("public.can_edit_workup_content(workup_id)"), "Final change-set read policy should require assignment/reviewer permission.");
assert.ok(!finalChangeSetReadPolicy.includes("or review_status = 'approved'"), "Final change-set read policy should not make approved changes globally readable.");

const docs = read("docs/supabase-workup-authoring.md");
assert.ok(docs.includes("npx supabase db push"), "Setup docs should explain how to deploy the migration.");
assert.ok(docs.includes("npm run deploy:supabase-workup-authoring"), "Setup docs should explain the one-command deployment path.");
assert.ok(docs.includes("Supabase Workup Authoring Deploy"), "Setup docs should mention the manual GitHub Actions backend deploy.");
assert.ok(docs.includes("npm run import:medical-knowledge"), "Setup docs should explain how to seed from JSON.");
assert.ok(docs.includes("npm run export:medical-knowledge"), "Setup docs should explain how to export reviewed content.");
assert.ok(docs.includes("npm run grant:workup-access"), "Setup docs should explain how to delegate Workup Studio access.");
assert.ok(docs.includes("workup_author_assignments"), "Setup docs should explain delegated workup assignments.");
assert.ok(docs.includes("Enable Magic Link"), "Setup docs should explain Magic Link setup.");
assert.ok(docs.includes("create_user: false"), "Setup docs should explain that browser magic links do not create new users.");

const supabaseConfig = read("supabase/config.toml");
assert.ok(supabaseConfig.includes("[auth.email]"), "Supabase config should declare Email auth.");
assert.ok(supabaseConfig.includes("enable_signup = false"), "Supabase signups should be disabled for controlled Workup Studio access.");
assert.ok(supabaseConfig.includes("[auth.external.google]"), "Supabase config should declare Google OAuth.");
assert.ok(supabaseConfig.includes("SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID"), "Google client ID should come from env.");
assert.ok(supabaseConfig.includes("SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET"), "Google client secret should come from env.");
assert.ok(supabaseConfig.includes("[auth.external.github]"), "Supabase config should declare GitHub OAuth.");
assert.ok(supabaseConfig.includes("SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID"), "GitHub client ID should come from env.");
assert.ok(supabaseConfig.includes("SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET"), "GitHub client secret should come from env.");
assert.ok(supabaseConfig.includes("enable_anonymous_sign_ins = false"), "Anonymous Supabase sign-ins should be disabled.");
assert.ok(supabaseConfig.includes("https://aaronge-2020.github.io/prerounding-checklist/?workupStudioOAuth=1"), "Supabase config should allow the deployed Workup Studio callback.");

console.log("Supabase Workup Studio configuration checks passed.");
