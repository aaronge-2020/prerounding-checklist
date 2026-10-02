import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Split out of test-local-first-ui-browser.js: these two journeys need
// deterministic failure/transfer seams that the giant file:// test could not
// provide. The local HTTP origin is unreachable from this sandbox (loopback
// is blocked), so both journeys use file-compatible in-page seams instead:
// a window.fetch wrapper for the 503 refresh failure, and the phone bundle
// hash appended to the file:// app URL for the phone round-trip.
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();

try {
  await openRealApp(page, fileAppUrl());
  await unlockAndCreatePatient(page);

  // Journey 1: a failed built-in prompt refresh must preserve local edits.
  await page.click('[data-view-target="settings"]');
  await page.waitForSelector(".guideline-row");
  const admissionGuideline = page.locator(".guideline-row", { hasText: "Admission" }).filter({ has: page.locator("code", { hasText: "@admission-guidelines" }) });
  const admissionGuidelineId = await admissionGuideline.getAttribute("data-guideline-id");
  await admissionGuideline.locator(".guideline-row-open").click();
  await page.fill(`#guidelineSetText-${admissionGuidelineId}`, "LOCAL EDIT THAT MUST SURVIVE A FAILED REFRESH");
  await page.click(`[data-action="save-guideline-set"][data-guideline-set-id="${admissionGuidelineId}"]`);
  await page.waitForFunction(() => /Guidelines saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  // File-compatible 503 seam: route interception does not fire for file://
  // subresources, so fail the refresh at the fetch layer instead. The
  // refresh path calls the global fetch, which this wrapper replaces.
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input?.url || input || "");
      if (url.includes("Guidelines-progress.md")) {
        return Promise.resolve(new Response("unavailable", { status: 503, statusText: "Service Unavailable" }));
      }
      return originalFetch(input, init);
    };
  });
  await page.click('[data-action="request-refresh-default-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#refreshDefaultGuidelinesConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-refresh-default-guidelines"]');
  await page.waitForFunction(() => /No local prompts were changed/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(
    await page.locator(`#guidelineSetText-${admissionGuidelineId}`).inputValue(),
    "LOCAL EDIT THAT MUST SURVIVE A FAILED REFRESH",
    "a failed refresh must not clobber the local built-in edit"
  );
  await page.click('#refreshDefaultGuidelinesConfirmDialog button[value="cancel"]');

  // Journey 2: phone bundle round-trip (desktop -> phone -> desktop).
  await page.click('[data-view-target="workups"]');
  await page.waitForSelector(".workup-import summary");
  await page.locator(".workup-import summary").click();
  await page.fill("#workupJsonImport", JSON.stringify({
    schema: "prerounding_workup_v1",
    id: "phone-roundtrip",
    title: "Phone round-trip",
    items: [
      { id: "phone_history_one", kind: "history", system: "general", text: "Phone history one", choices: ["No", "Yes"] },
      { id: "phone_exam_one", kind: "exam", system: "general", text: "Phone exam one", choices: ["Normal", "Abnormal"] }
    ]
  }));
  await page.click('[data-action="parse-workup-json"]');
  await page.waitForFunction(() => /Imported JSON replaced/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.locator(".workup-checkbox").first().check();
  await page.locator(".workup-checkbox").nth(1).check();
  await page.click('[data-action="build-checklist"]');
  await page.waitForSelector("#checklistSections .checklist-item");
  const phoneLink = await page.locator("#phoneBundleText").inputValue();
  assert.match(phoneLink, /#phone=/, "the desktop checklist must expose a phone bundle link");

  const phonePage = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await phonePage.goto(phoneLink, { waitUntil: "domcontentloaded" });
  await phonePage.waitForSelector("body.phone-mode", { timeout: 15000 });
  await phonePage.waitForSelector(".phone-mode #checklistSections .checklist-item", { timeout: 15000 });
  assert.equal(await phonePage.locator("#phoneReturnBundle").count(), 0, "no return bundle before answers are entered");
  const unansweredIndex = await phonePage
    .locator("#checklistSections .checklist-answer-select")
    .evaluateAll((nodes) => nodes.findIndex((node) => !node.value));
  assert.equal(unansweredIndex >= 0, true, "the transferred checklist should retain an unanswered item");
  const phoneScrollTop = await phonePage.locator("#checklistSections").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    return node.scrollTop;
  });
  const answerSelects = phonePage.locator("#checklistSections .checklist-answer-select");
  const answerCount = await answerSelects.count();
  for (let index = 0; index < answerCount; index += 1) {
    await answerSelects.nth(index).selectOption({ index: 1 });
  }
  assert.equal(
    await phonePage.locator("#checklistSections").evaluate((node) => node.scrollTop),
    phoneScrollTop,
    "answering phone checklist items must not reset the checklist scroll position"
  );
  await phonePage.click('[data-action="show-phone-return"]');
  await phonePage.waitForSelector("#phoneReturnBundle");
  const returnBundle = await phonePage.locator("#phoneReturnBundle").inputValue();
  assert.ok(returnBundle.length > 0, "the phone must produce a return bundle once every item is answered");
  await phonePage.close();

  await page.click('[data-view-target="checklist"]');
  await page.waitForSelector("#phoneReturnText");
  await page.fill("#phoneReturnText", returnBundle);
  await page.click('[data-action="import-phone-return"]');
  await page.waitForFunction(() => /Returned phone answers imported/.test(document.querySelector("#statusLine")?.textContent || ""));
  const importedAnswerCount = await page.locator("#checklistSections .checklist-answer-select").evaluateAll(
    (nodes) => nodes.filter((node) => node.value).length
  );
  assert.equal(importedAnswerCount >= 2, true, "the imported phone answers must land on the desktop checklist");

  console.log("transfer + refresh browser journeys passed");
} finally {
  await browser.close();
}
