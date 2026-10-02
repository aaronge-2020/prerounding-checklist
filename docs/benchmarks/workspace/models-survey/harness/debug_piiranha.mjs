// Debug: dump raw token-classification pipeline output for piiranha.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const PORT = process.env.SURVEY_PORT || "8903";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 250)));
await page.goto(`http://127.0.0.1:${PORT}/debug.html`);
await page.waitForFunction("window.__dbgReady === true", null, { timeout: 60000 });
const out = await page.evaluate(() => window.__dbg("My name is John Smith and my email is john.smith@gmail.com, phone 212-555-0188."));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
await browser.close();
