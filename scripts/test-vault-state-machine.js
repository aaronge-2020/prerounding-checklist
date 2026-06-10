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

async function testSinglePatientNoPersistence(browser, baseUrl) {
  const { context, page } = await openFreshPage(browser, baseUrl);
  await page.waitForSelector("#createVaultSection:not([hidden])");
  const openHidden = await page.locator("#openVaultSection").evaluate((node) => node.hidden);
  assert(openHidden, "No-vault boot should hide the login form and direct the user to create a vault.");

  await page.click("#singlePatientWorkflowButton");
  await page.waitForSelector("#appShell", { state: "visible" });
  await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  await page.fill("#admitPatientLabelInput", "Temporary Alpha");
  await page.fill("#admitPatientConcernInput", "chest pain");
  await page.fill("#admitPatientHistoryInput", "Transient reviewed note.");
  await page.click('#patientAdmissionForm button[type="submit"]');
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
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha (discharged)")');
  await waitForEncryptedSave(page);
  snapshot = await storageSnapshot(page);
  assert(!joinedStorage(snapshot).includes("Patient Alpha"), "Discharged patient state must remain encrypted.");

  await page.click("#lockVaultButton");
  await page.waitForSelector("#vaultAccessView", { state: "visible" });
  await page.waitForSelector("#openVaultSection:not([hidden])");
  const createHidden = await page.locator("#createVaultSection").evaluate((node) => node.hidden);
  assert(createHidden, "Existing-vault boot should hide the create form and direct the user to login.");

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
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha (discharged)")');
  await page.click('#patientList .patient-card:has-text("Patient Alpha (discharged)") button:has-text("Restore")');
  await page.waitForSelector('#patientList .patient-card:has-text("Patient Alpha") button:has-text("Discharge")');
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
