import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  nonNameClinicalWords,
  nonNameClinicalPhrases,
  clinicalAnchorWords
} from "../data/clinical-guard-export.js";

const mesh = JSON.parse(readFileSync(new URL("../data/clinical-guard-mesh-terms.json", import.meta.url), "utf8"));

assert.equal(mesh._mesh_year, 2026, "the committed terminology must identify the current MeSH release");
assert.match(mesh._source_url, /nlmpubs\.nlm\.nih\.gov\/projects\/mesh\/MESH_FILES\/xmlmesh\/desc2026\.gz$/);
assert.match(mesh._source_sha256, /^[a-f0-9]{64}$/);
assert.ok(mesh.words.length >= 90000, "the offline MeSH word bundle should contain the expected vocabulary scale");
assert.ok(mesh.phrases.length >= 200000, "the offline MeSH phrase bundle should contain the expected vocabulary scale");

assert.ok(nonNameClinicalWords.includes("myocardial"), "the generated guard should include myocardial");
assert.ok(nonNameClinicalWords.includes("infarction"), "the generated guard should include infarction");
assert.ok(nonNameClinicalPhrases.includes("myocardial infarction"), "the generated guard should include the clinical phrase");
assert.ok(clinicalAnchorWords.includes("myocardial"), "the generated guard should include a clinical anchor");
assert.equal(existsSync(new URL("../data/.mesh-descriptors.xml.gz", import.meta.url)), false, "the compressed source cache must not ship in the app bundle");

console.log(`Clinical guard vocabulary verified: MeSH ${mesh._mesh_year}, ${mesh.words.length.toLocaleString()} words, ${mesh.phrases.length.toLocaleString()} phrases.`);
