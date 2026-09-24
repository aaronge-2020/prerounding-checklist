/**
 * 40-fixture narrative parser test.
 *
 * Tests all 20 H&Ps and 20 progress notes through the production
 * parsePrimaryTeamNote + extractNoteClinicalData path.
 *
 * Run: node tests/test-narrative-fixtures.js
 */
import { readFileSync } from "node:fs";
import { parsePrimaryTeamNote } from "../src/patient-context/primary-team-note-parser.js";
import { extractNoteClinicalData } from "../src/patient-context/note-clinical-extractor.js";

let failures = 0;

function checkContains(fixture, label, actualArray, expectedItems) {
  for (const expected of expectedItems) {
    const found = actualArray.some((a) =>
      String(a).toLowerCase().includes(String(expected).toLowerCase())
    );
    if (!found) {
      console.error(`FAIL ${fixture} ${label}: missing "${expected}"`);
      console.error(`  actual: ${JSON.stringify(actualArray)}`);
      failures++;
    }
  }
}

const HP_EXPECTATIONS = {
  "hp-01.md": {
    problems: ["Acute coronary syndrome", "Hypertension", "Type 2 diabetes"],
    meds: ["Lisinopril", "Atorvastatin", "Metformin", "Aspirin"],
    vitals: ["148/92"],
    labs: ["WBC", "Hemoglobin", "Troponin"],
    studies: ["EKG", "CXR"],
  },
  "hp-02.md": {
    problems: ["heart failure", "Atrial fibrillation", "kidney injury"],
    meds: ["Carvedilol", "Furosemide", "Apixaban", "Spironolactone"],
    vitals: ["132/84"],
    labs: ["Sodium", "Creatinine", "BNP"],
    studies: ["CXR", "EKG"],
  },
  "hp-03.md": {
    problems: ["COPD", "pneumonia", "Hypoxemia"],
    meds: ["Tiotropium", "Albuterol", "Lisinopril"],
    vitals: ["138/86"],
    labs: ["WBC", "Lactate"],
    studies: ["CXR"],
  },
  "hp-04.md": {
    problems: ["asthma", "Hypoxemia"],
    meds: ["Fluticasone", "Albuterol", "Montelukast"],
    vitals: ["142/88"],
    labs: ["WBC", "Lactate"],
    studies: ["CXR"],
  },
  "hp-05.md": {
    problems: ["pancreatitis", "Cholelithiasis", "Hypertriglyceridemia"],
    meds: ["Fenofibrate", "Omeprazole"],
    vitals: ["128/78"],
    labs: ["Lipase", "Triglycerides", "WBC"],
    studies: ["CT abdomen", "ultrasound"],
  },
  "hp-06.md": {
    problems: ["hemorrhage", "hypertension", "Alcohol"],
    meds: [],
    vitals: ["198/112"],
    labs: ["Sodium", "Creatinine"],
    studies: ["CT head", "CTA"],
  },
  "hp-07.md": {
    problems: ["aortic stenosis", "Hypertension", "Hypothyroidism"],
    meds: ["Levothyroxine", "Amlodipine", "Atorvastatin"],
    vitals: ["108/68"],
    labs: ["Hemoglobin", "BNP"],
    studies: ["EKG", "Echocardiogram"],
  },
  "hp-08.md": {
    problems: ["sepsis", "kidney injury", "Delirium"],
    meds: ["Donepezil", "Tamsulosin", "Lisinopril"],
    vitals: ["96/62"],
    labs: ["WBC", "Creatinine", "Lactate"],
    studies: ["Blood cultures", "Urine culture"],
  },
  "hp-09.md": {
    problems: ["Preeclampsia", "Thrombocytopenia"],
    meds: ["Prenatal", "Labetalol"],
    vitals: ["172/108"],
    labs: ["Platelets", "AST", "ALT"],
    studies: ["ultrasound"],
  },
  "hp-10.md": {
    problems: ["osteoarthritis", "NSAID"],
    meds: ["Ibuprofen", "Lisinopril"],
    vitals: ["136/84"],
    labs: ["CRP", "ESR"],
    studies: ["X-ray"],
  },
  "hp-11.md": {
    problems: ["ketoacidosis", "Hyperglycemia"],
    meds: ["Insulin glargine", "Insulin lispro"],
    vitals: ["104/68"],
    labs: ["Sodium", "Potassium", "Glucose", "HbA1c"],
    studies: ["Urinalysis"],
  },
  "hp-12.md": {
    problems: ["GI bleed", "shock", "Cirrhosis"],
    meds: ["Propranolol", "Spironolactone", "Furosemide"],
    vitals: ["92/58"],
    labs: ["Hemoglobin", "Platelets", "INR"],
    studies: ["EKG"],
  },
  "hp-13.md": {
    problems: ["hydrocephalus", "B12", "Fall"],
    meds: ["Amlodipine", "Atorvastatin", "Cyanocobalamin"],
    vitals: ["142/78"],
    labs: ["Vitamin B12", "TSH"],
    studies: ["MRI brain"],
  },
  "hp-14.md": {
    problems: ["lupus", "nephritis", "Cytopenias"],
    meds: ["Ibuprofen"],
    vitals: ["118/74"],
    labs: ["WBC", "ANA", "dsDNA", "C3", "C4"],
    studies: ["protein/creatinine ratio"],
  },
  "hp-15.md": {
    problems: ["stone", "Nausea"],
    meds: [],
    vitals: ["148/92"],
    labs: ["WBC", "Creatinine"],
    studies: ["CT abdomen"],
  },
  "hp-16.md": {
    problems: ["Cellulitis", "diabetes", "Tobacco"],
    meds: ["Metformin", "Glipizide", "Lisinopril"],
    vitals: ["132/80"],
    labs: ["WBC", "Glucose", "CRP"],
    studies: ["Wound culture", "Blood cultures"],
  },
  "hp-17.md": {
    problems: ["Acetaminophen toxicity", "depressive", "Nausea"],
    meds: ["Sertraline", "Lorazepam"],
    vitals: ["118/72"],
    labs: ["AST", "ALT", "INR"],
    studies: [],
  },
  "hp-18.md": {
    problems: ["cord compression", "Hypercalcemia", "retention"],
    meds: ["Leuprolide", "Amlodipine", "Oxycodone"],
    vitals: ["150/90"],
    labs: ["Calcium", "PSA", "Creatinine"],
    studies: ["MRI"],
  },
  "hp-19.md": {
    problems: ["SVT", "Palpitations"],
    meds: ["Multivitamin"],
    vitals: ["104/68", "188"],
    labs: ["Potassium", "Magnesium", "Troponin"],
    studies: ["EKG"],
  },
  "hp-20.md": {
    problems: ["GI bleed", "Atrial fibrillation"],
    meds: ["Apixaban", "Metoprolol", "Omeprazole"],
    vitals: ["102/64"],
    labs: ["Hemoglobin", "INR"],
    studies: ["Electrocardiogram"],
  },
};

const PN_EXPECTATIONS = {
  "pn-01.md": {
    problems: ["COPD", "Hypoxemia"],
    meds: [],
    vitals: ["128/78"],
    labs: ["WBC", "Creatinine"],
    studies: ["CXR"],
  },
  "pn-02.md": {
    problems: ["Postoperative"],
    meds: [],
    vitals: ["118/72"],
    labs: ["WBC", "Hemoglobin"],
    studies: [],
  },
  "pn-03.md": {
    problems: ["Neurologic", "Cardiovascular", "Pulmonary", "Infectious", "Renal", "GI", "Heme"],
    meds: [],
    vitals: ["104/62"],
    labs: ["WBC", "Lactate", "Creatinine"],
    studies: ["CXR", "Blood cultures"],
  },
  "pn-04.md": {
    problems: ["ileus", "hypokalemia", "hypomagnesemia"],
    meds: [],
    vitals: ["132/80"],
    labs: ["Potassium", "Magnesium"],
    studies: ["KUB"],
  },
  "pn-05.md": {
    problems: ["Coronary artery disease", "Access site"],
    meds: ["Aspirin", "Clopidogrel", "Atorvastatin"],
    vitals: ["112/70"],
    labs: ["Hemoglobin", "Troponin"],
    studies: ["EKG", "Echo"],
  },
  "pn-06.md": {
    problems: ["Delirium", "Hyponatremia", "Fall"],
    meds: [],
    vitals: ["148/88"],
    labs: ["Sodium", "Creatinine"],
    studies: ["UA", "Head CT"],
  },
  "pn-07.md": {
    problems: ["pneumonia", "COPD"],
    meds: ["Ceftriaxone", "Azithromycin", "Prednisone"],
    vitals: ["126/78"],
    labs: ["WBC", "CRP"],
    studies: ["CXR"],
  },
  "pn-08.md": {
    problems: ["Cellulitis", "T2DM", "Discharge"],
    meds: [],
    vitals: [],
    labs: ["Hemoglobin", "Sodium", "Creatinine"],
    studies: [],
  },
  "pn-09.md": {
    problems: ["pancreatitis", "Cholelithiasis"],
    meds: [],
    vitals: ["122/76"],
    labs: ["Lipase", "Triglycerides"],
    studies: [],
  },
  "pn-10.md": {
    problems: ["meningitis", "Headache"],
    meds: [],
    vitals: ["110/68"],
    labs: ["WBC", "Glucose"],
    studies: ["LP results"],
  },
  "pn-11.md": {
    problems: ["pyelonephritis", "kidney injury"],
    meds: [],
    vitals: ["100/64"],
    labs: ["WBC", "Creatinine", "Lactate"],
    studies: ["blood cultures", "urine culture"],
  },
  "pn-12.md": {
    problems: ["ADHF", "Afib", "CKD"],
    meds: [],
    vitals: ["118/72"],
    labs: ["Creatinine", "BNP", "Magnesium"],
    studies: ["EKG"],
  },
  "pn-13.md": {
    problems: ["MRSA", "Malnutrition", "Pain"],
    meds: ["Vancomycin", "Piperacillin"],
    vitals: ["128/76"],
    labs: ["WBC", "Albumin"],
    studies: ["Wound culture", "CT abdomen"],
  },
  "pn-14.md": {
    problems: ["Pleurisy", "Deconditioning"],
    meds: [],
    vitals: ["124/76"],
    labs: ["BNP", "Troponin"],
    studies: [],
  },
  "pn-15.md": {
    problems: ["DKA", "Diabetes education"],
    meds: [],
    vitals: ["112/70"],
    labs: ["Potassium", "Glucose", "Bicarbonate"],
    studies: [],
  },
  "pn-16.md": {
    problems: ["Hyperkalemia", "ESRD", "Anemia"],
    meds: [],
    vitals: ["142/88"],
    labs: ["Potassium", "Creatinine", "Phosphorus"],
    studies: ["EKG"],
  },
  "pn-17.md": {
    problems: ["variceal bleed", "anemia", "cirrhosis"],
    meds: [],
    vitals: ["98/60"],
    labs: ["Hemoglobin", "Platelets", "INR"],
    studies: [],
  },
  "pn-18.md": {
    problems: ["Nephrolithiasis", "Prevention"],
    meds: [],
    vitals: ["128/80"],
    labs: ["Creatinine"],
    studies: ["Stone analysis"],
  },
  "pn-19.md": {
    problems: ["hemorrhage", "Hypertension"],
    meds: [],
    vitals: ["152/88"],
    labs: ["Sodium", "Potassium"],
    studies: ["CT head"],
  },
  "pn-20.md": {
    problems: ["Viral syndrome", "Follow-up"],
    meds: [],
    vitals: ["122/78"],
    labs: ["WBC", "Hemoglobin", "Platelets"],
    studies: ["CXR", "Blood cultures"],
  },
};

function testFixture(dir, file, expectations, noteType) {
  const text = readFileSync(`${dir}/${file}`, "utf8");
  const parsed = parsePrimaryTeamNote(text, noteType);
  const clinical = extractNoteClinicalData(parsed.sections, { noteType });

  const problems = (parsed.parsedProblems || []).map((p) => p.problem || p.title);
  const meds = clinical.medicationsText.split("\n").slice(1).join("\n");
  const vitals = clinical.vitalsText.split("\n").slice(1).join("\n");
  const labs = clinical.labsText.split("\n").slice(1).join("\n");
  const studies = clinical.studies.map((s) => `${s.label}: ${s.text}`).join("\n");

  if (expectations.problems?.length) {
    checkContains(file, "problems", problems, expectations.problems);
  }
  if (expectations.meds?.length) {
    checkContains(file, "meds", [meds], expectations.meds);
  }
  if (expectations.vitals?.length) {
    checkContains(file, "vitals", [vitals], expectations.vitals);
  }
  if (expectations.labs?.length) {
    checkContains(file, "labs", [labs], expectations.labs);
  }
  if (expectations.studies?.length) {
    checkContains(file, "studies", [studies], expectations.studies);
  }
}

console.log("Testing H&P fixtures...");
for (const [file, exp] of Object.entries(HP_EXPECTATIONS)) {
  testFixture("tests/fixtures/narrative-hps", file, exp, "hp");
}

console.log("Testing progress note fixtures...");
for (const [file, exp] of Object.entries(PN_EXPECTATIONS)) {
  testFixture("tests/fixtures/narrative-progress-notes", file, exp, "progress");
}

if (failures === 0) {
  console.log("All 40 narrative fixture tests passed!");
} else {
  console.error(`${failures} failures`);
  process.exit(1);
}
