import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  loadSupabaseEnvFiles
} from "../utils/supabase/env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadSupabaseEnvFiles({ cwd: repoRoot });

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fail(message, details = []) {
  console.error(message);
  for (const detail of details) console.error(`- ${detail}`);
  process.exitCode = 1;
}

const html = read("index.html");
const migrationPath = path.join(repoRoot, "supabase", "migrations", "202606110002_workup_author_assignments.sql");
assert.ok(existsSync(migrationPath), "Delegated author RLS migration is missing.");
assert.ok(html.includes("auth/v1/authorize"), "Google OAuth provider path should be present.");
assert.ok(!html.includes("grant_type=password"), "Password grant must not be present in the browser app.");
assert.ok(html.includes("loadWorkupStudioPermissions"), "Workup Studio must verify profile/assignment permissions after auth.");
assert.ok(html.includes("authorization: `Bearer ${workupStudioState.backend.accessToken}`"), "Workup Studio must use a user access token for REST calls.");
assert.ok(!html.includes("accessToken || workupStudioState.backend.anonKey"), "Publishable key must not be used as bearer auth.");

const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = getSupabaseServiceRoleKey();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();

const missing = [];
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
if (!accessToken) missing.push("SUPABASE_ACCESS_TOKEN, or run `npx supabase login`");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY for seeding/export verification");

if (missing.length) {
  fail("Supabase auth deployment is not ready on this machine.", [
    `Missing: ${missing.join(", ")}`,
    "Set credentials, then run:",
    "  npx supabase link --project-ref hajjuzpnlvpetsleuxwb",
    "  npx supabase db push",
    "  npm run import:medical-knowledge"
  ]);
} else {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["supabase", "projects", "list"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail("Supabase CLI credentials were provided but did not authenticate.", [
      (result.stderr || result.stdout || "").trim() || "Unknown Supabase CLI error",
      "Run `npx supabase login` or refresh SUPABASE_ACCESS_TOKEN."
    ]);
  } else {
    console.log("Supabase auth deployment credentials are present and CLI authentication works.");
    console.log("Next: npx supabase link --project-ref hajjuzpnlvpetsleuxwb && npx supabase db push");
  }
}
