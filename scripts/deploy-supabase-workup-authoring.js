import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSupabasePublishableKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  loadSupabaseEnvFiles
} from "../utils/supabase/env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadSupabaseEnvFiles({ cwd: repoRoot });

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = rawArgs.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

function envValue(name) {
  return String(process.env[name] || "").trim();
}

function inferProjectRef() {
  const explicit = argValue("--project-ref", envValue("SUPABASE_PROJECT_REF"));
  if (explicit) return explicit;
  const url = getSupabaseUrl();
  if (!url) return "";
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function usage() {
  return [
    "Usage:",
    "  npm run deploy:supabase-workup-authoring -- --reviewer-email=you@example.com",
    "",
    "Required environment:",
    "  SUPABASE_ACCESS_TOKEN",
    "  SUPABASE_DB_PASSWORD or SUPABASE_DB_URL",
    "  SUPABASE_SERVICE_ROLE_KEY",
    "  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
    "  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
    "",
    "Optional:",
    "  SUPABASE_PROJECT_REF=hajjuzpnlvpetsleuxwb",
    "  WORKUP_STUDIO_REVIEWER_EMAIL=you@example.com",
    "  --dry-run",
    "  --skip-config-push",
    "  --skip-db-push",
    "  --skip-import",
    "  --skip-check"
  ].join("\n");
}

function commandName(base) {
  if (process.platform !== "win32") return base;
  return base === "npm" ? "npm.cmd" : "npx.cmd";
}

function masked(value) {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function displayCommand(command, parts, masks = []) {
  const maskedParts = parts.map((part) => {
    const replacement = masks.find((entry) => entry.value && part === entry.value);
    return replacement ? replacement.mask : part;
  });
  return [command, ...maskedParts].join(" ");
}

function run(command, parts, { dryRun = false, masks = [] } = {}) {
  console.log(`$ ${displayCommand(command, parts, masks)}`);
  if (dryRun) return;
  const result = spawnSync(command, parts, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${displayCommand(command, parts, masks)} failed with exit code ${result.status}.`);
  }
}

function requireValues(entries) {
  const missing = entries.filter((entry) => !entry.value).map((entry) => entry.name);
  if (missing.length) {
    throw new Error([
      "Supabase Workup Studio deploy is missing required configuration.",
      ...missing.map((name) => `- ${name}`),
      "",
      usage()
    ].join("\n"));
  }
}

async function main() {
  const dryRun = args.has("--dry-run");
  const projectRef = inferProjectRef();
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const accessToken = envValue("SUPABASE_ACCESS_TOKEN");
  const dbPassword = argValue("--db-password", envValue("SUPABASE_DB_PASSWORD"));
  const dbUrl = argValue("--db-url", envValue("SUPABASE_DB_URL"));
  const googleClientId = envValue("SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID");
  const googleSecret = envValue("SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET");
  const reviewerEmail = argValue("--reviewer-email", envValue("WORKUP_STUDIO_REVIEWER_EMAIL"));
  const skipConfigPush = args.has("--skip-config-push");
  const skipDbPush = args.has("--skip-db-push");
  const skipImport = args.has("--skip-import");
  const skipCheck = args.has("--skip-check");

  requireValues([
    { name: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL", value: supabaseUrl },
    { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY", value: publishableKey },
    { name: "SUPABASE_PROJECT_REF or Supabase project URL host", value: projectRef },
    { name: "SUPABASE_ACCESS_TOKEN", value: accessToken },
    { name: "SUPABASE_SERVICE_ROLE_KEY", value: skipImport && !reviewerEmail ? "not-needed" : serviceRoleKey },
    { name: "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID", value: skipConfigPush ? "not-needed" : googleClientId },
    { name: "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET", value: skipConfigPush ? "not-needed" : googleSecret },
    { name: "SUPABASE_DB_PASSWORD or SUPABASE_DB_URL", value: skipDbPush ? "not-needed" : dbPassword || dbUrl }
  ]);

  const npx = commandName("npx");
  const npm = commandName("npm");
  const masks = [
    { value: dbPassword, mask: masked(dbPassword) },
    { value: dbUrl, mask: masked(dbUrl) },
    { value: accessToken, mask: masked(accessToken) }
  ];

  if (!skipConfigPush) {
    run(npx, ["supabase", "config", "push", "--project-ref", projectRef, "--yes"], { dryRun, masks });
  }

  if (!skipDbPush) {
    if (dbUrl) {
      run(npx, ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], { dryRun, masks });
    } else {
      run(npx, ["supabase", "link", "--project-ref", projectRef, "--password", dbPassword, "--yes"], { dryRun, masks });
      run(npx, ["supabase", "db", "push", "--linked", "--password", dbPassword, "--yes"], { dryRun, masks });
    }
  }

  if (!skipImport) {
    run(npm, ["run", "import:medical-knowledge"], { dryRun, masks });
  }

  if (reviewerEmail) {
    run(npm, ["run", "grant:workup-access", "--", `--email=${reviewerEmail}`, "--role=reviewer"], { dryRun, masks });
  } else {
    console.log("No reviewer email supplied; skipping reviewer grant.");
  }

  if (!skipCheck) {
    run(npm, ["run", "check:supabase-auth"], { dryRun, masks });
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
