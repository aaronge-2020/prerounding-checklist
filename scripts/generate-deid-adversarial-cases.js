import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { makeAdversarialCases } from "./deid-fixtures.js";
import { validateAdversarialCase } from "./deid-adversarial.js";

const args = new Set(process.argv.slice(2));
const outputArgIndex = process.argv.indexOf("--output");
const outputPath = outputArgIndex === -1
  ? "fixtures/deid/adversarial.generated.jsonl"
  : process.argv[outputArgIndex + 1];
const useStdout = args.has("--stdout");
const useLlm = args.has("--llm");

function cloneCase(caseItem, suffix, transform) {
  const next = transform(structuredClone(caseItem));
  next.id = `${caseItem.id}-${suffix}`;
  next.tags = [...new Set([...(next.tags || []), "generated", suffix])];
  return next;
}

function deterministicMutations(baseCases) {
  return baseCases.flatMap((caseItem) => [
    cloneCase(caseItem, "bullets", (next) => ({
      ...next,
      text: next.text
        .split(/\r?\n/)
        .map((line) => line.trim() ? `- ${line}` : line)
        .join("\n")
    })),
    cloneCase(caseItem, "pipe-row", (next) => ({
      ...next,
      text: next.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" | ")
    }))
  ]);
}

function llmPrompt() {
  return `Generate adversarial de-identification test cases as JSONL.
Return only JSONL, with one object per line.
Use this exact schema:
{"id":"string","category":"string","tags":["string"],"text":"string","mustRedact":["string"],"mustPreserve":["string"],"forbiddenWarningSnippets":["string"],"expectedPlaceholders":["string"]}

Rules:
- Use only synthetic fake identifiers.
- Include hard clinical false positives: HPI, PMH, ROS, A/P, DKA, AKI, SOB, Chest Pain, Shortness Of Breath, Daily Labs, labs, medications, and title-case diagnoses.
- Include true fake identifiers adjacent to those terms: patient names, provider names, DOB, MRN, phone, room, and facility where useful.
- Every mustRedact and mustPreserve value must appear exactly in text.
- No commentary, markdown, or explanation.`;
}

function parseJsonl(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function generateLlmCases() {
  const command = process.env.LLM_ADVERSARIAL_COMMAND;
  if (!command) {
    throw new Error("Set LLM_ADVERSARIAL_COMMAND to a command that reads the prompt from stdin and writes JSONL cases to stdout.");
  }

  const result = spawnSync(command, {
    input: llmPrompt(),
    encoding: "utf8",
    shell: true,
    maxBuffer: 5 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `LLM command failed with status ${result.status}`);
  }
  return parseJsonl(result.stdout);
}

const baseCases = makeAdversarialCases();
const generatedCases = [
  ...deterministicMutations(baseCases),
  ...(useLlm ? generateLlmCases() : [])
];

const seenIds = new Set();
const validated = generatedCases.map((caseItem) => validateAdversarialCase(caseItem, seenIds));
const jsonl = `${validated.map((caseItem) => JSON.stringify(caseItem)).join("\n")}\n`;

if (useStdout) {
  process.stdout.write(jsonl);
} else {
  mkdirSync(outputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(outputPath, jsonl, "utf8");
  console.log(`Wrote ${validated.length} adversarial cases to ${outputPath}.`);
}
