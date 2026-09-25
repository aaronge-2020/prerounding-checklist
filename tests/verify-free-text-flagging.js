import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const epicResults = `Results from Epic
01/08/2026 06:00
WBC: 9.0
Hgb: 9.7
CT Abdomen/Pelvis w/ contrast: RCT
EKG: Final
Blood cultures x2: Pending
`;

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page);

  // Go to the admissions tab (admission sources).
  await page.click('[data-action="select-admission"]');
  // Select the "Other results" source kind to reveal the paste composer.
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="results"]');
  await page.waitForSelector("#admissionSourceDraft");

  // Paste Epic results containing placeholder free-text studies.
  await page.fill("#admissionSourceDraft", epicResults);
  // Parse preview should appear showing split sections.
  await page.waitForSelector('[data-source-parse-preview="admission"] .source-parse-review');

  const previewText = await page.locator('[data-source-parse-preview="admission"]').innerText();
  console.log("PARSE PREVIEW:", JSON.stringify(previewText.slice(0, 400)));

  // The preview must show the split: labs + 3 flagged free-text sections.
  assert.match(previewText, /4 sources/i, "preview must recognize 4 sources (labs + 3 flagged studies)");
  assert.match(previewText, /CT Abdomen\/Pelvis w\/ contrast/, "preview must list the CT section");
  assert.match(previewText, /EKG/, "preview must list the EKG section");
  assert.match(previewText, /Blood cultures x2/, "preview must list the blood culture section");

  // The add button should reflect multiple sources.
  const addButtonText = await page.locator('[data-action="add-admission-source"]').innerText();
  console.log("ADD BUTTON:", JSON.stringify(addButtonText));
  assert.match(addButtonText, /4 sources/i, "add button must offer to add 4 sources");

  console.log("ADMISSIONS TAB AUTO-POPULATION: PASS");

  // Save (de-identify) the sources.
  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => /saved|added/i.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 120000 });

  // Open Review Data / Draft Note.
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForSelector(".note-draft-panel");

  // 1. Attention banner lists the flagged results.
  const banner = page.locator(".review-flag-banner");
  assert.equal(await banner.count(), 1, "flag banner must render");
  const bannerText = await banner.innerText();
  console.log("BANNER:", JSON.stringify(bannerText));
  assert.match(bannerText, /CT Abdomen\/Pelvis/, "banner must name the CT");
  assert.match(bannerText, /EKG/, "banner must name the EKG");

  // 2. Flagged results are auto-selected into the Objective editor with warnings.
  const objectiveText = await page.locator(".note-draft-panel").innerText();
  console.log("OBJECTIVE (excerpt):", JSON.stringify(objectiveText.slice(0, 500)));
  assert.match(objectiveText, /CT Abdomen\/Pelvis/, "CT must be auto-selected into Objective");
  assert.match(objectiveText, /paste report text/i, "flagged blocks must show the paste prompt");

  // 3. Clinical Data diagnostic rows carry the warning badge.
  const flaggedRows = await page.locator('.compact-row.needs-free-text').count();
  console.log("Flagged diagnostic rows:", flaggedRows);
  assert.ok(flaggedRows >= 2, "at least 2 diagnostic rows must carry the needs-text flag");

  // 4. Imaging group exists in the Objective editor.
  const imagingGroup = await page.locator('.note-draft-panel [data-objective-group="result:imaging"]').count();
  assert.equal(imagingGroup, 1, "imaging group must render in the Objective editor");

  console.log("REVIEW UI FLAGGING: PASS");
  console.log("Console errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
  await browser.close();
}
console.log("FREE-TEXT RESULT FLAGGING JOURNEY: ALL PASS");
