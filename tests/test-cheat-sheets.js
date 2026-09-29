// Plain node tests for src/ui/cheat-sheets/search.js.
// Run: node tests/test-cheat-sheets.js   (exits non-zero on failure)
import { searchSheets, getSheetById, scoreSheet } from "../src/ui/cheat-sheets/search.js";

const fixture = [
  {
    id: "chest-pain",
    title: "Chest Pain",
    aliases: ["ACS", "angina"],
    history: [{ id: "h1", system: "Cardiac", question: "Onset?", listenFor: [], why: null }],
    exam: [{ id: "e1", system: "Cardiac", maneuver: "Auscultate", findings: [], how: null, why: null }],
    reviewNeeded: false
  },
  {
    id: "abdominal-pain",
    title: "Abdominal Pain",
    aliases: ["belly pain", "acute abdomen"],
    history: [{ id: "h2", system: "GI", question: "Location?", listenFor: [], why: null }],
    exam: [],
    reviewNeeded: false
  },
  {
    id: "ob-triage",
    title: "OB Triage",
    aliases: ["labor check"],
    history: [{ id: "h3", system: "Obstetric", question: "Contractions?", listenFor: [], why: null }],
    exam: [{ id: "e3", system: "Pelvic", maneuver: "Sterile speculum", findings: [], how: null, why: null }],
    reviewNeeded: true
  }
];

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const ids = (results) => results.map((sheet) => sheet.id);

// Empty query returns every sheet in source order.
check("empty query returns all", ids(searchSheets(fixture, "")), ["chest-pain", "abdominal-pain", "ob-triage"]);
check("blank query returns all", ids(searchSheets(fixture, "   ")), ["chest-pain", "abdominal-pain", "ob-triage"]);
check("null query returns all", ids(searchSheets(fixture, null)), ["chest-pain", "abdominal-pain", "ob-triage"]);

// Case-insensitivity.
check("case-insensitive title match", ids(searchSheets(fixture, "CHEST")), ["chest-pain"]);

// Prefix-friendly typing (phone keyboard): "abd" finds Abdominal Pain.
check("prefix match on title", ids(searchSheets(fixture, "abd")), ["abdominal-pain"]);

// Substring matching.
check("substring match on title", ids(searchSheets(fixture, "pain")), ["abdominal-pain", "chest-pain"]);

// Aliases participate in search.
check("alias match", ids(searchSheets(fixture, "acs")), ["chest-pain"]);
check("alias substring match", ids(searchSheets(fixture, "belly")), ["abdominal-pain"]);

// Id match works.
check("id match", ids(searchSheets(fixture, "ob-triage")), ["ob-triage"]);

// System names participate in search.
check("system match", ids(searchSheets(fixture, "cardiac")), ["chest-pain"]);
check("system prefix match", ids(searchSheets(fixture, "obs")), ["ob-triage"]);

// Ranking: a title hit outranks an alias hit. "labor check" is an alias of
// OB Triage, but "labor" is not in any title — verify the general rule with
// a synthetic case: title match must come first.
const ranked = [
  { id: "a", title: "Chest Wall Pain", aliases: ["costochondritis"], history: [], exam: [] },
  { id: "b", title: "COPD", aliases: ["chest tightness"], history: [], exam: [] }
];
check("title hit outranks alias hit", ids(searchSheets(ranked, "chest")), ["a", "b"]);
check("scoreSheet ranks title prefix above alias prefix",
  scoreSheet(ranked[0], "chest") > scoreSheet(ranked[1], "chest"), true);

// No match returns an empty list (never throws, never returns everything).
check("no match returns empty", ids(searchSheets(fixture, "zzz-nope")), []);

// getSheetById.
check("getSheetById found", getSheetById(fixture, "abdominal-pain")?.title, "Abdominal Pain");
check("getSheetById missing", getSheetById(fixture, "nope"), null);
check("getSheetById null id", getSheetById(fixture, null), null);
check("getSheetById non-array", getSheetById(null, "chest-pain"), null);

// Robustness: malformed input never throws.
check("null sheets", ids(searchSheets(null, "chest")), []);
check("sheets with holes", ids(searchSheets([null, fixture[0], undefined], "")), ["chest-pain"]);

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll cheat-sheet search tests passed.");
