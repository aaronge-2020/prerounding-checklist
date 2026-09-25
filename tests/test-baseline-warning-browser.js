// Baseline-priority labs: warning UI, Objective rendering, cross-day propagation.
// Real Chromium against the file:// app.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const dayLabs = `Results from EPIC:\nWBC: 8.8\nHemoglobin: 10.1\nCreatinine: 1.6 (H)\nSodium: 137`;

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

const rowFor = (name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll(".lab-row")].find((r) => new RegExp(n, "i").test(r.querySelector(".lab-row-name")?.textContent || ""));
  if (!row) return null;
  return {
    name: row.querySelector(".lab-row-name")?.textContent?.trim().slice(0, 30),
    meta: row.querySelector(".lab-row-meta")?.textContent?.trim().slice(0, 80),
    warnButton: !!row.querySelector(".lab-baseline-toggle.lab-baseline-warning"),
    badge: !!row.querySelector(".lab-baseline-needed")
  };
}, name);

async function addDayWithLabs(date, label, labs) {
  await page.click('[data-view-target="daily"]');
  // The "Add hospital day" disclosure is collapsed once days exist.
  const detailsOpen = await page.evaluate(() => document.querySelector("details.new-day-control")?.open);
  if (!detailsOpen) await page.click("details.new-day-control > summary");
  await page.waitForSelector("#newDayDate", { state: "visible" });
  await page.fill("#newDayDate", date);
  await page.fill("#newDayLabel", label);
  await page.click('[data-action="add-day"]');
  await page.waitForTimeout(800);
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="laboratory_results"]');
  await page.waitForSelector("#dailySourceDraft", { state: "visible" });
  await page.fill("#dailySourceDraft", labs);
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => document.querySelectorAll("#dailySources .source-capture-editor").length >= 1);
}

try {
  await openRealApp(page, appUrl);
  await unlockAndCreatePatient(page, { label: "Baseline Priority Case" });
  await addDayWithLabs("2026-09-19", "Hospital day 2", dayLabs);

  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length >= 1, null, { timeout: 15000 });
  console.log("PASS: review opened with lab rows");

  // 1. Priority labs warn; non-priority labs do not.
  const creat = await rowFor("creatinine");
  const hgb = await rowFor("hemoglobin");
  const sodium = await rowFor("sodium");
  const wbc = await rowFor("^wbc");
  assert.ok(creat?.warnButton, "creatinine shows the warning Set-baseline button");
  assert.ok(creat?.badge, "creatinine shows the '!' badge");
  assert.ok(hgb?.warnButton, "hemoglobin shows the warning Set-baseline button");
  assert.ok(hgb?.badge, "hemoglobin shows the '!' badge");
  assert.ok(!sodium?.warnButton && !sodium?.badge, "sodium (not priority) shows no warning");
  assert.ok(!wbc?.warnButton && !wbc?.badge, "WBC (not priority) shows no warning");
  console.log("PASS: warnings for creatinine + hemoglobin; none for sodium/WBC");

  // Warning button carries the guideline rationale in its tooltip.
  const title = await page.evaluate(() => document.querySelector(".lab-baseline-toggle.lab-baseline-warning")?.getAttribute("title") || "");
  assert.ok(/KDIGO|baseline/i.test(title), `warning tooltip explains why: ${title.slice(0, 80)}`);
  console.log("PASS: warning tooltip cites the rationale");

  // 2. Set a creatinine baseline with value + date.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".lab-row")].find((r) => /creatinine/i.test(r.querySelector(".lab-row-name")?.textContent || ""));
    row?.querySelector(".lab-baseline-toggle.lab-baseline-warning")?.click();
  });
  await page.waitForSelector("[data-baseline-editor]");
  await page.fill('[data-baseline-field="value"]', "0.9");
  await page.fill('[data-baseline-field="unit"]', "mg/dL");
  await page.fill('[data-baseline-field="dateLabel"]', "Aug 2026");
  await page.click('[data-action="baseline-save"]');
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  const creatAfter = await rowFor("creatinine");
  assert.ok(/base 0\.9 mg\/dL · Aug 2026/.test(creatAfter?.meta || ""), `row shows baseline with date, got: ${creatAfter?.meta}`);
  assert.ok(!creatAfter?.warnButton, "creatinine warning cleared after baseline set");
  const hgbAfter = await rowFor("hemoglobin");
  assert.ok(hgbAfter?.warnButton, "hemoglobin warning remains until its baseline is set");
  console.log("PASS: baseline saved with date; warning cleared for creatinine only");

  // 3. Select creatinine: Objective shows value + baseline with date.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".lab-row")].find((r) => /creatinine/i.test(r.querySelector(".lab-row-name")?.textContent || ""));
    row?.querySelector('[data-objective-selection-id]')?.click();
  });
  await page.waitForTimeout(1000);
  const objective = await page.evaluate(() => document.querySelector('[data-draft-section-id="objective"]')?.innerText || "");
  assert.ok(/Creatinine 1\.6/.test(objective), "Objective shows the lab value");
  assert.ok(/baseline 0\.9 mg\/dL · Aug 2026/.test(objective), `Objective shows baseline with date, got: ${objective.slice(0, 200)}`);
  console.log("PASS: Objective shows value + baseline with date");

  // 4. Cross-day propagation: new hospital day, same patient — baseline persists.
  await addDayWithLabs("2026-09-20", "Hospital day 3", dayLabs);
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length >= 1, null, { timeout: 15000 });
  const creatDay3 = await rowFor("creatinine");
  assert.ok(/base 0\.9 mg\/dL · Aug 2026/.test(creatDay3?.meta || ""), `day-3 row shows propagated baseline, got: ${creatDay3?.meta}`);
  assert.ok(!creatDay3?.warnButton, "no warning on day 3 — baseline carried over");
  console.log("PASS: baseline propagated to the next hospital day");

  // 5. Reload persistence: baseline survives a full page reload.
  await page.reload();
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""), { timeout: 30000 });
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length >= 1, null, { timeout: 15000 });
  const creatReload = await rowFor("creatinine");
  assert.ok(/base 0\.9 mg\/dL · Aug 2026/.test(creatReload?.meta || ""), "baseline survives reload");
  console.log("PASS: baseline persists across reload");

  console.log("\n=== BASELINE PRIORITY E2E PASSED ===");
} catch (e) {
  console.log("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  console.log("JS errors:", pageErrors.length ? pageErrors.join(" | ") : "none");
  await browser.close();
}
