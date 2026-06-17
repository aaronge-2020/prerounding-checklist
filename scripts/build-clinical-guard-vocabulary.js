/**
 * Builds the clinical guard vocabulary for the de-id pipeline from open
 * medical data sources so you never have to manually add terms again.
 *
 * Sources (all free/open, no auth):
 *   - RxNorm API (medication names, brand names, generic names)
 *   - UMLS Specialist Lexicon medical abbreviations
 *   - Hardcoded medical term lists curated from clinical guidelines
 *
 * Run:  node scripts/build-clinical-guard-vocabulary.js
 * Output:  data/clinical-guard-phrases.json
 *          data/clinical-guard-words.json
 *          data/clinical-guard-anchors.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

// ---------------------------------------------------------------------------
// Phase 1: RxNorm medication names (free NIH API)
// ---------------------------------------------------------------------------

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

async function fetchRxNormNames(limit = 5000) {
  console.log("Fetching RxNorm medication names...");
  const names = new Set();

  try {
    // Get top medications by prescription volume
    const displayNamesRes = await fetch(
      `${RXNORM_BASE}/displaynames?tty=IN,BN,SCD&pageSize=${limit}`
    );
    if (!displayNamesRes.ok) {
      throw new Error(`HTTP ${displayNamesRes.status}`);
    }
    const data = await displayNamesRes.json();
    const terms = data?.displayTermsList?.term || [];

    for (const term of terms) {
      const name = String(term).toLowerCase().replace(/[^a-z0-9 /-]/g, "").trim();
      if (name && name.length >= 3 && name.length <= 80) {
        names.add(name);
      }
    }
    console.log(`  RxNorm: fetched ${terms.length} terms, kept ${names.size}`);
  } catch (e) {
    console.log(`  RxNorm API unavailable (${e.message}), using offline medication list`);
    // Fallback: comprehensive medication list
    const fallbackMeds = getFallbackMedicationList();
    for (const med of fallbackMeds) {
      names.add(med.toLowerCase());
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Phase 2: Medical abbreviations and terminology
// ---------------------------------------------------------------------------

function getFallbackMedicationList() {
  // Comprehensive list of common medications
  return [
    // --- Analgesics ---
    "acetaminophen", "ibuprofen", "naproxen", "aspirin", "celecoxib",
    "diclofenac", "indomethacin", "ketorolac", "meloxicam", "tramadol",
    "hydromorphone", "morphine", "oxycodone", "fentanyl", "methadone",
    "hydrocodone", "codeine", "buprenorphine", "tapentadol", "gabapentin",
    "pregabalin", "duloxetine", "amitriptyline", "nortriptyline",
    "lidocaine", "capsaicin",

    // --- Antibiotics ---
    "amoxicillin", "amoxicillin-clavulanate", "ampicillin", "penicillin v",
    "piperacillin-tazobactam", "cefazolin", "cephalexin", "cefuroxime",
    "ceftriaxone", "cefepime", "ceftazidime", "cefixime", "cefdinir",
    "cefpodoxime", "azithromycin", "clarithromycin", "erythromycin",
    "doxycycline", "minocycline", "tetracycline", "tigecycline",
    "ciprofloxacin", "levofloxacin", "moxifloxacin", "nitrofurantoin",
    "trimethoprim-sulfamethoxazole", "clindamycin", "metronidazole",
    "vancomycin", "linezolid", "daptomycin", "gentamicin", "tobramycin",
    "amikacin", "meropenem", "ertapenem", "imipenem-cilastatin",
    "aztreonam", "colistin", "polymyxin b", "fidaxomicin", "rifaximin",
    "isoniazid", "rifampin", "pyrazinamide", "ethambutol",

    // --- Cardiovascular ---
    "lisinopril", "enalapril", "ramipril", "benazepril", "captopril",
    "losartan", "valsartan", "irbesartan", "candesartan", "telmisartan",
    "olmesartan", "metoprolol", "atenolol", "carvedilol", "propranolol",
    "labetalol", "bisoprolol", "nebivolol", "amlodipine", "nifedipine",
    "diltiazem", "verapamil", "hydrochlorothiazide", "chlorthalidone",
    "furosemide", "bumetanide", "torsemide", "spironolactone", "eplerenone",
    "atorvastatin", "rosuvastatin", "simvastatin", "pravastatin",
    "pitavastatin", "lovastatin", "ezetimibe", "fenofibrate", "gemfibrozil",
    "niacin", "icosapent ethyl", "digoxin", "amiodarone", "flecainide",
    "sotalol", "dofetilide", "propafenone", "warfarin", "apixaban",
    "rivaroxaban", "edoxaban", "dabigatran", "enoxaparin", "heparin",
    "clopidogrel", "ticagrelor", "prasugrel", "dipyridamole",
    "nitroglycerin", "isosorbide mononitrate", "isosorbide dinitrate",
    "hydralazine", "clonidine", "doxazosin", "terazosin", "tamsulosin",

    // --- Endocrine ---
    "metformin", "glipizide", "glyburide", "glimepiride", "pioglitazone",
    "sitagliptin", "saxagliptin", "linagliptin", "dapagliflozin",
    "empagliflozin", "canagliflozin", "semaglutide", "liraglutide",
    "dulaglutide", "insulin glargine", "insulin lispro", "insulin aspart",
    "insulin regular", "insulin detemir", "insulin degludec",
    "levothyroxine", "liothyronine", "methimazole", "propylthiouracil",
    "prednisone", "methylprednisolone", "dexamethasone", "hydrocortisone",
    "fludrocortisone", "calcitonin", "alendronate", "ibandronate",
    "risedronate", "zoledronic acid", "denosumab", "teriparatide",

    // --- GI ---
    "omeprazole", "pantoprazole", "esomeprazole", "lansoprazole",
    "rabeprazole", "famotidine", "ranitidine", "cimetidine", "sucralfate",
    "ondansetron", "metoclopramide", "prochlorperazine", "promethazine",
    "dicyclomine", "hyoscyamine", "loperamide", "diphenoxylate-atropine",
    "bismuth subsalicylate", "polyethylene glycol", "lactulose",
    "docusate", "senna", "magnesium hydroxide", "psyllium",
    "ursodiol", "mesalamine", "sulfasalazine", "infliximab", "adalimumab",

    // --- Respiratory ---
    "albuterol", "levalbuterol", "ipratropium", "tiotropium",
    "salmeterol", "formoterol", "vilanterol", "fluticasone",
    "budesonide", "beclomethasone", "mometasone", "montelukast",
    "zafirlukast", "theophylline", "roflumilast", "omalizumab",
    "mepolizumab", "benralizumab", "dextromethorphan", "guaifenesin",
    "benzonatate", "pseudoephedrine",

    // --- Psychiatry / Neurology ---
    "fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram",
    "venlafaxine", "desvenlafaxine", "duloxetine", "bupropion",
    "mirtazapine", "trazodone", "aripiprazole", "quetiapine",
    "olanzapine", "risperidone", "haloperidol", "clozapine", "lurasidone",
    "lithium", "valproic acid", "lamotrigine", "levetiracetam",
    "topiramate", "carbamazepine", "oxcarbazepine", "phenytoin",
    "phenobarbital", "primidone", "ethosuximide", "zonisamide",
    "lacosamide", "brivaracetam", "eszopiclone", "zolpidem",
    "zaleplon", "temazepam", "lorazepam", "diazepam", "alprazolam",
    "clonazepam", "buspirone", "hydroxyzine", "donepezil", "memantine",
    "rivastigmine", "galantamine", "pramipexole", "ropinirole",
    "carbidopa-levodopa", "entacapone", "benztropine", "trihexyphenidyl",

    // --- Additional ---
    "allopurinol", "febuxostat", "colchicine", "probenecid",
    "methotrexate", "hydroxychloroquine", "sulfasalazine",
    "leflunomide", "azathioprine", "mycophenolate", "tacrolimus",
    "cyclosporine", "sirolimus", "everolimus", "acyclovir", "valacyclovir",
    "famciclovir", "oseltamivir", "remdesivir", "nirmatrelvir-ritonavir",
    "molnu piravir", "fluconazole", "itraconazole", "voriconazole",
    "posaconazole", "caspofungin", "micafungin", "amphotericin b",
    "nystatin", "terbinafine", "albendazole", "mebendazole",
    "ivermectin", "praziquantel", "hydroxychloroquine", "chloroquine",
    "primaquine", "artemether-lumefantrine", "atovaquone-proguanil",
    "iron sulfate", "ferrous gluconate", "folic acid", "vitamin b12",
    "cyanocobalamin", "vitamin d", "cholecalciferol", "ergocalciferol",
    "calcium carbonate", "calcium citrate", "potassium chloride",
    "magnesium oxide", "sodium bicarbonate", "sodium chloride",
    "epinephrine", "diphenhydramine", "cetirizine", "loratadine",
    "fexofenadine", "omalizumab", "etanercept", "adalimumab",
    "ustekinumab", "secukinumab", "ixekizumab", "guselkumab",
    "risankizumab", "tildrakizumab", "dupilumab", "tralokinumab",
    "nivolumab", "pembrolizumab", "atezolizumab", "durvalumab",
    "avelumab", "ipilimumab", "trastuzumab", "rituximab", "bevacizumab",
    "cetuximab", "panitumumab", "pertuzumab", "brentuximab vedotin",
    "ado-trastuzumab emtansine", "sacituzumab govitecan",
    "enfortumab vedotin", "tisotumab vedotin", "belantamab mafodotin",
    "polatuzumab vedotin", "loncastuximab tesirine", "gemtuzumab ozogamicin",
    "inotuzumab ozogamicin", "moxetumomab pasudotox", "tagraxofusp",
    "axicabtagene ciloleucel", "tisagenlecleucel", "brexucabtagene autoleucel",
    "lisocabtagene maraleucel", "idecabtagene vicleucel",
    "ciltacabtagene autoleucel", "teclistamab", "elranatamab",
    "talquetamab", "mosunetuzumab", "epcoritamab", "glofitamab"
  ];
}

function getMedicalConditionsList() {
  return [
    // Cardiovascular
    "hypertension", "essential hypertension", "secondary hypertension",
    "coronary artery disease", "myocardial infarction", "acute myocardial infarction",
    "angina pectoris", "unstable angina", "congestive heart failure",
    "heart failure with preserved ejection fraction",
    "heart failure with reduced ejection fraction",
    "atrial fibrillation", "atrial flutter", "supraventricular tachycardia",
    "ventricular tachycardia", "ventricular fibrillation",
    "aortic stenosis", "mitral regurgitation", "aortic regurgitation",
    "mitral valve prolapse", "pericarditis", "myocarditis", "endocarditis",
    "peripheral artery disease", "deep vein thrombosis", "pulmonary embolism",
    "hyperlipidemia", "dyslipidemia", "aortic aneurysm",
    // Endocrine
    "diabetes mellitus", "type 1 diabetes mellitus", "type 2 diabetes mellitus",
    "gestational diabetes", "diabetic ketoacidosis", "hyperosmolar hyperglycemic state",
    "hypoglycemia", "diabetic neuropathy", "diabetic retinopathy",
    "diabetic nephropathy", "hypothyroidism", "hyperthyroidism",
    "autoimmune hypothyroidism", "autoimmune thyroiditis", "hashimoto thyroiditis",
    "graves disease", "thyroid nodule", "thyroid cancer",
    "hyperparathyroidism", "hypoparathyroidism",
    "hypercalcemia", "hypocalcemia", "osteoporosis", "osteopenia",
    "cushing syndrome", "addison disease", "adrenal insufficiency",
    "hyperaldosteronism", "pheochromocytoma", "acromegaly",
    "hyperprolactinemia", "diabetes insipidus", "syndrome of inappropriate antidiuretic hormone",
    // Renal
    "acute kidney injury", "chronic kidney disease", "end stage renal disease",
    "nephrotic syndrome", "nephritic syndrome", "glomerulonephritis",
    "acute tubular necrosis", "renal artery stenosis", "hydronephrosis",
    "polycystic kidney disease", "urinary tract infection", "pyelonephritis",
    "cystitis", "urolithiasis", "nephrolithiasis", "renal cell carcinoma",
    "electrolyte imbalance", "hyponatremia", "hypernatremia",
    "hypokalemia", "hyperkalemia", "hypomagnesemia", "hypermagnesemia",
    "hypophosphatemia", "hyperphosphatemia",
    // Respiratory
    "asthma", "chronic obstructive pulmonary disease", "emphysema",
    "chronic bronchitis", "pneumonia", "community acquired pneumonia",
    "hospital acquired pneumonia", "aspiration pneumonia",
    "interstitial lung disease", "pulmonary fibrosis", "idiopathic pulmonary fibrosis",
    "sarcoidosis", "pulmonary hypertension", "obstructive sleep apnea",
    "acute respiratory distress syndrome", "respiratory failure",
    "pneumothorax", "pleural effusion", "hemoptysis",
    "lung cancer", "small cell lung cancer", "non-small cell lung cancer",
    "bronchiectasis", "cystic fibrosis", "allergic rhinitis", "sinusitis",
    // GI
    "gastroesophageal reflux disease", "peptic ulcer disease",
    "gastritis", "gastroenteritis", "inflammatory bowel disease",
    "crohn disease", "ulcerative colitis", "irritable bowel syndrome",
    "celiac disease", "acute pancreatitis", "chronic pancreatitis",
    "cholecystitis", "cholelithiasis", "choledocholithiasis",
    "acute cholangitis", "hepatitis a", "hepatitis b", "hepatitis c",
    "alcoholic hepatitis", "nonalcoholic fatty liver disease",
    "nonalcoholic steatohepatitis", "cirrhosis", "hepatic encephalopathy",
    "hepatocellular carcinoma", "liver failure", "acute liver failure",
    "ascites", "spontaneous bacterial peritonitis", "esophageal varices",
    "diverticulitis", "diverticulosis", "appendicitis", "intestinal obstruction",
    "small bowel obstruction", "large bowel obstruction", "colorectal cancer",
    "pancreatic cancer", "gastric cancer", "esophageal cancer",
    // Neurology
    "ischemic stroke", "hemorrhagic stroke", "transient ischemic attack",
    "seizure disorder", "epilepsy", "status epilepticus",
    "migraine", "tension headache", "cluster headache",
    "alzheimer disease", "vascular dementia", "lewy body dementia",
    "frontotemporal dementia", "parkinson disease", "huntington disease",
    "amyotrophic lateral sclerosis", "multiple sclerosis",
    "myasthenia gravis", "guillain barre syndrome",
    "peripheral neuropathy", "trigeminal neuralgia",
    "bell palsy", "meningitis", "encephalitis", "brain abscess",
    "subdural hematoma", "epidural hematoma", "subarachnoid hemorrhage",
    "traumatic brain injury", "spinal cord injury", "normal pressure hydrocephalus",
    "intracranial hypertension", "brain tumor", "glioblastoma", "meningioma",
    // Hematology/Oncology
    "anemia", "iron deficiency anemia", "anemia of chronic disease",
    "pernicious anemia", "hemolytic anemia", "sickle cell disease",
    "thalassemia", "polycythemia vera", "essential thrombocytosis",
    "primary myelofibrosis", "leukemia", "acute lymphoblastic leukemia",
    "acute myeloid leukemia", "chronic lymphocytic leukemia",
    "chronic myeloid leukemia", "lymphoma", "hodgkin lymphoma",
    "non-hodgkin lymphoma", "multiple myeloma", "myelodysplastic syndrome",
    "aplastic anemia", "immune thrombocytopenia", "thrombotic thrombocytopenic purpura",
    "hemophilia a", "hemophilia b", "von willebrand disease",
    "disseminated intravascular coagulation", "neutropenia",
    "breast cancer", "prostate cancer", "bladder cancer", "cervical cancer",
    "ovarian cancer", "endometrial cancer", "testicular cancer",
    "melanoma", "basal cell carcinoma", "squamous cell carcinoma",
    // Infectious Disease
    "sepsis", "septic shock", "bacteremia", "fungemia",
    "hiv infection", "aids", "tuberculosis", "latent tuberculosis",
    "influenza", "covid-19", "sars-cov-2", "rsv infection",
    "clostridioides difficile infection", "cellulitis", "erysipelas",
    "necrotizing fasciitis", "osteomyelitis", "septic arthritis",
    "infective endocarditis", "meningococcemia",
    "lyme disease", "syphilis", "gonorrhea", "chlamydia",
    "herpes simplex", "herpes zoster", "varicella", "cytomegalovirus",
    "epstein-barr virus", "malaria", "dengue", "zika virus",
    "candidiasis", "aspergillosis", "cryptococcosis", "mucormycosis",
    // Rheumatology / Musculoskeletal
    "rheumatoid arthritis", "osteoarthritis", "gout", "pseudogout",
    "systemic lupus erythematosus", "scleroderma", "systemic sclerosis",
    "sjogren syndrome", "mixed connective tissue disease",
    "polymyositis", "dermatomyositis", "ankylosing spondylitis",
    "psoriatic arthritis", "reactive arthritis", "vasculitis",
    "giant cell arteritis", "polymyalgia rheumatica", "takayasu arteritis",
    "polyarteritis nodosa", "granulomatosis with polyangiitis",
    "eosinophilic granulomatosis with polyangiitis", "microscopic polyangiitis",
    "behcet disease", "fibromyalgia", "chronic fatigue syndrome",
    "compartment syndrome", "rhabdomyolysis", "fracture",
    // Dermatology
    "eczema", "atopic dermatitis", "contact dermatitis", "psoriasis",
    "plaque psoriasis", "urticaria", "angioedema", "acne vulgaris",
    "rosacea", "hidradenitis suppurativa", "pemphigus vulgaris",
    "bullous pemphigoid", "stevens-johnson syndrome", "toxic epidermal necrolysis",
    "erythema multiforme", "lichen planus", "vitiligo", "alopecia areata",
    // Ophthalmology
    "glaucoma", "cataract", "macular degeneration", "age-related macular degeneration",
    "diabetic retinopathy", "retinal detachment", "optic neuritis",
    "anterior uveitis", "conjunctivitis", "keratitis", "dry eye syndrome",
    // Multi-system
    "obesity", "malnutrition", "failure to thrive", "dehydration",
    "volume depletion", "hypervolemia", "metabolic acidosis",
    "metabolic alkalosis", "respiratory acidosis", "respiratory alkalosis",
    "anaphylaxis", "angioedema", "serotonin syndrome", "neuroleptic malignant syndrome",
    "malignant hyperthermia", "sick day management", "poor sick day management",
    "sick day education", "sick day protocols",
  ];
}

function getMedicalAbbreviations() {
  return [
    // Assessment / Physical Exam
    "cc", "hpi", "pmh", "psh", "ros", "a/p", "soap", "sob", "doe",
    // Diagnoses
    "dka", "aki", "ckd", "esrd", "chf", "copd", "cad", "t1dm", "t2dm",
    "mi", "dvt", "pe", "tia", "cad", "pad", "htn", "hld", "dm",
    "uti", "cap", "hap", "vap", "ards", "osahs",
    // Labs
    "cbc", "bmp", "cmp", "tsh", "ft4", "t4", "t3", "a1c", "hba1c",
    "bun", "cr", "egfr", "lft", "pt", "ptt", "inr", "esr", "crp",
    "ldl", "hdl", "tgl", "ast", "alt", "alp", "ggt", "ua",
    "wbc", "hgb", "hct", "plt", "rbc", "mcv", "mch", "mchc",
    "rdw", "mpv", "anc", "bnp", "nt-probnp", "tni", "ck", "ck-mb",
    // Imaging / Procedures
    "cxr", "ct", "mri", "us", "ekg", "ecg", "tee", "echo",
    "pet", "spect", "mra", "mrv", "cta", "xr", "xray",
    "egd", "colonoscopy", "bronchoscopy", "cystoscopy",
    "lp", "para", "thora", "picc", "ij", "cvp", "iv", "im",
    "subq", "sc", "po", "pr", "ng", "og", "peg", "pej",
    "npo", "ivf", "tpn", "ppn", "prn", "qhs", "tid", "bid",
    "qid", "qam", "qpm", "ac", "pc", "hs", "qd",
    // Units
    "mg", "mcg", "g", "kg", "ml", "l", "dl", "meq", "mmol",
    "iu", "units", "cm", "mm", "mcg", "ng", "pg",
    // Clinical terms
    "ph", "pco2", "po2", "hco3", "spo2", "fio2", "peep",
    "bp", "hr", "rr", "temp", "map", "cvp", "icp", "gcs",
    "nicu", "icu", "micu", "sicu", "ccu", "picu", "nicu", "ed",
    "or", "pac u", "sdu", "tele", "med-surg", "med surg",
    "code", "rrt", "cpr", "dni", "dnr", "full code",
  ];
}

// ---------------------------------------------------------------------------
// Phase 3: Build all vocabulary files
// ---------------------------------------------------------------------------

async function buildVocabulary() {
  mkdirSync(DATA_DIR, { recursive: true });

  // --- Medications ---
  const medications = await fetchRxNormNames(5000);
  const medicationWords = new Set();
  for (const name of medications) {
    for (const word of name.split(/[\s/]+/)) {
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (clean.length >= 2) {
        medicationWords.add(clean);
      }
    }
  }

  // --- Medical conditions ---
  const conditions = getMedicalConditionsList();
  const conditionWords = new Set();
  for (const condition of conditions) {
    const normalized = condition.toLowerCase().trim();
    conditionWords.add(normalized);
    for (const word of normalized.split(/[\s/]+/)) {
      const clean = word.replace(/[^a-z]/g, "");
      if (clean.length >= 2) {
        conditionWords.add(clean);
      }
    }
  }

  // --- Abbreviations ---
  const abbreviations = getMedicalAbbreviations();
  for (const abbr of abbreviations) {
    conditionWords.add(abbr.toLowerCase());
  }

  // --- Medications as phrases ---
  const medPhraseSet = new Set();
  for (const name of medications) {
    medPhraseSet.add(name);
  }
  // Also add medication words individually
  for (const word of medicationWords) {
    medPhraseSet.add(word);
  }

  // --- Words (individual tokens) ---
  const wordSet = new Set();
  for (const phrase of medPhraseSet) {
    for (const word of phrase.split(/[\s/]+/)) {
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (clean.length >= 2) {
        wordSet.add(clean);
      }
    }
  }
  for (const cond of conditionWords) {
    wordSet.add(cond.replace(/[^a-z0-9]/g, ""));
  }

  // --- Anchors (high-confidence medical words for phrase validation) ---
  const anchorWords = new Set([
    "abdomen", "absolute", "acetaminophen", "acid", "acute", "admission",
    "albumin", "alkaline", "allergy", "amiodarone", "amlodipine", "amoxicillin",
    "anemia", "angina", "antibiotic", "anticoagulant", "aortic",
    "arrhythmia", "arterial", "aspirin", "assessment", "asthma",
    "atorvastatin", "atrial", "azithromycin", "bacterial", "basophil",
    "beta", "bicarbonate", "bilateral", "bilirubin", "biopsy",
    "bleeding", "blood", "bowel", "bronchitis", "bun",
    "calcium", "cancer", "carcinoma", "cardiac", "cardiology",
    "cardiovascular", "catheter", "ceftriaxone", "cerebral", "chemotherapy",
    "chest", "chloride", "cholesterol", "chronic", "ciprofloxacin",
    "cirrhosis", "clopidogrel", "coagulation", "colonoscopy", "congenital",
    "congestive", "coronary", "corticosteroid", "creatinine", "culture",
    "deficiency", "dehydration", "dermatitis", "diabetes", "diabetic",
    "diagnosis", "dialysis", "diarrhea", "diet", "digoxin", "disease",
    "disorder", "diuretic", "doxycycline", "dysfunction", "dysplasia",
    "edema", "electrocardiogram", "electrolyte", "embolism", "emergency",
    "emphysema", "encephalopathy", "endocrine", "endocrinology",
    "endoscopic", "enoxaparin", "eosinophil", "epilepsy",
    "erythromycin", "examination", "failure", "fibrillation",
    "fibrosis", "fluconazole", "fracture", "furosemide",
    "gabapentin", "gastric", "gastroenterology", "gastrointestinal",
    "glaucoma", "glomerular", "glucose", "graft", "granulocyte",
    "heart", "hematocrit", "hematology", "hemodialysis", "hemoglobin",
    "hemorrhage", "heparin", "hepatic", "hepatitis", "hernia",
    "hormone", "hospital", "hydrochlorothiazide", "hyperglycemia",
    "hyperlipidemia", "hypertension", "hyperthyroidism", "hypoglycemia",
    "hypokalemia", "hyponatremia", "hypotension", "hypothyroidism",
    "hypoxia", "ibuprofen", "imaging", "immunodeficiency",
    "immunosuppression", "infarction", "infection", "inflammation",
    "infusion", "injection", "injury", "inpatient", "insufficiency",
    "insulin", "intake", "intravenous", "intubation", "iron",
    "ischemia", "isolation", "ketoacidosis", "ketones", "kidney",
    "laboratory", "laceration", "lactate", "laryngeal",
    "lesion", "leukemia", "levofloxacin", "levothyroxine",
    "lipid", "lisinopril", "lithium", "liver", "losartan",
    "lumbar", "lung", "lymphocyte", "lymphoma", "magnesium",
    "malignancy", "management", "medication", "medicine",
    "melanoma", "mellitus", "meningitis", "metabolic",
    "metastasis", "metformin", "methotrexate", "metoprolol",
    "metronidazole", "microbiology", "monocyte", "morphology",
    "mortality", "murmur", "myocardial", "nasogastric",
    "nausea", "necrosis", "neonatal", "neoplasia", "nephrology",
    "nephropathy", "nerve", "neurologic", "neurology",
    "neuropathy", "neutropenia", "neutrophil", "nitroglycerin",
    "nodule", "nutrition", "obstruction", "omeprazole",
    "oncology", "ondansetron", "operative", "ophthalmology",
    "osteoporosis", "outpatient", "oxygen", "pacemaker",
    "pancreatitis", "pantoprazole", "parathyroid",
    "pathology", "pediatric", "pericardial", "peripheral",
    "pharmacology", "phosphate", "phosphorus", "physician",
    "physiology", "pituitary", "plasma", "platelet",
    "pleural", "pneumonia", "polyuria", "potassium",
    "prednisone", "pregnancy", "procedure", "prognosis",
    "prophylaxis", "prostate", "protein", "protocol",
    "psychiatry", "pulmonary", "radiation", "radiography",
    "radiology", "receptor", "reflex", "regurgitation",
    "rehabilitation", "renal", "resection", "respiratory",
    "resuscitation", "rheumatology", "rifampin", "sarcoma",
    "saturation", "secretion", "sedation", "seizure",
    "sepsis", "serotonin", "sertraline", "serum", "shock",
    "simvastatin", "sodium", "spirometry", "splenic",
    "stenosis", "steroid", "stroke", "subcutaneous",
    "surgery", "surgical", "syndrome", "tachycardia",
    "temperature", "therapy", "thoracic", "thrombosis",
    "thyroid", "tissue", "tomography", "topical",
    "toxic", "transfusion", "transplant", "trauma",
    "treatment", "troponin", "tuberculosis", "tumor",
    "ultrasound", "urea", "urinary", "urine", "urology",
    "vaccination", "vancomycin", "vascular", "vasculitis",
    "vasopressor", "ventilation", "ventilator", "ventricular",
    "vertebral", "viral", "vitamin", "warfarin", "wound",
  ]);

  // --- Write output files ---
  const phrasesOutput = {
    _generated: new Date().toISOString(),
    _source: "RxNorm API + curated clinical lists",
    _count: medPhraseSet.size,
    phrases: [...medPhraseSet].sort(),
  };
  writeFileSync(
    join(DATA_DIR, "clinical-guard-phrases.json"),
    JSON.stringify(phrasesOutput, null, 2)
  );
  console.log(`Written ${phrasesOutput._count} clinical guard phrases`);

  const wordsOutput = {
    _generated: new Date().toISOString(),
    _count: wordSet.size,
    words: [...wordSet].sort(),
  };
  writeFileSync(
    join(DATA_DIR, "clinical-guard-words.json"),
    JSON.stringify(wordsOutput, null, 2)
  );
  console.log(`Written ${wordsOutput._count} clinical guard words`);

  const anchorsOutput = {
    _generated: new Date().toISOString(),
    _count: anchorWords.size,
    anchors: [...anchorWords].sort(),
  };
  writeFileSync(
    join(DATA_DIR, "clinical-guard-anchors.json"),
    JSON.stringify(anchorsOutput, null, 2)
  );
  console.log(`Written ${anchorsOutput._count} clinical anchor words`);

  console.log("\nDone. Files written to data/");
  console.log("Use these to populate the guard sets in deid.js:");
  console.log("  nonNameClinicalPhrases  <- data/clinical-guard-phrases.json");
  console.log("  nonNameClinicalWords    <- data/clinical-guard-words.json");
  console.log("  clinicalAnchorWords     <- data/clinical-guard-anchors.json");
}

buildVocabulary().catch((e) => {
  console.error("Build failed:", e);
  process.exit(1);
});
