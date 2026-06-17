/**
 * Automated de-id bug finder: runs deidentifyTextStructuredOnly on 3,381
 * synthetic clinical notes and reports every error found.
 *
 * Run: node tests/audit-deid-on-notes.js
 * Output: reports/deid-bug-report.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deidentifyTextStructuredOnly } from "../deid.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Known clinical terms that must NEVER be redacted ──
const PROTECTED_TERMS = [
  // Diagnoses & conditions
  "diabetes", "ketoacidosis", "hypothyroidism", "hyperthyroidism",
  "hypertension", "hyperlipidemia", "pneumonia", "sepsis",
  "anemia", "asthma", "copd", "chf", "mi", "dvt", "pe",
  "cirrhosis", "hepatitis", "pancreatitis", "cholecystitis",
  "appendicitis", "diverticulitis", "gastritis", "cellulitis",
  "osteomyelitis", "meningitis", "encephalitis", "endocarditis",
  "pyelonephritis", "cystitis", "bronchitis", "sinusitis",
  // Medications
  "acetaminophen", "ibuprofen", "aspirin", "metformin", "insulin",
  "levothyroxine", "lisinopril", "atorvastatin", "amlodipine",
  "metoprolol", "furosemide", "warfarin", "enoxaparin", "heparin",
  "omeprazole", "pantoprazole", "ondansetron", "vancomycin",
  "ceftriaxone", "azithromycin", "prednisone", "albuterol",
  "gabapentin", "sertraline", "escitalopram", "tramadol",
  "oxycodone", "morphine", "hydromorphone", "clopidogrel",
  "apixaban", "rivaroxaban", "spironolactone", "losartan",
  "hydrochlorothiazide", "amoxicillin", "ciprofloxacin",
  // Procedures & clinical terms
  "appendectomy", "cholecystectomy", "colonoscopy", "endoscopy",
  "bronchoscopy", "laparotomy", "thoracotomy", "craniotomy",
  "mri", "ct scan", "ultrasound", "xray", "ekg", "ecg",
  "biopsy", "resection", "graft", "transplant", "dialysis",
  // Lab tests
  "cbc", "bmp", "cmp", "tsh", "a1c", "bun", "creatinine",
  "glucose", "sodium", "potassium", "chloride", "magnesium",
  "calcium", "phosphorus", "wbc", "hemoglobin", "platelets",
  "anion gap", "bicarbonate", "troponin", "lactate",
  // Anatomy & exam
  "abdomen", "chest", "lungs", "heart", "liver", "kidneys",
  "spleen", "thyroid", "extremities", "neurological",
  "cardiovascular", "respiratory", "gastrointestinal",
  // Common phrases
  "history of present illness", "past medical history",
  "surgical history", "family history", "social history",
  "review of systems", "physical exam", "assessment and plan",
  "vital signs", "lab results", "discharge summary",
  "progress note", "admission note",
];

// ── Load notes ──
const notesPath = join(ROOT, "data", "test-notes", "synthetic-clinical-notes.json");
const notes = JSON.parse(readFileSync(notesPath, "utf-8"));
console.log(`Loaded ${notes.length} notes for testing`);

// ── Check each note ──
const bugs = [];
let totalNotes = 0;
let notesWithErrors = 0;

for (let i = 0; i < notes.length; i++) {
  const note = notes[i];
  const result = deidentifyTextStructuredOnly(note.text);

  // Check each entity for clinical term false positives
  for (const entity of result.entities) {
    const span = note.text.slice(entity.start, entity.end);

    // Skip if the entity is a correctly-redacted facility/organization/provider name
    // that merely contains a clinical substring (e.g. "Lakeside Heart Institute")
    const isFacilityOrProvider = ["ORGANIZATION", "FACILITY", "PROVIDER NAME"].includes(entity.label);
    if (isFacilityOrProvider) {
      continue;
    }

    // Check if the redacted span contains a protected clinical term as a full word
    for (const term of PROTECTED_TERMS) {
      const termLower = term.toLowerCase();
      const spanLower = span.toLowerCase();

      // Use word boundary check to avoid substring matches (e.g. "mi" in "Emily")
      const wordBoundary = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordBoundary.test(spanLower)) {
        // Skip common abbreviations that appear in names (e.g. "Dr. Smith" matches "mi")
        const isShortAbbr = term.length <= 3;
        // For very short terms, require the term to be a standalone word in the span
        if (isShortAbbr) {
          const words = spanLower.split(/\s+/);
          if (!words.includes(termLower)) {
            continue;
          }
        }
        bugs.push({
          noteId: note.id,
          noteIndex: i,
          entity: {
            start: entity.start,
            end: entity.end,
            label: entity.label,
            text: span,
            source: entity.source,
          },
          clinicalTerm: term,
          context: note.text.slice(Math.max(0, entity.start - 40), entity.end + 40),
        });
        notesWithErrors++;
        break; // One bug per entity is enough
      }
    }
  }

  totalNotes++;
  if ((i + 1) % 500 === 0) {
    console.log(`  Processed ${i + 1}/${notes.length} notes, found ${bugs.length} bugs so far...`);
  }
}

// ── Group bugs by clinical term ──
const byTerm = {};
for (const bug of bugs) {
  if (!byTerm[bug.clinicalTerm]) {
    byTerm[bug.clinicalTerm] = [];
  }
  byTerm[bug.clinicalTerm].push(bug);
}

// ── Group by entity label ──
const byLabel = {};
for (const bug of bugs) {
  if (!byLabel[bug.entity.label]) {
    byLabel[bug.entity.label] = [];
  }
  byLabel[bug.entity.label].push(bug);
}

// ── Report ──
console.log(`\n=== DE-ID BUG REPORT ===`);
console.log(`Notes tested: ${totalNotes}`);
console.log(`Notes with errors: ${notesWithErrors}`);
console.log(`Total bugs found: ${bugs.length}`);
console.log(`\nBugs by clinical term (top 30):`);
const sortedTerms = Object.entries(byTerm)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 30);
for (const [term, termBugs] of sortedTerms) {
  console.log(`  ${term}: ${termBugs.length}`);
}
console.log(`\nBugs by entity label:`);
for (const [label, labelBugs] of Object.entries(byLabel).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${label}: ${labelBugs.length}`);
}

// ── Show sample bugs ──
console.log(`\nSample bugs:`);
for (const bug of bugs.slice(0, 15)) {
  console.log(`  Note ${bug.noteId}:`);
  console.log(`    Entity: "${bug.entity.text}" labeled as [${bug.entity.label}]`);
  console.log(`    Contains clinical term: "${bug.clinicalTerm}"`);
  console.log(`    Context: "...${bug.context}..."`);
  console.log();
}

// ── Save report ──
const reportDir = join(ROOT, "reports");
import { mkdirSync } from "node:fs";
mkdirSync(reportDir, { recursive: true });
writeFileSync(
  join(reportDir, "deid-bug-report.json"),
  JSON.stringify({
    generated: new Date().toISOString(),
    totalNotes,
    notesWithErrors,
    totalBugs: bugs.length,
    byTerm: Object.fromEntries(
      Object.entries(byTerm).map(([k, v]) => [k, v.length])
    ),
    byLabel: Object.fromEntries(
      Object.entries(byLabel).map(([k, v]) => [k, v.length])
    ),
    sampleBugs: bugs.slice(0, 50),
    allBugs: bugs,
  }, null, 2)
);
console.log(`\nFull report saved to reports/deid-bug-report.json`);
