import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Regression test: clicking REAL clinical-data checkboxes (lab results,
// lab panels, vitals, meds — [data-objective-selection-id]) must preserve
// scroll position. A previous test only clicked the collapse toggle
// [data-action="toggle-clinical-data"], which missed the actual checkbox
// event path that was reported broken.
//
// In wide viewports #reviewView (.view) is the scroller; below the 1040px
// breakpoint .view becomes overflow:visible and the document scrolls.

async function setupPage(viewportWidth) {
  const browser = await chromium.launch({
    executablePath: "/opt/meta-chromium/chrome",
    args: ["--allow-file-access-from-files", "--no-proxy-server"]
  });
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 800 } });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page, { passphrase: "checkbox scroll regression passphrase" });

  // Seed clinical data (labs + vitals) through the Hospital Stay admission
  // workspace so the review's clinical-data panel renders real checkboxes.
  const dayOneLabs = [
    "Results from EPIC:",
    "WBC: 12.5",
    "Hemoglobin: 10.2",
    "Platelets: 242",
    "Creatinine: 1.4",
    "Sodium: 137"
  ].join("\n");
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="laboratory_results"]');
  await page.fill("#admissionSourceDraft", dayOneLabs);
  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => document.querySelectorAll(".source-capture-editor").length === 1, { timeout: 30000 });

  const vitals = [
    "Temp: 37.2 C",
    "Heart rate: 88",
    "Blood pressure: 120/80",
    "SpO2: 98% on room air"
  ].join("\n");
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="vital_signs"]');
  await page.fill("#admissionSourceDraft", vitals);
  await page.click('[data-action="add-admission-source"]');
  await page.waitForFunction(() => document.querySelectorAll(".source-capture-editor").length === 2, { timeout: 30000 });

  // DOM .click() avoids Playwright's auto-scroll-into-view, so the scroll
  // position we set is the position the render path actually sees.
  await page.evaluate(() => document.querySelector('[data-view-target="review"]').click());
  await page.waitForSelector("[data-smart-exam]", { timeout: 30000 });
  // Expand the clinical-data section to reveal checkboxes if collapsed.
  await page.evaluate(() => {
    const panel = document.querySelector(".review-data-panel");
    if (panel?.dataset.clinicalDataCollapsed !== "true") return;
    const railToggle = document.querySelector('.clinical-data-rail-toggle[data-action="toggle-clinical-data"]');
    if (railToggle) {
      railToggle.click();
    } else {
      const sectionToggle = document.querySelector('.section-heading [data-action="toggle-clinical-data"]');
      if (sectionToggle && sectionToggle.getAttribute("aria-expanded") !== "true") sectionToggle.click();
    }
  });
  await page.waitForSelector("[data-objective-selection-id]", { timeout: 30000 });
  return { browser, page, consoleErrors };
}

async function clickCheckboxAndCheckScroll(page, selector, description) {
  const result = await page.evaluate((sel) => {
    const doc = document.scrollingElement;
    const view = document.querySelector("#reviewView");
    const scroller = view.scrollHeight > view.clientHeight + 5 ? view : doc;
    scroller.scrollTop = 400;
    const before = scroller.scrollTop;
    const checkbox = document.querySelector(sel);
    if (!checkbox) return { before, missing: true };
    // Fire a real change event the way the browser does on user click.
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    return new Promise((resolve) => setTimeout(() => {
      const maxAfter = scroller.scrollHeight - scroller.clientHeight;
      resolve({
        before,
        after: scroller.scrollTop,
        expected: Math.min(before, Math.max(0, maxAfter)),
        wasChecked: checkbox.checked
      });
    }, 700));
  }, selector);

  assert.ok(!result.missing, `${description}: checkbox should exist (${selector})`);
  assert.ok(result.before > 100, `${description}: expected scrollable content, got before=${result.before}`);
  assert.ok(
    Math.abs(result.after - result.expected) < 8,
    `${description}: scroll jumped from ${result.before} to ${result.after} (expected ~${result.expected})`
  );
  return result;
}

async function testViewport(viewportWidth) {
  const { browser, page, consoleErrors } = await setupPage(viewportWidth);
  try {
    // 1. Individual lab result checkbox
    await clickCheckboxAndCheckScroll(
      page,
      "[data-objective-selection-id][data-lab-result-selection]",
      "lab result"
    );
    console.log(`PASS: lab result checkbox scroll preserved at ${viewportWidth}px`);

    // 2. Whole lab panel checkbox
    await clickCheckboxAndCheckScroll(
      page,
      "[data-objective-selection-id][data-lab-panel-selection]",
      "lab panel"
    );
    console.log(`PASS: lab panel checkbox scroll preserved at ${viewportWidth}px`);

    // 3. Vital checkbox (first non-lab checkbox)
    const vitalSelector = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("[data-objective-selection-id]")];
      const vital = boxes.find((b) => !b.hasAttribute("data-lab-result-selection") && !b.hasAttribute("data-lab-panel-selection"));
      return vital ? `[data-objective-selection-id="${vital.dataset.objectiveSelectionId}"]` : null;
    });
    if (vitalSelector) {
      await clickCheckboxAndCheckScroll(page, vitalSelector, "vital/med");
      console.log(`PASS: vital/med checkbox scroll preserved at ${viewportWidth}px`);
    }

    // 4. Default-on item being unchecked (find a checked checkbox)
    const checkedSelector = await page.evaluate(() => {
      const box = document.querySelector("[data-objective-selection-id]:checked");
      return box ? `[data-objective-selection-id="${box.dataset.objectiveSelectionId}"]` : null;
    });
    if (checkedSelector) {
      const result = await clickCheckboxAndCheckScroll(page, checkedSelector, "uncheck default-on");
      assert.ok(!result.wasChecked, "checkbox should be unchecked after click");
      console.log(`PASS: uncheck default-on scroll preserved at ${viewportWidth}px`);
    }

    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ").slice(0, 300)}`);
  } finally {
    await browser.close();
  }
}

await testViewport(900);
await testViewport(1400);
console.log("PASS: clinical-data checkbox scroll preservation (narrow + wide)");
