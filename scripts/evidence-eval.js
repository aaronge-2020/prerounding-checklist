import { readFileSync, writeFileSync } from "node:fs";
import {
  buildEvidencePromptReplacement,
  joinEvidenceCatalog,
  matchEvidenceForChecklistItem,
  mergeLegacyPhysicalExamOverlay,
  normalizeEvidenceLabel,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";
import { checklistPrompt, parseChecklist } from "../checklist.js";

const defaultEvalPaths = {
  base: "exam_technique_base.csv",
  overlay: "exam_evidence_overlay.csv",
  legacyOverlay: "physical_exam_evidence_overlay.csv",
  tags: "retrieval_tag_dictionary.csv",
  sources: "source_registry.csv",
  cases: "evidence_eval_cases.csv",
  gold: "evidence_eval_gold.csv"
};

const requiredCaseHeaders = [
  "case_id",
  "category",
  "presentation",
  "chart_context",
  "must_include_tags",
  "red_flags",
  "setting",
  "notes"
];

const requiredGoldHeaders = [
  "case_id",
  "expected_core_labels",
  "acceptable_labels",
  "avoid_labels",
  "required_rationale_terms"
];

function readCsv(path) {
  return parseCsv(readFileSync(path, "utf8"));
}

function splitList(value) {
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertHeaders(rows, headers, fileName) {
  const row = rows[0] || {};
  const missing = headers.filter((header) => !Object.prototype.hasOwnProperty.call(row, header));
  if (missing.length) {
    throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}`);
  }
}

function normalizedSet(values) {
  return new Set(values.map((value) => normalizeEvidenceLabel(value)).filter(Boolean));
}

function candidateLabelSet(candidate) {
  return normalizedSet([
    candidate.examLabel,
    candidate.maneuver,
    candidate.base?.suggested_checklist_label,
    candidate.base?.maneuver_or_finding
  ]);
}

function anyLabelMatches(labels, candidate) {
  const expected = normalizedSet(labels);
  if (!expected.size) {
    return false;
  }
  const candidateLabels = candidateLabelSet(candidate);
  for (const expectedLabel of expected) {
    for (const candidateLabel of candidateLabels) {
      if (candidateLabel === expectedLabel || candidateLabel.includes(expectedLabel) || expectedLabel.includes(candidateLabel)) {
        return true;
      }
    }
  }
  return false;
}

function labelsInCandidates(labels, candidates) {
  return labels.filter((label) => candidates.some((candidate) => anyLabelMatches([label], candidate)));
}

function labelsInBase(labels, baseRows) {
  return labels.filter((label) => {
    const expected = normalizeEvidenceLabel(label);
    return baseRows.some((row) => {
      const baseLabels = normalizedSet([row.suggested_checklist_label, row.maneuver_or_finding]);
      return Array.from(baseLabels).some((baseLabel) => baseLabel === expected || baseLabel.includes(expected) || expected.includes(baseLabel));
    });
  });
}

function caseAllowsCoverageGap(testCase) {
  return /\bcoverage_gap_allowed\b/i.test(testCase.notes || "");
}

function goldForCase(goldRows) {
  return new Map(goldRows.map((row) => [row.case_id, {
    ...row,
    expectedCore: splitList(row.expected_core_labels),
    acceptable: splitList(row.acceptable_labels),
    avoid: splitList(row.avoid_labels),
    requiredRationaleTerms: splitList(row.required_rationale_terms)
  }]));
}

function evidenceTextForCandidates(candidates) {
  return candidates.map((candidate) => [
    candidate.examLabel,
    candidate.diagnostic_target,
    candidate.result_changes_management,
    candidate.management_link,
    candidate.retrieval_tags,
    candidate.source_citation,
    candidate.evidence_source_primary
  ].filter(Boolean).join(" ")).join(" ");
}

function labelCoverageRate(foundLabels, expectedLabels) {
  return expectedLabels.length ? foundLabels.length / expectedLabels.length : 1;
}

export function loadEvaluationFixtures(paths = defaultEvalPaths) {
  const baseRows = readCsv(paths.base);
  const overlayRows = readCsv(paths.overlay);
  const legacyOverlayRows = readCsv(paths.legacyOverlay);
  const tagRows = readCsv(paths.tags);
  const sourceRows = readCsv(paths.sources);
  const caseRows = readCsv(paths.cases);
  const goldRows = readCsv(paths.gold);

  assertHeaders(caseRows, requiredCaseHeaders, paths.cases);
  assertHeaders(goldRows, requiredGoldHeaders, paths.gold);

  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  const catalog = joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    requestedOverlayRows: overlayRows,
    legacyOverlayRows,
    tagRows,
    sourceRows,
    caseRows,
    goldRows,
    goldByCase: goldForCase(goldRows),
    catalog
  };
}

export function evaluateRetrievalCase(testCase, fixtures, options = {}) {
  const gold = fixtures.goldByCase.get(testCase.case_id);
  if (!gold) {
    throw new Error(`Missing gold row for case ${testCase.case_id}`);
  }
  const maxCandidates = options.maxCandidates || 48;
  const promptCandidateCount = options.promptCandidateCount || maxCandidates;
  const priorityWindow = options.priorityWindow || 16;
  const ranked = rankEvidenceCandidates(fixtures.catalog, testCase.chart_context, fixtures.tagRows, {
    specialty: options.specialty || "General clinic",
    maxCandidates
  });
  const promptReplacement = buildEvidencePromptReplacement(checklistPrompt, fixtures, testCase.chart_context, {
    specialty: options.specialty || "General clinic",
    maxCandidates: promptCandidateCount
  });
  const priorityCandidates = ranked.candidates.slice(0, priorityWindow);
  const coreInPriority = labelsInCandidates(gold.expectedCore, priorityCandidates);
  const coreOrAcceptableInPriority = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], priorityCandidates);
  const coreInRetrieved = labelsInCandidates(gold.expectedCore, ranked.candidates);
  const coreOrAcceptableInRetrieved = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], ranked.candidates);
  const avoidHitsPriority = labelsInCandidates(gold.avoid, priorityCandidates);
  const avoidHitsRetrieved = labelsInCandidates(gold.avoid, ranked.candidates);
  const rationaleText = normalizeEvidenceLabel(evidenceTextForCandidates(ranked.candidates));
  const missingRationaleTerms = gold.requiredRationaleTerms.filter((term) => !rationaleText.includes(normalizeEvidenceLabel(term)));
  const expectedInBase = labelsInBase(gold.expectedCore, fixtures.baseRows);
  const expectedInCatalog = labelsInCandidates(gold.expectedCore, fixtures.catalog);
  const coverageGap = caseAllowsCoverageGap(testCase) && expectedInCatalog.length < gold.expectedCore.length;
  const promptGuided = promptReplacement.prompt.includes("<retrieved_evidence_candidates>")
    && !promptReplacement.prompt.includes("<student_exam_reference>")
    && promptReplacement.prompt.includes("starting point, not an exclusive list")
    && promptReplacement.prompt.includes("add any missing bedside-feasible exam maneuvers");

  return {
    caseId: testCase.case_id,
    category: testCase.category,
    presentation: testCase.presentation,
    coverageGap,
    expectedInBase,
    expectedInCatalog,
    matchedTags: ranked.matchedTags.map((tag) => tag.tag),
    priorityCandidates: priorityCandidates.map((candidate) => ({
      exam_id: candidate.exam_id,
      label: candidate.examLabel,
      score: Math.round(candidate.score),
      source: candidate.evidence_source_primary || ""
    })),
    topCandidates: priorityCandidates.map((candidate) => ({
      exam_id: candidate.exam_id,
      label: candidate.examLabel,
      score: Math.round(candidate.score),
      source: candidate.evidence_source_primary || ""
    })),
    retrievedCandidateCount: ranked.candidates.length,
    coreInPriority,
    coreOrAcceptableInPriority,
    coreInRetrieved,
    coreOrAcceptableInRetrieved,
    coreCoverageRate: labelCoverageRate(coreInRetrieved, gold.expectedCore),
    avoidHitsPriority,
    avoidHitsRetrieved,
    missingRationaleTerms,
    promptGuided,
    promptEvidenceSeeded: promptGuided,
    promptRestricted: promptGuided,
    retrievalPass: coverageGap || Boolean(coreOrAcceptableInRetrieved.length),
    priorityPass: coverageGap || Boolean(coreOrAcceptableInPriority.length),
    acceptablePass: coverageGap || Boolean(coreOrAcceptableInRetrieved.length),
    avoidPass: avoidHitsPriority.length === 0,
    rationalePass: missingRationaleTerms.length === 0,
    promptPass: promptGuided
  };
}

export function evaluateRetrievalSuite(fixtures = loadEvaluationFixtures(), options = {}) {
  const seenCases = new Set();
  const duplicateCases = [];
  fixtures.caseRows.forEach((row) => {
    if (seenCases.has(row.case_id)) {
      duplicateCases.push(row.case_id);
    }
    seenCases.add(row.case_id);
  });
  const missingGold = fixtures.caseRows.filter((row) => !fixtures.goldByCase.has(row.case_id)).map((row) => row.case_id);
  const orphanGold = fixtures.goldRows.filter((row) => !seenCases.has(row.case_id)).map((row) => row.case_id);
  if (duplicateCases.length || missingGold.length || orphanGold.length) {
    throw new Error([
      duplicateCases.length ? `Duplicate cases: ${duplicateCases.join(", ")}` : "",
      missingGold.length ? `Missing gold: ${missingGold.join(", ")}` : "",
      orphanGold.length ? `Orphan gold: ${orphanGold.join(", ")}` : ""
    ].filter(Boolean).join("\n"));
  }

  const results = fixtures.caseRows.map((testCase) => evaluateRetrievalCase(testCase, fixtures, options));
  const enforceable = results.filter((result) => !result.coverageGap);
  const retrievalPassRate = enforceable.length
    ? enforceable.filter((result) => result.retrievalPass).length / enforceable.length
    : 1;
  const priorityPassRate = enforceable.length
    ? enforceable.filter((result) => result.priorityPass).length / enforceable.length
    : 1;
  const expectedCoreCount = enforceable.reduce((sum, result) => sum + (fixtures.goldByCase.get(result.caseId)?.expectedCore.length || 0), 0);
  const retrievedCoreCount = enforceable.reduce((sum, result) => sum + result.coreInRetrieved.length, 0);
  const coreLabelCoverageRate = expectedCoreCount ? retrievedCoreCount / expectedCoreCount : 1;
  const completeCoreCaseRate = enforceable.length
    ? enforceable.filter((result) => result.coreCoverageRate >= 1).length / enforceable.length
    : 1;
  const failures = results.filter((result) => {
    if (result.coverageGap) {
      return !result.promptPass;
    }
    if (!result.promptPass || !result.avoidPass || !result.rationalePass) {
      return true;
    }
    return !result.acceptablePass || !result.priorityPass;
  });

  return {
    totalCases: results.length,
    enforceableCases: enforceable.length,
    coverageGapCases: results.filter((result) => result.coverageGap).length,
    retrievalPassRate,
    priorityPassRate,
    coreLabelCoverageRate,
    completeCoreCaseRate,
    top5PassRate: priorityPassRate,
    top10PassRate: retrievalPassRate,
    pass: failures.length === 0
      && priorityPassRate >= (options.priorityThreshold ?? 0.95)
      && retrievalPassRate >= (options.retrievalThreshold ?? 0.98)
      && coreLabelCoverageRate >= (options.coreCoverageThreshold ?? 0.8),
    failures,
    results
  };
}

export function auditChecklistForCase({ caseId, checklistText, fixtures = loadEvaluationFixtures(), options = {} }) {
  const testCase = fixtures.caseRows.find((row) => row.case_id === caseId);
  if (!testCase) {
    throw new Error(`Unknown case_id: ${caseId}`);
  }
  const gold = fixtures.goldByCase.get(caseId);
  if (!gold) {
    throw new Error(`Missing gold row for case_id: ${caseId}`);
  }
  const ranked = rankEvidenceCandidates(fixtures.catalog, testCase.chart_context, fixtures.tagRows, {
    specialty: options.specialty || "General clinic",
    maxCandidates: options.maxCandidates || 48
  });
  const sections = parseChecklist(checklistText);
  const examItems = sections.flatMap((section) => section.items).filter((item) => item.category === "exam");
  const traceable = [];
  const untraceable = [];
  examItems.forEach((item) => {
    const match = matchEvidenceForChecklistItem(item, ranked.candidates);
    if (match) {
      traceable.push({ label: item.label, exam_id: match.exam_id, source: match.evidence_source_primary || "" });
    } else {
      untraceable.push(item.label);
    }
  });
  const examCandidates = examItems.map((item) => ({
    examLabel: item.label,
    maneuver: item.label,
    base: { suggested_checklist_label: item.label, maneuver_or_finding: item.label }
  }));
  const includedExpected = labelsInCandidates(gold.expectedCore, examCandidates);
  const includedAcceptable = labelsInCandidates(gold.acceptable, examCandidates);
  const avoidHits = labelsInCandidates(gold.avoid, examCandidates);
  const missedCore = gold.expectedCore.filter((label) => !includedExpected.some((included) => normalizeEvidenceLabel(included) === normalizeEvidenceLabel(label)));
  return {
    caseId,
    presentation: testCase.presentation,
    examLabels: examItems.map((item) => item.label),
    includedExpected,
    includedAcceptable,
    missedCore,
    avoidHits,
    traceable,
    untraceable,
    pass: missedCore.length === 0 && avoidHits.length === 0
  };
}

export function formatEvaluationReport(suiteResult) {
  const lines = [
    "# Evidence Evaluation Report",
    "",
    `Total cases: ${suiteResult.totalCases}`,
    `Enforceable cases: ${suiteResult.enforceableCases}`,
    `Coverage gap cases: ${suiteResult.coverageGapCases}`,
    `Priority-window core/acceptable recall: ${(suiteResult.priorityPassRate * 100).toFixed(1)}%`,
    `Full retrieved-set core/acceptable recall: ${(suiteResult.retrievalPassRate * 100).toFixed(1)}%`,
    `Core label coverage across enforceable cases: ${(suiteResult.coreLabelCoverageRate * 100).toFixed(1)}%`,
    `Complete-core case coverage: ${(suiteResult.completeCoreCaseRate * 100).toFixed(1)}%`,
    `Overall pass: ${suiteResult.pass ? "yes" : "no"}`,
    ""
  ];
  const failures = suiteResult.failures.slice(0, 40);
  if (failures.length) {
    lines.push("## Failures", "");
    failures.forEach((failure) => {
      lines.push(`- ${failure.caseId} (${failure.presentation})`);
      lines.push(`  - top candidates: ${failure.topCandidates.map((candidate) => candidate.label).join("; ")}`);
      lines.push(`  - priority matches: ${failure.coreOrAcceptableInPriority.join("; ") || "none"}`);
      lines.push(`  - retrieved matches: ${failure.coreOrAcceptableInRetrieved.join("; ") || "none"}`);
      lines.push(`  - avoid hits: ${failure.avoidHitsPriority.join("; ") || "none"}`);
      lines.push(`  - missing rationale terms: ${failure.missingRationaleTerms.join("; ") || "none"}`);
    });
  }
  const gaps = suiteResult.results.filter((result) => result.coverageGap).slice(0, 40);
  if (gaps.length) {
    lines.push("", "## Coverage Gaps", "");
    gaps.forEach((gap) => {
      lines.push(`- ${gap.caseId} (${gap.presentation}): expected base maneuvers not yet evidence-backed: ${gap.expectedInBase.join("; ") || "none"}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

export function writeEvaluationReport(path, suiteResult) {
  writeFileSync(path, formatEvaluationReport(suiteResult), "utf8");
}
