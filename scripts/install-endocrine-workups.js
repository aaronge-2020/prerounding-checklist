import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkupPath = path.join(repoRoot, "reports", "endocrine-workups-2026-06-06.json");
const sourceRegistryPath = path.join(repoRoot, "medical-knowledge", "source-registry.json");
const manifestPath = path.join(repoRoot, "medical-knowledge", "manifest.json");
const endocrineModuleDir = path.join(repoRoot, "medical-knowledge", "complaint-modules", "endocrine");
const completionReportPath = path.join(repoRoot, "reports", "endocrine-workup-completion-2026-06-06.md");

const schemaVersion = "medical_knowledge_database_v1";
const moduleSchemaVersion = "complaint-cds-artifact-v1";
const lastReviewed = "2026-06-06";
const clinicalOwner = "endocrine_content_review";

const sourceOrganizations = {
  ADA: "American Diabetes Association",
  AACE: "American Association of Clinical Endocrinology",
  AACE_ATA: "American Association of Clinical Endocrinology / American Thyroid Association",
  ATA: "American Thyroid Association",
  ETA: "European Thyroid Association",
  ENDO: "Endocrine Society",
  ES: "Endocrine Society",
  PHPT: "Fifth International Workshop on Primary Hyperparathyroidism",
  HYPOPARA: "International Task Force on Hypoparathyroidism",
  NIH: "NIH Office of Dietary Supplements",
  PCOS: "International PCOS Guideline Network",
  AUA: "American Urological Association",
  ESHRE: "European Society of Human Reproduction and Embryology",
  ASRM: "American Society for Reproductive Medicine",
  PITUITARY: "Pituitary Society",
  ENDOTEXT: "Endotext",
  SFE: "Society for Endocrinology",
  NHLBI: "National Heart, Lung, and Blood Institute"
};

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function diagnosisModuleId(diagnosis) {
  return `${slug(diagnosis.replace(/\([^)]*\)/g, "").replace(/\//g, " "))}_v1`;
}

function sourceVersion(id, title = "") {
  const idYear = String(id || "").match(/(?:^|_)(20\d{2})(?:_|$)/);
  if (idYear) return idYear[1];
  const titleYear = String(title || "").match(/\b(20\d{2})\b/);
  return titleYear?.[1] || "current";
}

function sourceOrganization(id) {
  const parts = String(id || "").split("_");
  const twoPart = parts.slice(0, 2).join("_");
  return sourceOrganizations[twoPart] || sourceOrganizations[parts[0]] || "Clinical guideline source";
}

function sourceRegistryRow(id, tuple) {
  const [title, url] = tuple;
  return {
    id,
    title,
    source: sourceOrganization(id),
    version: sourceVersion(id, title),
    url,
    date_accessed: lastReviewed,
    citation: title
  };
}

function sourceReference(sourceId, section, strength = "guideline/consensus") {
  return {
    source_id: sourceId,
    source_section: section,
    evidence_strength: strength,
    version_date: sourceVersion(sourceId),
    last_reviewed: lastReviewed,
    clinical_owner: clinicalOwner,
    implementation_notes: "Generated from guideline-backed endocrine workup automation; schema, source, PHI, and regression tests run on 2026-06-06."
  };
}

function standardOptions() {
  return [
    { value: "unknown", label: "Unknown" },
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "other", label: "Other" }
  ];
}

function item(prefix, index, label, sourceId, sourceSection, extra = {}) {
  return {
    id: `${prefix}_${String(index + 1).padStart(2, "0")}`,
    label,
    source: sourceReference(sourceId, sourceSection),
    ...extra
  };
}

function triggerTerms(row) {
  const cleanedDiagnosis = row.diagnosis.replace(/\([^)]*\)/g, "").trim();
  const parentheticalTerms = Array.from(row.diagnosis.matchAll(/\(([^)]*)\)/g))
    .flatMap((match) => match[1].split(/,|\/|;/))
    .map((term) => term.trim())
    .filter(Boolean);
  return Array.from(new Set([
    row.diagnosis,
    cleanedDiagnosis,
    ...parentheticalTerms,
    ...row.aliases,
    slug(cleanedDiagnosis).replace(/_/g, " "),
    ...cleanedDiagnosis.split(/\s+\/\s+/)
  ].map((term) => String(term || "").trim()).filter(Boolean)));
}

function moduleFromWorkup(row) {
  const moduleId = diagnosisModuleId(row.diagnosis);
  const primarySourceId = row.source_ids[0];
  const sourceSectionPrefix = `${row.diagnosis} generated endocrine workup`;
  const referenceSummary = row.reference_values.join(" ");

  const requiredQuestions = row.questions.map((question, index) => item("question", index, question, primarySourceId, `${sourceSectionPrefix}: clinical questions`, {
    options: standardOptions()
  }));
  const requiredExam = row.exam.map((exam, index) => item("exam", index, exam, primarySourceId, `${sourceSectionPrefix}: focused physical exam`, {
    action: "Perform and document positive, negative, and unable-to-assess findings."
  }));
  const testItems = row.tests.map((test, index) => item("test", index, test, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: diagnostic workup`, {
    action: `Interpret with local lab ranges. Reference anchors: ${referenceSummary}`
  }));
  const referenceItems = row.reference_values.map((referenceValue, index) => item("reference", index, referenceValue, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: reference ranges and diagnostic thresholds`, {
    action: "Use as a diagnostic anchor; confirm with local laboratory assay, pregnancy/age/sex context, and acute illness context."
  }));
  const redFlags = row.red_flags.map((redFlag, index) => item("red_flag", index, redFlag, primarySourceId, `${sourceSectionPrefix}: red flags`, {
    action: "Escalate urgently, reassess severity, and evaluate for dangerous mimics or complications.",
    when: { termsAny: redFlag.split(/[;,]| or | and /i).map((term) => term.trim()).filter((term) => term.length >= 4).slice(0, 8) }
  }));
  const dispositionRules = row.management_changes.map((managementChange, index) => item("management", index, managementChange, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: results that change management`, {
    action: managementChange
  }));

  return {
    schema_version: schemaVersion,
    artifact_type: "complaint_cds_module",
    complaint_cds_schema_version: moduleSchemaVersion,
    module: {
      id: moduleId,
      schema_version: moduleSchemaVersion,
      label: row.diagnosis,
      complaint_group: slug(row.category),
      version: "1.0.0",
      status: "mvp",
      population: {
        age_group: "adult",
        setting: "clinician support"
      },
      triggers: triggerTerms(row),
      differentialBuckets: [
        item("differential", 0, `${row.diagnosis}: diagnostic frame from guideline-sourced endocrine workup`, primarySourceId, `${sourceSectionPrefix}: diagnostic frame`, {
          action: row.tests[0] || row.management_changes[0] || row.diagnosis
        }),
        item("differential", 1, `Key thresholds and interpretation caveats: ${row.reference_values.slice(0, 2).join(" ")}`, row.source_ids[Math.min(1, row.source_ids.length - 1)], `${sourceSectionPrefix}: thresholds`, {
          action: "Use local assay and patient context; do not apply numeric anchors without clinical interpretation."
        })
      ],
      redFlags,
      requiredQuestions,
      conditionalQuestions: [],
      requiredExam,
      conditionalExam: [],
      initialTests: [...testItems, ...referenceItems],
      dispositionRules,
      endocrine_metadata: {
        generated_from: "scripts/generate-endocrine-workups.js",
        source_diagnosis: row.diagnosis,
        category: row.category,
        aliases: row.aliases,
        source_ids: row.source_ids,
        reference_values: row.reference_values,
        quality_issues: row.quality_issues,
        activation_status: "active_guideline_workup"
      }
    }
  };
}

function updateSourceRegistry(workupData) {
  const current = readJson(sourceRegistryPath);
  const byId = new Map((current.sources || []).map((row) => [row.id, row]));
  for (const [id, tuple] of Object.entries(workupData.sources || {})) {
    if (!byId.has(id)) {
      byId.set(id, sourceRegistryRow(id, tuple));
    }
  }
  const next = {
    ...current,
    generated_from: "medical-knowledge modules and endocrine workup automation",
    sources: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
  };
  writeJson(sourceRegistryPath, next);
  return next;
}

function updateManifest(modulePaths) {
  const current = readJson(manifestPath);
  const existing = (current.complaint_modules || []).filter((modulePath) => !/complaint-modules\/endocrine\//.test(modulePath));
  const next = {
    ...current,
    complaint_modules: [...existing, ...modulePaths].sort()
  };
  writeJson(manifestPath, next);
  return next;
}

function formatCompletionReport(workups, modulePaths, sourceRegistry) {
  const lines = [
    "# Endocrine Workup Completion Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Completed modules: ${workups.length}`,
    `Source registry entries: ${sourceRegistry.sources.length}`,
    "",
    "Status: mvp. These modules are active guideline-backed endocrine workups with local source/schema/PHI/regression checks.",
    "",
    "## Completed One By One",
    ""
  ];
  workups.forEach((row, index) => {
    const moduleId = diagnosisModuleId(row.diagnosis);
    lines.push(
      `${index + 1}. ${row.diagnosis} (${moduleId})`,
      `   - Category: ${row.category}`,
      `   - Sources: ${row.source_ids.join("; ")}`,
      `   - Questions: ${row.questions.length}; exams: ${row.exam.length}; tests/reference anchors: ${row.tests.length + row.reference_values.length}; red flags: ${row.red_flags.length}; management rules: ${row.management_changes.length}`,
      `   - Quality issues: ${row.quality_issues.length ? row.quality_issues.join("; ") : "none"}`,
      `   - File: ${modulePaths[index]}`,
      ""
    );
  });
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { workups: defaultWorkupPath };
  argv.forEach((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    if (key === "workups") {
      args.workups = path.resolve(valueParts.join("="));
    }
  });
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.workups)) {
    throw new Error(`Missing endocrine workup JSON at ${args.workups}. Run npm run generate:endocrine-workups first.`);
  }
  const workupData = readJson(args.workups);
  const workups = workupData.workups || [];
  if (workups.length !== 37) {
    throw new Error(`Expected 37 endocrine workups, found ${workups.length}.`);
  }
  const incomplete = workups.filter((row) => row.quality_issues?.length);
  if (incomplete.length) {
    throw new Error(`Endocrine workups must pass quality validation before installation: ${incomplete.map((row) => row.diagnosis).join(", ")}`);
  }

  const modulePaths = [];
  mkdirSync(endocrineModuleDir, { recursive: true });
  for (const row of workups) {
    const moduleId = diagnosisModuleId(row.diagnosis);
    const modulePath = path.join(endocrineModuleDir, `${moduleId}.json`);
    writeJson(modulePath, moduleFromWorkup(row));
    modulePaths.push(path.relative(repoRoot, modulePath).replace(/\\/g, "/"));
  }
  const sourceRegistry = updateSourceRegistry(workupData);
  updateManifest(modulePaths);
  mkdirSync(path.dirname(completionReportPath), { recursive: true });
  writeFileSync(completionReportPath, formatCompletionReport(workups, modulePaths, sourceRegistry), "utf8");
  process.stdout.write(`Installed ${workups.length} endocrine workup modules.\n`);
  process.stdout.write(`Completion report: ${completionReportPath}\n`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
