import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  applyWorkupSectionPatch,
  applyWorkupChangeSet,
  buildWorkupAuthoringSnapshot,
  cloneJson,
  exportModuleEntriesFromSnapshot,
  makeWorkupChangeSet,
  sectionPayloadFromModule,
  validateAuthoringSnapshotNoPatientData,
  workupSectionDefinitions,
  workupSectionPatchSchema
} from "../src/workup/workup-authoring.js";

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
const beforeHistoryPayload = sectionPayloadFromModule(originalModule, "history_questions");
assert.ok(beforeHistoryPayload.requiredQuestions.length > 0, "DKA workup fixture should have at least one required history question.");
const afterHistoryPayload = cloneJson(beforeHistoryPayload);
afterHistoryPayload.requiredQuestions[0] = {
  ...afterHistoryPayload.requiredQuestions[0],
  label: `${afterHistoryPayload.requiredQuestions[0].label} [authoring draft]`
};

const historyChangeSet = makeWorkupChangeSet({
  workupId: originalModule.id,
  sectionKey: "history_questions",
  beforeSnapshot: beforeHistoryPayload,
  afterSnapshot: afterHistoryPayload,
  sourceIds: ["ADA_HYPERGLYCEMIC_CRISES_2024"],
  reviewStatus: "approved",
  exportReady: true,
  reviewerNotes: "Section safety regression fixture."
});

assert.equal(historyChangeSet.schema, "workup_change_set_v1");
assert.equal(historyChangeSet.workupId, originalModule.id);
assert.equal(historyChangeSet.workup_id, originalModule.id);
assert.equal(historyChangeSet.sectionKey, "history_questions");
assert.equal(historyChangeSet.section_key, "history_questions");
assert.equal(historyChangeSet.reviewStatus, "approved");
assert.equal(historyChangeSet.exportReady, true);
assert.equal(historyChangeSet.operations.length, 1);
assert.equal(historyChangeSet.operations[0].op, "replace_section");

const changedEnvelope = applyWorkupChangeSet(originalEnvelope, historyChangeSet);
assert.equal(changedEnvelope.module.requiredQuestions[0].label, afterHistoryPayload.requiredQuestions[0].label);
for (const preservedKey of [
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam",
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
    `History-only change sets must preserve module.${preservedKey}.`
  );
}

const changedSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [historyChangeSet]
});
const changedExport = exportModuleEntriesFromSnapshot(changedSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.ok(changedExport, "Approved change set should export the changed workup.");
assert.equal(changedExport.envelope.module.requiredQuestions[0].label, afterHistoryPayload.requiredQuestions[0].label);
assert.deepEqual(changedExport.envelope.module.requiredExam, originalModule.requiredExam);
assert.deepEqual(changedExport.envelope.module.conditionalQuestions, originalModule.conditionalQuestions);

const draftSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...historyChangeSet, reviewStatus: "draft", review_status: "draft", exportReady: false, export_ready: false }]
});
const draftExport = exportModuleEntriesFromSnapshot(draftSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  draftExport.envelope.module.requiredQuestions,
  originalModule.requiredQuestions,
  "Draft change sets should not export unless explicitly included."
);

const historyPayload = {
  requiredQuestions: [
    {
      id: "missed_insulin",
      item_type: "history_question",
      label: "Any missed insulin?",
      text: "Any missed insulin?",
      answerMode: "single",
      options: ["No", "Yes"],
      normalAnswers: ["No"]
    }
  ],
  conditionalQuestions: [
    {
      id: "supply_barrier",
      item_type: "history_question",
      label: "Any insulin supply barrier?",
      text: "Any insulin supply barrier?",
      answerMode: "single",
      options: ["No", "Yes"],
      normalAnswers: ["No"]
    }
  ]
};
const historyPatched = applyWorkupSectionPatch(historyPayload, {
  schema: workupSectionPatchSchema,
  workupId: originalModule.id,
  sectionKey: "history_questions",
  summary: "Add vomiting question, revise missed insulin, move supply barrier, and remove the duplicate barrier row.",
  operations: [
    {
      op: "add",
      groupKey: "conditionalQuestions",
      item: {
        id: "vomiting_oral_intake_since_last_check",
        item_type: "history_question",
        label: "Any vomiting, poor oral intake, or inability to keep fluids down since last check?",
        text: "Any vomiting, poor oral intake, or inability to keep fluids down since last check?",
        answerMode: "multi",
        options: ["No", "Vomiting", "Poor oral intake", "Unable to keep fluids down", "Other ___"],
        normalAnswers: ["No"],
        rationale: "Changes dehydration, ketosis risk, and discharge readiness.",
        source: { source_id: "ADA_HYPERGLYCEMIC_CRISES_2024" }
      }
    },
    {
      op: "update",
      itemId: "missed_insulin",
      item: {
        label: "Any missed basal or bolus insulin?",
        options: ["No missed doses", "Missed basal insulin", "Missed bolus insulin", "Other ___"]
      }
    },
    {
      op: "update",
      itemId: "supply_barrier",
      groupKey: "requiredQuestions",
      item: {
        rationale: "Changes discharge readiness and medication access planning."
      }
    },
    {
      op: "remove",
      itemId: "vomiting_oral_intake_since_last_check",
      groupKey: "conditionalQuestions"
    }
  ]
}, {
  workupId: originalModule.id,
  sectionKey: "history_questions"
});
assert.equal(historyPatched.requiredQuestions.length, 2, "History patch should move one conditional question into requiredQuestions.");
assert.equal(historyPatched.conditionalQuestions.length, 0, "History patch should remove the added conditional question by exact id.");
assert.equal(historyPatched.requiredQuestions[0].label, "Any missed basal or bolus insulin?", "History update should edit the matched item in place.");
assert.equal(historyPatched.requiredQuestions[1].id, "supply_barrier", "History update with groupKey should move the matched item to the destination group.");

const directFieldHistoryPatch = applyWorkupSectionPatch(historyPayload, {
  schema: workupSectionPatchSchema,
  workupId: originalModule.id,
  sectionKey: "history_questions",
  summary: "Add answer metadata using concise direct update fields.",
  operations: [
    {
      op: "update",
      itemId: "missed_insulin",
      answerMode: "multi",
      normalAnswers: ["no_missed_doses"]
    }
  ]
}, {
  workupId: originalModule.id,
  sectionKey: "history_questions"
});
assert.equal(directFieldHistoryPatch.requiredQuestions[0].answerMode, "multi", "History update should accept changed fields directly on the operation.");
assert.deepEqual(directFieldHistoryPatch.requiredQuestions[0].normalAnswers, ["no_missed_doses"], "Direct update fields should be applied to the matched history item.");

const examPatched = applyWorkupSectionPatch({
  requiredExam: [],
  conditionalExam: []
}, {
  schema: workupSectionPatchSchema,
  workupId: originalModule.id,
  sectionKey: "physical_exam",
  summary: "Add focused perfusion exam.",
  operations: [
    {
      op: "add",
      groupKey: "requiredExam",
      item: {
        id: "peripheral_perfusion_exam",
        item_type: "physical_exam_maneuver",
        label: "Assess peripheral perfusion",
        technique: "Assess peripheral perfusion",
        answerMode: "single",
        findings_options: ["Expected or baseline", "Delayed capillary refill or cool extremities", "Unable to assess"],
        normalAnswers: ["Expected or baseline"],
        rationale: "Changes hypovolemia and shock escalation."
      }
    }
  ]
}, {
  workupId: originalModule.id,
  sectionKey: "physical_exam"
});
assert.equal(examPatched.requiredExam[0].item_type, "physical_exam_maneuver", "Physical exam patch should add an exam maneuver only to exam groups.");
assert.equal(examPatched.requiredExam[0].technique, "Assess peripheral perfusion");

assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: "wrong", sectionKey: "history_questions", operations: [{ op: "remove", itemId: "missed_insulin" }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /Patch is for wrong/,
  "Patch must reject wrong workupId."
);
assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "physical_exam", operations: [{ op: "remove", itemId: "missed_insulin" }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /physical_exam/,
  "Patch must reject wrong sectionKey."
);
assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "history_questions", operations: [{ op: "add", groupKey: "requiredExam", item: { id: "bad", item_type: "history_question", label: "Bad?" } }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /Invalid groupKey/,
  "Patch must reject invalid groupKey."
);
assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "history_questions", operations: [{ op: "remove" }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /requires itemId/,
  "Patch must reject update/remove without itemId."
);
assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "history_questions", operations: [{ op: "update", itemId: "missed_insulin" }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /requires changed item fields/,
  "Patch must reject update operations without changed fields."
);
assert.throws(
  () => applyWorkupSectionPatch(historyPayload, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "history_questions", operations: [{ op: "update", itemId: "missed_insulin", item: { id: "renamed_id" } }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /cannot change its stable id/,
  "Patch updates must not rename stable item ids."
);
assert.throws(
  () => applyWorkupSectionPatch({
    requiredQuestions: [{ id: "duplicate", item_type: "history_question", label: "A?" }],
    conditionalQuestions: [{ id: "duplicate", item_type: "history_question", label: "B?" }]
  }, { schema: workupSectionPatchSchema, workupId: originalModule.id, sectionKey: "history_questions", operations: [{ op: "remove", itemId: "duplicate" }] }, { workupId: originalModule.id, sectionKey: "history_questions" }),
  /ambiguous/,
  "Patch must reject ambiguous exact-id matches."
);

const approvedButNotReadySnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...historyChangeSet, exportReady: false, export_ready: false }]
});
const approvedButNotReadyExport = exportModuleEntriesFromSnapshot(approvedButNotReadySnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  approvedButNotReadyExport.envelope.module.requiredQuestions,
  originalModule.requiredQuestions,
  "Approved change sets must still require export_ready=true before writing JSON."
);

const readyButDraftSnapshot = buildWorkupAuthoringSnapshot({
  ...source,
  changeSets: [{ ...historyChangeSet, reviewStatus: "draft", review_status: "draft" }]
});
const readyButDraftExport = exportModuleEntriesFromSnapshot(readyButDraftSnapshot).find((entry) => entry.workup_id === originalModule.id);
assert.deepEqual(
  readyButDraftExport.envelope.module.requiredQuestions,
  originalModule.requiredQuestions,
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
  "create table if not exists public.sources",
  "create table if not exists public.review_cases",
  "create table if not exists public.change_sets",
  "source_id text not null unique",
  "alter table public.change_sets enable row level security",
  "can_edit_workup_content",
  "assigned authors can draft their own change sets",
  "assigned authors can read workups",
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
