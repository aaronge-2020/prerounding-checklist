import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer, openRealApp, unlockAndCreatePatient } from "./browser/app-harness.js";

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

  // Structured H&P entry: only the one-liner is populated and every other field remains optional.
  assert.equal(await page.locator('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]').count(), 1);
  assert.equal(await page.locator('[data-structured-note-scope="admission"][data-structured-note-field="past_medical_history"]').count(), 1);
  const oneLiner = "Adult with community-acquired pneumonia improving on room air.";
  await page.fill('[data-structured-note-scope="admission"][data-structured-note-field="one_liner"]', oneLiner);
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="admission"]');
  await page.waitForFunction(() => /Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-action="open-admission-note"]').isEnabled(), true);

  await page.click('[data-action="open-admission-note"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.match(await page.locator(".review-one-liner").innerText(), /community-acquired pneumonia/);
  assert.equal(await page.locator('[data-draft-section="past_surgical_history"]').count(), 1);
  await page.locator('[data-action="toggle-note-help"][data-help-key="assessment"]').focus();
  await page.keyboard.press("Enter");
  assert.match(await page.locator(".note-help-panel").innerText(), /concise synthesis/i);
  assert.doesNotMatch(await page.locator(".note-help-panel").innerText(), /act as|prompt token|hidden reasoning|return only/i);

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

  // Progress entry shows only progress-appropriate fields and permits a blank one-liner.
  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-09-19");
  await page.fill("#newDayLabel", "Hospital day 2");
  await page.click('[data-action="add-day"]');
  await page.waitForSelector('[data-structured-note-scope="daily"][data-structured-note-field="interval_events"]');
  assert.equal(await page.locator('[data-structured-note-scope="daily"][data-structured-note-field="past_medical_history"]').count(), 0);
  await page.click('[data-action="save-structured-primary-note"][data-note-scope="daily"]');
  await page.waitForFunction(() => /Structured note saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-action="open-progress-note"]');
  await page.click('[data-action="insert-no-acute-events"]');
  assert.equal(await page.locator('[data-draft-section="interval_events"]').inputValue(), "No acute events overnight.");
  assert.equal(await page.locator('[data-draft-section="past_medical_history"]').count(), 0);

  // Add realistic patient-wide data through the visible Hospital Stay workflow.
  await page.click('[data-view-target="daily"]');
  const dayOneLabs = `Results from EPIC:
WBC: 15.2 (H)
Creatinine: 1.4 (H)
Sodium: 137

(H): Data is abnormally high`;
  await addDailySource("laboratory_results", dayOneLabs, 1);
  const vitals = `| Date/TimeTempPulseHeart Rate (Monitored)RespBPMAPArterial BPMAPSpO2$ O2 DeviceO2 Flow Rate (l/min)FiO2 (%)Weight | | | | | | | | | | | | | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 09/19/26 0600 | 36.5 °C (97.7 °F) | — | 72 | 18 | 119/77 | 93 mmHg | — | — | 99 % | Room air | — | — | — |
| 09/18/26 2300 | 37.8 °C (100 °F) | — | 96 | 20 | 110/70 | 83 mmHg | — | — | 95 % | Nasal cannula | 2 | — | — |`;
  await addDailySource("vital_signs", vitals, 2);
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
  await addDailySource("medication_activity", medications, 3);
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="results"]');
  await page.fill('[data-result-metadata="label"][data-result-scope="daily"]', "CT Head/Neck Without Contrast");
  await page.selectOption('[data-result-metadata="category"][data-result-scope="daily"]', "imaging");
  await page.fill('[data-result-metadata="date"][data-result-scope="daily"]', "2026-09-19");
  await page.fill('[data-result-metadata="context"][data-result-scope="daily"]', "Final read");
  await page.fill("#dailySourceDraft", "No acute intracranial abnormality.");
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => document.querySelectorAll("#dailySources .source-capture-editor").length === 4);
  assert.match(await page.locator("#dailySources .source-capture-editor").last().innerText(), /CT Head\/Neck Without Contrast/);
  assert.equal(await page.locator('#dailySources [data-clinical-view]').count(), 0, "Hospital Stay must not render clinical summaries");

  // A second day creates a chronological lab trend.
  await page.locator("details.new-day-control summary").click();
  await page.fill("#newDayDate", "2026-09-20");
  await page.fill("#newDayLabel", "Hospital day 3");
  await page.click('[data-action="add-day"]');
  const dayTwoLabs = `Results from EPIC:
WBC: 8.8
Creatinine: 1.0
Sodium: 138`;
  await addDailySource("laboratory_results", dayTwoLabs, 1);

  // Build and complete only one history question and one exam maneuver for
  // this day; unanswered checklist items must never be offered to the note.
  await page.click('[data-view-target="workups"]');
  const catalogMenu = page.locator(".workup-catalog-menu");
  if (!(await catalogMenu.getAttribute("open"))) await catalogMenu.locator("summary").click();
  await page.locator(".workup-checkbox").first().check();
  await page.locator('[data-action="build-checklist"]').first().click();
  await page.waitForSelector("#checklistSections .checklist-item");
  const historyItem = page.locator("#checklistSections .checklist-section").filter({ has: page.locator("h3", { hasText: "History" }) }).locator(".checklist-item").first();
  const examItem = page.locator("#checklistSections .checklist-section").filter({ has: page.locator("h3", { hasText: "Physical Exam" }) }).locator(".checklist-item").first();
  const historyQuestion = await historyItem.locator("strong").first().innerText();
  const examQuestion = await examItem.locator("strong").first().innerText();
  if (await historyItem.locator("select.checklist-answer").count()) await historyItem.locator("select.checklist-answer").selectOption({ index: 1 });
  else await historyItem.locator('input.checklist-answer').first().check();
  if (await examItem.locator("select.checklist-answer").count()) await examItem.locator("select.checklist-answer").selectOption({ index: 1 });
  else await examItem.locator('input.checklist-answer').first().check();
  await page.waitForFunction(() => [...document.querySelectorAll("#checklistSections .checklist-item")].filter((item) => item.querySelector("select.checklist-answer")?.value || item.querySelector("input.checklist-answer:checked")).length >= 2);

  await page.click('[data-view-target="review"]');
  await page.waitForSelector("#reviewContent .review-workspace");
  assert.equal(await page.locator("[data-checklist-finding-candidate]").count(), 2);
  await page.fill("#checklistFindingSearch", historyQuestion);
  assert.equal(await page.locator("[data-checklist-finding-candidate]:visible").count(), 1);
  await page.fill("#checklistFindingSearch", "");
  await page.locator('[data-checklist-finding-kind="history"] [data-checklist-finding-selection-id]').check();
  await page.locator('[data-checklist-finding-kind="exam"] [data-checklist-finding-selection-id]').check();
  assert.match(await page.locator("[data-final-note-preview]").innerText(), new RegExp(historyQuestion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(await page.locator("[data-final-note-preview]").innerText(), new RegExp(examQuestion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const importedExam = page.locator('[data-checklist-finding-block]').filter({ has: page.locator("strong", { hasText: "Physical exam" }) });
  await importedExam.locator("textarea").fill("Focused exam finding edited for the note.");
  await page.locator('[data-checklist-finding-kind="history"] [data-checklist-finding-selection-id]').uncheck();
  assert.doesNotMatch(await page.locator("[data-final-note-preview]").innerText(), new RegExp(historyQuestion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(await page.locator("[data-final-note-preview]").innerText(), /Focused exam finding edited for the note/);
  assert.equal(await page.locator('[data-action="copy-final-note"]').isVisible(), true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(server.baseUrl).origin });
  await page.click('[data-action="copy-final-note"]');
  const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copiedNote, /Physical Exam[\s\S]*Focused exam finding edited for the note/);
  assert.doesNotMatch(copiedNote, /\*\*/);
  const noteDownload = page.waitForEvent("download");
  await page.click('[data-action="download-final-note"]');
  assert.match((await noteDownload).suggestedFilename(), /progress-note\.txt$/);
  await page.selectOption("#reviewDataCategory", "labs");
  assert.equal(await page.locator("[data-review-candidate]").count(), 1, "the Labs filter must show one laboratory trend at a time");
  assert.match(await page.locator(".review-data-pagination output").innerText(), /Lab 1 of 3/);
  await page.click('[data-action="review-data-page"][data-direction="1"]');
  assert.equal(await page.locator("[data-review-candidate]").count(), 1);
  assert.match(await page.locator(".review-data-pagination output").innerText(), /Lab 2 of 3/);
  await page.selectOption("#reviewDataCategory", "all");
  assert.equal(await page.locator(".review-data-pagination").isVisible(), true);
  await page.click('[data-action="review-data-page"][data-direction="1"]');
  assert.match(await page.locator(".review-data-pagination output").innerText(), /Page 2/);
  await page.click('[data-action="review-data-page"][data-direction="-1"]');
  await page.fill("#reviewDataSearch", "WBC");
  await page.waitForFunction(() => document.querySelectorAll("[data-review-candidate]").length === 1);
  const wbcCard = page.locator("[data-review-candidate]").first();
  assert.match(await wbcCard.innerText(), /15\.2[\s\S]*8\.8/);
  await wbcCard.locator('[data-objective-selection-id]').check();
  const wbcBlock = page.locator("[data-objective-block]").first();
  assert.match(await wbcBlock.locator("textarea").inputValue(), /latest 8\.8/);
  assert.match(await wbcBlock.locator("textarea").inputValue(), /15\.2[\s\S]*→[\s\S]*8\.8/);
  await wbcBlock.locator("textarea").fill("Student wording: WBC has improved substantially.");
  await page.fill('[data-draft-objective-manual]', "Lungs clear to auscultation.");

  // Updating source data marks an edited linked block stale without overwriting it.
  await page.click('[data-view-target="daily"]');
  await addDailySource("laboratory_results", "Results from EPIC:\nWBC: 7.7", 2);
  await page.click('[data-view-target="review"]');
  await page.fill("#reviewDataSearch", "WBC");
  await page.waitForSelector('[data-objective-state="stale"]');
  assert.equal(await page.locator('[data-objective-state="stale"] textarea').inputValue(), "Student wording: WBC has improved substantially.");
  await page.click('[data-action="review-objective-difference"]');
  assert.match(await page.locator(".objective-diff").innerText(), /7\.7/);
  await page.click('[data-action="keep-objective-selection"]');
  assert.equal(await page.locator("[data-objective-state]").first().getAttribute("data-objective-state"), "edited");

  // Several labs can be selected independently; deselecting one preserves the others and manual text.
  await page.fill("#reviewDataSearch", "Creatinine");
  await page.locator('[data-objective-selection-id]').check();
  await page.fill("#reviewDataSearch", "Sodium");
  await page.locator('[data-objective-selection-id]').check();
  assert.equal(await page.locator("[data-objective-block]").count(), 3);
  await page.fill("#reviewDataSearch", "WBC");
  await page.locator('[data-objective-selection-id]').uncheck();
  assert.equal(await page.locator("[data-objective-block]").count(), 2);
  assert.equal(await page.locator('[data-draft-objective-manual]').inputValue(), "Lungs clear to auscultation.");

  await page.fill("#reviewDataSearch", "SpO2");
  const spo2Card = page.locator("[data-review-candidate]").first();
  assert.match(await spo2Card.innerText(), /24-hour range[\s\S]*95–99 %[\s\S]*Mean[\s\S]*97 %[\s\S]*Median[\s\S]*97 %/);

  await page.fill("#reviewDataSearch", "ceftriaxone");
  const medicationCard = page.locator("[data-review-candidate]").first();
  assert.match(await medicationCard.innerText(), /Current saved regimen[\s\S]*1 g[\s\S]*every 24 hours[\s\S]*IV/i);
  assert.match(await medicationCard.innerText(), /Course[\s\S]*Day 3/i);

  await page.fill("#reviewDataSearch", "CT Head/Neck");
  const ctCard = page.locator("[data-review-candidate]").first();
  assert.match(await ctCard.innerText(), /No acute intracranial abnormality/);
  await ctCard.locator('[data-objective-selection-id]').check();
  assert.match(await page.locator("[data-objective-block]").last().locator("textarea").inputValue(), /CT Head\/Neck Without Contrast[\s\S]*No acute intracranial abnormality/);

  // Saved draft survives encryption/reload; lock clears all protected content.
  await page.click('[data-action="save-note-draft"]');
  await page.waitForFunction(() => /Encrypted note draft saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="vault"]');
  await page.click('[data-action="lock-vault"]');
  assert.equal(await page.locator("#reviewContent").innerHTML(), "");
  assert.doesNotMatch(await page.locator("body").innerText(), /intracranial abnormality|community-acquired pneumonia/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vaultPassphrase");
  await page.fill("#vaultPassphrase", "clinical review test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.click('[data-view-target="review"]');
  const savedPacketValue = await page.locator('#reviewPacketSelect option').filter({ hasText: "Hospital day 3" }).getAttribute("value");
  await page.selectOption("#reviewPacketSelect", savedPacketValue);
  await page.fill("#reviewDataSearch", "CT Head/Neck");
  assert.equal(await page.locator('[data-objective-selection-id]').isChecked(), true);
  assert.equal(await page.locator('[data-draft-objective-manual]').inputValue(), "Lungs clear to auscultation.");

  // Narrow layout remains usable by keyboard without horizontal document overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
  const help = page.locator('[data-action="toggle-note-help"][data-help-key="objective"]');
  await help.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".note-help-panel").isVisible(), true);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter((message) => !/503 \(Service Unavailable\)/.test(message)), []);
  console.log("review data browser journeys passed");
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
