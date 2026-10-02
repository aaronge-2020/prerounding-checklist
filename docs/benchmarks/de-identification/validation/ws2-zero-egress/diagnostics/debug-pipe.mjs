import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const useBrowserCache = process.argv[2] === "cache";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[P]") || m.type() === "error") console.log(t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
console.log("page loaded, useBrowserCache =", useBrowserCache);

await page.evaluate(async (useCache) => {
  const t0 = Date.now();
  const s = (m) => console.log(`[P] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  try {
    const transformers = await import("/vendor/transformers/transformers.web.js");
    s("transformers imported");
    const base = new URL("./", location.href).href;
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = true;
    transformers.env.localModelPath = new URL("models/", base).href;
    const nativeFetch = fetch.bind(globalThis);
    // replicate app's chunk assembly for the onnx file
    transformers.env.fetch = async (input, init) => {
      const raw = typeof input === "string" ? input : input.url;
      const root = new URL("models/", base);
      const req = new URL(raw, base);
      const m = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/.exec(raw);
      const target = m ? new URL(`models/${m[1]}/${m[2]}`, base) : req;
      if (target.origin === root.origin && target.href.startsWith(root.href)) {
        const rel = decodeURIComponent(target.pathname.slice(new URL("models/", base).pathname.length));
        if (rel === "onnx-community/stanford-deidentifier-base-ONNX/onnx/model_quantized.onnx") {
          s("assembling 14 chunks...");
          const parts = await Promise.all(Array.from({ length: 14 }, (_, i) =>
            nativeFetch(new URL(`models/onnx-community/stanford-deidentifier-base-ONNX/onnx/model_quantized.chunks/${String(i).padStart(3, "0")}`, base)).then(r => r.arrayBuffer())));
          const total = parts.reduce((a, p) => a + p.byteLength, 0);
          s("chunks assembled: " + total + " bytes");
          return new Response(new Blob(parts, { type: "application/octet-stream" }), { status: 200 });
        }
        return nativeFetch(target, init);
      }
      return new Response("External model requests are disabled.", { status: 403 });
    };
    transformers.env.useBrowserCache = useCache;
    if (transformers.env.backends?.onnx?.wasm) {
      transformers.env.backends.onnx.wasm.wasmPaths = {
        mjs: new URL("vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs", base).href,
        wasm: new URL("vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm", base).href
      };
      transformers.env.backends.onnx.wasm.proxy = false;
    }
    s("creating pipeline...");
    const pipe = await transformers.pipeline("token-classification", "onnx-community/stanford-deidentifier-base-ONNX", {
      dtype: "q8",
      local_files_only: true,
      progress_callback: (p) => s("tf-progress " + p.status + " " + (p.file || "") + " " + (p.progress || ""))
    });
    s("pipeline created");
    const out = await pipe("Zelda Quimby was admitted on 03/14/2025.", { aggregation_strategy: "simple" });
    s("inference done: " + JSON.stringify(out).slice(0, 300));
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 400));
  }
}, useBrowserCache);
console.log("evaluate returned");
await browser.close();
