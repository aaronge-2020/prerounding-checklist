import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("Wismut/openmed-onnx/small/config.json")) {
      window.__wismutStack = new Error("trace").stack;
    }
    return nativeFetch(input, init);
  };
});
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 8000));
const stack = await page.evaluate(() => window.__wismutStack || "NO STACK CAPTURED");
console.log(stack.split("\n").slice(0, 14).join("\n"));
await browser.close();
