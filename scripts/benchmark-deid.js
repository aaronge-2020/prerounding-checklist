import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { env, pipeline } from "@huggingface/transformers";
import {
  DEFAULT_DTYPE,
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_PRIMARY_MODEL_ID,
  MODEL_PROFILES,
  OPENMED_MODEL_ID,
  createDeidentifier,
  deidentifyTextStructuredOnly
} from "../deid.js";
import { makeSyntheticCases } from "./deid-fixtures.js";

env.allowLocalModels = false;
env.allowRemoteModels = true;

const includeLarge = process.argv.includes("--include-large");
const cases = makeSyntheticCases(250);

function countNeedle(text, needle) {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function normalizeComparableLabel(label) {
  if (!label) {
    return "";
  }
  if (label === "NAME") {
    return "PATIENT NAME";
  }
  if (label === "LOCATION") {
    return "FACILITY";
  }
  return label;
}

function scoreSpanPrecision(result, caseItem) {
  const truth = caseItem.groundTruthSpans || [];
  if (!result.entities?.length) {
    return { truePositive: 0, falsePositive: 0, precision: truth.length ? 0 : 1 };
  }

  let truePositive = 0;
  let falsePositive = 0;
  for (const entity of result.entities) {
    const entityLabel = normalizeComparableLabel(entity.label);
    const matched = truth.some((truthSpan) => {
      const truthLabel = normalizeComparableLabel(truthSpan.label);
      return rangesOverlap(entity, truthSpan) && (entityLabel === truthLabel || entityLabel === "ID" || truthLabel === "ID");
    });
    if (matched) {
      truePositive += 1;
    } else {
      falsePositive += 1;
    }
  }

  return {
    truePositive,
    falsePositive,
    precision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 1
  };
}

function findLeaks(resultText, caseItem) {
  const leaks = [];
  for (const value of caseItem.forbidden) {
    const count = countNeedle(resultText, value);
    if (count) {
      leaks.push({ value, count });
    }
  }
  return leaks;
}

function hasMalformedPreview(text) {
  const patterns = [
    /Patient Name:\s*\[[^\]]+\]\s*:\s*\[/i,
    /\b(?:DOB|MRN|CSN|Phone|Email|Address|Facility|Room|Unit|Provider|Referring provider|Primary endocrinologist|Emergency contact)\s*:\s*\[[A-Z ]+\]\s*:\s*\[/i,
    /Emergency contact:\s*\[PROVIDER NAME\]/i,
    /Primary endocrinologist:\s*\[CONTACT NAME\]/i,
    /Facility:\s*\[ROOM\]/i,
    /Patient Name:\s*\[DOB\]/i,
    /\[\s*\]/,
    /\[[A-Z ]+\n[A-Z ]+\]/
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function evaluateCase(result, caseItem) {
  const leaks = findLeaks(result.text, caseItem);
  const originalIdentifierCount = (caseItem.groundTruthSpans || []).length;
  const leakedIdentifierCount = leaks.reduce((sum, item) => sum + item.count, 0);
  const residualWarnings = result.residualWarnings || [];
  const highRiskResidualCount = residualWarnings.filter((warning) => warning.severity === "high").length;
  const clinicalTermLoss = caseItem.clinicalTerms.filter((term) => !result.text.includes(term)).length;
  const protectedMedicalWarningCount = residualWarnings.filter((warning) => (
    caseItem.clinicalTerms.some((term) => warning.snippet?.toLowerCase().includes(term.toLowerCase()))
  )).length;
  const missingRequiredSnippets = caseItem.requiredSnippets.filter((snippet) => !result.text.includes(snippet));
  const spanPrecision = scoreSpanPrecision(result, caseItem);

  return {
    id: caseItem.id,
    category: caseItem.category,
    originalIdentifierCount,
    leakedIdentifierCount,
    leaks,
    clean: leaks.length === 0,
    residualWarningCount: residualWarnings.length,
    highRiskResidualCount,
    protectedMedicalWarningCount,
    malformedPreview: hasMalformedPreview(result.text) || missingRequiredSnippets.length > 0,
    missingRequiredSnippets,
    clinicalTermLoss,
    spanPrecision
  };
}

function summarizeCandidate(candidate, caseScores, runtimes, loadMs, modelProfile, error = null) {
  const originalIdentifierTotal = caseScores.reduce((sum, item) => sum + item.originalIdentifierCount, 0);
  const leakedIdentifierTotal = caseScores.reduce((sum, item) => sum + item.leakedIdentifierCount, 0);
  const cleanCases = caseScores.filter((item) => item.clean).length;
  const residualWarningCount = caseScores.reduce((sum, item) => sum + item.residualWarningCount, 0);
  const highRiskResidualCount = caseScores.reduce((sum, item) => sum + item.highRiskResidualCount, 0);
  const protectedMedicalWarningCount = caseScores.reduce((sum, item) => sum + item.protectedMedicalWarningCount, 0);
  const malformedPreviewCount = caseScores.filter((item) => item.malformedPreview).length;
  const clinicalFalsePositiveLoss = caseScores.reduce((sum, item) => sum + item.clinicalTermLoss, 0);
  const precisionNumerator = caseScores.reduce((sum, item) => sum + item.spanPrecision.truePositive, 0);
  const precisionDenominator = caseScores.reduce((sum, item) => sum + item.spanPrecision.truePositive + item.spanPrecision.falsePositive, 0);
  const meanWarmRuntimeMs = runtimes.length
    ? runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length
    : 0;
  const modelBytes = modelProfile?.expectedQuantizedBytes || 0;

  const summary = {
    system: candidate.name,
    mode: candidate.mode,
    modelId: candidate.modelId || null,
    recall: originalIdentifierTotal ? 1 - leakedIdentifierTotal / originalIdentifierTotal : 1,
    spanTypePrecision: precisionDenominator ? precisionNumerator / precisionDenominator : 1,
    cleanCases,
    totalCases: caseScores.length,
    forbiddenStringLeaks: leakedIdentifierTotal,
    residualWarningCount,
    highRiskResidualCount,
    protectedMedicalWarningCount,
    malformedPreviewCount,
    clinicalFalsePositiveLoss,
    coldLoadMs: loadMs,
    meanWarmRuntimeMs,
    modelBytes,
    mobileFeasible: Boolean(modelProfile?.mobileFeasible),
    passesGate: leakedIdentifierTotal === 0 &&
      highRiskResidualCount === 0 &&
      protectedMedicalWarningCount === 0 &&
      malformedPreviewCount <= Math.floor(caseScores.length * 0.01) &&
      clinicalFalsePositiveLoss <= Math.floor(caseScores.length * 0.01),
    error: error ? String(error.message || error) : null,
    failures: caseScores
      .filter((item) => !item.clean || item.highRiskResidualCount || item.protectedMedicalWarningCount || item.malformedPreview || item.clinicalTermLoss)
      .slice(0, 8)
  };

  return summary;
}

async function benchmarkStructuredOnly() {
  const candidate = { name: "structured-only", mode: "structured-only", modelId: null };
  const runtimes = [];
  const scores = [];
  for (const caseItem of cases) {
    const start = performance.now();
    const result = deidentifyTextStructuredOnly(caseItem.text);
    runtimes.push(performance.now() - start);
    scores.push(evaluateCase(result, caseItem));
  }
  return summarizeCandidate(candidate, scores, runtimes, 0, { mobileFeasible: true, expectedQuantizedBytes: 0 });
}

async function benchmarkModelCandidate({ name, modelId, mode, profile }) {
  const deidentifier = createDeidentifier({
    pipelineFactory: pipeline,
    modelCandidates: [
      { modelId, options: { dtype: DEFAULT_DTYPE } },
      { modelId, options: {} }
    ],
    mode
  });

  const loadStart = performance.now();
  let loadMs = 0;
  try {
    await deidentifier.loadModel();
    loadMs = performance.now() - loadStart;
  } catch (error) {
    loadMs = performance.now() - loadStart;
    return summarizeCandidate(
      { name, modelId, mode },
      cases.map((caseItem) => ({
        id: caseItem.id,
        category: caseItem.category,
        originalIdentifierCount: caseItem.groundTruthSpans.length,
        leakedIdentifierCount: caseItem.groundTruthSpans.length,
        leaks: caseItem.forbidden.map((value) => ({ value, count: 1 })),
        clean: false,
        residualWarningCount: 0,
        highRiskResidualCount: 0,
        protectedMedicalWarningCount: 0,
        malformedPreview: true,
        missingRequiredSnippets: caseItem.requiredSnippets,
        clinicalTermLoss: 0,
        spanPrecision: { truePositive: 0, falsePositive: 0, precision: 0 }
      })),
      [],
      loadMs,
      profile,
      error
    );
  }

  const runtimes = [];
  const scores = [];
  for (const caseItem of cases) {
    const start = performance.now();
    const result = await deidentifier.deidentifyText(caseItem.text, { mode });
    runtimes.push(performance.now() - start);
    scores.push(evaluateCase(result, caseItem));
  }
  return summarizeCandidate({ name, modelId, mode }, scores, runtimes, loadMs, profile);
}

function openMedMetadata() {
  const profile = MODEL_PROFILES.openmed;
  return {
    system: "OpenMed metadata",
    mode: "metadata-only",
    modelId: OPENMED_MODEL_ID,
    recall: null,
    spanTypePrecision: null,
    cleanCases: null,
    totalCases: cases.length,
    forbiddenStringLeaks: null,
    residualWarningCount: null,
    highRiskResidualCount: null,
    malformedPreviewCount: null,
    clinicalFalsePositiveLoss: null,
    coldLoadMs: null,
    meanWarmRuntimeMs: null,
    modelBytes: profile.expectedQuantizedBytes,
    mobileFeasible: profile.mobileFeasible,
    passesGate: false,
    error: "Metadata only in normal benchmark; run benchmark:deid:large to execute.",
    failures: []
  };
}

function selectWinner(results) {
  const passingHybrids = results
    .filter((result) => result.passesGate && result.mode === "hybrid" && result.modelId)
    .sort((a, b) => (
      Number(b.mobileFeasible) - Number(a.mobileFeasible) ||
      a.modelBytes - b.modelBytes ||
      a.meanWarmRuntimeMs - b.meanWarmRuntimeMs
    ));

  if (passingHybrids.length) {
    return passingHybrids[0];
  }

  const structured = results.find((result) => result.system === "structured-only" && result.passesGate);
  if (structured) {
    return structured;
  }

  return null;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function printSummary(results, winner) {
  const rows = results.map((result) => ({
    System: result.system,
    Recall: formatPercent(result.recall),
    Precision: formatPercent(result.spanTypePrecision),
    Clean: result.cleanCases === null ? "n/a" : `${result.cleanCases}/${result.totalCases}`,
    Malformed: result.malformedPreviewCount === null ? "n/a" : `${result.malformedPreviewCount}/${result.totalCases}`,
    "High residuals": result.highRiskResidualCount ?? "n/a",
    "Med warnings": result.protectedMedicalWarningCount ?? "n/a",
    "Mean ms": result.meanWarmRuntimeMs === null ? "n/a" : result.meanWarmRuntimeMs.toFixed(1),
    "Load ms": result.coldLoadMs === null ? "n/a" : result.coldLoadMs.toFixed(0),
    Gate: result.passesGate ? "pass" : "fail"
  }));
  console.table(rows);
  if (winner) {
    console.log(`Selected default by gate: ${winner.system}`);
  } else {
    console.error("No de-identification candidate passed the benchmark gate.");
  }
}

const results = [];
results.push(await benchmarkStructuredOnly());

results.push(await benchmarkModelCandidate({
  name: "rtrigoso model-only",
  modelId: DEFAULT_PRIMARY_MODEL_ID,
  mode: "model-only",
  profile: MODEL_PROFILES.rtrigoso
}));
results.push(await benchmarkModelCandidate({
  name: "rtrigoso hybrid",
  modelId: DEFAULT_PRIMARY_MODEL_ID,
  mode: "hybrid",
  profile: MODEL_PROFILES.rtrigoso
}));
results.push(await benchmarkModelCandidate({
  name: "Stanford model-only",
  modelId: DEFAULT_FALLBACK_MODEL_ID,
  mode: "model-only",
  profile: MODEL_PROFILES.stanford
}));
results.push(await benchmarkModelCandidate({
  name: "Stanford hybrid",
  modelId: DEFAULT_FALLBACK_MODEL_ID,
  mode: "hybrid",
  profile: MODEL_PROFILES.stanford
}));

if (includeLarge) {
  results.push(await benchmarkModelCandidate({
    name: "OpenMed hybrid",
    modelId: OPENMED_MODEL_ID,
    mode: "hybrid",
    profile: MODEL_PROFILES.openmed
  }));
} else {
  results.push(openMedMetadata());
}

const winner = selectWinner(results);
const report = {
  generatedAt: new Date().toISOString(),
  caseCount: cases.length,
  acceptanceGate: {
    directIdentifierLeaks: 0,
    highRiskResidualWarnings: 0,
    protectedMedicalTermWarnings: 0,
    maxMalformedPreviewRate: 0.01,
    maxClinicalFalsePositiveLossRate: 0.01,
    tieBreakers: ["mobile feasibility", "model bytes", "mean warm runtime"]
  },
  winner: winner ? winner.system : null,
  results
};

mkdirSync("benchmark-results", { recursive: true });
writeFileSync("benchmark-results/deid-latest.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

printSummary(results, winner);

if (!winner) {
  process.exitCode = 1;
}
