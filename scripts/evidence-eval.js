import { readFileSync, writeFileSync } from "node:fs";
import {
  buildRecommendedExamChecklist,
  buildEvidencePromptReplacement,
  joinEvidenceCatalog,
  matchEvidenceForChecklistItem,
  mergeLegacyPhysicalExamOverlay,
  normalizeEvidenceLabel,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";
import { checklistPrompt, parseChecklist } from "../checklist.js";
import {
  buildClinicalIntentRetrievalContext,
  clinicalIntentRegistry,
  filterEvidenceCatalogForClinicalIntents,
  resolveClinicalIntents
} from "../clinical-intents.js";

const defaultEvalPaths = {
  base: "data/evidence/exam_technique_base.csv",
  overlay: "data/evidence/exam_evidence_overlay.csv",
  legacyOverlay: "data/physical-exam/physical_exam_evidence_overlay.csv",
  acceptedCatalogAdditions: "data/evidence/accepted_exam_catalog_additions.csv",
  tags: "data/evidence/retrieval_tag_dictionary.csv",
  sources: "data/evidence/source_registry.csv",
  cases: "data/evidence/evidence_eval_cases.csv",
  gold: "data/evidence/evidence_eval_gold.csv",
  gaps: "data/evidence/catalog_gap_registry.csv"
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

const requiredGapRegistryHeaders = [
  "case_id",
  "gap_exam_id",
  "gap_label",
  "gap_type",
  "review_status",
  "review_owner",
  "last_reviewed",
  "source_ids",
  "source_citation",
  "rationale",
  "activation_condition",
  "planned_resolution"
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

function gapRegistryKey(caseId, gapExamId) {
  return `${caseId}::${gapExamId}`;
}

function validateCatalogGapRegistry(gapRows = [], sourceRows = [], caseRows = []) {
  const issues = [];
  const seen = new Set();
  const sourceIds = new Set(sourceRows.map((row) => row.source_id).filter(Boolean));
  const caseIds = new Set(caseRows.map((row) => row.case_id).filter(Boolean));
  const allowedStatuses = new Set(["staged_gap", "validated_gap", "accepted_gap"]);
  const allowedTypes = new Set(["exam_maneuver", "safety_check", "history_question", "source_gap", "red_flag"]);

  gapRows.forEach((row, index) => {
    const key = gapRegistryKey(row.case_id, row.gap_exam_id);
    const label = row.gap_label || row.gap_exam_id || `row ${index + 1}`;
    if (!row.case_id || !caseIds.has(row.case_id)) {
      issues.push(`${label} references unknown case_id ${row.case_id || "missing"}`);
    }
    if (!row.gap_exam_id) {
      issues.push(`${label} is missing gap_exam_id`);
    }
    if (seen.has(key)) {
      issues.push(`Duplicate catalog gap registry key ${key}`);
    }
    seen.add(key);
    if (!allowedTypes.has(row.gap_type)) {
      issues.push(`${key} has invalid gap_type ${row.gap_type || "missing"}`);
    }
    if (!allowedStatuses.has(row.review_status)) {
      issues.push(`${key} has invalid review_status ${row.review_status || "missing"}`);
    }
    if (!row.review_owner) {
      issues.push(`${key} is missing review_owner`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.last_reviewed || "")) {
      issues.push(`${key} has invalid last_reviewed date ${row.last_reviewed || "missing"}`);
    }
    const ids = splitList(row.source_ids);
    if (!ids.length) {
      issues.push(`${key} is missing source_ids`);
    }
    ids.forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) {
        issues.push(`${key} references unknown source_id ${sourceId}`);
      }
    });
    for (const field of ["source_citation", "rationale", "activation_condition", "planned_resolution"]) {
      if (!row[field]) {
        issues.push(`${key} is missing ${field}`);
      }
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    byKey: new Map(gapRows.map((row) => [gapRegistryKey(row.case_id, row.gap_exam_id), row]))
  };
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
  const acceptedCatalogAdditionRows = readCsv(paths.acceptedCatalogAdditions);
  const tagRows = readCsv(paths.tags);
  const sourceRows = readCsv(paths.sources);
  const caseRows = readCsv(paths.cases);
  const goldRows = readCsv(paths.gold);
  const gapRows = readCsv(paths.gaps);

  assertHeaders(caseRows, requiredCaseHeaders, paths.cases);
  assertHeaders(goldRows, requiredGoldHeaders, paths.gold);
  assertHeaders(gapRows, requiredGapRegistryHeaders, paths.gaps);
  const gapRegistry = validateCatalogGapRegistry(gapRows, sourceRows, caseRows);
  if (!gapRegistry.ok) {
    throw new Error(`Invalid catalog gap registry:\n${gapRegistry.issues.join("\n")}`);
  }

  const mergedOverlayRows = mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows);
  const catalog = joinEvidenceCatalog(baseRows, mergedOverlayRows, sourceRows, acceptedCatalogAdditionRows);
  return {
    baseRows,
    overlayRows: mergedOverlayRows,
    requestedOverlayRows: overlayRows,
    legacyOverlayRows,
    acceptedCatalogAdditionRows,
    tagRows,
    sourceRows,
    caseRows,
    goldRows,
    gapRows,
    clinicalIntentRegistry,
    gapRegistryByKey: gapRegistry.byKey,
    goldByCase: goldForCase(goldRows),
    catalog
  };
}

function evaluationIntentQuery(testCase = {}) {
  return [
    testCase.presentation,
    testCase.must_include_tags,
    testCase.chart_context
  ].filter(Boolean).join(" ");
}

function resolvedEvaluationIntents(testCase = {}, registry = clinicalIntentRegistry) {
  const exactGoldMatches = registry.filter((intentRow) => (
    intentRow.status === "validated"
      && (intentRow.gold_case_ids || []).includes(testCase.case_id)
  ));
  if (exactGoldMatches.length) {
    return exactGoldMatches.slice(0, 2);
  }
  const resolved = resolveClinicalIntents(evaluationIntentQuery(testCase), registry, { limit: 4 });
  return resolved.validatedMatches.slice(0, 1);
}

export function evaluateRetrievalCase(testCase, fixtures, options = {}) {
  const gold = fixtures.goldByCase.get(testCase.case_id);
  if (!gold) {
    throw new Error(`Missing gold row for case ${testCase.case_id}`);
  }
  const maxCandidates = options.maxCandidates || 48;
  const promptCandidateCount = options.promptCandidateCount || maxCandidates;
  const priorityWindow = options.priorityWindow || 16;
  const selectedIntents = options.selectedIntents || resolvedEvaluationIntents(testCase, fixtures.clinicalIntentRegistry || clinicalIntentRegistry);
  const intentContext = selectedIntents.length
    ? buildClinicalIntentRetrievalContext(
      selectedIntents,
      testCase.chart_context,
      options.specialty || testCase.setting || "General clinic",
      options.population || "Adult"
    )
    : "";
  const evaluationContext = [
    intentContext,
    !selectedIntents.length ? testCase.chart_context : "",
    `evaluation case: ${testCase.presentation}`,
    testCase.must_include_tags ? `must include tags: ${testCase.must_include_tags}` : ""
  ].filter(Boolean).join("\n");
  const scopedCatalog = selectedIntents.length
    ? filterEvidenceCatalogForClinicalIntents(fixtures.catalog, selectedIntents)
    : [];
  const ranked = rankEvidenceCandidates(scopedCatalog, evaluationContext, fixtures.tagRows, {
    specialty: options.specialty || testCase.setting || "General clinic",
    maxCandidates
  });
  const recommendation = buildRecommendedExamChecklist(evaluationContext, ranked, {
    specialty: options.specialty || testCase.setting || "General clinic",
    maxCoreItems: options.maxCoreItems || 24,
    maxConditionalItems: options.maxConditionalItems || 36,
    validatedIntents: selectedIntents,
    catalogGapRegistryRows: fixtures.gapRows || []
  });
  const promptReplacement = buildEvidencePromptReplacement(checklistPrompt, { ...fixtures, catalog: scopedCatalog }, evaluationContext, {
    specialty: options.specialty || testCase.setting || "General clinic",
    maxCandidates: promptCandidateCount,
    validatedIntents: selectedIntents,
    catalogGapRegistryRows: fixtures.gapRows || []
  });
  const priorityCandidates = ranked.candidates.slice(0, priorityWindow);
  const recommendedSafetyEntries = recommendation.basicSafetyChecks || [];
  const recommendedPhysicalEntries = [
    ...(recommendation.corePhysicalExamManeuvers || []),
    ...(recommendation.conditionalPhysicalExamManeuvers || [])
  ];
  const recommendedPhysicalCandidates = recommendedPhysicalEntries.map((entry) => entry.candidate);
  const recommendedStructuredCandidates = [
    ...recommendedSafetyEntries,
    ...recommendedPhysicalEntries
  ].map((entry) => entry.candidate);
  const catalogGapEntries = recommendation.catalogGaps || [];
  const catalogGapCandidates = catalogGapEntries.map((entry) => entry.candidate || entry);
  const registeredCatalogGaps = [];
  const unregisteredCatalogGaps = [];
  const generatedCompletenessGaps = [];
  catalogGapEntries.forEach((entry) => {
    const examId = entry.exam_id || entry.candidate?.exam_id || "";
    const registryRow = fixtures.gapRegistryByKey?.get(gapRegistryKey(testCase.case_id, examId));
    const generatedCompletenessGap = Boolean(
      entry.traceability?.generated_completeness_gap
        || entry.candidate?.traceability?.generated_completeness_gap
        || (entry.matchedTags || []).includes("workup_completeness_gap")
        || (entry.retrievalTags || []).includes("workup_completeness_gap")
    );
    const summary = {
      exam_id: examId,
      label: entry.label || entry.candidate?.examLabel || "",
      role: entry.role || "",
      source: entry.evidence?.source || entry.candidate?.evidence_source_primary || ""
    };
    if (registryRow) {
      registeredCatalogGaps.push({
        ...summary,
        review_status: registryRow.review_status,
        review_owner: registryRow.review_owner,
        last_reviewed: registryRow.last_reviewed,
        planned_resolution: registryRow.planned_resolution
      });
    } else if (generatedCompletenessGap) {
      generatedCompletenessGaps.push(summary);
    } else {
      unregisteredCatalogGaps.push(summary);
    }
  });
  const coreInPriority = labelsInCandidates(gold.expectedCore, priorityCandidates);
  const coreOrAcceptableInPriority = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], priorityCandidates);
  const coreInRetrieved = labelsInCandidates(gold.expectedCore, ranked.candidates);
  const coreOrAcceptableInRetrieved = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], ranked.candidates);
  const coreInRecommended = labelsInCandidates(gold.expectedCore, recommendedStructuredCandidates);
  const coreOrAcceptableInRecommended = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], recommendedStructuredCandidates);
  const coreInRecommendedPhysicalExam = labelsInCandidates(gold.expectedCore, recommendedPhysicalCandidates);
  const coreOrAcceptableInRecommendedPhysicalExam = labelsInCandidates([...gold.expectedCore, ...gold.acceptable], recommendedPhysicalCandidates);
  const expectedInValidatedGaps = labelsInCandidates(gold.expectedCore, catalogGapCandidates);
  const avoidHitsPriority = labelsInCandidates(gold.avoid, priorityCandidates);
  const avoidHitsRetrieved = labelsInCandidates(gold.avoid, ranked.candidates);
  const avoidHitsRecommended = labelsInCandidates(gold.avoid, recommendedPhysicalCandidates);
  const rationaleText = normalizeEvidenceLabel(evidenceTextForCandidates(ranked.candidates));
  const missingRationaleTerms = gold.requiredRationaleTerms.filter((term) => !rationaleText.includes(normalizeEvidenceLabel(term)));
  const expectedInBase = labelsInBase(gold.expectedCore, fixtures.baseRows);
  const expectedInCatalog = labelsInCandidates(gold.expectedCore, fixtures.catalog);
  const coverageGap = caseAllowsCoverageGap(testCase) && expectedInCatalog.length < gold.expectedCore.length;
  const promptGuided = promptReplacement.prompt.includes("<retrieved_evidence_candidates>")
    && !promptReplacement.prompt.includes("<student_exam_reference>")
    && promptReplacement.prompt.includes("not permission to invent unvalidated final checklist rows")
    && promptReplacement.prompt.includes("catalog gap for app-side review");

  return {
    caseId: testCase.case_id,
    category: testCase.category,
    presentation: testCase.presentation,
    coverageGap,
    selectedIntentIds: selectedIntents.map((intentRow) => intentRow.intent_id),
    unsupportedIntent: !selectedIntents.length,
    expectedInBase,
    expectedInCatalog,
    expectedInValidatedGaps,
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
    recommendedSafetyChecks: (recommendation.basicSafetyChecks || []).map((entry) => ({
      exam_id: entry.exam_id,
      label: entry.label,
      fit: entry.contextFitScore,
      role: entry.role,
      reason: entry.reason
    })),
    recommendedCore: (recommendation.corePhysicalExamManeuvers || []).map((entry) => ({
      exam_id: entry.exam_id,
      label: entry.label,
      fit: entry.contextFitScore,
      role: entry.role,
      reason: entry.reason
    })),
    recommendedConditional: (recommendation.conditionalPhysicalExamManeuvers || []).map((entry) => ({
      exam_id: entry.exam_id,
      label: entry.label,
      fit: entry.contextFitScore,
      role: entry.role,
      reason: entry.reason
    })),
    catalogGaps: (recommendation.catalogGaps || []).map((entry) => ({
      exam_id: entry.exam_id || entry.candidate?.exam_id || "",
      label: entry.label || entry.candidate?.examLabel || "",
      role: entry.role || "",
      source: entry.evidence?.source || entry.candidate?.evidence_source_primary || ""
    })),
    registeredCatalogGaps,
    generatedCompletenessGaps: coverageGap ? generatedCompletenessGaps : [],
    unregisteredCatalogGaps: coverageGap ? unregisteredCatalogGaps : [],
    suppressedCandidates: recommendation.suppressedItems.map((entry) => ({
      exam_id: entry.exam_id,
      label: entry.label,
      reason: entry.reason
    })),
    retrievedCandidateCount: ranked.candidates.length,
    recommendedCandidateCount: recommendedStructuredCandidates.length,
    recommendedPhysicalCandidateCount: recommendedPhysicalCandidates.length,
    coreInPriority,
    coreOrAcceptableInPriority,
    coreInRetrieved,
    coreOrAcceptableInRetrieved,
    coreInRecommended,
    coreOrAcceptableInRecommended,
    coreInRecommendedPhysicalExam,
    coreOrAcceptableInRecommendedPhysicalExam,
    coreCoverageRate: labelCoverageRate(coreInRetrieved, gold.expectedCore),
    recommendedCoreCoverageRate: labelCoverageRate(coreInRecommended, gold.expectedCore),
    recommendedPhysicalExamCoreCoverageRate: labelCoverageRate(coreInRecommendedPhysicalExam, gold.expectedCore),
    avoidHitsPriority,
    avoidHitsRetrieved,
    avoidHitsRecommended,
    missingRationaleTerms,
    promptGuided,
    promptEvidenceSeeded: promptGuided,
    promptRestricted: promptGuided,
    retrievalPass: coverageGap || Boolean(coreOrAcceptableInRetrieved.length),
    priorityPass: coverageGap || Boolean(coreOrAcceptableInPriority.length),
    recommendationPass: coverageGap || Boolean(coreOrAcceptableInRecommended.length),
    acceptablePass: coverageGap || Boolean(coreOrAcceptableInRetrieved.length),
    avoidPass: avoidHitsRecommended.length === 0,
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
  const recommendationPassRate = enforceable.length
    ? enforceable.filter((result) => result.recommendationPass).length / enforceable.length
    : 1;
  const expectedCoreCount = enforceable.reduce((sum, result) => sum + (fixtures.goldByCase.get(result.caseId)?.expectedCore.length || 0), 0);
  const retrievedCoreCount = enforceable.reduce((sum, result) => sum + result.coreInRetrieved.length, 0);
  const recommendedCoreCount = enforceable.reduce((sum, result) => sum + result.coreInRecommended.length, 0);
  const recommendedPhysicalExamCoreCount = enforceable.reduce((sum, result) => sum + result.coreInRecommendedPhysicalExam.length, 0);
  const coreLabelCoverageRate = expectedCoreCount ? retrievedCoreCount / expectedCoreCount : 1;
  const recommendedCoreLabelCoverageRate = expectedCoreCount ? recommendedCoreCount / expectedCoreCount : 1;
  const recommendedPhysicalExamCoreLabelCoverageRate = expectedCoreCount ? recommendedPhysicalExamCoreCount / expectedCoreCount : 1;
  const completeCoreCaseRate = enforceable.length
    ? enforceable.filter((result) => result.coreCoverageRate >= 1).length / enforceable.length
    : 1;
  const completeRecommendedCoreCaseRate = enforceable.length
    ? enforceable.filter((result) => result.recommendedCoreCoverageRate >= 1).length / enforceable.length
    : 1;
  const recommendationAvoidHitCases = enforceable.filter((result) => result.avoidHitsRecommended.length > 0).length;
  const failures = results.filter((result) => {
    if (result.coverageGap) {
      return !result.promptPass || result.unregisteredCatalogGaps.length > 0;
    }
    if (!result.promptPass || !result.avoidPass || !result.rationalePass) {
      return true;
    }
    return !result.recommendationPass;
  });

  return {
    totalCases: results.length,
    enforceableCases: enforceable.length,
    coverageGapCases: results.filter((result) => result.coverageGap).length,
    validatedGapCoveredCases: results.filter((result) => result.coverageGap && result.expectedInValidatedGaps.length).length,
    registeredGapCoveredCases: results.filter((result) => result.coverageGap && result.unregisteredCatalogGaps.length === 0).length,
    retrievalPassRate,
    priorityPassRate,
    recommendationPassRate,
    coreLabelCoverageRate,
    recommendedCoreLabelCoverageRate,
    recommendedPhysicalExamCoreLabelCoverageRate,
    completeCoreCaseRate,
    completeRecommendedCoreCaseRate,
    recommendationAvoidHitCases,
    top5PassRate: priorityPassRate,
    top10PassRate: retrievalPassRate,
    pass: failures.length === 0
      && recommendationPassRate >= (options.recommendationThreshold ?? 0.95)
      && retrievalPassRate >= (options.retrievalThreshold ?? 0.98)
      && recommendedCoreLabelCoverageRate >= (options.recommendedCoreCoverageThreshold ?? 0.75)
      && recommendationAvoidHitCases === 0,
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
    `Catalog evidence gap cases: ${suiteResult.coverageGapCases}`,
    `Gap cases with validated recommendation gaps: ${suiteResult.validatedGapCoveredCases}`,
    `Gap cases with registered staged gaps: ${suiteResult.registeredGapCoveredCases}`,
    `Recommended checklist core/acceptable recall: ${(suiteResult.recommendationPassRate * 100).toFixed(1)}%`,
    `Recommended core label coverage: ${(suiteResult.recommendedCoreLabelCoverageRate * 100).toFixed(1)}%`,
    `Recommended physical-exam core label coverage: ${(suiteResult.recommendedPhysicalExamCoreLabelCoverageRate * 100).toFixed(1)}%`,
    `Recommended avoid-hit cases: ${suiteResult.recommendationAvoidHitCases}`,
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
      lines.push(`  - selected intents: ${failure.selectedIntentIds.join("; ") || "none"}`);
      lines.push(`  - recommended core: ${failure.recommendedCore.map((candidate) => candidate.label).join("; ") || "none"}`);
      lines.push(`  - recommended matches: ${failure.coreOrAcceptableInRecommended.join("; ") || "none"}`);
      lines.push(`  - top candidates: ${failure.topCandidates.map((candidate) => candidate.label).join("; ")}`);
      lines.push(`  - priority matches: ${failure.coreOrAcceptableInPriority.join("; ") || "none"}`);
      lines.push(`  - retrieved matches: ${failure.coreOrAcceptableInRetrieved.join("; ") || "none"}`);
      lines.push(`  - avoid hits: ${failure.avoidHitsRecommended.join("; ") || "none"}`);
      lines.push(`  - missing rationale terms: ${failure.missingRationaleTerms.join("; ") || "none"}`);
    });
  }
  const gaps = suiteResult.results.filter((result) => result.coverageGap).slice(0, 40);
  if (gaps.length) {
    lines.push("", "## Catalog Evidence Gaps", "");
    gaps.forEach((gap) => {
      lines.push(`- ${gap.caseId} (${gap.presentation})`);
      lines.push(`  - selected intents: ${gap.selectedIntentIds.join("; ") || "none"}`);
      lines.push(`  - evidence-backed catalog matches: ${gap.expectedInCatalog.join("; ") || "none"}`);
      lines.push(`  - validated gap matches: ${gap.expectedInValidatedGaps.join("; ") || "none"}`);
      lines.push(`  - registered staged gaps: ${gap.registeredCatalogGaps.map((candidate) => candidate.label).join("; ") || "none"}`);
      lines.push(`  - generated completeness gaps: ${(gap.generatedCompletenessGaps || []).map((candidate) => candidate.label).join("; ") || "none"}`);
      lines.push(`  - unregistered staged gaps: ${gap.unregisteredCatalogGaps.map((candidate) => candidate.label).join("; ") || "none"}`);
      lines.push(`  - recommended matches: ${gap.coreOrAcceptableInRecommended.join("; ") || "none"}`);
      lines.push(`  - physical-exam matches: ${gap.coreOrAcceptableInRecommendedPhysicalExam.join("; ") || "none"}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

export function writeEvaluationReport(path, suiteResult) {
  writeFileSync(path, formatEvaluationReport(suiteResult), "utf8");
}
