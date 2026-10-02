// MedDeID benchmark driver: loads the harness page in headless Chromium,
// loads the real ONNX model, and runs all 300 notes through the ACTUAL
// pipeline (prebuilt deid.bundle.js installed into site/src/vault/) in
// "hybrid" mode — the same protocol as the track-c2 measured runs.
// Resilient: on renderer crash it relaunches the browser, reloads the model,
// and resumes from the checkpoint file (mirrors survey2_driver.mjs).
// Usage: node meddeid-driver.mjs --model clinicale5|stanford --layer base|trackb|trackbc
//   (expects the static server on 127.0.0.1:8902)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = "/home/hatch/workspace/deid-benchmark/site";
const NOTES = path.join(HERE, "notes.jsonl");
const OUT_DIR = path.join(HERE, "out");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");
const BATCH = 10;
const MAX_RETRIES = 6;

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith("--") ? [[a.slice(2), arr[i + 1]]] : []
  )
);
const MODEL = args.model;
const LAYER = args.layer;
if (!["clinicale5", "stanford"].includes(MODEL) || !["base", "trackb", "trackbc"].includes(LAYER)) {
  console.error("usage: node meddeid-driver.mjs --model clinicale5|stanford --layer base|trackb|trackbc");
  process.exit(2);
}
const TAG = `${MODEL}_${LAYER}`;
const HARNESS = MODEL === "clinicale5" ? "harness-clinicale5.html" : "harness.html";

// Install the pipeline bundle for this configuration.
const bundleSrc = path.join(HERE, "bundles", `${LAYER}.bundle.js`);
if (!fs.existsSync(bundleSrc)) {
  console.error(`bundle missing: ${bundleSrc}`);
  process.exit(2);
}
fs.copyFileSync(bundleSrc, path.join(SITE, "src/vault/deid.bundle.js"));
console.log(`${TAG}: installed bundle ${bundleSrc}`);

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`${TAG}: loaded ${rows.length} notes`);
fs.mkdirSync(CKPT_DIR, { recursive: true });

let browser = null;
let page = null;

async function launchBrowser() {
  if (browser) { try { await browser.close(); } catch { /* already dead */ } }
  browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  page = await browser.newPage();
  page.setDefaultTimeout(600000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page error]", msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => console.error("[pageerror]", String(err).slice(0, 300)));
  await page.goto(`http://127.0.0.1:8902/${HARNESS}`);
  await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
  const loadInfo = await page.evaluate(() => window.__bench.load());
  console.log(`${TAG}: model (re)loaded:`, JSON.stringify(loadInfo));
  return loadInfo;
}

await launchBrowser();

// Run one batch; on failure, relaunch and retry. If a batch still fails after
// relaunch, bisect down to the single offending text so one bad note can never
// stall the run; offending notes are recorded with an error flag.
async function runBatchEval(texts) {
  let attempt = 0;
  for (;;) {
    try {
      return await page.evaluate(
        ({ t }) => window.__bench.run(t, "hybrid"),
        { t: texts }
      );
    } catch (err) {
      attempt++;
      console.error(`${TAG}: batch failed (attempt ${attempt}): ${String(err && err.message || err).slice(0, 160)}`);
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 5000));
      try { await launchBrowser(); } catch (le) {
        console.error(`${TAG}: relaunch failed: ${String(le && le.message || le).slice(0, 160)}`);
      }
    }
  }
}

async function runTexts(texts) {
  try {
    return await runBatchEval(texts);
  } catch (err) {
    if (texts.length === 1) throw err;
    const mid = Math.ceil(texts.length / 2);
    return [...(await runTexts(texts.slice(0, mid))), ...(await runTexts(texts.slice(mid)))];
  }
}

const ckptPath = path.join(CKPT_DIR, `${TAG}.jsonl`);
let done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    done.set(r.id, r);
  }
  console.log(`${TAG}: resuming with ${done.size} docs already done`);
}
const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
const t0 = Date.now();
const errored = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
  if (batch.length === 0) continue;
  let batchOut;
  try {
    batchOut = await runTexts(batch.map((r) => r.text));
  } catch (err) {
    // Single text that kills even a fresh renderer: record and move on.
    console.error(`${TAG}: isolating failing text(s) in batch starting at row ${i}`);
    batchOut = [];
    for (const row of batch) {
      try {
        batchOut.push((await runTexts([row.text]))[0]);
      } catch (e2) {
        console.error(`${TAG}: NOTE FAILED: ${row.id} — recording empty with error flag`);
        errored.push(row.id);
        batchOut.push({ ms: null, entities: [], error: String(e2 && e2.message || e2).slice(0, 200) });
      }
    }
  }
  batch.forEach((row, j) => {
    const rec = { id: row.id, ms: batchOut[j].ms, entities: batchOut[j].entities };
    if (batchOut[j].error) rec.error = batchOut[j].error;
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  if (done.size % 50 === 0 || done.size === rows.length) {
    console.log(`${TAG}: ${done.size}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
  }
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));

// Assemble final ordered JSON in the required format.
const textById = new Map(rows.map((r) => [r.id, r.text]));
let skipped = 0;
const ordered = rows.map((r) => {
  const rec = done.get(r.id);
  if (!rec) throw new Error(`${TAG}: missing doc ${r.id} after run`);
  const text = textById.get(r.id);
  const entities = [];
  for (const e of rec.entities || []) {
    const begin = e.start, end = e.end;
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end > text.length || begin >= end) {
      skipped++;
      continue;
    }
    entities.push({ begin, end, text: text.slice(begin, end), type: String(e.label) });
  }
  const out = { id: r.id, entities };
  if (rec.error) out.error = rec.error;
  return out;
});
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(ordered));
if (skipped) console.log(`${TAG}: skipped ${skipped} out-of-range entities`);
if (errored.length) console.log(`${TAG}: ${errored.length} notes errored: ${errored.join(", ")}`);

// Latency stats (successful docs only).
const ms = rows.map((r) => done.get(r.id).ms).filter((v) => typeof v === "number").sort((a, b) => a - b);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
const median = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
const p95 = ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))];
fs.writeFileSync(
  path.join(OUT_DIR, `${TAG}.latency.json`),
  JSON.stringify({
    mean_ms: +mean.toFixed(2), median_ms: +median.toFixed(2), p95_ms: +p95.toFixed(2),
    n: ms.length, errored: errored.length
  }, null, 2)
);
console.log(`${TAG}: done in ${(((Date.now() - t0) / 1000) | 0)}s -> out/${TAG}.json (mean ${mean.toFixed(1)}ms, median ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms)`);
await browser.close();
console.log(`${TAG}: all done`);
