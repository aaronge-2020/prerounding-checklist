import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  args: ["--no-sandbox", "--headless=new"]
});
const page = await browser.newPage();
page.on("console", (m) => console.log("CONSOLE:", m.text().slice(0, 100)));
await page.addInitScript(() => {
  console.log("[INIT] init script running");
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    console.log("[W] wrapper called");
    return origFetch(input, init);
  };
  console.log("[INIT] fetch overridden");
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  console.log("[EVAL] calling fetch");
  const r = await fetch("/index.html");
  console.log("[EVAL] fetch done: " + r.status);
});
await browser.close();
