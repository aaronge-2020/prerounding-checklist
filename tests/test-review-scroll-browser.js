import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

// Regression test: review-view re-renders (clinical-data toggles, lab/vital/med
// checkboxes all funnel through the same render path) must preserve the scroll
// position. In wide viewports #reviewView (.view) is the scroller; below the
// 1040px breakpoint .view becomes overflow:visible and the document scrolls.
// A previous fix only preserved .view.scrollTop, so narrow viewports jumped to
// the top of the page on every checkbox click.

async function checkScrollPreserved(viewportWidth) {
  const browser = await chromium.launch({
    executablePath: "/opt/meta-chromium/chrome",
    args: ["--allow-file-access-from-files", "--no-proxy-server"]
  });
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 800 } });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  try {
    await page.goto(fileAppUrl());
    await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
    await page.fill("#vaultPassphrase", "review scroll regression passphrase");
    await page.click('[data-action="unlock-vault"]');
    await page.waitForFunction(
      () => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""),
      { timeout: 30000 }
    );
    await page.click('[data-action="start-guided-demo"]');
    await page.waitForTimeout(1500);
    // DOM .click() avoids Playwright's auto-scroll-into-view, so the scroll
    // position we set is the position the render path actually sees.
    await page.evaluate(() => document.querySelector('[data-view-target="review"]').click());
    await page.waitForSelector("[data-smart-exam]", { timeout: 30000 });

    const result = await page.evaluate(() => {
      const doc = document.scrollingElement;
      const view = document.querySelector("#reviewView");
      const scroller = view.scrollHeight > view.clientHeight + 5 ? view : doc;
      scroller.scrollTop = 400;
      const before = scroller.scrollTop;
      const toggle = document.querySelector('[data-action="toggle-clinical-data"]');
      if (!toggle) return { before, after: -1, missing: true };
      toggle.click();
      return new Promise((resolve) => setTimeout(() => {
        // Collapsing the panel can shrink the content, so the correct
        // invariant is: preserved as far as the new content allows.
        const maxAfter = scroller.scrollHeight - scroller.clientHeight;
        resolve({ before, after: scroller.scrollTop, expected: Math.min(before, Math.max(0, maxAfter)) });
      }, 700));
    });

    assert.ok(!result.missing, "clinical-data toggle button should exist");
    assert.ok(result.before > 100, `expected scrollable content, got before=${result.before}`);
    assert.ok(
      Math.abs(result.after - result.expected) < 8,
      `${viewportWidth}px: scroll jumped from ${result.before} to ${result.after} (expected ~${result.expected})`
    );
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ").slice(0, 300)}`);
    console.log(`PASS: review scroll preserved at ${viewportWidth}px (before=${result.before}, after=${result.after})`);
  } finally {
    await browser.close();
  }
}

await checkScrollPreserved(900);
await checkScrollPreserved(1400);
console.log("PASS: review scroll preservation (narrow + wide)");
