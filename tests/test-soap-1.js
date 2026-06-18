import { deidentifyTextStructuredOnly } from "../deid.js";

const text = `SOAP Note #1

Patient: Eleanor "Ellie" McAllister
DOB: 07/14/1978
MRN: MRN-84726195
FIN: 2026-AC-449821
Address: 1847 Sycamore Ridge Ln., Apt 4B, Fairfax, VA 22030
Phone: (571) 555-1847
Email: ellie.mcallister78@example.net

Encounter Date: 06/15/2026
Provider: Jason P. Rutherford, MD
Location: Northern Valley Internal Medicine

Subjective

47-year-old female presents for follow-up regarding worsening fatigue.

Patient reports that "around Memorial Day weekend" she began experiencing profound fatigue while visiting her sister, Margaret Lewis, at 52 Pine Orchard Drive, Annapolis, MD 21401.

She reports receiving several calls from her employer, Acorn Financial Services, extension 4837, while traveling.

Patient states:

"I was helping my father, Robert McAllister, after his procedure at St. Anne's Surgical Center."

She denies chest pain.

Outside records were faxed from:
Dr. Melissa Chang
Fax: 703-555-7761

Objective

Vitals:
BP 138/86
HR 91
RR 16
Temp 98.3°F

Labs reviewed:

Test	Result
Hgb	10.9
Ferritin	8
Iron Sat	12%

Additional documents reviewed:
Referral ID: REF-884721-A
Claim #: CLM-22-8477195

Assessment

Iron deficiency anemia.

Plan
Start ferrous sulfate.
Repeat CBC in 6 weeks.
Contact patient at 571-555-1847 if ferritin remains below goal.
Forward results to endocrinologist:
Katherine O'Neil, MD
2211 Brookstone Pkwy Suite 300
Rockville, MD 20852`;

const result = deidentifyTextStructuredOnly(text);

console.log("=== OUTPUT ===");
console.log(result.text);
console.log("\n=== ENTITIES ===");
for (const e of result.entities) {
  console.log(`  [${e.start}-${e.end}] ${e.label}: "${text.slice(e.start, e.end)}" src=${e.source}`);
}
console.log("\n=== BUG CHECK ===");
console.log("Memorial Day leaked?", result.text.includes("Memorial Day"));
console.log("Eleanor preserved?", !result.text.includes("Eleanor"));
console.log("Northern Valley as room?", result.entities.filter(e => e.label === "ROOM" && text.slice(e.start, e.end).includes("Northern Valley")).length > 0);
console.log("Rutherford leaked?", result.text.includes("Rutherford"));
console.log("Center leaked in facility?", /\[FACILITY\]\s+Center/.test(result.text));
console.log("Suite 300 leaked?", /\[ADDRESS\].*300/.test(result.text) || result.text.includes("Suite 300"));
