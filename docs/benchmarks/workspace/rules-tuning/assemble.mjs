// Merge dev-driver shard outputs into one ordered raw file.
// Usage: node assemble.mjs --out <dir> --tag name --final <path>
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
    return acc;
  }, [])
);
const OUT = args.out, TAG = args.tag || "dev", FINAL = args.final;
const ROOT = "/home/hatch/workspace/deid-benchmark";
const devRows = fs.readFileSync(path.join(ROOT, "data", "sample.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l)).slice(0, 700);
const byId = new Map();
for (const f of fs.readdirSync(OUT).filter((f) => f.startsWith(`${TAG}-shard-`) && f.endsWith(".json"))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))) byId.set(r.id, r);
}
const ordered = devRows.map((r) => byId.get(r.id));
if (ordered.some((r) => !r)) { console.error("MISSING DOCS"); process.exit(1); }
fs.writeFileSync(FINAL, JSON.stringify(ordered));
console.log(`assembled ${ordered.length} docs -> ${FINAL}`);
