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
  if (t.startsWith("[F]") || m.type() === "error") console.log(t.slice(0, 400));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
console.log("page loaded");

await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[F] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  // wrap native fetch to log model-file requests
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (/onnx|huggingface|tokenizer|config\.json/i.test(url)) s("FETCH " + url.slice(0, 160));
    return nativeFetch(input, init);
  };
  try {
    const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
    s("service imported");
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("PRELOAD_TIMEOUT_180s")), 180000));
    const p = svc.preloadAdvancedDeidModel({
      modelKey: "stanford-clinical",
      onStatus: (st) => s("STATUS " + (st.message || "").slice(0, 100)),
    });
    const status = await Promise.race([p, timeout]);
    s("preload resolved ready=" + status.ready);
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 300));
  }
});
console.log("evaluate returned");
await browser.close();
