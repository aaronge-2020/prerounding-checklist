import assert from "node:assert/strict";
import {
  lookupInteraction,
  checkMedicationList,
  DDI_QUERY_TAG
} from "../src/drug-data/ddi-query.js";
import {
  DDI_PAIRS,
  DDI_MECHANISMS,
  DDI_META,
  DDI_BUNDLE_TAG
} from "../src/drug-data/ddi-pairs.data.js";

// Regression test for the "No mechanism text in the database entry" failure:
// the v1 bundle was built from DDInter bulk CSVs that carry severity only,
// so every interaction card rendered the no-mechanism fallback. The v2
// bundle joins DDInter 2.0 interaction-group records (mechanism description
// + category flags) through the per-group pair lists.

function findKey(nameA, nameB) {
  const a = nameA.toLowerCase();
  const b = nameB.toLowerCase();
  for (const [key, entry] of Object.entries(DDI_PAIRS)) {
    const names = (entry.d || []).map((n) => String(n).toLowerCase());
    if (names.some((n) => n.includes(a)) && names.some((n) => n.includes(b))) {
      return key;
    }
  }
  return null;
}

{
  // Bundle identity: the query layer must resolve against the v2 bundle.
  assert.equal(DDI_BUNDLE_TAG, "20261001-ddinter-v2");
  assert.equal(DDI_QUERY_TAG, "20261001-ddi-query-v2");
  assert.ok(DDI_MECHANISMS && typeof DDI_MECHANISMS === "object");
  // Only groups referenced by pairs are emitted (unreferenced groups are
  // dead weight). 5,384 groups carry the 168,479 pairs with known severity.
  assert.ok(
    Object.keys(DDI_MECHANISMS).length > 5000,
    `expected >5000 mechanism descriptions, got ${Object.keys(DDI_MECHANISMS).length}`
  );
  assert.ok(DDI_META.mechanism_descriptions > 5000);
}

{
  // The exact pair from the bug report: warfarin + fluconazole.
  const key = findKey("warfarin", "fluconazole");
  assert.ok(key, "warfarin+fluconazole pair present in bundle");
  const [rxA, rxB] = key.split("|");
  const hit = lookupInteraction(rxA, rxB);
  assert.ok(hit, "lookupInteraction finds warfarin+fluconazole");
  assert.equal(hit.severity, "Major");
  assert.ok(
    hit.mechanisms.length > 0,
    "warfarin+fluconazole carries mechanism text (was: 'No mechanism text')"
  );
  assert.ok(
    hit.mechanisms.some((t) => t.toLowerCase().includes("fluconazole")),
    "mechanism text mentions fluconazole"
  );
  assert.ok(Array.isArray(hit.mechanismCategories));
}

{
  // Second gate pair: clarithromycin + simvastatin. DDInter writes this
  // group-level mechanism at the drug-class level ("potent inhibitors of
  // CYP450 3A4"), naming simvastatin but not clarithromycin.
  const key = findKey("clarithromycin", "simvastatin");
  assert.ok(key, "clarithromycin+simvastatin pair present in bundle");
  const [rxA, rxB] = key.split("|");
  const hit = lookupInteraction(rxA, rxB);
  assert.ok(hit.mechanisms.length > 0, "clarithromycin+simvastatin has mechanism text");
  assert.ok(
    hit.mechanisms.some((t) =>
      t.toLowerCase().includes("simvastatin") ||
      t.toLowerCase().includes("clarithromycin")
    ),
    "mechanism text mentions simvastatin or clarithromycin"
  );
}

{
  // Referential integrity: every group reference resolves to a description,
  // except DDInter's group -1 sentinel, which explicitly means "DDInter
  // provides no mechanism description for this pair" (all such pairs are
  // severity Unknown). The query layer skips -1, yielding an empty
  // mechanisms array that the UI renders honestly.
  let checked = 0;
  for (const entry of Object.values(DDI_PAIRS)) {
    for (const gid of entry.g || []) {
      checked++;
      if (String(gid) === "-1") continue;
      assert.ok(
        DDI_MECHANISMS[String(gid)] && DDI_MECHANISMS[String(gid)].t,
        `dangling mechanism group ${gid}`
      );
    }
  }
  assert.ok(checked > 100000, `expected >100k group references, got ${checked}`);
}

{
  // Coverage: every pair DDInter characterizes with a known severity
  // (Major/Moderate/Minor) must carry mechanism text. Pairs DDInter rates
  // "Unknown" live in group -1, where DDInter itself provides no mechanism
  // description; those honestly render the no-mechanism note. This gate
  // keeps the "no mechanism" case aligned with DDInter's own uncertainty,
  // never a pipeline gap.
  let withText = 0;
  let knownSeverity = 0;
  let unknownWithoutText = 0;
  for (const entry of Object.values(DDI_PAIRS)) {
    const gids = entry.g || [];
    const hasText = gids.some((gid) => DDI_MECHANISMS[String(gid)]?.t);
    if (entry.s === "Unknown") {
      if (!hasText) unknownWithoutText++;
    } else {
      knownSeverity++;
      if (hasText) withText++;
    }
  }
  assert.equal(
    withText,
    knownSeverity,
    `all ${knownSeverity} known-severity pairs must have mechanism text ` +
    `(${withText} do); ${unknownWithoutText} Unknown-severity pairs ` +
    `honestly lack DDInter mechanism text`
  );
}

{
  // checkMedicationList surfaces mechanisms on interaction objects.
  const key = findKey("warfarin", "fluconazole");
  const [rxA, rxB] = key.split("|");
  const res = checkMedicationList([rxA, rxB]);
  assert.equal(res.interactions.length, 1);
  assert.ok(res.interactions[0].mechanisms.length > 0);
}

console.log("test-ddi-mechanisms: all assertions passed");
