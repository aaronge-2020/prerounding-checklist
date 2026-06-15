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

function browserSupabaseDefaultsFromHtml(html = "") {
  const backendBlock = html.match(/WORKUP_STUDIO_DEFAULT_BACKEND\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/)?.[1] || "";
  return {
    url: backendBlock.match(/url:\s*"([^"]+)"/)?.[1] || "",
    publishableKey: backendBlock.match(/publishableKey:\s*"([^"]+)"/)?.[1] || ""
  };
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
  const settings = await fetchSupabaseText(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey, "user-agent": "prerounding-checklist-readiness" }
  });
  if (!settings.ok) {
    issues.push(`Unable to read Supabase Auth settings: HTTP ${settings.status} ${settings.text.slice(0, 180)}`);
  } else {
    try {
      const payload = JSON.parse(settings.text || "{}");
      const external = payload.external && typeof payload.external === "object" ? payload.external : {};
      if (external.email === true || payload.email === true) {
        notes.push("Supabase Email magic-link auth is enabled.");
      } else {
        issues.push("Supabase Email magic-link auth is disabled. Enable the Email provider in Supabase Auth.");
      }
    } catch {
      issues.push(`Unable to parse Supabase Auth settings: ${settings.text.slice(0, 180)}`);
    }
  }

  const tableChecks = [
    ["workup_author_profiles", "user_id"],
    ["workup_author_assignments", "user_id"],
    ["sources", "id"],
    ["workups", "id"],
    ["workup_sections", "workup_id"],
    ["workup_items", "workup_id"],
    ["pathway_trees", "workup_id"],
    ["pathway_nodes", "tree_id"],
    ["review_cases", "workup_id"],
    ["change_sets", "id"]
  ];
  const publicCatalogTables = new Set(["sources", "workups", "workup_sections"]);
  for (const [table, column] of tableChecks) {
    const result = await fetchSupabaseText(`${supabaseUrl}/rest/v1/${table}?select=${column}&limit=1`, { headers });
    if (/PGRST205|Could not find the table|schema cache/i.test(result.text)) {
      issues.push(`Missing Supabase table or stale schema cache: public.${table}`);
      continue;
    }
    if (result.status === 200) {
      const text = result.text.trim();
      if (publicCatalogTables.has(table)) {
        notes.push(text && text !== "[]"
          ? `Public catalog request returned rows from public.${table}.`
          : `public.${table} exists and public catalog read returned no rows.`);
      } else if (text && text !== "[]") {
        issues.push(`Anonymous publishable-key request returned rows from protected public.${table}; check RLS before shipping.`);
      } else {
        notes.push(`public.${table} exists and protected anonymous read returned no rows.`);
      }
      continue;
    }
    if (result.status === 401 || result.status === 403) {
      if (publicCatalogTables.has(table)) {
        issues.push(`Public catalog table public.${table} is not readable with the publishable key; fresh devices cannot load reviewed workup updates.`);
      } else {
        notes.push(`public.${table} exists and anonymous read is blocked with HTTP ${result.status}.`);
      }
      continue;
    }
    issues.push(`Unexpected public.${table} probe response: HTTP ${result.status} ${result.text.slice(0, 160)}`);
  }

  return { issues, notes };
}

const html = read("index.html");
const publicOnly = process.argv.includes("--public-only");
const browserDefaults = browserSupabaseDefaultsFromHtml(html);
const migrationPath = path.join(repoRoot, "supabase", "migrations", "202606110002_workup_author_assignments.sql");
assert.ok(existsSync(migrationPath), "Delegated author RLS migration is missing.");
assert.ok(html.includes("/auth/v1/otp"), "Supabase email magic-link path should be present.");
assert.ok(html.includes("create_user: false"), "Workup Studio must not let browser magic links create new users.");
assert.ok(!html.includes("grant_type=password"), "Password grant must not be present in the browser app.");
assert.ok(html.includes("loadWorkupStudioPermissions"), "Workup Studio must verify profile/assignment permissions after auth.");
assert.ok(html.includes("authorization: `Bearer ${workupStudioState.backend.accessToken}`"), "Workup Studio must use a user access token for REST calls.");
assert.ok(!html.includes("accessToken || workupStudioState.backend.anonKey"), "Publishable key must not be used as bearer auth.");

const supabaseUrl = getSupabaseUrl() || browserDefaults.url;
const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || browserDefaults.publishableKey;
const serviceRoleKey = getSupabaseServiceRoleKey();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();

const missing = [];
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
if (!publicOnly && !accessToken) missing.push("SUPABASE_ACCESS_TOKEN, or run `npx supabase login`");
if (!publicOnly && !serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY for seeding/export verification");

const publicReadiness = await checkPublicSupabaseReadiness({ supabaseUrl, publishableKey });
const deploymentIssues = [
  ...missing.map((key) => `Missing local credential: ${key}`),
  ...publicReadiness.issues
];

if (deploymentIssues.length) {
  fail("Supabase auth deployment is not ready.", [
    ...deploymentIssues,
    ...publicReadiness.notes,
    "Set credentials, enable Supabase Email magic links, then run:",
    "  npm run deploy:supabase-workup-authoring -- --reviewer-email=reviewer@example.com",
    "Manual fallback:",
    "  npx supabase link --project-ref hajjuzpnlvpetsleuxwb",
    "  npx supabase db push",
    "  npm run import:medical-knowledge"
  ]);
} else if (publicOnly) {
  console.log("Supabase public readiness checks passed.");
  for (const note of publicReadiness.notes) console.log(`- ${note}`);
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
