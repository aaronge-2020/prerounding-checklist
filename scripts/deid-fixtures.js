export const clinicalGuardTerms = [
  "Heart Rate",
  "Blood Pressure",
  "General: Awake",
  "Insulin Glargine",
  "Anion Gap",
  "Type 1 Diabetes Mellitus",
  "Free T4",
  "Beta-hydroxybutyrate"
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

function finalizeCase(id, category, text, record, requiredSnippets = []) {
  const spans = identifierMap(record).flatMap(([label, value]) => findAllSpans(text, value, label));
  const forbidden = [...new Set(spans.map((span) => span.text))];
  return {
    id,
    category,
    text,
    forbidden,
    groundTruthSpans: spans,
    clinicalTerms: clinicalGuardTerms.filter((term) => text.includes(term)),
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
  strongContextFollowUp
];

export function makeDemoLikeCase() {
  return endocrineDemo("demo-dka-john-smith", makeRecord(0));
}

export function makeSyntheticCases(count = 100) {
  const cases = [];
  for (let index = 0; index < count; index += 1) {
    const template = templates[index % templates.length];
    cases.push(template(`case-${String(index + 1).padStart(3, "0")}`, makeRecord(index)));
  }
  return cases;
}
