import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[D]") || m.type() === "error") console.log(t.slice(0, 200));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });

await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[D] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const root = new URL("models/", location.href);
  const nativeFetch = fetch.bind(globalThis);
  const modelId = "onnx-community/stanford-deidentifier-base-ONNX";
  const directory = "onnx/model_quantized.chunks";
  try {
    const parts = [];
    for (let start = 0; start < 14; start += 4) {
      const batch = [0,1,2,3].map(i => start + i).filter(i => i < 14);
      s(`fetching batch ${JSON.stringify(batch)}`);
      const rs = await Promise.all(batch.map((index) =>
        nativeFetch(new URL(`${modelId}/${directory}/${String(index).padStart(3, "0")}`, root))));
      s(`batch headers ok, reading bodies`);
      for (const r of rs) parts.push(await r.arrayBuffer());
      s(`batch bodies read, total so far ${parts.reduce((a,p)=>a+p.byteLength,0)}`);
    }
    s(`ALL DONE total ${parts.reduce((a,p)=>a+p.byteLength,0)} bytes`);
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 200));
  }
});
console.log("evaluate returned");
await browser.close();
