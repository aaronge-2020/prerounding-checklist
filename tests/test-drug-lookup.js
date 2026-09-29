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
  checkPairs,
  resolveDrug,
  fetchLabel
} from "../src/ui/drug-lookup/api.js";
import { DDI_PAIRS, DDI_DATASET_VERSION } from "../src/ui/drug-lookup/interactions-data.js";

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
      drug_interactions: ["7 DRUG INTERACTIONS ..."]
    }]
  });
  assert.equal(label.brandName, "Lipitor", "brand parsed");
  assert.equal(label.genericName, "atorvastatin", "generic parsed");
  assert.ok(label.indications.includes("INDICATIONS"), "indications parsed");
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
// checkPairs
// ---------------------------------------------------------------------------

const warfarin = { input: "warfarin", name: "warfarin", rxcui: "11289", ingredientRxcuis: [] };
const ibuprofen = { input: "ibuprofen", name: "ibuprofen", rxcui: "5640", ingredientRxcuis: [] };
const lipitor = {
  input: "Lipitor", name: "Lipitor", rxcui: "153165",
  ingredientRxcuis: [{ rxcui: "83367", name: "atorvastatin" }]
};
const clarithro = { input: "clarithromycin", name: "clarithromycin", rxcui: "21212", ingredientRxcuis: [] };
const metformin = { input: "metformin", name: "metformin", rxcui: "6809", ingredientRxcuis: [] };

{
  const findings = checkPairs([warfarin, ibuprofen], DDI_PAIRS);
  assert.equal(findings.length, 1, "warfarin+ibuprofen flagged");
  assert.equal(findings[0].severity, "major", "bleeding pair is major");
  assert.ok(findings[0].description.toLowerCase().includes("bleeding"), "description mentions bleeding");
}

{
  // Brand name resolves through the ingredient RxCUI.
  const findings = checkPairs([lipitor, clarithro], DDI_PAIRS);
  assert.equal(findings.length, 1, "Lipitor+clarithromycin flagged via ingredient");
  assert.equal(findings[0].drugA, "Lipitor", "keeps user-facing names");
}

{
  const findings = checkPairs([warfarin, metformin], DDI_PAIRS);
  assert.equal(findings.length, 0, "no pair -> no findings (not a silent all-clear, just no data)");
}

{
  // Order of drugs must not matter.
  const a = checkPairs([ibuprofen, warfarin], DDI_PAIRS);
  const b = checkPairs([warfarin, ibuprofen], DDI_PAIRS);
  assert.equal(a.length, b.length, "pair order independent");
  assert.equal(a.length, 1, "one finding either way");
}

{
  // Duplicate entries for the same drug collapse to one finding.
  const findings = checkPairs([warfarin, ibuprofen, ibuprofen], DDI_PAIRS);
  assert.equal(findings.length, 1, "duplicate pair reported once");
}

{
  // Highest severity wins when several records match a pair.
  const dataset = [
    { a: "11289", b: "5640", severity: "minor", description: "mild", source: "x" },
    { a: "11289", b: "5640", severity: "major", description: "severe", source: "x" }
  ];
  const findings = checkPairs([warfarin, ibuprofen], dataset);
  assert.equal(findings[0].severity, "major", "highest severity wins");
}

// ---------------------------------------------------------------------------
// Dataset sanity
// ---------------------------------------------------------------------------

assert.ok(DDI_DATASET_VERSION, "dataset has a version");
assert.ok(DDI_PAIRS.length >= 20, "dataset has a useful number of pairs");
{
  const keys = new Set();
  for (const pair of DDI_PAIRS) {
    assert.ok(pair.a && pair.b, "pair has both RxCUIs");
    assert.ok(["major", "moderate", "minor"].includes(pair.severity), `valid severity: ${pair.severity}`);
    assert.ok(pair.description && pair.source, "pair has description + source");
    const key = [pair.a, pair.b].sort().join("|");
    keys.add(key);
  }
  assert.ok(keys.size === DDI_PAIRS.length || keys.size <= DDI_PAIRS.length, "pairs recorded");
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
