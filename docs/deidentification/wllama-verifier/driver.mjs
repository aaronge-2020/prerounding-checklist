// wllama verifier driver: dev-200 only. For each note runs the frozen
// NER+TrackD first pass and the wllama LLM reviewer, checkpointing per note.
// LLM-alone and union configs are derived at scoring time from the same rows.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.argv[2] || "8920";

// Own the static server: start it if not already up.
async function serverUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/verifier.html`, { method: "HEAD" });
    return r.ok;
  } catch { return false; }
}
if (!(await serverUp())) {
  const { spawn } = await import("node:child_process");
  const srv = spawn("node", [path.join(DIR, "server.mjs"), PORT], { stdio: "ignore", detached: true });
  srv.unref();
  for (let i = 0; i < 30 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await serverUp())) { console.error("server failed to start"); process.exit(1); }
  console.log("started static server on", PORT);
}
const NOTES = "/home/hatch/workspace/deid-benchmark/meddeid/track-d/notes-dev.jsonl";
const CKPT = path.join(DIR, "checkpoints", "verifier.jsonl");
fs.mkdirSync(path.dirname(CKPT), { recursive: true });

const rows = fs.readFileSync(NOTES, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${rows.length} dev notes`);

const done = new Map();
if (fs.existsSync(CKPT)) {
  for (const line of fs.readFileSync(CKPT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); done.set(r.id, true); } catch {}
  }
  console.log(`resuming: ${done.size} notes already done`);
}
const ckpt = fs.createWriteStream(CKPT, { flags: "a" });

let browser = null, page = null;
async function launch() {
  if (browser) { try { await browser.close(); } catch {} }
  browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  page = await browser.newPage();
  page.setDefaultTimeout(900000);
  page.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/verifier.html`);
  await page.waitForFunction("window.__verifierReady === true", null, { timeout: 120000 });
  console.log("bench load:", JSON.stringify(await page.evaluate(() => window.__verifier.loadBench())));
  console.log("llm load:", JSON.stringify(await page.evaluate(() => window.__verifier.loadLLM())));
}

await launch();

let n = done.size;
for (const row of rows) {
  if (done.has(row.id)) continue;
  let attempt = 0;
  for (;;) {
    try {
      const fp = await page.evaluate((t) => window.__verifier.runFirstPass([t]), row.text);
      const llm = await page.evaluate((t) => window.__verifier.runLLM([t]), row.text);
      ckpt.write(JSON.stringify({
        id: row.id,
        first_ms: fp[0].ms, llm_ms: llm[0].ms,
        firstPass: fp[0].entities, llm: llm[0].entities, llmStats: llm[0].llmStats
      }) + "\n");
      done.set(row.id, true);
      n++;
      if (n % 10 === 0) console.log(`progress ${n}/${rows.length}`);
      break;
    } catch (e) {
      attempt++;
      console.error(`note ${row.id} failed attempt ${attempt}: ${String(e && e.message || e).slice(0, 150)}`);
      if (attempt >= 3) { console.error(`SKIP ${row.id}`); break; }
      await new Promise((r) => setTimeout(r, 5000));
      await launch();
    }
  }
}
ckpt.end();
await browser.close();
console.log(`DONE ${n}/${rows.length}`);
