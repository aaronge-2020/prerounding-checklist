export const workupChangeSetSchema = "workup_change_set_v1";
export const workupAuthoringSnapshotSchema = "workup_authoring_snapshot_v1";
export const workupSectionPatchSchema = "workup_section_patch_v1";

export const workupSectionDefinitions = [
  {
    key: "history_questions",
    label: "History questions",
    description: "Askable bedside history questions.",
    kind: "items",
    moduleFields: ["requiredQuestions", "conditionalQuestions"]
  },
  {
    key: "physical_exam",
    label: "Physical exam",
    description: "Focused exam maneuvers and documentation choices.",
    kind: "items",
    moduleFields: ["requiredExam", "conditionalExam"]
  }
];

const sectionDefinitionByKey = new Map(workupSectionDefinitions.map((definition) => [definition.key, definition]));

export function workupSectionDefinition(sectionKey = "") {
  return sectionDefinitionByKey.get(sectionKey) || null;
}

export function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slug(value = "entry") {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "entry";
}

function sortByPosition(items = []) {
  return [...items].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

export function collectSourceIdsFromValue(value, target = []) {
  if (value === undefined || value === null) return target;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSourceIdsFromValue(entry, target));
    return target;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/^(?:source_?ids?|evidence_source_primary|id)$/i.test(key)) {
        collectSourceIdsFromValue(entry, target);
      } else if (typeof entry === "object") {
        collectSourceIdsFromValue(entry, target);
      }
    }
    return target;
  }
  const text = String(value || "").trim();
  if (!text) return target;
  text.split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Z0-9][A-Z0-9_./-]{2,}$/.test(entry))
    .forEach((entry) => {
      if (!target.includes(entry)) target.push(entry);
    });
  return target;
}

export function collectModuleSourceIds(module = {}) {
  const sourceIds = [];
  collectSourceIdsFromValue(module.source_ids, sourceIds);
  collectSourceIdsFromValue(module.endocrine_metadata?.source_ids, sourceIds);
  for (const definition of workupSectionDefinitions) {
    for (const field of definition.moduleFields) {
      collectSourceIdsFromValue(module[field], sourceIds);
    }
  }
  return sourceIds;
}

export function normalizeModuleEnvelope(raw = {}, filePath = "") {
  const envelope = raw && typeof raw === "object" ? raw : {};
  const module = envelope.module && typeof envelope.module === "object" ? envelope.module : envelope;
  return {
    filePath,
    envelope: envelope.module ? cloneJson(envelope) : { module: cloneJson(module) },
    module: cloneJson(module)
  };
}

export function sectionPayloadFromModule(module = {}, sectionKey = "") {
  const definition = workupSectionDefinition(sectionKey);
  if (!definition) {
    throw new Error(`Unknown workup authoring section: ${sectionKey}`);
  }
  if (definition.kind === "sources") {
    return {
      source_ids: collectModuleSourceIds(module),
      module_source_ids: cloneJson(module.source_ids || []),
      endocrine_source_ids: cloneJson(module.endocrine_metadata?.source_ids || [])
    };
  }
  if (definition.kind === "review") {
    return {
      gold_cases: cloneJson(module.gold_cases || []),
      suppress_rules: cloneJson(module.suppress_rules || [])
    };
  }
  return Object.fromEntries(definition.moduleFields.map((field) => [field, cloneJson(module[field] || [])]));
}

export function applySectionPayloadToModule(module = {}, sectionKey = "", payload = null) {
  const definition = workupSectionDefinition(sectionKey);
  if (!definition) {
    throw new Error(`Unknown workup authoring section: ${sectionKey}`);
  }
  const nextModule = cloneJson(module);
  if (definition.kind === "sources") {
    if (payload?.module_source_ids) nextModule.source_ids = cloneJson(payload.module_source_ids);
    if (payload?.endocrine_source_ids && nextModule.endocrine_metadata) {
      nextModule.endocrine_metadata = {
        ...nextModule.endocrine_metadata,
        source_ids: cloneJson(payload.endocrine_source_ids)
      };
    }
    return nextModule;
  }
  if (definition.kind === "review") {
    if (payload?.gold_cases !== undefined) nextModule.gold_cases = cloneJson(payload.gold_cases);
    if (payload?.suppress_rules !== undefined) nextModule.suppress_rules = cloneJson(payload.suppress_rules);
    return nextModule;
  }
  for (const field of definition.moduleFields) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, field)) {
      nextModule[field] = cloneJson(payload[field] || []);
    }
  }
  return nextModule;
}

function defaultItemTypeForPatchSection(sectionKey = "") {
  if (sectionKey === "history_questions") return "history_question";
  if (sectionKey === "physical_exam") return "physical_exam_maneuver";
  return "workup_item";
}

function patchItemId(item = {}) {
  return cleanString(item.id || item.item_id || "");
}

function normalizePatchGroupKey(groupKey = "", definition = null) {
  const key = cleanString(groupKey);
  if (!definition?.moduleFields?.includes(key)) {
    throw new Error(`Invalid groupKey "${key || "(missing)"}" for ${definition?.key || "selected section"}.`);
  }
  return key;
}

function normalizePatchItemForAdd(item = {}, sectionKey = "") {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Patch add operation requires an item object.");
  }
  const next = cloneJson(item);
  const id = patchItemId(next);
  if (!id) throw new Error("Patch add operation requires item.id or item.item_id.");
  const label = cleanString(next.label || next.text || next.technique || next.action);
  if (!label) throw new Error(`Patch add operation for ${id} requires a label, text, technique, or action.`);
  const expectedType = defaultItemTypeForPatchSection(sectionKey);
  const itemType = cleanString(next.item_type || expectedType);
  if (sectionKey === "history_questions" && itemType !== "history_question") {
    throw new Error(`History patch add item ${id} must have item_type "history_question".`);
  }
  if (sectionKey === "physical_exam" && itemType !== "physical_exam_maneuver") {
    throw new Error(`Physical exam patch add item ${id} must have item_type "physical_exam_maneuver".`);
  }
  next.id = id;
  next.item_type = itemType;
  if (sectionKey === "history_questions") {
    next.label = cleanString(next.label || next.text || label);
    next.text = cleanString(next.text || next.label);
  }
  if (sectionKey === "physical_exam") {
    next.label = cleanString(next.label || next.technique || label);
    next.technique = cleanString(next.technique || next.label);
  }
  return next;
}

function findPatchItem(payload = {}, definition = null, itemId = "", groupKey = "") {
  const targetId = cleanString(itemId);
  if (!targetId) throw new Error("Patch update/remove operation requires itemId.");
  const groups = groupKey
    ? [normalizePatchGroupKey(groupKey, definition)]
    : definition.moduleFields;
  const matches = [];
  for (const group of groups) {
    const items = Array.isArray(payload[group]) ? payload[group] : [];
    items.forEach((item, index) => {
      if (patchItemId(item) === targetId) matches.push({ groupKey: group, index, item });
    });
  }
  if (!matches.length) throw new Error(`Patch itemId "${targetId}" did not match any item in ${definition.key}.`);
  if (matches.length > 1) throw new Error(`Patch itemId "${targetId}" matched multiple items in ${definition.key}; update/remove is ambiguous.`);
  return matches[0];
}

const patchOperationReservedKeys = new Set([
  "op",
  "item",
  "itemId",
  "item_id",
  "groupKey",
  "group_key",
  "fromGroupKey",
  "from_group_key",
  "toGroupKey",
  "to_group_key"
]);

export function applyWorkupSectionPatch(payload = {}, patch = {}, { workupId = "", sectionKey = "" } = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Workup section patch must be a JSON object.");
  }
  if (patch.schema !== workupSectionPatchSchema) {
    throw new Error(`Workup section patch must use schema "${workupSectionPatchSchema}".`);
  }
  const patchWorkupId = cleanString(patch.workupId || patch.workup_id);
  const expectedWorkupId = cleanString(workupId);
  if (patchWorkupId && expectedWorkupId && patchWorkupId !== expectedWorkupId) {
    throw new Error(`Patch is for ${patchWorkupId}, but ${expectedWorkupId} is selected.`);
  }
  const patchSectionKey = cleanString(patch.sectionKey || patch.section_key);
  const expectedSectionKey = cleanString(sectionKey);
  if (patchSectionKey && expectedSectionKey && patchSectionKey !== expectedSectionKey) {
    throw new Error(`Patch is for ${patchSectionKey}, but ${expectedSectionKey} is selected.`);
  }
  const activeSectionKey = patchSectionKey || expectedSectionKey;
  if (!["history_questions", "physical_exam"].includes(activeSectionKey)) {
    throw new Error("Patch imports are supported only for history_questions and physical_exam.");
  }
  const definition = workupSectionDefinition(activeSectionKey);
  if (!definition || definition.kind !== "items") {
    throw new Error(`Patch section ${activeSectionKey} is not an editable item section.`);
  }
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  if (!operations.length) throw new Error("Patch must include at least one operation.");

  const next = {};
  for (const field of definition.moduleFields) {
    next[field] = Array.isArray(payload?.[field]) ? cloneJson(payload[field]) : [];
  }

  operations.forEach((operation, index) => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      throw new Error(`Patch operation ${index + 1} must be an object.`);
    }
    const op = cleanString(operation.op).toLowerCase();
    if (!["add", "update", "remove"].includes(op)) {
      throw new Error(`Patch operation ${index + 1} has unsupported op "${operation.op || ""}".`);
    }
    if (op === "add") {
      const groupKey = normalizePatchGroupKey(operation.groupKey || operation.group_key, definition);
      const item = normalizePatchItemForAdd(operation.item, activeSectionKey);
      const duplicate = definition.moduleFields
        .flatMap((field) => next[field])
        .some((candidate) => patchItemId(candidate) === item.id);
      if (duplicate) throw new Error(`Patch add item id "${item.id}" already exists in ${activeSectionKey}.`);
      next[groupKey].push(item);
      return;
    }

    const itemId = cleanString(operation.itemId || operation.item_id);
    const sourceGroupKey = op === "remove"
      ? cleanString(operation.fromGroupKey || operation.from_group_key || operation.groupKey || operation.group_key)
      : cleanString(operation.fromGroupKey || operation.from_group_key);
    const match = findPatchItem(next, definition, itemId, sourceGroupKey);
    if (op === "remove") {
      next[match.groupKey].splice(match.index, 1);
      return;
    }

    const targetGroupKey = operation.toGroupKey || operation.to_group_key
      ? normalizePatchGroupKey(operation.toGroupKey || operation.to_group_key, definition)
      : (operation.groupKey || operation.group_key
        ? normalizePatchGroupKey(operation.groupKey || operation.group_key, definition)
        : match.groupKey);
    const directItemPatch = Object.fromEntries(
      Object.entries(operation)
        .filter(([key]) => !patchOperationReservedKeys.has(key))
        .map(([key, value]) => [key, cloneJson(value)])
    );
    const nestedItemPatch = operation.item && typeof operation.item === "object" && !Array.isArray(operation.item)
      ? cloneJson(operation.item)
      : {};
    const itemPatch = { ...directItemPatch, ...nestedItemPatch };
    if (!Object.keys(itemPatch).length) {
      throw new Error(`Patch update item "${itemId}" requires changed item fields directly on the operation or inside item.`);
    }
    const updated = { ...cloneJson(match.item), ...itemPatch };
    const updatedId = patchItemId(updated);
    if (updatedId && updatedId !== itemId) {
      throw new Error(`Patch update item "${itemId}" cannot change its stable id to "${updatedId}".`);
    }
    updated.id = itemId;
    if (updated.item_id && updated.item_id !== itemId) delete updated.item_id;
    if (targetGroupKey === match.groupKey) {
      next[match.groupKey][match.index] = updated;
    } else {
      next[match.groupKey].splice(match.index, 1);
      next[targetGroupKey].push(updated);
    }
  });

  return next;
}

export function makeWorkupChangeSet({
  id = "",
  workupId = "",
  sectionKey = "",
  operation = "replace_section",
  beforeSnapshot = null,
  afterSnapshot = null,
  sourceIds = [],
  reviewStatus = "draft",
  exportReady = false,
  authorId = null,
  reviewerNotes = "",
  importedEvidence = null,
  createdAt = nowIso()
} = {}) {
  if (!workupId) throw new Error("workupId is required for a workup change set.");
  if (!workupSectionDefinition(sectionKey)) throw new Error(`Unknown workup change-set section: ${sectionKey}`);
  const normalizedSourceIds = Array.from(new Set(asArray(sourceIds).map((sourceId) => cleanString(sourceId)).filter(Boolean)));
  return {
    schema: workupChangeSetSchema,
    id: id || `${workupId}:${sectionKey}:${Date.now().toString(36)}`,
    workupId,
    workup_id: workupId,
    sectionKey,
    section_key: sectionKey,
    operations: [
      {
        op: operation,
        path: `/module/${sectionKey}`,
        before: cloneJson(beforeSnapshot),
        after: cloneJson(afterSnapshot)
      }
    ],
    beforeSnapshot: cloneJson(beforeSnapshot),
    afterSnapshot: cloneJson(afterSnapshot),
    sourceIds: normalizedSourceIds,
    source_ids: normalizedSourceIds,
    reviewStatus,
    review_status: reviewStatus,
    exportReady: Boolean(exportReady),
    export_ready: Boolean(exportReady),
    authorId,
    author_id: authorId,
    reviewerNotes,
    reviewer_notes: reviewerNotes,
    importedEvidence: cloneJson(importedEvidence),
    imported_evidence: cloneJson(importedEvidence),
    createdAt,
    created_at: createdAt
  };
}

function changeSetAfterSnapshot(changeSet = {}) {
  if (changeSet.afterSnapshot !== undefined) return changeSet.afterSnapshot;
  if (changeSet.after_snapshot !== undefined) return changeSet.after_snapshot;
  const replaceOperation = asArray(changeSet.operations).find((operation) => operation.op === "replace_section");
  return replaceOperation?.after;
}

export function applyWorkupChangeSet(envelopeOrModule = {}, changeSet = {}) {
  const rawModule = envelopeOrModule.module && typeof envelopeOrModule.module === "object"
    ? envelopeOrModule.module
    : envelopeOrModule;
  const module = cloneJson(rawModule);
  const workupId = changeSet.workupId || changeSet.workup_id;
  const sectionKey = changeSet.sectionKey || changeSet.section_key;
  if (!module?.id) throw new Error("Cannot apply a workup change set without a module id.");
  if (module.id !== workupId) {
    throw new Error(`Change set is for ${workupId}, but selected module is ${module.id}.`);
  }
  const nextModule = applySectionPayloadToModule(module, sectionKey, changeSetAfterSnapshot(changeSet));
  if (envelopeOrModule.module && typeof envelopeOrModule.module === "object") {
    return { ...cloneJson(envelopeOrModule), module: nextModule };
  }
  return nextModule;
}

function itemRowsForModule(module = {}) {
  const rows = [];
  for (const definition of workupSectionDefinitions.filter((entry) => entry.kind === "items")) {
    for (const groupKey of definition.moduleFields) {
      asArray(module[groupKey]).forEach((item, index) => {
        const itemId = cleanString(item.id || item.item_id || `${groupKey}_${index + 1}`);
        rows.push({
          id: `${module.id}:${groupKey}:${itemId}`,
          workup_id: module.id,
          section_key: definition.key,
          group_key: groupKey,
          item_id: itemId,
          item_type: cleanString(item.item_type || ""),
          label: cleanString(item.label || item.text || item.action || itemId),
          sort_order: index,
          source_ids: collectSourceIdsFromValue(item, []),
          payload: cloneJson(item)
        });
      });
    }
  }
  return rows;
}

function reviewCaseRowsForModule(module = {}) {
  return asArray(module.gold_cases).map((row, index) => ({
    id: `${module.id}:gold:${cleanString(row.case_id || index + 1)}`,
    workup_id: module.id,
    case_id: cleanString(row.case_id || `gold_${index + 1}`),
    case_type: "gold_case",
    sort_order: index,
    payload: cloneJson(row)
  }));
}

export function workupAuthoringRecordsForModule(module = {}, filePath = "") {
  const workupId = module.id;
  const sections = workupSectionDefinitions.map((definition, index) => ({
    id: `${workupId}:${definition.key}`,
    workup_id: workupId,
    section_key: definition.key,
    label: definition.label,
    description: definition.description,
    kind: definition.kind,
    sort_order: index,
    payload: sectionPayloadFromModule(module, definition.key),
    source_ids: collectSourceIdsFromValue(sectionPayloadFromModule(module, definition.key), [])
  }));
  return {
    workup: {
      id: workupId,
      title: cleanString(module.label || module.title || workupId),
      version: cleanString(module.version || ""),
      status: cleanString(module.status || "draft"),
      complaint_group: cleanString(module.complaint_group || ""),
      population: cloneJson(module.population || module.applicability || {}),
      module_path: filePath,
      source_ids: collectModuleSourceIds(module),
      payload: cloneJson({
        schema_version: module.schema_version,
        artifact_type: module.artifact_type,
        triggers: module.triggers || [],
        applicability: module.applicability || null,
        endocrine_metadata: module.endocrine_metadata || null
      })
    },
    sections,
    items: itemRowsForModule(module),
    reviewCases: reviewCaseRowsForModule(module)
  };
}

export function buildWorkupAuthoringSnapshot({ manifest = {}, sourceRegistry = {}, moduleEntries = [], changeSets = [] } = {}) {
  const normalizedEntries = moduleEntries.map((entry) => normalizeModuleEnvelope(entry.envelope || entry.raw || entry, entry.filePath || entry.path || ""));
  const records = normalizedEntries.map((entry) => workupAuthoringRecordsForModule(entry.module, entry.filePath));
  return {
    schema: workupAuthoringSnapshotSchema,
    created_at: nowIso(),
    manifest: cloneJson(manifest),
    modules: normalizedEntries.map((entry) => ({
      file_path: entry.filePath,
      workup_id: entry.module.id,
      envelope: cloneJson(entry.envelope)
    })),
    sources: asArray(sourceRegistry.sources).map((source) => ({
      id: source.id || source.source_id,
      source_id: source.id || source.source_id,
      title: source.title || source.citation || source.id || source.source_id,
      source_type: source.source || source.source_type || "",
      url: source.url || source.url_or_doi || "",
      version: source.version || "",
      date_accessed: source.date_accessed || "",
      review_owner: source.review_owner || "",
      reviewed_by_role: source.reviewed_by_role || "",
      last_reviewed: source.last_reviewed || "",
      next_review_due: source.next_review_due || "",
      currency_status: source.currency_status || "",
      citation: source.citation || source.preferred_citation || "",
      payload: cloneJson(source)
    })),
    workups: records.map((record) => record.workup),
    workup_sections: records.flatMap((record) => record.sections),
    workup_items: records.flatMap((record) => record.items),
    review_cases: records.flatMap((record) => record.reviewCases),
    change_sets: asArray(changeSets).map((changeSet) => cloneJson(changeSet))
  };
}

export function exportModuleEntriesFromSnapshot(snapshot = {}, { includeDrafts = false } = {}) {
  const changeSets = asArray(snapshot.change_sets)
    .filter((changeSet) => {
      if (includeDrafts) return true;
      const reviewStatus = changeSet.review_status || changeSet.reviewStatus;
      const exportReady = changeSet.export_ready === true || changeSet.exportReady === true;
      return reviewStatus === "approved" && exportReady;
    });
  const changesByWorkup = new Map();
  for (const changeSet of changeSets) {
    const workupId = changeSet.workup_id || changeSet.workupId;
    if (!changesByWorkup.has(workupId)) changesByWorkup.set(workupId, []);
    changesByWorkup.get(workupId).push(changeSet);
  }
  return asArray(snapshot.modules).map((entry) => {
    let envelope = cloneJson(entry.envelope);
    for (const changeSet of sortByPosition(changesByWorkup.get(entry.workup_id) || [])) {
      envelope = applyWorkupChangeSet(envelope, changeSet);
    }
    return {
      file_path: entry.file_path,
      workup_id: entry.workup_id,
      envelope
    };
  });
}

const unsafeAuthoringPropertyPattern = /^(?:raw[ _-]*)?(?:chart|patient|notes?|handoff|epic|mrn|dob|ssn|room|bed|address|phone|email|identifier|identifiers)(?:[ _-]*(?:text|context|info|name|id|number|date|birthdate|of_birth))?$/i;

export function validateAuthoringSnapshotNoPatientData(snapshot = {}) {
  const issues = [];
  const visit = (value, path = []) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, String(index)]));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (unsafeAuthoringPropertyPattern.test(key)) {
        issues.push(`Unsafe patient-like property in authoring snapshot: ${[...path, key].join(".")}`);
      }
      visit(entry, [...path, key]);
    }
  };
  for (const workup of asArray(snapshot.workups)) visit(workup.payload || {}, ["workups", workup.id || "unknown", "payload"]);
  for (const section of asArray(snapshot.workup_sections)) visit(section.payload || {}, ["workup_sections", section.id || "unknown", "payload"]);
  for (const item of asArray(snapshot.workup_items)) visit(item.payload || {}, ["workup_items", item.id || "unknown", "payload"]);
  return {
    ok: issues.length === 0,
    issues
  };
}
