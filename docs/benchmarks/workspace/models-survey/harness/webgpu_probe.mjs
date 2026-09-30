// Probe WebGPU availability in the headless chromium shell.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const extra = process.argv[2] ? JSON.parse(process.argv[2]) : [];
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", ...extra]
});
const page = await browser.newPage();
await page.goto("about:blank");
const info = await page.evaluate(async () => {
  const out = { hasNavigatorGpu: !!navigator.gpu };
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      out.adapter = !!adapter;
      out.adapterInfo = adapter ? String(adapter.info?.device || adapter.info) : null;
      if (adapter) {
        const device = await adapter.requestDevice();
        out.device = !!device;
        out.limits = device ? { maxBufferSize: device.limits.maxBufferSize } : null;
        device.destroy();
      }
    } catch (e) { out.error = String(e).slice(0, 200); }
  }
  return out;
});
console.log(JSON.stringify(info));
await browser.close();
