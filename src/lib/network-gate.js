// Central gate for application remote requests, backed by browser API guards.
// Offline mode rejects remote operations rather than silently sending them.
//
// Same-origin requests (the app's files and model packs) still pass and may
// use the network. This application policy is not device-level isolation.
//
// The toggle is a device-level setting in localStorage (not the encrypted
// vault) so the gate works before the vault is unlocked and reads
// synchronously at call time.

const STORAGE_KEY = "prerounding.offlineMode.v1";

function requestUrl(input) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
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
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) return false;
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
  const restore = [];
  const syncStorage = event => {
    if (event.key === STORAGE_KEY) setOfflineMode(event.newValue === "1");
  };
  window.addEventListener?.("storage", syncStorage);
  restore.push(() => window.removeEventListener?.("storage", syncStorage));
  if (window.navigator?.sendBeacon) {
    const nativeBeacon = window.navigator.sendBeacon;
    window.navigator.sendBeacon = function (url, data) {
      if (offline && isRemoteUrl(url)) return false;
      return nativeBeacon.call(this, url, data);
    };
    restore.push(() => { window.navigator.sendBeacon = nativeBeacon; });
  }
  if (window.XMLHttpRequest) {
    const prototype = window.XMLHttpRequest.prototype;
    const open = prototype.open, send = prototype.send;
    const destinations = new WeakMap();
    prototype.open = function (method, url, ...args) {
      assertRemoteAllowed(url); destinations.set(this, url);
      return open.call(this, method, url, ...args);
    };
    prototype.send = function (...args) {
      assertRemoteAllowed(destinations.get(this));
      return send.apply(this, args);
    };
    restore.push(() => { prototype.open = open; prototype.send = send; });
  }
  for (const key of ["WebSocket", "EventSource"]) {
    const Native = window[key];
    if (!Native) continue;
    const connections = new Set();
    window[key] = new Proxy(Native, { construct(Target, args) {
      assertRemoteAllowed(args[0]);
      const connection = Reflect.construct(Target, args);
      if (isRemoteUrl(args[0])) connections.add(connection);
      return connection;
    } });
    const unsubscribe = onOfflineModeChange(enabled => {
      if (enabled) { for (const connection of connections) connection.close(); connections.clear(); }
    });
    restore.push(() => { unsubscribe(); window[key] = Native; });
  }
  return () => {
    window.fetch = nativeFetch;
    for (const reset of restore) reset();
    guardInstalled = false;
  };
}
