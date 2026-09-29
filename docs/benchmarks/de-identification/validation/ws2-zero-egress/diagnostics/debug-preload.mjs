// Debug: call preloadAdvancedDeidModel directly with timestamped progress.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, t.slice(0, 400));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#vaultPassphrase");
await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
await page.click('[data-action="unlock-vault"]');
await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 120000 });
console.log("unlocked");

const t0 = Date.now();
const result = await page.evaluate(async () => {
  const log = [];
  const stamp = () => `${((Date.now() - window.__t0) / 1000).toFixed(1)}s`;
  window.__t0 = Date.now();
  try {
    const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
    log.push(stamp() + " service imported");
    const status = await svc.preloadAdvancedDeidModel({
      modelKey: "stanford-clinical",
      onStatus: (s) => log.push(stamp() + " STATUS " + JSON.stringify(s).slice(0, 220)),
      onProgress: (p) => log.push(stamp() + " PROGRESS " + JSON.stringify(p).slice(0, 220))
    });
    log.push(stamp() + " preload resolved: " + JSON.stringify(status).slice(0, 300));
    return { ok: true, log };
  } catch (e) {
    log.push(stamp() + " THREW " + String((e && e.message) || e).slice(0, 500));
    return { ok: false, log };
  }
});
for (const line of result.log) console.log(line);
console.log("driver elapsed:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
await browser.close();
