// Dev-set driver: runs the hybrid pipeline on a shard of the 700-text dev
// set (rows[0:700] of data/sample.jsonl, manifest order) in headless
// Chromium, using the harness page that bundles site/src/vault/deid.js.
// Usage: node dev-driver.mjs --shard 0 --nshards 2 --out <dir> [--tag name]
// Each shard writes <out>/shard-<shard>.jsonl checkpoints and
// <out>/shard-<shard>.json on completion. Run assemble.mjs afterwards to
// merge shards into one ordered raw output file.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
    return acc;
  }, [])
);
const SHARD = Number(args.shard || 0);
const NSHARDS = Number(args.nshards || 1);
const OUT = args.out || "/tmp/dev-out";
const TAG = args.tag || "dev";

const ROOT = "/home/hatch/workspace/deid-benchmark";
const SAMPLE = path.join(ROOT, "data", "sample.jsonl");
const BATCH = 25;

const devRows = fs.readFileSync(SAMPLE, "utf8").trim().split("\n")
  .map((l) => JSON.parse(l)).slice(0, 700);
const myRows = devRows.filter((_, i) => i % NSHARDS === SHARD);
console.log(`[shard ${SHARD}/${NSHARDS}] ${myRows.length} docs (dev set = ${devRows.length})`);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
page.on("pageerror", (err) => console.error("[pageerror]", String(err).slice(0, 200)));
await page.goto("http://127.0.0.1:8902/harness.html");
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });

const loadInfo = await page.evaluate(() => window.__bench.load());
console.log(`[shard ${SHARD}] model loaded in ${(loadInfo.ms / 1000).toFixed(1)}s`);

const ckptPath = path.join(OUT, `${TAG}-shard-${SHARD}.jsonl`);
let done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, "utf8").trim().split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    done.set(r.id, r);
  }
  console.log(`[shard ${SHARD}] resuming with ${done.size} docs`);
}
const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
const t0 = Date.now();
for (let i = 0; i < myRows.length; i += BATCH) {
  const batch = myRows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
  if (batch.length === 0) continue;
  const batchOut = await page.evaluate(
    ({ texts, m }) => window.__bench.run(texts, m),
    { texts: batch.map((r) => r.source_text), m: "hybrid" }
  );
  batch.forEach((row, j) => {
    const rec = { id: row.id, ms: batchOut[j].ms, entities: batchOut[j].entities };
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  const n = done.size;
  if (n % 50 === 0 || n === myRows.length) {
    console.log(`[shard ${SHARD}] ${n}/${myRows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
  }
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));
const ordered = myRows.map((r) => done.get(r.id));
if (ordered.some((r) => !r)) throw new Error(`[shard ${SHARD}] missing docs`);
fs.writeFileSync(path.join(OUT, `${TAG}-shard-${SHARD}.json`), JSON.stringify(ordered));
await browser.close();
console.log(`[shard ${SHARD}] done in ${(((Date.now() - t0) / 1000) | 0)}s`);
