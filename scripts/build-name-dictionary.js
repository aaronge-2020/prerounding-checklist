/**
 * Builds src/vault/deid/name-dictionary.js — the person-name dictionaries used
 * by the de-identification name-recall layer (src/vault/deid/name-recall.js).
 *
 * Sources (downloaded to data/name-sources/ on first run, gitignored):
 *   - US Census Bureau 2010 surnames (162k surnames with frequency counts)
 *   - SSA top-1000 baby names per year 1880-2008 (hadley/data-baby-names mirror)
 *   - Two supplementary US given-name lists (smashew/NameDatabases, dominictarr/random-name)
 *   - Norvig english word frequency list (count_1w.txt) for ambiguity marking
 *   - data/clinical-guard-words.json + data/clinical-guard-mesh-terms.json for
 *     clinical-vocabulary collisions (names that are also medical terms)
 *
 * A name token is exported as AMBIGUOUS (usable only with strong context) when
 * it collides with common English, clinical vocabulary, or is very short.
 *
 * Run: node scripts/build-name-dictionary.js
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_DIR = join(ROOT, "data", "name-sources");
const OUT_FILE = join(ROOT, "src", "vault", "deid", "name-dictionary.js");

const SURNAME_MIN_CENSUS_COUNT = 500; // ~43k surnames, 91.6% of US population
const ENGLISH_AMBIGUITY_RANK = 60000; // english words ranked above this collide

const SOURCES = [
  {
    file: "Names_2010Census.csv",
    url: "https://www2.census.gov/topics/genealogy/2010surnames/names.zip",
    zipEntry: "Names_2010Census.csv"
  },
  {
    file: "baby-names.csv",
    url: "https://raw.githubusercontent.com/hadley/data-baby-names/master/baby-names.csv"
  },
  {
    file: "us-first.txt",
    url: "https://raw.githubusercontent.com/smashew/NameDatabases/master/NamesDatabases/first%20names/us.txt"
  },
  {
    file: "random-first.txt",
    url: "https://raw.githubusercontent.com/dominictarr/random-name/master/first-names.txt"
  },
  {
    file: "count_1w.txt",
    url: "https://norvig.com/ngrams/count_1w.txt"
  }
];

function download(source) {
  const target = join(SOURCE_DIR, source.file);
  if (existsSync(target) && statSync(target).size > 10000) {
    return;
  }
  console.log(`Downloading ${source.url} ...`);
  if (source.zipEntry) {
    const zipPath = join(SOURCE_DIR, "download.zip");
    execFileSync("curl", ["-sL", "--max-time", "300", "-o", zipPath, source.url], { stdio: "inherit" });
    execFileSync("unzip", ["-o", "-q", zipPath, source.zipEntry, "-d", SOURCE_DIR], { stdio: "inherit" });
  } else {
    execFileSync("curl", ["-sL", "--max-time", "300", "-o", target, source.url], { stdio: "inherit" });
  }
  if (!existsSync(target) || statSync(target).size < 10000) {
    throw new Error(`Download failed or truncated: ${source.file}`);
  }
}

mkdirSync(SOURCE_DIR, { recursive: true });
SOURCES.forEach(download);

function isCleanNameToken(value) {
  return /^[a-z][a-z'-]{1,23}$/.test(value);
}

// ── Surnames from Census 2010 ──
const surnames = new Set();
for (const line of readFileSync(join(SOURCE_DIR, "Names_2010Census.csv"), "utf8").split("\n").slice(1)) {
  const parts = line.split(",");
  if (parts.length < 3) continue;
  const name = parts[0].trim().toLowerCase();
  const count = Number(parts[2]);
  if (count >= SURNAME_MIN_CENSUS_COUNT && isCleanNameToken(name)) {
    surnames.add(name);
  }
}

// ── Given names from SSA mirror + supplementary lists ──
const givenNames = new Set();
for (const line of readFileSync(join(SOURCE_DIR, "baby-names.csv"), "utf8").split("\n").slice(1)) {
  const match = line.match(/^\d+,"([^"]+)",/);
  if (!match) continue;
  const name = match[1].toLowerCase();
  if (isCleanNameToken(name)) {
    givenNames.add(name);
  }
}
for (const file of ["us-first.txt", "random-first.txt"]) {
  for (const rawLine of readFileSync(join(SOURCE_DIR, file), "utf8").split(/\r?\n/)) {
    const name = rawLine.trim().toLowerCase();
    if (isCleanNameToken(name)) {
      givenNames.add(name);
    }
  }
}

// ── Ambiguity marking ──
const englishRank = new Map();
readFileSync(join(SOURCE_DIR, "count_1w.txt"), "utf8").split("\n").forEach((line, index) => {
  const word = line.split("\t")[0];
  if (word && !englishRank.has(word)) {
    englishRank.set(word, index + 1);
  }
});

function loadJsonWords(path, key) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed[key] || [];
  } catch {
    console.log(`  (skipping missing vocabulary file: ${path})`);
    return [];
  }
}

const clinicalWords = new Set([
  ...loadJsonWords(join(ROOT, "data", "clinical-guard-words.json"), "words"),
  ...loadJsonWords(join(ROOT, "data", "clinical-guard-mesh-terms.json"), "words")
].map((word) => String(word).toLowerCase()));

// Clinical eponyms and device/score/sign names that read like surnames but
// almost always mean equipment, exam findings, or procedures in a note.
const clinicalEponyms = [
  "allen", "apgar", "apley", "babinski", "baker", "barrett", "bartholin",
  "battle", "bell", "billroth", "bishop", "bouchard", "braden", "braxton",
  "broca", "brudzinski", "bruce", "buck", "chadwick", "chvostek", "colles",
  "coombs", "crohn", "cullen", "cushing", "dobhoff", "doppler", "down",
  "dupuytren", "epley", "ewing", "finkelstein", "foley", "fowler",
  "galeazzi", "glasgow", "graves", "grey", "guaiac", "hashimoto", "heberden",
  "hemovac", "hodgkin", "hoffman", "holter", "homan", "horner", "hunt",
  "huntington", "impella", "jackson", "kaposi", "kegel", "kerlix", "kernig",
  "kocher", "lachman", "lisfranc", "mallampati", "marcus", "mcburney",
  "mcmurray", "meckel", "monteggia", "morse", "murphy", "nissen", "osler",
  "paget", "parkinson", "penrose", "phalen", "pott", "purkinje", "ranson",
  "raynaud", "reynolds", "riedel", "rinne", "romberg", "roux", "rovsing",
  "salem", "schatzki", "sengstaken", "sjogren", "smith", "snellen",
  "spurling", "stemmer", "swan", "tanner", "tegaderm", "tinel", "trendelenburg",
  "trousseau", "virchow", "waddell", "warthin", "weber", "wells", "whipple",
  "wilson", "wolff", "wood", "yankauer", "zenker"
];

const dayAndMonthWords = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "jan", "feb", "mar", "apr",
  "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "monday", "tuesday",
  "wednesday", "thursday", "friday", "saturday", "sunday"
]);

function isAmbiguous(name) {
  if (name.length <= 3) return true;
  if (dayAndMonthWords.has(name)) return true;
  if (clinicalWords.has(name)) return true;
  const rank = englishRank.get(name);
  return Boolean(rank && rank <= ENGLISH_AMBIGUITY_RANK);
}

const ambiguous = new Set(clinicalEponyms);
const allNames = new Set([...givenNames, ...surnames]);
for (const name of allNames) {
  if (isAmbiguous(name)) {
    ambiguous.add(name);
  }
}

const sortedGiven = [...givenNames].sort();
const sortedSurnames = [...surnames].sort();
const sortedAmbiguous = [...ambiguous].filter((name) => allNames.has(name) || clinicalEponyms.includes(name)).sort();

const banner = [
  "// Auto-generated by scripts/build-name-dictionary.js — DO NOT EDIT MANUALLY.",
  "// Person-name dictionaries for the de-identification name-recall layer.",
  `// Generated ${new Date().toISOString()}`,
  `// givenNames: ${sortedGiven.length}, surnames: ${sortedSurnames.length}, ambiguous: ${sortedAmbiguous.length}`,
  ""
].join("\n");

const body = [
  `const GIVEN = ${JSON.stringify(sortedGiven.join("|"))};`,
  `const SURNAMES = ${JSON.stringify(sortedSurnames.join("|"))};`,
  `const AMBIGUOUS = ${JSON.stringify(sortedAmbiguous.join("|"))};`,
  "",
  "export const givenNames = new Set(GIVEN.split(\"|\"));",
  "export const surnames = new Set(SURNAMES.split(\"|\"));",
  "// Name tokens that double as English words, clinical vocabulary, or clinical",
  "// eponyms (Foley, Glasgow, Whipple, ...). Only usable with strong name context.",
  "export const ambiguousNameTokens = new Set(AMBIGUOUS.split(\"|\"));",
  ""
].join("\n");

writeFileSync(OUT_FILE, banner + body, "utf8");
const sizeKb = Math.round(statSync(OUT_FILE).size / 1024);
console.log(`Wrote ${OUT_FILE}`);
console.log(`  givenNames: ${sortedGiven.length.toLocaleString()}`);
console.log(`  surnames:   ${sortedSurnames.length.toLocaleString()}`);
console.log(`  ambiguous:  ${sortedAmbiguous.length.toLocaleString()}`);
console.log(`  size:       ${sizeKb} KB`);
