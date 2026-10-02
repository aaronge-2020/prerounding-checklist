// Survey driver (resilient): runs one candidate model through the actual
// pipeline in headless Chromium, in model-only and/or hybrid mode.
// If the browser/renderer dies mid-run (observed crash-prone in this env),
// it relaunches the browser, reloads the model, and resumes from the
// checkpoint file. Usage:
//   node survey_driver.mjs --model <org/name> --slug <out-slug> [--modes both|model-only|hybrid] [--batch 25]
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
const SLUG = arg("slug");
const MODES_ARG = arg("modes", "both");
const PORT = process.env.SURVEY_PORT || "8903";
const DTYPE = arg("dtype", "q8");
if (!MODEL || !SLUG) {
  console.error("usage: node survey_driver.mjs --model <org/name> --slug <slug> [--modes both|model-only|hybrid] [--batch N]");
  process.exit(1);
}
const MODES = MODES_ARG === "both" ? ["model-only", "hybrid"] : [MODES_ARG];
const BATCH = parseInt(arg("batch", "25"), 10);
const PAGE = arg("page", "survey2.html");
const MAX_RETRIES = 6;

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAMPLE = path.join(ROOT, "data", "sample.jsonl");
const OUT_DIR = path.join(ROOT, "results-round2");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");

const rows = fs.readFileSync(SAMPLE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} sampled texts for model ${MODEL} (batch=${BATCH})`);
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
  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}?model=${encodeURIComponent(MODEL)}&dtype=${encodeURIComponent(DTYPE)}`);
  await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
  const loadInfo = await page.evaluate(() => window.__bench.load());
  console.log("model (re)loaded:", JSON.stringify(loadInfo));
  return loadInfo;
}

const initialLoad = await launchBrowser();
fs.writeFileSync(path.join(OUT_DIR, `load_info_${SLUG}.json`), JSON.stringify(initialLoad, null, 2));

async function runBatch(texts, mode) {
  let attempt = 0;
  for (;;) {
    try {
      return await page.evaluate(
        ({ t, m }) => window.__bench.run(t, m),
        { t: texts, m: mode }
      );
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
        console.error(`relaunch failed (attempt ${attempt}): ${String(launchErr && launchErr.message || launchErr).slice(0, 160)}`);
        // fall through to retry the batch, which will fail again and relaunch
      }
    }
  }
}

async function runMode(mode) {
  const outName = `raw_${SLUG}_${mode}.json`;
  const ckptPath = path.join(CKPT_DIR, `${SLUG}_${mode}.jsonl`);
  let done = new Map();
  if (fs.existsSync(ckptPath)) {
    for (const line of fs.readFileSync(ckptPath, "utf8").trim().split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      done.set(r.id, r);
    }
    console.log(`${SLUG}/${mode}: resuming with ${done.size} docs already done`);
  }
  const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
  const t0 = Date.now();
  let processed = done.size;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
    if (batch.length === 0) continue;
    const batchOut = await runBatch(batch.map((r) => r.source_text), mode);
    batch.forEach((row, j) => {
      const rec = { id: row.id, ms: batchOut[j].ms, entities: batchOut[j].entities };
      if (batchOut[j].msA !== undefined) rec.msA = batchOut[j].msA;
      if (batchOut[j].msB !== undefined) rec.msB = batchOut[j].msB;
      ckpt.write(JSON.stringify(rec) + "\n");
      done.set(row.id, rec);
    });
    processed = done.size;
    if (processed % 100 === 0 || processed === rows.length) {
      console.log(`${SLUG}/${mode}: ${processed}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
    }
  }
  ckpt.end();
  await new Promise((res) => ckpt.on("finish", res));
  const ordered = rows.map((r) => done.get(r.id));
  if (ordered.some((r) => !r)) throw new Error(`${SLUG}/${mode}: missing docs after run`);
  fs.writeFileSync(path.join(OUT_DIR, outName), JSON.stringify(ordered));
  console.log(`${SLUG}/${mode} done in ${(((Date.now() - t0) / 1000) | 0)}s -> ${outName}`);
}

for (const mode of MODES) await runMode(mode);
await browser.close();
console.log("all done");
