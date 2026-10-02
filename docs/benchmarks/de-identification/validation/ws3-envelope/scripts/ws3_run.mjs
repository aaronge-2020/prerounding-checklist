// Workstream 3 (deployment envelope) measurement driver.
// Phases: artifact, memory+latency, startup (cold/warm), throttled latency,
// fail-closed (blocked CDN, corrupted weights). Each phase checkpoints to
// results/<phase>.json and is skipped on re-run unless --redo or --only is given.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS3 = path.join(HERE, "..");
const RESULTS = path.join(WS3, "results");
const FC_DIR = path.join(RESULTS, "failclosed");
const NOTES = path.join(WS3, "data", "notes_ws3.jsonl");
const EXE = "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];
const BENCH_URL = "http://127.0.0.1:8902/harness.html";
const WS3_PORT = 8931;
const FC_URL = `http://127.0.0.1:${WS3_PORT}/failclosed.html`;

fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(FC_DIR, { recursive: true });

const ARGS = process.argv.slice(2);
const REDO = ARGS.includes("--redo");
const ONLY = ARGS.includes("--only") ? ARGS[ARGS.indexOf("--only") + 1] : null;
const done = (name) => !REDO && (!ONLY || ONLY === name) && fs.existsSync(path.join(RESULTS, name + ".json"));
const want = (name) => !ONLY || ONLY === name;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, min: r2(s[0]), median: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s[s.length - 1]), mean: r2(mean) };
}
const r2 = (x) => Math.round(x * 100) / 100;

// Sum VmRSS over the browser process tree rooted at pid.
function rssTree(rootPid) {
  const children = new Map();
  const rss = new Map();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8");
      const m = stat.match(/^(\d+) \(.*\) \S+ (\d+)/);
      if (!m) continue;
      const pid = +m[1], ppid = +m[2];
      const st = fs.readFileSync(`/proc/${d}/status`, "utf8");
      const rm = st.match(/VmRSS:\s+(\d+) kB/);
      if (rm) rss.set(pid, +rm[1] * 1024);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(pid);
    } catch { /* exited */ }
  }
  let total = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    total += rss.get(p) || 0;
    for (const c of children.get(p) || []) stack.push(c);
  }
  return total;
}

async function sampleMem(page, cdp, rootPid) {
  const heap = await page.evaluate(() => {
    const m = performance.memory || {};
    return {
      usedJSHeapSize: m.usedJSHeapSize ?? null,
      totalJSHeapSize: m.totalJSHeapSize ?? null,
      jsHeapSizeLimit: m.jsHeapSizeLimit ?? null
    };
  });
  let cdpHeap = null;
  try {
    const r = await cdp.send("Performance.getMetrics");
    const get = (n) => { const f = r.metrics.find((x) => x.name === n); return f ? f.value : null; };
    cdpHeap = { JSHeapUsedSize: get("JSHeapUsedSize"), JSHeapTotalSize: get("JSHeapTotalSize") };
  } catch { /* ignore */ }
  return { heap, cdpHeap, rssBytes: rssTree(rootPid) };
}

function loadNotes(n) {
  return fs.readFileSync(NOTES, "utf8").trim().split("\n").slice(0, n).map((l) => JSON.parse(l));
}

function headlessPids() {
  const out = new Set();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, "utf8");
      if (cmd.includes("headless_shell")) out.add(+d);
    } catch { /* ignore */ }
  }
  return out;
}

async function launchTracked() {
  const before = headlessPids();
  const browser = await chromium.launch({ executablePath: EXE, args: LAUNCH_ARGS });
  // The launcher spawns the browser process synchronously before resolving.
  let rootPid = null;
  for (let i = 0; i < 50 && rootPid === null; i++) {
    for (const p of headlessPids()) {
      if (!before.has(p)) { rootPid = p; break; }
    }
    if (rootPid === null) await sleep(100);
  }
  if (rootPid === null) throw new Error("could not identify browser pid");
  return { browser, rootPid };
}

function startServers() {
  // NOTE: 8902 may already be served by a sibling workstream's identical
  // harness server (same site dir, same headers); phases that only need the
  // stock harness tolerate that. The ws3 overlay server gets its own port.
  const bench = spawn("node", ["/home/hatch/workspace/deid-benchmark/harness/server.mjs"], { stdio: "ignore" });
  const ws3 = spawn("node", [path.join(HERE, "server_ws3.mjs"), String(WS3_PORT)], { stdio: "ignore" });
  return [bench, ws3];
}

async function waitForHttp(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`server not up: ${url}`);
}

async function newPage(browser, url, { throttle = 0 } = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(600000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if (throttle > 0) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") consoleErrors.push(`${msg.type()}: ${msg.text().slice(0, 400)}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 400)}`));
  const t0 = Date.now();
  await page.goto(url);
  return { page, cdp, consoleErrors, pageLoadMs: Date.now() - t0 };
}

// ---------- Phase: artifact ----------
if (want("artifact") && !done("artifact")) {
  const MODEL_DIR = "/home/hatch/workspace/deid-benchmark/site/models/onnx-community/stanford-deidentifier-base-ONNX";
  const files = ["onnx/model_quantized.onnx", "config.json", "tokenizer.json", "tokenizer_config.json", "vocab.txt"]
    .map((rel) => ({ file: rel, bytes: fs.statSync(path.join(MODEL_DIR, rel)).size }));
  const total = files.reduce((a, f) => a + f.bytes, 0);
  const out = {
    modelId: "onnx-community/stanford-deidentifier-base-ONNX",
    files,
    totalBytes: total,
    totalMiB: r2(total / 1048576),
    totalMB_decimal: r2(total / 1e6),
    onnxBytes: files[0].bytes,
    onnxMiB: r2(files[0].bytes / 1048576)
  };
  fs.writeFileSync(path.join(RESULTS, "artifact.json"), JSON.stringify(out, null, 2));
  console.log("artifact:", JSON.stringify(out.totalMiB), "MiB");
}

// machine context
{
  const meminfo = fs.readFileSync("/proc/meminfo", "utf8").match(/MemTotal:\s+(\d+) kB/);
  const cpu = fs.readFileSync("/proc/cpuinfo", "utf8").match(/model name\s+:\s+(.+)/);
  const machine = {
    node: process.version,
    cpuModel: cpu ? cpu[1] : "unknown",
    logicalCpus: Number((fs.readFileSync("/proc/cpuinfo", "utf8").match(/processor/g) || []).length),
    memTotalMiB: meminfo ? Math.round(+meminfo[1] / 1024) : null,
    chromium: EXE,
    notesFile: NOTES
  };
  fs.writeFileSync(path.join(RESULTS, "machine.json"), JSON.stringify(machine, null, 2));
  console.log("machine:", machine.cpuModel, "| cpus:", machine.logicalCpus, "| memMiB:", machine.memTotalMiB);
}

const servers = startServers();
await sleep(1500);
// Pre-flight: our overlay server must serve failclosed.html (a sibling may
// squat on 8903, so we use our own port).
await waitForHttp(FC_URL);
console.log("overlay server up:", FC_URL);
const serversDown = () => { for (const s of servers) { try { s.kill(); } catch {} } };
process.on("exit", serversDown);

try {
  // ---------- Phase: memory + unthrottled latency ----------
  if (want("memory") && !done("memory")) {
    const { browser, rootPid } = await launchTracked();
    const { page, cdp, consoleErrors } = await newPage(browser, BENCH_URL);
    await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });

    const memA = await sampleMem(page, cdp, rootPid); // (a) page loaded, model not loaded

    // (b) sample during load, track peaks
    const loadP = page.evaluate(() => window.__bench.load());
    let settled = false;
    loadP.then(() => { settled = true; }, () => { settled = true; });
    const during = [];
    while (!settled) {
      during.push(await sampleMem(page, cdp, rootPid));
      await sleep(250);
    }
    const loadInfo = await loadP;
    const peakHeap = Math.max(...during.map((s) => s.heap.usedJSHeapSize || 0));
    const peakRss = Math.max(...during.map((s) => s.rssBytes));
    const memB = { peakHeapBytes: peakHeap, peakRssBytes: peakRss, samples: during.length, loadMs: Math.round(loadInfo.ms) };

    // (c) sustained run: 50 notes, then sample steady state; extend to 100 for latency stats
    const notes100 = loadNotes(100);
    const lat = [];
    const BATCH = 10;
    for (let i = 0; i < notes100.length; i += BATCH) {
      const batch = notes100.slice(i, i + BATCH);
      const out = await page.evaluate(({ texts }) => window.__bench.run(texts, "hybrid"), { texts: batch.map((r) => r.source_text) });
      batch.forEach((row, j) => lat.push({ id: row.id, chars: row.source_text.length, ms: out[j].ms }));
      if (i + BATCH === 50) var memC = await sampleMem(page, cdp, rootPid);
    }
    const latMs = lat.map((l) => l.ms);
    const memOut = {
      a_pageLoaded_modelNotLoaded: memA,
      b_duringLoad_peak: memB,
      c_steadyState_after50Docs: memC,
      consoleErrors: consoleErrors.slice(0, 10)
    };
    fs.writeFileSync(path.join(RESULTS, "memory.json"), JSON.stringify(memOut, null, 2));
    fs.writeFileSync(path.join(RESULTS, "latency_unthrottled.json"), JSON.stringify({ stats: stats(latMs), note: "100 synthetic clinical notes, hybrid mode, single page, same session as memory run" }, null, 2));
    fs.writeFileSync(path.join(RESULTS, "latency_unthrottled.csv"), "id,chars,ms\n" + lat.map((l) => `${l.id},${l.chars},${r2(l.ms)}`).join("\n") + "\n");
    console.log("memory+latency done. latency:", JSON.stringify(stats(latMs)));
    await browser.close();
  }

  // ---------- Phase: startup cold vs warm ----------
  if (want("startup") && !done("startup")) {
    const cold = [];
    for (let i = 0; i < 3; i++) {
      const browser = await chromium.launch({ executablePath: EXE, args: LAUNCH_ARGS });
      const page = await browser.newPage();
      page.setDefaultTimeout(600000);
      const t0 = Date.now();
      await page.goto(BENCH_URL);
      await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
      const pageLoadMs = Date.now() - t0;
      const t1 = Date.now();
      const info = await page.evaluate(() => window.__bench.load());
      const loadMs = Date.now() - t1;
      cold.push({ run: i + 1, pageLoadMs, modelLoadMs: Math.round(loadMs), modelId: info.modelId });
      await browser.close();
      console.log(`cold run ${i + 1}: page ${pageLoadMs} ms, load ${Math.round(loadMs)} ms`);
    }
    const warmProfile = path.join(WS3, "data", "warm-profile");
    fs.rmSync(warmProfile, { recursive: true, force: true });
    const ctx = await chromium.launchPersistentContext(warmProfile, { executablePath: EXE, args: LAUNCH_ARGS });
    { // pre-warm (discarded)
      const page = await ctx.newPage();
      await page.goto(BENCH_URL);
      await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
      await page.evaluate(() => window.__bench.load());
      await page.close();
    }
    const warm = [];
    for (let i = 0; i < 3; i++) {
      const page = await ctx.newPage();
      page.setDefaultTimeout(600000);
      const t0 = Date.now();
      await page.goto(BENCH_URL);
      await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
      const pageLoadMs = Date.now() - t0;
      const t1 = Date.now();
      const info = await page.evaluate(() => window.__bench.load());
      const loadMs = Date.now() - t1;
      warm.push({ run: i + 1, pageLoadMs, modelLoadMs: Math.round(loadMs), modelId: info.modelId });
      await page.close();
      console.log(`warm run ${i + 1}: page ${pageLoadMs} ms, load ${Math.round(loadMs)} ms`);
    }
    await ctx.close();
    const out = {
      cold: { runs: cold, medianPageLoadMs: stats(cold.map((r) => r.pageLoadMs)).median, medianModelLoadMs: stats(cold.map((r) => r.modelLoadMs)).median },
      warm: { runs: warm, medianPageLoadMs: stats(warm.map((r) => r.pageLoadMs)).median, medianModelLoadMs: stats(warm.map((r) => r.modelLoadMs)).median },
      note: "cold = fresh browser profile each run (empty cache), model fetched from local static server + init; warm = reused persistent profile after one pre-warm (server sends Cache-Control: no-store, so no HTTP caching; warm delta reflects OS page cache / repeat-fetch effects). harness load() includes one warm-up inference."
    };
    fs.writeFileSync(path.join(RESULTS, "startup.json"), JSON.stringify(out, null, 2));
    console.log("startup done:", JSON.stringify(out));
  }

  // ---------- Phase: throttled latency ----------
  if (want("latency_throttled") && !done("latency_throttled")) {
    const { browser } = await launchTracked();
    const { page, cdp, consoleErrors } = await newPage(browser, BENCH_URL, { throttle: 4 });
    await page.waitForFunction("window.__benchReady === true", null, { timeout: 180000 });
    const t0 = Date.now();
    const info = await page.evaluate(() => window.__bench.load());
    const loadMs = Date.now() - t0;
    const notes50 = loadNotes(50);
    const lat = [];
    const BATCH = 5;
    for (let i = 0; i < notes50.length; i += BATCH) {
      const batch = notes50.slice(i, i + BATCH);
      const out = await page.evaluate(({ texts }) => window.__bench.run(texts, "hybrid"), { texts: batch.map((r) => r.source_text) });
      batch.forEach((row, j) => lat.push({ id: row.id, chars: row.source_text.length, ms: out[j].ms }));
      console.log(`throttled: ${lat.length}/50`);
    }
    const latMs = lat.map((l) => l.ms);
    fs.writeFileSync(path.join(RESULTS, "latency_throttled.json"), JSON.stringify({
      stats: stats(latMs),
      throttledModelLoadMs: Math.round(loadMs),
      note: "CDP Emulation.setCPUThrottlingRate(4). SIMULATED PROXY ONLY — not a real low-end device test."
    }, null, 2));
    fs.writeFileSync(path.join(RESULTS, "latency_throttled.csv"), "id,chars,ms\n" + lat.map((l) => `${l.id},${l.chars},${r2(l.ms)}`).join("\n") + "\n");
    console.log("throttled done:", JSON.stringify(stats(latMs)));
    await browser.close();
  }

  // ---------- Phase: fail-closed ----------
  async function failClosedScenario(name, routeSetup) {
    const outPath = path.join(RESULTS, `failclosed_${name}.json`);
    const shotPath = path.join(FC_DIR, `${name}.png`);
    const browser = await chromium.launch({ executablePath: EXE, args: LAUNCH_ARGS });
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    const consoleLog = [];
    page.on("console", (msg) => consoleLog.push(`${msg.type()}: ${msg.text().slice(0, 500)}`));
    page.on("pageerror", (err) => consoleLog.push(`pageerror: ${String(err).slice(0, 500)}`));
    await routeSetup(page);
    await page.goto(FC_URL);
    await page.waitForFunction("window.__fcReady === true", null, { timeout: 120000 });
    const loadRes = await page.evaluate(() => window.__fc.loadWithCapture());
    const runRes = await page.evaluate(() => window.__fc.runOne("Patient: Jane Smith | DOB: 01/02/1970 | MRN: 123456 | 555-0100"));
    await page.screenshot({ path: shotPath });
    const out = {
      scenario: name,
      loadResult: loadRes,
      runAfterFailedLoad: runRes,
      consoleLog: consoleLog.slice(0, 20),
      screenshot: shotPath
    };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`failclosed/${name}: load ok=${loadRes.ok}, run ok=${runRes.ok}`);
    await browser.close();
    return out;
  }

  if (want("failclosed_blocked") && !done("failclosed_blocked")) {
    await failClosedScenario("blocked", async (page) => {
      // The harness remaps huggingface.co requests to same-origin model files,
      // so aborting the local model path is the faithful equivalent of blocking
      // the HF CDN.
      await page.route("**/models/onnx-community/**", (route) => route.abort("failed"));
    });
  }

  if (want("failclosed_corrupted") && !done("failclosed_corrupted")) {
    const real = fs.readFileSync("/home/hatch/workspace/deid-benchmark/site/models/onnx-community/stanford-deidentifier-base-ONNX/onnx/model_quantized.onnx");
    const bad = Buffer.from(real.subarray(0, 4 * 1024 * 1024));
    bad.fill(0xff, 1024 * 1024, 2 * 1024 * 1024); // corrupt a 1 MiB window; keep total byte count
    await failClosedScenario("corrupted", async (page) => {
      await page.route("**/onnx/model_quantized.onnx", (route) =>
        route.fulfill({ status: 200, contentType: "application/octet-stream", body: bad }));
    });
  }

  console.log("ALL PHASES DONE");
} finally {
  serversDown();
}
