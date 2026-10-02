import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--no-proxy-server"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  await page.goto(fileAppUrl());
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "collapsible sections test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForTimeout(1500);
  await page.click('[data-view-target="review"]');
  await page.waitForSelector('details.ed-section', { timeout: 30000 });

  // I1: All draft sections are collapsible <details>.
  const sectionCount = await page.locator('details.ed-section').count();
  console.log("Collapsible sections:", sectionCount);
  assert.ok(sectionCount >= 8, `expected 8+ collapsible sections, got ${sectionCount}`);

  // All start open.
  const closedCount = await page.locator('details.ed-section:not([open])').count();
  assert.equal(closedCount, 0, "all sections should start open");
  console.log("PASS: all sections start open");

  // Collapse the Assessment section.
  const assessmentSummary = page.locator('details.ed-section[data-draft-section-id="assessment"] > summary');
  await assessmentSummary.click();
  await page.waitForTimeout(300);
  const isClosed = await page.locator('details.ed-section[data-draft-section-id="assessment"]').evaluate((el) => !el.open);
  assert.ok(isClosed, "assessment should be collapsed after click");
  console.log("PASS: section collapses on click");

  // Trigger a re-render (click a toast-producing button) and verify collapse persists.
  await page.click('[data-action="exam-findings-all-normal"]');
  await page.waitForTimeout(500);
  const stillClosed = await page.locator('details.ed-section[data-draft-section-id="assessment"]').evaluate((el) => !el.open);
  assert.ok(stillClosed, "collapse state should survive re-render");
  console.log("PASS: collapse state survives re-render");

  // Re-expand.
  await page.locator('details.ed-section[data-draft-section-id="assessment"] > summary').click();
  await page.waitForTimeout(300);

  console.log("\n=== COLLAPSIBLE SECTIONS TESTS PASSED ===");
  console.log("JS errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
  await browser.close();
}
