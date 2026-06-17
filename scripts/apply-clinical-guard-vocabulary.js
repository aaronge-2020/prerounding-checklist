/**
 * Merges vocabulary files (built by build-clinical-guard-vocabulary.js)
 * into a single ES module export that deid.js statically imports.
 *
 * Run:  node scripts/apply-clinical-guard-vocabulary.js
 *       node scripts/apply-clinical-guard-vocabulary.js --install  (also adds import to deid.js)
 *
 * Output: data/clinical-guard-export.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const DEID_FILE = join(ROOT, "deid.js");

// ---------------------------------------------------------------------------
// Load source data files
// ---------------------------------------------------------------------------

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    console.log(`  (file not found: ${path})`);
    return null;
  }
}

const mesh = loadJson(join(DATA_DIR, "clinical-guard-mesh-terms.json"));
const phrases = loadJson(join(DATA_DIR, "clinical-guard-phrases.json"));
const allWords = loadJson(join(DATA_DIR, "clinical-guard-words.json"));
const anchors = loadJson(join(DATA_DIR, "clinical-guard-anchors.json"));

// ---------------------------------------------------------------------------
// Name/surname filter — must never be clinical guard words
// ---------------------------------------------------------------------------

const bannedAnchorWords = new Set([
  // Common first names (matching deid.js commonFirstNames)
  "aaron", "adam", "alan", "albert", "alex", "alexander", "alexandra", "alice",
  "alicia", "allison", "amanda", "amber", "amy", "andrea", "andrew", "angela",
  "ann", "anna", "anne", "anthony", "antonio", "arthur", "ashley", "austin",
  "barbara", "benjamin", "betty", "beverly", "bill", "billy", "bobby", "bonnie",
  "brandon", "brenda", "brian", "brittany", "bruce", "bryan", "caleb", "carl",
  "carla", "carlos", "carol", "carolyn", "carrie", "catherine", "charles",
  "charlotte", "cheryl", "chris", "christina", "christine", "christopher",
  "cindy", "clara", "clarence", "connie", "craig", "crystal", "curtis", "cynthia",
  "dale", "dan", "daniel", "danielle", "david", "dawn", "deborah", "debra",
  "denise", "dennis", "diana", "diane", "donald", "donna", "doris", "dorothy",
  "douglas", "dylan", "earl", "edith", "edna", "edward", "elaine", "elizabeth",
  "ellen", "emily", "emma", "eric", "erica", "erin", "ernest", "ethan", "eugene",
  "evelyn", "florence", "frances", "frank", "fred", "gabriel", "gary", "george",
  "gerald", "gloria", "grace", "gregory", "hannah", "harold", "harry", "heather",
  "helen", "henry", "howard", "irene", "isabella", "jack", "jacob", "jacqueline",
  "james", "jamie", "jane", "janet", "janice", "jason", "jean", "jeffrey",
  "jennifer", "jeremy", "jerry", "jesse", "jessica", "jill", "jimmy", "joan",
  "joe", "john", "johnny", "jonathan", "jordan", "jose", "joseph", "joshua",
  "joyce", "juan", "judith", "judy", "julia", "julie", "justin", "karen",
  "katherine", "kathleen", "kathryn", "kathy", "kayla", "keith", "kelly",
  "kenneth", "kevin", "kim", "kimberly", "kyle", "larry", "laura", "lauren",
  "lawrence", "lee", "leslie", "lillian", "linda", "lisa", "logan", "lori",
  "louis", "louise", "lucas", "lynn", "madison", "margaret", "maria", "marie",
  "marilyn", "marjorie", "mark", "martha", "martin", "mary", "mason", "matthew",
  "megan", "melissa", "michael", "michelle", "mike", "mildred", "nancy", "natalie",
  "nathan", "nicholas", "nicole", "noah", "norma", "norman", "olivia", "pamela",
  "patricia", "patrick", "paul", "paula", "peter", "philip", "phillip", "phyllis",
  "rachel", "ralph", "randy", "raymond", "rebecca", "richard", "rita", "robert",
  "robin", "rodney", "roger", "ronald", "rose", "roy", "ruby", "russell", "ruth",
  "ryan", "samantha", "samuel", "sandra", "sara", "sarah", "scott", "sean",
  "shannon", "sharon", "shawn", "shirley", "sophia", "stacy", "stephanie",
  "stephen", "steve", "steven", "sue", "susan", "tammy", "taylor", "teresa",
  "terry", "theresa", "thomas", "tiffany", "timothy", "tina", "todd", "tom",
  "tony", "travis", "tyler", "victor", "victoria", "vincent", "virginia",
  "walter", "wanda", "wayne", "wendy", "william", "willie", "zachary",
  // Common English surnames overlapping MeSH eponymous diseases
  "smith", "jones", "williams", "brown", "davis", "miller", "wilson",
  "moore", "taylor", "anderson", "thomas", "jackson", "white", "harris",
  "martin", "thompson", "garcia", "martinez", "robinson", "clark",
  "rodriguez", "lewis", "lee", "walker", "hall", "allen", "young",
  "hernandez", "king", "wright", "lopez", "hill", "scott", "green",
  "adams", "baker", "gonzalez", "nelson", "carter", "mitchell", "perez",
  "roberts", "turner", "phillips", "campbell", "parker", "evans",
  "edwards", "collins", "stewart", "sanchez", "morris", "rogers",
  "reed", "cook", "morgan", "bell", "murphy", "bailey", "rivera",
  "cooper", "richardson", "cox", "howard", "ward", "torres", "peterson",
  "gray", "ramirez", "james", "watson", "brooks", "kelly", "sanders",
  "price", "bennett", "wood", "barnes", "ross", "henderson", "coleman",
  "jenkins", "perry", "powell", "long", "patterson", "hughes", "flores",
  "washington", "butler", "simmons", "foster", "gonzales", "bryant",
  "alexander", "russell", "griffin", "diaz", "hayes",
]);

// ---------------------------------------------------------------------------
// Non-clinical English words that contaminate MeSH/RxNorm decomposition
// ---------------------------------------------------------------------------

const NON_CLINICAL_ENGLISH_WORDS = new Set([
  // Directions
  "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest",
  "central", "eastern", "western", "northern", "southern",
  // Geography
  "valley", "river", "lake", "ocean", "island", "coast", "forest", "desert",
  "mountain", "hill", "canyon", "ridge", "peak", "bay", "cape", "harbor", "port",
  "plain", "field", "meadow", "creek", "springs", "falls", "shore",
  // Settlement
  "city", "town", "county", "village", "district", "borough", "province",
  "park", "garden", "square", "plaza", "circle", "heights", "woods",
  "view", "glen", "hollow", "brook", "gate", "crossing", "landing",
  // Colors
  "green", "white", "black", "brown", "blue", "red", "silver", "golden",
  "yellow", "orange", "purple", "pink", "gray", "grey", "navy", "rose",
  // Trees/plants
  "cedar", "pine", "oak", "elm", "maple", "birch", "willow", "cypress",
  "spruce", "fir", "ash", "beech", "poplar", "hickory", "walnut", "cherry",
  "magnolia", "laurel", "ivy", "juniper", "lily", "daisy", "violet",
  "iris", "lotus", "sage", "basil", "mint", "clover", "fern", "moss",
  // Business/service
  "care", "health", "healthcare", "wellness", "family", "community",
  "memorial", "regional", "general", "university", "national",
  "hospital", "clinic", "medical", "pharmacy", "drug", "surgical",
  "dental", "vision", "hearing", "therapy", "rehabilitation", "rehab",
  "home", "senior", "living", "assisted", "nursing", "hospice",
  "urgent", "emergency", "immediate", "primary", "specialty",
  // Time/weather
  "spring", "summer", "autumn", "winter", "sunny", "storm", "breeze",
  // Common adjectives
  "new", "old", "big", "small", "grand", "great", "little", "best",
  "first", "high", "low", "upper", "lower", "middle",
  "premier", "prime", "superior", "advanced", "modern",
  "rapid", "quick", "fast", "express", "prompt", "swift",
  "complete", "total", "full", "whole", "entire",
]);

// ---------------------------------------------------------------------------
// Clinical anchor suffixes
// ---------------------------------------------------------------------------

const CLINICAL_ANCHOR_SUFFIXES = [
  "itis", "osis", "emia", "oma", "pathy", "ectomy", "otomy", "ostomy",
  "scopy", "plasty", "rrhaphy", "rrhagia", "rrhea", "gram", "graphy",
  "metry", "ology", "ologist", "iatry", "iatric", "penia",
  "cytosis", "megaly", "sclerosis", "malacia", "ptosis", "plasia",
  "trophy", "stasis", "lysis", "poiesis", "philia", "phobia",
  "stomy", "desis", "pexy", "tripsy", "centesis",
  "crine", "agogue", "genic", "tropin", "tropic", "lytic",
  "static", "toxic", "mimetic", "ergic", "phylaxis",
  "ase", "ose", "ide", "one", "ane", "ene", "ine",
  "mycin", "cillin", "cycline", "floxacin", "prazole",
  "statin", "sartan", "olol", "dipine", "pril",
  "vir", "mab", "nib", "parin", "plast", "sone",
  "olide", "gliptin", "gliflozin", "semide", "thiazide",
  "zepam", "zolam", "tidine", "conazole", "fungin",
  "navir", "buvir", "previr", "tegravir",
  "caine", "onium", "curium", "pamide",
];

function isStrongClinicalAnchorWord(word) {
  if (!word || word.length < 3) return false;
  if (bannedAnchorWords.has(word)) return false;

  for (const suffix of CLINICAL_ANCHOR_SUFFIXES) {
    if (word.endsWith(suffix) && word.length >= suffix.length + 2) {
      return true;
    }
  }

  if (/^(?:hepat|nephr|cardio?|pulmo|gastr|enter|colo|rect|hema|neuro|psych|ophth|derm|crani|thorac|abdom|lumb|sacr|cervi|arthr|oste|myo|chondr|angio|phleb|arteri|veno?|lymph|splen|thym|thyro?|adren|gonad|utero|oophor|orch|nephr|ren|ureter|cyst|urethr|prostat|epididym|enceph|myel|mening|blephar|ot|rhin|laryng|trache|bronch|pleur|pneum|odont|gloss|cheil|gingiv|esophag|duoden|jejun|ile|appendic|cec|sigmoid|peri|pancreat|chol|cyst|chole|lith|sial|adip|lip|steat|lact|galact|glyc|gluc|ket|prote|pept|enzym|hormon|immun|allerg|anaphyl|tox|seps|bacter|vir|fung|myc|parasit|onc|neoplas|carcin|sarc|melan|leuk|erythr|thromb|embol|isch|infarct|necr|apopt|dysplas|hyperplas|metaplas|anaplas)\w{2,}$/.test(word)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Build combined vocabulary
// ---------------------------------------------------------------------------

const medicationWords = new Set();
const nonNameClinicalWordsSet = new Set();
const nonNameClinicalPhrasesSet = new Set();
const clinicalAnchorWordsSet = new Set();

// From RxNorm/medication vocabulary
if (allWords && allWords.words) {
  for (const w of allWords.words) {
    if (w.length >= 4 && /^[a-z]+$/.test(w)) medicationWords.add(w);
    if (isStrongClinicalAnchorWord(w)) {
      nonNameClinicalWordsSet.add(w);
    }
  }
}

// From phrase vocabulary
if (phrases && phrases.phrases) {
  for (const p of phrases.phrases) {
    nonNameClinicalPhrasesSet.add(p);
  }
}

// From MeSH — only words with definitive clinical signal (anchor-worthy)
if (mesh && mesh.words) {
  for (const w of mesh.words) {
    if (bannedAnchorWords.has(w)) continue;
    if (isStrongClinicalAnchorWord(w)) {
      nonNameClinicalWordsSet.add(w);
    }
  }
}
if (mesh && mesh.phrases) {
  for (const p of mesh.phrases) {
    if (p.split(/\s+/).length >= 2) {
      nonNameClinicalPhrasesSet.add(p);
    }
  }
}

// From anchors
if (anchors && anchors.anchors) {
  for (const a of anchors.anchors) {
    clinicalAnchorWordsSet.add(a);
  }
}

// Mesh anchors — strong clinical signal only
if (mesh && mesh.words) {
  for (const w of mesh.words) {
    if (isStrongClinicalAnchorWord(w)) {
      clinicalAnchorWordsSet.add(w);
    }
  }
}
if (anchors && anchors.anchors) {
  for (const a of anchors.anchors) {
    clinicalAnchorWordsSet.add(a);
  }
}

// ---------------------------------------------------------------------------
// Post-merge cleanup
// ---------------------------------------------------------------------------

for (const name of bannedAnchorWords) {
  nonNameClinicalWordsSet.delete(name);
  medicationWords.delete(name);
  clinicalAnchorWordsSet.delete(name);
}
for (const w of NON_CLINICAL_ENGLISH_WORDS) {
  nonNameClinicalWordsSet.delete(w);
  medicationWords.delete(w);
  clinicalAnchorWordsSet.delete(w);
}

// ---------------------------------------------------------------------------
// Write export file
// ---------------------------------------------------------------------------

mkdirSync(DATA_DIR, { recursive: true });

const exportData = {
  _generated: new Date().toISOString(),
  _source: "build-clinical-guard-vocabulary.js + build-mesh-vocabulary.js",
  medicationWords: [...medicationWords].sort(),
  nonNameClinicalWords: [...nonNameClinicalWordsSet].sort(),
  nonNameClinicalPhrases: [...nonNameClinicalPhrasesSet].sort(),
  clinicalAnchorWords: [...clinicalAnchorWordsSet].sort(),
};

const exportPath = join(DATA_DIR, "clinical-guard-export.js");
writeFileSync(exportPath,
  "// Auto-generated by scripts/apply-clinical-guard-vocabulary.js\n" +
  "// DO NOT EDIT MANUALLY\n\n" +
  "export const medicationWords = " + JSON.stringify(exportData.medicationWords) + ";\n\n" +
  "export const nonNameClinicalWords = " + JSON.stringify(exportData.nonNameClinicalWords) + ";\n\n" +
  "export const nonNameClinicalPhrases = " + JSON.stringify(exportData.nonNameClinicalPhrases) + ";\n\n" +
  "export const clinicalAnchorWords = " + JSON.stringify(exportData.clinicalAnchorWords) + ";\n"
);

console.log(`Written ${exportPath}:`);
console.log(`  medicationWords:       ${exportData.medicationWords.length.toLocaleString()}`);
console.log(`  nonNameClinicalWords:   ${exportData.nonNameClinicalWords.length.toLocaleString()}`);
console.log(`  nonNameClinicalPhrases: ${exportData.nonNameClinicalPhrases.length.toLocaleString()}`);
console.log(`  clinicalAnchorWords:   ${exportData.clinicalAnchorWords.length.toLocaleString()}`);

// ---------------------------------------------------------------------------
// Optionally install the import into deid.js
// ---------------------------------------------------------------------------

const deidContent = readFileSync(DEID_FILE, "utf-8");

if (!deidContent.includes("clinical-guard-export.js")) {
  console.log(`\nAdding static import to deid.js...`);

  const importBlock = `
// ── Auto-import clinical guard vocabulary (built from MeSH + RxNorm) ──
// To update: npm run build:clinical-guard-full
import {
  medicationWords as _vwMedicationWords,
  nonNameClinicalWords as _vwNonNameClinicalWords,
  nonNameClinicalPhrases as _vwNonNameClinicalPhrases,
  clinicalAnchorWords as _vwClinicalAnchorWords
} from "./data/clinical-guard-export.js";

_vwMedicationWords.forEach((w) => medicationNameWords.add(w));
_vwNonNameClinicalWords.forEach((w) => nonNameClinicalWords.add(w));
_vwNonNameClinicalPhrases.forEach((p) => nonNameClinicalPhrases.add(p));
_vwClinicalAnchorWords.forEach((w) => clinicalAnchorWords.add(w));
`;

  const marker = "const medicationClassOrStemPattern =";
  const markerIdx = deidContent.indexOf(marker);

  if (markerIdx !== -1) {
    // Check if import block already exists
    if (deidContent.includes("_vwMedicationWords")) {
      console.log(`  Import already present in deid.js.`);
    } else {
      const updated = deidContent.slice(0, markerIdx) + importBlock + "\n" + deidContent.slice(markerIdx);
      writeFileSync(DEID_FILE, updated);
      console.log(`  Import inserted into deid.js.`);
    }
  } else {
    console.log(`  Could not find insertion point. Add the import manually.`);
  }
} else {
  console.log(`\ndeid.js already imports clinical-guard-export.js.`);
}
