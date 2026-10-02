import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
console.log("page loaded");

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
  try {
    const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
    return stamp() + " imported ok, exports: " + Object.keys(svc).slice(0, 8).join(",");
  } catch (e) {
    return stamp() + " import threw: " + String((e && e.message) || e).slice(0, 300);
  }
});
console.log(r);
await browser.close();
