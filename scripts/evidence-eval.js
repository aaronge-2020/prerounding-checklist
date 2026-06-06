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
  const ranked = rankEvidenceCandidates(fixtures.catalog, testCase.chart_context, fixtures.tagRows, {
    specialty: options.specialty || "General clinic",
    maxCandidates: options.maxCandidates || 18
  });
  const promptReplacement = buildEvidencePromptReplacement(checklistPrompt, fixtures, testCase.chart_context, {
    specialty: options.specialty || "General clinic",
    maxCandidates: options.promptCandidateCount || 18
  });
  const top5 = ranked.candidates.slice(0, 5);
  const top10 = ranked.candidates.slice(0, 10);
  const coreTop5 = labelsInCandidates(gold.expectedCore, top5);
  const coreOrAcceptableTop10 = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], top10);
  const avoidHitsTop10 = labelsInCandidates(gold.avoid, top10);
  const rationaleText = normalizeEvidenceLabel(evidenceTextForCandidates(top10));
  const missingRationaleTerms = gold.requiredRationaleTerms.filter((term) => !rationaleText.includes(normalizeEvidenceLabel(term)));
  const expectedInBase = labelsInBase(gold.expectedCore, fixtures.baseRows);
  const expectedInCatalog = labelsInCandidates(gold.expectedCore, fixtures.catalog);
  const coverageGap = caseAllowsCoverageGap(testCase) && expectedInCatalog.length < gold.expectedCore.length;
  const promptRestricted = promptReplacement.prompt.includes("<retrieved_evidence_candidates>")
    && !promptReplacement.prompt.includes("<student_exam_reference>")
    && promptReplacement.prompt.includes("Use only the retrieved candidate labels");

  return {
    caseId: testCase.case_id,
    category: testCase.category,
    presentation: testCase.presentation,
    coverageGap,
    expectedInBase,
    expectedInCatalog,
    matchedTags: ranked.matchedTags.map((tag) => tag.tag),
    topCandidates: ranked.candidates.slice(0, 10).map((candidate) => ({
      exam_id: candidate.exam_id,
      label: candidate.examLabel,
      score: Math.round(candidate.score),
      source: candidate.evidence_source_primary || ""
    })),
    coreTop5,
    coreOrAcceptableTop10,
    avoidHitsTop10,
    missingRationaleTerms,
    promptRestricted,
    retrievalPass: coverageGap || Boolean(coreTop5.length),
    acceptablePass: coverageGap || Boolean(coreOrAcceptableTop10.length),
    avoidPass: avoidHitsTop10.length === 0,
    rationalePass: missingRationaleTerms.length === 0,
    promptPass: promptRestricted
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
  const top5PassRate = enforceable.length
    ? enforceable.filter((result) => result.retrievalPass).length / enforceable.length
    : 1;
  const top10PassRate = enforceable.length
    ? enforceable.filter((result) => result.acceptablePass).length / enforceable.length
    : 1;
  const failures = results.filter((result) => {
    if (result.coverageGap) {
      return !result.promptPass;
    }
    if (!result.promptPass || !result.avoidPass || !result.rationalePass) {
      return true;
    }
    return !result.acceptablePass;
  });

  return {
    totalCases: results.length,
    enforceableCases: enforceable.length,
    coverageGapCases: results.filter((result) => result.coverageGap).length,
    top5PassRate,
    top10PassRate,
    pass: failures.length === 0
      && top5PassRate >= (options.top5Threshold ?? 0.9)
      && top10PassRate >= (options.top10Threshold ?? 0.95),
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
    maxCandidates: options.maxCandidates || 18
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
    pass: missedCore.length === 0 && avoidHits.length === 0 && untraceable.length === 0
  };
}

export function formatEvaluationReport(suiteResult) {
  const lines = [
    "# Evidence Evaluation Report",
    "",
    `Total cases: ${suiteResult.totalCases}`,
    `Enforceable cases: ${suiteResult.enforceableCases}`,
    `Coverage gap cases: ${suiteResult.coverageGapCases}`,
    `Top-5 core recall: ${(suiteResult.top5PassRate * 100).toFixed(1)}%`,
    `Top-10 core/acceptable recall: ${(suiteResult.top10PassRate * 100).toFixed(1)}%`,
    `Overall pass: ${suiteResult.pass ? "yes" : "no"}`,
    ""
  ];
  const failures = suiteResult.failures.slice(0, 40);
  if (failures.length) {
    lines.push("## Failures", "");
    failures.forEach((failure) => {
      lines.push(`- ${failure.caseId} (${failure.presentation})`);
      lines.push(`  - top candidates: ${failure.topCandidates.map((candidate) => candidate.label).join("; ")}`);
      lines.push(`  - core top 5: ${failure.coreTop5.join("; ") || "none"}`);
      lines.push(`  - avoid hits: ${failure.avoidHitsTop10.join("; ") || "none"}`);
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
