// Validates MedDeID run outputs: schema, 300 notes, slice integrity, latency files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const notes = new Map(
  fs.readFileSync(path.join(HERE, "notes.jsonl"), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).map((r) => [r.id, r.text])
);

let fail = 0;
for (const model of ["clinicale5", "stanford"]) {
  for (const layer of ["base", "trackb", "trackbc"]) {
    const tag = `${model}_${layer}`;
    const p = path.join(OUT, `${tag}.json`);
    if (!fs.existsSync(p)) { console.log(`${tag}: MISSING OUTPUT`); fail++; continue; }
    const arr = JSON.parse(fs.readFileSync(p, "utf8"));
    const ids = new Set(arr.map((r) => r.id));
    const idOk = arr.length === 300 && ids.size === 300 && [...notes.keys()].every((id) => ids.has(id));
    let sliceErr = 0, typeErr = 0, nEnt = 0;
    for (const r of arr) {
      const text = notes.get(r.id);
      for (const e of r.entities) {
        nEnt++;
        if (text.slice(e.begin, e.end) !== e.text) sliceErr++;
        if (typeof e.type !== "string" || !e.type) typeErr++;
      }
    }
    const lat = JSON.parse(fs.readFileSync(path.join(OUT, `${tag}.latency.json`), "utf8"));
    const latOk = lat.n > 0 && lat.mean_ms > 0;
    const status = idOk && sliceErr === 0 && typeErr === 0 && latOk ? "OK" : "PROBLEM";
    if (status !== "OK") fail++;
    console.log(`${tag}: ${status} docs=${arr.length} entities=${nEnt} sliceErr=${sliceErr} typeErr=${typeErr} ` +
      `latency(mean=${lat.mean_ms}, median=${lat.median_ms}, p95=${lat.p95_ms}, n=${lat.n})`);
  }
}
console.log(fail === 0 ? "ALL OUTPUTS VALID" : `${fail} CONFIG(S) WITH PROBLEMS`);
process.exit(fail === 0 ? 0 : 1);
