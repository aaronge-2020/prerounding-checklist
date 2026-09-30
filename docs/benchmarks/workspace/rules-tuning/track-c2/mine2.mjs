// Mine residual errors mirroring harness/score.py overlap matching.
// Usage: node mine2.mjs <raw_json> <out_dir>
import fs from "node:fs";
import path from "node:path";

const [rawPath, outDir] = process.argv.slice(2);
const ROOT = "/home/hatch/workspace/deid-benchmark";
const rows = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "data", "sample.jsonl"), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).map((r) => [r.id, r]));

const GOLD_MAP = { GIVENNAME1: "NAME", GIVENNAME2: "NAME", LASTNAME1: "NAME", LASTNAME2: "NAME", LASTNAME3: "NAME", TEL: "PHONE", EMAIL: "EMAIL", DATE: "DATE", TIME: "TIME", BOD: "DOB", CITY: "LOCATION", STATE: "LOCATION", COUNTRY: "LOCATION", POSTCODE: "LOCATION", STREET: "ADDRESS", BUILDING: "ADDRESS", SECADDRESS: "ADDRESS", IDCARD: "ID", SOCIALNUMBER: "ID", PASSPORT: "ID", DRIVERLICENSE: "ID", IP: "IP" };
const PRED_MAP = { NAME: "NAME", "PATIENT NAME": "NAME", "PROVIDER NAME": "NAME", "CONTACT NAME": "NAME", PHONE: "PHONE", EMAIL: "EMAIL", DATE: "DATE", TIME: "TIME", DOB: "DOB", LOCATION: "LOCATION", ADDRESS: "ADDRESS", ID: "ID", MRN: "ID", "ENCOUNTER ID": "ID", IP: "IP" };
const ov = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

const EXCLUDED = new Set(["USERNAME", "SEX", "TITLE", "PASS", "GEOCOORD", "CARDISSUER"]);
const CATS = ["NAME", "PHONE", "EMAIL", "DATE", "TIME", "DOB", "LOCATION", "ADDRESS", "ID", "IP"];

const preds = Object.fromEntries(JSON.parse(fs.readFileSync(rawPath, "utf8")).map((d) => [d.id, d]));
fs.mkdirSync(outDir, { recursive: true });
const cats = {};
const cat = (c) => (cats[c] ??= { tp: 0, fp: 0, fn: 0, fnEx: [], fpEx: [] });
for (const [id, row] of Object.entries(rows)) {
  const goldCat = {};
  for (const s of row.privacy_mask) {
    if (GOLD_MAP[s.label]) goldCat[`${s.start}:${s.end}`] = { cat: GOLD_MAP[s.label], val: s.value };
  }
  const excl = new Set(row.privacy_mask.filter((s) => EXCLUDED.has(s.label)).map((s) => `${s.start}:${s.end}`));
  const predCat = {};
  for (const e of (preds[id]?.entities || [])) {
    const key = `${e.start}:${e.end}`;
    if (excl.has(key) || key in predCat) continue;
    predCat[key] = { cat: PRED_MAP[e.label] || null, label: e.label, source: e.source || null };
  }
  const t = row.source_text;
  const ctx = (s, e) => t.slice(Math.max(0, s - 70), Math.min(t.length, e + 50)).replace(/\n/g, " ");
  for (const key of new Set([...Object.keys(goldCat), ...Object.keys(predCat)])) {
    const [s, e] = key.split(":").map(Number);
    const gc = goldCat[key]?.cat, pc = predCat[key]?.cat;
    if (gc && pc) {
      if (gc === pc) cat(gc).tp++;
      else {
        cat(gc).fn++; if (CATS.includes(pc)) cat(pc).fp++;
        const m = cat(gc);
        if (m.fnEx.length < 80) m.fnEx.push({ id, miss: goldCat[key].val, ctx: ctx(s, e), wrongCat: predCat[key].label });
      }
    } else if (gc) {
      const m = cat(gc); m.fn++;
      if (m.fnEx.length < 80) m.fnEx.push({ id, miss: goldCat[key].val, ctx: ctx(s, e), wrongCat: null });
    } else if (pc && CATS.includes(pc)) {
      const m = cat(pc); m.fp++;
      if (m.fpEx.length < 50) m.fpEx.push({ id, got: t.slice(s, e), label: predCat[key].label, src: predCat[key].source, ctx: ctx(s, e) });
    }
  }
}
const lines = [];
let T = { tp: 0, fp: 0, fn: 0 };
for (const [c, m] of Object.entries(cats).sort()) {
  const P = m.tp / (m.tp + m.fp), R = m.tp / (m.tp + m.fn), F1 = 2 * P * R / (P + R);
  lines.push(`${c.padEnd(10)} P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)} tp=${m.tp} fp=${m.fp} fn=${m.fn}`);
  T.tp += m.tp; T.fp += m.fp; T.fn += m.fn;
  fs.writeFileSync(path.join(outDir, `fn-${c}.json`), JSON.stringify(m.fnEx, null, 1));
  fs.writeFileSync(path.join(outDir, `fp-${c}.json`), JSON.stringify(m.fpEx, null, 1));
}
const P = T.tp / (T.tp + T.fp), R = T.tp / (T.tp + T.fn);
lines.unshift(`BINARY     P=${P.toFixed(4)} R=${R.toFixed(4)} F1=${(2 * P * R / (P + R)).toFixed(4)} tp=${T.tp} fp=${T.fp} fn=${T.fn}`);
fs.writeFileSync(path.join(outDir, "error-table.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
