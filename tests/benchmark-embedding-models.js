import { writeFileSync } from "node:fs";
import {
  evaluateRetrievalSuite,
  loadEvaluationFixtures
} from "../scripts/evidence-eval.js";
import {
  embeddingModelRegistry,
  normalizeEmbeddingSettings
} from "../embedding-recall.js";

function formatPercent(value) {
  return `${Math.round((value || 0) * 1000) / 10}%`;
}

function modelRows() {
  return Object.values(embeddingModelRegistry).map((model) => {
    const settings = normalizeEmbeddingSettings({ modelKey: model.key });
    const preferredDimensions = model.key === "embeddinggemma" ? "768 now; benchmark 256 truncation" : String(settings.dimensions);
    const role = model.key === "embeddinggemma"
      ? "Primary browser candidate"
      : "Fallback if Gemma fails load, memory, license, latency, or eval gates";
    return {
      key: model.key,
      label: model.label,
      modelId: settings.modelId,
      dtype: settings.dtype,
      dimensions: preferredDimensions,
      threshold: settings.threshold,
      role
    };
  });
}

function renderReport() {
  const fixtures = loadEvaluationFixtures();
  const suite = evaluateRetrievalSuite(fixtures);
  const rows = modelRows();
  const lines = [
    "# Physical Exam Embedding Model Bakeoff",
    "",
    "This report is intentionally conservative: it records the current lexical/rule baseline and the browser-sized model candidates to benchmark. Live model timing/quality should be measured in the app or a dedicated browser runner because model download, WebGPU availability, WASM threading, and cache behavior are browser-dependent.",
    "",
    "## Current Clinical Baseline",
    "",
    `- Eval cases: ${suite.totalCases}`,
    `- Recommended checklist pass rate: ${formatPercent(suite.recommendationPassRate)}`,
    `- Full retrieval pass rate: ${formatPercent(suite.retrievalPassRate)}`,
    `- Recommended core label coverage: ${formatPercent(suite.recommendedCoreLabelCoverageRate)}`,
    `- Recommended avoid-list hit cases: ${suite.recommendationAvoidHitCases}`,
    `- Catalog coverage gaps: ${suite.coverageGapCases}`,
    "",
    "## Browser Model Candidates",
    "",
    "| priority | key | model | default | dimensions | threshold | role |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];

  rows.forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.key} | ${row.modelId} | ${row.dtype} | ${row.dimensions} | ${row.threshold} | ${row.role} |`);
  });

  lines.push(
    "",
    "## Acceptance Gate",
    "",
    "- EmbeddingGemma q4 is the default candidate, not an automatic permanent choice.",
    "- Embeddings may broaden candidate recall, but deterministic clinical bundles, source metadata, actionability, feasibility, and suppress rules remain the selector.",
    "- Embedding-only candidates must remain traceable audit suggestions until accepted into the local evidence catalog or supported by a syndrome/tag rule.",
    "- Compare q4 768d against q4 256d truncation, q8, mxbai-xsmall, and MiniLM on required-domain coverage, avoid-list hits, traceability, cold load, warm latency, memory, and cache size.",
    "",
    "## Recommended Manual Browser Checks",
    "",
    "- `Stomach cramps`: should retrieve focused abdominal/vitals candidates, not zero core items.",
    "- `Burning pee`: should retrieve dysuria/UTI/pyelonephritis questions and CVA/vitals when fever or flank pain is present.",
    "- `Suspected PE`: should retrieve vitals, oxygen/work of breathing, lung exam, heart sounds/JVP when strain is plausible, and DVT leg exam.",
    "- `DKA/HHS`: should retrieve volume/perfusion, Kussmaul/respiratory pattern, mucous membranes, mental status, abdomen, and skin/feet when relevant."
  );

  return `${lines.join("\n")}\n`;
}

const outputArgIndex = process.argv.indexOf("--out");
const report = renderReport();
if (outputArgIndex >= 0 && process.argv[outputArgIndex + 1]) {
  writeFileSync(process.argv[outputArgIndex + 1], report);
} else {
  process.stdout.write(report);
}
