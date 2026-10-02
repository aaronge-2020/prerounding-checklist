import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[STAGE]") || m.type() === "error") console.log(t.slice(0, 400));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#vaultPassphrase");
await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
await page.click('[data-action="unlock-vault"]');
await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 120000 });
console.log("unlocked, starting preload");

await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[STAGE] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  try {
    const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
    s("service imported");
    const p = svc.preloadAdvancedDeidModel({
      modelKey: "stanford-clinical",
      onStatus: (st) => s("STATUS " + JSON.stringify(st).slice(0, 200)),
      onProgress: (pr) => s("PROGRESS " + JSON.stringify(pr).slice(0, 200))
    });
    // watchdog: log every 30s while waiting
    const wd = setInterval(() => s("... still waiting"), 30000);
    const status = await p;
    clearInterval(wd);
    s("preload resolved: " + JSON.stringify(status).slice(0, 200));
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 400));
  }
});
console.log("evaluate returned");
await browser.close();
