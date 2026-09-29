// WS1 driver: runs the 60 synthetic notes through the REAL de-id pipeline
// (hybrid mode = NER model + deterministic rules + alias expansion, exactly
// as the app runs it) in headless Chromium. Mirrors deid-benchmark's
// driver.mjs. Captures the pipeline's suggestion list per note — the exact
// input to the app's clinician review gate.
// Usage: node driver.mjs   (expects the static server on 127.0.0.1:8907)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOTES = path.join(ROOT, "notes.jsonl");
const OUT = path.join(ROOT, "pipeline_suggestions.json");
const CKPT = path.join(ROOT, "results", "checkpoints", "ws1.jsonl");
const BATCH = 10;

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} synthetic notes`);
fs.mkdirSync(path.dirname(CKPT), { recursive: true });

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
await page.goto("http://127.0.0.1:8907/harness.html");
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });

console.log("loading model...");
const loadInfo = await page.evaluate(() => window.__bench.load());
console.log("model loaded:", JSON.stringify(loadInfo));

// Resume support (checkpoint per document).
const done = new Map();
if (fs.existsSync(CKPT)) {
  for (const line of fs.readFileSync(CKPT, "utf8").trim().split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    done.set(r.id, r);
  }
  console.log(`resuming with ${done.size} docs already done`);
}
const ckpt = fs.createWriteStream(CKPT, { flags: "a" });
const t0 = Date.now();
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
      note_type: row.note_type,
      ms: Math.round(batchOut[j].ms * 10) / 10,
      entities: batchOut[j].entities,
      redacted_text: batchOut[j].text,
      residual_warnings: batchOut[j].residualWarnings,
    };
    ckpt.write(JSON.stringify(rec) + "\n");
    done.set(row.id, rec);
  });
  console.log(`hybrid: ${done.size}/${rows.length} (${(((Date.now() - t0) / 1000) | 0)}s)`);
}
ckpt.end();
await new Promise((res) => ckpt.on("finish", res));
const ordered = rows.map((r) => done.get(r.id));
if (ordered.some((r) => !r)) throw new Error("missing docs after run");
fs.writeFileSync(OUT, JSON.stringify({ model: loadInfo, suggestions: ordered }));
await browser.close();
console.log(`done in ${(((Date.now() - t0) / 1000) | 0)}s -> ${OUT}`);
