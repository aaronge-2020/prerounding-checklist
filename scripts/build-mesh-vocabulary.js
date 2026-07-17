/**
 * Download the official NLM MeSH descriptor release and build the compact
 * offline vocabulary consumed by the structured de-identification guard.
 *
 * The app never calls NLM at runtime. This is a maintainer-only refresh step:
 *
 *   npm.cmd run build:mesh-vocabulary
 *
 * The compressed source is cached outside the repository and only the compact
 * generated JSON is committed under data/.
 */

import { createHash } from "node:crypto";
import { createWriteStream, createReadStream, mkdirSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const OUTPUT_FILE = join(DATA_DIR, "clinical-guard-mesh-terms.json");
const CACHE_FILE = join(DATA_DIR, ".mesh-descriptors.xml.gz");
const MESH_BASE_URL = "https://nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh";

function download(url, outputPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).href, outputPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const hash = createHash("sha256");
      let bytes = 0;
      response.on("data", (chunk) => {
        hash.update(chunk);
        bytes += chunk.length;
      });
      pipeline(response, createWriteStream(outputPath))
        .then(() => resolve({ bytes, sha256: hash.digest("hex") }))
        .catch(reject);
    });
    request.setTimeout(300000, () => request.destroy(new Error(`Timed out downloading ${url}`)));
    request.on("error", reject);
  });
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function addTerm(raw, terms) {
  const cleaned = decodeXmlEntities(raw).replace(/\s+/g, " ").trim().toLowerCase();
  if (cleaned.length >= 2 && cleaned.length <= 120 && !/^\d+$/.test(cleaned)) {
    terms.add(cleaned);
  }
}

async function parseMeshXmlGzip(filePath) {
  const terms = new Set();
  const input = createReadStream(filePath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let stringCount = 0;

  for await (const line of lines) {
    for (const match of line.matchAll(/<String[^>]*>([^<]*)<\/String>/gi)) {
      addTerm(match[1], terms);
      stringCount += 1;
    }
  }

  console.log(`  Parsed ${stringCount.toLocaleString()} XML terms; ${terms.size.toLocaleString()} unique values`);
  return terms;
}

const NON_CLINICAL_PATTERNS = [
  /^[a-z]{1,2}$/,
  /^\d/,
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)$/,
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
  /^(?:year|years|month|months|day|days|week|weeks)$/,
  /^(?:male|female|man|men|woman|women|boy|girl|child|children|adult|adults|infant|infants)$/,
  /^(?:left|right|bilateral|unilateral)$/
];

function isLikelyClinical(term) {
  return !NON_CLINICAL_PATTERNS.some((pattern) => pattern.test(term));
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const currentYear = new Date().getUTCFullYear();
  let year = null;
  let url = null;
  let downloadInfo = null;

  for (const candidateYear of [currentYear, currentYear - 1]) {
    const candidateUrl = `${MESH_BASE_URL}/desc${candidateYear}.gz`;
    console.log(`Downloading NLM MeSH ${candidateYear}: ${candidateUrl}`);
    try {
      downloadInfo = await download(candidateUrl, CACHE_FILE);
      year = candidateYear;
      url = candidateUrl;
      break;
    } catch (error) {
      console.log(`  unavailable: ${error.message}`);
    }
  }

  if (!year || !downloadInfo) {
    throw new Error("Could not download a current or prior NLM MeSH descriptor release");
  }

  const rawTerms = await parseMeshXmlGzip(CACHE_FILE);
  const words = new Set();
  const phrases = new Set();
  for (const term of rawTerms) {
    if (!isLikelyClinical(term)) continue;
    const tokens = term.split(/\s+/);
    if (tokens.length === 1) {
      words.add(term);
    } else {
      phrases.add(term);
      for (const token of tokens) {
        if (token.length >= 2 && !/^\d+$/.test(token)) words.add(token);
      }
    }
  }

  const output = {
    _generated: new Date().toISOString(),
    _source: `NLM MeSH ${year} XML descriptors`,
    _source_url: url,
    _source_sha256: downloadInfo.sha256,
    _mesh_year: year,
    _format: "XML.gz",
    _total_raw_terms: rawTerms.size,
    _filtered_words: words.size,
    _filtered_phrases: phrases.size,
    words: [...words].sort(),
    phrases: [...phrases].sort()
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
  unlinkSync(CACHE_FILE);
  console.log(`Written ${OUTPUT_FILE}`);
  console.log(`  words: ${words.size.toLocaleString()}`);
  console.log(`  phrases: ${phrases.size.toLocaleString()}`);
  console.log(`  sha256: ${downloadInfo.sha256}`);
}

main().catch((error) => {
  console.error(`MeSH vocabulary build failed: ${error.message}`);
  try { unlinkSync(CACHE_FILE); } catch { /* cache may not exist */ }
  process.exitCode = 1;
});
