export const clinicalGuardTerms = [
  "HPI",
  "PMH",
  "PSH",
  "ROS",
  "A/P",
  "SOAP",
  "CC",
  "ED",
  "ICU",
  "SOB",
  "DOE",
  "DKA",
  "AKI",
  "CKD",
  "CHF",
  "COPD",
  "CAD",
  "T1DM",
  "T2DM",
  "CBC",
  "BMP",
  "CMP",
  "TSH",
  "A1c",
  "Chest Pain",
  "Shortness Of Breath",
  "History of Present Illness",
  "Present Illness",
  "Past Medical History",
  "Heart Rate",
  "Blood Pressure",
  "General: Awake",
  "Insulin Glargine",
  "Anion Gap",
  "Type 1 Diabetes Mellitus",
  "Free T4",
  "Beta-hydroxybutyrate",
  "Atypical Chest",
  "Chronic Pain",
  "Home Escitalopram",
  "Heart Healthy",
  "Last Reading",
  "Hour Range",
  "Pulmonary Toilet",
  "Bowel Management",
  "Fall Risk",
  "Suicide Risk",
  "Elopement Risk",
  "Elopmement Risk",
  "Daily Labs",
  "Immature Grans"
];

const patients = [
  ["John", "Smith"], ["Alicia", "Rivera"], ["Marcus", "Chen"], ["Nina", "Patel"], ["Owen", "Brooks"],
  ["Hannah", "Kim"], ["Luis", "Garcia"], ["Priya", "Shah"], ["Ethan", "Miller"], ["Maya", "Johnson"],
  ["Caleb", "Davis"], ["Sofia", "Martinez"], ["Noah", "Brown"], ["Ava", "Wilson"], ["Leo", "Anderson"],
  ["Iris", "Thomas"], ["Milo", "Taylor"], ["Zoe", "Moore"], ["Theo", "Jackson"], ["Lena", "White"]
];

const providers = [
  ["Emily", "Johnson"], ["Michael", "Lee"], ["Sarah", "Nguyen"], ["Daniel", "Carter"], ["Rachel", "Green"],
  ["Thomas", "Bennett"], ["Olivia", "Price"], ["Kevin", "Wong"], ["Laura", "Foster"], ["Amir", "Hassan"],
  ["Julia", "Reed"], ["Peter", "Morgan"], ["Elena", "Rossi"], ["Victor", "Hale"], ["Grace", "Lin"],
  ["Samuel", "Ortiz"], ["Claire", "Young"], ["Noelle", "Parker"], ["Henry", "Scott"], ["Mina", "Cho"]
];

const contacts = [
  ["Mary", "Smith"], ["Teresa", "Rivera"], ["Linda", "Chen"], ["Meera", "Patel"], ["Karen", "Brooks"],
  ["Soo", "Kim"], ["Rosa", "Garcia"], ["Anika", "Shah"], ["Ellen", "Miller"], ["Donna", "Johnson"],
  ["Paula", "Davis"], ["Lucia", "Martinez"], ["Janet", "Brown"], ["Renee", "Wilson"], ["Carla", "Anderson"],
  ["Diane", "Thomas"], ["Tara", "Taylor"], ["Nora", "Moore"], ["Martha", "Jackson"], ["Helen", "White"]
];

const facilities = [
  "Riverside General Hospital",
  "North Valley Medical Center",
  "Pinecrest University Hospital",
  "Harborview Community Hospital",
  "Lakewood Regional Medical Center",
  "Summit County Hospital",
  "Cedar Park Medical Center",
  "Westbridge Health System",
  "Maple Grove Hospital",
  "Elm Street Clinic"
];

const pharmacies = [
  "Lakeside Pharmacy",
  "Cedar Care Pharmacy",
  "Market Square Pharmacy",
  "Hilltop Pharmacy",
  "Oak Valley Pharmacy",
  "Bridgeway Pharmacy",
  "North Star Pharmacy",
  "Central Med Pharmacy",
  "Garden Plaza Pharmacy",
  "Riverbend Pharmacy"
];

const streets = [
  "123 Maple Avenue",
  "80 Market Street",
  "415 Cedar Lane",
  "900 Oak Road",
  "22 Pine Street",
  "310 Birch Drive",
  "77 Hillcrest Avenue",
  "6 Garden Way",
  "450 Lake Road",
  "18 Summit Court"
];

const cities = [
  "Springfield, IL 62704",
  "Fairview, CA 94016",
  "Madison, WI 53703",
  "Columbus, OH 43215",
  "Boulder, CO 80302",
  "Raleigh, NC 27601",
  "Portland, OR 97205",
  "Austin, TX 78701",
  "Albany, NY 12207",
  "Mesa, AZ 85201"
];

function pad(number, width = 2) {
  return String(number).padStart(width, "0");
}

function pick(list, index) {
  return list[index % list.length];
}

function makeRecord(index) {
  const patientParts = pick(patients, index);
  const providerParts = pick(providers, index);
  const referringParts = pick(providers, index + 1);
  const contactParts = pick(contacts, index);
  const facility = pick(facilities, index);
  const pharmacy = pick(pharmacies, index);
  const street = pick(streets, index);
  const pharmacyStreet = pick(streets, index + 1);
  const city = pick(cities, index);
  const birthYear = 1978 + (index % 26);
  const month = (index % 12) + 1;
  const day = (index % 27) + 1;
  return {
    patient: `${patientParts[0]} ${patientParts[1]}`,
    contact: `${contactParts[0]} ${contactParts[1]}`,
    provider: `Dr. ${providerParts[0]} ${providerParts[1]}`,
    referringProvider: `Dr. ${referringParts[0]} ${referringParts[1]}`,
    dob: `${pad(month)}/${pad(day)}/${birthYear}`,
    encounterDate: `${pick(["April", "May", "June", "July", "August"], index)} ${day}, 2026`,
    mrn: `${patientParts[0][0]}${patientParts[1][0]}-${2040000 + index * 137}`,
    csn: `${99880000 + index * 101}`,
    account: `HMO-${70000 + index * 13}`,
    phone: `(555) ${410 + (index % 80)}-${2200 + index}`,
    contactPhone: `(555) ${510 + (index % 80)}-${3300 + index}`,
    email: `${patientParts[0].toLowerCase()}.${patientParts[1].toLowerCase()}${index}@example.com`,
    address: `${street}, ${city}`,
    pharmacyAddress: `${pharmacyStreet}, ${city}`,
    facility,
    pharmacy,
    unit: `${3 + (index % 5)} East`,
    room: `${400 + index}${String.fromCharCode(65 + (index % 4))}`
  };
}

function identifierMap(record) {
  return [
    ["PATIENT NAME", record.patient],
    ["CONTACT NAME", record.contact],
    ["PROVIDER NAME", record.provider],
    ["PROVIDER NAME", record.referringProvider],
    ["DOB", record.dob],
    ["DATE", record.encounterDate],
    ["MRN", record.mrn],
    ["ENCOUNTER ID", record.csn],
    ["ID", record.account],
    ["PHONE", record.phone],
    ["PHONE", record.contactPhone],
    ["EMAIL", record.email],
    ["ADDRESS", record.address],
    ["ADDRESS", record.pharmacyAddress],
    ["FACILITY", record.facility],
    ["ORGANIZATION", record.pharmacy],
    ["ROOM", record.unit],
    ["ROOM", record.room]
  ];
}

function findAllSpans(text, value, label) {
  const spans = [];
  if (!value) {
    return spans;
  }
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(value, start);
    if (index === -1) {
      break;
    }
    spans.push({ start: index, end: index + value.length, text: value, label });
    start = index + value.length;
  }
  return spans;
}

function finalizeCase(id, category, text, record, requiredSnippets = [], extraIdentifiers = []) {
  const spans = [...identifierMap(record), ...extraIdentifiers].flatMap(([label, value]) => findAllSpans(text, value, label));
  const forbidden = [...new Set(spans.map((span) => span.text))];
  const clinicalTerms = clinicalGuardTerms.filter((term) => text.includes(term));
  const mustPreserve = [...new Set([...requiredSnippets, ...clinicalTerms])];
  return {
    id,
    category,
    tags: [category, "synthetic", "regression"],
    text,
    mustRedact: forbidden,
    mustPreserve,
    forbiddenWarningSnippets: clinicalTerms,
    expectedPlaceholders: requiredSnippets,
    forbidden,
    groundTruthSpans: spans,
    clinicalTerms,
    requiredSnippets
  };
}

function endocrineDemo(id, record) {
  const text = `SOAP NOTE:
SYNTHETIC DEMO SOAP NOTE
All names, dates, locations, and contact details below are fake demo data.
Patient Name: ${record.patient}
DOB: ${record.dob}
MRN: ${record.mrn} CSN: ${record.csn} Encounter date: ${record.encounterDate}
Phone: ${record.phone}
Email: ${record.email}
Address: ${record.address}
Facility: ${record.facility} Unit: ${record.unit} Room: ${record.room}
Primary endocrinologist: ${record.provider}, mother ${record.contact}, ${record.contactPhone}
Referring Provider: ${record.referringProvider}
Preferred pharmacy: ${record.pharmacy}, ${record.pharmacyAddress}
Insurance ID: ${record.account}

Service: Endocrinology consult
Hospital day: 2
Reason for consult: Diabetic ketoacidosis now resolved; transition from insulin infusion to subcutaneous insulin

Subjective:
${record.patient} is a 26-year-old adult with Type 1 Diabetes Mellitus and autoimmune hypothyroidism admitted to ${record.facility} with diabetic ketoacidosis after missing basal insulin during two days of viral gastroenteritis. The patient feels better this morning. ${record.patient} can bring the home insulin pen box to Room ${record.room} this afternoon.

Objective:
Vitals: Heart Rate 88, Blood Pressure 118/72, SpO2 97 percent on room air
Exam: General: Awake, comfortable, no acute distress
Labs: Anion Gap 10, Free T4 1.0, Beta-hydroxybutyrate 0.4
Current medications: Insulin Glargine 20 units every morning

Assessment:
DKA has resolved. Ongoing endocrine priorities are preventing recurrent ketosis, matching prandial insulin to intake, maintaining potassium during insulin therapy, and ensuring discharge supplies and sick-day education.

Plan:
Send prescriptions to ${record.pharmacy} and confirm ${record.patient} has insulin, ketone strips, and glucagon before leaving ${record.facility}.`;

  return finalizeCase(id, "endocrine-demo", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Primary endocrinologist: [PROVIDER NAME]"
  ]);
}

function generalMedicine(id, record) {
  const text = `Patient Name: ${record.patient}
DOB: ${record.dob}
MRN: ${record.mrn}
CSN: ${record.csn}
Facility: ${record.facility}
Unit: ${record.unit}
Room: ${record.room}
Emergency contact: ${record.contact}, ${record.contactPhone}
Provider: ${record.provider}
Account Number: ${record.account}

General medicine progress note dated ${record.encounterDate}.
${record.patient} is admitted for acute decompensated heart failure and improving after IV diuresis.
Heart Rate 92. Blood Pressure 126/74. General: Awake and conversant.
The plan is to continue diuresis and call ${record.contact} after rounds if discharge timing changes.`;

  return finalizeCase(id, "general-medicine", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Emergency contact: [CONTACT NAME]"
  ]);
}

function icuNote(id, record) {
  const text = `ICU DAILY NOTE
Name: ${record.patient}
Date of birth: ${record.dob}
Medical Record Number: ${record.mrn}
Encounter ID: ${record.csn}
Hospital: ${record.facility}
ICU room: ${record.room}
Attending: ${record.provider}
Phone: ${record.phone}
Email: ${record.email}

Interval events from ${record.encounterDate}: ${record.patient} remains on high-flow oxygen but is more alert.
Heart Rate 104, Blood Pressure 102/66. General: Awake after sedation pause.
Avoid redacting clinical phrases: Anion Gap, Free T4, Beta-hydroxybutyrate.`;

  return finalizeCase(id, "icu", text, record, [
    "Name: [PATIENT NAME]",
    "Attending: [PROVIDER NAME]"
  ]);
}

function admissionNote(id, record) {
  const text = `ED/admission intake
Patient: ${record.patient}
D.O.B.: ${record.dob}
Phone: ${record.phone}
Address: ${record.address}
MRN: ${record.mrn}
FIN: ${record.csn}
Facility: ${record.facility} Unit: ${record.unit} Room: ${record.room}
PCP: ${record.provider}
Emergency contact: ${record.contact} ${record.contactPhone}
Preferred pharmacy: ${record.pharmacy}, ${record.pharmacyAddress}

Chief concern: nausea and hyperglycemia.
Date of service: ${record.encounterDate}
The patient reports Type 1 Diabetes Mellitus, uses Insulin Glargine, and has no chest pain.`;

  return finalizeCase(id, "ed-admission", text, record, [
    "Patient: [PATIENT NAME]",
    "Preferred pharmacy: [ORGANIZATION]"
  ]);
}

function consultNote(id, record) {
  const text = `Consult note
Patient Name: ${record.patient}
DOB: ${record.dob}
MRN: ${record.mrn}
Referring provider: ${record.referringProvider}
Consultant: ${record.provider}
Callback: ${record.phone}
Facility: ${record.facility}
Room: ${record.room}
Encounter date: ${record.encounterDate}

Reason for consult: endocrine recommendations.
${record.provider} saw ${record.patient} and spoke with ${record.contact} at ${record.contactPhone}.
Medication safety: Insulin Glargine should continue even during poor oral intake.`;

  return finalizeCase(id, "consult", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Referring provider: [PROVIDER NAME]"
  ]);
}

function labHeader(id, record) {
  const text = `LAB RESULT
Collected: ${record.encounterDate}
Patient Name: ${record.patient}
DOB: ${record.dob}
MRN: ${record.mrn}
CSN: ${record.csn}
Ordering provider: ${record.provider}
Lab location: ${record.facility}
Specimen ID: ${record.account}

Glucose 188
Sodium 137
Potassium 3.8
Anion Gap 10
Free T4 1.0
Beta-hydroxybutyrate 0.4`;

  return finalizeCase(id, "lab-header", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Ordering provider: [PROVIDER NAME]"
  ]);
}

function freeTextMessage(id, record) {
  const text = `Secure message:
Patient Name: ${record.patient}
Phone: ${record.phone}
Email: ${record.email}
Emergency contact: ${record.contact}

Please call ${record.patient} about insulin supplies before discharge from ${record.facility}. ${record.contact} will pick up ketone strips at ${record.pharmacy}. Use callback ${record.contactPhone}.`;

  return finalizeCase(id, "free-text-message", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Emergency contact: [CONTACT NAME]"
  ]);
}

function messyChart(id, record) {
  const text = `Pasted chart row
Patient Name: ${record.patient} | DOB: ${record.dob} | MRN: ${record.mrn} | CSN: ${record.csn}
Facility: ${record.facility} Unit: ${record.unit} Room: ${record.room}
Address: ${record.address}
Preferred pharmacy: ${record.pharmacy}, ${record.pharmacyAddress}
Provider: ${record.provider}; Emergency contact: ${record.contact}; Callback ${record.contactPhone}
Insurance ID: ${record.account}

Clean clinical text: Heart Rate and Blood Pressure improved. General: Awake. Type 1 Diabetes Mellitus with Insulin Glargine.`;

  return finalizeCase(id, "messy-chart", text, record, [
    "Patient Name: [PATIENT NAME]",
    "Facility: [FACILITY]"
  ]);
}

function cleanClinical(id, record) {
  const text = `Clean clinical text without direct identifiers.
Heart Rate 88 and Blood Pressure 118/72.
General: Awake, comfortable, no acute distress.
Insulin Glargine 20 units every morning.
Anion Gap closed on two consecutive checks.
Type 1 Diabetes Mellitus with improving oral intake.
Free T4 1.0 and Beta-hydroxybutyrate 0.4.
Assessment includes the Blue Ridge protocol as a teaching phrase that should not be auto-redacted.`;

  return finalizeCase(id, "clean-clinical", text, record, []);
}

function strongContextFollowUp(id, record) {
  const text = `Follow-up/discharge task list
Patient Name: ${record.patient}
DOB: ${record.dob}
MRN: ${record.mrn}
Address: ${record.address}
Facility: ${record.facility}
Room: ${record.room}

Before discharge, confirm ${record.patient} has medications and ask ${record.provider} to send refills to ${record.pharmacy}. Call ${record.contact} at ${record.contactPhone} if teaching is delayed.
Clinical phrases to preserve: Heart Rate, Blood Pressure, Insulin Glargine, Anion Gap.`;

  return finalizeCase(id, "discharge-follow-up", text, record, [
    "Patient Name: [PATIENT NAME]"
  ]);
}

function hyphenatedIdentityCase(id, record) {
  const patient = "Sita Gerrill-Stevenson";
  const titleFull = "Ms. Sita Gerrill-Stevenson";
  const titleSurname = "Ms. Gerrill-Stevenson";
  const fuzzyTitleSurname = "Ms Merrill-Stevenson";
  const surname = "Gerrill-Stevenson";
  const customRecord = { ...record, patient };
  const text = `Adversarial progress note
One-line summary: ${titleFull} is a 57 y.o. female who presents with chest pain radiating to the shoulder.
Overall Assessment:
${fuzzyTitleSurname} is a 57-year-old woman admitted for work-up for atypical chest pain.
Plan: follow up with ${titleSurname} after discharge. ${surname} will call if symptoms recur.

#Atypical Chest Pain, resolved
#Chronic Pain
- Home Escitalopram 40mg daily
# Diet: Heart Healthy
Last Reading 24-Hour Range
Pulmonary Toilet
Bowel Management
Fall Risk
Suicide Risk
Elopmement Risk
Daily Labs
Immature Grans (Abs): 0.01`;

  return finalizeCase(id, "hyphenated-identity", text, customRecord, [
    "#Atypical Chest Pain, resolved",
    "Home Escitalopram"
  ], [
    ["PATIENT NAME", titleFull],
    ["PATIENT NAME", titleSurname],
    ["PATIENT NAME", fuzzyTitleSurname],
    ["PATIENT NAME", surname]
  ]);
}

function apostropheSuffixCase(id, record) {
  const patient = "Liam O'Connor";
  const titleFull = "Mr. Liam O'Connor Jr.";
  const titleSurname = "Mr O'Connor";
  const provider = "Dr. Tessa McAllister";
  const customRecord = { ...record, patient, provider };
  const text = `Admission note
One-line summary: ${titleFull} is a 64-year-old man admitted for syncope.
Patient Name: ${patient}
Provider: ${provider}
The patient reports dizziness. ${titleSurname} denies chest pain this morning.
Follow-up with ${provider} after discharge.
Clinical headings to preserve: Last Reading, Hour Range, Daily Labs, Immature Grans.`;

  return finalizeCase(id, "apostrophe-suffix", text, customRecord, [
    "Last Reading",
    "Daily Labs"
  ], [
    ["PATIENT NAME", titleFull],
    ["PATIENT NAME", titleSurname],
    ["PROVIDER NAME", provider]
  ]);
}

function providerSchedulingCase(id, record) {
  const provider = "Dr. Noelle Parker";
  const providerShort = "Dr Parker";
  const customRecord = { ...record, provider };
  const text = `Discharge coordination
Patient Name: ${record.patient}
MRN: ${record.mrn}
Follow up with ${provider} in endocrine clinic.
Scheduling with ${providerShort} should occur before discharge if possible.
Provider Referral
Abnormal Labs
Pulmonary Toilet
Bowel Management`;

  return finalizeCase(id, "provider-scheduling", text, customRecord, [
    "Provider Referral",
    "Abnormal Labs",
    "Pulmonary Toilet"
  ], [
    ["PROVIDER NAME", provider],
    ["PROVIDER NAME", providerShort]
  ]);
}

function sameSurnameFamilyCase(id, record) {
  const patient = "Jordan Smith";
  const contact = "Jamie Smith";
  const customRecord = { ...record, patient, contact };
  const text = `Patient Name: ${patient}
Emergency contact: ${contact}, ${record.contactPhone}
${patient} is admitted for pneumonia.
Call ${contact} after rounds if the discharge plan changes.
The word Smith alone appears in a teaching aside and should not be used as the only identity signal.`;

  return finalizeCase(id, "same-surname-family", text, customRecord, [
    "Smith alone"
  ], [
    ["PATIENT NAME", patient],
    ["CONTACT NAME", contact]
  ]);
}

function medicalFalsePositiveCase(id, record) {
  const text = `Clean clinical table without patient identifiers
#Atypical Chest Pain, resolved
#Chronic Pain
- Home Escitalopram 40mg daily
# Diet: Heart Healthy
Last Reading 24-Hour Range
Pulmonary Toilet
Bowel Management
Fall Risk
Suicide Risk
Elopement Risk
Elopmement Risk
Daily Labs
Immature Grans (Abs): 0.01
Heart Rate 70
Blood Pressure 159/81
Anion Gap 7
Type 1 Diabetes Mellitus teaching phrase
Free T4 and Beta-hydroxybutyrate preserved`;

  return finalizeCase(id, "medical-false-positive", text, record, [
    "Atypical Chest Pain",
    "Chronic Pain",
    "Home Escitalopram",
    "Immature Grans"
  ]);
}

const templates = [
  endocrineDemo,
  generalMedicine,
  icuNote,
  admissionNote,
  consultNote,
  labHeader,
  freeTextMessage,
  messyChart,
  cleanClinical,
  strongContextFollowUp,
  hyphenatedIdentityCase,
  apostropheSuffixCase,
  providerSchedulingCase,
  sameSurnameFamilyCase,
  medicalFalsePositiveCase
];

export function makeDemoLikeCase() {
  return endocrineDemo("demo-dka-john-smith", makeRecord(0));
}

export function makeSyntheticCases(count = 250) {
  const cases = [];
  for (let index = 0; index < count; index += 1) {
    const template = templates[index % templates.length];
    cases.push(template(`case-${String(index + 1).padStart(3, "0")}`, makeRecord(index)));
  }
  return cases;
}

function makeAdversarialCase(id, category, text, {
  mustRedact = [],
  mustPreserve = [],
  forbiddenWarningSnippets = mustPreserve,
  expectedPlaceholders = [],
  tags = []
} = {}) {
  const preserve = [...new Set(mustPreserve)];
  return {
    id,
    category,
    tags: [...new Set([category, "adversarial", ...tags])],
    text,
    mustRedact: [...new Set(mustRedact)],
    mustPreserve: preserve,
    forbiddenWarningSnippets: [...new Set(forbiddenWarningSnippets)],
    expectedPlaceholders: [...new Set(expectedPlaceholders)],
    forbidden: [...new Set(mustRedact)],
    groundTruthSpans: mustRedact.flatMap((value) => findAllSpans(text, value, "NAME")),
    clinicalTerms: preserve,
    requiredSnippets: [...new Set(expectedPlaceholders)]
  };
}

export function makeAdversarialCases() {
  return [
    makeAdversarialCase(
      "adv-dka-residual-promotion",
      "residual-name-false-positive",
      `HPI:
Chest Pain
Past Medical History
Assessment Plan
Shortness Of Breath
Daily Labs

HPI: Ms. Jane Doe is a 57-year-old woman with DKA. Per Dr. Hu. Room: C3E 54-A.`,
      {
        mustRedact: ["Ms. Jane Doe", "Dr. Hu", "C3E 54-A"],
        mustPreserve: ["HPI", "Chest Pain", "Past Medical History", "Assessment Plan", "Shortness Of Breath", "Daily Labs", "DKA"],
        expectedPlaceholders: ["HPI: [PATIENT NAME] is a 57-year-old woman with DKA.", "Per [PROVIDER NAME]", "Room: [ROOM]"],
        tags: ["acronym", "multi-sentence", "known-bug"]
      }
    ),
    makeAdversarialCase(
      "adv-clinical-acronym-block",
      "clinical-acronym-guard",
      `Patient Name: Alicia Rivera
PMH: T1DM, CKD, CAD, CHF, COPD
HPI: SOB and DOE with DKA, AKI, and abnormal BMP.
ROS: chest pain denied.
A/P: trend CBC, CMP, TSH, and A1c.`,
      {
        mustRedact: ["Alicia Rivera"],
        mustPreserve: ["PMH", "T1DM", "CKD", "CAD", "CHF", "COPD", "HPI", "SOB", "DOE", "DKA", "AKI", "BMP", "ROS", "A/P", "CBC", "CMP", "TSH", "A1c"],
        expectedPlaceholders: ["Patient Name: [PATIENT NAME]"],
        tags: ["acronym", "section-header"]
      }
    ),
    makeAdversarialCase(
      "adv-name-contains-hpi-token",
      "identifier-context-override",
      `Patient Name: Hpi Tran
DOB: 01/02/1980
HPI: Hpi Tran is admitted with AKI and DKA.
History of Present Illness: Chest Pain resolved.`,
      {
        mustRedact: ["Hpi Tran", "01/02/1980"],
        mustPreserve: ["HPI", "History of Present Illness", "Chest Pain", "AKI", "DKA"],
        expectedPlaceholders: ["Patient Name: [PATIENT NAME]", "DOB: [DOB]"],
        tags: ["identifier-context", "acronym"]
      }
    ),
    makeAdversarialCase(
      "adv-chart-row-newline-loss",
      "formatting-stress",
      "Patient Name: Marcus Chen | DOB: 03/04/1979 | MRN: MC-2040274 | HPI: SOB with DKA. PMH: T2DM. Per Dr. Noelle Parker. Room: B12-4.",
      {
        mustRedact: ["Marcus Chen", "03/04/1979", "MC-2040274", "Dr. Noelle Parker", "B12-4"],
        mustPreserve: ["HPI", "SOB", "DKA", "PMH", "T2DM"],
        expectedPlaceholders: ["Patient Name: [PATIENT NAME]", "Per [PROVIDER NAME]", "Room: [ROOM]"],
        tags: ["one-line", "chart-export"]
      }
    ),
    makeAdversarialCase(
      "adv-title-case-medical-phrases",
      "name-like-clinical-phrase",
      `Clean clinical text only:
Chest Pain
Shortness Of Breath
Present Illness
Daily Labs
Insulin Glargine
Warfarin Sodium
Blue Ridge protocol
May-Thurner syndrome`,
      {
        mustPreserve: ["Chest Pain", "Shortness Of Breath", "Present Illness", "Daily Labs", "Insulin Glargine", "Warfarin Sodium", "Blue Ridge protocol", "May-Thurner syndrome"],
        tags: ["false-positive", "title-case"]
      }
    )
  ];
}
