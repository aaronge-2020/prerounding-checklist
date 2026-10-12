import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createAppServer } from './browser/app-harness.js';
const server = await createAppServer();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.baseUrl}tests/browser/scroll-review.html`);
    await page.locator('[data-action="ai-chat-mode"][data-mode="remote"]').click();
    await page.evaluate(() => {
      window.controller.getRemoteState().messages = [{ role: 'assistant', text: "Consider the finding per [History]: “Exact synthetic\npassage”. Compare [Example Guideline]. Again [Example Guideline]. Another finding per [Missing]: ‘Unmatched passage’. [Unlisted Reference].",
        sectionCitations: [{ pieceId: 'context:note-0', label: 'History', target: { scope: 'admission', sectionId: 'note-0' } }, { pieceId: '' }],
        sources: [{ title: 'Example Guideline', url: 'https://example.org/guideline' }] }];
      window.controller.render();
    });
    const markers = page.locator('.aic-citation-number');
    assert.deepEqual(await markers.allTextContents(), ['1','2','2','3','4']);
    assert.ok(!(await page.locator('.aic-m-body').innerText()).includes('Exact synthetic\npassage'));
    assert.equal(await page.locator('.aic-cite-quote').count(), 0);
    assert.ok(!(await page.locator('.aic-m-body').innerText()).includes('Unmatched passage'));
    if (process.env.CITATION_SCREENSHOTS && width === 1440) await page.screenshot({ path: `${process.env.CITATION_SCREENSHOTS}/numbered-citations.png` });
    await markers.first().hover();
    await page.locator('[role="tooltip"]').waitFor();
    assert.equal(await page.locator('[role="tooltip"] blockquote').innerText(), 'Exact synthetic\npassage');
    if (process.env.CITATION_SCREENSHOTS && width === 1440) await page.screenshot({ path: `${process.env.CITATION_SCREENSHOTS}/numbered-citations-hover.png` });
    await markers.first().click();
    await page.locator('dialog.ap-source-dialog').waitFor();
    await page.getByRole('button', { name: 'Open chart section', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.navigated), { scope: 'admission', sectionId: 'note-0' });
    await markers.nth(1).focus();
    assert.match(await page.locator('[role="tooltip"]').innerText(), /No source passage was captured/);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog.ap-source-dialog a').getAttribute('href'), 'https://example.org/guideline');
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(220);
    await markers.nth(3).hover();
    assert.match(await page.locator('[role="tooltip"]').innerText(), /No matching reviewed chart section/);
    await markers.nth(3).click();
    assert.equal(await page.getByRole('button', { name: 'Open chart section', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(220);
    await markers.nth(4).click();
    assert.equal(await page.locator('dialog.ap-source-dialog a').innerText(), 'Search for this source ↗');
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(220);
    await markers.first().hover();
    const bounds = await page.locator('[role="tooltip"]').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Numbered chat citations: numbering, quotes, hover, keyboard, details, chart navigation, unmatched sources and mobile passed.');
} finally { await browser.close(); await server.close(); }
