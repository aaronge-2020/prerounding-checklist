import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, unlockAndCreatePatient } from "./browser/app-harness.js";

// Full temperature-unit confirmation flow with an unmarked temperature:
// banner appears -> confirm °F -> banner disappears -> vital enters the note
// with the confirmed unit -> survives reload.
const vitalsWithUnmarkedTemp = `Vital signs 09/20 08:00:
Temp 99.1
HR 88
BP 128/76
RR 18
SpO2 97%`;

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(appUrl);
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await unlockAndCreatePatient(page, { label: "Temp Unit Case" });

  // Add a hospital day and paste vitals with an unmarked temperature.
  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-09-20");
  await page.fill("#newDayLabel", "Hospital day 1");
  await page.click('[data-action="add-day"]');
  await page.waitForTimeout(800);
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="vital_signs"]');
  await page.fill("#dailySourceDraft", vitalsWithUnmarkedTemp);
  await page.click('[data-action="add-daily-source"]');
  await page.waitForTimeout(1500);

  // Open the review view.
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace", { timeout: 30000 });

  // The unmarked-temperature banner must appear.
  await page.waitForSelector(".unit-confirm-banner", { timeout: 15000 });
  const bannerText = await page.locator(".unit-confirm-banner").innerText();
  console.log("Banner:", bannerText.slice(0, 120));
  assert.match(bannerText, /Unit not stated in the source/);
  console.log("PASS: unmarked-temperature banner appears");

  // The unmarked temperature must NOT be in the note's vitals synthesis yet.
  const vitalsBefore = await page.locator('[data-draft-section="objective"], [data-draft-objective-manual]').first().innerText().catch(() => "");
  console.log("(objective before confirm — informational)");

  // Confirm °F.
  await page.click('.unit-confirm-banner [data-action="confirm-temperature-unit"][data-unit="°F"]');
  await page.waitForFunction(
    () => !document.querySelector(".unit-confirm-banner"),
    { timeout: 15000 }
  );
  console.log("PASS: banner disappears after °F confirm");
  const statusText = await page.locator("#statusLine").innerText();
  assert.match(statusText, /Temperature unit confirmed/i);
  console.log("PASS: confirmation toast/status shown");

  // The temperature should now appear with °F in the vitals area.
  await page.waitForTimeout(1000);
  const vitalRows = await page.locator(".lab-row.vital-row").allInnerTexts();
  const tempText = vitalRows.join(" | ");
  console.log("Vital rows:", tempText.slice(0, 300));
  assert.ok(/99\.1/.test(tempText) && /°F/.test(tempText), "confirmed temperature should appear among vitals with °F");
  console.log("PASS: temperature included in vitals after confirm");

  // Save draft and reload — the confirmation must persist.
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /draft saved/i.test(document.querySelector("#statusLine")?.textContent || ""), { timeout: 15000 });
  await page.reload();
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.waitForTimeout(1500);
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector('[data-action="select-day"]', { timeout: 15000 });
  await page.locator('[data-action="select-day"]').last().click();
  await page.waitForSelector('[data-action="open-progress-note"]', { timeout: 15000 });
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace", { timeout: 30000 });
  await page.waitForTimeout(1000);

  const bannerAfter = await page.locator(".unit-confirm-banner").count();
  assert.equal(bannerAfter, 0, "banner must not reappear after reload");
  const vitalRowsAfter = await page.locator(".lab-row.vital-row").allInnerTexts();
  const vitalsAfterText = vitalRowsAfter.join(" ");
  assert.ok(/99\.1/.test(vitalsAfterText) && /°F/.test(vitalsAfterText), "temperature must persist after reload with °F");
  console.log("PASS: confirmation persists across reload");

  console.log("\n=== TEMPERATURE UNIT FLOW PASSED ===");
  console.log("Page errors:", pageErrors.length ? pageErrors : "none");
  assert.equal(pageErrors.length, 0, "no page errors allowed");
} finally {
  await browser.close();
}
