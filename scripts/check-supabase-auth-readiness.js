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

async function fetchSupabaseText(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return {
      ok: response.ok,
      status: response.status,
      location: response.headers.get("location") || "",
      text: await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      location: "",
      text: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkPublicSupabaseReadiness({ supabaseUrl, publishableKey }) {
  const issues = [];
  const notes = [];
  if (!supabaseUrl || !publishableKey) return { issues, notes };

  const headers = {
    apikey: publishableKey,
    authorization: `Bearer ${publishableKey}`,
    "user-agent": "prerounding-checklist-readiness"
  };
  const redirectTo = encodeURIComponent("https://aaronge-2020.github.io/prerounding-checklist/?workupStudioOAuth=1");
  const oauth = await fetchSupabaseText(`${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`, {
    headers: { apikey: publishableKey, "user-agent": "prerounding-checklist-readiness" },
    redirect: "manual"
  });
  if (oauth.status >= 300 && oauth.status < 400 && oauth.location) {
    notes.push("Google OAuth authorize endpoint redirects successfully.");
  } else {
    const detail = oauth.text.slice(0, 240) || `HTTP ${oauth.status}`;
    issues.push(`Google OAuth is not accepting authorize requests: ${detail}`);
  }

  const tableChecks = [
    ["workup_author_profiles", "user_id"],
    ["workup_author_assignments", "user_id"],
    ["workups", "id"],
    ["change_sets", "id"]
  ];
  for (const [table, column] of tableChecks) {
    const result = await fetchSupabaseText(`${supabaseUrl}/rest/v1/${table}?select=${column}&limit=1`, { headers });
    if (/PGRST205|Could not find the table|schema cache/i.test(result.text)) {
      issues.push(`Missing Supabase table or stale schema cache: public.${table}`);
      continue;
    }
    if (result.status === 200) {
      const text = result.text.trim();
      if (text && text !== "[]") {
        issues.push(`Anonymous publishable-key request returned rows from public.${table}; check RLS before shipping.`);
      } else {
        notes.push(`public.${table} exists and anonymous read returned no rows.`);
      }
      continue;
    }
    if (result.status === 401 || result.status === 403) {
      notes.push(`public.${table} exists and anonymous read is blocked with HTTP ${result.status}.`);
      continue;
    }
    issues.push(`Unexpected public.${table} probe response: HTTP ${result.status} ${result.text.slice(0, 160)}`);
  }

  return { issues, notes };
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
const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = getSupabaseServiceRoleKey();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();

const missing = [];
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
if (!accessToken) missing.push("SUPABASE_ACCESS_TOKEN, or run `npx supabase login`");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY for seeding/export verification");

const publicReadiness = await checkPublicSupabaseReadiness({ supabaseUrl, publishableKey });
const deploymentIssues = [
  ...missing.map((key) => `Missing local credential: ${key}`),
  ...publicReadiness.issues
];

if (deploymentIssues.length) {
  fail("Supabase auth deployment is not ready.", [
    ...deploymentIssues,
    ...publicReadiness.notes,
    "Set credentials, enable or provide Google OAuth config, then run:",
    "  npm run deploy:supabase-workup-authoring -- --reviewer-email=reviewer@example.com",
    "Manual fallback:",
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
