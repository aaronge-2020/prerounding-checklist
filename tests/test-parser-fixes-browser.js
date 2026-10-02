import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileAppUrl, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

// Parser-fix verification journey in real Chromium:
// P1 two-column A&P rows -> pulled plan problems
// P2/P3 markdown A&P table -> pulled plan problems
// P6 plain-line labs -> lab rows on the review sheet
// Pending shadowing -> WBC 15.2 -> 8.8 in one row, creatinine pending
// stays in its own section while 1.4 remains in history.
const twoColumnNote = `Progress note

Diagnostic and Objective Findings\tAssessment and Plan
Acute decompensated HFrEF: JVP elevated, crackles\tLasix 40mg IV BID
Hyperkalemia: K 5.8 (H)\tKayexalate 15g PO
AKI: Cr 2.1 (H)\tHold ACE inhibitor`;

const markdownTableNote = `Progress note

Assessment and Plan
| Problem | Assessment | Plan |
|---|---|---|
| Upper GI bleed | Hgb 6.8, tachycardic | Transfuse 2U PRBC |
| Hemorrhagic shock | BP 85/50, lactate 4.2 | IVF resuscitation |`;

const plainLineLabs = `K 5.8 (H)
WBC 14.2
Hgb 9.8 (L)
Na 140
Cr 2.1 (H)`;

const dayTwoLabs = `Labs
@ 09/19/26 0600
WBC: 15.2 K/uL; ref 4.0-11.0
Creatinine: 1.4 mg/dL; ref 0.5-1.0
Sodium: 137 mmol/L; ref 136-145`;

const dayThreeLabs = `Labs
WBC: 8.8
Creatinine: pending
Sodium: 138`;

const appUrl = fileAppUrl();
const browser = await chromium.launch({
  executablePath: "/opt/meta-chromium/chrome",
  args: ["--allow-file-access-from-files", "--disable-features=LocalNetworkAccessChecks", "--no-proxy-server"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function addDailySource(kind, text, expectedCount) {
  console.log("selecting kind:", kind, "buttons:", await page.locator('[data-action="select-daily-source-kind"]').count());
  await page.click(`[data-action="select-daily-source-kind"][data-source-kind="${kind}"]`);
  console.log("clicked; draft count:", await page.locator("#dailySourceDraft").count());
  await page.waitForSelector("#dailySourceDraft", { timeout: 10000 }).catch(async () => console.log("draft never appeared; composer count:", await page.locator(".source-capture-composer").count()));
  await page.fill("#dailySourceDraft", text);
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction((count) => document.querySelectorAll("#dailySources .source-capture-editor").length === count, expectedCount);
  await page.waitForTimeout(800);
}

let dayControlExpanded = true; // the new-day control starts expanded
async function addDay(date, label) {
  if (!dayControlExpanded) {
    await page.locator("details.new-day-control summary").click();
    dayControlExpanded = true;
  }
  await page.fill("#newDayDate", date);
  await page.fill("#newDayLabel", label);
  await page.click('[data-action="add-day"]');
  await page.waitForTimeout(800);
  dayControlExpanded = false; // adding a day collapses the control
}

try {
  await openRealApp(page, appUrl);
  await unlockAndCreatePatient(page, { label: "Parser Fixes Case" });
  await page.click('[data-view-target="daily"]');
  await addDay("2026-09-19", "Hospital day 2");

  // P6: plain-line labs paste.
  await addDailySource("laboratory_results", plainLineLabs, 1);
  // P1: two-column A&P primary note.
  await addDailySource("primary_note", twoColumnNote, 2);
  // P2/P3: markdown A&P table primary note.
  await addDailySource("primary_note", markdownTableNote, 3);

  // Pending shadowing: day 2 actuals...
  await addDailySource("laboratory_results", dayTwoLabs, 4);
  // ...day 3 newer collection.
  await addDay("2026-09-20", "Hospital day 3");
  await addDailySource("laboratory_results", dayThreeLabs, 1);

  // Open review.
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace", { timeout: 30000 });
  await page.waitForTimeout(1500);

  // P6: plain-line labs became rows on the sheet.
  const sheetText = await page.locator(".review-data-panel").innerText();
  for (const analyte of ["WBC", "Sodium", "Creatinine", "Potassium", "Hgb"]) {
    assert.ok(sheetText.includes(analyte), `P6: ${analyte} must appear on the review sheet`);
  }
  console.log("PASS P6: plain-line labs render as rows");

  // Pending shadowing: one WBC row trending 15.2 -> 8.8.
  const wbcRow = page.locator(".lab-row", { hasText: "WBC" }).first();
  assert.match(await wbcRow.innerText(), /15\.2[\s\S]*8\.8/, "WBC must trend chronologically in one row");
  console.log("PASS pending shadowing: WBC 15.2 -> 8.8 in one row");

  // Pending creatinine stays in its own section...
  const pendingText = await page.locator(".compact-pending").innerText();
  assert.match(pendingText, /Creatinine/, "pending creatinine must stay in the pending section");
  console.log("PASS pending shadowing: creatinine pending in its own section");

  // ...while the prior actual 1.4 remains in the creatinine trend history.
  const crRow = page.locator(".lab-row", { hasText: "Creatinine" }).first();
  assert.match(await crRow.innerText(), /1\.4/, "prior creatinine 1.4 must remain visible in trend history");
  console.log("PASS pending shadowing: prior creatinine 1.4 not erased");

  // P1: pull the two-column A&P note's problems into the Plan builder.
  const planPull = page.locator('[data-pull-section="plan"]').first();
  await planPull.click();
  await page.waitForFunction(() => document.querySelectorAll(".plan-problem-card").length >= 3, null, { timeout: 15000 });
  const problemTitles = await page.locator(".plan-problem-card").allInnerTexts();
  const problemText = problemTitles.join("\n");
  for (const title of ["Acute decompensated HFrEF", "Hyperkalemia", "AKI"]) {
    assert.ok(problemText.includes(title), `P1: pulled problem must include "${title}"`);
  }
  console.log("PASS P1: two-column rows pulled as three problems");

  // P2/P3: pull the markdown table note too (adds two more problems).
  const pulls = page.locator('[data-pull-section="plan"]');
  await pulls.nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll(".plan-problem-card").length >= 5, null, { timeout: 15000 });
  const allProblems = (await page.locator(".plan-problem-card").allInnerTexts()).join("\n");
  for (const title of ["Upper GI bleed", "Hemorrhagic shock"]) {
    assert.ok(allProblems.includes(title), `P2/P3: pulled problem must include "${title}"`);
  }
  assert.ok(!/^\s*Problem\s*$/m.test(allProblems), "P2/P3: the markdown header row must not become a problem");
  console.log("PASS P2/P3: markdown table pulled as problems, header not a problem");

  console.log("\n=== PARSER FIX JOURNEY PASSED ===");
  console.log("Page errors:", pageErrors.length ? pageErrors : "none");
  assert.equal(pageErrors.length, 0, "no page errors allowed");
} finally {
  await browser.close();
}
