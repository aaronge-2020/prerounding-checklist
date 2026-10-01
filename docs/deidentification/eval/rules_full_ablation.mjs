import { readFileSync, writeFileSync } from "fs";
// Full rules-only ablation harness (dev-200, no base NER model).
// REPRODUCIBILITY NOTE: this imports three internal functions that are not
// exported by the shipped deid.js: expandIdentityGraphEntities,
// collectBracketedPlaceholderEntities, resolvedRedactionEntities. To rerun,
// copy site-trackbc/src (+ vendor/, data/) to a scratch dir and add the
// `export` keyword to those three function declarations, then edit the
// import path in the import statement below to point at that copy.
// Everything else called here is exported by the production module; the call
// sequence mirrors the hybrid branch of createDeidentifier().deidentifyText
// with model entities = [].

import {
  collectBracketedPlaceholderEntities,
  addStructuredSafeHarborEntities,
  mergeEntities,
  filterLikelyFalsePositiveEntities,
  expandIdentityGraphEntities,
  addTrackDAgeEntitiesPostFilter,
  resolvedRedactionEntities,
} from "/tmp/deidharness/src/vault/deid.js";

// Full rules-only ablation: replicate the hybrid pipeline's entity path
// (createDeidentifier().deidentifyText, hybrid mode) with ZERO model
// entities. All rule layers included:
//   - collectBracketedPlaceholderEntities (template placeholders)
//   - addStructuredSafeHarborEntities: Track D generators (D2,D3,D4,D5,D7,D10),
//     B/C labeled captured patterns (PATIENT NAME/DOB/MRN/ID/DATE/PHONE/EMAIL/
//     ADDRESS/FACILITY/ROOM/PROVIDER/CONTACT/ORG/OCCUPATION), directPatterns
//     (phone/email/date/address/organization/provider regexes, SSN, ZIP,
//     postcodes, NPI, credit cards, licenses, passports), addAgeEntities,
//     Track C winners, chrono temporal fallback (addTemporalPatternEntities)
//   - mergeEntities + filterLikelyFalsePositiveEntities (D6a/D6b)
//   - expandIdentityGraphEntities: rule-based identity graph (dictionary
//     names, exact structured repeats, contextual person names, alias
//     repeats, organization first-word aliases), 3 passes, no patient identity
//   - addTrackDAgeEntitiesPostFilter (D1)
//   - resolvedRedactionEntities: final D6b/D8/D9/D11/D12 filter block +
//     temporal re-merge + date timeline resolution
// NO base NER model, no model entities. Dev-200 only; held-out untouched.

const rows = readFileSync(
  "/home/hatch/workspace/deid-benchmark/meddeid/track-d/notes-dev.jsonl", "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const out = [];
const sourceHist = {};
const t0 = Date.now();
for (const [i, row] of rows.entries()) {
  const rawText = row.text;
  const bracketEntities = collectBracketedPlaceholderEntities(rawText);
  let entities = addStructuredSafeHarborEntities(rawText, bracketEntities, null, {});
  entities = filterLikelyFalsePositiveEntities(rawText, mergeEntities(entities, rawText));
  const graphResult = expandIdentityGraphEntities(rawText, entities, 3, { patientIdentity: null });
  entities = addTrackDAgeEntitiesPostFilter(rawText, graphResult.entities);
  const rendered = resolvedRedactionEntities(rawText, entities, null, {});
  const final = [];
  for (const e of rendered) {
    if (!Number.isInteger(e.start) || !Number.isInteger(e.end)) continue;
    if (e.start < 0 || e.end > rawText.length || e.end <= e.start) continue;
    final.push({ begin: e.start, end: e.end, type: String(e.label) });
    const src = String(e.source || "unknown");
    sourceHist[src] = (sourceHist[src] || 0) + 1;
  }
  out.push({ id: row.id, entities: final });
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${rows.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
writeFileSync("/home/hatch/workspace/deid-benchmark/meddeid/out/rules_full_only.json", JSON.stringify(out));
writeFileSync("/tmp/deidharness/source_hist.json", JSON.stringify(sourceHist, null, 2));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> out/rules_full_only.json`);
console.log("source histogram:", JSON.stringify(sourceHist));
