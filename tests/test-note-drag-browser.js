import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createAppServer, openRealApp, unlockAndCreatePatient } from './browser/app-harness.js';
const server = await createAppServer();
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await openRealApp(page,server.baseUrl);
  await unlockAndCreatePatient(page);
  const raw='HISTORY OF PRESENT ILLNESS\nCough. Misplaced exam.\n\nPHYSICAL EXAM\nAlert.\n\nASSESSMENT\nCough.\n\nPLAN\nReview results.';
  await page.locator('[data-structured-note-paste]').fill(raw);
  await page.getByRole('button',{name:'Review sections',exact:true}).click();
  const hpi=page.getByRole('textbox',{name:'History of present illness',exact:true});
  const exam=page.getByRole('textbox',{name:'Physical exam',exact:true});
  const undo=page.getByRole('button',{name:'Undo',exact:true});
  async function selectRange(locator,start,end) {
    await locator.focus();
    await locator.evaluate((el,{start,end})=>{el.setSelectionRange(start,end);el.dispatchEvent(new Event('select',{bubbles:true}));},{start,end});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  // Native mouse selection remains independent of transferring text.
  async function mouseSelect(start, end) {
    await hpi.scrollIntoViewIfNeeded();
    const points = await hpi.evaluate((el, {start, end}) => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      ctx.font = `${style.fontSize} ${style.fontFamily}`;
      const x = rect.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const y = rect.y + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2;
      return { x1: x + ctx.measureText(el.value.slice(0, start)).width, x2: x + ctx.measureText(el.value.slice(0, end)).width, y };
    }, {start, end});
    await page.mouse.move(points.x1, points.y); await page.mouse.down();
    await page.mouse.move(points.x2, points.y, {steps: 12}); await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await hpi.evaluate(el => [el.selectionStart, el.selectionEnd]), [start, end]);
    assert.equal(await page.locator('.note-drag-ghost').count(), 0);
    assert.equal(await hpi.inputValue(), 'Cough. Misplaced exam.');
  }
  await mouseSelect(7, 22);
  await mouseSelect(0, 6);
  await mouseSelect(7, 22);
  const handle = page.locator('[data-note-drag-handle]');
  assert.equal(await handle.isEnabled(), true);
  await handle.click();
  assert.deepEqual(await hpi.evaluate(el => [el.selectionStart, el.selectionEnd]), [7, 22]);
  // Start on the actual highlight, not the toolbar handle.
  const highlightedPoint = await hpi.evaluate(el => {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    return {x: rect.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + ctx.measureText(el.value.slice(0, 10)).width,
      y: rect.y + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2};
  });
  const directTarget = await exam.boundingBox();
  await page.mouse.move(highlightedPoint.x, highlightedPoint.y); await page.mouse.down();
  assert.deepEqual(await hpi.evaluate(el => [el.selectionStart, el.selectionEnd]), [7, 22]);
  await page.mouse.move(directTarget.x + 30, directTarget.y + 20, {steps: 12});
  assert.equal(await page.locator('.note-drag-ghost').count(), 1);
  await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nMisplaced exam.');
  assert.equal(await hpi.inputValue(), 'Cough. ');
  await undo.click();
  await mouseSelect(7, 22);
  const dragBox = await handle.boundingBox(), examBox = await exam.boundingBox();
  await page.mouse.move(dragBox.x + 30, dragBox.y + 15); await page.mouse.down();
  await page.mouse.move(examBox.x + 30, examBox.y + 20, {steps: 12});
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.');
  assert.equal(await handle.isDisabled(), true);
  await mouseSelect(7, 22);
  await page.mouse.move(dragBox.x + 30, dragBox.y + 15); await page.mouse.down();
  await page.mouse.move(examBox.x + 30, examBox.y + 20, {steps: 12}); await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nMisplaced exam.');
  assert.equal(await hpi.inputValue(), 'Cough. ');
  await undo.click();
  // F3: a grip floats next to the selection itself, and a drag can start
  // from it; the chip names the dragged words rather than counting characters.
  await mouseSelect(7, 22);
  const grip = page.locator('[data-note-drag-grip]');
  assert.equal(await grip.count(), 1, 'one grip appears for the live selection');
  assert.equal(await grip.isVisible(), true);
  const gripBox = await grip.boundingBox();
  const gripAnchor = await hpi.evaluate(el => {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    return { endX: rect.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + ctx.measureText(el.value.slice(0, 22)).width,
      lineTop: rect.y + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) };
  });
  assert.ok(Math.abs(gripBox.x + gripBox.width / 2 - gripAnchor.endX) <= 16, 'grip is centered on the end of the selection');
  assert.ok(gripBox.y + gripBox.height <= gripAnchor.lineTop + 2 && gripBox.y > gripAnchor.lineTop - 40, 'grip floats just above the selected line, not over the text');
  const gripTarget = await exam.boundingBox();
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2); await page.mouse.down();
  await page.mouse.move(gripTarget.x + 30, gripTarget.y + 20, {steps: 12});
  assert.equal(await page.locator('.note-drag-ghost').textContent(), 'Move "Misplaced exam."', 'chip shows the dragged words');
  await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nMisplaced exam.');
  assert.equal(await hpi.inputValue(), 'Cough. ');
  assert.equal(await grip.count(), 0, 'the grip leaves with the selection');
  await undo.click();
  // Wrapped and internally scrolled textarea highlights use their visible geometry.
  for (const scrolled of [false, true]) {
    const passage = 'Repeated words for wrapped selection. '.repeat(35);
    await hpi.fill(passage);
    await selectRange(hpi, 0, passage.length);
    const point = await hpi.evaluate((el, scrolled) => {
      const style = getComputedStyle(el), line = parseFloat(style.lineHeight);
      el.scrollTop = scrolled ? line * 3 : 0;
      const rect = el.getBoundingClientRect();
      return {x: rect.x + parseFloat(style.paddingLeft) + 25,
        y: rect.y + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + line * 1.5};
    }, scrolled);
    const destination = await exam.boundingBox();
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(destination.x + 30, destination.y + 20, {steps: 12}); await page.mouse.up();
    assert.equal(await hpi.inputValue(), '');
    assert.equal((await exam.inputValue()).trim(), ('Alert.\n\n' + passage).trim());
    await undo.click();
    assert.equal(await hpi.inputValue(), passage);
    await hpi.fill('Cough. Misplaced exam.');
  }
  // Long notes need edge scrolling within the section pane, not the outer page.
  await page.locator('.note-arrange-sections').evaluate(el=>{el.scrollTop=0;});
  await selectRange(hpi,7,22);
  const startBox=await page.locator('[data-note-drag-handle]').boundingBox(), paneBox=await page.locator('.note-arrange-sections').boundingBox();
  await page.mouse.move(startBox.x+70,startBox.y+20); await page.mouse.down();
  await page.mouse.move(paneBox.x+80,paneBox.y+paneBox.height-12,{steps:15});
  await page.waitForFunction(()=>document.querySelector('.note-arrange-sections').scrollTop>100);
  await page.mouse.move(10,10); await page.mouse.up();
  await page.keyboard.press('Escape');
  assert.equal(await hpi.inputValue(),'Cough. Misplaced exam.');
  await page.locator('.note-arrange-sections').evaluate(el=>{el.scrollTop=0;});
  // Real pointer gesture, not a mocked drop: preserve destination and source ranges.
  await selectRange(hpi,7,22);
  const box=await page.locator('[data-note-drag-handle]').boundingBox(), target=await exam.boundingBox();
  await page.mouse.move(box.x+70,box.y+20); await page.mouse.down();
  await page.mouse.move(target.x+70,target.y+20,{steps:15}); await page.mouse.up();
  assert.equal(await hpi.inputValue(),'Cough. ');
  assert.equal(await exam.inputValue(),'Alert.\n\nMisplaced exam.');
  assert.equal(await page.locator('[data-note-original]').textContent(),raw);
  await undo.click();
  assert.equal(await hpi.inputValue(),'Cough. Misplaced exam.');
  assert.equal(await exam.inputValue(),'Alert.');
  await selectRange(hpi,7,22);
  // F2: clicking a Sections list item while a selection is live files the
  // selected text into that section (a move), it does not merely jump.
  await page.locator('[data-note-index-field="physical_exam"]').click();
  assert.equal(await exam.inputValue(), 'Alert.\n\nMisplaced exam.');
  assert.equal(await hpi.inputValue(), 'Cough. ');
  assert.equal(await page.locator('[data-note-drag-handle]').isEnabled(), false, 'filing consumes the selection');
  await undo.click();
  assert.equal(await hpi.inputValue(), 'Cough. Misplaced exam.');
  assert.equal(await exam.inputValue(), 'Alert.');
  // Keyboard/tap alternative uses the same exact-range transaction.
  await selectRange(hpi,7,22);
  await page.getByRole('button',{name:'Physical exam section',exact:true}).press('Enter');
  assert.equal(await exam.inputValue(),'Alert.\n\nMisplaced exam.');
  await undo.click();
  // Read-only original is copied, not removed.
  await page.locator('[data-note-original]').evaluate(el=>{
    const range=document.createRange();range.setStart(el.firstChild,0);range.setEnd(el.firstChild,7);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.getByRole('button',{name:'Assessment section',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Assessment',exact:true}).inputValue(),'Cough.\n\nHISTORY');
  assert.equal(await page.locator('[data-note-original]').textContent(),raw);
  await undo.click();
  // A real mouse highlight in the original can be dragged directly.
  const originalPoints = await page.locator('[data-note-original]').evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 7);
    const rect = range.getBoundingClientRect(); return {x: rect.x, end: rect.right, y: rect.y + rect.height / 2};
  });
  await page.mouse.move(originalPoints.x, originalPoints.y); await page.mouse.down();
  await page.mouse.move(originalPoints.end, originalPoints.y, {steps: 12}); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.getSelection().toString()), 'HISTORY');
  const copyTarget = await exam.boundingBox();
  await page.mouse.move((originalPoints.x + originalPoints.end) / 2, originalPoints.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => window.getSelection().toString()), 'HISTORY');
  await page.mouse.move(copyTarget.x + 30, copyTarget.y + 20, {steps: 12}); await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nHISTORY');
  assert.equal(await page.locator('[data-note-original]').textContent(), raw);
  await undo.click();
  // Scrolling the section pane to a far destination must retain the chosen
  // source range. (The "Go to section" dropdown is gone, F7.)
  const oneLiner = page.getByRole('textbox', {name:'One-liner', exact:true});
  await oneLiner.fill('');
  await selectRange(hpi, 7, 22);
  assert.equal(await page.locator('[data-note-section-jump]').count(), 0, 'the Go to section dropdown is removed');
  await page.locator('[data-note-drop-field="one_liner"]').scrollIntoViewIfNeeded();
  assert.equal(await handle.isEnabled(), true);
  await page.getByRole('button', {name:'One-liner section', exact:true}).click();
  assert.equal(await oneLiner.inputValue(), 'Misplaced exam.');
  assert.equal(await hpi.inputValue(), 'Cough. ');
  await undo.click();
  assert.equal(await oneLiner.inputValue(), '');
  // Editing after a correction retires Undo so it cannot erase a newer edit.
  await selectRange(hpi,7,22);
  await page.getByRole('button',{name:'Physical exam section',exact:true}).click();
  await exam.fill('Clinician revised exam.');
  assert.equal(await undo.isDisabled(),true);
  await selectRange(hpi,0,6); await hpi.press('Escape');
  await page.getByRole('button',{name:'Physical exam section',exact:true}).click();
  assert.equal(await exam.inputValue(),'Clinician revised exam.');
  // Unrelated external text drops must not trigger a browser-native insertion.
  await exam.evaluate(el=>{const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain','EXTERNAL');el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));});
  assert.equal(await exam.inputValue(),'Clinician revised exam.');
  // Touch-sized layout and tap transfer (no overflow).
  await page.setViewportSize({width:390,height:844});
  await selectRange(hpi,0,6);
  await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerType:'touch'})));
  await page.getByRole('button',{name:'Physical exam section',exact:true}).click();
  assert.equal(await exam.inputValue(),'Clinician revised exam.\n\nCough.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Source replacement invalidates the pending selection.
  await selectRange(exam,0,9);
  await page.getByRole('button',{name:'Paste full note',exact:true}).click();
  await page.locator('[data-structured-note-paste]').fill('HISTORY OF PRESENT ILLNESS\nNew source.');
  await page.getByRole('button',{name:'Review sections',exact:true}).click();
  const before=await hpi.inputValue();
  await page.getByRole('button',{name:'History of present illness section',exact:true}).click();
  assert.equal(await hpi.inputValue(),before);
  assert.equal(await page.locator('.has-note-selection').count(),0);
  await selectRange(hpi,0,Math.min(3,before.length));
  await page.locator('.new-day-control > summary').click();
  await page.getByLabel('Label',{exact:true}).fill('Synthetic drag day');
  await page.getByRole('button',{name:'Add day',exact:true}).click();
  await page.getByRole('button',{name:/Synthetic drag day/}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:/Synthetic drag day/}).isVisible(),true);
  assert.equal(await page.locator('[data-note-original]').count(),0);
  assert.equal(await page.locator('.has-note-selection').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Note arrangement: direct drag, grip drag, click-to-file, copy, tap/keyboard, Undo, edits, cancel, external drop, replacement, mobile passed.');
} finally { await browser.close(); await server.close(); }
