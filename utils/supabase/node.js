import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  requireSupabasePublishableConfig,
  requireSupabaseServiceConfig
} from "./env.js";

function clientOptions(options = {}) {
  const defaultHeaders = {
    "x-application-name": "prerounding-checklist-workup-authoring"
  };
  return {
    ...options,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...(options.auth || {})
    },
    global: {
      ...(options.global || {}),
      headers: {
        ...defaultHeaders,
        ...(options.global?.headers || {})
      }
    }
  };
}

export function createSupabaseServiceClient(options = {}) {
  const { url, key } = requireSupabaseServiceConfig();
  return createSupabaseClient(url, key, clientOptions(options));
}

export function createSupabasePublishableClient(options = {}) {
  const { url, key } = requireSupabasePublishableConfig();
  return createSupabaseClient(url, key, clientOptions(options));
}
