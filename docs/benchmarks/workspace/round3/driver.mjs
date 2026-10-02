// Round 3 driver: full 7,946-row ai4privacy benchmark through the real pipeline.
// Adapts meddeid_driver.mjs (proven on the MedDeID run): headless Chromium,
// real ONNX model via harness-param.html, per-doc checkpointing, crash
// relaunch + resume, batch bisection so one bad doc can never stall the run.
// Usage:
//   NOTES_FILE=round3/notes_full.jsonl node round3/driver.mjs \
//     --model <org/name> --dtype <q8|int8> --layer <base|trackb|trackbc> \
//     --tag <out-tag> [--port 8905] [--batch 10]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const MODEL = arg("model");
const DTYPE = arg("dtype", "q8");
const LAYER = arg("layer");
const TAG = arg("tag");
const PORT = arg("port", "8905");
const PAGE = "harness-param.html";
const BATCH = parseInt(arg("batch", "10"), 10);
const MAX_RETRIES = 6;
if (!MODEL || !TAG || !["base", "trackb", "trackbc"].includes(LAYER)) {
  console.error("usage: node round3/driver.mjs --model <org/name> --layer base|trackb|trackbc --tag <tag> [--dtype q8|int8] [--port N] [--batch N]");
  process.exit(2);
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BENCH = path.dirname(DIR);
const SITE = path.join(BENCH, "site");
const NOTES = process.env.NOTES_FILE || path.join(DIR, "notes_full.jsonl");
const OUT_DIR = path.join(DIR, "out");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");
fs.mkdirSync(CKPT_DIR, { recursive: true });

// Install the pipeline bundle for this layer (sequential runs: safe).
const bundleSrc = path.join(BENCH, "meddeid", "bundles", `${LAYER}.bundle.js`);
if (!fs.existsSync(bundleSrc)) {
  console.error(`bundle missing: ${bundleSrc}`);
  process.exit(2);
}
fs.copyFileSync(bundleSrc, path.join(SITE, "src/vault/deid.bundle.js"));
console.log(`${TAG}: installed bundle ${LAYER}.bundle.js`);

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`${TAG}: loaded ${rows.length} docs for model ${MODEL} (dtype=${DTYPE}, batch=${BATCH})`);

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
  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}?model=${encodeURIComponent(MODEL)}&dtype=${encodeURIComponent(DTYPE)}`);
  await page.waitForFunction("window.__benchReady === true", null, { timeout: 180000 });
  const loadInfo = await page.evaluate(() => window.__bench.load());
  console.log(`${TAG}: model (re)loaded:`, JSON.stringify(loadInfo));
  return loadInfo;
}

const initialLoad = await launchBrowser();
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.load_info.json`), JSON.stringify(initialLoad, null, 2));

async function runBatchEval(texts) {
  let attempt = 0;
  for (;;) {
    try {
      return await page.evaluate(({ t }) => window.__bench.run(t, "hybrid"), { t: texts });
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
    console.error(`${TAG}: isolating failing text(s) in batch starting at row ${i}`);
    batchOut = [];
    for (const row of batch) {
      try {
        batchOut.push((await runTexts([row.text]))[0]);
      } catch (e2) {
        console.error(`${TAG}: DOC FAILED: ${row.id} — recording empty with error flag`);
        errored.push(row.id);
        batchOut.push({ ms: null, entities: [], error: String(e2 && e2.message || e2).slice(0, 200) });
      }
    }
  }
  batch.forEach((row, j) => {
    const entities = (batchOut[j].entities || []).map((e) => ({
      start: e.start, end: e.end, label: String(e.label),
    }));
    const rec = { id: row.id, ms: batchOut[j].ms, entities };
    if (batchOut[j].error) rec.error = batchOut[j].error;
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  if (done.size % 100 === 0 || done.size === rows.length) {
    console.log(`${TAG}: ${done.size}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
  }
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));

// Assemble final ordered JSON (keeps ms + label keys for the scorer).
const ordered = rows.map((r) => {
  const rec = done.get(r.id);
  if (!rec) throw new Error(`${TAG}: missing doc ${r.id} after run`);
  const out = { id: r.id, ms: rec.ms, entities: rec.entities };
  if (rec.error) out.error = rec.error;
  return out;
});
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(ordered));
if (errored.length) console.log(`${TAG}: ${errored.length} docs errored: ${errored.join(",")}`);

const ms = rows.map((r) => done.get(r.id).ms).filter((v) => typeof v === "number").sort((a, b) => a - b);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
const median = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
const p95 = ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))];
fs.writeFileSync(
  path.join(OUT_DIR, `${TAG}.latency.json`),
  JSON.stringify({ mean_ms: +mean.toFixed(1), median_ms: +median.toFixed(1), p95_ms: +p95.toFixed(1), n: ms.length, errored: errored.length }, null, 2)
);
console.log(`${TAG}: done in ${(((Date.now() - t0) / 1000) | 0)}s -> out/${TAG}.json`);
console.log(`${TAG}: latency mean=${mean.toFixed(0)}ms median=${median.toFixed(0)}ms p95=${p95.toFixed(0)}ms n=${ms.length}`);
await browser.close();
console.log(`${TAG}: all done`);
