import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  args: ["--no-sandbox", "--headless=new"]
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
page.on("console", (m) => { const t = m.text(); if (t.startsWith("[E]")) console.log(t.slice(0, 150)); });
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[E] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const root = new URL("models/", location.href);
  const modelId = "onnx-community/stanford-deidentifier-base-ONNX";
  try {
    s("issuing 8 concurrent fetches");
    const ps = [0,1,2,3,4,5,6,7].map(i =>
      fetch(new URL(`${modelId}/onnx/model_quantized.chunks/00${i}`, root))
        .then(r => { s(`chunk ${i} headers: ${r.status}`); return r; }));
    const rs = await Promise.all(ps);
    s(`all 8 headers received`);
  } catch (e) { s("THREW " + String(e).slice(0, 100)); }
});
console.log("done");
await browser.close();
