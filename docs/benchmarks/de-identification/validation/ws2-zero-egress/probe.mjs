// Probe: what happens when Quick De-ID runs with stanford-clinical?
// Dumps status text + model control state every 20s, saves screenshots.
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
page.on("console", (m) => { if (m.type() === "error") console.log("[cerr]", m.text().slice(0, 300)); });

await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#vaultPassphrase");
await page.fill("#vaultPassphrase", "synthetic validation passphrase alpha beta");
await page.click('[data-action="unlock-vault"]');
await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 120000 });
console.log("unlocked");
await page.click('[data-view-target="quickDeid"]');
await page.waitForSelector("#quickDeidMode");
await page.selectOption("#quickDeidMode", "stanford-clinical");
await page.waitForTimeout(2000);

const modelCtl = await page.evaluate(() => {
  const el = document.querySelector(".quick-model-control");
  return el ? el.innerText.slice(0, 800) : "NO .quick-model-control";
});
console.log("MODEL CONTROL:\n" + modelCtl);
await page.screenshot({ path: "/tmp/ws2_probe_modelctl.png" });

await page.fill("#quickDeidInput", "Zelda Quimby, DOB 03/14/1957, MRN 8823491, phone 555-0142.");
await page.click('[data-action="run-quick-deid"]');
for (let i = 0; i < 36; i++) {
  await page.waitForTimeout(20000);
  const st = await page.evaluate(() => ({
    statusLine: document.querySelector("#statusLine")?.textContent?.slice(0, 200) || "",
    quickStatus: document.querySelector("#quickDeidContent .quick-model-control .model-selection-message")?.textContent?.slice(0, 200) || "",
    progress: document.querySelector("[data-active-model-progress-text]")?.textContent?.slice(0, 200) || "",
    hasReview: !!document.querySelector("[data-redaction-review]"),
    warnings: document.querySelector("#quickDeidContent")?.textContent?.includes("complete") ? "maybe-done" : ""
  }));
  console.log(`t+${(i + 1) * 20}s`, JSON.stringify(st));
  if (st.hasReview) { console.log("REVIEW READY"); break; }
}
await page.screenshot({ path: "/tmp/ws2_probe_end.png" });
await browser.close();
