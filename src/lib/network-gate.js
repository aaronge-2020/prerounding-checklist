// Central network gate: every remote (cross-origin) request the app makes
// flows through here. Offline mode blocks those requests with a clear, calm
// error instead of a hang or a silent failure.
//
// Same-origin requests (the app's own files, bundled model chunks, cached
// model packs) always pass: "offline" means "don't reach the network",
// not "don't load the app".
//
// The toggle is a device-level setting in localStorage (not the encrypted
// vault) so the gate works before the vault is unlocked and reads
// synchronously at call time.

const STORAGE_KEY = "prerounding.offlineMode.v1";

function requestUrl(input) {
  return typeof input === "string" ? input : input?.url;
}

function baseHref() {
  try {
    if (typeof location !== "undefined" && location.href) return location.href;
  } catch {
    // Non-browser runtimes (tests): fall back to a dummy base.
  }
  return "http://localhost/";
}

function pageOrigin() {
  try {
    if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
      return location.origin;
    }
  } catch {
    // Non-browser runtimes (tests): fall back to the dummy base origin.
  }
  return new URL(baseHref()).origin;
}

function hostOf(input) {
  try {
    const parsed = new URL(String(requestUrl(input)), baseHref());
    return parsed.host || "";
  } catch {
    return "";
  }
}

// True for http(s) URLs whose origin differs from the page that loaded the
// app. Relative URLs, same-origin URLs, and non-http(s) schemes (data:,
// blob:) are local and never gated.
export function isRemoteUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(requestUrl(input)), baseHref());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.origin !== pageOrigin();
}

export class OfflineBlockedError extends Error {
  constructor(input) {
    const host = hostOf(input);
    super(
      host
        ? `Offline mode is on, so this request to ${host} was not sent. Turn offline mode off in Settings to use cloud features, or use the on-device option.`
        : "Offline mode is on, so this request was not sent. Turn offline mode off in Settings to use cloud features, or use the on-device option."
    );
    this.name = "OfflineBlockedError";
    this.url = requestUrl(input);
  }
}

function readStored() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let offline = readStored();
const listeners = new Set();

export function isOfflineMode() {
  return offline;
}

// Persist the toggle and notify subscribers. Returns the new state.
export function setOfflineMode(on) {
  const next = on === true;
  if (next === offline) return offline;
  offline = next;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  } catch {
    // Storage may be unavailable (private mode); the session still honors
    // the toggle, it just won't survive a reload.
  }
  for (const listener of listeners) {
    try {
      listener(next);
    } catch {
      // A failing subscriber must not break the toggle for everyone else.
    }
  }
  return offline;
}

export function onOfflineModeChange(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Throw OfflineBlockedError when offline mode forbids this request.
// Same-origin requests always pass.
export function assertRemoteAllowed(input) {
  if (offline && isRemoteUrl(input)) throw new OfflineBlockedError(input);
}

// Drop-in fetch replacement for remote call sites. Same signature as fetch.
export async function gatedFetch(input, init) {
  assertRemoteAllowed(input);
  return globalThis.fetch(input, init);
}

// Backstop for any remote fetch the audit missed (including third-party
// libraries on the main thread): wraps window.fetch so cross-origin requests
// throw OfflineBlockedError while offline mode is on. Same-origin traffic is
// untouched. Idempotent; returns an uninstall function.
let guardInstalled = false;

export function installGlobalFetchGuard() {
  if (guardInstalled) return () => {};
  if (typeof window === "undefined" || typeof window.fetch !== "function") return () => {};
  guardInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function gatedWindowFetch(input, init) {
    assertRemoteAllowed(input);
    return nativeFetch(input, init);
  };
  return () => {
    window.fetch = nativeFetch;
    guardInstalled = false;
  };
}
