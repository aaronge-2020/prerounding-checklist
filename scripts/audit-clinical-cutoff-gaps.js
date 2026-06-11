import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const moduleRoot = "medical-knowledge/complaint-modules";
const defaultJsonOut = "reports/clinical-cutoff-gap-audit-latest.json";
const defaultMdOut = "reports/clinical-cutoff-gap-audit-latest.md";

const evidenceGroups = [
  "clinical_cutoff_criteria",
  "differentialBuckets",
  "initialTests",
  "redFlags",
  "dispositionRules",
  "safetyChecks",
  "decisionTrees",
  "treatmentOptions",
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam"
];

const prohibitedGenericNodePatterns = [
  /any red flag, unstable vital sign, or emergency feature/i,
  /required diagnostic data available/i,
  /^initial assessment\b/i,
  /collect source-directed confirmation/i,
  /severity(?:\/risk| or disposition-changing risk)? present/i,
  /severity or disposition-changing risk present/i,
  /diagnostic criteria met or treatment cannot wait/i,
  /high-risk or confirmed .* management/i,
  /lower-risk .* management/i,
  /source-backed criteria/i,
  /explicit guideline cutoffs/i,
  /cutoff-bearing/i,
  /cutoff criteria/i,
  /trigger present/i,
  /enough context/i,
  /gather objective data/i,
  /concurrent data bundle obtained/i,
  /criteria match/i,
  /treatment modifier unresolved/i,
  /treatment started or diagnostic plan active/i,
  /worsening or discordant reassessment/i,
  /stopping or de-escalation criteria met/i,
  /stable for follow-up with safety net/i,
  /diagnosis\/risk branch selected/i,
  /threshold\/result data missing/i,
  /compact evidence-cited management pathway/i,
  /treatment branch only when the cited diagnostic\/severity criteria match/i
];

const cutoffUnits = "(?:mg/dL|mg/L|g/L|mmol/L|mEq/L|mIU/L|mU/L|ng/mL|pg/mL|ug/L|mg/g|mcg/mg|mm Hg|mL/kg|mg/kg|g/kg|kg/m2|mL/min(?:/1\\.73\\s*m2)?|mL|hours?|days?|weeks?|months?|years?|cm|mm|ms|seconds?|minutes?|breaths/minute|x10\\^9/L|%|C|ULN|LLN|mOsm/kg|bpm|IU/L|U/L|mcg/dL|ug/dL|mcg/day|mcg|g|mg|kg|cycles/year|measurements?|collections?|samples?|percent|percentile)";
const cutoffPattern = new RegExp([
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

function hasRealCutoff(value = "") {
  const text = cleanText(value);
  if (/(?:(?:>=|<=|>|<|=)|(?:above|below|exceeds?))\s*(?:the\s+)?(?:assay\s+)?(?:ULN|LLN|upper limit of normal|lower limit of normal|reference range)/i.test(text)) return true;
  if (!/\d/.test(text)) return false;
  return new RegExp(cutoffPattern.source, "i").test(text);
}

function parseArgs(argv) {
  const args = { json: defaultJsonOut, out: defaultMdOut };
  argv.forEach((arg) => {
    const [key, ...raw] = arg.replace(/^--/, "").split("=");
    const value = raw.join("=");
    if (key === "json") args.json = value;
    if (key === "out") args.out = value;
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

function unique(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function itemText(item = {}) {
  return cleanText([
    item.id,
    item.label,
    item.criteria_text,
    ...(Array.isArray(item.cutoffs) ? item.cutoffs : []),
    ...(Array.isArray(item.data_needed) ? item.data_needed : []),
    item.action,
    item.management_change,
    item.diagnostic_target,
    item.rationale,
    item.limitations
  ].filter(Boolean).join(" "));
}

function walk(root, out = []) {
  if (!root || typeof root !== "object") return out;
  out.push(root);
  (root.children || []).forEach((child) => walk(child, out));
  return out;
}

function sourceIds(item = {}) {
  return unique([
    item.source_id,
    item.source?.source_id,
    ...(Array.isArray(item.source_ids) ? item.source_ids : []),
    ...(Array.isArray(item.sourceIds) ? item.sourceIds : [])
  ]);
}

function cutoffRows(module = {}) {
  const rows = [];
  const markerOnlyRows = [];
  const fakeCutoffRows = [];
  for (const group of evidenceGroups) {
    const items = Array.isArray(module[group]) ? module[group] : [];
    items.forEach((item) => {
      const text = itemText(item);
      const explicitCutoffs = Array.isArray(item.cutoffs) ? item.cutoffs : [];
      const fakeCutoffs = explicitCutoffs.filter((cutoff) => !hasRealCutoff(cutoff));
      if (fakeCutoffs.length) {
        fakeCutoffRows.push({
          group,
          item_id: item.id || "",
          label: cleanText(item.label || item.text || item.action || item.id || ""),
          fake_cutoffs: unique(fakeCutoffs)
        });
      }
      if (bareMarkerPattern.test(text) && !hasRealCutoff(text)) {
        markerOnlyRows.push({
          group,
          item_id: item.id || "",
          label: cleanText(item.label || item.text || item.action || item.id || ""),
          marker_only_terms: unique(text.match(bareMarkerPattern) || [])
        });
      }
      const cutoffs = unique(text.match(new RegExp(cutoffPattern.source, "gi")) || []).filter(hasRealCutoff);
      if (!cutoffs.length) return;
      rows.push({
        group,
        item_id: item.id || "",
        label: cleanText(item.label || item.text || item.action || item.id || ""),
        cutoffs,
        source_ids: sourceIds(item)
      });
    });
  }
  rows.markerOnlyRows = markerOnlyRows;
  rows.fakeCutoffRows = fakeCutoffRows;
  return rows;
}

function treeGenericFindings(tree = {}) {
  const nodes = walk(tree.root || null);
  return nodes.flatMap((node) => {
    const text = cleanText(`${node.label || ""} ${node.edgeLabel || ""} ${node.action || ""}`);
    return prohibitedGenericNodePatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => ({
        node_id: node.id || "",
        label: node.label || "",
        matched: pattern.source
      }));
  });
}

function moduleRecord(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const module = raw.module || raw;
  const tree = module.clinical_pathway_tree_v1 || {};
  const treeNodes = walk(tree.root || null);
  const rows = cutoffRows(module);
  const markerOnlyRows = rows.markerOnlyRows || [];
  const fakeCutoffRows = rows.fakeCutoffRows || [];
  const treeText = JSON.stringify(tree);
  const cutoffValues = unique(rows.flatMap((row) => row.cutoffs));
  const visibleCutoffs = cutoffValues.filter((cutoff) => treeText.toLowerCase().includes(String(cutoff).toLowerCase()));
  const genericFindings = treeGenericFindings(tree);
  const missingSourceCutoffRows = rows.filter((row) => !row.source_ids.length);
  return {
    file,
    workup_id: module.id || "",
    title: module.label || module.id || "",
    evidence_cutoff_count: cutoffValues.length,
    evidence_cutoff_examples: cutoffValues.slice(0, 12),
    tree_visible_cutoff_count: visibleCutoffs.length,
    tree_visible_cutoff_examples: visibleCutoffs.slice(0, 12),
    cutoff_row_count: rows.length,
    marker_only_row_count: markerOnlyRows.length,
    marker_only_rows: markerOnlyRows.slice(0, 12),
    fake_cutoff_row_count: fakeCutoffRows.length,
    fake_cutoff_rows: fakeCutoffRows.slice(0, 12),
    cutoff_rows_without_sources: missingSourceCutoffRows.length,
    tree_node_count: treeNodes.length,
    prohibited_generic_nodes: genericFindings,
    needs_cutoff_enrichment: cutoffValues.length < 3,
    needs_tree_rewrite: genericFindings.length > 0 || fakeCutoffRows.length > 0 || treeNodes.length > 36 || visibleCutoffs.length < Math.min(3, cutoffValues.length)
  };
}

function markdown(report) {
  const lines = [];
  lines.push("# Clinical Cutoff Gap Audit");
  lines.push("");
  lines.push(`Modules audited: ${report.summary.module_count}`);
  lines.push(`Need cutoff enrichment: ${report.summary.need_cutoff_enrichment_count}`);
  lines.push(`Need tree rewrite: ${report.summary.need_tree_rewrite_count}`);
  lines.push(`Prohibited generic node findings: ${report.summary.prohibited_generic_node_count}`);
  lines.push(`Marker-only pseudo-cutoff rows: ${report.summary.marker_only_row_count}`);
  lines.push(`Fake explicit cutoff rows: ${report.summary.fake_cutoff_row_count}`);
  lines.push("");
  lines.push("| Workup | Evidence cutoffs | Visible in tree | Nodes | Needs cutoff enrichment | Needs tree rewrite | Generic findings | Fake cutoff rows | Marker-only rows | Examples |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  report.results.forEach((row) => {
    lines.push([
      `| ${row.workup_id}`,
      row.evidence_cutoff_count,
      row.tree_visible_cutoff_count,
      row.tree_node_count,
      row.needs_cutoff_enrichment ? "yes" : "no",
      row.needs_tree_rewrite ? "yes" : "no",
      row.prohibited_generic_nodes.length,
      row.fake_cutoff_row_count,
      row.marker_only_row_count,
      row.evidence_cutoff_examples.slice(0, 6).join("; ").replace(/\|/g, "/")
    ].join(" | ") + " |");
  });
  lines.push("");
  lines.push("## Generic Node Findings");
  const genericRows = report.results.filter((row) => row.prohibited_generic_nodes.length);
  if (!genericRows.length) {
    lines.push("");
    lines.push("No prohibited generic nodes found.");
  } else {
    genericRows.forEach((row) => {
      lines.push("");
      lines.push(`### ${row.workup_id}`);
      row.prohibited_generic_nodes.slice(0, 10).forEach((finding) => {
        lines.push(`- ${finding.node_id}: ${finding.label}`);
      });
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = complaintModuleFiles().map(moduleRecord)
    .sort((a, b) => Number(b.needs_cutoff_enrichment) - Number(a.needs_cutoff_enrichment) || a.workup_id.localeCompare(b.workup_id));
  const report = {
    summary: {
      module_count: results.length,
      need_cutoff_enrichment_count: results.filter((row) => row.needs_cutoff_enrichment).length,
      need_tree_rewrite_count: results.filter((row) => row.needs_tree_rewrite).length,
      prohibited_generic_node_count: results.reduce((sum, row) => sum + row.prohibited_generic_nodes.length, 0),
      marker_only_row_count: results.reduce((sum, row) => sum + row.marker_only_row_count, 0),
      fake_cutoff_row_count: results.reduce((sum, row) => sum + row.fake_cutoff_row_count, 0)
    },
    results
  };
  write(args.json, `${JSON.stringify(report, null, 2)}\n`);
  write(args.out, markdown(report));
  console.log(`Clinical cutoff gap audit: ${report.summary.module_count} modules, ${report.summary.need_cutoff_enrichment_count} need cutoff enrichment, ${report.summary.need_tree_rewrite_count} need tree rewrite.`);
}

main();
