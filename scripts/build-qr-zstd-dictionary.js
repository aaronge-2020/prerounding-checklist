import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { complaintModules, evaluateComplaintCds } from "../complaint-cds.js";
import { buildLocalChecklistFromWorkup, checklistItemOptions, checklistPrompt, groupChecklistSectionsByOrganSystem, newAdmissionChecklistPrompt, parseChecklist } from "../checklist.js";
import { openEvidenceTasks } from "../open-evidence-workflows.js";
import { clinicalIntentRegistry } from "../clinical-intents.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const trainingDir = join(root, "tmp", "qr-zstd-training");
const vendorDir = join(root, "vendor");
const dictionaryPath = join(vendorDir, "qr-zstd-dictionary.bin");
const metadataPath = join(vendorDir, "qr-zstd-dictionary.js");
const medicalKnowledgeManifestPath = join(root, "medical-knowledge", "manifest.json");
const maxDictionaryBytes = 16 * 1024;
export const QR_ZSTD_COMPRESSION_LEVEL = 10;

export function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        const nextValue = value[key];
        if (nextValue !== undefined) accumulator[key] = stableJsonValue(nextValue);
        return accumulator;
      }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value ?? null;
}

export function stableJsonStringify(value) {
  return JSON.stringify(stableJsonValue(value));
}

export function fnv64Bytes(bytes) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function fnv64String(value = "") {
  return fnv64Bytes(new TextEncoder().encode(String(value || "")));
}

export function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function dictionaryId(bytes) {
  const magic = bytes.length >= 8
    ? bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)
    : 0;
  if ((magic >>> 0) !== 0xec30a437) return 0;
  return (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
}

function itemKind(section = {}, item = {}) {
  return item.category || item.kind || section.category || (String(item.label || item.text || "").trim().endsWith("?") ? "bedside" : "exam");
}

function normalizeOptions(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split("/");
  return raw
    .map((option) => (typeof option === "string" ? option : option?.label || option?.value || option?.text || ""))
    .map((option) => String(option || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function manifestForSections(sections = [], workupModuleId = "") {
  return {
    schema: "phone-checklist-manifest-v1",
    workupModuleId,
    sections: sections
      .map((section, sectionIndex) => ({
        id: String(section.id || `section_${sectionIndex + 1}`),
        title: section.title || `Checklist section ${sectionIndex + 1}`,
        shortTitle: section.shortTitle || section.title || `Section ${sectionIndex + 1}`,
        category: section.category || "",
        organSystemKey: section.organSystemKey || "",
        items: (section.items || []).map((item, itemIndex) => {
          const label = item.label || item.text || `Checklist item ${itemIndex + 1}`;
          const options = normalizeOptions(checklistItemOptions(item, itemKind(section, item), label));
          return {
            id: String(item.id || `item_${itemIndex + 1}`),
            label,
            text: label,
            category: itemKind(section, item),
            kind: itemKind(section, item),
            options,
            rawValue: options.join(" / "),
            hasNotes: Boolean(item.hasNotes)
          };
        })
      }))
      .filter((section) => section.items.length)
  };
}

export function defaultChecklistForModule(module = {}) {
  const complaintResult = {
    ...module,
    module,
    inputText: module.label || module.id || "",
    selectedModuleId: module.id || ""
  };
  return buildLocalChecklistFromWorkup(
    { complaintResult, recommendation: module },
    { allowGenericFallbacks: true, maxBedsideQuestions: 18, maxExamItems: 15, includeSafetyInExamChecklist: true }
  );
}

function normalizedRelativePath(filePath = "") {
  return relative(root, filePath).replace(/\\/g, "/");
}

function moduleIdFromKnowledgeFile(parsed = {}) {
  const module = parsed.module || parsed;
  return String(
    module.id
    || module.workup_id
    || module.workupId
    || module.metadata?.workupId
    || ""
  ).trim();
}

function compactLibrarySourceSample(source = {}) {
  return stableJsonStringify({
    schema: "qr-zstd-workup-library-source-v1",
    path: source.relativePath,
    moduleId: source.moduleId,
    module: source.parsed?.module || source.parsed
  });
}

function distilledWorkupText(value) {
  const fragments = [];
  const preferredKeys = new Set([
    "id",
    "label",
    "title",
    "name",
    "text",
    "question",
    "prompt",
    "options",
    "suggested_checklist_label",
    "when_to_ask",
    "when_to_perform",
    "management_implication",
    "management_change",
    "diagnostic_purpose",
    "diagnostic_target",
    "rationale",
    "triggers",
    "keywords",
    "source_section"
  ]);
  const visit = (entry, key = "") => {
    if (entry === null || entry === undefined) return;
    if (typeof entry === "string") {
      const normalized = entry.replace(/\s+/g, " ").trim();
      if (normalized && (!key || preferredKeys.has(key))) fragments.push(normalized);
      return;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      if (preferredKeys.has(key)) fragments.push(String(entry));
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item, key));
      return;
    }
    if (typeof entry === "object") {
      Object.entries(entry).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  };
  visit(value);
  return fragments.join("\n");
}

async function loadWorkupLibrarySources() {
  const manifestRaw = await readFile(medicalKnowledgeManifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const modulePaths = Array.isArray(manifest.complaint_modules) ? manifest.complaint_modules : [];
  if (!modulePaths.length) {
    throw new Error("medical-knowledge/manifest.json does not list any complaint_modules for QR dictionary training.");
  }

  const sources = [];
  for (const modulePath of modulePaths) {
    const absolutePath = resolve(root, modulePath);
    const raw = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(raw);
    const moduleId = moduleIdFromKnowledgeFile(parsed);
    if (!moduleId) {
      throw new Error(`Unable to find module id in ${modulePath}`);
    }
    const canonical = stableJsonStringify(parsed);
    sources.push({
      relativePath: normalizedRelativePath(absolutePath),
      moduleId,
      raw,
      parsed,
      canonical,
      byteLength: Buffer.byteLength(raw, "utf8"),
      hash: fnv64String(canonical)
    });
  }

  sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const installedIds = new Set(complaintModules.map((module) => module.id).filter(Boolean));
  const sourceIds = new Set(sources.map((source) => source.moduleId));
  const missingFromSources = [...installedIds].filter((id) => !sourceIds.has(id));
  const missingFromInstalledBundle = [...sourceIds].filter((id) => !installedIds.has(id));
  if (missingFromSources.length || missingFromInstalledBundle.length) {
    throw new Error(`QR dictionary training library mismatch. Missing from source: ${missingFromSources.join(", ") || "none"}. Missing from installed bundle: ${missingFromInstalledBundle.join(", ") || "none"}. Run npm run build:medical-knowledge first.`);
  }

  const sourceHash = fnv64String(stableJsonStringify({
    schema: "qr-zstd-workup-source-index-v1",
    files: sources.map((source) => ({
      path: source.relativePath,
      moduleId: source.moduleId,
      hash: source.hash,
      byteLength: source.byteLength
    }))
  }));
  return { manifest, sources, sourceHash };
}

export function concatBytes(parts = []) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function cborHeader(major, value) {
  const head = major << 5;
  if (value < 24) return Uint8Array.of(head | value);
  if (value <= 0xff) return Uint8Array.of(head | 24, value);
  if (value <= 0xffff) return Uint8Array.of(head | 25, value >> 8, value & 0xff);
  if (value <= 0xffffffff) return Uint8Array.of(head | 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  throw new Error("Compact QR payload contains an unsupported integer.");
}

export function cborEncode(value) {
  if (value === null || value === undefined) return Uint8Array.of(0xf6);
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (value instanceof Uint8Array) return concatBytes([cborHeader(2, value.length), value]);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("Compact QR payload contains a non-integer number.");
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concatBytes([cborHeader(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return concatBytes([cborHeader(4, value.length), ...value.map((entry) => cborEncode(entry))]);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return concatBytes([
      cborHeader(5, entries.length),
      ...entries.flatMap(([key, entry]) => [cborEncode(key), cborEncode(entry)])
    ]);
  }
  throw new Error("Compact QR payload contains an unsupported value.");
}

const BASE42_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*-./:";

export function baseQrEncodeBytes(bytes = new Uint8Array()) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index] * 256 + bytes[index + 1];
      const first = value % 42;
      value = Math.floor(value / 42);
      const second = value % 42;
      const third = Math.floor(value / 42);
      output += BASE42_ALPHABET[first] + BASE42_ALPHABET[second] + BASE42_ALPHABET[third];
    } else {
      const value = bytes[index];
      output += BASE42_ALPHABET[value % 42] + BASE42_ALPHABET[Math.floor(value / 42)];
    }
  }
  return output;
}

function representativeEditedPatch(manifest = {}) {
  const firstSection = manifest.sections?.[0];
  const firstItem = firstSection?.items?.[0];
  const operations = [];
  if (firstItem) {
    operations.push(["ui", firstSection.id, firstItem.id, [
      firstItem.label,
      firstItem.category || firstItem.kind || "",
      firstItem.options || [],
      "single",
      firstItem.hasNotes ? 1 : 0,
      "patient-specific severity check",
      firstItem.id
    ]]);
  }
  operations.push(["ai", firstSection?.id || "section_1", 0, [
    "quick-note-prompt",
    "Any important patient-specific update not captured above?",
    "bedside",
    ["No new update", "New update", "Unsure", "Other ___"],
    "single",
    1,
    "patient-specific add-on",
    ""
  ]]);
  return operations;
}

export function compactWorkupPayloadForManifest(manifest = {}, registryHash = "", dictionaryHash = "", options = {}) {
  const manifestSource = stableJsonStringify(manifest);
  const manifestHash = fnv64String(manifestSource);
  return {
    v: "phoneQr4",
    c: options.code || "",
    w: manifest.workupModuleId || "",
    cw: manifest.workupModuleId || "",
    r: manifestHash,
    g: registryHash,
    d: dictionaryHash,
    m: options.manifestHash || manifestHash,
    p: options.includeRepresentativePatch ? representativeEditedPatch(manifest) : []
  };
}

export function compactReturnPayloadForManifest(manifest = {}, dictionaryHash = "", options = {}) {
  const flatItems = (manifest.sections || []).flatMap((section) => section.items || []);
  const manifestHash = options.manifestHash || fnv64String(stableJsonStringify(manifest));
  const bitsetBytes = new Uint8Array(Math.ceil(flatItems.length / 8));
  const answerValues = [];
  const notes = [];
  flatItems.forEach((item, index) => {
    bitsetBytes[Math.floor(index / 8)] |= 1 << (index % 8);
    answerValues.push((item.options || []).length ? 0 : "Checked");
    if (options.includeNotes !== false && index % 7 === 0) notes.push([index, `Focused note for ${item.label || item.text || "item"}`]);
  });
  return {
    v: "phoneReturnQr6",
    c: options.code || "",
    m: manifestHash,
    d: dictionaryHash,
    q: flatItems.length,
    r: bitsetBytes,
    av: answerValues,
    n: notes
  };
}

export async function buildQrZstdTrainingCorpus() {
  const library = await loadWorkupLibrarySources();
  const samples = [
    checklistPrompt,
    newAdmissionChecklistPrompt,
    stableJsonStringify({
      schema: "qr-local-zstd-registry-v1",
      commonPayloadKeys: ["v", "w", "cw", "r", "g", "d", "m", "p", "q", "av", "n"],
      manifestOps: ["rs", "as", "us", "ri", "ai", "ui", "oi", "os"],
      answerModes: ["single", "multi", "endorsement"],
      commonOptions: ["Normal", "Abnormal", "Present", "Absent", "Not assessed", "Unable to assess", "Other ___"]
    }),
    stableJsonStringify({
      schema: "qr-zstd-training-source-index-v1",
      sourceHash: library.sourceHash,
      files: library.sources.map((source) => ({
        path: source.relativePath,
        moduleId: source.moduleId,
        hash: source.hash,
        byteLength: source.byteLength
      }))
    }),
    stableJsonStringify(openEvidenceTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      template: task.template || task.prompt || ""
    })))
  ];

  for (const source of library.sources) {
    samples.push(source.raw);
    samples.push(compactLibrarySourceSample(source));
    samples.push(distilledWorkupText(source.parsed?.module || source.parsed));
  }

  const manifests = [];

  for (const module of complaintModules) {
    const checklist = defaultChecklistForModule(module);
    if (!checklist) continue;
    const parsedSections = parseChecklist(checklist);
    let sections = parsedSections;
    try {
      sections = groupChecklistSectionsByOrganSystem(parsedSections, { throwOnError: true });
    } catch {
      sections = parsedSections;
    }
    const manifest = manifestForSections(sections, module.id || "");
    manifests.push(manifest);
    samples.push([
      module.id,
      module.label,
      (module.triggers || []).join(" "),
      checklist
    ].filter(Boolean).join("\n"));
    samples.push(stableJsonStringify(manifest));
    samples.push(stableJsonStringify(compactWorkupPayloadForManifest(manifest)));
    samples.push(stableJsonStringify(compactWorkupPayloadForManifest(manifest, "", "", { includeRepresentativePatch: true })));
    samples.push(stableJsonStringify(compactReturnPayloadForManifest(manifest)));
  }

  const validatedIntents = clinicalIntentRegistry.filter((intent) => intent.status === "validated");
  for (const intent of validatedIntents) {
    if (!intent.complaint_module_id) continue;
    const module = complaintModules.find((m) => m.id === intent.complaint_module_id);
    if (!module) continue;
    try {
      const complaintResult = evaluateComplaintCds(
        intent.label,
        {},
        {
          module,
          modules: [module],
          validatedIntents: [intent],
          setting: "General medicine",
          population: intent.intent_id.includes("pediatric") ? "Pediatric" : "Adult"
        }
      );
      const checklist = buildLocalChecklistFromWorkup(
        { complaintResult, recommendation: complaintResult?.recommendation || module, selectedIntents: [intent] },
        { allowGenericFallbacks: true, maxBedsideQuestions: 18, maxExamItems: 15, includeSafetyInExamChecklist: true }
      );
      if (!checklist) continue;
      const parsedSections = parseChecklist(checklist);
      let sections = parsedSections;
      try {
        sections = groupChecklistSectionsByOrganSystem(parsedSections, { throwOnError: true });
      } catch {
        sections = parsedSections;
      }
      const manifest = manifestForSections(sections, module.id || "");
      samples.push([
        intent.intent_id,
        intent.label,
        (intent.aliases || []).join(" "),
        checklist
      ].filter(Boolean).join("\n"));
      samples.push(stableJsonStringify(manifest));
      samples.push(stableJsonStringify(compactWorkupPayloadForManifest(manifest)));
      samples.push(stableJsonStringify(compactWorkupPayloadForManifest(manifest, "", "", { includeRepresentativePatch: true })));
      samples.push(stableJsonStringify(compactReturnPayloadForManifest(manifest)));
    } catch (error) {
      console.warn(`Warning: Failed to generate checklist for intent ${intent.intent_id}:`, error?.message || error);
    }
  }

  const registrySource = stableJsonStringify({
    schema: "qr-default-workup-registry-v1",
    modules: manifests.map((manifest) => ({
      workupModuleId: manifest.workupModuleId,
      hash: fnv64String(stableJsonStringify(manifest)),
      sectionCount: manifest.sections.length,
      itemCount: manifest.sections.reduce((sum, section) => sum + section.items.length, 0)
    }))
  });
  const registryHash = fnv64String(registrySource);
  samples.push(registrySource);

  const corpusHash = fnv64String(stableJsonStringify({
    schema: "qr-zstd-training-corpus-v1",
    sourceHash: library.sourceHash,
    registryHash,
    samples: samples.map((sample) => ({
      hash: fnv64String(String(sample || "")),
      byteLength: Buffer.byteLength(String(sample || ""), "utf8")
    }))
  }));

  return {
    samples,
    manifests,
    registryHash,
    corpusHash,
    sourceHash: library.sourceHash,
    sourceFiles: library.sources
  };
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        rejectRun(new Error(`${command} exited with ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function main() {
  await rm(trainingDir, { recursive: true, force: true });
  await mkdir(trainingDir, { recursive: true });
  await mkdir(vendorDir, { recursive: true });

  const { samples, manifests, registryHash, corpusHash, sourceHash, sourceFiles } = await buildQrZstdTrainingCorpus();

  const samplePaths = [];
  for (const [index, sample] of samples.entries()) {
    const samplePath = join(trainingDir, `sample-${String(index + 1).padStart(4, "0")}.txt`);
    await writeFile(samplePath, String(sample || "").trim() || "empty sample", "utf8");
    samplePaths.push(samplePath);
  }

  const sampleListPath = join(trainingDir, "samples.txt");
  await writeFile(sampleListPath, samplePaths.join("\n"), "utf8");
  await run("zstd", ["--train", "--filelist", sampleListPath, "-o", dictionaryPath, `--maxdict=${maxDictionaryBytes}`, "--force"]);
  const dictionary = await readFile(dictionaryPath);
  const dictionaryHash = fnv64Bytes(dictionary);
  const id = dictionaryId(dictionary);
  const metadata = `// Generated by scripts/build-qr-zstd-dictionary.js. Do not edit by hand.
export const QR_ZSTD_DICTIONARY_BASE64 = "${base64Url(dictionary)}";
export const QR_ZSTD_DICTIONARY_HASH = "${dictionaryHash}";
export const QR_ZSTD_DICTIONARY_ID = ${id};
export const QR_ZSTD_DICTIONARY_BYTES = ${dictionary.length};
export const QR_DEFAULT_REGISTRY_HASH = "${registryHash}";
export const QR_DEFAULT_REGISTRY_MODULE_COUNT = ${manifests.length};
export const QR_ZSTD_TRAINING_CORPUS_HASH = "${corpusHash}";
export const QR_ZSTD_TRAINING_SOURCE_HASH = "${sourceHash}";
export const QR_ZSTD_TRAINING_SOURCE_FILE_COUNT = ${sourceFiles.length};
export const QR_ZSTD_TRAINING_SAMPLE_COUNT = ${samples.length};
export const QR_ZSTD_TRAINING_SOURCE_PATHS = ${JSON.stringify(sourceFiles.map((source) => source.relativePath))};
`;
  await writeFile(metadataPath, metadata, "utf8");
  console.log(`QR zstd dictionary written: ${dictionary.length} bytes, hash ${dictionaryHash}, registry ${registryHash}`);
  console.log(`QR zstd dictionary trained on ${sourceFiles.length} source workup files, ${manifests.length} installed manifests, ${samples.length} samples, corpus ${corpusHash}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
