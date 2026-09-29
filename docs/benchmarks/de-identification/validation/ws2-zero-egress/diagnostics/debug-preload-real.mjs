import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launchPersistentContext("/tmp/ws2-test-prof", {
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  headless: true,
  args: ["--no-sandbox", "--headless=new"]
});
await browser.addInitScript(() => {
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input.url || input.toString());
    const r = await origFetch(input, init);
    if (url.includes(".chunks/") && r.ok) {
      const buf = await r.arrayBuffer();
      return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    }
    return r;
  };
});
const page = browser.pages()[0] || await browser.newPage();
page.setDefaultTimeout(300000);
page.on("console", (m) => { const t = m.text(); if (t.includes("STATUS") || t.includes("preload")) console.log(t.slice(0, 150)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
// Wait for app boot
await page.waitForFunction(() => document.querySelector("#vaultPassphrase"), { timeout: 30000 });
console.log("app booted");
const result = await page.evaluate(async () => {
  const t0 = Date.now();
  const svc = await import("/src/patient-context/deid-service.js");
  console.log("STATUS importing done, calling preload");
  try {
    const pipe = await svc.preloadAdvancedDeidModel({ modelKey: "stanford-clinical" });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`STATUS preload succeeded in ${secs}s`);
    // Run a test inference
    const out = await pipe("Patient Zelda Quimby was seen on 01/02/2020.");
    console.log("STATUS inference done: " + JSON.stringify(out).slice(0, 200));
    return "OK";
  } catch (e) {
    return "FAIL: " + String((e && e.message) || e).slice(0, 300);
  }
});
console.log("RESULT:", result);
await browser.close();
