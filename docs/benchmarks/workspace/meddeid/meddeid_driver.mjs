// MedDeID benchmark driver: runs the 300 MedDeID notes through the ACTUAL
// deid pipeline (real deid.js bundle + real ONNX model) in headless Chromium.
// Resilient: relaunches the browser and resumes from checkpoints on failure.
// Usage:
//   node meddeid_driver.mjs --model <org/name> --dtype <q8|int8> --port <port>
//       --page <page.html> --tag <out-tag> [--batch N]
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
const PORT = arg("port", "8903");
const PAGE = arg("page", "survey2.html");
const TAG = arg("tag");
const TRACKD = arg("trackd", "on");
const BATCH = parseInt(arg("batch", "10"), 10);
const MAX_RETRIES = 6;
if (!MODEL || !TAG) {
  console.error("usage: node meddeid_driver.mjs --model <org/name> --tag <out-tag> [--dtype q8|int8] [--port N] [--page page.html] [--batch N]");
  process.exit(1);
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NOTES = process.env.NOTES_FILE || path.join(DIR, "notes.jsonl");
const OUT_DIR = path.join(DIR, "out");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");
fs.mkdirSync(CKPT_DIR, { recursive: true });

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} MedDeID notes for model ${MODEL} (dtype=${DTYPE}, batch=${BATCH}, tag=${TAG})`);

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
  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}?model=${encodeURIComponent(MODEL)}&dtype=${encodeURIComponent(DTYPE)}&trackd=${encodeURIComponent(TRACKD)}`);
  await page.waitForFunction("window.__benchReady === true", null, { timeout: 180000 });
  const loadInfo = await page.evaluate(() => window.__bench.load());
  console.log("model (re)loaded:", JSON.stringify(loadInfo), "trackd=" + TRACKD);
  return loadInfo;
}

const initialLoad = await launchBrowser();
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.load_info.json`), JSON.stringify(initialLoad, null, 2));

async function runBatch(texts) {
  let attempt = 0;
  for (;;) {
    try {
      return await page.evaluate(({ t }) => window.__bench.run(t, "hybrid"), { t: texts });
    } catch (err) {
      attempt++;
      const msg = String(err && err.message || err);
      console.error(`batch failed (attempt ${attempt}): ${msg.slice(0, 160)}`);
      if (attempt >= MAX_RETRIES) throw err;
      console.error("relaunching browser and resuming...");
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await launchBrowser();
      } catch (launchErr) {
        console.error(`relaunch failed: ${String(launchErr && launchErr.message || launchErr).slice(0, 160)}`);
      }
    }
  }
}

const ckptPath = path.join(CKPT_DIR, `${TAG}.jsonl`);
let done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, "utf8").trim().split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    done.set(r.id, r);
  }
  console.log(`${TAG}: resuming with ${done.size} docs already done`);
}
const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
const t0 = Date.now();
let processed = done.size;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
  if (batch.length === 0) continue;
  const batchOut = await runBatch(batch.map((r) => r.text));
  batch.forEach((row, j) => {
    const entities = (batchOut[j].entities || []).map((e) => ({
      begin: e.start,
      end: e.end,
      text: row.text.slice(e.start, e.end),
      type: e.label,
    }));
    const rec = { id: row.id, ms: batchOut[j].ms, entities };
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  processed = done.size;
  if (processed % 25 === 0 || processed === rows.length) {
    console.log(`${TAG}: ${processed}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
  }
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));

// Assemble final ordered JSON from checkpoints.
const ordered = rows.map((r) => {
  const rec = done.get(r.id);
  return { id: r.id, entities: rec.entities };
});
if (ordered.some((r) => !r)) throw new Error(`${TAG}: missing docs after run`);
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(ordered));

// Latency summary.
const ms = rows.map((r) => done.get(r.id).ms).sort((a, b) => a - b);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
const median = ms[Math.floor(ms.length / 2)];
const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))];
fs.writeFileSync(
  path.join(OUT_DIR, `${TAG}.latency.json`),
  JSON.stringify({ mean_ms: +mean.toFixed(1), median_ms: +median.toFixed(1), p95_ms: +p95.toFixed(1), n: ms.length }, null, 2)
);
console.log(`${TAG} done in ${(((Date.now() - t0) / 1000) | 0)}s -> out/${TAG}.json`);
console.log(`latency: mean=${mean.toFixed(0)}ms median=${median.toFixed(0)}ms p95=${p95.toFixed(0)}ms n=${ms.length}`);
await browser.close();
console.log("all done");
