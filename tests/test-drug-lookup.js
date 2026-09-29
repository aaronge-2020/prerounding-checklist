// Tests for the Drug Lookup feature (src/ui/drug-lookup/).
// All fixtures are synthetic. No live network: fetch is stubbed.

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";

import {
  buildRxcuiLookupUrl,
  buildApproximateTermUrl,
  buildIngredientLookupUrl,
  buildOpenFdaLabelUrl,
  buildOpenFdaBrandLabelUrl,
  normalizeDrugInput,
  parseRxcuiResponse,
  parseApproximateTermResponse,
  parseIngredientResponse,
  parseOpenFdaLabel,
  severityRank,
  sortInteractionsBySeverity,
  buildDdiLookup,
  checkPairs,
  resolveDrug,
  fetchLabel
} from "../src/ui/drug-lookup/api.js";
import { DDI_PAIRS, DDI_LOOKUP, DDI_DATASET_VERSION, DDI_DATASET_SOURCE } from "../src/ui/drug-lookup/interactions-data.js";

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

{
  const url = buildRxcuiLookupUrl("atorvastatin");
  assert.ok(url.startsWith("https://rxnav.nlm.nih.gov/REST/rxcui.json?"), "rxcui lookup base");
  assert.ok(url.includes("name=atorvastatin"), "name param");
}

{
  const url = buildApproximateTermUrl("lipiter", 3);
  assert.ok(url.includes("approximateTerm.json"), "approximate term endpoint");
  assert.ok(url.includes("term=lipiter"), "term param");
  assert.ok(url.includes("maxEntries=3"), "maxEntries param");
}

{
  const url = buildIngredientLookupUrl("153165");
  assert.ok(url.includes("/rxcui/153165/allrelated.json"), "ingredient lookup path");
}

{
  const url = buildOpenFdaLabelUrl("atorvastatin");
  assert.ok(url.startsWith("https://api.fda.gov/drug/label.json?"), "openFDA base");
  assert.ok(url.includes("openfda.generic_name"), "generic name search");
  const brand = buildOpenFdaBrandLabelUrl("Lipitor");
  assert.ok(brand.includes("openfda.brand_name"), "brand name search");
}

// ---------------------------------------------------------------------------
// normalizeDrugInput
// ---------------------------------------------------------------------------

assert.equal(normalizeDrugInput("atorvastatin 20 mg"), "atorvastatin", "strips dose");
assert.equal(normalizeDrugInput("Lipitor [atorvastatin] 10MG"), "Lipitor", "strips bracket + dose");
assert.equal(normalizeDrugInput("  warfarin  "), "warfarin", "trims");
assert.equal(normalizeDrugInput(""), "", "empty stays empty");
assert.equal(normalizeDrugInput(null), "", "null stays empty");

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

assert.equal(parseRxcuiResponse({ idGroup: { rxnormId: ["11289"] } }), "11289", "rxcui parsed");
assert.equal(parseRxcuiResponse({ idGroup: {} }), null, "missing rxnormId -> null");
assert.equal(parseRxcuiResponse(null), null, "null -> null");
assert.equal(parseRxcuiResponse({}), null, "empty -> null");

{
  const cands = parseApproximateTermResponse({
    approximateGroup: { candidate: [{ rxcui: "153165", name: "Lipitor", score: "75" }] }
  });
  assert.equal(cands.length, 1, "one candidate");
  assert.equal(cands[0].rxcui, "153165", "candidate rxcui");
  assert.deepEqual(parseApproximateTermResponse({}), [], "empty -> []");
}

{
  const ings = parseIngredientResponse({
    allRelatedGroup: {
      conceptGroup: [
        { tty: "BN", conceptProperties: [{ rxcui: "153165", name: "Lipitor" }] },
        { tty: "IN", conceptProperties: [{ rxcui: "83367", name: "atorvastatin" }] }
      ]
    }
  });
  assert.equal(ings.length, 1, "only IN concepts");
  assert.equal(ings[0].rxcui, "83367", "ingredient rxcui");
  assert.deepEqual(parseIngredientResponse({}), [], "empty -> []");
}

{
  const label = parseOpenFdaLabel({
    results: [{
      openfda: { brand_name: ["Lipitor"], generic_name: ["atorvastatin"], manufacturer_name: ["Pfizer"] },
      indications_and_usage: ["1 INDICATIONS AND USAGE ..."],
      dosage_and_administration: ["2 DOSAGE AND ADMINISTRATION ..."],
      drug_interactions: ["7 DRUG INTERACTIONS ..."]
    }]
  });
  assert.equal(label.brandName, "Lipitor", "brand parsed");
  assert.equal(label.genericName, "atorvastatin", "generic parsed");
  assert.ok(label.indications.includes("INDICATIONS"), "indications parsed");
  assert.ok(label.dosage.includes("DOSAGE"), "dosage parsed");
  assert.ok(label.drugInteractions.includes("INTERACTIONS"), "interactions parsed");
  assert.equal(parseOpenFdaLabel({ results: [] }), null, "no results -> null");
  assert.equal(parseOpenFdaLabel({}), null, "empty -> null");
}

// ---------------------------------------------------------------------------
// Severity ranking
// ---------------------------------------------------------------------------

assert.ok(severityRank("major") < severityRank("moderate"), "major outranks moderate");
assert.ok(severityRank("moderate") < severityRank("minor"), "moderate outranks minor");
assert.ok(severityRank("bogus") > severityRank("minor"), "unknown sorts last");

{
  const sorted = sortInteractionsBySeverity([
    { severity: "minor" }, { severity: "major" }, { severity: "moderate" }
  ]);
  assert.deepEqual(sorted.map((x) => x.severity), ["major", "moderate", "minor"], "sorted by severity");
}

// ---------------------------------------------------------------------------
// buildDdiLookup
// ---------------------------------------------------------------------------

{
  const lookup = buildDdiLookup([[11289, 5640, 0], [11289, 1191, 1]]);
  assert.ok(lookup instanceof Map, "returns a Map");
  assert.equal(lookup.get("11289|5640"), 0, "major pair stored (sorted key)");
  assert.equal(lookup.get("1191|11289"), undefined, "key must be sorted ascending");
  assert.equal(lookup.get("11289|1191"), 1, "moderate pair stored");
  // Major wins over moderate on duplicate.
  const dup = buildDdiLookup([[11289, 5640, 1], [5640, 11289, 0]]);
  assert.equal(dup.get("11289|5640"), 0, "major wins on duplicate");
  // Bad entries skipped.
  assert.equal(buildDdiLookup([[11289, 11289, 0]]).size, 0, "self-pair skipped");
  assert.equal(buildDdiLookup("nope").size, 0, "non-array -> empty map");
}

// ---------------------------------------------------------------------------
// checkPairs against the DDInter dataset
// ---------------------------------------------------------------------------

const warfarin = { input: "warfarin", name: "warfarin", rxcui: "11289", ingredientRxcuis: [] };
const ibuprofen = { input: "ibuprofen", name: "ibuprofen", rxcui: "5640", ingredientRxcuis: [] };
const fluconazole = { input: "fluconazole", name: "fluconazole", rxcui: "4450", ingredientRxcuis: [] };
const lipitor = {
  input: "Lipitor", name: "Lipitor", rxcui: "153165",
  ingredientRxcuis: [{ rxcui: "83367", name: "atorvastatin" }]
};
const clarithro = { input: "clarithromycin", name: "clarithromycin", rxcui: "21212", ingredientRxcuis: [] };
const metformin = { input: "metformin", name: "metformin", rxcui: "6809", ingredientRxcuis: [] };

{
  // Warfarin + fluconazole is a known Major pair in DDInter 2.0.
  const findings = checkPairs([warfarin, fluconazole], DDI_LOOKUP);
  assert.equal(findings.length, 1, "warfarin+fluconazole flagged in DDInter data");
  assert.equal(findings[0].severity, "major", "DDInter severity preserved");
  assert.equal(findings[0].source, "DDInter 2.0", "source labeled");
}

{
  const findings = checkPairs([warfarin, ibuprofen], DDI_LOOKUP);
  assert.equal(findings.length, 1, "warfarin+ibuprofen flagged");
  assert.equal(findings[0].severity, "major", "bleeding pair is major");
}

{
  // Brand name resolves through the ingredient RxCUI.
  const lookup = buildDdiLookup([[83367, 21212, 1]]);
  const findings = checkPairs([lipitor, clarithro], lookup);
  assert.equal(findings.length, 1, "Lipitor+clarithromycin flagged via ingredient");
  assert.equal(findings[0].drugA, "Lipitor", "keeps user-facing names");
}

{
  // No pair in a controlled lookup -> no findings (not a silent all-clear, just no data).
  const lookup = buildDdiLookup([[11289, 5640, 0]]);
  const findings = checkPairs([warfarin, metformin], lookup);
  assert.equal(findings.length, 0, "no pair -> no findings");
}

{
  // Order of drugs must not matter.
  const a = checkPairs([ibuprofen, warfarin], DDI_LOOKUP);
  const b = checkPairs([warfarin, ibuprofen], DDI_LOOKUP);
  assert.equal(a.length, b.length, "pair order independent");
  assert.equal(a.length, 1, "one finding either way");
}

{
  // Duplicate entries for the same drug collapse to one finding.
  const findings = checkPairs([warfarin, ibuprofen, ibuprofen], DDI_LOOKUP);
  assert.equal(findings.length, 1, "duplicate pair reported once");
}

// ---------------------------------------------------------------------------
// Dataset sanity (DDInter 2.0)
// ---------------------------------------------------------------------------

assert.ok(DDI_DATASET_VERSION, "dataset has a version");
assert.ok(DDI_DATASET_SOURCE.toLowerCase().includes("ddinter"), "source names DDInter");
assert.ok(Array.isArray(DDI_PAIRS), "DDI_PAIRS is an array");
assert.ok(DDI_PAIRS.length >= 50000, `dataset has real DDInter scale (got ${DDI_PAIRS.length})`);
assert.ok(DDI_LOOKUP instanceof Map, "DDI_LOOKUP is a prebuilt Map");
assert.equal(DDI_LOOKUP.size, DDI_PAIRS.length, "lookup covers every pair");
{
  let majors = 0, moderates = 0;
  const keys = new Set();
  for (const entry of DDI_PAIRS) {
    assert.ok(Array.isArray(entry) && entry.length === 3, "compact [a,b,severity] format");
    const [a, b, s] = entry;
    assert.ok(Number.isInteger(a) && Number.isInteger(b), "RxCUIs are integers");
    assert.ok(s === 0 || s === 1, "severity is 0 (major) or 1 (moderate)");
    assert.ok(a !== b, "no self-pairs");
    if (s === 0) majors++; else moderates++;
    keys.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  assert.equal(keys.size, DDI_PAIRS.length, "no duplicate pairs");
  assert.ok(majors > 10000, `meaningful major count (got ${majors})`);
  assert.ok(moderates > 50000, `meaningful moderate count (got ${moderates})`);
  console.log(`  dataset: ${DDI_PAIRS.length} pairs (${majors} major, ${moderates} moderate)`);
}

// ---------------------------------------------------------------------------
// resolveDrug / fetchLabel with stubbed fetch (no live network)
// ---------------------------------------------------------------------------

function stubFetch(routes) {
  return async (url) => {
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) {
        return { ok: true, status: 200, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

{
  const fetchImpl = stubFetch([
    ["https://rxnav.nlm.nih.gov/REST/rxcui.json", { idGroup: { rxnormId: ["11289"] } }],
    ["https://rxnav.nlm.nih.gov/REST/rxcui/11289/allrelated.json", {
      allRelatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [{ rxcui: "11289", name: "warfarin" }] }] }
    }]
  ]);
  const result = await resolveDrug(fetchImpl, "warfarin 5 mg");
  assert.equal(result.rxcui, "11289", "exact match resolves");
  assert.equal(result.unresolved, false, "not unresolved");
  assert.equal(result.ingredientRxcuis[0].rxcui, "11289", "ingredients expanded");
}

{
  // Exact lookup misses -> approximate term fallback.
  const fetchImpl = stubFetch([
    ["https://rxnav.nlm.nih.gov/REST/rxcui.json", { idGroup: {} }],
    ["https://rxnav.nlm.nih.gov/REST/approximateTerm.json", {
      approximateGroup: { candidate: [{ rxcui: "153165", name: "Lipitor", score: "75" }] }
    }],
    ["https://rxnav.nlm.nih.gov/REST/rxcui/153165/allrelated.json", {
      allRelatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [{ rxcui: "83367", name: "atorvastatin" }] }] }
    }]
  ]);
  const result = await resolveDrug(fetchImpl, "lipiter");
  assert.equal(result.rxcui, "153165", "approximate fallback resolves");
  assert.equal(result.ingredientRxcuis[0].rxcui, "83367", "brand -> ingredient");
}

{
  // Nothing matches anywhere.
  const fetchImpl = stubFetch([
    ["https://rxnav.nlm.nih.gov/REST/rxcui.json", { idGroup: {} }],
    ["https://rxnav.nlm.nih.gov/REST/approximateTerm.json", { approximateGroup: {} }]
  ]);
  const result = await resolveDrug(fetchImpl, "notarealdrugxyz");
  assert.equal(result.unresolved, true, "unknown drug flagged unresolved");
  assert.equal(result.rxcui, null, "no rxcui");
}

{
  // Network failure surfaces (controller turns it into a friendly message).
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(() => resolveDrug(fetchImpl, "warfarin"), TypeError, "network error propagates");
}

{
  const fetchImpl = stubFetch([
    ["https://api.fda.gov/drug/label.json?search=openfda.generic_name", {
      results: [{
        openfda: { brand_name: ["Coumadin"], generic_name: ["warfarin"] },
        indications_and_usage: ["1 INDICATIONS AND USAGE ..."],
        drug_interactions: ["7 DRUG INTERACTIONS ..."]
      }]
    }]
  ]);
  const label = await fetchLabel(fetchImpl, "warfarin");
  assert.equal(label.genericName, "warfarin", "label resolved");
  assert.ok(label.indications.length > 0, "indications present");
}

{
  // Generic search misses -> brand search fallback.
  const fetchImpl = stubFetch([
    ["openfda.generic_name%3A", { results: [] }],
    ["openfda.brand_name%3A", {
      results: [{ openfda: { brand_name: ["Lipitor"], generic_name: ["atorvastatin"] }, indications_and_usage: ["uses..."] }]
    }]
  ]);
  const label = await fetchLabel(fetchImpl, "Lipitor");
  assert.equal(label.brandName, "Lipitor", "brand fallback works");
}

console.log("test-drug-lookup: all assertions passed");
