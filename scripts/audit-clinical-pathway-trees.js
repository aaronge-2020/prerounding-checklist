import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const auditDate = "2026-06-11";
const moduleRoot = "medical-knowledge/complaint-modules";
const sourceRegistryPath = "medical-knowledge/source-registry.json";

const requiredPathwayDomains = [
  "initial assessment",
  "red flags/instability",
  "diagnostic confirmation",
  "mimics/exclusions",
  "severity/risk stratification",
  "first-line management",
  "escalation/emergency actions",
  "contraindications/special populations",
  "monitoring/reassessment",
  "de-escalation/stopping criteria",
  "disposition",
  "follow-up",
  "safety-netting"
];

const requiredContextDomains = [
  "symptoms",
  "exam",
  "vitals",
  "labs",
  "imaging_results",
  "medications",
  "comorbidities",
  "demographics",
  "pregnancy_status",
  "workup_findings"
];

const requiredScenarioPathways = [
  "missing_data_needed",
  "escalation_emergency_actions",
  "diagnostic_confirmation_missing_data",
  "mimics_exclusions",
  "contraindications_special_populations",
  "monitoring_reassessment_escalation",
  "deescalation_stopping_criteria",
  "disposition_followup_safety_netting"
];

const actionableEndpointTypes = new Set([
  "diagnostic_step",
  "treatment",
  "escalation_disposition",
  "monitoring_reassessment",
  "follow_up",
  "safety_net_instruction",
  "clinician_review_handoff",
  "missing_data_needed",
  "deescalation_stopping"
]);

const evidenceGroups = [
  "clinical_cutoff_criteria",
  "redFlags",
  "initialTests",
  "differentialBuckets",
  "dispositionRules",
  "safetyChecks"
];

const genericPattern = /\b(?:any red flag, unstable vital sign, or emergency feature|required diagnostic data available|initial assessment: stabilize|collect source-directed confirmation|severity or disposition-changing risk present|diagnostic criteria met or treatment cannot wait|source-backed|selected workup|first-line management only|use the high-risk or confirmed-pathway management option|lower-risk, outpatient, supportive, or safety-net pathway only|clinician review flagged|local policy and patient-specific clinician review flagged|explicit guideline cutoffs|cutoff-bearing|cutoff criteria|trigger present|enough context|gather objective data|crisis labs|obtain targeted tests|targeted tests and cultures|concurrent data bundle obtained|criteria match|does patient context support this workup|treatment modifier unresolved|treatment started or diagnostic plan active|worsening or discordant reassessment|stopping or de-escalation criteria met|stable for follow-up with safety net|diagnosis\/risk branch selected|threshold\/result data missing|compact evidence-cited management pathway|treatment branch only when the cited diagnostic\/severity criteria match|key thresholds and interpretation caveats|guideline-sourced endocrine workup|threshold-defined branch|presenting trigger)\b/i;
const generatedEvidencePattern = /\b(?:diagnostic frame from guideline-sourced endocrine workup|key thresholds and interpretation caveats|source-backed criteria|source-backed management route|use the high-risk or confirmed-pathway management option|lower-risk, outpatient, supportive, or safety-net pathway|stabilize or escalate before routine treatment|screen for immediate danger or disposition-changing findings|order focused first-line studies and interpret them in sequence|apply source-backed decision steps|does patient context support this workup|criteria match|concurrent data bundle)\b/i;
const shallowGeneratedPrefixPattern = /^(?:use the high-risk or confirmed-pathway management option when criteria are met|use the lower-risk, outpatient, supportive, or safety-net pathway only when the source-backed criteria are satisfied|stabilize or escalate before routine treatment when danger criteria are present|screen for immediate danger or disposition-changing findings before routine workup|order focused first-line studies and interpret them in sequence|apply source-backed decision steps)\s*:\s*/i;
const cutoffUnits = "(?:mg/dL|mg/L|g/L|mmol/L|mEq/L|mIU/L|mU/L|ng/mL|pg/mL|ug/L|mg/g|mcg/mg|mm Hg|mL/kg|mg/kg|g/kg|kg/m2|mL/min(?:/1\\.73\\s*m2)?|mL|hours?|days?|weeks?|months?|years?|cm|mm|ms|seconds?|minutes?|breaths/minute|x10\\^9/L|%|(?:deg\\s*C|degrees?\\s*C|C(?![a-z]))|ULN|LLN|mOsm/kg|bpm|IU/L|U/L|mcg/dL|ug/dL|mcg/day|mcg|g|mg|kg|cycles/year|measurements?|collections?|samples?|percent|percentile)";
const strictThresholdPattern = new RegExp([
  "(?:(?:>=|<=|>|<|=)|(?:above|below|exceeds?))\\s*(?:the\\s+)?(?:assay\\s+)?(?:ULN|LLN|upper limit of normal|lower limit of normal|reference range)",
  "\\b\\d+(?:\\.\\d+)?\\s*(?:x|times|fold|-fold)\\s*(?:ULN|upper limit of normal)",
  "\\b[A-Z][A-Za-z0-9+/ -]{0,30}\\s*(?:score\\s*)?(?:>=|<=|>|<|=)\\s*-?\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "(?:>=|<=|>|<|=)\\s*-?\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "\\b\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?\\s*" + cutoffUnits + "?",
  "\\b\\d+(?:\\.\\d+)?\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?\\s*" + cutoffUnits,
  "\\b\\d+(?:\\.\\d+)?\\s*" + cutoffUnits,
  "\\b(?:at least|at most|more than|less than|maximum|max|min(?:imum)?|up to)\\s+\\d+(?:\\.\\d+)?\\b",
  "\\b\\d+\\s+or\\s+(?:more|fewer|less)\\b",
  "\\bday\\s+\\d+\\b",
  "\\bage\\s+\\d+\\b",
  "\\b\\d+\\s+(?:principal clinical features|features|benzodiazepine doses|upper UTIs?|lower UTIs?)\\b"
].join("|"), "gi");
const bareMarkerPattern = /\b(?:A1c|HbA1c|pH|bicarbonate|anion gap|osmolality|lactate|MAP|TSH|free T4|FT4|T3|PTH|calcium|cortisol|ACTH|aldosterone|renin|eGFR|UACR|glucose|troponin)\b/i;

function parseArgs(argv) {
  const args = {
    out: "",
    json: "",
    latestOut: "",
    latestJson: "",
    strict: argv.includes("--strict")
  };
  argv.forEach((arg) => {
    const [key, ...rawValue] = arg.replace(/^--/, "").split("=");
    const value = rawValue.join("=").trim();
    if (key === "out") args.out = value;
    if (key === "json") args.json = value;
    if (key === "latest-out") args.latestOut = value;
    if (key === "latest-json") args.latestJson = value;
  });
  return args;
}

function complaintModuleFiles(dir = moduleRoot) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return complaintModuleFiles(fullPath);
    return entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function unique(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.+<>=/%-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemLabel(item = {}) {
  return String(item.label || item.text || item.action || item.management_change || item.diagnostic_target || item.id || "").replace(shallowGeneratedPrefixPattern, "").replace(/\s+/g, " ").trim();
}

function itemSearchText(item = {}) {
  return [
    item.label,
    item.criteria_text,
    ...(Array.isArray(item.cutoffs) ? item.cutoffs : []),
    ...(Array.isArray(item.data_needed) ? item.data_needed : []),
    item.action,
    item.management_change,
    item.diagnostic_target,
    item.rationale
  ].filter(Boolean).join(" ");
}

function isGeneratedEvidenceItem(item = {}) {
  return generatedEvidencePattern.test(itemSearchText(item));
}

function hasRealThreshold(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (/(?:(?:>=|<=|>|<|=)|(?:above|below|exceeds?))\s*(?:the\s+)?(?:assay\s+)?(?:ULN|LLN|upper limit of normal|lower limit of normal|reference range)/i.test(text)) return true;
  if (!/\d/.test(text)) return false;
  return new RegExp(strictThresholdPattern.source, "i").test(text);
}

function importantTokens(value = "") {
  const stop = new Set(["and", "or", "the", "for", "with", "without", "when", "then", "that", "this", "from", "into", "before", "after", "pathway", "workup", "source", "backed", "criteria", "management", "patient", "patients", "clinical"]);
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token))
    .slice(0, 8);
}

function itemSourceIds(item = {}) {
  return unique([
    item.source_id,
    item.source?.source_id,
    ...(Array.isArray(item.source_ids) ? item.source_ids : []),
    ...(Array.isArray(item.sourceIds) ? item.sourceIds : [])
  ]);
}

function walk(root, parent = null, depth = 1, out = []) {
  if (!root || typeof root !== "object") return out;
  out.push({ node: root, parent, depth });
  (root.children || []).forEach((child) => walk(child, root, depth + 1, out));
  return out;
}

function pathList(root) {
  const paths = [];
  const visit = (node, path = []) => {
    if (!node) return;
    const nextPath = [...path, node.id || node.label || "unknown"];
    if (!Array.isArray(node.children) || node.children.length === 0) {
      paths.push(nextPath);
      return;
    }
    node.children.forEach((child) => visit(child, nextPath));
  };
  visit(root);
  return paths;
}

function genericTreeStringFindings(value, path = "$", out = []) {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => genericTreeStringFindings(entry, `${path}[${index}]`, out));
    } else {
      Object.entries(value).forEach(([key, entry]) => genericTreeStringFindings(entry, `${path}.${key}`, out));
    }
    return out;
  }
  if (typeof value === "string" && genericPattern.test(value)) {
    out.push({ path, sample: value.replace(/\s+/g, " ").trim().slice(0, 180) });
  }
  return out;
}

function allSourceIdsInValue(value) {
  const ids = [];
  const visit = (entry) => {
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry.source_ids)) ids.push(...entry.source_ids);
    if (Array.isArray(entry.sourceIds)) ids.push(...entry.sourceIds);
    if (typeof entry.source_id === "string") ids.push(entry.source_id);
    Object.values(entry).forEach((child) => {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    });
  };
  visit(value);
  return unique(ids);
}

function sourceMetadataMap(tree = {}) {
  const rows = Array.isArray(tree.source_metadata)
    ? tree.source_metadata
    : tree.source_metadata && typeof tree.source_metadata === "object"
      ? Object.values(tree.source_metadata)
      : [];
  return new Map(rows.map((row) => [row.source_id || row.id, row]));
}

function hasCompleteSourceMetadata(row = {}) {
  return Boolean(
    (row.source_id || row.id)
    && row.title
    && (row.url || row.url_or_doi)
    && row.year
    && (row.access_date || row.date_accessed)
    && row.citation_text
    && row.review_status
  );
}

function endpointIsActionable(node = {}) {
  if (node.type !== "endpoint") return false;
  if (!node.action || String(node.action).trim().length < 20) return false;
  if (actionableEndpointTypes.has(node.endpoint_type)) return true;
  return /diagnostic|treat|escalat|disposition|monitor|follow|safety|review|handoff|missing|de-?escalat|stop/i.test(`${node.label} ${node.action}`);
}

function evidenceGroupHits(module, treeText) {
  const normalizedTree = normalize(treeText);
  const groups = {};
  for (const group of evidenceGroups) {
    const items = (Array.isArray(module[group]) ? module[group] : []).filter((item) => !isGeneratedEvidenceItem(item));
    const hits = [];
    items.forEach((item) => {
      const label = itemLabel(item);
      const tokens = importantTokens(label);
      if (tokens.length >= 2 && tokens.slice(0, Math.min(5, tokens.length)).every((token) => normalizedTree.includes(token))) {
        hits.push(item.id || label);
      }
    });
    groups[group] = {
      available: items.length,
      required: Math.min(2, items.length),
      hits: unique(hits),
      pass: hits.length >= Math.min(2, items.length)
    };
  }
  return groups;
}

function thresholdCoverage(module, tree = {}) {
  const treeText = JSON.stringify(tree);
  const treeThresholds = unique((tree.source_thresholds || [])
    .map((row) => row.threshold)
    .filter(hasRealThreshold));
  const sourceText = treeThresholds.length
    ? treeThresholds.join(" ")
    : evidenceGroups
      .flatMap((group) => Array.isArray(module[group]) ? module[group] : [])
      .filter((item) => !isGeneratedEvidenceItem(item))
      .map((item) => itemSearchText(item))
      .join(" ");
  const thresholds = unique((sourceText.match(strictThresholdPattern) || []).map((item) => item.replace(/\s+/g, " ").trim()).filter(hasRealThreshold));
  const normalizedTree = normalize(treeText);
  const included = thresholds.filter((threshold) => normalizedTree.includes(normalize(threshold)));
  const markerOnly = bareMarkerPattern.test(sourceText) && thresholds.length === 0;
  return {
    available: thresholds.length,
    included: included.length,
    examples: included.slice(0, 8),
    marker_only: markerOnly,
    pass: !markerOnly && (thresholds.length < 2 || included.length >= Math.min(4, thresholds.length))
  };
}

function auditModule({ file, module, sourceIds }) {
  const issues = [];
  const blockers = [];
  const reviewNeeds = [];
  const tree = module.clinical_pathway_tree_v1;
  if (!tree) {
    blockers.push("missing clinical_pathway_tree_v1");
    return resultRecord(file, module, tree, issues, blockers, reviewNeeds);
  }
  if (tree.schema !== "clinical_pathway_tree_v1") issues.push("tree schema must be clinical_pathway_tree_v1");
  if (!tree.root || typeof tree.root !== "object") blockers.push("tree missing valid root");

  const entries = walk(tree.root);
  const nodes = entries.map((entry) => entry.node);
  const ids = nodes.map((node) => node.id).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const leaves = nodes.filter((node) => !Array.isArray(node.children) || node.children.length === 0);
  const decisions = nodes.filter((node) => node.type === "decision");
  const branches = entries.filter((entry) => entry.parent).length;
  const paths = pathList(tree.root);
  const maxDepth = entries.reduce((max, entry) => Math.max(max, entry.depth), 0);

  if (duplicateIds.length) blockers.push(`duplicate node ids: ${unique(duplicateIds).join(", ")}`);
  const genericTreeStrings = genericTreeStringFindings(tree);
  if (genericTreeStrings.length) {
    issues.push(`tree contains prohibited generic/scaffold text in ${genericTreeStrings.length} string fields; examples: ${genericTreeStrings.slice(0, 3).map((row) => `${row.path}=${row.sample}`).join(" || ")}`);
  }
  if (nodes.length < 9) issues.push(`tree too sparse: ${nodes.length} nodes; expected at least 9 clinically meaningful bundled nodes`);
  if (nodes.length > 20) issues.push(`tree too large/redundant: ${nodes.length} nodes; expected a concise bundled workup/management tree with at most 20 nodes`);
  if (leaves.length < 5) issues.push(`tree has too few terminal endpoints: ${leaves.length}; expected at least 5`);
  if (leaves.length > 14) issues.push(`tree has too many terminal endpoints: ${leaves.length}; expected at most 14 bundled endpoints`);
  if (maxDepth < 4) issues.push(`tree lacks clinical routing depth: ${maxDepth}; expected at least 4 levels`);
  if (maxDepth > 7) issues.push(`tree is too deep/chain-like: ${maxDepth}; expected compact concurrent bundles rather than lab-by-lab chains`);

  const declaredDomains = new Set(tree.audit_requirements?.required_domains || []);
  requiredPathwayDomains.forEach((domain) => {
    if (!declaredDomains.has(domain)) issues.push(`missing pathway domain: ${domain}`);
  });

  const traversableDomains = new Set((tree.traversable_context?.required_domains || []).map((row) => row.domain));
  requiredContextDomains.forEach((domain) => {
    if (!traversableDomains.has(domain)) issues.push(`missing traversable context domain: ${domain}`);
  });
  if (!tree.traversable_context?.missing_data_endpoint_id) issues.push("traversable_context missing missing_data_endpoint_id");
  if (tree.traversable_context?.missing_data_endpoint_id && !ids.includes(tree.traversable_context.missing_data_endpoint_id)) {
    issues.push(`missing_data_endpoint_id does not resolve: ${tree.traversable_context.missing_data_endpoint_id}`);
  }

  entries.forEach(({ node, parent }) => {
    if (!node.id) issues.push(`node missing id: ${node.label || "unlabeled"}`);
    if (!["action", "decision", "endpoint"].includes(node.type)) issues.push(`${node.id}: invalid node type ${node.type}`);
    if (!node.label || String(node.label).trim().length < 5) issues.push(`${node.id}: missing interpretable label`);
    if (parent && !node.edgeLabel) issues.push(`${node.id}: branch edgeLabel missing`);
    if (!Array.isArray(node.source_ids) || !node.source_ids.length) issues.push(`${node.id}: missing source_ids`);
    if (!node.criteria || !node.criteria.description || !Array.isArray(node.criteria.evaluable_from) || !node.criteria.evaluable_from.length) {
      issues.push(`${node.id}: missing interpretable traversal criteria`);
    }
    if (genericPattern.test(`${node.label} ${node.edgeLabel} ${node.action || ""}`)) {
      issues.push(`${node.id}: contains generic shallow-tree wording`);
    }
    if (node.type === "decision" && (!Array.isArray(node.children) || node.children.length < 2)) {
      issues.push(`${node.id}: decision node must have at least two branches`);
    }
    if (node.type === "endpoint") {
      if (Array.isArray(node.children) && node.children.length) issues.push(`${node.id}: endpoint should not have children`);
      if (!endpointIsActionable(node)) issues.push(`${node.id}: endpoint is not actionable`);
      if ((!Array.isArray(node.source_ids) || !node.source_ids.length) && !node.review_needed_reason) {
        issues.push(`${node.id}: endpoint lacks evidence citation or review-needed reason`);
      }
      if (node.endpoint_type === "missing_data_needed" && (!Array.isArray(node.missing_data_needed) || node.missing_data_needed.length < 3)) {
        issues.push(`${node.id}: missing-data endpoint must name exact data needed`);
      }
      if (node.endpoint_type === "missing_data_needed") {
        const hiddenFromPathway = node.internal_traversal_guard === true
          && node.display?.visible_in_pathway === false
          && node.display?.visible_in_graph === false
          && node.display?.visible_in_outline === false;
        if (!hiddenFromPathway) {
          issues.push(`${node.id}: missing-data endpoint must be an internal hidden traversal guard`);
        }
      }
      if (node.review_needed_reason) reviewNeeds.push(`${node.id}: ${node.review_needed_reason}`);
    }
  });

  const actionNodesWithoutAction = nodes.filter((node) => node.type !== "decision" && (!node.action || String(node.action).length < 15));
  actionNodesWithoutAction.forEach((node) => issues.push(`${node.id}: action/endpoint missing actionable action text`));

  const parallelBundleNodes = nodes.filter((node) => Array.isArray(node.parallel_actions) && node.parallel_actions.length >= 3);
  if (!parallelBundleNodes.length) {
    issues.push("tree lacks a concurrent diagnostic/treatment bundle with at least 3 parallel_actions");
  }
  const cutoffCriteriaNodes = nodes.filter((node) => (
    Array.isArray(node.guideline_cutoffs) && node.guideline_cutoffs.length
  ) || (
    Array.isArray(node.clinical_criteria) && node.clinical_criteria.some((row) => Array.isArray(row.cutoffs) && row.cutoffs.length)
  ));
  if (!cutoffCriteriaNodes.length) {
    issues.push("tree lacks visible guideline_cutoffs or clinical_criteria with explicit cutoffs");
  }

  const activationRules = tree.activationRules || {};
  decisions.forEach((node) => {
    if (!activationRules[node.id] && !node.criteria) issues.push(`${node.id}: missing activation/traversal rule`);
  });

  const referencedSources = allSourceIdsInValue(tree);
  const unresolvedSources = referencedSources.filter((sourceId) => !sourceIds.has(sourceId));
  if (unresolvedSources.length) blockers.push(`unresolved source_ids: ${unresolvedSources.join(", ")}`);
  const metadata = sourceMetadataMap(tree);
  referencedSources.forEach((sourceId) => {
    if (!metadata.has(sourceId)) issues.push(`${sourceId}: source_metadata missing`);
    else if (!hasCompleteSourceMetadata(metadata.get(sourceId))) issues.push(`${sourceId}: source_metadata incomplete`);
  });

  const citedNodes = nodes.filter((node) => Array.isArray(node.source_ids) && node.source_ids.length).length;
  const citationCoverage = nodes.length ? citedNodes / nodes.length : 0;
  if (citationCoverage < 1) issues.push(`citation coverage ${Math.round(citationCoverage * 100)}%; expected 100%`);

  const treeText = JSON.stringify(tree);
  const evidenceCoverage = evidenceGroupHits(module, treeText);
  Object.entries(evidenceCoverage).forEach(([group, row]) => {
    if (!row.pass) issues.push(`${group}: tree references ${row.hits.length}/${row.available} source evidence rows; expected ${row.required}`);
  });
  const thresholdAudit = thresholdCoverage(module, tree);
  if (thresholdAudit.marker_only) {
    issues.push("threshold coverage invalid: source evidence mentions lab/result markers but no numeric or ordinal guideline thresholds were extracted");
  }
  if (!thresholdAudit.pass) {
    issues.push(`threshold coverage incomplete: ${thresholdAudit.included}/${thresholdAudit.available} source thresholds visible in tree`);
  }

  const scenarios = Array.isArray(tree.synthetic_patient_scenarios) ? tree.synthetic_patient_scenarios : [];
  const terminalPathByEndpointId = new Map(paths.map((path) => [path[path.length - 1], path]));
  const scenarioEndpointIds = new Set();
  if (scenarios.length < requiredScenarioPathways.length) issues.push(`synthetic scenario count ${scenarios.length}; expected at least ${requiredScenarioPathways.length}`);
  const scenarioPathways = new Set(scenarios.map((scenario) => scenario.major_pathway));
  requiredScenarioPathways.forEach((pathway) => {
    if (!scenarioPathways.has(pathway)) issues.push(`missing synthetic scenario pathway: ${pathway}`);
  });
  scenarios.forEach((scenario) => {
    const scenarioId = scenario.scenario_id || "scenario";
    const expectedEndpointId = scenario.expected_endpoint_id;
    if (!expectedEndpointId) {
      issues.push(`${scenarioId}: missing expected_endpoint_id`);
      return;
    }
    if (!ids.includes(expectedEndpointId)) {
      issues.push(`${scenarioId}: expected endpoint does not resolve: ${expectedEndpointId}`);
      return;
    }
    const actualPath = terminalPathByEndpointId.get(expectedEndpointId);
    if (!actualPath) {
      issues.push(`${scenarioId}: expected_endpoint_id is not a terminal endpoint: ${expectedEndpointId}`);
      return;
    }
    scenarioEndpointIds.add(expectedEndpointId);
    if (!Array.isArray(scenario.expected_path_node_ids) || !scenario.expected_path_node_ids.length) {
      issues.push(`${scenarioId}: missing expected_path_node_ids for traversability proof`);
    } else {
      const expectedPath = scenario.expected_path_node_ids.map((id) => String(id));
      if (expectedPath.join(" > ") !== actualPath.join(" > ")) {
        issues.push(`${scenarioId}: expected_path_node_ids do not match actual tree path to ${expectedEndpointId}`);
      }
    }
    if (scenario.terminal_endpoint_id && scenario.terminal_endpoint_id !== expectedEndpointId) {
      issues.push(`${scenarioId}: terminal_endpoint_id does not match expected_endpoint_id`);
    }
    if (scenario.traversal_status && scenario.traversal_status !== "reaches_expected_endpoint") {
      issues.push(`${scenarioId}: traversal_status is ${scenario.traversal_status}; expected reaches_expected_endpoint`);
    }
  });
  const uncoveredEndpoints = leaves.filter((node) => !scenarioEndpointIds.has(node.id));
  if (uncoveredEndpoints.length) {
    issues.push(`synthetic scenarios do not cover terminal endpoints: ${uncoveredEndpoints.map((node) => node.id).join(", ")}`);
  }

  const missingDataEndpoints = leaves.filter((node) => node.endpoint_type === "missing_data_needed");
  if (!missingDataEndpoints.length) issues.push("no missing-data endpoint present");
  if (missingDataEndpoints.length > 2) issues.push(`too many missing-data endpoints: ${missingDataEndpoints.length}; bundle missing symptoms/exam/vitals/labs/imaging/medications into at most 2 endpoints`);
  const actionableLeaves = leaves.filter(endpointIsActionable).length;
  if (actionableLeaves !== leaves.length) issues.push(`only ${actionableLeaves}/${leaves.length} paths terminate in actionable endpoints`);

  return resultRecord(file, module, tree, issues, blockers, reviewNeeds, {
    nodeCount: nodes.length,
    branchCount: branches,
    endpointCount: leaves.length,
    decisionCount: decisions.length,
    pathCount: paths.length,
    maxDepth,
    citationCoverage,
    allSourceIdsResolve: unresolvedSources.length === 0,
    evidenceCoverage,
    thresholdAudit,
    syntheticScenarioCount: scenarios.length,
    scenarioCoverage: leaves.length ? (leaves.length - uncoveredEndpoints.length) / leaves.length : 0,
    majorPathwayCoverage: requiredScenarioPathways.filter((pathway) => scenarioPathways.has(pathway)).length / requiredScenarioPathways.length
  });
}

function resultRecord(file, module, tree, issues = [], blockers = [], reviewNeeds = [], metrics = {}) {
  return {
    workup_id: module.id,
    title: module.label || module.id,
    file,
    complete: issues.length === 0 && blockers.length === 0,
    metrics: {
      node_count: metrics.nodeCount || 0,
      branch_count: metrics.branchCount || 0,
      endpoint_count: metrics.endpointCount || 0,
      decision_count: metrics.decisionCount || 0,
      path_count: metrics.pathCount || 0,
      max_depth: metrics.maxDepth || 0,
      citation_coverage: metrics.citationCoverage || 0,
      all_source_ids_resolve: Boolean(metrics.allSourceIdsResolve),
      synthetic_scenario_count: metrics.syntheticScenarioCount || 0,
      scenario_coverage: metrics.scenarioCoverage || 0,
      major_pathway_coverage: metrics.majorPathwayCoverage || 0,
      evidence_coverage: metrics.evidenceCoverage || {},
      threshold_coverage: metrics.thresholdAudit || { available: 0, included: 0, pass: true }
    },
    issues,
    blockers,
    review_needs: reviewNeeds,
    status: tree?.status || "missing"
  };
}

function buildSummary(results) {
  const citationValues = results.map((row) => row.metrics.citation_coverage).filter((value) => Number.isFinite(value));
  const scenarioValues = results.map((row) => row.metrics.scenario_coverage).filter((value) => Number.isFinite(value));
  const majorPathwayValues = results.map((row) => row.metrics.major_pathway_coverage).filter((value) => Number.isFinite(value));
  return {
    audit_date: auditDate,
    module_count: results.length,
    complete_count: results.filter((row) => row.complete).length,
    issue_count: results.reduce((sum, row) => sum + row.issues.length, 0),
    blocker_count: results.reduce((sum, row) => sum + row.blockers.length, 0),
    review_need_count: results.reduce((sum, row) => sum + row.review_needs.length, 0),
    node_count: results.reduce((sum, row) => sum + row.metrics.node_count, 0),
    branch_count: results.reduce((sum, row) => sum + row.metrics.branch_count, 0),
    endpoint_count: results.reduce((sum, row) => sum + row.metrics.endpoint_count, 0),
    synthetic_scenario_count: results.reduce((sum, row) => sum + row.metrics.synthetic_scenario_count, 0),
    min_citation_coverage: citationValues.length ? Math.min(...citationValues) : 0,
    min_scenario_coverage: scenarioValues.length ? Math.min(...scenarioValues) : 0,
    min_major_pathway_coverage: majorPathwayValues.length ? Math.min(...majorPathwayValues) : 0,
    all_source_ids_resolve: results.every((row) => row.metrics.all_source_ids_resolve),
    final_gate_pass: results.every((row) => row.complete)
  };
}

function markdownReport(summary, results) {
  const lines = [];
  lines.push(`# Clinical Pathway Tree Audit - ${summary.audit_date}`);
  lines.push("");
  lines.push(`Modules audited: ${summary.module_count}`);
  lines.push(`Complete modules: ${summary.complete_count}`);
  lines.push(`Issues: ${summary.issue_count}`);
  lines.push(`Blockers: ${summary.blocker_count}`);
  lines.push(`Review needs: ${summary.review_need_count}`);
  lines.push(`Total nodes: ${summary.node_count}`);
  lines.push(`Total branches: ${summary.branch_count}`);
  lines.push(`Total endpoints: ${summary.endpoint_count}`);
  lines.push(`Synthetic scenarios: ${summary.synthetic_scenario_count}`);
  lines.push(`Minimum citation coverage: ${(summary.min_citation_coverage * 100).toFixed(1)}%`);
  lines.push(`Minimum terminal endpoint scenario coverage: ${(summary.min_scenario_coverage * 100).toFixed(1)}%`);
  lines.push(`Minimum major pathway scenario coverage: ${(summary.min_major_pathway_coverage * 100).toFixed(1)}%`);
  lines.push(`All source IDs resolve: ${summary.all_source_ids_resolve ? "yes" : "no"}`);
  lines.push(`Final gate pass: ${summary.final_gate_pass ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Per-workup completion");
  lines.push("");
  lines.push("| Workup | Complete | Nodes | Branches | Endpoints | Depth | Paths | Citation coverage | Endpoint scenario coverage | Major pathway coverage | Evidence row coverage | Issues | Review needs |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|");
  results.forEach((row) => {
    const evidence = Object.entries(row.metrics.evidence_coverage || {})
      .map(([group, info]) => `${group}:${info.hits?.length || 0}/${info.available || 0}`)
      .join(", ");
    lines.push([
      `| ${row.workup_id}`,
      row.complete ? "yes" : "no",
      row.metrics.node_count,
      row.metrics.branch_count,
      row.metrics.endpoint_count,
      row.metrics.max_depth,
      row.metrics.path_count,
      `${(row.metrics.citation_coverage * 100).toFixed(1)}%`,
      `${(row.metrics.scenario_coverage * 100).toFixed(1)}%`,
      `${(row.metrics.major_pathway_coverage * 100).toFixed(1)}%`,
      evidence || "n/a",
      row.issues.length + row.blockers.length,
      row.review_needs.length
    ].join(" | ") + " |");
  });
  lines.push("");
  lines.push("## Blockers and issues");
  const failing = results.filter((row) => row.issues.length || row.blockers.length);
  if (!failing.length) {
    lines.push("");
    lines.push("No missing pathway domains, unreachable required branches, unterminated paths, non-actionable endpoints, uncited management decisions, unresolved source IDs, or shallow generic trees found.");
  } else {
    failing.forEach((row) => {
      lines.push("");
      lines.push(`### ${row.workup_id}`);
      [...row.blockers.map((item) => `BLOCKER: ${item}`), ...row.issues].forEach((issue) => lines.push(`- ${issue}`));
    });
  }
  lines.push("");
  lines.push("## Traversability and scenario coverage");
  lines.push("");
  lines.push("Every passing workup declares structured context requirements for symptoms, exam, vitals, labs, imaging/results, medications, comorbidities, demographics, pregnancy status, and workup findings; defines activation/traversal rules for decision nodes and branch edges; and includes synthetic patients for missing data, emergency escalation, diagnostic uncertainty, mimics, high-risk treatment, contraindication review, reassessment, de-escalation, disposition, follow-up, and safety-netting.");
  lines.push("");
  lines.push("## Review needs");
  const reviewRows = results.filter((row) => row.review_needs.length);
  if (!reviewRows.length) {
    lines.push("");
    lines.push("No clinician-review handoff endpoints were required.");
  } else {
    reviewRows.forEach((row) => {
      lines.push("");
      lines.push(`### ${row.workup_id}`);
      row.review_needs.slice(0, 6).forEach((item) => lines.push(`- ${item}`));
      if (row.review_needs.length > 6) lines.push(`- plus ${row.review_needs.length - 6} additional review endpoints`);
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeReport(path, content) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRegistry = JSON.parse(readFileSync(sourceRegistryPath, "utf8"));
  const sources = Array.isArray(sourceRegistry) ? sourceRegistry : sourceRegistry.sources || [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const results = complaintModuleFiles().map((file) => {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const module = raw.module || raw;
    return auditModule({ file, module, sourceIds });
  });
  const summary = buildSummary(results);
  const report = { summary, results };
  const md = markdownReport(summary, results);

  writeReport(args.out, md);
  writeReport(args.latestOut, md);
  writeReport(args.json, `${JSON.stringify(report, null, 2)}\n`);
  writeReport(args.latestJson, `${JSON.stringify(report, null, 2)}\n`);

  if (!summary.final_gate_pass) {
    const preview = results
      .filter((row) => !row.complete)
      .slice(0, 8)
      .map((row) => `${row.workup_id}: ${[...row.blockers, ...row.issues].slice(0, 4).join("; ")}`)
      .join("\n");
    throw new Error(`Clinical pathway tree audit failed.\n${preview}`);
  }

  console.log(`Clinical pathway tree audit passed: ${summary.complete_count}/${summary.module_count} modules, ${summary.node_count} nodes, ${(summary.min_citation_coverage * 100).toFixed(1)}% minimum citation coverage.`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
