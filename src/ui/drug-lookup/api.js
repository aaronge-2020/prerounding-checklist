// Drug lookup API layer: RxNav (name -> RxCUI -> ingredient) and openFDA
// (indications + label interaction text). All network goes through an
// injected fetch so the pure parsers stay testable without live requests.
//
// Verified 2026-09-29:
// - RxNav REST: keyless, CORS `Access-Control-Allow-Origin: *`
// - openFDA drug/label: keyless, CORS `Access-Control-Allow-Origin: *`
// - The old NLM RxNav Interaction API was discontinued 2024-01-02; pairwise
//   checking here uses the bundled high-priority dataset in
//   interactions-data.js instead of a live interaction endpoint.

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
// Pairwise checking against the bundled dataset
// ---------------------------------------------------------------------------

// resolvedDrugs: [{ input, name, rxcui, ingredientRxcuis: [{rxcui,name}] }]
// dataset: [{ a, b, severity, description, source }]
// Returns one entry per interacting pair (highest-severity record wins).
export function checkPairs(resolvedDrugs, dataset) {
  const findings = [];
  const seen = new Set();
  const drugs = Array.isArray(resolvedDrugs) ? resolvedDrugs : [];
  const pairs = Array.isArray(dataset) ? dataset : [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const left = drugs[i];
      const right = drugs[j];
      const leftKeys = new Set([left.rxcui, ...(left.ingredientRxcuis || []).map((x) => x.rxcui)].filter(Boolean));
      const rightKeys = new Set([right.rxcui, ...(right.ingredientRxcuis || []).map((x) => x.rxcui)].filter(Boolean));
      const matches = pairs.filter(
        (p) => (leftKeys.has(p.a) && rightKeys.has(p.b)) || (leftKeys.has(p.b) && rightKeys.has(p.a))
      );
      if (!matches.length) continue;
      const best = sortInteractionsBySeverity(matches)[0];
      const key = [left.rxcui, right.rxcui].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        drugA: left.name || left.input,
        drugB: right.name || right.input,
        severity: best.severity,
        description: best.description,
        source: best.source
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
