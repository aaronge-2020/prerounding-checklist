import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(0, 160)); });
page.on("requestfailed", (r) => console.log("FAILED", r.url().slice(0, 160), r.failure()?.errorText));
await page.goto(`http://127.0.0.1:8903/survey2.html?model=${encodeURIComponent("Wismut/openmed-onnx/small")}&dtype=int8`);
await page.waitForFunction("window.__benchReady === true", null, { timeout: 60000 });
try { await page.evaluate(() => window.__bench.load()); } catch (e) { console.log("load threw:", String(e).slice(0, 120)); }
await new Promise(r => setTimeout(r, 3000));
await browser.close();
