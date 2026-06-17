/**
 * Downloads MeSH (Medical Subject Headings) terminology from NLM and
 * extracts all descriptor names and entry terms for clinical guard use.
 *
 * Sources (free/open, no auth required):
 *   - ASCII (archived through 2025): disease names, anatomical terms,
 *     procedures, chemicals, organisms, etc.
 *   - XML fallback if ASCII not available
 *
 * Run: node scripts/build-mesh-vocabulary.js
 * Output: data/clinical-guard-mesh-terms.json
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

const CACHE_FILE = join(DATA_DIR, "clinical-guard-mesh-terms.json");

// ---------------------------------------------------------------------------
// Download utility
// ---------------------------------------------------------------------------

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const bufs = [];
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;
      res.on("data", (chunk) => {
        bufs.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        downloaded += chunk.length;
        if (total > 0 && downloaded % (50 * 1024 * 1024) < (chunk.length || 65536)) {
          console.log(`  ${((downloaded / total) * 100).toFixed(1)}% (${(downloaded / (1024 * 1024)).toFixed(0)} MB)`);
        }
      });
      res.on("end", () => {
        console.log(`  Download complete: ${(downloaded / (1024 * 1024)).toFixed(1)} MB`);
        resolve(Buffer.concat(bufs).toString("utf-8"));
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// ASCII format parser (MeSH .bin files)
// ---------------------------------------------------------------------------

function parseMeshAscii(text) {
  const terms = new Set();
  const records = text.split("*NEWRECORD");
  console.log(`  Parsing ${records.length.toLocaleString()} ASCII records...`);

  for (const record of records) {
    const lines = record.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("MH = ")) {
        addTerm(trimmed.slice(5).trim(), terms);
      }
      if (trimmed.startsWith("ENTRY = ")) {
        const raw = trimmed.slice(8).trim();
        addTerm(raw.split("|")[0].trim(), terms);
      }
    }
  }
  return terms;
}

// ---------------------------------------------------------------------------
// XML format parser (simple line-by-line regex for <String> elements)
// ---------------------------------------------------------------------------

function parseMeshXml(text) {
  const terms = new Set();
  const re = /<String[^>]*>([^<]*)<\/String>/gi;
  let match;
  let count = 0;
  while ((match = re.exec(text)) !== null) {
    const term = match[1].trim();
    addTerm(term, terms);
    count++;
    if (count % 100000 === 0) {
      console.log(`  Parsed ${count.toLocaleString()} XML strings...`);
    }
  }
  console.log(`  Parsed ${count.toLocaleString()} XML strings total`);
  return terms;
}

// ---------------------------------------------------------------------------
// Term helpers
// ---------------------------------------------------------------------------

function addTerm(raw, terms) {
  const cleaned = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (cleaned.length >= 2 && cleaned.length <= 120 && !/^\d+$/.test(cleaned)) {
    terms.add(cleaned);
  }
}

// ---------------------------------------------------------------------------
// Filter: keep only likely clinical terms
// ---------------------------------------------------------------------------

const NON_CLINICAL_PATTERNS = [
  /^[a-z]{1,2}$/,
  /^\d/,
  /^(january|february|march|april|may|june|july|august|september|october|november|december)$/,
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
  /^(year|years|month|months|day|days|week|weeks)$/,
  /^(male|female|man|men|woman|women|boy|girl|child|children|adult|adults|infant|infants)$/,
  /^(united states|china|japan|india|korea|france|germany|italy|spain|canada|brazil|australia|mexico|russia)$/,
  /^(left|right|bilateral|unilateral)$/,
];

function isLikelyClinical(term) {
  for (const pattern of NON_CLINICAL_PATTERNS) {
    if (pattern.test(term)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function asciiUrl(year) {
  return `https://nlmpubs.nlm.nih.gov/projects/mesh/${year}/asciimesh/d${year}.bin`;
}

function xmlUrl(year) {
  // XML descriptor file is served as raw XML (may also work as .gz variant)
  return `https://nlmpubs.nlm.nih.gov/projects/mesh/${year}/xmlmesh/desc${year}.xml`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date();
  const currentYear = now.getFullYear();

  // ASCII was discontinued Jan 2026; try 2025 archive, then XML
  const asciiYears = [2025, 2024, 2023];
  const xmlYears = [currentYear, currentYear - 1, currentYear - 2];

  let meshText = null;
  let meshYear = null;
  let meshFormat = null;

  // ---- Try ASCII first (simpler to parse, last year 2025) ----
  for (const year of asciiYears) {
    const url = asciiUrl(year);
    console.log(`Trying MeSH ${year} ASCII: ${url}`);
    try {
      meshText = await fetchUrl(url);
      meshYear = year;
      meshFormat = "ASCII";
      console.log(`  OK: ${(meshText.length / (1024 * 1024)).toFixed(1)} MB`);
      break;
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }

  // ---- Fall back to XML ----
  if (!meshText) {
    for (const year of xmlYears) {
      const url = xmlUrl(year);
      console.log(`Trying MeSH ${year} XML: ${url}`);
      try {
        meshText = await fetchUrl(url);
        meshYear = year;
        meshFormat = "XML";
        console.log(`  OK: ${(meshText.length / (1024 * 1024)).toFixed(1)} MB`);
        break;
      } catch (e) {
        console.log(`  Failed: ${e.message}`);
      }
    }
  }

  if (!meshText) {
    console.log("\nNo MeSH data available. Writing empty placeholder.");
    writeFileSync(CACHE_FILE, JSON.stringify({
      _generated: now.toISOString(),
      _source: "NLM MeSH (unavailable during build)",
      _mesh_year: null,
      _total_raw_terms: 0,
      words: [],
      phrases: [],
    }, null, 2));
    return;
  }

  // ---- Parse ----
  console.log(`\nParsing MeSH ${meshYear} ${meshFormat} terms...`);
  const rawTerms = meshFormat === "ASCII"
    ? parseMeshAscii(meshText)
    : parseMeshXml(meshText);

  console.log(`  Raw terms extracted: ${rawTerms.size.toLocaleString()}`);

  // ---- Split into words and phrases ----
  const wordSet = new Set();
  const phraseSet = new Set();

  for (const term of rawTerms) {
    if (!isLikelyClinical(term)) continue;
    const tokens = term.split(/\s+/);
    if (tokens.length === 1) {
      wordSet.add(term);
    } else {
      phraseSet.add(term);
      for (const token of tokens) {
        if (token.length >= 2 && !/^\d+$/.test(token)) {
          wordSet.add(token);
        }
      }
    }
  }

  const output = {
    _generated: now.toISOString(),
    _source: `NLM MeSH ${meshYear} ${meshFormat} descriptors`,
    _mesh_year: meshYear,
    _format: meshFormat,
    _total_raw_terms: rawTerms.size,
    _filtered_words: wordSet.size,
    _filtered_phrases: phraseSet.size,
    words: [...wordSet].sort(),
    phrases: [...phraseSet].sort(),
  };

  writeFileSync(CACHE_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWritten ${CACHE_FILE}:`);
  console.log(`  Words:   ${wordSet.size.toLocaleString()}`);
  console.log(`  Phrases: ${phraseSet.size.toLocaleString()}`);
  console.log(`\nRun: node scripts/build-clinical-guard-vocabulary.js`);
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
