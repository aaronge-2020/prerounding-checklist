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
  // Navigating the compact section index keeps the selected range available.
  await page.locator('[data-note-index-field="physical_exam"]').click();
  assert.equal(await page.locator('[data-note-drag-handle]').isEnabled(), true);
  await page.getByRole('button',{name:'Physical exam section',exact:true}).click();
  assert.equal(await exam.inputValue(), 'Alert.\n\nMisplaced exam.');
  await undo.click();
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
  // A real mouse highlight in the original survives grabbing the copy handle.
  const originalPoints = await page.locator('[data-note-original]').evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 7);
    const rect = range.getBoundingClientRect(); return {x: rect.x, end: rect.right, y: rect.y + rect.height / 2};
  });
  await page.mouse.move(originalPoints.x, originalPoints.y); await page.mouse.down();
  await page.mouse.move(originalPoints.end, originalPoints.y, {steps: 12}); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.getSelection().toString()), 'HISTORY');
  const copyHandle = await handle.boundingBox(), copyTarget = await exam.boundingBox();
  await page.mouse.move(copyHandle.x + 30, copyHandle.y + 15); await page.mouse.down();
  await page.mouse.move(copyTarget.x + 30, copyTarget.y + 20, {steps: 12}); await page.mouse.up();
  assert.equal(await exam.inputValue(), 'Alert.\n\nHISTORY');
  assert.equal(await page.locator('[data-note-original]').textContent(), raw);
  await undo.click();
  // Selecting a destination from the picker must retain the chosen source range.
  const oneLiner = page.getByRole('textbox', {name:'One-liner', exact:true});
  await oneLiner.fill('');
  await selectRange(hpi, 7, 22);
  await page.getByLabel('Go to section', {exact:true}).selectOption('one_liner');
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
  console.log('Note arrangement: direct drag, copy, tap/keyboard, Undo, edits, cancel, external drop, replacement, mobile passed.');
} finally { await browser.close(); await server.close(); }
