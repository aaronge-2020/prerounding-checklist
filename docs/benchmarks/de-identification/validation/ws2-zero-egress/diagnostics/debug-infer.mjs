import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launchPersistentContext("/tmp/ws2-infer-prof", {
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
      const blob = await r.blob();
      return new Response(blob, { status: r.status, statusText: r.statusText, headers: r.headers });
    }
    return r;
  };
});
const page = browser.pages()[0] || await browser.newPage();
page.setDefaultTimeout(300000);
page.on("console", (m) => { const t = m.text(); if (t.startsWith("[I]")) console.log(t.slice(0, 200)); });
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#vaultPassphrase", { timeout: 30000 });
const result = await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[I] ${((Date.now()-t0)/1000).toFixed(1)}s ${m}`);
  const svc = await import("/src/patient-context/deid-service.js");
  s("loading model");
  await svc.preloadAdvancedDeidModel({ modelKey: "stanford-clinical" });
  s("model loaded, getting deidentifier");
  const deid = await svc.getAdvancedDeidentifier({ modelKey: "stanford-clinical" });
  s("running inference");
  const out = await deid.deidentifyText("Patient Zelda Quimby was seen on 01/02/2020.", {});
  s("inference done");
  return JSON.stringify(out).slice(0, 500);
});
console.log("RESULT:", result);
await browser.close();
