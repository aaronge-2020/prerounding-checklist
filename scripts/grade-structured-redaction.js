import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_CASES = 100;
const REQUIRED_CHARACTERS_PER_CASE = 10_000;

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function contains(container, inner) {
  return container.start <= inner.start && container.end >= inner.end;
}

function normalizeCategory(value) {
  const normalized = String(value || "UNKNOWN").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return normalized === "IP_ADDRESS" ? "IP" : normalized;
}

function annotationsFor(caseItem, key) {
  return caseItem.annotations?.[key] || caseItem[key] || [];
}

function resultFor(runItem) {
  return runItem.result || runItem.output || runItem;
}

function validateSpan(caseItem, span, kind) {
  assert.ok(Number.isInteger(span.start) && Number.isInteger(span.end), `${caseItem.id} ${kind} span needs integer offsets`);
  assert.ok(span.start >= 0 && span.start < span.end && span.end <= caseItem.text.length, `${caseItem.id} ${kind} span is out of range`);
  if (span.text !== undefined) {
    assert.equal(caseItem.text.slice(span.start, span.end), span.text, `${caseItem.id} ${kind} span text disagrees with offsets`);
  }
}

export function validateStructuredCorpus(cases, options = {}) {
  const minimumCases = options.minimumCases ?? REQUIRED_CASES;
  const minimumCharactersPerCase = options.minimumCharactersPerCase ?? REQUIRED_CHARACTERS_PER_CASE;
  assert.ok(Array.isArray(cases), "corpus must be an array");
  const ids = new Set();
  const problems = [];
  for (const caseItem of cases) {
    assert.ok(caseItem?.id && typeof caseItem.id === "string", "every case needs a string id");
    assert.ok(!ids.has(caseItem.id), `duplicate case id: ${caseItem.id}`);
    ids.add(caseItem.id);
    assert.ok(typeof caseItem.text === "string", `${caseItem.id} needs text`);
    if (caseItem.text.length < minimumCharactersPerCase) problems.push({ id: caseItem.id, type: "case-too-short", actual: caseItem.text.length, required: minimumCharactersPerCase });
    for (const span of annotationsFor(caseItem, "phi")) validateSpan(caseItem, span, "phi");
    for (const span of annotationsFor(caseItem, "protected")) validateSpan(caseItem, span, "protected");
  }
  if (cases.length < minimumCases) problems.push({ type: "too-few-cases", actual: cases.length, required: minimumCases });
  return { eligible: problems.length === 0, caseCount: cases.length, characterCount: cases.reduce((sum, item) => sum + item.text.length, 0), minimumCases, minimumCharactersPerCase, problems };
}

export function gradeStructuredRedaction(cases, runItems, options = {}) {
  const corpus = validateStructuredCorpus(cases, options);
  assert.ok(Array.isArray(runItems), "run output must be an array");
  const runsById = new Map(runItems.map((item) => [item.id, item]));
  const failures = [];
  const categoryStats = new Map();
  let phiSpanCount = 0;
  let protectedSpanCount = 0;
  let detectedPhiSpanCount = 0;
  let exactCategoryCount = 0;
  const survivingValues = new Map();

  for (const caseItem of cases) {
    const runItem = runsById.get(caseItem.id);
    if (!runItem) {
      failures.push({ caseId: caseItem.id, type: "missing-run-result" });
      continue;
    }
    const result = resultFor(runItem);
    const outputText = String(result.text ?? result.outputText ?? "");
    const entities = Array.isArray(result.entities) ? result.entities : [];
    for (const entity of entities) validateSpan(caseItem, entity, "result entity");

    for (const truth of annotationsFor(caseItem, "phi")) {
      phiSpanCount += 1;
      const category = normalizeCategory(truth.category || truth.label);
      const stats = categoryStats.get(category) || { category, truth: 0, detected: 0, exactCategory: 0, leaked: 0 };
      stats.truth += 1;
      const matches = entities.filter((entity) => overlaps(entity, truth));
      const covering = matches.find((entity) => contains(entity, truth));
      const sourceText = caseItem.text.slice(truth.start, truth.end);
      const leaked = sourceText.length > 0 && outputText.includes(sourceText);
      if (leaked) {
        const leakKey = `${category}\u0000${sourceText}`;
        const leak = survivingValues.get(leakKey) || { category, value: sourceText, annotatedOccurrences: 0, outputOccurrences: 0, caseIds: new Set() };
        leak.annotatedOccurrences += 1;
        if (!leak.caseIds.has(caseItem.id)) leak.outputOccurrences += outputText.split(sourceText).length - 1;
        leak.caseIds.add(caseItem.id);
        survivingValues.set(leakKey, leak);
      }
      if (covering) {
        detectedPhiSpanCount += 1;
        stats.detected += 1;
        if (normalizeCategory(covering.label || covering.category) === category) {
          exactCategoryCount += 1;
          stats.exactCategory += 1;
        } else {
          failures.push({ caseId: caseItem.id, type: "category-mismatch", truth, entity: covering });
        }
      } else {
        if (leaked) stats.leaked += 1;
        failures.push({ caseId: caseItem.id, type: matches.length ? "partial-phi-redaction" : "missed-phi-span", rawValueSurvivesInOutput: leaked, truth, overlappingEntities: matches });
      }
      categoryStats.set(category, stats);
    }

    for (const truth of annotationsFor(caseItem, "protected")) {
      protectedSpanCount += 1;
      const matches = entities.filter((entity) => overlaps(entity, truth));
      const protectedText = caseItem.text.slice(truth.start, truth.end);
      if (matches.length || !outputText.includes(protectedText)) {
        failures.push({ caseId: caseItem.id, type: matches.length ? "protected-span-redacted" : "protected-text-corrupted", truth, overlappingEntities: matches });
      }
    }
  }

  const failureCounts = Object.fromEntries([...new Set(failures.map((item) => item.type))].sort().map((type) => [type, failures.filter((item) => item.type === type).length]));
  return {
    schema: "structured_redaction_grade_v1",
    corpus,
    passed: corpus.eligible && failures.length === 0,
    metrics: {
      phiSpanCount,
      detectedPhiSpanCount,
      protectedSpanCount,
      phiRecall: phiSpanCount ? detectedPhiSpanCount / phiSpanCount : null,
      categoryAccuracy: detectedPhiSpanCount ? exactCategoryCount / detectedPhiSpanCount : null,
      failureCounts
    },
    categories: [...categoryStats.values()].sort((a, b) => a.category.localeCompare(b.category)),
    survivingPhiValues: [...survivingValues.values()].map((item) => ({ ...item, caseIds: [...item.caseIds].sort() })),
    failures
  };
}

async function loadCorpus(path) {
  const module = await import(pathToFileURL(resolve(path)).href);
  if (typeof module.makeStructuredDeidComplexCases === "function") return module.makeStructuredDeidComplexCases(REQUIRED_CASES);
  return module.default || module.cases;
}

function loadRunDirectory(path) {
  const manifest = JSON.parse(readFileSync(resolve(path, "manifest.json"), "utf8"));
  return manifest.cases.map((item) => JSON.parse(readFileSync(resolve(path, item.file), "utf8")));
}

export function summarizeStructuredGrade(grade) {
  const clusters = new Map();
  for (const failure of grade.failures) {
    const category = normalizeCategory(failure.truth?.category || failure.truth?.label);
    const annotationKey = failure.truth?.key || "";
    const key = `${failure.type}\u0000${category}\u0000${annotationKey}`;
    const cluster = clusters.get(key) || { type: failure.type, category, annotationKey, occurrences: 0, caseIds: new Set(), examples: [] };
    cluster.occurrences += 1;
    cluster.caseIds.add(failure.caseId);
    if (cluster.examples.length < 3) cluster.examples.push({ caseId: failure.caseId, text: failure.truth?.text, resultLabel: failure.entity?.label || failure.overlappingEntities?.[0]?.label || null });
    clusters.set(key, cluster);
  }
  return {
    schema: "structured_redaction_grade_summary_v1",
    passed: grade.passed,
    corpus: grade.corpus,
    metrics: grade.metrics,
    categories: grade.categories,
    survivingPhiValueCount: grade.survivingPhiValues.length,
    survivingPhiOccurrences: grade.survivingPhiValues.reduce((sum, item) => sum + item.outputOccurrences, 0),
    failureClusters: [...clusters.values()].map((item) => ({ type: item.type, category: item.category, annotationKey: item.annotationKey, occurrences: item.occurrences, affectedCases: item.caseIds.size, examples: item.examples })).sort((a, b) => b.occurrences - a.occurrences)
  };
}

async function main(args) {
  assert.ok(args.length >= 2, "usage: node scripts/grade-structured-redaction.js <corpus.js> <run-directory> [report.json]");
  const grade = gradeStructuredRedaction(await loadCorpus(args[0]), loadRunDirectory(args[1]));
  const summary = summarizeStructuredGrade(grade);
  const report = `${JSON.stringify(summary, null, 2)}\n`;
  if (args[2]) writeFileSync(resolve(args[2]), report, "utf8");
  console.log(JSON.stringify({ passed: summary.passed, corpus: summary.corpus, metrics: summary.metrics, survivingPhiValueCount: summary.survivingPhiValueCount }));
  if (!grade.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
