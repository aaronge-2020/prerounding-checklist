// Clean query interface over the DDInter interaction bundle
// (ddi-pairs.data.js). Pure module: no DOM, no storage, no network.
//
// The bundle maps canonical pair keys "rxcuiA|rxcuiB" (numerically sorted)
// to { s: severity, m: mechanisms[], d: display names[] }.
//
// NOTE on partial coverage: DDI_META.partial is true until all 8,466 DDInter
// groups are downloaded. A "no interaction found" result therefore means
// "not in the current bundle" — never "proven safe". Every lookup result
// carries the bundle's coverage note so callers can surface it.

import {
  DDI_PAIRS,
  DDI_META,
  DDI_BUNDLE_TAG
} from "./ddi-pairs.data.js?v=20260929-ddinter-v1";

export const DDI_QUERY_TAG = "20260929-ddi-query-v1";

/** Canonical pair key: two RxCUIs sorted numerically, joined by "|". */
export function ddiPairKey(rxcuiA, rxcuiB) {
  const a = String(rxcuiA || "").trim();
  const b = String(rxcuiB || "").trim();
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || a === b) return null;
  // String sort to match the bundle builder (Python min/max on strings).
  // So "11289|4450" and "4450|11289" map to the same key "11289|4450".
  return [a, b].sort().join("|");
}

/**
 * Look up one drug pair. Returns null when the pair is not in the bundle.
 * The returned object always carries `bundlePartial` so callers know a
 * miss is not proof of safety.
 */
export function lookupInteraction(rxcuiA, rxcuiB) {
  try {
    const key = ddiPairKey(rxcuiA, rxcuiB);
    if (!key) return null;
    const entry = DDI_PAIRS[key];
    if (!entry) return null;
    return {
      rxcuiA: key.split("|")[0],
      rxcuiB: key.split("|")[1],
      severity: String(entry.s || ""),
      mechanisms: Array.isArray(entry.m) ? [...entry.m] : [],
      drugNames: Array.isArray(entry.d) ? [...entry.d] : [],
      bundlePartial: !!DDI_META?.partial,
      bundleTag: DDI_BUNDLE_TAG
    };
  } catch {
    return null;
  }
}

/**
 * Check every unordered pair in a list of RxCUIs. Returns
 * { interactions: [...], checkedPairs: n, bundlePartial }.
 * interactions are sorted: Major first, then Moderate.
 */
export function checkMedicationList(rxcuis) {
  const seen = new Set();
  const unique = [];
  for (const rxcui of rxcuis || []) {
    const key = String(rxcui || "").trim();
    if (/^\d+$/.test(key) && !seen.has(key)) {
      seen.add(key);
      unique.push(key);
    }
  }
  const interactions = [];
  let checkedPairs = 0;
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      checkedPairs++;
      const hit = lookupInteraction(unique[i], unique[j]);
      if (hit) interactions.push(hit);
    }
  }
  const severityRank = { Major: 0, Moderate: 1, Minor: 2, Unknown: 3 };
  interactions.sort(
    (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
  );
  return {
    interactions,
    checkedPairs,
    medicationCount: unique.length,
    bundlePartial: !!DDI_META?.partial,
    bundleTag: DDI_BUNDLE_TAG,
    groupsProcessed: DDI_META?.groups_processed || 0,
    groupsTotal: DDI_META?.groups_total || 0
  };
}

/** Bundle coverage status for UI display. Never throws. */
export function ddiBundleStatus() {
  try {
    return {
      tag: DDI_BUNDLE_TAG,
      partial: !!DDI_META?.partial,
      groupsProcessed: DDI_META?.groups_processed || 0,
      groupsTotal: DDI_META?.groups_total || 0,
      canonicalPairs: DDI_META?.canonical_pairs || 0,
      source: DDI_META?.source || "DDInter 2.0",
      license: DDI_META?.license || "",
      attribution: DDI_META?.attribution || ""
    };
  } catch {
    return { tag: DDI_BUNDLE_TAG, partial: true };
  }
}
