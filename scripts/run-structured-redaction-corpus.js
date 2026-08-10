import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";

const RUNNER_PATH = fileURLToPath(import.meta.url);

export const STRUCTURED_RUN_SCHEMA = "prerounding_structured_redaction_run_v1";
export const STRUCTURED_CASE_SCHEMA = "prerounding_structured_redaction_case_result_v1";
export const MIN_CASES = 100;
export const MIN_CASE_CHARACTERS = 10_000;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeCaseFilename(id, index) {
  const slug = id.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${String(index + 1).padStart(3, "0")}-${slug || "case"}.json`;
}

function parseDate(value, field, id) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  assert.ok(!Number.isNaN(date.getTime()), `${id} has invalid ${field}: ${value}`);
  return date;
}

export async function loadStructuredCorpus(path) {
  const document = /\.(?:m?js)$/i.test(path)
    ? await import(pathToFileURL(resolve(path)).href).then((module) => {
      if (typeof module.makeStructuredDeidComplexCases === "function") {
        return module.makeStructuredDeidComplexCases(MIN_CASES);
      }
      return module.default || module.cases;
    })
    : JSON.parse(readFileSync(path, "utf8"));
  const cases = Array.isArray(document) ? document : document.cases;
  assert.ok(Array.isArray(cases), "corpus must be an array or an object with a cases array");
  assert.ok(cases.length >= MIN_CASES, `corpus must contain at least ${MIN_CASES} cases; got ${cases.length}`);

  const ids = new Set();
  return cases.map((caseItem, index) => {
    assert.ok(caseItem && typeof caseItem === "object", `case ${index + 1} must be an object`);
    assert.ok(typeof caseItem.id === "string" && caseItem.id.trim(), `case ${index + 1} must have a non-empty string id`);
    assert.ok(!ids.has(caseItem.id), `duplicate case id: ${caseItem.id}`);
    ids.add(caseItem.id);
    assert.ok(typeof caseItem.text === "string", `${caseItem.id} must have string text`);
    assert.ok(caseItem.text.length >= MIN_CASE_CHARACTERS, `${caseItem.id} must contain at least ${MIN_CASE_CHARACTERS} characters; got ${caseItem.text.length}`);
    assert.ok(caseItem.options == null || (typeof caseItem.options === "object" && !Array.isArray(caseItem.options)), `${caseItem.id} options must be an object`);
    return caseItem;
  });
}

export function runStructuredCase(caseItem) {
  const admissionDate = parseDate(caseItem.admissionDate, "admissionDate", caseItem.id);
  const options = caseItem.options || (caseItem.relativeDate ? { relativeDate: caseItem.relativeDate } : {});
  const result = deidentifyTextStructuredOnly(caseItem.text, admissionDate, options);
  return {
    schema: STRUCTURED_CASE_SCHEMA,
    id: caseItem.id,
    tags: Array.isArray(caseItem.tags) ? caseItem.tags : [],
    invocation: {
      function: "deidentifyTextStructuredOnly",
      admissionDate: admissionDate ? admissionDate.toISOString() : null,
      options
    },
    input: {
      text: caseItem.text,
      characters: caseItem.text.length,
      utf8Bytes: Buffer.byteLength(caseItem.text, "utf8"),
      sha256: sha256(caseItem.text)
    },
    output: {
      ...result,
      characters: result.text.length,
      utf8Bytes: Buffer.byteLength(result.text, "utf8"),
      sha256: sha256(result.text)
    }
  };
}

export async function runStructuredCorpus(inputPath, outputDirectory) {
  const cases = await loadStructuredCorpus(inputPath);
  const resolvedOutput = resolve(outputDirectory);
  const resolvedInput = resolve(inputPath);
  assert.notEqual(resolvedOutput, parse(resolvedOutput).root, "refusing to use a filesystem root as the output directory");
  assert.notEqual(resolvedOutput, resolve("."), "refusing to use the workspace root as the output directory");
  assert.notEqual(resolvedOutput, dirname(resolvedInput), "refusing to replace the input file's directory");
  rmSync(resolvedOutput, { recursive: true, force: true });
  mkdirSync(resolvedOutput, { recursive: true });

  const startedAt = new Date().toISOString();
  const caseEntries = [];
  let inputCharacters = 0;
  let outputCharacters = 0;
  let redactionTotal = 0;
  let residualWarningTotal = 0;

  cases.forEach((caseItem, index) => {
    const caseResult = runStructuredCase(caseItem);
    const filename = safeCaseFilename(caseItem.id, index);
    const serialized = `${JSON.stringify(caseResult, null, 2)}\n`;
    writeFileSync(resolve(resolvedOutput, filename), serialized, "utf8");
    inputCharacters += caseResult.input.characters;
    outputCharacters += caseResult.output.characters;
    redactionTotal += caseResult.output.redactionTotal;
    residualWarningTotal += caseResult.output.residualWarnings.length;
    caseEntries.push({
      id: caseItem.id,
      file: filename,
      tags: caseResult.tags,
      inputCharacters: caseResult.input.characters,
      inputSha256: caseResult.input.sha256,
      outputCharacters: caseResult.output.characters,
      outputSha256: caseResult.output.sha256,
      redactionTotal: caseResult.output.redactionTotal,
      residualWarningTotal: caseResult.output.residualWarnings.length
    });
  });

  const manifest = {
    schema: STRUCTURED_RUN_SCHEMA,
    generatedAt: startedAt,
    runner: basename(RUNNER_PATH),
    input: { path: resolve(inputPath), sha256: sha256(readFileSync(inputPath, "utf8")) },
    requirements: { minimumCases: MIN_CASES, minimumCharactersPerCase: MIN_CASE_CHARACTERS },
    summary: {
      caseCount: cases.length,
      minimumInputCharacters: Math.min(...caseEntries.map((entry) => entry.inputCharacters)),
      inputCharacters,
      outputCharacters,
      redactionTotal,
      residualWarningTotal
    },
    cases: caseEntries
  };
  writeFileSync(resolve(resolvedOutput, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(RUNNER_PATH)) {
  const inputPath = process.argv[2];
  const outputDirectory = process.argv[3];
  if (!inputPath || !outputDirectory) {
    console.error("Usage: node scripts/run-structured-redaction-corpus.js <corpus.json> <output-directory>");
    process.exitCode = 2;
  } else {
    const manifest = await runStructuredCorpus(resolve(inputPath), resolve(outputDirectory));
    console.log(JSON.stringify(manifest.summary));
  }
}
