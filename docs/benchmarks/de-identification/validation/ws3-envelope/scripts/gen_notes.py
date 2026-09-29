#!/usr/bin/env python3
"""Generate synthetic clinical-style de-identification test notes.

All names, dates, addresses, phone numbers, and identifiers below are
invented for benchmarking. No real PHI is used or reproduced.
"""
import json
import random
import sys

random.seed(20260929)

FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Sarah", "David", "Emma",
         "Daniel", "Olivia", "William", "Ava", "Joseph", "Sophia", "Thomas", "Mia",
         "Charles", "Amelia", "Christopher", "Evelyn", "Darius", "Priya", "Kenji",
         "Fatima", "Hector", "Ingrid", "Jamal", "Keiko", "Lars", "Nadia"]
LAST = ["Carter", "Nguyen", "Patel", "Garcia", "Kim", "Okafor", "Rossi", "Haddad",
        "Novak", "Silva", "Tanaka", "Murphy", "Ali", "Brooks", "Costa", "Dube",
        "Ellis", "Frost", "Gomes", "Hayes", "Iqbal", "Jensen", "Kowalski", "Lopez"]
STREETS = ["412 Maple Ave", "88 Harbor Blvd Apt 3B", "1501 Chestnut St", "27 Willow Ln",
           "903 Canyon Rd", "511 Elm Street Unit 12", "77 Birchwood Dr", "2300 Lakeview Ter"]
CITIES = ["Baltimore, MD 21201", "Rockville, MD 20850", "Silver Spring, MD 20910",
          "Columbia, MD 21044", "Frederick, MD 21701", "Annapolis, MD 21401"]
PROVIDERS = ["Dr. Alvarez", "Dr. Chen", "Dr. Osei", "Dr. Richardson", "Dr. Nakamura",
             "Dr. Goldstein", "Dr. Park", "Dr. Mensah", "NP Rivera", "PA Kowalski"]
CHIEFS = ["chest pain", "shortness of breath", "abdominal pain", "headache",
          "dizziness", "fever and cough", "back pain", "palpitations",
          "leg swelling", "nausea and vomiting"]
EXAMS = [
    "Lungs clear to auscultation bilaterally, no wheezes.",
    "Heart regular rate and rhythm, no murmurs appreciated.",
    "Abdomen soft, nontender, nondistended; bowel sounds present.",
    "2+ pitting edema bilateral lower extremities to mid-shin.",
    "Neuro: alert and oriented x3, cranial nerves II-XII grossly intact.",
    "Skin warm and dry, no rashes or lesions noted.",
]
PLANS = [
    "Continue home medications. Recheck BMP in the morning.",
    "Start lisinopril 10 mg daily; counsel on dry cough.",
    "Obtain ECG and troponin x2, six hours apart.",
    "CT abdomen/pelvis with contrast if pain persists.",
    "Refer to cardiology clinic within 2 weeks.",
    "Encourage smoking cessation; offered nicotine patch.",
]
MEDS = ["metformin 1000 mg BID", "atorvastatin 40 mg nightly", "lisinopril 10 mg daily",
        "albuterol inhaler 2 puffs q4h PRN", "furosemide 40 mg daily",
        "sertraline 50 mg daily", "insulin glargine 22 units nightly",
        "amlodipine 5 mg daily"]


def phone():
    return f"{random.randint(200,989)}-{random.randint(200,989)}-{random.randint(1000,9999)}"


def dob():
    return f"{random.randint(1,12):02d}/{random.randint(1,28):02d}/{random.randint(1938,2004)}"


def mrn():
    return f"{random.randint(100000,999999)}"


def visit_date():
    return f"{random.randint(1,12):02d}/{random.randint(1,28):02d}/2026"


def note(i):
    fn = random.choice(FIRST)
    ln = random.choice(LAST)
    prov = random.choice(PROVIDERS)
    chief = random.choice(CHIEFS)
    variant = i % 5
    header = (f"Patient: {fn} {ln} | DOB: {dob()} | MRN: {mrn()} | "
              f"Phone: {phone()} | {random.choice(STREETS)}, {random.choice(CITIES)}\n"
              f"Visit date: {visit_date()} | Provider: {prov}\n")
    if variant == 0:
        body = (f"Chief complaint: {chief}.\nHPI: {random.randint(24,81)}-year-old "
                f"{random.choice(['man', 'woman'])} with history of "
                f"{random.choice(['hypertension', 'diabetes mellitus type 2', 'asthma', 'hyperlipidemia', 'CKD stage 3'])} "
                f"presents with {chief} for {random.randint(1,5)} days. Denies "
                f"{random.choice(['fever', 'chills', 'chest pressure', 'syncope'])}.\n"
                f"Exam: {random.choice(EXAMS)} {random.choice(EXAMS)}\n"
                f"Meds: {', '.join(random.sample(MEDS, 3))}.\n"
                f"Plan: {random.choice(PLANS)}")
    elif variant == 1:
        body = (f"Progress note, hospital day {random.randint(1,9)}.\n"
                f"Overnight: patient resting comfortably. {random.choice(EXAMS)}\n"
                f"Labs: Na {random.randint(133,142)}, K 4.{random.randint(0,9)}, "
                f"creatinine 1.{random.randint(0,9)}, glucose {random.randint(95,220)}.\n"
                f"Assessment: improving. Plan: {random.choice(PLANS)} {random.choice(PLANS)}")
    elif variant == 2:
        body = (f"Telephone encounter with {fn} {ln} at {phone()}.\n"
                f"Patient reports {chief}. Advised to {random.choice(['come to clinic tomorrow', 'go to the emergency department', 'continue current regimen and call back in 48 hours'])}.\n"
                f"Return precautions discussed. Documented by {prov}.")
    elif variant == 3:
        body = (f"Discharge summary — {fn} {ln}, MRN {mrn()}.\n"
                f"Admit {visit_date()}, discharge {visit_date()}.\n"
                f"Principal diagnosis: {random.choice(['acute bronchitis', 'cellulitis left leg', 'syncope', 'gastroenteritis'])}.\n"
                f"Discharge meds: {', '.join(random.sample(MEDS, 2))}.\n"
                f"Follow up with {prov} in {random.randint(3,14)} days. Call {phone()} with questions.")
    else:
        body = (f"ED triage note {visit_date()} {random.randint(1,12):02d}:{random.randint(10,59):02d}.\n"
                f"{fn} {ln}, {random.randint(24,81)}yo, c/o {chief}. "
                f"Vitals: BP {random.randint(100,170)}/{random.randint(60,100)}, "
                f"HR {random.randint(55,120)}, SpO2 {random.randint(93,100)}% RA.\n"
                f"{random.choice(EXAMS)} ESI {random.randint(2,4)}. Roomed, awaiting {prov}.")
    return {"id": f"ws3-note-{i:03d}", "source_text": header + body}


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    out = sys.argv[2] if len(sys.argv) > 2 else "/home/hatch/workspace/deid-validation/ws3-envelope/data/notes_ws3.jsonl"
    with open(out, "w") as f:
        for i in range(n):
            f.write(json.dumps(note(i)) + "\n")
    print(f"wrote {n} notes -> {out}")


if __name__ == "__main__":
    main()
