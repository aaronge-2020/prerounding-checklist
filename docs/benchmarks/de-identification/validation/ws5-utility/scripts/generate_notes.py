#!/usr/bin/env python3
"""Generate 40 synthetic clinical notes with character-offset PHI ground truth
and authored clinical-concept ground truth.

ALL notes are synthetic: invented patients, invented clinical prose, invented
PHI. No real patient data anywhere.

Output: data/notes.jsonl — one JSON object per line:
  { id, note_type, text, phi_spans: [{start,end,text,category}],
    clinical_concepts: [{text, category}] }
PHI categories: PATIENT_NAME, PROVIDER_NAME, CONTACT_NAME, DOB, DATE, PHONE,
  EMAIL, ADDRESS, MRN, ENCOUNTER_ID, ID, APP_BUCKET (facility/org names the
  app redacts by design though they are not Safe Harbor identifiers).
Concept categories: diagnosis, symptom, medication, procedure, lab.
"""
import json, random, os

SEED = 20260929
rng = random.Random(SEED)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "notes.jsonl")

FIRST = ["James","Maria","Robert","Linda","Michael","Sarah","David","Jennifer","William","Elizabeth",
         "Thomas","Patricia","Charles","Susan","Daniel","Karen","Matthew","Nancy","Anthony","Lisa",
         "Kevin","Michelle","Jason","Angela","Jeffrey","Brenda","Ryan","Emma","Jacob","Olivia",
         "Ethan","Sophia","Mason","Isabella","Logan","Mia","Lucas","Amelia","Alexander","Harper",
         "Benjamin","Evelyn","Samuel","Abigail","Henry","Ella","Christian","Scarlett","Nathan","Grace",
         "Marcus","Denise","Victor","Renee","Philip","Carmen","Andre","Lucille","Derek","Monica"]
LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
        "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
        "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
        "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
        "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
        "Turner","Phillips","Parker","Evans","Edwards","Collins","Stewart","Morris","Rogers","Reed",
        "Cook","Morgan","Bell","Murphy","Bailey","Rivera","Cooper","Richardson","Cox","Howard"]
PROV_FIRST = ["Emily","James","Priya","Michael","Sarah","David","Lisa","Robert","Anna","Kevin",
              "Rachel","Thomas","Nina","Daniel","Laura","Steven","Meera","Brian","Karen","Alan"]
PROV_LAST = ["Carter","Wilson","Sharma","Patel","Nguyen","Kim","Brooks","Foster","Reyes","Barnes",
             "Coleman","Hayes","Fisher","Gibson","Ellis","Harrison","Mcdonald","Ramos","Wells","Choi"]
STREETS = ["Oak Street","Maple Avenue","Cedar Lane","Pine Road","Elm Drive","Washington Boulevard",
           "Park Avenue","Main Street","Church Road","Hillcrest Drive","Lakeview Terrace","River Road",
           "Meadow Lane","Forest Avenue","Highland Avenue","Cherry Street","Walnut Drive","School Lane"]
CITIES = [("Baltimore","MD","21201"),("Columbia","MD","21044"),("Silver Spring","MD","20910"),
          ("Frederick","MD","21701"),("Rockville","MD","20850"),("Annapolis","MD","21401"),
          ("Towson","MD","21204"),("Gaithersburg","MD","20878"),("Bowie","MD","20715"),
          ("Hagerstown","MD","21740")]
HOSPITALS = ["Harborview Medical Center","Lakeside General Hospital","Riverside Community Hospital",
             "Northgate Medical Center","Cedar Park Hospital"]
SPECIALTIES = ["Cardiology","Pulmonology","Nephrology","Endocrinology","Gastroenterology","Neurology",
               "Infectious Disease","Hematology","Rheumatology","Primary Care"]

DIAGNOSES = ["type 2 diabetes mellitus","hypertension","heart failure with reduced ejection fraction",
             "heart failure with preserved ejection fraction","atrial fibrillation","coronary artery disease",
             "chronic obstructive pulmonary disease","asthma","chronic kidney disease stage 3",
             "community-acquired pneumonia","acute kidney injury","urinary tract infection","cellulitis",
             "gout","osteoarthritis","hypothyroidism","hyperlipidemia","gastroesophageal reflux disease",
             "major depressive disorder","generalized anxiety disorder","obstructive sleep apnea",
             "anemia of chronic disease","iron deficiency anemia","deep vein thrombosis","pulmonary embolism",
             "ischemic stroke","transient ischemic attack","liver cirrhosis","peptic ulcer disease",
             "benign prostatic hyperplasia","rheumatoid arthritis","osteoporosis","vitamin D deficiency",
             "chronic low back pain","allergic rhinitis","atrial flutter","aortic stenosis","mitral regurgitation",
             "peripheral artery disease","diverticulitis","acute cholecystitis","acute pancreatitis",
             "Parkinson disease","epilepsy","migraine without aura","psoriasis","sepsis","bacteremia",
             "hyponatremia","hyperkalemia","metabolic acidosis","diabetic ketoacidosis","pleural effusion"]
SYMPTOMS = ["chest pain","shortness of breath","dyspnea on exertion","orthopnea",
            "paroxysmal nocturnal dyspnea","cough","productive cough","fever","chills","night sweats",
            "nausea","vomiting","abdominal pain","diarrhea","constipation","headache","dizziness",
            "lightheadedness","syncope","fatigue","generalized weakness","palpitations","leg swelling",
            "ankle edema","wheezing","sore throat","back pain","joint pain","muscle aches","numbness",
            "tingling in the feet","blurred vision","unintentional weight loss","loss of appetite",
            "increased thirst","frequent urination","burning with urination","flank pain","rash",
            "itching","insomnia","confusion","tremor","nosebleeds","easy bruising"]
MEDS = [("metformin","1000 mg","twice daily"),("lisinopril","10 mg","daily"),
        ("atorvastatin","40 mg","at bedtime"),("furosemide","40 mg","twice daily"),
        ("apixaban","5 mg","twice daily"),("albuterol","90 mcg per inhalation, 2 puffs","every 4 hours as needed"),
        ("insulin glargine","22 units","at bedtime"),("levothyroxine","75 mcg","daily"),
        ("amlodipine","5 mg","daily"),("metoprolol succinate","50 mg","daily"),
        ("losartan","50 mg","daily"),("hydrochlorothiazide","25 mg","daily"),
        ("omeprazole","20 mg","daily"),("sertraline","100 mg","daily"),
        ("gabapentin","300 mg","three times daily"),("tramadol","50 mg","every 6 hours as needed"),
        ("acetaminophen","650 mg","every 6 hours as needed"),("ibuprofen","400 mg","every 6 hours as needed"),
        ("warfarin","5 mg","daily"),("clopidogrel","75 mg","daily"),("aspirin","81 mg","daily"),
        ("duloxetine","60 mg","daily"),("escitalopram","10 mg","daily"),
        ("pantoprazole","40 mg","daily"),("potassium chloride","20 mEq","daily"),
        ("spironolactone","25 mg","daily"),("carvedilol","12.5 mg","twice daily"),
        ("digoxin","0.125 mg","daily"),("allopurinol","100 mg","daily"),
        ("colchicine","0.6 mg","daily"),("prednisone","10 mg","daily"),
        ("azithromycin","500 mg","daily for 3 days"),("amoxicillin-clavulanate","875 mg","twice daily"),
        ("ciprofloxacin","500 mg","twice daily"),("cephalexin","500 mg","four times daily"),
        ("insulin lispro","8 units","with meals"),("semaglutide","1 mg","weekly by injection"),
        ("empagliflozin","10 mg","daily"),("rosuvastatin","20 mg","at bedtime"),
        ("ezetimibe","10 mg","daily"),("tamsulosin","0.4 mg","daily"),
        ("ondansetron","4 mg","every 6 hours as needed"),("loratadine","10 mg","daily"),
        ("tiotropium","18 mcg","daily by inhalation"),("levetiracetam","500 mg","twice daily"),
        ("quetiapine","50 mg","at bedtime"),("trazodone","50 mg","at bedtime as needed"),
        ("vitamin D3","2000 IU","daily"),("ferrous sulfate","325 mg","daily"),
        ("folic acid","1 mg","daily"),("vancomycin","1250 mg","intravenously every 12 hours"),
        ("piperacillin-tazobactam","3.375 g","intravenously every 6 hours")]
PROCEDURES = ["cardiac catheterization","coronary angiography",
              "percutaneous coronary intervention with drug-eluting stent","transthoracic echocardiogram",
              "electrocardiogram","chest CT","CT angiography of the chest","bronchoscopy",
              "pulmonary function testing","colonoscopy","esophagogastroduodenoscopy","paracentesis",
              "thoracentesis","lumbar puncture","hemodialysis","central venous catheter placement",
              "endotracheal intubation","laparoscopic cholecystectomy","appendectomy",
              "total knee arthroplasty","cystoscopy","cardiac MRI","brain MRI","abdominal ultrasound",
              "renal ultrasound","carotid duplex ultrasound","lower extremity venous Doppler",
              "nuclear cardiac stress test","Holter monitoring","cardioversion","joint aspiration",
              "corticosteroid injection","blood transfusion","wound debridement","incision and drainage",
              "peripherally inserted central catheter placement","arterial line placement"]
LABS = [("hemoglobin A1c","8.4","%"),("sodium","139","mmol/L"),("potassium","4.2","mmol/L"),
        ("creatinine","1.3","mg/dL"),("estimated glomerular filtration rate","58","mL/min"),
        ("blood urea nitrogen","24","mg/dL"),("glucose","212","mg/dL"),
        ("white blood cell count","11.4","K/uL"),("hemoglobin","11.2","g/dL"),
        ("hematocrit","33.8","%"),("platelet count","245","K/uL"),("troponin I","0.06","ng/mL"),
        ("B-type natriuretic peptide","1240","pg/mL"),("LDL cholesterol","118","mg/dL"),
        ("total cholesterol","196","mg/dL"),("triglycerides","164","mg/dL"),
        ("thyroid stimulating hormone","2.4","mIU/L"),("C-reactive protein","48","mg/L"),
        ("erythrocyte sedimentation rate","32","mm/hr"),("D-dimer","1.8","mcg/mL"),
        ("lactate","2.1","mmol/L"),("bicarbonate","21","mmol/L"),("anion gap","14",""),
        ("calcium","9.1","mg/dL"),("magnesium","2.0","mg/dL"),("phosphorus","3.4","mg/dL"),
        ("albumin","3.6","g/dL"),("total bilirubin","1.1","mg/dL"),("AST","42","U/L"),
        ("ALT","38","U/L"),("alkaline phosphatase","88","U/L"),("INR","1.1",""),
        ("vitamin D 25-OH","18","ng/mL"),("vitamin B12","320","pg/mL"),
        ("ferritin","88","ng/mL"),("procalcitonin","0.8","ng/mL"),
        ("NT-proBNP","2840","pg/mL"),("potassium","5.1","mmol/L"),("sodium","131","mmol/L"),
        ("creatinine","2.1","mg/dL"),("glucose","96","mg/dL"),("hemoglobin A1c","7.1","%"),
        ("white blood cell count","14.2","K/uL"),("hemoglobin","9.4","g/dL")]

DENIES = ["chest pain","shortness of breath","fever","chills","nausea","vomiting","abdominal pain",
          "headache","dizziness","palpitations","leg swelling","cough","sore throat","rash"]
ROS_EXTRA = ["nocturia","dysuria","hematuria","melena","hematochezia","hemoptysis","diplopia",
             "tinnitus","otalgia","rhinorrhea","dysphagia","odynophagia","arthralgia","myalgia"]

class NB:
    def __init__(self):
        self.parts = []
        self.concepts = []
    def t(self, s):
        self.parts.append((s, None)); return self
    def p(self, s, cat):
        self.parts.append((s, cat)); return self
    def c(self, s, cat):
        self.concepts.append((s, cat)); return self
    def build(self):
        text = "".join(s for s, _ in self.parts)
        spans, off = [], 0
        for s, cat in self.parts:
            if cat:
                spans.append({"start": off, "end": off + len(s), "text": s, "category": cat})
            off += len(s)
        seen, concepts = set(), []
        for s, cat in self.concepts:
            key = (s.lower(), cat)
            if key not in seen:
                seen.add(key); concepts.append({"text": s, "category": cat})
        return text, spans, concepts

def full_name():
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"

def dob_str():
    y = rng.randint(1944, 1992); m = rng.randint(1, 12); d = rng.randint(1, 28)
    return f"{m:02d}/{d:02d}/{y}", y

def date_str(y=2026, m_lo=1, m_hi=9):
    m = rng.randint(m_lo, m_hi); d = rng.randint(1, 28)
    style = rng.random()
    if style < 0.5: return f"{m:02d}/{d:02d}/{y}"
    if style < 0.8:
        months = ["January","February","March","April","May","June","July","August","September"]
        return f"{months[m-1]} {d}, {y}"
    return f"{m}/{d}/{y % 100}"

def phone():
    return f"{rng.choice(['410','301','443'])}-555-{rng.randint(100,199):03d}{rng.randint(0,9)}"

def address():
    num = rng.randint(101, 9899); street = rng.choice(STREETS); city, st, zipc = rng.choice(CITIES)
    return f"{num} {street}, {city}, {st} {zipc}"

def email(first, last):
    return f"{first.lower()}.{last.lower()}{rng.randint(2,98)}@example.com"

def med_line():
    name, dose, freq = rng.choice(MEDS)
    line = f"{name} {dose} {freq}"
    return line, name

# ---------------- templates ----------------
def ds_cardiac(nb, case):
    nb.t("DISCHARGE SUMMARY\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME"); nb.t("\n")
    nb.t("DOB: "); nb.p(case["dob"], "DOB"); nb.t(f"   Age: {case['age']}   Sex: {case['sex']}\n")
    nb.t("MRN: "); nb.p(case["mrn"], "MRN"); nb.t("\n")
    nb.t("Admission Date: "); nb.p(case["admit"], "DATE"); nb.t("   Discharge Date: "); nb.p(case["discharge"], "DATE"); nb.t("\n")
    nb.t("Attending Physician: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n")
    nb.t("Facility: "); nb.p(case["hospital"], "APP_BUCKET"); nb.t("\n\n")
    s1, s2 = rng.sample(SYMPTOMS, 2)
    nb.t("CHIEF COMPLAINT: "); nb.c(s1, "symptom"); nb.t(s1 + "\n\n")
    nb.t("HISTORY OF PRESENT ILLNESS:\n")
    nb.t(f"{case['age']}-year-old {case['man_woman']} with ")
    dxs = rng.sample(DIAGNOSES, 3)
    nb.t(", ".join(dxs[:-1]) + ", and " + dxs[-1])
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f" presented with {s1} and {s2}. ")
    nb.c(s2, "symptom")
    nb.t(f"Symptoms began {rng.randint(2,6)} days prior to admission and progressively worsened. ")
    nb.t(f"On arrival the patient was in mild distress. {case['HeShe']} denied ")
    nb.t(", ".join(rng.sample(DENIES, 3)) + ". ")
    nb.t(f"No recent travel, sick contacts, or known exposures.\n\n")
    nb.t("PAST MEDICAL HISTORY: " + "; ".join(d.title() for d in dxs) + ".\n\n")
    nb.t("HOME MEDICATIONS:\n")
    for _ in range(rng.randint(5, 7)):
        line, name = med_line(); nb.t("- " + line + "\n"); nb.c(line, "medication")
    nb.t("\nHOSPITAL COURSE:\n")
    proc = rng.choice(PROCEDURES)
    nb.t(f"Admitted on "); nb.p(case["admit"], "DATE")
    nb.t(f" for acute decompensation. {proc.title()} performed on ")
    nb.p(case["proc_date"], "DATE"); nb.t(" showed ")
    nb.c(proc, "procedure")
    nb.t(rng.choice(["no acute obstructive disease. ", "severe multivessel disease. ", "a reduced ejection fraction of 35 percent. "]))
    nb.t("Diuresed with good response. Labs on discharge: ")
    labs = rng.sample(LABS, 4)
    lab_phrases = []
    for an, val, unit in labs:
        ph = f"{an} {val} {unit}".strip(); lab_phrases.append(ph); nb.c(ph, "lab")
    nb.t("; ".join(lab_phrases) + ". ")
    nb.t(f"Discharged in stable condition on "); nb.p(case["discharge"], "DATE"); nb.t(".\n\n")
    nb.t("DISCHARGE MEDICATIONS:\n")
    for _ in range(rng.randint(4, 6)):
        line, name = med_line(); nb.t("- " + line + "\n"); nb.c(line, "medication")
    nb.t("\nDISCHARGE INSTRUCTIONS:\n")
    nb.t(f"Follow up with Dr. "); nb.p(case["pcp"], "PROVIDER_NAME")
    nb.t(f" in {rng.randint(1,3)} weeks. Low-salt diet, daily weights, and medication adherence reviewed. ")
    nb.t("Return for worsening "); nb.c(s1, "symptom"); nb.t(s1 + ", ")
    nb.c(s2, "symptom"); nb.t(s2 + ", or fever. ")
    nb.t("Questions: call "); nb.p(case["phone"], "PHONE"); nb.t(".\n\n")
    nb.t("Electronically signed by Dr. "); nb.p(case["attending"], "PROVIDER_NAME")
    nb.t(" on "); nb.p(case["discharge"], "DATE"); nb.t(".")

def ds_pneumonia(nb, case):
    nb.t("DISCHARGE SUMMARY\n\n")
    nb.t("Patient Name: "); nb.p(case["name"], "PATIENT_NAME")
    nb.t("   DOB: "); nb.p(case["dob"], "DOB"); nb.t("\n")
    nb.t("MRN "); nb.p(case["mrn"], "MRN")
    nb.t("   Encounter ID "); nb.p(case["enc"], "ENCOUNTER_ID"); nb.t("\n")
    nb.t("Admit Date: "); nb.p(case["admit"], "DATE")
    nb.t("   Discharge Date: "); nb.p(case["discharge"], "DATE"); nb.t("\n")
    nb.t("Attending: Dr. "); nb.p(case["attending"], "PROVIDER_NAME")
    nb.t(", "); nb.t(rng.choice(SPECIALTIES)); nb.t("\n")
    nb.t("Hospital: "); nb.p(case["hospital"], "APP_BUCKET"); nb.t("\n\n")
    nb.t("REASON FOR ADMISSION: community-acquired pneumonia\n")
    nb.c("community-acquired pneumonia", "diagnosis")
    nb.t("\nHISTORY OF PRESENT ILLNESS:\n")
    s = rng.sample(["fever", "cough", "productive cough", "shortness of breath", "chills", "chest pain"], 3)
    for x in s: nb.c(x, "symptom")
    nb.t(f"{case['age']}-year-old {case['man_woman']} with ")
    dxs = rng.sample(DIAGNOSES, 3)
    nb.t(", ".join(dxs) + " ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"presented with {s[0]}, {s[1]}, and {s[2]} for {rng.randint(3,7)} days. ")
    nb.t(f"Initial vitals: temperature 101.{rng.randint(1,9)} F, heart rate {rng.randint(95,118)}, ")
    nb.t(f"respiratory rate {rng.randint(20,28)}, oxygen saturation {rng.randint(88,93)} percent on room air. ")
    nb.t(f"Chest CT on "); nb.p(case["proc_date"], "DATE")
    nb.t(" demonstrated right lower lobe consolidation. ")
    nb.c("chest CT", "procedure")
    nb.t("Blood cultures drawn; ")
    nb.c("blood cultures", "procedure")
    an, val, unit = rng.choice(LABS); ph = f"{an} {val} {unit}".strip()
    nb.t(f"{ph} on admission. ")
    nb.c(ph, "lab")
    nb.t("\n\nHOSPITAL COURSE:\nTreated with ")
    m1, _ = med_line(); m2, _ = med_line()
    nb.t(m1 + " and " + m2 + ". ")
    nb.c(m1, "medication"); nb.c(m2, "medication")
    nb.t(f"Required {rng.randint(2,4)} liters nasal cannula initially, weaned to room air by hospital day {rng.randint(2,4)}. ")
    nb.t("Respiratory status improved steadily. Repeat labs: ")
    labs = rng.sample(LABS, 3)
    nb.t("; ".join(f"{a} {v} {u}".strip() for a, v, u in labs) + ". ")
    for a, v, u in labs: nb.c(f"{a} {v} {u}".strip(), "lab")
    nb.t("\n\nDISCHARGE MEDICATIONS:\n")
    for _ in range(rng.randint(4, 6)):
        line, name = med_line(); nb.t("- " + line + "\n"); nb.c(line, "medication")
    nb.t("\nFOLLOW-UP:\nPrimary care with Dr. "); nb.p(case["pcp"], "PROVIDER_NAME")
    nb.t(f" in 1 week. Repeat chest imaging in 6 weeks to document resolution. ")
    nb.t("Patient verbalized understanding. Emergency contact: ")
    nb.p(case["contact"], "CONTACT_NAME"); nb.t(", "); nb.p(case["contact_phone"], "PHONE"); nb.t(".\n\n")
    nb.t("Dictated by Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t(".")

def ds_surgical(nb, case):
    nb.t("DISCHARGE SUMMARY\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME"); nb.t("\n")
    nb.t("DOB "); nb.p(case["dob"], "DOB")
    nb.t("   MRN "); nb.p(case["mrn"], "MRN"); nb.t("\n")
    nb.t("Date of Admission: "); nb.p(case["admit"], "DATE")
    nb.t("   Date of Discharge: "); nb.p(case["discharge"], "DATE"); nb.t("\n")
    nb.t("Surgeon: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n")
    nb.t("Facility: "); nb.p(case["hospital"], "APP_BUCKET"); nb.t("\n\n")
    proc = rng.choice(["laparoscopic cholecystectomy", "appendectomy", "inguinal hernia repair",
                       "total knee arthroplasty", "cystoscopy"])
    nb.c(proc, "procedure")
    nb.t("PREOPERATIVE DIAGNOSIS: ")
    pdx = {"laparoscopic cholecystectomy": "acute cholecystitis", "appendectomy": "acute appendicitis",
           "inguinal hernia repair": "inguinal hernia", "total knee arthroplasty": "osteoarthritis",
           "cystoscopy": "hematuria"}[proc]
    nb.t(pdx + "\n"); nb.c(pdx, "diagnosis")
    nb.t("POSTOPERATIVE DIAGNOSIS: same\n\n")
    nb.t("HISTORY:\n")
    s = rng.sample(["abdominal pain", "nausea", "vomiting", "fever"], 3)
    for x in s: nb.c(x, "symptom")
    nb.t(f"{case['age']}-year-old {case['man_woman']} presented with {s[0]}, {s[1]}, and {s[2]}. ")
    nb.t("Imaging confirmed the diagnosis. Past medical history includes ")
    dxs = rng.sample(DIAGNOSES, 2)
    nb.t(" and ".join(dxs) + ". ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"Home medications include ")
    mh = [med_line()[0] for _ in range(3)]
    nb.t(", ".join(mh) + ". ")
    for m in mh: nb.c(m, "medication")
    nb.t(f"Allergies: {rng.choice(['no known drug allergies', 'penicillin (rash)', 'sulfa drugs (hives)'])}. ")
    nb.t("Review of systems otherwise negative except as noted above.\n\n")
    nb.t("PHYSICAL EXAMINATION:\n")
    nb.t("Vital signs stable. General: no acute distress. ")
    nb.t("Abdomen: tender in the right upper quadrant with a positive Murphy sign. ")
    nb.t("No rebound or guarding. Bowel sounds present. Skin warm and dry.\n\n")
    nb.t("OPERATIVE COURSE:\n")
    nb.t(f"{proc.title()} performed on "); nb.p(case["proc_date"], "DATE")
    nb.t(" without complication. Estimated blood loss minimal. ")
    nb.t("Tolerated the procedure well and recovered in the post-anesthesia care unit. ")
    nb.t("Postoperative labs: ")
    labs = rng.sample(LABS, 3)
    nb.t("; ".join(f"{a} {v} {u}".strip() for a, v, u in labs) + ". ")
    for a, v, u in labs: nb.c(f"{a} {v} {u}".strip(), "lab")
    nb.t("Pain controlled on oral analgesics. Ambulating with assistance. ")
    nb.t("Wound clean, dry, and intact.\n\n")
    nb.t("DISCHARGE MEDICATIONS:\n")
    for _ in range(rng.randint(3, 5)):
        line, name = med_line(); nb.t("- " + line + "\n"); nb.c(line, "medication")
    nb.t("\nDISCHARGE INSTRUCTIONS:\nWound care reviewed. No heavy lifting for ")
    nb.t(f"{rng.randint(2,6)} weeks. Follow up with Dr. ")
    nb.p(case["attending"], "PROVIDER_NAME")
    nb.t(f" in 2 weeks. Call ")
    nb.p(case["phone"], "PHONE")
    nb.t(" for fever, increasing pain, or wound drainage.\n\n")
    nb.t("Surgeon signature: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t(".")

def ds_diabetes(nb, case):
    nb.t("DISCHARGE SUMMARY\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME")
    nb.t("    DOB: "); nb.p(case["dob"], "DOB"); nb.t("\n")
    nb.t("MRN: "); nb.p(case["mrn"], "MRN"); nb.t("\n")
    nb.t("Admission: "); nb.p(case["admit"], "DATE")
    nb.t("    Discharge: "); nb.p(case["discharge"], "DATE"); nb.t("\n")
    nb.t("Attending Physician: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n")
    nb.t("Facility: "); nb.p(case["hospital"], "APP_BUCKET"); nb.t("\n\n")
    nb.t("PRINCIPAL DIAGNOSIS: type 2 diabetes mellitus with hyperglycemia\n")
    nb.c("type 2 diabetes mellitus", "diagnosis")
    nb.t("\nHISTORY OF PRESENT ILLNESS:\n")
    s = rng.sample(["increased thirst", "frequent urination", "fatigue", "blurred vision"], 3)
    for x in s: nb.c(x, "symptom")
    nb.t(f"{case['age']}-year-old {case['man_woman']} with ")
    dxs = ["type 2 diabetes mellitus"] + rng.sample([d for d in DIAGNOSES if d != "type 2 diabetes mellitus"], 2)
    nb.t(", ".join(dxs) + " ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"presented with {s[0]}, {s[1]}, and {s[2]}. ")
    an, val, unit = ("glucose", str(rng.randint(280, 480)), "mg/dL")
    ph = f"{an} {val} {unit}"
    nb.t(f"Point-of-care {ph} on arrival. ")
    nb.c(ph, "lab")
    an2, val2, unit2 = ("hemoglobin A1c", f"{rng.randint(90,130)/10}", "%")
    ph2 = f"{an2} {val2} {unit2}"
    nb.t(f"{ph2}. ")
    nb.c(ph2, "lab")
    nb.t(f"{case['HeShe']} reported missing insulin doses for several days. Denied ")
    nb.t(", ".join(rng.sample(DENIES, 2)) + ".\n\n")
    nb.t("HOSPITAL COURSE:\nTreated with intravenous fluids and an insulin infusion, transitioned to ")
    m1, _ = med_line()
    nb.t("basal-bolus insulin (" + m1 + "). ")
    nb.c(m1, "medication")
    nb.t("Diabetes education provided by the inpatient team. ")
    nb.t("Nephrology consulted for ")
    nb.c("chronic kidney disease stage 3", "diagnosis")
    nb.t("chronic kidney disease stage 3; ")
    proc = rng.choice(["renal ultrasound", "echocardiogram"])
    nb.t(f"{proc} on "); nb.p(case["proc_date"], "DATE"); nb.t(" unremarkable. ")
    nb.c(proc, "procedure")
    nb.t("Discharged on a simplified regimen.\n\n")
    nb.t("DISCHARGE MEDICATIONS:\n")
    for _ in range(rng.randint(4, 6)):
        line, name = med_line(); nb.t("- " + line + "\n"); nb.c(line, "medication")
    nb.t("\nDIABETES EDUCATION:\nHome glucose monitoring twice daily. Hypoglycemia action plan reviewed. ")
    nb.t("Follow up with endocrinology (Dr. "); nb.p(case["pcp"], "PROVIDER_NAME")
    nb.t(f") in 2 weeks. Patient address on file: ")
    nb.p(case["address"], "ADDRESS"); nb.t(".\n\n")
    nb.t("Signed: Dr. "); nb.p(case["attending"], "PROVIDER_NAME")
    nb.t(" on "); nb.p(case["discharge"], "DATE"); nb.t(".")

def pn_cardiology(nb, case):
    nb.t("CARDIOLOGY PROGRESS NOTE\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME")
    nb.t("   DOB: "); nb.p(case["dob"], "DOB"); nb.t("\n")
    nb.t("MRN: "); nb.p(case["mrn"], "MRN")
    nb.t("   Date of Service: "); nb.p(case["dos"], "DATE"); nb.t("\n")
    nb.t("Author: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n\n")
    nb.t("SUBJECTIVE:\n")
    s = rng.sample(["chest pain", "shortness of breath", "palpitations", "dizziness", "leg swelling", "fatigue"], 3)
    for x in s: nb.c(x, "symptom")
    nb.t(f"Patient with ")
    dxs = rng.sample(["atrial fibrillation", "coronary artery disease", "heart failure with reduced ejection fraction",
                      "hypertension", "hyperlipidemia"], 3)
    nb.t(", ".join(dxs) + " ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"reports {s[0]}, {s[1]}, and {s[2]}. ")
    nb.t(f"{case['HeShe']} denies orthopnea, paroxysmal nocturnal dyspnea, and syncope. ")
    nb.t("Medication adherence reported as good. No tobacco use; alcohol occasionally.\n\n")
    nb.t("OBJECTIVE:\n")
    nb.t(f"Vitals: BP {rng.randint(118,158)}/{rng.randint(68,96)} mmHg, HR {rng.randint(58,102)}, ")
    nb.t(f"Temp 98.{rng.randint(1,9)} F, RR {rng.randint(14,22)}, SpO2 {rng.randint(94,99)} percent on room air.\n")
    nb.t("Exam: regular rate and rhythm, no murmurs. Lungs clear. No jugular venous distention. ")
    nb.t("Trace pedal edema bilaterally. ")
    nb.c("pedal edema", "symptom")
    nb.t("\nLabs: ")
    labs = rng.sample(LABS, 4)
    nb.t("; ".join(f"{a} {v} {u}".strip() for a, v, u in labs) + ". ")
    for a, v, u in labs: nb.c(f"{a} {v} {u}".strip(), "lab")
    nb.t("\n")
    proc = rng.choice(["electrocardiogram", "transthoracic echocardiogram", "Holter monitoring"])
    nb.t(f"{proc.title()} from "); nb.p(case["proc_date"], "DATE"); nb.t(": ")
    nb.c(proc, "procedure")
    nb.t(rng.choice(["normal sinus rhythm. ", "atrial fibrillation with controlled rate. ",
                     "left ventricular ejection fraction 40 percent. "]) + "\n\n")
    nb.t("ASSESSMENT AND PLAN:\n")
    for i, d in enumerate(dxs, 1):
        nb.t(f"{i}. {d.title()} - continue current regimen; ")
        m, _ = med_line(); nb.t(m + ". "); nb.c(m, "medication")
    nb.t(f"\nFollow up in {rng.randint(4,12)} weeks or sooner if symptoms worsen. ")
    nb.t("Patient instructed to call "); nb.p(case["phone"], "PHONE"); nb.t(" with concerns.\n\n")
    nb.t("Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("   Pager "); nb.p(case["pager"], "PHONE")

def pn_primary(nb, case):
    nb.t("PRIMARY CARE PROGRESS NOTE\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME")
    nb.t("  DOB: "); nb.p(case["dob"], "DOB")
    nb.t("  MRN: "); nb.p(case["mrn"], "MRN"); nb.t("\n")
    nb.t("Date: "); nb.p(case["dos"], "DATE")
    nb.t("  Provider: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n\n")
    nb.t("CHIEF COMPLAINT: routine follow-up\n\nSUBJECTIVE:\n")
    s = rng.sample(SYMPTOMS, 2)
    for x in s: nb.c(x, "symptom")
    nb.t(f"{case['age']}-year-old {case['man_woman']} here for chronic disease management. ")
    nb.t(f"Reports {s[0]} and {s[1]}. ")
    nb.t("Review of systems: denies " + ", ".join(rng.sample(ROS_EXTRA, 4)) + ". ")
    nb.t("Social: lives at "); nb.p(case["address"], "ADDRESS"); nb.t(". ")
    nb.t(f"Works as {rng.choice(['a teacher', 'an accountant', 'a nurse', 'a mechanic', 'a retail clerk'])}. ")
    nb.t("No tobacco, alcohol socially. ")
    nb.t("Family history: mother with hypertension, father with coronary artery disease. ")
    nb.t("Health maintenance: colonoscopy due next year; mammogram up to date; flu shot this season.\n\n")
    nb.t("OBJECTIVE:\n")
    nb.t(f"BP {rng.randint(118,148)}/{rng.randint(70,92)}, HR {rng.randint(62,96)}, ")
    nb.t(f"BMI {rng.randint(24,36)}.{rng.randint(0,9)}. ")
    nb.t("General: no acute distress. HEENT: unremarkable. Heart: regular rhythm. Lungs: clear. ")
    nb.t("Abdomen: soft, nontender. Skin: no rash. ")
    nb.t("Neurologic: alert and oriented, cranial nerves intact, strength full throughout.\n")
    nb.t("Recent labs: ")
    labs = rng.sample(LABS, 4)
    nb.t("; ".join(f"{a} {v} {u}".strip() for a, v, u in labs) + ". ")
    for a, v, u in labs: nb.c(f"{a} {v} {u}".strip(), "lab")
    nb.t("\n\nASSESSMENT AND PLAN:\n")
    dxs = rng.sample(DIAGNOSES, 3)
    for d in dxs: nb.c(d, "diagnosis")
    for i, d in enumerate(dxs, 1):
        nb.t(f"{i}. {d.title()}: ")
        if rng.random() < 0.7:
            m, _ = med_line(); nb.t("continue " + m + "; "); nb.c(m, "medication")
        nb.t(rng.choice(["lifestyle counseling provided. ", "labs rechecked in 3 months. ",
                         "dose adjusted as below. ", "referral placed. "]))
    nb.t(f"\nReturn visit in {rng.randint(3,6)} months. Contact the office at ")
    nb.p(case["phone"], "PHONE"); nb.t(" with questions. Email: ")
    nb.p(case["email"], "EMAIL"); nb.t(" on file.\n\n")
    nb.t("Signed: Dr. "); nb.p(case["attending"], "PROVIDER_NAME")

def pn_pulmonary(nb, case):
    nb.t("PULMONARY PROGRESS NOTE\n\n")
    nb.t("Patient: "); nb.p(case["name"], "PATIENT_NAME")
    nb.t("   DOB "); nb.p(case["dob"], "DOB"); nb.t("\n")
    nb.t("MRN "); nb.p(case["mrn"], "MRN")
    nb.t("   DOS "); nb.p(case["dos"], "DATE"); nb.t("\n")
    nb.t("Pulmonologist: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n\n")
    nb.t("SUBJECTIVE:\n")
    s = rng.sample(["shortness of breath", "cough", "wheezing", "chest tightness", "productive cough"], 3)
    for x in s: nb.c(x, "symptom")
    nb.t(f"Patient with ")
    dxs = rng.sample(["chronic obstructive pulmonary disease", "asthma", "obstructive sleep apnea",
                      "pulmonary embolism", "pleural effusion"], 2)
    nb.t(" and ".join(dxs) + " ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"reports {s[0]}, {s[1]}, and {s[2]}. ")
    nb.t(f"{rng.randint(10,40)} pack-year smoking history, quit {rng.randint(1,10)} years ago. ")
    nb.t("Uses home oxygen at night. Denies fever or hemoptysis. ")
    nb.t("Influenza and pneumococcal vaccinations are up to date. ")
    nb.t("Prior exacerbations treated as an outpatient with oral steroids twice in the past year.\n\n")
    nb.t("OBJECTIVE:\n")
    nb.t(f"SpO2 {rng.randint(90,96)} percent on {rng.randint(0,3)} liters. ")
    nb.t(f"Respiratory rate {rng.randint(16,26)}. Prolonged expiratory phase with scattered wheezes. ")
    nb.t("Pulmonary function testing on "); nb.p(case["proc_date"], "DATE")
    nb.t(" showed severe obstructive defect. ")
    nb.c("pulmonary function testing", "procedure")
    nb.t("\nLabs: ")
    labs = rng.sample(LABS, 3)
    nb.t("; ".join(f"{a} {v} {u}".strip() for a, v, u in labs) + ". ")
    for a, v, u in labs: nb.c(f"{a} {v} {u}".strip(), "lab")
    nb.t("\n\nASSESSMENT AND PLAN:\n")
    for i, d in enumerate(dxs, 1):
        nb.t(f"{i}. {d.title()} - ")
        m, _ = med_line(); nb.t(m + ". "); nb.c(m, "medication")
    nb.t("Inhaler technique reviewed and return demonstration satisfactory. ")
    nb.t("Smoking cessation reinforced. ")
    nb.t("Referred to pulmonary rehabilitation. ")
    nb.t("Discussed advance directives and the patient's goals of care; ")
    nb.t("the patient wishes to continue full treatment at this time. ")
    nb.t(f"Repeat imaging in {rng.randint(6,12)} months. ")
    nb.t("Call "); nb.p(case["phone"], "PHONE"); nb.t(" for worsening dyspnea.\n\n")
    nb.t("Dr. "); nb.p(case["attending"], "PROVIDER_NAME")
    nb.t(" electronically signed this note on "); nb.p(case["dos"], "DATE"); nb.t(".")

def pn_nephrology(nb, case):
    nb.t("NEPHROLOGY PROGRESS NOTE\n\n")
    nb.t("Patient Name: "); nb.p(case["name"], "PATIENT_NAME"); nb.t("\n")
    nb.t("DOB: "); nb.p(case["dob"], "DOB")
    nb.t("   MRN: "); nb.p(case["mrn"], "MRN"); nb.t("\n")
    nb.t("Date of Service: "); nb.p(case["dos"], "DATE"); nb.t("\n")
    nb.t("Nephrologist: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t("\n\n")
    nb.t("SUBJECTIVE:\n")
    s = rng.sample(["fatigue", "leg swelling", "nausea", "decreased urine output", "shortness of breath"], 2)
    for x in s: nb.c(x, "symptom")
    nb.t(f"{case['age']}-year-old {case['man_woman']} with ")
    dxs = ["chronic kidney disease stage 3"] + rng.sample(
        ["hypertension", "type 2 diabetes mellitus", "hyperlipidemia", "anemia of chronic disease"], 2)
    nb.t(", ".join(dxs) + " ")
    for d in dxs: nb.c(d, "diagnosis")
    nb.t(f"reports {s[0]} and {s[1]}. ")
    nb.t("Denies chest pain, fever, or dysuria. Fluid intake approximately 2 liters daily. ")
    nb.t("Medication list reconciled.\n\n")
    nb.t("OBJECTIVE:\n")
    nb.t(f"BP {rng.randint(128,168)}/{rng.randint(72,98)}, HR {rng.randint(60,92)}. ")
    nb.t("Mild bilateral lower extremity edema. Lungs clear.\n")
    nb.t("Laboratory studies from "); nb.p(case["proc_date"], "DATE"); nb.t(":\n")
    labs = [("creatinine", f"{rng.randint(13,24)/10}", "mg/dL"),
            ("estimated glomerular filtration rate", str(rng.randint(28,55)), "mL/min"),
            ("blood urea nitrogen", str(rng.randint(22,48)), "mg/dL"),
            ("potassium", f"{rng.randint(42,56)/10}", "mmol/L"),
            ("bicarbonate", str(rng.randint(18,24)), "mmol/L"),
            ("hemoglobin", f"{rng.randint(95,125)/10}", "g/dL")]
    labs = rng.sample(labs, 5)
    for a, v, u in labs:
        ph = f"{a} {v} {u}".strip(); nb.t("- " + ph + "\n"); nb.c(ph, "lab")
    proc = rng.choice(["renal ultrasound", "hemodialysis"])
    nb.t(f"\n{proc.title()}: ")
    nb.c(proc, "procedure")
    nb.t(rng.choice(["no hydronephrosis. ", "tolerated well. "] + ["stable compared to prior. "]))
    nb.t("\nASSESSMENT AND PLAN:\n")
    nb.t("1. Chronic kidney disease stage 3, likely diabetic and hypertensive: continue ")
    m, _ = med_line(); nb.t(m + "; "); nb.c(m, "medication")
    nb.t("avoid NSAIDs; low-salt diet.\n")
    nb.t("2. " + dxs[1].title() + ": at goal.\n")
    nb.t(f"3. {dxs[2].title()}: monitor.\n")
    nb.t(f"\nFollow up in {rng.randint(2,4)} months. Labs beforehand. ")
    nb.t("Patient may reach the office at "); nb.p(case["phone"], "PHONE"); nb.t(".\n\n")
    nb.t("Attending attestation: Dr. "); nb.p(case["attending"], "PROVIDER_NAME"); nb.t(".")

TEMPLATES = [("discharge_summary", ds_cardiac), ("discharge_summary", ds_pneumonia),
             ("discharge_summary", ds_surgical), ("discharge_summary", ds_diabetes),
             ("progress_note", pn_cardiology), ("progress_note", pn_primary),
             ("progress_note", pn_pulmonary), ("progress_note", pn_nephrology)]

def make_case(i):
    first, last = rng.choice(FIRST), rng.choice(LAST)
    name = f"{first} {last}"
    dob_s, yob = dob_str()
    age = 2026 - yob
    sex = rng.choice(["Male", "Female"])
    admit = date_str(); discharge = date_str()
    return {
        "name": name, "dob": dob_s, "age": age, "sex": sex,
        "man_woman": "man" if sex == "Male" else "woman",
        "HeShe": "He" if sex == "Male" else "She",
        "mrn": f"{rng.randint(1000000, 9999999)}",
        "enc": f"{rng.randint(10000000, 99999999)}",
        "admit": admit, "discharge": discharge,
        "dos": date_str(), "proc_date": date_str(),
        "attending": f"{rng.choice(PROV_FIRST)} {rng.choice(PROV_LAST)}",
        "pcp": f"{rng.choice(PROV_FIRST)} {rng.choice(PROV_LAST)}",
        "hospital": rng.choice(HOSPITALS),
        "phone": phone(), "pager": phone(),
        "contact": full_name(), "contact_phone": phone(),
        "address": address(), "email": email(first, last),
    }

def main():
    used_names = set()
    notes = []
    for i in range(40):
        note_type, fn = TEMPLATES[i % len(TEMPLATES)]
        case = make_case(i)
        while case["name"] in used_names:
            case["name"] = full_name()
        used_names.add(case["name"])
        if i % 9 == 4:
            pass
        nb = NB()
        fn(nb, case)
        if i in (7, 19, 31):
            nb.t("\n\nRegistration: SSN "); nb.p(f"9{rng.randint(10,99):02d}-{rng.randint(10,99):02d}-{rng.randint(1000,9999)}", "ID")
            nb.t(" on file.")
        text, spans, concepts = nb.build()
        assert "[" not in text and "]" not in text, f"brackets leaked in note {i}"
        words = len(text.split())
        notes.append({"id": f"ws5-{i+1:02d}", "note_type": note_type, "template": fn.__name__,
                      "text": text, "phi_spans": spans, "clinical_concepts": concepts,
                      "word_count": words})
    for n in notes:
        assert 150 <= n["word_count"] <= 350, f"{n['id']} word count {n['word_count']}"
        assert n["phi_spans"], f"{n['id']} has no PHI spans"
        assert n["clinical_concepts"], f"{n['id']} has no concepts"
        for s in n["phi_spans"]:
            assert n["text"][s["start"]:s["end"]] == s["text"], f"span mismatch in {n['id']}"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        for n in notes:
            f.write(json.dumps(n) + "\n")
    wc = [n["word_count"] for n in notes]
    print(f"wrote {len(notes)} notes to {OUT}")
    print(f"word counts: min {min(wc)}, max {max(wc)}, mean {sum(wc)/len(wc):.1f}")
    nphi = sum(len(n["phi_spans"]) for n in notes)
    ncon = sum(len(n["clinical_concepts"]) for n in notes)
    print(f"PHI spans: {nphi}, clinical concepts: {ncon}")

if __name__ == "__main__":
    main()
