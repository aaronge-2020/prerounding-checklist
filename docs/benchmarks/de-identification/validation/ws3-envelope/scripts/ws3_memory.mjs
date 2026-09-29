// Focused memory re-measurement: CDP heap + process-tree RSS at
// (a) page loaded, (b) per-sample during model load (peak), (c) after 50 docs.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, "..", "results");
const NOTES = path.join(HERE, "..", "data", "notes_ws3.jsonl");
const EXE = "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rssTree(rootPid) {
  const children = new Map(); const rss = new Map();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const m = fs.readFileSync(`/proc/${d}/stat`, "utf8").match(/^(\d+) \(.*\) \S+ (\d+)/);
      if (!m) continue;
      const rm = fs.readFileSync(`/proc/${d}/status`, "utf8").match(/VmRSS:\s+(\d+) kB/);
      if (rm) rss.set(+m[1], +rm[1] * 1024);
      if (!children.has(+m[2])) children.set(+m[2], []);
      children.get(+m[2]).push(+m[1]);
    } catch {}
  }
  let total = 0; const stack = [rootPid]; const seen = new Set();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue; seen.add(p);
    total += rss.get(p) || 0;
    for (const c of children.get(p) || []) stack.push(c);
  }
  return total;
}

function headlessPids() {
  const out = new Set();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try { if (fs.readFileSync(`/proc/${d}/cmdline`, "utf8").includes("headless_shell")) out.add(+d); } catch {}
  }
  return out;
}

const srv = spawn("node", ["/home/hatch/workspace/deid-benchmark/harness/server.mjs"], { stdio: "ignore" });
await sleep(1200);
try {
  const before = headlessPids();
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  let rootPid = null;
  for (let i = 0; i < 50 && !rootPid; i++) {
    for (const p of headlessPids()) if (!before.has(p)) { rootPid = p; break; }
    if (!rootPid) await sleep(100);
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(600000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const snap = async () => {
    const r = await cdp.send("Performance.getMetrics");
    const get = (n) => { const f = r.metrics.find((x) => x.name === n); return f ? Math.round(f.value) : null; };
    return { jsHeapUsed: get("JSHeapUsedSize"), jsHeapTotal: get("JSHeapTotalSize"), rss: rssTree(rootPid) };
  };
  await page.goto("http://127.0.0.1:8902/harness.html");
  await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
  const a = await snap();

  const loadP = page.evaluate(() => window.__bench.load());
  let settled = false;
  loadP.then(() => { settled = true; }, () => { settled = true; });
  const series = [];
  const t0 = Date.now();
  while (!settled) { series.push({ dtMs: Date.now() - t0, ...(await snap()) }); await sleep(200); }
  const loadInfo = await loadP;
  const b = {
    samples: series.length,
    loadMs: Math.round(loadInfo.ms),
    peakJsHeapUsed: Math.max(...series.map((s) => s.jsHeapUsed || 0)),
    peakJsHeapTotal: Math.max(...series.map((s) => s.jsHeapTotal || 0)),
    peakRss: Math.max(...series.map((s) => s.rss)),
    series
  };

  const notes = fs.readFileSync(NOTES, "utf8").trim().split("\n").slice(0, 50).map((l) => JSON.parse(l));
  for (let i = 0; i < notes.length; i += 10) {
    await page.evaluate(({ texts }) => window.__bench.run(texts, "hybrid"), { texts: notes.slice(i, i + 10).map((r) => r.source_text) });
  }
  await sleep(1000);
  const c = await snap();
  await browser.close();

  const out = {
    note: "CDP Performance.getMetrics JS heap + /proc RSS summed over the browser process tree. performance.memory appeared frozen in this headless build and is not used.",
    a_pageLoaded: a, b_duringLoad: b, c_after50Docs: c,
    mib: {
      a: { jsHeapUsedMiB: +(a.jsHeapUsed / 1048576).toFixed(1), rssMiB: +(a.rss / 1048576).toFixed(1) },
      b_peak: { jsHeapUsedMiB: +(b.peakJsHeapUsed / 1048576).toFixed(1), rssMiB: +(b.peakRss / 1048576).toFixed(1) },
      c: { jsHeapUsedMiB: +(c.jsHeapUsed / 1048576).toFixed(1), rssMiB: +(c.rss / 1048576).toFixed(1) }
    }
  };
  fs.writeFileSync(path.join(RESULTS, "memory.json"), JSON.stringify(out, null, 2));
  console.log("memory redone:", JSON.stringify(out.mib));
} finally { try { srv.kill(); } catch {} }
