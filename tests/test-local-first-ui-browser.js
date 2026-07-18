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
await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });

// The plain-text prompt textarea was removed (the highlighted preview made it
// redundant) - the only remaining way to inspect the exact copy-ready text
// (team preferences block, bracket-stripping, token de-tokenizing) is to
// actually click "Copy prompt" and read what landed on the clipboard.
async function copiedPromptText() {
  await page.click('[data-action="copy-prompt"]');
  return page.evaluate(() => navigator.clipboard.readText());
}

await page.addInitScript(() => {
  // The installer error path is tested before model execution. This gives the
  // static UI a WebGPU-capable device so its Large-model action is reachable.
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: { requestAdapter: async () => ({}) }
  });
});
const consoleErrors = [];
const backendRequests = [];
const externalModelRequests = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("request", (request) => {
  if (new RegExp(["su", "pabase"].join(""), "i").test(request.url())) backendRequests.push(request.url());
  if (/huggingface\.co|cdn\.jsdelivr\.net/i.test(request.url())) externalModelRequests.push(request.url());
});

try {
  await page.goto(baseUrl);
  await page.waitForSelector("#vaultContent");
  assert.equal(await page.title(), "Pre-Rounding Checklist Builder");
  await page.waitForSelector("#vaultContent .locked-vault-shell");
  assert.equal(await page.locator("body").evaluate((node) => node.classList.contains("vault-locked")), true);
  assert.equal(await page.locator(".side-nav").isHidden(), true);
  assert.equal(await page.locator(".top-bar").isHidden(), true);
  assert.equal(await page.locator("#dailyContent").innerHTML(), "");
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("minlength"), "12");
  assert.match(await page.locator(".vault-no-recovery-warning").innerText(), /no server, no reset button, and no recovery/i);
  assert.match(await page.locator("#vaultPassphraseStrength").innerText(), /two or more words/i);

  await page.fill("#vaultPassphrase", "shortcode");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /at least 12 characters/.test(document.querySelector("#vaultPassphraseError")?.textContent || ""));
  assert.equal(await page.locator("#vaultPassphraseStrength").evaluate((node) => node.classList.contains("is-weak")), true);

  await page.fill("#vaultPassphrase", "test passphrase");
  assert.equal(await page.locator("#vaultPassphraseStrength").evaluate((node) => node.classList.contains("is-strong")), true);
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator("body").evaluate((node) => node.classList.contains("vault-locked")), false);
  assert.equal(await page.locator(".side-nav").isVisible(), true);
  assert.equal(await page.locator("#vaultPassphrase").count(), 0);
  assert.equal(await page.locator('[data-action="unlock-vault"]').count(), 0);
  assert.equal(await page.locator(".vault-session-state").innerText(), "Vault unlocked\nPatient data is available only in this browser session.\nLock vault");
  await page.click('[data-action="lock-vault"]');
  await page.waitForSelector("#vaultContent .locked-vault-shell");
  await page.fill("#vaultPassphrase", "wrong passphrase");
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Could not unlock this vault/.test(document.querySelector("#vaultPassphraseError")?.textContent || ""));
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#vaultPassphrase").inputValue(), "wrong passphrase");
  await page.click('[data-action="toggle-vault-passphrase"]');
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("type"), "text");
  assert.equal(await page.locator('[data-action="toggle-vault-passphrase"]').getAttribute("aria-label"), "Hide passphrase");
  await page.click('[data-action="toggle-vault-passphrase"]');
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("type"), "password");
  await page.fill("#vaultPassphrase", "test passphrase");
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("aria-invalid"), null);
  assert.equal(await page.locator("#vaultPassphraseError").isHidden(), true);
  await page.click('[data-action="unlock-vault"]');
  await page.waitForFunction(() => /Vault unlocked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.fill("#newPatientLabel", "Room 12");
  await page.click('[data-action="admit-patient"]');
  await page.waitForSelector("#contextSections");
  assert.equal(await page.locator('[data-action="save-context"]').isEnabled(), true, "Save changes must stay clickable even before the model has loaded - it loads the model itself instead of requiring a separate trip first");
  await page.selectOption("#deidModeSelect", "structured");
  assert.equal(await page.locator('[data-action="save-context"]').isEnabled(), true);

  await page.click('[data-view-target="settings"]');
  await page.waitForSelector("#settingsMedicalService");
  assert.equal(await page.locator('[data-action="export-vault"]').filter({ hasText: "Export Vault Backup" }).count(), 1);
  await page.selectOption("#settingsMedicalService", "consult");
  await page.fill("#settingsServiceFocus", "Focus on the consulted rhythm question.");
  await page.selectOption("#settingsPresentationDetail", "detailed");
  await page.fill("#settingsAttendingPreferences", "Start with a one-liner, then give pertinent negatives.");
  await page.click('[data-action="save-team-preferences"]');
  await page.waitForFunction(() => /Team preferences saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.fill("#openAiApiKeyInput", "test-local-openai-key");
  assert.equal(await page.locator("#openAiModelInput").evaluate((node) => node.tagName), "SELECT");
  assert.equal(await page.locator("#openAiModelInput option").count(), 6);
  await page.selectOption("#openAiModelInput", "gpt-5.6-terra");
  await page.click('[data-action="save-openai-byok"]');
  await page.waitForFunction(() => /OpenAI key saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.match(await page.locator(".settings-security-note").innerText(), /API key is saved/i);
  assert.equal(await page.evaluate(() => Object.values(localStorage).join(" ").includes("test-local-openai-key")), false);

  // Documentation guidelines must be user-manageable per note type (not one
  // shared @guidelines token for both H&P and SOAP), and any new set created
  // here must show up as its own smart variable on the Prompts page.
  await page.waitForSelector("#newGuidelineSetNameInput");
  assert.equal(await page.locator(".guideline-set-card code", { hasText: "@admission-guidelines" }).count(), 1);
  assert.equal(await page.locator(".guideline-set-card code", { hasText: "@progress-guidelines" }).count(), 1);
  await page.fill("#newGuidelineSetNameInput", "Discharge summary");
  await page.click('[data-action="create-guideline-set"]');
  await page.waitForFunction(() => /Discharge summary/.test(document.querySelector("#statusLine")?.textContent || ""));
  const dischargeCard = page.locator(".guideline-set-card", { hasText: "Discharge summary" });
  await dischargeCard.locator("summary").click();
  await dischargeCard.locator("textarea").fill("Summarize the admission, hospital course, and discharge plan.");
  await dischargeCard.locator('[data-action="save-guideline-set"]').click();
  await page.waitForFunction(() => /Guidelines saved/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.click('[data-view-target="prompts"]');
  await page.locator("#promptPreview").fill("@discharge");
  await page.waitForSelector("#smartVariableMenu.open");
  const dischargeVariable = page.locator('#smartVariableMenu button.smart-variable-insert[data-token="@discharge-summary-guidelines"]');
  assert.equal(await dischargeVariable.count(), 1);
  assert.equal(await dischargeVariable.isVisible(), true);
  await dischargeVariable.click();
  await page.waitForFunction(() => /Summarize the admission, hospital course, and discharge plan\./.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  // Restore the default template - this test overwrote the draft for
  // "Initial admission rounds" above, and later assertions in this file
  // depend on that task's real default content still being there.
  await page.click('[data-action="reset-prompt-template"]');
  await page.waitForFunction(() => /Prompt template reset/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.click('[data-view-target="settings"]');
  await page.waitForSelector("#newGuidelineSetNameInput");
  const dischargeCardAgain = page.locator(".guideline-set-card", { hasText: "Discharge summary" });
  await dischargeCardAgain.locator("summary").click();
  await dischargeCardAgain.locator('[data-action="request-remove-guideline-set"]').click();
  await page.waitForFunction(() => document.querySelector("#removeGuidelineSetConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-remove-guideline-set"]');
  await page.waitForFunction(() => /Guideline set deleted/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator(".guideline-set-card", { hasText: "Discharge summary" }).count(), 0);

  await page.click('[data-view-target="prompts"]');
  await page.waitForSelector("#promptOutputHighlighted");
  {
    const copied = await copiedPromptText();
    assert.match(copied, /Consult service/);
    assert.match(copied, /consulted rhythm question/);
  }
  await page.click('[data-view-target="daily"]');

  await page.locator("#contextSections .section-editor").nth(0).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(0).locator(".section-text").fill("Jane Patient MRN 123456 admitted with dyspnea.");
  await page.locator("#contextSections .section-editor").nth(1).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(1).locator(".section-text").fill("Furosemide 40 mg PO daily. Lisinopril 10 mg PO daily.");
  await page.locator("#contextSections .section-editor").nth(2).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(2).locator(".section-text").fill("Creatinine 1.4 today.");
  await page.locator("#contextSections .section-editor").nth(3).locator('[data-action="toggle-section-editor"]').click();
  await page.locator("#contextSections .section-editor").nth(3).locator(".section-text").fill("AM Labs reviewed with the team.");
  await page.fill("#dailyAdmissionDateInput", "2026-07-17");
  await page.click('[data-action="save-context"]');
  await page.waitForFunction(() => document.querySelector("#contextSections")?.textContent.includes("[MRN]"));
  await page.waitForSelector("#contextSections .redaction-review");
  assert.equal(await page.locator("#contextSections .section-editor").nth(0).evaluate((node) => node.classList.contains("is-expanded")), true, "the first review field should open automatically after save");
  const residualWarning = page.locator('#residualWarnings-context .residual-warning').first();
  assert.equal(await residualWarning.count() > 0, true, "the saved review should expose residual PHI flags");
  await residualWarning.click();
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), "AM Labs", "residual review should select the flagged phrase in its own field");
  const dismissContextWarnings = page.locator('#residualWarnings-context [data-action="dismiss-section-warning"]');
  while (await dismissContextWarnings.count()) await dismissContextWarnings.first().click();
  assert.equal(await page.locator("#residualWarnings-context").count(), 0, "dismissing every residual warning should remove the warning panel");
  await page.locator("#contextSections [data-action=\"edit-section-text\"]").first().click();
  assert.equal(await page.locator("#contextSections .section-editor").nth(0).locator(".section-text").isVisible(), true, "a saved field must remain editable");
  await page.locator("#contextSections [data-action=\"resume-section-review\"]").first().click();
  await page.waitForSelector("#contextSections .redaction-review");
  assert.equal(await page.locator("#contextSections .redaction-change").count() > 0, true);
  await page.locator("#contextSections .redaction-change").first().click();
  assert.match(await page.locator("#contextSections [data-redaction-document]").first().innerText(), /Jane Patient|123456/);
  assert.equal(await page.evaluate(() => Object.values(localStorage).join(" ").includes("Jane Patient")), false);
  await page.click('#contextSections [data-action="keep-reviewed-redaction"]');
  const acceptedContextToken = page.locator("#contextSections .redaction-change--confirmed").first();
  assert.equal(await acceptedContextToken.locator("del").count(), 0, "Hospital Stay should also hide an accepted original");
  assert.equal(await acceptedContextToken.locator("mark").count(), 1, "Hospital Stay should retain the safe replacement as a clickable highlight");
  assert.equal(await acceptedContextToken.getAttribute("data-original"), null, "Hospital Stay must not leave an accepted original in the DOM");
  await page.locator('#contextSections [data-action="keep-reviewed-redaction"]').first().click();
  assert.equal(await page.locator("#contextSections .section-editor").nth(1).evaluate((node) => node.classList.contains("is-expanded")), true, "finishing one field should advance into the next field without closing review");
  await page.locator("#contextSections [data-redaction-document]").first().evaluate((node) => {
    const textNode = [...node.querySelectorAll(".redaction-document-text")].find((candidate) => candidate.textContent.includes("dyspnea"))?.firstChild;
    const start = textNode?.textContent.indexOf("dyspnea") ?? -1;
    if (!textNode || start < 0) throw new Error("Could not select the test text.");
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + "dyspnea".length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#contextSections [data-action=\"manual-redact-selection\"]").nth(0).click();
  assert.match(await page.locator("#contextSections .section-text").nth(0).inputValue(), /\[MANUAL REDACTION\]/);
  const movedSectionLabel = await page.locator("#contextSections .section-editor").nth(2).locator(".section-label").inputValue();
  await page.locator("#contextSections .section-editor").nth(2).locator(".section-drag-handle").dragTo(page.locator("#contextSections .section-editor").nth(0).locator(".section-drag-handle"));
  await page.waitForFunction(() => /Section updated/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator("#contextSections .section-editor").first().locator(".section-label").inputValue(), movedSectionLabel);

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
  await page.selectOption("#workupEditorSelect", { label: "Acute kidney injury" });
  assert.equal(await page.locator('[data-workup-kind] .workup-item-scroll').count(), 2);
  assert.equal(await page.locator('[data-workup-kind="history"] .workup-system-group').count() > 1, true);
  assert.equal(await page.locator('[data-workup-kind="history"] .workup-item-scroll').evaluate((node) => node.scrollHeight > node.clientHeight), true, "history questions must have their own scroll surface");
  assert.equal(await page.locator('[data-action="build-checklist"]').first().isVisible(), true, "Build checklist must remain visible while editing a workup");
  assert.equal(await page.locator('[data-field="item-system"]').first().evaluate((node) => node.tagName), "SELECT");
  await page.fill("#workupCatalogSearch", "acute kidney");
  assert.equal(await page.locator('.workup-catalog-row:visible').count(), 1, "catalog search should narrow the displayed rail without rebuilding the editor");
  assert.match(await page.locator('.workup-catalog-row:visible').first().innerText(), /Acute kidney injury/i);
  assert.equal(await page.locator('.workup-catalog-row').filter({ hasText: "Abdominal pain" }).evaluate((node) => getComputedStyle(node).display), "none", "non-matching catalog rows must be removed from layout");
  assert.match(await page.locator('[data-workup-catalog-count]').innerText(), /1 of/);
  assert.equal(await page.locator("#workupCatalogSearch").evaluate((node) => document.activeElement === node), true, "catalog search should retain focus while filtering");
  await page.fill("#workupCatalogSearch", "zzzz-not-a-workup");
  assert.equal(await page.locator('[data-workup-catalog-empty]').isVisible(), true, "catalog search should explain when no workup matches");
  await page.click('[data-action="clear-workup-search"]');
  assert.equal(await page.locator("#workupCatalogSearch").inputValue(), "");
  assert.equal(await page.locator('.workup-catalog-row:visible').count() >= 52, true, "clearing the catalog search should restore the full list");
  const historyRows = page.locator('[data-workup-kind="history"] [data-workup-item-row]');
  const thirdHistoryText = await historyRows.nth(2).locator('[data-field="item-text"]').inputValue();
  await historyRows.nth(2).locator(".workup-drag-handle").dragTo(historyRows.nth(0).locator(".workup-drag-handle"));
  await page.waitForFunction(() => /Workup item order saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-workup-kind="history"] [data-workup-item-row]').first().locator('[data-field="item-text"]').inputValue(), thirdHistoryText);
  const secondHistoryText = await historyRows.nth(1).locator('[data-field="item-text"]').inputValue();
  await historyRows.nth(1).locator('[data-action="move-workup-item"][data-direction="up"]').click();
  await page.waitForFunction(() => /Workup item order saved/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-workup-kind="history"] [data-workup-item-row]').first().locator('[data-field="item-text"]').inputValue(), secondHistoryText);
  const workupOptionCount = await page.locator("#workupEditorSelect option").count();
  assert.equal(workupOptionCount >= 52, true, "the static Core 50 catalog and distinct foundation workups should be available without a separate import");
  assert.equal(await page.locator('#workupEditorSelect option[value="dyspnea"]').count(), 1);
  const currentWorkupId = await page.locator("#workupIdInput").inputValue();
  await page.locator(".workup-import summary").click();
  await page.fill("#workupJsonImport", JSON.stringify({
    schema: "prerounding_workup_v1",
    id: "scalp-infection",
    title: "Imported revision",
    aliases: ["replacement test"],
    items: [
      { id: "revision_history", kind: "history", system: "general", text: "Revision history", choices: ["No", "Yes"], select: "one" },
      { id: "revision_history_two", kind: "history", system: "general", text: "Revision history follow-up", choices: ["No", "Yes"], select: "one" },
      { id: "revision_exam", kind: "exam", system: "general", text: "Revision exam", choices: ["Normal", "Abnormal"], select: "one" },
      { id: "revision_exam_two", kind: "exam", system: "general", text: "Revision exam follow-up", choices: ["Normal", "Abnormal"], select: "one" }
    ]
  }));
  await page.click('[data-action="parse-workup-json"]');
  await page.waitForFunction(() => /Imported JSON replaced/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator("#workupIdInput").inputValue(), currentWorkupId);
  assert.equal(await page.locator("#workupEditorSelect option").count(), workupOptionCount);
  await page.selectOption("#workupThoroughness", "focused");
  await page.click('[data-action="copy-open-evidence-workup-prompt"]');
  const copiedWorkupPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copiedWorkupPrompt, /focused fast-rounds scope/i);
  assert.match(copiedWorkupPrompt, /consulted rhythm question/);
  // A successful "Parse & save" auto-collapses the import panel (its job is
  // done) - reopen it to paste a fresh draft for the OpenAI-formatting flow
  // below, same as a real user would.
  await page.locator(".workup-import summary").click();
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        output_text: JSON.stringify({
          schema: "prerounding_workup_v1",
          id: "api-workup",
          title: "API revision",
          aliases: ["automated"],
          items: [
            { id: "api_history", kind: "history", system: "general", text: "API history question", choices: ["No", "Yes"], select: "one" },
            { id: "api_history_two", kind: "history", system: "general", text: "API history follow-up", choices: ["No", "Yes"], select: "one" },
            { id: "api_history_three", kind: "history", system: "cardiovascular", text: "API cardiovascular history", choices: ["No", "Yes"], select: "one" },
            { id: "api_history_four", kind: "history", system: "respiratory", text: "API respiratory history", choices: ["No", "Yes"], select: "one" },
            { id: "api_exam", kind: "exam", system: "general", text: "API exam item", choices: ["Normal", "Abnormal"], select: "one" },
            { id: "api_exam_two", kind: "exam", system: "cardiovascular", text: "API cardiovascular exam", choices: ["Normal", "Abnormal"], select: "one" },
            { id: "api_exam_three", kind: "exam", system: "respiratory", text: "API respiratory exam", choices: ["Normal", "Abnormal"], select: "one" },
            { id: "api_exam_four", kind: "exam", system: "general", text: "API general exam follow-up", choices: ["Normal", "Abnormal"], select: "one" }
          ]
        })
      })
    });
  });
  await page.fill("#workupJsonImport", "History questions and physical exam items from a de-identified draft.");
  await page.check("#workupApiDeidConfirmed");
  assert.equal(await page.locator('[data-action="format-workup-json-api"]').isEnabled(), true);
  await page.click('[data-action="format-workup-json-api"]');
  await page.waitForFunction(() => /OpenAI formatted and loaded/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator('[data-workup-kind="history"] [data-field="item-text"]').first().inputValue(), "API history question");
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
  assert.equal(await page.locator('[data-action="share-phone-bundle"]').count(), 1, "desktop should offer native link sharing");
  assert.equal(await page.locator('[data-action="download-phone-bundle"]').count(), 1, "desktop should offer a file fallback");
  const checklistDownloadPromise = page.waitForEvent("download");
  await page.click('[data-action="download-phone-bundle"]');
  assert.equal((await checklistDownloadPromise).suggestedFilename(), "prerounding-checklist.bundle.json");

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
  assert.equal(await phonePage.locator("#phoneReturnBundle").count(), 0);
  await phonePage.click('[data-action="fill-all-negatives"]');
  assert.equal(await phonePage.locator("#phoneReturnBundle").count(), 0);
  await phonePage.click('[data-action="show-phone-return"]');
  await phonePage.waitForSelector("#phoneReturnBundle");
  assert.equal(await phonePage.locator('[data-action="share-phone-return"]').count(), 1, "phone should offer native file sharing");
  assert.equal(await phonePage.locator('[data-action="download-phone-return"]').count(), 1, "phone should offer a file fallback");
  const returnBundle = await phonePage.locator("#phoneReturnBundle").inputValue();
  await phonePage.close();

  const returnTransferFileJson = JSON.stringify({
    schema: "prerounding_phone_transfer_file_v1",
    type: "return",
    payload: returnBundle
  });

  await page.setInputFiles("#phoneReturnFileInput", {
    name: "prerounding-checklist-return.bundle.json",
    mimeType: "application/json",
    buffer: Buffer.from(returnTransferFileJson)
  });
  await page.waitForFunction(() => /Returned phone answers imported/.test(document.querySelector("#statusLine")?.textContent || ""));

  // An AirDropped return file's raw JSON contents (not just the short code)
  // pasted into the paste box must import correctly, same as the code alone.
  await page.evaluate(() => { document.querySelector("#statusLine").textContent = "Waiting for JSON import..."; });
  await page.fill("#phoneReturnText", returnTransferFileJson);
  await page.click('[data-action="import-phone-return"]');
  await page.waitForFunction(() => /Returned phone answers imported/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.evaluate(() => { document.querySelector("#statusLine").textContent = "Waiting for code import..."; });
  await page.fill("#phoneReturnText", returnBundle);
  await page.click('[data-action="import-phone-return"]');
  await page.waitForFunction(() => /Returned phone answers imported/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.click('[data-view-target="prompts"]');
  await page.waitForSelector("#promptOutputHighlighted");
  {
    const copied = await copiedPromptText();
    assert.match(copied, /Concise H&P Presentation/);
    assert.doesNotMatch(copied, /Privacy rules:/);
  }
  await page.locator("#promptPreview").fill("@");
  await page.waitForSelector("#smartVariableMenu.open");
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@admission-context" }).count(), 1);
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@admission-guidelines" }).count(), 1);
  await page.locator('#smartVariableMenu button.smart-variable-insert[data-token="@admission-guidelines"]').click();
  assert.equal(await page.locator("#promptPreview").inputValue(), "@admission-guidelines");

  // Regression test: the dropdown must actually narrow as the user keeps
  // typing after "@", and non-matching entries must be truly invisible (not
  // just marked hidden while a CSS rule silently keeps them on screen).
  await page.locator("#promptPreview").fill("@admission-c");
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll("#smartVariableMenu .smart-variable-row[data-token]")].filter((row) => !row.hidden);
    return visible.length === 1 && visible[0].dataset.token === "@admission-context";
  });
  assert.equal(await page.locator('#smartVariableMenu button[data-token="@admission-context"]').isVisible(), true);
  assert.equal(await page.locator('#smartVariableMenu button[data-token="@admission-guidelines"]').isVisible(), false);

  await page.locator("#promptPreview").fill("Use @admission-context");
  await page.waitForFunction(() => /PATIENT NAME/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  {
    const copied = await copiedPromptText();
    assert.match(copied, /PATIENT NAME/);
    assert.doesNotMatch(copied, /[\[\]{}<>()`]/);
  }
  await page.selectOption("#promptTaskSelect", "daily_progress_note");
  await page.waitForFunction(() => /Daily Progress Note Instructions/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "teaching_case_trajectory");
  await page.waitForFunction(() => /Teach the full case trajectory/i.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "medication_explainer_by_problem");
  await page.waitForFunction(() => /disease, condition, symptom/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "medication_safety_audit");
  await page.waitForFunction(() => /insufficient information/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));

  await page.click('[data-view-target="quickDeid"]');
  await page.waitForSelector("#quickDeidMode");
  await page.waitForSelector(".quick-model-control");
  await page.locator("#quickDeidMode").evaluate((node) => {
    node.value = "openmed-superclinical-small";
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.route("https://huggingface.co/Wismut/openmed-onnx/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.locator('[data-action="download-model-pack"][data-model-key="openmed-superclinical-small"]').click();
  await page.waitForSelector(".model-selection-message--error");
  assert.match(await page.locator(".model-selection-message--error").innerText(), /could not download config\.json/i);
  await page.unroute("https://huggingface.co/Wismut/openmed-onnx/**");
  assert.equal(await page.locator('#quickDeidMode option[value="openmed-superclinical"]').count(), 0, "unsupported large OpenMed must not remain selectable");
  assert.equal(await page.locator('#quickDeidMode option[value="openmed-superclinical-small"]').count(), 1);
  assert.equal(await page.locator('#quickDeidMode option[value="gliner-multi-pii"]').count(), 1);
  const modelPackFixture = await page.evaluate(async () => {
    const options = await import("/src/patient-context/deid-model-options.js");
    const storage = await import("/src/patient-context/model-pack-storage.js");
    const option = options.deidModelOptionByKey("openmed-superclinical-small");
    const service = await storage.ensureModelPackServiceWorker();
    const entries = option.requiredFiles.map((path) => ({
      path: `small/${path}`,
      file: new File([`fixture:${path}`], path.split("/").at(-1), { type: "application/octet-stream" })
    }));
    await storage.importModelPack(option, entries);
    const state = await storage.getModelPackState(option);
    const response = await fetch("/__prerounding-models/Wismut/openmed-onnx/small/onnx/model_int8.onnx");
    await storage.removeModelPack(option);
    return { ready: service.ready, state: state.state, response: response.status };
  });
  assert.deepEqual(modelPackFixture, { ready: true, state: "installed", response: 200 });
  await page.selectOption("#quickDeidMode", "structured");
  assert.equal(await page.locator("#quickDeidMode").inputValue(), "structured");
  await page.fill("#quickDeidInput", "Jane Patient MRN 123456 was evaluated by Dr. Smith.");
  await page.click('[data-action="run-quick-deid"]');
  await page.waitForSelector("#quickDeidReviewDocument");
  assert.equal(await page.locator('[data-action="set-quick-review-mode"]').count(), 0, "correction must use one workspace rather than a separate review queue");
  assert.equal(await page.locator("#quickDeidInput").count(), 0, "the active review should use one annotated document instead of retaining the source editor");
  assert.equal(await page.locator("#quickDeidOutput").count(), 0, "the active review should not render a second output textarea");
  assert.equal(await page.locator('[data-action="confirm-all-quick-redactions"]').count(), 1, "the review should offer one action to accept all remaining model detections");
  assert.match(await page.locator("#quickDeidContent .quick-redaction-review").innerText(), /Redaction \d+ of \d+/);
  const quickFirstToken = page.locator("#quickDeidContent .redaction-change").first();
  await quickFirstToken.hover();
  assert.match(await quickFirstToken.getAttribute("data-original"), /Jane|Patient|123456/);
  const quickTokenLayout = await quickFirstToken.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { display: style.display, minHeight: style.minHeight, height: rect.height, lineHeight: parseFloat(style.lineHeight) };
  });
  assert.equal(quickTokenLayout.display, "inline", "redaction choices should remain inline with surrounding document text");
  assert.equal(quickTokenLayout.minHeight, "0px", "inline redaction choices must not inherit the global button height");
  assert.equal(quickTokenLayout.height <= quickTokenLayout.lineHeight * 1.5, true, "inline redaction choices must not add a large blank block");
  assert.equal(await page.locator("#quickDeidContent .redaction-change del").count() > 0, true, "the original should be crossed out inline beside the replacement");
  await page.click('[data-action="confirm-quick-redaction"]');
  const acceptedQuickToken = page.locator("#quickDeidContent .redaction-change--confirmed").first();
  assert.equal(await acceptedQuickToken.locator("del").count(), 0, "an accepted redaction must no longer expose the memory-only original inline");
  assert.equal(await acceptedQuickToken.locator("mark").count(), 1, "an accepted redaction should remain visibly highlighted as the safe replacement");
  assert.equal(await acceptedQuickToken.getAttribute("data-original"), null, "accepted redactions must not retain the original in a DOM attribute");
  await acceptedQuickToken.click();
  await page.waitForSelector('[data-action="restore-quick-non-phi"]');
  assert.match(await page.locator("#quickDeidContent .quick-redaction-review").innerText(), /Accepted redaction/);
  assert.equal(await page.locator('[data-action="confirm-quick-redaction"]').count(), 0, "an accepted redaction should offer undo rather than another confirmation");
  const pendingQuickToken = page.locator("#quickDeidContent .redaction-change:not(.redaction-change--confirmed)").first();
  await pendingQuickToken.click();
  const restoredQuickOriginal = await pendingQuickToken.getAttribute("data-original");
  await page.click('[data-action="restore-quick-non-phi"]');
  assert.match(await page.locator("#quickDeidReviewDocument").innerText(), new RegExp(restoredQuickOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.click('[data-action="start-new-quick-deid"]');
  await page.selectOption("#quickDeidMode", "structured");
  await page.fill("#quickDeidInput", "The patient is a mayor in the local community.");
  await page.click('[data-action="run-quick-deid"]');
  await page.waitForSelector('[data-action="dismiss-quick-warning"]');
  await page.locator("#quickDeidReviewDocument").evaluate((node) => {
    const textNode = [...node.querySelectorAll(".redaction-document-text")].find((candidate) => candidate.textContent.includes("patient"))?.firstChild;
    const start = textNode?.textContent.indexOf("patient") ?? -1;
    if (!textNode || start < 0) throw new Error("Could not select the test identifier.");
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + "patient".length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.click('[data-action="manual-redact-quick-selection"]');
  assert.equal(await page.locator("#quickDeidContent .redaction-change--confirmed mark").filter({ hasText: "[MANUAL REDACTION]" }).count(), 1, "a manual redaction is accepted immediately and should display only its safe highlighted replacement");
  await page.click('[data-action="dismiss-quick-warning"]');
  assert.match(await page.locator("#quickDeidContent .quick-redaction-review").innerText(), /Review complete|Flag \d+ of \d+/);

  await page.click('[data-view-target="daily"]');
  await page.click('[data-view-target="quickDeid"]');
  assert.equal(await page.locator("#quickDeidInput").inputValue(), "");
  assert.equal(await page.locator("#quickDeidOutput").count(), 0, "leaving Quick De-ID must clear the correction workspace, including its transient output pane");
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
  await page.waitForFunction(() => /No patients yet/.test(document.querySelector("#vaultContent")?.textContent || ""));
  await page.click('[data-view-target="daily"]');
  assert.match(await page.locator("#dailyContent").innerText(), /unlock the vault and add a patient/i, "Hospital Stay must clear when the roster is empty");
  await page.click('[data-view-target="workups"]');
  assert.match(await page.locator("#workupsContent").innerText(), /unlock the vault and add a patient/i, "Workups must clear when the roster is empty");
  await page.click('[data-view-target="checklist"]');
  assert.match(await page.locator("#checklistContent").innerText(), /unlock the vault and add a patient/i, "Checklist must clear when the roster is empty");

  await page.click('[data-action="lock-vault"]');
  await page.waitForFunction(() => /Vault locked/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.waitForSelector("#vaultContent .locked-vault-shell");
  assert.equal(await page.locator(".side-nav").isHidden(), true);
  assert.equal(await page.locator(".top-bar").isHidden(), true);
  assert.equal(await page.locator("#dailyContent").innerHTML(), "");
  assert.equal(await page.locator("#workupsContent").innerHTML(), "");
  await page.locator('[data-view-target="daily"]').evaluate((node) => node.click());
  assert.equal(await page.locator("#vaultContent .locked-vault-shell").count(), 1);
  await page.click('[data-action="request-delete-vault"]');
  await page.waitForFunction(() => document.querySelector("#deleteVaultConfirmDialog")?.open === true);
  assert.equal(await page.locator("#confirmDeleteVaultButton").isDisabled(), true);
  await page.fill("#deleteVaultConfirmation", "DELETE");
  assert.equal(await page.locator("#confirmDeleteVaultButton").isEnabled(), true);
  await page.click('[data-action="confirm-delete-vault"]');
  await page.waitForFunction(() => /Vault deleted from this browser/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.match(await page.locator("#vaultPassphrase").getAttribute("placeholder"), /Create local vault/);

  assert.deepEqual(backendRequests, []);
  assert.deepEqual(externalModelRequests, [
    "https://huggingface.co/Wismut/openmed-onnx/resolve/763dff8d32cc23ff045dd396221f8be62cb1ca03/small/config.json"
  ], "the only external model request must be the explicitly-clicked, pinned OpenMed Small download");
  assert.deepEqual(
    consoleErrors.filter((message) => !/503 \(Service Unavailable\)/.test(message)),
    [],
    "apart from the deliberately intercepted failed OpenMed download, the browser flow must stay console-clean"
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("local-first browser workflow tests passed");
