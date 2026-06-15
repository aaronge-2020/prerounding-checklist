import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  applyWorkupChangeSet,
  buildWorkupAuthoringSnapshot,
  cloneJson,
  exportModuleEntriesFromSnapshot,
  isInternalPathwayNode,
  makeWorkupChangeSet,
  sectionPayloadFromModule,
  validateAuthoringSnapshotNoPatientData,
  workupSectionDefinitions
} from "../workup-authoring.js";

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
}

function loadKnowledge() {
  const manifest = readJson("medical-knowledge/manifest.json");
  const sourceRegistry = readJson(manifest.source_registry);
  const moduleEntries = manifest.complaint_modules.map((modulePath) => ({
    filePath: modulePath,
    envelope: readJson(modulePath)
  }));
  return { manifest, sourceRegistry, moduleEntries };
}

function collectTreeNodes(root, out = []) {
  if (!root || typeof root !== "object") return out;
  out.push(root);
  for (const child of Array.isArray(root.children) ? root.children : []) {
    collectTreeNodes(child, out);
  }
  return out;
}

const source = loadKnowledge();
const snapshot = buildWorkupAuthoringSnapshot(source);

assert.equal(snapshot.schema, "workup_authoring_snapshot_v1");
assert.equal(snapshot.workups.length, source.manifest.complaint_modules.length, "Every manifest module should import as a workup row.");
assert.equal(
  snapshot.workup_sections.length,
  snapshot.workups.length * workupSectionDefinitions.length,
  "Every workup should import with the full section tab model."
);
assert.ok(snapshot.sources.length > 0, "Source registry rows should be imported for provenance pickers.");
assert.ok(snapshot.workup_items.length > 0, "Structured section rows should be extracted from modules.");
assert.ok(snapshot.pathway_trees.length > 0, "Pathway trees should be normalized into pathway_trees.");
assert.ok(snapshot.pathway_nodes.length > snapshot.pathway_trees.length, "Pathway tree nodes should be flattened for node-level authoring.");

const fullTreeNodes = snapshot.pathway_trees.flatMap((tree) => collectTreeNodes(tree.payload?.root));
assert.ok(
  fullTreeNodes.some((node) => isInternalPathwayNode(node)),
  "Canonical pathway tree payloads should retain internal traversal guards for missing-data routing."
);
assert.equal(
  snapshot.pathway_nodes.some((row) => isInternalPathwayNode(row.payload)),
  false,
  "Author-facing pathway_nodes must exclude hidden/internal missing-data guard nodes."
);
assert.equal(
  snapshot.pathway_nodes.some((row) => /^missing data needed/i.test(row.label || "")),
  false,
  "Author-facing pathway node labels must not show missing-data placeholder endpoints."
);

const privacyAudit = validateAuthoringSnapshotNoPatientData(snapshot);
assert.deepEqual(privacyAudit.issues, [], "Authoring import must not include patient/vault-shaped payload fields.");

const exportedWithoutChanges = exportModuleEntriesFromSnapshot(snapshot);
for (const exported of exportedWithoutChanges) {
  assert.deepEqual(
    exported.envelope,
    readJson(exported.file_path),
    `Import/export without change sets should not drift content for ${exported.file_path}.`
  );
}

const dkaEntry = source.moduleEntries.find((entry) => entry.envelope.module.id === "hyperglycemia_possible_dka_v1");
assert.ok(dkaEntry, "Expected DKA workup fixture to exist.");
const originalEnvelope = dkaEntry.envelope;
const originalModule = originalEnvelope.module;
const beforeTree = sectionPayloadFromModule(originalModule, "clinical_pathway_tree_v1");
const afterTree = cloneJson(beforeTree);
afterTree.title = `${afterTree.title || originalModule.label} - reviewer draft`;
afterTree.root = {
  ...afterTree.root,
  label: `${afterTree.root.label} [authoring draft]`
};

const treeChangeSet = makeWorkupChangeSet({
  workupId: originalModule.id,
  sectionKey: "clinical_pathway_tree_v1",
  beforeSnapshot: beforeTree,
  afterSnapshot: afterTree,
  sourceIds: ["ADA_HYPERGLYCEMIC_CRISES_2024"],
  reviewStatus: "approved",
  exportReady: true,
  reviewerNotes: "Section safety regression fixture."
});

assert.equal(treeChangeSet.schema, "workup_change_set_v1");
assert.equal(treeChangeSet.workupId, originalModule.id);
assert.equal(treeChangeSet.workup_id, originalModule.id);
assert.equal(treeChangeSet.sectionKey, "clinical_pathway_tree_v1");
assert.equal(treeChangeSet.section_key, "clinical_pathway_tree_v1");
assert.equal(treeChangeSet.reviewStatus, "approved");
assert.equal(treeChangeSet.exportReady, true);
assert.equal(treeChangeSet.operations.length, 1);
assert.equal(treeChangeSet.operations[0].op, "replace_section");

const changedEnvelope = applyWorkupChangeSet(originalEnvelope, treeChangeSet);
assert.equal(changedEnvelope.module.clinical_pathway_tree_v1.root.label, afterTree.root.label);
for (const preservedKey of [
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam",
  "safetyChecks",
  "initialTests",
  "clinical_cutoff_criteria",
  "redFlags",
  "dispositionRules",
  "decisionTrees",
  "treatmentOptions",
  "differentialBuckets",
  "source_ids",
  "population",
  "triggers",
  "complaint_group",
  "version",
  "status"
]) {
  assert.deepEqual(
    changedEnvelope.module[preservedKey],
    originalModule[preservedKey],
    `Pathway-only change sets must preserve module.${preservedKey}.`
  );
}

const changedSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [treeChangeSet]
});
const changedExport = exportModuleEntriesFromSnapshot(changedSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.ok(changedExport, "Approved change set should export the changed workup.");
assert.equal(changedExport.envelope.module.clinical_pathway_tree_v1.title, afterTree.title);
assert.deepEqual(changedExport.envelope.module.requiredQuestions, originalModule.requiredQuestions);
assert.deepEqual(changedExport.envelope.module.requiredExam, originalModule.requiredExam);
assert.deepEqual(changedExport.envelope.module.initialTests, originalModule.initialTests);
assert.deepEqual(changedExport.envelope.module.redFlags, originalModule.redFlags);

const draftSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...treeChangeSet, reviewStatus: "draft", review_status: "draft", exportReady: false, export_ready: false }]
});
const draftExport = exportModuleEntriesFromSnapshot(draftSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  draftExport.envelope.module.clinical_pathway_tree_v1,
  originalModule.clinical_pathway_tree_v1,
  "Draft change sets should not export unless explicitly included."
);

const approvedButNotReadySnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...treeChangeSet, exportReady: false, export_ready: false }]
});
const approvedButNotReadyExport = exportModuleEntriesFromSnapshot(approvedButNotReadySnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  approvedButNotReadyExport.envelope.module.clinical_pathway_tree_v1,
  originalModule.clinical_pathway_tree_v1,
  "Approved change sets must still require export_ready=true before writing JSON."
);

const readyButDraftSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...treeChangeSet, reviewStatus: "draft", review_status: "draft" }]
});
const readyButDraftExport = exportModuleEntriesFromSnapshot(readyButDraftSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  readyButDraftExport.envelope.module.clinical_pathway_tree_v1,
  originalModule.clinical_pathway_tree_v1,
  "Export-ready change sets must still require reviewer approval before writing JSON."
);

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const migrationSql = readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort()
  .map((fileName) => readFileSync(new URL(fileName, migrationsDir), "utf8"))
  .join("\n\n");
for (const requiredSnippet of [
  "create table if not exists public.workups",
  "create table if not exists public.workup_author_assignments",
  "create table if not exists public.workup_sections",
  "create table if not exists public.workup_items",
  "create table if not exists public.pathway_trees",
  "create table if not exists public.pathway_nodes",
  "create table if not exists public.sources",
  "create table if not exists public.review_cases",
  "create table if not exists public.change_sets",
  "source_id text not null unique",
  "alter table public.change_sets enable row level security",
  "can_edit_workup_content",
  "assigned authors can draft their own change sets",
  "assigned authors can read workups",
  "assigned authors can read pathway nodes",
  "revoke execute on function public.can_edit_workup_content(text) from public",
  "grant execute on function public.can_edit_workup_content(text) to authenticated, service_role",
  "reviewers can approve exportable change sets",
  "reviewers can insert reviewed change sets",
  "workups_public_catalog_status_title_idx",
  "workup_sections_public_catalog_order_idx",
  "workup_sections_source_ids_gin_idx",
  "change_sets_review_status_idx",
  "workup_items_section_idx",
  "using gin(source_ids)"
]) {
  assert.ok(migrationSql.includes(requiredSnippet), `Migration should include: ${requiredSnippet}`);
}
const finalChangeSetReadPolicy = migrationSql.slice(migrationSql.lastIndexOf('create policy "authors can read relevant change sets"'));
assert.match(finalChangeSetReadPolicy, /public\.can_edit_workup_content\(workup_id\)/, "Final change-set read policy should require assignment/reviewer permission.");
assert.doesNotMatch(finalChangeSetReadPolicy, /or review_status = 'approved'/, "Final change-set read policy should not make approved changes globally readable.");
assert.doesNotMatch(migrationSql, /generated always as \(id\)/i, "Import rows should not target a generated source_id column.");

const packageJson = readJson("package.json");
assert.equal(packageJson.scripts["import:medical-knowledge"], "node scripts/import-medical-knowledge.js");
assert.equal(packageJson.scripts["export:medical-knowledge"], "node scripts/export-medical-knowledge.js");
assert.equal(packageJson.scripts["test:workup-authoring"], "node scripts/test-workup-authoring.js");

console.log("Workup authoring import/export and section-safety tests passed.");
