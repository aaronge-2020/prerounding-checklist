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
assert.equal(pkg.scripts["check:supabase-public"], "node scripts/check-supabase-auth-readiness.js --public-only");
assert.equal(pkg.scripts["test:supabase-catalog-empty"], "node scripts/test-supabase-catalog-empty.js");
assert.ok(pkg.scripts["test:clinical"].includes("test:supabase-catalog-empty"), "Clinical test suite should cover empty public Supabase catalog fallback.");

const envExample = read(".env.example");
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
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
assert.ok(readinessScript.includes("Public catalog request returned rows"), "Readiness check should allow public reviewed catalog reads.");
assert.ok(readinessScript.includes("protected public.${table}"), "Readiness check should still flag anonymous protected authoring-data exposure.");
assert.ok(readinessScript.includes("returned draft workups"), "Readiness check should flag anonymous draft workup exposure.");
assert.ok(readinessScript.includes("Public catalog did not expose draft workups"), "Readiness check should verify public catalog RLS filters draft workups.");
assert.ok(readinessScript.includes("Active reviewed public catalog workup probe"), "Readiness check should probe the app-shaped active reviewed workup catalog.");
assert.ok(readinessScript.includes("Public catalog returned no active reviewed workups"), "Readiness check should fail when no active reviewed server workups are available.");
assert.ok(readinessScript.includes("fresh patient devices cannot build server workups"), "Readiness check should fail when reviewed workups have no readable sections.");
assert.ok(readinessScript.includes("Public catalog source probe returned no rows"), "Readiness check should fail when referenced public catalog sources are unreadable.");
assert.ok(readinessScript.includes("browserSupabaseDefaultsFromHtml"), "Readiness check should use browser defaults when env credentials are absent.");
assert.ok(readinessScript.includes("--public-only"), "Readiness check should support credential-free public deployment probes.");
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
const deployWorkflow = read(".github/workflows/supabase-workup-authoring.yml");
assert.ok(deployWorkflow.includes("push:"), "Supabase deploy workflow should run automatically for main-branch server catalog changes.");
assert.ok(deployWorkflow.includes("branches:") && deployWorkflow.includes("- main"), "Supabase deploy workflow should target main pushes.");
for (const workflowPath of [
  "supabase/**",
  "medical-knowledge/**",
  "scripts/import-medical-knowledge.js",
  "scripts/deploy-supabase-workup-authoring.js",
  "utils/supabase/**"
]) {
  assert.ok(deployWorkflow.includes(workflowPath), `Supabase deploy workflow should watch ${workflowPath}.`);
}
assert.ok(deployWorkflow.includes("inputs.auth_method || 'magic-link'"), "Push-triggered Supabase deploys should default to magic-link auth without manual inputs.");
assert.ok(deployWorkflow.includes("inputs.oauth_provider || 'google'"), "Push-triggered Supabase deploys should default OAuth provider inputs safely.");
assert.ok(deployWorkflow.includes("inputs.reviewer_email || ''"), "Push-triggered Supabase deploys should not require a reviewer email input.");
assert.ok(deployWorkflow.includes("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}"), "GitHub deploy workflow should pass through SUPABASE_DB_URL when projects use direct DB URLs instead of passwords.");
assert.ok(deployWorkflow.includes("concurrency:"), "Supabase deploy workflow should prevent overlapping catalog deploys.");
assert.ok(deployWorkflow.includes("group: supabase-workup-authoring-${{ github.ref }}"), "Supabase deploy workflow should serialize deploys by branch/ref.");
assert.ok(deployWorkflow.includes("cancel-in-progress: true"), "Supabase deploy workflow should cancel stale deploys so the newest workup catalog wins.");
assert.ok(deployWorkflow.includes("Check deployment secrets"), "Supabase deploy workflow should fail fast when required GitHub secrets are missing.");
assert.ok(deployWorkflow.includes('missing+=("SUPABASE_ACCESS_TOKEN")'), "Supabase deploy preflight should require the CLI access token secret.");
assert.ok(deployWorkflow.includes('missing+=("SUPABASE_SERVICE_ROLE_KEY")'), "Supabase deploy preflight should require the service-role seed/import secret.");
assert.ok(deployWorkflow.includes('missing+=("SUPABASE_DB_PASSWORD or SUPABASE_DB_URL")'), "Supabase deploy preflight should require one database credential secret.");
assert.ok(deployWorkflow.includes("Supabase Workup Studio deploy is missing required GitHub secret"), "Supabase deploy preflight should print an actionable missing-secret message.");

assert.ok(existsSync(path.join(repoRoot, ".github", "workflows", "supabase-public-catalog-readiness.yml")), "GitHub Actions workflow should exist for credential-free public catalog readiness.");
const publicCatalogWorkflow = read(".github/workflows/supabase-public-catalog-readiness.yml");
assert.ok(publicCatalogWorkflow.includes("schedule:"), "Public catalog readiness workflow should run on a schedule.");
assert.ok(publicCatalogWorkflow.includes("workflow_dispatch:"), "Public catalog readiness workflow should support manual checks.");
assert.ok(publicCatalogWorkflow.includes("npm run check:supabase-public"), "Public catalog readiness workflow should run the credential-free public readiness probe.");
assert.ok(!publicCatalogWorkflow.includes("secrets."), "Public catalog readiness workflow should not require GitHub secrets.");

const html = read("index.html");
assert.ok(html.includes("WORKUP_STUDIO_DEFAULT_BACKEND"), "Workup Studio should have public backend defaults.");
assert.ok(html.includes("Public Supabase catalog returned no reviewed workups"), "Public catalog hydration should fail closed when the server has no reviewed workups.");
assert.ok(html.includes("using bundled local workups"), "Empty public catalog should visibly fall back to bundled local workups.");
assert.ok(html.includes("PUBLIC_WORKUP_CATALOG_CACHE_KEY"), "Public server catalog hydration should keep a last-good reviewed catalog cache for offline or failed refreshes.");
assert.ok(html.includes("last downloaded public Supabase workup"), "Workup Studio should explain when it is using cached public server workups.");
assert.ok(html.includes("https://hajjuzpnlvpetsleuxwb.supabase.co"), "Workup Studio should use the configured Supabase project.");
assert.ok(!html.includes("workupStudioSupabaseUrlInput"), "Workup Studio should not let users edit the Supabase project URL.");
assert.ok(!html.includes("workupStudioSupabaseAnonKeyInput"), "Workup Studio should not render an editable publishable key.");
assert.ok(!html.includes("workupStudioSaveBackendConfigButton"), "Workup Studio should not expose a backend config save button.");
assert.ok(!html.includes("workupStudioSupabasePasswordInput"), "Workup Studio should not render password auth.");
assert.ok(!html.includes("grant_type=password"), "Workup Studio should not use the password grant.");
assert.ok(html.includes("Send magic link"), "Workup Studio should use email magic-link auth.");
assert.ok(html.includes("/auth/v1/otp"), "Workup Studio should request Supabase email magic links.");
assert.ok(html.includes("create_user: false"), "Workup Studio should require existing Supabase Auth users for magic links.");
assert.ok(html.includes("code_challenge"), "Workup Studio should send a PKCE code challenge for email magic links.");
assert.ok(html.includes("grant_type=pkce"), "Workup Studio should exchange PKCE auth codes on return.");
assert.ok(!html.includes("/auth/v1/settings"), "Workup Studio should not require social-provider settings before sign-in.");
assert.ok(!html.includes("auth/v1/authorize"), "Workup Studio should not require a social OAuth provider before sign-in.");
assert.ok(html.includes("Backend: Workup Studio Supabase"), "Workup Studio should explain that backend access is configured by the app.");
assert.ok(html.includes("workupStudioOpenEvidencePromptOutput"), "Workup Studio should expose generated OpenEvidence section prompts.");
assert.ok(html.includes("workup_section_update_v1"), "OpenEvidence prompt should request a section-scoped JSON schema.");
assert.ok(html.includes("workupStudioPublishImportButton"), "Workup Studio should expose save-and-publish for reviewer users.");
assert.ok(html.includes("loadWorkupStudioPermissions"), "Workup Studio should verify author/reviewer permissions after authentication.");
assert.ok(html.includes("workupCatalogSupabaseRequest"), "Patient-facing devices should load the reviewed Supabase catalog with a read-only request path.");
assert.ok(html.includes("function supabaseWorkupsCatalogPath"), "Patient-facing catalog loads should build a reviewed-workup REST path.");
assert.ok(html.includes("function supabaseWorkupSectionsCatalogPath"), "Patient-facing catalog loads should build a workup-scoped section REST path.");
assert.ok(html.includes("function supabaseSourcesCatalogPath"), "Patient-facing catalog loads should build a source-scoped REST path.");
assert.ok(html.includes("function sourceIdsForCatalogRows"), "Public catalog hydration should request only sources referenced by reviewed workups and sections.");
assert.ok(html.includes("status=in.(mvp,active,published,reviewed)"), "Public patient catalog requests should filter to active reviewed server workups.");
assert.ok(html.includes("function publicCatalogWorkupStatus"), "Reviewer publish should normalize canonical workups into a public-catalog status.");
assert.ok(html.includes("status: publicCatalogWorkupStatus(currentWorkupStatus)"), "Publishing a reviewed draft should patch the workup status so fresh patient devices can load it.");
assert.ok(html.includes("function verifyPublishedWorkupPublicCatalog"), "Reviewer publish should verify the read-only public catalog path used by fresh devices.");
assert.ok(html.includes("Public catalog verification failed"), "Reviewer publish should surface public-catalog visibility failures distinctly.");
assert.ok(html.includes("await verifyPublishedWorkupPublicCatalog(changeSet.workupId || changeSet.workup_id)"), "Publishing should not mark a draft synced until the public catalog verification runs.");
assert.ok(html.includes("Public catalog verified for fresh devices"), "Successful reviewer publish should tell the reviewer the fresh-device catalog path was verified.");
assert.ok(html.includes("publicWorkupCatalogConfigured"), "The app should support public reviewed-catalog hydration before Workup Studio sign-in.");
assert.ok(html.includes("hydratePublicWorkupCatalogOnStartup"), "Fresh patient devices should explicitly hydrate the public reviewed catalog on app startup.");
assert.ok(html.includes("publicOnly"), "Public catalog hydration should be able to bypass stale Workup Studio auth tokens.");
assert.ok(html.includes("workupStudioCatalogHydrationPromises"), "Public startup catalog reads and authenticated reviewer refreshes should not share one in-flight promise.");
assert.ok(html.includes("accessMode === \"public\" && supabaseWorkupCatalog.accessMode === \"authenticated\""), "Delayed public catalog reads should not overwrite authenticated reviewer catalog hydration.");
assert.ok(html.includes("refreshSupabaseWorkupCatalogForCurrentSession"), "Open patient devices should refresh Supabase workups after returning online or resuming the tab.");
assert.ok(html.includes('addEventListener("online"'), "The app should refresh the reviewed server catalog when the device returns online.");
assert.ok(html.includes('addEventListener("visibilitychange"'), "The app should refresh stale server workups when clinicians resume the app.");
assert.ok(html.includes("cache: \"no-store\""), "Supabase catalog reads should avoid cached stale server workups.");
assert.ok(html.includes("checklistWorkupSignature"), "Built patient checklists should record the exact workup catalog version used.");
assert.ok(html.includes("isChecklistStaleForCurrentWorkup"), "Patient workspaces should detect checklists made from superseded workups.");
assert.ok(html.includes("Rebuild from server workup"), "Stale checklists should guide clinicians to rebuild from the current server workup.");
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
  "public can read reviewed workups",
  "public can read reviewed workup sections",
  "public can read reviewed sources",
  "reviewers can approve exportable change sets",
  "assigned authors can read workups",
  "assigned authors can read pathway nodes",
  "revoke execute on function public.can_edit_workup_content(text) from public",
  "grant execute on function public.can_edit_workup_content(text) to authenticated, service_role",
  "workups_public_catalog_status_title_idx",
  "workup_sections_public_catalog_order_idx",
  "workup_sections_source_ids_gin_idx",
  "change_sets_review_status_idx",
  "change_sets_source_ids_gin_idx"
]) {
  assert.ok(migration.includes(required), `Migration should include ${required}.`);
}
const finalChangeSetReadPolicy = migration.slice(migration.lastIndexOf('create policy "authors can read relevant change sets"'));
assert.ok(finalChangeSetReadPolicy.includes("public.can_edit_workup_content(workup_id)"), "Final change-set read policy should require assignment/reviewer permission.");
assert.ok(!finalChangeSetReadPolicy.includes("or review_status = 'approved'"), "Final change-set read policy should not make approved changes globally readable.");
const finalPublicWorkupPolicy = migration.slice(migration.lastIndexOf('create policy "public can read reviewed workups"'));
assert.ok(finalPublicWorkupPolicy.includes("status in ('mvp', 'active', 'published', 'reviewed')"), "Final public workup read policy should expose only reviewed/active canonical workups.");
assert.ok(!/public can read reviewed workups[\s\S]*?using\s*\(\s*true\s*\)/i.test(finalPublicWorkupPolicy), "Final public workup read policy must not expose every workup row.");
const finalPublicSectionPolicy = migration.slice(migration.lastIndexOf('create policy "public can read reviewed workup sections"'));
assert.ok(finalPublicSectionPolicy.includes("workup.status in ('mvp', 'active', 'published', 'reviewed')"), "Final public section read policy should expose only sections for reviewed/active workups.");
assert.ok(!/public can read reviewed workup sections[\s\S]*?using\s*\(\s*true\s*\)/i.test(finalPublicSectionPolicy), "Final public section read policy must not expose every section row.");
const finalPublicSourcePolicy = migration.slice(migration.lastIndexOf('create policy "public can read reviewed sources"'));
assert.ok(finalPublicSourcePolicy.includes("workup.status in ('mvp', 'active', 'published', 'reviewed')"), "Final public source read policy should expose only sources referenced by reviewed/active workups.");
assert.ok(!/public can read reviewed sources[\s\S]*?using\s*\(\s*true\s*\)/i.test(finalPublicSourcePolicy), "Final public source read policy must not expose every source row.");

const docs = read("docs/supabase-workup-authoring.md");
assert.ok(docs.includes("npx supabase db push"), "Setup docs should explain how to deploy the migration.");
assert.ok(docs.includes("npm run deploy:supabase-workup-authoring"), "Setup docs should explain the one-command deployment path.");
assert.ok(docs.includes("npm run check:supabase-public"), "Setup docs should explain the credential-free public readiness check.");
assert.ok(docs.includes("automatically run the deploy workflow"), "Setup docs should explain automatic GitHub Actions backend deploys on relevant main pushes.");
assert.ok(docs.includes("Supabase Workup Authoring Deploy"), "Setup docs should mention the manual GitHub Actions backend deploy.");
assert.ok(docs.includes("SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL"), "Setup docs should allow either DB password or direct DB URL for hosted deploys.");
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
