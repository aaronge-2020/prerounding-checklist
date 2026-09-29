#!/usr/bin/env python3
"""Workstream 4: generate 3 sets of 25 synthetic clinical notes with
character-offset PHI ground truth.

ALL content is synthetic and fictional (555-01xx phone numbers, invented
names/addresses/dates). Gold labels use the ai4privacy label vocabulary so the
verbatim score.py scorer can be reused without modification.

FAIRNESS DESIGN: every note, regardless of type, carries the same PHI quota:
  NAME x4 (patient x2 incl. one repeat, provider x2), DATE x3, TIME x1,
  PHONE x1, DOB x1, ID x1 (MRN), LOCATION x3 (city, state, postcode),
  ADDRESS x1 (street), EMAIL x1 in every 3rd note.
=> 15 gold spans per note (16 with email), identical category mix across
discharge / nursing / progress sets. Only the prose style differs.
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent
SEED = 20260929

FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Sarah", "David",
         "Jennifer", "William", "Patricia", "Thomas", "Barbara", "Charles",
         "Susan", "Daniel", "Karen", "Matthew", "Nancy", "Anthony", "Lisa",
         "Mark", "Betty", "Paul", "Sandra", "George", "Ashley", "Kenneth",
         "Dorothy", "Steven", "Michelle", "Brian", "Kimberly", "Edward",
         "Amanda", "Ronald", "Melissa", "Jason", "Deborah", "Jeffrey", "Laura"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
        "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
        "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
        "Lee", "Perez", "Thompson", "White", "Harris", "Clark", "Lewis",
        "Robinson", "Walker", "Hall", "Young", "Allen", "King", "Wright",
        "Scott", "Green", "Baker", "Adams", "Nelson", "Carter"]
PROV_FIRST = ["Emily", "Jonathan", "Priya", "Samuel", "Rachel", "Kevin",
              "Hannah", "Marcus", "Olivia", "Nathan"]
PROV_LAST = ["Chen", "Patel", "Nguyen", "Kim", "Okafor", "Reyes", "Cohen",
             "Fischer", "Ali", "Brooks"]
CITIES = [("Baltimore", "Maryland", "21201"), ("Towson", "Maryland", "21204"),
          ("Columbia", "Maryland", "21044"), ("Annapolis", "Maryland", "21401"),
          ("Frederick", "Maryland", "21701"), ("Rockville", "Maryland", "20850"),
          ("Gaithersburg", "Maryland", "20877"), ("Silver Spring", "Maryland", "20910")]
STREETS = ["W Pratt St", "E Fayette St", "N Charles St", "York Rd",
           "Reisterstown Rd", "Eastern Ave", "W Baltimore St", "Harford Rd"]


class Doc:
    def __init__(self):
        self.text = ""
        self.spans = []

    def add(self, s):
        self.text += s

    def phi(self, value, label):
        start = len(self.text)
        self.text += value
        end = len(self.text)
        for s, e, _ in self.spans:
            assert not (start < e and s < end), f"overlapping gold spans: {value!r}"
        self.spans.append((start, end, label))


def phone(rng):
    return (f"{rng.choice(['410', '443', '667'])}-555-"
            f"{rng.randint(10, 99):02d}{rng.randint(10, 99):02d}")


def mdy(rng, y0=2024, y1=2026):
    return f"{rng.randint(1, 12):02d}/{rng.randint(1, 28):02d}/{rng.randint(y0, y1)}"


def dob(rng):
    return f"{rng.randint(1, 12):02d}/{rng.randint(1, 28):02d}/{rng.randint(1935, 2000)}"


def time_of_day(rng):
    h = rng.randint(7, 18)
    m = rng.choice(["00", "15", "30", "45"])
    ap = "AM" if h < 12 else "PM"
    return f"{h if h <= 12 else h - 12}:{m} {ap}"


def new_patient(rng, used):
    while True:
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        if name not in used:
            used.add(name)
            return name


def new_provider(rng, used):
    # Providers may repeat across notes (realistic); unique within a note.
    while True:
        name = f"{rng.choice(PROV_FIRST)} {rng.choice(PROV_LAST)}"
        if name not in used:
            used.add(name)
            return name


class Kit:
    """One matched PHI kit per note: identical category counts every time."""
    def __init__(self, rng, used_patients):
        up = set()
        self.pt = new_patient(rng, used_patients)
        self.prov = new_provider(rng, up)
        self.prov2 = new_provider(rng, up)
        self.city, self.state, self.zipc = rng.choice(CITIES)
        self.street = f"{rng.randint(100, 9999)} {rng.choice(STREETS)}"
        self.dob = dob(rng)
        self.mrn = f"{rng.randint(100000, 999999):06d}"
        self.dates = [mdy(rng), mdy(rng), mdy(rng)]
        self.time = time_of_day(rng)
        self.phone = phone(rng)
        self.email = f"{self.pt.lower().replace(' ', '.')}@examplemail.com"


def discharge_note(rng, used, idx):
    d = Doc()
    k = Kit(rng, used)
    diag = rng.choice([
        "acute decompensated heart failure", "community-acquired pneumonia",
        "COPD exacerbation", "cellulitis of the left lower extremity",
        "gastrointestinal bleeding, resolved", "syncope, likely vasovagal"])
    d.add("DISCHARGE SUMMARY\n\nPatient: ")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 1
    d.add("    DOB: ")
    d.phi(k.dob, "BOD")                             # DOB
    d.add("    MRN: ")
    d.phi(k.mrn, "IDCARD")                          # ID
    d.add("\nAdmission Date: ")
    d.phi(k.dates[0], "DATE")                       # DATE 1
    d.add("    Discharge Date: ")
    d.phi(k.dates[1], "DATE")                       # DATE 2
    d.add("\nAttending Physician: Dr. ")
    d.phi(k.prov, "LASTNAME1")                      # NAME 2
    d.add("\n\nPRINCIPAL DIAGNOSIS\n" + diag[0].upper() + diag[1:] + "\n")
    d.add("\nHOSPITAL COURSE\n")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 3 (repeat)
    d.add(" was admitted with " + diag + ". The patient responded to therapy and "
          "remained hemodynamically stable throughout the stay.\n")
    d.add("\nDISCHARGE DISPOSITION\nHome. Follow up with Dr. ")
    d.phi(k.prov2, "LASTNAME1")                     # NAME 4
    d.add(" on ")
    d.phi(k.dates[2], "DATE")                       # DATE 3
    d.add(" at ")
    d.phi(k.time, "TIME")                           # TIME
    d.add(". For questions call ")
    d.phi(k.phone, "TEL")                           # PHONE
    d.add(".\n")
    d.add("\nDISCHARGE INSTRUCTIONS\nTake medications as prescribed. Return "
          "if fever, worsening pain, or shortness of breath. Home address: ")
    d.phi(k.street, "STREET")                       # ADDRESS
    d.add(", ")
    d.phi(k.city, "CITY")                           # LOCATION 1
    d.add(", ")
    d.phi(k.state, "STATE")                         # LOCATION 2
    d.add(" ")
    d.phi(k.zipc, "POSTCODE")                       # LOCATION 3
    d.add(".\n")
    if idx % 3 == 0:
        d.add("Visit summary emailed to ")
        d.phi(k.email, "EMAIL")                      # EMAIL
        d.add(".\n")
    d.add("\nElectronically signed.\n")
    return d


def nursing_note(rng, used, idx):
    d = Doc()
    k = Kit(rng, used)
    d.add("NURSING NOTE\nDate: ")
    d.phi(k.dates[0], "DATE")                       # DATE 1
    d.add("    Patient: ")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 1
    d.add("    MRN ")
    d.phi(k.mrn, "IDCARD")                          # ID
    d.add("    DOB ")
    d.phi(k.dob, "BOD")                             # DOB
    d.add("\n")
    d.phi(k.time, "TIME")                           # TIME
    d.add(" - Pt resting in bed, c/o pain 6/10 ")
    d.add(rng.choice(["LLE", "abdomen", "chest", "back"]) + ". ")
    d.add("Med given per MAR. Will recheck.\n")
    d.add("Pt from ")
    d.phi(k.city, "CITY")                           # LOCATION 1
    d.add(", ")
    d.phi(k.state, "STATE")                         # LOCATION 2
    d.add(" ")
    d.phi(k.zipc, "POSTCODE")                       # LOCATION 3
    d.add(". Home: ")
    d.phi(k.street, "STREET")                       # ADDRESS
    d.add(".\nCalled Dr. ")
    d.phi(k.prov, "LASTNAME1")                      # NAME 2
    d.add(" re labs drawn ")
    d.phi(k.dates[1], "DATE")                       # DATE 2
    d.add(", new orders received and read back.\n")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 3 (repeat)
    d.add(" tolerated breakfast, ambulating with assist. Family updated by "
          "phone at ")
    d.phi(k.phone, "TEL")                           # PHONE
    d.add(". Repeat assessment due ")
    d.phi(k.dates[2], "DATE")                       # DATE 3
    d.add(".\n")
    if idx % 3 == 0:
        d.add("Teaching handout emailed to ")
        d.phi(k.email, "EMAIL")                      # EMAIL
        d.add(".\n")
    d.add("RN: ")
    d.phi(k.prov2, "LASTNAME1")                     # NAME 4
    d.add("\n")
    return d


def progress_note(rng, used, idx):
    d = Doc()
    k = Kit(rng, used)
    d.add("PROGRESS NOTE\nDate: ")
    d.phi(k.dates[0], "DATE")                       # DATE 1
    d.add("\nPatient: ")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 1
    d.add("    DOB: ")
    d.phi(k.dob, "BOD")                             # DOB
    d.add("    MRN: ")
    d.phi(k.mrn, "IDCARD")                          # ID
    d.add("\nAttending: Dr. ")
    d.phi(k.prov, "LASTNAME1")                      # NAME 2
    d.add("\n\nS: ")
    d.phi(k.pt, "GIVENNAME1")                       # NAME 3 (repeat)
    d.add(" reports " + rng.choice([
        "improved breathing overnight, slept through the night",
        "mild nausea this morning, otherwise feeling better",
        "pain much improved, able to walk to the bathroom",
        "feeling stronger today, appetite returning"]) + ". ")
    d.add("Denies chest pain, fever, or new complaints.\n\nO: Vitals stable. "
          "Exam unchanged. Labs from ")
    d.phi(k.dates[1], "DATE")                       # DATE 2
    d.add(" reviewed.\n\nA/P: Continue current plan. Advance diet as "
          "tolerated. Physical therapy to evaluate today at ")
    d.phi(k.time, "TIME")                           # TIME
    d.add(".\nDischarge planning: home to ")
    d.phi(k.street, "STREET")                       # ADDRESS
    d.add(", ")
    d.phi(k.city, "CITY")                           # LOCATION 1
    d.add(" ")
    d.phi(k.zipc, "POSTCODE")                       # LOCATION 3
    d.add(" (")
    d.phi(k.state, "STATE")                         # LOCATION 2
    d.add("). Follow-up ")
    d.phi(k.dates[2], "DATE")                       # DATE 3
    d.add("; confirm by calling ")
    d.phi(k.phone, "TEL")                           # PHONE
    d.add(".\n")
    if idx % 3 == 0:
        d.add("After-visit summary sent to ")
        d.phi(k.email, "EMAIL")                      # EMAIL
        d.add(".\n")
    d.add("\nDr. ")
    d.phi(k.prov2, "LASTNAME1")                     # NAME 4
    d.add("\n")
    return d


BUILDERS = {"discharge": discharge_note, "nursing": nursing_note,
            "progress": progress_note}
PREFIX = {"discharge": "dis", "nursing": "nur", "progress": "pro"}


def main():
    rng = random.Random(SEED)
    used = set()
    for ntype, builder in BUILDERS.items():
        ddir = OUT / f"data-{ntype}"
        ddir.mkdir(parents=True, exist_ok=True)
        rows = []
        for i in range(1, 26):
            d = builder(rng, used, i)
            rows.append({
                "id": f"{PREFIX[ntype]}-{i:02d}",
                "source_text": d.text,
                "privacy_mask": [
                    {"label": lab, "start": s, "end": e}
                    for s, e, lab in d.spans
                ],
            })
        with open(ddir / "sample.jsonl", "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        manifest = {
            "dataset": f"ws4 synthetic clinical notes ({ntype}); ALL SYNTHETIC, no real PHI",
            "dataset_doi": None,
            "split_file": f"data-{ntype}/sample.jsonl",
            "seed": SEED,
            "sampled_n": len(rows),
            "note_type": ntype,
            "generator": "notes/gen_notes.py",
            "phi_quota_per_note": ("NAME x4-5, DATE x3-4, TIME x1, PHONE x1, "
                                   "DOB x1, ID x1, LOCATION x3, ADDRESS x1, "
                                   "EMAIL x1 in every 3rd note"),
            "license": "synthetic fixture, no license restriction",
        }
        with open(ddir / "sample_manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)
        nwords = sum(len(r["source_text"].split()) for r in rows)
        nphi = sum(len(r["privacy_mask"]) for r in rows)
        print(f"{ntype}: {len(rows)} notes, {nwords} words, {nphi} gold spans, "
              f"{nphi / nwords * 100:.2f} PHI/100w")


if __name__ == "__main__":
    main()
