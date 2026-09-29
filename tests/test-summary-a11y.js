// Regression: no <summary> element may contain interactive descendants.
// Interactive content inside <summary> is an accessibility violation.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server", "--no-sandbox"]
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await openRealApp(page, fileAppUrl());
await unlockAndCreatePatient(page);

// Go to Review tab (draft note) where the ed-section summaries live
await page.locator('button').filter({ hasText: /review/i }).first().click();
await page.waitForTimeout(2000);

// Check all <summary> elements for interactive descendants
const violations = await page.evaluate(() => {
  const interactive = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
  const results = [];
  document.querySelectorAll("summary").forEach((summary, i) => {
    const bad = summary.querySelectorAll(interactive);
    if (bad.length) {
      results.push({
        index: i,
        summaryText: summary.textContent.slice(0, 80),
        interactiveCount: bad.length,
        tags: [...bad].map(el => el.tagName.toLowerCase()).join(",")
      });
    }
  });
  return results;
});

console.log("summary elements checked");
console.log("violations:", JSON.stringify(violations, null, 2));

assert.equal(violations.length, 0, `Found ${violations.length} <summary> with interactive descendants`);
console.log("PASS: no <summary> contains interactive elements");
console.log("JS errors:", errors.length ? errors : "none");
await browser.close();
