# Label mapping: MedDeID → our PHI schema

Our pipeline's canonical entity types come from `phiLabelMap` in
`~/workspace/prerounding/repo/src/vault/deid/lexicons.js` (22 types):
ADDRESS, AGE, CONTACT NAME, DATE, DOB, EMAIL, ENCOUNTER ID, FACILITY, ID, IP,
LOCATION, MRN, NAME, OCCUPATION, ORGANIZATION, PATIENT NAME, PHI, PHONE,
PROVIDER NAME, ROOM, TIME, URL.

All 14 MedDeID labels map into our schema; none are excluded. Three MedDeID
labels are ambiguous and are split deterministically on the raw `source_slot`
field (verified clean on all 300 notes — see "Split verification" below).

| # | MedDeID label (n) | Our type | Justification |
|---|---|---|---|
| 1 | Address_Location:Patient (108) | ADDRESS | Full street addresses ("17 Edenhall Crescent, Kinbrace, KW11 6UA"). Our schema maps street-level addresses to ADDRESS. |
| 2 | Address_Location:Caregiver (12) | LOCATION | Locality/town only (LOUGHGUILE, ANNSBOROUGH). No street detail — geographic place, so LOCATION, matching our CITY/STATE/COUNTRY/POSTCODE → LOCATION rule. |
| 3 | Address_Location:Other (18) | LOCATION | Same as above: bare localities (Lacasaidh, HELEN'S BAY). LOCATION. |
| 4 | Age_Birthdate → split (144) | DOB (44) / AGE (100) | `patient.birth_date` slots are calendar birth dates ("17 January 1986") → DOB (our DATE_OF_BIRTH → DOB). `patient.age_abbreviated` / `patient.age_contextual` / `patient.age_hyphenated` are age expressions ("43 y/o", "18-year", "72 years") → AGE (our AGE → AGE). |
| 5 | Contactdetails → split (99) | EMAIL (63) / PHONE (36) | `patient.email` slots are email addresses → EMAIL; `patient.phone` slots are phone numbers ("07700 900035") → PHONE. |
| 6 | Date (160) | DATE | Encounter/follow-up/document dates ("28/07/2026", "1996-01-23"). Not birth dates (those live under Age_Birthdate) → DATE. |
| 7 | ID:Patient → split (266) | MRN (81) / ID (185) | `patient.mrn` slots are medical record numbers → MRN (our MEDICAL_RECORD_NUMBER → MRN). `patient.report_id` (lab accession IDs like "048015141") and `patient.national_id` (NHS-style numbers like "000 327 0743") have no dedicated type in our schema → generic ID. |
| 8 | ID:Caregiver (58) | ID | Caregiver professional/staff IDs ("0833013"). Our schema has no staff-ID type; generic ID is the defensible bucket (not MRN, not ENCOUNTER ID). |
| 9 | Name:Patient (340) | PATIENT NAME | Patient names, all surface forms (initial+surname, given+family, uppercase variants) → PATIENT NAME. |
| 10 | Name:Caregiver (186) | PROVIDER NAME | Caregivers are the clinical staff in these documents. Our schema maps HCW/DOCTOR/PHYSICIAN/STAFF → PROVIDER NAME; caregiver names are the same role. |
| 11 | Name:Other (118) | NAME | Names of third parties (relatives: `relative.*` source slots). Not the patient, not staff → our generic NAME bucket (PERSON/PRIVATE_PERSON → NAME). |
| 12 | Organization:Healthcare (141) | FACILITY | All 88 distinct values are hospitals/medical centres ("Royal Infirmary of Edinburgh", "Maui Memorial Medical Center"). Our schema maps HOSPITAL → FACILITY, distinct from ORGANIZATION. |
| 13 | Organization:Other (28) | ORGANIZATION | Non-healthcare organisations (housing associations, sports clubs, town councils) → ORGANIZATION. |
| 14 | Profession (39) | OCCUPATION | Direct hit: our schema maps PROFESSION → OCCUPATION. Patient occupations ("Builder", "University lecturer"). |

## Edge cases and judgment calls

- **Name:Caregiver → PROVIDER NAME, not NAME.** The MedDeID "caregiver" role covers clinicians authoring or delivering care; collapsing them into generic NAME would lose the patient/provider distinction our pipeline maintains and the benchmark's metadata-enabled evaluation conditions rely on.
- **Organization:Healthcare → FACILITY, not ORGANIZATION.** Verified empirically: every distinct value is a hospital, medical centre, clinic, or infirmary. If a future release adds insurers/commissioners, revisit.
- **Age_Birthdate → AGE vs DOB by slot, not by regex.** Text-shape heuristics are fragile ("2 wk old", "18-year"); `source_slot` is authoritative and was verified 100% consistent (all 44 `patient.birth_date` spans are calendar dates; all 100 `patient.age_*` spans are age expressions).
- **ID:Patient report_id → ID, not ENCOUNTER ID.** Accession/report IDs identify a lab order, not a patient encounter (our ENCOUNTER ID covers CSN/FIN/HAR visit numbers). Generic ID.
- **No exclusions.** Unlike the round-1/2 scorer (which excluded USERNAME/SEX/TITLE/PASS/GEOCOORD), every MedDeID label has a defensible home in our schema, so gold.json keeps all 1,717 spans.

## Split verification (all 300 notes)

- Age_Birthdate: 44 `patient.birth_date` (all calendar dates) → DOB; 39 `patient.age_abbreviated` + 33 `patient.age_contextual` + 28 `patient.age_hyphenated` (all age expressions) → AGE.
- Contactdetails: 63 `patient.email` (all contain "@") → EMAIL; 36 `patient.phone` (none contain "@") → PHONE.
- ID:Patient: 81 `patient.mrn` → MRN; 76 `patient.report_id` + 109 `patient.national_id` → ID; 58 `caregiver.professional_id` → ID.

## Resulting gold type distribution

PATIENT NAME 340 · ID 243 · PROVIDER NAME 186 · DATE 160 · FACILITY 141 ·
NAME 118 · ADDRESS 108 · AGE 100 · MRN 81 · EMAIL 63 · DOB 44 ·
OCCUPATION 39 · PHONE 36 · LOCATION 30 · ORGANIZATION 28. Total 1,717.
