/*
 * Deterministic, entirely synthetic stress corpus for the Structured de-identifier.
 * Reserved/example contact data and conspicuously fictional organizations are used
 * so this fixture can never be mistaken for chart-derived patient information.
 */

export const CORPUS_SCHEMA = "prerounding_structured_deid_corpus_v1";
export const MIN_CASE_CHARACTERS = 10_000;

const firstNames = ["Avery", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Skyler", "Rowan", "Emerson", "Dakota"];
const lastNames = ["Quill", "Vesper", "Northstar", "Juniper", "Marble", "Peregrine", "Solstice", "Thistle", "Umber", "Zephyr"];
const streets = ["Example Avenue", "Fiction Lane", "Demo Boulevard", "Placeholder Road", "Synthetic Court"];
const jobs = ["respiratory therapist", "orchardist", "night-shift machinist", "museum conservator", "school librarian"];

const clinicalGuards = [
  "May have pain but denies March fracture", // name/month near-collisions
  "Will monitor Will Rogers phenomenon on the ECG teaching strip",
  "Rose spots absent; violet discoloration absent; amber urine absent",
  "Parkinson disease and Addison disease remain clinical eponyms",
  "Brown-Sequard syndrome is not suspected and white blood cell count is stable",
  "Washington criteria and Duke criteria were discussed as medical concepts",
  "The patient is alert and oriented to person, place, time, and situation",
  "Blood pressure 118/72 mmHg, heart rate 76 bpm, respiratory rate 16/min",
  "Sodium 139 mmol/L, potassium 4.1 mmol/L, creatinine 0.9 mg/dL",
  "No chest pain, shortness of breath, hematemesis, melena, or focal weakness",
  "Continue insulin glargine, pulmonary toilet, fall precautions, and bowel regimen",
  "Occupation discussed as a social determinant without implying an identifier"
];

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function allSpans(text, identifier) {
  const spans = [];
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(identifier.text, from);
    if (start < 0) break;
    spans.push({
      start,
      end: start + identifier.text.length,
      text: identifier.text,
      category: identifier.category,
      key: identifier.key
    });
    from = start + identifier.text.length;
  }
  return spans;
}

function protectedSpans(text, guards) {
  return guards.flatMap((guard, guardIndex) => allSpans(text, {
    text: guard,
    category: "CLINICAL NON-PHI",
    key: `clinicalGuard${guardIndex}`
  })).sort((a, b) => a.start - b.start || a.end - b.end);
}

function makeIdentifiers(index) {
  const first = firstNames[index % firstNames.length];
  const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  const fullName = `${first} ${last}`;
  const alias = `${first[0]}. “${last}-Echo”`;
  const provider = `Dr. P${pad(index)} Testwright`;
  const contact = `C${pad(index)} Demo-Contact`;
  const month = (index % 12) + 1;
  const day = (index % 27) + 1;
  const birthYear = 1940 + (index % 60);
  const admissionDay = (day % 25) + 1;
  const streetNumber = 1000 + index;
  const facility = `Fictional Meridian Medical Pavilion ${index + 1}`;
  const employer = `Imaginary Works Cooperative ${index + 1}`;
  return {
    admissionDate: `2026-${pad(month)}-${pad(admissionDay)}`,
    values: [
      { key: "patientName", category: "PATIENT NAME", text: fullName },
      { key: "patientAlias", category: "PATIENT NAME", text: alias },
      { key: "ocrPatientName", category: "PATIENT NAME", text: `${last.toUpperCase()},  ${first.toUpperCase()}` },
      { key: "provider", category: "PROVIDER NAME", text: provider },
      { key: "contact", category: "CONTACT NAME", text: contact },
      { key: "dob", category: "DOB", text: `${pad(month)}/${pad(day)}/${birthYear}` },
      { key: "admissionDateDisplay", category: "DATE", text: `${pad(month)}-${pad(admissionDay)}-2026` },
      { key: "timestamp", category: "DATE", text: `2026-${pad(month)}-${pad(admissionDay)}T${pad(index % 24)}:${pad((index * 7) % 60)}:00-04:00` },
      { key: "mrn", category: "MRN", text: `ZX-${pad(index + 1, 4)}-${pad(9000 + index, 5)}` },
      { key: "account", category: "ID", text: `ACCT-DEMO-${pad(700000 + index, 6)}` },
      { key: "device", category: "ID", text: `DEV:FAKE:${pad(index, 4)}:${pad(index * 17, 5)}` },
      { key: "phone", category: "PHONE", text: `(555) 01${index % 10}-${pad(1000 + index, 4)}` },
      { key: "fax", category: "PHONE", text: `+1-555-02${index % 10}-${pad(2000 + index, 4)}` },
      { key: "email", category: "EMAIL", text: `${first.toLowerCase()}.${last.toLowerCase()}+case${index}@example.com` },
      { key: "ipv4", category: "IP ADDRESS", text: `192.0.2.${(index % 250) + 1}` },
      { key: "url", category: "URL", text: `https://example.invalid/patient/case-${pad(index + 1, 3)}` },
      { key: "address", category: "ADDRESS", text: `${streetNumber} ${streets[index % streets.length]}, Example City, ZZ ${pad(10000 + index, 5)}` },
      { key: "facility", category: "FACILITY", text: facility },
      { key: "employer", category: "ORGANIZATION", text: employer },
      { key: "room", category: "ROOM", text: `Room ${pad(300 + index)}-${String.fromCharCode(65 + (index % 4))}` }
    ]
  };
}

function valueMap(values) {
  return Object.fromEntries(values.map((item) => [item.key, item.text]));
}

function identityBlock(v, index, variant) {
  if (variant % 4 === 0) {
    return `PATIENT: ${v.patientName} | ALIAS: ${v.patientAlias} | DOB: ${v.dob}\nMRN ${v.mrn}; ACCOUNT ${v.account}; ${v.room}; ${v.facility}\n`;
  }
  if (variant % 4 === 1) {
    return `OCR HEADER >>> ${v.ocrPatientName}  D0B=${v.dob}  MRN=${v.mrn}\nCALL ${v.phone} / FAX ${v.fax}; EMAIL ${v.email}\n`;
  }
  if (variant % 4 === 2) {
    return `Narrative: ${v.patientName}, also documented as ${v.patientAlias}, was seen by ${v.provider} at ${v.facility}. Emergency contact ${v.contact}.\n`;
  }
  return `EXPORT|${v.timestamp}|${v.account}|${v.device}|${v.ipv4}|${v.url}|${v.address}|${v.employer}|${index}\n`;
}

function clinicalBlock(index, round) {
  const guard = clinicalGuards[(index + round) % clinicalGuards.length];
  const job = jobs[(index + round) % jobs.length];
  return `HOSPITAL COURSE ${round + 1}: ${guard}. The synthetic patient works as a ${job}. ` +
    "Review of systems is otherwise negative. Examination shows no distress, regular rhythm, clear lungs, soft abdomen, and no edema. " +
    "Assessment considers dehydration, medication effect, viral syndrome, and metabolic disturbance. Plan includes oral intake, repeat laboratory testing, mobility, and return precautions. " +
    "This deliberately repetitive clinical material lengthens the case while preserving realistic note density and difficult name-like medical vocabulary.\n";
}

function buildText(index, ids) {
  const v = valueMap(ids);
  let text = `SYNTHETIC STRESS CASE ${pad(index + 1, 3)} — NO REAL PATIENT DATA\n`;
  text += identityBlock(v, index, 0);
  text += `Home address: ${v.address}\nProvider: ${v.provider}; contact: ${v.contact}; admission: ${v.admissionDateDisplay}\n`;
  for (let round = 0; text.length < MIN_CASE_CHARACTERS + 700; round += 1) {
    text += clinicalBlock(index, round);
    if (round % 3 === 0) text += identityBlock(v, index, round);
    if (round % 5 === 0) text += `Communication ${round}: ${v.phone}; ${v.email}; ${v.fax}.\n`;
    if (round % 7 === 0) text += `Audit ${round}: ${v.timestamp}, ${v.device}, ${v.ipv4}, ${v.url}.\n`;
  }
  return text;
}

function makeCase(index) {
  const identifiers = makeIdentifiers(index);
  const text = buildText(index, identifiers.values);
  const groundTruthSpans = identifiers.values.flatMap((identifier) => allSpans(text, identifier))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const guards = clinicalGuards.filter((guard) => text.includes(guard));
  const protectedGroundTruthSpans = protectedSpans(text, guards);
  return {
    schema: CORPUS_SCHEMA,
    id: `structured-complex-${pad(index + 1, 3)}`,
    synthetic: true,
    seed: index,
    admissionDate: identifiers.admissionDate,
    relativeDate: "today",
    tags: ["structured", "complex", "adversarial", `format-${index % 10}`],
    text,
    groundTruthSpans,
    protectedGroundTruthSpans,
    annotations: {
      phi: groundTruthSpans,
      protected: protectedGroundTruthSpans
    },
    mustRedact: [...new Set(groundTruthSpans.map((span) => span.text))],
    mustPreserve: guards,
    nonPhiGuards: guards.map((guard) => ({ text: guard, category: "CLINICAL NON-PHI" })),
    coverage: [
      "names-and-aliases", "provider-and-contact", "identifiers", "contacts", "dates-and-times",
      "address-room-facility", "employer-and-occupation", "ocr-formatting", "unicode", "repetition",
      "clinical-name-collisions"
    ]
  };
}

export function makeStructuredDeidComplexCases(count = 100) {
  if (!Number.isInteger(count) || count < 1) throw new TypeError("count must be a positive integer");
  return Array.from({ length: count }, (_, index) => makeCase(index));
}
