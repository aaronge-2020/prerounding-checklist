import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
let failProgressPromptRefresh = false;
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
    if (failProgressPromptRefresh && url.pathname.endsWith("/prompts/Guidelines-progress.md") && url.searchParams.has("prompt-refresh")) {
      response.writeHead(503);
      response.end("unavailable");
      return;
    }
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
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();
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
  assert.equal(await page.locator('[data-action="add-admission-source"]').isDisabled(), true, "adding an admission source requires a pasted chart block");
  await page.selectOption("#deidModeSelect", "structured");
  await page.fill("#admissionSourceDraft", "Source ready for local de-identification.");
  assert.equal(await page.locator('[data-action="add-admission-source"]').isEnabled(), true, "the add action must become available without a separate model-loading trip");
  await page.fill("#admissionSourceDraft", "");

  await page.click('[data-view-target="settings"]');
  await page.waitForSelector("#guidelineSearchInput");
  assert.equal(await page.locator('[data-action="export-vault"]').filter({ hasText: "Export Vault Backup" }).count(), 1);
  assert.equal(await page.locator('.guideline-row', { hasText: "Team preferences" }).count(), 1);
  const guidelineRowsFit = await page.locator(".guideline-row").evaluateAll((rows) => rows.every((row) => {
    const cardBounds = row.getBoundingClientRect();
    const headerBounds = row.getBoundingClientRect();
    const toggleBounds = row.querySelector(".guideline-row-open")?.getBoundingClientRect();
    return Boolean(headerBounds && toggleBounds)
      && headerBounds.left >= cardBounds.left
      && headerBounds.right <= cardBounds.right
      && toggleBounds.left >= cardBounds.left
      && toggleBounds.right <= cardBounds.right;
  }));
  assert.equal(guidelineRowsFit, true, "each guideline row must keep its controls inside the card");
  await page.locator(".guideline-row .token-color-swatch").first().click();
  assert.equal(await page.locator('#tokenColorPicker input[type="color"]').count(), 1);
  assert.equal(await page.locator("#tokenColorPicker").isVisible(), true);
  await page.locator('[data-action="cancel-token-color"]').click();
  assert.equal(await page.locator("#newGuidelineSetNameInput").count(), 0, "the toolbar must not contain a name field");
  await page.fill("#guidelineSearchInput", "admission");
  const admissionLabels = await page.locator(".guideline-row strong").allTextContents();
  assert.ok(admissionLabels.length > 0, "search should return named admission guidelines");
  assert.equal(admissionLabels.every((label) => label.toLowerCase().includes("admission")), true, "search should exclude rows that only mention admission in their body text");
  await page.fill("#guidelineSearchInput", "team preferences");
  await page.waitForFunction(() => document.querySelectorAll(".guideline-row").length === 1);
  await page.fill("#guidelineSearchInput", "");
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
  assert.equal(await page.locator(".guideline-row code", { hasText: "@admission-guidelines" }).count(), 1);
  assert.equal(await page.locator(".guideline-row code", { hasText: "@progress-guidelines" }).count(), 1);
  await page.click('[data-action="create-guideline-set"]');
  await page.waitForSelector("#guidelineCreateLabel");
  assert.equal(await page.locator(".guideline-editor h2").innerText(), "New guideline");
  await page.fill("#guidelineCreateLabel", "Discharge summary");
  await page.fill("#guidelineCreateText", "Summarize the admission, hospital course, and discharge plan.");
  await page.click('[data-action="save-new-guideline-set"]');
  await page.waitForFunction(() => /Discharge summary/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.click('[data-action="create-guideline-set"]');
  await page.fill("#guidelineCreateLabel", "Temporary bulk delete");
  await page.click('[data-action="save-new-guideline-set"]');
  await page.waitForFunction(() => /Temporary bulk delete/.test(document.body.textContent || ""));
  const temporaryGuideline = page.locator('.guideline-row', { hasText: "Temporary bulk delete" });
  await temporaryGuideline.locator(".guideline-select").check();
  await page.click('[data-action="delete-selected-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#removeGuidelineSetConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-remove-guideline-set"]');
  await page.waitForFunction(() => !document.querySelector('.guideline-row')?.textContent?.includes("Temporary bulk delete"));
  assert.match(await page.locator("#statusLine").innerText(), /Deleted \d+ guidelines?/);

  const admissionGuideline = page.locator('.guideline-row', { hasText: "Admission" }).filter({ has: page.locator('code', { hasText: "@admission-guidelines" }) });
  const admissionGuidelineId = await admissionGuideline.getAttribute("data-guideline-id");
  await admissionGuideline.locator(".guideline-row-open").click();
  await page.fill(`#guidelineSetText-${admissionGuidelineId}`, "LOCAL ADMISSION EDIT TO REPLACE");
  await page.click(`[data-action="save-guideline-set"][data-guideline-set-id="${admissionGuidelineId}"]`);
  await page.click('[data-action="request-refresh-default-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#refreshDefaultGuidelinesConfirmDialog")?.open === true);
  assert.match(await page.locator("#refreshDefaultGuidelinesConfirmDialog").innerText(), /Team preferences and custom guidelines remain unchanged/i);
  await page.click('#refreshDefaultGuidelinesConfirmDialog button[value="cancel"]');
  await page.waitForFunction(() => document.querySelector("#refreshDefaultGuidelinesConfirmDialog")?.open === false);
  assert.equal(await page.locator(`#guidelineSetText-${admissionGuidelineId}`).inputValue(), "LOCAL ADMISSION EDIT TO REPLACE", "cancel must preserve the local built-in edit");
  await page.route("**/prompts/Guidelines-admission.md?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.click('[data-action="request-refresh-default-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#refreshDefaultGuidelinesConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-refresh-default-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#confirmRefreshDefaultGuidelinesButton")?.disabled === true);
  await page.waitForFunction(() => /Built-in prompts updated from this site/.test(document.querySelector("#statusLine")?.textContent || ""));
  await page.unroute("**/prompts/Guidelines-admission.md?**");
  assert.equal(await page.locator('.guideline-row', { hasText: "Discharge summary" }).count(), 1, "refresh must preserve custom guidelines");
  const refreshedAdmission = page.locator('.guideline-row', { hasText: "Admission" }).filter({ has: page.locator('code', { hasText: "@admission-guidelines" }) });
  await refreshedAdmission.locator(".guideline-row-open").click();
  assert.doesNotMatch(await page.locator(`#guidelineSetText-${admissionGuidelineId}`).inputValue(), /LOCAL ADMISSION EDIT TO REPLACE/);
  await page.fill(`#guidelineSetText-${admissionGuidelineId}`, "LOCAL EDIT THAT MUST SURVIVE A FAILED REFRESH");
  await page.click(`[data-action="save-guideline-set"][data-guideline-set-id="${admissionGuidelineId}"]`);
  failProgressPromptRefresh = true;
  await page.click('[data-action="request-refresh-default-guidelines"]');
  await page.waitForFunction(() => document.querySelector("#refreshDefaultGuidelinesConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-refresh-default-guidelines"]');
  await page.waitForFunction(() => /No local prompts were changed/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator(`#guidelineSetText-${admissionGuidelineId}`).inputValue(), "LOCAL EDIT THAT MUST SURVIVE A FAILED REFRESH");
  await page.click('#refreshDefaultGuidelinesConfirmDialog button[value="cancel"]');
  failProgressPromptRefresh = false;
  await page.click('[data-action="request-refresh-default-guidelines"]');
  await page.click('[data-action="confirm-refresh-default-guidelines"]');
  await page.waitForFunction(() => /Built-in prompts updated from this site/.test(document.querySelector("#statusLine")?.textContent || ""));

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
  const dischargeCardAgain = page.locator(".guideline-row", { hasText: "Discharge summary" });
  const dischargeIdAgain = await dischargeCardAgain.getAttribute("data-guideline-id");
  await dischargeCardAgain.locator('.guideline-row-open').click();
  await page.click(`[data-action="request-remove-guideline-set"][data-guideline-set-id="${dischargeIdAgain}"]`);
  await page.waitForFunction(() => document.querySelector("#removeGuidelineSetConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-remove-guideline-set"]');
  await page.waitForFunction(() => /Guideline set deleted/.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.equal(await page.locator(".guideline-row", { hasText: "Discharge summary" }).count(), 0);

  await page.click('[data-view-target="prompts"]');
  await page.waitForSelector("#promptOutputHighlighted");
  await page.selectOption("#promptTaskSelect", "preround_bedside_exam");
  const selectedDayPreviewToken = page.locator('#promptOutputHighlighted button.var-fill[data-token="@selected-day"]');
  assert.equal(await selectedDayPreviewToken.count(), 1, "selected-day must render as one clickable preview target");
  await page.evaluate(() => { document.querySelector("#promptOutputHighlighted").scrollTop = 0; });
  await selectedDayPreviewToken.click();
  await page.waitForFunction(() => document.querySelector("#promptOutputHighlighted")?.scrollTop > 0);
  {
    const copied = await copiedPromptText();
    assert.doesNotMatch(copied, /Write for the Primary team|Consult service|consulted rhythm question/);
  }
  await page.click('[data-view-target="daily"]');
  await page.fill("#dailyAdmissionDateInput", "2026-07-17");
  const addAdmissionCapture = async (sourceKind, text) => {
    const previousCount = await page.locator("#contextSections .section-editor").count();
    await page.click(`[data-action="select-admission-source-kind"][data-source-kind="${sourceKind}"]`);
    await page.fill("#admissionSourceDraft", text);
    await page.click('[data-action="add-admission-source"]');
    await page.waitForFunction((count) => document.querySelectorAll("#contextSections .section-editor").length === count + 1, previousCount);
  };
  await addAdmissionCapture("primary_note", "Jane Patient MRN 123456 admitted with dyspnea.");
  await addAdmissionCapture("medication_activity", "Furosemide 40 mg PO daily. Lisinopril 10 mg PO daily. Reconciled by Dr. Alice Smith.");
  await addAdmissionCapture("results", "Creatinine 1.4 today.");
  await addAdmissionCapture("bedside_update", "AM Labs reviewed with the team.");
  assert.equal(await page.locator("#contextSections .section-editor").count(), 4);
  assert.equal(await page.locator("#contextSections .section-editor").first().locator(".section-role").count(), 1, "admission fields must retain a controlled purpose");
  await page.waitForFunction(() => document.querySelector("#contextSections")?.textContent.includes("[MRN]"));
  await page.waitForSelector("#contextSections .redaction-review");
  assert.equal(await page.locator("#contextSections .section-editor").nth(0).evaluate((node) => node.classList.contains("is-expanded")), true, "the first pending review field should remain open as sources are added");
  const residualWarning = page.locator('#residualWarnings-context .residual-warning').first();
  if (await residualWarning.count()) {
    await residualWarning.click();
    assert.equal(await page.evaluate(() => window.getSelection()?.toString()), "AM Labs", "residual review should select the flagged phrase in its own field");
  }
  const dismissContextWarnings = page.locator('#residualWarnings-context [data-action="dismiss-section-warning"]');
  while (await dismissContextWarnings.count()) await dismissContextWarnings.first().click();
  assert.equal(await page.locator("#residualWarnings-context").count(), 0, "dismissing every residual warning should remove the warning panel");
  await page.locator("#contextSections [data-action=\"edit-section-text\"]").first().click();
  assert.equal(await page.locator("#contextSections .section-editor").nth(0).locator(".section-text").isVisible(), true, "a saved field must remain editable");
  await page.locator("#contextSections [data-action=\"resume-section-review\"]").first().click();
  await page.waitForSelector("#contextSections .redaction-review");
  assert.equal(await page.locator("#contextSections .redaction-change").count() > 0, true);
  await page.locator("#contextSections .redaction-change").first().click();
  assert.match(await page.locator("#contextSections [data-redaction-document]").first().innerText(), /\[PATIENT NAME\]|\[MRN\]/);
  assert.equal(await page.evaluate(() => Object.values(localStorage).join(" ").includes("Jane Patient")), false);
  await page.click('#contextSections [data-action="keep-reviewed-redaction"]');
  const acceptedContextToken = page.locator("#contextSections .redaction-change--confirmed").first();
  assert.equal(await acceptedContextToken.locator("del").count(), 0, "Hospital Stay should also hide an accepted original");
  assert.equal(await acceptedContextToken.locator("mark").count(), 1, "Hospital Stay should retain the safe replacement as a clickable highlight");
  assert.equal(await acceptedContextToken.getAttribute("data-original"), null, "Hospital Stay must not leave an accepted original in the DOM");
  assert.equal(await page.locator("#contextSections .section-editor").nth(1).evaluate((node) => node.classList.contains("is-expanded")), true, "finishing one field should advance into the next field without closing review");
  const activeContextEditor = page.locator("#contextSections .section-editor.is-expanded");
  assert.equal(await activeContextEditor.count(), 1, "only the active review field should remain expanded");
  await activeContextEditor.locator("[data-redaction-document]").evaluate((node) => {
    const textNode = [...node.querySelectorAll(".redaction-document-text")]
      .map((candidate) => candidate.firstChild)
      .find((candidate) => /[A-Za-z]{3,}/.test(candidate?.textContent || ""));
    const match = textNode?.textContent.match(/[A-Za-z]{3,}/);
    const start = match?.index ?? -1;
    if (!textNode || start < 0 || !match) throw new Error("Could not select unmarked text in the active review field.");
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + match[0].length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await activeContextEditor.locator('[data-action="manual-redact-selection"]').click();
  await page.waitForFunction(() => /Selected text marked for manual redaction/.test(document.querySelector("#statusLine")?.textContent || ""));

  await page.click('[data-view-target="daily"]');
  await page.fill("#newDayDate", "2026-07-09");
  await page.fill("#newDayLabel", "Hospital day 1");
  await page.click('[data-action="add-day"]');
  await page.waitForSelector('[data-action="select-daily-source-kind"]');
  assert.equal(await page.locator('[data-action="select-daily-source-kind"]').count(), 7, "Hospital Stay should include the selected-day physical exam alongside the broad Epic source choices");
  await page.fill("#dailySourceDraft", "Overnight oxygen requirement improved.");
  await page.click('[data-action="add-daily-source"]');
  await page.waitForSelector("#dailySources .source-capture-editor");
  assert.match(await page.locator("#dailySources .source-capture-editor").first().innerText(), /Primary team note/);
  await page.click('[data-action="select-daily-source-kind"][data-source-kind="results"]');
  await page.fill("#dailySourceDraft", "Repeat creatinine 1.3.");
  await page.click('[data-action="add-daily-source"]');
  await page.waitForFunction(() => document.querySelectorAll("#dailySources .source-capture-editor").length === 2);
  assert.match(await page.locator("#dailySources .source-capture-editor").nth(1).innerText(), /Results/);
  assert.match(await page.locator(".packet-check").innerText(), /Included[\s\S]*Primary team note, Results/);
  assert.match(await page.locator(".packet-check").innerText(), /Not supplied[\s\S]*Medication activity, Bedside update/);
  assert.equal(await page.locator('[data-action="open-progress-note"]').isEnabled(), true);

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
  assert.match(copiedWorkupPrompt, /Primary team note\. Overnight oxygen requirement improved/);
  assert.match(copiedWorkupPrompt, /Results\. Repeat creatinine 1\.3/);
  // A successful "Parse & save" auto-collapses the import panel (its job is
  // done) - reopen it to paste a fresh draft for the OpenAI-formatting flow
  // below, same as a real user would.
  await page.locator(".workup-import summary").click();
  let openAiFormatRequestCount = 0;
  await context.route("**/v1/responses", async (route) => {
    openAiFormatRequestCount += 1;
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
  await page.waitForTimeout(1_000);
  assert.equal(openAiFormatRequestCount, 1, await page.locator("#statusLine").innerText());
  await page.waitForFunction(() => /OpenAI formatted and loaded|OpenAI request failed|Unable|invalid/i.test(document.querySelector("#statusLine")?.textContent || ""));
  assert.match(await page.locator("#statusLine").innerText(), /OpenAI formatted and loaded/);
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
  await page.selectOption("#promptTaskSelect", "initial_admission_rounds");
  {
    const copied = await copiedPromptText();
    assert.match(copied, /Admission H&P [^\r\n]*Instructions/);
    assert.doesNotMatch(copied, /Privacy rules:/);
  }
  await page.locator("#promptPreview").fill("@");
  await page.waitForSelector("#smartVariableMenu.open");
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@admission-primary-team-note" }).count(), 1);
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@admission-guidelines" }).count(), 1);
  assert.equal(await page.locator("#smartVariableMenu").filter({ hasText: "@team-preferences" }).count(), 1);
  await page.locator('#smartVariableMenu button.smart-variable-insert[data-token="@admission-guidelines"]').click();
  assert.equal(await page.locator("#promptPreview").inputValue(), "@admission-guidelines");

  // Regression test: the dropdown must actually narrow as the user keeps
  // typing after "@", and non-matching entries must be truly invisible (not
  // just marked hidden while a CSS rule silently keeps them on screen).
  await page.locator("#promptPreview").fill("@admission-p");
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll("#smartVariableMenu .smart-variable-row[data-token]")].filter((row) => !row.hidden);
    return visible.length === 3
      && visible.some((row) => row.dataset.token === "@admission-packet")
      && visible.some((row) => row.dataset.token === "@admission-primary-team-note")
      && visible.some((row) => row.dataset.token === "@admission-physical-exam");
  });
  assert.equal(await page.locator('#smartVariableMenu button.smart-variable-insert[data-token="@admission-primary-team-note"]').isVisible(), true);
  assert.equal(await page.locator('#smartVariableMenu button.smart-variable-insert[data-token="@admission-guidelines"]').isVisible(), false);

  // Regression: a caret at index 0 is valid. Removing a leading variable must
  // inspect only the text before that caret, rather than finding a later token
  // and incorrectly keeping the menu open.
  await page.locator("#promptPreview").fill("@selected-day-physical-exam\\nUse @admission-primary-team-note");
  await page.locator("#promptPreview").press("Control+Home");
  await page.locator("#promptPreview").press("Delete");
  assert.equal(await page.locator("#smartVariableMenu").isVisible(), false);

  await page.locator("#promptPreview").fill("Use @admission-primary-team-note");
  await page.waitForFunction(() => /PATIENT NAME/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  {
    const preview = await page.locator("#promptOutputHighlighted").textContent();
    const copied = await copiedPromptText();
    assert.equal(copied, preview, "Copy prompt must use the exact text shown in the generated prompt preview");
    assert.match(copied, /PATIENT NAME/);
  }
  await page.selectOption("#promptTaskSelect", "daily_progress_note");
  await page.waitForFunction(() => /Daily Progress Note [^\r\n]*Instructions/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "teaching_case_trajectory");
  await page.waitForFunction(() => /clinical teacher producing a concise rounds teaching snippet/i.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "medication_explainer_by_problem");
  await page.waitForFunction(() => /condition, symptom, or clinical purpose/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));
  await page.selectOption("#promptTaskSelect", "medication_safety_audit");
  await page.waitForFunction(() => /insufficient information/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));

  // The presentation editor is an optional insertion surface: its own grid
  // row must stay clear of the template editor, and clinicians may copy the
  // instructions when they plan to supply their presentation directly in the
  // destination chat.
  await page.selectOption("#promptTaskSelect", "presentation_quality_editor");
  await page.waitForSelector("#presentationToEdit");
  assert.equal(await page.locator('[data-action="copy-prompt"]').isEnabled(), true);
  assert.equal(await page.locator("#presentationToEdit").evaluate((node) => {
    const presentation = node.getBoundingClientRect();
    const template = document.querySelector("#promptPreview")?.getBoundingClientRect();
    return Boolean(template) && presentation.bottom <= template.top;
  }), true);
  {
    const copied = await copiedPromptText();
    assert.match(copied, /Return only the fully revised presentation/);
    assert.doesNotMatch(copied, /No presentation was pasted/);
  }
  await page.locator("#presentationToEdit").fill("One-Liner\nDe-identified presentation supplied in the editor.");
  await page.waitForFunction(() => /De-identified presentation supplied in the editor/.test(document.querySelector("#promptOutputHighlighted")?.textContent || ""));

  await page.click('[data-view-target="quickDeid"]');
  await page.waitForSelector("#quickDeidMode");
  await page.waitForSelector(".quick-model-control");
  assert.equal(await page.locator('#quickDeidMode option[value="openmed-superclinical"]').count(), 0, "unsupported large OpenMed must not remain selectable");
  assert.equal(await page.locator('#quickDeidMode option[value="openmed-superclinical-small"]').count(), 1);
  assert.equal(await page.locator('#quickDeidMode option[value="gliner-multi-pii"]').count(), 1);
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
  await page.waitForFunction(() => document.querySelectorAll(".day-row").length === 3);
  await page.click('[data-action="remove-day"]');
  await page.waitForFunction(() => document.querySelector("#removeDayConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-remove-day"]');
  await page.waitForFunction(() => document.querySelectorAll(".day-row").length === 2);

  await page.click('[data-view-target="vault"]');
  await page.click('[data-action="archive-patient"]');
  await page.waitForFunction(() => document.querySelector("#archiveConfirmDialog")?.open === true);
  await page.click('[data-action="confirm-archive-patient"]');
  await page.waitForFunction(() => /No patients yet|No patient added/.test(document.querySelector("#vaultContent")?.textContent || ""));
  await page.click('[data-view-target="daily"]');
  assert.match(await page.locator("#dailyContent").innerText(), /unlock the vault and add a patient/i, "Hospital Stay must clear when the roster is empty");
  await page.click('[data-view-target="workups"]');
  assert.match(await page.locator("#workupsContent").innerText(), /unlock the vault and add a patient/i, "Workups must clear when the roster is empty");
  await page.click('[data-view-target="checklist"]');
  assert.match(await page.locator("#checklistContent").innerText(), /unlock the vault and add a patient/i, "Checklist must clear when the roster is empty");

  await page.click('[data-view-target="vault"]');
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
  assert.equal(await page.locator("#vaultPassphrase").getAttribute("placeholder"), "At least 12 characters");

  assert.deepEqual(backendRequests, []);
  assert.deepEqual(externalModelRequests, [], "ordinary app and prompt-refresh workflows must make no external model requests");
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
