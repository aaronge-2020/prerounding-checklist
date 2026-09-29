// Coverage gate: every systematic formulary drug must resolve in the RxNorm
// asset, or carry a reviewed expected-gap entry. This is the structural fix
// for the 2026-09-29 fragility incident (oxytocin/terbutaline/tranexamic acid
// silently absent): missing coverage now FAILS the suite instead of silently
// omitting the drug from consult context.
//
// Fixtures (committed to the repo so the gate runs anywhere):
//   tests/rxnorm-formulary.coverage.json      [{term, sources[]}]
//   tests/rxnorm-formulary.expected-gaps.json [{term, norm_key, reason, reviewed}]
//
// Also covers the consult visibility contract: unresolved medications render
// a visible "NOT checked for interactions" flag (never silently dropped),
// unresolved flags sort before resolved lines (truncation safety), and empty
// medication lists still produce no block.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveMedicationConcepts,
  rxNormAssetSize
} from "../src/patient-context/rxnorm-resolve.js";
import { RXNORM_BARE_NAMES } from "../src/patient-context/rxnorm-bare-names.data.js";
import { buildMedicationContextBlock } from "../src/ai/ap-generator.js";

const here = dirname(fileURLToPath(import.meta.url));
const coverage = JSON.parse(
  readFileSync(join(here, "rxnorm-formulary.coverage.json"), "utf8")
);
const expectedGaps = JSON.parse(
  readFileSync(join(here, "rxnorm-formulary.expected-gaps.json"), "utf8")
);

function normKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Fixture sanity ----
assert.ok(
  coverage.length > 700,
  `coverage fixture looks truncated: ${coverage.length} terms`
);
const gapKeys = new Set(expectedGaps.map((g) => g.norm_key));
for (const g of expectedGaps) {
  assert.ok(g.term && g.norm_key && g.reason && g.reviewed,
    `expected-gap entry missing fields: ${JSON.stringify(g)}`);
  assert.equal(g.norm_key, normKey(g.term),
    `expected-gap norm_key mismatch for ${g.term}`);
}

// ---- The gate: every coverage term resolves or has a reviewed gap ----
const coverageKeys = new Set();
let resolved = 0;
const failures = [];
for (const { term } of coverage) {
  const key = normKey(term);
  coverageKeys.add(key);
  if (Object.prototype.hasOwnProperty.call(RXNORM_BARE_NAMES, key)) {
    resolved += 1;
  } else if (gapKeys.has(key)) {
    // reviewed expected gap — visible, documented, not silent
  } else {
    failures.push(term);
  }
}
assert.deepEqual(
  failures,
  [],
  `${failures.length} formulary terms have NO asset entry and NO reviewed gap: ${failures.slice(0, 10).join("; ")}${failures.length > 10 ? "…" : ""}`
);

// ---- No orphaned or stale gap entries ----
const orphans = [...gapKeys].filter((k) => !coverageKeys.has(k));
assert.deepEqual(
  orphans,
  [],
  `${orphans.length} expected-gap entries match no coverage term (stale): ${orphans.slice(0, 10).join(", ")}`
);

console.log(
  `formulary gate: ${coverage.length} terms, ${resolved} resolve in asset, ` +
  `${gapKeys.size} reviewed gaps, 0 unaccounted`
);

// Carbetocin (OB drug, not FDA-approved, no RxNorm concept) must be a
// VISIBLE reviewed gap — the exact failure mode this gate exists to prevent.
assert.ok(gapKeys.has("carbetocin"),
  "carbetocin must be a documented expected gap, not a silent omission");

// ---- Representative newly-enumerated drugs resolve at runtime ----
for (const [text, rxcui] of [
  ["Tylenol 500 mg PO", "161"],               // brand -> generic ingredient
  ["asa 81 mg PO daily", "1191"],              // common synonym via v2 variants
  ["insulin glargine 10 units SC", "274783"]   // official IN enumeration
]) {
  const concepts = resolveMedicationConcepts(text);
  assert.ok(
    concepts.some((c) => c.rxcui === rxcui),
    `${text} should resolve to RxCUI ${rxcui}, got ${JSON.stringify(concepts.map((c) => c.rxcui))}`
  );
}

// ---- Consult visibility contract ----
const mixed = buildMedicationContextBlock([
  "Fictionaldrugib 50 mg PO",
  "Oxytocin 10 units IM"
]);
assert.ok(mixed.includes("NOT checked for interactions"),
  "unresolved medication must render a visible safety flag");
assert.ok(mixed.includes("Fictionaldrugib 50 mg PO"),
  "unresolved medication text must stay visible");
assert.ok(mixed.includes("oxytocin (RxCUI 7824)"),
  "resolved medication still renders normally");
// Unresolved flags sort BEFORE resolved lines so the 4,000-char truncation
// can never hide the safety warning.
assert.ok(
  mixed.indexOf("NOT checked for interactions") < mixed.indexOf("oxytocin (RxCUI 7824)"),
  "unresolved safety flags must precede resolved lines"
);

assert.equal(buildMedicationContextBlock([]), "",
  "empty medication list still produces no block");
assert.equal(buildMedicationContextBlock(["   ", null]), "",
  "blank-only medication list still produces no block");

const onlyUnresolved = buildMedicationContextBlock(["Fictionaldrugib 50 mg PO"]);
assert.ok(onlyUnresolved.includes("MEDICATION CONTEXT"),
  "all-unresolved list still emits the block (with flags, not silence)");
assert.ok(onlyUnresolved.includes("NOT checked for interactions"));

console.log("consult visibility contract passed");
console.log(`test-rxnorm-formulary passed (${rxNormAssetSize()} bare-name entries)`);
