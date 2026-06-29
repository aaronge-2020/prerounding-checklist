import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const html = read("index.html");
const packageJson = JSON.parse(read("package.json"));
const exportScript = read("scripts/export-medical-knowledge.js");

assert.ok(html.includes("WORKUP_STUDIO_GITHUB_REPO"), "Workup Studio should have a configured GitHub proposal repo.");
assert.ok(html.includes("githubIssueBodyForChangeSet"), "Workup Studio should build a GitHub issue body from the latest change set.");
assert.ok(html.includes("githubIssueUrlForChangeSet"), "Workup Studio should build a prefilled GitHub issue URL.");
assert.ok(html.includes("workupStudioOpenGithubIssueButton"), "Workup Studio should expose an Open issue action.");
assert.ok(html.includes("workupStudioCopyGithubIssueButton"), "Workup Studio should expose a Copy issue body action.");
assert.ok(html.includes("workupStudioContributorInput"), "Workup Studio should let contributors label their proposal.");
assert.ok(html.includes("Proposal path: GitHub Issues/PRs"), "Workup Studio should describe the GitHub proposal path.");
assert.ok(html.includes("workup_change_set_v1"), "GitHub proposals should carry the existing change-set schema.");
assert.ok(html.includes("No patient identifiers, chart text, screenshots, or PHI are included."), "Issue body should include the no-PHI reviewer checklist.");

for (const removed of [
  "supabase",
  "magic link",
  "grant_type=pkce",
  "/auth/v1/otp",
  "workupStudioSupabase",
  "WORKUP_STUDIO_DEFAULT_BACKEND"
]) {
  assert.equal(html.toLowerCase().includes(removed.toLowerCase()), false, `index.html should not contain removed backend term: ${removed}`);
}

assert.equal(packageJson.scripts["snapshot:workup-authoring"], "node scripts/snapshot-workup-authoring.js");
assert.equal(packageJson.scripts["export:medical-knowledge"], "node scripts/export-medical-knowledge.js");
assert.equal(packageJson.scripts["test:workup-studio-github"], "node tests/test-workup-studio-github.js");
assert.equal(packageJson.dependencies["@supabase/supabase-js"], undefined);
assert.equal(packageJson.dependencies["@supabase/ssr"], undefined);

assert.ok(exportScript.includes("--change-set"), "Export script should accept downloaded change-set JSON files.");
assert.ok(exportScript.includes("workup_change_set_v1"), "Export script should validate GitHub proposal change-set schema.");
assert.equal(exportScript.includes("createSupabaseServiceClient"), false, "Export script should not query a hosted backend.");

for (const removedPath of [
  "supabase",
  "utils/supabase",
  "docs/supabase-workup-authoring.md",
  ".github/workflows/supabase-workup-authoring.yml",
  ".github/workflows/supabase-public-catalog-readiness.yml"
]) {
  assert.equal(existsSync(path.join(repoRoot, removedPath)), false, `${removedPath} should be removed.`);
}

console.log("GitHub Workup Studio proposal checks passed.");
