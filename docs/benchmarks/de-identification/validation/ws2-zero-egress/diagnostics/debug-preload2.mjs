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
  if (t.startsWith("[Q]") || m.type() === "error") console.log(t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8904/", { waitUntil: "domcontentloaded" });
console.log("page loaded (vault NOT unlocked)");

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  const s = (m) => console.log(`[Q] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  try {
    const svc = await import("/src/patient-context/deid-service.js?v=20260929-obi-default");
    s("service imported");
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("PRELOAD_TIMEOUT_240s")), 240000));
    const p = svc.preloadAdvancedDeidModel({
      modelKey: "stanford-clinical",
      onStatus: (st) => s("STATUS " + (st.message || "").slice(0, 120)),
      onProgress: (pr) => s("PROGRESS " + (pr.stage || "") + " " + (pr.message || "").slice(0, 100))
    });
    const status = await Promise.race([p, timeout]);
    s("preload resolved ready=" + status.ready);
    return "ok";
  } catch (e) {
    s("THREW " + String((e && e.message) || e).slice(0, 300));
    return "failed";
  }
});
console.log("evaluate returned:", r);
await browser.close();
