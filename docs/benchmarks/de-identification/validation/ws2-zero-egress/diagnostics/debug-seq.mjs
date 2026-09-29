import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  args: ["--no-sandbox", "--headless=new"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.addInitScript(() => {
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input.url || input.toString());
    const r = await origFetch(input, init);
    if (url.includes("/chunks/") && r.ok) {
      const buf = await r.arrayBuffer();
      console.log(`[W] buffered ${url.slice(-10)}: ${buf.byteLength} bytes`);
      return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    }
    return r;
  };
});
page.on("console", (m) => { const t = m.text(); if (t.startsWith("[W]") || t.startsWith("[S]")) console.log(t.slice(0, 120)); });
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[S] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const root = new URL("models/", location.href);
  const modelId = "onnx-community/stanford-deidentifier-base-ONNX";
  s(`fetching 4 concurrent`);
  const rs = await Promise.all([0,1,2,3].map(i =>
    fetch(new URL(`${modelId}/onnx/model_quantized.chunks/00${i}`, root))));
  s(`4 headers received`);
  const bufs = await Promise.all(rs.map(r => r.arrayBuffer()));
  s(`ALL DONE total ${bufs.reduce((a,b)=>a+b.byteLength,0)}`);
});
console.log("evaluate done");
await browser.close();
