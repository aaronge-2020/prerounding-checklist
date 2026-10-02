#!/usr/bin/env python3
"""Workstream 4 edge-case suite: ~27 targeted synthetic snippets with known
expected redactions. ALL content synthetic. Writes:
  data-edge/sample.jsonl   (id, source_text, privacy_mask=[]) for the driver
  data-edge/expected.json  (id -> {expected: [{value,start,end,note}],
                                   expect_absent: [{value,start,end,note}]})
Judgment (judge_edge.py): PASS iff every expected span is covered >=80% by a
predicted entity (hybrid mode); expect_absent spans must have zero overlap.
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data-edge"
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(777)

cases = []  # (id, text, expected[(value, note)], absent[(value, note)])


def add(cid, text, expected=(), absent=()):
    cases.append((cid, text, list(expected), list(absent)))


# ---- names ---------------------------------------------------------------
add("E01-misspelled-name",
    "Patient Jonh Smtih was admitted for observation.",
    [("Jonh Smtih", "misspelled first+last name")])
add("E02-allcaps-name",
    "PATIENT: JOHN SMITH\nDOB 01/02/1970",
    [("JOHN SMITH", "all-caps name"), ("01/02/1970", "DOB")])
add("E03-lowercase-apostrophe",
    "nurse noted jane o'brien resting comfortably.",
    [("jane o'brien", "lowercase name with apostrophe")])
add("E04-hyphenated-name",
    "Mary-Jane Watson-Parker signed the consent form.",
    [("Mary-Jane Watson-Parker", "hyphenated first+last name")])

# ---- dates ---------------------------------------------------------------
add("E05-date-ordinal",
    "Follow up on 24th Sept 2026 with cardiology.",
    [("24th Sept 2026", "ordinal date, month abbrev, year")])
add("E06-date-dots",
    "DOB 09.24.2026, admitted for testing.",
    [("09.24.2026", "dot-separated date")])
add("E07-date-yearless",
    "Patient was seen Sept 24th and will return in two weeks.",
    [("Sept 24th", "month + ordinal day, no year")])

# ---- phones --------------------------------------------------------------
add("E08-phone-plus1",
    "Call +1 (410) 555-0132 for questions.",
    [("+1 (410) 555-0132", "E.164-ish US phone")])
add("E09-phone-dots",
    "Callback number 410.555.0132.",
    [("410.555.0132", "dot-separated phone")])
add("E10-phone-intl",
    "Next of kin reachable at +44 20 7946 0958.",
    [("+44 20 7946 0958", "international phone")])

# ---- placeholders --------------------------------------------------------
add("E11-test-patient",
    "This is a note about Test Patient, DOB 01/02/1970.",
    [("Test Patient", "placeholder-like name (KNOWN model gap)"),
     ("01/02/1970", "DOB")])
add("E12-john-doe",
    "John Doe was brought in by EMS.",
    [("John Doe", "placeholder-like name")])
add("E13-patient-x",
    "Patient X tolerated the procedure well.",
    [],
    [("Patient X", "single-letter placeholder: should NOT be flagged")])

# ---- punctuation / line breaks -------------------------------------------
add("E14-no-space-comma",
    "Attending:Smith,John signed the orders.",
    [("Smith", "surname before comma, no space"),
     ("John", "given name after comma, no space")])
add("E15-dob-newline",
    "DOB:\n01/02/1970\nMRN 445123",
    [("01/02/1970", "date after line break"), ("445123", "MRN digits")])

# ---- long note -----------------------------------------------------------
filler = ("The patient remains hemodynamically stable. Vital signs within "
          "normal limits. Lungs clear to auscultation bilaterally. Heart "
          "regular rate and rhythm. Abdomen soft, nontender. Neurologically "
          "intact. Continue current medications and advance diet as tolerated. "
          "Physical therapy consulted. Social work following for discharge "
          "planning. Family updated and understands the plan of care. ")
long_text = ("PROGRESS NOTE\nDate: 09/24/2026\nPatient: Robert Longfellow\n\n"
             + filler * 46
             + "\nPlan discussed with patient at length. Questions answered. "
             "For follow-up call 410-555-0147. Electronically signed by "
             "Dr. Zachary Quill.")
add("E16-long-note",
    long_text,
    [("Robert Longfellow", "name at note start"),
     ("09/24/2026", "date at note start"),
     ("410-555-0147", "phone near note end"),
     ("Zachary Quill", "name at very end of 2000+ word note")])

# ---- aliases -------------------------------------------------------------
add("E17-alias-variants",
    "Dr. Alan Smith evaluated the patient. Smith was consulted by phone. "
    "J. Smith signed the note.",
    [("Alan Smith", "full name with title"),
     ("Smith", "bare surname mention"),
     ("J. Smith", "initial + surname")])

# ---- ages ----------------------------------------------------------------
add("E18-age-hyphen",
    "The 47-year-old male presents with chest pain.",
    [("47-year-old", "hyphenated age")])
add("E19-age-word",
    "Patient is age 47 with no significant history.",
    [("age 47", "age as words")])
add("E20-age-slash",
    "47 y/o F here for annual exam.",
    [("47 y/o", "slash age abbreviation")])
add("E21-age-89plus",
    "The 92-year-old was admitted; her husband, age 91, is the contact.",
    [("92-year-old", "age over 89 (HIPAA-sensitive)"),
     ("age 91", "age over 89 as words")])

# ---- ids -----------------------------------------------------------------
add("E22-mrn-hash",
    "MRN# 0045123 pulled for review.",
    [("0045123", "MRN with hash, leading zeros")])
add("E23-chart-id",
    "Old chart 45123 was merged into the new record.",
    [("45123", "bare chart number")])
add("E24-ssn",
    "SSN 000-12-3456 on file (synthetic, impossible area number).",
    [("000-12-3456", "SSN-format ID")])

# ---- misc ----------------------------------------------------------------
add("E25-email-plus",
    "Send the summary to j.smith+clinic@examplemail.com.",
    [("j.smith+clinic@examplemail.com", "email with plus tag")])
add("E26-address-apt",
    "Home: 1234 W Pratt St Apt 5B, Baltimore MD 21201.",
    [("1234 W Pratt St Apt 5B", "street with apartment"),
     ("Baltimore", "city"), ("MD", "state abbrev"), ("21201", "zip")])
add("E27-time-date",
    "Procedure scheduled 09/24/2026 at 2:30 PM in the main OR.",
    [("09/24/2026", "date"), ("2:30 PM", "time")])

rows, expected = [], {}
for cid, text, exp, absent in cases:
    rows.append({"id": cid, "source_text": text, "privacy_mask": []})

    def locate(vals):
        out = []
        for value, note in vals:
            start = text.find(value)
            assert start >= 0, f"value not found: {value!r} in {cid}"
            out.append({"value": value, "start": start,
                        "end": start + len(value), "note": note})
        return out

    expected[cid] = {"expected": locate(exp), "expect_absent": locate(absent)}

with open(OUT / "sample.jsonl", "w") as f:
    for r in rows:
        f.write(json.dumps(r) + "\n")
with open(OUT / "sample_manifest.json", "w") as f:
    json.dump({"dataset": "ws4 edge-case suite; ALL SYNTHETIC",
               "dataset_doi": None,
               "split_file": "data-edge/sample.jsonl",
               "seed": 777, "sampled_n": len(rows),
               "generator": "notes/gen_edge.py",
               "license": "synthetic fixture, no license restriction"},
              f, indent=2)
with open(OUT / "expected.json", "w") as f:
    json.dump(expected, f, indent=2)

n_exp = sum(len(v["expected"]) for v in expected.values())
n_abs = sum(len(v["expect_absent"]) for v in expected.values())
long_w = len(long_text.split())
print(f"{len(rows)} edge cases, {n_exp} expected spans, {n_abs} expect-absent; "
      f"E16 length: {long_w} words / {len(long_text)} chars")
