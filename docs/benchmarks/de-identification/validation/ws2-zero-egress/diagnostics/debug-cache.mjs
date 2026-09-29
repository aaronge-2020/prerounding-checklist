import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  try {
    const cache = await Promise.race([
      caches.open("ws2-test"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("caches.open timeout")), 15000))
    ]);
    const putMs = Date.now() - t0;
    // put a 110MB response like transformers would
    const buf = new Uint8Array(110 * 1024 * 1024);
    const resp = new Response(buf, { status: 200 });
    await Promise.race([
      cache.put("http://127.0.0.1:8904/test-big", resp),
      new Promise((_, rej) => setTimeout(() => rej(new Error("cache.put timeout")), 60000))
    ]);
    return `open ${putMs}ms, put 110MB ok, total ${Date.now() - t0}ms`;
  } catch (e) {
    return "FAILED after " + (Date.now() - t0) + "ms: " + String((e && e.message) || e);
  }
});
console.log("cache test:", r);
await browser.close();
