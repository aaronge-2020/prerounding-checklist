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
  if (t.startsWith("[E]") || m.type() === "error") console.log(t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
console.log("page loaded");

await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[E] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  // Intercept env.fetch on the shared transformers module instance BEFORE deid-service sets it
  const transformers = await import("/vendor/transformers/transformers.web.js");
  s("transformers module imported, installing env.fetch interceptor");
  let appFetch = null;
  Object.defineProperty(transformers.env, "fetch", {
    get() { return appFetch; },
    set(v) {
      s("app assigned env.fetch");
      appFetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        s("ENV.FETCH " + String(url).slice(0, 150));
        try {
          const r = await v(input, init);
          s("ENV.FETCH -> " + r.status + " " + String(url).slice(0, 100));
          return r;
        } catch (e) {
          s("ENV.FETCH THREW " + String((e && e.message) || e).slice(0, 150));
          throw e;
        }
      };
    },
    configurable: true
  });
  const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
  s("service imported, calling preload");
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("PRELOAD_TIMEOUT_150s")), 150000));
    const status = await Promise.race([
      svc.preloadAdvancedDeidModel({
        modelKey: "stanford-clinical",
        onStatus: (st) => s("STATUS " + (st.message || "").slice(0, 110)),
      }),
      timeout
    ]);
    s("preload resolved ready=" + status.ready);
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 300));
  }
});
console.log("evaluate returned");
await browser.close();
