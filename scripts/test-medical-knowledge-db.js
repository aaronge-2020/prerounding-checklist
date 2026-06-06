import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMedicalKnowledgeDatabase,
  loadMedicalKnowledgeDatabase,
  validateMedicalKnowledgeDatabase
} from "./build-medical-knowledge-db.js";
import {
  complaintModules,
  complaintSourceRegistry,
  medicalKnowledgeDbManifest
} from "../medical-knowledge-db.js";

const database = loadMedicalKnowledgeDatabase();
const validation = validateMedicalKnowledgeDatabase(database);
assert.ok(validation.ok, validation.issues.join("\n"));
assert.equal(validation.moduleCount, complaintModules.length, "generated module count should match source database");
assert.equal(validation.sourceCount, complaintSourceRegistry.length, "generated source count should match source database");
assert.equal(medicalKnowledgeDbManifest.schema_version, "medical_knowledge_database_v1");

const moduleIds = new Set(complaintModules.map((module) => module.id));
assert.ok(moduleIds.has("chest_pain_v1"), "database should include chest pain module");
assert.ok(moduleIds.has("hyperglycemia_possible_dka_v1"), "database should include DKA/HHS module");

const dkaSource = complaintSourceRegistry.find((source) => source.id === "ADA_HYPERGLYCEMIC_CRISES_2024");
assert.ok(dkaSource?.url?.startsWith("https://"), "DKA source should retain URL provenance");

assert.doesNotThrow(() => buildMedicalKnowledgeDatabase({ check: true }), "generated medical-knowledge-db.js should be current");

const complaintCdsSource = readFileSync("complaint-cds.js", "utf8");
assert.ok(/from\s+["']\.\/medical-knowledge-db\.js["']/.test(complaintCdsSource), "complaint CDS logic should import generated medical knowledge");
assert.ok(!complaintCdsSource.includes("ADA_HYPERGLYCEMIC_CRISES_2024"), "medical content should not live in complaint-cds.js");

console.log("Medical knowledge database tests passed.");
