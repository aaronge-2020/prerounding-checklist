import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[C]") || m.type() === "error") console.log(t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });

await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[C] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const root = new URL("models/", location.href);
  const nativeFetch = fetch.bind(globalThis);
  const modelId = "onnx-community/stanford-deidentifier-base-ONNX";
  const directory = "onnx/model_quantized.chunks";
  try {
    const responses = [];
    for (let start = 0; start < 14; start += 4) {
      const batch = [0,1,2,3].map(i => start + i).filter(i => i < 14);
      s(`fetching batch ${JSON.stringify(batch)}`);
      const rs = await Promise.all(batch.map((index) => {
        const chunkName = String(index).padStart(3, "0");
        return nativeFetch(new URL(`${modelId}/${directory}/${chunkName}`, root));
      }));
      s(`batch done, statuses: ${rs.map(r => r.status).join(",")}`);
      responses.push(...rs);
    }
    s("all fetched, reading arrayBuffers");
    const parts = await Promise.all(responses.map((r, i) =>
      r.arrayBuffer().then(b => { s(`chunk ${i}: ${b.byteLength} bytes`); return b; })
    ));
    const total = parts.reduce((a, p) => a + p.byteLength, 0);
    s(`total ${total} bytes, creating blob`);
    const blob = new Blob(parts, { type: "application/octet-stream" });
    s(`blob ${blob.size} bytes, creating response`);
    const resp = new Response(blob, { status: 200 });
    s("response created, reading back");
    const back = await resp.arrayBuffer();
    s(`read back ${back.byteLength} bytes — DONE`);
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 300));
  }
});
console.log("evaluate returned");
await browser.close();
