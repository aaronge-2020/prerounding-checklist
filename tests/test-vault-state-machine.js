import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const vaultMetaKey = "prerounding-local-vault-meta-v2";
const vaultDataKey = "prerounding-local-vault-data-v1";
const legacyStateKey = "prerounding-redesign-state-v1";
const legacyMetaKey = "prerounding-local-vault-meta-v1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(root, `.${relative}`);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function openFreshPage(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html?fresh=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForSelector("#vaultAccessView", { state: "visible" });
  return { context, page };
}

async function storageSnapshot(page) {
  return page.evaluate(() => {
    const result = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      result[key] = localStorage.getItem(key);
    }
    return result;
  });
}

function joinedStorage(snapshot) {
  return Object.entries(snapshot).map(([key, value]) => `${key}:${value}`).join("\n");
}

async function waitForEncryptedSave(page) {
  await page.waitForFunction(
    ([dataKey]) => {
      const value = localStorage.getItem(dataKey);
      if (!value) return false;
      try {
        const parsed = JSON.parse(value);
        return Boolean(parsed.iv && parsed.ciphertext);
      } catch {
        return false;
      }
    },
    [vaultDataKey]
  );
  await page.waitForTimeout(250);
}

async function expandPatientRoster(page) {
  const expanded = await page.evaluate(() => document.body.dataset.patientRoster === "expanded");
  if (expanded) return;
  await page.click("#sidebarPatientRosterButton");
  await page.waitForFunction(() => document.body.dataset.patientRoster === "expanded");
}

async function testSinglePatientNoPersistence(browser, baseUrl) {
  const { context, page } = await openFreshPage(browser, baseUrl);
  await page.waitForSelector("#createVaultSection:not([hidden])");
  const openHidden = await page.locator("#openVaultSection").evaluate((node) => node.hidden);
  assert(openHidden, "No-vault boot should hide the login form and direct the user to create a vault.");
  const desktopPhoneEntryHidden = await page.locator("#phoneBundleEntrySection").evaluate((node) => node.hidden || getComputedStyle(node).display === "none");
  assert(desktopPhoneEntryHidden, "Desktop vault entry should not show the phone-only bedside bundle loader.");

  const serviceAudit = await page.evaluate(() => {
    const select = document.querySelector("#newVaultServiceSelect");
    const pickerInput = document.querySelector("#newVaultServicePickerInput");
    const pickerList = document.querySelector("#newVaultServicePickerList");
    const customField = document.querySelector("[data-service-custom-field='newVault']");
    const customInput = document.querySelector("#newVaultCustomServiceInput");
    const initial = {
      options: Array.from(select?.options || []).map((option) => option.textContent),
      nativeVisible: (() => {
        const rect = select?.getBoundingClientRect();
        return Boolean(rect && rect.width > 2 && rect.height > 2 && getComputedStyle(select).opacity !== "0");
      })(),
      pickerValue: pickerInput?.value || "",
      pickerListHidden: Boolean(pickerList?.hidden),
      customHidden: Boolean(customField?.hidden),
      customDisabled: Boolean(customInput?.disabled),
      customRequired: Boolean(customInput?.required)
    };
    select.value = "custom";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const custom = {
      customHidden: Boolean(customField?.hidden),
      customDisabled: Boolean(customInput?.disabled),
      customRequired: Boolean(customInput?.required)
    };
    select.value = "primary_medicine";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const reset = {
      customHidden: Boolean(customField?.hidden),
      customDisabled: Boolean(customInput?.disabled),
      customRequired: Boolean(customInput?.required),
      pickerValue: pickerInput?.value || ""
    };
    return { initial, custom, reset };
  });
  assert(serviceAudit.initial.options.includes("Primary medicine team"), `Service dropdown should include default options: ${JSON.stringify(serviceAudit)}`);
  assert(serviceAudit.initial.options.includes("Cardiology consult service") && serviceAudit.initial.options.includes("Nephrology consult service") && serviceAudit.initial.options.length >= 18, `Service picker should include common team options: ${JSON.stringify(serviceAudit)}`);
  assert(serviceAudit.initial.options.includes("My service is not listed"), `Service dropdown should include a not-listed escape hatch: ${JSON.stringify(serviceAudit)}`);
  assert(!serviceAudit.initial.nativeVisible && /Primary medicine team/.test(serviceAudit.initial.pickerValue), `Native service select should be hidden behind the searchable picker: ${JSON.stringify(serviceAudit)}`);
  assert(serviceAudit.initial.customHidden && serviceAudit.initial.customDisabled && !serviceAudit.initial.customRequired, `Custom service should be inactive by default: ${JSON.stringify(serviceAudit)}`);
  assert(!serviceAudit.custom.customHidden && !serviceAudit.custom.customDisabled && serviceAudit.custom.customRequired, `Custom service should activate only when not-listed is selected: ${JSON.stringify(serviceAudit)}`);
  assert(serviceAudit.reset.customHidden && serviceAudit.reset.customDisabled && !serviceAudit.reset.customRequired && /Primary medicine team/.test(serviceAudit.reset.pickerValue), `Custom service should hide again after returning to a listed service: ${JSON.stringify(serviceAudit)}`);

  await page.fill("#newVaultServicePickerInput", "endo");
  await page.waitForSelector('#newVaultServicePickerList [data-service-id="endocrine_consult"]');
  const pickerSearchAudit = await page.evaluate(() => {
    const input = document.querySelector("#newVaultServicePickerInput");
    const list = document.querySelector("#newVaultServicePickerList");
    const option = document.querySelector('#newVaultServicePickerList [data-service-id="endocrine_consult"]');
    const inputRect = input?.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    return {
      expanded: input?.getAttribute("aria-expanded"),
      listHidden: Boolean(list?.hidden),
      optionText: option?.textContent || "",
      opensDown: Boolean(inputRect && listRect && listRect.top >= inputRect.bottom)
    };
  });
  assert(pickerSearchAudit.expanded === "true" && !pickerSearchAudit.listHidden && /Endocrine consult service/.test(pickerSearchAudit.optionText) && pickerSearchAudit.opensDown, `Service picker should search and open downward: ${JSON.stringify(pickerSearchAudit)}`);
  await page.click('#newVaultServicePickerList [data-service-id="endocrine_consult"]');
  await page.waitForFunction(() => document.querySelector("#newVaultServiceSelect")?.value === "endocrine_consult");
  await page.evaluate(() => {
    const select = document.querySelector("#newVaultServiceSelect");
    select.value = "primary_medicine";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.click("#singlePatientWorkflowButton");
  await page.waitForSelector("#appShell", { state: "visible" });
  await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  await page.fill("#admitPatientLabelInput", "Temporary Alpha");
  await page.fill("#admitPatientConcernInput", "chest pain");
  await page.fill("#admitPatientHistoryInput", "Transient reviewed note.");
  await page.click('#patientAdmissionForm button[type="submit"]');
  await expandPatientRoster(page);
  await page.waitForSelector('#patientList .patient-card:has-text("Temporary Alpha")');
  let snapshot = await storageSnapshot(page);
  assert(Object.keys(snapshot).length === 0, `Single-patient workflow should not write localStorage, got ${Object.keys(snapshot).join(", ")}`);

  await page.click("#lockVaultButton");
  await page.waitForSelector("#vaultAccessView", { state: "visible" });
  snapshot = await storageSnapshot(page);
  assert(Object.keys(snapshot).length === 0, "Locking a single-patient workflow should leave localStorage empty.");
  await context.close();
}

async function testEncryptedSingletonVault(browser, baseUrl) {
  const { context, page } = await openFreshPage(browser, baseUrl);
  await page.fill("#newVaultNameInput", "Medicine service");
  await page.fill("#newVaultPasswordInput", "rounding-passphrase");
  await page.fill("#confirmVaultPasswordInput", "rounding-passphrase");
  await page.click("#createVaultButton");
  await page.waitForSelector("#appShell", { state: "visible" });
  await waitForEncryptedSave(page);

  let snapshot = await storageSnapshot(page);
  assert(snapshot[vaultMetaKey], "Creating a vault should write one vault metadata record.");
  assert(snapshot[vaultDataKey], "Creating a vault should write one encrypted vault data record.");
  assert(!snapshot[legacyStateKey] && !snapshot[legacyMetaKey], "Legacy plaintext vault keys should be absent.");

  await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  await page.fill("#admitPatientLabelInput", "Patient Alpha");
  await page.fill("#admitPatientConcernInput", "pneumonia");
  await page.fill("#admitPatientMetaInput", "room 12");
  await page.fill("#admitPatientHistoryInput", "Reviewed context for cough and fever.");
  await page.click('#patientAdmissionForm button[type="submit"]');
  await expandPatientRoster(page);
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha")');
  await waitForEncryptedSave(page);

  snapshot = await storageSnapshot(page);
  const storageText = joinedStorage(snapshot);
  assert(!storageText.includes("Patient Alpha"), "Patient label must not appear in localStorage plaintext.");
  assert(!storageText.includes("Reviewed context for cough and fever"), "Patient context must not appear in localStorage plaintext.");

  await page.fill("#patientSearchInput", "Alpha");
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha")');
  await page.fill("#patientSearchInput", "");
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha")');

  await page.click('#patientList .patient-card:has-text("Patient Alpha") button:has-text("Discharge")');
  await page.waitForSelector("#dischargeConfirmOverlay:not([hidden])");
  await page.click("#cancelDischargeButton");
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha")');
  await page.click('#patientList .patient-card:has-text("Patient Alpha") button:has-text("Discharge")');
  await page.waitForSelector("#dischargeConfirmOverlay:not([hidden])");
  await page.click("#confirmDischargeButton");
  await page.waitForFunction(() => !(document.querySelector("#patientList")?.textContent || "").includes("Patient Alpha"));
  await waitForEncryptedSave(page);
  snapshot = await storageSnapshot(page);
  assert(!joinedStorage(snapshot).includes("Patient Alpha"), "Removed patient state must not appear in localStorage plaintext.");

  await page.click("#lockVaultButton");
  await page.waitForSelector("#vaultAccessView", { state: "visible" });
  await page.waitForSelector("#openVaultSection:not([hidden])");
  const createHidden = await page.locator("#createVaultSection").evaluate((node) => node.hidden);
  assert(createHidden, "Existing-vault boot should hide the create form and direct the user to login.");
  const existingDesktopPhoneEntryHidden = await page.locator("#phoneBundleEntrySection").evaluate((node) => node.hidden || getComputedStyle(node).display === "none");
  assert(existingDesktopPhoneEntryHidden, "Existing-vault desktop entry should keep the phone bedside loader hidden.");

  await page.fill("#vaultPasswordInput", "wrong-passphrase");
  await page.click("#openVaultButton");
  await page.waitForFunction(() => /Password did not match/.test(document.querySelector("#openVaultStatus")?.textContent || ""));
  const stillLocked = await page.evaluate(() => document.body.dataset.view);
  assert(stillLocked === "vaultAccess", "Wrong password should keep the app locked.");

  const beforeMeta = (await storageSnapshot(page))[vaultMetaKey];
  await page.evaluate(() => {
    document.querySelector("#createVaultSection").hidden = false;
    document.querySelector("#newVaultNameInput").value = "Second vault";
    document.querySelector("#newVaultPasswordInput").value = "second-passphrase";
    document.querySelector("#confirmVaultPasswordInput").value = "second-passphrase";
    document.querySelector("#createVaultForm").requestSubmit();
  });
  await page.waitForTimeout(250);
  const afterMeta = (await storageSnapshot(page))[vaultMetaKey];
  assert(afterMeta === beforeMeta, "Attempting a second vault should not replace the singleton vault metadata.");

  await page.fill("#vaultPasswordInput", "rounding-passphrase");
  await page.click("#openVaultButton");
  await page.waitForSelector("#appShell", { state: "visible" });
  await page.waitForFunction(() => /No patients in this vault yet/.test(document.querySelector("#patientList")?.textContent || ""));
  const reopenedRoster = await page.textContent("#patientList");
  assert(!reopenedRoster.includes("Patient Alpha") && !reopenedRoster.includes("Restore"), "confirmed discharge should persist removal after vault unlock.");
  await context.close();
}

const { server, baseUrl } = await startServer();
const browser = await chromium.launch();

try {
  await testSinglePatientNoPersistence(browser, baseUrl);
  await testEncryptedSingletonVault(browser, baseUrl);
  console.log("Vault state-machine tests passed.");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
