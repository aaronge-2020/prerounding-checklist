import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const labs = `09/23/26 10:57
WBC: 12.3 (H)
Hemoglobin: 9.1 (L)
`;

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page);
  await page.click('[data-action="select-admission"]');
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="results"]');
  await page.fill("#admissionSourceDraft", labs);
  await page.waitForSelector('[data-source-parse-preview="admission"] .source-parse-review');
  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => /saved|added/i.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 180000 });
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");

  // Select both CBC labs.
  await page.locator('#reviewContent input[data-objective-selection-id][data-lab-result-selection]').first().click();
  await page.waitForTimeout(300);
  await page.locator('#reviewContent input[data-objective-selection-id][data-lab-result-selection]').nth(1).click();
  await page.waitForTimeout(300);

  const groupKeys = await page.locator(".note-draft-panel [data-objective-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-objective-group")));
  console.log("GROUPS:", JSON.stringify(groupKeys));
  const cbcKey = groupKeys.find((k) => k.startsWith("lab:"));
  assert.ok(cbcKey, "a lab family group must exist");

  // Edit the group's combined text inline.
  const editor = page.locator(`.note-draft-panel [data-objective-group-text="${cbcKey}"]`);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("WBC 12.3 high, Hgb 9.1 low — likely acute bleed");
  await page.keyboard.press("Tab"); // blur commits the edit
  await page.waitForTimeout(500);

  // Members must survive: both checkboxes still checked in Clinical data.
  const checkedCount = await page.locator('#reviewContent input[data-objective-selection-id][data-lab-result-selection]:checked').count();
  console.log("checked lab boxes after group edit:", checkedCount);
  assert.equal(checkedCount, 2, "group edit must not deselect or delete member blocks");

  // The final note shows the student's words.
  const panelText = await page.locator(".note-draft-panel").first().innerText();
  assert.match(panelText, /likely acute bleed/, "edited group text must reach the note");

  // Unchecking one member drops the override and restores generated text.
  await page.locator('#reviewContent input[data-objective-selection-id][data-lab-result-selection]').first().click();
  await page.waitForTimeout(500);
  const panelText2 = await page.locator(".note-draft-panel").first().innerText();
  console.log("after uncheck:", JSON.stringify(panelText2.slice(0, 200)));
  assert.doesNotMatch(panelText2, /likely acute bleed/, "membership change must drop the stale override");

  console.log("Console errors:", consoleErrors.length ? consoleErrors : "none");
  assert.equal(consoleErrors.length, 0, "no console errors allowed");
} finally {
  await browser.close();
}
console.log("GROUP EDIT JOURNEY: ALL PASS");
