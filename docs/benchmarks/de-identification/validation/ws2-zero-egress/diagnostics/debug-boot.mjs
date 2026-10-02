import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
await browser.newContext().then(async (ctx) => {
  await ctx.addInitScript(() => {
    window.__fetches = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (/models\//i.test(url)) window.__fetches.push(url);
      return nativeFetch(input, init);
    };
  });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 15000));
  const fetches = await page.evaluate(() => window.__fetches);
  console.log("model fetches on plain page load (15s):", fetches.length);
  for (const f of fetches.slice(0, 12)) console.log(" ", f.slice(0, 120));
  await browser.close();
});
