import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function nodeEnv() {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function parseEnvValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadSupabaseEnvFiles({ cwd = process.cwd(), files = [".env.local", ".env"], overwrite = false } = {}) {
  const loaded = [];
  const env = nodeEnv();
  for (const file of files) {
    const envPath = path.resolve(cwd, file);
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separatorIndex = trimmed.indexOf("=");
      const key = trimmed.slice(0, separatorIndex).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (!overwrite && env[key]) continue;
      env[key] = parseEnvValue(trimmed.slice(separatorIndex + 1));
    }
    loaded.push(envPath);
  }
  return loaded;
}

export function normalizeSupabaseUrl(value = "") {
  const url = String(value || "").trim().replace(/\/+$/g, "");
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
      ? url
      : "";
  } catch {
    return "";
  }
}

export function getSupabaseUrl(env = nodeEnv()) {
  return normalizeSupabaseUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "");
}

export function getSupabasePublishableKey(env = nodeEnv()) {
  return String(
    env.SUPABASE_ANON_KEY
      || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || ""
  ).trim();
}

export function getSupabaseServiceRoleKey(env = nodeEnv()) {
  return String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "").trim();
}

export function hasSupabaseServiceConfig(env = nodeEnv()) {
  return Boolean(getSupabaseUrl(env) && getSupabaseServiceRoleKey(env));
}

export function requireSupabaseServiceConfig(env = nodeEnv()) {
  const url = getSupabaseUrl(env);
  const key = getSupabaseServiceRoleKey(env);
  if (!url || !key) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server-side import/export.");
  }
  return { url, key };
}

export function requireSupabasePublishableConfig(env = nodeEnv()) {
  const url = getSupabaseUrl(env);
  const key = getSupabasePublishableKey(env);
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for browser Supabase clients.");
  }
  return { url, key };
}
