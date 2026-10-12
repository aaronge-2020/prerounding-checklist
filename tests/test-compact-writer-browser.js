import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const server = await createAppServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await openRealApp(page, process.env.COMPACT_APP_URL || server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.locator('[data-note-mode="sections"]').click();
  await page.locator('[data-structured-note-field="one_liner"]').fill("Synthetic admission summary.");
  await page.locator('[data-action="save-structured-note-to-draft"]').click();
  await page.locator("#reviewView.active").waitFor();
  assert.equal(await page.locator(".review-data-panel").isVisible(), false);
  assert.ok((await page.locator(".note-draft-panel").boundingBox()).width > 1300);
  for (const name of ["First problem", "Second problem"]) {
    await page.locator('[data-action="add-plan-problem"]').click();
    await page.locator('.plan-problem-card [data-problem-field="problem"]').last().fill(name);
  }
  assert.deepEqual(await page.locator(".writer-problem-link span").allTextContents(), ["First problem", "Second problem"]);
  const card = page.locator(".plan-problem-card").last();
  for (const diagnosis of ["Candidate A", "Candidate B"]) {
    await card.locator('[data-action="add-differential"]').click();
    await card.locator('[data-differential-field="diagnosis"]').last().fill(diagnosis);
  }
  await card.locator('[data-differential-field="cluesFor"]').last().fill("Supporting fact");
  await card.locator('[data-differential-field="cluesAgainst"]').last().fill("Counter-evidence");
  await card.locator('[data-action="move-differential"][data-direction="-1"]').last().click();
  assert.equal(await card.locator('[data-differential-field="diagnosis"]').first().innerText(), "Candidate B");
  assert.equal(await card.locator('[data-differential-field="cluesAgainst"]').first().innerText(), "Counter-evidence");
  await card.locator('[data-action="remove-differential"]').last().click();
  assert.equal(await card.locator(".differential-row").count(), 1);
  await card.locator('[data-problem-etiology][value="known"]').check();
  await card.locator('[data-problem-field="knownEtiology"]').fill("Documented cause");
  await card.locator('[data-problem-etiology][value="unknown"]').check();
  assert.equal(await card.locator('[data-differential-field="diagnosis"]').first().innerText(), "Candidate B");
  await card.locator('[data-action="move-plan-problem"][data-direction="-1"]').click();
  assert.deepEqual(await page.locator(".writer-problem-link span").allTextContents(), ["Second problem", "First problem"]);
  await page.locator('[data-draft-section-id="plan"] > summary').click();
  await page.locator(".writer-problem-link").first().click();
  assert.equal(await page.locator('[data-draft-section-id="plan"]').getAttribute("open"), "");
  for (const link of await page.locator("[data-writer-section]").all()) {
    const id = await link.getAttribute("data-writer-section");
    assert.equal(await page.locator(`[data-draft-section-id="${id}"]`).count(), 1, `outline destination ${id} exists`);
    await link.click();
    assert.equal(await page.locator(`[data-draft-section-id="${id}"]`).getAttribute("open"), "");
  }
  assert.equal(await page.getByRole("tab", { name: /Source|Clinical data/ }).count(), 0);
  await page.getByRole("button", { name: "Show clinical data", exact: true }).click();
  assert.equal(await page.locator(".review-data-panel").isVisible(), true);
  await page.locator("#reviewDataSearch").fill("retained filter");
  await page.getByRole("button", { name: "Hide clinical data", exact: true }).click();
  assert.equal(await page.locator(".review-data-panel").isVisible(), false);
  await page.getByRole("button", { name: "Show clinical data", exact: true }).click();
  assert.equal(await page.locator("#reviewDataSearch").inputValue(), "retained filter");
  await page.getByRole("button", { name: "Hide clinical data", exact: true }).click();
  await page.getByRole("tab", { name: "Write", exact: true }).click();
  assert.equal(await page.locator(".writer-outline").isVisible(), true);
  await page.getByRole("tab", { name: "Preview & copy", exact: true }).click();
  assert.match(await page.locator(".note-export-preview pre").innerText(), /Synthetic admission summary/);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="download-final-note"]:visible').click();
  assert.match((await downloadPromise).suggestedFilename(), /\.txt$/);
  await page.getByRole("tab", { name: "Write", exact: true }).click();
  await page.locator('[data-writer-section="plan"]').click();
  await page.locator('[data-action="remove-plan-problem"]').first().click();
  await page.locator('[data-action="remove-plan-problem"]').first().click();
  assert.equal(await page.locator(".writer-problem-link").count(), 0);
  for (const width of [1280, 1041, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no page overflow at ${width}`);
    await page.locator('[data-writer-section="one-liner"]').click();
    await page.locator('[data-draft-section="one_liner"]').fill(`Edited at ${width}`);
    await page.locator('[data-writer-section="plan"]').click();
    await page.locator('[data-action="add-plan-problem"]').click();
    const last = page.locator(".plan-problem-card").last();
    await last.locator('[data-action="add-differential"]').click();
    await last.locator('[data-differential-field="diagnosis"]').fill("Synthetic candidate");
    await last.locator('[data-differential-field="cluesFor"]').fill("Retained fact");
    await last.locator('[data-differential-field="cluesAgainst"]').fill("Retained exception");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "Show clinical data", exact: true }).click();
    assert.equal(await page.locator(".review-data-panel").isVisible(), true);
    if (width === 390) assert.equal(await page.locator(".note-draft-panel").isVisible(), false);
    await page.getByRole("button", { name: "Hide clinical data", exact: true }).click();
    assert.equal(await page.locator(".note-draft-panel").isVisible(), true);
    assert.equal(await last.locator('[data-differential-field="cluesAgainst"]').innerText(), "Retained exception");
    if (width === 390 && !process.env.COMPACT_APP_URL) await page.screenshot({ path: "docs/compact-workspace/after-390-writer.png" });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: compact writer outline, all destinations, live names/order/removal, differential editing/reordering/deletion, etiology, tabs, preview/download, responsive editing"
  );
} finally {
  await browser.close();
  await server.close();
}
