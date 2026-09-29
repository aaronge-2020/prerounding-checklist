// Test-only browser shims for offline-mode tests. This file must be the
// FIRST static import in the test: static imports evaluate in order, so the
// globals exist before the modules under test read them at load time.
// Everything stays in-memory: no network, no disk.
const store = new Map();

globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => {
    store.set(key, String(value));
  },
  removeItem: (key) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  }
};

export const fetchCalls = [];

globalThis.fetch = async (input, init) => {
  fetchCalls.push({ input, init });
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => ""
  };
};

export function resetFetchCalls() {
  fetchCalls.length = 0;
}

export function storedOfflineMode() {
  return store.get("prerounding.offlineMode.v1");
}
