import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const supportedAuthMethods = new Set(["magic-link", "oauth"]);
const supportedOAuthProviders = new Set(["google", "github"]);

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
    "",
    "Optional:",
    "  SUPABASE_PROJECT_REF=hajjuzpnlvpetsleuxwb",
    "  WORKUP_STUDIO_AUTH_METHOD=magic-link|oauth",
    "  WORKUP_STUDIO_OAUTH_PROVIDER=google|github",
    "  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID / SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
    "  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID / SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET",
    "  WORKUP_STUDIO_REVIEWER_EMAIL=you@example.com",
    "  --auth-method=magic-link|oauth",
    "  --oauth-provider=google|github",
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

function run(command, parts, { dryRun = false, masks = [], failureHint = "" } = {}) {
  console.log(`$ ${displayCommand(command, parts, masks)}`);
  if (dryRun) return;
  const result = spawnSync(command, parts, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error([
      `${displayCommand(command, parts, masks)} failed with exit code ${result.status}.`,
      failureHint
    ].filter(Boolean).join("\n"));
  }
}

function supabaseDbPushFailureHint({ dbUrl = "", projectRef = "" } = {}) {
  const lines = [
    "",
    "Database migration push could not connect to Postgres.",
    "If the error mentions `network is unreachable` for `db.<project-ref>.supabase.co`, the runner cannot reach Supabase's direct IPv6 database endpoint.",
    "Fix: set `SUPABASE_DB_URL` to the project's Shared Pooler Session mode connection string from Supabase Dashboard -> Connect -> Session pooler. It should look like `postgres://postgres.<project-ref>:<password>@aws-<region>.pooler.supabase.com:5432/postgres`.",
    "Alternative: enable the Supabase IPv4 add-on for the direct database host."
  ];
  if (!dbUrl) {
    lines.push("Because only `SUPABASE_DB_PASSWORD` was supplied, the CLI uses the linked direct database host. Use `SUPABASE_DB_URL` with the Session pooler URL on IPv4-only runners.");
    return lines.join("\n");
  }
  try {
    const parsed = new URL(dbUrl);
    const directHost = projectRef ? `db.${projectRef}.supabase.co` : "";
    if (parsed.hostname === directHost || /^db\.[^.]+\.supabase\.co$/i.test(parsed.hostname)) {
      lines.push("The current `SUPABASE_DB_URL` appears to be the direct database URL; replace it with the Session pooler URL for GitHub-hosted deploys.");
    }
  } catch {
    lines.push("Also verify that `SUPABASE_DB_URL` is a complete Postgres URL with the database password filled in.");
  }
  return lines.join("\n");
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

function selectedAuthMethod() {
  const raw = argValue("--auth-method", envValue("WORKUP_STUDIO_AUTH_METHOD") || "magic-link").toLowerCase();
  const method = raw === "magic_link" || raw === "email" ? "magic-link" : raw;
  if (!supportedAuthMethods.has(method)) {
    throw new Error(`Unsupported --auth-method=${raw}. Use magic-link or oauth.`);
  }
  return method;
}

function selectedOAuthProvider() {
  const provider = argValue("--oauth-provider", envValue("WORKUP_STUDIO_OAUTH_PROVIDER") || "google").toLowerCase();
  if (!supportedOAuthProviders.has(provider)) {
    throw new Error(`Unsupported --oauth-provider=${provider}. Use google or github.`);
  }
  return provider;
}

function oauthEnvNames(provider) {
  const normalized = provider.toUpperCase();
  return {
    clientId: `SUPABASE_AUTH_EXTERNAL_${normalized}_CLIENT_ID`,
    secret: `SUPABASE_AUTH_EXTERNAL_${normalized}_SECRET`
  };
}

function providerBlock(provider, enabled) {
  const envNames = oauthEnvNames(provider);
  return [
    `[auth.external.${provider}]`,
    `enabled = ${enabled ? "true" : "false"}`,
    `client_id = "env(${envNames.clientId})"`,
    `secret = "env(${envNames.secret})"`,
    'redirect_uri = ""',
    'url = ""',
    "skip_nonce_check = false",
    "email_optional = false"
  ].join("\n");
}

function emailAuthBlock() {
  return [
    "[auth.email]",
    "enable_signup = false",
    "enable_confirmations = false"
  ].join("\n");
}

function upsertEmailAuthBlock(configText) {
  const blockPattern = /\[auth\.email\][\s\S]*?(?=\n\[|$)/m;
  const nextBlock = emailAuthBlock();
  return blockPattern.test(configText)
    ? configText.replace(blockPattern, nextBlock)
    : `${configText.trimEnd()}\n\n${nextBlock}\n`;
}

function upsertProviderBlock(configText, provider, enabled) {
  const blockPattern = new RegExp(`\\[auth\\.external\\.${provider}\\][\\s\\S]*?(?=\\n\\[|$)`, "m");
  const nextBlock = providerBlock(provider, enabled);
  return blockPattern.test(configText)
    ? configText.replace(blockPattern, nextBlock)
    : `${configText.trimEnd()}\n\n${nextBlock}\n`;
}

function prepareSupabaseConfigWorkdir(authMethod, oauthProvider) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "workup-supabase-config-"));
  const tempSupabaseDir = path.join(tempRoot, "supabase");
  cpSync(path.join(repoRoot, "supabase"), tempSupabaseDir, { recursive: true });
  const configPath = path.join(tempSupabaseDir, "config.toml");
  let configText = readFileSync(configPath, "utf8");
  configText = upsertEmailAuthBlock(configText);
  configText = configText.replace(/enable_signup\s*=\s*true/g, "enable_signup = false");
  for (const provider of supportedOAuthProviders) {
    configText = upsertProviderBlock(configText, provider, authMethod === "oauth" && provider === oauthProvider);
  }
  writeFileSync(configPath, configText);
  return tempRoot;
}

async function main() {
  const dryRun = args.has("--dry-run");
  const projectRef = inferProjectRef();
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const accessToken = envValue("SUPABASE_ACCESS_TOKEN");
  const authMethod = selectedAuthMethod();
  const oauthProvider = selectedOAuthProvider();
  const oauthEnv = oauthEnvNames(oauthProvider);
  const dbPassword = argValue("--db-password", envValue("SUPABASE_DB_PASSWORD"));
  const dbUrl = argValue("--db-url", envValue("SUPABASE_DB_URL"));
  const oauthClientId = envValue(oauthEnv.clientId);
  const oauthSecret = envValue(oauthEnv.secret);
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
    { name: oauthEnv.clientId, value: skipConfigPush || authMethod !== "oauth" ? "not-needed" : oauthClientId },
    { name: oauthEnv.secret, value: skipConfigPush || authMethod !== "oauth" ? "not-needed" : oauthSecret },
    { name: "SUPABASE_DB_PASSWORD or SUPABASE_DB_URL", value: skipDbPush ? "not-needed" : dbPassword || dbUrl }
  ]);

  const npx = commandName("npx");
  const npm = commandName("npm");
  const masks = [
    { value: dbPassword, mask: masked(dbPassword) },
    { value: dbUrl, mask: masked(dbUrl) },
    { value: accessToken, mask: masked(accessToken) }
  ];
  let configWorkdir = "";

  try {
    if (!skipConfigPush) {
      console.log(`Configuring Workup Studio auth: ${authMethod === "oauth" ? `${oauthProvider} OAuth` : "email magic link"}.`);
      configWorkdir = prepareSupabaseConfigWorkdir(authMethod, oauthProvider);
      run(npx, ["supabase", "config", "push", "--project-ref", projectRef, "--workdir", configWorkdir, "--yes"], { dryRun, masks });
    }

    if (!skipDbPush) {
      const dbPushFailureHint = supabaseDbPushFailureHint({ dbUrl, projectRef });
      if (dbUrl) {
        run(npx, ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], { dryRun, masks, failureHint: dbPushFailureHint });
      } else {
        run(npx, ["supabase", "link", "--project-ref", projectRef, "--password", dbPassword, "--yes"], { dryRun, masks });
        run(npx, ["supabase", "db", "push", "--linked", "--password", dbPassword, "--yes"], { dryRun, masks, failureHint: dbPushFailureHint });
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
  } finally {
    if (configWorkdir) rmSync(configWorkdir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
