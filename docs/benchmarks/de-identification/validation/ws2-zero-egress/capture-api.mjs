// ws2 API-driven capture: page load + Stanford init + 5 notes via direct API.
// Captures the same network traffic as the UI flow, without the slow UI rendering.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const WS2 = "/home/hatch/workspace/deid-validation/ws2-zero-egress";
const NOTES = JSON.parse(fs.readFileSync(path.join(WS2, "notes.synthetic.json"), "utf8"));

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => a.startsWith("--") ? [[a.slice(2), arr[i+1]]] : [])
);
const SESSION = args.session || "cold";
const PORT = args.port || "8904";
const PROFILE = args.profile;
const OUT = args.out;
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome";

const requests = [];
const responses = [];
const failures = [];

async function main() {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--headless=new"]
  });
  await browser.addInitScript(() => {
    const origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input.url || input.toString());
      const r = await origFetch(input, init);
      if (url.includes(".chunks/") && r.ok) {
        const blob = await r.blob();
        return new Response(blob, { status: r.status, statusText: r.statusText, headers: r.headers });
      }
      return r;
    };
  });
  const page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(300000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (e) => {
    try {
      const u = new URL(e.request.url);
      requests.push({ id: e.requestId, ts: Date.now(), method: e.request.method,
        url: e.request.url, host: u.host, postData: e.request.postData || null });
    } catch {}
  });
  cdp.on("Network.responseReceived", (e) => {
    responses.push({ id: e.requestId, ts: Date.now(), url: e.response.url, status: e.response.status });
  });
  cdp.on("Network.loadingFailed", (e) => {
    failures.push({ id: e.requestId, ts: Date.now(), error: e.errorText });
  });
  page.on("pageerror", (err) => console.error("[pageerror]", String(err).slice(0, 200)));

  console.log(`session=${SESSION} base=${BASE}`);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  console.log("app booted");
  await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""),
    null, { timeout: 120000 });
  console.log("vault unlocked");

  // API-driven de-identification (same code the UI calls, without UI overhead)
  const notes = SESSION === "cold" ? NOTES.notes : [NOTES.notes[0]];
  const results = await page.evaluate(async (notes) => {
    const svc = await import("/src/patient-context/deid-service.js");
    await svc.preloadAdvancedDeidModel({ modelKey: "stanford-clinical" });
    const out = [];
    for (const n of notes) {
      const r = await svc.deidentifyText(n.text, { mode: "stanford-clinical" });
      out.push({ id: n.id, redacted: r.text.slice(0, 100) });
    }
    return out;
  }, notes);
  console.log(`de-identified ${results.length} notes`);
  for (const r of results) console.log(`  ${r.id}: ${r.redacted.slice(0, 60)}...`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ session: SESSION, base: BASE,
    capturedAt: new Date().toISOString(), requestCount: requests.length,
    requests, responses, failures }, null, 1));
  console.log(`wrote ${OUT} (${requests.length} requests)`);
  await browser.close();
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
