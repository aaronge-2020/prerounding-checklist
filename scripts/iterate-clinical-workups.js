import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  normalizeEvidenceLabel,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";
import {
  buildClinicalIntentRetrievalContext,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  normalizeClinicalIntentText,
  resolveClinicalIntents,
  selectedValidatedClinicalIntents
} from "../clinical-intents.js";

const defaultPaths = {
  base: "data/evidence/exam_technique_base.csv",
  overlay: "data/evidence/exam_evidence_overlay.csv",
  legacyOverlay: "data/physical-exam/physical_exam_evidence_overlay.csv",
  tags: "data/evidence/retrieval_tag_dictionary.csv",
  sources: "data/evidence/source_registry.csv"
};

const stopWords = new Set([
  "and",
  "or",
  "the",
  "when",
  "with",
  "without",
  "for",
  "exam",
  "exams",
  "sign",
  "signs",
  "add",
  "addon",
  "indicated",
  "possible",
  "focused",
  "required"
]);

const domainSynonyms = [
  { match: /\bvitals?\b|hemodynamic/, pattern: /\b(?:blood pressure|heart rate|respiratory rate|temperature|vital)\b/ },
  { match: /respiratory pattern|work of breathing|lungs?/, pattern: /\b(?:respiratory rate|kussmaul|thorax|work of breathing|lung sounds|wheez|crackle|diminished)\b/ },
  { match: /volume|perfusion|jvp|edema/, pattern: /\b(?:jvp|edema|pulses?|mouth exam|mucous|blood pressure|heart rate|capillary|perfusion)\b/ },
  { match: /mental status|mentation/, pattern: /\b(?:mental status|confusion|obtund|alert|oriented|pupils?)\b/ },
  { match: /abdomen|abdominal|bowel|peritoneal/, pattern: /\b(?:abdominal|bowel|murphy|rebound|guarding|psoas|obturator|liver|spleen)\b/ },
  { match: /dvt|leg|vascular/, pattern: /\b(?:lower extremity edema|dorsalis pedis|posterior tibial|femoral|calf|leg swelling)\b/ },
  { match: /skin|rash|wound/, pattern: /\b(?:skin|rash|ulcer|wound|mucosa|hives|urticaria)\b/ },
  { match: /mucosa|mucosal|conjunctiva|heent|ear|nose|throat/, pattern: /\b(?:mouth exam|oropharynx|sclerae|conjunctivae|otoscope|ear|nasal|nodes?)\b/ },
  { match: /foot|neuropathy|protective sensation/, pattern: /\b(?:foot|dorsalis pedis|posterior tibial|vibration|light touch|monofilament|proprioception)\b/ },
  { match: /cranial|vision|facial/, pattern: /\b(?:pupils?|extraocular|visual|facial|eye closure|fields)\b/ },
  { match: /motor|sensory|localization|weakness/, pattern: /\b(?:pronator|strength|deltoid|hip|knee|ankle|finger abduction|light touch|pinprick)\b/ },
  { match: /coordination|gait|ataxia/, pattern: /\b(?:gait|romberg|finger to nose|heel to shin|rapid alternating|tandem)\b/ },
  { match: /thyroid/, pattern: /\bthyroid\b/ },
  { match: /joint|musculoskeletal|site specific|range of motion|rom/, pattern: /\b(?:shoulder|knee|ankle|hand|joint|range of motion|palpate|inspect)\b/ }
];

function readCsv(path) {
  return parseCsv(readFileSync(path, "utf8"));
}

function loadCatalog(paths = defaultPaths) {
  const baseRows = readCsv(paths.base);
  const overlayRows = readCsv(paths.overlay);
  const legacyOverlayRows = readCsv(paths.legacyOverlay);
  const tagRows = readCsv(paths.tags);
  const sourceRows = readCsv(paths.sources);
  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    tagRows,
    sourceRows,
    catalog: joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows)
  };
}

function parseArgs(argv) {
  const args = {
    diagnosis: "",
    intentIds: [],
    allMatches: false,
    modifiers: "",
    setting: "General medicine",
    population: "Adult",
    maxCandidates: 80,
    maxCoreItems: 24,
    maxConditionalItems: 36,
    limit: 0,
    out: "",
    json: "",
    iterations: 1,
    watchMs: 0
  };
  argv.forEach((arg) => {
    const [rawKey, ...rawValue] = arg.replace(/^--/, "").split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim();
    if (key === "diagnosis" || key === "query") args.diagnosis = value;
    if (key === "intent") args.intentIds.push(value);
    if (key === "all-matches") args.allMatches = true;
    if (key === "modifiers") args.modifiers = value;
    if (key === "setting") args.setting = value;
    if (key === "population") args.population = value;
    if (key === "max-candidates") args.maxCandidates = Number.parseInt(value, 10) || args.maxCandidates;
    if (key === "max-core") args.maxCoreItems = Number.parseInt(value, 10) || args.maxCoreItems;
    if (key === "max-conditional") args.maxConditionalItems = Number.parseInt(value, 10) || args.maxConditionalItems;
    if (key === "limit") args.limit = Number.parseInt(value, 10) || 0;
    if (key === "out") args.out = value;
    if (key === "json") args.json = value;
    if (key === "iterations") args.iterations = Math.max(1, Number.parseInt(value, 10) || 1);
    if (key === "watch-ms") args.watchMs = Math.max(0, Number.parseInt(value, 10) || 0);
  });
  return args;
}

function selectedIntentsForArgs(args) {
  if (args.intentIds.length) {
    return selectedValidatedClinicalIntents(args.intentIds, clinicalIntentRegistry);
  }
  if (args.diagnosis) {
    const resolved = resolveClinicalIntents(args.diagnosis, clinicalIntentRegistry, { limit: args.allMatches ? 8 : 1 });
    return selectedValidatedClinicalIntents(resolved.validatedMatches.map((intentRow) => intentRow.intent_id), clinicalIntentRegistry);
  }
  return clinicalIntentRegistry.filter((intentRow) => intentRow.status === "validated");
}

function entryLabel(entry) {
  const candidate = entry.candidate || entry;
  return candidate.examLabel || entry.label || candidate.maneuver || candidate.exam_id || "";
}

function entryText(entry) {
  const candidate = entry.candidate || entry;
  return normalizeEvidenceLabel([
    entryLabel(entry),
    entry.domain,
    entry.reason,
    entry.displayDiagnosticTarget,
    entry.displayManagement,
    candidate.diagnostic_target,
    candidate.result_changes_management,
    candidate.management_link,
    candidate.retrieval_tags,
    candidate.condition_or_syndrome
  ].filter(Boolean).join(" "));
}

function requiredDomainSatisfied(domain, recommendationText) {
  const normalizedDomain = normalizeClinicalIntentText(domain);
  const synonym = domainSynonyms.find((row) => row.match.test(normalizedDomain));
  if (synonym) {
    return synonym.pattern.test(recommendationText);
  }
  const tokens = normalizedDomain
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token));
  return tokens.length ? tokens.some((token) => recommendationText.includes(token)) : true;
}

function avoidHitLabels(avoidLabels = [], recommendedEntries = []) {
  const recommendationTextByLabel = recommendedEntries.map((entry) => ({
    label: entryLabel(entry),
    text: normalizeEvidenceLabel(entryLabel(entry))
  }));
  return avoidLabels.flatMap((avoidLabel) => {
    const avoid = normalizeEvidenceLabel(avoidLabel);
    if (!avoid) return [];
    return recommendationTextByLabel
      .filter((entry) => entry.text.includes(avoid) || avoid.includes(entry.text))
      .map((entry) => `${avoidLabel} -> ${entry.label}`);
  });
}

function repeatedLabels(entries = []) {
  const seen = new Map();
  entries.forEach((entry) => {
    const key = normalizeEvidenceLabel(entryLabel(entry));
    if (!key) return;
    seen.set(key, [...(seen.get(key) || []), entryLabel(entry)]);
  });
  return Array.from(seen.values()).filter((labels) => labels.length > 1).map((labels) => labels[0]);
}

function evaluateIntent(intentRow, fixtures, args) {
  const selectedIntents = selectedValidatedClinicalIntents([intentRow.intent_id], clinicalIntentRegistry);
  const context = buildClinicalIntentRetrievalContext(selectedIntents, args.modifiers, args.setting, args.population);
  const filteredCatalog = filterEvidenceCatalogForClinicalIntents(fixtures.catalog, selectedIntents);
  const ranked = rankEvidenceCandidates(filteredCatalog, context, fixtures.tagRows, {
    maxCandidates: args.maxCandidates,
    specialty: args.setting
  });
  const recommendation = buildRecommendedExamChecklist(context, ranked, {
    specialty: args.setting,
    maxCoreItems: args.maxCoreItems,
    maxConditionalItems: args.maxConditionalItems
  });
  const core = recommendation.coreItems || [];
  const conditional = recommendation.conditionalItems || [];
  const recommended = [...core, ...conditional];
  const recommendationText = recommended.map(entryText).join(" ");
  const missingRequiredDomains = (intentRow.required_domains || []).filter((domain) => !requiredDomainSatisfied(domain, recommendationText));
  const avoidHits = avoidHitLabels(intentRow.avoid_labels || [], recommended);
  const duplicateLabels = repeatedLabels(recommended);
  const missingEvidence = recommended.filter((entry) => {
    const candidate = entry.candidate || entry;
    return !candidate.evidence_source_primary && !candidate.source_citation;
  }).map(entryLabel);
  const highScoreSuppressed = (recommendation.suppressedItems || [])
    .filter((entry) => Number(entry.candidate?.score || 0) >= 90)
    .slice(0, 8)
    .map((entry) => ({
      label: entryLabel(entry),
      score: Math.round(entry.candidate?.score || 0),
      reason: entry.reason || "suppressed"
    }));
  const issues = [];
  if (!core.length) issues.push({ severity: "high", type: "no_core", detail: "No core exam items were recommended." });
  missingRequiredDomains.forEach((domain) => issues.push({ severity: "high", type: "missing_required_domain", detail: domain }));
  avoidHits.forEach((hit) => issues.push({ severity: "high", type: "avoid_hit", detail: hit }));
  duplicateLabels.forEach((label) => issues.push({ severity: "medium", type: "duplicate_label", detail: label }));
  if (core.length > 14) issues.push({ severity: "medium", type: "high_burden", detail: `${core.length} core items may be too many for routine bedside use.` });
  missingEvidence.forEach((label) => issues.push({ severity: "medium", type: "missing_source", detail: label }));
  highScoreSuppressed.forEach((item) => issues.push({ severity: "review", type: "high_score_suppressed", detail: `${item.label} (${item.score}): ${item.reason}` }));
  const blockingIssues = issues.filter((issue) => issue.severity !== "review");
  const reviewNotes = issues.filter((issue) => issue.severity === "review");
  return {
    intent_id: intentRow.intent_id,
    label: intentRow.label,
    status: intentRow.status,
    required_domains: intentRow.required_domains || [],
    avoid_labels: intentRow.avoid_labels || [],
    context,
    matched_tags: ranked.matchedTags.map((match) => match.tag),
    active_bundles: (recommendation.activeProfiles || []).map((profile) => profile.id || profile.name),
    counts: {
      core: core.length,
      conditional: conditional.length,
      retrieved: ranked.candidates.length,
      suppressed: (recommendation.suppressedItems || []).length,
      issues: blockingIssues.length,
      review_notes: reviewNotes.length
    },
    core: core.map((entry) => summarizeEntry(entry)),
    conditional: conditional.map((entry) => summarizeEntry(entry)),
    top_retrieved: ranked.candidates.slice(0, 16).map((candidate) => summarizeEntry(candidate)),
    high_score_suppressed: highScoreSuppressed,
    missing_required_domains: missingRequiredDomains,
    avoid_hits: avoidHits,
    duplicate_labels: duplicateLabels,
    missing_evidence: missingEvidence,
    issues: blockingIssues,
    review_notes: reviewNotes,
    pass: !blockingIssues.some((issue) => issue.severity === "high")
  };
}

function summarizeEntry(entry) {
  const candidate = entry.candidate || entry;
  return {
    exam_id: candidate.exam_id || entry.exam_id || "",
    label: entryLabel(entry),
    role: entry.role || "",
    fit: entry.contextFitScore ?? "",
    score: Math.round(candidate.score || entry.score || 0),
    reason: entry.reason || "",
    diagnostic_target: entry.displayDiagnosticTarget || candidate.diagnostic_target || "",
    management_change: entry.displayManagement || candidate.result_changes_management || candidate.management_link || "",
    evidence: candidate.evidence_source_primary || candidate.source_citation || "",
    lr_plus: candidate.LR_plus || "",
    lr_minus: candidate.LR_minus || "",
    difficulty: candidate.difficulty || "",
    time_burden_minutes: candidate.time_burden_minutes || "",
    routes: candidate.retrievalRoutes || []
  };
}

function formatMarkdown(run) {
  const lines = [
    "# Clinical Workup Iteration Report",
    "",
    `Generated: ${run.generated_at}`,
    `Setting: ${run.setting}`,
    `Population: ${run.population}`,
    `Modifiers: ${run.modifiers || "none"}`,
    `Intents evaluated: ${run.results.length}`,
    `High-severity issue cases: ${run.results.filter((result) => result.issues.some((issue) => issue.severity === "high")).length}`,
    `Review-note cases: ${run.results.filter((result) => result.review_notes.length).length}`,
    "",
    "## Summary",
    ""
  ];
  run.results.forEach((result) => {
    const status = result.pass ? "PASS" : "REVIEW";
    lines.push(`- ${status} ${result.intent_id}: ${result.label}`);
    lines.push(`  - core ${result.counts.core}, conditional ${result.counts.conditional}, retrieved ${result.counts.retrieved}, suppressed ${result.counts.suppressed}`);
    lines.push(`  - issues: ${result.issues.length ? result.issues.map((issue) => `${issue.type}: ${issue.detail}`).join("; ") : "none"}`);
    lines.push(`  - review notes: ${result.review_notes.length ? result.review_notes.map((issue) => `${issue.type}: ${issue.detail}`).join("; ") : "none"}`);
    lines.push(`  - core labels: ${result.core.map((entry) => entry.label).join("; ") || "none"}`);
  });
  const issueCases = run.results.filter((result) => result.issues.length || result.review_notes.length);
  if (issueCases.length) {
    lines.push("", "## Improvement Queue", "");
    issueCases.forEach((result) => {
      lines.push(`### ${result.intent_id}: ${result.label}`, "");
      if (result.issues.length) {
        lines.push("Issues:");
        result.issues.forEach((issue) => {
          lines.push(`- ${issue.severity}: ${issue.type} - ${issue.detail}`);
        });
      }
      if (result.review_notes.length) {
        lines.push("Review notes:");
        result.review_notes.forEach((issue) => {
          lines.push(`- ${issue.type} - ${issue.detail}`);
        });
      }
      lines.push("", "Core:");
      result.core.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
      });
      if (result.conditional.length) {
        lines.push("", "Conditional:");
        result.conditional.forEach((entry, index) => {
          lines.push(`${index + 1}. ${entry.label} (${entry.exam_id}) - ${entry.reason || entry.management_change || "no rationale"}`);
        });
      }
      if (result.high_score_suppressed.length) {
        lines.push("", "High-score suppressed candidates to review:");
        result.high_score_suppressed.forEach((entry) => {
          lines.push(`- ${entry.label} (${entry.score}): ${entry.reason}`);
        });
      }
      lines.push("");
    });
  }
  return `${lines.join("\n")}\n`;
}

function outputPathForIteration(path, iteration) {
  if (!path || iteration === 1) return path;
  const extension = extname(path);
  return extension
    ? `${path.slice(0, -extension.length)}.${String(iteration).padStart(3, "0")}${extension}`
    : `${path}.${String(iteration).padStart(3, "0")}`;
}

function writeOutput(path, text) {
  if (!path) return;
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, "utf8");
}

function buildRun(fixtures, args) {
  let intents = selectedIntentsForArgs(args);
  if (args.limit > 0) {
    intents = intents.slice(0, args.limit);
  }
  if (!intents.length) {
    throw new Error("No validated clinical intents matched the requested diagnosis or intent id.");
  }
  const results = intents.map((intentRow) => evaluateIntent(intentRow, fixtures, args));
  return {
    generated_at: new Date().toISOString(),
    setting: args.setting,
    population: args.population,
    modifiers: args.modifiers,
    diagnosis_query: args.diagnosis,
    intent_ids: intents.map((intentRow) => intentRow.intent_id),
    results
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = loadCatalog();
  for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
    const run = buildRun(fixtures, args);
    const markdown = formatMarkdown(run);
    writeOutput(outputPathForIteration(args.out, iteration), markdown);
    writeOutput(outputPathForIteration(args.json, iteration), `${JSON.stringify(run, null, 2)}\n`);
    if (!args.out && !args.json) {
      process.stdout.write(markdown);
    } else {
      const issueCount = run.results.reduce((sum, result) => sum + result.counts.issues, 0);
      const reviewNoteCount = run.results.reduce((sum, result) => sum + result.counts.review_notes, 0);
      process.stdout.write(`Clinical workup iteration ${iteration}: ${run.results.length} intent(s), ${issueCount} issue(s), ${reviewNoteCount} review note(s).\n`);
    }
    if (iteration < args.iterations && args.watchMs > 0) {
      await delay(args.watchMs);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
