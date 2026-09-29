#!/usr/bin/env python3
"""Generate 60 synthetic clinical notes with character-offset PHI ground truth.

ALL data is invented by this script (fictional names, places, numbers).
Nothing here is real PHI; no IRB needed.

Output: notes.jsonl — one JSON object per line:
  { "id": str, "note_type": str, "word_count": int,
    "text": str, "entities": [ {start, end, label} ... ] }

Label set (also used for scoring):
  PATIENT, PROVIDER, DATE, PHONE, ADDRESS, MRN, AGE, HOSPITAL
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "notes.jsonl"
SEED = 20260929

# ---------------------------------------------------------------- pools ----
FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Sarah", "David",
         "Jennifer", "William", "Patricia", "Charles", "Barbara", "Thomas",
         "Elizabeth", "Christopher", "Susan", "Daniel", "Jessica", "Matthew",
         "Karen", "Anthony", "Nancy", "Mark", "Lisa", "Steven", "Betty",
         "Paul", "Margaret", "George", "Dorothy", "Kenneth", "Helen",
         "Ruth", "Frank", "Sharon", "Scott", "Michelle", "Andrew", "Laura",
         "Brian", "Emily", "Kevin", "Deborah", "Jason", "Kimberly", "Jeffrey",
         "Amanda", "Ryan", "Melissa", "Jacob", "Stephanie", "Gary", "Rebecca",
         "Nicholas", "Carolyn", "Eric", "Christine", "Stephen", "Virginia",
         "Jonathan", "Kathleen", "Larry", "Pamela", "Justin", "Emma", "Tyrone",
         "Keisha", "Jamal", "Latoya", "DeShawn", "Aaliyah", "Wei", "Mei",
         "Raj", "Priya", "Jose", "Rosa", "Miguel", "Elena", "Viktor", "Ingrid",
         "Kwame", "Ama", "Sean", "Bridget", "Giuseppe", "Sofia", "Hassan",
         "Fatima", "Yuki", "Aiko", "Diego", "Lucia", "Piotr", "Anya",
         "Moses", "Ruth", "Ebenezer", "Chloe", "Nadia", "Omar"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
        "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
        "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
        "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
        "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
        "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
        "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
        "Carter", "Roberts", "O'Brien", "Kowalski", "Okafor", "Raman",
        "Goldstein", "Cohen", "Kim", "Patel", "Chen", "Singh", "Murphy",
        "Sullivan", "Fitzgerald", "Delgado", "Vasquez", "Alvarez", "Castillo",
        "Reyes", "Gutierrez", "Mendoza", "Aguilar", "Rios", "Vega",
        "Harrington", "Blackwood", "Thornton", "Ashford", "Quimby", "Pruitt",
        "Calloway", "Drummond", "Fennimore", "Grantham", "Halloway", "Kessler",
        "Larkspur", "Marlowe", "Nightingale", "Pembroke", "Quill", "Redfern",
        "Sterling", "Tolliver", "Underwood", "Vance", "Wexler", "Yardley",
        "Zimmerman", "Abernathy", "Bellwether", "Cranston"]

CLIN_FIRST = ["Priya", "Samuel", "Lena", "Marcus", "Elena", "David", "Aisha",
              "Jonathan", "Grace", "Victor", "Nadia", "Peter", "Rosa",
              "Thomas", "Mei", "Carlos", "Ingrid", "Omar", "Julia", "Henry",
              "Sofia", "Daniel", "Amara", "Felix", "Hannah", "Rajesh",
              "Clara", "Yusuf", "Marta", "Elliot"]
CLIN_LAST = ["Raman", "Okafor", "Kowalski", "Bennett", "Alvarez", "Chen",
             "Haddad", "Whitfield", "Novak", "Reyes", "Lindqvist", "Patel",
             "Moreno", "Fitzgerald", "Tan", "Vargas", "Bergstrom", "Farouk",
             "Kowalski", "Ashford", "Rossi", "Goldman", "Diallo", "Moreau",
             "Weiss", "Krishnan", "Lindqvist", "Adeyemi", "Silva", "Park"]
NURSE_FIRST = ["Maria", "James", "Aisha", "Kevin", "Rosa", "Daniel", "Priya",
               "Tom", "Grace", "Samuel", "Nadia", "Chris"]
NURSE_LAST = ["Delgado", "Carter", "Haddad", "Nguyen", "Vasquez", "Reyes",
              "Sharma", "Baker", "Novak", "Okafor", "Lindqvist", "Park"]

HOSPITALS = ["Cedarbrook Medical Center", "St. Alder's Hospital",
             "Brookfield General Hospital", "Lakeside Regional Medical Center",
             "Harbor Pines Hospital", "Willow Creek Medical Center",
             "Northgate Community Hospital", "Fairview Memorial Hospital"]
STREETS = ["Saratoga St", "Lombard St", "Pratt St", "Fayette St",
           "Orleans St", "Madison Ave", "Eutaw St", "Charles St",
           "Greenmount Ave", "York Rd", "Belair Rd", "Edmondson Ave"]
CITIES = ["Baltimore, MD", "Towson, MD", "Dundalk, MD", "Essex, MD",
          "Catonsville, MD", "Pikesville, MD", "Glen Burnie, MD"]

CONDITIONS = [
    ("acute decompensated heart failure", "CHF exacerbation"),
    ("community-acquired pneumonia", "pneumonia"),
    ("COPD exacerbation", "COPD flare"),
    ("cellulitis of the left lower extremity", "cellulitis"),
    ("non-ST elevation myocardial infarction", "NSTEMI"),
    ("gastrointestinal bleeding", "GI bleed"),
    ("urinary tract infection", "UTI"),
    ("type 2 diabetes mellitus with hyperglycemia", "diabetic hyperglycemia"),
    ("ischemic stroke", "stroke"),
    ("chest pain, rule out ACS", "chest pain"),
    ("postoperative day 2 status post left total hip arthroplasty", "post-op hip"),
    ("acute kidney injury", "AKI"),
    ("sepsis secondary to pyelonephritis", "urosepsis"),
    ("atrial fibrillation with rapid ventricular response", "afib with RVR"),
    ("small bowel obstruction", "SBO"),
]


def pick(rng, pool):
    return pool[rng.randrange(len(pool))]


def patient_name(rng):
    return f"{pick(rng, FIRST)} {pick(rng, LAST)}"


def clinician_name(rng):
    return f"Dr. {pick(rng, CLIN_FIRST)} {pick(rng, CLIN_LAST)}"


def nurse_name(rng):
    return f"{pick(rng, NURSE_FIRST)} {pick(rng, NURSE_LAST)}, RN"


def phone(rng):
    fmt = rng.choice([0, 1, 2])
    area = rng.choice(["410", "443", "667", "301", "240"])
    mid = f"{rng.randrange(200, 990):03d}"
    last = f"{rng.randrange(0, 10000):04d}"
    if fmt == 0:
        return f"({area}) {mid}-{last}"
    if fmt == 1:
        return f"{area}-{mid}-{last}"
    return f"{area}.{mid}.{last}"


def address(rng):
    num = rng.randrange(100, 9999)
    street = pick(rng, STREETS)
    city = pick(rng, CITIES)
    zipc = f"{rng.choice(['212', '211'])}{rng.randrange(0, 100):02d}"
    return f"{num} {street}, {city} {zipc}"


def date(rng):
    m = rng.randrange(1, 13)
    d = rng.randrange(1, 29)
    y = rng.choice([2025, 2026])
    fmt = rng.randrange(4)
    months = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"]
    if fmt == 0:
        return f"{m:02d}/{d:02d}/{y}"
    if fmt == 1:
        return f"{months[m-1]} {d}, {y}"
    if fmt == 2:
        return f"{m}/{d}/{str(y)[2:]}"
    return f"{m:02d}-{d:02d}-{y}"


def mrn(rng):
    return f"{rng.randrange(1000000, 9999999)}"


def age(rng):
    return str(rng.randrange(19, 98))


# ---------------------------------------------------------------- builder ---
class Note:
    """Assemble text from labeled segments so offsets are exact."""

    def __init__(self):
        self.segs = []          # (text, label_or_None)
        self.entities = []
        self.phi_strings = []   # every PHI string, for the leak check

    def t(self, text):
        self.segs.append((text, None))
        return self

    def phi(self, text, label):
        self.segs.append((text, label))
        self.phi_strings.append(text)
        return self

    def build(self):
        text = "".join(s for s, _ in self.segs)
        entities = []
        pos = 0
        for s, label in self.segs:
            if label:
                entities.append({"start": pos, "end": pos + len(s), "label": label})
            pos += len(s)
        # Leak check: every occurrence of every PHI string must be covered
        # by an entity span (catches PHI smuggled in via f-strings).
        for phi_str in self.phi_strings:
            start = 0
            while True:
                i = text.find(phi_str, start)
                if i < 0:
                    break
                if not any(e["start"] <= i and e["end"] >= i + len(phi_str)
                           for e in entities):
                    raise ValueError(f"UNANNOTATED PHI {phi_str!r} at offset {i}")
                start = i + 1
        return text, entities


# ------------------------------------------------------------- templates ----
def discharge_summary(rng, idx):
    n = Note()
    pat, doc = patient_name(rng), clinician_name(rng)
    cond, cond_short = pick(rng, CONDITIONS)
    admit, disch = date(rng), date(rng)
    dob = date(rng)
    ag, mr, hosp = age(rng), mrn(rng), pick(rng, HOSPITALS)
    fam = patient_name(rng)
    fphone = phone(rng)
    n.t("DISCHARGE SUMMARY\n\n")
    n.t("Patient: ").phi(pat, "PATIENT").t("\n")
    n.t("MRN: ").phi(mr, "MRN").t("    DOB: ").phi(dob, "DATE").t("\n")
    n.t("Admission date: ").phi(admit, "DATE").t("    Discharge date: ").phi(disch, "DATE").t("\n")
    n.t("Attending physician: ").phi(doc, "PROVIDER").t("\n")
    n.t("Facility: ").phi(hosp, "HOSPITAL").t("\n\n")
    n.t("CHIEF COMPLAINT: ").t(pick(rng, ["shortness of breath", "chest pain", "fever and cough",
        "leg swelling and pain", "abdominal pain", "weakness and dizziness",
        "vomiting blood", "burning with urination", "confusion"]) + ".\n\n")
    n.t("HISTORY OF PRESENT ILLNESS: This is a ")
    n.phi(f"{ag}-year-old", "AGE")
    n.t(" patient who presented with ")
    n.t(pick(rng, ["progressively worsening symptoms over three days",
                   "acute onset of symptoms this morning",
                   "several days of increasing discomfort",
                   "new symptoms noted by family at home"]) + ". ")
    n.t("On arrival the patient was ")
    n.t(pick(rng, ["alert and in mild distress", "comfortable at rest",
                   "tachypneic but conversant", "lethargic but arousable"]) + ". ")
    n.t("Initial workup included labs, imaging, and bedside evaluation. ")
    n.t("The patient was admitted under the care of ")
    n.phi(doc, "PROVIDER")
    n.t(f" for management of {cond}.\n\n")
    n.t("HOSPITAL COURSE: The patient responded to therapy over the course of the admission. ")
    n.t(pick(rng, ["Vital signs stabilized within 24 hours of admission.",
                   "Serial examinations showed steady improvement.",
                   "Laboratory markers trended in the right direction daily.",
                   "The care team adjusted therapy based on daily assessments."]) + " ")
    n.t(pick(rng, ["No complications were observed during the stay.",
                   "A minor setback on day two was addressed promptly.",
                   "Consultations were obtained as clinically indicated.",
                   "Physical therapy evaluated the patient prior to discharge."]) + " ")
    n.t("By the day of discharge the patient was ambulating independently, tolerating a regular diet, ")
    n.t("and voicing understanding of the discharge plan. ")
    n.t("Discharge examination was performed and documented in the chart.\n\n")
    n.t("DISCHARGE MEDICATIONS: ")
    n.t(pick(rng, ["Continue home medications as reconciled at discharge.",
                   "New prescriptions were sent electronically to the patient's pharmacy.",
                   "Medication list reviewed in detail with the patient and family.",
                   "All changes from admission medications were highlighted and explained."]) + "\n\n")
    n.t("FOLLOW-UP: Follow up with primary care within one week. ")
    n.t("Return precautions were reviewed, including when to seek urgent care. ")
    n.t("Emergency contact details are documented in the medical record. ")
    n.t("Questions after discharge may be directed to the clinic during business hours.\n\n")
    n.t("Electronically signed by: ").phi(doc, "PROVIDER").t("\n")
    return n


def nursing_note(rng, idx):
    n = Note()
    pat = patient_name(rng)
    rn = nurse_name(rng)
    cond, cond_short = pick(rng, CONDITIONS)
    d = date(rng)
    shift = pick(rng, ["day shift", "evening shift", "night shift"])
    ag = age(rng)
    hosp = pick(rng, HOSPITALS)
    fam, fphone = patient_name(rng), phone(rng)
    doc = clinician_name(rng)
    n.t("NURSING NOTE\n\n")
    n.t("Date/Time: ").phi(d, "DATE").t(" — ").t(shift).t("\n")
    n.t("Patient: ").phi(pat, "PATIENT").t(", ").phi(ag, "AGE").t(" years old\n")
    n.t("Location: ").phi(hosp, "HOSPITAL").t("\n\n")
    n.t("Patient resting in bed, ")
    n.t(pick(rng, ["awake and alert", "drowsy but easily aroused",
                   "alert and oriented x3", "resting comfortably"]) + ". ")
    n.t(pick(rng, ["Denies acute distress at this time.",
                   "Reports pain as 3/10, controlled with current regimen.",
                   "States breathing is easier than yesterday.",
                   "Reports nausea resolved after the morning dose."]) + " ")
    n.t("Lungs ")
    n.t(pick(rng, ["clear to auscultation", "with mild bibasilar crackles",
                   "diminished at the bases", "clear, no wheezes"]) + ". ")
    n.t("Skin warm and dry. ")
    n.t(pick(rng, ["IV site without redness or swelling.",
                   "Peripheral IV patent and flushing well.",
                   "No IV access at this time; tolerating PO.",
                   "Central line dressing clean, dry, and intact."]) + "\n\n")
    n.t("Interventions: ")
    n.t(pick(rng, ["Medications administered as scheduled.",
                   "Morning medications given; patient tolerated well.",
                   "Wound care completed per orders.",
                   "Assisted with ambulation in the hallway, tolerated well."]) + " ")
    n.t(pick(rng, ["Patient educated on the plan of care and voiced understanding.",
                   "Family updated by phone and expressed no new concerns.",
                   "Fall precautions reinforced at the bedside.",
                   "Incentive spirometer use encouraged and return-demonstrated."]) + "\n\n")
    n.t("Family communication: spoke with ")
    n.phi(fam, "PATIENT").t(" at ").phi(fphone, "PHONE").t("; ")
    n.t(pick(rng, ["updated on the plan and condition.",
                   "informed of pending test results.",
                   "confirmed the discharge planning meeting time.",
                   "answered questions about visiting hours."]) + "\n\n")
    n.t("Additional assessment: ")
    n.t(pick(rng, ["Pain reassessed after intervention; patient reports improvement.",
                   "Intake and output recorded; urine output adequate for the shift.",
                   "Bowel sounds present; patient reports passing flatus.",
                   "Respiratory status unchanged; oxygen requirements stable."]) + " ")
    n.t(pick(rng, ["Lines and drains patent and intact.",
                   "Dressings remain clean, dry, and intact.",
                   "Skin assessment completed; no new breakdown noted.",
                   "Patient repositioned for comfort and skin protection."]) + " ")
    n.t(pick(rng, ["Call light within reach; bed in low position.",
                   "Bed alarm on; patient reminded to call for assistance.",
                   "Room tidy; personal belongings at the bedside.",
                   "Patient verbalizes understanding of safety precautions."]) + "\n\n")
    n.t("Handoff: oncoming nurse briefed on the plan of care, pending items, and ")
    n.t(pick(rng, ["family concerns discussed above.",
                   "test results expected later today.",
                   "the anticipated discharge timeline.",
                   "comfort measures currently in place."]) + " ")
    n.t("All documentation completed in the medical record for this shift.\n\n")
    n.t("Ongoing concerns: ")
    n.t(pick(rng, ["none voiced by the patient at this time.",
                   "mild anxiety about the upcoming procedure; reassured.",
                   "patient requesting an update on test results; will follow up.",
                   "family requesting a care conference; message relayed to the team."]) + " ")
    n.t(pick(rng, ["Will continue the current plan through the next shift.",
                   "Next assessment scheduled per unit routine.",
                   "Provider aware and in agreement with the plan.",
                   "No acute issues requiring escalation at this time."]) + "\n\n")
    n.t("Plan: continue to monitor, ")
    n.t(pick(rng, ["notify provider of any change in condition.",
                   "repeat assessment in four hours.",
                   "coordinate with day team on discharge needs.",
                   "ensure comfort measures remain in place."]) + "\n\n")
    n.t("Notified ").phi(doc, "PROVIDER").t(" of assessment findings; no new orders.\n\n")
    n.t("Signed: ").phi(rn, "PROVIDER").t("\n")
    return n


def progress_note(rng, idx):
    n = Note()
    pat, doc = patient_name(rng), clinician_name(rng)
    cond, cond_short = pick(rng, CONDITIONS)
    d = date(rng)
    ag = age(rng)
    hosp = pick(rng, HOSPITALS)
    addr = address(rng)
    n.t("PROGRESS NOTE\n\n")
    n.t("Date: ").phi(d, "DATE").t("\n")
    n.t("Patient: ").phi(pat, "PATIENT").t("\n")
    n.t("Facility: ").phi(hosp, "HOSPITAL").t("\n\n")
    n.t("S: ").phi(f"{ag}-year-old", "AGE").t(f" patient admitted for {cond}. ")
    n.t(pick(rng, ["Reports feeling better than yesterday.",
                   "Reports continued symptoms but improving.",
                   "Denies new complaints this morning.",
                   "Reports sleeping better overnight."]) + " ")
    n.t(pick(rng, ["Appetite is fair.", "Appetite remains poor.",
                   "Tolerating diet without nausea.", "Drinking fluids well."]) + " ")
    n.t(pick(rng, ["Denies chest pain, shortness of breath, or palpitations.",
                   "Denies fever, chills, or night sweats.",
                   "Denies nausea, vomiting, or diarrhea.",
                   "Denies headache, dizziness, or visual changes."]) + "\n\n")
    n.t("O: ")
    n.t(pick(rng, ["Vital signs stable. ", "Afebrile, vitals within normal limits. ",
                   "Mildly tachycardic, otherwise stable. ", "Vitals unchanged from yesterday. "]))
    n.t("General: ")
    n.t(pick(rng, ["no acute distress. ", "comfortable appearing. ",
                   "mild distress, improving. "]))
    n.t("Exam: ")
    n.t(pick(rng, ["lungs clear, heart regular, abdomen soft.",
                   "pertinent findings unchanged from admission exam.",
                   "improving compared with yesterday's examination.",
                   "no focal deficits; remainder of exam unremarkable."]) + "\n\n")
    n.t("A/P: ")
    n.t(pick(rng, [f"{cond_short} — improving on current therapy; continue plan.",
                   f"{cond_short} — stable; consider step-down in therapy tomorrow.",
                   f"{cond_short} — responding; monitor for recurrence of symptoms.",
                   f"{cond_short} — plan unchanged; reassess in the morning."]) + " ")
    n.t(pick(rng, ["Discharge planning underway.",
                   "Case management consulted for placement needs.",
                   "Social work assisting with home support arrangements.",
                   "Anticipate discharge within 48 hours if course continues."]) + "\n\n")
    n.t("LABS/IMAGING: ")
    n.t(pick(rng, ["Morning labs show improving trends from admission values.",
                   "Basic metabolic panel unremarkable; no acute electrolyte shifts.",
                   "CBC stable; no concerning changes from yesterday.",
                   "Imaging from admission reviewed; findings consistent with the working diagnosis."]) + " ")
    n.t(pick(rng, ["No new critical values overnight.",
                   "Repeat studies not indicated at this time.",
                   "Will trend labs daily and adjust therapy accordingly.",
                   "Culture results still pending; will follow up."]) + " ")
    n.t("The patient was examined at the bedside this morning and the findings above were confirmed. ")
    n.t(pick(rng, ["Questions from the patient were answered in detail.",
                   "The patient voiced understanding of the current plan.",
                   "Family members present were included in the discussion.",
                   "The nurse was updated on the plan after rounds."]) + "\n\n")
    n.t("COUNSELING: ")
    n.t(pick(rng, ["Risks, benefits, and alternatives of the current plan were discussed.",
                   "The patient was counseled on warning signs that warrant urgent evaluation.",
                   "Medication adherence and follow-up timing were reviewed in detail.",
                   "Lifestyle measures relevant to the diagnosis were discussed."]) + " ")
    n.t("The patient had an opportunity to ask questions and all questions were answered. ")
    n.t(pick(rng, ["The patient agrees with the plan as outlined.",
                   "The patient wishes to think over the options and will decide tomorrow.",
                   "The patient's family is in agreement with the proposed plan.",
                   "Shared decision-making was documented in the chart."]) + "\n\n")
    n.t("Patient resides at ").phi(addr, "ADDRESS").t("; ")
    n.t("discharge instructions will be sent there if the patient leaves before follow-up is arranged.\n\n")
    n.t("Signed: ").phi(doc, "PROVIDER").t(", attending physician\n")
    return n


def make_note(rng, note_type, idx):
    if note_type == "discharge":
        n = discharge_summary(rng, idx)
        nid = f"DS-{idx:03d}"
    elif note_type == "nursing":
        n = nursing_note(rng, idx)
        nid = f"NN-{idx:03d}"
    else:
        n = progress_note(rng, idx)
        nid = f"PN-{idx:03d}"
    text, entities = n.build()
    entities.sort(key=lambda e: (e["start"], e["end"]))
    return {
        "id": nid,
        "note_type": note_type,
        "word_count": len(text.split()),
        "phi_count": len(entities),
        "text": text,
        "entities": entities,
    }


def main():
    rng = random.Random(SEED)
    notes = []
    for i in range(1, 21):
        notes.append(make_note(rng, "discharge", i))
    for i in range(1, 21):
        notes.append(make_note(rng, "nursing", i))
    for i in range(1, 21):
        notes.append(make_note(rng, "progress", i))

    # sanity checks
    problems = []
    for rec in notes:
        if not (150 <= rec["word_count"] <= 400):
            problems.append(f'{rec["id"]}: {rec["word_count"]} words')
        if not (4 <= rec["phi_count"] <= 10):
            problems.append(f'{rec["id"]}: {rec["phi_count"]} PHI items')
        for e in rec["entities"]:
            span = rec["text"][e["start"]:e["end"]]
            if not span.strip():
                problems.append(f'{rec["id"]}: empty span {e}')
    if problems:
        raise SystemExit("VALIDATION FAILED:\n" + "\n".join(problems))

    with open(OUT, "w") as f:
        for rec in notes:
            f.write(json.dumps(rec) + "\n")
    # summary
    from collections import Counter
    cats = Counter()
    for rec in notes:
        for e in rec["entities"]:
            cats[e["label"]] += 1
    wc = [r["word_count"] for r in notes]
    print(f"wrote {len(notes)} notes -> {OUT}")
    print(f"words: min {min(wc)}, max {max(wc)}, mean {sum(wc)/len(wc):.1f}")
    print("PHI by label:", dict(cats), "total:", sum(cats.values()))


if __name__ == "__main__":
    main()
