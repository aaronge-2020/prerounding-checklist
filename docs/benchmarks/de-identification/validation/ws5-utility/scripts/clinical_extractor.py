#!/usr/bin/env python3
"""Deterministic clinical-concept extractor (LOWER-BOUND PROXY).

Matches curated phrase lists (diagnoses, symptoms, medications, procedures,
lab analytes) against note text with word-boundary, case-insensitive matching,
longest-phrase-first with non-overlapping spans. This is NOT a trained
biomedical NER model: it cannot resolve abbreviations, synonyms, or novel
phrasings, so agreement measured with it is a conservative lower bound on how
much clinical meaning survives redaction. The primary retention metric
(measure_utility.py) additionally checks authored ground-truth concepts by
direct string search, which does not depend on this extractor.
"""
import re

DIAGNOSES = [
    "type 2 diabetes mellitus", "type 1 diabetes mellitus", "hypertension",
    "heart failure with reduced ejection fraction", "heart failure with preserved ejection fraction",
    "atrial fibrillation", "atrial flutter", "coronary artery disease", "chronic obstructive pulmonary disease",
    "asthma", "chronic kidney disease stage 3", "chronic kidney disease", "community-acquired pneumonia",
    "pneumonia", "acute kidney injury", "urinary tract infection", "cellulitis", "gout", "osteoarthritis",
    "hypothyroidism", "hyperlipidemia", "gastroesophageal reflux disease", "major depressive disorder",
    "generalized anxiety disorder", "obstructive sleep apnea", "anemia of chronic disease",
    "iron deficiency anemia", "deep vein thrombosis", "pulmonary embolism", "ischemic stroke",
    "transient ischemic attack", "liver cirrhosis", "peptic ulcer disease", "benign prostatic hyperplasia",
    "rheumatoid arthritis", "osteoporosis", "vitamin d deficiency", "vitamin b12 deficiency",
    "chronic low back pain", "allergic rhinitis", "aortic stenosis", "mitral regurgitation",
    "peripheral artery disease", "diverticulitis", "acute cholecystitis", "acute pancreatitis",
    "parkinson disease", "epilepsy", "migraine without aura", "migraine", "psoriasis", "eczema",
    "sepsis", "bacteremia", "hyponatremia", "hyperkalemia", "hypokalemia", "metabolic acidosis",
    "diabetic ketoacidosis", "pleural effusion", "pneumothorax", "ascites", "sinusitis", "bronchitis",
    "influenza", "covid-19 infection", "inguinal hernia", "hematuria", "acute appendicitis",
    "heart failure", "diabetes mellitus", "depression", "anxiety",
]
SYMPTOMS = [
    "chest pain", "shortness of breath", "dyspnea on exertion", "orthopnea",
    "paroxysmal nocturnal dyspnea", "productive cough", "cough", "fever", "chills", "night sweats",
    "nausea", "vomiting", "abdominal pain", "diarrhea", "constipation", "headache", "dizziness",
    "lightheadedness", "syncope", "fatigue", "generalized weakness", "weakness", "palpitations",
    "leg swelling", "ankle edema", "pedal edema", "wheezing", "sore throat", "back pain", "joint pain",
    "muscle aches", "myalgia", "arthralgia", "numbness", "tingling in the feet", "tingling",
    "blurred vision", "unintentional weight loss", "weight loss", "loss of appetite",
    "increased thirst", "frequent urination", "burning with urination", "dysuria", "flank pain",
    "rash", "itching", "insomnia", "confusion", "tremor", "nosebleeds", "epistaxis", "easy bruising",
    "chest tightness", "decreased urine output", "nocturia", "hemoptysis", "diplopia", "tinnitus",
    "dysphagia", "odynophagia", "melena", "hematochezia", "rhinorrhea",
]
MEDICATIONS = [
    "metformin", "lisinopril", "atorvastatin", "furosemide", "apixaban", "albuterol",
    "insulin glargine", "insulin lispro", "levothyroxine", "amlodipine", "metoprolol succinate",
    "metoprolol", "losartan", "hydrochlorothiazide", "omeprazole", "sertraline", "gabapentin",
    "tramadol", "acetaminophen", "ibuprofen", "warfarin", "clopidogrel", "aspirin", "duloxetine",
    "escitalopram", "pantoprazole", "potassium chloride", "spironolactone", "carvedilol", "digoxin",
    "allopurinol", "colchicine", "prednisone", "azithromycin", "amoxicillin-clavulanate",
    "ciprofloxacin", "cephalexin", "vancomycin", "piperacillin-tazobactam", "semaglutide",
    "empagliflozin", "dapagliflozin", "rosuvastatin", "ezetimibe", "tamsulosin", "finasteride",
    "ondansetron", "loratadine", "fluticasone", "tiotropium", "salmeterol-fluticasone",
    "levetiracetam", "lamotrigine", "quetiapine", "trazodone", "melatonin", "vitamin d3",
    "ferrous sulfate", "cyanocobalamin", "folic acid", "calcium carbonate",
]
PROCEDURES = [
    "cardiac catheterization", "coronary angiography",
    "percutaneous coronary intervention with drug-eluting stent", "percutaneous coronary intervention",
    "transthoracic echocardiogram", "echocardiogram", "stress echocardiogram", "electrocardiogram",
    "coronary artery bypass grafting", "chest ct", "ct angiography of the chest",
    "bronchoscopy", "pulmonary function testing", "colonoscopy", "esophagogastroduodenoscopy",
    "paracentesis", "thoracentesis", "lumbar puncture", "hemodialysis",
    "central venous catheter placement", "arterial line placement", "endotracheal intubation",
    "mechanical ventilation", "laparoscopic cholecystectomy", "cholecystectomy", "appendectomy",
    "inguinal hernia repair", "total knee arthroplasty", "total hip arthroplasty",
    "cataract extraction", "skin biopsy", "bone marrow biopsy", "liver biopsy", "kidney biopsy",
    "cystoscopy", "cardiac mri", "brain mri", "abdominal ultrasound", "renal ultrasound",
    "carotid duplex ultrasound", "lower extremity venous doppler", "electromyography",
    "electroencephalogram", "sleep study", "nuclear cardiac stress test", "cardiac stress test",
    "holter monitoring", "pacemaker placement", "cardioversion", "joint aspiration",
    "corticosteroid injection", "blood transfusion", "platelet transfusion", "wound debridement",
    "incision and drainage", "peripherally inserted central catheter placement", "blood cultures",
    "urine culture",
]
LAB_ANALYTES = [
    "hemoglobin a1c", "estimated glomerular filtration rate", "blood urea nitrogen",
    "white blood cell count", "platelet count", "b-type natriuretic peptide", "nt-probnp",
    "troponin i", "high-sensitivity troponin", "ldl cholesterol", "total cholesterol",
    "triglycerides", "thyroid stimulating hormone", "free t4", "c-reactive protein",
    "erythrocyte sedimentation rate", "d-dimer", "lactate", "arterial ph", "bicarbonate",
    "anion gap", "calcium", "magnesium", "phosphorus", "albumin", "total bilirubin",
    "alkaline phosphatase", "vitamin d 25-oh", "vitamin b12", "ferritin", "iron saturation",
    "procalcitonin", "sodium", "potassium", "creatinine", "glucose", "hemoglobin",
    "hematocrit", "inr", "aptt", "ast", "alt", "urinalysis",
]

_VOCAB = []
for _p in DIAGNOSES: _VOCAB.append((_p, "diagnosis"))
for _p in SYMPTOMS: _VOCAB.append((_p, "symptom"))
for _p in MEDICATIONS: _VOCAB.append((_p, "medication"))
for _p in PROCEDURES: _VOCAB.append((_p, "procedure"))
for _p in LAB_ANALYTES: _VOCAB.append((_p, "lab"))
_VOCAB.sort(key=lambda x: -len(x[0]))

_PATTERNS = [(re.compile(r"(?<![A-Za-z0-9])" + re.escape(p) + r"(?![A-Za-z0-9])", re.IGNORECASE), p, c)
            for p, c in _VOCAB]

def extract(text):
    """Return a set of (phrase, category) found in text (non-overlapping, longest-first)."""
    found = set()
    claimed = []
    for rx, phrase, cat in _PATTERNS:
        for m in rx.finditer(text):
            s, e = m.start(), m.end()
            if any(s < ce and e > cs for cs, ce in claimed):
                continue
            claimed.append((s, e))
            found.add((phrase, cat))
    return found
