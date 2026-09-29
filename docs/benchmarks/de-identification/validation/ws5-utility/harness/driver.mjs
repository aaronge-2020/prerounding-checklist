// ws5 utility driver: loads the ws5 harness page in headless Chromium, loads
// the real ONNX de-id model, and runs each synthetic clinical note through
// the ACTUAL pipeline in hybrid mode, capturing the true redacted text
// (exactly what the app renders) plus entity spans.
// Usage: node driver.mjs   (expects the ws5 static server on 127.0.0.1:8905)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOTES = path.join(ROOT, "data", "notes.jsonl");
const OUT_DIR = path.join(ROOT, "results");
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");
const BATCH = 10;

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} synthetic notes`);
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
await page.goto("http://127.0.0.1:8905/ws5-harness.html");
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });

console.log("loading model...");
const loadInfo = await page.evaluate(() => window.__bench.load());
console.log("model loaded:", JSON.stringify(loadInfo));
fs.writeFileSync(path.join(OUT_DIR, "load_info.json"), JSON.stringify(loadInfo, null, 2));

const ckptPath = path.join(CKPT_DIR, "raw_run.jsonl");
let done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, "utf8").trim().split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    done.set(r.id, r);
  }
  console.log(`resuming with ${done.size} notes already done`);
}
const ckpt = fs.createWriteStream(ckptPath, { flags: "a" });
const t0 = Date.now();
let processed = done.size;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).filter((r) => !done.has(r.id));
  if (batch.length === 0) continue;
  const batchOut = await page.evaluate(
    ({ texts }) => window.__bench.run(texts, "hybrid"),
    { texts: batch.map((r) => r.text) }
  );
  batch.forEach((row, j) => {
    const rec = {
      id: row.id,
      ms: batchOut[j].ms,
      entities: batchOut[j].entities,
      redacted: batchOut[j].redacted,
    };
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  processed = done.size;
  console.log(`hybrid: ${processed}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));
const ordered = rows.map((r) => done.get(r.id));
if (ordered.some((r) => !r)) throw new Error("missing notes after run");
fs.writeFileSync(path.join(OUT_DIR, "raw_run.json"), JSON.stringify(ordered));
console.log(`hybrid done in ${(((Date.now() - t0) / 1000) | 0)}s -> raw_run.json`);
await browser.close();
console.log("all done");
