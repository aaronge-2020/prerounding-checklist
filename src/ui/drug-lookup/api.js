// Drug lookup API layer: RxNav (name -> RxCUI -> ingredient) and openFDA
// (indications + label interaction text). All network goes through an
// injected fetch so the pure parsers stay testable without live requests.
//
// Verified 2026-09-29:
// - RxNav REST: keyless, CORS `Access-Control-Allow-Origin: *`
// - openFDA drug/label: keyless, CORS `Access-Control-Allow-Origin: *`
// - The old NLM RxNav Interaction API was discontinued 2024-01-02; pairwise
//   checking here uses the DDInter 2.0 dataset (Xiong et al., Nucleic Acids
//   Res. 2025) in interactions-data.js, keyed by ingredient RxCUI.

export const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";
export const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

export function buildRxcuiLookupUrl(name) {
  return `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
}

export function buildApproximateTermUrl(term, maxEntries = 5) {
  return `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=${maxEntries}`;
}

export function buildIngredientLookupUrl(rxcui) {
  return `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/allrelated.json`;
}

export function buildOpenFdaLabelUrl(drugName, limit = 3) {
  // Prefer the generic name field; fall back is handled by the caller trying
  // brand_name when the generic search returns nothing.
  const q = `openfda.generic_name:"${drugName}"`;
  return `${OPENFDA_BASE}?search=${encodeURIComponent(q)}&limit=${limit}`;
}

export function buildOpenFdaBrandLabelUrl(drugName, limit = 3) {
  const q = `openfda.brand_name:"${drugName}"`;
  return `${OPENFDA_BASE}?search=${encodeURIComponent(q)}&limit=${limit}`;
}

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

// Strip doses, units, and bracketed brand tags users often paste
// ("atorvastatin 20 mg", "Lipitor [atorvastatin]") down to the drug name.
export function normalizeDrugInput(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  // Drop bracketed tags like "[Lipitor]".
  s = s.replace(/\[[^\]]*\]/g, " ");
  // Drop dose fragments like "20 mg", "10mg", "0.5 MG/ML".
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|iu|meq)\b(?:\s*\/\s*(?:ml|day|dose))?/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ---------------------------------------------------------------------------
// Response parsers (pure; safe on malformed input)
// ---------------------------------------------------------------------------

export function parseRxcuiResponse(json) {
  const ids = json?.idGroup?.rxnormId;
  if (!Array.isArray(ids) || !ids.length) return null;
  return String(ids[0]);
}

export function parseApproximateTermResponse(json) {
  const candidates = json?.approximateGroup?.candidate;
  if (!Array.isArray(candidates)) return [];
  return candidates
    .filter((c) => c && c.rxcui)
    .map((c) => ({ rxcui: String(c.rxcui), name: String(c.name || ""), score: String(c.score || "") }));
}

// Pull ingredient-level (IN) RxCUIs out of an allrelated response so brand
// names and dose forms match the ingredient-keyed interaction dataset.
export function parseIngredientResponse(json) {
  const groups = json?.allRelatedGroup?.conceptGroup;
  if (!Array.isArray(groups)) return [];
  const out = [];
  for (const group of groups) {
    if (group?.tty !== "IN") continue;
    for (const concept of group.conceptProperties || []) {
      if (concept?.rxcui) out.push({ rxcui: String(concept.rxcui), name: String(concept.name || "") });
    }
  }
  return out;
}

function firstTextField(record, field) {
  const values = record?.[field];
  if (!Array.isArray(values) || !values.length) return "";
  return String(values[0] || "");
}

export function parseOpenFdaLabel(json) {
  const record = json?.results?.[0];
  if (!record) return null;
  const openfda = record.openfda || {};
  return {
    brandName: (openfda.brand_name || [])[0] || "",
    genericName: (openfda.generic_name || [])[0] || "",
    manufacturer: (openfda.manufacturer_name || [])[0] || "",
    indications: firstTextField(record, "indications_and_usage"),
    dosage: firstTextField(record, "dosage_and_administration"),
    drugInteractions: firstTextField(record, "drug_interactions"),
    warnings: firstTextField(record, "warnings")
  };
}

// ---------------------------------------------------------------------------
// Severity ranking
// ---------------------------------------------------------------------------

export const SEVERITY_ORDER = ["major", "moderate", "minor"];

export function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(String(severity || "").toLowerCase());
  return index === -1 ? SEVERITY_ORDER.length : index;
}

export function sortInteractionsBySeverity(interactions) {
  return [...(interactions || [])].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

// ---------------------------------------------------------------------------
// Pairwise checking against the DDInter dataset
// ---------------------------------------------------------------------------

// Build an O(1) lookup Map from the compact DDI_PAIRS format.
// ddiPairs: [[rxcuiA, rxcuiB, severityInt], ...] where severityInt 0=major, 1=moderate.
// Returns Map<"rxcuiA|rxcuiB" (sorted), severityInt>.
export function buildDdiLookup(ddiPairs) {
  const map = new Map();
  for (const entry of ddiPairs || []) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const a = String(entry[0]);
    const b = String(entry[1]);
    const s = Number(entry[2]);
    if (!a || !b || a === b || !(s === 0 || s === 1)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    // Keep major (0) over moderate (1).
    if (!map.has(key) || s < map.get(key)) {
      map.set(key, s);
    }
  }
  return map;
}

const DDI_SEVERITY_LABEL = ["major", "moderate"];

function ddiDescription(severityLabel) {
  return severityLabel === "major"
    ? "Flagged as a major interaction in DDInter 2.0 — review with a pharmacist before administering."
    : "Flagged as a moderate interaction in DDInter 2.0 — monitor or adjust; review with a pharmacist.";
}

// resolvedDrugs: [{ input, name, rxcui, ingredientRxcuis: [{rxcui,name}] }]
// ddiLookup: Map from buildDdiLookup (or a legacy [{a,b,severity}] array).
// Returns one entry per interacting pair.
export function checkPairs(resolvedDrugs, ddiLookup) {
  const findings = [];
  const seen = new Set();
  const drugs = Array.isArray(resolvedDrugs) ? resolvedDrugs : [];

  // Support both the Map (new) and legacy array-of-records (old) formats.
  const lookupMap = ddiLookup instanceof Map ? ddiLookup : buildDdiLookup(
    (Array.isArray(ddiLookup) ? ddiLookup : []).map((p) =>
      Array.isArray(p) ? p : [p.a, p.b, p.severity === "major" ? 0 : 1]
    )
  );

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const left = drugs[i];
      const right = drugs[j];
      const leftKeys = new Set([left.rxcui, ...(left.ingredientRxcuis || []).map((x) => x.rxcui)].filter(Boolean).map(String));
      const rightKeys = new Set([right.rxcui, ...(right.ingredientRxcuis || []).map((x) => x.rxcui)].filter(Boolean).map(String));
      let bestSeverity = -1;
      for (const lk of leftKeys) {
        for (const rk of rightKeys) {
          if (lk === rk) continue;
          const key = lk < rk ? `${lk}|${rk}` : `${rk}|${lk}`;
          const s = lookupMap.get(key);
          if (s !== undefined && (bestSeverity === -1 || s < bestSeverity)) {
            bestSeverity = s;
          }
        }
      }
      if (bestSeverity === -1) continue;
      const pairKey = [String(left.rxcui), String(right.rxcui)].sort().join("|");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const severityLabel = DDI_SEVERITY_LABEL[bestSeverity] || "moderate";
      findings.push({
        drugA: left.name || left.input,
        drugB: right.name || right.input,
        severity: severityLabel,
        description: ddiDescription(severityLabel),
        source: "DDInter 2.0"
      });
    }
  }
  return sortInteractionsBySeverity(findings);
}

// ---------------------------------------------------------------------------
// Live resolution (needs fetch; network errors surface to the caller)
// ---------------------------------------------------------------------------

export async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

// Resolve a free-text drug name to { rxcui, name, ingredientRxcuis }.
// Tries exact RxNorm lookup first, then approximate matching.
export async function resolveDrug(fetchImpl, rawInput) {
  const input = normalizeDrugInput(rawInput);
  if (!input) return { input: rawInput, rxcui: null, name: "", ingredientRxcuis: [], unresolved: true };
  const rxcui = parseRxcuiResponse(await fetchJson(fetchImpl, buildRxcuiLookupUrl(input)));
  let finalRxcui = rxcui;
  let displayName = input;
  if (!finalRxcui) {
    const candidates = parseApproximateTermResponse(await fetchJson(fetchImpl, buildApproximateTermUrl(input)));
    if (!candidates.length) {
      return { input: rawInput, rxcui: null, name: input, ingredientRxcuis: [], unresolved: true };
    }
    finalRxcui = candidates[0].rxcui;
    displayName = candidates[0].name || input;
  }
  let ingredientRxcuis = [];
  try {
    ingredientRxcuis = parseIngredientResponse(await fetchJson(fetchImpl, buildIngredientLookupUrl(finalRxcui)));
  } catch {
    // Ingredient expansion is best-effort; the direct RxCUI still matches.
  }
  return { input: rawInput, rxcui: finalRxcui, name: displayName, ingredientRxcuis, unresolved: false };
}

export async function fetchLabel(fetchImpl, drugName) {
  const query = normalizeDrugInput(drugName);
  if (!query) return null;
  let parsed = null;
  try {
    parsed = parseOpenFdaLabel(await fetchJson(fetchImpl, buildOpenFdaLabelUrl(query)));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    parsed = parseOpenFdaLabel(await fetchJson(fetchImpl, buildOpenFdaBrandLabelUrl(query)));
  }
  return parsed;
}
