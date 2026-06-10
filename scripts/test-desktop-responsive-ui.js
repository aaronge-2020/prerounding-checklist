import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const vaultMetaKey = "prerounding-local-vault-meta-v2";
const vaultDataKey = "prerounding-local-vault-data-v1";

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
    [vaultDataKey],
    { timeout: 45000 }
  );
  await page.waitForTimeout(150);
}

async function assertNoLayoutBreakage(page, label) {
  const report = await page.evaluate(() => {
    const rootElement = document.scrollingElement || document.documentElement;
    const viewportWidth = document.documentElement.clientWidth;
    const overflow = rootElement.scrollWidth - viewportWidth;
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && !element.closest("[hidden]");
    };
    const clipped = Array.from(document.querySelectorAll("button, .btn, .nav-button, .status-chip, .count-badge, h1, h2, h3, label"))
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .map((element) => ({
        tag: element.tagName,
        id: element.id,
        className: String(element.className || ""),
        text: element.textContent.trim().slice(0, 90),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));
    const offscreenControls = Array.from(document.querySelectorAll("button, input, textarea, select"))
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right < -1 || rect.left > viewportWidth + 1 || rect.width < 12 || rect.height < 12;
      })
      .map((element) => ({ id: element.id, text: element.textContent.trim().slice(0, 80), rect: element.getBoundingClientRect().toJSON() }));
    return { overflow, clipped, offscreenControls };
  });
  assert(report.overflow <= 2, `${label}: horizontal overflow ${report.overflow}px`);
  assert(report.clipped.length === 0, `${label}: clipped text/control content ${JSON.stringify(report.clipped.slice(0, 5), null, 2)}`);
  assert(report.offscreenControls.length === 0, `${label}: offscreen or collapsed controls ${JSON.stringify(report.offscreenControls.slice(0, 5), null, 2)}`);
}

async function openFreshPage(browser, baseUrl, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html?fresh=${Date.now()}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForFunction(() => document.body.dataset.view === "vaultAccess");
  return { context, page };
}

async function createVault(page, password = "rounding-passphrase") {
  await page.waitForSelector("#createVaultSection:not([hidden])");
  await page.fill("#newVaultNameInput", "Medicine responsive QA");
  await page.fill("#newVaultPasswordInput", password);
  await page.fill("#confirmVaultPasswordInput", password);
  await page.click("#createVaultButton");
  await page.waitForFunction(() => document.body.dataset.view !== "vaultAccess", null, { timeout: 45000 });
  await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  await waitForEncryptedSave(page);
}

async function admitPatient(page, {
  label = "Room 12",
  concern = "Pneumonia with oxygen requirement",
  meta = "68 y, F - new admit",
  history = "Reviewed history: cough, fever, oxygen requirement.",
  vitals = "T 38.4, HR 112, O2 3 L NC.",
  labs = "WBC 15, ceftriaxone pending."
} = {}) {
  const overlayOpen = await page.locator("#patientAdmissionOverlay:not([hidden])").isVisible({ timeout: 500 }).catch(() => false);
  if (!overlayOpen) {
    await page.click("#sidebarAdmitPatientButton");
    await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  }
  await page.fill("#admitPatientLabelInput", label);
  await page.fill("#admitPatientConcernInput", concern);
  await page.fill("#admitPatientMetaInput", meta);
  await page.fill("#admitPatientHistoryInput", history);
  await page.fill("#admitPatientVitalsInput", vitals);
  await page.fill("#admitPatientLabsInput", labs);
  await page.click("#saveAdmittedPatientButton");
  await page.waitForFunction(() => document.querySelector("#patientAdmissionOverlay")?.hidden === true);
  await page.waitForSelector(`#patientList .patient-card:has-text("${label}")`);
}

async function testSinglePatientBypass(browser, baseUrl) {
  console.log("Checking single-patient no-save path");
  const { context, page } = await openFreshPage(browser, baseUrl, { width: 390, height: 844 });
  await assertNoLayoutBreakage(page, "mobile vault access");
  await page.click("#singlePatientWorkflowButton");
  await page.waitForSelector("#patientAdmissionOverlay:not([hidden])");
  const title = await page.textContent("#patientAdmissionTitle");
  assert(/Set up single patient/.test(title), "single-patient bypass should ask for patient details immediately");
  await admitPatient(page, {
    label: "Temporary Room",
    concern: "Chest pain",
    meta: "Observation",
    history: "Transient reviewed note.",
    vitals: "",
    labs: ""
  });
  let snapshot = await storageSnapshot(page);
  assert(Object.keys(snapshot).length === 0, `single-patient details should not write localStorage, got ${Object.keys(snapshot).join(", ")}`);
  await page.fill("#patientSearchInput", "missing");
  const emptyText = await page.textContent("#patientList");
  assert(/No patients match that search/.test(emptyText), "single-patient search should show an empty state without freezing");
  await page.fill("#patientSearchInput", "");
  const restoredText = await page.textContent("#patientList");
  assert(restoredText.includes("Temporary Room"), "clearing single-patient search should restore the roster");
  await page.click("#lockVaultButton");
  await page.waitForFunction(() => document.body.dataset.view === "vaultAccess");
  snapshot = await storageSnapshot(page);
  assert(Object.keys(snapshot).length === 0, "locking a single-patient workflow should leave localStorage empty");
  await context.close();
}

async function testVaultWorkspaceAtViewport(browser, baseUrl, viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  console.log(`Checking vault workspace at ${label}`);
  const { context, page } = await openFreshPage(browser, baseUrl, viewport);
  await assertNoLayoutBreakage(page, `vault access ${label}`);
  await createVault(page);
  await admitPatient(page);
  await assertNoLayoutBreakage(page, `workspace ${label}`);

  const sidebarLabels = await page.locator(".sidebar .nav-button").allTextContents();
  assert(sidebarLabels.join("|") === "Patient roster|Admit patient|Quick de-ID|About privacy", `sidebar should expose only shift utilities, got ${sidebarLabels.join("|")}`);
  const tabLabels = await page.locator(".patient-task-strip [role='tab']").allTextContents();
  assert(tabLabels.join("|") === "Overview|Context|Workup|Checklist|Findings|OpenEvidence|Phone handoff", `patient tabs should match clinical workflow order, got ${tabLabels.join("|")}`);
  const countLabel = await page.textContent("#patientCountLabel");
  assert(/1 active \/ 1 total/.test(countLabel), `patient count should reflect the admitted patient, got ${countLabel}`);

  await page.fill("#patientSearchInput", "oxygen");
  let rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Room 12"), "patient roster search should match patient context and concern");
  await page.fill("#patientSearchInput", "not-present");
  rosterText = await page.textContent("#patientList");
  assert(/No patients match that search/.test(rosterText), "patient roster should show an empty search state");
  await page.fill("#patientSearchInput", "");
  rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Room 12"), "clearing patient search should restore the roster without freezing");

  await page.click('[data-patient-tab="checklist"]');
  let checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button').allTextContents();
  assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `unbuilt checklist panel should expose one build path, got ${checklistPanelButtons.join("|")}`);
  let checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  assert(checklistPrimaryEnabled, "checklist build primary should be enabled for the selected workup");
  await page.click("#workspaceChecklistSecondaryButton");
  await page.waitForFunction(() => document.querySelector('[data-patient-tab="workup"]')?.getAttribute("aria-selected") === "true");
  const focusedWorkupControl = await page.evaluate(() => document.activeElement?.id || "");
  assert(focusedWorkupControl === "patientWorkupConcernInput", `change-workup action should focus the workup search, got ${focusedWorkupControl}`);

  await page.click('[data-patient-tab="findings"]');
  const findingsGateText = await page.textContent("#workspaceFindingsGateNotice");
  assert(/Build the bedside checklist|Answer at least one bedside checklist/.test(findingsGateText), `findings tab should gate on checklist answers, got ${findingsGateText}`);
  const historyFindingsDisabled = await page.locator("#workspaceHistoryFindingInput").isDisabled();
  assert(historyFindingsDisabled, "findings input should be disabled before checklist-derived findings exist");

  await page.click('[data-patient-tab="evidence"]');
  const patientEvidenceTasks = await page.locator("#patientEvidenceTaskStrip .task-card").count();
  assert(patientEvidenceTasks >= 8, `OpenEvidence patient tab should render task cards, got ${patientEvidenceTasks}`);
  const patientPromptPreview = await page.textContent("#patientEvidencePromptPreview");
  assert(/Task boundary:/.test(patientPromptPreview) && /Output contract:/.test(patientPromptPreview), "OpenEvidence patient tab should show a real prompt preview");

  await page.click('[data-patient-tab="workup"]');
  await page.fill("#patientWorkupConcernInput", "chest pain");
  await page.waitForSelector('#patientWorkupResults [data-module-id]:has-text("Chest pain")');
  const chestPainId = await page.locator('#patientWorkupResults [data-module-id]:has-text("Chest pain")').first().getAttribute("data-module-id");
  assert(chestPainId, "workup search should expose a selectable chest pain workup result");
  await page.locator(`#patientWorkupResults [data-module-id="${chestPainId}"]`).first().click();
  await page.waitForFunction((moduleId) => document.querySelector("#patientWorkupSelect")?.value === moduleId, chestPainId);
  const selectedLabel = await page.textContent("#patientValidatedIntentLabel");
  assert(/chest pain/i.test(selectedLabel), `selecting a workup result should update the patient workup, got ${selectedLabel}`);

  await page.click('[data-patient-tab="checklist"]');
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button').allTextContents();
  assert(checklistPanelButtons.join("|") === "Build checklist from workup|Change workup", `selected-workup checklist panel should show one build path, got ${checklistPanelButtons.join("|")}`);
  checklistPrimaryEnabled = await page.locator("#workspaceOpenBedsideChecklistButton").isEnabled();
  assert(checklistPrimaryEnabled, "checklist build primary should be enabled after selecting a validated workup");
  await page.click("#workspaceOpenBedsideChecklistButton");
  await page.waitForFunction(() => /items built/.test(document.querySelector("#workspaceChecklistStatus")?.textContent || ""));
  checklistPanelButtons = await page.locator('#patientChecklistPanel:not([hidden]) .checklist-command-grid button').allTextContents();
  assert(checklistPanelButtons.join("|") === "Answer bedside checklist|Rebuild from workup", `built checklist panel should switch to answer/rebuild actions, got ${checklistPanelButtons.join("|")}`);

  await page.click("#dischargePatientButton");
  rosterText = await page.textContent("#patientList");
  assert(/discharged/i.test(rosterText) && rosterText.includes("Restore"), "discharge should archive the patient and expose Restore");
  await page.getByRole("button", { name: "Restore" }).click();
  rosterText = await page.textContent("#patientList");
  assert(rosterText.includes("Discharge") && !/discharged/i.test(rosterText), "restore should return the patient to the active roster");

  await waitForEncryptedSave(page);
  const snapshot = await storageSnapshot(page);
  assert(snapshot[vaultMetaKey] && snapshot[vaultDataKey], "vault mode should persist only vault metadata and encrypted data");
  const storageText = joinedStorage(snapshot);
  assert(!storageText.includes("Room 12") && !storageText.includes("oxygen requirement"), "patient details should not appear in localStorage plaintext");
  await context.close();
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await testSinglePatientBypass(browser, baseUrl);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 1024 }
  ]) {
    await testVaultWorkspaceAtViewport(browser, baseUrl, viewport);
  }
  console.log("Responsive vault UI checks passed.");
} finally {
  if (browser) await browser.close();
  server.close();
}
