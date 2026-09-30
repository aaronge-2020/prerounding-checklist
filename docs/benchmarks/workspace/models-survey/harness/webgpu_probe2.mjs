// Probe WebGPU with the full chromium build (new headless) + SwiftShader.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--headless=new",
         "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const page = await browser.newPage();
await page.goto("about:blank");
const info = await page.evaluate(async () => {
  const out = { hasNavigatorGpu: !!navigator.gpu };
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      out.adapter = !!adapter;
      if (adapter) {
        out.adapterInfo = { device: adapter.info?.device, architecture: adapter.info?.architecture, description: (adapter.info?.description || "").slice(0, 120) };
        const device = await adapter.requestDevice();
        out.device = !!device;
        device.destroy();
      }
    } catch (e) { out.error = String(e).slice(0, 200); }
  }
  return out;
});
console.log(JSON.stringify(info));
await browser.close();
