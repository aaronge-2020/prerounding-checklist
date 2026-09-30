// Quick smoke test: load a survey model, run 3 texts both modes, print entities.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");
const MODEL = process.argv[2] || "rtrigoso/bert-small-pii-detection-ONNX";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const PORT = process.env.SURVEY_PORT || "8903";
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on("console", (m) => { if (m.type() === "error") console.error("[page error]", m.text().slice(0, 250)); });
page.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 250)));
await page.goto(`http://127.0.0.1:${PORT}/survey.html?model=${encodeURIComponent(MODEL)}`);
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
console.log("loading...");
console.log(JSON.stringify(await page.evaluate(() => window.__bench.load())));
const texts = [
  "Jane Smith, born 01/02/1980, called from 555-0142. Her SSN is 123-45-6789.",
  "Patient was seen at County Hospital on 2024-03-15. Email: jane.smith@example.com",
  "The quick brown fox jumps over the lazy dog."
];
for (const mode of ["model-only", "hybrid"]) {
  const out = await page.evaluate(({ t, m }) => window.__bench.run(t, m), { t: texts, m: mode });
  console.log(`== ${mode}`);
  out.forEach((r, i) => console.log(`doc${i} ${r.ms.toFixed(0)}ms:`,
    JSON.stringify(r.entities.map(e => [texts[i].slice(e.start, e.end), e.label, e.source]))));
}
await browser.close();
