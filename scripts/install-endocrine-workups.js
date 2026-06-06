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
  ACROMEGALY: "Acromegaly Consensus Group",
  ATA: "American Thyroid Association",
  ETA: "European Thyroid Association",
  ENDO: "Endocrine Society",
  ES: "Endocrine Society",
  ESE: "European Society of Endocrinology",
  PHPT: "Fifth International Workshop on Primary Hyperparathyroidism",
  HYPOPARA: "International Task Force on Hypoparathyroidism",
  IMS: "International Menopause Society",
  NIH: "NIH Office of Dietary Supplements",
  PCOS: "International PCOS Guideline Network",
  AUA: "American Urological Association",
  MENOPAUSE: "The Menopause Society",
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

function clinicalRationale(kind, label, row) {
  const diagnosis = row.diagnosis;
  const lower = String(label || "").toLowerCase();
  if (kind === "question") {
    if (/medication|supplement|missed|steroid|amiodarone|lithium|biotin|pregnancy|fertility|procedure|illness/.test(lower)) {
      return `Clarifies reversible causes, assay interference, safety constraints, and treatment modifiers for ${diagnosis}.`;
    }
    if (/symptom|polyuria|polydipsia|weight|palpitation|vision|headache|vomiting|pain|weakness|libido|cycle|menses|thirst/.test(lower)) {
      return `Defines symptom severity, tempo, complications, and whether ${diagnosis} needs urgent evaluation today.`;
    }
    return `Establishes the clinical context needed to interpret endocrine testing and choose a safe ${diagnosis} workup.`;
  }
  if (kind === "exam") {
    if (/vital|bp|heart rate|respiratory|temperature|orthostatic|volume|perfusion|mental status/.test(lower)) {
      return `Screens severity and immediate safety findings that can change triage, monitoring, fluids, or urgent escalation for ${diagnosis}.`;
    }
    if (/thyroid|neck|visual|field|cranial|mass|node|voice|airway|orbit|proptosis|eom/.test(lower)) {
      return `Looks for localizing or mass-effect findings that change imaging, specialty escalation, or procedure planning for ${diagnosis}.`;
    }
    if (/foot|skin|ulcer|infection|neuropathy|monofilament|pulse|vascular/.test(lower)) {
      return `Checks complications or precipitating illness that change treatment intensity, prevention, and disposition for ${diagnosis}.`;
    }
    return `Documents focused endocrine signs and complications that help distinguish severity, mimics, and management priorities for ${diagnosis}.`;
  }
  if (kind === "test") {
    if (/(>=|<=|>|<|\d|range|threshold|cutoff|normal)/.test(label)) {
      return `Provides diagnostic or safety thresholds that change interpretation and management for ${diagnosis}.`;
    }
    return `Confirms the diagnosis, identifies mimics or complications, or establishes a baseline that changes treatment for ${diagnosis}.`;
  }
  if (kind === "red_flag") {
    return `Identifies dangerous ${diagnosis} presentations that should override routine outpatient workup and prompt urgent escalation.`;
  }
  if (kind === "management") {
    return `Links a result or bedside finding to a concrete management change for ${diagnosis}.`;
  }
  return `Supports a traceable, guideline-backed ${diagnosis} workup decision.`;
}

function questionAction(label, row) {
  return `Ask and document because the answer changes diagnostic probability, urgency, test interpretation, or treatment safety for ${row.diagnosis}.`;
}

function conditionalExamTemplates(row) {
  const category = String(row.category || "").toLowerCase();
  const shared = [
    {
      label: "If the patient is acutely ill, unstable, vomiting, dehydrated, febrile, perioperative, pregnant, or inpatient: add repeat vitals, orthostatic/volume-perfusion assessment, mental status, respiratory status, and focused trigger exam.",
      termsAny: ["unstable", "shock", "hypotension", "vomiting", "dehydration", "febrile", "fever", "perioperative", "pregnant", "pregnancy", "inpatient", "altered mental status", "confusion"]
    },
    {
      label: "If symptoms, exam, or labs are discordant with the suspected endocrine diagnosis: repeat the focused exam for mimics, medication effects, assay interference clues, and complications before escalating therapy.",
      termsAny: ["discordant", "mimic", "medication", "biotin", "supplement", "steroid", "amiodarone", "lithium", "immune checkpoint", "unexpected", "assay"]
    }
  ];
  if (/diabetes|blood sugar|metabolic/.test(category)) {
    return [
      {
        label: "If hyperglycemic crisis, vomiting, infection, foot wound, or insulin-access concern is present: add Kussmaul/work-of-breathing assessment, mucous membranes, capillary refill/pulses, abdomen, skin/line/wound exam, and diabetes foot check.",
        termsAny: ["dka", "hhs", "hyperglycemic crisis", "vomiting", "infection", "fever", "foot wound", "ulcer", "missed insulin", "dehydration"]
      },
      {
        label: "If recurrent hypoglycemia, neuropathy, falls, kidney disease, or vascular symptoms are present: add mental status, focused neuro/monofilament or vibration screen, foot pulses/skin, and orthostatic vitals.",
        termsAny: ["hypoglycemia", "neuropathy", "fall", "falls", "kidney disease", "ckd", "claudication", "vascular", "dizziness", "orthostasis"]
      },
      ...shared
    ];
  }
  if (/thyroid/.test(category)) {
    return [
      {
        label: "If palpitations, tachycardia, dyspnea, chest discomfort, tremor, or severe hyperthyroid symptoms are present: add rhythm regularity, heart failure/perfusion signs, tremor/hyperreflexia, and temperature.",
        termsAny: ["palpitations", "tachycardia", "atrial fibrillation", "dyspnea", "chest pain", "tremor", "thyroid storm", "heat intolerance", "fever"]
      },
      {
        label: "If eye, neck mass, hoarseness, dysphagia, dyspnea, radiation exposure, or nodule concern is present: add orbitopathy/EOM screen, thyroid palpation, cervical nodes, voice, airway, and compressive-symptom assessment.",
        termsAny: ["eye", "orbitopathy", "diplopia", "proptosis", "neck mass", "nodule", "hoarseness", "dysphagia", "dyspnea", "radiation", "cervical nodes"]
      },
      ...shared
    ];
  }
  if (/bone|parathyroid/.test(category)) {
    return [
      {
        label: "If fracture, fall, gait instability, bone pain, renal stone, or severe calcium abnormality is present: add gait/fall-risk screen, spine/kyphosis tenderness, hydration/perfusion, neuromuscular irritability, and cognitive status.",
        termsAny: ["fracture", "fall", "falls", "gait", "bone pain", "renal stone", "kidney stone", "hypercalcemia", "hypocalcemia", "confusion", "tetany"]
      },
      {
        label: "If postoperative neck surgery, tingling, cramps, seizure, or low calcium symptoms are present: add Chvostek/Trousseau when appropriate, neuromuscular exam, ECG/rhythm awareness, and airway/neck assessment.",
        termsAny: ["postoperative", "thyroidectomy", "parathyroidectomy", "tingling", "cramps", "seizure", "tetany", "low calcium", "hypocalcemia"]
      },
      ...shared
    ];
  }
  if (/adrenal/.test(category)) {
    return [
      {
        label: "If adrenal crisis, steroid withdrawal, vomiting, infection, hypotension, or electrolyte emergency is possible: add orthostatic vitals, volume/perfusion, mental status, abdominal exam, and hyperpigmentation/skin assessment.",
        termsAny: ["adrenal crisis", "steroid withdrawal", "vomiting", "infection", "fever", "hypotension", "hyponatremia", "hyperkalemia", "shock"]
      },
      {
        label: "If catecholamine spells, severe hypertension, hypokalemia, or Cushing phenotype is present: add seated/standing BP, pulse rhythm, edema/weakness, proximal strength, bruising/striae, and cardiopulmonary stress signs.",
        termsAny: ["pheochromocytoma", "palpitations", "sweating", "severe hypertension", "hypokalemia", "cushing", "bruising", "striae", "proximal weakness", "edema"]
      },
      ...shared
    ];
  }
  if (/reproductive|gonadal/.test(category)) {
    return [
      {
        label: "If infertility, amenorrhea, pregnancy possibility, pelvic pain, abnormal bleeding, or virilization is present: add BP/BMI, thyroid/galactorrhea screen, hirsutism/acne/alopecia scoring, pelvic/abdominal exam when appropriate, and pregnancy safety assessment.",
        termsAny: ["infertility", "amenorrhea", "pregnancy", "pelvic pain", "bleeding", "virilization", "hirsutism", "acne", "alopecia", "galactorrhea"]
      },
      {
        label: "If male hypogonadism, erectile dysfunction, gynecomastia, testicular symptoms, or pituitary symptoms are present: add testicular size/consistency, breast/nipple/nodal exam, body hair/secondary sex characteristics, and visual fields.",
        termsAny: ["hypogonadism", "erectile dysfunction", "gynecomastia", "testicular", "low testosterone", "breast mass", "nipple discharge", "headache", "vision"]
      },
      ...shared
    ];
  }
  if (/pituitary/.test(category)) {
    return [
      {
        label: "If headache, visual symptoms, pituitary mass, apoplexy concern, cranial nerve symptoms, or very high pituitary hormone levels are present: add confrontation visual fields, extraocular movements, cranial nerves, mental status, and optic-chiasm mass-effect screen.",
        termsAny: ["headache", "vision", "visual field", "diplopia", "pituitary mass", "apoplexy", "cranial nerve", "macroadenoma", "very high prolactin", "mass effect"]
      },
      {
        label: "If hormone deficiency or water-balance disorder is possible: add orthostatic/volume exam, mucous membranes, secondary sex characteristics, thyroid/skin signs, pubertal or growth assessment when relevant, and neurologic safety screen.",
        termsAny: ["hypopituitarism", "polyuria", "polydipsia", "diabetes insipidus", "hypernatremia", "amenorrhea", "low libido", "growth", "puberty", "fatigue"]
      },
      ...shared
    ];
  }
  return shared;
}

function differentialMimics(row) {
  const category = String(row.category || "").toLowerCase();
  if (/diabetes|blood sugar|metabolic/.test(category)) {
    return "Important mimics/exclusions: stress or steroid hyperglycemia, type 1/LADA versus type 2 diabetes, DKA/HHS versus uncomplicated hyperglycemia, hypoglycemia/drug effect, renal disease, infection, pregnancy, and secondary endocrine causes.";
  }
  if (/thyroid/.test(category)) {
    return "Important mimics/exclusions: Graves disease, toxic nodule/multinodular goiter, thyroiditis, exogenous thyroid hormone or supplements, iodine/amiodarone effects, nonthyroidal illness, pregnancy-related thyroid disease, malignancy, and compressive nonthyroid neck disease.";
  }
  if (/bone|parathyroid/.test(category)) {
    return "Important mimics/exclusions: primary versus secondary or tertiary parathyroid disease, malignancy-associated calcium disorder, renal disease, vitamin D deficiency or excess, medication effects, malabsorption, osteomalacia, osteoporosis, and acute fracture.";
  }
  if (/adrenal/.test(category)) {
    return "Important mimics/exclusions: exogenous glucocorticoid exposure or withdrawal, primary versus central adrenal insufficiency, adrenal incidentaloma, medication-altered renin/aldosterone testing, catecholamine excess, severe illness, infection, and electrolyte mimics.";
  }
  if (/reproductive|gonadal/.test(category)) {
    return "Important mimics/exclusions: pregnancy, hypothalamic/pituitary disease, thyroid disease, hyperprolactinemia, PCOS, androgen-secreting tumor, medication or substance effects, primary gonadal failure, menopause/POI, and structural pelvic or testicular disease.";
  }
  if (/pituitary/.test(category)) {
    return "Important mimics/exclusions: medication effects, pregnancy/lactation, renal/hepatic disease, sellar or parasellar mass, pituitary apoplexy, primary target-gland disease, central versus nephrogenic water-balance disorder, and age/puberty-specific normal variants.";
  }
  return "Important mimics/exclusions: medication effects, acute illness, assay interference, pregnancy or age-specific physiology, primary versus central endocrine disease, malignancy, and organ-system complications.";
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
    options: standardOptions(),
    action: questionAction(question, row),
    rationale: clinicalRationale("question", question, row)
  }));
  const requiredExam = row.exam.map((exam, index) => item("exam", index, exam, primarySourceId, `${sourceSectionPrefix}: focused physical exam`, {
    action: "Perform and document positive, negative, and unable-to-assess findings.",
    rationale: clinicalRationale("exam", exam, row)
  }));
  const conditionalExam = conditionalExamTemplates(row).map((exam, index) => item("conditional_exam", index, exam.label, primarySourceId, `${sourceSectionPrefix}: conditional focused physical exam add-ons`, {
    action: "Add this focused exam only when the listed modifier is present; document why it was included or deferred.",
    rationale: clinicalRationale("exam", exam.label, row),
    when: { termsAny: exam.termsAny }
  }));
  const testItems = row.tests.map((test, index) => item("test", index, test, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: diagnostic workup`, {
    action: `Interpret with local lab ranges. Reference anchors: ${referenceSummary}`,
    rationale: clinicalRationale("test", test, row)
  }));
  const referenceItems = row.reference_values.map((referenceValue, index) => item("reference", index, referenceValue, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: reference ranges and diagnostic thresholds`, {
    action: "Use as a diagnostic anchor; confirm with local laboratory assay, pregnancy/age/sex context, and acute illness context.",
    rationale: clinicalRationale("test", referenceValue, row)
  }));
  const redFlags = row.red_flags.map((redFlag, index) => item("red_flag", index, redFlag, primarySourceId, `${sourceSectionPrefix}: red flags`, {
    action: "Escalate urgently, reassess severity, and evaluate for dangerous mimics or complications.",
    rationale: clinicalRationale("red_flag", redFlag, row),
    when: { termsAny: redFlag.split(/[;,]| or | and /i).map((term) => term.trim()).filter((term) => term.length >= 4).slice(0, 8) }
  }));
  const dispositionRules = row.management_changes.map((managementChange, index) => item("management", index, managementChange, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: results that change management`, {
    action: managementChange,
    rationale: clinicalRationale("management", managementChange, row)
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
          action: row.tests[0] || row.management_changes[0] || row.diagnosis,
          rationale: clinicalRationale("test", row.tests[0] || row.management_changes[0] || row.diagnosis, row)
        }),
        item("differential", 1, `Key thresholds and interpretation caveats: ${row.reference_values.slice(0, 2).join(" ")}`, row.source_ids[Math.min(1, row.source_ids.length - 1)], `${sourceSectionPrefix}: thresholds`, {
          action: "Use local assay and patient context; do not apply numeric anchors without clinical interpretation.",
          rationale: clinicalRationale("test", row.reference_values.slice(0, 2).join(" "), row)
        }),
        item("differential", 2, differentialMimics(row), row.source_ids[Math.min(2, row.source_ids.length - 1)], `${sourceSectionPrefix}: mimics and exclusions`, {
          action: "Use these alternatives to avoid premature closure and to decide which confirmatory tests, imaging, or specialty pathways are needed.",
          rationale: `Prevents generic endocrine labeling by forcing the ${row.diagnosis} workup to consider dangerous mimics, common confounders, and assay/context pitfalls.`
        })
      ],
      redFlags,
      requiredQuestions,
      conditionalQuestions: [],
      requiredExam,
      conditionalExam,
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
      `   - Questions: ${row.questions.length}; required exams: ${row.exam.length}; conditional exam add-ons: ${conditionalExamTemplates(row).length}; tests/reference anchors: ${row.tests.length + row.reference_values.length}; red flags: ${row.red_flags.length}; management rules: ${row.management_changes.length}`,
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
