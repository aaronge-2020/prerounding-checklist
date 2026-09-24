import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

const compactPrimaryNote = readFileSync(new URL("./fixtures/primary-team-notes/compact-soap-note.txt", import.meta.url), "utf8");
const progressTeamNote = readFileSync(new URL("./fixtures/primary-team-notes/progress-team-note.txt", import.meta.url), "utf8");
const criticalCareNote = readFileSync(new URL("./fixtures/primary-team-notes/critical-care-note.txt", import.meta.url), "utf8");

// A pasted note whose assessment and plan share one heading: the parser must
// split reasoning into Assessment and problems/actions into the Plan builder.
const combinedAssessmentPlanNote = `Interval events: No acute overnight events.
Assessment and Plan
#1. Sepsis secondary to pneumonia
Patient improving on antibiotics. Likely bacterial CAP.
- Continue ceftriaxone
- Repeat chest x-ray tomorrow
#2. AKI
Creatinine downtrending, likely pre-renal.
- IVF as tolerated`;

const server = await createAppServer();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));

async function addDailySource(kind, text, expectedCount) {
  await page.click(`[data-action="select-daily-source-kind"][data-source-kind="${kind}"]`);
  await page.fill("#dailySourceDraft", text);
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction((count) => document.querySelectorAll("#dailySources .source-capture-editor").length === count, expectedCount);
}

try {
  await openRealApp(page, server.baseUrl);
  await unlockAndCreatePatient(page);

  // Section entry uses one reusable editor; every other field remains optional.
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="admission"][data-note-mode="sections"]');
  assert.equal(await page.locator('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]').count(), 1);
  assert.equal(await page.locator('[data-structured-note-scope="admission"][data-structured-note-field]').count(), 1);
  assert.equal(await page.locator('[data-action="select-structured-note-field"][data-note-field="past_medical_history"]').count(), 1);
  const oneLiner = "Adult with community-acquired pneumonia improving on room air.";
  await page.fill('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]', oneLiner);
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="admission"]');
  await page.waitForFunction(() => /Primary-team note saved|Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-action="open-admission-note"]').isEnabled(), true);

  // The compact review sheet: data on the left, note editor on the right.
  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.match(await page.locator(".review-one-liner").innerText(), /community-acquired pneumonia/);
  assert.equal(await page.locator(".review-data-panel").count(), 1, "clinical data sheet must render");
  assert.equal(await page.locator(".note-draft-panel").count(), 1, "compact note editor must render");
  assert.equal(await page.locator('[data-draft-section="past_surgical_history"]').count(), 1, "H&P core sections are always present");

  // Only optional closing sections get visibility toggles; core sections never do.
  for (const field of ["fen", "ins_outs", "vte_prophylaxis", "code_status", "disposition", "medication_regimens"]) {
    assert.equal(await page.locator(`[data-section-visibility="${field}"]`).count(), 1, `${field} must have a visibility toggle`);
  }
  for (const field of ["assessment", "plan", "objective"]) {
    assert.equal(await page.locator(`[data-section-visibility="${field}"]`).count(), 0, `core section ${field} must not be toggleable`);
  }
  // Diet and exercise is the one H&P field that is not core: not every note
  // covers it, so it gets the same optional toggle (progress notes never show it).
  assert.equal(await page.locator('[data-section-visibility="diet_and_exercise"]').count(), 1, "H&P diet and exercise must have a visibility toggle");
  await page.fill('[data-draft-section="diet_and_exercise"]', "Balanced diet, walks daily.");
  assert.match(await page.locator("[data-final-note-preview]").innerText(), /Balanced diet, walks daily/);
  await page.locator('[data-section-visibility="diet_and_exercise"]').uncheck();
  assert.doesNotMatch(await page.locator("[data-final-note-preview]").innerText(), /Diet and Exercise/, "toggling diet off must drop it from the final note");
  await page.locator('[data-section-visibility="diet_and_exercise"]').check();
  const assessmentHelp = page.locator('[data-help-key="assessment"]');
  assert.match(await assessmentHelp.getAttribute("data-tooltip"), /concise synthesis/i);
  assert.doesNotMatch(await assessmentHelp.getAttribute("data-tooltip"), /act as|prompt token|hidden reasoning|return only/i);
  assert.equal(await page.locator(".note-help-panel").count(), 0, "help must stay in a hover/focus tooltip instead of inserting a panel");

  // The problem builder preserves student wording, known etiology, plans, and order.
  await page.click('[data-action="add-plan-problem"]');
  const firstProblem = page.locator(".plan-problem-card").first();
  await firstProblem.locator('[data-problem-field="problem"]').fill("Community-acquired pneumonia");
  await firstProblem.locator('[data-problem-etiology][value="known"]').check();
  await firstProblem.locator('[data-problem-field="knownEtiology"]').fill("Documented pneumococcal infection");
  await firstProblem.locator('[data-problem-field="diagnosticPlan"]').fill("Trend oxygen requirement and fever curve.");
  await firstProblem.locator('[data-problem-field="therapeuticPlan"]').fill("Continue the documented antibiotic regimen.");
  await page.click('[data-action="add-plan-problem"]');
  const secondProblem = page.locator(".plan-problem-card").nth(1);
  await secondProblem.locator('[data-problem-field="problem"]').fill("Acute kidney injury");
  await secondProblem.locator('[data-action="add-differential"]').click();
  await secondProblem.locator('[data-differential-field="diagnosis"]').fill("Prerenal azotemia");
  await secondProblem.locator('[data-differential-field="cluesFor"]').fill("Reduced intake");
  assert.equal(await secondProblem.locator('[data-differential-field="cluesAgainst"]').inputValue(), "");
  await secondProblem.locator('[data-action="add-differential"]').click();
  await secondProblem.locator(".differential-card").nth(1).locator('[data-differential-field="diagnosis"]').fill("Acute tubular injury");
  await secondProblem.locator(".differential-card").nth(1).locator('[data-action="move-differential"][data-direction="-1"]').click();
  assert.equal(await secondProblem.locator(".differential-card").first().locator('[data-differential-field="diagnosis"]').inputValue(), "Acute tubular injury");
  await secondProblem.locator('[data-action="move-plan-problem"][data-direction="-1"]').click();
  assert.equal(await page.locator(".plan-problem-card").first().locator('[data-problem-field="problem"]').inputValue(), "Acute kidney injury");
  await page.click('[data-action="add-plan-problem"]');
  assert.equal(await page.locator(".plan-problem-card").count(), 3);
  await page.locator(".plan-problem-card").last().locator('[data-action="remove-plan-problem"]').click();
  assert.equal(await page.locator(".plan-problem-card").count(), 2);
  assert.match(await page.locator("[data-final-note-preview]").innerText(), /Documented pneumococcal infection/);
  assert.match(await page.locator("[data-final-note-preview]").innerText(), /Differential \| Clues for this differential \| Clues against this differential/);

  // A pasted prior progress note is parsed through the same visible workflow used by the app.
  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-09-19");
  await page.fill("#newDayLabel", "Hospital day 2");
  await page.click('[data-action="add-day"]');
  await page.waitForSelector('[data-structured-note-paste][data-structured-note-scope="daily"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', progressTeamNote);
  assert.match(await page.locator('[data-structured-note-detected="daily"]').innerText(), /Interval events/);
  assert.match(await page.locator('[data-structured-note-detected="daily"]').innerText(), /Medications/);
  assert.equal(await page.locator('.structured-note-actions [data-action="review-structured-note-sections"][data-note-scope="daily"]').isEnabled(), true);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="daily"]');
  assert.equal(await page.locator('[data-structured-note-scope="daily"][data-structured-note-field="interval_events"]').count(), 1, "review should open on the first detected section");
  assert.match(await page.locator('[data-structured-note-field="interval_events"]').inputValue(), /No acute overnight events/);
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="daily"][data-note-mode="paste"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', criticalCareNote);
  assert.match(await page.locator('[data-structured-note-detected="daily"]').innerText(), /Patient report/);
  assert.match(await page.locator('[data-structured-note-detected="daily"]').innerText(), /Physical exam/);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="daily"]');
  await page.click('[data-action="select-structured-note-field"][data-note-scope="daily"][data-note-field="objective"]');
  assert.match(await page.locator('[data-structured-note-field="objective"]').inputValue(), /PH ART/);
  assert.match(await page.locator('[data-structured-note-field="objective"]').inputValue(), /SBP goal <160/);
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="daily"][data-note-mode="paste"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', compactPrimaryNote);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="daily"]');
  await page.click('[data-action="select-structured-note-field"][data-note-scope="daily"][data-note-field="plan"]');
  assert.match(await page.locator('[data-structured-note-field="plan"]').inputValue(), /SBP<160/);
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="daily"]');
  await page.waitForFunction(() => /Primary-team note saved|Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));

  // A combined "Assessment and Plan" heading splits into Assessment prose and plan problems.
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="daily"][data-note-mode="paste"]');
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', combinedAssessmentPlanNote);
  await page.click('[data-action="review-structured-note-sections"][data-note-scope="daily"]');
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="daily"]');
  await page.waitForFunction(() => /Primary-team note saved|Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="open-progress-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.match(await page.locator('[data-draft-assessment]').inputValue(), /Sepsis secondary to pneumonia/, "combined heading must seed the Assessment scaffold");
  assert.match(await page.locator('[data-draft-assessment]').inputValue(), /likely pre-renal/i, "reasoning prose belongs in Assessment, not the plan");
  assert.equal(await page.locator('[data-draft-section="interval_events"]').inputValue(), "No acute overnight events.");
  const planProblems = await page.locator(".plan-problem-card").allInnerTexts();
  assert.ok(planProblems.some((text) => /Sepsis secondary to pneumonia/.test(text)), "combined heading must populate plan problems");
  assert.ok(planProblems.some((text) => /Continue ceftriaxone/.test(text)), "plan actions must land in the problem plan");

  // Add realistic patient-wide data through the visible Hospital Stay workflow.
  await page.click('[data-view-target="daily"]');
  const fragmentedCell = (value = "") => `|   |\n| - |\n\n${value}`;
  const dayOneLabs = [
    fragmentedCell("Latest Reference Range & Units"),
    fragmentedCell("09/19/26 06:00"),
    fragmentedCell("WBC4.0 - 10.0 10\\*3/uL"),
    fragmentedCell("**15.2 (H)**"),
    fragmentedCell("Hemoglobin11.2 - 15.7 g/dL"),
    fragmentedCell("**10.1 (L)**"),
    fragmentedCell("Platelets182 - 369 10\\*3/uL"),
    fragmentedCell("242"),
    fragmentedCell("Creatinine0.5 - 1.0 mg/dL"),
    fragmentedCell("**1.4 (H)**"),
    fragmentedCell("Sodium136 - 145 mmol/L"),
    fragmentedCell("137")
  ].join("\n\n");
  await addDailySource("laboratory_results", dayOneLabs, 2);
  assert.match(await page.locator("#dailySources").innerText(), /CBC · \[Hospital Day 2 at 06:00\]/);
  assert.match(await page.locator("#dailySources").innerText(), /Basic metabolic panel · \[Hospital Day 2 at 06:00\]/);
  const vitals = `| Date/TimeTempPulseHeart Rate (Monitored)RespBPMAPArterial BPMAPSpO2$ O2 DeviceO2 Flow Rate (l/min)FiO2 (%)Weight | | | | | | | | | | | | | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 09/19/26 0600 | 36.5 °C (97.7 °F) | — | 72 | 18 | 119/77 | 93 mmHg | — | — | 99 % | Room air | — | — | — |
| 09/18/26 2300 | 37.8 °C (100 °F) | — | 96 | 20 | 110/70 | 83 mmHg | — | — | 95 % | Nasal cannula | 2 | — | — |`;
  await addDailySource("vital_signs", vitals, 3);
  const medications = `Medications\t09/18/26\t09/19/26\t09/20/26
cefTRIAXone (ROCEPHIN) injection 1 g
Dose: 1 g
Freq: every 24 hours Route: IV
Start: 09/18/26 0900 End: 09/22/26 0859
0900 (1 g)

acetaminophen (TYLENOL) tablet 650 mg
Dose: 650 mg
Freq: every 6 hours PRN Route: PO
Start: 09/18/26 1200
Admin Instructions:
Use for fever or pain.
1815 (650 mg)`;
  await addDailySource("medication_activity", medications, 4);
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="results"]');
  await page.fill('[data-result-metadata="label"][data-result-scope="daily"]', "CT Head/Neck Without Contrast");
  await page.selectOption('[data-result-metadata="category"][data-result-scope="daily"]', "imaging");
  await page.fill('[data-result-metadata="date"][data-result-scope="daily"]', "2026-09-19");
  await page.fill('[data-result-metadata="context"][data-result-scope="daily"]', "Final read");
  await page.fill("#dailySourceDraft", "No acute intracranial abnormality.");
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => document.querySelectorAll("#dailySources .source-capture-editor").length === 5);
  assert.match(await page.locator("#dailySources .source-capture-editor").last().innerText(), /CT Head\/Neck Without Contrast/);
  assert.equal(await page.locator('#dailySources [data-clinical-view]').count(), 0, "Hospital Stay must not render clinical summaries");

  // A second day creates a chronological lab trend and a pending result.
  await page.locator("details.new-day-control summary").click();
  await page.fill("#newDayDate", "2026-09-20");
  await page.fill("#newDayLabel", "Hospital day 3");
  await page.click('[data-action="add-day"]');
  const dayTwoLabs = `Results from EPIC:
WBC: 8.8
Creatinine: pending
Sodium: 138`;
  await addDailySource("laboratory_results", dayTwoLabs, 1);

  // Build and complete only one history question and one exam maneuver for
  // this day; answered findings must flow into the note automatically.
  await page.click('[data-view-target="workups"]');
  const catalogMenu = page.locator(".workup-catalog-menu");
  if (!(await catalogMenu.getAttribute("open"))) await catalogMenu.locator("summary").click();
  await page.locator(".workup-checkbox").first().check();
  await page.locator('[data-action="build-checklist"]').first().click();
  await page.waitForSelector("#checklistSections .checklist-item");
  const historyItem = page.locator("#checklistSections .checklist-section").filter({ has: page.locator("h3", { hasText: "History" }) }).locator(".checklist-item").first();
  const examItem = page.locator("#checklistSections .checklist-section").filter({ has: page.locator("h3", { hasText: "Physical Exam" }) }).locator(".checklist-item").first();
  if (await historyItem.locator("select.checklist-answer").count()) await historyItem.locator("select.checklist-answer").selectOption({ index: 1 });
  else await historyItem.locator('input.checklist-answer').first().check();
  if (await examItem.locator("select.checklist-answer").count()) await examItem.locator("select.checklist-answer").selectOption({ index: 1 });
  else await examItem.locator('input.checklist-answer').first().check();
  await page.waitForFunction(() => [...document.querySelectorAll("#checklistSections .checklist-item")].filter((item) => item.querySelector("select.checklist-answer")?.value || item.querySelector("input.checklist-answer:checked")).length >= 2);

  // The compact sheet shows every matching row on one page: no pagination.
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.equal(await page.locator("#reviewDataCategory").inputValue(), "all", "opening Patient Data Review must reveal labs, vitals, medications, and results");
  assert.equal(await page.locator(".review-data-pagination").count(), 0, "the compact sheet must not paginate");
  assert.equal(await page.locator('[data-checklist-finding-kind="history"] li').count(), 1);
  assert.equal(await page.locator('[data-checklist-finding-kind="exam"] li').count(), 1);

  // Vitals and medications are in the note by default; every row is checked.
  const vitalChecks = page.locator(".vital-chip [data-objective-selection-id]");
  assert.ok(await vitalChecks.count() >= 5, "vital signs must render as compact chips");
  for (const box of await vitalChecks.all()) assert.equal(await box.isChecked(), true, "vitals are included by default");
  assert.match(await page.locator(".vital-strip").innerText(), /119\/77/, "cuff systolic/diastolic must pair into one blood pressure chip");
  const medicationChecks = page.locator(".compact-medications [data-objective-selection-id]");
  assert.equal(await medicationChecks.count(), 2, "every saved medication must render");
  for (const box of await medicationChecks.all()) assert.equal(await box.isChecked(), true, "medications are included by default");
  assert.equal(await page.locator(".scaffold-med-list li").count(), 2, "medications render in their own scaffold, not under Objective");

  // Labs render as dense collapsible families; pending results stay separate.
  assert.ok(await page.locator(".compact-lab-family").count() >= 2, "labs must group into families");
  assert.match(await page.locator(".compact-lab-family").first().innerText(), /CBC|Basic metabolic panel/);
  assert.match(await page.locator(".compact-pending").innerText(), /Creatinine/, "pending results must stay in their own section");
  const wbcRow = page.locator(".lab-row", { hasText: "WBC" }).first();
  assert.match(await wbcRow.innerText(), /15\.2[\s\S]*8\.8/, "matching analytes must trend chronologically in one row");

  // Lab families collapse without losing their toggle state.
  const firstFamilyToggle = page.locator(".lab-family-toggle").first();
  await firstFamilyToggle.click();
  assert.equal(await firstFamilyToggle.getAttribute("aria-expanded"), "false", "lab family must collapse on toggle");
  await firstFamilyToggle.click();
  assert.equal(await firstFamilyToggle.getAttribute("aria-expanded"), "true", "lab family must expand on second toggle");

  // Search filters the sheet to matching rows.
  await page.fill("#reviewDataSearch", "WBC");
  await page.waitForFunction(() => document.querySelectorAll(".lab-row").length === 1);
  assert.match(await page.locator(".lab-row").first().innerText(), /8\.8/);
  await page.fill("#reviewDataSearch", "");

  // Checking a lab row adds a source-linked Objective block with the trend.
  await page.locator('.lab-row [data-lab-result-selection]').first().check();
  await page.waitForFunction(() => document.querySelectorAll("[data-objective-block]").length >= 1);
  const wbcBlock = page.locator("[data-objective-block]").first();
  assert.match(await wbcBlock.locator("textarea").inputValue(), /WBC: 15\.2[\s\S]*→ 8\.8/);

  // Every analyte gets an easy baseline entry.
  const creatinineRow = page.locator(".lab-row", { hasText: "Creatinine" }).first();
  await creatinineRow.locator('[data-action="baseline-edit"]').click();
  await page.fill('[data-baseline-field="value"]', "1.0");
  await page.fill('[data-baseline-field="dateLabel"]', "Sep 2024");
  await page.click('[data-action="baseline-save"]');
  await page.waitForFunction(() => /Baseline saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.match(await page.locator(".lab-row", { hasText: "Creatinine" }).first().innerText(), /base 1\.0/);

  // Unchecking a default-on vital is durable across navigation.
  const hrChip = page.locator(".vital-chip", { hasText: "Heart Rate" }).first();
  await hrChip.locator('[data-objective-selection-id]').uncheck();
  await page.click('[data-view-target="daily"]');
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.equal(await page.locator(".vital-chip", { hasText: "Heart Rate" }).first().locator('[data-objective-selection-id]').isChecked(), false, "deselected vitals must stay out of the note");

  // Removing a medication through its scaffold is durable too.
  await page.locator(".scaffold-med-list li", { hasText: "acetaminophen" }).locator('[data-action="remove-objective-selection"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.compact-medications [data-objective-selection-id]')].filter((box) => box.checked).length === 1);
  await page.click('[data-view-target="daily"]');
  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.equal(await page.locator(".scaffold-med-list li").count(), 1, "removed medications must stay removed");

  // Optional closing sections toggle individually; the preview follows.
  await page.fill('[data-draft-closing="vte_prophylaxis"]', "Sequential compression devices.");
  assert.match(await page.locator("[data-final-note-preview]").innerText(), /Sequential compression devices/);
  await page.locator('[data-section-visibility="vte_prophylaxis"]').uncheck();
  assert.doesNotMatch(await page.locator("[data-final-note-preview]").innerText(), /Sequential compression devices/, "toggling VTE off must drop it from the final note");
  await page.locator('[data-section-visibility="vte_prophylaxis"]').check();

  // Updating source data marks an edited linked block stale without overwriting it.
  await wbcBlock.locator("textarea").fill("Student wording: WBC has improved substantially.");
  await page.click('[data-view-target="daily"]');
  const currentLabSource = page.locator("#dailySources .source-capture-editor").first();
  if ((await currentLabSource.locator('[data-action="toggle-section-editor"]').getAttribute("aria-expanded")) !== "true") {
    await currentLabSource.locator('[data-action="toggle-section-editor"]').click();
  }
  const currentLabText = await currentLabSource.locator(".section-text").inputValue();
  await currentLabSource.locator(".section-text").fill(currentLabText.replace("WBC: 8.8", "WBC: 7.7"));
  await page.click('[data-action="save-day"]');
  await page.waitForFunction(() => /Source edits saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="review"]');
  await page.fill("#reviewDataSearch", "WBC");
  await page.waitForSelector('[data-objective-state="stale"]');
  assert.equal(await page.locator('[data-objective-state="stale"] textarea').inputValue(), "Student wording: WBC has improved substantially.");
  await page.click('[data-action="review-objective-difference"]');
  assert.match(await page.locator(".objective-diff").innerText(), /7\.7/);
  await page.click('[data-action="keep-objective-selection"]');
  assert.equal(await page.locator("[data-objective-state]").first().getAttribute("data-objective-state"), "edited");
  await page.fill("#reviewDataSearch", "");

  // Student-authored Objective text and diagnostic results still work.
  await page.fill('[data-draft-objective-manual]', "Lungs clear to auscultation.");
  await page.fill("#reviewDataSearch", "CT Head/Neck");
  const ctRow = page.locator(".compact-row", { hasText: "CT Head" }).first();
  assert.match(await ctRow.innerText(), /No acute intracranial abnormality/);
  await ctRow.locator('[data-objective-selection-id]').check();
  assert.match(await page.locator("[data-objective-block]").last().locator("textarea").inputValue(), /CT Head\/Neck Without Contrast[\s\S]*No acute intracranial abnormality/);
  await page.fill("#reviewDataSearch", "");

  // Note export actions remain available.
  assert.equal(await page.locator('[data-action="copy-final-note"]').isVisible(), true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(server.baseUrl).origin });
  await page.click('[data-action="copy-final-note"]');
  const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copiedNote, /Lungs clear to auscultation/);
  assert.doesNotMatch(copiedNote, /\*\*/);
  const noteDownload = page.waitForEvent("download");
  await page.click('[data-action="download-final-note"]');
  assert.match((await noteDownload).suggestedFilename(), /progress-note\.txt$/);

  // Saved draft survives encryption/reload; lock clears all protected content.
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /Encrypted note draft saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="daily"]');
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="primary_note"]');
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="daily"][data-note-mode="paste"]');
  const sessionOnlyRawToken = "SESSION_ONLY_RAW_NOTE_MUST_CLEAR_ON_LOCK";
  await page.fill('[data-structured-note-paste][data-structured-note-scope="daily"]', `HPI:\n${sessionOnlyRawToken}`);
  assert.match(await page.locator('[data-structured-note-paste][data-structured-note-scope="daily"]').inputValue(), new RegExp(sessionOnlyRawToken));
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(localStorage)), new RegExp(sessionOnlyRawToken), "unsaved pasted chart text must not enter local storage");
  await page.click('[data-view-target="vault"]');
  await page.click('[data-action="lock-vault"]');
  assert.equal(await page.locator("#reviewContent").innerHTML(), "");
  assert.equal(await page.locator('[data-structured-note-paste]').count(), 0, "locking must remove the raw paste editor from the protected DOM");
  assert.doesNotMatch(await page.locator("body").innerText(), /intracranial abnormality|community-acquired pneumonia/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="daily"]');
  await page.locator('[data-action="select-day"]').last().click();
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="primary_note"]');
  await page.click('[data-action="select-structured-note-mode"][data-note-scope="daily"][data-note-mode="paste"]');
  assert.doesNotMatch(await page.locator('[data-structured-note-paste][data-structured-note-scope="daily"]').inputValue(), new RegExp(sessionOnlyRawToken), "locking must clear the session-only raw paste draft");
  await page.click('[data-view-target="review"]');
  const savedPacketValue = await page.locator('#reviewPacketSelect option').filter({ hasText: "Hospital day 3" }).getAttribute("value");
  await page.selectOption("#reviewPacketSelect", savedPacketValue);
  await page.fill("#reviewDataSearch", "CT Head/Neck");
  assert.equal(await page.locator('.compact-row [data-objective-selection-id]').first().isChecked(), true);
  assert.equal(await page.locator('[data-draft-objective-manual]').inputValue(), "Lungs clear to auscultation.");

  // Narrow layout remains usable by keyboard without horizontal document overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
  const help = page.locator('[data-help-key="objective"]');
  await help.focus();
  assert.match(await help.getAttribute("data-tooltip"), /measured|diagnostic/i);
  assert.equal(await page.locator(".note-help-panel").count(), 0);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter((message) => !/503 \(Service Unavailable\)/.test(message)), []);
  console.log("review data browser journeys passed");
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
