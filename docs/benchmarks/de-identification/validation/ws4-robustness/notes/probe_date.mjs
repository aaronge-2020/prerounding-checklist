// Probe: why is the follow-up DATE missed? Runs minimal snippets through the
// real pipeline (hybrid) via the copied harness page. Run AFTER the driver
// finishes to avoid contending for the machine.
import { createRequire } from "node:module";
const require = createRequire("/home/hatch/workspace/prerounding/repo/package.json");
const { chromium } = require("playwright-core");

const PORT = process.env.WS4_PORT || 8904;
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
await page.goto(`http://127.0.0.1:${PORT}/harness.html`);
await page.waitForFunction("window.__benchReady === true", null, { timeout: 120000 });
await page.evaluate(() => window.__bench.load());

const probes = [
  "Follow up with Dr. Priya Cohen on 08/15/2026 at 2:15 PM.",
  "Admission Date: 01/10/2026",
  "Follow up on 08/15/2026 at 2:15 PM.",
  "The follow-up is on 08/15/2026.",
  "See Dr. Priya Cohen on 08/15/2026.",
  "Repeat assessment due 09/30/2026.",
  "Follow-up 09/30/2026; confirm by calling 410-555-0100.",
  "Procedure scheduled 09/24/2026 at 2:30 PM in the main OR.",
  "The 47-year-old male presents with chest pain.",
  "Patient is 47 years old.",
  "The 92-year-old was admitted.",
  "Pt from Annapolis, Maryland 21401.",
  "Pt from Baltimore MD 21201.",
  "Lives in Baltimore, Maryland.",
];
const out = await page.evaluate(
  (texts) => window.__bench.run(texts, "hybrid"), probes);
probes.forEach((t, i) => {
  console.log("TEXT:", t);
  for (const e of out[i].entities)
    console.log(`   [${e.start},${e.end}] ${e.label} src=${e.source} ${JSON.stringify(t.slice(e.start, e.end))}`);
});
await browser.close();
