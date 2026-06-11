export const workupChangeSetSchema = "workup_change_set_v1";
export const workupAuthoringSnapshotSchema = "workup_authoring_snapshot_v1";

export const workupSectionDefinitions = [
  {
    key: "clinical_pathway_tree_v1",
    label: "Pathway tree",
    description: "Traversable OpenEvidence or reviewed management pathway.",
    kind: "pathway",
    moduleFields: ["clinical_pathway_tree_v1"]
  },
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
  },
  {
    key: "safety_checks",
    label: "Safety checks",
    description: "Basic bedside data and safety prerequisites.",
    kind: "items",
    moduleFields: ["safetyChecks"]
  },
  {
    key: "tests_thresholds",
    label: "Tests and thresholds",
    description: "Initial tests, reference thresholds, and cutoff criteria.",
    kind: "items",
    moduleFields: ["initialTests", "clinical_cutoff_criteria"]
  },
  {
    key: "red_flags",
    label: "Red flags",
    description: "Escalation and dangerous exception cues.",
    kind: "items",
    moduleFields: ["redFlags"]
  },
  {
    key: "management_disposition",
    label: "Management and disposition",
    description: "Management-changing rules, treatment routes, and disposition logic.",
    kind: "items",
    moduleFields: ["dispositionRules", "decisionTrees", "treatmentOptions"]
  },
  {
    key: "differential",
    label: "Differential",
    description: "Diagnostic frames, mimics, and exclusions.",
    kind: "items",
    moduleFields: ["differentialBuckets"]
  },
  {
    key: "sources",
    label: "Sources",
    description: "Workup source IDs and provenance references.",
    kind: "sources",
    moduleFields: []
  },
  {
    key: "review_tests",
    label: "Review tests",
    description: "Gold cases, pathway scenarios, and audit requirements.",
    kind: "review",
    moduleFields: ["gold_cases", "suppress_rules"]
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
  collectSourceIdsFromValue(module.clinical_pathway_tree_v1?.source_ids, sourceIds);
  collectSourceIdsFromValue(module.clinical_pathway_tree_v1?.source_metadata, sourceIds);
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
  if (definition.kind === "pathway") {
    return cloneJson(module.clinical_pathway_tree_v1 || null);
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
      suppress_rules: cloneJson(module.suppress_rules || []),
      synthetic_patient_scenarios: cloneJson(module.clinical_pathway_tree_v1?.synthetic_patient_scenarios || []),
      audit_requirements: cloneJson(module.clinical_pathway_tree_v1?.audit_requirements || null)
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
  if (definition.kind === "pathway") {
    nextModule.clinical_pathway_tree_v1 = cloneJson(payload || null);
    return nextModule;
  }
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
    if (nextModule.clinical_pathway_tree_v1) {
      nextModule.clinical_pathway_tree_v1 = {
        ...nextModule.clinical_pathway_tree_v1,
        ...(payload?.synthetic_patient_scenarios !== undefined
          ? { synthetic_patient_scenarios: cloneJson(payload.synthetic_patient_scenarios) }
          : {}),
        ...(payload?.audit_requirements !== undefined
          ? { audit_requirements: cloneJson(payload.audit_requirements) }
          : {})
      };
    }
    return nextModule;
  }
  for (const field of definition.moduleFields) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, field)) {
      nextModule[field] = cloneJson(payload[field] || []);
    }
  }
  return nextModule;
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

export function isInternalPathwayNode(node = {}) {
  const display = node.display && typeof node.display === "object" ? node.display : {};
  return Boolean(node.internal_traversal_guard)
    || node.endpoint_type === "missing_data_needed"
    || display.visible_in_pathway === false
    || (display.visible_in_graph === false && display.visible_in_outline === false);
}

export function flattenPathwayNodes(root = null, { treeId = "", parentId = null, depth = 0, sortOrder = 0 } = {}) {
  if (!root || typeof root !== "object") return [];
  const nodeId = cleanString(root.id || `${treeId || "tree"}_${depth}_node`);
  const isInternal = isInternalPathwayNode(root);
  const childParentId = isInternal ? parentId : nodeId;
  const childDepth = isInternal ? depth : depth + 1;
  const childRows = asArray(root.children).flatMap((child, index) => (
    flattenPathwayNodes(child, { treeId, parentId: childParentId, depth: childDepth, sortOrder: index })
  ));
  if (isInternal) return childRows;
  const row = {
    id: treeId ? `${treeId}:${nodeId}` : nodeId,
    tree_id: treeId,
    node_id: nodeId,
    parent_node_id: parentId,
    depth,
    sort_order: sortOrder,
    label: cleanString(root.label || root.title || root.action || nodeId),
    node_type: cleanString(root.type || (asArray(root.children).length ? "decision" : "endpoint")),
    edge_label: cleanString(root.edgeLabel || root.edge_label || ""),
    source_ids: collectSourceIdsFromValue(root, []),
    payload: cloneJson(root)
  };
  return [row, ...childRows];
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
  const tree = module.clinical_pathway_tree_v1 || {};
  return [
    ...asArray(module.gold_cases).map((row, index) => ({
      id: `${module.id}:gold:${cleanString(row.case_id || index + 1)}`,
      workup_id: module.id,
      case_id: cleanString(row.case_id || `gold_${index + 1}`),
      case_type: "gold_case",
      sort_order: index,
      payload: cloneJson(row)
    })),
    ...asArray(tree.synthetic_patient_scenarios).map((row, index) => ({
      id: `${module.id}:scenario:${cleanString(row.scenario_id || index + 1)}`,
      workup_id: module.id,
      case_id: cleanString(row.scenario_id || `scenario_${index + 1}`),
      case_type: "synthetic_pathway_scenario",
      sort_order: index,
      payload: cloneJson(row)
    }))
  ];
}

export function workupAuthoringRecordsForModule(module = {}, filePath = "") {
  const workupId = module.id;
  const pathwayTree = module.clinical_pathway_tree_v1 || null;
  const treeId = pathwayTree ? `${workupId}:clinical_pathway_tree_v1` : "";
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
    pathwayTree: pathwayTree ? {
      id: treeId,
      workup_id: workupId,
      section_key: "clinical_pathway_tree_v1",
      title: cleanString(pathwayTree.title || module.label || workupId),
      status: cleanString(pathwayTree.status || module.status || "draft"),
      source_ids: collectSourceIdsFromValue(pathwayTree, []),
      activation_rules: cloneJson(pathwayTree.activationRules || {}),
      payload: cloneJson(pathwayTree)
    } : null,
    pathwayNodes: pathwayTree ? flattenPathwayNodes(pathwayTree.root, { treeId }) : [],
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
    pathway_trees: records.map((record) => record.pathwayTree).filter(Boolean),
    pathway_nodes: records.flatMap((record) => record.pathwayNodes),
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
  for (const tree of asArray(snapshot.pathway_trees)) visit(tree.payload || {}, ["pathway_trees", tree.id || "unknown", "payload"]);
  return {
    ok: issues.length === 0,
    issues
  };
}
