import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { fileAppUrl, unlockAndCreatePatient } from "./browser/app-harness.js";

// End-to-end: paste a populated primary-team progress note, save it, then
// pull each section into the draft note and verify transfer + persistence.
// Covers: One-Liner, Subjective (interval events), Physical Exam, Objective,
// Assessment, Plan, closing sections, Save/reload persistence (B2), and
// double-pull plan dedup (B1).
const progressTeamNote = readFileSync(new URL("./fixtures/primary-team-notes/progress-team-note.txt", import.meta.url), "utf8");

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));

const editorText = (locator) => locator.evaluate((el) => el.innerText || el.textContent || "");

try {
  await page.goto(appUrl);
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await unlockAndCreatePatient(page, { label: "Pull Transfer Case" });

  // Paste the primary-team note for a hospital day and save it.
  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-09-20");
  await page.fill("#newDayLabel", "Hospital day 6");
  await page.click('[data-action="add-day"]');
  await page.waitForSelector('[data-structured-note-paste][data-structured-note-scope="daily"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', progressTeamNote);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="daily"]');
  await page.waitForTimeout(800);
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="daily"]');
  await page.waitForFunction(() => /Primary-team note saved|Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  console.log("PASS: primary note saved");

  // Open the review / draft progress note for the day.
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace", { timeout: 30000 });
  console.log("PASS: review opened");

  // Pull each section and verify the draft receives the primary-note text.
  const pullChecks = [
    { field: "interval_events", draft: '[data-draft-section="interval_events"]', expect: /No acute overnight events/ },
    { field: "physical_exam", draft: '[data-draft-section="physical_exam"]', expect: /craniectomy flap/ },
    { field: "objective", draft: '[data-draft-objective-manual]', expect: /Hemoglobin|6\.5/ },
    { field: "assessment", draft: '[data-draft-assessment]', expect: /ischemic.*stroke|MCA/i },
    { field: "code_status", draft: '[data-draft-closing="code_status"]', expect: /Full Code/ },
  ];
  for (const { field, draft, expect } of pullChecks) {
    await page.click(`[data-pull-section="${field}"]`);
    await page.waitForTimeout(600);
    const text = await editorText(page.locator(draft).first());
    assert.match(text, expect, `pull ${field} should populate draft (got: ${text.slice(0, 120)})`);
    console.log(`PASS: pull ${field}`);
  }

  // Plan pull: problems should appear as plan problem cards.
  await page.click('[data-pull-section="plan"]');
  await page.waitForTimeout(800);
  let problemCount = await page.locator(".plan-problem-card").count();
  console.log("Plan problems after first pull:", problemCount);
  assert.ok(problemCount >= 3, `expected 3+ plan problems, got ${problemCount}`);

  // B1: pull plan again — no duplicates.
  await page.click('[data-pull-section="plan"]');
  await page.waitForTimeout(800);
  const problemCount2 = await page.locator(".plan-problem-card").count();
  assert.equal(problemCount2, problemCount, `double pull must not duplicate problems (${problemCount} -> ${problemCount2})`);
  const statusText = await page.locator("#statusLine").innerText();
  assert.match(statusText, /already pulled|no new problems/i, "second pull should report no new problems");
  console.log("PASS: plan double-pull dedup (B1)");

  // Save the draft, then reload and verify everything persisted (B2).
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /draft saved/i.test(document.querySelector("#statusLine")?.textContent || ""), { timeout: 15000 });
  console.log("PASS: draft saved");

  await page.reload();
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.waitForTimeout(1500);

  // Reopen the review for the same day: after reload the current patient is
  // restored but no day is selected, so select the day first.
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector('[data-action="select-day"]', { timeout: 15000 });
  await page.locator('[data-action="select-day"]').last().click();
  await page.waitForSelector('[data-action="open-progress-note"]', { timeout: 15000 });
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace", { timeout: 30000 });

  const assessmentText = await editorText(page.locator('[data-draft-assessment]').first());
  assert.match(assessmentText, /ischemic.*stroke|MCA/i, "assessment should survive reload");
  const peText = await editorText(page.locator('[data-draft-section="physical_exam"]').first());
  assert.match(peText, /craniectomy flap/, "physical exam should survive reload");
  const problemCount3 = await page.locator(".plan-problem-card").count();
  assert.equal(problemCount3, problemCount, `plan problems should survive reload (${problemCount} -> ${problemCount3})`);
  console.log("PASS: draft persists across reload (B2)");

  console.log("\n=== PULL TRANSFER E2E PASSED ===");
  const errors = [...pageErrors, ...consoleErrors];
  console.log("JS errors:", errors.length ? errors : "none");
  assert.equal(pageErrors.length, 0, "no page errors allowed");
} finally {
  await browser.close();
}
