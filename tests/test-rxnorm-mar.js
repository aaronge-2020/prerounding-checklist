// Offline RxNorm concept resolution for MAR medication order text.
// Covers: brand -> generic, strength/form capture, combination splitting,
// topical vs systemic distinction, graceful degradation on unknown drugs,
// never-throw guarantees, and MAR parser integration (every parsed medication
// carries `concepts` while existing fields stay intact).
import assert from "node:assert/strict";
import {
  resolveMedicationConcepts,
  rxNormAssetSize,
  RXNORM_RESOLVER_TAG
} from "../src/patient-context/rxnorm-resolve.js";
import { parseClinicalExport } from "../src/patient-context/clinical-export-parser.js";

assert.equal(RXNORM_RESOLVER_TAG, "20260929-rxnorm-mar-v1");
assert.ok(
  rxNormAssetSize() > 1000,
  `expected a populated RxNorm bare-name asset, got ${rxNormAssetSize()} entries`
);

// Brand name resolves to the generic ingredient concept.
assert.deepEqual(resolveMedicationConcepts("Give: Lipitor 20 mg PO daily"), [
  {
    rxcui: "83367",
    name: "atorvastatin",
    tty: "IN",
    strength: "20 mg",
    doseForm: "",
    route: "PO"
  }
]);

// Strength and dose-form capture; "oral" normalizes to the PO route.
const tablet = resolveMedicationConcepts("atorvastatin 20 mg oral tablet");
assert.equal(tablet.length, 1);
assert.equal(tablet[0].rxcui, "83367");
assert.equal(tablet[0].strength, "20 mg");
assert.equal(tablet[0].doseForm, "tablet");
assert.equal(tablet[0].route, "PO");

// Salt forms resolve to the same ingredient concept.
const salt = resolveMedicationConcepts("atorvastatin calcium 20 mg PO daily");
assert.equal(salt.length, 1);
assert.equal(salt[0].rxcui, "83367");
assert.equal(salt[0].name, "atorvastatin");

// Combination products split into one concept per ingredient.
const combo = resolveMedicationConcepts("Give: sacubitril-valsartan 49/51 mg PO BID");
assert.equal(combo.length, 2);
assert.deepEqual(
  combo.map((concept) => concept.name).sort(),
  ["sacubitril", "valsartan"]
);
for (const concept of combo) {
  assert.equal(concept.tty, "IN");
  assert.equal(concept.strength, "49/51 mg");
  assert.equal(concept.route, "PO");
  assert.ok(concept.rxcui, "each ingredient concept carries an RxCUI");
}
assert.notEqual(combo[0].rxcui, combo[1].rxcui);

// Topical formulations stay distinguishable from systemic ones via
// doseForm/route.
const topical = resolveMedicationConcepts("hydrocortisone cream 1% apply topical BID");
assert.equal(topical.length, 1);
assert.equal(topical[0].doseForm, "cream");
assert.equal(topical[0].route, "topical");
assert.equal(topical[0].strength, "1%");

// Unknown medications degrade gracefully to [].
assert.deepEqual(resolveMedicationConcepts("Give: unobtanium 10 mg PO daily"), []);
assert.deepEqual(resolveMedicationConcepts(""), []);
assert.deepEqual(resolveMedicationConcepts("   "), []);
assert.deepEqual(resolveMedicationConcepts(null), []);
assert.deepEqual(resolveMedicationConcepts(undefined), []);

// MAR parser integration: every parsed medication carries `concepts`
// alongside the raw orderText; existing fields are unchanged.
const syntheticMar = `
** INPATIENT ORDERS **
======================================================================
Location | | |
Start Date Stop Date | Action Status
---------------------------------------------------------------------
INPATIENT | |
Hospital Day 2 Hospital Day 4 | 0900 |
@08:00 @12:00 | |
ACETAMINOPHEN ORAL TAB | |
 ACETAMINOPHEN 325MG TAB Give: 650MG PO Q6H PRN | |
 RPH: ABC RN: xyz | |
 Special Instructions:
 Use for synthetic mild pain.
---------------------------------------------------------------------
INPATIENT | |
Hospital Day 2 Hospital Day 2 | 1000 |
@09:00 @10:05 | GIVEN Hospital Day 2@10:05:00 xyz
HYDRALAZINE ORAL TAB | |
 HYDRALAZINE HCL 25MG TAB Give: 25MG PO ONCE | |
 ***DISCONTINUED | |
 RPH: ABC RN: xyz | |
---------------------------------------------------------------------
MEDICATION ADMINISTRATION HISTORY for Hospital Day 2
`;

const parsed = parseClinicalExport(syntheticMar);
assert.equal(parsed.recognized, true);
assert.equal(parsed.formatId, "cprs_mar");
assert.equal(parsed.itemCount, 2);

const rows = parsed.structuredData.groups[0].rows;
assert.equal(rows.length, 2);
for (const row of rows) {
  assert.ok(Array.isArray(row.concepts), `row ${row.id} must carry a concepts array`);
}

const acetaminophen = rows.find((row) => /ACETAMINOPHEN/.test(row.name));
assert.ok(acetaminophen, "acetaminophen row present");
// Existing row fields are unchanged.
assert.match(acetaminophen.name, /ACETAMINOPHEN 325MG TAB Give: 650MG PO Q6H PRN/);
assert.equal(acetaminophen.dose, "");
assert.equal(acetaminophen.frequency, "");
assert.equal(acetaminophen.route, "");
assert.match(acetaminophen.timing, /Hospital Day 2/);
assert.match(acetaminophen.instructions, /Use for synthetic mild pain/);
// New concepts field: the administered 650 mg dose resolves to acetaminophen.
assert.ok(acetaminophen.concepts.length > 0, "acetaminophen resolves to a concept");
assert.equal(acetaminophen.concepts[0].strength, "650 mg");
assert.equal(acetaminophen.concepts[0].route, "PO");

const hydralazine = rows.find((row) => /HYDRALAZINE/.test(row.name));
assert.ok(hydralazine, "hydralazine row present");
assert.ok(hydralazine.concepts.length > 0, "hydralazine resolves to a concept");
assert.ok(hydralazine.status.includes("DISCONTINUED"), "hydralazine shows discontinued");

console.log(`test-rxnorm-mar passed (${rxNormAssetSize()} bare-name entries)`);
