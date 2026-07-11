import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mime = new Map([
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".css", "text/css"],
  [".md", "text/markdown"],
  [".json", "application/json"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"]
]);

function staticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": mime.get(extname(file)) || "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const server = await staticServer();
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const consoleErrors = [];
const backendRequests = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("request", (request) => {
  if (new RegExp(["su", "pabase"].join(""), "i").test(request.url())) backendRequests.push(request.url());
});

try {
  await page.goto(baseUrl);
  await page.waitForSelector("#vaultContent");
  assert.equal(await page.title(), "Pre-Rounding Checklist Builder");

  await page.fill("#vaultPassphrase", "test passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.fill("#newPatientLabel", "Room 12");
  await page.click('[data-action="admit-patient"]');
  await page.waitForSelector("#contextSections");
  await page.selectOption("#deidModeSelect", "structured");

  await page.locator("#contextSections .section-editor").nth(0).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(0).locator(".section-text").fill("Jane Patient MRN 123456 admitted with dyspnea.");
  await page.locator("#contextSections .section-editor").nth(1).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(1).locator(".section-text").fill("Furosemide 40 mg PO daily. Lisinopril 10 mg PO daily.");
  await page.locator("#contextSections .section-editor").nth(2).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(2).locator(".section-text").fill("Creatinine 1.4 today.");
  await page.click('[data-action="save-context"]');
  await page.waitForFunction(() => document.querySelector("#contextSections")?.textContent.includes("[MRN]"));

  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-07-09");
  await page.fill("#newDayLabel", "Hospital day 1");
  await page.click('[data-action="add-day"]');
  await page.locator("#dailySections .section-editor").nth(0).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#dailySections .section-editor").nth(0).locator(".section-text").fill("Overnight oxygen requirement improved.");
  await page.locator("#dailySections .section-editor").nth(1).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#dailySections .section-editor").nth(1).locator(".section-text").fill("Repeat creatinine 1.3.");
  await page.click('[data-action="save-day"]');
  await page.waitForSelector("#dailySections");

  await page.click('[data-view-target="workups"]');
  const historyRows = page.locator('[data-workup-kind="history"] [data-workup-item-row]');
  const thirdHistoryText = await historyRows.nth(2).locator('[data-field="item-text"]').inputValue();
  await historyRows.nth(2).locator(".workup-drag-handle").dragTo(historyRows.nth(0).locator(".workup-drag-handle"));
  await page.waitForFunction(() => /Workup item order saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-workup-kind="history"] [data-workup-item-row]').first().locator('[data-field="item-text"]').inputValue(), thirdHistoryText);
  const secondHistoryText = await historyRows.nth(1).locator('[data-field="item-text"]').inputValue();
  await historyRows.nth(1).locator('[data-action="move-workup-item"][data-direction="up"]').click();
  await page.waitForFunction(() => /Workup item order saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-workup-kind="history"] [data-workup-item-row]').first().locator('[data-field="item-text"]').inputValue(), secondHistoryText);
  await page.locator(".workup-catalog-menu summary").click();
  await page.locator(".workup-checkbox").first().check();
  await page.locator(".workup-checkbox").nth(1).check();
  await page.locator(".workup-checkbox").nth(2).check();
  await page.click('[data-action="build-checklist"]');
  await page.waitForSelector("#checklistSections .checklist-item");
  assert.equal(await page.locator("#checklistSections .checklist-item").count() >= 10, true);
  assert.equal(await page.locator("#checklistSections .checklist-system").count() > 0, true);
  await page.click('[data-action="fill-section-negatives"][data-kind="exam"]');
  await page.waitForFunction(() => [...document.querySelectorAll("#checklistSections .checklist-answer-select")].some((select) => select.value) || document.querySelectorAll("#checklistSections .checklist-answer:checked").length > 0);

  await page.setViewportSize({ width: 390, height: 720 });
  const scrollWorked = await page.evaluate(() => {
    const node = document.querySelector("#checklistSections");
    node.scrollTop = node.scrollHeight;
    return node.scrollTop > 0 && node.scrollHeight > node.clientHeight;
  });
  assert.equal(scrollWorked, true);

  const phoneLink = await page.locator("#phoneBundleText").inputValue();
  const phonePage = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await phonePage.goto(phoneLink);
  await phonePage.waitForSelector(".phone-mode #checklistSections .checklist-item");
  await phonePage.locator(".checklist-answer-select").first().selectOption({ index: 1 });
  const returnBundle = await phonePage.locator("#phoneReturnBundle").inputValue();
  await phonePage.close();

  await page.fill("#phoneReturnText", returnBundle);
  await page.click('[data-action="import-phone-return"]');
  await page.waitForFunction(() => /Returned phone answers imported/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.click('[data-view-target="prompts"]');
  await page.waitForSelector("#promptOutput");
  assert.match(await page.locator("#promptOutput").inputValue(), /Clinical Documentation Standard/);
  assert.doesNotMatch(await page.locator("#promptOutput").inputValue(), /Privacy rules:/);
  await page.locator("#promptPreview").fill("@");
  await page.waitForSelector("#smartVariableMenu.open");
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@admission-context" }).count(), 1);
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@guidelines" }).count(), 1);
  await page.locator('#smartVariableMenu [data-token="@guidelines"]').click();
  assert.equal(await page.locator("#promptPreview").inputValue(), "@guidelines");
  await page.locator("#promptPreview").fill("Use @admission-context");
  await page.waitForFunction(() => /\[PATIENT NAME\]/.test(document.querySelector("#promptOutput")?.value || ""));
  await page.selectOption("#promptTaskSelect", "daily_progress_note");
  assert.match(await page.locator("#promptOutput").inputValue(), /The Daily Progress Note/);
  await page.selectOption("#promptTaskSelect", "teaching_case_trajectory");
  assert.match(await page.locator("#promptOutput").inputValue(), /Teach the full case trajectory/i);
  await page.selectOption("#promptTaskSelect", "medication_explainer_by_problem");
  assert.match(await page.locator("#promptOutput").inputValue(), /disease, condition, symptom/);
  await page.selectOption("#promptTaskSelect", "medication_safety_audit");
  assert.match(await page.locator("#promptOutput").inputValue(), /insufficient information/);

  await page.click('[data-view-target="quickDeid"]');
  await page.waitForSelector("#quickDeidMode");
  await page.selectOption("#quickDeidMode", "ettin-68m-nemotron-pii");
  assert.equal(await page.locator("#quickDeidMode").inputValue(), "ettin-68m-nemotron-pii");
  await page.fill("#quickDeidInput", "Jane Patient MRN 123456 was evaluated by Dr. Smith.");
  await page.click('[data-action="run-quick-deid"]');
  await page.waitForFunction(() => /Model used: kalyan-ks\/ettin-68m-nemotron-pii/.test(document.querySelector("#quickDeidContent")?.textContent || ""), null, { timeout: 30000 });
  assert.equal((await page.locator("#quickDeidOutput").inputValue()).length > 0, true);
  await page.selectOption("#quickDeidMode", "structured");
  await page.fill("#quickDeidInput", "The patient is a mayor in the local community.");
  await page.click('[data-action="run-quick-deid"]');
  await page.waitForSelector('[data-action="review-quick-warning"]');
  await page.click('[data-action="review-quick-warning"]');
  assert.equal(await page.locator("#quickDeidOutput").evaluate((node) => node.selectionStart !== node.selectionEnd), true);

  await page.click('[data-view-target="daily"]');
  await page.locator(".new-day-control summary").click();
  await page.fill("#newDayDate", "2026-07-10");
  await page.fill("#newDayLabel", "Hospital day 2");
  await page.click('[data-action="add-day"]');
  await page.waitForFunction(() => document.querySelectorAll(".day-row").length === 2);
  await page.click('[data-action="remove-day"]');
  await page.waitForFunction(() => document.querySelector("#removeDayConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-remove-day"]');
  await page.waitForFunction(() => document.querySelectorAll(".day-row").length === 1);

  await page.click('[data-view-target="vault"]');
  await page.click('[data-action="archive-patient"]');
  await page.waitForFunction(() => document.querySelector("#archiveConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-archive-patient"]');
  await page.waitForFunction(() => /No patients in this local vault/.test(document.querySelector("#vaultContent")?.textContent || ""));

  assert.deepEqual(backendRequests, []);
  assert.deepEqual(consoleErrors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("local-first browser workflow tests passed");
