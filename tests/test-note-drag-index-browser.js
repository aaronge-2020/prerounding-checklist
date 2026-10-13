import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createAppServer, openRealApp, unlockAndCreatePatient } from './browser/app-harness.js';
// Dropping a drag on the Sections index must behave exactly like dropping it
// on that section's card: field-to-field drags move the exact range (source
// loses it, destination gains it appended after a blank line), original-to-
// field drags copy it, and no scrolling or jumping is involved.
const server = await createAppServer();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);
  const raw = 'HISTORY OF PRESENT ILLNESS\nCough. Misplaced exam.\n\nPHYSICAL EXAM\nAlert.\n\nASSESSMENT\nCough.\n\nPLAN\nReview results.';
  await page.locator('[data-structured-note-paste]').fill(raw);
  await page.getByRole('button', { name: 'Review sections', exact: true }).click();
  const hpi = page.getByRole('textbox', { name: 'History of present illness', exact: true });
  const exam = page.getByRole('textbox', { name: 'Physical exam', exact: true });
  const plan = page.getByRole('textbox', { name: 'Plan', exact: true });
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const handle = page.locator('[data-note-drag-handle]');
  const pane = page.locator('.note-arrange-sections');
  const indexItem = field => page.locator(`[data-note-index-field="${field}"]`);
  async function selectRange(locator, start, end) {
    await locator.focus();
    await locator.evaluate((el, { start, end }) => { el.setSelectionRange(start, end); el.dispatchEvent(new Event('select', { bubbles: true })); }, { start, end });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function dragFromHandleTo(locator) {
    const from = await handle.boundingBox(), to = await locator.boundingBox();
    const targetX = to.x + to.width / 2, targetY = to.y + to.height / 2;
    await page.mouse.move(from.x + 30, from.y + 15); await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 15 });
    // The controller positions the drag ghost at pointer + 12px inside the
    // same pointermove handling that updates the drop-target highlight, so
    // the ghost reaching the final point proves that move has been handled.
    // A fixed sleep cannot prove that on a loaded machine: the input queue
    // may not have flushed yet, and a one-shot class read then races it.
    await page.waitForFunction(({ x, y }) => {
      const ghost = document.querySelector('.note-drag-ghost');
      return !!ghost && Math.abs(parseFloat(ghost.style.left) - (x + 12)) < 1 && Math.abs(parseFloat(ghost.style.top) - (y + 12)) < 1;
    }, { x: targetX, y: targetY });
  }
  // The Plan card starts far below the fold of the sections pane.
  assert.equal(await pane.evaluate(el => el.scrollTop), 0);
  assert.ok(await page.locator('[data-note-drop-field="plan"]').evaluate((el, p) =>
    el.getBoundingClientRect().top - p.getBoundingClientRect().top > p.clientHeight, await pane.elementHandle()));
  // A: drop on the Plan index item moves the text without any scrolling.
  await selectRange(hpi, 7, 22);
  await dragFromHandleTo(indexItem('plan'));
  await page.waitForFunction(() => document.querySelector('[data-note-index-field="plan"]')?.classList.contains('is-note-drop-target'));
  assert.ok(await indexItem('plan').evaluate(el => el.classList.contains('is-note-drop-target')), 'hovered index item is the drop target');
  assert.ok(await indexItem('physical_exam').evaluate(el => el.classList.contains('is-note-drop-available')), 'other index items are marked available');
  assert.ok(!await indexItem('history_of_present_illness').evaluate(el => el.classList.contains('is-note-drop-available')), 'source index item is not marked available');
  assert.equal(await pane.evaluate(el => el.scrollTop), 0, 'dragging to the index does not scroll the sections pane');
  await page.mouse.up();
  assert.equal(await hpi.inputValue(), 'Cough. ');
  assert.equal(await plan.inputValue(), 'Review results.\n\nMisplaced exam.');
  assert.equal(await pane.evaluate(el => el.scrollTop), 0, 'dropping on the index does not jump to the section');
  await undo.click();
  assert.equal(await hpi.inputValue(), 'Cough. Misplaced exam.');
  assert.equal(await plan.inputValue(), 'Review results.');
  // B: dropping on the source section's own index item changes nothing.
  await selectRange(hpi, 7, 22);
  await dragFromHandleTo(indexItem('history_of_present_illness'));
  assert.ok(!await indexItem('history_of_present_illness').evaluate(el => el.classList.contains('is-note-drop-target')), 'source index item never highlights as a target');
  await page.mouse.up();
  assert.equal(await hpi.inputValue(), 'Cough. Misplaced exam.');
  assert.equal(await plan.inputValue(), 'Review results.');
  assert.equal(await handle.isDisabled(), true);
  // C: Escape while hovering the index cancels cleanly.
  await selectRange(hpi, 7, 22);
  await dragFromHandleTo(indexItem('assessment'));
  await page.waitForFunction(() => document.querySelector('[data-note-index-field="assessment"]')?.classList.contains('is-note-drop-target'));
  assert.ok(await indexItem('assessment').evaluate(el => el.classList.contains('is-note-drop-target')));
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await hpi.inputValue(), 'Cough. Misplaced exam.');
  assert.equal(await page.getByRole('textbox', { name: 'Assessment', exact: true }).inputValue(), 'Cough.');
  assert.equal(await page.locator('.note-section-index .is-note-drop-target, .note-section-index .is-note-drop-available').count(), 0, 'cancel clears every index drop marking');
  assert.equal(await handle.isDisabled(), true);
  // D: clicking an index item while not dragging still jumps to the section.
  await indexItem('plan').click();
  await page.waitForFunction(() => document.querySelector('.note-arrange-sections').scrollTop > 100);
  assert.ok(await page.locator('[data-note-drop-field="plan"]').evaluate((el, p) => {
    const card = el.getBoundingClientRect(), box = p.getBoundingClientRect();
    return card.top >= box.top && card.top < box.bottom;
  }, await pane.elementHandle()), 'jump brings the Plan card into the pane view');
  await pane.evaluate(el => { el.scrollTop = 0; });
  // E: a highlight in the read-only original copies onto an index item.
  await page.locator('[data-note-original]').evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 7);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const originPoint = await page.locator('[data-note-original]').evaluate(() => {
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2, y: rect.top + rect.height / 2 };
  });
  const examIndexBox = await indexItem('physical_exam').boundingBox();
  await page.mouse.move(originPoint.x, originPoint.y); await page.mouse.down();
  await page.mouse.move(examIndexBox.x + examIndexBox.width / 2, examIndexBox.y + examIndexBox.height / 2, { steps: 15 });
  await page.waitForFunction(() => document.querySelector('[data-note-index-field="physical_exam"]')?.classList.contains('is-note-drop-target'));
  assert.ok(await indexItem('physical_exam').evaluate(el => el.classList.contains('is-note-drop-target')));
  await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nHISTORY');
  assert.equal(await page.locator('[data-note-original]').textContent(), raw);
  await undo.click();
  assert.equal(await exam.inputValue(), 'Alert.');
  // F: the daily scope renders the same index and honors index drops too.
  await page.locator('.new-day-control > summary').click();
  await page.getByLabel('Label', { exact: true }).fill('Synthetic index day');
  await page.getByRole('button', { name: 'Add day', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic index day/ }).click();
  await page.locator('[data-structured-note-paste][data-structured-note-scope="daily"]').fill(raw);
  await page.locator('[data-action="review-structured-note-sections"][data-note-scope="daily"]').click();
  const dailyRoot = page.locator('[data-structured-primary-note-scope="daily"]');
  const dailySource = dailyRoot.locator('textarea[data-structured-note-field="patient_report"]');
  const dailyPlan = dailyRoot.locator('textarea[data-structured-note-field="plan"]');
  const dailyHandle = dailyRoot.locator('[data-note-drag-handle]');
  const dailyPlanIndex = dailyRoot.locator('[data-note-index-field="plan"]');
  const dailyText = await dailySource.inputValue();
  const dailyStart = dailyText.indexOf('Misplaced exam.');
  assert.ok(dailyStart > 0 && await dailyPlan.inputValue() === 'Review results.');
  await dailySource.focus();
  await dailySource.evaluate((el, { start, end }) => { el.setSelectionRange(start, end); el.dispatchEvent(new Event('select', { bubbles: true })); },
    { start: dailyStart, end: dailyStart + 'Misplaced exam.'.length });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await dailyHandle.isEnabled(), true);
  const dailyFrom = await dailyHandle.boundingBox(), dailyTo = await dailyPlanIndex.boundingBox();
  await page.mouse.move(dailyFrom.x + 30, dailyFrom.y + 15); await page.mouse.down();
  await page.mouse.move(dailyTo.x + dailyTo.width / 2, dailyTo.y + dailyTo.height / 2, { steps: 15 });
  await page.waitForFunction(() => document.querySelector('[data-structured-primary-note-scope="daily"] [data-note-index-field="plan"]')?.classList.contains('is-note-drop-target'));
  assert.ok(await dailyPlanIndex.evaluate(el => el.classList.contains('is-note-drop-target')), 'daily index item is a drop target');
  await page.mouse.up();
  assert.equal(await dailyPlan.inputValue(), 'Review results.\n\nMisplaced exam.');
  assert.ok(!(await dailySource.inputValue()).includes('Misplaced exam.'));
  assert.deepEqual(errors, []);
  console.log('Note arrangement index drops: move without scrolling, source no-op, Escape cancel, click jump, original copy, daily scope passed.');
} finally { await browser.close(); await server.close(); }
