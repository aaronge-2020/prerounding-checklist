import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const dayLabs = `Results from EPIC:
WBC: 8.8
Hemoglobin: 10.1
Creatinine: 1.6 (H)
Sodium: 137`;

const server = await createAppServer();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));

const creatinineCell = () => page.locator(".lab-cell").filter({ hasText: "Creatinine" }).first();
const baselineBadge = () => creatinineCell().locator(".lab-cell-baseline");
const objectiveBlock = () => page.locator("[data-objective-block]").first();

try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);

  // Save a hospital day with laboratory results through the visible Hospital Stay workflow.
  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-09-19");
  await page.fill("#newDayLabel", "Hospital day 2");
  await page.click('[data-action="add-day"]');
  await page.waitForSelector('[data-structured-note-paste][data-structured-note-scope="daily"]');
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="laboratory_results"]');
  await page.fill("#dailySourceDraft", dayLabs);
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => document.querySelectorAll("#dailySources .source-capture-editor").length === 1);

  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.fill("#reviewDataSearch", "Creatinine");
  await page.waitForFunction(() => document.querySelectorAll(".lab-cell").length >= 1);
  assert.equal(await baselineBadge().count(), 0, "no baseline badge before one is set");
  assert.equal(await creatinineCell().getByRole("button", { name: "Set baseline" }).count(), 1);

  // Open the editor, save a baseline, and see it on the review sheet.
  await creatinineCell().getByRole("button", { name: "Set baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("0.9");
  await creatinineCell().locator('[data-baseline-field="unit"]').fill("mg/dL");
  await creatinineCell().locator('[data-baseline-field="dateLabel"]').fill("Sep 2024");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.match(await baselineBadge().innerText(), /0\.9 mg\/dL · Sep 2024/);
  assert.equal(await creatinineCell().getByRole("button", { name: "Edit baseline" }).count(), 1);

  // Select the lab: the objective block carries the baseline into the note text.
  await creatinineCell().getByRole("checkbox", { name: /Include only Creatinine/ }).check();
  await page.waitForSelector("[data-objective-block]");
  assert.equal(await objectiveBlock().getAttribute("data-objective-state"), "synced");
  assert.match(await objectiveBlock().locator("textarea").inputValue(), /Creatinine: 1\.6[\s\S]*\(baseline 0\.9 mg\/dL · Sep 2024\)/);

  // Editing the baseline reconciles the still-synced block automatically.
  await creatinineCell().getByRole("button", { name: "Edit baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  assert.equal(await creatinineCell().locator('[data-baseline-field="value"]').inputValue(), "0.9", "editor must prefill the saved baseline");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("1.0");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await objectiveBlock().getAttribute("data-objective-state"), "synced");
  assert.match(await objectiveBlock().locator("textarea").inputValue(), /\(baseline 1\.0 mg\/dL · Sep 2024\)/);

  // A student-edited block is marked stale instead of overwritten.
  await objectiveBlock().locator("textarea").fill("Student wording: creatinine improved overnight.");
  assert.equal(await objectiveBlock().getAttribute("data-objective-state"), "edited");
  await creatinineCell().getByRole("button", { name: "Edit baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("1.1");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.waitForSelector('[data-objective-block][data-objective-state="stale"]');
  assert.equal(await objectiveBlock().locator("textarea").inputValue(), "Student wording: creatinine improved overnight.", "student wording must survive the source change");
  assert.match(await objectiveBlock().innerText(), /Source changed/);
  await objectiveBlock().getByRole("button", { name: "Keep my edit" }).click();
  assert.equal(await objectiveBlock().getAttribute("data-objective-state"), "edited");

  // Clear removes the badge and the baseline text.
  await creatinineCell().getByRole("button", { name: "Edit baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().getByRole("button", { name: "Clear" }).click();
  await page.waitForFunction(() => /Baseline cleared/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await baselineBadge().count(), 0);
  assert.equal(await creatinineCell().getByRole("button", { name: "Set baseline" }).count(), 1);

  // Saving without a value is rejected with a status message.
  await creatinineCell().getByRole("button", { name: "Set baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Enter a baseline value/.test(document.querySelector("#statusLine")?.textContent || ""));
  await creatinineCell().getByRole("button", { name: "Cancel" }).click();

  // Baselines persist across a vault lock/reload cycle.
  await creatinineCell().getByRole("button", { name: "Set baseline" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("0.9");
  await creatinineCell().locator('[data-baseline-field="unit"]').fill("mg/dL");
  await creatinineCell().locator('[data-baseline-field="dateLabel"]').fill("Sep 2024");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  await page.fill("#reviewDataSearch", "Creatinine");
  await page.waitForFunction(() => document.querySelectorAll(".lab-cell").length >= 1);
  assert.match(await baselineBadge().innerText(), /0\.9 mg\/dL · Sep 2024/, "the saved baseline must survive reload");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter((message) => !/503 \(Service Unavailable\)/.test(message)), []);
  console.log("lab baselines browser journeys passed");
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
