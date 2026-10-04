// Regression test: master-detail scroll ownership in Cheat Sheets and Models.
// Opening a sheet/calculator must start the detail at the top (not inherit
// the list's scroll position), and going back must restore the list's own
// position (not inherit wherever the reader left the detail, and not jump
// to the top). Previously preserveViewScroll copied the scroll position
// across the navigation in both directions.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const baseUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
const page = await context.newPage();

async function scrollerTop() {
  return page.evaluate(() => {
    const view = document.querySelector(".view.active");
    const el = (view && view.scrollHeight > view.clientHeight + 5) ? view : document.scrollingElement;
    return el ? el.scrollTop : -1;
  });
}
async function scrollDeep() {
  await page.evaluate(() => {
    const view = document.querySelector(".view.active");
    const el = (view && view.scrollHeight > view.clientHeight + 5) ? view : document.scrollingElement;
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.6);
  });
  await page.waitForTimeout(120);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  if (await page.locator("#newPatientLabel").count()) {
    await page.fill("#newPatientLabel", "Synthetic Room");
    await page.click('[data-action="admit-patient"]');
  }
  await page.waitForSelector("#dailyContent .source-first-stay");

  // ---- Cheat Sheets ----
  await page.click('[data-view-target="cheatSheets"]');
  await page.waitForSelector("#cheatSheetsContent .cs-card");
  await page.waitForFunction(() => {
    const view = document.querySelector(".view.active");
    return view && view.scrollHeight > view.clientHeight + 100;
  });
  // Let preserveViewScroll's deferred restores (rAF/0ms/60ms) flush before
  // driving scroll programmatically; otherwise they yank it back.
  await page.waitForTimeout(200);
  await scrollDeep();
  const listBefore = await scrollerTop();
  assert.ok(listBefore > 300, `list must be scrolled deep (got ${listBefore})`);
  await page.evaluate(() => document.querySelector("#cheatSheetsContent .cs-card")?.click());
  await page.waitForSelector("#cheatSheetsContent .cs-back");
  await page.waitForTimeout(300);
  const detailTop = await scrollerTop();
  assert.ok(detailTop < 40, `sheet detail must start at the top (list was ${listBefore}, detail at ${detailTop})`);
  // Read a bit into the detail, then go back: the list must return to where
  // it was, not to the top and not to the detail's position.
  await page.evaluate(() => {
    const view = document.querySelector(".view.active");
    const el = (view && view.scrollHeight > view.clientHeight + 5) ? view : document.scrollingElement;
    el.scrollTop = 500;
  });
  await page.waitForTimeout(120);
  await page.click('#cheatSheetsContent [data-action="cheat-sheets-back"]');
  await page.waitForSelector("#cheatSheetsContent .cs-card");
  await page.waitForTimeout(300);
  const listAfter = await scrollerTop();
  assert.ok(
    Math.abs(listAfter - listBefore) < 60,
    `back must restore the list position (was ${listBefore}, now ${listAfter})`
  );
  console.log("cheat-sheets master-detail scroll passed");

  // ---- Models (scores) ----
  await page.click('[data-view-target="scores"]');
  await page.waitForSelector('#scoresContent [data-score-open]');
  await page.waitForFunction(() => {
    const view = document.querySelector(".view.active");
    return view && view.scrollHeight > view.clientHeight + 100;
  });
  // Let preserveViewScroll's deferred restores (rAF/0ms/60ms) flush before
  // driving scroll programmatically; otherwise they yank it back.
  await page.waitForTimeout(200);
  await scrollDeep();
  const scoresListBefore = await scrollerTop();
  assert.ok(scoresListBefore > 200, `scores list must be scrolled deep (got ${scoresListBefore})`);
  await page.evaluate(() => document.querySelector('#scoresContent [data-score-open]')?.click());
  await page.waitForSelector("#scoresContent [data-score-back]");
  await page.waitForTimeout(300);
  const calcTop = await scrollerTop();
  assert.ok(calcTop < 40, `calculator must start at the top (list was ${scoresListBefore}, detail at ${calcTop})`);
  await page.evaluate(() => {
    const view = document.querySelector(".view.active");
    const el = (view && view.scrollHeight > view.clientHeight + 5) ? view : document.scrollingElement;
    el.scrollTop = 400;
  });
  await page.waitForTimeout(120);
  await page.click("#scoresContent [data-score-back]");
  await page.waitForSelector('#scoresContent [data-score-open]');
  await page.waitForTimeout(300);
  const scoresListAfter = await scrollerTop();
  assert.ok(
    Math.abs(scoresListAfter - scoresListBefore) < 60,
    `back must restore the scores list position (was ${scoresListBefore}, now ${scoresListAfter})`
  );
  console.log("scores master-detail scroll passed");

  console.log("master-detail scroll regression tests passed");
} finally {
  await browser.close();
}
