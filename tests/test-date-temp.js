import { deidentifyTextStructuredOnly } from "../deid.js";

const text = `Hospital Course by Date
12/31: Admitted overnight
1/1: Creatinine improving
Current labs 1/2 0600: Creatinine stable
Follow-up on 1/3`;

const r = deidentifyTextStructuredOnly(text);
console.log("Today:", new Date().toISOString().slice(0, 10));
console.log(r.text);

// Parse the day numbers
const lines = r.text.split("\n");
for (const line of lines) {
  const dayMatch = line.match(/Day ([+-]?\d+)/);
  if (dayMatch) {
    console.log(`  ${dayMatch[0]}  ← ${line.trim()}`);
  }
}
