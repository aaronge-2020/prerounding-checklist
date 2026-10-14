import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Batch D (Write note): F5 scrollspy, F8 problem drag reorder, F13 compact
// empty optional sections, F14 consistent include toggles, F15 autosave
// indicator settling. All state reads wait on the real condition, never on
// fixed sleeps, except the F15 no-revert hold which is the behavior itself.
const server = await createAppServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const markedSection = () => page.evaluate(() =>
  document.querySelector(".writer-outline [data-action='writer-jump'][aria-current]")?.dataset.writerSection || null);
const problemOrder = () => page.evaluate(() =>
  [...document.querySelectorAll(".writer-problem-link span")].map((s) => s.textContent));
try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  await page.locator('[data-note-mode="sections"]').click();
  await page.locator('[data-structured-note-field="one_liner"]').fill("Synthetic admission summary.");
  await page.locator('[data-action="save-structured-note-to-draft"]').click();
  await page.locator("#reviewView.active").waitFor();
  await page.waitForSelector(".note-draft-panel");

  // F13: every empty optional section is one compact row, not a full
  // placeholder section.
  const compact = await page.evaluate(() =>
    [...document.querySelectorAll("#noteEditor .ed-section-empty-add")].map((el) => ({
      id: el.dataset.draftSectionId,
      height: Math.round(el.getBoundingClientRect().height)
    })));
  assert.deepEqual(compact.map((row) => row.id), [
    "diet-and-exercise", "fen", "ins-outs", "vte-prophylaxis", "code-status", "disposition", "medication-regimens"
  ]);
  for (const row of compact) assert.ok(row.height < 55, `compact row ${row.id} is ${row.height}px tall`);

  // F14: every include toggle is the same labeled treatment, in compact and
  // expanded form alike.
  const togglePatterns = await page.evaluate(() =>
    [...document.querySelectorAll("[data-section-visibility]")].map((input) => {
      const label = input.closest("label");
      return `${label.className}|${label.querySelector("span")?.textContent}`;
    }));
  assert.equal(togglePatterns.length, 7);
  assert.ok(togglePatterns.every((pattern) => pattern === "ed-toggle|In note"), JSON.stringify(togglePatterns));
  await page.locator('[data-section-visibility="code_status"]').uncheck();
  assert.equal(await page.evaluate(() =>
    document.querySelector('[data-section-visibility="code_status"]')?.closest("label")?.querySelector("span")?.textContent), "Excluded");
  await page.locator('[data-section-visibility="code_status"]').check();

  // F13 invariance within one draft state: expanding every compact section
  // changes no exported text.
  await page.getByRole("tab", { name: "Preview & copy", exact: true }).click();
  const textBeforeExpand = await page.locator(".note-export-preview pre").innerText();
  await page.getByRole("tab", { name: "Write", exact: true }).click();
  for (const id of ["diet-and-exercise", "fen", "ins-outs", "vte-prophylaxis", "code-status", "disposition", "medication-regimens"]) {
    await page.locator(`[data-action="expand-empty-section"][data-empty-section="${id}"]`).click();
    const section = page.locator(`[data-draft-section-id="${id}"]`);
    assert.equal(await section.evaluate((el) => el.tagName), "DETAILS", `${id} expands to the full section`);
    assert.equal(await section.getAttribute("open"), "", `${id} expands open`);
  }
  assert.equal(await page.locator("#noteEditor .ed-section-empty-add").count(), 0);
  await page.getByRole("tab", { name: "Preview & copy", exact: true }).click();
  assert.equal(await page.locator(".note-export-preview pre").innerText(), textBeforeExpand);
  await page.getByRole("tab", { name: "Write", exact: true }).click();

  // F15: after an edit the indicator settles on a checked, timed saved
  // state and stays there (no revert to "Auto-save on").
  await page.locator('[data-draft-section="one_liner"]').click();
  await page.keyboard.type(" Edited.");
  await page.waitForFunction(() => document.querySelector("[data-autosave-indicator]")?.dataset.state === "saved", null, { timeout: 15000 });
  const settledText = await page.evaluate(() => document.querySelector("[data-autosave-indicator]").textContent);
  assert.match(settledText, /^✓ Saved · /);
  await page.waitForTimeout(4000);
  assert.equal(await page.evaluate(() => document.querySelector("[data-autosave-indicator]")?.dataset.state), "saved");
  assert.equal(await page.evaluate(() => document.querySelector("[data-autosave-indicator]")?.textContent), settledText);

  // F8 setup: three problems.
  for (const name of ["First problem", "Second problem", "Third problem"]) {
    await page.locator('[data-action="add-plan-problem"]').click();
    await page.locator('.plan-problem-card [data-problem-field="problem"]').last().fill(name);
  }
  assert.deepEqual(await problemOrder(), ["First problem", "Second problem", "Third problem"]);

  // F5: scrollspy marks the section at the top of the editor and moves.
  await page.evaluate(() => {
    const editor = document.querySelector("#noteEditor");
    const plan = editor.querySelector('[data-draft-section-id="plan"]');
    editor.scrollTop += plan.getBoundingClientRect().top - editor.getBoundingClientRect().top - 8;
  });
  await page.waitForFunction(() =>
    document.querySelector(".writer-outline [data-writer-section='plan']")?.hasAttribute("aria-current"), null, { timeout: 5000 });
  assert.equal(await markedSection(), "plan");
  await page.evaluate(() => { document.querySelector("#noteEditor").scrollTop = 0; });
  await page.waitForFunction(() =>
    document.querySelector(".writer-outline [data-writer-section='one-liner']")?.hasAttribute("aria-current"), null, { timeout: 5000 });
  assert.equal(await markedSection(), "one-liner");

  // F8: drag the third problem's grip to the top; order changes in the
  // cards and the outline, and persists through save + reload. Jump to Plan
  // first so the cards are inside the viewport for real mouse coordinates.
  await page.locator('[data-writer-section="plan"]').click();
  await page.waitForFunction(() => {
    const card = document.querySelector(".plan-problem-card");
    const editor = document.querySelector("#noteEditor");
    if (!card || !editor) return false;
    const cardRect = card.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    return cardRect.top >= editorRect.top && cardRect.top < editorRect.bottom;
  }, null, { timeout: 5000 });
  const cards = page.locator(".plan-problem-card");
  const gripBox = await cards.nth(2).locator("[data-problem-drag]").boundingBox();
  const firstBox = await cards.nth(0).boundingBox();
  assert.ok(gripBox && gripBox.width === 26 && gripBox.height === 26, "grip measures 26x26");
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, firstBox.y + 6, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".writer-problem-link span")].map((s) => s.textContent).join("|") === "Third problem|First problem|Second problem", null, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() =>
    [...document.querySelectorAll(".plan-problem-card [data-problem-field='problem']")].map((el) => el.innerText.trim())),
    ["Third problem", "First problem", "Second problem"]);
  await page.waitForFunction(() => document.querySelector("[data-autosave-indicator]")?.dataset.state === "saved", null, { timeout: 15000 });
  await page.reload();
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  const selectBtn = page.locator('[data-action="select-patient"]').first();
  if (await selectBtn.count()) await selectBtn.click();
  const openNote = page.locator('[data-action="open-admission-note"]').first();
  if (await openNote.count()) await openNote.click();
  await page.waitForSelector(".note-draft-panel", { timeout: 15000 });
  assert.deepEqual(await problemOrder(), ["Third problem", "First problem", "Second problem"]);

  assert.deepEqual(errors, []);
  console.log("PASS: Batch D writer (F5 scrollspy, F8 grip drag + persistence, F13 compact rows + output invariance, F14 uniform toggles, F15 settled saved indicator)");
} finally {
  await browser.close();
  await server.close();
}
