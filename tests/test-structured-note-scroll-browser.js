// Regression test: clicking buttons in the enter-by-section primary-note
// editor must not yank the section-nav list (or any inner scroller) to the
// top. Root cause was renderStructuredNoteEditor() snapshotting only the
// outer .view scrollTop while the real scroll owners —
// .structured-note-section-list and .stay-content — were destroyed or
// disturbed by the outerHTML swap.
//
// NOTE on method: Playwright's locator.click()/hover() perform their own
// multi-scroller "reveal" (scrollIntoViewIfNeeded) before dispatching, which
// cascades through the nested scrollers here and would be mistaken for an app
// bug. A human clicks a button they can already see, so this test reveals
// the target manually (like a user scrolling), records positions, then
// dispatches a real trusted mouse click at the button's coordinates via
// page.mouse — exercising the app's mousedown/click handlers with zero
// automation scrolling.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer } from "./browser/app-harness.js";

const server = await createAppServer();
const baseUrl = server.baseUrl;
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Scroll targets for the daily Hospital Stay view.
const scrollState = () => page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  return {
    view: q("#dailyView")?.scrollTop || 0,
    stayContent: q(".stay-content")?.scrollTop || 0,
    sections: q(".note-arrange-sections")?.scrollTop || 0,
  };
});

// Reveal like a user would, then click with a real trusted mouse event and
// no automation scrolling. Returns scroll positions before/after.
async function userClick(selector) {
  const point = await page.locator(selector).evaluate((el) => {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const before = await scrollState();
  await page.mouse.click(point.x, point.y);
  await settle();
  const after = await scrollState();
  return { before, after };
}

function assertStable(before, after, label) {
  for (const key of ["view", "stayContent", "sections"]) {
    assert.ok(
      Math.abs(after[key] - before[key]) <= 2,
      `${label}: ${key} moved on click (before=${before[key]}, after=${after[key]})`
    );
  }
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.fill("#newPatientLabel", "Room 12");
  await page.click('[data-action="admit-patient"]');
  await page.waitForSelector("#contextSections");
  await page.click('[data-view-target="daily"]');
  await page.fill("#dailyAdmissionDateInput", "2026-07-17");
  await page.click('[data-action="select-admission-source-kind"][data-source-kind="primary_note"]');
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="admission"][data-note-mode="sections"]');
  await page.waitForSelector(".note-arrange-workspace");
  await page.waitForTimeout(100);
  await page.locator(".note-additional-sections > summary").click();
  let r = await userClick('[data-note-field="other"]');
  assertStable(r.before, r.after, "additional section heading");
  for (const id of ["physical_exam", "assessment", "plan", "history_of_present_illness"]) {
    r = await userClick(`[data-note-field="${id}"]`);
    assertStable(r.before, r.after, `${id} heading`);
  }

  // 4. Scroll the outer view down, then click a section button: the view,
  // the stay-content, and the list must all stay put.
  await page.locator("#dailyContent").evaluate((content) => { content.style.minHeight = "1600px"; });
  await page.evaluate(() => {
    document.querySelector("#dailyView").scrollTop = 520;
    document.querySelector(".stay-content").scrollTop = 120;
  });
  await settle();
  r = await userClick('[data-action="select-structured-note-field"][data-note-scope="admission"][data-note-field="history_of_present_illness"]');
  assert.ok(r.before.view > 0, `view must be scrolled down before click (was ${r.before.view})`);
  assertStable(r.before, r.after, "section click with view + stay-content scrolled");
  await page.locator("#dailyContent").evaluate((content) => { content.style.minHeight = ""; });

  assert.deepEqual(consoleErrors, [], `no JS errors expected, got: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
  console.log("PASS: enter-by-section scroll regression");
} finally {
  await browser.close();
  await server.close();
}
