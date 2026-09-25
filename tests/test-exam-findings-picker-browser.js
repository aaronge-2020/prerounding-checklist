import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl } from "./browser/app-harness.js";

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  await page.goto(appUrl);
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "exam findings test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));

  // Start guided demo to get a patient with review access.
  await page.click('[data-action="start-guided-demo"]');
  await page.waitForTimeout(1500);

  // Navigate directly to review view.
  await page.click('[data-view-target="review"]');
  await page.waitForSelector('[data-exam-findings]', { timeout: 30000 });
  console.log("PASS: findings picker rendered");

  // Count findings.
  const findingCount = await page.locator('[data-finding-row]').count();
  console.log("Finding rows:", findingCount);
  assert.ok(findingCount >= 40, `expected 40+ findings, got ${findingCount}`);

  // Test 1: Open a dropdown and select an option.
  await page.click('[data-finding-row="gen_appearance"] [data-action="exam-finding-open"]');
  await page.waitForSelector('.ef-dropdown', { timeout: 5000 });
  const optionCount = await page.locator('.ef-option').count();
  console.log("Appearance options:", optionCount);
  assert.ok(optionCount >= 10, `expected 10+ appearance options, got ${optionCount}`);

  // Select "disheveled" (not the normal option).
  await page.click('.ef-option:has-text("disheveled")');
  await page.waitForTimeout(500);
  const pillText = await page.locator('[data-finding-row="gen_appearance"] .ef-pill').innerText();
  console.log("Pill after select:", pillText);
  assert.equal(pillText, "disheveled", "pill should show selected option");
  console.log("PASS: dropdown select works");

  // Test 2: Visual fields dropdown has laterality-specific defects.
  // Expand the HEENT system first (only first system is open by default).
  await page.locator('.ef-system summary:has-text("HEENT")').click();
  await page.waitForTimeout(300);
  await page.click('[data-finding-row="heent_visual_fields"] [data-action="exam-finding-open"]');
  await page.waitForSelector('.ef-dropdown', { timeout: 5000 });
  const vfOptions = await page.locator('.ef-option').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  console.log("VF options:", vfOptions.join(" | "));
  assert.ok(vfOptions.some((o) => o.includes("right homonymous hemianopia")), "should have right homonymous hemianopia");
  assert.ok(vfOptions.some((o) => o.includes("bitemporal hemianopia")), "should have bitemporal hemianopia");
  await page.click('.ef-option:has-text("right homonymous hemianopia")');
  await page.waitForTimeout(500);
  console.log("PASS: visual field defects present with laterality");

  // Test 3: Custom input via "Type custom" button.
  // (HEENT is already expanded from Test 2; General is open by default.)
  await page.click('[data-finding-row="gen_orientation"] [data-action="exam-finding-open"]');
  await page.waitForSelector('.ef-dropdown', { timeout: 5000 });
  await page.click('.ef-option-custom');
  await page.waitForSelector('[data-exam-finding-input="gen_orientation"]', { timeout: 5000 });
  await page.fill('[data-exam-finding-input="gen_orientation"]', 'oriented x2, confused about date');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const customPill = await page.locator('[data-finding-row="gen_orientation"] .ef-pill').innerText();
  console.log("Custom pill:", customPill);
  assert.equal(customPill, "oriented x2, confused about date", "custom text should be saved");
  console.log("PASS: custom input works");

  // Test 4: All normal button.
  await page.click('[data-action="exam-findings-all-normal"]');
  await page.waitForTimeout(500);
  const filledCount = await page.locator('.ef-pill.is-filled').count();
  console.log("Filled after all-normal:", filledCount);
  assert.equal(filledCount, findingCount, "all findings should be filled");
  const appearanceNormal = await page.locator('[data-finding-row="gen_appearance"] .ef-pill').innerText();
  assert.equal(appearanceNormal, "well-appearing, no acute distress", "appearance should reset to normal");
  console.log("PASS: all-normal fills everything");

  // Test 5: Insert into note compiles prose.
  await page.click('[data-action="exam-findings-insert"]');
  await page.waitForTimeout(500);
  const examText = await page.locator('[data-draft-section="physical_exam"]').innerText();
  console.log("Exam text preview:", examText.slice(0, 200));
  assert.ok(examText.includes("General:"), "compiled prose should have General section");
  assert.ok(examText.includes("well-appearing"), "compiled prose should include findings");
  console.log("PASS: insert into note compiles prose");

  // Test 6: Persistence — selections survive rerender.
  await page.click('[data-view-target="daily"]');
  await page.waitForTimeout(500);
  await page.click('[data-view-target="review"]');
  await page.waitForSelector('[data-exam-findings]', { timeout: 30000 });
  const persistedCount = await page.locator('.ef-pill.is-filled').count();
  console.log("Filled after navigation:", persistedCount);
  assert.equal(persistedCount, findingCount, "selections should survive rerender");
  console.log("PASS: selections persist across navigation");

  // Test 7: Clear one finding.
  await page.click('[data-finding-row="gen_appearance"] [data-action="exam-finding-clear"]');
  await page.waitForTimeout(500);
  const afterClear = await page.locator('[data-finding-row="gen_appearance"] .ef-pill').innerText();
  assert.equal(afterClear, "select…", "pill should reset to placeholder");
  console.log("PASS: clear single finding works");

  console.log("\n=== ALL EXAM FINDINGS PICKER TESTS PASSED ===");
  console.log("JS errors:", consoleErrors.length ? consoleErrors : "none");
} finally {
  await browser.close();
}
