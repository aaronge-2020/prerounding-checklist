import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

for (const extra of [[], ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]]) {
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", ...extra]
  });
  const page = await browser.newPage();
  const r = await page.evaluate(async () => {
    if (!navigator.gpu) return "no navigator.gpu";
    try {
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))
      ]);
      return "adapter: " + (adapter ? "ok" : "null");
    } catch (e) {
      return "adapter error: " + String(e).slice(0, 120);
    }
  });
  console.log(extra.length ? "swiftshader" : "default", "->", r);
  await browser.close();
}
