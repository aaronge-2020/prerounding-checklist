import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1193/chrome-linux/chrome",
  args: ["--no-sandbox", "--headless=new"]
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);
// Override fetch BEFORE app loads: buffer chunk bodies so connections free up.
// This works around a headless-Chromium deadlock with 8MB unread bodies.
// Network traffic (URLs, bytes) is identical; only buffering location changes.
await page.addInitScript(() => {
  console.log("[INIT] wrapper installed");
  const origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    console.log("[W] wrapper entry");
    const url = typeof input === "string" ? input : (input.url || input.toString());
    const r = await origFetch(input, init);
    if (url.includes(".chunks/") && r.ok) {
      console.log(`[W] buffering ${url.slice(-10)}`);
      const buf = await r.arrayBuffer();
      console.log(`[W] buffered ${url.slice(-10)}: ${buf.byteLength}`);
      return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    }
    return r;
  };
});
page.on("console", (m) => { const t = m.text(); console.log("C:", t.slice(0, 120)); });
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[F] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const root = new URL("models/", location.href);
  const modelId = "onnx-community/stanford-deidentifier-base-ONNX";
  try {
    const responses = [];
    for (let start = 0; start < 14; start += 4) {
      const batch = [0,1,2,3].map(i => start + i).filter(i => i < 14);
      s(`fetching batch ${JSON.stringify(batch)}`);
      const rs = await Promise.all(batch.map(i =>
        fetch(new URL(`${modelId}/onnx/model_quantized.chunks/${String(i).padStart(3,"0")}`, root))));
      s(`batch headers ok`);
      responses.push(...rs);
    }
    s(`all 14 fetched, reading bodies`);
    const parts = await Promise.all(responses.map(r => r.arrayBuffer()));
    const total = parts.reduce((a,p) => a + p.byteLength, 0);
    s(`DONE total ${total} bytes`);
  } catch (e) { s("THREW " + String(e).slice(0, 100)); }
});
console.log("evaluate done");
await browser.close();
