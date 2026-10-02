import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launchPersistentContext("/tmp/ws2-step-prof", {
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
page.setDefaultTimeout(180000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
console.log("booted");
await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
await page.click('[data-action="unlock-vault"]');
await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 120000 });
console.log("vault unlocked");
// Navigate to Quick De-ID and select Stanford (mimic capture)
await page.click('[data-view-target="quickDeid"]');
await page.waitForSelector("#quickDeidMode", { timeout: 60000 });
await page.selectOption("#quickDeidMode", "stanford-clinical");
console.log("selected stanford-clinical");
// Run a note (triggers model load)
await page.fill("#quickDeidInput", "Patient Zelda Quimby was seen on 01/02/2020.");
await page.click('[data-action="run-quick-deid"]');
console.log("run clicked, waiting for review");
await page.waitForSelector('[data-action="confirm-all-quick-redactions"], .quick-review-complete', { timeout: 600000 });
console.log("de-id done");
await browser.close();
console.log("DONE");
