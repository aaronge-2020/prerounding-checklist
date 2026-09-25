import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const epicResults = fs.readFileSync(new URL("./fixtures/aaron-epic-results-20260924.txt", import.meta.url), "utf8");
const vitalsTable = `Date/Time | BP | HR | SpO2 | RR | Temp
09/23/26 0600 | 142/88 | 96 | 98% | 18 | 98.6 F
09/23/26 1200 | 138/84 | 92 | 99% | 16 | 98.4 F
`;

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const viewScrollTop = () => page.evaluate(() => document.querySelector("#reviewContent")?.closest(".view")?.scrollTop ?? -1);

try {
  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page);

  // ---- 1. Paste Aaron's exact Epic results ----
  await page.click('[data-action="select-admission"]');
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="results"]');
  await page.waitForSelector("#admissionSourceDraft");
  await page.fill("#admissionSourceDraft", epicResults);
  await page.waitForSelector('[data-source-parse-preview="admission"] .source-parse-review');
  const previewText = await page.locator('[data-source-parse-preview="admission"]').innerText();
  console.log("PREVIEW:", JSON.stringify(previewText.slice(0, 220)));
  assert.match(previewText, /6 sources/i, "preview must recognize 6 sources (labs + 5 free-text studies)");
  assert.match(previewText, /CTA Head-Neck with Perfusion/, "preview must list the CTA section");
  assert.match(previewText, /EKG 12 Lead/, "preview must list the EKG section");
  assert.match(previewText, /XR Chest AP/, "preview must list the XR section");
  assert.match(previewText, /CAR Echo 2D Complete w Contrast/, "preview must list the echo section");
  assert.match(previewText, /MR Brain W\/O Con/, "preview must list the MR section");
  console.log("ADMISSIONS AUTO-SOURCES: PASS");

  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => /saved|added/i.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 180000 });

  // ---- 2. Paste a vitals table as a second source ----
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="results"]');
  await page.waitForSelector("#admissionSourceDraft");
  await page.fill("#admissionSourceDraft", vitalsTable);
  await page.waitForSelector('[data-source-parse-preview="admission"] .source-parse-review');
  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => /saved|added/i.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 180000 });

  // ---- 3. Open Review Data / Draft Note ----
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.waitForSelector(".note-draft-panel");

  // Banner lists the reports still needing text.
  const bannerText = await page.locator(".review-flag-banner").innerText();
  console.log("BANNER:", JSON.stringify(bannerText.slice(0, 300)));
  for (const name of ["CTA Head-Neck", "EKG 12 Lead", "XR Chest AP", "Echo 2D Complete", "MR Brain"]) {
    assert.match(bannerText, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `banner must name ${name}`);
  }
  console.log("FLAG BANNER: PASS");

  // Flagged diagnostic rows carry the warning badge.
  const flaggedRows = await page.locator(".compact-row.needs-free-text").count();
  console.log("Flagged diagnostic rows:", flaggedRows);
  assert.ok(flaggedRows >= 5, "all 5 free-text studies must carry the needs-text flag");

  // Pending results section shows Factor V Leiden as In Process.
  const pendingSection = await page.locator('[data-compact-section="pending"]').innerText();
  console.log("PENDING SECTION:", JSON.stringify(pendingSection.slice(0, 200)));
  assert.match(pendingSection, /Factor V Leiden Mutation/, "Factor V Leiden must appear in Pending results");
  assert.match(pendingSection, /In Process/, "Factor V Leiden must show In Process");
  console.log("PENDING REVIEW SECTION: PASS");

  // ---- 4. Objective editor: Pending labs group at the bottom ----
  const groupKeys = await page.locator(".note-draft-panel [data-objective-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-objective-group")));
  console.log("OBJECTIVE GROUPS:", JSON.stringify(groupKeys));
  assert.ok(groupKeys.includes("pending-labs"), "Objective must have a Pending labs group");
  assert.equal(groupKeys[groupKeys.length - 1], "pending-labs", "Pending labs must be the last Objective group");
  const pendingGroupText = await page.locator('.note-draft-panel [data-objective-group="pending-labs"]').innerText();
  console.log("PENDING GROUP:", JSON.stringify(pendingGroupText.slice(0, 200)));
  assert.match(pendingGroupText, /Factor V Leiden Mutation/, "Pending labs group must list Factor V Leiden");
  assert.match(pendingGroupText, /In Process/, "Pending labs group must show In Process");
  // Flagged studies auto-selected with the paste prompt.
  const objectiveText = await page.locator(".note-draft-panel").innerText();
  assert.match(objectiveText, /paste report text/i, "flagged blocks must show the paste prompt");
  console.log("OBJECTIVE PENDING GROUP: PASS");

  // ---- 5. Vitals render as dense lab-style rows ----
  const chipCount = await page.locator("#reviewContent .vital-chip").count();
  const vitalRowCount = await page.locator('#reviewContent [data-compact-section="vitals"] .lab-row').count();
  console.log(`vital chips: ${chipCount}, dense vital rows: ${vitalRowCount}`);
  assert.equal(chipCount, 0, "no horizontal vital chips should remain");
  assert.ok(vitalRowCount >= 4, "vitals must render as dense rows like labs");
  console.log("VITALS DENSE UI: PASS");

  // ---- 6. Scroll preservation: lab checkbox ----
  // Scroll the view to the bottom first (the user's real complaint: the page
  // jumps back to the top when a lab is selected).
  const allLabCheckboxes = page.locator('#reviewContent input[data-objective-selection-id][data-lab-result-selection]');
  const labCount = await allLabCheckboxes.count();
  console.log("Lab checkboxes:", labCount);
  await page.evaluate(() => {
    const view = document.querySelector("#reviewContent")?.closest(".view");
    if (view) view.scrollTop = view.scrollHeight;
  });
  await page.waitForTimeout(150);
  const checkbox = allLabCheckboxes.last();
  await checkbox.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const beforeLab = await viewScrollTop();
  console.log("scrollTop at depth:", beforeLab);
  assert.ok(beforeLab > 50, "test setup: view must be scrolled down for a meaningful test");
  await checkbox.click();
  await page.waitForTimeout(500);
  const afterLab = await viewScrollTop();
  console.log(`LAB CHECKBOX: scrollTop before=${beforeLab} after=${afterLab}`);
  assert.ok(afterLab > 50, "lab selection must not jump back to the top");
  assert.ok(Math.abs(afterLab - beforeLab) < 12, `lab selection must not move scroll (moved ${beforeLab - afterLab}px)`);
  console.log("LAB SCROLL PRESERVATION: PASS");

  // ---- 7. Scroll preservation: objective group toggle (note buttons) ----
  const toggles = page.locator('.note-draft-panel [data-action="toggle-objective-group"]');
  const toggleCount = await toggles.count();
  console.log("Objective group toggles:", toggleCount);
  await page.evaluate(() => {
    const view = document.querySelector("#reviewContent")?.closest(".view");
    if (view) view.scrollTop = view.scrollHeight;
  });
  await page.waitForTimeout(150);
  const toggle = toggles.last(); // Pending labs toggle at the bottom
  await toggle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const beforeToggle = await viewScrollTop();
  console.log("scrollTop at depth:", beforeToggle);
  assert.ok(beforeToggle > 50, "test setup: view must be scrolled down for a meaningful test");
  await toggle.click();
  await page.waitForTimeout(500);
  const afterToggle = await viewScrollTop();
  console.log(`GROUP TOGGLE: scrollTop before=${beforeToggle} after=${afterToggle}`);
  assert.ok(afterToggle > 50, "note button must not jump back to the top");
  assert.ok(Math.abs(afterToggle - beforeToggle) < 12, `note button must not move scroll (moved ${beforeToggle - afterToggle}px)`);
  console.log("NOTE BUTTON SCROLL PRESERVATION: PASS");

  // ---- 8. Final note output: Pending labs at the bottom of Objective ----
  const finalNote = await page.locator(".note-draft-panel").first().innerText();
  assert.match(finalNote, /Pending labs/i, "draft must contain the Pending labs section");

  console.log("Console errors:", consoleErrors.length ? consoleErrors : "none");
  assert.equal(consoleErrors.length, 0, "no console errors allowed");
} finally {
  await browser.close();
}
console.log("AARON RESULTS VERIFICATION JOURNEY: ALL PASS");
