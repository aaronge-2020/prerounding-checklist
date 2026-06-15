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

function parseSupabaseJsonRows(result, label, issues) {
  try {
    const parsed = JSON.parse(result.text || "[]");
    if (Array.isArray(parsed)) return parsed;
    issues.push(`${label} returned a non-array JSON response.`);
    return [];
  } catch {
    issues.push(`${label} returned invalid JSON: ${result.text.slice(0, 160)}`);
    return [];
  }
}

function postgrestInFilter(values = []) {
  const clean = Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => /^[A-Za-z0-9_.:-]+$/.test(value))));
  return clean.length ? `in.(${clean.map((value) => `"${value}"`).join(",")})` : "";
}

function sourceIdsFromCatalogRows(rows = []) {
  const sourceIds = new Set();
  for (const row of rows) {
    for (const sourceId of Array.isArray(row?.source_ids) ? row.source_ids : []) {
      const normalized = String(sourceId || "").trim();
      if (normalized) sourceIds.add(normalized);
    }
  }
  return Array.from(sourceIds);
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
      const publicEmailSignupEnabled = external.email === true || payload.email === true;
      const publicSignupDisabled = payload.disable_signup === true;
      if (publicEmailSignupEnabled) {
        notes.push("Supabase Email signup provider is enabled.");
      } else if (publicSignupDisabled) {
        notes.push("Supabase public email signup is disabled as expected; Workup Studio uses existing-user magic links with create_user=false.");
      } else {
        issues.push("Supabase Email magic-link auth appears disabled. Enable Email auth or disable public signup for existing-user magic links.");
      }
      if (publicSignupDisabled) {
        notes.push("Supabase public signup is disabled.");
      } else {
        issues.push("Supabase public signup is enabled; disable signup before shipping Workup Studio.");
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

  const draftWorkupProbe = await fetchSupabaseText(`${supabaseUrl}/rest/v1/workups?select=id,status&status=eq.draft&limit=1`, { headers });
  if (draftWorkupProbe.status === 200) {
    const text = draftWorkupProbe.text.trim();
    if (text && text !== "[]") {
      issues.push("Anonymous publishable-key request returned draft workups; public catalog RLS must expose only reviewed/active workups.");
    } else {
      notes.push("Public catalog did not expose draft workups to anonymous publishable-key reads.");
    }
  } else if (draftWorkupProbe.status === 401 || draftWorkupProbe.status === 403) {
    notes.push(`Draft workup public probe is blocked with HTTP ${draftWorkupProbe.status}.`);
  } else {
    issues.push(`Unexpected draft workup public probe response: HTTP ${draftWorkupProbe.status} ${draftWorkupProbe.text.slice(0, 160)}`);
  }

  const activeWorkupsProbe = await fetchSupabaseText(`${supabaseUrl}/rest/v1/workups?select=id,title,status,source_ids&status=in.(mvp,active,published,reviewed)&order=title.asc&limit=25`, { headers });
  if (activeWorkupsProbe.status !== 200) {
    issues.push(`Active reviewed public catalog workup probe failed: HTTP ${activeWorkupsProbe.status} ${activeWorkupsProbe.text.slice(0, 160)}`);
    return { issues, notes };
  }
  const activeWorkups = parseSupabaseJsonRows(activeWorkupsProbe, "Active reviewed public catalog workup probe", issues);
  if (!activeWorkups.length) {
    issues.push("Public catalog returned no active reviewed workups; fresh patient devices cannot load server workup updates.");
    return { issues, notes };
  }
  const activeWorkupIds = activeWorkups.map((row) => row.id).filter(Boolean);
  const sectionFilter = postgrestInFilter(activeWorkupIds);
  if (!sectionFilter) {
    issues.push("Active reviewed workups did not include safe workup IDs for section hydration.");
    return { issues, notes };
  }
  const activeSectionsProbe = await fetchSupabaseText(`${supabaseUrl}/rest/v1/workup_sections?select=workup_id,section_key,source_ids&workup_id=${sectionFilter}&order=workup_id.asc,sort_order.asc&limit=200`, { headers });
  if (activeSectionsProbe.status !== 200) {
    issues.push(`Active reviewed public catalog section probe failed: HTTP ${activeSectionsProbe.status} ${activeSectionsProbe.text.slice(0, 160)}`);
    return { issues, notes };
  }
  const activeSections = parseSupabaseJsonRows(activeSectionsProbe, "Active reviewed public catalog section probe", issues);
  if (!activeSections.length) {
    issues.push("Public catalog returned active reviewed workups but no readable sections; fresh patient devices cannot build server workups.");
  } else {
    notes.push(`Public catalog app-shaped probe returned ${activeWorkups.length} active reviewed workup(s) and ${activeSections.length} section row(s).`);
  }
  const sourceIds = sourceIdsFromCatalogRows([...activeWorkups, ...activeSections]);
  if (!sourceIds.length) {
    issues.push("Public catalog active reviewed workups/sections expose no source IDs; source traceability may be missing from fresh devices.");
    return { issues, notes };
  }
  const sourceFilter = postgrestInFilter(sourceIds);
  const activeSourcesProbe = await fetchSupabaseText(`${supabaseUrl}/rest/v1/sources?select=id,source_id&or=(id.${sourceFilter},source_id.${sourceFilter})&limit=200`, { headers });
  if (activeSourcesProbe.status !== 200) {
    issues.push(`Active reviewed public catalog source probe failed: HTTP ${activeSourcesProbe.status} ${activeSourcesProbe.text.slice(0, 160)}`);
    return { issues, notes };
  }
  const activeSources = parseSupabaseJsonRows(activeSourcesProbe, "Active reviewed public catalog source probe", issues);
  if (!activeSources.length) {
    issues.push("Public catalog source probe returned no rows for active reviewed workup source IDs; fresh devices may show untraceable workups.");
  } else {
    notes.push(`Public catalog app-shaped probe returned ${activeSources.length} referenced source row(s).`);
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
    "Set credentials, verify Supabase Email auth for existing users, then run:",
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
