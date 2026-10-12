import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer } from "./browser/app-harness.js";

const server = await createAppServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const note = `HISTORY OF PRESENT ILLNESS:\n${"Cough for three days. Symptoms improved overnight.\n".repeat(40)}\nPHYSICAL EXAM:\nLungs clear.\n\nASSESSMENT:\nCough.\n\nPLAN:\nMonitor symptoms.`;
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
  await page.locator(".toast-dismiss").click();
  const originalWidth = await page.locator("#dailyView").boundingBox();
  assert.ok(originalWidth.width > 1400, "Epic workspace uses full desktop width");
  await page.locator("#secondaryNavigation > summary").click();
  assert.equal(await page.locator('[data-view-target="settings"]').isVisible(), true);
  await page.locator("#secondaryNavigation > summary").click();
  await page.fill(paste, note);
  await screenshot("epic-paste");
  await page.click('[data-action="review-structured-note-sections"]');
  await settle();
  assert.equal(await page.locator('[data-structured-note-field="physical_exam"]').inputValue(), "Lungs clear.");
  await screenshot("epic-review");
  await inViewport('[data-action="save-structured-note-to-draft"]');
  assert.equal(await page.locator('[data-note-original]').evaluate(el => el.scrollHeight > el.clientHeight), true, "long originals scroll within their pane");
  assert.ok((await page.locator('.note-source-sheet').boundingBox()).height <= 442, "original pane has a compact fixed height");
  await page.locator('[data-note-original]').hover();
  await page.mouse.wheel(0, 350);
  await page.waitForFunction(() => document.querySelector('[data-note-original]').scrollTop > 0);
  const ids = await page.locator('[data-structured-note-field]').evaluateAll(nodes => nodes.map(node => node.dataset.structuredNoteField));
  assert.equal(ids[0], 'one_liner', 'one-liner is the first visible destination');
  assert.equal(ids.length, 21);
  assert.equal(await page.locator('.note-additional-sections').count(), 0);
  for (const id of ids) {
    await page.getByLabel('Go to section', {exact:true}).selectOption(id);
    assert.equal(await page.locator(`[data-note-drop-field="${id}"]`).evaluate(el => {
      const card = el.getBoundingClientRect(), pane = el.parentElement.getBoundingClientRect();
      return card.top >= pane.top && card.top < pane.bottom;
    }), true, `${id} is reachable without expanding hidden sections`);
  }
  await page.getByLabel('Go to section', {exact:true}).selectOption('one_liner');
  await page.getByRole('textbox', {name:'One-liner', exact:true}).fill('Adult admitted with cough.');

  // Edits survive changing entry mode and chart-source tabs.
  await page.fill('[data-structured-note-field="physical_exam"]', "Lungs clear. No wheeze.");
  await page.click('[data-note-mode="paste"]');
  assert.equal(await page.locator(paste).inputValue(), note);
  await page.getByRole("button", { name: /^Vital signs/ }).click();
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="primary_note"]');
  await page.click('[data-action="review-structured-note-sections"]');
  assert.equal(await page.locator('[data-structured-note-field="physical_exam"]').inputValue(), "Lungs clear. No wheeze.");
  assert.equal(await page.getByRole('textbox', {name:'One-liner', exact:true}).inputValue(), 'Adult admitted with cough.');
  await page.locator('[data-note-field="other"]').click();
  const scroll = await page.locator(".note-arrange-sections").evaluate((el) => el.scrollTop);
  assert.ok(scroll > 0, "additional sections should be reachable inside the review pane");
  await page.locator('[data-note-field="other"]').click();
  await settle();
  assert.equal(await page.locator(".note-arrange-sections").evaluate((el) => el.scrollTop), scroll);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-note-mode="paste"]').click();
    await page.click('[data-action="review-structured-note-sections"]');
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal page overflow");
    const field = page.locator('[data-structured-note-field="physical_exam"]');
    await field.scrollIntoViewIfNeeded();
    const fieldBox = await field.boundingBox();
    assert.ok(fieldBox.height >= 72, "section text must not collapse in the scrollable grid");
    assert.equal(await field.inputValue(), "Lungs clear. No wheeze.");
    if (width === 1280) await inViewport('[data-action="save-structured-note-to-draft"]');
    await screenshot(`epic-review-${width}`);
  }
  for (const width of [1041, 1100, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => {
      const menu = document.querySelector('#secondaryNavigation > summary').getBoundingClientRect();
      return menu.right <= document.querySelector('.top-bar').getBoundingClientRect().left;
    }), true, `navigation and patient controls must not overlap at ${width}`);
  }
  await page.locator('#secondaryNavigation > summary').click();
  await page.locator('[data-view-target="settings"]').click();
  assert.equal(await page.locator('#settingsView.active').isVisible(), true);
  await page.locator('[data-view-target="daily"]').click();
  assert.equal(await page.locator('[data-structured-note-field="physical_exam"]').inputValue(), "Lungs clear. No wheeze.");
  assert.deepEqual(errors, []);
  console.log("PASS: compact Epic input, parsing, draft retention, section scrolling, desktop actions, and mobile layout");
} finally {
  await browser.close();
  await server.close();
}
