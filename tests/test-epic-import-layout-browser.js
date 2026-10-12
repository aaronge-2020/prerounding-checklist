import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer } from "./browser/app-harness.js";

const server = await createAppServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const note = "HISTORY OF PRESENT ILLNESS:\nCough for three days.\n\nPHYSICAL EXAM:\nLungs clear.\n\nASSESSMENT:\nCough.\n\nPLAN:\nMonitor symptoms.";
async function inViewport(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height, `${selector} must fit in the viewport`);
}
async function screenshot(name) {
  if (process.env.EPIC_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.EPIC_SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

try {
  await page.goto(server.baseUrl);
  await page.fill("#vaultPassphrase", "layout test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.fill("#newPatientLabel", "Demo");
  await page.click('[data-action="admit-patient"]');
  await page.click('[data-view-target="daily"]');
  const paste = "#admissionPrimaryNotePaste";
  const box = await page.locator(paste).boundingBox();
  assert.ok(box.y < 380, `paste begins too low: ${box.y}`);
  await inViewport('[data-action="review-structured-note-sections"]');
  await page.fill(paste, note);
  await screenshot("epic-paste");
  await page.click('[data-action="review-structured-note-sections"]');
  await settle();
  assert.equal(await page.locator('[data-structured-note-field="physical_exam"]').inputValue(), "Lungs clear.");
  await inViewport('[data-action="save-structured-note-to-draft"]');
  await screenshot("epic-review");

  // Edits survive changing entry mode and chart-source tabs.
  await page.fill('[data-structured-note-field="physical_exam"]', "Lungs clear. No wheeze.");
  await page.click('[data-note-mode="paste"]');
  assert.equal(await page.locator(paste).inputValue(), note);
  await page.getByRole("button", { name: /^Vital signs/ }).click();
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="primary_note"]');
  await page.click('[data-action="review-structured-note-sections"]');
  assert.equal(await page.locator('[data-structured-note-field="physical_exam"]').inputValue(), "Lungs clear. No wheeze.");
  await page.locator(".note-additional-sections > summary").click();
  await page.locator('.note-section-title[data-note-field="other"]').click();
  const scroll = await page.locator(".stay-content").evaluate((el) => el.scrollTop);
  assert.ok(scroll > 0, "additional sections should be reachable within the document");
  await page.locator('.note-section-title[data-note-field="other"]').click();
  await settle();
  assert.equal(await page.locator(".stay-content").evaluate((el) => el.scrollTop), scroll);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-note-mode="paste"]').click();
    await page.click('[data-action="review-structured-note-sections"]');
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal page overflow");
    const field = page.locator('[data-structured-note-field="physical_exam"]');
    await field.scrollIntoViewIfNeeded();
    const fieldBox = await field.boundingBox();
    assert.ok(fieldBox.height >= 38, "section text must retain a readable minimum height");
    assert.equal(await field.evaluate(el=>el.clientHeight>=el.scrollHeight),true,"full text should be visible");
    assert.equal(await field.inputValue(), "Lungs clear. No wheeze.");
    if (width === 1280) await inViewport('[data-action="save-structured-note-to-draft"]');
    await screenshot(`epic-review-${width}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: compact Epic input, parsing, draft retention, section scrolling, desktop actions, and mobile layout");
} finally {
  await browser.close();
  await server.close();
}
