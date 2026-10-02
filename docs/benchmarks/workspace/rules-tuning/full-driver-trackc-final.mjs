// Playwright driver: loads the harness page in headless Chromium, loads the
// real ONNX model, and runs every sampled text through the ACTUAL pipeline
// (site/src/vault/deid.js, bundled verbatim via esbuild) in both "hybrid"
// and "model-only" modes.
// Usage: node driver.mjs   (expects the static server on 127.0.0.1:8902)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAMPLE = path.join(ROOT, "data", "sample.jsonl");
const OUT_DIR = path.join(ROOT, "rules-tuning", "full-out-trackc-final");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");
const BATCH = 25;

const rows = fs.readFileSync(SAMPLE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} sampled texts`);
fs.mkdirSync(CKPT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[page error]", msg.text().slice(0, 300));
});
page.on("pageerror", (err) => console.error("[pageerror]", String(err).slice(0, 300)));
await page.goto("http://127.0.0.1:8902/harness.html");
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });

console.log("loading model...");
const loadInfo = await page.evaluate(() => window.__bench.load());
console.log("model loaded:", JSON.stringify(loadInfo));
fs.writeFileSync(path.join(OUT_DIR, "load_info.json"), JSON.stringify(loadInfo, null, 2));

async function runMode(mode, outName) {
  const ckptPath = path.join(CKPT_DIR, outName.replace(/\.json$/, ".jsonl"));
  // Resume support: skip batches already checkpointed.
  let done = new Map();
  if (fs.existsSync(ckptPath)) {
    for (const line of fs.readFileSync(ckptPath, "utf8").trim().split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      done.set(r.id, r);
    }
    console.log(`${mode}: resuming with ${done.size} docs already done`);
  }
  const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
  const t0 = Date.now();
  let processed = done.size;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
    if (batch.length === 0) continue;
    const batchOut = await page.evaluate(
      ({ texts, m }) => window.__bench.run(texts, m),
      { texts: batch.map((r) => r.source_text), m: mode }
    );
    batch.forEach((row, j) => {
      const rec = { id: row.id, ms: batchOut[j].ms, entities: batchOut[j].entities };
      ckpt.write(JSON.stringify(rec) + "\n");
      done.set(row.id, rec);
    });
    processed = done.size;
    if (processed % 100 === 0 || processed === rows.length) {
      console.log(`${mode}: ${processed}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
    }
  }
  ckpt.end();
  await new Promise((res) => ckpt.on("finish", res));
  // Assemble final ordered JSON from checkpoints.
  const ordered = rows.map((r) => done.get(r.id));
  if (ordered.some((r) => !r)) throw new Error(`${mode}: missing docs after run`);
  fs.writeFileSync(path.join(OUT_DIR, outName), JSON.stringify(ordered));
  console.log(`${mode} done in ${(((Date.now() - t0) / 1000) | 0)}s -> ${outName}`);
}

await runMode("hybrid", "raw_hybrid_trackc_final.json");
await browser.close();
console.log("all done");
