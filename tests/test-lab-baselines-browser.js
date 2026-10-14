import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const dayLabs = `Results from EPIC:
WBC: 8.8
Hemoglobin: 10.1
Creatinine: 1.6 (H)
Sodium: 137`;

const appUrl = fileAppUrl();
const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
  });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));

const creatinineCell = () => page.locator(".lab-row").filter({ hasText: "Creatinine" }).first();
const baselineBadge = () => creatinineCell().locator(".lab-row-meta");
// The Objective editor renders selections as panel-family groups, not
// per-item blocks: each group holds one contenteditable text region
// ([data-objective-group-text]), and a group whose source changed
// under an edit offers a "Source changed · refresh" button instead of
// a per-block state attribute. An untouched group shows no refresh
// button, which is the old "synced" state; keeping your edited text
// is the default (the old "Keep mine" click), and refresh is opt-in.
const objectiveGroup = () => page.locator("[data-objective-group]", { hasText: "Creatinine" }).first();
const objectiveGroupText = () => objectiveGroup().locator("[data-objective-group-text]");
const refreshButton = () => objectiveGroup().locator('[data-action="refresh-objective-group"]');

try {
  await openRealApp(page, appUrl);
  await unlockAndCreatePatient(page);

  // Save a hospital day with laboratory results through the visible Hospital Stay workflow.
  await page.click('[data-view-target="daily"]');
  if (!await page.locator("#newDayDate").isVisible()) await page.locator("details.new-day-control > summary").click();
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
  // The Clinical data panel starts collapsed ("Show clinical data");
  // expand it before using the search or any lab row inside it.
  if ((await page.locator('[data-action="toggle-clinical-data"]').textContent()).includes("Show")) {
    await page.click('[data-action="toggle-clinical-data"]');
  }
  await page.fill("#reviewDataSearch", "Creatinine");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length >= 1);
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
  assert.equal(await creatinineCell().getByRole("button", { name: "Edit base" }).count(), 1);

  // Select the lab: the objective group carries the baseline into the note text.
  await creatinineCell().getByRole("checkbox", { name: /Include only Creatinine/ }).check();
  await page.waitForFunction(() => [...document.querySelectorAll("[data-objective-group]")].some((group) => /Creatinine/.test(group.textContent)));
  assert.equal(await refreshButton().count(), 0, "a freshly selected group matches its source (no Source changed button)");
  assert.match(await objectiveGroupText().innerText(), /Creatinine 1\.6[\s\S]*\(baseline 0\.9 mg\/dL · Sep 2024\)/);

  // Editing the baseline reconciles the untouched group automatically.
  await creatinineCell().getByRole("button", { name: "Edit base" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  assert.equal(await creatinineCell().locator('[data-baseline-field="value"]').inputValue(), "0.9", "editor must prefill the saved baseline");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("1.0");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await refreshButton().count(), 0, "an untouched group still matches its source after the baseline edit");
  assert.match(await objectiveGroupText().innerText(), /\(baseline 1\.0 mg\/dL · Sep 2024\)/);

  // A student-edited group is flagged, not overwritten, when the source
  // changes underneath it: the "Source changed · refresh" button
  // appears while the student's text stays in place. Typing does not
  // re-render (to preserve the caret), so the flow below goes through
  // the baseline save's render, which is what raises the flag.
  await objectiveGroupText().fill("Student wording: creatinine improved overnight.");
  await creatinineCell().getByRole("button", { name: "Edit base" }).click();
  await page.waitForSelector("[data-baseline-editor]");
  await creatinineCell().locator('[data-baseline-field="value"]').fill("1.1");
  await creatinineCell().getByRole("button", { name: "Save baseline" }).click();
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.waitForSelector('[data-action="refresh-objective-group"]');
  assert.equal(await objectiveGroupText().innerText(), "Student wording: creatinine improved overnight.", "student wording must survive the source change");
  assert.match(await objectiveGroup().innerText(), /Source changed/);
  // Keeping the student's text needs no click in the group editor: the
  // refresh button stays offered but the text is only replaced if the
  // student chooses it. The wording still in place after the save's
  // render is the kept state the old "Keep mine" click produced.

  // Clear removes the badge and the baseline text.
  await creatinineCell().getByRole("button", { name: "Edit base" }).click();
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
  // The reload reopens the review with the Clinical data panel
  // collapsed again; expand it before searching.
  if ((await page.locator('[data-action="toggle-clinical-data"]').textContent()).includes("Show")) {
    await page.click('[data-action="toggle-clinical-data"]');
  }
  await page.fill("#reviewDataSearch", "Creatinine");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length >= 1);
  assert.match(await baselineBadge().innerText(), /0\.9 mg\/dL · Sep 2024/, "the saved baseline must survive reload");

  assert.deepEqual(pageErrors, []);
  // Console noise excluded here is a property of this file:// harness,
  // not the app: the browser refuses fetch() of file: URLs outright, so
  // the built-in guideline prompt and the local model configs log load
  // failures (and the guideline refresh logs its wrapped failure) even
  // though the app degrades gracefully and every journey above passes.
  // On the served origin these fetches succeed. The 503 exclusion is
  // the same category: an unavailable optional model endpoint.
  assert.deepEqual(consoleErrors.filter((message) =>
    !/503 \(Service Unavailable\)/.test(message)
    && !/URL scheme "file" is not supported/.test(message)
    && !/refreshing guidelines or the admission date failed/.test(message)), []);
  console.log("lab baselines browser journeys passed");
} finally {
  await context.close();
  await browser.close();
  
}
