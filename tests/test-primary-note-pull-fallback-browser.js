import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, unlockAndCreatePatient } from "./browser/app-harness.js";

// Regression for: "the draft note wouldn't pull the one-liner from the primary
// note." The pull button reads the SAVED primary note for the selected packet,
// which fails in two real workflows with a confusing message:
//
// 1. The H&P is saved on admission but Review is on a hospital-day packet with
//    no saved primary note of its own -> the pull now falls back to the
//    admission H&P (the stay's canonical primary note) and says so.
// 2. The student typed the note but never de-identified & saved it ("Save to
//    draft" or nothing) -> the pull now names the unsaved state and the exact
//    button to press, instead of claiming no note was pasted.
//
// A day WITH its own saved primary note keeps strict packet scoping: its
// sections are authoritative for that day, so a missing section there must NOT
// fall back to admission.
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

const statusLine = () => page.evaluate(() => document.querySelector("#statusLine")?.textContent || "");
const draftOneLiner = () => page.locator('[data-draft-section="one_liner"]').innerText();
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function typeSectionAndSave({ scope, fieldId, text, saveAction }) {
  const kindAction = scope === "admission" ? "select-admission-source-kind" : "select-daily-source-kind";
  await page.click(`[data-action="${kindAction}"][data-source-kind="primary_note"]`);
  await page.click(`[data-action="select-structured-note-mode"][data-note-scope="${scope}"][data-note-mode="sections"]`);
  await page.evaluate(
    ([s, f]) => document.querySelector(`[data-action="select-structured-note-field"][data-note-scope="${s}"][data-note-field="${f}"]`).click(),
    [scope, fieldId]
  );
  await page.waitForSelector(`[data-structured-note-scope="${scope}"][data-structured-note-field="${fieldId}"]`);
  await page.fill(`[data-structured-note-scope="${scope}"][data-structured-note-field="${fieldId}"]`, text);
  await page.click(`[data-action="${saveAction}"][data-note-scope="${scope}"]`);
}

async function selectDayPacket() {
  const dayValue = await page.evaluate(() => {
    const sel = document.querySelector("#reviewPacketSelect");
    const dayOpt = [...sel.options].find((o) => o.value !== "admission");
    return dayOpt ? dayOpt.value : null;
  });
  assert.ok(dayValue, "a hospital-day packet option must exist");
  await page.selectOption("#reviewPacketSelect", dayValue);
  await settle();
}

try {
  await page.goto(appUrl);
  await page.waitForSelector("#vaultPassphrase", { timeout: 60000 });
  await unlockAndCreatePatient(page, { label: "Pull Fallback Case" });

  // Save the admission H&P one-liner (de-identified, into the vault).
  await typeSectionAndSave({
    scope: "admission",
    fieldId: "one_liner",
    text: "Adult admitted with dyspnea for evaluation.",
    saveAction: "save-structured-primary-note"
  });
  await page.waitForFunction(() => /Primary-team note saved/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 60000 });
  console.log("PASS: admission H&P one-liner saved");

  // Add a hospital day (no primary note saved for it).
  await page.click('[data-action="add-day"]');
  await settle();

  // 1. Day packet with no saved note falls back to the admission H&P.
  await page.click('[data-view-target="review"]');
  await page.waitForSelector(".note-draft-panel", { timeout: 30000 });
  await selectDayPacket();
  await page.click('[data-pull-section="one_liner"]');
  await page.waitForTimeout(1200);
  assert.match(await draftOneLiner(), /Adult admitted with dyspnea for evaluation\./, "day packet pull falls back to the admission H&P one-liner");
  assert.match(await statusLine(), /from Admission H&P/, "pull names the fallback source");
  console.log("PASS: day packet falls back to admission H&P");

  // 3. A day WITH its own saved note keeps strict packet scoping.
  // (Review's day-packet selection syncs the daily view to that day, so the
  // admission composer is not rendered - select the day to get its composer.)
  await page.click('[data-view-target="daily"]');
  await page.waitForSelector('[data-action="select-day"]', { timeout: 30000 });
  await page.click('[data-action="select-day"]');
  await page.waitForSelector('[data-structured-note-paste][data-structured-note-scope="daily"]', { timeout: 30000 });
  await typeSectionAndSave({
    scope: "daily",
    fieldId: "patient_report",
    text: "Patient reports feeling better today.",
    saveAction: "save-structured-primary-note"
  });
  await page.waitForFunction(() => /Primary-team note saved/.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 60000 });
  await page.click('[data-view-target="review"]');
  await page.waitForSelector(".note-draft-panel", { timeout: 30000 });
  await selectDayPacket();
  const draftBeforePull = await draftOneLiner();
  await page.click('[data-pull-section="one_liner"]');
  await page.waitForTimeout(1200);
  assert.match(await statusLine(), /no "one liner" text to pull/, "a day with its own note does not fall back to admission");
  assert.equal(await draftOneLiner(), draftBeforePull, "the refused pull leaves the day draft untouched");
  console.log("PASS: day with its own note keeps strict packet scoping");

  // 2. Unsaved primary-note input produces an actionable message.
  await page.click('[data-view-target="vault"]');
  await page.waitForSelector("#newPatientLabel", { state: "visible", timeout: 30000 });
  await page.fill("#newPatientLabel", "Room 13");
  await page.click('[data-action="admit-patient"]');
  await page.waitForSelector("#dailyContent .source-first-stay", { timeout: 30000 });
  await page.selectOption("#deidModeSelect", "structured");
  if (await page.locator("#dailyAdmissionDateInput").count()) await page.fill("#dailyAdmissionDateInput", "2026-09-18");
  await typeSectionAndSave({
    scope: "admission",
    fieldId: "one_liner",
    text: "Second patient one liner typed but not saved.",
    saveAction: "save-structured-note-to-draft"
  });
  await page.waitForFunction(() => /saved to draft/i.test(document.querySelector("#statusLine")?.textContent || ""), null, { timeout: 30000 });
  await page.click('[data-view-target="review"]');
  await page.waitForSelector(".note-draft-panel", { timeout: 30000 });
  await page.click('[data-pull-section="one_liner"]');
  await page.waitForTimeout(1200);
  assert.match(await statusLine(), /isn't saved yet/, "pull names the unsaved state");
  assert.match(await statusLine(), /De-identify & save/, "pull names the exact button to press");
  console.log("PASS: unsaved input gets an actionable message");

  assert.equal(pageErrors.length, 0, `no page errors: ${pageErrors.join(" | ").slice(0, 300)}`);
  console.log("PASS: no page errors");
} finally {
  await browser.close();
}
