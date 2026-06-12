import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const html = read("index.html");

assert.ok(html.includes('id="workupStudioLoadBackendDraftsButton"') && html.includes("workupStudioLoadBackendDraftsButton.disabled = !workupStudioBackendSignedIn()"), "Load drafts must be disabled before auth/permission checks.");
assert.ok(html.includes('id="workupStudioPublishImportButton" type="button" disabled'), "Publish must be disabled before reviewer auth.");
assert.ok(html.includes('id="workupStudioSignOutButton" type="button" hidden'), "Sign out should be hidden before auth.");
assert.ok(html.includes("Continue with Google"), "Workup Studio should use Google OAuth as the primary sign-in path.");
assert.ok(html.includes("WORKUP_STUDIO_OAUTH_PROVIDER = \"google\""), "Google should be the configured OAuth provider.");
assert.ok(html.includes("auth/v1/authorize"), "Workup Studio should start Supabase OAuth through the authorize endpoint.");
assert.ok(html.includes("captureWorkupStudioOAuthRedirect"), "Workup Studio should capture Supabase OAuth redirects.");
assert.ok(html.includes("Google OAuth is not enabled"), "Provider-not-enabled errors should be understandable.");
assert.ok(!html.includes("grant_type=password"), "Browser app must not use Supabase password grant.");
assert.ok(!html.includes("workupStudioSupabasePasswordInput"), "Workup Studio must not ask for a password.");
assert.ok(!html.includes("workupStudioSupabaseUrlInput"), "Workup Studio must not expose editable Supabase project URL.");
assert.ok(!html.includes("workupStudioSupabaseAnonKeyInput"), "Workup Studio must not expose editable publishable key.");
assert.ok(!html.includes("workupStudioSaveBackendConfigButton"), "Workup Studio must not expose a backend config save button.");
assert.ok(html.includes("ensureWorkupStudioBackendConfig"), "Sign-in should use the configured backend only.");
assert.ok(html.includes("function workupStudioBackendAuthenticated()"), "Auth state must distinguish raw session from permissioned connection.");
assert.ok(html.includes("function workupStudioBackendSignedIn()"), "Auth state must require permission before backend connection.");
assert.ok(html.includes("function loadWorkupStudioPermissions()"), "Sign-in must verify Workup Studio permissions.");
assert.ok(html.includes("workup_author_profiles?select=role,display_name"), "Permission check must read author profile.");
assert.ok(html.includes("workup_author_assignments?select=workup_id,role"), "Permission check must read workup assignments.");
assert.ok(html.includes("This signed-in account has no Workup Studio assignment"), "Unassigned users must be denied explicitly.");
assert.ok(html.includes("authorization: `Bearer ${workupStudioState.backend.accessToken}`"), "REST calls must use a real user access token.");
assert.ok(!html.includes("authorization: `Bearer ${workupStudioState.backend.accessToken || workupStudioState.backend.anonKey}`"), "REST calls must not fall back to publishable key auth.");
assert.ok(html.includes('if (!workupStudioBackendAuthenticated()) throw new Error("Sign in before connecting to Supabase.")'), "REST calls must require authentication.");
assert.ok(html.includes('if (requirePermission && !workupStudioBackendSignedIn()) throw new Error("This account does not have Workup Studio permission.")'), "REST calls must require verified permission by default.");
assert.ok(html.includes('if (!workupStudioCanEditWorkup(workupId)) throw new Error("This account is not assigned to edit this workup.")'), "Draft sync must require workup assignment.");
assert.ok(html.includes("if (!workupStudioCanReview())"), "Publish must require reviewer/admin profile.");
assert.ok(html.includes("canReview = role === \"reviewer\" || role === \"admin\""), "Reviewer status must come from profile role.");
assert.ok(html.includes("canReview: false") && html.includes("permissionChecked: false"), "Sign-out/clear paths must clear cached permissions.");
assert.ok(html.includes("sessionValidatedAt: \"\""), "Saved sessions should require fresh validation before permissions unlock.");
assert.ok(html.includes("function ensureWorkupStudioBackendSession()"), "Opening Workup Studio should revalidate saved Supabase sessions.");
assert.ok(html.includes("Saved Supabase session needs permission recheck"), "UI should not present cached sessions as connected before revalidation.");
assert.ok(html.includes("Reviewer publish locked"), "Editor publish controls should render locked by default.");
assert.ok(!html.includes("marked approved locally"), "Workup Studio must not present local-only approval as a real approval path.");

const migrationSql = readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => read(path.join("supabase", "migrations", fileName)))
  .join("\n\n");

function finalPolicyMap(sql) {
  const policies = new Map();
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/)) {
    const normalized = statement.trim();
    if (!normalized) continue;
    const dropMatch = normalized.match(/drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+public\.([a-z_]+)/i);
    if (dropMatch) {
      policies.delete(`${dropMatch[2]}.${dropMatch[1]}`);
      continue;
    }
    const createMatch = normalized.match(/create\s+policy\s+"([^"]+)"\s+on\s+public\.([a-z_]+)([\s\S]*)/i);
    if (createMatch) {
      policies.set(`${createMatch[2]}.${createMatch[1]}`, normalized);
    }
  }
  return policies;
}

for (const required of [
  "create table if not exists public.workup_author_assignments",
  "create or replace function public.can_edit_workup_content",
  'drop policy if exists "users can read workups"',
  'create policy "assigned authors can read workups"',
  'drop policy if exists "authors can draft their own change sets"',
  'create policy "assigned authors can draft their own change sets"',
  'drop policy if exists "reviewers can insert reviewed change sets"',
  'with check (public.can_review_workup_content())',
  "revoke execute on function public.current_workup_author_role() from public",
  "revoke execute on function public.can_review_workup_content() from public",
  "revoke execute on function public.can_edit_workup_content(text) from public",
  "grant execute on function public.can_edit_workup_content(text) to authenticated, service_role"
]) {
  assert.ok(migrationSql.includes(required), `RLS migration should include ${required}.`);
}

const finalReadPolicy = migrationSql.slice(migrationSql.lastIndexOf('create policy "authors can read relevant change sets"'));
assert.ok(finalReadPolicy.includes("public.can_edit_workup_content(workup_id)"), "Final change-set read policy must require workup permission.");
assert.ok(!finalReadPolicy.includes("review_status = 'approved'"), "Final change-set read policy must not expose approved rows globally.");
assert.ok(!finalReadPolicy.includes("using (true)"), "Final change-set read policy must not use permissive true policy.");

const finalPolicies = finalPolicyMap(migrationSql);
for (const [policyKey, policySql] of finalPolicies) {
  assert.ok(!/\bto\s+anon\b/i.test(policySql), `Final policy must not grant anon access: ${policyKey}`);
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(policySql), `Final policy must not use broad using(true): ${policyKey}`);
  assert.ok(!/review_status\s*=\s*'approved'/i.test(policySql), `Final policy must not expose approved content globally: ${policyKey}`);
  assert.ok(!/public\.can_review_workup_content\(\)\s+or\s+author_id\s*=\s*auth\.uid\(\)/i.test(policySql), `Final policy must not combine reviewer insert with author bypass: ${policyKey}`);
}

for (const removedPolicy of [
  "sources.users can read reviewed authoring content",
  "workups.users can read workups",
  "workup_sections.users can read workup sections",
  "workup_items.users can read workup items",
  "pathway_trees.users can read pathway trees",
  "pathway_nodes.users can read pathway nodes",
  "review_cases.users can read review cases"
]) {
  assert.ok(!finalPolicies.has(removedPolicy), `Final RLS policy should have been replaced: ${removedPolicy}`);
}

for (const requiredFinalPolicy of [
  "sources.assigned authors can read relevant sources",
  "workups.assigned authors can read workups",
  "workup_sections.assigned authors can read workup sections",
  "workup_items.assigned authors can read workup items",
  "pathway_trees.assigned authors can read pathway trees",
  "pathway_nodes.assigned authors can read pathway nodes",
  "review_cases.assigned authors can read review cases",
  "change_sets.assigned authors can draft their own change sets",
  "change_sets.assigned authors can update unapproved own change sets",
  "change_sets.reviewers can insert reviewed change sets"
]) {
  assert.ok(finalPolicies.has(requiredFinalPolicy), `Final RLS policy is missing: ${requiredFinalPolicy}`);
}

console.log("Workup Studio auth contract checks passed.");
