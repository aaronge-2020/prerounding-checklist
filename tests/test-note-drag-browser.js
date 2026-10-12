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
  }
  // Real pointer gesture, not a mocked drop: preserve destination and source ranges.
  await selectRange(hpi,7,22);
  const box=await hpi.boundingBox(), target=await exam.boundingBox();
  await page.mouse.move(box.x+70,box.y+20); await page.mouse.down();
  await page.mouse.move(target.x+70,target.y+20,{steps:15}); await page.mouse.up();
  assert.equal(await hpi.inputValue(),'Cough. ');
  assert.equal(await exam.inputValue(),'Alert.\n\nMisplaced exam.');
  assert.equal(await page.locator('[data-note-original]').textContent(),raw);
  await undo.click();
  assert.equal(await hpi.inputValue(),'Cough. Misplaced exam.');
  assert.equal(await exam.inputValue(),'Alert.');
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
