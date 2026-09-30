// Mine residual FNs/FPs from a raw hybrid run: per-category counts + FN examples.
// Usage: node mine-errors.mjs <raw_json> <out_dir>
import fs from "node:fs";
import path from "node:path";

const [rawPath, outDir] = process.argv.slice(2);
const ROOT = "/home/hatch/workspace/deid-benchmark";
const rows = fs.readFileSync(path.join(ROOT, "data", "sample.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l)).reduce((m, r) => (m[r.id] = r, m), {});

const GOLD_MAP = { GIVENNAME1: "NAME", GIVENNAME2: "NAME", LASTNAME1: "NAME", LASTNAME2: "NAME", LASTNAME3: "NAME", TEL: "PHONE", EMAIL: "EMAIL", DATE: "DATE", TIME: "TIME", BOD: "DOB", CITY: "LOCATION", STATE: "LOCATION", COUNTRY: "LOCATION", POSTCODE: "LOCATION", STREET: "ADDRESS", BUILDING: "ADDRESS", SECADDRESS: "ADDRESS", IDCARD: "ID", SOCIALNUMBER: "ID", PASSPORT: "ID", DRIVERLICENSE: "ID", IP: "IP" };
const EXCLUDED = new Set(["USERNAME", "SEX", "TITLE", "PASS", "GEOCOORD", "CARDISSUER"]);
const PRED_MAP = { NAME: "NAME", "PATIENT NAME": "NAME", "PROVIDER NAME": "NAME", "CONTACT NAME": "NAME", PHONE: "PHONE", EMAIL: "EMAIL", DATE: "DATE", TIME: "TIME", DOB: "DOB", LOCATION: "LOCATION", ADDRESS: "ADDRESS", ID: "ID", MRN: "ID", "ENCOUNTER ID": "ID", IP: "IP" };
const preds = Object.fromEntries(JSON.parse(fs.readFileSync(rawPath, "utf8")).map((d) => [d.id, d]));

fs.mkdirSync(outDir, { recursive: true });
const cats = {};
for (const [id, row] of Object.entries(rows)) {
  const gold = row.privacy_mask
    .filter((s) => GOLD_MAP[s.label])
    .map((s) => ({ start: s.start, end: s.end, cat: GOLD_MAP[s.label] }));
  const pred = (preds[id]?.entities || [])
    .filter((e) => PRED_MAP[e.label])
    .map((e) => ({ start: e.start, end: e.end, cat: PRED_MAP[e.label], label: e.label, source: e.source || null }));
  const predKeys = new Set(pred.map((p) => `${p.start}:${p.end}:${p.cat}`));
  const goldKeys = new Set(gold.map((g) => `${g.start}:${g.end}:${g.cat}`));
  for (const g of gold) {
    const c = (cats[g.cat] ??= { tp: 0, fp: 0, fn: 0, fnEx: [], fpEx: [] });
    if (predKeys.has(`${g.start}:${g.end}:${g.cat}`)) c.tp++;
    else {
      c.fn++;
      if (c.fnEx.length < 60) {
        const t = row.source_text;
        c.fnEx.push({ id, ctx: t.slice(Math.max(0, g.start - 60), Math.min(t.length, g.end + 40)).replace(/\n/g, " "), miss: t.slice(g.start, g.end) });
      }
    }
  }
  for (const p of pred) {
    const c = (cats[p.cat] ??= { tp: 0, fp: 0, fn: 0, fnEx: [], fpEx: [] });
    if (!goldKeys.has(`${p.start}:${p.end}:${p.cat}`)) {
      c.fp++;
      if (c.fpEx.length < 40) {
        const t = row.source_text;
        c.fpEx.push({ id, ctx: t.slice(Math.max(0, p.start - 60), Math.min(t.length, p.end + 40)).replace(/\n/g, " "), got: t.slice(p.start, p.end), src: p.source });
      }
    }
  }
}
let total = { tp: 0, fp: 0, fn: 0 };
const table = [];
for (const [c, m] of Object.entries(cats).sort()) {
  const P = m.tp / (m.tp + m.fp), R = m.tp / (m.tp + m.fn);
  const F1 = 2 * P * R / (P + R);
  table.push(`${c.padEnd(10)} P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)} tp=${m.tp} fp=${m.fp} fn=${m.fn}`);
  total.tp += m.tp; total.fp += m.fp; total.fn += m.fn;
}
const P = total.tp / (total.tp + total.fp), R = total.tp / (total.tp + total.fn);
table.unshift(`BINARY     P=${P.toFixed(4)} R=${R.toFixed(4)} F1=${(2 * P * R / (P + R)).toFixed(4)} tp=${total.tp} fp=${total.fp} fn=${total.fn}`);
fs.writeFileSync(path.join(outDir, "error-table.txt"), table.join("\n") + "\n");
for (const [c, m] of Object.entries(cats)) {
  fs.writeFileSync(path.join(outDir, `fn-${c}.json`), JSON.stringify(m.fnEx, null, 1));
  fs.writeFileSync(path.join(outDir, `fp-${c}.json`), JSON.stringify(m.fpEx, null, 1));
}
console.log(table.join("\n"));
